// ---------------------------------------------------------------------------
// "use node" — HTTP bridge to third parties:
//   • AI providers (Gemini / OpenAI / Anthropic / OpenRouter) — swappable
//   • Telegram Bot API (send message, membership check, bot info)
//   • Exchange REST probes (balance / connection test)
// API keys are read from process.env when present, otherwise from the
// caller-supplied settings value. Keys never travel to the frontend.
// ---------------------------------------------------------------------------
"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { webhookUrlFor } from "./aiPolicy";
import {
  AI_PROVIDERS,
  AI_PROVIDER_MODELS,
  cleanSecretKey,
  edgeTtsRequestBody,
  normalizeTtsBase,
  orderAttempts,
  parseProviderState,
  randomizeAttempts,
  recordOutcome,
  rotateAttempts,
  serializeProviderState,
} from "./aiProviders";
import type { AiAttempt } from "./aiProviders";

// ─── AI provider interface (swappable) ─────────────────────────────────────
export type AIMessage = { role: "system" | "user"; content: string };

// ─── Image (vision) helpers ────────────────────────────────────────────────
// Chat image upload passes a base64 data URL (data:image/png;base64,…). Each
// provider family receives it in its own format.

function imageMime(image: string): string {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(image);
  return m ? m[1] : "image/png";
}

function imageB64(image: string): string {
  const m = /^data:image\/[a-z0-9.+-]+;base64,(.*)$/is.exec(image);
  return m ? m[1] : image.replace(/^data:.*?base64,/, "");
}

/** OpenAI-compatible content: last user message becomes text + image_url. */
function withImage(messages: AIMessage[], image?: string): any[] {
  if (!image) return messages as any[];
  const out = messages.map((m) => ({ ...m })) as any[];
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === "user") {
      out[i].content = [
        { type: "text", text: String(out[i].content) },
        { type: "image_url", image_url: { url: image } },
      ];
      break;
    }
  }
  return out;
}

/** Providers that need NO API key (they must never throw AI_KEY_NOT_SET).
 * Includes key-optional self-hosted gateways (WebAI-to-API authenticates via
 * browser login, so a key is not mandatory). */
// Self-hosted gateways (kiro/nanobot/apfel/webai) are key-OPTIONAL: they join
// the chain when their base env is set, and their executor skips the
// Authorization header when no key exists. They never throw AI_KEY_NOT_SET.
const KEYLESS_PROVIDER_IDS = new Set([
  "pollinations",
  "llm7",
  "kilo",
  "ovhcloud",
  "webai",
  "kiro",
  "nanobot",
  "apfel",
  "ollama",
  "lmstudio",
]);

async function geminiGenerate(
  model: string,
  key: string,
  messages: AIMessage[],
  image?: string,
): Promise<string> {
  // Normalize model aliases to supported current Gemini models (gemini-3.6-flash, gemini-3.6-pro)
  let cleanModel = model || "gemini-3.6-flash";
  if (
    cleanModel === "gemini-1.5-flash" ||
    cleanModel === "gemini-2.0-flash" ||
    cleanModel === "gemini-2.5-flash" ||
    cleanModel === "gemini-flash" ||
    cleanModel === "gemini-flash-latest" ||
    cleanModel === "models/gemini-1.5-flash" ||
    cleanModel === "models/gemini-2.0-flash" ||
    cleanModel === "models/gemini-2.5-flash" ||
    cleanModel === "models/gemini-3.6-flash"
  ) {
    cleanModel = "gemini-3.6-flash";
  } else if (
    cleanModel === "gemini-1.5-pro" ||
    cleanModel === "gemini-2.0-pro" ||
    cleanModel === "gemini-2.5-pro" ||
    cleanModel === "gemini-pro" ||
    cleanModel === "gemini-pro-latest" ||
    cleanModel === "models/gemini-1.5-pro" ||
    cleanModel === "models/gemini-2.0-pro" ||
    cleanModel === "models/gemini-2.5-pro" ||
    cleanModel === "models/gemini-3.6-pro"
  ) {
    cleanModel = "gemini-3.6-pro";
  }

  const candidateModels = [
    cleanModel,
    "gemini-3.5-flash",
    "gemini-3.5-pro",
  ];
  const modelsToTry = Array.from(new Set(candidateModels));

  let lastError: any = null;
  for (const mName of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mName)}:generateContent`;
      const systemText = messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n");
      const tail = messages.filter((m) => m.role === "user");
      const contents = tail.map((m) =>
        image
          ? {
              role: "user",
              parts: [
                { text: m.content },
                { inline_data: { mime_type: imageMime(image), data: imageB64(image) } },
              ],
            }
          : { role: "user", parts: [{ text: m.content }] },
      );
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction:
            systemText.length > 0
              ? { parts: [{ text: systemText }] }
              : undefined,
          contents,
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
        }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        const msg = data?.error?.message ?? `HTTP ${res.status}`;
        lastError = new Error(`Gemini (${mName}): ${msg}`);
        const low = msg.toLowerCase();
        // If high demand, overloaded, not found, deprecated, no longer available, quota, or temporary error, try next model
        if (
          low.includes("high demand") ||
          low.includes("overloaded") ||
          low.includes("not found") ||
          low.includes("not supported") ||
          low.includes("no longer available") ||
          low.includes("deprecated") ||
          low.includes("update your code") ||
          low.includes("exhausted") ||
          low.includes("quota") ||
          low.includes("rate") ||
          low.includes("limit") ||
          low.includes("billing") ||
          low.includes("503") ||
          low.includes("404") ||
          low.includes("429")
        ) {
          continue;
        }
        throw lastError;
      }
      const text = data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text ?? "")
        .join("");
      if (!text) throw new Error(`Gemini (${mName}): پاسخ خالی`);
      return text;
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message ?? "").toLowerCase();
      if (
        errMsg.includes("high demand") ||
        errMsg.includes("overloaded") ||
        errMsg.includes("not found") ||
        errMsg.includes("not supported") ||
        errMsg.includes("no longer available") ||
        errMsg.includes("deprecated") ||
        errMsg.includes("update your code") ||
        errMsg.includes("exhausted") ||
        errMsg.includes("quota") ||
        errMsg.includes("rate") ||
        errMsg.includes("limit") ||
        errMsg.includes("billing") ||
        errMsg.includes("503") ||
        errMsg.includes("404") ||
        errMsg.includes("429")
      ) {
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error("Gemini: All model fallbacks failed");
}

async function openAiGenerate(
  base: string,
  model: string,
  key: string,
  messages: AIMessage[],
  image?: string,
): Promise<string> {
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages: withImage(messages, image), temperature: 0.4, max_tokens: 2048 }),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
  return data?.choices?.[0]?.message?.content ?? "";
}

/**
 * Truly KEYLESS OpenAI-compatible endpoint: no Authorization header at all
 * (sending an empty "Bearer " makes some gateways answer "Missing
 * Authentication header"). Used for pollinations, llm7.io and Kilo Code.
 */
async function openAiKeylessGenerate(baseUrl: string, model: string, messages: AIMessage[], image?: string): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: withImage(messages, image), temperature: 0.4, max_tokens: 2048 }),
    signal: AbortSignal.timeout(60000),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
  return String(data?.choices?.[0]?.message?.content ?? "");
}

/** Pollinations keyless endpoint with fallback to plain prompt or backup keyless nodes */
async function pollinationsGenerate(model: string, messages: AIMessage[], image?: string): Promise<string> {
  const modelsToTry = [
    model || "mistral",
    "mistral",
    "qwen",
    "openai",
    "searchgpt",
  ];
  let lastErr: any = null;

  for (const m of modelsToTry) {
    try {
      const res = await fetch("https://text.pollinations.ai/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: m, messages: withImage(messages, image), temperature: 0.4, max_tokens: 2048 }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        const text = String(data?.choices?.[0]?.message?.content ?? "");
        if (text.trim().length > 0) return text;
      }
    } catch (e) {
      lastErr = e;
    }
  }

  // Fallback to simple direct text prompt
  try {
    const userPrompt = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(userPrompt)}?model=mistral`, {
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const text = await res.text();
      if (text.trim().length > 0) return text;
    }
  } catch (e) {
    lastErr = e;
  }

  // Keyless backup tier (LLM7 / Kilo) so free requests don't hard crash on Pollinations 402
  try {
    const backupText = await openAiKeylessGenerate("https://api.llm7.io/v1", "mistral-Nemo-Instruct-2407", messages, image);
    if (backupText.trim().length > 0) return backupText;
  } catch {
    // continue to next keyless backup
  }

  try {
    const backupText2 = await openAiKeylessGenerate("https://api.kilo.ai/api/gateway", "openrouter/free", messages, image);
    if (backupText2.trim().length > 0) return backupText2;
  } catch {
    // continue
  }

  throw lastErr ?? new Error("Pollinations: HTTP 402 / all free models exhausted");
}

