-- ─────────────────────────────────────────────────────────────────────────────
-- Trading Wolf AI — PostgreSQL schema v1 (production)
-- Mirrors the Convex schema 1:1. Applied automatically on first boot by
-- docker-compose (docker-entrypoint-initdb.d) or manually:
--     psql "$DATABASE_URL" -f server/migrations/0001_init.sql
--
-- CRITICAL TRADING RULE enforced at the DATABASE level:
--     UNIQUE INDEX ON open_positions (symbol)
-- Even if two engine workers produce a signal for the same symbol at the same
-- time, only ONE position can ever be inserted. Long+Short on one symbol is
-- therefore impossible.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ── users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username           TEXT UNIQUE,
    password_salt      TEXT,                 -- argon2id salt (or null for telegram-only users)
    password_hash      TEXT,                 -- argon2id hash — never plain text
    name               TEXT,
    image              TEXT,
    email              TEXT UNIQUE,
    role               TEXT NOT NULL DEFAULT 'user',  -- admin | assistant | vip | user
    is_admin           BOOLEAN NOT NULL DEFAULT false,
    is_assistant       BOOLEAN NOT NULL DEFAULT false,
    is_vip             BOOLEAN NOT NULL DEFAULT false,
    vip_package        TEXT,
    vip_expires_at     BIGINT,
    enabled            BOOLEAN NOT NULL DEFAULT true,
    can_trade          BOOLEAN NOT NULL DEFAULT true,
    tg_id              BIGINT UNIQUE,
    tg_username        TEXT,
    tg_language        TEXT,
    first_name         TEXT,
    last_name          TEXT,
    phone              TEXT,
    phone_verified     BOOLEAN NOT NULL DEFAULT false,
    channel_verified   BOOLEAN NOT NULL DEFAULT false,
    language           TEXT NOT NULL DEFAULT 'fa',
    theme              TEXT NOT NULL DEFAULT 'dark',
    notifications_enabled BOOLEAN NOT NULL DEFAULT true,
    wallet_address     TEXT,
    registered_at      BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
    last_activity      BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_tg ON users (tg_id);

-- ── sessions (revocable, hashed tokens) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS wolf_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,          -- sha256 of the raw token
    source      TEXT NOT NULL DEFAULT 'password',  -- password | telegram | mini_app
    expires_at  BIGINT NOT NULL,
    created_at  BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON wolf_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON wolf_sessions (expires_at);

-- ── wallets ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    owner           TEXT NOT NULL,             -- user id or 'system'
    asset           TEXT NOT NULL DEFAULT 'USDT',
    network         TEXT NOT NULL DEFAULT 'TRC20',
    balance         NUMERIC(24,8) NOT NULL DEFAULT 0,
    deposit_address TEXT,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallets_owner ON wallets (owner);

-- ── wallet transactions (ledger — every balance change goes through here) ──
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id   UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    type        TEXT NOT NULL,                 -- credit | debit | deposit | withdrawal | fee
    asset       TEXT NOT NULL,
    amount      NUMERIC(24,8) NOT NULL,
    network     TEXT,
    txid        TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | failed
    ref         TEXT,
    note        TEXT,
    created_at  BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_wtx_wallet ON wallet_transactions (wallet_id);
CREATE INDEX IF NOT EXISTS idx_wtx_status ON wallet_transactions (status);

-- ── wallet addresses (multi-network deposit addresses, admin-managed) ──────
CREATE TABLE IF NOT EXISTS wallet_addresses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset       TEXT NOT NULL,
    network     TEXT NOT NULL,
    address     TEXT NOT NULL,
    memo        TEXT,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    created_at  BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
    UNIQUE (asset, network)
);

-- ── exchange accounts (secrets encrypted at rest, AES-256-GCM) ─────────────
CREATE TABLE IF NOT EXISTS exchange_accounts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    provider       TEXT NOT NULL,              -- bingx | binance | lbank | mt5 | okx | ...
    api_key_enc    TEXT NOT NULL,              -- encrypted
    api_secret_enc TEXT NOT NULL,              -- encrypted
    pass_phrase_enc TEXT,
    account_id     TEXT,
    environment    TEXT NOT NULL DEFAULT 'demo',  -- demo | live
    enabled        BOOLEAN NOT NULL DEFAULT false,
    status         TEXT NOT NULL DEFAULT 'untested', -- untested | ok | error | offline
    last_test      BIGINT,
    last_error     TEXT,
    balance        NUMERIC(24,8),
    created_at     BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
    updated_at     BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

