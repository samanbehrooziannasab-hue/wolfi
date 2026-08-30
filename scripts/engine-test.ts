import { generateCandles } from "../src/convex/engineCore";
import { analyze } from "../src/convex/engineEval";
import { STRATEGY_SEEDS } from "../src/convex/strategyData";

const strategies = STRATEGY_SEEDS.map((s) => ({
  key: s[1],
  family: s[0],
  nameFa: s[3],
  weight: s[7],
}));

const now = Date.now();
let totalNonNeutral = 0;
const scores: Array<{ symbol: string; tf: string; score: number; conf: number; dir: string }> = [];

for (const sym of ["EURUSD", "XAUUSD", "BTCUSDT", "GBPJPY", "SOLUSDT"]) {
  const market = sym.endsWith("USDT") && sym !== "XAUUSD" && sym !== "XAGUSD" ? "crypto" : "forex";
  for (const tf of ["15m", "1h"]) {
    const candles = generateCandles(sym, market as any, 100, market === "crypto" ? 3 : 0.6, tf, now);
    const { aggregate, results } = analyze(candles, strategies);
    const nonNeutral = results.filter((r) => r.dir !== 0).length;
    totalNonNeutral += nonNeutral;
    scores.push({ symbol: sym, tf, score: aggregate.score, conf: aggregate.confidence, dir: aggregate.direction });
  }
}

console.log("total non-neutral strategy results across 10 analyses:", totalNonNeutral);
console.table(scores);
