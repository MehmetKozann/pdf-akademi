import crypto from "node:crypto";
import {
  completeWithLLM,
  generateEmbeddings,
  parseJsonFromLLM,
} from "@/lib/ai/provider";
import { getActiveAIConfig } from "@/lib/config/server-config";
import { repository } from "@/lib/db/repository";
import {
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  STUDY_NOTE_TYPE_LABELS,
  type ChatCitation,
  type ClassicalAIEvaluation,
  type DifficultyLevel,
  type DocumentChunk,
  type DocumentRecord,
  type ExamDifficulty,
  type ExtractedDocumentMetadata,
  type MatchingPair,
  type Question,
  type QuestionOption,
  type QuestionType,
  type RubricCriterion,
  type StudyNote,
  type StudyNoteSection,
  type StudyNoteType,
  type UserProfile,
} from "@/types/database";

function formatChunksForPrompt(chunks: DocumentChunk[]): string {
  return chunks
    .map((c) => {
      const pageLabel =
        c.page_start === c.page_end
          ? `Sayfa ${c.page_start}`
          : `Sayfa ${c.page_start}-${c.page_end}`;
      const chapter = c.chapter_title ? ` | Bölüm: ${c.chapter_title}` : "";
      return `--- [KAYNAK PARÇA #${c.chunk_index + 1} | ${pageLabel}${chapter}] ---\n${c.content}`;
    })
    .join("\n\n");
}

function selectRepresentativeChunks(
  allChunks: DocumentChunk[],
  maxChunks = 16
): DocumentChunk[] {
  if (allChunks.length <= maxChunks) return allChunks;
  const selected: DocumentChunk[] = [];
  const step = (allChunks.length - 1) / (maxChunks - 1);
  for (let i = 0; i < maxChunks; i++) {
    const idx = Math.round(i * step);
    if (!selected.includes(allChunks[idx])) {
      selected.push(allChunks[idx]);
    }
  }
  return selected;
}

/**
 * 1. Deep Document Structure Analysis (runs after PDF upload if AI is configured;
 * merges cleanly with heuristic metadata extracted directly from the PDF).
 */
export async function enrichDocumentMetadataWithAI(params: {
  chunks: DocumentChunk[];
  pageCount: number;
  baseMetadata: ExtractedDocumentMetadata;
  user?: UserProfile;
}): Promise<ExtractedDocumentMetadata> {
  const aiCfg = getActiveAIConfig(
    params.user?.ai_preferences?.preferred_provider,
    params.user?.ai_preferences?.preferred_model
  );
  if (!aiCfg.isConfigured || params.chunks.length === 0) {
    return params.baseMetadata;
  }

  try {
    const sampled = selectRepresentativeChunks(params.chunks, 14);
    const contextText = formatChunksForPrompt(sampled);

    const systemPrompt = `Sen kıdemli bir üniversite eğitim materyali analiz uzmanısın.
Verilen PDF ders belgesi parçalarını inceleyerek belgenin akademik yapısını, bölümlerini, tanımlarını, formüllerini, önemli kavramlarını ve kavramlar arası ilişkileri Türkçe olarak çıkar.
Asla belgede yer almayan hayali bilgi uydurma. Yanıtını yalnızca geçerli bir JSON nesnesi olarak döndür.`;

    const userPrompt = `Belge Toplam Sayfa Sayısı: ${params.pageCount}

Belge İçeriği (Temsili Sayfa Parçaları):
${contextText}

Lütfen aşağıdaki JSON şemasına tam uyan bir çıktı üret:
{
  "summary": "Belgenin eğitimsel kapsamını ve ana temasını anlatan 3-4 cümlelik akademik Türkçe özet",
  "chapters": [
    { "title": "Bölüm Başlığı", "page_start": 1, "page_end": 3, "summary": "Kısa bölüm açıklaması" }
  ],
  "headings": ["Alt başlık 1", "Alt başlık 2"],
  "definitions": [
    { "term": "Kavram Adı", "definition": "Belgedeki akademik tanımı", "page": 1 }
  ],
  "formulas": [
    { "name": "Formül/Kural Adı", "expression": "Matematiksel veya kavramsal ifade", "description": "Ne işe yaradığı", "page": 1 }
  ],
  "key_concepts": ["Kavram 1", "Kavram 2"],
  "important_topics": ["Sınav değeri taşıyan önemli konu 1", "Önemli konu 2"],
  "concept_relations": [
    { "source": "Kavram A", "target": "Kavram B", "relation": "Aralarındaki akademik/nedensel ilişki" }
  ]
}`;

    const raw = await completeWithLLM({
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      maxTokens: 3200,
      jsonMode: true,
      preferredProvider: params.user?.ai_preferences?.preferred_provider,
      preferredModel: params.user?.ai_preferences?.preferred_model,
    });

    const parsed = parseJsonFromLLM<Partial<ExtractedDocumentMetadata>>(raw);

    return {
      summary: parsed.summary || params.baseMetadata.summary,
      chapters:
        Array.isArray(parsed.chapters) && parsed.chapters.length > 0
          ? parsed.chapters.map((c) => ({
              title: String(c.title || "Bölüm"),
              page_start: Math.max(
                1,
                Math.min(params.pageCount, Number(c.page_start) || 1)
              ),
              page_end: Math.max(
                1,
                Math.min(params.pageCount, Number(c.page_end) || params.pageCount)
              ),
              summary: c.summary ? String(c.summary) : undefined,
            }))
          : params.baseMetadata.chapters,
      headings:
        Array.isArray(parsed.headings) && parsed.headings.length > 0
          ? parsed.headings.map(String)
          : params.baseMetadata.headings,
      definitions:
        Array.isArray(parsed.definitions) && parsed.definitions.length > 0
          ? parsed.definitions.map((d) => ({
              term: String(d.term || ""),
              definition: String(d.definition || ""),
              page: Math.max(1, Math.min(params.pageCount, Number(d.page) || 1)),
            }))
          : params.baseMetadata.definitions,
      formulas:
        Array.isArray(parsed.formulas) && parsed.formulas.length > 0
          ? parsed.formulas.map((f) => ({
              name: String(f.name || "Formül"),
              expression: String(f.expression || ""),
              description: String(f.description || ""),
              page: Math.max(1, Math.min(params.pageCount, Number(f.page) || 1)),
            }))
          : params.baseMetadata.formulas,
      key_concepts:
        Array.isArray(parsed.key_concepts) && parsed.key_concepts.length > 0
          ? parsed.key_concepts.map(String)
          : params.baseMetadata.key_concepts,
      important_topics:
        Array.isArray(parsed.important_topics) &&
        parsed.important_topics.length > 0
          ? parsed.important_topics.map(String)
          : params.baseMetadata.important_topics,
      concept_relations:
        Array.isArray(parsed.concept_relations) &&
        parsed.concept_relations.length > 0
          ? parsed.concept_relations.map((r) => ({
              source: String(r.source || ""),
              target: String(r.target || ""),
              relation: String(r.relation || ""),
            }))
          : params.baseMetadata.concept_relations,
    };
  } catch {
    return params.baseMetadata;
  }
}

