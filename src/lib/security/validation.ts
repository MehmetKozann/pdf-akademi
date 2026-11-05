import { z } from "zod";

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Geçerli bir e-posta adresi giriniz.")
    .max(160),
  password: z
    .string()
    .min(6, "Şifre en az 6 karakter olmalıdır.")
    .max(128, "Şifre çok uzun."),
  full_name: z
    .string()
    .trim()
    .min(2, "Ad soyad en az 2 karakter olmalıdır.")
    .max(100),
  university: z.string().trim().max(120).optional().default(""),
  department: z.string().trim().max(120).optional().default(""),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Geçerli bir e-posta adresi giriniz."),
  password: z.string().min(1, "Şifre alanı zorunludur."),
});

export const courseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ders adı en az 2 karakter olmalıdır.")
    .max(120),
  code: z.string().trim().max(30).optional().default(""),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Geçerli bir renk kodu seçiniz.")
    .optional()
    .default("#14213D"),
  description: z.string().trim().max(400).optional().default(""),
  semester: z.string().trim().max(60).optional().default(""),
});

export const generateNoteSchema = z.object({
  documentId: z.string().min(1, "Lütfen bir PDF belgesi seçiniz."),
  noteType: z.enum([
    "comprehensive",
    "concise",
    "exam_focused",
    "topic_by_topic",
    "last_minute_review",
    "concepts_definitions",
    "formulas_facts",
  ]),
  customTitle: z.string().trim().max(180).optional(),
  focusTopic: z.string().trim().max(180).optional(),
});

export const updateNoteSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  content_markdown: z.string().min(10).max(250000).optional(),
});

export const generateQuestionsSchema = z.object({
  documentId: z.string().min(1, "Lütfen bir PDF belgesi seçiniz."),
  questionType: z.enum([
    "classical",
    "multiple_choice",
    "true_false",
    "fill_blank",
    "matching",
  ]),
  count: z.number().int().min(1).max(25).default(5),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
  mcqOptionCount: z.union([z.literal(4), z.literal(5)]).optional().default(5),
  topics: z.array(z.string().trim()).optional().default([]),
  bankTitle: z.string().trim().max(160).optional(),
});

export const createCollectionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Koleksiyon adı en az 2 karakter olmalıdır.")
    .max(140),
  description: z.string().trim().max(400).optional().default(""),
  courseId: z.string().nullable().optional(),
  questionIds: z.array(z.string()).optional().default([]),
});

export const createExamSchema = z.object({
  documentId: z.string().min(1, "Lütfen bir PDF belgesi seçiniz."),
  title: z
    .string()
    .trim()
    .min(2, "Sınav başlığı en az 2 karakter olmalıdır.")
    .max(180),
  examType: z.string().trim().min(2).max(80).default("Deneme Sınavı"),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
  durationMinutes: z.number().int().min(5).max(240).default(45),
  topics: z.array(z.string().trim()).optional().default([]),
  mcqOptionCount: z.union([z.literal(4), z.literal(5)]).optional().default(5),
  immediateAnswers: z.boolean().default(false),
  includeExplanations: z.boolean().default(true),
  distribution: z.object({
    multiple_choice: z.number().int().min(0).max(40).default(0),
    classical: z.number().int().min(0).max(20).default(0),
    true_false: z.number().int().min(0).max(25).default(0),
    fill_blank: z.number().int().min(0).max(25).default(0),
    matching: z.number().int().min(0).max(10).default(0),
  }),
});

export const saveExamAnswerSchema = z.object({
  questionId: z.string().min(1),
  examQuestionId: z.string().min(1),
  userAnswer: z.string().max(30000).optional().default(""),
  isMarkedForReview: z.boolean().optional(),
  timeSpentSeconds: z.number().int().min(0).optional(),
});

export const chatMessageSchema = z.object({
  sessionId: z.string().trim().min(1).max(120),
  documentId: z.string().nullable().optional(),
  courseId: z.string().nullable().optional(),
  message: z
    .string()
    .trim()
    .min(2, "Lütfen sorunuzu yazınız.")
    .max(4000, "Mesaj çok uzun."),
});

export const settingsUpdateSchema = z.object({
  full_name: z.string().trim().min(2).max(100).optional(),
  university: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  theme_preference: z.enum(["light", "dark", "system"]).optional(),
  ai_preferences: z
    .object({
      preferred_provider: z
        .enum(["openai", "gemini", "anthropic", "compatible"])
        .optional(),
      preferred_model: z.string().max(100).optional(),
      default_mcq_options: z.union([z.literal(4), z.literal(5)]).optional(),
    })
    .optional(),
  runtime_ai_config: z
    .object({
      aiProvider: z
        .enum(["openai", "gemini", "anthropic", "compatible"])
        .optional(),
      aiModel: z.string().max(100).optional(),
      aiEmbeddingModel: z.string().max(100).optional(),
      openaiApiKey: z.string().max(300).optional(),
      geminiApiKey: z.string().max(300).optional(),
      anthropicApiKey: z.string().max(300).optional(),
      aiBaseUrl: z.string().max(300).optional(),
      aiCompatibleApiKey: z.string().max(300).optional(),
    })
    .optional(),
});

export function validatePdfFile(
  fileName: string,
  mimeType: string,
  buffer: Buffer
): { valid: boolean; error?: string } {
  const maxMb = Number(process.env.MAX_FILE_SIZE_MB || 25);
  const maxBytes = maxMb * 1024 * 1024;

  if (!fileName.toLowerCase().endsWith(".pdf")) {
    return {
      valid: false,
      error: "Yalnızca .pdf uzantılı dosyalar yüklenebilir.",
    };
  }

  if (mimeType && mimeType !== "application/pdf" && mimeType !== "application/x-pdf") {
    return {
      valid: false,
      error: "Geçersiz dosya türü. Lütfen geçerli bir PDF belgesi seçiniz.",
    };
  }

  if (buffer.byteLength === 0) {
    return { valid: false, error: "Yüklenen PDF dosyası boş." };
  }

  if (buffer.byteLength > maxBytes) {
    return {
      valid: false,
      error: `Dosya boyutu izin verilen sınırı (${maxMb} MB) aşıyor.`,
    };
  }

  // Verify PDF magic header (%PDF-) within first 1024 bytes
  const headerSlice = buffer.subarray(0, Math.min(1024, buffer.byteLength)).toString("latin1");
  if (!headerSlice.includes("%PDF-")) {
    return {
      valid: false,
      error: "Dosya içeriği geçerli bir PDF imzası (%PDF-) taşımıyor.",
    };
  }

  return { valid: true };
}

