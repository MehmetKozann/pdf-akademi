import { NextResponse } from "next/server";
import { logoutUserAccount } from "@/lib/auth/session";

export async function POST() {
  await logoutUserAccount();
  return NextResponse.json({ ok: true });
}

