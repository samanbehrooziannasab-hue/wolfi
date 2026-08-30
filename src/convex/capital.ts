// ---------------------------------------------------------------------------
// WOLF engine — capital model (pure, unit-testable, no Convex runtime).
//
// The engine manages a *virtual* capital (risk.virtualCapital) but its P&L is
// real: every closed trade adds/removes from the working balance. This module
// is the single source of truth for:
//   • effectiveCapital  — virtual + cumulative realized P&L
//   • exchangeScale     — equivalence ratio between the real exchange balance
//                         and the engine's effective capital (so a $1000
//                         engine that holds $100 on the exchange trades at
//                         0.1× scale — every ratio, exposure cap and fee is
//                         normalized through this factor)
//   • fee-aware sizing  — risk-based notional that already consumes the
//                         open+close fee and slippage from the risk budget
// ---------------------------------------------------------------------------

/** Minimum effective capital the engine will ever size from (no zero/negative). */
export const MIN_EFFECTIVE_CAPITAL = 1;

/** Scale is clamped so a wildly mismatched balance never blows up sizing. */
export const MIN_EXCHANGE_SCALE = 0.05;
export const MAX_EXCHANGE_SCALE = 10;

/**
 * Working capital the engine actually sizes from.
 * `realizedPnl` is the cumulative net P&L of every closed position
 * (paper + broker), including fees and slippage.
 */
export function effectiveCapital(virtualCapital: number, realizedPnl = 0): number {
  const v = Number(virtualCapital);
  const base = Number.isFinite(v) ? v : 0;
  const r = Number(realizedPnl);
  const pnl = Number.isFinite(r) ? r : 0;
  return Math.max(MIN_EFFECTIVE_CAPITAL, base + pnl);
}

/**
 * Equivalence ratio between the real exchange balance and the engine's
 * effective capital.
 *
 *   scale = realBalance / effectiveCapital
 *
 * Examples:
 *   engine $1000, exchange $1000 → 1.0 (1:1, trade as-is)
 *   engine $1000, exchange $100   → 0.1 (every position is 10% of what the
 *                                   virtual model wants — protects the real
 *                                   account while keeping all risk ratios)
 *   engine $1000, exchange $5000  → 5.0 (the account can absorb more)
 *
 * Returns 1 when no real balance is known (paper mode / not configured).
 * The result is clamped to [MIN_EXCHANGE_SCALE, MAX_EXCHANGE_SCALE].
 */
export function exchangeScale(realBalance: number, effectiveCap: number): number {
  const r = Number(realBalance);
  if (!Number.isFinite(r) || r <= 0) return 1;
  const e = effectiveCapital(effectiveCap);
  const raw = r / e;
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.min(MAX_EXCHANGE_SCALE, Math.max(MIN_EXCHANGE_SCALE, raw));
}

/**
 * Fraction of notional consumed by fees + slippage on a round trip.
 * `feePct` is charged on open AND close (platform model), plus slippage on
 * the entry fill.
 */
export function roundTripCostFraction(feePct: number, slippagePct = 0): number {
  const fee = Number(feePct);
  const slip = Number(slippagePct);
  const f = Number.isFinite(fee) ? fee : 0;
  const s = Number.isFinite(slip) ? slip : 0;
  return (2 * f + s) / 100;
}

/**
 * Risk-based notional that already accounts for fees + slippage + the
 * exchange equivalence scale.
 *
 *   notional = riskAmount / (stopDistance% + roundTripCost%) × scale
 *
 * The risk budget covers BOTH the stop loss and the costs of the round trip,
 * so a position that hits SL still loses ≈riskAmount (fees included), and a
 * real account with less money than the virtual model gets every position
 * scaled down proportionally.
 *
 * `capNotional` / `capExposureRoom` are optional absolute caps (USDT).
 * Returns 0 when the setup is untradeable (no stop distance, no budget).
 */
export function sizedNotional(
  riskAmount: number,
  stopDistanceFraction: number,
  feePct = 0.1,
  slippagePct = 0,
  scale = 1,
  capNotional?: number,
  capExposureRoom?: number,
): number {
  const risk = Number(riskAmount);
  const slFrac = Number(stopDistanceFraction);
  if (!Number.isFinite(risk) || risk <= 0) return 0;
  if (!Number.isFinite(slFrac) || slFrac <= 0) return 0;
  const denom = slFrac + roundTripCostFraction(feePct, slippagePct);
  if (denom <= 0) return 0;
  const sc = Number(scale);
  const s = Number.isFinite(sc) && sc > 0 ? sc : 1;
  let notional = (risk / denom) * s;
  if (typeof capNotional === "number" && Number.isFinite(capNotional) && capNotional > 0) notional = Math.min(notional, capNotional);
  if (typeof capExposureRoom === "number" && Number.isFinite(capExposureRoom) && capExposureRoom > 0) notional = Math.min(notional, capExposureRoom);
  return notional > 0 ? notional : 0;
}

/**
 * Net P&L of a closed position: gross price move minus open fee minus close
 * fee (close fee is estimated from notional, like the engine does).
 */
export function netPnl(
  side: "long" | "short",
  entry: number,
  exit: number,
  quantity: number,
  openFee: number,
  feePct = 0.1,
): number {
  const e = Number(entry) || 0;
  const x = Number(exit) || 0;
  const q = Number(quantity) || 0;
  const gross = side === "long" ? (x - e) * q : (e - x) * q;
  const open = Number(openFee) || 0;
  const close = e * q * (Number(feePct) / 100);
  return gross - open - close;
}
