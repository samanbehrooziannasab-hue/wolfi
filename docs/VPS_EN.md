# 🐺 Trading Wolf AI — VPS Deployment Guide (English)

Full Persian guide: [VPS_FA.md](VPS_FA.md)

Everything runs on **one VPS**: PostgreSQL + Redis + API + engine worker +
Telegram bridge + nginx. No Convex, no external services required.

## Prerequisites

- VPS with Ubuntu 22.04/24.04 (≥2 GB RAM)
- A domain name pointed to the server IP (A record)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## Quick install (Docker)

```bash
# 1. basics
apt update && apt upgrade -y
apt install -y curl git unzip ufw
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable

# 2. node + bun
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
curl -fsSL https://bun.sh/install | bash && source ~/.bashrc

# 3. docker
curl -fsSL https://get.docker.com | sh

# 4. clone
cd /opt && git clone https://github.com/YOUR_USERNAME/trading-wolf-ai.git && cd trading-wolf-ai

# 5. env
cp deploy/env.example .env
nano .env   # fill: POSTGRES_PASSWORD, APP_DOMAIN, APP_SECRET, ENCRYPTION_KEY,
            #       TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, TELEGRAM_ADMIN_ID

# 6. db + redis
docker compose -f deploy/docker-compose.yml up -d postgres redis

# 7. migrate + seed
cd server && npm install
export DATABASE_URL=$(grep ^DATABASE_URL ../.env | cut -d= -f2-)
for migration in migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"; done
npm run seed

# 8. frontend
cd .. && bun install && bun run build

# 9. run everything
docker compose -f deploy/docker-compose.yml up -d --build frontend api worker nginx
# The compose bootstrap gateway is HTTP-only and works on a raw IP first.

# 10. SSL
apt install -y certbot python3-certbot-nginx
certbot --nginx -d wolf.example.com -d www.wolf.example.com
```

## Direct install (PM2, no Docker)

```bash
apt install -y postgresql redis-server
# create db user/database, then same steps 4-8 above
npm i -g pm2
cd server && pm2 start ../deploy/ecosystem.config.cjs && pm2 save && pm2 startup
```

## Commands

| Task | Command |
|---|---|
| Rebuild frontend | `bun install && bun run build` |
| Migrate | `for f in server/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done` |
| Seed | `cd server && npm run seed` |
| Start / Stop / Restart | `docker compose -f deploy/docker-compose.yml up -d` / `down` / `restart api worker` |
| Logs | `docker compose -f deploy/docker-compose.yml logs -f api worker` |
| Health | `curl https://your.domain/health` |
| Backup / Restore | `bash deploy/backup.sh` / `bash deploy/restore.sh backup/file.sql.gz` |

## Telegram setup

1. BotFather: create bot, run `/setdomain` with your domain (Mini App).
2. Admin panel → Settings → Telegram: bot token, channel ID, admin ID,
   `miniAppUrl`, then click **Set Webhook** (or set it manually with curl).
3. Make the bot an **administrator** of your channel.
4. `/start` the bot: it checks channel membership → requests phone → opens Mini App.

## Live trading

Live mode is **off by default**. Enable it from the Admin panel only after
paper mode has been running well — activation requires the confirmation
phrase and is recorded in the audit log. Exchange keys must be created with
**read/trade only** permissions; never grant withdrawal access.

Troubleshooting: see the Persian guide [VPS_FA.md](VPS_FA.md) (رفع اشکال section).
