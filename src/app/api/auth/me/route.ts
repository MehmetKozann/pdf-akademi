import { NextResponse } from "next/server";
import { getCurrentUser, logoutUserAccount } from "@/lib/auth/session";
import { getPublicSystemStatus } from "@/lib/config/server-config";

export async function POST() {
  await logoutUserAccount();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({
    user,
    system: getPublicSystemStatus(),
  });
}

