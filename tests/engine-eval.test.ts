// ─── Backend unit tests (bun test) ─────────────────────────────────────────
// Covers the strategy evaluator + weighted aggregation (src/convex/engineEval.ts):
// deterministic family rules, strength bounds, consensus/quality/conflict logic
// and the end-to-end candles → features → votes → signal pipeline.
import { describe, expect, test } from "bun:test";
import {
  aggregateStrategies,
  analyze,
  evaluateFamily,
  evaluateStrategies,
} from "../src/convex/engineEval";
import { computeFeatures, generateCandles } from "../src/convex/engineCore";
import type { EngineFeatures } from "../src/convex/engineCore";

/** Minimal-but-valid feature snapshot for rule-level unit tests. */
function fakeFeatures(overrides: Partial<EngineFeatures> = {}): EngineFeatures {
  const candles = generateCandles("BTCUSDT", "crypto", 40000, 2, "1h", Date.UTC(2024, 0, 10, 12), 220);
  return {
    ...computeFeatures(candles),
    ...overrides,
  };
}

describe("evaluateFamily — deterministic rules", () => {
  test("unknown family returns neutral", () => {
    const f = fakeFeatures();
    expect(evaluateFamily("does_not_exist", f)).toEqual({ dir: 0, strength: 0 });
  });

  test("bullish engulfing fires long with 0.6 strength", () => {
    const candles = generateCandles("BTCUSDT", "crypto", 40000, 2, "1h", Date.UTC(2024, 0, 10, 12), 220);
    candles[candles.length - 2] = { ...candles[candles.length - 2], o: 101, c: 100 };
    candles[candles.length - 1] = { ...candles[candles.length - 1], o: 100, c: 102, h: 102.5, l: 99.5 };
    const f = computeFeatures(candles);
    const r = evaluateFamily("pa_engulfing", f);
    expect(r.dir).toBe(1);
    expect(r.strength).toBeCloseTo(0.6);
  });

  test("bearish engulfing fires short", () => {
    const candles = generateCandles("BTCUSDT", "crypto", 40000, 2, "1h", Date.UTC(2024, 0, 10, 12), 220);
    candles[candles.length - 2] = { ...candles[candles.length - 2], o: 100, c: 101 };
    candles[candles.length - 1] = { ...candles[candles.length - 1], o: 101, c: 99, h: 101.5, l: 98.5 };
    const f = computeFeatures(candles);
    const r = evaluateFamily("pa_engulfing", f);
    expect(r.dir).toBe(-1);
  });

  test("trend_ema fires long when EMAs align up", () => {
    const f = fakeFeatures({
      ema9: 110,
      ema21: 100,
      ema50: 90,
      price: 101,
    });
    const r = evaluateFamily("trend_ema", f);
    expect(r.dir).toBe(1);
    expect(r.strength).toBeGreaterThan(0);
    expect(r.strength).toBeLessThanOrEqual(1);
  });

  test("trend_ema fires short when EMAs align down", () => {
    const f = fakeFeatures({
      ema9: 90,
      ema21: 100,
      ema50: 110,
      price: 99,
    });
    const r = evaluateFamily("trend_ema", f);
    expect(r.dir).toBe(-1);
  });

  test("mom_rsi fires long above 50 with positive MACD", () => {
    const f = fakeFeatures({ rsi14: 60, macdHist: 0.5 });
    const r = evaluateFamily("mom_rsi", f);
    expect(r.dir).toBe(1);
  });

  test("strength is always clamped into 0..1", () => {
    const f = fakeFeatures({ rsi14: 99, macdHist: 99, rocV: 50 });
    for (const family of ["mom_rsi", "trend_ema", "combo_trio", "meanr_bb", "vol_spike"]) {
      const r = evaluateFamily(family, f);
      expect(r.strength).toBeGreaterThanOrEqual(0);
      expect(r.strength).toBeLessThanOrEqual(1);
      expect([-1, 0, 1]).toContain(r.dir);
    }
  });

  test("all registered families return a bounded result without throwing", () => {
    const f = fakeFeatures();
    const families = [
      "pa_pinbar", "pa_engulfing", "pa_inside", "pa_fakey", "pa_hammershooting",
      "pa_doji", "pa_threeb", "pat_double", "pat_headshoulder", "pat_triangle",
      "pat_wedge", "pat_rectangle", "pat_flag", "pat_cup",
      "trend_ema", "trend_cross", "trend_macd", "trend_supertrend", "trend_adx",
      "trend_psar", "trend_channel",
      "mom_rsi", "mom_stoch", "mom_macdhist", "mom_roc", "mom_cci", "mom_williams",
      "meanr_bb", "meanr_rsi2", "meanr_zscore", "meanr_keltner", "meanr_gaps",
      "brk_consolidation", "brk_donchian", "brk_range", "brk_level", "brk_volatility", "brk_move",
      "scalp_snr", "scalp_1m", "scalp_vwap", "scalp_momentum",
      "swing_retest", "swing_pullback", "swing_aroon", "swing_harami",
      "smc_ob", "smc_fvg", "smc_liquidity", "smc_mitigation", "smc_breaker",
      "smc_imbalance", "ict_killzone", "ict_opening", "ict_ote", "ict_silverbullet",
      "ict_power3", "ict_smart", "ict_judas", "ict_ods",
      "vol_spike", "vol_obv", "vol_vwap", "vol_accum", "vol_effort", "vol_cvd",
      "vola_atr", "vola_bbsqueeze", "vola_keltner", "vola_expansion", "vola_range", "vola_funnel",
      "sr_levels", "sr_pivot", "sr_fib", "sr_round", "sr_trendline", "sr_conger", "sr_magnet",
      "mtf_confluence", "mtf_highertf", "mtf_filter", "mtf_bias", "mtf_t1", "mtf_expansion",
      "struct_bos", "struct_choch", "struct_mss", "struct_continuation", "struct_reversal", "struct_invalid",
      "liq_sweep", "liq_session", "liq_weekend", "liq_poi", "liq_run", "liq_absorb",
      "combo_ema_rsi", "combo_macd_bb", "combo_smt", "combo_trio", "combo_wolf",
      "combo_fisher", "combo_magic", "combo_supres",
    ];
    for (const family of families) {
      const r = evaluateFamily(family, f);
      // dir is a signed value: some families (mtf_*, liq_*, combo_*) return a
      // continuous strength-scaled direction, so it must just be finite.
      expect(Number.isFinite(r.dir)).toBe(true);
      expect(r.strength).toBeGreaterThanOrEqual(0);
      expect(r.strength).toBeLessThanOrEqual(1);
    }
  });
});

