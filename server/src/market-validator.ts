// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — Market Condition & Pre-Trade Validation Engine
//   · Market Regime Detection (Trending Bull/Bear, Ranging Choppy, Volatility Expansion)
//   · Pre-Trade Safety Gates (Regime alignment, Exhaustion, Volume health, MTF bias)
//   · Dynamic ATR-bounded Stop Loss & Take Profit Geometry
//   · Execution Logging & Loss Root Cause Attribution
// ─────────────────────────────────────────────────────────────────────────────

export type MarketRegime = "TRENDING_BULL" | "TRENDING_BEAR" | "RANGING_CHOPPY" | "VOLATILITY_EXPANSION";

export interface MarketMetrics {
  price: number;
  ema9: number;
  ema21: number;
  ema50: number;
  ema200?: number;
  rsi: number;
  atr: number;
  adx?: number;
  bbUpper: number;
  bbLower: number;
  bbMid: number;
  volLast: number;
  volAvg: number;
  trend: "bull" | "bear" | "neutral" | "up" | "down" | "range";
  htfTrend?: "bull" | "bear" | "neutral" | "up" | "down" | "range";
}

export interface ValidationResult {
  allowed: boolean;
  regime: MarketRegime;
  scorePenalty: number;
  reasons: string[];
  blockReason?: string;
  adjustedSl?: number;
  adjustedTp?: number;
  rr?: number;
  diagnostics: {
    regime: MarketRegime;
    isExhausted: boolean;
    isVolumeHealthy: boolean;
    isMtfAligned: boolean;
    bbBandwidthPct: number;
    atrPct: number;
    volRatio: number;
  };
}

/**
 * Classifies market regime based on indicators, moving averages, and volatility.
 */
export function detectMarketRegime(m: MarketMetrics): MarketRegime {
  const p = m.price;
  const bbWidth = (m.bbUpper - m.bbLower) / Math.max(1e-9, m.bbMid || p);
  const volRatio = m.volumeRatio !== undefined
    ? m.volumeRatio
    : m.volAvg !== undefined && m.volAvg > 0
      ? (m.volLast ?? 0) / m.volAvg
      : 1;
  const atrPct = m.atr / Math.max(1e-9, p);

  // Volatility expansion: ATR surge or heavy volume breakout with widening bands
  if (volRatio >= 2.0 && atrPct > 0.015 && bbWidth > 0.03) {
    return "VOLATILITY_EXPANSION";
  }

  const emaFast = m.emaFast ?? m.ema9 ?? p;
  const emaSlow = m.emaSlow ?? m.ema21 ?? p;
  const trend = m.trend ?? (emaFast > emaSlow ? "up" : emaFast < emaSlow ? "down" : "range");

  // Strong Bullish Trend
  const isEmaBull = emaFast > emaSlow && p >= emaSlow;
  const isTrendBull = trend === "bull" || trend === "up";
  if (isEmaBull && isTrendBull && m.rsi >= 48) {
    return "TRENDING_BULL";
  }

  // Strong Bearish Trend
  const isEmaBear = emaFast < emaSlow && p <= emaSlow;
  const isTrendBear = trend === "bear" || trend === "down";
  if (isEmaBear && isTrendBear && m.rsi <= 52) {
    return "TRENDING_BEAR";
  }

  // Range / Choppy: narrow Bollinger bands, flat EMAs, or RSI oscillating around 50
  if (bbWidth < 0.015 || (Math.abs(m.rsi - 50) < 8 && Math.abs(emaFast - emaSlow) / p < 0.002)) {
    return "RANGING_CHOPPY";
  }

  // Default fallback based on trend
  if (isTrendBull) return "TRENDING_BULL";
  if (isTrendBear) return "TRENDING_BEAR";
  return "RANGING_CHOPPY";
}

/**
 * Verifies if a given trade direction and strategy family is appropriate for current market conditions.
 */
