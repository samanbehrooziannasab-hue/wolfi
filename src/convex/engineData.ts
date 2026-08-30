// ---------------------------------------------------------------------------
// Internal queries — read-only access for actions (engine worker, AI,
// Telegram bridge) that run outside a mutation transaction.
// ---------------------------------------------------------------------------
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { getSettingsMap } from "./settings";
import { requireAdmin } from "./wolfAuth";
import { log } from "./logs";

/** Resolves a wolf session by its sha256 token hash to a user (for actions). */
export const resolveTokenUser = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const session = await ctx.db
      .query("wolfSessions")
      .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      // Read-only path: treat expired sessions as invalid and leave cleanup
      // to the mutations (createWolfSession / killWolfSession).
      return null;
    }
    const user = await ctx.db.get(session.userId);
    if (!user || user.enabled === false) return null;
    return {
      id: user._id,
      name: user.name,
      username: user.username,
      role: user.role ?? "user",
      isAdmin: user.isAdmin ?? false,
      isAssistant: user.isAssistant ?? false,
      isVip: user.isVip ?? false,
      canTrade: user.canTrade ?? false,
      language: user.language ?? "fa",
      theme: user.theme ?? "dark",
      phone: user.phone,
      vipPackage: user.vipPackage,
    };
  },
});

/** Reads a single position by id (for re-analysis / close actions). */
export const getPosition = internalQuery({
  args: { positionId: v.id("open_positions") },
  handler: async (ctx, { positionId }) => {
    const p = await ctx.db.get(positionId);
    return p ? { ...p } : null;
  },
});

/** Reads the current broker-provider + engine settings needed by actions. */
export const getActionSettings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("systemSettings").collect();
    const map: Record<string, any> = {};
    for (const r of rows) map[r.key] = r.value;
    return map;
  },
});

/** Reads the bounded, database-only part of an admin backtest request. */
export const getBacktestContext = internalQuery({
  args: { token: v.string(), symbol: v.string(), timeframe: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const settings = await getSettingsMap(ctx);
    const strategies = (await ctx.db.query("strategies").collect())
      .filter((s: any) => s.enabled && s.engineEnabled && s.family)
      .map((s: any) => ({ key: s.key, family: s.family, nameFa: s.nameFa, weight: s.weight }));
    const row = await ctx.db
      .query("candles")
      .withIndex("by_symbol_tf", (q: any) => q.eq("symbol", args.symbol).eq("timeframe", args.timeframe))
      .first();
    return { settings, strategies, candles: row?.data ?? null };
  },
});

/** Bounded DB context for the manual-open ACTION (admin picks a pair and the
 * engine forces a position open using the best strategy scan). The action
 * itself fetches fresh candles over HTTP when none are stored. */
export const getManualOpenContext = internalQuery({
  args: { token: v.string(), symbol: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const settings = await getSettingsMap(ctx);
    const marketRow = await ctx.db
      .query("markets")
      .withIndex("by_symbol", (q: any) => q.eq("symbol", args.symbol))
      .first();
    if (!marketRow) throw new Error(`نماد پیدا نشد: ${args.symbol}`);
    const existing = await ctx.db
      .query("open_positions")
      .withIndex("symbol", (q: any) => q.eq("symbol", args.symbol))
      .first();
    if (existing) throw new Error(`یک پوزیشن روی ${args.symbol} باز است — ابتدا آن را ببندید`);
    const strategies = (await ctx.db.query("strategies").collect())
      .filter((s: any) => s.enabled && s.engineEnabled && s.family)
      .map((s: any) => ({ key: s.key, family: s.family, nameFa: s.nameFa, weight: s.weight }));
    if (strategies.length === 0) throw new Error("استراتژی فعالی وجود ندارد");
    const candles15 = await ctx.db
      .query("candles")
      .withIndex("by_symbol_tf", (q: any) => q.eq("symbol", args.symbol).eq("timeframe", "15m"))
      .first();
    const candles1h = await ctx.db
      .query("candles")
      .withIndex("by_symbol_tf", (q: any) => q.eq("symbol", args.symbol).eq("timeframe", "1h"))
      .first();
    return { settings, market: marketRow, strategies, candles15, candles1h };
  },
});

/** Persists fetched backtest candles without allowing the action to write directly. */
export const storeBacktestCandles = internalMutation({
  args: { symbol: v.string(), timeframe: v.string(), candles: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("candles")
      .withIndex("by_symbol_tf", (q: any) => q.eq("symbol", args.symbol).eq("timeframe", args.timeframe))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { data: args.candles, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("candles", { symbol: args.symbol, timeframe: args.timeframe, data: args.candles, updatedAt: Date.now() });
    }
  },
});

