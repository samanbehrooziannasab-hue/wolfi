// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — seed (bootstrap data)
//   bun run seed
// Inserts: admin user, 40 curated markets (20 crypto USDT + 20 forex/metals),
// 100+ strategies, 3 VIP packages, settings defaults, wallet addresses.
// Idempotent — safe to run multiple times.
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from "./db.js";
import { hashPassword } from "./auth.js";
import { DEFAULT_SETTINGS, RISK_PRESETS } from "./settings.js";
import { strategyDefs } from "./strategies.js";
import { config } from "./config.js";

const CRYPTO: [string, string, string, string, string, string][] = [
  // symbol, name_en, name_fa, base, network, type
  ["BTCUSDT", "Bitcoin", "بیت‌کوین", "BTC", "BTC", "futures"],
  ["ETHUSDT", "Ethereum", "اتریوم", "ETH", "ETH", "futures"],
  ["BNBUSDT", "BNB", "بی‌ان‌بی", "BNB", "BSC", "futures"],
  ["SOLUSDT", "Solana", "سولانا", "SOL", "SOL", "futures"],
  ["XRPUSDT", "XRP", "ریپل", "XRP", "XRP", "futures"],
  ["ADAUSDT", "Cardano", "کاردانو", "ADA", "ADA", "futures"],
  ["DOGEUSDT", "Dogecoin", "داوج‌کوین", "DOGE", "DOGE", "futures"],
  ["TONUSDT", "Toncoin", "تون‌کوین", "TON", "TON", "futures"],
  ["AVAXUSDT", "Avalanche", "آوالانچ", "AVAX", "AVAX", "futures"],
  ["LINKUSDT", "Chainlink", "چین‌لینک", "LINK", "LINK", "futures"],
  ["DOTUSDT", "Polkadot", "پولکادات", "DOT", "DOT", "futures"],
  ["TRXUSDT", "TRON", "ترون", "TRX", "TRC20", "futures"],
  ["LTCUSDT", "Litecoin", "لایت‌کوین", "LTC", "LTC", "futures"],
  ["NEARUSDT", "NEAR Protocol", "نیر", "NEAR", "NEAR", "futures"],
  ["APTUSDT", "Aptos", "اپتوس", "APT", "APT", "futures"],
  ["ARBUSDT", "Arbitrum", "آربیتروم", "ARB", "ARB", "futures"],
  ["SUIUSDT", "Sui", "سویی", "SUI", "SUI", "futures"],
  ["UNIUSDT", "Uniswap", "یونی‌سواپ", "UNI", "ETH", "futures"],
  ["PEPEUSDT", "Pepe", "پپه", "PEPE", "ETH", "futures"],
  ["SHIBUSDT", "Shiba Inu", "شیبا", "SHIB", "ETH", "futures"],
];

const FOREX: [string, string, string, string, string, string, number][] = [
  // symbol, name_en, name_fa, base, quote, type, digits
  ["EURUSD", "Euro / US Dollar", "یورو / دلار", "EUR", "USD", "futures", 5],
  ["GBPUSD", "Pound / US Dollar", "پوند / دلار", "GBP", "USD", "futures", 5],
  ["USDJPY", "US Dollar / Yen", "دلار / ین", "USD", "JPY", "futures", 3],
  ["USDCHF", "US Dollar / Franc", "دلار / فرانک", "USD", "CHF", "futures", 5],
  ["AUDUSD", "Aussie / US Dollar", "استرالیا / دلار", "AUD", "USD", "futures", 5],
  ["USDCAD", "US Dollar / Loonie", "دلار / کانادا", "USD", "CAD", "futures", 5],
  ["NZDUSD", "Kiwi / US Dollar", "نیوزیلند / دلار", "NZD", "USD", "futures", 5],
  ["EURGBP", "Euro / Pound", "یورو / پوند", "EUR", "GBP", "futures", 5],
  ["EURJPY", "Euro / Yen", "یورو / ین", "EUR", "JPY", "futures", 3],
  ["GBPJPY", "Pound / Yen", "پوند / ین", "GBP", "JPY", "futures", 3],
  ["EURCHF", "Euro / Franc", "یورو / فرانک", "EUR", "CHF", "futures", 5],
  ["AUDJPY", "Aussie / Yen", "استرالیا / ین", "AUD", "JPY", "futures", 3],
  ["CADJPY", "Loonie / Yen", "کانادا / ین", "CAD", "JPY", "futures", 3],
  ["CHFJPY", "Franc / Yen", "فرانک / ین", "CHF", "JPY", "futures", 3],
  ["AUDNZD", "Aussie / Kiwi", "استرالیا / نیوزیلند", "AUD", "NZD", "futures", 5],
  ["EURCAD", "Euro / Loonie", "یورو / کانادا", "EUR", "CAD", "futures", 5],
  ["EURNZD", "Euro / Kiwi", "یورو / نیوزیلند", "EUR", "NZD", "futures", 5],
  ["GBPAUD", "Pound / Aussie", "پوند / استرالیا", "GBP", "AUD", "futures", 5],
  ["XAUUSD", "Gold", "طلا", "XAU", "USD", "futures", 2],
  ["XAGUSD", "Silver", "نقره", "XAG", "USD", "futures", 3],
];

