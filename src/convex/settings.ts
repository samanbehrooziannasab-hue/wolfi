// ---------------------------------------------------------------------------
// System settings store + seeding. Settings live in the system_settings table
// and are editable from the Admin panel (Settings section). No code restart
// needed to change values (bot token, channel IDs, engine mode, AI key...).
// ---------------------------------------------------------------------------
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import {
  APP_VERSION,
  SEED_ADMIN_PASSWORD,
  SEED_ADMIN_USERNAME,
  SEED_ASSISTANT_TG_ID,
  SEED_BOT_TOKEN,
  SEED_BOT_USERNAME,
  SEED_CHANNEL_ID,
  SEED_CHANNEL_USERNAME,
  SEED_DOMAIN,
  SEED_GEMINI_KEY,
  SEED_OWNER_TG_ID,
  SEED_SERVER_IP,
} from "./constants";
import { aesEncrypt, deriveDecrypt, hashPassword, randomToken } from "./crypto";
import { log } from "./logs";

export type SettingsMap = Record<string, any>;

// Default values — one object per group
export const DEFAULT_SETTINGS: Record<string, any> = {
  // ─── auth / sessions ────────────────────────────────────────────────
  "auth.sessionHours": 1, // force re-login after N hours (min 1)

  // ─── telegram ─────────────────────────────────────────────────────────
  "telegram.token": SEED_BOT_TOKEN,
  "telegram.username": SEED_BOT_USERNAME,
  "telegram.adminId": SEED_OWNER_TG_ID,
  "telegram.assistantId": SEED_ASSISTANT_TG_ID,
  "telegram.enabled": true,
  "telegram.webhookUrl": "",
  "telegram.webhookSecret": "wolf-secret-change-me",
  "telegram.miniAppUrl": SEED_DOMAIN,
  "telegram.alertsToAdmin": true,
  "telegram.notifyNewUser": true,

  // ─── channel (fa) ────────────────────────────────────────────────────
  "channel.id": SEED_CHANNEL_ID,
  "channel.username": SEED_CHANNEL_USERNAME,
  "channel.inviteLink": `https://t.me/${SEED_CHANNEL_USERNAME}`,
  "channel.required": true,
  "channel.enabled": true,
  "channel.postTrades": true,
  "channel.postSignals": true,

  // ─── channel (en) — bilingual twin channel ────────────────────────────
  "channel.enId": "",
  "channel.enUsername": "",
  "channel.enInviteLink": "",

  // ─── database / deployment credentials (encrypted at rest) ────────────
  "db.host": "",
  "db.port": "5432",
  "db.name": "",
  "db.user": "",
  "db.password": "",

  // ─── engine ──────────────────────────────────────────────────────────
  "engine.enabled": true,
  "engine.mode": "demo", // demo | live
  "engine.scanIntervalMinutes": 1,
  "markets.syncMinutes": 15, // real candle feed cadence (min)
  "markets.pricesMinutes": 5, // ticker prices cadence (min)
  "chat.purgeHours": 6, // chat history purge cadence (h)
  "ai.learningReviewHours": 6, // engine-learning AI review cadence (h)
  "learning.educationHourUTC": 4, // daily lesson generation hour (UTC)
  "data.pruneHours": 12, // data-maintenance cadence (h)
  "engine.symbolScannerLimit": 12,
  "engine.feePct": 0.1, // platform fee % of notional — charged on open + close (realistic cost model)
  "engine.slippagePct": 0.05, // price slippage % applied on fills (realistic cost model)
  "engine.maxPositionsPerSymbol": 1,
  // Legacy aliases retained so older admin clients can save without error;
  // runtime uses the canonical risk.* values and migrations remove stored rows.
  "engine.maxTotalPositions": 5,
  "engine.capital": 1000,
  "engine.realizedPnl": 0, // cumulative net P&L of closed positions — applied to engine capital
  "engine.version": APP_VERSION,
  "engine.useAI": true,
  "engine.autonomous": true, // auto open positions
  // engine.capital is a legacy alias; risk.virtualCapital is canonical.
  "engine.lastSignalAt": 0,
  "engine.lastScanAt": 0,
  "engine.startedAt": Date.now(),
  "engine.status": "ONLINE",
  "engine.heartbeat": Date.now(),
  "engine.queue": 0,
  "engine.uptime": 0,



  // ─── trading ─────────────────────────────────────────────────────────
  "trading.enabled": true,
  "trading.liveTradingEnabled": false, // LIVE is only enabled explicitly by admin
  "trading.defaultExchange": "demo",
  "trading.timeframeShort": ["1m", "5m", "15m", "30m"],
  "trading.timeframeLong": ["1h", "4h", "1d"],

  // ─── fees & platform profit share (all admin-configurable) ───────────
  "fees.takerPct": 0.1, // exchange taker fee % per fill (engine cost model)
  "fees.makerPct": 0.05, // maker fee % per fill
  "fees.transferPct": 0.5, // % fee deducted from user withdrawals/transfers
  "fees.transferFlatUsdt": 1, // flat USDT fee per withdrawal
  "fees.platformNormal": 50, // % of user's engine profit kept by the platform (no VIP)
  "fees.platformBronze": 30, // bronze VIP
  "fees.platformSilver": 15, // silver VIP
  "fees.platformGold": 10, // gold VIP
  "fees.platformPlatinum": 10, // platinum package = gold-tier rate
  "fees.includePlatformCommission": true, // master switch for the profit share

  // ─── engine loop cadence (seconds — sub-minute self-scheduled loop) ──
  // CONSERVATIVE DEFAULTS: the free Convex plan cannot sustain a 1s loop.
  // The admin can lower these to 1s on a self-hosted/paid deployment — the
  // runtime already supports it (min 1s / 10s) — without any code change.
  "engine.loopSeconds": 60, // engine scan loop (min 1s; the cron stays as watchdog)
  "markets.priceSeconds": 300, // live ticker refresh (min 1s)
  "markets.candleSeconds": 900, // candle feed refresh (min 10s)

  // ─── risk (capital normalization) ────────────────────────────────────
  "risk.virtualCapital": 1000, // engine capital
  "risk.realCapital": 100, // current exchange balance
  "risk.riskPerTrade": 1.5, // percent of capital per trade
  "risk.maxExposure": 35, // max percent of capital in use
  "risk.maxPosition": 12, // max percent of capital per position
  "risk.maxOpenPositions": 5, // hard cap on concurrent positions
  "risk.maxSymbolExposure": 15, // max percent of capital on one symbol
  "risk.maxDailyLoss": 8, // percent — engine pauses new trades above this
  "risk.maxDailyTrades": 12, // max opens per day
  "risk.maxDrawdown": 20, // percent — emergency threshold
  "risk.maxLeverage": 20,
  "risk.minRR": 1.0, // minimum risk/reward to open
  "risk.minConfidence": 0.5,
  "risk.minConsensus": 0.55, // dominant directional support across independent families
  "risk.minConfirmations": 3, // strong strategy confirmations, not raw strategy count
  "risk.minScore": 35, // score floor (1..100); consensus/confidence/RR gates still apply
  "risk.stopOffsetATR": 1.6, // SL = ATR * this
  "risk.tp1ATR": 1.8,
  "risk.tp2ATR": 3.0,
  "risk.tp3ATR": 4.5,
  "risk.trailingStop": false, // enable trailing stop on open positions
  "risk.trailingActivatePct": 1.5, // % profit before trail activates
  "risk.trailingDistancePct": 0.8, // % distance for trailing stop
  // freqtrade-style dynamic take-profit: the profit target tightens over time
  // (ROI table). Each entry = { minutes, roi } where roi is % profit required
  // to exit once the position is older than `minutes`. Later buckets are
  // lower, so winners are banked instead of being given back.
  "risk.roiEnabled": false,
  "risk.roiTable": JSON.stringify([
    { minutes: 0, roi: 10 },
    { minutes: 30, roi: 5 },
    { minutes: 60, roi: 2.5 },
    { minutes: 240, roi: 1 },
  ]),
  // freqtrade CooldownPeriod — minutes to block a re-entry on a symbol after
  // its last close (prevents revenge-trading a symbol right after a loss).
  "risk.cooldownMinutes": 45,
  // Opportunistic fallback: when a strict scan finds no setup, the engine
  // re-scans with mildly relaxed gates so quiet days still produce trades
  // (never below safety floors).
  "risk.opportunisticEnabled": true,
  // AI learning: the 6h AI review may auto-apply small bounded adjustments to
  // engine gates (score/confidence/consensus) learned from closed trades.
  "learning.autoApply": true,
  "engine.strategyPreset": "all_rounder",
  "risk.maxScaleIn": 0, // 0 = DCA/scale-in disabled
  "risk.maxReentry": 0, // 0 = re-entry on same symbol disabled
  "risk.preset": "balanced", // very_low | low | balanced | high | very_high
  "risk.aiAdvisor": true, // AI-assisted risk suggestion (never auto-applies)
  "risk.maxDrawdownAction": "pause", // pause | alert — never auto-liquidate
  "risk.requireFreshData": true, // stale/missing candles always block entry

  // ─── AI analysis layer (TradingAgents-inspired) ────────────────────────
  "ai.debateEnabled": true, // bull/bear debate + risk check on top setups
  "ai.researchEnabled": true, // research action allowed from the admin panel
  // Free LLM fallback chain (gemini → groq → openrouter :free → cerebras →
  // mistral → anthropic). Keys come from env vars (Keys tab); with at least
  // one key the AI layer keeps working even when the configured provider fails.
  "ai.freeFallback": true,
  // Random provider mode: each chat answer is generated by a RANDOM available
  // AI (the actual one is stored + shown under the reply). Set false to always
  // prefer the configured provider first.
  "ai.randomProvider": true,
  // Verbalized sampling (CHATS-lab): take a second sample with a verbalized
  // confidence and keep the most-confident answer (self-consistency).
  "ai.selfVerify": false,

  // ─── tts (openai-edge-tts — self-hosted, OpenAI-compatible) ──────────
  "tts.enabled": false,
  "tts.baseUrl": "http://127.0.0.1:5050/v1",
  "tts.voice": "fa-IR-FaridNeural", // edge-tts voice (en-US-AvaNeural, ...)
  "tts.speed": 1,
  "tts.apiKey": "", // optional — required only when the server sets REQUIRE_API_KEY=True

  // ─── emergency controls (admin only) ─────────────────────────────────
  "engine.emergencyStop": false, // hard stop: engine loop halts
  "engine.pauseNewTrades": false, // soft pause: no new positions, monitoring continues

  // ─── ai ──────────────────────────────────────────────────────────────
  "ai.provider": "gemini",
  "ai.model": "gemini-3.6-flash",
  "ai.key": SEED_GEMINI_KEY,
  "ai.enabled": true,
  "ai.systemPrompt":
    "You are WOLF AI, the analysis assistant of Trading Wolf AI, an autonomous trading & monitoring engine. Answer in Persian (فارسی) unless asked otherwise. Be precise, professional and concise.",
  // secondary AI (fallback / learning)
  "ai.provider2": "openai",
  "ai.model2": "gpt-4o-mini",
  "ai.key2": "",
  "ai.secondaryEnabled": false,
  // automatic provider health/rotation — the cron probes the chain every N
  // minutes and records which provider actually answered, so the AI layer
  // stays alive even when the configured provider hits quota limits.
  "ai.rotationMinutes": 5,
  "ai.postEntryReviewMinutes": 30, // AI re-checks open trades after this delay
  "ai.healthStatus": "unknown", // unknown | ok | degraded | error
  "ai.healthProvider": "", // the provider that answered the last probe
  "ai.healthAt": 0,
  "ai.healthMessage": "",

  // ─── usdt ────────────────────────────────────────────────────────────
  "usdt.rate": 1.0, // USDT to USD rate (admin sets per update)
  "usdt.tomanRate": 95000, // 1 USDT ≈ N Toman — displayed & used for local pricing
  "usdt.network": "TRC20", // default deposit network

  // ─── wolf-coin economy (all admin-configurable) ──────────────────────
  "coins.coinPerHour": 60, // coins deducted per hour of dashboard usage (one ledger entry per hour)
  "coins.coinPerMinute": 1, // legacy per-minute rate (kept for compatibility)
  "coins.aiCost": 50, // wolf coins charged per AI advisor question (0 = free)
  "coins.signalDetail": 10, // wolf coins charged to expand a signal's full detail view
  "coins.tomanPerCoin": 5000, // price of 1 wolf coin in toman
  "coins.rewardProfile": 10, // coins for completing the profile task
  "coins.rewardPrediction": 3, // coins for a correct prediction-game guess
  "coins.rewardReferral": 30, // coins per referred user (referrer reward)
  "coins.rewardReferralNew": 5, // coins gifted to the new user who joins via a referral link
  "coins.rewardTelegram": 25, // coins for linking an existing account to Telegram
  "coins.referralEnabled": true, // master switch for the referral reward system
  "coins.enabled": true,
  // preset coin packages the user can buy with toman: [{label,labelFa,coins,price}]
  // Sized against the monthly burn (1 coin/min × 60 × 24 × 30 ≈ 43,200 coins/month)
  "coins.packages": [
    { label: "Weekly", labelFa: "هفتگی (۷ روز)", coins: 10080, price: 250000 },
    { label: "Monthly", labelFa: "ماهانه (۳۰ روز)", coins: 43200, price: 900000 },
    { label: "Quarterly", labelFa: "سه‌ماهه (۹۰ روز)", coins: 129600, price: 2400000 },
  ],

  // ─── vip ─────────────────────────────────────────────────────────────
  "vip.minCapital": 20, // minimum capital (USDT) for a VIP investment request
  "vip.freeTrial": true, // every new user gets a free VIP trial
  "vip.trialDays": 21, // duration of the free VIP trial in days (3 weeks)
  "vip.trialHours": 504, // duration in hours (21 * 24 = 504 hours)
  "support.botUsername": SEED_BOT_USERNAME, // general online support (@username)
  "support.vipUsername": "Mamadmari", // VIP users get direct admin support
  "support.email": "motamedmohamad1@gmail.com", // public support email shown on landing
  "support.telegramBot": "@marijtradebot", // public support Telegram shown on landing

  // ─── engine ──────────────────────────────────────────────────────────
  "engine.tradeType": "futures", // spot | futures

  // ─── system ──────────────────────────────────────────────────────────
  "system.name": "Trading Wolf AI",
  "system.domain": SEED_DOMAIN,
  "system.serverIp": SEED_SERVER_IP,
  "system.lang": "fa",
  "system.theme": "dark",
  "system.maintenance": false,
  "system.engineHealth": "ONLINE",
  "system.dbHealth": "ONLINE",
  "system.tgHealth": "ONLINE",
  "system.channelHealth": "ONLINE",
  "system.aiHealth": "ONLINE",
  "system.exchangeHealth": "ONLINE",
  "system.encryptionKey": "", // AES key for secrets (derived on first run)

  // ─── daily education (auto-generated lessons for users, admin-approved) ─
  "learning.autoGenerate": true, // cron generates a daily lesson from activity
  "learning.autoApprove": true, // generated lessons appear for users right away (admin can turn this off)

  // ─── wallet ──────────────────────────────────────────────────────────
  "wallet.swapwalletEnabled": true, // use SwapWallet public OTC prices as a fill-in source
  // SwapWallet API key — editable from the Admin → SwapWallet tab (stored
  // AES-GCM encrypted like the other secrets). The SWAPWALLET_API_KEY env var
  // takes precedence when both are set.
  "swapwallet.apiKey": "",
  "wallet.systemAsset": "USDT",
  "wallet.systemNetwork": "TRC20",
  "wallet.systemAddress": "",
  "wallet.withdrawMinDays": 7, // funds must circulate in the engine this many days before unfreeze/withdraw
  "wallet.tomanCard": "", // card number for card-to-card toman deposits
  "wallet.tomanCardHolder": "", // card holder name shown to users
};

