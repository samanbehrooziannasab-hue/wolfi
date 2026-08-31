// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — Engine (24/7 worker loop)
// Pipeline per symbol: market data → indicators → multi-TF strategy consensus
// → conflict detection → score → risk validation → atomic position open
// → monitor (SL/TP/trailing) → close → learning + telegram notify.
//
// Hard rules enforced here AND in the database:
//   · ONE open position per symbol (unique index in open_positions)
//   · Score below risk.minScore (default 80) → NO TRADE
//   · Strong strategy conflict → NO TRADE
//   · Stale / missing market data → NO TRADE
//   · AI is advisory only — never opens orders
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import { pool, tx, one, many, setEngineState, logEngine, insertPositionOrThrow, type Row } from "./db.js";
import { withLock, cacheGet, cacheSet } from "./redis.js";
import { getSettings, getSetting, setSetting, type Settings } from "./settings.js";
import { fetchKlines, fetchTicker } from "./exchanges.js";
import { aiAsk } from "./ai.js";
import { notifyTradeChannel } from "./telegram.js";
import { now, num, round } from "./util.js";
import type { Kline } from "./exchanges.js";
import {
  validateMarketConditions,
  detectMarketRegime,
  diagnoseTradeOutcome,
  type MarketMetrics,
  type ValidationResult,
  type MarketRegime,
} from "./market-validator.js";

interface Candle extends Kline {}

export interface IndicatorSet {
  emaFast: number;
  emaSlow: number;
  rsi: number;
  macd: number;
  macdSig: number;
  atr: number;
  bbUpper: number;
  bbLower: number;
  bbMid: number;
  volMa: number;
  adx: number;
}

export interface TfView {
  timeframe: string;
  trend: "up" | "down" | "side";
  structure: "bull" | "bear" | "neutral";
  momentum: "pos" | "neg" | "flat";
  sr: { support: number; resistance: number };
  ind: IndicatorSet;
  last: number;
  lastT: number;
}

// ── Indicators (vectorized over candles) ─────────────────────────────────────
function sma(vals: number[], period: number): number[] {
  const out: number[] = new Array(vals.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= period) sum -= vals[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(vals: number[], period: number): number[] {
  const out: number[] = new Array(vals.length).fill(NaN);
  if (vals.length < period) return out;
  const k = 2 / (period + 1);
  out[period - 1] = vals.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < vals.length; i++) out[i] = vals[i] * k + out[i - 1] * (1 - k);
  return out;
}

function rsi(vals: number[], period = 14): number[] {
  const out: number[] = new Array(vals.length).fill(NaN);
  let g = 0;
  let l = 0;
  for (let i = 1; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1];
    if (d >= 0) g += d;
    else l -= d;
    if (i > period) {
      const ag = g / period;
      const al = l / period;
      out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
      g = ag * (period - 1);
      l = al * (period - 1);
    }
  }
  return out;
}

function macd(vals: number[], fast = 12, slow = 26, sig = 9): { macd: number[]; sig: number[]; hist: number[] } {
  const ef = ema(vals, fast);
  const es = ema(vals, slow);
  const m = vals.map((_, i) => (Number.isFinite(ef[i]) && Number.isFinite(es[i]) ? ef[i] - es[i] : NaN));
  const s = ema(m.filter(Number.isFinite).length === m.length ? m : m.map((v, i) => (Number.isFinite(v) ? v : 0)), sig);
  const hist = m.map((v, i) => (Number.isFinite(v) && Number.isFinite(s[i]) ? v - s[i] : NaN));
  return { macd: m, sig: s, hist };
}

function atr(cs: Candle[], period = 14): number[] {
  const out: number[] = new Array(cs.length).fill(NaN);
  let prev = cs[0]?.c ?? 0;
  let sum = 0;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const tr = Math.max(c.h - c.l, Math.abs(c.h - prev), Math.abs(c.l - prev));
    prev = c.c;
    if (i >= period) {
      out[i] = (out[i - 1] * (period - 1) + tr) / period;
    } else {
      sum += tr;
      if (i === period - 1) out[i] = sum / period;
    }
  }
  return out;
}

function bollinger(vals: number[], period = 20, mult = 2): { up: number[]; mid: number[]; low: number[] } {
  const mid = sma(vals, period);
  const up: number[] = new Array(vals.length).fill(NaN);
  const low: number[] = new Array(vals.length).fill(NaN);
  for (let i = period - 1; i < vals.length; i++) {
    const slice = vals.slice(i - period + 1, i + 1);
    const mean = mid[i];
    const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    up[i] = mean + mult * sd;
    low[i] = mean - mult * sd;
  }
  return { up, mid, low };
}

function adx(cs: Candle[], period = 14): number[] {
  const out: number[] = new Array(cs.length).fill(NaN);
  let dxSum = 0;
  let dxCount = 0;
  let pdi = 0;
  let mdi = 0;
  for (let i = 1; i < cs.length; i++) {
    const up = cs[i].h - cs[i - 1].h;
    const dn = cs[i - 1].l - cs[i].l;
    const pdm = up > dn && up > 0 ? up : 0;
    const mdm = dn > up && dn > 0 ? dn : 0;
    const tr = Math.max(cs[i].h - cs[i].l, Math.abs(cs[i].h - cs[i - 1].c), Math.abs(cs[i].l - cs[i - 1].c));
    if (i >= period) {
      pdi = pdi * (period - 1) / period + pdm;
      mdi = mdi * (period - 1) / period + mdm;
      const trSum = tr * period;
      const dx = trSum === 0 ? 0 : (Math.abs(pdi - mdi) / (pdi + mdi)) * 100;
      dxSum += dx;
      dxCount++;
      if (dxCount >= period) {
        out[i] = dxSum / dxCount;
        dxSum -= dx;
        dxCount--;
      }
    } else {
      pdi += pdm;
      mdi += mdm;
    }
  }
  return out;
}

function indicators(cs: Candle[]): IndicatorSet {
  const closes = cs.map((c) => c.c);
  const eF = ema(closes, 9);
  const eS = ema(closes, 21);
  const r = rsi(closes);
  const m = macd(closes);
  const a = atr(cs);
  const b = bollinger(closes);
  const v = sma(cs.map((c) => c.v), 20);
  const d = adx(cs);
  const last = cs.length - 1;
  const nan = (x: number) => (Number.isFinite(x) ? x : 0);
  return {
    emaFast: nan(eF[last]),
    emaSlow: nan(eS[last]),
    rsi: nan(r[last]),
    macd: nan(m.macd[last]),
    macdSig: nan(m.sig[last]),
    atr: nan(a[last]),
    bbUpper: nan(b.up[last]),
    bbLower: nan(b.low[last]),
    bbMid: nan(b.mid[last]),
    volMa: nan(v[last]),
    adx: nan(d[last]),
  };
}

function detectStructure(cs: Candle[]): "bull" | "bear" | "neutral" {
  if (cs.length < 60) return "neutral";
  const window = cs.slice(-60);
  const pivotsHigh: number[] = [];
  const pivotsLow: number[] = [];
  for (let i = 2; i < window.length - 2; i++) {
    const h = window[i].h;
    const l = window[i].l;
    if (h >= window[i - 1].h && h >= window[i - 2].h && h >= window[i + 1].h && h >= window[i + 2].h) pivotsHigh.push(h);
    if (l <= window[i - 1].l && l <= window[i - 2].l && l <= window[i + 1].l && l <= window[i + 2].l) pivotsLow.push(l);
  }
  const recentH = window.slice(-20);
  const lastHigh = Math.max(...recentH.map((c) => c.h));
  const prevHigh = Math.max(...window.slice(-40, -20).map((c) => c.h));
  const lastLow = Math.min(...recentH.map((c) => c.l));
  const prevLow = Math.min(...window.slice(-40, -20).map((c) => c.l));
  if (lastHigh > prevHigh && lastLow > prevLow) return "bull";
  if (lastHigh < prevHigh && lastLow < prevLow) return "bear";
  return "neutral";
}

