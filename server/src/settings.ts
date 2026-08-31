// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — system settings
// Stored in system_settings (key → JSONB value). Every threshold is editable
// from the Admin panel; nothing important is hardcoded in the engine.
// ─────────────────────────────────────────────────────────────────────────────
import { pool, one } from "./db.js";
import { num, now } from "./util.js";

export interface Settings {
  "engine.mode": "demo" | "live";
  "engine.autonomous": boolean;
  "engine.enabled": boolean;
  "engine.useAI": boolean;
  "telegram.enabled": boolean;
  "channel.postTrades": boolean;
  "channel.postSignals": boolean;
  "trading.liveTradingEnabled": boolean;
  "coins.referralEnabled": boolean;
  "engine.virtualCapital": number;
  "engine.scanIntervalSec": number;
  "engine.scanIntervalMinutes": number;
  "engine.maxTotalPositions": number;
  "engine.symbolScannerLimit": number;
  "engine.loopSeconds": number;
  "engine.capital": number;
  "engine.realizedPnl": number;
  "engine.tradeType": string;
  "risk.virtualCapital": number;
  "risk.realCapital": number;
  "risk.maxExposure": number;
  "risk.maxPosition": number;
  "risk.maxScaleIn": number;
  "risk.maxReentry": number;
  "risk.trailingStop": boolean;
  "risk.roiEnabled": boolean;
  "risk.roiTable": string;
  "risk.cooldownMinutes": number;
  "risk.stopOffsetATR": number;
  "risk.tp1ATR": number;
  "risk.tp2ATR": number;
  "risk.tp3ATR": number;
  "risk.trailingActivatePct": number;
  "risk.trailingDistancePct": number;
  "risk.maxDrawdownAction": string;
  "risk.aiAdvisor": boolean;
  "risk.requireFreshData": boolean;
  "risk.opportunisticEnabled": boolean;
  "ai.freeFallback": boolean;
  "ai.randomProvider": boolean;
  "ai.selfVerify": boolean;
  "ai.secondaryEnabled": boolean;
  "ai.rotationMinutes": number;
  "ai.postEntryReviewMinutes": number;
  "auth.sessionHours": number;
  "channel.id": string;
  "channel.username": string;
  "channel.inviteLink": string;
  "channel.enId": string;
  "channel.enUsername": string;
  "channel.enInviteLink": string;
  "telegram.username": string;
  "db.host": string;
  "db.port": number;
  "db.name": string;
  "db.user": string;
  "db.password": string;
  "system.domain": string;
  "system.serverIp": string;
  "markets.syncMinutes": number;
  "markets.pricesMinutes": number;
  "markets.priceSeconds": number;
  "markets.candleSeconds": number;
  "fees.takerPct": number;
  "fees.makerPct": number;
  "fees.transferPct": number;
  "fees.transferFlatUsdt": number;
  "fees.platformNormal": number;
  "fees.platformBronze": number;
  "fees.platformSilver": number;
  "fees.platformGold": number;
  "fees.platformPlatinum": number;
  "fees.includePlatformCommission": boolean;
  "learning.educationHourUTC": number;
  "learning.autoGenerate": boolean;
  "learning.autoApprove": boolean;
  "data.pruneHours": number;
  "tts.enabled": boolean;
  "tts.baseUrl": string;
  "tts.voice": string;
  "tts.speed": number;
  "tts.apiKey": string;
  "usdt.tomanRate": number;
  "coins.aiCost": number;
  "coins.rewardPrediction": number;
  "coins.rewardReferral": number;
  "coins.rewardReferralNew": number;
  "coins.packages": unknown;
  "vip.minCapital": number;
  "wallet.tomanCard": string;
  "wallet.tomanCardHolder": string;
  "wallet.swapwalletEnabled": boolean;
  "support.botUsername": string;
  "support.vipUsername": string;
  "swapwallet.apiKey": string;
  "engine.emergencyStop": boolean;
  "engine.pauseNewTrades": boolean;
  "engine.capitalAllocation": number; // % of virtual capital usable at once

