import React from "react";

interface CryptoIconProps {
  symbol: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}

const SYMBOL_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  BTC: { bg: "bg-amber-500/20 text-amber-500 border-amber-500/30", text: "text-amber-500", label: "₿" },
  ETH: { bg: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30", text: "text-indigo-400", label: "Ξ" },
  SOL: { bg: "bg-purple-500/20 text-purple-400 border-purple-500/30", text: "text-purple-400", label: "◎" },
  BNB: { bg: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", text: "text-yellow-400", label: "◆" },
  XRP: { bg: "bg-blue-500/20 text-blue-400 border-blue-500/30", text: "text-blue-400", label: "✕" },
  DOGE: { bg: "bg-amber-400/20 text-amber-400 border-amber-400/30", text: "text-amber-400", label: "Ð" },
  ADA: { bg: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", text: "text-cyan-400", label: "₳" },
  SHIB: { bg: "bg-red-500/20 text-red-400 border-red-500/30", text: "text-red-400", label: "🐕" },
  PEPE: { bg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", text: "text-emerald-400", label: "🐸" },
  AVAX: { bg: "bg-red-600/20 text-red-500 border-red-600/30", text: "text-red-500", label: "▲" },
  LINK: { bg: "bg-blue-600/20 text-blue-400 border-blue-600/30", text: "text-blue-400", label: "⬡" },
  TON: { bg: "bg-sky-500/20 text-sky-400 border-sky-500/30", text: "text-sky-400", label: "💎" },
  DOT: { bg: "bg-pink-500/20 text-pink-400 border-pink-500/30", text: "text-pink-400", label: "●" },
  TRX: { bg: "bg-red-500/20 text-red-400 border-red-500/30", text: "text-red-400", label: "TRX" },
  LTC: { bg: "bg-slate-400/20 text-slate-300 border-slate-400/30", text: "text-slate-300", label: "Ł" },
  NEAR: { bg: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30", text: "text-emerald-400", label: "N" },
  SUI: { bg: "bg-cyan-600/20 text-cyan-300 border-cyan-600/30", text: "text-cyan-300", label: "💧" },
  ARB: { bg: "bg-blue-500/20 text-blue-300 border-blue-500/30", text: "text-blue-300", label: "ARB" },
  OP: { bg: "bg-red-500/20 text-red-400 border-red-500/30", text: "text-red-400", label: "OP" },
  WIF: { bg: "bg-amber-600/20 text-amber-300 border-amber-600/30", text: "text-amber-300", label: "👒" },
  BONK: { bg: "bg-orange-500/20 text-orange-400 border-orange-500/30", text: "text-orange-400", label: "🦴" },
  FLOKI: { bg: "bg-yellow-600/20 text-yellow-300 border-yellow-600/30", text: "text-yellow-300", label: "⚡" },
  // Forex & Metals
  XAU: { bg: "bg-amber-500/25 text-amber-300 border-amber-400/40 shadow-sm shadow-amber-500/20", text: "text-amber-400", label: "🥇" },
  XAG: { bg: "bg-slate-400/25 text-slate-200 border-slate-300/40", text: "text-slate-300", label: "🥈" },
  EUR: { bg: "bg-blue-600/20 text-blue-400 border-blue-500/30", text: "text-blue-400", label: "€" },
  GBP: { bg: "bg-purple-600/20 text-purple-400 border-purple-500/30", text: "text-purple-400", label: "£" },
  USD: { bg: "bg-emerald-600/20 text-emerald-400 border-emerald-500/30", text: "text-emerald-400", label: "$" },
  JPY: { bg: "bg-red-600/20 text-red-400 border-red-500/30", text: "text-red-400", label: "¥" },
  CHF: { bg: "bg-red-500/20 text-red-300 border-red-500/30", text: "text-red-300", label: "₣" },
  AUD: { bg: "bg-teal-600/20 text-teal-400 border-teal-500/30", text: "text-teal-400", label: "A$" },
  CAD: { bg: "bg-red-600/20 text-red-400 border-red-500/30", text: "text-red-400", label: "C$" },
  NZD: { bg: "bg-sky-600/20 text-sky-400 border-sky-500/30", text: "text-sky-400", label: "NZ$" },
  TRY: { bg: "bg-red-600/20 text-red-400 border-red-500/30", text: "text-red-400", label: "₺" },
  USDT: { bg: "bg-emerald-600/20 text-emerald-400 border-emerald-500/30", text: "text-emerald-400", label: "₮" },
};

export function CryptoIcon({ symbol, className = "", size = "sm" }: CryptoIconProps) {
  // Extract base currency (e.g., BTC from BTCUSDT or EUR from EURUSD)
  let cleanSym = (symbol ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (cleanSym.endsWith("USDT")) cleanSym = cleanSym.slice(0, -4);
  else if (cleanSym.length === 6) cleanSym = cleanSym.slice(0, 3);

  const matched = SYMBOL_COLORS[cleanSym] || {
    bg: "bg-muted text-muted-foreground border-border",
    text: "text-muted-foreground",
    label: cleanSym.slice(0, 3) || "•",
  };

  const sizeClasses = {
    xs: "size-5 text-[10px]",
    sm: "size-7 text-xs font-bold",
    md: "size-9 text-sm font-bold",
    lg: "size-11 text-base font-bold",
  }[size];

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center rounded-lg border font-mono select-none ${sizeClasses} ${matched.bg} ${className}`}
      title={symbol}
    >
      {matched.label}
    </div>
  );
}
