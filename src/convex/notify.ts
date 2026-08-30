// ---------------------------------------------------------------------------
// Telegram notify actions — isolated in their own module so `internal.*`
// references never create a circular type between two actions in one file.
//   notifyChat  → sendMessage to any chat (admin, channel, user)
//   notifyAdmin → short admin alert (deposits, withdrawals, VIP requests…)
// ---------------------------------------------------------------------------
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/** Sends a Telegram message to any chat (admin, channel, or a user). */
export const notifyChat = internalAction({
  args: {
    chatId: v.string(),
    text: v.string(),
    parseMode: v.optional(v.union(v.literal("HTML"), v.literal("Markdown"))),
  },
  handler: async (
    ctx,
    { chatId, text, parseMode },
  ): Promise<{ ok: boolean; reason?: string }> => {
    const settings = await ctx.runQuery(internal.settings.rawSettings, {});
    const token = String(settings["telegram.token"] ?? "");
    const enabled = settings["telegram.enabled"] !== false;
    if (!token || !enabled || !chatId) return { ok: false, reason: "not_configured" };
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: parseMode ?? "HTML",
          disable_web_page_preview: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok !== true) {
        return { ok: false, reason: String(data?.description ?? "send_failed") };
      }
      await ctx.runMutation(internal.telegram.recordMessage, {
        chatId,
        direction: "out",
        type: "alert",
        text: text.slice(0, 1000),
        status: "sent",
      });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, reason: String(e?.message ?? "error") };
    }
  },
});

/** Sends a short admin alert (deposits / withdrawals / VIP requests…). */
export const notifyAdmin = internalAction({
  args: { text: v.string() },
  handler: async (
    ctx,
    { text },
  ): Promise<{ ok: boolean; reason?: string }> => {
    const settings = await ctx.runQuery(internal.settings.rawSettings, {});
    if (settings["telegram.alertsToAdmin"] === false) return { ok: false, reason: "disabled" };
    const adminId = String(settings["telegram.adminId"] ?? "");
    if (!adminId) return { ok: false, reason: "no_admin_id" };
    return ctx.runAction(internal.notify.notifyChat, {
      chatId: adminId,
      text: `🐺 <b>Trading Wolf AI</b>\n${text}`,
    });
  },
});

/** Sends a full position/signal digest to the channel (with Mini App button). */
export const notifyChannel = internalAction({
  args: {
    text: v.string(),
    buttonText: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { text, buttonText },
  ): Promise<{ ok: boolean; reason?: string; targets?: Array<{ chatId: string; ok: boolean; reason?: string }> }> => {
    const settings = await ctx.runQuery(internal.settings.rawSettings, {});
    if (settings["channel.enabled"] === false) return { ok: false, reason: "channel_disabled" };
    const channelId = String(settings["channel.id"] ?? "");
    if (!channelId) return { ok: false, reason: "no_channel_id" };
    const miniAppUrl = String(settings["telegram.miniAppUrl"] ?? "");
    const replyMarkup =
      miniAppUrl && (buttonText ?? "").length > 0
        ? JSON.stringify({
            inline_keyboard: [[{ text: buttonText, web_app: { url: miniAppUrl } }]],
          })
        : undefined;
    const token = String(settings["telegram.token"] ?? "");
    const enabled = settings["telegram.enabled"] !== false;
    if (!token || !enabled) return { ok: false, reason: "not_configured" };
    // Bilingual: post to BOTH the fa channel and the en channel (when set).
    const targets = [channelId, String(settings["channel.enId"] ?? "")].filter(Boolean);
    const results: Array<{ chatId: string; ok: boolean; reason?: string }> = [];
    for (const chatId of targets) {
      try {
        const body: Record<string, any> = {
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        };
        if (replyMarkup) body.reply_markup = replyMarkup;
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok || data?.ok !== true) {
          results.push({ chatId, ok: false, reason: String(data?.description ?? "send_failed") });
          continue;
        }
        await ctx.runMutation(internal.telegram.recordMessage, {
          chatId,
          direction: "out",
          type: "channel",
          text: text.slice(0, 1000),
          status: "sent",
        });
        results.push({ chatId, ok: true });
      } catch (e: any) {
        results.push({ chatId, ok: false, reason: String(e?.message ?? "error") });
      }
    }
    const anyOk = results.some((r) => r.ok);
    return { ok: anyOk, targets: results, reason: anyOk ? undefined : (results[0]?.reason ?? "send_failed") };
  },
});
