// ---------------------------------------------------------------------------
// Admin + account management endpoints.
//   • user management  (admin: list/create/block/role/password)
//   • wallet           (deposit receipts, withdrawal requests, admin review)
//   • VIP              (packages, subscribe requests, admin approval)
//   • positions        (list open positions with engine analysis, manual close)
// All mutations are guarded by requireAdmin / resolveWolfUser.
// ---------------------------------------------------------------------------
import { v } from "convex/values";

import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { aesEncrypt, hashPassword, randomToken } from "./crypto";
import { audit, log } from "./logs";
import {
  DEFAULT_SETTINGS,
  applyRiskPreset as applyRiskPresetStore,
  getSetting,
  getSettingsMap,
  setSetting,
} from "./settings";
import { requireAdmin, requireStaff, resolveAdmin, resolveStaff, resolveWolfUser } from "./wolfAuth";
import { buildSignalMessage } from "./aiPolicy";
import { AI_PROVIDERS, AI_PROVIDER_LIMITS, AI_PROVIDER_MODELS, AI_PROVIDER_VISION } from "./aiProviders";

const ROLES = ["admin", "vip", "user", "assistant"] as const;

/** Fire-and-forget admin Telegram alert (never breaks the money flow). */
async function notifyAdminTg(ctx: any, text: string): Promise<void> {
  try {
    await ctx.scheduler.runAfter(0, internal.notify.notifyAdmin, { text });
  } catch {
    // scheduling must never break the caller
  }
}

/** Formats a position row (open or closed) into a rich Telegram digest. */
function positionDigest(p: any, extra?: Record<string, string>): string {
  const sideEmoji = p.side === "long" ? "🟢 لانگ / LONG" : "🔴 فروش / SHORT";
  const marketFa = p.market === "forex" ? "فارکس/فلزات" : "کریپتو";
  const digits = p.market === "forex" ? 5 : 4;
  const f = (n: number | undefined | null, d = digits) =>
    n === undefined || n === null || Number.isNaN(n) ? "—" : Number(n).toFixed(d);
  const t = (ms?: number) =>
    ms ? new Date(ms).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" }) : "—";
  const lines = [
    `📌 <b>معامله ${p.status === "closed" ? "بسته شد / Closed" : "باز / Open"}</b>`,
    `━━━━━━━━━━━━━━━━━━`,
    `📊 نماد / Symbol: <b>${p.symbol}</b>`,
    `${sideEmoji}`,
    `🪙 بازار: ${marketFa}`,
    `⭐ Score: <b>${f(p.score, 1)}/100</b> | Confidence: <b>${Math.round((p.confidence ?? 0) * 100)}%</b>`,
    `🧠 استراتژی‌ها: ${(p.strategyKeys ?? []).slice(0, 4).join("، ") || "—"}`,
    `━━━━━━━━━━━━━━━━━━`,
    `📥 ورود / Entry: <b>${f(p.entry)}</b>`,
    `💹 قیمت فعلی / Current: ${f(p.current)}`,
    `⛔ حد ضرر / SL: ${f(p.stopLoss)}`,
    `🎯 هدف / TP: ${f(p.takeProfit)}`,
  ];
  if (Array.isArray(p.targets) && p.targets.length) {
    lines.push(`🎯 تارگت‌ها: ${p.targets.map((x: number) => f(x)).join(" · ")}`);
  }
  if (p.status === "closed") {
    lines.push(`🔚 دلیل بسته شدن: ${p.closeReason ?? "—"}`);
    lines.push(`💰 سود/زیان محقق‌شده: <b>${f(p.profit ?? 0, 4)} USDT</b>`);
    lines.push(`🕒 بسته‌شده در: ${t(p.closeTime)}`);
  } else {
    lines.push(`📈 سود/زیان: <b>${f(p.pnl ?? 0, 4)} USDT</b> (${f(p.pnlPct ?? 0, 2)}%)`);
    lines.push(`🕒 بازشده در: ${t(p.openTime)}`);
  }
  if (extra) {
    for (const [k, val] of Object.entries(extra)) lines.push(`${k}: ${val}`);
  }
  lines.push(`#WOLF_TRADE`);
  return lines.join("\n");
}
type RoleKey = (typeof ROLES)[number];
const asRole = (role: string): RoleKey => {
  if (!(ROLES as readonly string[]).includes(role)) throw new Error("نقش نامعتبر است");
  return role as RoleKey;
};

async function getOrCreateWallet(
  ctx: any,
  userId: string,
): Promise<any> {
  const asset = (await getSetting(ctx, "wallet.systemAsset")) ?? "USDT";
  const network = (await getSetting(ctx, "wallet.systemNetwork")) ?? "TRC20";
  const address = (await getSetting(ctx, "wallet.systemAddress")) ?? "";
  const existing = await ctx.db
    .query("wallets")
    .withIndex("by_owner", (q: any) => q.eq("owner", userId))
    .first();
  if (existing) return existing;
  const id = await ctx.db.insert("wallets", {
    userId,
    owner: userId,
    asset,
    network,
    balance: 0,
    depositAddress: address || undefined,
    enabled: true,
  });
  return await ctx.db.get(id);
}

// ─── user management ──────────────────────────────────────────────────────

export const listUsers = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    const [users, wallets] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("wallets").collect(),
    ]);
    const balanceByOwner = new Map<string, number>();
    for (const w of wallets) balanceByOwner.set(w.owner, (w.balance ?? 0));
    return users
      .map((u) => ({
        id: u._id,
        name: u.name,
        username: u.username,
        tgId: u.tgId,
        tgUsername: u.tgUsername,
        phone: u.phone,
        role: u.role ?? "user",
        isAdmin: u.isAdmin,
        isAssistant: u.isAssistant,
        isVip: u.isVip,
        vipPackage: u.vipPackage,
        vipExpiresAt: u.vipExpiresAt,
        enabled: u.enabled !== false,
        canTrade: u.canTrade !== false,
        registeredAt: u.registeredAt,
        lastActivity: u.lastActivity,
        balance: balanceByOwner.get(u._id) ?? 0,
      }))
      .sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0));
  },
});

export const createUser = mutation({
  args: {
    token: v.string(),
    username: v.string(),
    password: v.string(),
    name: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const username = args.username.trim().toLowerCase();
    if (!username || args.password.length < 6) {
      throw new Error("نام کاربری و رمز عبور (حداقل ۶ کاراکتر) الزامی است");
    }
    const role = asRole(args.role);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q: any) => q.eq("username", username))
      .first();
    if (existing) throw new Error("این نام کاربری قبلاً ثبت شده است");

    const { salt, hash } = await hashPassword(args.password);
    const isAdmin = role === "admin";
    const isAssistant = role === "assistant";
    const isVip = role === "vip";
    const id = await ctx.db.insert("users", {
      name: args.name.trim() || username,
      username,
      passwordSalt: salt,
      passwordHash: hash,
      role,
      isAdmin,
      isAssistant,
      isVip,
      enabled: true,
      canTrade: true,
      registeredAt: Date.now(),
      lastActivity: Date.now(),
      theme: "dark",
      language: "fa",
      notificationsEnabled: true,
    });
    await getOrCreateWallet(ctx, id);
    await ensureReferralCode(ctx, id);
    await log(ctx, "SECURITY", "admin.user.created", `user=${username} role=${args.role}`, "api");
    await audit(ctx, "user.created", admin.username, admin._id, username, `role=${args.role}`);
    return { id };
  },
});

