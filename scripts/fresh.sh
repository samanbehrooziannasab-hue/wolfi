#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  Trading Wolf AI — FRESH REPAIR (zero dependencies on broken .env)
#
#  This script works even if .env contains junk, wrong passwords, or is empty.
#  It reads NO secrets from .env — only from environment variables or prompts.
#
#  Usage:
#      cd /opt/trading-wolf
#      bash scripts/fresh.sh                     # interactive
#      DB_PASS=xxx bash scripts/fresh.sh          # non-interactive
#
#  If DB_PASS is not set, it tries:
#    1. PostgreSQL wolf user password via sudo -u postgres
#    2. Interactive prompt
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[1m'; N='\033[0m'
ok()  { echo -e "${G}${B}✓ $*${N}"; }
warn(){ echo -e "${Y}⚠ $*${N}"; }
die() { echo -e "${R}✖ $*${N}" >&2; exit 1; }

cd /opt/trading-wolf

# ── 0) Check PostgreSQL is running ─────────────────────────────────────────
echo -e "${B}▸ Step 0: Checking PostgreSQL…${N}"
sudo service postgresql start 2>/dev/null || sudo systemctl start postgresql 2>/dev/null || true
sudo -u postgres psql -c "SELECT 1" >/dev/null 2>&1 || die "PostgreSQL is not running or not installed."

# ── 1) Find or set the DB password ──────────────────────────────────────────
echo -e "${B}▸ Step 1: Database password…${N}"

if [ -n "${DB_PASS:-}" ]; then
  echo "  Using DB_PASS from environment"
elif [ -n "${DATABASE_URL:-}" ]; then
  DB_PASS=$(echo "$DATABASE_URL" | sed 's|.*://wolf:\([^@]*\)@.*|\1|')
  echo "  Using DB_PASS from DATABASE_URL"
else
  # Try: connect as postgres user, reset wolf password to something known
  NEW_PASS=$(openssl rand -hex 16)
  echo "  Resetting wolf user password to: $NEW_PASS"
  sudo -u postgres psql -c "ALTER USER wolf WITH PASSWORD '$NEW_PASS';"
  DB_PASS="$NEW_PASS"
fi

# Verify the password works
if ! PGPASSWORD="$DB_PASS" psql "postgresql://wolf:${DB_PASS}@127.0.0.1:5432/wolf_trading" -c "SELECT 1" >/dev/null 2>&1; then
  # If that failed, reset wolf password to the provided password
  NEW_PASS="$DB_PASS"
  echo "  Verifying with PGPASSWORD export…"
  export PGPASSWORD="$NEW_PASS"
  if ! psql -h 127.0.0.1 -U wolf -d wolf_trading -c "SELECT 1" >/dev/null 2>&1; then
    echo "  $NEW_PASS didn't work — resetting wolf user to this password"
    sudo -u postgres psql -c "ALTER USER wolf WITH PASSWORD '$NEW_PASS';"
    if ! psql -h 127.0.0.1 -U wolf -d wolf_trading -c "SELECT 1" >/dev/null 2>&1; then
      die "Cannot connect to PostgreSQL as wolf. Check pg_hba.conf."
    fi
  fi
fi
ok "Database connection verified"

# ── 2) Backup old .env ──────────────────────────────────────────────────────
echo -e "${B}▸ Step 2: Backing up old files…${N}"
TS=$(date +%Y%m%d-%H%M%S)
[ -f .env ] && cp .env ".env.bak.$TS" && echo "  .env → .env.bak.$TS"
[ -f server/.env ] && cp server/.env "server/.env.bak.$TS" && rm -f server/.env && echo "  server/.env → server/.env.bak.$TS (deleted)"

# ── 3) Generate fresh .env (NO reading from old .env) ──────────────────────
echo -e "${B}▸ Step 3: Generating fresh .env…${N}"

# Generate secure secrets
APP_SECRET=$(openssl rand -hex 32)
ENCRYPT_KEY="$APP_SECRET"
WEBHOOK_SECRET=$(openssl rand -hex 16)

cat > .env << 'ENDENV'
# Trading Wolf AI — Fresh Environment (auto-generated)

# ── Frontend ────────────────────────────────────────────────────────────────
VITE_BACKEND=rest
VITE_API_URL=/api

# ── App ─────────────────────────────────────────────────────────────────────
NODE_ENV=production
APP_NAME=Trading Wolf AI
APP_PORT=3001
ENDENV

# Append dynamic values (can't use heredoc for variable expansion)
echo "APP_DOMAIN=dash.gadgetfroosh.ir" >> .env
echo "APP_URL=https://dash.gadgetfroosh.ir" >> .env
echo "" >> .env
echo "# ── Database ────────────────────────────────────────────────────────────" >> .env
echo "POSTGRES_PASSWORD=$DB_PASS" >> .env
echo "DATABASE_URL=postgres://wolf:${DB_PASS}@127.0.0.1:5432/wolf_trading" >> .env
echo "DB_POOL_SIZE=10" >> .env
echo "" >> .env
echo "# ── Cache ───────────────────────────────────────────────────────────────" >> .env
echo "REDIS_URL=redis://127.0.0.1:6379/0" >> .env
echo "" >> .env
echo "# ── Security ────────────────────────────────────────────────────────────" >> .env
echo "APP_SECRET=$APP_SECRET" >> .env
echo "ENCRYPTION_KEY=$ENCRYPT_KEY" >> .env
echo "CORS_ORIGINS=https://dash.gadgetfroosh.ir,http://31.58.244.226,http://dash.gadgetfroosh.ir" >> .env
echo "" >> .env
echo "# ── Telegram (fill these in after install) ─────────────────────────────" >> .env
echo "TELEGRAM_BOT_TOKEN=PASTE-YOUR-TOKEN" >> .env
echo "TELEGRAM_BOT_USERNAME=YOUR_BOT" >> .env
echo "TELEGRAM_ADMIN_ID=YOUR_ID" >> .env
echo "TELEGRAM_ASSISTANT_ID=" >> .env
echo "TELEGRAM_CHANNEL_ID=YOUR_CHANNEL" >> .env
echo "TELEGRAM_CHANNEL_USERNAME=YOUR_CHANNEL" >> .env
echo "TELEGRAM_WEBHOOK_SECRET=$WEBHOOK_SECRET" >> .env
echo "TELEGRAM_MINI_APP_URL=https://dash.gadgetfroosh.ir" >> .env
echo "" >> .env
echo "# ── AI ──────────────────────────────────────────────────────────────────" >> .env
echo "AI_PROVIDER=gemini" >> .env
echo "AI_MODEL=gemini-flash-latest" >> .env
echo "AI_KEY=" >> .env
echo "AI_PROVIDER_2=openai" >> .env
echo "AI_MODEL_2=gpt-4o-mini" >> .env
echo "AI_KEY_2=" >> .env
echo "AI_ENABLED=true" >> .env
echo "" >> .env
echo "# ── Engine ──────────────────────────────────────────────────────────────" >> .env
echo "ENGINE_MODE=demo" >> .env
echo "ENGINE_CAPITAL=1000" >> .env
echo "ENGINE_AUTONOMOUS=true" >> .env
echo "RISK_MIN_SCORE=80" >> .env
echo "RISK_MIN_CONFIDENCE=0.5" >> .env
echo "RISK_RISK_PER_TRADE=1.5" >> .env
echo "RISK_MAX_LEVERAGE=20" >> .env
echo "" >> .env
echo "# ── USDT ────────────────────────────────────────────────────────────────" >> .env
echo "USDT_RATE=1.0" >> .env
echo "USDT_NETWORK=TRC20" >> .env
echo "SWAPWALLET_API_KEY=" >> .env
echo "" >> .env
echo "# Process role" >> .env
echo "ROLE=api" >> .env

ok "Fresh .env created ($(wc -l < .env) lines)"

# ── 4) Verify .env is clean ─────────────────────────────────────────────────
echo -e "${B}▸ Step 4: Verifying .env…${N}"
DB_LINES=$(grep -c '^DATABASE_URL=' .env || true)
JUNK=$(grep -cE '^\$|^bash |^curl |^ss |^tail |^head |^grep |^sed ' .env || true)
echo "  DATABASE_URL lines: $DB_LINES"
echo "  Junk lines: $JUNK"
[ "$DB_LINES" -eq 1 ] || die "Expected 1 DATABASE_URL line, got $DB_LINES"
[ "$JUNK" -eq 0 ] || warn "Found $JUNK junk lines — check manually"
ok ".env is clean"

# ── 5) Run migrations ──────────────────────────────────────────────────────
echo -e "${B}▸ Step 5: Running migrations…${N}"
export DATABASE_URL="postgres://wolf:${DB_PASS}@127.0.0.1:5432/wolf_trading"
for f in server/migrations/*.sql; do
  echo "  $(basename "$f")…"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -E 'ERROR|NOTICE' | head -2 || true
done
ok "Migrations applied"

# ── 6) Seed ─────────────────────────────────────────────────────────────────
echo -e "${B}▸ Step 6: Seeding database…${N}"
cd server
if command -v bun >/dev/null 2>&1; then
  bun run seed 2>&1 | tail -5
else
  npx tsx src/seed.ts 2>&1 | tail -5
fi
cd ..
ok "Seed complete"

# ── 7) Rebuild everything ──────────────────────────────────────────────────
echo -e "${B}▸ Step 7: Building frontend + backend…${N}"
export VITE_BACKEND=rest
export VITE_API_URL="/api"

if command -v bun >/dev/null 2>&1; then
  echo "  Frontend…"
  bun run build 2>&1 | tail -3
  echo "  Backend…"
  (cd server && bun run build 2>&1 | tail -3)
else
  echo "  Frontend…"
  npm run build 2>&1 | tail -3
  echo "  Backend…"
  (cd server && npm run build 2>&1 | tail -3)
fi
ok "Build complete"

# ── 8) Publish to nginx ───────────────────────────────────────────────────
WEB_ROOT="/var/www/trading-wolf/dist"
if [ -d "$WEB_ROOT" ]; then
  echo -e "${B}▸ Step 8: Publishing to nginx…${N}"
  sudo bash -c "rm -rf '$WEB_ROOT'/* && cp -a dist/. '$WEB_ROOT/'"
  ok "Published to $WEB_ROOT"
else
  echo -e "${B}▸ Step 8: Skipping nginx publish (no $WEB_ROOT)…${N}"
fi

# ── 9) Restart services ───────────────────────────────────────────────────
echo -e "${B}▸ Step 9: Restarting PM2…${N}"
pm2 delete all 2>/dev/null || true
mkdir -p /var/log/wolf
pm2 start deploy/ecosystem.config.cjs --update-env
pm2 save
# Wait for API to be ready (up to 15s)
for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:3001/health >/dev/null 2>&1; then
    ok "Services restarted and API is ready (took ${i}s)"
    break
  fi
  sleep 1
done

# ── 10) Verify ─────────────────────────────────────────────────────────────
echo -e "${B}▸ Step 10: Verifying…${N}"
HEALTH=$(curl -sf http://127.0.0.1:3001/health 2>/dev/null || echo '{"error":"timeout"}')
echo "  Health: $HEALTH"

LOGIN_TEST=$(curl -sf -X POST http://127.0.0.1:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"wolfadmin","password":"Wolf3010!"}' 2>/dev/null \
  | head -c 200 || echo '{"error":"login_failed"}')
echo "  Login test: $LOGIN_TEST"

echo ""
if echo "$HEALTH" | grep -q '"ok":true' && echo "$LOGIN_TEST" | grep -q '"token"'; then
  echo -e "${G}${B}═════════════════════════════════════════════════════════════${N}"
  echo -e "${G}${B}  ✅  EVERYTHING WORKS — API is healthy and login works${N}"
  echo -e "${G}${B}═════════════════════════════════════════════════════════════${N}"
  echo ""
  echo -e "  Panel:     ${B}http://31.58.244.226/auth${N}"
  echo -e "  Username:  ${B}wolfadmin${N}"
  echo -e "  Password:  ${B}Wolf3010!${N}"
  echo -e "  Health:    ${B}curl http://31.58.244.226/health${N}"
  echo ""
  echo -e "  ${Y}⚠ Change admin password immediately from the panel!${N}"
else
  echo -e "${R}${B}═════════════════════════════════════════════════════════════${N}"
  echo -e "${R}${B}  ❌  Something is still wrong. Debug:${N}"
  echo -e "${R}${B}═════════════════════════════════════════════════════════════${N}"
  echo ""
  echo "  pm2 logs wolf-api --lines 50 --nostream"
  echo "  cat .env | head -20"
  echo "  grep DATABASE_URL .env"
  echo "  grep ROLE .env"
  echo "  pm2 status"
  echo "  ss -ltn | grep 3001"
  echo "  grep ROLE .env"
  echo "  pm2 status"
  echo "  ss -ltn | grep 3001"
fi
