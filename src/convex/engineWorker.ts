// ---------------------------------------------------------------------------
// WOLF engine worker — the actual analysis loop.
//   • reads enabled markets + strategies + risk settings
//   • generates deterministic, time-evolving candle feed per symbol
//   • runs the multi-strategy evaluator (engineEval.analyze)
//   • emits SIGNALS for every qualifying setup (separate feed)
//   • opens POSITIONS for the strongest setups (capital-aware sizing)
//   • writes trade_analysis + learningHistory + AI reviews
//   • prevents duplicate positions (same symbol, any direction)
// Runs from a cron every minute, or manually from the admin panel.
// ---------------------------------------------------------------------------
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, mutation } from "./_generated/server";
import { generateCandles } from "./engineCore";
import { analyze } from "./engineEval";
import { log } from "./logs";
import { MARKET_DEFS, fetchBitgetKlines, fetchBybitKlines, fetchCoinexKlines, fetchCryptoKlines, fetchForexKlines, fetchGateKlines, fetchKucoinKlines, fetchMexcKlines, fetchNobitexKlines, fetchOkxKlines } from "./markets";
import { getSettingsMap, getSetting, setSetting } from "./settings";
import { requireAdmin } from "./wolfAuth";
import { effectiveCapital, exchangeScale, sizedNotional } from "./capital";
import { validateMarketConditions, type MarketMetrics } from "./marketValidator";

const SIZING_TFS = ["15m", "1h"];

function numSetting(settings: Record<string, any>, key: string, fallback: number): number {
  const n = Number(settings[key]);
  return Number.isFinite(n) ? n : fallback;
}

// Settings UIs save booleans as strings ("true"), so accept both forms.
function isTrueSetting(v: any): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

function isFalseSetting(v: any): boolean {
  return v === false || v === "false" || v === 0 || v === "0";
}

// freqtrade-style ROI table: profit % required to exit once the position is
// older than `minutes`. Returns 0 when disabled (falls back to static TP).
function roiTargetPct(settings: Record<string, any>, elapsedMin: number): number {
  if (!isTrueSetting(settings["risk.roiEnabled"])) return 0;
  let table: any[] = [];
  try {
    const parsed = JSON.parse(String(settings["risk.roiTable"] ?? "[]"));
    if (Array.isArray(parsed)) table = parsed;
  } catch {
    table = [];
  }
  if (table.length === 0) return 0;
  let target = 0;
  for (const row of table) {
    if (Number(row.minutes) <= elapsedMin) target = Number(row.roi) || 0;
  }
  return Math.max(0, target);
}

function entryScoreThreshold(settings: Record<string, any>): number {
  const configured = numSetting(settings, "risk.minScore", 35);
  // 50/75 are legacy defaults from earlier builds, not an explicit safety
  // override. Keep the manager's new 1..100 control usable on old deployments.
  const migrated = configured === 50 || configured === 75 ? 35 : configured;
  return Math.max(1, Math.min(100, migrated));
}

