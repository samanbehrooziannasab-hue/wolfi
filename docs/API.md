# 🔌 API Reference

Base URL: `https://your.domain` · Auth: `Authorization: Bearer <token>` (from
`POST /api/auth/login` or `/api/auth/miniapp`)

## Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | – | username + password → `{token, user}` |
| POST | `/api/auth/miniapp` | – | verified Telegram initData → session |
| POST | `/api/auth/logout` | user | revoke session |
| GET | `/api/auth/me` | user | current profile |
| POST | `/api/auth/change-password` | user | old + new password |

## User

| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard` | wallet, own positions (capital hidden), notifications, signals, VIP |
| GET | `/api/wallet` | balance, transactions, deposit addresses |
| POST | `/api/wallet/deposit` | submit deposit (network + txid) |
| POST | `/api/wallet/withdraw` | request withdrawal (network + address) |
| GET | `/api/vip/packages` | active VIP packages |
| POST | `/api/vip/request` | request a package with capital |
| GET | `/api/support/tickets` · POST · `/api/support/tickets/:id` · POST `/messages` | support |
| GET | `/api/referral` | own referral code/link/stats |
| GET | `/api/markets` | markets + live prices |
| GET | `/api/markets/:symbol/candles?tf=15m` | chart candles |
| GET | `/api/markets/:symbol/analysis` | engine analysis + AI summary |
| GET | `/api/markets/:symbol/position` | open position on a symbol |
| GET | `/api/signals/recent` | recent signals |
| GET | `/api/notifications` · POST `/api/notifications/read` | notifications |
| GET | `/api/coins` | wolf-coins + toman balance, ledger, reward flags |
| POST | `/api/coins/voucher/redeem` | redeem a voucher code for wolf coins |
| POST | `/api/coins/claim-reward` | one-time profile-completion wolf-coins reward |
| POST | `/api/coins/buy` | buy wolf coins with toman balance (`coins.tomanPerCoin`) |
| GET | `/api/coins/packages` | buyable coin packages (from `coins.packages` setting) |
| POST | `/api/coins/package` | buy a package by index with toman balance |
| GET | `/api/coins/predictions` | your prediction-game history |
| POST | `/api/coins/prediction/start` | start the hourly candle-forecast game (deterministic demo candles) |
| POST | `/api/coins/prediction/resolve` | resolve a prediction (reward + streak bonus) |
| GET | `/api/coins/quiz/history` | your quiz history |
| POST | `/api/coins/quiz/start` | start a random education quiz |
| POST | `/api/coins/quiz/resolve` | answer the quiz (reward on correct) |
| POST | `/api/signals/:id/unlock` | pay wolf coins once to unlock full signal detail |
| POST | `/api/wallet/unfreeze` | request release of engine-frozen USDT (admin confirms) |

## Admin (all require admin token)

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/overview` | engine health, stats, logs, exchanges, AI |
| GET · POST · PATCH | `/api/admin/users` · `/api/admin/users/:id` | manage users (create VIP, block, reset password) |
| GET | `/api/admin/wallet/transactions` | ledger |
| POST | `/api/admin/wallet/transactions/:id/confirm` | confirm/reject deposit & withdrawal |
| GET · POST | `/api/admin/wallet/addresses` | deposit addresses per network |
| GET · POST | `/api/admin/settings` | full settings (secrets masked) |
| POST | `/api/admin/settings/preset` | apply risk preset (conservative/balanced/aggressive) |
| POST | `/api/admin/settings/ai-risk-advice` | AI suggests a preset |
| POST | `/api/admin/emergency/stop` · `/pause` · `/close-all` | emergency controls |
| POST | `/api/admin/engine/scan` | trigger a scan now |
| POST | `/api/admin/engine/mode` | demo ⇄ live (requires confirmation phrase) |
| POST | `/api/admin/engine/backtest` | replay stored candles through the live gates → full report |
| POST | `/api/admin/engine/tuner` | hyperopt-style grid over minScore/minConfidence |
| POST | `/api/admin/engine/research` | AI research snapshot of top markets (stored in `ai_analysis`) |
| GET | `/api/admin/positions` · POST `/api/admin/positions/:id/close` | positions |
| POST | `/api/admin/positions/open` | manually open a position (live candle analysis, atomic) |
| POST | `/api/admin/positions/:id/telegram` | send a position card (chart PNG + text) to the channel |
| GET | `/api/admin/reports?period=daily|weekly|monthly|all` | trading reports (win rate, PF, Sharpe, drawdown, best strategy/symbol) |
| GET | `/api/admin/ai/usage` | AI usage stats (by kind/provider/user, errors) |
| POST | `/api/admin/ai/clear` | wipe AI history (optionally by kind) |
| POST | `/api/admin/education/generate-day` | AI-generated daily lesson (dedup by day, `force: true` to overwrite) |
| POST | `/api/admin/telegram/chart` | watermarked chart PNG (optional entry/SL/TP lines) sent to the channel |
| GET · POST · PATCH · POST `/test` | `/api/admin/exchanges...` | exchange API center |
| GET · POST · PATCH · POST `/test` | `/api/admin/ai/providers...` | AI gateway |
| POST | `/api/admin/notify` | notify user/vip/all (+ Telegram) |
| GET · PATCH | `/api/admin/vip/packages` · `/:key` | VIP packages |
| GET · POST | `/api/admin/vip/requests` · `/:id/review` | VIP requests |
| GET · POST | `/api/admin/support/tickets` · `/:id/reply` | support admin |
| GET | `/api/admin/referrals` | referrals |
| GET | `/api/admin/learning` | learning history + strategy performance |
| GET | `/api/admin/logs` | engine + audit logs (filter/search) |
| POST | `/api/admin/history/clear` | admin-only cleanup of engine, audit and learning history; requires `confirm: CLEAR_HISTORY` |
| PATCH | `/api/admin/markets/:symbol` | enable/disable, type, network, priority |
| POST | `/api/admin/telegram/set-webhook` | set bot webhook |