  "risk.minScore": number;          // default 80 — entry threshold
  "risk.minConfidence": number;     // 0..1
  "risk.minConsensus": number;      // 0..1 (engine consensus gate)
  "risk.minConfirmations": number;  // min strategy confirmations
  "risk.minRR": number;
  "risk.riskPerTrade": number;      // % of capital risked per trade
  "risk.maxLeverage": number;
  "risk.maxOpenPositions": number;
  "risk.maxSymbolExposure": number; // % of capital on one symbol
  "risk.maxDailyLoss": number;      // % of capital per day
  "risk.maxDailyTrades": number;
  "risk.maxDrawdown": number;       // % engine-wide
  "risk.maxDCA": number;
  "risk.dcaEnabled": boolean;
  "risk.preset": "conservative" | "balanced" | "aggressive" | "custom";

  "trading.spotEnabled": boolean;
  "trading.futuresEnabled": boolean;
  "trading.allowSignals": boolean;

  "ai.enabled": boolean;
  "ai.provider": string;
  "ai.model": string;
  "ai.key": string;
  "ai.provider2": string;
  "ai.model2": string;
  "ai.key2": string;
  "ai.learningReviewHours": number; // AI learning-supervisor cadence
  "learning.autoApply": boolean;    // apply AI tuning automatically

  "chat.purgeHours": number;        // AI chat history retention (hours)

  "telegram.token": string;
  "telegram.channelEnId": string;   // English education channel
  "telegram.adminId": number;
  "telegram.assistantId": number;
  "telegram.channelId": string;
  "telegram.channelUsername": string;
  "telegram.webhookSecret": string;
  "telegram.webhookUrl": string;
  "telegram.miniAppUrl": string;

  "support.email": string;          // landing / support settings (public)
  "support.telegramBot": string;    // support bot username (public)

  "usdt.rate": number;       // USDT → USD
  "usdt.irtRate": number;    // USDT → IRT (for display)
  "usdt.network": string;    // default deposit network

  "wallet.depositEnabled": boolean;
  "wallet.withdrawEnabled": boolean;
  "wallet.minWithdraw": number;

  "notify.trade": boolean;
  "notify.signal": boolean;
  "notify.system": boolean;
  "notify.telegram": boolean;
  "notify.channel": boolean;

  "vip.requestsEnabled": boolean;
  "vip.freeTrial": boolean;        // allow the one-time free VIP trial
  "vip.trialHours": number;        // free-trial duration in hours

  "coins.enabled": boolean;        // wolf-coin economy master switch
  "coins.coinPerHour": number;     // wolf-coins burned per idle hour
  "coins.rewardProfile": number; // wolf-coins reward for completing the profile (once)
  "coins.tomanPerCoin": number;  // wolf-coins purchase rate (toman per coin)

  "market.primaryProvider": string;
  "market.fallbackProviders": string[];
  "market.demoData": boolean; // demo candle generation (demo mode only)
}

