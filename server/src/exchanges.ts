// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — Exchange adapters
// Plugin-based: every provider implements the same interface
//   { ticker, klines, balance, placeOrder, closePosition }
// Market data works WITHOUT keys (public REST). Orders need keys, which are
// stored encrypted (exchange_accounts) and only used server-side.
// PAPER adapter is the default until the admin activates LIVE mode.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import { pool, many, logEngine } from "./db.js";
import { decryptSecret, now, num } from "./util.js";

export interface Kline {
  t: number; // open ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface OrderRequest {
  symbol: string;
  side: "buy" | "sell"; // buy = long/entry, sell = short/entry (or exit)
  qty: number;
  price?: number;
  leverage?: number;
  idempotencyKey: string;
}

export interface OrderResult {
  ok: boolean;
  orderId?: string;
  filledPrice?: number;
  filledQty?: number;
  error?: string;
}

export interface ExchangeAdapter {
  name: string;
  ticker(symbol: string): Promise<{ price: number; change24h: number } | null>;
  klines(symbol: string, timeframe: string, limit?: number): Promise<Kline[]>;
  balance(): Promise<number | null>; // USDT-equivalent available
  placeOrder(req: OrderRequest): Promise<OrderResult>;
  closePosition(symbol: string, side: "long" | "short", qty: number): Promise<OrderResult>;
}

// ── HTTP helper ──────────────────────────────────────────────────────────────
async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  return res.json();
}

const TF: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h", "4h": "4h", "1d": "1d",
};

