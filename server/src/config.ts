// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — server configuration (env)
// Loads `.env` (or real env in production), exposes typed defaults.
// NEVER put real secrets here — read them from the environment / Admin panel.
// ─────────────────────────────────────────────────────────────────────────────
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// The repo-root `.env` is the single source of truth. The server runs as a
// subdirectory (`server/`), so plain `dotenv/config` — which resolves `.env`
// relative to CWD — misses it when a command does `(cd server && ...)`, and
// the app then falls back to the wrong default DB password ("auth_failed").
// Load the root file explicitly, then any CWD `.env` as a fallback (dotenv
// never overwrites already-set variables, so the root file wins).
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });
dotenv.config();

function str(key: string, fallback = ""): string {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
}

function num(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
}

function bool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export const config = {
  env: str("NODE_ENV", "development"),
  appName: str("APP_NAME", "Trading Wolf AI"),
  appUrl: str("APP_URL", "http://localhost:3001"),
  port: num("APP_PORT", 3001),
  role: str("ROLE", "api"), // api | worker

  databaseUrl: str("DATABASE_URL", "postgres://wolf:postgres@localhost:5432/wolf_trading"),
  redisUrl: str("REDIS_URL", "redis://localhost:6379/0"),

  appSecret: str("APP_SECRET", "dev-secret-change-me"),
  encryptionKey: str("ENCRYPTION_KEY", str("APP_SECRET", "dev-enc-key-change-me")),
  corsOrigins: str("CORS_ORIGINS", str("APP_URL", "http://localhost:3001"))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  telegram: {
    token: str("TELEGRAM_BOT_TOKEN"),
    username: str("TELEGRAM_BOT_USERNAME"),
    adminId: num("TELEGRAM_ADMIN_ID", 0),
    assistantId: num("TELEGRAM_ASSISTANT_ID", 0),
    channelId: str("TELEGRAM_CHANNEL_ID"),
    channelUsername: str("TELEGRAM_CHANNEL_USERNAME"),
    webhookSecret: str("TELEGRAM_WEBHOOK_SECRET", "wolf-secret-change-me"),
    miniAppUrl: str("TELEGRAM_MINI_APP_URL", str("APP_URL", "")),
  },

  ai: {
    enabled: bool("AI_ENABLED", true),
    provider: str("AI_PROVIDER", "gemini"),
    model: str("AI_MODEL", "gemini-flash-latest"),
    key: str("AI_KEY"),
    provider2: str("AI_PROVIDER_2", "openai"),
    model2: str("AI_MODEL_2", "gpt-4o-mini"),
    key2: str("AI_KEY_2"),
  },

  engine: {
    mode: str("ENGINE_MODE", "demo"), // demo | live
    capital: num("ENGINE_CAPITAL", 1000),
    autonomous: bool("ENGINE_AUTONOMOUS", true),
    scanIntervalMs: num("ENGINE_SCAN_INTERVAL_MS", 60_000),
    minScore: num("RISK_MIN_SCORE", 80),
    minConfidence: num("RISK_MIN_CONFIDENCE", 0.5),
    riskPerTrade: num("RISK_RISK_PER_TRADE", 1.5),
    maxLeverage: num("RISK_MAX_LEVERAGE", 20),
  },
};

export type ServerConfig = typeof config;
