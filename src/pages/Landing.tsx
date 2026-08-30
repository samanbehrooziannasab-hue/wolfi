import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import logo from "@/assets/logo.svg";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatSymbol as fmtSym } from "@/lib/format";
import { LangToggle, useI18n } from "@/lib/i18n";
import {
  ArrowRight,
  Bot,
  Moon,
  Sun,
  BrainCircuit,
  CandlestickChart,
  Cpu,
  Database,
  Globe,
  Layers,
  Mail,
  Radio,
  Send,
  ShieldCheck,
  Terminal,
  Workflow,
} from "lucide-react";

// ─── typed engine console (terminal output stays technical / LTR) ─────────
const CONSOLE_LINES = [
  "$ wolf engine start --autonomous",
  "ok — engine core online (v1.3.0)",
  "market feed · binance + yahoo · live candles",
  "BTCUSDT · LONG  · conf 0.82 · RR 1:3.2 · SL 36910",
  "EURUSD  · SHORT · conf 0.74 · RR 1:2.5 · SL 1.0874",
  "SOLUSDT · LONG  · conf 0.71 · RR 1:2.0 · SL 96.1",
  "→ 2 positions opened · risk 1.5% each",
  "ai.review → 4 setups validated · 2 rejected",
  "monitor ok · 2 open · telegram alert sent",
  "next scan in 60s · heartbeat ok",
];

// ─── section data (keys into the i18n dictionary) ─────────────────────────
const CAPABILITIES: { key: string; icon: typeof Cpu }[] = [
  { key: "cap.mtf", icon: BrainCircuit },
  { key: "cap.smc", icon: CandlestickChart },
  { key: "cap.strategies", icon: Cpu },
  { key: "cap.risk", icon: ShieldCheck },
  { key: "cap.telegram", icon: Bot },
  { key: "cap.replay", icon: Workflow },
];