-- ── markets ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS markets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol      TEXT NOT NULL UNIQUE,          -- BTCUSDT, EURUSD, XAUUSD ...
    name_en     TEXT NOT NULL,
    name_fa     TEXT NOT NULL,
    market      TEXT NOT NULL,                 -- crypto | forex
    base        TEXT NOT NULL,
    quote       TEXT NOT NULL,
    digits      INT NOT NULL DEFAULT 2,
    min_qty     NUMERIC(24,8) NOT NULL DEFAULT 0.0001,
    precision   INT NOT NULL DEFAULT 2,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    priority    INT NOT NULL DEFAULT 100,
    network     TEXT,                          -- crypto asset network: BTC | ETH | SOL | TRC20 | BSC
    type        TEXT DEFAULT 'futures',        -- spot | futures (default trade type)
    spot_enabled   BOOLEAN NOT NULL DEFAULT true,
    futures_enabled BOOLEAN NOT NULL DEFAULT true,
    last_price  NUMERIC(24,8),
    prev_close  NUMERIC(24,8),
    change_24h  NUMERIC(12,4),
    updated_at  BIGINT
);
CREATE INDEX IF NOT EXISTS idx_markets_market ON markets (market, enabled, priority);

-- ── candles (real market data in live mode; demo generator only in demo) ───
CREATE TABLE IF NOT EXISTS candles (
    id         BIGSERIAL PRIMARY KEY,
    symbol     TEXT NOT NULL REFERENCES markets(symbol) ON DELETE CASCADE,
    timeframe  TEXT NOT NULL,                  -- 1m 5m 15m 30m 1h 4h 1d
    t          BIGINT NOT NULL,                -- open time (ms)
    o NUMERIC(24,8) NOT NULL,
    h NUMERIC(24,8) NOT NULL,
    l NUMERIC(24,8) NOT NULL,
    c NUMERIC(24,8) NOT NULL,
    v NUMERIC(24,8) NOT NULL DEFAULT 0,
    UNIQUE (symbol, timeframe, t)
);
CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles (symbol, timeframe, t DESC);

-- ── strategies (100+ real strategies) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS strategies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key             TEXT NOT NULL UNIQUE,
    family          TEXT,                      -- deterministic evaluator family
    name            TEXT NOT NULL,
    name_fa         TEXT NOT NULL,
    category        TEXT NOT NULL,
    category_fa     TEXT NOT NULL,
    description_fa  TEXT,
    description_en  TEXT,
    market          TEXT NOT NULL DEFAULT 'all',  -- all | crypto | forex
    timeframes      TEXT[] NOT NULL DEFAULT '{}',
    entry_rules     TEXT[] NOT NULL DEFAULT '{}',
    exit_rules      TEXT[] NOT NULL DEFAULT '{}',
    sl_rules        TEXT[] NOT NULL DEFAULT '{}',
    tp_rules        TEXT[] NOT NULL DEFAULT '{}',
    rr              NUMERIC(8,2) NOT NULL DEFAULT 2,
    params          JSONB NOT NULL DEFAULT '{}',
    enabled         BOOLEAN NOT NULL DEFAULT true,
    weight          NUMERIC(8,2) NOT NULL DEFAULT 1,
    baseline_score  NUMERIC(8,2) NOT NULL DEFAULT 50,
    confidence      NUMERIC(8,4) NOT NULL DEFAULT 0.5,
    version         TEXT NOT NULL DEFAULT '1.0',
    engine_enabled  BOOLEAN NOT NULL DEFAULT true,
    overlay         TEXT[] NOT NULL DEFAULT '{}',
    source          TEXT NOT NULL DEFAULT 'wolf-core',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_strategies_cat ON strategies (category);