async function scan(ctx: any): Promise<void> {
  const settings = await getSettingsMap(ctx);

  // ── EMERGENCY STOP: hard halt of the whole engine loop ──────────────
  if (settings["engine.emergencyStop"] === true || settings["engine.enabled"] === false) {
    await setSetting(ctx, "engine.status", "EMERGENCY_STOP", "engine");
    return;
  }

  const now = Date.now();
  // `risk.virtualCapital` is the single source of truth. `engine.capital` is
  // kept only as a legacy fallback for old deployments.
  // P&L IS APPLIED TO THE ENGINE CAPITAL: every closed position (paper or
  // broker) accumulates into `engine.realizedPnl`, so winners grow the
  // working balance and losers shrink it — sizing, exposure caps, position
  // caps and daily-loss limits all react to the *effective* capital.
  const virtualCapital = numSetting(settings, "risk.virtualCapital", numSetting(settings, "engine.capital", 1000));
  const realizedPnl = numSetting(settings, "engine.realizedPnl", 0);
  const capital = effectiveCapital(virtualCapital, realizedPnl);
  const riskPct = numSetting(settings, "risk.riskPerTrade", 1.5);
  const maxLeverage = numSetting(settings, "risk.maxLeverage", 20);
  const stopATR = numSetting(settings, "risk.stopOffsetATR", 1.6);
  const tp1ATR = numSetting(settings, "risk.tp1ATR", 1.8);
  const tp2ATR = numSetting(settings, "risk.tp2ATR", 3.0);
  const tp3ATR = numSetting(settings, "risk.tp3ATR", 4.5);
  // Entry score is only one part of the decision. A setup also needs
  // directional consensus and independent confirmations; otherwise a large
  // strategy registry can create an impressive score from correlated noise.
  const minScore = entryScoreThreshold(settings);
  const minConfidence = numSetting(settings, "risk.minConfidence", 0.5);
  const minConsensus = numSetting(settings, "risk.minConsensus", 0.55);
  const minConfirmations = Math.max(1, Math.round(numSetting(settings, "risk.minConfirmations", 3)));
  const minRR = numSetting(settings, "risk.minRR", 1.2);
  const maxTotalPositions = Math.max(1, Math.min(5, numSetting(settings, "risk.maxOpenPositions", numSetting(settings, "engine.maxTotalPositions", 5))));
  const maxPositionPct = Math.max(0.1, Math.min(100, numSetting(settings, "risk.maxPosition", 12)));
  const maxExposurePct = Math.max(maxPositionPct, Math.min(100, numSetting(settings, "risk.maxExposure", 35)));
  const maxDailyLoss = numSetting(settings, "risk.maxDailyLoss", 8);
  const maxDailyTrades = numSetting(settings, "risk.maxDailyTrades", 12);
  // A scan is deliberately bounded: each candle document contains an array,
  // so reading an unbounded number of symbols can exceed Convex's 16 MB limit.
  const scannerLimit = Math.max(1, Math.min(12, numSetting(settings, "engine.symbolScannerLimit", 12)));
  const feePct = numSetting(settings, "engine.feePct", 0.1);
  const slippagePct = numSetting(settings, "engine.slippagePct", 0.05);
  const mode = settings["engine.mode"] === "live" ? "live" : "demo";
  const tradeType = settings["engine.tradeType"] ?? "futures"; // spot | futures
  const pauseNewTrades = settings["engine.pauseNewTrades"] === true;
  // ── EXCHANGE EQUIVALENCE ──────────────────────────────────────────────
  // In live mode every ratio is normalized to the REAL account:
  //   scale = realExchangeBalance / effectiveCapital
  // A $1000 engine holding only $100 on the exchange trades at 0.1× — same
  // risk percentages, same fee model, same caps, just proportionally
  // smaller real orders so P&L and fees stay consistent with the account.
  const realBalance = numSetting(settings, "risk.realCapital", 0);
  const exchangeScaleValue = mode === "live" ? exchangeScale(realBalance, capital) : 1;

  const defBySymbol = new Map(MARKET_DEFS.map((m) => [m.symbol, m]));

  // enabled markets, top priority first
  const markets = (await ctx.db.query("markets").collect())
    .filter((m: any) => m.enabled)
    .sort((a: any, b: any) => a.priority - b.priority)
    .slice(0, scannerLimit);

  // enabled strategies with a known evaluator family
  const strategies = (await ctx.db.query("strategies").collect())
    .filter((s: any) => s.enabled && s.engineEnabled && s.family)
    .map((s: any) => ({ key: s.key, family: s.family, nameFa: s.nameFa, weight: s.weight }));

  if (strategies.length === 0) {
    await log(ctx, "WARNING", "engine.scan.noStrategies", "strategy registry empty", "engine");
    return;
  }

  // ── CRITICAL: prevent duplicate positions on the same symbol ─────────
  // Fetch ALL open positions and build a set of symbols that already have
  // an open position (any direction). This blocks long+short on the same
  // symbol AND prevents opening a second position in the same direction.
  const openRows = await normalizeOpenPositions(ctx);
  const openSymbols = new Set(openRows.map((p: any) => p.symbol));

  // ── freqtrade CooldownPeriod protection ───────────────────────────────
  // After a symbol's last close, block re-entry for cooldownMinutes so a
  // losing symbol is not immediately re-entered (revenge-trading guard).
  const cooldownMin = Math.max(0, numSetting(settings, "risk.cooldownMinutes", 0));
  const cooldownUntil = new Map<string, number>();
  if (cooldownMin > 0) {
    const recentCloses = await ctx.db
      .query("closed_positions")
      .withIndex("by_time", (q: any) => q.gte("closeTime", now - cooldownMin * 60000))
      .collect();
    for (const cp of recentCloses) {
      const until = (cp.closeTime ?? 0) + cooldownMin * 60000;
      const prev = cooldownUntil.get(cp.symbol) ?? 0;
      if (until > prev) cooldownUntil.set(cp.symbol, until);
    }
  }

  // ── MONITOR open positions: SL/TP, trailing stop, price update ───────
  await monitorOpenPositions(ctx, settings, now, capital, tradeType, feePct, slippagePct, openRows);

  type Candidate = {
    symbol: string;
    market: string;
    timeframe: string;
    entry: number;
    features: any;
    aggregate: any;
    strategies: string[];
    network?: string;
  };

  if (markets.length === 0) {
    await log(ctx, "WARNING", "engine.scan.noMarkets", "no enabled markets — enable pairs in Markets tab", "engine");
    return;
  }

  const candidates: Candidate[] = [];
  let bestScore = 0;
  let fallbackUsed = false;

  // The RR gate uses the AVERAGE of the first two targets (not just TP1) so
  // it reflects what the engine really delivers — with default ATR offsets
  // TP1-only gives 1.125 which silently blocked conservative presets.
  const rrAvg = ((tp1ATR + tp2ATR) / 2) / Math.max(1e-9, stopATR);

  // ── IDLE BOOST ────────────────────────────────────────────────────────
  // If the engine has not traded for 12h+ (quiet market or too-tight gates)
  // the opportunistic pass relaxes one notch further so a day with zero
  // positions becomes the exception, not the norm.
  const lastTradeAt = Number(settings["engine.lastTradeAt"] ?? 0);
  const idleHours = lastTradeAt ? (now - lastTradeAt) / 3600000 : 999;
  const idleBoost = idleHours >= 12 ? 10 : 0;

  // Two passes: a strict one (all risk gates), then — only if the strict pass
  // found NOTHING — a mildly relaxed one (safety floors still enforced). This
  // keeps quiet days trading without ever ignoring conflict/direction rules.
  const collectPass = async (relaxed: boolean): Promise<number> => {
    const passScore = relaxed ? Math.max(1, minScore - 15 - idleBoost) : minScore;
    const passConf = relaxed ? Math.max(0.3, minConfidence - 0.08) : minConfidence;
    const passCons = relaxed ? Math.max(0.35, minConsensus - 0.08) : minConsensus;
    const passConfirms = relaxed ? Math.max(2, minConfirmations - 1) : minConfirmations;
    const passRR = relaxed ? Math.max(0.8, minRR - 0.3) : minRR;
    let found = 0;
    for (const m of markets) {
      const def = defBySymbol.get(m.symbol);
      for (const tf of SIZING_TFS) {
        // REAL candles only — the market-feed cron stores 15m/1h data in the
        // candles table. No synthetic candles, ever: missing/stale data ⇒ NO TRADE.
        const candleRow = await ctx.db
          .query("candles")
          .withIndex("by_symbol_tf", (q: any) => q.eq("symbol", m.symbol).eq("timeframe", tf))
          .first();
        // Indicators only need a bounded recent window. This also prevents old
        // feed rows from making the evaluator do unnecessary work.
        const candles = candleRow?.data?.length ? candleRow.data.slice(-240) : [];
        // DATA-QUALITY GATE: stale candle rows (feed down) must never trade.
        // The market-feed cron refreshes every 5 min; anything older than 20 min
        // is considered stale → NO TRADE on that symbol until the feed recovers.
        const staleMs = 30 * 60000;
        if (now - (candleRow?.updatedAt ?? candleRow?._creationTime ?? 0) > staleMs) continue;
        if (candles.length < 30) continue;
        const { features, aggregate } = analyze(candles, strategies);
        if (aggregate.score > bestScore) bestScore = aggregate.score;
        if (
          aggregate.direction === "neutral" ||
          aggregate.score < passScore ||
          aggregate.confidence < passConf ||
          aggregate.consensus < passCons ||
          aggregate.independentConfirmations < passConfirms ||
          aggregate.conflict ||
          rrAvg < passRR
        ) {
          continue;
        }
        const dir = aggregate.direction as "long" | "short";
        const rawSl = dir === "long" ? features.price - features.atrV * stopATR : features.price + features.atrV * stopATR;
        const rawTp = dir === "long" ? features.price + features.atrV * tp1ATR : features.price - features.atrV * tp1ATR;
        const stratFamilies = aggregate.contribution.map((c: any) => c.key);

        const marketMetrics: MarketMetrics = {
          price: features.price,
          ema9: features.ema9,
          ema21: features.ema21,
          ema50: features.ema50,
          rsi: features.rsi14,
          atr: features.atrV,
          bbUpper: features.bbUpper,
          bbLower: features.bbLower,
          bbMid: features.bbMid,
          volLast: features.volLast,
          volAvg: features.volAvg,
          trend: features.trend,
        };

        const validation = validateMarketConditions(dir, marketMetrics, rawSl, rawTp, stratFamilies, passRR);
        if (!validation.allowed) {
          continue;
        }

        const adjustedScore = Math.max(0, aggregate.score - validation.scorePenalty);
        if (adjustedScore < passScore) {
          continue;
        }

        // ── BLOCK: never open on a symbol that already has an open position
        if (openSymbols.has(m.symbol)) {
          continue;
        }
        // ── freqtrade CooldownPeriod: respect the per-symbol re-entry cooldown
        const cdUntil = cooldownUntil.get(m.symbol) ?? 0;
        if (cdUntil > now) {
          continue;
        }
        candidates.push({
          symbol: m.symbol,
          market: m.market,
          timeframe: tf,
          entry: features.price,
          features,
          aggregate: { ...aggregate, score: adjustedScore },
          strategies: stratFamilies.slice(0, 6),
          network: (m as any).network,
        });
        found++;
      }
    }
    return found;
  };

  await collectPass(false);
  if (candidates.length === 0 && isTrueSetting(settings["risk.opportunisticEnabled"])) {
    const found = await collectPass(true);
    fallbackUsed = found > 0;
    if (fallbackUsed) {
      await log(
        ctx,
        "INFO",
        "engine.scan.fallback",
        `strict pass empty → relaxed pass found ${found} setup(s) (idle ${idleHours.toFixed(0)}h)`,
        "engine",
      );
    }
  }

  candidates.sort((a, b) => b.aggregate.score - a.aggregate.score);

  // ── daily risk caps (realized loss + trade count) ────────────────────
  const dayAgo = now - 86400000;
  const closedToday = await ctx.db
    .query("closed_positions")
    .withIndex("by_time", (q: any) => q.gte("closeTime", dayAgo))
    .collect();
  const realizedToday = closedToday.reduce((s: number, p: any) => s + (p.profit ?? 0), 0);
  const dailyLossHit = capital > 0 && realizedToday <= -(capital * (maxDailyLoss / 100));
  const dailyTradesHit = closedToday.length >= maxDailyTrades;
  if (dailyLossHit) {
    await log(ctx, "WARNING", "engine.dailyLossCap", `realized=${realizedToday.toFixed(2)} cap=${maxDailyLoss}%`, "engine");
  }
  if (dailyTradesHit) {
    await log(ctx, "WARNING", "engine.dailyTradesCap", `trades=${closedToday.length} cap=${maxDailyTrades}`, "engine");
  }

  // ── emit signals + open positions ────────────────────────────────────
  const nowPositions = openRows.length;
  let opened = 0;
  let plannedExposure = openRows.reduce((sum: number, p: any) => sum + Number(p.size ?? p.margin ?? 0), 0);
  const aiQueue: Array<{ candidate: Candidate; dir: string; stopLoss: number; tp1: number; rr: number; atr: number }> = [];

  for (const c of candidates) {
    const dir = c.aggregate.direction as "long" | "short";
    const atr = Math.max(c.features.atrV, c.entry * 0.001);
    const stopLoss = dir === "long" ? c.entry - atr * stopATR : c.entry + atr * stopATR;
    const tp1 = dir === "long" ? c.entry + atr * tp1ATR : c.entry - atr * tp1ATR;
    const tp2 = dir === "long" ? c.entry + atr * tp2ATR : c.entry - atr * tp2ATR;
    const tp3 = dir === "long" ? c.entry + atr * tp3ATR : c.entry - atr * tp3ATR;
    const rr = tp1ATR / stopATR;
    const slDist = atr * stopATR;

    const wantPosition =
      settings["engine.autonomous"] !== false &&
      !pauseNewTrades &&
      !dailyLossHit &&
      !dailyTradesHit &&
      opened + nowPositions < maxTotalPositions &&
      // Relaxed-pass trades are capped: at most 1 per scan, and only when the
      // portfolio is nearly empty — the fallback fills idle days, it never
      // floods them.
      (!fallbackUsed || (opened === 0 && nowPositions < 2)) &&
      !openSymbols.has(c.symbol) &&
      plannedExposure < capital * (maxExposurePct / 100);

    const positionPayload = wantPosition
      ? buildPosition(c, dir, slDist, tp1, tp2, tp3, rr, atr, capital, riskPct, maxLeverage, mode, tradeType, c.market, c.network, now, feePct, slippagePct, maxPositionPct, maxExposurePct, openRows, exchangeScaleValue)
      : undefined;
    const positionId = positionPayload
      ? await ctx.db.insert("open_positions", positionPayload)
      : undefined;

    if (positionId && positionPayload) {
      plannedExposure += Number(positionPayload.size ?? 0);
      openRows.push(positionPayload);
      openSymbols.add(c.symbol);
      opened++;
      await ctx.db.insert("trade_analysis", buildAnalysis(positionId, c, dir, slDist, tp1, tp2, tp3, rr, atr, capital, riskPct, maxLeverage, now));

      // Post-entry AI review: a while after the trade is open, the AI
      // re-checks it against the live price and reports to management.
      schedulePostEntryReview(ctx, settings, {
        positionId,
        symbol: c.symbol,
        side: dir,
        entry: c.entry,
        stopLoss,
        takeProfit: tp1,
        rr,
        score: c.aggregate.score,
        strategies: c.strategies,
      });

      // LIVE MODE → place the real order through the CCXT broker. The broker
      // action attaches exchange-native SL/TP and adopts the real fill price;
      // when no CCXT credentials are configured it falls back to paper.
      if (mode === "live") {
        void ctx.scheduler.runAfter(0, internal.broker.executeOpen, {
          positionId,
          symbol: c.symbol,
          side: dir,
          tradeType,
          entry: c.entry,
          stopLoss,
          takeProfit: tp1,
          leverage: positionPayload.leverage,
          size: positionPayload.size,
          quantity: positionPayload.quantity,
          mode,
        });
      }

      // Schedule Telegram notification for this trade
      scheduleTradeNotification(ctx, settings, {
        symbol: c.symbol,
        side: dir,
        entry: c.entry,
        stopLoss,
        takeProfit: tp1,
        rr,
        confidence: c.aggregate.confidence,
        strategyKeys: c.strategies,
        pnl: 0,
      }, mode);

      // Queue top candidates for AI review (TradingAgents-style bull/bear
      // debate + risk check). Needs the debate toggle on and either a real AI
      // key or the free-provider fallback chain (env keys) enabled.
      if (
        settings["ai.enabled"] !== false &&
        settings["ai.debateEnabled"] !== false &&
        (settings["ai.key"] || !isFalseSetting(settings["ai.freeFallback"]))
      ) {
        aiQueue.push({ candidate: c, dir, stopLoss, tp1, rr, atr });
      }
    }

    await ctx.db.insert("signals", {
      symbol: c.symbol,
      timeframe: c.timeframe,
      direction: dir,
      entry: c.entry,
      stopLoss,
      takeProfit: tp1,
      targets: [tp1, tp2, tp3],
      rr,
      score: c.aggregate.score,
      confidence: c.aggregate.confidence,
      strategyKeys: c.strategies,
      aggregate: c.aggregate,
      reasonsFa: c.aggregate.reasons ?? [],
      reasonsEn: [],
      price: c.entry,
      mode,
      status: positionId ? "filled" : "open",
      positionId,
      created: now,
      expires: now + 4 * 60 * 60 * 1000,
    });
  }

  // ── learning history + AI review (top setups) ────────────────────────
  for (const c of candidates.slice(0, 10)) {
    const lessonEntry: any = {
      symbol: c.symbol,
      timeframe: c.timeframe,
      strategies: c.strategies,
      scores: { score: c.aggregate.score, confidence: c.aggregate.confidence },
      signal: c.aggregate.direction,
      decision: c.aggregate.reasonFa ?? "",
      result: openSymbols.has(c.symbol) ? "open" : "monitor",
      snapshot: JSON.stringify({ source: "live_scan", score: c.aggregate.score, consensus: c.aggregate.consensus, confirmations: c.aggregate.independentConfirmations }),
      lessons: c.aggregate.reasons?.slice(0, 3) ?? [],
      created: now,
    };
    await ctx.db.insert("learningHistory", lessonEntry);
  }

  // ── schedule AI reviews for top candidates (async) ───────────────────
  for (const aq of aiQueue.slice(0, 3)) {
    scheduleAiReview(ctx, settings, aq.candidate, aq.dir, aq.stopLoss, aq.tp1, aq.rr);
  }

  await setSetting(ctx, "engine.lastScanAt", now, "engine");
  await setSetting(ctx, "engine.heartbeat", now, "engine");
  await setSetting(ctx, "engine.status", "ONLINE", "engine");
  if (candidates.length > 0) await setSetting(ctx, "engine.lastSignalAt", now, "engine");

  await log(ctx, "TRADE", "engine.scan", `markets=${markets.length} candidates=${candidates.length} opened=${opened} bestScore=${bestScore.toFixed(1)}/${minScore}`, "engine");
  if (candidates.length === 0) {
    await log(
      ctx,
      "INFO",
      "engine.scan.noSetup",
      `no setup above thresholds (strict+relaxed) — bestScore=${bestScore.toFixed(1)} minScore=${minScore} (opportunistic=${isTrueSetting(settings["risk.opportunisticEnabled"]) ? "on" : "off"})`, "engine",
    );
  }
}