/** Hyperopt-style tuner context: settings, strategies and real candle windows. */
export const getTunerContext = internalQuery({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, limit }) => {
    await requireAdmin(ctx, token);
    const settings = await getSettingsMap(ctx);
    const strategies = (await ctx.db.query("strategies").collect())
      .filter((s: any) => s.enabled && s.engineEnabled && s.family)
      .map((s: any) => ({ key: s.key, family: s.family, nameFa: s.nameFa, weight: s.weight }));
    const markets = (await ctx.db.query("markets").collect())
      .filter((m: any) => m.enabled)
      .sort((a: any, b: any) => a.priority - b.priority)
      .slice(0, limit ?? 4);
    const windows: Array<{ symbol: string; timeframe: string; candles: any[] }> = [];
    for (const m of markets) {
      for (const tf of ["15m", "1h"]) {
        const row = await ctx.db
          .query("candles")
          .withIndex("by_symbol_tf", (q: any) => q.eq("symbol", m.symbol).eq("timeframe", tf))
          .first();
        const data = row?.data;
        if (data && data.length >= 50) {
          windows.push({ symbol: m.symbol, timeframe: tf, candles: data.slice(-300) });
        }
      }
    }
    return { settings, strategies, windows };
  },
});

export const recordBacktestLog = internalMutation({
  args: { symbol: v.string(), timeframe: v.string(), trades: v.number(), winRate: v.number() },
  handler: async (ctx, args) => {
    await log(ctx, "INFO", "engine.backtest", `${args.symbol} ${args.timeframe} trades=${args.trades} winRate=${args.winRate}%`, "engine");
  },
});

/** Bounded row-count estimate per table (cap 500 — never heavy reads). */
/** Live last price of a symbol (from the market feed), for actions. */
export const getMarketPrice = internalQuery({
  args: { symbol: v.string() },
  handler: async (ctx, { symbol }) => {
    const row = await ctx.db
      .query("markets")
      .withIndex("by_symbol", (q: any) => q.eq("symbol", symbol))
      .first();
    return row?.lastPrice ?? null;
  },
});

/** Recent learning-history rows for the AI learning-review pass. */
export const recentLearning = internalQuery({
  args: { after: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, { after, limit }) => {
    const rows = await ctx.db.query("learningHistory").order("desc").take(limit ?? 8);
    return (after ? rows.filter((r: any) => (r.created ?? 0) >= after) : rows).map((r: any) => ({
      symbol: r.symbol,
      signal: r.signal,
      scores: r.scores,
      win: r.win,
      lesson: r.lesson,
      created: r.created,
    }));
  },
});

export const tableCounts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "users",
      "open_positions",
      "closed_positions",
      "signals",
      "engineLogs",
      "auditLogs",
      "ai_analysis",
      "learningHistory",
      "coinTransactions",
      "walletTransactions",
      "candles",
      "strategies",
      "markets",
      "supportTickets",
      "telegram_messages",
      "notifications",
    ] as const;
    const CAP = 500;
    const out: Record<string, number> = {};
    for (const t of tables) {
      try {
        const rows = await (ctx.db.query(t) as any).take(CAP + 1);
        out[t] = rows.length > CAP ? CAP : rows.length;
      } catch {
        out[t] = -1;
      }
    }
    return out;
  },
});

// ─── data maintenance (runs on a cron) ─────────────────────────────────────
// Keeps the database small: prunes old logs, AI outputs, closed trades,
// signals and transaction rows so reads stay under the free plan's per-function
// byte limits and the deployment never grows unbounded.

async function pruneTable(ctx: any, table: string, keepN: number, maxDelete = 2000): Promise<number> {
  const keepRows = await ctx.db.query(table).order("desc").take(keepN);
  const keep = new Set(keepRows.map((r: any) => r._id));
  const oldest = await ctx.db.query(table).order("asc").take(maxDelete + keepN);
  let deleted = 0;
  for (const r of oldest) {
    if (keep.has(r._id)) continue;
    await ctx.db.delete(r._id);
    deleted++;
    if (deleted >= maxDelete) break;
  }
  return deleted;
}

export const pruneOldData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const plan: Array<[string, number]> = [
      ["engineLogs", 1000],
      ["auditLogs", 800],
      ["ai_analysis", 400],
      ["learningHistory", 600],
      ["closed_positions", 400],
      ["signals", 800],
      ["notifications", 800],
      ["coinTransactions", 1500],
      ["walletTransactions", 1500],
      ["telegram_messages", 800],
      ["supportMessages", 1000],
      ["supportTickets", 300],
    ];
    const summary: Record<string, number> = {};
    let total = 0;
    for (const [table, keepN] of plan) {
      try {
        const n = await pruneTable(ctx, table as any, keepN);
        if (n > 0) summary[table] = n;
        total += n;
      } catch {
        // a failing table must never abort the whole maintenance run
      }
    }
    if (total > 0) {
      await log(ctx, "INFO", "data.maintenance", `pruned=${total} rows ${JSON.stringify(summary)}`, "system");
    }
  },
});