// ── Adapters ─────────────────────────────────────────────────────────────────
const binance: ExchangeAdapter = {
  name: "binance",
  async ticker(symbol) {
    const j = await getJson(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
    return { price: num(j.lastPrice), change24h: num(j.priceChangePercent) };
  },
  async klines(symbol, timeframe, limit = 200) {
    const j = await getJson(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${TF[timeframe] ?? "15m"}&limit=${limit}`
    );
    return (j as any[]).map((k) => ({
      t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]),
    }));
  },
  async balance() {
    const acc = await account("binance");
    if (!acc) return null;
    const q = new URLSearchParams({ timestamp: String(Date.now()) }).toString();
    const sig = crypto.createHmac("sha256", acc.secret).update(q).digest("hex");
    const j = await getJson(
      `https://api.binance.com/api/v3/account?${q}&signature=${sig}`,
      { "X-MBX-APIKEY": acc.key }
    );
    const usdt = (j.balances as any[]).find((b: any) => b.asset === "USDT");
    return usdt ? num(usdt.free) + num(usdt.locked) : null;
  },
  async placeOrder(req) {
    const acc = await account("binance");
    if (!acc) return { ok: false, error: "بیننس پیکربندی نشده است." };
    const q = new URLSearchParams({
      symbol: req.symbol,
      side: req.side === "buy" ? "BUY" : "SELL",
      type: "MARKET",
      quantity: String(req.qty),
      timestamp: String(Date.now()),
      newClientOrderId: req.idempotencyKey.slice(0, 36),
    }).toString();
    const sig = crypto.createHmac("sha256", acc.secret).update(q).digest("hex");
    const j = await getJson(`https://api.binance.com/api/v3/order?${q}&signature=${sig}`, {
      "X-MBX-APIKEY": acc.key,
    });
    if (j?.code && j.code !== 200) return { ok: false, error: j.msg ?? "خطای بیننس" };
    return {
      ok: true,
      orderId: String(j.orderId),
      filledPrice: num(j.fills?.[0]?.price) || num(j.cummulativeQuoteQty) / num(j.executedQty) || undefined,
      filledQty: num(j.executedQty) || undefined,
    };
  },
  async closePosition(symbol, side, qty) {
    return this.placeOrder({ symbol, side: side === "long" ? "sell" : "buy", qty, idempotencyKey: `close-${now()}-${symbol}` });
  },
};

const bybit: ExchangeAdapter = {
  name: "bybit",
  async ticker(symbol) {
    const j = await getJson(
      `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`
    );
    const t = j?.result?.list?.[0];
    return t ? { price: num(t.lastPrice), change24h: num(t.price24hPcnt) * 100 } : null;
  },
  async klines(symbol, timeframe, limit = 200) {
    const j = await getJson(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${TF[timeframe] ?? "15"}&limit=${limit}`
    );
    return (j?.result?.list ?? []).map((k: any) => ({
      t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]),
    }));
  },
  async balance() {
    const acc = await account("bybit");
    if (!acc) return null;
    const ts = Date.now();
    const q = `accountType=UNIFIED&api_key=${acc.key}&timestamp=${ts}&recv_window=5000`;
    const sig = crypto.createHmac("sha256", acc.secret).update(q).digest("hex");
    const j = await getJson(`https://api.bybit.com/v5/account/wallet-balance?${q}&sign=${sig}`);
    const coin = j?.result?.list?.[0]?.coin?.find((c: any) => c.coin === "USDT");
    return coin ? num(coin.walletBalance) : null;
  },
  async placeOrder(req) {
    const acc = await account("bybit");
    if (!acc) return { ok: false, error: "بای‌بیت پیکربندی نشده است." };
    const ts = Date.now();
    const body = {
      category: "linear",
      symbol: req.symbol,
      side: req.side === "buy" ? "Buy" : "Sell",
      orderType: "Market",
      qty: String(req.qty),
      orderLinkId: req.idempotencyKey.slice(0, 36),
    };
    const q = `api_key=${acc.key}&recv_window=5000&timestamp=${ts}`;
    const sig = crypto.createHmac("sha256", acc.secret)
      .update(q + JSON.stringify(body))
      .digest("hex");
    const j = await postJson(
      `https://api.bybit.com/v5/order/create?${q}&sign=${sig}`,
      body
    );
    if (j?.retCode !== 0) return { ok: false, error: j?.retMsg ?? "خطای بای‌بیت" };
    return { ok: true, orderId: j?.result?.orderId };
  },
  async closePosition(symbol, side, qty) {
    return this.placeOrder({ symbol, side: side === "long" ? "sell" : "buy", qty, idempotencyKey: `close-${now()}-${symbol}` });
  },
};

const okx: ExchangeAdapter = {
  name: "okx",
  async ticker(symbol) {
    const inst = toOkx(symbol);
    const j = await getJson(`https://www.okx.com/api/v5/market/ticker?instId=${inst}`);
    const t = j?.data?.[0];
    return t ? { price: num(t.last), change24h: num(t.open24h) ? ((num(t.last) - num(t.open24h)) / num(t.open24h)) * 100 : 0 } : null;
  },
  async klines(symbol, timeframe, limit = 200) {
    const inst = toOkx(symbol);
    const bar = (TF[timeframe] ?? "15m").replace("m", "m");
    const j = await getJson(
      `https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=${bar}&limit=${limit}`
    );
    return (j?.data ?? []).map((k: any) => ({
      t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]),
    }));
  },
  async balance() {
    const acc = await account("okx");
    if (!acc) return null;
    const ts = new Date().toISOString();
    const path = "/api/v5/account/balance";
    const sign = crypto.createHmac("sha256", acc.secret).update(ts + "GET" + path + "").digest("base64");
    const j = await getJson(`https://www.okx.com${path}`, {
      "OK-ACCESS-KEY": acc.key,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": acc.passphrase ?? "",
    });
    const d = j?.data?.[0];
    if (!d) return null;
    const usdt = d.details?.find((x: any) => x.ccy === "USDT");
    return usdt ? num(usdt.availBal) + num(usdt.frozenBal) : null;
  },
  async placeOrder(req) {
    const acc = await account("okx");
    if (!acc) return { ok: false, error: "OKX پیکربندی نشده است." };
    const inst = toOkx(req.symbol);
    const body = JSON.stringify({
      instId: inst,
      tdMode: "cross",
      side: req.side === "buy" ? "buy" : "sell",
      ordType: "market",
      sz: String(req.qty),
    });
    const path = "/api/v5/trade/order";
    const ts = new Date().toISOString();
    const sign = crypto.createHmac("sha256", acc.secret).update(ts + "POST" + path + body).digest("base64");
    const j = await postJson(`https://www.okx.com${path}`, body, {
      "OK-ACCESS-KEY": acc.key,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": acc.passphrase ?? "",
      "content-type": "application/json",
    });
    if (j?.code !== "0") return { ok: false, error: j?.msg ?? "خطای OKX" };
    return { ok: true, orderId: j?.data?.[0]?.ordId };
  },
  async closePosition(symbol, side, qty) {
    return this.placeOrder({ symbol, side: side === "long" ? "sell" : "buy", qty, idempotencyKey: `close-${now()}-${symbol}` });
  },
};