async function anthropicGenerate(
  model: string,
  key: string,
  messages: AIMessage[],
  image?: string,
): Promise<string> {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content);
  const userMsgs = messages.filter((m) => m.role === "user");
  const bodyMessages = image
    ? userMsgs.map((m) => ({
        role: "user",
        content: [
          { type: "text", text: m.content },
          {
            type: "image",
            source: { type: "base64", media_type: imageMime(image), data: imageB64(image) },
          },
        ],
      }))
    : userMsgs;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: system.join("\n") || undefined,
      messages: bodyMessages,
    }),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
  return data?.content?.map((b: any) => b.text ?? "").join("") ?? "";
}

export const aiGenerate = internalAction({
  args: {
    provider: v.string(),
    model: v.string(),
    system: v.optional(v.string()),
    prompt: v.string(),
    key: v.optional(v.string()),
    analysisKey: v.optional(v.string()),
    analysisSymbol: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const messages: AIMessage[] = [
      ...(args.system ? [{ role: "system" as const, content: args.system }] : []),
      { role: "user", content: args.prompt },
    ];
    // Vision: only accept real base64 data URLs, capped at ~5 MB.
    const image = args.image && args.image.startsWith("data:image/")
      ? args.image.slice(0, 7_000_000)
      : undefined;
    const provider = args.provider || "gemini";
    // Masked/placeholder keys („AIza••••…wxyz“, „sk-****abcd“) are treated as
    // unset so the env-var fallback is used and we never send a garbage or
    // non-ASCII key to a provider (reported: “Incorrect API key AQ.Ab8RN****…”).
    let key = cleanSecretKey(args.key);
    const def = AI_PROVIDERS.find((p) => p.id === provider);
    const envKey = def?.envKey ? String(process.env[def.envKey] ?? "") : "";
    // Env values get the same masking guard — a masked env placeholder must
    // never be sent to a provider either.
    if (envKey) key = cleanSecretKey(envKey) || key;
    // Keyless providers never require a key.
    if (!KEYLESS_PROVIDER_IDS.has(provider) && !key) {
      throw new Error(
        "AI_KEY_NOT_SET — کلید هوش مصنوعی معتبری در تنظیمات ثبت نشده است (یا فقط نسخه‌ی mask شده‌ی آن ذخیره شده). از پنل مدیر یک کلید واقعی وارد کنید.",
      );
    }
    const model = args.model || AI_PROVIDER_MODELS[provider] || "gpt-4o-mini";
    let text: string;
    if (provider === "pollinations") {
      text = await pollinationsGenerate(model, messages, image);
    } else if (provider === "gemini") {
      text = await geminiGenerate(model, key, messages, image);
    } else if (provider === "anthropic") {
      text = await anthropicGenerate(model, key, messages, image);
    } else if (provider === "freeoneapi") {
      // Self-hosted free-one-api gateway (OpenAI-compatible). Base URL comes
      // from the FREE_ONE_API_BASE env var (defaults to the localhost Docker
      // default of the project).
      const base = String(process.env.FREE_ONE_API_BASE ?? "").trim() || "http://127.0.0.1:3000/v1";
      text = await openAiCompose(base, model, key, messages);
    } else if (def?.baseEnv) {
      // Self-hosted OpenAI-compatible gateways (kiro-gateway, nanobot, apfel,
      // WebAI-to-API). Base URL from the env override, else the registry
      // default; key optional — when absent, call without Authorization.
      const base =
        String(process.env[def.baseEnv] ?? "").trim().replace(/\/+$/, "") ||
        def.base ||
        "http://127.0.0.1:8000/v1";
      text = key
        ? await openAiCompose(base, model, key, messages, image)
        : await openAiKeylessGenerate(base, model, messages, image);
    } else if (def?.kind === "keyless") {
      // Keyless OpenAI-compatible tier (llm7, kilo, ovhcloud…): no
      // Authorization header at all.
      text = await openAiKeylessGenerate(def.base ?? "https://api.openai.com/v1", model, messages, image);
    } else {
      // Generic OpenAI-compatible keyed provider (openai, openrouter, groq,
      // cerebras, mistral, nvidia, deepseek, xai, hf, githubmodels, anyapi…).
      text = await openAiCompose(def?.base ?? "https://api.openai.com/v1", model, key, messages, image);
    }
    if (args.analysisKey) {
      await ctx.runMutation(internal.engineWorker.storeAiReview, {
        key: args.analysisKey,
        symbol: args.analysisSymbol,
        provider,
        model: args.model,
        text,
      });
    }
    return { ok: true, text };
  },
});

function openAiCompose(
  base: string,
  model: string,
  key: string,
  messages: AIMessage[],
  image?: string,
): Promise<string> {
  return openAiGenerate(base, model, key, messages, image);
}

