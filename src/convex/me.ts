// ---------------------------------------------------------------------------
// Authentication & sessions
//   • tgLogin    — validates Telegram WebApp initData (HMAC-SHA256 with the
//                  bot token kept in system settings, never in the app)
//   • adminLogin — username + password (PBKDF2-SHA256, Persian errors)
//   • me / wolfLogout / updatePreferences — session user APIs
// ---------------------------------------------------------------------------
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { bytesToHex, hashPassword, verifyPassword } from "./crypto";
import { ensureDefaults, ensureVipPackages, getSetting, getSettingsMap, seedFirstAdmin } from "./settings";
import { ensureMarkets } from "./markets";
import { ensureStrategies } from "./strategies";
import { createWolfSession, killWolfSession, resolveWolfUser, touchUser } from "./wolfAuth";
import { ensureReferralCode } from "./admin";
import { audit, log } from "./logs";

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bytesToHex(digest);
}

async function hmacSha256(keyHex: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(keyHex),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bytesToHex(sig);
}

export type TgUserPayload = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  auth_date: number;
};

/** Validates Telegram initData (signature check with the system bot token). */
export async function validateInitData(
  ctx: any,
  initData: string,
): Promise<TgUserPayload | null> {
  const token = await getSetting(ctx, "telegram.token");
  if (!token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > 86_400) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, value]) => `${k}=${value}`)
    .join("\n");
  const secretKey = await hmacSha256(await sha256Hex(token), "WebAppData");
  const expectedHash = await hmacSha256(secretKey, dataCheckString);
  if (expectedHash !== hash) return null;
  const userRaw = params.get("user");
  if (!userRaw) return null;
  try {
    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}

async function findUserByTgId(ctx: any, tgId: number) {
  return ctx.db
    .query("users")
    .withIndex("by_tgId", (q: any) => q.eq("tgId", tgId))
    .first();
}

// Seeds settings, first admin, markets, strategies and VIP packages on first
// login. All of these are writes, so this must only run inside mutations.
async function bootstrap(ctx: any): Promise<void> {
  try { await ensureDefaults(ctx); } catch { /* settings already exist */ }
  try { await seedFirstAdmin(ctx); } catch { /* admin already exists */ }
  try { await ensureMarkets(ctx); } catch { /* markets already seeded */ }
  try { await ensureStrategies(ctx); } catch { /* strategies already seeded */ }
  try { await ensureVipPackages(ctx); } catch { /* VIP packages already exist */ }
}

// ─── telegram login (Mini App) ──────────────────────────────────────────────

