// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — database (PostgreSQL)
// Thin wrapper over `pg` with a single pool + tiny typed helpers.
// All money mutations MUST go through wallet_transactions (the ledger) and
// balance updates must run inside transactions (BEGIN/COMMIT).
// ─────────────────────────────────────────────────────────────────────────────
import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.DB_POOL_SIZE || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl:
    config.databaseUrl.includes("sslmode=require") ||
    config.databaseUrl.includes("postgresql+ssl")
      ? { rejectUnauthorized: false }
      : undefined,
});

pool.on("error", (err) => {
  console.error("[db pool error]", err.message);
});

export type Row = Record<string, any>;
export type Rows = Row[];

/** One row or null. */
export async function one<T = Row>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const r = await pool.query(sql, params as any[]);
  return (r.rows[0] as T) ?? null;
}

/** Many rows. */
export async function many<T = Row>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const r = await pool.query(sql, params as any[]);
  return r.rows as T[];
}

/** Run a query, return rows (alias). */
export const query = many;

/** Run a transaction with a dedicated client (ROLLBACK on error). */
export async function tx<T>(
  fn: (c: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

/** Atomic "one position per symbol" insert — the DB enforces the rule. */
export async function insertPositionOrThrow(
  client: pg.PoolClient,
  p: Row
): Promise<Row> {
  const entry = Number(p.entry);
  const quantity = Number(p.quantity);
  const size = Number(p.size);
  const stopLoss = Number(p.stopLoss);
  const takeProfit = Number(p.takeProfit);
  const side = String(p.side ?? "");
  if (!Number.isFinite(entry) || entry <= 0) {
    throw new Error("invalid_entry_price");
  }
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(size) || size <= 0) {
    throw new Error("invalid_position_size");
  }
  if (!Number.isFinite(stopLoss) || !Number.isFinite(takeProfit) || stopLoss <= 0 || takeProfit <= 0) {
    throw new Error("invalid_exit_levels");
  }
  const levelEpsilon = Math.max(entry * 1e-6, 1e-12);
  if (Math.abs(stopLoss - entry) < levelEpsilon || Math.abs(takeProfit - entry) < levelEpsilon) {
    throw new Error("exit_level_equals_entry");
  }
  if ((side === "long" && (stopLoss >= entry || takeProfit <= entry)) ||
      (side === "short" && (stopLoss <= entry || takeProfit >= entry))) {
    throw new Error("exit_levels_wrong_side");
  }
  const r = await client.query(
    `INSERT INTO open_positions
       (symbol, market, side, entry, current, quantity, size, leverage, margin,
        pnl, pnl_pct, score, confidence, strategy_keys, exchange, fee,
        stop_loss, take_profit, liquidation, targets, expected_exit,
        expected_profit, expected_duration, progress, status, open_time,
        last_analysis, last_update, mode, source, type, network, dca_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,0,'open',$22,$22,$22,$23,$24,$25,$26,0)
     RETURNING *`,
    [
      p.symbol, p.market, p.side, entry, entry, quantity, size,
      p.leverage, p.margin, p.score, p.confidence, p.strategyKeys ?? [],
      p.exchange ?? "paper", p.fee ?? 0, stopLoss, takeProfit,
      p.liquidation ?? null, p.targets ?? [], p.expectedExit ?? null,
      p.expectedProfit ?? null, p.expectedDuration ?? null,
      p.openTime, p.mode ?? "demo", p.source ?? "engine",
      p.type ?? "futures", p.network ?? null,
    ]
  );
  return r.rows[0] as Row;
}

/** Heartbeat upsert for engine_state. */
export async function setEngineState(key: string, value: Row): Promise<void> {
  await pool.query(
    `INSERT INTO engine_state (key, value, updated_at)
     VALUES ($1, $2, (extract(epoch from now()) * 1000)::bigint)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
       updated_at = EXCLUDED.updated_at`,
    [key, JSON.stringify(value)]
  );
}

export async function getEngineState(key: string): Promise<Row | null> {
  const r = await one<Row>(
    "SELECT value FROM engine_state WHERE key = $1",
    [key]
  );
  return r ? (typeof r.value === "string" ? JSON.parse(r.value) : r.value) : null;
}

/** Append an engine log row. */
export async function logEngine(
  level: string,
  message: string,
  meta?: unknown,
  source = "engine"
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO engine_logs (level, message, meta, source)
       VALUES ($1, $2, $3, $4)`,
      [level, message.slice(0, 4000), meta ? JSON.stringify(meta).slice(0, 8000) : null, source]
    );
  } catch {
    /* logging must never crash the caller */
  }
}

/** Append an audit log row. */
export async function audit(
  action: string,
  actor?: string | null,
  actorId?: string | null,
  target?: string | null,
  details?: unknown,
  ip?: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (action, actor, actor_id, target, details, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        action.slice(0, 200),
        actor ?? null,
        actorId ?? null,
        target ?? null,
        details ? JSON.stringify(details).slice(0, 8000) : null,
        ip ?? null,
      ]
    );
  } catch {
    /* ignore */
  }
}

/** Graceful shutdown. */
export async function closeDb(): Promise<void> {
  await pool.end();
}