export const setUserEnabled = mutation({
  args: { token: v.string(), userId: v.id("users"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("کاربر یافت نشد");
    await ctx.db.patch(args.userId, { enabled: args.enabled });
    await log(ctx, "SECURITY", "admin.user.toggle", `user=${user.username} enabled=${args.enabled}`, "api");
    await audit(ctx, args.enabled ? "user.enabled" : "user.blocked", admin.username, admin._id, user.username);
  },
});

export const setUserRole = mutation({
  args: { token: v.string(), userId: v.id("users"), role: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const role = asRole(args.role);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("کاربر یافت نشد");
    await ctx.db.patch(args.userId, {
      role,
      isAdmin: role === "admin",
      isAssistant: role === "assistant",
      isVip: role === "vip",
    });
    await audit(ctx, "user.role", admin.username, admin._id, user.username, `role=${args.role}`);
  },
});

export const setUserPassword = mutation({
  args: { token: v.string(), userId: v.id("users"), password: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    if (args.password.length < 6) throw new Error("رمز عبور باید حداقل ۶ کاراکتر باشد");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("کاربر یافت نشد");
    const { salt, hash } = await hashPassword(args.password);
    await ctx.db.patch(args.userId, { passwordSalt: salt, passwordHash: hash });
    await audit(ctx, "user.password", admin.username, admin._id, user.username);
  },
});

// ─── wallet ────────────────────────────────────────────────────────────────

export const myAccount = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) return null;

    const [wallet, contracts, openPositions, addresses, allWallets, closedPositions] = await Promise.all([
      ctx.db
        .query("wallets")
        .withIndex("by_owner", (q: any) => q.eq("owner", user._id))
        .first(),
      ctx.db.query("vipContracts").withIndex("by_user", (q: any) => q.eq("userId", user._id)).collect(),
      ctx.db.query("open_positions").collect(),
      ctx.db.query("walletAddresses").collect(),
      ctx.db.query("wallets").collect(),
      ctx.db.query("closed_positions").order("desc").take(200),
    ]);

    const transactions = wallet
      ? await ctx.db
          .query("walletTransactions")
          .withIndex("by_wallet", (q: any) => q.eq("walletId", wallet._id))
          .order("desc")
          .take(50)
      : [];

    const now = Date.now();
    // engine-wide figures reused by engineAssets + the user's profit share
    const baseCapital = Number((await getSetting(ctx, "risk.virtualCapital")) ?? 1000);
    const engagedAll = allWallets.reduce((sum: number, w: any) => sum + (w.frozen ?? 0), 0);
    const floatingTotal = openPositions.reduce((sum: number, p: any) => sum + (p.pnl ?? 0), 0);
    const realizedTotal = closedPositions.reduce((sum: number, p: any) => sum + (p.profit ?? 0), 0);
    const totalCapital = Math.max(baseCapital + engagedAll, 1);
    const contribution = wallet?.frozen ?? 0;
    const shareRatio = contribution > 0 ? contribution / totalCapital : 0;
    // Platform profit-share by VIP tier — all admin-configurable in Settings →
    // Fees: normal 50% · bronze 30% · silver 15% · gold/platinum 10% of the
    // user's engine profit belongs to the platform; the rest is the user's net.
    const feeNormal = Number((await getSetting(ctx, "fees.platformNormal")) ?? 50) || 50;
    const feeBronze = Number((await getSetting(ctx, "fees.platformBronze")) ?? 30) || 30;
    const feeSilver = Number((await getSetting(ctx, "fees.platformSilver")) ?? 15) || 15;
    const feeGold = Number((await getSetting(ctx, "fees.platformGold")) ?? 10) || 10;
    const pkgKey = String(user.vipPackage ?? "");
    const commissionPct =
      pkgKey === "gold" || pkgKey === "platinum" || pkgKey === "platinum3m" ? feeGold
      : pkgKey === "silver" ? feeSilver
      : pkgKey === "bronze" ? feeBronze
      : feeNormal;
    const includeCommission = (await getSetting(ctx, "fees.includePlatformCommission")) !== false;
    const grossShare = (floatingTotal + realizedTotal) * shareRatio;
    const platformFee = includeCommission ? grossShare * (commissionPct / 100) : 0;
    const share = {
      contribution,
      totalCapital,
      ratio: Number((shareRatio * 100).toFixed(2)),
      floatingPnl: Number((floatingTotal * shareRatio).toFixed(4)),
      realizedPnl: Number((realizedTotal * shareRatio).toFixed(4)),
      total: Number(grossShare.toFixed(4)),
      commissionPct,
      platformFee: Number(platformFee.toFixed(4)),
      net: Number((grossShare - platformFee).toFixed(4)),
    };
    const active = contracts.find((c) => c.status === "active");
    const expiresAt = user.vipExpiresAt ?? active?.created ? (active ? active.created + active.durationDays * 86400000 : 0) : 0;
    const daysLeft = expiresAt > now ? Math.ceil((expiresAt - now) / 86400000) : 0;

    return {
      profile: {
        name: user.name ?? "",
        username: user.username ?? "",
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        phone: user.phone ?? "",
        tgId: user.tgId ?? null,
        tgUsername: user.tgUsername ?? "",
        gender: user.gender ?? "",
        birthday: user.birthday ?? "",
        role: user.role ?? "user",
        isVip: Boolean(user.isVip),
        canTrade: user.canTrade !== false,
        enabled: user.enabled !== false,
        language: user.language ?? "fa",
        theme: user.theme ?? "dark",
        notificationsEnabled: user.notificationsEnabled !== false,
        registeredAt: user.registeredAt ?? null,
        lastActivity: user.lastActivity ?? null,
        channelVerified: Boolean(user.channelVerified),
        phoneVerified: Boolean(user.phoneVerified),
        withdrawTgVerifiedAt: user.withdrawTgVerifiedAt ?? null,
        aiProvider: user.aiProvider ?? "",
        aiModel: user.aiModel ?? "",
      },
      wallet: wallet
        ? {
            id: wallet._id,
            asset: wallet.asset,
            network: wallet.network,
            balance: wallet.balance,
            frozen: wallet.frozen ?? 0,
            frozenSince: wallet.frozenSince ?? 0,
            depositAddress: wallet.depositAddress ?? null,
          }
        : {
            id: null,
            asset: (await getSetting(ctx, "wallet.systemAsset")) ?? "USDT",
            network: (await getSetting(ctx, "wallet.systemNetwork")) ?? "TRC20",
            balance: 0,
            frozen: 0,
            frozenSince: 0,
            depositAddress: (await getSetting(ctx, "wallet.systemAddress")) ?? "",
          },
      engineAssets: {
        // Engine portfolio — visible to the owner/dashboard (not a guarantee).
        // Capital includes realized P&L so wins/losses compound into the
        // principal exactly like the engine's own sizing math does.
        capital: Number(
          (Number((await getSetting(ctx, "risk.virtualCapital")) ?? 1000) || 0) +
            (Number(await getSetting(ctx, "engine.realizedPnl")) || 0),
        ),
        engaged: engagedAll,
        floatingPnl: floatingTotal,
        realizedPnl: realizedTotal,
      },
      // User's share of the engine: their committed (frozen) capital vs the
      // engine's total capital (base virtual capital + everything committed),
      // multiplied by the engine's floating + realized P&L.
      share,
      depositAddresses: addresses
        .filter((a) => a.enabled && a.kind !== "withdraw")
        .map((a) => ({
          id: a._id,
          asset: a.asset,
          network: a.network,
          address: a.address,
          memo: a.memo,
        })),
      withdrawAddresses: addresses
        .filter((a) => a.enabled && a.kind === "withdraw")
        .map((a) => ({
          id: a._id,
          asset: a.asset,
          network: a.network,
          address: a.address,
          memo: a.memo,
        })),
      withdrawMinDays: Math.max(0, Number((await getSetting(ctx, "wallet.withdrawMinDays")) ?? 7) || 0),
      transactions: transactions.map((tr) => ({
        id: tr._id,
        type: tr.type,
        asset: tr.asset,
        amount: tr.amount,
        network: tr.network,
        txid: tr.txid,
        status: tr.status,
        note: tr.note,
        created: tr.created,
      })),
      vip: {
        isVip: Boolean(user.isVip),
        packageKey: user.vipPackage ?? active?.packageKey ?? null,
        expiresAt: expiresAt || null,
        daysLeft,
        active: daysLeft > 0,
        capital: active?.capital ?? null,
      },
      openPositions: openPositions.map((p) => ({
        id: p._id,
        symbol: p.symbol,
        market: p.market,
        side: p.side,
        entry: p.entry,
        current: p.current,
        pnl: p.pnl,
        pnlPct: p.pnlPct,
        size: p.size,
        leverage: p.leverage,
        score: p.score,
        status: p.status,
        openTime: p.openTime,
      })),
    };
  },
});

/** Latest engine signals — VIP members see them on the dashboard (compact). */
export const mySignals = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) return [];
    const unlocks = new Set(user.signalUnlocks ?? []);
    const rows = await ctx.db.query("signals").withIndex("status", (q: any) => q.eq("status", "open")).order("desc").take(30);
    return rows.map((s) => ({
      id: s._id,
      symbol: s.symbol,
      timeframe: s.timeframe,
      direction: s.direction,
      entry: s.entry,
      stopLoss: s.stopLoss,
      takeProfit: s.takeProfit,
      targets: s.targets ?? [],
      rr: s.rr,
      score: s.score,
      confidence: s.confidence,
      price: s.price,
      strategyKeys: s.strategyKeys ?? [],
      reasonsFa: s.reasonsFa ?? [],
      reasonsEn: s.reasonsEn ?? [],
      unlocked: unlocks.has(String(s._id)),
      sentFaAt: s.sentFaAt,
      sentEnAt: s.sentEnAt,
      created: s.created,
    }));
  },
});

export const submitDeposit = mutation({
  args: { token: v.string(), amount: v.number(), txid: v.optional(v.string()), network: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    if (!(args.amount > 0)) throw new Error("مبلغ نامعتبر است");
    const wallet = await getOrCreateWallet(ctx, user._id);
    const network = args.network ?? wallet.network;
    await ctx.db.insert("walletTransactions", {
      walletId: wallet._id,
      userId: user._id,
      type: "deposit",
      asset: wallet.asset,
      amount: args.amount,
      network,
      txid: args.txid,
      status: "pending",
      ref: args.txid,
      created: Date.now(),
    });
    await log(ctx, "INFO", "wallet.deposit.request", `user=${user.username} amount=${args.amount} network=${network}`, "api");
    await notifyAdminTg(
      ctx,
      `💰 <b>درخواست واریز دلاری</b>\n👤 ${user.name ?? user.username ?? ""} (@${user.username ?? ""})\n💵 مبلغ: <b>${args.amount} ${wallet.asset}</b>\n🌐 شبکه: ${network}\n🆔 TXID: ${args.txid ?? "—"}`,
    );
  },
});

export const requestWithdrawal = mutation({
  args: { token: v.string(), amount: v.number(), address: v.optional(v.string()), network: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    if (!user.tgId) throw new Error("برای برداشت باید حساب تلگرام خود را به پروفایل متصل کرده باشید");
    if (!user.withdrawTgVerifiedAt) {
      throw new Error("لطفاً ابتدا تایید یکباره از تلگرام را انجام دهید (در بخش برداشت)");
    }
    if (!(args.amount > 0)) throw new Error("مبلغ نامعتبر است");
    const wallet = await getOrCreateWallet(ctx, user._id);
    if ((wallet.balance ?? 0) < args.amount) {
      throw new Error("موجودی کافی نیست");
    }
    await ctx.db.insert("walletTransactions", {
      walletId: wallet._id,
      userId: user._id,
      type: "withdrawal",
      asset: wallet.asset,
      amount: args.amount,
      network: args.network ?? wallet.network,
      status: "pending",
      note: args.address ?? user.walletAddress ?? "",
      created: Date.now(),
    });
    await log(ctx, "WARNING", "wallet.withdraw.request", `user=${user.username} amount=${args.amount}`, "api");
    await notifyAdminTg(
      ctx,
      `🏦 <b>درخواست برداشت</b>\n👤 ${user.name ?? user.username ?? ""} (@${user.username ?? ""})\n💵 مبلغ: <b>${args.amount} ${wallet.asset}</b>\n🌐 شبکه: ${args.network ?? wallet.network}\n🏦 آدرس: ${args.address ?? user.walletAddress ?? "—"}`,
    );
  },
});

/** User transfers available USDT to the engine (freeze → engine trades). */
export const commitToEngine = mutation({
  args: { token: v.string(), amount: v.number() },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    if (!(args.amount > 0)) throw new Error("مبلغ نامعتبر است");
    const wallet = await getOrCreateWallet(ctx, user._id);
    const available = wallet.balance ?? 0;
    if (available < args.amount) throw new Error("م موجودی کافی نیست");
    // Move from available → frozen (engine-committed)
    await ctx.db.patch(wallet._id, {
      balance: available - args.amount,
      frozen: (wallet.frozen ?? 0) + args.amount,
      frozenSince: wallet.frozenSince && wallet.frozenSince > 0 ? wallet.frozenSince : Date.now(),
    });
    await ctx.db.insert("walletTransactions", {
      walletId: wallet._id,
      userId: user._id,
      type: "commit",
      asset: wallet.asset,
      amount: args.amount,
      network: wallet.network,
      status: "confirmed",
      note: "انتقال موجودی به موتور برای معامله",
      created: Date.now(),
    });
    await log(ctx, "INFO", "wallet.commit", `user=${user.username} amount=${args.amount}`, "api");
  },
});

/** User requests to release frozen USDT (engine-committed) back to available balance. */
export const requestUnfreeze = mutation({
  args: { token: v.string(), amount: v.number() },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    if (!(args.amount > 0)) throw new Error("مبلغ نامعتبر است");
    const wallet = await getOrCreateWallet(ctx, user._id);
    const frozen = wallet.frozen ?? 0;
    if (frozen < args.amount) throw new Error("مبلغ درگیر (فریز) کافی نیست");
    // funds must circulate in the engine for at least the configured days
    const minDays = Math.max(0, Number((await getSetting(ctx, "wallet.withdrawMinDays")) ?? 7) || 0);
    const frozenSince = wallet.frozenSince ?? 0;
    if (minDays > 0 && frozenSince && Date.now() - frozenSince < minDays * 86400000) {
      const waitDays = Math.ceil((minDays * 86400000 - (Date.now() - frozenSince)) / 86400000);
      throw new Error(`سرمایه باید حداقل ${minDays} روز در موتور بچرخد — ${waitDays} روز دیگر مجاز می‌شود`);
    }
    await ctx.db.insert("walletTransactions", {
      walletId: wallet._id,
      userId: user._id,
      type: "unfreeze",
      asset: wallet.asset,
      amount: args.amount,
      network: wallet.network,
      status: "pending",
      note: "درخواست آزادسازی سرمایه از موتور",
      created: Date.now(),
    });
    await log(ctx, "WARNING", "wallet.unfreeze.request", `user=${user.username} amount=${args.amount}`, "api");
    await notifyAdminTg(
      ctx,
      `🔓 <b>درخواست آزادسازی سرمایه</b>\n👤 ${user.name ?? user.username ?? ""} (@${user.username ?? ""})\n💵 مبلغ: <b>${args.amount} ${wallet.asset}</b>\n📝 سرمایه درگیر موتور به موجودی قابل برداشت برمی‌گردد.`,
    );
  },
});

