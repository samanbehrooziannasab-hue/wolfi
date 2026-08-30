// ─── Backend unit tests (bun test) ─────────────────────────────────────────
// Covers the capital model (src/convex/capital.ts): effective capital with
// realized P&L, exchange equivalence scale, fee/slippage-aware sizing and
// net P&L calculation. No Convex runtime needed.
import { describe, expect, test } from "bun:test";
import {
  effectiveCapital,
  exchangeScale,
  netPnl,
  roundTripCostFraction,
  sizedNotional,
} from "../src/convex/capital";

describe("effectiveCapital", () => {
  test("virtual capital + realized P&L", () => {
    expect(effectiveCapital(1000, 0)).toBe(1000);
    expect(effectiveCapital(1000, 150.5)).toBeCloseTo(1150.5);
    expect(effectiveCapital(1000, -250)).toBe(750);
  });

  test("never drops below the floor", () => {
    expect(effectiveCapital(1000, -5000)).toBe(1);
    expect(effectiveCapital(0, 0)).toBe(1);
    expect(effectiveCapital(0, 50)).toBe(50); // virtual 0 + P&L 50
  });

  test("handles NaN and non-finite input gracefully", () => {
    expect(effectiveCapital(Number.NaN, 100)).toBe(100); // virtual NaN → 0
    expect(effectiveCapital(1000, Number.NaN)).toBe(1000); // P&L NaN → 0
  });
});

describe("exchangeScale", () => {
  test("1:1 when balances match", () => {
    expect(exchangeScale(1000, 1000)).toBe(1);
  });

  test("engine $1000, exchange $100 → 0.1 (the reported scenario)", () => {
    expect(exchangeScale(100, 1000)).toBeCloseTo(0.1);
  });

  test("engine $1000, exchange $5000 → 5.0", () => {
    expect(exchangeScale(5000, 1000)).toBe(5);
  });

  test("unknown balance → 1 (paper / not configured)", () => {
    expect(exchangeScale(0, 1000)).toBe(1);
    expect(exchangeScale(Number.NaN, 1000)).toBe(1);
    expect(exchangeScale(-5, 1000)).toBe(1);
  });

  test("clamped to sane bounds", () => {
    expect(exchangeScale(1, 1000000)).toBeCloseTo(0.05); // 0.000001 → min 0.05
    expect(exchangeScale(1000000, 1)).toBe(10); // 1000000 → max 10
  });

  test("uses effective capital (includes realized P&L)", () => {
    // engine grew to 1150 via P&L while the exchange still holds 115 → 0.1
    expect(exchangeScale(115, 1150)).toBeCloseTo(0.1);
  });
});

describe("roundTripCostFraction", () => {
  test("open + close fee plus slippage", () => {
    // 0.1% open + 0.1% close + 0.05% slippage = 0.25%
    expect(roundTripCostFraction(0.1, 0.05)).toBeCloseTo(0.0025);
    expect(roundTripCostFraction(0.1, 0)).toBeCloseTo(0.002);
  });

  test("zero fee → zero cost", () => {
    expect(roundTripCostFraction(0, 0)).toBe(0);
  });
});

describe("sizedNotional", () => {
  test("risk budget covers stop distance + fees", () => {
    // risk $10, stop 1%, fee 0.1% (×2) → denom = 0.01 + 0.002 = 0.012
    const n = sizedNotional(10, 0.01, 0.1);
    expect(n).toBeCloseTo(10 / 0.012, 1); // 833.33
  });

  test("applies the exchange equivalence scale", () => {
    const base = sizedNotional(10, 0.01, 0.1);
    const scaled = sizedNotional(10, 0.01, 0.1, 0, 0.1);
    expect(scaled).toBeCloseTo(base * 0.1, 4);
  });

  test("respects absolute caps", () => {
    const capped = sizedNotional(10, 0.01, 0.1, 0, 1, 100);
    expect(capped).toBe(100);
    const room = sizedNotional(10, 0.01, 0.1, 0, 1, 1000, 50);
    expect(room).toBe(50);
  });

  test("untradeable setups return 0", () => {
    expect(sizedNotional(0, 0.01)).toBe(0);
    expect(sizedNotional(10, 0)).toBe(0);
    expect(sizedNotional(-5, 0.01)).toBe(0);
    expect(sizedNotional(Number.NaN, 0.01)).toBe(0);
  });
});

describe("netPnl", () => {
  test("long with fees: gross − open fee − close fee", () => {
    // entry 100, exit 110, qty 10 → gross 100; open fee 1; close fee 100*10*0.1% = 1
    expect(netPnl("long", 100, 110, 10, 1, 0.1)).toBeCloseTo(98);
  });

  test("short profit", () => {
    // entry 100, exit 90, qty 5 → gross 50; fees 0
    expect(netPnl("short", 100, 90, 5, 0, 0)).toBeCloseTo(50);
  });

  test("loss is reduced by fees (worse)", () => {
    // entry 100, exit 95, qty 10 → gross −50; open 1 + close 1 → −52
    expect(netPnl("long", 100, 95, 10, 1, 0.1)).toBeCloseTo(-52);
  });
});
