# 🚚 مهاجرت از Convex به بک‌اند داخلی (حذف کامل Convex)

## وضعیت فعلی

- **بک‌اند کامل خود-میزبان** از قبل در `server/` وجود دارد: Node + Hono +
  PostgreSQL + Redis (~۸۰ endpoint REST + WebSocket + موتور معاملات + صرافی‌ها +
  تلگرام + AI). `deploy/` شامل Docker Compose، PM2، nginx، env.example و
  backup/restore است — کل سیستم روی یک VPS اجرا می‌شود و **هیچ وابستگی به Convex
  ندارد**.
- **فرانت‌اند** هنوز با کلاینت Convex نوشته شده است (`useQuery/useMutation/useAction`
  + `src/convex/_generated`). این تنها بخش باقی‌مانده برای حذف کامل Convex است.

## چرا Convex غیرفعال شد

پلن رایگان Convex سقف مصرف دارد؛ دیپلوی از آن سقف رد شد و خود Convex آن را
غیرفعال کرد. این محدودیت روی سرور خودتان وجود ندارد (PostgreSQL روی دیسک خودتان).

## نقشه‌ی مهاجرت (فازبندی پیشنهادی)

| فاز | کار | فایل‌های درگیر |
|---|---|---|
| ۱ | Auth: `use-wolf-auth.tsx` → REST (`/api/auth/login`, `/api/auth/me`, `/api/auth/miniapp`) + حذف `ConvexAuthProvider` از `main.tsx` | `src/hooks/use-wolf-auth.tsx`, `src/main.tsx`, `src/lib/api.ts` (کلاینت REST جدید) |
| ۲ | داشبورد کاربر + تنظیمات: `api.me.*`, `api.settings.*`, `api.dashboard.*` → REST | `src/pages/Dashboard.tsx` |
| ۳ | مدیریت: `api.admin.*` → `/api/admin/*` | `src/pages/Dashboard.tsx` |
| ۴ | موتور/بکتست/تuner/بروکر: `api.engineWorker.*`, `api.broker.*`, `api.monitor.*` → endpoint‌های جدید در `server/src/api.ts` | `server/src/api.ts`, `src/pages/Dashboard.tsx` |
| ۵ | سکه/پیش‌بینی/ووچر: `api.coins.*` → endpoint‌های جدید | `server/src/api.ts`, `src/pages/Dashboard.tsx` |
| ۶ | پاکسازی: حذف `convex/`, `convex.json`, پکیج‌های `convex*` و `@convex-dev/*` | `package.json`, `src/` |

## نقشه‌ی نام‌ها (Convex → REST)

پیشوند ماژول‌ها به‌ترتیب به endpoint های زیر نگاشت می‌شوند:

```
api.me.*            → GET/POST /api/auth/* , /api/me/*
api.settings.*      → GET/POST /api/admin/settings (و publicSettings → /api/settings/public)
api.admin.*         → /api/admin/*        (users, wallet, vip, settings, engine, positions, …)
api.dashboard.*     → GET /api/dashboard
api.markets.*       → GET /api/markets*,   POST /api/admin/engine/scan (فید)
api.strategies.*    → GET /api/strategies, POST /api/admin/settings/preset
api.aiChat.*        → POST /api/ai/*       (ask/test/usage)
api.coins.*         → POST /api/coins/*    (باید اضافه شود)
api.broker.*        → POST /api/admin/exchanges/* (test/balance/positions)
api.engineWorker.*  → POST /api/admin/engine/* (scan/backtest/tuner/manual-open)
api.monitor.*       → POST /api/admin/monitor/stats
api.riskAdvisor.*   → POST /api/admin/settings/ai-risk-advice
api.telegram.*      → POST /api/admin/notify , /api/admin/telegram/*
api.nodeCalls.*     → POST /api/admin/telegram/* (testBot / testChannels / webhook)
```

هر فازی که کامل شود، import های `convex/react` و `@/convex/_generated` از آن
بخش حذف می‌شوند. بعد از اتمام فاز ۶ دیگر پکیج `convex` در `package.json` نیست.

## نکته‌های مهم

- توکن نشست: بک‌اند `server/` توکن را در هدر `Authorization: Bearer <token>`
  می‌پذیرد (همان `requireUser`/`requireAdmin` میدل‌ور‌ها).
- رمزنگاری کلیدها (AES-256-GCM با `ENCRYPTION_KEY` از `.env`) در `server/`
  از قبل پیاده است — همان رفتار تب «اتصالات و کلیدها».
- موتور: `server/src/worker.ts` حلقه‌ی ۲۴/۷ را اجرا می‌کند (جایگزین cron های
  Convex) و `server/src/engine.ts` همان منطق تحلیل/ریسک/اجرا را دارد.
- پس از اتمام: `scripts/update.sh` همان مسیر deploy است؛ بدون Convex هیچ
  محدودیت پلن و هیچ بلاکی وجود ندارد.
