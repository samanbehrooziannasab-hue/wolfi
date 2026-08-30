# 🐺 راهنمای نصب Trading Wolf AI روی سرور (VPS) — قدم‌به‌قدم فارسی

این راهنما طوری نوشته شده که **حتی بدون تجربه** بتوانید پروژه را روی یک سرور
اجرا کنید. هر مرحله را به ترتیب انجام دهید. اگر خطایی دیدید، بخش
«رفع اشکال» انتهای همین صفحه را ببینید.

> کل سیستم روی **یک سرور (VPS)** اجرا می‌شود:
> PostgreSQL (دیتابیس) + Redis (کش) + Backend + موتور معاملات + تلگرام + سایت.
> بک‌اند این مسیر (`server/`) **بدون Convex** است — نیازی به سرویس خارجی دیگر نیست.
>
> ✅ **وضعیت فرانت‌اند:** در حالت `VITE_BACKEND=rest` (که `deploy/env.example`
> به‌صورت پیش‌فرض دارد) پنل وب با پنل REST اختصاصی (`SelfHostedPanel`) کار می‌کند —
> **لاگین، بازارها، سیگنال‌ها، کیف پول، VIP، پشتیبانی، اعلان‌ها و پروفایل بدون هیچ
> Convex** بالا می‌آید. بخش‌های پیشرفته‌تر داشبورد Convex به‌صورت فازبندی به REST
> منتقل می‌شوند (نقشه: [MIGRATE_FROM_CONVEX.md](MIGRATE_FROM_CONVEX.md)).

---

## قبل از شروع، این چیزها را آماده کنید

