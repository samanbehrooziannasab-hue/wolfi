// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — shared utilities
// AES-256-GCM secret encryption, token generation, hashing, safe JSON.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import { config } from "./config.js";

// ── Secret encryption at rest (AES-256-GCM) ─────────────────────────────────
function encKey(): Buffer {
  // Derive a stable 32-byte key from the configured encryption key.
  return crypto.createHash("sha256").update(config.encryptionKey).digest();
}

/** Encrypt a secret → "iv:tag:ciphertext" (base64). Never store plain text. */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/** Decrypt a secret produced by encryptSecret. */
export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) return "";
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

// ── Tokens & hashes ──────────────────────────────────────────────────────────
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function hmacSha256(key: string, data: string): string {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

/** Sign a session/JWT-like token with HMAC: payload.signature */
export function signToken(payload: Record<string, unknown>, ttlMs: number): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const exp = Date.now() + ttlMs;
  const data = `${body}.${exp}`;
  const sig = hmacSha256(config.appSecret, data);
  return `${data}.${sig}`;
}

export function verifyToken(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [body, exp, sig] = parts;
  const expect = hmacSha256(config.appSecret, `${body}.${exp}`);
  if (sig !== expect) return null;
  if (Number(exp) < Date.now()) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// ── Small helpers ────────────────────────────────────────────────────────────
export const now = (): number => Date.now();

export function num(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export function round(v: number, digits = 8): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Very light input sanitizer for free-text user input (XSS protection). */
export function clean(s: unknown, max = 2000): string {
  return String(s ?? "")
    .replace(/[<>]/g, "")
    .slice(0, max);
}

/** Mask a secret for display (never show full keys). */
export function mask(secret?: string | null): string {
  if (!secret) return "";
  if (secret.length <= 8) return "••••";
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

/** Generate a unique short code for referrals. */
export function referralCode(username?: string): string {
  const base = (username || "wolf").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
  const rand = crypto.randomBytes(3).toString("hex");
  return `${base}${rand}`.toLowerCase();
}

/** Client IP from a request-like object (Hono). */
export function ipFrom(c: { req: { header: (n: string) => string | undefined } }): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("cf-connecting-ip") ||
    "0.0.0.0"
  );
}
