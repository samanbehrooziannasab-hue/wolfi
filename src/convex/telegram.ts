import { v } from "convex/values";
import { action, httpAction, internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireAdmin } from "./wolfAuth";
import { buildInviteLink, membershipStatusOk } from "./aiPolicy";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Formats a position into the standard Telegram trade card (FA/EN). */
export function formatPositionMessage(
  p: any,
  opts: { lang?: "fa" | "en"; kind?: "open" | "close" | "detail" } = {},
): string {
  const fa = opts.lang !== "en";
  const side = p.side === "long" ? "🟢" : "🔴";
  const sideTxt = fa
    ? (p.side === "long" ? "📈 خرید / LONG" : "📉 فروش / SHORT")
    : (p.side === "long" ? "📈 LONG" : "📉 SHORT");
  const kind =
    opts.kind === "close"
      ? fa ? "🔴 معامله بسته شد ✅" : "🔴 Trade closed ✅"
      : opts.kind === "detail"
        ? fa ? "🔎 جزئیات معامله" : "🔎 Position details"
        : fa ? "🟢 معامله باز شد 🚀" : "🟢 Trade opened 🚀";
  const market = p.market === "crypto" ? (fa ? "🪙 کریپتو" : "🪙 Crypto") : fa ? "💱 فارکس" : "💱 Forex";
  const tf = p.timeframe ? ` | ⏱️ TF: ${p.timeframe}` : "";
  const lines: string[] = [
    `${kind}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📊 <b>${p.symbol}</b> · ${market}${tf}`,
    `${side} ${sideTxt}`,
    `⭐ ${fa ? "امتیاز" : "Score"}: ${Math.round(p.score ?? 0)}/100 · 🎯 ${fa ? "اطمینان" : "Conf"}: ${Math.round((p.confidence ?? 0) * 100)}%`,
  ];
  if (p.strategyKeys?.length) lines.push(`🧠 ${fa ? "استراتژی" : "Strategy"}: ${p.strategyKeys.join(", ")}`);
  lines.push(
    `📥 ${fa ? "ورود" : "Entry"}: <code>${fmtPrice(p.entry, p.market)}</code>`,
    `⛔ ${fa ? "حد ضرر" : "SL"}: <code>${fmtPrice(p.stopLoss, p.market)}</code>`,
    `🎯 ${fa ? "هدف" : "TP"}: <code>${fmtPrice(p.takeProfit, p.market)}</code>`,
  );
  if (p.targets?.length) lines.push(`🎯 ${fa ? "اهداف" : "Targets"}: ${p.targets.map((t: number) => `<code>${fmtPrice(t, p.market)}</code>`).join(" · ")}`);
  if (p.current) lines.push(`📈 ${fa ? "قیمت لحظه‌ای" : "Current"}: <code>${fmtPrice(p.current, p.market)}</code>`);
  if (p.pnl !== undefined) lines.push(`💰 P/L: ${p.pnl >= 0 ? "🟢+" : "🔴"}${p.pnl.toFixed(4)} USDT (${p.pnlPct?.toFixed(2) ?? "0"}%)`);
  if (opts.kind === "close" && p.closeReason) lines.push(`🚪 ${fa ? "دلیل بستن" : "Close"}: ${p.closeReason}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  if (p._id) lines.push(`🆔 ID: <code>${String(p._id).slice(-10)}</code>`);
  lines.push(`#WOLF_TRADE 🐺`);
  return lines.join("\n");
}

function fmtPrice(n: number | undefined, market?: string): string {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: market === "forex" ? 5 : 4 });
}

function textFor(language: string | undefined, fa: string, en: string): string {
  return language === "en" ? en : fa;
}

async function telegramRequest(token: string, method: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data?.ok !== true) throw new Error(data?.description ?? `telegram_${method}_failed`);
  return data.result;
}

async function sendMsg(token: string, chatId: string, text: string, replyMarkup?: any) {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return telegramRequest(token, "sendMessage", body);
}

