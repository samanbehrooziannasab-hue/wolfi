// ---------------------------------------------------------------------------
// Strategies API: seeding, listing, enable/disable, weight & params editing.
// The engine reads this registry and evaluates each enabled strategy.
// ---------------------------------------------------------------------------
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { STRATEGY_SEEDS, FAMILY_META, CAT_FA } from "./strategyData";
import { getStrategyPreset, STRATEGY_PRESETS } from "./strategyPresets";
import { getSetting, setSetting } from "./settings";
import { requireAdmin } from "./wolfAuth";

export type StrategyRow = {
  _id: string;
  key: string;
  name: string;
  nameFa: string;
  category: string;
  categoryFa: string;
  descriptionFa: string;
  descriptionEn: string;
  market: string;
  timeframes: string[];
  entryRules: string[];
  exitRules: string[];
  slRules: string[];
  tpRules: string[];
  rr: number;
  params: Record<string, number>;
  enabled: boolean;
  weight: number;
  baselineScore: number;
  confidence: number;
  version: string;
  engineEnabled: boolean;
  overlay: string[];
  source: string;
};

export function buildStrategyDoc(seed: (typeof STRATEGY_SEEDS)[number]): any {
  const [family, key, nameEn, nameFa, category, market, tfStr, weight] = seed;
  const meta = FAMILY_META[family] ?? { fa: "استراتژی", overlay: [], rr: 2 };
  const tfs = tfStr.split(",");
  return {
    key,
    name: nameEn,
    nameFa,
    category,
    categoryFa: CAT_FA[category] ?? category,
    descriptionFa: `${meta.fa} — ${nameFa}`,
    descriptionEn: nameEn,
    market,
    timeframes: tfs,
    entryRules: [meta.fa, `چارچوب: ${tfs.join(" / ")}`],
    exitRules: [
      "خروج با شکست ساختار مخالف یا رسیدن به هدف",
      "خروج با از دست رفتن اعتبار سیگنال در تحلیل مجدد",
    ],
    slRules: ["حد ضرر پشت ساختار/ناحیه ورود"],
    tpRules: [`نسبت ریسک به ریوارد هدف: 1:${meta.rr}`, "TP1 تا TP3 پلکانی"],
    rr: meta.rr,
    params: {
      period: family.startsWith("trend_") ? 20 : 14,
      threshold: 50,
      atrMult: 1.5,
    },
    enabled: true,
    weight,
    baselineScore: 70 + Math.round(weight * 20),
    confidence: 0.6 + weight * 0.2,
    version: "1.0.0",
    engineEnabled: true,
    overlay: meta.overlay,
    source: "wolf-core",
    family,
  };
}

/**
 * Seeds the strategies table on first run AND self-heals deployments whose
 * registry was seeded by an older build (rows missing `family`, or missing
 * seed rows entirely). Without `family` the deterministic evaluator cannot
 * run, so the engine would silently see ZERO strategies — which looks exactly
 * like "presets don't do anything". Runs on every login; idempotent.
 */
export async function ensureStrategies(ctx: any): Promise<void> {
  const rows = await ctx.db.query("strategies").collect();
  const byKey = new Map<string, any>(rows.map((r: any) => [r.key, r]));
  let changed = 0;
  for (const seed of STRATEGY_SEEDS) {
    const doc = buildStrategyDoc(seed);
    const existing = byKey.get(seed[1]);
    if (!existing) {
      await ctx.db.insert("strategies", doc);
      changed++;
      continue;
    }
    // Repair rows from older builds: missing family/evaluator mapping is the
    // main silent breaker; also normalize the enable flags so presets always
    // have a real boolean to flip.
    const patch: Record<string, any> = {};
    if (!existing.family) patch.family = doc.family;
    if (typeof existing.enabled !== "boolean") patch.enabled = true;
    if (typeof existing.engineEnabled !== "boolean") patch.engineEnabled = true;
    if (typeof existing.weight !== "number") patch.weight = doc.weight;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, patch);
      changed++;
    }
  }
  void changed;
}

export const listStrategies = query({
  args: { category: v.optional(v.string()), enabledOnly: v.optional(v.boolean()) },
  handler: async (ctx, { category, enabledOnly }) => {
    const rows = await ctx.db.query("strategies").collect();
    return rows
      .filter((r) => (category ? r.category === category : true))
      .filter((r) => (enabledOnly ? r.enabled : true))
      .sort((a, b) => a.category.localeCompare(b.category) || b.weight - a.weight);
  },
});

