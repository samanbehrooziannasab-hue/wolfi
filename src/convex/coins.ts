// ---------------------------------------------------------------------------
// Wolf-coin (gamified) economy + Toman wallet.
//   • Every user has three balances: USDT (wallets table), Toman and Wolf Coins.
//   • Every mutation is recorded in `coinTransactions` (the ledger).
//   • Vouchers are created by the admin and redeemed for wolf coins.
//   • Coins are burned per minute of dashboard usage (admin-configurable rate).
//   • Users earn coins from tasks (complete profile, prediction game).
//   • Deposit/withdrawal/VIP requests notify the owner via Telegram.
// ---------------------------------------------------------------------------
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin, requireStaff, resolveAdmin, resolveStaff, resolveWolfUser } from "./wolfAuth";
import { getSetting, getSettingsMap } from "./settings";
import { audit, log } from "./logs";

// ─── helpers ───────────────────────────────────────────────────────────────

async function walletOf(ctx: any, userId: string, asset: string, network = "IRT") {
  const existing = await ctx.db
    .query("wallets")
    .withIndex("by_owner", (q: any) => q.eq("owner", userId))
    .filter((q: any) => q.eq(q.field("asset"), asset))
    .first();
  if (existing) return existing;
  const id = await ctx.db.insert("wallets", {
    userId,
    owner: userId,
    asset,
    network,
    balance: 0,
    enabled: true,
  });
  return ctx.db.get(id);
}

async function getTomanBalance(ctx: any, userId: string): Promise<number> {
  const wallet = await walletOf(ctx, userId, "IRT");
  return wallet?.balance ?? 0;
}

/** Read-only variant for queries — never creates the wallet row. */
async function getTomanBalanceReadOnly(ctx: any, userId: string): Promise<number> {
  const existing = await ctx.db
    .query("wallets")
    .withIndex("by_owner", (q: any) => q.eq("owner", userId))
    .filter((q: any) => q.eq(q.field("asset"), "IRT"))
    .first();
  return existing?.balance ?? 0;
}

async function setTomanBalance(ctx: any, userId: string, balance: number): Promise<void> {
  const wallet = await walletOf(ctx, userId, "IRT");
  await ctx.db.patch(wallet._id, { balance: Math.max(0, balance) });
}

async function coinLedger(
  ctx: any,
  userId: string,
  currency: "toman" | "wolf",
  delta: number,
  balanceAfter: number,
  reason: string,
  ref?: string,
): Promise<void> {
  await ctx.db.insert("coinTransactions", {
    userId,
    currency,
    delta,
    balanceAfter,
    reason,
    ref,
    created: Date.now(),
  });
}

async function grantWolfCoins(
  ctx: any,
  user: any,
  amount: number,
  reason: string,
  ref?: string,
): Promise<number> {
  const current = user.wolfCoins ?? 0;
  const next = current + amount;
  await ctx.db.patch(user._id, { wolfCoins: Math.max(0, next) });
  await coinLedger(ctx, user._id, "wolf", amount, Math.max(0, next), reason, ref);
  return next;
}

async function burnWolfCoins(
  ctx: any,
  user: any,
  amount: number,
  reason: string,
): Promise<number> {
  const current = user.wolfCoins ?? 0;
  const next = Math.max(0, current - amount);
  if (next !== current) {
    await ctx.db.patch(user._id, { wolfCoins: next });
    await coinLedger(ctx, user._id, "wolf", -(current - next), next, reason);
  }
  return next;
}

async function notifyAdmin(ctx: any, text: string): Promise<void> {
  try {
    await ctx.scheduler.runAfter(0, internal.notify.notifyAdmin, { text });
  } catch {
    // scheduling must never break the money flow
  }
}

// ─── queries ───────────────────────────────────────────────────────────────

export const myCoins = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) return null;
    const settings = await getSettingsMap(ctx);
    const txs = await ctx.db
      .query("coinTransactions")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .order("desc")
      .take(60);
    return {
      toman: await getTomanBalanceReadOnly(ctx, user._id),
      wolfCoins: user.wolfCoins ?? 0,
      lastCoinCheck: user.lastCoinCheck ?? 0,
      profileRewardClaimed: Boolean(user.profileRewardClaimed),
      telegramLinked: Boolean(user.tgId),
      telegramRewardClaimed: Boolean(user.telegramRewardClaimed),
      settings: {
        coinPerHour: Number(settings["coins.coinPerHour"] ?? 60),
        coinPerMinute: Number(settings["coins.coinPerMinute"] ?? 1),
        aiCost: Number(settings["coins.aiCost"] ?? 50),
        signalDetail: Number(settings["coins.signalDetail"] ?? 10),
        tomanPerCoin: Number(settings["coins.tomanPerCoin"] ?? 5000),
        rewardProfile: Number(settings["coins.rewardProfile"] ?? 10),
        rewardPrediction: Number(settings["coins.rewardPrediction"] ?? 3),
        rewardReferral: Number(settings["coins.rewardReferral"] ?? 30),
        rewardReferralNew: Number(settings["coins.rewardReferralNew"] ?? 5),
        rewardTelegram: Number(settings["coins.rewardTelegram"] ?? 25),
        referralEnabled: settings["coins.referralEnabled"] !== false,
        monthlyBurn: Math.max(1, Math.floor(Number(settings["coins.coinPerHour"] ?? 60))) * 24 * 30,
        packages: Array.isArray(settings["coins.packages"])
          ? settings["coins.packages"]
          : [{ label: "Starter", labelFa: "شروع", coins: 1000, price: 100000 }],
        usdtTomanRate: Number(settings["usdt.tomanRate"] ?? 95000),
        coinsEnabled: settings["coins.enabled"] !== false,
        tomanCard: String(settings["wallet.tomanCard"] ?? ""),
        tomanCardHolder: String(settings["wallet.tomanCardHolder"] ?? ""),
        supportBot: String(settings["support.botUsername"] ?? ""),
        supportVip: String(settings["support.vipUsername"] ?? "Mamadmari"),
        minVipCapital: Number(settings["vip.minCapital"] ?? 20),
      },
      transactions: txs.map((t) => ({
        id: t._id,
        currency: t.currency,
        delta: t.delta,
        balanceAfter: t.balanceAfter,
        reason: t.reason,
        ref: t.ref,
        created: t.created,
      })),
    };
  },
});

export const listVouchers = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    const rows = await ctx.db.query("voucherCodes").order("desc").take(100);
    const users = await ctx.db.query("users").collect();
    const byId = new Map<string, any>();
    for (const u of users) byId.set(u._id, u);
    return rows.map((r) => ({
      id: r._id,
      code: r.code,
      coins: r.coins,
      maxUses: r.maxUses,
      usedCount: r.usedCount,
      status: r.status,
      createdBy: r.createdBy,
      created: r.created,
      lastUsers: (r.usedBy ?? []).slice(-5).map((uid) => byId.get(uid)?.username ?? uid),
    }));
  },
});