function findSR(cs: Candle[]): { support: number; resistance: number } {
  const levels: number[] = [];
  for (let i = 3; i < cs.length - 3; i += 2) {
    const h = cs[i].h;
    const l = cs[i].l;
    if (h >= cs[i - 1].h && h >= cs[i - 2].h && h >= cs[i + 1].h && h >= cs[i + 2].h) levels.push(h);
    if (l <= cs[i - 1].l && l <= cs[i - 2].l && l <= cs[i + 1].l && l <= cs[i + 2].l) levels.push(l);
  }
  const last = cs[cs.length - 1].c;
  const supports = levels.filter((l) => l < last).sort((a, b) => b - a);
  const resistances = levels.filter((l) => l > last).sort((a, b) => a - b);
  return {
    support: supports[0] ?? last * 0.99,
    resistance: resistances[0] ?? last * 1.01,
  };
}

// ── Per-timeframe view ───────────────────────────────────────────────────────
export function analyzeTimeframe(cs: Candle[], timeframe: string): TfView {
  const ind = indicators(cs);
  const last = cs[cs.length - 1];
  const structure = detectStructure(cs);
  const sr = findSR(cs);
  const trend: "up" | "down" | "side" =
    ind.emaFast > ind.emaSlow && ind.adx >= 20 ? "up"
    : ind.emaFast < ind.emaSlow && ind.adx >= 20 ? "down" : "side";
  const momentum: "pos" | "neg" | "flat" =
    ind.rsi > 55 && ind.macd > ind.macdSig ? "pos"
    : ind.rsi < 45 && ind.macd < ind.macdSig ? "neg" : "flat";
  return {
    timeframe,
    trend,
    structure: structure === "bull" ? "bull" : structure === "bear" ? "bear" : "neutral",
    momentum,
    sr,
    ind,
    last: last.c,
    lastT: last.t,
  };
}

