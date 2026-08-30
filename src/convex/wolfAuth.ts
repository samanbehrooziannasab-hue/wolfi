// ---------------------------------------------------------------------------
// WOLF session helpers. Two authentication paths share the dashboard:
//   1. Admin / VIP: username + password → wolf session token (wolfSessions)
//   2. Telegram users (Mini App): validated initData → wolf session token
// Sessions are revocable and expire after 30 days.
// ---------------------------------------------------------------------------
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { sha256Hex, randomToken } from "./crypto";
import { getSetting } from "./settings";

export const SESSION_TTL_MS = 60 * 60 * 1000; // default: 1 hour (admin-adjustable)

export async function createWolfSession(
  ctx: any,
  userId: string,
  source: string,
): Promise<{ token: string; expiresAt: number }> {
  let ttlMs = SESSION_TTL_MS;
  try {
    const hours = Math.max(1, Number((await getSetting(ctx, "auth.sessionHours")) ?? 1) || 1);
    ttlMs = hours * 60 * 60 * 1000;
  } catch {
    // settings unavailable — keep the default
  }
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = Date.now() + ttlMs;
  await ctx.db.insert("wolfSessions", {
    userId,
    tokenHash,
    expiresAt,
    source,
    created: Date.now(),
  });
  return { token, expiresAt };
}

export async function resolveWolfUser(
  ctx: any,
  token?: string | null,
): Promise<any | null> {
  if (!token) return null;
  const hash = await sha256Hex(token);
  const session = await ctx.db
    .query("wolfSessions")
    .withIndex("by_token", (q: any) => q.eq("tokenHash", hash))
    .first();
  if (!session) return null;
  // NOTE: do NOT delete here — resolveWolfUser also runs inside read-only
  // queries (e.g. `me`), and a write would throw. Stale rows are harmless.
  if (session.expiresAt < Date.now()) return null;
  const user = await ctx.db.get(session.userId);
  if (!user || user.enabled === false) return null;
  return user;
}

/**
 * Internal query wrapper — lets ACTIONS resolve the session user without
 * ctx.db (actions only have runQuery/runMutation; ctx.db is undefined there,
 * which crashed speakText: "Cannot read properties of undefined (reading 'query')").
 * Returns a minimal projection, not the full doc.
 */
export const resolveUserInternal = internalQuery({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, { token }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) return null;
    return {
      _id: user._id,
      username: user.username,
      isAdmin: Boolean(user.isAdmin),
      role: user.role ?? "user",
      wolfCoins: user.wolfCoins ?? 0,
      language: user.language ?? "fa",
      aiProvider: user.aiProvider ?? "",
      aiModel: user.aiModel ?? "",
    };
  },
});

export async function resolveAdmin(ctx: any, token?: string | null): Promise<any | null> {
  const user = await resolveWolfUser(ctx, token);
  if (!user) return null;
  if (!user.isAdmin && user.role !== "admin") return null;
  return user;
}

export async function resolveStaff(ctx: any, token?: string | null): Promise<any | null> {
  const user = await resolveWolfUser(ctx, token);
  if (!user) return null;
  if (!user.isAdmin && !user.isAssistant && user.role !== "admin" && user.role !== "assistant") {
    return null;
  }
  return user;
}

/** Used by admin-only mutations: throws a Persian-friendly error when not allowed. */
export async function requireAdmin(ctx: any, token?: string | null): Promise<any> {
  const user = await resolveWolfUser(ctx, token);
  if (!user) throw new Error("session_expired");
  if (!user.isAdmin && user.role !== "admin") throw new Error("forbidden_admin_only");
  return user;
}

export async function requireStaff(ctx: any, token?: string | null): Promise<any> {
  const user = await resolveWolfUser(ctx, token);
  if (!user) throw new Error("session_expired");
  if (!user.isAdmin && !user.isAssistant && user.role !== "admin" && user.role !== "assistant") {
    throw new Error("forbidden");
  }
  return user;
}

export async function killWolfSession(ctx: any, token: string): Promise<void> {
  const hash = await sha256Hex(token);
  const session = await ctx.db
    .query("wolfSessions")
    .withIndex("by_token", (q: any) => q.eq("tokenHash", hash))
    .first();
  if (session) await ctx.db.delete(session._id);
}

export async function touchUser(ctx: any, user: any): Promise<void> {
  if (!user) return;
  await ctx.db.patch(user._id, { lastActivity: Date.now() });
}