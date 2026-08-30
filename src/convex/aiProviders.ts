// ---------------------------------------------------------------------------
// WOLF AI — provider registry + quota-aware routing (pure, unit-testable).
//
// Ports the *structure* of OmniRoute's free-AI gateway into the Convex
// backend — only the parts that matter for a keyless-first bot:
//   • a provider registry (id → endpoint/model/auth source)
//   • non-retryable error classification (invalid key, quota, overload,
//     rate limit, network, empty reply) — same idea as OmniRoute's
//     accountFallback/nonRetryableUpstream
//   • exponential cooldown with an absolute cap (OmniRoute cooldownCap)
//   • last-known-good ordering + cooldown skipping (OmniRoute speedRanking)
//
// State lives in settings ("ai.providerState", JSON) and is updated by the
// router in nodeCalls.ts — the pure functions below decide *how* to react,
// the action decides *when* to persist.
// ---------------------------------------------------------------------------

/**
 * Normalize a stored API key. Settings UIs show masked keys ("AIza••••…wxyz",
 * "sk-****abcd", "AQ.Ab8RN********…UtTg"); if a masked placeholder was ever
 * saved over the real key, strip it entirely so we can still detect the key is
 * unusable and fall back to the environment variable instead of crashing fetch
 * with a ByteString error or sending a garbage key to the provider.
 * Real API keys never contain mask glyphs (* • …), so any occurrence means
 * the stored value is a placeholder → treated as unset.
 */
export function cleanSecretKey(raw: string | undefined | null): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s.includes("*") || s.includes("•") || s.includes("…")) return "";
  if (/^x{4,}$/i.test(s)) return "";
  return s;
}

export type AiProviderKind = "keyless" | "keyed";

export interface AiProviderDef {
  /** Stable id used in settings state, logs and UI ("pollinations", "gemini"...). */
  id: string;
  kind: AiProviderKind;
  /** Human label (fa) shown in health readouts. */
  labelFa: string;
  /** Env var to read the API key from ("" for keyless). */
  envKey?: string;
  /** OpenAI-compatible base URL (served by the generic dispatcher). */
  base?: string;
  /** Env var holding a base-URL override for self-hosted gateways (key optional). */
  baseEnv?: string;
}

/**
 * The provider registry. Keyless entries need NO key and NO card — they keep
 * the AI layer alive with ZERO configured keys (live-verified: pollinations,
 * llm7, kilo and OVHcloud answered keylessly). The keyed entries are free-tier
 * supplements pulled from environment keys (Freebuff Keys tab) — every one has
 * a generous free tier and needs no credit card.
 * Sources: OmniRoute structure + open-free-llm-api/awesome-freellm-apis + zebbern/no-cost-ai.
 */
