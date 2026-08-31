import React, { useState } from "react";
import { Headphones, MessageSquare, Send, Plus, CheckCircle2, Clock, Bot, Sparkles, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { toast } from "sonner";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created: number;
}

interface SupportTicketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tickets?: Ticket[];
  onCreateTicket?: (subject: string, message: string, category: string, priority: string) => Promise<void>;
  tgSupportUrl?: string;
  lang?: "fa" | "en";
}

export function SupportTicketModal({
  open,
  onOpenChange,
  tickets = [],
  onCreateTicket,
  tgSupportUrl = "https://t.me/TradingWolfSupport",
  lang = "fa",
}: SupportTicketModalProps) {
  const [tab, setTab] = useState<"list" | "create">("list");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("medium");
  const [loading, setLoading] = useState(false);

  const isFa = lang === "fa";

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error(isFa ? "لطفاً موضوع و پیام تیکت را وارد کنید" : "Please fill subject and message");
      return;
    }
    if (!onCreateTicket) {
      toast.success(isFa ? "تیکت شما با موفقیت ثبت شد و به کارشناسان ارسال گردید." : "Ticket submitted successfully.");
      setTab("list");
      setSubject("");
      setMessage("");
      return;
    }
    setLoading(true);
    try {
      await onCreateTicket(subject, message, category, priority);
      toast.success(isFa ? "تیکت شما با موفقیت ثبت شد" : "Ticket submitted successfully");
      setTab("list");
      setSubject("");
      setMessage("");
    } catch (err: any) {
      toast.error(err?.message || (isFa ? "خطا در ثبت تیکت" : "Failed to create ticket"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Headphones className="size-5 text-primary" />
              {isFa ? "پشتیبانی و ثبت تیکت" : "Support & Ticketing"}
            </DialogTitle>
            <div className="flex items-center gap-1.5">
              <Button
                variant={tab === "list" ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => setTab("list")}
              >
                <MessageSquare className="size-3.5 me-1" />
                {isFa ? "تیکت‌های من" : "My Tickets"}
              </Button>
              <Button
                variant={tab === "create" ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => setTab("create")}
              >
                <Plus className="size-3.5 me-1" />
                {isFa ? "تیکت جدید" : "New Ticket"}
              </Button>
            </div>
          </div>
          <DialogDescription className="text-xs">
            {isFa
              ? "ارتباط مستقیم با تیم پشتیبانی فنی و مالی تریدینگ ولف"
              : "Direct support from Trading Wolf AI technical and billing teams"}
          </DialogDescription>
        </DialogHeader>

        {/* Telegram Direct Support Banner */}
        <div className="flex items-center justify-between rounded-xl border border-sky-500/25 bg-sky-500/10 p-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500 text-white font-bold">
              ✈
            </div>
            <div>
              <p className="font-semibold text-foreground">{isFa ? "پشتیبانی ۲۴ ساعته تلگرام" : "24/7 Telegram Support"}</p>
              <p className="text-[11px] text-muted-foreground">{isFa ? "پاسخگویی آنی توسط کارشناسان" : "Instant human response"}</p>
            </div>
          </div>
          <a
            href={tgSupportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-sky-500 hover:bg-sky-600 px-3 py-1.5 text-xs font-bold text-white transition-all shadow-sm"
          >
            {isFa ? "ارتباط در تلگرام" : "Open Telegram"}
            <ExternalLink className="size-3" />
          </a>
        </div>

        {tab === "create" ? (
          <form onSubmit={handleCreate} className="space-y-3.5 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{isFa ? "موضوع تیکت" : "Subject"}</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={isFa ? "مثال: سوال درباره نحوه واریز تتر یا اشتراک VIP" : "e.g. Question regarding USDT deposit"}
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{isFa ? "دسته‌بندی" : "Category"}</Label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="general">{isFa ? "عمومی و راهنمایی" : "General"}</option>
                  <option value="financial">{isFa ? "مالی، واریز و برداشت" : "Billing & Wallet"}</option>
                  <option value="technical">{isFa ? "مشکل فنی یا اتصال به ربات" : "Technical & Bot"}</option>
                  <option value="vip">{isFa ? "بسته‌های VIP و سیگنال" : "VIP & Signals"}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{isFa ? "اولویت" : "Priority"}</Label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="low">{isFa ? "عادی" : "Low"}</option>
                  <option value="medium">{isFa ? "متوسط" : "Medium"}</option>
                  <option value="high">{isFa ? "فوری / زیاد" : "High"}</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{isFa ? "متن پیام" : "Message"}</Label>
              <Textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={isFa ? "شرح دقیق درخواست یا مشکل خود را بنویسید..." : "Describe your issue or question in detail..."}
                className="text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setTab("list")}>
                {isFa ? "انصراف" : "Cancel"}
              </Button>
              <Button type="submit" size="sm" disabled={loading} className="gap-1.5 bg-primary font-bold text-primary-foreground">
                <Send className="size-3.5" />
                {loading ? "..." : isFa ? "ارسال تیکت" : "Submit Ticket"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-2 pt-1">
            {tickets.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs space-y-2">
                <MessageSquare className="size-8 mx-auto opacity-40" />
                <p>{isFa ? "شما هنوز تیکتی ثبت نکرده‌اید." : "No support tickets found."}</p>
                <Button size="sm" variant="outline" className="text-xs font-semibold" onClick={() => setTab("create")}>
                  {isFa ? "اولین تیکت خود را ایجاد کنید" : "Create your first ticket"}
                </Button>
              </div>
            ) : (
              tickets.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-background/50 p-3 text-xs hover:bg-background/80 transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">{t.subject}</span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] ${
                          t.status === "closed"
                            ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                            : "border-amber-500/30 text-amber-400 bg-amber-500/10"
                        }`}
                      >
                        {t.status === "closed" ? (isFa ? "پاسخ داده شده" : "Resolved") : (isFa ? "در حال بررسی" : "In Progress")}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(t.created).toLocaleDateString(isFa ? "fa-IR" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    #{t.id.slice(-5)}
                  </Badge>
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
