// ---------------------------------------------------------------------------
// Pure policy helpers — NO Convex imports on purpose.
// Everything here is deterministic and unit-testable (see /tests).
// Convex modules import these; the test runner imports them directly.
// ---------------------------------------------------------------------------

// ─── Telegram channel invite links ─────────────────────────────────────────
// A saved value of `https://t.me/` (empty username at seed time) must never
// produce a broken "join channel" button in the bot.

/** True when the link is a real join link (t.me or telegram.me + username). */
export function isValidInviteLink(link: string | null | undefined): boolean {
  const s = String(link ?? "").trim();
  if (!s) return false;
  return /^https?:\/\/(t\.me|telegram\.me)\/[A-Za-z0-9_]{4,}\/?$/.test(s);
}

/**
 * Best-effort invite link: prefer a valid saved link, otherwise derive one
 * from the channel username. Returns "" when neither exists — callers must
 * NOT render a join button with an empty/`https://t.me/` URL.
 */
export function buildInviteLink(
  channelUsername: string | null | undefined,
  saved: string | null | undefined,
): string {
  const raw = String(saved ?? "").trim();
  if (isValidInviteLink(raw)) return raw;
  const u = String(channelUsername ?? "").trim().replace(/^@/, "");
  if (u) return `https://t.me/${u}`;
  return "";
}

// ─── Risk presets (matching admin.applyRiskPreset) ─────────────────────────
export const RISK_PRESETS: ReadonlyArray<{ key: string; riskPerTrade: number }> = [
  { key: "very_low", riskPerTrade: 0.5 },
  { key: "low", riskPerTrade: 0.75 },
  { key: "balanced", riskPerTrade: 1.5 },
  { key: "high", riskPerTrade: 2.0 },
  { key: "very_high", riskPerTrade: 2.5 },
];

/** Nearest preset key for a riskPerTrade value (for UI highlighting). */
export function classifyRiskPreset(riskPerTrade: number): string {
  const r = Number(riskPerTrade);
  if (!Number.isFinite(r)) return "balanced";
  let best = "balanced";
  let bestDist = Infinity;
  for (const p of RISK_PRESETS) {
    const d = Math.abs(r - p.riskPerTrade);
    if (d < bestDist) {
      bestDist = d;
      best = p.key;
    }
  }
  return best;
}

// ─── Telegram membership status ────────────────────────────────────────────
export const MEMBER_STATUSES: ReadonlyArray<string> = [
  "member",
  "administrator",
  "creator",
];

export function membershipStatusOk(status: string | null | undefined): boolean {
  return MEMBER_STATUSES.includes(String(status ?? ""));
}

