#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  Trading Wolf AI — REPAIR broken .env and restart
#
#  Fixes: .env corrupted with junk lines, wrong DATABASE_URL, stale server/.env
#
#  Usage:
#      cd /opt/trading-wolf
#      bash scripts/repair.sh
#
#  What it does:
#    1. Backs up the broken .env
#    2. Creates a clean .env from deploy/env.example with the CORRECT DB password
#    3. Removes stale server/.env if it exists
#    4. Runs migrations + seed
#    5. Restarts PM2 services
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
step()  { echo -e "\n${GREEN}${BOLD}▸ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $*${NC}"; }
die()   { echo -e "${RED}✖ $*${NC}" >&2; exit 1; }

cd /opt/trading-wolf

# ── 0) Verify we're in the right place ──────────────────────────────────────
[ -f deploy/env.example ] || die "deploy/env.example not found. Run from /opt/trading-wolf"

# ── 1) Discover the working DB password ─────────────────────────────────────
step "Finding working database password…"

# Try to extract from the CURRENT running pm2 process (if it has a valid env)
DBPASS=$(pm2 env wolf-api 2>/dev/null | grep '^DATABASE_URL=' | sed 's|.*://wolf:\([^@]*\)@.*|\1|' || true)

if [ -z "$DBPASS" ]; then
  # Fallback: try the existing .env (even if broken, might have the right password on the last lines)
  DBPASS=$(grep '^DATABASE_URL=' .env 2>/dev/null | tail -1 | sed 's|.*://wolf:\([^@]*\)@.*|\1|' || true)
fi

if [ -z "$DBPASS" ]; then
  die "Cannot determine DB password. Set it manually: export DB_PASS=your_password && bash scripts/repair.sh"
fi

echo -e "  Database password: ${DBPASS:0:6}••••"

# ── 2) Test the password works ──────────────────────────────────────────────
if ! PGPASSWORD="$DBPASS" psql -h 127.0.0.1 -U wolf -d wolf_trading -c "SELECT 1" >/dev/null 2>&1; then
  die "Password $DBPASS does not work for PostgreSQL. Check your database setup."
fi
echo -e "  ${GREEN}✓ Database connection OK${NC}"

# ── 3) Backup old .env ──────────────────────────────────────────────────────
step "Backing up broken .env…"
cp .env ".env.broken.$(date +%Y%m%d-%H%M%S)"
echo "  Saved backup to .env.broken.$(date +%Y%m%d-%H%M%S)"

