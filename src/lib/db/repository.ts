import crypto from "node:crypto";
import { isSupabaseConfigured } from "@/lib/config/server-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  deleteLocalPdfBuffer,
  mutateLocalDb,
  readLocalDb,
  readLocalPdfBuffer,
  saveLocalPdfBuffer,
} from "@/lib/db/local-store";
import { normalizeTurkish } from "@/lib/utils";
import type {
  ChatMessage,
  Course,
  DocumentChunk,
  DocumentPage,
  DocumentRecord,
  Exam,
  ExamAnswer,
  ExamAttempt,
  ExamQuestionItem,
  Question,
  QuestionBank,
  RetrievedChunk,
  StudyNote,
  StudySession,
  UserProfile,
} from "@/types/database";

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function lexicalOverlapScore(query: string, content: string): number {
  const qNorm = normalizeTurkish(query);
  const cNorm = normalizeTurkish(content);
  const terms = qNorm
    .split(/[^a-z0-9ğüşıöç]+/i)
    .filter((w) => w.length >= 3);
  if (terms.length === 0) return 0;

  let hits = 0;
  for (const term of terms) {
    if (cNorm.includes(term)) {
      hits += 1;
    }
  }
  return hits / terms.length;
}

export const repository = {
  // ---------------------------------------------------------------------------
  // USERS
  // ---------------------------------------------------------------------------
  async updateUser(
    userId: string,
    patch: Partial<
      Pick<
        UserProfile,
        | "full_name"
        | "university"
        | "department"
        | "theme_preference"
        | "ai_preferences"
      >
    >
  ): Promise<UserProfile | null> {
    const updatedAt = new Date().toISOString();
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("users")
        .update({ ...patch, updated_at: updatedAt })
        .eq("id", userId)
        .select("*")
        .single();
      return (data as UserProfile) ?? null;
    }
    return mutateLocalDb((db) => {
      const idx = db.users.findIndex((u) => u.id === userId);
      if (idx === -1) return null;
      db.users[idx] = {
        ...db.users[idx],
        ...patch,
        ai_preferences: patch.ai_preferences
          ? { ...db.users[idx].ai_preferences, ...patch.ai_preferences }
          : db.users[idx].ai_preferences,
        updated_at: updatedAt,
      };
      return db.users[idx];
    });
  },

  // ---------------------------------------------------------------------------
  // COURSES
  // ---------------------------------------------------------------------------
  async listCourses(userId: string): Promise<Course[]> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("courses")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      return (data as Course[]) ?? [];
    }
    return readLocalDb()
      .courses.filter((c) => c.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async createCourse(
    userId: string,
    input: {
      name: string;
      code?: string;
      color?: string;
      description?: string;
      semester?: string;
    }
  ): Promise<Course> {
    const now = new Date().toISOString();
    const course: Course = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: input.name,
      code: input.code || "",
      color: input.color || "#14213D",
      description: input.description || "",
      semester: input.semester || "",
      created_at: now,
      updated_at: now,
    };

    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("courses")
        .insert(course)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as Course;
    }

    mutateLocalDb((db) => {
      db.courses.push(course);
    });
    return course;
  },

  async deleteCourse(userId: string, courseId: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase
        .from("courses")
        .delete()
        .eq("id", courseId)
        .eq("user_id", userId);
      return !error;
    }
    return mutateLocalDb((db) => {
      const prevLen = db.courses.length;
      db.courses = db.courses.filter(
        (c) => !(c.id === courseId && c.user_id === userId)
      );
      db.documents.forEach((d) => {
        if (d.user_id === userId && d.course_id === courseId) {
          d.course_id = null;
        }
      });
      return db.courses.length < prevLen;
    });
  },

  // ---------------------------------------------------------------------------
  // STORAGE (PDF Binary Upload / Download / Delete)
  // ---------------------------------------------------------------------------
  async uploadPdfBinary(
    userId: string,
    fileIdentifier: string,
    buffer: Buffer
  ): Promise<string> {
    const filename = fileIdentifier.includes(".")
      ? fileIdentifier
      : `${fileIdentifier}.pdf`;
    const storagePath = `${userId}/${filename}`;
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      let contentType = "application/pdf";
      if (filename.endsWith(".docx")) {
        contentType =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (filename.endsWith(".pptx")) {
        contentType =
          "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      }

      const { error } = await supabase.storage
        .from("documents")
        .upload(storagePath, buffer, {
          contentType,
          upsert: true,
        });
      if (error) throw new Error(`Depolama hatası: ${error.message}`);
      return storagePath;
    }
    saveLocalPdfBuffer(storagePath, buffer);
    return storagePath;
  },

  async downloadPdfBinary(
    userId: string,
    storagePath: string
  ): Promise<Buffer | null> {
    if (!storagePath.startsWith(`${userId}/`)) {
      return null;
    }
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.storage
        .from("documents")
        .download(storagePath);
      if (error || !data) return null;
      const arr = await data.arrayBuffer();
      return Buffer.from(arr);
    }
    return readLocalPdfBuffer(storagePath);
  },

  async removePdfBinary(userId: string, storagePath: string): Promise<void> {
    if (!storagePath.startsWith(`${userId}/`)) return;
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      await supabase.storage.from("documents").remove([storagePath]);
      return;
    }
    deleteLocalPdfBuffer(storagePath);
  },

  // ---------------------------------------------------------------------------
  // DOCUMENTS, PAGES & CHUNKS
  // ---------------------------------------------------------------------------
  async listDocuments(
    userId: string,
    courseId?: string | null
  ): Promise<DocumentRecord[]> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      let q = supabase
        .from("documents")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (courseId) q = q.eq("course_id", courseId);
      const { data } = await q;
      return (data as DocumentRecord[]) ?? [];
    }
    return readLocalDb()
      .documents.filter(
        (d) =>
          d.user_id === userId && (!courseId || d.course_id === courseId)
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getDocument(
    userId: string,
    documentId: string
  ): Promise<DocumentRecord | null> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("documents")
        .select("*")
        .eq("id", documentId)
        .eq("user_id", userId)
        .single();
      return (data as DocumentRecord) ?? null;
    }
    return (
      readLocalDb().documents.find(
        (d) => d.id === documentId && d.user_id === userId
      ) ?? null
    );
  },

  async createDocument(doc: DocumentRecord): Promise<DocumentRecord> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("documents")
        .insert(doc)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as DocumentRecord;
    }
    mutateLocalDb((db) => {
      db.documents.push(doc);
    });
    return doc;
  },

  async updateDocument(
    userId: string,
    documentId: string,
    patch: Partial<DocumentRecord>
  ): Promise<DocumentRecord | null> {
    const updatedAt = new Date().toISOString();
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("documents")
        .update({ ...patch, updated_at: updatedAt })
        .eq("id", documentId)
        .eq("user_id", userId)
        .select("*")
        .single();
      return (data as DocumentRecord) ?? null;
    }
    return mutateLocalDb((db) => {
      const idx = db.documents.findIndex(
        (d) => d.id === documentId && d.user_id === userId
      );
      if (idx === -1) return null;
      db.documents[idx] = {
        ...db.documents[idx],
        ...patch,
        updated_at: updatedAt,
      };
      return db.documents[idx];
    });
  },

  async deleteDocument(userId: string, documentId: string): Promise<boolean> {
    const doc = await this.getDocument(userId, documentId);
    if (!doc) return false;

    await this.removePdfBinary(userId, doc.storage_path);

    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentId)
        .eq("user_id", userId);
      return !error;
    }

    mutateLocalDb((db) => {
      db.documents = db.documents.filter(
        (d) => !(d.id === documentId && d.user_id === userId)
      );
      db.document_pages = db.document_pages.filter(
        (p) => p.document_id !== documentId
      );
      db.document_chunks = db.document_chunks.filter(
        (c) => c.document_id !== documentId
      );
      db.study_notes = db.study_notes.filter(
        (n) => n.document_id !== documentId
      );
      db.questions = db.questions.filter((q) => q.document_id !== documentId);
      db.exams = db.exams.filter((e) => e.document_id !== documentId);
    });
    return true;
  },

  async saveDocumentPages(pages: DocumentPage[]): Promise<void> {
    if (pages.length === 0) return;
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.from("document_pages").insert(pages);
      if (error) throw new Error(error.message);
      return;
    }
    mutateLocalDb((db) => {
      db.document_pages.push(...pages);
    });
  },

  async getDocumentPages(
    userId: string,
    documentId: string
  ): Promise<DocumentPage[]> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("document_pages")
        .select("*")
        .eq("document_id", documentId)
        .eq("user_id", userId)
        .order("page_number", { ascending: true });
      return (data as DocumentPage[]) ?? [];
    }
    return readLocalDb()
      .document_pages.filter(
        (p) => p.document_id === documentId && p.user_id === userId
      )
      .sort((a, b) => a.page_number - b.page_number);
  },

  async saveDocumentChunks(chunks: DocumentChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const sanitized = chunks.map((chunk) => ({
        ...chunk,
        embedding:
          chunk.embedding && chunk.embedding.length === 1536
            ? chunk.embedding
            : null,
      }));
      const { error } = await supabase
        .from("document_chunks")
        .insert(sanitized);
      if (error) throw new Error(error.message);
      return;
    }
    mutateLocalDb((db) => {
      db.document_chunks.push(...chunks);
    });
  },

  async getDocumentChunks(
    userId: string,
    documentId: string
  ): Promise<DocumentChunk[]> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("document_chunks")
        .select("*")
        .eq("document_id", documentId)
        .eq("user_id", userId)
        .order("chunk_index", { ascending: true });
      return (data as DocumentChunk[]) ?? [];
    }
    return readLocalDb()
      .document_chunks.filter(
        (c) => c.document_id === documentId && c.user_id === userId
      )
      .sort((a, b) => a.chunk_index - b.chunk_index);
  },

  async retrieveRelevantChunks(params: {
    userId: string;
    query: string;
    queryEmbedding?: number[] | null;
    documentIds?: string[];
    topK?: number;
  }): Promise<RetrievedChunk[]> {
    const topK = params.topK ?? 8;
    const docs = await this.listDocuments(params.userId);
    const docMap = new Map(docs.map((d) => [d.id, d.title]));

    if (
      isSupabaseConfigured() &&
      params.queryEmbedding &&
      params.queryEmbedding.length === 1536
    ) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.rpc("match_document_chunks", {
        query_embedding: params.queryEmbedding,
        match_count: topK,
        filter_document_ids:
          params.documentIds && params.documentIds.length > 0
            ? params.documentIds
            : null,
      });

      if (data && Array.isArray(data) && data.length > 0) {
        return data.map((row: Record<string, unknown>) => ({
          chunk: {
            id: String(row.id),
            document_id: String(row.document_id),
            user_id: params.userId,
            page_start: Number(row.page_start),
            page_end: Number(row.page_end),
            chapter_title: String(row.chapter_title || ""),
            chunk_index: Number(row.chunk_index),
            content: String(row.content),
            token_count: 0,
            metadata: (row.metadata as Record<string, unknown>) || {},
            created_at: "",
          },
          document_title:
            docMap.get(String(row.document_id)) || "Yüklenen Belge",
          score: Number(row.similarity || 0),
        }));
      }
    }

    // Hybrid vector + lexical retrieval across user's chunks
    let candidateChunks: DocumentChunk[] = [];
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      let q = supabase
        .from("document_chunks")
        .select("*")
        .eq("user_id", params.userId);
      if (params.documentIds && params.documentIds.length > 0) {
        q = q.in("document_id", params.documentIds);
      }
      const { data } = await q.limit(300);
      candidateChunks = (data as DocumentChunk[]) ?? [];
    } else {
      const db = readLocalDb();
      candidateChunks = db.document_chunks.filter(
        (c) =>
          c.user_id === params.userId &&
          (!params.documentIds ||
            params.documentIds.length === 0 ||
            params.documentIds.includes(c.document_id))
      );
    }

    const scored = candidateChunks.map((chunk) => {
      const lexScore = lexicalOverlapScore(
        params.query,
        `${chunk.chapter_title} ${chunk.content}`
      );
      const vecScore =
        params.queryEmbedding && chunk.embedding
          ? cosineSimilarity(params.queryEmbedding, chunk.embedding)
          : 0;
      const combinedScore =
        vecScore > 0 ? vecScore * 0.65 + lexScore * 0.35 : lexScore;

      return {
        chunk,
        document_title: docMap.get(chunk.document_id) || "Yüklenen Belge",
        score: combinedScore,
      };
    });

    scored.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
      return a.chunk.chunk_index - b.chunk.chunk_index;
    });

    return scored.slice(0, topK);
  },

  // ---------------------------------------------------------------------------
  // STUDY NOTES
  // ---------------------------------------------------------------------------
  async listStudyNotes(
    userId: string,
    documentId?: string
  ): Promise<StudyNote[]> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      let q = supabase
        .from("study_notes")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (documentId) q = q.eq("document_id", documentId);
      const { data } = await q;
      return (data as StudyNote[]) ?? [];
    }
    return readLocalDb()
      .study_notes.filter(
        (n) =>
          n.user_id === userId && (!documentId || n.document_id === documentId)
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getStudyNote(
    userId: string,
    noteId: string
  ): Promise<StudyNote | null> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("study_notes")
        .select("*")
        .eq("id", noteId)
        .eq("user_id", userId)
        .single();
      return (data as StudyNote) ?? null;
    }
    return (
      readLocalDb().study_notes.find(
        (n) => n.id === noteId && n.user_id === userId
      ) ?? null
    );
  },

  async createStudyNote(note: StudyNote): Promise<StudyNote> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("study_notes")
        .insert(note)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as StudyNote;
    }
    mutateLocalDb((db) => {
      db.study_notes.push(note);
    });
    return note;
  },

  async updateStudyNote(
    userId: string,
    noteId: string,
    patch: Partial<StudyNote>
  ): Promise<StudyNote | null> {
    const updatedAt = new Date().toISOString();
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("study_notes")
        .update({ ...patch, is_edited: true, updated_at: updatedAt })
        .eq("id", noteId)
        .eq("user_id", userId)
        .select("*")
        .single();
      return (data as StudyNote) ?? null;
    }
    return mutateLocalDb((db) => {
      const idx = db.study_notes.findIndex(
        (n) => n.id === noteId && n.user_id === userId
      );
      if (idx === -1) return null;
      db.study_notes[idx] = {
        ...db.study_notes[idx],
        ...patch,
        is_edited: true,
        updated_at: updatedAt,
      };
      return db.study_notes[idx];
    });
  },

  async deleteStudyNote(userId: string, noteId: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase
        .from("study_notes")
        .delete()
        .eq("id", noteId)
        .eq("user_id", userId);
      return !error;
    }
    return mutateLocalDb((db) => {
      const before = db.study_notes.length;
      db.study_notes = db.study_notes.filter(
        (n) => !(n.id === noteId && n.user_id === userId)
      );
      return db.study_notes.length < before;
    });
  },

  // ---------------------------------------------------------------------------
  // QUESTION BANKS & QUESTIONS
  // ---------------------------------------------------------------------------
  async listQuestionBanks(userId: string): Promise<QuestionBank[]> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("question_banks")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      return (data as QuestionBank[]) ?? [];
    }
    return readLocalDb()
      .question_banks.filter((b) => b.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async createQuestionBank(bank: QuestionBank): Promise<QuestionBank> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("question_banks")
        .insert(bank)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as QuestionBank;
    }
    mutateLocalDb((db) => {
      db.question_banks.push(bank);
    });
    return bank;
  },

  async updateQuestionBank(
    userId: string,
    bankId: string,
    patch: Partial<QuestionBank>
  ): Promise<QuestionBank | null> {
    const updatedAt = new Date().toISOString();
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("question_banks")
        .update({ ...patch, updated_at: updatedAt })
        .eq("id", bankId)
        .eq("user_id", userId)
        .select("*")
        .single();
      return (data as QuestionBank) ?? null;
    }
    return mutateLocalDb((db) => {
      const idx = db.question_banks.findIndex(
        (b) => b.id === bankId && b.user_id === userId
      );
      if (idx === -1) return null;
      db.question_banks[idx] = {
        ...db.question_banks[idx],
        ...patch,
        updated_at: updatedAt,
      };
      return db.question_banks[idx];
    });
  },

  async deleteQuestionBank(userId: string, bankId: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase
        .from("question_banks")
        .delete()
        .eq("id", bankId)
        .eq("user_id", userId);
      return !error;
    }
    return mutateLocalDb((db) => {
      const before = db.question_banks.length;
      db.question_banks = db.question_banks.filter(
        (b) => !(b.id === bankId && b.user_id === userId)
      );
      return db.question_banks.length < before;
    });
  },

  async listQuestions(
    userId: string,
    filters?: {
      documentId?: string;
      courseId?: string;
      questionType?: string;
      difficulty?: string;
      onlyFavorites?: boolean;
      bankId?: string;
    }
  ): Promise<Question[]> {
    let items: Question[] = [];
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      let q = supabase
        .from("questions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (filters?.documentId) q = q.eq("document_id", filters.documentId);
      if (filters?.courseId) q = q.eq("course_id", filters.courseId);
      if (filters?.questionType) q = q.eq("question_type", filters.questionType);
      if (filters?.difficulty) q = q.eq("difficulty", filters.difficulty);
      if (filters?.onlyFavorites) q = q.eq("is_favorite", true);
      const { data } = await q;
      items = (data as Question[]) ?? [];
    } else {
      items = readLocalDb()
        .questions.filter((q) => {
          if (q.user_id !== userId) return false;
          if (filters?.documentId && q.document_id !== filters.documentId)
            return false;
          if (filters?.courseId && q.course_id !== filters.courseId)
            return false;
          if (filters?.questionType && q.question_type !== filters.questionType)
            return false;
          if (filters?.difficulty && q.difficulty !== filters.difficulty)
            return false;
          if (filters?.onlyFavorites && !q.is_favorite) return false;
          return true;
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    if (filters?.bankId) {
      const banks = await this.listQuestionBanks(userId);
      const targetBank = banks.find((b) => b.id === filters.bankId);
      if (targetBank) {
        if (targetBank.is_custom_collection) {
          const idSet = new Set(targetBank.question_ids);
          items = items.filter((q) => idSet.has(q.id));
        } else {
          items = items.filter((q) => q.question_bank_id === targetBank.id);
        }
      }
    }

    return items;
  },

  async getQuestion(userId: string, questionId: string): Promise<Question | null> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("questions")
        .select("*")
        .eq("id", questionId)
        .eq("user_id", userId)
        .single();
      return (data as Question) ?? null;
    }
    return (
      readLocalDb().questions.find(
        (q) => q.id === questionId && q.user_id === userId
      ) ?? null
    );
  },

  async saveQuestions(questions: Question[]): Promise<Question[]> {
    if (questions.length === 0) return [];
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("questions")
        .insert(questions)
        .select("*");
      if (error) throw new Error(error.message);
      return (data as Question[]) ?? questions;
    }
    mutateLocalDb((db) => {
      db.questions.push(...questions);
    });
    return questions;
  },

  async toggleFavoriteQuestion(
    userId: string,
    questionId: string
  ): Promise<Question | null> {
    const existing = await this.getQuestion(userId, questionId);
    if (!existing) return null;
    const nextVal = !existing.is_favorite;

    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("questions")
        .update({ is_favorite: nextVal })
        .eq("id", questionId)
        .eq("user_id", userId)
        .select("*")
        .single();
      return (data as Question) ?? null;
    }

    return mutateLocalDb((db) => {
      const idx = db.questions.findIndex(
        (q) => q.id === questionId && q.user_id === userId
      );
      if (idx === -1) return null;
      db.questions[idx].is_favorite = nextVal;
      return db.questions[idx];
    });
  },

  async deleteQuestion(userId: string, questionId: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase
        .from("questions")
        .delete()
        .eq("id", questionId)
        .eq("user_id", userId);
      return !error;
    }
    return mutateLocalDb((db) => {
      const before = db.questions.length;
      db.questions = db.questions.filter(
        (q) => !(q.id === questionId && q.user_id === userId)
      );
      return db.questions.length < before;
    });
  },

  // ---------------------------------------------------------------------------
  // EXAMS, EXAM QUESTIONS, ATTEMPTS & ANSWERS
  // ---------------------------------------------------------------------------
  async listExams(userId: string): Promise<Exam[]> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("exams")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      return (data as Exam[]) ?? [];
    }
    return readLocalDb()
      .exams.filter((e) => e.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getExamWithQuestions(
    userId: string,
    examId: string
  ): Promise<{ exam: Exam; items: ExamQuestionItem[] } | null> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data: exam } = await supabase
        .from("exams")
        .select("*")
        .eq("id", examId)
        .eq("user_id", userId)
        .single();
      if (!exam) return null;

      const { data: eqs } = await supabase
        .from("exam_questions")
        .select("*")
        .eq("exam_id", examId)
        .eq("user_id", userId)
        .order("order_index", { ascending: true });

      const qIds = (eqs ?? []).map((i: ExamQuestionItem) => i.question_id);
      const { data: qs } = qIds.length
        ? await supabase
            .from("questions")
            .select("*")
            .in("id", qIds)
            .eq("user_id", userId)
        : { data: [] };

      const qMap = new Map((qs ?? []).map((q: Question) => [q.id, q]));
      const items: ExamQuestionItem[] = (eqs ?? []).map(
        (eq: ExamQuestionItem) => ({
          ...eq,
          question: qMap.get(eq.question_id),
        })
      );
      return { exam: exam as Exam, items };
    }

    const db = readLocalDb();
    const exam = db.exams.find(
      (e) => e.id === examId && e.user_id === userId
    );
    if (!exam) return null;

    const eqs = db.exam_questions
      .filter((eq) => eq.exam_id === examId && eq.user_id === userId)
      .sort((a, b) => a.order_index - b.order_index);

    const qMap = new Map(
      db.questions
        .filter((q) => q.user_id === userId)
        .map((q) => [q.id, q])
    );

    const items = eqs.map((eq) => ({
      ...eq,
      question: qMap.get(eq.question_id),
    }));

    return { exam, items };
  },

  async createExam(
    exam: Exam,
    examQuestions: ExamQuestionItem[]
  ): Promise<Exam> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("exams")
        .insert(exam)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      if (examQuestions.length > 0) {
        const { error: eqErr } = await supabase
          .from("exam_questions")
          .insert(examQuestions);
        if (eqErr) throw new Error(eqErr.message);
      }
      return data as Exam;
    }

    mutateLocalDb((db) => {
      db.exams.push(exam);
      db.exam_questions.push(...examQuestions);
    });
    return exam;
  },

  async deleteExam(userId: string, examId: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase
        .from("exams")
        .delete()
        .eq("id", examId)
        .eq("user_id", userId);
      return !error;
    }
    return mutateLocalDb((db) => {
      const before = db.exams.length;
      db.exams = db.exams.filter(
        (e) => !(e.id === examId && e.user_id === userId)
      );
      db.exam_questions = db.exam_questions.filter(
        (eq) => eq.exam_id !== examId
      );
      const attemptIds = new Set(
        db.exam_attempts
          .filter((a) => a.exam_id === examId)
          .map((a) => a.id)
      );
      db.exam_attempts = db.exam_attempts.filter(
        (a) => a.exam_id !== examId
      );
      db.exam_answers = db.exam_answers.filter(
        (ans) => !attemptIds.has(ans.attempt_id)
      );
      return db.exams.length < before;
    });
  },

  async listExamAttempts(
    userId: string,
    examId?: string
  ): Promise<ExamAttempt[]> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      let q = supabase
        .from("exam_attempts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (examId) q = q.eq("exam_id", examId);
      const { data } = await q;
      return (data as ExamAttempt[]) ?? [];
    }
    return readLocalDb()
      .exam_attempts.filter(
        (a) => a.user_id === userId && (!examId || a.exam_id === examId)
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getExamAttemptWithAnswers(
    userId: string,
    attemptId: string
  ): Promise<{ attempt: ExamAttempt; answers: ExamAnswer[] } | null> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data: attempt } = await supabase
        .from("exam_attempts")
        .select("*")
        .eq("id", attemptId)
        .eq("user_id", userId)
        .single();
      if (!attempt) return null;
      const { data: answers } = await supabase
        .from("exam_answers")
        .select("*")
        .eq("attempt_id", attemptId)
        .eq("user_id", userId);
      return {
        attempt: attempt as ExamAttempt,
        answers: (answers as ExamAnswer[]) ?? [],
      };
    }

    const db = readLocalDb();
    const attempt = db.exam_attempts.find(
      (a) => a.id === attemptId && a.user_id === userId
    );
    if (!attempt) return null;
    const answers = db.exam_answers.filter(
      (ans) => ans.attempt_id === attemptId && ans.user_id === userId
    );
    return { attempt, answers };
  },

  async createExamAttempt(attempt: ExamAttempt): Promise<ExamAttempt> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("exam_attempts")
        .insert(attempt)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as ExamAttempt;
    }
    mutateLocalDb((db) => {
      db.exam_attempts.push(attempt);
    });
    return attempt;
  },

  async updateExamAttempt(
    userId: string,
    attemptId: string,
    patch: Partial<ExamAttempt>
  ): Promise<ExamAttempt | null> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("exam_attempts")
        .update(patch)
        .eq("id", attemptId)
        .eq("user_id", userId)
        .select("*")
        .single();
      return (data as ExamAttempt) ?? null;
    }
    return mutateLocalDb((db) => {
      const idx = db.exam_attempts.findIndex(
        (a) => a.id === attemptId && a.user_id === userId
      );
      if (idx === -1) return null;
      db.exam_attempts[idx] = { ...db.exam_attempts[idx], ...patch };
      return db.exam_attempts[idx];
    });
  },

  async upsertExamAnswer(answer: ExamAnswer): Promise<ExamAnswer> {
    const updatedAt = new Date().toISOString();
    const record: ExamAnswer = { ...answer, updated_at: updatedAt };

    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("exam_answers")
        .upsert(record, { onConflict: "attempt_id,question_id" })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as ExamAnswer;
    }

    return mutateLocalDb((db) => {
      const idx = db.exam_answers.findIndex(
        (a) =>
          a.attempt_id === record.attempt_id &&
          a.question_id === record.question_id &&
          a.user_id === record.user_id
      );
      if (idx === -1) {
        db.exam_answers.push(record);
        return record;
      }
      db.exam_answers[idx] = {
        ...db.exam_answers[idx],
        ...record,
        id: db.exam_answers[idx].id,
      };
      return db.exam_answers[idx];
    });
  },

  // ---------------------------------------------------------------------------
  // STUDY SESSIONS & CHAT MESSAGES
  // ---------------------------------------------------------------------------
  async logStudySession(
    input: Omit<StudySession, "id" | "created_at">
  ): Promise<StudySession> {
    const session: StudySession = {
      ...input,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("study_sessions")
        .insert(session)
        .select("*")
        .single();
      return (data as StudySession) ?? session;
    }
    mutateLocalDb((db) => {
      db.study_sessions.push(session);
    });
    return session;
  },

  async listStudySessions(
    userId: string,
    limit = 50
  ): Promise<StudySession[]> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("study_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return (data as StudySession[]) ?? [];
    }
    return readLocalDb()
      .study_sessions.filter((s) => s.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  },

  async listChatMessages(
    userId: string,
    sessionId: string
  ): Promise<ChatMessage[]> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      return (data as ChatMessage[]) ?? [];
    }
    return readLocalDb()
      .chat_messages.filter(
        (m) => m.user_id === userId && m.session_id === sessionId
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },

  async listUserChatSessions(
    userId: string
  ): Promise<
    {
      session_id: string;
      document_id: string | null;
      last_message: string;
      updated_at: string;
      message_count: number;
    }[]
  > {
    let allMessages: ChatMessage[] = [];
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500);
      allMessages = (data as ChatMessage[]) ?? [];
    } else {
      allMessages = readLocalDb()
        .chat_messages.filter((m) => m.user_id === userId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    const grouped = new Map<
      string,
      {
        session_id: string;
        document_id: string | null;
        last_message: string;
        updated_at: string;
        message_count: number;
      }
    >();

    for (const msg of allMessages) {
      const existing = grouped.get(msg.session_id);
      if (!existing) {
        grouped.set(msg.session_id, {
          session_id: msg.session_id,
          document_id: msg.document_id,
          last_message: msg.content.slice(0, 120),
          updated_at: msg.created_at,
          message_count: 1,
        });
      } else {
        existing.message_count += 1;
      }
    }

    return Array.from(grouped.values()).sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at)
    );
  },

  async saveChatMessage(message: ChatMessage): Promise<ChatMessage> {
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("chat_messages")
        .insert(message)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as ChatMessage;
    }
    mutateLocalDb((db) => {
      db.chat_messages.push(message);
    });
    return message;
  },
};

