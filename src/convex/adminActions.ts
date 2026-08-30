// ---------------------------------------------------------------------------
// "use node" — admin actions that need Node APIs (zlib) for PNG chart images.
// This file contains ONLY actions (Convex "use node" rule).
// ---------------------------------------------------------------------------
"use node";
import { deflateSync } from "node:zlib";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { renderCandleChartPng } from "./chartImage";
import { buildSignalMessage, fmtPair } from "./aiPolicy";
import { formatPositionMessage } from "./telegram";

/**
 * Admin: render the watermarked candlestick chart PNG for a symbol (base64).
 */
export const chartImageFor = action({
  args: {
    token: v.string(),
    symbol: v.string(),
    timeframe: v.optional(v.string()),
    entry: v.optional(v.number()),
    stopLoss: v.optional(v.number()),
    takeProfit: v.optional(v.number()),
  },
  handler: async (ctx, { token, symbol, timeframe, entry, stopLoss, takeProfit }): Promise<any> => {
    await ctx.runQuery(internal.brokerData.assertAdmin, { token });
    const tf = timeframe ?? "15m";
    const candles = await ctx.runQuery(internal.admin.candlesOhlc, { symbol, timeframe: tf, limit: 60 });
    const png = renderCandleChartPng(
      { symbol, timeframe: tf, candles, entry, stopLoss, takeProfit, watermark: "WOLF AI" },
      deflateSync,
    );
    return {
      ok: true,
      pngBase64: Buffer.from(png).toString("base64"),
      count: candles.length,
      symbol,
      timeframe: tf,
    };
  },
});

/**
 * Admin: post ONE open position to BOTH Telegram channels as a full trade
 * card — watermarked chart PNG first, then every detail shown in the panel
 * (entry/current/SL/TP/targets, size, leverage, margin, P&L, max loss,
 * target profit, score/confidence, strategies, RR, exchange/mode/source).
 */
export const sendPositionToChannels = action({
  args: { token: v.string(), positionId: v.id("open_positions") },
  handler: async (ctx, { token, positionId }): Promise<any> => {
    await ctx.runQuery(internal.brokerData.assertAdmin, { token });
    const p = await ctx.runQuery(internal.admin.getPositionInternal, { positionId });
    if (!p) throw new Error("پوزیشن یافت نشد");
    const settings = (await ctx.runQuery(internal.settings.rawSettings, {})) as Record<string, any>;
    const botToken = String(settings["telegram.token"] ?? "");
    if (!botToken) throw new Error("توکن ربات تلگرام تنظیم نشده است (اتصالات)");
    const channels = [
      { lang: "fa" as const, chatId: String(settings["channel.id"] ?? "") },
      { lang: "en" as const, chatId: String(settings["channel.enId"] ?? "") },
    ].filter((c) => c.chatId);
    if (!channels.length) throw new Error("آیدی هیچ کانالی تنظیم نشده است (اتصالات)");

    // Watermarked chart from real stored candles (entry / SL / TP lines).
    let png: Buffer | null = null;
    try {
      const ohlc = await ctx.runQuery(internal.admin.candlesOhlc, { symbol: p.symbol, timeframe: "15m", limit: 60 });
      if (ohlc && ohlc.length > 4) {
        png = Buffer.from(
          renderCandleChartPng(
            {
              symbol: p.symbol,
              timeframe: "15m",
              candles: ohlc,
              entry: p.entry,
              stopLoss: p.stopLoss,
              takeProfit: p.takeProfit,
              watermark: "WOLF AI",
            },
            deflateSync,
          ),
        );
      }
    } catch {
      // chart is best-effort — the text card still goes out
    }

    const sent: string[] = [];
    for (const ch of channels) {
      try {
        if (png) {
          await ctx.runAction(internal.nodeCalls.telegramSendPhoto, {
            token: botToken,
            chatId: ch.chatId,
            photo: png.toString("base64"),
            caption:
              ch.lang === "fa"
                ? `🐺 <b>پوزیشن باز ${fmtPair(p.symbol)}</b> — ${p.side === "short" ? "SHORT" : "LONG"} · #${p.symbol} #wolf_ai #trade`
                : `🐺 <b>${fmtPair(p.symbol)} open position</b> — ${p.side === "short" ? "SHORT" : "LONG"} · #${p.symbol} #wolf_ai #trade`,
            parseMode: "HTML",
            silent: true,
          });
        }
        const res = (await ctx.runAction(internal.nodeCalls.telegramSend, {
          token: botToken,
          chatId: ch.chatId,
          text: formatPositionMessage(p, { lang: ch.lang, kind: "detail" }),
          parseMode: "HTML",
          silent: true,
        })) as { ok?: boolean };
        if (res?.ok) sent.push(ch.lang);
      } catch (e: any) {
        console.warn(`[position-card] ${ch.lang} failed: ${e?.message ?? e}`);
      }
    }
    if (!sent.length) throw new Error("ارسال به کانال‌ها ناموفق بود");
    return { ok: true, sent };
  },
});

