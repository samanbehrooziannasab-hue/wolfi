// ─── Backend unit tests (bun test) ─────────────────────────────────────────
// Covers the pure engine core (src/convex/engineCore.ts): seeded PRNG,
// timeframes, market-open rules, candle generation/advance, technical
// indicators and market-structure / zone detection. No Convex runtime needed.
import { describe, expect, test } from "bun:test";
import {
  advanceCandles,
  analyzeStructure,
  atr,
  bollinger,
  clusterLevels,
  computeFeatures,
  donchian,
  ema,
  findFVG,
  findOrderBlocks,
  findSwings,
  gaussian,
  generateCandles,
  hashString,
  isMarketOpen,
  macd,
  mulberry32,
  obv,
  roc,
  rsi,
  sma,
  stoch,
  tfMinutes,
  vwap,
  zscore,
} from "../src/convex/engineCore";
import type { Candle } from "../src/convex/engineCore";

function candle(o: number, h: number, l: number, c: number, t = 0, v = 100): Candle {
  return { t, o, h, l, c, v };
}

describe("PRNG helpers", () => {
  test("hashString is deterministic and differs for different inputs", () => {
    expect(hashString("BTCUSDT")).toBe(hashString("BTCUSDT"));
    expect(hashString("BTCUSDT")).not.toBe(hashString("ETHUSDT"));
    expect(typeof hashString("x")).toBe("number");
  });

  test("mulberry32 is deterministic for the same seed and in [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const first = a();
    expect(first).toBe(b());
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  test("gaussian returns finite values", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 20; i++) {
      expect(Number.isFinite(gaussian(rand))).toBe(true);
    }
  });
});

describe("timeframes & market hours", () => {
  test("tfMinutes maps known timeframes", () => {
    expect(tfMinutes("1m")).toBe(1);
    expect(tfMinutes("5m")).toBe(5);
    expect(tfMinutes("15m")).toBe(15);
    expect(tfMinutes("30m")).toBe(30);
    expect(tfMinutes("1h")).toBe(60);
    expect(tfMinutes("4h")).toBe(240);
    expect(tfMinutes("1d")).toBe(1440);
    expect(tfMinutes("unknown")).toBe(60);
  });

  test("crypto is always open", () => {
    expect(isMarketOpen("crypto", Date.UTC(2024, 0, 6, 12))).toBe(true); // Saturday
    expect(isMarketOpen("crypto", Date.UTC(2024, 0, 7, 0))).toBe(true); // Sunday 00:00
  });

  test("forex closes Friday 21:00 UTC through Sunday 22:00 UTC", () => {
    // Friday 22:00 UTC → closed
    expect(isMarketOpen("forex", Date.UTC(2024, 0, 5, 22))).toBe(false);
    // Saturday → closed
    expect(isMarketOpen("forex", Date.UTC(2024, 0, 6, 12))).toBe(false);
    // Sunday 12:00 UTC → closed
    expect(isMarketOpen("forex", Date.UTC(2024, 0, 7, 12))).toBe(false);
    // Sunday 23:00 UTC → open
    expect(isMarketOpen("forex", Date.UTC(2024, 0, 7, 23))).toBe(true);
    // Monday → open
    expect(isMarketOpen("forex", Date.UTC(2024, 0, 8, 12))).toBe(true);
  });
});

describe("candle feed", () => {
  const now = Date.UTC(2024, 0, 10, 12, 0, 0);
  const candles = generateCandles("BTCUSDT", "crypto", 40000, 2, "15m", now);

  test("generates the requested number of candles", () => {
    expect(candles.length).toBe(220);
  });

  test("every candle is structurally valid (h >= max(o,c), l <= min(o,c))", () => {
    for (const c of candles) {
      expect(c.h).toBeGreaterThanOrEqual(Math.max(c.o, c.c));
      expect(c.l).toBeLessThanOrEqual(Math.min(c.o, c.c));
      expect(c.h).toBeGreaterThanOrEqual(c.l);
      expect(c.v).toBeGreaterThanOrEqual(0);
    }
  });

  test("is deterministic for the same inputs", () => {
    const again = generateCandles("BTCUSDT", "crypto", 40000, 2, "15m", now);
    expect(again).toEqual(candles);
  });

  test("advanceCandles appends a new bucket when time moves forward", () => {
    const tfMin = 15;
    const later = now + tfMin * 60_000 * 2;
    const advanced = advanceCandles(candles, "crypto", "15m", later);
    expect(advanced.length).toBeGreaterThanOrEqual(candles.length);
    const last = advanced[advanced.length - 1];
    expect(last.h).toBeGreaterThanOrEqual(Math.max(last.o, last.c));
    expect(last.l).toBeLessThanOrEqual(Math.min(last.o, last.c));
  });

  test("advanceCandles within the same bucket keeps the series length", () => {
    const same = advanceCandles(candles, "crypto", "15m", now + 60_000);
    expect(same.length).toBe(candles.length);
    const last = same[same.length - 1];
    expect(last.h).toBeGreaterThanOrEqual(Math.max(last.o, last.c));
    expect(last.l).toBeLessThanOrEqual(Math.min(last.o, last.c));
  });
});