const VIP_PACKAGES = [
  {
    key: "bronze",
    name: "Basic",
    name_fa: "برنزی",
    price: 30,
    duration_days: 30,
    min_capital: 30,
    max_capital: 150,
    features: ["دسترسی داشبورد", "اعلان معاملات", "پشتیبانی معمولی"],
    features_fa: ["دسترسی داشبورد", "اعلان معاملات", "پشتیبانی معمولی"],
    risk_disclosure: "بازارهای مالی پرریسک‌اند؛ سود تضمینی وجود ندارد و ممکن است اصل سرمایه کاهش یابد.",
    terms: "اشتراک ۳۰ روزه. مبلغ اشتراک برگشت داده نمی‌شود.",
    status: true,
  },
  {
    key: "silver",
    name: "Professional",
    name_fa: "نقره‌ای",
    price: 75,
    duration_days: 30,
    min_capital: 150,
    max_capital: 500,
    features: ["همه امکانات برنزی", "تحلیل هوش مصنوعی", "سیگنال‌های اولویت‌دار", "پشتیبانی اولویت‌دار"],
    features_fa: ["همه امکانات برنزی", "تحلیل هوش مصنوعی", "سیگنال‌های اولویت‌دار", "پشتیبانی اولویت‌دار"],
    risk_disclosure: "بازارهای مالی پرریسک‌اند؛ سود تضمینی وجود ندارد و ممکن است اصل سرمایه کاهش یابد.",
    terms: "اشتراک ۳۰ روزه. مبلغ اشتراک برگشت داده نمی‌شود.",
    status: true,
  },
  {
    key: "gold",
    name: "Elite",
    name_fa: "طلایی",
    price: 150,
    duration_days: 30,
    min_capital: 500,
    max_capital: 5000,
    features: ["همه امکانات نقره‌ای", "سرمایه‌گذاری اختصاصی", "مدیر حساب", "گزارش‌های روزانه", "پشتیبانی ۲۴/۷"],
    features_fa: ["همه امکانات نقره‌ای", "سرمایه‌گذاری اختصاصی", "مدیر حساب", "گزارش‌های روزانه", "پشتیبانی ۲۴/۷"],
    risk_disclosure: "بازارهای مالی پرریسک‌اند؛ سود تضمینی وجود ندارد و ممکن است اصل سرمایه کاهش یابد.",
    terms: "اشتراک ۳۰ روزه. مبلغ اشتراک برگشت داده نمی‌شود.",
    status: true,
  },
];

