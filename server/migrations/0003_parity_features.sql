-- ─────────────────────────────────────────────────────────────────────────────
-- 0003_parity_features.sql — feature-parity columns (idempotent)
--   · users.signal_unlocks   — paid signal-detail unlocks (wolf coins)
--   · wallets.frozen / frozen_since — USDT committed to the engine, with a
--     release request flow (unfreeze after wallet.withdrawMinDays)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS signal_unlocks TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE wallets
    ADD COLUMN IF NOT EXISTS frozen        NUMERIC(24,8) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS frozen_since  BIGINT;

CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets (user_id);