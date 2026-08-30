// ---------------------------------------------------------------------------
// WOLF engine — broker DB layer (V8 runtime)
// Internal queries/mutations used by the CCXT/Nobitex broker actions in
// broker.ts. Actions (node runtime) call these through ctx.runQuery /
// ctx.runMutation. Decrypted secrets are exposed ONLY through internal
// queries — they never reach the client.
// ---------------------------------------------------------------------------
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin, requireStaff } from "./wolfAuth";
import { getSetting, setSetting } from "./settings";
import { deriveDecrypt } from "./crypto";

export const assertAdmin = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireStaff(ctx, token);
    return true;
  },
});

/** Admin profile for Telegram flows (test message / IDs). */
export const getAdminUser = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const admin = await requireStaff(ctx, token);
    return {
      tgId: (admin as any).tgId ? String((admin as any).tgId) : "",
      username: String(admin.username ?? ""),
      tgUsername: String((admin as any).tgUsername ?? ""),
    };
  },
});

export const getPositionById = internalQuery({
  args: { positionId: v.id("open_positions") },
  handler: async (ctx, { positionId }) => {
    return (await ctx.db.get(positionId)) ?? null;
  },
});

/**
 * All exchange accounts with secrets DECRYPTED (server-side only — this is an
 * internal query, so decrypted credentials never reach the client). Used by
 * the node broker to route orders through any enabled account.
 */
export const listDecryptedExchangeAccounts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const key = (await getSetting(ctx, "system.encryptionKey")) as string | undefined;
    if (!key) return [];
    const rows = await ctx.db.query("exchangeAccounts").collect();
    const out: Array<Record<string, any>> = [];
    for (const r of rows) {
      try {
        out.push({
          id: r._id,
          name: r.name,
          provider: r.provider,
          apiKey: await deriveDecrypt(r.apiKeyEnc, key),
          apiSecret: await deriveDecrypt(r.apiSecretEnc, key),
          passPhrase: r.passPhraseEnc ? await deriveDecrypt(r.passPhraseEnc, key) : "",
          accountId: r.accountId ?? "",
          environment: r.environment,
          enabled: r.enabled,
        });
      } catch {
        // skip accounts that fail to decrypt (encryption key rotated)
      }
    }
    return out;
  },
});

/** First enabled live account (fallback: first enabled) — engine execution target. */
export const getActiveBrokerAccount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("exchangeAccounts").collect();
    const enabled = rows.filter((r) => r.enabled);
    const live = enabled.find((r) => r.environment === "live") ?? enabled[0];
    return live ? { id: live._id, provider: live.provider, name: live.name } : null;
  },
});

export const getBrokerOrderForPosition = internalQuery({
  args: { positionId: v.id("open_positions") },
  handler: async (ctx, { positionId }) => {
    return (
      (await ctx.db
        .query("orders")
        .filter((q) => q.eq(q.field("positionId"), positionId))
        .first()) ?? null
    );
  },
});

/** Keys are missing → keep the position as a paper fill (graceful fallback). */
export const markPaperFallback = internalMutation({
  args: { positionId: v.id("open_positions") },
  handler: async (ctx, { positionId }) => {
    const p = await ctx.db.get(positionId);
    if (!p) return;
    await ctx.db.patch(positionId, {
      exchange: "paper",
      status: "open",
      lastUpdate: Date.now(),
    });
  },
});

/** Order placement failed → close the phantom position honestly. */
export const failBrokerOpen = internalMutation({
  args: { positionId: v.id("open_positions"), message: v.string() },
  handler: async (ctx, { positionId, message }) => {
    const p = await ctx.db.get(positionId);
    if (!p) return;
    await ctx.db.insert("closed_positions", {
      symbol: p.symbol,
      market: p.market,
      side: p.side,
      entry: p.entry,
      current: p.entry,
      quantity: p.quantity,
      size: p.size,
      leverage: p.leverage,
      margin: p.margin,
      pnl: 0,
      pnlPct: 0,
      score: p.score,
      confidence: p.confidence,
      strategyKeys: p.strategyKeys ?? [],
      exchange: p.exchange,
      fee: 0,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      targets: p.targets ?? [],
      progress: 0,
      status: "failed",
      openTime: p.openTime,
      lastAnalysis: p.lastAnalysis,
      lastUpdate: Date.now(),
      mode: p.mode,
      source: p.source,
      type: (p as any).type,
      network: (p as any).network,
      closePrice: p.entry,
      closeTime: Date.now(),
      closeReason: "exchange_error",
      profit: 0,
      error: message.slice(0, 500),
    } as any);
    await ctx.db.delete(positionId);
    try {
      void ctx.scheduler.runAfter(0, internal.notify.notifyAdmin, {
        text: `❌ <b>سفارش صرافی شکست خورد</b>\nSymbol: ${p.symbol} | Side: ${p.side}\n${message.slice(0, 200)}`,
      });
    } catch {
      /* ignore */
    }
  },
});

