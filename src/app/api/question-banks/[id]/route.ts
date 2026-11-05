import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const body = (await req.json()) as {
    addQuestionId?: string;
    removeQuestionId?: string;
    title?: string;
  };

  const banks = await repository.listQuestionBanks(user.id);
  const bank = banks.find((b) => b.id === id);
  if (!bank) {
    return NextResponse.json({ error: "Koleksiyon bulunamadı." }, { status: 404 });
  }

  let nextIds = [...bank.question_ids];
  if (body.addQuestionId && !nextIds.includes(body.addQuestionId)) {
    nextIds.push(body.addQuestionId);
  }
  if (body.removeQuestionId) {
    nextIds = nextIds.filter((qid) => qid !== body.removeQuestionId);
  }

  const updated = await repository.updateQuestionBank(user.id, id, {
    question_ids: nextIds,
    ...(body.title ? { title: body.title.trim() } : {}),
  });

  return NextResponse.json({ bank: updated });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const deleted = await repository.deleteQuestionBank(user.id, id);
  if (!deleted) {
    return NextResponse.json({ error: "Koleksiyon bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

