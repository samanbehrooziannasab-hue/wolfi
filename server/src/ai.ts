// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — AI Gateway
// Multiple providers with priority + fallback:
//   gemini · openai · anthropic · openrouter · ollama (local)
// The engine NEVER depends on AI: if every provider fails it continues
// with the deterministic analysis. AI is used for explanations/reviews/
// reports/education only — it never places orders.
// ─────────────────────────────────────────────────────────────────────────────
import { config } from "./config.js";
import { pool, one, many, logEngine, type Row } from "./db.js";
import { redis, cacheGet, cacheSet } from "./redis.js";
import { decryptSecret, now, num } from "./util.js";

export interface AiProviderCfg {
  id: string;
  provider: string;
  model: string;
  apiKeyEnc?: string | null;
  baseUrl?: string | null;
  priority: number;
  enabled: boolean;
  purpose: string;
  rateLimit: number;
  dailyLimit: number;
}

async function providers(): Promise<AiProviderCfg[]> {
  const rows = await many<Row>(
    "SELECT * FROM ai_providers WHERE enabled = true ORDER BY priority ASC, created_at ASC"
  );
  const list = rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    model: r.model,
    apiKeyEnc: r.api_key_enc,
    baseUrl: r.base_url,
    priority: num(r.priority, 100),
    enabled: !!r.enabled,
    purpose: r.purpose ?? "general",
    rateLimit: num(r.rate_limit, 30),
    dailyLimit: num(r.daily_limit, 500),
  }));
  if (list.length > 0) return list;
  // Fallback to env bootstrap (before admin configures providers).
  const envs: AiProviderCfg[] = [];
  if (config.ai.key) {
    envs.push({
      id: "env-1",
      provider: config.ai.provider,
      model: config.ai.model,
      apiKeyEnc: config.ai.key,
      priority: 10,
      enabled: true,
      purpose: "general",
      rateLimit: 30,
      dailyLimit: 500,
    });
  }
  if (config.ai.key2) {
    envs.push({
      id: "env-2",
      provider: config.ai.provider2,
      model: config.ai.model2,
      apiKeyEnc: config.ai.key2,
      priority: 20,
      enabled: true,
      purpose: "general",
      rateLimit: 30,
      dailyLimit: 500,
    });
  }
  return envs;
}

async function allowUse(p: AiProviderCfg): Promise<boolean> {
  const rl = await redis.incr(`ai:rl:${p.id}:${Math.floor(Date.now() / 60_000)}`);
  if (rl === 1) await redis.expire(`ai:rl:${p.id}:${Math.floor(Date.now() / 60_000)}`, 60);
  if (rl > p.rateLimit) return false;
  const day = await redis.incr(`ai:day:${p.id}:${new Date().toISOString().slice(0, 10)}`);
  if (day === 1) await redis.expire(`ai:day:${p.id}:${new Date().toISOString().slice(0, 10)}`, 86_400);
  return day <= p.dailyLimit;
}

async function callProvider(
  p: AiProviderCfg,
  system: string,
  user: string
): Promise<{ text: string; latencyMs: number }> {
  const key = p.apiKeyEnc ? (p.apiKeyEnc.includes(":") ? decryptSecret(p.apiKeyEnc) : p.apiKeyEnc) : "";
  const started = Date.now();
  let text = "";

  switch (p.provider) {
    case "gemini": {
      let mName = (p.model || "gemini-2.5-flash").replace(/^models\//, "");
      if (mName === "gemini-flash-latest" || mName === "gemini-flash" || mName.includes("3.5") || mName.includes("3.6")) mName = "gemini-2.5-flash";
      if (mName === "gemini-pro-latest" || mName === "gemini-pro") mName = "gemini-2.5-pro";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${mName}:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `${system}\n\n${user}` }] },
          ],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
        }),
      });
      const j = (await res.json()) as any;
      if (!res.ok) throw new Error(j?.error?.message ?? `gemini ${res.status}`);
      text = j?.candidates?.[0]?.content?.parts?.map((x: any) => x.text).join("") ?? "";
      break;
    }
    case "openai": {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: p.model,
          temperature: 0.4,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      const j = (await res.json()) as any;
      if (!res.ok) throw new Error(j?.error?.message ?? `openai ${res.status}`);
      text = j?.choices?.[0]?.message?.content ?? "";
      break;
    }
    case "anthropic": {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: p.model,
          max_tokens: 1200,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      const j = (await res.json()) as any;
      if (!res.ok) throw new Error(j?.error?.message ?? `anthropic ${res.status}`);
      text = j?.content?.map((x: any) => x.text ?? "").join("") ?? "";
      break;
    }
    case "openrouter": {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: p.model,
          temperature: 0.4,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      const j = (await res.json()) as any;
      if (!res.ok) throw new Error(j?.error?.message ?? `openrouter ${res.status}`);
      text = j?.choices?.[0]?.message?.content ?? "";
      break;
    }
    case "ollama": {
      const base = p.baseUrl || "http://localhost:11434";
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: p.model,
          stream: false,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      const j = (await res.json()) as any;
      if (!res.ok) throw new Error(j?.error ?? `ollama ${res.status}`);
      text = j?.message?.content ?? "";
      break;
    }
    default:
      throw new Error(`unknown provider: ${p.provider}`);
  }
  return { text, latencyMs: Date.now() - started };
}

