import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";
import { createCollectionSchema } from "@/lib/security/validation";

export async function GET() {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const banks = await repository.listQuestionBanks(user.id);
  return NextResponse.json({ banks });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const body = await req.json();
  const parsed = createCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Geçersiz koleksiyon bilgisi." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const bank = await repository.createQuestionBank({
    id: crypto.randomUUID(),
    user_id: user.id,
    course_id: parsed.data.courseId ?? null,
    document_id: null,
    title: parsed.data.title,
    description: parsed.data.description,
    is_custom_collection: true,
    question_ids: parsed.data.questionIds,
    created_at: now,
    updated_at: now,
  });

  return NextResponse.json({ bank }, { status: 201 });
}

