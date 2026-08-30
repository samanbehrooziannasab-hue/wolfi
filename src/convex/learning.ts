// ---------------------------------------------------------------------------
// Daily education — auto-generated lessons for users.
// Every day the cron (or the admin button) summarizes the last 24h of
// user activity (predictions), bot activity (telegram), AI activity
// (analyses/chats) and engine activity (signals/closed trades) into one
// bilingual lesson. Items are inserted as `pending` and only become visible
// to users after an admin approves them (learning.autoApprove can skip this).
// ---------------------------------------------------------------------------
import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin, requireStaff, resolveAdmin, resolveStaff, resolveWolfUser } from "./wolfAuth";
import { getSettingsMap } from "./settings";
import { buildDailyLesson } from "./aiPolicy";
import { audit } from "./logs";

function dayStamp(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function faWeekday(ts: number): string {
  return new Date(ts).toLocaleDateString("fa-IR", { weekday: "long" });
}

function enWeekday(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { weekday: "long" });
}

/** Sums the last-24h activity + settings needed to build a daily lesson. */
export const generateDailyEducationStats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await getSettingsMap(ctx);
    const dayStart = Date.now() - 24 * 3600 * 1000;
    const day = dayStamp(Date.now());

    // ── gather activity (all best-effort, never fatal) ─────────────────
    let signals = 0;
    let closed = 0;
    let wins = 0;
    let predictions = 0;
    let predWins = 0;
    let aiReviews = 0;
    let topSymbol = "BTCUSDT";
    let topDir: "long" | "short" = "long";
    let topScore = -1;

    try {
      const [sigRows, closedRows, predRows, aiRows, learnRows] = await Promise.all([
        ctx.db.query("signals").order("desc").take(300),
        ctx.db.query("closed_positions").withIndex("by_time", (q) => q.gt("closeTime", dayStart)).order("desc").take(300),
        ctx.db.query("demoPredictions").order("desc").take(300),
        ctx.db.query("ai_analysis").withIndex("by_kind", (q) => q.eq("kind", "trade_review")).order("desc").take(300),
        ctx.db.query("learningHistory").withIndex("by_time", (q) => q.gt("created", dayStart)).order("desc").take(300),
      ]);
      signals = sigRows.filter((r: any) => r.created >= dayStart).length;
      const closedRows24 = closedRows.filter((r: any) => r.closeTime >= dayStart);
      closed = closedRows24.length;
      wins = closedRows24.filter((r: any) => (r.pnl ?? r.profit ?? 0) >= 0).length;
      const predRows24 = predRows.filter((r: any) => r.created >= dayStart);
      predictions = predRows24.length;
      predWins = predRows24.filter((r: any) => r.status === "won").length;
      aiReviews = aiRows.filter((r: any) => r.created >= dayStart).length;
      const topRow = learnRows[0];
      if (topRow) {
        topScore = Number((topRow as any).scores?.[0] ?? 0);
        topSymbol = String(topRow.symbol ?? topSymbol);
        topDir = topRow.signal === "short" ? "short" : "long";
      }
    } catch (e: any) {
      console.warn(`[education] activity gather failed: ${e?.message ?? e}`);
    }

    const winRate = closed > 0 ? (wins / closed) * 100 : 0;
    const predWinRate = predictions > 0 ? (predWins / predictions) * 100 : 0;
    const fallbackLesson = buildDailyLesson({
      dateFa: faWeekday(Date.now()),
      dateEn: enWeekday(Date.now()),
      signals,
      closed,
      winRate,
      predictions,
      predictionWinRate: predWinRate,
      aiReviews,
      topSymbol,
      topDirection: topDir,
    });
    return {
      settings,
      day,
      dayStart,
      stats: { signals, closed, wins, winRate, predictions, predWinRate, aiReviews, topSymbol, topDir, topScore },
      fallbackLesson,
    };
  },
});