async function editMsg(token: string, chatId: string, msgId: number, text: string, replyMarkup?: any) {
  const body: Record<string, unknown> = { chat_id: chatId, message_id: msgId, text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return telegramRequest(token, "editMessageText", body).catch(() => null);
}

async function deleteMsg(token: string, chatId: string, msgId: number) {
  return telegramRequest(token, "deleteMessage", { chat_id: chatId, message_id: msgId }).catch(() => null);
}

async function answerCb(token: string, cbId: string, text?: string, showAlert?: boolean) {
  return telegramRequest(token, "answerCallbackQuery", { callback_query_id: cbId, text: text ?? "", show_alert: Boolean(showAlert) }).catch(() => null);
}

// ─── Menu keyboards (all inline) ────────────────────────────────────────────

function userMenuKb(lang: string, hasAccount = true) {
  const fa = lang !== "en";
  const rows: any[][] = [
    [{ text: "🐺 " + (fa ? "🚀 ورود به پلتفرم" : "🚀 Open Platform"), web_app: { url: "PLACEHOLDER_MINI_APP" } }],
  ];
  if (hasAccount) {
    rows.push([
      { text: "💰 " + (fa ? "📦 موجودی" : "💰 Balance"), callback_data: "menu:balance" },
      { text: "🔔 " + (fa ? "🔔 اعلان‌ها" : "🔔 Alerts"), callback_data: "menu:alerts" },
    ]);
  }
  rows.push(
    [
      { text: "📈 " + (fa ? "📊 پوزیشن‌ها" : "📈 Positions"), callback_data: "menu:positions" },
      { text: "📩 " + (fa ? "💬 پشتیبانی" : "💬 Support"), callback_data: "menu:support" },
    ],
    [
      { text: "🌐 " + (fa ? "🌐 تغییر زبان" : "🌐 Language"), callback_data: "menu:lang" },
    ],
  );
  return { inline_keyboard: rows };
}

function adminMenuKb(lang: string) {
  const fa = lang !== "en";
  return {
    inline_keyboard: [
      [{ text: "🐺 " + (fa ? "⚡ پنل مدیریت" : "⚡ Admin Panel"), web_app: { url: "PLACEHOLDER_MINI_APP" } }],
      [
        { text: "📊 " + (fa ? "📊 آمار" : "📊 Stats"), callback_data: "admin:stats" },
        { text: "🔔 " + (fa ? "🔔 اعلان‌ها" : "🔔 Alerts"), callback_data: "menu:alerts" },
      ],
      [
        { text: "📩 " + (fa ? "📩 تیکت‌ها" : "📩 Tickets"), callback_data: "admin:tickets" },
        { text: "🔍 " + (fa ? "🔍 خطاها" : "🔍 Errors"), callback_data: "admin:errors" },
      ],
      [
        { text: "🌐 " + (fa ? "🌐 تغییر زبان" : "🌐 Language"), callback_data: "menu:lang" },
      ],
    ],
  };
}

function langPickerKb() {
  return {
    inline_keyboard: [
      [{ text: "🇮🇷 🇮🇷 فارسی", callback_data: "lang:fa" }, { text: "🇬🇧 🇬🇧 English", callback_data: "lang:en" }],
    ],
  };
}

function phoneRequestKbInline(lang: string) {
  const fa = lang !== "en";
  // Telegram only supports request_contact on reply keyboards, so we provide
  // an info button + ask user to type their number below.
  return {
    inline_keyboard: [
      [{ text: fa ? "⌨️ شماره موبایل خود را تایپ کنید 👇" : "⌨️ Type your phone number below 👇", callback_data: "noop" }],
      [{ text: fa ? "❌ انصراف" : "❌ Cancel", callback_data: "menu:back" }],
    ],
  };
}

function channelCheckKb(lang: string, inviteLink: string) {
  const fa = lang !== "en";
  const kb: any[][] = [];
  if (inviteLink) kb.push([{ text: "🔗 " + (fa ? "عضویت در کانال" : "Join channel"), url: inviteLink }]);
  kb.push([{ text: "✅ " + (fa ? "بررسی عضویت" : "Check membership"), callback_data: "chk_member" }]);
  return { inline_keyboard: kb };
}

function ticketReplyKb(lang: string, ticketId: string) {
  const fa = lang !== "en";
  return {
    inline_keyboard: [
      [
        { text: "💬 " + (fa ? "پاسخ" : "Reply"), callback_data: `ticket:reply:${ticketId}` },
        { text: "✅ " + (fa ? "بستن" : "Close"), callback_data: `ticket:close:${ticketId}` },
      ],
      [{ text: "◀️ " + (fa ? "بازگشت" : "Back"), callback_data: "admin:tickets" }],
    ],
  };
}

// ─── Webhook handler ────────────────────────────────────────────────────────

export const webhook = httpAction(async (ctx, request) => {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const settings = await ctx.runQuery(internal.settings.rawSettings, {});
  const secret = String(settings["telegram.webhookSecret"] ?? "");
  const suppliedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (secret && suppliedSecret !== secret) return new Response("Unauthorized", { status: 401 });

  let update: any;
  try { update = await request.json(); } catch { return new Response("Bad Request", { status: 400 }); }

  const token = String(settings["telegram.token"] ?? "");
  if (!token) return new Response("Telegram token is not configured", { status: 503 });

  const adminTgId = Number(settings["telegram.adminId"] ?? 0);

  // ── callback_query (inline keyboard taps) ──────────────────────────────
  if (update.callback_query) {
    const cq = update.callback_query;
    const from = cq.from;
    const chatId = String(from.id);
    const data: string = String(cq.data ?? "");
    const userDoc = await ctx.runQuery(internal.telegram.userByTgId, { tgId: Number(from.id) });
    const lang = userDoc?.language ?? (from.language_code === "en" ? "en" : "fa");
    const isAdmin = adminTgId > 0 && Number(from.id) === adminTgId;

    // ── noop (info button, just dismiss) ──
    if (data === "noop") {
      await answerCb(token, cq.id, lang === "fa" ? "⌨️ لطفاً شماره را تایپ کنید" : "⌨️ Please type your number");
      return Response.json({ ok: true });
    }

    // ── Language picker ──
    if (data.startsWith("lang:")) {
      const picked = data === "lang:en" ? "en" : "fa";
      await ctx.runMutation(internal.telegram.setLanguage, { tgId: Number(from.id), language: picked });
      await deleteMsg(token, chatId, cq.message?.message_id);
      await answerCb(token, cq.id, picked === "fa" ? "🇮🇷 زبان فارسی انتخاب شد ✓" : "🇬🇧 English selected ✓");

      const existing = await ctx.runQuery(internal.telegram.userByTgId, { tgId: Number(from.id) });
      if (existing?.phoneVerified) {
        const miniApp = String(settings["telegram.miniAppUrl"] ?? settings["system.domain"] ?? "");
        const kb = isAdmin ? adminMenuKb(picked) : userMenuKb(picked);
        if (miniApp) (kb.inline_keyboard[0][0] as any).web_app.url = miniApp;
        await sendMsg(token, chatId, textFor(picked,
          `🐺 <b>Trading Wolf AI</b>\n\n🎯 سلام! 👋 خوش آمدید.\n\n🤖 من دستیار هوشمند شما هستم.\n📊 از منوی زیر استفاده کنید:`,
          `🐺 <b>Trading Wolf AI</b>\n\n🎯 Hello! 👋 Welcome.\n\n🤖 I'm your smart assistant.\n📊 Use the menu below:`,
        ), kb);
      } else {
        await sendMsg(token, chatId, textFor(picked,
          `👋 <b>مرحله تأیید حساب</b>\n\n📱 لطفاً شماره موبایل خود را در همین چت تایپ کنید.\n\n📌 مثال: <code>+989121234567</code>`,
          `👋 <b>Account Verification</b>\n\n📱 Please type your phone number in this chat.\n\n📌 Example: <code>+14155551234</code>`,
        ), phoneRequestKbInline(picked));
      }
      return Response.json({ ok: true });
    }

    // ── Channel membership check ──
    if (data === "chk_member") {
      await answerCb(token, cq.id, textFor(lang, "🔍 در حال بررسی...", "🔍 Checking..."));
      const required = settings["channel.required"] !== false && settings["channel.enabled"] !== false;
      const channelId = String(settings["channel.id"] ?? "").trim();
      const channelUsername = String(settings["channel.username"] ?? "").trim().replace(/^@/, "");
      let member = true;
      if (required && (channelId || channelUsername)) {
        try {
          const status = await telegramRequest(token, "getChatMember", { chat_id: channelId || `@${channelUsername}`, user_id: Number(from.id) });
          member = membershipStatusOk(status?.status);
        } catch { member = true; }
      }
      await ctx.runMutation(internal.telegram.setVerification, { tgId: Number(from.id), channelVerified: member });
      if (member) {
        await deleteMsg(token, chatId, cq.message?.message_id).catch(() => null);
        const miniApp = String(settings["telegram.miniAppUrl"] ?? settings["system.domain"] ?? "");
        const kb = isAdmin ? adminMenuKb(lang) : userMenuKb(lang);
        if (miniApp) (kb.inline_keyboard[0][0] as any).web_app.url = miniApp;
        await sendMsg(token, chatId, textFor(lang,
          `✅ <b>عضویت تأیید شد! 🎉</b>\n\n🎉 خوش آمدید!\n📊 از منوی زیر استفاده کنید:`,
          `✅ <b>Membership verified! 🎉</b>\n\n🎉 Welcome!\n📊 Use the menu below:`,
        ), kb);
      } else {
        const channelInvite = buildInviteLink(channelUsername, String(settings["channel.inviteLink"] ?? ""));
        await answerCb(token, cq.id, textFor(lang, "❌ عضو کانال نیستید", "❌ Not a channel member"), true);
        await editMsg(token, chatId, cq.message?.message_id, textFor(lang,
          `⚠️ <b>شما هنوز عضو کانال نیستید! ⚠️</b>\n\n🔗 ابتدا عضو شوید و سپس دکمه بررسی را بزنید.`,
          `⚠️ <b>You are not a channel member yet! ⚠️</b>\n\n🔗 Join first, then tap the check button.`,
        ), channelCheckKb(lang, channelInvite));
      }
      return Response.json({ ok: true });
    }

    // ── Menu: Balance (only if connected) ──
    if (data === "menu:balance") {
      await answerCb(token, cq.id);
      if (!userDoc?.phoneVerified) {
        await answerCb(token, cq.id, textFor(lang, "⚠️ ابتدا حساب خود را تأیید کنید", "⚠️ Verify your account first"), true);
        return Response.json({ ok: true });
      }
      const uDoc = await ctx.runQuery(internal.telegram.getUserForBot, { tgId: Number(from.id) });
      const wallet = (uDoc as any)?.wallet ?? {};
      const bal = Number(wallet.balance ?? 0).toFixed(2);
      const frozen = Number(wallet.frozen ?? 0).toFixed(2);
      const miniApp = String(settings["telegram.miniAppUrl"] ?? settings["system.domain"] ?? "");
      const kb = {
        inline_keyboard: [
          [{ text: "🐺 " + (lang === "fa" ? "💰 ورود به کیف پول" : "💰 Open Wallet"), web_app: { url: miniApp || "https://t.me" } }],
          [{ text: "◀️ " + (lang === "fa" ? "بازگشت" : "Back"), callback_data: "menu:back" }],
        ],
      };
      await editMsg(token, chatId, cq.message?.message_id, textFor(lang,
        `💰 <b>📦 موجودی شما</b>\n\n━━━━━━━━━━━━━━━━━━━━\n💵 ${lang === "fa" ? "قابل برداشت" : "Available"}: <b>$${bal}</b>\n🔒 ${lang === "fa" ? "یخ‌زده" : "Frozen"}: <b>$${frozen}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n💡 ${lang === "fa" ? "برای مدیریت کیف پول وارد پنل شوید." : "Open the panel to manage your wallet."}`,
        `💰 <b>📦 Your Balance</b>\n\n━━━━━━━━━━━━━━━━━━━━\n💵 Available: <b>$${bal}</b>\n🔒 Frozen: <b>$${frozen}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n💡 Open the panel to manage your wallet.`,
      ), kb);
      return Response.json({ ok: true });
    }

    // ── Menu: Positions ──
    if (data === "menu:positions") {
      await answerCb(token, cq.id);
      const myPositions = await ctx.runQuery(internal.telegram.getOpenPositions, {});
      if (myPositions.length === 0) {
        await answerCb(token, cq.id, textFor(lang, "📭 پوزیشن بازی نیست", "📭 No open positions"));
      } else {
        const lines = myPositions.slice(0, 5).map((p: any) => {
          const side = p.side === "long" ? "🟢" : "🔴";
          return `${side} <b>${p.symbol}</b> ${p.side.toUpperCase()} | P/L: ${p.pnl >= 0 ? "🟢+" : "🔴"}${p.pnl?.toFixed(2) ?? "0"}%`;
        });
        await editMsg(token, chatId, cq.message?.message_id, textFor(lang,
          `📈 <b>📊 پوزیشن‌های باز:</b>\n\n${lines.join("\n")}\n\n💡 ${lang === "fa" ? "برای جزئیات وارد پنل شوید." : "Open the panel for details."}`,
          `📈 <b>📊 Open Positions:</b>\n\n${lines.join("\n")}\n\n💡 Open the panel for details.`,
        ), {
          inline_keyboard: [
            [{ text: "🐺 " + (lang === "fa" ? "🚀 ورود به پلتفرم" : "🚀 Open Platform"), web_app: { url: String(settings["telegram.miniAppUrl"] ?? "") || "https://t.me" } }],
            [{ text: "◀️ " + (lang === "fa" ? "بازگشت" : "Back"), callback_data: "menu:back" }],
          ],
        });
      }
      return Response.json({ ok: true });
    }

    // ── Menu: Alerts ──
    if (data === "menu:alerts") {
      await answerCb(token, cq.id);
      const uDoc = await ctx.runQuery(internal.telegram.getUserForBot, { tgId: Number(from.id) });
      const enabled = Boolean((uDoc as any)?.notificationsEnabled ?? true);
      const kb = {
        inline_keyboard: [
          [{ text: enabled ? "🔕 " + (lang === "fa" ? "غیرفعال کردن اعلان‌ها" : "Disable alerts") : "🔔 " + (lang === "fa" ? "فعال کردن اعلان‌ها" : "Enable alerts"), callback_data: "menu:toggle_alerts" }],
          [{ text: "◀️ " + (lang === "fa" ? "بازگشت" : "Back"), callback_data: "menu:back" }],
        ],
      };
      await editMsg(token, chatId, cq.message?.message_id, textFor(lang,
        `🔔 <b>⚙️ تنظیمات اعلان‌ها</b>\n\n📊 ${lang === "fa" ? "وضعیت فعلی" : "Current status"}: ${enabled ? "✅ فعال" : "❌ غیرفعال"}\n\n📈 ${lang === "fa" ? "شما اعلان‌های زیر را دریافت می‌کنید" : "You receive these alerts"}:\n• 📈 ${lang === "fa" ? "سیگنال‌های معاملاتی" : "Trading signals"}\n• 📊 ${lang === "fa" ? "گزارش روزانه موتور" : "Daily engine reports"}\n• 📚 ${lang === "fa" ? "درس‌های آموزشی" : "Educational lessons"}`,
        `🔔 <b>⚙️ Alert Settings</b>\n\n📊 Current status: ${enabled ? "✅ Enabled" : "❌ Disabled"}\n\n📈 You receive these alerts:\n• 📈 Trading signals\n• 📊 Daily engine reports\n• 📚 Educational lessons`,
      ), kb);
      return Response.json({ ok: true });
    }

    if (data === "menu:toggle_alerts") {
      await answerCb(token, cq.id);
      const uDoc = await ctx.runQuery(internal.telegram.getUserForBot, { tgId: Number(from.id) });
      const current = Boolean((uDoc as any)?.notificationsEnabled ?? true);
      if (uDoc) await ctx.runMutation(internal.telegram.setNotifications, { tgId: Number(from.id), enabled: !current });
      const next = !current;
      await answerCb(token, cq.id, next ? (lang === "fa" ? "✅ اعلان‌ها فعال شد" : "✅ Alerts enabled") : (lang === "fa" ? "🔕 اعلان‌ها غیرفعال شد" : "🔕 Alerts disabled"));
      const kb = {
        inline_keyboard: [
          [{ text: next ? "🔕 " + (lang === "fa" ? "غیرفعال کردن اعلان‌ها" : "Disable alerts") : "🔔 " + (lang === "fa" ? "فعال کردن اعلان‌ها" : "Enable alerts"), callback_data: "menu:toggle_alerts" }],
          [{ text: "◀️ " + (lang === "fa" ? "بازگشت" : "Back"), callback_data: "menu:back" }],
        ],
      };
      await editMsg(token, chatId, cq.message?.message_id, textFor(lang,
        `🔔 <b>⚙️ تنظیمات اعلان‌ها</b>\n\n📊 ${lang === "fa" ? "وضعیت فعلی" : "Current status"}: ${next ? "✅ فعال" : "❌ غیرفعال"}\n\n📈 ${lang === "fa" ? "شما اعلان‌های زیر را دریافت می‌کنید" : "You receive these alerts"}:\n• 📈 ${lang === "fa" ? "سیگنال‌های معاملاتی" : "Trading signals"}\n• 📊 ${lang === "fa" ? "گزارش روزانه موتور" : "Daily engine reports"}\n• 📚 ${lang === "fa" ? "درس‌های آموزشی" : "Educational lessons"}`,
        `🔔 <b>⚙️ Alert Settings</b>\n\n📊 Current status: ${next ? "✅ Enabled" : "❌ Disabled"}\n\n📈 You receive these alerts:\n• 📈 Trading signals\n• 📊 Daily engine reports\n• 📚 Educational lessons`,
      ), kb);
      return Response.json({ ok: true });
    }

    // ── Menu: Support ──
    if (data === "menu:support") {
      await answerCb(token, cq.id);
      await editMsg(token, chatId, cq.message?.message_id, textFor(lang,
        `💬 <b>📩 پشتیبانی</b>\n\n📝 ${lang === "fa" ? "برای ارسال تیکت پشتیبانی، لطفاً پیام خود را در همین چت بنویسید." : "To send a support ticket, type your message in this chat."}\n\n📬 ${lang === "fa" ? "تیکت شما به مدیریت ارسال می‌شود." : "Your ticket will be forwarded to management."}\n\n⏰ ${lang === "fa" ? "پاسخ معمولاً ظرف ۲۴ ساعت ارسال می‌شود." : "Replies usually within 24 hours."}`,
        `💬 <b>📩 Support</b>\n\n📝 To send a support ticket, type your message in this chat.\n\n📬 Your ticket will be forwarded to management.\n\n⏰ Replies usually within 24 hours.`,
      ), {
        inline_keyboard: [
          [{ text: "🐺 " + (lang === "fa" ? "📄 ارسال تیکت از پنل" : "📄 Submit from panel"), web_app: { url: String(settings["telegram.miniAppUrl"] ?? "") || "https://t.me" } }],
          [{ text: "◀️ " + (lang === "fa" ? "بازگشت" : "Back"), callback_data: "menu:back" }],
        ],
      });
      return Response.json({ ok: true });
    }

    // ── Menu: Language ──
    if (data === "menu:lang") {
      await answerCb(token, cq.id);
      await editMsg(token, chatId, cq.message?.message_id, textFor(lang,
        `🌐 <b>⚙️ انتخاب زبان</b>\n\n🎯 ${lang === "fa" ? "لطفاً زبان مورد نظر خود را انتخاب کنید:" : "Please select your preferred language:"}`,
        `🌐 <b>⚙️ Choose Language</b>\n\n🎯 Please select your preferred language:`,
      ), langPickerKb());
      return Response.json({ ok: true });
    }

    // ── Menu: Back ──
    if (data === "menu:back") {
      await answerCb(token, cq.id);
      const miniApp = String(settings["telegram.miniAppUrl"] ?? settings["system.domain"] ?? "");
      const kb = isAdmin ? adminMenuKb(lang) : userMenuKb(lang);
      if (miniApp) (kb.inline_keyboard[0][0] as any).web_app.url = miniApp;
      await editMsg(token, chatId, cq.message?.message_id, textFor(lang,
        `🐺 <b>Trading Wolf AI</b>\n\n📋 ${lang === "fa" ? "منوی اصلی" : "Main menu"} 👇`,
        `🐺 <b>Trading Wolf AI</b>\n\n📋 Main menu 👇`,
      ), kb);
      return Response.json({ ok: true });
    }

    // ── Admin: Stats ──
    if (data === "admin:stats") {
      if (!isAdmin) { await answerCb(token, cq.id, lang === "fa" ? "⛔ دسترسی ندارید" : "⛔ Access denied", true); return Response.json({ ok: true }); }
      await answerCb(token, cq.id);
      const uStats = await ctx.runQuery(internal.telegram.countUsers, {});
      const pStats = await ctx.runQuery(internal.telegram.countPositions, {});
      await editMsg(token, chatId, cq.message?.message_id, textFor(lang,
        `📊 <b>📈 آمار سیستم</b>\n\n━━━━━━━━━━━━━━━━━━━━\n👥 ${lang === "fa" ? "کل کاربران" : "Total users"}: <b>${uStats.total}</b>\n🟢 ${lang === "fa" ? "فعال (۲۴ساعت)" : "Active (24h)"}: <b>${uStats.active24h}</b>\n📈 ${lang === "fa" ? "پوزیشن‌های باز" : "Open positions"}: <b>${pStats.total}</b> (🟢 ${pStats.longs} / 🔴 ${pStats.shorts})\n━━━━━━━━━━━━━━━━━━━━`,
        `📊 <b>📈 System Stats</b>\n\n━━━━━━━━━━━━━━━━━━━━\n👥 Total users: <b>${uStats.total}</b>\n🟢 Active (24h): <b>${uStats.active24h}</b>\n📈 Open positions: <b>${pStats.total}</b> (🟢 ${pStats.longs} / 🔴 ${pStats.shorts})\n━━━━━━━━━━━━━━━━━━━━`,
      ), { inline_keyboard: [[{ text: "◀️ " + (lang === "fa" ? "بازگشت" : "Back"), callback_data: "menu:back" }]] });
      return Response.json({ ok: true });
    }

    // ── Admin: Tickets list ──
    if (data === "admin:tickets") {
      if (!isAdmin) { await answerCb(token, cq.id, lang === "fa" ? "⛔ دسترسی ندارید" : "⛔ Access denied", true); return Response.json({ ok: true }); }
      await answerCb(token, cq.id);
      const tickets = await ctx.runQuery(internal.telegram.recentTickets, {});
      if (tickets.length === 0) {
        await editMsg(token, chatId, cq.message?.message_id, textFor(lang,
          `📩 <b>📋 تیکت‌ها</b>\n\n📭 ${lang === "fa" ? "تیکتی وجود ندارد." : "No tickets found."}`,
          `📩 <b>📋 Tickets</b>\n\n📭 No tickets found.`,
        ), { inline_keyboard: [[{ text: "◀️ " + (lang === "fa" ? "بازگشت" : "Back"), callback_data: "menu:back" }]] });
      } else {
        const rows: any[][] = tickets.map((t: any) => [
          { text: `📩 #${t.id} — ${t.subject ?? (lang === "fa" ? "بدون موضوع" : "No subject")} [${t.status}]`, callback_data: `ticket:view:${String(t._id)}` },
        ]);
        rows.push([{ text: "◀️ " + (lang === "fa" ? "بازگشت" : "Back"), callback_data: "menu:back" }]);
        await editMsg(token, chatId, cq.message?.message_id, textFor(lang,
          `📩 <b>📋 تیکت‌های اخیر</b>\n\n${tickets.map((t: any, i: number) => `${i + 1}. <b>#${t.id}</b> — ${t.subject ?? "—"} [${t.status}] (${t.msgs} msg)`).join("\n")}\n\n👇 ${lang === "fa" ? "روی تیکت کلیک کنید" : "Tap a ticket to view"}`,
          `📩 <b>📋 Recent Tickets</b>\n\n${tickets.map((t: any, i: number) => `${i + 1}. <b>#${t.id}</b> — ${t.subject ?? "—"} [${t.status}] (${t.msgs} msg)`).join("\n")}\n\n👇 Tap a ticket to view`,
        ), { inline_keyboard: rows });
      }
      return Response.json({ ok: true });
    }

    // ── Admin: View single ticket ──
    if (data.startsWith("ticket:view:")) {
      const ticketId = data.slice("ticket:view:".length);
      await answerCb(token, cq.id);
      const ticket = await ctx.runQuery(internal.telegram.getTicket, { ticketId });
      if (!ticket) {
        await answerCb(token, cq.id, textFor(lang, "❌ تیکت یافت نشد", "❌ Ticket not found"), true);
        return Response.json({ ok: true });
      }
      const lines = (ticket.messages ?? []).map((m: any) =>
        `${m.direction === "in" ? "👤" : "🐺"} ${m.text ?? ""}`
      );
      await editMsg(token, chatId, cq.message?.message_id, textFor(lang,
        `📩 <b>📋 تیکت #${ticketId}</b>\n━━━━━━━━━━━━━━━━━━━━\n👥 ${lang === "fa" ? "کاربر" : "User"}: <b>${ticket.userName ?? "—"}</b>\n📌 ${lang === "fa" ? "وضعیت" : "Status"}: <b>${ticket.status}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n${lines.join("\n\n") || (lang === "fa" ? "📭 پیامی وجود ندارد" : "📭 No messages")}\n\n━━━━━━━━━━━━━━━━━━━━`,
        `📩 <b>📋 Ticket #${ticketId}</b>\n━━━━━━━━━━━━━━━━━━━━\n👥 User: <b>${ticket.userName ?? "—"}</b>\n📌 Status: <b>${ticket.status}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n${lines.join("\n\n") || "📭 No messages"}\n\n━━━━━━━━━━━━━━━━━━━━`,
      ), ticketReplyKb(lang, ticketId));
      return Response.json({ ok: true });
    }

    // ── Admin: Reply to ticket (enter reply mode) ──
    if (data.startsWith("ticket:reply:")) {
      const ticketId = data.slice("ticket:reply:".length);
      await answerCb(token, cq.id);
      // Store pending reply state
      await ctx.runMutation(internal.telegram.setPendingReply, { tgId: Number(from.id), ticketId });
      await sendMsg(token, chatId, textFor(lang,
        `💬 <b>📝 پاسخ به تیکت #${ticketId}</b>\n\n✏️ ${lang === "fa" ? "متن پاسخ خود را تایپ کنید:" : "Type your reply:"}`,
        `💬 <b>📝 Reply to Ticket #${ticketId}</b>\n\n✏️ Type your reply:`,
      ), {
        inline_keyboard: [[{ text: "❌ " + (lang === "fa" ? "لغو" : "Cancel"), callback_data: "menu:back" }]],
      });
      return Response.json({ ok: true });
    }

    // ── Admin: Close ticket ──
    if (data.startsWith("ticket:close:")) {
      const ticketId = data.slice("ticket:close:".length);
      await answerCb(token, cq.id);
      await ctx.runMutation(internal.telegram.closeTicket, { ticketId });
      await editMsg(token, chatId, cq.message?.message_id, textFor(lang,
        `✅ <b>تیکت #${ticketId} بسته شد!</b>\n\n🔴 ${lang === "fa" ? "وضعیت" : "Status"}: closed`,
        `✅ <b>Ticket #${ticketId} closed!</b>\n\n🔴 Status: closed`,
      ), { inline_keyboard: [[{ text: "◀️ " + (lang === "fa" ? "بازگشت" : "Back"), callback_data: "admin:tickets" }]] });
      return Response.json({ ok: true });
    }

    // Unknown callback — just answer
    await answerCb(token, cq.id);
    return Response.json({ ok: true });
  }

  // ── message handling ───────────────────────────────────────────────────
  const message = update?.message;
  const from = message?.from;
  if (!message || !from?.id) return Response.json({ ok: true });

  const chatId = String(message.chat?.id ?? from.id);
  const firstName = String(from.first_name ?? "");
  const lastName = String(from.last_name ?? "");
  const username = from.username ? String(from.username) : undefined;
  const contact = message.contact;
  const text0 = typeof message.text === "string" ? message.text : "";
  const detectedLang = from.language_code === "en" ? "en" : "fa";
  const isAdmin = adminTgId > 0 && Number(from.id) === adminTgId;

  // referral handling
  let pendingReferral: string | undefined;
  if (text0.startsWith("/start")) {
    const parts = text0.split(/\s+/);
    const raw = parts[1] ?? "";
    const code = raw.replace(/^ref_/i, "").trim().toUpperCase();
    if (/^WOLF-[A-Z0-9]{4,12}$/.test(code)) pendingReferral = code;
  }

  // Check for existing user to preserve their chosen language
  const existingUser = await ctx.runQuery(internal.telegram.userByTgId, { tgId: Number(from.id) });
  const preserveLang = existingUser?.language; // may be undefined for new users

  // Upsert user record — preserve chosen language if already set
  await ctx.runMutation(internal.telegram.upsertTelegramUser, {
    tgId: Number(from.id),
    tgUsername: username,
    firstName,
    lastName,
    language: preserveLang ?? detectedLang, // keep user's choice, fallback to Telegram lang
    phone: contact?.phone_number ? String(contact.phone_number) : undefined,
    phoneVerified: Boolean(contact?.phone_number && Number(contact.user_id ?? from.id) === Number(from.id)),
    ...(pendingReferral ? { pendingReferral } : {}),
  });

  // Get fresh user state after upsert
  const userState = await ctx.runQuery(internal.telegram.userByTgId, { tgId: Number(from.id) });
  const userLang = userState?.language ?? preserveLang ?? detectedLang;

  // ── Admin pending reply mode ──
  if (isAdmin && !text0.startsWith("/") && existingUser?.pendingReplyTicketId) {
    // Admin is replying to a ticket
    const ticketId = existingUser.pendingReplyTicketId;
    await ctx.runMutation(internal.telegram.clearPendingReply, { tgId: Number(from.id) });
    await ctx.runMutation(internal.telegram.addTicketReply, { ticketId, text: text0, adminName: firstName });
    // Notify user if possible
    const ticket = await ctx.runQuery(internal.telegram.getTicket, { ticketId });
    if (ticket?.chatId) {
      try {
        await sendMsg(token, ticket.chatId, textFor(ticket.userLang ?? "fa",
          `🐺 <b>💬 پاسخ پشتیبانی</b>\n\n📝 ${text0}\n\n━━━━━━━━━━━━━━━━━━━━\n📩 تیکت #${ticketId}`,
          `🐺 <b>💬 Support Reply</b>\n\n📝 ${text0}\n\n━━━━━━━━━━━━━━━━━━━━\n📩 Ticket #${ticketId}`,
        ));
      } catch { /* user may have blocked bot */ }
    }
    await sendMsg(token, chatId, textFor(userLang,
      `✅ <b>پاسخ ارسال شد! 🎉</b>\n\n📩 تیکت #${ticketId} — ${userLang === "fa" ? "کاربر مطلع شد" : "User notified"}`,
      `✅ <b>Reply sent! 🎉</b>\n\n📩 Ticket #${ticketId} — User notified`,
    ), { inline_keyboard: [[{ text: "◀️ " + (userLang === "fa" ? "بازگشت" : "Back"), callback_data: "admin:tickets" }]] });
    return Response.json({ ok: true });
  }

  // /lang — quick language switch
  if (text0 === "/lang") {
    const next = userLang === "fa" ? "en" : "fa";
    await ctx.runMutation(internal.telegram.setLanguage, { tgId: Number(from.id), language: next });
    await sendMsg(token, chatId, textFor(next,
      "🌐 زبان به فارسی تغییر کرد.\n\n🔄 /start بزنید.",
      "🌐 Language switched to English.\n\n🔄 Press /start to continue.",
    ), { inline_keyboard: [[{ text: next === "fa" ? "🇮🇷 فارسی" : "🇬🇧 English", callback_data: "menu:back" }]] });
    return Response.json({ ok: true });
  }

  // /start — show language picker first
  if (text0 === "/start" || text0 === "/help") {
    if (userState?.phoneVerified) {
      const miniApp = String(settings["telegram.miniAppUrl"] ?? settings["system.domain"] ?? "");
      const kb = isAdmin ? adminMenuKb(userLang) : userMenuKb(userLang);
      if (miniApp) (kb.inline_keyboard[0][0] as any).web_app.url = miniApp;
      await sendMsg(token, chatId, textFor(userLang,
        `🐺 <b>Trading Wolf AI</b>\n\n🎯 سلام ${firstName}! 👋\n🎉 خوش آمدید!\n\n🤖 من دستیار هوشمند شما هستم.\n📊 از منوی زیر استفاده کنید:`,
        `🐺 <b>Trading Wolf AI</b>\n\n🎯 Hello ${firstName}! 👋\n🎉 Welcome!\n\n🤖 I'm your smart assistant.\n📊 Use the menu below:`,
      ), kb);
      return Response.json({ ok: true });
    }
    // Not verified → language picker
    await sendMsg(token, chatId, textFor(userLang,
      `🐺 <b>🎯 به Trading Wolf AI خوش آمدید!</b>\n\n🌐 ${userLang === "fa" ? "لطفاً زبان خود را انتخاب کنید:" : "Please select your language:"}`,
      `🐺 <b>🎯 Welcome to Trading Wolf AI!</b>\n\n🌐 Please select your language:`,
    ), langPickerKb());
    return Response.json({ ok: true });
  }

  // Contact received (only from reply keyboard) — phone verification step
  if (contact) {
    const required = settings["channel.required"] !== false && settings["channel.enabled"] !== false;
    const channelId = String(settings["channel.id"] ?? "").trim();
    const channelUsername = String(settings["channel.username"] ?? "").trim().replace(/^@/, "");
    const inviteLink = buildInviteLink(channelUsername, String(settings["channel.inviteLink"] ?? ""));

    let member = true;
    if (required && (channelId || channelUsername)) {
      try {
        const status = await telegramRequest(token, "getChatMember", { chat_id: channelId || `@${channelUsername}`, user_id: Number(from.id) });
        member = membershipStatusOk(status?.status);
      } catch {
        member = true;
      }
    }
    await ctx.runMutation(internal.telegram.setVerification, { tgId: Number(from.id), channelVerified: member });

    if (!member) {
      await sendMsg(token, chatId, textFor(userLang,
        `⚠️ <b>عضویت در کانال الزامی است! ⚠️</b>\n\n🔗 ${userLang === "fa" ? "برای استفاده از ربات، ابتدا عضو کانال شوید:" : "Join the channel to use the bot:"}`,
        `⚠️ <b>Channel membership is required! ⚠️</b>\n\n🔗 Join the channel to use the bot:`,
      ), channelCheckKb(userLang, inviteLink));
      return Response.json({ ok: true });
    }

    const miniApp = String(settings["telegram.miniAppUrl"] ?? settings["system.domain"] ?? "");
    const kb = isAdmin ? adminMenuKb(userLang) : userMenuKb(userLang);
    if (miniApp) (kb.inline_keyboard[0][0] as any).web_app.url = miniApp;
    await sendMsg(token, chatId, textFor(userLang,
      `✅ <b>تأیید با موفقیت انجام شد! 🎉</b>\n\n🐺 ${firstName} عزیز، خوش آمدید!\n\n🤖 من دستیار هوشمند شما هستم.\n📊 از منوی زیر استفاده کنید:`,
      `✅ <b>Verification complete! 🎉</b>\n\n🐺 Welcome, ${firstName}!\n\n🤖 I'm your smart assistant.\n📊 Use the menu below:`,
    ), kb);
    return Response.json({ ok: true });
  }

  // ── Text: phone number typed by user (for users in phone-request mode) ──
  if (text0 && !text0.startsWith("/") && !userState?.phoneVerified && existingUser) {
    // Try to parse as phone number
    const phoneMatch = text0.replace(/[\s\-()]/g, "").match(/^(\+?\d{8,15})$/);
    if (phoneMatch) {
      // Simulate phone verification
      await ctx.runMutation(internal.telegram.setPhone, { tgId: Number(from.id), phone: phoneMatch[1] });
      // Re-run channel check
      const required = settings["channel.required"] !== false && settings["channel.enabled"] !== false;
      const channelId = String(settings["channel.id"] ?? "").trim();
      const channelUsername = String(settings["channel.username"] ?? "").trim().replace(/^@/, "");
      const inviteLink = buildInviteLink(channelUsername, String(settings["channel.inviteLink"] ?? ""));
      let member = true;
      if (required && (channelId || channelUsername)) {
        try {
          const status = await telegramRequest(token, "getChatMember", { chat_id: channelId || `@${channelUsername}`, user_id: Number(from.id) });
          member = membershipStatusOk(status?.status);
        } catch { member = true; }
      }
      await ctx.runMutation(internal.telegram.setVerification, { tgId: Number(from.id), channelVerified: member });
      if (!member) {
        await sendMsg(token, chatId, textFor(userLang,
          `📱 <b>شماره تأیید شد! ✓</b>\n\n⚠️ ${userLang === "fa" ? "حالا باید عضو کانال شوید:" : "Now join the channel:"}`,
          `📱 <b>Phone verified! ✓</b>\n\n⚠️ Now join the channel:`,
        ), channelCheckKb(userLang, inviteLink));
        return Response.json({ ok: true });
      }
      const miniApp = String(settings["telegram.miniAppUrl"] ?? settings["system.domain"] ?? "");
      const kb = isAdmin ? adminMenuKb(userLang) : userMenuKb(userLang);
      if (miniApp) (kb.inline_keyboard[0][0] as any).web_app.url = miniApp;
      await sendMsg(token, chatId, textFor(userLang,
        `✅ <b>تأیید با موفقیت انجام شد! 🎉</b>\n\n🐺 ${firstName} عزیز، خوش آمدید!\n\n📊 از منوی زیر استفاده کنید:`,
        `✅ <b>Verification complete! 🎉</b>\n\n🐺 Welcome, ${firstName}!\n\n📊 Use the menu below:`,
      ), kb);
      return Response.json({ ok: true });
    }
    // Not a phone number — remind them
    await sendMsg(token, chatId, textFor(userLang,
      `⚠️ ${userLang === "fa" ? "لطفاً شماره موبایل خود را با فرمت صحیح تایپ کنید:" : "Please type your phone number in the correct format:"}\n\n📌 مثال: <code>+989121234567</code>`,
      `⚠️ Please type your phone number in the correct format:\n\n📌 Example: <code>+14155551234</code>`,
    ), phoneRequestKbInline(userLang));
    return Response.json({ ok: true });
  }

  // /balance — quick balance check
  if (text0 === "/balance") {
    if (!userState?.phoneVerified) {
      await sendMsg(token, chatId, textFor(userLang,
        `⚠️ ${userLang === "fa" ? "ابتدا حساب خود را تأیید کنید." : "Verify your account first."}\n\n🔄 /start`,
        `⚠️ Verify your account first.\n\n🔄 /start`,
      ));
      return Response.json({ ok: true });
    }
    const uDoc = await ctx.runQuery(internal.telegram.getUserForBot, { tgId: Number(from.id) });
    const wallet = (uDoc as any)?.wallet ?? {};
    const bal = Number(wallet.balance ?? 0).toFixed(2);
    await sendMsg(token, chatId, textFor(userLang,
      `💰 <b>📦 موجودی فعلی شما</b>\n\n💵 $${bal}\n\n💡 ${userLang === "fa" ? "برای مدیریت کیف پول وارد پنل شوید." : "Open the panel to manage your wallet."}`,
      `💰 <b>📦 Your Current Balance</b>\n\n💵 $${bal}\n\n💡 Open the panel to manage your wallet.`,
    ), { inline_keyboard: [[{ text: "🐺 " + (userLang === "fa" ? "🚀 ورود به پلتفرم" : "🚀 Open Platform"), web_app: { url: String(settings["telegram.miniAppUrl"] ?? "") || "https://t.me" } }]] });
    return Response.json({ ok: true });
  }

  // /positions — show open positions
  if (text0 === "/positions") {
    const myPositions = await ctx.runQuery(internal.telegram.getOpenPositions, {});
    if (myPositions.length === 0) {
      await sendMsg(token, chatId, textFor(userLang,
        "📭 📊 " + (userLang === "fa" ? "در حال حاضر پوزیشن بازی وجود ندارد." : "No open positions at the moment."),
        "📭 📊 No open positions at the moment.",
      ));
    } else {
      const lines = myPositions.slice(0, 5).map((p: any) => {
        const side = p.side === "long" ? "🟢" : "🔴";
        return `${side} <b>${p.symbol}</b> ${p.side.toUpperCase()} | P/L: ${p.pnl >= 0 ? "🟢+" : "🔴"}${p.pnl?.toFixed(2) ?? "0"}%`;
      });
      await sendMsg(token, chatId, textFor(userLang,
        `📈 <b>📊 پوزیشن‌های باز:</b>\n\n${lines.join("\n")}\n\n💡 ${userLang === "fa" ? "برای جزئیات وارد پنل شوید." : "Open the panel for details."}`,
        `📈 <b>📊 Open Positions:</b>\n\n${lines.join("\n")}\n\n💡 Open the panel for details.`,
      ), { inline_keyboard: [[{ text: "🐺 " + (userLang === "fa" ? "🚀 ورود به پلتفرم" : "🚀 Open Platform"), web_app: { url: String(settings["telegram.miniAppUrl"] ?? "") || "https://t.me" } }]] });
    }
    return Response.json({ ok: true });
  }

  // /admin — admin-only menu
  if (text0 === "/admin") {
    if (!isAdmin) {
      await sendMsg(token, chatId, textFor(userLang, "⛔ 🚫 " + (userLang === "fa" ? "این دستور فقط برای مدیر است." : "This command is admin-only."), "⛔ 🚫 This command is admin-only."));
      return Response.json({ ok: true });
    }
    const miniApp = String(settings["telegram.miniAppUrl"] ?? settings["system.domain"] ?? "");
    const kb = adminMenuKb(userLang);
    if (miniApp) (kb.inline_keyboard[0][0] as any).web_app.url = miniApp;
    await sendMsg(token, chatId, textFor(userLang,
      `🐺 <b>⚡ پنل مدیریت</b>\n\n📊 ${userLang === "fa" ? "از منوی زیر استفاده کنید:" : "Use the menu below:"}`,
      `🐺 <b>⚡ Admin Panel</b>\n\n📊 Use the menu below:`,
    ), kb);
    return Response.json({ ok: true });
  }

  // If message is free text from a verified user → forward as support ticket
  if (text0 && !text0.startsWith("/") && userState?.phoneVerified) {
    await ctx.runMutation(internal.telegram.recordMessage, {
      chatId,
      direction: "in",
      type: "support",
      text: text0,
      status: "received",
    });

    // Create a support ticket
    const ticketId = await ctx.runMutation(internal.telegram.createTicket, {
      chatId,
      tgId: Number(from.id),
      userName: `${firstName} ${lastName}`.trim() || username || `#${from.id}`,
      userLang,
      subject: text0.slice(0, 60),
      text: text0,
    });

    // Forward to admin if available
    if (adminTgId > 0) {
      try {
        await telegramRequest(token, "sendMessage", {
          chat_id: String(adminTgId),
          text: `📩 <b>🎫 تیکت جدید از ${firstName} (@${username ?? "نامشخص"}):</b>\n\n💬 ${text0}\n\n━━━━━━━━━━━━━━━━━━━━\n🆔 Ticket: #${String(ticketId).slice(-6)}`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[
              { text: "💬 " + (userLang === "fa" ? "پاسخ" : "Reply"), callback_data: `ticket:reply:${String(ticketId)}` },
              { text: "✅ " + (userLang === "fa" ? "بستن" : "Close"), callback_data: `ticket:close:${String(ticketId)}` },
            ]],
          },
        });
      } catch { /* best-effort */ }
    }
    await sendMsg(token, chatId, textFor(userLang,
      `📩 <b>✅ پیام شما دریافت شد! 🎉</b>\n\n📬 ${userLang === "fa" ? "تیکت شما به پشتیبانی ارسال شد." : "Your ticket has been forwarded to support."}\n\n⏰ ${userLang === "fa" ? "لطفاً منتظر پاسخ باشید." : "Please wait for a reply."}`,
      `📩 <b>✅ Your message has been received! 🎉</b>\n\n📬 Your ticket has been forwarded to support.\n\n⏰ Please wait for a reply.`,
    ));
    return Response.json({ ok: true });
  }

  // Record everything else
  await ctx.runMutation(internal.telegram.recordMessage, {
    chatId,
    direction: "in",
    type: contact ? "contact" : "message",
    text: text0 || undefined,
    status: "received",
  });
  return Response.json({ ok: true });
});

