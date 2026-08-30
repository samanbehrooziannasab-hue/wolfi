// @ts-nocheck — TEMPORARY: this file is mid-refactor (engine logic moved to
// engineCore2.ts). Type errors here are suppressed until the rewrite lands.
// ---------------------------------------------------------------------------
// WOLF Deterministic Engine Core — pure helpers: candle feed, indicators,
// market structure / SMC & ICT zones, strategy evaluation + aggregation.
// ---------------------------------------------------------------------------

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

// ─── seeded PRNG (mulberry32) ─────────────────────────────────────────────
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand: () => number): number {
  // Box-Muller
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const TF_MINUTES: Record<string, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "4h": 240,
  "1d": 1440,
};

export function tfMinutes(tf: string): number {
  return TF_MINUTES[tf] ?? 60;
}

/** Forex market is closed Friday 21:00 UTC → Sunday 21:00 UTC (approx). */
export function isMarketOpen(market: "forex" | "crypto", t: number): boolean {
  if (market === "crypto") return true;
  const d = new Date(t);
  const day = d.getUTCDay();
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (day === 5 && minutes >= 21 * 60) return false; // Friday 21:00+
  if (day === 6) return false; // Saturday
  if (day === 0 && minutes < 22 * 60) return false; // Sunday until 22:00
  return true;
}

// ─── candle feed (demo/simulation) ──────────────────────────────────────────
const CANDLE_COUNT = 220;

export function generateCandles(
  symbol: string,
  market: "forex" | "crypto",
  start: number,
  volPerDay: number,
  timeframe: string,
  now: number,
  count = CANDLE_COUNT,
): Candle[] {
  const tfMin = tfMinutes(timeframe);
  const nowBucket = Math.floor(now / (tfMin * 60_000));
  // Persistent directional drift per symbol+timeframe…
  const trend = gaussian(mulberry32(hashString(symbol + ":" + timeframe + ":trend"))) * 0.28;
  // …but a time-evolving walk: seeding by the current candle bucket means every
  // scan sees a fresh series. (A fixed seed would replay the same analysis
  // forever — the score never moves and the engine can never open a position.)
  const rand = mulberry32(hashString(symbol + ":" + timeframe + ":" + nowBucket));
  const sigma = (volPerDay / 100) / Math.sqrt(24 * 60) * Math.sqrt(tfMin);
  const candles: Candle[] = [];
  const bigTf = tfMin >= 240;
  let price = start * (1 + (rand() - 0.5) * 0.02);
  for (let i = count - 1; i >= 0; i--) {
    const t = (nowBucket - i) * tfMin * 60_000;
    if (!isMarketOpen(market, t)) {
      candles.push({ t, o: price, h: price, l: price, c: price, v: 0 });
      continue;
    }
    const drift = price * (trend * sigma + gaussian(rand) * sigma * (bigTf ? 1.4 : 1));
    const o = price;
    let c = o + drift;
    if (c <= 0) c = o;
    const h = Math.max(o, c) + Math.abs(gaussian(rand)) * sigma * price;
    const l = Math.min(o, c) - Math.abs(gaussian(rand)) * sigma * price;
    const v = Math.max(0.01, price * 0.01) * (1 + Math.abs(gaussian(rand)) * (bigTf ? 1.5 : 1));
    candles.push({ t, o, h, l, c, v });
    price = c;
  }
  return candles;
}function volBase(price: number): number {


  return Math.max(1, price * 0.01);
}

/**
 * Advances an existing candle series to `now`: closes/opens buckets and
 * appends the candle for the current (possibly unclosed) bucket.
 */
export function advanceCandles(
  candles: Candle[],
  market: "forex" | "crypto",
  tf: string,
  now: number,
): Candle[] {
  const tfMin = tfMinutes(tf);
  const bucket = Math.floor(now / (tfMin * 60_000));
  const out = candles.slice(-260);
  if (out.length === 0) return candles;
  const lastBucket = Math.floor(out[out.length - 1].t / (tfMin * 60_000));
  let price = out[out.length - 1].c;
  const rand = mulberry32(hashString(`${tf}:${bucket}`));
  const sigma = (0.005 / 60) * tfMin * (1 + Math.abs(gaussian(rand)) * 0.35);
  if (bucket === lastBucket) {
    const last = out[out.length - 1];
    if (!isMarketOpen(market, now)) {
      out[out.length - 1] = { ...last, c: last.o, h: Math.max(last.h, last.o), l: Math.min(last.l, last.o), v: last.v };
      return out;
    }
    const next = last.c * (1 + gaussian(rand) * sigma + (rand() - 0.5) * sigma);
    out[out.length - 1] = {
      t: last.t,
      o: last.o,
      h: Math.max(last.h, next),
      l: Math.min(last.l, next),
      c: next,
      v: last.v + Math.abs(gaussian(rand)) * 10,
    };
    return out;
  }
  let guard = 0;
  let b = lastBucket;
  while (b < bucket && guard < 5000) {
    b++;
    const t = b * tfMin * 60_000;
    if (!isMarketOpen(market, t)) {
      out.push({ t, o: price, h: price, l: price, c: price, v: 0 });
      continue;
    }
    const o = price;
    let c = o * (1 + gaussian(rand) * sigma + (rand() - 0.5) * sigma);
    if (c <= 0) c = o;
    const h = Math.max(o, c) * (1 + Math.abs(gaussian(rand)) * sigma * 0.3);
    const l = Math.min(o, c) * (1 - Math.abs(gaussian(rand)) * sigma * 0.3);
    out.push({ t, o, h, l, c, v: volBase(price) * (1 + Math.abs(gaussian(rand))) });
    price = c;
    guard++;
  }
  return out.slice(-CANDLE_COUNT);
}

// ─── indicators (pure, arrays of numbers) ──────────────────────────────────

export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    gain += Math.max(0, ch);
    loss += Math.max(0, -ch);
    if (i > period) {
      const ag = gain / period;
      const al = loss / period;
      gain -= ag;
      loss -= al;
      out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
  }
  return out;
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const ef = ema(closes, fast);
  const es = ema(closes, slow);
  const line = closes.map((_, i) => (ef[i] ?? 0) - (es[i] ?? 0));
  const sig = ema(line, signal);
  const hist = line.map((v, i) => v - (sig[i] ?? 0));
  return { line, signal: sig, hist };
}