/** Insert the finished lesson row (called by the generate action). */
export const insertEducationRow = internalMutation({
  args: {
    titleFa: v.string(),
    titleEn: v.string(),
    bodyFa: v.string(),
    bodyEn: v.string(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    day: v.string(),
    image: v.optional(v.string()),
    audio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("education", {
      titleFa: args.titleFa,
      titleEn: args.titleEn,
      bodyFa: args.bodyFa,
      bodyEn: args.bodyEn,
      source: "ai",
      status: args.status,
      day: args.day,
      createdBy: "system:cron",
      created: Date.now(),
      ...(args.image ? { image: args.image } : {}),
      ...(args.audio ? { audio: args.audio } : {}),
    });
    return { ok: true, created: 1, id, status: args.status };
  },
});

/** Generates the daily lesson: activity stats → AI bilingual content → image → voice. */
/**
 * Build the lesson-illustration prompt FROM the lesson itself, so the image
 * always matches the day's topic (never a generic mascot drawing).
 */
export function educationImagePrompt(lesson: {
  titleFa?: string;
  titleEn?: string;
  bodyFa?: string;
  bodyEn?: string;
}): string {
  const text = `${lesson.titleEn ?? ""} ${lesson.bodyEn ?? ""} ${lesson.titleFa ?? ""} ${lesson.bodyFa ?? ""}`.toLowerCase();
  const scenes: Array<[RegExp, string]> = [
    [/stop.?loss|حد ضرر|توقف/, "a candlestick chart with a clear red horizontal stop-loss line and a protective order marker, risk management concept"],
    [/risk.?reward|ریسک.*پاداش|ریوارد/, "a candlestick chart with a risk-to-reward diagram, green take-profit arrow and red stop-loss arrow"],
    [/position.?sizing|حجم.*پوزیشن|سایز.*پوزیشن|مدیریت سرمایه/, "position sizing diagram with equal capital blocks next to a candlestick chart"],
    [/trend|روند/, "a candlestick chart inside a clear rising trend channel with a drawn trendline"],
    [/breakout|بریک.*اوت|شکست/, "a candlestick chart breaking upward out of a horizontal resistance level with rising volume bars"],
    [/reversal|بازگشت|reject|ریجکت/, "a candlestick chart showing a reversal pattern at a support level, price turning back up"],
    [/volatil|نوسان/, "a candlestick chart with wide price swings and a volatility indicator line"],
    [/drawdown|ریزش|افت سرمایه/, "an equity curve dropping then recovering, drawdown concept"],
    [/psycholog|روان|انضباط|discipline|fomo|ترس|طمع/, "a calm trader at a desk watching charts, discipline and trading psychology concept"],
    [/support|resistance|حمایت|مقاومت/, "a candlestick chart with horizontal support and resistance levels clearly marked"],
    [/entry|ورود|exit|خروج/, "a candlestick chart with a marked entry point and exit arrows"],
  ];
  for (const [re, scene] of scenes) {
    if (re.test(text)) {
      return `minimalist flat vector illustration of ${scene}, dark navy background, teal and emerald accents, clean educational style, no text, no animals`;
    }
  }
  return "minimalist flat vector illustration of a candlestick chart with a moving-average line and a small indicator panel, dark navy background, teal and emerald accents, clean educational style, no text, no animals";
}

export const generateDailyEducation = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }): Promise<any> => {
    const q = await ctx.runQuery(internal.learning.generateDailyEducationStats, {});
    const { settings, day, stats, fallbackLesson } = q as any;

    if (settings["learning.autoGenerate"] === false && !force) {
      return { ok: true, created: 0, skipped: true };
    }
    // Configurable generation hour (UTC) — the daily cron fires at 04:30 UTC;
    // if the admin set another hour, skip until it matches (manual button
    // always forces).
    const hourSetting = Number(settings["learning.educationHourUTC"]);
    if (!force && Number.isFinite(hourSetting) && hourSetting >= 0 && hourSetting <= 23) {
      if (new Date().getUTCHours() !== hourSetting) {
        return { ok: true, created: 0, skipped: true, reason: "not_the_hour" };
      }
    }

    // Dedup: one lesson per calendar day.
    const existing = await ctx.runQuery(internal.learning.listEducationDays, {});
    if (!force && existing.some((e: any) => e.day === day)) {
      return { ok: true, created: 0, skipped: true, reason: "already_today" };
    }

    // ── AI-written bilingual lesson (robust chain; falls back to the
    //    activity summary when every provider is down) ─────────────────
    let lesson = fallbackLesson;
    try {
      const aiOut = await ctx.runAction(internal.nodeCalls.aiGenerateRobust, {
        system:
          "You are the WOLF AI education engine of a trading platform. Write ONE short, practical trading lesson " +
          "that a beginner can apply today. The lesson must be educational and risk-aware, never financial advice. " +
          "Return ONLY strict JSON with exactly these 4 fields, no markdown fences: " +
          '{"titleFa":"...","titleEn":"...","bodyFa":"...","bodyEn":"..."}. ' +
          "titleFa/bodyFa in Persian (3-6 lines), titleEn/bodyEn in English (3-6 lines). " +
          "Titles under 8 words. Body: one concrete tip + why it matters + a one-line action step.",
        prompt:
          "Today's engine activity: signals=" + stats.signals + ", trades closed=" + stats.closed + " (win rate " + Math.round(stats.winRate) + "%), " +
          "user predictions=" + stats.predictions + ", AI reviews=" + stats.aiReviews + ". Strongest symbol " + stats.topSymbol + " direction " + stats.topDir + ". " +
          "Pick a practical topic (risk management, position sizing, stop-loss placement, R:R, trend reading, drawdown control, or psychology) " +
          "that fits today's activity, and write the bilingual lesson.",
      });
      const raw = String((aiOut as any)?.text ?? "").trim();
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (parsed.titleFa && parsed.titleEn && parsed.bodyFa && parsed.bodyEn) {
          lesson = {
            titleFa: String(parsed.titleFa).slice(0, 120),
            titleEn: String(parsed.titleEn).slice(0, 120),
            bodyFa: String(parsed.bodyFa).slice(0, 2000),
            bodyEn: String(parsed.bodyEn).slice(0, 2000),
          };
        }
      }
    } catch (e: any) {
      console.warn(`[education] AI lesson failed, using fallback: ${e?.message ?? e}`);
    }

    // ── Lesson image (Pollinations, free) + voice (edge-tts if enabled) ──
    // The illustration is built FROM the lesson topic so it always matches
    // the day's lesson (never a random mascot drawing).
    let image: string | undefined;
    let audio: string | undefined;
    try {
      const img = await ctx.runAction(internal.nodeCalls.pollinationsImage, {
        prompt: educationImagePrompt(lesson),
        width: 1024,
        height: 576,
      });
      image = (img as any)?.base64;
    } catch (e: any) {
      console.warn(`[education] image failed: ${e?.message ?? e}`);
    }
    try {
      if (String(settings["tts.enabled"] ?? "") === "true" || settings["tts.enabled"] === true) {
        const voice = String(settings["tts.voice"] ?? "") || "fa-IR-FaridNeural";
        const rate = Number(settings["tts.speed"] ?? settings["tts.rate"] ?? 1) || 1;
        const base = String(settings["tts.baseUrl"] ?? settings["tts.base"] ?? "").trim();
        const apiKey = String(settings["tts.apiKey"] ?? "") || undefined;
        const tts = await ctx.runAction(internal.nodeCalls.edgeTtsSpeak, {
          text: lesson.bodyFa.slice(0, 1800),
          voice,
          speed: rate,
          baseUrl: base,
          apiKey,
        });
        audio = (tts as any)?.audioBase64;
      }
    } catch (e: any) {
      console.warn(`[education] tts failed: ${e?.message ?? e}`);
    }

    const autoApprove = settings["learning.autoApprove"] === true || settings["learning.autoApprove"] === "true";
    const res = await ctx.runMutation(internal.learning.insertEducationRow, {
      titleFa: lesson.titleFa,
      titleEn: lesson.titleEn,
      bodyFa: lesson.bodyFa,
      bodyEn: lesson.bodyEn,
      status: autoApprove ? "approved" : "pending",
      day,
      ...(image ? { image } : {}),
      ...(audio ? { audio } : {}),
    });
    return res;
  },
});