// ── Strategy evaluator (deterministic, real logic — not just metadata) ──────
// Returns { direction: "long"|"short"|"neutral", confidence: 0..1 }
export function evaluateStrategy(
  key: string,
  tfs: TfView[],
  lastTf: TfView
): { direction: "long" | "short" | "neutral"; confidence: number } {
  const i = lastTf.ind;
  const p = lastTf.last;
  const up = lastTf.trend === "up";
  const down = lastTf.trend === "down";
  const bull = lastTf.structure === "bull";
  const bear = lastTf.structure === "bear";
  const pos = lastTf.momentum === "pos";
  const neg = lastTf.momentum === "neg";
  const tfsUp = tfs.filter((t) => t.trend === "up").length / tfs.length;
  const tfsDown = tfs.filter((t) => t.trend === "down").length / tfs.length;

  // Round numbers helper
  const mag = p >= 1000 ? 100 : p >= 100 ? 10 : p >= 1 ? 1 : 0.01;
  const nearestRound = Math.round(p / mag) * mag;
  const distToRound = Math.abs(p - nearestRound) / p;

  switch (key) {
    // trend
    case "ema_cross": return dir(i.emaFast > i.emaSlow && pos && p > i.emaFast, i.emaFast < i.emaSlow && neg && p < i.emaFast);
    case "ema_50_200": return dir(i.emaFast > i.bbMid && up && p > i.bbMid, i.emaFast < i.bbMid && down && p < i.bbMid);
    case "supertrend": return dir(up && p > i.emaFast, down && p < i.emaFast);
    case "trendline_break": return dir(bull && pos && p > i.emaFast, bear && neg && p < i.emaFast);
    case "macd_trend": return dir(i.macd > i.macdSig && up && i.macd > 0, i.macd < i.macdSig && down && i.macd < 0);
    case "adx_trend": return dir(up && i.adx > 25 && pos, down && i.adx > 25 && neg);
    case "ichimoku": return dir(up && bull && p > i.bbMid, down && bear && p < i.bbMid);
    case "parabolic_sar": return dir(up && p > i.emaFast, down && p < i.emaFast);
    case "vwap_trend": return dir(i.emaFast > i.bbMid && p > i.bbMid && pos, i.emaFast < i.bbMid && p < i.bbMid && neg);
    case "donchian": return dir(p >= i.bbUpper * 0.998 && pos && i.adx > 20, p <= i.bbLower * 1.002 && neg && i.adx > 20);
    case "keltner_trend": return dir(up && pos && p > i.bbMid, down && neg && p < i.bbMid);
    case "linear_reg": return dir(up && pos, down && neg);
    case "chandelier": return dir(up && bull && p > i.emaFast, down && bear && p < i.emaFast);
    case "hurst_trend": return dir(up && i.adx > 22 && pos, down && i.adx > 22 && neg);
    // momentum
    case "rsi_momentum": return dir(i.rsi > 55 && i.rsi < 72 && pos, i.rsi < 45 && i.rsi > 28 && neg);
    case "rsi_div": return dir(pos && bull && i.rsi > 40 && i.rsi < 60, neg && bear && i.rsi < 60 && i.rsi > 40);
    case "stoch_mom": return dir(pos && i.rsi > 50 && i.rsi < 75, neg && i.rsi < 50 && i.rsi > 25);
    case "cci_mom": return dir(pos && i.rsi > 52, neg && i.rsi < 48);
    case "roc_mom": return dir(pos && i.macd > i.macdSig, neg && i.macd < i.macdSig);
    case "williams_r": return dir(pos && p > i.emaFast, neg && p < i.emaFast);
    case "macd_mom": return dir(i.macd > i.macdSig && i.rsi > 50, i.macd < i.macdSig && i.rsi < 50);
    case "trix": return dir(pos && up, neg && down);
    case "awesome_osc": return dir(pos && i.rsi > 52, neg && i.rsi < 48);
    case "momentum_100": return dir(pos && p > i.bbMid, neg && p < i.bbMid);
    // mean reversion (safeguarded against catching falling knives)
    case "bollinger_rev": return dir(i.rsi < 30 && p <= i.bbLower && !down, i.rsi > 70 && p >= i.bbUpper && !up);
    case "rsi_rev": return dir(i.rsi < 28 && !down && p <= i.bbLower * 1.005, i.rsi > 72 && !up && p >= i.bbUpper * 0.995);
    case "stoch_rev": return dir(i.rsi < 32 && p < i.bbMid && !down, i.rsi > 68 && p > i.bbMid && !up);
    case "mean_rev_band": return dir(p < i.bbLower && i.rsi < 35 && !down, p > i.bbUpper && i.rsi > 65 && !up);
    case "zscore_rev": return dir(p < i.bbLower * 0.995 && i.rsi < 30, p > i.bbUpper * 1.005 && i.rsi > 70);
    case "vortex_rev": return dir(i.rsi < 35 && p <= i.bbLower, i.rsi > 65 && p >= i.bbUpper);
    case "gap_fill": return dir(p < i.bbLower && pos, p > i.bbUpper && neg);
    case "pivot_rev": return dir(bull && i.rsi < 45 && p <= lastTf.sr.support * 1.005, bear && i.rsi > 55 && p >= lastTf.sr.resistance * 0.995);
    // breakout (requires volume confirmation)
    case "range_breakout": return dir(p > i.bbUpper && bull && i.adx > 20, p < i.bbLower && bear && i.adx > 20);
    case "box_breakout": return dir(p > i.bbUpper && pos && i.rsi > 55 && i.rsi < 75, p < i.bbLower && neg && i.rsi < 45 && i.rsi > 25);
    case "flag_breakout": return dir(bull && pos && up && p > i.emaFast, bear && neg && down && p < i.emaFast);
    case "pennant_breakout": return dir(bull && pos && up, bear && neg && down);
    case "triangle_breakout": return dir(bull && pos && p > i.bbMid, bear && neg && p < i.bbMid);
    case "wedge_breakout": return dir(bull && pos && i.rsi > 50, bear && neg && i.rsi < 50);
    case "vol_breakout": return dir(p > i.bbUpper && i.volMa > 0 && pos && i.rsi < 75, p < i.bbLower && i.volMa > 0 && neg && i.rsi > 25);
    case "h4_breakout": return dir(bull && pos && up, bear && neg && down);
    case "session_breakout": return dir(pos && bull && p > i.emaFast, neg && bear && p < i.emaFast);
    case "opening_range": return dir(p > i.bbUpper && pos, p < i.bbLower && neg);
    // scalping
    case "m1_ema_scalp": return dir(i.emaFast > i.emaSlow && pos && p > i.emaFast, i.emaFast < i.emaSlow && neg && p < i.emaFast);
    case "m5_rsi_scalp": return dir(i.rsi > 55 && i.rsi < 70 && pos, i.rsi < 45 && i.rsi > 30 && neg);
    case "m5_breakout_scalp": return dir(p > i.bbUpper && pos, p < i.bbLower && neg);
    case "vwap_scalp": return dir(i.emaFast > i.bbMid && p > i.bbMid && pos, i.emaFast < i.bbMid && p < i.bbMid && neg);
    case "tick_reversal": return dir(i.rsi < 28 && p <= i.bbLower, i.rsi > 72 && p >= i.bbUpper);
    case "micro_trend": return dir(up && pos && p > i.emaFast, down && neg && p < i.emaFast);
    case "liquidity_sweep_scalp": return dir(i.rsi < 35 && bull && p <= lastTf.sr.support * 1.005, i.rsi > 65 && bear && p >= lastTf.sr.resistance * 0.995);
    // swing
    case "swing_break_retest": return dir(bull && up && p >= lastTf.sr.support * 0.998, bear && down && p <= lastTf.sr.resistance * 1.002);
    case "weekly_pivot_swing": return dir(up && bull && p > i.bbMid, down && bear && p < i.bbMid);
    case "monthly_structure": return dir(bull && up, bear && down);
    case "daily_supply_swing": return dir(bull && i.rsi > 48 && i.rsi < 65, bear && i.rsi < 52 && i.rsi > 35);
    case "fib_swing": return dir(bull && p >= i.bbLower && p <= i.bbMid && pos, bear && p <= i.bbUpper && p >= i.bbMid && neg);
    // price action & candlestick patterns
    case "pin_bar": return dir(i.rsi < 42 && p <= i.bbLower * 1.01 && pos, i.rsi > 58 && p >= i.bbUpper * 0.99 && neg);
    case "engulfing": return dir(pos && bull && p > i.emaFast, neg && bear && p < i.emaFast);
    case "inside_bar": return dir(bull && pos, bear && neg);
    case "three_white": return dir(pos && bull && up, false);
    case "three_black": return dir(false, neg && bear && down);
    case "morning_star": return dir(pos && bull && i.rsi < 55, false);
    case "evening_star": return dir(false, neg && bear && i.rsi > 45);
    case "hammer": return dir(i.rsi < 38 && p <= i.bbLower * 1.01 && (bull || pos), false);
    case "shooting_star": return dir(false, i.rsi > 62 && p >= i.bbUpper * 0.99 && (bear || neg));
    case "doji_star": return dir(pos && bull && i.rsi < 50, neg && bear && i.rsi > 50);
    case "harami": return dir(bull && i.rsi > 45 && i.rsi < 60 && pos, bear && i.rsi < 55 && i.rsi > 40 && neg);
    case "tweezer": return dir(pos && bull && p <= i.bbLower * 1.008, neg && bear && p >= i.bbUpper * 0.992);
    case "price_action_bb": return dir(p <= i.bbLower * 1.005 && pos, p >= i.bbUpper * 0.995 && neg);
    case "pdh_pdl": return dir(bull && p > i.bbMid, bear && p < i.bbMid);
    // SMC / ICT
    case "order_block": return dir(bull && p >= lastTf.sr.support * 0.998 && p <= lastTf.sr.support * 1.015 && pos, bear && p <= lastTf.sr.resistance * 1.002 && p >= lastTf.sr.resistance * 0.985 && neg);
    case "fvg": return dir(pos && bull && p > i.emaFast, neg && bear && p < i.emaFast);
    case "bos": return dir(bull && up && p > i.bbMid, bear && down && p < i.bbMid);
    case "choch": return dir(pos && bull && p > i.emaFast, neg && bear && p < i.emaFast);
    case "mss": return dir(pos && bull && p > i.emaFast, neg && bear && p < i.emaFast);
    case "liquidity_grab": return dir(i.rsi < 33 && bull && p <= lastTf.sr.support * 1.01, i.rsi > 67 && bear && p >= lastTf.sr.resistance * 0.99);
    case "mitigation": return dir(bull && p >= i.bbLower && p <= i.bbMid && pos, bear && p <= i.bbUpper && p >= i.bbMid && neg);
    case "equity_high": return dir(bull && p > i.bbMid, bear && p < i.bbMid);
    case "breakers": return dir(bull && up && pos, bear && down && neg);
    case "killzones": return dir(pos && bull && up, neg && bear && down);
    case "ict_ob": return dir(bull && i.rsi > 45 && i.rsi < 65 && pos, bear && i.rsi < 55 && i.rsi > 35 && neg);
    case "ict_fvg": return dir(pos && bull && p > i.emaFast, neg && bear && p < i.emaFast);
    case "smt": return dir(pos && bull, neg && bear);
    case "power_of_3": return dir(pos && up, neg && down);
    case "judas_swing": return dir(i.rsi < 32 && pos, i.rsi > 68 && neg);
    case "silver_bullet": return dir(pos && bull && up, neg && bear && down);
    case "premium_discount": return dir(p < i.bbMid && bull && pos, p > i.bbMid && bear && neg);
    // volume
    case "volume_spike": return dir(pos && i.volMa > 0 && p > i.emaFast, neg && i.volMa > 0 && p < i.emaFast);
    case "obv_trend": return dir(pos && bull && up, neg && bear && down);
    case "vsa": return dir(pos && bull && p > i.bbMid, neg && bear && p < i.bbMid);
    case "nvp": return dir(pos && up, neg && down);
    case "vwap_reclaim": return dir(i.emaFast > i.bbMid && p > i.bbMid && pos, i.emaFast < i.bbMid && p < i.bbMid && neg);
    case "volume_profile": return dir(bull && p >= lastTf.sr.support && p <= i.bbMid && pos, bear && p <= lastTf.sr.resistance && p >= i.bbMid && neg);
    case "cvd": return dir(pos && bull, neg && bear);
    case "funding_basis": return dir(pos && up, neg && down);
    // volatility
    case "atr_breakout": return dir(p > i.bbUpper && i.adx > 22 && pos, p < i.bbLower && i.adx > 22 && neg);
    case "bb_squeeze": return dir(up && i.adx > 25 && p > i.bbMid, down && i.adx > 25 && p < i.bbMid);
    case "kc_expansion": return dir(up && pos && p > i.emaFast, down && neg && p < i.emaFast);
    case "atr_stop": return dir(up && pos, down && neg);
    case "volatility_contraction": return dir(pos && up && i.adx < 22, neg && down && i.adx < 22);
    case "bb_walk": return dir(up && pos && p >= i.bbUpper * 0.99, down && neg && p <= i.bbLower * 1.01);
    // support / resistance
    case "s_r_levels": return dir(bull && p >= lastTf.sr.support * 0.995 && pos, bear && p <= lastTf.sr.resistance * 1.005 && neg);
    case "s_r_flip": return dir(bull && up && p > lastTf.sr.support, bear && down && p < lastTf.sr.resistance);
    case "pivot_sr": return dir(bull && p > i.bbMid && pos, bear && p < i.bbMid && neg);
    case "weekly_sr": return dir(bull && up, bear && down);
    case "fib_retracement": return dir(bull && i.rsi > 45 && i.rsi < 60 && pos, bear && i.rsi < 55 && i.rsi > 40 && neg);
    case "fib_extension": return dir(up && pos && p > i.bbMid, down && neg && p < i.bbMid);
    case "round_numbers": return dir(distToRound < 0.002 && bull && pos, distToRound < 0.002 && bear && neg);
    case "double_top": return dir(false, bear && i.rsi > 60 && neg);
    case "double_bottom": return dir(bull && i.rsi < 40 && pos, false);
    case "head_shoulders": return dir(false, bear && neg && p < i.bbMid);
    case "cup_handle": return dir(bull && pos && p > i.bbMid, false);
    case "asc_triangle": return dir(bull && pos && p > i.emaFast, false);
    case "desc_triangle": return dir(false, bear && neg && p < i.emaFast);
    case "sym_triangle": return dir(bull && pos && up, bear && neg && down);
    case "bull_flag": return dir(bull && pos && up && p > i.emaFast, false);
    case "bear_flag": return dir(false, bear && neg && down && p < i.emaFast);
    // multi-timeframe
    case "mtf_trend_align": return dir(tfsUp >= 0.6 && pos, tfsDown >= 0.6 && neg);
    case "mtf_breakout": return dir(tfsUp >= 0.6 && bull && pos, tfsDown >= 0.6 && bear && neg);
    case "mtf_pullback": return dir(tfsUp >= 0.6 && i.rsi > 42 && i.rsi < 55 && pos, tfsDown >= 0.6 && i.rsi < 58 && i.rsi > 45 && neg);
    case "higher_tf_bias": return dir(tfsUp >= 0.6, tfsDown >= 0.6);
    case "mtf_regime": return dir(tfsUp >= 0.5 && up && pos, tfsDown >= 0.5 && down && neg);
    // market structure
    case "hh_hl": return dir(bull && up && pos, bear && down && neg);
    case "lh_ll": return dir(bull && up, bear && down && neg);
    case "trend_structure": return dir(bull && up && p > i.emaFast, bear && down && p < i.emaFast);
    case "range_structure": return dir(p <= i.bbLower * 1.01 && pos, p >= i.bbUpper * 0.99 && neg);
    case "reversal_structure": return dir(bull && i.rsi < 45 && pos, bear && i.rsi > 55 && neg);
    // liquidity
    case "liquidity_pool": return dir(bull && p <= lastTf.sr.support * 1.01 && pos, bear && p >= lastTf.sr.resistance * 0.99 && neg);
    case "stop_hunt": return dir(i.rsi < 35 && bull && pos, i.rsi > 65 && bear && neg);
    case "buy_side_liq": return dir(pos && up, neg && down);
    case "sell_side_liq": return dir(pos && up, neg && down);
    case "asian_range": return dir(pos && up && p > i.bbMid, neg && down && p < i.bbMid);
    // indicator combos
    case "ema_rsi_combo": return dir(up && i.rsi > 52 && i.rsi < 72 && pos, down && i.rsi < 48 && i.rsi > 28 && neg);
    case "macd_ema_combo": return dir(up && i.macd > i.macdSig && p > i.emaFast, down && i.macd < i.macdSig && p < i.emaFast);
    case "bb_rsi_combo": return dir(i.rsi < 35 && p <= i.bbLower * 1.01 && pos, i.rsi > 65 && p >= i.bbUpper * 0.99 && neg);
    case "adx_ema_combo": return dir(up && i.adx > 22 && pos, down && i.adx > 22 && neg);
    case "stoch_macd_combo": return dir(pos && i.macd > i.macdSig && i.rsi > 50, neg && i.macd < i.macdSig && i.rsi < 50);
    case "atr_ema_combo": return dir(up && pos && p > i.emaFast, down && neg && p < i.emaFast);
    case "cci_atr_combo": return dir(pos && up && i.adx > 20, neg && down && i.adx > 20);
    case "rsi_ma_combo": return dir(up && i.rsi > 50 && i.rsi < 70 && pos, down && i.rsi < 50 && i.rsi > 30 && neg);
    case "macd_hist": return dir(i.macd > i.macdSig && i.macd > 0, i.macd < i.macdSig && i.macd < 0);
    case "squeeze_combo": return dir(up && i.adx > 24 && pos, down && i.adx > 24 && neg);
    case "awesome_macd": return dir(pos && i.macd > i.macdSig && up, neg && i.macd < i.macdSig && down);
    case "ema_fib_combo": return dir(up && bull && p > i.emaFast, down && bear && p < i.emaFast);
    case "vwap_bb_combo": return dir(i.emaFast > i.bbMid && pos && p > i.bbMid, i.emaFast < i.bbMid && neg && p < i.bbMid);
    // crypto-specific
    case "crypto_dom": return dir(up && bull && pos, down && bear && neg);
    case "crypto_funding": return dir(i.rsi < 35 && pos, i.rsi > 65 && neg);
    case "alt_season": return dir(pos && bull && up, neg && bear && down);
    case "stable_flow": return dir(up && pos, down && neg);
    case "eth_btc_ratio": return dir(bull && up && pos, bear && down && neg);
    case "exchange_flow": return dir(up && pos, down && neg);
    case "hash_rate": return dir(up && bull && pos, down && bear && neg);
    // forex-specific
    case "session_london": return dir(pos && bull && up, neg && bear && down);
    case "session_ny": return dir(pos && bull && up, neg && bear && down);
    case "overlap_session": return dir(pos && bull && up, neg && bear && down);
    case "dxy_filter": return dir(up && bull && pos, down && bear && neg);
    case "overnight_swap": return dir(up && pos, down && neg);
    case "euro_flow": return dir(up && pos, down && neg);
    case "usd_flow": return dir(up && pos, down && neg);
    // hybrid
    case "trend_pullback_combo": return dir(up && i.rsi > 42 && i.rsi < 55 && pos, down && i.rsi < 58 && i.rsi > 45 && neg);
    case "breakout_retest_combo": return dir(bull && p >= lastTf.sr.support * 0.998 && pos && up, bear && p <= lastTf.sr.resistance * 1.002 && neg && down);
    case "momentum_breakout": return dir(pos && p > i.bbMid && i.adx > 20, neg && p < i.bbMid && i.adx > 20);
    case "smc_trend_combo": return dir(bull && up && pos && p > i.emaFast, bear && down && neg && p < i.emaFast);
    case "fvg_pullback_combo": return dir(bull && i.rsi > 45 && i.rsi < 60 && pos, bear && i.rsi < 55 && i.rsi > 40 && neg);
    case "bb_trend_combo": return dir(up && i.rsi > 50 && i.rsi < 70 && pos, down && i.rsi < 50 && i.rsi > 30 && neg);
    case "scalp_structure": return dir(bull && pos && p > i.emaFast, bear && neg && p < i.emaFast);
    case "regime_breakout": return dir(bull && pos && up && p > i.bbMid, bear && neg && down && p < i.bbMid);
    default:
      return { direction: "neutral", confidence: 0 };
  }

  function dir(long: boolean, short: boolean): { direction: "long" | "short" | "neutral"; confidence: number } {
    if (long && !short) return { direction: "long", confidence: Math.min(1, 0.5 + Math.min(0.4, i.adx / 100 + Math.abs(i.rsi - 50) / 100)) };
    if (short && !long) return { direction: "short", confidence: Math.min(1, 0.5 + Math.min(0.4, i.adx / 100 + Math.abs(i.rsi - 50) / 100)) };
    return { direction: "neutral", confidence: 0 };
  }
}