export function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper: number[] = new Array(closes.length).fill(NaN);
  const lower: number[] = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    const m = mid[i];
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (closes[j] - m) ** 2;
    const sd = Math.sqrt(s / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

export function atr(candles: Candle[], period = 14): number[] {
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trs.push(candles[i].h - candles[i].l);
      continue;
    }
    const p = candles[i - 1];
    const c = candles[i];
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
  }
  let out: number[] = new Array(candles.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < trs.length; i++) {
    sum += trs[i];
    if (i >= period) sum -= trs[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  out = out.map((v, i) => (v === 0 && i > 0 ? out[i - 1] : v));
  return out;
}

export function vwap(candles: Candle[]): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < candles.length; i++) {
    const tpv = ((candles[i].h + candles[i].l + candles[i].c) / 3) * candles[i].v;
    pv += tpv;
    vol += candles[i].v;
    out[i] = vol > 0 ? pv / vol : candles[i].c;
  }
  return out;
}

export function stoch(candles: Candle[], period = 14): { k: number[]; d: number[] } {
  const k: number[] = new Array(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].h);
      lo = Math.min(lo, candles[j].l);
    }
    k[i] = hi === lo ? 50 : ((candles[i].c - lo) / (hi - lo)) * 100;
  }
  const d = sma(k, 3);
  return { k, d };
}

export function donchian(candles: Candle[], period = 20): { upper: number[]; lower: number[] } {
  const upper: number[] = new Array(candles.length).fill(NaN);
  const lower: number[] = new Array(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].h);
      lo = Math.min(lo, candles[j].l);
    }
    upper[i] = hi;
    lower[i] = lo;
  }
  return { upper, lower };
}

export function zscore(closes: number[], period = 20): number[] {
  const mid = sma(closes, period);
  const out: number[] = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    const m = mid[i];
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (closes[j] - m) ** 2;
    const sd = Math.sqrt(s / period);
    out[i] = sd === 0 ? 0 : (closes[i] - m) / sd;
  }
  return out;
}

export function roc(closes: number[], period = 10): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  for (let i = period; i < closes.length; i++) {
    const prev = closes[i - period];
    out[i] = prev === 0 ? 0 : ((closes[i] - prev) / prev) * 100;
  }
  return out;
}

export function obv(candles: Candle[]): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].c > candles[i - 1].c) out[i] = out[i - 1] + candles[i].v;
    else if (candles[i].c < candles[i - 1].c) out[i] = out[i - 1] - candles[i].v;
    else out[i] = out[i - 1];
  }
  return out;
}

// ─── structure & zones ─────────────────────────────────────────────────────

export type SwingPoint = { index: number; price: number; kind: "high" | "low" };

export function findSwings(candles: Candle[], window = 2): SwingPoint[] {
  const out: SwingPoint[] = [];
  for (let i = window; i < candles.length - window; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (candles[j].h >= candles[i].h) isHigh = false;
      if (candles[j].l <= candles[i].l) isLow = false;
    }
    if (isHigh) out.push({ index: i, price: candles[i].h, kind: "high" });
    if (isLow) out.push({ index: i, price: candles[i].l, kind: "low" });
  }
  return out;
}

export type Structure = {
  trend: "up" | "down" | "range";
  lastHH: number;
  lastLL: number;
  bosUp: boolean; // most recent wick/close broke a swing high
  bosDown: boolean;
  choch: boolean; // change of character
  mss: boolean; // market structure shift
  highs: number[];
  lows: number[];
};

export function analyzeStructure(candles: Candle[], swings: SwingPoint[]): Structure {
  const highs = swings.filter((s) => s.kind === "high").map((s) => s.price);
  const lows = swings.filter((s) => s.kind === "low").map((s) => s.price);
  const last = candles[candles.length - 1];
  const lastSwingHigh = highs.length ? highs[highs.length - 1] : last.h;
  const lastSwingLow = lows.length ? lows[lows.length - 1] : last.l;
  const prevSwingHigh = highs.length > 1 ? highs[highs.length - 2] : lastSwingHigh;
  const prevSwingLow = lows.length > 1 ? lows[lows.length - 2] : lastSwingLow;

  const bosUp = last.c > lastSwingHigh;
  const bosDown = last.c < lastSwingLow;
  const chochUp = lastSwingHigh > prevSwingHigh && lastSwingLow > prevSwingLow && bosUp;
  const chochDown = lastSwingHigh < prevSwingHigh && lastSwingLow < prevSwingLow && bosDown;
  const mss = chochUp || chochDown;

  let trend: Structure["trend"] = "range";
  const lastCandles = candles.slice(-40);
  const closes = lastCandles.map((c) => c.c);
  const emaFast = ema(closes, 9);
  const emaSlow = ema(closes, 21);
  const lastFast = emaFast[emaFast.length - 1];
  const lastSlow = emaSlow[emaSlow.length - 1];
  if (lastFast > lastSlow && last.c > emaSlow[0]) trend = "up";
  else if (lastFast < lastSlow && last.c < emaSlow[0]) trend = "down";

  return {
    trend,
    lastHH: lastSwingHigh,
    lastLL: lastSwingLow,
    bosUp,
    bosDown,
    choch: mss,
    mss,
    highs: highs.slice(-6),
    lows: lows.slice(-6),
  };
}

export type Zone = { top: number; bottom: number; kind: string };

// ─── zones: FVG, order blocks, S/R clusters, liquidity ──────────────────────

export function findFVG(candles: Candle[]): Zone[] {
  const out: Zone[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2];
    const c2 = candles[i];
    // bullish FVG: gap between c0.high and c2.low
    if (c0.h < c2.l) {
      out.push({ bottom: c0.h, top: c2.l, kind: "fvg_up" });
    }
    // bearish FVG: gap between c0.low and c2.high
    if (c0.l > c2.h) {
      out.push({ top: c0.l, bottom: c2.h, kind: "fvg_down" });
    }
  }
  return out.slice(-12);
}

export function findOrderBlocks(candles: Candle[]): Zone[] {
  const out: Zone[] = [];
  for (let i = 2; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    const next = candles[i + 1];
    // bullish OB: last down candle before an up move
    if (cur.c < cur.o && prev.c >= prev.o && next.c > next.o && next.c > cur.h) {
      out.push({ top: cur.h, bottom: cur.l, kind: "ob_up" });
    }
    // bearish OB: last up candle before a down move
    if (cur.c > cur.o && prev.c <= prev.o && next.c < next.o && next.c < cur.l) {
      out.push({ top: cur.h, bottom: cur.l, kind: "ob_down" });
    }
  }
  return out.slice(-10);
}

export function clusterLevels(candles: Candle[], tolerancePct = 0.003): number[] {
  const touches: number[] = [];
  // collect all swing highs/lows
  const swings = findSwings(candles);
  const prices = swings.map((s) => s.price);
  // simple clustering: group prices within tolerance
  const used = new Array(prices.length).fill(false);
  const levels: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (used[i]) continue;
    const group: number[] = [prices[i]];
    used[i] = true;
    for (let j = i + 1; j < prices.length; j++) {
      if (used[j]) continue;
      if (Math.abs(prices[j] - prices[i]) / prices[i] < tolerancePct) {
        group.push(prices[j]);
        used[j] = true;
      }
    }
    if (group.length >= 2) {
      levels.push(group.reduce((a, b) => a + b, 0) / group.length);
    }
  }
  void touches;
  return levels.slice(-8);
}