// ─── Internal mutations / queries ──────────────────────────────────────────

export const upsertTelegramUser = internalMutation({
  args: {
    tgId: v.number(),
    tgUsername: v.optional(v.string()),
    firstName: v.string(),
    lastName: v.string(),
    language: v.string(),
    phone: v.optional(v.string()),
    phoneVerified: v.boolean(),
    pendingReferral: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("users").withIndex("by_tgId", (q) => q.eq("tgId", args.tgId)).first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        tgUsername: args.tgUsername,
        firstName: args.firstName,
        lastName: args.lastName,
        language: args.language, // already preserved by caller
        ...(args.phone ? { phone: args.phone, phoneVerified: args.phoneVerified } : {}),
        ...(args.pendingReferral && !existing.referralRewarded ? { pendingReferralCode: args.pendingReferral } : {}),
        lastActivity: Date.now(),
      });
    } else {
      const id = await ctx.db.insert("users", {
        tgId: args.tgId,
        tgUsername: args.tgUsername,
        firstName: args.firstName,
        lastName: args.lastName,
        language: args.language,
        phone: args.phone,
        phoneVerified: args.phoneVerified,
        ...(args.pendingReferral ? { pendingReferralCode: args.pendingReferral } : {}),
        role: "user",
        enabled: true,
        canTrade: true,
        registeredAt: Date.now(),
        lastActivity: Date.now(),
        theme: "dark",
        notificationsEnabled: true,
      });
      try {
        await ctx.runMutation(internal.me.grantFreeTrial, { userId: id });
      } catch { /* never break signup */ }
    }
  },
});

