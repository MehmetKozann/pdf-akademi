# AkademikAI — Intelligent Learning & AI Study Assistant Platform

Production-ready, Turkish-interface AI educational SaaS platform built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **Supabase (PostgreSQL + pgvector + Auth + Storage + RLS)**, **PDF/OCR extraction (`unpdf` + `pdf-parse` + `tesseract.js`)**, and a **multi-provider RAG AI layer**.

## Key Capabilities

- **100% Turkish Student Interface**: Every menu, dashboard, button, notification, interactive exam screen, and AI-generated output is crafted in academic Turkish.
- **PDF Upload, OCR & Deep Structural Analysis**:
  - Multi-file drag & drop upload, course-based organization, built-in PDF preview, and page-by-page text extraction.
  - Automatic OCR fallback (`tesseract.js`) for scanned pages.
  - Extracts chapters, headings, definitions, formulas, key concepts, and concept relationships.
- **Document-Grounded RAG Pipeline**:
  - Chapter-aware semantic chunking with exact `page_start`–`page_end` tracking.
  - Vector embeddings (`pgvector` `vector(1536)` + local morphological Turkish n-gram hybrid fallback).
- **7 Specialized Study Note Formats**:
  - *Kapsamlı Ders Notu, Kısa ve Öz Ders Notu, Sınav Odaklı Ders Notu, Konu Konu Ayrıntılı Anlatım, Son Tekrar Notları, Önemli Kavramlar ve Tanımlar, Formüller ve Önemli Bilgiler*.
  - Inline Markdown editor, copy, regenerate, PDF export, and contextual AI Q&A drawer.
- **5 University Exam Question Types**:
  - *Klasik (Açık Uçlu + Model Cevap + Rubrik)*, *Çoktan Seçmeli (4/5 Şıklı)*, *Doğru / Yanlış*, *Boşluk Doldurma*, and *Eşleştirme*.
  - Favorites and custom question collections.
- **Configurable Practice Exams & Realistic Interactive Exam Mode**:
  - Countdown timer, question navigator palette, mark-for-review, auto-save, objective grading, transparent AI rubric grading for classical answers, weak-topic analytics, and downloadable PDF result reports.
- **Document-Grounded AI Study Chat**:
  - Answers strictly grounded in uploaded PDFs with `[Sayfa X]` citations and explicit separation of external academic context.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create environment configuration
cp .env.example .env.local

# 3. Start development server
npm run dev
```

Open `http://localhost:3000`.

---

## Configuration Guide (`.env.local`)

### 1. AI Provider Configuration (Required for LLM Generation)
Configure **at least one** provider in `.env.local` (or directly in **Ayarlar > Yapay Zeka Sağlayıcı Yapılandırması**, which stores keys server-side only):

- **OpenAI**: Set `AI_PROVIDER=openai` and `OPENAI_API_KEY=sk-...`
- **Google Gemini**: Set `AI_PROVIDER=gemini` and `GEMINI_API_KEY=AIza...`
- **Anthropic Claude**: Set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=sk-ant-...`
- **Local Ollama / Custom Endpoint**: Set `AI_PROVIDER=compatible` and `AI_BASE_URL=http://localhost:11434/v1`

### 2. Supabase Database, Auth & Storage
1. Create a new Supabase project and run [`supabase/migrations/001_initial_schema.sql`](./supabase/migrations/001_initial_schema.sql) in the Supabase SQL Editor (creates all 14 tables, `pgvector` HNSW index, `match_document_chunks` RPC, `documents` storage bucket, and strict Row Level Security policies).
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`.
3. *Zero-Setup Local Mode*: When Supabase variables are omitted during local development, the repository layer automatically persists real accounts, hashed credentials, uploaded PDFs, pages, chunks, notes, questions, and exam attempts in `.data/` on the server (zero mock data).