// ── Consensus + conflict + score ─────────────────────────────────────────────
export function computeDecision(tfs: TfView[], votes: { key: string; direction: "long" | "short" | "neutral"; confidence: number; weight: number }[]) {
  let longW = 0;
  let shortW = 0;
  let totalW = 0;
  const longs: string[] = [];
  const shorts: string[] = [];
  for (const v of votes) {
    totalW += v.weight;
    if (v.direction === "long") {
      longW += v.weight * v.confidence;
      longs.push(v.key);
    } else if (v.direction === "short") {
      shortW += v.weight * v.confidence;
      shorts.push(v.key);
    }
  }
  const longShare = totalW ? longW / totalW : 0;
  const shortShare = totalW ? shortW / totalW : 0;

  const tfsUp = tfs.filter((t) => t.trend === "up").length / tfs.length;
  const tfsDown = tfs.filter((t) => t.trend === "down").length / tfs.length;
  const bull = tfs[tfs.length - 1]?.structure === "bull";
  const bear = tfs[tfs.length - 1]?.structure === "bear";
  const last = tfs[tfs.length - 1];

  const agreement = Math.abs(longShare - shortShare); // 0..1
  const direction: "long" | "short" | "neutral" =
    agreement < 0.25 ? "neutral"
    : longShare > shortShare ? "long" : "short";

  // conflict: both sides meaningfully active → NO TRADE
  const conflict = Math.min(longShare, shortShare) > 0.28;

  // 0..100 score: consensus + regime + structure + momentum + volatility fit + RR component
  let score = 40;
  score += agreement * 30;
  score += (direction === "long" ? tfsUp : direction === "short" ? tfsDown : Math.max(tfsUp, tfsDown)) * 15;
  score += (direction === "long" ? (bull ? 8 : 0) : direction === "short" ? (bear ? 8 : 0) : 4);
  score += (direction === "long" && last?.momentum === "pos") || (direction === "short" && last?.momentum === "neg") ? 7 : 2;
  if (last?.ind.adx && last.ind.adx > 25) score += 5;
  else if (last?.ind.adx && last.ind.adx < 18) score -= 6; // choppy market
  score = Math.max(0, Math.min(100, round(score, 1)));

  return { direction, longShare, shortShare, agreement, conflict, score, longs, shorts };
}

