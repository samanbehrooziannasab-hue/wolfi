// ---------------------------------------------------------------------------
// Backend selector — the app runs in ONE of two modes (build-time flag):
//
//   VITE_BACKEND=convex  (default)  → the Convex backend (src/convex/) — used by
//                                    the Freebuff preview and the current live app.
//   VITE_BACKEND=rest               → the self-hosted backend (server/ — Hono +
//                                    PostgreSQL + Redis) with NO Convex anywhere.
//                                    VITE_API_URL points at it (default: /api).
//
// This file is the single seam: everything backend-specific branches on
// `BACKEND`. It never changes at runtime (import.meta.env is baked at build).
// ---------------------------------------------------------------------------
export type Backend = "convex" | "rest";

export const BACKEND: Backend =
  (import.meta.env.VITE_BACKEND as string | undefined)?.trim().toLowerCase() === "rest"
    ? "rest"
    : "convex";

/** Base URL of the self-hosted API. Same-origin `/api` by default. */
export const REST_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/+$/, "") || "/api";

/**
 * Join REST_BASE (may or may not include /api) with a path that may or may
 * not start with /api — never double the prefix.
 */
export function joinApi(path: string): string {
  let p = path.startsWith("/") ? path : `/${path}`;
  const baseHasApi = /\/api\/?$/.test(REST_BASE);
  const pathHasApi = /^\/api(?:\/|$)/.test(p);
  if (baseHasApi && pathHasApi) p = p.replace(/^\/api/, "");
  if (!baseHasApi && !pathHasApi) p = `/api${p}`;
  return `${REST_BASE}${p}`;
}

const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * Generic REST call against the self-hosted backend (throws on !ok).
 * Every call has a hard timeout so a hung upstream can never leave the UI in
 * an infinite spinner / black screen (the "loading loop" seen on the VPS).
 */
export async function restFetch<T = any>(
  path: string,
  opts: { method?: string; token?: string | null; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      res = await fetch(joinApi(path), {
        method: opts.method ?? "GET",
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timer);
    }
  } catch (e: any) {
    // AbortController → "AbortError"; translate to a clear Persian-friendly error.
    if (e?.name === "AbortError" || String(e?.message ?? "").includes("aborted")) {
      const err = new Error("سرور پاسخ نداد. دوباره تلاش کنید.") as any;
      err.status = 0;
      err.timeout = true;
      throw err;
    }
    throw new Error(String(e?.message ?? "network_error"));
  }
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    // empty body — fine for 204-style responses
  }
  if (!res.ok) {
    const err = new Error(String(data?.error ?? data?.message ?? `http_${res.status}`)) as any;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

/** Map the server's snake_case AuthUser → the frontend WolfUser shape. */
export function mapServerUser(u: any): any {
  if (!u) return null;
  const username = String(u.username ?? "").trim().toLowerCase();
  const role = String(u.role ?? "user").trim().toLowerCase();
  const isAdmin = u.is_admin === true || u.is_admin === 1 || role === "admin" || username === "wolfadmin";
  const isAssistant = !isAdmin && (u.is_assistant === true || u.is_assistant === 1 || role === "assistant");
  return {
    id: String(u.id ?? ""),
    name: u.name ?? u.username ?? "Trading Wolf",
    username: u.username ?? undefined,
    tgId: u.tg_id ?? undefined,
    tgUsername: u.tg_username ?? undefined,
    firstName: u.first_name ?? undefined,
    lastName: u.last_name ?? undefined,
    phone: u.phone ?? undefined,
    role: isAdmin ? "admin" : isAssistant ? "assistant" : (role || "user"),
    isVip: Boolean(u.is_vip),
    vipPackage: u.vip_package ?? undefined,
    vipExpiresAt: u.vip_expires_at ?? undefined,
    isAdmin,
    isAssistant,
    enabled: u.enabled !== false,
    canTrade: u.can_trade !== false,
    theme: u.theme ?? "dark",
    language: u.language ?? "fa",
    walletAddress: u.wallet_address ?? undefined,
    registeredAt: u.created_at ? new Date(u.created_at).getTime() : undefined,
  };
}

/** Money/number formatter shared by the self-hosted panel. */
export function fmtNum(v: any, digits = 4): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtUsd(v: any, digits = 2): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: digits })}`;
}
