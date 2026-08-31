// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — AI learning loop & parity helpers (REST)
//   · AI learning supervisor (aiReviewLearning) — bounded auto-tuning of the
//     engine gates from recent results + per-strategy performance
//   · AI strategy suggestions (suggestStrategies)
//   · Education channel send + media regeneration (pollinations image)
//   · User preferences, free VIP trial, wolf-coin idle burn, chat pruning
//   · Public (landing) settings + admin user detail
// All AI output is advisory: it never places orders and never changes the
// deterministic evaluator at runtime — only bounded risk gates / weights.
// ─────────────────────────────────────────────────────────────────────────────
import { pool, one, many, audit, logEngine, type Row } from "./db.js";
import { getSettings, getSetting, setSetting } from "./settings.js";
import { aiAsk, aiAskJson } from "./ai.js";
import { now, num, clean } from "./util.js";
import { sendMessage, sendPhoto, sendAudio } from "./telegram.js";

// ── public / landing settings (no auth) ────────────────────────────────────
export async function publicSettingsData(): Promise<Record<string, unknown>> {
  const s = await getSettings();
  return {
    email: s["support.email"] ?? "",
    telegramBot: s["support.telegramBot"] ?? "",
    vipFreeTrial: s["vip.freeTrial"] !== false,
    coinsEnabled: s["coins.enabled"] !== false,
    depositEnabled: s["wallet.depositEnabled"] !== false,
    withdrawEnabled: s["wallet.withdrawEnabled"] !== false,
    aiEnabled: s["ai.enabled"] !== false,
    engineMode: s["engine.mode"] ?? "demo",
    appName: process.env.APP_NAME ?? "Trading Wolf AI",
  };
}

// ── user preferences (updatePreferences parity) ─────────────────────────────
const PREF_COLUMNS: Record<string, { col: string; max: number }> = {
  theme: { col: "theme", max: 10 },
  language: { col: "language", max: 2 },
  defaultTimeframe: { col: "default_timeframe", max: 10 },
  defaultMarket: { col: "default_market", max: 20 },
  phone: { col: "phone", max: 30 },
  name: { col: "name", max: 120 },
  firstName: { col: "first_name", max: 120 },
  lastName: { col: "last_name", max: 120 },
  gender: { col: "gender", max: 20 },
  birthday: { col: "birthday", max: 20 },
};