// ─── Free / freemium provider chain (OmniRoute-style router) ───────────────
// Keyless tier = pollinations + llm7 + kilo (live-verified, no key, no card) —
// the AI layer NEVER dies even with zero keys. Supplements = providers with
// generous free tiers whose keys come from env vars (Freebuff Keys tab).

/**
 * AI call with quota-aware automatic fallback (OmniRoute-style):
 *   • keyless tier + configured provider + keyed free chain
 *   • last-known-good ordering — the provider that answered most recently
 *     leads the next call (state persisted in `ai.providerState`)
 *   • per-provider exponential cooldown — a provider that just hit a quota,
 *     rate limit or bad key is SKIPPED for a while instead of burning the
 *     whole chain on the same permanent error (invalid key → 15 min,
 *     quota → 5 min, overload → 2 min, network → 45 s, capped at 30 min)
 *   • deadlock valve: when EVERY provider is inside its cooldown window the
 *     keyless tier is still retried (it costs nothing), so the layer never
 *     returns “all providers cooling down” to the user
 *   • the first success is persisted through storeAiReview (same as aiGenerate)
 */
export const aiGenerateRobust = internalAction({
  args: {
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    system: v.optional(v.string()),
    prompt: v.string(),
    key: v.optional(v.string()),
    analysisKey: v.optional(v.string()),
    analysisSymbol: v.optional(v.string()),
    freeFallback: v.optional(v.boolean()),
    random: v.optional(v.boolean()),
    image: v.optional(v.string()),
    /** Internal health probes pass count:false so they don't burn the daily quota readout. */
    count: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const settings: any = await ctx.runQuery(internal.settings.rawSettings, {});
    let state = parseProviderState(String(settings["ai.providerState"] ?? ""));
    // Daily per-provider usage counters for the admin capacity readout:
    // ai.usage.<provider>.<yyyy-mm-dd> = number of requests that succeeded
    // through this chain today (probes excluded via args.count=false).
    const countUsage = args.count !== false;
    const usageDay = new Date(now).toISOString().slice(0, 10);

    // Build the candidate pool: every keyless provider, then the explicitly
    // configured provider, then every keyed free provider with an env key.
    const attempts: AiAttempt[] = [];
    for (const p of AI_PROVIDERS) {
      if (p.kind === "keyless") attempts.push({ provider: p.id, model: AI_PROVIDER_MODELS[p.id] });
    }
    if (args.provider && args.provider !== "pollinations") {
      attempts.push({ provider: args.provider, model: args.model });
    }
    if (args.freeFallback !== false) {
      for (const p of AI_PROVIDERS) {
        if (p.kind !== "keyed") continue;
        const envKey = (process.env[p.envKey ?? ""] ?? "").trim();
        // Self-hosted gateways join the chain when their BASE env is set even
        // without a key (kiro/nanobot/apfel/webai auth locally); all other
        // keyed providers need their key.
        const baseSet = p.baseEnv ? Boolean((process.env[p.baseEnv] ?? "").trim()) : false;
        if (envKey || baseSet) attempts.push({ provider: p.id, model: AI_PROVIDER_MODELS[p.id] });
      }
    }
    const seen = new Set<string>();
    const unique = attempts.filter((a) => (seen.has(a.provider) ? false : (seen.add(a.provider), true)));
    if (unique.length === 0) {
      throw new Error("AI_KEY_NOT_SET — no provider key configured and free fallback has no env keys");
    }

    // Rotation mode (default for user chats): the answer cycles round-robin
    // across the healthy providers — each call starts right AFTER the provider
    // that answered last, so free-tier limits are spread evenly and consecutive
    // answers come from different AIs without asking the user. Random mode
    // shuffles instead; deterministic mode honors the configured provider first.
    let ordered =
      args.random === true
        ? rotateAttempts(unique, state, now)
        : orderAttempts(
            unique,
            state,
            now,
            args.provider && args.provider !== "pollinations" ? args.provider : "pollinations",
          );
    // Deadlock valve: never leave the layer fully locked out. If every
    // provider is cooling down, retry the keyless tier anyway — it is free
    // and costs nothing, and one of them is usually reachable.
    let forceKeyless = false;
    if (ordered.length === 0) {
      forceKeyless = true;
      ordered = unique.filter((a) => {
        const def = AI_PROVIDERS.find((p) => p.id === a.provider);
        return def?.kind === "keyless";
      });
    }
    if (ordered.length === 0) {
      throw new Error("AI_ALL_PROVIDERS_FAILED — no keyless provider registered");
    }

    let lastErr = "no provider attempted";
    let winner: AiAttempt | null = null;
    let winnerText = "";
    for (const attempt of ordered) {
      const st = state[attempt.provider] as
        | { failures?: number; cooldownUntil?: number; lastGoodAt?: number }
        | undefined;
      if (!forceKeyless && (st?.cooldownUntil ?? 0) > now) continue;
      try {
        const r: any = await ctx.runAction(internal.nodeCalls.aiGenerate, {
          provider: attempt.provider,
          model: attempt.model || AI_PROVIDER_MODELS[attempt.provider] || "gemini-3.6-flash",
          system: args.system,
          prompt: args.prompt,
          key: cleanSecretKey(args.key),
          analysisKey: args.analysisKey,
          analysisSymbol: args.analysisSymbol,
          image: args.image,
        });
        if (r?.ok && String(r?.text ?? "").trim().length > 0) {
          state = recordOutcome(state, attempt.provider, true, null, now);
          winner = attempt;
          winnerText = String(r.text);
          break;
        }
        lastErr = String(r?.error ?? "empty response");
        state = recordOutcome(state, attempt.provider, false, lastErr, now);
      } catch (e: any) {
        lastErr = e?.message ?? String(e);
        state = recordOutcome(state, attempt.provider, false, lastErr, now);
        console.warn(`[ai] fallback ${attempt.provider} failed: ${lastErr}`);
      }
    }
    // Persist routing state (cooldowns + last-known-good) so the next call
    // skips downed providers and leads with the one that actually answered.
    // The daily usage counter for the winning provider rides the same write.
    const values: Record<string, string> = { "ai.providerState": serializeProviderState(state) };
    if (winner && countUsage) {
      const usageKey = `ai.usage.${winner.provider}.${usageDay}`;
      values[usageKey] = String((Number(settings[usageKey] ?? 0) || 0) + 1);
    }
    // Snapshot env-key presence for the admin monitoring card (queries cannot
    // read process.env, so this Node action refreshes it on every call).
    try {
      const envRows = (await ctx.runAction(internal.nodeCalls.aiProviderEnvStatus, {})) as any[];
      if (Array.isArray(envRows) && envRows.length) values["ai.envStatus"] = JSON.stringify(envRows);
    } catch {
      // never let the snapshot break the AI call
    }
    await ctx.runMutation(internal.settings.writeSettings, { values });
    if (winner) return { ok: true, provider: winner.provider, text: winnerText };
    throw new Error(`AI_ALL_PROVIDERS_FAILED — ${lastErr}`);
  },
});

