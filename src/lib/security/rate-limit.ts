import { NextResponse } from "next/server";

interface BucketEntry {
  timestamps: number[];
}

const buckets = new Map<string, BucketEntry>();

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export function checkRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = buckets.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0] ?? now;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((windowMs - (now - oldest)) / 1000)
    );
    buckets.set(key, entry);
    return { allowed: false, retryAfterSec };
  }

  entry.timestamps.push(now);
  buckets.set(key, entry);
  return { allowed: true, retryAfterSec: 0 };
}

export function rateLimitResponse(retryAfterSec: number) {
  return NextResponse.json(
    {
      error: `Çok fazla istek gönderildi. Lütfen ${retryAfterSec} saniye bekleyip tekrar deneyin.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
      },
    }
  );
}