export async function updateUserPreferences(
  userId: string,
  body: Record<string, unknown>
): Promise<string[]> {
  const sets: string[] = [];
  const vals: unknown[] = [userId];
  const changed: string[] = [];
  for (const [k, spec] of Object.entries(PREF_COLUMNS)) {
    if (body[k] === undefined) continue;
    const raw = String(body[k]).trim().slice(0, spec.max);
    if (k === "phone" && raw.length > 3 && !/^[0-9+\-() ]+$/.test(raw)) {
      throw new Error("شماره تماس معتبر نیست.");
    }
    sets.push(`${spec.col} = $${vals.length + 1}`);
    vals.push(raw);
    changed.push(k);
  }
  if (body.notificationsEnabled !== undefined) {
    sets.push(`notifications_enabled = $${vals.length + 1}`);
    vals.push(!!body.notificationsEnabled);
    changed.push("notificationsEnabled");
  }
  if (sets.length === 0) throw new Error("هیچ فیلدی ارسال نشد.");
  await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $1`, vals);
  return changed;
}

// ── per-user AI preference (setAiPreference parity) ─────────────────────────
export async function setUserAiPreference(
  userId: string,
  provider: string,
  model?: string
): Promise<void> {
  const p = clean(provider, 40);
  if (!p) throw new Error("پروایدر نامعتبر است.");
  await pool.query(
    `UPDATE users SET ai_provider = $2, ai_model = COALESCE(NULLIF($3, ''), ai_model) WHERE id = $1`,
    [userId, p, model ? clean(model, 80) : null]
  );
}

// ── one-time free VIP trial (grantFreeTrial parity) ─────────────────────────
export async function grantFreeTrial(
  userId: string,
  username: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const s = await getSettings();
  if (s["vip.freeTrial"] === false) return { ok: false, reason: "disabled" };
  const u = await one<Row>("SELECT vip_package, trial_claimed, is_vip FROM users WHERE id = $1", [userId]);
  if (!u) return { ok: false, reason: "not_found" };
  if (u.trial_claimed || u.is_vip || u.vip_package) return { ok: false, reason: "already_has_package" };
  const hours = Math.max(1, Number(s["vip.trialHours"] ?? 48) || 48);
  await pool.query(
    `UPDATE users SET is_vip = true, vip_package = 'trial', vip_expires_at = $2, trial_claimed = true WHERE id = $1`,
    [userId, now() + hours * 3600_000]
  );
  await audit("vip.trial.granted", username ?? userId, userId, "user", { hours });
  await logEngine("INFO", `vip.trial.granted user=${userId} hours=${hours}`, null, "system");
  return { ok: true };
}

// ── wolf-coin idle burn (burnCoins parity — runs on login + manual) ─────────
export async function burnWolfCoins(userId: string): Promise<{ burned: number; coins: number }> {
  const s = await getSettings();
  if (s["coins.enabled"] === false) return { burned: 0, coins: 0 };
  const rate = Math.max(0, Number(s["coins.coinPerHour"] ?? 60) || 60);
  if (rate <= 0) return { burned: 0, coins: 0 };
  const u = await one<Row>(
    "SELECT wolf_coins, last_coin_check FROM users WHERE id = $1 FOR UPDATE",
    [userId]
  );
  if (!u) return { burned: 0, coins: 0 };
  const t = now();
  const last = u.last_coin_check ? num(u.last_coin_check) : t;
  const hours = Math.min(24, Math.max(0, Math.floor((t - last) / 3600_000)));
  if (hours <= 0) {
    await pool.query("UPDATE users SET last_coin_check = $2 WHERE id = $1", [userId, t]);
    return { burned: 0, coins: num(u.wolf_coins) };
  }
  const toBurn = Math.min(num(u.wolf_coins), hours * rate);
  if (toBurn > 0) {
    const after = num(u.wolf_coins) - toBurn;
    await pool.query("UPDATE users SET wolf_coins = $2, last_coin_check = $3 WHERE id = $1", [userId, after, t]);
    await pool.query(
      `INSERT INTO coin_transactions (user_id, currency, delta, balance_after, reason, created_at)
       VALUES ($1, 'wolf', $2, $3, 'usage', $4)`,
      [userId, -toBurn, after, t]
    );
  } else {
    await pool.query("UPDATE users SET last_coin_check = $2 WHERE id = $1", [userId, t]);
  }
  return { burned: toBurn, coins: num(u.wolf_coins) - toBurn };
}

// ── AI chat pruning (pruneChatHistory parity — user-scoped) ─────────────────
export async function pruneOwnChat(userId: string): Promise<number> {
  const r = await pool.query(
    `DELETE FROM ai_analysis WHERE kind = 'chat' AND key LIKE $1 RETURNING id`,
    [`chat:${userId}:%`]
  );
  return r.rowCount ?? 0;
}

// ── learning tuning context (learningTuningContext parity) ──────────────────
export async function tuningContext(): Promise<any> {
  const s = await getSettings();
  const perf = await many(
    `SELECT strategy_key, trades, wins, win_rate, total_pnl FROM strategy_performance
      ORDER BY total_pnl DESC LIMIT 15`
  );
  const weekAgo = now() - 7 * 86400_000;
  const closed = await many(
    `SELECT symbol, side, strategies, pnl, result, created_at FROM learning_history
      WHERE created_at > $1 ORDER BY created_at DESC LIMIT 60`,
    [weekAgo]
  );
  const known = await many<Row>("SELECT key FROM strategies");
  return {
    current: {
      minScore: Number(s["risk.minScore"] ?? 35),
      minConfidence: Number(s["risk.minConfidence"] ?? 0.5),
      minConsensus: Number(s["risk.minConsensus"] ?? 0.55),
      minConfirmations: Number(s["risk.minConfirmations"] ?? 3),
      minRR: Number(s["risk.minRR"] ?? 1.0),
    },
    autoApply: String(s["learning.autoApply"] ?? "") === "true",
    perf: perf.map((r: any) => ({
      key: r.strategy_key, trades: r.trades, wins: r.wins,
      winRate: r.win_rate, totalPnl: r.total_pnl,
    })),
    closed: closed.map((p: any) => ({
      symbol: p.symbol, side: p.side, strategies: p.strategies ?? [],
      profit: String(p.pnl ?? 0).slice(0, 12), reason: p.result,
    })),
    knownKeys: known.map((r) => r.key),
  };
}

const TUNING_BOUNDS: Record<string, [number, number, number]> = {
  "risk.minScore": [20, 50, 1],
  "risk.minConfidence": [0.4, 0.65, 0.05],
  "risk.minConsensus": [0.4, 0.6, 0.05],
  "risk.minConfirmations": [2, 4, 1],
  "risk.minRR": [0.8, 1.5, 0.1],
};

/** AI review of the engine's learning (6h cadence). Bounded auto-apply. */
export async function aiReviewLearning(): Promise<any> {
  try {
    const hours = Math.max(1, Number((await getSetting<number>("ai.learningReviewHours", 6)) ?? 6) || 6);
    const last = await getSetting<number>("ai.lastLearningReviewAt", 0);
    if (last && now() - Number(last) < hours * 3600_000) {
      return { ok: true, skipped: true, reviewed: 0 };
    }
    const dayStart = now() - 24 * 3600_000;
    const rows = await many(
      `SELECT symbol, signal, scores, result, lessons FROM learning_history
        WHERE created_at > $1 ORDER BY created_at DESC LIMIT 8`,
      [dayStart]
    );
    const tuning = await tuningContext();
    const items = rows.map((r: any) => ({
      symbol: r.symbol,
      signal: r.signal,
      scores: r.scores,
      win: r.result,
      lesson: String(Array.isArray(r.lessons) ? r.lessons.join(" | ") : (r.lessons ?? "")).slice(0, 200),
    }));
    if (items.length === 0 && (tuning.perf ?? []).length === 0) {
      await setSetting("ai.lastLearningReviewAt", now(), "ai-learning");
      return { ok: true, reviewed: 0 };
    }
    const perfLine =
      (tuning.perf ?? []).slice(0, 6)
        .map((r: any) => `${r.key}: ${r.trades}t ${r.winRate}% win ${r.totalPnl}$`)
        .join(" | ") || "no strategy data yet";
    const prompt =
      `You are the learning supervisor of the WOLF trading engine. Below are the engine's recent learning entries and per-strategy performance. ` +
      `Assess what the engine is learning well and what mistake it keeps repeating. Then, using ONLY the data provided, propose small tuning changes: ` +
      `{"minScore":<20-50>,"minConfidence":<0.40-0.65>,"minConsensus":<0.40-0.60>,"minConfirmations":<2-4>,"minRR":<0.8-1.5>} ` +
      `and optional strategyWeights [{"key":"<strategy_key>","weight":<0.3-1.5>}] (max 5, only for strategies you are confident about). ` +
      `Raise gates when many losses came from weak setups; lower them only slightly when nothing traded for a long time. ` +
      `Respond in strict JSON only: {"assessmentFa":"...","assessmentEn":"...","adjustments":{...},"strategyWeights":[...]}. ` +
      `Under 150 words total.\n\nCurrent gates: ${JSON.stringify(tuning.current ?? {})}\n\nPer-strategy performance:\n${perfLine}\n\nRecent entries:\n` +
      JSON.stringify(items);
    const res = await aiAsk(
      "general",
      "You are the WOLF AI learning supervisor. You only make small, safe, data-driven tuning changes — never reckless ones.",
      prompt
    );
    await setSetting("ai.lastLearningReviewAt", now(), "ai-learning");
    const text = String(res?.text ?? "").trim();
    if (!text) return { ok: false, reviewed: 0 };

    // bounded auto-apply of the AI's suggestions
    const applied: string[] = [];
    if (tuning.autoApply) {
      const m = text.match(/\{[\s\S]*\}/);
      let parsed: any = {};
      if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = {}; } }
      const adjustments: Record<string, number> = parsed.adjustments ?? {};
      const curMap: Record<string, number> = {
        "risk.minScore": Number(tuning.current?.minScore ?? 35),
        "risk.minConfidence": Number(tuning.current?.minConfidence ?? 0.5),
        "risk.minConsensus": Number(tuning.current?.minConsensus ?? 0.55),
        "risk.minConfirmations": Number(tuning.current?.minConfirmations ?? 3),
        "risk.minRR": Number(tuning.current?.minRR ?? 1.0),
      };
      for (const [k, [lo, hi, step]] of Object.entries(TUNING_BOUNDS)) {
        const raw = Number(adjustments[k.replace("risk.", "")] ?? adjustments[k]);
        if (!Number.isFinite(raw)) continue;
        const val = Number(Math.min(hi, Math.max(lo, Math.round(raw / step) * step)).toFixed(3));
        if (Math.abs(val - curMap[k]) >= step) {
          await setSetting(k, val, "ai-learning");
          applied.push(`${k}: ${curMap[k]} → ${val}`);
        }
      }
      const known = new Set(tuning.knownKeys ?? []);
      const weights: Array<{ key?: string; weight?: number }> = Array.isArray(parsed.strategyWeights)
        ? parsed.strategyWeights : [];
      for (const w of weights.slice(0, 5)) {
        const key = String(w.key ?? "");
        const raw = Number(w.weight);
        if (!known.has(key) || !Number.isFinite(raw)) continue;
        const val = Number(Math.min(1.5, Math.max(0.3, raw)).toFixed(3));
        await pool.query("UPDATE strategies SET weight = $2 WHERE key = $1", [key, val]);
        applied.push(`weight:${key} → ${val}`);
      }
    }
    const suffix = applied.length > 0 ? `\n\n🔧 Applied (auto-learn): ${applied.join(", ")}` : "";
    await pool.query(
      `INSERT INTO ai_analysis (kind, key, provider, model, prompt, text, status, created_at)
       VALUES ('learning_review', $1, $2, '', $3, $4, 'done', $5)`,
      [`learning_review:${now()}`, res?.provider ?? "ai", prompt, text.slice(0, 3900) + suffix, now()]
    );
    if (applied.length > 0) {
      await logEngine("LEARNING", `ai.learning.applied: ${applied.join(" | ")}`, null, "engine");
    }
    return { ok: true, reviewed: items.length, applied: applied.length };
  } catch (e: any) {
    console.warn(`[ai] learning review failed: ${e?.message ?? e}`);
    return { ok: false, error: String(e?.message ?? e).slice(0, 200) };
  }
}