## Parity endpoints (Convex → REST)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/settings/public` | public/landing settings (support email/bot, feature flags) — no auth |
| POST | `/api/auth/preferences` | update profile/display preferences (`language`, `theme`, `phone`, `name`, `firstName`, `lastName`, `gender`, `birthday`, `defaultTimeframe`, `defaultMarket`, `notificationsEnabled`) |
| POST | `/api/auth/ai-preference` | per-user AI provider/model for WOLF AI chats |
| POST | `/api/auth/free-trial` | one-time free VIP trial (settings: `vip.freeTrial`, `vip.trialHours`) |
| GET | `/api/signals/my` | user's signal board with paid unlocks marked |
| POST | `/api/ai/prune` | user clears their own AI chat history |
| POST | `/api/wallet/deposit-toman` | card-to-card toman deposit request (pending IRT deposit + admin Telegram notice) |
| POST | `/api/coins/burn` | manual wolf-coin idle burn (also runs automatically on login) |
| GET | `/api/admin/users/:id` | full account detail: wallets, ledger, coin transactions, audit, notifications, closed positions |
| POST | `/api/admin/positions/send-all-telegram` | send every open position digest to the channel |
| POST | `/api/admin/telegram/send` | admin → user Telegram direct message (`userId` = user id/username) |
| GET | `/api/admin/education/days` | pending lessons grouped by day |
| POST | `/api/admin/education/:id/send` | send a lesson to the FA/EN channel (`lang: fa|en`) |
| POST | `/api/admin/education/:id/media` | regenerate lesson cover image (`kind: image`); audio needs an external TTS |
| GET | `/api/monitor/stats` | runtime stats: Node version, memory, CPU, uptime, engine flags, DB row counts |
| GET | `/api/admin/ai/tuning-context` | current gates, strategy performance, recent learning (AI supervisor input) |
| POST | `/api/admin/ai/review-learning` | run the AI learning review (bounded auto-tuning when `learning.autoApply` is on) |
| POST | `/api/admin/ai/tuning` | bounded manual gate tuning (`key` = `risk.*`, `value`) |
| POST | `/api/admin/ai/strategy-weight` | set a strategy weight (0.3–1.5) |
| POST | `/api/admin/ai/suggest` | AI proposes 3 new strategies (stored as `strategy_suggest`) |

## Telegram webhook

`POST /telegram/webhook` — guarded by `X-Telegram-Bot-Api-Secret-Token`.
Flow: `/start` → membership check → phone request → Mini App button.

## Realtime (WebSocket)

`wss://your.domain/ws` — broadcasts `{type:"snapshot", positions, markets}`
every 10s for live dashboards.
