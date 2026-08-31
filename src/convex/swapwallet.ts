"use node";

// ---------------------------------------------------------------------------
// SwapWallet API — https://swapwallet.app/api
//   • GET  /v1/market/prices        (public, no auth)  — all OTC prices
//   • GET  /v2/user/balance         (Bearer)           — balances per token
//   • GET  /v2/transaction          (Bearer)           — tx history (filters)
//   • GET  /v1/transaction/{id}     (Bearer)           — single tx detail
//   • POST /v1/market/otc/fast-swap (Bearer)           — instant token swap
//   • POST /v1/market/otc/price     (Bearer)           — locked OTC quote
//   • POST /v1/market/otc/order     (Bearer)           — execute a locked quote
//   • GET  /v1/wallet/crypto-withdraw/config/{token}    — network/withdraw config
//   • POST /v1/wallet/crypto-withdraw (Bearer)          — crypto withdrawal
//
// The API key can be provided TWO ways (env wins, then the admin panel):
//   1. SWAPWALLET_API_KEY env var (Keys tab / server environment)
//   2. "swapwallet.apiKey" setting — editable from the Admin → SwapWallet tab
//      (stored AES-GCM encrypted at rest via the settings store)
// Prices are public and need no key. All money-moving operations are guarded
// with requireAdmin so only the platform owner can execute them.
// ---------------------------------------------------------------------------
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { requireAdmin, requireStaff } from "./wolfAuth";

const SWAPWALLET_BASE = process.env.SWAPWALLET_URL ?? "https://swapwallet.app/api";
const ENV_API_KEY = process.env.SWAPWALLET_API_KEY ?? "";

/** Tokens SwapWallet supports (pairs are TOKEN/QUOTE; quote = USDT | IRT). */
export const SWAPWALLET_TOKENS = ["USDT", "TON", "TRX", "IRT", "ETH", "BNB"] as const;

/** SwapWallet pair ("TON/USDT") → our engine symbol ("TONUSDT"). */
export function pairToSymbol(pair: string): string | null {
  const m = /^([A-Z0-9]{2,10})\/(USDT|IRT)$/.exec(pair.toUpperCase());
  if (!m) return null;
  return m[2] === "USDT" ? `${m[1]}USDT` : null;
}

/** Resolve the API key: env var first, then the admin-editable setting. */
async function resolveApiKey(ctx: any): Promise<string> {
  if (ENV_API_KEY) return ENV_API_KEY;
  try {
    const map: any = await ctx.runQuery(internal.settings.rawSettings, {});
    return String(map?.["swapwallet.apiKey"] ?? "");
  } catch {
    return "";
  }
}

