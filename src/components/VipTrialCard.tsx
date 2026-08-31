import React, { useState, useEffect } from "react";
import { Crown, Sparkles, Gift, Tag, Clock, CheckCircle2, ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { toast } from "sonner";

interface VipTrialCardProps {
  isVip: boolean;
  vipExpiresAt?: number;
  onClaimTrial: () => Promise<void>;
  onApplyDiscount: (code: string) => Promise<{ ok: boolean; message: string }>;
  lang?: "fa" | "en";
}

export function VipTrialCard({
  isVip,
  vipExpiresAt,
  onClaimTrial,
  onApplyDiscount,
  lang = "fa",
}: VipTrialCardProps) {
  const [discountCode, setDiscountCode] = useState("");
  const [loadingTrial, setLoadingTrial] = useState(false);
  const [loadingDiscount, setLoadingDiscount] = useState(false);
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  const isFa = lang === "fa";

  // Calculate live countdown
  useEffect(() => {
    if (!vipExpiresAt || vipExpiresAt <= Date.now()) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const diff = Math.max(0, vipExpiresAt - Date.now());
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft({ days, hours, minutes, seconds });
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [vipExpiresAt]);

  const handleClaim = async () => {
    setLoadingTrial(true);
    try {
      await onClaimTrial();
      toast.success(isFa ? "دوره آزمایشی ۲۱ روزه VIP با موفقیت برای شما فعال شد! ۵۰ ولف‌کوین هدیه دریافت کردید." : "21-day VIP Trial activated with 50 bonus WolfCoins!");
    } catch (err: any) {
      toast.error(err?.message || (isFa ? "خطا در فعال‌سازی دوره آزمایشی" : "Failed to activate trial"));
    } finally {
      setLoadingTrial(false);
    }
  };

  const handleApplyDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discountCode.trim()) {
      toast.error(isFa ? "لطفاً کد تخفیف را وارد کنید" : "Enter discount code");
      return;
    }
    setLoadingDiscount(true);
    try {
      const res = await onApplyDiscount(discountCode);
      toast.success(res.message || (isFa ? "کد تخفیف اعمال شد" : "Discount applied"));
      setDiscountCode("");
    } catch (err: any) {
      toast.error(err?.message || (isFa ? "کد تخفیف نامعتبر است" : "Invalid discount code"));
    } finally {
      setLoadingDiscount(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. VIP Status / Countdown OR 21-Day Free Trial Claim Banner */}
      {isVip && timeLeft ? (
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-background/90 to-amber-950/30 p-4 sm:p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 shadow-md">
                <Crown className="size-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">
                    {isFa ? "اشتراک فعال WOLF VIP" : "Active WOLF VIP Membership"}
                  </span>
                  <Badge className="bg-amber-500 text-black font-bold text-[10px]">
                    VIP ACTIVE
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isFa ? "دسترسی نامحدود به سیگنال‌های بلادرنگ هوش مصنوعی و ترید اتوماتیک" : "Unlimited real-time AI signals & auto-execution"}
                </p>
              </div>
            </div>

            {/* Countdown Box */}
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-background/70 px-4 py-2 font-mono">
              <Clock className="size-4 text-amber-400" />
              <span className="text-xs text-muted-foreground me-1">{isFa ? "زمان باقی‌مانده:" : "Remaining:"}</span>
              <div className="flex items-center gap-1.5 font-bold text-amber-400 text-sm">
                <span className="bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">{timeLeft.days}d</span>
                <span>:</span>
                <span className="bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">{timeLeft.hours}h</span>
                <span>:</span>
                <span className="bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">{timeLeft.minutes}m</span>
                <span>:</span>
                <span className="bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 text-xs">{timeLeft.seconds}s</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-background/95 to-slate-900/40 p-4 sm:p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-md">
                <Gift className="size-6 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">
                    {isFa ? "هدیه ثبت‌نام: ۲۱ روز اشتراک رایگان VIP" : "Registration Offer: 21-Day Free VIP Trial"}
                  </span>
                  <Badge className="bg-emerald-500 text-black font-bold text-[10px]">
                    FREE TRIAL
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isFa
                    ? "تمام سیگنال‌های VIP فارکس و کریپتو + ۵۰ ولف‌کوین هدیه بدون نیاز به کارت اعتباری"
                    : "Full Forex & Crypto VIP signals + 50 WolfCoins without payment"}
                </p>
              </div>
            </div>

            <Button
              onClick={handleClaim}
              disabled={loadingTrial}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5 shadow-md shadow-emerald-900/40"
            >
              <Zap className="size-3.5 text-amber-300" />
              {loadingTrial ? "..." : isFa ? "فعال‌سازی آنی ۲۱ روزه رایگان" : "Claim 21 Days Free"}
            </Button>
          </div>
        </div>
      )}

      {/* 2. Discount Code Form */}
      <div className="rounded-xl border border-border/60 bg-card/60 p-3.5 backdrop-blur-sm">
        <form onSubmit={handleApplyDiscount} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Tag className="size-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              {isFa ? "کد تخفیف یا کد هدیه VIP داری؟" : "Have a Promo or VIP Discount Code?"}
            </span>
          </div>

          <div className="flex items-center gap-2 ms-auto">
            <Input
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
              placeholder={isFa ? "مثال: WOLF2025" : "e.g. WOLF2025"}
              className="h-8 w-36 uppercase font-mono text-xs font-bold"
            />
            <Button
              type="submit"
              size="sm"
              disabled={loadingDiscount || !discountCode.trim()}
              className="h-8 text-xs font-bold bg-primary text-primary-foreground"
            >
              {loadingDiscount ? "..." : isFa ? "اعمال کد" : "Apply Code"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