export const DEFAULT_SETTINGS: Settings = {
  "engine.mode": "demo",
  "engine.autonomous": true,
  "engine.enabled": true,
  "engine.useAI": true,
  "telegram.enabled": true,
  "channel.postTrades": true,
  "channel.postSignals": true,
  "trading.liveTradingEnabled": false,
  "coins.referralEnabled": true,
  "engine.virtualCapital": 1000,
  "engine.scanIntervalSec": 60,
  "engine.scanIntervalMinutes": 1,
  "engine.maxTotalPositions": 8,
  "engine.symbolScannerLimit": 40,
  "engine.loopSeconds": 60,
  "engine.capital": 1000,
  "engine.realizedPnl": 0,
  "engine.tradeType": "futures",
  "risk.virtualCapital": 1000,
  "risk.realCapital": 100,
  "risk.maxExposure": 35,
  "risk.maxPosition": 12,
  "risk.maxScaleIn": 0,
  "risk.maxReentry": 0,
  "risk.trailingStop": false,
  "risk.roiEnabled": false,
  "risk.roiTable": "",
  "risk.cooldownMinutes": 45,
  "risk.stopOffsetATR": 1.6,
  "risk.tp1ATR": 1.8,
  "risk.tp2ATR": 3.0,
  "risk.tp3ATR": 4.5,
  "risk.trailingActivatePct": 1.5,
  "risk.trailingDistancePct": 0.8,
  "risk.maxDrawdownAction": "pause",
  "risk.aiAdvisor": true,
  "risk.requireFreshData": true,
  "risk.opportunisticEnabled": true,
  "ai.freeFallback": true,
  "ai.randomProvider": true,
  "ai.selfVerify": false,
  "ai.secondaryEnabled": false,
  "ai.rotationMinutes": 5,
  "ai.postEntryReviewMinutes": 30,
  "auth.sessionHours": 1,
  "channel.id": "",
  "channel.username": "",
  "channel.inviteLink": "",
  "channel.enId": "",
  "channel.enUsername": "",
  "channel.enInviteLink": "",
  "telegram.username": "",
  "db.host": "",
  "db.port": 5432,
  "db.name": "",
  "db.user": "",
  "db.password": "",
  "system.domain": "",
  "system.serverIp": "",
  "markets.syncMinutes": 15,
  "markets.pricesMinutes": 5,
  "markets.priceSeconds": 300,
  "markets.candleSeconds": 900,
  "fees.takerPct": 0.1,
  "fees.makerPct": 0.05,
  "fees.transferPct": 0.5,
  "fees.transferFlatUsdt": 1,
  "fees.platformNormal": 50,
  "fees.platformBronze": 30,
  "fees.platformSilver": 15,
  "fees.platformGold": 10,
  "fees.platformPlatinum": 10,
  "fees.includePlatformCommission": true,
  "learning.educationHourUTC": 4,
  "learning.autoGenerate": true,
  "learning.autoApprove": false,
  "data.pruneHours": 12,
  "tts.enabled": true,
  "tts.baseUrl": "",
  "tts.voice": "fa-IR-FaridNeural",
  "tts.speed": 1,
  "tts.apiKey": "",
  "usdt.tomanRate": 95000,
  "coins.aiCost": 50,
  "coins.rewardPrediction": 5,
  "coins.rewardReferral": 0,
  "coins.rewardReferralNew": 5,
  "coins.packages": [],
  "vip.minCapital": 20,
  "wallet.tomanCard": "",
  "wallet.tomanCardHolder": "",
  "wallet.swapwalletEnabled": false,
  "support.botUsername": "",
  "support.vipUsername": "",
  "engine.emergencyStop": false,
  "engine.pauseNewTrades": false,
  "engine.capitalAllocation": 30,

  "risk.minScore": 80,
  "risk.minConfidence": 0.5,
  "risk.minConsensus": 0.55,
  "risk.minConfirmations": 3,
  "risk.minRR": 1.2,
  "risk.riskPerTrade": 1.5,
  "risk.maxLeverage": 20,
  "risk.maxOpenPositions": 10,
  "risk.maxSymbolExposure": 25,
  "risk.maxDailyLoss": 5,
  "risk.maxDailyTrades": 20,
  "risk.maxDrawdown": 15,
  "risk.maxDCA": 2,
  "risk.dcaEnabled": false,
  "risk.preset": "balanced",

  "trading.spotEnabled": true,
  "trading.futuresEnabled": true,
  "trading.allowSignals": true,

  "ai.enabled": true,
  "ai.provider": "gemini",
  "ai.model": "gemini-flash-latest",
  "ai.key": "",
  "ai.provider2": "openai",
  "ai.model2": "gpt-4o-mini",
  "ai.key2": "",
  "ai.learningReviewHours": 6,
  "learning.autoApply": true,

  "chat.purgeHours": 6,

  "telegram.token": "",
  "telegram.channelEnId": "",
  "telegram.adminId": 0,
  "telegram.assistantId": 0,
  "telegram.channelId": "",
  "telegram.channelUsername": "",
  "telegram.webhookSecret": "",
  "telegram.webhookUrl": "",
  "telegram.miniAppUrl": "",

  "support.email": "",
  "support.telegramBot": "",

  "usdt.rate": 1,
  "usdt.irtRate": 0,
  "usdt.network": "TRC20",

  "wallet.depositEnabled": true,
  "wallet.withdrawEnabled": true,
  "wallet.minWithdraw": 10,

  "notify.trade": true,
  "notify.signal": true,
  "notify.system": true,
  "notify.telegram": true,
  "notify.channel": true,

  "vip.requestsEnabled": true,
  "vip.freeTrial": true,
  "vip.trialHours": 48,

  "coins.enabled": true,
  "coins.coinPerHour": 60,
  "coins.rewardProfile": 10,
  "coins.tomanPerCoin": 5000,

  "swapwallet.apiKey": "",

  "market.primaryProvider": "binance",
  "market.fallbackProviders": ["bybit", "okx", "bingx", "mexc", "gate"],
  "market.demoData": true,
};

