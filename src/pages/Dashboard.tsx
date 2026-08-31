import { api } from "@/convex/_generated/api";
import { formatSymbol as fmtSym } from "@/lib/format";
import type { Id } from "@/convex/_generated/dataModel";
import logo from "@/assets/logo.svg";
import { MarketClock } from "@/components/MarketClock";
import { SparkChart } from "@/components/SparkChart";
import { LiveChart } from "@/components/LiveChart";
import { LiveWinningTicker } from "@/components/LiveWinningTicker";
import { MultiAgentArena } from "@/components/MultiAgentArena";
import { CryptoIcon } from "@/components/CryptoIcon";
import { FrozenCapitalBanner } from "@/components/FrozenCapitalBanner";
import { FundamentalNewsSection } from "@/components/FundamentalNewsSection";
import { SupportTicketModal } from "@/components/SupportTicketModal";
import { VipTrialCard } from "@/components/VipTrialCard";
import { TradingGlossaryTooltip } from "@/components/TradingGlossaryTooltip";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import { useWolfAuth } from "@/hooks/use-wolf-auth";
import { LangToggle, useI18n } from "@/lib/i18n";
import { useAction as useConvexAction, useMutation as useConvexMutation, useQuery as useConvexQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { BACKEND } from "@/lib/backend";
import { useRestQuery, useRestMutation } from "@/lib/restApi";
import {
  Activity,
  BarChart3,
  AlertTriangle,
  ArrowDownRight,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRightToLine,
  ArrowUpRight,
  CheckCircle2,
  Banknote,
  Bot,
  Brain,
  Crown,
  Gamepad2,
  KeyRound,
  LayoutDashboard,
  Lock,
  Pencil,
  Repeat,
  Save,
  Settings,
  Settings2,
  Loader2,
  LogOut,
  Megaphone,
  Moon,
  Radio,
  ScrollText,
  Search,
  Sparkles,
  Trash2,
  RefreshCw,
  Send,
  ShieldCheck,
  Sun,
  Users,
  Volume2,
  Wand2,
  FileText,
  SpellCheck,
  Wallet,
  Zap,
  FlaskConical,
  Layers,
  Power,
  PowerOff,
  Play,
  Bell,
  BookOpen,
  Database,
  Download,
  Wrench,
  Wifi,
  Globe,
  ExternalLink,
  Image as ImageIcon,
  ImagePlus,
  X,
  ChevronDown,
  SlidersHorizontal,
  TrendingUp,
  Coins,
  Flame,
  FolderKanban,
  Headphones,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

// Backend seam — every call site in this 7k-line panel goes through these
// three hooks. In VITE_BACKEND=rest builds they resolve through src/lib/restApi
// so the self-hosted server runs the EXACT same preview UI; on Convex the
// original react implementations are used unchanged.
function useQuery(reference: any, args: any): any {
  if (BACKEND === "rest") return useRestQuery(reference, args);
  const data: any = useConvexQuery(reference, args);
  if (getFunctionName(reference) !== "admin:riskAdvisor" || !data) return data;
  const score = Number(data.minScore ?? 35);
  const checks = { ...(data.checks ?? {}), minScoreOk: score >= 1 && score <= 100 };
  const summaryFa = String(data.summaryFa ?? "").includes("حداقل اسکور پایین")
    ? "حداقل امتیاز فقط یک فیلتر اولیه از بازهٔ ۱ تا ۱۰۰ است؛ اجماع، تأیید مستقل، داده تازه و گیت‌های ریسک همچنان اجباری‌اند."
    : data.summaryFa;
  return { ...data, checks, summaryFa };
}

// Keeps the existing mutation call sites compatible while allowing
// network-I/O functions to run as Actions (never allowed in Convex mutations).
function useMutation(reference: any): any {
  if (BACKEND === "rest") return useRestMutation(reference);
  const name = getFunctionName(reference);
  const backtestAction = useConvexAction(api.engineWorker.runBacktest);
  const eduAction = useConvexAction(api.learning.triggerEducation);
  const mutation = useConvexMutation(reference);
  if (name === "engineWorker:runBacktest") return backtestAction;
  if (name === "learning:triggerEducation") return eduAction;
  return mutation;
}

function useAction(reference: any): any {
  if (BACKEND === "rest") return useRestMutation(reference); // REST has one verb
  return useConvexAction(reference);
}
import { scheduleStrategyCategoryUi } from "@/lib/strategy-category-ui";
import { RiskAiReviewPanel } from "@/components/RiskAiReviewPanel";

type Lang = "en" | "fa";

type DictEntry = Record<string, any>;
const S: Record<Lang, DictEntry> = {
  en: {
    roleAdmin: "Admin",
    roleUser: "Trader",
    engineOnline: "ENGINE ONLINE",
    engineOffline: "OFFLINE",
    signOut: "Sign out",
    mode: "mode",
    live: "LIVE",
    demo: "PAPER",
    wallet: "Wallet balance",
    walletAsset: "asset · network",
    subscription: "Subscription",
    daysLeft: "days left",
    expired: "expired",
    renew: "Subscribe",
    portfolio: "Portfolio value",
    positionsOpen: "Open positions",
    floating: "floating P&L",
    warnDays: "Your subscription ends in {d} day(s). Renew now to keep access.",
    warnExpired: "Your subscription has expired. Renew to restore access.",
    positions: "Open positions",
    positionsEmpty: "No open positions — the pack is scanning.",
    short: "SHORT",
    long: "LONG",
    entry: "Entry",
    current: "Current",
    pnl: "P&L",
    sl: "SL",
    tp: "TP",
    lev: "Lev",
    score: "Score",
    confidence: "Conf",
    strategy: "Strategy",
    category: "Category",
    weight: "Weight",
    analysis: "Engine analysis",
    close: "Close",
    deposit: "Deposit",
    withdraw: "Withdraw",
    vip: "VIP plans",
    amount: "Amount (USDT)",
    txid: "TxID / receipt",
    address: "Withdraw address",
    network: "Network",
    submit: "Submit",
    pending: "pending",
    confirmed: "confirmed",
    failed: "failed",
    depositAddresses: "Deposit addresses",
    watch: "Market watch",
    watchSub: "Reference feed · forex, metals & crypto",
    symbol: "Symbol",
    market: "Market",
    last: "Last",
    change24: "24h",
    signals: "Recent signals",
    lessons: "Engine lessons",
    logs: "Engine log",
    tabOverview: "Overview",
    tabPositions: "Positions",
    tabUsers: "Users",
    tabWallet: "Wallet",
    tabVip: "VIP",
    tabMarkets: "Markets",
    tabStrategies: "Strategies",
    tabSettings: "Settings",
    tabExchanges: "Exchanges",
    tabNotifications: "Alerts",
    winRate: "Win rate",
    realized: "Realized P&L",
    closed: "closed trades",
    marketsWatched: "markets watched",
    strategiesArmed: "strategies armed",
    openSignals: "open signals",
    engine: "Engine",
    engineCapital: "Engine capital (USDT)",
    autonomous: "Autonomous trading",
    useAI: "AI review",
    tgEnabled: "Telegram",
    channelTrades: "Post trades",
    channelSignals: "Post signals",
    liveTrading: "Live trading",
    scanNow: "Scan now",
    save: "Save",
    saved: "Saved",
    newUser: "New user",
    username: "Username",
    password: "Password",
    name: "Name",
    role: "Role",
    enabled: "Enabled",
    blocked: "Blocked",
    actions: "Actions",
    enable: "Enable",
    block: "Block",
    makeAdmin: "Make admin",
    makeUser: "Make user",
    makeVip: "Make VIP",
    resetPass: "Reset pass",
    created: "created",
    transactions: "Transactions",
    review: "Review",
    confirm: "Confirm",
    reject: "Reject",
    depositAddr: "System deposit address",
    walletSettings: "Wallet settings",
    walletAddresses: "Deposit addresses (per network)",
    addAddress: "Add address",
    packages: "Packages",
    requests: "Subscription requests",
    approve: "Approve",
    capital: "Capital (USDT)",
    price: "Price",
    duration: "Duration",
    telegram: "Telegram",
    botToken: "Bot token",
    botUsername: "Bot username",
    adminId: "Owner numeric ID",
    sessionHours: "Session duration (hours)",
    assistantId: "Assistant numeric ID",
    channelId: "Channel numeric ID",
    channelUsername: "Channel username",
    inviteLink: "Channel invite link",
    risk: "Risk & capital",
    riskPerTrade: "Risk per trade (%)",
    maxLeverage: "Max leverage",
    minScore: "Min signal score",
    minConfidence: "Min confidence",
    minConsensus: "Min directional consensus",
    minConfirmations: "Min independent confirmations",
    stopOffsetATR: "Stop distance (ATR)",
    tp1ATR: "Target 1 distance (ATR)",
    tp2ATR: "Target 2 distance (ATR)",
    tp3ATR: "Target 3 distance (ATR)",
    scannerLimit: "Symbols per scan",
    maxPositions: "Legacy engine position cap",
    scanInterval: "Scan interval (min)",
    ai: "AI",
    aiProvider: "Provider",
    aiModel: "Model",
    aiKey: "API key",
    aiKey2: "Fallback API key",
    aiProvider2: "Secondary provider (fallback)",
    aiHint: "AI reviews signals, writes analysis and engine lessons. Keys are stored server-side.",
    exchangeSection: "Exchange / broker APIs",
    exchangeName: "Account name",
    provider: "Provider",
    apiKey: "API key",
    apiSecret: "API secret",
    passphrase: "Passphrase (optional)",
    accountId: "Account ID (optional)",
    environment: "Environment",
    addExchange: "Add account",
    notifications: "Alerts",
    notifEmpty: "No notifications yet",
    notifUnread: "unread",
    newAlert: "Send alert",
    alertType: "Type",
    alertTitle: "Title",
    alertText: "Text",
    broadcast: "Broadcast to all",
    sendAlert: "Send",
    status: "Status",
    tabRisk: "Risk",
    tabReports: "Reports",
    backtest: "Backtest",
    btSymbol: "Symbol",
    btTimeframe: "Timeframe",
    btRun: "Run backtest",
    btWindows: "Candles analyzed",
    btWinRate: "Win rate",
    btProfitFactor: "Profit factor",
    btAvgRr: "Avg RR",
    btAvgPnl: "Avg PnL %",
    btBestStrategies: "Best strategies",
    btNoData: "No stored candles yet — run the market feed first",
    btRunning: "Replaying candles through the engine…",
    tabSupport: "Support",
    tabReferral: "Referral",
    tabLogs: "Logs",
    emergency: "Emergency controls",
    emergencyStop: "Emergency stop",
    pauseTrades: "Pause new trades",
    closeAll: "Close all positions",
    closeAllConfirm: "Type \"ببند\" to confirm",
    riskPreset: "Risk preset",
    presetVeryLow: "Very low risk",
    presetLow: "Low risk",
    presetBalanced: "Balanced risk",
    presetHigh: "High risk",
    presetVeryHigh: "Very high risk",
    presetConservative: "Conservative",
    presetAggressive: "Aggressive",
    advisor: "AI risk advisor",
    advisorSummary: "Advisor summary",
    checkOk: "OK",
    virtualCapital: "Virtual capital (USDT)",
    realCapital: "Real exchange capital (USDT)",
    multiplier: "Order multiplier",
    maxExposure: "Max exposure (%)",
    maxPosition: "Max position size (%)",
    maxSymbolExposure: "Max per-symbol exposure (%)",
    maxDailyLoss: "Max daily loss (%)",
    maxDailyTrades: "Max daily trades",
    maxOpenPositions: "Max open positions",
    minRR: "Min risk/reward",
    maxScaleIn: "Max scale-in (DCA)",
    maxReentry: "Max re-entry",
    trailingStop: "Trailing stop",
    reportsPeriod: "Period",
    periodDaily: "Daily",
    periodWeekly: "Weekly",
    periodMonthly: "Monthly",
    periodAll: "All time",
    trades: "Trades",
    wins: "Wins",
    losses: "Losses",
    profitFactor: "Profit factor",
    grossProfit: "Gross profit",
    grossLoss: "Gross loss",
    maxDrawdown: "Max drawdown",
    bestStrategy: "Best strategy",
    worstStrategy: "Worst strategy",
    bestSymbol: "Best symbol",
    worstSymbol: "Worst symbol",
    newTicket: "New ticket",
    subject: "Subject",
    message: "Message",
    tickets: "Tickets",
    reply: "Reply",
    myTickets: "My tickets",
    referralCode: "Referral code",
    copy: "Copy",
    referralLink: "Referral link",
    referred: "Invited users",
    reward: "Rewards",
    logsFilter: "Level",
    details: "Details",
    positionDetails: "Position details",
    openTime: "Open time",
    closeTime: "Close time",
    closeReason: "Close reason",
    realizedPnl: "Realized P&L",
    unrealizedPnl: "Unrealized P&L",
    tradeType: "Trade type",
    exchange: "Exchange",
    fee: "Fee",
    expectedExit: "Expected exit",
    expectedProfit: "Expected profit",
    expectedDuration: "Expected duration",
    elapsed: "Elapsed",
    riskReward: "R/R",
    targets: "Targets",
    liquidation: "Liquidation",
    tabCoins: "Coins",
    coinsBalance: "Wolf coins",
    tomanBalance: "Toman wallet",
    usdtRate: "USDT rate",
    tomanPerCoin: "Coin price (toman)",
    coinPerHour: "Coins burned / hour",
    rewardProfile: "Profile task reward",
    rewardPrediction: "Prediction reward",
    rewardReferralNew: "Referral reward (new user)",
    rewardReferral: "Referral reward (0=off)",
    coinsEnabled: "Coin economy",
    coinSettings: "Coin economy settings",
    voucherCreate: "New voucher",
    voucherCode: "Voucher code",
    voucherCoins: "Coins per use",
    voucherUses: "Max uses",
    voucher: "Voucher",
    coinLedger: "Coin ledger",
    buyCoins: "Buy wolf coins",
    redeemVoucher: "Wolf-coin voucher",
    tasks: "Tasks & rewards",
    profileTask: "Complete your profile",
    prediction: "Predict the next candle",
    predictLong: "LONG",
    predictShort: "SHORT",
    predictionReward: "Reward",
    burnRate: "burn",
    sendToTelegram: "Send to Telegram",
    sendAllTg: "Send all open to Telegram",
    tfLabel: "TF",
    supportOnline: "Online support",
    supportVip: "VIP direct support",
    tomanDeposit: "Toman deposit (card-to-card)",
    tomanCard: "Card number",
    tomanHolder: "Card holder",
    tomanRef: "Tracking code",
    tomanNote: "Note",
    reason: "Reason",
    userDetail: "User account",
    adjustBalance: "Adjust balance",
    walletInfo: "Wallet & info",
    activity: "Activity",
    discount: "Discount %",
    giftCoins: "Gift coins",
    editPackage: "Edit package",
    livePrice: "Live price",
    totalPnl: "Total P&L",
    perf: "Strategy performance",
    myCoins: "My coins",
    refreshPerf: "Refresh performance",
    closedPositions: "Closed positions",
    usdtTomanRate: "USDT→Toman rate (1 USDT = ?)",
    supportBotUsername: "Support bot (@username)",
    supportVipUsername: "VIP support (@username)",
    vouchers: "Vouchers",
    create: "Create",
    timesUsed: "used",
    guessHint: "See the first 5 candles and guess: will the 6th candle be bullish (green) or bearish (red)? Guess right, earn coins! 🕯️",
    result: "Result",
    won: "Won",
    lost: "Lost",
    activeSession: "Active session",
    cost: "Cost",
    walletCard: "Card-to-card deposit info",
    burnUsage: "Coins are burned per minute while the dashboard is open.",
    predictionHistory: "Prediction history",
    quiz: "Trading Quiz",
    quizHint: "Answer a trading question correctly and earn coins! 🧠",
    quizStart: "Start quiz",
    quizSubmit: "Submit answer",
    quizCorrect: "Correct! 🎉",
    quizWrong: "Wrong answer!",
    type: "Type",
    deleteUser: "Delete user",
    deleteConfirm: "Delete this user and all of their records? This cannot be undone.",
    randomGen: "Random",
    aiAdvisor: "Wolf AI advisor",
    aiAskPlaceholder: "Ask about strategies, markets, risk, VIP…",
    aiUsage: "AI usage",
    testAi: "Test AI",
    learning: "Learning",
    streak: "Streak",
    referralEnabled: "Referral reward system",
    minCapital: "Min capital",
    commission: "Commission",
    commissionPct: "Commission % from profit",
    buyVip: "Buy subscription",
    buyPackage: "Buy package",
    closeTicket: "Close",
    lastSeen: "Last seen",
    registered: "Registered",
    tgProfile: "Telegram profile",
    features: "Features",
    profile: "Profile",
    profileSub: "Your account details and Telegram identity",
    editProfile: "Edit profile",
    nameField: "Name",
    familyField: "Last name",
    tgProfileLang: "Bot language",
    tgPhoneVerified: "Phone verified",
    tgChannelVerified: "Channel verified",
    genderField: "Gender",
    birthdayField: "Birthday",
    phoneField: "Phone number",
    memberSince: "Member since",
    telegramId: "Telegram ID",
    telegramUser: "Telegram username",
    passwordChange: "Change password",
    currentPassword: "Current password",
    newPassword: "New password",
    changePasswordBtn: "Update password",
    languageLabel: "Language",
    themeLabel: "Theme",
    aiCost: "Cost per question",
    aiCostHint: "Wolf coins are charged per AI question and refunded if the answer fails.",
    walletHistory: "Wallet history",
    dashWolf: "Wolf Dashboard",
    walletTab: "Wallet",
    fun: "Entertainment",
    depositWarn: "Send ONLY USDT on the selected network. Sending to the wrong network or address is irreversible — double-check before sending.",
    withdrawWarn: "Enter your own receiving address exactly. Wrong address or network = permanent loss of funds.",
    supportHere: "Support & tickets",
    engineAssets: "Engine assets",
    assetsSection: "Assets",
    shareTitle: "Your share of the engine",
    shareSub: "Profit equivalent to the capital you committed to the engine — your share of total engine capital.",
    shareContribution: "Committed capital",
    shareRatio: "Your share",
    shareTotal: "Total share",
    engineTotal: "Total engine capital",
    engaged: "Engaged (frozen)",
    freeze: "Frozen",
    available: "Available",
    unfreeze: "Unfreeze request",
    unfreezeHint: "Release USDT from the engine back to your withdrawable balance (admin approval).",
    connectTelegram: "Connect Telegram",
    tgConnected: "Telegram connected",
    tgConnectHint: "Link your Telegram account to this profile and earn wolf coins (one-time reward).",
    personalPnl: "Personal P&L",
    equivalent: "Equivalent",
    vipPanel: "View VIP panel",
    watchChart: "Chart & details",
    monthlyBurn: "Monthly burn",
    availableBalance: "Available balance",
    tgWithdrawConfirm: "One-time Telegram confirm",
    tgWithdrawHint: "Confirm once from Telegram to enable withdrawals.",
    tgVerifiedDone: "Telegram confirmed — withdrawals enabled.",
    referralUsers: "Referred users",
    tf: "TF",
    txStatus: "Status",
    txDate: "Date",
    noPasswordSet: "No password set yet — you can create one now.",
    profileRewardHint: "Complete your name and phone to claim the profile reward.",
    settingsTitle: "Account settings",
    misc: {
      yes: "Yes",
      no: "No",
      none: "—",
      days: "days",
      note: "Note",
    },
    emptyUsers: "No users yet.",
    emptyTx: "No transactions yet.",
    emptyReq: "No pending requests.",
    footer: "Trading Wolf AI · v1.3.0 · a private autonomous trading & market monitoring engine", 
  },
  fa: {
    roleAdmin: "مدیر",
    roleUser: "تریدر",
    engineOnline: "موتور آنلاین",
    engineOffline: "آفلاین",
    signOut: "خروج",
    mode: "حالت",
    live: "لایو",
    demo: "آزمایشی (بدون پول واقعی)",
    wallet: "موجودی کیف پول",
    walletAsset: "دارایی · شبکه",
    subscription: "اشتراک",
    daysLeft: "روز مانده",
    expired: "منقضی‌شده",
    renew: "خرید اشتراک",
    portfolio: "ارزش پرتفوی",
    positionsOpen: "پوزیشن‌های باز",
    floating: "سود/زیان شناور",
    warnDays: "اشتراک شما {d} روز دیگر تمام می‌شود. برای ادامه دسترسی تمدید کنید.",
    warnExpired: "اشتراک شما منقضی شده است. برای بازیابی دسترسی تمدید کنید.",
    positions: "پوزیشن‌های باز",
    positionsEmpty: "پوزیشن بازی وجود ندارد — گرگ‌ها در حال اسکن‌اند.",
    short: "فروش",
    long: "خرید",
    entry: "ورود",
    current: "لحظه‌ای",
    pnl: "سود/زیان",
    sl: "حد ضرر",
    tp: "هدف",
    lev: "اهرم",
    score: "امتیاز",
    confidence: "اطمینان",
    strategy: "استراتژی",
    category: "دسته‌بندی",
    weight: "وزن",
    analysis: "تحلیل موتور",
    close: "بستن",
    deposit: "واریز",
    withdraw: "برداشت",
    vip: "پلن‌های VIP",
    amount: "مبلغ (USDT)",
    txid: "TxID / رسید",
    address: "آدرس برداشت",
    network: "شبکه",
    submit: "ثبت",
    pending: "در انتظار",
    confirmed: "تأییدشده",
    failed: "ناموفق",
    depositAddresses: "آدرس‌های واریز",
    watch: "دیده‌بان بازار",
    watchSub: "فید مرجع · فارکس، فلزات و کریپتو",
    symbol: "نماد",
    market: "بازار",
    last: "آخرین",
    change24: "۲۴س",
    signals: "سیگنال‌های اخیر",
    lessons: "درس‌های موتور",
    logs: "لاگ موتور",
    tabOverview: "نمای کلی",
    tabPositions: "پوزیشن‌ها",
    tabUsers: "کاربران",
    tabWallet: "کیف پول",
    tabVip: "VIP",
    tabMarkets: "بازارها",
    tabStrategies: "استراتژی‌ها",
    tabSettings: "تنظیمات",
    tabExchanges: "صرافی‌ها",
    tabNotifications: "اعلان‌ها",
    winRate: "نرخ برد",
    realized: "سود محقق‌شده",
    closed: "معامله بسته‌شده",
    marketsWatched: "بازار تحت نظر",
    strategiesArmed: "استراتژی فعال",
    openSignals: "سیگنال باز",
    engine: "موتور",
    engineCapital: "سرمایه موتور (USDT)",
    autonomous: "معامله خودکار",
    useAI: "بازبینی هوش مصنوعی",
    tgEnabled: "تلگرام",
    channelTrades: "ارسال معامله",
    channelSignals: "ارسال سیگنال",
    liveTrading: "معامله لایو",
    scanNow: "اسکن فوری",
    save: "ذخیره",
    saved: "ذخیره شد",
    newUser: "کاربر جدید",
    username: "نام کاربری",
    password: "رمز عبور",
    name: "نام",
    role: "نقش",
    enabled: "فعال",
    blocked: "مسدود",
    actions: "عملیات",
    enable: "فعال",
    block: "مسدود",
    makeAdmin: "مدیر کن",
    makeUser: "کاربر کن",
    makeVip: "VIP کن",
    resetPass: "تغییر رمز",
    created: "ساخته شد",
    transactions: "تراکنش‌ها",
    review: "بررسی",
    confirm: "تأیید",
    reject: "رد",
    depositAddr: "آدرس واریز سیستم",
    walletSettings: "تنظیمات کیف پول",
    walletAddresses: "آدرس‌های واریز (به تفکیک شبکه)",
    addAddress: "افزودن آدرس",
    packages: "پکیج‌ها",
    requests: "درخواست‌های اشتراک",
    approve: "تأیید",
    capital: "سرمایه (USDT)",
    price: "قیمت",
    duration: "مدت",
    telegram: "تلگرام",
    botToken: "توکن ربات",
    botUsername: "یوزرنیم ربات",
    adminId: "آیدی عددی مدیر",
    sessionHours: "مدت نشست (ساعت)",
    assistantId: "آیدی عددی دستیار",
    channelId: "آیدی عددی کانال",
    channelUsername: "یوزرنیم کانال",
    inviteLink: "لینک دعوت کانال",
    risk: "ریسک و سرمایه",
    riskPerTrade: "ریسک هر معامله (%)",
    maxLeverage: "حداکثر اهرم",
    minScore: "حداقل امتیاز سیگنال",
    minConfidence: "حداقل اطمینان",
    minConsensus: "حداقل اجماع جهت‌دار",
    minConfirmations: "حداقل تأیید مستقل",
    stopOffsetATR: "فاصله حد ضرر (ATR)",
    tp1ATR: "فاصله هدف اول (ATR)",
    tp2ATR: "فاصله هدف دوم (ATR)",
    tp3ATR: "فاصله هدف سوم (ATR)",
    scannerLimit: "نماد در هر اسکن",
    maxPositions: "سقف قدیمی پوزیشن موتور",
    scanInterval: "فاصله اسکن (دقیقه)",
    ai: "هوش مصنوعی",
    aiProvider: "سرویس‌دهنده",
    aiModel: "مدل",
    aiKey: "کلید API",
    aiKey2: "کلید API دوم (پشتیبان)",
    aiProvider2: "پروایدر دوم (پشتیبان)",
    aiHint: "هوش مصنوعی سیگنال‌ها را بازبینی می‌کند، تحلیل و درس موتور را می‌نویسد. کلیدها سمت سرور ذخیره می‌شوند.",
    exchangeSection: "API صرافی / بروکر",
    exchangeName: "نام حساب",
    provider: "سرویس‌دهنده",
    apiKey: "کلید API",
    apiSecret: "کلید مخفی API",
    passphrase: "Passphrase (اختیاری)",
    accountId: "شناسه حساب (اختیاری)",
    environment: "محیط",
    addExchange: "افزودن حساب",
    notifications: "اعلان‌ها",
    notifEmpty: "هنوز اعلانی ندارید",
    notifUnread: "خوانده‌نشده",
    newAlert: "ارسال اعلان",
    alertType: "نوع",
    alertTitle: "عنوان",
    alertText: "متن",
    broadcast: "ارسال به همه",
    sendAlert: "ارسال",
    status: "وضعیت",
    tabRisk: "ریسک",
    tabReports: "گزارش‌ها",
    backtest: "بک‌تست موتور",
    btSymbol: "نماد",
    btTimeframe: "تایم‌فریم",
    btRun: "اجرای بک‌تست",
    btWindows: "کندل‌های تحلیل‌شده",
    btWinRate: "نرخ برد",
    btProfitFactor: "فاکتور سود",
    btAvgRr: "میانگین RR",
    btAvgPnl: "میانگین سود %",
    btBestStrategies: "بهترین استراتژی‌ها",
    btNoData: "کندلی ذخیره نشده — ابتدا فید بازار را اجرا کنید",
    btRunning: "در حال بازپخش کندل‌ها در موتور…",
    tabSupport: "پشتیبانی",
    tabReferral: "دعوت",
    tabLogs: "لاگ‌ها",
    emergency: "کنترل‌های اضطراری",
    emergencyStop: "توقف اضطراری",
    pauseTrades: "توقف معاملات جدید",
    closeAll: "بستن همه پوزیشن‌ها",
    closeAllConfirm: "برای تأیید عبارت «ببند» را بنویس",
    riskPreset: "پیش‌تنظیم ریسک",
    presetVeryLow: "کمترین ریسک",
    presetLow: "ریسک کم",
    presetBalanced: "ریسک متوازن",
    presetHigh: "ریسک زیاد",
    presetVeryHigh: "بیشترین ریسک",
    presetConservative: "کم‌خطر",
    presetAggressive: "تهاجمی",
    advisor: "مشاور ریسک هوشمند",
    advisorSummary: "خلاصه مشاور",
    checkOk: "سالم",
    virtualCapital: "سرمایه مجازی (USDT)",
    realCapital: "سرمایه واقعی صرافی (USDT)",
    multiplier: "ضریب سفارش",
    maxExposure: "حداکثر در معرض بودن (٪)",
    maxPosition: "حداکثر حجم هر پوزیشن (٪)",
    maxSymbolExposure: "حداکثر در معرض بودن هر نماد (٪)",
    maxDailyLoss: "سقف ضرر روزانه (٪)",
    maxDailyTrades: "حداکثر معامله روزانه",
    maxOpenPositions: "حداکثر پوزیشن باز",
    minRR: "حداقل ریسک/بازده",
    maxScaleIn: "حداکثر ورود پله‌ای (DCA)",
    maxReentry: "حداکثر ورود مجدد",
    trailingStop: "حد ضرر شناور",
    reportsPeriod: "بازه گزارش",
    periodDaily: "روزانه",
    periodWeekly: "هفتگی",
    periodMonthly: "ماهانه",
    periodAll: "همه زمان‌ها",
    trades: "معاملات",
    wins: "برد",
    losses: "باخت",
    profitFactor: "ضریب سود",
    grossProfit: "سود ناخالص",
    grossLoss: "ضرر ناخالص",
    maxDrawdown: "حداکثر افت",
    bestStrategy: "بهترین استراتژی",
    worstStrategy: "ضعیف‌ترین استراتژی",
    bestSymbol: "بهترین نماد",
    worstSymbol: "ضعیف‌ترین نماد",
    newTicket: "تیکت جدید",
    subject: "موضوع",
    message: "پیام",
    tickets: "تیکت‌ها",
    reply: "پاسخ",
    myTickets: "تیکت‌های من",
    referralCode: "کد دعوت",
    copy: "کپی",
    referralLink: "لینک دعوت",
    referred: "کاربران دعوت‌شده",
    reward: "پاداش",
    logsFilter: "سطح",
    details: "جزئیات",
    positionDetails: "جزئیات پوزیشن",
    openTime: "زمان باز شدن",
    closeTime: "زمان بسته شدن",
    closeReason: "دلیل بستن",
    realizedPnl: "سود محقق‌شده",
    unrealizedPnl: "سود شناور",
    tradeType: "نوع معامله",
    exchange: "صرافی",
    fee: "کارمزد",
    expectedExit: "خروج پیش‌بینی",
    expectedProfit: "سود پیش‌بینی",
    expectedDuration: "مدت پیش‌بینی",
    elapsed: "گذشته",
    riskReward: "ریسک به بازده",
    targets: "اهداف",
    liquidation: "لیکوئید",
    tabCoins: "سکه‌ها",
    coinsBalance: "ولف‌کوین",
    tomanBalance: "کیف پول تومانی",
    usdtRate: "نرخ تتر",
    tomanPerCoin: "قیمت هر سکه (تومان)",
    coinPerHour: "کسر سکه در هر ساعت",
    rewardProfile: "پاداش تکمیل پروفایل",
    rewardPrediction: "پاداش حدس درست",
    rewardReferralNew: "پاداش دعوت (عضو جدید)",
    rewardReferral: "پاداش دعوت (۰=خاموش)",
    coinsEnabled: "اقتصاد سکه",
    coinSettings: "تنظیمات اقتصاد سکه",
    voucherCreate: "ساخت کد هدیه",
    voucherCode: "کد ووچر ولف‌کوین",
    voucherCoins: "سکه برای هر استفاده",
    voucherUses: "حداکثر استفاده",
    voucher: "کد هدیه",
    coinLedger: "دفتر سکه‌ها",
    buyCoins: "خرید ولف‌کوین",
    redeemVoucher: "ووچر ولف‌کوین",
    tasks: "تسک‌ها و پاداش‌ها",
    profileTask: "تکمیل پروفایل",
    prediction: "حدس کندل بعدی",
    predictLong: "صعودی",
    predictShort: "نزولی",
    predictionReward: "پاداش",
    burnRate: "کسر",
    sendToTelegram: "ارسال به تلگرام",
    sendAllTg: "ارسال همه پوزیشن‌ها به تلگرام",
    tfLabel: "TF",
    supportOnline: "پشتیبانی آنلاین",
    supportVip: "پشتیبانی مستقیم VIP",
    tomanDeposit: "واریز تومانی (کارت به کارت)",
    tomanCard: "شماره کارت",
    tomanHolder: "به نام",
    tomanRef: "کد پیگیری",
    tomanNote: "توضیح",
    reason: "دلیل",
    userDetail: "حساب کاربری",
    adjustBalance: "تغییر موجودی",
    walletInfo: "کیف پول و اطلاعات",
    activity: "فعالیت‌ها",
    discount: "تخفیف ٪",
    giftCoins: "سکه هدیه",
    editPackage: "ویرایش پکیج",
    livePrice: "قیمت لحظه‌ای",
    totalPnl: "سود/زیان کل",
    perf: "عملکرد استراتژی‌ها",
    myCoins: "سکه‌های من",
    refreshPerf: "به‌روزرسانی عملکرد",
    closedPositions: "پوزیشن‌های بسته",
    usdtTomanRate: "نرخ تتر به تومان (۱ تتر = ?)",
    supportBotUsername: "ربات پشتیبانی (@username)",
    supportVipUsername: "پشتیبانی VIP (@username)",
    vouchers: "کدهای هدیه",
    create: "ساخت",
    timesUsed: "استفاده",
    guessHint: "۵ کندل اول را ببین و حدس بزن کندل ششم صعودی (سبز) است یا نزولی (قرمز). درست حدس بزن، سکه بگیر! 🕯️",
    result: "نتیجه",
    won: "برد",
    lost: "باخت",
    activeSession: "سشن فعال",
    cost: "هزینه",
    walletCard: "اطلاعات واریز کارت‌به‌کارت",
    burnUsage: "هر دقیقه حضور در داشبورد، سکه کسر می‌شود.",
    predictionHistory: "تاریخچه حدس‌ها",
    quiz: "آزمون ترید",
    quizHint: "به یک سؤال تریدی درست جواب بده و سکه بگیر! 🧠",
    quizStart: "شروع آزمون",
    quizSubmit: "ثبت پاسخ",
    quizCorrect: "آفرین! درست بود 🎉",
    quizWrong: "جواب اشتباه بود!",
    type: "نوع",
    deleteUser: "حذف کاربر",
    deleteConfirm: "این کاربر و تمام سوابقش حذف شود؟ این عمل برگشت‌پذیر نیست.",
    randomGen: "تصادفی",
    aiAdvisor: "مشاور ولف‌ای‌آی",
    aiAskPlaceholder: "درباره استراتژی‌ها، بازارها، ریسک و VIP بپرس…",
    aiUsage: "مصرف هوش مصنوعی",
    testAi: "تست هوش مصنوعی",
    learning: "یادگیری موتور",
    streak: "پشت‌سرهم",
    referralEnabled: "سیستم پاداش دعوت",
    minCapital: "حداقل سرمایه",
    commission: "کارمزد",
    commissionPct: "درصد کارمزد از سود",
    buyVip: "خرید اشتراک",
    buyPackage: "خرید بسته",
    closeTicket: "بستن",
    lastSeen: "آخرین ورود",
    registered: "تاریخ عضویت",
    tgProfile: "پروفایل تلگرام",
    features: "امکانات",
    profile: "پروفایل",
    profileSub: "اطلاعات حساب و هویت تلگرام شما",
    editProfile: "ویرایش پروفایل",
    nameField: "نام",
    familyField: "نام خانوادگی",
    tgProfileLang: "زبان ربات",
    tgPhoneVerified: "تأیید شماره",
    tgChannelVerified: "عضو کانال",
    genderField: "جنسیت",
    birthdayField: "تاریخ تولد",
    phoneField: "شماره موبایل",
    memberSince: "تاریخ عضویت",
    telegramId: "آیدی عددی تلگرام",
    telegramUser: "یوزرنیم تلگرام",
    passwordChange: "تغییر رمز عبور",
    currentPassword: "رمز عبور فعلی",
    newPassword: "رمز عبور جدید",
    changePasswordBtn: "به‌روزرسانی رمز",
    languageLabel: "زبان",
    themeLabel: "تم",
    aiCost: "هزینه هر سؤال",
    aiCostHint: "به ازای هر سؤال از مشاور هوش مصنوعی سکه کسر می‌شود و در صورت خطا بازگردانده می‌شود.",
    walletHistory: "تاریخچه کیف پول",
    dashWolf: "داشبورد گرگ",
    walletTab: "کیف پول",
    fun: "سرگرمی",
    depositWarn: "فقط تتر (USDT) را روی همان شبکه‌ای که انتخاب کرده‌اید ارسال کنید. ارسال به شبکه یا آدرس اشتباه به‌صورت دائمی از بین می‌رود — قبل از ارسال دوباره چک کنید.",
    withdrawWarn: "آدرس دریافت را دقیق وارد کنید. آدرس یا شبکه اشتباه به معنای از دست رفتن دائمی وجه است.",
    supportHere: "پشتیبانی و تیکت‌ها",
    engineAssets: "دارایی موتور",
    assetsSection: "دارایی‌ها",
    shareTitle: "سهم شما از سود موتور",
    shareSub: "سود معادل آورده شما به موتور — بر اساس سهم سرمایه‌تان از کل سرمایه موتور محاسبه می‌شود.",
    shareContribution: "سرمایه شما در موتور",
    shareRatio: "سهم شما",
    shareTotal: "سهم کل",
    engineTotal: "کل سرمایه موتور",
    engaged: "درگیر (فریز)",
    freeze: "فریز",
    available: "قابل برداشت",
    unfreeze: "درخواست آزادسازی",
    unfreezeHint: "آزادسازی تتر از موتور به موجودی قابل برداشت شما (با تأیید مدیر).",
    connectTelegram: "اتصال تلگرام",
    tgConnected: "تلگرام متصل است",
    tgConnectHint: "حساب تلگرام خود را به این پروفایل وصل کنید و سکه ولف بگیرید (پاداش یک‌باره).",
    personalPnl: "سود شخصی",
    equivalent: "معادل",
    vipPanel: "مشاهده پنل VIP",
    watchChart: "چارت و جزئیات",
    monthlyBurn: "سوزاندن ماهانه",
    availableBalance: "موجودی قابل برداشت",
    tgWithdrawConfirm: "تایید یکباره از تلگرام",
    tgWithdrawHint: "برای فعال‌شدن برداشت، یک‌بار از داخل تلگرام تایید کنید.",
    tgVerifiedDone: "تایید تلگرام انجام شد — برداشت فعال است.",
    referralUsers: "کاربران دعوت‌شده",
    tf: "تایم‌فریم",
    txStatus: "وضعیت",
    txDate: "تاریخ",
    noPasswordSet: "هنوز رمز عبور ندارید — همین حالا بسازید.",
    profileRewardHint: "برای دریافت پاداش، نام و شماره موبایل خود را کامل کنید.",
    settingsTitle: "تنظیمات حساب",
    misc: {
      yes: "بله",
      no: "خیر",
      none: "—",
      days: "روز",
      note: "توضیح کاربر",
    },
    emptyUsers: "هنوز کاربری ثبت نشده.",
    emptyTx: "هنوز تراکنشی ثبت نشده.",
    emptyReq: "درخواست در انتظاری نیست.",
    footer: "تریدینگ ولف ای‌آی · نسخه ۱.۳.۰ · موتور خصوصی و خودکار معاملات و پایش لحظه‌ای بازار",
  },
};

function money(n?: number | null): string {
  scheduleStrategyCategoryUi();
  const v = n ?? 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pnlText(n?: number | null): string {
  const v = n ?? 0;
  return `${v >= 0 ? "+" : "-"}$${Math.abs(v).toFixed(2)}`;
}

function num(n?: number | null, digits = 2): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function timeAgo(ts?: number | null, lang: Lang = "en"): string {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return lang === "fa" ? "همین حالا" : "now";
  if (s < 3600) {
    const m = Math.floor(s / 60);
    return lang === "fa" ? `${m} دقیقه پیش` : `${m}m ago`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    return lang === "fa" ? `${h} ساعت پیش` : `${h}h ago`;
  }
  const d = Math.floor(s / 86400);
  return lang === "fa" ? `${d} روز پیش` : `${d}d ago`;
}

function logFa(message: string, lang: Lang): string {
  if (lang !== "fa") return message;
  const map: Record<string, string> = {
    "engine.scan": "اسکن موتور انجام شد",
    "engine.scan.noSetup": "سیگنال بالای آستانه پیدا نشد",
    "engine.scan.noMarkets": "بازار فعالی نیست — در تب بازارها فعال کنید",
    "engine.scan.noStrategies": "استراتژی فعالی نیست",
    "engine.dailyLossCap": "سقف ضرر روزانه فعال شد",
    "engine.dailyTradesCap": "سقف معاملات روزانه فعال شد",
    "engine.position.closed": "پوزیشن بسته شد",
    "engine.position.manual": "پوزیشن دستی باز شد",
    "engine.duplicatePositionClosed": "پوزیشن تکراری بسته شد",
    "engine.emergencyStop": "توقف اضطراری موتور",
    "engine.pauseNewTrades": "توقف معاملات جدید",
    "engine.control": "کنترل موتور",
    "ai.review.saved": "بازبینی هوش مصنوعی ذخیره شد",
    "ai.research.saved": "تحقیق بازار ذخیره شد",
    "ai.backtest.saved": "صحت‌سنجی هوش مصنوعی ذخیره شد",
    "ai.chat.asked": "سؤال از هوش مصنوعی",
    "wallet.deposit.request": "درخواست واریز",
    "wallet.withdraw.request": "درخواست برداشت",
    "wallet.commit": "انتقال به موتور",
    "wallet.unfreeze.request": "درخواست آزادسازی سرمایه",
    "vip.request": "درخواست اشتراک VIP",
    "notification.created": "اعلان ساخته شد",
    "settings.updated": "تنظیمات به‌روزرسانی شد",
    "admin.user.created": "کاربر جدید ساخته شد",
    "admin.user.toggle": "وضعیت کاربر تغییر کرد",
    "admin.position.closed": "پوزیشن توسط مدیر بسته شد",
    "admin.positions.bulk_sent_to_telegram": "ارسال پوزیشن‌ها به تلگرام",
  };
  for (const [k, v] of Object.entries(map)) {
    if (message.startsWith(k)) return message.replace(k, v);
  }
  return message;
}

function Side({ side }: { side?: string }) {
  const isLong = side === "long";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${isLong ? "text-emerald-400" : "text-red-400"}`}>
      {isLong ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {isLong ? "LONG" : "SHORT"}
    </span>
  );
}

function ThemeToggle() {
  const { token, updatePreferences } = useWolfAuth();
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    (typeof window !== "undefined" && (window.localStorage.getItem("wolf.theme") as "dark" | "light")) || "dark",
  );
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    window.localStorage.setItem("wolf.theme", theme);
    if (token) updatePreferences({ theme }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      className="inline-flex size-8 items-center justify-center rounded-md border border-border/70 bg-background/40 text-muted-foreground transition-colors hover:border-emerald-400/40 hover:text-emerald-300"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="border-border/70 bg-card/60">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1.5 text-xl font-bold tracking-tight tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function LevelPill({ level }: { level?: string }) {
  const map: Record<string, string> = {
    INFO: "text-emerald-300 border-emerald-400/30",
    WARNING: "text-amber-300 border-amber-400/30",
    ERROR: "text-red-300 border-red-400/30",
    CRITICAL: "text-red-300 border-red-400/50",
    TRADE: "text-emerald-200 border-emerald-400/40",
    AI: "text-cyan-300 border-cyan-400/30",
    SECURITY: "text-violet-300 border-violet-400/30",
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${map[level ?? "INFO"] ?? "text-muted-foreground border-border"}`}>
      {level ?? "INFO"}
    </span>
  );
}

function SliderField({ label, value, min, max, step, onChange }: { label: string; value?: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const scoreField = label === S.en.minScore || label === S.fa.minScore;
  const effectiveMin = scoreField ? 1 : min;
  const rawValue = scoreField && (Number(value) === 50 || Number(value) === 75) ? "35" : value;
  const n = Math.min(max, Math.max(effectiveMin, Number(rawValue ?? effectiveMin)));
  const isLegacy = label.toLowerCase().includes("legacy") || label.includes("قدیمی") || label.includes("Engine capital") || label.includes("سرمایه موتور") || label === S.en.maxPositions || label === S.fa.maxPositions;
  if (isLegacy) return null;
  return (
    <div className="space-y-1.5 rounded-md border border-border/50 bg-background/40 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="terminal-font font-bold tabular-nums text-emerald-300" dir="ltr">{n}</span>
      </div>
      <Slider min={effectiveMin} max={max} step={step} value={[n]} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

function PositionCard({ p, lang, onClose, onSendTg }: { p: any; lang: Lang; onClose?: (id: any) => void; onSendTg?: (id: any) => void }) {
  const s = S[lang];
  const a = p.analysis ?? {};
  const win = (p.pnl ?? 0) >= 0;
  const sl = p.stopLoss ?? 0;
  const tp = p.takeProfit ?? 0;
  const range = Math.abs(tp - sl) || 1;
  const cur = p.current ?? p.entry ?? 0;
  const progress = Math.min(100, Math.max(0, ((cur - sl) / range) * 100));
  const [showChart, setShowChart] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const rr = sl !== p.entry && p.entry ? Math.abs((tp - p.entry) / (p.entry - sl)) : 0;
  const elapsedMin = p.openTime ? Math.max(0, Math.round((Date.now() - p.openTime) / 60000)) : 0;
  const remainingMin = p.expectedDuration ? Math.max(0, Math.round(p.expectedDuration - elapsedMin)) : 0;
  const fmtDur = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h <= 0) return `${m}${lang === "fa" ? "د" : "m"}`;
    return `${h}${lang === "fa" ? "س" : "h"} ${m}${lang === "fa" ? "د" : "m"}`;
  };

  return (
    <Card className="border-border/70 bg-card/60">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CryptoIcon symbol={p.symbol} size="sm" />
          <span className="terminal-font text-lg font-bold tracking-tight">{fmtSym(p.symbol)}</span>
          <Badge variant="outline" className={`text-[10px] ${p.market === "crypto" ? "border-cyan-400/30 text-cyan-300" : "border-gold/30 text-gold"}`}>{p.market === "crypto" ? "Crypto" : "Forex"}</Badge>
          <Side side={p.side} />
          <Badge variant="outline" className="text-[10px]">{s.tfLabel}: {p.timeframe ?? "1m"} · {p.type ?? p.mode ?? "futures"}</Badge>
        </div>
        <span className={`terminal-font text-lg font-bold tabular-nums ${win ? "text-emerald-400" : "text-red-400"}`}>
          {pnlText(p.pnl)} <span className="text-xs opacity-70">({num(p.pnlPct, 2)}%)</span>
        </span>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <div className="grid grid-cols-3 gap-2 text-center md:grid-cols-6">
          {[
            [s.entry, num(p.entry, 5), "text-cyan-300"],
            [s.current, num(p.current, 5), "text-foreground"],
            [s.sl, num(p.stopLoss, 5), "text-red-300"],
            [s.tp, num(p.takeProfit, 5), "text-emerald-300"],
            [s.lev, `${num(p.leverage, 0)}x`, "text-amber-300"],
            [s.score, `${Math.round(p.score ?? 0)}`, "text-gold"],
          ].map(([k, v, tone]) => (
            <div key={String(k)} className="min-w-0 rounded-md border border-border/50 bg-background/40 px-1.5 py-2">
              <p className="truncate text-[10px] text-muted-foreground">{k}</p>
              <p className={`terminal-font mt-0.5 truncate text-sm font-semibold tabular-nums ${tone}`} dir="ltr">{v}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="flex items-center gap-1 rounded bg-cyan-400/10 px-1.5 py-0.5 text-cyan-300">
            🕐 {lang === "fa" ? "باز شده" : "opened"}: <span className="terminal-font tabular-nums" dir="ltr">{fmtDur(elapsedMin)}</span>
          </span>
          {p.expectedDuration ? (
            <span className="flex items-center gap-1 rounded bg-gold/10 px-1.5 py-0.5 text-gold">
              ⏳ {lang === "fa" ? "زمان تقریبی باقی‌مانده" : "est. remaining"}: <span className="terminal-font tabular-nums" dir="ltr">{fmtDur(remainingMin)}</span>
            </span>
          ) : null}
          {p.progress != null ? (
            <span className="flex items-center gap-1 rounded bg-emerald-400/10 px-1.5 py-0.5 text-emerald-300">
              {lang === "fa" ? "پیشرفت" : "progress"}: <span className="terminal-font tabular-nums" dir="ltr">{Math.round(p.progress)}%</span>
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {(() => {
            const qty = Number(p.quantity ?? 0);
            const e = Number(p.entry ?? 0);
            const slv = Number(p.stopLoss ?? 0);
            const tpv = Number(p.takeProfit ?? 0);
            if (!(qty > 0) || !(e > 0)) return null;
            const long = p.side !== "short";
            const maxLoss = Math.abs((long ? e - slv : slv - e)) * qty;
            const maxProfit = Math.abs((long ? tpv - e : e - tpv)) * qty;
            if (!(maxLoss > 0) && !(maxProfit > 0)) return null;
            return (
              <>
                <span className="flex items-center gap-1 rounded bg-red-400/10 px-1.5 py-0.5 text-red-300">
                  {lang === "fa" ? "حداکثر ضرر (SL)" : "Max loss (SL)"}: <b className="terminal-font tabular-nums" dir="ltr">{pnlText(-maxLoss)}</b>
                </span>
                <span className="flex items-center gap-1 rounded bg-emerald-400/10 px-1.5 py-0.5 text-emerald-300">
                  {lang === "fa" ? "سود هدف (TP)" : "Target profit (TP)"}: <b className="terminal-font tabular-nums" dir="ltr">{pnlText(maxProfit)}</b>
                </span>
                <span className="text-muted-foreground">{lang === "fa" ? "بدون احتساب کارمزد" : "before fees"}</span>
              </>
            );
          })()}
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span className="terminal-font" dir="ltr">SL {num(p.stopLoss, 5)}</span>
            <span className="terminal-font" dir="ltr">TP {num(p.takeProfit, 5)}</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
        {a && (a.structure || a.trend || a.momentum || a.entryReasonFa || a.entryReasonEn) && (
          <div className="rounded-md border border-border/50 bg-background/40 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-cyan-300">
              <Brain className="size-3.5" /> {s.analysis}
            </p>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {a.structure && <Badge variant="outline">{lang === "fa" ? "ساختار" : "structure"}: {a.structure}</Badge>}
              {a.trend && <Badge variant="outline">{lang === "fa" ? "روند" : "trend"}: {a.trend}</Badge>}
              {a.momentum && <Badge variant="outline">{lang === "fa" ? "مومنتوم" : "momentum"}: {a.momentum}</Badge>}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {lang === "fa" ? a.entryReasonFa : a.entryReasonEn || a.entryReasonFa}
            </p>
          </div>
        )}
        {p.strategyKeys?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {p.strategyKeys.map((k: string) => (
              <span key={k} className="terminal-font rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-300">{k}</span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {onSendTg && (
            <Button variant="outline" size="sm" className="flex-1 justify-center border-emerald-400/30 text-emerald-300" onClick={() => onSendTg(p.id)}>
              <Send className="me-1.5 size-3.5" /> {s.sendToTelegram}
            </Button>
          )}
          <Button variant="outline" size="sm" className="flex-1 justify-center border-cyan-400/30 text-cyan-300" onClick={() => setShowChart((v) => !v)}>
            <Activity className="me-1.5 size-3.5" /> {showChart ? (lang === "fa" ? "مخفی کردن چارت" : "Hide chart") : (lang === "fa" ? "نمایش چارت" : "Show chart")}
          </Button>
          <Button variant="outline" size="sm" className="flex-1 justify-center border-gold/30 text-gold" onClick={() => setShowDetails((v) => !v)}>
            <ShieldCheck className="me-1.5 size-3.5" /> {s.details}
          </Button>
        </div>
        {showChart && <LiveChart
          height={200}
          entry={p.entry}
          stopLoss={p.stopLoss}
          takeProfit={p.takeProfit}
          symbol={p.symbol}
          direction={p.side}
        />}
        {showDetails && (
          <div className="rounded-md border border-gold/20 bg-background/40 p-3 text-xs">
            <p className="mb-2 flex items-center gap-1.5 font-bold text-gold"><ShieldCheck className="size-3.5" /> {s.positionDetails}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                [s.openTime, new Date(p.openTime ?? Date.now()).toLocaleString(lang === "fa" ? "fa-IR" : "en-US")],
                [s.tradeType, p.type ?? p.mode ?? "futures"],
                [s.exchange, p.exchange ?? "—"],
                [s.riskReward, `${num(rr, 2)} R`],
                [s.confidence, `${Math.round((p.confidence ?? 0) * 100)}%`],
                [s.fee, money(p.fee)],
                [s.expectedExit, p.expectedExit ? num(p.expectedExit, 5) : "—"],
                [s.expectedProfit, money(p.expectedProfit)],
                [s.expectedDuration, p.expectedDuration ? `${p.expectedDuration} min` : "—"],
                [s.elapsed, `${elapsedMin} min`],
                [s.liquidation, p.liquidation ? num(p.liquidation, 5) : "—"],
                [s.status, p.status ?? "open"],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded border border-border/40 bg-background/50 px-2 py-1.5">
                  <p className="text-[10px] text-muted-foreground">{k}</p>
                  <p className="terminal-font mt-0.5 font-semibold tabular-nums" dir="ltr">{String(v)}</p>
                </div>
              ))}
            </div>
            {p.targets?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-[10px] text-muted-foreground">{s.targets}:</span>
                {p.targets.map((t: number, i: number) => (
                  <span key={i} className="terminal-font rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-300" dir="ltr">{num(t, 5)}</span>
                ))}
              </div>
            )}
          </div>
        )}
        {onClose && (
          <Button variant="outline" size="sm" className="text-red-300 hover:text-red-200" onClick={() => onClose(p.id)}>
            {s.close}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function MiniCandles({ data, overlays }: { data?: any[]; overlays?: Array<{ label: string; color: string; values: number[] }> }) {
  if (!data || data.length === 0) return null;
  const w = 560;
  const h = 120;
  const pad = 6;
  const highs = data.map((c) => c.h ?? c.c);
  const lows = data.map((c) => c.l ?? c.o);
  for (const o of overlays ?? []) for (const v of o.values) if (Number.isFinite(v)) highs.push(v);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const span = max - min || 1;
  const y = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const bw = w / data.length;
  const xAt = (i: number) => i * bw + bw / 2;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ direction: "ltr" }}>
      {data.map((c: any, i: number) => {
        const x = xAt(i);
        const up = (c.c ?? 0) >= (c.o ?? 0);
        const color = up ? "#34d399" : "#f87171";
        const bodyTop = y(Math.max(c.o ?? c.c, c.c ?? c.o));
        const bodyH = Math.max(1, Math.abs(y(c.o ?? c.c) - y(c.c ?? c.o)));
        return (
          <g key={i}>
            <line x1={x} y1={y(c.h ?? c.c)} x2={x} y2={y(c.l ?? c.o)} stroke={color} strokeWidth={1} />
            <rect x={x - bw * 0.28} y={bodyTop} width={bw * 0.56} height={bodyH} fill={color} rx={0.5} />
          </g>
        );
      })}
      {(overlays ?? []).map((o) => {
        const pts = o.values
          .map((v, i) => (Number.isFinite(v) ? `${xAt(i).toFixed(1)},${y(v).toFixed(1)}` : null))
          .filter(Boolean)
          .join(" ");
        return (
          <g key={o.label}>
            <polyline points={pts} fill="none" stroke={o.color} strokeWidth={1.4} strokeDasharray="4 2" opacity={0.9} />
            <text x={4} y={10} fontSize={8} fill={o.color} opacity={0.9}>{o.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Simple EMA series (period) over close prices — same length as input. */
function emaSeries(closes: number[], period: number): number[] {
  if (closes.length === 0 || period < 1) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = closes[0];
  for (let i = 0; i < closes.length; i++) {
    prev = i === 0 ? closes[0] : closes[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function UserDetailCard({ token, userId, lang, onClose, readOnly = false }: { token: string; userId: Id<"users">; lang: Lang; onClose: () => void; readOnly?: boolean }) {
  const s = S[lang];
  const detail = useQuery(api.admin.userDetail, { token, userId });
  const adjustBalance = useMutation(api.coins.adjustUserBalance);
  const updateAccount = useMutation(api.coins.updateUserAccount);
  const [adj, setAdj] = useState<Record<string, string>>({});
  const [adjReason, setAdjReason] = useState("");
  const [uname, setUname] = useState("");
  const [phone, setPhone] = useState("");
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [gender, setGender] = useState("");
  const [birthday, setBirthday] = useState("");
  const deleteUser = useMutation(api.admin.deleteUser);
  const u = detail?.user;

  const doDeleteUser = async () => {
    if (!window.confirm(s.deleteConfirm)) return;
    try {
      await deleteUser({ token, userId });
      toast.success(s.saved);
      onClose();
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  useEffect(() => {
    if (u) {
      setUname(u.username ?? "");
      setPhone(u.phone ?? "");
      setFname(u.firstName ?? "");
      setLname(u.lastName ?? "");
      setGender(u.gender ?? "");
      setBirthday(u.birthday ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, u?.username]);

  const doAdjust = async (currency: "usdt" | "toman" | "wolf", deduct = false) => {
    let delta = parseFloat(adj[currency] ?? "");
    if (deduct && Number.isFinite(delta) && delta > 0) delta = -delta;
    if (!Number.isFinite(delta) || delta === 0) return toast.error(s.amount);
    try {
      await adjustBalance({ token, userId, currency, delta, reason: adjReason.trim() || "admin" });
      toast.success(s.saved);
      setAdj((a) => ({ ...a, [currency]: "" }));
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doUpdate = async () => {
    try {
      await updateAccount({
        token,
        userId,
        username: uname.trim() || undefined,
        phone: phone.trim() || undefined,
        firstName: fname.trim() || undefined,
        lastName: lname.trim() || undefined,
        gender: gender.trim() || undefined,
        birthday: birthday.trim() || undefined,
      });
      toast.success(s.saved);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  if (!detail) {
    return (
      <Card className="border-emerald-400/25 bg-card/60">
        <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {s.userDetail}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-emerald-400/25 bg-card/70">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <ShieldCheck className="size-4 text-emerald-400" /> {s.userDetail}
            <Badge variant="outline" className="text-[10px]">{u?.role ?? "user"}</Badge>
            {u?.isVip ? <Badge className="text-[10px]">VIP · {u?.vipPackage ?? ""}</Badge> : null}
          </CardTitle>
          <CardDescription className="mt-1">
            <span dir="ltr" className="terminal-font">@{u?.username ?? "—"}</span>
            {u?.tgId ? <span className="ms-2 terminal-font" dir="ltr">TG {u.tgId}</span> : null}
            {u?.phone ? <span className="ms-2" dir="ltr">{u.phone}</span> : null}
          </CardDescription>
        </div>
        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={onClose}>✕</Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["USDT", detail.balances.usdt, "text-emerald-300"],
            ["تومان / Toman", detail.balances.toman, "text-gold"],
            [s.coinsBalance, detail.balances.wolfCoins, "text-cyan-300"],
          ].map(([label, val, tone]) => (
            <div key={String(label)} className="rounded-md border border-border/50 bg-background/40 p-2.5">
              <p className="text-[10px] text-muted-foreground">{label}</p>
              <p className={`terminal-font mt-0.5 text-lg font-bold tabular-nums ${tone}`} dir="ltr">{Number(val).toLocaleString("en-US")}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {s.realizedPnl}: <span dir="ltr" className="terminal-font">{money(detail.balances.realizedPnl)}</span>
          {u?.vipExpiresAt ? <> · VIP تا <span dir="ltr">{new Date(u.vipExpiresAt).toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US")}</span></> : null}
          {u?.enabled === false ? <> · <span className="text-red-300">{s.blocked}</span></> : null}
        </p>

        <div className="grid gap-3 lg:grid-cols-2">
          {!readOnly && (
          <div className="space-y-2 rounded-md border border-border/50 bg-background/40 p-3">
            <p className="text-xs font-bold text-emerald-300">{s.adjustBalance}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(["usdt", "toman", "wolf"] as const).map((cur) => (
                <Input
                  key={cur}
                  dir="ltr"
                  placeholder={cur}
                  className="h-8 text-xs"
                  value={adj[cur] ?? ""}
                  onChange={(e) => setAdj((a) => ({ ...a, [cur]: e.target.value }))}
                />
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input dir="ltr" placeholder={`${s.reason}…`} className="h-8 flex-1 text-xs" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />
              {(["usdt", "toman", "wolf"] as const).map((cur) => (
                <Button key={cur} size="sm" className="h-8 shrink-0 px-2 text-[11px]" onClick={() => doAdjust(cur)}>{cur}</Button>
              ))}
              <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "کسر: عدد را منفی وارد کنید یا دکمه کسر را بزنید — مثلاً 10- یعنی ۱۰ واحد کسر" : "Deduct: enter a negative number or use the deduct button — e.g. -10 means deduct 10"}</p>
              <div className="flex gap-1.5">
                {(["usdt", "toman", "wolf"] as const).map((cur) => (
                  <Button key={cur} size="sm" variant="destructive" className="h-8 flex-1 px-2 text-[11px]" onClick={() => doAdjust(cur, true)}>− {lang === "fa" ? "کسر" : "Deduct"} {cur}</Button>
                ))}
              </div>
            </div>
          </div>
          )}
          {!readOnly && (
          <div className="space-y-2 rounded-md border border-border/50 bg-background/40 p-3">
            <p className="text-xs font-bold text-cyan-300">{s.profileField}</p>
            <div className="grid grid-cols-2 gap-1.5">
              <Input dir="ltr" placeholder={s.username} className="h-8 text-xs" value={uname} onChange={(e) => setUname(e.target.value)} />
              <Input dir="ltr" placeholder={s.phoneField} className="h-8 text-xs" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Input dir="ltr" placeholder={s.nameField} className="h-8 text-xs" value={fname} onChange={(e) => setFname(e.target.value)} />
              <Input dir="ltr" placeholder={s.familyField} className="h-8 text-xs" value={lname} onChange={(e) => setLname(e.target.value)} />
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={s.genderField} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{lang === "fa" ? "مرد" : "Male"}</SelectItem>
                  <SelectItem value="female">{lang === "fa" ? "زن" : "Female"}</SelectItem>
                </SelectContent>
              </Select>
              <Input dir="ltr" placeholder={s.birthdayField} className="h-8 text-xs" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" className="w-full border-cyan-400/30 text-cyan-300" onClick={doUpdate}>{s.save}</Button>
          </div>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2 rounded-md border border-border/50 bg-background/40 p-3">
            <p className="text-xs font-bold text-gold">{s.tgProfile}</p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
              <span className="text-muted-foreground">TG ID</span><span className="terminal-font" dir="ltr">{u?.tgId ?? "—"}</span>
              <span className="text-muted-foreground">@tg</span><span className="terminal-font" dir="ltr">{u?.tgUsername ?? "—"}</span>
              <span className="text-muted-foreground">{s.lastSeen}</span><span>{timeAgo(u?.lastActivity, lang)}</span>
              <span className="text-muted-foreground">{s.registered}</span><span>{u?.registeredAt ? new Date(u.registeredAt).toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US") : "—"}</span>
              <span className="text-muted-foreground">{s.genderField}</span><span>{u?.gender ?? "—"}</span>
              <span className="text-muted-foreground">{s.birthdayField}</span><span dir="ltr">{u?.birthday ?? "—"}</span>
              <span className="text-muted-foreground">{s.tgProfileLang}</span><span>{u?.tgLanguage ?? u?.language ?? (lang === "fa" ? "فارسی" : "English")}</span>
              <span className="text-muted-foreground">{s.tgPhoneVerified}</span><span>{u?.phoneVerified ? "✅" : "—"}</span>
              <span className="text-muted-foreground">{s.tgChannelVerified}</span><span>{u?.channelVerified ? "✅" : "—"}</span>
            </div>
            {!readOnly && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Select value={u?.role ?? "user"} onValueChange={(v) => updateAccount({ token, userId, role: v }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message)))}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="vip">{s.makeVip}</SelectItem>
                  <SelectItem value="assistant">assistant</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
              <Input dir="ltr" type="number" placeholder={lang === "fa" ? "روز VIP" : "VIP days"} className="h-8 w-24 text-xs" onBlur={(e) => { const d = parseInt(e.target.value, 10); if (d > 0) updateAccount({ token, userId, vipExpiresAt: Date.now() + d * 86400000, vipPackage: u?.vipPackage ?? "basic" }).then(() => { toast.success(s.saved); e.target.value = ""; }).catch((err: any) => toast.error(String(err?.message))); }} />
              <Button size="sm" variant="destructive" className="h-8 gap-1 text-[11px]" onClick={doDeleteUser}><Trash2 className="size-3.5" /> {s.deleteUser}</Button>
            </div>
            )}
          </div>
          <div className="rounded-md border border-border/50 bg-background/40 p-3">
            <p className="mb-2 text-xs font-bold">{s.transactions}</p>
            <div className="max-h-40 space-y-1 overflow-auto">
              {(detail.transactions ?? []).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate">{t.type} · {t.asset}</span>
                  <span className={`terminal-font tabular-nums ${t.status === "confirmed" ? "text-emerald-300" : t.status === "failed" ? "text-red-300" : "text-amber-300"}`} dir="ltr">{num(t.amount)}</span>
                </div>
              ))}
              {(detail.transactions ?? []).length === 0 && <p className="py-3 text-center text-muted-foreground">{s.misc.none}</p>}
            </div>
          </div>
          <div className="rounded-md border border-border/50 bg-background/40 p-3">
            <p className="mb-2 text-xs font-bold">{s.coinLedger}</p>
            <div className="max-h-40 space-y-1 overflow-auto">
              {(detail.coinTransactions ?? []).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate">{reasonFa(t.reason, lang)}</span>
                  <span className={`terminal-font tabular-nums ${(t.delta ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{(t.delta ?? 0) >= 0 ? "+" : ""}{num(t.delta)}</span>
                </div>
              ))}
              {(detail.coinTransactions ?? []).length === 0 && <p className="py-3 text-center text-muted-foreground">{s.misc.none}</p>}
            </div>
          </div>
          <div className="rounded-md border border-border/50 bg-background/40 p-3">
            <p className="mb-2 text-xs font-bold">{s.activity}</p>
            <div className="max-h-40 space-y-1 overflow-auto">
              {(detail.auditLogs ?? []).map((l: any) => (
                <div key={l.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate" dir="ltr">{l.action}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(l.created, lang)}</span>
                </div>
              ))}
              {(detail.auditLogs ?? []).length === 0 && <p className="py-3 text-center text-muted-foreground">{s.misc.none}</p>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const NETWORKS = ["TRC20", "ERC20", "BEP20", "POLYGON", "SOL", "TON"];

function eduStratLabel(key: string, list: any[] | undefined, lang: Lang): string {
  const st = (list ?? []).find((x: any) => x.key === key);
  if (!st) return key;
  return lang === "fa" ? st.nameFa ?? st.name ?? key : st.name ?? key;
}

/** Persian labels for the wolf-coin / toman ledger reasons. */
function ticketShortId(id: string | undefined | null): string {
  return "T-" + String(id ?? "").replace(/[^A-Za-z0-9]/g, "").slice(-5).toUpperCase();
}

function reasonFa(reason: string, lang: Lang): string {
  if (lang === "fa") {
    const map: Record<string, string> = {
      deposit: "واریز",
      withdrawal: "برداشت",
      buy_coins: "خرید سکه",
      buy_package: "خرید بسته",
      voucher: "کد هدیه",
      reward_profile: "پاداش تکمیل پروفایل",
      reward_prediction: "پاداش حدس کندل",
      reward_referral: "پاداش دعوت",
      reward_referral_new: "پاداش عضویت با دعوت",
      burn: "کسر سکه (استفاده)",
      usage: "کسر سکه (استفاده)",
      admin: "تغییر توسط مدیر",
      ai_chat: "هزینه مشاور هوش مصنوعی",
      ai_refund: "بازگشت سکه (خطای هوش مصنوعی)",
      reward_telegram: "پاداش اتصال تلگرام",
    };
    return map[reason] ?? reason;
  }
  const map: Record<string, string> = {
    buy_coins: "coin purchase",
    buy_package: "package purchase",
    reward_profile: "profile reward",
    reward_prediction: "prediction reward",
    reward_referral: "referral reward",
    reward_referral_new: "referral signup reward",
    usage: "usage burn",
    burn: "usage burn",
    admin: "admin adjustment",
    ai_chat: "AI advisor cost",
    ai_refund: "AI error refund",
    reward_telegram: "Telegram connect reward",
  };
  return map[reason] ?? reason;
}

function telegramInitData(): string | null {
  if (typeof window === "undefined") return null;
  const tg = (window as unknown as {
    Telegram?: { WebApp?: { initData?: string } };
  }).Telegram?.WebApp;
  return typeof tg?.initData === "string" && tg.initData ? tg.initData : null;
}

// Shared provider list for admin AI selects (chat + settings).
const AI_PROVIDER_OPTIONS: Array<[string, string]> = [
  ["auto", "auto · مدیر"],
  ["random", "تصادفی (چرخشی)"],
  ["pollinations", "pollinations · keyless"],
  ["llm7", "llm7 · keyless"],
  ["kilo", "kilo · keyless"],
  ["ovhcloud", "ovhcloud · keyless"],
  ["gemini", "gemini"],
  ["openai", "openai"],
  ["anthropic", "anthropic"],
  ["openrouter", "openrouter"],
  ["groq", "groq"],
  ["cerebras", "cerebras"],
  ["mistral", "mistral"],
  ["nvidia", "nvidia · nim"],
  ["deepseek", "deepseek"],
  ["xai", "xai · grok"],
  ["hf", "huggingface"],
  ["githubmodels", "github models"],
  ["anyapi", "anyapi"],
  ["naga", "naga.ac"],
  ["chatanywhere", "chatanywhere"],
  ["opencodezen", "opencode zen"],
  ["kiro", "kiro · self-hosted"],
  ["nanobot", "nanobot · self-hosted"],
  ["apfel", "apfel · macOS on-device"],
  ["freeoneapi", "free-one-api · self-hosted"],
  ["webai", "webai · self-hosted"],
];

// Cron cadence defaults (reset buttons in Settings → Crons & maintenance).
const DEFAULT_CRON: Record<string, number> = {
  "engine.scanIntervalMinutes": 1,
  "engine.loopSeconds": 60,
  "markets.priceSeconds": 300,
  "markets.candleSeconds": 900,
  "markets.syncMinutes": 15,
  "markets.pricesMinutes": 5,
  "ai.rotationMinutes": 5,
  "chat.purgeHours": 6,
  "ai.learningReviewHours": 6,
  "learning.educationHourUTC": 4,
  "data.pruneHours": 12,
};

function UserPanel({ token }: { token: string }) {
  const { lang, setLang } = useI18n();
  const s = S[lang];
  const account = useQuery(api.admin.myAccount, { token });
  const positions = useQuery(api.admin.listOpenPositions, { token });
  const markets = useQuery(api.markets.listMarkets, {});
  const overview = useQuery(api.dashboard.overview, {});
  const packages = useQuery(api.admin.listVipPackages, {});
  const myTickets = useQuery(api.admin.listMyTickets, { token });
  const referral = useQuery(api.admin.myReferral, { token });
  const signals = useQuery(api.admin.mySignals, { token });
  const unlockSignal = useMutation(api.coins.unlockSignalDetail);
  const adminSendChatM = useMutation(api.telegram.adminSendChat);
  const coins = useQuery(api.coins.myCoins, { token });
  const predictions = useQuery(api.coins.myPredictions, { token });
  const userStrategies = useQuery(api.strategies.listStrategies, { enabledOnly: true });
  const myChats = useQuery(api.aiChat.myAiChats, { token });
  const education = useQuery(api.learning.publicEducation, { token });
  const setAiPref = useMutation(api.me.setAiPreference);
  const fundamentalNews = useQuery(api.admin.listFundamentalNews, {});
  const claimVipTrialM = useMutation(api.admin.claimVipTrial);
  const applyDiscountCodeM = useMutation(api.admin.applyDiscountCode);
  const [supportModalOpen, setSupportModalOpen] = useState(false);

  const submitDeposit = useMutation(api.admin.submitDeposit);
  const requestWithdrawal = useMutation(api.admin.requestWithdrawal);
  const requestUnfreeze = useMutation(api.admin.requestUnfreeze);
  const requestVip = useMutation(api.admin.requestVip);
  const createTicket = useMutation(api.admin.createTicket);
  const userReplyTicket = useMutation(api.admin.userReplyTicket);
  const applyReferral = useMutation(api.admin.applyReferral);
  const askWolfAi = useMutation(api.aiChat.askWolfAi);
  const speakTts = useAction(api.aiChat.speakText);
  const edgeTtsHealth = useAction(api.nodeCalls.edgeTtsHealth);
  const submitTomanDeposit = useMutation(api.coins.submitTomanDeposit);
  const buyWolfCoins = useMutation(api.coins.buyWolfCoins);
  const buyWolfCoinsWithUsdt = useMutation(api.coins.buyWolfCoinsWithUsdt);
  const buyCoinPackage = useMutation(api.coins.buyCoinPackage);
  const buyCoinPackageWithUsdt = useMutation(api.coins.buyCoinPackageWithUsdt);
  const swapUsdtToToman = useMutation(api.coins.swapUsdtToToman);
  const swapTomanToUsdt = useMutation(api.coins.swapTomanToUsdt);
  const finHistory = useQuery(api.coins.financialHistory, { token, limit: 100 });
  const redeemVoucher = useMutation(api.coins.redeemVoucher);
  const claimProfileReward = useMutation(api.coins.claimProfileReward);
  const burnCoins = useMutation(api.coins.burnCoins);
  const startPrediction = useMutation(api.coins.startPrediction);
  const resolvePrediction = useMutation(api.coins.resolvePrediction);
  const startQuizM = useMutation(api.coins.startQuiz);
  const resolveQuizM = useMutation(api.coins.resolveQuiz);
  const updatePrefs = useMutation(api.me.updatePreferences);
  const changeMyPassword = useMutation(api.me.changeMyPassword);
  const connectTelegram = useMutation(api.me.connectTelegram);
  const confirmWithdrawTg = useMutation(api.me.confirmWithdrawTelegram);

  const [tab, setTab] = useState<"home" | "arena" | "fun" | "wallet" | "profile" | "search">("home");
  const [searchQ, setSearchQ] = useState("");
  const searchRes = useQuery(api.admin.userSearch, token && searchQ.trim().length >= 2 ? { token, q: searchQ.trim() } : "skip");
  const [showVipPanel, setShowVipPanel] = useState(false);
  const [chartSym, setChartSym] = useState<string | null>(null);
  const [chartTf, setChartTf] = useState("15m");
  const [tgConnecting, setTgConnecting] = useState(false);
  const [tgConfirming, setTgConfirming] = useState(false);
  const [unfreezeAmount, setUnfreezeAmount] = useState("");
  const [commitAmount, setCommitAmount] = useState("");
  const [depAmount, setDepAmount] = useState("");
  const [depTxid, setDepTxid] = useState("");
  const [depNetwork, setDepNetwork] = useState("TRC20");
  const [wdAmount, setWdAmount] = useState("");
  const [wdAddress, setWdAddress] = useState("");
  const [wdNetwork, setWdNetwork] = useState("TRC20");
  const [swapMode, setSwapMode] = useState<"usdt_to_toman" | "toman_to_usdt">("usdt_to_toman");
  const [swapAmount, setSwapAmount] = useState("");
  const [buyCoinsCurrency, setBuyCoinsCurrency] = useState<"toman" | "usdt">("toman");
  const [vipCapital, setVipCapital] = useState<Record<string, string>>({});
  const [ticketForm, setTicketForm] = useState({ subject: "", message: "" });
  const [refCode, setRefCode] = useState("");
  const [myTicketReply, setMyTicketReply] = useState<Record<string, string>>({});
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const [aiQ, setAiQ] = useState("");
  const [aiPending, setAiPending] = useState(false);
  const [aiImg, setAiImg] = useState<string | null>(null);
  const [ttsPlaying, setTtsPlaying] = useState<string | null>(null);
  const [tomanAmount, setTomanAmount] = useState("");
  const [tomanRef, setTomanRef] = useState("");
  const [tomanNote, setTomanNote] = useState("");
  const [buyCoinsQty, setBuyCoinsQty] = useState("");
  const [voucherInput, setVoucherInput] = useState("");
  const [activePrediction, setActivePrediction] = useState<any>(null);
  const [activeQuiz, setActiveQuiz] = useState<any>(null);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [quizCategory, setQuizCategory] = useState<string>("all");
  const [predictionSymbol, setPredictionSymbol] = useState("BTCUSDT");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<Record<string, string>>({});
  const [pwForm, setPwForm] = useState({ current: "", next: "" });
  const [eduStrat, setEduStrat] = useState("");
  const [aiPrefProvider, setAiPrefProvider] = useState("auto");
  const [sigDetail, setSigDetail] = useState<any>(null);

  useEffect(() => {
    if (account?.profile?.aiProvider) setAiPrefProvider(account.profile.aiProvider);
  }, [account]);

  // coin burn heartbeat — every 60s while the dashboard is open
  useEffect(() => {
    const id = window.setInterval(() => {
      if (token) burnCoins({ token }).catch(() => {});
    }, 60000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const doUnlockSignal = async (sig: any) => {
    try {
      if (sig.unlocked) {
        // already purchased — show details (with chart) for free, no API call needed
        setSigDetail(sig);
        return;
      }
      const d = await unlockSignal({ token, signalId: sig.id });
      setSigDetail(d);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };
  const wallet = account?.wallet;
  const frozen = wallet?.frozen ?? 0;
  const vip = account?.vip;
  const daysLeft = vip?.daysLeft ?? 0;
  const hasActiveVip = Boolean(vip?.active);
  const userFloating = frozen > 0 ? (account?.share?.floatingPnl ?? 0) : 0;
  const userRealized = frozen > 0 ? (account?.share?.realizedPnl ?? 0) : 0;
  const floating = userFloating;
  const tomanRate = coins?.settings?.usdtTomanRate ?? 95000;
  const tomanPerCoin = coins?.settings?.tomanPerCoin ?? 5000;
  const monthlyBurn = coins?.settings?.monthlyBurn ?? 43200;
  const totalToman = (wallet?.balance ?? 0) * tomanRate + (coins?.toman ?? 0) + (coins?.wolfCoins ?? 0) * tomanPerCoin;
  const totalUsd = tomanRate > 0 ? totalToman / tomanRate : 0;
  const ea = account?.engineAssets ?? { capital: 0, engaged: 0, floatingPnl: 0, realizedPnl: 0 };
  const streak = useMemo(() => {
    let n = 0;
    for (const p of predictions ?? []) {
      if (p.status === "won") n++;
      else if (p.status === "lost") break;
    }
    return n;
  }, [predictions]);
  const addresses = account?.depositAddresses ?? [];
  const networks = Array.from(new Set(addresses.map((a: any) => a.network)));
  const selectedDepAddr = addresses.find((a: any) => a.network === depNetwork);
  const WITHDRAW_NETWORKS = ["TRC20", "BEP20", "TON"];
  const withdrawNetworks = WITHDRAW_NETWORKS;
  const tgVerified = Boolean(account?.profile?.withdrawTgVerifiedAt);
  const lockDays = account?.withdrawMinDays ?? 7;

  // keep the network selects on a network that actually has an address
  useEffect(() => {
    if (networks.length) {
      if (!networks.includes(depNetwork)) setDepNetwork(networks[0]);
    }
    if (!withdrawNetworks.includes(wdNetwork)) setWdNetwork(withdrawNetworks[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networks.join(","), withdrawNetworks.join(",")]);

  // unified transaction feed: USDT wallet + toman/wolf ledgers
  const allTx = useMemo(() => {
    const w = (account?.transactions ?? []).map((t: any) => ({
      key: "w" + t.id,
      created: t.created,
      currency: t.asset ?? "USDT",
      type: t.type,
      amount: t.amount,
      status: t.status,
      network: t.network,
      note: t.note,
      txid: t.txid,
    }));
    const c = (coins?.transactions ?? []).map((t: any) => ({
      key: "c" + t.id,
      created: t.created,
      currency: t.currency === "toman" ? "IRT" : "WOLF",
      type: (t.delta ?? 0) >= 0 ? "credit" : "debit",
      amount: Math.abs(t.delta ?? 0),
      status: "confirmed",
      network: "—",
      note: reasonFa(t.reason, lang),
    }));
    return [...w, ...c].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  }, [account, coins, lang]);

  const doDeposit = async () => {
    const amount = parseFloat(depAmount);
    if (!(amount > 0)) return toast.error(s.amount);
    try {
      await submitDeposit({ token, amount, txid: depTxid.trim() || undefined, network: depNetwork });
      toast.success(s.pending);
      setDepAmount("");
      setDepTxid("");
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doWithdraw = async () => {
    const amount = parseFloat(wdAmount);
    if (!(amount > 0)) return toast.error(s.amount);
    try {
      await requestWithdrawal({ token, amount, address: wdAddress.trim() || undefined, network: wdNetwork });
      toast.success(s.pending);
      setWdAmount("");
      setWdAddress("");
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doUnfreeze = async () => {
    const amount = parseFloat(unfreezeAmount);
    if (!(amount > 0)) return toast.error(s.amount);
    if (amount > frozen) return toast.error(lang === "fa" ? "مبلغ درگیر (فریز) کافی نیست" : "Not enough frozen balance");
    try {
      await requestUnfreeze({ token, amount });
      toast.success(s.pending);
      setUnfreezeAmount("");
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const commitToEngineM = useMutation(api.admin.commitToEngine);
  const doCommitToEngine = async () => {
    const amount = parseFloat(commitAmount);
    if (!(amount > 0)) return toast.error(s.amount);
    if (amount > (wallet?.balance ?? 0)) return toast.error(lang === "fa" ? "موجودی کافی نیست" : "Insufficient balance");
    try {
      await commitToEngineM({ token, amount });
      toast.success(lang === "fa" ? "به موتور منتقل شد ✓" : "Transferred to engine ✓");
      setCommitAmount("");
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doVip = async (pkg: any) => {
    try {
      await requestVip({ token, packageKey: pkg.key });
      toast.success(s.pending);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doTicket = async () => {
    if (!ticketForm.subject.trim() || !ticketForm.message.trim()) return toast.error(s.message);
    try {
      await createTicket({ token, subject: ticketForm.subject.trim(), message: ticketForm.message.trim() });
      toast.success(s.saved);
      setTicketForm({ subject: "", message: "" });
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doAskAi = async (overrideQ?: string) => {
    const q = (overrideQ ?? aiQ).trim();
    if (!q || aiPending) return;
    if ((coins?.wolfCoins ?? 0) < (coins?.settings?.aiCost ?? 0)) {
      return toast.error(lang === "fa" ? "سکه ولف کافی نیست" : "Not enough wolf coins");
    }
    setAiPending(true);
    try {
      await askWolfAi({ token, question: q, image: aiImg ?? undefined });
      setAiQ("");
      setAiImg(null);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setAiPending(false);
    }
  };

  // Writing Tools quick actions (theJayTea/WritingTools concept): run the
  // source text through the AI chain for proofreading / improvement / summary.
  // Source = current input, else the last completed AI answer.
  const doWritingTool = async (kind: "proofread" | "improve" | "summarize") => {
    const last = (myChats ?? []).find((c: any) => c.status === "done" && c.text);
    const src = (aiQ.trim() || String(last?.text ?? "")).trim();
    if (!src || aiPending) {
      return toast.error(lang === "fa" ? "ابتدا متنی بنویسید یا از آخرین پاسخ هوش مصنوعی استفاده کنید" : "Write some text first or use the last AI answer");
    }
    const fa = lang === "fa";
    const prompts: Record<string, string> = {
      proofread: fa
        ? `به‌عنوان ویراستار حرفه‌ای، این متن را از نظر گرامر، املا و نگارش اصلاح کن. فقط نسخه‌ی اصلاح‌شده را بنویس (بدون توضیح اضافه).\n\nمتن:\n${src}`
        : `Act as a professional editor. Proofread this text for grammar, spelling and punctuation. Output ONLY the corrected version.\n\nText:\n${src}`,
      improve: fa
        ? `این متن را بازنویسی و بهبود بده تا روان‌تر، حرفه‌ای‌تر و دقیق‌تر شود. فقط نسخه‌ی بهبودیافته را بنویس.\n\nمتن:\n${src}`
        : `Rewrite and improve this text to be smoother, more professional and clearer. Output ONLY the improved version.\n\nText:\n${src}`,
      summarize: fa
        ? `این متن را در ۳ تا ۵ جمله خلاصه کن و نکات کلیدی را نگه دار.\n\nمتن:\n${src}`
        : `Summarize this text in 3-5 sentences, keeping the key points.\n\nText:\n${src}`,
    };
    setAiQ(prompts[kind]);
    await doAskAi(prompts[kind]);
  };

  const playTts = async (c: any) => {
    if (!c?.text && !c?.audioBase64) return;
    if (ttsPlaying === c.id) {
      setTtsPlaying(null);
      return;
    }
    try {
      setTtsPlaying(c.id);
      let audioBase64 = c.audioBase64;
      let format = c.format ?? "mp3";
      if (!audioBase64) {
        const r: any = await speakTts({ token, text: String(c.text) });
        if (!r?.audioBase64) throw new Error(lang === "fa" ? "پاسخ صوتی دریافت نشد" : "no audio received");
        audioBase64 = r.audioBase64;
        format = r.format ?? "mp3";
      }
      const bin = atob(audioBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const mime = format === "mp3" ? "audio/mpeg" : `audio/${format ?? "mpeg"}`;
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setTtsPlaying(null); };
      audio.onerror = () => { URL.revokeObjectURL(url); setTtsPlaying(null); toast.error(lang === "fa" ? "پخش صدا ناموفق بود" : "Audio playback failed"); };
      await audio.play();
    } catch (e: any) {
      setTtsPlaying(null);
      toast.error(String(e?.message ?? "tts error"));
    }
  };

  const doConfirmWithdrawTg = async () => {
    const initData = telegramInitData();
    if (!initData) {
      return toast.error(lang === "fa" ? "این دکمه را از داخل مینی‌اپ تلگرام ربات باز کنید" : "Open this inside the Telegram Mini App");
    }
    setTgConfirming(true);
    try {
      await confirmWithdrawTg({ token, initData });
      toast.success(s.saved);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setTgConfirming(false);
    }
  };

  const doConnectTelegram = async () => {
    const initData = telegramInitData();
    if (!initData) {
      return toast.error(lang === "fa" ? "این بخش فقط داخل مینی‌اپ تلگرام ربات فعال است" : "This only works inside the Telegram Mini App");
    }
    setTgConnecting(true);
    try {
      const res: any = await connectTelegram({ token, initData });
      if (res?.reward > 0) toast.success(`+${res.reward} ${s.coinsBalance}`);
      else toast.success(s.saved);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setTgConnecting(false);
    }
  };

  const doRef = async () => {
    if (!refCode.trim()) return;
    const res: any = await applyReferral({ token, code: refCode.trim() }).catch((e: any) => ({ ok: false, reason: String(e?.message) }));
    if (res?.ok) { toast.success(s.saved); setRefCode(""); }
    else toast.error(lang === "fa" ? "کد دعوت معتبر نیست" : "Invalid referral code");
  };

  const doCopyRef = async () => {
    const code = referral?.code ?? "";
    if (!code) return toast.error(lang === "fa" ? "کد دعوتی ندارید" : "No referral code yet");
    try {
      await navigator.clipboard.writeText(code);
      toast.success(lang === "fa" ? "کد دعوت کپی شد 🐺" : "Referral code copied 🐺");
    } catch {
      toast.error(lang === "fa" ? "کپی ناموفق بود" : "Copy failed");
    }
  };

  const doTomanDeposit = async () => {
    const amount = Math.floor(parseFloat(tomanAmount));
    if (!(amount >= 10000)) return toast.error(lang === "fa" ? "حداقل مبلغ واریز ۱۰٬۰۰۰ تومان است" : "Minimum deposit is 10,000 toman");
    try {
      await submitTomanDeposit({ token, amount, ref: tomanRef.trim() || undefined, note: tomanNote.trim() || undefined });
      toast.success(s.pending);
      setTomanAmount(""); setTomanRef(""); setTomanNote("");
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doSwap = async () => {
    const amt = parseFloat(swapAmount);
    if (!(amt > 0)) return toast.error(s.amount);
    try {
      if (swapMode === "usdt_to_toman") {
        const res: any = await swapUsdtToToman({ token, usdtAmount: amt });
        toast.success(lang === "fa" ? `سواپ موفق: ${res.usdt} تتر ➔ ${(res.tomanReceived ?? 0).toLocaleString()} تومان` : `Swap successful: ${res.usdt} USDT ➔ ${(res.tomanReceived ?? 0).toLocaleString()} Toman`);
      } else {
        const res: any = await swapTomanToUsdt({ token, tomanAmount: amt });
        toast.success(lang === "fa" ? `سواپ موفق: ${(res.toman ?? 0).toLocaleString()} تومان ➔ ${res.usdtReceived} تتر` : `Swap successful: ${(res.toman ?? 0).toLocaleString()} Toman ➔ ${res.usdtReceived} USDT`);
      }
      setSwapAmount("");
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doBuyCoins = async () => {
    const coins2 = Math.floor(parseFloat(buyCoinsQty));
    if (!(coins2 > 0)) return toast.error(s.amount);
    try {
      if (buyCoinsCurrency === "usdt") {
        const res: any = await buyWolfCoinsWithUsdt({ token, coins: coins2 });
        toast.success(lang === "fa" ? `خرید با تتر موفق: +${res.coins} سکه (${res.usdtSpent} USDT)` : `Purchased +${res.coins} coins with ${res.usdtSpent} USDT`);
      } else {
        await buyWolfCoins({ token, coins: coins2 });
        toast.success(s.saved);
      }
      setBuyCoinsQty("");
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doRedeem = async () => {
    if (!voucherInput.trim()) return;
    const res: any = await redeemVoucher({ token, code: voucherInput.trim() }).catch((e: any) => ({ ok: false, reason: String(e?.message) }));
    if (res?.ok) { toast.success(`${res.coins} ${lang === "fa" ? "سکه اضافه شد" : "coins added"}`); setVoucherInput(""); }
    else toast.error(lang === "fa" ? "کد ووچر معتبر نیست" : "Invalid voucher code");
  };

  const doClaimProfile = async () => {
    const res: any = await claimProfileReward({ token }).catch((e: any) => ({ ok: false, reason: String(e?.message) }));
    if (res?.ok) toast.success(`+${res.coins} ${s.coinsBalance}`);
    else toast.error(lang === "fa" ? "ابتدا نام یا شماره موبایل خود را کامل کنید" : "Complete your name/phone first");
  };

  const doStartPrediction = async () => {
    try {
      const res: any = await startPrediction({ token, symbol: predictionSymbol });
      setActivePrediction(res);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doResolvePrediction = async (direction: "long" | "short") => {
    if (!activePrediction?.id) return;
    try {
      const res: any = await resolvePrediction({ token, predictionId: activePrediction.id, direction });
      if (res.won) toast.success(`+${res.reward} ${s.coinsBalance}`);
      else toast.error(lang === "fa" ? "حدس اشتباه بود" : "Wrong guess");
      setActivePrediction(null);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doStartQuiz = async (cat?: string) => {
    try {
      const chosenCat = cat ?? (quizCategory === "all" ? undefined : quizCategory);
      const res: any = await startQuizM({ token, category: chosenCat });
      setActiveQuiz(res);
      setQuizAnswer(null);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doResolveQuiz = async () => {
    if (!activeQuiz?.id || quizAnswer === null) return;
    try {
      const res: any = await resolveQuizM({ token, quizId: activeQuiz.id, chosen: quizAnswer });
      if (res.won) toast.success(`+${res.reward} ${s.coinsBalance}`);
      else toast.error(s.quizWrong);
      setActiveQuiz(null);
      setQuizAnswer(null);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const toggleEditProfile = () => {
    setProfileForm({
      name: account?.profile?.name ?? "",
      firstName: account?.profile?.firstName ?? "",
      lastName: account?.profile?.lastName ?? "",
      phone: account?.profile?.phone ?? "",
      gender: account?.profile?.gender ?? "",
      birthday: account?.profile?.birthday ?? "",
    });
    setEditingProfile((v) => !v);
  };

  const doSaveProfile = async () => {
    try {
      await updatePrefs({ token, ...profileForm });
      toast.success(s.saved);
      setEditingProfile(false);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doChangePassword = async () => {
    if (pwForm.next.length < 6) return toast.error(s.newPassword);
    try {
      await changeMyPassword({ token, currentPassword: pwForm.current || undefined, newPassword: pwForm.next });
      toast.success(s.saved);
      setPwForm({ current: "", next: "" });
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doSetLang = (l: "fa" | "en") => {
    setLang(l);
    updatePrefs({ token, language: l }).catch(() => {});
  };

  const doSetTheme = (t: "dark" | "light") => {
    document.documentElement.classList.toggle("light", t === "light");
    window.localStorage.setItem("wolf.theme", t);
    updatePrefs({ token, theme: t }).catch(() => {});
  };

  if (!account) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(daysLeft > 0 && daysLeft <= 3) || (vip?.isVip && daysLeft <= 0) ? (
        <div className="flex items-start gap-3 rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p>{daysLeft > 0 ? s.warnDays.replace("{d}", String(daysLeft)) : s.warnExpired}</p>
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/10 via-card/70 to-cyan-400/5 p-4 sm:p-5 shadow-sm">
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base sm:text-lg font-bold tracking-tight">
                {lang === "fa" ? (
                  <>سلام {(account?.profile?.name || account?.profile?.username || "گرگ عزیز").trim()} 🌙</>
                ) : (
                  <>Welcome back, {(account?.profile?.name || account?.profile?.username || "trader").trim()} 🌙</>
                )}
              </p>
              {hasActiveVip ? (
                <Badge className="border-gold/40 bg-gold/15 text-[10px] text-gold font-bold">
                  <Crown className="size-3 me-1 text-gold inline" /> VIP
                </Badge>
              ) : null}
              {streak > 0 ? (
                <Badge className="border-amber-400/40 bg-amber-400/10 text-[10px] text-amber-300 font-bold">
                  🔥 {streak}
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {Number(account?.wallet?.balance ?? 0) <= 0 && Number(account?.wallet?.frozen ?? 0) <= 0
                ? (lang === "fa" ? "هنوز مبلغی واریز نکرده‌اید — برای شروع و فعال‌سازی سود، از بخش کیف پول واریز کنید." : "No funds deposited yet — start from the wallet to begin.")
                : (lang === "fa" ? "موتور ۲۴/۷ فعال است و بهترین پوزیشن‌ها را لحظه‌ای شکار می‌کند." : "Engine 24/7 scanning active — tracking market setups.")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1.5">
              <span className="text-[11px] text-muted-foreground">{s.wallet}:</span>
              <span className="terminal-font font-bold text-sm tabular-nums text-emerald-300" dir="ltr">
                ${num(account?.wallet?.balance ?? 0, 2)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1.5">
              <Zap className="size-3.5 text-cyan-300" />
              <span className="terminal-font font-bold text-sm tabular-nums text-cyan-300" dir="ltr">
                {coins?.wolfCoins ?? 0}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Quick Action Pill Bar */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
            onClick={() => setTab("arena")}
          >
            <Brain className="size-3 text-emerald-400" /> {lang === "fa" ? "میدان هوش مصنوعی" : "AI Arena"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1 border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10"
            onClick={() => setTab("wallet")}
          >
            <Wallet className="size-3" /> {lang === "fa" ? "واریز سریع" : "Deposit"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1 border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10"
            onClick={() => { setTab("fun"); }}
          >
            <Sparkles className="size-3" /> {s.aiAdvisor}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1 border-gold/30 text-gold hover:bg-gold/10"
            onClick={() => { setTab("fun"); doStartQuiz(); }}
          >
            <Gamepad2 className="size-3" /> {s.quiz}
          </Button>
          {!hasActiveVip && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1 border-purple-400/30 text-purple-300 hover:bg-purple-400/10"
              onClick={() => { setTab("wallet"); }}
            >
              <Crown className="size-3" /> {s.buyVip}
            </Button>
          )}
        </div>
      </div>

      {/* Live Winning Ticker (Casino / High-Stakes Profits Stream) */}
      <LiveWinningTicker lang={lang} />

      {/* Floating Frozen Capital Banner */}
      <FrozenCapitalBanner
        frozen={frozen}
        floatingPnl={userFloating}
        realizedPnl={userRealized}
        shareRatio={account?.share?.ratio ? Math.round(account.share.ratio * 100) : 0}
        onUnfreeze={async (amt) => {
          await requestUnfreeze({ token, amount: amt });
          toast.success(s.pending);
        }}
        onCommit={async (amt) => {
          await commitToEngineM({ token, amount: amt });
          toast.success(lang === "fa" ? "به موتور معاملاتی منتقل شد ✓" : "Committed to engine ✓");
        }}
        availableBalance={wallet?.balance ?? 0}
        lang={lang}
      />

      {/* Desktop Tab Selector */}
      <div className="hidden sm:flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-1.5">
        <Button size="sm" variant={tab === "home" ? "default" : "ghost"} className="gap-1.5" onClick={() => setTab("home")}>
          <LayoutDashboard className="size-3.5" /> {s.dashWolf}
        </Button>
        <Button
          size="sm"
          variant={tab === "arena" ? "default" : "ghost"}
          className={`gap-1.5 transition-all ${tab === "arena" ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-black shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "text-emerald-400 hover:text-emerald-300"}`}
          onClick={() => setTab("arena")}
        >
          <Brain className="size-3.5" /> {lang === "fa" ? "میدان هوش مصنوعی" : "AI Arena"}
          <span className="ms-1 rounded bg-amber-400/25 px-1.5 py-0.2 text-[9px] font-black text-amber-300 border border-amber-400/30 animate-pulse">
            NEW 🔥
          </span>
        </Button>
        <Button size="sm" variant={tab === "wallet" ? "default" : "ghost"} className="gap-1.5" onClick={() => setTab("wallet")}>
          <Wallet className="size-3.5" /> {s.walletTab}
          <span className="ms-1 rounded bg-emerald-400/15 px-1.5 py-0.2 text-[10px] font-bold text-emerald-300" dir="ltr">
            ${num(account?.wallet?.balance ?? 0, 0)}
          </span>
        </Button>
        <Button size="sm" variant={tab === "fun" ? "default" : "ghost"} className="gap-1.5" onClick={() => setTab("fun")}>
          <Gamepad2 className="size-3.5" /> {s.fun}
          <span className="ms-1 rounded bg-cyan-400/15 px-1.5 py-0.2 text-[10px] font-bold text-cyan-300" dir="ltr">
            ⚡ {coins?.wolfCoins ?? 0}
          </span>
        </Button>
        <Button size="sm" variant={tab === "profile" ? "default" : "ghost"} className="gap-1.5" onClick={() => setTab("profile")}>
          <Users className="size-3.5" /> {s.profile}
        </Button>
      </div>

      {tab === "arena" ? (
        <div className="space-y-6">
          <MultiAgentArena token={token} lang={lang} />
        </div>
      ) : tab === "fun" ? (
        <div className="space-y-6">
          <Card className="border-emerald-500/30 bg-card/70 shadow-lg backdrop-blur-sm overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <TrendingUp className="size-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      {s.prediction}
                      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-400">
                        {lang === "fa" ? "کندل زنده لحظه‌ای" : "Live Candles"}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">{s.guessHint}</CardDescription>
                  </div>
                </div>
                {streak > 0 && (
                  <Badge className="border-gold/40 bg-gold/15 text-gold text-xs font-bold px-3 py-1">
                    🔥 {s.streak}: {streak} (+{Math.min(streak, 10)} {lang === "fa" ? "سکه بونوس" : "Bonus"})
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-semibold">{lang === "fa" ? "انتخاب جفت‌ارز:" : "Pair:"}</span>
                  <Select
                    value={predictionSymbol}
                    onValueChange={(sym) => {
                      setPredictionSymbol(sym);
                      void (async () => {
                        try {
                          const res: any = await startPrediction({ token, symbol: sym });
                          setActivePrediction(res);
                        } catch (e: any) {
                          toast.error(String(e?.message ?? "error"));
                        }
                      })();
                    }}
                  >
                    <SelectTrigger className="w-44 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "DOGEUSDT"].map((sym) => (
                        <SelectItem key={sym} value={sym}>
                          <div className="flex items-center gap-2">
                            <CryptoIcon symbol={sym} size="xs" />
                            <span>{sym}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-emerald-400 font-medium">
                    💰 {s.predictionReward}: +{coins?.settings?.rewardPrediction ?? 5} {lang === "fa" ? "ولف‌کوین" : "Coins"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1"
                    onClick={doStartPrediction}
                  >
                    <RefreshCw className="size-3" />
                    {lang === "fa" ? "کندل جدید" : "New Candle"}
                  </Button>
                </div>
              </div>

              {activePrediction ? (
                <div className="rounded-xl border border-border/60 bg-background/50 p-4 space-y-4 shadow-inner">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CryptoIcon symbol={activePrediction.symbol} size="sm" />
                      <span className="terminal-font text-base font-bold text-foreground" dir="ltr">
                        {fmtSym(activePrediction.symbol)}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {lang === "fa" ? "تایم‌فریم ۱ دقیقه" : "1m Timeframe"}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-emerald-400">
                      +{activePrediction.reward} {lang === "fa" ? "سکه جایزه" : "Reward"}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-card/60 border border-border/40">
                    <MiniCandles data={activePrediction.candles} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      size="lg"
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12 text-sm shadow-md transition-all hover:scale-[1.01]"
                      onClick={() => doResolvePrediction("long")}
                    >
                      <ArrowUpRight className="me-2 size-5" />
                      {lang === "fa" ? "حدس صعودی (LONG ▲)" : "Predict Bullish (LONG ▲)"}
                    </Button>
                    <Button
                      size="lg"
                      variant="destructive"
                      className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold h-12 text-sm shadow-md transition-all hover:scale-[1.01]"
                      onClick={() => doResolvePrediction("short")}
                    >
                      <ArrowDownRight className="me-2 size-5" />
                      {lang === "fa" ? "حدس نزولی (SHORT ▼)" : "Predict Bearish (SHORT ▼)"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-dashed border-border/60 bg-background/30 gap-3">
                  <p className="text-sm text-muted-foreground">{lang === "fa" ? "در حال دریافت دیتای کندل‌های بازار..." : "Fetching live candle data..."}</p>
                  <Button size="sm" onClick={doStartPrediction} className="gap-1.5">
                    <Play className="size-3.5" />
                    {lang === "fa" ? "شروع حدس کندل" : "Start Guessing"}
                  </Button>
                </div>
              )}
              {(predictions ?? []).length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">{s.predictionHistory}</p>
                  <div className="max-h-40 space-y-1 overflow-auto">
                    {(predictions ?? []).map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-background/30 px-2.5 py-1.5 text-[11px]">
                        <span className="terminal-font font-semibold" dir="ltr">{fmtSym(p.symbol)} · {p.direction ?? "—"}</span>
                        <span className={p.status === "won" ? "text-emerald-300" : p.status === "lost" ? "text-red-300" : "text-muted-foreground"}>
                          {p.status === "won" ? s.won : p.status === "lost" ? s.lost : p.status}
                        </span>
                        <span className="terminal-font tabular-nums">{p.status === "won" ? `+${p.reward}` : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-purple-400/20 bg-card/60">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-1.5 text-sm"><Brain className="size-4 text-purple-300" /> {s.quiz}</CardTitle>
                {streak > 0 && (
                  <Badge className="border-gold/40 bg-gold/15 text-gold text-[10px] font-bold">
                    🔥 {s.streak}: {streak} (+{Math.min(streak, 5)} {lang === "fa" ? "سکه بونوس" : "Bonus"})
                  </Badge>
                )}
              </div>
              <CardDescription>{s.quizHint}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-border/40 pb-2.5">
                <span className="text-[11px] text-muted-foreground font-semibold me-1">{lang === "fa" ? "دسته‌بندی:" : "Category:"}</span>
                {[
                  { key: "all", labelFa: "همه", labelEn: "All" },
                  { key: "price_action", labelFa: "پرایس اکشن", labelEn: "Price Action" },
                  { key: "smc", labelFa: "اسمارت مانی (SMC)", labelEn: "SMC" },
                  { key: "risk_management", labelFa: "مدیریت ریسک", labelEn: "Risk Mgmt" },
                  { key: "indicators", labelFa: "اندیکاتورها", labelEn: "Indicators" },
                  { key: "crypto", labelFa: "ارز دیجیتال", labelEn: "Crypto" },
                  { key: "forex", labelFa: "فارکس", labelEn: "Forex" },
                ].map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => { setQuizCategory(c.key); if (activeQuiz) doStartQuiz(c.key); }}
                    className={`rounded-md px-2 py-1 text-[10px] font-bold transition-all ${
                      quizCategory === c.key
                        ? "bg-purple-500/25 border border-purple-400/50 text-purple-200 shadow-sm"
                        : "bg-background/40 border border-border/50 text-muted-foreground hover:border-purple-400/30"
                    }`}
                  >
                    {lang === "fa" ? c.labelFa : c.labelEn}
                  </button>
                ))}
              </div>

              {!activeQuiz ? (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <p className="text-xs text-muted-foreground">
                    {lang === "fa"
                      ? "آماده‌اید مهارت معامله‌گری خود را بسنجید و ولف‌کوین پاداش بگیرید؟"
                      : "Ready to test your trading skills and earn wolf coins?"}
                  </p>
                  <Button size="sm" className="bg-purple-600 hover:bg-purple-500 text-white font-bold" onClick={() => doStartQuiz()}>
                    <Zap className="size-3.5 me-1 text-amber-300" />
                    {s.quizStart}
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border border-purple-400/30 bg-background/50 p-4 space-y-3 shadow-inner">
                  <div className="flex items-center justify-between border-b border-border/40 pb-2">
                    <Badge variant="outline" className="text-[10px] text-purple-300 border-purple-400/40">
                      {activeQuiz.category ? activeQuiz.category.toUpperCase().replace("_", " ") : "TRADING"}
                    </Badge>
                    <span className="terminal-font text-xs font-bold text-emerald-300">
                      +{activeQuiz.reward} 🪙 {streak > 0 ? `(+${Math.min(streak, 5)} 🔥)` : ""}
                    </span>
                  </div>
                  <p className="text-sm font-bold leading-relaxed">{lang === "fa" ? activeQuiz.question : activeQuiz.questionEn}</p>
                  <div className="space-y-2 pt-1">
                    {activeQuiz.options.map((opt: string, i: number) => (
                      <button
                        key={i}
                        className={`w-full rounded-md border p-3 text-xs text-start transition-all font-medium ${
                          quizAnswer === i
                            ? "border-purple-400 bg-purple-500/20 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                            : "border-border/60 bg-background/40 hover:border-purple-400/40 text-foreground"
                        }`}
                        onClick={() => setQuizAnswer(i)}
                      >
                        <span className="me-2 inline-flex size-5 items-center justify-center rounded-full bg-purple-400/15 text-[10px] font-bold text-purple-300">
                          {i + 1}
                        </span>
                        {opt}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <Button className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold" disabled={quizAnswer === null} onClick={doResolveQuiz}>
                      <CheckCircle2 className="size-4 me-1.5" />
                      {s.quizSubmit} · +{activeQuiz.reward} 🪙
                    </Button>
                    <Button size="sm" variant="ghost" className="text-muted-foreground text-xs" onClick={() => setActiveQuiz(null)}>
                      {lang === "fa" ? "انصراف" : "Cancel"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

<Card className="border-cyan-400/20 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm"><Sparkles className="size-4 text-cyan-300" /> {s.aiAdvisor}</CardTitle>
              <CardDescription>{lang === "fa" ? "🐺 ولف‌ای، هوش مصنوعی اختصاصی گرگ — برای هر سؤال بهترین هوش مصنوعی را انتخاب می‌کند تا همیشه سریع و دقیق جواب بدهد. پاسخ‌ها آموزشی‌اند و هرگز توصیه مالی نیستند." : "🐺 WOLF AI is your dedicated wolf assistant — it routes each question to the best AI so you always get a fast, accurate answer. Educational only, never financial advice."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-md border border-cyan-400/25 bg-cyan-400/5 px-2 py-1 text-cyan-300">{s.aiCost}: {coins?.settings?.aiCost ?? 0} {s.coinsBalance}</span>
                <span className="text-muted-foreground">{s.coinsBalance}: {coins?.wolfCoins ?? 0} · {s.aiCostHint}</span>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">{lang === "fa" ? "🐺 ولف‌ای به‌صورت خودکار بهترین هوش مصنوعیِ در دسترس را برای پاسخ شما انتخاب می‌کند — سکه ولف شما همین انتخاب هوشمند را فعال می‌کند. نام هوش مصنوعی پاسخ‌دهنده زیر هر جواب نمایش داده می‌شود و می‌توانید پاسخ را با صدا هم بشنوید." : "🐺 WOLF AI automatically routes your question to the best available AI engine — your wolf coins power this smart routing. The answering AI is shown under every reply, and you can listen to answers too."}</p>
              <div className="flex flex-wrap gap-1.5">
                <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border/50 text-muted-foreground transition hover:bg-card/60 hover:text-cyan-300" title={lang === "fa" ? "پیوست تصویر (برای هوش مصنوعی‌های دیداری)" : "Attach image (vision AIs)"}>
                  <ImagePlus className="size-4" />
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 4 * 1024 * 1024) { toast.error(lang === "fa" ? "حداکثر ۴ مگابایت" : "Max 4MB"); e.target.value = ""; return; } const rd = new FileReader(); rd.onload = () => setAiImg(String(rd.result)); rd.readAsDataURL(f); e.target.value = ""; }} />
                </label>
                {aiImg && (
                  <div className="flex w-full items-center gap-2 rounded-md border border-cyan-400/25 bg-cyan-400/5 p-1.5">
                    <img src={aiImg} alt="attach" className="h-10 w-10 rounded object-cover" />
                    <span className="flex-1 text-[10px] text-muted-foreground">{lang === "fa" ? "تصویر پیوست شد — برای هوش مصنوعی‌های دیداری ارسال می‌شود" : "Image attached — sent to vision AIs"}</span>
                    <button type="button" onClick={() => setAiImg(null)} className="rounded p-1 text-muted-foreground transition hover:text-red-300"><X className="size-3.5" /></button>
                  </div>
                )}
                <Input dir="ltr" placeholder={s.aiAskPlaceholder} className="min-w-40 flex-1" value={aiQ} onChange={(e) => setAiQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !aiPending) doAskAi(); }} />
                <Button className="shrink-0 gap-1.5" disabled={aiPending || (coins?.wolfCoins ?? 0) < (coins?.settings?.aiCost ?? 0)} onClick={() => doAskAi()}><Sparkles className="size-3.5" /> {s.ai}</Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">{lang === "fa" ? "ابزار نوشتن (منبع: متن فعلی یا آخرین پاسخ):" : "Writing tools (source: input or last answer):"}</span>
                <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" disabled={aiPending} onClick={() => doWritingTool("proofread")}><SpellCheck className="size-3" /> {lang === "fa" ? "اصلاح گرامر" : "Proofread"}</Button>
                <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" disabled={aiPending} onClick={() => doWritingTool("improve")}><Wand2 className="size-3" /> {lang === "fa" ? "بهبود متن" : "Improve"}</Button>
                <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" disabled={aiPending} onClick={() => doWritingTool("summarize")}><FileText className="size-3" /> {lang === "fa" ? "خلاصه" : "Summarize"}</Button>
              </div>
              <div className="max-h-56 space-y-1.5 overflow-auto">
                {(myChats ?? []).slice(0, 20).map((c: any) => (
                  <div key={c.id} className={`rounded-md border p-2 text-[11px] ${c.status === "error" ? "border-red-400/30 bg-red-400/5" : "border-border/50 bg-background/40"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-300">🐺 WOLF AI</span>
                      <span className="flex items-center gap-1.5">
                        {c.status === "done" && c.text ? (
                          <button type="button" title={lang === "fa" ? "پخش صدا (edge-tts)" : "Speak (edge-tts)"} disabled={ttsPlaying !== null && ttsPlaying !== c.id} onClick={() => playTts(c)} className="rounded border border-cyan-400/20 bg-cyan-400/5 p-0.5 text-cyan-300 transition hover:bg-cyan-400/15 disabled:opacity-40">
                            {ttsPlaying === c.id ? <Loader2 className="size-3 animate-spin" /> : <Volume2 className="size-3" />}
                          </button>
                        ) : null}
                        {c.status === "running" ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : <span className="text-[9px] text-muted-foreground">{timeAgo(c.created, lang)}</span>}
                      </span>
                    </div>
                    {c.status !== "running" && c.provider ? (
                      <div className="mt-0.5 flex items-center gap-1 text-[9px] text-cyan-400/70">
                        <span>{lang === "fa" ? "پاسخ از" : "answered by"}:</span>
                        <span className="rounded border border-cyan-400/20 bg-cyan-400/5 px-1 py-px font-bold">{({ pollinations: "Pollinations", llm7: "LLM7", kilo: "Kilo", ovhcloud: "OVHcloud", gemini: "Gemini", openai: "OpenAI", anthropic: "Anthropic", openrouter: "OpenRouter", groq: "Groq", cerebras: "Cerebras", mistral: "Mistral", nvidia: "NVIDIA NIM", deepseek: "DeepSeek", xai: "xAI Grok", hf: "Hugging Face", githubmodels: "GitHub Models", anyapi: "AnyAPI", naga: "Naga.ac", chatanywhere: "ChatAnywhere", opencodezen: "OpenCode Zen", kiro: "Kiro Gateway", nanobot: "nanobot", apfel: "apfel", webai: "WebAI", freeoneapi: "Free One API" } as Record<string, string>)[c.provider] ?? c.provider}</span>
                      </div>
                    ) : null}
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{c.status === "error" ? (c.error ?? s.misc.none) : c.text || "…"}</p>
                  </div>
                ))}
                {(myChats ?? []).length === 0 && <p className="py-6 text-center text-muted-foreground">{s.misc.none}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Engine lessons live in the admin panel only (per product decision). */}

          <Card className="border-gold/20 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm"><Sparkles className="size-4 text-gold" /> {lang === "fa" ? "آموزش استراتژی‌ها" : "Strategy education"}</CardTitle>
              <CardDescription>{lang === "fa" ? "هر استراتژی موتور را انتخاب کنید و توضیح ساده آن را بخوانید — یا از ولف‌ای‌آی بخواهید آن را آموزش دهد." : "Pick any engine strategy, read a plain-language summary — or ask Wolf AI to teach it to you."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={eduStrat} onValueChange={setEduStrat}>
                  <SelectTrigger className="w-56"><SelectValue placeholder={lang === "fa" ? "انتخاب استراتژی…" : "Select a strategy…"} /></SelectTrigger>
                  <SelectContent>
                    {(userStrategies ?? []).map((st: any) => <SelectItem key={st.key} value={st.key}>{lang === "fa" ? st.nameFa : st.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="gap-1.5 border-cyan-400/30 text-cyan-300" disabled={!eduStrat} onClick={() => { setTab("fun"); setAiQ(lang === "fa" ? `استراتژی «${eduStratLabel(eduStrat, userStrategies, lang)}» را به زبان ساده آموزش بده: شرایط ورود، خروج، حد ضرر و خطاهای رایج` : `Teach me the "${eduStratLabel(eduStrat, userStrategies, lang)}" strategy in plain words: entry rules, exit rules, stop loss and common mistakes`); toast.success(s.aiAdvisor); }}>
                  <Sparkles className="size-3.5" /> {s.aiAdvisor}
                </Button>
              </div>
              {eduStrat && (() => {
                const st = (userStrategies ?? []).find((x: any) => x.key === eduStrat);
                if (!st) return null;
                return (
                  <div className="rounded-md border border-border/50 bg-background/40 p-3 text-xs">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{lang === "fa" ? st.nameFa : st.name}</span>
                      <Badge variant="outline" className="text-[10px]">{st.category}</Badge>
                      <span className="text-[10px] text-muted-foreground">{st.market ?? ""} · {st.timeframes ? (Array.isArray(st.timeframes) ? st.timeframes.join(", ") : st.timeframes) : ""}</span>
                    </p>
                    <p className="mt-1.5 text-muted-foreground">{lang === "fa" ? st.descriptionFa : st.descriptionEn}</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      ) : tab === "profile" ? (
        <div className="space-y-6">
          {/* ── profile / identity ─────────────────────────────────────── */}
          <Card className="border-border/70 bg-gradient-to-br from-card via-card to-emerald-500/5">
            <CardContent className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-xl font-black text-emerald-300">
                  {((account?.profile?.name ?? account?.profile?.firstName ?? "🐺")[0] ?? "🐺").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold tracking-tight">{account?.profile?.name || account?.profile?.firstName || account?.profile?.username || "—"}</h2>
                    {account?.profile?.isVip ? <Badge className="border-gold/40 bg-gold/10 text-[10px] text-gold"><Crown className="size-3" /> VIP</Badge> : null}
                    <Badge variant="outline" className="text-[10px]">{account?.profile?.role}</Badge>
                    {account?.profile?.tgId ? (
                      <Badge className="border-sky-400/40 bg-sky-400/10 text-[10px] text-sky-300"><Bot className="size-3" /> {s.tgConnected}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span dir="ltr">@{account?.profile?.username || "—"}</span>
                    {account?.profile?.phone ? <span className="terminal-font" dir="ltr">{account?.profile?.phone}</span> : null}
                    {account?.profile?.tgUsername ? <span dir="ltr">✈️ @{account?.profile?.tgUsername}</span> : null}
                    {account?.profile?.tgId ? <span className="terminal-font" dir="ltr">TG: {account?.profile?.tgId}</span> : null}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{s.memberSince}: {account?.profile?.registeredAt ? new Date(account.profile.registeredAt).toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US") : "—"}</span>
                    <span>{s.lastSeen}: {timeAgo(account?.profile?.lastActivity, lang)}</span>
                    <span>{s.daysLeft}: {hasActiveVip ? daysLeft : "—"}</span>
                    {account?.profile?.gender ? <span>{s.genderField}: {account.profile.gender}</span> : null}
                    {account?.profile?.birthday ? <span>{s.birthdayField}: {account.profile.birthday}</span> : null}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {!account?.profile?.tgId ? (
                    <Button size="sm" variant="outline" className="gap-1.5 border-sky-400/30 text-sky-300" disabled={tgConnecting} onClick={doConnectTelegram}>
                      <Bot className="size-3.5" /> {tgConnecting ? <Loader2 className="size-3.5 animate-spin" /> : null} {s.connectTelegram} +{coins?.settings?.rewardTelegram ?? 25}
                    </Button>
                  ) : null}
                  {hasActiveVip ? (
                    <Button size="sm" variant="outline" className="gap-1.5 border-gold/40 text-gold" onClick={() => setShowVipPanel((v) => !v)}>
                      <Crown className="size-3.5" /> {s.vipPanel}
                    </Button>
                  ) : null}
                  {!coins?.profileRewardClaimed ? (
                    <Button size="sm" variant="outline" className="gap-1.5 border-gold/30 text-gold" onClick={doClaimProfile}>
                      <Sparkles className="size-3.5" /> {s.profileTask} +{coins?.settings?.rewardProfile ?? 10}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" className="gap-1.5 border-emerald-400/30 text-emerald-300" onClick={toggleEditProfile}>
                    <Pencil className="size-3.5" /> {s.editProfile}
                  </Button>
                </div>
              </div>

              {!account?.profile?.tgId && (
                <p className="mt-3 rounded-md border border-sky-400/20 bg-sky-400/5 p-2.5 text-[11px] text-sky-300/90">{s.tgConnectHint}</p>
              )}

              {editingProfile && (
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <div><Label className="text-xs text-muted-foreground">{s.nameField}</Label><Input value={profileForm.name ?? ""} onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))} /></div>
                  <div><Label className="text-xs text-muted-foreground">{s.familyField}</Label><Input value={profileForm.lastName ?? ""} onChange={(e) => setProfileForm((f) => ({ ...f, lastName: e.target.value }))} /></div>
                  <div><Label className="text-xs text-muted-foreground">{s.phoneField}</Label><Input dir="ltr" value={profileForm.phone ?? ""} onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))} /></div>
                  <div><Label className="text-xs text-muted-foreground">{s.genderField}</Label>
                    <Select value={profileForm.gender ?? ""} onValueChange={(v) => setProfileForm((f) => ({ ...f, gender: v }))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder={lang === "fa" ? "انتخاب…" : "Select…"} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">{lang === "fa" ? "مرد" : "Male"}</SelectItem>
                        <SelectItem value="female">{lang === "fa" ? "زن" : "Female"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs text-muted-foreground">{s.birthdayField}</Label><Input dir="ltr" placeholder="1995-06-15" value={profileForm.birthday ?? ""} onChange={(e) => setProfileForm((f) => ({ ...f, birthday: e.target.value }))} /></div>
                  <div className="flex items-end"><Button className="w-full" onClick={doSaveProfile}>{s.save}</Button></div>
                </div>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border border-border/50 bg-background/40 p-3">
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><KeyRound className="size-3.5 text-amber-300" /> {s.passwordChange}</p>
                  <div className="mt-2 space-y-1.5">
                    <Input type="password" placeholder={s.currentPassword} className="h-8 text-xs" value={pwForm.current} onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))} />
                    <Input type="password" placeholder={s.newPassword} className="h-8 text-xs" value={pwForm.next} onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))} />
                    <Button size="sm" className="h-8 w-full" onClick={doChangePassword}>{s.changePasswordBtn}</Button>
                  </div>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-3">
                  <p className="text-[11px] text-muted-foreground">{s.languageLabel}</p>
                  <div className="mt-2 flex gap-1.5">
                    <Button size="sm" className="h-8 flex-1" variant={lang === "fa" ? "default" : "outline"} onClick={() => doSetLang("fa")}>فارسی</Button>
                    <Button size="sm" className="h-8 flex-1" variant={lang === "en" ? "default" : "outline"} onClick={() => doSetLang("en")}>EN</Button>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">{s.themeLabel}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <Button size="sm" className="h-8 flex-1" variant="outline" onClick={() => doSetTheme("dark")}><Moon className="size-3.5" /></Button>
                    <Button size="sm" className="h-8 flex-1" variant="outline" onClick={() => doSetTheme("light")}><Sun className="size-3.5" /></Button>
                  </div>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-3">
                  <p className="text-[11px] text-muted-foreground">{s.personalPnl}</p>
                  <p className={`mt-1.5 text-lg font-bold tabular-nums ${userFloating >= 0 ? "text-emerald-300" : "text-red-300"}`}>{pnlText(userFloating)}</p>
                  <p className="text-[10px] text-muted-foreground">{s.realizedPnl}: <span className={`terminal-font ${userRealized >= 0 ? "text-emerald-300" : "text-red-300"}`}>{pnlText(userRealized)}</span></p>
                  {frozen <= 0 && <p className="mt-1 text-[9px] text-amber-400/80">{lang === "fa" ? "سرمایه فریز نشده (سود/زیان غیرفعال)" : "No capital frozen (P&L inactive)"}</p>}
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-3">
                  <p className="text-[11px] text-muted-foreground">{s.subscription}</p>
                  <p className="mt-1.5 text-lg font-bold tabular-nums">{hasActiveVip ? (vip?.packageKey ?? "VIP") : s.misc.none}</p>
                  <p className={`text-[10px] ${daysLeft <= 3 ? "text-red-400" : "text-muted-foreground"}`}>{hasActiveVip ? `${daysLeft} ${s.daysLeft}` : s.expired}</p>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">{s.profileRewardHint}</p>
            </CardContent>
          </Card>

          {/* ── VIP Trial & Discount Code Section ── */}
          <VipTrialCard
            isVip={hasActiveVip}
            vipExpiresAt={account?.profile?.vipExpiresAt}
            onClaimTrial={async () => {
              await claimVipTrialM({ token });
            }}
            onApplyDiscount={async (code: string) => {
              const res = await applyDiscountCodeM({ token, code });
              return res;
            }}
            lang={lang}
          />

          {/* ── VIP (hidden for active members — view only via profile) ── */}
          {!hasActiveVip || showVipPanel ? (
            <Card className="border-border/70 bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm"><Crown className="size-4 text-gold" /> {s.vip} {hasActiveVip ? `· ${s.vipPanel}` : ""}</CardTitle>
                <CardDescription>{s.renew}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(packages ?? []).filter((p: any) => p.status !== false).map((pkg: any) => (
                  <div key={pkg.key} className="rounded-lg border border-gold/25 bg-gradient-to-br from-gold/5 to-transparent p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Crown className="size-5 text-gold" />
                      <div>
                        <p className="text-sm font-bold text-gold">{lang === "fa" ? pkg.nameFa : pkg.name}</p>
                        <p className="text-[10px] text-muted-foreground">{pkg.durationDays} {s.misc.days}</p>
                      </div>
                      <span className="ms-auto text-end text-lg font-black tabular-nums text-gold" dir="ltr">${pkg.price}</span>
                      <p className="w-full text-end text-[10px] text-muted-foreground" dir="ltr">{Math.round(pkg.price * Number(coins?.settings?.usdtTomanRate ?? 95000) * (1 - (pkg.discountPercent ?? 0) / 100)).toLocaleString(lang === "fa" ? "fa-IR" : "en-US")} تومان</p>
                    </div>
                    <div className="rounded-md border border-gold/15 bg-gold/5 p-2.5 text-[11px] space-y-1">
                      <p className="flex items-center gap-1.5"><span className="text-gold">💰</span> {lang === "fa" ? "کارمزد پلتفرم" : "Platform fee"}: <span className="font-bold text-gold">{pkg.commissionPct ?? 1}%</span> {lang === "fa" ? "از سود معاملات" : "of trading profit"}</p>
                      {pkg.discountPercent > 0 && <p className="flex items-center gap-1.5"><span className="text-red-300">🏷️</span> {s.discount}: <span className="font-bold text-red-300">{pkg.discountPercent}%</span></p>}
                      {pkg.giftCoins > 0 && <p className="flex items-center gap-1.5"><span className="text-cyan-300">🪙</span> {s.giftCoins}: <span className="font-bold text-cyan-300">{pkg.giftCoins}</span></p>}
                    </div>
                    {(pkg.featuresFa?.length || pkg.features?.length) > 0 && (
                      <div className="text-[10px] text-muted-foreground space-y-0.5">
                        {(lang === "fa" ? (pkg.featuresFa ?? pkg.features) : (pkg.features ?? pkg.featuresFa) ?? []).slice(0, 4).map((f: string, i: number) => <p key={i} className="flex items-center gap-1">✓ {f}</p>)}
                      </div>
                    )}
                    <Button size="sm" className="w-full bg-gold/90 text-black hover:bg-gold" onClick={() => doVip(pkg)}>{s.buyVip}</Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}


          {/* ── referral ────────────────────────────────────────────────── */}
          <Card className="border-border/70 bg-card/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm">{s.tabReferral}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {referral && (
                <div className="rounded-md border border-emerald-400/20 bg-background/40 p-3 text-xs">
                  <p className="text-muted-foreground">{s.referralCode}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="terminal-font text-lg font-bold text-emerald-300" dir="ltr">{referral.code}</p>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={doCopyRef}>📋 {s.copy}</Button>
                  </div>
                  <p className="mt-1 text-muted-foreground">{s.referralLink}</p>
                  <p className="terminal-font mt-0.5 break-all text-[11px]" dir="ltr">{referral.link}</p>
                  <p className="mt-1 text-muted-foreground">{s.referred}: {referral.referred} · {s.reward}: {referral.rewardEnabled ? (lang === "fa" ? "فعال" : "ON") : (lang === "fa" ? "خاموش" : "OFF")}</p>
                  <p className="mt-1 text-[11px] text-cyan-300">🐺 {s.rewardReferral}: +{coins?.settings?.rewardReferral ?? 0} · {lang === "fa" ? "عضو جدید" : "new user"}: +{coins?.settings?.rewardReferralNew ?? 0}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{lang === "fa" ? "با لینک دعوت در ربات تلگرام شروع کنید؛ پس از ورود عضو جدید به مینی‌اپ، سکه به هر دو اعطا می‌شود." : "Share your link via the Telegram bot — when the new user opens the Mini App, both get coins."}</p>
                </div>
              )}
              <div className="flex gap-1.5">
                <Input dir="ltr" placeholder={s.referralCode} className="h-8 text-xs" value={refCode} onChange={(e) => setRefCode(e.target.value)} />
                <Button size="sm" className="h-8 shrink-0" onClick={doRef}>{s.submit}</Button>
              </div>
              {referral && (referral.referredUsers ?? []).length > 0 ? (
                <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                  <p className="text-[11px] font-bold text-muted-foreground">{s.referralUsers} ({referral.referredUsers.length})</p>
                  <div className="mt-1.5 max-h-40 space-y-1 overflow-auto">
                    {referral.referredUsers.map((u: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded border border-border/40 bg-background/30 px-2 py-1 text-[11px]">
                        <span className="font-semibold" dir="ltr">@{u.username || "—"}</span>
                        <span className="truncate text-muted-foreground">{u.name || ""}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{u.joinedAt ? new Date(u.joinedAt).toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US") : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : referral ? (
                <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "هنوز کسی با کد شما وارد نشده است." : "Nobody has joined with your code yet."}</p>
              ) : null}
            </CardContent>
          </Card>

          {/* ── support ─────────────────────────────────────────────────── */}
                    {/* ── tasks & rewards ─────────────────────────────────────── */}
          <Card className="border-border/70 bg-card/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm">{s.tasks}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 p-2.5 text-xs">
                <span>{s.profileTask}</span>
                <span className="terminal-font shrink-0 text-emerald-300" dir="ltr">+{coins?.settings?.rewardProfile ?? 10}</span>
                <Button size="sm" className="h-7 shrink-0 px-2 text-[11px]" disabled={coins?.profileRewardClaimed} onClick={doClaimProfile}>
                  {coins?.profileRewardClaimed ? (lang === "fa" ? "گرفته شد" : "Done") : s.submit}
                </Button>
              </div>
              {!account?.profile?.tgId ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-sky-400/25 bg-sky-400/5 p-2.5 text-xs">
                  <span>{s.connectTelegram}</span>
                  <span className="terminal-font shrink-0 text-sky-300" dir="ltr">+{coins?.settings?.rewardTelegram ?? 25}</span>
                  <Button size="sm" className="h-7 shrink-0 px-2 text-[11px]" disabled={tgConnecting} onClick={doConnectTelegram}>{s.submit}</Button>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-2 rounded-md border border-cyan-400/25 bg-cyan-400/5 p-2.5 text-xs">
                <span>{s.prediction} 🎮</span>
                <span className="terminal-font shrink-0 text-cyan-300" dir="ltr">+{coins?.settings?.rewardPrediction ?? 3}</span>
                <Button size="sm" className="h-7 shrink-0 px-2 text-[11px]" onClick={() => setTab("fun")}>{s.fun}</Button>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 p-2.5 text-xs">
                <span>{s.tabReferral} 🐺</span>
                <span className="terminal-font shrink-0 text-emerald-300" dir="ltr">+{coins?.settings?.rewardReferral ?? 0} / {lang === "fa" ? "عضو" : "user"}</span>
                <Button size="sm" className="h-7 shrink-0 px-2 text-[11px]" onClick={() => { setTab("profile"); void doCopyRef(); }}>{s.profile} 📋</Button>
              </div>
            </CardContent>
          </Card>

<Card className="border-border/70 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm"><Megaphone className="size-4 text-cyan-300" /> {s.supportHere}</CardTitle>
              <CardDescription>{s.supportOnline}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">

                {coins?.settings?.supportBot ? (
                  <a href={`https://t.me/${coins.settings.supportBot}`} target="_blank" rel="noreferrer" className="rounded-md border border-sky-400/25 bg-sky-400/5 px-2.5 py-1.5 text-sky-300 hover:bg-sky-400/10">✈️ {s.supportOnline}</a>
                ) : null}
                {hasActiveVip && (
                  <a href="https://t.me/Mamadmari" target="_blank" rel="noreferrer" className="rounded-md border border-gold/25 bg-gold/5 px-2.5 py-1.5 text-gold hover:bg-gold/10">👑 {s.supportVip}</a>
                )}
              </div>
              <div className="space-y-1.5">
                <Input placeholder={s.subject} value={ticketForm.subject} onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })} />
                <Textarea placeholder={s.message} value={ticketForm.message} onChange={(e) => setTicketForm({ ...ticketForm, message: e.target.value })} />
                <Button size="sm" className="w-full" onClick={doTicket}>{s.newTicket}</Button>
              </div>
              <div className="max-h-80 space-y-2 overflow-auto">
                {(myTickets ?? []).slice(0, 8).map((t: any) => {
                  const open = openTicket === t._id;
                  return (
                    <div key={t._id} className="rounded-md border border-border/50 bg-background/40 text-xs">
                      <button type="button" className="flex w-full flex-wrap items-center justify-between gap-1 px-2.5 py-2 text-start" onClick={() => setOpenTicket(open ? null : t._id)}>
                        <span className="flex items-center gap-1.5">
                          <span className="terminal-font font-bold text-emerald-300" dir="ltr">#{ticketShortId(t._id)}</span>
                          <span className="font-bold">{t.subject}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                          <span className="text-[10px] text-muted-foreground">{timeAgo(t.created, lang)}</span>
                        </span>
                      </button>
                      {open && (
                        <div className="border-t border-border/40 px-2.5 py-2">
                          <div className="mb-2 max-h-48 space-y-1 overflow-auto">
                            {(t.messages ?? []).map((m: any) => (
                              <div key={m._id} className={`rounded-md p-1.5 ${m.fromAdmin ? "border border-emerald-400/25 bg-emerald-400/5" : "border border-border/40 bg-background/50"}`}>
                                <p className={`text-[10px] font-bold ${m.fromAdmin ? "text-emerald-300" : "text-muted-foreground"}`}>{m.fromAdmin ? (lang === "fa" ? "پشتیبانی" : "Support") : (lang === "fa" ? "شما" : "You")} · {timeAgo(m.created, lang)}</p>
                                <p className="mt-0.5 break-words">{m.text}</p>
                              </div>
                            ))}
                          </div>
                          {t.status !== "closed" && (
                            <div className="flex gap-1.5">
                              <Input dir="ltr" placeholder={`${s.reply}…`} className="h-7 flex-1 text-[11px]" value={myTicketReply[t._id] ?? ""} onChange={(e) => setMyTicketReply((r) => ({ ...r, [t._id]: e.target.value }))} />
                              <Button size="sm" className="h-7 shrink-0 px-2 text-[11px]" onClick={() => { userReplyTicket({ token, ticketId: t._id, text: (myTicketReply[t._id] ?? "").trim() }).then(() => { setMyTicketReply((r) => ({ ...r, [t._id]: "" })); toast.success(s.saved); }).catch((e: any) => toast.error(String(e?.message))); }}>{s.reply}</Button>
                              <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-[10px] text-red-300" onClick={() => userReplyTicket({ token, ticketId: t._id, text: "—", close: true }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message)))}>{s.closeTicket}</Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {(myTickets ?? []).length === 0 && <p className="py-3 text-center text-muted-foreground">{s.misc.none}</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : tab === "wallet" ? (
        <div className="space-y-6">
          {/* ── assets ─────────────────────────────────────────────────── */}
          <h2 className="flex items-center gap-2 text-sm font-bold text-muted-foreground"><Wallet className="size-4 text-emerald-400" /> {s.assetsSection}</h2>
          <div className="space-y-6">
          {/* ── user assets: toman / USDT / wolf coins ─────────────────── */}
          <Card className="border-border/70 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm"><Wallet className="size-4 text-emerald-400" /> {lang === "fa" ? "دارایی کاربر" : "Your assets"}</CardTitle>
              <CardDescription>
                {lang === "fa"
                  ? `نرخ تتر: هر ۱ USDT ≈ ${tomanRate.toLocaleString("en-US")} تومان · هر سکه ≈ ${tomanPerCoin.toLocaleString("en-US")} تومان`
                  : `Rate: 1 USDT ≈ ${tomanRate.toLocaleString("en-US")} toman · 1 coin ≈ ${tomanPerCoin.toLocaleString("en-US")} toman`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-gold/25 bg-gold/5 p-4">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Banknote className="size-3.5 text-gold" /> {s.tomanBalance}</p>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-gold">{(coins?.toman ?? 0).toLocaleString(lang === "fa" ? "fa-IR" : "en-US")}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{lang === "fa" ? "تومان — غیرقابل برداشت؛ برای خرید پنل VIP و بسته‌های سکه" : "toman — not withdrawable; used for VIP & coin packages"}</p>
                </div>
                <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/5 p-4">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Wallet className="size-3.5 text-emerald-300" /> USDT · <span className="terminal-font text-[10px]" dir="ltr">{wallet?.network ?? "TRC20"}</span></p>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-emerald-300">{money(wallet?.balance)}</p>
                  <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                    <span>{s.available}</span>
                    <span className="text-cyan-300">{s.freeze}: {money(frozen)}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "واریز تاییدشده به موتور منتقل (فریز) می‌شود" : "approved deposits are committed to the engine"}</p>
                </div>
                <div className="rounded-lg border border-cyan-400/25 bg-cyan-400/5 p-4">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Zap className="size-3.5 text-cyan-300" /> {s.coinsBalance}</p>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-cyan-300">{coins?.wolfCoins ?? 0}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{s.burnRate}: {coins?.settings?.coinPerHour ?? 60}/hour · {s.monthlyBurn}: ~{monthlyBurn.toLocaleString("en-US")}</p>
                  <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "ولف‌کوین — غیرقابل برداشت" : "wolf coins — not withdrawable"}</p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-border/50 bg-background/40 p-2.5 text-xs">
                  <span className="text-muted-foreground">{lang === "fa" ? "ارزش کل (تومان)" : "Total value (toman)"}: </span>
                  <span className="font-bold tabular-nums text-gold">{(totalToman ?? 0).toLocaleString(lang === "fa" ? "fa-IR" : "en-US")}</span>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-2.5 text-xs">
                  <span className="text-muted-foreground">{lang === "fa" ? "ارزش کل (دلار)" : "Total value (USD)"}: </span>
                  <span className="font-bold tabular-nums text-emerald-300">{money(totalUsd)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-card/60">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.portfolio}</p>
                <p className="mt-1.5 text-xl font-bold tracking-tight tabular-nums">{money((wallet?.balance ?? 0) + userFloating)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{s.floating}: {pnlText(userFloating)}</p>
                {frozen <= 0 && <p className="mt-0.5 text-[9px] text-amber-400/80">{lang === "fa" ? "سرمایه فریز نشده" : "No capital frozen"}</p>}
              </CardContent>
            </Card>
            <Card className="bg-card/60">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.positionsOpen}</p>
                <p className="mt-1.5 text-xl font-bold tracking-tight tabular-nums">{frozen > 0 ? (positions?.length ?? 0) : 0}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{overview ? `${overview.signals.open} ${s.openSignals}` : ""}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/60">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.realizedPnl}</p>
                <p className={`mt-1.5 text-xl font-bold tracking-tight tabular-nums ${userRealized >= 0 ? "text-emerald-300" : "text-red-300"}`}>{pnlText(userRealized)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{lang === "fa" ? "سود/زیان محقق‌شده" : "closed trades"}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/60">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.subscription}</p>
                <p className={`mt-1.5 text-xl font-bold tracking-tight tabular-nums ${daysLeft <= 3 ? "text-red-300" : "text-foreground"}`}>{hasActiveVip ? daysLeft : "—"}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{s.daysLeft} · {hasActiveVip ? (vip?.packageKey ?? "VIP") : s.misc.none}</p>
              </CardContent>
            </Card>
          </div>


          {/* ── your share of the engine ─────────────────────────────────── */}
          <Card className="border-gold/30 bg-gradient-to-br from-gold/10 via-card to-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm text-gold"><Activity className="size-4" /> {s.shareTitle}</CardTitle>
              <CardDescription>{s.shareSub}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-gold/20 bg-gold/5 p-3">
                  <p className="text-[11px] text-muted-foreground">{s.shareContribution}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-gold" dir="ltr">{money(account?.share?.contribution ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground">{s.freeze}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/40 p-3">
                  <p className="text-[11px] text-muted-foreground">{s.shareRatio}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{account?.share?.ratio ?? 0}%</p>
                  <p className="text-[10px] text-muted-foreground">{s.engineTotal}: {money(account?.share?.totalCapital ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/40 p-3">
                  <p className="text-[11px] text-muted-foreground">{s.unrealizedPnl}</p>
                  <p className={`mt-1 text-lg font-bold tabular-nums ${(account?.share?.floatingPnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{pnlText(account?.share?.floatingPnl ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground">{s.realizedPnl}: {pnlText(account?.share?.realizedPnl ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/5 p-3">
                  <p className="text-[11px] text-muted-foreground">{s.shareTotal}</p>
                  <p className={`mt-1 text-lg font-bold tabular-nums ${(account?.share?.total ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{pnlText(account?.share?.total ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground">{s.totalPnl}</p>
                </div>
                <div className="rounded-lg border border-amber-400/25 bg-amber-400/5 p-3">
                  <p className="text-[11px] text-muted-foreground">{lang === "fa" ? "سهم پلتفرم" : "Platform share"} <span className="font-semibold" dir="ltr">({account?.share?.commissionPct ?? 0}%)</span></p>
                  <p className={`mt-1 text-lg font-bold tabular-nums ${(account?.share?.platformFee ?? 0) >= 0 ? "text-amber-300" : "text-red-300"}`} dir="ltr">{pnlText(account?.share?.platformFee ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "طبق سطح VIP شما" : "per your VIP tier"}</p>
                </div>
                <div className="rounded-lg border border-sky-400/30 bg-sky-400/5 p-3">
                  <p className="text-[11px] text-muted-foreground">{lang === "fa" ? "سود خالص شما (پس از کارمزد)" : "Your net profit (after fees)"}</p>
                  <p className={`mt-1 text-lg font-bold tabular-nums ${(account?.share?.net ?? 0) >= 0 ? "text-sky-300" : "text-red-300"}`} dir="ltr">{pnlText(account?.share?.net ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "کسر سهم پلتفرم و کارمزدها" : "after platform share & fees"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          </div>


          {/* ── wallet: deposit / withdraw / unfreeze / toman ──────────── */}
          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/70 bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm"><Banknote className="size-4 text-emerald-400" /> {s.deposit}</CardTitle>
                <CardDescription>{s.submit}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {networks.length === 0 ? (
                  <p className="rounded-md border border-amber-400/25 bg-amber-400/5 p-2.5 text-[11px] text-amber-300">{lang === "fa" ? "هنوز آدرس واریزی برای هیچ شبکه‌ای ثبت نشده است — با پشتیبانی تماس بگیرید." : "No deposit address is configured yet — contact support."}</p>
                ) : (
                  <>
                    <Label className="text-xs text-muted-foreground">{s.network}</Label>
                    <Select value={depNetwork} onValueChange={setDepNetwork}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{networks.map((n: string) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                    {selectedDepAddr && (
                      <div className="rounded-md border border-emerald-400/25 bg-emerald-400/5 p-2.5">
                        <p className="text-[11px] font-bold text-emerald-300">{s.depositAddresses} · {selectedDepAddr.network}</p>
                        <p className="terminal-font mt-1 break-all text-xs" dir="ltr">{selectedDepAddr.address}</p>
                        {selectedDepAddr.memo && <p className="terminal-font mt-1 text-[10px] text-amber-300" dir="ltr">Memo: {selectedDepAddr.memo}</p>}
                      </div>
                    )}
                    <p className="rounded-md border border-amber-400/25 bg-amber-400/5 p-2.5 text-[11px] text-amber-300">⚠️ {s.depositWarn}</p>
                    <Label className="text-xs text-muted-foreground">{s.amount}</Label>
                    <Input type="number" min="0" value={depAmount} onChange={(e) => setDepAmount(e.target.value)} />
                    <Label className="text-xs text-muted-foreground">{s.txid}</Label>
                    <Input dir="ltr" value={depTxid} onChange={(e) => setDepTxid(e.target.value)} />
                    <Button className="w-full" disabled={networks.length === 0} onClick={doDeposit}>{s.submit}</Button>
                  </>
                )}
                <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "پس از تأیید مدیر، مبلغ به موتور منتقل (فریز) می‌شود." : "After admin approval the amount is committed to the engine (frozen)."}</p>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-border/70 bg-card/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1.5 text-sm"><Wallet className="size-4 text-cyan-400" /> {s.withdraw}</CardTitle>
                  <CardDescription>{s.review}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs">{s.availableBalance}: <span className="terminal-font font-bold tabular-nums text-emerald-300" dir="ltr">{money(wallet?.balance)}</span></p>
                  {!account?.profile?.tgId ? (
                    <p className="rounded-md border border-amber-400/25 bg-amber-400/5 p-2.5 text-[11px] text-amber-300">{lang === "fa" ? "برای برداشت ابتدا باید حساب تلگرام خود را در تب پروفایل متصل کنید." : "Connect your Telegram account in the Profile tab before withdrawing."}</p>
                  ) : !tgVerified ? (
                    <div className="rounded-md border border-sky-400/25 bg-sky-400/5 p-2.5">
                      <p className="text-[11px] text-sky-300">{s.tgWithdrawHint}</p>
                      <Button size="sm" className="mt-2 w-full gap-1.5" disabled={tgConfirming} onClick={doConfirmWithdrawTg}>
                        <Bot className="size-3.5" /> {tgConfirming ? <Loader2 className="size-3.5 animate-spin" /> : null} {s.tgWithdrawConfirm}
                      </Button>
                    </div>
                  ) : (
                    <p className="rounded-md border border-emerald-400/25 bg-emerald-400/5 p-2.5 text-[11px] text-emerald-300">✅ {s.tgVerifiedDone}</p>
                  )}
                  <Label className="text-xs text-muted-foreground">{s.network}</Label>
                  <Select value={wdNetwork} onValueChange={setWdNetwork}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{withdrawNetworks.map((n: string) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                  </Select>

                  <Label className="text-xs text-muted-foreground">{s.amount}</Label>
                  <Input type="number" min="0" value={wdAmount} onChange={(e) => setWdAmount(e.target.value)} />
                  <Label className="text-xs text-muted-foreground">{s.address}</Label>
                  <Input dir="ltr" value={wdAddress} onChange={(e) => setWdAddress(e.target.value)} />
                  <p className="rounded-md border border-amber-400/25 bg-amber-400/5 p-2.5 text-[11px] text-amber-300">⚠️ {s.withdrawWarn}</p>
                  <Button variant="outline" className="w-full" disabled={!tgVerified || !account?.profile?.tgId} onClick={doWithdraw}>{s.submit}</Button>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1.5 text-sm"><KeyRound className="size-4 text-amber-300" /> {s.unfreeze}</CardTitle>
                  <CardDescription>{s.unfreezeHint}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{s.amount} · {s.freeze}: {money(frozen)}</Label>
                  <div className="flex gap-1.5">
                    <Input type="number" min="0" value={unfreezeAmount} onChange={(e) => setUnfreezeAmount(e.target.value)} />
                    <Button onClick={doUnfreeze}>{s.submit}</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-border/70 bg-card/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-1.5 text-sm"><ArrowRightToLine className="size-4 text-purple-400" /> {lang === "fa" ? "انتقال به موتور" : "Transfer to Engine"}</CardTitle>
                    <CardDescription>{lang === "fa" ? "موجودی قابل برداشت خود را به موتور منتقل کنید تا با آن معامله شود. سود به همین مبلغ اضافه می‌شود." : "Transfer available balance to the engine for trading. Profits are added to your committed capital."}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs">{s.availableBalance}: <span className="terminal-font font-bold tabular-nums text-emerald-300" dir="ltr">{money(wallet?.balance)}</span> <span className="text-[10px] text-muted-foreground">({((wallet?.balance ?? 0) * tomanRate).toLocaleString()} {lang === "fa" ? "تومان" : "Toman"})</span></p>
                    <Label className="text-xs text-muted-foreground">{s.amount}</Label>
                    <div className="flex gap-1.5">
                      <Input type="number" min="0" value={commitAmount} onChange={(e) => setCommitAmount(e.target.value)} />
                      <Button onClick={doCommitToEngine}>{s.submit}</Button>
                    </div>
                  </CardContent>
                </Card>

                {/* ── Instant Swap (USDT <-> Toman) ────────────────────────── */}
                <Card className="border-cyan-400/30 bg-card/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5"><ArrowLeftRight className="size-4 text-cyan-400" /> {lang === "fa" ? "سواپ فوری (تتر ⇄ تومان)" : "Instant Swap (USDT ⇄ Toman)"}</span>
                      <Badge variant="outline" className="border-gold/40 text-[10px] text-gold" dir="ltr">1 USDT = {tomanRate.toLocaleString()} IRT</Badge>
                    </CardTitle>
                    <CardDescription>{lang === "fa" ? "تبدیل آنی و بدون کارمزد بین موجودی تتر و تومان حساب کاربری" : "Instant zero-fee conversion between USDT and Toman wallet"}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between gap-1 rounded-md border border-border/50 bg-background/50 p-1">
                      <Button size="sm" variant={swapMode === "usdt_to_toman" ? "default" : "ghost"} className="h-7 flex-1 text-xs" onClick={() => setSwapMode("usdt_to_toman")}>
                        USDT ➔ {lang === "fa" ? "تومان" : "Toman"}
                      </Button>
                      <Button size="sm" variant={swapMode === "toman_to_usdt" ? "default" : "ghost"} className="h-7 flex-1 text-xs" onClick={() => setSwapMode("toman_to_usdt")}>
                        {lang === "fa" ? "تومان" : "Toman"} ➔ USDT
                      </Button>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{lang === "fa" ? "موجودی قابل تبدیل:" : "Available:"}</span>
                      <span className="terminal-font font-bold text-foreground" dir="ltr">
                        {swapMode === "usdt_to_toman" ? `${(wallet?.balance ?? 0).toFixed(2)} USDT` : `${(coins?.toman ?? 0).toLocaleString()} IRT`}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <Input
                        type="number"
                        min="0"
                        placeholder={swapMode === "usdt_to_toman" ? "USDT" : lang === "fa" ? "مبلغ تومان" : "Toman"}
                        className="flex-1"
                        value={swapAmount}
                        onChange={(e) => setSwapAmount(e.target.value)}
                      />
                      <Button variant="outline" size="sm" className="h-9 px-2 text-xs" onClick={() => setSwapAmount(String(swapMode === "usdt_to_toman" ? wallet?.balance ?? 0 : coins?.toman ?? 0))}>MAX</Button>
                      <Button className="h-9 gap-1" onClick={doSwap}>
                        <ArrowLeftRight className="size-3.5" /> {lang === "fa" ? "تبدیل" : "Swap"}
                      </Button>
                    </div>
                    {parseFloat(swapAmount) > 0 && (
                      <p className="rounded-md border border-cyan-400/20 bg-cyan-400/5 p-1.5 text-center text-[11px] text-cyan-300">
                        {swapMode === "usdt_to_toman"
                          ? `≈ ${(parseFloat(swapAmount) * tomanRate).toLocaleString(lang === "fa" ? "fa-IR" : "en-US")} ${lang === "fa" ? "تومان دریافت می‌کنید" : "Toman you receive"}`
                          : `≈ ${(parseFloat(swapAmount) / tomanRate).toFixed(2)} ${lang === "fa" ? "تتر دریافت می‌کنید" : "USDT you receive"}`}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

          {/* coins economy (toman deposit / buy / packages / ledger) */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-muted-foreground"><Zap className="size-4 text-cyan-300" /> {s.tabCoins} · {s.myCoins} {coins?.wolfCoins ?? 0}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-border/70 bg-card/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1.5 text-sm"><Banknote className="size-4 text-gold" /> {s.tomanDeposit}</CardTitle>
                  <CardDescription>{s.walletCard}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(coins?.settings?.tomanCard || coins?.settings?.tomanCardHolder) && (
                    <div className="rounded-md border border-gold/25 bg-gold/5 p-2.5 text-xs">
                      <p className="flex items-center justify-between"><span className="text-muted-foreground">{s.tomanCard}</span><span className="terminal-font font-bold tabular-nums" dir="ltr">{coins.settings.tomanCard}</span></p>
                      <p className="mt-1 flex items-center justify-between"><span className="text-muted-foreground">{s.tomanHolder}</span><span className="font-bold">{coins.settings.tomanCardHolder}</span></p>
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">{lang === "fa" ? "مبلغ (تومان)" : "Amount (Toman)"}</Label>
                      <Input type="number" min="10000" placeholder="100,000" value={tomanAmount} onChange={(e) => setTomanAmount(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">{s.tomanRef}</Label>
                      <Input dir="ltr" value={tomanRef} onChange={(e) => setTomanRef(e.target.value)} />
                    </div>
                  </div>
                  <Textarea placeholder={`${s.tomanNote}…`} value={tomanNote} onChange={(e) => setTomanNote(e.target.value)} />
                  <Button className="w-full" onClick={doTomanDeposit}>{s.submit}</Button>
                  <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "پس از تأیید مدیر، مبلغ به کیف پول تومانی شما اضافه می‌شود." : "The amount is added to your toman wallet after admin approval."}</p>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/60">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-1.5 text-sm"><Zap className="size-4 text-cyan-300" /> {s.buyCoins}</CardTitle>
                    <div className="flex gap-1 rounded border border-border/50 p-0.5">
                      <Button size="sm" variant={buyCoinsCurrency === "toman" ? "default" : "ghost"} className="h-6 px-2 text-[10px]" onClick={() => setBuyCoinsCurrency("toman")}>
                        {lang === "fa" ? "تومان" : "Toman"}
                      </Button>
                      <Button size="sm" variant={buyCoinsCurrency === "usdt" ? "default" : "ghost"} className="h-6 px-2 text-[10px]" onClick={() => setBuyCoinsCurrency("usdt")}>
                        USDT (تتر)
                      </Button>
                    </div>
                  </div>
                  <CardDescription>{s.monthlyBurn}: ~{monthlyBurn.toLocaleString("en-US")} {s.coinsBalance} · 1 {lang === "fa" ? "سکه" : "coin"} = {tomanPerCoin.toLocaleString("en-US")} {lang === "fa" ? "تومان" : "Toman"} {tomanRate > 0 ? `(≈ $${(tomanPerCoin / tomanRate).toFixed(4)})` : ""}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    <Input type="number" min="1" placeholder={s.coinsBalance} className="flex-1" value={buyCoinsQty} onChange={(e) => setBuyCoinsQty(e.target.value)} />
                    <Button onClick={doBuyCoins}>{buyCoinsCurrency === "usdt" ? (lang === "fa" ? "خرید با تتر" : "Buy with USDT") : s.buyCoins}</Button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{s.cost}:</span>
                    <span className="font-bold text-foreground">
                      {buyCoinsCurrency === "usdt"
                        ? `${((Math.floor(parseFloat(buyCoinsQty) || 0) * tomanPerCoin) / (tomanRate || 95000)).toFixed(2)} USDT`
                        : `${(Math.floor(parseFloat(buyCoinsQty) || 0) * tomanPerCoin).toLocaleString(lang === "fa" ? "fa-IR" : "en-US")} ${lang === "fa" ? "تومان" : "toman"}`}
                    </span>
                  </div>
                  <div className="space-y-1.5 pt-1">
                    {(coins?.settings?.packages ?? []).map((pk: any, i: number) => {
                      const usdtCost = ((pk.price ?? 0) / (tomanRate || 95000)).toFixed(2);
                      return (
                        <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-2.5 py-2 text-xs">
                          <div>
                            <p className="font-bold">{lang === "fa" ? pk.labelFa ?? pk.label : pk.label}</p>
                            <p className="text-[10px] text-muted-foreground">{(pk.coins ?? 0).toLocaleString("en-US")} {s.coinsBalance} ≈ {Math.round((pk.coins ?? 0) / monthlyBurn * 30)} {lang === "fa" ? "روز استفاده" : "days of use"}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="terminal-font tabular-nums text-gold" dir="ltr">{(pk.price ?? 0).toLocaleString(lang === "fa" ? "fa-IR" : "en-US")} ت</span>
                            <span className="terminal-font text-[10px] text-emerald-300" dir="ltr">(${usdtCost})</span>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => buyCoinPackage({ token, index: i }).then((r: any) => toast.success(`+${r.coins} ${s.coinsBalance}`)).catch((e: any) => toast.error(String(e?.message ?? "error")))}>
                              {lang === "fa" ? "تومان" : "Toman"}
                            </Button>
                            <Button size="sm" variant="default" className="h-7 px-2 text-[10px]" onClick={() => buyCoinPackageWithUsdt({ token, index: i }).then((r: any) => toast.success(`+${r.coins} ${s.coinsBalance} (${r.usdtSpent} USDT)`)).catch((e: any) => toast.error(String(e?.message ?? "error")))}>
                              USDT
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── unified wallet history ─────────────────────────────────── */}
          <Card className="border-border/70 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm"><ScrollText className="size-4 text-emerald-400" /> {s.walletHistory}</CardTitle>
              <CardDescription>{lang === "fa" ? "تمام تراکنش‌ها: واریز، برداشت، سواپ، آزادسازی، خرید/فروش سکه، تتر، تومان و ولف‌کوین با معادل‌سازی روز" : "All transactions: deposits, withdrawals, swaps, unfreeze, coin buys — USDT, Toman & Wolf coins with live rate equivalents"}</CardDescription>
            </CardHeader>
            <CardContent className="max-h-96 overflow-auto p-0">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[18%] text-xs">{s.type}</TableHead>
                    <TableHead className="w-[14%] text-xs">{lang === "fa" ? "ارز" : "Currency"}</TableHead>
                    <TableHead className="w-[24%] text-xs text-start">{s.amount}</TableHead>
                    <TableHead className="w-[16%] text-xs">{s.txStatus}</TableHead>
                    <TableHead className="w-[28%] text-xs">{s.txDate}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {((finHistory as any[]) ?? allTx).slice(0, 50).map((t: any) => (
                    <TableRow key={t.id ?? t.key}>
                      <TableCell className="text-xs font-medium">
                        <span className="capitalize">{t.type}</span>
                        {t.note && <span className="block truncate text-[10px] text-muted-foreground">{t.note}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${t.currency === "IRT" || t.currency === "toman" ? "border-gold/40 text-gold" : t.currency === "WOLF" || t.currency === "wolf" ? "border-cyan-400/40 text-cyan-300" : "border-emerald-400/40 text-emerald-300"}`}>
                          {t.currency === "toman" ? "IRT" : t.currency === "wolf" ? "WOLF" : t.currency}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs" dir="ltr">
                        <div className={`terminal-font font-bold tabular-nums ${t.type === "deposit" || t.type === "credit" || t.type === "unfreeze" ? "text-emerald-300" : "text-red-300"}`}>
                          {t.type === "deposit" || t.type === "credit" || t.type === "unfreeze" ? "+" : "-"}{num(t.amount, 2)} {t.currency === "toman" ? "IRT" : t.currency}
                        </div>
                        {t.equivToman != null && t.currency !== "IRT" && t.currency !== "toman" && (
                          <div className="text-[10px] text-muted-foreground tabular-nums">
                            ≈ {Math.round(t.equivToman).toLocaleString()} IRT
                          </div>
                        )}
                        {t.equivUsdt != null && (t.currency === "IRT" || t.currency === "toman") && (
                          <div className="text-[10px] text-muted-foreground tabular-nums">
                            ≈ ${t.equivUsdt.toFixed(2)} USDT
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${t.status === "confirmed" ? "border-emerald-400/40 text-emerald-300" : t.status === "failed" ? "border-red-400/40 text-red-300" : "border-amber-400/40 text-amber-300"}`}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">
                        <div>{t.created ? new Date(t.created).toLocaleString(lang === "fa" ? "fa-IR" : "en-US", { dateStyle: "short", timeStyle: "short" }) : "—"}</div>
                        {t.network && t.network !== "—" && <span className="text-[9px]">{t.network}</span>}
                        {t.txid && <span className="ms-1 font-mono text-[9px]">({t.txid.slice(0, 8)}…)</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!finHistory || (finHistory as any[]).length === 0) && allTx.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">{s.misc.none}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>



          {/* ── wolf-coin voucher ─────────────────────────────────────── */}
              <Card className="border-border/70 bg-card/60">
                <CardHeader className="pb-2"><CardTitle className="text-sm">{s.redeemVoucher}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    <Input dir="ltr" placeholder={s.voucherCode} className="flex-1" value={voucherInput} onChange={(e) => setVoucherInput(e.target.value)} />
                    <Button onClick={doRedeem}>{s.submit}</Button>
                  </div>
                </CardContent>
              </Card>

        </div>
      ) : (
        <>
          {/* ── engine portfolio (real-time, real market data) ─────── */}
          {/* ── engine assets (separate environment) ───────────────────── */}
          <Card className="border-violet-400/25 bg-gradient-to-br from-violet-500/10 via-card to-cyan-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm text-violet-300"><Activity className="size-4" /> {s.engineAssets}</CardTitle>
              <CardDescription>{lang === "fa" ? "سرمایه‌ای که موتور مدیریت می‌کند — سرمایه تاییدشده‌ی شما به این بخش منتقل می‌شود." : "Capital the engine manages — your approved USDT is committed here."}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div>
                  <p className="text-[11px] text-muted-foreground">{s.capital}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{money(ea?.capital ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground">≈ {((ea?.capital ?? 0) * tomanRate).toLocaleString(lang === "fa" ? "fa-IR" : "en-US")} {lang === "fa" ? "تومان" : "toman"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{s.engaged}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-cyan-300">{money(ea?.engaged ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground">{s.freeze}: {(frozen ?? 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{s.floating}</p>
                  <p className={`mt-1 text-xl font-bold tabular-nums ${(ea?.floatingPnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>{pnlText(ea?.floatingPnl ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "سود/زیان شناور" : "floating P&L"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{s.realizedPnl}</p>
                  <p className={`mt-1 text-xl font-bold tabular-nums ${(ea?.realizedPnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>{pnlText(ea?.realizedPnl ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "سود/زیان محقق‌شده" : "realized P&L"}</p>
                </div>
              </div>
            </CardContent>
          </Card>


          {/* ── Open Positions (Directly on main dashboard) ───────────────── */}
          <Card className="border-emerald-400/20 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5"><Activity className="size-4 text-emerald-300" /> {s.positionsOpen}</span>
                <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-400/20" dir="ltr">
                  {(positions ?? []).length} {lang === "fa" ? "پوزیشن فعال" : "Active"}
                </span>
              </CardTitle>
              <CardDescription>{s.positionsEmpty}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(positions ?? []).length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  {lang === "fa" ? "در حال حاضر پوزیشن بازی وجود ندارد — موتور به صورت ۲۴ ساعته در حال اسکن بازار است." : "No open positions — engine is scanning the market 24/7."}
                </p>
              )}
              {(positions ?? []).slice(0, 15).map((p: any) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`terminal-font font-bold ${p.side === "long" ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{p.side === "long" ? "▲" : "▼"} {fmtSym(p.symbol)}</span>
                    <span className={`rounded px-1.5 py-px text-[10px] font-bold ${p.side === "long" ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300"}`}>{p.side === "long" ? (lang === "fa" ? "لانگ" : "LONG") : (lang === "fa" ? "شورت" : "SHORT")}</span>
                    <span className="terminal-font tabular-nums text-muted-foreground" dir="ltr">{p.leverage}x</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="terminal-font tabular-nums" dir="ltr">E {num(p.entry, 5)}</span>
                    <span className="terminal-font tabular-nums" dir="ltr">SL {num(p.stopLoss, 5)}</span>
                    <span className="terminal-font tabular-nums" dir="ltr">TP {num(p.takeProfit, 5)}</span>
                    <span className={`terminal-font tabular-nums text-[10px] font-bold ${p.pnl >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{p.pnl >= 0 ? "+" : ""}{num(p.pnl, 2)} ({p.pnlPct >= 0 ? "+" : ""}{(p.pnlPct * 100).toFixed(1)}%)</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ── VIP signals (compact, coin-gated details) ──────────────── */}
          {hasActiveVip ? (
            <Card className="border-emerald-400/20 bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-sm"><Radio className="size-4 text-emerald-300" /> {lang === "fa" ? "سیگنال‌های موتور" : "Engine signals"}</CardTitle>
                <CardDescription>{lang === "fa" ? `آخرین سیگنال‌های شناسایی‌شده — باز کردن جزئیات کامل ${coins?.settings?.signalDetail ?? 10} سکه هزینه دارد.` : `Latest signals — full detail view costs ${coins?.settings?.signalDetail ?? 10} wolf coins.`}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(signals ?? []).slice(0, 8).map((sg: any) => (
                  <div key={sg.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="terminal-font font-bold" dir="ltr">{fmtSym(sg.symbol)}</span>
                      <span className={`rounded px-1.5 py-px text-[10px] font-bold ${sg.direction === "long" ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300"}`}>{sg.direction === "long" ? (lang === "fa" ? "لانگ" : "LONG") : (lang === "fa" ? "شورت" : "SHORT")}</span>
                      <span className="terminal-font tabular-nums text-muted-foreground" dir="ltr">{sg.timeframe}</span>
                      <span className="terminal-font tabular-nums" dir="ltr">⭐ {sg.score} · {(sg.confidence * 100).toFixed(0)}%</span>
                      {sg.created && <span className="text-[9px] text-muted-foreground" dir="ltr">⏰ {new Date(sg.created).toLocaleTimeString(lang === "fa" ? "fa-IR" : "en-US", { hour: "2-digit", minute: "2-digit" })} · {(() => { const d = Date.now() - sg.created; const m = Math.floor(d / 60000); if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`; })()}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="terminal-font tabular-nums text-[10px] text-muted-foreground" dir="ltr">E {num(sg.entry, 5)} · SL {num(sg.stopLoss, 5)} · TP {num(sg.takeProfit, 5)}</span>
                      <Button size="sm" variant={sg.unlocked ? "default" : "outline"} className="h-6 px-2 text-[10px]" onClick={() => doUnlockSignal(sg)}>{sg.unlocked ? (lang === "fa" ? "مشاهده ✓" : "View ✓") : (lang === "fa" ? `جزئیات (${coins?.settings?.signalDetail ?? 10} 🪙)` : `Details (${coins?.settings?.signalDetail ?? 10} 🪙)`)}</Button>
                    </div>
                  </div>
                ))}
                {(signals ?? []).length === 0 && <p className="py-4 text-center text-muted-foreground">{lang === "fa" ? "هنوز سیگنالی ثبت نشده — موتور در حال اسکن بازار است." : "No signals yet — the engine is scanning the market."}</p>}
                {sigDetail ? (
                  <div className="rounded-md border border-emerald-400/25 bg-emerald-400/5 p-3 text-xs">
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      <span className="terminal-font" dir="ltr">{fmtSym(sigDetail.symbol)}</span>
                      <span className={`rounded px-1.5 py-px text-[10px] ${sigDetail.direction === "long" ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300"}`}>{sigDetail.direction === "long" ? "LONG" : "SHORT"}</span>
                      <span className="terminal-font tabular-nums" dir="ltr">⭐ {sigDetail.score}/100 · {(sigDetail.confidence * 100).toFixed(0)}% · RR {sigDetail.rr}</span>
                      <button className="ms-auto text-muted-foreground" onClick={() => setSigDetail(null)}>✕</button>
                    </p>
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                      <p><span className="text-muted-foreground">{lang === "fa" ? "ورود" : "Entry"}: </span><span className="terminal-font font-bold" dir="ltr">{num(sigDetail.entry, 5)}</span></p>
                      <p><span className="text-muted-foreground">SL: </span><span className="terminal-font font-bold text-red-300" dir="ltr">{num(sigDetail.stopLoss, 5)}</span></p>
                      <p><span className="text-muted-foreground">TP: </span><span className="terminal-font font-bold text-emerald-300" dir="ltr">{num(sigDetail.takeProfit, 5)}</span></p>
                    </div>
                    {(sigDetail.targets ?? []).length > 0 && <p className="mt-1.5"><span className="text-muted-foreground">{lang === "fa" ? "تارگت‌ها" : "Targets"}: </span><span className="terminal-font" dir="ltr">{sigDetail.targets.map((x: number) => num(x, 5)).join(" · ")}</span></p>}
                    <p className="mt-1.5"><span className="text-muted-foreground">{lang === "fa" ? "استراتژی‌ها" : "Strategies"}: </span><span dir="ltr">{(sigDetail.strategyKeys ?? []).join(", ") || "—"}</span></p>
                    <div className="mt-1.5 space-y-0.5">
                      {(sigDetail.reasonsFa ?? []).slice(0, 4).map((r: string, i: number) => <p key={i} className="text-muted-foreground">• {r}</p>)}
                    </div>
                    <div className="mt-2 overflow-hidden rounded-md border border-border/50">
                      <LiveChart
                        symbol={sigDetail.symbol}
                        timeframe={sigDetail.timeframe ?? "15m"}
                        height={220}
                        entry={sigDetail.entry}
                        stopLoss={sigDetail.stopLoss}
                        takeProfit={sigDetail.takeProfit}
                        direction={sigDetail.direction}
                      />
                      <p className="border-t border-border/40 px-2 py-1 text-[9px] text-muted-foreground">{lang === "fa" ? "خطوط: ورود (زرد) · حد ضرر (قرمز) · هدف (سبز) — داده زنده بازار" : "Levels: entry (gold) · stop loss (red) · take profit (green) — live market data"}</p>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* ── market watch + chart ───────────────────────────────────── */}
          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/70 bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{s.watch}</CardTitle>
                <CardDescription>{s.watchSub}</CardDescription>
              </CardHeader>
              <CardContent className="max-h-80 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{fmtSym(s.symbol)}</TableHead>
                      <TableHead className="text-xs">{s.last}</TableHead>
                      <TableHead className="text-xs">{s.change24}</TableHead>
                      <TableHead className="text-xs" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(markets ?? []).slice(0, 24).map((m: any) => {
                      const up = (m.change24h ?? 0) >= 0;
                      return (
                        <TableRow key={m.symbol} className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => setChartSym(chartSym === m.symbol ? null : m.symbol)}>
                          <TableCell className="text-xs font-semibold">
                            <div className="flex items-center gap-1.5">
                              <CryptoIcon symbol={m.symbol} size="xs" />
                              <span>{fmtSym(m.symbol)}</span>
                              <span className="ms-1 rounded bg-emerald-400/10 px-1 py-px text-[9px] font-bold text-emerald-400" dir="ltr">● LIVE</span>
                            </div>
                          </TableCell>
                          <TableCell className="terminal-font text-xs tabular-nums" dir="ltr">{num(m.lastPrice, 5)}</TableCell>
                          <TableCell className={`terminal-font text-xs tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`} dir="ltr">{up ? "+" : ""}{num(m.change24h, 2)}%</TableCell>
                          <TableCell className="w-24 p-1">{m.spark?.length > 1 ? <SparkChart data={m.spark} width={96} height={28} positive={up} /> : null}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Right column: Interactive Live Chart or Default Market View */}
            <Card className="border-border/70 bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <CryptoIcon symbol={chartSym || "BTCUSDT"} size="sm" />
                    <span className="terminal-font font-bold" dir="ltr">{chartSym || "BTCUSDT"}</span>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">
                      {lang === "fa" ? "نمودار زنده" : "Live Chart"}
                    </Badge>
                  </div>
                  {chartSym && (
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => setChartSym(null)}>✕</Button>
                  )}
                </CardTitle>
                <CardDescription>{s.watchChart}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-2 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{s.tf}:</span>
                  {["1m", "5m", "15m", "30m", "1h", "4h", "1d"].map((tf) => (
                    <button key={tf} type="button" onClick={() => setChartTf(tf)} className={`rounded border px-1.5 py-0.5 text-[10px] font-bold transition-colors ${chartTf === tf ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-border/50 text-muted-foreground hover:border-emerald-400/30"}`} dir="ltr">{tf}</button>
                  ))}
                </div>
                {(() => {
                  const targetSym = chartSym || "BTCUSDT";
                  const openPos = (positions ?? []).find((p: any) => p.symbol === targetSym);
                  return openPos ? (
                    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-gold/30 bg-gold/5 px-2.5 py-1.5 text-[11px]">
                      <span className={`font-bold ${openPos.side === "long" ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{openPos.side === "long" ? "▲ LONG" : "▼ SHORT"}</span>
                      <span className="text-muted-foreground">{s.entry}: <b className="terminal-font" dir="ltr">{num(openPos.entry, 5)}</b></span>
                      <span className="text-muted-foreground">SL: <b className="terminal-font text-red-300" dir="ltr">{num(openPos.stopLoss, 5)}</b></span>
                      <span className="text-muted-foreground">TP: <b className="terminal-font text-emerald-300" dir="ltr">{num(openPos.takeProfit, 5)}</b></span>
                      <span className={`terminal-font ms-auto font-bold ${(openPos.pnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{pnlText(openPos.pnl)}</span>
                    </div>
                  ) : null;
                })()}
                <LiveChart
                  height={280}
                  symbol={chartSym || "BTCUSDT"}
                  timeframe={chartTf}
                  className="w-full"
                  entry={(() => { const p = (positions ?? []).find((x: any) => x.symbol === (chartSym || "BTCUSDT")); return p?.entry; })()}
                  stopLoss={(() => { const p = (positions ?? []).find((x: any) => x.symbol === (chartSym || "BTCUSDT")); return p?.stopLoss; })()}
                  takeProfit={(() => { const p = (positions ?? []).find((x: any) => x.symbol === (chartSym || "BTCUSDT")); return p?.takeProfit; })()}
                />
              </CardContent>
            </Card>
          </section>

          {/* ── Fundamental News Section ──────────────────────────────── */}
          <section>
            <FundamentalNewsSection news={fundamentalNews ?? []} lang={lang} />
          </section>

          {/* ── positions ──────────────────────────────────────────────── */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-muted-foreground"><Zap className="size-4 text-emerald-400" /> {s.positions}</h2>
            {positions && positions.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {positions.map((p: any) => <PositionCard key={p.id} p={p} lang={lang} />)}
              </div>
            ) : (
              <Card className="border-border/60 bg-card/40"><CardContent className="p-8 text-center text-sm text-muted-foreground">{s.positionsEmpty}</CardContent></Card>
            )}
          </section>

        </>
      )}

      {/* Mobile Sticky Bottom Navigation Bar */}
      <nav aria-label="Mobile Navigation" className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-xl border-t border-border/80 px-2 py-1.5 shadow-[0_-4px_24px_rgba(0,0,0,0.4)]">
        <div className="mx-auto flex max-w-md items-center justify-around">
          <button
            type="button"
            onClick={() => { setTab("home"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 px-3 transition-all ${
              tab === "home"
                ? "text-emerald-400 font-bold scale-105"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutDashboard className="size-4" />
            <span className="text-[10px]">{s.dashWolf}</span>
            {tab === "home" && <span className="size-1 rounded-full bg-emerald-400 mt-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => { setTab("wallet"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 px-3 transition-all relative ${
              tab === "wallet"
                ? "text-emerald-400 font-bold scale-105"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Wallet className="size-4" />
            <span className="text-[10px]">{s.walletTab}</span>
            {tab === "wallet" && <span className="size-1 rounded-full bg-emerald-400 mt-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => { setTab("fun"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 px-3 transition-all ${
              tab === "fun"
                ? "text-cyan-400 font-bold scale-105"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Gamepad2 className="size-4" />
            <span className="text-[10px]">{s.fun}</span>
            {tab === "fun" && <span className="size-1 rounded-full bg-cyan-400 mt-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => { setTab("profile"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 px-3 transition-all ${
              tab === "profile"
                ? "text-purple-400 font-bold scale-105"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="size-4" />
            <span className="text-[10px]">{s.profile}</span>
            {tab === "profile" && <span className="size-1 rounded-full bg-purple-400 mt-0.5" />}
          </button>
        </div>
      </nav>
    </div>
  );
}
function AdminPanel({ token, readOnly = false }: { token: string; readOnly?: boolean }) {
  const { lang } = useI18n();
  const s = S[lang];
  const restricted = new Set(readOnly ? ["risk", "reports", "markets", "candles", "strategies", "exchanges", "wallet", "vip", "coins", "settings", "connections", "ai"] : []);
  const overview = useQuery(api.dashboard.overview, {});
  const positions = useQuery(api.admin.listOpenPositions, { token });
  const users = useQuery(api.admin.listUsers, { token });
  const transactions = useQuery(api.admin.listTransactions, { token });
  const vipRequests = useQuery(api.admin.listVipRequests, { token });
  const packages = useQuery(api.admin.listVipPackages, {});
  const strategies = useQuery(api.strategies.listStrategies, {});
  const strategyPresets = useQuery(api.strategies.listStrategyPresets, {});
  const markets = useQuery(api.markets.listAllMarkets, {});
  const settings = useQuery(api.settings.allSettings, {});
  const walletAddresses = useQuery(api.admin.listWalletAddresses, {});
  const exchanges = useQuery(api.admin.listExchangeAccounts, { token });
  const notifications = useQuery(api.admin.listNotifications, { token });
  const [adminCat, setAdminCat] = useState("engine");
  const [quickScanBusy, setQuickScanBusy] = useState(false);
  const [reportPeriod, setReportPeriod] = useState("daily");
  const [btSymbol, setBtSymbol] = useState("BTCUSDT");
  const [btTf, setBtTf] = useState("15m");
  const [btExchange, setBtExchange] = useState("auto");
  const [btResult, setBtResult] = useState<any>(null);
  const [btBusy, setBtBusy] = useState(false);
  const testBroker = useAction(api.broker.testConnection);
  const fetchBrokerBalance = useAction(api.broker.fetchBalance);
  const fetchBrokerPositions = useAction(api.broker.fetchPositions);
  const [brokerTest, setBrokerTest] = useState<any>(null);
  const [brokerBalance, setBrokerBalance] = useState<any>(null);
  const [brokerPositions, setBrokerPositions] = useState<any>(null);
  const [brokerBusy, setBrokerBusy] = useState(false);
  const runBrokerTest = async () => {
    setBrokerBusy(true);
    try {
      const r: any = await testBroker({ token });
      setBrokerTest(r);
      if (r?.ok) toast.success(`${r.exchange}${r.testnet ? " (testnet)" : ""} ✓`);
      else toast.error(String(r?.error ?? (lang === "fa" ? "اتصال برقرار نشد" : "connection failed")));
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setBrokerBusy(false);
    }
  };
  const swapwalletOverview = useAction(api.swapwallet.swapwalletOverview);
  const [swapwallet, setSwapwallet] = useState<any>(null);
  const [swapwalletBusy, setSwapwalletBusy] = useState(false);
  const loadSwapwallet = async () => {
    setSwapwalletBusy(true);
    try {
      setSwapwallet(await swapwalletOverview({ token }));
    } catch (e: any) {
      toast.error(e.message || "SwapWallet error");
    } finally {
      setSwapwalletBusy(false);
    }
  };
  const swapwalletSwap = useAction(api.swapwallet.swapwalletSwap);
  const swapwalletOtcQuote = useAction(api.swapwallet.swapwalletOtcQuote);
  const swapwalletOtcExecute = useAction(api.swapwallet.swapwalletOtcExecute);
  const swapwalletWithdrawConfig = useAction(api.swapwallet.swapwalletWithdrawConfig);
  const swapwalletWithdraw = useAction(api.swapwallet.swapwalletWithdraw);
  // SwapWallet management state (key entry, fast-swap, OTC, withdraw)
  const [swKey, setSwKey] = useState("");
  const [swSaveKeyBusy, setSwSaveKeyBusy] = useState(false);
  const [swSrc, setSwSrc] = useState("USDT");
  const [swDst, setSwDst] = useState("TRX");
  const [swAmt, setSwAmt] = useState("");
  const [swSwapBusy, setSwSwapBusy] = useState(false);
  const [swQuote, setSwQuote] = useState<any>(null);
  const [swQuoteBusy, setSwQuoteBusy] = useState(false);
  const [swExecBusy, setSwExecBusy] = useState(false);
  const [swWdToken, setSwWdToken] = useState("USDT");
  const [swWdAmt, setSwWdAmt] = useState("");
  const [swWdNet, setSwWdNet] = useState("");
  const [swWdAddr, setSwWdAddr] = useState("");
  const [swWdMemo, setSwWdMemo] = useState("");
  const [swWdCfg, setSwWdCfg] = useState<any>(null);
  const [swWdBusy, setSwWdBusy] = useState(false);
  const doSaveSwapwalletKey = async () => {
    const k = swKey.trim();
    if (!k) {
      toast.error(lang === "fa" ? "کلید را وارد کنید" : "Enter the API key");
      return;
    }
    setSwSaveKeyBusy(true);
    try {
      await saveSettings({ token, settings: { "swapwallet.apiKey": k } });
      setSwKey("");
      toast.success(lang === "fa" ? "کلید سواپ‌ولت ذخیره شد ✓" : "SwapWallet key saved ✓");
      loadSwapwallet();
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setSwSaveKeyBusy(false);
    }
  };
  const doSwFastSwap = async () => {
    if (!swAmt || Number(swAmt) <= 0) {
      toast.error(lang === "fa" ? "مبلغ معتبر وارد کنید" : "Enter a valid amount");
      return;
    }
    setSwSwapBusy(true);
    try {
      const r: any = await swapwalletSwap({ token, sourceToken: swSrc, destinationToken: swDst, sourceAmount: swAmt });
      if (r?.status === "OK" && r?.result?.trade) {
        const tr = r.result.trade;
        toast.success(lang === "fa" ? `سواپ انجام شد ✓ ${tr.destinationAmount?.number ?? ""} ${tr.destinationAmount?.unit ?? swDst}` : `Swap done ✓ ${tr.destinationAmount?.number ?? ""} ${tr.destinationAmount?.unit ?? swDst}`);
        setSwAmt("");
        loadSwapwallet();
      } else {
        toast.error(lang === "fa" ? `سواپ ناموفق: ${r?.error ?? "خطا"}` : `Swap failed: ${r?.error ?? "error"}`);
      }
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setSwSwapBusy(false);
    }
  };
  const doSwOtcQuote = async () => {
    if (!swAmt || Number(swAmt) <= 0) {
      toast.error(lang === "fa" ? "مبلغ معتبر وارد کنید" : "Enter a valid amount");
      return;
    }
    setSwQuoteBusy(true);
    try {
      const r: any = await swapwalletOtcQuote({ token, sourceToken: swSrc, destinationToken: swDst, sourceAmount: swAmt });
      if (r?.status === "OK" && r?.result?.swapToken) {
        setSwQuote({ ...r.result, src: swSrc, dst: swDst, amt: swAmt });
      } else {
        toast.error(lang === "fa" ? `دریافت قیمت ناموفق: ${r?.error ?? "خطا"}` : `Quote failed: ${r?.error ?? "error"}`);
      }
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setSwQuoteBusy(false);
    }
  };
  const doSwOtcExecute = async () => {
    if (!swQuote?.swapToken) return;
    setSwExecBusy(true);
    try {
      const r: any = await swapwalletOtcExecute({ token, swapToken: swQuote.swapToken });
      if (r?.status === "OK" && r?.result?.trade) {
        const tr = r.result.trade;
        toast.success(lang === "fa" ? `سواپ تأیید شد ✓ ${tr.destinationAmount?.number ?? ""} ${tr.destinationAmount?.unit ?? swQuote.dst}` : `Swap confirmed ✓ ${tr.destinationAmount?.number ?? ""} ${tr.destinationAmount?.unit ?? swQuote.dst}`);
        setSwQuote(null);
        setSwAmt("");
        loadSwapwallet();
      } else {
        toast.error(lang === "fa" ? `تأیید ناموفق: ${r?.error ?? "خطا"}` : `Confirm failed: ${r?.error ?? "error"}`);
      }
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setSwExecBusy(false);
    }
  };
  const doSwWdConfig = async () => {
    setSwWdBusy(true);
    try {
      const r: any = await swapwalletWithdrawConfig({ token, tokenInput: swWdToken });
      setSwWdCfg(r?.status === "OK" ? r.result : null);
      if (r?.status !== "OK") toast.error(lang === "fa" ? `خطا: ${r?.error ?? ""}` : `Error: ${r?.error ?? ""}`);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setSwWdBusy(false);
    }
  };
  const doSwWithdraw = async () => {
    if (!swWdAmt || Number(swWdAmt) <= 0 || !swWdNet || !swWdAddr) {
      toast.error(lang === "fa" ? "مبلغ، شبکه و آدرس را کامل کنید" : "Amount, network and address are required");
      return;
    }
    setSwWdBusy(true);
    try {
      const r: any = await swapwalletWithdraw({ token, withdrawToken: swWdToken, amount: swWdAmt, network: swWdNet, address: swWdAddr, memo: swWdMemo || undefined });
      if (r?.status === "OK") {
        toast.success(lang === "fa" ? "درخواست برداشت ثبت شد ✓" : "Withdrawal submitted ✓");
        setSwWdAmt("");
        setSwWdAddr("");
        setSwWdMemo("");
        loadSwapwallet();
      } else {
        toast.error(lang === "fa" ? `برداشت ناموفق: ${r?.error ?? "خطا"}` : `Withdraw failed: ${r?.error ?? "error"}`);
      }
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setSwWdBusy(false);
    }
  };
  const runBrokerBalance = async () => {
    setBrokerBusy(true);
    try {
      const r: any = await fetchBrokerBalance({ token });
      setBrokerBalance(r);
      setBrokerPositions(await fetchBrokerPositions({ token }));
      if (r?.ok) toast.success(lang === "fa" ? "موجودی دریافت شد ✓" : "Balance fetched ✓");
      else toast.error(String(r?.error ?? ""));
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setBrokerBusy(false);
    }
  };
  const runTuner = useAction(api.engineWorker.runTuner);
  const [tunerResult, setTunerResult] = useState<any>(null);
  const [tunerBusy, setTunerBusy] = useState(false);
  const doTuner = async () => {
    setTunerBusy(true);
    setTunerResult(null);
    try {
      const r: any = await runTuner({ token });
      setTunerResult(r);
      if (r?.results?.length) toast.success(`${r.results.length} combos · best score ${r.best?.score}`);
      else toast.error(lang === "fa" ? "کندل کافی نیست — ابتدا فید بازار را اجرا کنید" : "Not enough candles — run the market feed first");
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setTunerBusy(false);
    }
  };
  const applyTunerCombo = async (params: any) => {
    try {
      await saveSettings({ token, settings: params });
      toast.success(s.saved);
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    }
  };
  const runResearchAction = useAction(api.engineWorker.runResearch);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchText, setResearchText] = useState<string | null>(null);
  const doResearch = async () => {
    setResearchBusy(true);
    setResearchText(null);
    try {
      const r: any = await runResearchAction({ token });
      setResearchText(String(r?.text ?? ""));
      toast.success(lang === "fa" ? "تحقیق بازار ذخیره شد ✓" : "Market research saved ✓");
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setResearchBusy(false);
    }
  };
  const [logLevel, setLogLevel] = useState("ALL");
  const [mktFilter, setMktFilter] = useState<string>("all");
  const [tab, setTab] = useState("overview");
  const [channelMsg, setChannelMsg] = useState("");
  const riskAdvisor = useQuery(api.admin.riskAdvisor, { token });
  const reports = useQuery(api.admin.tradingReports, { token, period: reportPeriod });
  const doBacktest = async () => {
    setBtBusy(true);
    setBtResult(null);
    try {
      const r: any = await runBacktest({ token, symbol: btSymbol, timeframe: btTf, exchange: btExchange === "auto" ? undefined : btExchange });
      setBtResult(r);
      toast.success(`${r.trades} trades · win ${r.winRate}%`);
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setBtBusy(false);
    }
  };
  // Manual trade mode: pick a pair (Markets tab) → engine forces a position
  // open, but still runs the full strategy scan to pick the best direction.
  const doManualOpen = async (symbol: string, side?: "long" | "short") => {
    setManualBusy(symbol);
    setManualResult(null);
    try {
      try {
        await ensureManualCandles({ token, symbol });
      } catch (e: any) {
        toast.error(lang === "fa" ? `دریافت فید زنده ناموفق بود: ${String(e?.message ?? e)}` : `Live feed failed: ${String(e?.message ?? e)}`);
        return;
      }
      const r: any = await manualOpen({ token, symbol, side });
      setManualResult(r);
      if (r?.ok) {
        toast.success(lang === "fa" ? `${fmtSym(r.symbol)} · ${r.side === "long" ? "خرید" : "فروش"} · امتیاز ${r.score} — باز شد ✓` : `${fmtSym(r.symbol)} · ${r.side} · score ${r.score} — opened ✓`);
      } else {
        toast.error(String(r?.error ?? ""));
      }
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setManualBusy(null);
    }
  };
  // AI layer validation: replay real candles and measure the AI's next-candle
  // direction accuracy (configured provider + free fallback chain).
  const doAiBacktest = async () => {
    setAiBtBusy(true);
    setAiBtResult(null);
    try {
      const r: any = await runAiBacktest({ token });
      setAiBtResult(r);
      toast.success(lang === "fa" ? `صحت‌سنجی AI: ${r.accuracy}% (${r.correct}/${r.total})` : `AI validation: ${r.accuracy}% (${r.correct}/${r.total})`);
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setAiBtBusy(false);
    }
  };
  const allTickets = useQuery(api.admin.listAllTickets, { token });
  const referrals = useQuery(api.admin.listReferrals, { token });
  const engineLogs = useQuery(api.admin.listEngineLogs, { token, level: logLevel && logLevel !== "ALL" ? logLevel : undefined });
  const auditLogs = useQuery(api.admin.listAuditLogs, { token });
  const strategyPerf = useQuery(api.admin.listStrategyPerformance, { token });
  const allSignals = useQuery(api.admin.mySignals, { token });
  const [expSignal, setExpSignal] = useState<string | null>(null);
  const closedPositions = useQuery(api.admin.listClosedPositions, { token });
  const learning = useQuery(api.admin.listLearningHistory, { token });
  const aiUsage = useQuery(api.aiChat.listAiUsage, { token });
  const aiProviderHealth = useQuery(api.admin.aiProviderHealth, { token });
  const sendEduChannel = useAction(api.learning.sendEducationToChannel);
  const suggestStrategiesM = useMutation(api.aiChat.suggestStrategies);
  const adminAskWolfAi = useMutation(api.aiChat.askWolfAi);
  const adminChats = useQuery(api.aiChat.myAiChats, { token });
  const [adminAiProvider, setAdminAiProvider] = useState("auto");
  const [adminAiModel, setAdminAiModel] = useState("");
  const [adminAiQ, setAdminAiQ] = useState("");
  const [adminAiPending, setAdminAiPending] = useState(false);
  const [adminAiImg, setAdminAiImg] = useState<string | null>(null);
  const [aiSuggestBusy, setAiSuggestBusy] = useState(false);
  const [eduChannelBusy, setEduChannelBusy] = useState<string | null>(null);
  const clearAiHistoryM = useMutation(api.aiChat.clearAiHistory);
  const deleteAiRowsM = useMutation(api.aiChat.deleteAiRows);
  const [aiClearBusy, setAiClearBusy] = useState<string | null>(null);
  const [candleSymbol, setCandleSymbol] = useState("BTCUSDT");
  const [candleTf, setCandleTf] = useState("15m");
  const [candleOverlay, setCandleOverlay] = useState("none");
  const candleData = useQuery(api.markets.listCandles, { token, symbol: candleSymbol, timeframe: candleTf });
  const ensureCandlesAction = useAction(api.markets.ensureCandles);
  // On-demand fetch: when the requested symbol+timeframe has no stored
  // candles (the cron only syncs 15m/1h), pull live data once.
  const [ensuringTf, setEnsuringTf] = useState<string | null>(null);
  useEffect(() => {
    const empty = candleData !== undefined && (!candleData?.data || candleData.data.length === 0);
    if (!empty || ensuringTf === `${candleSymbol}:${candleTf}`) return;
    setEnsuringTf(`${candleSymbol}:${candleTf}`);
    ensureCandlesAction({ token, symbol: candleSymbol, timeframe: candleTf })
      .catch(() => undefined)
      .finally(() => setEnsuringTf(null));
  }, [candleData, candleSymbol, candleTf]);
  const chartImageFor = useAction(api.adminActions.chartImageFor);
  const [chartImg, setChartImg] = useState<{ b64: string; symbol: string; tf: string } | null>(null);
  const sendChartAction = useAction(api.adminActions.sendChartToChannel);
  const [chartSendBusy, setChartSendBusy] = useState<string | null>(null);
  const doSaveChart = () => {
    if (!chartImg) return;
    try {
      const a = document.createElement("a");
      a.href = `data:image/png;base64,${chartImg.b64}`;
      a.download = `wolfai-${fmtSym(chartImg.symbol)}-${chartImg.tf}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(lang === "fa" ? "تصویر ذخیره شد ✓" : "Image saved ✓");
    } catch {
      toast.error(lang === "fa" ? "ذخیره ناموفق بود" : "Save failed");
    }
  };
  const doSendChart = async (channelLang: "fa" | "en") => {
    setChartSendBusy(channelLang);
    try {
      const r: any = await sendChartAction({ token, symbol: candleSymbol, timeframe: candleTf, lang: channelLang });
      toast.success(
        lang === "fa"
          ? `به کانال ${channelLang === "fa" ? "فارسی" : "انگلیسی"} ارسال شد ✓`
          : `Sent to the ${channelLang.toUpperCase()} channel ✓`,
      );
      void r;
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setChartSendBusy(null);
    }
  };
  const [chartImgBusy, setChartImgBusy] = useState(false);
  const doChartImage = async () => {
    setChartImgBusy(true);
    try {
      const sig = (allSignals ?? []).filter((s: any) => s.symbol === candleSymbol)[0];
      const r: any = await chartImageFor({
        token,
        symbol: candleSymbol,
        timeframe: candleTf,
        entry: sig?.entry,
        stopLoss: sig?.stopLoss,
        takeProfit: sig?.takeProfit,
      });
      if (!r?.pngBase64) throw new Error(lang === "fa" ? "تصویری تولید نشد (کندل نداریم)" : "no image (no candles)");
      setChartImg({ b64: r.pngBase64, symbol: r.symbol, tf: r.timeframe });
      toast.success(lang === "fa" ? `تصویر چارت ${fmtSym(r.symbol)} تولید شد ✓` : `${fmtSym(r.symbol)} chart image ready ✓`);
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setChartImgBusy(false);
    }
  };
  const doClearAiHistory = async (kind?: string) => {
    setAiClearBusy(kind ?? "all");
    try {
      const r: any = await clearAiHistoryM({ token, kind });
      toast.success(lang === "fa" ? `پاک شد: ${r?.deleted ?? 0} ردیف` : `Deleted: ${r?.deleted ?? 0} rows`);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setAiClearBusy(null);
    }
  };
  const doDeleteAiRows = async (id: any) => {
    try {
      await deleteAiRowsM({ token, ids: [id] });
      toast.success(s.saved);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };
  const allMarkets = useQuery(api.markets.listAllMarkets, {});
  const vouchers = useQuery(api.coins.listVouchers, { token });
  const coinLedger = useQuery(api.coins.listCoinTransactions, { token });

  const closePosition = useMutation(api.admin.closePosition);
  const reviewTransaction = useMutation(api.admin.reviewTransaction);
  const reviewVip = useMutation(api.admin.reviewVip);
  const createUser = useMutation(api.admin.createUser);
  const setUserEnabled = useMutation(api.admin.setUserEnabled);
  const setUserRole = useMutation(api.admin.setUserRole);
  const resetData = useMutation(api.admin.resetData);
  const exportData = useMutation(api.admin.exportData);
  const importData = useMutation(api.admin.importData);
  const reportFileRef = useRef<HTMLInputElement | null>(null);

  const doExportReport = async () => {
    try {
      const r: any = await exportData({ token });
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trading-wolf-report-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(lang === "fa" ? "گزارش دانلود شد ✓" : "Report downloaded ✓");
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    }
  };
  const doImportReport = async (ev: any) => {
    const file: File | undefined = ev?.target?.files?.[0];
    if (ev?.target) ev.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const data = (json && typeof json === "object" && json.data) ? json.data : json;
      const res: any = await importData({ token, data });
      const c = res?.counts ? Object.entries(res.counts).filter(([, n]) => Number(n) > 0).map(([t, n]) => `${t}=${n}`).join(", ") : "";
      toast.success(lang === "fa" ? `گزارش وارد شد ✓ ${c}` : `Report imported ✓ ${c}`);
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    }
  };
  const setUserPassword = useMutation(api.admin.setUserPassword);
  const saveSettings = useMutation(api.admin.saveSettings);
  const engineControl = useMutation(api.admin.engineControl);
  const toggleStrategy = useMutation(api.strategies.toggleStrategy);
  const applyStrategyPreset = useMutation(api.strategies.applyStrategyPreset);
  const applyMultipleStrategyPresets = useMutation(api.strategies.applyMultipleStrategyPresets);
  const [multiPresetMode, setMultiPresetMode] = useState(false);
  const [selectedPresets, setSelectedPresets] = useState<string[]>([]);
  const toggleMarket = useMutation(api.markets.toggleMarket);
  const runScanNow = useMutation(api.engineWorker.runScanNow);
  const runBacktest = useMutation(api.engineWorker.runBacktest);
  const adminSendChatM = useMutation(api.telegram.adminSendChat);
  const saveWalletAddress = useMutation(api.admin.saveWalletAddress);
  const removeWalletAddress = useMutation(api.admin.removeWalletAddress);
  const saveExchange = useMutation(api.admin.saveExchangeAccount);
  const testAi = useMutation(api.aiChat.testAi);
  const removeExchange = useMutation(api.admin.removeExchangeAccount);
  const setExchangeEnabled = useMutation(api.admin.setExchangeEnabled);
  const manualOpen = useMutation(api.engineWorker.manualOpen);
  const ensureManualCandles = useAction(api.engineWorker.ensureManualCandles);
  const tgTestBot = useAction(api.nodeCalls.telegramTestBot);
  const tgTestChannels = useAction(api.nodeCalls.telegramTestChannels);
  const tgSetupWebhook = useAction(api.nodeCalls.telegramSetupWebhook);
  const tgGetWebhookInfo = useAction(api.nodeCalls.telegramGetWebhookInfo);
  const [tgInfo, setTgInfo] = useState<any>(null);
  const [tgInfoBusy, setTgInfoBusy] = useState(false);
  const doTgInfo = async () => {
    setTgInfoBusy(true);
    setTgInfo(null);
    try {
      const r: any = await tgGetWebhookInfo({ token });
      setTgInfo(r);
      if (r?.ok) toast.success(lang === "fa" ? "وضعیت وبهوک دریافت شد ✓" : "Webhook status fetched ✓");
      else toast.error(String(r?.error ?? ""));
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setTgInfoBusy(false);
    }
  };
  const [tgBusy, setTgBusy] = useState<string | null>(null);
  const [tgTest, setTgTest] = useState<any>(null);
  const [tgChan, setTgChan] = useState<any>(null);
  const [tgHook, setTgHook] = useState<any>(null);
  const doTgTestBot = async () => {
    setTgBusy("bot");
    setTgTest(null);
    try {
      const r: any = await tgTestBot({ token });
      setTgTest(r);
      if (r?.ok) toast.success(lang === "fa" ? "اتصال ربات برقرار است ✓" : "Bot connected ✓");
      else toast.error(String(r?.error ?? (r?.adminSent?.reason ?? "")));
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setTgBusy(null);
    }
  };
  const doTgTestChannels = async () => {
    setTgBusy("channels");
    setTgChan(null);
    try {
      const r: any = await tgTestChannels({ token });
      setTgChan(r);
      if (r?.ok) toast.success(lang === "fa" ? "پیام تست به کانال‌ها ارسال شد ✓" : "Test sent to channels ✓");
      else toast.error(String(r?.error ?? ""));
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setTgBusy(null);
    }
  };
  const doTgWebhook = async () => {
    setTgBusy("hook");
    setTgHook(null);
    try {
      // Priority: the webhook URL the admin typed in the form (https) — never
      // fall back to window.location.origin, which on the self-hosted server is
      // http://IP and Telegram rejects. Derive only when the box is empty.
      const typedUrl = String(fields["telegram.webhookUrl"] ?? "").trim();
      const envUrl = (import.meta.env.VITE_CONVEX_URL as string)?.trim();
      const previewHost = window.location.hostname.match(/^\d+-(.+)$/);
      const publicBase = typedUrl.startsWith("https://")
        ? typedUrl
        : previewHost
          ? `https://3210-${previewHost[1]}`
          : envUrl && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(envUrl)
            ? envUrl
            : window.location.origin;
      // Send the REAL bot token from the form field (never a masked placeholder)
      // so the server can persist + use it immediately.
      const botTokField = String(fields["telegram.token"] ?? "").trim();
      const r: any = await tgSetupWebhook({
        token,
        botToken: botTokField && !/[•…*]{3,}/.test(botTokField) ? botTokField : undefined,
        publicUrl: publicBase,
      });
      setTgHook(r);
      if (r?.ok) {
        // Reflect the effective URL + auto-generated secret back into the form
        // so the admin sees exactly what Telegram is configured with.
        if (r?.webhookUrl) String(fields["telegram.webhookUrl"] ?? "") !== r.webhookUrl && setFields((f) => ({ ...f, "telegram.webhookUrl": r.webhookUrl }));
        if (r?.webhookSecret) String(fields["telegram.webhookSecret"] ?? "") !== r.webhookSecret && setFields((f) => ({ ...f, "telegram.webhookSecret": r.webhookSecret }));
        toast.success(lang === "fa" ? "وبهوک متصل شد ✓" : "Webhook connected ✓");
      } else toast.error(String(r?.error ?? (r?.hint ?? "")));
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setTgBusy(null);
    }
  };
  const [manualBusy, setManualBusy] = useState<string | null>(null);
  const [manualResult, setManualResult] = useState<any>(null);
  const runAiBacktest = useAction(api.engineWorker.runAiBacktest);
  const [aiBtBusy, setAiBtBusy] = useState(false);
  const [aiBtResult, setAiBtResult] = useState<any>(null);
  const [exTest, setExTest] = useState<Record<string, any>>({});
  const createNotification = useMutation(api.admin.createNotification);
  const emergencyStop = useMutation(api.admin.emergencyStop);
  const pauseNewTrades = useMutation(api.admin.pauseNewTrades);
  const closeAllPositions = useMutation(api.admin.closeAllPositions);
  const serverStatsA = useAction(api.monitor.serverStats);
  const [mon, setMon] = useState<any>(null);
  const [monBusy, setMonBusy] = useState(false);
  const doMonitor = async () => {
    setMonBusy(true);
    try {
      const r: any = await serverStatsA({ token });
      setMon(r);
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setMonBusy(false);
    }
  };
  useEffect(() => {
    void doMonitor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fmtUp = (sec: number) => {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };
  const applyRiskPreset = useMutation(api.admin.applyRiskPreset);
  const refreshPerf = useMutation(api.admin.refreshStrategyPerformance);
  const replyTicket = useMutation(api.admin.replyTicket);
  const setTicketStatus = useMutation(api.admin.setTicketStatus);
  const createTicket = useMutation(api.admin.createTicket);
  const sendPositionToTelegram = useAction(api.adminActions.sendPositionToChannels);
  const sendAllPositionsToTelegram = useMutation(api.admin.sendAllPositionsToTelegram);
  const sendSignalToChannel = useAction(api.adminActions.sendSignalToChannel);
  const [sigTgBusy, setSigTgBusy] = useState<string | null>(null);
  const doSendSignal = async (signalId: any, langCode: "fa" | "en") => {
    setSigTgBusy(`${signalId}:${langCode}`);
    try {
      await sendSignalToChannel({ token, signalId, lang: langCode });
      toast.success(s.saved);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setSigTgBusy(null);
    }
  };
  const createVoucher = useMutation(api.coins.createVoucher);
  const toggleVoucher = useMutation(api.coins.toggleVoucher);
  const saveVipPkg = useMutation(api.admin.saveVipPackage);

  const eduAll = useQuery(api.learning.listEducation, { token });
  const triggerEdu = useAction(api.learning.triggerEducation);
  const reviewEdu = useMutation(api.learning.reviewEducation);
  const regenEduMedia = useAction(api.learning.regenerateLessonMedia);
  const [eduFilter, setEduFilter] = useState("pending");
  const [eduBusy, setEduBusy] = useState(false);
  const doEduGenerate = async () => {
    setEduBusy(true);
    try {
      const r: any = await triggerEdu({ token });
      toast.success(r?.status === "approved" ? (lang === "fa" ? "درس تولید و منتشر شد ✓" : "Lesson generated & published ✓") : (lang === "fa" ? "درس تولید شد — در انتظار تأیید مدیر" : "Lesson generated — pending admin approval"));
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setEduBusy(false);
    }
  };
  const doEduReview = async (id: any, status: string) => {
    try {
      await reviewEdu({ token, id, status });
      toast.success(s.saved);
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    }
  };
  const doEduRegenMedia = async (id: any, kind: "image" | "audio") => {
    setEduChannelBusy(`${id}:media-${kind}`);
    try {
      await regenEduMedia({ token, id, kind });
      toast.success(kind === "image" ? (lang === "fa" ? "عکس درس تولید شد ✓" : "Lesson image generated ✓") : (lang === "fa" ? "صدای درس تولید شد ✓" : "Lesson voice generated ✓"));
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setEduChannelBusy(null);
    }
  };
  const doEduChannelSend = async (id: any, chLang: "fa" | "en") => {
    setEduChannelBusy(`${id}:${chLang}`);
    try {
      await sendEduChannel({ token, id, lang: chLang });
      toast.success(chLang === "fa" ? (lang === "fa" ? "به کانال فارسی ارسال شد ✓" : "Sent to the Persian channel ✓") : (lang === "fa" ? "به کانال انگلیسی ارسال شد ✓" : "Sent to the English channel ✓"));
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setEduChannelBusy(null);
    }
  };
  const doAdminAsk = async () => {
    const q = adminAiQ.trim();
    if (!q || adminAiPending) return;
    setAdminAiPending(true);
    try {
      await adminAskWolfAi({
        token,
        question: q,
        scope: "admin",
        provider: adminAiProvider !== "auto" && adminAiProvider !== "random" ? adminAiProvider : undefined,
        model: adminAiModel.trim() || undefined,
        image: adminAiImg ?? undefined,
      });
      setAdminAiQ("");
      setAdminAiImg(null);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setAdminAiPending(false);
    }
  };
  const doSuggest = async () => {
    setAiSuggestBusy(true);
    try {
      await suggestStrategiesM({ token });
      toast.success(lang === "fa" ? "تحقیق استراتژی شروع شد — نتیجه پایین ظاهر می‌شود" : "Strategy research started — result appears below");
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    } finally {
      setAiSuggestBusy(false);
    }
  };
  const dbLive = (() => {
    const envUrl = (import.meta.env.VITE_CONVEX_URL as string)?.trim();
    const previewHost = window.location.hostname.match(/^\d+-(.+)$/);
    const base = previewHost ? `https://3210-${previewHost[1]}` : envUrl || window.location.origin;
    try {
      const u = new URL(base);
      return {
        host: u.hostname,
        port: u.port || (u.protocol === "https:" ? "443" : "80"),
        name: u.pathname.split("/").filter(Boolean).pop() || "default",
        user: "—",
        url: base,
      };
    } catch {
      return { host: "", port: "", name: "", user: "—", url: "" };
    }
  })();
  const effectiveWebhookUrl = dbLive.url ? `${dbLive.url.replace(/\/+$/, "")}/telegram/webhook` : "";

  const [form, setForm] = useState({ username: "", password: "", name: "", role: "user" });
  const [cfg, setCfg] = useState<Record<string, boolean>>({});
  const [fields, setFields] = useState<Record<string, string>>({});
  // Snapshot of the last server-pushed field values. Any field the user has
  // changed since (typed, a prefill button, a slider) must NOT be clobbered by
  // a settings refetch. REST refetches after every write; the old guard only
  // skipped while an <input> was focused, so clicking «استفاده از آدرس فعلی»
  // filled the webhook box and the next refetch immediately wiped it.
  const fieldsSnapshotRef = useRef<Record<string, string>>({});
  const [ttsTesting, setTtsTesting] = useState(false);
  const [ttsTestResult, setTtsTestResult] = useState<{ ok: boolean; models?: number; status?: number; error?: string } | null>(null);
  const edgeTtsHealth = useAction(api.nodeCalls.edgeTtsHealth);
  const [addrForm, setAddrForm] = useState({ asset: "USDT", network: "TRC20", address: "", memo: "", kind: "deposit" });
  const [exForm, setExForm] = useState({ name: "", provider: "bingx", apiKey: "", apiSecret: "", passphrase: "", accountId: "", environment: "demo" as "demo" | "live" });
  const [ntf, setNtf] = useState({ type: "system", titleFa: "", textFa: "", titleEn: "", textEn: "", broadcast: true });
  const [closeAllConfirm, setCloseAllConfirm] = useState("");
  const [ticketForm, setTicketForm] = useState({ subject: "", message: "" });
  const [ticketReply, setTicketReply] = useState<Record<string, string>>({});
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const [detailUser, setDetailUser] = useState<Id<"users"> | null>(null);
  const [userQ, setUserQ] = useState("");
  const userSearchRes = useQuery(api.admin.userSearch, { token, q: userQ });
  const [txReason, setTxReason] = useState<Record<string, string>>({});
  const [voucherForm, setVoucherForm] = useState({ code: "", coins: "", uses: "1" });
  const [pkgEdit, setPkgEdit] = useState<string | null>(null);
  const [pkgForm, setPkgForm] = useState<any>(null);
  const [packagesJson, setPackagesJson] = useState("");

  useEffect(() => {
    if (settings) {
      // REST mode refetches settings after every write; never clobber a field the
      // user is actively typing in (Telegram token / numeric IDs used to reset).
      const _ae = document.activeElement as HTMLElement | null;
      const _tag = _ae?.tagName ?? "";
      if (_tag === "INPUT" || _tag === "TEXTAREA" || _tag === "SELECT") return;
      const nextFields: Record<string, string> = {
        "telegram.token": String(settings["telegram.token"] ?? ""), // masked — only sent when changed
        "telegram.username": String(settings["telegram.username"] ?? ""),
        "auth.sessionHours": String(settings["auth.sessionHours"] ?? "1"),
        "telegram.adminId": String(settings["telegram.adminId"] ?? ""),
        "telegram.assistantId": String(settings["telegram.assistantId"] ?? ""),
        "channel.id": String(settings["channel.id"] ?? ""),
        "channel.username": String(settings["channel.username"] ?? ""),
        "channel.inviteLink": String(settings["channel.inviteLink"] ?? ""),
        "channel.enId": String(settings["channel.enId"] ?? ""),
        "channel.enUsername": String(settings["channel.enUsername"] ?? ""),
        "channel.enInviteLink": String(settings["channel.enInviteLink"] ?? ""),
        "telegram.webhookUrl": String(settings["telegram.webhookUrl"] ?? ""),
        "telegram.webhookSecret": String(settings["telegram.webhookSecret"] ?? ""),
        "telegram.miniAppUrl": String(settings["telegram.miniAppUrl"] ?? ""),
        "db.host": String(settings["db.host"] ?? ""),
        "db.port": String(settings["db.port"] ?? "5432"),
        "db.name": String(settings["db.name"] ?? ""),
        "db.user": String(settings["db.user"] ?? ""),
        "db.password": String(settings["db.password"] ?? ""),
        "system.domain": String(settings["system.domain"] ?? ""),
        "system.serverIp": String(settings["system.serverIp"] ?? ""),
        "engine.capital": String(settings["engine.capital"] ?? "1000"),
        "engine.realizedPnl": String(settings["engine.realizedPnl"] ?? "0"), // engine-managed, display only
        "risk.virtualCapital": String(settings["risk.virtualCapital"] ?? "1000"),
        "risk.realCapital": String(settings["risk.realCapital"] ?? "100"),
        "risk.riskPerTrade": String(settings["risk.riskPerTrade"] ?? "1.5"),
        "risk.maxLeverage": String(settings["risk.maxLeverage"] ?? "20"),
        "risk.maxExposure": String(settings["risk.maxExposure"] ?? "35"),
        "risk.maxPosition": String(settings["risk.maxPosition"] ?? "12"),
        "risk.maxOpenPositions": String(settings["risk.maxOpenPositions"] ?? "8"),
        "risk.maxSymbolExposure": String(settings["risk.maxSymbolExposure"] ?? "15"),
        "risk.maxDailyLoss": String(settings["risk.maxDailyLoss"] ?? "8"),
        "risk.maxDailyTrades": String(settings["risk.maxDailyTrades"] ?? "12"),
        "risk.maxDrawdown": String(settings["risk.maxDrawdown"] ?? "20"),
        "risk.minRR": String(settings["risk.minRR"] ?? "1.2"),
        "risk.minScore": String(settings["risk.minScore"] ?? "75"),
        "risk.minConfidence": String(settings["risk.minConfidence"] ?? "0.5"),
        "risk.maxScaleIn": String(settings["risk.maxScaleIn"] ?? "0"),
        "risk.maxReentry": String(settings["risk.maxReentry"] ?? "0"),
        "risk.trailingStop": String(settings["risk.trailingStop"] ?? "false"),
        "risk.roiEnabled": String(settings["risk.roiEnabled"] ?? "false"),
        "risk.roiTable": String(settings["risk.roiTable"] ?? ""),
        "risk.cooldownMinutes": String(settings["risk.cooldownMinutes"] ?? "0"),
        "engine.symbolScannerLimit": String(settings["engine.symbolScannerLimit"] ?? "40"),
        "engine.maxTotalPositions": String(settings["engine.maxTotalPositions"] ?? "8"),
        "engine.scanIntervalMinutes": String(settings["engine.scanIntervalMinutes"] ?? "1"),
        "engine.loopSeconds": String(settings["engine.loopSeconds"] ?? "60"),
        "markets.priceSeconds": String(settings["markets.priceSeconds"] ?? "300"),
        "markets.candleSeconds": String(settings["markets.candleSeconds"] ?? "900"),
        "fees.takerPct": String(settings["fees.takerPct"] ?? "0.1"),
        "fees.makerPct": String(settings["fees.makerPct"] ?? "0.05"),
        "fees.transferPct": String(settings["fees.transferPct"] ?? "0.5"),
        "fees.transferFlatUsdt": String(settings["fees.transferFlatUsdt"] ?? "1"),
        "fees.platformNormal": String(settings["fees.platformNormal"] ?? "50"),
        "fees.platformBronze": String(settings["fees.platformBronze"] ?? "30"),
        "fees.platformSilver": String(settings["fees.platformSilver"] ?? "15"),
        "fees.platformGold": String(settings["fees.platformGold"] ?? "10"),
        "fees.platformPlatinum": String(settings["fees.platformPlatinum"] ?? "10"),
        "fees.includePlatformCommission": settings["fees.includePlatformCommission"] !== false ? "true" : "false",
        "ai.provider": String(settings["ai.provider"] ?? "gemini"),
        "ai.model": String(settings["ai.model"] ?? "gemini-3.6-flash"),
        "ai.key": String(settings["ai.key"] ?? ""), // masked — only sent when changed
        "ai.provider2": String(settings["ai.provider2"] ?? "openai"),
        "ai.model2": String(settings["ai.model2"] ?? "gpt-4o-mini"),
        "ai.key2": String(settings["ai.key2"] ?? ""),
        "ai.freeFallback": settings["ai.freeFallback"] !== false ? "true" : "false",
        "tts.enabled": settings["tts.enabled"] !== false ? "true" : "false",
        "tts.baseUrl": String(settings["tts.baseUrl"] ?? "http://127.0.0.1:5050/v1"),
        "tts.voice": String(settings["tts.voice"] ?? "fa-IR-FaridNeural"),
        "tts.speed": String(settings["tts.speed"] ?? "1"),
        "tts.apiKey": String(settings["tts.apiKey"] ?? ""),
        "ai.enabled": settings["ai.enabled"] !== false ? "true" : "false",
        "ai.randomProvider": settings["ai.randomProvider"] !== false ? "true" : "false",
        "ai.selfVerify": settings["ai.selfVerify"] === true ? "true" : "false",
        "ai.secondaryEnabled": settings["ai.secondaryEnabled"] === true ? "true" : "false",
        "ai.rotationMinutes": String(settings["ai.rotationMinutes"] ?? "5"),
        "ai.postEntryReviewMinutes": String(settings["ai.postEntryReviewMinutes"] ?? "30"),
        "markets.syncMinutes": String(settings["markets.syncMinutes"] ?? "15"),
        "markets.pricesMinutes": String(settings["markets.pricesMinutes"] ?? "5"),
        "chat.purgeHours": String(settings["chat.purgeHours"] ?? "6"),
        "ai.learningReviewHours": String(settings["ai.learningReviewHours"] ?? "6"),
        "learning.educationHourUTC": String(settings["learning.educationHourUTC"] ?? "4"),
        "data.pruneHours": String(settings["data.pruneHours"] ?? "12"),
        "usdt.rate": String(settings["usdt.rate"] ?? "1.0"),
        "usdt.network": String(settings["usdt.network"] ?? "TRC20"),
        "engine.tradeType": String(settings["engine.tradeType"] ?? "futures"),
        "usdt.tomanRate": String(settings["usdt.tomanRate"] ?? "95000"),
        "coins.tomanPerCoin": String(settings["coins.tomanPerCoin"] ?? "5000"),
        "coins.coinPerHour": String(settings["coins.coinPerHour"] ?? "60"),
        "coins.aiCost": String(settings["coins.aiCost"] ?? "50"),
        "coins.rewardProfile": String(settings["coins.rewardProfile"] ?? "10"),
        "coins.rewardPrediction": String(settings["coins.rewardPrediction"] ?? "5"),
        "coins.rewardReferral": String(settings["coins.rewardReferral"] ?? "0"),
        "coins.rewardReferralNew": String(settings["coins.rewardReferralNew"] ?? "5"),
        "vip.minCapital": String(settings["vip.minCapital"] ?? "20"),
        "wallet.tomanCard": String(settings["wallet.tomanCard"] ?? ""),
        "wallet.tomanCardHolder": String(settings["wallet.tomanCardHolder"] ?? ""),
        "support.botUsername": String(settings["support.botUsername"] ?? ""),
        "support.vipUsername": String(settings["support.vipUsername"] ?? "Mamadmari"),
      };
      // Merge server values but NEVER overwrite a field the user changed
      // since the last successful sync (typing, a prefill button, a slider).
      setFields((cur) => {
        const merged: Record<string, string> = { ...nextFields };
        for (const k of Object.keys(merged)) {
          if (cur[k] !== undefined && cur[k] !== fieldsSnapshotRef.current[k]) merged[k] = cur[k];
        }
        return merged;
      });
      fieldsSnapshotRef.current = nextFields;
      setCfg({
        "engine.enabled": Boolean(settings["engine.enabled"]),
        "engine.autonomous": Boolean(settings["engine.autonomous"]),
        "engine.useAI": Boolean(settings["engine.useAI"]),
        "telegram.enabled": Boolean(settings["telegram.enabled"]),
        "channel.postTrades": Boolean(settings["channel.postTrades"]),
        "channel.postSignals": Boolean(settings["channel.postSignals"]),
        "trading.liveTradingEnabled": Boolean(settings["trading.liveTradingEnabled"]),
        "engine.emergencyStop": Boolean(settings["engine.emergencyStop"]),
        "engine.pauseNewTrades": Boolean(settings["engine.pauseNewTrades"]),
        "coins.enabled": settings["coins.enabled"] !== false,
        "coins.referralEnabled": settings["coins.referralEnabled"] !== false,
      });
      setPackagesJson(JSON.stringify(settings["coins.packages"] ?? [], null, 1));
    }
  }, [settings]);

  const engine = overview?.engine;
  const pos = overview?.positions;

  const doCreateUser = async () => {
    if (!form.username.trim() || form.password.length < 6) return toast.error(s.password);
    try {
      await createUser({ token, username: form.username.trim(), password: form.password, name: form.name.trim() || form.username.trim(), role: form.role });
      toast.success(s.created);
      setForm({ username: "", password: "", name: "", role: "user" });
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doToggle = async (key: string, val: boolean) => {
    setCfg((c) => ({ ...c, [key]: val }));
    try {
      await engineControl({
        token,
        engineEnabled: key === "engine.enabled" ? val : undefined,
        autonomous: key === "engine.autonomous" ? val : undefined,
        useAI: key === "engine.useAI" ? val : undefined,
        telegramEnabled: key === "telegram.enabled" ? val : undefined,
        channelPostTrades: key === "channel.postTrades" ? val : undefined,
        channelPostSignals: key === "channel.postSignals" ? val : undefined,
        liveTradingEnabled: key === "trading.liveTradingEnabled" ? val : undefined,
      });
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const NUMERIC_KEYS = new Set([
    "auth.sessionHours",
    "telegram.adminId",
    "telegram.assistantId",
    "channel.id",
    "db.port",
    "engine.capital",
    "risk.virtualCapital",
    "risk.realCapital",
    "risk.riskPerTrade",
    "risk.maxLeverage",
    "risk.maxExposure",
    "risk.maxPosition",
    "risk.maxOpenPositions",
    "risk.maxSymbolExposure",
    "risk.maxDailyLoss",
    "risk.maxDailyTrades",
    "risk.maxDrawdown",
    "risk.minRR",
    "risk.minScore",
    "risk.minConfidence",
    "risk.maxScaleIn",
    "risk.maxReentry",
    "risk.cooldownMinutes",
    "engine.symbolScannerLimit",
    "engine.maxTotalPositions",
    "engine.scanIntervalMinutes",
    "usdt.tomanRate",
    "coins.tomanPerCoin",
    "coins.coinPerHour",
    "coins.aiCost",
    "coins.rewardProfile",
    "coins.rewardPrediction",
    "coins.rewardReferral",
    "coins.rewardReferralNew",
    "vip.minCapital",
    "ai.rotationMinutes",
    "ai.postEntryReviewMinutes",
    "markets.syncMinutes",
    "markets.pricesMinutes",
    "chat.purgeHours",
    "ai.learningReviewHours",
    "learning.educationHourUTC",
    "data.pruneHours",
    "tts.speed",
  ]);

  const doTtsTest = async () => {
    setTtsTesting(true);
    setTtsTestResult(null);
    const ttsBase = String(fields["tts.baseUrl"] ?? "").trim();
    if (!ttsBase || /^https?:\/\/(127\.0\.0\.1|localhost)/.test(ttsBase)) {
      setTtsTestResult({ ok: false, error: lang === "fa" ? "آدرس سرور را تنظیم کنید — سرور self-hosted باید از اینترنت در دسترس باشد (آدرس عمومی، نه localhost)." : "Set the server URL — the self-hosted server must be publicly reachable (public address, not localhost)." });
      setTtsTesting(false);
      return;
    }
    try {
      const r: any = await edgeTtsHealth({ baseUrl: fields["tts.baseUrl"], apiKey: fields["tts.apiKey"] });
      setTtsTestResult({ ok: Boolean(r?.ok), models: r?.models?.length ?? 0, status: r?.status, error: r?.error });
    } catch (e: any) {
      setTtsTestResult({ ok: false, error: String(e?.message ?? "error") });
    } finally {
      setTtsTesting(false);
    }
  };

  const doSaveSettings = async () => {
    try {
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (k === "ai.key" || k === "ai.key2" || k === "telegram.token" || k === "telegram.webhookSecret" || k === "db.password" || k === "tts.apiKey") {
          const sv = String(v ?? "").trim();
          if (!sv || /[•…*]{3,}/.test(sv)) continue; // empty or masked placeholder → keep stored value
        }
        payload[k] = NUMERIC_KEYS.has(k) ? Number(v) : v;
      }
      if (packagesJson.trim()) {
        try {
          const arr = JSON.parse(packagesJson);
          if (Array.isArray(arr)) payload["coins.packages"] = arr;
        } catch {
          toast.error(lang === "fa" ? "فرمت JSON بسته‌های سکه نادرست است" : "Invalid coin packages JSON");
          return;
        }
      }
      await saveSettings({ token, settings: payload });
      toast.success(s.saved);
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doAddAddress = async () => {
    if (!addrForm.address.trim()) return toast.error(s.address);
    try {
      await saveWalletAddress({ token, asset: addrForm.asset, network: addrForm.network, address: addrForm.address.trim(), memo: addrForm.memo.trim() || undefined, kind: addrForm.kind });
      toast.success(s.saved);
      setAddrForm({ asset: "USDT", network: "TRC20", address: "", memo: "", kind: "deposit" });
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doAddExchange = async () => {
    if (!exForm.name.trim() || !exForm.apiKey.trim() || !exForm.apiSecret.trim()) return toast.error(s.apiKey);
    try {
      await saveExchange({
        token,
        name: exForm.name.trim(),
        provider: exForm.provider,
        apiKey: exForm.apiKey.trim(),
        apiSecret: exForm.apiSecret.trim(),
        passPhrase: exForm.passphrase.trim() || undefined,
        accountId: exForm.accountId.trim() || undefined,
        environment: exForm.environment,
        enabled: true,
      });
      toast.success(s.saved);
      setExForm({ name: "", provider: "bingx", apiKey: "", apiSecret: "", passphrase: "", accountId: "", environment: "demo" });
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doSendAlert = async () => {
    if (!ntf.titleFa.trim()) return toast.error(s.alertTitle);
    try {
      await createNotification({
        token,
        type: ntf.type,
        titleFa: ntf.titleFa.trim(),
        textFa: ntf.textFa.trim() || undefined,
        titleEn: ntf.titleEn.trim() || undefined,
        textEn: ntf.textEn.trim() || undefined,
        broadcast: ntf.broadcast,
      });
      toast.success(s.saved);
      setNtf({ type: "system", titleFa: "", textFa: "", titleEn: "", textEn: "", broadcast: true });
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const doTicket = async () => {
    if (!ticketForm.subject.trim() || !ticketForm.message.trim()) return toast.error(s.message);
    try {
      await createTicket({ token, subject: ticketForm.subject.trim(), message: ticketForm.message.trim() });
      toast.success(s.saved);
      setTicketForm({ subject: "", message: "" });
    } catch (e: any) {
      toast.error(String(e?.message ?? "error"));
    }
  };

  const toggleGroups: Array<[string, string]> = [
    [s.autonomous, "engine.autonomous"],
    [s.useAI, "engine.useAI"],
    [s.tgEnabled, "telegram.enabled"],
    [s.liveTrading, "trading.liveTradingEnabled"],
    [s.channelTrades, "channel.postTrades"],
    [s.channelSignals, "channel.postSignals"],
  ];

  const adminCategories = [
    { key: "engine", icon: "🐺", title: lang === "fa" ? "موتور و معاملات" : "Engine & trades", tabs: [["overview", s.tabOverview], ["positions", s.tabPositions], ["risk", s.tabRisk], ["reports", s.tabReports]].filter(([v]: any) => !restricted.has(v)) },
    { key: "markets", icon: "📊", title: lang === "fa" ? "بازارها و استراتژی" : "Markets & strategy", tabs: [["markets", s.tabMarkets], ["candles", lang === "fa" ? "کندل و چارت" : "Candles"], ["strategies", s.tabStrategies], ["exchanges", s.tabExchanges]].filter(([v]: any) => !restricted.has(v)) },
    { key: "users", icon: "👥", title: lang === "fa" ? "کاربران و مالی" : "Users & finance", tabs: [["users", s.tabUsers], ["wallet", s.tabWallet], ["vip", s.tabVip], ["coins", s.tabCoins], ["referral", s.tabReferral]].filter(([v]: any) => !restricted.has(v)) },
    { key: "comms", icon: "📣", title: lang === "fa" ? "ارتباطات و پشتیبانی" : "Comms & support", tabs: [["notifications", s.tabNotifications], ["support", s.tabSupport]].filter(([v]: any) => !restricted.has(v)) },
    { key: "system", icon: "⚙️", title: lang === "fa" ? "سیستم و AI" : "System & AI", tabs: [["ai", s.ai], ["logs", s.tabLogs], ["settings", s.tabSettings], ["connections", lang === "fa" ? "اتصالات" : "Connections"], ["swapwallet", "سواپ‌ولت"], ["monitor", lang === "fa" ? "مانیتورینگ" : "Monitor"]].filter(([v]: any) => !restricted.has(v)) },
  ].filter((g: any) => g.tabs.length > 0);

  const activeCategoryGroup = adminCategories.find((g) => g.key === adminCat) || adminCategories[0];

  return (
    <Tabs value={tab} onValueChange={setTab} dir={lang === "fa" ? "rtl" : "ltr"}>
      {/* ── Admin Engine Live Control Bar (Responsive) ────────────────────────── */}
      <div className="mb-4 overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/10 via-card/70 to-card p-3 sm:p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-300">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              {cfg["engine.autonomous"] !== false ? (lang === "fa" ? "موتور خودکار فعال" : "Autonomous Active") : (lang === "fa" ? "موتور متوقف" : "Engine Paused")}
            </span>
            <span className="rounded-lg border border-border/60 bg-background/50 px-2.5 py-1 text-xs text-muted-foreground">
              {s.positionsOpen}: <b className="terminal-font text-foreground">{pos?.open ?? 0}</b>
            </span>
            <span className="hidden sm:inline-block rounded-lg border border-border/60 bg-background/50 px-2.5 py-1 text-xs text-muted-foreground">
              {s.floating}: <b className={`terminal-font ${(pos?.openPnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{pnlText(pos?.openPnl)}</b>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10 text-xs"
              onClick={async () => {
                setQuickScanBusy(true);
                try {
                  await runScanNow({ token });
                  toast.success(s.saved);
                } catch (e: any) {
                  toast.error(String(e?.message ?? e));
                } finally {
                  setQuickScanBusy(false);
                }
              }}
              disabled={quickScanBusy || readOnly}
            >
              <Zap className={`size-3.5 ${quickScanBusy ? "animate-spin" : ""}`} />
              {quickScanBusy ? (lang === "fa" ? "در حال اسکن..." : "Scanning...") : s.scanNow}
            </Button>
            <Button
              size="sm"
              variant={cfg["engine.emergencyStop"] ? "destructive" : "outline"}
              className="h-8 gap-1 text-xs border-red-400/40 text-red-300 hover:bg-red-400/10"
              onClick={() => doToggle("engine.emergencyStop", !cfg["engine.emergencyStop"])}
            >
              <AlertTriangle className="size-3.5" />
              {cfg["engine.emergencyStop"] ? (lang === "fa" ? "اورژانسی فعال" : "Stop Active") : s.stopTrading}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Mobile Category & Tab Switcher (sm:hidden) ────────────────────────── */}
      <div className="mb-4 sm:hidden space-y-2">
        {/* Category Selector Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
          {adminCategories.map((g: any) => {
            const isCatActive = adminCat === g.key || g.tabs.some(([t]: any) => t === tab);
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => {
                  setAdminCat(g.key);
                  if (!g.tabs.some(([t]: any) => t === tab)) {
                    setTab(g.tabs[0][0]);
                  }
                }}
                className={`shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                  isCatActive
                    ? "bg-emerald-400/15 border border-emerald-400/40 text-emerald-300 font-bold"
                    : "border border-border/50 bg-card/40 text-muted-foreground"
                }`}
              >
                <span>{g.icon}</span>
                <span>{g.title.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Sub-tabs for the selected Category with swipeable pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-border/60 bg-card/40 p-1.5 no-scrollbar">
          {activeCategoryGroup.tabs.map(([v, label]: any) => (
            <button
              key={v}
              type="button"
              onClick={() => setTab(v)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                tab === v
                  ? "bg-emerald-400 text-black font-bold shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Desktop Category & Tabs Grid (hidden sm:block) ──────────────────────── */}
      <div className="mb-4 hidden sm:block space-y-2">
        {adminCategories.map((g: any) => (
          <div key={g.key} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-background/40 px-2.5 py-2">
            <span className="me-1 flex w-full items-center gap-1 text-[10px] font-bold tracking-wide text-muted-foreground sm:w-auto sm:min-w-40">
              <span className="text-xs">{g.icon}</span> {g.title}
            </span>
            {g.tabs.map(([v, label]: any) => (
              <button
                key={v}
                type="button"
                onClick={() => { setTab(v); setAdminCat(g.key); }}
                className={`shrink-0 rounded-md border px-2.5 py-1 text-[11px] transition-colors ${tab === v ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300 font-bold" : "border-border/60 text-muted-foreground hover:border-emerald-400/30 hover:text-emerald-300"}`}
              >
                {label}
              </button>
            ))}
          </div>
        ))}
      </div>

      <TabsContent value="overview" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={s.positionsOpen} value={pos?.open ?? 0} hint={`${s.floating}: ${pnlText(pos?.openPnl)}`} />
          <Stat label={s.winRate} value={`${pos?.winRate ?? 0}%`} hint={`${pos?.closed ?? 0} ${s.closed}`} />
          <Stat label={s.realized} value={money(pos?.realizedPnl)} />
          <Stat label={s.marketsWatched} value={overview?.markets.total ?? 0} hint={`${overview?.markets.forex ?? 0} F · ${overview?.markets.crypto ?? 0} C`} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={s.engineCapital} value={money(Number(settings?.["engine.capital"] ?? 1000) + Number(settings?.["engine.realizedPnl"] ?? 0))} />
          <Stat label={s.strategiesArmed} value={overview?.strategies.enabled ?? 0} hint={`${overview?.strategies.total ?? 0} total`} />
          <Stat label={s.openSignals} value={overview?.signals.open ?? 0} />
          <Card className="border-border/70 bg-card/60">
            <CardContent className="flex h-full flex-col items-start justify-center gap-2 p-4">
              <div className="flex w-full items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold">
                  <span className={`size-2 rounded-full ${Boolean(cfg["engine.enabled"]) ? "bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse-soft" : "bg-red-400"}`} />
                  {Boolean(cfg["engine.enabled"]) ? (lang === "fa" ? "موتور فعال — ۲۴/۷" : "Engine running — 24/7") : (lang === "fa" ? "موتور متوقف" : "Engine stopped")}
                </span>
                {!readOnly && <Switch checked={Boolean(cfg["engine.enabled"])} onCheckedChange={(v) => doToggle("engine.enabled", v)} />}
              </div>
              <div className="grid w-full grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <span>{lang === "fa" ? "آخرین اسکن" : "Last scan"}: {overview?.engine?.lastScanAt ? timeAgo(overview?.engine?.lastScanAt, lang) : "—"}</span>
                <span>{lang === "fa" ? "ضربان قلب" : "Heartbeat"}: {overview?.engine?.heartbeat ? timeAgo(overview?.engine?.heartbeat, lang) : "—"}</span>
              </div>
              <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={readOnly} onClick={() => runScanNow({ token }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message)))}>
                <RefreshCw className="size-3.5" /> {s.scanNow}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Activity className="size-4 text-emerald-400" /> {s.engine}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {toggleGroups.map(([label, key]) => (
                <div key={key} className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-3 py-2">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <Switch checked={Boolean(cfg[key])} onCheckedChange={(v) => doToggle(key, v)} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-400/25 bg-red-400/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm text-red-300"><AlertTriangle className="size-4" /> {s.emergency}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                variant={cfg["engine.emergencyStop"] ? "default" : "destructive"}
                size="sm"
                className="gap-1.5"
                onClick={() => emergencyStop({ token, stop: !cfg["engine.emergencyStop"] }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message)))}
              >
                <AlertTriangle className="size-3.5" /> {s.emergencyStop}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-amber-400/40 text-amber-300"
                onClick={() => pauseNewTrades({ token, paused: !cfg["engine.pauseNewTrades"] }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message)))}
              >
                <Zap className="size-3.5" /> {s.pauseTrades}
              </Button>
              <div className="flex items-center gap-1.5">
                <Input dir="ltr" placeholder={s.closeAllConfirm} className="h-8 text-xs" value={closeAllConfirm} onChange={(e) => setCloseAllConfirm(e.target.value)} />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 border-red-400/40 text-red-300"
                  disabled={closeAllConfirm.trim().toLowerCase() !== "ببند" && closeAllConfirm.trim().toLowerCase() !== "close"}
                  onClick={() => closeAllPositions({ token, confirmPhrase: closeAllConfirm.trim() }).then(() => { toast.success(s.saved); setCloseAllConfirm(""); }).catch((e: any) => toast.error(String(e?.message)))}
                >
                  {s.closeAll}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/70 bg-card/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm">{s.signals}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(overview?.signals.recent ?? []).map((sig: any, i: number) => (
                <div key={i} className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-3 py-2 text-xs">
                  <span className="terminal-font font-bold" dir="ltr">{fmtSym(sig.symbol)}</span>
                  <Side side={sig.direction} />
                  <span className="tabular-nums">{Math.round(sig.score ?? 0)}</span>
                {sig.created && <span className="text-[10px] text-muted-foreground" dir="ltr">⏰ {new Date(sig.created).toLocaleTimeString(lang === "fa" ? "fa-IR" : "en-US", { hour: "2-digit", minute: "2-digit" })}</span>}
                </div>
              ))}
              {(overview?.signals.recent ?? []).length === 0 && <p className="py-6 text-center text-muted-foreground">{s.misc.none}</p>}
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm">{s.logs}</CardTitle></CardHeader>
            <CardContent className="max-h-64 space-y-1.5 overflow-auto">
              {(overview?.logs ?? []).map((l: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <LevelPill level={l.level} />
                  <span className="text-muted-foreground">{logFa(String(l.message ?? ""), lang)}</span>
                  <span className="terminal-font ms-auto shrink-0 text-[10px] text-muted-foreground">{timeAgo(l.created, lang)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="positions" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-muted-foreground">{s.positionsOpen} ({positions?.length ?? 0})</h2>
          <Button size="sm" variant="outline" className="border-emerald-400/30 text-emerald-300" disabled={readOnly || (positions ?? []).length === 0} onClick={async () => {
            try {
              let sent = 0;
              for (const p of positions ?? []) {
                await sendPositionToTelegram({ token, positionId: p.id });
                sent++;
              }
              toast.success(lang === "fa" ? `${sent} پوزیشن به کانال‌ها ارسال شد ✓` : `${sent} positions sent to channels ✓`);
            } catch (e: any) {
              toast.error(String(e?.message ?? e));
            }
          }}>
            <Send className="me-1.5 size-3.5" /> {s.sendAllTg}
          </Button>
        </div>
        {positions && positions.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {positions.map((p: any) => (
              <PositionCard key={p.id} p={p} lang={lang} onClose={readOnly ? undefined : (id) => closePosition({ token, positionId: id }).catch((e: any) => toast.error(String(e?.message)))} onSendTg={readOnly ? undefined : (id) => sendPositionToTelegram({ token, positionId: id }).then((r: any) => toast.success(lang === "fa" ? `کارت کامل + چارت به کانال‌ها ارسال شد ✓ (${(r?.sent ?? []).join("/")})` : `Full card + chart sent ✓ (${(r?.sent ?? []).join("/")})`)).catch((e: any) => toast.error(String(e?.message)))} />
            ))}
          </div>
        ) : (
          <Card className="border-border/60 bg-card/40"><CardContent className="p-8 text-center text-muted-foreground">{s.positionsEmpty}</CardContent></Card>
        )}

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{s.closedPositions}</CardTitle></CardHeader>
          <CardContent className="max-h-[24rem] overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{fmtSym(s.symbol)}</TableHead>
                  <TableHead className="text-xs">{s.strategy}</TableHead>
                  <TableHead className="text-xs">{s.pnl}</TableHead>
                  <TableHead className="text-xs">{s.closeReason}</TableHead>
                  <TableHead className="text-xs">{s.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(closedPositions ?? []).map((cp: any) => (
                  <TableRow key={cp.id}>
                    <TableCell className="terminal-font text-xs font-semibold" dir="ltr">{fmtSym(cp.symbol)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{(cp.strategyKeys ?? []).slice(0, 2).join(", ") || "—"}</TableCell>
                    <TableCell className={`terminal-font text-xs tabular-nums ${(cp.pnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{pnlText(cp.pnl)}</TableCell>
                    <TableCell className="text-xs">{cp.closeReason ?? "—"}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{timeAgo(cp.closeTime, lang)}</TableCell>
                  </TableRow>
                ))}
                {(closedPositions ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">{s.misc.none}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Activity className="size-4 text-emerald-400" /> {s.tabSignals}</CardTitle>
            <CardDescription>{lang === "fa" ? "سیگنال‌های باز موتور — برای مشاهده جزئیات روی هر ردیف کلیک کنید" : "Open engine signals — click a row to expand details"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(allSignals ?? []).slice(0, 15).map((sg: any) => {
              const open = expSignal === sg.id;
              return (
                <div key={sg.id} className="rounded-md border border-border/50 bg-background/40">
                  <button type="button" className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-start text-xs" onClick={() => setExpSignal(open ? null : sg.id)}>
                    <span className={`terminal-font font-bold ${sg.direction === "long" ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{sg.direction === "long" ? "▲" : "▼"} {fmtSym(sg.symbol)}</span>
                    <Badge variant="outline" className="text-[10px]">{sg.timeframe}</Badge>
                    <span className="terminal-font text-muted-foreground" dir="ltr">score {sg.score} · conf {Math.round((sg.confidence ?? 0) * 100)}% · RR {sg.rr}</span>
                    <span className="ms-auto text-[10px] text-muted-foreground">{timeAgo(sg.created, lang)}</span>
                  </button>
                  {open && (
                    <div className="grid gap-2 border-t border-border/40 p-3 text-xs sm:grid-cols-3">
                      <div className="rounded-md border border-border/40 bg-background/40 p-2"><p className="text-[10px] text-muted-foreground">Entry</p><p className="terminal-font" dir="ltr">{sg.entry}</p></div>
                      <div className="rounded-md border border-border/40 bg-background/40 p-2"><p className="text-[10px] text-muted-foreground">Stop loss</p><p className="terminal-font text-red-300" dir="ltr">{sg.stopLoss}</p></div>
                      <div className="rounded-md border border-border/40 bg-background/40 p-2"><p className="text-[10px] text-muted-foreground">Take profit</p><p className="terminal-font text-emerald-300" dir="ltr">{sg.takeProfit}</p></div>
                      {(sg.targets ?? []).length > 1 && (
                        <div className="rounded-md border border-border/40 bg-background/40 p-2 sm:col-span-3">
                          <p className="text-[10px] text-muted-foreground">Targets</p>
                          <p className="terminal-font" dir="ltr">{(sg.targets ?? []).join(" · ")}</p>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 sm:col-span-3">
                        <span className="text-[10px] text-muted-foreground">{lang === "fa" ? "ارسال به کانال:" : "Post to channel:"}</span>
                        <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" disabled={sigTgBusy === `${sg.id}:fa`} onClick={() => doSendSignal(sg.id, "fa")}>
                          {sigTgBusy === `${sg.id}:fa` ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} {lang === "fa" ? "کانال فارسی" : "FA channel"}{sg.sentFaAt ? " ✓" : ""}
                        </Button>
                        <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" disabled={sigTgBusy === `${sg.id}:en`} onClick={() => doSendSignal(sg.id, "en")}>
                          {sigTgBusy === `${sg.id}:en` ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} {lang === "fa" ? "کانال انگلیسی" : "EN channel"}{sg.sentEnAt ? " ✓" : ""}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {(allSignals ?? []).length === 0 && <p className="py-6 text-center text-muted-foreground">{s.misc.none}</p>}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="users" className="space-y-4">
        {detailUser ? <UserDetailCard token={token} userId={detailUser} lang={lang} onClose={() => setDetailUser(null)} readOnly={readOnly} /> : null}
        {!readOnly && (
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{s.newUser}</CardTitle></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input placeholder={s.username} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <Input placeholder={s.password} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <Input placeholder={s.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">user</SelectItem>
                <SelectItem value="vip">vip</SelectItem>
                <SelectItem value="assistant">assistant</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
              </SelectContent>
            </Select>
            <Button className="sm:col-span-2 lg:col-span-4" onClick={doCreateUser}>{s.newUser}</Button>
          </CardContent>
        </Card>

        )}

        <Card className="border-cyan-400/20 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Search className="size-4 text-cyan-300" /> {lang === "fa" ? "جستجوی کاربر" : "Find a user"}</CardTitle>
            <CardDescription>{lang === "fa" ? "با نام کاربری، نام، تلگرام یا شماره — حداقل ۲ حرف." : "By username, name, Telegram or phone — min 2 characters."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input dir="auto" placeholder={lang === "fa" ? "مثلاً: marij، 0912..." : "e.g. marij, 0912..."} value={userQ} onChange={(e) => setUserQ(e.target.value)} />
            {userQ.trim().length >= 2 && (userSearchRes ?? []).length === 0 && (
              <p className="py-2 text-center text-[11px] text-muted-foreground">{lang === "fa" ? "کاربری پیدا نشد" : "No user found"}</p>
            )}
            <div className="max-h-56 space-y-1 overflow-auto">
              {(userSearchRes ?? []).map((u: any) => (
                <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-xs">
                  <button type="button" className="terminal-font font-bold text-cyan-300 hover:underline" onClick={() => setDetailUser(u.id)}>{u.username ?? `TG${u.tgId ?? ""}`}</button>
                  <span className="text-muted-foreground">{u.name ?? u.tgUsername ?? "—"}</span>
                  <Badge variant="outline" className="text-[9px]">{u.role}</Badge>
                  {u.tgId ? <span className="text-[9px] text-muted-foreground" dir="ltr">TG:{u.tgId}</span> : null}
                  <span className="terminal-font ms-auto font-bold tabular-nums" dir="ltr">${(u.balance ?? 0).toFixed(2)}</span>
                  <span className="text-[9px] text-muted-foreground">{u.lastActivity ? timeAgo(u.lastActivity, lang) : "—"}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardContent className="max-h-[28rem] overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{s.username}</TableHead>
                  <TableHead className="text-xs">{s.role}</TableHead>
                  <TableHead className="text-xs">{s.name}</TableHead>
                  <TableHead className="text-xs">{s.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users ?? []).map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-xs font-semibold" dir="ltr">
                      <button type="button" className="rounded border border-emerald-400/25 px-1.5 py-0.5 text-emerald-300 transition-colors hover:bg-emerald-400/10" onClick={() => setDetailUser(u.id)}>{u.username ?? `TG${u.tgId ?? ""}`}</button>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{u.role}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.name ?? u.tgUsername ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setUserEnabled({ token, userId: u.id, enabled: u.enabled === false })}>{u.enabled === false ? s.enable : s.block}</Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setUserRole({ token, userId: u.id, role: u.role === "admin" ? "user" : "admin" })}>{u.role === "admin" ? s.makeUser : s.makeAdmin}</Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => { const pw = window.prompt(s.password); if (pw && pw.length >= 6) setUserPassword({ token, userId: u.id, password: pw }); }}>{s.resetPass}</Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => { const msg = window.prompt(lang === "fa" ? `پیام تلگرامی به ${u.username ?? u.tgId ?? ""}` : `Telegram message to ${u.username ?? u.tgId ?? ""}`); if (!msg) return; if (!u.tgId) return toast.error(lang === "fa" ? "این کاربر تلگرام متصل نیست" : "User has no Telegram linked"); adminSendChatM({ token, chatId: String(u.tgId), text: msg }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message))); }}>{lang === "fa" ? "پیام" : "Message"}</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(users ?? []).length === 0 && <p className="p-6 text-center text-muted-foreground">{s.emptyUsers}</p>}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="wallet" className="space-y-4">
        {detailUser ? <UserDetailCard token={token} userId={detailUser} lang={lang} onClose={() => setDetailUser(null)} readOnly={readOnly} /> : null}
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{s.walletAddresses}</CardTitle>
            <CardDescription>{s.depositAddr}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <Input placeholder="USDT" value={addrForm.asset} onChange={(e) => setAddrForm({ ...addrForm, asset: e.target.value })} />
              <Select value={addrForm.network} onValueChange={(v) => setAddrForm({ ...addrForm, network: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{NETWORKS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={addrForm.kind} onValueChange={(v) => setAddrForm({ ...addrForm, kind: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">{lang === "fa" ? "واریز" : "Deposit"}</SelectItem>
                  <SelectItem value="withdraw">{lang === "fa" ? "برداشت" : "Withdraw"}</SelectItem>
                </SelectContent>
              </Select>
              <Input className="sm:col-span-2" dir="ltr" placeholder={s.address} value={addrForm.address} onChange={(e) => setAddrForm({ ...addrForm, address: e.target.value })} />
              <Button onClick={doAddAddress}>{s.addAddress}</Button>
            </div>
            <div className="space-y-2">
              {(walletAddresses ?? []).map((a: any) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-xs">
                  <span className="font-bold">{a.network} · {a.asset} <Badge variant="outline" className={`ms-1 text-[9px] ${a.kind === "withdraw" ? "text-cyan-300" : "text-emerald-300"}`}>{a.kind === "withdraw" ? (lang === "fa" ? "برداشت" : "Withdraw") : (lang === "fa" ? "واریز" : "Deposit")}</Badge></span>
                  <span className="terminal-font flex-1 break-all text-muted-foreground" dir="ltr">{a.address}</span>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-red-300" onClick={() => removeWalletAddress({ token, id: a.id })}>{s.reject}</Button>
                </div>
              ))}
              {(walletAddresses ?? []).length === 0 && <p className="py-4 text-center text-muted-foreground">{s.misc.none}</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{s.transactions}</CardTitle></CardHeader>
          <CardContent className="max-h-[32rem] overflow-auto p-0">
            <div className="overflow-x-auto">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{s.username}</TableHead>
                  <TableHead className="text-xs">{s.type}</TableHead>
                  <TableHead className="text-xs">{s.amount}</TableHead>
                  <TableHead className="text-xs">{s.network}</TableHead>
                  <TableHead className="text-xs">{s.misc.note}</TableHead>
                  <TableHead className="text-xs">{s.status}</TableHead>
                  <TableHead className="text-xs">{s.txDate}</TableHead>
                  <TableHead className="text-xs">{s.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(transactions ?? []).map((t: any) => (
                  <TableRow key={t.id} className="align-top">
                    <TableCell className="text-xs font-semibold">
                      {t.user?.username ? <button type="button" className="rounded border border-emerald-400/25 px-1.5 py-0.5 text-emerald-300 hover:bg-emerald-400/10" onClick={() => setDetailUser(t.user.id)} dir="ltr">@{t.user.username}</button> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${t.type === "deposit" ? "text-emerald-300" : t.type === "withdrawal" ? "text-red-300" : "text-cyan-300"}`}>{t.type}</Badge>
                    </TableCell>
                    <TableCell className="terminal-font text-xs tabular-nums" dir="ltr">{t.type === "deposit" ? "+" : "-"}{num(t.amount, 2)} {t.asset}</TableCell>
                    <TableCell className="text-xs">{t.network ?? "—"}</TableCell>
                    <TableCell className="max-w-[190px] text-xs">
                      {(t.note || t.txid) ? (
                        <div className="space-y-0.5">
                          {t.note ? <p className="truncate text-muted-foreground" title={t.note}>{t.note}</p> : null}
                          {t.txid ? <p className="terminal-font truncate text-[10px] text-cyan-300/80" dir="ltr" title={t.txid}>🆔 {t.txid}</p> : null}
                        </div>
                      ) : <span className="text-muted-foreground/60">—</span>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${t.status === "confirmed" ? "text-emerald-300" : t.status === "failed" ? "text-red-300" : "text-amber-300"}`}>{t.status}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-[11px] text-muted-foreground">{t.created ? new Date(t.created).toLocaleString(lang === "fa" ? "fa-IR" : "en-US", { dateStyle: "short", timeStyle: "short" }) : "—"}</TableCell>
                    <TableCell>
                      {t.status === "pending" ? (
                        <div className="flex flex-col gap-1">
                          <Input dir="ltr" placeholder={`${s.reason}…`} className="h-7 w-32 text-[11px]" value={txReason[t.id] ?? ""} onChange={(e) => setTxReason((r) => ({ ...r, [t.id]: e.target.value }))} />
                          <div className="flex gap-1">
                            <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => reviewTransaction({ token, transactionId: t.id, status: "confirmed", reason: txReason[t.id]?.trim() || undefined })}>{s.confirm}</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-red-300" onClick={() => reviewTransaction({ token, transactionId: t.id, status: "failed", reason: txReason[t.id]?.trim() || undefined })}>{s.reject}</Button>
                          </div>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            {(transactions ?? []).length === 0 && <p className="p-6 text-center text-muted-foreground">{s.emptyTx}</p>}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{s.coinLedger}</CardTitle>
            <CardDescription>{lang === "fa" ? "تاریخچه یکپارچه سکه‌ها — همه‌ی تراکنش‌های ولف‌کوین و تومان در کنار کیف پول." : "Unified coin ledger — all wolf-coin and toman transactions next to the wallet."}</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[24rem] overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{s.username}</TableHead>
                  <TableHead className="text-xs">{s.amount}</TableHead>
                  <TableHead className="text-xs">{s.reason}</TableHead>
                  <TableHead className="text-xs">{s.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(coinLedger ?? []).map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs font-semibold" dir="ltr">{l.user}</TableCell>
                    <TableCell className={`terminal-font text-xs tabular-nums ${l.currency === "toman" ? "text-gold" : "text-cyan-300"}`} dir="ltr">{l.currency} · {(l.delta ?? 0) >= 0 ? "+" : ""}{num(l.delta)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{reasonFa(l.reason, lang)}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{timeAgo(l.created, lang)}</TableCell>
                  </TableRow>
                ))}
                {(coinLedger ?? []).length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">{s.misc.none}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="vip" className="space-y-4">
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{s.requests}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(vipRequests ?? []).map((r: any) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-xs">
                <span className="font-bold" dir="ltr">{r.userName}</span>
                <span>{r.packageKey}</span>
                <span className="tabular-nums">${r.capital}</span>
                <div className="flex gap-1">
                  <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => reviewVip({ token, requestId: r.id, status: "approved" })}>{s.approve}</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-red-300" onClick={() => reviewVip({ token, requestId: r.id, status: "rejected" })}>{s.reject}</Button>
                </div>
              </div>
            ))}
            {(vipRequests ?? []).length === 0 && <p className="py-4 text-center text-muted-foreground">{s.emptyReq}</p>}
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(packages ?? []).map((pkg: any) => {
            const editing = pkgEdit === pkg.key;
            return (
              <Card key={pkg.key} className="border-border/70 bg-card/60">
                <CardContent className="space-y-2 p-4">
                  {!editing ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{lang === "fa" ? pkg.nameFa : pkg.name}</span>
                        <span className="tabular-nums text-gold">${pkg.price}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{pkg.durationDays} {s.misc.days} · {s.capital}: ${pkg.minCapital}–${pkg.maxCapital}</p>
                      {pkg.discountPercent > 0 && <p className="text-[11px] text-emerald-300">{s.discount}: {pkg.discountPercent}%</p>}
                      {pkg.giftCoins > 0 && <p className="text-[11px] text-cyan-300">{s.giftCoins}: {pkg.giftCoins}</p>}
                      <Button size="sm" variant="outline" className="w-full border-gold/30 text-gold" onClick={() => { setPkgEdit(pkg.key); setPkgForm({ name: pkg.name ?? "", nameFa: pkg.nameFa ?? "", price: pkg.price ?? 0, durationDays: pkg.durationDays ?? 30, minCapital: pkg.minCapital ?? 0, maxCapital: pkg.maxCapital ?? 100, features: (pkg.features ?? []).join("\n"), featuresFa: (pkg.featuresFa ?? []).join("\n"), riskDisclosure: pkg.riskDisclosure ?? "", terms: pkg.terms ?? "", status: pkg.status !== false, discountPercent: pkg.discountPercent ?? 0, giftCoins: pkg.giftCoins ?? 0, commissionPct: pkg.commissionPct ?? 1 }); }}>{s.editPackage}</Button>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Input dir="ltr" placeholder="name (EN)" className="h-8 text-xs" value={pkgForm?.name ?? ""} onChange={(e) => setPkgForm((f: any) => ({ ...f, name: e.target.value }))} />
                        <Input placeholder="نام فارسی" className="h-8 text-xs" value={pkgForm?.nameFa ?? ""} onChange={(e) => setPkgForm((f: any) => ({ ...f, nameFa: e.target.value }))} />
                        <Input type="number" placeholder={s.price} className="h-8 text-xs" value={pkgForm?.price ?? 0} onChange={(e) => setPkgForm((f: any) => ({ ...f, price: Number(e.target.value) }))} />
                        <Input type="number" placeholder={s.duration} className="h-8 text-xs" value={pkgForm?.durationDays ?? 30} onChange={(e) => setPkgForm((f: any) => ({ ...f, durationDays: Number(e.target.value) }))} />
                        <Input type="number" placeholder={`${s.capital} min`} className="h-8 text-xs" value={pkgForm?.minCapital ?? 0} onChange={(e) => setPkgForm((f: any) => ({ ...f, minCapital: Number(e.target.value) }))} />
                        <Input type="number" placeholder={`${s.capital} max`} className="h-8 text-xs" value={pkgForm?.maxCapital ?? 100} onChange={(e) => setPkgForm((f: any) => ({ ...f, maxCapital: Number(e.target.value) }))} />
                        <Input type="number" placeholder={s.discount} className="h-8 text-xs" value={pkgForm?.discountPercent ?? 0} onChange={(e) => setPkgForm((f: any) => ({ ...f, discountPercent: Number(e.target.value) }))} />
                        <Input type="number" placeholder={`${s.commissionPct} %`} className="h-8 text-xs" value={pkgForm?.commissionPct ?? 1} onChange={(e) => setPkgForm((f: any) => ({ ...f, commissionPct: Number(e.target.value) }))} />
                        <Input type="number" placeholder={s.giftCoins} className="h-8 text-xs" value={pkgForm?.giftCoins ?? 0} onChange={(e) => setPkgForm((f: any) => ({ ...f, giftCoins: Number(e.target.value) }))} />
                      </div>
                      <Textarea placeholder={`${s.features} (EN) — ${s.message}`} className="h-14 text-xs" value={pkgForm?.features ?? ""} onChange={(e) => setPkgForm((f: any) => ({ ...f, features: e.target.value }))} />
                      <Textarea placeholder={`${s.features} (FA)`} className="h-14 text-xs" value={pkgForm?.featuresFa ?? ""} onChange={(e) => setPkgForm((f: any) => ({ ...f, featuresFa: e.target.value }))} />
                      <div className="flex gap-1.5">
                        <Button size="sm" className="flex-1" onClick={async () => { try { await saveVipPkg({ token, key: pkg.key, name: pkgForm?.name ?? pkg.name ?? "", nameFa: pkgForm?.nameFa ?? pkg.nameFa ?? "", price: Number(pkgForm?.price ?? pkg.price ?? 0), durationDays: Number(pkgForm?.durationDays ?? pkg.durationDays ?? 30), minCapital: Number(pkgForm?.minCapital ?? pkg.minCapital ?? 0), maxCapital: Number(pkgForm?.maxCapital ?? pkg.maxCapital ?? 100), features: String(pkgForm?.features ?? "").split("\n").map((x: string) => x.trim()).filter(Boolean), featuresFa: String(pkgForm?.featuresFa ?? "").split("\n").map((x: string) => x.trim()).filter(Boolean), riskDisclosure: pkgForm?.riskDisclosure ?? pkg.riskDisclosure ?? "", terms: pkgForm?.terms ?? pkg.terms ?? "", status: pkg.status !== false, discountPercent: Number(pkgForm?.discountPercent ?? 0), giftCoins: Number(pkgForm?.giftCoins ?? 0), commissionPct: Number(pkgForm?.commissionPct ?? 1) }); toast.success(s.saved); setPkgEdit(null); } catch (e: any) { toast.error(String(e?.message ?? "error")); } }}>{s.save}</Button>
                        <Button size="sm" variant="outline" onClick={() => setPkgEdit(null)}>{lang === "fa" ? "انصراف" : "Cancel"}</Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </TabsContent>

      <TabsContent value="exchanges" className="space-y-4">
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><KeyRound className="size-4 text-emerald-400" /> {s.exchangeSection}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Input placeholder={s.exchangeName} value={exForm.name} onChange={(e) => setExForm({ ...exForm, name: e.target.value })} />
              <Select value={exForm.provider} onValueChange={(v) => setExForm({ ...exForm, provider: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[["binance","Binance","بایننس"],["bybit","Bybit","بای‌بیت"],["okx","OKX","اوکی‌ایکس"],["bingx","BingX","بینگ‌ایکس"],["bitget","Bitget","بیت‌گت"],["kucoin","KuCoin","کوکوین"],["mexc","MEXC","مکس"],["gate","Gate.io","گیت‌آی‌او"],["lbank","LBank","ال‌بنک"],["bitmart","BitMart","بیتمارت"],["coinex","CoinEx","کوین‌اکس"],["phemex","Phemex","فمکس"],["woo","WOO X","وو‌ایکس"],["huobi","HTX (Huobi)","اچ‌تی‌ایکس"],["coinbase","Coinbase","کوین‌بیس"],["kraken","Kraken","کراکن"],["bitfinex","Bitfinex","بیت‌فینکس"],["cryptocom","Crypto.com","کریپتو دات کام"],["bitvavo","Bitvavo","بیت‌واو"],["krakenfutures","Kraken Futures","کراکن فیوچرز"],["nobitex","Nobitex (نوبیتکس)","نوبیتکس"]].map(([id, en, fa]) => <SelectItem key={id} value={id}>{lang === "fa" ? fa : en}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={exForm.environment} onValueChange={(v) => setExForm({ ...exForm, environment: v as "demo" | "live" })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="demo">Paper</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder={s.accountId} value={exForm.accountId} onChange={(e) => setExForm({ ...exForm, accountId: e.target.value })} />
              <Input placeholder={s.apiKey} dir="ltr" value={exForm.apiKey} onChange={(e) => setExForm({ ...exForm, apiKey: e.target.value })} />
              <Input placeholder={s.apiSecret} type="password" dir="ltr" value={exForm.apiSecret} onChange={(e) => setExForm({ ...exForm, apiSecret: e.target.value })} />
              <Input placeholder={s.passphrase} type="password" dir="ltr" value={exForm.passphrase} onChange={(e) => setExForm({ ...exForm, passphrase: e.target.value })} />
              <Button onClick={doAddExchange}>{s.addExchange}</Button>
            </div>
            <div className="space-y-2">
              {(exchanges ?? []).map((x: any) => (
                <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-xs">
                  <span className="font-bold">{x.name}</span>
                  <Badge variant="outline" className="text-[10px]">{x.provider} · {x.environment}</Badge>
                  <span className="terminal-font text-muted-foreground" dir="ltr">{x.apiKeyMasked}</span>
                  <Badge variant="outline" className={`text-[10px] ${x.status === "ok" ? "text-emerald-300" : x.status === "error" ? "text-red-300" : "text-amber-300"}`}>{x.status}</Badge>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {lang === "fa" ? "فعال" : "On"}
                    <Switch checked={Boolean(x.enabled)} onCheckedChange={(v) => setExchangeEnabled({ token, id: x.id, enabled: v }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message)))} />
                  </span>
                  <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px] border-cyan-400/30 text-cyan-300" onClick={async () => { setExTest((t) => ({ ...t, [x.id]: { busy: true } })); try { const r: any = await testBroker({ token, accountId: x.id }); setExTest((t) => ({ ...t, [x.id]: r })); if (r?.ok) toast.success(`${x.provider} ✓`); else toast.error(String(r?.error ?? "failed")); } catch (e2: any) { setExTest((t) => ({ ...t, [x.id]: { ok: false, error: String(e2?.message ?? e2) } })); } }} disabled={exTest[x.id]?.busy}>
                    <Zap className="size-3" /> {lang === "fa" ? "تست" : "Test"}
                  </Button>
                  {exTest[x.id]?.busy ? <Loader2 className="size-3.5 animate-spin text-cyan-300" /> : exTest[x.id]?.ok ? <span className="text-[10px] text-emerald-300">✓ {(exTest[x.id]?.balance ?? []).slice(0, 3).map((b: any) => `${b.currency}:${Number(b.total ?? b.balance ?? 0).toFixed(2)}`).join(" · ") || "ok"}</span> : exTest[x.id]?.error ? <span className="max-w-40 truncate text-[10px] text-red-300" title={String(exTest[x.id].error)}>{String(exTest[x.id].error).slice(0, 40)}</span> : null}
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-red-300" onClick={() => removeExchange({ token, id: x.id })}>{s.reject}</Button>
                </div>
              ))}
              {(exchanges ?? []).length === 0 && <p className="py-4 text-center text-muted-foreground">{s.misc.none}</p>}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="markets" className="space-y-4">
        {manualResult && (
          <Card className="border-emerald-400/25 bg-emerald-400/5">
            <CardContent className="space-y-2 p-4">
              <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-300">
                <Play className="size-4" /> {lang === "fa" ? "معامله دستی باز شد" : "Manual position opened"}
              </p>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <Badge variant="outline" className="text-emerald-300" dir="ltr">{fmtSym(manualResult.symbol)} · {manualResult.side === "long" ? "LONG" : "SHORT"} · {manualResult.timeframe}</Badge>
                <Badge variant="outline">{lang === "fa" ? "امتیاز" : "Score"}: {manualResult.score}/100</Badge>
                <Badge variant="outline">{lang === "fa" ? "اطمینان" : "Conf"}: {Math.round((manualResult.confidence ?? 0) * 100)}%</Badge>
                <Badge variant="outline">{lang === "fa" ? "اجماع" : "Consensus"}: {Math.round((manualResult.consensus ?? 0) * 100)}%</Badge>
                <Badge variant="outline" className="text-cyan-300" dir="ltr">{lang === "fa" ? "ورود" : "Entry"}: {num(manualResult.entry, 5)}</Badge>
                <Badge variant="outline" className="text-red-300" dir="ltr">SL: {num(manualResult.stopLoss, 5)}</Badge>
                <Badge variant="outline" className="text-emerald-300" dir="ltr">TP: {num(manualResult.takeProfit, 5)}</Badge>
                <Badge variant="outline" className="text-amber-300" dir="ltr">{manualResult.leverage}x · {num(manualResult.size, 2)} USDT</Badge>
              </div>
              {(manualResult.bestStrategies ?? []).length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">{s.btBestStrategies}:</span>
                  {(manualResult.bestStrategies as string[]).map((st: string) => <span key={st} className="terminal-font rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-300" dir="ltr">{st}</span>)}
                </div>
              )}
              {manualResult.warning ? <p className="text-[11px] text-amber-300">⚠️ {manualResult.warning}</p> : null}
              {manualResult.mode === "live" ? <p className="text-[10px] text-cyan-300">{lang === "fa" ? "سفارش واقعی از طریق صرافی فعال ارسال شد" : "Real order sent through the active exchange"}</p> : null}
            </CardContent>
          </Card>
        )}
        <Card className="border-border/70 bg-card/60">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-xs text-muted-foreground">{lang === "fa" ? "بازار:" : "Market:"}</span>
            {["all", "crypto", "forex"].map((f) => (
              <Button key={f} size="sm" variant={mktFilter === f ? "default" : "outline"} className="h-7 px-2.5 text-[11px]" onClick={() => setMktFilter(f)}>
                {f === "all" ? (lang === "fa" ? "همه" : "All") : f === "crypto" ? (lang === "fa" ? "کریپتو" : "Crypto") : (lang === "fa" ? "فارکس" : "Forex")}
              </Button>
            ))}
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardContent className="max-h-[32rem] overflow-auto p-0">
            <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{fmtSym(s.symbol)}</TableHead>
                  <TableHead className="text-xs">{s.name}</TableHead>
                  <TableHead className="text-xs">{s.market}</TableHead>
                  <TableHead className="text-xs">{s.last}</TableHead>
                  <TableHead className="text-xs">24h</TableHead>
                  <TableHead className="text-xs">{s.enabled}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(markets ?? []).filter((m: any) => mktFilter === "all" || m.market === mktFilter).map((m: any) => {
                  const up = (m.change24h ?? 0) >= 0;
                  return (
                  <TableRow key={m.symbol} className={m.enabled === false ? "opacity-50" : ""}>
                    <TableCell className="terminal-font text-xs font-semibold" dir="ltr">
                      {fmtSym(m.symbol)}
                      <span className={`ms-1.5 inline-block rounded px-1 py-px text-[9px] font-normal ${m.market === "crypto" ? "bg-cyan-400/10 text-cyan-300" : "bg-gold/10 text-gold"}`}>{m.market === "crypto" ? <span className="ms-1.5 rounded bg-emerald-400/10 px-1 py-px text-[9px] font-bold text-emerald-300" dir="ltr">● LIVE</span> : <span className="ms-1.5 rounded bg-emerald-400/10 px-1 py-px text-[9px] font-bold text-emerald-300" dir="ltr">● LIVE</span>}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{lang === "fa" ? m.nameFa : m.nameEn}</TableCell>
                    <TableCell className="text-xs">{m.market === "crypto" ? (lang === "fa" ? "کریپتو" : "Crypto") : (lang === "fa" ? "فارکس" : "Forex")}</TableCell>
                    <TableCell className="terminal-font text-xs tabular-nums" dir="ltr">{num(m.lastPrice, 5)}</TableCell>
                    <TableCell className={`terminal-font text-xs tabular-nums ${up ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{m.change24h != null ? `${up ? "+" : ""}${num(m.change24h, 2)}%` : "—"}</TableCell>
                    <TableCell><Switch checked={Boolean(m.enabled)} onCheckedChange={(v) => toggleMarket({ symbol: m.symbol, enabled: v }).catch(() => {})} />
                      <Button size="sm" variant="outline" className="h-7 gap-1 border-emerald-400/30 px-2 text-[10px] text-emerald-300" disabled={manualBusy === m.symbol} onClick={() => doManualOpen(m.symbol)}>
                        <Play className="size-3" /> {lang === "fa" ? "باز کردن دستی" : "Manual open"}
                      </Button></TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="candles" className="space-y-4">
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><BarChart3 className="size-4 text-emerald-400" /> {lang === "fa" ? "کندل‌ها و چارت" : "Candles & chart"}</CardTitle>
            <CardDescription>{lang === "fa" ? "آخرین کندل‌های واقعی ذخیره‌شده برای هر نماد و تایم‌فریم — منبع داده همان فید بازار (بایننس/نوبیتکس) است." : "Latest real candles stored per symbol and timeframe — the data comes from the market feed (Binance/Nobitex)."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <Select value={candleSymbol} onValueChange={setCandleSymbol}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(markets ?? []).filter((m: any) => m.symbol).map((m: any) => <SelectItem key={m.symbol} value={m.symbol}>{fmtSym(m.symbol)} {m.market === "crypto" ? "₿" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={candleTf} onValueChange={setCandleTf}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["1m", "5m", "15m", "30m", "1h", "4h", "1d"].map((tf) => <SelectItem key={tf} value={tf}>{tf}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={candleOverlay} onValueChange={setCandleOverlay}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{lang === "fa" ? "بدون اندیکاتور" : "No indicator"}</SelectItem>
                  <SelectItem value="ema">{lang === "fa" ? "EMA 9 / EMA 21" : "EMA 9 / EMA 21"}</SelectItem>
                  <SelectItem value="signal">{lang === "fa" ? "خطوط سیگنال (ورود/SL/TP)" : "Signal lines (entry/SL/TP)"}</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={chartImgBusy} onClick={doChartImage} className="gap-1.5">
                {chartImgBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
                {lang === "fa" ? "تولید تصویر چارت (PNG)" : "Generate chart image (PNG)"}
              </Button>
              <span className="self-center text-[10px] text-muted-foreground">{lang === "fa" ? "آخرین کندل‌ها (تا ۱۲۰)" : "Latest candles (up to 120)"}: <span className="terminal-font" dir="ltr">{candleData?.data?.length ?? 0}</span></span>
            </div>
            {candleData?.data?.length ? (
              <div className="rounded-md border border-border/50 bg-background/40 p-2">
                <MiniCandles data={candleData.data} overlays={(() => {
                  const closes = candleData.data.map((c: any) => c.c);
                  if (candleOverlay === "ema") {
                    return [
                      { label: "EMA9", color: "#22d3ee", values: emaSeries(closes, 9) },
                      { label: "EMA21", color: "#fbbf24", values: emaSeries(closes, 21) },
                    ];
                  }
                  if (candleOverlay === "signal") {
                    const sig = (allSignals ?? []).filter((s: any) => s.symbol === candleSymbol)[0];
                    if (sig && Number.isFinite(sig.entry)) {
                      const line = (v: number, color: string, label: string) => ({ label, color, values: closes.map(() => v) });
                      return [
                        line(sig.entry, "#22d3ee", "Entry"),
                        line(sig.stopLoss, "#f87171", "SL"),
                        line(sig.takeProfit, "#34d399", "TP"),
                      ];
                    }
                  }
                  return [];
                })()} />
                {chartImg ? (
                  <div className="mt-2 space-y-1">
                    <p className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{lang === "fa" ? "تصویر تولیدشده (واترمارک ولف‌ای)" : "Generated image (WOLF AI watermark)"}</span>
                      <span className="terminal-font" dir="ltr">{fmtSym(chartImg.symbol)} · {chartImg.tf}</span>
                    </p>
                    <img src={`data:image/png;base64,${chartImg.b64}`} alt={`${fmtSym(chartImg.symbol)} chart`} className="w-full rounded-md border border-border/50" />
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" onClick={doSaveChart}>
                        <Download className="size-3" /> {lang === "fa" ? "ذخیره تصویر" : "Save image"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" disabled={chartSendBusy !== null} onClick={() => doSendChart("fa")}>
                        {chartSendBusy === "fa" ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} {lang === "fa" ? "ارسال به کانال فارسی" : "Send to FA channel"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" disabled={chartSendBusy !== null} onClick={() => doSendChart("en")}>
                        {chartSendBusy === "en" ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} {lang === "fa" ? "ارسال به کانال انگلیسی" : "Send to EN channel"}
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className="mt-1 max-h-40 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">{lang === "fa" ? "زمان" : "Time"}</TableHead>
                        <TableHead className="text-[10px]">O</TableHead>
                        <TableHead className="text-[10px]">H</TableHead>
                        <TableHead className="text-[10px]">L</TableHead>
                        <TableHead className="text-[10px]">C</TableHead>
                        <TableHead className="text-[10px]">V</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {candleData.data.slice(-40).reverse().map((c: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-[10px] text-muted-foreground" dir="ltr">{new Date(c.t).toLocaleString(lang === "fa" ? "fa-IR" : "en-US", { hour12: false })}</TableCell>
                          <TableCell className="terminal-font text-[10px]" dir="ltr">{c.o}</TableCell>
                          <TableCell className="terminal-font text-[10px] text-emerald-300" dir="ltr">{c.h}</TableCell>
                          <TableCell className="terminal-font text-[10px] text-red-300" dir="ltr">{c.l}</TableCell>
                          <TableCell className="terminal-font text-[10px]" dir="ltr">{c.c}</TableCell>
                          <TableCell className="terminal-font text-[10px] text-muted-foreground" dir="ltr">{c.v}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-muted-foreground">{lang === "fa" ? "هنوز کندلی برای این نماد ثبت نشده — نماد را در تب بازارها فعال کنید و منتظر سینک فید بمانید." : "No candles stored for this symbol yet — enable it in the Markets tab and wait for the feed sync."}</p>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="strategies" className="space-y-4">
        <Card className="border-emerald-400/20 bg-emerald-400/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Layers className="size-4 text-emerald-400" /> {lang === "fa" ? "پیش‌تنظیم‌های استراتژی — ۱۰ حالت آماده" : "Strategy presets — 10 ready states"}</CardTitle>
            <p className="text-[11px] text-muted-foreground">{lang === "fa" ? "هر پیش‌تنظیم ترکیب سازگاری از استراتژی‌ها را فعال و استراتژی‌های متضاد را خاموش می‌کند. بعد از اعمال، تک‌تک استراتژی‌ها همچنان دستی قابل روشن/خاموش شدن هستند." : "Each preset enables a compatible strategy set and switches off conflicting ones. Individual strategies stay manually toggleable afterwards."}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {strategyPresets?.current ? (
                  <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">
                    {lang === "fa" ? "پیش‌تنظیم فعال:" : "Active preset:"} {(() => {
                      const curIds = strategyPresets.current.split(",").map((s: string) => s.trim());
                      const names = curIds.map((cid: string) => {
                        const cur = (strategyPresets?.presets ?? []).find((x: any) => x.id === cid);
                        return cur ? (lang === "fa" ? cur.nameFa : cur.nameEn) : cid;
                      });
                      return names.join(" + ");
                    })()}
                  </span>
                ) : null}
                <Button size="sm" variant="outline" className="gap-1.5 text-[11px]" onClick={() => applyStrategyPreset({ token, presetId: "all" }).then(() => toast.success(lang === "fa" ? "همه استراتژی‌ها روشن شد" : "All strategies enabled")).catch((e: any) => toast.error(String(e?.message)))}>
                  <Power className="size-3" /> {lang === "fa" ? "همه روشن" : "All on"}
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-[11px]" onClick={() => applyStrategyPreset({ token, presetId: "none" }).then(() => toast.success(lang === "fa" ? "همه استراتژی‌ها خاموش شد" : "All strategies disabled")).catch((e: any) => toast.error(String(e?.message)))}>
                  <PowerOff className="size-3" /> {lang === "fa" ? "همه خاموش" : "All off"}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={multiPresetMode ? "default" : "outline"}
                  className="h-7 gap-1 text-[10px]"
                  onClick={() => {
                    setMultiPresetMode(!multiPresetMode);
                    if (!multiPresetMode && strategyPresets?.activePresetIds) {
                      setSelectedPresets(strategyPresets.activePresetIds);
                    }
                  }}
                >
                  <Layers className="size-3" />
                  {multiPresetMode ? (lang === "fa" ? "حالت تک‌انتخاب" : "Single mode") : (lang === "fa" ? "انتخاب هم‌زمان چندگانه" : "Multi-preset mode")}
                </Button>
                {multiPresetMode && selectedPresets.length > 0 && (
                  <Button
                    size="sm"
                    className="h-7 gap-1 bg-emerald-500 text-[10px] text-black hover:bg-emerald-400"
                    onClick={() => {
                      applyMultipleStrategyPresets({ token, presetIds: selectedPresets })
                        .then((res: any) => toast.success(lang === "fa" ? `${res.enabled} استراتژی از ${selectedPresets.length} پیش‌تنظیم فعال شد` : `Activated ${res.enabled} strategies from ${selectedPresets.length} presets`))
                        .catch((e: any) => toast.error(String(e?.message)));
                    }}
                  >
                    <CheckCircle2 className="size-3" />
                    {lang === "fa" ? `اعمال هم‌زمان (${selectedPresets.length})` : `Apply (${selectedPresets.length})`}
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {(strategyPresets?.presets ?? []).map((p: any) => {
                const isSelectedInMulti = selectedPresets.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (multiPresetMode) {
                        setSelectedPresets((prev) =>
                          prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                        );
                      } else {
                        applyStrategyPreset({ token, presetId: p.id })
                          .then(() => toast.success(lang === "fa" ? `پیش‌تنظیم ${p.nameFa} اعمال شد` : `Preset ${p.nameEn} applied`))
                          .catch((e: any) => toast.error(String(e?.message)));
                      }
                    }}
                    className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                      multiPresetMode
                        ? isSelectedInMulti
                          ? "border-emerald-400 bg-emerald-400/15 shadow-sm"
                          : "border-border/60 bg-background/40 hover:border-emerald-400/30 hover:bg-emerald-400/5"
                        : p.isActive
                        ? "border-emerald-400/40 bg-emerald-400/10"
                        : "border-border/60 bg-background/40 hover:border-emerald-400/30 hover:bg-emerald-400/5"
                    }`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-base leading-none">{p.icon}</span>
                      {multiPresetMode && (
                        <input
                          type="checkbox"
                          checked={isSelectedInMulti}
                          onChange={() => {}}
                          className="size-3.5 rounded accent-emerald-500 cursor-pointer"
                        />
                      )}
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-bold leading-tight">{lang === "fa" ? p.nameFa : p.nameEn} {p.recommended ? "⭐" : ""}</span>
                      <span className="mt-0.5 block text-[9.5px] leading-snug text-muted-foreground">{lang === "fa" ? p.descriptionFa : p.descriptionEn}</span>
                      <span className={`mt-1 block text-[9px] font-semibold ${p.isActive ? "text-emerald-400" : "text-muted-foreground"}`} dir="ltr">{p.activeCount}/{p.strategyCount} {lang === "fa" ? "استراتژی فعال" : "active"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardContent className="max-h-[32rem] overflow-auto p-0">
            <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{s.strategy}</TableHead>
                  <TableHead className="text-xs">{s.name}</TableHead>
                  <TableHead className="text-xs">{s.category}</TableHead>
                  <TableHead className="text-xs">{s.market}</TableHead>
                  <TableHead className="text-xs">{s.weight}</TableHead>
                  <TableHead className="text-xs">{s.enabled}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(strategies ?? []).map((st: any) => (
                  <TableRow key={st.key} className={st.enabled === false ? "opacity-50" : ""}>
                    <TableCell className="terminal-font text-xs font-semibold" dir="ltr">{st.key}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{lang === "fa" ? st.nameFa : st.name}</TableCell>
                    <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{st.category}</Badge></TableCell>
                    <TableCell className="text-xs">{st.market === "crypto" ? (lang === "fa" ? "کریپتو" : "Crypto") : (lang === "fa" ? "فارکس" : "Forex")}</TableCell>
                    <TableCell className="terminal-font text-xs tabular-nums" dir="ltr">{st.weight ?? "—"}</TableCell>
                    <TableCell><Switch checked={Boolean(st.enabled)} onCheckedChange={(v) => toggleStrategy({ token, key: st.key, enabled: v }).catch(() => {})} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="notifications" className="space-y-4">
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Megaphone className="size-4 text-emerald-400" /> {s.newAlert}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={ntf.type} onValueChange={(v) => setNtf({ ...ntf, type: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">system</SelectItem>
                  <SelectItem value="trade">trade</SelectItem>
                  <SelectItem value="signal">signal</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="ai">ai</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">{s.broadcast}</span>
                <Switch checked={ntf.broadcast} onCheckedChange={(v) => setNtf({ ...ntf, broadcast: v })} />
              </div>
              <Input placeholder={`${s.alertTitle} (FA)`} value={ntf.titleFa} onChange={(e) => setNtf({ ...ntf, titleFa: e.target.value })} />
              <Input placeholder={`${s.alertTitle} (EN)`} value={ntf.titleEn} onChange={(e) => setNtf({ ...ntf, titleEn: e.target.value })} />
              <Textarea placeholder={`${s.alertText} (FA)`} className="sm:col-span-2" value={ntf.textFa} onChange={(e) => setNtf({ ...ntf, textFa: e.target.value })} />
              <Button className="sm:col-span-2" onClick={doSendAlert}>{s.sendAlert}</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{s.notifications}</CardTitle></CardHeader>
          <CardContent className="max-h-[24rem] space-y-2 overflow-auto">
            {(notifications ?? []).map((n: any) => (
              <div key={n.id} className="rounded-md border border-border/50 bg-background/40 p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{lang === "fa" ? n.titleFa : n.titleEn || n.titleFa}</span>
                  <Badge variant="outline" className="text-[10px]">{n.type}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{lang === "fa" ? n.textFa : n.textEn || n.textFa}</p>
                <p className="terminal-font mt-1 text-[10px] text-muted-foreground">{timeAgo(n.created, lang)}</p>
              </div>
            ))}
            {(notifications ?? []).length === 0 && <p className="py-6 text-center text-muted-foreground">{s.misc.none}</p>}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="risk" className="space-y-4">
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><ShieldCheck className="size-4 text-emerald-400" /> {s.riskPreset}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-3">
              {([["conservative", s.presetConservative], ["balanced", s.presetBalanced], ["aggressive", s.presetAggressive]] as const).map(([key, label]) => (
                <Button
                  key={key}
                  variant={riskAdvisor?.preset === key ? "default" : "outline"}
                  className="gap-1.5"
                  onClick={() => applyRiskPreset({ token, preset: key }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message)))}
                >
                  <ShieldCheck className="size-3.5" /> {label}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{lang === "fa" ? "پیش‌تنظیم‌ها نقطه شروع امن‌اند؛ هر مقدار را بعداً می‌توانید دقیق تنظیم کنید." : "Presets are safe starting points; every value is still fine-tunable below."}</p>
          </CardContent>
        </Card>

        {riskAdvisor && (
          <Card className="border-cyan-400/25 bg-cyan-400/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm text-cyan-300"><Brain className="size-4" /> {s.advisor}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">{riskAdvisor.summaryFa}</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(riskAdvisor.checks).map(([k, ok]) => (
                  <Badge key={k} variant="outline" className={`text-[10px] ${ok ? "border-emerald-400/40 text-emerald-300" : "border-red-400/40 text-red-300"}`}>
                    {k}: {ok ? s.checkOk : (lang === "fa" ? "نیاز به اصلاح" : "review")}
                  </Badge>
                ))}
              </div>
              <div className="grid gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-md border border-border/50 bg-background/40 p-2">
                  <p className="text-muted-foreground">{s.riskPerTrade} →</p>
                  <p className="terminal-font font-bold tabular-nums" dir="ltr">${riskAdvisor.riskPerTradeUsd}</p>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-2">
                  <p className="text-muted-foreground">{s.multiplier}</p>
                  <p className="terminal-font font-bold tabular-nums" dir="ltr">×{riskAdvisor.multiplier}</p>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-2">
                  <p className="text-muted-foreground">{s.realized}</p>
                  <p className="terminal-font font-bold tabular-nums" dir="ltr">${(riskAdvisor.multiplier * (Number(fields["risk.virtualCapital"] ?? 1000) * (Number(fields["risk.riskPerTrade"] ?? 1.5) / 100))).toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{s.risk}</CardTitle></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <SliderField label={s.virtualCapital} value={fields["risk.virtualCapital"]} min={100} max={100000} step={100} onChange={(v) => setFields((f) => ({ ...f, "risk.virtualCapital": String(v) }))} />
            <SliderField label={s.realCapital} value={fields["risk.realCapital"]} min={0} max={100000} step={10} onChange={(v) => setFields((f) => ({ ...f, "risk.realCapital": String(v) }))} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border/50 bg-background/40 px-3 py-2 sm:col-span-2">
              <span className="text-xs text-muted-foreground">{lang === "fa" ? "سرمایه مؤثر موتور (مجازی + سود/زیان تحقق‌یافته)" : "Effective engine capital (virtual + realized P&L)"}</span>
              <span className="terminal-font text-sm font-bold tabular-nums" dir="ltr">${(() => { const v = Number(fields["risk.virtualCapital"] ?? 1000); const p = Number(fields["engine.realizedPnl"] ?? 0); return Math.max(1, (Number.isFinite(v) ? v : 1000) + (Number.isFinite(p) ? p : 0)).toLocaleString("en-US", { maximumFractionDigits: 2 }); })()}</span>
              <span className="text-xs text-muted-foreground">{lang === "fa" ? "ضریب معادل‌سازی صرافی (سرمایه واقعی ÷ سرمایه مؤثر)" : "Exchange equivalence (real balance ÷ effective capital)"}</span>
              <span className="terminal-font text-sm font-bold tabular-nums" dir="ltr">×{(() => { const v = Number(fields["risk.virtualCapital"] ?? 1000); const p = Number(fields["engine.realizedPnl"] ?? 0); const eff = Math.max(1, (Number.isFinite(v) ? v : 1000) + (Number.isFinite(p) ? p : 0)); const r = Number(fields["risk.realCapital"] ?? 0); if (!(Number.isFinite(r) && r > 0)) return "1.00"; return Math.min(10, Math.max(0.05, r / eff)).toFixed(2); })()}</span>
            </div>
            <SliderField label={s.riskPerTrade} value={fields["risk.riskPerTrade"]} min={0.5} max={5} step={0.5} onChange={(v) => setFields((f) => ({ ...f, "risk.riskPerTrade": String(v) }))} />
            <SliderField label={s.maxLeverage} value={fields["risk.maxLeverage"]} min={1} max={100} step={1} onChange={(v) => setFields((f) => ({ ...f, "risk.maxLeverage": String(v) }))} />
            <SliderField label={s.maxExposure} value={fields["risk.maxExposure"]} min={5} max={100} step={5} onChange={(v) => setFields((f) => ({ ...f, "risk.maxExposure": String(v) }))} />
            <SliderField label={s.maxPosition} value={fields["risk.maxPosition"]} min={1} max={50} step={1} onChange={(v) => setFields((f) => ({ ...f, "risk.maxPosition": String(v) }))} />
            <SliderField label={s.maxSymbolExposure} value={fields["risk.maxSymbolExposure"]} min={1} max={50} step={1} onChange={(v) => setFields((f) => ({ ...f, "risk.maxSymbolExposure": String(v) }))} />
            <SliderField label={s.maxOpenPositions} value={fields["risk.maxOpenPositions"]} min={1} max={20} step={1} onChange={(v) => setFields((f) => ({ ...f, "risk.maxOpenPositions": String(v) }))} />
            <SliderField label={s.maxDailyLoss} value={fields["risk.maxDailyLoss"]} min={1} max={30} step={1} onChange={(v) => setFields((f) => ({ ...f, "risk.maxDailyLoss": String(v) }))} />
            <SliderField label={s.maxDailyTrades} value={fields["risk.maxDailyTrades"]} min={1} max={50} step={1} onChange={(v) => setFields((f) => ({ ...f, "risk.maxDailyTrades": String(v) }))} />
            <SliderField label={s.minScore} value={fields["risk.minScore"]} min={50} max={100} step={1} onChange={(v) => setFields((f) => ({ ...f, "risk.minScore": String(v) }))} />
            <SliderField label={s.minConfidence} value={fields["risk.minConfidence"]} min={0.1} max={1} step={0.05} onChange={(v) => setFields((f) => ({ ...f, "risk.minConfidence": String(v) }))} />
            <SliderField label={s.minRR} value={fields["risk.minRR"]} min={0.5} max={5} step={0.1} onChange={(v) => setFields((f) => ({ ...f, "risk.minRR": String(v) }))} />
            <SliderField label={s.maxScaleIn} value={fields["risk.maxScaleIn"]} min={0} max={5} step={1} onChange={(v) => setFields((f) => ({ ...f, "risk.maxScaleIn": String(v) }))} />
            <SliderField label={s.maxReentry} value={fields["risk.maxReentry"]} min={0} max={5} step={1} onChange={(v) => setFields((f) => ({ ...f, "risk.maxReentry": String(v) }))} />
            <SliderField label={s.engineCapital} value={fields["engine.capital"]} min={100} max={1000000} step={100} onChange={(v) => setFields((f) => ({ ...f, "engine.capital": String(v) }))} />
            <SliderField label={s.scannerLimit} value={fields["engine.symbolScannerLimit"]} min={1} max={40} step={1} onChange={(v) => setFields((f) => ({ ...f, "engine.symbolScannerLimit": String(v) }))} />
            <SliderField label={s.maxPositions} value={fields["engine.maxTotalPositions"]} min={1} max={20} step={1} onChange={(v) => setFields((f) => ({ ...f, "engine.maxTotalPositions": String(v) }))} />
            <SliderField label={s.scanInterval} value={fields["engine.scanIntervalMinutes"]} min={1} max={60} step={1} onChange={(v) => setFields((f) => ({ ...f, "engine.scanIntervalMinutes": String(v) }))} />
            <div className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-3 py-2 sm:col-span-2">
              <span className="text-xs text-muted-foreground">{s.trailingStop}</span>
              <Switch checked={fields["risk.trailingStop"] === "true"} onCheckedChange={(v) => setFields((f) => ({ ...f, "risk.trailingStop": String(v) }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-3 py-2 sm:col-span-2">
              <span className="text-xs text-muted-foreground">{lang === "fa" ? "هدف پلهای زمانی (ROI)" : "Time-based ROI take-profit"}</span>
              <Switch checked={fields["risk.roiEnabled"] === "true"} onCheckedChange={(v) => setFields((f) => ({ ...f, "risk.roiEnabled": String(v) }))} />
            </div>
            <div className="space-y-1.5 rounded-md border border-border/50 bg-background/40 p-3 sm:col-span-2">
              <p className="text-xs text-muted-foreground">{lang === "fa" ? "جدول ROI (دقیقه به درصد سود)" : "ROI table (minutes to profit %)"}</p>
              <Textarea dir="ltr" rows={3} className="terminal-font text-[11px]" value={fields["risk.roiTable"] ?? ""} onChange={(e) => setFields((f) => ({ ...f, "risk.roiTable": e.target.value }))} />
              <p className="text-[10px] leading-4 text-muted-foreground">{lang === "fa" ? "سبک فرکترید: هرچه پوزیشن پیرتر شود، هدف سود کوچکتر میشود تا بردها از دست نروند. فرمت JSON: آرایه minutes و roi." : "Freqtrade-style: the longer a position is open, the smaller the profit target. JSON array of {minutes, roi}."}</p>
            </div>
            <SliderField label={lang === "fa" ? "ممنوعیت ورود مجدد (دقیقه)" : "Re-entry cooldown (min)"} value={fields["risk.cooldownMinutes"]} min={0} max={240} step={5} onChange={(v) => setFields((f) => ({ ...f, "risk.cooldownMinutes": String(v) }))} />
          </CardContent>
        </Card>
        <RiskAiReviewPanel />
        <Button className="w-full" onClick={doSaveSettings}>{s.save}</Button>
      </TabsContent>

      <TabsContent value="reports" className="space-y-4">
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Download className="size-4 text-emerald-400" /> {lang === "fa" ? "گزارش‌گیری — خروجی و ورود داده" : "Reporting — export and import"}</CardTitle>
            <CardDescription>{lang === "fa" ? "کل داده‌های پلتفرم (معاملات، سیگنال‌ها، یادگیری، تنظیمات، لاگ‌ها) را به‌صورت فایل متنی JSON دانلود کن و همان فایل را دوباره وارد کن تا روی دیتابیس ذخیره شود. فرمت فایل: همان خروجی همین دکمه — بدون رمز عبور و کلیدهای واقعی." : "Download every platform record (trades, signals, learning, settings, logs) as a JSON text file and re-import the same file to save it back to the database. Format: the output of this button — no passwords or real secrets."}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="gap-1.5" onClick={doExportReport}><Download className="size-3.5" /> {lang === "fa" ? "دانلود گزارش کامل (JSON)" : "Download full report (JSON)"}</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => reportFileRef.current?.click()}><FileText className="size-3.5" /> {lang === "fa" ? "ورود گزارش (JSON)" : "Import report (JSON)"}</Button>
            <input ref={reportFileRef} type="file" accept="application/json,.json,text/plain" className="hidden" onChange={doImportReport} />
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardContent className="flex flex-wrap items-center gap-2 p-4">
            <span className="text-xs text-muted-foreground">{s.reportsPeriod}</span>
            <Select value={reportPeriod} onValueChange={setReportPeriod}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">{s.periodDaily}</SelectItem>
                <SelectItem value="weekly">{s.periodWeekly}</SelectItem>
                <SelectItem value="monthly">{s.periodMonthly}</SelectItem>
                <SelectItem value="all">{s.periodAll}</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="gap-1.5 ms-auto" onClick={() => refreshPerf({ token }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message)))}>
              <RefreshCw className="size-3.5" /> {s.refreshPerf}
            </Button>
          </CardContent>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={s.trades} value={reports?.trades ?? 0} hint={`${s.wins}: ${reports?.wins ?? 0} · ${s.losses}: ${reports?.losses ?? 0}`} />
          <Stat label={s.winRate} value={`${reports?.winRate ?? 0}%`} />
          <Stat label={s.realizedPnl} value={money(reports?.realizedPnl)} />
          <Stat label={s.profitFactor} value={reports?.profitFactor === Infinity ? "∞" : (reports?.profitFactor ?? 0)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={s.grossProfit} value={money(reports?.grossProfit)} />
          <Stat label={s.grossLoss} value={money(-(reports?.grossLoss ?? 0))} />
          <Stat label={s.unrealizedPnl} value={money(reports?.unrealizedPnl)} />
          <Stat label={s.maxDrawdown} value={money(reports?.maxDrawdown)} />
        </div>
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><FlaskConical className="size-4 text-amber-400" /> {s.backtest}</CardTitle>
            <CardDescription>{lang === "fa" ? "بازپخش کندل‌های واقعی ذخیره‌شده در همان موتور زنده — بدون دست‌زدن به پوزیشن‌ها (سبک Zipline/Backtrader)" : "Replays stored real candles through the exact live evaluator — read-only, never touches positions (Zipline/Backtrader style)"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <span className="text-[10px] text-muted-foreground">{s.btSymbol}</span>
                <Select value={btSymbol} onValueChange={setBtSymbol}>
                  <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(markets ?? []).map((m: any) => <SelectItem key={m.symbol} value={m.symbol}>{fmtSym(m.symbol)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <span className="text-[10px] text-muted-foreground">{s.btTimeframe}</span>
                <Select value={btTf} onValueChange={setBtTf}>
                  <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["5m", "15m", "30m", "1h", "4h", "1d"].map((tf) => <SelectItem key={tf} value={tf}>{tf}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <span className="text-[10px] text-muted-foreground">{lang === "fa" ? "صرافی داده" : "Data exchange"}</span>
                <Select value={btExchange} onValueChange={setBtExchange}>
                  <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[["auto", lang === "fa" ? "خودکار (زنجیره مقاوم)" : "Auto (resilient chain)"], ["binance", "Binance"], ["okx", "OKX"], ["kucoin", "KuCoin"], ["mexc", "MEXC"], ["gate", "Gate.io"], ["bybit", "Bybit"], ["bitget", "Bitget"], ["coinex", "CoinEx"]].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" className="h-8 gap-1.5" disabled={btBusy} onClick={doBacktest}>
                <Play className="size-3.5" /> {btBusy ? s.btRunning : s.btRun}
              </Button>
            </div>
            {btResult && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                  <p className="text-[10px] text-muted-foreground">{s.trades}</p>
                  <p className="terminal-font text-sm font-bold" dir="ltr">{btResult.trades} <span className="text-muted-foreground">({btResult.windows} {s.btWindows})</span></p>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                  <p className="text-[10px] text-muted-foreground">{s.btWinRate}</p>
                  <p className={`terminal-font text-sm font-bold ${btResult.winRate >= 50 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{btResult.winRate}%</p>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                  <p className="text-[10px] text-muted-foreground">{s.btProfitFactor}</p>
                  <p className="terminal-font text-sm font-bold" dir="ltr">{btResult.profitFactor === Infinity ? "∞" : btResult.profitFactor}</p>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                  <p className="text-[10px] text-muted-foreground">{s.btAvgRr}</p>
                  <p className="terminal-font text-sm font-bold" dir="ltr">{btResult.avgRr}</p>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                  <p className="text-[10px] text-muted-foreground">{s.btAvgPnl}</p>
                  <p className={`terminal-font text-sm font-bold ${btResult.avgPnlPct >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{btResult.avgPnlPct}%</p>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                  <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "حداکثر افت" : "Max DD %"}</p>
                  <p className="terminal-font text-sm font-bold text-red-300" dir="ltr">{btResult.maxDrawdownPct}%</p>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                  <p className="text-[10px] text-muted-foreground">Sharpe</p>
                  <p className={`terminal-font text-sm font-bold ${btResult.sharpe >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{btResult.sharpe}</p>
                </div>
              </div>
            )}
            {btResult && btResult.bestStrategies.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] text-muted-foreground">{s.btBestStrategies}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(btResult.bestStrategies as any[]).map((st: any) => (
                    <Badge key={st.key} variant="outline" className="text-[10px] text-emerald-300" dir="ltr">{st.key} · {st.winRate}% <span className="text-muted-foreground">({st.trades})</span></Badge>
                  ))}
                </div>
              </div>
            )}
            {btResult && btResult.tradeList.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-auto">
                {(btResult.tradeList as any[]).map((t: any, i: number) => (
                  <div key={i} className="flex flex-wrap items-center gap-1.5 rounded border border-border/40 bg-background/30 px-2 py-1 text-[11px]">
                    <span className="font-bold" dir="ltr">{t.side === "long" ? "▲" : "▼"} {fmtSym(t.symbol)}</span>
                    <span className={`font-bold ${t.outcome === "win" ? "text-emerald-300" : "text-red-300"}`}>{t.outcome}</span>
                    <span className="terminal-font text-muted-foreground" dir="ltr">e {t.entry} · x {t.exit}</span>
                    <span className="terminal-font" dir="ltr">{t.pnlPct > 0 ? "+" : ""}{t.pnlPct}%</span>
                    <span className="text-muted-foreground">RR {t.rr}</span>
                    <span className="terminal-font text-muted-foreground" dir="ltr">{t.strategies.join(" + ")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Brain className="size-4 text-violet-300" /> {lang === "fa" ? "صحت‌سنجی هوش مصنوعی (بک‌تست AI)" : "AI validation (AI backtest)"}</CardTitle>
            <CardDescription>{lang === "fa" ? "کندل‌های واقعی بازپخش می‌شوند و هوش مصنوعی جهت کندل بعدی را پیش‌بینی می‌کند؛ دقت پیش‌بینی‌ها با واقعیت مقایسه می‌شود (پروایدر اصلی + زنجیره رایگان)." : "Replays real candles and asks the AI to predict the next-candle direction; accuracy is measured against the actual outcome (primary provider + free fallback chain)."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button size="sm" className="h-8 gap-1.5" disabled={aiBtBusy} onClick={doAiBacktest}>
              {aiBtBusy ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
              {aiBtBusy ? (lang === "fa" ? "در حال صحت‌سنجی…" : "Validating…") : (lang === "fa" ? "اجرای صحت‌سنجی AI" : "Run AI validation")}
            </Button>
            {aiBtResult && (
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                  <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "دقت پیش‌بینی" : "Prediction accuracy"}</p>
                  <p className={`terminal-font text-lg font-bold ${aiBtResult.accuracy >= 55 ? "text-emerald-300" : aiBtResult.accuracy >= 40 ? "text-amber-300" : "text-red-300"}`} dir="ltr">{aiBtResult.accuracy}%</p>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                  <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "درست / کل" : "Correct / total"}</p>
                  <p className="terminal-font text-lg font-bold" dir="ltr">{aiBtResult.correct} / {aiBtResult.total}</p>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                  <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "پروایدر استفاده‌شده" : "Provider used"}</p>
                  <p className="terminal-font text-sm font-bold text-cyan-300" dir="ltr">{aiBtResult.provider}</p>
                </div>
              </div>
            )}
            {aiBtResult?.windows?.length > 0 && (
              <div className="max-h-44 space-y-1 overflow-auto">
                {(aiBtResult.windows as any[]).map((w: any, wi: number) => (
                  <div key={wi} className="rounded border border-border/40 bg-background/30 px-2 py-1.5 text-[11px]">
                    <span className="font-bold" dir="ltr">{fmtSym(w.symbol)} · {w.timeframe}</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {(w.rows as any[]).map((r: any, ri: number) => (
                        <span key={ri} className={`rounded px-1.5 py-0.5 text-[10px] ${r.hit === true ? "bg-emerald-400/10 text-emerald-300" : r.hit === false ? "bg-red-400/10 text-red-300" : "bg-border/20 text-muted-foreground"}`} dir="ltr">
                          {r.predicted} {r.hit === true ? "✓" : r.hit === false ? "✗" : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Zap className="size-4 text-cyan-400" /> {lang === "fa" ? "اتصال CCXT به صرافی" : "CCXT exchange broker"}</CardTitle>
            <CardDescription>{lang === "fa" ? "سفارش‌گذاری واقعی و فید بازار از ۱۰۰+ صرافی — کلیدها فقط از Environment Variables خوانده می‌شوند و هرگز به کلاینت نمی‌رسند." : "Real order execution + market feed across 100+ exchanges — keys are read from environment variables only and never reach the client."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="h-8 gap-1.5" disabled={brokerBusy} onClick={runBrokerTest}>
                {brokerBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                {lang === "fa" ? "تست اتصال" : "Test connection"}
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={brokerBusy} onClick={runBrokerBalance}>
                <Wallet className="size-3.5" /> {lang === "fa" ? "موجودی و پوزیشن‌ها" : "Balance & positions"}
              </Button>
              {brokerTest && (
                <Badge variant="outline" className={`text-[10px] ${brokerTest.ok ? "border-emerald-400/30 text-emerald-300" : "border-red-400/30 text-red-300"}`} dir="ltr">
                  {brokerTest.exchange}{brokerTest.testnet ? " (testnet)" : ""} · {brokerTest.ok ? "OK" : (lang === "fa" ? "خطا" : "error")}
                </Badge>
              )}
            </div>
            {brokerTest && !brokerTest.ok && (
              <p className="rounded-md border border-red-400/25 bg-red-400/5 px-3 py-2 text-[11px] text-red-300">
                {brokerTest.error === "broker_not_configured"
                  ? (lang === "fa"
                    ? "کلیدی تنظیم نشده. در تب Keys پروژه این متغیرها را بگذارید: CCXT_EXCHANGE (پیش‌فرض binance)، CCXT_API_KEY، CCXT_API_SECRET و اختیاری CCXT_PASSPHRASE، CCXT_TESTNET."
                    : "Not configured. Add these env vars in the project Keys tab: CCXT_EXCHANGE (default binance), CCXT_API_KEY, CCXT_API_SECRET, optional CCXT_PASSPHRASE, CCXT_TESTNET.")
                  : String(brokerTest.error)}
              </p>
            )}
            {brokerTest?.ok && (
              <div className="rounded-md border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-[11px] text-emerald-300">
                {lang === "fa" ? "اتصال برقرار است — با فعال بودن حالت لایو، هر پوزیشن جدید با حد سود/ضرر روی صرافی واقعاً اجرا می‌شود." : "Connected — with live mode enabled, every new position is executed on the exchange with attached SL/TP."}
              </div>
            )}
            {brokerBalance?.ok && brokerBalance.balances?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(brokerBalance.balances as any[]).map((b: any) => (
                  <Badge key={b.currency} variant="outline" className="text-[10px]" dir="ltr">
                    {b.currency} · <span className="terminal-font">{b.total}</span>
                  </Badge>
                ))}
              </div>
            )}
            {brokerPositions?.ok && brokerPositions.positions?.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "پوزیشن‌های باز روی صرافی:" : "Open exchange positions:"}</p>
                {(brokerPositions.positions as any[]).map((bp: any, i: number) => (
                  <div key={i} className="flex flex-wrap items-center gap-1.5 rounded border border-border/40 bg-background/30 px-2 py-1 text-[11px]">
                    <span className="font-bold" dir="ltr">{bp.symbol}</span>
                    <span className={`font-bold ${bp.side === "long" ? "text-emerald-300" : "text-red-300"}`}>{bp.side}</span>
                    <span className="terminal-font text-muted-foreground" dir="ltr">qty {bp.contracts} · entry {bp.entryPrice}</span>
                    <span className={`terminal-font ${(bp.pnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{num(bp.pnl, 4)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] leading-5 text-muted-foreground">
              {lang === "fa" ? "بدون کلید، حالت لایو به‌صورت کاغذی (Paper) ادامه می‌دهد و با افزودن کلیدها، سفارش واقعی روی صرافی ثبت می‌شود. CCXT از ۱۰۰+ صرافی پشتیبانی می‌کند." : "Without keys, live mode keeps running in paper. Once keys are added, real orders go to the exchange. CCXT supports 100+ exchanges."}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><FlaskConical className="size-4 text-cyan-400" /> {lang === "fa" ? "بهینهسازی پارامتر (Hyperopt)" : "Parameter tuning (Hyperopt)"}</CardTitle>
            <CardDescription>{lang === "fa" ? "سبک فرکترید: ترکیبهای حد ضرر، هدف، ریسک و حداقل امتیاز روی کندلهای واقعی بازپخش و رتبهبندی میشود (فقط خواندنی — اعمال دستی است)." : "Freqtrade-style: replays stop/target/risk/score combos on real candles and ranks them (read-only — apply manually)."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="h-8 gap-1.5" disabled={tunerBusy} onClick={doTuner}>
                {tunerBusy ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
                {tunerBusy ? (lang === "fa" ? "در حال بهینهسازی…" : "Tuning…") : (lang === "fa" ? "اجرای بهینهسازی" : "Run tuning")}
              </Button>
              {tunerResult && (
                <span className="text-[11px] text-muted-foreground">
                  {lang === "fa" ? `${tunerResult.combos} ترکیب × ${tunerResult.windows} پنجره (${(tunerResult.symbols ?? []).join(", ")})` : `${tunerResult.combos} combos × ${tunerResult.windows} windows (${(tunerResult.symbols ?? []).join(", ")})`}
                </span>
              )}
            </div>
            {tunerResult?.results?.length > 0 && (
              <div className="space-y-1.5">
                {(tunerResult.results as any[]).map((r: any, i: number) => (
                  <div key={i} className={`flex flex-wrap items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] ${i === 0 ? "border-cyan-400/30 bg-cyan-400/5" : "border-border/40 bg-background/30"}`}>
                    <Badge variant="outline" className={`text-[10px] ${i === 0 ? "text-cyan-300" : "text-muted-foreground"}`}>{i + 1}</Badge>
                    <span className="terminal-font" dir="ltr">SL {r.params["risk.stopOffsetATR"]} · TP {r.params["risk.tp1ATR"]} · R {r.params["risk.riskPerTrade"]}% · S {r.params["risk.minScore"]}</span>
                    <span className={`terminal-font font-bold ${r.avgPnlPct >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{r.avgPnlPct}%/tr</span>
                    <span className="terminal-font text-muted-foreground" dir="ltr">{r.trades} tr · {r.winRate}% · PF {r.profitFactor} · DD {r.maxDrawdownPct}% · S {r.sharpe}</span>
                    <Button size="sm" variant="outline" className="ms-auto h-6 px-2 text-[10px] text-emerald-300" onClick={() => applyTunerCombo(r.params)}>{lang === "fa" ? "اعمال" : "Apply"}</Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] leading-5 text-muted-foreground">
              {lang === "fa" ? "نتایج فقط پیشنهاد است؛ گیتهای امنیتی (اجماع، تأیید مستقل، داده تازه، سقف ریسک) بعد از اعمال هم فعال میمانند." : "Suggestions only — safety gates (consensus, confirmations, fresh data, risk caps) stay active after applying."}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Brain className="size-4 text-violet-400" /> {lang === "fa" ? "تحقیق بازار با AI" : "AI market research"}</CardTitle>
            <CardDescription>{lang === "fa" ? "تیم پژوهشی AI (بنیادی، احساسات بازار، اخبار، تکنیکال) برای بازارهای تحت نظر — خروجی در کارت یادگیری هم دیده میشود." : "AI research team (fundamentals, sentiment, news, technicals) for the watched markets — output also appears in the Learning card."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="h-8 gap-1.5" disabled={researchBusy} onClick={doResearch}>
                {researchBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Brain className="size-3.5" />}
                {researchBusy ? (lang === "fa" ? "در حال تحلیل…" : "Researching…") : (lang === "fa" ? "اجرای تحقیق بازار" : "Run research")}
              </Button>
              {researchText && (
                <span className="text-[11px] text-muted-foreground">{lang === "fa" ? "تحقیق ذخیره شد — کارت یادگیری پایین را ببینید." : "Saved — see the Learning card below."}</span>
              )}
            </div>
            {researchText && (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border/40 bg-background/30 p-3 text-[11px] leading-5 text-muted-foreground" dir="auto">{researchText}</pre>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardContent className="grid gap-2 p-4 text-xs sm:grid-cols-2">
            <div className="rounded-md border border-border/50 bg-background/40 p-3">
              <p className="font-bold text-emerald-300">{s.bestStrategy}</p>
              <p className="terminal-font mt-1" dir="ltr">{reports?.bestStrategy ? `${reports.bestStrategy.key} · ${reports.bestStrategy.trades} tr · ${money(reports.bestStrategy.pnl)}` : s.misc.none}</p>
            </div>
            <div className="rounded-md border border-border/50 bg-background/40 p-3">
              <p className="font-bold text-red-300">{s.worstStrategy}</p>
              <p className="terminal-font mt-1" dir="ltr">{reports?.worstStrategy ? `${reports.worstStrategy.key} · ${reports.worstStrategy.trades} tr · ${money(reports.worstStrategy.pnl)}` : s.misc.none}</p>
            </div>
            <div className="rounded-md border border-border/50 bg-background/40 p-3">
              <p className="font-bold text-emerald-300">{s.bestSymbol}</p>
              <p className="terminal-font mt-1" dir="ltr">{reports?.bestSymbol ? `${reports.bestSymbol.symbol} · ${reports.bestSymbol.trades} tr · ${money(reports.bestSymbol.pnl)}` : s.misc.none}</p>
            </div>
            <div className="rounded-md border border-border/50 bg-background/40 p-3">
              <p className="font-bold text-red-300">{s.worstSymbol}</p>
              <p className="terminal-font mt-1" dir="ltr">{reports?.worstSymbol ? `${reports.worstSymbol.symbol} · ${reports.worstSymbol.trades} tr · ${money(reports.worstSymbol.pnl)}` : s.misc.none}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Brain className="size-4 text-cyan-400" /> {s.learning}</CardTitle>
            <CardDescription>{lang === "fa" ? "درس‌های ثبت‌شده موتور از معاملات (موفق/ناموفق + بازبینی هوش مصنوعی)" : "Engine lessons from closed trades (win/loss + AI review)"}</CardDescription>
          </CardHeader>
          <CardContent className="max-h-72 space-y-2 overflow-auto">
            {(learning ?? []).slice(0, 60).map((l: any) => (
              <div key={l.id} className="rounded-md border border-border/50 bg-background/40 p-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="terminal-font font-bold" dir="ltr">{fmtSym(l.symbol)} · {l.timeframe}</span>
                  <Badge variant="outline" className={`text-[10px] ${l.result === "win" ? "text-emerald-300" : l.result === "loss" ? "text-red-300" : "text-muted-foreground"}`}>{l.result ?? "—"}</Badge>
                  {l.pnl != null ? <span className={`terminal-font tabular-nums ${(l.pnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`} dir="ltr">{num(l.pnl, 4)}</span> : null}
                </div>
                <p className="mt-1 text-muted-foreground">{l.aiReview || l.decision || "—"}</p>
              </div>
            ))}
            {(learning ?? []).length === 0 && <p className="py-8 text-center text-muted-foreground">{s.misc.none}</p>}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><BookOpen className="size-4 text-emerald-400" /> {lang === "fa" ? "آموزش روزانه (تأیید مدیر)" : "Daily education (admin review)"}</CardTitle>
            <CardDescription>{lang === "fa" ? "درس‌های تولیدشده خودکار از فعالیت کاربران/ربات/AI — بدون تأیید شما به کاربر نمایش داده نمی‌شوند." : "Auto-generated lessons from user/bot/AI activity — hidden from users until you approve them."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="outline" disabled={eduBusy} onClick={doEduGenerate}>{eduBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {lang === "fa" ? "تولید درس جدید (امروز)" : "Generate lesson (today)"}</Button>
              <Button size="sm" variant={eduFilter === "pending" ? "default" : "outline"} onClick={() => setEduFilter("pending")}>{lang === "fa" ? "در انتظار" : "Pending"} ({(eduAll ?? []).filter((x: any) => x.status === "pending").length})</Button>
              <Button size="sm" variant={eduFilter === "approved" ? "default" : "outline"} onClick={() => setEduFilter("approved")}>{lang === "fa" ? "تأییدشده" : "Approved"}</Button>
              <Button size="sm" variant={eduFilter === "rejected" ? "default" : "outline"} onClick={() => setEduFilter("rejected")}>{lang === "fa" ? "ردشده" : "Rejected"}</Button>
              <Button size="sm" variant={eduFilter === "all" ? "default" : "outline"} onClick={() => setEduFilter("all")}>{lang === "fa" ? "همه" : "All"}</Button>
            </div>
            <div className="max-h-80 space-y-2 overflow-auto">
              {(eduAll ?? []).filter((x: any) => eduFilter === "all" || x.status === eduFilter).slice(0, 40).map((e: any) => (
                <div key={e._id} className={`rounded-md border p-2.5 text-xs ${e.status === "pending" ? "border-amber-400/30 bg-amber-400/5" : e.status === "approved" ? "border-emerald-400/30 bg-emerald-400/5" : "border-red-400/20 bg-red-400/5"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="font-bold">{lang === "fa" ? e.titleFa : e.titleEn}</span>
                    <Badge variant="outline" className={`text-[9px] ${e.status === "approved" ? "text-emerald-300" : e.status === "rejected" ? "text-red-300" : "text-amber-300"}`}>{e.status} · {e.source}</Badge>
                  </div>
                  {e.image ? (
                    <img src={`data:image/jpeg;base64,${e.image}`} alt={lang === "fa" ? e.titleFa : e.titleEn} className="mt-1.5 w-full rounded-md border border-border/50 object-cover" style={{ maxHeight: 160 }} />
                  ) : (
                    <button type="button" className="mt-1.5 flex items-center gap-1 rounded border border-dashed border-border/60 px-2 py-1 text-[10px] text-muted-foreground transition hover:border-emerald-400/40 hover:text-emerald-300" disabled={eduChannelBusy === `${e._id}:media-image`} onClick={() => doEduRegenMedia(e._id, "image")}>
                      {eduChannelBusy === `${e._id}:media-image` ? <Loader2 className="size-3 animate-spin" /> : <ImageIcon className="size-3" />}
                      {lang === "fa" ? "تولید عکس درس" : "Generate lesson image"}
                    </button>
                  )}
                  {e.audio ? (
                    <audio controls preload="none" src={`data:audio/mpeg;base64,${e.audio}`} className="mt-1.5 h-8 w-full" />
                  ) : (
                    <button type="button" className="mt-1.5 flex items-center gap-1 rounded border border-dashed border-border/60 px-2 py-1 text-[10px] text-muted-foreground transition hover:border-emerald-400/40 hover:text-emerald-300" disabled={eduChannelBusy === `${e._id}:media-audio`} onClick={() => doEduRegenMedia(e._id, "audio")}>
                      {eduChannelBusy === `${e._id}:media-audio` ? <Loader2 className="size-3 animate-spin" /> : <Volume2 className="size-3" />}
                      {lang === "fa" ? "تولید صدای درس" : "Generate lesson voice"}
                    </button>
                  )}
                  <p className="mt-1 whitespace-pre-wrap leading-5 text-muted-foreground">{lang === "fa" ? e.bodyFa : e.bodyEn}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {e.status === "pending" ? (
                      <>
                        <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => doEduReview(e._id, "approved")}>{lang === "fa" ? "تأیید و انتشار" : "Approve & publish"}</Button>
                        <Button size="sm" variant="destructive" className="h-6 px-2 text-[10px]" onClick={() => doEduReview(e._id, "rejected")}>{lang === "fa" ? "رد" : "Reject"}</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" disabled={eduChannelBusy === `${e._id}:fa`} onClick={() => doEduChannelSend(e._id, "fa")}>{eduChannelBusy === `${e._id}:fa` ? <Loader2 className="size-3 animate-spin" /> : <Globe className="size-3" />} {lang === "fa" ? "کانال فارسی" : "FA channel"}{e.sentFaAt ? " ✓" : ""}</Button>
                        <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" disabled={eduChannelBusy === `${e._id}:en`} onClick={() => doEduChannelSend(e._id, "en")}>{eduChannelBusy === `${e._id}:en` ? <Loader2 className="size-3 animate-spin" /> : <Globe className="size-3" />} {lang === "fa" ? "کانال انگلیسی" : "EN channel"}{e.sentEnAt ? " ✓" : ""}</Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {(eduAll ?? []).length === 0 && <p className="py-6 text-center text-muted-foreground">{s.misc.none}</p>}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="support" className="space-y-4">
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{s.tickets}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(allTickets ?? []).map((t: any) => {
              const open = openTicket === t._id;
              return (
                <div key={t._id} className="rounded-md border border-border/50 bg-background/40">
                  <button type="button" className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-start" onClick={() => setOpenTicket(open ? null : t._id)}>
                    <span className="terminal-font text-xs font-bold text-emerald-300" dir="ltr">#{ticketShortId(t._id)}</span>
                    <span className="text-sm font-bold">{t.subject}</span>
                    <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                    <span className="terminal-font text-[10px] text-muted-foreground" dir="ltr">{t.username ?? ""}</span>
                    <span className="ms-auto text-[10px] text-muted-foreground">{timeAgo(t.created, lang)} · {(t.messages ?? []).length} {s.message}</span>
                  </button>
                  {open && (
                    <div className="border-t border-border/40 p-3">
                      <div className="mb-2 max-h-56 space-y-1.5 overflow-auto">
                        {(t.messages ?? []).map((m: any) => (
                          <div key={m.id ?? m._id} className={`rounded-md p-2 text-xs ${m.fromAdmin ? "border border-emerald-400/25 bg-emerald-400/5" : "border border-border/50 bg-background/60"}`}>
                            <p className={m.fromAdmin ? "font-bold text-emerald-300" : "text-muted-foreground"}>
                              {m.fromAdmin ? (lang === "fa" ? "پاسخ مدیر" : "Admin") : (m.senderName ? <span dir="ltr" className="terminal-font">@{m.senderName}</span> : (lang === "fa" ? "کاربر" : "User"))}:
                              <span className="ms-2 text-[10px] text-muted-foreground">{timeAgo(m.created, lang)}</span>
                            </p>
                            <p className="mt-0.5">{m.text}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Select value={t.status} onValueChange={(v) => setTicketStatus({ token, ticketId: t._id, status: v }).catch(() => {})}>
                          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">open</SelectItem>
                            <SelectItem value="pending">pending</SelectItem>
                            <SelectItem value="answered">answered</SelectItem>
                            <SelectItem value="closed">closed</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          dir="ltr"
                          placeholder={`${s.reply}…`}
                          className="h-8 flex-1 text-xs"
                          value={ticketReply[t._id] ?? ""}
                          onChange={(e) => setTicketReply((r) => ({ ...r, [t._id]: e.target.value }))}
                        />
                        <Button size="sm" className="h-8 shrink-0" onClick={() => { replyTicket({ token, ticketId: t._id, text: ticketReply[t._id] ?? "" }).then(() => { setTicketReply((r) => ({ ...r, [t._id]: "" })); toast.success(s.saved); }).catch((e: any) => toast.error(String(e?.message))); }}>{s.reply}</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {(allTickets ?? []).length === 0 && <p className="py-8 text-center text-muted-foreground">{s.misc.none}</p>}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="referral" className="space-y-4">
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{s.tabReferral}</CardTitle></CardHeader>
          <CardContent className="max-h-[30rem] overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{s.referralCode}</TableHead>
                  <TableHead className="text-xs">{lang === "fa" ? "دعوت‌کننده" : "Referrer"}</TableHead>
                  <TableHead className="text-xs">{s.referred}</TableHead>
                  <TableHead className="text-xs">{s.status}</TableHead>
                  <TableHead className="text-xs">{s.reward}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(referrals ?? []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="terminal-font text-xs font-semibold" dir="ltr">{r.code}</TableCell>
                    <TableCell className="text-xs" dir="ltr">{r.referrer ?? "—"}</TableCell>
                    <TableCell className="text-xs" dir="ltr">{r.referred ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.status}</TableCell>
                    <TableCell className="text-xs">{r.rewardEnabled ? (lang === "fa" ? "فعال" : "ON") : (lang === "fa" ? "خاموش" : "OFF")}</TableCell>
                  </TableRow>
                ))}
                {(referrals ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">{s.misc.none}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="logs" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{s.logsFilter}</span>
          <Select value={logLevel} onValueChange={setLogLevel}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{lang === "fa" ? "همه" : "All"}</SelectItem>
              <SelectItem value="INFO">INFO</SelectItem>
              <SelectItem value="WARNING">WARNING</SelectItem>
              <SelectItem value="ERROR">ERROR</SelectItem>
              <SelectItem value="CRITICAL">CRITICAL</SelectItem>
              <SelectItem value="TRADE">TRADE</SelectItem>
              <SelectItem value="AI">AI</SelectItem>
              <SelectItem value="SECURITY">SECURITY</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{s.logs}</CardTitle></CardHeader>
          <CardContent className="max-h-[26rem] space-y-1.5 overflow-auto">
            {(engineLogs ?? []).map((l: any) => (
              <div key={l._id} className="flex items-start gap-2 rounded-md border border-border/40 bg-background/30 px-2 py-1.5 text-xs">
                <LevelPill level={l.level} />
                <span className="text-muted-foreground">{logFa(String(l.message ?? ""), lang)}</span>
                <span className="terminal-font ms-auto shrink-0 text-[10px] text-muted-foreground">{timeAgo(l.created, lang)}</span>
              </div>
            ))}
            {(engineLogs ?? []).length === 0 && <p className="py-8 text-center text-muted-foreground">{s.misc.none}</p>}
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm"><ShieldCheck className="size-4 text-violet-300" /> {lang === "fa" ? "لاگ امنیتی (Audit)" : "Security audit log"}</CardTitle></CardHeader>
          <CardContent className="max-h-[26rem] space-y-1.5 overflow-auto">
            {(auditLogs ?? []).map((l: any) => (
              <div key={l._id} className="flex items-start gap-2 rounded-md border border-border/40 bg-background/30 px-2 py-1.5 text-xs">
                <LevelPill level="SECURITY" />
                <span className="text-muted-foreground" dir="ltr">{String(l.action ?? "")}</span>
                <span className="ms-auto shrink-0 text-[10px] text-muted-foreground">{l.actor ?? ""} · {timeAgo(l.created, lang)}</span>
              </div>
            ))}
            {(auditLogs ?? []).length === 0 && <p className="py-8 text-center text-muted-foreground">{s.misc.none}</p>}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="coins" className="space-y-4">
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{s.coinSettings}</CardTitle></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={s.usdtTomanRate} value={fields["usdt.tomanRate"]} onChange={(v) => setFields((f) => ({ ...f, "usdt.tomanRate": v }))} />
            <Field label={s.tomanPerCoin} value={fields["coins.tomanPerCoin"]} onChange={(v) => setFields((f) => ({ ...f, "coins.tomanPerCoin": v }))} />
            <Field label={s.coinPerHour} value={fields["coins.coinPerHour"]} onChange={(v) => setFields((f) => ({ ...f, "coins.coinPerHour": v }))} />
            <Field label={s.rewardProfile} value={fields["coins.rewardProfile"]} onChange={(v) => setFields((f) => ({ ...f, "coins.rewardProfile": v }))} />
            <Field label={s.rewardPrediction} value={fields["coins.rewardPrediction"]} onChange={(v) => setFields((f) => ({ ...f, "coins.rewardPrediction": v }))} />
            <Field label={s.rewardReferral} value={fields["coins.rewardReferral"]} onChange={(v) => setFields((f) => ({ ...f, "coins.rewardReferral": v }))} />
            <Field label={s.rewardReferralNew} value={fields["coins.rewardReferralNew"]} onChange={(v) => setFields((f) => ({ ...f, "coins.rewardReferralNew": v }))} />
            <Field label={s.minCapital} value={fields["vip.minCapital"]} onChange={(v) => setFields((f) => ({ ...f, "vip.minCapital": v }))} />
            <Field label={s.tomanCard} value={fields["wallet.tomanCard"]} onChange={(v) => setFields((f) => ({ ...f, "wallet.tomanCard": v }))} />
            <Field label={s.tomanHolder} value={fields["wallet.tomanCardHolder"]} onChange={(v) => setFields((f) => ({ ...f, "wallet.tomanCardHolder": v }))} />
            <Field label={s.supportBotUsername} value={fields["support.botUsername"]} onChange={(v) => setFields((f) => ({ ...f, "support.botUsername": v }))} />
            <Field label={s.supportVipUsername} value={fields["support.vipUsername"]} onChange={(v) => setFields((f) => ({ ...f, "support.vipUsername": v }))} />
            <div className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">{s.coinsEnabled}</span>
              <Switch checked={Boolean(cfg["coins.enabled"])} onCheckedChange={(v) => { setCfg((c) => ({ ...c, "coins.enabled": v })); saveSettings({ token, settings: { "coins.enabled": v } }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message))); }} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">{s.referralEnabled}</span>
              <Switch checked={cfg["coins.referralEnabled"] !== false} onCheckedChange={(v) => { setCfg((c) => ({ ...c, "coins.referralEnabled": v })); saveSettings({ token, settings: { "coins.referralEnabled": v } }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message))); }} />
            </div>
            <div className="space-y-1 rounded-md border border-border/50 bg-background/40 p-2">
              <p className="text-xs font-bold text-muted-foreground">{s.buyPackage} (JSON)</p>
              <Textarea dir="ltr" className="min-h-20 text-[11px]" value={packagesJson} onChange={(e) => setPackagesJson(e.target.value)} placeholder='[{"label":"Pro","labelFa":"حرفه‌ای","coins":10000,"price":800000}]' />
              <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "فرمت: [{label, labelFa, coins, price}] — قیمت به تومان" : "Format: [{label, labelFa, coins, price}] — price in toman"}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{s.voucherCreate}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-4">
              <Input dir="ltr" placeholder={`${s.voucherCode} (${lang === "fa" ? "خالی = تصادفی" : "empty = random"})`} value={voucherForm.code} onChange={(e) => setVoucherForm({ ...voucherForm, code: e.target.value })} />
              <Input type="number" placeholder={s.voucherCoins} value={voucherForm.coins} onChange={(e) => setVoucherForm({ ...voucherForm, coins: e.target.value })} />
              <Input type="number" placeholder={s.voucherUses} value={voucherForm.uses} onChange={(e) => setVoucherForm({ ...voucherForm, uses: e.target.value })} />
              <div className="flex gap-1.5">
                <Button variant="outline" className="flex-1" onClick={() => setVoucherForm((f) => ({ ...f, code: "WOLF-" + Math.random().toString(36).slice(2, 10).toUpperCase() }))}>{s.randomGen}</Button>
                <Button className="flex-1" onClick={async () => { const coins = Math.floor(parseFloat(voucherForm.coins)); const uses = Math.max(1, Math.floor(parseFloat(voucherForm.uses) || 1)); if (!(coins > 0)) return toast.error(s.amount); try { await createVoucher({ token, code: voucherForm.code.trim(), coins, maxUses: uses }); toast.success(s.saved); setVoucherForm({ code: "", coins: "", uses: "1" }); } catch (e: any) { toast.error(String(e?.message ?? "error")); } }}>{s.create}</Button>
              </div>
            </div>
            <div className="max-h-56 space-y-1.5 overflow-auto">
              {(vouchers ?? []).map((vc: any) => (
                <div key={vc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-xs">
                  <span className="terminal-font font-bold" dir="ltr">{vc.code}</span>
                  <span className="tabular-nums text-cyan-300">+{vc.coins}</span>
                  <span className="text-muted-foreground">{vc.usedCount}/{vc.maxUses} {s.timesUsed}</span>
                  <span className="text-[10px] text-muted-foreground">{(vc.lastUsers ?? []).join(", ") || "—"}</span>
                  <Switch checked={vc.status !== false} onCheckedChange={(v) => toggleVoucher({ token, id: vc.id, status: v }).catch(() => {})} />
                </div>
              ))}
              {(vouchers ?? []).length === 0 && <p className="py-4 text-center text-muted-foreground">{s.misc.none}</p>}
            </div>
          </CardContent>
        </Card>

        <Button className="w-full" onClick={doSaveSettings}>{s.save}</Button>
      </TabsContent>

      <TabsContent value="ai" className="space-y-4">
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Brain className="size-4 text-cyan-400" /> {s.aiUsage}</CardTitle>
            <CardDescription>{s.aiHint}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-border/50 bg-background/40 p-3 text-center">
                <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "کل درخواست‌ها" : "Total requests"}</p>
                <p className="terminal-font mt-1 text-xl font-bold tabular-nums">{aiUsage?.total ?? 0}</p>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 p-3 text-center">
                <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "خطاها" : "Errors"}</p>
                <p className={`terminal-font mt-1 text-xl font-bold tabular-nums ${(aiUsage?.errors ?? 0) > 0 ? "text-red-300" : "text-emerald-300"}`}>{aiUsage?.errors ?? 0}</p>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 p-3">
                <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "پروایدرها" : "Providers"}</p>
                <p className="terminal-font mt-1 text-xs" dir="ltr">{Object.entries(aiUsage?.byProvider ?? {}).map(([k, v]) => `${k}:${v}`).join(" · ") || "—"}</p>
              </div>
              <div className="col-span-full flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-background/40 p-2 text-[11px]">
                <span className="text-muted-foreground">{lang === "fa" ? "سلامت AI (پروب خودکار هر چند دقیقه)" : "AI health (auto probe)"}:</span>
                <Badge variant="outline" className={`text-[10px] ${String(settings?.["ai.healthStatus"]) === "ok" ? "text-emerald-300" : String(settings?.["ai.healthStatus"]) === "error" ? "text-red-300" : "text-amber-300"}`}>{String(settings?.["ai.healthStatus"] ?? "unknown")}</Badge>
                <span className="terminal-font" dir="ltr">{String(settings?.["ai.healthProvider"] ?? "") || "—"}</span>
                <span className="text-muted-foreground">{settings?.["ai.healthAt"] ? timeAgo(Number(settings?.["ai.healthAt"]), lang) : ""}</span>
                {String(settings?.["ai.healthMessage"] ?? "") ? <span className="terminal-font text-muted-foreground" dir="ltr">{String(settings?.["ai.healthMessage"])}</span> : null}
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 border-cyan-400/30 text-cyan-300" onClick={() => testAi({ token }).then((r: any) => toast.success(`${s.testAi}: ${r.message}`)).catch((e: any) => toast.error(String(e?.message ?? "error")))}>
              <Sparkles className="size-3.5" /> {s.testAi}
            </Button>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/50 bg-background/40 p-2 text-[11px]">
              <span className="text-muted-foreground">{lang === "fa" ? "پاک کردن تاریخچه (از پنل کاربر هم حذف می‌شود):" : "Clear history (removed from the user panel too):"}</span>
              <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" disabled={aiClearBusy !== null} onClick={() => doClearAiHistory("chat")}>{aiClearBusy === "chat" ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} {lang === "fa" ? "چت‌های کاربران" : "User chats"}</Button>
              <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" disabled={aiClearBusy !== null} onClick={() => doClearAiHistory("post_entry")}>{aiClearBusy === "post_entry" ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} {lang === "fa" ? "بازبینی پوزیشن‌ها" : "Position reviews"}</Button>
              <Button size="sm" variant="destructive" className="h-6 gap-1 text-[10px]" disabled={aiClearBusy !== null} onClick={() => doClearAiHistory()}>{aiClearBusy === "all" ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} {lang === "fa" ? "پاک کردن همه" : "Clear everything"}</Button>
            </div>
            <div className="max-h-56 space-y-1.5 overflow-auto">
              {(aiUsage?.recent ?? []).map((r: any) => (
                <div key={r.id} className="rounded-md border border-border/40 bg-background/30 p-2 text-[11px]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="terminal-font font-bold" dir="ltr">{r.kind} · {r.provider}</span>
                    <span className="flex items-center gap-1">
                      {r.user ? <span className="rounded border border-border/50 bg-background/40 px-1 py-px text-[9px] text-cyan-300">👤 {r.user}</span> : null}
                      <Badge variant="outline" className={`text-[9px] ${r.status === "done" ? "text-emerald-300" : r.status === "error" ? "text-red-300" : "text-amber-300"}`}>{r.status}</Badge>
                      <button type="button" title={lang === "fa" ? "حذف" : "Delete"} onClick={() => doDeleteAiRows(r.id)} className="rounded border border-border/50 p-0.5 text-red-300 transition hover:bg-red-400/10"><Trash2 className="size-3" /></button>
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{r.text || r.error || "…"}</p>
                </div>
              ))}
              {(aiUsage?.recent ?? []).length === 0 && <p className="py-6 text-center text-muted-foreground">{s.misc.none}</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Wifi className="size-4 text-cyan-300" /> {lang === "fa" ? "هوش مصنوعی‌های در دسترس (مانیتورینگ هر پروایدر)" : "Available AI engines (per-provider monitoring)"}</CardTitle>
            <CardDescription>{lang === "fa" ? "وضعیت زنده هر پروایدر: کلید تنظیم شده؟، کول‌داون/خطاها، آخرین موفقیت، تعداد درخواست‌ها و پشتیبانی از تصویر (vision). کلیدها فقط از تب Keys خوانده می‌شوند و هرگز نمایش داده نمی‌شوند." : "Live status per provider: key configured?, cooldown/errors, last success, request count and image (vision) support. Keys are read from the Keys tab and never displayed."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(aiProviderHealth ?? []).length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">{s.misc.none}</p>}
            <div className="grid gap-1.5 sm:grid-cols-2">
              {(aiProviderHealth ?? []).map((p: any) => {
                const ready = p.cooldownMs <= 0;
                const usable = p.hasKey || p.kind === "keyless";
                return (
                  <div key={p.id} className={`flex items-center gap-2 rounded-md border p-2 ${ready ? "border-border/50 bg-background/40" : "border-red-400/25 bg-red-400/5"}`}>
                    <span className={`size-2 shrink-0 rounded-full ${ready ? (usable ? "bg-emerald-400" : "bg-amber-400") : "bg-red-400"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-bold" dir="ltr">{p.labelFa}</p>
                      <p className="truncate text-[9px] text-muted-foreground" dir="ltr">{p.model} · {p.usage} req · {p.errors} err</p>
                      {p.cap ? (
                        <>
                          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-border/40" title={`${p.usedToday}/${p.cap} today · ${p.remaining} left`}>
                            <div className={`h-full rounded-full ${p.capacityPct >= 100 ? "bg-red-400" : p.capacityPct >= 70 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.max(2, Math.min(100, p.capacityPct))}%` }} />
                          </div>
                          <p className="mt-0.5 truncate text-[8px] text-muted-foreground" dir="ltr">💧 {p.remaining} / {p.cap} today</p>
                        </>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5 text-[9px]">
                      {p.kind === "keyless" ? <Badge variant="outline" className="text-[8px] text-cyan-300">keyless</Badge> : <Badge variant="outline" className={`text-[8px] ${p.hasKey ? "text-emerald-300" : "text-amber-300"}`}>{p.hasKey ? "✓ key" : "no key"}</Badge>}
                      {p.vision ? <Badge variant="outline" className="text-[8px] text-emerald-300">👁 vision</Badge> : null}
                      {p.cooldownMs > 0 ? <span className="text-red-300">{Math.ceil(p.cooldownMs / 60000)}m cooldown</span> : p.lastGoodAt > 0 ? <span className="text-muted-foreground">✓ {timeAgo(p.lastGoodAt, lang)}</span> : <span className="text-muted-foreground">—</span>}
                      {p.failures > 0 ? <span className="text-red-300">{p.failures} fail</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {(aiProviderHealth ?? []).length > 0 && (
              <p className="text-[10px] text-muted-foreground">{lang === "fa"
                ? `${(aiProviderHealth ?? []).filter((p: any) => p.hasKey || p.kind === "keyless").length} پروایدر قابل استفاده · ${(aiProviderHealth ?? []).filter((p: any) => p.vision).length} پروایدر دیداری (تصویر) · ${(aiProviderHealth ?? []).filter((p: any) => p.cooldownMs > 0).length} در کول‌داون`
                : `${(aiProviderHealth ?? []).filter((p: any) => p.hasKey || p.kind === "keyless").length} usable · ${(aiProviderHealth ?? []).filter((p: any) => p.vision).length} vision · ${(aiProviderHealth ?? []).filter((p: any) => p.cooldownMs > 0).length} cooling down`}</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Wrench className="size-4 text-cyan-300" /> {lang === "fa" ? "پروایدر، کلید و تنظیمات" : "Provider, keys & settings"}</CardTitle>
            <CardDescription>{lang === "fa" ? "همه‌چیز هوش مصنوعی در یک‌جا — پروایدر، کلیدها، چرخش خودکار و تأیید خودکار پاسخ‌ها." : "Everything AI in one place — provider, keys, auto-rotation and self-verification."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="col-span-full flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 p-3">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-emerald-300">{lang === "fa" ? "چرخش خودکار بین هوش مصنوعی‌ها" : "Automatic AI rotation"}</p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">{lang === "fa" ? "هر سؤال کاربر از هوش مصنوعیِ بعدیِ سالم (چرخشی) پاسخ می‌گیرد تا فشار روی سقف رایگان پخش شود و هر بار جواب متفاوت ولی درست و کاربردی باشد — بدون پرسیدن از کاربر." : "Each user question rotates to the NEXT healthy AI — free-tier load is spread evenly and every answer is different yet correct and useful, without asking the user."}</p>
              </div>
              <Switch checked={fields["ai.randomProvider"] !== "false"} onCheckedChange={(v) => { setFields((f) => ({ ...f, "ai.randomProvider": String(v) })); saveSettings({ token, settings: { "ai.randomProvider": v } }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message))); }} />
            </div>
            <Select value={fields["ai.provider"]} onValueChange={(v) => setFields((f) => ({ ...f, "ai.provider": v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{AI_PROVIDER_OPTIONS.map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={fields["ai.model"]} placeholder={lang === "fa" ? "مدل (اختیاری)" : "Model (optional)"} onChange={(e) => setFields((f) => ({ ...f, "ai.model": e.target.value }))} />
            <Field label={lang === "fa" ? "کلید اصلی (اگر پروایدر کلید می‌خواهد)" : "Primary key (if the provider needs one)"} secret value={fields["ai.key"]} onChange={(v) => setFields((f) => ({ ...f, "ai.key": v }))} />
            <Field label={lang === "fa" ? "کلید دوم (نظر دوم مستقل)" : "Second key (2nd opinion)"} secret value={fields["ai.key2"]} onChange={(v) => setFields((f) => ({ ...f, "ai.key2": v }))} />
            <div className="col-span-full flex flex-wrap items-center gap-2 rounded-md border border-cyan-400/20 bg-cyan-400/5 px-3 py-2">
              <Button size="sm" className="h-7 gap-1.5 text-[11px]" onClick={async () => { await doSaveSettings(); try { const r: any = await testAi({ token }); toast.success(`${s.testAi}: ${r.message}`); } catch (e: any) { toast.error(String(e?.message ?? "error")); } }}>
                <Sparkles className="size-3" /> {lang === "fa" ? "ذخیره و استفاده از این هوش مصنوعی" : "Save & use this AI"}
              </Button>
              <span className="text-[10px] leading-relaxed text-muted-foreground">{lang === "fa" ? "کلید پروایدر را اینجا بگذارید و این دکمه را بزنید — در صورت صحیح بودن، همین پروایدر فعال شده و همان لحظه تست می‌شود." : "Paste the provider key here and hit this button — if valid, this provider is activated and tested immediately."}</span>
            </div>
            <Select value={fields["ai.provider2"]} onValueChange={(v) => setFields((f) => ({ ...f, "ai.provider2": v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder={lang === "fa" ? "پروایدر دوم (نظر دوم)" : "2nd provider (2nd opinion)"} /></SelectTrigger>
              <SelectContent>{AI_PROVIDER_OPTIONS.map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={fields["ai.model2"]} placeholder={lang === "fa" ? "مدل پروایدر دوم" : "2nd provider model"} onChange={(e) => setFields((f) => ({ ...f, "ai.model2": e.target.value }))} />
            <Field label={lang === "fa" ? "دوره سلامت (دقیقه)" : "Health probe (min)"} value={fields["ai.rotationMinutes"]} onChange={(v) => setFields((f) => ({ ...f, "ai.rotationMinutes": v }))} />
            <Field label={lang === "fa" ? "بازبینی بعد از ورود به معامله (دقیقه)" : "Post-entry review (min)"} value={fields["ai.postEntryReviewMinutes"]} onChange={(v) => setFields((f) => ({ ...f, "ai.postEntryReviewMinutes": v }))} />
            <div className="col-span-full grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {([
                ["ai.enabled", lang === "fa" ? "هوش مصنوعی فعال" : "AI enabled", lang === "fa" ? "کل لایه هوش مصنوعی (چت، بازبینی، آموزش) روشن/خاموش." : "Turns the whole AI layer (chat, reviews, education) on/off."],
                ["ai.selfVerify", lang === "fa" ? "نمونه‌برداری ابرازی (اعتماد)" : "Verbalized sampling", lang === "fa" ? "چت دو نمونه می‌گیرد و نمونه‌ای که اعتماد بیشتری ابراز کرده برنده می‌شود — پاسخ دقیق‌تر ولی کمی کندتر." : "Chats take two samples and keep the one with higher self-reported confidence — more accurate, slightly slower."],
                ["ai.secondaryEnabled", lang === "fa" ? "نظر دوم مستقل" : "Independent 2nd opinion", lang === "fa" ? "پروایدر دوم (زیر) هر سیگنال را جداگانه بازبینی می‌کند تا مدیر دو دیدگاه داشته باشد." : "The 2nd provider (below) reviews every signal independently so the manager gets two viewpoints."],
                ["ai.freeFallback", lang === "fa" ? "پشتیبان رایگان خودکار" : "Free fallback chain", lang === "fa" ? "وقتی پروایدر انتخابی در دسترس نباشد، لایه‌های بدون کلید (Pollinations/LLM7/Kilo/OVHcloud) خودکار جواب می‌دهند." : "When the chosen provider is unavailable, the keyless tier (Pollinations/LLM7/Kilo/OVHcloud) answers automatically."],
              ] as Array<[string, string, string]>).map(([k, label, hint]) => (
                <div key={k} className="space-y-1 rounded-md border border-border/50 bg-background/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-muted-foreground">{label}</span>
                    <Switch checked={k === "ai.freeFallback" ? fields["ai.freeFallback"] !== "false" : fields[k] === "true"} onCheckedChange={(v) => { setFields((f) => ({ ...f, [k]: String(v) })); saveSettings({ token, settings: { [k]: v } }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message))); }} />
                  </div>
                  <p className="text-[9px] leading-relaxed text-muted-foreground">{hint}</p>
                </div>
              ))}
            </div>
            <div className="col-span-full flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-3 py-2 text-[10px] text-muted-foreground">
              <span>{lang === "fa" ? "پروایدرهای self-hosted (Kiro، nanobot، apfel، WebAI، Free One API) با تنظیم بیس‌شان در تب Keys وارد زنجیره می‌شوند — کلید اختیاری است." : "Self-hosted gateways (Kiro, nanobot, apfel, WebAI, Free One API) join the chain when their BASE env is set in the Keys tab — key optional."}</span>
              <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" onClick={doSaveSettings}>{s.save}</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Volume2 className="size-4 text-cyan-300" /> {lang === "fa" ? "متن‌به‌صدا (openai-edge-tts)" : "Text-to-speech (openai-edge-tts)"}</CardTitle>
            <CardDescription>{lang === "fa" ? "سرور self-hosted با API سازگار با OpenAI — دکمه‌ی بلندگو کنار پاسخ‌های WOLF AI و درس‌ها. صدا خودکار بر اساس زبان سایت انتخاب می‌شود (فارسی: fa-IR-FaridNeural، انگلیسی: en-US-AvaNeural) مگر اینکه اینجا دستی تعیین کنید." : "Self-hosted OpenAI-compatible server — powers the speaker buttons on WOLF AI replies and lessons. The voice follows the site language automatically (fa-IR-FaridNeural / en-US-AvaNeural) unless you override it here."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="col-span-full flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 p-3">
              <p className="text-xs font-bold text-cyan-300">{lang === "fa" ? "فعال‌سازی خواندن پاسخ‌ها" : "Enable reply reading"}</p>
              <Switch checked={fields["tts.enabled"] === "true"} onCheckedChange={(v) => setFields((f) => ({ ...f, "tts.enabled": String(v) }))} />
            </div>
            <Field label={lang === "fa" ? "آدرس سرور (base URL)" : "Server base URL"} value={fields["tts.baseUrl"]} onChange={(v) => setFields((f) => ({ ...f, "tts.baseUrl": v }))} />
            <Field label={lang === "fa" ? "صدا (Edge voice — خالی = خودکار)" : "Voice (Edge — empty = auto)"} value={fields["tts.voice"]} onChange={(v) => setFields((f) => ({ ...f, "tts.voice": v }))} />
            <Field label={lang === "fa" ? "سرعت پخش (0.5 تا 2)" : "Speed (0.5 to 2)"} value={fields["tts.speed"]} onChange={(v) => setFields((f) => ({ ...f, "tts.speed": v }))} />
            <Field label={lang === "fa" ? "کلید (اختیاری)" : "API key (optional)"} secret value={fields["tts.apiKey"]} onChange={(v) => setFields((f) => ({ ...f, "tts.apiKey": v }))} />
            <div className="col-span-full flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={doTtsTest} disabled={ttsTesting}>
                {ttsTesting ? <Loader2 className="size-3 animate-spin" /> : <Wifi className="size-3" />} {lang === "fa" ? "تست اتصال سرور" : "Test server"}
              </Button>
              {ttsTestResult !== null && (
                <span className={`text-[10px] ${ttsTestResult.ok ? "text-emerald-400" : "text-red-400"}`}>
                  {ttsTestResult.ok ? (lang === "fa" ? `در دسترس ✓ (${ttsTestResult.models ?? 0} صدا)` : `Reachable ✓ (${ttsTestResult.models ?? 0} voices)`) : (ttsTestResult.error ?? String(ttsTestResult.status ?? "error"))}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Send className="size-4 text-cyan-300" /> {lang === "fa" ? "چت مدیریتی — با کدام هوش مصنوعی صحبت کنم؟" : "Admin chat — pick the AI"}</CardTitle>
            <CardDescription>{lang === "fa" ? "بدون محدودیت و بدون هزینه — خودتان انتخاب کنید، همه امکانات در اختیار مدیر است." : "Unlimited and free — you choose, all AI features are open for the admin."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <Select value={adminAiProvider} onValueChange={setAdminAiProvider}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>{AI_PROVIDER_OPTIONS.map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent>
              </Select>
              <Input dir="ltr" placeholder={lang === "fa" ? "مدل (اختیاری)" : "Model (optional)"} value={adminAiModel} onChange={(e) => setAdminAiModel(e.target.value)} className="min-w-32 flex-1" />
            </div>
            <div className="flex gap-1.5">
              <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border/50 text-muted-foreground transition hover:bg-card/60 hover:text-cyan-300" title={lang === "fa" ? "پیوست تصویر (برای هوش مصنوعی‌های دیداری)" : "Attach image (vision AIs)"}>
                <ImagePlus className="size-4" />
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 4 * 1024 * 1024) { toast.error(lang === "fa" ? "حداکثر ۴ مگابایت" : "Max 4MB"); e.target.value = ""; return; } const rd = new FileReader(); rd.onload = () => setAdminAiImg(String(rd.result)); rd.readAsDataURL(f); e.target.value = ""; }} />
              </label>
              {adminAiImg && (
                <div className="flex w-full items-center gap-2 rounded-md border border-cyan-400/25 bg-cyan-400/5 p-1.5">
                  <img src={adminAiImg} alt="attach" className="h-10 w-10 rounded object-cover" />
                  <span className="flex-1 text-[10px] text-muted-foreground">{lang === "fa" ? "تصویر پیوست شد" : "Image attached"}</span>
                  <button type="button" onClick={() => setAdminAiImg(null)} className="rounded p-1 text-muted-foreground transition hover:text-red-300"><X className="size-3.5" /></button>
                </div>
              )}
              <Input dir="ltr" placeholder={lang === "fa" ? "سؤال شما از هوش مصنوعی..." : "Ask the AI..."} value={adminAiQ} onChange={(e) => setAdminAiQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !adminAiPending) doAdminAsk(); }} className="flex-1" />
              <Button className="shrink-0 gap-1.5" disabled={adminAiPending} onClick={doAdminAsk}>{adminAiPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} {lang === "fa" ? "بپرس" : "Ask"}</Button>
            </div>
            <div className="max-h-56 space-y-1.5 overflow-auto">
              {(adminChats ?? []).slice(0, 20).map((c: any) => (
                <div key={c.id} className={`rounded-md border p-2 text-[11px] ${c.status === "error" ? "border-red-400/30 bg-red-400/5" : "border-border/50 bg-background/40"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-300">🐺 WOLF AI</span>
                    {c.status === "running" ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : <span className="text-[9px] text-muted-foreground">{timeAgo(c.created, lang)}</span>}
                  </div>
                  {c.status !== "running" && c.provider ? <div className="mt-0.5 text-[9px] text-cyan-400/70">{lang === "fa" ? "پاسخ از" : "answered by"}: <b>{c.provider}</b></div> : null}
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{c.status === "error" ? (c.error ?? s.misc.none) : c.text || "…"}</p>
                </div>
              ))}
              {(adminChats ?? []).length === 0 && <p className="py-6 text-center text-muted-foreground">{s.misc.none}</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><FlaskConical className="size-4 text-cyan-300" /> {lang === "fa" ? "تحقیق و بازبینی هوش مصنوعی" : "AI research & reviews"}</CardTitle>
            <CardDescription>{lang === "fa" ? "پیشنهاد استراتژی‌های جدید از هوش مصنوعی، بازبینی پوزیشن‌های باز و بررسی یادگیری موتور." : "AI strategy proposals, open-position reviews and engine-learning assessments."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={aiSuggestBusy} onClick={doSuggest}>{aiSuggestBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {lang === "fa" ? "پیشنهاد ۳ استراتژی جدید" : "Propose 3 new strategies"}</Button>
              <span className="text-[10px] leading-relaxed text-muted-foreground">{lang === "fa" ? "هوش مصنوعی بر اساس دانش بازار (لایه اینترنت) ۳ استراتژی جدید پیشنهاد می‌دهد — موتور قطعی هرگز در لحظه تغییر نمی‌کند." : "The AI proposes 3 new strategies from market knowledge (the internet layer) — the deterministic engine is never changed at runtime."}</span>
            </div>
            <div className="max-h-72 space-y-1.5 overflow-auto">
              {(aiUsage?.recent ?? []).filter((r: any) => ["strategy_suggest", "post_entry", "learning_review"].includes(r.kind)).map((r: any) => (
                <div key={r.id} className="rounded-md border border-border/40 bg-background/30 p-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="terminal-font font-bold" dir="ltr">{r.kind} · {r.provider}</span>
                    <span className="text-[9px] text-muted-foreground">{timeAgo(r.created, lang)}</span>
                  </div>
                  <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-muted-foreground">{r.text || r.error || "…"}</p>
                </div>
              ))}
              {(aiUsage?.recent ?? []).filter((r: any) => ["strategy_suggest", "post_entry", "learning_review"].includes(r.kind)).length === 0 && <p className="py-4 text-center text-muted-foreground">{lang === "fa" ? "هنوز گزارشی نیست — بعد از اولین بازبینی پوزیشن یا تحقیق اینجا ظاهر می‌شود." : "No reports yet — appears after the first position review or research."}</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><BookOpen className="size-4 text-cyan-300" /> {lang === "fa" ? "مدیریت آموزش‌ها" : "Education management"}</CardTitle>
            <CardDescription>{lang === "fa" ? "تولید، تأیید/رد درس‌های روزانه و ارسال مستقیم به کانال فارسی یا انگلیسی — هر درس یک دکمه مدیریت دارد." : "Generate, approve/reject daily lessons and post them straight to the Persian or English channel — each lesson has its own management button."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="outline" disabled={eduBusy} onClick={doEduGenerate}>{eduBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {lang === "fa" ? "تولید درس امروز" : "Generate today's lesson"}</Button>
            </div>
            <div className="max-h-72 space-y-1.5 overflow-auto">
              {(eduAll ?? []).filter((x: any) => x.status === "pending" || x.status === "approved").slice(0, 15).map((e: any) => (
                <div key={e._id} className={`rounded-md border p-2 text-[11px] ${e.status === "pending" ? "border-amber-400/30 bg-amber-400/5" : "border-emerald-400/30 bg-emerald-400/5"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-bold">{lang === "fa" ? e.titleFa : e.titleEn}</span>
                    <Badge variant="outline" className={`text-[9px] ${e.status === "approved" ? "text-emerald-300" : "text-amber-300"}`}>{e.status} · {e.source}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-muted-foreground">{lang === "fa" ? e.bodyFa : e.bodyEn}</p>
                  {e.status === "pending" ? (
                    <div className="mt-1.5 flex gap-1.5">
                      <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => doEduReview(e._id, "approved")}>{lang === "fa" ? "تأیید و انتشار" : "Approve & publish"}</Button>
                      <Button size="sm" variant="destructive" className="h-6 px-2 text-[10px]" onClick={() => doEduReview(e._id, "rejected")}>{lang === "fa" ? "رد" : "Reject"}</Button>
                    </div>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" disabled={eduChannelBusy === `${e._id}:fa`} onClick={() => doEduChannelSend(e._id, "fa")}>{eduChannelBusy === `${e._id}:fa` ? <Loader2 className="size-3 animate-spin" /> : <Globe className="size-3" />} {lang === "fa" ? "ارسال به کانال فارسی" : "Post to FA channel"}{e.sentFaAt ? " ✓" : ""}</Button>
                      <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" disabled={eduChannelBusy === `${e._id}:en`} onClick={() => doEduChannelSend(e._id, "en")}>{eduChannelBusy === `${e._id}:en` ? <Loader2 className="size-3 animate-spin" /> : <Globe className="size-3" />} {lang === "fa" ? "ارسال به کانال انگلیسی" : "Post to EN channel"}{e.sentEnAt ? " ✓" : ""}</Button>
                    </div>
                  )}
                </div>
              ))}
              {(eduAll ?? []).length === 0 && <p className="py-6 text-center text-muted-foreground">{s.misc.none}</p>}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="settings" className="space-y-4">
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><KeyRound className="size-4 text-violet-400" /> {lang === "fa" ? "تنظیمات نشست" : "Session settings"}</CardTitle>
            <CardDescription>{lang === "fa" ? "توکن ربات، کانال‌ها، وبهوک و دیتابیس یک‌جا در تب «اتصالات و کلیدها» مدیریت می‌شوند — اینجا دیگر تکرار نشده‌اند." : "Bot token, channels, webhook and database are managed in the single Connections tab — no longer duplicated here."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <Field label={s.sessionHours} value={fields["auth.sessionHours"]} onChange={(v) => setFields((f) => ({ ...f, "auth.sessionHours": v }))} />
          </CardContent>
        </Card>

        <Card className="border-emerald-400/20 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Wallet className="size-4 text-emerald-300" /> {lang === "fa" ? "کارمزدها و تسهیم سود پلتفرم" : "Fees & platform profit share"}</CardTitle>
            <CardDescription>{lang === "fa" ? "کارمزد ترید (taker/maker)، کارمزد انتقال، و درصد سهم پلتفرم از سود کاربر بر اساس سطح VIP — معمولی ۵۰٪، برنزی ۳۰٪، نقره‌ای ۱۵٪، طلایی/پلاتین ۱۰٪؛ همه از اینجا قابل تنظیم‌اند. سود خالص کاربر پس از کسر کارمزدها و سهم پلتفرم محاسبه و در کیف پول نمایش داده می‌شود." : "Trading fees (taker/maker), transfer fee, and the platform share of user profit by VIP tier — normal 50%, bronze 30%, silver 15%, gold/platinum 10%; all configurable here. Net profit is reported after fees and platform share."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={lang === "fa" ? "کارمزد Taker (٪)" : "Taker fee (%)"} value={fields["fees.takerPct"]} onChange={(v) => setFields((f) => ({ ...f, "fees.takerPct": v }))} />
            <Field label={lang === "fa" ? "کارمزد Maker (٪)" : "Maker fee (%)"} value={fields["fees.makerPct"]} onChange={(v) => setFields((f) => ({ ...f, "fees.makerPct": v }))} />
            <Field label={lang === "fa" ? "کارمزد انتقال (٪)" : "Transfer fee (%)"} value={fields["fees.transferPct"]} onChange={(v) => setFields((f) => ({ ...f, "fees.transferPct": v }))} />
            <Field label={lang === "fa" ? "کارمزد ثابت انتقال (USDT)" : "Flat transfer fee (USDT)"} value={fields["fees.transferFlatUsdt"]} onChange={(v) => setFields((f) => ({ ...f, "fees.transferFlatUsdt": v }))} />
            <Field label={lang === "fa" ? "سهم پلتفرم — معمولی (٪)" : "Platform share — normal (%)"} value={fields["fees.platformNormal"]} onChange={(v) => setFields((f) => ({ ...f, "fees.platformNormal": v }))} />
            <Field label={lang === "fa" ? "سهم پلتفرم — برنزی (٪)" : "Platform share — bronze (%)"} value={fields["fees.platformBronze"]} onChange={(v) => setFields((f) => ({ ...f, "fees.platformBronze": v }))} />
            <Field label={lang === "fa" ? "سهم پلتفرم — نقره‌ای (٪)" : "Platform share — silver (%)"} value={fields["fees.platformSilver"]} onChange={(v) => setFields((f) => ({ ...f, "fees.platformSilver": v }))} />
            <Field label={lang === "fa" ? "سهم پلتفرم — طلایی (٪)" : "Platform share — gold (%)"} value={fields["fees.platformGold"]} onChange={(v) => setFields((f) => ({ ...f, "fees.platformGold": v }))} />
            <Field label={lang === "fa" ? "سهم پلتفرم — پلاتین (٪)" : "Platform share — platinum (%)"} value={fields["fees.platformPlatinum"]} onChange={(v) => setFields((f) => ({ ...f, "fees.platformPlatinum": v }))} />
            <div className="col-span-full flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 p-3">
              <p className="text-xs font-bold text-emerald-300">{lang === "fa" ? "اعمال تسهیم سود پلتفرم از سود کاربران" : "Apply platform profit share from user profits"}</p>
              <Switch checked={fields["fees.includePlatformCommission"] !== "false"} onCheckedChange={(v) => setFields((f) => ({ ...f, "fees.includePlatformCommission": String(v) }))} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><RefreshCw className="size-4 text-amber-400" /> {lang === "fa" ? "کرون‌ها و نگهداری" : "Crons & maintenance"}</CardTitle>
            <CardDescription>{lang === "fa" ? "بازه اجرای هر کرون را تنظیم کنید — حداقل ۱ دقیقه. مقدار کمتر = بررسی سریع‌تر ولی مصرف بیشتر (در سرور شخصی با منابع بالا می‌توانید ۱ دقیقه بگذارید؛ در محیط تستی آزادانه کم کنید). تاریخچه‌های غیرضروری طبق همین تنظیمات پاک می‌شوند." : "Tune each cron cadence — 1 minute minimum. Lower = faster checks but more usage (on your own high-resource server go to 1 minute; in this test sandbox keep it relaxed). Unneeded history is pruned by these same settings."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {([
                ["engine.loopSeconds", lang === "fa" ? "حلقه اسکن موتور (ثانیه)" : "Engine loop (sec)"],
                ["markets.priceSeconds", lang === "fa" ? "قیمت لحظهای (ثانیه)" : "Live prices (sec)"],
                ["markets.candleSeconds", lang === "fa" ? "فید کندل (ثانیه)" : "Candle feed (sec)"],
                ["engine.scanIntervalMinutes", lang === "fa" ? "اسکن موتور (دقیقه — واتچداگ)" : "Engine scan (min — watchdog)"],
                ["markets.syncMinutes", lang === "fa" ? "سینک فید کندل (دقیقه)" : "Candle feed sync (min)"],
                ["markets.pricesMinutes", lang === "fa" ? "قیمت‌های لحظه‌ای (دقیقه)" : "Live prices (min)"],
                ["ai.rotationMinutes", lang === "fa" ? "سلامت هوش مصنوعی (دقیقه)" : "AI health probe (min)"],
                ["chat.purgeHours", lang === "fa" ? "پاکسازی تاریخچه چت (ساعت)" : "Chat purge (hours)"],
                ["ai.learningReviewHours", lang === "fa" ? "بررسی یادگیری موتور (ساعت)" : "Learning review (hours)"],
                ["learning.educationHourUTC", lang === "fa" ? "ساعت تولید درس (UTC)" : "Lesson generation hour (UTC)"],
                ["data.pruneHours", lang === "fa" ? "نگهداری داده (ساعت)" : "Data maintenance (hours)"],
              ] as Array<[string, string]>).map(([k, label]) => (
                <div key={k} className="flex items-end gap-1.5">
                  <Field label={label} value={fields[k]} onChange={(v) => setFields((f) => ({ ...f, [k]: v }))} />
                  <Button size="sm" variant="outline" className="h-9 shrink-0 px-2 text-[10px]" title={lang === "fa" ? "بازنشانی به پیش‌فرض" : "Reset to default"} onClick={() => { setFields((f) => ({ ...f, [k]: String(DEFAULT_CRON[k as string] ?? "") })); }}><RefreshCw className="size-3" /></Button>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">{lang === "fa" ? "پس از تغییر، دکمه ذخیره را بزنید. کرون‌ها هر دقیقه چک می‌شوند و اگر بازه‌شان نرسیده باشد رد می‌شوند — در محیط تستی بازه‌ها را بزرگ بگذارید تا سهمیه پر نشود." : "Click Save after changing. Crons check every minute and skip when their interval has not elapsed — keep intervals large in the test sandbox to stay within quota."}</p>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card/60 px-4 py-3">
          <span className="text-sm text-muted-foreground">{s.tabSettings}</span>
          <Button onClick={doSaveSettings}>{s.save}</Button>
        </div>
      </TabsContent>

      <TabsContent value="connections" className="space-y-4">
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Bot className="size-4 text-emerald-400" /> {lang === "fa" ? "اتصال ربات تلگرام" : "Telegram bot connection"}</CardTitle>
            <CardDescription>{lang === "fa" ? "همه‌ی مقادیر این تب به‌صورت رمزنگاری‌شده (AES-256) ذخیره و فقط mask نمایش داده می‌شوند." : "All values in this tab are stored encrypted (AES-256) and only shown masked."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={lang === "fa" ? "توکن ربات (Bot Token)" : "Bot token"} secret value={fields["telegram.token"]} onChange={(v) => setFields((f) => ({ ...f, "telegram.token": v }))} />
            <Field label={lang === "fa" ? "یوزرنیم ربات" : "Bot username"} value={fields["telegram.username"]} onChange={(v) => setFields((f) => ({ ...f, "telegram.username": v }))} />
            <Field label={lang === "fa" ? "آیدی عددی مدیر" : "Admin numeric ID"} value={fields["telegram.adminId"]} onChange={(v) => setFields((f) => ({ ...f, "telegram.adminId": v }))} />
            <Field label={lang === "fa" ? "آیدی عددی دستیار" : "Assistant numeric ID"} value={fields["telegram.assistantId"]} onChange={(v) => setFields((f) => ({ ...f, "telegram.assistantId": v }))} />
            <Field label={lang === "fa" ? "آدرس وبهوک" : "Webhook URL"} value={fields["telegram.webhookUrl"]} onChange={(v) => setFields((f) => ({ ...f, "telegram.webhookUrl": v }))} />
            <Field label={lang === "fa" ? "سکرت وبهوک" : "Webhook secret"} secret value={fields["telegram.webhookSecret"]} onChange={(v) => setFields((f) => ({ ...f, "telegram.webhookSecret": v }))} />
            <Field label={lang === "fa" ? "لینک Mini App (دامنه)" : "Mini App URL (domain)"} value={fields["telegram.miniAppUrl"]} onChange={(v) => setFields((f) => ({ ...f, "telegram.miniAppUrl": v }))} />
            <div className="col-span-full rounded-md border border-border/50 bg-background/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
              <p className="font-bold text-foreground">{lang === "fa" ? "وبهوک چیست و کجا بود؟" : "What is the webhook & where is it?"}</p>
              <p>{lang === "fa" ? "آدرس وبهوک همان آدرسی است که تلگرام رویدادهای ربات (مثل /start) را به آن می‌فرستد. آدرس این دپلوی: " : "The webhook URL is where Telegram delivers bot updates (like /start). This deployment URL: "}<span dir="ltr" className="terminal-font">{String(fields["telegram.webhookUrl"] ?? "").trim() || effectiveWebhookUrl || "—"}</span></p>
              <p className="mt-1">{lang === "fa" ? "سکرت وبهوک یک رمز محرمانه است که تلگرام در هدر x-telegram-bot-api-secret-token می‌فرستد و سرور چک می‌کند؛ فقط درخواست‌های تلگرام پذیرفته می‌شوند." : "The webhook secret is a token Telegram sends in the x-telegram-bot-api-secret-token header; the server verifies it so only Telegram requests are accepted."}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" onClick={() => {
                const mini = String(fields["telegram.miniAppUrl"] ?? "").trim();
                const next = (mini && mini.startsWith("https://")) ? `${mini.replace(/\/+$/, "")}/telegram/webhook` : effectiveWebhookUrl;
                if (next) { setFields((f) => ({ ...f, "telegram.webhookUrl": next })); toast.success(lang === "fa" ? "آدرس فعلی در کادر وبهوک قرار گرفت — ذخیره کنید" : "Current URL filled in — save it"); }
              }}><Globe className="size-3" /> {lang === "fa" ? "استفاده از آدرس فعلی دپلوی" : "Use current deployment URL"}</Button>
                <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px]" onClick={doTgWebhook} disabled={tgBusy === "hook"}>{tgBusy === "hook" ? <Loader2 className="size-3 animate-spin" /> : <Radio className="size-3" />} {lang === "fa" ? "انجام وبهوک" : "Run webhook"}</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Send className="size-4 text-sky-400" /> {lang === "fa" ? "کانال‌ها (فارسی و انگلیسی)" : "Channels (FA & EN)"}</CardTitle>
            <CardDescription>{lang === "fa" ? "اعلان‌ها و کارت‌های معاملات به هر دو کانال ارسال می‌شوند." : "Notifications and trade cards are posted to both channels."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={lang === "fa" ? "شناسه کانال فارسی" : "FA channel ID"} value={fields["channel.id"]} onChange={(v) => setFields((f) => ({ ...f, "channel.id": v }))} />
            <Field label={lang === "fa" ? "یوزرنیم کانال فارسی" : "FA channel username"} value={fields["channel.username"]} onChange={(v) => setFields((f) => ({ ...f, "channel.username": v }))} />
            <Field label={lang === "fa" ? "لینک دعوت کانال فارسی" : "FA channel invite"} value={fields["channel.inviteLink"]} onChange={(v) => setFields((f) => ({ ...f, "channel.inviteLink": v }))} />
            <Field label={lang === "fa" ? "شناسه کانال انگلیسی" : "EN channel ID"} value={fields["channel.enId"]} onChange={(v) => setFields((f) => ({ ...f, "channel.enId": v }))} />
            <Field label={lang === "fa" ? "یوزرنیم کانال انگلیسی" : "EN channel username"} value={fields["channel.enUsername"]} onChange={(v) => setFields((f) => ({ ...f, "channel.enUsername": v }))} />
            <Field label={lang === "fa" ? "لینک دعوت کانال انگلیسی" : "EN channel invite"} value={fields["channel.enInviteLink"]} onChange={(v) => setFields((f) => ({ ...f, "channel.enInviteLink": v }))} />
            <div className="col-span-full mt-1 rounded-md border border-border/50 bg-background/40 p-2">
              <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">{lang === "fa" ? "ارسال پیام به کانال تلگرام" : "Send a message to the Telegram channel"}</p>
              <div className="flex gap-1.5">
                <Input dir="ltr" value={channelMsg} onChange={(e) => setChannelMsg(e.target.value)} placeholder={lang === "fa" ? "متن پیام…" : "Message text…"} />
                <Button size="sm" className="shrink-0" disabled={!String(settings?.["channel.id"] ?? "").trim()} onClick={() => { const t = channelMsg.trim(); if (!t) return; const ids = [String(settings?.["channel.id"] ?? ""), String(settings?.["channel.enId"] ?? "")].filter(Boolean); Promise.all(ids.map((chatId) => adminSendChatM({ token, chatId, text: t }).catch(() => undefined))).then(() => { toast.success(s.saved); setChannelMsg(""); }); }}>{s.submit}</Button>
              </div>
              {!String(settings?.["channel.id"] ?? "").trim() && <p className="mt-1 text-[10px] text-amber-300">{lang === "fa" ? "ابتدا شناسه کانال را در بالا وارد و ذخیره کنید." : "Enter and save the channel ID above first."}</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Database className="size-4 text-amber-400" /> {lang === "fa" ? "دیتابیس و سرور" : "Database & server"}</CardTitle>
            <CardDescription>{lang === "fa" ? "رمز دیتابیس به‌صورت رمزنگاری‌شده ذخیره می‌شود." : "The database password is stored encrypted."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="col-span-full rounded-md border border-amber-400/25 bg-amber-400/5 p-2.5 text-[11px]">
              <p className="mb-1 flex items-center gap-1.5 font-bold text-amber-300"><Radio className="size-3" /> {lang === "fa" ? "اتصال فعلی (در حال اجرا)" : "Current live connection"}</p>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
                <p className="flex justify-between gap-2 border-b border-border/40 pb-0.5"><span className="text-muted-foreground">Host</span><span className="terminal-font font-bold" dir="ltr">{dbLive.host || "—"}</span></p>
                <p className="flex justify-between gap-2 border-b border-border/40 pb-0.5"><span className="text-muted-foreground">Port</span><span className="terminal-font font-bold" dir="ltr">{dbLive.port || "—"}</span></p>
                <p className="flex justify-between gap-2 border-b border-border/40 pb-0.5"><span className="text-muted-foreground">{lang === "fa" ? "نام دیتابیس" : "Name"}</span><span className="terminal-font font-bold" dir="ltr">{dbLive.name || "—"}</span></p>
                <p className="flex justify-between gap-2 border-b border-border/40 pb-0.5"><span className="text-muted-foreground">{lang === "fa" ? "کاربر" : "User"}</span><span className="terminal-font font-bold" dir="ltr">{dbLive.user || "—"}</span></p>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">{lang === "fa" ? "این مقادیر به‌صورت زنده از آدرس کانوکس در حال اجرا خوانده می‌شوند و با تغییر دپلوی خودکار به‌روز می‌شوند. کادرهای زیر برای دیتابیس سرور مستقل (PostgreSQL) هستند و هر تغییری در آن‌ها بدون مشکل در کد اعمال می‌شود." : "Read live from the running Convex URL — updates automatically with the deployment. The fields below configure the standalone (PostgreSQL) server database; changes apply cleanly."}</p>
            </div>
            <Field label={lang === "fa" ? "آدرس دیتابیس (Host)" : "Database host"} placeholder="localhost" value={fields["db.host"] && fields["db.host"] !== "localhost" ? fields["db.host"] : ""} onChange={(v) => setFields((f) => ({ ...f, "db.host": v }))} />
            <Field label={lang === "fa" ? "پورت" : "Port"} placeholder="5432" value={fields["db.port"] && fields["db.port"] !== "5432" ? fields["db.port"] : ""} onChange={(v) => setFields((f) => ({ ...f, "db.port": v }))} />
            <Field label={lang === "fa" ? "نام دیتابیس" : "Database name"} placeholder="wolf_trading" value={fields["db.name"] && fields["db.name"] !== "wolf_trading" ? fields["db.name"] : ""} onChange={(v) => setFields((f) => ({ ...f, "db.name": v }))} />
            <Field label={lang === "fa" ? "نام کاربری دیتابیس" : "Database user"} placeholder="wolf" value={fields["db.user"] && fields["db.user"] !== "wolf" ? fields["db.user"] : ""} onChange={(v) => setFields((f) => ({ ...f, "db.user": v }))} />
            <Field label={lang === "fa" ? "رمز دیتابیس" : "Database password"} secret value={fields["db.password"]} onChange={(v) => setFields((f) => ({ ...f, "db.password": v }))} />
            <Field label={lang === "fa" ? "دامنه سایت" : "Site domain"} value={fields["system.domain"]} onChange={(v) => setFields((f) => ({ ...f, "system.domain": v }))} />
            <Field label={lang === "fa" ? "آی‌پی سرور" : "Server IP"} value={fields["system.serverIp"]} onChange={(v) => setFields((f) => ({ ...f, "system.serverIp": v }))} />
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Wrench className="size-4 text-violet-400" /> {lang === "fa" ? "تست و راه‌اندازی" : "Test & setup"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" disabled={tgBusy === "bot"} onClick={doTgTestBot}>{tgBusy === "bot" ? <Loader2 className="size-3.5 animate-spin" /> : <Wifi className="size-3.5" />} {lang === "fa" ? "تست اتصال ربات" : "Test bot"}</Button>
              <Button size="sm" variant="outline" disabled={tgBusy === "channels"} onClick={doTgTestChannels}>{tgBusy === "channels" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} {lang === "fa" ? "تست ارسال به کانال‌ها" : "Test channels"}</Button>
              <Button size="sm" variant="outline" disabled={tgBusy === "hook"} onClick={doTgWebhook}>{tgBusy === "hook" ? <Loader2 className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />} {lang === "fa" ? "اتصال وبهوک" : "Connect webhook"}</Button>
              <Button size="sm" variant="outline" disabled={tgInfoBusy} onClick={doTgInfo}>{tgInfoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Radio className="size-3.5" />} {lang === "fa" ? "وضعیت وبهوک" : "Webhook status"}</Button>
              <Button size="sm" variant="outline" disabled={!String(fields["telegram.username"] ?? "").trim()} onClick={() => window.open(`https://t.me/${String(fields["telegram.username"] ?? "").trim()}`, "_blank")}><ExternalLink className="size-3.5" /> {lang === "fa" ? "باز کردن ربات (تست ورود)" : "Open bot (test login)"}</Button>
            </div>
            {tgTest ? (
              <div className={`rounded-md border p-2.5 text-[11px] ${tgTest?.ok ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-300" : "border-red-400/30 bg-red-400/5 text-red-300"}`}>
                {tgTest?.ok
                  ? (lang === "fa"
                      ? `ربات @${tgTest?.bot?.username} متصل است ✓ — پیام تست به مدیر ${
                          tgTest?.adminSent?.ok
                            ? "ارسال شد ✓"
                            : tgTest?.adminSent?.reason === "user_must_start_bot"
                              ? "ناموفق — ابتدا در ربات دکمه Start را بزنید (ربات فقط بعد از /start می‌تواند پیام بفرستد)"
                              : tgTest?.adminSent?.adminIdPresent
                                ? `ناموفق — خطای تلگرام: ${tgTest?.adminSent?.reason ?? "نامشخص"}`
                                : "ناموفق — آیدی عددی مدیر (telegram.adminId) را وارد و ذخیره کنید"
                        }`
                      : `Bot @${tgTest?.bot?.username} connected ✓ — test message ${
                          tgTest?.adminSent?.ok
                            ? "sent ✓"
                            : tgTest?.adminSent?.reason === "user_must_start_bot"
                              ? "failed — press Start in the bot first (the bot can only message you after /start)"
                              : tgTest?.adminSent?.adminIdPresent
                                ? `failed — Telegram error: ${tgTest?.adminSent?.reason ?? "unknown"}`
                                : "not sent — fill & save the admin numeric ID (telegram.adminId) above"
                        }`)
                  : String(tgTest?.error ?? "")}
              </div>
            ) : null}
            {tgChan ? (
              <div className="space-y-1">
                {(tgChan?.results ?? []).map((r: any, i: number) => (
                  <p key={i} className={`rounded-md border p-2 text-[11px] ${r?.ok ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-300" : "border-red-400/30 bg-red-400/5 text-red-300"}`}>
                    {r?.chatId}: {r?.ok ? "✓" : String(r?.reason ?? "")}
                  </p>
                ))}
                {!tgChan?.ok && !tgChan?.results?.length && <p className="text-[11px] text-amber-300">{String(tgChan?.error ?? "")}</p>}
              </div>
            ) : null}
            {tgHook ? (
              <p className={`rounded-md border p-2 text-[11px] ${tgHook?.ok ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-300" : "border-red-400/30 bg-red-400/5 text-red-300"}`}>
                {tgHook?.ok ? `${lang === "fa" ? "وبهوک متصل شد" : "Webhook connected"}: ${tgHook?.webhookUrl}` : String(tgHook?.error ?? "")}
              </p>
            ) : null}
            {tgInfo ? (
              <div className={`rounded-md border p-2 text-[11px] leading-relaxed ${tgInfo?.ok ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-300" : "border-red-400/30 bg-red-400/5 text-red-300"}`}>
                {tgInfo?.ok ? (
                  <>
                    <p>{lang === "fa" ? "آدرس وبهوک" : "Webhook URL"}: <span dir="ltr" className="terminal-font">{tgInfo?.url || "—"}</span></p>
                    <p>{lang === "fa" ? "بهروزرسانیهای در انتظار" : "Pending updates"}: {tgInfo?.pendingUpdateCount ?? 0}</p>
                    {tgInfo?.lastError ? <p className="text-amber-300">{lang === "fa" ? "آخرین خطا" : "Last error"}: {tgInfo?.lastError}</p> : <p>✓ {lang === "fa" ? "بدون خطای اخیر" : "No recent errors"}</p>}
                  </>
                ) : String(tgInfo?.error ?? "")}
              </div>
            ) : null}
            <p className="rounded-md border border-border/50 bg-background/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {lang === "fa" ? "برای ورود با تلگرام: ۱) توکن ربات را وارد و ذخیره کنید ۲) روی «اتصال وبهوک» بزنید ۳) روی «باز کردن ربات» بزنید و در ربات /start را بفرستید — دکمه شیشه‌ای Mini App وارد پنل می‌کند." : "To log in with Telegram: 1) enter & save the bot token 2) click Connect webhook 3) open the bot and send /start — the glass Mini App button opens the panel."}
            </p>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card/60 px-4 py-3">
          <span className="text-sm text-muted-foreground">{lang === "fa" ? "اتصالات و کلیدها" : "Connections & keys"}</span>
          <Button onClick={doSaveSettings}>{s.save}</Button>
        </div>

        <div className="rounded-lg border border-red-400/30 bg-red-400/5 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-red-300"><AlertTriangle className="size-4" /> {lang === "fa" ? "بازنشانی داده‌ها (غیرقابل بازگشت)" : "Reset data (irreversible)"}</div>
          <p className="mb-2 text-[11px] text-muted-foreground">{lang === "fa" ? "معاملات و تاریخچه پاک می‌شود؛ سرمایه موتور به مقدار پایه برمی‌گردد." : "Deletes trades and history; engine capital returns to base."}</p>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="gap-1.5 text-amber-300" onClick={() => { if (!window.confirm(lang === "fa" ? "تاریخچه (لاگ موتور، حسابرسی، یادگیری) پاک شود؟ این عملیات غیرقابل بازگشت است." : "Clear history (engine logs, audit, learning)? This cannot be undone.")) return; resetData({ token, scope: "logs" }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message ?? e))); }}><Trash2 className="size-3.5" /> {lang === "fa" ? "پاک‌سازی تاریخچه" : "Clear history"}</Button>
            <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => { if (!window.confirm(lang === "fa" ? "همه معاملات (پوزیشن‌های باز/بسته، سیگنال‌ها، آمار) و تاریخچه پاک شود؟ غیرقابل بازگشت است." : "Delete ALL trades (open/closed positions, signals, stats) and history? This cannot be undone.")) return; resetData({ token, scope: "all" }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message ?? e))); }}><Trash2 className="size-3.5" /> {lang === "fa" ? "بازنشانی کامل (معاملات + تاریخچه)" : "Reset trades and history"}</Button>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="swapwallet" className="space-y-4">
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Wallet className="size-4 text-emerald-400" /> {lang === "fa" ? "سواپ‌ولت — کیف پول و بازار OTC" : "SwapWallet — wallet & OTC market"}</CardTitle>
            <CardDescription>{lang === "fa" ? "اتصال، کلید API، سواپ سریع، قیمت قفل‌شده OTC و برداشت — همه از همین پنل. کلید به‌صورت رمزنگاری‌شده ذخیره می‌شود." : "Connection, API key, instant swaps, locked OTC quotes and withdrawals — all from this panel. The key is stored encrypted."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="h-8 gap-1.5" disabled={swapwalletBusy} onClick={loadSwapwallet}>
                {swapwalletBusy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} {lang === "fa" ? "بروزرسانی" : "Refresh"}
              </Button>
              <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${swapwallet?.configured ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300"}`}>
                <ShieldCheck className="size-3" /> {swapwallet ? (swapwallet.configured ? (lang === "fa" ? "کلید متصل" : "Key connected") : (lang === "fa" ? "کلید تنظیم نشده" : "Key not set")) : "—"}
              </span>
              {swapwallet?.keyMasked && <span className="terminal-font text-[10px] text-muted-foreground" dir="ltr">{swapwallet.keyMasked}</span>}
              {swapwallet && <span className="text-[10px] text-muted-foreground">{lang === "fa" ? "به‌روزرسانی:" : "fetched:"} {new Date(swapwallet.fetchedAt).toLocaleTimeString(lang === "fa" ? "fa-IR" : "en-US")}</span>}
            </div>

            {/* Config: on/off + API key entry */}
            <div className="grid gap-2 rounded-md border border-border/50 bg-background/40 p-2.5 lg:grid-cols-2">
              <div className="flex items-center justify-between gap-2 rounded border border-border/40 bg-card/40 px-3 py-2">
                <span className="text-[11px] font-bold text-muted-foreground">{lang === "fa" ? "استفاده از فید قیمت سواپ‌ولت" : "SwapWallet price feed"}</span>
                <Switch
                  checked={settings?.["wallet.swapwalletEnabled"] !== false}
                  onCheckedChange={(v) => { saveSettings({ token, settings: { "wallet.swapwalletEnabled": v } }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message))); }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  dir="ltr"
                  className="h-8 flex-1 font-mono text-[11px]"
                  placeholder={lang === "fa" ? "کلید API جدید (apikey-...)" : "New API key (apikey-...)"}
                  value={swKey}
                  onChange={(e) => setSwKey(e.target.value)}
                />
                <Button size="sm" className="h-8" disabled={swSaveKeyBusy} onClick={doSaveSwapwalletKey}>
                  {swSaveKeyBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} {lang === "fa" ? "ذخیره کلید" : "Save key"}
                </Button>
              </div>
            </div>

            {/* Swap: fast-swap + OTC quote/execute */}
            <div className="grid gap-2 lg:grid-cols-2">
              <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-muted-foreground"><Repeat className="size-3" /> {lang === "fa" ? "سواپ سریع" : "Fast swap"}</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <Select value={swSrc} onValueChange={setSwSrc}>
                    <SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="USDT">USDT</SelectItem><SelectItem value="TON">TON</SelectItem><SelectItem value="TRX">TRX</SelectItem><SelectItem value="ETH">ETH</SelectItem><SelectItem value="BNB">BNB</SelectItem></SelectContent>
                  </Select>
                  <Select value={swDst} onValueChange={setSwDst}>
                    <SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="USDT">USDT</SelectItem><SelectItem value="TON">TON</SelectItem><SelectItem value="TRX">TRX</SelectItem><SelectItem value="ETH">ETH</SelectItem><SelectItem value="BNB">BNB</SelectItem></SelectContent>
                  </Select>
                  <Input dir="ltr" className="h-8 font-mono text-[11px]" placeholder={lang === "fa" ? "مبلغ مبدأ" : "Source amount"} value={swAmt} onChange={(e) => setSwAmt(e.target.value)} />
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-8 flex-1" disabled={swSwapBusy} onClick={doSwFastSwap}>
                      {swSwapBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />} {lang === "fa" ? "سواپ" : "Swap"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 flex-1 gap-1" disabled={swQuoteBusy} onClick={doSwOtcQuote}>
                      {swQuoteBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3" />} {lang === "fa" ? "قیمت OTC" : "OTC price"}
                    </Button>
                  </div>
                </div>
                {swQuote && (
                  <div className="mt-2 rounded border border-amber-400/30 bg-amber-400/5 p-2 text-[11px]">
                    <p className="font-bold text-amber-300">{lang === "fa" ? "قیمت قفل‌شده (۱۰ ثانیه اعتبار)" : "Locked quote (valid 10s)"}</p>
                    <p className="mt-1" dir="ltr">{swQuote.amt} {swQuote.src} → {Number(swQuote.destination?.number ?? 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} {swQuote.dst}</p>
                    <p className="text-muted-foreground" dir="ltr">rate: {Number(swQuote.marketRate ?? 0).toLocaleString("en-US", { maximumFractionDigits: 8 })}</p>
                    <Button size="sm" className="mt-1.5 h-7 gap-1 text-[11px]" disabled={swExecBusy} onClick={doSwOtcExecute}>
                      {swExecBusy ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />} {lang === "fa" ? "تأیید و اجرا" : "Confirm & execute"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-muted-foreground"><ArrowDownToLine className="size-3" /> {lang === "fa" ? "برداشت کریپتو" : "Crypto withdrawal"}</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <Select value={swWdToken} onValueChange={(v) => { setSwWdToken(v); setSwWdCfg(null); }}>
                    <SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="USDT">USDT</SelectItem><SelectItem value="TON">TON</SelectItem><SelectItem value="TRX">TRX</SelectItem><SelectItem value="ETH">ETH</SelectItem><SelectItem value="BNB">BNB</SelectItem></SelectContent>
                  </Select>
                  <Input dir="ltr" className="h-8 font-mono text-[11px]" placeholder={lang === "fa" ? "مبلغ" : "Amount"} value={swWdAmt} onChange={(e) => setSwWdAmt(e.target.value)} />
                  <Input dir="ltr" className="h-8 font-mono text-[11px]" placeholder={lang === "fa" ? "شبکه (مثل TRON)" : "Network (e.g. TRON)"} value={swWdNet} onChange={(e) => setSwWdNet(e.target.value)} />
                  <Input dir="ltr" className="h-8 font-mono text-[11px]" placeholder={lang === "fa" ? "آدرس مقصد" : "Destination address"} value={swWdAddr} onChange={(e) => setSwWdAddr(e.target.value)} />
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" disabled={swWdBusy} onClick={doSwWdConfig}>
                    {swWdBusy ? <Loader2 className="size-3 animate-spin" /> : <Settings2 className="size-3" />} {lang === "fa" ? "تنظیمات شبکه" : "Network config"}
                  </Button>
                  <Input dir="ltr" className="h-8 flex-1 font-mono text-[11px]" placeholder={lang === "fa" ? "Memo (اختیاری)" : "Memo (optional)"} value={swWdMemo} onChange={(e) => setSwWdMemo(e.target.value)} />
                  <Button size="sm" className="h-8 gap-1 text-[11px]" disabled={swWdBusy} onClick={doSwWithdraw}>
                    {swWdBusy ? <Loader2 className="size-3 animate-spin" /> : <ArrowDownToLine className="size-3" />} {lang === "fa" ? "برداشت" : "Withdraw"}
                  </Button>
                </div>
                {swWdCfg && (
                  <pre className="terminal-font mt-1.5 max-h-24 overflow-auto rounded bg-muted/40 p-1.5 text-[9px] text-muted-foreground" dir="ltr">{JSON.stringify(swWdCfg, null, 1).slice(0, 800)}</pre>
                )}
              </div>
            </div>

            {swapwallet?.balancesError && <p className="text-[11px] text-red-300">{lang === "fa" ? "خطا در دریافت موجودی:" : "Balance error:"} {swapwallet.balancesError}</p>}
            {swapwallet?.transactionsError && <p className="text-[11px] text-red-300">{lang === "fa" ? "خطا در دریافت تراکنش‌ها:" : "Transactions error:"} {swapwallet.transactionsError}</p>}
            {swapwallet && (
              <div className="grid gap-2 lg:grid-cols-2">
                <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                  <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-muted-foreground"><Wallet className="size-3" /> {lang === "fa" ? "موجودی" : "Balances"}</p>
                  <div className="space-y-1">
                    {(swapwallet.balances ?? []).map((b: any) => (
                      <div key={b.token} className="flex items-center justify-between rounded border-b border-border/40 pb-1 text-[11px]">
                        <span className="font-bold">{b.token}</span>
                        <span className="terminal-font tabular-nums" dir="ltr">{Number(b.amount?.number ?? 0).toLocaleString("en-US", { maximumFractionDigits: 6 })} {b.amount?.unit ?? ""}</span>
                      </div>
                    ))}
                    {(swapwallet.balances ?? []).length === 0 && <p className="text-[10px] text-muted-foreground">—</p>}
                  </div>
                </div>
                <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                  <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-muted-foreground"><Zap className="size-3" /> {lang === "fa" ? `قیمت‌های OTC (${swapwallet.priceCount})` : `OTC prices (${swapwallet.priceCount})`}</p>
                  <div className="space-y-1">
                    {(swapwallet.prices ?? []).slice(0, 12).map((r: any) => (
                      <div key={r.pair} className="flex items-center justify-between rounded border-b border-border/40 pb-1 text-[11px]">
                        <span className="font-bold" dir="ltr">{r.pair}</span>
                        <span className="terminal-font tabular-nums" dir="ltr">{r.price.toLocaleString("en-US", { maximumFractionDigits: 8 })}</span>
                      </div>
                    ))}
                    {(swapwallet.prices ?? []).length === 0 && <p className="text-[10px] text-muted-foreground">—</p>}
                  </div>
                </div>
              </div>
            )}
            {swapwallet && (swapwallet.transactions?.length > 0 || swapwallet.transactionsError) && (
              <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
                <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-muted-foreground"><Layers className="size-3" /> {lang === "fa" ? "آخرین تراکنش‌ها" : "Recent transactions"}</p>
                <div className="space-y-1">
                  {(swapwallet.transactions ?? []).slice(0, 12).map((t: any) => {
                    const detail = t.transfer ?? t.trade ?? t.cryptoDeposit ?? t.cryptoWithdraw ?? t.fiatDeposit ?? t.fiatWithdraw ?? t.payment ?? t.credit ?? null;
                    const amt = detail?.amount ?? detail?.sourceAmount ?? null;
                    return (
                      <div key={t.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded border-b border-border/40 pb-1 text-[11px]">
                        <span className="flex items-center gap-1.5">
                          <span className="rounded bg-muted px-1.5 py-0.5 font-bold text-[10px]" dir="ltr">{t.type}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${t.status === "SUCCEED" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{t.status}</span>
                          {t.network && <span className="text-muted-foreground">{t.network}</span>}
                        </span>
                        <span className="flex items-center gap-2">
                          {amt && <span className="terminal-font tabular-nums" dir="ltr">{Number(amt.number ?? 0).toLocaleString("en-US", { maximumFractionDigits: 6 })} {amt.unit ?? ""}</span>}
                          <span className="text-muted-foreground">{new Date(t.timestamp).toLocaleString(lang === "fa" ? "fa-IR" : "en-US", { dateStyle: "short", timeStyle: "short" })}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card></TabsContent>

      <TabsContent value="monitor" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{lang === "fa" ? "مانیتورینگ سرور — وضعیت لحظه‌ای سرور، دیتابیس و سرویس‌ها" : "Server monitor — live server, database and service status"}</span>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={doMonitor} disabled={monBusy}><RefreshCw className={`size-3.5 ${monBusy ? "animate-spin" : ""}`} /> {lang === "fa" ? "بروزرسانی" : "Refresh"}</Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/70 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm"><Radio className="size-4 text-emerald-400" /> {lang === "fa" ? "رانتایم سرور" : "Server runtime"}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1.5 text-xs sm:grid-cols-2">
              <p className="flex justify-between border-b border-border/40 pb-1"><span className="text-muted-foreground">Node</span><span className="terminal-font font-bold" dir="ltr">{mon?.runtime?.node ?? "—"}</span></p>
              <p className="flex justify-between border-b border-border/40 pb-1"><span className="text-muted-foreground">Platform</span><span className="terminal-font font-bold" dir="ltr">{mon?.runtime?.platform ?? "—"} / {mon?.runtime?.arch ?? "—"}</span></p>
              <p className="flex justify-between border-b border-border/40 pb-1"><span className="text-muted-foreground">{lang === "fa" ? "آپتایم" : "Uptime"}</span><span className="terminal-font font-bold" dir="ltr">{mon?.runtime?.uptimeSec ? fmtUp(mon.runtime.uptimeSec) : "—"}</span></p>
              <p className="flex justify-between border-b border-border/40 pb-1"><span className="text-muted-foreground">PID</span><span className="terminal-font font-bold" dir="ltr">{mon?.runtime?.pid ?? "—"}</span></p>
              <p className="flex justify-between border-b border-border/40 pb-1"><span className="text-muted-foreground">RAM (RSS)</span><span className="terminal-font font-bold" dir="ltr">{mon?.runtime?.memory?.rss ?? "—"}</span></p>
              <p className="flex justify-between border-b border-border/40 pb-1"><span className="text-muted-foreground">Heap (used/total)</span><span className="terminal-font font-bold" dir="ltr">{mon?.runtime?.memory?.heapUsed ?? "—"} / {mon?.runtime?.memory?.heapTotal ?? "—"}</span></p>
              <p className="flex justify-between border-b border-border/40 pb-1"><span className="text-muted-foreground">CPU user/sys</span><span className="terminal-font font-bold" dir="ltr">{mon?.runtime?.cpu?.userSec ?? "—"}s / {mon?.runtime?.cpu?.systemSec ?? "—"}s</span></p>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm"><ShieldCheck className="size-4 text-cyan-400" /> {lang === "fa" ? "دپلوی و سلامت سرویس‌ها" : "Deployment & service health"}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1.5 text-xs sm:grid-cols-2">
              <p className="flex justify-between gap-2 border-b border-border/40 pb-1"><span className="text-muted-foreground">Convex URL</span><span className="terminal-font max-w-[60%] truncate font-bold" dir="ltr">{mon?.deployment?.convexUrl || "—"}</span></p>
              <p className="flex justify-between gap-2 border-b border-border/40 pb-1"><span className="text-muted-foreground">{lang === "fa" ? "دامنه سایت" : "Site URL"}</span><span className="terminal-font max-w-[60%] truncate font-bold" dir="ltr">{mon?.deployment?.siteUrl || "—"}</span></p>
              <p className="flex justify-between border-b border-border/40 pb-1"><span className="text-muted-foreground">IP {lang === "fa" ? "سرور" : "server"}</span><span className="terminal-font font-bold" dir="ltr">{mon?.deployment?.serverIp || "—"}</span></p>
              <p className="flex justify-between border-b border-border/40 pb-1"><span className="text-muted-foreground">{lang === "fa" ? "نسخه" : "Version"}</span><span className="terminal-font font-bold" dir="ltr">{mon?.deployment?.version ?? "—"}</span></p>
              <p className="flex justify-between border-b border-border/40 pb-1"><span className="text-muted-foreground">{lang === "fa" ? "حالت موتور" : "Engine mode"}</span><span className="terminal-font font-bold" dir="ltr">{String(mon?.deployment?.mode ?? "—")} · {String(mon?.deployment?.tradeType ?? "—")}</span></p>
              <p className="flex justify-between border-b border-border/40 pb-1"><span className="text-muted-foreground">{lang === "fa" ? "آخرین اسکن" : "Last scan"}</span><span className="terminal-font font-bold" dir="ltr">{mon?.deployment?.lastScanAt ? timeAgo(mon.deployment.lastScanAt, lang) : "—"}</span></p>
              <div className="col-span-full mt-1 flex flex-wrap gap-1.5">
                {[["Telegram", mon?.deployment?.health?.tg], ["Channel", mon?.deployment?.health?.channel], ["AI", mon?.deployment?.health?.ai], ["Exchange", mon?.deployment?.health?.exchange]].map(([label, val]) => (
                  <Badge key={String(label)} variant="outline" className={`text-[10px] ${String(val) === "ONLINE" ? "text-emerald-300" : "text-amber-300"}`}>{label}: {String(val ?? "—")}</Badge>
                ))}
                <Badge variant="outline" className={`text-[10px] ${mon?.deployment?.engineEnabled ? "text-emerald-300" : "text-red-300"}`}>{lang === "fa" ? "موتور" : "Engine"}: {mon?.deployment?.engineEnabled ? "ON" : "OFF"}</Badge>
                {mon?.deployment?.emergencyStop ? <Badge variant="outline" className="text-[10px] text-red-300">EMERGENCY STOP</Badge> : null}
                {mon?.deployment?.pauseNewTrades ? <Badge variant="outline" className="text-[10px] text-amber-300">{lang === "fa" ? "ورود جدید متوقف" : "New trades paused"}</Badge> : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Database className="size-4 text-amber-400" /> {lang === "fa" ? "دیتابیس (تعداد ردیف‌ها)" : "Database (row counts)"}</CardTitle>
            <CardDescription>{lang === "fa" ? "تعداد ۵۰۰ یعنی بیش از ۵۰۰ ردیف." : "A count of 500 means more than 500 rows."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(mon?.counts ?? {}).map(([t, n]) => (
                <div key={t} className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-2.5 py-1.5">
                  <span className="terminal-font text-muted-foreground" dir="ltr">{t}</span>
                  <span className="terminal-font font-bold">{Number(n) >= 0 ? (Number(n) >= 500 ? "500+" : String(n)) : "—"}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm"><Wrench className="size-4 text-violet-400" /> {lang === "fa" ? "مدیریت" : "Management"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {lang === "fa" ? "اسکن فوری: بدون انتظار برای کرون بعدی، کل بازار را همین حالا اسکن می‌کند و سیگنال/پوزیشن جدید باز می‌کند. توقف اضطراری: موتور را فوراً می‌ایستاند — هیچ اسکن و معامله‌ای تا زمانی که دوباره خاموشش کنید اجرا نمی‌شود. توقف ورود جدید: اسکن‌ها ادامه پیدا می‌کنند ولی پوزیشن جدیدی باز نمی‌شود (معاملات باز مدیریت می‌شوند)." : "Scan now: runs a full market scan immediately without waiting for the next cron (may open signals/positions). Emergency stop: halts the engine instantly — no scans or trades until you turn it off again. Pause new trades: scans continue but no new positions open (open trades are still managed)."}
            </p>
            <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="gap-1.5" title={lang === "fa" ? "اسکن فوری کل بازار" : "Scan the whole market now"} onClick={() => runScanNow({ token }).then(() => toast.success(s.saved)).catch((e: any) => toast.error(String(e?.message)))}><RefreshCw className="size-3.5" /> {s.scanNow}</Button>
            <Button
              size="sm"
              variant={mon?.deployment?.emergencyStop ? "default" : "destructive"}
              className="gap-1.5"
              title={lang === "fa" ? "توقف اضطراری: موتور فوراً می‌ایستد — هیچ اسکن و معامله‌ای تا خاموش شدن دوباره اجرا نمی‌شود" : "Emergency stop: the engine halts instantly — no scans or trades until turned off"}
              onClick={() => emergencyStop({ token, stop: !mon?.deployment?.emergencyStop }).then(() => { doMonitor(); toast.success(s.saved); }).catch((e: any) => toast.error(String(e?.message)))}
            >
              <AlertTriangle className="size-3.5" /> {s.emergencyStop}
            </Button>
            <Button
              size="sm"
              variant={mon?.deployment?.pauseNewTrades ? "default" : "outline"}
              className="gap-1.5"
              title={lang === "fa" ? "اسکن‌ها ادامه دارد ولی پوزیشن جدید باز نمی‌شود" : "Scans continue but no new positions open"}
              onClick={() => pauseNewTrades({ token, paused: !mon?.deployment?.pauseNewTrades }).then(() => { doMonitor(); toast.success(s.saved); }).catch((e: any) => toast.error(String(e?.message)))}
            >
              {s.pauseNewTrades}
            </Button>
            </div>
            <div className="mt-3 border-t border-border/50 pt-2.5">
              <p className="mb-2 text-[10px] font-bold text-muted-foreground">{lang === "fa" ? "بازنشانی داده‌ها (غیرقابل بازگشت)" : "Reset data (irreversible)"}</p>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-amber-300"
                  title={lang === "fa" ? "حذف لاگ موتور، حسابرسی و تاریخچه یادگیری" : "Delete engine/audit logs and learning history"}
                  onClick={() => {
                    if (!window.confirm(lang === "fa" ? "تاریخچه (لاگ موتور، حسابرسی، یادگیری) پاک شود؟ این عملیات غیرقابل بازگشت است." : "Clear history (engine logs, audit, learning)? This cannot be undone.")) return;
                    resetData({ token, scope: "logs" }).then(() => { doMonitor(); toast.success(s.saved); }).catch((e: any) => toast.error(String(e?.message ?? e)));
                  }}
                >
                  <Trash2 className="size-3.5" /> {lang === "fa" ? "پاک‌سازی تاریخچه" : "Clear history"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1.5"
                  title={lang === "fa" ? "بستن و حذف همه پوزیشن‌ها، سیگنال‌ها و بازنشانی سود محقق‌شده موتور" : "Delete all positions, signals and reset the engine realized P&L"}
                  onClick={() => {
                    if (!window.confirm(lang === "fa" ? "همه معاملات (پوزیشن‌های باز/بسته، سیگنال‌ها، آمار) و تاریخچه پاک شود؟ سرمایه موتور به مقدار پایه برمی‌گردد. این عملیات غیرقابل بازگشت است." : "Delete ALL trades (open/closed positions, signals, stats) and history? Engine capital returns to base. This cannot be undone.")) return;
                    resetData({ token, scope: "all" }).then(() => { doMonitor(); toast.success(s.saved); }).catch((e: any) => toast.error(String(e?.message ?? e)));
                  }}
                >
                  <Trash2 className="size-3.5" /> {lang === "fa" ? "بازنشانی کامل (معاملات + تاریخچه)" : "Reset trades & history"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Mobile Sticky Bottom Navigation for Admin ─────────────────────────── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-lg border-t border-border/80 px-2 py-1 shadow-2xl safe-area-bottom">
        <div className="flex items-center justify-around max-w-md mx-auto">
          <button
            type="button"
            onClick={() => { setTab("overview"); setAdminCat("engine"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 px-2.5 transition-all ${
              tab === "overview"
                ? "text-emerald-400 font-bold scale-105"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="size-4" />
            <span className="text-[10px]">{s.tabOverview}</span>
            {tab === "overview" && <span className="size-1 rounded-full bg-emerald-400 mt-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => { setTab("positions"); setAdminCat("engine"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 px-2.5 transition-all relative ${
              tab === "positions"
                ? "text-emerald-400 font-bold scale-105"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Activity className="size-4" />
            <span className="text-[10px]">{s.tabPositions}</span>
            {(pos?.open ?? 0) > 0 && (
              <span className="absolute top-0.5 right-2 size-2 rounded-full bg-emerald-400 animate-ping" />
            )}
            {tab === "positions" && <span className="size-1 rounded-full bg-emerald-400 mt-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => { setTab("users"); setAdminCat("users"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 px-2.5 transition-all ${
              tab === "users"
                ? "text-purple-400 font-bold scale-105"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="size-4" />
            <span className="text-[10px]">{s.tabUsers}</span>
            {tab === "users" && <span className="size-1 rounded-full bg-purple-400 mt-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => { setTab("settings"); setAdminCat("system"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 px-2.5 transition-all ${
              tab === "settings"
                ? "text-gold font-bold scale-105"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <SlidersHorizontal className="size-4" />
            <span className="text-[10px]">{s.tabSettings}</span>
            {tab === "settings" && <span className="size-1 rounded-full bg-gold mt-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
              toast.info(lang === "fa" ? "دسته‌بندی‌های بالای صفحه را برای سایر تب‌ها انتخاب کنید" : "Select categories above for more tabs");
            }}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 px-2.5 transition-all text-muted-foreground hover:text-foreground`}
          >
            <FolderKanban className="size-4" />
            <span className="text-[10px]">{lang === "fa" ? "تب‌ها" : "Tabs"}</span>
          </button>
        </div>
      </nav>
    </Tabs>
  );
}

function Field({ label, value, onChange, secret, placeholder }: { label: string; value?: string; onChange: (v: string) => void; secret?: boolean; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input dir="ltr" type={secret ? "password" : "text"} value={value ?? ""} placeholder={secret ? "•••••••• — برای تغییر وارد کنید / enter to change" : placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default function Dashboard() {
  const { lang } = useI18n();
  const { user, token, isAdmin, isAssistant, logout } = useWolfAuth();
  const s = S[lang];
  const overview = useQuery(api.dashboard.overview, {});
  const myNotifs = useQuery(api.admin.listNotifications, { token: token ?? "", mine: !isAdmin });
  const unreadCount = (myNotifs ?? []).filter((n: any) => !n.seen).length;
  const prevUnread = useRef(unreadCount);
  useEffect(() => {
    if (unreadCount > prevUnread.current && unreadCount > 0) {
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        const actx: any = new AC();
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, actx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, actx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.6);
        osc.connect(gain).connect(actx.destination);
        osc.start();
        osc.stop(actx.currentTime + 0.6);
        osc.onended = () => actx.close();
      } catch {
        // audio unavailable — silent
      }
    }
    prevUnread.current = unreadCount;
  }, [unreadCount]);
  const markNotifSeen = useMutation(api.admin.markNotificationSeen);
  const [notifOpen, setNotifOpen] = useState(false);
  const [headerSupportOpen, setHeaderSupportOpen] = useState(false);
  const myTickets = useQuery(api.admin.listMyTickets, token ? { token } : "skip");
  const createTicketM = useMutation(api.admin.createTicket);
  const engine = overview?.engine;
  const isOnline = engine?.status !== "OFFLINE" && engine?.enabled !== false;

  return (
    <div className="relative min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-accent/[0.03]" />
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt="Trading Wolf AI" className="size-8 rounded-md" referrerPolicy="no-referrer" />
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight">Trading Wolf AI</p>
              <p className="terminal-font text-[10px] text-muted-foreground">{isAdmin ? s.roleAdmin : isAssistant ? (lang === "fa" ? "ناظر (پشتیبانی)" : "Monitor") : s.roleUser} · {user?.tgUsername ? `@${user.tgUsername}` : user?.username ?? ""}</p>
            </div>
          </Link>
          <div className="ms-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHeaderSupportOpen(true)}
              className="h-8 gap-1.5 border-sky-500/30 text-sky-400 hover:bg-sky-500/10 font-bold"
            >
              <Headphones className="size-3.5" />
              <span className="hidden sm:inline">{lang === "fa" ? "پشتیبانی و تیکت" : "Support"}</span>
            </Button>
            <span className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold sm:inline-flex ${isOnline ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-red-400/30 bg-red-400/10 text-red-300"}`}>
              <span className={`size-1.5 rounded-full ${isOnline ? "bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse-soft" : "bg-red-400"}`} />
              {isOnline ? s.engineOnline : s.engineOffline}
            </span>
            <Popover open={notifOpen} onOpenChange={(o) => { setNotifOpen(o); if (o) { (myNotifs ?? []).forEach((n: any) => { if (!n.seen) void markNotifSeen({ token: token ?? "", id: n.id }).catch(() => undefined); }); } }}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="relative size-8">
                  <Bell className="size-3.5" />
                  {((myNotifs ?? []).filter((n: any) => !n.seen).length ?? 0) > 0 && (
                    <span className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">{Math.min(9, (myNotifs ?? []).filter((n: any) => !n.seen).length)}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                  <span className="text-xs font-bold">{s.notifications}</span>
                  <span className="text-[10px] text-muted-foreground">{(myNotifs ?? []).filter((n: any) => !n.seen).length} {s.notifUnread}</span>
                </div>
                <div className="max-h-80 space-y-1.5 overflow-auto p-2">
                  {(myNotifs ?? []).slice(0, 30).map((n: any) => (
                    <div key={n.id} className={`rounded-md border p-2.5 text-xs ${n.seen ? "border-border/40 bg-background/40" : "border-emerald-400/30 bg-emerald-400/5"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">{lang === "fa" ? n.titleFa : n.titleEn || n.titleFa}</span>
                        <Badge variant="outline" className={`text-[9px] ${n.seen ? "text-muted-foreground" : "text-emerald-300"}`}>{n.type}</Badge>
                      </div>
                      {n.textFa ? <p className="mt-0.5 text-muted-foreground">{lang === "fa" ? n.textFa : n.textEn || n.textFa}</p> : null}
                      <p className="terminal-font mt-1 text-[9px] text-muted-foreground">{timeAgo(n.created, lang)}</p>
                    </div>
                  ))}
                  {(myNotifs ?? []).length === 0 && <p className="py-8 text-center text-muted-foreground">{s.notifEmpty}</p>}
                </div>
              </PopoverContent>
            </Popover>
            <ThemeToggle />
            <LangToggle />
            <Button variant="outline" size="sm" onClick={() => logout()} className="h-8 gap-1.5">
              <LogOut className="size-3.5" /> <span className="hidden sm:inline">{s.signOut}</span>
            </Button>
          </div>
          <div className="w-full border-t border-border/50 pt-2">
            <MarketClock />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-6 pb-24 sm:pb-6 sm:px-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
              <ShieldCheck className="size-5 text-emerald-400" />
              {isAdmin ? s.tabOverview : s.dashWolf}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {user?.name ?? user?.username ?? user?.tgUsername ?? "wolf"}
            </p>
          </div>
        </div>

        {isAdmin || isAssistant ? <AdminPanel token={token!} readOnly={isAssistant} /> : <UserPanel token={token!} />}

        <SupportTicketModal
          open={headerSupportOpen}
          onOpenChange={setHeaderSupportOpen}
          tickets={myTickets ?? []}
          onCreateTicket={async (subject, message, category, priority) => {
            await createTicketM({ token: token ?? "", subject, message, priority });
          }}
          lang={lang}
        />

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4 text-[11px] text-muted-foreground">
          <span>{s.footer}</span>
          <span className="terminal-font flex items-center gap-1.5">
            <Radio className="size-3.5" /> Trading Wolf AI · {engine?.version ?? ""}
          </span>
        </footer>
      </main>
    </div>
  );
}
