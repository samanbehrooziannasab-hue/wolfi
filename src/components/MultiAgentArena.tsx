import React, { useState } from "react";
import { useQuery, useMutation } from "@/lib/safeHooks";
import { api } from "../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import {
  Brain,
  Shield,
  Zap,
  Globe,
  Flame,
  TrendingUp,
  TrendingDown,
  Target,
  Sparkles,
  RefreshCw,
  Award,
  ChevronRight,
  Gauge,
  Radio,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  playAgentDebateChime,
  playCasinoWin,
  playLaserClick,
  isSoundEnabled,
  setSoundEnabled,
} from "../lib/casinoSoundFx";

interface MultiAgentArenaProps {
  token: string;
  lang?: "fa" | "en";
}

const POPULAR_SYMBOLS = [
  { symbol: "BTC/USDT", name: "Bitcoin", icon: "₿", market: "crypto" },
  { symbol: "ETH/USDT", name: "Ethereum", icon: "Ξ", market: "crypto" },
  { symbol: "SOL/USDT", name: "Solana", icon: "◎", market: "crypto" },
  { symbol: "XAU/USD", name: "Gold (طلا)", icon: "🏆", market: "forex" },
  { symbol: "EUR/USD", name: "Euro", icon: "€", market: "forex" },
  { symbol: "DOGE/USDT", name: "Dogecoin", icon: "Ð", market: "crypto" },
];

