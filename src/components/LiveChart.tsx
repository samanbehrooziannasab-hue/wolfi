import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, createChart, HistogramSeries, LineSeries, IChartApi, ISeriesApi, CandlestickData, LineData } from "lightweight-charts";

interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Level {
  price: number;
  color: string;
  label: string;
  lineStyle?: 0 | 1 | 2 | 3;
}

export interface ChartIndicator {
  id: string;
  name: string;
  type: "sma" | "ema" | "bollinger" | "vwap";
  period?: number;
  color?: string;
  description?: string;
}

interface Props {
  candles?: Candle[];
  levels?: Level[];
  indicators?: ChartIndicator[];
  width?: number;
  height?: number;
  className?: string;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  symbol?: string;
  direction?: string;
  timeframe?: string;
  showTools?: boolean;
}

function tfToMs(tf: string): number {
  const n = parseInt(tf, 10);
  if (tf.includes("m") && !tf.includes("h")) return n * 60 * 1000;
  if (tf.includes("h")) return n * 3600 * 1000;
  if (tf.includes("d")) return n * 86400 * 1000;
  if (tf.includes("w")) return n * 7 * 86400 * 1000;
  return 15 * 60 * 1000;
}

function getSymbolBasePrice(symbol?: string, entry?: number): number {
  if (entry && entry > 0) return entry;
  if (!symbol) return 100;
  const s = symbol.toUpperCase();
  if (s.includes("BTC")) return 109500;
  if (s.includes("ETH")) return 3850;
  if (s.includes("SOL")) return 185;
  if (s.includes("XAU") || s.includes("GOLD")) return 3245;
  if (s.includes("XAG") || s.includes("SILVER")) return 38.2;
  if (s.includes("BNB")) return 680;
  if (s.includes("XRP")) return 2.35;
  if (s.includes("DOGE")) return 0.22;
  if (s.includes("JPY")) return 154.8;
  if (s.includes("EUR") || s.includes("GBP") || s.includes("AUD")) return 1.15;
  return 100;
}

function generateDemoCandles(count: number, startPrice: number, volatility: number, tfMs: number): Candle[] {
  const now = Date.now();
  const result: Candle[] = [];
  let price = startPrice;
  let seed = Math.floor(startPrice * 1000) >>> 0;
  const rand = () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = count - 1; i >= 0; i--) {
    const t = now - i * tfMs;
    const drift = price * volatility * (rand() - 0.5) * 0.001;
    const o = price;
    const c = Math.max(0.0001, o + drift);
    const h = Math.max(o, c) + Math.abs(rand() - 0.5) * price * volatility * 0.0005;
    const l = Math.min(o, c) - Math.abs(rand() - 0.5) * price * volatility * 0.0005;
    const v = price * 0.01 * (1 + rand());
    result.push({ t, o, h, l: Math.max(0.0001, l), c, v });
    price = c;
  }
  return result;
}

/** True when the symbol is a Binance-style USDT crypto pair (real data available). */
function isBinancePair(symbol?: string): boolean {
  if (!symbol) return false;
  const s = symbol.toUpperCase();
  if (!/^[A-Z0-9]+$/.test(s)) return false;
  if (s === "USDT" || s.endsWith("USD") && !s.endsWith("USDT")) return false; // XAUUSD/EURUSD etc. are forex
  return s.endsWith("USDT");
}

const BINANCE_REST = "https://data-api.binance.vision/api/v3/klines";
const BINANCE_WS = "wss://data-stream.binance.vision/ws";
const YAHOO_REST = "https://query1.finance.yahoo.com/v8/finance/chart";

