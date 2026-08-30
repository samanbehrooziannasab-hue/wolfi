// ---------------------------------------------------------------------------
// Engine log + audit log helpers (bounded, never crash callers)
// ---------------------------------------------------------------------------
import { internal } from "./_generated/api";

export async function log(
  ctx: any,
  level: "INFO" | "WARNING" | "ERROR" | "CRITICAL" | "TRADE" | "AI" | "SECURITY" | "LEARNING",
  message: string,
  meta?: string,
  source = "engine",
): Promise<void> {
  try {
    await ctx.db.insert("engineLogs", {
      level,
      message,
      meta,
      created: Date.now(),
      source,
    });
    // Errors and critical alerts are pushed straight to the admin's Telegram.
    if (level === "ERROR" || level === "CRITICAL") {
      try {
        await ctx.scheduler.runAfter(0, internal.notify.notifyAdmin, {
          text: `⚠️ <b>${level}</b> · ${source}\n${String(message).slice(0, 900)}${meta ? `\n<code>${String(meta).slice(0, 500)}</code>` : ""}`,
        });
      } catch {
        // telegram must never break logging
      }
    }
  } catch {
    // logging must never break the caller
  }
}

export async function audit(
  ctx: any,
  action: string,
  actor?: string,
  actorId?: string,
  target?: string,
  details?: string,
  ip?: string,
): Promise<void> {
  try {
    await ctx.db.insert("auditLogs", {
      action,
      actor,
      actorId,
      target,
      details,
      ip,
      created: Date.now(),
    });
  } catch {
    // ignore
  }
}

/** Keeps the logs table bounded. */
export async function trimLogs(ctx: any, max = 10000): Promise<void> {
  try {
    const total = await ctx.db.query("engineLogs").count();
    const excess = total - max;
    if (excess <= 0) return;
    const oldest = await ctx.db.query("engineLogs").order("asc").take(excess);
    for (const o of oldest) {
      await ctx.db.delete(o._id);
    }
  } catch {
    // ignore
  }
}