/**
 * 2. AI Study Notes Generator (All 7 Specialized Note Types)
 */
const NOTE_TYPE_INSTRUCTIONS: Record<StudyNoteType, string> = {
  comprehensive: `KAPSAMLI DERS NOTU oluştur:
- Belgedeki tüm ana ve alt konuları eksiksiz, derinlemesine ve pedagojik bir sırayla anlat.
- Önemli tanımları kalın başlıklarla ve kutucuk (> [!ÖNEMLİ] veya blok alıntı) yapısıyla vurgula.
- Konuları somutlaştıran açıklayıcı örnekler, karşılaştırma tabloları (Markdown tablosu) ve varsa formüller ekle.
- Her ana bölümün sonunda mutlaka "### Bölüm Özeti ve Sınav İpuçları" alt başlığı aç.`,
  concise: `KISA VE ÖZ DERS NOTU oluştur:
- Gereksiz uzatmalardan kaçınarak konunun özünü, temel ilkelerini ve kritik bağlantılarını net maddeler halinde sun.
- Karşılaştırmalı özet tablolar ve anahtar noktalar listesi kullan.
- Her bölüm sonunda 2-3 maddelik paket özet ver.`,
  exam_focused: `SINAV ODAKLI DERS NOTU oluştur:
- Üniversite vize ve final sınavlarında sorulma ihtimali en yüksek kavramlara, ayrımlara, avantaj-dezavantaj karşılaştırmalarına ve sık yapılan öğrenci hatalarına odaklan.
- "Sınavda Nasıl Sorulur?" ve "Dikkat Edilmesi Gereken Kritik Noktalar" bölümleri ekle.
- Karşılaştırma tabloları ve ezber/kavrama kilit noktaları ekle.`,
  topic_by_topic: `KONU KONU AYRINTILI ANLATIM oluştur:
- Belgeyi mantıksal modüllere/konulara ayır.
- Her konu için sırasıyla: 1) Temel Kavram ve Amacı, 2) Ayrıntılı Çalışma Mekanizması/Açıklaması, 3) Somut Örnek, 4) Diğer Konularla İlişkisi, 5) Konu Sonu Kısa Özet yapısını uygula.`,
  last_minute_review: `SON TEKRAR NOTLARI oluştur:
- Sınavdan hemen önce 15-20 dakikada tüm dersi tekrar etmeyi sağlayacak yüksek yoğunluklu kontrol listeleri, kritik tanımlar, kilit formüller ve tek bakışta karşılaştırma tabloları hazırla.`,
  concepts_definitions: `ÖNEMLİ KAVRAMLAR VE TANIMLAR REHBERİ oluştur:
- Belgede geçen tüm temel ve yardımcı terimleri kapsamlı şekilde tanımla.
- Kavramları tematik gruplara ayır, benzer/karıştırılan kavramları Markdown tablolarıyla karşılaştır ve kavramlar arası ilişkileri açıkla.`,
  formulas_facts: `FORMÜLLER, KURALLAR VE ÖNEMLİ BİLGİLER REHBERİ oluştur:
- Belgede yer alan tüm matematiksel/bilimsel formülleri, kuralları, ilkeleri, sınıflandırmaları ve sayısal/teknik bilgileri derle.
- Her formül veya kuralın değişkenlerini, hangi durumda kullanıldığını ve uygulama mantığını açıkla.`,
};

