// ---------------------------------------------------------------------------
// Server monitoring — admin dashboard (Settings → Server monitor).
// Reads the runtime the deployment actually runs on (Node version, platform,
// uptime, memory, CPU) plus deployment/health settings and bounded database
// row counts. Read-only, admin-guarded.
//
// "use node": process.memoryUsage / cpuUsage / uptime are only available in
// the Node.js runtime of Node actions (they do not exist in the default V8
// isolate), so this action runs with the full Node process API.
// ---------------------------------------------------------------------------
"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

function fmtBytes(b: number): string {
  const mb = b / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export const serverStats = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<any> => {
    await ctx.runQuery(internal.brokerData.assertAdmin, { token });
    const settings: any = await ctx.runQuery(internal.settings.rawSettings, {});
    const counts: Record<string, number> = await ctx.runQuery(internal.engineData.tableCounts, {});
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const now = Date.now();
    return {
      ok: true,
      at: now,
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        uptimeSec: Math.round(process.uptime()),
        memory: {
          rss: fmtBytes(mem.rss),
          heapUsed: fmtBytes(mem.heapUsed),
          heapTotal: fmtBytes(mem.heapTotal),
          external: fmtBytes(mem.external),
        },
        cpu: { userSec: (cpu.user / 1e6).toFixed(2), systemSec: (cpu.system / 1e6).toFixed(2) },
      },
      deployment: {
        convexUrl: String(process.env.CONVEX_URL ?? ""),
        siteUrl: String(settings["system.domain"] ?? ""),
        serverIp: String(settings["system.serverIp"] ?? ""),
        version: String(settings["engine.version"] ?? ""),
        mode: String(settings["engine.mode"] ?? "demo"),
        tradeType: String(settings["engine.tradeType"] ?? "futures"),
        startedAt: Number(settings["engine.startedAt"] ?? 0),
        lastScanAt: Number(settings["engine.lastScanAt"] ?? 0),
        engineEnabled: settings["engine.enabled"] !== false,
        autonomous: settings["engine.autonomous"] !== false,
        emergencyStop: settings["engine.emergencyStop"] === true,
        pauseNewTrades: settings["engine.pauseNewTrades"] === true,
        telegramEnabled: settings["telegram.enabled"] !== false,
        aiEnabled: settings["ai.enabled"] !== false,
        health: {
          tg: String(settings["system.tgHealth"] ?? "—"),
          channel: String(settings["system.channelHealth"] ?? "—"),
          ai: String(settings["system.aiHealth"] ?? "—"),
          exchange: String(settings["system.exchangeHealth"] ?? "—"),
        },
      },
      counts,
    };
  },
});
