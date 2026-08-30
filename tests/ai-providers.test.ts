// ─── Backend unit tests (bun test) ─────────────────────────────────────────
// Covers the OmniRoute-style AI router (src/convex/aiProviders.ts): error
// classification, exponential cooldown with an absolute cap, last-known-good
// ordering, outcome recording and state serialization. No Convex runtime.
import { describe, expect, test } from "bun:test";
import {
  AI_PROVIDERS,
  AI_PROVIDER_MODELS,
  classifyAiError,
  cleanSecretKey,
  cooldownMsFor,
  MAX_COOLDOWN_MS,
  orderAttempts,
  parseProviderState,
  edgeTtsRequestBody,
  normalizeTtsBase,
  parseVerbalizedConfidence,
  randomizeAttempts,
  recordOutcome,
  rotateAttempts,
  ROTATION_KEY,
  serializeProviderState,
  stripConfidenceLine,
  verbalizedPick,
} from "../src/convex/aiProviders";

describe("cleanSecretKey", () => {
  test("real keys pass through untouched", () => {
    expect(cleanSecretKey("AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234")).toBe("AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234");
    expect(cleanSecretKey("sk-proj-real-key-123")).toBe("sk-proj-real-key-123");
  });

  test("asterisk-masked keys are treated as unset (the reported bug)", () => {
    // AQ.Ab8RN*****************************************UtTg — partial mask
    expect(cleanSecretKey("AQ.Ab8RN*****************************************UtTg")).toBe("");
    expect(cleanSecretKey("sk-****abcd")).toBe("");
    expect(cleanSecretKey("********")).toBe("");
  });

  test("bullet/ellipsis masks and empty values are unset", () => {
    expect(cleanSecretKey("AIza••••…wxyz")).toBe("");
    expect(cleanSecretKey("")).toBe("");
    expect(cleanSecretKey(undefined)).toBe("");
    expect(cleanSecretKey(null)).toBe("");
  });

  test("x-mask placeholders are unset", () => {
    expect(cleanSecretKey("xxxx")).toBe("");
    expect(cleanSecretKey("XXXX"));
  });
});

describe("registry", () => {
  test("four keyless providers keep the layer alive with zero keys", () => {
    const keyless = AI_PROVIDERS.filter((x) => x.kind === "keyless").map((x) => x.id);
    expect(keyless).toEqual(expect.arrayContaining(["pollinations", "llm7", "kilo", "ovhcloud"]));
    for (const id of keyless) {
      expect(AI_PROVIDER_MODELS[id]).toBeTruthy();
      expect(AI_PROVIDERS.find((x) => x.id === id)?.envKey ?? "").toBe("");
      // keyless OpenAI-compatible entries declare their base so the generic
      // dispatcher can serve them without a key
      if (id !== "pollinations") expect(AI_PROVIDERS.find((x) => x.id === id)?.base).toBeTruthy();
    }
  });

  test("new free-tier providers from awesome-freellm-apis / no-cost-ai are registered", () => {
    for (const id of ["nvidia", "deepseek", "xai", "hf", "githubmodels", "anyapi"]) {
      const p = AI_PROVIDERS.find((x) => x.id === id);
      expect(p?.kind).toBe("keyed");
      expect(p?.envKey).toBeTruthy();
      expect(p?.base).toBeTruthy(); // OpenAI-compatible → generic dispatcher
      expect(AI_PROVIDER_MODELS[id]).toBeTruthy();
    }
  });

  test("OmniRoute v3.8.50 providers (naga, chatanywhere) + opencode zen are keyed", () => {
    for (const id of ["naga", "chatanywhere", "opencodezen"]) {
      const p = AI_PROVIDERS.find((x) => x.id === id);
      expect(p?.kind).toBe("keyed");
      expect(p?.envKey).toBeTruthy();
      expect(p?.base).toBeTruthy();
      expect(AI_PROVIDER_MODELS[id]).toBeTruthy();
    }
  });

  test("self-hosted gateways (kiro, nanobot, apfel) declare baseEnv + a default base", () => {
    for (const id of ["kiro", "nanobot", "apfel"]) {
      const p = AI_PROVIDERS.find((x) => x.id === id);
      expect(p?.baseEnv).toBeTruthy(); // joins chain when the base env is set
      expect(p?.base).toBeTruthy(); // localhost default for the dispatcher
      expect(AI_PROVIDER_MODELS[id]).toBeTruthy();
    }
    // Kiro gateway serves free Claude-class models via the user's Kiro tier
    expect(AI_PROVIDERS.find((x) => x.id === "kiro")?.baseEnv).toBe("KIRO_GATEWAY_BASE");
    expect(AI_PROVIDERS.find((x) => x.id === "nanobot")?.baseEnv).toBe("NANOBOT_BASE");
    expect(AI_PROVIDERS.find((x) => x.id === "apfel")?.baseEnv).toBe("APFEL_BASE");
  });

  test("keyed providers declare their env vars and default models", () => {
    for (const p of AI_PROVIDERS.filter((x) => x.kind === "keyed")) {
      expect(p.envKey).toBeTruthy();
      expect(AI_PROVIDER_MODELS[p.id]).toBeTruthy();
    }
  });

  test("anyapi (no-cost-ai) points at its verified base URL", () => {
    expect(AI_PROVIDERS.find((x) => x.id === "anyapi")?.base).toBe("https://api.anyapi.ai/v1");
    expect(AI_PROVIDERS.find((x) => x.id === "anyapi")?.envKey).toBe("ANYAPI_API_KEY");
  });

  test("ovhcloud keyless endpoint matches the verified URL", () => {
    expect(AI_PROVIDERS.find((x) => x.id === "ovhcloud")?.base).toBe("https://oai.endpoints.kepler.ai.cloud.ovh.net/v1");
    expect(AI_PROVIDER_MODELS.ovhcloud).toBe("Meta-Llama-3_3-70B-Instruct");
  });

  test("freeoneapi (self-hosted free-one-api) is keyed with FREE_ONE_API_KEY", () => {
    const p = AI_PROVIDERS.find((x) => x.id === "freeoneapi");
    expect(p?.kind).toBe("keyed");
    expect(p?.envKey).toBe("FREE_ONE_API_KEY");
  });
});