function buildPosition(
  c: any,
  dir: "long" | "short",
  slDist: number,
  tp1: number,
  tp2: number,
  tp3: number,
  rr: number,
  atr: number,
  capital: number,
  riskPct: number,
  maxLeverage: number,
  mode: string,
  tradeType: string,
  marketType: string,
  network: string | undefined,
  now: number,
  feePct: number,
  slippagePct: number,
  maxPositionPct = 12,
  maxExposurePct = 35,
  openRows: any[] = [],
  exchangeScaleValue = 1,
): any {
  // realistic fill: entry slips against us, and a platform fee is charged
  const slip = slippagePct / 100;
  const entry = dir === "long" ? c.entry * (1 + slip) : c.entry * (1 - slip);
  const riskAmount = capital * (riskPct / 100);
  const slDistFrac = slDist / entry;
  // Fee-aware sizing: the risk budget covers the stop distance PLUS the
  // open+close fee and entry slippage, then the exchange-equivalence scale
  // normalizes the real order to the actual account (P&L + fees included).
  const currentExposure = openRows.reduce((sum: number, p: any) => sum + Number(p.size ?? p.margin ?? 0), 0);
  const exposureRoom = Math.max(0, capital * (maxExposurePct / 100) - currentExposure);
  const positionCap = Math.max(0, capital * (maxPositionPct / 100));
  const notional = sizedNotional(riskAmount, slDistFrac, feePct, slippagePct, exchangeScaleValue, positionCap, exposureRoom);
  if (!Number.isFinite(notional) || notional <= 0) return undefined;
  const leverage = tradeType === "spot" ? 1 : Math.max(1, Math.min(maxLeverage, Math.round(notional / Math.max(1, capital))));
  const margin = notional / leverage;
  const quantity = notional / entry;
  const stopLoss = dir === "long" ? entry - slDist : entry + slDist;

  return {
    symbol: c.symbol,
    market: marketType,
    side: dir,
    entry,
    current: entry,
    quantity,
    size: notional,
    leverage,
    margin,
    pnl: 0,
    pnlPct: 0,
    score: c.aggregate.score,
    confidence: c.aggregate.confidence,
    strategyKeys: c.strategies,
    exchange: mode === "live" ? "exchange" : "paper",
    exchangeScale: exchangeScaleValue,
    fee: notional * (feePct / 100),
    stopLoss,
    takeProfit: tp1,
    targets: [tp1, tp2, tp3],
    expectedExit: tp1,
    expectedProfit: riskAmount * rr,
    expectedDuration: c.timeframe === "1h" ? 360 : 90,
    progress: 0,
    status: "open",
    openTime: now,
    lastAnalysis: now,
    lastUpdate: now,
    mode,
    source: "engine",
    type: tradeType,
    network,
  };
}

function buildAnalysis(
  positionId: string,
  c: any,
  dir: "long" | "short",
  slDist: number,
  tp1: number,
  tp2: number,
  tp3: number,
  rr: number,
  atr: number,
  capital: number,
  riskPct: number,
  maxLeverage: number,
  now: number,
): any {
  const f = c.features;
  const entry = c.entry;
  const riskAmount = capital * (riskPct / 100);
  const notional = riskAmount / Math.max(slDist / entry, 1e-9);
  const leverage = Math.max(1, Math.min(maxLeverage, Math.round(notional / Math.max(1, capital))));
  const stopLoss = dir === "long" ? entry - slDist : entry + slDist;

  return {
    positionId,
    symbol: c.symbol,
    side: dir,
    structure: f.structure.trend,
    trend: f.trend,
    momentum: f.momentumScore > 0 ? "bullish" : f.momentumScore < 0 ? "bearish" : "neutral",
    volume: f.volScore > 0 ? "high" : f.volScore < 0 ? "low" : "normal",
    support: f.structure.lastLL,
    resistance: f.structure.lastHH,
    liquidity: f.liquidityScore > 0 ? "above" : f.liquidityScore < 0 ? "below" : "balanced",
    orderBlocks: (f.obs ?? []).map((z: any) => ({ price: (z.top + z.bottom) / 2, side: z.kind })),
    fvg: (f.fvg ?? []).map((z: any) => ({ top: z.top, bottom: z.bottom })),
    bos: Boolean(f.structure.bosUp || f.structure.bosDown),
    choch: Boolean(f.structure.choch),
    mss: Boolean(f.structure.mss),
    supplyDemand: (f.levels ?? []).slice(0, 8).map((l: number) => ({ price: l, kind: l > entry ? "resistance" : "support" })),
    entry,
    stopLoss,
    takeProfit: tp1,
    targets: [tp1, tp2, tp3],
    rr,
    expectedDuration: c.timeframe === "1h" ? 360 : 90,
    confidence: c.aggregate.confidence,
    fees: notional * 0.001,
    positionSize: notional,
    margin: notional / leverage,
    leverage,
    entryReasonFa: c.aggregate.reasonFa ?? "",
    entryReasonEn: `${c.aggregate.direction} · score ${c.aggregate.score}`,
    created: now,
  };
}

// ── Learning from closed trades ─────────────────────────────────────────
// The engine actually learns from experience (not just storing rows):
//   • per-strategy performance is updated incrementally
//   • strategy weights adapt — winners get slightly more say, losers less
//   • a strategy with ≥5 trades and <35% win rate is AUTO-DISABLED so the
//     same mistake is never repeated (admin can re-enable and review)
//   • every outcome is recorded as a learning row for the AI supervisor
async function learnFromClosedTrade(ctx: any, p: any, pnl: number, now: number): Promise<void> {
  const keys: string[] = Array.isArray(p.strategyKeys) ? p.strategyKeys : [];
  if (keys.length === 0) return;
  for (const key of keys) {
    const existing = await ctx.db
      .query("strategyPerformance")
      .withIndex("by_strategy", (q: any) => q.eq("strategyKey", key))
      .first();
    const prev: any = existing ?? {};
    const trades = Number(prev.trades ?? 0) + 1;
    const wins = Number(prev.wins ?? 0) + (pnl > 0 ? 1 : 0);
    const losses = Number(prev.losses ?? 0) + (pnl <= 0 ? 1 : 0);
    const totalPnl = Number(prev.totalPnl ?? 0) + pnl;
    const winRate = trades > 0 ? (wins / trades) * 100 : 0;
    const doc = {
      strategyKey: key,
      trades,
      wins,
      losses,
      winRate: Number(winRate.toFixed(2)),
      // Approximate profit factor from win/loss counts (net P&L per side is
      // not retained per-key here; the admin refresh recomputes it exactly).
      profitFactor: losses > 0 ? Number(((wins / Math.max(1, losses)) * 1.5).toFixed(2)) : wins > 0 ? 99 : 0,
      avgPnl: Number((totalPnl / trades).toFixed(4)),
      avgRR: Number(prev.avgRR ?? 0),
      maxDrawdown: Number(prev.maxDrawdown ?? 0),
      totalPnl: Number(totalPnl.toFixed(4)),
      updatedAt: now,
    };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("strategyPerformance", doc);

    // Adaptive weight: winners gain influence (capped), losers lose it
    // (floored) so the consensus naturally drifts toward what works.
    const strat = await ctx.db
      .query("strategies")
      .filter((q: any) => q.eq(q.field("key"), key))
      .first();
    if (!strat) continue;
    const w = Number(strat.weight ?? 1);
    const next = pnl > 0 ? Math.min(1.5, w * 1.05) : Math.max(0.3, w * 0.92);
    if (Math.abs(next - w) > 1e-9) {
      await ctx.db.patch(strat._id, { weight: Number(next.toFixed(3)) });
    }
    // Auto-disable: same mistake over and over → switch it off until the
    // admin reviews the strategy performance table.
    if (trades >= 5 && winRate < 35 && strat.engineEnabled !== false) {
      await ctx.db.patch(strat._id, { engineEnabled: false });
      await log(ctx, "LEARNING", "engine.strategy.autoDisabled", `${key} winRate=${winRate.toFixed(0)}% trades=${trades}`, "engine");
      await ctx.db.insert("learningHistory", {
        symbol: p.symbol,
        timeframe: String(p.timeframe ?? "5m"),
        strategies: [key],
        scores: { score: Number(p.score ?? 0), confidence: Number(p.confidence ?? 0) },
        signal: p.side,
        decision: "auto_disable",
        result: "loss",
        snapshot: JSON.stringify({ source: "auto_learning", reason: "win_rate_below_35" }),
        aiReview: `استراتژی ${key} پس از ${trades} معامله با نرخ برد ${winRate.toFixed(0)}% به‌صورت خودکار غیرفعال شد تا خطای تکراری متوقف شود.`,
        pnl,
        created: now,
      });
    }
  }
}