export const tgLogin = mutation({
  args: { initData: v.string() },
  handler: async (ctx, { initData }) => {
    await bootstrap(ctx);
    // A masked/placeholder bot token (e.g. after an admin saved the settings
    // form with the „••••…“ placeholder) makes every initData check fail.
    const storedToken = String((await getSetting(ctx, "telegram.token")) ?? "");
    if (!storedToken || /[•…*]{3,}/.test(storedToken)) {
      await log(ctx, "ERROR", "tg.login.tokenInvalid", "stored bot token is missing or masked", "bot");
      throw new Error("توکن ربات تلگرام در تنظیمات مدیر معتبر نیست — از پنل مدیر یک توکن واقعی وارد کنید");
    }
    const tg = await validateInitData(ctx, initData);
    if (!tg) {
      await log(ctx, "SECURITY", "tg.login.rejected", "initData نامعتبر", "bot");
      throw new Error("دیتای تلگرام نامعتبر است — این مینی‌اپ باید از داخل خود ربات باز شود");
    }
    const userId = tg.id;
    let user = await findUserByTgId(ctx, userId);
    if (!user) {
      const id = await ctx.db.insert("users", {
        tgId: userId,
        firstName: tg.first_name,
        lastName: tg.last_name,
        tgUsername: tg.username,
        language: tg.language_code === "en" ? "en" : "fa",
        tgLanguage: tg.language_code,
        name: tg.first_name ?? `TG${userId}`,
        role: "user",
        enabled: true,
        canTrade: true,
        registeredAt: Date.now(),
        lastActivity: Date.now(),
        theme: "dark",
        notificationsEnabled: true,
      });
      user = await ctx.db.get(id);
      await log(ctx, "INFO", "tg.user.new", `user=${userId}`, "bot");
      // free VIP trial for every new registered user (48h default, admin-configurable)
      try {
        await ctx.runMutation(internal.me.grantFreeTrial, { userId: id });
      } catch {
        // never block login on the trial grant
      }
    }
    if (!user || user.enabled === false) throw new Error("حساب شما غیرفعال است");
    // Channel-membership re-check: refresh the stored channelVerified flag
    // asynchronously (mutations can't call actions synchronously). Confirmed
    // non-members are never hard-blocked at login — the bot's contact flow is
    // the gate — but the flag stays fresh for the admin panel and profile.
    try {
      const settingsMap = await getSettingsMap(ctx);
      const chRequired =
        settingsMap["channel.required"] !== false && settingsMap["channel.enabled"] !== false;
      const chId = String(settingsMap["channel.id"] ?? "").trim();
      const chUser = String(settingsMap["channel.username"] ?? "").trim().replace(/^@/, "");
      const botToken = String(settingsMap["telegram.token"] ?? "");
      if (chRequired && (chId || chUser) && botToken) {
        void ctx.scheduler.runAfter(0, internal.telegram.refreshMembership, {
          tgId: userId,
          token: botToken,
        });
      }
    } catch (e: any) {
      // non-fatal: transient failures must never break login
      console.warn(`[tg] membership refresh skipped for ${userId}: ${e?.message ?? e}`);
    }
    await ctx.db.patch(user._id, { lastActivity: Date.now() });
    await ensureReferralCode(ctx, user._id);
    // referral captured from the bot's /start link → reward both sides (idempotent)
    if (user.pendingReferralCode && !user.referralRewarded) {
      try {
        await ctx.runMutation(internal.coins.applyPendingReferral, { userId: user._id });
      } catch {
        // never block login on referral issues
      }
    }
    const session = await createWolfSession(ctx as any, user._id, "telegram");
    await log(ctx, "SECURITY", "tg.login.ok", `user=${userId}`, "bot");
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user._id,
        tgId: user.tgId,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.tgUsername,
        role: user.role,
        isVip: user.isVip,
        isAdmin: user.isAdmin,
        enabled: user.enabled,
      },
    };
  },
});

// ─── admin / password login ─────────────────────────────────────────────────

export const adminLogin = mutation({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, { username, password }) => {
    await bootstrap(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q: any) => q.eq("username", username.trim()))
      .first();
    if (!user || !user.passwordHash || !user.passwordSalt) {
      throw new Error("نام کاربری یا رمز عبور اشتباه است");
    }
    if (!user.enabled) throw new Error("حساب کاربری شما غیرفعال شده است");
    const ok = await verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!ok) {
      await audit(ctx, "login.failed", user.name ?? username, user._id, "admin", "wrong password");
      throw new Error("نام کاربری یا رمز عبور اشتباه است");
    }
    await ctx.db.patch(user._id, { lastActivity: Date.now() });
    await audit(ctx, "login.ok", user.username, user._id, "admin", "admin login");
    const session = await createWolfSession(ctx as any, user._id, "admin");
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        isAdmin: user.isAdmin,
        isAssistant: user.isAssistant,
        isVip: user.isVip,
      },
    };
  },
});

export const wolfLogout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await killWolfSession(ctx, token);
    // stop the coin-burn clock at logout so nothing is deducted while away
    const user = await resolveWolfUser(ctx, token);
    if (user) await ctx.db.patch(user._id, { lastCoinCheck: Date.now() });
  },
});