export const toggleStrategy = mutation({
  args: {
    token: v.string(),
    key: v.string(),
    enabled: v.optional(v.boolean()),
    engineEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, { token, key, enabled, engineEnabled }) => {
    await requireAdmin(ctx, token);
    const row = await ctx.db
      .query("strategies")
      .filter((q) => q.eq(q.field("key"), key))
      .first();
    if (!row) throw new Error("strategy_not_found");
    await ctx.db.patch(row._id, {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(engineEnabled !== undefined ? { engineEnabled } : {}),
    });
  },
});

export const setStrategyConfig = mutation({
  args: {
    token: v.string(),
    key: v.string(),
    weight: v.optional(v.number()),
    rr: v.optional(v.number()),
    enabled: v.optional(v.boolean()),
    engineEnabled: v.optional(v.boolean()),
    params: v.optional(v.record(v.string(), v.number())),
  },
  handler: async (ctx, { token, key, weight, rr, enabled, engineEnabled, params }) => {
    await requireAdmin(ctx, token);
    const row = await ctx.db
      .query("strategies")
      .filter((q) => q.eq(q.field("key"), key))
      .first();
    if (!row) throw new Error("strategy_not_found");
    await ctx.db.patch(row._id, {
      ...(weight !== undefined ? { weight } : {}),
      ...(rr !== undefined ? { rr } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(engineEnabled !== undefined ? { engineEnabled } : {}),
      ...(params !== undefined ? { params } : {}),
    });
  },
});

export const strategyStats = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("strategies").collect();
    const total = rows.length;
    const enabled = rows.filter((r) => r.enabled).length;
    const engineEnabled = rows.filter((r) => r.engineEnabled).length;
    const byCategory: Record<string, number> = {};
    for (const r of rows) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    return { total, enabled, engineEnabled, byCategory };
  },
});

/**
 * Lists the 10 default strategy presets with their current match counts so
 * the admin panel can render one-click preset chips.
 */
export const listStrategyPresets = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("strategies").collect();
    const enabledKeys = new Set(rows.filter((r) => r.enabled && r.engineEnabled).map((r) => r.key));
    const byKey = new Map(rows.map((r) => [r.key, r]));
    // The preset id last applied ("all"/"none" are transient states).
    const currentPreset = String((await getSetting(ctx, "engine.strategyPreset")) ?? "") || "";
    const presets = STRATEGY_PRESETS.map((p) => {
      const matched = p.keys.filter((k) => byKey.has(k));
      const active = matched.filter((k) => enabledKeys.has(k)).length;
      return {
        id: p.id,
        icon: p.icon,
        nameFa: p.nameFa,
        nameEn: p.nameEn,
        descriptionFa: p.descriptionFa,
        descriptionEn: p.descriptionEn,
        market: p.market ?? "all",
        recommended: Boolean(p.recommended),
        strategyCount: matched.length,
        activeCount: active,
        isActive: active === matched.length && active > 0,
      };
    });
    return { presets, current: currentPreset, total: rows.length };
  },
});

/**
 * Applies a strategy preset (or "all" / "none") to the whole registry and
 * writes its bounded risk settings. Individual strategies stay manually
 * toggleable afterwards — the preset is a starting state, not a lock.
 */
export const applyStrategyPreset = mutation({
  args: { token: v.string(), presetId: v.string() },
  handler: async (ctx, { token, presetId }) => {
    await requireAdmin(ctx, token);
    const id = String(presetId ?? "").trim().toLowerCase();
    // Never apply to an empty registry — seed it first so presets actually work
    // on deployments where the registry was missing.
    let rows = await ctx.db.query("strategies").collect();
    if (rows.length === 0) {
      await ensureStrategies(ctx);
      rows = await ctx.db.query("strategies").collect();
    }
    let enabled: boolean;
    let keys: string[] = [];
    let risk: Record<string, any> = {};
    if (id === "all") {
      enabled = true;
    } else if (id === "none") {
      enabled = false;
    } else {
      const preset = getStrategyPreset(id);
      if (!preset) throw new Error(`preset_not_found:${STRATEGY_PRESETS.map((p) => p.id).join(",")}`);
      enabled = true;
      keys = preset.keys;
      risk = preset.risk;
    }
    let changed = 0;
    for (const row of rows) {
      const on = enabled && (keys.length === 0 || keys.includes(row.key));
      const cur = Boolean(row.enabled) && Boolean(row.engineEnabled);
      if (cur !== on) {
        await ctx.db.patch(row._id, { enabled: on, engineEnabled: on });
        changed++;
      }
    }
    for (const [k, val] of Object.entries(risk)) {
      await setSetting(ctx, k, val, "admin:strategy-preset");
    }
    if (id !== "all" && id !== "none") {
      await setSetting(ctx, "engine.strategyPreset", id, "admin:strategy-preset");
    }
    return { ok: true, preset: id, enabled: enabled ? keys.length || rows.length : 0, changed };
  },
});