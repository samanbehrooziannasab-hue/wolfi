// ---------------------------------------------------------------------------
// SelfHostedPanel — full dashboard for VITE_BACKEND=rest (self-hosted server/).
// Shell mirrors the Convex admin panel (header, world clock, grouped admin nav).
// Covers ALL user + admin sections with feature parity to Dashboard.tsx.
// Never imports Convex; talks to the REST API (Hono + PostgreSQL).
// ---------------------------------------------------------------------------
import logo from "@/assets/logo.svg";
import { MarketClock } from "@/components/MarketClock";
import { BACKEND, fmtNum, fmtUsd, restFetch, REST_BASE } from "@/lib/backend";
import { useWolfAuth } from "@/hooks/use-wolf-auth";
import { LangToggle, useI18n, type Lang } from "@/lib/i18n";
import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, BadgeCheck, BarChart3, Bell, BookOpen,
  Bot, BrainCircuit, Briefcase, CheckCircle, ChevronDown, ClipboardList, Code,
  Coins, CreditCard, Database, DollarSign, Download, ExternalLink, Eye,
  FileText, FlaskConical, Gift, Globe, Hash, Headphones, History, Info,
  KeyRound, Landmark, Layers, LifeBuoy, LineChart, Link2, Loader2, Lock,
  LogOut, Megaphone, MessageCircle, Mic, Moon, Pause, Play, Plus, Power,
  Radio, RefreshCw, Rocket, Search, Send, Shield, Shuffle, SlidersHorizontal,
  StopCircle, Sun, TestTube, TrendingDown, TrendingUp, Trash2, Trophy,
  Unlock, User as UserIcon, UserPlus, Users, Wallet, Wifi, Wrench, X, Zap,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  Input, Label, Progress, Select, SelectContent, SelectItem, SelectTrigger,
  SelectValue, Separator, Switch, Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Textarea,
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui";
import { toast } from "sonner";

/* ─── REST data hook ────────────────────────────────────────────────────── */
function useRest<T = any>(path: string, token: string | null, deps: unknown[] = [], opts?: { skip?: boolean }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!opts?.skip);
  const requestRef = useMemo(() => ({ id: 0 }), []);
  const reload = useCallback(async () => {
    const requestId = ++requestRef.id;
    if (!token || opts?.skip) {
      if (requestId === requestRef.id) setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await restFetch<T>(path, { token, timeoutMs: 10_000 });
      if (requestId === requestRef.id) { setData(result); setError(null); }
    } catch (e: any) {
      if (requestId === requestRef.id) setError(String(e?.message ?? "error"));
    } finally {
      if (requestId === requestRef.id) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, token, opts?.skip, requestRef, ...deps]);
  useEffect(() => { void reload(); return () => { requestRef.id++; }; }, [reload, requestRef]);
  return { data, error, loading, reload };
}

/* ─── helpers ───────────────────────────────────────────────────────────── */
function fmtTime(ts: any, lang: Lang): string {
  if (!ts) return "—";
  const d = new Date(typeof ts === "string" ? ts : Number(ts));
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString(lang === "fa" ? "fa-IR" : "en-US", { dateStyle: "short", timeStyle: "short" });
}

function DirBadge({ dir }: { dir: string }) {
  const long = dir === "long";
  return <Badge variant="outline" className={`text-[10px] ${long ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-red-400/40 bg-red-400/10 text-red-300"}`}>{long ? "▲ LONG" : "▼ SHORT"}</Badge>;
}

function safeStr(v: any): string { if (v == null || v === "null" || v === "undefined") return "—"; if (typeof v === "string") return v; if (typeof v === "number") return String(v); if (typeof v === "object" && v.state) return String(v.state); if (typeof v === "object") return JSON.stringify(v).slice(0, 40); return String(v); }
function canonicalUserRole(u: any): "admin" | "assistant" | "vip" | "user" {
  const username = String(u?.username ?? "").toLowerCase();
  if (u?.is_admin === true || u?.role === "admin" || username === "wolfadmin") return "admin";
  if (u?.is_assistant === true || u?.role === "assistant") return "assistant";
  if (u?.is_vip === true || u?.role === "vip") return "vip";
  return "user";
}
function safeUserName(u: any): string {
  return safeStr(u?.name ?? u?.username ?? u?.tg_username ?? "Trading Wolf");
}
function Stat({ label, value, hint }: { label: string; value: any; hint?: string }) {
  return <Card className="border-border/70 bg-card/60"><CardContent className="p-4"><p className="text-[11px] font-bold text-muted-foreground">{label}</p><p className="terminal-font mt-1 text-xl font-bold tabular-nums" dir="ltr">{safeStr(value)}</p>{hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}</CardContent></Card>;
}

function StatusBadge({ ok, okText, badText }: { ok: boolean; okText?: string; badText?: string }) {
  return <Badge variant="outline" className={`text-[9px] ${ok ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-red-400/40 bg-red-400/10 text-red-300"}`}>{ok ? (okText ?? "✓") : (badText ?? "✗")}</Badge>;
}

