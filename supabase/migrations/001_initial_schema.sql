-- =============================================================================
-- AKADEMIK AI - COMPLETE PRODUCTION DATABASE SCHEMA (PostgreSQL + Supabase)
-- Includes: 14 Tables, pgvector RAG Search, Indexes, Triggers & Strict RLS
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- -----------------------------------------------------------------------------
-- 1. USERS TABLE (Synced with auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  university TEXT DEFAULT '',
  department TEXT DEFAULT '',
  theme_preference TEXT NOT NULL DEFAULT 'light' CHECK (theme_preference IN ('light', 'dark', 'system')),
  ai_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automatically create public.users profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, university, department)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'university', ''),
    COALESCE(NEW.raw_user_meta_data->>'department', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. COURSES TABLE (Course/Subject Organization)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT DEFAULT '',
  color TEXT NOT NULL DEFAULT '#0F766E',
  description TEXT DEFAULT '',
  semester TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_user_id ON public.courses(user_id);

-- -----------------------------------------------------------------------------
-- 3. DOCUMENTS TABLE (Uploaded PDFs & Structural AI Analysis)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  page_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('uploading', 'processing', 'ready', 'failed')),
  ocr_applied BOOLEAN NOT NULL DEFAULT FALSE,
  extracted_metadata JSONB NOT NULL DEFAULT '{
    "chapters": [],
    "headings": [],
    "definitions": [],
    "formulas": [],
    "key_concepts": [],
    "concept_relations": [],
    "important_topics": [],
    "summary": ""
  }'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_course_id ON public.documents(course_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. DOCUMENT PAGES TABLE (Page-Level Source Tracking)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  text_content TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  has_ocr BOOLEAN NOT NULL DEFAULT FALSE,
  detected_headings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_document_pages_doc_id ON public.document_pages(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_document_pages_user_id ON public.document_pages(user_id);

-- -----------------------------------------------------------------------------
-- 5. DOCUMENT CHUNKS TABLE (RAG Semantic Chunks & Vector Embeddings)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  chapter_title TEXT DEFAULT '',
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_id ON public.document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_document_chunks_user_id ON public.document_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON public.document_chunks
  USING hnsw (embedding vector_cosine_ops);

-- Vector Similarity Search RPC (strictly scoped to authenticated user)
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector(1536),
  match_count INT DEFAULT 8,
  filter_document_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  page_start INT,
  page_end INT,
  chapter_title TEXT,
  chunk_index INT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.page_start,
    dc.page_end,
    dc.chapter_title,
    dc.chunk_index,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  WHERE dc.user_id = auth.uid()
    AND dc.embedding IS NOT NULL
    AND (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. STUDY NOTES TABLE (AI Study Notes Generator)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.study_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  note_type TEXT NOT NULL CHECK (note_type IN (
    'comprehensive',
    'concise',
    'exam_focused',
    'topic_by_topic',
    'last_minute_review',
    'concepts_definitions',
    'formulas_facts'
  )),
  content_markdown TEXT NOT NULL,
  structured_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  chapters_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  key_concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
  formulas JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_notes_user_id ON public.study_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_study_notes_doc_id ON public.study_notes(document_id);

-- -----------------------------------------------------------------------------
-- 7. QUESTION BANKS TABLE (Document Banks & Custom Collections)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.question_banks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_custom_collection BOOLEAN NOT NULL DEFAULT FALSE,
  question_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_banks_user_id ON public.question_banks(user_id);

-- -----------------------------------------------------------------------------
-- 8. QUESTIONS TABLE (All 5 Question Types with Source Tracking)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  question_bank_id UUID REFERENCES public.question_banks(id) ON DELETE SET NULL,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  question_type TEXT NOT NULL CHECK (question_type IN (
    'classical',
    'multiple_choice',
    'true_false',
    'fill_blank',
    'matching'
  )),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  topic TEXT NOT NULL DEFAULT 'Genel',
  source_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_excerpt TEXT DEFAULT '',
  question_text TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer TEXT DEFAULT '',
  model_answer TEXT DEFAULT '',
  expected_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  grading_rubric JSONB NOT NULL DEFAULT '[]'::jsonb,
  matching_pairs JSONB NOT NULL DEFAULT '[]'::jsonb,
  explanation TEXT NOT NULL DEFAULT '',
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_user_id ON public.questions(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_doc_id ON public.questions(document_id);
CREATE INDEX IF NOT EXISTS idx_questions_type ON public.questions(question_type);
CREATE INDEX IF NOT EXISTS idx_questions_favorite ON public.questions(user_id, is_favorite);

-- -----------------------------------------------------------------------------
-- 9. EXAMS TABLE (Configured Practice Examinations)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  exam_type TEXT NOT NULL DEFAULT 'karma',
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'mixed')),
  duration_minutes INTEGER NOT NULL DEFAULT 45 CHECK (duration_minutes > 0),
  total_questions INTEGER NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('generating', 'ready', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exams_user_id ON public.exams(user_id);
CREATE INDEX IF NOT EXISTS idx_exams_doc_id ON public.exams(document_id);

-- -----------------------------------------------------------------------------
-- 10. EXAM QUESTIONS TABLE (Ordered Exam Question Mapping)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  points NUMERIC(6,2) NOT NULL DEFAULT 10.00,
  UNIQUE (exam_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id ON public.exam_questions(exam_id, order_index);

-- -----------------------------------------------------------------------------
-- 11. EXAM ATTEMPTS TABLE (Interactive Exam Sessions & Results)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  total_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  max_score NUMERIC(6,2) NOT NULL DEFAULT 100,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  unanswered_count INTEGER NOT NULL DEFAULT 0,
  success_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  weak_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  topic_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_feedback TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_user_id ON public.exam_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_id ON public.exam_attempts(exam_id);

-- -----------------------------------------------------------------------------
-- 12. EXAM ANSWERS TABLE (Student Answers & AI Classical Rubric Grading)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  exam_question_id UUID NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_answer TEXT NOT NULL DEFAULT '',
  is_marked_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  is_correct BOOLEAN,
  score_awarded NUMERIC(6,2) NOT NULL DEFAULT 0,
  max_points NUMERIC(6,2) NOT NULL DEFAULT 10,
  ai_evaluation JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_answers_attempt_id ON public.exam_answers(attempt_id);

-- -----------------------------------------------------------------------------
-- 13. STUDY SESSIONS TABLE (Activity History & Study Time Analytics)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.study_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'upload',
    'note_study',
    'question_practice',
    'exam_attempt',
    'ai_chat'
  )),
  title TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 5,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_id ON public.study_sessions(user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 14. CHAT MESSAGES TABLE (Document-Grounded AI Study Assistant)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  has_external_knowledge BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_session ON public.chat_messages(user_id, session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_doc_id ON public.chat_messages(document_id);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES — STRICT ISOLATION PER USER
-- =============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users view own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.users FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- Generic strict owner policy macro applied to all user-owned tables
CREATE POLICY "Courses owner access" ON public.courses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Documents owner access" ON public.documents FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Document pages owner access" ON public.document_pages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Document chunks owner access" ON public.document_chunks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Study notes owner access" ON public.study_notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Question banks owner access" ON public.question_banks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Questions owner access" ON public.questions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Exams owner access" ON public.exams FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Exam questions owner access" ON public.exam_questions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Exam attempts owner access" ON public.exam_attempts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Exam answers owner access" ON public.exam_answers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Study sessions owner access" ON public.study_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Chat messages owner access" ON public.chat_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- SUPABASE STORAGE BUCKET & STORAGE RLS POLICIES
-- =============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', FALSE, 26214400, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own PDFs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own PDFs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own PDFs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

