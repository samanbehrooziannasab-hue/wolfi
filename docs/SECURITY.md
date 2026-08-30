# 🔐 Security

## Principles

1. **No secrets in the frontend.** Exchange/AI/Telegram keys are stored
   encrypted at rest (AES-256-GCM with `ENCRYPTION_KEY`) and only decrypted
   server-side. The API returns masked values (`abcd…wxyz`).
2. **No plain-text passwords.** argon2id with per-user salt.
3. **No secrets in git.** `.env` is gitignored; `deploy/env.example` contains
   placeholders only.
4. **Least privilege.** Users see only their own data; engine capital,
   virtual capital, exchange balances and internal logs are admin-only.

## Authentication & sessions

- Sessions are random 64-hex tokens; only their SHA-256 hash is stored in
  `wolf_sessions` (revocable, 7-day expiry).
- Brute-force lockout: after 6 failed attempts the account/username is locked
  for 15 minutes (`login_attempts` + Redis rate limits).
- RBAC: `admin` / `assistant` / `vip` / `user` — every admin route is guarded
  by `requireAdmin`.
- Telegram Mini App auth uses `verifyInitData` (HMAC-SHA256 over
  `WebAppData` + bot token, per Telegram docs). `tg_id` from the client is
  **never trusted** — it is derived from the verified initData.

## Financial integrity

- Every balance mutation runs inside a PostgreSQL transaction and every
  deposit/withdrawal goes through `wallet_transactions` (the ledger).
- Withdrawals are admin-approved; failed withdrawals return funds.
- Exchange keys should be created with **read/trade only** — never grant
  withdrawal permissions.

## Trading integrity (engine-level)

- **One open position per symbol** enforced by a UNIQUE index
  (`open_positions.symbol`) + `pg_advisory_xact_lock` — not just UI logic.
- Long+Short on the same symbol is impossible by construction.
- No AI-only trading: AI is advisory (reports/reviews/education). The final
  decision is the deterministic engine + risk checks.
- Live trading is off by default; activation requires the admin confirmation
  phrase and is recorded in `audit_logs`.
- Stale/missing market data → NO TRADE. Exchange outage → that exchange only
  is skipped; the engine keeps running.

## Server hardening

- HTTPS via Let's Encrypt; nginx redirects HTTP → HTTPS (see `deploy/nginx.conf`).
- Firewall: only 22/80/443 open; PostgreSQL (5432) and Redis (6379) bind to
  127.0.0.1 only.
- Webhook secret token checked on `/telegram/webhook` (403 otherwise).
- Input sanitization (`clean()` strips `< >`), parameterized SQL everywhere
  (no string-built queries), audit logs for every sensitive action.

## Audit coverage

Login, logout, password change, user create/update, VIP review, wallet
transactions, exchange/AI key changes, settings changes, risk presets,
emergency stop, pause, close-all, engine mode switches, notifications,
support replies — all recorded in `audit_logs`; engine events in
`engine_logs`.

## Checklist before going live

- [ ] Change the admin password from the panel.
- [ ] Regenerate `APP_SECRET` and `ENCRYPTION_KEY` (`openssl rand -hex 32`).
- [ ] Run paper mode for a while; review engine logs.
- [ ] Enable live trading only with the confirmation phrase.
- [ ] Configure daily backups (`deploy/backup.sh` via cron).
- [ ] Keep exchange keys read/trade-only (no withdrawal permission).