const bingx: ExchangeAdapter = {
  name: "bingx",
  async ticker(symbol) {
    const j = await getJson(
      `https://open-api.bingx.com/openApi/spot/v1/market/ticker?symbol=${symbol}`
    );
    const t = j?.data;
    return t ? { price: num(t.lastPrice), change24h: num(t.priceChangePercent) } : null;
  },
  async klines(symbol, timeframe, limit = 200) {
    const j = await getJson(
      `https://open-api.bingx.com/openApi/spot/v1/market/kline?symbol=${symbol}&interval=${TF[timeframe] ?? "15m"}&limit=${limit}`
    );
    return (j?.data ?? []).map((k: any[]) => ({
      t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]),
    }));
  },
  async balance() {
    const acc = await account("bingx");
    if (!acc) return null;
    const q = new URLSearchParams({ timestamp: String(Date.now()) }).toString();
    const sig = crypto.createHmac("sha256", acc.secret).update(q).digest("hex");
    const j = await getJson(
      `https://open-api.bingx.com/openApi/spot/v1/account/balance?${q}&signature=${sig}`,
      { "X-BX-APIKEY": acc.key }
    );
    const usdt = j?.data?.balances?.find((b: any) => b.asset === "USDT");
    return usdt ? num(usdt.free) + num(usdt.locked) : null;
  },
  async placeOrder(req) {
    const acc = await account("bingx");
    if (!acc) return { ok: false, error: "BingX پیکربندی نشده است." };
    const q = new URLSearchParams({
      symbol: req.symbol,
      side: req.side === "buy" ? "BUY" : "SELL",
      type: "MARKET",
      quantity: String(req.qty),
      timestamp: String(Date.now()),
      newClientOrderId: req.idempotencyKey.slice(0, 36),
    }).toString();
    const sig = crypto.createHmac("sha256", acc.secret).update(q).digest("hex");
    const j = await getJson(
      `https://open-api.bingx.com/openApi/spot/v1/trade/order?${q}&signature=${sig}`,
      { "X-BX-APIKEY": acc.key }
    );
    if (j?.code !== 0) return { ok: false, error: j?.msg ?? "خطای BingX" };
    return { ok: true, orderId: j?.data?.orderId };
  },
  async closePosition(symbol, side, qty) {
    return this.placeOrder({ symbol, side: side === "long" ? "sell" : "buy", qty, idempotencyKey: `close-${now()}-${symbol}` });
  },
};

// Market-data-only adapters (public REST, no keys needed).
function makePublicAdapter(name: string, tickerFn: (s: string) => Promise<{ price: number; change24h: number } | null>, klineFn: (s: string, tf: string, limit: number) => Promise<Kline[]>): ExchangeAdapter {
  return {
    name,
    ticker: tickerFn,
    klines: klineFn,
    async balance() {
      const acc = await account(name);
      return acc ? null : null;
    },
    async placeOrder() {
      return { ok: false, error: `اجرای واقعی روی ${name} هنوز از پنل مدیریت فعال نشده است.` };
    },
    async closePosition() {
      return { ok: false, error: `اجرای واقعی روی ${name} هنوز از پنل مدیریت فعال نشده است.` };
    },
  };
}