export const listCoinTransactions = query({
  args: { token: v.string(), userId: v.optional(v.id("users")), limit: v.optional(v.number()) },
  handler: async (ctx, { token, userId, limit }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    let rows = await ctx.db.query("coinTransactions").order("desc").take(limit ?? 100);
    if (userId) rows = rows.filter((r) => r.userId === userId);
    const users = await ctx.db.query("users").collect();
    const byId = new Map<string, any>();
    for (const u of users) byId.set(u._id, u);
    return rows.map((r) => ({
      id: r._id,
      user: byId.get(r.userId)?.username ?? r.userId,
      currency: r.currency,
      delta: r.delta,
      balanceAfter: r.balanceAfter,
      reason: r.reason,
      created: r.created,
    }));
  },
});

/** Unified financial transaction history across USDT, Toman, and WolfCoin with conversion rates. */
export const financialHistory = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, limit }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) return [];
    const settings = await getSettingsMap(ctx);
    const rate = Number(settings["usdt.tomanRate"] ?? 95000);

    const userWallet = await ctx.db
      .query("wallets")
      .withIndex("by_owner", (q: any) => q.eq("owner", String(user._id)))
      .first();

    const [walletTxs, coinTxs] = await Promise.all([
      userWallet
        ? ctx.db
            .query("walletTransactions")
            .withIndex("by_wallet", (q: any) => q.eq("walletId", userWallet._id))
            .order("desc")
            .take(limit ?? 100)
        : Promise.resolve([]),
      ctx.db
        .query("coinTransactions")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .order("desc")
        .take(limit ?? 100),
    ]);

    const items: Array<{
      id: string;
      created: number;
      currency: "USDT" | "IRT" | "WOLF";
      type: "deposit" | "withdrawal" | "swap" | "credit" | "debit" | "reward" | "burn";
      amount: number;
      equivalentToman?: number;
      equivalentUsdt?: number;
      rateUsed?: number;
      status: "confirmed" | "pending" | "rejected";
      reason: string;
      txid?: string;
      ref?: string;
    }> = [];

    for (const w of walletTxs) {
      const isUsdt = w.asset === "USDT";
      const eqToman = isUsdt ? Math.round(w.amount * rate) : undefined;
      const eqUsdt = !isUsdt && w.asset === "IRT" ? Number((w.amount / rate).toFixed(2)) : undefined;
      items.push({
        id: "w_" + String(w._id),
        created: w.created,
        currency: (w.asset === "IRT" ? "IRT" : "USDT") as any,
        type: (w.type as any) || "credit",
        amount: w.amount,
        equivalentToman: eqToman,
        equivalentUsdt: eqUsdt,
        rateUsed: rate,
        status: w.status === "rejected" ? "rejected" : w.status === "pending" ? "pending" : "confirmed",
        reason: w.note || w.type,
        txid: w.txid,
        ref: w.ref,
      });
    }

    for (const c of coinTxs) {
      const isToman = c.currency === "toman";
      const eqUsdt = isToman ? Number((Math.abs(c.delta) / rate).toFixed(2)) : undefined;
      items.push({
        id: "c_" + String(c._id),
        created: c.created,
        currency: isToman ? "IRT" : "WOLF",
        type: c.delta >= 0 ? "credit" : "debit",
        amount: Math.abs(c.delta),
        equivalentToman: isToman ? Math.abs(c.delta) : undefined,
        equivalentUsdt: eqUsdt,
        rateUsed: isToman ? rate : undefined,
        status: "confirmed",
        reason: c.reason + (c.ref ? ` (${c.ref})` : ""),
        ref: c.ref,
      });
    }

    items.sort((a, b) => b.created - a.created);
    return items.slice(0, limit ?? 100);
  },
});

export const myPredictions = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) return [];
    const rows = await ctx.db
      .query("demoPredictions")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .order("desc")
      .take(20);
    return rows.map((r) => ({
      id: r._id,
      symbol: r.symbol,
      direction: r.direction,
      outcome: r.outcome,
      reward: r.reward,
      status: r.status,
      created: r.created,
    }));
  },
});

// ─── admin mutations ───────────────────────────────────────────────────────

export const adjustUserBalance = mutation({
  args: {
    token: v.string(),
    userId: v.id("users"),
    currency: v.union(v.literal("usdt"), v.literal("toman"), v.literal("wolf")),
    delta: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("user_not_found");
    const delta = Math.round(args.delta * 100) / 100;
    if (delta === 0) throw new Error("delta_zero");
    const reason = args.reason.trim().slice(0, 200) || "admin";

    if (args.currency === "usdt") {
      const wallet = await walletOf(ctx, args.userId, "USDT", "TRC20");
      const next = Math.max(0, Math.round(((wallet.balance ?? 0) + delta) * 100) / 100);
      await ctx.db.patch(wallet._id, { balance: next });
      await ctx.db.insert("walletTransactions", {
        walletId: wallet._id,
        userId: args.userId,
        type: delta >= 0 ? "credit" : "debit",
        asset: "USDT",
        amount: Math.abs(delta),
        status: "confirmed",
        note: `admin: ${reason}`,
        created: Date.now(),
      });
    } else if (args.currency === "toman") {
      const next = Math.max(0, Math.round((await getTomanBalance(ctx, args.userId) + delta) * 100) / 100);
      await setTomanBalance(ctx, args.userId, next);
      await coinLedger(ctx, args.userId, "toman", delta, next, reason);
    } else {
      const next = await grantWolfCoins(ctx, user, delta, reason);
      void next;
    }
    await audit(ctx, "balance.adjusted", admin.username, admin._id, user.username ?? undefined, `${args.currency}=${delta} (${reason})`);
    await log(ctx, "SECURITY", "admin.balance.adjusted", `user=${user.username} ${args.currency}=${delta}`, "api");
  },
});