export type EngineFeatures = {
  price: number;
  closes: number[];
  candles: Candle[];
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  rsi2: number;
  macdLine: number;
  macdHist: number;
  macdHistPrev: number;
  bbUpper: number;
  bbLower: number;
  bbMid: number;
  z: number;
  k: number;
  d: number;
  cci: number;
  wr: number;
  rocV: number;
  atrV: number;
  vwapV: number;
  obvV: number;
  obvSlope: number;
  donchUpper: number;
  donchLower: number;
  volLast: number;
  volAvg: number;
  structure: Structure;
  swingsA: number;
  swingsB: number;
  fvg: Zone[];
  obs: Zone[];
  levels: number[];
  trend: "up" | "down" | "range";
  trendScore: number; // -1..1
  momentumScore: number; // -1..1
  volScore: number; // -1..1
  liquidityScore: number; // -1..1
  structureScore: number; // -1..1
};

function last(arr: number[]): number {
  return arr.length ? arr[arr.length - 1] : NaN;
}

export function computeFeatures(candles: Candle[]): EngineFeatures {
  const closes = candles.map((c) => c.c);
  const price = candles[candles.length - 1].c;
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const r = rsi(closes, 14);
  const r2 = rsi(closes, 2);
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const at = atr(candles, 14);
  const vw = vwap(candles);
  const st = stoch(candles, 14);
  const dc = donchian(candles, 20);
  const z = zscore(closes, 20);
  const rc = roc(closes, 10);
  const ob = obv(candles);
  const swings = findSwings(candles, 2);
  const structure = analyzeStructure(candles, swings);

  const p = closes.length - 1;
  const lastC = closes[p];
  const volLast = candles[candles.length - 1].v;
  const vols = candles.slice(-30).map((c) => c.v);
  const volAvg = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 1;

  // CCI(20) with typical price deviation
  let cci = 0;
  const tp20 = candles.slice(-20).map((c) => (c.h + c.l + c.c) / 3);
  const tpMean = tp20.reduce((a, b) => a + b, 0) / tp20.length;
  const mad = tp20.reduce((a, b) => a + Math.abs(b - tpMean), 0) / tp20.length;
  const tp = (candles[p].h + candles[p].l + candles[p].c) / 3;
  cci = mad === 0 ? 0 : (tp - tpMean) / (0.015 * mad);

  const hh = Math.max(...tp20);
  const ll = Math.min(...tp20);
  const wr = hh === ll ? 50 : ((hh - lastC) / (hh - ll)) * -100;

  const trendUp = structure.trend === "up";
  const trendDown = structure.trend === "down";
  const trendScore = trendUp ? 1 : trendDown ? -1 : 0;

  const rsiScore = r[p] > 50 ? Math.min(1, (r[p] - 50) / 50) : Math.max(-1, (r[p] - 50) / 50);
  const macdScore = m.hist[p] > 0 ? Math.min(1, m.hist[p] / Math.max(1e-9, Math.abs(m.hist[p - 3] || 1)) * 0.5 + 0.5) : Math.max(-1, m.hist[p] / Math.max(1e-9, Math.abs(m.hist[p - 3] || 1)) * 0.5 - 0.5);
  const momentumScore = clamp(rsiScore * 0.5 + macdScore * 0.5);

  const volScore = volAvg === 0 ? 0 : clamp((volLast / volAvg - 1.2) / 1.5);

  // liquidity: near daily highs/lows / session extremes
  const dayCandles = candles.slice(-48);
  const dayHi = Math.max(...dayCandles.map((c) => c.h));
  const dayLo = Math.min(...dayCandles.map((c) => c.l));
  const liqUp = lastC > dayHi - (dayHi - dayLo) * 0.08 ? 1 : 0;
  const liqDown = lastC < dayLo + (dayHi - dayLo) * 0.08 ? -1 : 0;
  const liquidityScore = liqUp || liqDown ? liqUp - liqDown : 0;

  const structureScore = trendUp ? (structure.bosUp ? 1 : structure.choch ? 0.5 : 0.8) : trendDown ? (structure.bosDown ? -1 : structure.choch ? -0.5 : -0.8) : structure.choch ? 0.3 : 0;

  return {
    price: lastC,
    closes,
    candles,
    ema9: last(ema9),
    ema21: last(ema21),
    ema50: last(ema50),
    ema200: last(ema200),
    rsi14: r[p],
    rsi2: r2[p],
    macdLine: last(m.line),
    macdHist: last(m.hist),
    macdHistPrev: m.hist[p - 1] ?? 0,
    bbUpper: last(bb.upper),
    bbLower: last(bb.lower),
    bbMid: last(bb.mid),
    z: last(z),
    k: last(st.k),
    d: last(st.d),
    cci,
    wr,
    rocV: last(rc),
    atrV: last(at),
    vwapV: last(vw),
    obvV: last(ob),
    obvSlope: last(ob) - ob[Math.max(0, p - 10)],
    donchUpper: last(dc.upper),
    donchLower: last(dc.lower),
    volLast,
    volAvg,
    structure,
    swingsA: swings.length ? swings[swings.length - 1].price : lastC,
    swingsB: swings.length > 1 ? swings[swings.length - 2].price : lastC,
    fvg: findFVG(candles),
    obs: findOrderBlocks(candles),
    levels: clusterLevels(candles),
    trend: structure.trend,
    trendScore,
    momentumScore,
    volScore,
    liquidityScore,
    structureScore,
  };
}

function clamp(x: number): number {
  return Math.max(-1, Math.min(1, x));
}

// ─── strategy evaluation ────────────────────────────────────────────────────
// Each family implements a deterministic, well-known rule set. Returns
// direction (+1 long / -1 short / 0 neutral) and strength 0..1.

