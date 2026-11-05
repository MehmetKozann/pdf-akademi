import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config/server-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  hashPassword,
  mutateLocalDb,
  readLocalDb,
  verifyPassword,
} from "@/lib/db/local-store";
import type { UserProfile } from "@/types/database";

const SESSION_COOKIE_NAME = "akademik_ai_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 days

function getSessionSecret(): string {
  return (
    process.env.AUTH_SESSION_SECRET?.trim() ||
    "akademik-ai-local-persistent-hmac-secret-key-2026"
  );
}

function signSessionToken(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString(
    "base64url"
  );
  const sig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { uid: string; exp: number };
    if (!decoded.uid || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<UserProfile> {
  const db = readLocalDb();
  if (db.users.length > 0) {
    return db.users[0];
  }

  const now = new Date().toISOString();
  const defaultUserId = "00000000-0000-4000-8000-000000000001";
  const defaultUser: UserProfile = {
    id: defaultUserId,
    email: "ogrenci@akademikai.local",
    full_name: "Öğrenci",
    university: "",
    department: "",
    theme_preference: "light",
    ai_preferences: {},
    created_at: now,
    updated_at: now,
  };

  mutateLocalDb((store) => {
    if (store.users.length === 0) {
      store.users.push(defaultUser);
    }
  });

  return readLocalDb().users[0] ?? defaultUser;
}

export async function requireAuthUser(): Promise<
  | { user: UserProfile; errorResponse: null }
  | { user: null; errorResponse: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        { error: "Bu işlem için oturum açmanız gerekiyor." },
        { status: 401 }
      ),
    };
  }
  return { user, errorResponse: null };
}

export async function registerUserAccount(input: {
  email: string;
  password: string;
  full_name: string;
  university?: string;
  department?: string;
}): Promise<{ user?: UserProfile; error?: string }> {
  const emailNormalized = input.email.toLowerCase().trim();

  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: emailNormalized,
      password: input.password,
      options: {
        data: {
          full_name: input.full_name,
          university: input.university || "",
          department: input.department || "",
        },
      },
    });
    if (error || !data.user) {
      return {
        error:
          error?.message === "User already registered"
            ? "Bu e-posta adresi ile kayıtlı bir hesap zaten mevcut."
            : error?.message || "Kayıt işlemi başarısız oldu.",
      };
    }

    const now = new Date().toISOString();
    const profile: UserProfile = {
      id: data.user.id,
      email: emailNormalized,
      full_name: input.full_name,
      university: input.university || "",
      department: input.department || "",
      theme_preference: "light",
      ai_preferences: {},
      created_at: now,
      updated_at: now,
    };
    await supabase.from("users").upsert(profile);
    return { user: profile };
  }

  const existing = readLocalDb().users.find(
    (u) => u.email.toLowerCase() === emailNormalized
  );
  if (existing) {
    return { error: "Bu e-posta adresi ile kayıtlı bir hesap zaten mevcut." };
  }

  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const { salt, hash } = hashPassword(input.password);

  const user: UserProfile = {
    id: userId,
    email: emailNormalized,
    full_name: input.full_name.trim(),
    university: input.university?.trim() || "",
    department: input.department?.trim() || "",
    theme_preference: "light",
    ai_preferences: {},
    created_at: now,
    updated_at: now,
  };

  mutateLocalDb((db) => {
    db.users.push(user);
    db.auth_credentials.push({
      user_id: userId,
      email: emailNormalized,
      password_salt: salt,
      password_hash: hash,
    });
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, signSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return { user };
}

export async function loginUserAccount(input: {
  email: string;
  password: string;
}): Promise<{ user?: UserProfile; error?: string }> {
  const emailNormalized = input.email.toLowerCase().trim();

  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailNormalized,
      password: input.password,
    });
    if (error || !data.user) {
      return { error: "E-posta adresi veya şifre hatalı." };
    }
    const profile = await getCurrentUser();
    return { user: profile || undefined };
  }

  const db = readLocalDb();
  const cred = db.auth_credentials.find(
    (c) => c.email.toLowerCase() === emailNormalized
  );
  if (!cred || !verifyPassword(input.password, cred.password_salt, cred.password_hash)) {
    return { error: "E-posta adresi veya şifre hatalı." };
  }

  const user = db.users.find((u) => u.id === cred.user_id);
  if (!user) {
    return { error: "Kullanıcı profili bulunamadı." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, signSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return { user };
}

export async function logoutUserAccount(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

