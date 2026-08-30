// ─── Backend unit tests (bun test) ─────────────────────────────────────────
// Covers portfolio analytics (src/convex/enginePortfolio.ts): equity curve,
// mark-to-market, performance & risk metrics, position sizing, trailing stop,
// partial close and market-regime detection.
import { describe, expect, test } from "bun:test";
import {
  buildEquityCurve,
  calculatePartialClose,
  calculatePositionSize,
  calculateTrailingStop,
  computePerformanceMetrics,
  computeRiskMetrics,
  detectMarketRegime,
  markToMarket,
} from "../src/convex/enginePortfolio";
import type { Candle } from "../src/convex/engineCore";

function candle(o: number, h: number, l: number, c: number, t = 0): Candle {
  return { t, o, h, l, c, v: 100 };
}

describe("buildEquityCurve", () => {
  test("starts at initial capital and tracks cumulative profit", () => {
    const curve = buildEquityCurve(
      [
        { profit: 10, closeTime: 1000, entry: 100, size: 100 },
        { profit: -5, closeTime: 2000, entry: 100, size: 100 },
        { profit: 20, closeTime: 3000, entry: 100, size: 100 },
      ],
      1000,
    );
    expect(curve.length).toBe(4); // initial + 3 trades
    expect(curve[0].equity).toBe(1000);
    expect(curve[1].equity).toBe(1010);
    expect(curve[2].equity).toBe(1005);
    expect(curve[3].equity).toBe(1025);
    expect(curve[3].realizedPnl).toBe(25);
  });

  test("sorts trades by close time before accumulation", () => {
    const curve = buildEquityCurve(
      [
        { profit: 20, closeTime: 3000, entry: 100, size: 100 },
        { profit: -5, closeTime: 2000, entry: 100, size: 100 },
      ],
      1000,
    );
    expect(curve[1].equity).toBe(995);
    expect(curve[2].equity).toBe(1015);
  });

  test("empty trades → single initial snapshot", () => {
    const curve = buildEquityCurve([], 500);
    expect(curve.length).toBe(1);
    expect(curve[0].equity).toBe(500);
  });
});

describe("markToMarket", () => {
  test("long position in profit → positive unrealized PnL", () => {
    const snap = markToMarket(
      [{ side: "long", entry: 100, current: 110, size: 1000, margin: 100 }],
      500,
    );
    expect(snap.unrealizedPnl).toBeCloseTo(100);
    expect(snap.equity).toBeCloseTo(600);
    expect(snap.openPositions).toBe(1);
    expect(snap.exposure).toBe(1000);
  });

  test("short position in profit → positive unrealized PnL", () => {
    const snap = markToMarket(
      [{ side: "short", entry: 100, current: 90, size: 1000, margin: 100 }],
      500,
    );
    expect(snap.unrealizedPnl).toBeCloseTo(100);
  });

  test("losing long position → negative unrealized PnL", () => {
    const snap = markToMarket(
      [{ side: "long", entry: 100, current: 95, size: 1000, margin: 100 }],
      500,
    );
    expect(snap.unrealizedPnl).toBeCloseTo(-50);
  });
});

describe("computePerformanceMetrics", () => {
  test("empty trades → all zeros", () => {
    const m = computePerformanceMetrics([], 1000);
    expect(m.totalTrades).toBe(0);
    expect(m.winRate).toBe(0);
    expect(m.profitFactor).toBe(0);
    expect(m.maxDrawdown).toBe(0);
  });

  test("known mixed PnL set computes win rate, profit factor, expectancy", () => {
    const m = computePerformanceMetrics(
      [
        { profit: 10, pnlPct: 1, rr: 2, score: 80, closeTime: 1, entry: 100 },
        { profit: 10, pnlPct: 1, rr: 2, score: 80, closeTime: 2, entry: 100 },
        { profit: -5, pnlPct: -0.5, rr: 0.5, score: 60, closeTime: 3, entry: 100 },
      ],
      1000,
    );
    expect(m.totalTrades).toBe(3);
    expect(m.winRate).toBeCloseTo(66.7, 1);
    expect(m.profitFactor).toBeCloseTo(4, 1);
    expect(m.avgWin).toBeCloseTo(10);
    expect(m.avgLoss).toBeCloseTo(5);
    expect(m.expectancy).toBeCloseTo(5);
    expect(m.consecutiveWins).toBe(2);
    expect(m.consecutiveLosses).toBe(1);
  });

  test("max drawdown is positive when there are losses", () => {
    const m = computePerformanceMetrics(
      [
        { profit: 10, pnlPct: 1, rr: 2, score: 80, closeTime: 1, entry: 100 },
        { profit: -20, pnlPct: -2, rr: 0.5, score: 60, closeTime: 2, entry: 100 },
        { profit: 5, pnlPct: 0.5, rr: 1, score: 70, closeTime: 3, entry: 100 },
      ],
      1000,
    );
    expect(m.maxDrawdown).toBeGreaterThan(0);
    expect(m.maxDrawdownPct).toBeGreaterThan(0);
  });
});