/** Set phone number for a telegram user. */
export const setPhone = internalMutation({
  args: { tgId: v.number(), phone: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_tgId", (q) => q.eq("tgId", args.tgId)).first();
    if (user) await ctx.db.patch(user._id, { phone: args.phone, phoneVerified: true, lastActivity: Date.now() });
  },
});

/** Set pending reply ticket for admin. */
export const setPendingReply = internalMutation({
  args: { tgId: v.number(), ticketId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_tgId", (q) => q.eq("tgId", args.tgId)).first();
    if (user) await ctx.db.patch(user._id, { pendingReplyTicketId: args.ticketId });
  },
});

/** Clear pending reply ticket for admin. */
export const clearPendingReply = internalMutation({
  args: { tgId: v.number() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_tgId", (q) => q.eq("tgId", args.tgId)).first();
    if (user) await ctx.db.patch(user._id, { pendingReplyTicketId: undefined });
  },
});

/** Create a support ticket. */
export const createTicket = internalMutation({
  args: {
    chatId: v.string(),
    tgId: v.number(),
    userName: v.string(),
    userLang: v.string(),
    subject: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the user record to satisfy the required userId field
    const user = await ctx.db.query("users").withIndex("by_tgId", (q) => q.eq("tgId", args.tgId)).first();
    const userId = user?._id ?? (await ctx.db.query("users").first())?._id;
    if (!userId) throw new Error("no_user_found");
    const id = await ctx.db.insert("supportTickets", {
      userId,
      chatId: args.chatId,
      tgId: args.tgId,
      userName: args.userName,
      userLang: args.userLang,
      subject: args.subject,
      status: "open",
      messages: [{ direction: "in", text: args.text, created: Date.now() }],
      lastActivity: Date.now(),
      created: Date.now(),
    });
    return id;
  },
});