# ── 4) Preserve secrets from old .env ───────────────────────────────────────
OLD_APP_SECRET=$(grep '^APP_SECRET=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)
OLD_ENCRYPT_KEY=$(grep '^ENCRYPTION_KEY=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)
OLD_WEBHOOK_SECRET=$(grep '^TELEGRAM_WEBHOOK_SECRET=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)
OLD_AI_KEY=$(grep '^AI_KEY=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)
OLD_AI_KEY2=$(grep '^AI_KEY_2=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)
OLD_TG_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)
OLD_TG_USERNAME=$(grep '^TELEGRAM_BOT_USERNAME=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)
OLD_TG_ADMIN=$(grep '^TELEGRAM_ADMIN_ID=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)
OLD_TG_CHANNEL=$(grep '^TELEGRAM_CHANNEL_ID=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)
OLD_TG_CHANNEL_USER=$(grep '^TELEGRAM_CHANNEL_USERNAME=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)
OLD_TG_MINI=$(grep '^TELEGRAM_MINI_APP_URL=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)
OLD_SWAP_KEY=$(grep '^SWAPWALLET_API_KEY=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)

# Use defaults if nothing found (or if values look like placeholder text)
[ -z "$OLD_APP_SECRET" ] || [ "$OLD_APP_SECRET" = "CHANGE_ME_openssl_rand_hex_32" ] && OLD_APP_SECRET=$(openssl rand -hex 32)
[ -z "$OLD_ENCRYPT_KEY" ] || [ "$OLD_ENCRYPT_KEY" = "CHANGE_ME_openssl_rand_hex_32" ] && OLD_ENCRYPT_KEY="$OLD_APP_SECRET"
[ -z "$OLD_WEBHOOK_SECRET" ] || [ "$OLD_WEBHOOK_SECRET" = "CHANGE_ME_webhook_secret" ] && OLD_WEBHOOK_SECRET=$(openssl rand -hex 16)

echo "  Preserved secrets from old .env"

# ── 5) Create clean .env ────────────────────────────────────────────────────
step "Creating clean .env…"
cat > .env << ENVEOF
# Trading Wolf AI — Environment (repaired $(date +%Y-%m-%d))

# ── Frontend ────────────────────────────────────────────────────────────────
VITE_BACKEND=rest
VITE_API_URL=/api

# ── App ─────────────────────────────────────────────────────────────────────
NODE_ENV=production
APP_NAME=Trading Wolf AI
APP_PORT=3001
APP_DOMAIN=dash.gadgetfroosh.ir
APP_URL=https://dash.gadgetfroosh.ir

# ── Database ────────────────────────────────────────────────────────────────
POSTGRES_PASSWORD=$DBPASS
DATABASE_URL=postgres://wolf:${DBPASS}@127.0.0.1:5432/wolf_trading
DB_POOL_SIZE=10

# ── Cache ───────────────────────────────────────────────────────────────────
REDIS_URL=redis://127.0.0.1:6379/0

# ── Security ────────────────────────────────────────────────────────────────
APP_SECRET=$OLD_APP_SECRET
ENCRYPTION_KEY=$OLD_ENCRYPT_KEY
CORS_ORIGINS=https://dash.gadgetfroosh.ir,http://31.58.244.226,http://dash.gadgetfroosh.ir

# ── Telegram ────────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=${OLD_TG_TOKEN:-PASTE-BOT-TOKEN-HERE}
TELEGRAM_BOT_USERNAME=${OLD_TG_USERNAME:-YOUR_BOT_USERNAME}
TELEGRAM_ADMIN_ID=${OLD_TG_ADMIN:-YOUR_NUMERIC_ID}
TELEGRAM_ASSISTANT_ID=
TELEGRAM_CHANNEL_ID=${OLD_TG_CHANNEL:-YOUR_CHANNEL_ID}
TELEGRAM_CHANNEL_USERNAME=${OLD_TG_CHANNEL_USER:-YOUR_CHANNEL_USERNAME}
TELEGRAM_WEBHOOK_SECRET=$OLD_WEBHOOK_SECRET
TELEGRAM_MINI_APP_URL=${OLD_TG_MINI:-https://dash.gadgetfroosh.ir}

# ── AI ──────────────────────────────────────────────────────────────────────
AI_PROVIDER=gemini
AI_MODEL=gemini-flash-latest
AI_KEY=${OLD_AI_KEY:-}
AI_PROVIDER_2=openai
AI_MODEL_2=gpt-4o-mini
AI_KEY_2=${OLD_AI_KEY2:-}
AI_ENABLED=true

# ── SwapWallet ──────────────────────────────────────────────────────────────
SWAPWALLET_API_KEY=${OLD_SWAP_KEY:-}

# ── USDT ────────────────────────────────────────────────────────────────────
USDT_RATE=1.0
USDT_NETWORK=TRC20

# ── Engine ──────────────────────────────────────────────────────────────────
ENGINE_MODE=demo
ENGINE_CAPITAL=1000
ENGINE_AUTONOMOUS=true
RISK_MIN_SCORE=80
RISK_MIN_CONFIDENCE=0.5
RISK_RISK_PER_TRADE=1.5
RISK_MAX_LEVERAGE=20
ENVEOF

echo -e "  ${GREEN}✓ Clean .env written (${LINES:-$(wc -l < .env)} lines)${NC}"

# ── 6) Verify .env is clean ─────────────────────────────────────────────────
step "Verifying .env…"
LINES=$(wc -l < .env)
DBURL_COUNT=$(grep -c '^DATABASE_URL=' .env || true)
JUNK_LINES=$(grep -cE '^\$|^bash |^curl |^ss |^tail |^head |^grep |^sed |^# بعد' .env || true)

echo "  Lines: $LINES"
echo "  DATABASE_URL entries: $DBURL_COUNT"
[ "$JUNK_LINES" -eq 0 ] || warn "Found $JUNK_LINES junk lines in .env — check manually"
[ "$DBURL_COUNT" -eq 1 ] || die "Expected exactly 1 DATABASE_URL line, found $DBURL_COUNT"

# ── 7) Remove stale server/.env ────────────────────────────────────────────
if [ -f server/.env ]; then
  step "Removing stale server/.env (old password might be here)…"
  cp server/.env server/.env.bak
  rm server/.env
  echo "  Removed (backup at server/.env.bak)"
fi

# ── 8) Run migrations ──────────────────────────────────────────────────────
step "Running database migrations…"
export DATABASE_URL="postgres://wolf:${DBPASS}@127.0.0.1:5432/wolf_trading"
for f in server/migrations/*.sql; do
  echo "  Applying $f…"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" 2>&1 | tail -1
done

# ── 9) Seed ────────────────────────────────────────────────────────────────
step "Seeding database…"
cd server
if command -v bun >/dev/null 2>&1; then
  bun run seed
else
  npx tsx src/seed.ts
fi
cd ..

# ── 10) Rebuild ────────────────────────────────────────────────────────────
step "Building frontend + backend…"
export VITE_BACKEND=rest
if command -v bun >/dev/null 2>&1; then
  bun run build 2>&1 | tail -3
  cd server && bun run build 2>&1 | tail -3 && cd ..
else
  npm run build 2>&1 | tail -3
  cd server && npm run build 2>&1 | tail -3 && cd ..
fi

# ── 11) Publish to nginx ───────────────────────────────────────────────────
WEB_ROOT="/var/www/trading-wolf/dist"
if [ -d "$WEB_ROOT" ]; then
  step "Publishing to $WEB_ROOT…"
  sudo bash -c "rm -rf '$WEB_ROOT'/* && cp -a dist/.'$WEB_ROOT/'"
  echo "  ✓ Published"
fi

# ── 12) Restart services ───────────────────────────────────────────────────
step "Restarting PM2 services…"
pm2 delete all 2>/dev/null || true
mkdir -p /var/log/wolf
pm2 start deploy/ecosystem.config.cjs --update-env
pm2 save
sleep 3

# ── 13) Verify ─────────────────────────────────────────────────────────────
step "Verifying services…"
HEALTH=$(curl -sf http://127.0.0.1:3001/health 2>/dev/null || echo '{"error":"not responding"}')
echo "  Health: $HEALTH"

if echo "$HEALTH" | grep -q '"ok":true'; then
  echo -e "\n${GREEN}${BOLD}═════════════════════════════════════════════════════════════"
  echo "  ✅ Repair complete — API is healthy"
  echo "═════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  Login:  ${BOLD}wolfadmin / Wolf3010!${NC}"
  echo -e "  Panel:  ${BOLD}http://31.58.244.226/auth${NC}"
  echo -e "  Health: ${BOLD}curl http://31.58.244.226/health${NC}"
  echo ""
  echo -e "  ${YELLOW}⚠ First change the admin password from the panel!${NC}"
else
  echo -e "\n${RED}${BOLD}═════════════════════════════════════════════════════════════"
  echo "  ❌ API still not healthy. Check logs:"
  echo "     pm2 logs wolf-api --lines 30 --nostream"
  echo "═════════════════════════════════════════════════════════════${NC}"
  exit 1
fi