| چیز | از کجا | چرا لازم است |
|---|---|---|
| یک سرور VPS (Ubuntu 22.04 یا 24.04، حداقل ۲ گیگ رم و ۱ هسته) | هر شرکت هاست ایرانی یا خارجی (مثلاً Hetzner، DigitalOcean، Contabo) | خود سیستم روی این سرور نصب می‌شود |
| یک دامنه (مثلاً `wolf.example.com`) | ثبت دامنه + DNS هاست | سایت و Mini App حتماً باید HTTPS داشته باشند |
| یک ربات تلگرام و توکن آن | [@BotFather](https://t.me/BotFather) | ربات برای ورود و اطلاع‌رسانی |
| آدرس IP سرور | شرکت هاست | برای اتصال SSH و تنظیم DNS |

**پیشنهاد سخت‌افزار:** ۲ گیگ رم برای شروع، ۴ گیگ رم برای حالتی که موتور روی
بسیاری از نمادها فعال باشد.

---

## اجرای یک‌دست از صفر (پیشنهاد اصلی)

برای نصب مستقل، تمام فایل‌های frontend، backend، migration و worker در همین repository هستند؛ `src/convex/` برای preview باقی می‌ماند و روی VPS اجرا نمی‌شود.

```bash
cd /opt
git clone <YOUR_REPOSITORY_URL> trading-wolf
cd trading-wolf
bash scripts/install.sh
curl http://127.0.0.1/health
```

`install.sh` همه migrationهای پوشه را اجرا می‌کند، build frontend و server را انجام می‌دهد، سرویس را با Docker یا PM2 بالا می‌آورد و health check می‌کند. اگر مرحله‌ای شکست بخورد، متوقف می‌شود و دیگر پیام موفقیت کاذب نمی‌دهد.

برای بروزرسانی:

```bash
cd /opt/trading-wolf
bash scripts/update.sh
```

## مرحله ۱ — اتصال به سرور (SSH)

روی کامپیوتر خود (ویندوز: PowerShell — مک/لینوکس: Terminal) این دستور را بزنید
(به‌جای `1.2.3.4` آدرس IP سرور خودتان را بگذارید):

```bash
ssh root@1.2.3.4
```

رمز یا کلید را وارد کنید. وقتی نوشته شد چیزی مثل `root@server:~#` یعنی موفق
بودید. **از این به بعد همه دستورها داخل سرور اجرا می‌شود.**

> 💡 اگر رمز از شما خواسته نمی‌شود و خطای اتصال می‌گیرید، یعنی کلید SSH در
> تنظیمات سرور تعریف شده. از سایت هاست خودتان «Reset Root Password» بزنید یا
> کلید را اضافه کنید.

## مرحله ۲ — به‌روزرسانی سرور

```bash
apt update && apt upgrade -y
```

## مرحله ۳ — نصب ابزارهای پایه

```bash
apt install -y curl git unzip ufw
```

فایروال را روشن کنید (فقط پورت‌های ۸۰ و ۴۴۳ و ۲۲ باز باشند):

```bash
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
```

## مرحله ۴ — نصب Node.js (نسخه ۲۰) و Bun

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

بررسی کنید (هر دو باید شماره نسخه چاپ کنند):

```bash
node -v
bun -v
```

## مرحله ۵ — نصب Docker و Docker Compose (روش پیشنهادی)

اگر با Docker راحت‌تر هستید، دیتابیس و Redis را با Docker بالا بیاورید:

```bash
curl -fsSL https://get.docker.com | sh
docker --version
docker compose version
```

> اگر نمی‌خواهید Docker استفاده کنید، به جای این مرحله فقط نصب کنید:
> ```bash
> apt install -y postgresql redis-server
> ```

## مرحله ۶ — دریافت کد پروژه

```bash
cd /opt
git clone https://github.com/YOUR_USERNAME/trading-wolf-ai.git
cd trading-wolf-ai
```

## مرحله ۷ — ساخت فایل تنظیمات (.env)

فایل نمونه را کپی کنید:

```bash
cp deploy/env.example .env
nano .env
```

داخل فایل این مقادیر را حتماً عوض کنید:

- `POSTGRES_PASSWORD` → یک رمز قوی دلخواه (مثلاً `wolf-$(openssl rand -hex 12)`)
- `APP_DOMAIN` و `APP_URL` → دامنه خودتان
- `APP_SECRET` و `ENCRYPTION_KEY` → با دستور زیر بسازید:

```bash
openssl rand -hex 32
```

خروجی را در این دو فیلد بگذارید.

- `TELEGRAM_BOT_TOKEN` → توکن از BotFather
- `TELEGRAM_CHANNEL_ID` و `TELEGRAM_ADMIN_ID` → آیدی عددی کانال و خودتان
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` → نام کاربری و رمز مدیر (پیش‌فرض
  `wolfadmin` / `Wolf3010!` — حتماً عوض کنید)

ذخیره و خارج شوید: در nano اول `Ctrl+O` بزنید بعد Enter و سپس `Ctrl+X`.

> ⚠️ فایل `.env` هیچ‌وقت در گیت‌هاب قرار نمی‌گیرد (در `.gitignore` است).

## مرحله ۸ — اجرای دیتابیس و Redis (با Docker)

```bash
docker compose -f deploy/docker-compose.yml up -d postgres redis
```

بررسی کنید سالم‌اند:

```bash
docker compose -f deploy/docker-compose.yml ps
```

## مرحله ۹ — ساخت دیتابیس و داده‌های اولیه (migrate + seed)

```bash
# نصب کتابخانه‌های سرور
cd /opt/trading-wolf-ai/server
npm install

# اجرای اسکیمای دیتابیس (جداول ساخته می‌شود)
source ../.env
export DATABASE_URL
psql "$DATABASE_URL" -f migrations/0001_init.sql

# داده‌های اولیه: مدیر، ۴۰ بازار، ۱۰۰+ استراتژی، ۳ پکیج VIP
npm run seed
```

شما باید چیزی مثل این ببینید:

```
✔ admin user: wolfadmin
✔ markets: 20 crypto + 20 forex/metals
✔ strategies: 100+
✔ vip packages: 3
✔ settings defaults
```

## مرحله ۱۰ — ساخت سایت (Frontend)

```bash
cd /opt/trading-wolf-ai
bun install
bun run build
```

خروجی در پوشه `dist/` ساخته می‌شود.

## مرحله ۱۱ — اجرای Backend و موتور

**روش الف — با Docker Compose (ساده‌تر):**

```bash
cd /opt/trading-wolf-ai
docker compose -f deploy/docker-compose.yml up -d --build frontend api worker nginx

# برای شروع بدون دامنه و SSL، compose از deploy/nginx-docker.conf و HTTP استفاده می‌کند.
```

**روش ب — با PM2 (بدون Docker):**

```bash
npm i -g pm2
cd /opt/trading-wolf-ai/server
pm2 start ../deploy/ecosystem.config.cjs
pm2 save
pm2 startup   # دستوری که می‌دهد را کپی و اجرا کنید تا بعد از ری‌استارت سرور هم بالا بیاید
```

سایت الان باید روی `http://IP` باز شود (بعد از تنظیم SSL، روی HTTPS).

## مرحله ۱۲ — تنظیم دامنه و SSL (گواهی امنیتی)

در پنل DNS دامنه خودتان یک **A Record** بسازید:

```
نام:  @  یا  www   (یا هر چیزی مثل bot)
مقدار:  آدرس IP سرور شما
TTL:  هر چیزی (مثلاً 3600)
```

سپس در سرور، دامنه را در nginx فعال کنید (فایل تنظیمات nginx را باز کنید):

```bash
nano /opt/trading-wolf-ai/deploy/nginx.conf
# این فایل را فقط بعد از آماده‌شدن دامنه و گواهی SSL فعال کنید؛ برای IP خام HTTP از nginx-docker.conf استفاده می‌شود.
```

`server_name` را با دامنه خودتان عوض کنید و ذخیره کنید. سپس:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d wolf.example.com -d www.wolf.example.com
```

Certbot خودش گواهی SSL می‌سازد و تمدید خودکار تنظیم می‌کند. تست تمدید:

```bash
certbot renew --dry-run
```

## مرحله ۱۳ — اتصال ربات تلگرام (Webhook + Mini App)

۱. در BotFather (`/newbot`) ربات بسازید و توکن بگیرید.
۲. `/setdomain` را بزنید و دامنه خودتان را بدهید (برای دکمه Mini App).
۳. در پنل مدیر سایت (تب تنظیمات ← تلگرام) توکن، آیدی کانال، آیدی مدیر و
   `miniAppUrl` را وارد کنید. (`miniAppUrl` = `https://دامنه شما`)
۴. روی دکمه «تنظیم Webhook» بزنید — یا خودتان:

```bash
curl -F "url=https://wolf.example.com/telegram/webhook" \
     -F "secret_token=SECRET_FROM_ENV" \
     "https://api.telegram.org/bot<TOKEN>/setWebhook"
```

۵. در کانال خودتان ربات را **ادمین** کنید (برای بررسی عضویت و ارسال اعلان).
۶. ربات را `/start` کنید — باید: چک عضویت ← درخواست شماره ← دکمه Mini App بدهد.

> دامنه برای Mini App باید HTTPS معتبر داشته باشد (مرحله ۱۲).

## مرحله ۱۴ — ورود به پنل مدیر

- آدرس: `https://wolf.example.com/auth`
- نام کاربری: `wolfadmin` (یا آنچه در `.env` گذاشتید)
- رمز: همان `ADMIN_PASSWORD`

از پنل می‌توانید: موتور را روشن/خاموش کنید، API صرافی و هوش مصنوعی وارد کنید،
کاربر بسازید، پکیج‌های VIP را عوض کنید، و همه تنظیمات ریسک را ببینید.

---

## دستورهای روزانه (خلاصه)

| کار | دستور |
|---|---|
| نصب کامل | مراحل ۱ تا ۱۴ همین راهنما |
| ساخت مجدد سایت | `cd /opt/trading-wolf-ai && bun install && bun run build` |
| اجرای migration | `psql "$DATABASE_URL" -f server/migrations/0001_init.sql` |
| اجرای seed | `cd server && npm run seed` |
| شروع همه | `docker compose -f deploy/docker-compose.yml up -d` |
| توقف همه | `docker compose -f deploy/docker-compose.yml down` |
| ری‌استارت | `docker compose -f deploy/docker-compose.yml restart api worker` |
| لاگ‌ها | `docker compose -f deploy/docker-compose.yml logs -f api worker` |
| سلامت | `curl https://wolf.example.com/health` |
| بکاپ | `bash deploy/backup.sh` |
| بازیابی | `bash deploy/restore.sh backup/نام_فایل.sql.gz` |

اگر PM2 استفاده می‌کنید به جای دستورهای بالا:
`pm2 status` · `pm2 restart wolf-api wolf-worker` · `pm2 logs` · `pm2 stop all`

---

## رفع اشکال (اشتباهات رایج)

**«دیتابیس وصل نمی‌شود»**
→ مطمئن شوید `DATABASE_URL` در `.env` درست است و `docker compose ps` بگوید
`postgres` سالم است. برای تست: `psql "$DATABASE_URL" -c "SELECT 1"`

**«Mini App باز نمی‌شود»**
→ دامنه باید HTTPS معتبر داشته باشد (certbot). در BotFather `/setdomain` را
انجام داده باشید و `TELEGRAM_MINI_APP_URL` پر باشد.

**«ربات چیزی جواب نمی‌دهد»**
→ ۱) توکن در `.env` درست است؟ ۲) webhook ست شده؟ (`setWebhook`)
۳) در کانال ادمین است؟