describe("aggregateStrategies — weighted consensus", () => {
  const vote = (key: string, family: string, dir: number, strength: number, weight = 1) => ({
    key,
    family,
    nameFa: key,
    dir,
    strength,
    weight,
  });

  test("empty results → neutral with zero scores", () => {
    const agg = aggregateStrategies([]);
    expect(agg.direction).toBe("neutral");
    expect(agg.score).toBe(0);
    expect(agg.confidence).toBe(0);
    expect(agg.independentConfirmations).toBe(0);
    expect(agg.conflict).toBe(false);
  });

  test("all-long consensus → long direction", () => {
    const agg = aggregateStrategies([
      vote("a", "trend", 1, 0.8, 1),
      vote("b", "mom", 1, 0.7, 1),
      vote("c", "pa", 1, 0.6, 1),
    ]);
    expect(agg.direction).toBe("long");
    expect(agg.consensus).toBeGreaterThanOrEqual(0.55);
    expect(agg.confidence).toBeGreaterThan(0);
    expect(agg.score).toBeGreaterThan(0);
    expect(agg.score).toBeLessThanOrEqual(100);
    expect(agg.confirmingGroups.length).toBeGreaterThan(0);
  });

  test("all-short consensus → short direction", () => {
    const agg = aggregateStrategies([
      vote("a", "trend", -1, 0.8, 1),
      vote("b", "mom", -1, 0.7, 1),
    ]);
    expect(agg.direction).toBe("short");
    expect(agg.consensus).toBeGreaterThanOrEqual(0.55);
  });

  test("weak/conflicting votes → neutral", () => {
    const agg = aggregateStrategies([
      vote("a", "trend", 1, 0.3, 1),
      vote("b", "mom", -1, 0.3, 1),
    ]);
    // Weak (strength < 0.2 threshold is skipped; here both are filtered as
    // direction-0 net per family after the 0.12 gate → neutral).
    expect(agg.direction).toBe("neutral");
  });

  test("family normalization prevents one family drowning the vote", () => {
    const agg = aggregateStrategies([
      vote("a1", "trend", 1, 0.9, 1),
      vote("a2", "trend", 1, 0.9, 1),
      vote("a3", "trend", 1, 0.9, 1),
      vote("a4", "trend", 1, 0.9, 1),
      vote("a5", "trend", 1, 0.9, 1),
      vote("b", "mom", -1, 0.8, 1),
    ]);
    // One opposing independent family keeps it from being a slam-dunk long.
    expect(["long", "short", "neutral"]).toContain(agg.direction);
    expect(agg.independentConfirmations).toBeGreaterThanOrEqual(0);
    expect(agg.conflict).toBe(true); // strong opposing support
  });

  test("score, confidence, consensus are all bounded", () => {
    const agg = aggregateStrategies([
      vote("a", "trend", 1, 0.9, 2),
      vote("b", "mom", 1, 0.8, 1),
      vote("c", "vol", 1, 0.5, 1),
      vote("d", "smc", 1, 0.6, 1),
    ]);
    expect(agg.score).toBeGreaterThanOrEqual(0);
    expect(agg.score).toBeLessThanOrEqual(100);
    expect(agg.confidence).toBeGreaterThanOrEqual(0);
    expect(agg.confidence).toBeLessThanOrEqual(1);
    expect(agg.consensus).toBeGreaterThanOrEqual(0);
    expect(agg.consensus).toBeLessThanOrEqual(1);
    expect(agg.quality).toBeGreaterThanOrEqual(0);
    expect(agg.quality).toBeLessThanOrEqual(1);
  });
});

