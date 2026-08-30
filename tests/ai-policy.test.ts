// ─── Backend unit tests (bun test) ─────────────────────────────────────────
// Covers the pure policy helpers used across the Convex backend: Telegram
// invite-link fallback (the https://t.me/ bug), risk-preset classification,
// membership status, webhook URL building and the daily-lesson template.
import { describe, expect, test } from "bun:test";
import {
  buildDailyLesson,
  buildInviteLink,
  buildSignalMessage,
  classifyRiskPreset,
  isValidInviteLink,
  membershipStatusOk,
  sparklineText,
  webhookUrlFor,
  RISK_PRESETS,
} from "../src/convex/aiPolicy";

describe("isValidInviteLink", () => {
  test("accepts real join links", () => {
    expect(isValidInviteLink("https://t.me/marijtrade")).toBe(true);
    expect(isValidInviteLink("https://t.me/marijtrade/")).toBe(true);
    expect(isValidInviteLink("https://telegram.me/marijtrade")).toBe(true);
    expect(isValidInviteLink("http://t.me/marijtrade")).toBe(true);
  });

  test("rejects empty / bare t.me links (the reported bug)", () => {
    expect(isValidInviteLink("")).toBe(false);
    expect(isValidInviteLink("https://t.me/")).toBe(false);
    expect(isValidInviteLink("https://t.me")).toBe(false);
    expect(isValidInviteLink("t.me/marijtrade")).toBe(false);
    expect(isValidInviteLink("https://t.me/ab")).toBe(false); // too short
    expect(isValidInviteLink(null)).toBe(false);
    expect(isValidInviteLink(undefined)).toBe(false);
  });
});

describe("buildInviteLink", () => {
  test("keeps a valid saved link", () => {
    expect(buildInviteLink("marijtrade", "https://t.me/real_channel")).toBe(
      "https://t.me/real_channel",
    );
  });

  test("falls back to channel username when saved link is the bare t.me bug", () => {
    expect(buildInviteLink("marijtrade", "https://t.me/")).toBe(
      "https://t.me/marijtrade",
    );
    expect(buildInviteLink("marijtrade", "")).toBe("https://t.me/marijtrade");
    expect(buildInviteLink("@marijtrade", "")).toBe("https://t.me/marijtrade");
  });

  test("returns empty when nothing usable exists", () => {
    expect(buildInviteLink("", "")).toBe("");
    expect(buildInviteLink(null, "https://t.me/")).toBe("");
  });
});

describe("classifyRiskPreset", () => {
  test("maps each preset's riskPerTrade to itself", () => {
    for (const p of RISK_PRESETS) {
      expect(classifyRiskPreset(p.riskPerTrade)).toBe(p.key);
    }
  });

  test("maps arbitrary values to the nearest preset", () => {
    expect(classifyRiskPreset(1.6)).toBe("balanced");
    expect(classifyRiskPreset(2.4)).toBe("very_high");
    expect(classifyRiskPreset(0.6)).toBe("very_low");
    expect(classifyRiskPreset(0)).toBe("very_low");
    expect(classifyRiskPreset(Number.NaN)).toBe("balanced");
  });
});

describe("membershipStatusOk", () => {
  test("accepts member-like statuses", () => {
    expect(membershipStatusOk("member")).toBe(true);
    expect(membershipStatusOk("administrator")).toBe(true);
    expect(membershipStatusOk("creator")).toBe(true);
  });

  test("rejects non-members", () => {
    expect(membershipStatusOk("left")).toBe(false);
    expect(membershipStatusOk("kicked")).toBe(false);
    expect(membershipStatusOk("restricted")).toBe(false);
    expect(membershipStatusOk("")).toBe(false);
    expect(membershipStatusOk(undefined)).toBe(false);
  });
});

describe("webhookUrlFor", () => {
  test("appends the telegram webhook path", () => {
    expect(webhookUrlFor("https://example.com")).toBe(
      "https://example.com/telegram/webhook",
    );
    expect(webhookUrlFor("https://example.com/")).toBe(
      "https://example.com/telegram/webhook",
    );
  });

  test("returns empty for invalid bases", () => {
    expect(webhookUrlFor("")).toBe("");
    expect(webhookUrlFor("ftp://x")).toBe("");
    expect(webhookUrlFor(null)).toBe("");
  });
});

