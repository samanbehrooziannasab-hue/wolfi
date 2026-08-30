// ---------------------------------------------------------------------------
// WOLF Portfolio Analytics — inspired by NautilusTrader Portfolio concept.
// Provides: equity curve, MTM snapshots, realized/unrealized PnL,
// Sharpe/Sortino/Calmar ratios, VaR, portfolio heat, Kelly criterion sizing.
// ---------------------------------------------------------------------------
import type { Candle } from "./engineCore";

// ─── Portfolio State ──────────────────────────────────────────────────────
export interface PortfolioSnapshot {
  ts: number;
  equity: number;
  balance: number;
  unrealizedPnl: number;
  realizedPnl: number;
  margin: number;
  exposure: number;
  openPositions: number;
}

export interface PerformanceMetrics {
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  profitFactor: number;
  winRate: number;
  expectancy: number;
  recoveryFactor: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  avgRR: number;
}

export interface RiskMetrics {
  valueAtRisk95: number;
  valueAtRisk99: number;
  conditionalVaR: number;
  portfolioHeat: number;
  correlationExposure: number;
  kellyFraction: number;
  optimalLeverage: number;
  maxPositionSize: number;
}

// ─── Equity Curve Tracker ────────────────────────────────────────────────
export function buildEquityCurve(
  closedPositions: Array<{
    profit: number;
    closeTime: number;
    entry: number;
    size: number;
  }>,
  initialCapital: number,
  snapshotIntervalMs = 3600_000, // 1 hour
): PortfolioSnapshot[] {
  const snapshots: PortfolioSnapshot[] = [];
  let equity = initialCapital;
  let realizedPnl = 0;

  // Sort by close time
  const sorted = [...closedPositions].sort((a, b) => a.closeTime - b.closeTime);

  // Add initial snapshot
  snapshots.push({
    ts: sorted.length > 0 ? sorted[0].closeTime - snapshotIntervalMs : Date.now(),
    equity: initialCapital,
    balance: initialCapital,
    unrealizedPnl: 0,
    realizedPnl: 0,
    margin: 0,
    exposure: 0,
    openPositions: 0,
  });

  for (const pos of sorted) {
    realizedPnl += pos.profit;
    equity = initialCapital + realizedPnl;

    snapshots.push({
      ts: pos.closeTime,
      equity,
      balance: equity,
      unrealizedPnl: 0,
      realizedPnl,
      margin: 0,
      exposure: 0,
      openPositions: 0,
    });
  }

  return snapshots;
}

// ─── Mark-to-Market ──────────────────────────────────────────────────────
export function markToMarket(
  positions: Array<{
    side: "long" | "short";
    entry: number;
    current: number;
    size: number;
    margin: number;
  }>,
  balance: number,
): PortfolioSnapshot {
  let unrealizedPnl = 0;
  let totalMargin = 0;
  let totalExposure = 0;

  for (const pos of positions) {
    const pnl = pos.side === "long"
      ? (pos.current - pos.entry) * (pos.size / pos.entry)
      : (pos.entry - pos.current) * (pos.size / pos.entry);
    unrealizedPnl += pnl;
    totalMargin += pos.margin;
    totalExposure += pos.size;
  }

  return {
    ts: Date.now(),
    equity: balance + unrealizedPnl,
    balance,
    unrealizedPnl,
    realizedPnl: 0,
    margin: totalMargin,
    exposure: totalExposure,
    openPositions: positions.length,
  };
}

