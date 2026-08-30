# CCXT Broker Integration

CCXT (https://github.com/ccxt/ccxt) gives the WOLF engine unified access to
**100+ exchanges** (binance, bybit, okx, bingx, bitget, kucoin, mexc, …) for
two things:

1. **Real order execution** — when the engine is in `live` mode, every new
   position is placed on the exchange as a real market order with attached
   SL/TP (exchange-native, or separate reduce-only stop/take-profit orders).
2. **Real market data** — `fetchCandles` pulls OHLCV straight from the
   exchange and stores it in the same `candles` table the engine and the
   backtester read.

## Files

| File | Role |
| --- | --- |
| `src/convex/broker.ts` | `"use node"` layer: CCXT instance, symbol mapping, actions (`testConnection`, `fetchBalance`, `fetchCandles`, `fetchPositions`, `executeOpen`, `executeClose`) |
| `src/convex/brokerData.ts` | V8-runtime DB writes/reads used by the broker actions (`recordBrokerOrder`, `markBrokerFilled`, `finalizeBrokerClose`, …) |
| `src/convex/engineWorker.ts` | Live mode schedules `internal.broker.executeOpen` on open and `internal.broker.executeClose` on SL/TP hit |
| `src/pages/Dashboard.tsx` | Admin "Reports → CCXT exchange broker" card: test connection, balance, open positions |

## Setup (Keys tab)

CCXT credentials come **only from environment variables** (Freebuff → Keys /
API keys tab). They are never stored in the database and never sent to the
client.

| Env var | Required | Default |
| --- | --- | --- |
| `CCXT_EXCHANGE` | no | `binance` |
| `CCXT_API_KEY` | yes (for live trading) | — |
| `CCXT_API_SECRET` | yes (for live trading) | — |
| `CCXT_PASSPHRASE` | okx / bitget / bybit-v5 only | — |
| `CCXT_TESTNET` | no | off (`1`/`true` enables sandbox) |

Example for a Binance testnet account:

```
CCXT_EXCHANGE=binance
CCXT_API_KEY=your_api_key
CCXT_API_SECRET=your_api_secret
CCXT_TESTNET=1
```

## How live mode works

1. Set `engine.mode = live` in the admin settings (default is `demo`).
2. On each scan, when a setup passes every risk gate, the position is
   recorded and `internal.broker.executeOpen` is scheduled.
3. `executeOpen`:
   - **No keys configured** → the position stays **paper** (graceful
     fallback, the engine keeps working as before).
   - **Keys configured** → places a market order on the exchange (futures by
     default, spot when `engine.tradeType = spot`; spot-short is refused),
     attaches SL/TP, adopts the **real fill price** as the position entry,
     and writes the order to the `orders` ledger linked to the position.
   - Order failure → the phantom position is closed as `exchange_error`
     instead of staying open in the DB.
4. When the engine's monitor detects an SL/TP hit on a live position that
   has a broker order, it schedules `executeClose` (reduce-only market close
   on the exchange) and finalizes the DB record with the real fill.
5. The exchange's own SL/TP may close the position first — `executeClose`
   handles that gracefully (still-open check, DB finalized with the current
   price).

## Admin panel

Admin → Reports tab → **CCXT exchange broker** card:

- **Test connection** — validates keys and returns non-zero balances.
- **Balance & positions** — fetches wallet balances and open positions from
  the exchange.
- Shows the active exchange + testnet state and the required env var names
  when nothing is configured.

## Developer notes

- Only `"use node"` files may use `process.env`; all DB access from the
  broker actions goes through `internal.brokerData.*` (V8) via
  `ctx.runQuery` / `ctx.runMutation`.
- Symbol mapping: engine `BTCUSDT` → CCXT `BTC/USDT`, `EURUSD` → `EUR/USD`,
  `XAUUSD` → `XAU/USD`, `GBPJPY` → `GBP/JPY`, … (longest-quote matching,
  with a 3-char fallback).
- Timeframes supported by `fetchCandles`: `1m 5m 15m 30m 1h 4h 1d`.