describe("classifyAiError", () => {
  test("invalid API key → auth, not retryable soon", () => {
    const c = classifyAiError("Invalid API Key provided: sk-xxx");
    expect(c.kind).toBe("auth");
    expect(c.retryable).toBe(false);
  });

  test("401 / 403 / unauthorized → auth", () => {
    expect(classifyAiError("HTTP 401 Unauthorized").kind).toBe("auth");
    expect(classifyAiError("403 Forbidden").kind).toBe("auth");
  });

  test("quota exceeded → quota", () => {
    expect(classifyAiError("You exceeded your current quota, please check your plan").kind).toBe("quota");
    expect(classifyAiError("insufficient_quota").kind).toBe("quota");
    expect(classifyAiError("HTTP 402").kind).toBe("quota"); // payment required
  });

  test("high demand → overload", () => {
    expect(classifyAiError("Gemini: This model is currently experiencing high demand").kind).toBe("overload");
    expect(classifyAiError("503 Service Unavailable").kind).toBe("overload");
  });

  test("429 / too many requests → rate", () => {
    expect(classifyAiError("429 Too Many Requests").kind).toBe("rate");
    expect(classifyAiError("rate limit reached").kind).toBe("rate");
  });

  test("network failures → network", () => {
    expect(classifyAiError("fetch failed: connect ECONNREFUSED").kind).toBe("network");
    expect(classifyAiError("request timed out").kind).toBe("network");
  });

  test("empty response → empty", () => {
    expect(classifyAiError("پاسخ خالی").kind).toBe("empty");
    expect(classifyAiError("").kind).toBe("empty");
    expect(classifyAiError(undefined).kind).toBe("empty");
  });
});

describe("cooldownMsFor", () => {
  test("first failure uses the base", () => {
    expect(cooldownMsFor("network", 0)).toBe(45_000);
    expect(cooldownMsFor("auth", 0)).toBe(15 * 60_000);
  });

  test("exponential backoff doubles per consecutive failure", () => {
    expect(cooldownMsFor("rate", 0)).toBe(60_000); // no failures yet
    expect(cooldownMsFor("rate", 1)).toBe(60_000); // first failure → base
    expect(cooldownMsFor("rate", 2)).toBe(120_000); // second consecutive
    expect(cooldownMsFor("rate", 3)).toBe(240_000); // third consecutive
  });

  test("capped at the absolute ceiling", () => {
    const big = cooldownMsFor("auth", 10); // 15min × 2^10
    expect(big).toBe(MAX_COOLDOWN_MS);
    expect(cooldownMsFor("network", 100)).toBeLessThanOrEqual(MAX_COOLDOWN_MS);
  });
});

