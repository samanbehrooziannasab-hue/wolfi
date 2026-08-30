import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";

type Clock = { key: string; label: string; tz: string; offset: string; flag: string };

const CLOCKS: Clock[] = [
  { key: "tehran", label: "تهران", tz: "Asia/Tehran", offset: "+3:30", flag: "🇮🇷" },
  { key: "utc", label: "UTC", tz: "UTC", offset: "±0", flag: "🌐" },
  { key: "london", label: "لندن", tz: "Europe/London", offset: "+0/1", flag: "🇬🇧" },
  { key: "newyork", label: "نیویورک", tz: "America/New_York", offset: "-4/5", flag: "🇺🇸" },
  { key: "tokyo", label: "توکیو", tz: "Asia/Tokyo", offset: "+9", flag: "🇯🇵" },
];

const STR: Record<"en" | "fa", Record<string, string>> = {
  en: {
    clocks: "World clocks",
    fxOpen: "Forex: open",
    fxClosed: "Forex: closed",
    weekend: "Weekend — FX closed",
    crypto: "Crypto 24/7",
  },
  fa: {
    clocks: "ساعت بازارهای جهانی",
    fxOpen: "فارکس: باز",
    fxClosed: "فارکس: بسته",
    weekend: "آخر هفته — فارکس بسته است",
    crypto: "کریپتو ۲۴/۷",
  },
};

function useClockTimes(now: number) {
  return useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of CLOCKS) {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: c.tz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(new Date(now));
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
      map[c.key] = `${get("hour")}:${get("minute")}:${get("second")}`;
    }
    return map;
  }, [now]);
}

export function MarketClock() {
  const { lang } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const s = STR[lang];

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const times = useClockTimes(now);

  const d = new Date(now);
  const day = d.getUTCDay(); // 0 = Sunday
  const isWeekend = day === 0 || day === 6;
  const fxOpen = !isWeekend;

  return (
    <div className="terminal-font flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] leading-none">
      <span className="flex items-center gap-1 text-muted-foreground">
        <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
        {s.clocks}
      </span>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {CLOCKS.map((c) => (
          <span key={c.key} className="flex items-center gap-1">
            <span className="text-sm leading-none">{c.flag}</span>
            <span className="text-muted-foreground">{c.label}</span>
            <span className="tabular-nums text-emerald-300" dir="ltr">{times[c.key]}</span>
            <span className="text-[9px] text-muted-foreground/70" dir="ltr">{c.offset}</span>
          </span>
        ))}
      </div>

      <span
        className={`flex items-center gap-1.5 rounded border px-1.5 py-0.5 ${
          fxOpen
            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
            : "border-red-400/30 bg-red-400/10 text-red-300"
        }`}
      >
        {fxOpen ? s.fxOpen : isWeekend ? s.weekend : s.fxClosed}
      </span>
      <span className="hidden text-muted-foreground md:inline">{s.crypto}</span>
    </div>
  );
}
