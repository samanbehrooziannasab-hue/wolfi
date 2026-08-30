// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — on-demand engine tools (REST parity with Convex
// engineWorker): historical backtest, parameter tuner, manual position open
// and AI research snapshot. All read-only except manualOpen (which opens ONE
// position through the same atomic path the live engine uses).
// ─────────────────────────────────────────────────────────────────────────────
import { pool, tx, one, many, insertPositionOrThrow, logEngine, type Row } from "./db.js";
import { getSettings, getSetting } from "./settings.js";
import { analyzeTimeframe, computeDecision, evaluateStrategy, getCandles } from "./engine.js";
import type { TfView } from "./engine.js";
import { fetchTicker } from "./exchanges.js";
import { aiAskJson, aiAsk } from "./ai.js";
import { now, num, round, clean } from "./util.js";

const BACKTEST_TFS = ["5m", "15m", "30m", "1h", "4h", "1d"];

interface StrategyRow {
  key: string;
  market: string;
  timeframes: string[];
  weight: number;
}

async function activeStrategies(): Promise<StrategyRow[]> {
  const rows = await many<Row>("SELECT key, market, timeframes, weight FROM strategies WHERE engine_enabled = true AND enabled = true");
  return rows.map((r) => ({
    key: r.key,
    market: r.market ?? "all",
    timeframes: Array.isArray(r.timeframes) ? r.timeframes : [],
    weight: num(r.weight, 1),
  }));
}

/** Candles: prefer rows already stored in the candles table, else fetch. */
async function candleSource(symbol: string, timeframe: string, max = 600): Promise<Row[]> {
  const stored = await many<Row>(
    `SELECT t, o, h, l, c, v FROM candles WHERE symbol = $1 AND timeframe = $2 ORDER BY t ASC LIMIT $3`,
    [symbol, timeframe, max]
  );
  if (stored.length >= 50) return stored;
  const fetched = await getCandles(symbol, timeframe, "demo", false).catch(() => [] as Row[]);
  return (fetched ?? []).slice(-max);
}

function analyzeWindow(candles: Row[], upto: number, tf: string, strategies: StrategyRow[]) {
  const window = candles.slice(0, upto + 1);
  const tfs: TfView[] = [analyzeTimeframe(window as any, tf)];
  const lastTf = tfs[tfs.length - 1];
  const votes: { key: string; direction: "long" | "short" | "neutral"; confidence: number; weight: number }[] = [];
  for (const st of strategies) {
    if (st.market !== "all") continue; // backtest windows are un-pinned to a market type
    const res = evaluateStrategy(st.key, tfs, lastTf);
    if (res.direction === "neutral") continue;
    votes.push({ key: st.key, direction: res.direction, confidence: res.confidence, weight: st.weight });
  }
  return { tfs, lastTf, votes, decision: votes.length >= 3 ? computeDecision(tfs, votes) : null };
}

// ─── backtest ────────────────────────────────────────────────────────────────

