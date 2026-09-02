// ---------------------------------------------------------------------------
// restApi.ts — Convex↔REST compatibility layer.
//
// The preview app (and therefore the ENTIRE Dashboard UI) is written against
// Convex hooks (`useQuery(api.x.y, args)` / `useMutation(...)` / `useAction`).
// On the self-hosted backend those calls are served by plain REST routes under
// /api. This file maps every Convex function name used by the dashboard to its
// REST route, caches results, and exposes backend-compatible hook wrappers so
// Dashboard.tsx keeps its exact preview behavior on the server build.
//
// Semantics intentionally mirror Convex:
//   • pending  → `undefined`
//   • skipped  ("skip" sentinel) → stays `undefined`, no request
//   • after any successful mutation → refetch every mounted query
//   • light polling mimics live queries; paused when the tab is hidden
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useState } from "react";
import { joinApi } from "@/lib/backend";
import { getFunctionName } from "convex/server";
import { logApiError } from "@/lib/api-error-logger";
import { toast } from "sonner";

// ─── auth token ──────────────────────────────────────────────────────────────
export function readAuthToken(): string {
  try {
    const t = window.localStorage.getItem("wolf.token");
    const exp = Number(window.localStorage.getItem("wolf.expiresAt") ?? 0);
    if (t && exp && Date.now() > exp) return "";
    return t ?? "";
  } catch {
    return "";
  }
}

function clearSessionAndGoLogin() {
  try {
    window.localStorage.removeItem("wolf.token");
    window.localStorage.removeItem("wolf.expiresAt");
    window.sessionStorage.removeItem("wolf.loginComplete");
  } catch { /* noop */ }
  if (!window.location.pathname.startsWith("/auth")) window.location.assign("/auth");
}

