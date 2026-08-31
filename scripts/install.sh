#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  Trading Wolf AI — INSTALL ON A FRESH (RAW) SERVER
#  Ubuntu 22.04 / 24.04. Run as a normal user with sudo access.
#
#  Usage:
#      git clone <your-repo-url> trading-wolf && cd trading-wolf
#      bash scripts/install.sh
#
#  What it does: installs Node/Bun + PostgreSQL + Redis (or Docker), creates
#  .env with STRONG RANDOM secrets, builds everything, migrates + seeds the
#  database, and starts the stack. After it finishes you only need to put
#  your Telegram bot token / channel IDs into .env and run scripts/update.sh.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
step() { echo -e "\n${GREEN}${BOLD}▸ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
die()  { echo -e "${RED}✖ $*${NC}" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "لطفاً به‌عنوان کاربر معمولی اجرا کنید (نه root) — با sudo کار می‌کند."
[ -f .env ] && die "فایل .env از قبل وجود دارد — این اسکریپت فقط برای نصب اولیه است. برای بروزرسانی: bash scripts/update.sh"

# ── 0) system packages ────────────────────────────────────────────────────
step "Update system packages…"
sudo apt-get update -y
sudo apt-get install -y curl git build-essential ca-certificates openssl nodejs npm nginx postgresql postgresql-contrib redis-server

# ── 1) Bun (fast runtime; falls back to npm) ─────────────────────────────
step "Install Bun…"
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi
# Non-interactive shells (PM2/systemd) do not source ~/.bashrc.
export PATH="$HOME/.bun/bin:$PATH"
command -v bun >/dev/null 2>&1 && BUN=1 || BUN=0

# ── 2) PostgreSQL — create user + database ───────────────────────────────
step "Create PostgreSQL user + database…"
sudo service postgresql start 2>/dev/null || sudo systemctl start postgresql 2>/dev/null || true
DB_PASS="$(openssl rand -hex 12)"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='wolf'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE wolf LOGIN PASSWORD '$DB_PASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='wolf_trading'" | grep -q 1 || \
  sudo -u postgres createdb -O wolf wolf_trading
sudo -u postgres psql -c "ALTER ROLE wolf WITH PASSWORD '$DB_PASS';" >/dev/null

# ── 3) .env with strong random secrets ────────────────────────────────────
step "Create .env (secrets generated automatically)…"
[ -f deploy/env.example ] || die "deploy/env.example پیدا نشد — از پوشه‌ی پروژه اجرا کنید."
sed \
  -e "s|CHANGE_ME_openssl_rand_hex_32|$(openssl rand -hex 32)|g" \
  -e "s|CHANGE_ME_STRONG_PASSWORD|$DB_PASS|g" \
  -e "s|trading-wolf.example.com|YOUR-DOMAIN.com|g" \
  -e "s|CHANGE_ME_bot_token_from_BotFather|PASTE-BOT-TOKEN-HERE|g" \
  -e "s|your_wolf_bot|YOUR_BOT_USERNAME|g" \
  -e "s|123456789|YOUR_NUMERIC_ID|g" \
  -e "s|-1001234567890|YOUR_CHANNEL_ID|g" \
  -e "s|your_channel|YOUR_CHANNEL_USERNAME|g" \
  -e "s|CHANGE_ME_webhook_secret|$(openssl rand -hex 16)|g" \
  deploy/env.example > .env
sed -i "s|postgres://wolf:CHANGE_ME_STRONG_PASSWORD@localhost:5432/wolf_trading|postgres://wolf:$DB_PASS@localhost:5432/wolf_trading|" .env
echo "✓ .env ساخته شد (رمزها تصادفی و امن هستند)."

# ── 4) install deps + build ───────────────────────────────────────────────
step "Install dependencies + build…"
if [ "$BUN" = "1" ]; then
  bun install --frozen-lockfile
  (cd server && bun install)
else
  npm install
  (cd server && npm install)
fi
# The self-hosted server ALWAYS builds the REST frontend — never fall back to
# the Convex app on a VPS (it cannot log in without a Convex deployment).
step "Build frontend (dist/)…"
if [ -d dist ]; then
  chmod -R u+w dist 2>/dev/null || true
  rm -rf dist 2>/dev/null || sudo rm -rf dist 2>/dev/null || true
fi
export VITE_BACKEND=rest
export VITE_API_URL="${VITE_API_URL:-/api}"
if [ "$BUN" = "1" ]; then
  bun run build
  (cd server && {
    if [ -d dist ]; then chmod -R u+w dist 2>/dev/null || true; rm -rf dist 2>/dev/null || true; fi
    bun run build
  })
else
  npm run build
  (cd server && {
    if [ -d dist ]; then chmod -R u+w dist 2>/dev/null || true; rm -rf dist 2>/dev/null || true; fi
    npm run build
  })
fi

# ── publish the built frontend to the nginx web root ──────────────────────
# The bundled nginx config serves /var/www/trading-wolf/dist while Vite builds
# into <project>/dist. Publish once here so a fresh install serves the app;
# scripts/update.sh re-publishes on every subsequent update.
step "Publish frontend to nginx root…"
WEB_ROOT="${WEB_ROOT:-/var/www/trading-wolf/dist}"
sudo mkdir -p "$WEB_ROOT"
sudo bash -c "rm -rf '$WEB_ROOT'/*"
sudo bash -c "cp -a 'dist/.' '$WEB_ROOT/'"
echo "✓ published to $WEB_ROOT"

# ── 5) migrate + seed ─────────────────────────────────────────────────────
step "Migrate + seed database…"
export DATABASE_URL="postgres://wolf:$DB_PASS@localhost:5432/wolf_trading"
for migration in server/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done
if [ "$BUN" = "1" ]; then
  (cd server && bun run seed)
else
  (cd server && npm run seed)
fi

# ── 6) start (Docker if available, otherwise PM2) ─────────────────────────
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  step "Start services (Docker Compose)…"
  docker compose -f deploy/docker-compose.yml up -d --build
  sleep 5
  docker compose -f deploy/docker-compose.yml ps
  curl -fsS http://127.0.0.1/health >/dev/null || die "سرویس بالا آمد اما health check شکست خورد. لاگ: docker compose -f deploy/docker-compose.yml logs --tail=100 api worker"
else
  step "Start services (PM2)…"
  if ! command -v pm2 >/dev/null 2>&1; then sudo npm install -g pm2; fi
  pm2 start deploy/ecosystem.config.cjs
  pm2 save >/dev/null 2>&1
  sleep 3
  curl -fsS http://127.0.0.1:3001/health >/dev/null || die "API با PM2 بالا نیامد. لاگ: pm2 logs wolf-api --lines 100"
fi

# ── 7) static site + API reverse proxy (works on a raw IP, HTTP first) ────
step "Configure nginx for the frontend and API…"
sudo install -m 0644 deploy/nginx-http.conf /etc/nginx/sites-available/trading-wolf.conf
sudo ln -sfn /etc/nginx/sites-available/trading-wolf.conf /etc/nginx/sites-enabled/trading-wolf.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx
curl -fsS http://127.0.0.1/ >/dev/null || die "nginx صفحه‌ی frontend را سرو نمی‌کند."


echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════"
echo "  نصب با موفقیت کامل شد ✅"
echo "════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}مرحله‌های باقی‌مانده (فقط یک بار):${NC}"
echo "  1) nano .env   ← این مقادیر را وارد کنید:"
echo "       TELEGRAM_BOT_TOKEN  → از @BotFather"
echo "       TELEGRAM_BOT_USERNAME"
echo "       TELEGRAM_ADMIN_ID   → آیدی عددی شما"
echo "       TELEGRAM_CHANNEL_ID → شناسه کانال (مثلاً -1001234567890)"
echo "       TELEGRAM_MINI_APP_URL → آدرس سایت شما"
echo "       APP_DOMAIN / APP_URL"
echo "  2) bash scripts/update.sh   ← اعمال تغییرات + ری‌استارت"
echo "  3) nginx:  اگر دامنه دارید، deploy/nginx.conf را با دامنه تنظیم کنید"
echo "            و برای HTTPS از certbot استفاده کنید."
echo ""
echo -e "${YELLOW}ورود پیش‌فرض پنل: wolfadmin / Wolf3010!  (بعد از ورود حتماً عوض کنید)${NC}"
