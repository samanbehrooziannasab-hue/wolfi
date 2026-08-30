// ---------------------------------------------------------------------------
// Dashboard overview — engine command-center telemetry for the web frontend.
// Aggregates engine status, position/signal counts, win-rate and recent logs
// into a single reactive snapshot.
// ---------------------------------------------------------------------------
import { query } from "./_generated/server";
import { getSettingsMap } from "./settings";
import { computePerformanceMetrics, computeRiskMetrics, detectMarketRegime } from "./enginePortfolio";

export const overview = query({
  args: {},
  handler: async (ctx) => {
    // NOTE: this is a read-only query — never write (ensureDefaults inserts
    // settings rows and is only safe from mutations). getSettingsMap already
    // falls back to DEFAULT_SETTINGS for keys that were never seeded.
    const [openPositions, closedPositions, signals, markets, strategies, settings, lessons] =
      await Promise.all([
        ctx.db.query("open_positions").collect(),
        ctx.db.query("closed_positions").order("desc").take(60),
        ctx.db.query("signals").take(100),
        ctx.db.query("markets").collect(),
        ctx.db.query("strategies").collect(),
        getSettingsMap(ctx),
        ctx.db.query("learningHistory").order("desc").take(12),
      ]);

    const marketsEnabled = markets.filter((m) => m.enabled).length;
    const strategiesEnabled = strategies.filter((s) => s.enabled && s.engineEnabled).length;
    const openSignals = signals.filter((s) => s.status === "open").length;

    const closedTotal = closedPositions.length;
    const wins = closedPositions.filter(
      (p) => p.closeReason === "take_profit" || p.profit > 0,
    ).length;
    const losses = closedTotal - wins;
    const realizedPnl = closedPositions.reduce(
      (sum, p) => sum + (typeof p.profit === "number" ? p.profit : 0),
      0,
    );

    const recentLogs = await ctx.db
      .query("engineLogs")
      .order("desc")
      .take(14)
      .then((rows) =>
        rows.map((r) => ({
          level: r.level,
          message: r.message,
          meta: r.meta,
          created: r.created,
        })),
      );

    return {
      engine: {
        status: settings["engine.status"] ?? "ONLINE",
        mode: settings["engine.mode"] ?? "demo",
        enabled: settings["engine.enabled"] ?? true,
        autonomous: settings["engine.autonomous"] ?? true,
        version: settings["engine.version"] ?? "1.0.0",
        lastSignalAt: settings["engine.lastSignalAt"] ?? 0,
        lastScanAt: settings["engine.lastScanAt"] ?? 0,
        heartbeat: settings["engine.heartbeat"] ?? 0,
      },
      positions: {
        open: openPositions.length,
        openPnl: openPositions.reduce((sum, p) => sum + (p.pnl ?? 0), 0),
        sizeExposure: openPositions.reduce((sum, p) => sum + (p.size ?? 0), 0),
        closed: closedTotal,
        wins,
        losses,
        winRate: closedTotal > 0 ? Math.round((wins / closedTotal) * 1000) / 10 : 0,
        realizedPnl,
      },
      markets: {
        total: marketsEnabled,
        forex: markets.filter((m) => m.market === "forex" && m.enabled).length,
        crypto: markets.filter((m) => m.market === "crypto" && m.enabled).length,
      },
      strategies: {
        total: strategies.length,
        enabled: strategiesEnabled,
      },
      signals: {
        open: openSignals,
        recent: signals
          .slice(-6)
          .reverse()
          .map((s) => ({
            symbol: s.symbol,
            direction: s.direction,
            score: s.score,
            confidence: s.confidence,
            price: s.price,
            created: s.created,
          })),
      },
      lessons: lessons.map((l) => ({
        id: l._id,
        symbol: l.symbol,
        timeframe: l.timeframe,
        strategies: l.strategies,
        signal: l.signal,
        decision: l.decision,
        result: l.result,
        pnl: l.pnl,
        aiReview: l.aiReview,
        lessons: l.lessons,
        created: l.created,
      })),
      logs: recentLogs,
      // ── Portfolio Analytics (NautilusTrader-inspired) ────────────────
      portfolio: (() => {
        const capital = Number(settings["engine.capital"] ?? 1000);
        const perfMetrics = computePerformanceMetrics(
          closedPositions.map((p) => ({
            profit: p.profit ?? 0,
            pnlPct: p.pnlPct ?? 0,
            rr: p.score ?? 0,
            score: p.score ?? 0,
            closeTime: p.closeTime ?? 0,
            entry: p.entry ?? 0,
          })),
          capital,
        );
        const riskMetrics = computeRiskMetrics(
          closedPositions.map((p) => ({
            profit: p.profit ?? 0,
            pnlPct: p.pnlPct ?? 0,
            rr: p.score ?? 0,
          })),
          openPositions.map((p) => ({
            side: p.side as "long" | "short",
            entry: p.entry ?? 0,
            current: p.current ?? p.entry ?? 0,
            size: p.size ?? 0,
            leverage: p.leverage ?? 1,
          })),
          capital,
        );
        return {
          performance: perfMetrics,
          risk: riskMetrics,
          capital,
          totalEquity: capital + (openPositions.reduce((s, p) => s + (p.pnl ?? 0), 0)),
          unrealizedPnl: openPositions.reduce((s, p) => s + (p.pnl ?? 0), 0),
          realizedPnl: closedPositions.reduce((s, p) => s + (p.profit ?? 0), 0),
        };
      })(),
    };
  },
});