/**
 * Periodic AI health probe (cron every `ai.rotationMinutes`). Exercises the
 * whole robust chain with a tiny prompt and records which provider actually
 * answered, so the AI layer stays alive and the admin sees live health.
 */
export const aiHealthProbe = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const settings: any = await ctx.runQuery(internal.settings.rawSettings, {});
      const minutes = Math.max(1, Number(settings["ai.rotationMinutes"] ?? 5) || 5);
      const due = await ctx.runMutation(internal.settings.tickCron, { lastKey: "ai.lastHealthAt", minutes });
      if (!due) return { ok: true, skipped: true };
      const provider = String(settings["ai.provider"] ?? "gemini");
      const model = String(settings["ai.model"] ?? "gemini-3.6-flash");
      const key = String(settings["ai.key"] ?? "");
      const freeFallback = !(settings["ai.freeFallback"] === false || settings["ai.freeFallback"] === "false");
      const started = Date.now();
      const r: any = await ctx.runAction(internal.nodeCalls.aiGenerateRobust, {
        provider,
        model,
        key,
        freeFallback,
        system: "You are a connectivity probe. Reply with exactly: OK",
        prompt: "Reply with exactly: OK",
        count: false,
      });
      const ms = Date.now() - started;
      let envStatus = null as any;
      try {
        envStatus = await ctx.runAction(internal.nodeCalls.aiProviderEnvStatus, {});
      } catch {
        // env snapshot is best-effort; never fail the probe over it
      }
      await ctx.runMutation(internal.settings.writeSettings, {
        values: {
          "ai.healthStatus": r?.ok ? "ok" : "degraded",
          "ai.healthProvider": String(r?.provider ?? provider),
          "ai.healthAt": Date.now(),
          "ai.healthMessage": r?.ok ? `OK in ${ms}ms` : "chain degraded",
          ...(Array.isArray(envStatus) && envStatus.length ? { "ai.envStatus": JSON.stringify(envStatus) } : {}),
        },
      });
      return { ok: Boolean(r?.ok), provider: r?.provider ?? null, ms };
    } catch (e: any) {
      await ctx.runMutation(internal.settings.writeSettings, {
        values: {
          "ai.healthStatus": "error",
          "ai.healthProvider": "",
          "ai.healthAt": Date.now(),
          "ai.healthMessage": String(e?.message ?? e).slice(0, 200),
        },
      });
      return { ok: false, error: String(e?.message ?? e).slice(0, 200) };
    }
  },
});

/**
 * Env-only provider status (Node runtime): which keyed providers have a key
 * (or a self-hosted base) configured. Used by the admin AI monitoring card.
 * Never exposes the key itself — only a boolean. Must be an ACTION because
 * node files can only export actions.
 */
export const aiProviderEnvStatus = internalAction({
  args: {},
  handler: async () => {
    const now = Date.now();
    return AI_PROVIDERS.map((p) => {
      const envKey = p.envKey ? cleanSecretKey(process.env[p.envKey]) : "";
      const baseSet = p.baseEnv ? Boolean(String(process.env[p.baseEnv] ?? "").trim()) : false;
      return {
        id: p.id,
        kind: p.kind,
        hasKey: p.kind === "keyless" ? true : Boolean(envKey) || baseSet,
        envKeyName: p.envKey ?? "",
      };
    }).map((r) => ({ ...r, checkedAt: now }));
  },
});

// ─── Text-to-speech (openai-edge-tts — self-hosted, OpenAI-compatible) ────
// The travisvn/openai-edge-tts server exposes an OpenAI-compatible
// POST /v1/audio/speech (Edge TTS voices, keyless by default; set
// REQUIRE_API_KEY=True on the server to require a Bearer token).

export const edgeTtsSpeak = internalAction({
  args: {
    text: v.string(),
    baseUrl: v.optional(v.string()),
    voice: v.optional(v.string()),
    speed: v.optional(v.number()),
    apiKey: v.optional(v.string()),
    format: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const text = String(args.text ?? "").trim().slice(0, 4000);
    if (!text) throw new Error("edge-tts: متن خالی است");
    const voice = String(args.voice ?? "");
    const errors: string[] = [];

    // 1) Self-hosted / configured OpenAI-compatible server (if reachable).
    //    The built-in default (127.0.0.1:5050) is skipped — it only exists
    //    when the admin actually runs openai-edge-tts next to the backend.
    const rawBase = String(args.baseUrl ?? "").trim();
    if (rawBase) {
      try {
        const r = await edgeTtsServerSpeak(text, rawBase, voice, Number(args.speed ?? 1), String(args.format ?? "mp3"), cleanSecretKey(args.apiKey));
        return { ...r, provider: "edge-tts-server" };
      } catch (e: any) {
        errors.push(`server: ${e?.message ?? e}`);
      }
    }

    // 2) Keyless fallbacks so TTS never dies with the sandbox server.
    const lang = /^fa/i.test(voice) ? "fa" : "en";
    try {
      const r = await googleTranslateTtsSpeak(text, lang);
      return { ...r, provider: "gtranslate-tts" };
    } catch (e: any) {
      errors.push(`gtranslate: ${e?.message ?? e}`);
    }
    throw new Error(`tts_all_failed (${errors.join(" | ")})`);
  },
});

