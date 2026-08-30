// ---------------------------------------------------------------------------
// WOLF engine — broker layer ("use node")
//   • unified access to 100+ CCXT exchanges (binance, bybit, okx, bingx, …)
//     PLUS a native Nobitex adapter (Iranian exchange, not in CCXT)
//   • MULTI-EXCHANGE: credentials come from the exchangeAccounts table
//     (encrypted at rest, decrypted server-side) — several accounts can be
//     configured simultaneously and toggled on/off from the admin panel.
//     Execution routes to the first enabled live account (or the account
//     explicitly attached to a position).
//   • environment-var fallback for quick setups:
//         CCXT_EXCHANGE / CCXT_API_KEY / CCXT_API_SECRET / CCXT_PASSPHRASE /
//         CCXT_TESTNET
//   • real order EXECUTION: market entry (+ exchange-native SL/TP where
//     supported), reduce-only close, real market data via fetchOHLCV
//   • paper fallback: no credentials configured → the engine keeps working
//     in paper mode instead of erroring out
// All DB access goes through internal.brokerData.* (V8 runtime).
// ---------------------------------------------------------------------------
"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import ccxt from "ccxt";

// ─── supported providers (admin Exchanges tab) ─────────────────────────────
export const SUPPORTED_EXCHANGES: Array<{ id: string; label: string; fa: string }> = [
  { id: "binance", label: "Binance", fa: "بایننس" },
  { id: "bybit", label: "Bybit", fa: "بای‌بیت" },
  { id: "okx", label: "OKX", fa: "اوکی‌ایکس" },
  { id: "bingx", label: "BingX", fa: "بینگ‌ایکس" },
  { id: "bitget", label: "Bitget", fa: "بیت‌گت" },
  { id: "kucoin", label: "KuCoin", fa: "کوکوین" },
  { id: "mexc", label: "MEXC", fa: "مکس" },
  { id: "gate", label: "Gate.io", fa: "گیت‌آی‌او" },
  { id: "lbank", label: "LBank", fa: "ال‌بنک" },
  { id: "bitmart", label: "BitMart", fa: "بیتمارت" },
  { id: "coinex", label: "CoinEx", fa: "کوین‌اکس" },
  { id: "phemex", label: "Phemex", fa: "فمکس" },
  { id: "woo", label: "WOO X", fa: "وو‌ایکس" },
  { id: "huobi", label: "HTX (Huobi)", fa: "اچ‌تی‌ایکس" },
  { id: "coinbase", label: "Coinbase", fa: "کوین‌بیس" },
  { id: "kraken", label: "Kraken", fa: "کراکن" },
  { id: "bitfinex", label: "Bitfinex", fa: "بیت‌فینکس" },
  { id: "cryptocom", label: "Crypto.com", fa: "کریپتو دات کام" },
  { id: "bitvavo", label: "Bitvavo", fa: "بیت‌واو" },
  { id: "krakenfutures", label: "Kraken Futures", fa: "کراکن فیوچرز" },
  { id: "nobitex", label: "Nobitex (نوبیتکس)", fa: "نوبیتکس" },
];

export type BrokerCfg = {
  provider: string; // ccxt id or "nobitex"
  apiKey: string;
  apiSecret: string;
  passPhrase: string;
  testnet: boolean;
  label: string; // display name
};

// ─── environment config (quick single-exchange setups) ─────────────────────
export function brokerEnv() {
  return {
    exchangeId: (process.env.CCXT_EXCHANGE ?? "binance").trim().toLowerCase() || "binance",
    apiKey: (process.env.CCXT_API_KEY ?? "").trim(),
    apiSecret: (process.env.CCXT_API_SECRET ?? "").trim(),
    passphrase: (process.env.CCXT_PASSPHRASE ?? "").trim(),
    testnet: /^(1|true|yes|on)$/i.test(process.env.CCXT_TESTNET ?? ""),
  };
}

export function brokerConfigured(): boolean {
  const env = brokerEnv();
  return env.apiKey.length > 0 && env.apiSecret.length > 0;
}

/**
 * Resolve which broker account a position/order should use.
 * Priority: 1) account explicitly attached (preferredId)  2) first enabled
 * live account  3) first enabled account  4) environment variables.
 * Returns null when nothing is configured → paper fallback.
 */