const mexc = makePublicAdapter(
  "mexc",
  async (s) => {
    const j = await getJson(`https://api.mexc.com/api/v3/ticker/24hr?symbol=${s}`);
    return { price: num(j.lastPrice), change24h: num(j.priceChangePercent) };
  },
  async (s, tf, limit) => {
    const j = await getJson(`https://api.mexc.com/api/v3/klines?symbol=${s}&interval=${TF[tf] ?? "15m"}&limit=${limit}`);
    return (j as any[]).map((k) => ({ t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]) }));
  }
);

const gate = makePublicAdapter(
  "gate",
  async (s) => {
    const j = await getJson(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${s.replace("USDT", "_USDT")}`);
    const t = j?.[0];
    return t ? { price: num(t.last), change24h: num(t.change_percentage) } : null;
  },
  async (s, tf, limit) => {
    const j = await getJson(
      `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${s.replace("USDT", "_USDT")}&interval=${TF[tf] ?? "15m"}&limit=${limit}`
    );
    return (j as any[]).map((k) => ({ t: num(k[0]) * 1000, o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]) }));
  }
);

const kucoin = makePublicAdapter(
  "kucoin",
  async (s) => {
    const j = await getJson(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${s.replace("USDT", "-USDT")}`);
    return { price: num(j?.data?.price), change24h: 0 };
  },
  async (s, tf, limit) => {
    const j = await getJson(
      `https://api.kucoin.com/api/v1/market/candles?type=${TF[tf] ?? "15min"}&symbol=${s.replace("USDT", "-USDT")}`
    );
    return ((j?.data ?? []) as any[]).slice(0, limit).map((k) => ({
      t: num(k[0]) * 1000, o: num(k[1]), c: num(k[2]), h: num(k[3]), l: num(k[4]), v: num(k[5]),
    }));
  }
);

const lbank = makePublicAdapter(
  "lbank",
  async (s) => {
    const j = await getJson(`https://api.lbank.info/api/v2/ticker?symbol=${s.toLowerCase()}_usdt`);
    const t = j?.data?.[0];
    return t ? { price: num(t.ticker?.latest), change24h: 0 } : null;
  },
  async (s, tf, limit) => {
    const j = await getJson(
      `https://api.lbank.info/api/v2/kline?symbol=${s.toLowerCase()}_usdt&type=minute${TF[tf] ?? "15"}&size=${limit}`
    );
    return ((j?.data ?? []) as any[]).map((k) => ({
      t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]),
    }));
  }
);

const bitget = makePublicAdapter(
  "bitget",
  async (s) => {
    const j = await getJson(`https://api.bitget.com/api/v2/spot/market/tickers?symbol=${s}`);
    const t = j?.data?.[0];
    return t ? { price: num(t.lastPr), change24h: num(t.change24h) } : null;
  },
  async (s, tf, limit) => {
    const j = await getJson(
      `https://api.bitget.com/api/v2/spot/market/candles?symbol=${s}&granularity=${TF[tf] ?? "15m"}&limit=${limit}`
    );
    return ((j?.data ?? []) as any[]).map((k) => ({
      t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]),
    }));
  }
);

const coinex = makePublicAdapter(
  "coinex",
  async (s) => {
    const j = await getJson(`https://api.coinex.com/v1/market/ticker?market=${s}`);
    return { price: num(j?.data?.ticker?.last), change24h: 0 };
  },
  async (s, tf, limit) => {
    const j = await getJson(`https://api.coinex.com/v1/market/kline?market=${s}&type=${TF[tf] ?? "15min"}&limit=${limit}`);
    return ((j?.data ?? []) as any[]).map((k) => ({
      t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]),
    }));
  }
);