/* ─── strings (fa / en) ─────────────────────────────────────────────────── */
const fa = {
  selfHostedNote: "API REST · سرور اختصاصی", serverHealthy: "● سرور سالم",
  refresh: "بروزرسانی", logout: "خروج",  roleAdmin: "admin", roleAssistant: "assistant",
  tabOverview: "نمای کلی", tabMarkets: "بازارها", tabStrategies: "استراتژی‌ها",
  tabEducation: "آموزش", tabAi: "AI", tabCoins: "ولف‌کوین", tabSignals: "سیگنال‌ها",
  tabWallet: "کیف پول", tabVip: "VIP", tabSupport: "پشتیبانی", tabNotifs: "اعلان‌ها",
  tabProfile: "پروفایل", tabAdmin: "ادمین",
  engineOnline: "موتور آنلاین", adminRole: "مدیر", assistantRole: "دستیار",
  grpEngine: "موتور و معاملات", grpMarkets: "بازارها، استراتژی و صرافی‌ها",
  grpUsers: "کاربران و مالی", grpSupport: "ارتباطات و پشتیبانی", grpSystem: "سیستم و هوش مصنوعی",
  posTab: "پوزیشن‌ها", riskTab: "ریسک", reportsTab: "گزارش‌ها", chartTab: "کندل و چارت",
  referralTab: "دعوت", connectionsTab: "اتصالات و کلیدها", monitorTab: "مانیتورینگ سرور",
  marketsWatched: "بازار تحت نظر", realizedPnl: "سود محقق‌شده", winRate: "نرخ برد",
  closedTrades: "معامله بسته‌شده", floatingPnl: "سود/زیان شناور", engineActive: "موتور فعال - ۲۴/۷",
  lastScan: "آخرین اسکن", openSignal: "سیگنال باز", activeStrategy: "استراتژی فعال",
  engineCapital: "سرمایه موتور (USDT)", total: "کل", closePrice: "قیمت بسته‌شدن",
  closeReason: "دلیل بستن", openTime: "زمان باز", closeTime: "زمان بسته",
  performance: "عملکرد استراتژی‌ها", closedHistory: "تاریخچه معاملات بسته",
  wins: "برد", losses: "باخت", profitFactor: "فاکتور سود", avgPnl: "میانگین سود",
  tradesCount: "تعداد", riskSettings: "تنظیمات ریسک",
  referralCode: "کد دعوت", invited: "دعوت‌شده", by: "توسط",
  candles: "کندل‌ها", tf: "تایم‌فریم", systemHealth: "سلامت سیستم",
  dbOk: "دیتابیس", engineOk: "موتور", online: "آنلاین", offline: "آفلاین",
  stopEngine: "توقف موتور", resumeEngine: "از سرگیری",
  balance: "موجودی", frozen: "فریز", totalPnl: "سود کل", trades: "معاملات",
  openPositions: "پوزیشن‌های باز", signalsLive: "سیگنال‌های فعال",
  none: "موردی نیست", recentTx: "تراکنش‌های اخیر", loading: "در حال بارگذاری…",
  symbol: "نماد", name: "نام", market: "بازار", price: "قیمت", change24h: "تغییر ۲۴س",
  forex: "فارکس", crypto: "کریپتو", entry: "ورود", sl: "حد ضرر", tp: "هدف",
  deposit: "ثبت واریز", withdraw: "درخواست برداشت", amountUsdt: "مبلغ (USDT)",
  txid: "TXID", address: "آدرس مقصد", depositAddresses: "آدرس‌های واریز",
  depositOk: "واریز ثبت شد ✓", withdrawOk: "برداشت ثبت شد ✓",
  vipRequest: "درخواست VIP", selectPkg: "انتخاب پکیج", capitalUsdt: "سرمایه (USDT)",
  capitalRange: "محدوده سرمایه", vipOk: "درخواست VIP ثبت شد",
  subject: "موضوع", message: "پیام", newTicket: "تیکت جدید", reply: "پاسخ",
  send: "ارسال", ticketOk: "تیکت ایجاد شد ✓", markAllRead: "خواندن همه",
  changePw: "تغییر رمز", oldPw: "رمز فعلی", newPw: "رمز جدید", pwOk: "رمز تغییر کرد ✓",
  profileInfo: "اطلاعات حساب", username: "نام کاربری", role: "نقش",
  phone: "تلفن", telegram: "تلگرام", language: "زبان",
  errFill: "فیلدهای الزامی را پر کنید", forbidden: "دسترسی محدود",
  saved: "ذخیره شد ✓", deleted: "حذف شد", engineStatus: "وضعیت موتور",
  heartbeat: "ضربان", capital: "سرمایه", mode: "حالت",
  engineControls: "کنترل موتور", scanNow: "اسکن", pauseTrades: "توقف",
  resume: "ادامه", engineLogs: "لاگ‌های موتور",
  adminOverview: "نمای کلی ادمین", adminWorkspace: "فضای کاری",
  adminEngine: "کنترل موتور", adminStrategies: "مدیریت استراتژی‌ها",
  adminExchanges: "صرافی‌ها", adminAiProviders: "سرویس‌های AI",
  adminSwapWallet: "SwapWallet", adminSettings: "تنظیمات",
  adminUsers: "کاربران", adminWallet: "کیف پول", adminVipMgt: "مدیریت VIP",
  adminCoins: "ولف‌کوین", adminEducation: "آموزش", adminSupport: "پشتیبانی",
  adminTelegram: "تلگرام", adminLogs: "لاگ‌ها و ممیزی",
  all: "همه", enabled: "فعال", disabled: "غیرفعال",
  create: "ایجاد", update: "بروزرسانی", close: "بستن", cancel: "لغو",
  confirm: "تأیید", webhook: "تنظیم Webhook", test: "تست",
  askAi: "پرسش از AI", aiPlaceholder: "سؤال خود را بنویسید…",
  wolfCoins: "ولف‌کوین", toman: "تومان", coinLedger: "دفترکل",
  voucherCreate: "ایجاد ووچر", voucherCode: "کد", voucherCoins: "تعداد کوین",
  voucherMaxUses: "حداکثر استفاده", adjustCoins: "تنظیم موجودی",
  userId: "شناسه کاربر", delta: "تغییر",
  educationCreate: "ایجاد آموزش", titleFa: "عنوان فارسی", titleEn: "عنوان انگلیسی",
  bodyFa: "متن فارسی", bodyEn: "متن انگلیسی", day: "روز",
  approved: "تأیید شده", pending: "در انتظار", rejected: "رد شده",
  search: "جستجو", filter: "فیلتر", export: "خروجی",
  emgStop: "توقف اضطراری", closeAll: "بستن همه", engineMode: "حالت موتور",
  real: "واقعی", demo: "آزمایشی", paper: "کاغذی",
  apiKey: "کلید API", secret: "Secret", provider: "سرویس‌دهنده",
  baseUrl: "آدرس پایه", model: "مدل", priority: "اولویت",
  purpose: "کاربرد", add: "افزودن",
  footer: "Trading Wolf AI — موتور معاملاتی هوش مصنوعی",
  confirmed: "تأیید شده", failed: "ناموفق", tabUsers: "کاربران", tabExchanges: "صرافی‌ها",
};
const en: typeof fa = {
  selfHostedNote: "API REST", serverHealthy: "● Server Healthy",
  refresh: "Refresh all", logout: "Logout",  roleAdmin: "admin", roleAssistant: "assistant",
  tabOverview: "Overview", tabMarkets: "Markets", tabStrategies: "Strategies",
  tabEducation: "Education", tabAi: "AI", tabCoins: "Wolf Coins", tabSignals: "Signals",
  tabWallet: "Wallet", tabVip: "VIP", tabSupport: "Support", tabNotifs: "Notifications",
  tabProfile: "Profile", tabAdmin: "Admin",
  engineOnline: "Engine Online", adminRole: "Admin", assistantRole: "Assistant",
  grpEngine: "Engine & Trading", grpMarkets: "Markets, Strategies & Exchanges",
  grpUsers: "Users & Finance", grpSupport: "Communication & Support", grpSystem: "System & AI",
  posTab: "Positions", riskTab: "Risk", reportsTab: "Reports", chartTab: "Candles & Chart",
  referralTab: "Referrals", connectionsTab: "Connections & Keys", monitorTab: "Server Monitoring",
  marketsWatched: "Watched Markets", realizedPnl: "Realized PnL", winRate: "Win Rate",
  closedTrades: "Closed Trades", floatingPnl: "Floating PnL", engineActive: "Engine Active - 24/7",
  lastScan: "Last Scan", openSignal: "Open Signals", activeStrategy: "Active Strategies",
  engineCapital: "Engine Capital (USDT)", total: "Total", closePrice: "Close Price",
  closeReason: "Close Reason", openTime: "Open Time", closeTime: "Close Time",
  performance: "Strategy Performance", closedHistory: "Closed Trades History",
  wins: "Wins", losses: "Losses", profitFactor: "Profit Factor", avgPnl: "Avg PnL",
  tradesCount: "Trades", riskSettings: "Risk Settings",
  referralCode: "Referral Code", invited: "Referred", by: "By",
  candles: "Candles", tf: "Timeframe", systemHealth: "System Health",
  dbOk: "Database", engineOk: "Engine", online: "Online", offline: "Offline",
  stopEngine: "Stop Engine", resumeEngine: "Resume",
  balance: "Balance", frozen: "Frozen", totalPnl: "Total PnL", trades: "Trades",
  openPositions: "Open Positions", signalsLive: "Active Signals",
  none: "None", recentTx: "Recent Transactions", loading: "Loading…",
  symbol: "Symbol", name: "Name", market: "Market", price: "Price", change24h: "24h Change",
  forex: "Forex", crypto: "Crypto", entry: "Entry", sl: "SL", tp: "TP",
  deposit: "Deposit", withdraw: "Withdraw", amountUsdt: "Amount (USDT)",
  txid: "TXID", address: "Address", depositAddresses: "Deposit Addresses",
  depositOk: "Deposit submitted ✓", withdrawOk: "Withdrawal submitted ✓",
  vipRequest: "VIP Request", selectPkg: "Select Package", capitalUsdt: "Capital (USDT)",
  capitalRange: "Capital Range", vipOk: "VIP request submitted ✓",
  subject: "Subject", message: "Message", newTicket: "New Ticket", reply: "Reply",
  send: "Send", ticketOk: "Ticket created ✓", markAllRead: "Mark All Read",
  changePw: "Change Password", oldPw: "Old Password", newPw: "New Password", pwOk: "Password changed ✓",
  profileInfo: "Profile", username: "Username", role: "Role",
  phone: "Phone", telegram: "Telegram", language: "Language",
  errFill: "Fill required fields", forbidden: "Access denied",
  saved: "Saved ✓", deleted: "Deleted", engineStatus: "Engine Status",
  heartbeat: "Heartbeat", capital: "Capital", mode: "Mode",
  engineControls: "Engine Controls", scanNow: "Scan", pauseTrades: "Pause",
  resume: "Resume", engineLogs: "Engine Logs",
  adminOverview: "Admin Overview", adminWorkspace: "Workspace",
  adminEngine: "Engine Control", adminStrategies: "Strategies",
  adminExchanges: "Exchanges", adminAiProviders: "AI Providers",
  adminSwapWallet: "SwapWallet", adminSettings: "Settings",
  adminUsers: "Users", adminWallet: "Wallet", adminVipMgt: "VIP Management",
  adminCoins: "Wolf Coins", adminEducation: "Education", adminSupport: "Support",
  adminTelegram: "Telegram", adminLogs: "Logs & Audit",
  all: "All", enabled: "Enabled", disabled: "Disabled",
  create: "Create", update: "Update", close: "Close", cancel: "Cancel",
  confirm: "Confirm", webhook: "Set Webhook", test: "Test",
  askAi: "Ask AI", aiPlaceholder: "Ask about markets or risk…",
  wolfCoins: "Wolf Coins", toman: "Toman", coinLedger: "Ledger",
  voucherCreate: "Create Voucher", voucherCode: "Code", voucherCoins: "Coins",
  voucherMaxUses: "Max Uses", adjustCoins: "Adjust Balance",
  userId: "User ID", delta: "Delta",
  educationCreate: "Create Education", titleFa: "Title (FA)", titleEn: "Title (EN)",
  bodyFa: "Body (FA)", bodyEn: "Body (EN)", day: "Day",
  approved: "Approved", pending: "Pending", rejected: "Rejected",
  search: "Search", filter: "Filter", export: "Export",
  emgStop: "Emergency Stop", closeAll: "Close All", engineMode: "Engine Mode",
  real: "Real", demo: "Demo", paper: "Paper",
  apiKey: "API Key", secret: "Secret", provider: "Provider",
  baseUrl: "Base URL", model: "Model", priority: "Priority",
  purpose: "Purpose", add: "Add",
  footer: "Trading Wolf AI — Autonomous Trading Engine",
  confirmed: "Confirmed", failed: "Failed", tabUsers: "Users", tabExchanges: "Exchanges",
};

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function SelfHostedPanel() {
  const { lang, setLang } = useI18n();
  const s = lang === "fa" ? fa : en;
  const { user, token, isAdmin, isAssistant, logout } = useWolfAuth();
  const [tab, setTab] = useState("overview");
  const [adminTab, setAdminTab] = useState("overview");
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try { return (window.localStorage.getItem("wolf.theme") as "dark" | "light") || "dark"; } catch { return "dark"; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    try { window.localStorage.setItem("wolf.theme", theme); } catch {}
  }, [theme]);

  // ── core data ──────────────────────────────────────────────────────────
  const dash = useRest<any>("/api/dashboard", token, []);
  // Keep the first paint cheap: only dashboard data is required for Overview.
  // Other sections fetch when selected, preventing a large REST burst and the
  // browser freeze seen on small VPS instances.
  const mkts = useRest<any>("/api/markets", token, [tab], { skip: !["markets", "chart"].includes(tab) });
  const strats = useRest<any>("/api/strategies", token, [tab], { skip: !["strategies", "overview"].includes(tab) });
  const edu = useRest<any>("/api/education", token, [tab], { skip: !["education", "admin"].includes(tab) });
  const coinData = useRest<any>("/api/coins", token, [tab], { skip: !["coins", "overview"].includes(tab) });
  const sigs = useRest<any>("/api/signals/recent", token, [tab], { skip: !["signals", "overview"].includes(tab) });
  const wal = useRest<any>("/api/wallet", token, [tab], { skip: !["wallet", "overview"].includes(tab) });
  const pkgs = useRest<any>("/api/vip/packages", token, [tab], { skip: tab !== "vip" });
  const tix = useRest<any>("/api/support/tickets", token, [tab], { skip: tab !== "support" });
  const notifs = useRest<any>("/api/notifications", token, [tab], { skip: tab !== "notifications" });
  const health = useRest<any>("/api/monitor/health", token, [tab], { skip: !["overview", "admin"].includes(tab) });
  // Only fetch the expensive admin datasets when the admin area is opened.
  // The previous implementation fired every admin query on dashboard mount,
  // which created a large request/DB burst and made low-resource VPSs appear
  // frozen.
  const adminOpen = tab === "admin";
  const adminOv = useRest<any>("/api/admin/overview", token, [adminOpen], { skip: !adminOpen || (!isAdmin && !isAssistant) });
  const adminWs = useRest<any>("/api/admin/workspace", token, [adminOpen], { skip: !adminOpen || (!isAdmin && !isAssistant) });
  const adminSet = useRest<any>("/api/admin/settings", token, [adminOpen], { skip: !adminOpen || !isAdmin });
  const adminEx = useRest<any>("/api/admin/exchanges", token, [adminOpen], { skip: !adminOpen || !isAdmin });
  const adminAi = useRest<any>("/api/admin/ai/providers", token, [adminOpen], { skip: !adminOpen || !isAdmin });
  const adminSw = useRest<any>("/api/admin/swapwallet", token, [adminOpen], { skip: !adminOpen || !isAdmin });
  const adminLog = useRest<any>("/api/admin/logs", token, [adminOpen], { skip: !adminOpen || !isAdmin });
  const adminCoins = useRest<any>("/api/admin/coins", token, [adminOpen], { skip: !adminOpen || !isAdmin });
  const eduDays = useRest<any>("/api/admin/education/days", token, [adminOpen], { skip: !adminOpen || !isAdmin });
  const monStats = useRest<any>("/api/monitor/stats", token, [adminOpen], { skip: !adminOpen || !isAdmin });
  const mySigs = useRest<any>("/api/signals/my", token, [tab], { skip: tab !== "signals" });
  const tuningCtx = useRest<any>("/api/admin/ai/tuning-context", token, [adminOpen], { skip: !adminOpen || !isAdmin });

  // ── chart tab ───────────────────────────────────────────────────────────
  const [chartSym, setChartSym] = useState("BTCUSDT");
  const [chartTf, setChartTf] = useState("15m");
  const candles = useRest<any>(`/api/markets/${chartSym}/candles?tf=${chartTf}`, token, [chartSym, chartTf, tab], { skip: tab !== "chart" });

  const [busy, setBusy] = useState("");

  // Prevent repeated refresh clicks from creating overlapping request storms.
  const refreshLock = useMemo(() => ({ active: false }), []);

  // Remove legacy generated JSX markers before the first browser paint.
  // Older server-panel builds emitted one or more literal backslashes before n.
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-wolf-panel]");
    if (!root) return;
    const marker = new RegExp(String.fromCharCode(92) + "+n", "g");
    const cleanMarkers = () => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) nodes.push(node as Text);
      for (const text of nodes) {
        if (text.nodeValue) text.nodeValue = text.nodeValue.replace(marker, "");
      }
    };
    cleanMarkers();
    const observer = new MutationObserver(cleanMarkers);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const clearHistory = async () => {
    if (!isAdmin || !window.confirm(lang === "fa" ? "تاریخچه تحلیل، لاگ موتور و ممیزی پاک شود؟ پوزیشن‌ها و داده‌های مالی حذف نمی‌شوند." : "Clear analysis, engine-log and audit history? Open positions and financial records are preserved.")) return;
    setBusy("clear-history");
    try {
      await restFetch("/api/admin/history/clear", { method: "POST", token, body: { scope: "all", confirm: "CLEAR_HISTORY" } });
      toast.success(lang === "fa" ? "تاریخچه پاک شد" : "History cleared");
      adminLog.reload();
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setBusy("");
    }
  };

  const reloadAll = () => {
    if (refreshLock.active) return;
    refreshLock.active = true;
    dash.reload();
    if (tab === "markets" || tab === "chart") mkts.reload();
    if (tab === "strategies" || tab === "overview") strats.reload();
    if (tab === "education" || tab === "admin") edu.reload();
    if (tab === "coins" || tab === "overview") coinData.reload();
    if (tab === "signals" || tab === "overview") sigs.reload();
    if (tab === "wallet" || tab === "overview") wal.reload();
    if (tab === "vip") pkgs.reload();
    if (tab === "support") tix.reload();
    if (tab === "notifications") notifs.reload();
    if (tab === "overview" || tab === "admin") health.reload();
    if (tab === "admin" && (isAdmin || isAssistant)) { adminOv.reload(); adminWs.reload(); }
    window.setTimeout(() => { refreshLock.active = false; }, 500);
  };

  // ── wallet ──────────────────────────────────────────────────────────────
  const [depAmt, setDepAmt] = useState(""); const [depTxid, setDepTxid] = useState("");
  const [wdAmt, setWdAmt] = useState(""); const [wdAddr, setWdAddr] = useState("");
  const doDeposit = async () => {
    if (!depAmt || !depTxid) return toast.error(s.errFill);
    setBusy("dep"); try { await restFetch("/api/wallet/deposit", { method: "POST", token, body: { network: "TRC20", amount: depAmt, txid: depTxid } }); toast.success(s.depositOk); setDepAmt(""); setDepTxid(""); wal.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };
  const doWithdraw = async () => {
    if (!wdAmt || !wdAddr) return toast.error(s.errFill);
    setBusy("wd"); try { await restFetch("/api/wallet/withdraw", { method: "POST", token, body: { amount: wdAmt, network: "TRC20", address: wdAddr } }); toast.success(s.withdrawOk); setWdAmt(""); setWdAddr(""); wal.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };

  // ── VIP ─────────────────────────────────────────────────────────────────
  const [vipPkg, setVipPkg] = useState(""); const [vipCap, setVipCap] = useState("");
  const doVip = async () => {
    if (!vipPkg || !vipCap) return toast.error(s.errFill);
    setBusy("vip"); try { await restFetch("/api/vip/request", { method: "POST", token, body: { packageKey: vipPkg, capital: vipCap } }); toast.success(s.vipOk); setVipCap(""); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };

  // ── support ─────────────────────────────────────────────────────────────
  const [tSub, setTSub] = useState(""); const [tText, setTText] = useState("");
  const [selTicket, setSelTicket] = useState<any>(null); const [ticketMsgs, setTicketMsgs] = useState<any[]>([]);
  const [repText, setRepText] = useState("");
  const doTicket = async () => {
    if (!tSub || !tText) return toast.error(s.errFill);
    setBusy("tk"); try { await restFetch("/api/support/tickets", { method: "POST", token, body: { subject: tSub, text: tText } }); toast.success(s.ticketOk); setTSub(""); setTText(""); tix.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };
  const openTicket = async (t: any) => { setSelTicket(t); setTicketMsgs([]); try { const r: any = await restFetch(`/api/support/tickets/${t.id}`, { token }); setTicketMsgs(r?.messages ?? []); } catch {} };
  const doReply = async () => { if (!repText.trim() || !selTicket) return; setBusy("rep"); try { await restFetch(`/api/support/tickets/${selTicket.id}/messages`, { method: "POST", token, body: { text: repText } }); setRepText(""); openTicket(selTicket); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };

  // ── pw / notifs ─────────────────────────────────────────────────────────
  const [oldPw, setOldPw] = useState(""); const [newPw, setNewPw] = useState("");
  const doPw = async () => { if (!oldPw || !newPw) return toast.error(s.errFill); setBusy("pw"); try { await restFetch("/api/auth/change-password", { method: "POST", token, body: { old: oldPw, new: newPw } }); toast.success(s.pwOk); setOldPw(""); setNewPw(""); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const markRead = async () => { try { await restFetch("/api/notifications/read", { method: "POST", token, body: { id: "all" } }); notifs.reload(); } catch {} };

  // ── AI ──────────────────────────────────────────────────────────────────
  const [aiQ, setAiQ] = useState(""); const [aiAns, setAiAns] = useState<any>(null);
  const doAi = async () => { if (!aiQ.trim()) return; setBusy("ai"); try { setAiAns(await restFetch("/api/ai/chat", { method: "POST", token, body: { question: aiQ } })); setAiQ(""); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };

  // ── voucher ─────────────────────────────────────────────────────────────
  const [vouchCode, setVouchCode] = useState("");
  const doVoucher = async () => { if (!vouchCode) return; setBusy("vouch"); try { await restFetch("/api/coins/voucher/redeem", { method: "POST", token, body: { code: vouchCode } }); toast.success(s.saved); setVouchCode(""); coinData.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const doClaimReward = async () => { setBusy("reward"); try { const r: any = await restFetch("/api/coins/claim-reward", { method: "POST", token }); toast.success(r?.ok ? (lang === "fa" ? `+${r.coins} ولف‌کوین` : `+${r.coins} wolf coins`) : (lang === "fa" ? "قبلاً دریافت شده" : "Already claimed")); coinData.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const [buyCoinsQty, setBuyCoinsQty] = useState("");
  const doBuyCoins = async () => { const coins = Math.max(1, Math.floor(Number(buyCoinsQty))); if (!Number.isFinite(coins) || coins <= 0) return toast.error(s.errFill); setBusy("buy"); try { const r: any = await restFetch("/api/coins/buy", { method: "POST", token, body: { coins } }); toast.success(lang === "fa" ? `+${r.coins} ولف‌کوین خریداری شد` : `Bought ${r.coins} wolf coins`); setBuyCoinsQty(""); coinData.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };

  // ── prediction game / quiz / packages / signal unlock / unfreeze ────────
  const [predSym, setPredSym] = useState("BTCUSDT");
  const [predGame, setPredGame] = useState<any>(null);
  const [predHist, setPredHist] = useState<any[]>([]);
  const [quizCur, setQuizCur] = useState<any>(null);
  const [coinPkgs, setCoinPkgs] = useState<any[]>([]);
  useEffect(() => { if (!token) { setPredHist([]); return; } restFetch("/api/coins/predictions", { token }).then((r: any) => setPredHist(r?.predictions ?? [])).catch(() => {}); }, [token, predGame]);
  useEffect(() => { if (!token) return; restFetch("/api/coins/packages", { token }).then((r: any) => setCoinPkgs(r?.packages ?? [])).catch(() => {}); }, [token]);
  const doPredStart = async (sym: string) => { setBusy("pred"); try { setPredGame(await restFetch("/api/coins/prediction/start", { method: "POST", token, body: { symbol: sym } })); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const doPredResolve = async (dir: string) => { if (!predGame) return; setBusy(`pred:${dir}`); try { const r: any = await restFetch("/api/coins/prediction/resolve", { method: "POST", token, body: { id: predGame.id, direction: dir } }); toast.success(r?.won ? (lang === "fa" ? `\u{1F389} برد! +${r.reward} ولف‌کوین` : `\u{1F389} Won! +${r.reward} wolf coins`) : (lang === "fa" ? "باخت — دفعه بعد می‌بری" : "Lost — next time")); setPredGame(null); coinData.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const doQuizStart = async () => { setBusy("quiz"); try { setQuizCur(await restFetch("/api/coins/quiz/start", { method: "POST", token })); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const doQuizResolve = async (chosen: number) => { if (!quizCur) return; setBusy("quiz"); try { const r: any = await restFetch("/api/coins/quiz/resolve", { method: "POST", token, body: { id: quizCur.id, chosen } }); toast.success(r?.won ? (lang === "fa" ? `\u{1F389} درست! +${r.reward} ولف‌کوین` : `\u{1F389} Correct! +${r.reward} wolf coins`) : (lang === "fa" ? `اشتباه — پاسخ درست گزینه ${r.correct + 1}` : `Wrong — correct is #${r.correct + 1}`)); setQuizCur(null); coinData.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const doBuyPackage = async (idx: number) => { setBusy(`pkg:${idx}`); try { const r: any = await restFetch("/api/coins/package", { method: "POST", token, body: { index: idx } }); toast.success(lang === "fa" ? `+${r.coins} ولف‌کوین اضافه شد` : `+${r.coins} wolf coins`); coinData.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const [unlocked, setUnlocked] = useState<Record<string, any>>({});
  const doUnlockSignal = async (sigId: string) => { setBusy("unlock"); try { const r: any = await restFetch(`/api/signals/${sigId}/unlock`, { method: "POST", token }); setUnlocked((u) => ({ ...u, [sigId]: r.signal })); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const [unfAmt, setUnfAmt] = useState("");
  const doUnfreeze = async () => { const amount = Number(unfAmt); if (!Number.isFinite(amount) || amount <= 0) return toast.error(s.errFill); setBusy("unf"); try { await restFetch("/api/wallet/unfreeze", { method: "POST", token, body: { amount } }); toast.success(lang === "fa" ? "درخواست آزادسازی سرمایه ثبت شد — منتظر تأیید مدیر" : "Unfreeze request submitted"); setUnfAmt(""); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };

  // ── admin: engine tools + reports + ai usage ────────────────────────────
  const [btSym, setBtSym] = useState("BTCUSDT"); const [btTf, setBtTf] = useState("1h"); const [btRes, setBtRes] = useState<any>(null);
  const doBacktest = async () => { setBusy("bt"); setBtRes(null); try { setBtRes(await restFetch("/api/admin/engine/backtest", { method: "POST", token, body: { symbol: btSym, timeframe: btTf } })); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const [tunRes, setTunRes] = useState<any>(null);
  const doTuner = async () => { setBusy("tun"); setTunRes(null); try { setTunRes(await restFetch("/api/admin/engine/tuner", { method: "POST", token })); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const [moSym, setMoSym] = useState("BTCUSDT"); const [moSide, setMoSide] = useState("long");
  const doManualOpen = async (sym?: string, side?: string) => { setBusy("mo"); try { await restFetch("/api/admin/positions/open", { method: "POST", token, body: { symbol: sym ?? moSym, side: side ?? moSide } }); toast.success(s.saved); adminOv.reload(); adminWs.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const [repPeriod, setRepPeriod] = useState("daily");
  const reports = useRest(`/api/admin/reports?period=${repPeriod}`, token, [repPeriod], { skip: !isAdmin });
  const aiUsage = useRest("/api/admin/ai/usage", token, [], { skip: !isAdmin });
  const doClearAi = async () => { setBusy("aic"); try { await restFetch("/api/admin/ai/clear", { method: "POST", token }); toast.success(s.saved); aiUsage.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const doGenerateDay = async () => { setBusy("edg"); try { const r: any = await restFetch("/api/admin/education/generate-day", { method: "POST", token, body: { force: true } }); toast.success(r?.created ? s.saved : (lang === "fa" ? "از قبل ساخته شده" : "Already exists")); edu.reload(); adminWs.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const doTeleChart = async (sym: string, tf: string) => { setBusy("tlc"); try { await restFetch("/api/admin/telegram/chart", { method: "POST", token, body: { symbol: sym, timeframe: tf } }); toast.success(s.saved); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const doPosTelegram = async (id: string) => { setBusy(`ptg:${id}`); try { await restFetch(`/api/admin/positions/${id}/telegram`, { method: "POST", token }); toast.success(s.saved); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };

  // ── profile preferences / AI preference / free trial ──────────────────
  const [prefLang, setPrefLang] = useState("");
  const [prefTheme, setPrefTheme] = useState("");
  const [aiPrefProv, setAiPrefProv] = useState("");
  const [aiPrefModel, setAiPrefModel] = useState("");
  const doPrefs = async () => {
    const body: any = {};
    if (prefLang) body.language = prefLang;
    if (prefTheme) body.theme = prefTheme;
    if (!prefLang && !prefTheme) return toast.error(s.errFill);
    setBusy("prefs");
    try { await restFetch("/api/auth/preferences", { method: "POST", token, body }); toast.success(s.saved); if (prefTheme) setTheme(prefTheme as "dark" | "light"); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };
  const doAiPref = async () => {
    if (!aiPrefProv) return toast.error(s.errFill);
    setBusy("aipref");
    try { await restFetch("/api/auth/ai-preference", { method: "POST", token, body: { provider: aiPrefProv, model: aiPrefModel || undefined } }); toast.success(s.saved); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };
  const doTrial = async () => {
    setBusy("trial");
    try { await restFetch("/api/auth/free-trial", { method: "POST", token }); toast.success(lang === "fa" ? "دوره آزمایشی فعال شد 🎉" : "Free trial activated 🎉"); pkgs.reload(); wal.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };

  // ── my signals toggle ─────────────────────────────────────────────────
  const [myOnly, setMyOnly] = useState(false);
  const sigRows = myOnly ? (mySigs.data?.signals ?? []) : (sigs.data?.signals ?? []);

  // ── AI chat prune (own history) ───────────────────────────────────────
  const doPruneAi = async () => {
    if (!window.confirm(lang === "fa" ? "تاریخچه گفتگوهای AI شما پاک شود؟" : "Clear your AI chat history?")) return;
    setBusy("pruneai");
    try { await restFetch("/api/ai/prune", { method: "POST", token }); toast.success(s.saved); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };

  // ── toman deposit request ─────────────────────────────────────────────
  const [tDepAmt, setTDepAmt] = useState("");
  const [tDepRef, setTDepRef] = useState("");
  const doTomanDeposit = async () => {
    const amount = Math.floor(Number(tDepAmt));
    if (!Number.isFinite(amount) || amount < 10000) return toast.error(lang === "fa" ? "حداقل ۱۰٬۰۰۰ تومان" : "Min 10,000 toman");
    setBusy("tdep");
    try { await restFetch("/api/wallet/deposit-toman", { method: "POST", token, body: { amount, ref: tDepRef } }); toast.success(s.depositOk); setTDepAmt(""); setTDepRef(""); wal.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };

  // ── admin: positions bulk telegram ────────────────────────────────────
  const doSendAllPos = async () => {
    setBusy("sap");
    try { const r: any = await restFetch("/api/admin/positions/send-all-telegram", { method: "POST", token }); toast.success(lang === "fa" ? `${r.sent} پوزیشن ارسال شد` : `${r.sent} positions sent`); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };

  // ── admin: education send / regenerate media ──────────────────────────
  const doEduSend = async (id: string, lng: string) => {
    setBusy(`eds:${id}`);
    try { await restFetch(`/api/admin/education/${id}/send`, { method: "POST", token, body: { lang: lng } }); toast.success(s.saved); eduDays.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };
  const doEduMedia = async (id: string) => {
    setBusy(`edm:${id}`);
    try { await restFetch(`/api/admin/education/${id}/media`, { method: "POST", token, body: { kind: "image" } }); toast.success(s.saved); edu.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };

  // ── admin: AI learning supervisor + strategy suggestions ──────────────
  const [learnRes, setLearnRes] = useState<any>(null);
  const doLearnReview = async () => {
    setBusy("lr"); setLearnRes(null);
    try { setLearnRes(await restFetch("/api/admin/ai/review-learning", { method: "POST", token })); tuningCtx.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };
  const [suggestRes, setSuggestRes] = useState<any>(null);
  const [suggestFocus, setSuggestFocus] = useState("");
  const doSuggest = async () => {
    setBusy("sg"); setSuggestRes(null);
    try { setSuggestRes(await restFetch("/api/admin/ai/suggest", { method: "POST", token, body: { focus: suggestFocus } })); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };

  // ── admin: direct telegram message ────────────────────────────────────
  const [tgUserId, setTgUserId] = useState("");
  const [tgMsg, setTgMsg] = useState("");
  const doTgSend = async () => {
    if (!tgMsg.trim()) return toast.error(s.errFill);
    setBusy("tgs");
    try { await restFetch("/api/admin/telegram/send", { method: "POST", token, body: { userId: tgUserId, text: tgMsg } }); toast.success(s.saved); setTgMsg(""); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };

  // ── engine controls ─────────────────────────────────────────────────────
  const engAction = async (a: string) => { setBusy(a); try { await restFetch(`/api/admin/${a}`, { method: "POST", token }); toast.success(s.saved); adminOv.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const doStop = async (stop: boolean) => { setBusy("emg"); try { await restFetch("/api/admin/emergency/stop", { method: "POST", token, body: { stop } }); toast.success(s.saved); adminOv.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const doPause = async (pause: boolean) => { setBusy("pause"); try { await restFetch("/api/admin/emergency/pause", { method: "POST", token, body: { pause } }); toast.success(s.saved); adminOv.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const doCloseAll = async () => { setBusy("ca"); try { await restFetch("/api/admin/emergency/close-all", { method: "POST", token, body: { confirm: "CLOSE_ALL" } }); toast.success(s.saved); adminOv.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };

  // ── admin: strategies ───────────────────────────────────────────────────
  const toggleStrat = async (key: string, enabled: boolean) => { try { await restFetch(`/api/admin/strategies/${key}`, { method: "PATCH", token, body: { enabled } }); toast.success(s.saved); adminWs.reload(); } catch (e: any) { toast.error(String(e?.message)); } };
  const toggleAllStrats = async (on: boolean) => { try { await restFetch("/api/admin/strategies/toggle-all", { method: "POST", token, body: { enabled: on } }); toast.success(s.saved); adminWs.reload(); } catch (e: any) { toast.error(String(e?.message)); } };

  // ── admin: education ────────────────────────────────────────────────────
  const [eduTitleFa, setEduTitleFa] = useState(""); const [eduTitleEn, setEduTitleEn] = useState("");
  const [eduBodyFa, setEduBodyFa] = useState(""); const [eduBodyEn, setEduBodyEn] = useState("");
  const doEduCreate = async () => { if (!eduTitleFa || !eduTitleEn || !eduBodyFa || !eduBodyEn) return toast.error(s.errFill); setBusy("edu"); try { await restFetch("/api/admin/education", { method: "POST", token, body: { titleFa: eduTitleFa, titleEn: eduTitleEn, bodyFa: eduBodyFa, bodyEn: eduBodyEn, status: "pending" } }); toast.success(s.saved); setEduTitleFa(""); setEduTitleEn(""); setEduBodyFa(""); setEduBodyEn(""); adminWs.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const reviewEdu = async (id: string, st: string) => { try { await restFetch(`/api/admin/education/${id}`, { method: "PATCH", token, body: { status: st } }); toast.success(s.saved); adminWs.reload(); } catch (e: any) { toast.error(String(e?.message)); } };

  // ── admin: coins ────────────────────────────────────────────────────────
  const [adjUserId, setAdjUserId] = useState(""); const [adjDelta, setAdjDelta] = useState("");
  const doAdjCoins = async () => { if (!adjUserId || !adjDelta) return toast.error(s.errFill); setBusy("adj"); try { await restFetch("/api/admin/coins/adjust", { method: "POST", token, body: { userId: adjUserId, delta: Number(adjDelta) } }); toast.success(s.saved); adminCoins.reload(); coinData.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const [vCode, setVCode] = useState(""); const [vCoins, setVCoins] = useState(""); const [vMax, setVMax] = useState("10");
  const doVoucherCreate = async () => { if (!vCoins) return toast.error(s.errFill); setBusy("vc"); try { await restFetch("/api/admin/coins/voucher", { method: "POST", token, body: { code: vCode || undefined, coins: Number(vCoins), maxUses: Number(vMax) } }); toast.success(s.saved); adminCoins.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };

  // ── admin: SwapWallet ───────────────────────────────────────────────────
  const [swKey, setSwKey] = useState("");
  const doSwKey = async () => { if (!swKey) return; setBusy("swk"); try { await restFetch("/api/admin/swapwallet/key", { method: "POST", token, body: { apiKey: swKey, enabled: true } }); toast.success(s.saved); adminSw.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const doSwToggle = async (en: boolean) => { try { await restFetch("/api/admin/swapwallet/enabled", { method: "POST", token, body: { enabled: en } }); toast.success(s.saved); adminSw.reload(); } catch (e: any) { toast.error(String(e?.message)); } };

  // ── admin: settings ─────────────────────────────────────────────────────
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});
  const settingsSnapshot = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!adminSet.data?.settings) return;
    const serverValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(adminSet.data.settings)) serverValues[k] = String(v ?? "");
    setSettingsForm((current) => {
      const merged = { ...serverValues };
      for (const key of Object.keys(merged)) {
        if (current[key] !== undefined && current[key] !== settingsSnapshot.current[key]) merged[key] = current[key];
      }
      return merged;
    });
    settingsSnapshot.current = serverValues;
  }, [adminSet.data]);
  const doSaveSettings = async () => {
    setBusy("sets");
    try {
      // Send all non-masked values, including a newly typed bot token. The
      // server ignores masked placeholders and preserves existing secrets.
      const body: Record<string, any> = { ...settingsForm };
      await restFetch("/api/admin/settings", { method: "POST", token, body: { settings: body } });
      toast.success(s.saved);
      adminSet.reload();
    } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };

  // ── admin: user management ──────────────────────────────────────────────
  const [newUname, setNewUname] = useState(""); const [newUpw, setNewUpw] = useState("");
  const [newUName, setNewUName] = useState(""); const [newUTg, setNewUTg] = useState("");
  const doCreateUser = async () => { if (!newUname || newUpw.length < 8) return toast.error(s.errFill); setBusy("cu"); try { await restFetch("/api/admin/users", { method: "POST", token, body: { username: newUname, password: newUpw, name: newUName, tgId: newUTg ? Number(newUTg) : undefined } }); toast.success(s.saved); adminWs.reload(); setNewUname(""); setNewUpw(""); setNewUName(""); setNewUTg(""); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const toggleUser = async (id: string, f: string, v: any) => { try { await restFetch(`/api/admin/users/${id}`, { method: "PATCH", token, body: { [f]: v } }); adminWs.reload(); } catch (e: any) { toast.error(String(e?.message)); } };

  // ── admin: wallet confirm ──────────────────────────────────────────────
  const confirmTxn = async (id: string, ok: boolean) => { try { await restFetch(`/api/admin/wallet/transactions/${id}/confirm`, { method: "POST", token, body: { confirm: ok } }); toast.success(s.saved); adminWs.reload(); } catch (e: any) { toast.error(String(e?.message)); } };

  // ── admin: VIP review ───────────────────────────────────────────────────
  const reviewVip = async (reqId: string, ok: boolean) => { setBusy(`vr:${reqId}`); try { await restFetch(`/api/admin/vip/requests/${reqId}/review`, { method: "POST", token, body: { action: ok ? "approve" : "reject" } }); toast.success(s.saved); adminWs.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };

  // ── admin: webhook ──────────────────────────────────────────────────────
  const doWebhook = async () => {
    setBusy("wh");
    try {
      const saved = adminSet.data?.settings ?? {};
      const botToken = String(saved["telegram.token"] ?? "").trim();
      const configuredUrl = String(saved["telegram.webhookUrl"] ?? "").trim();
      const miniUrl = String(saved["telegram.miniAppUrl"] ?? "").trim();
      const base = configuredUrl || miniUrl || window.location.origin;
      const publicUrl = base.startsWith("https://") ? base : `${window.location.origin}`;
      const r: any = await restFetch("/api/admin/telegram/set-webhook", {
        method: "POST",
        token,
        body: { botToken, publicUrl },
      });
      if (!r?.ok) throw new Error(String(r?.error ?? "اتصال وبهوک ناموفق بود"));
      toast.success(s.saved);
      adminSet.reload();
    } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); }
  };

  // ── admin: engine mode ──────────────────────────────────────────────────
  const [engMode, setEngMode] = useState("");
  const doEngMode = async () => { if (!engMode) return; setBusy("em"); try { await restFetch("/api/admin/engine/mode", { method: "POST", token, body: { mode: engMode } }); toast.success(s.saved); adminOv.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };

  // ── admin: exchanges ────────────────────────────────────────────────────
  const [exName, setExName] = useState(""); const [exProv, setExProv] = useState("binance"); const [exEnv, setExEnv] = useState("paper"); const [exApiKey, setExApiKey] = useState(""); const [exSecret, setExSecret] = useState("");
  const doAddExchange = async () => { if (!exName) return; setBusy("ex"); try { await restFetch("/api/admin/exchanges", { method: "POST", token, body: { name: exName, provider: exProv, environment: exEnv, apiKey: exApiKey || undefined, secret: exSecret || undefined } }); toast.success(s.saved); adminEx.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const testExchange = async (id: string) => { setBusy(`ext:${id}`); try { await restFetch(`/api/admin/exchanges/${id}/test`, { method: "POST", token }); toast.success("✓"); adminEx.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const toggleExchange = async (id: string, en: boolean) => { try { await restFetch(`/api/admin/exchanges/${id}`, { method: "PATCH", token, body: { enabled: en } }); adminEx.reload(); } catch {} };

  // ── admin: AI providers ─────────────────────────────────────────────────
  const [aiProv, setAiProv] = useState(""); const [aiModel, setAiModel] = useState(""); const [aiUrl, setAiUrl] = useState(""); const [aiPurp, setAiPurp] = useState("general");
  const doAddAi = async () => { if (!aiProv || !aiModel) return; setBusy("aip"); try { await restFetch("/api/admin/ai/providers", { method: "POST", token, body: { provider: aiProv, model: aiModel, baseUrl: aiUrl || undefined, purpose: aiPurp } }); toast.success(s.saved); adminAi.reload(); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };
  const toggleAi = async (id: string, en: boolean) => { try { await restFetch(`/api/admin/ai/providers/${id}`, { method: "PATCH", token, body: { enabled: en } }); adminAi.reload(); } catch {} };
  const testAi = async (id: string) => { setBusy(`ait:${id}`); try { await restFetch(`/api/admin/ai/providers/${id}/test`, { method: "POST", token }); toast.success("✓"); } catch (e: any) { toast.error(String(e?.message)); } finally { setBusy(""); } };

  // ── admin: close position ──────────────────────────────────────────────
  const closePos = async (id: string) => {
    try {
      await restFetch(`/api/admin/positions/${id}/close`, { method: "POST", token });
      toast.success(s.saved);
      adminOv.reload();
      adminWs.reload();
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };


  const walletRow = dash.data?.wallet;
  const balance = Number(walletRow?.balance ?? 0);
  const frozen = Number(walletRow?.frozen ?? 0);
  const staff = isAdmin || isAssistant;

  // ── derived shell values (mirror the Convex admin panel) ────────────────
  const roleLabel = isAdmin ? s.adminRole : isAssistant ? s.assistantRole : safeUserName(user);
  const engineAlive = health.data?.engine === true;
  const eng = adminOv.data?.engine;
  const engStopped = Boolean(eng?.emergencyStop) || Boolean(eng?.paused);
  const rawMkts = mkts.data?.markets;
  const mktsList = Array.isArray(rawMkts) ? rawMkts : (rawMkts && typeof rawMkts === "object" ? Object.values(rawMkts) : []);
  const fxCount = mktsList.filter((m: any) => m && m.market === "forex").length;
  const crCount = mktsList.length - fxCount;
  const rawOpen = staff ? adminOv.data?.openPositions : dash.data?.openPositions;
  const openPosList = Array.isArray(rawOpen) ? rawOpen : [];
  const rawSig = dash.data?.signals;
  const signalList = Array.isArray(rawSig) ? rawSig : [];
  const rawSt = staff ? adminWs.data?.strategies : strats.data?.strategies;
  const allStrats = Array.isArray(rawSt) ? rawSt : (rawSt && typeof rawSt === "object" ? Object.values(rawSt) : []);
  const activeStrats = allStrats.filter((st: any) => st && st.enabled !== false);
  const ovStats = adminOv.data?.stats;
  const unreal = Number(ovStats?.unrealizedPnl ?? openPosList.reduce((s: number, p: any) => s + Number(p.pnl ?? 0), 0));
  const engCap = Number(eng?.capital ?? 0);

  return (
    <div data-wolf-panel="true" className="min-h-screen bg-background text-foreground text-right" dir={lang === "fa" ? "rtl" : "ltr"} style={{ direction: lang === "fa" ? "rtl" : "ltr" }}>
      {/* ── header (mirrors the Convex admin shell) ─────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur" dir={lang === "fa" ? "rtl" : "ltr"}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center overflow-hidden rounded-full border border-emerald-400/30 bg-emerald-400/10">
              <img src={logo} alt="Trading Wolf AI" className="size-7 rounded-full object-cover" referrerPolicy="no-referrer" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-black tracking-tight">Trading Wolf AI</span>
              <span className="block text-[10px] text-muted-foreground">
                <span className="text-emerald-300">{roleLabel}</span>
                <span className="mx-1 opacity-60">.</span>
                <span dir="ltr" className="terminal-font">{String(user?.username ?? "")}</span>
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                engineAlive && !engStopped
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                  : "border-amber-400/40 bg-amber-400/10 text-amber-300"
              }`}
            >
              <span className={`size-1.5 rounded-full ${engineAlive && !engStopped ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-amber-400 shadow-[0_0_6px_#fbbf24]"}`} />
              {engStopped ? (lang === "fa" ? "موتور متوقف" : "Engine stopped") : engineAlive ? s.engineOnline : (lang === "fa" ? "موتور خاموش" : "Engine down")}
            </span>
            <Button size="icon" variant="ghost" className="size-8" onClick={() => setTab("notifications")}>
              <Bell className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-8" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <LangToggle />
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[11px]" onClick={() => void logout()}><LogOut className="size-3.5" /> {s.logout}</Button>
          </div>
        </div>
        {/* world-clock ticker */}
        <div className="border-t border-border/50 bg-background/40">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-1.5">
            <MarketClock />
            <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline" dir="ltr">{REST_BASE}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4">
        {/* ── top bar ─────────────────────────────────────────────────── */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
          <p className="text-[10px] text-muted-foreground">
            <span className="terminal-font" dir="ltr">{REST_BASE}</span>
            {health.data?.ok !== undefined && <span className="ms-2 text-emerald-300"><StatusBadge ok={health.data.ok} okText={s.serverHealthy} /></span>}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {isAdmin && <Button size="sm" variant="outline" className="h-7 gap-1 text-[10px] border-red-400/30 text-red-300" disabled={busy === "clear-history"} onClick={clearHistory}><Trash2 className="size-3" /> {lang === "fa" ? "پاکسازی تاریخچه" : "Clear history"}</Button>}
            <Button size="sm" variant="outline" className="h-7 gap-1 text-[10px]" onClick={reloadAll}><RefreshCw className="size-3" /> {s.refresh}</Button>
          </div>
        </div>

        {tab === "overview" && (
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-black tracking-tight">
                <Shield className="size-5 text-emerald-400" /> {s.tabOverview}
              </h1>
              <p className="text-[11px] text-muted-foreground">{staff ? roleLabel : safeUserName(user)}</p>
            </div>
            <Badge variant="outline" className="hidden gap-1.5 border-emerald-400/30 bg-emerald-400/5 text-[10px] text-emerald-300 sm:inline-flex">
              <span className={`size-1.5 rounded-full ${engineAlive ? "bg-emerald-400" : "bg-red-400"}`} />
              {engineAlive ? s.engineOnline : (lang === "fa" ? "آفلاین" : "Offline")}
            </Badge>
          </div>
        )}

        {/* ── main tabs ────────────────────────────────────────────────── */}
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          {!staff && (
            <TabsList className="flex h-auto flex-wrap justify-start gap-1.5 rounded-lg border border-border/60 bg-background/40 p-2">
              {[
                { key: "overview", label: s.tabOverview, icon: "🏠" },
                { key: "markets", label: s.tabMarkets, icon: "📊" },
                { key: "strategies", label: s.tabStrategies, icon: "🧠" },
                { key: "education", label: s.tabEducation, icon: "📚" },
                { key: "ai", label: s.tabAi, icon: "🤖" },
                { key: "coins", label: s.tabCoins, icon: "🐺" },
                { key: "signals", label: s.tabSignals, icon: "📡" },
                { key: "wallet", label: s.tabWallet, icon: "👛" },
                { key: "vip", label: s.tabVip, icon: "👑" },
                { key: "support", label: s.tabSupport, icon: "🎫" },
                { key: "notifications", label: s.tabNotifs, icon: "🔔" },
                { key: "profile", label: s.tabProfile, icon: "🧑" },
              ].map((t) => (
                <TabsTrigger key={t.key} value={t.key} className="shrink-0 rounded-md border px-2.5 py-1 text-[11px] data-[state=active]:border-emerald-400/40 data-[state=active]:bg-emerald-400/10 data-[state=active]:text-emerald-300">
                  {t.icon} {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          )}

          {staff && (
            <div dir={lang === "fa" ? "rtl" : "ltr"} className="space-y-2.5 rounded-xl border border-border/60 bg-background/40 p-3">
              {[
                { label: s.grpEngine, icon: "⚙️", items: [
                  { key: "overview", label: s.tabOverview, icon: "🏠", go: () => setTab("overview") },
                  { key: "positions", label: s.posTab, icon: "📈", go: () => setTab("positions") },
                  { key: "risk", label: s.riskTab, icon: "🛡️", go: () => setTab("risk") },
                  { key: "reports", label: s.reportsTab, icon: "📊", go: () => setTab("reports") },
                ]},
                { label: s.grpMarkets, icon: "📊", items: [
                  { key: "markets", label: s.tabMarkets, icon: "📈", go: () => setTab("markets") },
                  { key: "chart", label: s.chartTab, icon: "🕯️", go: () => setTab("chart") },
                  { key: "admin-strategies", label: s.tabStrategies, icon: "🧠", admin: "strategies", go: () => { setAdminTab("strategies"); setTab("admin"); } },
                  { key: "exchanges", label: s.adminExchanges, icon: "🏦", admin: "exchanges", go: () => { setAdminTab("exchanges"); setTab("admin"); } },
                ]},
                { label: s.grpUsers, icon: "👥", items: [
                  { key: "users", label: s.tabUsers, icon: "👥", admin: "users", go: () => { setAdminTab("users"); setTab("admin"); } },
                  { key: "wallet", label: s.tabWallet, icon: "👛", admin: "wallet", go: () => { setAdminTab("wallet"); setTab("admin"); } },
                  { key: "coins", label: s.tabCoins, icon: "🪙", admin: "coins", go: () => { setAdminTab("coins"); setTab("admin"); } },
                  { key: "vip", label: s.tabVip, icon: "👑", admin: "vip", go: () => { setAdminTab("vip"); setTab("admin"); } },
                  { key: "referral", label: s.referralTab, icon: "🔗", go: () => setTab("referral") },
                ]},
                { label: s.grpSupport, icon: "🎧", items: [
                  { key: "notifications", label: s.tabNotifs, icon: "🔔", go: () => setTab("notifications") },
                  { key: "support", label: s.tabSupport, icon: "🎫", admin: "support", go: () => { setAdminTab("support"); setTab("admin"); } },
                  { key: "education", label: s.tabEducation, icon: "📚", go: () => setTab("education") },
                  { key: "profile", label: s.tabProfile, icon: "🧑", go: () => setTab("profile") },
                ]},
                { label: s.grpSystem, icon: "🤖", items: [
                  { key: "ai", label: s.tabAi, icon: "🤖", admin: "ai", go: () => { setAdminTab("ai"); setTab("admin"); } },
                  { key: "logs", label: s.adminLogs, icon: "📋", admin: "logs", go: () => { setAdminTab("logs"); setTab("admin"); } },
                  { key: "settings", label: s.adminSettings, icon: "🔧", admin: "settings", go: () => { setAdminTab("settings"); setTab("admin"); } },
                  { key: "connections", label: s.connectionsTab, icon: "🔑", admin: "telegram", go: () => { setAdminTab("telegram"); setTab("admin"); } },
                  { key: "swapwallet", label: s.adminSwapWallet, icon: "💱", admin: "swapwallet", go: () => { setAdminTab("swapwallet"); setTab("admin"); } },
                  { key: "monitor", label: s.monitorTab, icon: "🖥️", go: () => setTab("monitor") },
                ]},
              ].map((g) => (
                <div key={g.label} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/40 bg-background/40 px-2.5 py-2">
                  <span className="flex w-full items-center gap-1.5 text-[10px] font-bold text-muted-foreground sm:w-auto sm:min-w-[180px]">
                    <span>{g.icon}</span> {g.label}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {g.items.map((it: any) => {
                      const active = it.admin ? tab === "admin" && adminTab === it.admin : tab === it.key;
                      return (
                        <button
                          key={it.key}
                          type="button"
                          onClick={it.go}
                          className={`shrink-0 rounded-md border px-2.5 py-1 text-[10px] transition-colors ${
                            active
                              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                              : "border-border/60 bg-background/40 text-muted-foreground hover:border-emerald-400/30 hover:text-foreground"
                          }`}
                        >
                          {it.icon} {it.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ══════════ OVERVIEW ══════════════════════════════════════ */}
          <TabsContent value="overview" className="space-y-4">
            {/* row 1 — markets / realized / win-rate / open positions */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-border/70 bg-card/60"><CardContent className="p-4"><p className="text-[11px] font-bold text-muted-foreground">{s.marketsWatched}</p><p className="terminal-font mt-1 text-2xl font-black tabular-nums" dir="ltr">{mktsList.length}</p><p className="mt-0.5 text-[10px] text-muted-foreground" dir="ltr">{s.forex} · {fxCount} · {s.crypto} · {crCount}</p></CardContent></Card>
              <Card className="border-border/70 bg-card/60"><CardContent className="p-4"><p className="text-[11px] font-bold text-muted-foreground">{s.realizedPnl}</p><p className={`terminal-font mt-1 text-2xl font-black tabular-nums ${Number(staff ? ovStats?.realizedPnl : dash.data?.stats?.totalPnl) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{fmtUsd(staff ? ovStats?.realizedPnl : dash.data?.stats?.totalPnl)}</p></CardContent></Card>
              <Card className="border-border/70 bg-card/60"><CardContent className="p-4"><p className="text-[11px] font-bold text-muted-foreground">{s.winRate}</p><p className="terminal-font mt-1 text-2xl font-black tabular-nums" dir="ltr">{staff ? `${ovStats?.winRate ?? 0}%` : "—"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{staff ? Number(ovStats?.closedCount ?? 0) : (dash.data?.closedPositions ?? []).length} {s.closedTrades}</p></CardContent></Card>
              <Card className="border-border/70 bg-card/60"><CardContent className="p-4"><p className="text-[11px] font-bold text-muted-foreground">{s.openPositions}</p><p className="terminal-font mt-1 text-2xl font-black tabular-nums" dir="ltr">{openPosList.length}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{s.floatingPnl}: <span className={`${unreal >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{fmtUsd(unreal)}</span></p></CardContent></Card>
            </div>
            {/* row 2 — engine / signals / strategies / engine capital */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm"><span className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${engineAlive && !engStopped ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-amber-400"}`} /> {s.engineActive}</span>{isAdmin && <Switch checked={!engStopped} onCheckedChange={(v) => doPause(!v)} />}</CardTitle></CardHeader><CardContent className="space-y-1.5 text-[11px]"><div className="flex items-center justify-between"><span className="text-muted-foreground">{s.lastScan}</span><span className="terminal-font" dir="ltr">{eng?.lastScan?.at ? fmtTime(eng.lastScan.at, lang) : "—"}</span></div><div className="flex items-center justify-between"><span className="text-muted-foreground">{s.heartbeat}</span><span className="terminal-font" dir="ltr">{eng?.heartbeat?.at ? fmtTime(eng.heartbeat.at, lang) : "—"}</span></div>{isAdmin && <Button size="sm" className="h-8 w-full" disabled={busy.includes("eng")} onClick={() => engAction("engine/scan")}><Zap className="size-3.5" /> {s.scanNow}</Button>}</CardContent></Card>
              <Card className="border-border/70 bg-card/60"><CardContent className="p-4"><p className="text-[11px] font-bold text-muted-foreground">{s.openSignal}</p><p className="terminal-font mt-1 text-2xl font-black tabular-nums" dir="ltr">{signalList.length}</p></CardContent></Card>
              <Card className="border-border/70 bg-card/60"><CardContent className="p-4"><p className="text-[11px] font-bold text-muted-foreground">{s.activeStrategy}</p><p className="terminal-font mt-1 text-2xl font-black tabular-nums" dir="ltr">{activeStrats.length}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{s.total}: {allStrats.length}</p></CardContent></Card>
              <Card className="border-border/70 bg-card/60"><CardContent className="p-4"><p className="text-[11px] font-bold text-muted-foreground">{s.engineCapital}</p><p className="terminal-font mt-1 text-2xl font-black tabular-nums" dir="ltr">{fmtUsd(engCap)}</p></CardContent></Card>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.openPositions}</CardTitle></CardHeader><CardContent className="space-y-1.5">{openPosList.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{s.none}</p>}{openPosList.map((p: any) => (<div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-[11px]"><span className="flex items-center gap-2"><span className="terminal-font font-bold" dir="ltr">{p.symbol}</span><DirBadge dir={p.side} /></span><span className="terminal-font tabular-nums" dir="ltr">{fmtNum(p.entry)} → {fmtNum(p.current)}</span><span className={`terminal-font font-bold tabular-nums ${Number(p.pnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{fmtUsd(p.pnl)}</span></div>))}</CardContent></Card>
              <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.tabSignals}</CardTitle></CardHeader><CardContent className="space-y-1.5">{signalList.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{s.none}</p>}{signalList.map((sig: any, i: number) => (<div key={`${sig.symbol}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-[11px]"><span className="flex items-center gap-2"><span className="terminal-font font-bold" dir="ltr">{sig.symbol}</span><DirBadge dir={sig.direction} />{sig.score != null && <Badge variant="outline" className="text-[9px]">⚡{sig.score}</Badge>}</span><span className="terminal-font tabular-nums text-muted-foreground" dir="ltr">@{fmtNum(sig.entry)}</span><span className="text-muted-foreground">{fmtTime(sig.created_at, lang)}</span></div>))}</CardContent></Card>
            </div>
            <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.recentTx}</CardTitle></CardHeader><CardContent className="space-y-1.5">{(dash.data?.transactions ?? []).length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{s.none}</p>}{(dash.data?.transactions ?? []).slice(0, 10).map((t: any) => (<div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-1.5 text-[11px]"><span className="flex items-center gap-2"><Badge variant="outline" className="text-[9px]" dir="ltr">{t.type}</Badge><span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${t.status === "confirmed" || t.status === "done" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{t.status}</span></span><span className="terminal-font tabular-nums" dir="ltr">{Number(t.amount ?? 0) >= 0 ? "+" : ""}{fmtNum(t.amount, 4)} {t.asset ?? "USDT"}</span><span className="text-muted-foreground">{fmtTime(t.created_at, lang)}</span></div>))}</CardContent></Card>
          </TabsContent>

          {/* ══════════ POSITIONS (staff) ═════════════════════════════ */}
          <TabsContent value="positions" className="space-y-4">
            <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm"><span>{s.openPositions} <Badge variant="outline" className="text-[9px]" dir="ltr">{openPosList.length}</Badge></span>{isAdmin && <Button size="sm" variant="outline" className="h-6 gap-1 text-[9px]" disabled={busy === "sap"} onClick={doSendAllPos}>{busy === "sap" ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} {lang === "fa" ? "ارسال همه به تلگرام" : "Send all"}</Button>}</CardTitle></CardHeader><CardContent className="space-y-1.5">{openPosList.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{s.none}</p>}{openPosList.map((p: any) => (<div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-[11px]"><span className="flex items-center gap-2"><span className="terminal-font font-bold" dir="ltr">{p.symbol}</span><DirBadge dir={p.side} />{p.type && <Badge variant="outline" className="text-[9px] text-muted-foreground" dir="ltr">{p.type}</Badge>}</span><span className="terminal-font tabular-nums" dir="ltr">{fmtNum(p.entry)} → {fmtNum(p.current)}</span><span className={`terminal-font font-bold tabular-nums ${Number(p.pnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{fmtUsd(p.pnl)}</span>{isAdmin && <><Button size="sm" variant="ghost" className="h-6 text-[10px]" disabled={busy === `ptg:${p.id}`} onClick={() => doPosTelegram(p.id)}><Send className="size-3" /></Button><Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-400" onClick={() => closePos(p.id)}>✕</Button></>}</div>))}</CardContent></Card>
            <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.closedHistory}</CardTitle></CardHeader><CardContent className="space-y-1">{(adminWs.data?.closed ?? []).slice(0, 20).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{s.none}</p>}{(adminWs.data?.closed ?? []).slice(0, 20).map((p: any) => (<div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-1.5 text-[11px]"><span className="flex items-center gap-2"><span className="terminal-font font-bold" dir="ltr">{p.symbol}</span><DirBadge dir={p.side} /><Badge variant="outline" className="text-[9px] text-muted-foreground" dir="ltr">{p.close_reason ?? p.closeReason ?? "—"}</Badge></span><span className="terminal-font tabular-nums text-muted-foreground" dir="ltr">{fmtNum(p.entry, 4)} → {fmtNum(p.close_price ?? p.current, 4)}</span><span className={`terminal-font font-bold tabular-nums ${Number(p.profit ?? p.pnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{fmtUsd(p.profit ?? p.pnl)}</span><span className="text-muted-foreground">{fmtTime(p.close_time, lang)}</span></div>))}</CardContent></Card>
          </TabsContent>

          {/* ══════════ RISK (staff) ═══════════════════════════════════ */}
          <TabsContent value="risk" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label={s.mode} value={String(eng?.mode ?? "—")} />
              <Stat label={s.engineCapital} value={fmtUsd(engCap)} />
              <Stat label={s.openPositions} value={String(openPosList.length)} />
              <Stat label={s.totalPnl} value={fmtUsd(ovStats?.todayPnl ?? dash.data?.stats?.totalPnl)} hint={`${s.trades}: ${ovStats?.todayTrades ?? dash.data?.stats?.trades ?? 0}`} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Power className="me-1 inline size-4 text-red-400" /> {s.engineControls}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{isAdmin && <><Button size="sm" variant="destructive" className="h-8 text-[10px]" disabled={busy.includes("emg")} onClick={() => doStop(true)}><StopCircle className="size-3.5" /> {s.emgStop}</Button><Button size="sm" variant="outline" className="h-8 text-[10px] border-amber-400/30 text-amber-300" disabled={busy.includes("pause")} onClick={() => doPause(!eng?.paused)}>{eng?.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />} {eng?.paused ? s.resumeEngine : s.pauseTrades}</Button><Button size="sm" variant="outline" className="h-8 text-[10px]" disabled={busy.includes("eng")} onClick={() => engAction("engine/scan")}><Zap className="size-3.5" /> {s.scanNow}</Button></>}<StatusBadge ok={!engStopped} okText={s.online} badText={s.offline} /></CardContent></Card>
              <Card className="border-border/70 bg-card/60 lg:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.riskSettings}</CardTitle></CardHeader><CardContent className="grid gap-1 sm:grid-cols-2">{(Object.entries(adminSet.data?.settings ?? {})).filter(([k]) => k.startsWith("risk.") || k.startsWith("engine.")).map(([k, v]) => (<div key={k} className="flex items-center justify-between rounded border border-border/40 bg-background/40 px-2 py-1 text-[10px]"><span className="terminal-font text-muted-foreground" dir="ltr">{k}</span><span className="terminal-font font-bold" dir="ltr">{String(v ?? "")}</span></div>))}{(Object.entries(adminSet.data?.settings ?? {})).filter(([k]) => k.startsWith("risk.") || k.startsWith("engine.")).length === 0 && <p className="text-xs text-muted-foreground">{s.none}</p>}</CardContent></Card>
            </div>
          </TabsContent>

          {/* ══════════ REPORTS (staff) ════════════════════════════════ */}
          <TabsContent value="reports" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-1.5">{["daily", "weekly", "monthly", "all"].map((pr) => (<Button key={pr} size="sm" variant={repPeriod === pr ? "default" : "outline"} className="h-7 text-[10px]" onClick={() => setRepPeriod(pr)}>{pr === "daily" ? (lang === "fa" ? "روزانه" : "Daily") : pr === "weekly" ? (lang === "fa" ? "هفتگی" : "Weekly") : pr === "monthly" ? (lang === "fa" ? "ماهانه" : "Monthly") : (lang === "fa" ? "همه" : "All")}</Button>))}</div>{isAdmin && <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => reports.reload()}><RefreshCw className="size-3" /> {s.refresh}</Button>}</div>
            {isAdmin && reports.data && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label={lang === "fa" ? "معاملات" : "Trades"} value={reports.data.trades} hint={`${lang === "fa" ? "برد" : "Wins"}: ${reports.data.wins} · ${lang === "fa" ? "باخت" : "Losses"}: ${reports.data.losses} · ${lang === "fa" ? "باز" : "Open"}: ${reports.data.openPositions}`} />
              <Stat label={s.winRate} value={`${reports.data.winRate}%`} />
              <Stat label={s.totalPnl} value={fmtUsd(reports.data.totalPnl)} hint={`${lang === "fa" ? "محقق‌شده" : "Realized"}: ${fmtUsd(reports.data.realizedPnl)} · ${lang === "fa" ? "شناور" : "Float"}: ${fmtUsd(reports.data.unrealizedPnl)}`} />
              <Stat label={s.profitFactor} value={Number.isFinite(reports.data.profitFactor) ? reports.data.profitFactor : "∞"} hint={`Sharpe: ${reports.data.sharpe ?? 0} · DD: ${reports.data.maxDrawdown ?? 0}`} />
              <Stat label={lang === "fa" ? "بهترین استراتژی" : "Best strategy"} value={reports.data.bestStrategy?.key ?? "—"} hint={`${reports.data.bestStrategy?.trades ?? 0} ${s.tradesCount} · ${fmtUsd(reports.data.bestStrategy?.pnl)}`} />
              <Stat label={lang === "fa" ? "بهترین نماد" : "Best symbol"} value={reports.data.bestSymbol?.symbol ?? "—"} hint={`${reports.data.bestSymbol?.trades ?? 0} ${s.tradesCount} · ${fmtUsd(reports.data.bestSymbol?.pnl)}`} />
              <Stat label={lang === "fa" ? "میانگین R" : "Avg R"} value={reports.data.expectancy ?? 0} hint={`${lang === "fa" ? "میانگین RR" : "Avg RR"}: ${reports.data.avgRr ?? 0}`} />
              <Stat label={lang === "fa" ? "میانگین برد / باخت" : "Avg win / loss"} value={`${reports.data.avgWin ?? 0} / ${reports.data.avgLoss ?? 0}`} />
            </div>}
            <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.performance}</CardTitle></CardHeader><CardContent className="space-y-1">{(adminWs.data?.performance ?? []).slice(0, 15).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{s.none}</p>}{(adminWs.data?.performance ?? []).slice(0, 15).map((st: any) => (<div key={st.strategy_key ?? st.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-1.5 text-[11px]"><span className="terminal-font font-bold" dir="ltr">{st.strategy_key ?? st.key}</span><span className="text-muted-foreground">{s.tradesCount}: {st.trades ?? 0} · {s.wins}: {st.wins ?? 0} · {s.losses}: {st.losses ?? 0}</span><span className="text-muted-foreground">{s.winRate}: {st.win_rate ?? 0}% · {s.profitFactor}: {st.profit_factor ?? 0}</span><span className={`terminal-font font-bold tabular-nums ${Number(st.total_pnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{fmtUsd(st.total_pnl)}</span></div>))}</CardContent></Card>
            <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.closedHistory}</CardTitle></CardHeader><CardContent className="space-y-1">{(adminWs.data?.closed ?? []).slice(0, 30).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{s.none}</p>}{(adminWs.data?.closed ?? []).slice(0, 30).map((p: any) => (<div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-1.5 text-[11px]"><span className="flex items-center gap-2"><span className="terminal-font font-bold" dir="ltr">{p.symbol}</span><DirBadge dir={p.side} /></span><span className="terminal-font tabular-nums text-muted-foreground" dir="ltr">{fmtNum(p.entry, 4)} → {fmtNum(p.close_price ?? p.current, 4)}</span><span className="text-muted-foreground">{p.close_reason ?? p.closeReason ?? "—"}</span><span className={`terminal-font font-bold tabular-nums ${Number(p.profit ?? p.pnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{fmtUsd(p.profit ?? p.pnl)}</span><span className="text-muted-foreground">{fmtTime(p.close_time, lang)}</span></div>))}</CardContent></Card>
          </TabsContent>

          {/* ══════════ CHART ══════════════════════════════════════════ */}
          <TabsContent value="chart" className="space-y-4">
            <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><LineChart className="me-1 inline size-4 text-emerald-400" /> {s.chartTab}</CardTitle></CardHeader><CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={chartSym} onValueChange={setChartSym}><SelectTrigger className="h-9 text-xs" dir="ltr"><SelectValue /></SelectTrigger><SelectContent>{mktsList.map((m: any) => <SelectItem key={m.symbol} value={m.symbol}>{m.symbol}</SelectItem>)}</SelectContent></Select>
                <Select value={chartTf} onValueChange={setChartTf}><SelectTrigger className="h-9 text-xs" dir="ltr"><SelectValue /></SelectTrigger><SelectContent>{["1m", "5m", "15m", "30m", "1h", "4h", "1d"].map((tf) => <SelectItem key={tf} value={tf}>{tf}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="overflow-x-auto rounded-md border border-border/50"><Table className="min-w-[520px]"><TableHeader><TableRow><TableHead className="text-xs">{s.candles} ({chartTf})</TableHead><TableHead className="text-xs" dir="ltr">O</TableHead><TableHead className="text-xs" dir="ltr">H</TableHead><TableHead className="text-xs" dir="ltr">L</TableHead><TableHead className="text-xs" dir="ltr">C</TableHead></TableRow></TableHeader><TableBody>{(candles.data?.candles ?? []).slice(-40).reverse().map((c: any, i: number) => { const up = Number(c.c) >= Number(c.o); return (<TableRow key={i}><TableCell className="terminal-font text-[10px] text-muted-foreground" dir="ltr">{fmtTime(c.t ?? c.time, lang)}</TableCell><TableCell className={`terminal-font text-[10px] ${up ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{fmtNum(c.o, 5)}</TableCell><TableCell className="terminal-font text-[10px]" dir="ltr">{fmtNum(c.h, 5)}</TableCell><TableCell className="terminal-font text-[10px]" dir="ltr">{fmtNum(c.l, 5)}</TableCell><TableCell className={`terminal-font text-[10px] font-bold ${up ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{fmtNum(c.c, 5)}</TableCell></TableRow>); })}</TableBody></Table>{(candles.data?.candles ?? []).length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">{candles.loading ? s.loading : s.none}</p>}</div>
              {isAdmin && <div className="flex justify-end"><Button size="sm" variant="outline" className="h-7 gap-1 text-[10px]" disabled={busy === "tlc"} onClick={() => doTeleChart(chartSym, chartTf)}>{busy === "tlc" ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} {lang === "fa" ? "ارسال چارت به کانال تلگرام" : "Send chart to Telegram channel"}</Button></div>}
            </CardContent></Card>
          </TabsContent>

          {/* ══════════ REFERRAL (staff) ═══════════════════════════════ */}
          <TabsContent value="referral" className="space-y-4">
            <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Link2 className="me-1 inline size-4 text-emerald-400" /> {s.referralTab}</CardTitle></CardHeader><CardContent className="space-y-1">{(adminWs.data?.referrals ?? []).slice(0, 50).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{s.none}</p>}{(adminWs.data?.referrals ?? []).slice(0, 50).map((r: any) => (<div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-1.5 text-[11px]"><span className="terminal-font font-bold" dir="ltr">{r.referrer ?? r.referrer_id}</span><span className="text-muted-foreground">{s.invited}: <span className="terminal-font" dir="ltr">{r.referred_user ?? r.referred_id}</span></span><span className="text-muted-foreground">{fmtTime(r.created_at, lang)}</span></div>))}</CardContent></Card>
          </TabsContent>

          {/* ══════════ MONITOR (staff) ═════════════════════════════════ */}
          <TabsContent value="monitor" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-border/70 bg-card/60"><CardContent className="p-4"><p className="text-[11px] font-bold text-muted-foreground">{s.systemHealth}</p><p className="mt-1 space-y-1 text-[11px]"><span className="flex items-center justify-between"><span>{s.dbOk}</span><StatusBadge ok={health.data?.db === true} /></span><span className="flex items-center justify-between"><span>Redis</span><StatusBadge ok={health.data?.redis === true} /></span><span className="flex items-center justify-between"><span>{s.engineOk}</span><StatusBadge ok={health.data?.engine === true} /></span></p></CardContent></Card>
              <Stat label={s.heartbeat} value={eng?.heartbeat?.at ? fmtTime(eng.heartbeat.at, lang) : "—"} />
              <Stat label={s.lastScan} value={eng?.lastScan?.at ? fmtTime(eng.lastScan.at, lang) : "—"} />
              <Stat label={s.mode} value={String(eng?.mode ?? "—")} hint={`${s.openPositions}: ${openPosList.length} · ${s.tabUsers}: ${ovStats?.users ?? "—"}`} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Landmark className="me-1 inline size-4 text-emerald-400" /> {s.adminExchanges}</CardTitle></CardHeader><CardContent className="space-y-1">{(adminEx.data?.exchanges ?? []).length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{s.none}</p>}{(adminEx.data?.exchanges ?? []).map((ex: any) => (<div key={ex.id} className="flex items-center justify-between rounded border border-border/40 bg-background/40 p-1.5 text-[10px]"><span className="terminal-font font-bold" dir="ltr">{ex.provider}</span><StatusBadge ok={ex.status === "connected"} okText="CONNECTED" badText={ex.status ?? s.offline} /></div>))}</CardContent></Card>
              <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Bot className="me-1 inline size-4 text-emerald-400" /> {s.adminAiProviders}</CardTitle></CardHeader><CardContent className="space-y-1">{(adminAi.data?.providers ?? []).length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{s.none}</p>}{(adminAi.data?.providers ?? []).map((ai: any) => (<div key={ai.id} className="flex items-center justify-between rounded border border-border/40 bg-background/40 p-1.5 text-[10px]"><span className="terminal-font font-bold" dir="ltr">{ai.provider}</span><span className="text-muted-foreground" dir="ltr">{ai.model}</span><StatusBadge ok={ai.enabled} /></div>))}</CardContent></Card>
            </div>
            <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Radio className="me-1 inline size-4 text-emerald-400" /> {s.adminLogs}</CardTitle></CardHeader><CardContent className="max-h-64 space-y-1 overflow-auto">{(adminLog.data?.logs ?? []).slice(0, 30).length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{s.none}</p>}{(adminLog.data?.logs ?? []).slice(0, 30).map((l: any) => (<div key={l.id} className="rounded border-b border-border/40 px-2 py-1 text-[10px]"><span className={`me-1.5 rounded px-1 py-0.5 font-bold ${String(l.level ?? "").includes("ERROR") || String(l.level ?? "").includes("WARN") ? "bg-red-400/10 text-red-300" : "bg-emerald-400/10 text-emerald-300"}`} dir="ltr">{l.level}</span><span className="terminal-font text-muted-foreground" dir="ltr">{fmtTime(l.created_at, lang)}</span><span className="ms-2">{l.message}</span></div>))}</CardContent></Card>
            {isAdmin && <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Database className="me-1 inline size-4 text-emerald-400" /> {lang === "fa" ? "آمار سرور" : "Server stats"}</CardTitle></CardHeader><CardContent className="space-y-1.5 text-[11px]"><div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">{[[lang === "fa" ? "نسخه" : "Node", monStats.data?.runtime?.node], [lang === "fa" ? "سیستم" : "Platform", `${monStats.data?.runtime?.platform ?? "—"} / ${monStats.data?.runtime?.arch ?? "—"}`], [lang === "fa" ? "آپتایم" : "Uptime", monStats.data?.runtime?.uptimeSec != null ? `${Math.round(monStats.data.runtime.uptimeSec / 60)}m` : "—"], [lang === "fa" ? "حالت" : "Mode", monStats.data?.deployment?.engineMode ?? "—"]].map(([k, v]: any) => (<div key={String(k)} className="rounded border border-border/40 bg-background/40 p-2"><p className="text-[9px] text-muted-foreground">{k}</p><p className="terminal-font text-[11px]" dir="ltr">{v ?? "—"}</p></div>))}</div><div className="grid gap-1.5 sm:grid-cols-3">{[["RSS", monStats.data?.runtime?.memory?.rss], [lang === "fa" ? "هیپ" : "Heap", monStats.data?.runtime?.memory?.heapUsed], [lang === "fa" ? "هارت‌بیت" : "Heartbeat", monStats.data?.deployment?.heartbeatAgeSec != null ? `${monStats.data.deployment.heartbeatAgeSec}s` : "—"]].map(([k, v]: any) => (<div key={String(k)} className="rounded border border-border/40 bg-background/40 p-2"><p className="text-[9px] text-muted-foreground">{k}</p><p className="terminal-font text-[11px]" dir="ltr">{v ?? "—"}</p></div>))}</div><div className="flex flex-wrap gap-1.5">{Object.entries(monStats.data?.counts ?? {}).map(([k, v]: any) => (<Badge key={k} variant="outline" className="text-[9px]"><span className="terminal-font" dir="ltr">{k}</span> = {v}</Badge>))}</div></CardContent></Card>}
          </TabsContent>

          {/* ══════════ MARKETS ════════════════════════════════════════ */}
          <TabsContent value="markets">
            <Card className="border-border/70 bg-card/60"><CardContent className="p-0"><div className="overflow-x-auto"><Table className="min-w-[640px]"><TableHeader><TableRow><TableHead className="text-xs">{s.symbol}</TableHead><TableHead className="text-xs">{s.name}</TableHead><TableHead className="text-xs">{s.market}</TableHead><TableHead className="text-xs">{s.price}</TableHead><TableHead className="text-xs">{s.change24h}</TableHead></TableRow></TableHeader><TableBody>{(mkts.data?.markets ?? []).map((m: any) => (<TableRow key={m.symbol}><TableCell className="terminal-font text-xs font-semibold" dir="ltr">{m.symbol}</TableCell><TableCell className="text-xs text-muted-foreground">{lang === "fa" ? m.name_fa : m.name_en}</TableCell><TableCell className="text-xs">{m.market === "forex" ? s.forex : s.crypto}</TableCell><TableCell className="terminal-font text-xs tabular-nums" dir="ltr">{fmtNum(m.last_price, 5)}</TableCell><TableCell className={`terminal-font text-xs tabular-nums ${Number(m.change_24h ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{m.change_24h != null ? `${Number(m.change_24h) >= 0 ? "+" : ""}${fmtNum(m.change_24h, 2)}%` : "—"}</TableCell></TableRow>))}{(mkts.data?.markets ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">{mkts.loading ? s.loading : s.none}</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card>
          </TabsContent>

          {/* ══════════ STRATEGIES ═════════════════════════════════════ */}
          <TabsContent value="strategies">
            <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.tabStrategies}</CardTitle></CardHeader><CardContent className="space-y-1.5">{(strats.data?.strategies ?? []).map((st: any) => (<div key={st.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-[11px]"><span><b>{lang === "fa" ? st.name_fa : st.name}</b><span className="ms-2 text-muted-foreground">{st.category}</span></span><span className="terminal-font text-muted-foreground" dir="ltr">{st.market} · {st.timeframes?.join(", ")}</span><Badge variant="outline" className="border-emerald-400/30 text-emerald-300">{s.enabled}</Badge></div>))}{(strats.data?.strategies ?? []).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{strats.loading ? s.loading : s.none}</p>}</CardContent></Card>
          </TabsContent>

          {/* ══════════ EDUCATION ══════════════════════════════════════ */}
          <TabsContent value="education">
            {isAdmin && <div className="mb-3 flex justify-end"><Button size="sm" variant="outline" className="h-7 gap-1 text-[10px]" disabled={busy === "edg"} onClick={doGenerateDay}>{busy === "edg" ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />} {lang === "fa" ? "تولید درس روزانه با AI" : "Generate daily lesson (AI)"}</Button></div>}
            <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.tabEducation}</CardTitle></CardHeader><CardContent className="space-y-2">{(edu.data?.education ?? []).map((l: any) => (<article key={l.id} className="rounded-md border border-border/50 bg-background/40 p-3 text-[11px]"><h3 className="font-bold">{lang === "fa" ? l.title_fa : l.title_en}</h3><p className="mt-1 whitespace-pre-wrap leading-5 text-muted-foreground">{lang === "fa" ? l.body_fa : l.body_en}</p><p className="mt-2 text-[9px] text-muted-foreground">{fmtTime(l.created_at, lang)}</p></article>))}{(edu.data?.education ?? []).length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">{edu.loading ? s.loading : s.none}</p>}</CardContent></Card>
          </TabsContent>

          {/* ══════════ AI ══════════════════════════════════════════════ */}
          <TabsContent value="ai">
            <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><BrainCircuit className="me-1 inline size-4 text-emerald-400" /> {s.tabAi}</CardTitle></CardHeader><CardContent className="space-y-2">{aiAns && <div className="rounded-md border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs"><p className="whitespace-pre-wrap leading-6">{aiAns.text}</p><p className="mt-2 text-[9px] text-muted-foreground">{aiAns.provider} · {aiAns.model}</p></div>}<Textarea value={aiQ} onChange={(e) => setAiQ(e.target.value)} placeholder={s.aiPlaceholder} className="min-h-24 text-xs" /><Button className="w-full" disabled={!aiQ.trim() || busy === "ai"} onClick={doAi}>{busy === "ai" ? <Loader2 className="size-3.5 animate-spin" /> : <BrainCircuit className="size-3.5" />} {s.askAi}</Button><Button size="sm" variant="outline" className="mt-2 h-7 w-full text-[10px] border-red-400/30 text-red-300" disabled={busy === "pruneai"} onClick={doPruneAi}>{busy === "pruneai" ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} {lang === "fa" ? "پاکسازی تاریخچه گفتگو من" : "Clear my chat history"}</Button></CardContent></Card>
          </TabsContent>

          {/* ══════════ COINS ════════════════════════════════════════════ */}
          <TabsContent value="coins">
            <div className="grid gap-3 lg:grid-cols-2">
              <Stat label={s.wolfCoins} value={fmtNum(coinData.data?.wolfCoins, 0)} />
              <Stat label={s.toman} value={fmtNum(coinData.data?.toman, 0)} />
              <Card className="border-border/70 bg-card/60 lg:col-span-2">
                <CardHeader className="pb-2"><CardTitle className="text-sm"><Gift className="me-1 inline size-4" /> {s.voucherCreate}</CardTitle></CardHeader>
                <CardContent><div className="flex gap-2"><Input dir="ltr" className="h-8 text-xs" placeholder={s.voucherCode} value={vouchCode} onChange={(e) => setVouchCode(e.target.value)} /><Button size="sm" className="h-8" disabled={busy === "vouch"} onClick={doVoucher}>{busy === "vouch" ? <Loader2 className="size-3.5 animate-spin" /> : s.voucherCreate}</Button></div></CardContent>
              </Card>
                            <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Gift className="me-1 inline size-4" /> {lang === "fa" ? "جایزه پروفایل" : "Profile reward"}</CardTitle></CardHeader><CardContent className="space-y-1.5">{(coinData.data?.profileRewardClaimed ? <p className="rounded border border-emerald-400/30 bg-emerald-400/5 p-2 text-[10px] text-emerald-300">{lang === "fa" ? "✓ دریافت شد" : "✓ Claimed"}</p> : <><p className="text-[10px] text-muted-foreground">{lang === "fa" ? "با تکمیل نام/شماره در پروفایل، جایزه بگیرید" : "Complete your name/phone in Profile to earn coins"}</p><Button size="sm" className="h-8 w-full" disabled={busy === "reward"} onClick={doClaimReward}>{busy === "reward" ? <Loader2 className="size-3.5 animate-spin" /> : <BadgeCheck className="size-3.5" />} {lang === "fa" ? "دریافت جایزه" : "Claim reward"}</Button></>)}</CardContent></Card>
              <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Coins className="me-1 inline size-4" /> {lang === "fa" ? "خرید ولفکوین" : "Buy wolf coins"}</CardTitle></CardHeader><CardContent className="space-y-1.5"><div className="flex gap-2"><Input dir="ltr" className="h-8 text-xs" placeholder={lang === "fa" ? "تعداد سکه" : "Coins"} value={buyCoinsQty} onChange={(e) => setBuyCoinsQty(e.target.value)} /><Button size="sm" className="h-8 shrink-0" disabled={busy === "buy"} onClick={doBuyCoins}>{busy === "buy" ? <Loader2 className="size-3.5 animate-spin" /> : <Coins className="size-3.5" />} {lang === "fa" ? "خرید" : "Buy"}</Button></div><p className="text-[9px] text-muted-foreground">{lang === "fa" ? "با موجودی تومان — نرخ از تنظیمات سرور" : "Paid with toman balance — rate from server settings"}</p></CardContent></Card>
<Card className="border-border/70 bg-card/60 lg:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-sm"><BarChart3 className="me-1 inline size-4 text-emerald-400" /> {lang === "fa" ? "بازی پیش‌بینی قیمت (ساعتی)" : "Hourly price prediction game"}</CardTitle></CardHeader><CardContent className="space-y-2">
    {!predGame && <div className="grid gap-1.5 sm:grid-cols-3"><Select value={predSym} onValueChange={setPredSym}><SelectTrigger className="h-8 text-[10px]" dir="ltr"><SelectValue /></SelectTrigger><SelectContent>{["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","XAUUSD","EURUSD","GBPUSD","USDJPY","DOGEUSDT"].map((sym) => <SelectItem key={sym} value={sym}>{sym}</SelectItem>)}</SelectContent></Select><div className="sm:col-span-2"><Button size="sm" className="h-8 w-full" disabled={busy === "pred"} onClick={() => doPredStart(predSym)}>{busy === "pred" ? <Loader2 className="size-3.5 animate-spin" /> : <Trophy className="size-3.5" />} {lang === "fa" ? "شروع بازی" : "Start game"}</Button></div></div>}
    {predGame && <div className="space-y-2"><p className="text-[10px] text-muted-foreground">{lang === "fa" ? "شمع آخر پنهان است — جهت آن را حدس بزنید" : "The last candle is hidden — guess its direction"} · <span className="terminal-font" dir="ltr">{predGame.symbol}</span> · {lang === "fa" ? "جایزه" : "reward"}: <b className="text-emerald-300">{predGame.reward}</b></p><div className="flex gap-1.5"><Button size="sm" className="h-8 flex-1 bg-emerald-500/90 hover:bg-emerald-500" disabled={busy === "pred:long"} onClick={() => doPredResolve("long")}><TrendingUp className="size-3.5" /> {lang === "fa" ? "صعودی ▲" : "LONG"}</Button><Button size="sm" variant="destructive" className="h-8 flex-1" disabled={busy === "pred:short"} onClick={() => doPredResolve("short")}><TrendingDown className="size-3.5" /> {lang === "fa" ? "نزولی ▼" : "SHORT"}</Button></div></div>}
    {predHist.length > 0 && <div className="max-h-24 space-y-1 overflow-auto">{[...predHist].slice(0, 8).map((p: any) => (<div key={p.id} className="flex items-center justify-between gap-2 rounded border border-border/40 bg-background/40 px-2 py-1 text-[10px]"><span className="terminal-font" dir="ltr">{p.symbol}</span><b className={p.status === "won" ? "text-emerald-300" : p.status === "lost" ? "text-red-300" : "text-muted-foreground"}>{p.status}</b><span className="text-muted-foreground">{fmtTime(p.created_at, lang)}</span></div>))}</div>}
  </CardContent></Card>
  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><FlaskConical className="me-1 inline size-4 text-emerald-400" /> {lang === "fa" ? "کوییز آموزشی" : "Education quiz"}</CardTitle></CardHeader><CardContent className="space-y-2">
    {!quizCur && <Button size="sm" className="h-8 w-full" disabled={busy === "quiz"} onClick={doQuizStart}>{busy === "quiz" ? <Loader2 className="size-3.5 animate-spin" /> : <BookOpen className="size-3.5" />} {lang === "fa" ? "شروع کوییز" : "Start quiz"}</Button>}
    {quizCur && <div className="space-y-2"><p className="text-[11px] font-semibold">{lang === "fa" ? quizCur.question : quizCur.questionEn}</p><div className="grid gap-1">{quizCur.options.map((opt: string, oi: number) => (<Button key={oi} size="sm" variant="outline" className="h-8 justify-start text-[10px]" disabled={busy === "quiz"} onClick={() => doQuizResolve(oi)}>{String.fromCharCode(65 + oi)} {opt}</Button>))}</div><p className="text-[9px] text-muted-foreground">{lang === "fa" ? "جایزه" : "reward"}: +{quizCur.reward}</p></div>}
  </CardContent></Card>
  <Card className="border-border/70 bg-card/60 lg:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-sm"><Coins className="me-1 inline size-4" /> {lang === "fa" ? "پکیج‌های سکه" : "Coin packages"} <span className="text-[9px] font-normal text-muted-foreground">{lang === "fa" ? "(خرید با تومان)" : "(with toman)"}</span></CardTitle></CardHeader><CardContent className="space-y-1.5">{(coinPkgs ?? []).map((pkg: any, pi: number) => (<div key={pi} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/40 bg-background/40 px-2 py-1.5 text-[10px]"><span>{lang === "fa" ? pkg.labelFa ?? pkg.label : pkg.label ?? pkg.labelFa} · <b className="text-emerald-300">{pkg.coins}</b> {lang === "fa" ? "سکه" : "coins"}</span><span className="terminal-font" dir="ltr">{fmtNum(pkg.price, 0)} {lang === "fa" ? "تومان" : "Toman"}</span><Button size="sm" variant="outline" className="h-6 text-[9px]" disabled={busy === `pkg:${pi}`} onClick={() => doBuyPackage(pi)}>{lang === "fa" ? "خرید" : "Buy"}</Button></div>))}{(coinPkgs ?? []).length === 0 && <p className="text-[10px] text-muted-foreground">—</p>}</CardContent></Card>
<Card className="border-border/70 bg-card/60 lg:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.coinLedger}</CardTitle></CardHeader><CardContent className="space-y-1.5">{(coinData.data?.transactions ?? []).map((r: any) => (<div key={r.id} className="flex justify-between rounded border border-border/40 bg-background/40 p-2 text-[10px]"><span>{r.reason}</span><span className="terminal-font" dir="ltr">{Number(r.delta) > 0 ? "+" : ""}{fmtNum(r.delta, 2)} {r.currency}</span></div>))}</CardContent></Card>
            </div>
          </TabsContent>

          {/* ══════════ SIGNALS ════════════════════════════════════════ */}
          <TabsContent value="signals">
            <div className="mb-2 flex justify-end"><Button size="sm" variant="outline" className="h-7 gap-1 text-[10px]" onClick={() => setMyOnly(!myOnly)}>{myOnly ? (lang === "fa" ? "📡 همه سیگنالها" : "📡 All signals") : (lang === "fa" ? "👤 سیگنالهای من" : "👤 My signals")}</Button></div>
            <Card className="border-border/70 bg-card/60"><CardContent className="space-y-1.5 p-3">{sigRows.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{sigs.loading ? s.loading : s.none}</p>}{sigRows.map((sig: any, i: number) => (<div key={`${sig.symbol}-${i}`} className="rounded-md border border-border/50 bg-background/40 p-3 text-[11px]"><div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2"><span className="terminal-font text-sm font-black" dir="ltr">{sig.symbol}</span><DirBadge dir={sig.direction} />{sig.score != null && <Badge variant="outline" className="text-[10px]">⚡{sig.score}</Badge>}{sig.mode && <Badge variant="outline" className="text-[9px] text-muted-foreground" dir="ltr">{sig.mode}</Badge>}</span><span className="text-muted-foreground">{fmtTime(sig.created_at, lang)}</span></div><div className="mt-2 grid gap-1 text-[10px] text-muted-foreground sm:grid-cols-3"><span dir="ltr">{s.entry}: <b className="terminal-font text-foreground">{fmtNum(sig.entry, 5)}</b></span><span dir="ltr">{s.sl}: <b className="terminal-font text-red-300">{fmtNum(sig.stop_loss, 5)}</b></span><span dir="ltr">{s.tp}: <b className="terminal-font text-emerald-300">{fmtNum(sig.take_profit, 5)}</b></span></div>{Array.isArray(sig.strategy_keys) && sig.strategy_keys.length > 0 && <p className="terminal-font mt-1.5 text-[9px] text-muted-foreground" dir="ltr">{sig.strategy_keys.join(" + ")}</p>}
      {sig.id && !sig.unlocked && <Button size="sm" className="mt-1.5 h-7 w-full text-[10px]" disabled={busy === "unlock"} onClick={() => doUnlockSignal(sig.id)}>🔓 {lang === "fa" ? "باز کردن جزئیات با ولف‌کوین" : "Unlock details"}</Button>}
      {unlocked[sig.id] && <div className="mt-1.5 rounded border border-emerald-400/20 bg-emerald-400/5 p-2 text-[10px]"><p className="flex flex-wrap gap-2" dir="ltr"><b>RR</b> {unlocked[sig.id].rr} · <b>conf</b> {unlocked[sig.id].confidence} · <b>TP1</b> {fmtNum(unlocked[sig.id].takeProfit, 5)}</p>{Array.isArray(unlocked[sig.id].reasonsFa) && unlocked[sig.id].reasonsFa.length > 0 && <ul className="mt-1 list-disc ps-3 text-muted-foreground">{unlocked[sig.id].reasonsFa.slice(0, 4).map((r: string, ri: number) => <li key={ri}>{r}</li>)}</ul>}</div>}
    </div>))}</CardContent></Card>
          </TabsContent>

          {/* ══════════ WALLET ════════════════════════════════════════ */}
          <TabsContent value="wallet">
            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Wallet className="me-1 inline size-4 text-emerald-400" /> {s.tabWallet}</CardTitle></CardHeader><CardContent className="space-y-3">
                <div className="rounded-md border border-border/50 bg-background/40 p-3"><p className="text-[11px] text-muted-foreground">{s.balance}</p><p className="terminal-font text-2xl font-black tabular-nums" dir="ltr">{fmtUsd(balance)}</p><p className="text-[10px] text-muted-foreground">{s.frozen}: <span className="terminal-font" dir="ltr">{fmtUsd(frozen)}</span></p></div>
                <div className="rounded-md border border-border/50 bg-background/40 p-3"><p className="mb-1.5 text-[11px] font-bold text-muted-foreground">{s.depositAddresses}</p><div className="space-y-1">{(wal.data?.depositAddresses ?? []).map((a: any) => (<div key={`${a.asset}-${a.network}`} className="rounded border-b border-border/40 pb-1 text-[10px]"><span className="font-bold" dir="ltr">{a.asset}/{a.network}</span><span className="terminal-font ms-2 break-all text-muted-foreground" dir="ltr">{a.address}</span>{a.memo && <span className="terminal-font ms-2 text-muted-foreground" dir="ltr">memo:{a.memo}</span>}</div>))}{(wal.data?.depositAddresses ?? []).length === 0 && <p className="text-[10px] text-muted-foreground">—</p>}</div></div>
                <div className="rounded-md border border-border/50 bg-background/40 p-3"><p className="mb-1.5 text-[11px] font-bold text-muted-foreground"><ArrowDownToLine className="me-1 inline size-3" /> {s.deposit}</p><div className="grid gap-1.5 sm:grid-cols-2"><Input dir="ltr" className="h-8 text-[11px]" placeholder={s.amountUsdt} value={depAmt} onChange={(e) => setDepAmt(e.target.value)} /><Input dir="ltr" className="h-8 text-[11px]" placeholder={s.txid} value={depTxid} onChange={(e) => setDepTxid(e.target.value)} /></div><Button size="sm" className="mt-1.5 h-8 w-full" disabled={busy === "dep"} onClick={doDeposit}>{busy === "dep" ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowDownToLine className="size-3.5" />} {s.deposit}</Button></div>
                <div className="rounded-md border border-border/50 bg-background/40 p-3"><p className="mb-1.5 text-[11px] font-bold text-muted-foreground"><ArrowUpFromLine className="me-1 inline size-3" /> {s.withdraw}</p><div className="grid gap-1.5 sm:grid-cols-2"><Input dir="ltr" className="h-8 text-[11px]" placeholder={s.amountUsdt} value={wdAmt} onChange={(e) => setWdAmt(e.target.value)} /><Input dir="ltr" className="h-8 text-[11px]" placeholder={s.address} value={wdAddr} onChange={(e) => setWdAddr(e.target.value)} /></div><Button size="sm" variant="outline" className="mt-1.5 h-8 w-full border-red-400/30 text-red-300" disabled={busy === "wd"} onClick={doWithdraw}>{busy === "wd" ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUpFromLine className="size-3.5" />} {s.withdraw}</Button></div>
                {frozen > 0 && <div className="rounded-md border border-emerald-400/20 bg-emerald-400/5 p-3"><p className="mb-1.5 text-[11px] font-bold text-muted-foreground"><Unlock className="me-1 inline size-3" /> {lang === "fa" ? "آزادسازی سرمایه موتور" : "Unfreeze engine funds"}</p><div className="flex gap-1.5"><Input dir="ltr" className="h-8 text-[11px]" placeholder={s.amountUsdt} value={unfAmt} onChange={(e) => setUnfAmt(e.target.value)} /><Button size="sm" className="h-8 shrink-0" disabled={busy === "unf"} onClick={doUnfreeze}>{busy === "unf" ? <Loader2 className="size-3.5 animate-spin" /> : <Unlock className="size-3.5" />} {lang === "fa" ? "درخواست آزادسازی" : "Request release"}</Button></div><p className="mt-1 text-[9px] text-muted-foreground">{lang === "fa" ? "مجاز: " : "Available: "}<b>{fmtUsd(frozen)}</b></p></div>}
                <div className="rounded-md border border-border/50 bg-background/40 p-3"><p className="mb-1.5 text-[11px] font-bold text-muted-foreground"><ArrowDownToLine className="me-1 inline size-3" /> {lang === "fa" ? "واریز تومانی (کارت به کارت)" : "Toman deposit (card-to-card)"}</p><div className="grid gap-1.5 sm:grid-cols-2"><Input dir="ltr" className="h-8 text-[11px]" placeholder={lang === "fa" ? "مبلغ (تومان)" : "Amount (toman)"} value={tDepAmt} onChange={(e) => setTDepAmt(e.target.value)} /><Input dir="ltr" className="h-8 text-[11px]" placeholder={lang === "fa" ? "کد پیگیری" : "Tracking code"} value={tDepRef} onChange={(e) => setTDepRef(e.target.value)} /></div><Button size="sm" variant="outline" className="mt-1.5 h-8 w-full" disabled={busy === "tdep"} onClick={doTomanDeposit}>{busy === "tdep" ? <Loader2 className="size-3 animate-spin" /> : <ArrowDownToLine className="size-3" />} {lang === "fa" ? "ثبت درخواست واریز" : "Submit deposit"}</Button></div>
              </CardContent></Card>
              <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.recentTx}</CardTitle></CardHeader><CardContent className="max-h-[34rem] space-y-1.5 overflow-auto">{(wal.data?.transactions ?? []).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{s.none}</p>}{(wal.data?.transactions ?? []).map((t: any) => (<div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-1.5 text-[11px]"><span className="flex items-center gap-2"><Badge variant="outline" className="text-[9px]" dir="ltr">{t.type}</Badge><span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${t.status === "confirmed" || t.status === "done" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{t.status}</span></span><span className="terminal-font tabular-nums" dir="ltr">{Number(t.amount ?? 0) >= 0 ? "+" : ""}{fmtNum(t.amount, 4)} {t.asset ?? "USDT"}</span><span className="text-muted-foreground">{fmtTime(t.created_at, lang)}</span></div>))}</CardContent></Card>
            </div>
          </TabsContent>

          {/* ══════════ VIP ══════════════════════════════════════════ */}
          <TabsContent value="vip">
            <div className="grid gap-3 lg:grid-cols-3">
              {(pkgs.data?.packages ?? []).map((p: any) => (<Card key={p.key} className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm capitalize">{lang === "fa" ? p.name_fa ?? p.name : p.name}</CardTitle></CardHeader><CardContent className="space-y-2 text-[11px]"><p className="terminal-font text-lg font-black" dir="ltr">{fmtUsd(p.price)} <span className="text-[10px] font-normal text-muted-foreground">/ {p.duration_days ?? 30}d</span></p>{Array.isArray(p.features_fa) && <ul className="list-disc space-y-0.5 ps-4 text-[10px] text-muted-foreground">{(lang === "fa" ? p.features_fa : p.features ?? p.features_fa).map((f: string, i: number) => <li key={i}>{f}</li>)}</ul>}<p className="rounded bg-background/40 p-1.5 text-[10px] text-muted-foreground" dir="ltr">{s.capitalRange}: {fmtUsd(p.min_capital, 0)}–{fmtUsd(p.max_capital, 0)}</p></CardContent></Card>))}{(pkgs.data?.packages ?? []).length === 0 && <p className="col-span-full py-10 text-center text-xs text-muted-foreground">{pkgs.loading ? s.loading : s.none}</p>}
              <Card className="border-border/70 bg-card/60 lg:col-span-3"><CardHeader className="pb-2"><CardTitle className="text-sm"><BadgeCheck className="me-1 inline size-4 text-emerald-400" /> {s.vipRequest}</CardTitle></CardHeader><CardContent><div className="grid gap-1.5 sm:grid-cols-3"><Select value={vipPkg} onValueChange={setVipPkg}><SelectTrigger className="h-9 text-[11px]"><SelectValue placeholder={s.selectPkg} /></SelectTrigger><SelectContent>{(pkgs.data?.packages ?? []).map((p: any) => <SelectItem key={p.key} value={p.key}>{lang === "fa" ? p.name_fa ?? p.name : p.name}</SelectItem>)}</SelectContent></Select><Input dir="ltr" className="h-9 text-[11px]" placeholder={s.capitalUsdt} value={vipCap} onChange={(e) => setVipCap(e.target.value)} /><Button size="sm" className="h-9" disabled={busy === "vip"} onClick={doVip}>{busy === "vip" ? <Loader2 className="size-3.5 animate-spin" /> : <BadgeCheck className="size-3.5" />} {s.vipRequest}</Button></div></CardContent></Card>
              <Card className="border-border/70 bg-card/60 lg:col-span-3"><CardHeader className="pb-2"><CardTitle className="text-sm"><Rocket className="me-1 inline size-4 text-emerald-400" /> {lang === "fa" ? "دوره آزمایشی رایگان" : "Free trial"}</CardTitle></CardHeader><CardContent><p className="mb-2 text-[10px] text-muted-foreground">{lang === "fa" ? "VIP آزمایشی رایگان — یکبار برای هر کاربر" : "Free VIP trial — once per user"}</p><Button size="sm" className="h-8 w-full" disabled={busy === "trial"} onClick={doTrial}>{busy === "trial" ? <Loader2 className="size-3 animate-spin" /> : <Rocket className="size-3.5" />} {lang === "fa" ? "فعالسازی دوره آزمایشی" : "Activate free trial"}</Button></CardContent></Card>
            </div>
          </TabsContent>

          {/* ══════════ SUPPORT ══════════════════════════════════════ */}
          <TabsContent value="support">
            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><LifeBuoy className="me-1 inline size-4 text-emerald-400" /> {s.tabSupport}</CardTitle></CardHeader><CardContent className="space-y-1.5">{(tix.data?.tickets ?? []).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{tix.loading ? s.loading : s.none}</p>}{(tix.data?.tickets ?? []).map((t: any) => (<button key={t.id} type="button" onClick={() => openTicket(t)} className={`block w-full rounded-md border p-2.5 text-left text-[11px] transition-colors ${selTicket?.id === t.id ? "border-emerald-400/40 bg-emerald-400/5" : "border-border/50 bg-background/40 hover:border-emerald-400/30"}`}><div className="flex items-center justify-between gap-2"><span className="font-bold">{t.subject}</span><Badge variant="outline" className={`text-[9px] ${t.status === "open" ? "bg-emerald-400/10 text-emerald-300" : "text-muted-foreground"}`}>{t.status}</Badge></div><p className="mt-0.5 text-[10px] text-muted-foreground">{fmtTime(t.created_at, lang)}</p></button>))}</CardContent></Card>
              <div className="space-y-3">
                <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.newTicket}</CardTitle></CardHeader><CardContent className="space-y-1.5"><Input className="h-8 text-[11px]" placeholder={s.subject} value={tSub} onChange={(e) => setTSub(e.target.value)} /><Textarea className="min-h-16 text-[11px]" placeholder={s.message} value={tText} onChange={(e) => setTText(e.target.value)} /><Button size="sm" className="h-8 w-full" disabled={busy === "tk"} onClick={doTicket}>{busy === "tk" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} {s.newTicket}</Button></CardContent></Card>
                {selTicket && (<Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm"><span>{selTicket.subject}</span><button type="button" className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setSelTicket(null)}>✕</button></CardTitle></CardHeader><CardContent className="space-y-2"><div className="max-h-44 space-y-1.5 overflow-auto">{(ticketMsgs ?? []).map((m: any) => (<div key={m.id} className={`max-w-[90%] rounded-md border p-2 text-[11px] ${m.from_admin ? "ms-auto border-emerald-400/30 bg-emerald-400/5" : "border-border/50 bg-background/40"}`}><p>{m.text}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{fmtTime(m.created_at, lang)}</p></div>))}{(ticketMsgs ?? []).length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{s.none}</p>}</div><div className="flex gap-1.5"><Input className="h-8 flex-1 text-[11px]" placeholder={s.reply} value={repText} onChange={(e) => setRepText(e.target.value)} /><Button size="sm" className="h-8 gap-1" disabled={busy === "rep"} onClick={doReply}>{busy === "rep" ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} {s.send}</Button></div></CardContent></Card>)}
              </div>
            </div>
          </TabsContent>

          {/* ══════════ NOTIFICATIONS ════════════════════════════════ */}
          <TabsContent value="notifications">
            <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-sm"><Megaphone className="me-1 inline size-4 text-emerald-400" /> {s.tabNotifs}</CardTitle><Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={markRead}>{s.markAllRead}</Button></div></CardHeader><CardContent className="space-y-1.5">{(notifs.data?.notifications ?? []).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{notifs.loading ? s.loading : s.none}</p>}{(notifs.data?.notifications ?? []).map((n: any) => (<div key={n.id} className={`rounded-md border border-border/50 p-2.5 text-[11px] ${n.seen ? "bg-background/30 opacity-60" : "bg-background/40"}`}><div className="flex items-center justify-between gap-2"><span className="font-bold">{lang === "fa" ? n.title_fa ?? n.title : n.title_en ?? n.title}</span>{n.type && <Badge variant="outline" className="text-[9px]" dir="ltr">{n.type}</Badge>}</div>{(n.text_fa ?? n.text) && <p className="mt-0.5 text-muted-foreground">{lang === "fa" ? n.text_fa ?? n.text : n.text_en ?? n.text}</p>}<p className="mt-0.5 text-[9px] text-muted-foreground">{fmtTime(n.created_at, lang)}</p></div>))}</CardContent></Card>
          </TabsContent>

          {/* ══════════ PROFILE ══════════════════════════════════════ */}
          <TabsContent value="profile">
            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><UserIcon className="me-1 inline size-4 text-emerald-400" /> {s.profileInfo}</CardTitle></CardHeader><CardContent className="space-y-1.5 text-[11px]">{(user ? [[s.username, user.username], [s.name, user.name], [s.role, user.role], [s.phone, user.phone], [s.telegram, user.tgUsername ? `@${user.tgUsername}` : "—"], [s.language, user.language]] : []).map(([k, v]) => (<div key={String(k)} className="flex items-center justify-between border-b border-border/40 pb-1"><span className="text-muted-foreground">{k}</span><span className="font-bold" dir="ltr">{v ?? "—"}</span></div>))}</CardContent></Card>
              <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><KeyRound className="me-1 inline size-4 text-emerald-400" /> {s.changePw}</CardTitle></CardHeader><CardContent className="space-y-1.5"><Input dir="ltr" type="password" className="h-8 text-[11px]" placeholder={s.oldPw} value={oldPw} onChange={(e) => setOldPw(e.target.value)} /><Input dir="ltr" type="password" className="h-8 text-[11px]" placeholder={s.newPw} value={newPw} onChange={(e) => setNewPw(e.target.value)} /><Button size="sm" className="h-8 w-full" disabled={busy === "pw"} onClick={doPw}>{busy === "pw" ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />} {s.changePw}</Button></CardContent></Card>
              <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><SlidersHorizontal className="me-1 inline size-4 text-emerald-400" /> {lang === "fa" ? "تنظیمات نمایش" : "Display settings"}</CardTitle></CardHeader><CardContent className="space-y-1.5"><div className="flex gap-1.5"><Select value={prefLang} onValueChange={setPrefLang}><SelectTrigger className="h-8 flex-1 text-[11px]"><SelectValue placeholder={lang === "fa" ? "زبان" : "Language"} /></SelectTrigger><SelectContent><SelectItem value="fa">فارسی</SelectItem><SelectItem value="en">English</SelectItem></SelectContent></Select><Select value={prefTheme} onValueChange={setPrefTheme}><SelectTrigger className="h-8 flex-1 text-[11px]"><SelectValue placeholder={lang === "fa" ? "پوسته" : "Theme"} /></SelectTrigger><SelectContent><SelectItem value="dark">🌙 {lang === "fa" ? "تیره" : "Dark"}</SelectItem><SelectItem value="light">☀️ {lang === "fa" ? "روشن" : "Light"}</SelectItem></SelectContent></Select></div><Button size="sm" className="h-8 w-full" disabled={busy === "prefs"} onClick={doPrefs}>{busy === "prefs" ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle className="size-3.5" />} {s.saved}</Button></CardContent></Card>
              <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><BrainCircuit className="me-1 inline size-4 text-emerald-400" /> {lang === "fa" ? "هوش مصنوعی من" : "My AI"}</CardTitle></CardHeader><CardContent className="space-y-1.5"><div className="grid gap-1.5 sm:grid-cols-2"><Input dir="ltr" className="h-8 text-[11px]" placeholder={s.provider} value={aiPrefProv} onChange={(e) => setAiPrefProv(e.target.value)} /><Input dir="ltr" className="h-8 text-[11px]" placeholder={s.model} value={aiPrefModel} onChange={(e) => setAiPrefModel(e.target.value)} /></div><p className="text-[9px] text-muted-foreground">{lang === "fa" ? "برای گفتگوهای WOLF AI شما" : "Used for your WOLF AI chats"}</p><Button size="sm" className="h-8 w-full" disabled={busy === "aipref"} onClick={doAiPref}>{busy === "aipref" ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle className="size-3.5" />} {s.saved}</Button></CardContent></Card>
            </div>
          </TabsContent>

          {/* ══════════ ADMIN ══════════════════════════════════════════ */}
          <TabsContent value="admin">
            {!staff ? (
              <Card className="border-border/70 bg-card/60"><CardContent className="p-8 text-center text-xs text-muted-foreground">{s.forbidden}</CardContent></Card>
            ) : (
              <Tabs value={adminTab} onValueChange={setAdminTab} className="space-y-4">
                {/* ── admin overview ─────────────────────────────────── */}
                <TabsContent value="overview" className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Stat label={s.engineStatus} value={adminOv.data?.engine?.status ?? "—"} hint={`${s.mode}: ${adminOv.data?.engine?.mode ?? "—"}`} />
                    <Stat label={s.heartbeat} value={adminOv.data?.engine?.heartbeat?.at ? fmtTime(adminOv.data.engine.heartbeat.at, lang) : "—"} />
                    <Stat label={s.capital} value={fmtUsd(adminOv.data?.engine?.capital)} />
                    <Stat label={s.openPositions} value={String((adminOv.data?.openPositions ?? []).length)} />
                  </div>
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.openPositions}</CardTitle></CardHeader><CardContent className="space-y-1.5">{(adminOv.data?.openPositions ?? []).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{s.none}</p>}{(adminOv.data?.openPositions ?? []).map((p: any) => (<div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-[11px]"><span className="flex items-center gap-2"><span className="terminal-font font-bold" dir="ltr">{p.symbol}</span><DirBadge dir={p.side} /></span><span className="terminal-font tabular-nums" dir="ltr">{fmtNum(p.entry)}→{fmtNum(p.current)}</span><span className={`terminal-font font-bold tabular-nums ${Number(p.pnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{fmtUsd(p.pnl)}</span>{isAdmin && <><Button size="sm" variant="ghost" className="h-6 text-[10px]" disabled={busy === `ptg:${p.id}`} onClick={() => doPosTelegram(p.id)}><Send className="size-3" /></Button><Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-400" onClick={() => closePos(p.id)}>✕</Button></>}</div>))}</CardContent></Card>
                </TabsContent>

                {/* ── admin workspace ─────────────────────────────────── */}
                <TabsContent value="workspace" className="space-y-4">
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.adminWorkspace}</CardTitle></CardHeader><CardContent className="space-y-2 text-[10px]">
                    <div className="grid gap-1"><span className="font-bold">{s.tabUsers}:</span> {(adminWs.data?.users ?? []).length} کاربر · {(adminWs.data?.positions ?? []).length} پوزیشن · {(adminWs.data?.closed ?? []).length} بسته شده · {(adminWs.data?.orders ?? []).length} سفارش</div>
                    <div className="grid gap-1"><span className="font-bold">{s.tabExchanges}:</span> {(adminWs.data?.exchanges ?? []).length} صرافی · {(adminWs.data?.providers ?? []).length} AI · {(adminWs.data?.vipPackages ?? []).length} پکیج VIP</div>
                    <div className="grid gap-1"><span className="font-bold">{s.engineStatus}:</span> {adminWs.data?.engine?.mode ?? "—"} · Interval: {adminWs.data?.engine?.intervalSec ?? "—"}s · Capital: {fmtUsd(adminWs.data?.engine?.capital)} · Emergency: {adminWs.data?.engine?.emergencyStop ? "⚠️" : "✓"}</div>
                  </CardContent></Card>
                </TabsContent>

                {/* ── admin engine ──────────────────────────────────── */}
                <TabsContent value="engine" className="space-y-4">
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Power className="me-1 inline size-4 text-red-400" /> {s.adminEngine}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">
                    <Button size="sm" variant="destructive" className="h-8 text-[10px]" disabled={busy.includes("emg")} onClick={() => doStop(true)}><StopCircle className="size-3.5" /> {s.emgStop}</Button>
                    <Button size="sm" variant="outline" className="h-8 text-[10px] border-red-400/30 text-red-300" disabled={busy.includes("emg")} onClick={() => { if (window.confirm("CLOSE_ALL")) void doCloseAll(); }}><X className="size-3.5" /> {s.closeAll}</Button>
                    <Button size="sm" variant="outline" className="h-8 text-[10px]" disabled={busy.includes("eng")} onClick={() => engAction("engine/scan")}><Zap className="size-3.5" /> {s.scanNow}</Button>
                    <Button size="sm" variant="outline" className="h-8 text-[10px] border-amber-400/30 text-amber-300" disabled={busy.includes("emg")} onClick={() => doPause(!eng?.paused)}>{eng?.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />} {eng?.paused ? s.resumeEngine : s.pauseTrades}</Button>
                    <Select value={engMode} onValueChange={setEngMode}><SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder={s.engineMode} /></SelectTrigger><SelectContent><SelectItem value="demo">{s.demo}</SelectItem><SelectItem value="live">{s.real}</SelectItem></SelectContent></Select>
                    <Button size="sm" className="h-8 text-[10px]" disabled={busy === "em"} onClick={doEngMode}><Play className="size-3.5" /> {s.saved}</Button>
                  </CardContent></Card>
                </TabsContent>

                {/* ── admin strategies ────────────────────────────────── */}
                <TabsContent value="strategies" className="space-y-4">
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-sm"><Layers className="me-1 inline size-4 text-emerald-400" /> {s.adminStrategies}</CardTitle><div className="flex gap-1.5">{isAdmin && <><Button size="sm" variant="outline" className="h-7 text-[10px] text-emerald-300" onClick={() => toggleAllStrats(true)}>{s.all} ON</Button><Button size="sm" variant="outline" className="h-7 text-[10px] text-red-300" onClick={() => toggleAllStrats(false)}>{s.all} OFF</Button></>}</div></div></CardHeader><CardContent className="space-y-1">{(adminWs.data?.strategies ?? []).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{s.none}</p>}{(adminWs.data?.strategies ?? []).map((st: any) => (<div key={st.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-[11px]"><span className="flex items-center gap-2"><span className="terminal-font font-bold" dir="ltr">{st.key}</span><span className="text-muted-foreground">{st.category}</span></span><span className="text-muted-foreground">w:{st.weight ?? 1} score:{st.baseline_score ?? 50}</span>{isAdmin ? <Switch checked={st.enabled} onCheckedChange={(v) => toggleStrat(st.key, v)} /> : <StatusBadge ok={st.enabled} />}</div>))}</CardContent></Card>
                </TabsContent>

                {/* ── admin exchanges ─────────────────────────────────── */}
                <TabsContent value="exchanges" className="space-y-4">
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Landmark className="me-1 inline size-4 text-emerald-400" /> {s.adminExchanges}</CardTitle></CardHeader><CardContent className="space-y-1.5">{(adminEx.data?.exchanges ?? []).length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{s.none}</p>}{(adminEx.data?.exchanges ?? []).map((ex: any) => (<div key={ex.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-[11px]"><span className="flex items-center gap-2"><span className="terminal-font font-bold" dir="ltr">{ex.provider}</span><span className="text-muted-foreground">{ex.name}</span><Badge variant="outline" className="text-[9px]">{ex.environment ?? "paper"}</Badge><StatusBadge ok={ex.status === "connected"} okText="CONNECTED" badText={ex.status} /></span>{isAdmin && <div className="flex gap-1"><Button size="sm" variant="ghost" className="h-6 text-[10px]" disabled={busy.includes(`ext:${ex.id}`)} onClick={() => testExchange(ex.id)}><TestTube className="size-3" /> {s.test}</Button><Switch checked={ex.enabled} onCheckedChange={(v) => toggleExchange(ex.id, v)} /></div>}</div>))}
                    {isAdmin && <div className="mt-3 grid gap-1.5 rounded-md border border-emerald-400/20 bg-emerald-400/5 p-3 sm:grid-cols-3 lg:grid-cols-5"><Input dir="ltr" className="h-8 text-[10px]" placeholder={s.name} value={exName} onChange={(e) => setExName(e.target.value)} /><Select value={exProv} onValueChange={setExProv}><SelectTrigger className="h-8 text-[10px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="binance">Binance</SelectItem><SelectItem value="bybit">Bybit</SelectItem><SelectItem value="okx">OKX</SelectItem><SelectItem value="kucoin">KuCoin</SelectItem><SelectItem value="mexc">MEXC</SelectItem><SelectItem value="bitget">Bitget</SelectItem><SelectItem value="gate">Gate.io</SelectItem><SelectItem value="coinex">CoinEx</SelectItem><SelectItem value="paper">Paper</SelectItem></SelectContent></Select><Select value={exEnv} onValueChange={setExEnv}><SelectTrigger className="h-8 text-[10px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="demo">{s.demo}</SelectItem><SelectItem value="live">{s.real}</SelectItem></SelectContent></Select><Input dir="ltr" className="h-8 text-[10px]" placeholder={s.apiKey} value={exApiKey} onChange={(e) => setExApiKey(e.target.value)} /><Input dir="ltr" className="h-8 text-[10px]" placeholder={s.secret} value={exSecret} onChange={(e) => setExSecret(e.target.value)} /><Button size="sm" className="col-span-full h-7 text-[10px]" onClick={doAddExchange}><Plus className="size-3" /> {s.add}</Button></div>}
                  </CardContent></Card>
                </TabsContent>

                {/* ── admin AI providers ──────────────────────────────── */}
                <TabsContent value="ai" className="space-y-4">
                  {isAdmin && <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm"><span><BrainCircuit className="me-1 inline size-4 text-emerald-400" /> {lang === "fa" ? "مصرف AI" : "AI usage"} <Badge variant="outline" className="text-[9px]" dir="ltr">{aiUsage.data?.total ?? 0}</Badge></span>{aiUsage.data?.errors > 0 && <Badge variant="outline" className="border-red-400/30 text-[9px] text-red-300">{lang === "fa" ? "خطا" : "Errors"}: {aiUsage.data.errors}</Badge>}</CardTitle></CardHeader><CardContent className="space-y-1.5">{Object.entries(aiUsage.data?.byKind ?? {}).map(([k, v]: any) => (<div key={k} className="flex items-center justify-between rounded border border-border/40 bg-background/40 px-2 py-1 text-[10px]"><span className="terminal-font" dir="ltr">{k}</span><b>{v}</b></div>))}{Object.entries(aiUsage.data?.byProvider ?? {}).map(([k, v]: any) => (<div key={k} className="flex items-center justify-between rounded border border-border/40 bg-background/40 px-2 py-1 text-[10px]"><span className="terminal-font text-muted-foreground" dir="ltr">{k}</span><span dir="ltr">{v}</span></div>))}<Button size="sm" variant="outline" className="mt-1 h-7 w-full text-[10px] border-red-400/30 text-red-300" disabled={busy === "aic"} onClick={doClearAi}>{busy === "aic" ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} {lang === "fa" ? "پاکسازی تاریخچه AI" : "Clear AI history"}</Button></CardContent></Card>}
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Bot className="me-1 inline size-4 text-emerald-400" /> {s.adminAiProviders}</CardTitle></CardHeader><CardContent className="space-y-1.5">{(adminAi.data?.providers ?? []).length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{s.none}</p>}{(adminAi.data?.providers ?? []).map((ai: any) => (<div key={ai.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-[11px]"><span className="flex items-center gap-2"><span className="terminal-font font-bold" dir="ltr">{ai.provider}</span><span className="text-muted-foreground">{ai.model}</span><Badge variant="outline" className="text-[9px]">{ai.purpose ?? "general"}</Badge><StatusBadge ok={ai.enabled} /></span>{isAdmin && <div className="flex gap-1"><Button size="sm" variant="ghost" className="h-6 text-[10px]" disabled={busy.includes(`ait:${ai.id}`)} onClick={() => testAi(ai.id)}><Wifi className="size-3" /></Button><Switch checked={ai.enabled} onCheckedChange={(v) => toggleAi(ai.id, v)} /></div>}</div>))}
                    {isAdmin && <div className="mt-3 grid gap-1.5 rounded-md border border-emerald-400/20 bg-emerald-400/5 p-3 sm:grid-cols-4"><Input dir="ltr" className="h-8 text-[10px]" placeholder={s.provider} value={aiProv} onChange={(e) => setAiProv(e.target.value)} /><Input dir="ltr" className="h-8 text-[10px]" placeholder={s.model} value={aiModel} onChange={(e) => setAiModel(e.target.value)} /><Input dir="ltr" className="h-8 text-[10px]" placeholder={s.baseUrl} value={aiUrl} onChange={(e) => setAiUrl(e.target.value)} /><Select value={aiPurp} onValueChange={setAiPurp}><SelectTrigger className="h-8 text-[10px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">General</SelectItem><SelectItem value="analysis">Analysis</SelectItem><SelectItem value="education">Education</SelectItem><SelectItem value="image">Image</SelectItem></SelectContent></Select><Button size="sm" className="col-span-full h-7 text-[10px]" onClick={doAddAi}><Plus className="size-3" /> {s.add}</Button></div>}
                  </CardContent></Card>
                  {isAdmin && <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm"><span><BrainCircuit className="me-1 inline size-4 text-emerald-400" /> {lang === "fa" ? "ناظر یادگیری AI" : "AI learning supervisor"}</span>{tuningCtx.data?.context?.autoApply && <Badge variant="outline" className="text-[9px] text-emerald-300">{lang === "fa" ? "اعمال خودکار" : "Auto-apply"}</Badge>}</CardTitle></CardHeader><CardContent className="space-y-1.5 text-[10px]"><div className="flex flex-wrap gap-1.5">{Object.entries(tuningCtx.data?.context?.current ?? {}).map(([k, v]: any) => (<Badge key={k} variant="outline" className="text-[9px]"><span className="terminal-font" dir="ltr">{k}</span> = {v}</Badge>))}</div><Button size="sm" className="h-7 w-full text-[10px]" disabled={busy === "lr"} onClick={doLearnReview}>{busy === "lr" ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />} {lang === "fa" ? "اجرای مرور یادگیری با AI" : "Run AI learning review"}</Button>{learnRes && <div className="rounded border border-emerald-400/20 bg-emerald-400/5 p-2 whitespace-pre-wrap leading-5">{learnRes.ok ? (lang === "fa" ? `مرور: ${learnRes.reviewed ?? 0} · اعمال: ${learnRes.applied ?? 0}` : `Reviewed ${learnRes.reviewed ?? 0} · applied ${learnRes.applied ?? 0}`) : String(learnRes.error ?? "—")}</div>}</CardContent></Card>}
                  {isAdmin && <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Rocket className="me-1 inline size-4 text-emerald-400" /> {lang === "fa" ? "پیشنهاد استراتژی با AI" : "AI strategy suggestions"}</CardTitle></CardHeader><CardContent className="space-y-1.5"><div className="flex gap-1.5"><Input className="h-8 flex-1 text-[10px]" placeholder={lang === "fa" ? "تمرکز (اختیاری)" : "Focus (optional)"} value={suggestFocus} onChange={(e) => setSuggestFocus(e.target.value)} /><Button size="sm" className="h-8 shrink-0" disabled={busy === "sg"} onClick={doSuggest}>{busy === "sg" ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />} {lang === "fa" ? "تولید" : "Generate"}</Button></div>{Array.isArray(suggestRes?.strategies) && <div className="space-y-1.5">{suggestRes.strategies.map((st: any, si: number) => (<div key={si} className="rounded border border-border/40 bg-background/40 p-2 text-[10px]"><p className="font-bold">{lang === "fa" ? st.nameFa ?? st.nameEn : st.nameEn} <span className="terminal-font ms-1 text-[9px] font-normal text-muted-foreground" dir="ltr">{st.key}</span></p><p className="mt-0.5 text-muted-foreground">{lang === "fa" ? st.entry : st.entry}</p><p className="mt-0.5 text-muted-foreground">{lang === "fa" ? st.exit : st.exit} · SL: {st.stop} · <span className="terminal-font" dir="ltr">{st.timeframes}</span></p></div>))}</div>}{suggestRes && !suggestRes.ok && <p className="text-[10px] text-red-300">{suggestRes.error ?? "—"}</p>}</CardContent></Card>}
                </TabsContent>

                {/* ── admin SwapWallet ────────────────────────────────── */}
                <TabsContent value="swapwallet" className="space-y-4">
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Shuffle className="me-1 inline size-4 text-emerald-400" /> {s.adminSwapWallet}</CardTitle></CardHeader><CardContent className="space-y-3">
                    <div className="grid gap-2 rounded-md border border-border/50 bg-background/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div><span className="text-[10px] text-muted-foreground">Status:</span> <StatusBadge ok={adminSw.data?.enabled} okText={s.enabled} badText={s.disabled} /></div>
                      <div><span className="text-[10px] text-muted-foreground">Key:</span> <span className="terminal-font text-xs" dir="ltr">{adminSw.data?.keyMasked ?? "—"}</span></div>
                      <div><span className="text-[10px] text-muted-foreground">Base:</span> <span className="terminal-font text-[10px]" dir="ltr">{adminSw.data?.baseUrl ?? "—"}</span></div>
                    </div>
                    {isAdmin && <div><div className="flex gap-2"><Input dir="ltr" className="h-8 flex-1 text-xs" placeholder="apikey-…" value={swKey} onChange={(e) => setSwKey(e.target.value)} /><Button size="sm" className="h-8" onClick={doSwKey}><KeyRound className="size-3.5 me-1" />{s.saved}</Button></div><div className="mt-2 flex gap-2"><Button size="sm" variant="outline" className="h-7 text-[10px] text-emerald-300" onClick={() => doSwToggle(true)}>{s.enabled}</Button><Button size="sm" variant="outline" className="h-7 text-[10px] text-red-300" onClick={() => doSwToggle(false)}>{s.disabled}</Button></div></div>}
                    {(adminSw.data?.prices ?? []).length > 0 && <div><p className="mb-1 text-[10px] font-bold text-muted-foreground">{s.price}</p><div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{(adminSw.data?.prices ?? []).map((p: any) => (<div key={p.pair} className="rounded border border-border/40 bg-background/40 p-1.5 text-[10px]"><span className="terminal-font font-bold" dir="ltr">{p.pair}</span><span className="terminal-font ms-2" dir="ltr">{fmtNum(p.price, 8)}</span></div>))}</div></div>}
                    {(adminSw.data?.balances ?? []).length > 0 && <div><p className="mb-1 text-[10px] font-bold text-muted-foreground">{s.balance}</p><div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{(adminSw.data?.balances ?? []).map((b: any) => (<div key={b.token} className="rounded border border-border/40 bg-background/40 p-1.5 text-[10px]"><span className="terminal-font font-bold" dir="ltr">{b.token}</span><span className="terminal-font ms-2" dir="ltr">{fmtNum(b.amount?.number ?? b.amount, b.token === "IRT" ? 0 : 6)}</span></div>))}</div></div>}
                  </CardContent></Card>
                </TabsContent>

                {/* ── admin settings ────────────────────────────────────── */}
                <TabsContent value="settings" className="space-y-4">
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Wrench className="me-1 inline size-4 text-emerald-400" /> {s.adminSettings}</CardTitle></CardHeader><CardContent className="space-y-1.5">
                    {Object.entries(adminSet.data?.settings ?? {}).map(([key, val]) => (
                      <div key={key} className="flex flex-wrap items-center gap-2 rounded border border-border/40 bg-background/40 px-2 py-1.5 text-[10px]">
                        <span className="terminal-font min-w-[160px] text-muted-foreground" dir="ltr">{key}</span>
                        <Input
                          dir="ltr"
                          className="h-7 flex-1 text-[10px]"
                          type={key.includes("secret") || key.includes("token") ? "password" : "text"}
                          value={settingsForm[key] ?? ""}
                          onChange={(e) => setSettingsForm((f) => ({ ...f, [key]: e.target.value }))}
                        />
                      </div>
                    ))}
                    {isAdmin && <Button size="sm" className="mt-2 h-8 w-full" disabled={busy === "sets"} onClick={doSaveSettings}>{busy === "sets" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle className="size-3.5" />} {s.saved}</Button>}
                  </CardContent></Card>
                </TabsContent>

                {/* ── admin users ─────────────────────────────────────── */}
                <TabsContent value="users" className="space-y-4">
                  {isAdmin && <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><UserPlus className="me-1 inline size-4 text-emerald-400" /> {s.create} کاربر</CardTitle></CardHeader><CardContent><div className="grid gap-1.5 sm:grid-cols-4"><Input dir="ltr" className="h-8 text-[10px]" placeholder={s.username} value={newUname} onChange={(e) => setNewUname(e.target.value)} /><Input dir="ltr" type="password" className="h-8 text-[10px]" placeholder={s.newPw} value={newUpw} onChange={(e) => setNewUpw(e.target.value)} /><Input dir="ltr" className="h-8 text-[10px]" placeholder={s.name} value={newUName} onChange={(e) => setNewUName(e.target.value)} /><Input dir="ltr" className="h-8 text-[10px]" placeholder="Telegram ID" value={newUTg} onChange={(e) => setNewUTg(e.target.value)} /></div><Button size="sm" className="mt-2 h-8 w-full" onClick={doCreateUser}><Plus className="size-3.5" /> {s.create}</Button></CardContent></Card>}
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Users className="me-1 inline size-4 text-emerald-400" /> {s.tabUsers}</CardTitle></CardHeader><CardContent className="space-y-1">{(Array.isArray(adminWs.data?.users) ? adminWs.data.users : []).slice(0, 100).map((u: any) => (<div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-[11px]"><span className="flex items-center gap-2"><span className="terminal-font font-bold" dir="ltr">{u.username ?? u.tg_id ?? u.id}</span><span className="text-muted-foreground">{u.name}</span>{u.is_vip && <Badge className="text-[9px] bg-amber-400/10 text-amber-300">{u.vip_package ?? "VIP"}</Badge>}{u.is_admin && <Badge className="text-[9px] bg-emerald-400/10 text-emerald-300">ADMIN</Badge>}{u.is_assistant && !u.is_admin && <Badge className="text-[9px] bg-blue-400/10 text-blue-300">ASSISTANT</Badge>}</span>{isAdmin && <div className="flex gap-1"><Switch checked={u.enabled} onCheckedChange={(v) => toggleUser(u.id, "enabled", v)} /><Select value={u.role ?? "user"} onValueChange={(v) => toggleUser(u.id, "role", v)}><SelectTrigger className="h-6 w-20 text-[9px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="user">User</SelectItem><SelectItem value="vip">VIP</SelectItem><SelectItem value="assistant">Assist</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select></div>}</div>))}{(Array.isArray(adminWs.data?.users) ? adminWs.data.users : []).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{s.none}</p>}</CardContent></Card>
                </TabsContent>

                {/* ── admin wallet ────────────────────────────────────── */}
                <TabsContent value="wallet" className="space-y-4">
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><CreditCard className="me-1 inline size-4 text-emerald-400" /> {s.recentTx}</CardTitle></CardHeader><CardContent className="space-y-1.5">{(Array.isArray(adminWs.data?.transactions) ? adminWs.data.transactions : []).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{s.none}</p>}{(Array.isArray(adminWs.data?.transactions) ? adminWs.data.transactions : []).slice(0, 50).map((t: any) => (<div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-1.5 text-[11px]"><span className="flex items-center gap-2"><Badge variant="outline" className="text-[9px]" dir="ltr">{t.type}</Badge><span className="text-muted-foreground">{t.username ?? "—"}</span><span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${t.status === "confirmed" || t.status === "done" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{t.status}</span></span><span className="terminal-font tabular-nums" dir="ltr">{fmtNum(t.amount, 4)} {t.asset ?? "USDT"}</span>{isAdmin && t.status === "pending" && <div className="flex gap-1"><Button size="sm" variant="outline" className="h-6 text-[9px] text-emerald-300" onClick={() => confirmTxn(t.id, true)}>✓</Button><Button size="sm" variant="outline" className="h-6 text-[9px] text-red-300" onClick={() => confirmTxn(t.id, false)}>✕</Button></div>}</div>))}</CardContent></Card>
                </TabsContent>

                {/* ── admin VIP ───────────────────────────────────────── */}
                <TabsContent value="vip" className="space-y-4">
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Trophy className="me-1 inline size-4 text-emerald-400" /> {s.adminVipMgt}</CardTitle></CardHeader><CardContent className="space-y-1.5">{(Array.isArray(adminWs.data?.vipRequests) ? adminWs.data.vipRequests : []).length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{s.none}</p>}{(Array.isArray(adminWs.data?.vipRequests) ? adminWs.data.vipRequests : []).slice(0, 30).map((r: any) => (<div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-[11px]"><span><span className="font-bold">{r.user_name ?? r.user_id}</span><span className="terminal-font ms-2" dir="ltr">{r.package_key}</span><span className="terminal-font ms-2 tabular-nums" dir="ltr">{fmtUsd(r.capital)}</span></span>{isAdmin && r.status === "pending" && <div className="flex gap-1"><Button size="sm" variant="outline" className="h-6 text-[9px] text-emerald-300" disabled={busy === `vr:${r.id}`} onClick={() => reviewVip(r.id, true)}>✓</Button><Button size="sm" variant="outline" className="h-6 text-[9px] text-red-300" disabled={busy === `vr:${r.id}`} onClick={() => reviewVip(r.id, false)}>✕</Button></div>}</div>))}</CardContent></Card>
                </TabsContent>

                {/* ── admin coins ─────────────────────────────────────── */}
                <TabsContent value="coins" className="space-y-4">
                  {isAdmin && <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Coins className="me-1 inline size-4 text-emerald-400" /> {s.adminCoins}</CardTitle></CardHeader><CardContent className="space-y-3">
                    <div className="grid gap-1.5 rounded-md border border-border/50 bg-background/40 p-3"><p className="text-[10px] font-bold text-muted-foreground">{s.adjustCoins}</p><div className="grid gap-1.5 sm:grid-cols-3"><Input dir="ltr" className="h-8 text-[10px]" placeholder={s.userId} value={adjUserId} onChange={(e) => setAdjUserId(e.target.value)} /><Input dir="ltr" className="h-8 text-[10px]" placeholder={s.delta} value={adjDelta} onChange={(e) => setAdjDelta(e.target.value)} /><Button size="sm" className="h-8" onClick={doAdjCoins}>{s.saved}</Button></div></div>
                    <div className="grid gap-1.5 rounded-md border border-border/50 bg-background/40 p-3"><p className="text-[10px] font-bold text-muted-foreground">{s.voucherCreate}</p><div className="grid gap-1.5 sm:grid-cols-4"><Input dir="ltr" className="h-8 text-[10px]" placeholder={s.voucherCode} value={vCode} onChange={(e) => setVCode(e.target.value)} /><Input dir="ltr" className="h-8 text-[10px]" placeholder={s.voucherCoins} value={vCoins} onChange={(e) => setVCoins(e.target.value)} /><Input dir="ltr" className="h-8 text-[10px]" placeholder={s.voucherMaxUses} value={vMax} onChange={(e) => setVMax(e.target.value)} /><Button size="sm" className="h-8" onClick={doVoucherCreate}>{s.create}</Button></div></div>
                  </CardContent></Card>}
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.coinLedger}</CardTitle></CardHeader><CardContent className="space-y-1.5">{(Array.isArray(adminCoins.data?.ledger) ? adminCoins.data.ledger : []).slice(0, 60).map((r: any) => (<div key={r.id} className="flex justify-between rounded border border-border/40 bg-background/40 p-2 text-[10px]"><span>{r.username ?? r.user_id} · {r.reason}</span><span className="terminal-font" dir="ltr">{Number(r.delta) > 0 ? "+" : ""}{fmtNum(r.delta, 2)} {r.currency}</span></div>))}{(Array.isArray(adminCoins.data?.ledger) ? adminCoins.data.ledger : []).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{s.none}</p>}</CardContent></Card>
                </TabsContent>

                {/* ── admin education ──────────────────────────────────── */}
                <TabsContent value="education" className="space-y-4">
                  {isAdmin && <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><BookOpen className="me-1 inline size-4 text-emerald-400" /> {s.educationCreate}</CardTitle></CardHeader><CardContent className="space-y-1.5"><Input className="h-8 text-[10px]" placeholder={s.titleFa} value={eduTitleFa} onChange={(e) => setEduTitleFa(e.target.value)} /><Input className="h-8 text-[10px]" placeholder={s.titleEn} value={eduTitleEn} onChange={(e) => setEduTitleEn(e.target.value)} /><Textarea className="min-h-20 text-[10px]" placeholder={s.bodyFa} value={eduBodyFa} onChange={(e) => setEduBodyFa(e.target.value)} /><Textarea className="min-h-20 text-[10px]" placeholder={s.bodyEn} value={eduBodyEn} onChange={(e) => setEduBodyEn(e.target.value)} /><Button size="sm" className="h-8 w-full" onClick={doEduCreate}>{s.create}</Button></CardContent></Card>}
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm">{s.tabEducation}</CardTitle></CardHeader><CardContent className="space-y-1.5">{(Array.isArray(adminWs.data?.education) ? adminWs.data.education : []).slice(0, 30).map((e: any) => (<div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-[11px]"><span className="flex items-center gap-2"><span className="font-bold">{lang === "fa" ? e.title_fa : e.title_en}</span><Badge variant="outline" className={`text-[9px] ${e.status === "approved" ? "bg-emerald-400/10 text-emerald-300" : e.status === "rejected" ? "bg-red-400/10 text-red-300" : "bg-amber-400/10 text-amber-300"}`}>{e.status}</Badge></span>{isAdmin && e.status !== "approved" && <div className="flex gap-1"><Button size="sm" variant="ghost" className="h-6 text-[9px] text-emerald-300" onClick={() => reviewEdu(e.id, "approved")}>✓</Button><Button size="sm" variant="ghost" className="h-6 text-[9px] text-red-300" onClick={() => reviewEdu(e.id, "rejected")}>✕</Button></div>}</div>))}{(Array.isArray(adminWs.data?.education) ? adminWs.data.education : []).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{s.none}</p>}</CardContent></Card>
                  {isAdmin && <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><BookOpen className="me-1 inline size-4 text-emerald-400" /> {lang === "fa" ? "درسهای در انتظار (روزها)" : "Pending lessons by day"}</CardTitle></CardHeader><CardContent className="space-y-1">{(Array.isArray(eduDays.data?.days) ? eduDays.data.days : []).length === 0 && <p className="py-3 text-center text-[10px] text-muted-foreground">{s.none}</p>}{(Array.isArray(eduDays.data?.days) ? eduDays.data.days : []).slice(0, 20).map((d: any) => (<div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/40 bg-background/40 px-2 py-1.5 text-[10px]"><span className="terminal-font font-bold" dir="ltr">{d.day ?? "—"}</span><span>{lang === "fa" ? d.title_fa : d.title_en}</span><div className="flex gap-1"><Button size="sm" variant="outline" className="h-6 text-[9px] text-emerald-300" disabled={busy === `eds:${d.id}`} onClick={() => doEduSend(d.id, "fa")}>FA</Button><Button size="sm" variant="outline" className="h-6 text-[9px] text-blue-300" disabled={busy === `eds:${d.id}`} onClick={() => doEduSend(d.id, "en")}>EN</Button><Button size="sm" variant="ghost" className="h-6 text-[9px]" disabled={busy === `edm:${d.id}`} onClick={() => doEduMedia(d.id)}><RefreshCw className="size-3" /></Button></div></div>))}</CardContent></Card>}
                </TabsContent>

                {/* ── admin support ────────────────────────────────────── */}
                <TabsContent value="support">
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Headphones className="me-1 inline size-4 text-emerald-400" /> {s.adminSupport}</CardTitle></CardHeader><CardContent className="space-y-1.5">{(Array.isArray(adminWs.data?.ticketsData) ? adminWs.data.ticketsData : []).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{s.none}</p>}</CardContent></Card>
                </TabsContent>

                {/* ── admin telegram ────────────────────────────────────── */}
                <TabsContent value="telegram">
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><Send className="me-1 inline size-4 text-emerald-400" /> {s.adminTelegram}</CardTitle></CardHeader><CardContent className="space-y-3">
                    {isAdmin && <Button size="sm" className="h-8" disabled={busy === "wh"} onClick={doWebhook}>{busy === "wh" ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />} {s.webhook}</Button>}
                    {isAdmin && <div className="rounded-md border border-border/50 bg-background/40 p-3"><p className="mb-1.5 text-[11px] font-bold text-muted-foreground"><Send className="me-1 inline size-3" /> {lang === "fa" ? "ارسال مستقیم به کاربر" : "Direct message"}</p><Input dir="ltr" className="h-8 text-[10px]" placeholder={lang === "fa" ? "شناسه کاربر (آیدی / نام کاربری)" : "User id / username"} value={tgUserId} onChange={(e) => setTgUserId(e.target.value)} /><Textarea className="mt-1.5 min-h-16 text-[10px]" placeholder={s.message} value={tgMsg} onChange={(e) => setTgMsg(e.target.value)} /><Button size="sm" className="mt-1.5 h-8 w-full" disabled={busy === "tgs"} onClick={doTgSend}>{busy === "tgs" ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} {lang === "fa" ? "ارسال" : "Send"}</Button></div>}
                    <div className="text-[10px] text-muted-foreground">Webhook Secret: <span className="terminal-font" dir="ltr">{String(adminSet.data?.settings?.["telegram.webhookSecret"] ?? "—").slice(0, 8)}…</span></div>
                    {(Array.isArray(adminWs.data?.telegram) ? adminWs.data.telegram : []).slice(0, 30).map((tm: any) => (<div key={tm.id} className="rounded border border-border/40 bg-background/40 p-1.5 text-[10px]"><span className="font-bold">{tm.chat_id ?? tm.channel}</span><span className="ms-2 text-muted-foreground">{tm.text?.slice(0, 80)}</span><span className="ms-2 text-muted-foreground">{fmtTime(tm.created_at, lang)}</span></div>))}
                  </CardContent></Card>
                </TabsContent>

                {/* ── admin logs ─────────────────────────────────────── */}
                <TabsContent value="logs" className="space-y-4">
                  <Card className="border-border/70 bg-card/60"><CardHeader className="pb-2"><CardTitle className="text-sm"><ClipboardList className="me-1 inline size-4 text-emerald-400" /> {s.adminLogs}</CardTitle></CardHeader><CardContent className="max-h-96 space-y-1 overflow-auto">
                    {(Array.isArray(adminLog.data?.logs) ? adminLog.data.logs : []).length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{s.none}</p>}
                    {(Array.isArray(adminLog.data?.logs) ? adminLog.data.logs : []).slice(0, 100).map((l: any) => (<div key={l.id} className="rounded border-b border-border/40 px-2 py-1 text-[10px]"><span className={`me-1.5 rounded px-1 py-0.5 font-bold ${String(l.level ?? "").includes("ERROR") || String(l.level ?? "").includes("WARN") ? "bg-red-400/10 text-red-300" : "bg-emerald-400/10 text-emerald-300"}`} dir="ltr">{l.level}</span><span className="terminal-font text-muted-foreground" dir="ltr">{fmtTime(l.created_at, lang)}</span><span className="ms-2">{l.message}</span></div>))}
                    <Separator className="my-2" />
                    <p className="text-[10px] font-bold text-muted-foreground">Audit:</p>
                    {(Array.isArray(adminLog.data?.audit) ? adminLog.data.audit : []).slice(0, 60).map((a: any, i: number) => (<div key={a.id ?? i} className="rounded border-b border-border/40 px-2 py-1 text-[10px]"><span className="terminal-font text-muted-foreground" dir="ltr">{fmtTime(a.created_at, lang)}</span><span className="ms-2 font-bold">{a.action}</span><span className="ms-1 text-muted-foreground">{a.actor ?? "system"} → {a.target}</span></div>))}
                  </CardContent></Card>
                </TabsContent>
              </Tabs>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-6 text-center text-[10px] text-muted-foreground">
        <AlertTriangle className="mx-auto mb-1 size-3.5" /> {s.footer}
      </footer>
    </div>
  );
}