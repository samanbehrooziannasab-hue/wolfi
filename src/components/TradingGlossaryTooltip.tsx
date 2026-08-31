import React from "react";
import { HelpCircle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

const GLOSSARY_TERMS: Record<string, { termFa: string; termEn: string; descFa: string; descEn: string }> = {
  pnl: {
    termFa: "PnL (سود و زیان)",
    termEn: "Profit and Loss",
    descFa: "میزان سود یا زیان به دست آمده از معامله بر حسب دلار یا درصد.",
    descEn: "Total realized or unrealized financial gain/loss.",
  },
  sl: {
    termFa: "SL (حد ضرر)",
    termEn: "Stop Loss",
    descFa: "قیمتی که در صورت ریزش یا حرکت خلاف جهت بازار، معامله خودکار بسته می‌شود تا از سرمایه محافظت شود.",
    descEn: "Predefined exit price to minimize potential trading losses.",
  },
  tp: {
    termFa: "TP (حد سود)",
    termEn: "Take Profit",
    descFa: "قیمت هدفی که پس از رسیدن به آن، سود معامله ذخیره و پوزیشن بسته می‌شود.",
    descEn: "Target price level where the position closes to lock in profits.",
  },
  leverage: {
    termFa: "اهرم (Leverage)",
    termEn: "Trading Leverage",
    descFa: "ضریبی که قدرت خرید شما را افزایش می‌دهد (مثلاً ۱۰x یعنی با ۱۰۰ دلار، معامله‌ای به ارزش ۱۰۰۰ دلار باز می‌کنید).",
    descEn: "Multiplier that increases trading capital exposure.",
  },
  rr: {
    termFa: "نسبت R:R (ریسک به ریوارد)",
    termEn: "Risk-Reward Ratio",
    descFa: "نسبت سود احتمالی به ضرر احتمالی. مثلاً ۱:۳ یعنی به ازای هر ۱ دلار ریسک، انتظار ۳ دلار سود داریم.",
    descEn: "Ratio of potential profit target compared to downside risk.",
  },
  drawdown: {
    termFa: "دراودان (افت سرمایه)",
    termEn: "Max Drawdown",
    descFa: "بیشترین درصد افت ارزش حساب از سقف قبلی در طول یک دوره زمانی.",
    descEn: "Maximum peak-to-trough decline in account balance.",
  },
  liquidity: {
    termFa: "نقدینگی (Liquidity)",
    termEn: "Market Liquidity",
    descFa: "سهولت در خرید و فروش سریع یک ارز با کمترین اختلاف قیمت.",
    descEn: "Availability of active orders to fill trades smoothly.",
  },
};

interface TradingGlossaryTooltipProps {
  term: keyof typeof GLOSSARY_TERMS;
  children: React.ReactNode;
  lang?: "fa" | "en";
}

export function TradingGlossaryTooltip({ term, children, lang = "fa" }: TradingGlossaryTooltipProps) {
  const item = GLOSSARY_TERMS[term];
  if (!item) return <>{children}</>;

  const isFa = lang === "fa";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help border-b border-dotted border-muted-foreground/60">
            {children}
            <HelpCircle className="size-3 text-muted-foreground/70" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs p-3 text-xs bg-popover/95 backdrop-blur-md border-border shadow-xl">
          <p className="font-bold text-primary mb-1">{isFa ? item.termFa : item.termEn}</p>
          <p className="text-muted-foreground text-[11px] leading-relaxed">{isFa ? item.descFa : item.descEn}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