export const updateUserAccount = mutation({
  args: {
    token: v.string(),
    userId: v.id("users"),
    username: v.optional(v.string()),
    name: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    gender: v.optional(v.string()),
    birthday: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    role: v.optional(v.string()),
    vipPackage: v.optional(v.string()),
    vipExpiresAt: v.optional(v.number()),
    canTrade: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("user_not_found");
    const patch: Record<string, any> = {};
    if (args.username !== undefined) {
      const uname = args.username.trim().toLowerCase();
      if (!uname) throw new Error("invalid_username");
      const dup = await ctx.db.query("users").withIndex("by_username", (q: any) => q.eq("username", uname)).first();
      if (dup && dup._id !== args.userId) throw new Error("username_taken");
      patch.username = uname;
    }
    if (args.name !== undefined) patch.name = args.name.trim().slice(0, 120);
    if (args.firstName !== undefined) patch.firstName = args.firstName.trim().slice(0, 80);
    if (args.lastName !== undefined) patch.lastName = args.lastName.trim().slice(0, 80);
    if (args.phone !== undefined) patch.phone = args.phone.trim();
    if (args.gender !== undefined) patch.gender = args.gender.trim().slice(0, 20);
    if (args.birthday !== undefined) patch.birthday = args.birthday.trim().slice(0, 20);
    if (args.enabled !== undefined) patch.enabled = args.enabled;
    if (args.canTrade !== undefined) patch.canTrade = args.canTrade;
    if (args.role !== undefined) {
      const role = args.role;
      if (!["admin", "vip", "user", "assistant"].includes(role)) throw new Error("invalid_role");
      patch.role = role;
      patch.isAdmin = role === "admin";
      patch.isAssistant = role === "assistant";
      patch.isVip = role === "vip";
    }
    if (args.vipPackage !== undefined) patch.vipPackage = args.vipPackage;
    if (args.vipExpiresAt !== undefined) patch.vipExpiresAt = args.vipExpiresAt;
    if (Object.keys(patch).length) {
      await ctx.db.patch(args.userId, patch);
      await audit(ctx, "user.updated", admin.username, admin._id, user.username ?? undefined, Object.keys(patch).join(","));
    }
  },
});

const VOUCHER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomVoucherCode(): string {
  let code = "WOLF-";
  for (let i = 0; i < 8; i++) {
    code += VOUCHER_ALPHABET[Math.floor(Math.random() * VOUCHER_ALPHABET.length)];
  }
  return code;
}

export const createVoucher = mutation({
  args: {
    token: v.string(),
    code: v.string(),
    coins: v.number(),
    maxUses: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    // empty code → generate a random one
    let code = args.code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (!code) {
      for (let tries = 0; tries < 5; tries++) {
        code = randomVoucherCode();
        const dup = await ctx.db.query("voucherCodes").withIndex("by_code", (q: any) => q.eq("code", code)).first();
        if (!dup) break;
      }
    }
    if (code.length < 4) throw new Error("invalid_code");
    if (!(args.coins > 0)) throw new Error("invalid_coins");
    const uses = Math.max(1, Math.floor(args.maxUses || 1));
    const existing = await ctx.db.query("voucherCodes").withIndex("by_code", (q: any) => q.eq("code", code)).first();
    if (existing) {
      await ctx.db.patch(existing._id, { coins: args.coins, maxUses: uses, status: true });
    } else {
      await ctx.db.insert("voucherCodes", {
        code,
        coins: args.coins,
        maxUses: uses,
        usedCount: 0,
        usedBy: [],
        createdBy: admin.username,
        status: true,
        created: Date.now(),
      });
    }
    await audit(ctx, "voucher.created", admin.username, admin._id, code, `coins=${args.coins} uses=${uses}`);
  },
});

export const toggleVoucher = mutation({
  args: { token: v.string(), id: v.id("voucherCodes"), status: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    await ctx.db.patch(args.id, { status: args.status });
    await audit(ctx, "voucher.toggled", admin.username, admin._id, String(args.id), String(args.status));
  },
});

// ─── user mutations ────────────────────────────────────────────────────────

/** Card-to-card toman deposit — admin approves manually afterwards. */
export const submitTomanDeposit = mutation({
  args: { token: v.string(), amount: v.number(), ref: v.optional(v.string()), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    if (!(args.amount >= 10000)) throw new Error("حداقل مبلغ واریز ۱۰٬۰۰۰ تومان است");
    const wallet = await walletOf(ctx, user._id, "IRT", "CARD");
    await ctx.db.insert("walletTransactions", {
      walletId: wallet._id,
      userId: user._id,
      type: "deposit",
      asset: "IRT",
      amount: args.amount,
      network: "CARD",
      txid: args.ref?.trim() || undefined,
      status: "pending",
      note: args.note?.trim() || undefined,
      ref: args.ref?.trim(),
      created: Date.now(),
    });
    await log(ctx, "INFO", "wallet.toman.deposit.request", `user=${user.username} amount=${args.amount}`, "api");
    await notifyAdmin(ctx, `💰 <b>درخواست واریز تومانی</b>\n👤 ${user.username ?? user.tgId ?? ""} ${user.name ? `(${user.name})` : ""}\n💵 مبلغ: <b>${args.amount.toLocaleString("fa-IR")} تومان</b>\n🆔 کد پیگیری: ${args.ref ?? "—"}\n📝 توضیح: ${args.note ?? "—"}`);
  },
});

/** Buy a preset coin package (coins + price from settings) with toman. */
export const buyCoinPackage = mutation({
  args: { token: v.string(), index: v.number() },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    const settings = await getSettingsMap(ctx);
    const packages = Array.isArray(settings["coins.packages"])
      ? settings["coins.packages"]
      : [{ label: "Starter", labelFa: "شروع", coins: 1000, price: 100000 }];
    const pkg = packages[args.index];
    if (!pkg) throw new Error("بسته یافت نشد");
    const coins = Math.max(1, Math.floor(Number(pkg.coins)));
    const price = Math.max(0, Number(pkg.price));
    const toman = await getTomanBalance(ctx, user._id);
    if (toman < price)
      throw new Error(
        `موجودی تومان شما ${toman.toLocaleString("fa-IR")} تومان است؛ این بسته ${price.toLocaleString("fa-IR")} تومان لازم دارد. ابتدا از بخش کیف پول شارژ کنید.`,
      );
    await setTomanBalance(ctx, user._id, toman - price);
    await coinLedger(ctx, user._id, "toman", -price, toman - price, "buy_package", String(pkg.label ?? ""));
    await grantWolfCoins(ctx, user, coins, "buy_package", `${price} toman`);
    await log(ctx, "INFO", "coins.package.bought", `user=${user.username} pkg=${pkg.label ?? ""} coins=${coins} price=${price}`, "api");
    return { ok: true, coins };
  },
});

/** Buy wolf coins with toman balance (rate from settings). */
export const buyWolfCoins = mutation({
  args: { token: v.string(), coins: v.number() },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    const coins = Math.max(1, Math.floor(args.coins));
    const rate = Number((await getSetting(ctx, "coins.tomanPerCoin")) ?? 5000);
    const cost = coins * rate;
    const toman = await getTomanBalance(ctx, user._id);
    if (toman < cost)
      throw new Error(
        `موجودی تومان شما ${toman.toLocaleString("fa-IR")} تومان است؛ این خرید ${cost.toLocaleString("fa-IR")} تومان لازم دارد. ابتدا از بخش کیف پول شارژ کنید.`,
      );
    await setTomanBalance(ctx, user._id, toman - cost);
    await coinLedger(ctx, user._id, "toman", -cost, toman - cost, "buy_coins", `${coins} coins`);
    await grantWolfCoins(ctx, user, coins, "buy_coins", `${cost} toman`);
    await log(ctx, "INFO", "coins.bought", `user=${user.username} coins=${coins} cost=${cost}`, "api");
  },
});

