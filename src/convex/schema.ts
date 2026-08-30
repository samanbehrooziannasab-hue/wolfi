import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// ─── Roles ───────────────────────────────────────────────────────────────
export const ROLES = {
  ADMIN: "admin",
  VIP: "vip",
  USER: "user",
  ASSISTANT: "assistant", // دستیار ادمین با دسترسی محدود
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.VIP),
  v.literal(ROLES.USER),
  v.literal(ROLES.ASSISTANT),
);
export type Role = Infer<typeof roleValidator>;

// ─── Shared position payload (open & closed share the same shape) ────────
export const positionFields = {
  symbol: v.string(),
  symbolFa: v.optional(v.string()),
  market: v.union(v.literal("forex"), v.literal("crypto")),
  side: v.union(v.literal("long"), v.literal("short")),
  entry: v.number(),
  current: v.number(),
  quantity: v.number(),
  size: v.number(), // position size in USD
  leverage: v.number(),
  margin: v.number(),
  pnl: v.number(),
  pnlPct: v.number(),
  score: v.number(),
  confidence: v.number(), // 0..1
  strategyKeys: v.array(v.string()),
  exchange: v.string(),
  fee: v.number(),
  stopLoss: v.number(),
  takeProfit: v.number(),
  liquidation: v.optional(v.number()),
  network: v.optional(v.string()),
  note: v.optional(v.string()),
  type: v.optional(v.union(v.literal("spot"), v.literal("futures"))),
  targets: v.array(v.number()), // up to 3 targets
  expectedExit: v.optional(v.number()),
  expectedProfit: v.optional(v.number()),
  expectedDuration: v.optional(v.number()), // minutes
  progress: v.number(), // 0..100
  status: v.string(),
  openTime: v.number(),
  lastAnalysis: v.number(),
  lastUpdate: v.number(),
  mode: v.union(v.literal("demo"), v.literal("live")),
  source: v.string(), // engine | manual | bot
  exchangeScale: v.optional(v.number()), // engine↔exchange capital equivalence factor at open time
};