/** Calls a self-hosted openai-edge-tts compatible server. */
async function edgeTtsServerSpeak(
  text: string,
  baseUrl: string,
  voice: string,
  speed: number,
  format: string,
  apiKey: string | null,
): Promise<{ ok: boolean; audioBase64: string; format: string; bytes: number; baseUrl: string }> {
  const base = normalizeTtsBase(baseUrl).replace(/\/+$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(`${base}/audio/speech`, {
    method: "POST",
    headers,
    body: JSON.stringify(edgeTtsRequestBody(text, voice, speed, format)),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const d = (await res.json()) as any;
      msg = d?.error?.message ?? d?.message ?? msg;
    } catch {
      // keep the status message
    }
    throw new Error(msg);
  }
  const buf = await res.arrayBuffer();
  return {
    ok: true,
    audioBase64: Buffer.from(buf).toString("base64"),
    format,
    bytes: buf.byteLength,
    baseUrl: base,
  };
}

/**
 * Keyless Google Translate TTS (verified live: client=tw-ob with
 * total/idx/textlen params). Chunks the text at ~190 chars and concatenates
 * the MP3 segments (browsers play concatenated MP3 fine).
 */
async function googleTranslateTtsSpeak(
  text: string,
  lang: string,
): Promise<{ ok: boolean; audioBase64: string; format: string; bytes: number }> {
  const words = text.replace(/\s+/g, " ").split(" ");
  const chunks: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > 190) {
      chunks.push(cur.trim());
      cur = w;
    } else cur = `${cur} ${w}`;
  }
  if (cur.trim()) chunks.push(cur.trim());
  const total = Math.min(chunks.length, 12);
  const parts: Buffer[] = [];
  for (let i = 0; i < total; i++) {
    const chunk = chunks[i];
    const url =
      `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}` +
      `&total=${total}&idx=${i}&textlen=${chunk.length}&q=${encodeURIComponent(chunk)}&prev=input&ttsspeed=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://translate.google.com/",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    parts.push(Buffer.from(await res.arrayBuffer()));
  }
  const all = Buffer.concat(parts);
  if (all.length < 500) throw new Error("empty audio");
  return { ok: true, audioBase64: all.toString("base64"), format: "mp3", bytes: all.length };
}

/** Health probe: GET {base}/models — verifies the self-hosted server is up. */
export const edgeTtsHealth = action({
  args: { baseUrl: v.optional(v.string()), apiKey: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    const base = normalizeTtsBase(String(args.baseUrl ?? ""));
    const key = cleanSecretKey(args.apiKey);
    const headers: Record<string, string> = {};
    if (key) headers["Authorization"] = `Bearer ${key}`;
    try {
      const res = await fetch(`${base}/models`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return { ok: false, status: res.status, baseUrl: base };
      const d = (await res.json()) as any;
      const models = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
      return {
        ok: true,
        baseUrl: base,
        models: models.map((m: any) => m?.id ?? m).slice(0, 20),
      };
    } catch (e: any) {
      return { ok: false, baseUrl: base, error: String(e?.message ?? e).slice(0, 200) };
    }
  },
});

// ─── Telegram Bot API ──────────────────────────────────────────────────────

export const telegramSend = internalAction({
  args: {
    token: v.string(),
    chatId: v.union(v.string(), v.number()),
    text: v.string(),
    parseMode: v.optional(v.string()),
    replyMarkup: v.optional(v.any()),
    silent: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const url = `https://api.telegram.org/bot${args.token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: args.chatId,
        text: args.text,
        parse_mode: args.parseMode || "HTML",
        disable_web_page_preview: true,
        reply_markup: args.replyMarkup ?? undefined,
        disable_notification: args.silent ?? false,
      }),
    });
    const data = (await res.json()) as any;
    if (!res.ok || data.ok !== true) {
      throw new Error(data?.description ?? `Telegram HTTP ${res.status}`);
    }
    return { ok: true, messageId: data?.result?.message_id };
  },
});

/** Pollinations text-to-image → base64 PNG/JPEG (free, no key). */
export const pollinationsImage = internalAction({
  args: { prompt: v.string(), width: v.optional(v.number()), height: v.optional(v.number()) },
  handler: async (_ctx, args) => {
    const w = args.width ?? 1024;
    const h = args.height ?? 576;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(args.prompt)}?width=${w}&height=${h}&nologo=true&seed=${Math.floor(Math.random() * 1e9)}`;
    const errors: string[] = [];
    // Pollinations queues generations — allow up to 3 attempts / 90s each.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(90000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ct = String(res.headers.get("content-type") ?? "");
        const buf = Buffer.from(await res.arrayBuffer());
        if (!ct.startsWith("image/")) throw new Error(`not an image (${ct})`);
        if (buf.length < 2000) throw new Error(`image too small (${buf.length}B)`);
        return { ok: true, base64: buf.toString("base64"), mime: ct.split(";")[0], bytes: buf.length };
      } catch (e: any) {
        errors.push(e?.message ?? e);
      }
    }
    throw new Error(`Pollinations image failed: ${errors.join(" | ")}`);
  },
});

/** Sends a photo (PNG bytes) with an optional HTML caption to a chat. */
export const telegramSendPhoto = internalAction({
  args: {
    token: v.string(),
    chatId: v.union(v.string(), v.number()),
    photo: v.string(), // base64 PNG
    caption: v.optional(v.string()),
    parseMode: v.optional(v.string()),
    silent: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const bytes = Buffer.from(args.photo, "base64");
    const form = new FormData();
    form.append("chat_id", String(args.chatId));
    form.append("photo", new Blob([bytes], { type: "image/png" }), "wolf_ai_chart.png");
    if (args.caption) form.append("caption", args.caption);
    form.append("parse_mode", args.parseMode || "HTML");
    form.append("disable_notification", args.silent ? "true" : "false");
    const res = await fetch(`https://api.telegram.org/bot${args.token}/sendPhoto`, {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as any;
    if (!res.ok || data.ok !== true) {
      throw new Error(data?.description ?? `Telegram HTTP ${res.status}`);
    }
    return { ok: true, messageId: data?.result?.message_id };
  },
});