export async function runBacktest(symbol: string, timeframe: string, exchange?: string) {
  const sym = clean(symbol, 30).toUpperCase();
  const tf = BACKTEST_TFS.includes(timeframe) ? timeframe : "1h";
  const settings = await getSettings();
  const strategies = await activeStrategies();
  if (strategies.length === 0) throw new Error("استراتژی فعالی وجود ندارد");
  const candles = await candleSource(sym, tf);
  if (candles.length < 50) throw new Error(`داده کافی برای ${sym} ${tf} نیست (نیاز: حداقل ۵۰ کندل)`);

  const minScore = num(settings["risk.minScore"], 80);
  const minConf = num(settings["risk.minConfidence"], 0.5);
  const minRR = num(settings["risk.minRR"], 1.2);
  const feePct = num((settings as any)["engine.feePct"] ?? 0.1, 0.1);
  const slip = num((settings as any)["engine.slippagePct"] ?? 0.05, 0.05) / 100;
  const feeFrac = feePct / 100;

  const trades: Row[] = [];
  let i = 45;
  while (i < candles.length - 2) {
    const { lastTf, votes, decision } = analyzeWindow(candles, i, tf, strategies);
    if (!decision) { i++; continue; }
    const dir = decision.direction;
    if (dir === "neutral" || decision.conflict || decision.score < minScore ||
        (decision.longShare < minConf && decision.shortShare < minConf)) {
      i++;
      continue;
    }
    const price = num(lastTf.last);
    if (!Number.isFinite(price) || price <= 0) { i++; continue; }
    const sl = dir === "long" ? lastTf.sr.support : lastTf.sr.resistance;
    const tp = dir === "long" ? lastTf.sr.resistance : lastTf.sr.support;
    const riskDist = Math.abs(price - sl);
    if (riskDist < price * 0.0015) { i++; continue; }
    const rr = Math.abs(tp - price) / riskDist;
    if (rr < minRR) { i++; continue; }

    const entry = dir === "long" ? price * (1 + slip) : price * (1 - slip);
    let outcome: "win" | "loss" = "loss";
    let exit = sl;
    let k = i + 1;
    for (; k < candles.length; k++) {
      const h = num(candles[k].h);
      const l = num(candles[k].l);
      if (dir === "long") {
        if (l <= sl) { exit = sl; break; }
        if (h >= tp) { exit = tp; outcome = "win"; break; }
      } else {
        if (h >= sl) { exit = sl; break; }
        if (l <= tp) { exit = tp; outcome = "win"; break; }
      }
    }
    if (k >= candles.length) break; // unresolved inside data window
    const exitFill = dir === "long" ? exit * (1 - slip) : exit * (1 + slip);
    const rrReal = dir === "long" ? (exitFill - entry) / Math.max(1e-9, entry - sl) : (entry - exitFill) / Math.max(1e-9, sl - entry);
    const pnlPct = ((dir === "long" ? exitFill - entry : entry - exitFill) / entry) * 100 - feeFrac * 2;
    trades.push({
      symbol: sym,
      timeframe: tf,
      exchange: exchange ?? (sym.endsWith("USDT") ? "binance" : "yahoo"),
      side: dir,
      entry: round(entry, 6),
      sl: round(sl, 6),
      tp: round(tp, 6),
      exit: round(exitFill, 6),
      outcome,
      rr: round(rrReal, 2),
      pnlPct: round(pnlPct, 4),
      score: decision.score,
      confidence: round(Math.max(decision.longShare, decision.shortShare), 3),
      strategies: (dir === "long" ? decision.longs : decision.shorts).slice(0, 4),
      createdAt: num(candles[i].t),
    });
    i = k;
  }

  const wins = trades.filter((t) => t.outcome === "win");
  const losses = trades.filter((t) => t.outcome === "loss");
  const grossW = wins.reduce((s, t) => s + Math.abs(num(t.pnlPct)), 0);
  const grossL = losses.reduce((s, t) => s + Math.abs(num(t.pnlPct)), 0);
  const byStrat = new Map<string, { trades: number; wins: number }>();
  for (const t of trades) {
    for (const sk of (t.strategies as string[]) ?? []) {
      const e = byStrat.get(sk) ?? { trades: 0, wins: 0 };
      e.trades++;
      if (t.outcome === "win") e.wins++;
      byStrat.set(sk, e);
    }
  }
  const bestStrategies = [...byStrat.entries()]
    .map(([key, e]) => ({ key, trades: e.trades, winRate: e.trades ? round((e.wins / e.trades) * 100, 1) : 0 }))
    .filter((e) => e.trades >= 2)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 5);

  const pnlPcts = trades.map((t) => num(t.pnlPct));
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  for (const p of pnlPcts) {
    equity += p;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }
  const mean = pnlPcts.length ? pnlPcts.reduce((a, b) => a + b, 0) / pnlPcts.length : 0;
  const variance = pnlPcts.length > 1 ? pnlPcts.reduce((a, b) => a + (b - mean) ** 2, 0) / (pnlPcts.length - 1) : 0;
  const sharpe = variance > 0 ? round(mean / Math.sqrt(variance), 2) : 0;

  await logEngine("INFO", `backtest ${sym} ${tf} done: trades=${trades.length}`, { winRate: trades.length ? Math.round((wins.length / trades.length) * 100) : 0 }, "api");
  return {
    symbol: sym,
    timeframe: tf,
    windows: candles.length,
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round((wins.length / trades.length) * 100, 2) : 0,
    profitFactor: grossL > 0 ? round(grossW / grossL, 2) : grossW > 0 ? Infinity : 0,
    avgRr: trades.length ? round(trades.reduce((s, t) => s + num(t.rr), 0) / trades.length, 2) : 0,
    avgPnlPct: trades.length ? round(trades.reduce((s, t) => s + num(t.pnlPct), 0) / trades.length, 4) : 0,
    maxDrawdownPct: round(maxDD, 2),
    sharpe,
    bestTradePct: round(pnlPcts.length ? Math.max(...pnlPcts) : 0, 2),
    worstTradePct: round(pnlPcts.length ? Math.min(...pnlPcts) : 0, 2),
    bestStrategies,
    tradeList: trades.slice(-40),
  };
}