export function validateMarketConditions(
  dir: "long" | "short",
  m: MarketMetrics,
  rawSl: number,
  rawTp: number,
  strategyFamilies: string[] = [],
  minRR = 1.2
): ValidationResult {
  const p = m.price;
  const regime = detectMarketRegime(m);
  const reasons: string[] = [];
  let scorePenalty = 0;

  const bbBandwidthPct = ((m.bbUpper - m.bbLower) / Math.max(1e-9, m.bbMid || p)) * 100;
  const atrPct = (m.atr / Math.max(1e-9, p)) * 100;
  const volRatio = m.volumeRatio !== undefined
    ? m.volumeRatio
    : m.volAvg !== undefined && m.volAvg > 0
      ? (m.volLast ?? 0) / m.volAvg
      : 1;

  // 1. Exhaustion Gate (Strict protection against buying the exact top or selling the bottom)
  let isExhausted = false;
  if (dir === "long") {
    if (m.rsi > 78) {
      isExhausted = true;
      return {
        allowed: false,
        regime,
        scorePenalty: 100,
        reasons: ["RSI severely overbought (>78) - long trade blocked at extreme exhaustion"],
        blockReason: "EXHAUSTION_RSI_OVERBOUGHT",
        diagnostics: { regime, isExhausted, isVolumeHealthy: true, isMtfAligned: true, bbBandwidthPct, atrPct, volRatio },
      };
    }
    if (m.rsi > 72 && p > m.bbUpper * 1.01) {
      isExhausted = true;
      return {
        allowed: false,
        regime,
        scorePenalty: 100,
        reasons: ["Price extended above upper Bollinger Band with RSI > 72 - overbought risk"],
        blockReason: "EXHAUSTION_BB_UPPER_EXTENDED",
        diagnostics: { regime, isExhausted, isVolumeHealthy: true, isMtfAligned: true, bbBandwidthPct, atrPct, volRatio },
      };
    }
  } else {
    if (m.rsi < 22) {
      isExhausted = true;
      return {
        allowed: false,
        regime,
        scorePenalty: 100,
        reasons: ["RSI severely oversold (<22) - short trade blocked at extreme exhaustion"],
        blockReason: "EXHAUSTION_RSI_OVERSOLD",
        diagnostics: { regime, isExhausted, isVolumeHealthy: true, isMtfAligned: true, bbBandwidthPct, atrPct, volRatio },
      };
    }
    if (m.rsi < 28 && p < m.bbLower * 0.99) {
      isExhausted = true;
      return {
        allowed: false,
        regime,
        scorePenalty: 100,
        reasons: ["Price extended below lower Bollinger Band with RSI < 28 - oversold risk"],
        blockReason: "EXHAUSTION_BB_LOWER_EXTENDED",
        diagnostics: { regime, isExhausted, isVolumeHealthy: true, isMtfAligned: true, bbBandwidthPct, atrPct, volRatio },
      };
    }
  }

  // 2. Volume Health Gate
  const isVolumeHealthy = volRatio >= 0.25;
  if (!isVolumeHealthy) {
    return {
      allowed: false,
      regime,
      scorePenalty: 80,
      reasons: ["Volume drought: insufficient market liquidity to execute safely"],
      blockReason: "VOLUME_DROUGHT",
      diagnostics: { regime, isExhausted, isVolumeHealthy, isMtfAligned: true, bbBandwidthPct, atrPct, volRatio },
    };
  }

  // 3. Higher Timeframe (MTF) Bias Alignment
  const htf = m.htfTrend ? (m.htfTrend === "bull" || m.htfTrend === "up" ? "long" : m.htfTrend === "bear" || m.htfTrend === "down" ? "short" : "neutral") : "neutral";
  const isMtfAligned = htf === "neutral" || htf === dir;
  if (!isMtfAligned && htf !== "neutral") {
    // If trade directly counters HTF macro trend, penalize heavily unless strong reversal confirmation exists
    scorePenalty += 20;
    reasons.push(`Counter-HTF: Trade ${dir} opposes ${htf} macro trend`);
  }

  // 4. Regime vs Strategy Compatibility Check
  const hasTrendStrat = strategyFamilies.some((f) => f.includes("trend") || f.includes("supertrend") || f.includes("cross") || f.includes("ema"));
  const hasMeanRevStrat = strategyFamilies.some((f) => f.includes("mean") || f.includes("bb") || f.includes("rsi2") || f.includes("zscore"));

  if (regime === "RANGING_CHOPPY" && hasTrendStrat && !hasMeanRevStrat) {
    scorePenalty += 15;
    reasons.push("Choppy/Ranging regime degrades trend-following reliability");
  }

  if ((regime === "TRENDING_BULL" && dir === "short") || (regime === "TRENDING_BEAR" && dir === "long")) {
    scorePenalty += 25;
    reasons.push(`Counter-trend entry against strong ${regime} market structure`);
  }

  // 5. Dynamic ATR-Bounded Stop Loss & Take Profit Geometry
  const minSlDist = Math.max(p * 0.0035, m.atr * 1.1); // minimum 0.35% or 1.1x ATR to prevent noise whipsaws
  const maxSlDist = Math.max(p * 0.035, m.atr * 3.5);  // maximum 3.5% or 3.5x ATR to prevent unbounded risk

  let slDist = Math.abs(p - rawSl);
  let adjustedSl = rawSl;

  if (slDist < minSlDist) {
    slDist = minSlDist;
    adjustedSl = dir === "long" ? p - minSlDist : p + minSlDist;
    reasons.push("SL widened to minimum ATR safety floor to protect against market noise");
  } else if (slDist > maxSlDist) {
    slDist = maxSlDist;
    adjustedSl = dir === "long" ? p - maxSlDist : p + maxSlDist;
    reasons.push("SL capped at maximum safe ATR distance");
  }

  // Ensure TP offers at least minRR
  let tpDist = Math.abs(rawTp - p);
  let adjustedTp = rawTp;
  if (tpDist / slDist < minRR) {
    tpDist = slDist * minRR;
    adjustedTp = dir === "long" ? p + tpDist : p - tpDist;
    reasons.push(`TP adjusted to meet minimum ${minRR} Risk-to-Reward ratio`);
  }

  const finalRR = Number((tpDist / Math.max(1e-9, slDist)).toFixed(2));

  // Exit direction sanity
  if ((dir === "long" && (adjustedSl >= p || adjustedTp <= p)) || (dir === "short" && (adjustedSl <= p || adjustedTp >= p))) {
    return {
      allowed: false,
      regime,
      scorePenalty: 100,
      reasons: ["Invalid exit geometry (SL/TP inverted)"],
      blockReason: "INVALID_EXIT_GEOMETRY",
      diagnostics: { regime, isExhausted, isVolumeHealthy, isMtfAligned, bbBandwidthPct, atrPct, volRatio },
    };
  }

  return {
    allowed: true,
    regime,
    scorePenalty,
    reasons,
    adjustedSl,
    adjustedTp,
    rr: finalRR,
    diagnostics: {
      regime,
      isExhausted,
      isVolumeHealthy,
      isMtfAligned,
      bbBandwidthPct,
      atrPct,
      volRatio,
    },
  };
}

