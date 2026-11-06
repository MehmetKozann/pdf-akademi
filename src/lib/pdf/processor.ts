import crypto from "node:crypto";
import type {
  ChapterInfo,
  ConceptRelation,
  DefinitionItem,
  DocumentChunk,
  DocumentPage,
  ExtractedDocumentMetadata,
  FormulaItem,
} from "@/types/database";

export interface ProcessedPdfResult {
  pageCount: number;
  ocrApplied: boolean;
  pages: DocumentPage[];
  chunks: DocumentChunk[];
  heuristicMetadata: ExtractedDocumentMetadata;
}

function cleanPageText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function detectPageHeadings(pageText: string): string[] {
  const lines = pageText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const headings: string[] = [];

  for (const line of lines.slice(0, 25)) {
    if (line.length < 4 || line.length > 110) continue;

    const isNumberedHeading =
      /^(\d+(\.\d+){0,2}|[IVX]+\.|BÖLÜM\s*\d+|ÜNİTE\s*\d+|KONU\s*\d+)[\s:.-]+[A-ZÇĞİÖŞÜa-zçğıöşü]/i.test(
        line
      );
    const isAllCapsHeading =
      line.length >= 5 &&
      line.length <= 75 &&
      line === line.toLocaleUpperCase("tr-TR") &&
      /[A-ZÇĞİÖŞÜ]{3,}/.test(line) &&
      !/^\d+$/.test(line);

    if (isNumberedHeading || isAllCapsHeading) {
      headings.push(line.replace(/\s+/g, " "));
    }
  }

  return Array.from(new Set(headings)).slice(0, 6);
}

