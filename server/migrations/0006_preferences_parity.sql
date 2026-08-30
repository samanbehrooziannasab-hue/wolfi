-- ─────────────────────────────────────────────────────────────────────────────
-- 0006_preferences_parity.sql — user-profile & learning parity (idempotent)
--   · users.first_name / last_name / gender / birthday   — profile fields
--   · users.default_timeframe / default_market           — UI preferences
--   · users.notifications_enabled                        — per-user notifications
--   · users.last_coin_check                              — wolf-coin idle burn
--   · users.trial_claimed                                — one-time free VIP trial
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS first_name          TEXT,
    ADD COLUMN IF NOT EXISTS last_name           TEXT,
    ADD COLUMN IF NOT EXISTS gender              TEXT,
    ADD COLUMN IF NOT EXISTS birthday            TEXT,
    ADD COLUMN IF NOT EXISTS default_timeframe   TEXT,
    ADD COLUMN IF NOT EXISTS default_market      TEXT,
    ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS last_coin_check     BIGINT,
    ADD COLUMN IF NOT EXISTS trial_claimed       BOOLEAN NOT NULL DEFAULT false;