/** Add a reply to a ticket. */
export const addTicketReply = internalMutation({
  args: { ticketId: v.string(), text: v.string(), adminName: v.string() },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId as any);
    if (ticket) {
      const messages = [...((ticket as any).messages ?? []), { direction: "out", text: args.text, by: args.adminName, created: Date.now() }];
      await ctx.db.patch(args.ticketId as any, { messages, lastReply: Date.now() });
    }
  },
});

/** Close a ticket. */
export const closeTicket = internalMutation({
  args: { ticketId: v.string() },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId as any);
    if (ticket) await ctx.db.patch(args.ticketId as any, { status: "closed" as any, closedAt: Date.now() });
  },
});

/** Get a ticket by ID. */
export const getTicket = internalQuery({
  args: { ticketId: v.string() },
  handler: async (ctx, { ticketId }) => {
    const ticket = await ctx.db.get(ticketId as any);
    if (!ticket) return null;
    return {
      _id: ticket._id,
      chatId: (ticket as any).chatId,
      tgId: (ticket as any).tgId,
      userName: (ticket as any).userName,
      userLang: (ticket as any).userLang,
      status: (ticket as any).status,
      messages: (ticket as any).messages ?? [],
    };
  },
});

/** Admin → Telegram: send a message to any chat (user DM, channel, admin). */
export const adminSendChat = mutation({
  args: { token: v.string(), chatId: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const text = args.text.trim().slice(0, 3500);
    if (!text) throw new Error("متن پیام خالی است");
    if (!args.chatId.trim()) throw new Error("شناسه گیرنده نامعتبر است");
    await ctx.scheduler.runAfter(0, internal.notify.notifyChat, {
      chatId: args.chatId.trim(),
      text: `🐺 <b>Trading Wolf AI</b>\n\n${text.replace(/\n/g, "\n")}`,
    });
    return { ok: true };
  },
});