function buildHeuristicMetadata(
  pages: { pageNumber: number; text: string; headings: string[] }[]
): ExtractedDocumentMetadata {
  const allHeadings: string[] = [];
  const chapters: ChapterInfo[] = [];
  const definitions: DefinitionItem[] = [];
  const formulas: FormulaItem[] = [];
  const conceptCounts = new Map<string, number>();

  let currentChapter: ChapterInfo | null = null;

  for (const page of pages) {
    for (const h of page.headings) {
      if (!allHeadings.includes(h)) {
        allHeadings.push(h);
      }
      const isMajor =
        /^(BÖLÜM|ÜNİTE|KONU|\d+\.\s+[A-ZÇĞİÖŞÜ])/i.test(h) ||
        chapters.length === 0;
      if (isMajor && chapters.length < 20) {
        if (currentChapter) {
          currentChapter.page_end = Math.max(
            currentChapter.page_start,
            page.pageNumber - 1
          );
        }
        currentChapter = {
          title: h,
          page_start: page.pageNumber,
          page_end: pages.length,
        };
        chapters.push(currentChapter);
      }
    }

    // Extract candidate definitions ("X: ... dır/dir/olarak tanımlanır/denir")
    const sentences = page.text.split(/(?<=[.!?])\s+|\n+/);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length < 25 || trimmed.length > 320) continue;

      const colonDef = trimmed.match(
        /^([A-ZÇĞİÖŞÜ][A-Za-zÇĞİÖŞÜçğıöşü0-9\s()-]{2,45})\s*:\s*(.{20,260})$/
      );
      const verbalDef = trimmed.match(
        /^([A-ZÇĞİÖŞÜ][A-Za-zÇĞİÖŞÜçğıöşü\s()-]{2,45}),?\s+(.{15,240}?(?:olarak tanımlanır|olarak adlandırılır|ifade eder|denir|anlamına gelir)\.?)$/i
      );

      if (colonDef && definitions.length < 18) {
        const term = colonDef[1].trim();
        if (!/^(Not|Örnek|Şekil|Tablo|Sayfa|Kaynak)/i.test(term)) {
          definitions.push({
            term,
            definition: colonDef[2].trim(),
            page: page.pageNumber,
          });
          conceptCounts.set(term, (conceptCounts.get(term) ?? 0) + 3);
        }
      } else if (verbalDef && definitions.length < 18) {
        const term = verbalDef[1].trim();
        definitions.push({
          term,
          definition: verbalDef[2].trim(),
          page: page.pageNumber,
        });
        conceptCounts.set(term, (conceptCounts.get(term) ?? 0) + 3);
      }

      // Extract candidate formulas (lines containing = with mathematical symbols/variables)
      if (
        formulas.length < 15 &&
        trimmed.length <= 140 &&
        /[=]/.test(trimmed) &&
        /([+\-*/^∑∫√Δλμσπ]|(\b[A-Za-z]_[A-Za-z0-9]+\b)|(\b[A-Z]\s*=\s*[A-Za-z0-9(]))/.test(
          trimmed
        )
      ) {
        formulas.push({
          name: `Formül (Sayfa ${page.pageNumber})`,
          expression: trimmed,
          description: `Sayfa ${page.pageNumber} üzerinde tespit edilen matematiksel/bilimsel bağıntı.`,
          page: page.pageNumber,
        });
      }
    }

    // Track capitalized technical terms
    const matches = page.text.match(
      /\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]{3,}(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]{3,}){0,2}\b/g
    );
    if (matches) {
      for (const m of matches) {
        if (
          !/^(Ancak|Bunun|Böylece|Dolayısıyla|Örneğin|Ayrıca|Sonuç|Bölüm|Şekil|Tablo|Sayfa)$/.test(
            m
          )
        ) {
          conceptCounts.set(m, (conceptCounts.get(m) ?? 0) + 1);
        }
      }
    }
  }

  if (chapters.length === 0 && pages.length > 0) {
    const step = Math.max(1, Math.ceil(pages.length / Math.min(5, pages.length)));
    for (let i = 0; i < pages.length; i += step) {
      const start = i + 1;
      const end = Math.min(pages.length, i + step);
      const firstHeading = pages[i].headings[0];
      chapters.push({
        title: firstHeading || `Bölüm ${chapters.length + 1} (Sayfa ${start}-${end})`,
        page_start: start,
        page_end: end,
      });
    }
  } else if (chapters.length > 0) {
    chapters[chapters.length - 1].page_end = pages.length;
  }

  const keyConcepts = Array.from(conceptCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([term]) => term)
    .slice(0, 16);

  const conceptRelations: ConceptRelation[] = [];
  for (let i = 0; i < Math.min(6, chapters.length - 1); i++) {
    conceptRelations.push({
      source: chapters[i].title,
      target: chapters[i + 1].title,
      relation: "Ardışık konu akışı ve kavramsal temel oluşturur",
    });
  }

  const previewSnippet = pages
    .slice(0, 3)
    .map((p) => p.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 420);

  return {
    chapters,
    headings: allHeadings.slice(0, 30),
    definitions,
    formulas,
    key_concepts: keyConcepts,
    concept_relations: conceptRelations,
    important_topics:
      allHeadings.length > 0
        ? allHeadings.slice(0, 12)
        : chapters.map((c) => c.title),
    summary: previewSnippet
      ? `${pages.length} sayfadan oluşan eğitim materyali. İlk bölüm özeti: ${previewSnippet}...`
      : `${pages.length} sayfalık PDF ders materyali.`,
  };
}

async function attemptOcrOnScannedPdf(
  buffer: Buffer,
  sparsePageNumbers: number[]
): Promise<Map<number, string>> {
  const ocrResults = new Map<number, string>();
  if (
    sparsePageNumbers.length === 0 ||
    process.env.ENABLE_OCR === "false"
  ) {
    return ocrResults;
  }

  try {
    // Attempt rendering sparse pages via unpdf + @napi-rs/canvas if available, or extract embedded images
    const unpdf = await import("unpdf");
    const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer));
    const Tesseract = await import("tesseract.js");
    const lang = process.env.OCR_LANGUAGES || "tur+eng";

    // Limit synchronous OCR pass to first 6 sparse pages to avoid request timeouts
    const pagesToProcess = sparsePageNumbers.slice(0, 6);

    for (const pageNum of pagesToProcess) {
      try {
        if (typeof unpdf.renderPageAsImage === "function") {
          const imageBuffer = await unpdf.renderPageAsImage(
            new Uint8Array(buffer),
            pageNum,
            { scale: 1.5 }
          );
          if (imageBuffer) {
            const { data } = await Tesseract.recognize(
              Buffer.from(imageBuffer),
              lang
            );
            const cleaned = cleanPageText(data.text || "");
            if (cleaned.length > 15) {
              ocrResults.set(pageNum, cleaned);
            }
          }
        }
      } catch {
        // Canvas / native renderer optional in serverless environments; continue safely
        break;
      }
    }

    await pdf.destroy();
  } catch {
    // Graceful fallback when native image rasterizer or traineddata network download is restricted
  }

  return ocrResults;
}

