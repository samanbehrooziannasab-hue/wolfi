// SwapWallet client for the self-hosted runtime.
// The API key is always supplied by the caller after server-side resolution;
// it is never returned to the browser.
const BASE = (process.env.SWAPWALLET_URL || "https://swapwallet.app/api").replace(/\/+$/, "");

export const SWAP_TOKENS = ["USDT", "TON", "TRX", "IRT", "ETH", "BNB"] as const;

async function request(path: string, key?: string, init: RequestInit = {}): Promise<any> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (key) headers.set("authorization", `Bearer ${key}`);
  const response = await fetch(`${BASE}${path}`, { ...init, headers, signal: AbortSignal.timeout(15_000) });
  let data: any = null;
  try { data = await response.json(); } catch { /* handled below */ }
  if (!response.ok) {
    return { status: "ERROR", http: response.status, error: data?.error ?? `http_${response.status}` };
  }
  return data;
}

export function swapwalletBase(): string { return BASE; }

export async function prices(): Promise<Record<string, string>> {
  const data = await request("/v1/market/prices");
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

export async function balances(key: string): Promise<any> {
  return request("/v2/user/balance", key);
}

export async function transactions(key: string, limit = 50): Promise<any> {
  return request(`/v2/transaction?limit=${Math.min(100, Math.max(1, limit))}`, key);
}

export async function transaction(key: string, id: string): Promise<any> {
  return request(`/v1/transaction/${encodeURIComponent(id)}`, key);
}

export async function fastSwap(key: string, body: {
  sourceToken: string; destinationToken: string; sourceAmount?: string; destinationAmount?: string;
}): Promise<any> {
  return request("/v1/market/otc/fast-swap", key, { method: "POST", body: JSON.stringify(body) });
}

export async function quote(key: string, body: {
  sourceToken: string; destinationToken: string; sourceAmount?: string; destinationAmount?: string;
}): Promise<any> {
  return request("/v1/market/otc/price", key, { method: "POST", body: JSON.stringify(body) });
}

export async function executeQuote(key: string, swapToken: string): Promise<any> {
  return request("/v1/market/otc/order", key, { method: "POST", body: JSON.stringify({ swapToken }) });
}

export async function withdrawConfig(key: string, token: string): Promise<any> {
  return request(`/v1/wallet/crypto-withdraw/config/${encodeURIComponent(token)}`, key);
}

export async function withdraw(key: string, body: {
  token: string; amount: string; network: string; address: string; memo?: string; feeDeductType?: string; fee?: string;
}): Promise<any> {
  return request("/v1/wallet/crypto-withdraw", key, { method: "POST", body: JSON.stringify(body) });
}
