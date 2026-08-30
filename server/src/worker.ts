// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — engine worker (24/7)
//   ROLE=worker node dist/worker.js   (PM2: wolf-worker / docker: worker)
// Runs engineTick() in a loop, keeps the heartbeat fresh, and logs a watchdog
// alarm when it ever stalls. Exactly one worker should run — duplicate
// positions are additionally blocked by the DB unique index on symbol.
// ─────────────────────────────────────────────────────────────────────────────
import { setEngineState, getEngineState, logEngine, closeDb } from "./db.js";
import { closeRedis } from "./redis.js";
import { engineTick } from "./engine.js";
import { getSettings } from "./settings.js";
import { now } from "./util.js";

let stopping = false;

async function loop(): Promise<void> {
  let consecutiveErrors = 0;
  while (!stopping) {
    const started = Date.now();
    try {
      const s = await getSettings();
      // The dashboard writes engine.scanIntervalMinutes; the seed/env default is
      // engine.scanIntervalSec. Honor whichever is present (minutes wins when set).
      let intervalSec = Math.max(1, Math.min(600, Number(s["engine.scanIntervalSec"]) || 60));
      if (s["engine.scanIntervalMinutes"] != null) {
        intervalSec = Math.max(1, Math.min(600, Number(s["engine.scanIntervalMinutes"]) * 60));
      }
      const res = await engineTick();
      // engineTick owns the database heartbeat; keep a worker-level heartbeat
      // too so a long market scan cannot make health look permanently stale.
      await setEngineState("heartbeat", { at: now(), state: "running", lastTickMs: Date.now() - started });
      consecutiveErrors = 0;
      console.log(`[worker] tick ok — scanned=${res.scanned} opened=${res.opened} (${Date.now() - started}ms)`);
      await setEngineState("status", { state: "running", at: now(), lastTickMs: Date.now() - started });
      await setEngineState("last_scan", { at: now(), scanned: res.scanned, opened: res.opened });
      await sleep(intervalSec * 1000);
    } catch (e: any) {
      consecutiveErrors++;
      console.error("[worker] tick error:", e.message);
      await logEngine("ERROR", `worker tick: ${e.message}`, { consecutiveErrors }, "engine");
      await setEngineState("heartbeat", { at: now(), state: "error", consecutiveErrors });
      await setEngineState("status", { state: "error", error: String(e?.message ?? e).slice(0, 500), at: now() });
      // circuit breaker-ish backoff, but never die permanently
      await sleep(Math.min(30_000, 5_000 * consecutiveErrors));
    }
  }
}

async function watchdog(): Promise<void> {
  // Every 60s: verify the loop is alive by checking the heartbeat age.
  while (!stopping) {
    await sleep(60_000);
    try {
      const hb = await getEngineState("heartbeat");
      const age = hb?.at ? now() - Number(hb.at) : Infinity;
      if (age > 300_000) {
        await logEngine("CRITICAL", `WATCHDOG: heartbeat stale (${Math.round(age / 1000)}s)`, null, "engine");
      }
    } catch {
      /* ignore */
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log("[worker] shutting down…");
  await setEngineState("status", { state: "stopped", at: now() }).catch(() => undefined);
  await Promise.allSettled([closeDb(), closeRedis()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

loop().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
void watchdog();