-- ── strategy performance (aggregated from closed trades) ───────────────────
CREATE TABLE IF NOT EXISTS strategy_performance (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_key    TEXT NOT NULL REFERENCES strategies(key) ON DELETE CASCADE,
    market          TEXT,
    timeframe       TEXT,
    regime          TEXT,
    trades          INT NOT NULL DEFAULT 0,
    wins            INT NOT NULL DEFAULT 0,
    losses          INT NOT NULL DEFAULT 0,
    win_rate        NUMERIC(6,2) NOT NULL DEFAULT 0,
    profit_factor   NUMERIC(10,2) NOT NULL DEFAULT 0,
    avg_pnl         NUMERIC(24,8) NOT NULL DEFAULT 0,
    avg_rr          NUMERIC(10,4) NOT NULL DEFAULT 0,
    max_drawdown    NUMERIC(24,8) NOT NULL DEFAULT 0,
    total_pnl       NUMERIC(24,8) NOT NULL DEFAULT 0,
    updated_at      BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
    UNIQUE (strategy_key)
);

-- ── signals ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol        TEXT NOT NULL,
    timeframe     TEXT NOT NULL,
    direction     TEXT NOT NULL,               -- long | short
    entry         NUMERIC(24,8) NOT NULL,
    stop_loss     NUMERIC(24,8) NOT NULL,
    take_profit   NUMERIC(24,8) NOT NULL,
    targets       NUMERIC(24,8)[] NOT NULL DEFAULT '{}',
    rr            NUMERIC(10,4) NOT NULL DEFAULT 0,
    score         NUMERIC(8,2) NOT NULL,
    confidence    NUMERIC(8,4) NOT NULL DEFAULT 0,
    strategy_keys TEXT[] NOT NULL DEFAULT '{}',
    aggregate     JSONB NOT NULL DEFAULT '{}',
    reasons_fa    TEXT[] NOT NULL DEFAULT '{}',
    reasons_en    TEXT[] NOT NULL DEFAULT '{}',
    price         NUMERIC(24,8) NOT NULL,
    mode          TEXT NOT NULL DEFAULT 'demo',  -- demo | live
    status        TEXT NOT NULL DEFAULT 'open',  -- open | filled | expired | rejected
    position_id   UUID,
    created_at    BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
    expires_at    BIGINT
);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals (status, created_at DESC);

