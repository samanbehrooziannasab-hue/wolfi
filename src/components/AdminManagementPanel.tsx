import { useState } from "react";
import { useWolfAuth } from "@/hooks/use-wolf-auth";
import { useQuery, useMutation } from "@/lib/safeHooks";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Input,
  Label,
  Switch,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import {
  Crown,
  Coins,
  Globe,
  Bot,
  Users,
  ShieldAlert,
  Send,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  ExternalLink,
  Megaphone,
  LifeBuoy,
  Image as ImageIcon,
} from "lucide-react";

interface Props {
  className?: string;
}

export function AdminManagementPanel({ className }: Props) {
  const { token, isAdmin, isAssistant } = useWolfAuth();
  const [activeSubTab, setActiveSubTab] = useState<"vip" | "coins" | "domain" | "providers" | "roles" | "telegram" | "notifications" | "tickets">("vip");

  // Queries
  const vipPackages = useQuery(api.admin.listVipPackages, {}) ?? [];
  const systemSettings = useQuery(api.settings.allSettings, {}) ?? {};
  const userList = useQuery(api.admin.listUsers, { token: token || "" }) ?? [];
  const aiUsage = useQuery(api.aiChat.listAiUsage, { token: token || "" });
  const notifications = useQuery(api.admin.listNotifications, { token: token || "" }) ?? [];
  const allTickets = useQuery(api.admin.listAllTickets, { token: token || "" }) ?? [];

  // Mutations
  const savePackage = useMutation(api.admin.saveVipPackage);
  const updateDomain = useMutation(api.admin.updateDomainSetting);
  const setAiProviderEnabled = useMutation(api.admin.setAiProviderEnabled);
  const setUserRole = useMutation(api.admin.setUserRole);
  const saveSettings = useMutation(api.admin.saveSettings);
  const sendTelegramInsight = useMutation(api.admin.sendAiInsightToTelegram);
  const createNotif = useMutation(api.admin.createNotification);
  const deleteNotif = useMutation(api.admin.deleteNotification);
  const replyTk = useMutation(api.admin.replyTicket);
  const setTkStatus = useMutation(api.admin.setTicketStatus);
  const delTk = useMutation(api.admin.deleteTicket);

  // Local state for forms
  const [editingVip, setEditingVip] = useState<any | null>(null);
  const [domainInput, setDomainInput] = useState("");
  const [coinRateInput, setCoinRateInput] = useState("");
  const [coinCostInput, setCoinCostInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [tgTitle, setTgTitle] = useState("");
  const [tgContent, setTgContent] = useState("");
  const [tgTag, setTgTag] = useState("تحلیل_هوش_مصنوعی");
  const [tgStatus, setTgStatus] = useState<string | null>(null);

  // Notification form state
  const [notifTitle, setNotifTitle] = useState("");
  const [notifText, setNotifText] = useState("");
  const [notifImage, setNotifImage] = useState("");
  const [notifLink, setNotifLink] = useState("");
  const [notifBroadcast, setNotifBroadcast] = useState(true);

  // Ticket reply states
  const [ticketReplyText, setTicketReplyText] = useState<Record<string, string>>({});
  const [ticketReplyImage, setTicketReplyImage] = useState<Record<string, string>>({});

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 7 * 1024 * 1024) {
      alert("حجم تصویر نباید بیشتر از ۷ مگابایت باشد");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setter(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateNotification = async () => {
    if (!token || !notifTitle.trim()) return;
    try {
      await createNotif({
        token,
        type: "announcement",
        titleFa: notifTitle.trim(),
        textFa: notifText.trim() || undefined,
        imageUrl: notifImage || undefined,
        linkUrl: notifLink || undefined,
        broadcast: notifBroadcast,
      });
      setNotifTitle("");
      setNotifText("");
      setNotifImage("");
      setNotifLink("");
      alert("اعلان با موفقیت ایجاد و ارسال شد");
    } catch (e: any) {
      alert("خطا در ایجاد اعلان: " + (e?.message || e));
    }
  };

  // VIP form inputs
  const [pkgTitleFa, setPkgTitleFa] = useState("");
  const [pkgTitleEn, setPkgTitleEn] = useState("");
  const [pkgDays, setPkgDays] = useState(30);
  const [pkgPrice, setPkgPrice] = useState(29);
  const [pkgDesc, setPkgDesc] = useState("");

  const handleSaveVip = async () => {
    if (!token || !pkgTitleFa) return;
    try {
      await savePackage({
        token,
        key: editingVip?.key || "vip-" + Date.now(),
        name: pkgTitleEn || pkgTitleFa,
        nameFa: pkgTitleFa,
        price: Number(pkgPrice) || 29,
        durationDays: Number(pkgDays) || 30,
        minCapital: 0,
        maxCapital: 100000,
        features: [pkgDesc],
        featuresFa: [pkgDesc],
        riskDisclosure: "بدون ریسک تضمین‌شده",
        terms: "قوانین VIP",
        status: true,
      });
      setEditingVip(null);
      setPkgTitleFa("");
      setPkgTitleEn("");
      setPkgPrice(29);
      setPkgDays(30);
      setPkgDesc("");
    } catch (e: any) {
      alert("خطا در ذخیره پکیج VIP: " + (e?.message || e));
    }
  };

  const handleSaveDomain = async () => {
    if (!token || !domainInput) return;
    try {
      await updateDomain({ token, domain: domainInput });
      alert("دامنه سیستم و لینک‌های رفرال به‌روزرسانی شدند");
    } catch (e: any) {
      alert("خطا در تنظیم دامنه: " + (e?.message || e));
    }
  };

  const handleSaveCoinEconomy = async () => {
    if (!token) return;
    setSavingSettings(true);
    try {
      const updates: Record<string, any> = {};
      if (coinRateInput) updates["coins.wolfPerUsdt"] = Number(coinRateInput);
      if (coinCostInput) updates["coins.aiCost"] = Number(coinCostInput);
      await saveSettings({ token, settings: updates });
      alert("تنظیمات اقتصاد ولف‌کوین ذخیره شد");
    } catch (e: any) {
      alert("خطا در ذخیره اقتصاد سکه: " + (e?.message || e));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendTelegram = async () => {
    if (!token || !tgTitle || !tgContent) return;
    setTgStatus("sending");
    try {
      await sendTelegramInsight({
        token,
        title: tgTitle,
        content: tgContent,
        tag: tgTag,
      });
      setTgStatus("sent");
      setTgTitle("");
      setTgContent("");
      setTimeout(() => setTgStatus(null), 4000);
    } catch (e: any) {
      alert("خطا در ارسال به تلگرام: " + (e?.message || e));
      setTgStatus("error");
    }
  };

  const knownProviders = [
    { id: "gemini", name: "Google Gemini", type: "Keyed", note: "مدل‌های پیشرفته تحلیل و چت" },
    { id: "openai", name: "OpenAI ChatGPT", type: "Keyed", note: "مدل‌های GPT-4o و استدلال" },
    { id: "anthropic", name: "Anthropic Claude", type: "Keyed", note: "کلود Sonnet / Haiku" },
    { id: "pollinations", name: "Pollinations AI", type: "Keyless / Free", note: "تولید تصویر و درس رایگان" },
    { id: "groq", name: "Groq LPU", type: "Keyed", note: "پاسخ‌دهی فوق‌سریع Llama" },
    { id: "deepseek", name: "DeepSeek", type: "Keyed", note: "مدل تحلیل ریاضی و استراتژی" },
    { id: "openrouter", name: "OpenRouter", type: "Keyed / Aggregator", note: "مجموعه ارائه‌دهندگان آزاد" },
  ];

  return (
    <div className={`space-y-6 ${className || ""}`} dir="rtl">
      {/* Top Header Card */}
      <Card className="border-emerald-500/20 bg-gradient-to-r from-emerald-950/20 via-surface to-surface">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl flex items-center gap-2 text-emerald-400">
                <ShieldAlert className="w-5 h-5 text-emerald-400" />
                مرکز مدیریت و دسترسی‌های پیشرفته (Admin Management)
              </CardTitle>
              <CardDescription className="text-slate-400 mt-1">
                مدیریت ساده و یکپارچه بسته‌های VIP، ولف‌کوین، ارائه‌دهندگان هوش مصنوعی، دامنه و دسترسی دستیاران
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isAdmin ? "default" : "secondary"} className="bg-emerald-600/20 text-emerald-300 border-emerald-500/30">
                {isAdmin ? "مدیر کل (Super Admin)" : "دستیار / کادر فنی (Assistant)"}
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Navigation Sub-Tabs */}
      <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as any)} className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 bg-surface/80 border border-slate-800 p-1">
          <TabsTrigger value="vip" className="flex items-center gap-1.5 text-xs">
            <Crown className="w-4 h-4 text-amber-400" />
            بسته‌های VIP
          </TabsTrigger>
          <TabsTrigger value="coins" className="flex items-center gap-1.5 text-xs">
            <Coins className="w-4 h-4 text-yellow-400" />
            ولف‌کوین & اقتصاد
          </TabsTrigger>
          <TabsTrigger value="domain" className="flex items-center gap-1.5 text-xs">
            <Globe className="w-4 h-4 text-sky-400" />
            دامنه & رفرال
          </TabsTrigger>
          <TabsTrigger value="providers" className="flex items-center gap-1.5 text-xs">
            <Bot className="w-4 h-4 text-purple-400" />
            تأمین‌کنندگان AI
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-1.5 text-xs">
            <Users className="w-4 h-4 text-indigo-400" />
            سطوح دسترسی
          </TabsTrigger>
          <TabsTrigger value="telegram" className="flex items-center gap-1.5 text-xs">
            <Send className="w-4 h-4 text-blue-400" />
            ارسال به کانال
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-1.5 text-xs">
            <Megaphone className="w-4 h-4 text-emerald-400" />
            مدیریت اعلان‌ها
          </TabsTrigger>
          <TabsTrigger value="tickets" className="flex items-center gap-1.5 text-xs">
            <LifeBuoy className="w-4 h-4 text-rose-400" />
            تیکت‌های پشتیبانی
          </TabsTrigger>
        </TabsList>

        {/* 1. VIP Packages Management */}
        <TabsContent value="vip" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 border-slate-800 bg-surface">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-400" />
                    لیست پلن‌ها و اشتراک‌های VIP
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingVip({ isNew: true });
                      setPkgTitleFa("");
                      setPkgTitleEn("");
                      setPkgPrice(29);
                      setPkgDays(30);
                      setPkgDesc("");
                    }}
                    className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10 gap-1 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    تعریف پلن جدید
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {vipPackages.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">هیچ پکیج VIP فعالی یافت نشد</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-800">
                          <TableHead className="text-right">عنوان پلن</TableHead>
                          <TableHead className="text-center">مدت زمان</TableHead>
                          <TableHead className="text-center">قیمت (تتر)</TableHead>
                          <TableHead className="text-center">وضعیت</TableHead>
                          <TableHead className="text-left">عملیات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vipPackages.map((pkg: any) => (
                          <TableRow key={pkg._id} className="border-slate-800/60">
                            <TableCell className="font-medium text-slate-200">
                              <div>{pkg.nameFa}</div>
                              <div className="text-xs text-slate-500">{pkg.name}</div>
                            </TableCell>
                            <TableCell className="text-center text-slate-300">{pkg.durationDays} روز</TableCell>
                            <TableCell className="text-center font-mono text-emerald-400">{pkg.price} USDT</TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={pkg.status !== false}
                                onCheckedChange={(val) => {
                                  if (token) savePackage({ token, key: pkg.key, name: pkg.name, nameFa: pkg.nameFa, price: pkg.price, durationDays: pkg.durationDays, minCapital: pkg.minCapital ?? 0, maxCapital: pkg.maxCapital ?? 100000, features: pkg.features ?? [], featuresFa: pkg.featuresFa ?? [], riskDisclosure: pkg.riskDisclosure ?? "", terms: pkg.terms ?? "", status: val, discountPercent: pkg.discountPercent, giftCoins: pkg.giftCoins, commissionPct: pkg.commissionPct });
                                }}
                              />
                            </TableCell>
                            <TableCell className="text-left space-x-1 space-x-reverse">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-slate-400 hover:text-amber-300"
                                onClick={() => {
                                  setEditingVip(pkg);
                                  setPkgTitleFa(pkg.nameFa || "");
                                  setPkgTitleEn(pkg.name || "");
                                  setPkgPrice(pkg.price || 29);
                                  setPkgDays(pkg.durationDays || 30);
                                  setPkgDesc(pkg.featuresFa?.[0] || "");
                                }}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* VIP Package Form */}
            <Card className="border-slate-800 bg-surface">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  {editingVip ? (editingVip.isNew ? "➕ ثبت پلن VIP جدید" : "✏️ ویرایش پلن VIP") : "⚙️ تنظیمات پلن"}
                </CardTitle>
                <CardDescription className="text-xs">
                  تعریف پلن‌های ماهانه، سه‌ماهه یا دائمی برای دسترسی به سیگنال‌های VIP
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <Label className="text-xs">نام پلن (فارسی)</Label>
                  <Input
                    value={pkgTitleFa}
                    onChange={(e) => setPkgTitleFa(e.target.value)}
                    placeholder="مثال: اشتراک طلایی ۱ ماهه"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">نام پلن (انگلیسی)</Label>
                  <Input
                    value={pkgTitleEn}
                    onChange={(e) => setPkgTitleEn(e.target.value)}
                    placeholder="1 Month Gold VIP"
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">مدت (روز)</Label>
                    <Input
                      type="number"
                      value={pkgDays}
                      onChange={(e) => setPkgDays(Number(e.target.value))}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">قیمت (USDT)</Label>
                    <Input
                      type="number"
                      value={pkgPrice}
                      onChange={(e) => setPkgPrice(Number(e.target.value))}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">توضیحات و مزایا</Label>
                  <Input
                    value={pkgDesc}
                    onChange={(e) => setPkgDesc(e.target.value)}
                    placeholder="دسترسی کامل به سیگنال‌ها، تارگت‌های فیوچرز..."
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <Button
                  onClick={handleSaveVip}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs mt-2"
                >
                  ذخیره پلن VIP
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 2. WolfCoin & Token Economy */}
        <TabsContent value="coins" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-slate-800 bg-surface">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-yellow-400">
                  <Coins className="w-5 h-5" />
                  اقتصاد سکه ولف (WolfCoin)
                </CardTitle>
                <CardDescription className="text-xs">
                  تنظیم نرخ تبدیل سکه، هزینه مشاوره هوش مصنوعی و پاداش‌های پیش‌بینی
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs">تعداد سکه ولف به ازای هر ۱ تتر خرید:</Label>
                  <Input
                    type="number"
                    defaultValue={systemSettings["coins.wolfPerUsdt"] ?? 100}
                    onChange={(e) => setCoinRateInput(e.target.value)}
                    placeholder="100"
                    className="mt-1"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    کاربر با پرداخت ۱۰ تتر، ۱,۰۰۰ ولف‌کوین دریافت خواهد کرد.
                  </span>
                </div>
                <div>
                  <Label className="text-xs">هزینه پرسش از مشاور AI (تعداد سکه ولف):</Label>
                  <Input
                    type="number"
                    defaultValue={systemSettings["coins.aiCost"] ?? 50}
                    onChange={(e) => setCoinCostInput(e.target.value)}
                    placeholder="50"
                    className="mt-1"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    برای هر چت آموزشی/مشاوره از کاربر کسر می‌شود (برای ادمین‌ها رایگان است).
                  </span>
                </div>
                <Button
                  onClick={handleSaveCoinEconomy}
                  disabled={savingSettings}
                  className="w-full bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-bold"
                >
                  ذخیره تنظیمات اقتصاد ولف‌کوین
                </Button>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-surface">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  راهنمای توکنومیکس و کاربردها
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <div className="p-2.5 rounded bg-surface/40 border border-slate-800">
                  <b className="text-emerald-400 block mb-1">🎮 پیش‌بینی‌های دمو (Entertainment)</b>
                  کاربران با پیش‌بینی کندل بعدی رمزارزها سکه ولف پاداش می‌گیرند یا خرج می‌کنند.
                </div>
                <div className="p-2.5 rounded bg-surface/40 border border-slate-800">
                  <b className="text-purple-400 block mb-1">🤖 دسترسی به مشاور هوش مصنوعی</b>
                  تحلیل و مشاوره اختصاصی چارت‌ها با سوخت ولف‌کوین صورت می‌گیرد.
                </div>
                <div className="p-2.5 rounded bg-surface/40 border border-slate-800">
                  <b className="text-amber-400 block mb-1">🎁 تخفیف در خرید پکیج VIP</b>
                  کاربران می‌توانند موجودی سکه‌های خود را به عنوان کوپن تخفیف برای VIP خرج کنند.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 3. Domain Management & Referral Links */}
        <TabsContent value="domain" className="space-y-4 mt-4">
          <Card className="border-slate-800 bg-surface max-w-2xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-sky-400">
                <Globe className="w-5 h-5" />
                تنظیم دامنه اصلی سامانه & لینک‌های زیرمجموعه‌گیری (Referral)
              </CardTitle>
              <CardDescription className="text-xs">
                دامنه رسمی را وارد کنید تا تمامی لینک‌های دعوت، ربات تلگرام و نوتیفیکیشن‌ها با این آدرس هماهنگ شوند.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">آدرس دامنه وب‌سایت:</Label>
                <Input
                  defaultValue={systemSettings["system.domain"] ?? window.location.origin}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="https://mytradingwolf.com"
                  className="mt-1 font-mono text-left"
                  dir="ltr"
                />
              </div>
              <div className="p-3 rounded bg-sky-950/20 border border-sky-800/40 text-xs text-sky-200">
                <b>📌 فرمت نمونه لینک زیرمجموعه‌گیری کاربران:</b>
                <div className="mt-1 font-mono text-slate-300 text-left" dir="ltr">
                  {(domainInput || systemSettings["system.domain"] || window.location.origin) + "/?ref=WOLF123"}
                </div>
              </div>
              <Button onClick={handleSaveDomain} className="w-full bg-sky-500 hover:bg-sky-600 text-slate-950 font-bold">
                بروزرسانی دامنه سیستم
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. AI Providers Monitoring & Toggles */}
        <TabsContent value="providers" className="space-y-4 mt-4">
          <Card className="border-slate-800 bg-surface">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-purple-400">
                <Bot className="w-5 h-5" />
                مدیریت و پایش ارائه‌دهندگان هوش مصنوعی (AI Providers)
              </CardTitle>
              <CardDescription className="text-xs">
                فعال یا غیرفعال کردن ارائه‌دهندگان برای مسیریابی هوشمند در زمان قطعی یا محدودیت سهمیه
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {knownProviders.map((p) => {
                  const isEnabled = systemSettings[`ai.provider.${p.id}.enabled`] !== false;
                  return (
                    <div
                      key={p.id}
                      className="p-3 rounded border border-slate-800 bg-surface/60 flex flex-col justify-between space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-slate-200 text-sm">{p.name}</div>
                        <Badge variant="outline" className="text-[10px] border-slate-700">
                          {p.type}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-400">{p.note}</div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                        <span className="text-xs text-slate-300">وضعیت در چرخه:</span>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(val) => {
                            if (token) setAiProviderEnabled({ token, providerId: p.id, enabled: val });
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. User Roles & Staff Assignment */}
        <TabsContent value="roles" className="space-y-4 mt-4">
          <Card className="border-slate-800 bg-surface">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-indigo-400">
                <Users className="w-5 h-5" />
                مدیریت سطوح دسترسی و تعریف نقش «دستیار» (Staff/Assistant)
              </CardTitle>
              <CardDescription className="text-xs">
                نقش دستیار به پشتیبانی، تیکت‌ها و پایش سیگنال‌ها دسترسی دارد بدون دسترسی به تغییر کدهای حساس
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800">
                      <TableHead className="text-right">کاربر</TableHead>
                      <TableHead className="text-center">نقش فعلی</TableHead>
                      <TableHead className="text-center">موجودی سکه</TableHead>
                      <TableHead className="text-left">تغییر سطح دسترسی</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userList.slice(0, 15).map((u: any) => (
                      <TableRow key={u._id} className="border-slate-800/60">
                        <TableCell className="font-medium text-slate-200">
                          <div>{u.name || u.username}</div>
                          <div className="text-xs text-slate-500 font-mono">@{u.username}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={
                              u.role === "admin"
                                ? "border-red-500 text-red-400"
                                : u.role === "assistant"
                                  ? "border-purple-500 text-purple-400"
                                  : u.role === "vip"
                                    ? "border-amber-500 text-amber-400"
                                    : "border-slate-700 text-slate-400"
                            }
                          >
                            {u.role || "user"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-mono text-yellow-400">{u.wolfCoins ?? 0}</TableCell>
                        <TableCell className="text-left">
                          <div className="flex items-center justify-end gap-1.5">
                            {["user", "vip", "assistant", "admin"].map((r) => (
                              <Button
                                key={r}
                                size="sm"
                                variant={u.role === r ? "default" : "outline"}
                                className={`text-[11px] h-7 px-2 ${
                                  u.role === r
                                    ? "bg-indigo-600 text-white"
                                    : "border-slate-800 text-slate-400 hover:text-slate-200"
                                }`}
                                onClick={() => {
                                  if (token) setUserRole({ token, userId: u._id, role: r });
                                }}
                              >
                                {r === "admin" ? "مدیر" : r === "assistant" ? "دستیار" : r === "vip" ? "VIP" : "کاربر عادی"}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 6. Send AI Insight to Telegram Channel */}
        <TabsContent value="telegram" className="space-y-4 mt-4">
          <Card className="border-slate-800 bg-surface max-w-2xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-blue-400">
                <Send className="w-5 h-5" />
                ارسال مستقیم تحلیل هوش مصنوعی به کانال تلگرام
              </CardTitle>
              <CardDescription className="text-xs">
                ارسال بینش‌های جذاب، نتایج بهینه‌سازی (Hyperopt) و تحقیقات بازار به جای نمایش کدهای خام به کاربر
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">عنوان تحلیل / خبر:</Label>
                <Input
                  value={tgTitle}
                  onChange={(e) => setTgTitle(e.target.value)}
                  placeholder="مثال: نتیجه بهینه‌سازی استراتژی بریک‌اوت BTC"
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">برچسب / هشتگ:</Label>
                <Input
                  value={tgTag}
                  onChange={(e) => setTgTag(e.target.value)}
                  placeholder="تحلیل_هوش_مصنوعی"
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">متن پیام (روان و فارسی):</Label>
                <textarea
                  rows={5}
                  value={tgContent}
                  onChange={(e) => setTgContent(e.target.value)}
                  placeholder="توضیح نتایج استراتژی، بازدهی و پیشنهاد ورود..."
                  className="w-full mt-1 p-2 rounded bg-surface/80 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              {tgStatus === "sent" && (
                <div className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> پیام با موفقیت در نوبت ارسال تلگرام قرار گرفت!
                </div>
              )}
              <Button
                onClick={handleSendTelegram}
                disabled={tgStatus === "sending"}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                {tgStatus === "sending" ? "در حال ارسال..." : "ارسال پیام به کانال رسمی تلگرام"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 7. Notifications Management */}
        <TabsContent value="notifications" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="border-slate-800 bg-surface">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2 text-emerald-400">
                  <Megaphone className="w-4 h-4" />
                  ارسال اعلان / اطلاعیه جدید
                </CardTitle>
                <CardDescription className="text-xs">
                  درج عنوان، توضیحات کامل، لینک و تصویر (تا ۷ مگابایت) برای کاربران
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">عنوان اعلان:</Label>
                  <Input value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} placeholder="مثال: آپدیت بزرگ نسخه ۷ پلتفرم" className="mt-1 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">توضیحات کامل:</Label>
                  <textarea
                    rows={4}
                    value={notifText}
                    onChange={(e) => setNotifText(e.target.value)}
                    placeholder="متن کامل و جزئیات اطلاعیه..."
                    className="w-full mt-1 p-2 rounded bg-surface/80 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <Label className="text-xs">لینک پیوست (اختیاری):</Label>
                  <Input value={notifLink} onChange={(e) => setNotifLink(e.target.value)} placeholder="https://..." className="mt-1 text-xs" dir="ltr" />
                </div>
                <div>
                  <Label className="text-xs">تصویر ضمیمه (حداکثر ۷ مگابایت):</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setNotifImage)} className="text-xs h-9 cursor-pointer" />
                    {notifImage && <span className="text-[10px] text-emerald-400">تصویر آماده ✓</span>}
                  </div>
                  {notifImage && <img src={notifImage} alt="Preview" className="mt-2 h-20 rounded object-cover border border-slate-700" />}
                </div>
                <Button onClick={handleCreateNotification} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs">
                  ارسال و انتشار اعلان
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 border-slate-800 bg-surface">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-emerald-400" />
                  لیست اعلان‌های فعال پلتفرم
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="max-h-[500px] overflow-auto space-y-2">
                  {notifications.map((n: any) => (
                    <div key={n.id} className="rounded-lg border border-slate-800 bg-surface/60 p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-200">{n.titleFa}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px]" dir="ltr">{n.type}</Badge>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-400" onClick={() => { if (token && confirm("آیا از حذف این اعلان مطمئن هستید؟")) deleteNotif({ token, id: n.id }); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      {n.textFa && <p className="text-xs text-slate-400">{n.textFa}</p>}
                      {n.imageUrl && <img src={n.imageUrl} alt="" className="h-24 rounded object-cover border border-slate-800" />}
                      {n.linkUrl && (
                        <a href={n.linkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:underline" dir="ltr">
                          <ExternalLink className="w-3 h-3" /> {n.linkUrl}
                        </a>
                      )}
                    </div>
                  ))}
                  {notifications.length === 0 && <p className="py-8 text-center text-xs text-slate-500">هیچ اعلانی ثبت نشده است.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 8. Support Tickets Management */}
        <TabsContent value="tickets" className="space-y-4 mt-4">
          <Card className="border-slate-800 bg-surface">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2 text-rose-400">
                <LifeBuoy className="w-4 h-4" />
                مدیریت تیکت‌های پشتیبانی کاربران
              </CardTitle>
              <CardDescription className="text-xs">
                پاسخ به تیکت‌ها، آپلود تصویر (تا ۷ مگابایت)، بستن یا حذف تیکت‌ها
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {allTickets.map((t: any) => (
                  <div key={t._id} className="rounded-lg border border-slate-800 bg-surface/80 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-200">#{t._id.slice(-6)} - {t.subject}</span>
                        <Badge variant="outline" className={`text-[10px] ${t.status === "open" ? "text-emerald-400 border-emerald-500/30" : t.status === "closed" ? "text-slate-500" : "text-amber-400 border-amber-500/30"}`}>
                          {t.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">کاربر: @{t.username || "ناشناس"}</span>
                        <select
                          className="bg-surface border border-slate-700 text-xs rounded px-2 py-1 text-slate-200"
                          value={t.status}
                          onChange={(e) => setTkStatus({ token: token || "", ticketId: t._id, status: e.target.value })}
                        >
                          <option value="open">باز</option>
                          <option value="pending">در انتظار</option>
                          <option value="answered">پاسخ داده‌شده</option>
                          <option value="closed">بسته‌شده</option>
                        </select>
                        <Button size="sm" variant="outline" className="h-7 text-[10px] text-red-400 border-red-500/30 hover:bg-red-950/20" onClick={() => { if (token && confirm("آیا از حذف این تیکت مطمئن هستید؟")) delTk({ token, ticketId: t._id }); }}>
                          حذف
                        </Button>
                      </div>
                    </div>

                    {/* Messages thread */}
                    <div className="max-h-60 overflow-auto space-y-2 bg-surface/40 p-3 rounded border border-slate-800/80">
                      {(t.messages ?? []).map((m: any) => (
                        <div key={m.id || m._id} className={`max-w-[85%] rounded p-2 text-xs space-y-1 ${m.fromAdmin ? "ms-auto bg-emerald-950/30 border border-emerald-500/30 text-emerald-200" : "bg-surface border border-slate-700 text-slate-200"}`}>
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span className="font-bold">{m.fromAdmin ? "پشتیبان (کادر فنی)" : `@${t.username || "کاربر"}`}</span>
                            <span>{new Date(m.created).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <p>{m.text}</p>
                          {m.imageUrl && <img src={m.imageUrl} alt="" className="h-28 rounded object-cover mt-1 border border-slate-700" />}
                        </div>
                      ))}
                    </div>

                    {/* Reply box */}
                    {t.status !== "closed" && (
                      <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
                        <div className="flex gap-2">
                          <Input
                            placeholder="پاسخ پشتیبانی..."
                            value={ticketReplyText[t._id] ?? ""}
                            onChange={(e) => setTicketReplyText({ ...ticketReplyText, [t._id]: e.target.value })}
                            className="text-xs h-9 flex-1"
                          />
                          <Button
                            size="sm"
                            className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                            onClick={() => {
                              if (!token) return;
                              const text = ticketReplyText[t._id] ?? "";
                              const imageUrl = ticketReplyImage[t._id];
                              replyTk({ token, ticketId: t._id, text, imageUrl }).then(() => {
                                setTicketReplyText({ ...ticketReplyText, [t._id]: "" });
                                setTicketReplyImage({ ...ticketReplyImage, [t._id]: "" });
                                alert("پاسخ ارسال شد");
                              }).catch((e: any) => alert(e?.message || e));
                            }}
                          >
                            ارسال پاسخ
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 text-xs text-amber-400 border-amber-500/30"
                            onClick={() => {
                              if (!token) return;
                              replyTk({ token, ticketId: t._id, text: "تیکت بسته شد.", close: true }).then(() => alert("تیکت بسته شد"));
                            }}
                          >
                            بستن تیکت
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-slate-400 flex items-center gap-1 cursor-pointer">
                            <ImageIcon className="w-3.5 h-3.5 text-emerald-400" /> ضمیمه تصویر (تا ۷ مگابایت):
                            <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (url) => setTicketReplyImage({ ...ticketReplyImage, [t._id]: url }))} className="hidden" />
                          </label>
                          {ticketReplyImage[t._id] && <span className="text-[10px] text-emerald-400">تصویر پیوست شد ✓</span>}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {allTickets.length === 0 && <p className="py-12 text-center text-xs text-slate-500">هیچ تیکت پشتیبانی وجود ندارد.</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
