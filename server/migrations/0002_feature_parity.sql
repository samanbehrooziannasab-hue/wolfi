-- Trading Wolf AI — REST feature-parity additions.
-- Idempotent: safe to run after 0001 on an existing VPS.

ALTER TABLE users ADD COLUMN IF NOT EXISTS wolf_coins NUMERIC(24,8) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_reward_claimed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_reward_claimed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_provider TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_model TEXT;

CREATE TABLE IF NOT EXISTS coin_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency TEXT NOT NULL CHECK (currency IN ('toman', 'wolf')),
    delta NUMERIC(24,8) NOT NULL,
    balance_after NUMERIC(24,8),
    reason TEXT NOT NULL,
    ref TEXT,
    created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_coin_user_time ON coin_transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS voucher_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    coins NUMERIC(24,8) NOT NULL,
    max_uses INT NOT NULL DEFAULT 1,
    used_count INT NOT NULL DEFAULT 0,
    used_by UUID[] NOT NULL DEFAULT '{}',
    created_by TEXT,
    status BOOLEAN NOT NULL DEFAULT true,
    created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_voucher_code ON voucher_codes (code);

CREATE TABLE IF NOT EXISTS demo_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    direction TEXT CHECK (direction IN ('long', 'short')),
    outcome TEXT NOT NULL CHECK (outcome IN ('long', 'short')),
    reward NUMERIC(24,8) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost')),
    candles JSONB NOT NULL DEFAULT '[]',
    created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_prediction_user ON demo_predictions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS education (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title_fa TEXT NOT NULL,
    title_en TEXT NOT NULL,
    body_fa TEXT NOT NULL,
    body_en TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'admin',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    day TEXT,
    created_by TEXT,
    decided_by TEXT,
    decided_at BIGINT,
    note TEXT,
    sent_fa_at BIGINT,
    sent_en_at BIGINT,
    image TEXT,
    audio TEXT,
    created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_education_status ON education (status, created_at DESC);
