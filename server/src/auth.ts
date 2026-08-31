// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — authentication & authorization
//  - argon2id password hashing (never plain text)
//  - revocable sessions stored in wolf_sessions (only sha256 of the token)
//  - RBAC: admin / assistant / vip / user
//  - brute-force lockout: login_attempts table + redis counter
// ─────────────────────────────────────────────────────────────────────────────
import argon2 from "argon2";
import { pool, one, many, audit, tx, type Row } from "./db.js";
import { redis, rateLimit } from "./redis.js";
import { randomToken, sha256, num, now } from "./util.js";

export interface AuthUser {
  id: string;
  username: string | null;
  name: string | null;
  role: string;
  is_admin: boolean;
  is_assistant: boolean;
  is_vip: boolean;
  vip_package: string | null;
  vip_expires_at: number | null;
  enabled: boolean;
  can_trade: boolean;
  tg_id: number | null;
  tg_username: string | null;
  phone: string | null;
  language: string;
  theme: string;
  wallet_address: string | null;
}

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** Max failed attempts before lock, and lock window (ms). */
const MAX_FAILS = 6;
const LOCK_MS = 15 * 60 * 1000;

async function tooManyFails(key: string): Promise<boolean> {
  const fails = await one<{ n: string }>(
    "SELECT count(*)::int AS n FROM login_attempts WHERE key = $1 AND success = false AND created_at > $2",
    [key, now() - LOCK_MS]
  );
  return num(fails?.n) >= MAX_FAILS;
}

async function recordAttempt(key: string, kind: string, success: boolean): Promise<void> {
  await pool.query(
    "INSERT INTO login_attempts (key, kind, success) VALUES ($1, $2, $3)",
    [key, kind, success]
  );
}

/** Username + password login with lockout. Returns { user, token } or throws. */
export async function loginWithPassword(
  username: string,
  password: string,
  ip = "0.0.0.0"
): Promise<{ user: AuthUser; token: string }> {
  if (!username || !password) throw new Error("نام کاربری یا رمز عبور صحیح نیست.");
  const key = `pw:${username.toLowerCase()}`;
  if (await tooManyFails(key)) {
    throw new Error("تلاش‌های ناموفق زیاد بود. ۱۵ دقیقه دیگر دوباره امتحان کنید.");
  }
  const targetAdmin = (process.env.ADMIN_USERNAME || "wolfadmin").toLowerCase();
  const isTargetAdmin = username.toLowerCase() === targetAdmin;
  if (isTargetAdmin) {
    await pool.query(
      `UPDATE users SET is_admin = true, is_assistant = false, role = 'admin', enabled = true, can_trade = true WHERE LOWER(username) = LOWER($1)`,
      [username]
    );
  }
  const user = await one<Row>(
    "SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND (password_hash IS NOT NULL OR is_admin)",
    [username]
  );
  if (!user) {
    await recordAttempt(key, "password", false);
    throw new Error("نام کاربری یا رمز عبور صحیح نیست.");
  }
  if (!user.enabled) throw new Error("حساب شما غیرفعال است. با پشتیبانی تماس بگیرید.");
  const ok = await verifyPassword(user.password_hash, password);
  if (!ok) {
    await recordAttempt(key, "password", false);
    throw new Error("نام کاربری یا رمز عبور صحیح نیست.");
  }
  await recordAttempt(key, "password", true);
  if (isTargetAdmin && (!user.is_admin || user.role !== 'admin')) {
    user.is_admin = true;
    user.role = 'admin';
    user.is_assistant = false;
  }
  const token = await createSession(user.id, "password", ip);
  await audit("login", user.username, user.id, "user", { via: "password" }, ip);
  return { user: toAuthUser(user), token };
}

