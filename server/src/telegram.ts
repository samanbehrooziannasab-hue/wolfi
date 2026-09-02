// ─────────────────────────────────────────────────────────────────────────────
// Trading Wolf AI — Telegram bridge (lightweight communication layer only)
// The bot NEVER runs the trading logic. It handles:
//   · /start → membership check → request phone → link to Mini App
//   · trade/signal notifications to channel & users
//   · verified initData (HMAC-SHA256) for the Mini App session
// All heavy logic lives in the API + engine.
// ─────────────────────────────────────────────────────────────────────────────
import { config } from "./config.js";
import { hmacSha256, sha256, now, num, clean } from "./util.js";
import { pool, one, many, audit, logEngine, type Row } from "./db.js";
import { loginByTelegramId, createSession, toAuthUser } from "./auth.js";
import type { AuthUser } from "./auth.js";
import { getSettings } from "./settings.js";

const API = "https://api.telegram.org";

function botToken(): string {
  return config.telegram.token;
}

/** Live bot token: prefer the env/config token, else the DB setting the
 *  admin saves in the panel (telegram.token). Deterministic XOR so an empty
 *  config token does not silently swallow the saved one. */
let dbTokenCache: string | null = null;
let dbTokenAt = 0;
async function resolveToken(): Promise<string> {
  if (config.telegram.token) return config.telegram.token;
  const t = now();
  if (dbTokenCache && t - dbTokenAt < 30_000) return dbTokenCache;
  try {
    const s = (await getSettings()) as unknown as Record<string, any>;
    dbTokenCache = String(s["telegram.token"] ?? "").trim() || null;
    dbTokenAt = t;
    return dbTokenCache ?? "";
  } catch {
    return "";
  }
}