// ─── Performance Metrics (NautilusTrader-style) ──────────────────────────
export function computePerformanceMetrics(
  closedTrades: Array<{
    profit: number;
    pnlPct: number;
    rr: number;
    score: number;
    closeTime: number;
    entry: number;
    closePrice?: number;
  }>,
  initialCapital: number,
): PerformanceMetrics {
  if (closedTrades.length === 0) {
    return {
      sharpeRatio: 0, sortinoRatio: 0, calmarRatio: 0, profitFactor: 0,
      winRate: 0, expectancy: 0, recoveryFactor: 0, maxDrawdown: 0,
      maxDrawdownPct: 0, avgWin: 0, avgLoss: 0, totalTrades: 0,
      consecutiveWins: 0, consecutiveLosses: 0, avgRR: 0,
    };
  }

  const wins = closedTrades.filter((t) => t.profit > 0);
  const losses = closedTrades.filter((t) => t.profit <= 0);
  const totalProfit = wins.reduce((s, t) => s + t.profit, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.profit, 0));

  // Equity curve for drawdown and ratios
  const equityCurve: number[] = [initialCapital];
  let equity = initialCapital;
  for (const t of closedTrades.sort((a, b) => a.closeTime - b.closeTime)) {
    equity += t.profit;
    equityCurve.push(equity);
  }

  // Max drawdown
  let peak = equityCurve[0];
  let maxDrawdown = 0;
  for (const eq of equityCurve) {
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Daily returns for Sharpe/Sortino
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
  }

  const avgReturn = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const stdReturn = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length - 1))
    : 0;
  const downsideReturns = returns.filter((r) => r < 0);
  const downsideDev = downsideReturns.length > 1
    ? Math.sqrt(downsideReturns.reduce((s, r) => s + r ** 2, 0) / downsideReturns.length)
    : 0;

  // Sharpe (annualized, assuming ~365 trading days for crypto)
  const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(365) : 0;
  // Sortino (annualized)
  const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * Math.sqrt(365) : 0;
  // Calmar (annualized return / max drawdown)
  const annualizedReturn = avgReturn * 365;
  const calmarRatio = maxDrawdown > 0 ? annualizedReturn / (maxDrawdown / initialCapital) : 0;

  // Profit factor
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;

  // Win rate
  const winRate = closedTrades.length > 0 ? wins.length / closedTrades.length : 0;

  // Expectancy (average profit per trade)
  const expectancy = closedTrades.reduce((s, t) => s + t.profit, 0) / closedTrades.length;

  // Recovery factor (net profit / max drawdown)
  const netProfit = totalProfit - totalLoss;
  const recoveryFactor = maxDrawdown > 0 ? netProfit / maxDrawdown : 0;

  // Average win/loss
  const avgWin = wins.length > 0 ? totalProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;

  // Consecutive wins/losses
  let maxConsecWins = 0, maxConsecLosses = 0, curWins = 0, curLosses = 0;
  for (const t of closedTrades) {
    if (t.profit > 0) { curWins++; curLosses = 0; }
    else { curLosses++; curWins = 0; }
    maxConsecWins = Math.max(maxConsecWins, curWins);
    maxConsecLosses = Math.max(maxConsecLosses, curLosses);
  }

  const avgRR = closedTrades.reduce((s, t) => s + t.rr, 0) / closedTrades.length;

  return {
    sharpeRatio: Number(sharpeRatio.toFixed(3)),
    sortinoRatio: Number(sortinoRatio.toFixed(3)),
    calmarRatio: Number(calmarRatio.toFixed(3)),
    profitFactor: Number.isFinite(profitFactor) ? Number(profitFactor.toFixed(2)) : 0,
    winRate: Number((winRate * 100).toFixed(1)),
    expectancy: Number(expectancy.toFixed(4)),
    recoveryFactor: Number(recoveryFactor.toFixed(2)),
    maxDrawdown: Number(maxDrawdown.toFixed(4)),
    maxDrawdownPct: Number(((maxDrawdown / initialCapital) * 100).toFixed(2)),
    avgWin: Number(avgWin.toFixed(4)),
    avgLoss: Number(avgLoss.toFixed(4)),
    totalTrades: closedTrades.length,
    consecutiveWins: maxConsecWins,
    consecutiveLosses: maxConsecLosses,
    avgRR: Number(avgRR.toFixed(2)),
  };
}

