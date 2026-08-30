# 🐺 Trading Wolf AI

**موتور معاملاتی و مانیتورینگ خودکار بر پایه USDT** با پنل وب، مینی‌اپ تلگرام، تحلیل چنداستراتژی و اتصال چندگانه به AI.

A **USDT-based trading and monitoring engine** with a web panel, Telegram Mini App, multi-strategy analysis, live charts, and pluggable AI providers.

> ⚠️ این پروژه ابزار خصوصی است و توصیه مالی نیست. در حالت Live، سفارش واقعی فقط بعد از تنظیم صریح کلید صرافی و فعال‌سازی Live Trading انجام می‌شود.

**نسخه فعلی: ۱.۳.۰** — داده‌ی بازار کاملاً واقعی (بدون کندل مصنوعی)، اقتصاد سکه و کیف پول تومانی، موتور ۲۴/۷ با بک‌تست و مدل هزینه کارمزد/اسلیپیج.

---

## 🏗 دو بک‌اند / Two runtimes (پاسخ به «با Convex یا بدون Convex؟»)

این ریپو **دو بک‌اند مستقل** دارد و هر دو در گیت‌هاب ذکر شده‌اند:

| حالت | بک‌اند | فرانت‌اند | نیاز به Convex؟ | وضعیت |
|---|---|---|---|---|
| **فعلی / پیش‌نمایش** | `src/convex/` (موتور، مارکت، ادمین، تلگرام، AI) | React + کلاینت Convex | ✅ **بله** — همین حالا روی Convex اجرا می‌شود | فعال (همین چیزی که سایت و مینی‌اپ الان استفاده می‌کنند) |
| **خود-میزبان / سرور (VPS)** | `server/` (Hono + PostgreSQL + Redis — موتور، صرافی‌ها، تلگرام، AI) | **پنل REST مخصوص** (`SelfHostedPanel`) برای هسته‌ی کاربر + ادمین‌لایت | ✅ **هیچ‌کجا Convex نیست** — لاگین، بازار، سیگنال، کیف پول، VIP، پشتیبانی، پروفایل | بک‌اند و پنل آماده‌ی deploy؛ انتقال بقیه‌ی بخش‌های پیشرفته‌ی داشبورد Convex به REST فازبندی‌شده |

> ⚠️ **پس چرا گیت‌هاب می‌گوید «با Convex کار می‌کند»؟** چون دو حالت ساخت جداگانه داریم:
> `VITE_BACKEND=convex` (پیش‌فرض — همان چیزی که الان روی Freebuff/Convex اجرا می‌شود) و
> `VITE_BACKEND=rest` (سرور خودتان — **بدون Convex**). در حالت rest، پنل مخصوص REST
> (`SelfHostedPanel`) با بک‌اند `server/` کار می‌کند و لاگین و هسته‌ی داشبورد بدون هیچ
> Convex بالا می‌آید؛ بخش‌های پیشرفته‌ی داشبورد Convex به‌صورت فازبندی به REST منتقل می‌شوند
> (نقشه: [docs/MIGRATE_FROM_CONVEX.md](docs/MIGRATE_FROM_CONVEX.md)).

---

## امکانات / Features

**موتور معاملاتی (Trading Engine)**
- اسکن ۲۴/۷ چندتایم‌فریم (۱۵m/۱h) روی همه بازارهای فعال با داده واقعی (Binance برای کریپتو، Yahoo برای فارکس/فلزات)
- بیش از ۱۰۰ استراتژی واقعی با ایوالویتور (نه فقط نام) در خانواده‌های Price Action / Trend / Momentum / SMC / ICT / Volume و…
- امتیاز ۰ تا ۱۰۰ + تشخیص تعارض استراتژی‌ها + دروازه کیفیت داده (داده قدیمی = بدون معامله)
- جلوگیری قطعی از دو پوزیشن هم‌زمان روی یک نماد (حتی Long و Short مخالف)
- مدل هزینه واقعی: کارمزد پلتفرم + اسلیپیج هنگام باز و بست — سود/زیان خالص
- بک‌تست موتور روی کندل‌های واقعی ذخیره‌شده (گزارش نرخ برد، Profit Factor، بهترین استراتژی‌ها)
- ریسک قابل تنظیم: حداقل امتیاز ورود (پیش‌فرض ۸۰)، ریسک هر معامله، سقف ضرر روزانه، سقف معاملات روزانه، اهرم، DCA و…
- مانیتورینگ پوزیشن باز، SL/TP/تریلینگ، ثبت سود/زیان محقق‌شده و یادگیری برای هر معامله

