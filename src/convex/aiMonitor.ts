// ---------------------------------------------------------------------------
// AI provider monitoring helper (admin).
//
// Queries run on the V8 runtime and CANNOT read process.env — Convex files
// with the "use node" directive may only export actions. So the Node-runtime
// actions in nodeCalls.ts (the AI router + the periodic health probe) snapshot
// which keyed providers have a key configured into the "ai.envStatus" setting
// on every call. This tiny internal query just reads that snapshot back for
// the admin monitoring card — no env access needed here.
// ---------------------------------------------------------------------------
import { internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { AI_PROVIDERS } from "./aiProviders";

/** Which keyed providers have a key (or a self-hosted base) configured. */
export const aiProviderEnvStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const settings: any = await ctx.runQuery(internal.settings.rawSettings, {});
    try {
      const rows = JSON.parse(String(settings["ai.envStatus"] ?? "[]"));
      if (Array.isArray(rows) && rows.length) return rows;
    } catch {
      // fall through to the keyless fallback below
    }
    // Before the first AI call / probe runs, the snapshot doesn't exist yet.
    // Keyless providers need no key, so report them as usable right away.
    return AI_PROVIDERS.filter((p) => p.kind === "keyless").map((p) => ({
      id: p.id,
      kind: p.kind,
      hasKey: true,
      envKeyName: p.envKey ?? "",
      checkedAt: 0,
    }));
  },
});