/** Sends an audio file (MP3 bytes) to a chat. */
export const telegramSendAudio = internalAction({
  args: {
    token: v.string(),
    chatId: v.union(v.string(), v.number()),
    audio: v.string(), // base64 MP3
    caption: v.optional(v.string()),
    parseMode: v.optional(v.string()),
    silent: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const bytes = Buffer.from(args.audio, "base64");
    const form = new FormData();
    form.append("chat_id", String(args.chatId));
    form.append("audio", new Blob([bytes], { type: "audio/mpeg" }), "wolf_ai_lesson.mp3");
    if (args.caption) form.append("caption", args.caption);
    form.append("parse_mode", args.parseMode || "HTML");
    form.append("disable_notification", args.silent ? "true" : "false");
    const res = await fetch(`https://api.telegram.org/bot${args.token}/sendAudio`, {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as any;
    if (!res.ok || data.ok !== true) {
      throw new Error(data?.description ?? `Telegram HTTP ${res.status}`);
    }
    return { ok: true, messageId: data?.result?.message_id };
  },
});

export const telegramGetMe = action({
  args: { token: v.string() },
  handler: async (_ctx, args) => {
    const res = await fetch(`https://api.telegram.org/bot${args.token}/getMe`);
    const data = (await res.json()) as any;
    if (!res.ok || data.ok !== true) {
      throw new Error(data?.description ?? `Telegram HTTP ${res.status}`);
    }
    return {
      ok: true,
      id: data.result.id,
      username: data.result.username,
      firstName: data.result.first_name,
    };
  },
});

/** Returns whether a user is a member of the channel (used for gate). */
export const telegramChatMember = action({
  args: {
    token: v.string(),
    channelId: v.union(v.string(), v.number()),
    userId: v.number(),
  },
  handler: async (_ctx, args) => {
    const url = `https://api.telegram.org/bot${args.token}/getChatMember`;
    const params = new URLSearchParams({
      chat_id: String(args.channelId),
      user_id: String(args.userId),
    });
    const res = await fetch(`${url}?${params}`);
    const data = (await res.json()) as any;
    if (!res.ok || data.ok !== true) {
      return { ok: false, status: "error", reason: data?.description };
    }
    const status: string = data.result?.status ?? "left";
    const allowed = ["member", "administrator", "creator"];
    return { ok: allowed.includes(status), status, reason: undefined };
  },
});

// ─── Telegram test & setup (admin panel: Connections tab) ─────────────────

/** Validates the stored bot token (getMe) and sends a test message to the admin. */
export const telegramTestBot = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<any> => {
    await ctx.runQuery(internal.brokerData.assertAdmin, { token });
    const settings: any = await ctx.runQuery(internal.settings.rawSettings, {});
    const botToken = String(settings["telegram.token"] ?? "");
    if (!botToken) return { ok: false, step: "token", error: "no_bot_token" };
    let bot: any = null;
    try {
      bot = await telegramGetMeInner(botToken);
    } catch (e: any) {
      return { ok: false, step: "getMe", error: String(e?.message ?? e) };
    }
    // Admin numeric chat ID from settings; falls back to the admin user's
    // linked Telegram tgId when not filled in (a common setup miss — the
    // bot "connects" but the test message never arrives).
    let adminId = String(settings["telegram.adminId"] ?? "");
    if (!adminId) {
      try {
        const adminUser: any = await ctx.runQuery(internal.brokerData.getAdminUser, { token });
        adminId = String(adminUser?.tgId ?? "");
      } catch {
        // keep empty
      }
    }
    let adminSent: { ok: boolean; reason?: string; adminIdPresent?: boolean } = { ok: false, reason: "no_admin_id", adminIdPresent: false };
    if (adminId) {
      try {
        adminSent = await sendMessageInner(botToken, adminId, `🐺 <b>تست اتصال ربات موفق ✓</b>\nBot: @${bot.username}\nTest: Trading Wolf AI`);
        adminSent.adminIdPresent = true;
      } catch (e: any) {
        adminSent = { ok: false, reason: String(e?.message ?? e), adminIdPresent: true };
        // Translate the common Telegram failure into an actionable hint.
        const msg = String(e?.message ?? e);
        if (/chat not found|bot was blocked|forbidden/i.test(msg)) {
          adminSent.reason = "user_must_start_bot";
        }
      }
    }
    return { ok: bot != null, bot, adminSent, adminId };
  },
});

/** Posts a bilingual test message to the fa + en channels. */
export const telegramTestChannels = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<any> => {
    await ctx.runQuery(internal.brokerData.assertAdmin, { token });
    const settings: any = await ctx.runQuery(internal.settings.rawSettings, {});
    const botToken = String(settings["telegram.token"] ?? "");
    if (!botToken) return { ok: false, error: "no_bot_token" };
    const faId = String(settings["channel.id"] ?? "");
    const enId = String(settings["channel.enId"] ?? "");
    const targets: Array<{ chatId: string; text: string }> = [];
    if (faId) targets.push({ chatId: faId, text: "🐺 <b>تست کانال فارسی ✓</b>\nاتصال Telegram برقرار است." });
    if (enId) targets.push({ chatId: enId, text: "🐺 <b>English channel test ✓</b>\nTelegram connection is live." });
    if (targets.length === 0) return { ok: false, error: "no_channel_ids" };
    const results: Array<{ chatId: string; ok: boolean; reason?: string }> = [];
    for (const t of targets) {
      try {
        const r = await sendMessageInner(botToken, t.chatId, t.text);
        results.push({ chatId: t.chatId, ...r });
      } catch (e: any) {
        results.push({ chatId: t.chatId, ok: false, reason: String(e?.message ?? e) });
      }
    }
    return { ok: results.every((r) => r.ok), results };
  },
});