/**
 * Diagnoses closed trades to identify root causes of wins and losses.
 */
export function diagnoseTradeOutcome(
  side: "long" | "short",
  entry: number,
  exitPrice: number,
  pnl: number,
  closeReason: string,
  entryRegime?: MarketRegime
): {
  code: string;
  summaryFa: string;
  summaryEn: string;
  recommendation: string;
} {
  const isWin = pnl > 0;
  if (isWin) {
    if (closeReason === "take_profit") {
      return {
        code: "WIN_TP_HIT",
        summaryFa: "معامله با موفقیت به حد سود برخورد کرد.",
        summaryEn: "Trade hit full Take Profit target according to plan.",
        recommendation: "Maintain current setup parameters and momentum filters.",
      };
    }
    return {
      code: "WIN_TRAILED_OR_LOCKED",
      summaryFa: "سود معامله با تریلینگ استاپ یا قفل سود ذخیره شد.",
      summaryEn: "Profit secured via trailing stop or dynamic profit lock.",
      recommendation: "Trailing mechanics functioning as intended.",
    };
  }

  // Loss Diagnosis
  if (closeReason === "stop_loss") {
    if (entryRegime === "RANGING_CHOPPY") {
      return {
        code: "LOSS_CHOPPY_REGIME_WHIPSAW",
        summaryFa: "ضرر ناشی از نوسان فرسایشی و سایدوی بازار (شلاق قیمتی).",
        summaryEn: "Loss caused by choppy/ranging market whipsaw.",
        recommendation: "Increase ADX threshold and filter out breakout setups during low volatility.",
      };
    }
    return {
      code: "LOSS_STOP_LOSS_HIT",
      summaryFa: "معامله به حد ضرر برخورد کرد (نوسان نامطلوب یا برگشت روند).",
      summaryEn: "Trade hit stop loss due to adverse price action or trend reversal.",
      recommendation: "Ensure stops are placed beyond key structural invalidation levels.",
    };
  }

  return {
    code: "CLOSED_NORMAL",
    summaryFa: "معامله بسته شد.",
    summaryEn: `Trade closed with reason: ${closeReason}`,
    recommendation: "Review trade history.",
  };
}
