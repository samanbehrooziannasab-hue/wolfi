// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — Convex Market Condition & Pre-Trade Validator
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

export function detectMarketRegime(m: MarketMetrics): MarketRegime {
  const p = m.price;
  const bbWidth = (m.bbUpper - m.bbLower) / Math.max(1e-9, m.bbMid || p);
  const volRatio = (m as any).volumeRatio !== undefined
    ? (m as any).volumeRatio
    : m.volAvg > 0
      ? m.volLast / m.volAvg
      : 1;
  const atrPct = m.atr / Math.max(1e-9, p);

  if (volRatio >= 2.0 && atrPct > 0.015 && bbWidth > 0.03) {
    return "VOLATILITY_EXPANSION";
  }

  const emaFast = (m as any).emaFast ?? m.ema9 ?? p;
  const emaSlow = (m as any).emaSlow ?? m.ema21 ?? p;
  const trend = m.trend ?? (emaFast > emaSlow ? "up" : emaFast < emaSlow ? "down" : "range");

  const isEmaBull = emaFast > emaSlow && p >= emaSlow;
  const isTrendBull = trend === "bull" || trend === "up";
  if (isEmaBull && isTrendBull && m.rsi >= 48) {
    return "TRENDING_BULL";
  }

  const isEmaBear = emaFast < emaSlow && p <= emaSlow;
  const isTrendBear = trend === "bear" || trend === "down";
  if (isEmaBear && isTrendBear && m.rsi <= 52) {
    return "TRENDING_BEAR";
  }

  if (bbWidth < 0.015 || (Math.abs(m.rsi - 50) < 8 && Math.abs(emaFast - emaSlow) / p < 0.002)) {
    return "RANGING_CHOPPY";
  }

  if (isTrendBull) return "TRENDING_BULL";
  if (isTrendBear) return "TRENDING_BEAR";
  return "RANGING_CHOPPY";
}

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
  const volRatio = m.volAvg > 0 ? m.volLast / m.volAvg : 1;

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

  const isVolumeHealthy = volRatio >= 0.25 || m.volLast > 0;
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

  const isMtfAligned = !m.htfTrend || (dir === "long" ? m.htfTrend === "bull" || m.htfTrend === "up" : m.htfTrend === "bear" || m.htfTrend === "down");
  if (m.htfTrend && !isMtfAligned && m.htfTrend !== "neutral" && m.htfTrend !== "range") {
    scorePenalty += 20;
    reasons.push(`Counter-HTF: Trade ${dir} opposes ${m.htfTrend} macro trend`);
  }

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

  const minSlDist = Math.max(p * 0.0035, m.atr * 1.1);
  const maxSlDist = Math.max(p * 0.035, m.atr * 3.5);

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

  let tpDist = Math.abs(rawTp - p);
  let adjustedTp = rawTp;
  if (tpDist / slDist < minRR) {
    tpDist = slDist * minRR;
    adjustedTp = dir === "long" ? p + tpDist : p - tpDist;
    reasons.push(`TP adjusted to meet minimum ${minRR} Risk-to-Reward ratio`);
  }

  const finalRR = Number((tpDist / Math.max(1e-9, slDist)).toFixed(2));

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