describe("orderAttempts", () => {
  const attempts = [
    { provider: "pollinations" },
    { provider: "gemini" },
    { provider: "groq" },
  ];
  const now = 1000;

  test("keeps the given order when nothing is cooling down", () => {
    const ordered = orderAttempts(attempts, {}, now);
    expect(ordered.map((a) => a.provider)).toEqual(["pollinations", "gemini", "groq"]);
  });

  test("skips providers inside their cooldown window", () => {
    const state = { gemini: { cooldownUntil: now + 1000, failures: 1 } };
    const ordered = orderAttempts(attempts, state, now);
    expect(ordered.map((a) => a.provider)).toEqual(["pollinations", "groq"]);
  });

  test("skips everything when all are cooling down", () => {
    const state = {
      pollinations: { cooldownUntil: now + 1000 },
      gemini: { cooldownUntil: now + 1000 },
      groq: { cooldownUntil: now + 1000 },
    };
    expect(orderAttempts(attempts, state, now)).toEqual([]);
  });

  test("last-known-good leads after cooldowns expire", () => {
    const state = { groq: { lastGoodAt: 900, failures: 0, cooldownUntil: 0 } };
    const ordered = orderAttempts(attempts, state, now);
    expect(ordered[0].provider).toBe("groq");
  });

  test("forceFirst stays at the front even when another is fresher", () => {
    const state = { gemini: { lastGoodAt: 999 }, pollinations: { lastGoodAt: 0 } };
    const ordered = orderAttempts(attempts, state, now, "pollinations");
    expect(ordered[0].provider).toBe("pollinations");
  });
});

describe("recordOutcome", () => {
  const now = 5000;

  test("success resets failures and stamps lastGoodAt", () => {
    const state = recordOutcome({ gemini: { failures: 3, cooldownUntil: now + 999 } }, "gemini", true, null, now);
    expect(state.gemini).toEqual({ failures: 0, cooldownUntil: 0, lastGoodAt: now });
  });

  test("failure increments failures and sets a cooldown", () => {
    const state = recordOutcome({}, "gemini", false, "429 Too Many Requests", now);
    expect(state.gemini?.failures).toBe(1);
    expect(state.gemini?.cooldownUntil ?? 0).toBeGreaterThan(now);
  });

  test("auth errors get a long cooldown (15 min)", () => {
    const state = recordOutcome({}, "openai", false, "Invalid API Key", now);
    expect(state.openai?.cooldownUntil ?? 0).toBe(now + 15 * 60_000);
  });

  test("success on one provider leaves others untouched", () => {
    const before = { gemini: { failures: 2, cooldownUntil: 111, lastGoodAt: 1 } };
    const after = recordOutcome(before, "groq", true, null, now);
    expect(after.gemini).toEqual(before.gemini);
    expect(after.groq).toEqual({ failures: 0, cooldownUntil: 0, lastGoodAt: now });
  });
});

describe("randomizeAttempts", () => {
  const attempts = [{ provider: "pollinations" }, { provider: "llm7" }, { provider: "kilo" }, { provider: "gemini" }];
  const now = 1000;

  test("returns every usable candidate (cooldown skipped)", () => {
    const state = { gemini: { cooldownUntil: now + 1000 } };
    const out = randomizeAttempts(attempts, state, now);
    expect(out.map((a) => a.provider).sort()).toEqual(["kilo", "llm7", "pollinations"]);
  });

  test("shuffle actually reorders with a deterministic rng", () => {
    // rng always returns 0 → j = 0 every step → the array rotates left
    const out = randomizeAttempts(attempts, {}, now, () => 0);
    expect(out.map((a) => a.provider)).toEqual(["llm7", "kilo", "gemini", "pollinations"]);
  });

  test("empty when everything is cooling down", () => {
    const state = {
      pollinations: { cooldownUntil: now + 1 },
      llm7: { cooldownUntil: now + 1 },
      kilo: { cooldownUntil: now + 1 },
      gemini: { cooldownUntil: now + 1 },
    };
    expect(randomizeAttempts(attempts, state, now)).toEqual([]);
  });
});

