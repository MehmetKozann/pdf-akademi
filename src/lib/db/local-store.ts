import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
  StudyNote,
  StudySession,
  UserProfile,
} from "@/types/database";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

export interface LocalAuthCredential {
  user_id: string;
  email: string;
  password_salt: string;
  password_hash: string;
}

export interface LocalDatabaseSchema {
  users: UserProfile[];
  auth_credentials: LocalAuthCredential[];
  courses: Course[];
  documents: DocumentRecord[];
  document_pages: DocumentPage[];
  document_chunks: DocumentChunk[];
  study_notes: StudyNote[];
  question_banks: QuestionBank[];
  questions: Question[];
  exams: Exam[];
  exam_questions: ExamQuestionItem[];
  exam_attempts: ExamAttempt[];
  exam_answers: ExamAnswer[];
  study_sessions: StudySession[];
  chat_messages: ChatMessage[];
}

function createEmptyDb(): LocalDatabaseSchema {
  return {
    users: [],
    auth_credentials: [],
    courses: [],
    documents: [],
    document_pages: [],
    document_chunks: [],
    study_notes: [],
    question_banks: [],
    questions: [],
    exams: [],
    exam_questions: [],
    exam_attempts: [],
    exam_answers: [],
    study_sessions: [],
    chat_messages: [],
  };
}

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export function readLocalDb(): LocalDatabaseSchema {
  ensureDirectories();
  if (!fs.existsSync(DB_FILE)) {
    const empty = createEmptyDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalDatabaseSchema>;
    return {
      ...createEmptyDb(),
      ...parsed,
    };
  } catch {
    return createEmptyDb();
  }
}

export function writeLocalDb(data: LocalDatabaseSchema): void {
  ensureDirectories();
  const tmpFile = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmpFile, DB_FILE);
}

export function mutateLocalDb<T>(
  mutator: (db: LocalDatabaseSchema) => T
): T {
  const db = readLocalDb();
  const result = mutator(db);
  writeLocalDb(db);
  return result;
}

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string
): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function saveLocalPdfBuffer(
  storagePath: string,
  buffer: Buffer
): void {
  ensureDirectories();
  const safeRel = storagePath.replace(/\.\./g, "");
  const fullPath = path.join(UPLOADS_DIR, safeRel);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, buffer);
}

export function readLocalPdfBuffer(storagePath: string): Buffer | null {
  ensureDirectories();
  const safeRel = storagePath.replace(/\.\./g, "");
  const fullPath = path.join(UPLOADS_DIR, safeRel);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath);
}

export function deleteLocalPdfBuffer(storagePath: string): void {
  ensureDirectories();
  const safeRel = storagePath.replace(/\.\./g, "");
  const fullPath = path.join(UPLOADS_DIR, safeRel);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

