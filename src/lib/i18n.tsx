import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "en" | "fa";

const en: Record<string, string> = {
  // ── shared ───────────────────────────────────────────────────────────
  "brand.tagline": "engine · auth",
  "lang.btn": "FA",
  "time.never": "never",
  "time.now": "just now",
  "time.s": "s ago",
  "time.m": "m ago",
  "time.h": "h ago",
  "time.d": "d ago",

  // ── nav / hero ───────────────────────────────────────────────────────
  "nav.engine": "Engine",
  "nav.anatomy": "Anatomy",
  "nav.signals": "Signals",
  "nav.signin": "Sign in",
  "nav.launch": "Launch engine",
  "hero.badge": "wolf AI · autonomous trading",
  "hero.title1": "An autonomous trading engine that ",
  "hero.title2": "never sleeps",
  "hero.title3": ".",
  "hero.sub":
    "Trading Wolf AI monitors the market around the clock, analyzes 65+ instruments with 100+ strategies, and sends you instant Telegram alerts when a high-confidence opportunity appears — so you never miss a trade, even while you sleep.",
  "hero.console": "wolf-engine — live session",
  "hero.cta1": "Open command center",
  "hero.cta2": "How it works",
  "stat.strategies": "real strategies",
  "stat.instruments": "markets covered",
  "stat.timeframes": "timeframes stacked",
  "stat.uptime": "headless operation",

  // ── capabilities ─────────────────────────────────────────────────────
  "sec.engine.label": "engine",
  "sec.engine.title": "Built like infrastructure, not a signal feed",
  "sec.engine.sub":
    "Every signal is backed by live data and multi-layer risk protection — you see the reasoning before any trade is placed.",
  "cap.mtf.title": "Multi-timeframe analysis",
  "cap.mtf.body":
    "Structure is read across six timeframes — 1m to 1D — and only confluent setups reach the signal layer.",
  "cap.smc.title": "SMC / ICT structure",
  "cap.smc.body":
    "Order blocks, fair value gaps, liquidity sweeps and market-structure shifts are detected on raw candles, no lagging repaint.",
  "cap.strategies.title": "100+ strategy library",
  "cap.strategies.body":
    "Price action, momentum, mean reversion, breakout, volume, SMC/ICT and volatility families vote through weighted score aggregation — no single strategy can open a trade alone.",
  "cap.risk.title": "Risk-first execution",
  "cap.risk.body":
    "Position size comes from volatility, confidence and daily drawdown limits. A stop loss is attached to every trade, before the order is even sent.",
  "cap.telegram.title": "Telegram bridge",
  "cap.telegram.body":
    "The bot carries user, auth and notifications only. Every decision, position and review lives in the web console.",
  "cap.replay.title": "Full audit trail",
  "cap.replay.body":
    "Every signal, order, decision and AI review is timestamped and logged — so every trade can be replayed and audited end-to-end.",

  // ── anatomy ──────────────────────────────────────────────────────────
  "sec.anatomy.label": "anatomy",
  "sec.anatomy.title": "One core, every surface",
  "sec.anatomy.sub":
    "Telegrams are notifications. Dashboards are mirrors. The engine — and only the engine — decides.",
  "arch.engine.title": "Trading Engine",
  "arch.engine.sub": "strategy core · signal aggregation · risk sizing · AI review",
  "arch.api.title": "Central API",
  "arch.api.sub": "single surface · sync & auth · event stream",
  "arch.clients.title": "Clients",
  "arch.clients.sub": "Website · Telegram Mini App · Bot notifications",
  "arch.db.title": "Database",
  "arch.db.sub": "positions · signals · strategies · audit trail",
  "arch.exchange.title": "Exchange / MT5 APIs",
  "arch.exchange.sub": "demo + live brokers · encrypted credentials",

  // ── signals feed ─────────────────────────────────────────────────────
  "sec.signals.label": "signals",
  "sec.signals.title": "What the pack hunts",
  "sec.signals.sub":
    "Live signals with entry price, stop loss, take profit, confidence score, and strategy reasons — ready to act on.",
  "signals.badge": "40 markets · 6 timeframes · live feed",
  "tbl.symbol": "Symbol",
  "tbl.market": "Market",
  "tbl.direction": "Direction",
  "tbl.confidence": "Confidence",
  "tbl.rr": "Risk:Reward",

  // ── CTA / footer ─────────────────────────────────────────────────────
  "cta.title": "Your engine is already awake.",
  "cta.sub":
    "Log in to see your open positions, real-time signals, and personalized market insights — all in one place.",
  "cta.btn": "Open the command center",
  "footer.risk": "Built by traders, for traders — powered by Trading Wolf AI.",

  // ── support ───────────────────────────────────────────────────────────
  "support.title": "Need help?",
  "support.subtitle": "Reach out through Telegram or email — we typically respond within a few hours.",
  "support.telegram": "Telegram",
  "support.telegram.hint": "@marijtradebot — open a chat or join our channel",
  "support.email": "Email",
  "support.email.hint": "motamedmohamad1@gmail.com — technical issues, feedback, or partnership inquiries",

  // ── auth ─────────────────────────────────────────────────────────────
  "auth.title": "Sign in to your account",
  "auth.subtitle": "Use your username and password, or continue with Telegram",
  "auth.username": "Username",
  "auth.username.ph": "Username",
  "auth.password": "Password",
  "auth.password.ph": "Password",
  "auth.submit": "Sign in",
  "auth.demo.hint": "Use admin account: wolfadmin / Wolf3010!",
  "auth.telegram": "Continue with Telegram",
  "auth.telegram.hint": "Available inside the Telegram Mini App",
  "auth.footer": "Secure sign-in · your session is protected by the platform",
  "auth.error.credentials": "Invalid username or password.",
  "auth.error.disabled": "Your account has been disabled.",
  "auth.error.telegram": "Telegram sign-in failed. Try again.",
  "auth.error.generic": "Something went wrong. Please try again.",

  // ── dashboard ────────────────────────────────────────────────────────
  "dash.breadcrumb": "/command-center",
  "dash.operator": "operator",
  "dash.online": "ENGINE ONLINE",
  "dash.offline": "OFFLINE",
  "dash.signout": "Sign out",
  "dash.label": "telemetry",
  "dash.title": "Engine command center",
  "dash.subtitle":
    "Live view of the pack — positions, signals, markets and the strategies driving them.",
  "dash.mode": "mode",
  "dash.lastscan": "last scan",
  "dash.footer":
    "Trading Wolf AI · private engine · positions and P&L shown are reference data",
  "kpi.positions": "Open positions",
  "kpi.winrate": "Win rate · closed",
  "kpi.realized": "Realized P&L",
  "kpi.markets": "Markets watched",
  "kpi.floating": "floating",
  "kpi.exposure": "exposure",
  "kpi.realizedHint": "last 60 closed trades",
  "kpi.forex": "forex",
  "kpi.crypto": "crypto",
  "kpi.of": "of",
  "log.title": "Engine log",
  "log.tail": "tail · last",
  "log.empty": "no engine events yet — the pack is listening",
  "signals.title": "Recent signals",
  "signals.open": "open",
  "signals.empty": "No signals emitted yet.",
  "markets.title": "Watched instruments",
  "markets.subtitle": "Live reference feed across forex & crypto",
  "markets.shown": "shown",
  "tbl.name": "Name",
  "tbl.last": "Last",
  "tbl.change": "24h",
  "strategy.title": "Strategy battery",
  "strategy.subtitle": "Highest-weighted families in the voting layer",
  "strategy.on": "armed",
  "strategy.off": "off",
  "strategy.weight": "weight",
};