/** Buy wolf coins directly using USDT wallet balance. */
export const buyWolfCoinsWithUsdt = mutation({
  args: { token: v.string(), coins: v.number() },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    const coins = Math.max(1, Math.floor(args.coins));
    const tomanPerCoin = Number((await getSetting(ctx, "coins.tomanPerCoin")) ?? 5000);
    const usdtTomanRate = Math.max(10000, Number((await getSetting(ctx, "usdt.tomanRate")) ?? 95000));
    const totalToman = coins * tomanPerCoin;
    const usdtCost = Number((totalToman / usdtTomanRate).toFixed(3));

    const wallet = await walletOf(ctx, user._id, "USDT", "TRC20");
    const balance = Number(wallet?.balance ?? 0);
    if (balance < usdtCost) {
      throw new Error(
        `موجودی تتر شما $${balance.toFixed(2)} است؛ برای خرید ${coins.toLocaleString("fa-IR")} ولف‌کوین به $${usdtCost.toFixed(2)} تتر نیاز دارید.`,
      );
    }
    const nextBalance = Math.max(0, Math.round((balance - usdtCost) * 100) / 100);
    await ctx.db.patch(wallet._id, { balance: nextBalance });
    await ctx.db.insert("walletTransactions", {
      walletId: wallet._id,
      userId: user._id,
      type: "debit",
      asset: "USDT",
      amount: usdtCost,
      status: "confirmed",
      note: `خرید ${coins} ولف‌کوین با تتر (نرخ: ${usdtTomanRate.toLocaleString("fa-IR")} تومان)`,
      created: Date.now(),
    });
    await grantWolfCoins(ctx, user, coins, "buy_coins_usdt", `$${usdtCost} USDT`);
    await log(ctx, "INFO", "coins.bought.usdt", `user=${user.username} coins=${coins} usdtCost=${usdtCost}`, "api");
    return { ok: true, coins, usdtCost, balanceAfter: nextBalance };
  },
});

/** Buy preset coin package using USDT wallet balance. */
export const buyCoinPackageWithUsdt = mutation({
  args: { token: v.string(), index: v.number() },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    const settings = await getSettingsMap(ctx);
    const packages = Array.isArray(settings["coins.packages"])
      ? settings["coins.packages"]
      : [{ label: "Starter", labelFa: "شروع", coins: 1000, price: 100000 }];
    const pkg = packages[args.index];
    if (!pkg) throw new Error("بسته یافت نشد");
    const coins = Math.max(1, Math.floor(Number(pkg.coins)));
    const priceToman = Math.max(0, Number(pkg.price));
    const usdtTomanRate = Math.max(10000, Number(settings["usdt.tomanRate"] ?? 95000));
    const usdtCost = Number((priceToman / usdtTomanRate).toFixed(2));

    const wallet = await walletOf(ctx, user._id, "USDT", "TRC20");
    const balance = Number(wallet?.balance ?? 0);
    if (balance < usdtCost) {
      throw new Error(
        `موجودی تتر شما $${balance.toFixed(2)} است؛ برای خرید این بسته به $${usdtCost.toFixed(2)} تتر نیاز دارید.`,
      );
    }
    const nextBalance = Math.max(0, Math.round((balance - usdtCost) * 100) / 100);
    await ctx.db.patch(wallet._id, { balance: nextBalance });
    await ctx.db.insert("walletTransactions", {
      walletId: wallet._id,
      userId: user._id,
      type: "debit",
      asset: "USDT",
      amount: usdtCost,
      status: "confirmed",
      note: `خرید بسته ${pkg.labelFa ?? pkg.label} با تتر`,
      created: Date.now(),
    });
    await grantWolfCoins(ctx, user, coins, "buy_package_usdt", `$${usdtCost} USDT`);
    await log(ctx, "INFO", "coins.package.bought.usdt", `user=${user.username} pkg=${pkg.label} coins=${coins}`, "api");
    return { ok: true, coins, usdtCost };
  },
});

/** Swap USDT directly to Toman wallet balance. */
export const swapUsdtToToman = mutation({
  args: { token: v.string(), usdtAmount: v.number() },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    const amount = Math.max(0.1, Number(args.usdtAmount));
    const usdtTomanRate = Math.max(10000, Number((await getSetting(ctx, "usdt.tomanRate")) ?? 95000));
    const tomanToAdd = Math.round(amount * usdtTomanRate);

    const wallet = await walletOf(ctx, user._id, "USDT", "TRC20");
    const balance = Number(wallet?.balance ?? 0);
    if (balance < amount) throw new Error(`موجودی تتر کافی نیست (موجودی: $${balance.toFixed(2)})`);

    const nextUsdt = Math.max(0, Math.round((balance - amount) * 100) / 100);
    await ctx.db.patch(wallet._id, { balance: nextUsdt });
    await ctx.db.insert("walletTransactions", {
      walletId: wallet._id,
      userId: user._id,
      type: "debit",
      asset: "USDT",
      amount,
      status: "confirmed",
      note: `تبدیل $${amount} تتر به ${tomanToAdd.toLocaleString("fa-IR")} تومان`,
      created: Date.now(),
    });

    const currentToman = await getTomanBalance(ctx, user._id);
    const nextToman = currentToman + tomanToAdd;
    await setTomanBalance(ctx, user._id, nextToman);
    await coinLedger(ctx, user._id, "toman", tomanToAdd, nextToman, "swap_from_usdt", `$${amount} USDT`);

    await log(ctx, "INFO", "wallet.swap.usdt_to_toman", `user=${user.username} usdt=${amount} toman=${tomanToAdd}`, "api");
    return { ok: true, usdtDeducted: amount, tomanAdded: tomanToAdd, newToman: nextToman, newUsdt: nextUsdt };
  },
});