/** Ask AI with provider priority + fallback. Returns null when all fail. */
export async function aiAsk(
  purpose: string,
  system: string,
  user: string,
  opts: { cacheTtlSec?: number; cacheKey?: string } = {}
): Promise<{ text: string; provider: string; model: string } | null> {
  const ck = opts.cacheKey;
  if (ck) {
    const hit = await cacheGet<{ text: string; provider: string; model: string }>(`ai:${ck}`);
    if (hit) return hit;
  }
  const list = await providers();
  if (list.length === 0) return null;
  const purposeMatch = list.filter((p) => p.purpose === purpose || p.purpose === "general");
  const ordered = purposeMatch.length ? purposeMatch : list;
  let lastErr = "no provider";
  for (const p of ordered) {
    if (!(await allowUse(p))) {
      lastErr = `${p.provider}: rate limited`;
      continue;
    }
    try {
      const { text, latencyMs } = await callProvider(p, system, user);
      if (!text.trim()) throw new Error("empty response");
      await pool.query(
        `UPDATE ai_providers SET used_today = used_today + 1, usage_errors = usage_errors,
           usage_latency_ms = $1, last_used_at = $2 WHERE id = $3`,
        [latencyMs, now(), p.id]
      );
      const out = { text: text.trim(), provider: p.provider, model: p.model };
      if (ck && opts.cacheTtlSec) await cacheSet(`ai:${ck}`, out, opts.cacheTtlSec);
      return out;
    } catch (e: any) {
      lastErr = e.message;
      await pool.query(
        `UPDATE ai_providers SET usage_errors = usage_errors + 1 WHERE id = $1`,
        [p.id]
      );
      await logEngine("WARNING", `ai ${p.provider} failed: ${e.message}`, null, "ai");
    }
  }
  await logEngine("ERROR", `ai gateway exhausted: ${lastErr}, attempting keyless fallback`, { purpose }, "ai");
  try {
    const res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "mistral",
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: user },
        ],
        temperature: 0.4,
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const j = (await res.json()) as any;
      const text = String(j?.choices?.[0]?.message?.content ?? "").trim();
      if (text) {
        const out = { text, provider: "pollinations", model: "mistral" };
        if (ck && opts.cacheTtlSec) await cacheSet(`ai:${ck}`, out, opts.cacheTtlSec);
        return out;
      }
    }
  } catch (e: any) {
    await logEngine("WARNING", `keyless fallback failed: ${e.message}`, null, "ai");
  }
  return null;
}

/** Structured AI call that returns JSON (with strict fallback). */
export async function aiAskJson<T>(
  purpose: string,
  system: string,
  user: string,
  fallback: T
): Promise<T> {
  const r = await aiAsk(
    purpose,
    `${system}\n\nRespond with a VALID JSON object only, no markdown fences, matching this schema exactly.`,
    user
  );
  if (!r) return fallback;
  try {
    return JSON.parse(r.text) as T;
  } catch {
    return fallback;
  }
}