export async function resolveBrokerConfig(ctx: any, preferredId?: string): Promise<BrokerCfg | null> {
  const accounts: Array<Record<string, any>> = await ctx.runQuery(internal.brokerData.listDecryptedExchangeAccounts);
  if (preferredId) {
    const match = accounts.find((a) => String(a.id) === preferredId);
    if (match) return accountToCfg(match);
  }
  const live = accounts.find((a) => a.enabled && a.environment === "live");
  const any = live ?? accounts.find((a) => a.enabled);
  if (any) return accountToCfg(any);
  const env = brokerEnv();
  if (env.apiKey.length > 0 && env.apiSecret.length > 0) {
    return {
      provider: env.exchangeId,
      apiKey: env.apiKey,
      apiSecret: env.apiSecret,
      passPhrase: env.passphrase,
      testnet: env.testnet,
      label: `env:${env.exchangeId}`,
    };
  }
  return null;
}

function accountToCfg(a: Record<string, any>): BrokerCfg {
  const provider = String(a.provider ?? "").toLowerCase().trim();
  const testnet = a.environment === "demo";
  return {
    provider: provider || "binance",
    apiKey: String(a.apiKey ?? ""),
    apiSecret: String(a.apiSecret ?? ""),
    passPhrase: String(a.passPhrase ?? ""),
    testnet,
    label: String(a.name ?? a.provider ?? provider),
  };
}

// ─── CCXT construction ─────────────────────────────────────────────────────
export function createExchangeFromCfg(cfg: BrokerCfg): any {
  const klass = (ccxt as any)[cfg.provider];
  if (!klass) throw new Error(`unknown ccxt exchange: ${cfg.provider}`);
  const exchange: any = new klass({
    apiKey: cfg.apiKey,
    secret: cfg.apiSecret,
    password: cfg.passPhrase || undefined,
    enableRateLimit: true,
    timeout: 20000,
  });
  if (cfg.testnet) exchange.setSandboxMode(true);
  return exchange;
}

export function createExchange(): any {
  if (!brokerConfigured()) return null;
  return createExchangeFromCfg({
    provider: brokerEnv().exchangeId,
    apiKey: brokerEnv().apiKey,
    apiSecret: brokerEnv().apiSecret,
    passPhrase: brokerEnv().passphrase,
    testnet: brokerEnv().testnet,
    label: `env:${brokerEnv().exchangeId}`,
  });
}

// ─── symbol mapping (engine ↔ unified) ─────────────────────────────────────
// Engine symbols: BTCUSDT, SOLUSDT, EURUSD, XAUUSD, GBPJPY, DOGSUSDT …
// CCXT unified:   BTC/USDT, SOL/USDT, EUR/USD, XAU/USD, GBP/JPY, DOGS/USDT …
const QUOTES = [
  "USDT", "USDC", "BUSD", "FDUSD", "USD",
  "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD",
  "CNY", "TRY", "SGD", "HKD", "KRW", "SEK", "NOK", "DKK", "PLN", "ZAR", "MXN", "BRL", "INR",
];

export function toUnifiedSymbol(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  let best: string | null = null;
  for (const q of QUOTES) {
    if (s.length > q.length && s.endsWith(q)) {
      if (!best || q.length > best.length) best = q;
    }
  }
  if (best) return `${s.slice(0, s.length - best.length)}/${best}`;
  return `${s.slice(0, -3)}/${s.slice(-3)}`;
}

export function toEngineSymbol(unified: string): string {
  return unified.replace("/", "");
}

export function normalizeCandles(ohlcv: any[]): Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> {
  return (ohlcv ?? []).map((row) => ({
    t: Number(row[0]),
    o: Number(row[1]),
    h: Number(row[2]),
    l: Number(row[3]),
    c: Number(row[4]),
    v: Number(row[5]),
  }));
}

// ─── Nobitex native adapter (not present in CCXT) ─────────────────────────
const NOBITEX_API = "https://api.nobitex.ir";

