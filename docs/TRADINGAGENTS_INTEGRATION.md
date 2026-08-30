# TradingAgents — what was adopted

TradingAgents (https://github.com/TauricResearch/TradingAgents) is a
Python-based multi-agent LLM trading framework (bull/bear debate, risk team,
research team). Its runtime is Python and cannot run inside the Convex
serverless engine, so we adopted its **decision-making concepts** natively.

## 1. Bull/Bear debate + risk check on every top setup

Before/around every qualifying setup, the engine schedules a structured
AI debate (exactly the TradingAgents pipeline shape):

- **bull_case** — strongest bullish/technical case
- **bear_case** — strongest bearish/contrarian case
- **risk_check** — position sizing / risk warning
- **verdict** — `agree | concern | reject`
- **conviction** — 0–100

Where it lives:

- `scheduleAiReview` in `src/convex/engineWorker.ts` builds the debate
  prompt; `nodeCalls.aiGenerate` calls the configured provider
  (Gemini / OpenAI / Anthropic / OpenRouter) with env-key fallback.
- Results are persisted via `storeAiReview` into `ai_analysis`
  (kind `trade_review`) **and** attached to the symbol's latest
  `learningHistory` entry, so they are visible in the admin
  **Learning** card with zero extra plumbing.
- The verdict is **advisory only** — the deterministic engine gates
  (score, consensus, independent confirmations, risk caps) still decide
  entry. AI never places or cancels orders.

Toggle: `ai.debateEnabled` (default on; requires a real `ai.key`).

## 2. AI research layer (fundamental + sentiment + news + technicals)

`engineWorker.runResearch` (admin action) runs the AI research team over
the top watched markets and produces a compact JSON snapshot:

- per symbol: `fundamental`, `sentiment`, `technical`
- plus an overall `risk_note` for the engine

Stored in `ai_analysis` (kind `research`) and inserted as a `MARKET /
research` row in `learningHistory`, which appears in the admin
**Learning** card and the **AI market research** card in Reports.
Toggle: `ai.researchEnabled` (default on).

## Settings summary

| Setting | Default | Meaning |
| --- | --- | --- |
| `ai.debateEnabled` | `true` | bull/bear debate + risk check on top setups (needs AI key) |
| `ai.researchEnabled` | `true` | allow the admin research action |

## Files touched

- `src/convex/engineWorker.ts` — debate prompt, gating, `runResearch`, `storeResearch`
- `src/convex/settings.ts` — `ai.debateEnabled`, `ai.researchEnabled` defaults
- `src/pages/Dashboard.tsx` — Reports → **AI market research** card
