import { NextRequest, NextResponse } from "next/server";
import { registerUserAccount } from "@/lib/auth/session";
import { checkRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { registerSchema } from "@/lib/security/validation";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  const rl = checkRateLimit({
    key: `register:${ip}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Geçersiz kayıt bilgileri." },
        { status: 400 }
      );
    }

    const { user, error } = await registerUserAccount(parsed.data);
    if (error || !user) {
      return NextResponse.json(
        { error: error || "Kayıt oluşturulamadı." },
        { status: 400 }
      );
    }

    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Kayıt sırasında beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}

