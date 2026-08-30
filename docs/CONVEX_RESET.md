# 🔄 ریست / ساخت مجدد دپلوی Convex (از طریق Freebuff)

## چرا؟

دپلوی Convex این پروژه (که توسط Freebuff provision شده) به محدودیت پلن رایگان
برخورده و از سمت Convex غیرفعال شده است:

> `You have exceeded the free plan limits, so your deployments have been disabled.`

## پیام آماده برای پشتیبانی Freebuff

> **موضوع: ریست/ساخت مجدد دپلوی Convex پروژه (محدودیت پلن رایگان)**
>
> سلام. دپلوی Convex پروژه‌ی من (که توسط خود Freebuff ساخته شده) به محدودیت پلن
> رایگان Convex برخورده و از سمت Convex غیرفعال شده. تمام کوئری‌ها این خطا را
> می‌دهند:
>
> `You have exceeded the free plan limits, so your deployments have been disabled. Please upgrade to a Pro plan or reach out to us at support@convex.dev for help.`
>
> جزئیات دپلوی فعلی:
> - URL: `https://brilliant-gull-397.convex.site`
> - Auth issuer: `https://freebuff.com` (VLY_CONVEX_AUTH_ISSUER)
>
> درخواست: لطفاً یک **دپلوی جدید (حساب/پروژه‌ی تمیز)** برای این پروژه بسازید یا
> دپلوی فعلی را ریست کنید و **URL جدید** را در اختیارم بگذارید تا پروژه را به آن
> وصل کنم (کدگن + VITE_CONVEX_URL + وبهوک تلگرام).
>
> اگر ریست ممکن نیست، لطفاً محدودیت این دپلوی را موقتاً بالا ببرید یا پلن را
> برای این دوره تنظیم کنید.
>
> با تشکر

## چک‌لیست بعد از دریافت URL جدید

1. URL جدید را در **تب Keys پروژه** بگذارید (فیلد `CONVEX_URL` / `VITE_CONVEX_URL`
   اگر پلتفرم اجازه می‌دهد).
2. از agent بخواهید: `bunx convex dev --once && bun tsc -b --noEmit` را علیه
   دپلوی جدید اجرا و تأیید کند (کدگن باید سبز شود).
3. تب **اتصالات و کلیدها** ← «اتصال وبهوک» دوباره بزنید (آدرس تلگرام باید به
   دپلوی جدید اشاره کند).
4. اگر `system.domain` / `telegram.miniAppUrl` به دامنه‌ی شما اشاره دارد، دست
   نمی‌خورد.

## نکته‌ها

- دپلوی جدید = **دیتابیس خالی** — تنظیمات اولیه با seed ساخته می‌شوند و ورود
  مدیر مثل اول است (`wolfadmin / Wolf3010!` — بعداً عوضش کنید).
- محافظ‌های مصرف (کرون پاکسازی هر ۱۲ ساعت، فید ۱۵ دقیقه‌ای، کندل‌های ۱۶۰تایی)
  از قبل در کد هستند، پس دپلوی جدید با ریسک کمتری شروع می‌کند.
- اگر پلتفرم از دپلوی خارجی (اکانت شخصی convex.dev) پشتیبانی نکند، مسیر
  جایگزین خود-میزبان است: `bash scripts/install.sh` (ببینید `MIGRATE_FROM_CONVEX.md`).