describe("computeRiskMetrics", () => {
  test("fewer than 10 trades → zeroed VaR with maxPositionSize = capital", () => {
    const r = computeRiskMetrics(
      [{ profit: 1, pnlPct: 0.1, rr: 1 }],
      [],
      1000,
    );
    expect(r.valueAtRisk95).toBe(0);
    expect(r.kellyFraction).toBe(0);
    expect(r.optimalLeverage).toBe(1);
    expect(r.maxPositionSize).toBe(1000);
  });

  test("≥10 trades produces bounded kelly and leverage", () => {
    const trades = Array.from({ length: 20 }, (_, i) => ({
      profit: i % 4 === 0 ? -1 : 1,
      pnlPct: i % 4 === 0 ? -1 : 1,
      rr: 1,
    }));
    const r = computeRiskMetrics(
      trades,
      [{ side: "long", entry: 100, current: 105, size: 500, leverage: 10 }],
      1000,
    );
    expect(r.kellyFraction).toBeGreaterThanOrEqual(0);
    expect(r.kellyFraction).toBeLessThanOrEqual(1);
    expect(r.optimalLeverage).toBeGreaterThanOrEqual(1);
    expect(r.portfolioHeat).toBeGreaterThan(0);
    expect(r.correlationExposure).toBeGreaterThanOrEqual(0);
  });
});

describe("calculatePositionSize", () => {
  test("sizes by risk amount divided by stop distance + fees", () => {
    const r = calculatePositionSize(1000, 1, 100, 99, 10, 20, 0.1);
    expect(r.riskAmount).toBeCloseTo(10);
    // slFraction = 0.01, fees = 0.002 → size = 10 / 0.012 = 833.33
    expect(r.size).toBeCloseTo(833.33, 1);
    expect(r.margin).toBeCloseTo(r.size / 10, 1);
    expect(r.quantity).toBeCloseTo(r.size / 100, 4);
  });

  test("leverage is capped at maxLeverage", () => {
    const r = calculatePositionSize(1000, 1, 100, 99, 100, 20, 0.1);
    expect(r.margin).toBeCloseTo(r.size / 20, 1); // uses 20, not 100
  });

  test("zero stop distance still sizes on fees without crashing", () => {
    const r = calculatePositionSize(1000, 1, 100, 100, 10, 20, 0.1);
    expect(Number.isFinite(r.size)).toBe(true);
    expect(r.size).toBeGreaterThan(0);
    expect(r.riskAmount).toBeCloseTo(10);
  });
});

describe("calculateTrailingStop", () => {
  test("long below activation keeps the current stop", () => {
    expect(calculateTrailingStop("long", 100, 101, 99, 2, 1)).toBe(99);
  });

  test("long above activation trails upward only", () => {
    // 3% profit > 2% activation → trail = 103 * 0.99 = 101.97, max(99, 101.97)
    const stop = calculateTrailingStop("long", 100, 103, 99, 2, 1);
    expect(stop).toBeCloseTo(101.97, 2);
  });

  test("long never lowers the stop below the current one", () => {
    const stop = calculateTrailingStop("long", 100, 103, 102.5, 2, 1);
    expect(stop).toBe(102.5); // max keeps existing stop
  });

  test("short above activation trails downward only", () => {
    // short with price falling to 97 → 3% profit → trail = 97 * 1.01 = 97.97
    const stop = calculateTrailingStop("short", 100, 97, 101, 2, 1);
    expect(stop).toBeCloseTo(97.97, 2);
  });
});

describe("calculatePartialClose", () => {
  test("long closes partial at each hit target with positive PnL", () => {
    const closes = calculatePartialClose("long", 100, 110, [105, 110, 115], 300, [0.33, 0.33, 0.34]);
    expect(closes.length).toBe(2); // 115 not hit
    expect(closes[0].targetIndex).toBe(0);
    expect(closes[1].targetIndex).toBe(1);
    expect(closes[0].closeSize).toBeCloseTo(99, 1);
    expect(closes[0].partialPnl).toBeGreaterThan(0);
    const totalSize = closes.reduce((s, c) => s + c.closeSize, 0);
    expect(totalSize).toBeLessThanOrEqual(300);
  });

  test("no target hit → no closes", () => {
    const closes = calculatePartialClose("long", 100, 101, [110, 120], 300);
    expect(closes.length).toBe(0);
  });

  test("short closes at targets below entry", () => {
    const closes = calculatePartialClose("short", 100, 90, [95, 90], 200);
    expect(closes.length).toBe(2);
    for (const c of closes) expect(c.partialPnl).toBeGreaterThan(0);
  });
});

describe("detectMarketRegime", () => {
  test("too few candles → ranging with zero ADX", () => {
    const r = detectMarketRegime([candle(100, 101, 99, 100)], 50);
    expect(r.regime).toBe("ranging");
    expect(r.adx).toBe(0);
  });

  test("strong sustained uptrend → trending_up", () => {
    const candles = Array.from({ length: 60 }, (_, i) => {
      const c = 100 + i * 2;
      return candle(c, c + 1, c - 1, c + 0.5, i);
    });
    const r = detectMarketRegime(candles, 50);
    expect(r.regime).toBe("trending_up");
    expect(r.adx).toBeGreaterThan(0);
  });

  test("flat candles → low volatility regime", () => {
    const candles = Array.from({ length: 60 }, () => candle(100, 100.2, 99.8, 100));
    const r = detectMarketRegime(candles, 50);
    expect(["low_volatility", "ranging"]).toContain(r.regime);
  });

  test("returns a valid regime for any input", () => {
    const candles = Array.from({ length: 60 }, (_, i) => {
      const c = 100 + Math.sin(i / 4) * 5;
      return candle(c, c + 0.5, c - 0.5, c, i);
    });
    const r = detectMarketRegime(candles, 50);
    expect(["trending_up", "trending_down", "ranging", "volatile", "low_volatility"]).toContain(r.regime);
    expect(r.trendStrength).toBeGreaterThanOrEqual(0);
    expect(r.trendStrength).toBeLessThanOrEqual(1);
  });
});