/** One-click: points the bot's webhook at this deployment + secret token. */
export const telegramSetupWebhook = action({
  args: { token: v.string(), publicUrl: v.optional(v.string()), botToken: v.optional(v.string()) },
  handler: async (ctx, { token, publicUrl, botToken }): Promise<any> => {
    await ctx.runQuery(internal.brokerData.assertAdmin, { token });
    const settings: any = await ctx.runQuery(internal.settings.rawSettings, {});
    let botTok = String(settings["telegram.token"] ?? "").trim();
    // Accept the bot token straight from the form field when it hasn't been
    // persisted yet — masked placeholders are never accepted.
    const given = String(botToken ?? "").trim();
    if (!botTok && given && !/[•…*]{3,}/.test(given)) {
      botTok = given;
      await ctx.runMutation(internal.settings.writeSettings, { values: { "telegram.token": botTok } });
    }
    if (!botTok) return { ok: false, error: "no_bot_token", hint: "توکن ربات تنظیم نشده است — ابتدا توکن را در «اتصالات و کلیدها» وارد و ذخیره کنید." };
    // Auto-generate a stable secret once so webhook works even when the admin
    // has none configured. Telegram echoes it back in x-telegram-bot-api-
    // secret-token; the /telegram/webhook route verifies it.
    let secret = String(settings["telegram.webhookSecret"] ?? "").trim();
    if (!secret || secret === "wolf-secret-change-me") {
      secret = `wh_${Math.random().toString(36).slice(2, 14)}${Date.now().toString(36)}`;
      await ctx.runMutation(internal.settings.writeSettings, {
        values: { "telegram.webhookSecret": secret },
      });
    }
    // 1. Frontend-provided public URL (highest priority — derives from window.location)
    // 2. Explicit webhook URL from settings
    // 3. Site domain (system.domain)
    // 4. Convex site URL (auto-derived)
    const domain = String(settings["system.domain"] ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    // Derive the public site URL from the Convex deployment when present
    // (https://<slug>.convex.cloud → https://<slug>.convex.site — the URL
    // Telegram can actually reach for an HTTP action). Falls back to the
    // configured domain, then CONVEX_URL as-is.
    const cvxUrl = String(process.env.CONVEX_URL ?? "").trim();
    let cvxSite = "";
    if (cvxUrl && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(cvxUrl)) {
      const host = cvxUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
      cvxSite = `https://${host.replace(/\.convex\.cloud$/, ".convex.site")}`;
    }
    const baseUrl =
      String(publicUrl ?? "").trim() ||
      String(settings["telegram.webhookUrl"] ?? "").trim() ||
      (domain ? `https://${domain}` : "") ||
      cvxSite ||
      process.env.SITE_URL ||
      "";
    if (!baseUrl) {
      return {
        ok: false,
        error: "no_webhook_base",
        hint: "webhook needs a public URL — set the site domain (system.domain) or the webhook URL in Connections.",
      };
    }
    const webhookUrl = webhookUrlFor(baseUrl);
    if (!webhookUrl) return { ok: false, error: "invalid_webhook_base" };
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botTok}/setWebhook`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url: webhookUrl,
            secret_token: secret,
            allowed_updates: ["message", "callback_query"],
          }),
        },
      );
      const data = (await res.json()) as any;
      if (!res.ok || data?.ok !== true) {
        return { ok: false, error: String(data?.description ?? "setWebhook_failed") };
      }
      // Persist the effective URL so the panel always shows what Telegram has.
      if (String(settings["telegram.webhookUrl"] ?? "").trim() !== webhookUrl) {
        await ctx.runMutation(internal.settings.writeSettings, {
          values: { "telegram.webhookUrl": webhookUrl },
        });
      }
      return { ok: true, webhookUrl, webhookSecret: secret, description: data?.description };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  },
});

/** Reads the current webhook state (url, pending updates, last error). */
export const telegramGetWebhookInfo = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<any> => {
    await ctx.runQuery(internal.brokerData.assertAdmin, { token });
    const settings: any = await ctx.runQuery(internal.settings.rawSettings, {});
    const botToken = String(settings["telegram.token"] ?? "");
    if (!botToken) return { ok: false, error: "no_bot_token" };
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      const data = (await res.json()) as any;
      if (!res.ok || data?.ok !== true) {
        return { ok: false, error: String(data?.description ?? "getWebhookInfo_failed") };
      }
      const r = data.result ?? {};
      return {
        ok: true,
        url: r.url ?? "",
        hasCustomCertificate: Boolean(r.has_custom_certificate),
        pendingUpdateCount: r.pending_update_count ?? 0,
        lastError: r.last_error_message ?? "",
        lastErrorDate: r.last_error_date ? new Date(r.last_error_date * 1000).toISOString() : "",
        ipAddress: r.ip_address ?? "",
      };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  },
});

async function telegramGetMeInner(botToken: string): Promise<{ id: number; username: string; firstName?: string }> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const data = (await res.json()) as any;
  if (!res.ok || data.ok !== true) throw new Error(data?.description ?? "getMe failed");
  return { id: data.result.id, username: data.result.username, firstName: data.result.first_name };
}

async function sendMessageInner(
  botToken: string,
  chatId: string,
  text: string,
): Promise<{ ok: boolean; reason?: string }> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const data = (await res.json()) as any;
  if (!res.ok || data?.ok !== true) return { ok: false, reason: String(data?.description ?? "send_failed") };
  return { ok: true };
}

// ─── Exchange probes (connection test / balance / prices) ─────────────────

const bingxPublic = async (path: string) => {
  const res = await fetch(`https://open-api.bingx.com${path}`);
  return res.json() as Promise<any>;
};

const lbankPublic = async (path: string) => {
  const res = await fetch(`https://api.lbkex.com${path}`);
  return res.json() as Promise<any>;
};

const binancePublic = async (path: string) => {
  const res = await fetch(`https://api.binance.com${path}`);
  return res.json() as Promise<any>;
};

export const exchangePrice = action({
  args: { provider: v.string(), symbol: v.string() },
  handler: async (_ctx, args) => {
    const s = args.symbol.toUpperCase();
    try {
      if (args.provider === "bingx") {
        const d = await bingxPublic(`/openapi/quote/v1/ticker/price?symbol=${s}-USDT`);
        return { ok: true, price: Number(d?.data?.price) };
      }
      if (args.provider === "lbank") {
        const d = await lbankPublic(`/v2/ticker.do?symbol=${s.toLowerCase()}_usdt`);
        const rows = d?.data ?? [];
        if (Array.isArray(rows) && rows[0]?.ticker?.latest) {
          return { ok: true, price: Number(rows[0].ticker.latest) };
        }
      }
      if (args.provider === "binance") {
        const d = await binancePublic(`/api/v3/ticker/price?symbol=${s}USDT`);
        return { ok: true, price: Number(d?.price) };
      }
      if (args.provider === "bybit") {
        const res = await fetch(
          `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${s}USDT`,
        );
        const d = (await res.json()) as any;
        return { ok: true, price: Number(d?.result?.list?.[0]?.lastPrice) };
      }
      if (args.provider === "okx") {
        const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${s}-USDT`);
        const d = (await res.json()) as any;
        return { ok: true, price: Number(d?.data?.[0]?.last) };
      }
      if (args.provider === "mexc") {
        const res = await fetch(`https://api.mexc.com/api/v3/ticker/price?symbol=${s}USDT`);
        const d = (await res.json()) as any;
        return { ok: true, price: Number(d?.price) };
      }
      if (args.provider === "kucoin") {
        const res = await fetch(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${s}-USDT`);
        const d = (await res.json()) as any;
        return { ok: true, price: Number(d?.data?.price) };
      }
      return { ok: false, reason: `unsupported-provider-${args.provider}` };
    } catch (e: any) {
      return { ok: false, reason: e?.message ?? String(e) };
    }
  },
});

// ─── shared helper for channel/trade notifications (called by engine) ─────

export const notifyTrade = internalAction({
  args: {
    token: v.string(),
    channelId: v.union(v.string(), v.number()),
    position: v.any(),
    mode: v.string(),
  },
  handler: async (ctx, args) => {
    const p = args.position;
    const side = p.side === "long" ? "LONG 🟢" : "SHORT 🔴";
    const settings: any = await ctx.runQuery(internal.settings.rawSettings, {});
    const dashboardUrl =
      String(settings["telegram.miniAppUrl"] ?? "") ||
      process.env.WEBAPP_URL ||
      `https://t.me/${String(settings["channel.username"] ?? "marijtrade")}`;
    const line = "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501";
    const txt =
      `🐺 <b>WOLF TRADING ${args.mode.toUpperCase()}</b>\n` +
      `${line}\n` +
      `\ud83d\udfe2 <b>${p.symbol}</b> \u2022 ${side}\n` +
      `\ud83c\udfaf Entry: <b>${fmt(p.entry)}</b>\n` +
      `\ud83d\uded1 SL: <code>${fmt(p.stopLoss)}</code>\n` +
      `\u2705 TP: <code>${fmt(p.takeProfit)}</code>\n` +
      `\u23f1\ufe0f RR: 1:${p.rr ?? 0}  |  \ud83c\udfb2 Score: ${p.score ?? "—"}/100\n` +
      `\ud83e\udde0 ${p.strategyKeys?.slice(0, 3).join(", ") ?? ""}\n` +
      (p.shortAnalysis ? `\ud83d\udcdd ${p.shortAnalysis}\n` : "") +
      `${line}\n` +
      `<a href="${dashboardUrl}">🐺 ${langLabel("fa", "مشاهده جزئیات", "View details")}</a>`;
    const txtEn =
      `🐺 <b>WOLF TRADING ${args.mode.toUpperCase()}</b>\n` +
      `${line}\n` +
      `\ud83d\udfe2 <b>${p.symbol}</b> \u2022 ${side}\n` +
      `\ud83c\udfaf Entry: <b>${fmt(p.entry)}</b>\n` +
      `\ud83d\uded1 SL: <code>${fmt(p.stopLoss)}</code>\n` +
      `\u2705 TP: <code>${fmt(p.takeProfit)}</code>\n` +
      `\u23f1\ufe0f RR: 1:${p.rr ?? 0}  |  \ud83c\udfb2 Score: ${p.score ?? "—"}/100\n` +
      `\ud83e\udde0 ${p.strategyKeys?.slice(0, 3).join(", ") ?? ""}\n` +
      (p.shortAnalysis ? `\ud83d\udcdd ${p.shortAnalysis}\n` : "") +
      `${line}\n` +
      `<a href="${dashboardUrl}">🐺 ${langLabel("en", "مشاهده جزئیات", "View details")}</a>`;
    const url = `https://api.telegram.org/bot${args.token}/sendMessage`;
    // Bilingual: fa card → requested channel, en card → en channel (if set).
    const targets: Array<{ chatId: string; text: string }> = [{ chatId: String(args.channelId), text: txt }];
    const enId = String(settings["channel.enId"] ?? "");
    if (enId) targets.push({ chatId: enId, text: txtEn });
    const results: Array<{ chatId: string; ok: boolean; reason?: string }> = [];
    for (const t of targets) {
      try {
        const keyboard = {
          inline_keyboard: [[{ text: "\ud83d\udc49 " + (t.text === txtEn ? "View details" : "مشاهده جزئیات"), url: dashboardUrl }]],
        };
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: t.chatId,
            text: t.text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: keyboard,
          }),
        });
        const data = (await res.json()) as any;
        if (!res.ok || data.ok !== true) throw new Error(data?.description ?? "send failed");
        results.push({ chatId: t.chatId, ok: true });
      } catch (e: any) {
        results.push({ chatId: t.chatId, ok: false, reason: String(e?.message ?? "error") });
      }
    }
    const anyOk = results.some((r) => r.ok);
    return { ok: anyOk, targets: results, reason: anyOk ? undefined : (results[0]?.reason ?? "send_failed") };
  },
});

function langLabel(lang: string, fa: string, en: string): string {
  return lang === "en" ? en : fa;
}

/** Channel report when a position closes (paper + real broker paths). */
export const notifyTradeClosed = internalAction({
  args: { position: v.any(), mode: v.string() },
  handler: async (
    ctx,
    { position, mode },
  ): Promise<{ ok: boolean; reason?: string; targets?: Array<{ chatId: string; ok: boolean; reason?: string }> }> => {
    const settings: any = await ctx.runQuery(internal.settings.rawSettings, {});
    if (settings["telegram.enabled"] === false || settings["channel.postTrades"] === false) {
      return { ok: false, reason: "disabled" };
    }
    const token = String(settings["telegram.token"] ?? "");
    const channelId = String(settings["channel.id"] ?? "");
    const channelEnId = String(settings["channel.enId"] ?? "");
    if (!token || !channelId) return { ok: false, reason: "not_configured" };
    const dashboardUrl =
      String(settings["telegram.miniAppUrl"] ?? "") || process.env.WEBAPP_URL || `https://t.me/${String(settings["channel.username"] ?? "")}`;
    // Bilingual: fa card → fa channel, en card → en channel (when configured).
    const targets: Array<{ chatId: string; lang: "fa" | "en" }> = [{ chatId: channelId, lang: "fa" }];
    if (channelEnId) targets.push({ chatId: channelEnId, lang: "en" });
    const results: Array<{ chatId: string; ok: boolean; reason?: string }> = [];
    for (const t of targets) {
      try {
        const txt = buildClosedCard(position, mode, t.lang, dashboardUrl);
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const body: Record<string, any> = {
          chat_id: t.chatId,
          text: txt,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: t.lang === "fa" ? "\ud83d\udc49 مشاهده جزئیات" : "\ud83d\udc49 View details",
                  url: dashboardUrl,
                },
              ],
            ],
          },
        };
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as any;
        if (!res.ok || data.ok !== true) throw new Error(data?.description ?? "send failed");
        results.push({ chatId: t.chatId, ok: true });
      } catch (e: any) {
        results.push({ chatId: t.chatId, ok: false, reason: String(e?.message ?? "error") });
      }
    }
    const anyOk = results.some((r) => r.ok);
    return { ok: anyOk, targets: results, reason: anyOk ? undefined : (results[0]?.reason ?? "send_failed") };
  },
});

