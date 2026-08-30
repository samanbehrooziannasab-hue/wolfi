# 🚀 Deployment Reference

Step-by-step: [VPS_FA.md](VPS_FA.md) (فارسی) · [VPS_EN.md](VPS_EN.md) (English)

## Layout

```
deploy/
├── docker-compose.yml     # postgres + redis + frontend + api + worker + nginx
├── Dockerfile             # server image (api/worker)
├── nginx.conf             # reverse proxy + SPA + HTTP→HTTPS
├── ecosystem.config.cjs    # PM2 alternative (wolf-api, wolf-worker)
├── backup.sh              # pg_dump + gzip + rotate
├── restore.sh             # gunzip + psql restore
└── env.example            # full environment template

server/
├── src/                   # TypeScript backend (Hono + pg + ioredis)
│   ├── api.ts             # REST + WebSocket + Telegram webhook entry
│   ├── worker.ts          # engine 24/7 loop entry
│   ├── engine.ts          # analysis → risk → execution → monitor → learning
│   ├── exchanges.ts       # adapter plugins (binance, bybit, okx, bingx, …)
│   ├── ai.ts              # multi-provider AI gateway (fallback + limits)
│   ├── telegram.ts        # bot bridge: membership, phone, Mini App, alerts
│   ├── auth.ts            # argon2id, sessions, RBAC, brute-force lock
│   ├── settings.ts        # typed settings + risk presets
│   ├── seed.ts            # admin + markets + strategies + VIP packages
│   └── strategies.ts      # 100+ strategy registry
└── migrations/0001_init.sql  # full PostgreSQL schema (atomic position lock)
```

## Two independent run modes

- **Preview / Convex:** run from the repository root with `bun convex dev --once` and `bun run dev`. This preserves the Convex functions and the full preview experience.
- **Server / REST:** build the frontend with `VITE_BACKEND=rest`, run `server/dist/api.js` plus `server/dist/worker.js`, and use PostgreSQL/Redis. No Convex deployment is required for this mode.

For Docker, set `POSTGRES_PASSWORD` in `.env`. Compose uses that value for both the PostgreSQL container and the API/worker connection URL; the host-only `DATABASE_URL` is intentionally overridden inside the containers.

## Commands (production)

```bash
install      # see VPS_FA.md steps 1-8 (node, bun, docker, clone, env)
build        # VITE_BACKEND=rest bun run build
             # cd server && bun install --frozen-lockfile && bun run build
             # Docker Compose uses oven/bun and the repository lockfile for frontend build
migrate      # for f in server/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
seed         # cd server && bun run seed  (or npm run seed)
start        # docker compose -f deploy/docker-compose.yml up -d --build
             # first boot is HTTP-only and works on a raw IP; configure HTTPS later
stop         # docker compose -f deploy/docker-compose.yml down
restart      # docker compose -f deploy/docker-compose.yml restart api worker
logs         # docker compose -f deploy/docker-compose.yml logs -f api worker
backup       # bash deploy/backup.sh            → backup/wolf-YYYYMMDD-HHMM.sql.gz
restore      # bash deploy/restore.sh backup/<file>.sql.gz
health       # curl https://your.domain/health
```

PM2 variant: `pm2 start deploy/ecosystem.config.cjs`, `pm2 status`,
`pm2 restart wolf-api wolf-worker`, `pm2 logs`, `pm2 stop all`.

## Environment

See [deploy/env.example](../deploy/env.example). Secrets live only in `.env`
and the Admin panel — never in the repo.

## Health endpoint

`GET /health` returns:

```json
{ "ok": true, "app": "Trading Wolf AI", "time": 0, "db": true, "redis": true, "engine": true }
```

`engine: true` means the worker heartbeat is younger than 3 minutes. If it is false, inspect `docker compose -f deploy/docker-compose.yml logs worker` or `pm2 logs wolf-worker`; Telegram delivery failures do not stop the trading API, but require valid bot credentials.
