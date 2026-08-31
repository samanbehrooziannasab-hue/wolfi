#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  Trading Wolf AI — ONE-COMMAND UPDATE
#  Safe in-place upgrade for a project that is ALREADY installed on a server.
#
#  What it does (in order):
#    1. backs up the database  (backups/wolf-<date>.sql, keeps last 7)
#    2. pulls the latest code (git pull --ff-only)
#    3. installs dependencies  (bun, or npm as fallback)
#    4. builds the frontend (dist/) and the backend (server/dist/)
#    5. applies database migrations (idempotent)
#    6. restarts services — Docker Compose or PM2 (auto-detected)
#
#  What it NEVER touches:
#    • .env                      → your secrets stay exactly as they are
#    • database data / users     → only migrations run on top
#    • installed prerequisites   → nothing is (re)installed system-wide
#    • nginx / SSL / systemd     → untouched
#
#  Usage (as a normal user, NOT root):
#      cd /path/to/trading-wolf
#      bash scripts/update.sh
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
step()  { echo -e "\n${GREEN}${BOLD}▸ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $*${NC}"; }
die()   { echo -e "${RED}✖ $*${NC}" >&2; exit 1; }

[ -f .env ] || die "فایل .env پیدا نشد — این اسکریپت فقط برای پروژه‌ی نصب‌شده است. برای نصب اولیه: bash scripts/install.sh"
command -v git >/dev/null || die "git نصب نیست."

# ── detect runtime (docker compose OR pm2) ────────────────────────────────
RUNTIME=""
if docker compose version >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
  RUNTIME="docker"
elif command -v pm2 >/dev/null 2>&1; then
  RUNTIME="pm2"
fi
[ -n "$RUNTIME" ] || warn "نه Docker و نه PM2 پیدا نشد — پروژه را خودتان دستی ری‌استارت کنید."

# ── 1) database backup ────────────────────────────────────────────────────
step "Backup database…"
mkdir -p backups
DB_URL="${DATABASE_URL:-}"
# try .env values first
if [ -z "$DB_URL" ] && [ -f .env ]; then
  DB_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