export const listTransactions = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    const [txs, wallets, users] = await Promise.all([
      ctx.db.query("walletTransactions").order("desc").take(100),
      ctx.db.query("wallets").collect(),
      ctx.db.query("users").collect(),
    ]);
    const ownerByWallet = new Map<string, string>();
    for (const w of wallets) ownerByWallet.set(w._id, w.owner);
    const userById = new Map<string, any>();
    for (const u of users) userById.set(u._id, u);
    return txs.map((t) => {
      const ownerId = ownerByWallet.get(t.walletId);
      const owner = ownerId ? userById.get(ownerId) : undefined;
      return {
        id: t._id,
        type: t.type,
        asset: t.asset,
        amount: t.amount,
        network: t.network,
        txid: t.txid,
        status: t.status,
        note: t.note,
        created: t.created,
        user: owner
          ? { id: owner._id, name: owner.name, username: owner.username, tgId: owner.tgId }
          : null,
      };
    });
  },
});

export const reviewTransaction = mutation({
  args: {
    token: v.string(),
    transactionId: v.id("walletTransactions"),
    status: v.union(v.literal("confirmed"), v.literal("failed")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const tr = await ctx.db.get(args.transactionId);
    if (!tr) throw new Error("تراکنش یافت نشد");
    if (tr.status !== "pending") throw new Error("تراکنش قبلاً بررسی شده است");
    const wallet = await ctx.db.get(tr.walletId);
    if (wallet && args.status === "confirmed") {
      if (tr.type === "deposit") {
        // USDT deposits are committed to the engine (frozen); toman deposits
        // stay available in the toman wallet for coin/VIP purchases.
        if (tr.asset === "IRT") {
          await ctx.db.patch(wallet._id, { balance: (wallet.balance ?? 0) + tr.amount });
        } else {
          // USDT → committed to the engine; keep the earliest freeze time so the
          // minimum-circulation rule is enforced from the first committed deposit.
          await ctx.db.patch(wallet._id, {
            frozen: (wallet.frozen ?? 0) + tr.amount,
            frozenSince: wallet.frozenSince && wallet.frozenSince > 0 ? wallet.frozenSince : Date.now(),
          });
        }
      } else if (tr.type === "withdrawal") {
        await ctx.db.patch(wallet._id, { balance: Math.max(0, (wallet.balance ?? 0) - tr.amount) });
      } else if (tr.type === "unfreeze") {
        // unfreeze request approved: move frozen USDT back to available balance
        const frozen = wallet.frozen ?? 0;
        const amount = Math.min(frozen, tr.amount);
        const nextFrozen = Math.max(0, frozen - amount);
        await ctx.db.patch(wallet._id, {
          frozen: nextFrozen,
          frozenSince: nextFrozen <= 0 ? 0 : wallet.frozenSince ?? Date.now(),
          balance: (wallet.balance ?? 0) + amount,
        });
      }
    }
    const review = (args.reason ?? "").trim().slice(0, 300);
    await ctx.db.patch(args.transactionId, {
      status: args.status,
      note: review ? `${tr.note ?? ""} | بررسی: ${review}` : tr.note,
    });
    await audit(
      ctx,
      `wallet.${args.status}`,
      admin.username,
      admin._id,
      String(tr.walletId),
      `${tr.type}=${tr.amount}${review ? ` (${review})` : ""}`,
    );
    // notify the owner in Telegram when their deposit/withdrawal is reviewed
    if (tr.userId) {
      const owner = await ctx.db.get(tr.userId);
      if (owner?.tgId) {
        const okFa = args.status === "confirmed" ? "✅ تأیید شد" : "❌ رد شد";
        const okEn = args.status === "confirmed" ? "approved" : "rejected";
        const typeFa = tr.type === "deposit" ? "واریز" : "برداشت";
        try {
          await ctx.scheduler.runAfter(0, internal.notify.notifyChat, {
            chatId: String(owner.tgId),
            text: `🐺 <b>Trading Wolf AI</b>\n${typeFa} شما ${okFa} (${okEn})\n💰 مبلغ: ${tr.amount} ${tr.asset}\n${review ? `📝 دلیل: ${review}` : ""}`,
          });
        } catch {
          // ignore
        }
      }
    }
  },
});

// ─── VIP ───────────────────────────────────────────────────────────────────

export const listVipPackages = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("vipPackages").collect();
  },
});

export const saveVipPackage = mutation({
  args: {
    token: v.string(),
    key: v.string(),
    name: v.string(),
    nameFa: v.string(),
    price: v.number(),
    durationDays: v.number(),
    minCapital: v.number(),
    maxCapital: v.number(),
    features: v.array(v.string()),
    featuresFa: v.array(v.string()),
    riskDisclosure: v.string(),
    terms: v.string(),
    status: v.boolean(),
    discountPercent: v.optional(v.number()),
    giftCoins: v.optional(v.number()),
    commissionPct: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    if (!/^[a-z0-9_-]{2,40}$/i.test(args.key)) throw new Error("invalid_package_key");
    if (args.price < 0 || args.durationDays < 1) {
      throw new Error("invalid_package_values");
    }
    const discountPercent = Math.max(0, Math.min(90, args.discountPercent ?? 0));
    const giftCoins = Math.max(0, Math.floor(args.giftCoins ?? 0));
    const commissionPct = Math.max(0, Math.min(100, args.commissionPct ?? 1));
    const existing = await ctx.db.query("vipPackages").filter((q: any) => q.eq(q.field("key"), args.key)).first();
    const payload = {
      name: args.name.trim().slice(0, 80),
      nameFa: args.nameFa.trim().slice(0, 80),
      price: args.price,
      durationDays: args.durationDays,
      minCapital: args.minCapital,
      maxCapital: args.maxCapital,
      commissionPct,
      features: args.features.slice(0, 20).map((x) => x.slice(0, 200)),
      featuresFa: args.featuresFa.slice(0, 20).map((x) => x.slice(0, 200)),
      riskDisclosure: args.riskDisclosure.slice(0, 2000),
      terms: args.terms.slice(0, 4000),
      status: args.status,
      discountPercent,
      giftCoins,
    };
    if (existing) await ctx.db.patch(existing._id, payload);
    else await ctx.db.insert("vipPackages", { key: args.key, ...payload });
    await audit(ctx, "vip.package.saved", admin.username, admin._id, args.key, `price=${args.price} discount=${discountPercent}% gift=${giftCoins}`);
  },
});

export const requestVip = mutation({
  args: { token: v.string(), packageKey: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    const pkg = await ctx.db
      .query("vipPackages")
      .filter((q: any) => q.eq(q.field("key"), args.packageKey))
      .first();
    if (!pkg || pkg.status !== true) throw new Error("پکیج یافت نشد");
    // Package price is in USDT — apply discount, then deduct from the user's USDT wallet.
    const discount = Math.max(0, Math.min(100, Number(pkg.discountPercent ?? 0)));
    const giftCoins = Number(pkg.giftCoins ?? 0);
    const usdtPrice = pkg.price ?? 0;
    const finalPrice = Math.max(0, Math.round(usdtPrice * (1 - discount / 100) * 100) / 100);
    // Deduct package fee from USDT wallet
    const allWallets = await ctx.db.query("wallets").withIndex("by_owner", (q: any) => q.eq("owner", user._id)).collect();
    const usdtW = allWallets.find((w: any) => w.asset === "USDT");
    const usdtBal = usdtW?.balance ?? 0;
    if (finalPrice > 0 && usdtBal < finalPrice) {
      throw new Error(`موجودی USDT کافی نیست — هزینه بسته: ${finalPrice} USDT`);
    }
    if (finalPrice > 0 && usdtW) {
      await ctx.db.patch(usdtW._id, { balance: usdtBal - finalPrice });
      await ctx.db.insert("walletTransactions", {
        walletId: usdtW._id, userId: user._id, type: "debit", asset: "USDT",
        amount: finalPrice, status: "confirmed",
        note: `خرید اشتراک ${pkg.nameFa}`, ref: `vip:${args.packageKey}`,
        created: Date.now(),
      });
    }
    // Gift wolf coins included in the package
    if (giftCoins > 0) {
      const wallet = (await ctx.db.query("wallets").withIndex("by_owner", (q: any) => q.eq("owner", user._id)).collect())
        .find((w: any) => w.asset === "WOLF") ?? null;
      if (wallet) {
        await ctx.db.patch(wallet._id, { balance: (wallet.balance ?? 0) + giftCoins });
      } else {
        await ctx.db.insert("wallets", {
          owner: user._id, asset: "WOLF", network: "WOLF", balance: giftCoins, enabled: true,
        });
      }
      await ctx.db.insert("coinTransactions", {
        userId: user._id, currency: "wolf", delta: giftCoins,
        balanceAfter: (wallet?.balance ?? 0) + giftCoins,
        reason: `سکه هدیه اشتراک ${pkg.nameFa}`, ref: `vip:${args.packageKey}`,
        created: Date.now(),
      });
    }
    // Create VIP request
    await ctx.db.insert("vipRequests", {
      userId: user._id,
      userName: user.name ?? user.username ?? String(user.tgId ?? ""),
      packageKey: args.packageKey,
      capital: 0,
      status: "pending",
      created: Date.now(),
    });
    await log(ctx, "INFO", "vip.request", `user=${user.username} pkg=${args.packageKey}`, "api");
    await notifyAdminTg(
      ctx,
      `👑 <b>درخواست جدید VIP</b>\n👤 ${user.name ?? user.username ?? ""} (@${user.username ?? ""})\n📦 پکیج: <b>${pkg.nameFa}</b>\n💰 هزینه: ${finalPrice} USDT از کیف پول کسر شد`,
    );
  },
});

export const listVipRequests = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    const [requests, users] = await Promise.all([
      ctx.db.query("vipRequests").withIndex("by_status", (q: any) => q.eq("status", "pending")).collect(),
      ctx.db.query("users").collect(),
    ]);
    const userById = new Map<string, any>();
    for (const u of users) userById.set(u._id, u);
    return requests.map((r) => ({
      id: r._id,
      userId: r.userId,
      userName: r.userName,
      packageKey: r.packageKey,
      capital: r.capital,
      status: r.status,
      created: r.created,
      username: userById.get(r.userId)?.username,
    }));
  },
});

