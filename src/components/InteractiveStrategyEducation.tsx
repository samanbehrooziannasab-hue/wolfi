import { useState } from "react";
import { useWolfAuth } from "@/hooks/use-wolf-auth";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Input,
  Label,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui";
import {
  BrainCircuit,
  Zap,
  TrendingUp,
  LineChart,
  BookOpen,
  Send,
  Sparkles,
  Search,
  CheckCircle,
  HelpCircle,
} from "lucide-react";

interface Props {
  className?: string;
}

export function InteractiveStrategyEducation({ className }: Props) {
  const { token, isAdmin } = useWolfAuth();
  const [activeTab, setActiveTab] = useState<"strategies" | "hyperopt" | "research" | "interactive_quiz">("strategies");
  const [selectedStrategy, setSelectedStrategy] = useState<string>("breakout");
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [quizResult, setQuizResult] = useState<string | null>(null);

  // Strategy definitions with intuitive Persian explanations
  const strategiesList = [
    {
      id: "breakout",
      nameFa: "استراتژی شکست قیمت (Breakout)",
      nameEn: "Volume Breakout Strategy",
      level: "مبتدی تا متوسط",
      winRate: "۶۸٪",
      riskReward: "۱ به ۲.۵",
      desc: "شناسایی عبور پرقدرت قیمت از سطوح کلیدی حمایت و مقاومت همراه با جهش محسوس در حجم معاملات.",
      rules: [
        "ورود: تثبیت کندل بالای خط مقاومت با حجم حداقل ۱.۵ برابر میانگین",
        "حد ضرر (SL): کمی پایین‌تر از آخرین کف معتبر (Swing Low)",
        "حد سود (TP): به اندازه ارتفاع کانال شکسته‌شده به سمت بالا",
      ],
      pros: ["ورود در ابتدای روندهای انفجاری", "ریسک به ریوارد بالا"],
    },
    {
      id: "ict_smc",
      nameFa: "اسمارت مانی و نقدینگی (SMC & ICT)",
      nameEn: "Smart Money Concepts & Orderblocks",
      level: "پیشرفته",
      winRate: "۷۴٪",
      riskReward: "۱ به ۳.۲",
      desc: "ردیابی ردپای نهنگ‌ها، بانک‌ها و بازیگران بزرگ بازار در مناطق عدم تعادل (FVG) و استخر نقدینگی.",
      rules: [
        "شناسایی ساختار شکست (BOS) یا تغییر ماهیت بازار (CHoCH)",
        "تعیین اردربلاک منشأ حرکت و شکاف ارزش منصفانه (FVG)",
        "ورود با تاییدیه ریجکشن در تایم‌فریم پایین‌تر",
      ],
      pros: ["دقت بسیار بالا و حد ضررهای کوچک", "عدم فریب در تله‌های نقدینگی بازار"],
    },
    {
      id: "trend_following",
      nameFa: "دنبال‌کننده روند با میانگین‌های متحرک",
      nameEn: "EMA Trend Follower",
      level: "مبتدی",
      winRate: "۶۲٪",
      riskReward: "۱ به ۲",
      desc: "معامله فقط در جهت جهت‌گیری روند اصلی با استفاده از تلاقی EMA 20 و EMA 50.",
      rules: [
        "ورود لانگ زمانی که قیمت بالای هر دو میانگین باشد و پولبک به EMA 20 بزند",
        "خروج با تقاطع معکوس میانگین‌ها یا برخورد به تارگت‌های فیبوناچی",
      ],
      pros: ["عدم نیاز به محاسبات پیچیده", "همسو با قدرت جریان بازار"],
    },
  ];

  return (
    <div className={`space-y-6 ${className || ""}`} dir="rtl">
      {/* Education Header */}
      <Card className="border-purple-500/20 bg-gradient-to-r from-purple-950/20 via-surface to-surface">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl flex items-center gap-2 text-purple-400">
                <BrainCircuit className="w-5 h-5 text-purple-400" />
                آکادمی هوشمند و استراتژی‌های معاملاتی (WOLF AI Academy)
              </CardTitle>
              <CardDescription className="text-slate-400 mt-1">
                آموزش تعاملی و کاربردی استراتژی‌های سودده، بهینه‌سازی پارامترها (Hyperopt) و تحقیقات پیشرفته بازار
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-purple-500/40 text-purple-300">
              نسخه ۳.۲ تعاملی
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 bg-surface/80 border border-slate-800 p-1">
          <TabsTrigger value="strategies" className="flex items-center gap-1.5 text-xs">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            استراتژی‌های سودده
          </TabsTrigger>
          <TabsTrigger value="hyperopt" className="flex items-center gap-1.5 text-xs">
            <Zap className="w-4 h-4 text-amber-400" />
            مفهوم هایپراپت (Hyperopt)
          </TabsTrigger>
          <TabsTrigger value="research" className="flex items-center gap-1.5 text-xs">
            <Search className="w-4 h-4 text-sky-400" />
            تحقیق بازار هوش مصنوعی
          </TabsTrigger>
          <TabsTrigger value="interactive_quiz" className="flex items-center gap-1.5 text-xs">
            <Sparkles className="w-4 h-4 text-pink-400" />
            آزمون و تمرین تعاملی
          </TabsTrigger>
        </TabsList>

        {/* 1. Strategies Catalog */}
        <TabsContent value="strategies" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {strategiesList.map((st) => (
              <Card
                key={st.id}
                onClick={() => setSelectedStrategy(st.id)}
                className={`cursor-pointer transition-all border ${
                  selectedStrategy === st.id
                    ? "border-purple-500 shadow-lg shadow-purple-500/10 bg-purple-950/10"
                    : "border-slate-800 bg-surface hover:border-slate-700"
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">
                      {st.level}
                    </Badge>
                    <span className="text-xs font-mono font-bold text-emerald-400">وین‌ریت: {st.winRate}</span>
                  </div>
                  <CardTitle className="text-sm font-bold text-slate-100 mt-2">{st.nameFa}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-slate-400">
                  <p className="line-clamp-2">{st.desc}</p>
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-300">
                    <span>ریسک/ریوارد:</span>
                    <span className="font-mono text-purple-300">{st.riskReward}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Active Strategy Detail */}
          {selectedStrategy && (
            <Card className="border-slate-800 bg-surface p-4">
              {(() => {
                const cur = strategiesList.find((s) => s.id === selectedStrategy) || strategiesList[0];
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-100">{cur.nameFa}</h3>
                        <span className="text-xs text-slate-400 font-mono">{cur.nameEn}</span>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                        میانگین R:R {cur.riskReward}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-purple-300">📌 قوانین معاملاتی و شرایط ورود:</h4>
                        <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                          {cur.rules.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-emerald-300">✨ مزایای کلیدی:</h4>
                        <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                          {cur.pros.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </Card>
          )}
        </TabsContent>

        {/* 2. Hyperopt Concept Explained */}
        <TabsContent value="hyperopt" className="space-y-4 mt-4">
          <Card className="border-slate-800 bg-surface">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-amber-400">
                <Zap className="w-5 h-5" />
                هایپراپت (Hyperopt) چیست و چگونه سود شما را چند برابر می‌کند؟
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-300 leading-relaxed">
              <div className="p-3.5 rounded bg-amber-950/20 border border-amber-800/40 text-amber-200 text-xs">
                <b>💡 تعریف به زبان بسیار ساده:</b>
                <p className="mt-1">
                  فرض کنید یک خودروی مسابقه دارید؛ هایپراپت مانند مکانیک فوق‌هوشمندی است که هزاران حالت مختلف تنظیم باد لاستیک،
                  سوخت و موتور را در کسری از ثانیه شبیه‌سازی می‌کند تا به «سریع‌ترین و کم‌خطرترین» حالت ممکن برسد. در تریدینگ،
                  هایپراپت بهترین ترکیب حد سود، حد ضرر و اندیکاتورها را روی داده‌های گذشته استخراج می‌کند.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 rounded border border-slate-800 bg-surface/50">
                  <div className="font-bold text-slate-100 text-xs mb-1">۱. آزمایش هزاران حالت</div>
                  <div className="text-xs text-slate-400">بررسی خودکار بیش از ۱۰,۰۰۰ ترکیب مختلف از تنظیمات در چند ثانیه</div>
                </div>
                <div className="p-3 rounded border border-slate-800 bg-surface/50">
                  <div className="font-bold text-slate-100 text-xs mb-1">۲. حذف شانس و احساسات</div>
                  <div className="text-xs text-slate-400">یافتن استراتژی‌هایی که بیشترین پایداری و کمترین افت سرمایه (Drawdown) را دارند</div>
                </div>
                <div className="p-3 rounded border border-slate-800 bg-surface/50">
                  <div className="font-bold text-slate-100 text-xs mb-1">۳. ارسال آسان نتایج</div>
                  <div className="text-xs text-slate-400">به جای کدهای پیچیده پایتون، خلاصه کاربردی مستقیماً به تلگرام یا پنل ارسال می‌شود</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. Market Research Explained */}
        <TabsContent value="research" className="space-y-4 mt-4">
          <Card className="border-slate-800 bg-surface">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-sky-400">
                <Search className="w-5 h-5" />
                تحقیق بازار هوش مصنوعی (Market Research)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-300 leading-relaxed">
              <div className="p-3.5 rounded bg-sky-950/20 border border-sky-800/40 text-sky-200 text-xs">
                <b>🌐 رصد لحظه‌ای اینترنت و اخبار جهانی:</b>
                <p className="mt-1">
                  موتور هوش مصنوعی WOLF صرفاً به چارت نگاه نمی‌کند؛ بلکه سنتیمنت بازار، نوسانات بیت‌کوین و شاخص دلار را ارزیابی کرده و
                  ایده‌های معاملاتی جدید را برای تریدر فرمول‌بندی می‌کند.
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-3 rounded border border-slate-800 bg-surface/60 flex items-center justify-between">
                  <span>شناسایی خودکار جفت‌ارزهای پرپتانسیل روز</span>
                  <Badge variant="outline" className="border-sky-500 text-sky-300">فعال</Badge>
                </div>
                <div className="p-3 rounded border border-slate-800 bg-surface/60 flex items-center justify-between">
                  <span>سنجش همبستگی کریپتو و طلا/فارکس</span>
                  <Badge variant="outline" className="border-sky-500 text-sky-300">خودکار</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. Interactive Quiz */}
        <TabsContent value="interactive_quiz" className="space-y-4 mt-4">
          <Card className="border-slate-800 bg-surface max-w-2xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-pink-400">
                <Sparkles className="w-5 h-5" />
                آزمون سریع مدیریت ریسک و سرمایه
              </CardTitle>
              <CardDescription className="text-xs">
                با پاسخ به سناریوهای ترید، مهارت خود را بسنجید و جایزه ولف‌کوین بگیرید!
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="p-3 rounded bg-slate-900 border border-slate-800 text-slate-200 text-xs">
                <b>❓ سناریو:</b> در یک معامله لانگ، ریسک به ریوارد ۱ به ۲ است. اگر سرمایه درگیر شما ۵۰۰ دلار باشد و حد ضرر را ۲٪ تعیین کرده باشید، در صورت برخورد به حد سود چقدر سود کسب می‌کنید؟
              </div>

              <div className="space-y-2">
                {[
                  { id: 1, text: "۱۰ دلار سود (معادل ۲٪)" },
                  { id: 2, text: "۲۰ دلار سود (معادل ۴٪ با احتساب R:R ۲ برابر)" },
                  { id: 3, text: "۵۰ دلار سود" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setQuizAnswer(opt.id);
                      if (opt.id === 2) {
                        setQuizResult("correct");
                      } else {
                        setQuizResult("wrong");
                      }
                    }}
                    className={`w-full text-right p-2.5 rounded text-xs border transition-all ${
                      quizAnswer === opt.id
                        ? opt.id === 2
                          ? "border-emerald-500 bg-emerald-950/30 text-emerald-300"
                          : "border-red-500 bg-red-950/30 text-red-300"
                        : "border-slate-800 hover:border-slate-700 bg-surface/50 text-slate-300"
                    }`}
                  >
                    {opt.text}
                  </button>
                ))}
              </div>

              {quizResult === "correct" && (
                <div className="p-3 rounded bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  آفرین! پاسخ کاملاً صحیح است. ۲٪ ضرر در برابر ۴٪ سود یعنی ریسک به ریوارد ۱ به ۲.
                </div>
              )}
              {quizResult === "wrong" && (
                <div className="p-3 rounded bg-red-950/30 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  پاسخ اشتباه است. با حد ضرر ۲٪ و ریوارد ۲ برابر، سود حاصل ۴٪ (معادل ۲۰ دلار) خواهد بود.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
