# Changelog

All notable changes to Trading Wolf AI.

## [v1.3.0]

### Added

- **اقتصاد سکه (Wolf Coin)**: موجودی سوم به‌همراه USDT و تومان؛ تسک‌ها و پاداش‌ها (پروفایل، حدس، دعوت)، بسته‌های سکه، کد ووچر، خرید با تومان، کسر سکه ساعتی (پیش‌فرض ۶۰/ساعت) که با خروج از حساب متوقف می‌شود.
- **کیف پول تومانی**: شارژ کارت‌به‌کارت با ثبت سفارش و تأیید دستی مدیریت؛ نرخ تتر به تومان قابل تنظیم؛ کارت/به‌نام/ربات پشتیبانی از تنظیمات.
- **بازی و آموزش**: حدس کندل بعدی با پاداش سکه، آموزش استراتژی با AI، مشاهده سیگنال با پرداخت سکه (خرید دائمی + چارت با Entry/SL/TP).
- **تلگرام دو زبانه** (`/lang`)، رفع باگ تأیید شماره، ۴۸ ساعت VIP رایگان برای کاربر جدید، ارسال پیام مدیر به کاربر/کانال، اطلاع‌رسانی درخواست‌های واریز/برداشت/اشتراک و خطاهای موتور به مدیر.
- **مدل هزینه واقعی موتور**: کارمزد + اسلیپیج روی باز/بست پوزیشن (سود خالص)؛ گیت داده قدیمی (بدون معامله با فید کهنه)؛ بک‌تست موتور روی کندل‌های واقعی با گزارش کامل.
- **بازارها**: ۳۵ کریپتو (۲۵ برتر + ۱۰ میم) + ۳۰ فارکس/فلزات؛ سقف اسکنر ۴۰ نماد؛ جداسازی کریپتو/فارکس در پنل.
- **تیکتینگ**: شناسه کوتاه #T-xxxxx، باز شدن گفتگو با کلیک، نمایش فرستنده.
- **اعلان‌ها**: زنگ اعلان در هدر با شمارنده، ماندگاری ≥۲۴ ساعت پس از مشاهده.
- **پنل مدیریت**: جزئیات کامل کاربر (جنسیت انتخابی، تولد، تلگرام) با ویرایش، تنظیم موجودی سه‌گانه (کسر/افزایش)، ستون تاریخ در تراکنش‌ها، بازگشت وجه درخواست‌های ردشده، بک‌تست در تب گزارش‌ها.
- نسخه همه‌جا ۱.۳؛ حذف متن‌های «آزمایشی/فید تست» از لندینگ.

### Fixed

- خطای IndexRangeBuilder در اسکن موتور (زنجیره `.eq().eq()`).
- خطای بک‌تست «no candle data» — فچ آنی کندل واقعی از Provider + فالبک تایم‌فریم.
- باگ قیمت VIP به تومان (۳۰ تومان!) — تبدیل دلار→تومان با نرخ و تخفیف.
- اعلان‌های مدیر→کاربر که به دست کاربر نمی‌رسید (کوئری صدا زده نشده بود).
- لیبل‌های بدون نام در تنظیمات سکه/ریسک.

## [Unreleased / v1.0.0]

### Added — Production backend (`server/`, VPS-ready)

- Node.js + TypeScript + Hono backend: REST API, WebSocket realtime,
  Telegram webhook — runs on a single VPS with PostgreSQL + Redis.
- Full PostgreSQL schema (`server/migrations/0001_init.sql`, 40+ tables)
  mirroring the Convex schema, with **atomic one-position-per-symbol lock**
  (`UNIQUE` index + advisory lock).
- Engine worker (`worker.ts`, 24/7): heartbeat, watchdog, circuit-breaker
  backoff, graceful shutdown.
- Engine pipeline (`engine.ts`): real market data (multi-provider fallback),
  multi-timeframe analysis, weighted strategy consensus (100+ strategies),
  conflict detection, score (0–100, min 80), risk validation, atomic open,
  SL/TP monitoring, realized PnL, learning + strategy performance + AI review.
- Exchange adapters (`exchanges.ts`): binance, bybit, okx, bingx (full
  signed REST) + mexc, gate, kucoin, lbank, bitget, coinex (market data) +
  MT5 bridge stub + paper adapter. Keys encrypted at rest (AES-256-GCM).
- AI gateway (`ai.ts`): gemini / openai / anthropic / openrouter / ollama
  with priority, fallback, rate & daily limits, dedup cache, usage stats.
- Telegram bridge (`telegram.ts`): initData HMAC verification, membership
  check, phone request, Mini App launch, channel trade alerts.
- Auth (`auth.ts`): argon2id, revocable hashed sessions, RBAC,
  brute-force lockout, password change/reset by admin.
- Seed (`seed.ts`): admin user, 40 curated markets (20 crypto USDT +
  20 forex/metals), 100+ strategies, 3 VIP packages, settings defaults.
- Deploy pack (`deploy/`): docker-compose, Dockerfile, nginx.conf,
  PM2 ecosystem, backup/restore scripts, env template.
- Docs: Persian & English VPS guides, security, API, telegram, engine.

### Changed (from earlier preview iterations)

- `risk.minScore` raised to **80** (was 35) with balanced preset defaults.
- Demo candle generator is now a fallback only (demo mode); live mode uses
  real market data exclusively and skips symbols with stale data.
- All admin secrets manageable from the dashboard; nothing hardcoded.

### Fixed

- Duplicate positions on one symbol (long+short on XAUUSD etc.) — blocked at
  DB level, not just UI.
- `Failed to fetch dynamically imported module` — router switched to eager
  imports.
- Telegram webhook auth, wallet network selection, chart API compatibility.

## [Earlier preview]

- Convex-backed prototype: auth, dashboard, engine cron scan, signals,
  positions, learning, AI analysis, i18n FA/EN, RTL, dark/light themes.