describe("edge-tts helpers (openai-edge-tts)", () => {
  test("normalizeTtsBase falls back to the default port 5050", () => {
    expect(normalizeTtsBase("")).toBe("http://127.0.0.1:5050/v1");
    expect(normalizeTtsBase(undefined)).toBe("http://127.0.0.1:5050/v1");
    expect(normalizeTtsBase("http://localhost:5050/v1/")).toBe("http://localhost:5050/v1");
    expect(normalizeTtsBase("  https://tts.example.com/v1  ")).toBe("https://tts.example.com/v1");
  });

  test("edgeTtsRequestBody builds the OpenAI-compatible payload", () => {
    const body = edgeTtsRequestBody("سلام", "fa-IR-FaridNeural", 1, "mp3");
    expect(body.model).toBe("edge-tts");
    expect(body.input).toBe("سلام");
    expect(body.voice).toBe("fa-IR-FaridNeural");
    expect(body.response_format).toBe("mp3");
    expect(body.speed).toBe(1);
  });

  test("empty voice defaults to en-US-AvaNeural, bad speed to 1", () => {
    const body = edgeTtsRequestBody("hi", "", 0, "");
    expect(body.voice).toBe("en-US-AvaNeural");
    expect(body.response_format).toBe("mp3");
    expect(body.speed).toBe(1);
    const body2 = edgeTtsRequestBody("hi", null, Number.NaN, null);
    expect(body2.voice).toBe("en-US-AvaNeural");
    expect(body2.speed).toBe(1);
  });

  test("text is trimmed and capped at 4000 chars", () => {
    const long = "x".repeat(5000);
    expect(edgeTtsRequestBody("  hi  ", "v", 1, "mp3").input).toBe("hi");
    expect(String(edgeTtsRequestBody(long, "v", 1, "mp3").input).length).toBe(4000);
  });
});

describe("rotateAttempts (round-robin)", () => {
  const attempts = [{ provider: "pollinations" }, { provider: "llm7" }, { provider: "kilo" }];
  const now = 5000;

  test("no cursor → keeps the given order", () => {
    expect(rotateAttempts(attempts, {}, now).map((a) => a.provider)).toEqual(["pollinations", "llm7", "kilo"]);
  });

  test("cursor advances the start to the NEXT provider (rotation)", () => {
    const state = { [ROTATION_KEY]: { provider: "pollinations", at: now } };
    expect(rotateAttempts(attempts, state, now).map((a) => a.provider)).toEqual(["llm7", "kilo", "pollinations"]);
    const state2 = { [ROTATION_KEY]: { provider: "kilo", at: now } };
    expect(rotateAttempts(attempts, state2, now).map((a) => a.provider)).toEqual(["pollinations", "llm7", "kilo"]);
  });

  test("cooling-down providers are skipped but the cursor still rotates", () => {
    const state = {
      [ROTATION_KEY]: { provider: "pollinations", at: now },
      llm7: { cooldownUntil: now + 1000, failures: 1 },
    };
    const out = rotateAttempts(attempts, state, now);
    expect(out.map((a) => a.provider)).toEqual(["kilo", "pollinations"]);
  });

  test("all cooling down → empty", () => {
    const state = {
      pollinations: { cooldownUntil: now + 1 },
      llm7: { cooldownUntil: now + 1 },
      kilo: { cooldownUntil: now + 1 },
    };
    expect(rotateAttempts(attempts, state, now)).toEqual([]);
  });

  test("recordOutcome success advances the rotation cursor", () => {
    const st = recordOutcome({}, "groq", true, null, now);
    expect(st[ROTATION_KEY]).toEqual({ provider: "groq", at: now });
  });
});

describe("verbalized sampling", () => {
  test("parseVerbalizedConfidence reads en/fa confidence lines", () => {
    expect(parseVerbalizedConfidence("Answer…\nConfidence: 85")).toBe(85);
    expect(parseVerbalizedConfidence("Confidence: 42/100")).toBe(42);
    expect(parseVerbalizedConfidence("جواب…\nاعتماد: 70")).toBe(70);
    expect(parseVerbalizedConfidence("no number here")).toBeUndefined();
  });

  test("stripConfidenceLine removes only the trailing line", () => {
    expect(stripConfidenceLine("real answer\nConfidence: 90")).toBe("real answer");
    expect(stripConfidenceLine("پاسخ واقعی\nاطمینان: 60")).toBe("پاسخ واقعی");
    expect(stripConfidenceLine("keep me")).toBe("keep me");
  });

  test("verbalizedPick keeps the most-confident sample", () => {
    const chosen = verbalizedPick([
      { text: "weak", confidence: 40 },
      { text: "strong", confidence: 90 },
      { text: "middle", confidence: 60 },
    ]);
    expect(chosen).toBe("strong");
  });

  test("verbalizedPick falls back to the first non-empty sample", () => {
    expect(verbalizedPick([{ text: "" }, { text: "only" }])).toBe("only");
    expect(verbalizedPick([])).toBe("");
  });
});

describe("serialization", () => {
  test("roundtrip survives JSON", () => {
    const state = { gemini: { failures: 2, cooldownUntil: 123, lastGoodAt: 456 } };
    expect(parseProviderState(serializeProviderState(state))).toEqual(state);
  });

  test("corrupt input → empty state", () => {
    expect(parseProviderState(null)).toEqual({});
    expect(parseProviderState("not json{{{")).toEqual({});
    expect(parseProviderState("[1,2,3]")).toEqual({});
  });
});
