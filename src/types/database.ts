export type ThemePreference = "light" | "dark" | "system";

export type AIProviderType = "openai" | "gemini" | "anthropic" | "compatible";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  university: string;
  department: string;
  theme_preference: ThemePreference;
  ai_preferences: {
    preferred_provider?: AIProviderType;
    preferred_model?: string;
    default_mcq_options?: 4 | 5;
  };
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  user_id: string;
  name: string;
  code: string;
  color: string;
  description: string;
  semester: string;
  created_at: string;
  updated_at: string;
}

export interface ChapterInfo {
  title: string;
  page_start: number;
  page_end: number;
  summary?: string;
}

export interface DefinitionItem {
  term: string;
  definition: string;
  page: number;
}

export interface FormulaItem {
  name: string;
  expression: string;
  description: string;
  page: number;
}

export interface ConceptRelation {
  source: string;
  target: string;
  relation: string;
}

export interface ExtractedDocumentMetadata {
  chapters: ChapterInfo[];
  headings: string[];
  definitions: DefinitionItem[];
  formulas: FormulaItem[];
  key_concepts: string[];
  concept_relations: ConceptRelation[];
  important_topics: string[];
  summary: string;
}

export type DocumentStatus = "uploading" | "processing" | "ready" | "failed";

export interface DocumentRecord {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  file_name: string;
  storage_path: string;
  file_size: number;
  page_count: number;
  status: DocumentStatus;
  ocr_applied: boolean;
  extracted_metadata: ExtractedDocumentMetadata;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentPage {
  id: string;
  document_id: string;
  user_id: string;
  page_number: number;
  text_content: string;
  word_count: number;
  has_ocr: boolean;
  detected_headings: string[];
  created_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  user_id: string;
  page_start: number;
  page_end: number;
  chapter_title: string;
  chunk_index: number;
  content: string;
  token_count: number;
  metadata: Record<string, unknown>;
  embedding?: number[] | null;
  created_at: string;
}

export type StudyNoteType =
  | "comprehensive"
  | "concise"
  | "exam_focused"
  | "topic_by_topic"
  | "last_minute_review"
  | "concepts_definitions"
  | "formulas_facts";

export const STUDY_NOTE_TYPE_LABELS: Record<
  StudyNoteType,
  { label: string; description: string }
> = {
  comprehensive: {
    label: "Kapsamlı Ders Notu",
    description:
      "Tüm bölümleri, kavramları, örnekleri, tabloları ve bölüm sonu özetlerini içeren detaylı akademik ders notu.",
  },
  concise: {
    label: "Kısa ve Öz Ders Notu",
    description:
      "Gereksiz tekrarlardan arındırılmış, konunun özünü ve kilit noktalarını sunan yapılandırılmış özet not.",
  },
  exam_focused: {
    label: "Sınav Odaklı Ders Notu",
    description:
      "Üniversite vize/final sınavlarında çıkma olasılığı yüksek noktalar, karşılaştırmalar ve dikkat uyarıları.",
  },
  topic_by_topic: {
    label: "Konu Konu Ayrıntılı Anlatım",
    description:
      "Her alt başlığı adım adım, pedagojik örnekler ve kavram bağlantılarıyla açıklayan rehber anlatım.",
  },
  last_minute_review: {
    label: "Son Tekrar Notları",
    description:
      "Sınavdan hemen önce hızlıca gözden geçirilebilecek kritik maddeler, hatırlatıcılar ve kontrol listeleri.",
  },
  concepts_definitions: {
    label: "Önemli Kavramlar ve Tanımlar",
    description:
      "Belgedeki tüm akademik terimlerin, kavramların ve aralarındaki ilişkilerin sözlük ve tablo formatında analizi.",
  },
  formulas_facts: {
    label: "Formüller ve Önemli Bilgiler",
    description:
      "Belgede geçen formüller, kurallar, sabitler, teoremler ve çözümlü uygulama örnekleri.",
  },
};

export interface StudyNoteSection {
  heading: string;
  content: string;
  key_takeaways: string[];
  page_references: number[];
}

export interface StudyNote {
  id: string;
  user_id: string;
  document_id: string;
  course_id: string | null;
  title: string;
  note_type: StudyNoteType;
  content_markdown: string;
  structured_sections: StudyNoteSection[];
  chapters_summary: { chapter: string; summary: string }[];
  key_concepts: DefinitionItem[];
  formulas: FormulaItem[];
  is_edited: boolean;
  created_at: string;
  updated_at: string;
}

export type QuestionType =
  | "classical"
  | "multiple_choice"
  | "true_false"
  | "fill_blank"
  | "matching";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  classical: "Klasik (Açık Uçlu)",
  multiple_choice: "Çoktan Seçmeli",
  true_false: "Doğru / Yanlış",
  fill_blank: "Boşluk Doldurma",
  matching: "Eşleştirme",
};