/** Swap Toman directly to USDT wallet balance. */
export const swapTomanToUsdt = mutation({
  args: { token: v.string(), tomanAmount: v.number() },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    const toman = Math.floor(Number(args.tomanAmount));
    if (toman < 10000) throw new Error("حداقل مبلغ تبدیل ۱۰٬۰۰۰ تومان است");
    const usdtTomanRate = Math.max(10000, Number((await getSetting(ctx, "usdt.tomanRate")) ?? 95000));
    const usdtToAdd = Math.round((toman / usdtTomanRate) * 100) / 100;
    if (usdtToAdd <= 0) throw new Error("مبلغ تبدیل بسیار کم است");

    const currentToman = await getTomanBalance(ctx, user._id);
    if (currentToman < toman) throw new Error(`موجودی تومان کافی نیست (موجودی: ${currentToman.toLocaleString("fa-IR")} تومان)`);

    const nextToman = currentToman - toman;
    await setTomanBalance(ctx, user._id, nextToman);
    await coinLedger(ctx, user._id, "toman", -toman, nextToman, "swap_to_usdt", `$${usdtToAdd} USDT`);

    const wallet = await walletOf(ctx, user._id, "USDT", "TRC20");
    const balance = Number(wallet?.balance ?? 0);
    const nextUsdt = Math.round((balance + usdtToAdd) * 100) / 100;
    await ctx.db.patch(wallet._id, { balance: nextUsdt });
    await ctx.db.insert("walletTransactions", {
      walletId: wallet._id,
      userId: user._id,
      type: "credit",
      asset: "USDT",
      amount: usdtToAdd,
      status: "confirmed",
      note: `تبدیل ${toman.toLocaleString("fa-IR")} تومان به $${usdtToAdd} تتر`,
      created: Date.now(),
    });

    await log(ctx, "INFO", "wallet.swap.toman_to_usdt", `user=${user.username} toman=${toman} usdt=${usdtToAdd}`, "api");
    return { ok: true, tomanDeducted: toman, usdtAdded: usdtToAdd, newToman: nextToman, newUsdt: nextUsdt };
  },
});

/** Redeem an admin-created voucher code for wolf coins. */
export const redeemVoucher = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    const code = args.code.trim().toUpperCase();
    if (!code) return { ok: false, reason: "empty" };
    const voucher = await ctx.db.query("voucherCodes").withIndex("by_code", (q: any) => q.eq("code", code)).first();
    if (!voucher || voucher.status !== true) return { ok: false, reason: "not_found" };
    if ((voucher.usedBy ?? []).includes(user._id)) return { ok: false, reason: "already_used" };
    if ((voucher.usedCount ?? 0) >= voucher.maxUses) return { ok: false, reason: "exhausted" };
    await ctx.db.patch(voucher._id, {
      usedCount: (voucher.usedCount ?? 0) + 1,
      usedBy: [...(voucher.usedBy ?? []), user._id],
    });
    await grantWolfCoins(ctx, user, voucher.coins, "voucher", code);
    await log(ctx, "INFO", "coins.voucher.redeemed", `user=${user.username} code=${code} coins=${voucher.coins}`, "api");
    return { ok: true, coins: voucher.coins };
  },
});

/** Heartbeat: burn coins per minute of dashboard usage. Called every minute. */
export const burnCoins = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) throw new Error("session_expired");
    const settings = await getSettingsMap(ctx);
    if (settings["coins.enabled"] === false) return { burned: 0, coins: user.wolfCoins ?? 0 };
    const rate = Math.max(0, Number(settings["coins.coinPerHour"] ?? 60));
    if (rate <= 0) return { burned: 0, coins: user.wolfCoins ?? 0 };
    const now = Date.now();
    const last = user.lastCoinCheck ?? now;
    // Whole hours only → one clean ledger entry per hour (history stays tidy).
    // Capped at 24h so a long absence can't wipe the whole balance at once.
    const hours = Math.min(24, Math.max(0, Math.floor((now - last) / 3600000)));
    if (hours <= 0) return { burned: 0, coins: user.wolfCoins ?? 0 };
    const toBurn = Math.min(user.wolfCoins ?? 0, hours * rate);
    const coins = await burnWolfCoins(ctx, user, toBurn, "usage");
    await ctx.db.patch(user._id, { lastCoinCheck: now });
    return { burned: toBurn, coins };
  },
});

/** Task reward: completing the profile (name/phone set). Once per user. */
export const claimProfileReward = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) throw new Error("session_expired");
    if (user.profileRewardClaimed) return { ok: false, reason: "already_claimed" };
    const name = (user.name ?? user.firstName ?? "").trim();
    const phone = (user.phone ?? "").trim();
    if (!name && !phone) throw new Error("ابتدا نام یا شماره موبایل خود را کامل کنید");
    const reward = Number((await getSetting(ctx, "coins.rewardProfile")) ?? 10);
    await ctx.db.patch(user._id, { profileRewardClaimed: true });
    await grantWolfCoins(ctx, user, reward, "reward_profile");
    return { ok: true, coins: reward };
  },
});

/**
 * Apply a referral captured from the bot's /start link.
 * Called from tgLogin when the referred user first opens the Mini App.
 * Rewards the referrer + the new user (rates from settings).
 */
export const applyPendingReferral = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user || !user.pendingReferralCode || user.referralRewarded) return { ok: false, reason: "none" };
    const settings = await getSettingsMap(ctx);
    if (settings["coins.referralEnabled"] === false) return { ok: false, reason: "disabled" };
    const code = user.pendingReferralCode;
    const ref = await ctx.db.query("referrals").withIndex("by_code", (q: any) => q.eq("code", code)).first();
    if (!ref) {
      // code may not exist yet (referrer never opened the panel) — create it on the fly
      await ctx.db.patch(user._id, { referralRewarded: true });
      return { ok: false, reason: "not_found" };
    }
    if (ref.referrerId === user._id) {
      await ctx.db.patch(user._id, { referralRewarded: true });
      return { ok: false, reason: "self" };
    }
    if (ref.referredId) {
      await ctx.db.patch(user._id, { referralRewarded: true });
      return { ok: false, reason: "used" };
    }
    const referrer = await ctx.db.get(ref.referrerId);
    if (!referrer) {
      await ctx.db.patch(user._id, { referralRewarded: true });
      return { ok: false, reason: "no_referrer" };
    }
    const referrerReward = Math.max(0, Number(settings["coins.rewardReferral"] ?? 0));
    const newUserReward = Math.max(0, Number(settings["coins.rewardReferralNew"] ?? 0));
    await ctx.db.patch(ref._id, { referredId: user._id, status: "completed" });
    await ctx.db.patch(user._id, { referralRewarded: true });
    if (referrerReward > 0) await grantWolfCoins(ctx, referrer, referrerReward, "reward_referral", user.username ?? user.tgId?.toString());
    if (newUserReward > 0) await grantWolfCoins(ctx, user, newUserReward, "reward_referral_new", code);
    await log(ctx, "INFO", "referral.rewarded", `code=${code} referrer=${referrer.username ?? ""} user=${user.username ?? ""}`, "api");
    return { ok: true, referrerReward, newUserReward };
  },
});

// ─── prediction game (education, demo candles) ────────────────────────────
// A deterministic demo session: the user sees candles without the last one,
// guesses long/short, and is rewarded when the hidden candle agrees.