export const reviewVip = mutation({
  args: {
    token: v.string(),
    requestId: v.id("vipRequests"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    review: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const req = await ctx.db.get(args.requestId);
    if (!req) throw new Error("درخواست یافت نشد");
    if (req.status !== "pending") throw new Error("درخواست قبلاً بررسی شده است");

    if (args.status === "approved") {
      const pkg = await ctx.db
        .query("vipPackages")
        .filter((q: any) => q.eq(q.field("key"), req.packageKey))
        .first();
      const durationDays = pkg?.durationDays ?? 30;
      await ctx.db.insert("vipContracts", {
        userId: req.userId,
        packageKey: req.packageKey,
        capital: req.capital,
        fee: 0,
        durationDays,
        withdrawalRules: pkg?.riskDisclosure ?? "",
        lossResponsibility: pkg?.riskDisclosure ?? "",
        noGuaranteedReturn: "بازدهی تضمینی وجود ندارد",
        terms: pkg?.terms ?? "",
        status: "active",
        created: Date.now(),
      });
      await ctx.db.patch(req.userId, {
        isVip: true,
        vipPackage: req.packageKey,
        vipExpiresAt: Date.now() + durationDays * 86400000,
      });
    } else {
      // ── REJECTED → refund the package cost to the user's toman wallet ──
      const pkg = await ctx.db
        .query("vipPackages")
        .filter((q: any) => q.eq(q.field("key"), req.packageKey))
        .first();
      if (pkg && (pkg.price ?? 0) > 0) {
        const rate = Number((await getSetting(ctx, "usdt.tomanRate")) ?? 95000);
        const discount = Math.max(0, Math.min(100, Number(pkg.discountPercent ?? 0)));
        const refund = Math.round((pkg.price * rate) * (1 - discount / 100));
        const tomanW = (await ctx.db.query("wallets").withIndex("by_owner", (q: any) => q.eq("owner", req.userId)).collect())
          .find((w: any) => w.asset === "IRT");
        if (tomanW) {
          const bal = tomanW.balance ?? 0;
          await ctx.db.patch(tomanW._id, { balance: bal + refund });
          await ctx.db.insert("coinTransactions", {
            userId: req.userId, currency: "toman", delta: refund,
            balanceAfter: bal + refund,
            reason: `برگشت وجه اشتراک ${pkg.nameFa} (رد درخواست)`, ref: `vip-refund:${req.packageKey}`,
            created: Date.now(),
          });
        }
        // refund gift coins if they were granted at request time
        const gift = Number(pkg.giftCoins ?? 0);
        if (gift > 0) {
          const w = (await ctx.db.query("wallets").withIndex("by_owner", (q: any) => q.eq("owner", req.userId)).collect())
            .find((x: any) => x.asset === "WOLF");
          if (w) {
            const bal = w.balance ?? 0;
            await ctx.db.patch(w._id, { balance: Math.max(0, bal - gift) });
            await ctx.db.insert("coinTransactions", {
              userId: req.userId, currency: "wolf", delta: -gift,
              balanceAfter: Math.max(0, bal - gift),
              reason: `برگشت سکه هدیه اشتراک ${pkg.nameFa}`, ref: `vip-refund:${req.packageKey}`,
              created: Date.now(),
            });
          }
        }
      }
    }
    await ctx.db.patch(args.requestId, {
      status: args.status,
      review: args.review,
      reviewAt: Date.now(),
      reviewedBy: admin.username,
    });
    await audit(ctx, `vip.${args.status}`, admin.username, admin._id, req.userName, `${req.packageKey}=${req.capital}`);
  },
});

// ─── positions ─────────────────────────────────────────────────────────────

export const listOpenPositions = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await resolveWolfUser(ctx, token);
    const [positions, analyses] = await Promise.all([
      ctx.db.query("open_positions").collect(),
      ctx.db.query("trade_analysis").collect(),
    ]);
    const analysisByPosition = new Map<string, any>();
    for (const a of analyses) analysisByPosition.set(a.positionId, a);
    return positions.map((p) => ({
      id: p._id,
      symbol: p.symbol,
      market: p.market,
      side: p.side,
      entry: p.entry,
      current: p.current,
      quantity: p.quantity,
      size: p.size,
      leverage: p.leverage,
      margin: p.margin,
      pnl: p.pnl,
      pnlPct: p.pnlPct,
      score: p.score,
      confidence: p.confidence,
      strategyKeys: p.strategyKeys,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      targets: p.targets,
      mode: p.mode,
      source: p.source,
      status: p.status,
      openTime: p.openTime,
      lastUpdate: p.lastUpdate,
      analysis: analysisByPosition.get(p._id) ?? null,
    }));
  },
});

export const closePosition = mutation({
  args: {
    token: v.string(),
    positionId: v.id("open_positions"),
    closeReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const p = await ctx.db.get(args.positionId);
    if (!p) throw new Error("پوزیشن یافت نشد");
    const reason = args.closeReason ?? "manual";
    await ctx.db.insert("closed_positions", {
      ...p,
      closePrice: p.current,
      closeTime: Date.now(),
      closeReason: reason,
      profit: p.pnl ?? 0,
    });
    await ctx.db.delete(args.positionId);
    await log(ctx, "TRADE", "admin.position.closed", `symbol=${p.symbol} reason=${reason}`, "api");
    await audit(ctx, "position.closed", admin.username, admin._id, p.symbol, reason);
  },
});

// ─── settings (admin-guarded) ─────────────────────────────────────────────

export const saveSettings = mutation({
  args: {
    token: v.string(),
    settings: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    for (const [k, val] of Object.entries(args.settings)) {
      if (!(k in DEFAULT_SETTINGS)) throw new Error(`unknown_setting:${k}`);
      if (typeof val === "string" && val.length > 4000) throw new Error(`setting_too_long:${k}`);
      // Never overwrite secrets with empty OR masked placeholder values.
      // The admin panel loads masked secrets ("AIza••••…wxyz") — saving those
      // back would destroy the real key (bullets are not valid in API keys and
      // make Gemini fetch crash with a ByteString error).
      const isSecret =
        k === "ai.key" ||
        k === "ai.key2" ||
        k === "telegram.token" ||
        k === "telegram.webhookSecret" ||
        k === "db.password" ||
        k === "tts.apiKey" ||
        k === "swapwallet.apiKey";
      const masked = typeof val === "string" && /[•…*]{3,}/.test(val);
      if (isSecret && (val === "" || val === undefined || val === null || masked)) {
        continue;
      }
      await setSetting(ctx, k, val, admin.username);
    }
    await log(ctx, "SECURITY", "settings.updated", `keys=${Object.keys(args.settings).join(",")}`, "api");
    await audit(ctx, "settings.updated", admin.username, admin._id, undefined, Object.keys(args.settings).join(","));
  },
});

export const engineControl = mutation({
  args: {
    token: v.string(),
    engineEnabled: v.optional(v.boolean()),
    autonomous: v.optional(v.boolean()),
    liveTradingEnabled: v.optional(v.boolean()),
    telegramEnabled: v.optional(v.boolean()),
    channelPostTrades: v.optional(v.boolean()),
    channelPostSignals: v.optional(v.boolean()),
    useAI: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const map: Record<string, any> = {
      ...(args.engineEnabled !== undefined ? { "engine.enabled": args.engineEnabled } : {}),
      ...(args.autonomous !== undefined ? { "engine.autonomous": args.autonomous } : {}),
      ...(args.liveTradingEnabled !== undefined ? { "trading.liveTradingEnabled": args.liveTradingEnabled } : {}),
      ...(args.telegramEnabled !== undefined ? { "telegram.enabled": args.telegramEnabled } : {}),
      ...(args.channelPostTrades !== undefined ? { "channel.postTrades": args.channelPostTrades } : {}),
      ...(args.channelPostSignals !== undefined ? { "channel.postSignals": args.channelPostSignals } : {}),
      ...(args.useAI !== undefined ? { "engine.useAI": args.useAI } : {}),
    };
    for (const [k, val] of Object.entries(map)) await setSetting(ctx, k, val, admin.username);
    await log(ctx, "SECURITY", "engine.control", JSON.stringify(map), "api");
    await audit(ctx, "engine.control", admin.username, admin._id, undefined, JSON.stringify(map));
  },
});

// ─── wallet deposit addresses (multi-network) ──────────────────────────────

export const listWalletAddresses = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("walletAddresses").collect();
    return rows
      .filter((a) => a.enabled)
      .sort((a, b) => a.asset.localeCompare(b.asset) || a.network.localeCompare(b.network))
      .map((a) => ({
        id: a._id,
        asset: a.asset,
        network: a.network,
        address: a.address,
        memo: a.memo,
        kind: a.kind === "withdraw" ? "withdraw" : "deposit",
        created: a.created,
      }));
  },
});

export const saveWalletAddress = mutation({
  args: {
    token: v.string(),
    asset: v.string(),
    network: v.string(),
    address: v.string(),
    memo: v.optional(v.string()),
    kind: v.optional(v.string()), // deposit | withdraw
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const kind = args.kind === "withdraw" ? "withdraw" : "deposit";
    const existing = await ctx.db
      .query("walletAddresses")
      .filter((q: any) => q.and(q.eq(q.field("network"), args.network), q.eq(q.field("kind"), kind)))
      .first();
    const payload = { asset: args.asset, address: args.address, memo: args.memo, kind, enabled: true, created: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("walletAddresses", { network: args.network, ...payload });
    }
    await audit(ctx, "wallet.address.saved", admin.username, admin._id, `${args.network} (${kind})`);
  },
});

export const removeWalletAddress = mutation({
  args: { token: v.string(), id: v.id("walletAddresses") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const row = await ctx.db.get(args.id);
    if (row) await ctx.db.patch(args.id, { enabled: false });
    await audit(ctx, "wallet.address.removed", admin.username, admin._id, row?.network);
  },
});

// ─── exchange / broker API accounts (encrypted at rest) ────────────────────

async function getOrCreateEncryptionKey(ctx: any): Promise<string> {
  let key = (await getSetting(ctx, "system.encryptionKey")) as string | undefined;
  if (!key) {
    key = randomToken(32);
    await setSetting(ctx, "system.encryptionKey", key);
  }
  return key;
}

export const listExchangeAccounts = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    const rows = await ctx.db.query("exchangeAccounts").collect();
    return rows.map((r) => ({
      id: r._id,
      name: r.name,
      provider: r.provider,
      accountId: r.accountId,
      environment: r.environment,
      enabled: r.enabled,
      status: r.status,
      lastTest: r.lastTest,
      lastError: r.lastError,
      balance: r.balance,
      apiKeyMasked: r.apiKeyEnc ? `${r.apiKeyEnc.slice(0, 6)}…${r.apiKeyEnc.slice(-4)}` : null,
    }));
  },
});

export const saveExchangeAccount = mutation({
  args: {
    token: v.string(),
    id: v.optional(v.id("exchangeAccounts")),
    name: v.string(),
    provider: v.string(),
    apiKey: v.string(),
    apiSecret: v.string(),
    passPhrase: v.optional(v.string()),
    accountId: v.optional(v.string()),
    environment: v.union(v.literal("demo"), v.literal("live")),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const key = await getOrCreateEncryptionKey(ctx);
    const doc = {
      name: args.name,
      provider: args.provider,
      apiKeyEnc: await aesEncrypt(args.apiKey, key),
      apiSecretEnc: await aesEncrypt(args.apiSecret, key),
      passPhraseEnc: args.passPhrase ? await aesEncrypt(args.passPhrase, key) : undefined,
      accountId: args.accountId,
      environment: args.environment,
      enabled: args.enabled,
      status: "untested",
      updated: Date.now(),
    };
    if (args.id) {
      await ctx.db.patch(args.id, doc);
    } else {
      await ctx.db.insert("exchangeAccounts", { ...doc, created: Date.now() });
    }
    await audit(ctx, "exchange.saved", admin.username, admin._id, args.provider, args.name);
  },
});