**بازارها**
- ۳۵ جفت کریپتو (۲۵ ارز برتر + ۱۰ میم‌کوین محبوب) و ۳۰ نماد فارکس/فلزات (ماژورها + کراس‌ها + طلا/نقره)
- جداسازی کامل کریپتو/فارکس، فعال/غیرفعال‌سازی هر نماد از پنل مدیر

**کیف پول و اقتصاد سکه**
- سه موجودی مجزا: **USDT** (با شبکه TRC20/ERC20/BEP20/TON و فریز برای موتور)، **تومان** (شارژ کارت‌به‌کارت، خرید اشتراک و سکه)، **ولف‌کوین** (پاداش تسک، دعوت، بازی و پرداخت امکانات)
- نرخ تتر به تومان، قیمت سکه، بسته‌های سکه، کد ووچر، کسر سکه ساعتی (پیش‌فرض ۶۰) — همه از پنل مدیر
- دفتر سکه و تاریخچه یکپارچه کیف پول با تاریخ شمسی/میلادی

**تلگرام**
- ربات سبک فقط نقش Bridge: عضویت کانال، شماره تماس، ورود مینی‌اپ، اعلان‌ها
- دو زبانه (فارسی/انگلیسی) با `/lang`، ارسال پیام از پنل مدیر به کاربر یا کانال
- اطلاع‌رسانی خودکار درخواست‌های واریز/برداشت/اشتراک و خطاهای موتور به ایدی مدیر