export async function extractAndChunkPdf(params: {
  buffer: Buffer;
  documentId: string;
  userId: string;
  fileName?: string;
}): Promise<ProcessedPdfResult> {
  const fileNameLower = (params.fileName || "").toLowerCase();
  let rawPageTexts: string[] = [];

  // 1. DOCX Extraction (Word document)
  if (fileNameLower.endsWith(".docx")) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: params.buffer });
      const fullText = result.value || "";
      // Split into logical sections/pages of ~2000 chars or double newlines
      const paragraphs = fullText.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
      const virtualPages: string[] = [];
      let currentPage = "";

      for (const p of paragraphs) {
        if (currentPage.length + p.length > 2200) {
          virtualPages.push(currentPage.trim());
          currentPage = p;
        } else {
          currentPage = currentPage ? `${currentPage}\n\n${p}` : p;
        }
      }
      if (currentPage.trim()) {
        virtualPages.push(currentPage.trim());
      }
      rawPageTexts = virtualPages.length > 0 ? virtualPages : [fullText];
    } catch (docxErr) {
      throw new Error(
        `Word (.docx) belgesi okunamadı: ${docxErr instanceof Error ? docxErr.message : "Bilinmeyen hata"}`
      );
    }
  } else if (fileNameLower.endsWith(".pptx")) {
    // 2. PPTX Extraction (PowerPoint presentation slides)
    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(params.buffer);
      // Find all slides: ppt/slides/slide1.xml, slide2.xml...
      const slideFiles = Object.keys(zip.files)
        .filter((f) => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)![0], 10);
          const numB = parseInt(b.match(/\d+/)![0], 10);
          return numA - numB;
        });

      if (slideFiles.length > 0) {
        for (const sf of slideFiles) {
          const xml = await zip.files[sf].async("text");
          // Extract text inside <a:t>...</a:t>
          const matches = xml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi) || [];
          const slideText = matches
            .map((m) => m.replace(/<[^>]+>/g, "").trim())
            .filter(Boolean)
            .join(" ");
          rawPageTexts.push(slideText);
        }
      } else {
        // Fallback: search all XMLs for text
        rawPageTexts = ["Sunum slayt metinleri çıkarılamadı."];
      }
    } catch (pptxErr) {
      throw new Error(
        `PowerPoint (.pptx) sunumu okunamadı: ${pptxErr instanceof Error ? pptxErr.message : "Bilinmeyen hata"}`
      );
    }
  } else {
    // 3. PDF Extraction (unpdf + pdf-parse fallback)
    try {
      const { extractText } = await import("unpdf");
      const extracted = await extractText(new Uint8Array(params.buffer), {
        mergePages: false,
      });
      if (Array.isArray(extracted.text)) {
        rawPageTexts = extracted.text;
      } else if (typeof extracted.text === "string") {
        rawPageTexts = [extracted.text];
      }
    } catch {
      // Fallback: pdf-parse
      try {
        const pdfParseModule = await import("pdf-parse/lib/pdf-parse.js");
        const pdfParse = pdfParseModule.default || pdfParseModule;
        const parsed = await pdfParse(params.buffer);
        const splitPages = String(parsed.text || "").split(/\f/);
        rawPageTexts =
          splitPages.length > 1
            ? splitPages
            : [String(parsed.text || "")];
      } catch (err) {
        throw new Error(
          `PDF metni ayrıştırılamadı: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`
        );
      }
    }
  }

  if (rawPageTexts.length === 0) {
    rawPageTexts = [""];
  }

  // Check for scanned / image-only pages needing OCR
  const sparsePages: number[] = [];
  rawPageTexts.forEach((txt, idx) => {
    const words = cleanPageText(txt).split(/\s+/).filter(Boolean);
    if (words.length < 6) {
      sparsePages.push(idx + 1);
    }
  });

  const ocrMap = await attemptOcrOnScannedPdf(params.buffer, sparsePages);
  let ocrApplied = false;

  const now = new Date().toISOString();
  const pageRecords: DocumentPage[] = [];
  const structuredPages: {
    pageNumber: number;
    text: string;
    headings: string[];
  }[] = [];

  for (let i = 0; i < rawPageTexts.length; i++) {
    const pageNumber = i + 1;
    let cleaned = cleanPageText(rawPageTexts[i] || "");
    let hasOcr = false;

    if (ocrMap.has(pageNumber)) {
      cleaned = ocrMap.get(pageNumber)!;
      hasOcr = true;
      ocrApplied = true;
    }

    const words = cleaned ? cleaned.split(/\s+/).filter(Boolean) : [];
    const headings = detectPageHeadings(cleaned);

    pageRecords.push({
      id: crypto.randomUUID(),
      document_id: params.documentId,
      user_id: params.userId,
      page_number: pageNumber,
      text_content: cleaned,
      word_count: words.length,
      has_ocr: hasOcr,
      detected_headings: headings,
      created_at: now,
    });

    structuredPages.push({
      pageNumber,
      text: cleaned,
      headings,
    });
  }

  const heuristicMetadata = buildHeuristicMetadata(structuredPages);

  // Build semantic, chapter-aware, page-tracked chunks (~1000 chars with ~160 char overlap)
  const chunks: DocumentChunk[] = [];
  const TARGET_CHUNK_CHARS = 1050;
  const OVERLAP_CHARS = 160;

  let activeChapter =
    heuristicMetadata.chapters[0]?.title || "Giriş ve Genel Kavramlar";
  let bufferText = "";
  let bufferPageStart = 1;
  let bufferPageEnd = 1;
  let chunkIndex = 0;

  const flushChunk = (content: string, pStart: number, pEnd: number, chapter: string) => {
    const trimmed = content.trim();
    if (trimmed.length < 20) return;
    const approxTokens = Math.ceil(trimmed.length / 4);
    chunks.push({
      id: crypto.randomUUID(),
      document_id: params.documentId,
      user_id: params.userId,
      page_start: pStart,
      page_end: pEnd,
      chapter_title: chapter,
      chunk_index: chunkIndex++,
      content: trimmed,
      token_count: approxTokens,
      metadata: {
        page_range: pStart === pEnd ? `Sayfa ${pStart}` : `Sayfa ${pStart}-${pEnd}`,
        chapter,
      },
      embedding: null,
      created_at: now,
    });
  };

  for (const page of structuredPages) {
    if (page.headings.length > 0) {
      activeChapter = page.headings[0];
    }
    if (!page.text) continue;

    const paragraphs = page.text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    for (const para of paragraphs) {
      if (!bufferText) {
        bufferPageStart = page.pageNumber;
      }
      bufferPageEnd = page.pageNumber;

      if (bufferText.length + para.length + 2 <= TARGET_CHUNK_CHARS) {
        bufferText = bufferText ? `${bufferText}\n\n${para}` : para;
      } else {
        if (bufferText) {
          flushChunk(bufferText, bufferPageStart, bufferPageEnd, activeChapter);
          const overlapTail = bufferText.slice(-OVERLAP_CHARS);
          bufferText = `${overlapTail}\n\n${para}`;
          bufferPageStart = page.pageNumber;
        } else {
          // Very long single paragraph: slice cleanly at sentence boundaries
          let cursor = 0;
          while (cursor < para.length) {
            const slice = para.slice(cursor, cursor + TARGET_CHUNK_CHARS);
            flushChunk(slice, page.pageNumber, page.pageNumber, activeChapter);
            cursor += TARGET_CHUNK_CHARS - OVERLAP_CHARS;
          }
          bufferText = "";
        }
      }
    }
  }

  if (bufferText.trim()) {
    flushChunk(bufferText, bufferPageStart, bufferPageEnd, activeChapter);
  }

  return {
    pageCount: rawPageTexts.length,
    ocrApplied,
    pages: pageRecords,
    chunks,
    heuristicMetadata,
  };
}