const fa: Record<string, string> = {
  // ── shared ───────────────────────────────────────────────────────────
  "brand.tagline": "موتور · ورود",
  "nav.btn": "EN",
  "time.never": "هرگز",
  "time.now": "همین حالا",
  "time.s": " ثانیه پیش",
  "time.m": " دقیقه پیش",
  "time.h": " ساعت پیش",
  "time.d": " روز پیش",

  // ── landing nav / hero ───────────────────────────────────────────────
  "nav.engine": "موتور",
  "nav.anatomy": "معماری",
  "nav.signals": "سیگنال‌ها",
  "nav.signin": "ورود",
  "nav.launch": "ورود به پلتفرم",
  "hero.badge": "ولف AI · معامله خودکار",
  "hero.title1": "یک موتور معاملاتی خودکار که ",
  "hero.title2": "هرگز نمی‌خوابد",
  "hero.title3": "",
  "hero.sub":
    "ولف ای‌آی بازار را ۲۴ ساعته زیر نظر دارد، ۶۵+ نماد را با بیش از ۱۰۰ استراتژی تحلیل می‌کند و به محض پیدا شدن یک فرصت با اطمینان بالا، فوراً به شما در تلگرام اطلاع‌رسانی می‌کند — حتی وقتی خواب هستید، معامله را از دست نمی‌دهید.",
  "hero.console": "ولف-موتور — نشست زنده",
  "hero.cta1": "ورود به پلتفرم",
  "hero.cta2": "چطور کار می‌کند",
  "stat.strategies": "استراتژی واقعی",
  "stat.instruments": "بازار تحت پوشش",
  "stat.timeframes": "تایم‌فریم هم‌زمان",
  "stat.uptime": "اجرای ۲۴ ساعته",

  // ── capabilities ─────────────────────────────────────────────────────
  "sec.engine.label": "موتور",
  "sec.engine.title": "ساخته‌شده مثل زیرساخت، نه یک کانال سیگنال",
  "sec.engine.sub":
    "هر سیگنال بر پایه داده زنده و محافظت چندلایه ریسک است — قبل از هر معامله دلیل آن را می‌بینید.",
  "cap.mtf.title": "تحلیل چند تایم‌فریمی",
  "cap.mtf.body":
    "ساختار بازار از ۱ دقیقه تا روزانه خوانده می‌شود و فقط سیگنال‌هایی با هم‌راستایی کامل به لایه سیگنال می‌رسند.",
  "cap.smc.title": "ساختار SMC / ICT",
  "cap.smc.body":
    "اُردربلاک‌ها، فِر ورد گپ، بازارگردانی نقدینگی و تغییر ساختار (CHoCH/MSS) مستقیماً روی کندل‌های خام شناسایی می‌شوند؛ بدون اندیکاتور عقب‌افتاده.",
  "cap.strategies.title": "کتابخانه ۱۰۰+ استراتژی",
  "cap.strategies.body":
    "پرایس اکشن، مومنتوم، بازگشت به میانگین، بریک‌اوت، حجم، SMC/ICT و نوسان‌سنج‌ها با تجمیع امتیاز وزنی رأی می‌دهند — هیچ استراتژی به تنهایی نمی‌تواند معامله باز کند.",
  "cap.risk.title": "اجرای ریسک‌محور",
  "cap.risk.body":
    "سایز پوزیشن از روی نوسان، اطمینان و محدودیت ضرر روزانه محاسبه می‌شود و حد ضرر قبل از ارسال هر سفارش به آن چسبانده می‌شود.",
  "cap.telegram.title": "پل تلگرام",
  "cap.telegram.body":
    "ربات فقط کاربر، احراز هویت و اعلان را جابه‌جا می‌کند؛ تصمیم، پوزیشن و بازبینی همه در کنسول وب زندگی می‌کنند.",
  "cap.replay.title": "ترک ممیزی کامل",
  "cap.replay.body":
    "هر سیگنال، سفارش، تصمیم و بازبینی هوش مصنوعی با زمان‌بندی ثبت می‌شود تا هر معامله را بتوان سراسری بازپخش و ممیزی کرد.",

  // ── anatomy ──────────────────────────────────────────────────────────
  "sec.anatomy.label": "آناتومی",
  "sec.anatomy.title": "یک هسته، همه سطوح",
  "sec.anatomy.sub":
    "تلگرام فقط اعلان است؛ داشبورد فقط آینه است؛ تصمیم را فقط و فقط موتور می‌گیرد.",
  "arch.engine.title": "موتور معاملاتی",
  "arch.engine.sub": "هسته استراتژی · تجمیع سیگنال · تعیین حجم ریسک · بازبینی هوش مصنوعی",
  "arch.api.title": "API مرکزی",
  "arch.api.sub": "یک سطح واحد · همگام‌سازی و احراز · جریان رویدادها",
  "arch.clients.title": "کلاینت‌ها",
  "arch.clients.sub": "وب‌سایت · مینی‌اپ تلگرام · اعلان‌های ربات",
  "arch.db.title": "دیتابیس",
  "arch.db.sub": "پوزیشن‌ها · سیگنال‌ها · استراتژی‌ها · ترک ممیزی",
  "arch.exchange.title": "API صرافی / MT5",
  "arch.exchange.sub": "بروکرهای دمو و لایو · اعتبارنامه رمزنگاری‌شده",

  // ── signals feed ─────────────────────────────────────────────────────
  "sec.signals.label": "سیگنال‌ها",
  "sec.signals.title": "گرگ‌ها دنبال چه هستند",
  "sec.signals.sub":
    "سیگنال‌های زنده با قیمت ورود، حد ضرر، حد سود، امتیاز اطمینان و دلایل استراتژی — آماده برای اقدام.",
  "signals.badge": "۴۰ بازار · ۶ تایم‌فریم · فید زنده",
  "tbl.symbol": "نماد",
  "tbl.market": "بازار",
  "tbl.direction": "جهت",
  "tbl.confidence": "اطمینان",
  "tbl.rr": "ریسک/ریوارد",

  // ── CTA / footer ─────────────────────────────────────────────────────
  "cta.title": "موتور شما از قبل بیدار است.",
  "cta.sub":
    "وارد مرکز فرمان شوید — پوزیشن‌ها را ببینید، سیگنال‌ها را مرور کنید و استراتژی آن‌ها را تنظیم کنید.",
  "cta.btn": "ورود به پلتفرم",
  "footer.risk": "ساخته‌شده توسط تریدرها، برای تریدرها — قدرت‌گرفته از تریدینگ ولف ای‌آی.",

  // ── support ───────────────────────────────────────────────────────────
  "support.title": "نیاز به کمک دارید؟",
  "support.subtitle": "از طریق تلگرام یا ایمیل با ما در ارتباط باشید — معمولاً در چند ساعت پاسخ می‌دهیم.",
  "support.telegram": "تلگرام",
  "support.telegram.hint": "@marijtradebot — چت کنید یا در کانال عضو شوید",
  "support.email": "ایمیل",
  "support.email.hint": "motamedmohamad1@gmail.com — مشکلات فنی، بازخورد یا همکاری",

  // ── auth ─────────────────────────────────────────────────────────────
  "auth.title": "ورود به حساب کاربری",
  "auth.subtitle": "با نام کاربری و رمز عبور وارد شوید یا از تلگرام ادامه دهید",
  "auth.username": "نام کاربری",
  "auth.username.ph": "نام کاربری",
  "auth.password": "رمز عبور",
  "auth.password.ph": "رمز عبور",
  "auth.submit": "ورود",
  "auth.demo.hint": "ورود سریع با حساب مدیر: wolfadmin / Wolf3010!",
  "auth.telegram": "ورود با تلگرام",
  "auth.telegram.hint": "داخل مینی‌اپ تلگرام فعال است",
  "auth.footer": "ورود امن · نشست شما توسط پلتفرم محافظت می‌شود",
  "auth.error.credentials": "نام کاربری یا رمز عبور اشتباه است.",
  "auth.error.disabled": "حساب کاربری شما غیرفعال شده است.",
  "auth.error.telegram": "ورود با تلگرام ناموفق بود. دوباره تلاش کنید.",
  "auth.error.generic": "خطایی رخ داد. دوباره تلاش کنید.",

  // ── dashboard ────────────────────────────────────────────────────────
  "dash.breadcrumb": "/مرکز-فرمان",
  "dash.operator": "اپراتور",
  "dash.online": "موتور آنلاین",
  "dash.offline": "آفلاین",
  "dash.signout": "خروج",
  "dash.label": "تلهمتری",
  "dash.title": "مرکز فرمان موتور",
  "dash.subtitle":
    "نمای زنده از دست‌گرم — پوزیشن‌ها، سیگنال‌ها، بازارها و استراتژی‌هایی که آن‌ها را هدایت می‌کنند.",
  "dash.mode": "حالت",
  "dash.lastscan": "آخرین اسکن",
  "dash.footer":
    "تریدینگ ولف ای‌آی · موتور خصوصی · پوزیشن‌ها و سود/زیان نمایش‌داده‌شده داده مرجع‌اند",
  "kpi.positions": "پوزیشن‌های فعال",
  "kpi.winrate": "نرخ برد · بسته‌شده",
  "kpi.realized": "سود/زیان محقق‌شده",
  "kpi.markets": "نمودارهای تحت نظر",
  "kpi.floating": "شناور",
  "kpi.exposure": "در معرض ریسک",
  "kpi.realizedHint": "آخرین ۶۰ معامله بسته‌شده",
  "kpi.forex": "فارکس",
  "kpi.crypto": "کریپتو",
  "kpi.of": "از",
  "log.title": "لاگ موتور",
  "log.tail": "پایان · آخرین",
  "log.empty": "هنوز رویدادی ثبت نشده — گرگ‌ها گوش‌به‌زنگ‌اند",
  "signals.title": "سیگنال‌های اخیر",
  "signals.open": "باز",
  "signals.empty": "هنوز سیگنالی صادر نشده.",
  "markets.title": "نمادهای تحت نظر",
  "markets.subtitle": "فید زنده مرجع در فارکس و کریپتو",
  "markets.shown": "نمایش",
  "tbl.name": "نام",
  "tbl.last": "آخرین",
  "tbl.change": "۲۴س",
  "strategy.title": "باتری استراتژی‌ها",
  "strategy.subtitle": "پرامتیازترین خانواده‌ها در لایه رأی‌گیری",
  "strategy.on": "آماده",
  "strategy.off": "خاموش",
  "strategy.weight": "وزن",
};

const DICT: Record<Lang, Record<string, string>> = { en, fa };

export type I18n = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
};

const LangContext = createContext<I18n | null>(null);

function readInitialLang(): Lang {
  if (typeof window === "undefined") return "fa";
  const saved = window.localStorage.getItem("wolf.lang");
  if (saved === "en" || saved === "fa") return saved;
  // Persian (فارسی) is the primary language of this product
  return "fa";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(readInitialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
    localStorage.setItem("wolf.lang", lang);
  }, [lang]);

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key: string) => DICT[lang][key] ?? key,
    }),
    [lang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useI18n must be used within LanguageProvider");
  return ctx;
}

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "fa" : "en")}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background/40 px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-emerald-400/40 hover:text-emerald-300 ${className}`}
      aria-label="Switch language / تغییر زبان"
    >
      {lang === "en" ? "فا" : "EN"}
    </button>
  );
}