const PREDICTION_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "DOGEUSDT",
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededCandles(symbol: string, seed: number, count: number) {
  const rnd = mulberry32(seed);
  const base =
    symbol === "BTCUSDT" ? 95000 :
    symbol === "ETHUSDT" ? 3800 :
    symbol === "SOLUSDT" ? 190 :
    symbol === "BNBUSDT" ? 680 :
    symbol === "XRPUSDT" ? 2.3 :
    symbol === "XAUUSD" ? 3250 :
    symbol === "EURUSD" ? 1.085 :
    symbol === "GBPUSD" ? 1.272 :
    symbol === "USDJPY" ? 154 :
    0.21;
  const vol = base * 0.004;
  let price = base * (0.97 + rnd() * 0.06);
  const candles = [];
  for (let i = 0; i < count; i++) {
    const open = price;
    const drift = (rnd() - 0.485) * vol * 2.2;
    const close = Math.max(base * 0.6, open + drift);
    const hi = Math.max(open, close) + rnd() * vol * 0.8;
    const lo = Math.min(open, close) - rnd() * vol * 0.8;
    candles.push({
      t: Date.now() - (count - i) * 60000,
      o: Math.round(open * 1e6) / 1e6,
      h: Math.round(hi * 1e6) / 1e6,
      l: Math.round(lo * 1e6) / 1e6,
      c: Math.round(close * 1e6) / 1e6,
      v: Math.round(1000 + rnd() * 4000),
    });
    price = close;
  }
  return candles;
}

export const startPrediction = mutation({
  args: { token: v.string(), symbol: v.string() },
  handler: async (ctx, { token, symbol }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) throw new Error("session_expired");
    const sym = PREDICTION_SYMBOLS.includes(symbol) ? symbol : "BTCUSDT";
    const reward = Number((await getSetting(ctx, "coins.rewardPrediction")) ?? 5);
    const hourSeed = Math.floor(Date.now() / 3600000); // new session every hour
    const seed = (hourSeed * 2654435761) ^ (sym.split("").reduce((s, c) => s + c.charCodeAt(0), 0) * 7919) ^ user._id.length;
    const all = seededCandles(sym, seed >>> 0, 41);
    const candles = all.slice(0, 40); // the 41st candle is the hidden outcome
    const last = all[all.length - 1];
    const outcome = last.c > last.o ? "long" : "short";
    const id = await ctx.db.insert("demoPredictions", {
      userId: user._id,
      symbol: sym,
      outcome,
      reward,
      status: "pending",
      candles,
      created: Date.now(),
    });
    return { id, symbol: sym, reward, candles };
  },
});

export const resolvePrediction = mutation({
  args: { token: v.string(), predictionId: v.id("demoPredictions"), direction: v.union(v.literal("long"), v.literal("short")) },
  handler: async (ctx, args) => {
    const user = await resolveWolfUser(ctx, args.token);
    if (!user) throw new Error("session_expired");
    const p = await ctx.db.get(args.predictionId);
    if (!p || p.userId !== user._id) throw new Error("prediction_not_found");
    if (p.status !== "pending") throw new Error("already_resolved");
    const won = p.outcome === args.direction;
    await ctx.db.patch(p._id, { direction: args.direction, status: won ? "won" : "lost" });
    if (won) {
      // streak bonus: up to +4 extra coins for consecutive wins
      const history = await ctx.db
        .query("demoPredictions")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .order("desc")
        .take(20);
      let streak = 1;
      for (const h of history) {
        if (h._id === p._id) continue;
        if (h.status === "won") streak++;
        else break;
      }
      const bonus = Math.min(4, Math.max(0, streak - 1));
      await grantWolfCoins(ctx, user, p.reward + bonus, "reward_prediction", `${p.symbol}:${args.direction}${bonus ? ` (streak ${streak})` : ""}`);
      await log(ctx, "INFO", "prediction.won", `user=${user.username} symbol=${p.symbol} +${p.reward + bonus}`, "api");
    }
    return { ok: true, won, reward: won ? p.reward : 0, outcome: p.outcome };
  },
});

// ─── quiz game ─────────────────────────────────────────────────────────────