export const AI_PROVIDERS: AiProviderDef[] = [
  { id: "pollinations", kind: "keyless", labelFa: "پولینیشن (بدون کلید)" },
  { id: "llm7", kind: "keyless", labelFa: "LLM7 (بدون کلید)", base: "https://api.llm7.io/v1" },
  { id: "kilo", kind: "keyless", labelFa: "Kilo (بدون کلید)", base: "https://api.kilo.ai/api/gateway" },
  // OVHcloud AI Endpoints — 2 RPM anonymous (awesome-freellm-apis permanent free tier)
  { id: "ovhcloud", kind: "keyless", labelFa: "OVHcloud (بدون کلید)", base: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1" },
  { id: "gemini", kind: "keyed", labelFa: "Gemini", envKey: "GEMINI_API_KEY" },
  { id: "openai", kind: "keyed", labelFa: "OpenAI", envKey: "OPENAI_API_KEY", base: "https://api.openai.com/v1" },
  { id: "anthropic", kind: "keyed", labelFa: "Anthropic", envKey: "ANTHROPIC_API_KEY" },
  { id: "openrouter", kind: "keyed", labelFa: "OpenRouter", envKey: "OPENROUTER_API_KEY", base: "https://openrouter.ai/api/v1" },
  { id: "groq", kind: "keyed", labelFa: "Groq", envKey: "GROQ_API_KEY", base: "https://api.groq.com/openai/v1" },
  { id: "cerebras", kind: "keyed", labelFa: "Cerebras", envKey: "CEREBRAS_API_KEY", base: "https://api.cerebras.ai/v1" },
  { id: "mistral", kind: "keyed", labelFa: "Mistral", envKey: "MISTRAL_API_KEY", base: "https://api.mistral.ai/v1" },
  // NVIDIA NIM — 125 free models, up to 40 RPM (top of awesome-freellm-apis)
  { id: "nvidia", kind: "keyed", labelFa: "NVIDIA NIM", envKey: "NVIDIA_API_KEY", base: "https://integrate.api.nvidia.com/v1" },
  // DeepSeek — free/cheap tier, OpenAI-compatible
  { id: "deepseek", kind: "keyed", labelFa: "DeepSeek", envKey: "DEEPSEEK_API_KEY", base: "https://api.deepseek.com/v1" },
  // xAI (Grok) — free tier, OpenAI-compatible
  { id: "xai", kind: "keyed", labelFa: "xAI (Grok)", envKey: "XAI_API_KEY", base: "https://api.x.ai/v1" },
  // Hugging Face router — free open models (llama/mistral/qwen…)
  { id: "hf", kind: "keyed", labelFa: "Hugging Face", envKey: "HF_API_KEY", base: "https://router.huggingface.co/v1" },
  // GitHub Models — free tier with a GitHub token (no credit card)
  { id: "githubmodels", kind: "keyed", labelFa: "GitHub Models", envKey: "GITHUB_TOKEN", base: "https://models.github.ai/inference" },
  // AnyAPI (no-cost-ai) — 20 req/min, 200 req/day, no credit card
  { id: "anyapi", kind: "keyed", labelFa: "AnyAPI", envKey: "ANYAPI_API_KEY", base: "https://api.anyapi.ai/v1" },
  // Naga.ac (OmniRoute v3.8.50 provider catalog) — aggregator gateway, free tier
  { id: "naga", kind: "keyed", labelFa: "Naga.ac", envKey: "NAGA_API_KEY", base: "https://api.naga.ac/v1" },
  // ChatAnywhere (OmniRoute v3.8.50 provider catalog) — OpenAI-compatible, free tier
  { id: "chatanywhere", kind: "keyed", labelFa: "ChatAnywhere", envKey: "CHATANYWHERE_API_KEY", base: "https://api.chatanywhere.tech/v1" },
  // OpenCode Zen (anomalyco/opencode) — free models, needs a zen key
  { id: "opencodezen", kind: "keyed", labelFa: "OpenCode Zen", envKey: "OPENCODE_ZEN_KEY", base: "https://opencode.ai/zen/v1" },
  // Kiro Gateway (jwadow/kiro-gateway) — SELF-HOSTED FastAPI gateway that
  // proxies YOUR Kiro free-tier account (free Claude Sonnet 4.5 / Haiku 4.5,
  // GLM-5, DeepSeek-V3.2, MiniMax, Qwen3-Coder) as an OpenAI-compatible API.
  // Set KIRO_GATEWAY_BASE (default http://127.0.0.1:8000/v1); key optional.
  { id: "kiro", kind: "keyed", labelFa: "Kiro Gateway (self-hosted)", envKey: "KIRO_GATEWAY_KEY", base: "http://127.0.0.1:8000/v1", baseEnv: "KIRO_GATEWAY_BASE" },
  // nanobot (HKUDS/nanobot) — SELF-HOSTED lightweight agent framework with an
  // OpenAI-compatible API + model routing/fallbacks. Set NANOBOT_BASE.
  { id: "nanobot", kind: "keyed", labelFa: "nanobot (self-hosted)", envKey: "NANOBOT_KEY", base: "http://127.0.0.1:8765/v1", baseEnv: "NANOBOT_BASE" },
  // apfel (Arthur-Ficial/apfel) — macOS-ONLY on-device Apple Intelligence LLM
  // as a local OpenAI-compatible server (http://localhost:11434/v1).
  { id: "apfel", kind: "keyed", labelFa: "apfel (macOS on-device)", envKey: "APFEL_KEY", base: "http://127.0.0.1:11434/v1", baseEnv: "APFEL_BASE" },
  // Free One API (RockChinQ/free-one-api) — SELF-HOSTED OpenAI-standard
  // gateway over free reverse-engineered LLMs. Set FREE_ONE_API_KEY (+ optional
  // FREE_ONE_API_BASE) after deploying it and it joins the keyed chain.
  { id: "freeoneapi", kind: "keyed", labelFa: "Free One API (self-hosted)", envKey: "FREE_ONE_API_KEY" },
  // WebAI-to-API (Amm1rr/WebAI-to-API) — SELF-HOSTED browser-native runtime
  // exposing web AIs (Gemini…) through /v1/chat/completions. Key is OPTIONAL
  // (browser login does the auth); set WEBAI_API_BASE after deploying it.
  { id: "webai", kind: "keyed", labelFa: "WebAI-to-API (self-hosted)", envKey: "WEBAI_API_KEY" },
];

/**
 * Documented free-tier daily request caps (conservative estimates from the
 * providers' published free tiers / community data, 2026-08). Used by the
 * admin AI monitoring card to show how much capacity each AI has left today.
 * `null` = no tracked cap (self-hosted gateways / local models are effectively
 * unlimited — the operator controls their own limits).
 *
 * These are *guidance* numbers for the monitoring readout, not hard limits —
 * the router itself keeps enforcing cooldowns based on real API errors.
 */
export const AI_PROVIDER_LIMITS: Record<string, number | null> = {
  pollinations: 400, // keyless image+text; generous but rate-limited
  llm7: 100,
  kilo: 200,
  ovhcloud: 200, // 2 RPM anonymous tier — realistically ~200/day under cooldowns
  gemini: 1500, // free tier ≈ 60 RPM / 1500 RPD on Flash
  openai: 200, // free tier on gpt-4o-mini-class models
  anthropic: 100,
  openrouter: 1000, // free models are per-model capped (~50/day each) — 1000 across pool
  groq: 1000,
  cerebras: 500,
  mistral: 500,
  nvidia: 2000, // 40 RPM free tier
  deepseek: 500,
  xai: 150,
  hf: 100, // free router tier
  githubmodels: 50, // ~50 req/day free tier
  anyapi: 200, // documented: 20 RPM / 200 req/day
  naga: 200,
  chatanywhere: 100,
  opencodezen: 200,
  kiro: null, // self-hosted gateway
  nanobot: null, // self-hosted
  apfel: null, // on-device
  freeoneapi: null, // self-hosted gateway
  webai: null, // self-hosted browser runtime
};

/** Default model per provider id (used by the router + single executor). */
export const AI_PROVIDER_MODELS: Record<string, string> = {
  pollinations: "mistral",
  llm7: "mistral-Nemo-Instruct-2407",
  kilo: "openrouter/free",
  ovhcloud: "Meta-Llama-3_3-70B-Instruct",
  gemini: "gemini-3.6-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  groq: "llama-3.3-70b-versatile",
  cerebras: "llama-3.3-70b",
  mistral: "mistral-small-latest",
  nvidia: "meta/llama-3.3-70b-instruct",
  deepseek: "deepseek-chat",
  xai: "grok-3-mini",
  hf: "meta-llama/Llama-3.3-70B-Instruct",
  githubmodels: "gpt-4o-mini",
  anyapi: "meta-llama/llama-3.3-70b-instruct",
  naga: "gpt-4o-mini",
  chatanywhere: "gpt-3.5-turbo",
  opencodezen: "deepseek-v4-flash-free",
  kiro: "claude-sonnet-4-5", // Kiro gateway normalizes model names (smart resolution)
  nanobot: "gpt-4o-mini",
  apfel: "local",
  freeoneapi: "gpt-4o-mini",
  webai: "gemini-3.6-flash",
};

/**
 * Providers whose default model accepts image input (multimodal/vision).
 * Used by the admin monitoring card and by the chat image-upload feature to
 * tell the user which AIs can actually "see" an attached screenshot.
 * pollinations is image *generation* only (no vision), hence false.
 */
export const AI_PROVIDER_VISION: Record<string, boolean> = {
  pollinations: false,
  llm7: false,
  kilo: false,
  ovhcloud: false,
  gemini: true,
  openai: true,
  anthropic: true,
  openrouter: true,
  groq: true,
  cerebras: false,
  mistral: true,
  nvidia: true,
  deepseek: false,
  xai: true,
  hf: true,
  githubmodels: true,
  anyapi: false,
  naga: true,
  chatanywhere: false,
  opencodezen: false,
  kiro: true,
  nanobot: true,
  apfel: false,
  freeoneapi: false,
  webai: true,
};

/** Which error class a message belongs to (drives cooldown + retryability). */
export type AiErrorKind =
  | "auth" // bad/invalid key, 401/403 — permanent until the key changes
  | "quota" // billing/quota exceeded — wait, then retry
  | "overload" // "high demand", 503-ish — transient, short wait
  | "rate" // 429 rate limited — exponential backoff
  | "network" // DNS/TCP/timeout — short cooldown
  | "empty" // provider answered but produced no text
  | "other";

export interface AiErrorClass {
  kind: AiErrorKind;
  /** Base cooldown (ms) for a FIRST failure of this class. */
  baseCooldownMs: number;
  /** True when retrying soon is pointless (auth/quota) — skip long. */
  retryable: boolean;
}

const MS = 60_000;

/** Base cooldown per error kind (single source for classify + cooldown). */
const KIND_BASE_MS: Record<AiErrorKind, number> = {
  auth: 15 * MS,
  quota: 5 * MS,
  overload: 2 * MS,
  rate: 1 * MS,
  network: 45_000,
  empty: 30_000,
  other: 30_000,
};

export function classifyAiError(message: string | null | undefined): AiErrorClass {
  const m = String(message ?? "").toLowerCase();
  if (!m) return { kind: "empty", baseCooldownMs: KIND_BASE_MS.empty, retryable: true };

  // auth — invalid key / 401 / 403 / API key not set
  if (
    m.includes("invalid api key") ||
    m.includes("api key") && (m.includes("invalid") || m.includes("incorrect") || m.includes("not valid")) ||
    m.includes("401") ||
    m.includes("403") ||
    m.includes("unauthorized") ||
    m.includes("forbidden") ||
    m.includes("authentication_error") ||
    m.includes("permission denied") ||
    m.includes("invalid_api_key") ||
    m.includes("api_key_not_set") ||
    m.includes("کلید") && m.includes("معتبر")
  ) {
    return { kind: "auth", baseCooldownMs: KIND_BASE_MS.auth, retryable: false };
  }

  // quota — billing / free-tier limit reached
  if (
    m.includes("quota") ||
    m.includes("billing") ||
    m.includes("rate limit") && m.includes("exceeded") ||
    m.includes("insufficient_quota") ||
    m.includes("429") && m.includes("quota") ||
    m.includes("daily limit") ||
    m.includes("سهمیه") ||
    m.includes("402") // payment required (keyless endpoints occasionally demand payment)
  ) {
    return { kind: "quota", baseCooldownMs: KIND_BASE_MS.quota, retryable: true };
  }

  // overload — "high demand", "temporarily unavailable", 503/502
  if (
    m.includes("high demand") ||
    m.includes("overloaded") ||
    m.includes("temporarily") ||
    m.includes("try again later") ||
    m.includes("503") ||
    m.includes("502") ||
    m.includes("busy")
  ) {
    return { kind: "overload", baseCooldownMs: KIND_BASE_MS.overload, retryable: true };
  }

  // rate limit — 429 without quota words
  if (
    m.includes("429") ||
    m.includes("rate limit") ||
    m.includes("too many requests") ||
    m.includes("throttl")
  ) {
    return { kind: "rate", baseCooldownMs: KIND_BASE_MS.rate, retryable: true };
  }

  // network — fetch failed, timeout, DNS, socket
  if (
    m.includes("fetch failed") ||
    m.includes("network") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("econnrefused") ||
    m.includes("econnreset") ||
    m.includes("enotfound") ||
    m.includes("socket") ||
    m.includes("aborted")
  ) {
    return { kind: "network", baseCooldownMs: KIND_BASE_MS.network, retryable: true };
  }

  // empty reply / no text
  if (m.includes("خالی") || m.includes("empty") || m.includes("no text") || m.includes("no content")) {
    return { kind: "empty", baseCooldownMs: 30_000, retryable: true };
  }

  return { kind: "other", baseCooldownMs: KIND_BASE_MS.other, retryable: true };
}

/** Absolute ceiling for any per-provider cooldown (OmniRoute cooldownCap). */
export const MAX_COOLDOWN_MS = 30 * MS;

/**
 * Exponential cooldown, capped at MAX_COOLDOWN_MS:
 *   cooldown = base × 2^(consecutiveFailures − 1)  (first failure = base)
 * On success the counter resets to 0.
 */
export function cooldownMsFor(kind: AiErrorKind, consecutiveFailures = 0, baseCooldownMs?: number): number {
  const base = baseCooldownMs ?? KIND_BASE_MS[kind] ?? KIND_BASE_MS.other;
  const n = Math.max(0, Math.min(6, Math.floor(Number(consecutiveFailures) || 0) - 1));
  return Math.min(MAX_COOLDOWN_MS, base * Math.pow(2, n));
}

/** Per-provider routing state, persisted as JSON under "ai.providerState". */
export interface AiProviderState {
  /** Consecutive failures — drives the exponential backoff. */
  failures?: number;
  /** Epoch ms until which this provider is skipped. */
  cooldownUntil?: number;
  /** Epoch ms of the last successful reply — last-known-good ordering. */
  lastGoodAt?: number;
}

/** Round-robin cursor stored under ROTATION_KEY (last provider that answered). */
export interface RotationCursor {
  provider: string;
  at: number;
}

/**
 * State map keyed by provider id, plus the reserved ROTATION_KEY entry that
 * holds the last-answering provider (round-robin cursor).
 */
export type AiProviderStateMap = Record<string, AiProviderState | RotationCursor>;

/** An attempt the router may make: provider id + optional model override. */
export interface AiAttempt {
  provider: string;
  model?: string;
}

/**
 * Order attempts OmniRoute-style:
 *   1. never try a provider that is inside its cooldown window
 *   2. last-known-good first (most recent success leads)
 *   3. stable tie-break so the order is deterministic
 * The `forceFirst` provider (the keyless base / user-configured provider)
 * stays at the front when it is not cooling down.
 */
export function orderAttempts(
  attempts: AiAttempt[],
  state: AiProviderStateMap,
  now: number,
  forceFirst?: string,
): AiAttempt[] {
  const coolingDown = new Set(
    Object.entries(state)
      .filter(([, s]) => ((s as AiProviderState).cooldownUntil ?? 0) > now)
      .map(([id]) => id),
  );
  const usable = attempts.filter((a) => !coolingDown.has(a.provider));
  if (usable.length === 0) return [];
  const sortable = usable.map((a, i) => ({
    a,
    i,
    lastGood: (state[a.provider] as AiProviderState | undefined)?.lastGoodAt ?? 0,
    forced: a.provider === forceFirst,
  }));
  sortable.sort((x, y) => {
    if (x.forced !== y.forced) return x.forced ? -1 : 1;
    if (y.lastGood !== x.lastGood) return y.lastGood - x.lastGood;
    return x.i - y.i;
  });
  return sortable.map((s) => s.a);
}

/**
 * Random order for the “random provider” mode: every usable (non-cooldown)
 * candidate gets an equal chance — the answer can come from a DIFFERENT AI
 * each time. `rng` is injectable for deterministic tests.
 */
export function randomizeAttempts(
  attempts: AiAttempt[],
  state: AiProviderStateMap,
  now: number,
  rng: () => number = Math.random,
): AiAttempt[] {
  const coolingDown = new Set(
    Object.entries(state)
      .filter(([, s]) => ((s as AiProviderState).cooldownUntil ?? 0) > now)
      .map(([id]) => id),
  );
  const usable = attempts.filter((a) => !coolingDown.has(a.provider));
  // Fisher–Yates shuffle (in place on a copy).
  for (let i = usable.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [usable[i], usable[j]] = [usable[j], usable[i]];
  }
  return usable;
}

// ─── Verbalized sampling (CHATS-lab/verbalized-sampling essence) ───────────
// Ask the model to state its confidence, sample several times and keep the
// most-confident answer (self-consistency over verbalized uncertainty).

export interface VerbalizedSample {
  text: string;
  confidence?: number;
}

/** Extracts “Confidence: NN” (fa: اعتماد/اطمینان) from the reply tail. */
export function parseVerbalizedConfidence(text: string): number | undefined {
  const m = String(text ?? "").match(/(?:confidence|اعتماد|اطمینان)\s*[:：]?\s*(\d{1,3})(?:\s*\/\s*100)?/i);
  if (!m) return undefined;
  const v = Number(m[1]);
  return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : undefined;
}

/** Removes the trailing confidence line so the user sees a clean answer. */
export function stripConfidenceLine(text: string): string {
  return String(text ?? "")
    .replace(/\n*\s*(?:[Cc]onfidence|اعتماد|اطمینان)\s*[:：]?\s*\d{1,3}(?:\s*\/\s*100)?\s*$/i, "")
    .trim();
}

/** Self-consistency pick: the sample with the highest verbalized confidence. */
export function verbalizedPick(samples: VerbalizedSample[]): string {
  let best: VerbalizedSample | null = null;
  for (const s of samples) {
    if (!s.text) continue;
    if (!best || (s.confidence ?? 0) > (best.confidence ?? 0)) best = s;
  }
  return best?.text ?? samples[0]?.text ?? "";
}

/**
 * Fold one outcome back into the state map (pure).
 * Returns a NEW map; the caller persists it.
 */
export function recordOutcome(
  state: AiProviderStateMap,
  provider: string,
  ok: boolean,
  errorMessage: string | null,
  now: number,
): AiProviderStateMap {
  const prev = (state[provider] ?? {}) as AiProviderState;
  if (ok) {
    // A success advances the rotation cursor so the NEXT call leads with a
    // different provider (round-robin across healthy providers).
    return {
      ...state,
      [provider]: { failures: 0, cooldownUntil: 0, lastGoodAt: now },
      [ROTATION_KEY]: { provider, at: now } as RotationCursor,
    };
  }
  const cls = classifyAiError(errorMessage);
  const failures = (prev.failures ?? 0) + 1;
  const cooldownUntil = now + cooldownMsFor(cls.kind, failures, cls.baseCooldownMs);
  return { ...state, [provider]: { failures, cooldownUntil, lastGoodAt: prev.lastGoodAt ?? 0 } };
}

// ─── edge-tts (openai-edge-tts) helpers ────────────────────────────────────

/** Default base of the self-hosted edge-tts OpenAI-compatible server. */
export const EDGE_TTS_DEFAULT_BASE = "http://127.0.0.1:5050/v1";

export function normalizeTtsBase(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim().replace(/\/+$/, "");
  return trimmed || EDGE_TTS_DEFAULT_BASE;
}

/** Build the OpenAI-compatible /audio/speech request body (pure). */
export function edgeTtsRequestBody(
  text: string,
  voice?: string | null,
  speed?: number | null,
  format?: string | null,
): Record<string, unknown> {
  const sp = Number(speed ?? 1);
  return {
    model: "edge-tts",
    input: String(text ?? "").trim().slice(0, 4000),
    voice: String(voice ?? "").trim() || "en-US-AvaNeural",
    response_format: String(format ?? "mp3").trim() || "mp3",
    speed: Number.isFinite(sp) && sp > 0 ? sp : 1,
  };
}

/**
 * Rotation cursor stored in the state map under a reserved key. Consecutive
 * calls cycle to the NEXT healthy provider so free-tier rate limits are spread
 * evenly and every answer can come from a different AI (never ask the user).
 */
export const ROTATION_KEY = "__rotation";

/**
 * Round-robin ordering: skip providers in cooldown, then start the attempt
 * list right AFTER the provider that answered last (rotation cursor), so each
 * call leads with a different healthy provider. Falls back to the given order
 * when no cursor exists yet or nothing is usable.
 */
export function rotateAttempts(
  attempts: AiAttempt[],
  state: AiProviderStateMap,
  now: number,
): AiAttempt[] {
  const usable = attempts.filter((a) => {
    const st = state[a.provider] as AiProviderState | undefined;
    return !(st?.cooldownUntil ?? 0) || (st?.cooldownUntil ?? 0) <= now;
  });
  if (usable.length === 0) return [];
  const cursor = state[ROTATION_KEY] as RotationCursor | undefined;
  if (!cursor?.provider || usable.length === 1) return usable;
  const idx = usable.findIndex((a) => a.provider === cursor.provider);
  if (idx < 0) return usable;
  return [...usable.slice(idx + 1), ...usable.slice(0, idx + 1)];
}

/** Serialize state for storage (stable JSON). */
export function serializeProviderState(state: AiProviderStateMap): string {
  return JSON.stringify(state);
}

/** Parse stored state, tolerating corrupt/legacy values. */
export function parseProviderState(raw: string | null | undefined): AiProviderStateMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as AiProviderStateMap;
  } catch {
    /* corrupt — start clean */
  }
  return {};
}
