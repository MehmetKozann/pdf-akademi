import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AIConfigurationError } from "@/lib/ai/provider";
import { answerStudyChatWithAI } from "@/lib/ai/services";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";
import { checkRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { chatMessageSchema } from "@/lib/security/validation";

export async function GET(req: NextRequest) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (sessionId) {
    const messages = await repository.listChatMessages(user.id, sessionId);
    return NextResponse.json({ messages });
  }

  const sessions = await repository.listUserChatSessions(user.id);
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const rl = checkRateLimit({
    key: `chat:${user.id}`,
    limit: 25,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  try {
    const body = await req.json();
    const parsed = chatMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Geçersiz mesaj." },
        { status: 400 }
      );
    }

    const userMsg = await repository.saveChatMessage({
      id: crypto.randomUUID(),
      user_id: user.id,
      session_id: parsed.data.sessionId,
      document_id: parsed.data.documentId ?? null,
      course_id: parsed.data.courseId ?? null,
      role: "user",
      content: parsed.data.message,
      citations: [],
      has_external_knowledge: false,
      created_at: new Date().toISOString(),
    });

    const aiResponse = await answerStudyChatWithAI({
      user,
      sessionId: parsed.data.sessionId,
      message: parsed.data.message,
      documentId: parsed.data.documentId,
      courseId: parsed.data.courseId,
    });

    const assistantMsg = await repository.saveChatMessage({
      id: crypto.randomUUID(),
      user_id: user.id,
      session_id: parsed.data.sessionId,
      document_id: parsed.data.documentId ?? null,
      course_id: parsed.data.courseId ?? null,
      role: "assistant",
      content: aiResponse.reply,
      citations: aiResponse.citations,
      has_external_knowledge: aiResponse.hasExternalKnowledge,
      created_at: new Date().toISOString(),
    });

    await repository.logStudySession({
      user_id: user.id,
      document_id: parsed.data.documentId ?? null,
      course_id: parsed.data.courseId ?? null,
      activity_type: "ai_chat",
      title: `YZ Çalışma Sohbeti: "${parsed.data.message.slice(0, 50)}"`,
      duration_minutes: 3,
      metadata: { session_id: parsed.data.sessionId },
    });

    return NextResponse.json({
      userMessage: userMsg,
      assistantMessage: assistantMsg,
    });
  } catch (err) {
    const status = err instanceof AIConfigurationError ? 503 : 500;
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Yapay zeka yanıtı alınırken bir hata oluştu.",
        needsAiConfig: err instanceof AIConfigurationError,
      },
      { status }
    );
  }
}

