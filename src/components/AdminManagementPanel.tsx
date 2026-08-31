import { useState } from "react";
import { useWolfAuth } from "@/hooks/use-wolf-auth";
import { useConvexQuery, useConvexMutation, useConvexAction } from "convex/react";
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
} from "lucide-react";

interface Props {
  className?: string;
}

export function AdminManagementPanel({ className }: Props) {
  const { sessionToken, isAdmin, isAssistant } = useWolfAuth();
  const [activeSubTab, setActiveSubTab] = useState<"vip" | "coins" | "domain" | "providers" | "roles" | "telegram">("vip");

  // Queries
  const vipPackages = useConvexQuery(api.vip.listPackages, {}) ?? [];
  const systemSettings = useConvexQuery(api.settings.listSettings, { token: sessionToken || "" }) ?? {};
  const userList = useConvexQuery(api.admin.listUsers, { token: sessionToken || "" }) ?? [];
  const aiUsage = useConvexQuery(api.aiChat.listAiUsage, { token: sessionToken || "" });

  // Mutations
  const setPackageEnabled = useConvexMutation(api.vip.setPackageEnabled);
  const savePackage = useConvexMutation(api.vip.savePackage);
  const deletePackage = useConvexMutation(api.vip.deletePackage);
  const updateDomain = useConvexMutation(api.admin.updateDomainSetting);
  const setAiProviderEnabled = useConvexMutation(api.admin.setAiProviderEnabled);
  const setUserRole = useConvexMutation(api.admin.setUserRole);
  const saveSettings = useConvexMutation(api.admin.saveSettings);
  const sendTelegramInsight = useConvexMutation(api.admin.sendAiInsightToTelegram);

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

  // VIP form inputs
  const [pkgTitleFa, setPkgTitleFa] = useState("");
  const [pkgTitleEn, setPkgTitleEn] = useState("");
  const [pkgDays, setPkgDays] = useState(30);
  const [pkgPrice, setPkgPrice] = useState(29);
  const [pkgDesc, setPkgDesc] = useState("");

  const handleSaveVip = async () => {
    if (!sessionToken || !pkgTitleFa) return;
    try {
      await savePackage({
        token: sessionToken,
        id: editingVip?._id,
        titleFa: pkgTitleFa,
        titleEn: pkgTitleEn || pkgTitleFa,
        days: Number(pkgDays) || 30,
        priceUsdt: Number(pkgPrice) || 29,
        description: pkgDesc,
        enabled: true,
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
    if (!sessionToken || !domainInput) return;
    try {
      await updateDomain({ token: sessionToken, domain: domainInput });
      alert("دامنه سیستم و لینک‌های رفرال به‌روزرسانی شدند");
    } catch (e: any) {
      alert("خطا در تنظیم دامنه: " + (e?.message || e));
    }
  };

  const handleSaveCoinEconomy = async () => {
    if (!sessionToken) return;
    setSavingSettings(true);
    try {
      const updates: Record<string, any> = {};
      if (coinRateInput) updates["coins.wolfPerUsdt"] = Number(coinRateInput);
      if (coinCostInput) updates["coins.aiCost"] = Number(coinCostInput);
      await saveSettings({ token: sessionToken, settings: updates });
      alert("تنظیمات اقتصاد ولف‌کوین ذخیره شد");
    } catch (e: any) {
      alert("خطا در ذخیره اقتصاد سکه: " + (e?.message || e));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendTelegram = async () => {
    if (!sessionToken || !tgTitle || !tgContent) return;
    setTgStatus("sending");
    try {
      await sendTelegramInsight({
        token: sessionToken,
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
        <TabsList className="grid grid-cols-3 md:grid-cols-6 bg-surface/80 border border-slate-800 p-1">
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
                              <div>{pkg.titleFa}</div>
                              <div className="text-xs text-slate-500">{pkg.titleEn}</div>
                            </TableCell>
                            <TableCell className="text-center text-slate-300">{pkg.days} روز</TableCell>
                            <TableCell className="text-center font-mono text-emerald-400">{pkg.priceUsdt} USDT</TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={pkg.enabled !== false}
                                onCheckedChange={(val) => {
                                  if (sessionToken) setPackageEnabled({ token: sessionToken, id: pkg._id, enabled: val });
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
                                  setPkgTitleFa(pkg.titleFa || "");
                                  setPkgTitleEn(pkg.titleEn || "");
                                  setPkgPrice(pkg.priceUsdt || 29);
                                  setPkgDays(pkg.days || 30);
                                  setPkgDesc(pkg.description || "");
                                }}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-slate-400 hover:text-red-400"
                                onClick={() => {
                                  if (confirm("آیا از حذف این پکیج مطمئن هستید؟") && sessionToken) {
                                    deletePackage({ token: sessionToken, id: pkg._id });
                                  }
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
                            if (sessionToken) setAiProviderEnabled({ token: sessionToken, providerId: p.id, enabled: val });
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
                                  if (sessionToken) setUserRole({ token: sessionToken, userId: u._id, role: r });
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
      </Tabs>
    </div>
  );
}