/**
 * Admin: send the watermarked chart image for any symbol+timeframe to the
 * Persian (channel.id) or English (channel.enId) Telegram channel, with an
 * optional caption. Used by the "candles & chart" tab's send buttons.
 */
export const sendChartToChannel = action({
  args: {
    token: v.string(),
    symbol: v.string(),
    timeframe: v.optional(v.string()),
    lang: v.union(v.literal("fa"), v.literal("en")),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, { token, symbol, timeframe, lang, caption }): Promise<any> => {
    await ctx.runQuery(internal.brokerData.assertAdmin, { token });
    const settings = (await ctx.runQuery(internal.settings.rawSettings, {})) as Record<string, any>;
    const botToken = String(settings["telegram.token"] ?? "");
    const chatId = lang === "fa" ? String(settings["channel.id"] ?? "") : String(settings["channel.enId"] ?? "");
    if (!botToken) throw new Error("توکن ربات تلگرام تنظیم نشده است (اتصالات)");
    if (!chatId) throw new Error(lang === "fa" ? "آیدی کانال تنظیم نشده است" : "Channel ID is not set (Connections)");

    const tf = timeframe ?? "15m";
    const ohlc = await ctx.runQuery(internal.admin.candlesOhlc, { symbol, timeframe: tf, limit: 60 });
    if (!ohlc || ohlc.length < 5) throw new Error(lang === "fa" ? "کندلی برای این نماد ذخیره نشده است" : "No stored candles for this symbol");
    const png = renderCandleChartPng({ symbol, timeframe: tf, candles: ohlc, watermark: "WOLF AI", lang: lang === "fa" ? "fa" : "en" }, deflateSync);
    const text =
      caption?.trim() ||
      (lang === "fa"
        ? `🐺 چارت ${symbol} · تایم‌فریم ${tf} — #${symbol} #wolf_ai #chart`
        : `🐺 ${symbol} chart · ${tf} timeframe — #${symbol} #wolf_ai #chart`);
    const res = (await ctx.runAction(internal.nodeCalls.telegramSendPhoto, {
      token: botToken,
      chatId,
      photo: Buffer.from(png).toString("base64"),
      caption: text,
      parseMode: "HTML",
      silent: true,
    })) as { ok?: boolean; messageId?: number };
    if (!res?.ok) throw new Error("ارسال به کانال ناموفق بود");
    return { ok: true, messageId: res.messageId, lang, symbol, tf };
  },
});

/**
 * Admin: manually post ONE signal to the Persian (channel.id) or English
 * (channel.enId) Telegram channel. A watermarked chart image is attached,
 * then the full details (hashtags, entry/SL/TP, reasons, sparkline, ID) as a
 * follow-up text message. Timestamps sentFaAt / sentEnAt are stored on the
 * signal so the panel shows where each signal was posted.
 */