**«موتور معامله باز نمی‌کند»**
→ عمدی است! قوانین سخت: حداقل Score (پیش‌فرض ۸۰)، عدم تداخل استراتژی‌ها،
داده واقعی بازار. از پنل مدیر: تب Overview ← وضعیت موتور و لاگ‌ها را ببینید.
اگر `market.demoData` فعال باشد در حالت demo داده جایگزین می‌شود.

**«پورت ۳۰۰۱ باز نیست»**
→ درست است؛ nginx پروکسی می‌کند و پورت ۳۰۰۱ فقط روی localhost است. فقط ۸۰/۴۴۳
باز هستند.

**«سرور ری‌استارت شد و بالا نیامد»**
→ با Docker: `restart: unless-stopped` خودکار است. با PM2 دستور `pm2 startup`
را اجرا کرده باشید (`pm2 ls` چک کنید).

**«SSL تمدید نشد»**
→ `certbot renew --dry-run` را ببینید؛ معمولاً یعنی پورت ۸۰ بسته است:
`ufw allow 80`.

---

## امنیت (چک‌لیست کوتاه)

1. رمز مدیر را بعد از اولین ورود عوض کنید (پنل ← تنظیمات ← تغییر رمز).
2. `APP_SECRET` و `ENCRYPTION_KEY` را عوض کنید (openssl rand -hex 32).
3. کلید صرافی فقط با دسترسی «خواندن/معامله» بسازید — **اجازه برداشت ندهید**.
4. Live Trading را فقط وقتی فعال کنید که Paper مدتی جواب داده و قوانین را
   خوانده‌اید (فعال‌سازی با عبارت تأیید انجام می‌شود و در Audit Log ثبت می‌شود).