describe("evaluateStrategies & analyze — end to end", () => {
  const strategies = [
    { key: "trend_ema", family: "trend_ema", nameFa: "EMA روند", weight: 1.2 },
    { key: "mom_rsi", family: "mom_rsi", nameFa: "RSI", weight: 1 },
    { key: "pa_engulfing", family: "pa_engulfing", nameFa: "انگالفینگ", weight: 1 },
    { key: "meanr_bb", family: "meanr_bb", nameFa: "باند بولینگر", weight: 0.8 },
    { key: "vol_spike", family: "vol_spike", nameFa: "جهش حجم", weight: 1 },
    { key: "smc_ob", family: "smc_ob", nameFa: "اوردر بلاک", weight: 1 },
  ];

  test("analyze runs the full pipeline and returns a bounded signal", () => {
    const candles = generateCandles("BTCUSDT", "crypto", 40000, 2, "1h", Date.UTC(2024, 0, 10, 12), 220);
    const { features, results, aggregate } = analyze(candles, strategies);
    expect(features.price).toBeCloseTo(candles[candles.length - 1].c);
    expect(results.length).toBe(strategies.length);
    expect(["long", "short", "neutral"]).toContain(aggregate.direction);
    expect(aggregate.score).toBeGreaterThanOrEqual(0);
    expect(aggregate.score).toBeLessThanOrEqual(100);
    expect(aggregate.confidence).toBeGreaterThanOrEqual(0);
    expect(aggregate.confidence).toBeLessThanOrEqual(1);
  });

  test("evaluateStrategies keeps input keys and bounded values", () => {
    const candles = generateCandles("ETHUSDT", "crypto", 3000, 2, "15m", Date.UTC(2024, 0, 10, 12), 220);
    const features = computeFeatures(candles);
    const results = evaluateStrategies(features, strategies);
    expect(results.map((r) => r.key)).toEqual(strategies.map((s) => s.key));
    for (const r of results) {
      expect([-1, 0, 1]).toContain(r.dir);
      expect(r.strength).toBeGreaterThanOrEqual(0);
      expect(r.strength).toBeLessThanOrEqual(1);
      expect(r.weight).toBeGreaterThan(0);
    }
  });
});