export const removeExchangeAccount = mutation({
  args: { token: v.string(), id: v.id("exchangeAccounts") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    await ctx.db.delete(args.id);
    await audit(ctx, "exchange.removed", admin.username, admin._id);
  },
});

/** Toggle an exchange account on/off — the engine routes to enabled accounts. */
export const setExchangeEnabled = mutation({
  args: { token: v.string(), id: v.id("exchangeAccounts"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    await ctx.db.patch(args.id, { enabled: args.enabled, updated: Date.now() });
    await audit(ctx, args.enabled ? "exchange.enabled" : "exchange.disabled", admin.username, admin._id);
  },
});

// ─── notifications (send + receive) ───────────────────────────────────────

export const listNotifications = query({
  args: { token: v.string(), mine: v.optional(v.boolean()) },
  handler: async (ctx, { token, mine }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) return [];
    const now = Date.now();
    let rows = await ctx.db.query("notifications").order("desc").take(120);
    if (mine) {
      rows = rows.filter((n) => n.broadcast || n.userId === user._id);
      // user feed: hide notifications seen more than 24 hours ago, keep
      // everything unseen plus anything seen within the last 24 hours
      rows = rows.filter((n) => !n.seenAt || now - n.seenAt < 24 * 3600 * 1000);
    }
    return rows.map((n) => ({
      id: n._id,
      type: n.type,
      titleFa: n.titleFa,
      textFa: n.textFa,
      titleEn: n.titleEn,
      textEn: n.textEn,
      broadcast: n.broadcast,
      seen: n.seen,
      seenAt: n.seenAt ?? null,
      tgSent: n.tgSent,
      created: n.created,
    }));
  },
});

export const createNotification = mutation({
  args: {
    token: v.string(),
    type: v.string(),
    titleFa: v.string(),
    textFa: v.optional(v.string()),
    titleEn: v.optional(v.string()),
    textEn: v.optional(v.string()),
    broadcast: v.boolean(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const now = Date.now();
    await ctx.db.insert("notifications", {
      userId: args.userId,
      broadcast: args.broadcast,
      type: args.type,
      titleFa: args.titleFa,
      textFa: args.textFa,
      titleEn: args.titleEn,
      textEn: args.textEn,
      seen: false,
      tgSent: false,
      created: now,
    });
    // Telegram delivery: targeted notification → that user's DM,
    // broadcast → the configured channel (if telegram is enabled).
    if (args.userId) {
      const target = await ctx.db.get(args.userId);
      const chatId = target?.tgId ? String(target.tgId) : null;
      if (chatId) {
        await ctx.scheduler.runAfter(0, internal.notify.notifyChat, {
          chatId,
          text: `🔔 <b>${args.titleFa}</b>\n${args.textFa ?? ""}`,
        });
      }
    } else if (args.broadcast) {
      await ctx.scheduler.runAfter(0, internal.notify.notifyChannel, {
        text: `🔔 <b>${args.titleFa}</b>\n${args.textFa ?? ""}`,
        buttonText: "مشاهده",
      });
    }
    await log(ctx, "INFO", "notification.created", `type=${args.type} broadcast=${args.broadcast}`, "api");
    await audit(ctx, "notification.created", admin.username, admin._id, args.titleFa);
  },
});

export const markNotificationSeen = mutation({
  args: { token: v.string(), id: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    const n = await ctx.db.get(args.id);
    if (n && (n.broadcast || n.userId === user?._id)) {
      await ctx.db.patch(args.id, { seen: true, seenAt: Date.now() });
    }
  },
});

// ─── emergency controls (admin only) ──────────────────────────────────────
//   • emergencyStop      → hard stop: engine loop halts immediately
//   • pauseNewTrades     → soft pause: monitoring continues, no new positions
//   • closeAllPositions  → close every open position (manual close reason)

export const emergencyStop = mutation({
  args: { token: v.string(), stop: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    await setSetting(ctx, "engine.emergencyStop", args.stop, admin.username);
    if (args.stop) {
      await setSetting(ctx, "engine.enabled", false, admin.username);
      await setSetting(ctx, "engine.status", "EMERGENCY_STOP", admin.username);
    }
    await log(ctx, "CRITICAL", "engine.emergencyStop", `stop=${args.stop}`, "api");
    await audit(ctx, args.stop ? "engine.emergency_stop" : "engine.emergency_resume", admin.username, admin._id);
  },
});

export const pauseNewTrades = mutation({
  args: { token: v.string(), paused: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    await setSetting(ctx, "engine.pauseNewTrades", args.paused, admin.username);
    await log(ctx, "WARNING", "engine.pauseNewTrades", `paused=${args.paused}`, "api");
    await audit(ctx, args.paused ? "engine.pause_new_trades" : "engine.resume_new_trades", admin.username, admin._id);
  },
});

export const closeAllPositions = mutation({
  args: { token: v.string(), confirmPhrase: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    if (args.confirmPhrase.trim().toLowerCase() !== "ببند" && args.confirmPhrase.trim().toLowerCase() !== "close") {
      throw new Error("برای بستن همه پوزیشن‌ها عبارت تأیید را وارد کنید (ببند)");
    }
    const open = await ctx.db.query("open_positions").collect();
    const now = Date.now();
    for (const p of open) {
      const { _id, _creationTime, ...position } = p;
      await ctx.db.insert("closed_positions", {
        ...position,
        closePrice: p.current ?? p.entry,
        closeTime: now,
        closeReason: "emergency_close_all",
        profit: p.pnl ?? 0,
      });
      await ctx.db.delete(_id);
    }
    await log(ctx, "CRITICAL", "engine.closeAllPositions", `closed=${open.length}`, "api");
    await audit(ctx, "engine.close_all_positions", admin.username, admin._id, undefined, `count=${open.length}`);
    return { closed: open.length };
  },
});

// ─── reports (daily / weekly / monthly / all time) ────────────────────────
// Aggregates from closed_positions + open_positions. Admin-only.

function dayStart(offsetMs: number): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.getTime() - offsetMs;
}

export const tradingReports = query({
  args: { token: v.string(), period: v.string() },
  handler: async (ctx, { token, period }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return null;
    const now = Date.now();
    const DAY = 86400000;
    const from =
      period === "daily" ? dayStart(0)
      : period === "weekly" ? now - 7 * DAY
      : period === "monthly" ? now - 30 * DAY
      : 0;
    const closed = (await ctx.db.query("closed_positions").collect()).filter((p: any) => p.closeTime >= from);
    const open = await ctx.db.query("open_positions").collect();

    const wins = closed.filter((p: any) => (p.profit ?? 0) > 0);
    const losses = closed.filter((p: any) => (p.profit ?? 0) < 0);
    const realized = closed.reduce((s: number, p: any) => s + (p.profit ?? 0), 0);
    const unrealized = open.reduce((s: number, p: any) => s + (p.pnl ?? 0), 0);
    const grossProfit = wins.reduce((s: number, p: any) => s + (p.profit ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((s: number, p: any) => s + (p.profit ?? 0), 0));
    const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // best / worst strategy + symbol
    const byStrategy = new Map<string, { trades: number; pnl: number }>();
    const bySymbol = new Map<string, { trades: number; pnl: number }>();
    for (const p of closed) {
      for (const key of p.strategyKeys ?? []) {
        const e = byStrategy.get(key) ?? { trades: 0, pnl: 0 };
        e.trades++;
        e.pnl += p.profit ?? 0;
        byStrategy.set(key, e);
      }
      const s = bySymbol.get(p.symbol) ?? { trades: 0, pnl: 0 };
      s.trades++;
      s.pnl += p.profit ?? 0;
      bySymbol.set(p.symbol, s);
    }
    const rank = (m: Map<string, { trades: number; pnl: number }>) =>
      [...m.entries()]
        .filter(([, v]) => v.trades >= 1)
        .sort((a, b) => b[1].pnl - a[1].pnl);
    const strategies = rank(byStrategy);
    const symbols = rank(bySymbol);

    // drawdown: running max of equity from closed trades
    let equity = 0;
    let peak = 0;
    let maxDD = 0;
    for (const p of closed.sort((a: any, b: any) => a.closeTime - b.closeTime)) {
      equity += p.profit ?? 0;
      peak = Math.max(peak, equity);
      maxDD = Math.max(maxDD, peak - equity);
    }

    // per-trade analytics (Sharpe on trade returns, expectancy, avg RR)
    const returns = closed.map((p: any) => {
      const denom = Math.max(1e-9, Math.abs(p.entry - (p.stopLoss ?? p.entry)) * (p.quantity ?? 1));
      const r = (p.profit ?? 0) / denom;
      return r;
    });
    const meanR = returns.length ? returns.reduce((s: number, r: number) => s + r, 0) / returns.length : 0;
    const sdR = returns.length > 1
      ? Math.sqrt(returns.reduce((s: number, r: number) => s + (r - meanR) ** 2, 0) / (returns.length - 1))
      : 0;
    const sharpe = sdR > 0 ? Number(((meanR / sdR) * Math.sqrt(365)).toFixed(2)) : 0;
    const avgWin = wins.length ? Number((wins.reduce((s: number, p: any) => s + (p.profit ?? 0), 0) / wins.length).toFixed(4)) : 0;
    const avgLoss = losses.length ? Number((losses.reduce((s: number, p: any) => s + (p.profit ?? 0), 0) / losses.length).toFixed(4)) : 0;
    const avgRr = closed.length
      ? Number((closed.reduce((s: number, p: any) => {
          const risk = Math.max(1e-9, Math.abs(p.entry - (p.stopLoss ?? p.entry)));
          const reward = Math.abs((p.closePrice ?? p.current ?? p.entry) - p.entry);
          return s + reward / risk;
        }, 0) / closed.length).toFixed(2))
      : 0;

    return {
      period,
      from,
      to: now,
      trades: closed.length,
      openPositions: open.length,
      wins: wins.length,
      losses: losses.length,
      winRate: Number(winRate.toFixed(2)),
      realizedPnl: Number(realized.toFixed(4)),
      unrealizedPnl: Number(unrealized.toFixed(4)),
      totalPnl: Number((realized + unrealized).toFixed(4)),
      profitFactor: Number.isFinite(profitFactor) ? Number(profitFactor.toFixed(2)) : profitFactor,
      grossProfit: Number(grossProfit.toFixed(4)),
      grossLoss: Number(grossLoss.toFixed(4)),
      maxDrawdown: Number(maxDD.toFixed(4)),
      sharpe,
      expectancy: Number(meanR.toFixed(4)),
      avgWin,
      avgLoss,
      avgRr,
      bestStrategy: strategies[0] ? { key: strategies[0][0], trades: strategies[0][1].trades, pnl: Number(strategies[0][1].pnl.toFixed(4)) } : null,
      worstStrategy: strategies.length ? { key: strategies[strategies.length - 1][0], trades: strategies[strategies.length - 1][1].trades, pnl: Number(strategies[strategies.length - 1][1].pnl.toFixed(4)) } : null,
      bestSymbol: symbols[0] ? { symbol: symbols[0][0], trades: symbols[0][1].trades, pnl: Number(symbols[0][1].pnl.toFixed(4)) } : null,
      worstSymbol: symbols.length ? { symbol: symbols[symbols.length - 1][0], trades: symbols[symbols.length - 1][1].trades, pnl: Number(symbols[symbols.length - 1][1].pnl.toFixed(4)) } : null,
    };
  },
});

// ─── risk preset + AI advisor ─────────────────────────────────────────────

export const applyRiskPreset = mutation({
  args: { token: v.string(), preset: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const applied = await applyRiskPresetStore(ctx, args.preset, admin.username);
    await log(ctx, "SECURITY", "risk.preset.applied", `preset=${args.preset}`, "api");
    await audit(ctx, "risk.preset.applied", admin.username, admin._id, args.preset, JSON.stringify(applied));
    return { ok: true, applied };
  },
});

// risk advisor: rule-based explanation for the current settings + guidance.
// (AI-powered enrichment is offered via the ai.advisor mutation when a key is set.)
export const riskAdvisor = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return null;
    const settings = await getSettingsMap(ctx);
    const minScore = Number(settings["risk.minScore"] ?? 80);
    const riskPct = Number(settings["risk.riskPerTrade"] ?? 1.5);
    const maxLeverage = Number(settings["risk.maxLeverage"] ?? 20);
    const maxDailyLoss = Number(settings["risk.maxDailyLoss"] ?? 8);
    const maxOpen = Number(settings["risk.maxOpenPositions"] ?? 8);
    const exposure = Number(settings["risk.maxExposure"] ?? 35);
    const capital = Number(settings["risk.virtualCapital"] ?? 1000);
    const real = Number(settings["risk.realCapital"] ?? 100);

    const notes: string[] = [];
    if (minScore < 70) notes.push("حداقل اسکور پایین است؛ احتمال ورود به معاملات ضعیف بیشتر می‌شود.");
    if (riskPct > 2) notes.push("ریسک هر معامله بالاست؛ برای شروع ۱ تا ۱.۵٪ پیشنهاد می‌شود.");
    if (maxLeverage > 25) notes.push("اهرم بالا می‌تواند ضرر را چند برابر کند.");
    if (maxDailyLoss > 10) notes.push("سقف ضرر روزانه بالای ۱۰٪ ریسک سنگینی دارد.");
    if (maxOpen > 8) notes.push("بیش از ۸ پوزیشن همزمان مدیریت ریسک را دشوار می‌کند.");
    if (exposure > 50) notes.push("در معرض قرار گرفتن بیش از ۵۰٪ سرمایه ریسک‌ناپذیر است.");
    if (capital <= 0) notes.push("سرمایه موتور تعریف نشده است.");
    if (real <= 0) notes.push("موجودی واقعی صرافی تعریف نشده — سفارش واقعی ارسال نمی‌شود.");
    const riskPerTradeUsd = capital * (riskPct / 100);
    const suggested = notes.length === 0 ? "تنظیمات فعلی در محدوده‌ی منطقی قرار دارد." : notes.join(" ");

    return {
      preset: settings["risk.preset"] ?? "balanced",
      summaryFa: suggested,
      riskPerTradeUsd: Number(riskPerTradeUsd.toFixed(2)),
      multiplier: real > 0 ? Number((real / Math.max(1, capital)).toFixed(4)) : 0,
      checks: {
        minScoreOk: minScore >= 70,
        riskPerTradeOk: riskPct <= 2,
        leverageOk: maxLeverage <= 25,
        dailyLossOk: maxDailyLoss <= 10,
        openPositionsOk: maxOpen <= 8,
        exposureOk: exposure <= 50,
      },
    };
  },
});