async function nobitexSign(
  method: string,
  path: string,
  body: URLSearchParams | null,
  cfg: BrokerCfg,
  headers: Record<string, string>,
): Promise<void> {
  const timestamp = String(Date.now());
  headers["API-Key"] = cfg.apiKey;
  headers["API-Timestamp"] = timestamp;
  const payload = body ? body.toString() : "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(cfg.apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  headers["API-Sign"] = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function nobitexPost(path: string, body: Record<string, string>, cfg: BrokerCfg): Promise<any> {
  const form = new URLSearchParams(body);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  await nobitexSign("POST", path, form, cfg, headers);
  const res = await fetch(`${NOBITEX_API}${path}`, {
    method: "POST",
    headers,
    body: form.toString(),
  });
  const json = (await res.json()) as any;
  if (!res.ok || json?.status !== "ok") {
    throw new Error(json?.message ?? json?.error ?? `Nobitex HTTP ${res.status}`);
  }
  return json;
}

function nobitexPair(symbol: string): { src: string; dst: string } {
  const s = symbol.toUpperCase();
  const quotes = ["USDT", "IRT", "USDC", "BTC", "ETH"];
  for (const q of quotes) {
    if (s.length > q.length && s.endsWith(q)) return { src: s.slice(0, -q.length).toLowerCase(), dst: q.toLowerCase() };
  }
  return { src: s.slice(0, -3).toLowerCase(), dst: s.slice(-3).toLowerCase() };
}