/** Grants the free VIP trial to a brand-new user (admin-configurable, one per user). */
export const grantFreeTrial = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user || user.vipPackage) return { ok: false, reason: "already_has_package" };
    const settings = await getSettingsMap(ctx);
    if (settings["vip.freeTrial"] === false) return { ok: false, reason: "disabled" };
    const days = Number(settings["vip.trialDays"] ?? 21);
    const hours = Math.max(1, Number(settings["vip.trialHours"] ?? (days * 24)));
    await ctx.db.patch(userId, {
      isVip: true,
      vipPackage: "trial",
      vipExpiresAt: Date.now() + hours * 3600_000,
    });
    await log(ctx, "INFO", "vip.trial.granted", `user=${userId} hours=${hours} days=${Math.round(hours / 24)}`, "system");
    return { ok: true };
  },
});

export const me = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, { token }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) return null;
    return {
      id: user._id,
      name: user.name,
      username: user.username,
      tgId: user.tgId,
      tgUsername: user.tgUsername,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      isVip: user.isVip,
      vipPackage: user.vipPackage,
      vipExpiresAt: user.vipExpiresAt,
      isAdmin: user.isAdmin,
      isAssistant: user.isAssistant,
      enabled: user.enabled,
      canTrade: user.canTrade,
      theme: user.theme ?? "dark",
      language: user.language ?? "fa",
      defaultTimeframe: user.defaultTimeframe,
      defaultMarket: user.defaultMarket,
      notificationsEnabled: user.notificationsEnabled,
      walletAddress: user.walletAddress,
      registeredAt: user.registeredAt,
      lastActivity: user.lastActivity,
    };
  },
});

/**
 * Link the current (password/admin) account to a Telegram identity.
 * The initData is HMAC-verified server-side — never trust the client.
 * Rewards the user with wolf coins once (coins.rewardTelegram, admin-set).
 */
export const connectTelegram = mutation({
  args: { token: v.string(), initData: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    if (user.tgId) throw new Error("حساب شما قبلاً به تلگرام وصل شده است");
    const storedToken = String((await getSetting(ctx, "telegram.token")) ?? "");
    if (!storedToken || /[•…*]{3,}/.test(storedToken)) {
      throw new Error("توکن ربات تلگرام در تنظیمات مدیر معتبر نیست — ابتدا از پنل مدیر یک توکن واقعی وارد کنید");
    }
    const tg = await validateInitData(ctx, args.initData);
    if (!tg) throw new Error("دیتای تلگرام نامعتبر است — این بخش را از داخل مینی‌اپ ربات باز کنید");
    const owner = await findUserByTgId(ctx, tg.id);
    if (owner && owner._id !== user._id) {
      throw new Error("این تلگرام قبلاً به حساب دیگری وصل شده است");
    }
    const patch: Record<string, any> = {
      tgId: tg.id,
      firstName: tg.first_name,
      lastName: tg.last_name,
      tgUsername: tg.username,
      tgLanguage: tg.language_code,
      language: tg.language_code === "en" ? "en" : user.language ?? "fa",
      channelVerified: true,
      lastActivity: Date.now(),
    };
    if (!user.name) patch.name = tg.first_name ?? `TG${tg.id}`;
    await ctx.db.patch(user._id, patch);
    await ensureReferralCode(ctx, user._id);

    // one-time wolf-coin reward for connecting Telegram
    let reward = 0;
    if (!user.telegramRewardClaimed) {
      reward = Math.max(0, Number((await getSetting(ctx, "coins.rewardTelegram")) ?? 25));
      if (reward > 0) {
        const next = (user.wolfCoins ?? 0) + reward;
        await ctx.db.patch(user._id, { wolfCoins: next, telegramRewardClaimed: true });
        await ctx.db.insert("coinTransactions", {
          userId: user._id,
          currency: "wolf",
          delta: reward,
          balanceAfter: next,
          reason: "reward_telegram",
          ref: String(tg.id),
          created: Date.now(),
        });
      } else {
        await ctx.db.patch(user._id, { telegramRewardClaimed: true });
      }
    }
    await audit(ctx, "telegram.connected", user.username ?? user._id, user._id, undefined, `tg=${tg.id}`);
    await log(ctx, "SECURITY", "tg.connected", `user=${user.username ?? ""} tg=${tg.id}`, "api");
    return { ok: true, reward, tgId: tg.id, tgUsername: tg.username };
  },
});

