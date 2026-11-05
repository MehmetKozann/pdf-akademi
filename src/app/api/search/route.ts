import { NextRequest, NextResponse } from "next/server";
import { generateEmbeddings } from "@/lib/ai/provider";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";
import { normalizeTurkish } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const query = req.nextUrl.searchParams.get("q")?.trim() || "";
  const courseId = req.nextUrl.searchParams.get("courseId")?.trim() || undefined;

  if (query.length < 2) {
    return NextResponse.json({
      documents: [],
      chunks: [],
      notes: [],
      questions: [],
    });
  }

  const normQ = normalizeTurkish(query);
  const allDocs = await repository.listDocuments(user.id, courseId || null);
  const matchingDocs = allDocs.filter(
    (d) =>
      normalizeTurkish(d.title).includes(normQ) ||
      normalizeTurkish(d.file_name).includes(normQ) ||
      normalizeTurkish(d.extracted_metadata?.summary || "").includes(normQ) ||
      d.extracted_metadata?.key_concepts?.some((k) =>
        normalizeTurkish(k).includes(normQ)
      )
  );

  const [qEmb] = await generateEmbeddings(
    [query],
    user.ai_preferences?.preferred_provider
  );
  const retrievedChunks = await repository.retrieveRelevantChunks({
    userId: user.id,
    query,
    queryEmbedding: qEmb,
    documentIds: courseId ? allDocs.map((d) => d.id) : undefined,
    topK: 10,
  });

  const allNotes = await repository.listStudyNotes(user.id);
  const matchingNotes = allNotes
    .filter(
      (n) =>
        normalizeTurkish(n.title).includes(normQ) ||
        normalizeTurkish(n.content_markdown).includes(normQ)
    )
    .slice(0, 6);

  const allQuestions = await repository.listQuestions(user.id, {
    courseId,
  });
  const matchingQuestions = allQuestions
    .filter(
      (q) =>
        normalizeTurkish(q.question_text).includes(normQ) ||
        normalizeTurkish(q.topic).includes(normQ)
    )
    .slice(0, 8);

  return NextResponse.json({
    documents: matchingDocs.slice(0, 8),
    chunks: retrievedChunks
      .filter((r) => r.score > 0.05)
      .map((r) => ({
        id: r.chunk.id,
        document_id: r.chunk.document_id,
        document_title: r.document_title,
        page_start: r.chunk.page_start,
        page_end: r.chunk.page_end,
        chapter_title: r.chunk.chapter_title,
        excerpt: r.chunk.content.slice(0, 280),
        score: r.score,
      })),
    notes: matchingNotes,
    questions: matchingQuestions,
  });
}