**کاربر و مدیریت**
- پنل کاربر ریسپانسیو با داشبورد، پروفایل، کیف پول، تیکتینگ (شناسه #T-xxxxx)، آموزش، بازی حدس کندل و هوش مصنوعی
- پنل مدیریت کامل: Overview / Engine / Users / VIP / Wallets / Positions / Markets / Strategies / AI / Exchanges / Notifications / Support / Referral / Learning / Reports / Logs / Settings
- پکیج‌های VIP با تخفیف، سکه هدیه، کارمزد از سود و مدت چندماهه؛ ۴۸ ساعت اشتراک رایگان برای کاربر جدید (قابل تنظیم)
- ورود با username/password، امنیت: Argon2id، سشن امن، RBAC، لاگ حسابرسی، رمزنگاری کلیدها

---

---

## ورود پیش‌فرض / Default admin login

```text
Username: wolfadmin
Password: Wolf3010!
```

بعد از اولین ورود رمز را از **پنل مدیر → کاربران** تغییر دهید.
Change the password from **Admin → Users** immediately after the first login.

---

## تنظیمات و کلیدها / Configuration

تنظیمات اصلی seed در این فایل قرار دارد:

```text
src/convex/constants.ts
```

اما برای محیط واقعی، کلیدها را داخل سورس commit نکنید. کلیدهای زیر را از تب **Keys / API keys** یا Secret Manager سرور وارد کنید:

```text
GEMINI_API_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
OPENROUTER_API_KEY
GROQ_API_KEY
CEREBRAS_API_KEY
MISTRAL_API_KEY
TELEGRAM_BOT_TOKEN
VITE_CONVEX_URL
```

در پنل مدیر بخش‌ها قابل تنظیم هستند؛ تب **اتصالات و کلیدها / Connections** (زیرگروه تنظیمات) همه‌ی مقادیر قابل تزریق را یکجا دارد:

- Telegram bot token، bot username، owner/assistant numeric ID، وبهوک URL + secret، لینک Mini App
- کانال فارسی: numeric ID، username، invite link، عضویت اجباری
- کانال انگلیسی (دو زبانه): همان مقادیر با کلیدهای `channel.enId` / `channel.enUsername` / `channel.enInviteLink` — اعلان‌ها و کارت‌های معاملات به هر دو کانال ارسال می‌شوند
- دیتابیس: host، port، name، user و password
- دامنه سایت و آی‌پی سرور
- AI provider، model و key اول و دوم
- نرخ USDT و شبکه‌ی پیش‌فرض
- سرمایه موتور، ریسک هر معامله، leverage، حداقل score و confidence
- Spot/Futures، حالت Live/Paper، autonomous engine
- API حساب صرافی/بروکر و محیط Demo/Live

**رمزنگاری در حالت ذخیره (Encrypted at rest):** توکن ربات، secret وبهوک، کلیدهای AI و رمز دیتابیس با AES-GCM و کلید `system.encryptionKey` رمزنگاری می‌شوند و در خروجی فقط نسخه‌ی mask دیده می‌شود — حتی اگر دیتابیس لو برود، متن واقعی کلیدها قابل خواندن نیست. کلیدهای صرافی نیز در جدول `exchangeAccounts` با AES-GCM رمزنگاری می‌شوند.

**تست تلگرام:** در تب اتصالات دکمه‌های «تست اتصال ربات» (getMe + پیام تست به مدیر)، «تست ارسال به کانال‌ها» (هر دو کانال fa/en) و «اتصال وبهوک» (setWebhook روی `<deployment>/telegram/webhook`) وجود دارد؛ سپس از طریق «باز کردن ربات» و ارسال `/start`، ورود با تلگرام (دکمه‌ی Mini App) قابل تست است.

---

## نصب سریع / Quick install

### 🖥 نصب روی سرور خام (مسیر Server / REST بدون Convex)

**مسیر سرور مستقل:** بک‌اند کامل (PostgreSQL + Redis + API + موتور + تلگرام)
روی یک سرور اجرا می‌شود و build فرانت‌اند با `VITE_BACKEND=rest` به همین API وصل
می‌شود؛ Convex فقط برای مسیر پیش‌نمایش استفاده می‌شود و در این مسیر لازم نیست.

روی یک VPS خام (Ubuntu 22.04/24.04)، فقط این ۳ دستور:

```bash
sudo apt-get update && sudo apt-get install -y git
cd /opt && git clone <YOUR_REPOSITORY_URL> trading-wolf && cd trading-wolf
bash scripts/install.sh
```

اسکریپت همه‌چیز را خودش انجام می‌دهد: پیش‌نیازها (Node/Bun + PostgreSQL +
Redis)، ساخت `.env` با رمزهای تصادفی امن، build فرانت‌اند و بک‌اند، migration
و seed دیتابیس و بالا آوردن سرویس‌ها. `deploy/env.example` حالا شامل
`VITE_BACKEND=rest` است — یعنی فرانت‌اند به‌صورت خودکار در حالت **بدون Convex**
build می‌شود و با پنل REST کار می‌کند. بعد فقط `nano .env` را باز کنید، توکن
ربات تلگرام و آیدی کانال را وارد کنید و `bash scripts/update.sh` بزنید.

راهنمای کامل قدم‌به‌قدم فارسی: **[docs/VPS_FA.md](docs/VPS_FA.md)** ·
English: **[docs/VPS_EN.md](docs/VPS_EN.md)** · مرجع دستورها: **[docs/DEPLOY.md](docs/DEPLOY.md)**

### 🔄 بروزرسانی پروژه (وقتی پروژه قبلاً روی سرور است)

یک دستور، بدون بهم‌ریختن زیرساخت و تنظیمات:

```bash
cd /opt/trading-wolf   # پوشه‌ی پروژه‌ی نصب‌شده
bash scripts/update.sh
```

بکاپ دیتابیس → git pull → نصب وابستگی‌ها → build → migration → ری‌استارت.
هرگز `.env`، داده‌ها و پیش‌نیازها را دست نمی‌زند.

### ⚙️ توسعه‌ی محلی (پیش‌نمایش — Convex)

```bash
bun install
bun convex dev --once
bun run dev
```

برای typecheck:

```bash
bun convex dev --once && bun tsc -b --noEmit
```

> **وضعیت مهاجرت از Convex:** بک‌اند کامل خود-میزبان (`server/`) آماده و
> قابل deploy است؛ فرانت‌اند هنوز روی کلاینت Convex است و به‌صورت فازبندی به
> REST منتقل می‌شود — نقشه‌ی کامل: **[docs/MIGRATE_FROM_CONVEX.md](docs/MIGRATE_FROM_CONVEX.md)**
> دلیل: محدودیت پلن رایگان Convex دیپلوی را غیرفعال کرد؛ روی سرور خودتان چنین
> محدودیتی وجود ندارد.

---

## ساختار / Structure

```text
src/                      # Frontend (React + Vite — two build modes)
  lib/backend.ts          #   VITE_BACKEND switch (convex | rest) + REST client
  pages/                  #   Auth.tsx · Dashboard.tsx (Convex) · SelfHostedPanel.tsx (REST)
  components/             #   LiveChart.tsx · MarketClock.tsx · RequireAuth.tsx
  hooks/use-wolf-auth.tsx
  convex/                 #   schema · engine · strategies · admin · telegram

server/                   # 🚀 Production backend (Node + Hono + PostgreSQL + Redis)
  src/
    api.ts                #   REST + WebSocket + Telegram webhook
    worker.ts             #   engine 24/7 loop (heartbeat + watchdog)
    engine.ts             #   analysis → risk → execution → monitor → learning
    exchanges.ts          #   adapter plugins: binance/bybit/okx/bingx/mexc/…
    ai.ts                 #   AI gateway: gemini/openai/anthropic/openrouter/ollama
    telegram.ts           #   bot bridge: membership, phone, Mini App, alerts
    auth.ts               #   argon2id, sessions, RBAC, brute-force lock
    settings.ts           #   typed settings + risk presets
    seed.ts               #   admin + 40 markets + 100+ strategies + VIP
  migrations/*.sql        # ordered, idempotent production migrations

deploy/                   # docker-compose · Dockerfile · nginx.conf · PM2 · backup/restore

docs/                     # VPS_FA.md · VPS_EN.md · DEPLOY.md · SECURITY.md · API.md · TELEGRAM.md · TRADING_ENGINE.md
```

---

## مستندات / Documentation

| سند | توضیح |
|---|---|
| [VPS_FA.md](docs/VPS_FA.md) | نصب قدم‌به‌قدم فارسی روی سرور (مبتدی‌پسند) |
| [VPS_EN.md](docs/VPS_EN.md) | English deployment guide |
| [DEPLOY.md](docs/DEPLOY.md) | دستورهای install/build/migrate/seed/start/stop/restart/logs/backup/restore/health |
| [SECURITY.md](docs/SECURITY.md) | مدل امنیتی، audit، hardening |
| [API.md](docs/API.md) | فهرست کامل APIها |
| [TELEGRAM.md](docs/TELEGRAM.md) | راه‌اندازی ربات، webhook و Mini App |
| [TRADING_ENGINE.md](docs/TRADING_ENGINE.md) | معماری موتور، قوانین سخت و ریسک |
| [CHANGELOG.md](CHANGELOG.md) | تغییرات نسخه‌ها |

---

## Telegram deployment note

ربات باید روی webhook عمومی Telegram قرار بگیرد و این مراحل را انجام دهد:

1. دریافت `/start`
2. درخواست Contact و ثبت phone number
3. بررسی عضویت در کانال با `telegramChatMember`
4. ساخت session از طریق `tgLogin`
5. ارسال دکمه Mini App
6. ارسال signal، trade-open و trade-close با reply به پیام اصلی

The Telegram bot must run behind a public HTTPS webhook. In the current (Convex)
stack the Mini App uses the same Convex deployment; in the self-hosted (`server/`)
stack the webhook is `https://<your-domain>/telegram/webhook` proxied to the API.

---

## Disclaimer

معاملات اهرمی و اتصال API صرافی می‌تواند باعث از دست رفتن کل سرمایه شود. ابتدا با Paper/Demo و سرمایه محدود تست کنید.

Leveraged trading and exchange API access can result in total loss. Test with Paper/Demo mode and limited capital first.