-- ── open positions ──────────────────────────────────────────────────────────
-- ⚠ CRITICAL: UNIQUE(symbol) — one position per symbol, any direction.
CREATE TABLE IF NOT EXISTS open_positions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol           TEXT NOT NULL UNIQUE,     -- ← the atomic lock
    market           TEXT NOT NULL,            -- crypto | forex
    side             TEXT NOT NULL,            -- long | short
    entry            NUMERIC(24,8) NOT NULL,
    current          NUMERIC(24,8) NOT NULL,
    quantity         NUMERIC(24,8) NOT NULL,
    size             NUMERIC(24,8) NOT NULL,   -- position size USD
    leverage         NUMERIC(8,2) NOT NULL DEFAULT 1,
    margin           NUMERIC(24,8) NOT NULL,
    pnl              NUMERIC(24,8) NOT NULL DEFAULT 0,
    pnl_pct          NUMERIC(12,4) NOT NULL DEFAULT 0,
    score            NUMERIC(8,2) NOT NULL DEFAULT 0,
    confidence       NUMERIC(8,4) NOT NULL DEFAULT 0,
    strategy_keys    TEXT[] NOT NULL DEFAULT '{}',
    exchange         TEXT NOT NULL DEFAULT 'paper',
    fee              NUMERIC(24,8) NOT NULL DEFAULT 0,
    stop_loss        NUMERIC(24,8) NOT NULL,
    take_profit      NUMERIC(24,8) NOT NULL,
    liquidation      NUMERIC(24,8),
    targets          NUMERIC(24,8)[] NOT NULL DEFAULT '{}',
    expected_exit    NUMERIC(24,8),
    expected_profit  NUMERIC(24,8),
    expected_duration INT,                     -- minutes
    progress         NUMERIC(6,2) NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'open',
    open_time        BIGINT NOT NULL,
    last_analysis    BIGINT NOT NULL,
    last_update      BIGINT NOT NULL,
    mode             TEXT NOT NULL DEFAULT 'demo',  -- demo | live
    source           TEXT NOT NULL DEFAULT 'engine', -- engine | manual | bot
    type             TEXT NOT NULL DEFAULT 'futures', -- spot | futures
    network          TEXT,
    dca_count        INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── closed positions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS closed_positions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol           TEXT NOT NULL,
    market           TEXT NOT NULL,
    side             TEXT NOT NULL,
    entry            NUMERIC(24,8) NOT NULL,
    current          NUMERIC(24,8) NOT NULL,
    close_price      NUMERIC(24,8) NOT NULL,
    close_time       BIGINT NOT NULL,
    close_reason     TEXT NOT NULL,            -- take_profit | stop_loss | manual | reanalysis | exchange | emergency_close_all | duplicate_symbol
    quantity         NUMERIC(24,8) NOT NULL,
    size             NUMERIC(24,8) NOT NULL,
    leverage         NUMERIC(8,2) NOT NULL DEFAULT 1,
    margin           NUMERIC(24,8) NOT NULL,
    pnl              NUMERIC(24,8) NOT NULL DEFAULT 0,
    profit           NUMERIC(24,8) NOT NULL DEFAULT 0,  -- realized pnl
    pnl_pct          NUMERIC(12,4) NOT NULL DEFAULT 0,
    score            NUMERIC(8,2) NOT NULL DEFAULT 0,
    confidence       NUMERIC(8,4) NOT NULL DEFAULT 0,
    strategy_keys    TEXT[] NOT NULL DEFAULT '{}',
    exchange         TEXT NOT NULL DEFAULT 'paper',
    fee              NUMERIC(24,8) NOT NULL DEFAULT 0,
    stop_loss        NUMERIC(24,8) NOT NULL,
    take_profit      NUMERIC(24,8) NOT NULL,
    targets          NUMERIC(24,8)[] NOT NULL DEFAULT '{}',
    rr               NUMERIC(10,4) NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'closed',
    open_time        BIGINT NOT NULL,
    mode             TEXT NOT NULL DEFAULT 'demo',
    type             TEXT NOT NULL DEFAULT 'futures',
    error            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_closed_time ON closed_positions (close_time DESC);
CREATE INDEX IF NOT EXISTS idx_closed_symbol ON closed_positions (symbol);

-- ── orders (execution log with idempotency) ────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key    TEXT UNIQUE,            -- duplicate-order prevention
    exchange           TEXT NOT NULL,
    symbol             TEXT NOT NULL,
    side               TEXT NOT NULL,          -- buy | sell
    type               TEXT NOT NULL DEFAULT 'market', -- market | limit
    price              NUMERIC(24,8),
    qty                NUMERIC(24,8) NOT NULL,
    leverage           NUMERIC(8,2) NOT NULL DEFAULT 1,
    mode               TEXT NOT NULL DEFAULT 'demo',
    status             TEXT NOT NULL DEFAULT 'new', -- new | filled | rejected | cancelled
    validated          BOOLEAN NOT NULL DEFAULT false,
    validation_message TEXT,
    position_id        UUID,
    ref                TEXT,
    created_at         BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);