/** Builds the close-report card in the requested language. */
function buildClosedCard(p: any, mode: string, lang: "fa" | "en", dashboardUrl: string): string {
  const fa = lang === "fa";
  const win = (p.pnl ?? 0) >= 0;
  const reasonLabel: Record<string, string> = fa
    ? {
        take_profit: "حد سود 🎯",
        stop_loss: "حد ضرر 🛑",
        exchange_error: "خطای صرافی ⚠️",
        manual: "دستی 👤",
        duplicate_symbol: "تکراری",
        reanalysis: "بازبینی",
      }
    : {
        take_profit: "Take profit 🎯",
        stop_loss: "Stop loss 🛑",
        exchange_error: "Exchange error ⚠️",
        manual: "Manual 👤",
        duplicate_symbol: "Duplicate",
        reanalysis: "Re-analysis",
      };
  const exit = p.closePrice ?? p.current ?? p.entry ?? 0;
  const channelLabel = fa ? "مشاهده جزئیات" : "View details";
  const line = "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501";
  const header = fa ? "معامله بسته شد" : "TRADE CLOSED";
  return (
    `🐺 <b>WOLF TRADING ${mode.toUpperCase()} — ${header}</b>\n` +
    `${line}\n` +
    `${win ? "\ud83d\udfe2" : "\ud83d\udfe1"} <b>${p.symbol}</b> \u2022 ${p.side === "long" ? "LONG" : "SHORT"} \u2022 ${reasonLabel[p.closeReason ?? ""] ?? p.closeReason ?? ""}\n` +
    `${fa ? "\ud83c\udfaf ورود" : "\ud83c\udfaf Entry"}: <code>${fmt(p.entry)}</code> \u2192 ${fa ? "خروج" : "Exit"}: <code>${fmt(exit)}</code>\n` +
    `\ud83d\udcb5 P&L: <b>${win ? "+" : "\u2212"}${fmt(Math.abs(p.pnl ?? 0))} USDT</b> (${win ? "+" : ""}${num2(p.pnlPct)}%)\n` +
    `\ud83c\udfb2 ${fa ? "امتیاز" : "Score"}: ${p.score ?? "\u2014"}/100\n` +
    `${line}\n` +
    `<a href="${dashboardUrl}">🐺 ${channelLabel}</a>`
  );
}

function num2(n: number | undefined | null): string {
  const v = n ?? 0;
  return v.toFixed(2);
}

function fmt(n: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toFixed(4);
  return n.toPrecision(4);
}