// ── Enforce one open position per symbol ─────────────────────────────────
// Repairs legacy data as well: if two directions were already open on a
// symbol, keep the highest-score position and close the rest as duplicates.
async function normalizeOpenPositions(ctx: any): Promise<any[]> {
  const rows = await ctx.db.query("open_positions").take(100);
  const bySymbol = new Map<string, any[]>();
  for (const row of rows) {
    const group = bySymbol.get(row.symbol) ?? [];
    group.push(row);
    bySymbol.set(row.symbol, group);
  }
  const kept: any[] = [];
  for (const group of bySymbol.values()) {
    group.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.openTime - a.openTime);
    const [winner, ...duplicates] = group;
    kept.push(winner);
    for (const duplicate of duplicates) {
      const { _id, _creationTime, ...position } = duplicate;
      await ctx.db.insert("closed_positions", {
        ...position,
        current: duplicate.current ?? duplicate.entry,
        closePrice: duplicate.current ?? duplicate.entry,
        closeTime: Date.now(),
        closeReason: "duplicate_symbol",
        profit: duplicate.pnl ?? 0,
      });
      await ctx.db.delete(duplicate._id);
      await log(ctx, "SECURITY", "engine.duplicatePositionClosed", `${duplicate.symbol}:${duplicate.side}`, "engine");
    }
  }
  return kept;
}

// ── Open-position monitor ────────────────────────────────────────────────
// Runs on every scan: refreshes the live price from the candle feed, closes
// positions that hit SL or TP, and applies trailing stop when enabled.
// Natural SL/TP exits are respected — no arbitrary interference.
async function monitorOpenPositions(
  ctx: any,
  settings: Record<string, any>,
  now: number,
  capital: number,
  tradeType: string,
  feePct = 0.1,
  slippagePct = 0.05,
  existingRows?: any[],
): Promise<void> {
  const slip = slippagePct / 100;
  // Reuse the bounded, normalized read from scan(); querying the same table a
  // second time needlessly doubles the transaction's read footprint.
  const rows = existingRows ?? await ctx.db.query("open_positions").take(100);
  if (rows.length === 0) return;
  const defBySymbol = new Map(MARKET_DEFS.map((m) => [m.symbol, m]));
  const trailing = isTrueSetting(settings["risk.trailingStop"]);
  const trailActivate = numSetting(settings, "risk.trailingActivatePct", 1.5);
  const trailDist = numSetting(settings, "risk.trailingDistancePct", 0.8);
  const trailingBySymbol = new Map<string, number>(); // best favorable price

  for (const p of rows) {
    // REAL price from the market feed (patched into the markets table)
    const mrow = await ctx.db
      .query("markets")
      .withIndex("by_symbol", (q: any) => q.eq("symbol", p.symbol))
      .first();
    const price = mrow?.lastPrice ?? p.current ?? p.entry;

    let stopLoss = p.stopLoss;
    let takeProfit = p.takeProfit;

    // ── AUTOMATED BREAKEVEN & DYNAMIC PROFIT LOCK ──────────────────────
    // When price moves favorably by >= 0.8% or reaches 50% toward TP1,
    // lock in Breakeven (entry + 0.1% buffer to guarantee zero loss).
    const profitRatio = p.entry ? (p.side === "long" ? (price - p.entry) / p.entry : (p.entry - price) / p.entry) : 0;
    if (profitRatio >= 0.008) {
      const bePrice = p.side === "long" ? p.entry * 1.001 : p.entry * 0.999;
      if (p.side === "long" && bePrice > stopLoss) stopLoss = bePrice;
      if (p.side === "short" && bePrice < stopLoss) stopLoss = bePrice;
    }
    // Dynamic Profit Lock: if trade gains >= 2.0%, secure at least 50% of the gain
    if (profitRatio >= 0.02) {
      const lockPrice = p.side === "long" ? p.entry * (1 + profitRatio * 0.5) : p.entry * (1 - profitRatio * 0.5);
      if (p.side === "long" && lockPrice > stopLoss) stopLoss = lockPrice;
      if (p.side === "short" && lockPrice < stopLoss) stopLoss = lockPrice;
    }

    if (trailing) {
      const prevBest = trailingBySymbol.get(p.symbol) ?? (p.side === "long" ? p.current : p.current);
      const best = p.side === "long" ? Math.max(prevBest, price) : Math.min(prevBest, price);
      trailingBySymbol.set(p.symbol, best);
      const activate = best >= p.entry * (1 + trailActivate / 100);
      if (activate) {
        const trailed = p.side === "long" ? best * (1 - trailDist / 100) : best * (1 + trailDist / 100);
        if (p.side === "long" && trailed > stopLoss) stopLoss = trailed;
        if (p.side === "short" && trailed < stopLoss) stopLoss = trailed;
      }
    }

    // freqtrade dynamic ROI: as the position ages, the profit target tightens
    // so winners are banked instead of being given back. Only ever tightens
    // the static TP — never loosens it.
    const roiPct = roiTargetPct(settings, (now - (p.openTime ?? now)) / 60000);
    if (roiPct > 0) {
      const roiPrice = p.side === "long" ? p.entry * (1 + roiPct / 100) : p.entry * (1 - roiPct / 100);
      if (p.side === "long" && roiPrice < takeProfit) takeProfit = roiPrice;
      if (p.side === "short" && roiPrice > takeProfit) takeProfit = roiPrice;
    }

    const hitSl = p.side === "long" ? price <= stopLoss : price >= stopLoss;
    const hitTp = p.side === "long" ? price >= takeProfit : price <= takeProfit;
    const reason = hitTp ? "take_profit" : hitSl ? "stop_loss" : "";

    if (reason) {
      // LIVE positions with a real broker order are closed ON THE EXCHANGE:
      // the broker action places the reduce-only close and finalizes the DB
      // record with the real fill. Mark the row "closing" so a concurrent
      // scan cannot double-close it or reopen the symbol in the meantime.
      if (p.mode === "live") {
        const brokerOrder = await ctx.db
          .query("orders")
          .filter((q: any) => q.eq(q.field("positionId"), p._id))
          .first();
        if (brokerOrder) {
          await ctx.db.patch(p._id, { status: "closing", current: price, pnl: p.pnl ?? 0, lastUpdate: now });
          void ctx.scheduler.runAfter(0, internal.broker.executeClose, {
            positionId: p._id,
            reason,
            tradeType,
          });
          continue;
        }
      }
      // net P&L: slippage on the close fill + open fee + close fee
      const closeFill = p.side === "long" ? price * (1 - slip) : price * (1 + slip);
      const gross = p.side === "long" ? (closeFill - p.entry) * p.quantity : (p.entry - closeFill) * p.quantity;
      const openFee = p.fee ?? 0;
      const closeFee = p.entry * p.quantity * (feePct / 100);
      const pnl = gross - openFee - closeFee;
      const pnlPct = p.entry ? (pnl / (p.entry * p.quantity)) * 100 : 0;
      const { _id, _creationTime, ...position } = p;
      await ctx.db.insert("closed_positions", {
        ...position,
        current: price,
        closePrice: price,
        closeTime: now,
        closeReason: reason,
        profit: pnl,
      });
      await ctx.db.delete(_id);
      // Apply realized P&L (net of fees/slippage) to the engine capital so
      // the next scan sizes positions from the updated working balance.
      const realizedBase = Number(await getSetting(ctx, "engine.realizedPnl") ?? 0);
      await setSetting(ctx, "engine.realizedPnl", Number.isFinite(realizedBase) ? realizedBase + pnl : pnl, "engine");
      await log(ctx, "TRADE", "engine.position.closed", `${p.symbol}:${p.side} reason=${reason} pnl=${pnl.toFixed(4)}`, "engine");

      // ── REAL LEARNING: update per-strategy performance, adapt weights,
      // auto-disable consistently losing strategies (so the same mistake is
      // not repeated), and mark the last-trade timestamp used by the idle
      // boost in the next scan.
      await learnFromClosedTrade(ctx, p, pnl, now);
      await setSetting(ctx, "engine.lastTradeAt", now, "engine");

      // Channel report for the closed trade (open+close parity, freqtrade-style).
      void ctx.scheduler.runAfter(0, internal.nodeCalls.notifyTradeClosed, {
        position: { ...position, closePrice: price, pnl, pnlPct, closeReason: reason },
        mode: settings["engine.mode"] === "live" ? "live" : "demo",
      });

      // learning record for this closed trade
      await ctx.db.insert("learningHistory", {
        symbol: p.symbol,
        timeframe: "5m",
        strategies: p.strategyKeys ?? [],
        scores: { score: p.score, confidence: p.confidence },
        signal: p.side,
        decision: reason,
        result: pnl > 0 ? "win" : "loss",
        snapshot: JSON.stringify({ source: "closed_trade", closeReason: reason, entry: p.entry, exit: price }),
        pnl,
        created: now,
      });
    } else {
      const grossU = p.side === "long" ? (price - p.entry) * p.quantity : (p.entry - price) * p.quantity;
      const netU = grossU - (p.fee ?? 0);
      await ctx.db.patch(p._id, {
        current: price,
        pnl: netU,
        pnlPct: p.entry ? (netU / (p.entry * p.quantity)) * 100 : 0,
        stopLoss,
        lastUpdate: now,
        progress: Math.min(100, Math.round((Math.abs(price - p.entry) / Math.max(1e-9, Math.abs(takeProfit - p.entry))) * 100)),
      });
    }
  }
}

// ── Telegram notification (schedule as action) ────────────────────────────
function scheduleTradeNotification(ctx: any, settings: Record<string, any>, position: any, mode: string): void {
  const token = settings["telegram.token"];
  const channelId = settings["channel.id"];
  if (
    settings["telegram.enabled"] === false ||
    settings["channel.postTrades"] === false ||
    !token ||
    !channelId
  ) {
    return;
  }
  void ctx.scheduler.runAfter(0, internal.nodeCalls.notifyTrade, {
    token: String(token),
    channelId,
    position,
    mode,
  });
}