/** AI proposes NEW trading strategies (suggestStrategies parity). */
export async function suggestStrategies(focus?: string): Promise<any> {
  const s = await getSettings();
  if (s["ai.enabled"] === false) throw new Error("هوش مصنوعی در تنظیمات غیرفعال است.");
  const prompt =
    `You are a professional quant strategist. Propose 3 NEW, concrete, actionable trading strategies that are NOT obvious duplicates of classic EMA/RSI/MACD setups. ` +
    `Focus: ${focus || "crypto + forex, 15m-4h, both sides"}. For each: give a stable key (lowercase_snake), an English name, a Persian name, a family ` +
    `(price_action | chart_patterns | trend_following | momentum | mean_reversion | breakout | scalping | swing | smc | ict | volume | volatility | support_resistance | multi_timeframe | market_structure | liquidity | indicator_combos), the timeframes, the exact entry/exit/stop conditions, and a 0-100 risk level. ` +
    `Answer as JSON array only: [{"key":"","nameEn":"","nameFa":"","family":"","timeframes":"","entry":"","exit":"","stop":"","risk":0}]`;
  const res = await aiAsk(
    "general",
    "You are the WOLF AI strategy researcher. Return ONLY valid JSON.",
    prompt
  );
  const text = String(res?.text ?? "").trim();
  const key = `strategy_suggest:${now()}`;
  let result: unknown[] = [];
  const m = text.match(/\[[\s\S]*\]/);
  if (m) { try { result = JSON.parse(m[0]); } catch { result = []; } }
  if (!Array.isArray(result) || result.length === 0) {
    await pool.query(
      `INSERT INTO ai_analysis (kind, key, provider, model, prompt, text, status, created_at)
       VALUES ('strategy_suggest', $1, $2, '', $3, $4, 'error', $5)`,
      [key, res?.provider ?? "ai", prompt, text.slice(0, 1000), now()]
    );
    return { ok: false, key, error: "پاسخ هوش مصنوعی معتبر نبود." };
  }
  await pool.query(
    `INSERT INTO ai_analysis (kind, key, provider, model, prompt, text, status, created_at)
     VALUES ('strategy_suggest', $1, $2, '', $3, $4, 'done', $5)`,
    [key, res?.provider ?? "ai", prompt, text.slice(0, 4000), now()]
  );
  return { ok: true, key, strategies: result.slice(0, 3) };
}

