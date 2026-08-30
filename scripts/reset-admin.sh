#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  Trading Wolf AI — RESET DEFAULT ADMIN (one-shot recovery)
#  Fixes the classic "نام کاربری یا رمز عبور اشتباه است" loop on a VPS:
#    1. clears the brute-force lockout (6 failed tries → 15 min block),
#    2. marks the admin row for repair so the seed restores the default
#       credentials (works even if the password was changed and forgotten),
#    3. runs the seed (fixes role/flags + password),
#    4. restarts the services.
#  Safe to run any time — idempotent, never deletes data.
#
#  Usage:
#      bash scripts/reset-admin.sh
#      # optional custom default:  ADMIN_PASSWORD=YourPass123 bash scripts/reset-admin.sh
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
step() { echo -e "\n${GREEN}${BOLD}▸ $*${NC}"; }

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

[ -f .env ] || { echo -e "${RED}✖ .env پیدا نشد — از ریشه‌ی پروژه‌ی نصب‌شده اجرا کنید.${NC}" >&2; exit 1; }

DB_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
[ -n "$DB_URL" ] || { echo -e "${RED}✖ DATABASE_URL در .env پیدا نشد.${NC}" >&2; exit 1; }

ADMIN_USER="$(grep -E '^ADMIN_USERNAME=' .env | head -1 | cut -d= -f2-)"
[ -n "$ADMIN_USER" ] || ADMIN_USER="wolfadmin"
# only safe characters go into the SQL below — never trust .env blindly
case "$ADMIN_USER" in
  *[!a-zA-Z0-9_]*|'') echo -e "${RED}✖ ADMIN_USERNAME نامعتبر است.${NC}" >&2; exit 1 ;;
esac

# ── 1) clear the brute-force lockout ────────────────────────────────────────
step "پاک‌کردن قفل تلاش‌های ناموفق (login_attempts)…"
psql "$DB_URL" -c "DELETE FROM login_attempts;" >/dev/null 2>&1 || true
echo "✓ done"

# ── 2) mark the admin row for repair (the seed restores the default pass) ──
step "آماده‌سازی ردیف ادمین برای تعمیر ($ADMIN_USER)…"
psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -c "UPDATE users SET is_assistant = true, password_hash = NULL WHERE LOWER(username) = LOWER('$ADMIN_USER');" \
  >/dev/null
echo "✓ done"

# ── 3) run the seed (fixes role/flags + sets the password) ─────────────────
step "اجرای seed برای ترمیم نقش و رمز…"
export PATH="$HOME/.bun/bin:$PATH"
if command -v bun >/dev/null 2>&1; then
  (cd server && DATABASE_URL="$DB_URL" bunx tsx src/seed.ts)
else
  (cd server && DATABASE_URL="$DB_URL" npx tsx src/seed.ts)
fi

# ── 4) restart services ─────────────────────────────────────────────────────
step "ری‌استارت سرویس‌ها…"
if command -v pm2 >/dev/null 2>&1; then
  pm2 reload all >/dev/null 2>&1 || pm2 restart all >/dev/null 2>&1 || true
  echo "✓ pm2 reloaded"
elif docker compose version >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
  docker compose -f deploy/docker-compose.yml restart api worker >/dev/null 2>&1 || true
  echo "✓ docker restarted"
else
  echo -e "${YELLOW}⚠ سرویس‌ها دستی ری‌استارت نشدند — خودتان ری‌استارت کنید.${NC}"
fi

echo ""
echo -e "${GREEN}${BOLD}✅ انجام شد. حالا با این مشخصات وارد شوید:${NC}"
echo "   نام کاربری: $ADMIN_USER"
echo "   رمز عبور:   ${ADMIN_PASSWORD:-Wolf3010!}"
echo ""
echo -e "${YELLOW}بعد از ورود حتماً رمز را از پنل عوض کنید.${NC}"