-- ── trade analysis (engine view per position) ──────────────────────────────
CREATE TABLE IF NOT EXISTS trade_analysis (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    position_id     UUID NOT NULL REFERENCES open_positions(id) ON DELETE CASCADE,
    symbol          TEXT NOT NULL,
    side            TEXT NOT NULL,
    structure       TEXT,
    trend           TEXT,
    momentum        TEXT,
    volume          TEXT,
    support         NUMERIC(24,8),
    resistance      NUMERIC(24,8),
    liquidity       TEXT,
    order_blocks    JSONB NOT NULL DEFAULT '[]',
    fvg             JSONB NOT NULL DEFAULT '[]',
    bos             BOOLEAN NOT NULL DEFAULT false,
    choch           BOOLEAN NOT NULL DEFAULT false,
    mss             BOOLEAN NOT NULL DEFAULT false,
    supply_demand   JSONB NOT NULL DEFAULT '[]',
    entry           NUMERIC(24,8) NOT NULL,
    stop_loss       NUMERIC(24,8) NOT NULL,
    take_profit     NUMERIC(24,8) NOT NULL,
    targets         NUMERIC(24,8)[] NOT NULL DEFAULT '{}',
    rr              NUMERIC(10,4) NOT NULL DEFAULT 0,
    expected_duration INT,
    confidence      NUMERIC(8,4) NOT NULL DEFAULT 0,
    fees            NUMERIC(24,8) NOT NULL DEFAULT 0,
    position_size   NUMERIC(24,8) NOT NULL DEFAULT 0,
    margin          NUMERIC(24,8) NOT NULL DEFAULT 0,
    leverage        NUMERIC(8,2) NOT NULL DEFAULT 1,
    entry_reason_fa TEXT,
    entry_reason_en TEXT,
    created_at      BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

-- ── learning history ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol      TEXT NOT NULL,
    timeframe   TEXT NOT NULL,
    strategies  TEXT[] NOT NULL DEFAULT '{}',
    scores      JSONB NOT NULL DEFAULT '{}',
    snapshot    TEXT,
    signal      TEXT,
    decision    TEXT,
    result      TEXT,                          -- win | loss | neutral | monitor | open
    pnl         NUMERIC(24,8),
    error       TEXT,
    ai_review   TEXT,
    lessons     TEXT[] NOT NULL DEFAULT '{}',
    created_at  BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_learning_time ON learning_history (created_at DESC);

-- ── AI analysis + providers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_analysis (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind        TEXT NOT NULL,                 -- signal | report | review | summary | regime
    key         TEXT NOT NULL,
    provider    TEXT NOT NULL,
    model       TEXT,
    prompt      TEXT,
    text        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'done',  -- done | error
    error       TEXT,
    created_at  BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_ai_kind ON ai_analysis (kind, created_at DESC);

-- AI providers: multi-provider gateway with priority/limits (keys encrypted)
CREATE TABLE IF NOT EXISTS ai_providers (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider       TEXT NOT NULL,              -- gemini | openai | anthropic | openrouter | ollama
    model          TEXT NOT NULL,
    api_key_enc    TEXT,                       -- encrypted (null for ollama/local)
    base_url       TEXT,
    priority       INT NOT NULL DEFAULT 100,
    enabled        BOOLEAN NOT NULL DEFAULT true,
    purpose        TEXT NOT NULL DEFAULT 'general',  -- general | review | learning | report
    rate_limit     INT NOT NULL DEFAULT 30,    -- requests per minute
    daily_limit    INT NOT NULL DEFAULT 500,   -- requests per day
    used_today     INT NOT NULL DEFAULT 0,
    usage_errors   INT NOT NULL DEFAULT 0,
    usage_latency_ms INT NOT NULL DEFAULT 0,
    last_used_at   BIGINT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── notifications ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    broadcast   BOOLEAN NOT NULL DEFAULT false,
    type        TEXT NOT NULL,                 -- trade | signal | system | vip | wallet | support | ai | security
    title_fa    TEXT NOT NULL,
    text_fa     TEXT,
    title_en    TEXT,
    text_en     TEXT,
    seen        BOOLEAN NOT NULL DEFAULT false,
    tg_sent     BOOLEAN NOT NULL DEFAULT false,
    created_at  BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id, created_at DESC);

-- ── telegram messages + channels ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_messages (
    id          BIGSERIAL PRIMARY KEY,
    chat_id     TEXT NOT NULL,
    message_id  BIGINT,
    direction   TEXT NOT NULL,                 -- in | out
    type        TEXT NOT NULL,
    text        TEXT,
    status      TEXT NOT NULL DEFAULT 'sent',  -- sent | failed | received
    error       TEXT,
    created_at  BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_tgm_chat ON telegram_messages (chat_id, created_at DESC);

CREATE TABLE IF NOT EXISTS channels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id  TEXT NOT NULL UNIQUE,
    title       TEXT,
    username    TEXT,
    invite_link TEXT,
    required    BOOLEAN NOT NULL DEFAULT true,
    enabled     BOOLEAN NOT NULL DEFAULT true
);

-- ── support system ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject        TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'open',  -- open | pending | answered | closed
    priority       TEXT NOT NULL DEFAULT 'normal', -- low | normal | high
    last_activity  BIGINT NOT NULL,
    created_at     BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    from_admin  BOOLEAN NOT NULL DEFAULT false,
    text        TEXT NOT NULL,
    created_at  BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_tm_ticket ON support_messages (ticket_id, created_at);

-- ── referrals ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code           TEXT NOT NULL UNIQUE,
    referrer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    status         TEXT NOT NULL DEFAULT 'active',  -- active | completed
    reward_enabled BOOLEAN NOT NULL DEFAULT false,  -- reward engine off until enabled
    reward_amount  NUMERIC(24,8),
    created_at     BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_ref_referrer ON referrals (referrer_id);

-- ── VIP ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vip_packages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key             TEXT NOT NULL UNIQUE,      -- bronze | silver | gold
    name            TEXT NOT NULL,
    name_fa         TEXT NOT NULL,
    price           NUMERIC(24,8) NOT NULL,    -- USDT
    duration_days   INT NOT NULL,
    min_capital     NUMERIC(24,8) NOT NULL,
    max_capital     NUMERIC(24,8) NOT NULL,
    features        TEXT[] NOT NULL DEFAULT '{}',
    features_fa     TEXT[] NOT NULL DEFAULT '{}',
    risk_disclosure TEXT NOT NULL,
    terms           TEXT NOT NULL,
    status          BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS vip_requests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name    TEXT,
    package_key  TEXT NOT NULL,
    capital      NUMERIC(24,8) NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    review       TEXT,
    review_at    BIGINT,
    reviewed_by  TEXT,
    created_at   BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_vipreq_status ON vip_requests (status);

CREATE TABLE IF NOT EXISTS vip_contracts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    package_key           TEXT NOT NULL,
    capital               NUMERIC(24,8) NOT NULL,
    fee                   NUMERIC(24,8) NOT NULL DEFAULT 0,
    duration_days         INT NOT NULL,
    withdrawal_rules      TEXT,
    loss_responsibility   TEXT,
    no_guaranteed_return  TEXT,
    terms                 TEXT,
    contract_version      TEXT NOT NULL DEFAULT '1.0',
    ip                    TEXT,
    accepted_at           BIGINT,
    status                TEXT NOT NULL DEFAULT 'active',  -- active | completed | cancelled
    created_at            BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_vipc_user ON vip_contracts (user_id);

-- ── system settings + engine state ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
    key          TEXT PRIMARY KEY,             -- "telegram.token", "risk.minScore", ...
    value        JSONB NOT NULL,
    group_name   TEXT NOT NULL DEFAULT 'system',
    description  TEXT,
    updated_at   BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
    updated_by   TEXT
);

CREATE TABLE IF NOT EXISTS engine_state (
    key         TEXT PRIMARY KEY,              -- heartbeat | status | last_scan | queue
    value       JSONB NOT NULL,
    updated_at  BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

-- ── engine logs + audit logs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS engine_logs (
    id         BIGSERIAL PRIMARY KEY,
    level      TEXT NOT NULL DEFAULT 'INFO',   -- INFO WARNING ERROR CRITICAL TRADE AI SECURITY
    message    TEXT NOT NULL,
    meta       TEXT,
    source     TEXT NOT NULL DEFAULT 'engine', -- engine | bot | api | ai | system
    created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_enginelogs_time ON engine_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
    id         BIGSERIAL PRIMARY KEY,
    action     TEXT NOT NULL,
    actor      TEXT,
    actor_id   TEXT,
    target     TEXT,
    details    TEXT,
    ip         TEXT,
    created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs (created_at DESC);

-- ── login attempts (brute-force protection) ────────────────────────────────
CREATE TABLE IF NOT EXISTS login_attempts (
    id         BIGSERIAL PRIMARY KEY,
    key        TEXT NOT NULL,                  -- username | tgId | ip
    kind       TEXT NOT NULL,                  -- password | telegram | admin
    success    BOOLEAN NOT NULL DEFAULT false,
    created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE INDEX IF NOT EXISTS idx_login_key ON login_attempts (key, created_at DESC);
