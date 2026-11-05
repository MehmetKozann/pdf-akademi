import { NextRequest, NextResponse } from "next/server";
import { loginUserAccount } from "@/lib/auth/session";
import { checkRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
import { loginSchema } from "@/lib/security/validation";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  const rl = checkRateLimit({
    key: `login:${ip}`,
    limit: 15,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Geçersiz giriş bilgileri." },
        { status: 400 }
      );
    }

    const { user, error } = await loginUserAccount(parsed.data);
    if (error || !user) {
      return NextResponse.json(
        { error: error || "E-posta veya şifre hatalı." },
        { status: 401 }
      );
    }

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json(
      { error: "Giriş yapılırken beklenmeyen bir hata oluştu." },
      { status: 500 }
    );
  }
}