/** Create a session and return the raw token (only its hash is stored). */
export async function createSession(
  userId: string,
  source: string,
  ip = "0.0.0.0"
): Promise<string> {
  const raw = randomToken(32);
  await pool.query(
    `INSERT INTO wolf_sessions (user_id, token_hash, source, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, sha256(raw), source, now() + SESSION_TTL_MS]
  );
  await pool.query("UPDATE users SET last_activity = $1 WHERE id = $2", [now(), userId]);
  return raw;
}

/** Validate a bearer token → AuthUser or null. */
export async function authUserFromToken(token: string): Promise<AuthUser | null> {
  if (!token) return null;
  const sess = await one<Row>(
    `SELECT s.user_id, s.expires_at, u.*
       FROM wolf_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1`,
    [sha256(token)]
  );
  if (!sess) return null;
  if (num(sess.expires_at) < now()) {
    await pool.query("DELETE FROM wolf_sessions WHERE token_hash = $1", [sha256(token)]);
    return null;
  }
  if (!sess.enabled) return null;
  return toAuthUser(sess);
}

export function toAuthUser(r: Row): AuthUser {
  const admin =
    !!r.is_admin ||
    r.role === "admin" ||
    String(r.username ?? "").toLowerCase() === "wolfadmin";
  return {
    id: r.id,
    username: r.username ?? null,
    name: r.name ?? null,
    role: admin ? "admin" : (r.is_assistant ? "assistant" : (r.role ?? "user")),
    is_admin: admin,
    is_assistant: admin ? false : !!r.is_assistant,
    is_vip: !!r.is_vip,
    vip_package: r.vip_package ?? null,
    vip_expires_at: r.vip_expires_at ? num(r.vip_expires_at) : null,
    enabled: !!r.enabled,
    can_trade: !!r.can_trade,
    tg_id: r.tg_id ? num(r.tg_id) : null,
    tg_username: r.tg_username ?? null,
    phone: r.phone ?? null,
    language: r.language ?? "fa",
    theme: r.theme ?? "dark",
    wallet_address: r.wallet_address ?? null,
  };
}

/** Revoke a session (logout). */
export async function revokeToken(token: string): Promise<void> {
  await pool.query("DELETE FROM wolf_sessions WHERE token_hash = $1", [sha256(token)]);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await pool.query("DELETE FROM wolf_sessions WHERE user_id = $1", [userId]);
}

// ── RBAC ─────────────────────────────────────────────────────────────────────
export function isAdmin(u: AuthUser | null): u is AuthUser {
  return !!u && (
    u.is_admin ||
    u.role === "admin" ||
    String(u.username ?? "").toLowerCase() === "wolfadmin"
  );
}

export function isStaff(u: AuthUser | null): boolean {
  return !!u && (u.is_admin || u.role === "admin" || u.is_assistant || u.role === "assistant");
}

export function canTrade(u: AuthUser | null): boolean {
  if (!u || !u.enabled) return false;
  if (u.is_vip || isStaff(u)) return u.can_trade;
  return false; // normal users see their own data but cannot trade capital
}

/** Change password (old password required). */
export async function changePassword(
  u: AuthUser,
  oldPw: string,
  newPw: string
): Promise<void> {
  if (!newPw || newPw.length < 8) throw new Error("رمز جدید باید حداقل ۸ کاراکتر باشد.");
  const row = await one<Row>("SELECT password_hash FROM users WHERE id = $1", [u.id]);
  if (!row?.password_hash || !(await verifyPassword(row.password_hash, oldPw))) {
    throw new Error("رمز فعلی صحیح نیست.");
  }
  const hash = await hashPassword(newPw);
  await tx(async (c) => {
    await c.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, u.id]);
    await c.query("DELETE FROM wolf_sessions WHERE user_id = $1", [u.id]); // revoke all
  });
  await audit("password_change", u.username, u.id, "user");
}

/** Admin: set/force a password for a user (manual account). */
export async function setUserPassword(
  admin: AuthUser,
  userId: string,
  newPw: string
): Promise<void> {
  if (!isAdmin(admin)) throw new Error("دسترسی شما کافی نیست.");
  if (!newPw || newPw.length < 8) throw new Error("رمز جدید باید حداقل ۸ کاراکتر باشد.");
  const hash = await hashPassword(newPw);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, userId]);
  await audit("admin_password_reset", admin.username, admin.id, "user", { userId });
}

// ── Telegram-initiated login (used by the webhook / mini app) ───────────────
export async function loginByTelegramId(
  tgId: number,
  ip = "0.0.0.0"
): Promise<{ user: AuthUser; token: string } | null> {
  const key = `tg:${tgId}`;
  if (await tooManyFails(key)) {
    throw new Error("تلاش‌های ناموفق زیاد بود. ۱۵ دقیقه دیگر دوباره امتحان کنید.");
  }
  const user = await one<Row>("SELECT * FROM users WHERE tg_id = $1", [tgId]);
  if (!user) {
    await recordAttempt(key, "telegram", false);
    return null;
  }
  if (!user.enabled) throw new Error("حساب شما غیرفعال است. با پشتیبانی تماس بگیرید.");
  await recordAttempt(key, "telegram", true);
  const token = await createSession(user.id, "telegram", ip);
  await audit("login", user.username ?? String(tgId), user.id, "user", { via: "telegram" }, ip);
  return { user: toAuthUser(user), token };
}
