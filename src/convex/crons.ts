import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// The engine runs a full multi-symbol, multi-timeframe scan every minute.
// Signals are emitted as a separate feed; positions are opened when the
// engine is autonomous and capacity remains.
const crons = cronJobs();

crons.interval(
  "engine-scan",
  { minutes: 5 },
  internal.engineWorker.runScan,
  {},
);

// Real market feed: 15m+1h candles for every enabled market (Binance crypto
// with Nobitex fallback, Yahoo forex/metals) stored in the candles table. The
// engine scan consumes these candles — no synthetic data anywhere. 15-minute
// cadence keeps data fresh (engine requires < 60 min) while minimizing the
// free-plan bandwidth/function-call footprint.
crons.interval(
  "market-feed-sync",
  { minutes: 15 },
  internal.markets.syncRealFeed,
  {},
);

// Live ticker prices (Binance ticker + Nobitex fallback) so the watchlist /
// market rows / open-position monitor always show a fresh quote.
crons.interval(
  "market-prices-sync",
  { minutes: 5 },
  internal.markets.syncRealPrices,
  {},
);

// Live USDT/Toman rate sync from SwapWallet / Nobitex so wallet conversions are accurate.
crons.interval(
  "usdt-rate-sync",
  { minutes: 10 },
  internal.swapwallet.syncSwapwalletUsdtRate,
  {},
);

// Data housekeeping: prunes old logs, AI outputs, closed trades, signals and
// transaction rows so the database stays small and reads stay under the free
// plan's per-function byte limits. Runs daily.
crons.interval(
  "data-maintenance",
  { hours: 12 },
  internal.engineData.pruneOldData,
  {},
);

// AI health probe: exercises the robust provider chain every 5 minutes and
// records which provider actually answered (auto failover + live health readout).
crons.interval(
  "ai-health-check",
  { minutes: 5 },
  internal.nodeCalls.aiHealthProbe,
  {},
);

// Daily education: auto-generates a lesson from the last 24h of user/bot/AI
// activity at 04:30 UTC (~08:00 Tehran). Items stay `pending` until an admin
// approves them (unless learning.autoApprove is on).
crons.daily(
  "daily-education",
  { hourUTC: 4, minuteUTC: 30 },
  internal.learning.generateDailyEducation,
  {},
);

// User AI chat history lives for 24h, then is purged (see aiChat.myAiChats).
crons.interval(
  "chat-history-purge",
  { hours: 6 },
  internal.aiChat.pruneChatHistory,
  {},
);

// AI review of the engine's learning history: every 6h the top recent
// learningHistory rows get an AI assessment stored as kind "learning_review"
// and surfaced in the admin AI center.
crons.interval(
  "ai-learning-review",
  { hours: 6 },
  internal.aiChat.aiReviewLearning,
  {},
);

export default crons;
