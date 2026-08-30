// ---------------------------------------------------------------------------
// WOLF Trading System — shared constants & default configuration
// ---------------------------------------------------------------------------

export const APP_NAME = "Trading Wolf AI";
export const APP_VERSION = "1.3.0";

// ─── TEST environment credentials (editable from Admin → Settings) ────────
// Their Telegram bot token / IDs / channel / domain. These are seed values —
// everything can be changed from the admin panel without touching code.
export const SEED_BOT_TOKEN = "6147691183:AAHq1kuTcTn4LO50z3uV5-QXSRm8f_8Q5U";
export const SEED_BOT_USERNAME = "marijtradebot";
export const SEED_OWNER_TG_ID = 1368784788; // مدیر اصلی (mohamad @Mamadmari)
export const SEED_ASSISTANT_TG_ID = 7954119617; // دستیار ادمین (Foad)
export const SEED_CHANNEL_ID = "-1001976277712";
export const SEED_CHANNEL_USERNAME = "marijtrade";
export const SEED_DOMAIN = "https://dash.gadgetfrosh.ir";
export const SEED_SERVER_IP = "31.15.17.191";

// Gemini fallback key (their TEST key, editable in admin panel).
// Production deployments should set GEMINI_API_KEY in the server .env instead.
export const SEED_GEMINI_KEY =
  process.env.GEMINI_API_KEY ??
  "AQ.Ab8RN6LnB43YfgLfEsPBlhH_ys1Z025T-KRnNTCUNKqUqfUtTg";

// Default admin panel login (change it from Admin → Settings after first login)
export const SEED_ADMIN_USERNAME = "wolfadmin";
export const SEED_ADMIN_PASSWORD = "Wolf3010!";

// ---------------------------------------------------------------------------
export const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TIMEFRAME_MINUTES: Record<string, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "4h": 240,
  "1d": 1440,
};

// Strategy categories (17 — known trading methodologies)
export const CATEGORIES: { id: string; fa: string; en: string }[] = [
  { id: "price_action", fa: "پرایس اکشن", en: "Price Action" },
  { id: "chart_patterns", fa: "الگوهای نموداری", en: "Chart Patterns" },
  { id: "trend_following", fa: "پیروی از روند", en: "Trend Following" },
  { id: "momentum", fa: "مومنتوم", en: "Momentum" },
  { id: "mean_reversion", fa: "بازگشت به میانگین", en: "Mean Reversion" },
  { id: "breakout", fa: "بریک‌اوت", en: "Breakout" },
  { id: "scalping", fa: "اسکالپینگ", en: "Scalping" },
  { id: "swing", fa: "سوینگ", en: "Swing" },
  { id: "smc", fa: "اس‌ام‌سی", en: "SMC" },
  { id: "ict", fa: "آی‌سی‌تی", en: "ICT" },
  { id: "volume", fa: "حجم", en: "Volume" },
  { id: "volatility", fa: "نوسان‌پذیری", en: "Volatility" },
  { id: "support_resistance", fa: "حمایت و مقاومت", en: "Support/Resistance" },
  { id: "multi_timeframe", fa: "چند تایم‌فریمی", en: "Multi-Timeframe" },
  { id: "market_structure", fa: "ساختار بازار", en: "Market Structure" },
  { id: "liquidity", fa: "نقدینگی", en: "Liquidity" },
  { id: "indicator_combos", fa: "ترکیب اندیکاتورها", en: "Indicator Combinations" },
];

// Exchange / broker providers supported by the adapter layer
export const EXCHANGE_PROVIDERS: {
  id: string;
  name: string;
  kind: "crypto" | "mt5" | "cfd";
  docs: string;
}[] = [
  { id: "bingx", name: "BingX", kind: "crypto", docs: "https://bingx.com" },
  { id: "lbank", name: "LBank", kind: "crypto", docs: "https://www.lbank.com" },
  { id: "binance", name: "Binance", kind: "crypto", docs: "https://www.binance.com" },
  { id: "okx", name: "OKX", kind: "crypto", docs: "https://www.okx.com" },
  { id: "bybit", name: "Bybit", kind: "crypto", docs: "https://www.bybit.com" },
  { id: "bitget", name: "Bitget", kind: "crypto", docs: "https://www.bitget.com" },
  { id: "kucoin", name: "KuCoin", kind: "crypto", docs: "https://www.kucoin.com" },
  { id: "mexc", name: "MEXC", kind: "crypto", docs: "https://www.mexc.com" },
  { id: "huobi", name: "HTX (Huobi)", kind: "crypto", docs: "https://www.htx.com" },
  { id: "coinbase", name: "Coinbase", kind: "crypto", docs: "https://www.coinbase.com" },
  { id: "mt5", name: "MetaTrader 5", kind: "mt5", docs: "https://www.metatrader5.com" },
  { id: "deriv", name: "Deriv", kind: "cfd", docs: "https://deriv.com" },
];