/** Internal: get full user data for bot callbacks (action-safe). */
export const getUserForBot = internalQuery({
  args: { tgId: v.number() },
  handler: async (ctx, { tgId }) => {
    const user = await ctx.db.query("users").withIndex("by_tgId", (q: any) => q.eq("tgId", tgId)).first();
    if (!user) return null;
    return {
      phoneVerified: Boolean(user.phoneVerified),
      phone: user.phone,
      language: user.language,
      wallet: (user as any).wallet ?? {},
      notificationsEnabled: Boolean(user.notificationsEnabled ?? true),
    };
  },
});

export const userByTgId = internalQuery({
  args: { tgId: v.number() },
  handler: async (ctx, { tgId }) => {
    const user = await ctx.db.query("users").withIndex("by_tgId", (q) => q.eq("tgId", tgId)).first();
    if (!user) return null;
    return {
      phoneVerified: Boolean(user.phoneVerified),
      phone: user.phone,
      language: user.language,
      pendingReplyTicketId: (user as any).pendingReplyTicketId,
    };
  },
});

export const setLanguage = internalMutation({
  args: { tgId: v.number(), language: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_tgId", (q) => q.eq("tgId", args.tgId)).first();
    if (user) await ctx.db.patch(user._id, { language: args.language, lastActivity: Date.now() });
  },
});

