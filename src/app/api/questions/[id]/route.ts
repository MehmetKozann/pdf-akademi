import { NextRequest, NextResponse } from "next/server";
import { AIConfigurationError } from "@/lib/ai/provider";
import { evaluateClassicalAnswerWithAI } from "@/lib/ai/services";
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
    toggleFavorite?: boolean;
    evaluateAnswer?: string;
  };

  if (body.toggleFavorite) {
    const updated = await repository.toggleFavoriteQuestion(user.id, id);
    if (!updated) {
      return NextResponse.json({ error: "Soru bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ question: updated });
  }

  if (typeof body.evaluateAnswer === "string") {
    const question = await repository.getQuestion(user.id, id);
    if (!question) {
      return NextResponse.json({ error: "Soru bulunamadı." }, { status: 404 });
    }
    try {
      const result = await evaluateClassicalAnswerWithAI({
        user,
        question,
        studentAnswer: body.evaluateAnswer,
        maxPoints: 10,
      });
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Cevap değerlendirilirken hata oluştu.",
          needsAiConfig: err instanceof AIConfigurationError,
        },
        { status: err instanceof AIConfigurationError ? 503 : 500 }
      );
    }
  }

  return NextResponse.json({ error: "Geçersiz işlem." }, { status: 400 });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const deleted = await repository.deleteQuestion(user.id, id);
  if (!deleted) {
    return NextResponse.json({ error: "Soru bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