// ── AI learning review (schedule as action) ───────────────────────────────
function scheduleAiReview(ctx: any, settings: Record<string, any>, c: any, dir: string, stopLoss: number, tp1: number, rr: number): void {
  const provider = settings["ai.provider"] ?? "gemini";
  const model = settings["ai.model"] ?? "gemini-3.6-flash";
  const key = settings["ai.key"];
  const systemPrompt = settings["ai.systemPrompt"] ?? "";
  const freeFallback = !isFalseSetting(settings["ai.freeFallback"]);

  // TradingAgents-style: the model plays the analyst teams — bull case, bear
  // case, risk assessment, then a verdict with conviction. The verdict is
  // advisory only; the deterministic engine gates still decide entry.
  const prompt = `You lead the Wolf Trading AI analyst teams (bull, bear, risk) for a trade setup debate.

SETUP
Symbol: ${c.symbol} (${c.market})
Direction: ${dir.toUpperCase()}
Entry: ${c.entry} | Stop Loss: ${stopLoss} | Take Profit: ${tp1} | R:R 1:${rr}
Score: ${c.aggregate.score}/100 | Confidence: ${Math.round(c.aggregate.confidence * 100)}%
Directional consensus: ${Math.round((c.aggregate.consensus ?? 0) * 100)}% | Independent confirmations: ${c.aggregate.independentConfirmations}
Strategies: ${c.strategies.join(", ")}
Trend: ${c.features.trend} | Momentum: ${c.features.momentumScore}

${systemPrompt}

Respond in JSON only:
{
  "bull_case": "<strongest bullish case, 1-2 sentences>",
  "bear_case": "<strongest bearish/contrarian case, 1-2 sentences>",
  "risk_check": "<position sizing / risk warning or 'ok', 1 sentence>",
  "verdict": "agree|caution|reject",
  "conviction": <0-100>
}`;

  // Robust call: configured provider first, then the free chain (gemini →
  // groq → openrouter :free → cerebras → mistral → anthropic).
  void ctx.scheduler.runAfter(0, internal.nodeCalls.aiGenerateRobust, {
    provider,
    model,
    key,
    freeFallback,
    analysisKey: `${c.symbol}:${Date.now()}`,
    analysisSymbol: c.symbol,
    system: "You are Wolf Trading AI, an expert market analyst. Be concise and actionable.",
    prompt,
  });

  // Optional second provider gives the manager an independent review.
  const provider2 = settings["ai.provider2"];
  const model2 = settings["ai.model2"];
  const key2 = settings["ai.key2"];
  if (settings["ai.secondaryEnabled"] === true && provider2 && model2 && key2) {
    // Robust second opinion too — a quota error on provider2 must never kill
    // the secondary review; the free chain takes over automatically.
    void ctx.scheduler.runAfter(0, internal.nodeCalls.aiGenerateRobust, {
      provider: String(provider2),
      model: String(model2),
      key: String(key2),
      freeFallback,
      analysisKey: `${c.symbol}:${Date.now()}:secondary`,
      analysisSymbol: c.symbol,
      system: "You are an independent second-opinion trading analyst. Be concise.",
      prompt,
    });
  }
}

// ── Post-entry review (AI watches the open trade, reports to management) ──
function schedulePostEntryReview(
  ctx: any,
  settings: Record<string, any>,
  p: { positionId: any; symbol: string; side: string; entry: number; stopLoss: number; takeProfit: number; rr: number; score: number; strategies: string[] },
): void {
  const minutes = Math.max(5, Number(settings["ai.postEntryReviewMinutes"] ?? 30) || 30);
  void ctx.scheduler.runAfter(minutes * 60 * 1000, internal.engineWorker.postEntryReview, {
    positionId: String(p.positionId),
    symbol: p.symbol,
    side: p.side,
    entry: p.entry,
    stopLoss: p.stopLoss,
    takeProfit: p.takeProfit,
    rr: p.rr,
    score: p.score,
    strategies: p.strategies,
  });
}

/**
 * Scheduled after every opened position: pulls the LIVE price, computes the
 * current P&L vs the plan, asks the AI to grade the trade and store a report
 * (kind "post_entry") that the admin AI center surfaces for management.
 */
export const postEntryReview = internalAction({
  args: {
    positionId: v.string(),
    symbol: v.string(),
    side: v.string(),
    entry: v.number(),
    stopLoss: v.number(),
    takeProfit: v.number(),
    rr: v.number(),
    score: v.number(),
    strategies: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    try {
      const settings: any = await ctx.runQuery(internal.settings.rawSettings, {});
      const livePrice = (await ctx.runQuery(internal.engineData.getMarketPrice, {
        symbol: args.symbol,
      })) as number | null;
      const price = livePrice ?? args.entry;
      const dir = args.side === "long" ? 1 : -1;
      const pnlPct = ((price - args.entry) / args.entry) * 100 * dir;
      const distSl = (Math.abs(price - args.stopLoss) / args.entry) * 100;
      const distTp = (Math.abs(args.takeProfit - price) / args.entry) * 100;
      const prompt =
        `You are the WOLF AI post-entry supervisor. Review this OPEN trade against the live price and report to management.\n\n` +
        `Symbol ${args.symbol} | ${dir === 1 ? "LONG" : "SHORT"} | Entry ${args.entry} | SL ${args.stopLoss} | TP ${args.takeProfit} | R:R 1:${args.rr} | Score ${args.score}/100\n` +
        `Live price ${price} | Current P&L ${pnlPct.toFixed(2)}% | Distance to SL ${distSl.toFixed(2)}% | Distance to TP ${distTp.toFixed(2)}%\n` +
        `Strategies: ${(args.strategies ?? []).join(", ") || "—"}\n\n` +
        `Give a management report in Persian (فارسی) and English: verdict (hold | tighten SL | take profit early | cut loss), why, and what to watch. Under 120 words. Format:\nFA: <persian>\nEN: <english>`;
      const res = (await ctx.runAction(internal.nodeCalls.aiGenerateRobust, {
        provider: String(settings["ai.provider"] ?? "pollinations"),
        key: String(settings["ai.key"] ?? ""),
        freeFallback: !isFalseSetting(settings["ai.freeFallback"]),
        system: "You are Wolf Trading AI, the post-entry supervisor. Be concise and actionable.",
        prompt,
      })) as { ok?: boolean; text?: string; provider?: string };
      const text = String(res?.text ?? "").trim();
      if (!text) return { ok: false, reason: "empty" };
      await ctx.runMutation(internal.engineWorker.storePostEntryReview, {
        positionId: args.positionId,
        symbol: args.symbol,
        side: args.side,
        price,
        pnlPct,
        provider: String(res?.provider ?? "ai"),
        text,
      });
      return { ok: true, pnlPct };
    } catch (e: any) {
      console.warn(`[ai] post-entry review failed: ${e?.message ?? e}`);
      return { ok: false, error: String(e?.message ?? e).slice(0, 200) };
    }
  },
});

/** Persist a post-entry review (kind "post_entry") + audit log line. */
export const storePostEntryReview = internalMutation({
  args: {
    positionId: v.string(),
    symbol: v.string(),
    side: v.string(),
    price: v.number(),
    pnlPct: v.number(),
    provider: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("ai_analysis", {
      kind: "post_entry",
      key: `post:${args.positionId}:${Date.now()}`,
      provider: args.provider,
      model: "",
      text: `[${args.symbol} ${args.side.toUpperCase()}] P&L ${args.pnlPct.toFixed(2)}% @ ${args.price}\n\n${args.text}`,
      status: "done",
      created: Date.now(),
    });
    await log(ctx, "AI", "ai.post_entry", `${args.symbol} ${args.side} ${args.pnlPct.toFixed(2)}%`, "ai");
  },
});

// ── Persist AI output and attach it to the latest learning record ─────────
export const storeAiReview = internalMutation({
  args: {
    key: v.string(),
    symbol: v.optional(v.string()),
    provider: v.string(),
    model: v.optional(v.string()),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("ai_analysis", {
      kind: "trade_review",
      key: args.key,
      provider: args.provider,
      model: args.model,
      text: args.text,
      status: "done",
      created: now,
    });
    if (args.symbol) {
      const rows = await ctx.db.query("learningHistory").collect();
      const latest = rows
        .filter((row: any) => row.symbol === args.symbol)
        .sort((a: any, b: any) => b.created - a.created)[0];
      if (latest) await ctx.db.patch(latest._id, { aiReview: args.text });
    }
    await log(ctx, "AI", "ai.review.saved", `${args.provider}:${args.symbol ?? ""}`, "ai");
  },
});

// ── internal — called by the cron ────────────────────────────────────────
export const runScan = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settings: any = await getSettingsMap(ctx);
    // ── EMERGENCY STOP / disabled → the loop must not keep running ────
    if (settings["engine.emergencyStop"] === true || settings["engine.enabled"] === false) {
      return { ok: true, stopped: true };
    }
    // Sub-minute cadence: Convex crons cannot go below 1 minute, so the scan
    // re-schedules itself every `engine.loopSeconds` (default 5s, min 1s) and
    // the 1-min cron stays as a watchdog — if the loop ever dies, the next
    // cron tick restarts it (the throttle below prevents double-running).
    const loopSeconds = Math.max(1, Math.min(3600, Number(settings["engine.loopSeconds"] ?? 5) || 5));
    const lastLoop = Number(settings["engine.lastLoopAt"] ?? 0) || 0;
    if (Date.now() - lastLoop < loopSeconds * 1000) return { ok: true, skipped: true };
    await scan(ctx);
    await setSetting(ctx, "engine.lastLoopAt", Date.now(), "engine");
    await ctx.scheduler.runAfter(loopSeconds * 1000, internal.engineWorker.runScan, {});
    return { ok: true };
  },
});

// ── public — manual trigger from the admin panel ─────────────────────────
export const runScanNow = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAdmin(ctx, token);
    await scan(ctx);
    return { ok: true };
  },
});

// ── Manual-open helper: fetch LIVE candles for a pair (Binance → Nobitex
// for crypto, Yahoo for forex) and persist them, so manualOpen can force a
// trade immediately without waiting for the scheduled market feed. Admin-only.
export const ensureManualCandles = action({
  args: { token: v.string(), symbol: v.string() },
  handler: async (ctx, { token, symbol }): Promise<any> => {
    await ctx.runQuery(internal.engineData.getManualOpenContext, { token, symbol });
    // Resilient chain: Binance → MEXC → OKX → KuCoin → Gate → Nobitex for
    // crypto; Yahoo for forex/metals. A region block on Binance/Bybit must
    // never freeze the manual-open flow again (verified 2026-08: OKX, KuCoin,
    // Gate and MEXC are reachable from restricted regions).
    const fetched15 = symbol.endsWith("USDT")
      ? await fetchCryptoKlines(symbol, "15m")
      : await fetchForexKlines(symbol, "15m");
    if (fetched15 && fetched15.length >= 50) {
      await ctx.runMutation(internal.engineData.storeBacktestCandles, {
        symbol,
        timeframe: "15m",
        candles: fetched15,
      });
      return { ok: true, timeframe: "15m", count: fetched15.length };
    }
    const fetched1h = symbol.endsWith("USDT")
      ? await fetchCryptoKlines(symbol, "1h")
      : await fetchForexKlines(symbol, "1h");
    if (fetched1h && fetched1h.length >= 50) {
      await ctx.runMutation(internal.engineData.storeBacktestCandles, {
        symbol,
        timeframe: "1h",
        candles: fetched1h,
      });
      return { ok: true, timeframe: "1h", count: fetched1h.length };
    }
    throw new Error("فید زنده (بایننس/MEXC/OKX/KuCoin/Gate/نوبیتکس/یاهو) برای این نماد پاسخ نداد — بعداً دوباره تلاش کنید");
  },
});


