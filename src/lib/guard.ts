/**
 * Lightweight, per-instance protection for a public tool that spends API credits.
 * On serverless this is best-effort (each instance has its own memory). For stricter
 * limits, swap these for Upstash Redis / Vercel KV — the interface stays the same.
 */
import type { Analysis } from "./types";

const HOUR = 3600_000;
const LIMIT_PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR || 5);
const CACHE_TTL = Number(process.env.CACHE_TTL_HOURS || 6) * HOUR;

const hits = new Map<string, number[]>();

export function rateLimit(ip: string): { ok: true } | { ok: false; retryMins: number } {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < HOUR);
  if (recent.length >= LIMIT_PER_HOUR) {
    return { ok: false, retryMins: Math.ceil((HOUR - (now - recent[0])) / 60000) };
  }
  recent.push(now);
  hits.set(ip, recent);
  return { ok: true };
}

const cache = new Map<string, { at: number; analysis: Analysis }>();

export function getCached(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return hit.analysis;
}

export function setCached(key: string, analysis: Analysis) {
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), analysis });
}