/** Internal: patch media fields of an education row. */
export const patchEducationMedia = internalMutation({
  args: { id: v.id("education"), image: v.optional(v.string()), audio: v.optional(v.string()) },
  handler: async (ctx, { id, image, audio }) => {
    await ctx.db.patch(id, {
      ...(image ? { image } : {}),
      ...(audio ? { audio } : {}),
    });
    return { ok: true };
  },
});

/**
 * Admin: regenerate missing lesson media (image via Pollinations,
 * voice via the TTS chain) for an existing education item.
 */
export const regenerateLessonMedia = action({
  args: { token: v.string(), id: v.id("education"), kind: v.union(v.literal("image"), v.literal("audio")) },
  handler: async (ctx, { token, id, kind }): Promise<{ ok: boolean; provider?: string }> => {
    await requireAdmin(ctx, token);
    const row: any = await ctx.runQuery(internal.learning.getEducationInternal, { id });
    if (!row) throw new Error("آیتم آموزشی پیدا نشد");
    if (kind === "image") {
      const img = await ctx.runAction(internal.nodeCalls.pollinationsImage, {
        prompt: educationImagePrompt({ titleFa: row.titleFa, titleEn: row.titleEn, bodyFa: row.bodyFa, bodyEn: row.bodyEn }),
        width: 1024,
        height: 576,
      });
      await ctx.runMutation(internal.learning.patchEducationMedia, { id, image: (img as any).base64 });
      return { ok: true };
    }
    const settings = (await ctx.runQuery(internal.settings.rawSettings, {})) as Record<string, any>;
    const voice = String(settings["tts.voice"] ?? "") || "fa-IR-FaridNeural";
    const rate = Number(settings["tts.speed"] ?? settings["tts.rate"] ?? 1) || 1;
    const base = String(settings["tts.baseUrl"] ?? settings["tts.base"] ?? "").trim();
    const tts: any = await ctx.runAction(internal.nodeCalls.edgeTtsSpeak, {
      text: String(row.bodyFa ?? "").slice(0, 1800),
      voice,
      speed: rate,
      baseUrl: base,
      apiKey: String(settings["tts.apiKey"] ?? "") || undefined,
    });
    await ctx.runMutation(internal.learning.patchEducationMedia, { id, audio: (tts as any).audioBase64 });
    return { ok: true, provider: (tts as any).provider };
  },
});