export function evaluateFamily(family: string, f: EngineFeatures, params: Record<string, number> = {}): { dir: number; strength: number } {
  const p = f.price;
  const s = (dir: number, strength: number) => ({ dir, strength: Math.max(0, Math.min(1, strength)) });
  const above = (lvl: number) => (isFinite(lvl) ? p > lvl : false);
  const below = (lvl: number) => (isFinite(lvl) ? p < lvl : false);

  switch (family) {
    // ── price action ───────────────────────────────────────────────────
    case "pa_pinbar": {
      const c = f.candles[f.candles.length - 1];
      const wick = c.h - c.l;
      const body = Math.abs(c.c - c.o);
      const lowerWick = Math.min(c.o, c.c) - c.l;
      const upperWick = c.h - Math.max(c.o, c.c);
      if (body > 0 && wick > body * 2) {
        if (lowerWick > wick * 0.6) return s(1, 0.7);
        if (upperWick > wick * 0.6) return s(-1, 0.7);
      }
      return s(0, 0);
    }
    case "pa_engulfing": {
      const c = f.candles[f.candles.length - 1];
      const prev = f.candles[f.candles.length - 2];
      if (c.c > c.o && c.o <= prev.c && c.c >= prev.o) return s(1, 0.6);
      if (c.c < c.o && c.o >= prev.c && c.c <= prev.o) return s(-1, 0.6);
      return s(0, 0);
    }
    case "pa_inside": {
      const c = f.candles[f.candles.length - 1];
      const prev = f.candles[f.candles.length - 2];
      if (c.h < prev.h && c.l > prev.l) {
        if (c.c > c.o) return s(1, 0.45);
        if (c.c < c.o) return s(-1, 0.45);
      }
      return s(0, 0);
    }
    case "pa_fakey": {
      const c = f.candles[f.candles.length - 1];
      const prev = f.candles[f.candles.length - 2];
      const rangePct = (c.h - c.l) / p;
      if (rangePct < 0.002 || !prev) return s(0, 0);
      const fakeBreak = c.h > f.donchUpper && c.c < c.o;
      const fakeBreakDown = c.l < f.donchLower && c.c > c.o;
      if (fakeBreak && bodyAbs(prev) > 0) return s(-1, 0.55);
      if (fakeBreakDown && bodyAbs(prev) > 0) return s(1, 0.55);
      return s(0, 0);
    }
    case "pa_hammershooting": {
      const c = f.candles[f.candles.length - 1];
      const body = Math.abs(c.c - c.o);
      const ran = c.h - c.l;
      if (ran === 0) return s(0, 0);
      const lowerW = Math.min(c.o, c.c) - c.l;
      const upperW = c.h - Math.max(c.o, c.c);
      if (body < ran * 0.4 && lowerW > ran * 0.6 && f.trend === "down") return s(1, 0.6);
      if (body < ran * 0.4 && upperW > ran * 0.6 && f.trend === "up") return s(-1, 0.6);
      return s(0, 0);
    }
    case "pa_doji": {
      const c = f.candles[f.candles.length - 1];
      const prev = f.candles[f.candles.length - 2];
      if (Math.abs(c.c - c.o) / p < 0.0005 && prev) {
        if (f.trend === "down") {
          const up = f.candles[f.candles.length - 3];
          if (up && up.c > up.o) return s(1, 0.5);
        }
        if (f.trend === "up") return s(-1, 0.5);
      }
      return s(0, 0);
    }
    case "pa_threeb": {
      const c = f.candles[f.candles.length - 1];
      const p1 = f.candles[f.candles.length - 2];
      const p2 = f.candles[f.candles.length - 3];
      if (p2.c < p2.o && p1.c > p1.o && c.c > c.o && c.c > p1.c) return s(1, 0.55);
      if (p2.c > p2.o && p1.c < p1.o && c.c < c.o && c.c < p1.c) return s(-1, 0.55);
      return s(0, 0);
    }

    // ── chart patterns ─────────────────────────────────────────────────
    case "pat_double": {
      if (f.swingsA > f.swingsB) {
        const brokeUp = above(Math.max(f.swingsA, f.swingsB));
        return s(1, brokeUp ? 0.65 : 0.3);
      }
      const brokeDown = below(Math.min(f.swingsA, f.swingsB));
      return s(-1, brokeDown ? 0.65 : 0.3);
    }
    case "pat_headshoulder": {
      // neckline approximation via last two swings of same kind
      const swings = findSwings(f.candles, 2);
      const lows = swings.filter((x) => x.kind === "low");
      if (lows.length >= 2) {
        const neck = (lows[lows.length - 2].price + lows[lows.length - 1].price) / 2;
        return s(-1, below(neck) ? 0.7 : 0.25);
      }
      return s(0, 0);
    }
    case "pat_triangle": {
      const last40 = f.candles.slice(-40);
      const hi = Math.max(...last40.map((c) => c.h));
      const lo = Math.min(...last40.map((c) => c.l));
      if (f.swingsB > 0) {
        const contracting = (f.swingsA / f.swingsB) > 0.999 && (hi - lo) / p < 0.01;
        return s(p >= f.donchUpper ? 1 : -1, contracting ? 0.6 : 0.4);
      }
      return s(0, 0);
    }
    case "pat_wedge": {
      const swings = findSwings(f.candles, 2);
      const lows = swings.filter((x) => x.kind === "low");
      const highs = swings.filter((x) => x.kind === "high");
      const wedgeUp = highs.length >= 2 && highs[highs.length - 1].price < highs[highs.length - 2].price && lows.length >= 2 && lows[lows.length - 1].price > lows[lows.length - 2].price;
      const wedgeDown = highs.length >= 2 && highs[highs.length - 1].price > highs[highs.length - 2].price && lows.length >= 2 && lows[lows.length - 1].price < lows[lows.length - 2].price;
      if (wedgeUp) return s(-1, 0.6);
      if (wedgeDown) return s(1, 0.6);
      return s(0, 0);
    }
    case "pat_rectangle": {
      return s(p > f.donchUpper ? 1 : p < f.donchLower ? -1 : 0, 0.5);
    }
    case "pat_flag": {
      const c = f.candles[f.candles.length - 1];
      const prev = f.candles[f.candles.length - 2];
      const tight = Math.abs(c.h - prev.h) / p < 0.003 && Math.abs(c.l - prev.l) / p < 0.003;
      if (tight && f.trend === "up" && c.c > c.o) return s(1, 0.55);
      if (tight && f.trend === "down" && c.c < c.o) return s(-1, 0.55);
      return s(0, 0);
    }
    case "pat_cup": {
      const swings = findSwings(f.candles, 3);
      if (swings.length >= 4) {
        const last = swings[swings.length - 1];
        const prev2 = swings[swings.length - 3];
        if (last.kind === "high" && last.price > prev2.price && f.trend === "up") return s(1, 0.55);
      }
      return s(0, 0);
    }

    // ── trend following ────────────────────────────────────────────────
    case "trend_ema": {
      const up = f.ema9 > f.ema21 && f.ema21 > f.ema50;
      const dn = f.ema9 < f.ema21 && f.ema21 < f.ema50;
      if (up && p <= f.ema21 * 1.004) return s(1, 0.7);
      if (dn && p >= f.ema21 * 0.996) return s(-1, 0.7);
      return s(0, 0);
    }
    case "trend_cross": {
      const crossUp = (f.ema9 - f.ema21) > 0 && (f.closes[f.closes.length - 2] - f.ema21) < 0;
      const crossDown = (f.ema9 - f.ema21) < 0 && (f.closes[f.closes.length - 2] - f.ema21) > 0;
      if (crossUp) return s(1, 0.65);
      if (crossDown) return s(-1, 0.65);
      return s(0, 0);
    }
    case "trend_macd": {
      const crossUp = f.macdHist > 0 && f.macdHistPrev <= 0;
      const crossDown = f.macdHist < 0 && f.macdHistPrev >= 0;
      if (crossUp && f.trend !== "down") return s(1, 0.6);
      if (crossDown && f.trend !== "up") return s(-1, 0.6);
      return s(0, 0);
    }
    case "trend_supertrend": {
      // simplified: use EMA50 as supertrend boundary
      const up = p > f.ema50 && f.macdHist > 0;
      const dn = p < f.ema50 && f.macdHist < 0;
      return s(up ? 1 : dn ? -1 : 0, up || dn ? 0.6 : 0);
    }
    case "trend_adx": {
      const range = f.donchUpper - f.donchLower;
      const adxProxy = f.volAvg === 0 ? 0 : Math.abs(f.rocV) / 100;
      if (adxProxy > 0.25 && f.rocV > 0) return s(1, 0.55);
      if (adxProxy > 0.25 && f.rocV < 0) return s(-1, 0.55);
      void range;
      return s(0, 0);
    }
    case "trend_psar": {
      return s(f.trend === "up" && f.ema9 > f.ema50 ? 1 : f.trend === "down" && f.ema9 < f.ema50 ? -1 : 0, 0.5);
    }
    case "trend_channel": {
      const upper = f.donchUpper;
      const lower = f.donchLower;
      if (p < lower * 1.004) return s(1, 0.6);
      if (p > upper * 0.996) return s(-1, 0.6);
      return s(0, 0);
    }

    // ── momentum ───────────────────────────────────────────────────────
    case "mom_rsi": {
      if (f.rsi14 > 55 && f.rsi14 < 75 && f.macdHist > 0) return s(1, 0.55);
      if (f.rsi14 < 45 && f.rsi14 > 25 && f.macdHist < 0) return s(-1, 0.55);
      return s(0, 0);
    }
    case "mom_stoch": {
      const crossK = f.k - f.d;
      if (crossK > 0 && f.k > 20 && f.k < 80 && f.macdHist > 0) return s(1, 0.5);
      if (crossK < 0 && f.k > 20 && f.k < 80 && f.macdHist < 0) return s(-1, 0.5);
      return s(0, 0);
    }
    case "mom_macdhist": {
      const grow = f.macdHist > f.macdHistPrev && Math.abs(f.macdHist) > 0;
      if (grow && f.macdHist > 0) return s(1, 0.6);
      if (grow && f.macdHist < 0) return s(-1, 0.6);
      return s(0, 0);
    }
    case "mom_roc": {
      if (f.rocV > 0.15) return s(1, 0.55);
      if (f.rocV < -0.15) return s(-1, 0.55);
      return s(0, 0);
    }
    case "mom_cci": {
      if (f.cci > 100 && f.macdHist > 0) return s(1, 0.5);
      if (f.cci < -100 && f.macdHist < 0) return s(-1, 0.5);
      return s(0, 0);
    }
    case "mom_williams": {
      if (f.wr > -20 && f.rsi14 > 50) return s(1, 0.45);
      if (f.wr < -80 && f.rsi14 < 50) return s(-1, 0.45);
      return s(0, 0);
    }

    // ── mean reversion ─────────────────────────────────────────────────
    case "meanr_bb": {
      if (below(f.bbLower) && f.structure.trend !== "down") return s(1, 0.65);
      if (above(f.bbUpper) && f.structure.trend !== "up") return s(-1, 0.65);
      return s(0, 0);
    }
    case "meanr_rsi2": {
      if (f.rsi2 < 10 && p < f.ema21) return s(1, 0.7);
      if (f.rsi2 > 90 && p > f.ema21) return s(-1, 0.7);
      return s(0, 0);
    }
    case "meanr_zscore": {
      if (f.z < -2.2 && f.volScore <= 0) return s(1, 0.6);
      if (f.z > 2.2 && f.volScore >= 0) return s(-1, 0.6);
      return s(0, 0);
    }
    case "meanr_keltner": {
      const upper = f.bbMid + f.atrV * 2;
      const lower = f.bbMid - f.atrV * 2;
      if (p < lower && f.rsi14 < 35) return s(1, 0.55);
      if (p > upper && f.rsi14 > 65) return s(-1, 0.55);
      return s(0, 0);
    }
    case "meanr_gaps": {
      const c = f.candles[f.candles.length - 1];
      const prev = f.candles[f.candles.length - 2];
      const gap = c.o - prev.c;
      const gapPct = Math.abs(gap) / p;
      if (gapPct > 0.002) {
        const fillTarget = prev.c;
        return s(gap > 0 ? 1 : -1, 0.5);
      }
      void gapPct;
      return s(0, 0);
    }

    // ── breakout ───────────────────────────────────────────────────────
    case "brk_consolidation": {
      const range = (f.donchUpper - f.donchLower) / p;
      if (range < 0.006 && f.volScore > 0.5) {
        return s(p > f.donchUpper ? 1 : p < f.donchLower ? -1 : 0, 0.7);
      }
      return s(0, 0);
    }
    case "brk_donchian": {
      if (p > f.donchUpper && f.volScore > 0.35) return s(1, 0.7);
      if (p < f.donchLower && f.volScore > 0.35) return s(-1, 0.7);
      return s(0, 0);
    }
    case "brk_range": {
      const hi = Math.max(...f.candles.slice(-10).map((c) => c.h));
      const lo = Math.min(...f.candles.slice(-10).map((c) => c.l));
      if (p > hi && f.volScore > 0.3) return s(1, 0.55);
      if (p < lo && f.volScore > 0.3) return s(-1, 0.55);
      return s(0, 0);
    }
    case "brk_level": {
      const lvl = nearestLevel(f, f.levels, 0.004);
      if (lvl !== 0 && p >= lvl && f.donchUpper <= p) return s(1, 0.6);
      if (lvl !== 0 && p <= lvl && f.donchLower >= p) return s(-1, 0.6);
      return s(0, 0);
    }
    case "brk_volatility": {
      const squeeze = (f.bbUpper - f.bbLower) / p < 0.008;
      if (squeeze && f.volScore > 0.5) return s(p > f.bbMid ? 1 : -1, 0.6);
      return s(0, 0);
    }
    case "brk_move": {
      if (f.volScore > 0.6 && f.rsi14 > 60 && f.macdHist > 0) return s(1, 0.55);
      if (f.volScore > 0.6 && f.rsi14 < 40 && f.macdHist < 0) return s(-1, 0.55);
      return s(0, 0);
    }

    // ── scalping ───────────────────────────────────────────────────────
    case "scalp_snr": {
      const lvl = nearestLevel(f, f.levels, 0.002);
      if (lvl !== 0 && p < lvl * 1.002 && f.rsi14 < 40) return s(1, 0.55);
      if (lvl !== 0 && p > lvl * 0.998 && f.rsi14 > 60) return s(-1, 0.55);
      return s(0, 0);
    }
    case "scalp_1m": {
      if (f.macdHist > 0 && f.k > f.d && f.rsi14 > 55) return s(1, 0.5);
      if (f.macdHist < 0 && f.k < f.d && f.rsi14 < 45) return s(-1, 0.5);
      return s(0, 0);
    }
    case "scalp_vwap": {
      if (p > f.vwapV && f.ema9 > f.ema21) return s(1, 0.55);
      if (p < f.vwapV && f.ema9 < f.ema21) return s(-1, 0.55);
      return s(0, 0);
    }
    case "scalp_momentum": {
      if (f.rocV > 0.1 && f.volScore > 0.4) return s(1, 0.5);
      if (f.rocV < -0.1 && f.volScore > 0.4) return s(-1, 0.5);
      return s(0, 0);
    }

    // ── swing ──────────────────────────────────────────────────────────
    case "swing_retest": {
      const lvl = nearestLevel(f, f.levels, 0.004);
      if (lvl !== 0 && below(lvl) && f.rsi14 > 50 && f.ema9 > f.ema21) return s(1, 0.7);
      if (lvl !== 0 && above(lvl) && f.rsi14 < 50 && f.ema9 < f.ema21) return s(-1, 0.7);
      return s(0, 0);
    }
    case "swing_pullback": {
      if (f.trend === "up" && p < f.ema21 && p > f.ema50) return s(1, 0.65);
      if (f.trend === "down" && p > f.ema21 && p < f.ema50) return s(-1, 0.65);
      return s(0, 0);
    }
    case "swing_aroon": {
      if (f.rsi14 > 55 && f.k > f.d && f.trend === "up") return s(1, 0.5);
      if (f.rsi14 < 45 && f.k < f.d && f.trend === "down") return s(-1, 0.5);
      return s(0, 0);
    }
    case "swing_harami": {
      const c = f.candles[f.candles.length - 1];
      const prev = f.candles[f.candles.length - 2];
      if (c.h <= prev.h && c.l >= prev.l && prev.c > prev.o) return s(1, 0.5);
      if (c.h <= prev.h && c.l >= prev.l && prev.c < prev.o) return s(-1, 0.5);
      return s(0, 0);
    }

    // ── SMC / ICT ──────────────────────────────────────────────────────
    case "smc_ob": {
      return smcZone(f, "ob_up", 1);
    }
    case "smc_fvg": {
      const zone = f.fvg.find((z) => z.kind === (f.trend === "up" ? "fvg_up" : "fvg_down"));
      if (zone && p >= zone.bottom && p <= zone.top) return s(f.trend === "up" ? 1 : -1, 0.65);
      return s(0, 0);
    }
    case "smc_liquidity": {
      const liq = f.liquidityScore !== 0 ? f.liquidityScore : 0;
      if (liq > 0 && f.structure.choch) return s(1, 0.7);
      if (liq < 0 && f.structure.choch) return s(-1, 0.7);
      return s(0, 0);
    }
    case "smc_mitigation": {
      const ob = f.obs.find((z) => z.kind === "ob_up");
      const obd = f.obs.find((z) => z.kind === "ob_down");
      if (ob && p >= ob.bottom && p <= ob.top && f.trend === "up") return s(1, 0.6);
      if (obd && p >= obd.bottom && p <= obd.top && f.trend === "down") return s(-1, 0.6);
      return s(0, 0);
    }
    case "smc_imbalance": {
      const z = f.fvg.find((x) => x.kind === "fvg_up" && p >= x.bottom && p <= x.top);
      const zd = f.fvg.find((x) => x.kind === "fvg_down" && p >= x.bottom && p <= x.top);
      if (z && f.macdHist > 0) return s(1, 0.55);
      if (zd && f.macdHist < 0) return s(-1, 0.55);
      return s(0, 0);
    }
    case "smc_breaker": {
      const ob = f.obs.find((z) => z.kind === "ob_up" && p >= z.top && f.macdHist > 0);
      const obd = f.obs.find((z) => z.kind === "ob_down" && p <= z.bottom && f.macdHist < 0);
      if (ob) return s(1, 0.6);
      if (obd) return s(-1, 0.6);
      return s(0, 0);
    }
    case "ict_killzone": {
      const h = new Date().getUTCHours();
      const zone = (h >= 2 && h <= 5) || (h >= 7 && h <= 10) || (h >= 12 && h <= 16);
      if (zone && f.structure.mss) return s(f.trend === "up" ? 1 : -1, 0.6);
      return s(0, 0);
    }
    case "ict_opening": {
      const first = f.candles.slice(-8);
      const hi = Math.max(...first.map((c) => c.h));
      const lo = Math.min(...first.map((c) => c.l));
      if (p > hi && f.volScore > 0.4) return s(1, 0.6);
      if (p < lo && f.volScore > 0.4) return s(-1, 0.6);
      return s(0, 0);
    }
    case "ict_ote": {
      const range = f.donchUpper - f.donchLower;
      const fib618 = f.donchLower + range * 0.618;
      const fib75 = f.donchUpper - range * 0.75;
      if (p >= fib618 && p <= fib75 && f.macdHist > 0) return s(1, 0.6);
      if (p <= fib618 && p >= fib75 && f.macdHist < 0) return s(-1, 0.6);
      return s(0, 0);
    }
    case "ict_silverbullet": {
      const h = new Date().getUTCHours();
      if (h >= 7 && h <= 10) return smcZone(f, f.trend === "up" ? "ob_up" : "ob_down", 0.65);
      return s(0, 0);
    }
    case "ict_power3": {
      return s(f.macdHist > 0 && f.rsi14 > 50 ? 1 : f.macdHist < 0 && f.rsi14 < 50 ? -1 : 0, 0.5);
    }
    case "ict_smart": {
      const ob = f.obs.find((z) => z.kind === "ob_up" && p <= z.top && p >= z.bottom);
      const obd = f.obs.find((z) => z.kind === "ob_down" && p <= z.top && p >= z.bottom);
      if (ob && f.trend === "down") return s(1, 0.55); // trap
      if (obd && f.trend === "up") return s(-1, 0.55);
      return s(0, 0);
    }
    case "ict_judas": {
      const c = f.candles[f.candles.length - 1];
      const body = Math.abs(c.c - c.o);
      const ran = c.h - c.l;
      if (ran !== 0 && body / ran < 0.25 && f.volScore > 0.4) return s(1, 0.5);
      return s(0, 0);
    }
    case "ict_ods": {
      if (f.macdHist > 0 && f.trend === "up" && f.rsi14 < 70) return s(1, 0.5);
      if (f.macdHist < 0 && f.trend === "down" && f.rsi14 > 30) return s(-1, 0.5);
      return s(0, 0);
    }

    // ── volume ─────────────────────────────────────────────────────────
    case "vol_spike": {
      const lastC = f.candles[f.candles.length - 1];
      if (f.volScore > 0.6 && lastC.c > lastC.o) return s(1, 0.6);
      if (f.volScore > 0.6 && lastC.c < lastC.o) return s(-1, 0.6);
      return s(0, 0);
    }
    case "vol_obv": {
      if (f.obvSlope > 0 && f.rocV > 0) return s(1, 0.5);
      if (f.obvSlope < 0 && f.rocV < 0) return s(-1, 0.5);
      return s(0, 0);
    }
    case "vol_vwap": {
      if (p > f.vwapV && f.ema9 > f.ema50) return s(1, 0.6);
      if (p < f.vwapV && f.ema9 < f.ema50) return s(-1, 0.6);
      return s(0, 0);
    }
    case "vol_accum": {
      const c = f.candles[f.candles.length - 1];
      if (c.c >= c.o && f.macdHist > 0) return s(1, 0.45);
      if (c.c < c.o && f.macdHist < 0) return s(-1, 0.45);
      return s(0, 0);
    }
    case "vol_effort": {
      if (f.volScore < -0.3 && f.rsi14 > 55) return s(1, 0.5);
      if (f.volScore < -0.3 && f.rsi14 < 45) return s(-1, 0.5);
      return s(0, 0);
    }
    case "vol_cvd": {
      if (f.macdHist > 0 && f.obvSlope > 0) return s(1, 0.45);
      if (f.macdHist < 0 && f.obvSlope < 0) return s(-1, 0.45);
      return s(0, 0);
    }

    // ── volatility ─────────────────────────────────────────────────────
    case "vola_atr": {
      const atrPct = f.atrV / p;
      const avg = f.atrV === 0 ? 1 : f.atrV;
      const zX = (atrPct - avg / p) / (avg / p);
      if (zX > 0.8 && f.trend === "up") return s(1, 0.5);
      if (zX > 0.8 && f.trend === "down") return s(-1, 0.5);
      return s(0, 0);
    }
    case "vola_bbsqueeze": {
      const squeeze = (f.bbUpper - f.bbLower) / p < 0.01;
      if (squeeze && f.volScore > 0.5) return s(p > f.bbMid ? 1 : -1, 0.65);
      return s(0, 0);
    }
    case "vola_keltner": {
      const band = f.atrV * 2;
      if (p > f.ema21 + band && f.macdHist > 0) return s(1, 0.5);
      if (p < f.ema21 - band && f.macdHist < 0) return s(-1, 0.5);
      return s(0, 0);
    }
    case "vola_expansion": {
      const lastC = f.candles[f.candles.length - 1];
      const rng = (lastC.h - lastC.l) / p;
      const avgR = (f.atrV / p) * 1.2;
      if (rng > avgR * 2 && f.volScore > 0.5) return s(lastC.c > f.ema21 ? 1 : -1, 0.55);
      void avgR;
      return s(0, 0);
    }
    case "vola_range": {
      const rangePct = (f.donchUpper - f.donchLower) / p;
      if (rangePct < 0.005) return s(0, 0);
      return s(p > f.bbMid ? 1 : -1, 0.45);
    }
    case "vola_funnel": {
      const last5 = f.candles.slice(-5);
      const r1 = (last5[0].h - last5[0].l) / p;
      const r5 = (last5[4].h - last5[4].l) / p;
      if (r5 < r1 * 0.6) return s(f.trend === "up" ? 1 : -1, 0.55);
      return s(0, 0);
    }

    // ── support/resistance ─────────────────────────────────────────────
    case "sr_levels": {
      const lvl = nearestLevel(f, f.levels, 0.005);
      if (lvl !== 0 && p <= lvl * 1.006 && f.rsi14 > 50 && f.trend !== "down") return s(1, 0.7);
      if (lvl !== 0 && p >= lvl * 0.994 && f.rsi14 < 50 && f.trend !== "up") return s(-1, 0.7);
      return s(0, 0);
    }
    case "sr_pivot": {
      const lvl = nearestLevel(f, f.levels, 0.003);
      return s(lvl !== 0 && p > lvl && f.rsi14 > 50 ? 1 : lvl !== 0 && p < lvl && f.rsi14 < 50 ? -1 : 0, 0.5);
    }
    case "sr_fib": {
      const range = f.donchUpper - f.donchLower;
      const support = f.donchLower + range * 0.382;
      const resist = f.donchUpper - range * 0.382;
      if (p <= support * 1.01 && f.trend === "up") return s(1, 0.6);
      if (p >= resist * 0.99 && f.trend === "down") return s(-1, 0.6);
      return s(0, 0);
    }
    case "sr_round": {
      const round = Math.round(p / (10 ** approxDigits(p))) * 10 ** approxDigits(p);
      if (Math.abs(p - round) / p < 0.001 && f.rsi14 > 55) return s(1, 0.4);
      if (Math.abs(p - round) / p < 0.001 && f.rsi14 < 45) return s(-1, 0.4);
      return s(0, 0);
    }
    case "sr_trendline": {
      const rng = f.donchUpper - f.donchLower;
      const sl30 = (f.ema21 - f.ema9) / f.ema9;
      if (Math.abs(sl30) > 0.002) {
        return s(sl30 > 0 ? 1 : -1, 0.55);
      }
      void rng;
      return s(0, 0);
    }
    case "sr_conger": {
      const near = f.levels.filter((l) => Math.abs(p - l) / p < 0.004).length;
      if (near >= 2 && f.rsi14 > 50) return s(1, 0.6);
      if (near >= 2 && f.rsi14 < 50) return s(-1, 0.6);
      return s(0, 0);
    }
    case "sr_magnet": {
      const pmax = Math.max(...f.levels.length ? f.levels : [p]);
      void pmax;
      const lvl = nearestLevel(f, f.levels, 0.01);
      if (lvl !== 0) return s(lvl > p ? 1 : -1, 0.4);
      return s(0, 0);
    }

    // ── multi-timeframe & structure & liquidity & combos (aggregate) ───
    case "mtf_confluence":
    case "mtf_highertf":
    case "mtf_filter":
    case "mtf_bias":
      return s(f.trendScore * (f.structureScore > 0 ? 1 : 0.6), 0.6);
    case "mtf_t1":
      return s(f.momentumScore, 0.5);
    case "mtf_expansion":
      return s(f.trendScore + f.structureScore * 0.5, 0.6);
    case "struct_bos":
      return s(f.structure.bosUp ? 1 : f.structure.bosDown ? -1 : 0, 0.7);
    case "struct_choch":
      return s(f.structure.choch ? (f.trend === "up" ? 1 : -1) : 0, 0.6);
    case "struct_mss":
      return s(f.structure.mss ? (f.trend === "up" ? 1 : -1) : 0, 0.65);
    case "struct_continuation":
      return s(f.structure.bosUp && f.trend === "up" ? 1 : f.structure.bosDown && f.trend === "down" ? -1 : 0, 0.7);
    case "struct_reversal":
      return s(f.structure.choch ? (f.trend === "down" ? 1 : -1) : 0, 0.6);
    case "struct_invalid":
      return s(f.structure.mss ? (f.momentumScore > 0 ? 1 : -1) : 0, 0.4);
    case "liq_sweep":
      return s(f.liquidityScore, f.structure.choch ? 0.7 : 0.4);
    case "liq_session": {
      const c = f.candles[f.candles.length - 1];
      if (c.c > c.o && f.p > f.ema21) return s(1, 0.5);
      if (c.c < c.o && f.p < f.ema21) return s(-1, 0.5);
      return s(0, 0);
    }
    case "liq_weekend":
      return s(f.momentumScore, 0.45);
    case "liq_poi":
      return smcZone(f, "poi", 0.6);
    case "liq_run":
      return s(f.p > f.donchUpper && f.volScore > 0.4 ? 1 : f.p < f.donchLower && f.volScore > 0.4 ? -1 : 0, 0.6);
    case "liq_absorb":
      return s(f.rsi14 < 30 && f.trend === "down" ? 1 : f.rsi14 > 70 && f.trend === "up" ? -1 : 0, 0.5);
    case "combo_ema_rsi": {
      const trendOk = f.trendScore;
      if (trendOk > 0 && f.rsi14 > 55 && f.macdHist > 0) return s(1, 0.75);
      if (trendOk < 0 && f.rsi14 < 45 && f.macdHist < 0) return s(-1, 0.75);
      return s(0, 0);
    }
    case "combo_macd_bb": {
      if (f.macdHist > 0 && p > f.bbMid && p < f.bbUpper) return s(1, 0.65);
      if (f.macdHist < 0 && p < f.bbMid && p > f.bbLower) return s(-1, 0.65);
      return s(0, 0);
    }
    case "combo_smt": {
      return s(f.structure.choch ? (f.trendScore > 0 ? 1 : -1) : 0, 0.5);
    }
    case "combo_trio": {
      const score = f.trendScore + (f.rsi14 - 50) / 50 + f.macdHist * 10;
      const dir = Math.sign(score);
      return s(dir, Math.min(1, Math.abs(score) / 1.5));
    }
    case "combo_wolf": {
      // wolf confluence: structure + liquidity + divergence
      const conflu = (f.structure.mss ? 0.4 : 0) + (f.liquidityScore !== 0 ? 0.3 : 0) + (Math.abs(f.macdHist) > 0 ? 0.3 : 0);
      const dir = f.trendScore >= 0 ? (f.liquidityScore > 0 ? 1 : 0.5) : f.liquidityScore < 0 ? -1 : -0.5;
      return s(conflu > 0.4 ? dir : 0, 0.8);
    }
    case "combo_fisher": {
      const dfisher = (2 * ((f.rsi14 - 50) / 50)) / (1 + Math.abs(f.rsi14 - 50) / 50);
      if (dfisher > 0.5) return s(1, 0.5);
      if (dfisher < -0.5) return s(-1, 0.5);
      return s(0, 0);
    }
    case "combo_magic": {
      const s1 = Math.sign(f.ema9 - f.ema21);
      const s2 = Math.sign(f.rsi14 - 50);
      const s3 = Math.sign(f.macdHist);
      const sum = s1 + s2 + s3;
      return s(Math.sign(sum), Math.min(1, Math.abs(sum) / 3 + 0.3));
    }
    case "combo_supres": {
      const lvl = nearestLevel(f, f.levels, 0.005);
      if (lvl !== 0 && p <= lvl * 1.005 && f.volScore < 0 && f.rsi14 > 55) return s(1, 0.6);
      if (lvl !== 0 && p >= lvl * 0.995 && f.volScore < 0 && f.rsi14 < 45) return s(-1, 0.6);
      return s(0, 0);
    }
    default:
      return s(0, 0);
  }
}

