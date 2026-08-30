# Vibe-Trading — what was adopted

Reviewed https://github.com/HKUDS/Vibe-Trading (an AI research & backtest
agent) and integrated the ideas that fit a production Convex engine without
copying its Python stack wholesale.

## Adopted concepts

1. **Evidence-based signal flow** — the engine already records every setup
   with score, confidence, consensus, independent confirmations, strategy
   keys and reasons into `signals` / `learningHistory` (provenance of each
   signal).
2. **Report-style backtesting** — `engineWorker.runBacktest` replays real
   stored candles through the exact live evaluator and returns trades, win
   rate, profit factor, avg RR and best strategies (Zipline/backtrader-style
   report, read-only).
3. **AI as advisor, never as decision-maker** — AI reviews are scheduled
   asynchronously (`ai_analysis` + `learningHistory.aiReview`) and never
   place orders; the deterministic evaluator stays in control.
4. **Research loop** — closed trades write win/loss lessons with entry/exit
   and reason, so strategy performance is continuously measurable
   (`strategyPerformance` table).

## Explicitly not copied

- The Python agent runtime, LLM-planner orchestration and browser tooling —
  they do not belong in a serverless engine.
- Any direct dependency on a specific LLM for trade decisions.