export const sendSignalToChannel = action({
  args: {
    token: v.string(),
    signalId: v.id("signals"),
    lang: v.union(v.literal("fa"), v.literal("en")),
  },
  handler: async (ctx, { token, signalId, lang }): Promise<any> => {
    await ctx.runQuery(internal.brokerData.assertAdmin, { token });
    const sig = await ctx.runQuery(internal.admin.getSignalInternal, { signalId });
    if (!sig) throw new Error("سیگنال یافت نشد");
    const settings = (await ctx.runQuery(internal.settings.rawSettings, {})) as Record<string, any>;
    const botToken = String(settings["telegram.token"] ?? "");
    const chatId = lang === "fa" ? String(settings["channel.id"] ?? "") : String(settings["channel.enId"] ?? "");
    if (!botToken) throw new Error("توکن ربات تلگرام تنظیم نشده است (اتصالات)");
    if (!chatId) throw new Error(lang === "fa" ? "آیدی کانال فارسی تنظیم نشده است" : "English channel ID is not set (Connections)");

    // Candle closes for the sparkline (same symbol, any timeframe — best effort).
    let closes: number[] = [];
    try {
      const rows = await ctx.runQuery(internal.admin.candlesForSignal, { symbol: sig.symbol, timeframe: sig.timeframe ?? "15m" });
      closes = rows ?? [];
    } catch {
      // sparkline stays empty — message is still useful
    }

    const text = buildSignalMessage(
      {
        symbol: sig.symbol,
        direction: sig.direction === "short" ? "short" : "long",
        timeframe: sig.timeframe ?? "15m",
        entry: sig.entry,
        stopLoss: sig.stopLoss,
        takeProfit: sig.takeProfit,
        targets: sig.targets ?? [],
        rr: sig.rr,
        score: sig.score,
        confidence: sig.confidence,
        price: sig.price,
        reasons: lang === "fa" ? sig.reasonsFa ?? [] : (sig.reasonsEn?.length ? sig.reasonsEn : sig.reasonsFa ?? []),
        closes,
        createdAt: sig.created,
        id: String(signalId),
      },
      lang === "fa",
    );

    // Real chart image (watermarked PNG) attached to the post, then the full
    // details as a follow-up text message (photo captions cap at 1024 chars).
    let photoId: number | undefined;
    try {
      const ohlc = await ctx.runQuery(internal.admin.candlesOhlc, { symbol: sig.symbol, timeframe: sig.timeframe ?? "15m", limit: 60 });
      if (ohlc.length > 0) {
        const png = renderCandleChartPng(
          {
            symbol: sig.symbol,
            timeframe: sig.timeframe ?? "15m",
            candles: ohlc,
            entry: sig.entry,
            stopLoss: sig.stopLoss,
            takeProfit: sig.takeProfit,
            watermark: "WOLF AI",
            lang: lang === "fa" ? "fa" : "en",
          },
          deflateSync,
        );
        const shortCaption =
          lang === "fa"
            ? `🐺 <b>سیگنال ${sig.symbol}</b> · ${sig.direction === "short" ? "SHORT" : "LONG"} · ${sig.timeframe ?? "—"} — #${sig.symbol} #wolf_ai #signal`
            : `🐺 <b>${sig.symbol} signal</b> · ${sig.direction === "short" ? "SHORT" : "LONG"} · ${sig.timeframe ?? "—"} — #${sig.symbol} #wolf_ai #signal`;
        const photo = await ctx.runAction(internal.nodeCalls.telegramSendPhoto, {
          token: botToken,
          chatId,
          photo: Buffer.from(png).toString("base64"),
          caption: shortCaption,
          parseMode: "HTML",
          silent: true,
        });
        photoId = (photo as any)?.messageId;
      }
    } catch (e: any) {
      // image attach is best-effort — the text post below still goes out
      console.warn(`[signal] photo attach failed: ${e?.message ?? e}`);
    }
    const res = (await ctx.runAction(internal.nodeCalls.telegramSend, {
      token: botToken,
      chatId,
      text,
      parseMode: "HTML",
      silent: true,
    })) as { ok?: boolean; messageId?: number };
    if (!res?.ok) throw new Error("ارسال به کانال ناموفق بود");
    await ctx.runMutation(internal.admin.markSignalSent, { signalId, lang });
    return { ok: true, messageId: res.messageId, photoId, lang, signalId };
  },
});
