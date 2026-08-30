// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — Wolf-coin game economy (REST parity with Convex coins.ts)
//   · Hourly price-prediction game (deterministic seeded demo candles)
//   · Educational quiz
//   · Coin packages (buy with toman) + paid signal-detail unlock
// All rows land in the existing demo_predictions / coin_transactions tables.
// ─────────────────────────────────────────────────────────────────────────────
import { pool, tx, one, many, type Row } from "./db.js";
import { getSetting } from "./settings.js";

const PREDICTION_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "DOGEUSDT",
];

export function predictionSymbols(): string[] {
  return PREDICTION_SYMBOLS;
}

/** Deterministic PRNG (same as the Convex implementation). */
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

export function seededCandles(symbol: string, seed: number, count: number) {
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
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const open = price;
    const drift = (rnd() - 0.485) * vol * 2.2;
    const close = Math.max(base * 0.6, open + drift);
    const hi = Math.max(open, close) + rnd() * vol * 0.8;
    const lo = Math.min(open, close) - rnd() * vol * 0.8;
    candles.push({
      t: now - (count - i) * 60000,
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

/** Seed for the hourly session — stable per hour/symbol/user. */
export function predictionSeed(symbol: string, userId: string): number {
  const hourSeed = Math.floor(Date.now() / 3600000);
  const symSum = symbol.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  return ((hourSeed * 2654435761) ^ (symSum * 7919) ^ userId.length) >>> 0;
}

export interface PredictionStart {
  id: string;
  symbol: string;
  reward: number;
  candles: Row[];
  outcome: "long" | "short";
}

/** Start a new hourly prediction session. */
export async function startPrediction(
  userId: string,
  username: string | null,
  symbol: string,
): Promise<PredictionStart> {
  const sym = PREDICTION_SYMBOLS.includes(symbol) ? symbol : "BTCUSDT";
  const reward = Math.max(0, Number(await getSetting("coins.rewardPrediction", 5)) || 5);
  const seed = predictionSeed(sym, userId);
  const all = seededCandles(sym, seed, 41);
  const candles = all.slice(0, 40); // the 41st candle is the hidden outcome
  const last = all[all.length - 1];
  const outcome: "long" | "short" = last.c > last.o ? "long" : "short";
  const r = await pool.query(
    `INSERT INTO demo_predictions (user_id, symbol, outcome, reward, status, candles)
     VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING *`,
    [userId, sym, outcome, reward, JSON.stringify(candles)]
  );
  const row = r.rows[0] as Row;
  return { id: row.id, symbol: sym, reward: Number(row.reward), candles, outcome };
}

/** Resolve a prediction; reward with a streak bonus (Convex parity). */
export async function resolvePrediction(
  userId: string,
  username: string | null,
  predictionId: string,
  direction: "long" | "short",
): Promise<{ ok: boolean; won: boolean; reward: number; outcome: string }> {
  return tx(async (client) => {
    const p = (await client.query(
      "SELECT * FROM demo_predictions WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [predictionId, userId]
    )).rows[0];
    if (!p) throw new Error("پیشبینی یافت نشد");
    if (p.status !== "pending") throw new Error("این پیشبینی قبلاً ثبت شده است");
    const won = p.outcome === direction;
    await client.query("UPDATE demo_predictions SET direction = $1, status = $2 WHERE id = $3", [direction, won ? "won" : "lost", predictionId]);
    let reward = 0;
    if (won) {
      // streak bonus: +1..+4 extra coins for consecutive wins
      const history = (await client.query(
        "SELECT * FROM demo_predictions WHERE user_id = $1 AND symbol NOT LIKE 'QUIZ:%' ORDER BY created_at DESC LIMIT 20",
        [userId]
      )).rows as Row[];
      let streak = 1;
      for (const h of history) {
        if (String(h.id) === String(predictionId)) continue;
        if (h.status === "won") streak++;
        else break;
      }
      const bonus = Math.min(4, Math.max(0, streak - 1));
      reward = Number(p.reward) + bonus;
      const user = (await client.query("UPDATE users SET wolf_coins = wolf_coins + $1 WHERE id = $2 RETURNING wolf_coins", [reward, userId])).rows[0];
      await client.query(
        "INSERT INTO coin_transactions (user_id, currency, delta, balance_after, reason, ref) VALUES ($1, 'wolf', $2, $3, 'reward_prediction', $4)",
        [userId, reward, num(user.wolf_coins), `${p.symbol}:${direction}${bonus ? ` (streak ${streak})` : ""}`]
      );
    }
    return { ok: true, won, reward, outcome: p.outcome };
  });
}

// ─── quiz ────────────────────────────────────────────────────────────────────

export const QUIZ_QUESTIONS = [
  { q: "اگر RSI بالای ۷۰ باشد، چه سیگنالی است؟", qEn: "RSI above 70 signals?", options: ["Oversold (تحت فروش)", "Overbought (خرید بیش از حد)", "خنثی"], answer: 1 },
  { q: "کدام الگوی شمعی نشانه بازگشت صعودی است؟", qEn: "Which candle pattern signals bullish reversal?", options: ["Doji", "Hammer", "Shooting Star"], answer: 1 },
  { q: "حد ضرر (Stop Loss) چیست؟", qEn: "What is a Stop Loss?", options: ["قیمت ورود", "حداکثر ضرر مجاز", "قیمت فروش"], answer: 1 },
  { q: "در بازار خرسی (Bear Market) قیمتها چگونه حرکت میکنند؟", qEn: "In a bear market, prices tend to?", options: ["صعودی", "نزولی", "ثابت"], answer: 1 },
  { q: "بالاترین حجم معاملات معمولاً در کدام ساعت است؟", qEn: "Highest trading volume typically occurs at?", options: ["آسیا", "اروپا/آمریکا", "شب"], answer: 1 },
  { q: "EMA چیست؟", qEn: "What is EMA?", options: ["میانگین متحرک ساده", "میانگین متحرک نمایی", "اندیکاتور حجم"], answer: 1 },
  { q: "کدام مورد ریسک بیشتری دارد؟", qEn: "Which carries higher risk?", options: ["اسپات", "فیوچرز با اهرم", "سپرده بانکی"], answer: 1 },
  { q: "ستاپ معاملاتی قوی چند درصد احتمال موفقیت دارد؟", qEn: "A strong setup has roughly what win rate?", options: ["۱۰۰٪", "۵۰-۷۰٪", "۳۰٪"], answer: 1 },
  { q: "S/R چیست؟", qEn: "What is S/R?", options: ["Support & Resistance (حمایت و مقاومت)", "Speed & Range", "Signal & Risk"], answer: 0 },
  { q: "پوزیشن Long یعنی چه؟", qEn: "A Long position means?", options: ["فروش", "خرید/صعودی", "بستن معامله"], answer: 1 },
];

export async function startQuiz(
  userId: string,
  username: string | null,
): Promise<{ id: string; question: string; questionEn: string; options: string[]; reward: number }> {
  const idx = Math.floor(Math.random() * QUIZ_QUESTIONS.length);
  const q = QUIZ_QUESTIONS[idx];
  const reward = Math.max(0, Number(await getSetting("coins.rewardPrediction", 3)) || 3);
  const r = await pool.query(
    `INSERT INTO demo_predictions (user_id, symbol, direction, outcome, reward, status, candles)
     VALUES ($1, $2, NULL, $3, $4, 'pending', $5) RETURNING id`,
    [userId, `QUIZ:${idx}`, q.answer === 0 ? "long" : "short", reward, JSON.stringify([q.answer])]
  );
  return {
    id: String((r.rows[0] as Row).id),
    question: q.q,
    questionEn: q.qEn,
    options: q.options,
    reward,
  };
}

export async function resolveQuiz(
  userId: string,
  username: string | null,
  quizId: string,
  chosen: number,
): Promise<{ ok: boolean; won: boolean; reward: number; correct: number }> {
  return tx(async (client) => {
    const p = (await client.query(
      "SELECT * FROM demo_predictions WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [quizId, userId]
    )).rows[0];
    if (!p) throw new Error("کوییز یافت نشد");
    if (p.status !== "pending") throw new Error("این کوییز قبلاً پاسخ داده شده است");
    const correct = Number((p.candles as number[])?.[0] ?? 0);
    const won = chosen === correct;
    await client.query("UPDATE demo_predictions SET status = $1 WHERE id = $2", [won ? "won" : "lost", quizId]);
    let reward = 0;
    if (won) {
      reward = Number(p.reward);
      const user = (await client.query("UPDATE users SET wolf_coins = wolf_coins + $1 WHERE id = $2 RETURNING wolf_coins", [reward, userId])).rows[0];
      await client.query(
        "INSERT INTO coin_transactions (user_id, currency, delta, balance_after, reason, ref) VALUES ($1, 'wolf', $2, $3, 'reward_prediction', $4)",
        [userId, reward, num(user.wolf_coins), `quiz:correct:${p.symbol}`]
      );
    }
    return { ok: true, won, reward, correct };
  });
}

// ─── coin packages / signal unlock ──────────────────────────────────────────

export interface CoinPackage {
  label?: string;
  labelFa?: string;
  coins: number;
  price: number;
}

export async function coinPackages(): Promise<CoinPackage[]> {
  const raw = await getSetting<string>("coins.packages", "");
  try {
    const parsed = JSON.parse(String(raw ?? ""));
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map((p) => ({
        label: String(p.label ?? p.labelFa ?? ""),
        labelFa: String(p.labelFa ?? p.label ?? ""),
        coins: Math.max(1, Math.floor(Number(p.coins) || 0)),
        price: Math.max(0, Number(p.price) || 0),
      }));
    }
  } catch {
    /* fall through */
  }
  return [{ label: "Starter", labelFa: "شروع", coins: 1000, price: 100000 }];
}

/** Buy a preset coin package with toman balance. */
export async function buyCoinPackage(userId: string, username: string | null, index: number) {
  const packages = await coinPackages();
  const pkg = packages[index];
  if (!pkg) throw new Error("بسته پیدا نشد");
  const result = await tx(async (client) => {
    const wallet = (await client.query("SELECT id, balance FROM wallets WHERE user_id = $1 AND asset = 'IRT' ORDER BY created_at ASC LIMIT 1 FOR UPDATE", [userId])).rows[0];
    if (!wallet) throw new Error("کیف پول تومانی ندارید — ابتدا از بخش کیف پول شارژ کنید.");
    const toman = num(wallet.balance);
    if (toman < pkg.price) throw new Error(`موجودی تومان شما ${toman.toLocaleString("fa-IR")} تومان است؛ این بسته ${pkg.price.toLocaleString("fa-IR")} تومان لازم دارد.`);
    await client.query("UPDATE wallets SET balance = $1 WHERE id = $2", [toman - pkg.price, wallet.id]);
    await client.query(
      "INSERT INTO coin_transactions (user_id, currency, delta, balance_after, reason, ref) VALUES ($1, 'toman', $2, $3, 'buy_package', $4)",
      [userId, -pkg.price, toman - pkg.price, pkg.label ?? ""]
    );
    const user = (await client.query("UPDATE users SET wolf_coins = wolf_coins + $1 WHERE id = $2 RETURNING wolf_coins", [pkg.coins, userId])).rows[0];
    await client.query(
      "INSERT INTO coin_transactions (user_id, currency, delta, balance_after, reason, ref) VALUES ($1, 'wolf', $2, $3, 'buy_package', $4)",
      [userId, pkg.coins, num(user.wolf_coins), `${pkg.price} toman`]
    );
    return { coins: pkg.coins, balance: num(user.wolf_coins), label: pkg.label ?? pkg.labelFa ?? "" };
  });
  return result;
}

/** Pay wolf coins once, then always return the full signal detail. */
export async function unlockSignalDetail(userId: string, username: string | null, signalId: string) {
  const signal = (await one<Row>("SELECT * FROM signals WHERE id = $1", [signalId]));
  if (!signal) throw new Error("سیگنال پیدا نشد");
  return tx(async (client) => {
    const user = (await client.query("SELECT wolf_coins, signal_unlocks FROM users WHERE id = $1 FOR UPDATE", [userId])).rows[0];
    if (!user) throw new Error("کاربر پیدا نشد");
    const unlocks: string[] = user.signal_unlocks ?? [];
    if (!unlocks.includes(String(signalId))) {
      const cost = Math.max(0, Number(await getSetting("coins.signalDetail", 10)) || 10);
      const cur = num(user.wolf_coins);
      if (cur < cost) throw new Error("ولف کوین کافی نیست — برای باز کردن جزئیات سیگنال سکه بخرید");
      await client.query(
        "UPDATE users SET wolf_coins = $1, signal_unlocks = array_append(signal_unlocks, $2::text) WHERE id = $3",
        [cur - cost, String(signalId), userId]
      );
      await client.query(
        "INSERT INTO coin_transactions (user_id, currency, delta, balance_after, reason, ref) VALUES ($1, 'wolf', $2, $3, 'signal_detail', $4)",
        [userId, -cost, cur - cost, String(signalId)]
      );
    }
    return signal;
  });
}

function num(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}