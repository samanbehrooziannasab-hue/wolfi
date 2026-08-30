import React from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Flame, Trophy, Zap, TrendingUp, Sparkles } from "lucide-react";
import { playCasinoWin, playLaserClick } from "../lib/casinoSoundFx";

interface LiveWinningTickerProps {
  lang?: "fa" | "en";
}

export const LiveWinningTicker: React.FC<LiveWinningTickerProps> = ({ lang = "fa" }) => {
  const feed = useQuery((api as any).tradingArena.getLiveWinningFeed);

  if (!feed || feed.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-background/80 to-amber-950/40 p-2.5 backdrop-blur-md shadow-[0_0_25px_rgba(16,185,129,0.15)]">
      <div className="flex items-center gap-3">
        {/* Pulsing Jackpot Header Tag */}
        <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500/20 to-emerald-500/20 px-3 py-1.5 border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
          <Trophy className="h-4 w-4 text-amber-400 animate-bounce" />
          <span className="text-xs font-black uppercase tracking-wider text-amber-300">
            {lang === "fa" ? "سودهای زنده موتور" : "LIVE WINNINGS"}
          </span>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </div>

        {/* Marquee Ticker Items */}
        <div className="flex flex-1 overflow-x-auto no-scrollbar gap-3 py-0.5 items-center">
          {feed.map((w: any, idx: number) => {
            const isJackpot = w.profitUsd >= 400;
            return (
              <button
                key={w.id || idx}
                onClick={() => {
                  playLaserClick();
                  if (isJackpot) playCasinoWin();
                }}
                className={`group flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1 text-xs transition-all duration-200 hover:scale-105 active:scale-95 ${
                  isJackpot
                    ? "border-amber-500/50 bg-amber-500/15 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.1)]"
                }`}
              >
                <div className="flex items-center gap-1 font-bold">
                  {isJackpot ? (
                    <Flame className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                  ) : (
                    <Zap className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  <span className="font-mono text-[11px] font-black text-foreground">{w.symbol}</span>
                  <span
                    className={`rounded px-1 text-[9px] font-black uppercase ${
                      w.side === "long" ? "bg-emerald-500/30 text-emerald-300" : "bg-red-500/30 text-red-300"
                    }`}
                  >
                    {w.side}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span className="font-black text-emerald-400" dir="ltr">
                    +${Number(w.profitUsd).toFixed(1)}
                  </span>
                  <span className="rounded bg-background/60 px-1 py-0.5 text-[10px] font-black text-amber-300 border border-amber-500/20" dir="ltr">
                    {w.multiplier}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