// ─── support system ───────────────────────────────────────────────────────

export const createTicket = mutation({
  args: { token: v.string(), subject: v.string(), message: v.string(), priority: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    const subject = args.subject.trim().slice(0, 200);
    const text = args.message.trim().slice(0, 4000);
    if (!subject || !text) throw new Error("موضوع و پیام الزامی است");
    const ticketId = await ctx.db.insert("supportTickets", {
      userId: user._id,
      subject,
      status: "open",
      priority: args.priority === "high" || args.priority === "low" ? args.priority : "normal",
      lastActivity: Date.now(),
      created: Date.now(),
    });
    await ctx.db.insert("supportMessages", {
      ticketId,
      userId: user._id,
      fromAdmin: false,
      text,
      created: Date.now(),
    });
    await log(ctx, "INFO", "support.ticket.created", `user=${user.username} ticket=${ticketId}`, "api");
    return { id: ticketId };
  },
});

export const listMyTickets = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) return [];
    const tickets = await ctx.db
      .query("supportTickets")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
    const out = [];
    for (const t of tickets) {
      const msgs = await ctx.db
        .query("supportMessages")
        .withIndex("by_ticket", (q: any) => q.eq("ticketId", t._id))
        .order("asc")
        .collect();
      out.push({ ...t, messages: msgs });
    }
    return out;
  },
});

export const listAllTickets = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    const tickets = await ctx.db.query("supportTickets").order("desc").take(100);
    const users = await ctx.db.query("users").collect();
    const userById = new Map<string, any>();
    for (const u of users) userById.set(u._id, u);
    const out = [];
    for (const t of tickets) {
      const msgs = await ctx.db
        .query("supportMessages")
        .withIndex("by_ticket", (q: any) => q.eq("ticketId", t._id))
        .order("asc")
        .collect();
      out.push({
        ...t,
        username: userById.get(t.userId)?.username ?? null,
        name: userById.get(t.userId)?.name ?? null,
        messages: msgs.map((m: any) => {
          const sender = m.userId ? userById.get(m.userId) : undefined;
          return {
            id: m._id,
            fromAdmin: m.fromAdmin,
            text: m.text,
            created: m.created,
            senderName: m.fromAdmin ? "admin" : sender?.username ?? sender?.name ?? m.userId,
          };
        }),
      });
    }
    return out;
  },
});

export const replyTicket = mutation({
  args: { token: v.string(), ticketId: v.id("supportTickets"), text: v.string(), close: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const admin = await requireStaff(ctx, args.token);
    const text = args.text.trim().slice(0, 4000);
    if (!text) throw new Error("پیام خالی است");
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) throw new Error("تیکت یافت نشد");
    await ctx.db.insert("supportMessages", {
      ticketId: args.ticketId,
      fromAdmin: true,
      text,
      created: Date.now(),
    });
    await ctx.db.patch(args.ticketId, {
      status: args.close ? "closed" : "answered",
      lastActivity: Date.now(),
    });
    await audit(ctx, "support.replied", admin.username, admin._id, String(args.ticketId));
  },
});

export const setTicketStatus = mutation({
  args: { token: v.string(), ticketId: v.id("supportTickets"), status: v.string() },
  handler: async (ctx, args) => {
    await requireStaff(ctx, args.token);
    const valid = ["open", "pending", "answered", "closed"] as const;
    if (!(valid as readonly string[]).includes(args.status)) throw new Error("وضعیت نامعتبر است");
    await ctx.db.patch(args.ticketId, { status: args.status as (typeof valid)[number], lastActivity: Date.now() });
  },
});

/** User replies to their own ticket (ping-pong) and can close it. */
export const userReplyTicket = mutation({
  args: { token: v.string(), ticketId: v.id("supportTickets"), text: v.string(), close: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    const text = args.text.trim().slice(0, 4000);
    if (!text) throw new Error("پیام خالی است");
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket || ticket.userId !== user._id) throw new Error("تیکت یافت نشد");
    if (ticket.status === "closed") throw new Error("این تیکت بسته شده است");
    await ctx.db.insert("supportMessages", {
      ticketId: args.ticketId,
      userId: user._id,
      fromAdmin: false,
      text,
      created: Date.now(),
    });
    await ctx.db.patch(args.ticketId, {
      status: args.close ? "closed" : "pending",
      lastActivity: Date.now(),
    });
    await log(ctx, "INFO", "support.user.replied", `user=${user.username} ticket=${args.ticketId}`, "api");
    return { ok: true };
  },
});

// ─── referrals ────────────────────────────────────────────────────────────

const REFERRAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeReferralCode(): string {
  let code = "WOLF-";
  for (let i = 0; i < 6; i++) {
    code += REFERRAL_ALPHABET[Math.floor(Math.random() * REFERRAL_ALPHABET.length)];
  }
  return code;
}

export async function ensureReferralCode(ctx: any, userId: any): Promise<string> {
  const existing = await ctx.db
    .query("referrals")
    .filter((q: any) => q.eq(q.field("referrerId"), userId))
    .first();
  if (existing) return existing.code;
  let code = makeReferralCode();
  for (let tries = 0; tries < 5; tries++) {
    const dup = await ctx.db.query("referrals").withIndex("by_code", (q: any) => q.eq("code", code)).first();
    if (!dup) break;
    code = makeReferralCode();
  }
  await ctx.db.insert("referrals", {
    code,
    referrerId: userId,
    status: "active",
    rewardEnabled: false,
    created: Date.now(),
  });
  return code;
}

async function getReferralCode(ctx: any, userId: any): Promise<string> {
  const existing = await ctx.db
    .query("referrals")
    .filter((q: any) => q.eq(q.field("referrerId"), userId))
    .first();
  if (existing) return existing.code;
  const raw = String(userId).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `WOLF-${raw.slice(-6) || "000000"}`;
}

export const myReferral = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) return null;
    const code = await getReferralCode(ctx, user._id);
    const refs = await ctx.db
      .query("referrals")
      .filter((q: any) => q.eq(q.field("referrerId"), user._id))
      .collect();
    const referred = refs.filter((r: any) => r.referredId).length;
    const rewardEnabled = (await getSetting(ctx, "coins.referralEnabled")) !== false;
    const domain = (await getSetting(ctx, "system.domain")) ?? "";
    // users who actually joined through this referral code
    const referredUsers: Array<{ username: string; name: string; joinedAt: number | null }> = [];
    for (const r of refs) {
      if (!r.referredId) continue;
      const u = await ctx.db.get(r.referredId);
      referredUsers.push({
        username: u?.username ?? u?.tgUsername ?? u?.name ?? "—",
        name: u?.name ?? "",
        joinedAt: r.created ?? u?.registeredAt ?? null,
      });
    }
    return {
      code,
      link: `${domain}/auth?ref=${code}`,
      referred,
      rewardEnabled,
      referredUsers,
    };
  },
});

export const applyReferral = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    const code = args.code.trim().toUpperCase();
    if (!code) return { ok: false, reason: "empty" };
    const ref = await ctx.db.query("referrals").withIndex("by_code", (q: any) => q.eq("code", code)).first();
    if (!ref) return { ok: false, reason: "not_found" };
    if (ref.referrerId === user._id) return { ok: false, reason: "self" };
    if (ref.referredId) return { ok: false, reason: "used" };
    await ctx.db.patch(ref._id, { referredId: user._id, status: "completed" });
    await log(ctx, "INFO", "referral.applied", `code=${code} by=${user.username}`, "api");
    return { ok: true };
  },
});

export const listReferrals = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    const [refs, users] = await Promise.all([ctx.db.query("referrals").collect(), ctx.db.query("users").collect()]);
    const userById = new Map<string, any>();
    for (const u of users) userById.set(u._id, u);
    return refs.map((r) => ({
      id: r._id,
      code: r.code,
      referrer: userById.get(r.referrerId)?.username ?? null,
      referred: r.referredId ? (userById.get(r.referredId)?.username ?? null) : null,
      status: r.status,
      rewardEnabled: r.rewardEnabled,
      created: r.created,
    }));
  },
});