// ─── tuner ───────────────────────────────────────────────────────────────────

export async function runTuner() {
  const strategies = await activeStrategies();
  if (strategies.length === 0) throw new Error("استراتژی فعالی وجود ندارد");
  // windows: one 1h series per top crypto symbol with stored candles
  const symbols = (await many<Row>(
    `SELECT DISTINCT symbol FROM candles WHERE timeframe = '1h' AND symbol LIKE '%USDT'
     ORDER BY symbol LIMIT 8`
  )).map((r) => r.symbol);
  const windows: Array<{ symbol: string; candles: Row[] }> = [];
  for (const sym of symbols) {
    const candles = await candleSource(sym, "1h", 300);
    if (candles.length >= 60) windows.push({ symbol: sym, candles });
  }
  if (windows.length === 0) throw new Error("کندل ذخیرهشدهای برای تونر نیست — ابتدا موتور را اجرا کنید");

  const grid: Array<{ minScore: number; minConf: number }> = [];
  for (const minScore of [30, 45, 60, 70]) {
    for (const minConf of [0.35, 0.45, 0.55]) grid.push({ minScore, minConf });
  }

  const results: Row[] = [];
  for (const combo of grid) {
    const agg = { trades: 0, wins: 0, pnlSum: 0, pnlSq: 0, grossW: 0, grossL: 0, maxDD: 0 };
    let equity = 0;
    let peak = 0;
    for (const w of windows) {
      const candles = w.candles;
      let i = 45;
      while (i < candles.length - 2) {
        const { lastTf, votes, decision } = analyzeWindow(candles, i, "1h", strategies);
        if (!decision) { i++; continue; }
        const dir = decision.direction;
        if (dir === "neutral" || decision.conflict || decision.score < combo.minScore ||
            (decision.longShare < combo.minConf && decision.shortShare < combo.minConf)) {
          i++;
          continue;
        }
        const price = num(lastTf.last);
        if (!Number.isFinite(price) || price <= 0) { i++; continue; }
        const sl = dir === "long" ? lastTf.sr.support : lastTf.sr.resistance;
        const tp = dir === "long" ? lastTf.sr.resistance : lastTf.sr.support;
        const riskDist = Math.abs(price - sl);
        if (riskDist < price * 0.0015) { i++; continue; }
        const rr = Math.abs(tp - price) / riskDist;
        if (rr < 1.0) { i++; continue; }
        let outcome: "win" | "loss" = "loss";
        let exit = sl;
        let k = i + 1;
        for (; k < candles.length; k++) {
          const h = num(candles[k].h);
          const l = num(candles[k].l);
          if (dir === "long") {
            if (l <= sl) { exit = sl; break; }
            if (h >= tp) { exit = tp; outcome = "win"; break; }
          } else {
            if (h >= sl) { exit = sl; break; }
            if (l <= tp) { exit = tp; outcome = "win"; break; }
          }
        }
        if (k >= candles.length) break;
        const pnlPct = ((dir === "long" ? exit - price : price - exit) / price) * 100 - 0.2;
        agg.trades++;
        if (outcome === "win") { agg.wins++; agg.grossW += Math.abs(pnlPct); }
        else agg.grossL += Math.abs(pnlPct);
        agg.pnlSum += pnlPct;
        agg.pnlSq += pnlPct * pnlPct;
        equity += pnlPct;
        if (equity > peak) peak = equity;
        const dd = peak - equity;
        if (dd > agg.maxDD) agg.maxDD = dd;
        i = k;
      }
    }
    if (agg.trades === 0) continue;
    const winRate = (agg.wins / agg.trades) * 100;
    const avgPnl = agg.pnlSum / agg.trades;
    const variance = agg.trades > 1 ? (agg.pnlSq - (agg.pnlSum * agg.pnlSum) / agg.trades) / (agg.trades - 1) : 0;
    const sharpe = variance > 0 ? avgPnl / Math.sqrt(variance) : 0;
    const score = avgPnl * Math.log1p(agg.trades) - 0.4 * agg.maxDD;
    results.push({
      params: { "risk.minScore": combo.minScore, "risk.minConfidence": combo.minConf },
      trades: agg.trades,
      winRate: round(winRate, 1),
      avgPnlPct: round(avgPnl, 3),
      profitFactor: agg.grossL > 0 ? round(agg.grossW / agg.grossL, 2) : agg.grossW > 0 ? 99 : 0,
      sharpe: round(sharpe, 2),
      maxDrawdownPct: round(agg.maxDD, 2),
      score: round(score, 2),
    });
  }
  results.sort((a, b) => num(b.score) - num(a.score));
  return {
    windows: windows.length,
    symbols: windows.map((w) => w.symbol),
    combos: grid.length,
    results: results.slice(0, 8),
    best: results[0] ?? null,
  };
}