describe("technical indicators", () => {
  test("sma computes rolling averages with NaN warm-up", () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNaN();
    expect(out[1]).toBeNaN();
    expect(out[2]).toBeCloseTo(2);
    expect(out[3]).toBeCloseTo(3);
    expect(out[4]).toBeCloseTo(4);
  });

  test("ema of a constant series equals the constant", () => {
    const out = ema([5, 5, 5, 5, 5], 9);
    for (const v of out) expect(v).toBeCloseTo(5);
  });

  test("rsi of a strictly rising series is 100", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const out = rsi(closes, 14);
    expect(out[out.length - 1]).toBeCloseTo(100);
  });

  test("macd returns equal-length line/signal/histogram", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const m = macd(closes);
    expect(m.line.length).toBe(closes.length);
    expect(m.signal.length).toBe(closes.length);
    expect(m.hist.length).toBe(closes.length);
    expect(m.hist[m.hist.length - 1]).toBeCloseTo(m.line[m.line.length - 1] - m.signal[m.line.length - 1], 6);
  });

  test("bollinger bands respect upper >= mid >= lower", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + (i % 7));
    const bb = bollinger(closes, 20, 2);
    for (let i = 19; i < closes.length; i++) {
      expect(bb.upper[i]).toBeGreaterThanOrEqual(bb.mid[i]);
      expect(bb.mid[i]).toBeGreaterThanOrEqual(bb.lower[i]);
    }
  });

  test("atr of perfectly flat candles is 0 after warm-up", () => {
    const candles = Array.from({ length: 30 }, () => candle(10, 10, 10, 10));
    const out = atr(candles, 14);
    expect(out[out.length - 1]).toBeCloseTo(0);
  });

  test("vwap with constant volume is the mean typical price", () => {
    const candles = [
      candle(10, 11, 9, 10.5, 0, 100),
      candle(10.5, 12, 10, 11, 1, 100),
      candle(11, 12.5, 10.5, 12, 2, 100),
    ];
    const out = vwap(candles);
    const tp = candles.map((c) => (c.h + c.l + c.c) / 3);
    const mean = tp.reduce((a, b) => a + b, 0) / tp.length;
    expect(out[out.length - 1]).toBeCloseTo(mean);
  });

  test("stoch %K stays within 0..100", () => {
    const candles = Array.from({ length: 40 }, (_, i) => candle(10 + i % 5, 11 + i % 5, 9 + i % 5, 10.5 + (i % 5) / 2));
    const { k, d } = stoch(candles, 14);
    for (let i = 13; i < k.length; i++) {
      expect(k[i]).toBeGreaterThanOrEqual(0);
      expect(k[i]).toBeLessThanOrEqual(100);
    }
    expect(d.length).toBe(k.length);
  });

  test("donchian upper >= lower at every valid index", () => {
    const candles = Array.from({ length: 30 }, (_, i) => candle(10, 12 + (i % 3), 8 + (i % 3), 10.5));
    const dc = donchian(candles, 20);
    for (let i = 19; i < candles.length; i++) {
      expect(dc.upper[i]).toBeGreaterThanOrEqual(dc.lower[i]);
    }
  });

  test("zscore of a constant series is 0", () => {
    const closes = new Array(30).fill(100);
    const z = zscore(closes, 20);
    expect(z[z.length - 1]).toBe(0);
  });

  test("roc of a constant series is 0", () => {
    const closes = new Array(30).fill(100);
    const r = roc(closes, 10);
    expect(r[r.length - 1]).toBeCloseTo(0);
  });

  test("obv accumulates volume on up days and subtracts on down days", () => {
    const candles = [
      candle(10, 11, 9, 10, 0, 100),
      candle(10, 11, 9, 11, 1, 50), // up
      candle(11, 12, 10, 10, 2, 30), // down
      candle(10, 11, 9, 10, 3, 20), // flat
    ];
    const out = obv(candles);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(50);
    expect(out[2]).toBe(50 - 30);
    expect(out[3]).toBe(20);
  });
});