export type DifficultyLevel = "easy" | "medium" | "hard";
export type ExamDifficulty = DifficultyLevel | "mixed";

export const DIFFICULTY_LABELS: Record<ExamDifficulty, string> = {
  easy: "Kolay",
  medium: "Orta",
  hard: "Zor",
  mixed: "Karma",
};

export interface RubricCriterion {
  criterion: string;
  points: number;
  description: string;
}

export interface MatchingPair {
  left: string;
  right: string;
}

export interface QuestionOption {
  label: string; // "A", "B", "C", "D", "E"
  text: string;
}

export interface QuestionBank {
  id: string;
  user_id: string;
  course_id: string | null;
  document_id: string | null;
  title: string;
  description: string;
  is_custom_collection: boolean;
  question_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  user_id: string;
  question_bank_id: string | null;
  document_id: string;
  course_id: string | null;
  question_type: QuestionType;
  difficulty: DifficultyLevel;
  topic: string;
  source_pages: number[];
  source_excerpt: string;
  question_text: string;
  options: QuestionOption[];
  correct_answer: string;
  model_answer: string;
  expected_points: string[];
  grading_rubric: RubricCriterion[];
  matching_pairs: MatchingPair[];
  explanation: string;
  is_favorite: boolean;
  created_at: string;
}

export interface ExamDistribution {
  multiple_choice: number;
  classical: number;
  true_false: number;
  fill_blank: number;
  matching: number;
}

export interface ExamConfig {
  question_distribution: ExamDistribution;
  topics: string[];
  immediate_answers: boolean;
  include_explanations: boolean;
  mcq_option_count: 4 | 5;
}

export interface Exam {
  id: string;
  user_id: string;
  course_id: string | null;
  document_id: string;
  title: string;
  description: string;
  exam_type: string;
  difficulty: ExamDifficulty;
  duration_minutes: number;
  total_questions: number;
  config: ExamConfig;
  status: "generating" | "ready" | "archived";
  created_at: string;
}

export interface ExamQuestionItem {
  id: string;
  exam_id: string;
  question_id: string;
  user_id: string;
  order_index: number;
  points: number;
  question?: Question;
}

export interface ClassicalAIEvaluation {
  score_ratio: number; // 0.0 to 1.0
  feedback: string;
  matched_points: string[];
  missing_points: string[];
  rubric_breakdown: {
    criterion: string;
    awarded: number;
    max: number;
    comment: string;
  }[];
}

export interface TopicPerformanceItem {
  topic: string;
  total: number;
  correct: number;
  score_earned: number;
  max_score: number;
  percentage: number;
}

export interface ExamAttempt {
  id: string;
  exam_id: string;
  user_id: string;
  status: "in_progress" | "completed";
  started_at: string;
  completed_at: string | null;
  time_spent_seconds: number;
  total_score: number;
  max_score: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  success_percentage: number;
  weak_topics: string[];
  recommended_topics: string[];
  topic_breakdown: TopicPerformanceItem[];
  ai_feedback: string;
  created_at: string;
}

export interface ExamAnswer {
  id: string;
  attempt_id: string;
  exam_question_id: string;
  question_id: string;
  user_id: string;
  user_answer: string; // string or JSON string for matching answers
  is_marked_for_review: boolean;
  is_correct: boolean | null;
  score_awarded: number;
  max_points: number;
  ai_evaluation: ClassicalAIEvaluation | null;
  updated_at: string;
}

export type StudyActivityType =
  | "upload"
  | "note_study"
  | "question_practice"
  | "exam_attempt"
  | "ai_chat";

export const STUDY_ACTIVITY_LABELS: Record<StudyActivityType, string> = {
  upload: "PDF Belge Analizi",
  note_study: "Ders Notu Çalışması",
  question_practice: "Soru Çözümü",
  exam_attempt: "Deneme Sınavı",
  ai_chat: "YZ Çalışma Sohbeti",
};

export interface StudySession {
  id: string;
  user_id: string;
  document_id: string | null;
  course_id: string | null;
  activity_type: StudyActivityType;
  title: string;
  duration_minutes: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChatCitation {
  document_id: string;
  document_title: string;
  page_start: number;
  page_end: number;
  chapter_title?: string;
  excerpt: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  session_id: string;
  document_id: string | null;
  course_id: string | null;
  role: "user" | "assistant";
  content: string;
  citations: ChatCitation[];
  has_external_knowledge: boolean;
  created_at: string;
}

export interface RetrievedChunk {
  chunk: DocumentChunk;
  document_title: string;
  score: number;
}