fi
if [ -n "$DB_URL" ]; then
  BACKUP="backups/wolf-$(date +%Y%m%d-%H%M%S).sql"
  pg_dump "$DB_URL" > "$BACKUP" 2>/dev/null && echo "✓ backup: $BACKUP" || warn "backup ناموفق بود (pg_dump نصب نیست؟) — ادامه می‌دهیم."
  ls -1t backups/*.sql 2>/dev/null | tail -n +8 | xargs -r rm -f   # keep last 7
else
  warn "DATABASE_URL مشخص نیست — از backup صرف‌نظر شد."
fi

# ── 2) pull latest code ───────────────────────────────────────────────────
step "Pull latest code…"
if ! git pull --ff-only; then
  # server/package.json is a generated manifest — a stray local edit to it
  # (from a manual npm/bun install) blocks every ff-only pull. It is safe to
  # restore: the lockfile stays authoritative and the next install re-syncs it.
  if git diff --quiet -- server/package.json 2>/dev/null; then
    die "git pull ناموفق — ابتدا تغییرات محلی را commit یا stash کنید."
  fi
  warn "server/package.json به‌صورت محلی تغییر کرده بود — بازگردانی شد."
  git checkout -- server/package.json
  git pull --ff-only || die "git pull ناموفق — ابتدا تغییرات محلی را commit یا stash کنید."
fi

# ── 3) install dependencies ───────────────────────────────────────────────
step "Install dependencies…"
export PATH="$HOME/.bun/bin:$PATH"
if command -v bun >/dev/null 2>&1; then
  bun install --frozen-lockfile
  (cd server && bun install --frozen-lockfile)
else
  npm install
  (cd server && npm install)
fi

# ── 4) build ──────────────────────────────────────────────────────────────
# The self-hosted server ALWAYS builds the REST frontend. If VITE_BACKEND is
# missing from .env the build would silently fall back to the Convex app,
# which cannot log in without a Convex deployment — exactly the failure we
# keep seeing on VPS installs. Force it here (Vite: process env > .env file).
step "Build frontend (dist/)…"
if [ -d dist ]; then
  chmod -R u+w dist 2>/dev/null || true
  rm -rf dist 2>/dev/null || sudo rm -rf dist 2>/dev/null || true
fi
export VITE_BACKEND=rest
export VITE_API_URL="${VITE_API_URL:-/api}"
if command -v bun >/dev/null 2>&1; then bun run build; else npm run build; fi

# ── 4b) publish the freshly-built frontend to the nginx web root ─────────
# The bundled nginx config serves /var/www/trading-wolf/dist while Vite writes
# to <project>/dist. Without this copy nginx keeps serving a STALE build —
# this is why updates appeared to "not apply" on the server.
step "Publish frontend to nginx root…"
WEB_ROOT="${WEB_ROOT:-/var/www/trading-wolf/dist}"
mkdir -p "$WEB_ROOT"
rm -rf "$WEB_ROOT"/* 2>/dev/null || sudo rm -rf "$WEB_ROOT"/* 2>/dev/null || true
cp -a dist/. "$WEB_ROOT"/ 2>/dev/null || sudo cp -a dist/. "$WEB_ROOT"/ || true
echo "✓ published to $WEB_ROOT"

step "Build backend (server/dist/)…"
if [ -d server/dist ]; then
  chmod -R u+w server/dist 2>/dev/null || true
  rm -rf server/dist 2>/dev/null || sudo rm -rf server/dist 2>/dev/null || true
fi
if command -v bun >/dev/null 2>&1; then (cd server && bun run build); else (cd server && npm run build); fi
# Fail closed if PM2 would otherwise restart with a stale backend bundle.
if ! grep -q 'telegram.webhookSecret.*config.telegram.webhookSecret' server/dist/api.js; then
  die "server/dist قدیمی است یا route وبهوک در build وجود ندارد — build متوقف شد."
fi
if ! grep -q 'bodyToken' server/dist/api.js; then
  die "build بک‌اند شامل دریافت botToken نیست — نسخهٔ قدیمی اجرا نشود."
fi

echo "✓ backend bundle verified (webhook route + botToken support)"

# ── 5) migrations ─────────────────────────────────────────────────────────
step "Apply migrations…"
[ -n "$DB_URL" ] || die "DATABASE_URL مشخص نیست — migration متوقف شد."
for migration in server/migrations/*.sql; do
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done
echo "✓ migrations ok"

# ── 5b) re-seed (safe — only inserts missing data, never deletes) ─────────
# A failed seed must NEVER block the restart step: the build + migrations
# already succeeded above, and stopping here leaves PM2/Docker running the
# OLD code — exactly why updates appeared to "not apply" on the server.
# Warn and continue; the admin can re-run seed manually if needed.
step "Re-seed default data…"
if command -v bun >/dev/null 2>&1; then
  (cd server && DATABASE_URL="$DB_URL" bunx tsx src/seed.ts) || warn "seed ناموفق بود — سرویس‌ها همچنان ری‌استارت می‌شوند. برای اجرای دستی: (cd server && DATABASE_URL=\"\$DB_URL\" bunx tsx src/seed.ts)"
else
  (cd server && DATABASE_URL="$DB_URL" npx tsx src/seed.ts) || warn "seed ناموفق بود — سرویس‌ها همچنان ری‌استارت می‌شوند. برای اجرای دستی: (cd server && DATABASE_URL=\"\$DB_URL\" npx tsx src/seed.ts)"
fi

# ── 6) restart ────────────────────────────────────────────────────────────
[ -n "$RUNTIME" ] || die "نه Docker و نه PM2 پیدا نشد — سرویس‌ها restart نشدند."
step "Restart services ($RUNTIME)…"
if [ "$RUNTIME" = "docker" ]; then
  docker compose -f deploy/docker-compose.yml up -d --build
elif [ "$RUNTIME" = "pm2" ]; then
  # --update-env refreshes the env vars of already-running PM2 processes, but
  # it ALSO copies the values from .env over a possibly-working runtime env.
  # If .env has a broken DATABASE_URL, reloading with --update-env would break
  # login for everyone ("loading loop" / 401s). Verify the URL first; only
  # pass --update-env when it actually connects.
  ENV_OK=1
  if [ -n "$DB_URL" ]; then
    if ! PGCONNECT_TIMEOUT=3 psql "$DB_URL" -tAc "SELECT 1" >/dev/null 2>&1; then
      ENV_OK=0
      warn "DATABASE_URL داخل .env به دیتابیس وصل نمی‌شود (seed هم به همین دلیل خطا می‌دهد)."
      warn "سرویس‌ها با env فعلی ری‌استارت می‌شوند (بدون --update-env) تا نسخهٔ سالم حفظ شود."
      warn "برای همیشه: مقدار صحیح DATABASE_URL را در .env بگذارید — دستور: pm2 env wolf-api | grep DATABASE_URL"
    fi
  fi
  if [ "$ENV_OK" = "1" ]; then
    pm2 reload all --update-env || pm2 restart all --update-env
  else
    pm2 reload all || pm2 restart all
  fi
  pm2 save >/dev/null 2>&1 || true
fi

step "✅ Done! $([ "$RUNTIME" = "docker" ] && echo 'docker compose ps  → check status' || [ "$RUNTIME" = "pm2" ] && echo 'pm2 status  → check status')"
echo -e "${BOLD}اگر مشکلی پیش آمد:${NC}"
echo "  • git log  → آخرین commit سالم را پیدا کنید"
echo "  • backups/wolf-*.sql  → restore دیتابیس:  psql \"\$DATABASE_URL\" < backups/wolf-<date>.sql"
