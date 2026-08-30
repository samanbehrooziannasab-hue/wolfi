/**
 * chartImage.ts — server-side PNG candlestick chart renderer (Node).
 *
 * Pure JS, zero runtime deps (node:zlib for the PNG IDAT stream). Draws a
 * real candlestick chart from market data with a WOLF AI watermark and
 * optional Entry / Stop-loss / Take-profit lines, so Telegram channel posts
 * and the admin chart tab get a real chart image without a browser.
 * Ported from src/convex/chartImage.ts (REST parity).
 */
import { deflateSync } from "node:zlib";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal PNG encoder (truecolor RGB, 8-bit)
// ─────────────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, data.length);
  const typeBytes = new TextEncoder().encode(type);
  const crc = new Uint8Array(4);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  new DataView(crc.buffer).setUint32(0, crc32(crcInput));
  const out = new Uint8Array(4 + typeBytes.length + data.length + 4);
  out.set(len, 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  out.set(crc, 8 + data.length);
  return out;
}

/** Encode an RGB (3 bytes per pixel) bitmap as a PNG. */
export function encodePng(
  width: number,
  height: number,
  rgb: Uint8Array,
  deflate: (data: Uint8Array) => Uint8Array = deflateSync,
): Uint8Array {
  if (rgb.length !== width * height * 3) throw new Error(`rgb size mismatch: ${rgb.length} != ${width * height * 3}`);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 3;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const idat = deflate(raw);
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5x7 bitmap font (Adafruit GLCD layout — one byte per row, MSB = leftmost bit)
// ─────────────────────────────────────────────────────────────────────────────

// prettier-ignore
const FONT: Record<string, number[]> = {
  " ": [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  "#": [0x0a, 0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x0a],
  "%": [0x18, 0x19, 0x02, 0x04, 0x08, 0x13, 0x03],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "+": [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
  ",": [0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x08],
  "-": [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  ".": [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  "/": [0x01, 0x02, 0x04, 0x08, 0x10, 0x00, 0x00],
  ":": [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
  "<": [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
  "=": [0x00, 0x00, 0x1f, 0x00, 0x1f, 0x00, 0x00],
  ">": [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
};

const GLYPH_W = 5;
const GLYPH_H = 7;
const GLYPH_ADV = 6;

function glyphFor(ch: string): number[] {
  return FONT[ch.toUpperCase()] ?? FONT["?"] ?? FONT[" "];
}

export function textWidth(text: string, scale: number): number {
  return text.length * GLYPH_ADV * scale;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas (RGB framebuffer)
// ─────────────────────────────────────────────────────────────────────────────

class Canvas {
  w: number;
  h: number;
  buf: Uint8Array;
  constructor(w: number, h: number, bg: [number, number, number]) {
    this.w = w;
    this.h = h;
    this.buf = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      this.buf[i * 3] = bg[0];
      this.buf[i * 3 + 1] = bg[1];
      this.buf[i * 3 + 2] = bg[2];
    }
  }
  setPx(x: number, y: number, c: [number, number, number]) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }
  fillRect(x: number, y: number, w: number, h: number, c: [number, number, number]) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.setPx(xx, yy, c);
  }
  hLine(x0: number, x1: number, y: number, c: [number, number, number]) {
    for (let x = x0; x <= x1; x++) this.setPx(x, y, c);
  }
  vLine(x: number, y0: number, y1: number, c: [number, number, number]) {
    for (let y = y0; y <= y1; y++) this.setPx(x, y, c);
  }
  dashedHLine(x0: number, x1: number, y: number, c: [number, number, number], dash = 6, gap = 4) {
    let x = x0;
    while (x < x1) {
      const end = Math.min(x + dash, x1);
      this.hLine(x, end, y, c);
      x = end + gap;
    }
  }
  blendPx(x: number, y: number, c: [number, number, number], alpha: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.buf[i] = Math.round(this.buf[i] * (1 - alpha) + c[0] * alpha);
    this.buf[i + 1] = Math.round(this.buf[i + 1] * (1 - alpha) + c[1] * alpha);
    this.buf[i + 2] = Math.round(this.buf[i + 2] * (1 - alpha) + c[2] * alpha);
  }
  drawText(x: number, y: number, text: string, c: [number, number, number], scale: number) {
    let cx = x;
    for (const ch of text) {
      const g = glyphFor(ch);
      for (let row = 0; row < GLYPH_H; row++) {
        const bits = g[row];
        for (let col = 0; col < GLYPH_W; col++) {
          if (bits & (0x10 >> col)) {
            this.fillRect(cx + col * scale, y + row * scale, scale, scale, c);
          }
        }
      }
      cx += GLYPH_ADV * scale;
    }
  }
  drawTextBlend(x: number, y: number, text: string, c: [number, number, number], scale: number, alpha: number) {
    let cx = x;
    for (const ch of text) {
      const g = glyphFor(ch);
      for (let row = 0; row < GLYPH_H; row++) {
        const bits = g[row];
        for (let col = 0; col < GLYPH_W; col++) {
          if (bits & (0x10 >> col)) {
            for (let dy = 0; dy < scale; dy++)
              for (let dx = 0; dx < scale; dx++) this.blendPx(cx + col * scale + dx, y + row * scale + dy, c, alpha);
          }
        }
      }
      cx += GLYPH_ADV * scale;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart renderer
// ─────────────────────────────────────────────────────────────────────────────

export interface ChartCandle {
  o: number;
  h: number;
  l: number;
  c: number;
  t?: number;
}

export interface ChartImageOptions {
  symbol: string;
  timeframe?: string;
  candles: ChartCandle[];
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  watermark?: string;
  lang?: "fa" | "en";
  width?: number;
  height?: number;
}

const COL = {
  bg: [10, 14, 19] as [number, number, number],
  panel: [16, 21, 28] as [number, number, number],
  grid: [27, 35, 48] as [number, number, number],
  text: [143, 163, 184] as [number, number, number],
  strong: [203, 219, 235] as [number, number, number],
  up: [38, 166, 154] as [number, number, number],
  down: [239, 83, 80] as [number, number, number],
  cyan: [34, 211, 238] as [number, number, number],
  amber: [251, 191, 36] as [number, number, number],
};

function fmtPx(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Render a candlestick chart to a PNG with the WOLF AI watermark. */
export function renderCandleChartPng(
  opts: ChartImageOptions,
  deflate: (data: Uint8Array) => Uint8Array = deflateSync,
): Uint8Array {
  const W = opts.width ?? 840;
  const H = opts.height ?? 480;
  const canvas = new Canvas(W, H, COL.bg);

  const candles = (opts.candles ?? []).filter(
    (c) => Number.isFinite(c?.h) && Number.isFinite(c?.l) && Number.isFinite(c?.o) && Number.isFinite(c?.c),
  );
  const symbol = String(opts.symbol ?? "MARKET").toUpperCase();
  const tf = String(opts.timeframe ?? "");
  const watermark = String(opts.watermark ?? "WOLF AI");

  canvas.drawText(14, 12, `${symbol}${tf ? " · " + tf : ""}`, COL.strong, 2);
  canvas.drawText(W - textWidth(watermark, 1) - 14, 16, watermark, COL.cyan, 1);

  const padL = 70;
  const padR = 16;
  const padT = 46;
  const padB = 26;
  const x0 = padL;
  const x1 = W - padR;
  const y0 = padT;
  const y1 = H - padB;

  const count = candles.length;
  if (count === 0) {
    canvas.drawText(x0, y0 + 20, "NO CANDLE DATA", COL.text, 2);
    return encodePng(W, H, canvas.buf, deflate);
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    if (c.l < lo) lo = c.l;
    if (c.h > hi) hi = c.h;
  }
  for (const v of [opts.entry, opts.stopLoss, opts.takeProfit]) {
    if (Number.isFinite(v)) {
      if ((v as number) < lo) lo = v as number;
      if ((v as number) > hi) hi = v as number;
    }
  }
  const pad = (hi - lo) * 0.06 || Math.max(hi * 0.01, 1);
  lo -= pad;
  hi += pad;

  const yOf = (v: number) => y0 + (1 - (v - lo) / (hi - lo || 1)) * (y1 - y0);
  const bw = (x1 - x0) / count;

  const gridLines = 5;
  for (let g = 0; g <= gridLines; g++) {
    const yy = Math.round(y0 + (g / gridLines) * (y1 - y0));
    const price = hi - (g / gridLines) * (hi - lo);
    canvas.hLine(x0, x1, yy, COL.grid);
    canvas.drawText(6, yy - 4, fmtPx(price), COL.text, 1);
  }
  const timeLines = 6;
  for (let g = 0; g <= timeLines; g++) {
    const xx = Math.round(x0 + (g / timeLines) * (x1 - x0));
    canvas.vLine(xx, y0, y1, COL.grid);
  }

  for (let i = 0; i < count; i++) {
    const c = candles[i];
    const up = c.c >= c.o;
    const color = up ? COL.up : COL.down;
    const cx = Math.round(x0 + i * bw + bw / 2);
    const wickTop = Math.round(yOf(c.h));
    const wickBot = Math.round(yOf(c.l));
    const bodyTop = Math.round(yOf(Math.max(c.o, c.c)));
    const bodyBot = Math.round(yOf(Math.min(c.o, c.c)));
    canvas.vLine(cx, wickTop, wickBot, color);
    const bodyW = Math.max(2, Math.round(bw * 0.58));
    canvas.fillRect(cx - Math.floor(bodyW / 2), bodyTop, bodyW, Math.max(1, bodyBot - bodyTop), color);
  }

  const timeLabels = [0, Math.floor(count / 2), count - 1];
  for (const ti of timeLabels) {
    const c = candles[ti];
    if (!c?.t) continue;
    const d = new Date(c.t);
    const lbl = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const cx = Math.round(x0 + ti * bw + bw / 2);
    canvas.drawText(cx - textWidth(lbl, 1) / 2, y1 + 6, lbl, COL.text, 1);
  }

  const levels: Array<{ v: number; color: [number, number, number]; label: string }> = [];
  if (Number.isFinite(opts.entry)) levels.push({ v: opts.entry as number, color: COL.cyan, label: "ENTRY" });
  if (Number.isFinite(opts.stopLoss)) levels.push({ v: opts.stopLoss as number, color: COL.down, label: "SL" });
  if (Number.isFinite(opts.takeProfit)) levels.push({ v: opts.takeProfit as number, color: COL.up, label: "TP" });
  for (const lv of levels) {
    const yy = Math.round(yOf(lv.v));
    canvas.dashedHLine(x0, x1, yy, lv.color);
    canvas.drawText(x0 + 4, yy - 9, lv.label, lv.color, 1);
  }

  const last = candles[count - 1].c;
  const ly = Math.round(yOf(last));
  canvas.dashedHLine(x0, x1, ly, COL.amber);
  const lastLbl = fmtPx(last);
  canvas.drawText(x1 - textWidth(lastLbl, 1) - 4, ly - 9, lastLbl, COL.amber, 1);

  const wmScale = 3;
  const wmW = textWidth(watermark, wmScale);
  const wmX = Math.round((W - wmW) / 2);
  const wmY = Math.round((y0 + y1) / 2 - (GLYPH_H * wmScale) / 2);
  canvas.drawTextBlend(wmX, wmY, watermark, COL.cyan, wmScale, 0.1);

  return encodePng(W, H, canvas.buf, deflate);
}