// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — REST API + WebSocket + Telegram webhook (Hono)
// Runs as the `api` process (PM2: wolf-api / docker: api).
// All admin routes are guarded by isAdmin; secrets never leave the server.
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { pool, one, many, tx, audit, logEngine, setEngineState, getEngineState, type Row } from "./db.js";
import { redis, rateLimit, redisOk, cacheGet, cacheSet } from "./redis.js";
import { config } from "./config.js";
import { num, now, round, clean, mask, ipFrom, referralCode, randomToken } from "./util.js";
import {
  loginWithPassword, authUserFromToken, revokeToken, changePassword,
  setUserPassword, createSession, toAuthUser, isAdmin, isStaff, canTrade, hashPassword,
} from "./auth.js";
import type { AuthUser } from "./auth.js";
import {
  getSettings, setSetting, applyRiskPreset, getSetting, DEFAULT_SETTINGS,
} from "./settings.js";
import { encryptSecret, decryptSecret } from "./util.js";
import { adapters, paperAdapter, fetchTicker, fetchKlines } from "./exchanges.js";
import { aiAsk, aiAskJson } from "./ai.js";
import { handleTelegramUpdate, sendMessage, sendPhoto, setWebhook, getWebhookInfoApi, verifyInitData, miniAppLogin, invalidateTelegramTokenCache } from "./telegram.js";
import { engineTick, closePosition, closeAllPositions, emergencyStop } from "./engine.js";
import { startPrediction, resolvePrediction, startQuiz, resolveQuiz, buyCoinPackage, unlockSignalDetail, coinPackages } from "./game.js";
import { runBacktest, runTuner, manualOpen, runResearch } from "./engine-tools.js";
import { renderCandleChartPng } from "./chartImage.js";
import {
  publicSettingsData, updateUserPreferences, setUserAiPreference, grantFreeTrial,
  burnWolfCoins, pruneOwnChat, tuningContext, aiReviewLearning, suggestStrategies,
  userDetailData, sendEducationToChannel, regenerateEducationMedia,
  sendAllPositionsToTelegram,
} from "./ai-learning.js";
import { publicStrategies, strategyFamilies } from "./rest-parity.js";
import { listStrategyPresets, applyStrategyPreset } from "./strategy-presets.js";
import { swapwalletBase, prices as swapPrices, balances as swapBalances, transactions as swapTransactions, transaction as swapTransaction, fastSwap, quote as swapQuote, executeQuote, withdrawConfig as swapWithdrawConfig, withdraw as swapWithdraw } from "./swapwallet.js";

export const app = new Hono();

app.onError((error, c) => {
  const message = String((error as any)?.message ?? "خطای داخلی سرور");
  if (["close_price_equals_entry", "invalid_close_price", "invalid_position_values", "invalid_entry_price", "invalid_position_size", "invalid_exit_levels", "exit_level_equals_entry", "exit_levels_wrong_side"].includes(message)) {
    return c.json({ error: message === "close_price_equals_entry" ? "قیمت خروج با قیمت ورود برابر است و پوزیشن بسته نشد." : "مقادیر قیمت پوزیشن معتبر نیستند." }, 400);
  }
  console.error("[api] unhandled error", error);
  return c.json({ error: "خطای داخلی سرور" }, 500);
});

app.use("*", cors({ origin: config.corsOrigins, credentials: true }));
app.use("*", logger());

// ── auth helpers ─────────────────────────────────────────────────────────────
async function getUser(c: any): Promise<AuthUser | null> {
  const auth = c.req.header("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token ? authUserFromToken(token) : null;
}

async function requireUser(c: any, next: any): Promise<Response | void> {
  const u = await getUser(c);
  if (!u) {
    return c.json({ error: "نشست شما منقضی شده است. دوباره وارد شوید." }, 401);
  }
  c.set("user", u);
  await next();
}

async function requireAdmin(c: any, next: any): Promise<Response | void> {
  const u = await getUser(c);
  if (!u) return c.json({ error: "نشست شما منقضی شده است." }, 401);
  if (!isAdmin(u)) return c.json({ error: "دسترسی شما کافی نیست." }, 403);
  c.set("user", u);
  await next();
}

async function requireStaff(c: any, next: any): Promise<Response | void> {
  const u = await getUser(c);
  if (!u) return c.json({ error: "نشست شما منقضی شده است." }, 401);
  if (!isStaff(u)) return c.json({ error: "دسترسی شما کافی نیست." }, 403);
  c.set("user", u);
  await next();
}

function userOf(c: any): AuthUser {
  return c.get("user");
}

async function resolveSwapWalletKey(): Promise<string> {
  const envKey = process.env.SWAPWALLET_API_KEY?.trim();
  if (envKey) return envKey;
  const stored = await getSetting<string>("swapwallet.apiKey");
  if (!stored) return "";
  try {
    const decrypted = decryptSecret(stored);
    return decrypted || stored;
  } catch {
    return stored;
  }
}

function maskSecretValue(value: string): string {
  return value ? `${value.slice(0, 7)}•••${value.slice(-4)}` : "";
}

// ── health ───────────────────────────────────────────────────────────────────
app.get("/health", async (c) => {
  const [db, rk] = await Promise.all([dbOk(), redisOk()]);
  let engine = false;
  try {
    const heartbeat = await getEngineState("heartbeat");
    engine = heartbeat?.at ? now() - num(heartbeat.at) < 180_000 : false;
  } catch { /* DB down — engine is stale */ }
  return c.json({
    ok: db && rk,
    app: config.appName,
    time: now(),
    db,
    redis: rk,
    engine,
  });
});

async function dbOk(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

// ── auth ─────────────────────────────────────────────────────────────────────
app.post("/api/auth/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ip = ipFrom(c);
  if (!(await rateLimit(`login:${ip}`, 10, 60))) {
    return c.json({ error: "تعداد تلاش زیاد شد. کمی بعد امتحان کنید." }, 429);
  }
  try {
    const { user, token } = await loginWithPassword(
      clean(body.username, 100),
      String(body.password ?? ""),
      ip
    );
    await burnWolfCoins(user.id).catch(() => undefined);
    return c.json({ token, user });
  } catch (e: any) {
    return c.json({ error: e.message || "نام کاربری یا رمز عبور صحیح نیست." }, 401);
  }
});

app.post("/api/auth/miniapp", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ip = ipFrom(c);
  if (!(await rateLimit(`miniapp:${ip}`, 20, 60))) {
    return c.json({ error: "تعداد تلاش زیاد شد." }, 429);
  }
  try {
    const r = await miniAppLogin(String(body.initData ?? ""), ip);
    if (!r) return c.json({ error: "حسابی با این تلگرام یافت نشد. ابتدا از ربات شروع کنید." }, 401);
    await burnWolfCoins(r.user.id).catch(() => undefined);
    return c.json({ token: r.token, user: r.user });
  } catch (e: any) {
    return c.json({ error: e.message || "داده تلگرام معتبر نیست." }, 401);
  }
});