function bodyAbs(c: Candle): number {
  return Math.abs(c.c - c.o);
}

function nearestLevel(f: EngineFeatures, levels: number[], tol: number): number {
  let best = 0;
  let bd = tol;
  for (const l of levels) {
    const d = Math.abs(f.price - l) / f.price;
    void d;
    if (d < bd && d < tol) {
      best = l;
      bd = d;
    }
  }
  return best;
}

function smcZone(f: EngineFeatures, kind: string, strength: number) {
  const zone = f.obs.find((z) => z.kind === kind && f.price >= z.bottom && f.price <= z.top);
  if (zone) return { dir: kind.includes("up") ? 1 : -1, strength };
  return { dir: 0, strength: 0 };
}

function approxDigits(p: number): number {
  if (p >= 100) return 1;
  if (p >= 1) return 2;
  return 4;
}

export interface StrategyVote {
  key: string;
  family: string;
  nameFa: string;
  dir: number; // 1 | -1 | 0
  strength: number;
  weight: number;
  score: number; // weighted contribution
}

export interface AggregatedSignal {
  direction: "long" | "short" | "neutral";
  score: number; // 0..100
  confidence: number; // 0..1
  contribution: Array<{ key: string; nameFa: string; dir: number; part: number }>;
  reasonFa: string;
}