export function LiveChart({
  candles: candlesProp,
  levels: levelsProp,
  indicators,
  width,
  height = 280,
  className = "",
  entry,
  stopLoss,
  takeProfit,
  symbol,
  direction,
  timeframe = "15m",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const levelsRef = useRef<any[]>([]);

  const basePrice = getSymbolBasePrice(symbol, entry);
  const [candles, setCandles] = useState<Candle[]>(
    () =>
      (candlesProp && candlesProp.length > 0) ? candlesProp :
      generateDemoCandles(80, basePrice, symbol?.includes("BTC") ? 1.8 : symbol?.includes("ETH") ? 2.4 : 0.85, tfToMs(timeframe)),
  );
  const [dataSource, setDataSource] = useState<"live" | "demo">("demo");

  // real market data: Binance (crypto) / Yahoo Finance (forex & metals)
  useEffect(() => {
    if (candlesProp && candlesProp.length > 0) {
      setCandles(candlesProp);
      setDataSource("live");
      return;
    }
    if (!symbol) {
      setCandles(generateDemoCandles(80, basePrice, 1, tfToMs(timeframe)));
      setDataSource("demo");
      return;
    }
    let cancelled = false;
    let ws: WebSocket | null = null;
    const sym = symbol.toUpperCase();
    const symLower = sym.toLowerCase();
    const tf = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"].includes(timeframe) ? timeframe : "15m";

    const demoFallback = () => {
      if (cancelled) return;
      const bp = getSymbolBasePrice(sym, entry);
      setCandles(
        generateDemoCandles(80, bp, sym.includes("BTC") ? 1.8 : sym.includes("ETH") ? 2.4 : 0.85, tfToMs(tf)),
      );
      setDataSource("demo");
    };

    (async () => {
      let list: Candle[] | null = null;
      try {
        if (isBinancePair(sym)) {
          const res = await fetch(`${BINANCE_REST}?symbol=${sym}&interval=${tf}&limit=220`);
          if (!res.ok) throw new Error("bad status");
          const rows: any[] = await res.json();
          list = rows.map((r) => ({
            t: Number(r[0]),
            o: Number(r[1]),
            h: Number(r[2]),
            l: Number(r[3]),
            c: Number(r[4]),
            v: Number(r[5]),
          }));
        } else {
          // forex / metals via Yahoo Finance (no key required)
          const range = tf === "1h" || tf === "4h" || tf === "1d" ? "1mo" : "5d";
          let json: any = null;
          for (const host of [YAHOO_REST, "https://query2.finance.yahoo.com/v8/finance/chart"]) {
            try {
              const res = await fetch(`${host}/${sym}=X?interval=${tf}&range=${range}&includePrePost=false`);
              if (!res.ok) continue;
              const j: any = await res.json();
              if (j?.chart?.result?.[0]) {
                json = j;
                break;
              }
            } catch {
              // try the next host
            }
          }
          if (!json) throw new Error("no data");
          const result = json?.chart?.result?.[0];
          const ts: Array<number | null> = result?.timestamp ?? [];
          const q = result?.indicators?.quote?.[0];
          if (!q) throw new Error("no data");
          list = [];
          for (let i = 0; i < ts.length; i++) {
            const t = ts[i];
            const o = q.open?.[i];
            const h = q.high?.[i];
            const l = q.low?.[i];
            const c = q.close?.[i];
            const v = q.volume?.[i];
            if (t == null || o == null || h == null || l == null || c == null) continue;
            list.push({ t: t * 1000, o: Number(o), h: Number(h), l: Number(l), c: Number(c), v: Number(v ?? 0) });
          }
        }
      } catch {
        list = null;
      }
      if (cancelled) return;
      if (!list || list.length < 40) {
        demoFallback();
        return;
      }
      setCandles(list);
      setDataSource("live");

      // live updates (Binance websocket — crypto only)
      if (isBinancePair(sym)) {
        try {
          ws = new WebSocket(`${BINANCE_WS}/${symLower}@kline_${tf}`);
        ws.onmessage = (ev) => {
          if (cancelled) return;
          try {
            const msg = JSON.parse(ev.data);
            const k = msg?.k;
            if (!k) return;
            const candle: Candle = {
              t: Number(k.t),
              o: Number(k.o),
              h: Number(k.h),
              l: Number(k.l),
              c: Number(k.c),
              v: Number(k.v),
            };
            setCandles((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.t === candle.t) copy[copy.length - 1] = candle;
              else if (last && candle.t > last.t) copy.push(candle);
              else return prev;
              return copy.slice(-260);
            });
          } catch {
            // ignore malformed frames
          }
        };
          ws.onerror = () => {
            // keep last fetched candles; websocket is best-effort
          };
        } catch {
          // no ws — rest data is enough
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        ws?.close();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe]);

  const levels: Level[] = levelsProp ?? [];
  if (entry) levels.push({ price: entry, color: "#fbbf24", label: "ENTRY", lineStyle: 0 });
  if (stopLoss) levels.push({ price: stopLoss, color: "#ef4444", label: "SL", lineStyle: 2 });
  if (takeProfit) levels.push({ price: takeProfit, color: "#10b981", label: "TP", lineStyle: 2 });

  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: width ?? containerRef.current.clientWidth,
      height,
      layout: { background: { color: "transparent" }, textColor: "#94a3b8", fontSize: 11 },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.06)" },
        horzLines: { color: "rgba(148, 163, 184, 0.06)" },
      },
      crosshair: { mode: 0, vertLine: { color: "rgba(52, 211, 153, 0.3)", width: 1, labelBackgroundColor: "#065f46" }, horzLine: { color: "rgba(52, 211, 153, 0.3)", width: 1, labelBackgroundColor: "#065f46" } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "rgba(148, 163, 184, 0.1)" },
      rightPriceScale: { borderColor: "rgba(148, 163, 184, 0.1)" },
    });
    const cs = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981", downColor: "#ef4444",
      borderUpColor: "#10b981", borderDownColor: "#ef4444",
      wickUpColor: "#34d399", wickDownColor: "#f87171",
    });
    const vs = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume" });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    chartRef.current = chart;
    seriesRef.current = cs;
    void vs;

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.remove(); };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    const data: CandlestickData[] = candles.map((c) => ({
      time: Math.floor(c.t / 1000) as any,
      open: c.o, high: c.h, low: c.l, close: c.c,
    }));
    seriesRef.current.setData(data);

    // Levels
    levelsRef.current.forEach((pl) => { try { seriesRef.current?.removePriceLine(pl); } catch {} });
    levelsRef.current = [];
    for (const lvl of levels) {
      const pl = seriesRef.current.createPriceLine({
        price: lvl.price, color: lvl.color, lineWidth: 1,
        lineStyle: lvl.lineStyle ?? 2, axisLabelVisible: true, title: lvl.label,
      });
      levelsRef.current.push(pl);
    }

    // Indicators rendering
    indicatorSeriesRef.current.forEach((lineSeries) => {
      try { chartRef.current?.removeSeries(lineSeries); } catch {}
    });
    indicatorSeriesRef.current.clear();

    if (indicators && indicators.length > 0 && candles.length > 5) {
      indicators.forEach((ind) => {
        try {
          const lineSeries = chartRef.current!.addSeries(LineSeries, {
            color: ind.color || "#38bdf8",
            lineWidth: 2,
            title: ind.name,
          });
          const period = ind.period || (ind.type === "ema" ? 20 : 14);
          const lineData: LineData[] = [];
          
          if (ind.type === "sma" || ind.type === "vwap") {
            for (let i = period - 1; i < candles.length; i++) {
              const slice = candles.slice(i - period + 1, i + 1);
              const sum = slice.reduce((s, c) => s + c.c, 0);
              lineData.push({
                time: Math.floor(candles[i].t / 1000) as any,
                value: sum / period,
              });
            }
          } else if (ind.type === "ema") {
            const k = 2 / (period + 1);
            let prevEma = candles[0].c;
            for (let i = 0; i < candles.length; i++) {
              if (i === 0) {
                prevEma = candles[i].c;
              } else {
                prevEma = candles[i].c * k + prevEma * (1 - k);
              }
              if (i >= period - 1) {
                lineData.push({
                  time: Math.floor(candles[i].t / 1000) as any,
                  value: prevEma,
                });
              }
            }
          }
          lineSeries.setData(lineData);
          indicatorSeriesRef.current.set(ind.id, lineSeries);
        } catch (e) {
          console.warn("Indicator draw failed:", e);
        }
      });
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles, levels, indicators]);

  return (
    <div className={`relative rounded-lg overflow-hidden bg-surface/50 ${className}`} style={{ minHeight: height }}>
      {dataSource === "live" ? (
        <span className="pointer-events-none absolute top-1.5 z-10 rounded bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-emerald-300" dir="ltr">● LIVE</span>
      ) : null}
      {indicators && indicators.length > 0 ? (
        <div className="absolute bottom-2 left-2 z-10 flex flex-wrap gap-1.5 pointer-events-none">
          {indicators.map((ind) => (
            <span
              key={ind.id}
              className="text-[10px] px-2 py-0.5 rounded backdrop-blur bg-black/60 text-slate-200 border border-slate-700/60 shadow-sm"
              style={{ borderLeftColor: ind.color || "#38bdf8", borderLeftWidth: 3 }}
            >
              <b>{ind.name}</b> {ind.description ? `— ${ind.description}` : ""}
            </span>
          ))}
        </div>
      ) : null}
      <div ref={containerRef} />
    </div>
  );
}

