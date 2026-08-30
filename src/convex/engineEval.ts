// ---------------------------------------------------------------------------
// WOLF strategy evaluator + weighted aggregation.
// Each strategy family maps to deterministic rules over EngineFeatures.
// The final decision is a WEIGHTED aggregation (weight × strength × timeframe
// multiplier), never a simple vote count.
// ---------------------------------------------------------------------------
import type { Candle, EngineFeatures } from "./engineCore";
import { computeFeatures } from "./engineCore";

export interface StrategyResult {
  key: string;
  family: string;
  nameFa: string;
  dir: number; // +1 long, -1 short, 0 neutral
  strength: number; // 0..1
  weight: number;
}

export interface AggregatedSignal {
  direction: "long" | "short" | "neutral";
  score: number; // 0..100
  confidence: number; // 0..1
  contribution: Array<{ key: string; nameFa: string; dir: number; strength: number }>;
  independentConfirmations: number;
  confirmingGroups: string[];
  consensus: number; // dominant directional support / all directional support
  quality: number; // weighted strength of the dominant side, 0..1
  conflict: boolean;
  reasonFa: string;
  reasons: string[];
}

type EvalOut = { dir: number; strength: number };

export function evaluateFamily(family: string, f: EngineFeatures): EvalOut {
  const p = f.price;
  const s = (dir: number, strength: number): EvalOut => ({
    dir,
    strength: Math.max(0, Math.min(1, strength)),
  });
  const near = (lvl: number, tol: number) => Math.abs(p - lvl) / p < tol;

  switch (family) {
    // ── price action ───────────────────────────────────────────────────
    case "pa_pinbar": {
      const c = f.candles[f.candles.length - 1];
      const wick = c.h - c.l;
      const body = Math.abs(c.c - c.o);
      if (body > 0 && wick > body * 2) {
        if (Math.min(c.o, c.c) - c.l > wick * 0.6) return s(1, 0.7);
        if (c.h - Math.max(c.o, c.c) > wick * 0.6) return s(-1, 0.7);
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
      if (c.h < prev.h && c.l > prev.l) return s(c.c > c.o ? 1 : -1, 0.45);
      return s(0, 0);
    }
    case "pa_fakey": {
      const c = f.candles[f.candles.length - 1];
      const prev = f.candles[f.candles.length - 2];
      if (!prev || (c.h - c.l) / p < 0.002) return s(0, 0);
      if (c.h > f.donchUpper && c.c < c.o) return s(-1, 0.55);
      if (c.l < f.donchLower && c.c > c.o) return s(1, 0.55);
      return s(0, 0);
    }
    case "pa_hammershooting": {
      const c = f.candles[f.candles.length - 1];
      const body = Math.abs(c.c - c.o);
      const ran = c.h - c.l;
      if (ran === 0) return s(0, 0);
      if (body < ran * 0.4 && Math.min(c.o, c.c) - c.l > ran * 0.6 && f.trend === "down") return s(1, 0.6);
      if (body < ran * 0.4 && c.h - Math.max(c.o, c.c) > ran * 0.6 && f.trend === "up") return s(-1, 0.6);
      return s(0, 0);
    }
    case "pa_doji": {
      const c = f.candles[f.candles.length - 1];
      if (Math.abs(c.c - c.o) / p < 0.0005) {
        if (f.trend === "down") return s(1, 0.5);
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
      if (f.swingsA > f.swingsB) return s(1, p > Math.max(f.swingsA, f.swingsB) ? 0.65 : 0.3);
      return s(-1, p < Math.min(f.swingsA, f.swingsB) ? 0.65 : 0.3);
    }
    case "pat_headshoulder": {
      const lows = f.structure.lows;
      if (lows.length >= 2) {
        const neck = (lows[lows.length - 2] + lows[lows.length - 1]) / 2;
        return s(-1, p < neck ? 0.7 : 0.25);
      }
      return s(0, 0);
    }
    case "pat_triangle": {
      const last40 = f.candles.slice(-40);
      const hi = Math.max(...last40.map((c) => c.h));
      const lo = Math.min(...last40.map((c) => c.l));
      const contracting = (hi - lo) / p < 0.01;
      return s(p >= f.donchUpper ? 1 : -1, contracting ? 0.6 : 0.4);
    }
    case "pat_wedge": {
      const highs = f.structure.highs;
      const lows = f.structure.lows;
      const wedgeUp = highs.length >= 2 && lows.length >= 2 && highs[highs.length - 1] < highs[highs.length - 2] && lows[lows.length - 1] > lows[lows.length - 2];
      const wedgeDown = highs.length >= 2 && lows.length >= 2 && highs[highs.length - 1] > highs[highs.length - 2] && lows[lows.length - 1] < lows[lows.length - 2];
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
      const highs = f.structure.highs;
      const lows = f.structure.lows;
      if (highs.length >= 2 && lows.length >= 2 && highs[highs.length - 1] > highs[highs.length - 2] && f.trend === "up" && p > lows[lows.length - 1]) {
        return s(1, 0.55);
      }
      return s(0, 0);
    }

    // ── trend following ────────────────────────────────────────────────
    case "trend_ema": {
      const up = f.ema9 > f.ema21 && f.ema21 > f.ema50;
      const dn = f.ema9 < f.ema21 && f.ema21 < f.ema50;
      // Relaxed: fire on alignment even if not at exact pullback level.
      if (up) return s(1, p <= f.ema21 * 1.01 ? 0.75 : 0.55);
      if (dn) return s(-1, p >= f.ema21 * 0.99 ? 0.75 : 0.55);
      // Weak alignment: EMA order partially aligned
      if (f.ema9 > f.ema21) return s(1, 0.35);
      if (f.ema9 < f.ema21) return s(-1, 0.35);
      return s(0, 0);
    }
    case "trend_cross": {
      const prevClose = f.closes[f.closes.length - 2];
      // Relaxed: fire on alignment direction, stronger if crossover.
      if (f.ema9 > f.ema21) {
        if (prevClose <= f.ema21) return s(1, 0.7);
        return s(1, 0.45);
      }
      if (f.ema9 < f.ema21) {
        if (prevClose >= f.ema21) return s(-1, 0.7);
        return s(-1, 0.45);
      }
      return s(0, 0);
    }
    case "trend_macd":
    case "mom_macdhist": {
      // Relaxed: fire on MACD histogram direction, stronger with trend alignment.
      if (f.macdHist > 0) {
        const grow = Math.abs(f.macdHist) > Math.abs(f.macdHistPrev);
        return s(1, grow ? 0.65 : 0.45);
      }
      if (f.macdHist < 0) {
        const grow = Math.abs(f.macdHist) > Math.abs(f.macdHistPrev);
        return s(-1, grow ? 0.65 : 0.45);
      }
      return s(0, 0);
    }
    case "trend_supertrend": {
      // Relaxed: fire on price vs EMA50 + MACD alignment.
      if (p > f.ema50) return s(1, f.macdHist > 0 ? 0.65 : 0.4);
      if (p < f.ema50) return s(-1, f.macdHist < 0 ? 0.65 : 0.4);
      return s(0, 0);
    }
    case "trend_adx": {
      // Relaxed: fire on any ROC direction, stronger with higher magnitude.
      if (f.rocV > 0) return s(1, Math.min(0.65, 0.35 + Math.abs(f.rocV) * 0.3));
      if (f.rocV < 0) return s(-1, Math.min(0.65, 0.35 + Math.abs(f.rocV) * 0.3));
      return s(0, 0);
    }
    case "trend_psar": {
      // Relaxed: fire on EMA alignment alone.
      if (f.ema9 > f.ema50) return s(1, f.trend === "up" ? 0.6 : 0.4);
      if (f.ema9 < f.ema50) return s(-1, f.trend === "down" ? 0.6 : 0.4);
      return s(0, 0);
    }
    case "trend_channel": {
      // Relaxed: fire when near channel boundaries.
      if (p < f.donchLower * 1.01) return s(1, 0.6);
      if (p > f.donchUpper * 0.99) return s(-1, 0.6);
      return s(0, 0);
    }

    // ── momentum ───────────────────────────────────────────────────────
    case "mom_rsi": {
      // Relaxed: fire on RSI direction, stronger with MACD confirmation.
      if (f.rsi14 > 50 && f.macdHist > 0) return s(1, f.rsi14 > 60 ? 0.6 : 0.4);
      if (f.rsi14 < 50 && f.macdHist < 0) return s(-1, f.rsi14 < 40 ? 0.6 : 0.4);
      return s(0, 0);
    }
    case "mom_stoch": {
      if (f.k > f.d && f.k > 20 && f.k < 80 && f.macdHist > 0) return s(1, 0.5);
      if (f.k < f.d && f.k > 20 && f.k < 80 && f.macdHist < 0) return s(-1, 0.5);
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
      // Relaxed: fire when price is near or outside Bollinger Bands.
      if (p <= f.bbLower * 1.003) return s(1, 0.65);
      if (p >= f.bbUpper * 0.997) return s(-1, 0.65);
      // Near bands: weaker signal.
      if (p < f.bbLower * 1.015) return s(1, 0.4);
      if (p > f.bbUpper * 0.985) return s(-1, 0.4);
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
      if (Math.abs(gap) / p > 0.002) return s(gap > 0 ? -1 : 1, 0.5);
      return s(0, 0);
    }

    // ── breakout ───────────────────────────────────────────────────────
    case "brk_consolidation": {
      if ((f.donchUpper - f.donchLower) / p < 0.006 && f.volScore > 0.5) {
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
      const lvl = nearestP(f.levels, p, 0.004);
      if (lvl !== null && p >= lvl && f.donchUpper <= p) return s(1, 0.6);
      if (lvl !== null && p <= lvl && f.donchLower >= p) return s(-1, 0.6);
      return s(0, 0);
    }
    case "brk_volatility": {
      if ((f.bbUpper - f.bbLower) / p < 0.008 && f.volScore > 0.5) return s(p > f.bbMid ? 1 : -1, 0.6);
      return s(0, 0);
    }
    case "brk_move": {
      if (f.volScore > 0.6 && f.rsi14 > 60 && f.macdHist > 0) return s(1, 0.55);
      if (f.volScore > 0.6 && f.rsi14 < 40 && f.macdHist < 0) return s(-1, 0.55);
      return s(0, 0);
    }

    // ── scalping ───────────────────────────────────────────────────────
    case "scalp_snr": {
      const lvl = nearestP(f.levels, p, 0.002);
      if (lvl !== null && p < lvl * 1.002 && f.rsi14 < 40) return s(1, 0.55);
      if (lvl !== null && p > lvl * 0.998 && f.rsi14 > 60) return s(-1, 0.55);
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
      const lvl = nearestP(f.levels, p, 0.004);
      if (lvl !== null && p < lvl && f.rsi14 > 50 && f.ema9 > f.ema21) return s(1, 0.7);
      if (lvl !== null && p > lvl && f.rsi14 < 50 && f.ema9 < f.ema21) return s(-1, 0.7);
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
      if (c.h <= prev.h && c.l >= prev.l) {
        if (prev.c > prev.o) return s(1, 0.5);
        if (prev.c < prev.o) return s(-1, 0.5);
      }
      return s(0, 0);
    }

    // ── SMC / ICT ──────────────────────────────────────────────────────
    case "smc_ob": {
      const z = fZone(f, ["ob_up", "ob_down"]);
      if (z) return s(z.kind.includes("up") ? 1 : -1, 0.65);
      return s(0, 0);
    }
    case "smc_fvg": {
      const z = fZone(f, ["fvg_up", "fvg_down"]);
      if (z) return s(z.kind.includes("up") ? 1 : -1, 0.65);
      return s(0, 0);
    }
    case "smc_liquidity": {
      const liq = f.liquidityScore;
      if (liq !== 0) return s(liq > 0 ? 1 : -1, f.structure.choch ? 0.7 : 0.4);
      return s(0, 0);
    }
    case "smc_mitigation":
    case "smc_breaker": {
      const z = fZone(f, ["ob_up", "ob_down"]);
      if (z && f.trend !== "range") return s(z.kind.includes("up") ? 1 : -1, 0.6);
      return s(0, 0);
    }
    case "smc_imbalance": {
      const z = fZone(f, ["fvg_up", "fvg_down"]);
      if (z && ((z.kind.includes("up") && f.macdHist > 0) || (z.kind.includes("down") && f.macdHist < 0))) {
        return s(z.kind.includes("up") ? 1 : -1, 0.55);
      }
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
      if (p >= f.donchLower + range * 0.618 && p <= f.donchLower + range * 0.786 && f.macdHist > 0) return s(1, 0.6);
      if (p >= f.donchUpper - range * 0.786 && p <= f.donchUpper - range * 0.618 && f.macdHist < 0) return s(-1, 0.6);
      return s(0, 0);
    }
    case "ict_silverbullet": {
      const h = new Date().getUTCHours();
      if (h >= 7 && h <= 10) {
        const z = fZone(f, ["fvg_up", "fvg_down"]);
        if (z) return s(z.kind.includes("up") ? 1 : -1, 0.65);
      }
      return s(0, 0);
    }
    case "ict_power3": {
      return s(f.macdHist > 0 && f.rsi14 > 50 ? 1 : f.macdHist < 0 && f.rsi14 < 50 ? -1 : 0, 0.5);
    }
    case "ict_smart": {
      if (f.trend === "down") {
        const z = fZone(f, ["ob_up"]);
        if (z) return s(1, 0.55);
      }
      if (f.trend === "up") {
        const z = fZone(f, ["ob_down"]);
        if (z) return s(-1, 0.55);
      }
      return s(0, 0);
    }
    case "ict_judas": {
      const c = f.candles[f.candles.length - 1];
      const ran = c.h - c.l;
      if (ran !== 0 && Math.abs(c.c - c.o) / ran < 0.25 && f.volScore > 0.4) return s(1, 0.5);
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
      const avg = f.atrV;
      const zX = avg === 0 ? 0 : (atrPct - avg / p) / (avg / p);
      if (zX > 0.8 && f.trend === "up") return s(1, 0.5);
      if (zX > 0.8 && f.trend === "down") return s(-1, 0.5);
      return s(0, 0);
    }
    case "vola_bbsqueeze": {
      if ((f.bbUpper - f.bbLower) / p < 0.01 && f.volScore > 0.5) return s(p > f.bbMid ? 1 : -1, 0.65);
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
      return s(0, 0);
    }
    case "vola_range": {
      if ((f.donchUpper - f.donchLower) / p < 0.005) return s(0, 0);
      return s(p > f.bbMid ? 1 : -1, 0.45);
    }
    case "vola_funnel": {
      const last5 = f.candles.slice(-5);
      if (last5.length < 5) return s(0, 0);
      const r1 = (last5[0].h - last5[0].l) / p;
      const r5 = (last5[4].h - last5[4].l) / p;
      if (r5 < r1 * 0.6) return s(f.trend === "up" ? 1 : -1, 0.55);
      return s(0, 0);
    }

    // ── support / resistance ───────────────────────────────────────────
    case "sr_levels": {
      const lvl = nearestP(f.levels, p, 0.005);
      if (lvl !== null && p <= lvl * 1.006 && f.rsi14 > 50 && f.trend !== "down") return s(1, 0.7);
      if (lvl !== null && p >= lvl * 0.994 && f.rsi14 < 50 && f.trend !== "up") return s(-1, 0.7);
      return s(0, 0);
    }
    case "sr_pivot": {
      const lvl = nearestP(f.levels, p, 0.003);
      if (lvl !== null && p > lvl && f.rsi14 > 50) return s(1, 0.5);
      if (lvl !== null && p < lvl && f.rsi14 < 50) return s(-1, 0.5);
      return s(0, 0);
    }
    case "sr_fib": {
      const range = f.donchUpper - f.donchLower;
      if (p <= (f.donchLower + range * 0.382) * 1.01 && f.trend === "up") return s(1, 0.6);
      if (p >= (f.donchUpper - range * 0.382) * 0.99 && f.trend === "down") return s(-1, 0.6);
      return s(0, 0);
    }
    case "sr_round": {
      const mag = p >= 100 ? 1 : p >= 1 ? 2 : 4;
      const round = Math.round(p / 10 ** mag) * 10 ** mag;
      if (near(round, 0.001) && f.rsi14 > 55) return s(1, 0.4);
      if (near(round, 0.001) && f.rsi14 < 45) return s(-1, 0.4);
      return s(0, 0);
    }
    case "sr_trendline": {
      const sl30 = (f.ema21 - f.ema9) / f.ema9;
      if (Math.abs(sl30) > 0.002) return s(sl30 > 0 ? 1 : -1, 0.55);
      return s(0, 0);
    }
    case "sr_conger": {
      const cnt = f.levels.filter((l) => Math.abs(p - l) / p < 0.004).length;
      if (cnt >= 2 && f.rsi14 > 50) return s(1, 0.6);
      if (cnt >= 2 && f.rsi14 < 50) return s(-1, 0.6);
      return s(0, 0);
    }
    case "sr_magnet": {
      const lvl = nearestP(f.levels, p, 0.01);
      if (lvl !== null) return s(lvl > p ? 1 : -1, 0.4);
      return s(0, 0);
    }

    // ── multi-timeframe / structure / liquidity / combos ───────────────
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
      if (c.c > c.o && p > f.ema21) return s(1, 0.5);
      if (c.c < c.o && p < f.ema21) return s(-1, 0.5);
      return s(0, 0);
    }
    case "liq_weekend":
      return s(f.momentumScore, 0.45);
    case "liq_poi":
      return s(f.liquidityScore !== 0 ? -f.liquidityScore : f.momentumScore, 0.5);
    case "liq_run":
      return s(p > f.donchUpper && f.volScore > 0.4 ? 1 : p < f.donchLower && f.volScore > 0.4 ? -1 : 0, 0.6);
    case "liq_absorb":
      return s(f.rsi14 < 30 && f.trend === "down" ? 1 : f.rsi14 > 70 && f.trend === "up" ? -1 : 0, 0.5);
    case "combo_ema_rsi": {
      if (f.trendScore > 0 && f.rsi14 > 55 && f.macdHist > 0) return s(1, 0.75);
      if (f.trendScore < 0 && f.rsi14 < 45 && f.macdHist < 0) return s(-1, 0.75);
      return s(0, 0);
    }
    case "combo_macd_bb": {
      if (f.macdHist > 0 && p > f.bbMid && p < f.bbUpper) return s(1, 0.65);
      if (f.macdHist < 0 && p < f.bbMid && p > f.bbLower) return s(-1, 0.65);
      return s(0, 0);
    }
    case "combo_smt":
      return s(f.structure.choch ? (f.trendScore > 0 ? 1 : -1) : 0, 0.5);
    case "combo_trio": {
      const score = f.trendScore + (f.rsi14 - 50) / 50 + f.macdHist * 10;
      return s(Math.sign(score), Math.min(1, Math.abs(score) / 1.5));
    }
    case "combo_wolf": {
      const conflu = (f.structure.mss ? 0.4 : 0) + (f.liquidityScore !== 0 ? 0.3 : 0) + (Math.abs(f.macdHist) > 0 ? 0.3 : 0);
      if (conflu <= 0.4) return s(0, 0);
      const dir = f.liquidityScore > 0 ? 1 : f.liquidityScore < 0 ? -1 : Math.sign(f.trendScore);
      return s(dir, 0.8);
    }
    case "combo_fisher": {
      const dfisher = 2 * ((f.rsi14 - 50) / 50) / (1 + Math.abs(f.rsi14 - 50) / 50);
      if (dfisher > 0.5) return s(1, 0.5);
      if (dfisher < -0.5) return s(-1, 0.5);
      return s(0, 0);
    }
    case "combo_magic": {
      const sum = Math.sign(f.ema9 - f.ema21) + Math.sign(f.rsi14 - 50) + Math.sign(f.macdHist);
      return s(Math.sign(sum), Math.min(1, Math.abs(sum) / 3 + 0.3));
    }
    case "combo_supres": {
      const lvl = nearestP(f.levels, p, 0.005);
      if (lvl !== null && p <= lvl * 1.005 && f.volScore < 0 && f.rsi14 > 55) return s(1, 0.6);
      if (lvl !== null && p >= lvl * 0.995 && f.volScore < 0 && f.rsi14 < 45) return s(-1, 0.6);
      return s(0, 0);
    }
    default:
      return s(0, 0);
  }
}

// helpers -----------------------------------------------------------------

function nearestP(levels: number[], price: number, tol: number): number | null {
  let best: number | null = null;
  let bd = 1;
  for (const l of levels) {
    const d = Math.abs(price - l) / price;
    if (d < bd && d < tol) {
      best = l;
      bd = d;
    }
  }
  return best;
}

function fZone(f: EngineFeatures, kinds: string[]) {
  const all = (f.fvg ?? []).concat(f.obs ?? []);
  const list = all.filter((z) => kinds.includes(z.kind) && f.price >= z.bottom && f.price <= z.top);
  return list.length ? list[list.length - 1] : null;
}

// ─── weighted aggregation ──────────────────────────────────────────────────

export function aggregateStrategies(
  results: StrategyResult[],
  tfWeights: Record<string, number> = {},
): AggregatedSignal {
  type GroupStats = { long: number; short: number; total: number; absNet: number };
  const groups = new Map<string, GroupStats>();
  const contribution: AggregatedSignal["contribution"] = [];

  // Strategies in the same family are correlated. First normalize each
  // family, then aggregate families, so 20 EMA variants cannot drown out one
  // independent structure or volume confirmation.
  for (const r of results) {
    if (r.dir === 0 || r.strength < 0.2) continue;
    const w = Math.max(0.05, r.weight) * (tfWeights[r.key] ?? 1);
    const group = r.family.split("_")[0] || r.family;
    const stats = groups.get(group) ?? { long: 0, short: 0, total: 0, absNet: 0 };
    const evidence = r.strength * w;
    if (r.dir > 0) stats.long += evidence;
    else stats.short += evidence;
    stats.total += w;
    groups.set(group, stats);
    contribution.push({ key: r.key, nameFa: r.nameFa, dir: r.dir, strength: r.strength });
  }

  const groupVotes = [...groups.entries()]
    .map(([group, stats]) => {
      const net = stats.total > 0 ? (stats.long - stats.short) / stats.total : 0;
      return { group, ...stats, net };
    })
    .filter((g) => Math.abs(g.net) >= 0.12);

  const longSupport = groupVotes.reduce((sum, g) => sum + Math.max(0, g.net), 0);
  const shortSupport = groupVotes.reduce((sum, g) => sum + Math.max(0, -g.net), 0);
  const totalSupport = longSupport + shortSupport;
  if (totalSupport === 0 || contribution.length === 0) {
    return {
      direction: "neutral",
      score: 0,
      confidence: 0,
      contribution: [],
      independentConfirmations: 0,
      confirmingGroups: [],
      consensus: 0,
      quality: 0,
      conflict: false,
      reasonFa: "—",
      reasons: [],
    };
  }

  const isLong = longSupport >= shortSupport;
  const dominantSupport = isLong ? longSupport : shortSupport;
  const opposingSupport = isLong ? shortSupport : longSupport;
  const consensus = dominantSupport / totalSupport;
  const dominantGroups = groupVotes.filter((g) => (isLong ? g.net > 0 : g.net < 0));
  const confirmingGroups = dominantGroups.map((g) => g.group);
  const qualityDenominator = dominantGroups.reduce((sum, g) => sum + Math.abs(g.net), 0);
  const quality = dominantGroups.length > 0
    ? dominantGroups.reduce((sum, g) => sum + Math.abs(g.net) * Math.min(1, (g.long + g.short) / Math.max(0.01, g.total)), 0) / Math.max(0.01, qualityDenominator)
    : 0;
  const direction = consensus >= 0.55 ? (isLong ? "long" : "short") : "neutral";
  const independentConfirmations = contribution.filter((c) => c.dir === (isLong ? 1 : -1) && c.strength >= 0.45).length;
  const conflict = opposingSupport / Math.max(0.01, dominantSupport) >= 0.72;

  // Bounded score: consensus is the main signal, quality rewards strong
  // evidence, and breadth requires multiple independent families. It no
  // longer depends on the raw count of 100 correlated strategy rows.
  const breadth = Math.min(1, confirmingGroups.length / 4);
  const score = Math.round(100 * (
    consensus * 0.55 +
    quality * 0.30 +
    breadth * 0.15
  ));
  const confidence = Math.min(1, consensus * 0.7 + quality * 0.3);

  const dominantContribution = contribution
    .filter((c) => c.dir === (isLong ? 1 : -1))
    .sort((a, b) => b.strength - a.strength);
  const top = dominantContribution[0] ?? contribution[0];
  const dirFa = (d: number) => (d > 0 ? "خرید" : "فروش");
  const reasons: string[] = top
    ? [`${top.nameFa} — قدرت ${Math.round(top.strength * 100)}%`]
    : [];
  [...contribution]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5)
    .forEach((c) => reasons.push(`${c.nameFa} (${dirFa(c.dir)}, ${Math.round(c.strength * 100)}%)`));

  return {
    direction,
    score,
    confidence,
    contribution: contribution.slice(0, 12),
    independentConfirmations,
    confirmingGroups,
    consensus,
    quality,
    conflict,
    reasonFa: reasons[0] ?? "—",
    reasons,
  };
}

function weightOf(key: string, results: StrategyResult[]): number {
  const r = results.find((x) => x.key === key);
  return r ? r.weight : 1;
}

/** Evaluates a batch of strategies over one feature snapshot. */
export function evaluateStrategies(
  features: EngineFeatures,
  strategies: Array<{ key: string; family: string; nameFa: string; weight: number }>,
): StrategyResult[] {
  const out: StrategyResult[] = [];
  for (const st of strategies) {
    const r = evaluateFamily(st.family, features);
    out.push({
      key: st.key,
      family: st.family,
      nameFa: st.nameFa,
      dir: r.dir,
      strength: r.strength,
      weight: st.weight,
    });
  }
  return out;
}

/** One-shot analysis: candles → features → votes → aggregated signal. */
export function analyze(candles: Candle[], strategies: Array<{ key: string; family: string; nameFa: string; weight: number }>) {
  const features = computeFeatures(candles);
  const results = evaluateStrategies(features, strategies);
  const aggregate = aggregateStrategies(results);
  return { features, results, aggregate };
}