async function swFetch(
  ctx: any,
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<any> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.auth !== false) {
    const key = await resolveApiKey(ctx);
    if (!key) return { status: "ERROR", error: "SWAPWALLET_API_KEY is not configured" };
    headers.Authorization = `Bearer ${key}`;
  }
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const res = await fetch(`${SWAPWALLET_BASE}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) return { status: "ERROR", error: "unauthorized", http: 401 };
    if (res.status === 404) return { status: "ERROR", error: "not_found", http: 404 };
    if (!res.ok) return { status: "ERROR", error: `http_${res.status}`, http: res.status };
    return await res.json();
  } catch (e: any) {
    return { status: "ERROR", error: String(e?.message ?? e) };
  }
}

/** Public OTC price map — one call returns every pair (TON/USDT, TRX/IRT, …). */
export const getSwapwalletPrices = internalAction({
  args: {},
  handler: async (ctx): Promise<Record<string, string>> => {
    const j = await swFetch(ctx, "/v1/market/prices", { auth: false });
    if (!j || typeof j !== "object" || Array.isArray(j)) return {};
    return j as Record<string, string>;
  },
});

/**
 * Fetch live USDT/IRT rate from SwapWallet public OTC feed or Nobitex and persist in settings.
 */
export const syncSwapwalletUsdtRate = internalAction({
  args: {},
  handler: async (ctx): Promise<{ rate: number; source: string }> => {
    let rate = 0;
    let source = "none";
    try {
      const prices = (await ctx.runAction(internal.swapwallet.getSwapwalletPrices, {})) as Record<string, string>;
      const usdtIrt = prices["USDT/IRT"] || prices["USDT/TOMAN"] || prices["USD/IRT"];
      if (usdtIrt && parseFloat(usdtIrt) > 10000) {
        rate = Math.round(parseFloat(usdtIrt));
        source = "swapwallet";
      }
    } catch {
      // fallback to Nobitex
    }

    if (!rate || rate < 10000) {
      try {
        const res = await fetch("https://api.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls");
        if (res.ok) {
          const j: any = await res.json();
          const rls = Number(j?.stats?.["usdt-rls"]?.latest ?? 0);
          if (rls > 100000) {
            rate = Math.round(rls / 10); // Rials to Toman
            source = "nobitex";
          }
        }
      } catch {
        // fallback
      }
    }

    if (rate >= 10000) {
      await ctx.runMutation(internal.settings.writeSettings, {
        values: { "usdt.tomanRate": rate },
      });
    }

    return { rate, source };
  },
});

/** Live balances for every supported token (authed). */
export const getSwapwalletBalances = internalAction({
  args: {},
  handler: async (ctx): Promise<{ status: string; result?: any[]; error?: string }> => {
    const j = await swFetch(ctx, "/v2/user/balance");
    if (j?.status !== "OK") return { status: j?.status ?? "ERROR", error: j?.error };
    return { status: "OK", result: Array.isArray(j.result) ? j.result : [] };
  },
});

/** Recent transactions with optional filters (authed). */
export const getSwapwalletTransactions = internalAction({
  args: {
    types: v.optional(v.array(v.string())),
    tokens: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { types, tokens, limit }): Promise<{ status: string; result?: any; error?: string }> => {
    const q = new URLSearchParams();
    for (const t of types ?? []) q.append("types", t);
    for (const t of tokens ?? []) q.append("tokens", t);
    q.set("limit", String(Math.min(100, Math.max(1, limit ?? 20))));
    q.set("sortDir", "DESC");
    const j = await swFetch(ctx, `/v2/transaction?${q.toString()}`);
    if (j?.status !== "OK") return { status: j?.status ?? "ERROR", error: j?.error };
    return { status: "OK", result: j.result };
  },
});

// ─── money-moving operations (internal — only reachable via the guarded
// public actions below) ─────────────────────────────────────────────────────

/** Instant swap at the best OTC price. Exactly one of sourceAmount /
 * destinationAmount must be provided. */
export const swFastSwap = internalAction({
  args: {
    sourceToken: v.string(),
    destinationToken: v.string(),
    sourceAmount: v.optional(v.string()),
    destinationAmount: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ status: string; result?: any; error?: string }> => {
    const body: Record<string, string> = {
      sourceToken: args.sourceToken.toUpperCase(),
      destinationToken: args.destinationToken.toUpperCase(),
    };
    if (args.sourceAmount) body.sourceAmount = args.sourceAmount;
    else if (args.destinationAmount) body.destinationAmount = args.destinationAmount;
    else return { status: "ERROR", error: "sourceAmount or destinationAmount is required" };
    const j = await swFetch(ctx, "/v1/market/otc/fast-swap", { method: "POST", body });
    if (j?.status !== "OK") return { status: j?.status ?? "ERROR", error: j?.error ?? j?.result?.message ?? "swap_failed" };
    return { status: "OK", result: j.result };
  },
});

/** Locked OTC price — valid for 10 seconds; returns a swapToken to confirm. */
export const swOtcPrice = internalAction({
  args: {
    sourceToken: v.string(),
    destinationToken: v.string(),
    sourceAmount: v.optional(v.string()),
    destinationAmount: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ status: string; result?: any; error?: string }> => {
    const body: Record<string, string> = {
      sourceToken: args.sourceToken.toUpperCase(),
      destinationToken: args.destinationToken.toUpperCase(),
    };
    if (args.sourceAmount) body.sourceAmount = args.sourceAmount;
    else if (args.destinationAmount) body.destinationAmount = args.destinationAmount;
    else return { status: "ERROR", error: "sourceAmount or destinationAmount is required" };
    const j = await swFetch(ctx, "/v1/market/otc/price", { method: "POST", body });
    if (j?.status !== "OK") return { status: j?.status ?? "ERROR", error: j?.error ?? "quote_failed" };
    return { status: "OK", result: j.result };
  },
});

/** Executes a previously locked OTC quote (swapToken is valid ~10s). */
export const swOtcOrder = internalAction({
  args: { swapToken: v.string() },
  handler: async (ctx, { swapToken }): Promise<{ status: string; result?: any; error?: string }> => {
    const j = await swFetch(ctx, "/v1/market/otc/order", { method: "POST", body: { swapToken } });
    if (j?.status !== "OK") return { status: j?.status ?? "ERROR", error: j?.error ?? "order_failed" };
    return { status: "OK", result: j.result };
  },
});

/** Withdraw network config for a token (fees, limits, memo support). */
export const swWithdrawConfig = internalAction({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<{ status: string; result?: any; error?: string }> => {
    const j = await swFetch(ctx, `/v1/wallet/crypto-withdraw/config/${token.toUpperCase()}`);
    if (j?.status !== "OK") return { status: j?.status ?? "ERROR", error: j?.error ?? "config_failed" };
    return { status: "OK", result: j.result };
  },
});

/** Crypto withdrawal to an external address. */
export const swWithdraw = internalAction({
  args: {
    token: v.string(),
    amount: v.string(),
    network: v.string(),
    address: v.string(),
    memo: v.optional(v.string()),
    feeDeductType: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ status: string; result?: any; error?: string }> => {
    const body: Record<string, string> = {
      token: args.token.toUpperCase(),
      amount: args.amount,
      network: args.network,
      address: args.address,
    };
    if (args.memo) body.memo = args.memo;
    if (args.feeDeductType) body.feeDeductType = args.feeDeductType;
    const j = await swFetch(ctx, "/v1/wallet/crypto-withdraw", { method: "POST", body });
    if (j?.status !== "OK") return { status: j?.status ?? "ERROR", error: j?.error ?? "withdraw_failed" };
    return { status: "OK", result: j.result };
  },
});

// ─── public (admin-guarded) actions ────────────────────────────────────────

/**
 * Admin monitor: live SwapWallet balances + recent transactions + price feed
 * availability, plus whether the API key is configured. Read-only — never
 * initiates transfers or swaps.
 */
export const swapwalletOverview = action({
  args: { token: v.string() },
  handler: async (
    ctx,
    { token },
  ): Promise<{
    configured: boolean;
    keyMasked: string;
    baseUrl: string;
    enabled: boolean;
    balances: any[];
    balancesError?: string;
    transactions: any[];
    transactionsError?: string;
    priceCount: number;
    prices: Array<{ pair: string; symbol: string; price: number }>;
    fetchedAt: number;
  }> => {
    await requireStaff(ctx, token);
    const map: any = await ctx.runQuery(internal.settings.rawSettings, {});
    const [balances, txs, prices] = await Promise.all([
      ctx.runAction(internal.swapwallet.getSwapwalletBalances, {}),
      ctx.runAction(internal.swapwallet.getSwapwalletTransactions, { limit: 25 }),
      ctx.runAction(internal.swapwallet.getSwapwalletPrices, {}),
    ]);
    const key = ENV_API_KEY || String(map?.["swapwallet.apiKey"] ?? "");
    const priceRows = Object.entries(prices ?? {})
      .filter(([pair]) => pairToSymbol(pair))
      .map(([pair, price]) => ({ pair, symbol: pairToSymbol(pair) as string, price: Number(price) }))
      .filter((r) => Number.isFinite(r.price) && r.price > 0);
    return {
      configured: Boolean(key),
      keyMasked: key ? `${key.slice(0, 7)}•••${key.slice(-4)}` : "",
      baseUrl: SWAPWALLET_BASE,
      enabled: map?.["wallet.swapwalletEnabled"] !== false,
      balances: balances.status === "OK" ? (balances.result ?? []) : [],
      balancesError: balances.status === "OK" ? undefined : balances.error,
      transactions: txs.status === "OK" ? txs.result?.data ?? [] : [],
      transactionsError: txs.status === "OK" ? undefined : txs.error,
      priceCount: priceRows.length,
      prices: priceRows.slice(0, 40),
      fetchedAt: Date.now(),
    };
  },
});

/** Admin: instant token swap (fast-swap). */
export const swapwalletSwap = action({
  args: {
    token: v.string(),
    sourceToken: v.string(),
    destinationToken: v.string(),
    sourceAmount: v.optional(v.string()),
    destinationAmount: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: string; result?: any; error?: string }> => {
    await requireAdmin(ctx, args.token);
    return ctx.runAction(internal.swapwallet.swFastSwap, {
      sourceToken: args.sourceToken,
      destinationToken: args.destinationToken,
      sourceAmount: args.sourceAmount,
      destinationAmount: args.destinationAmount,
    });
  },
});

/** Admin: request a locked OTC quote (10s validity). */
export const swapwalletOtcQuote = action({
  args: {
    token: v.string(),
    sourceToken: v.string(),
    destinationToken: v.string(),
    sourceAmount: v.optional(v.string()),
    destinationAmount: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: string; result?: any; error?: string }> => {
    await requireAdmin(ctx, args.token);
    return ctx.runAction(internal.swapwallet.swOtcPrice, {
      sourceToken: args.sourceToken,
      destinationToken: args.destinationToken,
      sourceAmount: args.sourceAmount,
      destinationAmount: args.destinationAmount,
    });
  },
});

/** Admin: execute a locked OTC quote. */
export const swapwalletOtcExecute = action({
  args: { token: v.string(), swapToken: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: string; result?: any; error?: string }> => {
    await requireAdmin(ctx, args.token);
    return ctx.runAction(internal.swapwallet.swOtcOrder, { swapToken: args.swapToken });
  },
});

/** Admin: withdrawal network config for a token. */
export const swapwalletWithdrawConfig = action({
  args: { token: v.string(), tokenInput: v.optional(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: string; result?: any; error?: string }> => {
    await requireAdmin(ctx, args.token);
    return ctx.runAction(internal.swapwallet.swWithdrawConfig, {
      token: args.tokenInput ?? "USDT",
    });
  },
});

/** Admin: crypto withdrawal to an external address. */
export const swapwalletWithdraw = action({
  args: {
    token: v.string(), // admin auth token
    withdrawToken: v.string(), // token symbol to withdraw (USDT, TON, TRX…)
    amount: v.string(),
    network: v.string(),
    address: v.string(),
    memo: v.optional(v.string()),
    feeDeductType: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: string; result?: any; error?: string }> => {
    await requireAdmin(ctx, args.token);
    return ctx.runAction(internal.swapwallet.swWithdraw, {
      token: args.withdrawToken,
      amount: args.amount,
      network: args.network,
      address: args.address,
      memo: args.memo,
      feeDeductType: args.feeDeductType,
    });
  },
});