/** Admin: approve or reject a generated education item. */
export const reviewEducation = mutation({
  args: { token: v.string(), id: v.id("education"), status: v.union(v.literal("approved"), v.literal("rejected")), note: v.optional(v.string()) },
  handler: async (ctx, { token, id, status, note }) => {
    const admin = await requireAdmin(ctx, token);
    const row = await ctx.db.get(id);
    if (!row) throw new Error("آیتم آموزشی پیدا نشد");
    await ctx.db.patch(id, {
      status,
      decidedBy: admin.username ?? "admin",
      decidedAt: Date.now(),
      ...(note ? { note } : {}),
    });
    await audit(ctx, "education.review", admin.username, admin._id, "education", `${status} ${id}`);
    return { ok: true };
  },
});

/** Admin: manually create an education item (approves immediately). */
export const createEducation = mutation({
  args: {
    token: v.string(),
    titleFa: v.string(),
    titleEn: v.string(),
    bodyFa: v.string(),
    bodyEn: v.string(),
    source: v.optional(v.union(v.literal("user"), v.literal("bot"), v.literal("ai"), v.literal("engine"), v.literal("admin"))),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.token);
    const titleFa = args.titleFa.trim();
    const titleEn = args.titleEn.trim() || titleFa;
    if (!titleFa || !args.bodyFa.trim()) throw new Error("عنوان و متن فارسی الزامی است");
    const id = await ctx.db.insert("education", {
      titleFa,
      titleEn,
      bodyFa: args.bodyFa.trim(),
      bodyEn: args.bodyEn.trim() || args.bodyFa.trim(),
      source: args.source ?? "admin",
      status: "approved",
      createdBy: admin.username ?? "admin",
      created: Date.now(),
    });
    await audit(ctx, "education.create", admin.username, admin._id, "education", id);
    return { ok: true, id };
  },
});

/** Admin: trigger generation right now (action — generation calls AI actions). */
export const triggerEducation = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<any> => {
    await ctx.runQuery(internal.brokerData.assertAdmin, { token });
    const res: any = await ctx.runAction(internal.learning.generateDailyEducation, { force: true });
    return { ok: true, created: Number(res?.created ?? 0), status: String(res?.status ?? ""), id: res?.id };
  },
});

export const listEducation = query({
  args: { token: v.string(), status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))) },
  handler: async (ctx, { token, status }) => {
    const staff = await resolveStaff(ctx, token);
    if (!staff) return [];
    const rows = await ctx.db.query("education").order("desc").take(200);
    return status ? rows.filter((r: any) => r.status === status) : rows;
  },
});

export const getEducationInternal = internalQuery({
  args: { id: v.id("education") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const listEducationDays = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("education").withIndex("by_status", (q) => q.eq("status", "pending")).collect();
    return rows.map((r: any) => ({ day: r.day, _id: r._id }));
  },
});