async function nobitexBalances(cfg: BrokerCfg): Promise<Array<{ currency: string; free: number; total: number }>> {
  const json = await nobitexPost("/users/wallets-balance", {}, cfg);
  const balance = json?.balance ?? {};
  return Object.entries(balance)
    .filter(([, v]: any) => Number(v?.balance ?? 0) > 0 || Number(v?.activeBalance ?? 0) > 0)
    .map(([currency, v]: any) => ({
      currency,
      free: Number(v?.activeBalance ?? 0),
      total: Number(v?.balance ?? 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 25);
}

async function nobitexMarketOrder(
  cfg: BrokerCfg,
  symbol: string,
  side: "buy" | "sell",
  amount: number,
): Promise<{ orderId: string; price: number; status: string }> {
  const { src, dst } = nobitexPair(symbol);
  const json = await nobitexPost("/market/orders/add", {
    type: "market",
    srcCurrency: src,
    dstCurrency: dst,
    amount: String(amount),
    mode: "global",
  }, cfg);
  const order = json?.order ?? {};
  return {
    orderId: String(order?.id ?? ""),
    price: Number(order?.price ?? 0),
    status: String(order?.status ?? "filled"),
  };
}

async function nobitexOrderStatus(cfg: BrokerCfg, orderId: string): Promise<{ status: string; price: number }> {
  const json = await nobitexPost("/market/orders/status", { order: orderId }, cfg);
  const order = json?.order ?? {};
  return { status: String(order?.status ?? ""), price: Number(order?.price ?? 0) };
}

export async function fetchNobitexKlines(symbol: string, tf: string): Promise<Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> | null> {
  const resolution: Record<string, string> = {
    "5m": "5", "15m": "15", "30m": "30", "1h": "60", "4h": "240", "1d": "D",
  };
  const reso = resolution[tf];
  if (!reso) return null;
  const to = Math.floor(Date.now() / 1000);
  const from = to - 60 * 60 * 24 * 30; // ~30 days
  try {
    const res = await fetch(
      `${NOBITEX_API}/v2/udf/history?symbol=${symbol.toUpperCase()}&resolution=${reso}&from=${from}&to=${to}`,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as any;
    if (j?.s !== "ok" || !Array.isArray(j?.t)) return null;
    const out: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> = [];
    for (let i = 0; i < j.t.length; i++) {
      if (j.o[i] == null || j.h[i] == null || j.l[i] == null || j.c[i] == null) continue;
      out.push({ t: Number(j.t[i]) * 1000, o: Number(j.o[i]), h: Number(j.h[i]), l: Number(j.l[i]), c: Number(j.c[i]), v: Number(j.v?.[i] ?? 0) });
    }
    return out.length >= 40 ? out : null;
  } catch {
    return null;
  }
}

export async function fetchNobitexTicker(symbol: string): Promise<number | null> {
  const { src, dst } = nobitexPair(symbol);
  try {
    const res = await fetch(`${NOBITEX_API}/market/stats?srcCurrency=${src}&dstCurrency=${dst}`);
    if (!res.ok) return null;
    const j = (await res.json()) as any;
    const stat = j?.stats?.[`${src}-${dst}`];
    const price = Number(stat?.latest ?? 0);
    return price > 0 ? price : null;
  } catch {
    return null;
  }
}

// ─── public admin actions ──────────────────────────────────────────────────
export const testConnection = action({
  args: { token: v.string(), accountId: v.optional(v.string()) },
  handler: async (ctx, { token, accountId }): Promise<any> => {
    await ctx.runQuery(internal.brokerData.assertAdmin, { token });
    const cfg = await resolveBrokerConfig(ctx, accountId);
    if (!cfg) {
      return {
        ok: false,
        configured: false,
        exchange: "none",
        testnet: false,
        error: "broker_not_configured",
        requiredEnv: ["exchange account (admin → Exchanges tab) or CCXT_API_KEY / CCXT_API_SECRET"],
      };
    }
    try {
      if (cfg.provider === "nobitex") {
        const balances = await nobitexBalances(cfg);
        return { ok: true, configured: true, exchange: "nobitex", testnet: cfg.testnet, balance: balances.slice(0, 10), error: null };
      }
      const exchange = createExchangeFromCfg(cfg);
      const balance = await exchange.fetchBalance();
      const total = Object.entries(balance.total ?? {})
        .filter(([, value]) => Number(value) > 0)
        .map(([currency, value]) => ({ currency, total: Number(value) }));
      return { ok: true, configured: true, exchange: cfg.provider, testnet: cfg.testnet, balance: total.slice(0, 25), error: null };
    } catch (e: any) {
      console.error("[broker] testConnection failed:", e?.message);
      return { ok: false, configured: true, exchange: cfg.provider, testnet: cfg.testnet, error: String(e?.message ?? e).slice(0, 300) };
    }
  },
});

export const fetchBalance = action({
  args: { token: v.string(), accountId: v.optional(v.string()) },
  handler: async (ctx, { token, accountId }): Promise<any> => {
    await ctx.runQuery(internal.brokerData.assertAdmin, { token });
    const cfg = await resolveBrokerConfig(ctx, accountId);
    if (!cfg) return { ok: false, error: "broker_not_configured" };
    try {
      if (cfg.provider === "nobitex") {
        return { ok: true, balances: await nobitexBalances(cfg) };
      }
      const exchange = createExchangeFromCfg(cfg);
      const balance = await exchange.fetchBalance();
      const entries = Object.entries(balance.total ?? {})
        .filter(([, value]) => Number(value) > 0)
        .map(([currency, value]) => ({ currency, free: Number(balance.free?.[currency] ?? 0), total: Number(value) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 25);
      return { ok: true, balances: entries };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e).slice(0, 300) };
    }
  },
});

/** Real candles (CCXT or Nobitex), persisted into the candles table. */
export const fetchCandles = action({
  args: { token: v.string(), symbol: v.string(), timeframe: v.string(), limit: v.optional(v.number()), accountId: v.optional(v.string()) },
  handler: async (ctx, { token, symbol, timeframe, limit, accountId }): Promise<any> => {
    await ctx.runQuery(internal.brokerData.assertAdmin, { token });
    const supported = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];
    if (!supported.includes(timeframe)) return { ok: false, error: `unsupported timeframe: ${timeframe}` };
    const cfg = await resolveBrokerConfig(ctx, accountId);
    try {
      let candles: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
      if (cfg?.provider === "nobitex") {
        const k = await fetchNobitexKlines(symbol, timeframe);
        if (!k?.length) return { ok: false, error: "no candles returned" };
        candles = k.slice(-Math.min(1000, limit ?? 300));
      } else {
        if (!cfg) return { ok: false, error: "broker_not_configured" };
        const exchange = createExchangeFromCfg(cfg);
        const unified = toUnifiedSymbol(symbol);
        const ohlcv = await exchange.fetchOHLCV(unified, timeframe, undefined, Math.min(1000, limit ?? 300));
        if (!ohlcv?.length) return { ok: false, error: "no candles returned" };
        candles = normalizeCandles(ohlcv);
      }
      await ctx.runMutation(internal.engineData.storeBacktestCandles, { symbol, timeframe, candles });
      return { ok: true, symbol, timeframe, count: candles.length, first: candles[0], last: candles[candles.length - 1] };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e).slice(0, 300) };
    }
  },
});

export const fetchPositions = action({
  args: { token: v.string(), accountId: v.optional(v.string()) },
  handler: async (ctx, { token, accountId }): Promise<any> => {
    await ctx.runQuery(internal.brokerData.assertAdmin, { token });
    const cfg = await resolveBrokerConfig(ctx, accountId);
    if (!cfg) return { ok: false, error: "broker_not_configured" };
    try {
      if (cfg.provider === "nobitex") {
        // Nobitex does not expose open positions — surface open orders instead.
        const json = await nobitexPost("/market/orders/list", { type: "all", status: "Active" }, cfg);
        const orders = Array.isArray(json?.orders) ? json.orders : [];
        return {
          ok: true,
          positions: orders.map((o: any) => ({
            symbol: `${String(o?.srcCurrency ?? "").toUpperCase()}${String(o?.dstCurrency ?? "").toUpperCase()}`,
            side: o?.type === "buy" ? "long" : "short",
            contracts: Number(o?.amount ?? 0),
            size: Number(o?.totalPrice ?? 0),
            entryPrice: Number(o?.price ?? 0),
            pnl: 0,
          })),
        };
      }
      const exchange = createExchangeFromCfg(cfg);
      const raw: any[] = [];
      try {
        const positions = await exchange.fetchPositions();
        raw.push(...positions);
      } catch {
        /* spot or unsupported endpoint — fall back to open orders */
      }
      if (raw.length === 0) {
        try {
          const orders = await exchange.fetchOpenOrders();
          raw.push(
            ...orders.map((o: any) => ({
              symbol: toEngineSymbol(o.symbol ?? ""),
              side: o.side,
              contracts: o.amount,
              notional: o.cost,
              entryPrice: o.price,
              liquidationPrice: undefined,
              percentage: undefined,
              unrealizedPnl: undefined,
            })),
          );
        } catch {
          /* ignore */
        }
      }
      return {
        ok: true,
        positions: raw.map((p: any) => ({
          symbol: toEngineSymbol(p.symbol ?? ""),
          side: p.side,
          contracts: Number(p.contracts ?? 0),
          size: Number(p.notional ?? 0),
          entryPrice: Number(p.entryPrice ?? 0),
          liquidation: Number(p.liquidationPrice ?? 0) || undefined,
          pnl: Number(p.unrealizedPnl ?? 0),
        })),
      };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e).slice(0, 300) };
    }
  },
});