// ─── Risk Metrics (NautilusTrader-inspired) ──────────────────────────────
export function computeRiskMetrics(
  closedTrades: Array<{ profit: number; pnlPct: number; rr: number }>,
  openPositions: Array<{
    side: "long" | "short";
    entry: number;
    current: number;
    size: number;
    leverage: number;
  }>,
  capital: number,
  confidenceLevel = 0.95,
): RiskMetrics {
  if (closedTrades.length < 10) {
    return {
      valueAtRisk95: 0, valueAtRisk99: 0, conditionalVaR: 0,
      portfolioHeat: 0, correlationExposure: 0,
      kellyFraction: 0, optimalLeverage: 1, maxPositionSize: capital,
    };
  }

  // Sort returns for VaR calculation
  const returns = closedTrades.map((t) => t.pnlPct / 100).sort((a, b) => a - b);
  const n = returns.length;

  // Value at Risk (Historical Simulation)
  const idx95 = Math.floor(n * (1 - 0.95));
  const idx99 = Math.floor(n * (1 - 0.99));
  const valueAtRisk95 = Math.abs(returns[idx95] || 0) * capital;
  const valueAtRisk99 = Math.abs(returns[idx99] || 0) * capital;

  // Conditional VaR (Expected Shortfall)
  const tailReturns = returns.slice(0, idx95 + 1);
  const conditionalVaR = tailReturns.length > 0
    ? Math.abs(tailReturns.reduce((s, r) => s + r, 0) / tailReturns.length) * capital
    : 0;

  // Portfolio Heat (% of capital at risk across all open positions)
  const totalMargin = openPositions.reduce((s, p) => s + (p.size / p.leverage), 0);
  const portfolioHeat = capital > 0 ? (totalMargin / capital) * 100 : 0;

  // Correlation Exposure (simplified: count of positions in same direction)
  const longCount = openPositions.filter((p) => p.side === "long").length;
  const totalCount = openPositions.length || 1;
  const correlationExposure = Math.abs(longCount - (totalCount - longCount)) / totalCount;

  // Kelly Criterion
  const wins = closedTrades.filter((t) => t.profit > 0);
  const losses = closedTrades.filter((t) => t.profit <= 0);
  const p = wins.length / closedTrades.length;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length) : 1;
  const kellyFraction = avgLoss > 0
    ? Math.max(0, Math.min(1, p - (1 - p) / (avgWin / avgLoss)))
    : 0;

  // Optimal leverage (Kelly-based, capped at max)
  const optimalLeverage = Math.max(1, Math.min(10, kellyFraction * 20));

  // Max position size (based on Kelly, with half-Kelly safety)
  const maxPositionSize = capital * kellyFraction * 0.5;

  return {
    valueAtRisk95: Number(valueAtRisk95.toFixed(2)),
    valueAtRisk99: Number(valueAtRisk99.toFixed(2)),
    conditionalVaR: Number(conditionalVaR.toFixed(2)),
    portfolioHeat: Number(portfolioHeat.toFixed(1)),
    correlationExposure: Number(correlationExposure.toFixed(2)),
    kellyFraction: Number(kellyFraction.toFixed(4)),
    optimalLeverage: Number(optimalLeverage.toFixed(1)),
    maxPositionSize: Number(maxPositionSize.toFixed(2)),
  };
}

// ─── Position Sizing (NautilusTrader-style risk-based) ───────────────────
export function calculatePositionSize(
  capital: number,
  riskPerTradePct: number,
  entryPrice: number,
  stopLossPrice: number,
  leverage: number,
  maxLeverage: number,
  feePct: number,
): { size: number; margin: number; quantity: number; riskAmount: number } {
  const riskAmount = capital * (riskPerTradePct / 100);
  const slDistance = Math.abs(entryPrice - stopLossPrice);
  const slFraction = entryPrice > 0 ? slDistance / entryPrice : 0;

  // Position size = risk amount / (sl fraction + fees)
  const totalCostFraction = slFraction + (feePct / 100) * 2; // open + close fees
  const size = totalCostFraction > 0 ? riskAmount / totalCostFraction : 0;

  // Apply leverage constraints
  const effectiveLeverage = Math.max(1, Math.min(maxLeverage, leverage));
  const margin = size / effectiveLeverage;
  const quantity = entryPrice > 0 ? size / entryPrice : 0;

  return {
    size: Number(size.toFixed(2)),
    margin: Number(margin.toFixed(2)),
    quantity: Number(quantity.toFixed(8)),
    riskAmount: Number(riskAmount.toFixed(2)),
  };
}