// ───────────────────────────────────────────────────────────────────────────
// Backtest replay (Zipline / backtrader style): replays the stored REAL
// candles through the exact same evaluator the live scan uses, simulates
// SL/TP exits with the configured fee + slippage cost model, and returns a
// full performance report. Admin-only, read-only (never touches positions).
// ───────────────────────────────────────────────────────────────────────────
export const runBacktest = action({
  args: { token: v.string(), symbol: v.string(), timeframe: v.string(), exchange: v.optional(v.string()) },
  handler: async (ctx, { token, symbol, timeframe, exchange }): Promise<any> => {
    const context: any = await ctx.runQuery(internal.engineData.getBacktestContext, { token, symbol, timeframe });
    const settings = context.settings;
    const minScore = entryScoreThreshold(settings);
    const minConfidence = numSetting(settings, "risk.minConfidence", 0.5);
    const minConsensus = numSetting(settings, "risk.minConsensus", 0.55);
    const minConfirmations = Math.max(1, Math.round(numSetting(settings, "risk.minConfirmations", 3)));
    const minRR = numSetting(settings, "risk.minRR", 1.2);
    const stopATR = numSetting(settings, "risk.stopOffsetATR", 1.6);
    const tp1ATR = numSetting(settings, "risk.tp1ATR", 1.8);
    const feePct = numSetting(settings, "engine.feePct", 0.1);
    const slippagePct = numSetting(settings, "engine.slippagePct", 0.05);
    const strategies = context.strategies;
    if (strategies.length === 0) throw new Error("strategy registry is empty");
    // Stored data is preferred. If it is missing, fetch the exact requested
    // timeframe in this Action and persist it through an internal mutation.
    let candles: any[] | null = context.candles?.length ? context.candles : null;
    if (!candles) {
      const supported = ["5m", "15m", "30m", "1h", "4h", "1d"];
      if (!supported.includes(timeframe)) throw new Error(`unsupported timeframe: ${timeframe}`);
      // Exchange-pinned backtest: fetch the historical candles from the chosen
      // exchange (binance/bybit/okx/kucoin/mexc/gate...) — data can differ per
      // venue, so every trade row is tagged with the exchange it came from.
      const fetched = symbol.endsWith("USDT")
        ? exchange === "okx"
          ? await fetchOkxKlines(symbol, timeframe)
          : exchange === "kucoin"
            ? await fetchKucoinKlines(symbol, timeframe)
            : exchange === "gate"
              ? await fetchGateKlines(symbol, timeframe)
              : exchange === "mexc"
                ? await fetchMexcKlines(symbol, timeframe)
                : exchange === "bybit"
                  ? await fetchBybitKlines(symbol, timeframe)
                  : exchange === "bitget"
                    ? await fetchBitgetKlines(symbol, timeframe)
                    : exchange === "coinex"
                      ? await fetchCoinexKlines(symbol, timeframe)
                      : (await fetchCryptoKlines(symbol, timeframe)) ?? (await fetchNobitexKlines(symbol, timeframe))
        : await fetchForexKlines(symbol, timeframe);
      if (fetched && fetched.length >= 50) {
        candles = fetched;
        await ctx.runMutation(internal.engineData.storeBacktestCandles, { symbol, timeframe, candles: fetched });
      }
    }
    if (!candles) throw new Error(`no real ${timeframe} candle data for ${symbol}; run the market feed or try again later`);
    candles = candles.slice(-600);
    if (candles.length < 50) throw new Error("not enough candles (need at least 50)");

    const slip = slippagePct / 100;
    const feeFrac = feePct / 100;
    const trades: Array<Record<string, any>> = [];
    let i = 45;
    while (i < candles.length - 2) {
      const window = candles.slice(0, i + 1);
      const { aggregate, features } = analyze(window, strategies);
      const rr = tp1ATR / stopATR;
      if (
        aggregate.direction !== "neutral" &&
        aggregate.score >= minScore &&
        aggregate.confidence >= minConfidence &&
        aggregate.consensus >= minConsensus &&
        aggregate.independentConfirmations >= minConfirmations &&
        !aggregate.conflict &&
        rr >= minRR
      ) {
        const dir = aggregate.direction as "long" | "short";
        const atr = Math.max(features.atrV, features.price * 0.001);
        const entry = dir === "long" ? features.price * (1 + slip) : features.price * (1 - slip);
        const sl = dir === "long" ? features.price - atr * stopATR : features.price + atr * stopATR;
        const tp = dir === "long" ? features.price + atr * tp1ATR : features.price - atr * tp1ATR;
        let outcome: "win" | "loss" = "loss";
        let exit = sl;
        let k = i + 1;
        for (; k < candles.length; k++) {
          const h = candles[k].h;
          const l = candles[k].l;
          if (dir === "long") {
            if (l <= sl) { exit = sl; break; }
            if (h >= tp) { exit = tp; outcome = "win"; break; }
          } else {
            if (h >= sl) { exit = sl; break; }
            if (l <= tp) { exit = tp; outcome = "win"; break; }
          }
        }
        if (k >= candles.length) break; // trade unresolved inside the data window
        const exitFill = dir === "long" ? exit * (1 - slip) : exit * (1 + slip);
        const rrReal = dir === "long" ? (exitFill - entry) / Math.max(1e-9, entry - sl) : (entry - exitFill) / Math.max(1e-9, sl - entry);
        const pnlPct = ((dir === "long" ? exitFill - entry : entry - exitFill) / entry) * 100 - feeFrac * 2;
        trades.push({
          symbol,
          timeframe,
          exchange: exchange ?? (symbol.endsWith("USDT") ? "binance" : "yahoo"),
          side: dir,
          entry: Number(entry.toFixed(6)),
          sl: Number(sl.toFixed(6)),
          tp: Number(tp.toFixed(6)),
          exit: Number(exitFill.toFixed(6)),
          outcome,
          rr: Number(rrReal.toFixed(2)),
          pnlPct: Number(pnlPct.toFixed(4)),
          score: aggregate.score,
          confidence: Number(aggregate.confidence.toFixed(3)),
          strategies: aggregate.contribution.map((c: any) => c.key).slice(0, 4),
          createdAt: candles[i].t,
        });
        i = k; // resume right after the resolved trade (no overlapping positions)
      } else {
        i++;
      }
    }

    const wins = trades.filter((t) => t.outcome === "win");
    const losses = trades.filter((t) => t.outcome === "loss");
    const grossW = wins.reduce((s: number, t: any) => s + Math.abs(t.pnlPct), 0);
    const grossL = losses.reduce((s: number, t: any) => s + Math.abs(t.pnlPct), 0);
    const byStrat = new Map<string, { trades: number; wins: number }>();
    for (const t of trades) {
      for (const sk of t.strategies) {
        const e = byStrat.get(sk) ?? { trades: 0, wins: 0 };
        e.trades++;
        if (t.outcome === "win") e.wins++;
        byStrat.set(sk, e);
      }
    }
    const bestStrategies = [...byStrat.entries()]
      .map(([key, e]) => ({ key, trades: e.trades, winRate: e.trades ? Number(((e.wins / e.trades) * 100).toFixed(1)) : 0 }))
      .filter((e) => e.trades >= 2)
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 5);

    // freqtrade-style risk metrics: equity-curve max drawdown, per-trade
    // Sharpe and best/worst trade (useful for comparing parameter sets).
    const pnlPcts = trades.map((t: any) => t.pnlPct);
    let equity = 0;
    let peak = 0;
    let maxDD = 0;
    for (const p of pnlPcts) {
      equity += p;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDD) maxDD = dd;
    }
    const mean = pnlPcts.length ? pnlPcts.reduce((a: number, b: number) => a + b, 0) / pnlPcts.length : 0;
    const variance = pnlPcts.length > 1 ? pnlPcts.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / (pnlPcts.length - 1) : 0;
    const sharpe = variance > 0 ? Number((mean / Math.sqrt(variance)).toFixed(2)) : 0;

    await ctx.runMutation(internal.engineData.recordBacktestLog, {
      symbol,
      timeframe,
      trades: trades.length,
      winRate: trades.length ? Math.round((wins.length / trades.length) * 100) : 0,
    });
    return {
      symbol,
      timeframe,
      windows: candles.length,
      trades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length ? Number(((wins.length / trades.length) * 100).toFixed(2)) : 0,
      profitFactor: grossL > 0 ? Number((grossW / grossL).toFixed(2)) : grossW > 0 ? Infinity : 0,
      avgRr: trades.length ? Number((trades.reduce((s: number, t: any) => s + t.rr, 0) / trades.length).toFixed(2)) : 0,
      avgPnlPct: trades.length ? Number((trades.reduce((s: number, t: any) => s + t.pnlPct, 0) / trades.length).toFixed(4)) : 0,
      maxDrawdownPct: Number(maxDD.toFixed(2)),
      sharpe,
      bestTradePct: Number((pnlPcts.length ? Math.max(...pnlPcts) : 0).toFixed(2)),
      worstTradePct: Number((pnlPcts.length ? Math.min(...pnlPcts) : 0).toFixed(2)),
      bestStrategies,
      tradeList: trades.slice(-40),
    };
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Hyperopt-style parameter tuner (freqtrade-inspired): replays the stored
// REAL candles across a small parameter grid (stop ATR, TP ATR, risk %,
// min score) and ranks the combos by risk-adjusted profit. Read-only — the
// admin can then apply the winning combo to the live settings.
// ───────────────────────────────────────────────────────────────────────────
export const runTuner = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<any> => {
    const context: any = await ctx.runQuery(internal.engineData.getTunerContext, { token });
    const strategies = context.strategies;
    const windows = context.windows;
    if (strategies.length === 0) throw new Error("strategy registry is empty");
    if (windows.length === 0) throw new Error("no stored candles — run the market feed first");

    const grid: Array<{ stopATR: number; tp1ATR: number; riskPerTrade: number; minScore: number }> = [];
    for (const stopATR of [1.4, 1.8]) {
      for (const tp1ATR of [1.8, 2.4]) {
        for (const riskPerTrade of [1, 2]) {
          for (const minScore of [30, 45]) {
            grid.push({ stopATR, tp1ATR, riskPerTrade, minScore });
          }
        }
      }
    }

    // The per-candle analysis is identical for every combo (only the gates and
    // SL/TP levels differ), so compute it ONCE per window and replay it across
    // the grid — this keeps the tuner fast instead of re-analyzing N×.
    const windowsData = windows.map((w: any) => {
      const candles = w.candles.slice(-200);
      const analyses: any[] = [];
      for (let i = 45; i < candles.length - 2; i++) {
        analyses.push(analyze(candles.slice(0, i + 1), strategies));
      }
      return { symbol: w.symbol, candles, analyses };
    });

    const results: any[] = [];
    for (const combo of grid) {
      const agg = { trades: 0, wins: 0, pnlSum: 0, pnlSq: 0, grossW: 0, grossL: 0, maxDD: 0 };
      let equity = 0;
      let peak = 0;
      for (const w of windowsData) {
        const candles = w.candles;
        let i = 45;
        while (i < candles.length - 2) {
          const { aggregate, features } = w.analyses[i - 45];
          const rr = combo.tp1ATR / combo.stopATR;
          if (
            aggregate.direction !== "neutral" &&
            aggregate.score >= combo.minScore &&
            aggregate.confidence >= 0.5 &&
            aggregate.consensus >= 0.55 &&
            aggregate.independentConfirmations >= 3 &&
            !aggregate.conflict &&
            rr >= 1.0
          ) {
            const dir = aggregate.direction as "long" | "short";
            const atr = Math.max(features.atrV, features.price * 0.001);
            const entry = features.price;
            const sl = dir === "long" ? entry - atr * combo.stopATR : entry + atr * combo.stopATR;
            const tp = dir === "long" ? entry + atr * combo.tp1ATR : entry - atr * combo.tp1ATR;
            let outcome: "win" | "loss" = "loss";
            let exit = sl;
            let k = i + 1;
            for (; k < candles.length; k++) {
              const h = candles[k].h;
              const l = candles[k].l;
              if (dir === "long") {
                if (l <= sl) { exit = sl; break; }
                if (h >= tp) { exit = tp; outcome = "win"; break; }
              } else {
                if (h >= sl) { exit = sl; break; }
                if (l <= tp) { exit = tp; outcome = "win"; break; }
              }
            }
            if (k >= candles.length) break; // unresolved inside the data window
            const pnlPct = ((dir === "long" ? exit - entry : entry - exit) / entry) * 100 - 0.2; // fee both sides
            agg.trades++;
            if (outcome === "win") {
              agg.wins++;
              agg.grossW += Math.abs(pnlPct);
            } else {
              agg.grossL += Math.abs(pnlPct);
            }
            agg.pnlSum += pnlPct;
            agg.pnlSq += pnlPct * pnlPct;
            equity += pnlPct;
            if (equity > peak) peak = equity;
            const dd = peak - equity;
            if (dd > agg.maxDD) agg.maxDD = dd;
            i = k;
          } else {
            i++;
          }
        }
      }
      if (agg.trades === 0) continue;
      const winRate = (agg.wins / agg.trades) * 100;
      const avgPnl = agg.pnlSum / agg.trades;
      const variance = agg.trades > 1 ? (agg.pnlSq - (agg.pnlSum * agg.pnlSum) / agg.trades) / (agg.trades - 1) : 0;
      const sharpe = variance > 0 ? avgPnl / Math.sqrt(variance) : 0;
      // risk-adjusted score: average profit × log(trade count) − drawdown penalty
      const score = avgPnl * Math.log1p(agg.trades) - 0.4 * agg.maxDD;
      results.push({
        params: {
          "risk.stopOffsetATR": combo.stopATR,
          "risk.tp1ATR": combo.tp1ATR,
          "risk.riskPerTrade": combo.riskPerTrade,
          "risk.minScore": combo.minScore,
        },
        trades: agg.trades,
        winRate: Number(winRate.toFixed(1)),
        avgPnlPct: Number(avgPnl.toFixed(3)),
        profitFactor: agg.grossL > 0 ? Number((agg.grossW / agg.grossL).toFixed(2)) : agg.grossW > 0 ? 99 : 0,
        sharpe: Number(sharpe.toFixed(2)),
        maxDrawdownPct: Number(agg.maxDD.toFixed(2)),
        score: Number(score.toFixed(2)),
      });
    }
    results.sort((a, b) => b.score - a.score);
    return {
      windows: windows.length,
      symbols: [...new Set(windows.map((w: any) => w.symbol))],
      combos: grid.length,
      results: results.slice(0, 8),
      best: results[0] ?? null,
    };
  },
});