const QUIZ_QUESTIONS = [
  // Price Action & Candle Patterns
  { category: "price_action", q: "اگر RSI بالای ۷۰ باشد، چه مفهومی دارد؟", qEn: "RSI above 70 indicates?", options: ["اشباع فروش (Oversold)", "اشباع خرید (Overbought)", "روند خنثی"], answer: 1 },
  { category: "price_action", q: "کدام الگوی شمعی نشانه چرخش صعودی (Bullish Reversal) است؟", qEn: "Which candle pattern signals a bullish reversal?", options: ["Doji خنثی", "Hammer (چکش)", "Shooting Star (شهاب سنگ)"], answer: 1 },
  { category: "price_action", q: "الگوی شمعی Morning Star (ستاره صبحگاهی) در کجا تشکیل می‌شود؟", qEn: "Where does a Morning Star pattern typically form?", options: ["انتهای روند نزولی", "میانه روند صعودی", "سقف تاریخی"], answer: 0 },
  { category: "price_action", q: "الگوی کندلی Pinbar با سایه پایینی بلند نشانه چیست؟", qEn: "A pinbar with a long lower shadow indicates?", options: ["رد قیمت‌های پایین و ورود خریداران", "فشار سنگین فروشندگان", "عدم وجود نقدینگی"], answer: 0 },
  { category: "price_action", q: "کندل Engulfing صعودی چه ویژگی دارد؟", qEn: "What defines a Bullish Engulfing candle?", options: ["بدنه آن کل بدنه کندل نزولی قبلی را پوشش می‌دهد", "سایه بالایی بسیار بلندی دارد", "حجم معاملات آن صفر است"], answer: 0 },
  { category: "price_action", q: "الگوی Inside Bar بیانگر چیست؟", qEn: "What does an Inside Bar represent?", options: ["فشردگی قیمت و انتظار برای شکست", "پایان کامل روند", "نوسان شدید بدون جهت"], answer: 0 },

  // Smart Money Concepts (SMC & ICT)
  { category: "smc", q: "مفهوم BOS در سبک اسمارت مانی مخفف چیست؟", qEn: "What does BOS stand for in SMC?", options: ["Break of Structure (شکست ساختار)", "Beginning of Signal", "Balance of Supply"], answer: 0 },
  { category: "smc", q: "منظور از CHoCH (Change of Character) چیست؟", qEn: "What does CHoCH indicate in SMC?", options: ["اولین نشانه از تغییر جهت روند بازار", "تثبیت روند فعلی", "جمع‌آوری استاپ‌های خریداران"], answer: 0 },
  { category: "smc", q: "ناحیه FVG (Fair Value Gap) چگونه تعریف می‌شود؟", qEn: "How is an FVG (Fair Value Gap) defined?", options: ["فاصله خالی بین سایه کندل اول و سوم در حرکت پرقدرت", "ناحیه اشباع خرید اندیکاتور", "سقف و کف دوگانه قیمت"], answer: 0 },
  { category: "smc", q: "اردربلاک (Order Block) چیست؟", qEn: "What is an Order Block in institutional trading?", options: ["آخرین کندل خلاف جهت قبل از یک حرکت تکانشی قوی موسسات", "یک سفارش خرید لیمیت ساده", "خط روند داینامیک"], answer: 0 },
  { category: "smc", q: "مفهوم Liquidity Sweep (شکار نقدینگی) چیست؟", qEn: "What is a Liquidity Sweep?", options: ["نفوذ سریع به بالای سقف‌ها یا زیر کف‌ها برای فعال‌سازی استاپ‌ها و سپس چرخش", "افت ناگهانی حجم بازار", "افزایش اسپرد کارگزاری"], answer: 0 },
  { category: "smc", q: "ناحیه Premium و Discount در فیبوناچی به چه معناست؟", qEn: "What are Premium and Discount zones?", options: ["بالای ۵۰٪ فیبوناچی گران (فروش) و زیر ۵۰٪ ارزان (خرید)", "بالای ۸۰٪ و زیر ۲۰٪ RSI", "نواحی حمایت و مقاومت تاریخی"], answer: 0 },
  { category: "smc", q: "کف‌های برابر (Equal Lows - EQL) چه چیزی ایجاد می‌کنند؟", qEn: "What do Equal Lows (EQL) create?", options: ["تجمع نقدینگی استاپ لاس خریداران که هدفی برای شکار است", "حمایت غیرقابل شکست", "الگوی ادامه دهنده صعودی"], answer: 0 },

  // Risk Management & Psychology
  { category: "risk", q: "حد ضرر (Stop Loss) چیست؟", qEn: "What is a Stop Loss?", options: ["قیمت ورود مجدد", "حداکثر زیان از پیش تعیین‌شده برای محافظت از سرمایه", "قیمت تسویه سود"], answer: 1 },
  { category: "risk", q: "قانون ریسک ۱ الی ۲ درصد در هر معامله به چه منظوری است؟", qEn: "Why is the 1-2% risk per trade rule vital?", options: ["جلوگیری از نابودی حساب در زنجیره ضررهای متوالی", "افزایش حداکثری لوریج", "رسیدن سریع به تارگت روزانه"], answer: 0 },
  { category: "risk", q: "نسبت ریسک به ریوارد (R/R) مناسب چیست؟", qEn: "What is a favorable Risk-to-Reward ratio?", options: ["حداقل ۱ به ۲ (سود بالقوه دو برابر ریسک)", "۱ به ۰.۵", "فرقی ندارد، فقط وین‌ریت مهم است"], answer: 0 },
  { category: "risk", q: "منظور از Revenge Trading (معاملات انتقامی) چیست؟", qEn: "What is Revenge Trading?", options: ["ورود فوری و پرریسک پس از ضرر برای جبران سریع که باعث نابودی حساب می‌شود", "معامله در جهت خلاف روند", "خروج زودهنگام از سود"], answer: 0 },
  { category: "risk", q: "در صورت ضرر ۵۰ درصدی از کل حساب، برای بازگشت به اصل سرمایه چند درصد سود نیاز است؟", qEn: "If you lose 50% of your capital, what % gain is needed to recover?", options: ["۵۰٪", "۱۰۰٪", "۲۰۰٪"], answer: 1 },
  { category: "risk", q: "انتقال حد ضرر به نقطه ورود (Breakeven) چه زمانی مناسب است؟", qEn: "When should Stop Loss be moved to Breakeven?", options: ["پس از رسیدن قیمت به تارگت اول یا حرکت مناسب در جهت سود", "بلافاصله در لحظه ورود", "قبل از باز شدن کندل بعدی"], answer: 0 },

  // Technical Indicators
  { category: "indicators", q: "اندیکاتور EMA چیست؟", qEn: "What is EMA?", options: ["میانگین متحرک ساده با وزن برابر", "میانگین متحرک نمایی با وزن بیشتر به داده‌های اخیر", "شاخص قدرت نسبی قیمت"], answer: 1 },
  { category: "indicators", q: "واگرایی مثبت (Bullish Divergence) در MACD یا RSI چیست؟", qEn: "What is a Bullish Divergence?", options: ["قیمت کف پایین‌تر می‌سازد اما اندیکاتور کف بالاتر می‌سازد", "قیمت و اندیکاتور هر دو سقف جدید می‌زنند", "اندیکاتور وارد ناحیه صفر می‌شود"], answer: 0 },
  { category: "indicators", q: "تقاطع طلایی (Golden Cross) چیست؟", qEn: "What is a Golden Cross?", options: ["عبور صعودی میانگین متحرک ۵۰ روزه از روی میانگین ۲۰۰ روزه", "رسیدن RSI به عدد ۹۰", "برخورد قیمت به باند بالایی بولینگر"], answer: 0 },
  { category: "indicators", q: "اندیکاتور ATR (Average True Range) چه چیزی را می‌سنجد؟", qEn: "What does ATR measure?", options: ["میزان نوسان و دامنه حرکتی بازار (Volatility)", "جهت روند صعودی یا نزولی", "حجم ورودی پول هوشمند"], answer: 0 },
  { category: "indicators", q: "باند بولینگر (Bollinger Bands) هنگام فشرده شدن (Squeeze) چه هشداری می‌دهد؟", qEn: "What does a Bollinger Band Squeeze signal?", options: ["انفجار قیمتی و شروع نوسان شدید قریب‌الوقوع", "پایان یافتن بازارهای مالی", "افت کامل نقدینگی"], answer: 0 },

  // Forex & Gold & Macroeconomics
  { category: "forex", q: "در جفت‌ارز EURUSD، ارز پایه (Base Currency) کدام است؟", qEn: "In EURUSD, which is the base currency?", options: ["یورو (EUR)", "دلار (USD)", "هر دو برابرند"], answer: 0 },
  { category: "forex", q: "پیپ (Pip) در اکثر جفت‌ارزهای اصلی فارکس رقم چندم اعشار است؟", qEn: "A pip is which decimal place in standard Forex pairs?", options: ["رقم چهارم اعشار (0.0001)", "رقم دوم اعشار (0.01)", "رقم اول اعشار (0.1)"], answer: 0 },
  { category: "forex", q: "رشد شاخص دلار آمریکا (DXY) معمولاً چه تاثیری روی طلا (XAUUSD) دارد؟", qEn: "Rising US Dollar Index (DXY) typically has what effect on Gold?", options: ["کاهش قیمت طلا (همبستگی منفی)", "افزایش قیمت طلا", "هیچ تاثیری ندارد"], answer: 0 },
  { category: "forex", q: "خبر اعلام نرخ بهره توسط فدرال رزرو (FOMC) چه اثری بر بازار دارد؟", qEn: "How does the FOMC interest rate decision impact markets?", options: ["ایجاد نوسانات بسیار شدید و جهت‌دهی میان‌مدت به دلار", "توقف کامل معاملات", "فقط تغییر اسپرد"], answer: 0 },
  { category: "forex", q: "اسپرد (Spread) در بازار معاملاتی چیست؟", qEn: "What is the spread in trading?", options: ["تفاوت بین قیمت خرید (Ask) و قیمت فروش (Bid)", "کمیسیون ثابت سالانه", "حداکثر لوریج مجاز"], answer: 0 },

  // Crypto Fundamentals & Market Structure
  { category: "crypto", q: "هاوینگ بیت‌کوین (Bitcoin Halving) چه تاثیری دارد؟", qEn: "What does Bitcoin Halving do?", options: ["پاداش استخراج هر بلاک نصف می‌شود و نرخ عرضه کاهش می‌یابد", "تعداد کل بیت‌کوین‌ها نصف می‌شود", "کارمزد شبکه صفر می‌شود"], answer: 0 },
  { category: "crypto", q: "منظور از دامیننس بیت‌کوین (BTC.D) چیست؟", qEn: "What is Bitcoin Dominance (BTC.D)?", options: ["سهم ارزش بازار بیت‌کوین نسبت به کل بازار رمزارزها", "سرعت تراکنش‌های شبکه بیت‌کوین", "تعداد هولدرهای بیت‌کوین"], answer: 0 },
  { category: "crypto", q: "معامله فیوچرز با اهرم ۱۰ (10x Leverage) یعنی:", qEn: "10x leverage in futures trading means?", options: ["سود و زیان شما ۱۰ برابر محاسبه شده و با ۱۰٪ تغییر منفی لیکوئید می‌شوید", "سرمایه شما ۱۰ برابر افزایش یافته و خطر ندارد", "کارمزد معاملات ۱۰ برابر ارزان‌تر می‌شود"], answer: 0 },
  { category: "crypto", q: "فاندینگ ریت (Funding Rate) مثبت در فیوچرز کریپتو نشانه چیست؟", qEn: "A positive Funding Rate indicates?", options: ["خریداران (Long) به فروشندگان (Short) کارمزد پرداخت می‌کنند و تمایل بازار صعودی است", "فروشندگان به خریداران پرداخت می‌کنند", "صرافی در حال پرداخت سود است"], answer: 0 },
  { category: "crypto", q: "لیکوئید شدن (Liquidation) در معامله فیوچرز به چه معناست؟", qEn: "What is liquidation in futures?", options: ["بسته شدن اجباری پوزیشن به دلیل از دست رفتن کل مارجین تخصیص‌یافته", "برداشت سود به کیف پول", "انتقال وجه بین حساب‌ها"], answer: 0 },
];