// ─── internal engine actions ───────────────────────────────────────────────
/**
 * Place the real market order for a position opened in live mode. Routes
 * through the configured account (CCXT or Nobitex); paper fallback when no
 * broker credentials are configured.
 */
export const executeOpen = internalAction({
  args: {
    positionId: v.id("open_positions"),
    symbol: v.string(),
    side: v.string(),
    tradeType: v.string(),
    entry: v.number(),
    stopLoss: v.number(),
    takeProfit: v.number(),
    leverage: v.number(),
    size: v.number(),
    quantity: v.number(),
    mode: v.string(),
    brokerId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const cfg = await resolveBrokerConfig(ctx, args.brokerId);
    if (!cfg) {
      await ctx.runMutation(internal.brokerData.markPaperFallback, { positionId: args.positionId });
      console.log(`[broker] no credentials — paper fallback for ${args.symbol}`);
      return { ok: true, paper: true };
    }
    const position: any = await ctx.runQuery(internal.brokerData.getPositionById, { positionId: args.positionId });
    if (!position) return { ok: false, reason: "position_gone" };

    try {
      // ── Nobitex: native market order (spot, long only like its API) ──
      if (cfg.provider === "nobitex") {
        if (args.side === "short") {
          await ctx.runMutation(internal.brokerData.failBrokerOpen, {
            positionId: args.positionId,
            message: "نوبیتکس شورت اسپات پشتیبانی نمی‌کند — فقط لانگ",
          });
          return { ok: false, reason: "nobitex_short_unsupported" };
        }
        const amount = args.quantity > 0 ? args.quantity : args.size / args.entry;
        const r = await nobitexMarketOrder(cfg, args.symbol, "buy", amount);
        const fill = r.price > 0 ? r.price : args.entry;
        await ctx.runMutation(internal.brokerData.recordBrokerOrder, {
          exchange: `nobitex:${cfg.label}`,
          symbol: args.symbol,
          side: args.side,
          type: "market",
          price: fill,
          qty: amount,
          leverage: 1,
          mode: args.mode === "live" ? "live" : "demo",
          status: r.status || "filled",
          validated: true,
          positionId: args.positionId,
          ref: r.orderId || undefined,
          created: Date.now(),
        });
        await ctx.runMutation(internal.brokerData.markBrokerFilled, {
          positionId: args.positionId,
          entry: fill,
          exchange: `nobitex:${cfg.label}`,
        });
        console.log(`[broker] nobitex opened ${args.symbol} @ ${fill}`);
        return { ok: true, orderId: r.orderId, fill, exchange: "nobitex" };
      }

      // ── CCXT path ────────────────────────────────────────────────────
      const exchange = createExchangeFromCfg(cfg);
      const unified = toUnifiedSymbol(args.symbol);
      const spot = args.tradeType === "spot";
      if (spot && args.side === "short") {
        await ctx.runMutation(internal.brokerData.failBrokerOpen, {
          positionId: args.positionId,
          message: "spot short not supported — switch engine tradeType to futures",
        });
        return { ok: false, reason: "spot_short_unsupported" };
      }

      await exchange.loadMarkets();
      const rawAmount = args.quantity > 0 ? args.quantity : args.size / args.entry;
      let amount = rawAmount;
      try {
        const precise = exchange.amountToPrecision(unified, rawAmount);
        const n = Number(precise);
        if (Number.isFinite(n) && n > 0) amount = n;
      } catch {
        /* fall back to raw amount */
      }
      if (!(amount > 0)) throw new Error(`order amount not positive (${amount})`);

      const side = spot ? "buy" : args.side === "long" ? "buy" : "sell";
      if (!spot) {
        try {
          await exchange.setLeverage(Math.max(1, args.leverage), unified);
        } catch {
          /* some exchanges ignore setLeverage on spot-like symbols */
        }
      }

      let order: any;
      try {
        order = await exchange.createOrder(unified, "market", side, amount, undefined, {
          ...(args.stopLoss > 0 ? { stopLossPrice: args.stopLoss } : {}),
          ...(args.takeProfit > 0 ? { takeProfitPrice: args.takeProfit } : {}),
        });
      } catch (attachError: any) {
        console.warn(`[broker] attached SL/TP failed (${attachError?.message}) — placing market order + separate SL/TP`);
        order = await exchange.createOrder(unified, "market", side, amount);
        const closeSide = args.side === "long" ? "sell" : "buy";
        try {
          if (args.stopLoss > 0) {
            await exchange.createOrder(unified, "stop_market", closeSide, amount, undefined, {
              stopPrice: args.stopLoss,
              reduceOnly: true,
            });
          }
        } catch (e: any) {
          console.warn(`[broker] stop-loss order failed: ${e?.message}`);
        }
        try {
          if (args.takeProfit > 0) {
            await exchange.createOrder(unified, "take_profit_market", closeSide, amount, undefined, {
              stopPrice: args.takeProfit,
              reduceOnly: true,
            });
          }
        } catch (e: any) {
          console.warn(`[broker] take-profit order failed: ${e?.message}`);
        }
      }

      const fill = Number(order?.average ?? order?.price ?? args.entry) || args.entry;
      const orderId = order?.id ? String(order.id) : undefined;
      await ctx.runMutation(internal.brokerData.recordBrokerOrder, {
        exchange: `ccxt:${cfg.provider}`,
        symbol: args.symbol,
        side: args.side,
        type: "market",
        price: fill,
        qty: amount,
        leverage: spot ? 1 : Math.max(1, args.leverage),
        mode: args.mode === "live" ? "live" : "demo",
        status: order?.status ?? "filled",
        validated: true,
        validationMessage: order?.info?.msg ?? undefined,
        positionId: args.positionId,
        ref: orderId,
        created: Date.now(),
      });
      await ctx.runMutation(internal.brokerData.markBrokerFilled, {
        positionId: args.positionId,
        entry: fill,
        exchange: `ccxt:${cfg.provider}`,
      });
      console.log(`[broker] opened ${args.symbol} ${args.side} @ ${fill} (order ${orderId ?? "?"})`);
      return { ok: true, orderId, fill, exchange: cfg.provider };
    } catch (e: any) {
      console.error(`[broker] executeOpen failed for ${args.symbol}:`, e?.message);
      await ctx.runMutation(internal.brokerData.failBrokerOpen, {
        positionId: args.positionId,
        message: String(e?.message ?? e).slice(0, 500),
      });
      return { ok: false, error: String(e?.message ?? e).slice(0, 500) };
    }
  },
});

