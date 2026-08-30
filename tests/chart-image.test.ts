// ─── chartImage unit tests (bun test) ──────────────────────────────────────
// Covers the pure PNG renderer: valid PNG output with injected deflate, the
// watermark title, signal-level lines and the empty-data fallback.
import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { renderCandleChartPng, encodePng, textWidth } from "../src/convex/chartImage";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function candles(): Array<{ o: number; h: number; l: number; c: number; t: number }> {
  const out = [];
  let price = 100;
  for (let i = 0; i < 40; i++) {
    const o = price;
    const c = o + (i % 3 === 0 ? -1 : 1) * 0.4;
    const h = Math.max(o, c) + 0.3;
    const l = Math.min(o, c) - 0.3;
    out.push({ o, h, l, c, t: Date.now() - (40 - i) * 900_000 });
    price = c;
  }
  return out;
}

describe("encodePng", () => {
  test("produces a valid PNG signature with injected deflate", () => {
    const w = 16;
    const h = 16;
    const rgb = new Uint8Array(w * h * 3).fill(10);
    const png = encodePng(w, h, rgb, deflateSync);
    expect(png.length).toBeGreaterThan(60);
    for (let i = 0; i < 8; i++) expect(png[i]).toBe(PNG_MAGIC[i]);
    // IHDR chunk: length 13 (bytes 8-11), type "IHDR" (bytes 12-15)
    expect(png[8]).toBe(0);
    expect(png[9]).toBe(0);
    expect(png[10]).toBe(0);
    expect(png[11]).toBe(13);
    expect(String.fromCharCode(png[12], png[13], png[14], png[15])).toBe("IHDR");
    // width/height round-trip
    const dv = new DataView(png.buffer);
    expect(dv.getUint32(16)).toBe(w);
    expect(dv.getUint32(20)).toBe(h);
  });
});

describe("renderCandleChartPng", () => {
  test("renders a chart with watermark and signal levels", () => {
    const png = renderCandleChartPng(
      {
        symbol: "BTCUSDT",
        timeframe: "15m",
        candles: candles(),
        entry: 100.2,
        stopLoss: 99.4,
        takeProfit: 102.0,
        watermark: "WOLF AI",
      },
      deflateSync,
    );
    expect(png.length).toBeGreaterThan(5_000);
    for (let i = 0; i < 8; i++) expect(png[i]).toBe(PNG_MAGIC[i]);
    // IHDR 840x480 default
    const dv = new DataView(png.buffer);
    expect(dv.getUint32(16)).toBe(840);
    expect(dv.getUint32(20)).toBe(480);
  });

  test("handles empty candle data gracefully", () => {
    const png = renderCandleChartPng({ symbol: "XAUUSD", candles: [] }, deflateSync);
    expect(png.length).toBeGreaterThan(200);
    for (let i = 0; i < 8; i++) expect(png[i]).toBe(PNG_MAGIC[i]);
  });

  test("textWidth scales with scale factor", () => {
    expect(textWidth("ABC", 1)).toBe(3 * 6);
    expect(textWidth("ABC", 2)).toBe(3 * 12);
  });
});
