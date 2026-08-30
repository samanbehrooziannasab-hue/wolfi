# Freqtrade — what was adopted

Freqtrade (https://github.com/freqtrade/freqtrade) is a Python trading bot.
Its runtime cannot run inside the Convex serverless engine, so we adopted its
proven **trading concepts** instead — implemented natively in the engine.

## 1. Dynamic ROI take-profit (time-based exits)

Freqtrade's signature feature: the profit target **tightens over time**.

- Setting `risk.roiEnabled` turns it on.
- `risk.roiTable` is a JSON array of `{ minutes, roi }` buckets, e.g.
  `[{"minutes":0,"roi":10},{"minutes":30,"roi":5},{"minutes":60,"roi":2.5},{"minutes":240,"roi":1}]`
  → after 0 min a 10% target, after 30 min 5%, after 1 h 2.5%, after 4 h 1%.
- The monitor (`monitorOpenPositions`) computes the ROI target for the
  position's age and tightens the take-profit to
  `entry × (1 + roi%)` — it only ever tightens the static ATR target, never
  loosens it, so winners get banked instead of given back.

## 2. CooldownPeriod protection

Freqtrade blocks re-entering a pair for a while after a trade ends.

- Setting `risk.cooldownMinutes` (default 0 = off).
- After a symbol's last close, `scan()` blocks new entries on that symbol
  until `closeTime + cooldownMinutes`. This prevents revenge-trading a
  symbol right after a stop-out.

## 3. Hyperopt-style parameter tuning

Freqtrade's `hyperopt` finds the best strategy parameters by backtesting
many combinations. We added `engineWorker.runTuner` (admin-only action):

- Replays the **real stored candles** (top enabled markets × 15m/1h).
- The per-candle multi-strategy analysis is computed **once per window** and
  replayed across a grid of 16 combinations:
  - stop ATR ∈ {1.4, 1.8}
  - target ATR ∈ {1.8, 2.4}
  - risk per trade ∈ {1%, 2%}
  - min score ∈ {30, 45}
- Ranks combos by risk-adjusted score
  (`avgPnl × ln(1+trades) − 0.4 × maxDrawdown`), with win rate, profit
  factor, Sharpe and max drawdown per combo.
- Admin panel (Reports → Parameter tuning) shows the top 8 and has an
  **Apply** button that writes the winning combo to the live settings
  (`risk.stopOffsetATR`, `risk.tp1ATR`, `risk.riskPerTrade`, `risk.minScore`).
- Safety gates (consensus, independent confirmations, fresh data, exposure
  caps) are untouched by tuning.

## 4. Freqtrade-style backtest metrics

`runBacktest` now also reports:

- `maxDrawdownPct` — equity-curve drawdown across trades
- `sharpe` — mean/std of per-trade returns
- `bestTradePct` / `worstTradePct`

## Settings summary

| Setting | Default | Meaning |
| --- | --- | --- |
| `risk.roiEnabled` | `false` | enable time-based take-profit |
| `risk.roiTable` | JSON (10/5/2.5/1 % buckets) | minutes → profit % targets |
| `risk.cooldownMinutes` | `0` | re-entry cooldown per symbol after a close |
