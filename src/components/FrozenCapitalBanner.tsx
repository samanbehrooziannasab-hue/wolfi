import React, { useState } from "react";
import { Lock, TrendingUp, TrendingDown, Unlock, ArrowUpRight, ShieldCheck, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";

interface FrozenCapitalBannerProps {
  frozen: number;
  floatingPnl: number;
  realizedPnl: number;
  shareRatio: number;
  onUnfreeze: (amount: number) => Promise<void>;
  onCommit: (amount: number) => Promise<void>;
  availableBalance: number;
  lang?: "fa" | "en";
}

export function FrozenCapitalBanner({
  frozen,
  floatingPnl,
  realizedPnl,
  shareRatio,
  onUnfreeze,
  onCommit,
  availableBalance,
  lang = "fa",
}: FrozenCapitalBannerProps) {
  const [openModal, setOpenModal] = useState<"unfreeze" | "commit" | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [loading, setLoading] = useState(false);

  const isFa = lang === "fa";
  const totalPnl = floatingPnl + realizedPnl;
  const isProfit = totalPnl >= 0;

  const handleSubmit = async () => {
    const val = parseFloat(amountInput);
    if (!val || val <= 0) {
      toast.error(isFa ? "مبلغ معتبر وارد کنید" : "Enter a valid amount");
      return;
    }
    setLoading(true);
    try {
      if (openModal === "unfreeze") {
        await onUnfreeze(val);
      } else {
        await onCommit(val);
      }
      setOpenModal(null);
      setAmountInput("");
    } catch (e: any) {
      // toast error handled by caller
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Top Banner Card */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-emerald-950/40 via-background/95 to-slate-900/40 p-4 shadow-xl backdrop-blur-md transition-all sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: Engine Capital Info */}
          <div className="flex items-center gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-inner">
              <Lock className="size-5 animate-pulse-soft" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {isFa ? "سرمایه فریز / درگیر در موتور معاملاتی" : "Capital Engaged in Trading Engine"}
                </span>
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-400 font-mono">
                  {frozen > 0 ? (isFa ? "معاملات خودکار فعال" : "Live Auto-Trading") : (isFa ? "سرمایه‌ای درگیر نیست" : "No Capital Engaged")}
                </Badge>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black tracking-tight text-foreground font-mono">
                  ${frozen.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-muted-foreground font-mono">USDT</span>
                {frozen > 0 && (
                  <span className="text-xs text-emerald-400/90 font-medium">
                    ({isFa ? `سهم شما از سبد: ${shareRatio}%` : `Portfolio Share: ${shareRatio}%`})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Center: Live Engine P&L Stats */}
          {frozen > 0 && (
            <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-background/50 px-4 py-2">
              <div>
                <p className="text-[10px] text-muted-foreground">{isFa ? "سود/زیان باز (شناور)" : "Floating PnL"}</p>
                <p className={`font-mono text-sm font-bold flex items-center gap-1 ${floatingPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {floatingPnl >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                  {floatingPnl >= 0 ? "+" : ""}${floatingPnl.toFixed(2)}
                </p>
              </div>
              <div className="h-6 w-px bg-border/60" />
              <div>
                <p className="text-[10px] text-muted-foreground">{isFa ? "سود محقق‌شده" : "Realized PnL"}</p>
                <p className={`font-mono text-sm font-bold ${realizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {realizedPnl >= 0 ? "+" : ""}${realizedPnl.toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {/* Right: Actions */}
          <div className="flex items-center gap-2 ms-auto">
            {frozen > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAmountInput(String(frozen));
                  setOpenModal("unfreeze");
                }}
                className="h-9 gap-1.5 border-border/80 text-xs font-semibold hover:border-amber-500/40 hover:text-amber-400"
              >
                <Unlock className="size-3.5 text-amber-400" />
                {isFa ? "درخواست آزادسازی" : "Request Unfreeze"}
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setAmountInput(availableBalance > 0 ? String(availableBalance) : "");
                setOpenModal("commit");
              }}
              className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-900/30"
            >
              <ArrowUpRight className="size-3.5" />
              {isFa ? "افزایش سرمایه درگیر" : "Add Funds to Engine"}
            </Button>
          </div>
        </div>
      </div>

      {/* Action Dialog */}
      <Dialog open={openModal !== null} onOpenChange={(o) => !o && setOpenModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {openModal === "unfreeze" ? <Unlock className="size-5 text-amber-400" /> : <Sparkles className="size-5 text-emerald-400" />}
              {openModal === "unfreeze"
                ? isFa ? "درخواست آزادسازی سرمایه از موتور" : "Request Unfreeze from Engine"
                : isFa ? "انتقال موجودی به موتور برای معامله خودکار" : "Commit Funds to Trading Engine"}
            </DialogTitle>
            <DialogDescription>
              {openModal === "unfreeze"
                ? isFa
                  ? "سرمایه درخواستی پس از تایید مدیر، از موتور آزاد شده و به موجودی قابل برداشت واریز می‌گردد."
                  : "Requested capital will be released from the engine and moved to your available balance upon approval."
                : isFa
                  ? "موجودی تتر شما به سبد سرمایه‌گذاری الگوریتمی متصل شده و در سود و زیان معاملات شریک می‌شود."
                  : "Your USDT balance will be connected to the algorithmic trading engine to generate shared profits."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{isFa ? "مبلغ مورد نظر (USDT)" : "Amount (USDT)"}</span>
                <span>
                  {openModal === "unfreeze"
                    ? isFa ? `حداکثر قابل آزادسازی: $${frozen}` : `Max: $${frozen}`
                    : isFa ? `موجودی آزاد: $${availableBalance}` : `Available: $${availableBalance}`}
                </span>
              </div>
              <Input
                type="number"
                dir="ltr"
                value={amountInput}
                placeholder="100"
                onChange={(e) => setAmountInput(e.target.value)}
                className="font-mono text-base font-bold"
              />
            </div>

            {openModal === "unfreeze" && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400/90">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <p>
                  {isFa
                    ? "طبق قوانین مدیریت ریسک، سرمایه درگیر برای اطمینان از بازدهی مناسب حداقل ۷ روز در گردش موتور قرار می‌گیرد."
                    : "Per risk management rules, engaged capital circulates in the engine for a minimum of 7 days."}
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpenModal(null)}>
              {isFa ? "انصراف" : "Cancel"}
            </Button>
            <Button
              disabled={loading || !amountInput}
              onClick={handleSubmit}
              className={openModal === "unfreeze" ? "bg-amber-600 hover:bg-amber-500 text-white" : "bg-emerald-600 hover:bg-emerald-500 text-white"}
            >
              {loading ? "..." : openModal === "unfreeze" ? (isFa ? "ثبت درخواست آزادسازی" : "Submit Unfreeze") : (isFa ? "تایید و اتصال به موتور" : "Commit to Engine")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