export const RISK_PRESETS: Record<string, Partial<Settings>> = {
  conservative: {
    "risk.minScore": 85,
    "risk.minConfidence": 0.6,
    "risk.minRR": 1.5,
    "risk.riskPerTrade": 0.75,
    "risk.maxLeverage": 5,
    "risk.maxOpenPositions": 4,
    "risk.maxSymbolExposure": 15,
    "risk.maxDailyLoss": 2,
    "risk.maxDailyTrades": 8,
    "risk.maxDrawdown": 8,
    "risk.maxDCA": 1,
    "risk.dcaEnabled": false,
    "engine.capitalAllocation": 20,
  },
  balanced: {
    "risk.minScore": 80,
    "risk.minConfidence": 0.5,
    "risk.minRR": 1.2,
    "risk.riskPerTrade": 1.5,
    "risk.maxLeverage": 10,
    "risk.maxOpenPositions": 8,
    "risk.maxSymbolExposure": 25,
    "risk.maxDailyLoss": 5,
    "risk.maxDailyTrades": 15,
    "risk.maxDrawdown": 15,
    "risk.maxDCA": 2,
    "risk.dcaEnabled": false,
    "engine.capitalAllocation": 30,
  },
  aggressive: {
    "risk.minScore": 75,
    "risk.minConfidence": 0.45,
    "risk.minRR": 1.0,
    "risk.riskPerTrade": 2.5,
    "risk.maxLeverage": 20,
    "risk.maxOpenPositions": 15,
    "risk.maxSymbolExposure": 40,
    "risk.maxDailyLoss": 8,
    "risk.maxDailyTrades": 30,
    "risk.maxDrawdown": 25,
    "risk.maxDCA": 3,
    "risk.dcaEnabled": true,
    "engine.capitalAllocation": 45,
  },
};

export async function getSettings(): Promise<Settings> {
  const rows = await pool
    .query("SELECT key, value FROM system_settings")
    .then((r) => r.rows)
    .catch(() => [] as any[]);
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    let v: unknown;
    try {
      v = typeof r.value === "string" ? JSON.parse(r.value) : r.value;
    } catch {
      continue;
    }
    (out as any)[r.key] = v;
  }
  return out;
}

export async function getSetting<T>(key: string, fallback?: T): Promise<T | undefined> {
  const row = await one<{ value: unknown }>("SELECT value FROM system_settings WHERE key = $1", [key]);
  if (!row) return fallback;
  try {
    const v = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    return (v === undefined ? fallback : v) as T;
  } catch {
    return (row.value === undefined ? fallback : row.value) as T;
  }
}

export async function setSetting(
  key: string,
  value: unknown,
  group = "system",
  updatedBy?: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO system_settings (key, value, group_name, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
       group_name = EXCLUDED.group_name, updated_at = EXCLUDED.updated_at,
       updated_by = EXCLUDED.updated_by`,
    [key, JSON.stringify(value ?? null), group, now(), updatedBy ?? null]
  );
}

/** Apply a named risk preset (admin). */
export async function applyRiskPreset(preset: string, by?: string | null): Promise<void> {
  const p = RISK_PRESETS[preset];
  if (!p) throw new Error("پیش‌تنظیم نامعتبر است.");
  for (const [k, v] of Object.entries(p)) {
    await setSetting(k, v, "risk", by);
  }
  await setSetting("risk.preset", preset, "risk", by);
}