// MT5 needs a local bridge (MT5 terminal + Python/Node plugin) — honest stub.
const mt5: ExchangeAdapter = {
  name: "mt5",
  async ticker() {
    return null;
  },
  async klines() {
    return [];
  },
  async balance() {
    const acc = await account("mt5");
    if (!acc) return null;
    return null; // requires bridge response
  },
  async placeOrder() {
    return { ok: false, error: "اتصال MT5 نیاز به Bridge محلی دارد؛ از پنل مدیریت وضعیت را بررسی کنید." };
  },
  async closePosition() {
    return { ok: false, error: "اتصال MT5 نیاز به Bridge محلی دارد؛ از پنل مدیریت وضعیت را بررسی کنید." };
  },
};

export const adapters: Record<string, ExchangeAdapter> = {
  binance, bybit, okx, bingx, mexc, gate, kucoin, lbank, bitget, coinex, mt5,
};

function toOkx(symbol: string): string {
  return symbol.replace(/^(.+)(USDT|USDC|BTC|ETH)$/, "$1-$2");
}

async function account(provider: string): Promise<{ key: string; secret: string; passphrase?: string } | null> {
  const a = await pool
    .query(
      `SELECT api_key_enc, api_secret_enc, pass_phrase_enc FROM exchange_accounts
        WHERE provider = $1 AND enabled = true AND environment = 'live' ORDER BY created_at DESC LIMIT 1`,
      [provider]
    )
    .catch(() => ({ rows: [] as any[] }));
  const row = a.rows[0];
  if (!row) return null;
  try {
    return {
      key: decryptSecret(row.api_key_enc),
      secret: decryptSecret(row.api_secret_enc),
      passphrase: row.pass_phrase_enc ? decryptSecret(row.pass_phrase_enc) : undefined,
    };
  } catch {
    return null;
  }
}

/** Market data with provider fallback chain. Returns candles sorted by time asc. */
export async function fetchKlines(
  symbol: string,
  timeframe: string,
  providers: string[] = ["binance", "bybit", "okx", "bingx", "mexc", "gate", "kucoin", "lbank", "bitget", "coinex"]
): Promise<Kline[]> {
  for (const name of providers) {
    const a = adapters[name];
    if (!a) continue;
    try {
      const ks = await a.klines(symbol, timeframe, 300);
      if (ks.length >= 30) {
        // newest first on most exchanges → sort ascending
        const sorted = [...ks].sort((x, y) => x.t - y.t);
        return sorted.slice(-250);
      }
    } catch (e: any) {
      await logEngine("WARNING", `market ${name} ${symbol} ${timeframe} failed: ${e.message}`, null, "market");
    }
  }
  return [];
}

/** Best-effort real ticker with fallback. */
export async function fetchTicker(
  symbol: string
): Promise<{ price: number; change24h: number } | null> {
  const order = ["binance", "bybit", "okx", "bingx", "mexc", "gate", "kucoin", "lbank", "bitget", "coinex"];
  for (const name of order) {
    const a = adapters[name];
    try {
      const t = await a.ticker(symbol);
      if (t && t.price > 0) return t;
    } catch {
      /* next */
    }
  }
  return null;
}

/** Paper adapter used when LIVE trading is not activated. */
export const paperAdapter: ExchangeAdapter = {
  name: "paper",
  async ticker(symbol) {
    return fetchTicker(symbol);
  },
  async klines(symbol, timeframe, limit = 200) {
    return fetchKlines(symbol, timeframe);
  },
  async balance() {
    const s = await pool.query(`SELECT value FROM system_settings WHERE key = 'engine.virtualCapital'`);
    return num(s.rows[0]?.value ?? 1000);
  },
  async placeOrder(req) {
    return { ok: true, orderId: `paper-${now()}`, filledPrice: req.price, filledQty: req.qty };
  },
  async closePosition() {
    return { ok: true, orderId: `paper-${now()}` };
  },
};
