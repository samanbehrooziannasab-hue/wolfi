import React, { useState } from "react";
import { Newspaper, TrendingUp, TrendingDown, Minus, Flame, ExternalLink, Calendar, Sparkles } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { CryptoIcon } from "./CryptoIcon";

interface NewsItem {
  id: string;
  titleFa: string;
  titleEn: string;
  summaryFa: string;
  summaryEn: string;
  sentiment: "bullish" | "bearish" | "neutral";
  impact: "high" | "medium" | "low";
  category: string;
  symbol?: string;
  source: string;
  imageUrl?: string;
  created: number;
}

interface FundamentalNewsSectionProps {
  news?: NewsItem[];
  lang?: "fa" | "en";
}

export function FundamentalNewsSection({ news = [], lang = "fa" }: FundamentalNewsSectionProps) {
  const [filter, setFilter] = useState<string>("all");
  const isFa = lang === "fa";

  const safeNews: any[] = Array.isArray(news) ? news : Array.isArray((news as any)?.news) ? (news as any).news : [];

  const filteredNews = safeNews.filter((n: any) => {
    if (filter === "all") return true;
    return n.category === filter;
  });

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm overflow-hidden">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <Newspaper className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                {isFa ? "اخبار و تحلیل فاندامنتال بازار" : "Fundamental Market Intelligence"}
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-400">
                  {isFa ? "تحلیل زنده هوش مصنوعی" : "Live AI Analysis"}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                {isFa ? "رویدادهای کلان اقتصادی، شاخص‌های فاندامنتال و سنتیمنت بازارها" : "Macro events, economic drivers & institutional sentiment"}
              </CardDescription>
            </div>
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {[
              { id: "all", labelFa: "همه رویدادها", labelEn: "All" },
              { id: "crypto", labelFa: "کریپتو", labelEn: "Crypto" },
              { id: "forex", labelFa: "فارکس", labelEn: "Forex" },
              { id: "macro", labelFa: "اقتصاد کلان / فدرال رزرو", labelEn: "Macro/Fed" },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setFilter(cat.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all whitespace-nowrap ${
                  filter === cat.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {isFa ? cat.labelFa : cat.labelEn}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {filteredNews.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            <Newspaper className="size-8 mx-auto mb-2 opacity-40" />
            {isFa ? "خبری در این دسته‌بندی یافت نشد." : "No news items found in this category."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredNews.map((item: any) => {
              const isBullish = item.sentiment === "bullish";
              const isBearish = item.sentiment === "bearish";

              return (
                <div
                  key={item.id}
                  className="flex flex-col justify-between rounded-xl border border-border/60 bg-background/50 hover:bg-background/80 transition-all p-3.5 space-y-2.5 group"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {item.symbol && <CryptoIcon symbol={item.symbol} size="xs" />}
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold uppercase gap-1 ${
                            isBullish
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : isBearish
                              ? "border-red-500/30 bg-red-500/10 text-red-400"
                              : "border-slate-500/30 bg-slate-500/10 text-slate-300"
                          }`}
                        >
                          {isBullish ? <TrendingUp className="size-3" /> : isBearish ? <TrendingDown className="size-3" /> : <Minus className="size-3" />}
                          {isBullish ? (isFa ? "صعودی / Bullish" : "Bullish") : isBearish ? (isFa ? "نزولی / Bearish" : "Bearish") : (isFa ? "خنثی / Neutral" : "Neutral")}
                        </Badge>

                        {item.impact === "high" && (
                          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400 text-[9px] gap-0.5">
                            <Flame className="size-2.5 text-amber-500" />
                            {isFa ? "اثر بالا" : "High Impact"}
                          </Badge>
                        )}
                      </div>

                      <span className="text-[10px] text-muted-foreground font-mono">
                        {new Date(item.created).toLocaleDateString(isFa ? "fa-IR" : "en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold leading-snug group-hover:text-primary transition-colors">
                      {isFa ? item.titleFa : item.titleEn}
                    </h4>

                    <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                      {isFa ? item.summaryFa : item.summaryEn}
                    </p>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
                    <span className="truncate max-w-[180px]">منبع: {item.source}</span>
                    <span className="font-mono text-primary/80 flex items-center gap-1 group-hover:underline">
                      <Sparkles className="size-3" />
                      {isFa ? "تحلیل ولف" : "Wolf Insight"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