export const MultiAgentArena: React.FC<MultiAgentArenaProps> = ({ token, lang = "fa" }) => {
  const [selectedSymbol, setSelectedSymbol] = useState("BTC/USDT");
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [debating, setDebating] = useState(false);

  const arenaData = useQuery((api as any).tradingArena.getArenaAnalysis, { symbol: selectedSymbol });
  const triggerDebate = useMutation((api as any).tradingArena.triggerMultiAgentDebate);

  const handleRunDebate = async () => {
    try {
      setDebating(true);
      playLaserClick();
      playAgentDebateChime();
      await triggerDebate({ token, symbol: selectedSymbol });
      setTimeout(() => {
        setDebating(false);
        playCasinoWin();
      }, 900);
    } catch (e) {
      setDebating(false);
    }
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playLaserClick();
  };

  const isLong = arenaData?.consensusDirection?.includes("buy") ?? true;

  return (
    <div className="space-y-6">
      {/* ─── Casino Header Banner with High-Voltage Glow ────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-card/90 via-background/95 to-card/90 p-5 shadow-[0_0_40px_rgba(16,185,129,0.18)] backdrop-blur-xl">
        <div className="absolute top-0 right-0 h-40 w-40 bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 h-40 w-40 bg-amber-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
                {lang === "fa" ? "میدان مناظره چند-ایجنت هوش مصنوعی" : "AI MULTI-AGENT TRADING ARENA"}
              </span>
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-black text-amber-300 border border-amber-500/30">
                {lang === "fa" ? "نسخه کوانت پرو" : "QUANT PRO v4.2"}
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
              <Brain className="h-6 w-6 text-emerald-400" />
              {lang === "fa" ? "هم‌اندیشی ۴ ایجنت هوشمند معامله‌گر" : "4-Agent Live Consensus & Strategy Debate"}
            </h2>
            <p className="text-xs text-muted-foreground max-w-2xl">
              {lang === "fa"
                ? "ترکیب استراتژی‌های TradingAgents، Vibe-Trading، Freqtrade و Order Flow Sniper برای ایجاد برترین سیگنال‌های سودآور با تایید هم‌زمان ۴ مدل تحلیلی."
                : "Continuous real-time debate between 4 specialized AI models to evaluate high-probability market entries and maximum profit multipliers."}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center">
            {/* Audio Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSound}
              className={`h-9 px-3 border transition-all ${
                soundOn
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-border/60 text-muted-foreground"
              }`}
              title={soundOn ? "Sound Effects ON" : "Sound Muted"}
            >
              {soundOn ? <Volume2 className="h-4 w-4 text-emerald-400" /> : <VolumeX className="h-4 w-4" />}
            </Button>

            {/* Trigger Consensus Button */}
            <Button
              onClick={handleRunDebate}
              disabled={debating}
              className="h-9 gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 font-black text-black hover:from-emerald-400 hover:to-teal-400 shadow-[0_0_20px_rgba(16,185,129,0.35)] transition-all hover:scale-105 active:scale-95"
            >
              <RefreshCw className={`h-4 w-4 ${debating ? "animate-spin" : ""}`} />
              {debating
                ? lang === "fa"
                  ? "در حال مناظره ایجنت‌ها..."
                  : "Agents Debating..."
                : lang === "fa"
                  ? "اجرای مناظره هوش مصنوعی"
                  : "Run Multi-Agent Debate"}
            </Button>
          </div>
        </div>

        {/* Symbol Quick Select Bar */}
        <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-border/40">
          {POPULAR_SYMBOLS.map((s) => {
            const active = selectedSymbol === s.symbol;
            return (
              <button
                key={s.symbol}
                onClick={() => {
                  playLaserClick();
                  setSelectedSymbol(s.symbol);
                }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
                  active
                    ? "bg-gradient-to-r from-emerald-500/25 to-teal-500/25 text-emerald-300 border border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.25)] scale-105"
                    : "bg-card/60 text-muted-foreground border border-border/50 hover:border-emerald-500/30 hover:text-foreground"
                }`}
              >
                <span>{s.icon}</span>
                <span className="font-mono">{s.symbol}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Consensus Score & Target Odds Card ─────────────────────────── */}
      {arenaData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Main Consensus Gauge */}
          <Card className="md:col-span-2 border-emerald-500/30 bg-gradient-to-br from-card/80 via-background to-card/80 shadow-[0_0_20px_rgba(16,185,129,0.12)]">
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    {lang === "fa" ? "رای نهایی و برآیند اجماع" : "CONSENSUS VERDICT"}
                  </span>
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex items-center gap-2 rounded-xl px-4 py-2 text-lg font-black tracking-wide border shadow-lg ${
                        isLong
                          ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                          : "border-red-500/50 bg-red-500/20 text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                      }`}
                    >
                      {isLong ? (
                        <TrendingUp className="h-6 w-6 text-emerald-400 animate-bounce" />
                      ) : (
                        <TrendingDown className="h-6 w-6 text-red-400 animate-bounce" />
                      )}
                      <span className="uppercase font-mono">
                        {arenaData.consensusDirection.replace("_", " ")}
                      </span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">
                        {lang === "fa" ? "احتمال برد (Win Rate)" : "Win Probability"}
                      </span>
                      <span className="text-2xl font-black font-mono text-amber-400">
                        {arenaData.winProbability}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Multiplier Potential Badge */}
                <div className="rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/20 to-emerald-500/20 p-3.5 text-center shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 block">
                    {lang === "fa" ? "ضریب سود هدف" : "TARGET MULTIPLIER"}
                  </span>
                  <span className="text-2xl font-black text-amber-400 font-mono" dir="ltr">
                    {arenaData.multiplierPotential}
                  </span>
                  <span className="text-[10px] text-muted-foreground block mt-0.5">
                    {lang === "fa" ? "ریسک به ریوارد 1:2.6" : "Risk/Reward 1:2.6"}
                  </span>
                </div>
              </div>

              {/* Synthesis Note */}
              <div className="mt-4 rounded-lg bg-card/60 p-3 border border-border/60 text-xs leading-relaxed text-muted-foreground">
                <span className="font-bold text-foreground block mb-1">
                  {lang === "fa" ? "📋 خلاصه تحلیلی هوش مصنوعی:" : "📋 AI Executive Summary:"}
                </span>
                {lang === "fa" ? arenaData.synthesisFa : arenaData.synthesisEn}
              </div>
            </CardContent>
          </Card>

          {/* Target Price Levels (TP1, TP2, TP3, SL) */}
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-bold text-muted-foreground flex items-center justify-between">
                <span>{lang === "fa" ? "اهداف معاملاتی و حد ضرر" : "TARGETS & STOP LOSS"}</span>
                <Target className="h-4 w-4 text-emerald-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-2.5">
              <div className="flex items-center justify-between text-xs rounded-md bg-emerald-500/10 p-2 border border-emerald-500/20">
                <span className="font-bold text-emerald-400">TP1 (کسب سود اولیه)</span>
                <span className="font-mono font-bold text-foreground" dir="ltr">${arenaData.targetTp1}</span>
              </div>
              <div className="flex items-center justify-between text-xs rounded-md bg-emerald-500/15 p-2 border border-emerald-500/30">
                <span className="font-bold text-emerald-300">TP2 (هدف میانی 2x)</span>
                <span className="font-mono font-bold text-foreground" dir="ltr">${arenaData.targetTp2}</span>
              </div>
              <div className="flex items-center justify-between text-xs rounded-md bg-amber-500/15 p-2 border border-amber-500/30">
                <span className="font-bold text-amber-300">TP3 (جک‌پات نهایی 🔥)</span>
                <span className="font-mono font-bold text-amber-400" dir="ltr">${arenaData.targetTp3}</span>
              </div>
              <div className="flex items-center justify-between text-xs rounded-md bg-red-500/15 p-2 border border-red-500/30">
                <span className="font-bold text-red-400">SL (حد ضرر محافظتی)</span>
                <span className="font-mono font-bold text-red-300" dir="ltr">${arenaData.stopLoss}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── 4-Agent Detailed Opinion Cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {arenaData?.agents?.map((agent: any) => {
          const isAgentLong = agent.direction === "long";
          return (
            <Card
              key={agent.agentId}
              className="relative overflow-hidden border-border/70 bg-card/60 transition-all duration-200 hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]"
            >
              <CardContent className="p-4 space-y-3">
                {/* Agent Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background border border-border/60 text-xl shadow-inner">
                      {agent.avatar}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-foreground">
                        {lang === "fa" ? agent.agentNameFa : agent.agentNameEn}
                      </h4>
                      <span className="rounded bg-background/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground border border-border/40">
                        {agent.badge}
                      </span>
                    </div>
                  </div>

                  {/* Direction Badge */}
                  <div
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-black uppercase ${
                      isAgentLong
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-red-500/20 text-red-300 border border-red-500/40"
                    }`}
                  >
                    {isAgentLong ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    <span>{agent.direction}</span>
                  </div>
                </div>

                {/* Agent Speech Bubble */}
                <div className="rounded-lg bg-background/50 p-2.5 border border-border/40 text-xs italic text-foreground/90">
                  "{agent.speechFa}"
                </div>

                {/* Key Reasons */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    {lang === "fa" ? "دلایل کلیدی ورود:" : "Key Entry Drivers:"}
                  </span>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {(agent.keyReasonsFa || []).map((reason: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-emerald-400 font-bold shrink-0">▸</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Confidence Bar */}
                <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-muted-foreground">
                    {lang === "fa" ? "ضریب اطمینان مدل:" : "Model Confidence:"}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-background rounded-full overflow-hidden border border-border/40">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 rounded-full"
                        style={{ width: `${agent.confidence}%` }}
                      />
                    </div>
                    <span className="font-mono font-bold text-amber-400">{agent.confidence}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
