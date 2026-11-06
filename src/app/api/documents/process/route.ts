import { NextRequest, NextResponse } from "next/server";
import { generateEmbeddings } from "@/lib/ai/provider";
import { enrichDocumentMetadataWithAI } from "@/lib/ai/services";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";
import { extractAndChunkPdf } from "@/lib/pdf/processor";
import type { DocumentRecord } from "@/types/database";

export const maxDuration = 60; // Allow 60s for PDF analysis on Vercel

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  try {
    const { documentId, fileName, fileSize, courseId, title, storagePath } =
      await req.json();

    if (!documentId || !storagePath) {
      return NextResponse.json(
        { error: "Eksik parametreler." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const baseTitle =
      typeof title === "string" && title.trim().length > 0
        ? title.trim()
        : fileName.replace(/\.pdf$/i, "");

    // 1. Create initial document record
    const initialDoc: DocumentRecord = {
      id: documentId,
      user_id: user.id,
      course_id: courseId || null,
      title: baseTitle,
      file_name: fileName,
      storage_path: storagePath,
      file_size: Number(fileSize) || 0,
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

    // 2. Download the uploaded binary from storage
    const buffer = await repository.downloadPdfBinary(user.id, storagePath);
    if (!buffer) {
      await repository.updateDocument(user.id, documentId, {
        status: "failed",
        error_message: "Depolanan PDF dosyasına erişilemedi.",
      });
      return NextResponse.json(
        { error: "Dosyaya erişilemedi." },
        { status: 404 }
      );
    }

    // 3. Extract text and chunk
    try {
      const processed = await extractAndChunkPdf({
        buffer,
        documentId,
        userId: user.id,
      });

      // 4. Generate embeddings (batch 32)
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

      // 5. Enrich metadata via AI if configured
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
        course_id: courseId || null,
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
            : "PDF işleme işlemi başarısız oldu.",
      },
      { status: 500 }
    );
  }
}