/**
 * Close a live position on the exchange (reduce-only market close), then
 * finalize the DB record with the real fill price.
 */
export const executeClose = internalAction({
  args: {
    positionId: v.id("open_positions"),
    reason: v.string(),
    tradeType: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    const position: any = await ctx.runQuery(internal.brokerData.getPositionById, { positionId: args.positionId });
    if (!position) return { ok: false, reason: "position_gone" };
    const cfg = await resolveBrokerConfig(ctx, position.brokerId as string | undefined);
    if (!cfg) {
      await ctx.runMutation(internal.brokerData.finalizeBrokerClose, { positionId: args.positionId, reason: args.reason });
      return { ok: false, reason: "broker_not_configured" };
    }
    const order: any = await ctx.runQuery(internal.brokerData.getBrokerOrderForPosition, { positionId: args.positionId });
    if (!order) {
      await ctx.runMutation(internal.brokerData.finalizeBrokerClose, { positionId: args.positionId, reason: args.reason });
      return { ok: false, reason: "no_broker_order" };
    }

    try {
      // ── Nobitex close: market sell of the same amount ────────────────
      if (cfg.provider === "nobitex") {
        const amount = order.qty ?? position.quantity;
        let fillPrice: number | undefined;
        try {
          const r = await nobitexMarketOrder(cfg, position.symbol, "sell", amount);
          if (r.price > 0) fillPrice = r.price;
        } catch (e: any) {
          console.warn(`[broker] nobitex close failed (${e?.message})`);
        }
        if (order._id) await ctx.runMutation(internal.brokerData.markOrderClosed, { orderId: order._id });
        await ctx.runMutation(internal.brokerData.finalizeBrokerClose, {
          positionId: args.positionId,
          reason: args.reason,
          fillPrice,
        });
        console.log(`[broker] nobitex closed ${position.symbol} (${args.reason}) @ ${fillPrice ?? "?"}`);
        return { ok: true, fillPrice: fillPrice ?? null };
      }

      // ── CCXT close ───────────────────────────────────────────────────
      const exchange = createExchangeFromCfg(cfg);
      const unified = toUnifiedSymbol(position.symbol);
      const spot = args.tradeType === "spot";
      const side = spot ? "sell" : position.side === "long" ? "sell" : "buy";
      const amount = order.qty ?? position.quantity;
      let fillPrice: number | undefined;
      try {
        const closeOrder = await exchange.createOrder(unified, "market", side, amount, undefined, { reduceOnly: true });
        fillPrice = Number(closeOrder?.average ?? closeOrder?.price) || undefined;
      } catch (e: any) {
        console.warn(`[broker] market close failed (${e?.message}) — exchange SL/TP may have already closed it`);
        try {
          const open = await exchange.fetchOpenOrders(unified);
          const stillOpen = open.some((o: any) => o.side === (position.side === "long" ? "buy" : "sell") && o.status !== "closed");
          if (!stillOpen) fillPrice = position.current ?? position.entry;
        } catch {
          /* ignore */
        }
      }
      if (order._id) await ctx.runMutation(internal.brokerData.markOrderClosed, { orderId: order._id });
      await ctx.runMutation(internal.brokerData.finalizeBrokerClose, {
        positionId: args.positionId,
        reason: args.reason,
        fillPrice,
      });
      console.log(`[broker] closed ${position.symbol} (${args.reason}) @ ${fillPrice ?? "?"}`);
      return { ok: true, fillPrice: fillPrice ?? null };
    } catch (e: any) {
      console.error(`[broker] executeClose failed for ${position.symbol}:`, e?.message);
      return { ok: false, error: String(e?.message ?? e).slice(0, 500) };
    }
  },
});