async function call<T = any>(method: string, body: Record<string, any>): Promise<T | null> {
  const token = await resolveToken();
  if (!token) return null;
  const url = `${API}/bot${token}/${method}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json()) as any;
    if (!json?.ok) {
      const description = String(json?.description ?? "unknown error");
      // Invalid bootstrap credentials should not flood engine logs every tick.
      // Keep the event observable but rate-limit identical Telegram failures.
      const recent = await pool.query("SELECT 1 FROM engine_logs WHERE message = $1 AND created_at > $2 LIMIT 1", [`telegram ${method} failed: ${description}`, now() - 300_000]);
      if (recent.rowCount === 0) await logEngine("WARNING", `telegram ${method} failed: ${description}`, body, "bot");
      return null;
    }
    return json.result as T;
  } catch (e: any) {
    await logEngine("WARNING", `telegram ${method} error: ${e.message}`, null, "bot");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  opts: { replyMarkup?: unknown; parseMode?: "HTML" | "Markdown" } = {}
): Promise<number | null> {
  const r = await call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: opts.parseMode ?? "HTML",
    reply_markup: opts.replyMarkup,
  });
  await pool.query(
    `INSERT INTO telegram_messages (chat_id, message_id, direction, type, text, status)
     VALUES ($1, $2, 'out', 'message', $3, $4)`,
    [String(chatId), r?.message_id ?? null, clean(text, 4000), r ? "sent" : "failed"]
  );
  return r?.message_id ?? null;
}

/** Send a photo (base64 PNG, HTTP URL, or Telegram file_id) — used for watermarked chart cards. */
export async function sendPhoto(
  chatId: string | number,
  photoInput: string,
  caption: string,
  opts: { parseMode?: "HTML" | "Markdown" } = {}
): Promise<number | null> {
  const token = await resolveToken();
  if (!token || !chatId) return null;
  const url = `${API}/bot${token}/sendPhoto`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    let res: Response;
    const isUrl = photoInput.startsWith("http://") || photoInput.startsWith("https://");
    const isFileId = !isUrl && /^[a-zA-Z0-9_-]{20,80}$/.test(photoInput.trim());

    if (isUrl || isFileId) {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: String(chatId),
          photo: photoInput.trim(),
          caption,
          parse_mode: opts.parseMode ?? "HTML",
        }),
        signal: controller.signal,
      });
    } else {
      const cleanBase64 = photoInput.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const form = new FormData();
      form.append("chat_id", String(chatId));
      form.append("caption", caption);
      if (opts.parseMode ?? "HTML") form.append("parse_mode", opts.parseMode ?? "HTML");
      form.append("photo", new Blob([buffer], { type: "image/png" }), "chart.png");

      res = await fetch(url, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    }

    const json = (await res.json()) as any;
    if (!json?.ok) {
      const description = String(json?.description ?? "unknown error");
      await logEngine("WARNING", `telegram sendPhoto failed for ${chatId}: ${description}`, null, "bot");
      return null;
    }
    const mid = json.result?.message_id ?? null;
    if (mid) {
      await pool.query(
        `INSERT INTO telegram_messages (chat_id, message_id, direction, type, text, status)
         VALUES ($1, $2, 'out', 'photo', $3, 'sent')`,
        [String(chatId), mid, clean(caption, 4000)]
      );
    }
    return mid;
  } catch (e: any) {
    await logEngine("WARNING", `telegram sendPhoto error: ${e.message}`, null, "bot");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Send an audio narration (base64 mp3/ogg or HTTP URL) — used for education lessons. */
export async function sendAudio(
  chatId: string | number,
  audioInput: string,
  caption: string,
  opts: { parseMode?: "HTML" | "Markdown" } = {}
): Promise<number | null> {
  const token = await resolveToken();
  if (!token || !chatId) return null;
  const url = `${API}/bot${token}/sendAudio`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    let res: Response;
    const isUrl = audioInput.startsWith("http://") || audioInput.startsWith("https://");
    const isFileId = !isUrl && /^[a-zA-Z0-9_-]{20,80}$/.test(audioInput.trim());

    if (isUrl || isFileId) {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: String(chatId),
          audio: audioInput.trim(),
          caption,
          parse_mode: opts.parseMode ?? "HTML",
        }),
        signal: controller.signal,
      });
    } else {
      const cleanBase64 = audioInput.replace(/^data:audio\/\w+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const form = new FormData();
      form.append("chat_id", String(chatId));
      form.append("caption", caption);
      if (opts.parseMode ?? "HTML") form.append("parse_mode", opts.parseMode ?? "HTML");
      form.append("audio", new Blob([buffer], { type: "audio/mpeg" }), "narration.mp3");

      res = await fetch(url, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    }

    const json = (await res.json()) as any;
    if (!json?.ok) {
      const description = String(json?.description ?? "unknown error");
      await logEngine("WARNING", `telegram sendAudio failed for ${chatId}: ${description}`, null, "bot");
      return null;
    }
    const mid = json.result?.message_id ?? null;
    if (mid) {
      await pool.query(
        `INSERT INTO telegram_messages (chat_id, message_id, direction, type, text, status)
         VALUES ($1, $2, 'out', 'audio', $3, 'sent')`,
        [String(chatId), mid, clean(caption, 4000)]
      );
    }
    return mid;
  } catch (e: any) {
    await logEngine("WARNING", `telegram sendAudio error: ${e.message}`, null, "bot");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Telegram channel membership check via getChatMember. */
export async function isChannelMember(
  tgId: number,
  channelId?: string
): Promise<boolean> {
  const target = channelId || config.telegram.channelId;
  if (!target || !tgId) return false;
  const r = await call<{ status: string }>("getChatMember", {
    chat_id: target,
    user_id: tgId,
  });
  if (!r) return false;
  return ["creator", "administrator", "member"].includes(r.status);
}

/** Join-channel keyboard + "check again" button. */
export function joinChannelKeyboard(channelUsername: string): unknown {
  return {
    inline_keyboard: [
      [
        {
          text: "🔓 عضویت در کانال",
          url: `https://t.me/${channelUsername.replace("@", "")}`,
        },
      ],
      [{ text: "✅ بررسی عضویت", callback_data: "check_membership" }],
    ],
  };
}