/** Record the exchange order in the orders ledger. */
export const recordBrokerOrder = internalMutation({
  args: {
    exchange: v.string(),
    symbol: v.string(),
    side: v.string(),
    type: v.string(),
    price: v.optional(v.number()),
    qty: v.number(),
    leverage: v.number(),
    mode: v.string(),
    status: v.string(),
    validated: v.boolean(),
    validationMessage: v.optional(v.string()),
    positionId: v.optional(v.id("open_positions")),
    ref: v.optional(v.string()),
    created: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("orders", args as any);
  },
});

/** Successful exchange fill → adopt the real entry price (+ exchange label). */
export const markBrokerFilled = internalMutation({
  args: { positionId: v.id("open_positions"), entry: v.number(), exchange: v.optional(v.string()) },
  handler: async (ctx, { positionId, entry, exchange }) => {
    const p = await ctx.db.get(positionId);
    if (!p) return;
    await ctx.db.patch(positionId, {
      entry,
      current: entry,
      status: "open",
      ...(exchange ? { exchange } : {}),
      lastUpdate: Date.now(),
    });
  },
});

export const markOrderClosed = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    if (order) await ctx.db.patch(orderId, { status: "closed" });
  },
});

/** Move a live position to closed_positions using the real exchange fill. */
export const finalizeBrokerClose = internalMutation({
  args: {
    positionId: v.id("open_positions"),
    reason: v.string(),
    fillPrice: v.optional(v.number()),
  },
  handler: async (ctx, { positionId, reason, fillPrice }) => {
    const p = await ctx.db.get(positionId);
    if (!p) return;
    const closePrice = fillPrice ?? p.current ?? p.entry;
    const gross = p.side === "long" ? (closePrice - p.entry) * p.quantity : (p.entry - closePrice) * p.quantity;
    const openFee = p.fee ?? 0;
    const closeFee = p.entry * p.quantity * 0.001;
    const pnl = gross - openFee - closeFee;
    const pnlPct = p.entry ? (pnl / (p.entry * p.quantity)) * 100 : 0;
    await ctx.db.insert("closed_positions", {
      symbol: p.symbol,
      market: p.market,
      side: p.side,
      entry: p.entry,
      current: closePrice,
      quantity: p.quantity,
      size: p.size,
      leverage: p.leverage,
      margin: p.margin,
      pnl,
      pnlPct,
      score: p.score,
      confidence: p.confidence,
      strategyKeys: p.strategyKeys ?? [],
      exchange: p.exchange,
      exchangeScale: (p as any).exchangeScale ?? 1,
      fee: openFee + closeFee,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      targets: p.targets ?? [],
      progress: 100,
      status: "closed",
      openTime: p.openTime,
      lastAnalysis: p.lastAnalysis,
      lastUpdate: Date.now(),
      mode: p.mode,
      source: p.source,
      type: (p as any).type,
      network: (p as any).network,
      closePrice,
      closeTime: Date.now(),
      closeReason: reason,
      profit: pnl,
      error: (p as any).error,
    } as any);
    await ctx.db.insert("learningHistory", {
      symbol: p.symbol,
      timeframe: "15m",
      strategies: p.strategyKeys ?? [],
      scores: { score: p.score, confidence: p.confidence },
      signal: p.side,
      decision: reason,
      result: pnl > 0 ? "win" : "loss",
      snapshot: JSON.stringify({ source: "broker_close", closeReason: reason, entry: p.entry, exit: closePrice }),
      pnl,
      created: Date.now(),
    });
    await ctx.db.delete(positionId);
    // Live trades also apply their realized P&L (net of fees) to the engine
    // capital — same accumulation as paper closes.
    const realizedBase = Number(await getSetting(ctx, "engine.realizedPnl") ?? 0);
    await setSetting(ctx, "engine.realizedPnl", Number.isFinite(realizedBase) ? realizedBase + pnl : pnl, "engine");
    // Channel report for the real exchange close (same card as paper closes).
    try {
      void ctx.scheduler.runAfter(0, internal.nodeCalls.notifyTradeClosed, {
        position: { ...p, closePrice, pnl, pnlPct, closeReason: reason },
        mode: p.mode === "live" ? "live" : "demo",
      });
    } catch {
      /* ignore */
    }
  },
});
