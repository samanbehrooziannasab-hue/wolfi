# ⚙️ Trading Engine

## Pipeline (per scan cycle, every symbol)

```
Market data (real, multi-provider fallback)
   → indicators (EMA, RSI, MACD, ATR, Bollinger, ADX, volume)
   → multi-timeframe views (1m → 1d)
   → strategy consensus (weighted votes, 100+ strategies)
   → conflict detection
   → score (0-100) + confidence + RR
   → risk validation (limits, exposure, daily caps)
   → ATOMIC position open  (DB unique index on symbol)
   → monitoring (SL / TP / trailing / re-analysis)
   → close → realized PnL → ledger + learning + Telegram alert
```

## Hard rules (cannot be bypassed from UI)

| Rule | Enforced by |
|---|---|
| One position per symbol (any direction) | `UNIQUE(open_positions.symbol)` + `pg_advisory_xact_lock` |
| No long + short on the same symbol | the unique index above |
| Score below `risk.minScore` (default **80**) → NO TRADE | engine `computeDecision` gate |
| Strong strategy conflict → NO TRADE | `conflict` flag (both sides > 28% weight) |
| Stale / insufficient data → NO TRADE | freshness + ≥3 timeframes + ≥50 candles |
| AI never opens orders | AI is advisory only |

## Score composition (0–100)

- strategy agreement (long vs short share) — up to 30
- multi-timeframe trend alignment — up to 15
- market structure (BOS/CHoCH/HH-HL) — up to 8
- momentum agreement — up to 7
- trend strength via ADX (±5, penalty in choppy markets)
- base 40 — a strong setup reaches 80+ only with real confluence

## Multi-timeframe

Every symbol is analyzed on `1m 5m 15m 30m 1h 4h 1d`. Short-term setups
favor the lower TFs, swing/long-term use `4h/1d`. The final bias is the
weighted agreement across all enabled timeframes.

## Risk engine (all admin-configurable)

`risk.minScore` (80) · `risk.minConfidence` (0.5) · `risk.minRR` (1.2) ·
`risk.riskPerTrade` (1.5%) · `risk.maxLeverage` (20) · `risk.maxOpenPositions`
(10) · `risk.maxSymbolExposure` (25%) · `risk.maxDailyLoss` (5%) ·
`risk.maxDailyTrades` (20) · `risk.maxDrawdown` (15%) · `risk.maxDCA` (2) ·
`risk.dcaEnabled` (off)

Presets: **conservative / balanced / aggressive** — one click from the Admin
panel, plus an AI advisor that suggests a preset from your answers.

## Capital model

- `engine.virtualCapital` — the capital the engine sizes positions from.
- Position size = risk-based (`riskPerTrade%` of capital) capped by
  `capitalAllocation%` and `maxSymbolExposure%`.
- Real orders (live mode) are always sized from the **real exchange
  balance**; the engine never sends orders larger than the account holds.

## Monitoring

Open positions are re-checked every tick: SL/TP hit → close with reason
(`stop_loss` / `take_profit` / `manual` / `emergency_close_all` …). Healthy
positions are **not** touched just because the trend wobbles — only rule-based
exits are taken.

## Learning

Every closed trade writes a `learning_history` record (result, PnL, lessons)
and updates `strategy_performance` (win rate, profit factor, avg PnL).
An AI review is attached when AI is configured — it is advisory and never
blocks the engine.

## Demo vs Live

- **Demo**: real market data is fetched whenever available; the synthetic
  candle generator is used **only** as a fallback and is clearly labeled
  (paper positions, `mode: demo`).
- **Live**: requires admin activation with the confirmation phrase (audited).
  No live order is ever placed before that.