/** Admin: learning history of the engine (win/loss lessons + AI reviews). */
export const listLearningHistory = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, limit }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    const rows = await ctx.db.query("learningHistory").order("desc").take(limit ?? 150);
    return rows.map((l: any) => ({
      id: l._id,
      symbol: l.symbol,
      timeframe: l.timeframe,
      strategies: l.strategies ?? [],
      decision: l.decision,
      result: l.result,
      pnl: l.pnl,
      error: l.error,
      aiReview: l.aiReview,
      lessons: l.lessons ?? [],
      created: l.created,
    }));
  },
});

/** Admin: permanently remove a user and their personal records. */
export const deleteUser = mutation({
  args: { token: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("کاربر یافت نشد");
    if (user._id === admin._id) throw new Error("نمی‌توانید حساب خودتان را حذف کنید");
    if (user.isAdmin || user.role === "admin") throw new Error("حذف مدیر مجاز نیست");
    // personal records
    const sessions = await ctx.db.query("wolfSessions").filter((q: any) => q.eq(q.field("userId"), args.userId)).collect();
    for (const s of sessions) await ctx.db.delete(s._id);
    const wallets = await ctx.db.query("wallets").withIndex("by_owner", (q: any) => q.eq("owner", args.userId)).collect();
    for (const w of wallets) {
      const txs = await ctx.db.query("walletTransactions").withIndex("by_wallet", (q: any) => q.eq("walletId", w._id)).collect();
      for (const t of txs) await ctx.db.delete(t._id);
      await ctx.db.delete(w._id);
    }
    const coins = await ctx.db.query("coinTransactions").withIndex("by_user", (q: any) => q.eq("userId", args.userId)).collect();
    for (const c of coins) await ctx.db.delete(c._id);
    const tickets = await ctx.db.query("supportTickets").withIndex("by_user", (q: any) => q.eq("userId", args.userId)).collect();
    for (const t of tickets) {
      const msgs = await ctx.db.query("supportMessages").withIndex("by_ticket", (q: any) => q.eq("ticketId", t._id)).collect();
      for (const m of msgs) await ctx.db.delete(m._id);
      await ctx.db.delete(t._id);
    }
    const notifs = await ctx.db.query("notifications").filter((q: any) => q.eq(q.field("userId"), args.userId)).collect();
    for (const n of notifs) await ctx.db.delete(n._id);
    const preds = await ctx.db.query("demoPredictions").withIndex("by_user", (q: any) => q.eq("userId", args.userId)).collect();
    for (const p of preds) await ctx.db.delete(p._id);
    // detach their referral code (keep the code so shared links stay valid)
    const refs = await ctx.db.query("referrals").filter((q: any) => q.eq(q.field("referrerId"), args.userId)).collect();
    for (const r of refs) {
      if (r.referredId) await ctx.db.patch(r._id, { status: "completed" });
      else await ctx.db.delete(r._id);
    }
    await ctx.db.delete(args.userId);
    await audit(ctx, "user.deleted", admin.username, admin._id, user.username ?? user.name, String(args.userId));
    await log(ctx, "SECURITY", "user.deleted", `user=${user.username ?? user.tgId}`, "api");
    return { ok: true };
  },
});

// ─── strategy performance (recompute from closed positions) ───────────────

export const refreshStrategyPerformance = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const admin = await requireAdmin(ctx, token);
    const closed = await ctx.db.query("closed_positions").collect();
    const agg = new Map<string, { trades: number; wins: number; pnl: number; rrSum: number; dd: number }>();
    for (const p of closed) {
      for (const key of p.strategyKeys ?? []) {
        const e = agg.get(key) ?? { trades: 0, wins: 0, pnl: 0, rrSum: 0, dd: 0 };
        e.trades++;
        if ((p.profit ?? 0) > 0) e.wins++;
        e.pnl += p.profit ?? 0;
        const slDist = Math.abs((p.stopLoss ?? p.entry) - p.entry);
        const tpDist = Math.abs((p.takeProfit ?? p.entry) - p.entry);
        e.rrSum += slDist > 0 ? tpDist / slDist : 0;
        agg.set(key, e);
      }
    }
    for (const [key, e] of agg) {
      const winRate = e.trades ? (e.wins / e.trades) * 100 : 0;
      const grossWin = closed
        .filter((p: any) => (p.strategyKeys ?? []).includes(key) && (p.profit ?? 0) > 0)
        .reduce((s, p) => s + (p.profit ?? 0), 0);
      const grossLoss = Math.abs(
        closed.filter((p: any) => (p.strategyKeys ?? []).includes(key) && (p.profit ?? 0) < 0).reduce((s, p) => s + (p.profit ?? 0), 0),
      );
      const existing = await ctx.db
        .query("strategyPerformance")
        .withIndex("by_strategy", (q: any) => q.eq("strategyKey", key))
        .first();
      const doc = {
        strategyKey: key,
        trades: e.trades,
        wins: e.wins,
        losses: e.trades - e.wins,
        winRate: Number(winRate.toFixed(2)),
        profitFactor: grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 99 : 0,
        avgPnl: e.trades ? Number((e.pnl / e.trades).toFixed(4)) : 0,
        avgRR: e.trades ? Number((e.rrSum / e.trades).toFixed(2)) : 0,
        maxDrawdown: 0,
        totalPnl: Number(e.pnl.toFixed(4)),
        updatedAt: Date.now(),
      };
      if (existing) await ctx.db.patch(existing._id, doc);
      else await ctx.db.insert("strategyPerformance", doc);
    }
    await audit(ctx, "strategy.performance.refreshed", admin.username, admin._id, undefined, `strategies=${agg.size}`);
    return { strategies: agg.size };
  },
});

export const listStrategyPerformance = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    const rows = await ctx.db.query("strategyPerformance").collect();
    return rows.sort((a: any, b: any) => b.totalPnl - a.totalPnl);
  },
});

// ─── engine logs (admin) ──────────────────────────────────────────────────

export const listEngineLogs = query({
  args: { token: v.string(), level: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { token, level, limit }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    let rows = await ctx.db.query("engineLogs").order("desc").take(limit ?? 200);
    if (level) rows = rows.filter((r: any) => r.level === level);
    return rows;
  },
});

export const listAuditLogs = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, limit }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    return ctx.db.query("auditLogs").order("desc").take(limit ?? 100);
  },
});

// ─── full user account detail (click a username in the wallet/users panel) ──

export const userDetail = query({
  args: { token: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const staff = await resolveStaff(ctx, args.token);
    if (!staff) return null;
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("کاربر یافت نشد");
    const [wallets, wtxs, coinTxs, auditRows, openPos, closedPos, notifications] = await Promise.all([
      ctx.db.query("wallets").withIndex("by_owner", (q: any) => q.eq("owner", args.userId)).collect(),
      ctx.db.query("walletTransactions").order("desc").take(300),
      ctx.db.query("coinTransactions").order("desc").take(200),
      ctx.db.query("auditLogs").order("desc").take(100),
      ctx.db.query("open_positions").collect(),
      ctx.db.query("closed_positions").collect(),
      ctx.db.query("notifications").order("desc").take(50),
    ]);
    const walletById = new Map<string, any>();
    for (const w of wallets) walletById.set(w._id, w);
    const usdtWallet = wallets.find((w: any) => w.asset === "USDT") ?? wallets[0];
    return {
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        tgId: user.tgId,
        tgUsername: user.tgUsername,
        phone: user.phone,
        gender: user.gender,
        birthday: user.birthday,
        role: user.role ?? "user",
        isVip: Boolean(user.isVip),
        vipPackage: user.vipPackage,
        vipExpiresAt: user.vipExpiresAt,
        enabled: user.enabled !== false,
        canTrade: user.canTrade !== false,
        registeredAt: user.registeredAt,
        lastActivity: user.lastActivity,
        theme: user.theme,
        language: user.language,
        tgLanguage: user.tgLanguage,
        walletAddress: user.walletAddress,
        channelVerified: Boolean(user.channelVerified),
        phoneVerified: Boolean(user.phoneVerified),
        notificationsEnabled: user.notificationsEnabled !== false,
      },
      balances: {
        usdt: usdtWallet?.balance ?? 0,
        toman: user.tomanBalance ?? wallets.find((w: any) => w.asset === "IRT")?.balance ?? 0,
        wolfCoins: user.wolfCoins ?? 0,
        realizedPnl: closedPos.filter((p: any) => p.source === "engine").reduce((s: number, p: any) => s + (p.profit ?? 0), 0),
      },
      wallets: wallets.map((w: any) => ({ id: w._id, asset: w.asset, network: w.network, balance: w.balance, enabled: w.enabled })),
      transactions: wtxs
        .filter((t: any) => t.userId === args.userId || walletById.has(String(t.walletId)))
        .filter((t: any) => {
          const w = walletById.get(String(t.walletId));
          return w && w.owner === args.userId;
        })
        .slice(0, 60)
        .map((t: any) => ({
          id: t._id,
          type: t.type,
          asset: t.asset,
          amount: t.amount,
          network: t.network,
          status: t.status,
          note: t.note,
          created: t.created,
        })),
      coinTransactions: coinTxs
        .filter((t: any) => t.userId === args.userId)
        .slice(0, 60)
        .map((t: any) => ({
          id: t._id,
          currency: t.currency,
          delta: t.delta,
          balanceAfter: t.balanceAfter,
          reason: t.reason,
          created: t.created,
        })),
      auditLogs: auditRows
        .filter((a: any) => a.target === (user.username ?? "") || a.target === args.userId)
        .slice(0, 40)
        .map((a: any) => ({ id: a._id, action: a.action, actor: a.actor, details: a.details, created: a.created })),
      openPositions: openPos.map((p: any) => ({
        id: p._id,
        symbol: p.symbol,
        side: p.side,
        entry: p.entry,
        current: p.current,
        pnl: p.pnl,
        score: p.score,
        openTime: p.openTime,
      })),
      notifications: notifications.filter((n: any) => n.broadcast || n.userId === args.userId).slice(0, 20).map((n: any) => ({
        id: n._id,
        type: n.type,
        titleFa: n.titleFa,
        seen: n.seen,
        created: n.created,
      })),
    };
  },
});

// ─── closed positions (admin history) ─────────────────────────────────────

export const listClosedPositions = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, limit }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    const rows = await ctx.db.query("closed_positions").order("desc").take(limit ?? 150);
    return rows.map((p: any) => ({
      id: p._id,
      symbol: p.symbol,
      market: p.market,
      side: p.side,
      entry: p.entry,
      current: p.closePrice ?? p.current,
      closePrice: p.closePrice,
      pnl: p.profit ?? 0,
      pnlPct: p.pnlPct,
      score: p.score,
      confidence: p.confidence,
      strategyKeys: p.strategyKeys,
      closeReason: p.closeReason,
      openTime: p.openTime,
      closeTime: p.closeTime,
      mode: p.mode,
    }));
  },
});

// ─── send position details to the Telegram channel ───────────────────────

