import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { generateEmbeddings } from "@/lib/ai/provider";
import { enrichDocumentMetadataWithAI } from "@/lib/ai/services";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";
import { extractAndChunkPdf } from "@/lib/pdf/processor";
import { checkRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { validateDocumentFile } from "@/lib/security/validation";
import { sanitizeFileName } from "@/lib/utils";
import type { DocumentRecord } from "@/types/database";

export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const courseId = req.nextUrl.searchParams.get("courseId");
  const documents = await repository.listDocuments(user.id, courseId);
  return NextResponse.json({ documents });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const rl = checkRateLimit({
    key: `upload:${user.id}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const courseIdRaw = formData.get("courseId");
    const customTitleRaw = formData.get("title");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Lütfen yüklenecek bir PDF dosyası seçiniz." },
        { status: 400 }
      );
    }

    const safeFileName = sanitizeFileName(file.name);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const validation = validateDocumentFile(safeFileName, file.type, buffer);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || "Geçersiz dosya." },
        { status: 400 }
      );
    }

    const documentId = crypto.randomUUID();
    const now = new Date().toISOString();
    const courseId =
      typeof courseIdRaw === "string" && courseIdRaw.trim().length > 0
        ? courseIdRaw.trim()
        : null;
    const baseTitle =
      typeof customTitleRaw === "string" && customTitleRaw.trim().length > 0
        ? customTitleRaw.trim()
        : safeFileName.replace(/\.(pdf|docx|pptx)$/i, "");

    // 1. Store file binary securely
    const ext = safeFileName.split(".").pop() || "pdf";
    const storagePath = await repository.uploadPdfBinary(
      user.id,
      `${documentId}.${ext}`,
      buffer
    );

    // 2. Create initial document record in processing state
    const initialDoc: DocumentRecord = {
      id: documentId,
      user_id: user.id,
      course_id: courseId,
      title: baseTitle,
      file_name: safeFileName,
      storage_path: storagePath,
      file_size: buffer.byteLength,
      page_count: 0,
      status: "processing",
      ocr_applied: false,
      extracted_metadata: {
        chapters: [],
        headings: [],
        definitions: [],
        formulas: [],
        key_concepts: [],
        concept_relations: [],
        important_topics: [],
        summary: "",
      },
      error_message: null,
      created_at: now,
      updated_at: now,
    };

    await repository.createDocument(initialDoc);

    // 3. Extract text page-by-page, run OCR if scanned, detect headings & chunk
    try {
      const processed = await extractAndChunkPdf({
        buffer,
        documentId,
        userId: user.id,
        fileName: safeFileName,
      });

      // 4. Generate embeddings for chunks (batch in groups of 32)
      const BATCH_SIZE = 32;
      for (let i = 0; i < processed.chunks.length; i += BATCH_SIZE) {
        const slice = processed.chunks.slice(i, i + BATCH_SIZE);
        const embeddings = await generateEmbeddings(
          slice.map((c) => c.content),
          user.ai_preferences?.preferred_provider
        );
        slice.forEach((chunk, idx) => {
          chunk.embedding = embeddings[idx] ?? null;
        });
      }

      await repository.saveDocumentPages(processed.pages);
      await repository.saveDocumentChunks(processed.chunks);

      // 5. Enrich structure (chapters, definitions, formulas, concept relations) via AI if configured
      const enrichedMetadata = await enrichDocumentMetadataWithAI({
        chunks: processed.chunks,
        pageCount: processed.pageCount,
        baseMetadata: processed.heuristicMetadata,
        user,
      });

      const updatedDoc = await repository.updateDocument(user.id, documentId, {
        page_count: processed.pageCount,
        status: "ready",
        ocr_applied: processed.ocrApplied,
        extracted_metadata: enrichedMetadata,
        error_message: null,
      });

      await repository.logStudySession({
        user_id: user.id,
        document_id: documentId,
        course_id: courseId,
        activity_type: "upload",
        title: `"${baseTitle}" yüklendi ve analiz edildi`,
        duration_minutes: 5,
        metadata: {
          page_count: processed.pageCount,
          chunk_count: processed.chunks.length,
          ocr_applied: processed.ocrApplied,
        },
      });

      return NextResponse.json(
        {
          document: updatedDoc ?? initialDoc,
          chunkCount: processed.chunks.length,
        },
        { status: 201 }
      );
    } catch (procErr) {
      const errMsg =
        procErr instanceof Error
          ? procErr.message
          : "Belge işlenirken hata oluştu.";
      await repository.updateDocument(user.id, documentId, {
        status: "failed",
        error_message: errMsg,
      });
      return NextResponse.json({ error: errMsg }, { status: 422 });
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "PDF yükleme işlemi başarısız oldu.",
      },
      { status: 500 }
    );
  }
}