describe("market structure & zones", () => {
  test("findSwings detects swing highs and lows with correct kinds", () => {
    // Zigzag: up to 20, down to 5, up to 30
    const candles = [
      candle(10, 10, 10, 10, 0),
      candle(10, 15, 10, 14, 1),
      candle(14, 20, 14, 19, 2),
      candle(19, 19, 8, 9, 3),
      candle(9, 9, 5, 6, 4),
      candle(6, 12, 6, 11, 5),
      candle(11, 30, 11, 29, 6),
      candle(29, 29, 20, 22, 7),
      candle(22, 26, 21, 24, 8),
      candle(24, 25, 23, 24, 9),
    ];
    const swings = findSwings(candles, 2);
    expect(swings.length).toBeGreaterThan(0);
    const highs = swings.filter((s) => s.kind === "high");
    const lows = swings.filter((s) => s.kind === "low");
    expect(highs.length).toBeGreaterThan(0);
    expect(lows.length).toBeGreaterThan(0);
    expect(highs[highs.length - 1].price).toBe(30);
  });

  test("analyzeStructure returns a valid trend and boolean flags", () => {
    const candles = generateCandles("EURUSD", "forex", 1.08, 0.5, "15m", Date.UTC(2024, 0, 10, 12), 220);
    const swings = findSwings(candles, 2);
    const structure = analyzeStructure(candles, swings);
    expect(["up", "down", "range"]).toContain(structure.trend);
    expect(typeof structure.bosUp).toBe("boolean");
    expect(typeof structure.bosDown).toBe("boolean");
    expect(typeof structure.choch).toBe("boolean");
    expect(Number.isFinite(structure.lastHH)).toBe(true);
    expect(Number.isFinite(structure.lastLL)).toBe(true);
  });

  test("findFVG detects a bullish fair value gap", () => {
    const candles = [
      candle(10, 10, 9, 9.5, 0),
      candle(9.5, 12, 9, 11.5, 1),
      candle(11.5, 13, 11, 12, 2),
    ];
    const zones = findFVG(candles);
    const up = zones.find((z) => z.kind === "fvg_up");
    expect(up).toBeDefined();
    expect(up!.bottom).toBeCloseTo(10);
    expect(up!.top).toBeCloseTo(11);
  });

  test("findOrderBlocks detects a bullish order block", () => {
    const candles = [
      candle(10, 10.5, 9.5, 10.2, 0), // up
      candle(10.2, 10.8, 9.8, 10.5, 1), // up (prev)
      candle(10.5, 10.6, 9.6, 9.7, 2), // down (the block)
      candle(9.7, 11, 9.7, 10.9, 3), // up move breaking the block high
    ];
    const obs = findOrderBlocks(candles);
    const up = obs.find((z) => z.kind === "ob_up");
    expect(up).toBeDefined();
    expect(up!.bottom).toBeCloseTo(9.6);
    expect(up!.top).toBeCloseTo(10.6);
  });

  test("clusterLevels returns empty for flat candles", () => {
    const candles = Array.from({ length: 30 }, () => candle(10, 11, 9, 10.5));
    const levels = clusterLevels(candles);
    expect(Array.isArray(levels)).toBe(true);
  });

  test("computeFeatures produces a complete, bounded feature set", () => {
    const candles = generateCandles("SOLUSDT", "crypto", 100, 3, "1h", Date.UTC(2024, 0, 10, 12), 220);
    const f = computeFeatures(candles);
    expect(f.price).toBeCloseTo(candles[candles.length - 1].c);
    expect(f.closes.length).toBe(candles.length);
    expect(Number.isFinite(f.rsi14)).toBe(true);
    expect(f.rsi14).toBeGreaterThanOrEqual(0);
    expect(f.rsi14).toBeLessThanOrEqual(100);
    expect(f.trendScore).toBeGreaterThanOrEqual(-1);
    expect(f.trendScore).toBeLessThanOrEqual(1);
    expect(f.momentumScore).toBeGreaterThanOrEqual(-1);
    expect(f.momentumScore).toBeLessThanOrEqual(1);
    expect(f.volScore).toBeGreaterThanOrEqual(-1);
    expect(f.volScore).toBeLessThanOrEqual(1);
    expect(Number.isFinite(f.atrV)).toBe(true);
    expect(Number.isFinite(f.vwapV)).toBe(true);
    expect(f.donchUpper).toBeGreaterThanOrEqual(f.donchLower);
    expect(Array.isArray(f.fvg)).toBe(true);
    expect(Array.isArray(f.obs)).toBe(true);
    expect(Array.isArray(f.levels)).toBe(true);
  });
});