app.post("/api/auth/logout", async (c) => {
  const auth = c.req.header("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token) await revokeToken(token);
  return c.json({ ok: true });
});

app.get("/api/auth/me", requireUser, (c) => c.json({ user: userOf(c) }));

app.post("/api/auth/change-password", requireUser, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    await changePassword(userOf(c), String(body.old ?? ""), String(body.new ?? ""));
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.post("/api/auth/preferences", requireUser, async (c) => {
  const u = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  try {
    const changed = await updateUserPreferences(u.id, body);
    await audit("profile.updated", u.username, u.id, "user", changed.join(","));
    return c.json({ ok: true, changed });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.post("/api/auth/ai-preference", requireUser, async (c) => {
  const u = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  try {
    await setUserAiPreference(u.id, String(body.provider ?? ""), body.model ? String(body.model) : undefined);
    await audit("profile.ai_preference", u.username, u.id, "user", { provider: clean(body.provider, 40) });
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Connect a Telegram handle/ID to the signed-in account (Dashboard profile).
app.post("/api/auth/telegram/connect", requireUser, async (c) => {
  const u = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const tgId = num(body.tgId, 0);
  const tgUsername = clean(body.tgUsername ?? body.username, 64).replace(/^@/, "");
  if (!tgId && !tgUsername) return c.json({ error: "آیدی تلگرام لازم است." }, 400);
  await pool.query(
    `UPDATE users SET
       tg_id = COALESCE(NULLIF($1::bigint, 0), tg_id),
       tg_username = COALESCE(NULLIF($2, ''), tg_username)
     WHERE id = $3`,
    [tgId || null, tgUsername || null, u.id],
  );
  await audit("profile.telegram_connect", u.username, u.id, "user", { via: tgId ? "id" : "username" });
  return c.json({ ok: true });
});

app.post("/api/auth/free-trial", requireUser, async (c) => {
  const u = userOf(c);
  const r = await grantFreeTrial(u.id, u.username);
  if (!r.ok) {
    return c.json({
      error:
        r.reason === "disabled" ? "دوره آزمایشی رایگان موقتاً غیرفعال است." :
        r.reason === "already_has_package" ? "شما از قبل پکیج فعال دارید." : "امکان فعال‌سازی وجود ندارد.",
    }, 400);
  }
  return c.json({ ok: true });
});

// ── user dashboard ───────────────────────────────────────────────────────────
app.get("/api/dashboard", requireUser, async (c) => {
  const u = userOf(c);
  const wallet = await one(
    "SELECT * FROM wallets WHERE user_id = $1 AND asset = 'USDT' LIMIT 1",
    [u.id]
  );
  const transactions = await many(
    "SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
    [u.id]
  );
  // user-visible positions: NO internal margin/size/engine capital
  const openPositions = await many(
    `SELECT p.id, p.symbol, p.market, p.side, p.entry,
            COALESCE(m.last_price::numeric, p.current) AS current,
            p.pnl, p.pnl_pct, p.score, p.confidence,
            p.strategy_keys, p.stop_loss, p.take_profit, p.leverage, p.open_time, p.type, p.progress, p.mode
       FROM open_positions p
       LEFT JOIN markets m ON m.symbol = p.symbol
       WHERE p.status = 'open' ORDER BY p.open_time DESC`
  );
  const closedPositions = await many(
    `SELECT id, symbol, market, side, entry, close_price, close_time, close_reason, pnl, pnl_pct,
            score, strategy_keys, type, mode
       FROM closed_positions WHERE 1=1 ORDER BY close_time DESC LIMIT 30`
  );
  const notifications = await many(
    "SELECT * FROM notifications WHERE user_id = $1 OR broadcast = true ORDER BY created_at DESC LIMIT 30",
    [u.id]
  );
  const signals = await many(
    `SELECT id, symbol, direction, entry, stop_loss, take_profit, score, confidence, strategy_keys, created_at, mode
       FROM signals WHERE status = 'open' ORDER BY created_at DESC LIMIT 10`
  );
  const vipReq = await one(
    "SELECT * FROM vip_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
    [u.id]
  );
  const contract = await one(
    "SELECT * FROM vip_contracts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
    [u.id]
  );
  const totalPnl = await one(
    "SELECT COALESCE(SUM(profit),0)::text AS pnl, COUNT(*)::int AS trades FROM closed_positions WHERE 1=1"
  );
  return c.json({
    user: u,
    wallet,
    transactions,
    openPositions,
    closedPositions,
    notifications,
    signals,
    vipRequest: vipReq,
    contract,
    stats: { totalPnl: num(totalPnl?.pnl), trades: num(totalPnl?.trades) },
    usdtRate: (await getSetting<number>("usdt.rate")) ?? 1,
  });
});

// ── wallet ───────────────────────────────────────────────────────────────────
// ── engine overview for the dashboard header (Convex-compatible shape) ─────
app.get("/api/overview", requireUser, async (c) => {
  const [openAgg, closes, signalsRows, marketsRows, strategiesAgg, lessons, logsRows, settings] =
    await Promise.all([
      one(`SELECT COUNT(*)::int n, COALESCE(SUM(pnl),0)::text pnl, COALESCE(SUM(size),0)::text sz FROM open_positions`),
      many(`SELECT profit, close_reason FROM closed_positions ORDER BY close_time DESC LIMIT 60`),
      many(`SELECT symbol, direction, score, confidence, price, status, created_at AS created FROM signals ORDER BY created_at DESC LIMIT 100`),
      many(`SELECT enabled, market FROM markets`),
      one(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE enabled)::int en FROM strategies`),
      many(`SELECT id, symbol, timeframe, strategies, signal, decision, result, pnl, ai_review AS "aiReview", lessons, created_at AS created FROM learning_history ORDER BY created_at DESC LIMIT 12`),
      many(`SELECT level, message, meta, created_at AS created FROM engine_logs ORDER BY created_at DESC LIMIT 14`),
      (await getSettings()) as unknown as Record<string, any>,
    ]);
  let hb: any = null, st: any = null, scan: any = null;
  try { st = await getEngineState("status"); } catch {}
  try { hb = await getEngineState("heartbeat"); } catch {}
  try { scan = await getEngineState("last_scan"); } catch {}

  const closedTotal = closes.length;
  const wins = closes.filter((p) => p.close_reason === "take_profit" || Number(p.profit) > 0).length;
  const realizedPnl = closes.reduce((sum, x) => sum + Number(x.profit ?? 0), 0);
  const openSignals = signalsRows.filter((x) => x.status === "open");

  const heartbeatFresh = hb?.at ? now() - num(hb.at) < 180_000 : false;
  return c.json({
    engine: {
      status: heartbeatFresh ? "ONLINE" : "OFFLINE",
      state: String(st?.state ?? "idle"),
      lastTickMs: num((st as any)?.lastTickMs) || num((hb as any)?.lastTickMs) || 0,
      mode: String(settings["engine.mode"] ?? "demo"),
      enabled: settings["engine.enabled"] !== false,
      autonomous: settings["engine.autonomous"] !== false,
      version: String(settings["engine.version"] ?? "1.0.0"),
      lastSignalAt: Number(settings["engine.lastSignalAt"] ?? 0),
      lastScanAt: Number(scan?.at ?? 0),
      heartbeat: Number(hb?.at ?? 0),
    },
    positions: {
      open: num(openAgg?.n),
      openPnl: num(openAgg?.pnl),
      sizeExposure: num(openAgg?.sz),
      closed: closedTotal,
      wins,
      losses: closedTotal - wins,
      winRate: closedTotal > 0 ? Math.round((wins / closedTotal) * 1000) / 10 : 0,
      realizedPnl,
    },
    markets: {
      total: marketsRows.filter((m) => m.enabled).length,
      forex: marketsRows.filter((m) => m.enabled && m.market === "forex").length,
      crypto: marketsRows.filter((m) => m.enabled && m.market === "crypto").length,
    },
    strategies: {
      total: num(strategiesAgg?.total),
      enabled: num(strategiesAgg?.en),
    },
    signals: {
      open: openSignals.length,
      recent: openSignals
        .slice(0, 6)
        .map((sg) => ({
          symbol: sg.symbol,
          direction: sg.direction,
          score: sg.score,
          confidence: sg.confidence,
          price: sg.price,
          created: sg.created,
        })),
    },
    lessons,
    logs: logsRows.map((l) => ({ ...l, meta: l.meta ? safeJson(l.meta) : null })),
    portfolio: {
      // Engine capital is the base setting PLUS cumulative realized P&L so
      // closed trades actually move the number (matches the Convex engine).
      capital: (Number(settings["engine.capital"] ?? settings["engine.virtualCapital"] ?? settings["risk.virtualCapital"] ?? 1000) || 1000) + realizedPnl,
      equity: 0,
      unrealizedPnl: num(openAgg?.pnl),
      realizedPnl,
    },
  });
});

function safeJson(v: any): any {
  if (v == null) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(String(v)); } catch { return v; }
}

// ── user "My Account" page (Convex admin.myAccount-compatible shape) ────────
app.get("/api/account", requireUser, async (c) => {
  const u = userOf(c);
  const [wallet, txns, addresses, allWallets, opens, closes, contracts, activeContract, settings] =
    await Promise.all([
      one(`SELECT * FROM wallets WHERE user_id = $1 AND asset = 'USDT' ORDER BY id LIMIT 1`, [u.id]),
      walletTxns(u.id),
      many(`SELECT id, asset, network, address, memo, kind FROM wallet_addresses WHERE enabled = true AND address <> ''`),
      one(`SELECT COALESCE(SUM(frozen),0)::text engaged FROM wallets`),
      many(`SELECT id, symbol, market, side, entry, current, pnl, pnl_pct, size, leverage, score, status, open_time FROM open_positions WHERE user_id IS NULL OR user_id = $1 ORDER BY open_time DESC LIMIT 50`, [u.id]),
      many(`SELECT profit FROM closed_positions ORDER BY close_time DESC LIMIT 200`),
      many(`SELECT * FROM vip_contracts WHERE user_id = $1 ORDER BY created_at DESC`, [u.id]),
      one(`SELECT * FROM vip_contracts WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`, [u.id]),
      (await getSettings()) as unknown as Record<string, any>,
    ]);

  const baseCapital = Number(settings["risk.virtualCapital"] ?? settings["engine.virtualCapital"] ?? 1000) || 1000;
  const realizedStoredSetting = Number(settings["engine.realizedPnl"] ?? 0) || 0;
  const realizedFromClosed = closes.reduce((sum, x) => sum + Number(x.profit ?? 0), 0);
  const floatingTotal = opens.reduce((sum, x) => sum + Number(x.pnl ?? 0), 0);
  const engagedAll = num(allWallets?.engaged);
  const contribution = num(wallet?.frozen);
  const totalCapital = Math.max(baseCapital + engagedAll, 1);
  const shareRatio = contribution > 0 ? contribution / totalCapital : 0;

  const feeNormal = Number(settings["fees.platformNormal"] ?? 50) || 50;
  const feeBronze = Number(settings["fees.platformBronze"] ?? 30) || 30;
  const feeSilver = Number(settings["fees.platformSilver"] ?? 15) || 15;
  const feeGold = Number(settings["fees.platformGold"] ?? 10) || 10;
  const pkgKey = String((u as any).vip_package ?? "");
  const commissionPct =
    pkgKey.includes("gold") || pkgKey.includes("platinum") ? feeGold
    : pkgKey.includes("silver") ? feeSilver
    : pkgKey.includes("bronze") ? feeBronze
    : feeNormal;
  const includeCommission = settings["fees.includePlatformCommission"] !== false;
  const grossShare = (floatingTotal + realizedFromClosed) * shareRatio;
  const platformFee = includeCommission ? grossShare * (commissionPct / 100) : 0;

  const active = activeContract as any | undefined;
  const expiresAt = num((u as any).vip_expires_at)
    ?? (active ? Number(active.created_at) + Number(active.duration_days ?? 30) * 86_400_000 : 0);
  const daysLeft = expiresAt > Date.now() ? Math.ceil((expiresAt - Date.now()) / 86_400_000) : 0;

  const usernameLc = String(u.username ?? "").trim().toLowerCase();
  return c.json({
    profile: {
      name: u.name ?? "", username: u.username ?? "",
      firstName: (u as any).first_name ?? "", lastName: (u as any).last_name ?? "",
      phone: (u as any).phone ?? "", tgId: (u as any).tg_id ?? null,
      tgUsername: (u as any).tg_username ?? "", gender: "", birthday: "",
      role: isAdmin(u) ? "admin" : isStaff(u) ? (u as any).role ?? "assistant" : ((u as any).role ?? "user"),
      isVip: Boolean((u as any).is_vip),
      canTrade: (u as any).can_trade !== false,
      enabled: (u as any).enabled !== false,
      language: (u as any).language ?? "fa",
      theme: (u as any).theme ?? "dark",
      notificationsEnabled: (u as any).notifications_enabled !== false,
      registeredAt: num((u as any).registered_at) || num((u as any).created_at) || null,
      lastActivity: num((u as any).last_activity) || null,
      channelVerified: Boolean((u as any).channel_verified),
      phoneVerified: Boolean((u as any).phone_verified),
      withdrawTgVerifiedAt: null,
      aiProvider: "", aiModel: "",
      isAdmin: isAdmin(u) || usernameLc === "wolfadmin",
      isStaff: isStaff(u) || isAdmin(u) || usernameLc === "wolfadmin",
    },
    wallet: {
      id: wallet?.id ?? null,
      asset: wallet?.asset ?? String(settings["wallet.systemAsset"] ?? "USDT"),
      network: wallet?.network ?? String(settings["wallet.systemNetwork"] ?? "TRC20"),
      balance: num(wallet?.balance),
      frozen: num(wallet?.frozen),
      frozenSince: num(wallet?.frozen_since) || 0,
      depositAddress: wallet?.deposit_address ?? String(settings["wallet.systemAddress"] ?? ""),
    },
    engineAssets: {
      capital: baseCapital + realizedStoredSetting + realizedFromClosed,
      engaged: engagedAll,
      floatingPnl: floatingTotal,
      realizedPnl: realizedFromClosed,
    },
    share: {
      contribution,
      totalCapital,
      ratio: Number((shareRatio * 100).toFixed(2)),
      floatingPnl: Number((floatingTotal * shareRatio).toFixed(4)),
      realizedPnl: Number((realizedFromClosed * shareRatio).toFixed(4)),
      total: Number(grossShare.toFixed(4)),
      commissionPct,
      platformFee: Number(platformFee.toFixed(4)),
      net: Number((grossShare - platformFee).toFixed(4)),
    },
    depositAddresses: addresses.filter((a) => a.kind !== "withdraw").map(({ id, asset, network, address, memo }) => ({ id, asset, network, address, memo })),
    withdrawAddresses: addresses.filter((a) => a.kind === "withdraw").map(({ id, asset, network, address, memo }) => ({ id, asset, network, address, memo })),
    withdrawMinDays: Math.max(0, Number(settings["wallet.withdrawMinDays"] ?? 7) || 0),
    transactions: txns.map((t) => ({
      id: t.id, type: t.type, asset: t.asset, amount: t.amount, network: t.network,
      txid: t.txid, status: t.status, note: t.note, created: t.created_at,
    })),
    vip: {
      isVip: Boolean((u as any).is_vip),
      packageKey: (u as any).vip_package ?? active?.package_key ?? null,
      expiresAt: expiresAt || null,
      daysLeft,
      active: daysLeft > 0,
      capital: active?.capital != null ? num(active.capital) : null,
    },
    contracts,
    openPositions: opens,
    accountQueryGuard: String(usernameLc === "wolfadmin" ? "root-admin" : "member"),
  });
});

async function walletTxns(userId: string): Promise<any[]> {
  return many(
    `SELECT wt.* FROM wallet_transactions wt
     LEFT JOIN wallets w ON w.id = wt.wallet_id
     WHERE w.user_id = $1 ORDER BY wt.created_at DESC LIMIT 50`,
    [userId],
  );
}

app.get("/api/wallet", requireUser, async (c) => {
  const u = userOf(c);
  const wallet = await one("SELECT * FROM wallets WHERE user_id = $1 LIMIT 1", [u.id]);
  const txns = await many(
    "SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
    [u.id]
  );
  const addresses = await many(
    "SELECT asset, network, address, memo FROM wallet_addresses WHERE enabled = true AND address != '' ORDER BY asset, network"
  );
  return c.json({ wallet, transactions: txns, depositAddresses: addresses });
});

app.post("/api/wallet/deposit", requireUser, async (c) => {
  const u = userOf(c);
  const s = await getSettings();
  if (!s["wallet.depositEnabled"]) return c.json({ error: "واریز موقتاً غیرفعال است." }, 400);
  const body = await c.req.json().catch(() => ({}));
  const network = clean(body.network, 20) || s["usdt.network"];
  const address = await one(
    "SELECT * FROM wallet_addresses WHERE asset = 'USDT' AND network = $1 AND enabled = true AND address != ''",
    [network]
  );
  if (!address) return c.json({ error: `آدرس واریز برای شبکه ${network} تعریف نشده است.` }, 400);
  const wallet = await one("SELECT * FROM wallets WHERE user_id = $1 LIMIT 1", [u.id]);
  const r = await pool.query(
    `INSERT INTO wallet_transactions (wallet_id, user_id, type, asset, amount, network, txid, status, note)
     VALUES ($1, $2, 'deposit', 'USDT', $3, $4, $5, 'pending', $6)
     RETURNING *`,
    [wallet?.id ?? u.id, u.id, num(body.amount), network, clean(body.txid, 200), clean(body.note, 500)]
  );
  await audit("deposit_request", u.username, u.id, "wallet", { network, txid: clean(body.txid, 100) });
  return c.json({ deposit: r.rows[0], address });
});

app.post("/api/wallet/withdraw", requireUser, async (c) => {
  const u = userOf(c);
  const s = await getSettings();
  if (!s["wallet.withdrawEnabled"]) return c.json({ error: "برداشت موقتاً غیرفعال است." }, 400);
  const body = await c.req.json().catch(() => ({}));
  const amount = num(body.amount);
  const network = clean(body.network, 20) || s["usdt.network"];
  if (amount < num(s["wallet.minWithdraw"], 10)) {
    return c.json({ error: `حداقل مبلغ برداشت ${s["wallet.minWithdraw"]} USDT است.` }, 400);
  }
  const wallet = await one("SELECT * FROM wallets WHERE user_id = $1 LIMIT 1", [u.id]);
  if (!wallet || num(wallet.balance) < amount) {
    return c.json({ error: "موجودی کافی نیست." }, 400);
  }
  const r = await tx(async (c2) => {
    await c2.query("UPDATE wallets SET balance = balance - $1 WHERE id = $2 AND balance >= $1", [amount, wallet.id]);
    const ins = await c2.query(
      `INSERT INTO wallet_transactions (wallet_id, user_id, type, asset, amount, network, txid, status, note)
       VALUES ($1, $2, 'withdrawal', 'USDT', $3, $4, $5, 'pending', $6)
       RETURNING *`,
      [wallet.id, u.id, -amount, network, clean(body.txid, 200), clean(body.address, 300)]
    );
    if (ins.rows.length === 0) throw new Error("موجودی کافی نیست.");
    return ins.rows[0];
  });
  await audit("withdraw_request", u.username, u.id, "wallet", { amount, network });
  return c.json({ withdrawal: r });
});

// Request releasing frozen USDT (engine-committed) back to available balance.
// Mirrors the Convex `admin.requestUnfreeze` mutation — admin confirms the
// pending transaction from the wallet-transactions tab.
app.post("/api/wallet/unfreeze", requireUser, async (c) => {
  const u = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const amount = num(body.amount);
  if (!(amount > 0)) return c.json({ error: "مبلغ نامعتبر است." }, 400);
  const s = await getSettings();
  try {
    await tx(async (c2) => {
      const wallet = (await c2.query("SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1 FOR UPDATE", [u.id])).rows[0];
      if (!wallet) throw new Error("کیف پول ندارید.");
      const frozen = num(wallet.frozen);
      if (frozen < amount) throw new Error("مبلغ درگیر (فریز) کافی نیست.");
      const minDays = Math.max(0, Number(await getSetting("wallet.withdrawMinDays", 7)) || 0);
      const frozenSince = num(wallet.frozen_since);
      if (minDays > 0 && frozenSince > 0 && now() - frozenSince < minDays * 86400000) {
        const waitDays = Math.ceil((minDays * 86400000 - (now() - frozenSince)) / 86400000);
        throw new Error(`سرمایه باید حداقل ${minDays} روز در موتور بچرخد — ${waitDays} روز دیگر مجاز می‌شود`);
      }
      await c2.query(
        `INSERT INTO wallet_transactions (wallet_id, user_id, type, asset, amount, network, status, note)
         VALUES ($1, $2, 'unfreeze', $3, $4, $5, 'pending', 'درخواست آزادسازی سرمایه از موتور')`,
        [wallet.id, u.id, wallet.asset ?? "USDT", amount, wallet.network ?? "TRC20"]
      );
    });
    await audit("wallet_unfreeze_request", u.username, u.id, "wallet", { amount });
    const adminId = num(s["telegram.adminId"]);
    if (adminId) {
      void sendMessage(adminId, `🔓 <b>درخواست آزادسازی سرمایه</b>\n👤 ${u.username}\n💵 مبلغ: <b>${amount} USDT</b>\n📝 از بخش تراکنش‌های کیف پول تأیید کنید.`).catch(() => undefined);
    }
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Toman deposit request (card-to-card) — lands as a pending IRT deposit.
app.post("/api/wallet/deposit-toman", requireUser, async (c) => {
  const u = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const amount = num(body.amount);
  if (!(amount >= 10000)) return c.json({ error: "حداقل مبلغ واریز ۱۰٬۰۰۰ تومان است." }, 400);
  const wallet = await one<Row>(
    "SELECT * FROM wallets WHERE user_id = $1 AND asset = 'IRT' ORDER BY created_at ASC LIMIT 1", [u.id]
  );
  let walletId: string;
  if (wallet) {
    walletId = wallet.id;
  } else {
    const r = await pool.query(
      `INSERT INTO wallets (user_id, owner, asset, network, balance) VALUES ($1, $1, 'IRT', 'CARD', 0) RETURNING id`,
      [u.id]
    );
    walletId = r.rows[0].id;
  }
  await pool.query(
    `INSERT INTO wallet_transactions (wallet_id, user_id, type, asset, amount, network, status, ref, note)
     VALUES ($1, $2, 'deposit', 'IRT', $3, 'CARD', 'pending', $4, $5)`,
    [walletId, u.id, amount, clean(body.ref, 200) || null, clean(body.note, 300) || null]
  );
  await audit("wallet.toman.deposit.request", u.username, u.id, "wallet", { amount });
  const s = await getSettings();
  const adminId = num(s["telegram.adminId"]);
  if (adminId) {
    void sendMessage(
      adminId,
      `💰 <b>درخواست واریز تومانی</b>\n👤 ${u.username ?? u.tg_id ?? ""}${u.name ? ` (${u.name})` : ""}\n💵 مبلغ: <b>${amount.toLocaleString("fa-IR")} تومان</b>\n🆔 کد پیگیری: ${clean(body.ref, 200) || "—"}\n📝 توضیح: ${clean(body.note, 300) || "—"}`
    ).catch(() => undefined);
  }
  return c.json({ ok: true });
});

// ── VIP ──────────────────────────────────────────────────────────────────────
app.get("/api/vip/packages", async (c) => {
  const pkgs = await many("SELECT * FROM vip_packages WHERE status = true ORDER BY price ASC");
  return c.json({ packages: pkgs });
});

app.post("/api/vip/request", requireUser, async (c) => {
  const u = userOf(c);
  const s = await getSettings();
  if (!s["vip.requestsEnabled"]) return c.json({ error: "درخواست VIP موقتاً غیرفعال است." }, 400);
  const body = await c.req.json().catch(() => ({}));
  const pkg = await one("SELECT * FROM vip_packages WHERE key = $1 AND status = true", [clean(body.packageKey, 50)]);
  if (!pkg) return c.json({ error: "پکیج نامعتبر است." }, 400);
  const capital = num(body.capital);
  if (capital < num(pkg.min_capital) || capital > num(pkg.max_capital)) {
    return c.json({ error: `سرمایه باید بین ${pkg.min_capital} و ${pkg.max_capital} USDT باشد.` }, 400);
  }
  const r = await pool.query(
    `INSERT INTO vip_requests (user_id, user_name, package_key, capital)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [u.id, u.username ?? u.name, pkg.key, capital]
  );
  await audit("vip_request", u.username, u.id, "vip", { package: pkg.key, capital });
  return c.json({ request: r.rows[0] });
});

// ── support ──────────────────────────────────────────────────────────────────
app.get("/api/support/tickets", requireUser, async (c) => {
  const u = userOf(c);
  const tickets = await many(
    "SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC",
    [u.id]
  );
  return c.json({ tickets });
});

app.post("/api/support/tickets", requireUser, async (c) => {
  const u = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const subject = clean(body.subject, 200);
  const text = clean(body.text, 4000);
  if (!subject || !text) return c.json({ error: "عنوان و متن پیام الزامی است." }, 400);
  const r = await tx(async (c2) => {
    const t = await c2.query(
      `INSERT INTO support_tickets (user_id, subject, status, priority, last_activity)
       VALUES ($1, $2, 'open', $3, $4) RETURNING *`,
      [u.id, subject, clean(body.priority, 10) || "normal", now()]
    );
    await c2.query(
      `INSERT INTO support_messages (ticket_id, user_id, from_admin, text) VALUES ($1, $2, false, $3)`,
      [t.rows[0].id, u.id, text]
    );
    return t.rows[0];
  });
  return c.json({ ticket: r });
});

app.get("/api/support/tickets/:id", requireUser, async (c) => {
  const u = userOf(c);
  const t = await one("SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2", [c.req.param("id"), u.id]);
  if (!t) return c.json({ error: "تیکت یافت نشد." }, 404);
  const msgs = await many(
    "SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC",
    [t.id]
  );
  return c.json({ ticket: t, messages: msgs });
});

app.post("/api/support/tickets/:id/messages", requireUser, async (c) => {
  const u = userOf(c);
  const t = await one("SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2", [c.req.param("id"), u.id]);
  if (!t) return c.json({ error: "تیکت یافت نشد." }, 404);
  if (t.status === "closed") return c.json({ error: "تیکت بسته شده است." }, 400);
  const body = await c.req.json().catch(() => ({}));
  const r = await pool.query(
    `INSERT INTO support_messages (ticket_id, user_id, from_admin, text) VALUES ($1, $2, false, $3) RETURNING *`,
    [t.id, u.id, clean(body.text, 4000)]
  );
  await pool.query("UPDATE support_tickets SET status = 'pending', last_activity = $1 WHERE id = $2", [now(), t.id]);
  return c.json({ message: r.rows[0] });
});

// ── referral ─────────────────────────────────────────────────────────────────
// Apply a referral code to the signed-in user's account.
app.post("/api/referral/apply", requireUser, async (c) => {
  const u = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const code = clean(body.code, 64);
  if (!code) return c.json({ error: "کد معرف الزامی است." }, 400);
  const ref = await one("SELECT * FROM referrals WHERE LOWER(code) = LOWER($1)", [code]);
  if (!ref) return c.json({ error: "کد معرف معتبر نیست." }, 404);
  if (ref.referrer_id === u.id) return c.json({ error: "نمی‌توانید کد خودتان را وارد کنید." }, 400);
  if (ref.referred_id) return c.json({ error: "این کد قبلاً استفاده شده است." }, 400);
  await pool.query("UPDATE referrals SET referred_id = $1, referred_at = $2 WHERE id = $3", [u.id, now(), ref.id]);
  await pool.query("UPDATE users SET referral_code = $1 WHERE id = $2", [code, u.id]);
  return c.json({ ok: true });
});

app.get("/api/referral", requireUser, async (c) => {
  const u = userOf(c);
  let ref = await one("SELECT * FROM referrals WHERE referrer_id = $1", [u.id]);
  if (!ref) {
    const code = referralCode(u.username ?? "wolf");
    const r = await pool.query(
      `INSERT INTO referrals (code, referrer_id) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING RETURNING *`,
      [code, u.id]
    );
    ref = r.rows[0] ?? (await one("SELECT * FROM referrals WHERE referrer_id = $1", [u.id]));
  }
  if (!ref) return c.json({ error: "کد معرف ایجاد نشد." }, 500);
  const stats = await one(
    "SELECT COUNT(*)::int AS referred FROM referrals WHERE referrer_id = $1 AND referred_id IS NOT NULL",
    [u.id]
  );
  return c.json({
    code: ref.code,
    link: `${config.appUrl}/?ref=${ref.code}`,
    referred: num(stats?.referred),
    rewardEnabled: !!ref.reward_enabled,
  });
});

// ── Wolf coins / education / AI ─────────────────────────────────────────────
app.get("/api/coins", requireUser, async (c) => {
  const u = userOf(c);
  const user = await one("SELECT wolf_coins, profile_reward_claimed, telegram_reward_claimed FROM users WHERE id = $1", [u.id]);
  const toman = await one("SELECT balance FROM wallets WHERE user_id = $1 AND asset = 'IRT' ORDER BY created_at ASC LIMIT 1", [u.id]);
  const ledger = await many("SELECT id, currency, delta, balance_after, reason, ref, created_at FROM coin_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 60", [u.id]);
  return c.json({ wolfCoins: num(user?.wolf_coins), toman: num(toman?.balance), profileRewardClaimed: !!user?.profile_reward_claimed, telegramRewardClaimed: !!user?.telegram_reward_claimed, transactions: ledger });
});

app.post("/api/coins/voucher/redeem", requireUser, async (c) => {
  const u = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const code = clean(body.code, 100).toUpperCase();
  if (!code) return c.json({ error: "کد ووچر الزامی است." }, 400);
  const result = await tx(async (client) => {
    const v = (await client.query("SELECT * FROM voucher_codes WHERE code = $1 FOR UPDATE", [code])).rows[0];
    if (!v || !v.status || num(v.used_count) >= num(v.max_uses) || (v.used_by ?? []).includes(u.id)) throw new Error("ووچر نامعتبر، منقضی یا استفاده‌شده است.");
    const amount = num(v.coins);
    const user = (await client.query("UPDATE users SET wolf_coins = wolf_coins + $1 WHERE id = $2 RETURNING wolf_coins", [amount, u.id])).rows[0];
    await client.query("UPDATE voucher_codes SET used_count = used_count + 1, used_by = array_append(used_by, $1::uuid) WHERE id = $2", [u.id, v.id]);
    await client.query("INSERT INTO coin_transactions (user_id, currency, delta, balance_after, reason, ref) VALUES ($1, 'wolf', $2, $3, 'voucher', $4)", [u.id, amount, user.wolf_coins, code]);
    return { coins: amount, balance: num(user.wolf_coins) };
  }).catch((e: any) => ({ error: e.message }));
  if ((result as any).error) return c.json(result, 400);
  return c.json(result);
});

// One-time task reward: completing the profile (name/phone). Mirrors the
// Convex `coins.claimProfileReward` mutation (column added in 0002 migration).
app.post("/api/coins/claim-reward", requireUser, async (c) => {
  const u = userOf(c);
  const user = await one("SELECT name, phone, wolf_coins, profile_reward_claimed FROM users WHERE id = $1", [u.id]);
  if (!user) return c.json({ error: "user_not_found" }, 404);
  if (user.profile_reward_claimed) return c.json({ ok: false, reason: "already_claimed" });
  const name = String(user.name ?? "").trim();
  const phone = String(user.phone ?? "").trim();
  if (!name && !phone) return c.json({ error: "ابتدا نام یا شماره موبایل خود را کامل کنید" }, 400);
  const reward = num(await getSetting("coins.rewardProfile"), 10);
  const claimed = await tx(async (client) => {
    const r = (await client.query(
      "UPDATE users SET wolf_coins = wolf_coins + $1, profile_reward_claimed = true WHERE id = $2 AND profile_reward_claimed = false RETURNING wolf_coins",
      [reward, u.id]
    )).rows[0];
    if (!r) return null;
    await client.query(
      "INSERT INTO coin_transactions (user_id, currency, delta, balance_after, reason, ref) VALUES ($1, 'wolf', $2, $3, 'reward_profile', 'profile')",
      [u.id, reward, num(r.wolf_coins)]
    );
    return r;
  });
  if (!claimed) return c.json({ ok: false, reason: "already_claimed" });
  await audit("claim_profile_reward", u.username, u.id, "coins", { reward });
  return c.json({ ok: true, coins: reward });
});

// Buy wolf coins with the toman balance (rate from settings). Mirrors the
// Convex `coins.buyWolfCoins` mutation.
app.post("/api/coins/buy", requireUser, async (c) => {
  const u = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const coins = Math.max(1, Math.floor(Number(body.coins)));
  const rate = num(await getSetting("coins.tomanPerCoin"), 5000);
  const cost = coins * rate;
  const result = await tx(async (client) => {
    const wallet = (await client.query("SELECT id, balance FROM wallets WHERE user_id = $1 AND asset = 'IRT' ORDER BY created_at ASC LIMIT 1 FOR UPDATE", [u.id])).rows[0];
    if (!wallet) throw new Error("کیف پول تومانی ندارید — ابتدا از بخش کیف پول شارژ کنید.");
    const toman = num(wallet.balance);
    if (toman < cost) throw new Error(`موجودی تومان شما ${toman.toLocaleString("fa-IR")} تومان است؛ این خرید ${cost.toLocaleString("fa-IR")} تومان لازم دارد.`);
    await client.query("UPDATE wallets SET balance = $1 WHERE id = $2", [toman - cost, wallet.id]);
    await client.query(
      "INSERT INTO coin_transactions (user_id, currency, delta, balance_after, reason, ref) VALUES ($1, 'toman', $2, $3, 'buy_coins', $4)",
      [u.id, -cost, toman - cost, `${coins} coins`]
    );
    const user = (await client.query("UPDATE users SET wolf_coins = wolf_coins + $1 WHERE id = $2 RETURNING wolf_coins", [coins, u.id])).rows[0];
    await client.query(
      "INSERT INTO coin_transactions (user_id, currency, delta, balance_after, reason, ref) VALUES ($1, 'wolf', $2, $3, 'buy_coins', $4)",
      [u.id, coins, num(user.wolf_coins), `${cost} toman`]
    );
    return { coins, balance: num(user.wolf_coins) };
  }).catch((e: any) => ({ error: e.message }));
  if ((result as any).error) return c.json(result, 400);
  await audit("coins.buy", u.username, u.id, "coins", { coins, cost });
  return c.json(result);
});

// ── Wolf-coin prediction + quiz game (REST parity with Convex coins.ts) ──────
app.get("/api/coins/predictions", requireUser, async (c) => {
  const u = userOf(c);
  const rows = await many(
    "SELECT id, symbol, direction, outcome, reward, status, created_at FROM demo_predictions WHERE user_id = $1 AND symbol NOT LIKE 'QUIZ:%' ORDER BY created_at DESC LIMIT 30",
    [u.id]
  );
  return c.json({ predictions: rows.map((r) => ({ ...r, reward: num(r.reward) })) });
});

app.get("/api/coins/quiz/history", requireUser, async (c) => {
  const u = userOf(c);
  const rows = await many(
    "SELECT id, symbol, status, reward, created_at FROM demo_predictions WHERE user_id = $1 AND symbol LIKE 'QUIZ:%' ORDER BY created_at DESC LIMIT 20",
    [u.id]
  );
  return c.json({ quizzes: rows.map((r) => ({ ...r, reward: num(r.reward) })) });
});

app.post("/api/coins/prediction/start", requireUser, async (c) => {
  const u = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const sym = clean(body.symbol, 20).toUpperCase();
  const game = await startPrediction(u.id, u.username, sym);
  await audit("prediction_start", u.username, u.id, "game", { symbol: game.symbol });
  return c.json({ ok: true, id: game.id, symbol: game.symbol, reward: game.reward, candles: game.candles });
});

app.post("/api/coins/prediction/resolve", requireUser, async (c) => {
  const u = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const direction = clean(body.direction, 10);
  if (direction !== "long" && direction !== "short") return c.json({ error: "جهت نامعتبر است." }, 400);
  try {
    const r = await resolvePrediction(u.id, u.username, String(body.id), direction);
    await audit("prediction_resolve", u.username, u.id, "game", { id: String(body.id), direction, won: r.won });
    return c.json(r);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.post("/api/coins/quiz/start", requireUser, async (c) => {
  const u = userOf(c);
  const q = await startQuiz(u.id, u.username);
  return c.json({ ok: true, ...q });
});

app.post("/api/coins/quiz/resolve", requireUser, async (c) => {
  const u = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const chosen = Math.floor(Number(body.chosen));
  try {
    const r = await resolveQuiz(u.id, u.username, String(body.id), chosen);
    await audit("quiz_resolve", u.username, u.id, "game", { id: String(body.id), won: r.won });
    return c.json(r);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Coin packages + paid signal-detail unlock
app.get("/api/coins/packages", requireUser, async (c) => {
  return c.json({ packages: await coinPackages() });
});

app.post("/api/coins/package", requireUser, async (c) => {
  const u = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const index = Math.floor(Number(body.index));
  try {
    const r = await buyCoinPackage(u.id, u.username, index);
    await audit("coins.package_buy", u.username, u.id, "coins", { index, ...r });
    return c.json(r);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Wolf-coin idle burn (usage fee per idle hour, capped at 24h) — manual trigger.
app.post("/api/coins/burn", requireUser, async (c) => {
  const u = userOf(c);
  const r = await burnWolfCoins(u.id);
  return c.json(r);
});

app.get("/api/ai/chats", requireUser, async (c) => {
  const u = userOf(c);
  const rows = await many("SELECT id, key, provider, model, text, status, error, created_at FROM ai_analysis WHERE kind = 'chat' AND key LIKE $1 ORDER BY created_at DESC LIMIT 50", [`chat:${u.id}:%`]);
  return c.json({ chats: rows });
});

app.post("/api/ai/chat", requireUser, async (c) => {
  const u = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const question = clean(body.question, 2000);
  if (!question) return c.json({ error: "سؤال خالی است." }, 400);
  const key = `chat:${u.id}:${now()}`;
  const answer = await aiAsk("general", "You are WOLF AI, a safe trading education assistant. Answer in Persian unless the user writes English. Never promise profit or give certainty.", question, { cacheKey: key, cacheTtlSec: 60 });
  if (!answer) return c.json({ error: "هیچ سرویس هوش مصنوعی در دسترس نیست." }, 503);
  await pool.query("INSERT INTO ai_analysis (kind, key, provider, model, prompt, text, status) VALUES ('chat', $1, $2, $3, $4, $5, 'done')", [key, answer.provider, answer.model, question, answer.text]);
  return c.json({ key, text: answer.text, provider: answer.provider, model: answer.model });
});

// Admin AI connectivity test parity with the Convex preview action.
app.post("/api/admin/ai/test", requireAdmin, async (c) => {
  const admin = userOf(c);
  const s = await getSettings();
  const provider = String(s["ai.provider"] ?? "gemini");
  const model = String(s["ai.model"] ?? "gemini-flash-latest");
  const answer = await aiAsk("general", "Reply with exactly: OK", "ping");
  if (!answer) {
    await audit("ai.test_failed", admin.username, admin.id, "ai", { provider, model });
    return c.json({ ok: false, message: "هیچ سرویس AI پاسخ نداد. کلید/سرویس‌دهنده و fallback رایگان را بررسی کنید." }, 503);
  }
  await audit("ai.tested", admin.username, admin.id, "ai", { provider: answer.provider, model: answer.model });
  return c.json({ ok: true, message: `اتصال موفق: ${answer.provider}/${answer.model}`, provider: answer.provider, model: answer.model, text: answer.text });
});

// User clears their own AI chat history (kind = chat rows owned by them).
app.post("/api/ai/prune", requireUser, async (c) => {
  const u = userOf(c);
  const deleted = await pruneOwnChat(u.id);
  await audit("ai.chat_pruned", u.username, u.id, "ai", { deleted });
  return c.json({ ok: true, deleted });
});

// ── markets / chart / engine analysis ────────────────────────────────────────
app.get("/api/markets", async (c) => {
  const markets = await many(
    `SELECT symbol, name_en, name_fa, market, base, quote, digits, type, last_price, change_24h, updated_at
       FROM markets WHERE enabled = true ORDER BY market, priority`
  );
  const live = await Promise.all(
    markets.slice(0, 60).map(async (m) => {
      const t = await fetchTicker(m.symbol).catch(() => null);
      return { ...m, last_price: t?.price ?? m.last_price, change_24h: t?.change24h ?? m.change_24h };
    })
  );
  return c.json({ markets: live });
});

app.get("/api/markets/:symbol/candles", async (c) => {
  const symbol = clean(c.req.param("symbol"), 20);
  const tf = clean(c.req.query("tf") ?? "15m", 8);
  const cached = await cacheGet(`api:candles:${symbol}:${tf}`);
  if (cached) return c.json({ candles: cached });
  const rows = await many(
    "SELECT t, o, h, l, c, v FROM candles WHERE symbol = $1 AND timeframe = $2 ORDER BY t ASC LIMIT 300",
    [symbol, tf]
  );
  let candles = rows;
  if (candles.length < 30) {
    candles = await fetchKlines(symbol, tf);
    // Persist on-demand data so charts and backtests share the same source.
    for (const k of candles) {
      await pool.query(
        `INSERT INTO candles (symbol, timeframe, t, o, h, l, c, v)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (symbol, timeframe, t) DO UPDATE SET o=EXCLUDED.o,h=EXCLUDED.h,l=EXCLUDED.l,c=EXCLUDED.c,v=EXCLUDED.v`,
        [symbol, tf, k.t, k.o, k.h, k.l, k.c, k.v ?? 0]
      );
    }
  }
  await cacheSet(`api:candles:${symbol}:${tf}`, candles, 30);
  return c.json({ candles, source: rows.length >= 30 ? "database" : candles.length ? "exchange" : "unavailable", count: candles.length });
});

app.get("/api/markets/:symbol/analysis", requireUser, async (c) => {
  const symbol = clean(c.req.param("symbol"), 20);
  const analysis = await one(
    `SELECT ta.*, p.side, p.score, p.confidence, p.stop_loss, p.take_profit, p.current, p.entry, p.open_time
       FROM trade_analysis ta
       LEFT JOIN open_positions p ON p.id = ta.position_id
      WHERE ta.symbol = $1 ORDER BY ta.created_at DESC LIMIT 1`,
    [symbol]
  );
  const open = await one("SELECT * FROM open_positions WHERE symbol = $1 AND status = 'open'", [symbol]);
  const aiText = analysis
    ? await aiAsk(
        "summary",
        "Explain this engine analysis in simple Persian, 3-4 sentences. Do not invent data.",
        JSON.stringify(analysis)
      ).catch(() => null)
    : null;
  return c.json({ analysis, openPosition: open, ai: aiText?.text ?? null });
});

app.get("/api/markets/:symbol/position", async (c) => {
  const symbol = clean(c.req.param("symbol"), 20);
  const p = await one("SELECT * FROM open_positions WHERE symbol = $1 AND status = 'open'", [symbol]);
  if (!p) return c.json({ position: null });
  return c.json({
    position: {
      id: p.id, symbol: p.symbol, side: p.side, entry: p.entry, current: p.current,
      pnl: p.pnl, pnl_pct: p.pnl_pct, score: p.score, confidence: p.confidence,
      stop_loss: p.stop_loss, take_profit: p.take_profit, open_time: p.open_time,
      type: p.type, progress: p.progress, strategy_keys: p.strategy_keys,
    },
  });
});

// ── strategies / monitoring ──────────────────────────────────────────────────
app.get("/api/strategies", async (c) => {
  const market = clean(c.req.query("market") ?? "all", 20);
  const stored = await many("SELECT key, enabled, engine_enabled, weight, baseline_score, confidence FROM strategies");
  const state = new Map(stored.map((r) => [r.key, r]));
  const rows = publicStrategies()
    .map((s) => ({ ...s, ...(state.get(s.key) ?? {}) }))
    .filter((s) => s.market === "all" || s.market === market || market === "all");
  return c.json({ strategies: rows, families: strategyFamilies() });
});

app.get("/api/settings/public", async (c) => c.json(await publicSettingsData()));

app.get("/api/education", async (c) => {
  const rows = await many("SELECT id, title_fa, title_en, body_fa, body_en, source, day, image, audio, created_at FROM education WHERE status = 'approved' ORDER BY created_at DESC LIMIT 30");
  return c.json({ education: rows });
});

app.get("/api/monitor/health", async (c) => {
  const [db, rk] = await Promise.all([dbOk(), redisOk()]);
  const heartbeat = await getEngineState("heartbeat");
  return c.json({
    ok: db && rk,
    backend: "rest",
    convex: false,
    db,
    redis: rk,
    engine: heartbeat?.at ? now() - num(heartbeat.at) < 180_000 : false,
    checkedAt: now(),
  });
});

// Runtime + deployment stats for the admin monitor (Node process, counts).
app.get("/api/monitor/stats", requireAdmin, async (c) => {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const s = (await getSettings()) as unknown as Record<string, any>;
  const mb = (b: number) => b / (1024 * 1024);
  const fmtBytes = (b: number) => (mb(b) >= 1024 ? `${(mb(b) / 1024).toFixed(2)} GB` : `${mb(b).toFixed(1)} MB`);
  const q = (sql: string) => one<{ n: string }>(sql).then((r) => num(r?.n) ?? 0);
  const hb = await getEngineState("heartbeat");
  const [users, openPositions, closedPositions, signals, transactions, aiRows, engineLogs] = await Promise.all([
    q("SELECT count(*)::int AS n FROM users"),
    q("SELECT count(*)::int AS n FROM open_positions"),
    q("SELECT count(*)::int AS n FROM closed_positions"),
    q("SELECT count(*)::int AS n FROM signals"),
    q("SELECT count(*)::int AS n FROM wallet_transactions"),
    q("SELECT count(*)::int AS n FROM ai_analysis"),
    q("SELECT count(*)::int AS n FROM engine_logs"),
  ]);
  return c.json({
    ok: true,
    at: now(),
    runtime: {
      node: process.version, platform: process.platform, arch: process.arch, pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      memory: { rss: fmtBytes(mem.rss), heapUsed: fmtBytes(mem.heapUsed), heapTotal: fmtBytes(mem.heapTotal), external: fmtBytes(mem.external) },
      cpu: { userSec: (cpu.user / 1e6).toFixed(2), systemSec: (cpu.system / 1e6).toFixed(2) },
    },
    deployment: {
      convexUrl: "",
      siteUrl: s["telegram.miniAppUrl"] ?? "",
      serverIp: "",
      version: s["engine.version"] ?? "1.0.0",
      mode: s["engine.mode"] ?? "demo",
      engineMode: s["engine.mode"] ?? "demo",
      tradeType: s["engine.tradeType"] ?? s["trading.tradeType"] ?? "futures",
      lastScanAt: Number((await getEngineState("last_scan").catch(() => null))?.at ?? 0) || null,
      engineEnabled: s["engine.enabled"] !== false,
      emergencyStop: s["engine.emergencyStop"] === true,
      pauseNewTrades: s["engine.pauseNewTrades"] === true,
      telegramEnabled: !!s["telegram.token"],
      aiEnabled: s["ai.enabled"] !== false,
      heartbeatAgeSec: hb?.at ? Math.round((now() - num(hb.at)) / 1000) : null,
      health: {
        tg: !!s["telegram.token"] ? "ONLINE" : "OFFLINE",
        channel: !!s["telegram.channelId"] ? "ONLINE" : "OFFLINE",
        ai: s["ai.enabled"] !== false ? "ONLINE" : "OFFLINE",
        exchange: "CHECK",
      },
    },
    counts: { users, openPositions, closedPositions, signals, transactions, aiRows, engineLogs },
  });
});

// ── ADMIN: complete workspace data (read-only staff view) ───────────────────
app.get("/api/admin/workspace", requireStaff, async (c) => {
  const [users, positions, closed, orders, strategies, performance, exchanges, providers, vipPackages, vipRequests, learning, education, referrals, transactions, telegram, auditRows, markets] = await Promise.all([
    many(`SELECT id, username, name,
            CASE WHEN is_admin OR role = 'admin' OR LOWER(COALESCE(username, '')) = 'wolfadmin' THEN 'admin'
                 WHEN is_assistant OR role = 'assistant' THEN 'assistant' ELSE COALESCE(role, 'user') END AS role,
            (is_admin OR role = 'admin' OR LOWER(COALESCE(username, '')) = 'wolfadmin') AS is_admin,
            ((NOT (is_admin OR role = 'admin' OR LOWER(COALESCE(username, '')) = 'wolfadmin')) AND (is_assistant OR role = 'assistant')) AS is_assistant,
            is_vip, vip_package, vip_expires_at, enabled, can_trade, tg_id, tg_username, phone, language, theme, registered_at, last_activity, wallet_address
       FROM users ORDER BY created_at DESC LIMIT 500`),
    many("SELECT * FROM open_positions ORDER BY open_time DESC"),
    many("SELECT * FROM closed_positions ORDER BY close_time DESC LIMIT 300"),
    many("SELECT * FROM orders ORDER BY created_at DESC LIMIT 300"),
    many("SELECT * FROM strategies ORDER BY category, key"),
    many("SELECT symbol, name_en, name_fa, market, base, quote, digits, type, last_price, last_price_24h, change_24h, priority, enabled, updated_at FROM markets ORDER BY market, priority"),
    many("SELECT * FROM strategy_performance ORDER BY total_pnl DESC"),
    many("SELECT id, name, provider, environment, enabled, status, last_test, last_error, balance, account_id FROM exchange_accounts ORDER BY created_at DESC"),
    many("SELECT id, provider, model, base_url, priority, enabled, purpose, rate_limit, daily_limit, used_today, usage_errors, usage_latency_ms, last_used_at FROM ai_providers ORDER BY priority"),
    many("SELECT * FROM vip_packages ORDER BY price"),
    many("SELECT * FROM vip_requests ORDER BY created_at DESC LIMIT 300"),
    many("SELECT * FROM learning_history ORDER BY created_at DESC LIMIT 300"),
    many("SELECT id, title_fa, title_en, body_fa, body_en, source, status, day, created_by, decided_by, decided_at, note, sent_fa_at, sent_en_at, created_at FROM education ORDER BY created_at DESC LIMIT 100"),
    many("SELECT r.*, ru.username AS referrer, du.username AS referred_user FROM referrals r LEFT JOIN users ru ON ru.id = r.referrer_id LEFT JOIN users du ON du.id = r.referred_id ORDER BY r.created_at DESC LIMIT 300"),
    many("SELECT wt.*, u.username FROM wallet_transactions wt LEFT JOIN users u ON u.id = wt.user_id ORDER BY wt.created_at DESC LIMIT 300"),
    many("SELECT * FROM telegram_messages ORDER BY created_at DESC LIMIT 200"),
    many("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 300"),
  ]);
  const settings = await getSettings();
  const safeSettings: Record<string, unknown> = { ...settings };
  for (const key of ["telegram.token", "telegram.webhookSecret", "ai.key", "ai.key2"]) {
    if (key in safeSettings) safeSettings[key] = mask(String(safeSettings[key] ?? ""));
  }
  const engine = {
    heartbeat: await getEngineState("heartbeat"),
    status: await getEngineState("status"),
    lastScan: await getEngineState("last_scan"),
    mode: (settings as any)["engine.mode"],
    capital: (settings as any)["engine.virtualCapital"],
    intervalSec: (settings as any)["engine.scanIntervalSec"],
    emergencyStop: (settings as any)["engine.emergencyStop"],
    pauseNewTrades: (settings as any)["engine.pauseNewTrades"],
  };
  return c.json({ users, positions, closed, orders, strategies, performance, exchanges, providers, vipPackages, vipRequests, learning, education, referrals, transactions, telegram, audit: auditRows, settings: safeSettings, engine, markets });
});

app.post("/api/admin/history/clear", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  if (body.confirm !== "CLEAR_HISTORY") return c.json({ error: "تأیید پاکسازی الزامی است." }, 400);
  const scope = body.scope === "trades" ? "trades" : body.scope === "logs" ? "logs" : "all";
  const counts: Record<string, number> = {};
  const errors: string[] = [];
  const del = async (table: string) => {
    try {
      const r = await pool.query(`DELETE FROM ${table}`);
      counts[table] = r.rowCount ?? 0;
    } catch (e: any) {
      errors.push(`${table}: ${e.message}`);
    }
  };
  if (scope === "all" || scope === "logs") {
    // history: engine/audit/learning logs + notifications
    for (const table of ["engine_logs", "audit_logs", "learning_history", "notifications"]) await del(table);
  }
  if (scope === "all" || scope === "trades") {
    // trades: closed + open positions, signals, trade analysis, strategy stats
    for (const table of ["closed_positions", "open_positions", "signals", "trade_analysis", "strategy_performance"]) await del(table);
    if (scope === "all") await del("candles");
    // Engine capital returns to its base: zero the accumulated realized P&L.
    try {
      await setSetting("engine.realizedPnl", 0, "engine");
      await setSetting("engine.lastSignalAt", 0, "engine");
      await setSetting("engine.lastScanAt", 0, "engine");
    } catch (e: any) {
      errors.push(`settings: ${e.message}`);
    }
  }
  await audit("history_clear", admin.username, admin.id, "history", { scope, counts, errors });
  return c.json({ ok: true, scope, counts, errors });
});

// ── Full-platform reporting: export (download as JSON text) + import (restore) ──
app.get("/api/admin/reports/export", requireAdmin, async (c) => {
  const admin = userOf(c);
  const s = (await getSettings()) as unknown as Record<string, any>;
  const maskS = (k: string) => (/token|secret|password|apiKey|key$/i.test(k) ? mask(s[k]) : s[k]);
  const settings: Record<string, any> = {};
  for (const k of Object.keys(s)) settings[k] = maskS(k);
  const [users, markets, strategies, signals, openPositions, closedPositions, learning, perf, transactions, coinTx, education, aiAnalysis, auditRows, engineLogs, notifications] =
    await Promise.all([
      many(`SELECT id, username, name, role, is_vip, vip_package, vip_expires_at, enabled, can_trade, language, theme, phone, tg_id, tg_username, wallet_address, created_at FROM users`),
      many("SELECT * FROM markets"),
      many("SELECT * FROM strategies"),
      many("SELECT * FROM signals"),
      many("SELECT * FROM open_positions"),
      many("SELECT * FROM closed_positions"),
      many("SELECT * FROM learning_history"),
      many("SELECT * FROM strategy_performance"),
      many("SELECT * FROM wallet_transactions"),
      many("SELECT * FROM coin_transactions"),
      many("SELECT * FROM education"),
      many("SELECT * FROM ai_analysis"),
      many("SELECT * FROM audit_logs"),
      many("SELECT * FROM engine_logs ORDER BY created_at DESC LIMIT 2000"),
      many("SELECT * FROM notifications"),
    ]);
  await audit("reports_export", admin.username, admin.id, "reports", {});
  return c.json({
    app: "Trading Wolf AI",
    version: "1.3.0",
    exportedAt: new Date().toISOString(),
    data: {
      settings,
      users,
      markets,
      strategies,
      signals,
      openPositions,
      closedPositions,
      learningHistory: learning,
      strategyPerformance: perf,
      walletTransactions: transactions,
      coinTransactions: coinTx,
      education,
      aiAnalysis,
      auditLogs: auditRows,
      engineLogs,
      notifications,
    },
  });
});

app.post("/api/admin/reports/import", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const d = (body.data && typeof body.data === "object" ? body.data : body) ?? {};
  const counts: Record<string, number> = {};
  const errors: string[] = [];
  const INSERTABLE = new Set([
    "signals", "closed_positions", "learning_history", "strategy_performance",
    "education", "ai_analysis", "markets", "strategies",
  ]);
  const insert = async (table: string, rows: any[]) => {
    if (!INSERTABLE.has(table) || !Array.isArray(rows) || rows.length === 0) return;
    let ok = 0;
    for (const r of rows) {
      if (!r || typeof r !== "object") continue;
      const cols = Object.keys(r).filter((k) => r[k] !== undefined && r[k] !== null);
      if (cols.length === 0) continue;
      try {
        await pool.query(
          `INSERT INTO ${table} (${cols.map((k) => `\"${k}\"`).join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT DO NOTHING`,
          cols.map((k) => (typeof r[k] === "object" ? JSON.stringify(r[k]) : r[k]))
        );
        ok++;
      } catch (e: any) {
        errors.push(`${table}: ${e.message}`);
      }
    }
    counts[table] = ok;
  };
  if (d.settings && typeof d.settings === "object") {
    let n = 0;
    for (const [k, val] of Object.entries(d.settings)) {
      const sv = String(val ?? "");
      if (!sv || /[\u2022\u2026*]{3,}/.test(sv)) continue; // masked secret → skip
      try {
        await pool.query(
          `INSERT INTO system_settings (key, value, group_name, updated_at) VALUES ($1, $2, $3, $4)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
          [k, typeof val === "object" ? JSON.stringify(val) : val, String(k).split(".")[0], now()]
        );
        n++;
      } catch (e: any) {
        errors.push(`settings: ${e.message}`);
      }
    }
    counts.settings = n;
  }
  await insert("signals", d.signals);
  await insert("closed_positions", d.closedPositions ?? d.closed_positions);
  await insert("learning_history", d.learningHistory ?? d.learning_history);
  await insert("strategy_performance", d.strategyPerformance ?? d.strategy_performance);
  await insert("education", d.education);
  await insert("ai_analysis", d.aiAnalysis ?? d.ai_analysis);
  await insert("markets", d.markets);
  await insert("strategies", d.strategies);
  await audit("reports_import", admin.username, admin.id, "reports", { counts, errors });
  return c.json({ ok: true, counts, errors });
});

app.get("/api/admin/strategies", requireStaff, async (c) => {
  const [strategies, performance] = await Promise.all([
    many("SELECT * FROM strategies ORDER BY category, key"),
    many("SELECT * FROM strategy_performance ORDER BY total_pnl DESC"),
  ]);
  return c.json({ strategies, performance });
});

app.patch("/api/admin/strategies/:key", requireAdmin, async (c) => {
  const admin = userOf(c);
  const key = clean(c.req.param("key"), 100);
  const body = await c.req.json().catch(() => ({}));
  const sets: string[] = [];
  const vals: unknown[] = [key];
  const push = (col: string, value: unknown) => { sets.push(`${col} = $${vals.length + 1}`); vals.push(value); };
  if (body.enabled !== undefined) push("enabled", !!body.enabled);
  if (body.engine_enabled !== undefined) push("engine_enabled", !!body.engine_enabled);
  if (body.weight !== undefined) push("weight", num(body.weight, 1));
  if (body.baseline_score !== undefined) push("baseline_score", num(body.baseline_score, 50));
  if (body.confidence !== undefined) push("confidence", num(body.confidence, 0.5));
  if (!sets.length) return c.json({ error: "هیچ فیلدی ارسال نشد." }, 400);
  await pool.query(`UPDATE strategies SET ${sets.join(", ")} WHERE key = $1`, vals);
  await audit("strategy_update", admin.username, admin.id, key, { fields: sets });
  return c.json({ ok: true });
});

app.post("/api/admin/strategies/toggle-all", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const enabled = !!body.enabled;
  await pool.query("UPDATE strategies SET enabled = $1, engine_enabled = $1", [enabled]);
  await audit("strategy_toggle_all", admin.username, admin.id, "strategies", { enabled });
  return c.json({ ok: true, enabled });
});

app.post("/api/admin/education", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const titleFa = clean(body.titleFa, 300), titleEn = clean(body.titleEn, 300);
  const bodyFa = clean(body.bodyFa, 8000), bodyEn = clean(body.bodyEn, 8000);
  if (!titleFa || !titleEn || !bodyFa || !bodyEn) return c.json({ error: "عنوان و متن فارسی و انگلیسی الزامی است." }, 400);
  const r = await pool.query("INSERT INTO education (title_fa, title_en, body_fa, body_en, source, status, day, created_by, note) VALUES ($1,$2,$3,$4,'admin',$5,$6,$7,$8) RETURNING *", [titleFa, titleEn, bodyFa, bodyEn, body.status === "approved" ? "approved" : "pending", clean(body.day, 20) || null, admin.username, clean(body.note, 1000) || null]);
  await audit("education_create", admin.username, admin.id, String(r.rows[0].id), null);
  return c.json({ education: r.rows[0] });
});

app.patch("/api/admin/education/:id", requireAdmin, async (c) => {
  const admin = userOf(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const status = clean(body.status, 20);
  if (!["pending", "approved", "rejected"].includes(status)) return c.json({ error: "وضعیت نامعتبر است." }, 400);
  await pool.query("UPDATE education SET status = $1, decided_by = $2, decided_at = $3, note = COALESCE($4, note) WHERE id = $5", [status, admin.username, now(), body.note ? clean(body.note, 1000) : null, id]);
  await audit("education_review", admin.username, admin.id, id, { status });
  return c.json({ ok: true });
});

// Pending lessons grouped by day (for the AI-center / education workflow).
app.get("/api/admin/education/days", requireStaff, async (c) => {
  const days = await many(
    `SELECT id, day, title_fa, title_en, status, sent_fa_at, sent_en_at, created_at
       FROM education WHERE status = 'pending' ORDER BY day ASC NULLS LAST, created_at DESC LIMIT 100`
  );
  return c.json({ days });
});

// Send one approved lesson to the Persian / English Telegram channel.
app.post("/api/admin/education/:id/send", requireAdmin, async (c) => {
  const admin = userOf(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const lang = body.lang === "en" ? "en" : "fa";
  try {
    const r = await sendEducationToChannel(id, lang);
    await audit("education_send_channel", admin.username, admin.id, "education", { id, lang });
    return c.json(r);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Regenerate a lesson's cover image (pollinations) or audio (external TTS).
app.post("/api/admin/education/:id/media", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const kind = body.kind === "audio" ? "audio" : "image";
  try {
    const r = await regenerateEducationMedia(id, kind);
    return c.json(r);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// ── signals / notifications ──────────────────────────────────────────────────
app.get("/api/signals/recent", async (c) => {
  const signals = await many(
    `SELECT id, symbol, direction, entry, stop_loss, take_profit, score, confidence, strategy_keys, created_at, mode
       FROM signals ORDER BY created_at DESC LIMIT 20`
  );
  return c.json({ signals });
});

// The user's own signal board (open signals with their paid unlocks marked).
app.get("/api/signals/my", requireUser, async (c) => {
  const u = userOf(c);
  const [signals, userRow] = await Promise.all([
    many(
      `SELECT id, symbol, timeframe, direction, entry, stop_loss, take_profit, targets, rr, score, confidence,
              price, strategy_keys, reasons_fa, reasons_en, created_at, mode
         FROM signals WHERE status = 'open' ORDER BY created_at DESC LIMIT 30`
    ),
    one<Row>("SELECT signal_unlocks FROM users WHERE id = $1", [u.id]),
  ]);
  const unlocks = new Set((userRow?.signal_unlocks ?? []) as string[]);
  return c.json({
    signals: (signals ?? []).map((sig: any) => ({
      id: sig.id, symbol: sig.symbol, timeframe: sig.timeframe, direction: sig.direction,
      entry: num(sig.entry), stop_loss: num(sig.stop_loss), take_profit: num(sig.take_profit),
      targets: sig.targets ?? [], rr: num(sig.rr), score: num(sig.score), confidence: num(sig.confidence),
      price: num(sig.price), strategy_keys: sig.strategy_keys ?? [], reasons_fa: sig.reasons_fa ?? [],
      reasons_en: sig.reasons_en ?? [], unlocked: unlocks.has(String(sig.id)), created_at: num(sig.created_at),
      created: num(sig.created_at),
    })),
  });
});

// Pay wolf coins once to unlock the full signal detail (strategies + reasons).
app.post("/api/signals/:id/unlock", requireUser, async (c) => {
  const u = userOf(c);
  const id = c.req.param("id");
  try {
    const sig = await unlockSignalDetail(u.id, u.username, id);
    await audit("signal_unlock", u.username, u.id, "signal", { id });
    return c.json({
      ok: true,
      signal: {
        id: sig.id, symbol: sig.symbol, timeframe: sig.timeframe, direction: sig.direction,
        entry: num(sig.entry), stopLoss: num(sig.stop_loss), takeProfit: num(sig.take_profit),
        targets: sig.targets ?? [], rr: num(sig.rr), score: num(sig.score), confidence: num(sig.confidence),
        price: num(sig.price), strategyKeys: sig.strategy_keys ?? [], reasonsFa: sig.reasons_fa ?? [],
        reasonsEn: sig.reasons_en ?? [], aggregate: sig.aggregate ?? null, created: num(sig.created_at),
      },
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.get("/api/notifications", requireUser, async (c) => {
  const u = userOf(c);
  const rows = await many(
    "SELECT * FROM notifications WHERE user_id = $1 OR broadcast = true ORDER BY created_at DESC LIMIT 50",
    [u.id]
  );
  return c.json({ notifications: rows });
});

app.post("/api/notifications/read", requireUser, async (c) => {
  const u = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const id = clean(body.id, 100);
  if (id === "all") {
    await pool.query("UPDATE notifications SET seen = true WHERE user_id = $1", [u.id]);
  } else {
    await pool.query("UPDATE notifications SET seen = true WHERE id = $1 AND user_id = $2", [id, u.id]);
  }
  return c.json({ ok: true });
});

// ── ADMIN: Wolf-coin ledger and vouchers ────────────────────────────────────
app.get("/api/admin/coins", requireStaff, async (c) => {
  const [ledger, vouchers] = await Promise.all([
    many("SELECT ct.*, u.username FROM coin_transactions ct LEFT JOIN users u ON u.id = ct.user_id ORDER BY ct.created_at DESC LIMIT 300"),
    many("SELECT id, code, coins, max_uses, used_count, used_by, created_by, status, created_at FROM voucher_codes ORDER BY created_at DESC LIMIT 100"),
  ]);
  return c.json({ ledger, vouchers });
});

app.post("/api/admin/coins/adjust", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const userId = clean(body.userId, 100), currency = body.currency === "toman" ? "toman" : "wolf";
  const delta = num(body.delta);
  if (!userId || !Number.isFinite(delta) || delta === 0) return c.json({ error: "کاربر و مقدار معتبر الزامی است." }, 400);
  const result = await tx(async (client) => {
    const user = (await client.query("SELECT id, wolf_coins FROM users WHERE id = $1 FOR UPDATE", [userId])).rows[0];
    if (!user) throw new Error("کاربر یافت نشد.");
    if (currency === "wolf") {
      const next = Math.max(0, num(user.wolf_coins) + delta);
      await client.query("UPDATE users SET wolf_coins = $1 WHERE id = $2", [next, userId]);
      await client.query("INSERT INTO coin_transactions (user_id, currency, delta, balance_after, reason, ref) VALUES ($1, 'wolf', $2, $3, 'admin', $4)", [userId, delta, next, admin.username]);
      return { balance: next };
    }
    let wallet = (await client.query("SELECT id, balance FROM wallets WHERE user_id = $1 AND asset = 'IRT' ORDER BY created_at ASC LIMIT 1 FOR UPDATE", [userId])).rows[0];
    if (!wallet) wallet = (await client.query("INSERT INTO wallets (user_id, owner, asset, network, balance) VALUES ($1, $1, 'IRT', 'IRT', 0) RETURNING id, balance", [userId])).rows[0];
    const next = Math.max(0, num(wallet.balance) + delta);
    await client.query("UPDATE wallets SET balance = $1 WHERE id = $2", [next, wallet.id]);
    await client.query("INSERT INTO coin_transactions (user_id, currency, delta, balance_after, reason, ref) VALUES ($1, 'toman', $2, $3, 'admin', $4)", [userId, delta, next, admin.username]);
    return { balance: next };
  }).catch((e: any) => ({ error: e.message }));
  if ((result as any).error) return c.json(result, 400);
  await audit("coin_adjust", admin.username, admin.id, userId, { currency, delta });
  return c.json({ ok: true, currency, ...(result as any) });
});

app.post("/api/admin/coins/voucher", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const code = clean(body.code, 100).toUpperCase() || `WOLF-${randomToken(6).toUpperCase()}`;
  const coins = Math.max(1, num(body.coins));
  const maxUses = Math.max(1, Math.floor(num(body.maxUses, 1)));
  const r = await pool.query("INSERT INTO voucher_codes (code, coins, max_uses, created_by) VALUES ($1,$2,$3,$4) RETURNING id, code, coins, max_uses, used_count, status, created_at", [code, coins, maxUses, admin.username]);
  await audit("voucher_create", admin.username, admin.id, code, { coins, maxUses });
  return c.json({ voucher: r.rows[0] });
});

// ── ADMIN: SwapWallet management ────────────────────────────────────────────
app.get("/api/admin/swapwallet", requireStaff, async (c) => {
  const key = await resolveSwapWalletKey();
  const [priceMap, balanceResult, transactionResult] = await Promise.all([
    swapPrices(),
    key ? swapBalances(key) : Promise.resolve({ status: "ERROR", error: "کلید تنظیم نشده است." }),
    key ? swapTransactions(key, 50) : Promise.resolve({ status: "ERROR", error: "کلید تنظیم نشده است." }),
  ]);
  const TOKENS = ["USDT", "TON", "TRX", "IRT", "ETH", "BNB"];
  // SwapWallet /market/prices returns flat map keys like "USDTIRT" or
  // "USDT/IRT". Normalize BOTH forms so USDT/TON/... prices are actually shown
  // (the old `/`-only regex silently dropped every pair → "USDT price not found").
  const parseSwapPair = (key: string): string | null => {
    if (key.includes("/")) {
      const [b, q] = key.split("/");
      return TOKENS.includes(b) && TOKENS.includes(q) ? `${b}/${q}` : null;
    }
    for (const q of ["USDT", "IRT"]) {
      if (q.length > 0 && key.endsWith(q)) {
        const b = key.slice(0, key.length - q.length);
        if (TOKENS.includes(b)) return `${b}/${q}`;
      }
    }
    return null;
  };
  const pricesList = Object.entries(priceMap)
    .map(([key, value]) => ({ key, pair: parseSwapPair(key), num: Number(value) }))
    .filter((x) => x.pair && Number.isFinite(x.num) && x.num > 0)
    .map((x) => ({ pair: x.pair as string, price: x.num }))
    .sort((a, b) => a.pair.localeCompare(b.pair));
  const settings = await getSettings();
  return c.json({
    configured: !!key,
    keyMasked: maskSecretValue(key),
    baseUrl: swapwalletBase(),
    enabled: (settings as any)["wallet.swapwalletEnabled"] !== false,
    prices: pricesList,
    priceCount: pricesList.length,
    balances: balanceResult?.status === "OK" ? balanceResult.result ?? [] : [],
    balancesError: balanceResult?.status === "OK" ? null : balanceResult?.error,
    transactions: transactionResult?.status === "OK" ? transactionResult.result?.data ?? [] : [],
    transactionsError: transactionResult?.status === "OK" ? null : transactionResult?.error,
    fetchedAt: now(),
  });
});

app.post("/api/admin/swapwallet/key", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const key = clean(body.apiKey, 500);
  if (!key || !key.startsWith("apikey-")) return c.json({ error: "کلید معتبر SwapWallet را وارد کنید." }, 400);
  await setSetting("swapwallet.apiKey", encryptSecret(key), "swapwallet", admin.username);
  if (body.enabled !== undefined) await setSetting("wallet.swapwalletEnabled", !!body.enabled, "wallet", admin.username);
  await audit("swapwallet_key_update", admin.username, admin.id, "swapwallet", { configured: true });
  return c.json({ ok: true, keyMasked: maskSecretValue(key) });
});

app.post("/api/admin/swapwallet/enabled", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const enabled = !!body.enabled;
  await setSetting("wallet.swapwalletEnabled", enabled, "wallet", admin.username);
  await audit("swapwallet_toggle", admin.username, admin.id, "swapwallet", { enabled });
  return c.json({ ok: true, enabled });
});

app.post("/api/admin/swapwallet/swap", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const key = await resolveSwapWalletKey();
  if (!key) return c.json({ error: "کلید SwapWallet تنظیم نشده است." }, 400);
  if (!body.sourceToken || !body.destinationToken || (!body.sourceAmount && !body.destinationAmount) || (body.sourceAmount && body.destinationAmount)) return c.json({ error: "مبدأ، مقصد و دقیقاً یکی از مقدارها الزامی است." }, 400);
  const result = await fastSwap(key, { sourceToken: clean(body.sourceToken, 10).toUpperCase(), destinationToken: clean(body.destinationToken, 10).toUpperCase(), sourceAmount: body.sourceAmount ? clean(body.sourceAmount, 50) : undefined, destinationAmount: body.destinationAmount ? clean(body.destinationAmount, 50) : undefined });
  await audit("swapwallet_fast_swap", admin.username, admin.id, "swapwallet", { sourceToken: body.sourceToken, destinationToken: body.destinationToken, ok: result?.status === "OK" });
  return c.json(result, result?.status === "OK" ? 200 : 400);
});

app.post("/api/admin/swapwallet/quote", requireAdmin, async (c) => {
  const key = await resolveSwapWalletKey();
  if (!key) return c.json({ error: "کلید SwapWallet تنظیم نشده است." }, 400);
  const body = await c.req.json().catch(() => ({}));
  if (!body.sourceToken || !body.destinationToken || (!body.sourceAmount && !body.destinationAmount) || (body.sourceAmount && body.destinationAmount)) return c.json({ error: "مقدار قیمت‌گذاری نامعتبر است." }, 400);
  const result = await swapQuote(key, { sourceToken: clean(body.sourceToken, 10).toUpperCase(), destinationToken: clean(body.destinationToken, 10).toUpperCase(), sourceAmount: body.sourceAmount ? clean(body.sourceAmount, 50) : undefined, destinationAmount: body.destinationAmount ? clean(body.destinationAmount, 50) : undefined });
  return c.json(result, result?.status === "OK" ? 200 : 400);
});

app.post("/api/admin/swapwallet/order", requireAdmin, async (c) => {
  const admin = userOf(c);
  const key = await resolveSwapWalletKey();
  const body = await c.req.json().catch(() => ({}));
  if (!key || !body.swapToken) return c.json({ error: "کلید و swapToken الزامی است." }, 400);
  const result = await executeQuote(key, clean(body.swapToken, 100));
  await audit("swapwallet_otc_order", admin.username, admin.id, "swapwallet", { ok: result?.status === "OK" });
  return c.json(result, result?.status === "OK" ? 200 : 400);
});

app.post("/api/admin/swapwallet/withdraw-config", requireAdmin, async (c) => {
  const key = await resolveSwapWalletKey();
  const body = await c.req.json().catch(() => ({}));
  if (!key) return c.json({ error: "کلید SwapWallet تنظیم نشده است." }, 400);
  return c.json(await swapWithdrawConfig(key, clean(body.token, 10).toUpperCase() || "USDT"));
});

app.post("/api/admin/swapwallet/withdraw", requireAdmin, async (c) => {
  const admin = userOf(c);
  const key = await resolveSwapWalletKey();
  const body = await c.req.json().catch(() => ({}));
  if (!key || !body.token || !body.amount || !body.network || !body.address) return c.json({ error: "توکن، مبلغ، شبکه و آدرس الزامی است." }, 400);
  const result = await swapWithdraw(key, { token: clean(body.token, 10).toUpperCase(), amount: clean(body.amount, 50), network: clean(body.network, 30).toUpperCase(), address: clean(body.address, 300), memo: body.memo ? clean(body.memo, 200) : undefined, feeDeductType: body.feeDeductType ? clean(body.feeDeductType, 20) : undefined, fee: body.fee ? clean(body.fee, 50) : undefined });
  await audit("swapwallet_withdraw", admin.username, admin.id, "swapwallet", { token: body.token, network: body.network, ok: result?.status === "OK" });
  return c.json(result, result?.status === "OK" ? 200 : 400);
});

// ── ADMIN: overview ──────────────────────────────────────────────────────────
app.get("/api/admin/overview", requireStaff, async (c) => {
  const s = await getSettings();
  const engine = {
    heartbeat: await getEngineState("heartbeat"),
    status: await getEngineState("status"),
    lastScan: await getEngineState("last_scan"),
    capital: num(s["engine.virtualCapital"]),
    mode: s["engine.mode"],
    emergencyStop: s["engine.emergencyStop"],
    paused: s["engine.pauseNewTrades"],
  };
  const [open, closed, users, vipUsers, exchanges, aiProv, logs, winRate] = await Promise.all([
    many(`SELECT p.id, p.symbol, p.side, p.entry,
              COALESCE(m.last_price::numeric, p.current) AS current,
              p.pnl, p.pnl_pct, p.score, p.open_time, p.type, p.mode
       FROM open_positions p
       LEFT JOIN markets m ON m.symbol = p.symbol
       ORDER BY p.open_time DESC`),    one("SELECT COUNT(*)::int AS n, COALESCE(SUM(profit),0)::text AS pnl FROM closed_positions"),
    one("SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE is_vip)::int AS vip FROM users"),
    many("SELECT id, username, name, is_vip, vip_package, vip_expires_at, enabled FROM users WHERE is_vip = true ORDER BY created_at DESC LIMIT 50"),
    many("SELECT id, name, provider, environment, enabled, status, last_test, last_error FROM exchange_accounts"),
    many("SELECT id, provider, model, priority, enabled, purpose, used_today, usage_errors FROM ai_providers"),
    many("SELECT level, message, source, created_at FROM engine_logs ORDER BY created_at DESC LIMIT 20"),
    calcWinRate(),
  ]);
  const realized = await one("SELECT COALESCE(SUM(profit),0)::text AS pnl FROM closed_positions");
  const unrealized = await one("SELECT COALESCE(SUM(pnl),0)::text AS pnl FROM open_positions");
  const today = await one(
    "SELECT COUNT(*)::int AS trades, COALESCE(SUM(profit),0)::text AS pnl FROM closed_positions WHERE close_time > $1",
    [new Date().setHours(0, 0, 0, 0)]
  );
  return c.json({
    engine,
    openPositions: open,
    stats: {
      openCount: open.length,
      closedCount: num(closed?.n),
      realizedPnl: num(realized?.pnl),
      unrealizedPnl: num(unrealized?.pnl),
      users: num(users?.n),
      vipUsers: num(users?.vip),
      todayTrades: num(today?.trades),
      todayPnl: num(today?.pnl),
      winRate,
    },
    exchanges, aiProviders: aiProv, recentLogs: logs,
  });
});

async function calcWinRate(): Promise<number> {
  const r = await one(
    "SELECT COUNT(*) FILTER (WHERE profit >= 0)::int AS wins, COUNT(*)::int AS n FROM closed_positions"
  );
  const n = num(r?.n);
  return n ? round((num(r?.wins) / n) * 100, 2) : 0;
}

// ── ADMIN: users ─────────────────────────────────────────────────────────────
app.get("/api/admin/users", requireAdmin, async (c) => {
  const users = await many(`SELECT id, username, name,
            CASE WHEN is_admin OR role = 'admin' OR LOWER(COALESCE(username, '')) = 'wolfadmin' THEN 'admin'
                 WHEN is_assistant OR role = 'assistant' THEN 'assistant' ELSE COALESCE(role, 'user') END AS role,
            (is_admin OR role = 'admin' OR LOWER(COALESCE(username, '')) = 'wolfadmin') AS is_admin,
            ((NOT (is_admin OR role = 'admin' OR LOWER(COALESCE(username, '')) = 'wolfadmin')) AND (is_assistant OR role = 'assistant')) AS is_assistant,
            is_vip, vip_package, vip_expires_at, enabled,
            can_trade, tg_id, tg_username, phone, phone_verified, channel_verified, language, theme,
            registered_at, last_activity, wallet_address
       FROM users ORDER BY created_at DESC LIMIT 200`
  );
  return c.json({ users });
});

app.post("/api/admin/users", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const username = clean(body.username, 64);
  const password = String(body.password ?? "");
  const tgId = num(body.tgId, 0);
  if ((!username && !tgId) || password.length < 8) {
    return c.json({ error: "نام کاربری یا آیدی تلگرام + رمز (حداقل ۸ کاراکتر) لازم است." }, 400);
  }
  const hash = await hashPassword(password);
  let r;
  try {
    r = await pool.query(
      `INSERT INTO users (username, password_hash, name, role, is_vip, vip_package, vip_expires_at, tg_id, tg_username, can_trade, language, theme)
       VALUES ($1, $2, $3, 'vip', true, $4, $5, $6, $7, true, 'fa', 'dark')
       RETURNING *`,
      [
        username || null,
        hash,
        clean(body.name, 128) || username,
        clean(body.packageKey, 50) || "bronze",
        body.vipExpiresAt ? num(body.vipExpiresAt) : now() + 30 * 86_400_000,
        tgId || null,
        clean(body.tgUsername, 64) || null,
      ]
    );
  } catch (e: any) {
    if (e?.code === "23505") return c.json({ error: `کاربری با نام «${username}» از قبل وجود دارد.` }, 409);
    throw e;
  }
  const user = r.rows[0];
  await pool.query(
    `INSERT INTO wallets (user_id, owner, asset, network, balance) VALUES ($1, $1, 'USDT', 'TRC20', 0)
     ON CONFLICT DO NOTHING`,
    [user.id]
  );
  await audit("user_create", admin.username, admin.id, "user", { username: user.username });
  return c.json({ user });
});

app.patch("/api/admin/users/:id", requireAdmin, async (c) => {
  const admin = userOf(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const sets: string[] = [];
  const vals: unknown[] = [id];
  const push = (col: string, v: unknown) => {
    sets.push(`${col} = $${vals.length + 1}`);
    vals.push(v);
  };
  if (body.enabled !== undefined) push("enabled", !!body.enabled);
  if (body.can_trade !== undefined) push("can_trade", !!body.can_trade);
  if (body.is_vip !== undefined) push("is_vip", !!body.is_vip);
  if (body.vip_package !== undefined) push("vip_package", clean(body.vip_package, 50));
  if (body.vip_expires_at !== undefined) push("vip_expires_at", num(body.vip_expires_at));
  if (body.role !== undefined) {
    const role = clean(body.role, 20);
    if (!["user", "vip", "assistant", "admin"].includes(role)) return c.json({ error: "نقش نامعتبر است." }, 400);
    push("role", role);
    push("is_admin", role === "admin");
    push("is_assistant", role === "assistant");
  }
  if (body.password) {
    vals.push(await hashPassword(String(body.password)));
    sets.push(`password_hash = $${vals.length}`);
  }
  if (body.username !== undefined) {
    const uname = clean(body.username, 64).toLowerCase();
    if (!uname) return c.json({ error: "invalid_username" }, 400);
    const dup = await one("SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2", [uname, id]);
    if (dup) return c.json({ error: "username_taken" }, 409);
    push("username", uname);
  }
  if (body.name !== undefined) push("name", clean(body.name, 120));
  if (body.phone !== undefined) push("phone", clean(body.phone, 30));
  if (body.gender !== undefined) push("gender", clean(body.gender, 20));
  if (body.birthday !== undefined) push("birthday", clean(body.birthday, 20));
  if (body.firstName !== undefined) push("first_name", clean(body.firstName, 120));
  if (body.lastName !== undefined) push("last_name", clean(body.lastName, 120));
  if (body.wallet_address !== undefined) push("wallet_address", clean(body.wallet_address, 300));
  if (sets.length === 0) return c.json({ error: "هیچ فیلدی برای تغییر ارسال نشد." }, 400);
  await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $1`, vals);
  await audit("user_update", admin.username, admin.id, "user", { id, fields: sets });
  return c.json({ ok: true });
});

// Delete a user account entirely (admin action; never for admins themselves).
app.delete("/api/admin/users/:id", requireAdmin, async (c) => {
  const admin = userOf(c);
  const id = c.req.param("id");
  if (id === admin.id) return c.json({ error: "حذف حساب خودتان ممکن نیست." }, 400);
  const target = await one("SELECT username FROM users WHERE id = $1", [id]);
  if (!target) return c.json({ error: "کاربر یافت نشد." }, 404);
  if (String(target.username ?? "").toLowerCase() === "wolfadmin") {
    return c.json({ error: "حذف حساب مدیر اصلی ممکن نیست." }, 400);
  }
  await tx(async (c2) => {
    await c2.query(`DELETE FROM open_positions WHERE user_id = $1`, [id]);
    await c2.query(`DELETE FROM notifications WHERE user_id = $1`, [id]);
    await c2.query(`DELETE FROM wallet_transactions WHERE user_id = $1`, [id]);
    await c2.query(`DELETE FROM wallets WHERE user_id = $1`, [id]);
    await c2.query(`DELETE FROM support_tickets WHERE user_id = $1`, [id]);
    await c2.query(`DELETE FROM users WHERE id = $1`, [id]);
  });
  await audit("user_delete", admin.username, admin.id, "user", { id });
  return c.json({ ok: true });
});

// Full account detail for one user (wallets, ledger, audit, positions...).
app.get("/api/admin/users/:id", requireStaff, async (c) => {
  const id = c.req.param("id");
  try {
    return c.json(await userDetailData(id));
  } catch (e: any) {
    return c.json({ error: e.message }, 404);
  }
});

// ── ADMIN: wallet / transactions ─────────────────────────────────────────────
app.get("/api/admin/wallet/transactions", requireAdmin, async (c) => {
  const rows = await many(
    `SELECT wt.*, u.username FROM wallet_transactions wt
     LEFT JOIN users u ON u.id = wt.user_id ORDER BY wt.created_at DESC LIMIT 200`
  );
  return c.json({ transactions: rows });
});

app.post("/api/admin/wallet/transactions/:id/confirm", requireAdmin, async (c) => {
  const admin = userOf(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const txn = await one("SELECT * FROM wallet_transactions WHERE id = $1", [id]);
  if (!txn) return c.json({ error: "تراکنش یافت نشد." }, 404);
  await tx(async (c2) => {
    if (body.confirm) {
      await c2.query(
        `UPDATE wallet_transactions SET status = 'confirmed' WHERE id = $1 AND status = 'pending'`,
        [id]
      );
      if (num(txn.amount) > 0 && txn.type === "deposit") {
        await c2.query(
          `UPDATE wallets SET balance = balance + $1 WHERE id = $2`,
          [num(txn.amount), txn.wallet_id]
        );
      }
      if (txn.type === "unfreeze" && txn.user_id) {
        // confirmed unfreeze → reduce the engine-frozen amount (available balance unchanged)
        await c2.query(`UPDATE wallets SET frozen = GREATEST(0, frozen - $1) WHERE user_id = $2`, [num(txn.amount), txn.user_id]);
      }
      const notifTitle = txn.type === "unfreeze" ? "آزادسازی سرمایه تأیید شد" : "واریز تأیید شد";
      const notifTitleEn = txn.type === "unfreeze" ? "Unfreeze confirmed" : "Deposit confirmed";
      await c2.query(
        `INSERT INTO notifications (user_id, type, title_fa, text_fa, title_en, text_en)
         VALUES ($1, 'wallet', $2, $3, $4, $5)`,
        [txn.user_id, notifTitle, `${txn.amount} ${txn.asset ?? "USDT"} — ${notifTitle}.`, notifTitleEn, `${txn.amount} ${txn.asset ?? "USDT"} ${notifTitleEn.toLowerCase()}.`]
      );
    } else {
      await c2.query(`UPDATE wallet_transactions SET status = 'failed' WHERE id = $1`, [id]);
      if (num(txn.amount) < 0 && txn.type === "withdrawal") {
        // failed withdrawal → return funds
        await c2.query(`UPDATE wallets SET balance = balance + $1 WHERE id = $2`, [-num(txn.amount), txn.wallet_id]);
      }
    }
  });
  await audit("wallet_txn", admin.username, admin.id, "wallet", { id, confirm: !!body.confirm });
  return c.json({ ok: true });
});

app.get("/api/admin/wallet/addresses", requireAdmin, async (c) => {
  const rows = await many("SELECT * FROM wallet_addresses ORDER BY asset, network");
  return c.json({ addresses: rows });
});

app.post("/api/admin/wallet/addresses", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const asset = clean(body.asset, 20).toUpperCase() || "USDT";
  const network = clean(body.network, 20).toUpperCase();
  const address = clean(body.address, 300);
  const r = await pool.query(
    `INSERT INTO wallet_addresses (asset, network, address, memo, enabled)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (asset, network) DO UPDATE SET address = EXCLUDED.address, memo = EXCLUDED.memo, enabled = EXCLUDED.enabled
     RETURNING *`,
    [asset, network, address, clean(body.memo, 200), body.enabled !== false]
  );
  await audit("wallet_address", admin.username, admin.id, "wallet", { asset, network });
  return c.json({ address: r.rows[0] });
});

// Remove deposit address rows (by id or asset+network pair).
app.delete("/api/admin/wallet/addresses", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  let rows: any[] = [];
  if (body.id) rows = await many("SELECT * FROM wallet_addresses WHERE id = $1", [body.id]);
  else if (body.asset && body.network) {
    rows = await many(
      "SELECT * FROM wallet_addresses WHERE LOWER(asset)=LOWER($1) AND LOWER(network)=LOWER($2)",
      [clean(body.asset, 20), clean(body.network, 20)],
    );
  } else return c.json({ error: "شناسه یا جفت asset/network لازم است." }, 400);
  if (!rows.length) return c.json({ error: "آدرس یافت نشد." }, 404);
  for (const row of rows) {
    await pool.query("UPDATE wallet_addresses SET enabled = false, address = '' WHERE id = $1", [row.id]);
  }
  await audit("wallet_address_remove", admin.username, admin.id, "wallet", { count: rows.length });
  return c.json({ ok: true });
});

// ── ADMIN: settings ──────────────────────────────────────────────────────────
app.get("/api/admin/settings", requireAdmin, async (c) => {
  const s = await getSettings();
  // never return raw secrets — only masked
  return c.json({
    settings: {
      ...s,
      "telegram.token": mask(s["telegram.token"]),
      "ai.key": mask(s["ai.key"]),
      "ai.key2": mask(s["ai.key2"]),
    },
  });
});

app.post("/api/admin/settings", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  // Accept both the flat settings map AND the Convex-shaped { settings: {...} }
  // payload the dashboard sends — without this the Save button was a silent no-op.
  const patch = body.settings && typeof body.settings === "object" ? body.settings : body;
  const allowed = new Set([
    ...Object.keys(DEFAULT_SETTINGS),
    "telegram.webhookSecret",
    "swapwallet.apiKey",
    "wallet.swapwalletEnabled",
    // Dashboard display-key aliases (persisted, engine-managed mirrors):
    "engine.capital",
    "engine.realizedPnl",
  ]);
  const SECRET_KEYS = new Set([
    "telegram.token", "telegram.webhookSecret", "db.password",
    "ai.key", "ai.key2", "tts.apiKey", "swapwallet.apiKey",
  ]);
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.has(k)) continue;
    if (["engine.mode", "risk.preset"].includes(k)) continue; // managed elsewhere
    // An empty or masked secret means "keep the stored value" — never wipe it.
    if (SECRET_KEYS.has(k) && (v == null || /[\u2022\u2026*]{3,}/.test(String(v)))) continue;
    await setSetting(k, v, k.split(".")[0], admin.username);
    if (k == "telegram.token") invalidateTelegramTokenCache();
  }
  await audit("settings_update", admin.username, admin.id, "settings", { keys: Object.keys(patch) });
  return c.json({ ok: true });
});

app.get("/api/admin/strategies/presets", requireAdmin, async (c) => c.json(await listStrategyPresets()));

app.post("/api/admin/strategies/preset", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const presetId = clean(body.preset, 30);
  if (!presetId) return c.json({ error: "پیش‌تنظیم نامعتبر است." }, 400);
  try {
    const r = await applyStrategyPreset(presetId, admin.username);
    await audit("strategy_preset", admin.username, admin.id, "strategies", { preset: presetId, changed: r.changed });
    return c.json(r);
  } catch (e: any) {
    return c.json({ error: String(e?.message ?? e) }, 400);
  }
});

app.post("/api/admin/settings/preset", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const requested = clean(body.preset ?? body.presetId ?? body.key ?? body.value, 30).toLowerCase();
  const aliases: Record<string, string> = { safest: "conservative", very_low: "conservative", low: "conservative", high: "aggressive", very_high: "aggressive", maximum: "aggressive" };
  const preset = aliases[requested] ?? requested;
  if (!["conservative", "balanced", "aggressive"].includes(preset)) {
    return c.json({ error: `پیش‌تنظیم نامعتبر است: ${requested || "خالی"}` }, 400);
  }
  await applyRiskPreset(preset, admin.username);
  await audit("risk_preset", admin.username, admin.id, "settings", { preset, requested });
  return c.json({ ok: true, preset, requestedPreset: requested });
});

// AI risk advisor: suggest a preset based on answers
app.post("/api/admin/settings/ai-risk-advice", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const r = await aiAskJson<{ preset: string; reason_fa: string }>(
    "general",
    "You are a risk manager for a crypto/forex trading engine. Choose conservative|balanced|aggressive and give a short Persian reason.",
    JSON.stringify(body),
    { preset: "balanced", reason_fa: "با تنظیمات فعلی، پیش‌تنظیم متعادل مناسب است." }
  );
  return c.json(r);
});

// ── ADMIN: emergency + engine ────────────────────────────────────────────────
app.post("/api/admin/emergency/stop", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const stop = !!body.stop;
  await emergencyStop(stop);
  await audit("emergency_stop", admin.username, admin.id, "engine", { stop });
  return c.json({ ok: true });
});

app.post("/api/admin/emergency/pause", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  await setSetting("engine.pauseNewTrades", !!body.pause, "engine", admin.username);
  await audit("pause_trades", admin.username, admin.id, "engine", { pause: !!body.pause });
  return c.json({ ok: true });
});

app.post("/api/admin/emergency/close-all", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const confirmStr = String(body.confirm || body.confirmPhrase || "").trim().toLowerCase();
  if (confirmStr !== "close_all" && confirmStr !== "ببند" && confirmStr !== "بستن" && confirmStr !== "close") {
    return c.json({ error: "تأیید الزامی است." }, 400);
  }
  const n = await closeAllPositions();
  await audit("close_all_positions", admin.username, admin.id, "engine", { n });
  return c.json({ ok: true, closed: n });
});

// Manual scan — dedupe so a second click while one is already running
// returns immediately instead of stacking heavy engine work.
let scanInflight: Promise<any> | null = null;
app.post("/api/admin/engine/scan", requireAdmin, async (c) => {
  if (scanInflight) return c.json({ ok: true, queued: true, running: true });
  scanInflight = engineTick()
    .catch((e: any) => ({ ok: false, error: String(e?.message ?? e) }))
    .finally(() => { scanInflight = null; });
  const r = await scanInflight;
  return c.json({ ok: true, ...(r ?? {}), running: false });
});

app.post("/api/admin/engine/mode", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  // Accept both the server-native shape ({mode:"demo"|"live"}) and the
  // Convex-style dashboard toggles ({liveTradingEnabled:boolean, autonomous,
  // engineEnabled, useAI, telegramEnabled, channelPostTrades/...}).
  let mode = clean(body.mode, 10);
  if (!["demo", "live"].includes(mode)) {
    mode = body.liveTradingEnabled === true || body.live === true ? "live" : "demo";
  }
  if (body.confirmPhrase === "بستن") body.confirm = "CLOSE_ALL";
  if (mode === "live" && body.confirm !== "LIVE") {
    return c.json({ error: "برای فعال‌سازی Live باید عبارت تأیید وارد شود." }, 400);
  }
  const writes: Array<[string, unknown]> = [["engine.mode", mode]];
  if (body.engineEnabled !== undefined) writes.push(["engine.enabled", !!body.engineEnabled]);
  if (body.autonomous !== undefined) writes.push(["engine.autonomous", !!body.autonomous]);
  if (body.useAI !== undefined) writes.push(["engine.useAI", !!body.useAI]);
  if (body.telegramEnabled !== undefined) writes.push(["telegram.enabled", !!body.telegramEnabled]);
  if (body.channelPostTrades !== undefined) writes.push(["channel.postTrades", !!body.channelPostTrades]);
  if (body.channelPostSignals !== undefined) writes.push(["channel.postSignals", !!body.channelPostSignals]);
  if (body.liveTradingEnabled !== undefined) writes.push(["trading.liveTradingEnabled", !!body.liveTradingEnabled]);
  if (body.capital !== undefined && Number.isFinite(Number(body.capital))) writes.push(["engine.virtualCapital", Number(body.capital)]);
  for (const [k, v] of writes) await setSetting(k, v, "engine", admin.username);
  await audit("engine_mode", admin.username, admin.id, "engine", { mode, fields: writes.map((w) => w[0]) });
  return c.json({ ok: true, mode });
});

// ── ADMIN: engine tools (backtest / tuner / research / manual open) ─────────
app.post("/api/admin/engine/backtest", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const symbol = clean(body.symbol, 20).toUpperCase();
  const timeframe = clean(body.timeframe ?? "1h", 8);
  try {
    const r = await runBacktest(symbol, timeframe, body.exchange ? clean(body.exchange, 20) : undefined);
    await audit("engine_backtest", admin.username, admin.id, "engine", { symbol, timeframe, trades: r.trades });
    return c.json(r);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});


// AI validation backtest — replay stored candles and ask the AI to predict
// the next-candle direction; compare against reality (main provider + free
// fallback chain). Mirrors the preview's runAiBacktest.
app.post("/api/admin/engine/ai-backtest", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const settings = (await getSettings()) as unknown as Record<string, any>;
  const provider = String(settings["ai.provider"] ?? "gemini");
  const model = String(settings["ai.model"] ?? "gemini-flash-latest");
  const key = String(settings["ai.key"] ?? "");
  const freeFallback = settings["ai.freeFallback"] !== "false" && settings["ai.freeFallback"] !== false;
  if (!key && !freeFallback) {
    return c.json({ error: "هیچ کلید AI و fallback رایگان فعال نیست — کلید بگذارید یا fallback را روشن کنید" }, 400);
  }
  const tf = clean(body.timeframe ?? "15m", 8);
  const markets = await many("SELECT symbol FROM markets WHERE enabled = true ORDER BY priority ASC LIMIT 4");
  const system =
    "You are a market-direction evaluator. Predict only the direction of the NEXT candle after each index (higher close → \"up\", lower close → \"down\"). Reply in strict JSON only: {\"predictions\":[{\"i\":0,\"dir\":\"up\"},{\"i\":1,\"dir\":\"down\"}]}.";

  const results: any[] = [];
  let correct = 0;
  let total = 0;
  const errors: string[] = [];

  for (const m of markets) {
    const sym = String(m.symbol);
    let candles = await many(
      "SELECT t, o, h, l, c, v FROM candles WHERE symbol = $1 AND timeframe = $2 ORDER BY t ASC LIMIT 300",
      [sym, tf],
    );
    if (candles.length < 50) {
      try {
        const fetched = await fetchKlines(sym, tf);
        candles = (fetched ?? []).slice(-300);
      } catch { /* keep whatever we have */ }
    }
    if (candles.length < 40) {
      errors.push(`${sym}: کندل کافی نیست`);
      continue;
    }
    const windowCandles = candles.slice(-80);
    const offsets = [windowCandles.length - 6, windowCandles.length - 12, windowCandles.length - 18, windowCandles.length - 24]
      .filter((idx) => idx >= 30 && idx < windowCandles.length - 1);
    if (!offsets.length) continue;
    const rows = offsets.map((idx) => ({
      i: idx,
      actual: Number(windowCandles[idx + 1].c) >= Number(windowCandles[idx].c) ? "up" : "down",
    }));
    const series = windowCandles.map((x: any) => Number(x.c).toFixed(6)).join(",");
    const prompt = `Symbol: ${sym} · Timeframe: ${tf}\nPrice closes: [${series}]\nPredict the next-candle direction at indices ${offsets.join(",")}.\nRespond JSON only.`;
    let parsed: any = null;
    try {
      parsed = await aiAskJson<any>(
        "general",
        system,
        prompt,
        { predictions: [] },
      );
    } catch (e: any) {
      errors.push(`${sym}: ${String(e?.message ?? e)}`);
    }
    const predictions: Array<{ i: number; dir: string }> = Array.isArray(parsed?.predictions) ? parsed.predictions : [];
    let win = 0;
    const rowsOut = rows.map((row) => {
      const pred = String(predictions.find((p2) => Number(p2?.i) === row.i)?.dir ?? "").toLowerCase();
      const ok = pred === row.actual;
      if (ok) win++;
      total++;
      return { i: row.i, actual: row.actual, predicted: pred || "—", ok };
    });
    correct += win;
    results.push({ symbol: sym, timeframe: tf, windows: rowsOut, correct: win, total: rowsOut.length });
  }

  return c.json({
    ok: true,
    correct,
    total,
    accuracy: total ? Math.round((correct / total) * 1000) / 10 : 0,
    results,
    errors,
    provider,
    model,
  });
});

app.post("/api/admin/engine/tuner", requireAdmin, async (c) => {
  const admin = userOf(c);
  try {
    const r = await runTuner();
    await audit("engine_tuner", admin.username, admin.id, "engine", { combos: r.combos, windows: r.windows });
    return c.json(r);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.post("/api/admin/engine/research", requireAdmin, async (c) => {
  const admin = userOf(c);
  try {
    const r = await runResearch();
    await audit("engine_research", admin.username, admin.id, "engine", { markets: r.markets });
    return c.json(r);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.post("/api/admin/positions/open", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const symbol = clean(body.symbol, 20).toUpperCase();
  const side = clean(body.side, 10) === "short" ? "short" : clean(body.side, 10) === "long" ? "long" : undefined;
  try {
    const pos = await manualOpen(symbol, side, clean(body.note, 300));
    await audit("position_manual_open", admin.username, admin.id, "position", { symbol, side });
    return c.json({ ok: true, position: pos });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// ── ADMIN: positions ─────────────────────────────────────────────────────────
app.get("/api/admin/positions", requireAdmin, async (c) => {
  const open = await many("SELECT * FROM open_positions ORDER BY open_time DESC");
  const closed = await many("SELECT * FROM closed_positions ORDER BY close_time DESC LIMIT 200");
  return c.json({ open, closed });
});

// Send every open position to the Telegram channel as a formatted digest.
app.post("/api/admin/positions/send-all-telegram", requireAdmin, async (c) => {
  const admin = userOf(c);
  const r = await sendAllPositionsToTelegram();
  await audit("positions.bulk_sent_to_telegram", admin.username, admin.id, "positions", { sent: r.sent, reason: r.reason });
  if (!r.ok && r.reason) return c.json({ error: r.reason }, 400);
  return c.json(r);
});

app.post("/api/admin/positions/:id/close", requireAdmin, async (c) => {
  const admin = userOf(c);
  const id = c.req.param("id");
  if (!id || id === "undefined") return c.json({ error: "شناسه پوزیشن نامعتبر است." }, 400);
  const p = await one("SELECT * FROM open_positions WHERE id = $1", [id]);
  if (!p) return c.json({ error: "پوزیشن یافت نشد." }, 404);
  const tick = await fetchTicker(p.symbol).catch(() => null);
  const price = Number(tick?.price);
  if (!Number.isFinite(price) || price <= 0) {
    return c.json({ error: "قیمت لحظه‌ای برای این نماد در دسترس نیست." }, 400);
  }
  await closePosition(id, "manual", price, p);
  await audit("position_close", admin.username, admin.id, "position", { id, symbol: p.symbol });
  return c.json({ ok: true });
});

// ── ADMIN: exchanges ─────────────────────────────────────────────────────────
app.get("/api/admin/exchanges", requireAdmin, async (c) => {
  const rows = await many(
    `SELECT id, name, provider, environment, enabled, status, last_test, last_error, balance,
            api_key_enc, api_secret_enc, pass_phrase_enc, account_id
       FROM exchange_accounts ORDER BY created_at DESC`
  );
  return c.json({
    exchanges: rows.map((r) => ({
      ...r,
      api_key_enc: mask(r.api_key_enc),
      api_secret_enc: mask(r.api_secret_enc),
      pass_phrase_enc: r.pass_phrase_enc ? mask(r.pass_phrase_enc) : null,
    })),
    providers: Object.keys(adapters),
  });
});

app.post("/api/admin/exchanges", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const provider = clean(body.provider, 30);
  if (!adapters[provider]) return c.json({ error: "صرافی نامعتبر است." }, 400);
  const r = await pool.query(
    `INSERT INTO exchange_accounts
       (name, provider, api_key_enc, api_secret_enc, pass_phrase_enc, account_id, environment, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      clean(body.name, 100) || provider,
      provider,
      encryptSecret(clean(body.apiKey, 500)),
      encryptSecret(clean(body.apiSecret, 500)),
      body.passphrase ? encryptSecret(clean(body.passphrase, 500)) : null,
      clean(body.accountId, 100) || null,
      body.environment === "live" ? "live" : "demo",
      !!body.enabled,
    ]
  );
  await audit("exchange_add", admin.username, admin.id, "exchange", { provider });
  return c.json({ exchange: r.rows[0] });
});

app.patch("/api/admin/exchanges/:id", requireAdmin, async (c) => {
  const admin = userOf(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const sets: string[] = [];
  const vals: unknown[] = [id];
  const push = (col: string, v: unknown) => {
    sets.push(`${col} = $${vals.length + 1}`);
    vals.push(v);
  };
  if (body.enabled !== undefined) push("enabled", !!body.enabled);
  if (body.environment !== undefined) push("environment", body.environment === "live" ? "live" : "demo");
  if (body.apiKey) push("api_key_enc", encryptSecret(clean(body.apiKey, 500)));
  if (body.apiSecret) push("api_secret_enc", encryptSecret(clean(body.apiSecret, 500)));
  if (body.passphrase) push("pass_phrase_enc", encryptSecret(clean(body.passphrase, 500)));
  if (sets.length === 0) return c.json({ error: "هیچ فیلدی ارسال نشد." }, 400);
  await pool.query(`UPDATE exchange_accounts SET ${sets.join(", ")}, updated_at = $${vals.length + 1} WHERE id = $1`, [...vals, now()]);
  await audit("exchange_update", admin.username, admin.id, "exchange", { id, fields: sets });
  return c.json({ ok: true });
});

app.delete("/api/admin/exchanges/:id", requireAdmin, async (c) => {
  const admin = userOf(c);
  const id = c.req.param("id");
  const r = await pool.query("DELETE FROM exchange_accounts WHERE id = $1 RETURNING id", [id]);
  if (!r.rows.length) return c.json({ error: "صرافی یافت نشد." }, 404);
  await audit("exchange_delete", admin.username, admin.id, "exchange", { id });
  return c.json({ ok: true });
});

app.post("/api/admin/exchanges/:id/test", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const ex = await one("SELECT * FROM exchange_accounts WHERE id = $1", [id]);
  if (!ex) return c.json({ error: "صرافی یافت نشد." }, 404);
  const adapter = adapters[ex.provider];
  const result: any = { provider: ex.provider, marketData: "ok" };
  try {
    const tick = await adapter.ticker("BTCUSDT");
    result.marketData = tick ? "ok" : "no_data";
  } catch (e: any) {
    result.marketData = `error: ${e.message}`;
  }
  try {
    const bal = await adapter.balance();
    result.balance = bal !== null ? bal : "needs_live_keys";
  } catch (e: any) {
    result.balance = `error: ${e.message}`;
  }
  const status = result.marketData === "ok" ? "ok" : "error";
  await pool.query(
    `UPDATE exchange_accounts SET status = $1, last_test = $2, last_error = $3, balance = $4 WHERE id = $5`,
    [status, now(), result.balance === "needs_live_keys" ? "لایو فعال نشده" : null, typeof result.balance === "number" ? result.balance : null, id]
  );
  return c.json({ ok: status === "ok", result });
});

// ── ADMIN: AI providers ──────────────────────────────────────────────────────
app.get("/api/admin/ai/providers", requireAdmin, async (c) => {
  const rows = await many("SELECT * FROM ai_providers ORDER BY priority ASC");
  return c.json({
    providers: rows.map((r) => ({ ...r, api_key_enc: r.api_key_enc ? mask(r.api_key_enc) : null })),
  });
});

app.post("/api/admin/ai/providers", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const provider = clean(body.provider, 30);
  if (!["gemini", "openai", "anthropic", "openrouter", "ollama"].includes(provider)) {
    return c.json({ error: "پروایدر نامعتبر است." }, 400);
  }
  const r = await pool.query(
    `INSERT INTO ai_providers (provider, model, api_key_enc, base_url, priority, enabled, purpose, rate_limit, daily_limit)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      provider,
      clean(body.model, 100) || defaultModel(provider),
      body.apiKey ? encryptSecret(clean(body.apiKey, 500)) : null,
      clean(body.baseUrl, 300) || null,
      num(body.priority, 100),
      body.enabled !== false,
      clean(body.purpose, 30) || "general",
      num(body.rateLimit, 30),
      num(body.dailyLimit, 500),
    ]
  );
  await audit("ai_provider_add", admin.username, admin.id, "ai", { provider });
  return c.json({ provider: r.rows[0] });
});

app.patch("/api/admin/ai/providers/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const sets: string[] = [];
  const vals: unknown[] = [id];
  const push = (col: string, v: unknown) => {
    sets.push(`${col} = $${vals.length + 1}`);
    vals.push(v);
  };
  if (body.enabled !== undefined) push("enabled", !!body.enabled);
  if (body.model) push("model", clean(body.model, 100));
  if (body.priority !== undefined) push("priority", num(body.priority, 100));
  if (body.purpose) push("purpose", clean(body.purpose, 30));
  if (body.rateLimit !== undefined) push("rate_limit", num(body.rateLimit, 30));
  if (body.dailyLimit !== undefined) push("daily_limit", num(body.dailyLimit, 500));
  if (body.apiKey) push("api_key_enc", encryptSecret(clean(body.apiKey, 500)));
  if (sets.length === 0) return c.json({ error: "هیچ فیلدی ارسال نشد." }, 400);
  await pool.query(`UPDATE ai_providers SET ${sets.join(", ")} WHERE id = $1`, vals);
  return c.json({ ok: true });
});

app.post("/api/admin/ai/providers/:id/test", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const p = await one("SELECT * FROM ai_providers WHERE id = $1", [id]);
  if (!p) return c.json({ error: "پروایدر یافت نشد." }, 404);
  const r = await aiAsk(
    p.purpose ?? "general",
    "Reply with exactly: OK",
    "Connection test"
  );
  return c.json({ ok: !!r, used: r?.provider ?? null });
});

function defaultModel(p: string): string {
  return { gemini: "gemini-flash-latest", openai: "gpt-4o-mini", anthropic: "claude-3-5-haiku-latest", openrouter: "meta-llama/llama-3.1-8b-instruct", ollama: "llama3" }[p] ?? "llama3";
}

// ── ADMIN: notifications ─────────────────────────────────────────────────────
app.post("/api/admin/notify", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const target = clean(body.target, 10); // user | vip | all
  const userId = clean(body.userId, 100);
  const titleFa = clean(body.titleFa, 200);
  const textFa = clean(body.textFa, 4000);
  const titleEn = clean(body.titleEn, 200) || titleFa;
  const textEn = clean(body.textEn, 4000) || textFa;
  const type = clean(body.type, 20) || "system";
  if (!titleFa) return c.json({ error: "عنوان الزامی است." }, 400);

  let targetIds: string[] = [];
  if (target === "user" && userId) targetIds = [userId];
  else if (target === "vip") {
    const rows = await many<{ id: string }>("SELECT id FROM users WHERE is_vip = true AND enabled = true");
    targetIds = rows.map((r) => r.id);
  } else if (target === "all") {
    const rows = await many<{ id: string }>("SELECT id FROM users WHERE enabled = true");
    targetIds = rows.map((r) => r.id);
  } else return c.json({ error: "مقصد نامعتبر است." }, 400);

  for (const uid of targetIds) {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title_fa, text_fa, title_en, text_en) VALUES ($1, $2, $3, $4, $5, $6)`,
      [uid, type, titleFa, textFa, titleEn, textEn]
    );
  }
  const s = await getSettings();
  if (body.telegram && s["notify.telegram"]) {
    for (const uid of targetIds) {
      const u = await one<{ tg_id: number | null }>("SELECT tg_id FROM users WHERE id = $1", [uid]);
      if (u?.tg_id) {
        void sendMessage(u.tg_id, `${titleFa}\n\n${textFa}`).catch(() => undefined);
      }
    }
  }
  await audit("notify", admin.username, admin.id, "notification", { target, count: targetIds.length, telegram: !!body.telegram });
  return c.json({ ok: true, count: targetIds.length });
});

// ── ADMIN: VIP packages + requests ───────────────────────────────────────────
app.get("/api/admin/vip/packages", requireAdmin, async (c) => {
  const rows = await many("SELECT * FROM vip_packages ORDER BY price ASC");
  return c.json({ packages: rows });
});

app.patch("/api/admin/vip/packages/:key", requireAdmin, async (c) => {
  const admin = userOf(c);
  const key = c.req.param("key");
  const body = await c.req.json().catch(() => ({}));
  const sets: string[] = [];
  const vals: unknown[] = [key];
  const push = (col: string, v: unknown) => {
    sets.push(`${col} = $${vals.length + 1}`);
    vals.push(v);
  };
  if (body.name !== undefined) push("name", clean(body.name, 100));
  if (body.name_fa !== undefined || body.nameFa !== undefined) push("name_fa", clean(body.name_fa ?? body.nameFa, 100));
  if (body.price !== undefined) push("price", num(body.price));
  if (body.duration_days !== undefined || body.durationDays !== undefined) push("duration_days", num(body.duration_days ?? body.durationDays));
  if (body.min_capital !== undefined || body.minCapital !== undefined) push("min_capital", num(body.min_capital ?? body.minCapital));
  if (body.max_capital !== undefined || body.maxCapital !== undefined) push("max_capital", num(body.max_capital ?? body.maxCapital));
  if (body.status !== undefined) push("status", !!body.status);
  
  if (body.features !== undefined) {
    const raw = body.features;
    const arr = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split("\n") : []);
    push("features", arr.map((x: any) => String(x).trim()).filter(Boolean));
  }
  if (body.features_fa !== undefined || body.featuresFa !== undefined) {
    const raw = body.features_fa ?? body.featuresFa;
    const arr = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split("\n") : []);
    push("features_fa", arr.map((x: any) => String(x).trim()).filter(Boolean));
  }
  if (body.risk_disclosure !== undefined || body.riskDisclosure !== undefined) push("risk_disclosure", clean(body.risk_disclosure ?? body.riskDisclosure, 4000));
  if (body.terms !== undefined) push("terms", clean(body.terms, 4000));

  if (sets.length === 0) return c.json({ error: "هیچ فیلدی ارسال نشد." }, 400);
  await pool.query(`UPDATE vip_packages SET ${sets.join(", ")} WHERE key = $1`, vals);
  await audit("vip_package_update", admin.username, admin.id, "vip", { key });
  return c.json({ ok: true });
});

app.get("/api/admin/vip/requests", requireAdmin, async (c) => {
  const rows = await many(
    `SELECT vr.*, u.username, u.phone FROM vip_requests vr LEFT JOIN users u ON u.id = vr.user_id ORDER BY vr.created_at DESC LIMIT 100`
  );
  return c.json({ requests: rows });
});

app.post("/api/admin/vip/requests/:id/review", requireAdmin, async (c) => {
  const admin = userOf(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const status = clean(body.status, 20);
  if (!["approved", "rejected"].includes(status)) return c.json({ error: "وضعیت نامعتبر است." }, 400);
  const req = await one("SELECT * FROM vip_requests WHERE id = $1", [id]);
  if (!req) return c.json({ error: "درخواست یافت نشد." }, 404);
  const pkg = await one("SELECT * FROM vip_packages WHERE key = $1", [req.package_key]);
  await tx(async (c2) => {
    await c2.query(
      `UPDATE vip_requests SET status = $1, review = $2, review_at = $3, reviewed_by = $4 WHERE id = $5`,
      [status, clean(body.review, 1000), now(), admin.username, id]
    );
    if (status === "approved" && pkg) {
      await c2.query(
        `UPDATE users SET is_vip = true, vip_package = $1, vip_expires_at = $2 WHERE id = $3`,
        [pkg.key, now() + num(pkg.duration_days) * 86_400_000, req.user_id]
      );
      await c2.query(
        `INSERT INTO vip_contracts (user_id, package_key, capital, fee, duration_days, contract_version, accepted_at, status)
         VALUES ($1, $2, $3, $4, $5, '1.0', $6, 'active')`,
        [req.user_id, pkg.key, num(req.capital), num(pkg.price), num(pkg.duration_days), now()]
      );
      await c2.query(
        `INSERT INTO notifications (user_id, type, title_fa, text_fa, title_en, text_en)
         VALUES ($1, 'vip', 'درخواست VIP تأیید شد', $2, 'VIP approved', $3)`,
        [req.user_id, `پکیج ${pkg.name_fa} شما فعال شد.`, `Your ${pkg.name} package is active.`]
      );
    } else {
      await c2.query(
        `INSERT INTO notifications (user_id, type, title_fa, text_fa, title_en, text_en)
         VALUES ($1, 'vip', 'درخواست VIP رد شد', $2, 'VIP rejected', $3)`,
        [req.user_id, clean(body.review, 1000) || "درخواست شما رد شد.", body.review || "Your request was rejected."]
      );
    }
  });
  await audit("vip_review", admin.username, admin.id, "vip", { id, status });
  return c.json({ ok: true });
});

// ── ADMIN: support ───────────────────────────────────────────────────────────
app.get("/api/admin/support/tickets", requireAdmin, async (c) => {
  const rows = await many(
    `SELECT t.*, u.username, u.name FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id
     ORDER BY t.last_activity DESC LIMIT 100`
  );
  return c.json({ tickets: rows });
});

app.get("/api/admin/support/tickets/:id", requireAdmin, async (c) => {
  const t = await one("SELECT * FROM support_tickets WHERE id = $1", [c.req.param("id")]);
  if (!t) return c.json({ error: "تیکت یافت نشد." }, 404);
  const msgs = await many("SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC", [t.id]);
  const u = await one("SELECT id, username, name, tg_id FROM users WHERE id = $1", [t.user_id]);
  return c.json({ ticket: t, messages: msgs, user: u });
});
// Set ticket status without posting a reply.
app.patch("/api/admin/support/tickets/:id", requireAdmin, async (c) => {
  const admin = userOf(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const status = clean(body.status, 20);
  const allowed = ["open", "pending", "answered", "closed"];
  if (!allowed.includes(status)) return c.json({ error: "وضعیت نامعتبر است." }, 400);
  const r = await pool.query(
    "UPDATE support_tickets SET status = $1, last_activity = $2 WHERE id = $3 RETURNING id",
    [status, now(), id],
  );
  if (!r.rows.length) return c.json({ error: "تیکت یافت نشد." }, 404);
  await audit("ticket_status", admin.username, admin.id, "support", { id, status });
  return c.json({ ok: true });
});


app.post("/api/admin/support/tickets/:id/reply", requireAdmin, async (c) => {
  const admin = userOf(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const t = await one("SELECT * FROM support_tickets WHERE id = $1", [id]);
  if (!t) return c.json({ error: "تیکت یافت نشد." }, 404);
  const text = clean(body.text, 4000);
  await tx(async (c2) => {
    await c2.query(
      `INSERT INTO support_messages (ticket_id, user_id, from_admin, text) VALUES ($1, $2, true, $3)`,
      [id, admin.id, text]
    );
    await c2.query(
      `UPDATE support_tickets SET status = $1, last_activity = $2 WHERE id = $3`,
      [clean(body.status, 20) || "answered", now(), id]
    );
  });
  // notify user in-app + telegram
  await pool.query(
    `INSERT INTO notifications (user_id, type, title_fa, text_fa, title_en, text_en)
     VALUES ($1, 'support', 'پاسخ پشتیبانی', $2, 'Support reply', $3)`,
    [t.user_id, text.slice(0, 1000), text.slice(0, 1000)]
  );
  const u = await one<{ tg_id: number | null }>("SELECT tg_id FROM users WHERE id = $1", [t.user_id]);
  if (u?.tg_id) {
    void sendMessage(u.tg_id, `💬 پاسخ پشتیبانی:\n\n${text}`).catch(() => undefined);
  }
  return c.json({ ok: true });
});

// ── ADMIN: referral + learning + logs ────────────────────────────────────────
app.get("/api/admin/referrals", requireAdmin, async (c) => {
  const rows = await many(
    `SELECT r.*, ru.username AS referrer, du.username AS referred_user
       FROM referrals r
       LEFT JOIN users ru ON ru.id = r.referrer_id
       LEFT JOIN users du ON du.id = r.referred_id
      ORDER BY r.created_at DESC LIMIT 200`
  );
  return c.json({ referrals: rows });
});

app.get("/api/admin/learning", requireAdmin, async (c) => {
  const rows = await many("SELECT * FROM learning_history ORDER BY created_at DESC LIMIT 200");
  const perf = await many(
    "SELECT * FROM strategy_performance ORDER BY trades DESC LIMIT 100"
  );
  return c.json({ history: rows, performance: perf });
});

app.get("/api/admin/logs", requireAdmin, async (c) => {
  const q = clean(c.req.query("q") ?? "", 200);
  const level = clean(c.req.query("level") ?? "", 20);
  const rows = await many(
    `SELECT * FROM engine_logs
     WHERE ($1 = '' OR message ILIKE '%' || $1 || '%') AND ($2 = '' OR level = $2)
     ORDER BY created_at DESC LIMIT 300`,
    [q, level.toUpperCase()]
  );
  const auditRows = await many("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200");
  return c.json({ logs: rows, audit: auditRows });
});

// ── ADMIN: markets ───────────────────────────────────────────────────────────
app.patch("/api/admin/markets/:symbol", requireAdmin, async (c) => {
  const admin = userOf(c);
  const symbol = clean(c.req.param("symbol"), 20);
  const body = await c.req.json().catch(() => ({}));
  const sets: string[] = [];
  const vals: unknown[] = [symbol];
  const push = (col: string, v: unknown) => {
    sets.push(`${col} = $${vals.length + 1}`);
    vals.push(v);
  };
  if (body.enabled !== undefined) push("enabled", !!body.enabled);
  if (body.priority !== undefined) push("priority", num(body.priority, 100));
  if (body.type !== undefined) push("type", body.type === "spot" ? "spot" : "futures");
  if (body.spot_enabled !== undefined) push("spot_enabled", !!body.spot_enabled);
  if (body.futures_enabled !== undefined) push("futures_enabled", !!body.futures_enabled);
  if (body.network !== undefined) push("network", clean(body.network, 30) || null);
  if (sets.length === 0) return c.json({ error: "هیچ فیلدی ارسال نشد." }, 400);
  await pool.query(`UPDATE markets SET ${sets.join(", ")} WHERE symbol = $1`, vals);
  await audit("market_update", admin.username, admin.id, "market", { symbol, fields: sets });
  return c.json({ ok: true });
});

// ── ADMIN: trading reports (daily / weekly / monthly / all) ─────────────────
app.get("/api/admin/reports", requireAdmin, async (c) => {
  const period = clean(c.req.query("period") ?? "daily", 10);
  const nowMs = now();
  const DAY = 86400000;
  const ds = new Date();
  ds.setHours(0, 0, 0, 0);
  const from = period === "daily" ? ds.getTime() : period === "weekly" ? nowMs - 7 * DAY : period === "monthly" ? nowMs - 30 * DAY : 0;
  const closed = await many("SELECT * FROM closed_positions WHERE close_time >= $1", [from]);
  const open = await many("SELECT * FROM open_positions");
  const wins = closed.filter((p) => num(p.profit) > 0);
  const losses = closed.filter((p) => num(p.profit) < 0);
  const realized = closed.reduce((s, p) => s + num(p.profit), 0);
  const unrealized = open.reduce((s, p) => s + num(p.pnl), 0);
  const grossProfit = wins.reduce((s, p) => s + num(p.profit), 0);
  const grossLoss = Math.abs(losses.reduce((s, p) => s + num(p.profit), 0));
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const byStrategy = new Map<string, { trades: number; pnl: number }>();
  const bySymbol = new Map<string, { trades: number; pnl: number }>();
  for (const p of closed) {
    for (const key of (p.strategy_keys ?? []) || []) {
      const e = byStrategy.get(key) ?? { trades: 0, pnl: 0 };
      e.trades++;
      e.pnl += num(p.profit);
      byStrategy.set(key, e);
    }
    const s2 = bySymbol.get(p.symbol) ?? { trades: 0, pnl: 0 };
    s2.trades++;
    s2.pnl += num(p.profit);
    bySymbol.set(p.symbol, s2);
  }
  const rank = (m: Map<string, { trades: number; pnl: number }>) =>
    [...m.entries()].filter(([, v]) => v.trades >= 1).sort((a, b) => b[1].pnl - a[1].pnl);
  const strategies = rank(byStrategy);
  const symbols = rank(bySymbol);
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  for (const p of [...closed].sort((a, b) => num(a.close_time) - num(b.close_time))) {
    equity += num(p.profit);
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak - equity);
  }
  const returns = closed.map((p) => {
    const denom = Math.max(1e-9, Math.abs(num(p.entry) - num(p.stop_loss ?? p.entry)) * (num(p.quantity) || 1));
    return num(p.profit) / denom;
  });
  const meanR = returns.length ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const sdR = returns.length > 1 ? Math.sqrt(returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / (returns.length - 1)) : 0;
  const sharpe = sdR > 0 ? round((meanR / sdR) * Math.sqrt(365), 2) : 0;
  const avgWin = wins.length ? round(wins.reduce((s, p) => s + num(p.profit), 0) / wins.length, 4) : 0;
  const avgLoss = losses.length ? round(losses.reduce((s, p) => s + num(p.profit), 0) / losses.length, 4) : 0;
  const avgRr = closed.length
    ? round(closed.reduce((s, p) => {
        const risk = Math.max(1e-9, Math.abs(num(p.entry) - num(p.stop_loss ?? p.entry)));
        const reward = Math.abs(num(p.close_price ?? p.current ?? p.entry) - num(p.entry));
        return s + reward / risk;
      }, 0) / closed.length, 2)
    : 0;
  return c.json({
    period, from, to: nowMs, trades: closed.length, openPositions: open.length,
    wins: wins.length, losses: losses.length, winRate: round(winRate, 2),
    realizedPnl: round(realized, 4), unrealizedPnl: round(unrealized, 4), totalPnl: round(realized + unrealized, 4),
    profitFactor: Number.isFinite(profitFactor) ? round(profitFactor, 2) : profitFactor,
    grossProfit: round(grossProfit, 4), grossLoss: round(grossLoss, 4), maxDrawdown: round(maxDD, 4),
    sharpe, expectancy: round(meanR, 4), avgWin, avgLoss, avgRr,
    bestStrategy: strategies[0] ? { key: strategies[0][0], trades: strategies[0][1].trades, pnl: round(strategies[0][1].pnl, 4) } : null,
    bestSymbol: symbols[0] ? { symbol: symbols[0][0], trades: symbols[0][1].trades, pnl: round(symbols[0][1].pnl, 4) } : null,
    strategyRank: strategies.slice(0, 10).map(([key, v]) => ({ key, trades: v.trades, pnl: round(v.pnl, 4) })),
    symbolRank: symbols.slice(0, 10).map(([sym, v]) => ({ symbol: sym, trades: v.trades, pnl: round(v.pnl, 4) })),
  });
});

// ── ADMIN: AI usage + history clear ──────────────────────────────────────────
app.get("/api/admin/ai/usage", requireAdmin, async (c) => {
  const rows = await many("SELECT * FROM ai_analysis ORDER BY created_at DESC LIMIT 200");
  const byKind = new Map<string, number>();
  const byProvider = new Map<string, number>();
  let errors = 0;
  const userIds = new Set<string>();
  for (const r of rows) {
    const m = String(r.key ?? "").match(/^chat:([^:]+):/);
    if (m) userIds.add(m[1]);
    byKind.set(r.kind ?? "chat", (byKind.get(r.kind ?? "chat") ?? 0) + 1);
    byProvider.set(r.provider ?? "?", (byProvider.get(r.provider ?? "?") ?? 0) + 1);
    if (r.status === "error") errors++;
  }
  const userNames = new Map<string, string>();
  for (const uid of Array.from(userIds).slice(0, 60)) {
    const u = await one<{ username: string | null }>("SELECT username FROM users WHERE id = $1", [uid]);
    if (u?.username) userNames.set(uid, u.username);
  }
  return c.json({
    total: rows.length, errors,
    byKind: Object.fromEntries(byKind),
    byProvider: Object.fromEntries(byProvider),
    recent: rows.slice(0, 30).map((r) => {
      const m = String(r.key ?? "").match(/^chat:([^:]+):/);
      return {
        id: r.id, kind: r.kind, provider: r.provider, status: r.status,
        text: String(r.text ?? "").slice(0, 300), error: r.error, created: num(r.created_at),
        user: m ? (userNames.get(m[1]) ?? m[1]) : undefined,
      };
    }),
  });
});

app.post("/api/admin/ai/clear", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const kind = clean(body.kind, 30) || null;
  const r = kind
    ? await pool.query("DELETE FROM ai_analysis WHERE kind = $1", [kind])
    : await pool.query("DELETE FROM ai_analysis");
  await audit("ai_history_cleared", admin.username, admin.id, "ai", { kind, deleted: r.rowCount });
  return c.json({ ok: true, deleted: r.rowCount ?? 0 });
});

// ── ADMIN: AI learning supervisor + strategy research ────────
app.get("/api/admin/ai/tuning-context", requireAdmin, async (c) =>
  c.json({ context: await tuningContext() })
);

app.post("/api/admin/ai/review-learning", requireAdmin, async (c) => {
  const admin = userOf(c);
  const r = await aiReviewLearning();
  await audit("ai.learning_review", admin.username, admin.id, "ai", { reviewed: r?.reviewed ?? 0, applied: r?.applied ?? 0 });
  return c.json(r);
});

// Bounded manual gate tuning (admin override of the AI suggestions).
app.post("/api/admin/ai/tuning", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const key = clean(body.key, 60);
  const value = num(body.value);
  if (!key.startsWith("risk.") || !Number.isFinite(value)) return c.json({ error: "invalid_key_or_value" }, 400);
  await setSetting(key, value, "ai-learning", admin.username);
  await audit("ai.tuning", admin.username, admin.id, "ai", { key, value });
  return c.json({ ok: true });
});

app.post("/api/admin/ai/strategy-weight", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const key = clean(body.key, 60);
  const weight = Math.min(1.5, Math.max(0.3, num(body.weight)));
  if (!key || !Number.isFinite(weight)) return c.json({ error: "invalid_key_or_value" }, 400);
  const r = await pool.query("UPDATE strategies SET weight = $2 WHERE key = $1", [key, weight]);
  if ((r.rowCount ?? 0) === 0) return c.json({ error: "strategy_not_found" }, 404);
  await audit("ai.strategy_weight", admin.username, admin.id, "ai", { key, weight });
  return c.json({ ok: true });
});

// AI proposes NEW strategies (stored as strategy_suggest for the AI center).
app.post("/api/admin/ai/suggest", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const focus = clean(body.focus, 200) || undefined;
  try {
    const r = await suggestStrategies(focus);
    await audit("ai.strategy_suggest", admin.username, admin.id, "ai", { focus, ok: !!r?.ok });
    return c.json(r);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// ── ADMIN: AI-generated daily education (text lesson; media optional) ───────
app.post("/api/admin/education/generate-day", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const force = !!body.force;
  const s = await getSettings();
  if ((s as any)["learning.autoGenerate"] === false && !force) return c.json({ ok: true, created: 0, skipped: true });
  const day = new Date().toISOString().slice(0, 10);
  const existing = await one<{ id: string }>("SELECT id FROM education WHERE day = $1", [day]);
  if (existing && !force) return c.json({ ok: true, created: 0, skipped: true, reason: "already_today" });
  const dayAgo = now() - 86400000;
  const stats = (await one<{ signals: string; closed: string; wins: string; preds: string }>(
    `SELECT
       (SELECT count(*)::int FROM signals WHERE created_at > $1)::text AS signals,
       (SELECT count(*)::int FROM closed_positions WHERE close_time > $1)::text AS closed,
       (SELECT count(*)::int FROM closed_positions WHERE close_time > $1 AND profit > 0)::text AS wins,
       (SELECT count(*)::int FROM demo_predictions WHERE created_at > $1)::text AS preds`,
    [dayAgo]
  )) ?? {} as { signals?: string; closed?: string; wins?: string; preds?: string };
  const topSym = await one<{ symbol: string; side: string }>(
    `SELECT symbol, side FROM closed_positions WHERE close_time > $1 ORDER BY profit DESC LIMIT 1`,
    [dayAgo]
  );
  const closed = num(stats.closed);
  const winRate = closed > 0 ? Math.round((num(stats.wins) / closed) * 100) : 0;
  let lesson = {
    titleFa: "مدیریت ریسک؛ ستون اصلی معاملات",
    titleEn: "Risk management: the core of trading",
    bodyFa: `امروز ${num(stats.signals)} سیگنال و ${closed} معامله بسته شد (نرخ برد ${winRate}٪). بهترین نماد: ${topSym?.symbol ?? "—"} (${topSym?.side ?? "—"}). پیشنهاد: قبل از هر ورود حد ضرر را حداقل ۰٫۱۵٪ دورتر از قیمت بگذارید و ریسک هر معامله را حداکثر ۱-۲٪ سرمایه نگه دارید — بقای حساب مهم‌تر از هر سیگنال است.`,
    bodyEn: `Today: ${num(stats.signals)} signals, ${closed} closed trades (${winRate}% win rate). Top symbol: ${topSym?.symbol ?? "—"} (${topSym?.side ?? "—"}). Tip: set your stop at least 0.15% away and risk at most 1-2% per trade — account survival beats any signal.`,
  };
  try {
    const aiOut = await aiAskJson<{ titleFa?: string; titleEn?: string; bodyFa?: string; bodyEn?: string } | null>(
      "education",
      "You are the WOLF AI education engine of a trading platform. Write ONE short, practical trading lesson a beginner can apply today. Never financial advice. Return ONLY strict JSON: {\"titleFa\":\"...\",\"titleEn\":\"...\",\"bodyFa\":\"...\",\"bodyEn\":\"...\"}. titleFa/bodyFa in Persian (3-6 lines), titleEn/bodyEn in English (3-6 lines).",
      `Today's engine activity: signals=${num(stats.signals)}, closed trades=${closed} (win rate ${winRate}%), predictions=${num(stats.preds)}. Top symbol ${topSym?.symbol ?? "—"} ${topSym?.side ?? ""}. Write the bilingual lesson (risk, sizing, stop-loss, R:R, trend, or psychology).`,
      null
    );
    if (aiOut?.titleFa && aiOut?.bodyFa) {
      lesson = {
        titleFa: String(aiOut.titleFa).slice(0, 120),
        titleEn: String(aiOut.titleEn ?? aiOut.titleFa).slice(0, 120),
        bodyFa: String(aiOut.bodyFa).slice(0, 2000),
        bodyEn: String(aiOut.bodyEn ?? aiOut.bodyFa).slice(0, 2000),
      };
    }
  } catch {
    /* fallback lesson stays */
  }
  const autoApprove = (s as any)["learning.autoApprove"] === true || (s as any)["learning.autoApprove"] === "true";
  const r = await pool.query(
    `INSERT INTO education (title_fa, title_en, body_fa, body_en, source, status, day, created_by, note)
     VALUES ($1,$2,$3,$4,'ai',$5,$6,$7,$8) RETURNING *`,
    [lesson.titleFa, lesson.titleEn, lesson.bodyFa, lesson.bodyEn, autoApprove ? "approved" : "pending", day, admin.username, "generated automatically"]
  );
  await audit("education_generate_day", admin.username, admin.id, "education", { day });
  return c.json({ ok: true, created: 1, education: r.rows[0] });
});

// ── ADMIN: chart image + send to Telegram channel ───────────────────────────
app.post("/api/admin/telegram/chart", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const symbol = clean(body.symbol, 20).toUpperCase();
  const tf = clean(body.timeframe ?? "15m", 8);
  const lang = body.lang === "en" ? "en" : "fa";
  const s = await getSettings();
  const chatId = String(s["telegram.channelId"] ?? "").trim();
  if (!chatId) return c.json({ error: "آیدی کانال تلگرام تنظیم نشده است (اتصالات)." }, 400);
  const candles = await many("SELECT t, o, h, l, c FROM candles WHERE symbol = $1 AND timeframe = $2 ORDER BY t ASC LIMIT 60", [symbol, tf]);
  if (candles.length < 5) return c.json({ error: `کندلی برای ${symbol} ${tf} ذخیره نشده است — ابتدا موتور را اجرا کنید.` }, 400);
  const entry = Number(body.entry);
  const stopLoss = Number(body.stopLoss);
  const takeProfit = Number(body.takeProfit);
  const png = renderCandleChartPng({
    symbol,
    timeframe: tf,
    candles: candles.map((c) => ({ o: num(c.o), h: num(c.h), l: num(c.l), c: num(c.c), t: num(c.t) })),
    entry: Number.isFinite(entry) ? entry : undefined,
    stopLoss: Number.isFinite(stopLoss) ? stopLoss : undefined,
    takeProfit: Number.isFinite(takeProfit) ? takeProfit : undefined,
    watermark: "WOLF AI",
    lang,
  });
  const caption = clean(body.caption, 1000) || (lang === "fa" ? `🐺 چارت ${symbol} · تایم‌فریم ${tf} — #${symbol} #wolf_ai #chart` : `🐺 ${symbol} chart · ${tf} timeframe — #${symbol} #wolf_ai #chart`);
  const messageId = await sendPhoto(chatId, Buffer.from(png).toString("base64"), caption);
  if (!messageId) return c.json({ error: "ارسال به کانال ناموفق بود — توکن ربات/آیدی کانال را بررسی کنید." }, 400);
  await audit("telegram_chart", admin.username, admin.id, "telegram", { symbol, tf });
  return c.json({ ok: true, messageId });
});

// Send ONE open position to the Telegram channel as a chart + text card.
app.post("/api/admin/positions/:id/telegram", requireAdmin, async (c) => {
  const admin = userOf(c);
  const id = c.req.param("id");
  const p = await one<Row>("SELECT * FROM open_positions WHERE id = $1", [id]);
  if (!p) return c.json({ error: "پوزیشن یافت نشد." }, 404);
  const s = await getSettings();
  const chatId = String(s["telegram.channelId"] ?? "").trim();
  if (!chatId) return c.json({ error: "آیدی کانال تلگرام تنظیم نشده است." }, 400);
  const candles = await many("SELECT t, o, h, l, c FROM candles WHERE symbol = $1 AND timeframe = '15m' ORDER BY t ASC LIMIT 60", [p.symbol]);
  let photoSent = false;
  if (candles.length >= 5) {
    const png = renderCandleChartPng({
      symbol: p.symbol,
      timeframe: "15m",
      candles: candles.map((c) => ({ o: num(c.o), h: num(c.h), l: num(c.l), c: num(c.c), t: num(c.t) })),
      entry: num(p.entry),
      stopLoss: num(p.stop_loss),
      takeProfit: num(p.take_profit),
      watermark: "WOLF AI",
    });
    const mid = await sendPhoto(chatId, Buffer.from(png).toString("base64"), `🐺 ${p.symbol} ${String(p.side).toUpperCase()} · #${p.symbol} #wolf_ai #trade`);
    photoSent = !!mid;
  }
  const text = `🐺 <b>${p.symbol}</b> — ${p.side === "short" ? "SHORT" : "LONG"}\n💰 ورود: <b>${num(p.entry)}</b>\n🛑 حد ضرر: ${num(p.stop_loss)}\n🎯 هدف: ${num(p.take_profit)}\n📈 سود/زیان: ${num(p.pnl) >= 0 ? "+" : ""}${num(p.pnl)} USDT\n⚙️ مود: ${p.mode ?? "demo"} · منبع: ${p.source ?? "engine"}`;
  const mid = await sendMessage(chatId, text);
  if (!mid && !photoSent) return c.json({ error: "ارسال به کانال ناموفق بود." }, 400);
  await audit("position_telegram", admin.username, admin.id, "telegram", { symbol: p.symbol });
  return c.json({ ok: true, photo: photoSent, messageId: mid ?? null });
});

// ── ADMIN: telegram ──────────────────────────────────────────────────────────
// Send a direct message from the admin to a user's Telegram (by user id/username).
app.post("/api/admin/telegram/send", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const text = clean(body.text, 4000);
  if (!text) return c.json({ error: "message_required" }, 400);
  const s = (await getSettings()) as unknown as Record<string, any>;
  // Test mode "bot": send to the owner admin id configured in settings.
  if (body.test === "bot") {
    const botToken = String(s["telegram.token"] ?? "").trim();
    if (!botToken) return c.json({ ok: false, error: "توکن ربات تلگرام تنظیم نشده است." });

    let botInfo: { username?: string } | null = null;
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`).then((r) => r.json() as Promise<any>);
      if (res?.ok && res.result) botInfo = { username: res.result.username };
    } catch { /* ignore */ }

    const rawAdminId = String(body.chatId || s["telegram.adminId"] || "").trim();
    const adminIdNum = Number(rawAdminId);
    const hasAdminId = Boolean(rawAdminId && rawAdminId !== "0" && !isNaN(adminIdNum) && adminIdNum !== 0);

    let adminSent: { ok: boolean; reason?: string; adminIdPresent: boolean } = {
      ok: false,
      reason: hasAdminId ? "user_must_start_bot" : "no_admin_id",
      adminIdPresent: hasAdminId,
    };

    if (hasAdminId) {
      const mid = await sendMessage(rawAdminId, text || "تست اتصال ربات Trading Wolf AI 🐺", { parseMode: "HTML" });
      if (mid) {
        adminSent = { ok: true, reason: "sent", adminIdPresent: true };
      }
    }

    await audit("telegram_admin_send", admin.username, admin.id, "telegram", { test: "bot", adminId: rawAdminId });
    return c.json({
      ok: botInfo != null,
      bot: botInfo,
      adminSent,
      adminId: rawAdminId,
    });
  }
  // Test mode "channels": post to both configured channel ids.
  if (body.test === "channels") {
    const channels = [String(s["channel.id"] ?? ""), String(s["channel.enId"] ?? "")].filter(Boolean);
    let sent = 0;
    for (const ch of channels) {
      try {
        const mid = await sendMessage(ch, text, { parseMode: "HTML" });
        if (mid) sent++;
      } catch {
        /* keep going */
      }
    }
    await audit("telegram_admin_send", admin.username, admin.id, "telegram", { test: "channels", sent });
    return c.json({ ok: sent > 0, sent });
  }
  const userId = clean(body.userId, 100);
  const target = userId
    ? await one<Row>("SELECT tg_id FROM users WHERE id = $1 OR username = $1 OR LOWER(username) = LOWER($1)", [userId])
    : null;
  const chatId = body.chatId ? String(body.chatId) : target?.tg_id ? String(target.tg_id) : "";
  if (!chatId) return c.json({ error: "user_has_no_telegram" }, 400);
  const mid = await sendMessage(chatId, text, { parseMode: "HTML" });
  if (!mid) return c.json({ error: "telegram_send_failed" }, 502);
  await audit("telegram_admin_send", admin.username, admin.id, "telegram", { chatId, userId });
  return c.json({ ok: true, messageId: mid });
});

app.post("/api/admin/telegram/set-webhook", requireAdmin, async (c) => {
  const admin = userOf(c);
  const body = await c.req.json().catch(() => ({}));
  const fresh = await getSettings();
  const publicUrl = clean(body.publicUrl, 300);
  const url = publicUrl || fresh["telegram.webhookUrl"] || `${config.appUrl}/telegram/webhook`;
  const base = url.replace(/\/+$/, "");
  // If the admin typed the FULL webhook URL (…/telegram/webhook) don't append twice.
  const normalized = /\/telegram\/webhook$/.test(base) ? base : `${base}/telegram/webhook`;
  await setSetting("telegram.webhookUrl", normalized, "telegram", admin.username);
  // Accept the bot token straight from the form when it hasn't been persisted
  // yet, so «اتصال وبهوک» works right after typing without a separate Save.
  // Masked (•••) placeholders are never accepted or persisted.
  let token = String(fresh["telegram.token"] ?? "").trim();
  const bodyToken = String(body.botToken ?? body.token ?? "").trim();
  if (bodyToken && !/[•…*]{3,}/.test(bodyToken) && bodyToken != token) {
    // A freshly typed token (or a replacement for a stale one) is persisted
    // immediately and the resolve cache is dropped so the very next Telegram
    // call uses it — "Set webhook" must work right after typing.
    token = bodyToken;
    await setSetting("telegram.token", token, "telegram", admin.username);
    invalidateTelegramTokenCache();
  }
  if (!token) {
    return c.json({ ok: false, url: normalized, error: "توکن ربات تنظیم نشده است — ابتدا توکن را در «اتصالات و کلیدها» وارد و ذخیره کنید." }, 400);
  }
  // Auto-generate a secret once so webhook works even when the admin has none
  // configured. Telegram just needs a stable value it echoes back; we verify it
  // on the incoming webhook route.
  const existingSecret = String(fresh["telegram.webhookSecret"] ?? "").trim();
  const envSecret = String(config.telegram.webhookSecret ?? "").trim();
  let secret = existingSecret || envSecret;
  if (!secret || secret === "wolf-secret-change-me") {
    secret = `wh_${randomToken(16)}`;
    await setSetting("telegram.webhookSecret", secret, "telegram", admin.username);
  }
  const r = await setWebhook(normalized, secret);
  if (!r.ok) {
    const msg = r.description || r.error || "اتصال به تلگرام ناموفق بود";
    // Preserve Telegram's reason and the effective URL, never the bot token.
    return c.json({ ok: false, url: normalized, error: msg, telegram: { reachable: Boolean(r.description), reason: msg } }, 502);
  }
  await audit("telegram_webhook_set", admin.username, admin.id, "telegram", { url: normalized });
  return c.json({ ok: true, url: normalized, webhookSecret: secret });
});

app.get("/api/admin/telegram/webhook-info", requireAdmin, async (c) => c.json(await getWebhookInfoApi()));

// ── Telegram webhook (public, guarded by secret token) ───────────────────────
const handleTelegramWebhook = async (c: any) => {
  const s = await getSettings();
  const secret = s["telegram.webhookSecret"] || config.telegram.webhookSecret;
  const header = c.req.header("x-telegram-bot-api-secret-token") ?? "";
  if (secret && header !== secret) {
    return c.json({ error: "forbidden" }, 403);
  }
  const update = await c.req.json().catch(() => null);
  if (update) {
    await pool.query(
      `INSERT INTO telegram_messages (chat_id, direction, type, text, status)
       VALUES ($1, 'in', 'update', $2, 'received')`,
      [String(update.message?.chat?.id ?? update.callback_query?.message?.chat?.id ?? ""), JSON.stringify(update).slice(0, 4000)]
    );
    await handleTelegramUpdate(update).catch((e) =>
      logEngine("ERROR", `telegram webhook: ${e.message}`, null, "bot")
    );
  }
  return c.json({ ok: true });
};
app.post("/telegram/webhook", handleTelegramWebhook);
app.post("/api/telegram/webhook", handleTelegramWebhook);

// ── 404 ──────────────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: "مسیر یافت نشد." }, 404));

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap: HTTP + WebSocket + engine loop coordination
// ─────────────────────────────────────────────────────────────────────────────
export function startServer(): void {
  // Ensure default admin user is always admin and enabled
  pool.query(`
    UPDATE users SET is_admin = true, is_assistant = false, role = 'admin', enabled = true, can_trade = true
     WHERE LOWER(username) IN ('wolfadmin', 'admin')
  `).catch(() => {});

  // ── WebSocket: realtime prices + open positions broadcast ──────────────────
  const server = serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }) as ServerType;
  const wss = new WebSocketServer({ server: server as unknown as http.Server, path: "/ws" });
  const clients = new Set<WebSocket>();
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });
  setInterval(async () => {
    if (clients.size === 0) return;
    try {
      const [positions, markets] = await Promise.all([
        many("SELECT symbol, side, entry, current, pnl, pnl_pct, score, open_time, type FROM open_positions ORDER BY open_time DESC"),
        many("SELECT symbol, last_price, change_24h FROM markets WHERE enabled = true LIMIT 60"),
      ]);
      const msg = JSON.stringify({ type: "snapshot", positions, markets, at: now() });
      for (const ws of clients) {
        if (ws.readyState === 1) ws.send(msg);
      }
    } catch {
      /* ignore */
    }
  }, 10_000);

  console.log(`[api] ${config.appName} listening on :${config.port} (${config.env})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-start: when this module is the process entrypoint (PM2 runs
// `node server/dist/api.js`), bind the HTTP + WebSocket server on boot.
// Guarded so importing api.ts from tests/tools does not open a port.
// ─────────────────────────────────────────────────────────────────────────────
const _isEntry = config.role === "api" || (typeof process.argv[1] === "string" && process.argv[1].includes("api.js"));
if (_isEntry) {
  startServer();
}