// ─── inline candle chart SVG with WOLF AI watermark ──────────────────
function HeroCandleChart() {
  const VISIBLE = 28;
  const SPACING = 22;
  const [tick, setTick] = useState(0);

  // Animated candle stream — a new candle slides in every 2s
  const candlesRef = useRef<Array<{ o: number; h: number; l: number; c: number }>>([]);
  if (candlesRef.current.length === 0) {
    let price = 68;
    for (let i = 0; i < VISIBLE; i++) {
      const o = price;
      const change = Math.sin(i * 0.6) * 2 + (i % 4 === 0 ? -2.5 : 1.8);
      const c = o + change;
      const hi = Math.max(o, c) + Math.abs(change) * 0.4;
      const lo = Math.min(o, c) - Math.abs(change) * 0.3;
      candlesRef.current.push({ o, h: hi, l: lo, c });
      price = c;
    }
  }

  useEffect(() => {
    const id = window.setInterval(() => {
      const last = candlesRef.current[candlesRef.current.length - 1];
      const trend = Math.sin(candlesRef.current.length * 0.4) * 1.2;
      const noise = (Math.random() - 0.48) * 2.5;
      const o = last.c;
      const c = o + trend + noise;
      const hi = Math.max(o, c) + Math.abs(noise) * 0.5;
      const lo = Math.min(o, c) - Math.abs(noise) * 0.4;
      candlesRef.current.push({ o, h: hi, l: lo, c });
      if (candlesRef.current.length > VISIBLE + 40) candlesRef.current.shift();
      setTick((t) => t + 1);
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  const candles = candlesRef.current.slice(-VISIBLE);
  const allPrices = candles.flatMap((c) => [c.h, c.l]);
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const range = maxP - minP || 1;
  const w = 640;
  const h = 320;
  const pad = { t: 50, b: 40, l: 10, r: 10 };
  const ch = h - pad.t - pad.b;

  const y = (p: number) => pad.t + ch - ((p - minP) / range) * ch;
  const lastC = candles[candles.length - 1];
  void tick; // ensure re-render

  return (
    <div className="relative rounded-xl border border-border/50 bg-[oklch(0.12_0.01_262)] shadow-2xl overflow-hidden">
      {/* Watermark */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
        <span className="select-none text-[52px] font-black tracking-tighter text-white/[0.06]">WOLF AI</span>
      </div>
      {/* Live indicator */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
        </span>
        <span className="text-[10px] font-mono text-emerald-400/70">LIVE</span>
      </div>
      {/* Price scale */}
      <div className="absolute right-2 top-0 h-full flex flex-col justify-between py-12 z-10">
        {[maxP, (maxP + minP) / 2, minP].map((p) => (
          <span key={p} className="text-[9px] font-mono text-white/30">{p.toFixed(1)}</span>
        ))}
      </div>
      <div dir="ltr">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto transition-all duration-500">
        {/* Grid lines */}
        {[0.2, 0.4, 0.6, 0.8].map((f) => (
          <line key={f} x1={pad.l} x2={w - pad.r} y1={pad.t + ch * f} y2={pad.t + ch * f} stroke="white" strokeOpacity={0.04} />
        ))}
        {/* EMA lines (9 and 21) */}
        {(() => {
          const ema9 = candles.map((_, i) => {
            const slice = candles.slice(Math.max(0, i - 8), i + 1);
            return slice.reduce((s, c) => s + c.c, 0) / slice.length;
          });
          const ema21 = candles.map((_, i) => {
            const slice = candles.slice(Math.max(0, i - 20), i + 1);
            return slice.reduce((s, c) => s + c.c, 0) / slice.length;
          });
          return (
            <>
              <polyline fill="none" stroke="#22d3ee" strokeWidth={1.2} strokeOpacity={0.5}
                points={ema9.map((p, i) => `${i * SPACING + 12},${y(p)}`).join(' ')} />
              <polyline fill="none" stroke="#f472b6" strokeWidth={1.2} strokeOpacity={0.4}
                points={ema21.map((p, i) => `${i * SPACING + 12},${y(p)}`).join(' ')} />
            </>
          );
        })()}
        {/* Candles with enter animation */}
        {candles.map((c, i) => {
          const bull = c.c >= c.o;
          const color = bull ? '#22c55e' : '#ef4444';
          const bodyTop = y(Math.max(c.o, c.c));
          const bodyBot = y(Math.min(c.o, c.c));
          const bodyH = Math.max(bodyBot - bodyTop, 1);
          const cx = i * SPACING + 12;
          return (
            <g key={i} className={i === candles.length - 1 ? 'opacity-0 animate-[fadeIn_0.6s_ease-out_forwards]' : ''}>
              <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={1.2} strokeOpacity={0.7} />
              <rect x={cx - 5} y={bodyTop} width={10} height={bodyH} rx={1.5} fill={color} fillOpacity={bull ? 0.85 : 0.9} />
            </g>
          );
        })}
        {/* Entry / SL / TP lines */}
        <line x1={pad.l} x2={w - pad.r} y1={y(lastC.c + 1.5)} y2={y(lastC.c + 1.5)} stroke="#22d3ee" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.6} />
        <text x={pad.l + 4} y={y(lastC.c + 1.5) - 4} fill="#22d3ee" fontSize={9} fontFamily="monospace" opacity={0.7}>ENTRY</text>
        <line x1={pad.l} x2={w - pad.r} y1={y(lastC.l - 1)} y2={y(lastC.l - 1)} stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.5} />
        <text x={pad.l + 4} y={y(lastC.l - 1) - 4} fill="#ef4444" fontSize={9} fontFamily="monospace" opacity={0.6}>SL</text>
        <line x1={pad.l} x2={w - pad.r} y1={y(maxP + 1)} y2={y(maxP + 1)} stroke="#22c55e" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.5} />
        <text x={pad.l + 4} y={y(maxP + 1) - 4} fill="#22c55e" fontSize={9} fontFamily="monospace" opacity={0.6}>TP</text>
      </svg>
      </div>
    </div>
  );
}

const ARCH_LAYERS: { key: string; icon: typeof Cpu; top?: boolean }[] = [
  { key: "arch.engine", icon: Cpu, top: true },
  { key: "arch.api", icon: Radio },
  { key: "arch.clients", icon: Layers },
  { key: "arch.db", icon: Database },
  { key: "arch.exchange", icon: Workflow },
];

const FEED_ROWS = [
  { symbol: "BTCUSDT", market: "crypto", side: "LONG", conf: "0.82", rr: "1:2.0", tf: "1H" },
  { symbol: "ETHUSDT", market: "crypto", side: "LONG", conf: "0.71", rr: "1:1.9", tf: "15M" },
  { symbol: "EURUSD", market: "forex", side: "SHORT", conf: "0.74", rr: "1:2.5", tf: "30M" },
  { symbol: "SOLUSDT", market: "crypto", side: "LONG", conf: "0.68", rr: "1:2.2", tf: "4H" },
  { symbol: "GBPJPY", market: "forex", side: "SHORT", conf: "0.66", rr: "1:2.0", tf: "1H" },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      return (window.localStorage.getItem("wolf.theme") as "dark" | "light") || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    window.localStorage.setItem("wolf.theme", theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      className="inline-flex size-8 items-center justify-center rounded-md border border-border/70 bg-background/40 text-muted-foreground transition-colors hover:border-emerald-400/40 hover:text-emerald-300"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export default function Landing() {
  const { t, lang } = useI18n();
  // Public support contacts stay available in self-hosted mode without Convex.
  const supportEmail = "motamedmohamad1@gmail.com";
  const supportTg = "@marijtradebot";

  const stats = [
    { value: "100+", label: t("stat.strategies") },
    { value: "40", label: t("stat.instruments") },
    { value: "6", label: t("stat.timeframes") },
    { value: "24/7", label: t("stat.uptime") },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-background text-foreground"
    >
      {/* ── nav ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt="Trading Wolf AI" className="size-8 rounded-md"  />
            <span className="text-[15px] font-semibold tracking-tight">
              Trading Wolf AI
            </span>
            <Badge
              variant="outline"
              className="ml-1 hidden rounded-sm border-emerald-400/20 bg-emerald-400/5 px-1.5 py-0 font-mono text-[10px] text-emerald-300 sm:inline-flex"
            >
              v1.3
            </Badge>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#engine" className="transition-colors hover:text-foreground">
              {t("nav.engine")}
            </a>
            <a href="#anatomy" className="transition-colors hover:text-foreground">
              {t("nav.anatomy")}
            </a>
            <a href="#signals" className="transition-colors hover:text-foreground">
              {t("nav.signals")}
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LangToggle />
            {/* nav.signin removed — covered by launch button */}
            <Button asChild size="sm">
              <Link to="/auth?returnTo=%2Fdashboard">
                {t("nav.launch")}
                <ArrowRight className={`size-3.5 ${lang === "fa" ? "mr-1.5" : "ml-1.5"}`} />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── ticker tape ─────────────────────────────────────────────────── */}
      <div dir="ltr" className="ticker-wrap overflow-hidden border-b border-border/50 bg-card/40 py-2">
        <div className="ticker-track flex w-max items-center gap-8 whitespace-nowrap text-[11px]">
          {Array.from({ length: 2 }).map((_, rep) => (
            <div key={rep} className="flex items-center gap-8">
              {[t("stat.strategies"), t("stat.instruments"), t("stat.timeframes"), t("stat.uptime"), t("hero.badge"), t("sec.engine.title"), lang === "fa" ? "۱۰۰+ استراتژی واقعی" : "100+ real strategies", lang === "fa" ? "فارکس، کریپتو و فلزات" : "Forex, Crypto & Metals", lang === "fa" ? "بازبینی هوش مصنوعی" : "AI Review", lang === "fa" ? "چارت کندل واقعی" : "Real candle charts", lang === "fa" ? "ربات تلگرام دوزبانه" : "Bilingual Telegram bot", lang === "fa" ? "تحلیل چند تایم‌فریمی" : "Multi-timeframe analysis"].map((item, i) => (
                <span key={i} className="flex items-center gap-2 text-muted-foreground">
                  <span className="size-1 rounded-full bg-emerald-400/70" />
                  {item}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── hero ────────────────────────────────────────────────────────── */}
      <section className="bg-spot relative overflow-hidden">
        {/* bg-market-grid removed per request */}
        <div className="pointer-events-none absolute -left-24 top-10 size-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 top-40 size-80 rounded-full bg-gold/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />

        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-24">
          <div>
            <Badge className="mb-6 gap-2 border-emerald-400/20 bg-emerald-400/10 py-1 font-mono text-[11px] text-emerald-300">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
              </span>
              {t("hero.badge")}
            </Badge>

            <h1 className="text-4xl font-bold leading-[1.14] tracking-tight sm:text-5xl lg:text-6xl">
              {t("hero.title1")}
              <span className="bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent text-glow-emerald">
                {t("hero.title2")}
              </span>
              {t("hero.title3")}
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              {t("hero.sub")}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">              {[lang === "fa" ? "سد چندلایه ریسک" : "Multi-layer risk protection",
                lang === "fa" ? "تحلیل خودکار ۲۴ ساعته" : "24/7 autonomous analysis",
                lang === "fa" ? "گزارش لحظه‌ای در تلگرام" : "Real-time Telegram alerts",
                lang === "fa" ? "بدون نیاز به دانش فنی" : "No technical skills needed",
              ].map((chip) => (
                <span key={chip} className="rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[11px] text-muted-foreground">
                  {chip}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth?returnTo=%2Fdashboard">
                  <Terminal className={`size-4 ${lang === "fa" ? "ml-2" : "mr-2"}`} />
                  {t("hero.cta1")}
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#anatomy">{t("hero.cta2")}</a>
              </Button>
            </div>

            <dl className="mt-12 grid max-w-lg grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label}>
                  <dt className="terminal-font text-2xl font-semibold text-foreground">
                    {s.value}
                  </dt>
                  <dd className="mt-1 text-xs text-muted-foreground">{s.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <HeroCandleChart />
        </div>
      </section>

      {/* ── capabilities ────────────────────────────────────────────────── */}
      <section id="engine" className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
        <div className="mb-12 max-w-2xl">
          <p className="terminal-font mb-3 text-[11px] uppercase tracking-[0.2em] text-emerald-400">
            {t("sec.engine.label")}
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("sec.engine.title")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("sec.engine.sub")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((cap) => (
            <div
              key={cap.key}
              className="group rounded-xl border border-border/70 bg-card/60 p-6 transition-colors hover:border-emerald-400/30 hover:bg-card"
            >
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-emerald-400/15 bg-emerald-400/10 text-emerald-300">
                <cap.icon className="size-5" />
              </div>
              <h3 className="font-semibold">{t(`${cap.key}.title`)}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t(`${cap.key}.body`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── anatomy ────────────────────────────────────────────────────── */}
      <section id="anatomy" className="relative overflow-hidden border-y border-border/60 bg-card/40 py-24">
        <div className="bg-market-grid-fine pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto w-full max-w-4xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <p className="terminal-font mb-3 text-[11px] uppercase tracking-[0.2em] text-emerald-400">
              {t("sec.anatomy.label")}
            </p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t("sec.anatomy.title")}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              {t("sec.anatomy.sub")}
            </p>
          </div>

          <div className="relative">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-emerald-400/40 via-border to-border" />
            <div className="flex flex-col gap-4">
              {ARCH_LAYERS.map((layer, i) => (
                <motion.div
                  key={layer.key}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: i * 0.06 }}
                  className={`mx-auto flex w-full max-w-md items-center gap-4 rounded-xl border bg-background/90 p-4 backdrop-blur-sm transition-colors hover:border-emerald-400/30 ${
                    layer.top ? "border-emerald-400/40" : "border-border/70"
                  }`}
                >
                  <div
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                      layer.top
                        ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : "border border-border/70 bg-secondary text-muted-foreground"
                    }`}
                  >
                    <layer.icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="terminal-font text-[10px] uppercase tracking-widest text-muted-foreground">
                      {layer.key.split(".")[1]}
                    </p>
                    <p className="truncate text-sm font-semibold">
                      {t(`${layer.key}.title`)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t(`${layer.key}.sub`)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── signal feed ─────────────────────────────────────────────────── */}
      <section id="signals" className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
        <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="terminal-font mb-3 text-[11px] uppercase tracking-[0.2em] text-emerald-400">
              {t("sec.signals.label")}
            </p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t("sec.signals.title")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("sec.signals.sub")}</p>
          </div>
          <Badge variant="outline" className="font-mono text-[11px] text-muted-foreground">
            {t("signals.badge")}
          </Badge>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {[
            ["1–100", lang === "fa" ? "امتیاز ورود" : "entry score"],
            ["RR 1:1.8+", lang === "fa" ? "حداقل نسبت ریسک" : "min risk-reward"],
            ["3+", lang === "fa" ? "تأیید مستقل استراتژی" : "independent confirmations"],
            ["5", lang === "fa" ? "سطح ریسک" : "risk levels"],
          ].map(([v, label]) => (
            <div key={label} className="flex items-baseline gap-1.5 rounded-lg border border-border/60 bg-card/50 px-3 py-2">
              <span className="terminal-font text-sm font-bold text-gold">{v}</span>
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-border/70">
          <div className="grid grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.7fr] gap-2 border-b border-border/70 bg-card/70 px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.7fr]">
            <span>{t("tbl.symbol")}</span>
            <span className="hidden sm:block">{t("tbl.market")}</span>
            <span>{t("tbl.direction")}</span>
            <span>{t("tbl.confidence")}</span>
            <span>{t("tbl.rr")}</span>
          </div>
          {FEED_ROWS.map((row, i) => (
            <div
              key={row.symbol}
              className={`grid grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.7fr] items-center gap-2 px-4 py-3.5 text-sm transition-colors hover:bg-card/60 sm:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.7fr] ${
                i !== FEED_ROWS.length - 1 ? "border-b border-border/50" : ""
              }`}
            >
              <span className="terminal-font font-semibold tracking-tight">
                {fmtSym(row.symbol)}
                <span className="ml-2 text-[10px] text-muted-foreground">{row.tf}</span>
              </span>
              <span className="hidden text-xs uppercase text-muted-foreground sm:block">
                {row.market}
              </span>
              <span
                className={`terminal-font text-xs font-semibold ${
                  row.side === "LONG" ? "text-emerald-400" : "text-[oklch(0.72_0.17_25)]"
                }`}
              >
                {row.side === "LONG" ? "▲ LONG" : "▼ SHORT"}
              </span>
              <span className="terminal-font text-xs text-muted-foreground">{row.conf}</span>
              <span className="terminal-font text-xs text-gold">{row.rr}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-border/60">
        <div className="bg-spot pointer-events-none absolute inset-0" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-24 text-center sm:px-6">
          <img src={logo} alt="" className="mb-8 size-16 opacity-90 rounded-md"  />
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            {t("cta.title")}
          </h2>
          <p className="mt-4 max-w-xl text-muted-foreground">{t("cta.sub")}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth?returnTo=%2Fdashboard">
                {t("cta.btn")}
                <ArrowRight className={`size-4 ${lang === "fa" ? "mr-2" : "ml-2"}`} />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">{t("nav.signin")}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── support ──────────────────────────────────────────────────── */}
      <section className="border-t border-border/60 bg-card/30">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-12 px-4 py-20 sm:flex-row sm:items-start sm:px-6">
          <div className="max-w-md">
            <p className="terminal-font mb-3 text-[11px] uppercase tracking-[0.2em] text-emerald-400">
              {t("hero.console") === "wolf-engine — live session" ? "SUPPORT" : "پشتیبانی"}
            </p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t("support.title")}
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {t("support.subtitle")}
            </p>
          </div>
          <div className="flex flex-1 flex-col gap-4 sm:max-w-sm">
            <a
              href={`https://t.me/${supportTg.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 rounded-xl border border-border/60 bg-card/60 p-5 transition-colors hover:border-emerald-400/30 hover:bg-card"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-emerald-400/15 bg-emerald-400/10 text-emerald-300">
                <Send className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{t("support.telegram")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("support.telegram.hint")}</p>
              </div>
            </a>
            <a
              href={`mailto:${supportEmail}`}
              className="group flex items-center gap-4 rounded-xl border border-border/60 bg-card/60 p-5 transition-colors hover:border-emerald-400/30 hover:bg-card"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-emerald-400/15 bg-emerald-400/10 text-emerald-300">
                <Mail className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{t("support.email")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("support.email.hint")}</p>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* ── footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="" className="size-7 rounded-md"  />
            <span className="text-sm font-semibold">Trading Wolf AI</span>
            <span className="terminal-font text-xs text-emerald-400">v1.3.0</span>
          </div>
          <p className="text-xs text-muted-foreground">{t("footer.risk")}</p>
        </div>
      </footer>
    </motion.div>
  );
}