// ─── Webhook URL ───────────────────────────────────────────────────────────
/** Appends /telegram/webhook to a deployment base URL. */
export function webhookUrlFor(base: string | null | undefined): string {
  const b = String(base ?? "").trim().replace(/\/+$/, "");
  if (!b || !/^https?:\/\//.test(b)) return "";
  // Local Convex dev serves HTTP actions under /http/ prefix;
  // production convex.site serves at root. Detect local by host pattern.
  const isLocal = /127\.0\.0\.1|localhost|daytonaproxy/i.test(b);
  if (/\/(http\/)?telegram\/webhook$/.test(b)) return b;
  return isLocal ? `${b}/http/telegram/webhook` : `${b}/telegram/webhook`;
}

// ─── AI provider chain ─────────────────────────────────────────────────────
// The keyless base always comes first so the AI layer works with zero keys;
// the free chain supplements it when env keys exist (see nodeCalls.ts).
export const KEYLESS_PROVIDER = { provider: "pollinations", model: "openai" } as const;
export const FREE_AI_CHAIN: ReadonlyArray<{
  provider: string;
  model: string;
  envKey: string;
}> = [
  { provider: "gemini", model: "gemini-2.5-flash", envKey: "GEMINI_API_KEY" },
  { provider: "groq", model: "llama-3.3-70b-versatile", envKey: "GROQ_API_KEY" },
  { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", envKey: "OPENROUTER_API_KEY" },
  { provider: "cerebras", model: "llama-3.3-70b", envKey: "CEREBRAS_API_KEY" },
  { provider: "mistral", model: "mistral-small-latest", envKey: "MISTRAL_API_KEY" },
  { provider: "anthropic", model: "claude-3-5-haiku-latest", envKey: "ANTHROPIC_API_KEY" },
];

// ─── Daily education lesson template ───────────────────────────────────────
// Pure text builder used by the education module (learning.ts). The engine
// summarizes the last 24h of user/bot/AI activity into one digestible lesson.
export interface DailyActivity {
  dateFa: string;
  dateEn: string;
  signals: number;
  closed: number;
  winRate: number; // 0..100
  predictions: number;
  predictionWinRate: number; // 0..100
  aiReviews: number;
  topSymbol: string;
  topDirection: string; // long | short
}

export function buildDailyLesson(a: DailyActivity): {
  titleFa: string;
  titleEn: string;
  bodyFa: string;
  bodyEn: string;
} {
  const safe = (n: number) => (Number.isFinite(n) ? n : 0);
  const signals = safe(a.signals);
  const closed = safe(a.closed);
  const winRate = safe(a.winRate);
  const predictions = safe(a.predictions);
  const predWin = safe(a.predictionWinRate);
  const aiReviews = safe(a.aiReviews);
  const top = String(a.topSymbol || "BTCUSDT");
  const dir = a.topDirection === "short" ? "SHORT" : "LONG";

  const closedTxt =
    closed > 0 ? `${closed} معامله بست (نرخ برد ${winRate.toFixed(0)}٪)` : "معامله‌ای نبست";
  const closedTxtEn =
    closed > 0 ? `closed ${closed} trades (${winRate.toFixed(0)}% win rate)` : "closed no trades";
  // Rotating education tip (day-of-month picks one) — every lesson teaches something.
  const tipsFa = [
    "هرگز بدون حد ضرر وارد نشوید؛ حد ضرر همان قیمتی است که اشتباه‌بودن سناریو را ثابت می‌کند.",
    "نسبت ریسک به پاداش (R:R) مهم‌تر از درصد برد است — با R:R حداقل ۱:۲ حتی با ۴۰٪ برد سودآور می‌مانید.",
    "صبر کنید: فقط سیگنال‌هایی را بپذیرید که امتیاز، اجماع و تأیید مستقل همگی از فیلتر موتور عبور کنند.",
    "اندازه پوزیشن را با ریسک محاسبه کنید، نه با احساسات؛ ریسک هر معامله درصد ثابتی از سرمایه باشد.",
  ];
  const tipsEn = [
    "Never enter without a stop-loss — the stop is the price that proves the scenario wrong.",
    "Risk:reward beats win rate — with a 1:2 minimum R:R you stay profitable even at a 40% win rate.",
    "Be patient: only accept setups where score, consensus and independent confirmations all pass the engine's filters.",
    "Size positions from risk, not emotions — each trade risks a fixed percentage of capital.",
  ];
  const tipIdx = new Date().getUTCDate() % tipsFa.length;
  const actFa: string[] = [];
  const actEn: string[] = [];
  if (signals > 0 || closed > 0) {
    actFa.push(`موتور در ۲۴ ساعت گذشته ${signals} سیگنال صادر کرد و ${closedTxt}. قوی‌ترین نماد دیروز ${top} با جهت ${dir} بود.`);
    actEn.push(`The engine published ${signals} signals in the last 24h and ${closedTxtEn}. The strongest symbol yesterday was ${top} (${dir}).`);
  } else {
    actFa.push("موتور دیروز سیگنال جدیدی صادر نکرد — بازار آرام بود یا فیلترهای ورود فعال نبودند؛ این هم خبر خوبی است: هیچ معامله‌ای بهتر از معامله‌ی بی‌کیفیت است.");
    actEn.push("The engine published no new signals yesterday — quiet market or entry filters were off; that is good news: no trade beats a bad trade.");
  }
  if (predictions > 0) {
    actFa.push(`کاربران در بازی حدس کندل ${predictions} پیش‌بینی انجام دادند (نرخ برد ${predWin.toFixed(0)}٪).`);
    actEn.push(`Users made ${predictions} candle guesses (${predWin.toFixed(0)}% win rate).`);
  }
  if (aiReviews > 0) {
    actFa.push(`هوش مصنوعی ${aiReviews} تحلیل/بازبینی تولید کرد.`);
    actEn.push(`The AI produced ${aiReviews} analyses/reviews.`);
  }
  return {
    titleFa: `خلاصه آموزشی ${a.dateFa} — بازار دیروز`,
    titleEn: `Daily lesson ${a.dateEn} — yesterday's market`,
    bodyFa: `${actFa.join("\n")}\n\n💡 نکته آموزشی: ${tipsFa[tipIdx]}\n\nهوش مصنوعی فقط توضیح می‌دهد و هرگز جایگزین مدیریت ریسک نیست.`,
    bodyEn: `${actEn.join("\n")}\n\n💡 Lesson tip: ${tipsEn[tipIdx]}\n\nAI only explains and never replaces risk management.`,
  };
}

// ─── Signal → Telegram message builder ───────────────────────────────────
// Pure text builder used by admin.sendSignalToChannel: hashtags, full
// details (entry/SL/TP/targets/score/RR), the reasons list and a compact
// text sparkline of the recent candles — bilingual (fa / en channels).

export interface SignalMessageInput {
  symbol: string;
  direction: "long" | "short";
  timeframe: string;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  targets?: number[];
  rr?: number;
  score?: number;
  confidence?: number;
  price?: number;
  reasons?: string[];
  closes?: number[];
  createdAt?: number;
  id?: string; // signal row id — printed at the bottom of the channel post
}

/** Shared pair formatter: "XAUUSD" → "XAU/USD", "BTCUSDT" → "BTC/USDT". */
export function fmtPair(symbol: string): string {
  const s = String(symbol ?? "").trim().toUpperCase();
  if (!s) return String(symbol ?? "");
  if (s.includes("/")) return s;
  const quotes = ["USDT", "USD", "JPY", "GBP", "EUR", "CHF", "CAD", "AUD", "NZD", "TRY", "ZAR"];
  for (const q of [...quotes].sort((a, b) => b.length - a.length)) {
    if (s.length > q.length && s.endsWith(q)) return `${s.slice(0, -q.length)}/${q}`;
  }
  return s;
}

/** ASCII candle sparkline: up bars ▲, down bars ▼ — works in any Telegram font. */
export function sparklineText(closes: number[] | null | undefined): string {
  const cs = Array.isArray(closes) ? closes.slice(-28).filter((n) => Number.isFinite(n)) : [];
  if (cs.length < 2) return "";
  const min = Math.min(...cs);
  const max = Math.max(...cs);
  const span = max - min || 1;
  const chars: string[] = [];
  for (let i = 1; i < cs.length; i++) {
    const up = cs[i] >= cs[i - 1];
    const lvl = Math.round(((cs[i] - min) / span) * 3);
    chars.push(up ? "🟩" : "🟥");
  }
  return chars.join("");
}

function fmtNum(n: number | undefined | null, digits = 5): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "—";
  return v >= 1000 ? v.toFixed(2) : v.toFixed(digits);
}

/** Builds the bilingual Telegram signal post. `fa` selects the Persian layout. */
export function buildSignalMessage(input: SignalMessageInput, fa: boolean): string {
  const dir = input.direction === "short" ? "SHORT" : "LONG";
  const pair = fmtPair(input.symbol);
  // Hashtags cannot contain "/" — keep the raw symbol only in #hashtags.
  const tag = `${pair} ${dir} ${String(input.timeframe ?? "").toUpperCase()}`.replace(/\s+/g, " ");
  const lines: string[] = [];
  if (fa) {
    lines.push(`🐺 <b>سیگنال ولف‌ای</b>`);
    lines.push(`<b>${pair}</b> · ${dir} · ${input.timeframe ?? "—"}`);
    lines.push(`\n📍 ورود: <code>${fmtNum(input.entry)}</code>`);
    lines.push(`🛑 حد ضرر: <code>${fmtNum(input.stopLoss)}</code>`);
    lines.push(`🎯 هدف: <code>${fmtNum(input.takeProfit)}</code>`);
    if ((input.targets ?? []).length > 1) lines.push(`   اهداف: ${(input.targets ?? []).map((t) => `<code>${fmtNum(t)}</code>`).join(" · ")}`);
    lines.push(`\n📊 امتیاز: <b>${Math.round(input.score ?? 0)}</b> · اطمینان: ${Math.round((input.confidence ?? 0) * 100)}٪ · ریسک/پاداش: ${(input.rr ?? 0).toFixed(2)}`);
    if (input.price) lines.push(`💵 قیمت لحظه‌ای: <code>${fmtNum(input.price)}</code>`);
    if ((input.reasons ?? []).length > 0) lines.push(`\n💡 دلایل:\n${(input.reasons ?? []).slice(0, 5).map((r) => `• ${r}`).join("\n")}`);
    const sp = sparklineText(input.closes);
    if (sp) lines.push(`\n${sp}`);
    lines.push(`\n#${input.symbol} #${dir.toLowerCase()} #${String(input.timeframe ?? "").replace(/[^a-z0-9]/gi, "")} #wolf_ai #signal`);
    if (input.id) lines.push(`🆔 ID: <code>${input.id.slice(-10)}</code>`);
    lines.push(`⏰ ${input.createdAt ? new Date(input.createdAt).toLocaleString("fa-IR", { hour12: false }) : ""}`);
    lines.push(`\n⚠️ فقط آموزشی — هرگز توصیه مالی نیست.`);
  } else {
    lines.push(`🐺 <b>WOLF AI Signal</b>`);
    lines.push(`<b>${pair}</b> · ${dir} · ${input.timeframe ?? "—"}`);
    lines.push(`\n📍 Entry: <code>${fmtNum(input.entry)}</code>`);
    lines.push(`🛑 Stop loss: <code>${fmtNum(input.stopLoss)}</code>`);
    lines.push(`🎯 Target: <code>${fmtNum(input.takeProfit)}</code>`);
    if ((input.targets ?? []).length > 1) lines.push(`   Targets: ${(input.targets ?? []).map((t) => `<code>${fmtNum(t)}</code>`).join(" · ")}`);
    lines.push(`\n📊 Score: <b>${Math.round(input.score ?? 0)}</b> · Confidence: ${Math.round((input.confidence ?? 0) * 100)}% · Risk/Reward: ${(input.rr ?? 0).toFixed(2)}`);
    if (input.price) lines.push(`💵 Live price: <code>${fmtNum(input.price)}</code>`);
    if ((input.reasons ?? []).length > 0) lines.push(`\n💡 Reasons:\n${(input.reasons ?? []).slice(0, 5).map((r) => `• ${r}`).join("\n")}`);
    const sp = sparklineText(input.closes);
    if (sp) lines.push(`\n${sp}`);
    lines.push(`\n#${input.symbol} #${dir.toLowerCase()} #${String(input.timeframe ?? "").replace(/[^a-z0-9]/gi, "")} #wolf_ai #signal`);
    if (input.id) lines.push(`🆔 ID: <code>${input.id.slice(-10)}</code>`);
    lines.push(`⏰ ${input.createdAt ? new Date(input.createdAt).toISOString() : ""}`);
    lines.push(`\n⚠️ Educational only — never financial advice.`);
  }
  return lines.join("\n");
}