// ─── manual open ─────────────────────────────────────────────────────────────

export async function manualOpen(symbol: string, side?: "long" | "short", note?: string) {
  const sym = clean(symbol, 30).toUpperCase();
  const settings = await getSettings();
  const mode = settings["engine.mode"] === "live" ? "live" : "demo";
  if (settings["engine.emergencyStop"]) throw new Error("موتور در حالت توقف اضطراری است — ابتدا ریست کنید");
  const market = await one<Row>("SELECT * FROM markets WHERE symbol = $1", [sym]);
  if (!market) throw new Error(`نماد پیدا نشد: ${sym}`);
  const existing = await one<Row>("SELECT id FROM open_positions WHERE symbol = $1", [sym]);
  if (existing) throw new Error(`یک پوزیشن روی ${sym} باز است — ابتدا آن را ببندید`);

  const strategies = await activeStrategies();
  if (strategies.length === 0) throw new Error("استراتژی فعالی وجود ندارد");

  // real candles: prefer fresh 15m, fall back to 1h
  let tf = "15m";
  let candles: Row[] = [];
  for (const candidateTf of ["15m", "1h"]) {
    const rows = await many<Row>(
      `SELECT t, o, h, l, c, v FROM candles WHERE symbol = $1 AND timeframe = $2 ORDER BY t ASC`,
      [sym, candidateTf]
    );
    const freshest = rows[rows.length - 1];
    const fresh = freshest && now() - Number(freshest.t) < 60 * 60000;
    if (rows.length >= 30 && fresh) {
      tf = candidateTf;
      candles = rows.slice(-240);
      break;
    }
  }
  if (candles.length < 30) {
    // try live fetch
    const fetched = await getCandles(sym, tf, mode, false).catch(() => [] as Row[]);
    candles = (fetched ?? []).slice(-240);
    if (candles.length < 30) throw new Error("داده کندل کافی برای این نماد نیست — فید زنده دریافت نشد؛ دوباره تلاش کنید");
  }

  // live ticker entry (never a stale/demo price)
  const tick = await fetchTicker(sym).catch(() => null);
  const price = Number(tick?.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`تیکر زندهٔ معتبری برای ${sym} در دسترس نیست — پوزیشن باز نشد`);

  const tfs: TfView[] = [analyzeTimeframe(candles as any, tf)];
  const lastTf = tfs[tfs.length - 1];
  const votes: { key: string; direction: "long" | "short" | "neutral"; confidence: number; weight: number }[] = [];
  for (const st of strategies) {
    if (st.market !== "all" && st.market !== market.market) continue;
    const res = evaluateStrategy(st.key, tfs, lastTf);
    if (res.direction === "neutral") continue;
    votes.push({ key: st.key, direction: res.direction, confidence: res.confidence, weight: st.weight });
  }
  const decision = votes.length >= 3 ? computeDecision(tfs, votes) : null;
  if (!decision) throw new Error("تعداد استراتژیهای همسو برای تحلیل کافی نیست");

  let dir = decision.direction;
  if (side === "long" || side === "short") dir = side;
  if (!dir || dir === "neutral") throw new Error("جهت معتبری از تحلیل به دست نیامد — side صریح بفرستید");

  const sl0 = dir === "long" ? lastTf.sr.support : lastTf.sr.resistance;
  const tp0 = dir === "long" ? lastTf.sr.resistance : lastTf.sr.support;
  const riskDist = Math.abs(price - sl0);
  if (riskDist < price * 0.0015) throw new Error("حد ضرر خیلی به قیمت ورود نزدیک است (کمتر از ۰٫۱۵٪) — پوزیشن باز نشد");
  const roundedSl = round(sl0, num(market.digits, 4));
  const roundedTp = round(tp0, num(market.digits, 4));
  const levelEpsilon = Math.max(price * 1e-6, 1e-12);
  if (Math.abs(roundedSl - price) < levelEpsilon || Math.abs(roundedTp - price) < levelEpsilon) throw new Error("قیمت خروج با قیمت ورود برابر است — پوزیشن باز نشد");
  if ((dir === "long" && (roundedSl >= price || roundedTp <= price)) ||
      (dir === "short" && (roundedSl <= price || roundedTp >= price))) throw new Error("جهت حد ضرر/هدف با سمت پوزیشن سازگار نیست");
  const rr = Math.abs(roundedTp - price) / Math.abs(price - roundedSl);
  const liq = dir === "long" ? price - riskDist * 3 : price + riskDist * 3;

  const capital = num(settings["engine.virtualCapital"], 1000);
  const riskAmt = capital * num(settings["risk.riskPerTrade"], 1.5) / 100;
  const rawSize = (riskAmt / riskDist) * price;
  const size = round(Math.max(0, Math.min(rawSize, capital * num(settings["engine.capitalAllocation"], 30) / 100, capital * num(settings["risk.maxSymbolExposure"], 25) / 100)), 8);
  const leverage = Math.min(num(settings["risk.maxLeverage"], 10), Math.max(1, Math.round(1 / Math.max(0.02, (riskDist / price) * 10))));
  const qty = round(size / price, 6);
  if (qty <= 0) throw new Error("حجم پوزیشن صفر است — ریسک/سرمایه را بررسی کنید");

  let pos: Row;
  try {
    pos = await tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`pos:${sym}`]);
      const dup = await c.query("SELECT id FROM open_positions WHERE symbol = $1", [sym]);
      if (dup.rows.length > 0) throw new Error("duplicate_symbol");
      const p = await insertPositionOrThrow(c, {
        symbol: sym,
        market: market.market,
        side: dir,
        entry: price,
        quantity: qty,
        size,
        leverage,
        margin: round(size / leverage, 8),
        score: decision.score,
        confidence: Math.max(decision.longShare, decision.shortShare),
        strategyKeys: (dir === "long" ? decision.longs : decision.shorts).slice(0, 5),
        stopLoss: roundedSl,
        takeProfit: roundedTp,
        liquidation: round(liq, num(market.digits, 4)),
        targets: [roundedTp],
        expectedExit: roundedTp,
        expectedProfit: round((dir === "long" ? roundedTp - price : price - roundedTp) * qty, 8),
        expectedDuration: 240,
        openTime: now(),
        mode,
        source: "manual",
        type: market.type ?? "futures",
        network: market.network ?? null,
      });
      await c.query(
        `INSERT INTO trade_analysis (position_id, symbol, side, structure, trend, momentum, support, resistance, entry, stop_loss, take_profit, targets, rr, confidence, position_size, margin, leverage, entry_reason_fa, entry_reason_en, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          p.id, sym, dir, lastTf.structure, lastTf.trend, lastTf.momentum,
          roundedSl, roundedTp, price, roundedSl, roundedTp, [roundedTp], rr,
          Math.max(decision.longShare, decision.shortShare), size, round(size / leverage, 8), leverage,
          `باز شدن دستی توسط مدیر${note ? ` — ${note.slice(0, 180)}` : ""}`,
          `Manual open by admin${note ? ` — ${note.slice(0, 180)}` : ""}`,
          now(),
        ]
      );
      return p;
    });
  } catch (e: any) {
    if (e.message === "duplicate_symbol") throw new Error(`یک پوزیشن روی ${sym} باز است — ابتدا آن را ببندید`);
    throw e;
  }
  await logEngine("TRADE", `MANUAL OPEN ${sym} ${dir} @ ${price} score=${decision.score}`, { source: "manual", actor: "admin" }, "engine");
  return pos;
}

// ─── research (AI snapshot) ──────────────────────────────────────────────────

export async function runResearch() {
  const top = await many<Row>(
    `SELECT symbol, name_en, name_fa, market, last_price, change_24h FROM markets WHERE enabled = true AND last_price > 0 ORDER BY priority ASC, symbol ASC LIMIT 5`
  );
  if (top.length === 0) throw new Error("بازاری فعال/دارای قیمت نیست");
  const lines = top.map((m) => `${m.symbol} (${m.market}) @ ${num(m.last_price)} ${m.change_24h != null ? `chg ${num(m.change_24h)}%` : ""}`).join("; ");
  const out = await aiAskJson<{
    summaryFa: string; summaryEn: string; riskNoteFa: string;
    perSymbol: Array<{ symbol: string; outlook: string; bias: "bullish" | "bearish" | "neutral" }>;
  }>(
    "research",
    "You are the WOLF AI research analyst. Give a compact fundamental + sentiment + technical snapshot of the listed markets. Respond ONLY with JSON: {summaryFa (2-3 Persian sentences), summaryEn, riskNoteFa, perSymbol:[{symbol,outlook (1 sentence),bias}]}.",
    `Markets: ${lines}`,
    null as any,
  );
  const result = out ?? {
    summaryFa: `تحلیل سریع ${top.length} بازار بالای لیست — برای جزئیات، هوش مصنوعی را پیکربندی کنید.`,
    summaryEn: `Quick snapshot of the top ${top.length} markets — configure AI for details.`,
    riskNoteFa: "این تحلیل آموزشی است و توصیه مالی نیست.",
    perSymbol: top.map((m) => ({ symbol: m.symbol, outlook: "—", bias: "neutral" })),
  };
  await pool.query(
    `INSERT INTO ai_analysis (kind, key, provider, model, prompt, text, status) VALUES ('research', $1, $2, $3, $4, $5, 'done')`,
    [`research:${now()}`, "snapshot", "local", lines, JSON.stringify(result)]
  );
  return { ...result, markets: top.map((m) => m.symbol) };
}