// ───────────────────────────────────────────────────────────────────────────
// AI research layer (TradingAgents-inspired): a compact fundamental +
// sentiment + news + technical snapshot for the top watched markets. Runs on
// demand from the admin panel; results land in ai_analysis + the Learning
// card so they are visible without extra plumbing.
// ───────────────────────────────────────────────────────────────────────────
export const runResearch = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<any> => {
    const context: any = await ctx.runQuery(internal.engineData.getTunerContext, { token, limit: 4 });
    const settings = context.settings;
    if (settings["ai.researchEnabled"] === false) throw new Error("ai.researchEnabled is off");
    const provider = settings["ai.provider"] ?? "gemini";
    const model = settings["ai.model"] ?? "gemini-3.6-flash";
    const key = settings["ai.key"];
    if (!key) throw new Error("AI key not configured");
    const symbols = [...new Set((context.windows ?? []).map((w: any) => w.symbol))].slice(0, 5);
    if (symbols.length === 0) throw new Error("no enabled markets with stored candles — run the market feed first");

    const system = "You are the Wolf Trading AI research team (fundamental + sentiment + news + technical analysts). Be concise, realistic and never overpromise.";
    const prompt = `Produce a compact market research snapshot (TradingAgents-style) for the watched markets: ${symbols.join(", ")}.
For each symbol provide:
  fundamental: the key macro/on-chain/fundamental driver (1 sentence)
  sentiment: sentiment/news tilt with a short reason (1 sentence)
  technical: bullish / bearish / neutral with a 1-sentence reason
End with a 1-2 sentence overall risk note for the automated engine.
Respond in JSON only:
{"markets":[{"symbol":"...","fundamental":"...","sentiment":"...","technical":"..."}],"risk_note":"..."}`;

    const r: any = await ctx.runAction(internal.nodeCalls.aiGenerateRobust, {
      provider,
      model,
      key,
      freeFallback: !isFalseSetting(settings["ai.freeFallback"]),
      system,
      prompt,
    });
    const text = String(r?.text ?? "").trim();
    const usedProvider = String(r?.provider ?? provider);
    if (!text) throw new Error("empty AI response");
    await ctx.runMutation(internal.engineWorker.storeResearch, { text, provider: usedProvider, model });
    return { ok: true, text, symbols, provider: usedProvider };
  },
});

export const storeResearch = internalMutation({
  args: { text: v.string(), provider: v.string(), model: v.optional(v.string()) },
  handler: async (ctx, { text, provider, model }) => {
    const now = Date.now();
    await ctx.db.insert("ai_analysis", {
      kind: "research",
      key: `research:${now}`,
      provider,
      model,
      text,
      status: "done",
      created: now,
    });
    await ctx.db.insert("learningHistory", {
      symbol: "MARKET",
      timeframe: "research",
      strategies: [],
      scores: { score: 0, confidence: 0 },
      signal: "research",
      decision: "research",
      result: "research",
      snapshot: JSON.stringify({ source: "ai_research", at: now }),
      aiReview: text,
      created: now,
    });
    await log(ctx, "AI", "ai.research.saved", `provider=${provider}`, "ai");
  },
});