describe("buildDailyLesson", () => {
  const lesson = buildDailyLesson({
    dateFa: "شنبه",
    dateEn: "Sat",
    signals: 12,
    closed: 8,
    winRate: 62.5,
    predictions: 30,
    predictionWinRate: 45,
    aiReviews: 4,
    topSymbol: "BTCUSDT",
    topDirection: "long",
  });

  test("produces bilingual titles and bodies", () => {
    expect(lesson.titleFa).toContain("شنبه");
    expect(lesson.titleEn).toContain("Sat");
    expect(lesson.bodyFa).toContain("12");
    expect(lesson.bodyEn).toContain("12");
    expect(lesson.bodyFa).toContain("63"); // 62.5 → 63
    expect(lesson.bodyEn).toContain("63");
  });

  test("never crashes on empty activity", () => {
    const empty = buildDailyLesson({
      dateFa: "یکشنبه",
      dateEn: "Sun",
      signals: 0,
      closed: 0,
      winRate: 0,
      predictions: 0,
      predictionWinRate: 0,
      aiReviews: 0,
      topSymbol: "",
      topDirection: "long",
    });
    expect(empty.bodyFa).toBeTruthy();
    expect(empty.bodyEn).toBeTruthy();
  });
});

describe("sparklineText", () => {
  test("up bars become green squares, down bars red", () => {
    const sp = sparklineText([100, 101, 102, 101]);
    expect(sp).toContain("🟩");
    expect(sp).toContain("🟥");
    expect([...sp].length).toBe(3); // surrogate-safe
  });

  test("empty or too-short series returns empty", () => {
    expect(sparklineText([])).toBe("");
    expect(sparklineText([1])).toBe("");
    expect(sparklineText(null)).toBe("");
    expect(sparklineText(undefined)).toBe("");
  });

  test("caps the series at 28 closes and skips non-finite values", () => {
    const many = Array.from({ length: 60 }, (_, i) => 100 + i);
    const sp = sparklineText(many);
    expect([...sp].length).toBeLessThanOrEqual(28);
    const mixed = sparklineText([1, Number.NaN, 2, 3]);
    expect([...mixed].length).toBe(2); // NaN skipped → two comparisons
  });
});

describe("buildSignalMessage", () => {
  const base = {
    symbol: "BTCUSDT",
    direction: "long" as const,
    timeframe: "15m",
    entry: 77000,
    stopLoss: 76000,
    takeProfit: 79000,
    targets: [79000, 81000],
    rr: 3,
    score: 82,
    confidence: 0.75,
    price: 77100,
    reasons: ["Trend up", "Volume spike"],
    closes: [100, 101, 102],
    createdAt: 1755600000000,
  };

  test("persian layout carries hashtags + details + sparkline", () => {
    const msg = buildSignalMessage(base, true);
    expect(msg).toContain("سیگنال ولف‌ای");
    expect(msg).toContain("#BTCUSDT");
    expect(msg).toContain("#long");
    expect(msg).toContain("#wolf_ai");
    expect(msg).toContain("🛑 حد ضرر");
    expect(msg).toContain("🎯 هدف");
    expect(msg).toContain("🟩");
    expect(msg).toContain("<b>82</b>");
  });

  test("english layout is fully english + same hashtags", () => {
    const msg = buildSignalMessage(base, false);
    expect(msg).toContain("WOLF AI Signal");
    expect(msg).toContain("Stop loss");
    expect(msg).toContain("Educational only");
    expect(msg).toContain("#BTCUSDT");
    expect(msg).not.toContain("سیگنال");
  });

  test("short direction flips the tag", () => {
    const msg = buildSignalMessage({ ...base, direction: "short" }, false);
    expect(msg).toContain("#short");
    expect(msg).toContain("SHORT");
  });
});