// ─── Trailing Stop Calculator (NautilusTrader-style) ─────────────────────
export function calculateTrailingStop(
  side: "long" | "short",
  entry: number,
  currentPrice: number,
  currentStopLoss: number,
  activatePct: number,
  trailDistancePct: number,
): number {
  // Activation: price must move in our favor by activatePct
  const profitPct = side === "long"
    ? ((currentPrice - entry) / entry) * 100
    : ((entry - currentPrice) / entry) * 100;

  if (profitPct < activatePct) return currentStopLoss;

  // Trail: move stop to trailDistance% behind the best price
  if (side === "long") {
    const trailed = currentPrice * (1 - trailDistancePct / 100);
    return Math.max(currentStopLoss, trailed);
  } else {
    const trailed = currentPrice * (1 + trailDistancePct / 100);
    return Math.min(currentStopLoss, trailed);
  }
}

// ─── Partial Close Calculator ────────────────────────────────────────────
export function calculatePartialClose(
  side: "long" | "short",
  entry: number,
  currentPrice: number,
  targets: number[],
  originalSize: number,
  partialPcts: number[] = [0.33, 0.33, 0.34], // Default: 3 targets
): Array<{ targetIndex: number; closeSize: number; partialPnl: number }> {
  const closes: Array<{ targetIndex: number; closeSize: number; partialPnl: number }> = [];
  let remainingSize = originalSize;

  for (let i = 0; i < targets.length && i < partialPcts.length; i++) {
    const target = targets[i];
    const hitTarget = side === "long" ? currentPrice >= target : currentPrice <= target;
    if (!hitTarget || remainingSize <= 0) continue;

    const closeSize = remainingSize * partialPcts[i];
    const pnl = side === "long"
      ? (target - entry) * (closeSize / entry)
      : (entry - target) * (closeSize / entry);

    closes.push({
      targetIndex: i,
      closeSize: Number(closeSize.toFixed(2)),
      partialPnl: Number(pnl.toFixed(4)),
    });
    remainingSize -= closeSize;
  }

  return closes;
}

// ─── Market Regime Detection (NautilusTrader-inspired) ───────────────────
export type MarketRegime = "trending_up" | "trending_down" | "ranging" | "volatile" | "low_volatility";

export function detectMarketRegime(
  candles: Candle[],
  period = 50,
): { regime: MarketRegime; adx: number; atrPercentile: number; trendStrength: number } {
  if (candles.length < period) {
    return { regime: "ranging", adx: 0, atrPercentile: 50, trendStrength: 0 };
  }

  const recent = candles.slice(-period);

  // ADX calculation (simplified)
  let plusDM = 0, minusDM = 0, trSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const highDiff = recent[i].h - recent[i - 1].h;
    const lowDiff = recent[i - 1].l - recent[i].l;
    plusDM += highDiff > lowDiff && highDiff > 0 ? highDiff : 0;
    minusDM += lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0;
    const tr = Math.max(
      recent[i].h - recent[i].l,
      Math.abs(recent[i].h - recent[i - 1].c),
      Math.abs(recent[i].l - recent[i - 1].c),
    );
    trSum += tr;
  }

  const atr = trSum / (recent.length - 1);
  const avgPrice = recent.reduce((s, c) => s + (c.h + c.l + c.c) / 3, 0) / recent.length;
  const atrPercentile = avgPrice > 0 ? (atr / avgPrice) * 100 : 0;

  // Simplified ADX
  const plusDI = trSum > 0 ? (plusDM / trSum) * 100 : 0;
  const minusDI = trSum > 0 ? (minusDM / trSum) * 100 : 0;
  const dx = plusDI + minusDI > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;
  const adx = dx; // Simplified (real ADX uses smoothed average)

  const trendStrength = adx / 100;

  // Regime classification
  let regime: MarketRegime;
  if (adx > 30) {
    regime = plusDI > minusDI ? "trending_up" : "trending_down";
  } else if (atrPercentile > 2) {
    regime = "volatile";
  } else if (atrPercentile < 0.5) {
    regime = "low_volatility";
  } else {
    regime = "ranging";
  }

  return {
    regime,
    adx: Number(adx.toFixed(1)),
    atrPercentile: Number(atrPercentile.toFixed(3)),
    trendStrength: Number(trendStrength.toFixed(3)),
  };
}