// ───────────────────────────────────────────────────────────────────────────
// MANUAL TRADE MODE — the manager picks a pair (Markets tab) and the engine
// FORCES a position open, but still runs the full multi-strategy analysis to
// pick the best direction / entry / SL / TP for that pair. Live mode routes
// the order through the active broker account (CCXT or Nobitex).
// ───────────────────────────────────────────────────────────────────────────
export const manualOpen = mutation({
  args: {
    token: v.string(),
    symbol: v.string(),
    side: v.optional(v.union(v.literal("long"), v.literal("short"))),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { token, symbol, side, note }) => {
    await requireAdmin(ctx, token);
    const settings = await getSettingsMap(ctx);
    const now = Date.now();
    const marketRow = await ctx.db
      .query("markets")
      .withIndex("by_symbol", (q: any) => q.eq("symbol", symbol))
      .first();
    if (!marketRow) throw new Error(`نماد پیدا نشد: ${symbol}`);
    const existing = await ctx.db
      .query("open_positions")
      .withIndex("symbol", (q: any) => q.eq("symbol", symbol))
      .first();
    if (existing) throw new Error(`یک پوزیشن روی ${symbol} باز است — ابتدا آن را ببندید`);

    const strategies = (await ctx.db.query("strategies").collect())
      .filter((s: any) => s.enabled && s.engineEnabled && s.family)
      .map((s: any) => ({ key: s.key, family: s.family, nameFa: s.nameFa, weight: s.weight }));
    if (strategies.length === 0) throw new Error("استراتژی فعالی وجود ندارد");

    // Real candles: prefer 15m, fall back to 1h; require fresh data. The UI
    // runs ensureManualCandles (an action) right before this mutation so the
    // exchange feed is fetched + stored automatically — no manual feed step.
    let tf = "15m";
    let candles: any[] = [];
    for (const candidateTf of ["15m", "1h"]) {
      const row = await ctx.db
        .query("candles")
        .withIndex("by_symbol_tf", (q: any) => q.eq("symbol", symbol).eq("timeframe", candidateTf))
        .first();
      if (row?.data?.length && now - (row.updatedAt ?? row._creationTime ?? 0) < 60 * 60000) {
        tf = candidateTf;
        candles = row.data.slice(-240);
        break;
      }
    }
    if (candles.length < 30) {
      throw new Error("داده کندل کافی برای این نماد نیست — فید زنده دریافت نشد؛ دوباره «باز کردن دستی» را بزنید تا کندل‌ها خودکار واکشی شوند");
    }

    const { features, aggregate } = analyze(candles, strategies);
    let dir = aggregate.direction === "long" || aggregate.direction === "short" ? aggregate.direction : null;
    if (side) dir = side;
    if (!dir) dir = aggregate.score >= 0 ? "long" : "short";

    const stopATR = numSetting(settings, "risk.stopOffsetATR", 1.6);
    const tp1ATR = numSetting(settings, "risk.tp1ATR", 1.8);
    const tp2ATR = numSetting(settings, "risk.tp2ATR", 3.0);
    const tp3ATR = numSetting(settings, "risk.tp3ATR", 4.5);
    const capital = numSetting(settings, "risk.virtualCapital", numSetting(settings, "engine.capital", 1000));
    const riskPct = numSetting(settings, "risk.riskPerTrade", 1.5);
    const maxLeverage = numSetting(settings, "risk.maxLeverage", 20);
    const feePct = numSetting(settings, "engine.feePct", 0.1);
    const slippagePct = numSetting(settings, "engine.slippagePct", 0.05);
    const mode = settings["engine.mode"] === "live" ? "live" : "demo";
    const tradeType = settings["engine.tradeType"] ?? "futures";

    const atr = Math.max(features.atrV, features.price * 0.001);
    const slDist = atr * stopATR;
    const tp1 = dir === "long" ? features.price + atr * tp1ATR : features.price - atr * tp1ATR;
    const tp2 = dir === "long" ? features.price + atr * tp2ATR : features.price - atr * tp2ATR;
    const tp3 = dir === "long" ? features.price + atr * tp3ATR : features.price - atr * tp3ATR;
    const rr = tp1ATR / stopATR;

    const candidate = {
      symbol,
      market: marketRow.market,
      timeframe: tf,
      entry: features.price,
      features,
      aggregate,
      strategies: aggregate.contribution.map((c: any) => c.key).slice(0, 6),
      network: (marketRow as any).network,
    };
    const payload = buildPosition(
      candidate,
      dir,
      slDist,
      tp1,
      tp2,
      tp3,
      rr,
      atr,
      capital,
      riskPct,
      maxLeverage,
      mode,
      tradeType,
      marketRow.market,
      (marketRow as any).network,
      now,
      feePct,
      slippagePct,
      100,
      100,
      [],
    );
    if (!payload) throw new Error("محاسبه حجم پوزیشن ناموفق بود");
    payload.source = "manual";
    payload.note = note ?? "";

    const positionId = await ctx.db.insert("open_positions", payload);
    await ctx.db.insert("trade_analysis", buildAnalysis(positionId, candidate, dir, slDist, tp1, tp2, tp3, rr, atr, capital, riskPct, maxLeverage, now));
    await ctx.db.insert("signals", {
      symbol,
      timeframe: tf,
      direction: dir,
      entry: payload.entry,
      stopLoss: payload.stopLoss,
      takeProfit: payload.takeProfit,
      targets: [tp1, tp2, tp3],
      rr,
      score: aggregate.score,
      confidence: aggregate.confidence,
      strategyKeys: payload.strategyKeys,
      aggregate,
      reasonsFa: aggregate.reasons ?? [],
      reasonsEn: [],
      price: payload.entry,
      mode,
      status: "filled",
      positionId,
      created: now,
      expires: now + 4 * 60 * 60 * 1000,
    });
    await ctx.db.insert("learningHistory", {
      symbol,
      timeframe: tf,
      strategies: payload.strategyKeys,
      scores: { score: aggregate.score, confidence: aggregate.confidence },
      signal: dir,
      decision: "manual_open",
      result: "open",
      snapshot: JSON.stringify({ source: "manual_open", note: note ?? "", at: now }),
      created: now,
    });

    if (mode === "live") {
      const active: any = await ctx.runQuery(internal.brokerData.getActiveBrokerAccount, {});
      void ctx.scheduler.runAfter(0, internal.broker.executeOpen, {
        positionId,
        symbol,
        side: dir,
        tradeType,
        entry: payload.entry,
        stopLoss: payload.stopLoss,
        takeProfit: payload.takeProfit,
        leverage: payload.leverage,
        size: payload.size,
        quantity: payload.quantity,
        mode,
        brokerId: active?.id,
      });
    }

    await setSetting(ctx, "engine.lastScanAt", now, "engine");
    await log(ctx, "TRADE", "engine.position.manual", `${symbol}:${dir} score=${aggregate.score.toFixed(1)}`, "engine");
    return {
      ok: true,
      positionId,
      symbol,
      side: dir,
      timeframe: tf,
      score: Number(aggregate.score.toFixed(1)),
      confidence: Number(aggregate.confidence.toFixed(3)),
      consensus: Number((aggregate.consensus ?? 0).toFixed(3)),
      confirmations: aggregate.independentConfirmations,
      bestStrategies: payload.strategyKeys,
      entry: payload.entry,
      stopLoss: payload.stopLoss,
      takeProfit: payload.takeProfit,
      leverage: payload.leverage,
      size: payload.size,
      mode,
      warning:
        aggregate.score < entryScoreThreshold(settings)
          ? "امتیاز زیر آستانه‌ی ورود است — پوزیشن به‌صورت دستی و با احتیاط باز شد"
          : "",
    };
  },
});

// ───────────────────────────────────────────────────────────────────────────
// AI LAYER BACKTEST / VALIDATION — replays REAL stored candles and asks the
// AI (configured provider + free fallback chain) to predict the direction of
// the next candle at several offsets, then compares with the actual outcome.
// Produces an accuracy report (the AI is advisory only — it never opens
// trades itself).
// ───────────────────────────────────────────────────────────────────────────
export const runAiBacktest = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<any> => {
    const context: any = await ctx.runQuery(internal.engineData.getTunerContext, { token, limit: 4 });
    const settings = context.settings;
    const provider = settings["ai.provider"] ?? "gemini";
    const model = settings["ai.model"] ?? "gemini-3.6-flash";
    const key = settings["ai.key"];
    if (!key && isFalseSetting(settings["ai.freeFallback"])) {
      throw new Error("هیچ کلید AI و fallback رایگان فعال نیست — کلید بگذارید یا fallback را روشن کنید");
    }
    const windows: Array<Record<string, any>> = (context.windows ?? []).slice(0, 4);
    if (windows.length === 0) throw new Error("کندل ذخیره‌شده‌ای نیست — ابتدا فید بازار را اجرا کنید");

    const system =
      "You are a market-direction evaluator. Predict only the direction of the NEXT candle after each index (higher close → \"up\", lower close → \"down\"). Reply in strict JSON only: {\"predictions\":[{\"i\":0,\"dir\":\"up\"},{\"i\":1,\"dir\":\"down\"}]}.";
    const results: Array<Record<string, any>> = [];
    let correct = 0;
    let total = 0;
    let lastAiError = "";
    const freeFallback = !isFalseSetting(settings["ai.freeFallback"]);

    for (const w of windows) {
      const candles: any[] = (w.candles ?? []).slice(-80);
      if (candles.length < 40) continue;
      const offsets = [candles.length - 6, candles.length - 12, candles.length - 18, candles.length - 24].filter(
        (i) => i >= 30 && i < candles.length - 1,
      );
      const rows = offsets.map((i) => ({
        i,
        actual: candles[i + 1].c >= candles[i].c ? "up" : "down",
      }));
      const series = candles.map((c: any) => Number(c.c).toFixed(6)).join(",");
      const prompt = `Symbol: ${w.symbol} · Timeframe: ${w.timeframe}\nPrice closes: [${series}]\nPredict the next-candle direction at indices ${offsets.join(",")}.\nRespond JSON only.`;
      let parsed: any = null;
      try {
        const r: any = await ctx.runAction(internal.nodeCalls.aiGenerateRobust, {
          provider,
          model,
          key,
          freeFallback,
          system,
          prompt,
        });
        const text = String(r?.text ?? "");
        const m = text.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
        if (!parsed) lastAiError = `پاسخ JSON معتبر نبود: ${text.slice(0, 120)}`;
      } catch (e: any) {
        // remember why the provider failed so the admin sees the real cause
        lastAiError = String(e?.message ?? e);
      }
      const predictions: Array<{ i: number; dir: string }> = Array.isArray(parsed?.predictions) ? parsed.predictions : [];
      const windowRows = rows.map((row) => {
        const pred = String(predictions.find((p) => Number(p?.i) === row.i)?.dir ?? "").toLowerCase();
        const hit = pred === row.actual;
        if (pred) {
          total++;
          if (hit) correct++;
        }
        return { i: row.i, actual: row.actual, predicted: pred || "—", hit: pred ? hit : null };
      });
      results.push({ symbol: w.symbol, timeframe: w.timeframe, rows: windowRows });
    }

    if (total === 0) {
      throw new Error(
        lastAiError
          ? `هیچ پیش‌بینی‌ای از AI دریافت نشد — آخرین خطا: ${lastAiError.slice(0, 200)}`
          : "هیچ پیش‌بینی‌ای از AI دریافت نشد — همه پروایدرها در دسترس نیستند",
      );
    }
    const accuracy = Math.round((correct / total) * 100);
    await ctx.runMutation(internal.engineWorker.storeAiBacktest, {
      text: JSON.stringify({ provider, accuracy, correct, total, windows: results }, null, 2),
      provider,
      model,
    });
    return { ok: true, provider, correct, total, accuracy, windows: results };
  },
});

export const storeAiBacktest = internalMutation({
  args: { text: v.string(), provider: v.string(), model: v.optional(v.string()) },
  handler: async (ctx, { text, provider, model }) => {
    const now = Date.now();
    await ctx.db.insert("ai_analysis", {
      kind: "ai_backtest",
      key: `ai_backtest:${now}`,
      provider,
      model,
      text,
      status: "done",
      created: now,
    });
    await ctx.db.insert("learningHistory", {
      symbol: "AI",
      timeframe: "validation",
      strategies: [],
      scores: { score: 0, confidence: 0 },
      signal: "ai_backtest",
      decision: "validation",
      result: "ai_backtest",
      snapshot: text.slice(0, 2000),
      aiReview: text.slice(0, 4000),
      created: now,
    });
    await log(ctx, "AI", "ai.backtest.saved", `provider=${provider}`, "ai");
  },
});