async function restCall<T = any>(
  method: string,
  pathWithQuery: string,
  body?: unknown,
  timeoutMs = 30_000,
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = readAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(joinApi(pathWithQuery), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e: any) {
    const errMsg = e?.name === "AbortError" ? "سرور پاسخ نداد." : String(e?.message ?? e);
    logApiError({
      endpoint: pathWithQuery,
      method,
      statusCode: 0,
      responseData: null,
      error: errMsg,
    });
    const err = new Error(errMsg) as any;
    err.endpoint = pathWithQuery;
    err.method = method;
    err.status = 0;
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
  let data: any = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    logApiError({
      endpoint: pathWithQuery,
      method,
      statusCode: res.status,
      responseData: data,
    });
    if (res.status === 401) clearSessionAndGoLogin();
    const statusMap: Record<number, string> = {
      400: "اطلاعات یا درخواست ورودی نامعتبر است (400)",
      401: "نشست کاری منقضی شده است؛ لطفاً دوباره وارد شوید (401)",
      403: "شما دسترسی لازم برای این عملیات را ندارید (403)",
      404: "مورد درخواستی یا مسیر پیدا نشد (404)",
      409: "تداخل اطلاعات — کاربر یا داده‌ای با این مشخصات از قبل وجود دارد (409)",
      429: "تعداد درخواست‌ها بیش از حد مجاز است، کمی صبر کنید (429)",
      500: "خطای داخلی سرور (500) — وضعیت دیتابیس و پارامترها را بررسی کنید",
      502: "اتصال سرور/پروکسی ناموفق شد (502). وضعیت وب‌سرور و سرویس‌ها را بررسی کنید.",
      503: "سرویس موقتاً در دسترس نیست (503)",
      504: "زمان پاسخگویی سرور به پایان رسید (504)",
    };
    const fallback = statusMap[res.status] ?? `خطای شبکه/سرور (کد ${res.status})`;
    const rawMsg = data?.error ?? data?.message;
    const msg = (rawMsg && typeof rawMsg === "string" && rawMsg.trim()) ? rawMsg.trim() : fallback;
    const err = new Error(msg) as any;
    err.status = res.status;
    err.endpoint = pathWithQuery;
    err.method = method;
    err.responseData = data;
    throw err;
  }
  return data as T;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const stripToken = (args: any): any => {
  if (!args || typeof args !== "object") return args;
  const { token: _drop, ...rest } = args;
  return rest;
};

const qsOf = (q?: Record<string, string>) => {
  const parts = Object.entries(q ?? {}).filter(([, v]) => v !== undefined && v !== "");
  if (!parts.length) return "";
  return `?${parts.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
};

/** Extract the first array found anywhere in a response envelope. */
function firstArray(d: any): any {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    for (const v of Object.values(d)) if (Array.isArray(v)) return v;
  }
  return [];
}

type Spec =
  | string                                       // shorthand "METHOD /path"
  | {
      m?: string;
      p: string | ((a: any) => string);
      q?: (a: any) => Record<string, string>;
      b?: (a: any) => any;
      pick?: (d: any, a: any) => any;
      /** long-running server work — allow up to 120s before aborting */
      slow?: boolean;
      /** payload is a list → error fallback is an empty array */
      list?: boolean;
    };

const GQ = (path: string): Spec => ({
  m: "GET",
  p: (a: any) => path.replace(":s", encodeURIComponent(String(a?.symbol ?? ""))),
  q: (a: any) => ({ tf: String(a?.tf ?? "15m") }),
});

// ─── risk-advisor memo (REST has no job store; advice is computed inline) ────
let lastRiskAdvice: any = null;

const OVERVIEW_SKELETON = {
  engine: { status: "OFFLINE", mode: "demo", enabled: true, autonomous: true, version: "1.0.0", lastSignalAt: 0, lastScanAt: 0, heartbeat: 0 },
  positions: { open: 0, openPnl: 0, sizeExposure: 0, closed: 0, wins: 0, losses: 0, winRate: 0, realizedPnl: 0 },
  markets: { total: 0, forex: 0, crypto: 0 },
  strategies: { total: 0, enabled: 0 },
  signals: { open: 0, recent: [] as any[] },
  lessons: [] as any[],
  logs: [] as any[],
  portfolio: { capital: 0, equity: 0, unrealizedPnl: 0, realizedPnl: 0 },
};

/** Never allow a missing block to reach the UI — always shape-complete. */
function mergeOverview(d: any): any {
  const src = d && typeof d === "object" ? d : {};
  return {
    ...OVERVIEW_SKELETON,
    ...src,
    engine: { ...OVERVIEW_SKELETON.engine, ...(src.engine ?? {}) },
    positions: { ...OVERVIEW_SKELETON.positions, ...(src.positions ?? {}) },
    markets: { ...OVERVIEW_SKELETON.markets, ...(src.markets ?? {}) },
    strategies: { ...OVERVIEW_SKELETON.strategies, ...(src.strategies ?? {}) },
    signals: { ...OVERVIEW_SKELETON.signals, ...(src.signals ?? {}), recent: src.signals?.recent ?? [] },
    portfolio: { ...OVERVIEW_SKELETON.portfolio, ...(src.portfolio ?? {}) },
    lessons: src.lessons ?? [],
    logs: src.logs ?? [],
  };
}

// ─── the map: Convex name → REST route ───────────────────────────────────────
const ROUTES: Record<string, Spec> = {
  // ── core reads ──
  // overview is read as overview?.markets.total / engine.status / ... — every
  // nested block must ALWAYS exist (even when the request fails) or the
  // dashboard header crashes. Deep-merge over a complete skeleton.
  "dashboard:overview": { m: "GET", p: "/overview", pick: (d) => mergeOverview(d) },
  "admin:myAccount": { m: "GET", p: "/account", pick: (d) => d },
  "markets:listMarkets": { m: "GET", p: "/markets", pick: (d) => d?.markets ?? firstArray(d) },
  "markets:listAllMarkets": { m: "GET", p: "/markets?all=true", pick: (d) => d?.markets ?? firstArray(d) },
  "markets:listCandles": { m: "GET", p: (a: any) => `/markets/${encodeURIComponent(String(a?.symbol ?? ""))}/candles`, q: (a: any) => ({ tf: String(a?.timeframe ?? a?.tf ?? "15m") }), pick: (d) => ({ data: d?.candles ?? [], source: d?.source ?? "unknown", count: Number(d?.count ?? d?.candles?.length ?? 0) }) },
  "markets:ensureCandles": { m: "GET", p: (a: any) => `/markets/${encodeURIComponent(String(a?.symbol ?? ""))}/candles`, q: (a: any) => ({ tf: String(a?.timeframe ?? a?.tf ?? "15m") }), pick: (d) => ({ data: d?.candles ?? [], source: d?.source ?? "unknown", count: Number(d?.count ?? d?.candles?.length ?? 0) }) },
  "engineWorker:ensureManualCandles": { m: "GET", p: (a: any) => `/markets/${encodeURIComponent(String(a?.symbol ?? ""))}/candles`, q: (a: any) => ({ tf: String(a?.timeframe ?? a?.tf ?? "15m") }), pick: (d) => ({ data: d?.candles ?? [], source: d?.source ?? "unknown", count: Number(d?.count ?? d?.candles?.length ?? 0) }) },
  "strategies:listStrategies": { m: "GET", p: "/strategies", pick: (d) => d?.strategies ?? firstArray(d) },
  "strategies:listStrategyPresets": { m: "GET", p: "/admin/strategies/presets", pick: (d) => d },
  "admin:listStrategyPresets": { m: "GET", p: "/admin/strategies/presets", pick: (d) => d },
  // The dashboard reads flat dot-keys (engine.autonomous, channel.postTrades,
  // telegram.enabled, ...). /settings/public only exposes a landing subset, so
  // pull the FULL settings map from the admin endpoint (secrets are masked
  // server-side) — this is why toggles used to snap back to OFF.
  "settings:allSettings": { m: "GET", p: "/admin/settings", pick: (d) => d?.settings ?? d },
  "monitor:serverStats": { m: "GET", p: "/monitor/stats", pick: (d) => d },

  // ── coins / wallet / signals ──
  "coins:myCoins": { m: "GET", p: "/coins", pick: (d) => d },
  "coins:listCoinTransactions": { m: "GET", p: "/wallet", pick: (d) => d?.transactions ?? firstArray(d) },
  "coins:myPredictions": { m: "GET", p: "/coins/predictions", pick: (d) => d?.predictions ?? firstArray(d) },
  "coins:listVouchers": { m: "GET", p: "/admin/coins", pick: (d) => d?.vouchers ?? firstArray(d) },
  "admin:mySignals": { m: "GET", p: "/signals/my", pick: (d) => d?.signals ?? firstArray(d) },
  // /api/admin/positions returns both lists at once ({ open, closed }).
  "admin:listOpenPositions": { m: "GET", p: "/admin/positions", pick: (d) => d?.open ?? d?.positions ?? firstArray(d) },
  "admin:listClosedPositions": { m: "GET", p: "/admin/positions", pick: (d) => d?.closed ?? d?.positions ?? firstArray(d) },

  // ── learning / AI ──
  "learning:publicEducation": { m: "GET", p: "/education", pick: (d) => d?.education ?? d?.days ?? firstArray(d) },
  "learning:listEducation": { m: "GET", p: "/admin/education/days", pick: (d) => d?.days ?? firstArray(d) },
  "admin:listLearningHistory": { m: "GET", p: "/admin/learning", pick: (d) => d?.items ?? firstArray(d) },
  "aiChat:myAiChats": { m: "GET", p: "/ai/chats", pick: (d) => d?.chats ?? firstArray(d) },
  "aiChat:listAiUsage": { m: "GET", p: "/admin/ai/usage", pick: (d) => d },
  "admin:aiProviderHealth": { m: "GET", p: "/admin/ai/providers", pick: (d) => d?.providers ?? firstArray(d) },

  // ── admin lists ──
  "admin:listVipPackages": { m: "GET", p: "/admin/vip/packages", pick: (d) => d?.packages ?? firstArray(d) },
  "admin:listVipRequests": { m: "GET", p: "/admin/vip/requests", pick: (d) => d?.requests ?? firstArray(d) },
  "admin:listUsers": { m: "GET", p: "/admin/users", pick: (d) => d?.users ?? firstArray(d) },
  "admin:userSearch": {
    m: "GET",
    p: "/admin/users",
    q: (a) => ({ q: String(a?.query ?? "") }),
    pick: (d) => d?.users ?? firstArray(d),
  },
  "admin:userDetail": { m: "GET", p: (a) => `/admin/users/${encodeURIComponent(String(a?.userId ?? a?.id ?? ""))}`, pick: (d) => d },
  "admin:listWalletAddresses": { m: "GET", p: "/admin/wallet/addresses", pick: (d) => d?.addresses ?? firstArray(d) },
  "admin:listTransactions": { m: "GET", p: "/admin/wallet/transactions", pick: (d) => d?.transactions ?? firstArray(d) },
  "admin:listReferrals": { m: "GET", p: "/admin/referrals", pick: (d) => d?.referrals ?? firstArray(d) },
  "admin:myReferral": { m: "GET", p: "/referral", pick: (d) => d },
  "admin:listExchangeAccounts": { m: "GET", p: "/admin/exchanges", pick: (d) => d?.accounts ?? firstArray(d) },
  "admin:listStrategyPerformance": { m: "GET", p: "/admin/strategies", pick: (d) => d?.strategies ?? firstArray(d) },
  "admin:tradingReports": {
    m: "GET",
    p: "/admin/reports",
    q: (a) => ({ period: String(a?.period ?? "daily") }),
    pick: (d) => d,
  },
  "admin:listEngineLogs": { m: "GET", p: "/admin/logs", pick: (d) => d?.logs ?? firstArray(d) },
  "admin:listAuditLogs": { m: "GET", p: "/admin/logs", pick: (d) => d?.audit ?? d?.logs ?? firstArray(d) },
  "admin:listMyTickets": { m: "GET", p: "/support/tickets", pick: (d) => d?.tickets ?? firstArray(d) },
  "admin:listAllTickets": { m: "GET", p: "/admin/support/tickets", pick: (d) => d?.tickets ?? firstArray(d) },
  "admin:listNotifications": { m: "GET", p: "/notifications", pick: (d) => d?.notifications ?? firstArray(d) },
  "admin:listFundamentalNews": { m: "GET", p: "/admin/news", pick: (d) => d?.news ?? firstArray(d) },
  "coins:financialHistory": { m: "GET", p: "/coins/history", pick: (d) => d?.history ?? firstArray(d) },

  // ── swapwallet reads ──
  "swapwallet:swapwalletOverview": { m: "GET", p: "/admin/swapwallet", pick: (d) => d },
  "swapwallet:swapwalletWithdrawConfig": { m: "POST", p: "/admin/swapwallet/withdraw-config", b: (a) => ({ token: a?.token ?? "USDT" }) },

  // ── risk advisor: static gates from live settings + memoized AI review ──
  "admin:riskAdvisor": {
    m: "GET",
    p: "/admin/settings",
    pick: (d) => {
      const s: Record<string, any> = (d?.settings ?? d) || {};
      const minScore = Number(s["risk.minScore"] ?? 35);
      const stopAtr = Number(s["risk.stopOffsetATR"] ?? 0);
      const consensus = Number(s["risk.minConsensus"] ?? 0);
      const confirmations = Number(s["risk.minConfirmations"] ?? 0);
      const maxDrawdown = Number(s["risk.maxDrawdown"] ?? 0);
      return {
        preset: String(s["risk.preset"] ?? "balanced"),
        minScore,
        riskPerTradeUsd: Number((Number(s["risk.virtualCapital"] ?? 1000) * Number(s["risk.riskPerTrade"] ?? 1.5) / 100).toFixed(2)),
        multiplier: Number(s["risk.maxLeverage"] ?? 1),
        checks: {
          minScoreOk: minScore >= 1 && minScore <= 100,
          stopLossOk: stopAtr > 0,
          consensusOk: consensus >= 0.5,
          confirmationsOk: confirmations >= 1,
          drawdownOk: maxDrawdown > 0,
          freshData: s["risk.requireFreshData"] !== false,
        },
        summaryFa: "حداقل امتیاز فقط یک فیلتر اولیه از بازهٔ ۱ تا ۱۰۰ است؛ اجماع، تأیید مستقل، داده تازه و گیت‌های ریسک همچنان اجباری‌اند.",
        summaryEn: "Minimum score is only a 1–100 first filter; consensus, independent confirmations, fresh data and risk gates remain mandatory.",
      };
    },
  },
  "riskAdvisor:review": { m: "GET", p: "__memo__risk_advice" },
  "me:me": { m: "GET", p: "/account", pick: (d) => d },
  "users:currentUser": { m: "GET", p: "/account", pick: (d) => d },
  "authHelpers:currentUser": { m: "GET", p: "/account", pick: (d) => d },
  "tradingArena:getArenaAnalysis": { m: "GET", p: "/admin/strategies", pick: (d) => d },
  "tradingArena:getLiveWinningFeed": { m: "GET", p: "/admin/positions", pick: (d) => d?.open ?? [] },
};

// Mark every list-shaped route so failed/forbidden reads degrade to []
// instead of a spinner or a crash.
for (const k of Object.keys(ROUTES)) {
  if (/(list|Search|Packages|Chats|Education|Learning|Logs|Tickets|Transactions|Users|Referrals|Addresses|Positions|Predictions|Vouchers|Signals|History|Queries|News)/i.test(k)) {
    const r = ROUTES[k];
    if (typeof r === "object" && r) r.list = true;
  }
}

function routeFor(name: string): Spec {
  if (ROUTES[name]) return ROUTES[name];
  if (MUTATIONS[name]) return MUTATIONS[name];
  throw new Error(`عملیات ${name} در سرور تعریف نشده است. (تابع نگاشت‌نشده)`);
}

function resolveSpec(spec: Spec, args: any): { method: string; path: string; body?: any } {
  if (typeof spec === "string") {
    const [m, ...rest] = spec.split(" ");
    return { method: m, path: rest.join(" ") };
  }
  const rawPath = typeof spec.p === "function" ? spec.p(args) : spec.p;
  return { method: (spec.m ?? "GET").toUpperCase(), path: rawPath + qsOf(spec.q?.(args)), body: spec.b?.(args) };
}

async function executeRoute(spec: Spec, name: string, args: any): Promise<any> {
  // Special flows that don't map to plain HTTP:
  if (typeof spec !== "string" && spec.p === "__memo__risk_advice") return lastRiskAdvice ?? { status: "idle" };

  const { method, path, body } = resolveSpec(spec, args);
  if (typeof spec !== "string" && spec.p === "/settings/public" && method === "GET") {
    const [pub, stats] = await Promise.all([
      restCall<any>("GET", path),
      restCall<any>("GET", joinApi("/monitor/stats")).catch(() => null),
    ]);
    return { ...(stats ?? {}), ...pub, engineStats: stats ?? null };
  }
  const data = await restCall(method, path, method === "GET" ? undefined : (body ?? {}), (typeof spec !== "string" && spec.slow) ? 120_000 : 30_000);
  void name;
  return data;
}

function pickResult(spec: Spec, d: any, a: any): any {
  if (typeof spec === "string") return d;
  if (d && typeof d === "object" && spec.p === "__memo__risk_advice") return lastRiskAdvice;
  return spec.pick ? spec.pick(d, a) : d;
}

// ─── cache store + invalidation bus ─────────────────────────────────────────
type Entry = {
  data?: any;
  error?: Error;
  loading: boolean;
  ts: number;
  tags: string[];
  /** true once a first load finished — data then stays visible while refreshing */
  resolved: boolean;
  /** set by mutations/polls; epoch effect refetches it (stale-while-revalidate) */
  stale: boolean;
};

const store = new Map<string, Entry>();
const listeners = new Set<() => void>();
const inflight = new Map<string, Promise<void>>();

// Invalidation KEEPS the previous data (stale-while-revalidate) so the UI
// never flickers to empty while a refetch is in flight.
function bumpTags(tags: string[]) {
  for (const [, e] of store) if (e.tags.some((t) => tags.includes(t))) e.stale = true;
  listeners.forEach((l) => l());
}
export const bumpAll = () => bumpTags(["*"]);

function keyOf(name: string, args: any): string {
  if (args === "skip") return "";
  try { return `${name}|${JSON.stringify(sortArgs(args))}`; } catch { return ""; }
}
function sortArgs(v: any): any {
  if (Array.isArray(v)) return v.map(sortArgs);
  if (v && typeof v === "object") {
    const o: Record<string, any> = {};
    for (const k of Object.keys(v).sort()) o[k] = sortArgs(v[k]);
    return o;
  }
  return v ?? null;
}

const POLL_MS: Array<[RegExp, number]> = [
  [/^dashboard:overview$/, 20_000],
  [/^markets:listMarkets$/, 30_000],
  [/^admin:listOpenPositions$/, 25_000],
  [/^monitor:serverStats$/, 30_000],
  [/^admin:listEngineLogs$/, 45_000],
  [/^admin:listNotifications$/, 60_000],
];

function pollFor(name: string): number {
  for (const [re, ms] of POLL_MS) if (re.test(name)) return ms;
  return 0;
}

/**
 * Recursively alias every `id` to `_id` AND convert snake_case keys to
 * camelCase so Postgres-shaped REST rows satisfy UI written for Convex
 * documents (_id, closeReason, vipPackage, pnlPct, ...).
 */
const camelizeKey = (k: string) => k === "id" || k === "kind"
  ? k
  : k.includes("_") && !/^[A-Z]/.test(k)
    ? k.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase())
    : k;

function aliasIds(x: any): any {
  if (Array.isArray(x)) return x.map(aliasIds);
  if (x && typeof x === "object" && !(x instanceof Date)) {
    const out: Record<string, any> = {};
    let rawId: any;
    for (const [rawK, v] of Object.entries(x)) {
      const k = camelizeKey(rawK);
      if (rawK === "id") { rawId = v; out[k] = v; continue; }
      out[k] = aliasIds(v);
    }
    if (rawId != null && out._id === undefined) out._id = rawId;
    return out;
  }
  return x;
}

async function loadEntry(key: string, name: string, args: any, force = false): Promise<void> {
  const existing = inflight.get(key);
  if (existing) return existing;
  // Fresh data (<4s) is left alone unless a mutation explicitly forced it.
  const fresh = store.get(key);
  if (!force && fresh && !fresh.loading && Date.now() - fresh.ts < 4_000) return;
  const exec = (async () => {
    const prior = store.get(key);
    const entry: Entry = prior
      ? { ...prior, loading: true, ts: Date.now(), stale: false }
      : { loading: true, ts: Date.now(), tags: ["*", name.split(":")[0]], resolved: false, stale: false };
    store.set(key, entry);
    try {
      const spec = routeFor(name);
      const data = await executeRoute(spec, name, args);
      entry.data = aliasIds(pickResult(spec, data, args));
      entry.error = undefined;
    } catch (e: any) {
      const errObj = e instanceof Error ? e : new Error(String(e));
      entry.error = errObj;
      // A refresh failure KEEPS the previous data; only a first-ever load
      // degrades to the empty shape for the route ([] / {} / null).
      if (!prior || !prior.resolved) {
        const spec = routeFor(name);
        const empty = (typeof spec !== "string" && spec.pick)
          ? pickResult(spec, {}, args)
          : (typeof spec !== "string" && spec.list ? [] : null);
        const aliased = aliasIds(empty);
        if (aliased != null && typeof aliased === "object") {
          try { (aliased as any).error = errObj.message; } catch { /* noop */ }
        }
        entry.data = aliased;
      } else if (entry.data != null && typeof entry.data === "object") {
        try { (entry.data as any).error = errObj.message; } catch { /* noop */ }
      }
    } finally {
      entry.loading = false;
      entry.ts = Date.now();
      entry.resolved = true;
      inflight.delete(key);
      listeners.forEach((l) => l());
    }
  })();
  inflight.set(key, exec);
  return exec;
}

// Single lightweight ticker drives polling; paused while the tab is hidden.
let tickerStarted = false;
function ensureTicker() {
  if (tickerStarted || typeof window === "undefined") return;
  tickerStarted = true;
  window.setInterval(() => {
    if (document.hidden) return;
    const nowTs = Date.now();
    for (const [k, e] of store) {
      if (e.loading) continue;
      const name = k.split("|")[0];
      const period = pollFor(name);
      if (period && nowTs - e.ts >= period) {
        const argsJson = k.slice(name.length + 1);
        let args: any = {};
        try { args = JSON.parse(argsJson); } catch { /* keep {} */ }
        void loadEntry(k, name, args);
      }
    }
  }, 5_000);
}

// ─── public hooks (backend-shaped) ───────────────────────────────────────────
export function useRestQuery(reference: any, args: any): any {
  const name: string = getFunctionName(reference) ?? "";
  const key = keyOf(name, args);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const listener = () => setEpoch((n) => n + 1);
    listeners.add(listener);
    ensureTicker();
    return () => { listeners.delete(listener); };
  }, []);

  // Refetch when the cache for this key is invalidated by a mutation (epoch
  // bump) — without this, list queries would stay empty after any write.
  useEffect(() => {
    if (key) {
      const e = store.get(key);
      void loadEntry(key, name, args, Boolean(e?.stale));
    }
  }, [key, epoch]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!key || args === "skip") return undefined;
  const e = store.get(key);
  // Resolved queries always render their data (even mid-refresh); only a
  // never-loaded key shows the loading (undefined) state.
  return e && (e.resolved || !e.loading) ? e.data : undefined;
}

export function useRestMutation(reference: any): (args?: any) => Promise<any> {
  const name: string = getFunctionName(reference) ?? "";
  return useCallback(async (callArgs: any = {}) => {
    const cleanArgs = stripToken(callArgs);
    try {
      // Interceptions for flows without direct HTTP equivalents:
      if (name === "riskAdvisor:request") {
        const res: any = await restCall("POST", joinApi("/admin/settings/ai-risk-advice"), {});
        lastRiskAdvice = res?.text != null
          ? { status: "done", text: String(res.text ?? res.summaryFa ?? "") }
          : (res ?? { status: "done", text: "" });
        for (const k of [...store.keys()]) if (k.startsWith("riskAdvisor:review|")) store.delete(k);
        listeners.forEach((l) => l());
        return { key: "advice" };
      }
      if (name === "nodeCalls:edgeTtsHealth") return { ok: false };
      if (name === "nodeCalls:telegramGetWebhookInfo") {
        return await restCall("GET", joinApi("/admin/telegram/webhook-info"));
      }
      if (name === "nodeCalls:telegramSetupWebhook") {
        const botTok = String(callArgs?.botToken ?? "").trim();
        const pub = String(callArgs?.publicUrl ?? "").trim();
        return await restCall("POST", joinApi("/admin/telegram/set-webhook"), {
          botToken: botTok && !/[•…*]{3,}/.test(botTok) ? botTok : undefined,
          publicUrl: pub || undefined,
        });
      }
      if (name.startsWith("broker:")) {
        throw new Error("کارگزار CCXT فقط در نسخهٔ ابری فعال است؛ از تب «صرافی‌ها» استفاده کنید.");
      }
      if (name === "aiChat:speakText") {
        throw new Error("تبدیل متن به گفتار در نسخهٔ سرور فعال نیست.");
      }

      const spec = MUTATIONS[name] ?? ROUTES[name];
      if (!spec) {
        throw new Error(`عملیات ${name} در سرور تعریف نشده است. (تابع نگاشت‌نشده)`);
      }
      const { method, path, body } = resolveSpec(spec, cleanArgs);
      const isSlow = typeof spec !== "string" && Boolean((spec as any).slow);
      const timeoutMs = isSlow ? 120_000 : 30_000;
      const result = await restCall(method, path, method === "GET" ? undefined : (body ?? {}), timeoutMs);
      bumpAll(); // refetch every mounted query after any write
      return result;
    } catch (err: any) {
      const errMsg = String(err?.message || err || "خطا در اجرای عملیات");
      toast.error(errMsg);
      logApiError({
        endpoint: name,
        method: "MUTATION",
        statusCode: (err as any)?.status || 500,
        responseData: null,
        error: errMsg,
      });
      throw err;
    }
  }, [name]);
}

// Mutation verb mapping for names whose REST routes differ from Convex kinds.
const uid = (a: any, ...keys: string[]): string => {
  for (const k of keys) if (a?.[k] != null && a[k] !== "") return encodeURIComponent(String(a[k]));
  return "";
};

const MUTATIONS: Record<string, Spec> = {
  // strategies & markets
  "strategies:toggleStrategy": { m: "PATCH", p: (a) => `/admin/strategies/${uid(a, "key", "strategyKey")}`, b: (a) => ({ enabled: a?.enabled }) },
  "strategies:applyStrategyPreset": { m: "POST", p: "/admin/strategies/preset", b: (a) => ({ preset: a?.presetId ?? a?.preset }) },
  "strategies:applyMultipleStrategyPresets": { m: "POST", p: "/admin/strategies/presets/apply-multiple", b: (a) => ({ presetIds: a?.presetIds ?? a?.presets ?? [] }) },
  "markets:toggleMarket": { m: "PATCH", p: (a) => `/admin/markets/${uid(a, "symbol")}`, b: (a) => ({ enabled: a?.enabled ?? true }) },
  "markets:seedMarkets": { m: "POST", p: "/admin/markets/seed" },
  "admin:claimVipTrial": { m: "POST", p: "/admin/users/claim-vip-trial", b: (a) => stripToken(a) },
  "admin:applyDiscountCode": { m: "POST", p: "/admin/discount/apply", b: (a) => ({ code: a?.code, userId: a?.userId }) },

  // engine control & ops
  "engineWorker:runScanNow": { m: "POST", p: "/admin/engine/scan", slow: true },
  "engineWorker:runScan": { m: "POST", p: "/admin/engine/scan", slow: true },
  "engineWorker:runBacktest": { m: "POST", p: "/admin/engine/backtest", b: (a) => stripToken(a), slow: true },
  "engineWorker:runAiBacktest": { m: "POST", p: "/admin/engine/ai-backtest", b: (a) => stripToken(a), slow: true },
  "engineWorker:runTuner": { m: "POST", p: "/admin/engine/tuner", slow: true },
  "engineWorker:runResearch": { m: "POST", p: "/admin/engine/research", slow: true },
  "engineWorker:manualOpen": { m: "POST", p: "/admin/positions/open", b: (a) => stripToken(a) },
  "admin:engineControl": { m: "POST", p: "/admin/engine/mode", b: (a) => stripToken(a) },
  "admin:commitToEngine": { m: "POST", p: "/admin/engine/mode", b: (a) => stripToken(a) },
  "admin:pauseNewTrades": { m: "POST", p: "/admin/emergency/pause", b: (a) => ({ pause: a?.paused ?? a?.pause ?? true }) },
  "admin:emergencyStop": { m: "POST", p: "/admin/emergency/stop", b: (a) => ({ stop: a?.stop !== false }) },
  "admin:closePosition": { m: "POST", p: (a) => `/admin/positions/${uid(a, "positionId", "id")}/close` },
  "admin:manualClosePosition": { m: "POST", p: (a) => `/admin/positions/${uid(a, "positionId", "id")}/close` },
  "admin:closeAllPositions": { m: "POST", p: "/admin/emergency/close-all", b: (a) => ({ confirm: a?.confirmPhrase === "بستن" || a?.confirmPhrase === "ببند" || a?.confirmPhrase?.toLowerCase() === "close" || a?.confirm === "CLOSE_ALL" || a?.confirm === "ببند" || a?.confirm?.toLowerCase() === "close" ? "CLOSE_ALL" : "" }) },
  "admin:refreshStrategyPerformance": { m: "POST", p: "/admin/engine/scan", slow: true },
  "admin:applyReferral": { m: "POST", p: "/referral/apply", b: (a) => ({ code: a?.code }) },

  // users
  "admin:createUser": { m: "POST", p: "/admin/users", b: (a) => stripToken(a) },
  "admin:setUserRole": { m: "PATCH", p: (a) => `/admin/users/${uid(a, "userId", "id")}`, b: (a) => ({ role: a?.role, is_vip: a?.role === "vip" }) },
  "admin:setUserEnabled": { m: "PATCH", p: (a) => `/admin/users/${uid(a, "userId", "id")}`, b: (a) => ({ enabled: !!a?.enabled }) },
  "admin:setUserPassword": { m: "PATCH", p: (a) => `/admin/users/${uid(a, "userId", "id")}`, b: (a) => ({ password: a?.password }) },
  "admin:deleteUser": { m: "DELETE", p: (a) => `/admin/users/${uid(a, "userId", "id")}` },

  // exchanges
  "admin:saveExchangeAccount": { m: "POST", p: "/admin/exchanges", b: (a) => stripToken(a) },
  "admin:setExchangeEnabled": { m: "PATCH", p: (a) => `/admin/exchanges/${uid(a, "accountId", "id")}`, b: (a) => ({ enabled: !!a?.enabled }) },
  "admin:removeExchangeAccount": { m: "DELETE", p: (a) => `/admin/exchanges/${uid(a, "accountId", "id")}` },
  "admin:testExchangeAccount": { m: "POST", p: (a) => `/admin/exchanges/${uid(a, "accountId", "id")}/test` },

  // wallet / transactions
  "admin:submitDeposit": { m: "POST", p: "/wallet/deposit", b: (a) => stripToken(a) },
  "admin:requestWithdrawal": { m: "POST", p: "/wallet/withdraw", b: (a) => stripToken(a) },
  "admin:requestUnfreeze": { m: "POST", p: "/wallet/unfreeze", b: (a) => stripToken(a) },
  "admin:saveWalletAddress": { m: "POST", p: "/admin/wallet/addresses", b: (a) => stripToken(a) },
  "admin:removeWalletAddress": { m: "DELETE", p: "/admin/wallet/addresses", b: (a) => ({ id: a?.addressId ?? a?.id, asset: a?.asset, network: a?.network }) },
  "admin:reviewTransaction": { m: "POST", p: (a) => `/admin/wallet/transactions/${uid(a, "transactionId", "id")}/confirm`, b: (a) => ({ approve: a?.approve !== false, note: a?.note }) },

  // vip
  "admin:requestVip": { m: "POST", p: "/vip/request", b: (a) => stripToken(a) },
  "admin:reviewVip": { m: "POST", p: (a) => `/admin/vip/requests/${uid(a, "requestId", "id")}/review`, b: (a) => ({ approve: a?.approve !== false, note: a?.note }) },
  "admin:saveVipPackage": { m: "PATCH", p: (a) => `/admin/vip/packages/${uid(a, "key", "packageKey")}`, b: (a) => stripToken(a) },

  // notifications & support tickets
  "admin:createNotification": { m: "POST", p: "/admin/notify", b: (a) => stripToken(a) },
  "admin:markNotificationSeen": { m: "POST", p: "/notifications/read", b: (a) => ({ id: a?.id ?? (a?.ids?.[0] ?? "all") }) },
  "admin:createTicket": { m: "POST", p: "/support/tickets", b: (a) => ({ subject: a?.subject, text: a?.message ?? a?.text, ...stripToken(a) }) },
  "admin:userReplyTicket": { m: "POST", p: (a) => `/support/tickets/${uid(a, "ticketId", "id")}/messages`, b: (a) => ({ text: a?.message ?? a?.text }) },
  "admin:replyTicket": { m: "POST", p: (a) => `/admin/support/tickets/${uid(a, "ticketId", "id")}/reply`, b: (a) => ({ text: a?.message ?? a?.text }) },
  "admin:setTicketStatus": { m: "PATCH", p: (a) => `/admin/support/tickets/${uid(a, "ticketId", "id")}`, b: (a) => ({ status: a?.status ?? "closed" }) },

  // settings
  "admin:saveSettings": { m: "POST", p: "/admin/settings", b: (a) => ({ settings: a?.settings ?? stripToken(a) }) },
  "admin:applyRiskPreset": { m: "POST", p: "/admin/settings/preset", b: (a) => ({ preset: a?.preset ?? a?.presetId ?? a?.key }) },
  // reset trades / history (server requires the CLEAR_HISTORY confirmation phrase)
  "admin:resetData": { m: "POST", p: "/admin/history/clear", b: (a) => ({ confirm: "CLEAR_HISTORY", scope: a?.scope ?? "all" }) },
  // full-platform reporting: download a JSON report / restore it back to the DB
  "admin:exportData": { m: "GET", p: "/admin/reports/export" },
  "admin:importData": { m: "POST", p: "/admin/reports/import", b: (a) => ({ data: a?.data }) },

  // coins economy
  "coins:buyWolfCoins": { m: "POST", p: "/coins/buy", b: (a) => stripToken(a) },
  "coins:buyWolfCoinsWithUsdt": { m: "POST", p: "/coins/buy-wolf", b: (a) => ({ ...stripToken(a), paymentMethod: "usdt" }) },
  "coins:burnCoins": { m: "POST", p: "/coins/burn", b: (a) => stripToken(a) },
  "coins:claimProfileReward": { m: "POST", p: "/coins/claim-reward" },
  "coins:buyCoinPackage": { m: "POST", p: "/coins/package", b: (a) => stripToken(a) },
  "coins:buyCoinPackageWithUsdt": { m: "POST", p: "/coins/package", b: (a) => ({ ...stripToken(a), paymentMethod: "usdt" }) },
  "coins:swapTomanToUsdt": { m: "POST", p: "/coins/swap-toman-usdt", b: (a) => stripToken(a) },
  "coins:swapUsdtToToman": { m: "POST", p: "/coins/swap-usdt-toman", b: (a) => stripToken(a) },
  "coins:startQuiz": { m: "POST", p: "/coins/quiz/start", b: (a) => stripToken(a) },
  "coins:resolveQuiz": { m: "POST", p: "/coins/quiz/resolve", b: (a) => stripToken(a) },
  "coins:startPrediction": { m: "POST", p: "/coins/prediction/start", b: (a) => stripToken(a) },
  "coins:resolvePrediction": { m: "POST", p: "/coins/prediction/resolve", b: (a) => stripToken(a) },
  "coins:redeemVoucher": { m: "POST", p: "/coins/voucher/redeem", b: (a) => stripToken(a) },
  "coins:unlockSignalDetail": { m: "POST", p: (a) => `/signals/${uid(a, "signalId", "id")}/unlock` },
  "coins:submitTomanDeposit": { m: "POST", p: "/wallet/deposit-toman", b: (a) => stripToken(a) },
  "coins:adjustUserBalance": { m: "POST", p: "/admin/coins/adjust", b: (a) => stripToken(a) },
  "coins:createVoucher": { m: "POST", p: "/admin/coins/voucher", b: (a) => stripToken(a) },
  "coins:toggleVoucher": { m: "POST", p: "/admin/coins/voucher", b: (a) => ({ ...stripToken(a), toggle: true }) },
  "coins:updateUserAccount": { m: "POST", p: "/auth/preferences", b: (a) => stripToken(a) },

  // me
  "me:updatePreferences": { m: "POST", p: "/auth/preferences", b: (a) => stripToken(a) },
  "me:changeMyPassword": { m: "POST", p: "/auth/change-password", b: (a) => stripToken(a) },
  "me:setAiPreference": { m: "POST", p: "/auth/ai-preference", b: (a) => stripToken(a) },
  "me:connectTelegram": { m: "POST", p: "/auth/telegram/connect", b: (a) => stripToken(a) },
  "me:confirmWithdrawTelegram": { m: "POST", p: "/wallet/withdraw", b: (a) => ({ ...stripToken(a), confirmTelegram: true }) },

  // ai chat / usage
  "aiChat:askWolfAi": { m: "POST", p: "/ai/chat", b: (a) => stripToken(a) },
  "aiChat:testAi": { m: "POST", p: "/admin/ai/test", b: () => ({}) },
  "aiChat:suggestStrategies": { m: "POST", p: "/admin/ai/suggest", b: (a) => stripToken(a) },
  "aiChat:clearAiHistory": { m: "POST", p: "/ai/prune", b: () => ({ all: true }) },
  "aiChat:deleteAiRows": { m: "POST", p: "/ai/prune", b: (a) => ({ ids: a?.ids ?? [] }) },
  "admin:clearAiUsage": { m: "POST", p: "/admin/ai/clear" },

  // node calls → server telegram bridge
  "nodeCalls:telegramSetupWebhook": { m: "POST", p: "/admin/telegram/set-webhook", b: (a) => stripToken(a) },
  "nodeCalls:telegramGetWebhookInfo": { m: "GET", p: "/admin/telegram/webhook-info" },
  "telegram:getWebhookInfo": { m: "GET", p: "/admin/telegram/webhook-info" },
  "nodeCalls:telegramTestBot": { m: "POST", p: "/admin/telegram/send", b: (a) => ({ test: "bot", chatId: a?.chatId, text: a?.text ?? "تست ربات 🐺", ...stripToken(a) }) },
  "nodeCalls:telegramTestChannels": { m: "POST", p: "/admin/telegram/send", b: (a) => ({ test: "channels", text: a?.text ?? "تست کانال‌ها 🐺", ...stripToken(a) }) },
  "nodeCalls:edgeTtsHealth": { m: "GET", p: "/admin/ai/providers" },

  // adminActions → telegram / positions broadcast
  "adminActions:sendSignalToChannel": { m: "POST", p: (a) => a?.id || a?.signalId ? `/admin/signals/${uid(a, "signalId", "id")}/telegram` : "/admin/telegram/send", b: (a) => ({ kind: "signal", text: a?.text, signalId: a?.signalId ?? a?.id, ...stripToken(a) }) },
  "adminActions:sendChartToChannel": { m: "POST", p: "/admin/telegram/chart", b: (a) => stripToken(a) },
  "adminActions:chartImageFor": { m: "POST", p: "/admin/charts/preview", b: (a) => stripToken(a) },
  "admin:chartImagePreview": { m: "POST", p: "/admin/charts/preview", b: (a) => stripToken(a) },
  "adminActions:sendPositionToChannels": { m: "POST", p: (a) => `/admin/positions/${uid(a, "positionId", "id")}/telegram` },
  "adminActions:sendAllPositionsToTelegram": { m: "POST", p: "/admin/positions/send-all-telegram" },
  "admin:sendAllPositionsToTelegram": { m: "POST", p: "/admin/positions/send-all-telegram" },

  // learning
  "learning:triggerEducation": { m: "POST", p: "/admin/education/generate-day", b: (a) => stripToken(a), slow: true },
  "telegram:adminSendChat": { m: "POST", p: "/admin/telegram/send", b: (a) => ({ kind: "chat", ...stripToken(a) }) },
  "learning:reviewEducation": { m: "POST", p: "/admin/ai/review-learning", b: (a) => stripToken(a) },
  "learning:sendEducationToChannel": { m: "POST", p: (a) => `/admin/education/${uid(a, "lessonId", "day", "id")}/send`, b: (a) => stripToken(a) },
  "learning:regenerateLessonMedia": { m: "POST", p: (a) => `/admin/education/${uid(a, "lessonId", "day", "id")}/media`, b: (a) => stripToken(a) },

  // swapwallet
  "swapwallet:swapwalletSwap": { m: "POST", p: "/admin/swapwallet/swap", b: (a) => stripToken(a) },
  "swapwallet:swapwalletOtcQuote": { m: "POST", p: "/admin/swapwallet/quote", b: (a) => stripToken(a) },
  "swapwallet:swapwalletOtcExecute": { m: "POST", p: "/admin/swapwallet/order", b: (a) => stripToken(a) },
  "swapwallet:swapwalletWithdraw": { m: "POST", p: "/admin/swapwallet/withdraw", b: (a) => stripToken(a) },
  "admin:setSwapwalletEnabled": { m: "POST", p: "/admin/swapwallet/enabled", b: (a) => ({ enabled: !!a?.enabled }) },
  "admin:saveSwapwallet": { m: "POST", p: "/admin/swapwallet/key", b: (a) => ({ apiKey: a?.apiKey ?? a?.key }) },
};
