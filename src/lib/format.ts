// Shared market-symbol formatting.
// Raw symbols are stored without a separator (BTCUSDT, XAUUSD, EURJPY…).
// Everywhere a pair is shown to the user we display the base/quote form:
//   BTC/USDT · XAU/USD · EUR/JPY · طلا/دلار (nameFa already has it).
// The raw symbol is still the canonical key for lookups / API calls.

const QUOTE_CURRENCIES = [
  "USDT",
  "USD",
  "JPY",
  "GBP",
  "EUR",
  "CHF",
  "CAD",
  "AUD",
  "NZD",
  "TRY",
  "ZAR",
  "CNH",
  "HKD",
  "SGD",
  "MXN",
  "PLN",
  "DKK",
  "SEK",
  "NOK",
] as const;

/** "XAUUSD" → "XAU/USD", "BTCUSDT" → "BTC/USDT", "EURJPY" → "EUR/JPY". */
export function formatSymbol(symbol: string | null | undefined): string {
  const s = String(symbol ?? "").trim().toUpperCase();
  if (!s) return String(symbol ?? "");
  if (s.includes("/")) return s;
  // Longest quote first so "BTCUSDT" matches USDT, never USD.
  for (const q of [...QUOTE_CURRENCIES].sort((a, b) => b.length - a.length)) {
    if (s.length > q.length && s.endsWith(q)) {
      return `${s.slice(0, -q.length)}/${q}`;
    }
  }
  return s;
}
