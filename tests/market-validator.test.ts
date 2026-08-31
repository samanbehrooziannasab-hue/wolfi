// ─── Market Validator unit tests (bun test) ─────────────────────────────────
import { describe, expect, test } from "bun:test";
import {
  detectMarketRegime,
  validateMarketConditions,
  diagnoseTradeOutcome,
  type MarketMetrics,
} from "../server/src/market-validator";

function makeMetrics(overrides: Partial<MarketMetrics> = {}): MarketMetrics {
  return {
    symbol: "BTCUSDT",
    price: 50000,
    rsi: 55,
    adx: 28,
    atr: 500,
    atrPct: 1.0,
    bbUpper: 51000,
    bbLower: 49000,
    bbMid: 50000,
    emaFast: 50200,
    emaSlow: 49800,
    macd: 50,
    macdSig: 20,
    volumeRatio: 1.2,
    trend: "up",
    support: 49200,
    resistance: 51200,
    ...overrides,
  };
}

describe("Market Regime Detection", () => {
  test("detects TRENDING_BULL when EMAs, RSI, and trend align upward", () => {
    const m = makeMetrics({
      emaFast: 50500,
      emaSlow: 49500,
      adx: 30,
      rsi: 60,
      macd: 80,
      macdSig: 30,
      price: 50400,
      trend: "up",
    });
    expect(detectMarketRegime(m)).toBe("TRENDING_BULL");
  });

  test("detects TRENDING_BEAR when EMAs, RSI, and trend align downward", () => {
    const m = makeMetrics({
      emaFast: 49500,
      emaSlow: 50500,
      adx: 32,
      rsi: 40,
      macd: -80,
      macdSig: -30,
      price: 49200,
      trend: "down",
    });
    expect(detectMarketRegime(m)).toBe("TRENDING_BEAR");
  });

  test("detects VOLATILITY_EXPANSION when ATR% and BB bandwidth spike", () => {
    const m = makeMetrics({
      atr: 1200,
      atrPct: 3.5,
      bbUpper: 54000,
      bbLower: 46000,
      volumeRatio: 2.5,
      adx: 18,
    });
    expect(detectMarketRegime(m)).toBe("VOLATILITY_EXPANSION");
  });
});

describe("Market Condition Validation (Pre-Trade Gates)", () => {
  test("blocks long trade on extreme RSI exhaustion (> 75)", () => {
    const m = makeMetrics({ rsi: 79, price: 50800 });
    const result = validateMarketConditions("long", m, 49500, 52000, ["ema_cross"], 85);
    expect(result.allowed).toBe(false);
    expect(result.blockReason).toContain("OVERBOUGHT");
  });

  test("blocks short trade on extreme RSI exhaustion (< 25)", () => {
    const m = makeMetrics({ rsi: 21, price: 49200 });
    const result = validateMarketConditions("short", m, 50500, 48000, ["ema_cross"], 85);
    expect(result.allowed).toBe(false);
    expect(result.blockReason).toContain("OVERSOLD");
  });

  test("blocks trade on volume drought (< 0.25x volume ratio)", () => {
    const m = makeMetrics({ volumeRatio: 0.15, volLast: 0 });
    const result = validateMarketConditions("long", m, 49500, 51500, ["ema_cross"], 85);
    expect(result.allowed).toBe(false);
    expect(result.blockReason).toContain("VOLUME_DROUGHT");
  });

  test("allows sound trade in healthy trending market with dynamic SL adjustment", () => {
    const m = makeMetrics({
      emaFast: 50300,
      emaSlow: 49700,
      adx: 29,
      rsi: 56,
      atr: 400,
      trend: "up",
      support: 49600,
      resistance: 51200,
    });
    const result = validateMarketConditions("long", m, 49600, 51200, ["ema_cross"], 85);
    expect(result.allowed).toBe(true);
    expect(result.adjustedSl).toBeLessThan(50000);
    expect(result.adjustedTp).toBeGreaterThan(50000);
    expect(result.rr).toBeGreaterThanOrEqual(1.2);
  });
});

describe("Trade Outcome Diagnosis", () => {
  test("diagnoses stop loss hit in choppy regime", () => {
    const diag = diagnoseTradeOutcome(
      "long",
      50000,
      49890,
      -11,
      "stop_loss",
      "RANGING_CHOPPY"
    );
    expect(diag.code).toBe("LOSS_CHOPPY_REGIME_WHIPSAW");
    expect(diag.recommendation).toContain("ADX");
  });

  test("diagnoses successful take profit", () => {
    const diag = diagnoseTradeOutcome(
      "long",
      50000,
      51200,
      24,
      "take_profit",
      "TRENDING_BULL"
    );
    expect(diag.code).toBe("WIN_TP_HIT");
  });
});