export const setVerification = internalMutation({
  args: { tgId: v.number(), channelVerified: v.boolean() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_tgId", (q) => q.eq("tgId", args.tgId)).first();
    if (user) await ctx.db.patch(user._id, { channelVerified: args.channelVerified, lastActivity: Date.now() });
  },
});

export const setNotifications = internalMutation({
  args: { tgId: v.number(), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_tgId", (q: any) => q.eq("tgId", args.tgId)).first();
    if (user) await ctx.db.patch(user._id, { notificationsEnabled: args.enabled, lastActivity: Date.now() });
  },
});

export const countUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("users").collect();
    const now = Date.now();
    return {
      total: all.length,
      active24h: all.filter((u: any) => (u.lastActivity ?? 0) > now - 24 * 3600_000).length,
    };
  },
});

export const countPositions = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("open_positions").collect();
    const open = all.filter((p: any) => p.status === "open");
    return {
      total: open.length,
      longs: open.filter((p: any) => p.side === "long").length,
      shorts: open.filter((p: any) => p.side === "short").length,
    };
  },
});

export const getOpenPositions = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("open_positions").collect();
    return all.filter((p: any) => p.status === "open").map((p: any) => ({
      symbol: p.symbol, side: p.side, pnl: p.pnl ?? 0, pnlPct: p.pnlPct ?? 0,
    }));
  },
});

