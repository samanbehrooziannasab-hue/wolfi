import { api } from "@/convex/_generated/api";
import { classifyRiskPreset } from "@/convex/aiPolicy";
import { useWolfAuth } from "@/hooks/use-wolf-auth";
import { useI18n } from "@/lib/i18n";
import { createPortal } from "react-dom";
import { Brain, Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, CardContent, Input, Slider, Switch } from "@/components/ui";
import { toast } from "sonner";

import { BACKEND } from "@/lib/backend";
import { useRestQuery as useSeamQuery, useRestMutation as useSeamMutation } from "@/lib/restApi";
import { useMutation as useConvexMutationRaw, useQuery as useConvexQueryRaw } from "convex/react";

// Same backend seam as Dashboard.tsx — identical panel behavior in both modes.
function useQuery(reference: any, args: any): any {
  return BACKEND === "rest" ? useSeamQuery(reference, args) : useConvexQueryRaw(reference, args);
}
function useMutation(reference: any): any {
  return BACKEND === "rest" ? useSeamMutation(reference) : useConvexMutationRaw(reference);
}

export function RiskAiReviewPanel() {
  const { lang } = useI18n();
  const { token } = useWolfAuth();
  const request = useMutation(api.riskAdvisor.request);
  const saveSettings = useMutation(api.admin.saveSettings);
  const applyPreset = useMutation(api.admin.applyRiskPreset);
  const settings = useQuery(api.settings.allSettings, {});
  const [key, setKey] = useState<string | null>(null);
  const [risk, setRisk] = useState<Record<string, number>>({});
  const [score, setScore] = useState(35);
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null);
  const review = useQuery(api.riskAdvisor.review, key && token ? { token, key } : "skip");
  const fa = lang === "fa";
  const controls = [
    ["risk.minConsensus", fa ? "حداقل اجماع" : "Min consensus", 0.5, 1, 0.05],
    ["risk.minConfirmations", fa ? "حداقل تأیید مستقل" : "Min confirmations", 1, 8, 1],
    ["risk.stopOffsetATR", fa ? "فاصله حد ضرر (ATR)" : "Stop distance (ATR)", 0.8, 4, 0.1],
    ["risk.tp1ATR", fa ? "هدف اول (ATR)" : "Target 1 (ATR)", 1, 6, 0.1],
    ["risk.tp2ATR", fa ? "هدف دوم (ATR)" : "Target 2 (ATR)", 1.5, 8, 0.1],
    ["risk.tp3ATR", fa ? "هدف سوم (ATR)" : "Target 3 (ATR)", 2, 12, 0.1],
    ["risk.maxDrawdown", fa ? "حداکثر افت سرمایه (٪)" : "Max drawdown (%)", 1, 50, 1],
  ] as const;

  useEffect(() => {
    if (!settings) return;
    const next: Record<string, number> = {};
    for (const [keyName] of controls) next[keyName] = Number(settings[keyName] ?? 0);
    setRisk(next);
    setScore(Math.max(1, Math.min(100, Number(settings["risk.minScore"] ?? 35))));
  }, [settings]);

  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-slot='card']"));
    const advisorCard = cards.find((card) => card.textContent?.includes(fa ? "مشاور ریسک هوشمند" : "AI risk advisor"));
    const legacyPresetCard = cards.find((card) => card.textContent?.includes(fa ? "پیش‌تنظیم ریسک" : "Risk preset"));
    if (legacyPresetCard) legacyPresetCard.style.display = "none";
    if (!advisorCard?.parentElement) return;
    const host = document.createElement("div");
    host.className = "risk-ai-review-slot";
    advisorCard.parentElement.insertBefore(host, advisorCard.nextSibling);
    setPortalHost(host);
    return () => {
      setPortalHost(null);
      host.remove();
      if (legacyPresetCard) legacyPresetCard.style.removeProperty("display");
    };
  }, [fa]);

  const saveRisk = async () => {
    if (!token) return;
    try {
      await saveSettings({ token, settings: { ...risk, "risk.minScore": score, "risk.requireFreshData": true } });
      toast.success(fa ? "تنظیمات ریسک ذخیره شد" : "Risk settings saved");
    } catch (error: any) {
      toast.error(String(error?.message ?? error));
    }
  };

  const run = async () => {
    if (!token) return;
    try {
      const result = await request({ token });
      setKey(result.key);
    } catch (error: any) {
      toast.error(String(error?.message ?? error));
    }
  };

  const presets = [
    ["very_low", fa ? "کمترین ریسک" : "Very low", fa ? "۰٫۵٪ ریسک" : "0.5% risk"],
    ["low", fa ? "ریسک کم" : "Low", fa ? "۰٫۷۵٪ ریسک" : "0.75% risk"],
    ["balanced", fa ? "ریسک متوازن" : "Balanced", fa ? "۱٫۵٪ ریسک" : "1.5% risk"],
    ["high", fa ? "ریسک زیاد" : "High", fa ? "۲٪ ریسک" : "2% risk"],
    ["very_high", fa ? "بیشترین ریسک" : "Very high", fa ? "۲٫۵٪ ریسک" : "2.5% risk"],
  ] as const;

  // Which risk level is currently active — highlighted from the live settings
  // (risk.riskPerTrade), so the admin always sees the selected level.
  const activePreset = settings ? classifyRiskPreset(Number(settings["risk.riskPerTrade"] ?? 1.5)) : null;

  const panel = (
    <Card className="border-cyan-400/25 bg-cyan-400/5">
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-bold text-cyan-300"><Brain className="size-3.5" /> {fa ? "بازبینی هوشمند ریسک" : "AI risk review"}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{fa ? "فقط تحلیل توضیحی است؛ هیچ تنظیم یا معامله‌ای را خودکار تغییر نمی‌دهد." : "Read-only explanation; it never changes settings or trades."}</p>
          </div>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 border-cyan-400/30 text-cyan-300" onClick={run} disabled={!token || review?.status === "running"}>
            {review?.status === "running" ? <Loader2 className="size-3 animate-spin" /> : <Brain className="size-3" />}
            {fa ? "بررسی با AI" : "Review with AI"}
          </Button>
        </div>

        <div className="border-t border-cyan-400/15 pt-2">
          <p className="mb-2 text-[10px] font-bold text-muted-foreground">{fa ? "پنج سطح ریسک — از کمترین تا بیشترین" : "Five risk levels — lowest to highest"}</p>
          <div className="grid gap-1.5 sm:grid-cols-5">
            {presets.map(([preset, label, hint]) => {
              const active = activePreset === preset;
              return (
                <Button key={preset} size="sm" variant="outline" className={`relative h-auto min-h-12 flex-col items-stretch gap-0 px-2 py-1.5 text-start ${active ? "border-cyan-400/70 bg-cyan-400/10 ring-1 ring-cyan-400/40" : ""}`} onClick={() => token && applyPreset({ token, preset }).then(() => toast.success(fa ? "سطح ریسک اعمال شد" : "Risk level applied")).catch((error: any) => toast.error(String(error?.message ?? error)))}>
                  {active ? <Check className="absolute end-1 top-1 size-3 text-cyan-300" /> : null}
                  <span className={`text-[10px] font-bold ${active ? "text-cyan-300" : ""}`}>{label}</span>
                  <span className="text-[9px] text-muted-foreground" dir="ltr">{hint}</span>
                  {active ? <span className="mt-0.5 rounded bg-cyan-400/20 px-1 py-px text-center text-[8px] font-bold text-cyan-300">{fa ? "انتخاب‌شده ✓" : "ACTIVE ✓"}</span> : null}
                </Button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] leading-5 text-muted-foreground">{fa ? "حتی در سطح پرریسک، حد ضرر، داده تازه، اجماع، تأیید مستقل و سقف افت سرمایه همچنان اجباری‌اند." : "Even at the highest level, stop-loss, fresh data, consensus, independent confirmations and drawdown caps remain mandatory."}</p>
        </div>

        <div className="border-t border-cyan-400/15 pt-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold text-muted-foreground">{fa ? "امتیاز و گیت‌های ورود" : "Score and entry gates"}</p>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">{fa ? "حداقل امتیاز" : "Min score"}</span>
              <Input className="h-6 w-16 px-1.5 text-center text-[11px]" type="number" min={1} max={100} step={1} value={score} onChange={(event) => setScore(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} />
              <span className="text-[10px] text-muted-foreground">/100</span>
            </div>
          </div>
          <p className="mb-2 text-[10px] leading-4 text-muted-foreground">{fa ? "این عدد فقط فیلتر اولیهٔ امتیاز است؛ برای ذخیره، دکمهٔ ذخیره گیت‌ها را بزنید. اجماع، تأیید مستقل، اطمینان و نسبت سود به ریسک جداگانه بررسی می‌شوند." : "This is only the first score filter. Save it with the gate button; consensus, independent confirmations, confidence and risk/reward remain separate gates."}</p>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={saveRisk} disabled={!settings}>{fa ? "ذخیره گیت‌ها" : "Save gates"}</Button>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {controls.map(([keyName, label, min, max, step]) => {
              const value = Math.min(max, Math.max(min, risk[keyName] ?? min));
              return <div key={keyName} className="rounded border border-border/40 bg-background/30 p-2">
                <div className="flex items-center justify-between gap-1 text-[10px]"><span className="truncate text-muted-foreground">{label}</span><span className="terminal-font" dir="ltr">{value}</span></div>
                <Slider className="mt-1" min={min} max={max} step={step} value={[value]} onValueChange={(v) => setRisk((old) => ({ ...old, [keyName]: v[0] }))} />
              </div>;
            })}
          </div>
          <div className="mt-2 flex items-center justify-between rounded border border-border/40 bg-background/30 px-2 py-1.5 text-[10px]">
            <span className="text-muted-foreground">{fa ? "داده کندل باید تازه باشد" : "Require fresh candle data"}</span>
            <Switch checked={true} disabled />
          </div>
        </div>

        <div className="rounded border border-border/40 bg-background/40 p-2 text-[10px] leading-5 text-muted-foreground">
          <p className="font-bold text-foreground">{fa ? "راهنمای صفحه ریسک" : "Risk page guide"}</p>
          <p>{fa ? "ریسک هر معامله درصدی از سرمایه مجازی است؛ حداکثر در معرض بودن سقف مجموع پوزیشن‌هاست و حداقل امتیاز فقط یک فیلتر اولیه از ۱ تا ۱۰۰ است. هیچ‌کدام به‌تنهایی معامله را تأیید نمی‌کنند." : "Risk per trade is a percentage of virtual capital; max exposure caps total positions; minimum score is only a 1–100 first filter. None of them approves a trade by itself."}</p>
        </div>
        {review?.status === "done" && review.text ? <p className="whitespace-pre-wrap text-[11px] leading-5 text-muted-foreground">{review.text}</p> : null}
        {review?.status === "error" ? <p className="text-[11px] text-red-300">{review.error || (fa ? "پاسخ AI ناموفق بود." : "AI review failed.")}</p> : null}
      </CardContent>
    </Card>
  );

  return portalHost ? createPortal(panel, portalHost) : null;
}