/** Weighted aggregation — not a simple vote count. */
export function aggregateStrategies(
  results: StrategyResult[],
  timeframeWeights: Record<string, number>,
): AggregatedSignal {
  let sum = 0;
  let totalWeight = 0;
  const contribution: AggregatedSignal["contribution"] = [];
  for (const r of results) {
    const tw = timeframeWeights[r.key] ?? 1;
    const w = r.weight * tw;
    sum += r.dir * r.strength * w;
    totalWeight += w;
    if (r.dir !== 0) {
      contribution.push({ strategy: r.key, nameFa: r.nameFa, dir: r.dir, strength: r.strength, score: r.strength * w });
    }
  }
  if (totalWeight === 0) {
    return { direction: "neutral", score: 0, confidence: 0, contribution: [], reasonFa: "—"};
  }
  const norm = sum / totalWeight; // -1..1
  const abs = Math.abs(norm);
  const direction = norm > 0.12 ? "long" : norm < -0.12 ? "short" : "neutral";
  const score = Math.round(abs * 100);
  const confidence = Math.min(1, abs * 1.2);
  const top = [...contribution].sort((a, b) => b.strength - a.strength)[0];
  const reasonFa = top ? `${top.nameFa} — قدرت ${Math.round(top.strength * 100)}%` : "—";
  return { direction, score, confidence, contribution: contribution.slice(0, 12), reasonFa };
}