5. بکاپ روزانه: `crontab -e` و این خط را اضافه کنید:
   `0 3 * * * bash /opt/trading-wolf-ai/deploy/backup.sh`

## 🪙 سواپ‌ولت (کیف پول OTC)

سواپ‌ولت به‌عنوان کیف پول OTC و منبع قیمت تکمیلی وصل شده است. کلید API آن را
به دو صورت می‌توانید تنظیم کنید (هرکدام اول باشد همان استفاده می‌شود):

1. در فایل `.env` سرور: `SWAPWALLET_API_KEY=apikey-...`
2. از داخل پنل ادمین → تب «سواپ‌ولت» (کلید به‌صورت رمزنگاری‌شده در دیتابیس ذخیره می‌شود)

از همان تب می‌توانید فید قیمت را روشن/خاموش کنید، سواپ سریع بزنید، قیمت
قفل‌شده OTC بگیرید و برداشت کریپتو ثبت کنید. کلید از اپ سواپ‌ولت
(پروفایل ← کلید API) ساخته می‌شود.

مستندات بیشتر: [SECURITY.md](SECURITY.md) · [API.md](API.md) · [TELEGRAM.md](TELEGRAM.md) · [TRADING_ENGINE.md](TRADING_ENGINE.md)

---

## ⚡ نصب سریع با اسکریپت (یک خطی)

اگر سرور خام است و دستورها را نمی‌خواهید یکی‌یکی بزنید، از اسکریپت خودکار
استفاده کنید (پیش‌نیازها را نصب می‌کند، `.env` با رمزهای امن می‌سازد، دیتابیس
را migrate و seed می‌کند و پروژه را بالا می‌آورد):

```bash
sudo apt-get update && sudo apt-get install -y git
cd /opt && git clone <آدرس-ریپوی-شما> trading-wolf && cd trading-wolf
bash scripts/install.sh
```

بعد از اتمام، فقط `nano .env` را باز کنید، توکن ربات و آیدی کانال را وارد
کنید و دوباره `bash scripts/update.sh` بزنید.

---

## 🔄 بروزرسانی پروژه (وقتی نسخه جدید منتشر می‌شود)

وقتی پروژه قبلاً روی سرور نصب است و یک نسخه جدید آمده، **فقط یک دستور**:

```bash
cd /opt/trading-wolf   # پوشه‌ی پروژه‌ی نصب‌شده
bash scripts/update.sh
```

این اسکریپت به‌ترتیب و با امنیت کامل:

1. **بکاپ دیتابیس** می‌گیرد (`backups/wolf-<date>.sql` — هفت نسخه نگه می‌دارد)
2. کد جدید را می‌کشد (`git pull`)
3. وابستگی‌ها را نصب می‌کند
4. فرانت‌اند و بک‌اند را build می‌کند
5. migration های دیتابیس را اعمال می‌کند (idempotent — دوباره اجرا هم امن است)
6. سرویس‌ها را ری‌استارت می‌کند (Docker یا PM2 را خودش تشخیص می‌دهد)

**هرگز این موارد را دست نمی‌زند:** فایل `.env`، داده‌های دیتابیس، nginx، SSL،
پیش‌نیازهای نصب‌شده و تنظیمات شما. اگر چیزی خراب شد، از بکاپ `backups/`
دیتابیس را برگردانید و نسخه‌ی قبلی را checkout کنید.