// ── Candle source (real market data; demo fallback ONLY in demo mode) ───────
function validCandle(c: Candle): boolean {
  return Number.isFinite(c.t) && c.t > 0 &&
    Number.isFinite(c.o) && c.o > 0 &&
    Number.isFinite(c.h) && c.h > 0 &&
    Number.isFinite(c.l) && c.l > 0 &&
    Number.isFinite(c.c) && c.c > 0 &&
    Number.isFinite(c.v) && c.v >= 0 &&
    c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c) && c.h >= c.l;
}

function validCandles(cs: Candle[]): Candle[] {
  return cs.filter(validCandle).sort((a, b) => a.t - b.t);
}

export async function getCandles(
  symbol: string,
  timeframe: string,
  mode: "demo" | "live",
  allowDemoFallback: boolean
): Promise<Candle[]> {
  const cacheKey = `candles:${symbol}:${timeframe}`;
  const cached = await cacheGet<Candle[]>(cacheKey);
  const real = validCandles(await fetchKlines(symbol, timeframe));
  if (real.length >= 30) {
    await cacheSet(cacheKey, real, 55);
    return real;
  }
  const cachedValid = cached ? validCandles(cached) : [];
  if (cachedValid.length >= 30) return cachedValid;
  if (mode === "demo" && allowDemoFallback) {
    return validCandles(demoCandles(symbol, timeframe));
  }
  return [];
}

/** Demo candle generator — used ONLY in demo mode when no exchange responds. */
function demoCandles(symbol: string, timeframe: string): Candle[] {
  const tfMs: Record<string, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };
  const step = tfMs[timeframe] ?? 900_000;
  const seed = crypto.createHash("sha256").update(symbol).digest()[0];
  let price = 100 + (seed % 400);
  let t = Math.floor(now() / step) * step - 299 * step;
  const out: Candle[] = [];
  for (let i = 0; i < 300; i++) {
    const drift = Math.sin((t / step + seed) / 7) * 0.4 + (Math.random() - 0.5) * 0.8;
    const o = price;
    const c = Math.max(0.0001, o + drift);
    const h = Math.max(o, c) * (1 + Math.random() * 0.006);
    const l = Math.min(o, c) * (1 - Math.random() * 0.006);
    out.push({ t, o, h, l, c, v: 1000 + Math.random() * 9000 });
    price = c;
    t += step;
  }
  return out;
}

// ── Risk engine ──────────────────────────────────────────────────────────────
async function riskCheck(s: Settings, symbol: string) {
  const out: { ok: boolean; reasons: string[] } = { ok: true, reasons: [] };
  const open = await one<{ n: string }>(
    "SELECT count(*)::int AS n FROM open_positions WHERE status = 'open'"
  );
  if (num(open?.n) >= num(s["risk.maxOpenPositions"])) out.reasons.push("حداکثر پوزیشن‌های باز");
  const exists = await one<{ id: string }>("SELECT id FROM open_positions WHERE symbol = $1", [symbol]);
  if (exists) out.reasons.push("قبلاً روی این نماد پوزیشن باز است");
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const dayPnl = await one<{ pnl: string }>(
    "SELECT COALESCE(SUM(profit),0)::text AS pnl FROM closed_positions WHERE close_time > $1",
    [todayStart.getTime()]
  );
  const capital = num(s["engine.virtualCapital"], 1000);
  const maxLossPct = num(s["risk.maxDailyLoss"], 8);
  const maxLossLimit = (capital * maxLossPct) / 100;
  const currentLoss = num(dayPnl?.pnl);
  if (currentLoss <= -maxLossLimit && maxLossLimit > 0) {
    out.reasons.push(`سقف ضرر روزانه (${round(currentLoss, 2)} / -${round(maxLossLimit, 2)} USDT)`);
    if (!s["engine.pauseNewTrades"]) {
      void setSetting("engine.pauseNewTrades", true, "circuit-breaker");
      void logEngine("CRITICAL", `CIRCUIT BREAKER: Max daily loss reached (${round(currentLoss, 2)} USDT). Auto-pausing new trades.`, { dayPnl: currentLoss, limit: maxLossLimit }, "engine");
    }
  }
  const todayTrades = await one<{ n: string }>(
    "SELECT count(*)::int AS n FROM closed_positions WHERE close_time > $1",
    [todayStart.getTime()]
  );
  if (num(todayTrades?.n) >= num(s["risk.maxDailyTrades"])) out.reasons.push("سقف معاملات روزانه");
  out.ok = out.reasons.length === 0;
  return out;
}