const schema = defineSchema({
  // default auth tables using convex auth
  ...authTables,

  // ─── Users (extended: telegram + admin + vip) ─────────────────────────
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(roleValidator),

    // admin / password auth
    username: v.optional(v.string()),
    passwordSalt: v.optional(v.string()),
    passwordHash: v.optional(v.string()),

    // telegram profile
    tgId: v.optional(v.number()),
    tgUsername: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerified: v.optional(v.boolean()),
    channelVerified: v.optional(v.boolean()),
    language: v.optional(v.string()), // "fa" | "en"
    tgLanguage: v.optional(v.string()),
    pendingReplyTicketId: v.optional(v.string()), // admin bot: ticket being replied to

    // permissions
    enabled: v.optional(v.boolean()),
    isVip: v.optional(v.boolean()),
    vipPackage: v.optional(v.string()),
    vipExpiresAt: v.optional(v.number()),
    canTrade: v.optional(v.boolean()),
    isAdmin: v.optional(v.boolean()),
    isAssistant: v.optional(v.boolean()),

    type: v.optional(v.union(v.literal("spot"), v.literal("futures"))), // per-position trade type
    network: v.optional(v.string()), // BTC | ETH | SOL | BSC for crypto positions

    // preferences
    theme: v.optional(v.string()),
    defaultTimeframe: v.optional(v.string()),
    defaultMarket: v.optional(v.string()),
    notificationsEnabled: v.optional(v.boolean()),
    // per-user AI preference (provider/model used for their WOLF AI chats)
    aiProvider: v.optional(v.string()),
    aiModel: v.optional(v.string()),

    // extended profile (user-editable)
    gender: v.optional(v.string()),
    birthday: v.optional(v.string()),

    // toman (IRT) wallet + wolf coins (gamified economy)
    tomanBalance: v.optional(v.number()),
    wolfCoins: v.optional(v.number()),
    lastCoinCheck: v.optional(v.number()),
    profileRewardClaimed: v.optional(v.boolean()),

    // referral: code captured from the bot's /start?ref= link
    pendingReferralCode: v.optional(v.string()),
    // signal detail unlocks the user has paid for (signal ids) — re-viewable for free
    signalUnlocks: v.optional(v.array(v.string())),
    referralRewarded: v.optional(v.boolean()),
    // telegram-connect reward (linking an existing account to Telegram)
    telegramRewardClaimed: v.optional(v.boolean()),
    // one-time Telegram confirmation required before withdrawals
    withdrawTgVerifiedAt: v.optional(v.number()),

    // meta
    walletAddress: v.optional(v.string()),
    registeredAt: v.optional(v.number()),
    lastActivity: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("by_username", ["username"])
    .index("by_tgId", ["tgId"])
    .index("by_role", ["role"]),

  // ─── Wolf sessions (Telegram / admin tokens, revocable) ─────────────
  // NOTE: deliberately NOT named authSessions — that name belongs to the
  // Convex Auth library's own table (spread via authTables above), and
  // overriding it breaks session creation in the auth library.
  wolfSessions: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    source: v.string(),
    created: v.number(),
  }).index("by_token", ["tokenHash"]),

  // ─── wallets ──────────────────────────────────────────────────────────
  wallets: defineTable({
    userId: v.optional(v.id("users")),
    owner: v.string(), // user id or "system"
    asset: v.string(), // USDT / BTC ...
    network: v.string(),
    balance: v.number(),
    frozen: v.optional(v.number()), // USDT committed to the engine (deposit → engine)
    frozenSince: v.optional(v.number()), // oldest freeze time — gates early withdrawals
    depositAddress: v.optional(v.string()),
    enabled: v.boolean(),
  }).index("by_owner", ["owner"]),

  walletTransactions: defineTable({
    walletId: v.id("wallets"),
    userId: v.optional(v.id("users")),
    type: v.string(), // credit | debit | deposit | withdrawal | fee
    asset: v.string(),
    amount: v.number(),
    network: v.optional(v.string()),
    txid: v.optional(v.string()),
    status: v.string(), // pending | confirmed | failed
    ref: v.optional(v.string()),
    note: v.optional(v.string()),
    created: v.number(),
  }).index("by_wallet", ["walletId"]),

  walletAddresses: defineTable({
    asset: v.string(),
    network: v.string(),
    address: v.string(),
    memo: v.optional(v.string()),
    kind: v.optional(v.string()), // deposit | withdraw
    enabled: v.boolean(),
    created: v.number(),
  }),

  // ─── exchange accounts (secrets encrypted at rest) ────────────────────
  exchangeAccounts: defineTable({
    name: v.string(),
    provider: v.string(), // bingx | lbank | mt5 | binance | ...
    apiKeyEnc: v.string(),
    apiSecretEnc: v.string(),
    passPhraseEnc: v.optional(v.string()),
    accountId: v.optional(v.string()),
    environment: v.union(v.literal("demo"), v.literal("live")),
    enabled: v.boolean(),
    testMode: v.optional(v.boolean()),
    status: v.string(), // untested | ok | error | offline
    lastTest: v.optional(v.number()),
    lastError: v.optional(v.string()),
    balance: v.optional(v.number()),
    created: v.number(),
    updated: v.number(),
  }),

  // ─── markets / symbols ────────────────────────────────────────────────
  markets: defineTable({
    symbol: v.string(), // EURUSD, BTCUSDT ...
    nameEn: v.string(),
    nameFa: v.string(),
    market: v.union(v.literal("forex"), v.literal("crypto")),
    base: v.string(),
    quote: v.string(),
    digits: v.number(),
    minQty: v.number(),
    precision: v.number(),
    enabled: v.boolean(),
    priority: v.number(),
    network: v.optional(v.string()), // BTC | ETH | SOL | BSC | TRC20 for crypto
    type: v.optional(v.union(v.literal("spot"), v.literal("futures"))), // default trade type
    lastPrice: v.optional(v.number()),
    prevClose: v.optional(v.number()),
    change24h: v.optional(v.number()),
    volume24h: v.optional(v.number()),
    spark: v.optional(v.array(v.number())),
    updated: v.optional(v.number()),
    lastSynced: v.optional(v.number()), // real-market sync timestamp
  }).index("by_symbol", ["symbol"]),

  candles: defineTable({
    symbol: v.string(),
    timeframe: v.string(), // 1m | 5m | 15m | 30m | 1h | 4h | 1d
    data: v.array(
      v.object({
        t: v.number(),
        o: v.number(),
        h: v.number(),
        l: v.number(),
        c: v.number(),
        v: v.number(),
      }),
    ),
    updatedAt: v.number(),
  })
    .index("by_symbol", ["symbol"])
    .index("by_symbol_tf", ["symbol", "timeframe"]),

  // ─── strategies ───────────────────────────────────────────────────────
  strategies: defineTable({
    key: v.string(),
    family: v.optional(v.string()), // maps to the deterministic evaluator family
    name: v.string(),
    nameFa: v.string(),
    category: v.string(),
    categoryFa: v.string(),
    descriptionFa: v.string(),
    descriptionEn: v.string(),
    market: v.string(), // all | forex | crypto
    timeframes: v.array(v.string()),
    entryRules: v.array(v.string()),
    exitRules: v.array(v.string()),
    slRules: v.array(v.string()),
    tpRules: v.array(v.string()),
    rr: v.number(),
    params: v.any(), // engine tuning object
    enabled: v.boolean(),
    weight: v.number(),
    baselineScore: v.number(),
    confidence: v.number(),
    version: v.string(),
    engineEnabled: v.boolean(),
    overlay: v.array(v.string()), // chart overlays it can draw
    source: v.string(), // "wolf-core" | "user"
  }).index("by_category", ["category"]),

  // ─── signals (engine output, aggregated multi-TF) ─────────────────────
  signals: defineTable({
    symbol: v.string(),
    timeframe: v.string(),
    direction: v.union(v.literal("long"), v.literal("short")),
    entry: v.number(),
    stopLoss: v.number(),
    takeProfit: v.number(),
    targets: v.array(v.number()),
    rr: v.number(),
    score: v.number(),
    confidence: v.number(),
    strategyKeys: v.array(v.string()),
    aggregate: v.any(),
    reasonsFa: v.array(v.string()),
    reasonsEn: v.array(v.string()),
    price: v.number(),
    mode: v.union(v.literal("demo"), v.literal("live")),
    status: v.string(), // open | filled | expired | rejected
    positionId: v.optional(v.id("open_positions")),
    sentFaAt: v.optional(v.number()), // manually posted to the Persian channel
    sentEnAt: v.optional(v.number()), // manually posted to the English channel
    created: v.number(),
    expires: v.number(),
  }).index("status", ["status"]),

  // ─── positions ────────────────────────────────────────────────────────
  open_positions: defineTable({
    ...positionFields,
  }).index("symbol", ["symbol"]),

  closed_positions: defineTable({
    ...positionFields,
    closePrice: v.number(),
    closeTime: v.number(),
    closeReason: v.string(), // take_profit | stop_loss | manual | reanalysis | exchange
    profit: v.number(),
    error: v.optional(v.string()),
  }).index("by_time", ["closeTime"]),

  orders: defineTable({
    exchange: v.string(),
    symbol: v.string(),
    side: v.string(), // buy | sell
    type: v.string(), // market | limit
    price: v.optional(v.number()),
    qty: v.number(),
    leverage: v.number(),
    mode: v.union(v.literal("demo"), v.literal("live")),
    status: v.string(), // new | filled | rejected | cancelled
    validated: v.boolean(),
    validationMessage: v.optional(v.string()),
    positionId: v.optional(v.id("open_positions")),
    ref: v.optional(v.string()),
    created: v.number(),
  }),

  trade_analysis: defineTable({
    positionId: v.id("open_positions"),
    symbol: v.string(),
    side: v.string(),
    structure: v.string(),
    trend: v.string(),
    momentum: v.string(),
    volume: v.string(),
    support: v.number(),
    resistance: v.number(),
    liquidity: v.string(),
    orderBlocks: v.array(v.object({ price: v.number(), side: v.string() })),
    fvg: v.array(v.object({ top: v.number(), bottom: v.number() })),
    bos: v.boolean(),
    choch: v.boolean(),
    mss: v.boolean(),
    supplyDemand: v.array(v.object({ price: v.number(), kind: v.string() })),
    entry: v.number(),
    stopLoss: v.number(),
    takeProfit: v.number(),
    targets: v.array(v.number()),
    rr: v.number(),
    expectedDuration: v.number(),
    confidence: v.number(),
    fees: v.number(),
    positionSize: v.number(),
    margin: v.number(),
    leverage: v.number(),
    entryReasonFa: v.string(),
    entryReasonEn: v.string(),
    created: v.number(),
  }),

  learningHistory: defineTable({
    symbol: v.string(),
    timeframe: v.string(),
    strategies: v.array(v.string()),
    scores: v.any(),
    snapshot: v.optional(v.string()),
    signal: v.string(),
    decision: v.string(),
    result: v.string(), // win | loss | neutral | monitor | open
    pnl: v.optional(v.number()),
    error: v.optional(v.string()),
    aiReview: v.optional(v.string()),
    lessons: v.optional(v.array(v.string())),
    created: v.number(),
  }).index("by_time", ["created"]),

  ai_analysis: defineTable({
    kind: v.string(), // signal | report | review | summary | regime
    key: v.string(),
    provider: v.string(),
    model: v.optional(v.string()),
    prompt: v.optional(v.string()),
    text: v.string(),
    status: v.union(v.literal("done"), v.literal("error"), v.literal("running")),
    error: v.optional(v.string()),
    created: v.number(),
  }).index("by_kind", ["kind"]),

  notifications: defineTable({
    userId: v.optional(v.id("users")),
    broadcast: v.optional(v.boolean()),
    type: v.string(), // trade | signal | system | admin | ai | announcement
    titleFa: v.string(),
    textFa: v.optional(v.string()),
    titleEn: v.optional(v.string()),
    textEn: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
    dismissedBy: v.optional(v.array(v.id("users"))),
    seen: v.boolean(),
    seenAt: v.optional(v.number()),
    tgSent: v.optional(v.boolean()),
    created: v.number(),
  }),

  telegram_messages: defineTable({
    chatId: v.string(),
    messageId: v.optional(v.number()),
    direction: v.string(), // in | out
    type: v.string(),
    text: v.optional(v.string()),
    status: v.string(), // sent | failed | received
    error: v.optional(v.string()),
    created: v.number(),
  }).index("by_chat", ["chatId"]),

  channels: defineTable({
    channelId: v.string(),
    title: v.optional(v.string()),
    username: v.optional(v.string()),
    inviteLink: v.optional(v.string()),
    required: v.boolean(),
    enabled: v.boolean(),
  }),

  systemSettings: defineTable({
    key: v.string(),
    value: v.any(),
    group: v.string(),
    description: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  }).index("by_key", ["key"]),

  auditLogs: defineTable({
    action: v.string(),
    actor: v.optional(v.string()),
    actorId: v.optional(v.string()),
    target: v.optional(v.string()),
    details: v.optional(v.string()),
    ip: v.optional(v.string()),
    created: v.number(),
  }).index("by_time", ["created"]),

  engineLogs: defineTable({
    level: v.union(
      v.literal("INFO"),
      v.literal("WARNING"),
      v.literal("ERROR"),
      v.literal("CRITICAL"),
      v.literal("TRADE"),
      v.literal("AI"),
      v.literal("SECURITY"),
    ),
    message: v.string(),
    meta: v.optional(v.string()),
    created: v.number(),
    source: v.string(), // engine | bot | api | ai | system
  }).index("by_time", ["created"]),

  vipPackages: defineTable({
    key: v.string(),
    name: v.string(),
    nameFa: v.string(),
    price: v.number(),
    durationDays: v.number(),
    minCapital: v.number(),
    maxCapital: v.number(),
    features: v.array(v.string()),
    featuresFa: v.array(v.string()),
    riskDisclosure: v.string(),
    terms: v.string(),
    status: v.boolean(),
    discountPercent: v.optional(v.number()), // % off the listed price
    giftCoins: v.optional(v.number()), // wolf coins gifted with this package
  }),

  vipRequests: defineTable({
    userId: v.id("users"),
    userName: v.optional(v.string()),
    packageKey: v.string(),
    capital: v.number(),
    status: v.string(), // pending | approved | rejected
    review: v.optional(v.string()),
    reviewAt: v.optional(v.number()),
    reviewedBy: v.optional(v.string()),
    created: v.number(),
  }).index("by_status", ["status"]),

  vipContracts: defineTable({
    userId: v.id("users"),
    packageKey: v.string(),
    capital: v.number(),
    fee: v.number(),
    durationDays: v.number(),
    withdrawalRules: v.string(),
    lossResponsibility: v.string(),
    noGuaranteedReturn: v.string(),
    terms: v.string(),
    status: v.string(), // active | completed | cancelled
    created: v.number(),
  }).index("by_user", ["userId"]),

  // ─── support tickets + messages ──────────────────────────────────────
  supportTickets: defineTable({
    userId: v.id("users"),
    subject: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("pending"),
      v.literal("answered"),
      v.literal("closed"),
    ),
    priority: v.optional(v.union(v.literal("low"), v.literal("normal"), v.literal("high"))),
    // Telegram bot fields (optional — set when ticket originates from bot)
    chatId: v.optional(v.string()),
    tgId: v.optional(v.number()),
    userName: v.optional(v.string()),
    userLang: v.optional(v.string()),
    messages: v.optional(v.array(v.any())),
    lastReply: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    lastActivity: v.number(),
    created: v.number(),
  }).index("by_user", ["userId"]),

  supportMessages: defineTable({
    ticketId: v.id("supportTickets"),
    userId: v.optional(v.id("users")),
    fromAdmin: v.boolean(),
    text: v.string(),
    imageUrl: v.optional(v.string()),
    created: v.number(),
  }).index("by_ticket", ["ticketId"]),

  // ─── referrals ───────────────────────────────────────────────────────
  referrals: defineTable({
    code: v.string(),
    referrerId: v.id("users"),
    referredId: v.optional(v.id("users")),
    status: v.string(), // active | completed
    rewardEnabled: v.boolean(), // reward engine stays off until enabled by admin
    rewardAmount: v.optional(v.number()),
    created: v.number(),
  }).index("by_code", ["code"]),

  // ─── engine state (heartbeat / watchdog) ─────────────────────────────
  engineState: defineTable({
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // ─── login attempts (brute-force protection) ─────────────────────────
  loginAttempts: defineTable({
    key: v.string(), // username | tgId | ip
    kind: v.string(), // password | telegram | admin
    success: v.boolean(),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  // ─── strategy performance stats (from learning history + closed trades) ─
  strategyPerformance: defineTable({
    strategyKey: v.string(),
    market: v.optional(v.string()),
    timeframe: v.optional(v.string()),
    regime: v.optional(v.string()),
    trades: v.number(),
    wins: v.number(),
    losses: v.number(),
    winRate: v.number(),
    profitFactor: v.number(),
    avgPnl: v.number(),
    avgRR: v.number(),
    maxDrawdown: v.number(),
    totalPnl: v.number(),
    updatedAt: v.number(),
  }).index("by_strategy", ["strategyKey"]),

  // ─── toman / wolf-coin ledger (every mutation is recorded) ────────────
  coinTransactions: defineTable({
    userId: v.id("users"),
    currency: v.union(v.literal("toman"), v.literal("wolf"), v.literal("usdt")),
    delta: v.number(), // + credit / - debit
    balanceAfter: v.optional(v.number()),
    reason: v.string(), // deposit | withdrawal | voucher | buy_coins | burn | reward | admin | discount | vip_purchase
    ref: v.optional(v.string()),
    rate: v.optional(v.number()),
    created: v.number(),
  }).index("by_user", ["userId"]),

  // ─── gift/voucher codes (created by admin, redeemed for wolf coins) ───
  voucherCodes: defineTable({
    code: v.string(),
    coins: v.number(),
    maxUses: v.number(),
    usedCount: v.number(),
    usedBy: v.array(v.id("users")),
    createdBy: v.optional(v.string()),
    status: v.boolean(),
    created: v.number(),
  }).index("by_code", ["code"]),

  // ─── discount / promo codes (separate from coin vouchers: VIP % / amount off or VIP days) ───
  discountCodes: defineTable({
    code: v.string(),
    titleFa: v.optional(v.string()),
    discountPercent: v.optional(v.number()), // e.g. 20 (20% off)
    discountAmount: v.optional(v.number()), // e.g. 10 USDT discount
    vipDaysGift: v.optional(v.number()), // e.g. 3 days VIP added
    maxUses: v.number(),
    usedCount: v.number(),
    usedBy: v.array(v.id("users")),
    expiresAt: v.optional(v.number()),
    status: v.boolean(),
    createdBy: v.optional(v.string()),
    created: v.number(),
  }).index("by_code", ["code"]),

  // ─── fundamental news & sentiment analysis ───────────────────────────
  fundamentalNews: defineTable({
    titleFa: v.string(),
    titleEn: v.string(),
    summaryFa: v.string(),
    summaryEn: v.string(),
    sentiment: v.union(v.literal("bullish"), v.literal("bearish"), v.literal("neutral")),
    impact: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
    category: v.string(), // crypto | forex | macro | fed
    symbol: v.optional(v.string()),
    source: v.string(),
    imageUrl: v.optional(v.string()),
    sentTgFaAt: v.optional(v.number()),
    sentTgEnAt: v.optional(v.number()),
    created: v.number(),
  }).index("by_time", ["created"]),

  // ─── gamified education: guess the next candle (demo) ─────────────────
  demoPredictions: defineTable({
    userId: v.id("users"),
    symbol: v.string(),
    direction: v.optional(v.union(v.literal("long"), v.literal("short"))),
    outcome: v.union(v.literal("long"), v.literal("short")),
    reward: v.number(),
    status: v.union(v.literal("pending"), v.literal("won"), v.literal("lost")),
    candles: v.any(), // demo candle series shown to the user (outcome candle hidden)
    created: v.number(),
  }).index("by_user", ["userId"]),

  // ─── daily education (auto-generated lessons, admin-approved) ────────
  education: defineTable({
    titleFa: v.string(),
    titleEn: v.string(),
    bodyFa: v.string(),
    bodyEn: v.string(),
    source: v.union(v.literal("user"), v.literal("bot"), v.literal("ai"), v.literal("engine"), v.literal("admin")),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    day: v.optional(v.string()), // YYYY-MM-DD dedup key
    createdBy: v.optional(v.string()),
    decidedBy: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    note: v.optional(v.string()),
    sentFaAt: v.optional(v.number()), // posted to the Persian channel
    sentEnAt: v.optional(v.number()), // posted to the English channel
    image: v.optional(v.string()), // base64 PNG generated with the lesson
    audio: v.optional(v.string()), // base64 MP3 (TTS) for the lesson
    created: v.number(),
  }).index("by_status", ["status"]),
});

export default schema;