// ── admin user detail (userDetail parity) ───────────────────────────────────
export async function userDetailData(userId: string): Promise<any> {
  const user = await one<Row>("SELECT * FROM users WHERE id = $1", [userId]);
  if (!user) throw new Error("کاربر یافت نشد");
  const [wallets, wtxs, coinTxs, auditRows, notifications, closed] = await Promise.all([
    many("SELECT id, asset, network, balance, frozen, enabled FROM wallets WHERE user_id = $1", [userId]),
    many(
      `SELECT id, type, asset, amount, network, status, ref, note, created_at FROM wallet_transactions
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 60`, [userId]
    ),
    many(
      `SELECT id, currency, delta, balance_after, reason, ref, created_at FROM coin_transactions
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 60`, [userId]
    ),
    many(
      `SELECT action, actor, target, details, created_at FROM audit_logs
        WHERE actor = $1 OR target = $1 ORDER BY created_at DESC LIMIT 40`,
      [user.username ?? userId]
    ),
    many(
      `SELECT id, type, title_fa, title_en, seen, created_at FROM notifications
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [userId]
    ),
    many(
      `SELECT symbol, side, close_price, close_time, close_reason, pnl, profit, strategy_keys FROM closed_positions
        WHERE user_id = $1 ORDER BY close_time DESC LIMIT 20`, [userId]
    ),
  ]);
  const usdt = wallets.find((w: any) => w.asset === "USDT") ?? wallets[0];
  const realizedPnl = closed.reduce((sum: number, p: any) => sum + num(p.profit), 0);
  return {
    user: {
      id: user.id, name: user.name, username: user.username,
      firstName: user.first_name, lastName: user.last_name,
      tgId: user.tg_id, tgUsername: user.tg_username, phone: user.phone,
      gender: user.gender, birthday: user.birthday,
      role: user.role ?? "user", isVip: !!user.is_vip, vipPackage: user.vip_package,
      vipExpiresAt: user.vip_expires_at, enabled: !!user.enabled, canTrade: !!user.can_trade,
      registeredAt: user.registered_at, lastActivity: user.last_activity,
      theme: user.theme, language: user.language, walletAddress: user.wallet_address,
      channelVerified: !!user.channel_verified, phoneVerified: !!user.phone_verified,
      notificationsEnabled: user.notifications_enabled !== false,
      aiProvider: user.ai_provider, aiModel: user.ai_model, trialClaimed: !!user.trial_claimed,
    },
    balances: {
      usdt: num(usdt?.balance) ?? 0,
      frozen: num(usdt?.frozen) ?? 0,
      toman: num(wallets.find((w: any) => w.asset === "IRT")?.balance) ?? 0,
      wolfCoins: num(user.wolf_coins) ?? 0,
      realizedPnl,
    },
    wallets,
    transactions: wtxs,
    coinTransactions: coinTxs,
    auditLogs: auditRows,
    notifications,
    closedPositions: closed,
  };
}

// ── education: channel send + media regeneration ────────────────────────────
function escHtml(t: unknown): string {
  return String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendEducationToChannel(
  id: string,
  lang: "fa" | "en"
): Promise<any> {
  const s = await getSettings();
  const botToken = s["telegram.token"] ?? "";
  if (!botToken) throw new Error("توکن ربات تلگرام تنظیم نشده است (اتصالات)");
  const chatId = (
    lang === "fa"
      ? String(s["telegram.channelId"] || s["channel.id"] || s["channel.username"] || "").trim()
      : String(s["telegram.channelEnId"] || s["channel.enId"] || s["channel.enUsername"] || "").trim()
  );
  if (!chatId) throw new Error(lang === "fa" ? "شناسه یا یوزرنیم کانال تلگرام تنظیم نشده است (از بخش تنظیمات کانال)" : "Channel ID/Username is not set");
  const row = await one<Row>("SELECT * FROM education WHERE id = $1", [id]);
  if (!row) throw new Error("درس پیدا نشد");
  const title = lang === "fa" ? row.title_fa : row.title_en || row.title_fa;
  const body = lang === "fa" ? row.body_fa : row.body_en || row.body_fa;
  const footer =
    lang === "fa"
      ? `\n\n🐺 <b>WOLF AI</b> — آموزش روزانه\n🆔 ID: <code>${String(id).slice(-10)}</code>`
      : `\n\n🐺 <b>WOLF AI</b> — daily lesson\n🆔 ID: <code>${String(id).slice(-10)}</code>`;
  const text = `📚 <b>${escHtml(title)}</b>\n\n${escHtml(body)}${footer}`;
  let photoId: number | null = null;
  if (row.image) {
    try {
      if (row.image.startsWith("http://") || row.image.startsWith("https://")) {
        photoId = await sendPhoto(chatId, row.image, `📚 <b>${escHtml(title)}</b> — 🐺 WOLF AI`, { parseMode: "HTML" });
      }
    } catch (e: any) {
      console.warn(`[education] photo failed: ${e?.message ?? e}`);
    }
  }
  const messageId = await sendMessage(chatId, text, { parseMode: "HTML" });
  if (!messageId) {
    throw new Error(`ارسال پیام به کانال (${chatId}) ناموفق بود. اطمینان حاصل کنید ربات در کانال ادمین است و شناسه کانال صحیح است.`);
  }
  if (row.audio) {
    try {
      await sendAudio(chatId, row.audio, `🎧 ${escHtml(title)}`, { parseMode: "HTML" });
    } catch (e: any) {
      console.warn(`[education] audio failed: ${e?.message ?? e}`);
    }
  }
  await pool.query(
    `UPDATE education SET ${lang === "fa" ? "sent_fa_at" : "sent_en_at"} = $2 WHERE id = $1`,
    [id, now()]
  );
  return { ok: true, messageId, photoId, lang, id };
}

function educationImagePrompt(t: { titleFa: string; titleEn: string; bodyFa: string; bodyEn: string }): string {
  return (
    `Trading education illustration, dark emerald and graphite palette, minimal flat vector style: ` +
    `a calm candlestick chart with an upward trend arrow, a wolf silhouette, and a small trophy. ` +
    `Title (Persian): ${t.titleFa}. English: ${t.titleEn}. Concept: ${String(t.bodyFa ?? t.bodyEn).slice(0, 140)}. ` +
    `No readable text, no letters, no watermark.`
  );
}

async function pollinationsImage(prompt: string, width = 1024, height = 576): Promise<string> {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${width}&height=${height}&nologo=true&seed=${Math.floor(Math.random() * 1e9)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`pollinations image failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString("base64");
}

/** Regenerate lesson media. Audio needs an external TTS service (not bundled). */
export async function regenerateEducationMedia(
  id: string,
  kind: "image" | "audio"
): Promise<{ ok: boolean; provider?: string; error?: string }> {
  const row = await one<Row>("SELECT * FROM education WHERE id = $1", [id]);
  if (!row) throw new Error("آیتم آموزشی پیدا نشد");
  if (kind === "audio") {
    return { ok: false, error: "تولید صدا در سرور خودمیزبان نیاز به سرویس TTS خارجی دارد (در Convex فعال است)." };
  }
  const base64 = await pollinationsImage(
    educationImagePrompt({ titleFa: row.title_fa, titleEn: row.title_en, bodyFa: row.body_fa, bodyEn: row.body_en })
  );
  await pool.query("UPDATE education SET image = $2 WHERE id = $1", [id, base64]);
  return { ok: true, provider: "pollinations" };
}

// ── positions: send all open positions to the channel ───────────────────────
export function positionDigest(p: any): string {
  const dir = p.side === "long" ? "🟢 LONG" : p.side === "short" ? "🔴 SHORT" : String(p.side ?? "").toUpperCase();
  const type = String(p.type ?? "futures").toUpperCase();
  return (
    `🐺 <b>${escHtml(p.symbol)}</b> — ${dir} ${type}\n` +
    `📥 ورود: <code>${num(p.entry)}</code> · 💹 فعلی: <code>${num(p.current)}</code>\n` +
    `💰 PnL: <b>${num(p.pnl) >= 0 ? "+" : ""}${num(p.pnl).toFixed(2)}</b> (${num(p.pnl_pct).toFixed(2)}%)\n` +
    `🎯 حدضرر: <code>${num(p.stop_loss)}</code> · هدف: <code>${num(p.take_profit)}</code>\n` +
    `🆔 <code>${String(p.id).slice(-8)}</code>`
  );
}

export async function sendAllPositionsToTelegram(): Promise<{ ok: boolean; sent: number; reason?: string }> {
  const s = await getSettings();
  const chatId = String(s["telegram.channelId"] ?? "");
  if (!s["telegram.token"] || !chatId) return { ok: false, sent: 0, reason: "channel_not_configured" };
  const open = await many("SELECT * FROM open_positions ORDER BY open_time DESC");
  if (open.length === 0) return { ok: false, sent: 0, reason: "no_open_positions" };
  let sent = 0;
  for (const p of open) {
    try {
      const mid = await sendMessage(chatId, positionDigest(p), { parseMode: "HTML" });
      if (mid) sent++;
      if (sent > 1) await new Promise((r) => setTimeout(r, 1500)); // rate-limit politely
    } catch {
      /* skip failed */
    }
  }
  await logEngine("INFO", `admin.positions.bulk_sent_to_telegram count=${sent}`, null, "engine");
  return { ok: true, sent };
}