/** One-time Telegram confirmation required before the first withdrawal. */
export const confirmWithdrawTelegram = mutation({
  args: { token: v.string(), initData: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    if (!user.tgId) throw new Error("ابتدا حساب تلگرام خود را به این پروفایل متصل کنید");
    const tg = await validateInitData(ctx, args.initData);
    if (!tg || tg.id !== user.tgId) {
      throw new Error("تایید تلگرام نامعتبر است — این دکمه را از داخل مینی‌اپ ربات باز کنید");
    }
    await ctx.db.patch(user._id, { withdrawTgVerifiedAt: Date.now(), lastActivity: Date.now() });
    await audit(ctx, "withdraw.tg_confirmed", user.username ?? user._id, user._id);
    await log(ctx, "SECURITY", "withdraw.tg_confirmed", `user=${user.username ?? ""}`, "api");
    return { ok: true };
  },
});

export const updatePreferences = mutation({
  args: {
    token: v.string(),
    theme: v.optional(v.string()),
    language: v.optional(v.string()),
    defaultTimeframe: v.optional(v.string()),
    defaultMarket: v.optional(v.string()),
    notificationsEnabled: v.optional(v.boolean()),
    phone: v.optional(v.string()),
    name: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    gender: v.optional(v.string()),
    birthday: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    const patch: Record<string, any> = {
      ...(args.theme !== undefined ? { theme: String(args.theme).slice(0, 10) } : {}),
      ...(args.language !== undefined ? { language: String(args.language).slice(0, 2) } : {}),
      ...(args.defaultTimeframe !== undefined ? { defaultTimeframe: args.defaultTimeframe } : {}),
      ...(args.defaultMarket !== undefined ? { defaultMarket: args.defaultMarket } : {}),
      ...(args.notificationsEnabled !== undefined ? { notificationsEnabled: args.notificationsEnabled } : {}),
      ...(args.phone !== undefined ? { phone: String(args.phone).trim().slice(0, 30) } : {}),
      ...(args.name !== undefined ? { name: String(args.name).trim().slice(0, 120) } : {}),
      ...(args.firstName !== undefined ? { firstName: String(args.firstName).trim().slice(0, 120) } : {}),
      ...(args.lastName !== undefined ? { lastName: String(args.lastName).trim().slice(0, 120) } : {}),
      ...(args.gender !== undefined ? { gender: String(args.gender).trim().slice(0, 20) } : {}),
      ...(args.birthday !== undefined ? { birthday: String(args.birthday).trim().slice(0, 20) } : {}),
    };
    await ctx.db.patch(user._id, patch);
    await touchUser(ctx, user);
    await audit(ctx, "profile.updated", user.username ?? user._id, user._id, undefined, Object.keys(patch).join(","));
  },
});

/** Per-user AI provider/model preference for their WOLF AI chats. */
export const setAiPreference = mutation({
  args: { token: v.string(), provider: v.string(), model: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    const provider = String(args.provider ?? "").trim().slice(0, 40);
    if (!provider) throw new Error("provider نامعتبر است");
    await ctx.db.patch(user._id, {
      aiProvider: provider,
      ...(args.model !== undefined ? { aiModel: String(args.model).trim().slice(0, 80) || undefined } : {}),
    });
    return { ok: true, provider };
  },
});

/** User changes their own password (current password required when one exists). */
export const changeMyPassword = mutation({
  args: {
    token: v.string(),
    currentPassword: v.optional(v.string()),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    if (args.newPassword.length < 6) throw new Error("رمز عبور جدید باید حداقل ۶ کاراکتر باشد");
    if (user.passwordHash && user.passwordSalt) {
      const ok = await verifyPassword(args.currentPassword ?? "", user.passwordSalt, user.passwordHash);
      if (!ok) throw new Error("رمز عبور فعلی صحیح نیست");
    }
    const { salt, hash } = await hashPassword(args.newPassword);
    await ctx.db.patch(user._id, { passwordSalt: salt, passwordHash: hash });
    await audit(ctx, "user.password_changed", user.username ?? user._id, user._id);
    await log(ctx, "SECURITY", "user.password_changed", `user=${user.username ?? ""}`);
  },
});