export const recentTickets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("supportTickets").order("desc").take(5);
    return rows.map((r: any) => ({ _id: r._id, id: String(r._id).slice(-6), subject: r.subject, status: r.status, userName: r.userName ?? "—", msgs: (r.messages ?? []).length }));
  },
});

export const recentErrors = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("auditLogs").order("desc").take(5).then((rows: any[]) => rows.map((r: any) => ({ message: (r as any).message ?? (r as any).action ?? "error", created: (r as any).created })));
  },
});

export const refreshMembership = internalAction({
  args: { tgId: v.number(), token: v.string() },
  handler: async (ctx, args) => {
    try {
      const settings: any = await ctx.runQuery(internal.settings.rawSettings, {});
      const chId = String(settings["channel.id"] ?? "").trim();
      const chUser = String(settings["channel.username"] ?? "").trim().replace(/^@/, "");
      if (!chId && !chUser) return { ok: true, skipped: true };
      const r: any = await ctx.runAction(api.nodeCalls.telegramChatMember, {
        token: args.token,
        channelId: chId || `@${chUser}`,
        userId: args.tgId,
      });
      if (r?.status && r.status !== "error") {
        await ctx.runMutation(internal.telegram.setVerification, {
          tgId: args.tgId,
          channelVerified: Boolean(r.ok),
        });
      }
      return { ok: Boolean(r?.ok), status: r?.status ?? "error" };
    } catch (e: any) {
      console.warn(`[tg] refreshMembership failed for ${args.tgId}: ${e?.message ?? e}`);
      return { ok: false, status: "error" };
    }
  },
});

export const recordMessage = internalMutation({
  args: {
    chatId: v.string(),
    direction: v.string(),
    type: v.string(),
    text: v.optional(v.string()),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("telegram_messages", { ...args, created: Date.now() });
  },
});