export async function seed(): Promise<void> {
  // ── admin user ─────────────────────────────────────────────────────────────
  const adminUser = process.env.ADMIN_USERNAME || "wolfadmin";
  const adminPass = process.env.ADMIN_PASSWORD || "Wolf3010!";
  const adminHash = await hashPassword(adminPass);
  // Repair policy for an EXISTING admin row:
  //  - always fix the flags (an early seed wrote is_assistant=true — the
  //    "admin shows up as assistant" bug — and could leave the role broken);
  //  - restore the default password ONLY when the row is unusable (no hash)
  //    or still carries that old-seed bug flag. A password the admin changed
  //    deliberately is never clobbered by a routine `update.sh` re-seed.
  await pool.query(
    `INSERT INTO users (username, password_hash, name, role, is_admin, is_assistant, is_vip, can_trade, language, theme)
     VALUES ($1, $2, 'Trading Wolf Admin', 'admin', true, false, true, true, 'fa', 'dark')
     ON CONFLICT (username) DO UPDATE SET
       name = EXCLUDED.name, is_admin = true, is_assistant = false, is_vip = true,
       enabled = true, can_trade = true, role = 'admin', language = EXCLUDED.language, theme = EXCLUDED.theme,
       password_hash = CASE
         WHEN users.password_hash IS NULL OR users.is_assistant = true
           THEN EXCLUDED.password_hash
         ELSE users.password_hash
       END`,
    [adminUser, adminHash]
  );
  console.log(`✔ admin user: ${adminUser}`);

  // ── markets ────────────────────────────────────────────────────────────────
  let mi = 1;
  for (const [sym, en, fa, base, network, type] of CRYPTO) {
    await pool.query(
      `INSERT INTO markets (symbol, name_en, name_fa, market, base, quote, digits, priority, network, type, enabled)
       VALUES ($1,$2,$3,'crypto',$4,'USDT',6,$5,$6,$7,true)
       ON CONFLICT (symbol) DO UPDATE SET name_en = EXCLUDED.name_en, name_fa = EXCLUDED.name_fa,
         base = EXCLUDED.base, network = EXCLUDED.network, type = EXCLUDED.type, enabled = true`,
      [sym, en, fa, base, mi, network, type]
    );
    mi++;
  }
  for (const [sym, en, fa, base, quote, type, digits] of FOREX) {
    await pool.query(
      `INSERT INTO markets (symbol, name_en, name_fa, market, base, quote, digits, priority, network, type, enabled)
       VALUES ($1,$2,$3,'forex',$4,$5,$6,$7,'NET',$8,true)
       ON CONFLICT (symbol) DO UPDATE SET name_en = EXCLUDED.name_en, name_fa = EXCLUDED.name_fa,
         base = EXCLUDED.base, quote = EXCLUDED.quote, type = EXCLUDED.type, enabled = true`,
      [sym, en, fa, base, quote, digits, mi, type]
    );
    mi++;
  }
  console.log(`✔ markets: ${CRYPTO.length} crypto + ${FOREX.length} forex/metals`);

  // ── REST server currently has crypto adapters only; keep every forex row disabled.
  // This runs after the upserts so a later seed/update cannot re-enable invalid feeds.
  await pool.query("UPDATE markets SET enabled = false WHERE market = 'forex'");
  console.log("✔ forex/metals disabled — no compatible REST market-data provider configured");

  // ── strategies ─────────────────────────────────────────────────────────────
  let si = 0;
  for (const st of strategyDefs()) {
    await pool.query(
      `INSERT INTO strategies (key, family, name, name_fa, category, category_fa, market, timeframes, weight, baseline_score, confidence, overlay, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0.5,$11,'wolf-server')
       ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, name_fa = EXCLUDED.name_fa,
         category = EXCLUDED.category, category_fa = EXCLUDED.category_fa,
         market = EXCLUDED.market, timeframes = EXCLUDED.timeframes,
         weight = EXCLUDED.weight, baseline_score = EXCLUDED.baseline_score,
         engine_enabled = true, enabled = true`,
      [
        st.key, st.category.split("_")[0], st.name, st.name_fa, st.category, st.category_fa,
        st.market, st.timeframes, st.weight, st.baseline, st.overlay,
      ]
    );
    si++;
  }
  console.log(`✔ strategies: ${si}`);

  // ── VIP packages ───────────────────────────────────────────────────────────
  for (const p of VIP_PACKAGES) {
    await pool.query(
      `INSERT INTO vip_packages (key, name, name_fa, price, duration_days, min_capital, max_capital, features, features_fa, risk_disclosure, terms, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (key) DO UPDATE SET price = EXCLUDED.price, duration_days = EXCLUDED.duration_days,
         min_capital = EXCLUDED.min_capital, max_capital = EXCLUDED.max_capital,
         features = EXCLUDED.features, features_fa = EXCLUDED.features_fa,
         risk_disclosure = EXCLUDED.risk_disclosure, terms = EXCLUDED.terms, status = EXCLUDED.status`,
      [p.key, p.name, p.name_fa, p.price, p.duration_days, p.min_capital, p.max_capital,
        p.features, p.features_fa, p.risk_disclosure, p.terms, p.status]
    );
  }
  console.log(`✔ vip packages: ${VIP_PACKAGES.length}`);

  // ── settings defaults ──────────────────────────────────────────────────────
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    const group = k.split(".")[0];
    await pool.query(
      `INSERT INTO system_settings (key, value, group_name) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO NOTHING`,
      [k, JSON.stringify(v), group]
    );
  }
  for (const [k, v] of Object.entries(RISK_PRESETS.balanced)) {
    await pool.query(
      `INSERT INTO system_settings (key, value, group_name) VALUES ($1, $2, 'risk')
       ON CONFLICT (key) DO NOTHING`,
      [k, JSON.stringify(v)]
    );
  }
  console.log("✔ settings defaults");

  // ── wallet addresses (bootstrap deposit addresses) ─────────────────────────
  const addrs: [string, string][] = [
    ["USDT", "TRC20"],
    ["USDT", "ERC20"],
    ["USDT", "BEP20"],
    ["USDT", "SOL"],
    ["BTC", "BTC"],
    ["ETH", "ETH"],
  ];
  for (const [asset, network] of addrs) {
    await pool.query(
      `INSERT INTO wallet_addresses (asset, network, address, enabled)
       VALUES ($1, $2, '', false)
       ON CONFLICT (asset, network) DO NOTHING`,
      [asset, network]
    );
  }
  console.log("✔ wallet address templates");

  console.log(`\nSeeding complete. Admin: ${adminUser} — change the password from the panel after first login.`);
  await pool.end();
}

// run directly: npm run seed  /  node dist/seed.js
const entry = process.argv[1] ?? "";
if (entry.endsWith("seed.ts") || entry.endsWith("seed.js") || process.env.SEED_RUN) {
  seed().catch((e) => {
    console.error("seed failed:", e);
    process.exit(1);
  });
}