export const startQuiz = mutation({
  args: { token: v.string(), category: v.optional(v.string()) },
  handler: async (ctx, { token, category }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) throw new Error("session_expired");
    let pool = QUIZ_QUESTIONS;
    if (category && category !== "all") {
      const filtered = QUIZ_QUESTIONS.filter((q) => q.category === category);
      if (filtered.length > 0) pool = filtered;
    }
    const idx = Math.floor(Math.random() * pool.length);
    const q = pool[idx];
    const reward = Number((await getSettingsMap(ctx))["coins.rewardPrediction"] ?? 3);
    const quiz = await ctx.db.insert("demoPredictions", {
      userId: user._id,
      symbol: `QUIZ:${q.category}:${idx}`,
      candles: [],
      outcome: (q.answer === 0 ? "long" : "short") as "long" | "short",
      reward,
      status: "pending",
      created: Date.now(),
    });
    // Store correct answer index in candles[0] as a number
    await ctx.db.patch(quiz, { candles: [q.answer] } as any);
    return {
      id: quiz,
      question: q.q,
      questionEn: q.qEn,
      options: q.options,
      category: q.category,
      totalQuestions: QUIZ_QUESTIONS.length,
      reward,
    };
  },
});

export const resolveQuiz = mutation({
  args: { token: v.string(), quizId: v.id("demoPredictions"), chosen: v.number() },
  handler: async (ctx, { token, quizId, chosen }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) throw new Error("session_expired");
    const p = await ctx.db.get(quizId);
    if (!p || p.userId !== user._id) throw new Error("not_found");
    if (p.status !== "pending") throw new Error("already_resolved");
    const correct = (p.candles as any)?.[0] ?? 0;
    const won = chosen === correct;
    await ctx.db.patch(p._id, { status: won ? "won" : "lost" } as any);
    if (won) {
      // Streak bonus calculation
      const history = await ctx.db
        .query("demoPredictions")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .order("desc")
        .take(15);
      let streak = 1;
      for (const h of history) {
        if (h._id === p._id) continue;
        if (h.status === "won" && h.symbol?.startsWith("QUIZ")) streak++;
        else break;
      }
      const streakBonus = Math.min(5, Math.max(0, streak - 1));
      const totalReward = p.reward + streakBonus;
      await grantWolfCoins(ctx, user, totalReward, "reward_quiz", `quiz:correct (streak ${streak})`);
      return { ok: true, won, reward: totalReward, streak, correct };
    }
    return { ok: true, won, reward: 0, streak: 0, correct };
  },
});

/** Charges wolf coins and returns the full engine signal (strategies + reasons). */
export const unlockSignalDetail = mutation({
  args: { token: v.string(), signalId: v.id("signals") },
  handler: async (ctx, { token, signalId }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) throw new Error("session_expired");
    const signal = await ctx.db.get(signalId);
    if (!signal) throw new Error("سیگنال یافت نشد");
    // one-time purchase: already unlocked → re-viewable forever for free
    const unlocks = user.signalUnlocks ?? [];
    const already = unlocks.includes(String(signalId));
    if (!already) {
      const cost = Math.max(0, Number((await getSettingsMap(ctx))["coins.signalDetail"] ?? 10));
      if (cost > 0) {
        const cur = user.wolfCoins ?? 0;
        if (cur < cost) throw new Error("ولف کوین کافی نیست — برای باز کردن جزئیات سیگنال سکه بخرید");
        await burnWolfCoins(ctx, user, cost, "signal_detail");
      }
      await ctx.db.patch(user._id, { signalUnlocks: [...unlocks, String(signalId)].slice(-60) });
    }
    return {
      id: signal._id,
      symbol: signal.symbol,
      timeframe: signal.timeframe,
      direction: signal.direction,
      entry: signal.entry,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      targets: signal.targets ?? [],
      rr: signal.rr,
      score: signal.score,
      confidence: signal.confidence,
      price: signal.price,
      strategyKeys: signal.strategyKeys ?? [],
      reasonsFa: signal.reasonsFa ?? [],
      reasonsEn: signal.reasonsEn ?? [],
      aggregate: signal.aggregate ?? null,
      created: signal.created,
    };
  },
});

// ─── admin telegram alert helpers (used by admin.ts via scheduler) ─────────

export { notifyAdmin as scheduleAdminAlert };