export async function generateStudyNoteWithAI(params: {
  user: UserProfile;
  document: DocumentRecord;
  noteType: StudyNoteType;
  customTitle?: string;
  focusTopic?: string;
}): Promise<StudyNote> {
  const allChunks = await repository.getDocumentChunks(
    params.user.id,
    params.document.id
  );

  let fileData: { mimeType: string; base64: string } | undefined;
  let contextText = "";

  if (allChunks.length === 0) {
    // If text chunks are missing (e.g. scanned image-only PDF), download binary and use Gemini multimodal PDF
    const buf = await repository.downloadPdfBinary(
      params.user.id,
      params.document.storage_path
    );
    if (!buf || buf.length === 0) {
      throw new Error("Belge içeriği bulunamadı. Lütfen geçerli bir PDF yükleyiniz.");
    }
    const ext = params.document.file_name.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : "application/octet-stream";
    fileData = {
      mimeType: ext,
      base64: buf.toString("base64"),
    };
    contextText = "(Belge taranmış/vektörel slaytlardan oluştuğu için doğrudan ekteki görsel/PDF dosyasından analiz edilecektir.)";
  } else {
    let targetChunks: DocumentChunk[];
    if (params.focusTopic?.trim()) {
      const [qEmb] = await generateEmbeddings(
        [params.focusTopic],
        params.user.ai_preferences?.preferred_provider
      );
      const retrieved = await repository.retrieveRelevantChunks({
        userId: params.user.id,
        query: params.focusTopic,
        queryEmbedding: qEmb,
        documentIds: [params.document.id],
        topK: 14,
      });
      targetChunks = retrieved.map((r) => r.chunk);
    } else {
      targetChunks = selectRepresentativeChunks(allChunks, 18);
    }
    contextText = formatChunksForPrompt(targetChunks);
  }
  const typeMeta = STUDY_NOTE_TYPE_LABELS[params.noteType];

  const systemPrompt = `Sen seçkin bir üniversite profesörü ve akademik eğitim tasarımcısısın.
Görevin, yalnızca yüklenen ders belgesine dayanarak yüksek nitelikli, pedagojik, sınav başarısını artıran TÜRKÇE ders notu hazırlamaktır.
Yüzeysel özet yapma; kavramların mantığını öğret, sayfa referanslarını [Sayfa X] biçiminde belirt, Markdown tabloları, kalın vurgular, blok alıntılar (> Önemli Not:) ve bölüm sonu özetleri kullan.
Belgede yer almayan konuları uydurma.
Yanıtını JSON DEĞİL, doğrudan temiz ve zengin MARKDOWN formatında yaz (İlk satır "# Ders Notu Başlığı" olsun).`;

  const userPrompt = `Belge Başlığı: ${params.document.title}
Toplam Sayfa: ${params.document.page_count}
İstenen Ders Notu Türü: ${typeMeta.label}
${params.focusTopic ? `Odaklanılacak Özel Konu: ${params.focusTopic}\n` : ""}
Özel Talimatlar:
${NOTE_TYPE_INSTRUCTIONS[params.noteType]}

Kaynak Belge Parçaları:
${contextText}

Lütfen doğrudan "# [Akademik Ders Notu Başlığı]" ile başlayan, alt başlıklar (##, ###), karşılaştırma tabloları, örnekler, [Sayfa X] kaynak referansları ve bölüm sonu özetleri içeren eksiksiz Markdown ders notunu üret:`;

  const rawMarkdown = await completeWithLLM({
    systemPrompt,
    userPrompt,
    temperature: 0.3,
    maxTokens: 16384,
    jsonMode: false,
    preferredProvider: params.user.ai_preferences?.preferred_provider,
    preferredModel: params.user.ai_preferences?.preferred_model,
    fileData,
  });

  const cleanedMarkdown = rawMarkdown
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (!cleanedMarkdown || cleanedMarkdown.length < 40) {
    throw new Error("Ders notu içeriği oluşturulamadı. Lütfen tekrar deneyiniz.");
  }

  // Extract H1 heading if present for clean note title
  const h1Match = cleanedMarkdown.match(/^#\s+(.+)$/m);
  const extractedTitle = h1Match ? h1Match[1].replace(/[*`]/g, "").trim() : "";

  const now = new Date().toISOString();
  const docMeta = params.document.extracted_metadata;
  const note: StudyNote = {
    id: crypto.randomUUID(),
    user_id: params.user.id,
    document_id: params.document.id,
    course_id: params.document.course_id,
    title:
      params.customTitle?.trim() ||
      extractedTitle ||
      `${params.document.title} — ${typeMeta.label}`,
    note_type: params.noteType,
    content_markdown: cleanedMarkdown,
    structured_sections: [] as StudyNoteSection[],
    chapters_summary: (docMeta?.chapters || []).map((c) => ({
      chapter: c.title,
      summary: c.summary || `Sayfa ${c.page_start}-${c.page_end}`,
    })),
    key_concepts: docMeta?.definitions || [],
    formulas: docMeta?.formulas || [],
    is_edited: false,
    created_at: now,
    updated_at: now,
  };

  await repository.createStudyNote(note);
  await repository.logStudySession({
    user_id: params.user.id,
    document_id: params.document.id,
    course_id: params.document.course_id,
    activity_type: "note_study",
    title: `${note.title} oluşturuldu`,
    duration_minutes: 10,
    metadata: { note_id: note.id, note_type: note.note_type },
  });

  return note;
}

/**
 * 3. AI Exam Question Generator (Strictly Document-Grounded, All 5 Types + Validation)
 */
export async function generateQuestionsBatchWithAI(params: {
  user: UserProfile;
  document: DocumentRecord;
  questionType: QuestionType;
  count: number;
  difficulty: ExamDifficulty;
  mcqOptionCount?: 4 | 5;
  topics?: string[];
  questionBankId?: string | null;
  existingQuestionStems?: string[];
}): Promise<Question[]> {
  const allChunks = await repository.getDocumentChunks(
    params.user.id,
    params.document.id
  );

  let selectedChunks: DocumentChunk[] = [];
  let fileData: { mimeType: string; base64: string } | undefined;
  let contextText = "";

  if (allChunks.length === 0) {
    const buf = await repository.downloadPdfBinary(
      params.user.id,
      params.document.storage_path
    );
    if (!buf || buf.length === 0) {
      throw new Error("Belge içeriği bulunamadı.");
    }
    const ext = params.document.file_name.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : "application/octet-stream";
    fileData = {
      mimeType: ext,
      base64: buf.toString("base64"),
    };
    contextText = "(Belge taranmış/vektörel slaytlardan oluştuğu için sorular doğrudan ekteki görsel/PDF dosyasından üretilecektir.)";
  } else if (params.topics && params.topics.length > 0) {
    const topicQuery = params.topics.join(" ");
    const [qEmb] = await generateEmbeddings(
      [topicQuery],
      params.user.ai_preferences?.preferred_provider
    );
    const retrieved = await repository.retrieveRelevantChunks({
      userId: params.user.id,
      query: topicQuery,
      queryEmbedding: qEmb,
      documentIds: [params.document.id],
      topK: 16,
    });
    selectedChunks =
      retrieved.length > 0
        ? retrieved.map((r) => r.chunk)
        : selectRepresentativeChunks(allChunks, 16);
    contextText = formatChunksForPrompt(selectedChunks);
  } else {
    selectedChunks = selectRepresentativeChunks(allChunks, 18);
    contextText = formatChunksForPrompt(selectedChunks);
  }
  const optionCount = params.mcqOptionCount ?? 5;
  const optionLabels =
    optionCount === 4 ? ["A", "B", "C", "D"] : ["A", "B", "C", "D", "E"];

  const typeSpecificRules: Record<QuestionType, string> = {
    classical: `KLASİK (AÇIK UÇLU ÜNİVERSİTE SINAV) SORULARI ÜRET:
- Soru kökleri gerçek üniversite vize/final sınavları gibi olmalı: "Tanımlayınız ve önemini açıklayınız.", "Karşılaştırınız.", "Avantajlarını ve dezavantajlarını tartışınız.", "Çalışma prensibini aşamalarıyla açıklayınız.", "Somut bir örnek üzerinden açıklayınız."
- Her soru için kapsamlı "model_answer" (örnek tam puanlık cevap), cevapta bulunması gereken maddeler ("expected_points") ve şeffaf puanlama anahtarı ("grading_rubric" - toplamı 10 puan olacak şekilde kriterler) üret.`,
    multiple_choice: `ÇOKTAN SEÇMELİ TEST SORULARI ÜRET (${optionCount} ŞIKLI: ${optionLabels.join(", ")}):
- Her sorunun TEK VE TARTIŞMASIZ bir doğru cevabı olmalı.
- Çeldirici şıklar (distractors) akademik olarak mantıklı, kavram yanılgılarını ölçen nitelikte olmalı; gülünç veya bariz yanlış şıklar yazma.
- "options" dizisinde ${optionLabels.map((l) => `{"label":"${l}","text":"..."}`).join(", ")} formatında tam ${optionCount} seçenek ver ve "correct_answer" alanına yalnızca doğru harfi ("A" gibi) yaz.`,
    true_false: `DOĞRU / YANLIŞ SORULARI ÜRET:
- Belgedeki kavramsal doğrulukları ve ince ayrımları ölçen net önerme cümleleri kur.
- "correct_answer" alanı tam olarak "Doğru" veya "Yanlış" olmalı.
- "explanation" alanında neden Doğru veya neden Yanlış olduğunu belgeye referans vererek açıkla.`,
    fill_blank: `BOŞLUK DOLDURMA SORULARI ÜRET:
- Belgedeki kritik tanım, kavram veya kuralları ölçen cümleler kur ve boş bırakılan terimin yerine tam olarak "_____" koy.
- "correct_answer" alanına boşluğa gelmesi gereken tam akademik terimi yaz (kısa ve net, 1-4 kelime).`,
    matching: `EŞLEŞTİRME SORULARI ÜRET:
- Her eşleştirme sorusunda belgedeki kavram-tanım, terim-açıklama veya formül-anlam çiftlerinden oluşan 4 veya 5 adet "matching_pairs" ([{"left": "Kavram", "right": "Tanımı/Açıklaması"}]) üret.
- "question_text" alanına örneğin "Aşağıdaki kavramları belgedeki doğru tanımlarıyla eşleştiriniz." gibi açıklayıcı yönerge yaz.`,
  };

  const avoidStems =
    params.existingQuestionStems && params.existingQuestionStems.length > 0
      ? `\nTekrarı Önle — Şu sorulara benzer veya aynı soruları ÜRETME:\n${params.existingQuestionStems
          .slice(0, 15)
          .map((s) => `- ${s.slice(0, 110)}`)
          .join("\n")}\n`
      : "";

  const difficultyInstruction =
    params.difficulty === "mixed"
      ? "Soruların zorluk seviyelerini dengeli dağıt ('easy', 'medium', 'hard')."
      : `Tüm soruların zorluk seviyesi '${params.difficulty}' (${DIFFICULTY_LABELS[params.difficulty]}) olmalıdır.`;

  const systemPrompt = `Sen titiz bir üniversite ölçme-değerlendirme profesörüsün.
Yalnızca verilen kaynak belge parçalarındaki bilgilere dayanarak pedagojik açıdan kusursuz TÜRKÇE sınav soruları üretirsin.
KESİN KURALLAR:
1. Kaynak belgede geçmeyen hiçbir konu hakkında soru üretme.
2. Her sorunun hangi sayfa(lar)dan üretildiğini "source_pages" dizisinde gerçek sayfa numarasıyla belirt ve "source_excerpt" alanına belgedeki dayanak cümleyi ekle.
3. Muğlak veya birden fazla doğru cevabı olabilecek soru üretme.
4. Yanıtını yalnızca geçerli JSON formatında döndür.`;

  const userPrompt = `Belge: ${params.document.title} (Toplam ${params.document.page_count} sayfa)
Soru Türü: ${QUESTION_TYPE_LABELS[params.questionType]} (${params.questionType})
İstenen Soru Sayısı: TAM OLARAK ${params.count} ADET
Zorluk Ayarı: ${difficultyInstruction}
${params.topics && params.topics.length > 0 ? `Hedef Konular/Bölümler: ${params.topics.join(", ")}\n` : ""}${avoidStems}
Tür Kuralları:
${typeSpecificRules[params.questionType]}

Kaynak Belge Parçaları:
${contextText}

Aşağıdaki JSON yapısında TAM ${params.count} soru döndür:
{
  "questions": [
    {
      "difficulty": "easy" | "medium" | "hard",
      "topic": "Sorunun ait olduğu konu/bölüm adı",
      "source_pages": [1],
      "source_excerpt": "Belgeden kısa dayanak alıntı",
      "question_text": "Soru metni (Türkçe)",
      "options": [{"label": "A", "text": "Seçenek metni"}],
      "correct_answer": "Doğru cevap",
      "model_answer": "Klasik sorular için detaylı örnek cevap",
      "expected_points": ["Beklenen kilit nokta 1", "Beklenen kilit nokta 2"],
      "grading_rubric": [{"criterion": "Tanım doğruluğu", "points": 4, "description": "Kavramın eksiksiz tanımlanması"}],
      "matching_pairs": [{"left": "Terim 1", "right": "Açıklama 1"}],
      "explanation": "Cevabın detaylı eğitimsel açıklaması ve sayfa dayanağı"
    }
  ]
}`;

  const raw = await completeWithLLM({
    systemPrompt,
    userPrompt,
    temperature: 0.35,
    maxTokens: 5500,
    jsonMode: true,
    preferredProvider: params.user.ai_preferences?.preferred_provider,
    preferredModel: params.user.ai_preferences?.preferred_model,
    fileData,
  });

  const parsed = parseJsonFromLLM<{
    questions?: Record<string, unknown>[];
  }>(raw);

  const rawList = Array.isArray(parsed.questions) ? parsed.questions : [];
  if (rawList.length === 0) {
    throw new Error("Yapay zeka soru üretemedi. Lütfen tekrar deneyiniz.");
  }

  const now = new Date().toISOString();
  const seenTexts = new Set(
    (params.existingQuestionStems ?? []).map((s) => s.toLowerCase().trim())
  );
  const validatedQuestions: Question[] = [];

  for (const item of rawList) {
    const qText = String(item.question_text || "").trim();
    if (!qText || seenTexts.has(qText.toLowerCase())) continue;
    seenTexts.add(qText.toLowerCase());

    const rawDifficulty = String(item.difficulty || "medium");
    const difficulty: DifficultyLevel =
      rawDifficulty === "easy" ||
      rawDifficulty === "medium" ||
      rawDifficulty === "hard"
        ? rawDifficulty
        : params.difficulty === "mixed"
        ? "medium"
        : params.difficulty;

    const rawPages = Array.isArray(item.source_pages)
      ? item.source_pages
          .map((p) => Number(p))
          .filter(
            (p) =>
              Number.isInteger(p) && p >= 1 && p <= params.document.page_count
          )
      : [];

    const options: QuestionOption[] = Array.isArray(item.options)
      ? item.options.map((o: Record<string, unknown>, idx: number) => ({
          label: String(o.label || String.fromCharCode(65 + idx)).trim(),
          text: String(o.text || "").trim(),
        }))
      : [];

    const rubric: RubricCriterion[] = Array.isArray(item.grading_rubric)
      ? item.grading_rubric.map((r: Record<string, unknown>) => ({
          criterion: String(r.criterion || "Değerlendirme Kriteri"),
          points: Number(r.points) || 2,
          description: String(r.description || ""),
        }))
      : [];

    const matchingPairs: MatchingPair[] = Array.isArray(item.matching_pairs)
      ? item.matching_pairs
          .map((m: Record<string, unknown>) => ({
            left: String(m.left || "").trim(),
            right: String(m.right || "").trim(),
          }))
          .filter((m) => m.left && m.right)
      : [];

    let correctAnswer = String(item.correct_answer || "").trim();
    if (params.questionType === "true_false") {
      correctAnswer = /yanl[ıi][şs]|false/i.test(correctAnswer)
        ? "Yanlış"
        : "Doğru";
    } else if (params.questionType === "multiple_choice" && options.length > 0) {
      const letterMatch = correctAnswer.match(/^[A-E]/i);
      correctAnswer = letterMatch
        ? letterMatch[0].toUpperCase()
        : options[0].label;
    }

    validatedQuestions.push({
      id: crypto.randomUUID(),
      user_id: params.user.id,
      question_bank_id: params.questionBankId ?? null,
      document_id: params.document.id,
      course_id: params.document.course_id,
      question_type: params.questionType,
      difficulty,
      topic: String(item.topic || "Genel Konu").trim(),
      source_pages: rawPages.length > 0 ? rawPages : [1],
      source_excerpt: String(item.source_excerpt || "").trim(),
      question_text: qText,
      options,
      correct_answer: correctAnswer,
      model_answer: String(item.model_answer || "").trim(),
      expected_points: Array.isArray(item.expected_points)
        ? item.expected_points.map(String)
        : [],
      grading_rubric: rubric,
      matching_pairs: matchingPairs,
      explanation: String(
        item.explanation || item.model_answer || "Kaynak belgeye dayalı açıklama."
      ).trim(),
      is_favorite: false,
      created_at: now,
    });

    if (validatedQuestions.length >= params.count) break;
  }

  return validatedQuestions;
}

/**
 * 4. Transparent Rubric-Based AI Evaluation for Classical Questions
 */
export async function evaluateClassicalAnswerWithAI(params: {
  user: UserProfile;
  question: Question;
  studentAnswer: string;
  maxPoints: number;
}): Promise<{ scoreAwarded: number; evaluation: ClassicalAIEvaluation }> {
  const trimmed = params.studentAnswer.trim();
  if (!trimmed) {
    return {
      scoreAwarded: 0,
      evaluation: {
        score_ratio: 0,
        feedback: "Bu klasik soru boş bırakılmıştır.",
        matched_points: [],
        missing_points: params.question.expected_points,
        rubric_breakdown: params.question.grading_rubric.map((r) => ({
          criterion: r.criterion,
          awarded: 0,
          max: r.points,
          comment: "Cevap verilmedi.",
        })),
      },
    };
  }

  const aiCfg = getActiveAIConfig(
    params.user.ai_preferences?.preferred_provider,
    params.user.ai_preferences?.preferred_model
  );

  if (!aiCfg.isConfigured) {
    // Transparent keyword/expected-point overlap evaluation if AI key is removed mid-attempt
    const lowerAns = trimmed.toLocaleLowerCase("tr-TR");
    const matched: string[] = [];
    const missing: string[] = [];
    for (const pt of params.question.expected_points) {
      const keywords = pt
        .toLocaleLowerCase("tr-TR")
        .split(/\s+/)
        .filter((w) => w.length >= 4);
      const hitCount = keywords.filter((k) => lowerAns.includes(k)).length;
      if (keywords.length > 0 && hitCount / keywords.length >= 0.4) {
        matched.push(pt);
      } else {
        missing.push(pt);
      }
    }
    const ratio =
      params.question.expected_points.length > 0
        ? matched.length / params.question.expected_points.length
        : Math.min(1, trimmed.length / 200);
    const scoreAwarded = Number((ratio * params.maxPoints).toFixed(2));
    return {
      scoreAwarded,
      evaluation: {
        score_ratio: ratio,
        feedback:
          "Cevabınız beklenen anahtar noktalarla karşılaştırılarak değerlendirildi.",
        matched_points: matched,
        missing_points: missing,
        rubric_breakdown: [],
      },
    };
  }

  const systemPrompt = `Sen adil, yapıcı ve şeffaf puanlama yapan bir üniversite öğretim üyesisin.
Öğrencinin klasik sınav sorusuna verdiği cevabı; örnek model cevap, beklenen noktalar ve puanlama rubriğine göre değerlendir.
 Türkçe ve eğitici geri bildirim yaz. Yanıtını yalnızca JSON olarak ver.`;

  const userPrompt = `Soru: ${params.question.question_text}
Maksimum Puan: ${params.maxPoints}
Örnek Model Cevap: ${params.question.model_answer}
Beklenen Önemli Noktalar: ${JSON.stringify(params.question.expected_points)}
Puanlama Rubriği: ${JSON.stringify(params.question.grading_rubric)}

Öğrencinin Cevabı:
"""
${trimmed}
"""

Aşağıdaki JSON şemasında değerlendirme döndür:
{
  "score_ratio": 0.0 ile 1.0 arasında başarı oranı (ör. 0.85),
  "feedback": "Öğrenciye yönelik yapıcı, neleri doğru yaptığını ve neleri geliştirmesi gerektiğini açıklayan Türkçe değerlendirme",
  "matched_points": ["Öğrencinin değindiği doğru nokta 1"],
  "missing_points": ["Öğrencinin eksik bıraktığı veya hatalı açıkladığı nokta 1"],
  "rubric_breakdown": [
    { "criterion": "Kriter adı", "awarded": 3, "max": 4, "comment": "Kısa gerekçe" }
  ]
}`;

  const raw = await completeWithLLM({
    systemPrompt,
    userPrompt,
    temperature: 0.15,
    maxTokens: 1800,
    jsonMode: true,
    preferredProvider: params.user.ai_preferences?.preferred_provider,
    preferredModel: params.user.ai_preferences?.preferred_model,
  });

  const parsed = parseJsonFromLLM<ClassicalAIEvaluation>(raw);
  const clampedRatio = Math.max(
    0,
    Math.min(1, Number(parsed.score_ratio) || 0)
  );
  const scoreAwarded = Number((clampedRatio * params.maxPoints).toFixed(2));

  return {
    scoreAwarded,
    evaluation: {
      score_ratio: clampedRatio,
      feedback: String(parsed.feedback || "Değerlendirme tamamlandı."),
      matched_points: Array.isArray(parsed.matched_points)
        ? parsed.matched_points.map(String)
        : [],
      missing_points: Array.isArray(parsed.missing_points)
        ? parsed.missing_points.map(String)
        : [],
      rubric_breakdown: Array.isArray(parsed.rubric_breakdown)
        ? parsed.rubric_breakdown.map((b) => ({
            criterion: String(b.criterion || ""),
            awarded: Number(b.awarded) || 0,
            max: Number(b.max) || 0,
            comment: String(b.comment || ""),
          }))
        : [],
    },
  };
}

/**
 * 5. Document-Grounded AI Study Chat (RAG with Page Citations & Honesty Guardrails)
 */
export async function answerStudyChatWithAI(params: {
  user: UserProfile;
  sessionId: string;
  message: string;
  documentId?: string | null;
  courseId?: string | null;
}): Promise<{
  reply: string;
  citations: ChatCitation[];
  hasExternalKnowledge: boolean;
}> {
  // Determine document scope
  let targetDocIds: string[] | undefined;
  if (params.documentId) {
    targetDocIds = [params.documentId];
  } else if (params.courseId) {
    const courseDocs = await repository.listDocuments(
      params.user.id,
      params.courseId
    );
    targetDocIds = courseDocs.map((d) => d.id);
  }

  const [queryEmbedding] = await generateEmbeddings(
    [params.message],
    params.user.ai_preferences?.preferred_provider
  );

  const retrieved = await repository.retrieveRelevantChunks({
    userId: params.user.id,
    query: params.message,
    queryEmbedding,
    documentIds: targetDocIds,
    topK: 8,
  });

  const history = await repository.listChatMessages(
    params.user.id,
    params.sessionId
  );
  const recentHistory = history
    .slice(-6)
    .map(
      (m) =>
        `${m.role === "user" ? "Öğrenci" : "AkademikAI"}: ${m.content.slice(0, 700)}`
    )
    .join("\n\n");

  const citations: ChatCitation[] = retrieved.slice(0, 5).map((r) => ({
    document_id: r.chunk.document_id,
    document_title: r.document_title,
    page_start: r.chunk.page_start,
    page_end: r.chunk.page_end,
    chapter_title: r.chunk.chapter_title || undefined,
    excerpt: r.chunk.content.slice(0, 220),
  }));

  const contextBlock =
    retrieved.length > 0
      ? retrieved
          .map((r, i) => {
            const pageRef =
              r.chunk.page_start === r.chunk.page_end
                ? `Sayfa ${r.chunk.page_start}`
                : `Sayfa ${r.chunk.page_start}-${r.chunk.page_end}`;
            return `[KAYNAK ${i + 1} | Belge: "${r.document_title}" | ${pageRef}${
              r.chunk.chapter_title ? ` | Bölüm: ${r.chunk.chapter_title}` : ""
            }]\n${r.chunk.content}`;
          })
          .join("\n\n")
      : "(Yüklenmiş veya eşleşen herhangi bir belge parçası bulunamadı.)";

  const systemPrompt = `Sen "AkademikAI" adlı üniversite düzeyinde yapay zeka çalışma asistanısın.
KESİN İLKELERİN:
1. Birincil bilgi kaynağın öğrencinin yüklediği PDF belgeleridir.
2. Belgeden aktardığın her bilginin yanına mutlaka **[Sayfa X]** veya **[Belge Adı, Sayfa X]** şeklinde sayfa referansı ekle.
3. Eğer sorulan konu yüklenen belgede YER ALMIYORSA, yanıtının en başında açıkça **"Bu bilgi yüklediğiniz belgede doğrudan yer almamaktadır."** diye belirt; asla uydurma bilgiyi belge içeriğiymiş gibi sunma!
4. Belgedeki anlatımı desteklemek için genel akademik açıklama veya ek örnek ekliyorsan, bunu **"📌 Genel Akademik Ek Bilgi:"** başlığıyla belge içeriğinden net biçimde ayır.
5. Yanıtını doğrudan temiz, okunaklı ve öğretici TÜRKÇE Markdown formatında yaz.`;

  const userPrompt = `${recentHistory ? `Önceki Sohbet Özeti:\n${recentHistory}\n\n` : ""}Yüklenen Belgeden Getirilen İlgili Bölümler:
${contextBlock}

Öğrencinin Sorusu:
"${params.message}"`;

  const rawReply = await completeWithLLM({
    systemPrompt,
    userPrompt,
    temperature: 0.25,
    maxTokens: 8192,
    jsonMode: false,
    preferredProvider: params.user.ai_preferences?.preferred_provider,
    preferredModel: params.user.ai_preferences?.preferred_model,
  });

  const cleanReply =
    rawReply.trim() || "Sorunuz yanıtlanırken beklenmeyen bir durum oluştu.";

  return {
    reply: cleanReply,
    citations,
    hasExternalKnowledge: cleanReply.includes("Genel Akademik Ek Bilgi"),
  };
}