export const sendPositionToTelegram = mutation({
  args: { token: v.string(), positionId: v.id("open_positions") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const p = await ctx.db.get(args.positionId);
    if (!p) throw new Error("پوزیشن یافت نشد");
    const digest = positionDigest(p);
    try {
      await ctx.scheduler.runAfter(0, internal.notify.notifyChannel, {
        text: digest,
        buttonText: "🔎 مشاهده جزئیات",
      });
    } catch {
      // ignore
    }
    await log(ctx, "INFO", "admin.position.sent_to_telegram", `symbol=${p.symbol}`, "api");
    await audit(ctx, "position.sent_to_telegram", admin.username, admin._id, p.symbol);
    return { ok: true };
  },
});

export const sendAllPositionsToTelegram = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const admin = await requireAdmin(ctx, token);
    const open = await ctx.db.query("open_positions").collect();
    if (!open.length) return { ok: false, sent: 0, reason: "no_open_positions" };
    let sent = 0;
    for (const p of open) {
      const digest = positionDigest(p);
      try {
        await ctx.scheduler.runAfter(sent * 1500, internal.notify.notifyChannel, {
          text: digest,
          buttonText: "🔎 مشاهده جزئیات",
        });
        sent++;
      } catch {
        // skip failed ones
      }
    }
    await log(ctx, "INFO", "admin.positions.bulk_sent_to_telegram", `count=${sent}`, "api");
    await audit(ctx, "positions.bulk_sent_to_telegram", admin.username, admin._id, undefined, `count=${sent}`);
    return { ok: true, sent };
  },
});

export const getPositionInternal = internalQuery({
  args: { positionId: v.id("open_positions") },
  handler: async (ctx, { positionId }) => ctx.db.get(positionId),
});

export const getSignalInternal = internalQuery({
  args: { signalId: v.id("signals") },
  handler: async (ctx, { signalId }) => ctx.db.get(signalId),
});

export const markSignalSent = internalMutation({
  args: { signalId: v.id("signals"), lang: v.union(v.literal("fa"), v.literal("en")) },
  handler: async (ctx, { signalId, lang }) => {
    await ctx.db.patch(signalId, lang === "fa" ? { sentFaAt: Date.now() } : { sentEnAt: Date.now() });
  },
});

export const candlesForSignal = internalQuery({
  args: { symbol: v.string(), timeframe: v.string() },
  handler: async (ctx, { symbol, timeframe }) => {
    const rows = await ctx.db
      .query("candles")
      .withIndex("by_symbol", (q: any) => q.eq("symbol", symbol))
      .take(6);
    const match = rows.find((r: any) => r.timeframe === timeframe) ?? rows[0];
    return (match?.data ?? []).slice(-28).map((c: any) => c.c);
  },
});
/** Full OHLC candles for a symbol/timeframe (used by the chart image). */
export const candlesOhlc = internalQuery({
  args: { symbol: v.string(), timeframe: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { symbol, timeframe, limit }) => {
    const rows = await ctx.db
      .query("candles")
      .withIndex("by_symbol", (q: any) => q.eq("symbol", symbol))
      .take(20);
    const row = rows.find((r: any) => r.timeframe === (timeframe ?? "15m")) ?? rows[0];
    return (row?.data ?? [])
      .slice(-(limit ?? 60))
      .map((c: any) => ({ o: c.o, h: c.h, l: c.l, c: c.c, t: c.t ?? c.time ?? Date.now() }));
  },
});

export const userSearch = query({
  args: { token: v.string(), q: v.string() },
  handler: async (ctx, { token, q }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    const needle = String(q ?? "").trim().toLowerCase();
    if (needle.length < 2) return [];
    const [users, wallets] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("wallets").collect(),
    ]);
    const balanceByOwner = new Map<string, number>();
    for (const w of wallets) balanceByOwner.set(w.owner, w.balance ?? 0);
    return users
      .filter((u: any) =>
        [u.username, u.name, u.tgUsername, u.phone, String(u.tgId ?? "")].some((s) =>
          String(s ?? "").toLowerCase().includes(needle),
        ),
      )
      .slice(0, 25)
      .map((u: any) => ({
        id: u._id,
        name: u.name,
        username: u.username,
        tgId: u.tgId,
        tgUsername: u.tgUsername,
        phone: u.phone,
        role: u.role ?? "user",
        isAdmin: u.isAdmin,
        isVip: u.isVip,
        vipExpiresAt: u.vipExpiresAt,
        enabled: u.enabled !== false,
        canTrade: u.canTrade !== false,
        lastActivity: u.lastActivity,
        balance: balanceByOwner.get(u._id) ?? 0,
      }));
  },
});

/**
 * Admin: per-provider AI monitoring card data.
 * For every registered provider returns availability (key configured?),
 * live routing state (cooldown/failures/last success from ai.providerState),
 * usage/error counts, remaining daily capacity (vs documented free-tier caps),
 * and whether the default model accepts image input.
 */
export const aiProviderHealth = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    const settings = await getSettingsMap(ctx);
    let state: Record<string, any> = {};
    try {
      state = JSON.parse(String(settings["ai.providerState"] ?? "{}")) as Record<string, any>;
    } catch {
      state = {};
    }
    // Env-key readout lives in a tiny internal query (queries cannot call
    // actions; this one just checks process.env on the Node runtime).
    const envRows = (await ctx.runQuery(internal.aiMonitor.aiProviderEnvStatus, {})) as any[];
    const envMap = new Map((envRows ?? []).map((e) => [e.id, e]));
    const rows = await ctx.db.query("ai_analysis").order("desc").take(400);
    const usage = new Map<string, number>();
    const errs = new Map<string, number>();
    for (const r of rows) {
      usage.set(r.provider, (usage.get(r.provider) ?? 0) + 1);
      if (r.status === "error") errs.set(r.provider, (errs.get(r.provider) ?? 0) + 1);
    }
    const now = Date.now();
    // Per-provider counters written by the router (ai.usage.<provider>.<date>).
    const today = new Date(now).toISOString().slice(0, 10);
    return AI_PROVIDERS.map((p) => {
      const st = (state[p.id] ?? {}) as { failures?: number; cooldownUntil?: number; lastGoodAt?: number };
      const env = envMap.get(p.id) as any;
      const cooldownUntil = Number(st.cooldownUntil ?? 0) || 0;
      const usedToday = Number(settings[`ai.usage.${p.id}.${today}`] ?? 0) || 0;
      const cap = AI_PROVIDER_LIMITS[p.id] ?? null;
      const remaining = cap === null ? null : Math.max(0, cap - usedToday);
      const capacityPct = cap === null ? null : Math.min(100, Math.round((usedToday / cap) * 100));
      return {
        id: p.id,
        labelFa: p.labelFa,
        kind: p.kind,
        model: AI_PROVIDER_MODELS[p.id] ?? "",
        vision: AI_PROVIDER_VISION[p.id] === true,
        hasKey: Boolean(env?.hasKey),
        envKeyName: String(env?.envKeyName ?? ""),
        failures: Number(st.failures ?? 0) || 0,
        cooldownMs: cooldownUntil > now ? Math.max(0, cooldownUntil - now) : 0,
        lastGoodAt: Number(st.lastGoodAt ?? 0) || 0,
        usage: usage.get(p.id) ?? 0,
        errors: errs.get(p.id) ?? 0,
        usedToday,
        remaining,
        capacityPct,
        cap,
      };
    });
  },
});


// ── data reset (trades + history) — mirrors the REST /api/admin/history/clear ──
export const resetData = mutation({
  args: { token: v.string(), scope: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const scope = args.scope === "trades" ? "trades" : args.scope === "logs" ? "logs" : "all";
    const counts: Record<string, number> = {};
    const del = async (table: string) => {
      try {
        const rows = await (ctx.db as any).query(table).collect();
        for (const r of rows) await ctx.db.delete(r._id);
        counts[table] = rows.length;
      } catch {
        // table may not exist in this deployment — never fail the whole reset
      }
    };
    if (scope === "all" || scope === "logs") {
      for (const t of ["engineLogs", "auditLogs", "learningHistory", "notifications"]) await del(t);
    }
    if (scope === "all" || scope === "trades") {
      for (const t of ["open_positions", "closed_positions", "signals", "strategyPerformance", "orders"]) await del(t);
      if (scope === "all") await del("candles");
      try {
        await setSetting(ctx, "engine.realizedPnl", 0, "engine");
        await setSetting(ctx, "engine.lastSignalAt", 0, "engine");
        await setSetting(ctx, "engine.lastScanAt", 0, "engine");
      } catch {
        /* ignore */
      }
    }
    await audit(ctx, "data.reset", admin.username, admin._id, scope, JSON.stringify({ scope, counts }));
    return { ok: true, scope, counts };
  },
});


// ── full-platform reporting (Convex parity): export + import ─────────────────
export const exportData = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const collect = async (table: string) => {
      try {
        return await (ctx.db as any).query(table).collect();
      } catch {
        return [];
      }
    };
    const [settings, users, markets, strategies, signals, openPositions, closedPositions, learningHistory, strategyPerformance, education] =
      await Promise.all([
        getSettingsMap(ctx),
        collect("users"),
        collect("markets"),
        collect("strategies"),
        collect("signals"),
        collect("open_positions"),
        collect("closed_positions"),
        collect("learningHistory"),
        collect("strategyPerformance"),
        collect("education"),
      ]);
    const safeUsers = users.map((u: any) => {
      const { passwordHash, passwordSalt, ...rest } = u;
      return rest;
    });
    const maskedSettings: Record<string, any> = {};
    for (const [k, val] of Object.entries(settings)) {
      maskedSettings[k] = /token|secret|password|apiKey|key$/i.test(k) ? "\u2022\u2022\u2022\u2022" : val;
    }
    return {
      app: "Trading Wolf AI",
      version: "1.3.0",
      exportedAt: new Date().toISOString(),
      data: {
        settings: maskedSettings,
        users: safeUsers,
        markets,
        strategies,
        signals,
        openPositions,
        closedPositions,
        learningHistory,
        strategyPerformance,
        education,
      },
    };
  },
});

export const importData = mutation({
  args: { token: v.string(), data: v.any() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const d = (args.data && typeof args.data === "object" ? args.data : {}) as any;
    const counts: Record<string, number> = {};
    const insert = async (table: string, rows: any[]) => {
      let n = 0;
      for (const r of rows ?? []) {
        if (!r || typeof r !== "object") continue;
        try {
          await (ctx.db as any).insert(table, r);
          n++;
        } catch {
          // duplicate id / constraint conflict — skip
        }
      }
      counts[table] = n;
    };
    if (d.settings && typeof d.settings === "object") {
      let n = 0;
      for (const [k, val] of Object.entries(d.settings)) {
        const sv = String(val ?? "");
        if (!sv || sv.includes("\u2022") || sv.includes("\u2026") || sv.includes("****")) continue;
        try {
          await setSetting(ctx, k, val, String(k).split(".")[0]);
          n++;
        } catch {
          /* keep going */
        }
      }
      counts.settings = n;
    }
    await insert("signals", d.signals);
    await insert("closed_positions", d.closedPositions ?? d.closed_positions);
    await insert("learningHistory", d.learningHistory ?? d.learning_history);
    await insert("strategyPerformance", d.strategyPerformance ?? d.strategy_performance);
    await insert("education", d.education);
    await audit(ctx, "data.import", admin.username, admin._id, "reports", JSON.stringify({ counts }));
    return { ok: true, counts };
  },
});