export const markEducationSent = internalMutation({
  args: { id: v.id("education"), lang: v.union(v.literal("fa"), v.literal("en")) },
  handler: async (ctx, { id, lang }) => {
    await ctx.db.patch(id, lang === "fa" ? { sentFaAt: Date.now() } : { sentEnAt: Date.now() });
  },
});

/**
 * Admin: send one approved lesson to the Persian or English Telegram channel.
 * fa → channel.id, en → channel.enId (both set in Connections). The send
 * timestamp is stored on the lesson so the AI center shows where it was posted.
 */
export const sendEducationToChannel = action({
  args: { token: v.string(), id: v.id("education"), lang: v.union(v.literal("fa"), v.literal("en")) },
  handler: async (ctx, { token, id, lang }): Promise<any> => {
    await ctx.runQuery(internal.brokerData.assertAdmin, { token });
    // Actions have no ctx.db — read settings through the internal query.
    const settings = (await ctx.runQuery(internal.settings.rawSettings, {})) as Record<string, any>;
    const botToken = String(settings["telegram.token"] ?? "");
    const chatId =
      lang === "fa" ? String(settings["channel.id"] ?? "") : String(settings["channel.enId"] ?? "");
    if (!botToken) throw new Error("توکن ربات تلگرام تنظیم نشده است (اتصالات)");
    if (!chatId) throw new Error(lang === "fa" ? "آیدی کانال فارسی تنظیم نشده است" : "English channel ID is not set (Connections)");
    const row = await ctx.runQuery(internal.learning.getEducationInternal, { id });
    if (!row) throw new Error("درس پیدا نشد");
    const esc = (t: string) =>
      String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const title = lang === "fa" ? row.titleFa : row.titleEn || row.titleFa;
    const body = lang === "fa" ? row.bodyFa : row.bodyEn || row.bodyFa;
    const footer = lang === "fa"
      ? `\n\n🐺 <b>WOLF AI</b> — آموزش روزانه\n🆔 ID: <code>${String(id).slice(-10)}</code>`
      : `\n\n🐺 <b>WOLF AI</b> — daily lesson\n🆔 ID: <code>${String(id).slice(-10)}</code>`;
    const text = `📚 <b>${esc(title)}</b>\n\n${esc(body)}${footer}`;
    // Photo first (short caption — captions cap at 1024 chars), then the full
    // text, then the audio narration.
    let photoId: number | undefined;
    if (row.image) {
      try {
        const photo = await ctx.runAction(internal.nodeCalls.telegramSendPhoto, {
          token: botToken,
          chatId,
          photo: row.image,
          caption: lang === "fa"
            ? `📚 <b>${esc(title)}</b> — 🐺 WOLF AI`
            : `📚 <b>${esc(title)}</b> — 🐺 WOLF AI`,
          parseMode: "HTML",
          silent: true,
        });
        photoId = (photo as any)?.messageId;
      } catch (e: any) {
        console.warn(`[education] photo failed: ${e?.message ?? e}`);
      }
    }
    const res = (await ctx.runAction(internal.nodeCalls.telegramSend, {
      token: botToken,
      chatId,
      text,
      parseMode: "HTML",
      silent: true,
    })) as { ok?: boolean; messageId?: number };
    if (!res?.ok) throw new Error("ارسال به کانال ناموفق بود");
    if (row.audio) {
      try {
        await ctx.runAction(internal.nodeCalls.telegramSendAudio, {
          token: botToken,
          chatId,
          audio: row.audio,
          caption: lang === "fa" ? `🎧 ${esc(title)}` : `🎧 ${esc(title)}`,
          parseMode: "HTML",
          silent: true,
        });
      } catch (e: any) {
        console.warn(`[education] audio failed: ${e?.message ?? e}`);
      }
    }
    await ctx.runMutation(internal.learning.markEducationSent, { id, lang });
    return { ok: true, messageId: res.messageId, photoId, lang, id };
  },
});

/** Users see only admin-approved lessons. */
export const publicEducation = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await resolveWolfUser(ctx, token);
    if (!user) throw new Error("session_expired");
    // Users see the published AI daily lessons only — raw engine digests stay
    // in the admin panel.
    const rows = await ctx.db.query("education").order("desc").take(50);
    return rows.filter(
      (r: any) => r.status === "approved" && (r.source === "ai" || r.source === "admin"),
    );
  },
});