export function phoneKeyboard(): unknown {
  return {
    keyboard: [[{ text: "📱 ارسال شماره تماس", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

export function miniAppKeyboard(): unknown {
  return {
    inline_keyboard: [
      [
        {
          text: "🚀 ورود به Trading Wolf",
          web_app: { url: config.telegram.miniAppUrl || config.appUrl },
        },
      ],
    ],
  };
}

// ── Telegram Mini App initData verification (HMAC-SHA256) ───────────────────
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyInitData(initData: string): Record<string, string> | null {
  const token = botToken();
  if (!token || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const checkString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = hmacSha256(sha256(token), "WebAppData");
  const expect = hmacSha256(secret, checkString);
  if (expect !== hash) return null; // replay/forgery — reject
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

/** Exchange a verified initData for a session token. */
export async function miniAppLogin(
  initData: string,
  ip = "0.0.0.0"
): Promise<{ user: AuthUser; token: string } | null> {
  const data = verifyInitData(initData);
  if (!data?.user) throw new Error("داده تلگرام معتبر نیست. لطفاً از داخل ربات باز کنید.");
  let tg: any;
  try {
    tg = JSON.parse(data.user);
  } catch {
    throw new Error("داده تلگرام معتبر نیست.");
  }
  const tgId = num(tg.id);
  if (!tgId) throw new Error("داده تلگرام معتبر نیست.");

  let user = await one<Row>("SELECT * FROM users WHERE tg_id = $1", [tgId]);
  if (!user) {
    // Auto-register from Telegram profile (contact is collected separately).
    const r = await pool.query(
      `INSERT INTO users (tg_id, tg_username, first_name, last_name, tg_language, language)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tg_id) DO UPDATE SET tg_username = EXCLUDED.tg_username,
         first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
         tg_language = EXCLUDED.tg_language
       RETURNING *`,
      [
        tgId,
        clean(tg.username, 64) || null,
        clean(tg.first_name, 128) || null,
        clean(tg.last_name, 128) || null,
        clean(tg.language_code, 8) || null,
        tg.language_code === "fa" ? "fa" : "fa",
      ]
    );
    user = r.rows[0] as Row;
    await pool.query(
      `INSERT INTO wallets (user_id, owner, asset, network, balance)
       VALUES ($1, $1, 'USDT', 'TRC20', 0) ON CONFLICT DO NOTHING`,
      [user.id]
    );
    await audit("telegram_register", user.username ?? String(tgId), user.id, "user", { tgId });
  }
  if (!user.enabled) throw new Error("حساب شما غیرفعال است. با پشتیبانی تماس بگیرید.");
  const token = await createSession(user.id, "mini_app", ip);
  await audit("login", user.username ?? String(tgId), user.id, "user", { via: "mini_app" }, ip);
  return { user: toAuthUser(user), token };
}

// ── Webhook update handler ───────────────────────────────────────────────────
export async function handleTelegramUpdate(update: any): Promise<void> {
  const msg = update.message ?? update.callback_query?.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const tgId = num(update.message?.from?.id ?? update.callback_query?.from?.id);
  const text: string = clean(msg.text, 1000);

  if (update.callback_query?.data === "check_membership") {
    const member = await isChannelMember(tgId);
    if (member) {
      await sendMessage(chatId, "✅ عضویت شما تأیید شد!\n\nبرای ورود، شماره تماس خود را ارسال کنید:", {
        replyMarkup: phoneKeyboard(),
      });
    } else {
      await sendMessage(
        chatId,
        "❌ هنوز عضو کانال نیستید.\n\nابتدا دکمه‌ی زیر را بزنید و عضو شوید، سپس «بررسی عضویت» را فشار دهید.",
        { replyMarkup: joinChannelKeyboard(config.telegram.channelUsername || "") }
      );
    }
    return;
  }

  if (msg.contact) {
    // ── Phone received → verify membership → create/update user → Mini App ──
    const phone = clean(msg.contact.phone_number, 24);
    const member = await isChannelMember(tgId);
    if (!member) {
      await sendMessage(chatId, "❌ ابتدا باید عضو کانال شوید.", {
        replyMarkup: joinChannelKeyboard(config.telegram.channelUsername || ""),
      });
      return;
    }
    await pool.query(
      `UPDATE users SET phone = $1, phone_verified = true, channel_verified = true, last_activity = $2
       WHERE tg_id = $3`,
      [phone, now(), tgId]
    );
    await audit("phone_verified", null, null, "user", { tgId });
    await sendMessage(
      chatId,
      `🎉 خوش آمدید، گرگ عزیز! 🐺\n\nشماره شما تأیید شد.\nاز دکمه‌ی زیر وارد پنل شوید:`,
      { replyMarkup: miniAppKeyboard() }
    );
    return;
  }

  if (text === "/start" || text === "start") {
    const member = await isChannelMember(tgId);
    if (member) {
      await sendMessage(
        chatId,
        "🐺 <b>Trading Wolf AI</b>\n\nبرای ورود، شماره تماس خود را ارسال کنید:",
        { replyMarkup: phoneKeyboard(), parseMode: "HTML" }
      );
    } else {
      await sendMessage(
        chatId,
        "🐺 به <b>Trading Wolf AI</b> خوش آمدید!\n\n⚠️ برای استفاده، ابتدا باید عضو کانال شوید:",
        { replyMarkup: joinChannelKeyboard(config.telegram.channelUsername || ""), parseMode: "HTML" }
      );
    }
    return;
  }

  // Default: point every other message to the Mini App.
  await sendMessage(
    chatId,
    "🐺 تمام امکانات از داخل <b>Mini App</b> در دسترس است. دکمه‌ی زیر را بزنید:",
    { replyMarkup: miniAppKeyboard(), parseMode: "HTML" }
  );
}

// ── Trade alert to channel (with "view details" Mini App button) ────────────
export function fmtPair(symbol: string): string {
  const s = String(symbol ?? "").trim().toUpperCase();
  if (!s) return String(symbol ?? "");
  if (s.includes("/")) return s;
  const quotes = ["USDT", "USD", "JPY", "GBP", "EUR", "CHF", "CAD", "AUD", "NZD", "TRY", "ZAR"];
  for (const q of [...quotes].sort((a, b) => b.length - a.length)) {
    if (s.length > q.length && s.endsWith(q)) return `${s.slice(0, -q.length)}/${q}`;
  }
  return s;
}

export function sparklineText(closes: number[] | null | undefined): string {
  const cs = Array.isArray(closes) ? closes.slice(-28).filter((n) => Number.isFinite(n)) : [];
  if (cs.length < 2) return "";
  const chars: string[] = [];
  for (let i = 1; i < cs.length; i++) {
    chars.push(cs[i] >= cs[i - 1] ? "🟩" : "🟥");
  }
  return chars.join("");
}

export function fmtNum(n: number | undefined | null, digits = 5): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "—";
  return v >= 1000 ? v.toFixed(2) : v.toFixed(digits);
}

export function buildSignalText(sig: Row, lang: "fa" | "en" = "fa", closes: number[] = []): string {
  const symbol = String(sig.symbol ?? "MARKET").toUpperCase();
  const rawDir = String(sig.direction ?? sig.side ?? "long").toLowerCase();
  const dir = rawDir === "short" ? "SHORT" : "LONG";
  const pair = fmtPair(symbol);
  const timeframe = String(sig.timeframe ?? sig.tf ?? "15m");
  const entry = num(sig.entry);
  const stopLoss = num(sig.stop_loss ?? sig.stopLoss);
  const takeProfit = num(sig.take_profit ?? sig.takeProfit);

  let targets: number[] = [];
  if (Array.isArray(sig.targets)) {
    targets = sig.targets.map(num).filter(Number.isFinite);
  } else if (typeof sig.targets === "string") {
    try {
      const parsed = JSON.parse(sig.targets);
      if (Array.isArray(parsed)) targets = parsed.map(num).filter(Number.isFinite);
    } catch {
      /* ignore */
    }
  }
  if (targets.length === 0 && Number.isFinite(takeProfit) && takeProfit > 0) {
    targets = [takeProfit];
  }

  const score = Math.round(num(sig.score ?? 80));
  const confRaw = num(sig.confidence ?? 0.8);
  const confidence = Math.round(confRaw <= 1 ? confRaw * 100 : confRaw);
  const rrRaw = num(sig.rr);
  const rr = rrRaw > 0 ? rrRaw : Math.abs(takeProfit - entry) / (Math.abs(entry - stopLoss) || 1);
  const price = num(sig.price);

  let reasons: string[] = [];
  const rawReasons = lang === "fa" ? (sig.reasons_fa ?? sig.reasonsFa ?? sig.reasons) : (sig.reasons_en ?? sig.reasonsEn ?? sig.reasons_fa ?? sig.reasons);
  if (Array.isArray(rawReasons)) {
    reasons = rawReasons.map(String).filter(Boolean);
  } else if (typeof rawReasons === "string") {
    try {
      const parsed = JSON.parse(rawReasons);
      if (Array.isArray(parsed)) reasons = parsed.map(String).filter(Boolean);
      else reasons = [rawReasons];
    } catch {
      reasons = [rawReasons];
    }
  }
  if (reasons.length === 0 && sig.strategy_keys) {
    const keys = Array.isArray(sig.strategy_keys) ? sig.strategy_keys : [sig.strategy_keys];
    reasons = keys.map(String);
  }

  const lines: string[] = [];
  if (lang === "fa") {
    lines.push(`🐺 <b>سیگنال Trading Wolf AI</b>`);
    lines.push(`<b>${pair}</b> · ${dir} · ${timeframe}`);
    lines.push(`\n📍 ورود: <code>${fmtNum(entry)}</code>`);
    lines.push(`🛑 حد ضرر: <code>${fmtNum(stopLoss)}</code>`);
    lines.push(`🎯 هدف اصلی: <code>${fmtNum(takeProfit)}</code>`);
    if (targets.length > 1) {
      lines.push(`   اهداف: ${targets.map((t) => `<code>${fmtNum(t)}</code>`).join(" · ")}`);
    }
    lines.push(`\n📊 امتیاز: <b>${score}</b>/100 · اطمینان: <b>${confidence}%</b> · R/R: <b>${rr.toFixed(2)}</b>`);
    if (price > 0) lines.push(`💵 قیمت لحظه‌ای: <code>${fmtNum(price)}</code>`);
    if (reasons.length > 0) {
      lines.push(`\n💡 دلایل و استراتژی‌ها:\n${reasons.slice(0, 5).map((r) => `• ${r}`).join("\n")}`);
    }
    const sp = sparklineText(closes);
    if (sp) lines.push(`\n${sp}`);
    lines.push(`\n#${symbol} #${dir.toLowerCase()} #${timeframe.replace(/[^a-z0-9]/gi, "")} #wolf_ai #signal`);
    if (sig.id) lines.push(`🆔 شناسه: <code>${String(sig.id).slice(-10)}</code>`);
    lines.push(`\n⚠️ صرفاً جنبه آموزشی دارد — هرگز توصیه مالی نیست.`);
  } else {
    lines.push(`🐺 <b>Trading Wolf AI Signal</b>`);
    lines.push(`<b>${pair}</b> · ${dir} · ${timeframe}`);
    lines.push(`\n📍 Entry: <code>${fmtNum(entry)}</code>`);
    lines.push(`🛑 Stop loss: <code>${fmtNum(stopLoss)}</code>`);
    lines.push(`🎯 Target: <code>${fmtNum(takeProfit)}</code>`);
    if (targets.length > 1) {
      lines.push(`   Targets: ${targets.map((t) => `<code>${fmtNum(t)}</code>`).join(" · ")}`);
    }
    lines.push(`\n📊 Score: <b>${score}</b>/100 · Confidence: <b>${confidence}%</b> · R/R: <b>${rr.toFixed(2)}</b>`);
    if (price > 0) lines.push(`💵 Live price: <code>${fmtNum(price)}</code>`);
    if (reasons.length > 0) {
      lines.push(`\n💡 Reasons & Strategies:\n${reasons.slice(0, 5).map((r) => `• ${r}`).join("\n")}`);
    }
    const sp = sparklineText(closes);
    if (sp) lines.push(`\n${sp}`);
    lines.push(`\n#${symbol} #${dir.toLowerCase()} #${timeframe.replace(/[^a-z0-9]/gi, "")} #wolf_ai #signal`);
    if (sig.id) lines.push(`🆔 ID: <code>${String(sig.id).slice(-10)}</code>`);
    lines.push(`\n⚠️ Educational only — never financial advice.`);
  }
  return lines.join("\n");
}

export async function notifyTradeChannel(
  p: Row,
  mode: "open" | "close" | "signal",
  lang: "fa" | "en" = "fa"
): Promise<void> {
  const s = ((await getSettings()) as any) ?? {};
  const channelId = lang === "en"
    ? String(s["channel.enId"] || s["telegram.channelEnId"] || s["channel.enUsername"] || s["channel.id"] || s["telegram.channelId"] || config.telegram.channelId || "").trim()
    : String(s["channel.id"] || s["telegram.channelId"] || s["channel.username"] || s["telegram.channelUsername"] || config.telegram.channelId || "").trim();
  if (!channelId || !(await resolveToken())) return;

  if (mode === "signal") {
    const text = buildSignalText(p, lang);
    await sendMessage(channelId, text, {
      parseMode: "HTML",
      replyMarkup: {
        inline_keyboard: [
          [{ text: lang === "fa" ? "🔎 مشاهده جزئیات" : "🔎 View Details", web_app: { url: config.telegram.miniAppUrl || config.appUrl } }],
        ],
      },
    });
    return;
  }

  const side = p.side === "long" ? "🟢 لانگ / LONG" : "🔴 شورت / SHORT";
  const emoji = mode === "open" ? "📌 معامله باز شد" : "✅ معامله بسته شد";
  const stopLoss = num(p.stop_loss ?? p.stopLoss);
  const takeProfit = num(p.take_profit ?? p.takeProfit);
  const entry = num(p.entry);
  const lines = [
    emoji,
    "━━━━━━━━━━━━━━━━━━",
    `📊 نماد: <b>${fmtPair(p.symbol)}</b>`,
    side,
    `⭐ Score: <b>${num(p.score).toFixed(1)}</b>/100 | Confidence: ${Math.round(num(p.confidence) * (num(p.confidence) <= 1 ? 100 : 1))}%`,
    `🧠 استراتژی: ${(p.strategyKeys ?? p.strategy_keys ?? []).slice(0, 3).join(" · ") || "-"}`,
    `📥 ورود: ${fmtNum(entry)}`,
    `⛔ حد ضرر: ${fmtNum(stopLoss)}`,
    `🎯 هدف: ${fmtNum(takeProfit)}`,
  ];
  if (mode === "close") {
    lines.push(`💰 نتیجه: <b>${num(p.profit) >= 0 ? "+" : ""}${fmtNum(p.profit, 4)} USDT</b>`);
    lines.push(`📌 دلیل خروج: ${p.closeReason ?? p.close_reason ?? "-"}`);
  }
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("#WOLF_TRADE");
  await sendMessage(channelId, lines.join("\n"), {
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        [{ text: "🔎 مشاهده جزئیات", web_app: { url: config.telegram.miniAppUrl || config.appUrl } }],
      ],
    },
  });
}

/** Send a notification row to a user's Telegram if they have tg_id. */
export async function notifyUserTelegram(
  userId: string,
  textFa: string,
  textEn: string
): Promise<void> {
  const u = await one<Row>("SELECT tg_id FROM users WHERE id = $1", [userId]);
  if (!u?.tg_id || !(await resolveToken())) return;
  await sendMessage(u.tg_id, textFa || textEn);
}

/** Set the webhook URL for the bot (called by admin API). */
/** Fetch getWebhookInfo from the Telegram API using the live token. */
export async function getWebhookInfoApi(): Promise<Record<string, any>> {
  try {
    const token = await resolveToken();
    if (!token) return { ok: false, error: "توکن ربات تنظیم نشده است." };
    const url = `${API}/bot${token}/getWebhookInfo`;
    const res = await fetch(url);
    const json = (await res.json()) as any;
    if (!json?.ok) {
      return { ok: false, error: String(json?.description ?? "خطا در دریافت وضعیت وبهوک"), ...(json?.result ?? {}) };
    }
    const r = json.result ?? {};
    return {
      ok: true,
      url: String(r.url ?? ""),
      pendingUpdateCount: Number(r.pending_update_count ?? 0),
      lastError: String(r.last_error_message ?? ""),
      lastErrorDate: Number(r.last_error_date ?? 0),
      description: String(r.description ?? ""),
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}


/** Drop the cached settings-derived bot token (call after the admin saves
 * a new token so the next Telegram call picks it up immediately). */
export function invalidateTelegramTokenCache(): void {
  dbTokenCache = null;
  dbTokenAt = 0;
}

export async function setWebhook(
  url: string,
  secret: string,
): Promise<{ ok: boolean; description?: string; error?: string }> {
  const token = await resolveToken();
  if (!token) {
    return { ok: false, error: "توکن ربات تنظیم نشده است." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${API}/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
      }),
      signal: controller.signal,
    });
    const json = (await res.json()) as any;
    if (!json?.ok) {
      const description = String(json?.description ?? "setWebhook_failed");
      await logEngine("WARNING", `telegram setWebhook failed: ${description}`, { url: clean(url, 200) }, "bot");
      return { ok: false, description, error: description };
    }
    return { ok: true, description: String(json?.description ?? "") };
  } catch (e: any) {
    const emsg = String(e?.message ?? e);
    await logEngine("WARNING", `telegram setWebhook error: ${emsg}`, null, "bot");
    return { ok: false, error: emsg };
  } finally {
    clearTimeout(timer);
  }
}
