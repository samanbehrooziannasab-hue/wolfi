import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { getSettingsMap } from "./settings";
import { requireAdmin, requireStaff } from "./wolfAuth";
import { classifyRiskPreset } from "./aiPolicy";
import { effectiveCapital, exchangeScale } from "./capital";

/**
 * The deterministic risk gates remain authoritative. This module only sends
 * a read-only snapshot to the AI layer for explanation. It goes through
 * `aiGenerateRobust`, whose chain always starts with the keyless free base
 * (Pollinations) and then falls back to Gemini → Groq → OpenRouter :free →
 * Cerebras → Mistral → Anthropic, so a quota-exhausted primary provider
 * (e.g. Gemini free tier) never breaks the review.
 */
export const request = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const admin = await requireAdmin(ctx, token);
    const settings = await getSettingsMap(ctx);
    if (settings["ai.enabled"] === false) throw new Error("هوش مصنوعی غیرفعال است");

    const reviewKey = `risk:${admin._id}:${Date.now()}`;
    const provider = String(settings["ai.provider"] ?? "gemini");
    const model = String(settings["ai.model"] ?? "gemini-2.5-flash");
    const key = String(settings["ai.key"] ?? "");
    const freeFallback = !(settings["ai.freeFallback"] === false || settings["ai.freeFallback"] === "false");
    const virtualCapital = Number(settings["risk.virtualCapital"] ?? 1000);
    const realCapital = Number(settings["risk.realCapital"] ?? 100);
    const realizedPnl = Number(settings["engine.realizedPnl"] ?? 0);
    const effective = effectiveCapital(virtualCapital, realizedPnl);
    const scale = exchangeScale(realCapital, effective);
    const values = {
      virtualCapital,
      realCapital,
      realizedPnl,
      effectiveCapital: Number(effective.toFixed(2)),
      exchangeScale: Number(scale.toFixed(4)),
      riskPerTrade: Number(settings["risk.riskPerTrade"] ?? 1.5),
      maxPosition: Number(settings["risk.maxPosition"] ?? 12),
      maxExposure: Number(settings["risk.maxExposure"] ?? 35),
      maxLeverage: Number(settings["risk.maxLeverage"] ?? 20),
      maxDailyLoss: Number(settings["risk.maxDailyLoss"] ?? 8),
      minScore: Math.max(1, Math.min(100, Number(settings["risk.minScore"] ?? 35))),
      minConfidence: Number(settings["risk.minConfidence"] ?? 0.5),
      minConsensus: Number(settings["risk.minConsensus"] ?? 0.55),
      minConfirmations: Number(settings["risk.minConfirmations"] ?? 3),
      minRR: Number(settings["risk.minRR"] ?? 1.2),
    };

    await ctx.db.insert("ai_analysis", {
      kind: "trade_review",
      key: reviewKey,
      provider,
      model,
      text: "",
      status: "running",
      created: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.nodeCalls.aiGenerateRobust, {
      provider,
      model,
      key,
      freeFallback,
      analysisKey: reviewKey,
      system: "You are a conservative risk-management reviewer for a trading engine. Never promise profit, never recommend bypassing a safety gate, and never change settings. Answer in Persian with a short prioritized review.",
      prompt: `Review these risk AND capital settings as an independent explanation only. The engine trades with virtual capital adjusted by realized P&L (effectiveCapital), and in live mode every position size is scaled by exchangeScale (real exchange balance / effective capital) so the engine's $1,000 virtual never risks more than the $X actually on the exchange. Identify unsafe combinations, missing data safeguards, and one or two concrete adjustments. Do not say to disable any safety gate. Settings: ${JSON.stringify(values)}`,
    });
    return { ok: true, key: reviewKey, preset: classifyRiskPreset(Number(values.riskPerTrade)) };
  },
});

export const review = query({
  args: { token: v.string(), key: v.string() },
  handler: async (ctx, { token, key }) => {
    const admin = await requireStaff(ctx, token);
    if (!key.startsWith(`risk:${admin._id}:`)) throw new Error("دسترسی غیرمجاز");
    const rows = await ctx.db
      .query("ai_analysis")
      .withIndex("by_kind", (q: any) => q.eq("kind", "trade_review"))
      .order("desc")
      .take(100);
    const row = rows.find((r: any) => r.key === key);
    return row ? { status: row.status, text: row.text, error: row.error, created: row.created } : null;
  },
});
