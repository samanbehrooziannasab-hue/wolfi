# 🤖 Telegram Bot & Mini App

The bot is intentionally **lightweight** — it only bridges users to the
system. All dashboards, settings, monitoring and analysis live in the web /
Mini App.

## Bot responsibilities

1. `/start` → check channel membership (`getChatMember`)
2. Request & store the phone number (with user consent)
3. Verify membership again after the user joins
4. Send the **Mini App** button (inline keyboard, `web_app`)
5. Push trade/signal/notification messages to the channel and users

## Membership flow

```
/start
  └─ not a member → "Join channel" button + "Check membership" callback
  └─ member      → "Share phone" keyboard (request_contact)
        └─ phone received + verified → Mini App button → session
```

## Setup

1. **BotFather** — create the bot, copy the token.
2. **Domain** — `/setdomain` in BotFather with your HTTPS domain (Mini App).
3. **Admin panel → Settings → Telegram**:
   - `telegram.token` — bot token
   - `telegram.channelId` — numeric channel ID (e.g. `-1001234567890`)
   - `telegram.channelUsername` — e.g. `mychannel` (join button)
   - `telegram.adminId` / `telegram.assistantId` — numeric user IDs
   - `telegram.miniAppUrl` — `https://your.domain`
4. **Webhook** — panel button or:
   ```bash
   curl -F "url=https://your.domain/telegram/webhook" \
        -F "secret_token=YOUR_SECRET" \
        "https://api.telegram.org/bot<TOKEN>/setWebhook"
   ```
5. **Channel** — add the bot as **administrator** (needed for membership
   checks and trade alerts).

## Trade alerts (channel)

On open/close/signal, the engine sends a formatted message with emoji:

```
📌 معامله باز شد / Trade opened
━━━━━━━━━━━━━━━━━━
📊 نماد / Symbol: BTCUSDT
🟢 لانگ / LONG
⭐ Score: 87.8/100 | Confidence: 71%
🧠 استراتژی / Strategy: mtf_trend_align
📥 ورود / Entry: 67000
⛔ حد ضرر / SL: 66300
🎯 هدف / TP: 68400
━━━━━━━━━━━━━━━━━━
#WOLF_TRADE
[ 🔎 مشاهده جزئیات ]   ← opens the Mini App
```

Controls: `notify.trade`, `notify.signal`, `notify.channel`,
`notify.telegram` in settings.

## Mini App auth (secure)

The frontend sends Telegram `initData` to `POST /api/auth/miniapp`. The
server verifies it with HMAC-SHA256 (`WebAppData` secret derived from the bot
token) — forged or replayed data is rejected, and the `tg_id` is read from
the verified payload, never from the client.

## Convex deployment (preview / self-hosted backend)

When the backend runs on Convex (the `src/convex/` stack), the webhook URL is:

```text
https://<YOUR_CONVEX_DEPLOYMENT>.convex.site/telegram/webhook
```

Point the bot at it (from your server / terminal):

```bash
curl -F "url=https://<YOUR_CONVEX_DEPLOYMENT>.convex.site/telegram/webhook" \
     -F "secret_token=wolf-secret-change-me" \
     "https://api.telegram.org/bot<REAL_BOT_TOKEN>/setWebhook"
```

The webhook secret must match the `telegram.webhookSecret` setting in the
admin panel. Also set `telegram.miniAppUrl` to your HTTPS domain so the bot
can open the Mini App.

### ⚠️ Masked-secret pitfall (AI + Telegram stop working)

The admin panel **masks** stored secrets (`AIza••••…wxyz`, bot tokens too).
Saving the settings form used to write the masked placeholder back over the
real key, which broke Gemini (ByteString error) and Telegram. This is fixed
now: masked values are never saved, and secret inputs are blank with a
placeholder. If your AI/Telegram already broke this way, open **Admin →
Settings** and re-enter the real bot token + AI key once (blank fields mean
"keep the stored value"; type a new value to replace it).