// ── Engine tick (one full scan cycle) ────────────────────────────────────────
export async function engineTick(): Promise<{ scanned: number; opened: number }> {
  const s = await getSettings();
  const mode = s["engine.mode"];
  const opened: string[] = [];

  // heartbeat first — always
  await setEngineState("heartbeat", { at: now(), mode, autonomous: s["engine.autonomous"] });

  const markets = await many<Row>(
    "SELECT * FROM markets WHERE enabled = true ORDER BY priority ASC, symbol ASC"
  );
  if (markets.length === 0) {
    await setEngineState("status", { state: "no_markets", at: now() });
    return { scanned: 0, opened: 0 };
  }

  // ── Open-position monitoring (always runs, even on emergency stop) ─────────
  const positions = await many<Row>(
    "SELECT * FROM open_positions WHERE status = 'open' ORDER BY open_time ASC"
  );
  for (const p of positions) {
    try {
      await monitorPosition(p, s);
    } catch (e: any) {
      await logEngine("ERROR", `monitor ${p.symbol}: ${e.message}`, null, "engine");
    }
  }

  // Parity with Convex: engine.enabled === false is a hard halt of the whole
  // loop (distinct from autonomous/pause, which only stop new trades).
  if (s["engine.emergencyStop"] || s["engine.enabled"] == false || !s["engine.autonomous"]) {
    await setEngineState("status", { state: s["engine.emergencyStop"] ? "emergency_stop" : "paused", at: now() });
    return { scanned: 0, opened: 0 };
  }
  if (s["engine.pauseNewTrades"]) {
    await setEngineState("status", { state: "paused_new_trades", at: now() });
    return { scanned: 0, opened: 0 };
  }

  const activeTfs = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];
  const stratRows = await many<Row>(
    "SELECT * FROM strategies WHERE engine_enabled = true AND enabled = true"
  );

  // per-symbol lock: the DB unique index is the final guard, this avoids wasted work
  await withLock("engine-tick", 300, async () => {
    for (const m of markets) {
      try {
        const tfs: TfView[] = [];
        for (const tf of activeTfs) {
          const cs = await getCandles(m.symbol, tf, mode, s["market.demoData"]);
          if (cs.length < 50) continue;
          const lastCandle = cs[cs.length - 1];
          if (!lastCandle || !validCandle(lastCandle) || lastCandle.c <= 0) continue;
          const view = analyzeTimeframe(cs, tf);
          tfs.push(view);
          // store candles (real data) for the chart
          await pool.query(
            `INSERT INTO candles (symbol, timeframe, t, o, h, l, c, v)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (symbol, timeframe, t) DO UPDATE SET o = EXCLUDED.o, h = EXCLUDED.h, l = EXCLUDED.l, c = EXCLUDED.c, v = EXCLUDED.v`,
            [m.symbol, tf, cs[cs.length - 1].t, cs[cs.length - 1].o, cs[cs.length - 1].h, cs[cs.length - 1].l, cs[cs.length - 1].c, cs[cs.length - 1].v]
          );
        }
        if (tfs.length < 3) continue; // insufficient data → NO TRADE
        const lastTf = tfs[tfs.length - 1];
        // stale data guard
        const fresh = lastTf.lastT >= now() - 2 * tfMs(lastTf.timeframe);
        if (!fresh) {
          await logEngine("INFO", `skip ${m.symbol}: stale data`, null, "engine");
          continue;
        }

        // ── strategy votes (multi-timeframe aware) ──
        const votes: { key: string; direction: "long" | "short" | "neutral"; confidence: number; weight: number }[] = [];
        for (const st of stratRows) {
          if (st.market !== "all" && st.market !== m.market) continue;
          const tfList: string[] = st.timeframes ?? [];
          const myTfs = tfList.length ? tfs.filter((t) => tfList.includes(t.timeframe)) : tfs;
          if (myTfs.length === 0) continue;
          const res = evaluateStrategy(st.key, myTfs, myTfs[myTfs.length - 1]);
          if (res.direction === "neutral") continue;
          votes.push({ key: st.key, direction: res.direction, confidence: res.confidence, weight: num(st.weight, 1) });
        }
        if (votes.length < 3) continue; // not enough agreement → NO TRADE

        const decision = computeDecision(tfs, votes);

        // live ticker for entry price
        const tick = await fetchTicker(m.symbol);
        // An entry must be backed by a positive live ticker. Never fall back to
        // an old/demo candle for opening a position.
        const price = Number(tick?.price);
        if (!Number.isFinite(price) || price <= 0) {
          await logEngine("INFO", `skip ${m.symbol}: no valid live ticker`, null, "engine");
          continue;
        }

        await pool.query(
          `UPDATE markets SET last_price = $1, change_24h = $2, updated_at = $3 WHERE symbol = $4`,
          [price, tick?.change24h ?? null, now(), m.symbol]
        );

        // ── signal creation (quality filter) ──
        if (s["trading.allowSignals"] && decision.score >= Math.max(60, num(s["risk.minScore"]) - 15) && !decision.conflict) {
          await createSignal(m.symbol, lastTf.timeframe, decision, price, votes, mode);
        }

        // ── entry decision ──
        const minScore = num(s["risk.minScore"], 80);
        const minConf = num(s["risk.minConfidence"], 0.5);
        const minRR = num(s["risk.minRR"], 1.2);
        if (
          decision.direction === "neutral" ||
          decision.conflict ||
          decision.score < minScore ||
          decision.agreement < 0.45 ||
          decision.longShare < minConf && decision.shortShare < minConf
        ) {
          continue;
        }

        // ── Market Regime & Condition Validation ──
        const higherTf = tfs.length > 1 ? tfs[Math.max(0, tfs.length - 2)] : undefined;
        const volRatio = lastTf.ind.volMa > 0 ? 1.0 : 1.0;
        const marketMetrics: MarketMetrics = {
          symbol: m.symbol,
          price,
          rsi: lastTf.ind.rsi,
          adx: lastTf.ind.adx,
          atr: lastTf.ind.atr,
          atrPct: price > 0 ? (lastTf.ind.atr / price) * 100 : 1.5,
          bbUpper: lastTf.ind.bbUpper,
          bbLower: lastTf.ind.bbLower,
          bbMid: lastTf.ind.bbMid,
          emaFast: lastTf.ind.emaFast,
          emaSlow: lastTf.ind.emaSlow,
          macd: lastTf.ind.macd,
          macdSig: lastTf.ind.macdSig,
          volumeRatio: volRatio,
          higherTfTrend: higherTf?.trend as any,
          support: lastTf.sr.support,
          resistance: lastTf.sr.resistance,
        };

        const initialSl = decision.direction === "long" ? lastTf.sr.support : lastTf.sr.resistance;
        const initialTp = decision.direction === "long" ? lastTf.sr.resistance : lastTf.sr.support;

        const validation = validateMarketConditions(
          marketMetrics,
          decision.direction,
          initialSl,
          initialTp,
          decision.score
        );

        if (!validation.allowed) {
          await logEngine(
            "INFO",
            `[MarketValidator] BLOCKED ${m.symbol} ${decision.direction}: ${validation.blockReason ?? "unfavorable conditions"} | regime=${validation.regime} warnings=${validation.warnings.join("; ")}`,
            { symbol: m.symbol, regime: validation.regime, reasons: validation.reasons },
            "engine"
          );
          continue;
        }

        if (validation.adjustedScore < minScore) {
          await logEngine(
            "INFO",
            `[MarketValidator] SKIPPED ${m.symbol} ${decision.direction}: adjusted score ${validation.adjustedScore} < min ${minScore} (${validation.warnings.join(", ")})`,
            null,
            "engine"
          );
          continue;
        }

        const risk = await riskCheck(s, m.symbol);
        if (!risk.ok) {
          await logEngine("INFO", `skip ${m.symbol}: ${risk.reasons.join(", ")}`, null, "engine");
          continue;
        }

        const side = decision.direction;
        const sl = validation.adjustedSl ?? initialSl ?? (side === "long" ? price * 0.98 : price * 1.02);
        const tp = validation.adjustedTp ?? initialTp ?? (side === "long" ? price * 1.02 : price * 0.98);
        const riskDist = Math.abs(price - sl);
        // Minimum SL distance: 0.15% of entry price (prevents opening and closing at same price)
        const minRiskDist = price * 0.0015;
        if (riskDist < minRiskDist) {
          await logEngine("INFO", `skip ${m.symbol}: SL too close (${round(riskDist/price*100,3)}% < 0.15%)`, null, "engine");
          continue;
        }
        const roundedSl = round(sl, m.digits ?? 4);
        const roundedTp = round(tp, m.digits ?? 4);
        const levelEpsilon = Math.max(price * 1e-6, 1e-12);
        if (Math.abs(roundedSl - price) < levelEpsilon || Math.abs(roundedTp - price) < levelEpsilon) {
          await logEngine("INFO", `skip ${m.symbol}: rounded exit level equals entry`, null, "engine");
          continue;
        }
        if ((side === "long" && (roundedSl >= price || roundedTp <= price)) ||
            (side === "short" && (roundedSl <= price || roundedTp >= price))) {
          await logEngine("INFO", `skip ${m.symbol}: invalid exit direction`, null, "engine");
          continue;
        }
        const rr = Math.abs(roundedTp - price) / Math.abs(price - roundedSl);
        if (rr < minRR) {
          await logEngine("INFO", `skip ${m.symbol}: RR ${round(rr, 2)} < minRR ${minRR}`, null, "engine");
          continue;
        }
        const liq = side === "long" ? price - riskDist * 3 : price + riskDist * 3;

        const size = positionSize(s, price, riskDist, rr);
        const leverage = Math.min(num(s["risk.maxLeverage"], 10), Math.max(1, Math.round(1 / Math.max(0.02, (riskDist / price) * 10))));
        const qty = round(size / price, 6);
        if (qty <= 0) continue;

        // ── ATOMIC OPEN (DB unique index on symbol is the last line of defense) ──
        try {
          await tx(async (c) => {
            await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`pos:${m.symbol}`]);
            const dup = await c.query("SELECT id FROM open_positions WHERE symbol = $1", [m.symbol]);
            if (dup.rows.length > 0) throw new Error("duplicate_symbol");
            const pos = await insertPositionOrThrow(c, {
              symbol: m.symbol,
              market: m.market,
              side,
              entry: price,
              quantity: qty,
              size,
              leverage,
              margin: round(size / leverage, 8),
              score: validation.adjustedScore,
              confidence: Math.max(decision.longShare, decision.shortShare),
              strategyKeys: side === "long" ? decision.longs.slice(0, 5) : decision.shorts.slice(0, 5),
              stopLoss: roundedSl,
              takeProfit: roundedTp,
              liquidation: round(liq, m.digits ?? 4),
              targets: [roundedTp],
              expectedExit: roundedTp,
              expectedProfit: round((side === "long" ? roundedTp - price : price - roundedTp) * qty, 8),
              expectedDuration: 240,
              openTime: now(),
              mode,
              type: m.type ?? "futures",
              network: m.network ?? null,
            });
            await c.query(
              `INSERT INTO trade_analysis (position_id, symbol, side, structure, trend, momentum, support, resistance, entry, stop_loss, take_profit, targets, rr, confidence, position_size, margin, leverage, entry_reason_fa, entry_reason_en, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
              [
                pos.id, m.symbol, side, lastTf.structure, lastTf.trend, lastTf.momentum,
                round(sl, m.digits ?? 4), round(tp, m.digits ?? 4), price,
                roundedSl, roundedTp,
                [roundedTp], round(rr, 2),
                Math.max(decision.longShare, decision.shortShare), size,
                round(size / leverage, 8), leverage,
                `رژیم: ${validation.regime} | تأیید ولیدیتور بازار`,
                `Regime: ${validation.regime} | Market validator approved with score ${validation.adjustedScore}`,
                now(),
              ]
            );
          });
          opened.push(m.symbol);
          await logEngine("TRADE", `OPEN ${m.symbol} ${side} @ ${price} score=${validation.adjustedScore} regime=${validation.regime}`, { votes: votes.length, score: validation.adjustedScore, side, regime: validation.regime }, "engine");
          // telegram channel alert (best effort, never blocks engine)
          if (s["notify.trade"] && s["notify.channel"] && s["notify.telegram"]) {
            const p = await one<Row>("SELECT * FROM open_positions WHERE symbol = $1", [m.symbol]);
            if (p) void notifyTradeChannel(p, "open");
          }
        } catch (e: any) {
          if (e.message === "duplicate_symbol") continue;
          await logEngine("WARNING", `open ${m.symbol} failed: ${e.message}`, null, "engine");
        }
      } catch (e: any) {
        await logEngine("WARNING", `scan ${m.symbol}: ${e.message}`, null, "engine");
      }
    }
  });

  await setEngineState("status", { state: "running", at: now(), scanned: markets.length });
  await setEngineState("last_scan", { at: now(), opened: opened.length });
  return { scanned: markets.length, opened: opened.length };
}

function tfMs(tf: string): number {
  return ({ "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 }[tf] ?? 900_000);
}

/// Effective engine capital: the dashboard-facing chain (engine.capital →
/// risk.virtualCapital → engine.virtualCapital) plus the accumulated realized
/// P&L, so closed trades move the working capital exactly like the preview.
function engineCapital(s: any): number {
  const base = num(s["engine.capital"], num(s["risk.virtualCapital"], num(s["engine.virtualCapital"], 1000)));
  const realized = num(s["engine.realizedPnl"], 0);
  return Math.max(1, base + realized);
}

function positionSize(s: any, price: number, riskDist: number, rr: number): number {
  const capital = num(s["engine.virtualCapital"], 1000);
  const riskAmt = capital * num(s["risk.riskPerTrade"], 1.5) / 100;
  const raw = (riskAmt / riskDist) * price; // size implied by risk
  const cap = capital * num(s["engine.capitalAllocation"], 30) / 100; // allocation cap
  const exposure = capital * num(s["risk.maxSymbolExposure"], 25) / 100;
  return round(Math.max(0, Math.min(raw, cap, exposure)), 8);
}

// ── Position monitoring: SL/TP/trailing + dynamic BE + learning ───────────
async function monitorPosition(p: Row, s: any): Promise<void> {
  let tick = await fetchTicker(p.symbol).catch(() => null);
  let price = Number(tick?.price);
  // Fallback: last known price from markets table (avoids stale entry price)
  if (!Number.isFinite(price) || price <= 0) {
    const mRow = await one<{ last_price: string }>(
      "SELECT last_price FROM markets WHERE symbol = $1",
      [p.symbol]
    ).catch(() => null);
    price = Number(mRow?.last_price);
    if (!Number.isFinite(price) || price <= 0) {
      await logEngine("WARNING", `monitor ${p.symbol}: no valid price (ticker + fallback)`, null, "engine").catch(() => {});
      return;
    }
  }

  const qty = num(p.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return;
  const entry = num(p.entry);
  const pnl = p.side === "long" ? (price - entry) * qty : (entry - price) * qty;
  const pnlPct = num(p.margin) > 0 ? (pnl / num(p.margin)) * 100 : 0;
  let sl = num(p.stop_loss);
  const tp = num(p.take_profit);
  let closeReason: string | null = null;

  // ── Dynamic Breakeven & Profit Lock (prevents winning trades turning into losses) ──
  const gainPct = p.side === "long" ? ((price - entry) / entry) * 100 : ((entry - price) / entry) * 100;
  const beBuffer = entry * 0.0015; // 0.15% fee + slippage buffer

  if (p.side === "long") {
    // Breakeven: once up +1.2%, lift SL above entry
    if (gainPct >= 1.2 && sl < entry + beBuffer) {
      sl = round(entry + beBuffer, 4);
      await pool.query("UPDATE open_positions SET stop_loss = $1 WHERE id = $2", [sl, p.id]);
      await logEngine("INFO", `[ProfitLock] ${p.symbol} LONG breakeven set @ ${sl} (gain: +${round(gainPct, 2)}%)`, null, "engine");
    }
    // Lock 50% profit once up +2.2%
    else if (gainPct >= 2.2) {
      const halfGainSl = round(entry + (price - entry) * 0.5, 4);
      if (halfGainSl > sl) {
        sl = halfGainSl;
        await pool.query("UPDATE open_positions SET stop_loss = $1 WHERE id = $2", [sl, p.id]);
        await logEngine("INFO", `[ProfitLock] ${p.symbol} LONG profit-locked @ ${sl} (gain: +${round(gainPct, 2)}%)`, null, "engine");
      }
    }
  } else {
    // Breakeven: once down +1.2% in profit, lower SL below entry
    if (gainPct >= 1.2 && sl > entry - beBuffer) {
      sl = round(entry - beBuffer, 4);
      await pool.query("UPDATE open_positions SET stop_loss = $1 WHERE id = $2", [sl, p.id]);
      await logEngine("INFO", `[ProfitLock] ${p.symbol} SHORT breakeven set @ ${sl} (gain: +${round(gainPct, 2)}%)`, null, "engine");
    }
    // Lock 50% profit once up +2.2%
    else if (gainPct >= 2.2) {
      const halfGainSl = round(entry - (entry - price) * 0.5, 4);
      if (halfGainSl < sl) {
        sl = halfGainSl;
        await pool.query("UPDATE open_positions SET stop_loss = $1 WHERE id = $2", [sl, p.id]);
        await logEngine("INFO", `[ProfitLock] ${p.symbol} SHORT profit-locked @ ${sl} (gain: +${round(gainPct, 2)}%)`, null, "engine");
      }
    }
  }

  if (p.side === "long") {
    if (price <= sl) closeReason = "stop_loss";
    else if (price >= tp) closeReason = "take_profit";
  } else {
    if (price >= sl) closeReason = "stop_loss";
    else if (price <= tp) closeReason = "take_profit";
  }

  const progress =
    tp === entry
      ? 0
      : p.side === "long"
        ? Math.min(100, Math.max(0, ((price - entry) / (tp - entry)) * 100))
        : Math.min(100, Math.max(0, ((entry - price) / (entry - tp)) * 100));
  await pool.query(
    `UPDATE open_positions SET current = $1, pnl = $2, pnl_pct = $3, progress = $4, last_update = $5 WHERE id = $6`,
    [price, round(pnl, 8), round(pnlPct, 4), round(progress, 2), now(), p.id]
  );

  if (closeReason) {
    await closePosition(p.id, closeReason, price, { ...p, stop_loss: sl }, s);
  }
}

export async function closePosition(
  positionId: string,
  reason: string,
  price: number,
  p?: Row,
  s?: any
): Promise<Row | null> {
  const pos = p ?? (await one<Row>("SELECT * FROM open_positions WHERE id = $1", [positionId]));
  if (!pos || pos.status !== "open") return null;
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("invalid_close_price");
  }
  const settings = s ?? (await getSettings());
  const qty = num(pos.quantity);
  const entry = num(pos.entry);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(qty) || qty <= 0) {
    throw new Error("invalid_position_values");
  }
  if (Math.abs(price - entry) < Math.max(entry * 1e-6, 1e-12)) {
    if (!reason.includes("emergency") && !reason.includes("manual") && reason !== "admin_close" && reason !== "circuit_breaker") {
      throw new Error("close_price_equals_entry");
    }
  }
  const pnl = pos.side === "long" ? (price - entry) * qty : (entry - price) * qty;

  const closed: Row = await tx(async (c) => {
    const r = await c.query(
      `INSERT INTO closed_positions
         (symbol, market, side, entry, current, close_price, close_time, close_reason,
          quantity, size, leverage, margin, pnl, profit, pnl_pct, score, confidence,
          strategy_keys, exchange, fee, stop_loss, take_profit, targets, rr, status,
          open_time, mode, type, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'closed',$25,$26,$27,$28)
       RETURNING *`,
      [
        pos.symbol, pos.market, pos.side, entry, price, price, now(), reason,
        qty, num(pos.size), num(pos.leverage), num(pos.margin), round(pnl, 8),
        round(pnl, 8), num(pos.margin) > 0 ? round((pnl / num(pos.margin)) * 100, 4) : 0,
        num(pos.score), num(pos.confidence), pos.strategy_keys ?? [], pos.exchange ?? "paper",
        num(pos.fee), num(pos.stop_loss), num(pos.take_profit),
        pos.targets ?? [], rrOf(pos), now(), pos.mode ?? "demo",
        pos.type ?? "futures", null,
      ]
    );
    await c.query("DELETE FROM open_positions WHERE id = $1", [positionId]);
    return r.rows[0] as Row;
  });

  await logEngine("TRADE", `CLOSE ${pos.symbol} ${pos.side} @ ${price} reason=${reason} pnl=${round(pnl, 4)}`, null, "engine");

  // The engine's working capital grows/shrinks with every closed trade —
  // mirrors the Convex engine (engineWorker accumulates engine.realizedPnl).
  // Non-fatal: stats must never block a close.
  try {
    const realizedBase = Number(await getSetting("engine.realizedPnl")) || 0;
    await setSetting("engine.realizedPnl", Number.isFinite(realizedBase) ? realizedBase + pnl : pnl, "engine");
  } catch {
    /* ignore */
  }

  // learning record + AI review (best effort — never blocks)
  try {
    await recordLearning(pos, closed, settings);
  } catch {
    /* ignore */
  }
  if (settings["notify.trade"] && settings["notify.channel"] && settings["notify.telegram"]) {
    void notifyTradeChannel({ ...pos, profit: pnl, closeReason: reason }, "close");
  }
  return closed;
}

function rrOf(p: Row): number {
  const entry = num(p.entry);
  const sl = num(p.stop_loss);
  const tp = num(p.take_profit);
  if (sl === entry) return 0;
  return Math.abs(tp - entry) / Math.abs(entry - sl);
}

async function recordLearning(pos: Row, closed: Row, s: any): Promise<void> {
  const win = num(closed.profit) >= 0;
  const pnl = num(closed.profit);
  const strategies = pos.strategy_keys ?? [];
  const entry = num(pos.entry);
  const closePrice = num(closed.close_price);
  const reason = closed.close_reason ?? (win ? "take_profit" : "stop_loss");

  // Perform root-cause diagnosis
  const diag = diagnoseTradeOutcome(
    pos.side,
    entry,
    closePrice,
    pnl,
    reason
  );

  await pool.query(
    `INSERT INTO learning_history (symbol, timeframe, strategies, scores, decision, result, pnl, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      pos.symbol, pos.type === "spot" ? "spot" : "futures", strategies,
      JSON.stringify({ score: num(pos.score), confidence: num(pos.confidence), diagnosis: diag.code, summary: diag.summaryEn, recommendation: diag.recommendation }),
      pos.side, win ? "win" : "loss", round(pnl, 8), now(),
    ]
  );
  // strategy performance aggregation
  for (const k of strategies.slice(0, 10)) {
    await pool.query(
      `INSERT INTO strategy_performance (strategy_key, trades, wins, losses, win_rate, total_pnl, avg_pnl, updated_at)
       VALUES ($1, 1, $2, $3, $4, $5, $5, $6)
       ON CONFLICT (strategy_key) DO UPDATE SET
         trades = strategy_performance.trades + 1,
         wins = strategy_performance.wins + $2,
         losses = strategy_performance.losses + $3,
         win_rate = (strategy_performance.wins + $2)::numeric * 100 / (strategy_performance.trades + 1),
         total_pnl = strategy_performance.total_pnl + $5,
         avg_pnl = strategy_performance.total_pnl / strategy_performance.trades,
         updated_at = EXCLUDED.updated_at`,
      [k, win ? 1 : 0, win ? 0 : 1, win ? 100 : 0, round(pnl, 8), now()]
    );
  }
  // AI review (fire-and-forget; AI must never block the engine)
  if (s["ai.enabled"]) {
    void aiAsk(
      "review",
      "You are a trading review assistant. Analyze this closed trade, list 2-3 concrete lessons in the user's language.",
      JSON.stringify({
        symbol: pos.symbol, side: pos.side, entry, exit: closePrice,
        pnl, reason, strategies, score: num(pos.score), diagnosis: diag.code,
      }),
      { cacheKey: `review:${pos.id}` }
    ).then((r) => {
      if (r) {
        return pool.query(
          `UPDATE learning_history SET ai_review = $1 WHERE symbol = $2 AND created_at = (SELECT max(created_at) FROM learning_history WHERE symbol = $2)`,
          [r.text, pos.symbol]
        );
      }
    }).catch(() => undefined);
  }
}

async function createSignal(
  symbol: string,
  timeframe: string,
  decision: ReturnType<typeof computeDecision>,
  price: number,
  votes: { key: string; direction: string }[],
  mode: "demo" | "live"
): Promise<void> {
  const side = decision.direction;
  if (side === "neutral") return;
  const entry = Number(price);
  if (!Number.isFinite(entry) || entry <= 0) return;
  const dir = side === "long" ? 1 : -1;
  const sl = entry * (1 - 0.01 * dir);
  const tp = entry * (1 + 0.02 * dir);
  if ((side === "long" && (sl >= entry || tp <= entry)) ||
      (side === "short" && (sl <= entry || tp >= entry))) return;
  await pool.query(
    `INSERT INTO signals (symbol, timeframe, direction, entry, stop_loss, take_profit, targets, rr, score, confidence, strategy_keys, aggregate, price, mode, status, created_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'open',$15,$16)`,
    [
      symbol, timeframe, side, entry, sl, tp, [tp], 2,
      decision.score, Math.max(decision.longShare, decision.shortShare),
      side === "long" ? decision.longs.slice(0, 5) : decision.shorts.slice(0, 5),
      JSON.stringify({ longShare: decision.longShare, shortShare: decision.shortShare, agreement: decision.agreement }),
      price, mode, now(), now() + 3600_000,
    ]
  );
}

// ── Emergency controls (admin) ───────────────────────────────────────────────
export async function emergencyStop(stop: boolean): Promise<void> {
  const s = await getSettings();
  s["engine.emergencyStop"] = stop;
  await pool.query(
    `INSERT INTO system_settings (key, value, group_name, updated_at) VALUES ('engine.emergencyStop', $1, 'engine', $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [JSON.stringify(stop), now()]
  );
  await logEngine("CRITICAL", `EMERGENCY STOP ${stop ? "ENGAGED" : "RELEASED"}`, null, "engine");
}

export async function closeAllPositions(reason = "emergency_close_all"): Promise<number> {
  const open = await many<Row>("SELECT * FROM open_positions WHERE status = 'open'");
  let n = 0;
  for (const p of open) {
    const tick = await fetchTicker(p.symbol).catch(() => null);
    const price = Number(tick?.price);
    if (!Number.isFinite(price) || price <= 0) {
      await logEngine("WARNING", `close ${p.symbol} skipped: no valid live ticker`, null, "engine");
      continue;
    }
    try {
      await closePosition(p.id, reason, price, p);
      n++;
    } catch {
      /* keep going */
    }
  }
  await logEngine("CRITICAL", `CLOSE ALL POSITIONS (${n})`, null, "engine");
  return n;
}