// Keys safe to expose without admin privileges
export const SETTING_KEYS = new Set([
  "system.name",
  "system.domain",
  "system.lang",
  "system.theme",
  "system.maintenance",
  "telegram.username",
  "telegram.enabled",
  "channel.username",
  "channel.required",
  "channel.enabled",
  "channel.inviteLink",
  "engine.mode",
  "engine.version",
  "engine.status",
  "engine.enabled",
  "ai.provider",
  "ai.model",
  "ai.enabled",
  "support.email",
  "support.telegramBot",
  "support.botUsername",
  "support.vipUsername",
  "usdt.tomanRate",
  "usdt.rate",
  "vip.freeTrial",
  "vip.trialDays",
  "vip.trialHours",
  "coins.tomanPerCoin",
  "coins.coinPerHour",
  "coins.packages",
]);

function mask(s: string): string {
  return s.length <= 8 ? "••••" : `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

// ─── encrypted-at-rest secrets ────────────────────────────────────────────
// These keys are stored AES-GCM encrypted (prefixed "enc:") using the system
// encryption key. Reading paths decrypt transparently, so the rest of the
// code (notify, telegram, engine…) keeps working unchanged — but a leaked
// database dump shows ciphertext, never the real token/password.
export const SECRET_KEYS = new Set([
  "telegram.token",
  "telegram.webhookSecret",
  "ai.key",
  "ai.key2",
  "db.password",
  "swapwallet.apiKey",
]);

async function getOrCreateEncryptionKey(ctx: any): Promise<string> {
  let key = (await getSetting(ctx, "system.encryptionKey")) as string | undefined;
  if (!key) {
    key = randomToken(32);
    await setSetting(ctx, "system.encryptionKey", key);
  }
  return key;
}

async function encryptSecret(ctx: any, plaintext: string): Promise<string> {
  if (!plaintext) return "";
  const key = await getOrCreateEncryptionKey(ctx);
  return `enc:${await aesEncrypt(plaintext, key)}`;
}

async function decryptSecret(ctx: any, stored: any): Promise<any> {
  if (typeof stored !== "string" || !stored.startsWith("enc:")) return stored;
  try {
    const key = (await getSetting(ctx, "system.encryptionKey")) as string | undefined;
    if (!key) return "";
    return await deriveDecrypt(stored.slice(4), key);
  } catch {
    return "";
  }
}

function maskMapSecrets(map: SettingsMap): SettingsMap {
  for (const k of SECRET_KEYS) {
    const v = map[k];
    if (typeof v === "string" && v) map[k] = mask(v);
  }
  return map;
}

// ─── helpers ───────────────────────────────────────────────────────────────

export async function getSetting(ctx: any, key: string): Promise<any> {
  const row = await ctx.db
    .query("systemSettings")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .unique();
  let value: any;
  if (row) {
    value = row.value;
  } else if (key in DEFAULT_SETTINGS) {
    value = DEFAULT_SETTINGS[key];
  } else {
    return undefined;
  }
  if (SECRET_KEYS.has(key)) return decryptSecret(ctx, value);
  return value;
}

/**
 * Cron throttle: returns true when the configured interval has elapsed since
 * the last run (stored under `<key>Last`). Lets the admin tune cron cadence
 * from settings (1 min minimum on the free platform, their own server can go
 * faster by lowering the value).
 */
export async function cronThrottle(
  ctx: any,
  lastKey: string,
  minutes: number,
  force = false,
): Promise<boolean> {
  if (force) return true;
  if (!Number.isFinite(minutes) || minutes <= 0) return true;
  const last = Number((await getSetting(ctx, lastKey)) ?? 0) || 0;
  if (Date.now() - last < minutes * 60_000) return false;
  await setSetting(ctx, lastKey, Date.now(), "cron");
  return true;
}

export async function getSettingsMap(ctx: any): Promise<SettingsMap> {
  const rows = await ctx.db.query("systemSettings").collect();
  const map: SettingsMap = {};
  for (const r of rows) map[r.key] = r.value;
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(k in map)) map[k] = v;
  }
  for (const k of SECRET_KEYS) {
    if (k in map) map[k] = await decryptSecret(ctx, map[k]);
  }
  return map;
}

export async function setSetting(
  ctx: any,
  key: string,
  value: any,
  actor?: string,
): Promise<void> {
  // Encrypt secrets at rest (single choke point — every writer goes through
  // here: saveSettings, ensureDefaults, engineControl, migrations…).
  if (SECRET_KEYS.has(key) && typeof value === "string" && value && !value.startsWith("enc:")) {
    value = await encryptSecret(ctx, value);
  }
  const existing = await ctx.db
    .query("systemSettings")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .unique();
  const group = key.split(".")[0] ?? "system";
  if (existing) {
    await ctx.db.patch(existing._id, { value, updatedAt: Date.now(), updatedBy: actor });
  } else {
    await ctx.db.insert("systemSettings", {
      key,
      value,
      group,
      description: undefined,
      updatedAt: Date.now(),
      updatedBy: actor,
    });
  }
}

// Known stale values that must be migrated when the default changes.
const SETTING_MIGRATIONS: Record<string, any> = {
  // Entry score floor is 35; consensus and confirmation gates prevent weak trades.
  "risk.minScore": 35,
  // Five concurrent positions is the single canonical default; migrate the old 3-position default.
  "risk.maxOpenPositions": 5,
  // Conservative cadence on the free plan: the sub-second defaults from an
  // earlier build burn free-tier function-call quota. Values set deliberately
  // (e.g. 1s on a paid/self-hosted server) are never overwritten.
  "engine.loopSeconds": 60,
  "markets.priceSeconds": 300,
  "markets.candleSeconds": 900,
};

export async function ensureDefaults(ctx: any, actor?: string): Promise<void> {
  const existing = await ctx.db.query("systemSettings").collect();
  const keys = new Set(existing.map((r: any) => r.key));
  const byKey: Map<string, any> = new Map(existing.map((r: any) => [r.key, r]));
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (keys.has(key)) continue;
    await ctx.db.insert("systemSettings", {
      key,
      value,
      group: key.split(".")[0] ?? "system",
      description: undefined,
      updatedAt: Date.now(),
      updatedBy: actor ?? "seed",
    });
  }
  // Collapse the two historical capital/position-cap keys into the canonical
  // risk settings. Preserve an explicitly configured legacy value once, then
  // remove the duplicate so the admin panel has one source of truth.
  const legacyCapital = byKey.get("engine.capital");
  const legacyPositions = byKey.get("engine.maxTotalPositions");
  if (!keys.has("risk.virtualCapital") && legacyCapital) {
    await setSetting(ctx, "risk.virtualCapital", Number(legacyCapital.value) || DEFAULT_SETTINGS["risk.virtualCapital"], actor ?? "migration");
    keys.add("risk.virtualCapital");
  }
  if (!keys.has("risk.maxOpenPositions") && legacyPositions) {
    const legacyPositionValue = Number(legacyPositions.value);
    await setSetting(ctx, "risk.maxOpenPositions", legacyPositionValue === 3 ? 5 : Math.min(5, Math.max(1, legacyPositionValue || 5)), actor ?? "migration");
    keys.add("risk.maxOpenPositions");
  }
  if (legacyCapital) await ctx.db.delete(legacyCapital._id);
  if (legacyPositions) await ctx.db.delete(legacyPositions._id);

  // Apply migrations to rows that already exist with a stale value.
  for (const [key, expected] of Object.entries(SETTING_MIGRATIONS)) {
    const row = byKey.get(key);
    if (!row) continue;
    const current = Number(row.value);
    // Only migrate values known to belong to the old hard-coded defaults.
    // Never overwrite an administrator's deliberate risk configuration.
    const stale =
      (key === "risk.minScore" && (current === 50 || current === 75)) ||
      (key === "risk.maxOpenPositions" && current === 3) ||
      (key === "engine.loopSeconds" && current === 5) ||
      (key === "markets.priceSeconds" && current === 5) ||
      (key === "markets.candleSeconds" && current === 60);
    if (Number.isFinite(current) && stale) {
      await ctx.db.patch(row._id, { value: expected, updatedAt: Date.now(), updatedBy: actor ?? "migration" });
    }
  }
}

/** Creates the first admin user (from constants) unless one already exists. */
export async function seedFirstAdmin(ctx: any, actor?: string): Promise<void> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_username", (q: any) => q.eq("username", SEED_ADMIN_USERNAME))
    .first();
  if (existing) return;
  const { salt, hash } = await hashPassword(SEED_ADMIN_PASSWORD);
  await ctx.db.insert("users", {
    name: "Wolf Admin",
    username: SEED_ADMIN_USERNAME,
    passwordSalt: salt,
    passwordHash: hash,
    role: "admin",
    isAdmin: true,
    enabled: true,
    canTrade: true,
    registeredAt: Date.now(),
    lastActivity: Date.now(),
    theme: "dark",
    language: "fa",
  });
  await log(ctx, "INFO", "اولین ادمین ساخته شد", `username=${SEED_ADMIN_USERNAME}`);
  void actor;
}

// ─── VIP packages (subscription plans) ─────────────────────────────────────

export async function ensureVipPackages(ctx: any): Promise<void> {
  // upsert by key so new/multi-month packages reach existing deployments
  const packages = [
    {
      key: "bronze",
      name: "Bronze",
      nameFa: "برنزی",
      price: 30,
      durationDays: 30,
      minCapital: 20,
      maxCapital: 150,
      features: ["Engine signals", "Portfolio tracking", "Telegram alerts", "5,000 Free Wolf Coins"],
      featuresFa: ["سیگنال‌های موتور", "ردیابی پرتفوی", "اعلان تلگرام", "۵٬۰۰۰ ولف‌کوین هدیه"],
      giftCoins: 5000,
      riskDisclosure: "بازدهی تضمینی وجود ندارد؛ سرمایه شما در اختیار ربات قرار می‌گیرد.",
      terms: "اشتراک ۳۰ روزه برنزی",
      status: true,
    },
    {
      key: "silver",
      name: "Silver",
      nameFa: "نقره‌ای",
      price: 75,
      durationDays: 30,
      minCapital: 151,
      maxCapital: 500,
      features: ["All Bronze", "Priority signals", "Weekly AI report", "15,000 Free Wolf Coins"],
      featuresFa: ["تمام مزایای برنزی", "سیگنال اولویت‌دار", "گزارش هفتگی هوش مصنوعی", "۱۵٬۰۰۰ ولف‌کوین هدیه"],
      giftCoins: 15000,
      riskDisclosure: "بازدهی تضمینی وجود ندارد؛ سرمایه شما در اختیار ربات قرار می‌گیرد.",
      terms: "اشتراک ۳۰ روزه نقره‌ای",
      status: true,
    },
    {
      key: "gold",
      name: "Gold",
      nameFa: "طلایی",
      price: 150,
      durationDays: 30,
      minCapital: 501,
      maxCapital: 2000,
      features: ["All Silver", "Direct admin support", "Full engine access", "50,000 Free Wolf Coins"],
      featuresFa: ["تمام مزایای نقره‌ای", "پشتیبانی مستقیم مدیر", "دسترسی کامل موتور", "۵۰٬۰۰۰ ولف‌کوین هدیه"],
      giftCoins: 50000,
      riskDisclosure: "بازدهی تضمینی وجود ندارد؛ سرمایه شما در اختیار ربات قرار می‌گیرد.",
      terms: "اشتراک ۳۰ روزه طلایی",
      status: true,
    },
    {
      key: "platinum3m",
      name: "Platinum 3M",
      nameFa: "پلاتین سه‌ماهه",
      price: 400,
      durationDays: 90,
      minCapital: 20,
      maxCapital: 10000,
      features: ["All Gold", "90-day subscription", "Capital up to $10,000", "VIP priority support", "120,000 Free Wolf Coins"],
      featuresFa: ["تمام مزایای طلایی", "اشتراک ۹۰ روزه", "سرمایه تا ۱۰٬۰۰۰ دلار", "پشتیبانی اولویت‌دار VIP", "۱۲۰٬۰۰۰ ولف‌کوین هدیه"],
      giftCoins: 120000,
      riskDisclosure: "بازدهی تضمینی وجود ندارد؛ سرمایه شما در اختیار ربات قرار می‌گیرد.",
      terms: "اشتراک ۹۰ روزه پلاتین",
      status: true,
    },
  ];
  for (const pkg of packages) {
    const existing = await ctx.db.query("vipPackages").filter((q: any) => q.eq(q.field("key"), pkg.key)).first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...pkg, key: undefined });
    } else {
      await ctx.db.insert("vipPackages", pkg);
    }
  }
}

// ─── public queries ────────────────────────────────────────────────────────

export const publicSettings = query({
  args: {},
  handler: async (ctx) => {
    // read-only: getSettingsMap merges DEFAULT_SETTINGS for unseeded keys
    const map = await getSettingsMap(ctx);
    const out: SettingsMap = {};
    for (const k of SETTING_KEYS) if (k in map) out[k] = map[k];
    for (const k of SECRET_KEYS) {
      if (map[k]) out[`${k}Mask`] = mask(String(map[k]));
    }
    return out;
  },
});

/** Public support settings for the landing page (no auth required). */
export const landingSupportSettings = query({
  args: {},
  handler: async (ctx) => {
    const map = await getSettingsMap(ctx);
    return {
      email: map["support.email"] ?? DEFAULT_SETTINGS["support.email"] ?? "",
      telegramBot: map["support.telegramBot"] ?? DEFAULT_SETTINGS["support.telegramBot"] ?? "",
    };
  },
});

export const rawSettings = internalQuery({
  args: {},
  handler: async (ctx) => getSettingsMap(ctx),
});

/** Cron throttle wrapper for actions (actions have no ctx.db). */
export const tickCron = internalMutation({
  args: { lastKey: v.string(), minutes: v.number() },
  handler: async (ctx, { lastKey, minutes }) => cronThrottle(ctx, lastKey, minutes),
});

/** Internal settings writer for cron/health probes (never client-callable). */
export const writeSettings = internalMutation({
  args: { values: v.any() },
  handler: async (ctx, { values }) => {
    for (const [k, val] of Object.entries(values ?? {})) {
      if (typeof k === "string" && k.includes(".")) {
        await setSetting(ctx, k, val, "cron");
      }
    }
  },
});

export const allSettings = query({
  args: {},
  handler: async (ctx) => {
    // read-only: getSettingsMap merges DEFAULT_SETTINGS for unseeded keys
    const map = await getSettingsMap(ctx);
    // mask every secret on the wire — clients only ever see masked placeholders
    return maskMapSecrets(map);
  },
});

// ─── five risk presets, ordered from lowest to highest risk ───────────────
// These are complete starting profiles; individual gates remain editable.
// `aiAdvisor` adds explanation only and never auto-applies AI suggestions.
export const RISK_PRESETS: Record<string, Record<string, any>> = {
  very_low: {
    "risk.riskPerTrade": 0.5,
    "risk.maxExposure": 15,
    "risk.maxPosition": 5,
    "risk.maxOpenPositions": 2,
    "risk.maxSymbolExposure": 7,
    "risk.maxDailyLoss": 3,
    "risk.maxDailyTrades": 4,
    "risk.maxDrawdown": 8,
    "risk.maxLeverage": 5,
    "risk.minRR": 1.3,
    "risk.minConfidence": 0.65,
    "risk.minScore": 55,
    "risk.stopOffsetATR": 2.0,
    "risk.tp1ATR": 2.4,
    "risk.tp2ATR": 3.6,
    "risk.tp3ATR": 5.0,
    "risk.trailingStop": true,
    "risk.trailingActivatePct": 1.0,
    "risk.trailingDistancePct": 0.5,
    "risk.maxScaleIn": 0,
    "risk.maxReentry": 0,
  },
  low: {
    "risk.riskPerTrade": 0.75,
    "risk.maxExposure": 25,
    "risk.maxPosition": 10,
    "risk.maxOpenPositions": 3,
    "risk.maxSymbolExposure": 10,
    "risk.maxDailyLoss": 4,
    "risk.maxDailyTrades": 6,
    "risk.maxDrawdown": 10,
    "risk.maxLeverage": 8,
    "risk.minRR": 1.2,
    "risk.minConfidence": 0.6,
    "risk.minScore": 45,
    "risk.stopOffsetATR": 1.8,
    "risk.tp1ATR": 2.1,
    "risk.tp2ATR": 3.4,
    "risk.tp3ATR": 4.8,
    "risk.trailingStop": true,
    "risk.trailingActivatePct": 1.2,
    "risk.trailingDistancePct": 0.6,
    "risk.maxScaleIn": 0,
    "risk.maxReentry": 0,
  },
  balanced: {
    "risk.riskPerTrade": 1.5,
    "risk.maxExposure": 35,
    "risk.maxPosition": 12,
    "risk.maxOpenPositions": 5,
    "risk.maxSymbolExposure": 15,
    "risk.maxDailyLoss": 8,
    "risk.maxDailyTrades": 12,
    "risk.maxDrawdown": 20,
    "risk.maxLeverage": 20,
    "risk.minRR": 1.0,
    "risk.minConfidence": 0.5,
  "risk.minScore": 35,
  "risk.stopOffsetATR": 1.6,
    "risk.tp1ATR": 1.8,
    "risk.tp2ATR": 3.0,
    "risk.tp3ATR": 4.5,
    "risk.trailingStop": false,
    "risk.trailingActivatePct": 1.5,
    "risk.trailingDistancePct": 0.8,
    "risk.maxScaleIn": 1,
    "risk.maxReentry": 0,
  },
  high: {
    "risk.riskPerTrade": 2.0,
    "risk.maxExposure": 45,
    "risk.maxPosition": 16,
    "risk.maxOpenPositions": 5,
    "risk.maxSymbolExposure": 20,
    "risk.maxDailyLoss": 10,
    "risk.maxDailyTrades": 16,
    "risk.maxDrawdown": 25,
    "risk.maxLeverage": 35,
    "risk.minRR": 1.1,
    "risk.minConfidence": 0.45,
    "risk.minScore": 35,
    "risk.stopOffsetATR": 1.5,
    "risk.tp1ATR": 1.7,
    "risk.tp2ATR": 2.8,
    "risk.tp3ATR": 4.2,
    "risk.trailingStop": true,
    "risk.trailingActivatePct": 1.8,
    "risk.trailingDistancePct": 1.0,
    "risk.maxScaleIn": 1,
    "risk.maxReentry": 0,
  },
  very_high: {
    "risk.riskPerTrade": 2.5,
    "risk.maxExposure": 50,
    "risk.maxPosition": 20,
    "risk.maxOpenPositions": 5,
    "risk.maxSymbolExposure": 25,
    "risk.maxDailyLoss": 12,
    "risk.maxDailyTrades": 20,
    "risk.maxDrawdown": 30,
    "risk.maxLeverage": 50,
    "risk.minRR": 1.0,
    "risk.minConfidence": 0.4,
    "risk.minScore": 35,
    "risk.stopOffsetATR": 1.4,
    "risk.tp1ATR": 1.6,
    "risk.tp2ATR": 2.6,
    "risk.tp3ATR": 4.0,
    "risk.trailingStop": true,
    "risk.trailingActivatePct": 2.0,
    "risk.trailingDistancePct": 1.2,
    "risk.maxScaleIn": 2,
    "risk.maxReentry": 1,
  },
};

/** Applies a full risk preset to the settings store (admin-guarded caller). */
const RISK_PRESET_ALIASES: Record<string, string> = {
  conservative: "low",
  aggressive: "high",
  safest: "very_low",
  safest_level: "very_low",
  maximum: "very_high",
};

export async function applyRiskPreset(
  ctx: any,
  preset: string,
  actor?: string,
): Promise<Record<string, any>> {
  const requested = String(preset ?? "").trim().toLowerCase();
  const normalized = RISK_PRESET_ALIASES[requested] ?? requested;
  const values = RISK_PRESETS[normalized];
  if (!values) throw new Error(`preset_not_found:${Object.keys(RISK_PRESETS).join(",")}`);
  const applied: Record<string, any> = {};
  for (const [key, value] of Object.entries(values)) {
    await setSetting(ctx, key, value, actor);
    applied[key] = value;
  }
  await setSetting(ctx, "risk.preset", normalized, actor);
  return { ...applied, "risk.preset": normalized, requestedPreset: requested };
}

// NOTE: settings are written through the admin-guarded `admin.saveSettings` /
// `admin.engineControl` mutations. There is intentionally NO unguarded public
// settings mutation — any client could otherwise flip engine/maintenance flags.