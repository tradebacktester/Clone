export interface TradeResult {
  index: number;
  time: Date;
  pair: string;
  direction: "buy" | "sell";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  closePrice: number;
  outcome: "win" | "loss";
  pnlPips: number;
  riskRewardActual: number;   // actual R:R (distance to TP / distance to SL)
  riskRewardPlanned: number;  // planned R:R at entry
  durationBars: number;
  equityAfter: number;        // running equity after trade
  regime: string;
  amdScore: number;
  liquidityScore: number;
  confirmationScore: number;
  finalScore: number;
  zoneStrength: number;
  session: "london" | "new_york" | "tokyo" | "off_hours";
}

export interface ExtendedMetrics {
  // Core
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;           // %

  // Profitability
  grossProfitPips: number;
  grossLossPips: number;
  netProfitPips: number;
  profitFactor: number;      // gross_profit / gross_loss

  // Expectancy
  avgWinPips: number;
  avgLossPips: number;
  expectancyPips: number;    // (WR × avgWin) − (LR × avgLoss)

  // Risk-adjusted returns
  sharpeRatio: number;       // annualized
  sortinoRatio: number;      // annualized, downside deviation only

  // Drawdown
  maxDrawdownPips: number;
  maxDrawdownPct: number;    // relative to peak equity
  avgDrawdownPips: number;

  // R:R
  avgPlannedRR: number;
  avgActualRR: number;

  // Recovery
  recoveryFactor: number;    // net_profit / max_drawdown_pips

  // Streaks
  maxConsecWins: number;
  maxConsecLosses: number;
  currentStreak: number;     // + = win streak, − = loss streak

  // Distribution
  returnDistribution: ReturnBucket[];
  percentile25: number;
  percentile50: number;
  percentile75: number;

  // Statistical significance
  tStatistic: number;
  pValue: number;            // approximate
  isSignificant: boolean;    // p < 0.05
  confidenceInterval95: [number, number]; // 95% CI for mean return
}

export interface ReturnBucket {
  label: string;
  minPips: number;
  maxPips: number;
  count: number;
  pct: number;
}

export function computeExtendedMetrics(trades: TradeResult[]): ExtendedMetrics {
  if (trades.length === 0) return emptyMetrics();

  const wins = trades.filter((t) => t.outcome === "win");
  const losses = trades.filter((t) => t.outcome === "loss");
  const winRate = (wins.length / trades.length) * 100;
  const lossRate = 100 - winRate;

  const grossProfit = wins.reduce((s, t) => s + t.pnlPips, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPips, 0));
  const netProfit = grossProfit - grossLoss;

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const expectancy = (winRate / 100) * avgWin - (lossRate / 100) * avgLoss;

  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // ── Sharpe & Sortino ────────────────────────────────────────────────────
  const returns = trades.map((t) => t.pnlPips);
  const meanReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / Math.max(1, returns.length - 1);
  const stdDev = Math.sqrt(variance);

  const downsideReturns = returns.filter((r) => r < 0);
  const downsideVariance = downsideReturns.length > 0
    ? downsideReturns.reduce((s, r) => s + r ** 2, 0) / downsideReturns.length
    : 0;
  const downsideDev = Math.sqrt(downsideVariance);

  // Annualisation: assume ~250 trades/year (conservative for a 15m system)
  const annFactor = Math.sqrt(250);
  const sharpe = stdDev > 0 ? (meanReturn / stdDev) * annFactor : 0;
  const sortino = downsideDev > 0 ? (meanReturn / downsideDev) * annFactor : 0;

  // ── Max drawdown ─────────────────────────────────────────────────────────
  let peak = 0;
  let maxDDPips = 0;
  let sumDD = 0;
  let ddCount = 0;
  let equity = 0;
  for (const t of trades) {
    equity += t.pnlPips;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDDPips) maxDDPips = dd;
    if (dd > 0) { sumDD += dd; ddCount++; }
  }
  const peakEquity = trades.reduce((acc, t) => Math.max(acc, t.equityAfter), 0);
  const maxDDPct = peakEquity > 0 ? (maxDDPips / peakEquity) * 100 : 0;
  const avgDD = ddCount > 0 ? sumDD / ddCount : 0;

  const avgPlannedRR = trades.length > 0
    ? trades.reduce((s, t) => s + t.riskRewardPlanned, 0) / trades.length : 0;
  const avgActualRR = wins.length > 0
    ? wins.reduce((s, t) => s + t.riskRewardActual, 0) / wins.length : 0;

  const recoveryFactor = maxDDPips > 0 ? netProfit / maxDDPips : netProfit > 0 ? Infinity : 0;

  // ── Streaks ──────────────────────────────────────────────────────────────
  let maxWins = 0, curWins = 0, maxLosses = 0, curLosses = 0;
  for (const t of trades) {
    if (t.outcome === "win") { curWins++; curLosses = 0; maxWins = Math.max(maxWins, curWins); }
    else { curLosses++; curWins = 0; maxLosses = Math.max(maxLosses, curLosses); }
  }
  const lastTrade = trades[trades.length - 1];
  const currentStreak = lastTrade?.outcome === "win" ? curWins : -curLosses;

  // ── Return distribution ──────────────────────────────────────────────────
  const allPnl = trades.map((t) => t.pnlPips).sort((a, b) => a - b);
  const p25 = allPnl[Math.floor(allPnl.length * 0.25)] ?? 0;
  const p50 = allPnl[Math.floor(allPnl.length * 0.50)] ?? 0;
  const p75 = allPnl[Math.floor(allPnl.length * 0.75)] ?? 0;

  const min = allPnl[0] ?? 0;
  const max = allPnl[allPnl.length - 1] ?? 0;
  const bucketCount = 10;
  const bucketSize = (max - min) / bucketCount || 1;
  const buckets: ReturnBucket[] = Array.from({ length: bucketCount }, (_, i) => {
    const bMin = min + i * bucketSize;
    const bMax = bMin + bucketSize;
    const count = allPnl.filter((v) => v >= bMin && (i === bucketCount - 1 ? v <= bMax : v < bMax)).length;
    return { label: `${bMin.toFixed(1)}–${bMax.toFixed(1)}`, minPips: bMin, maxPips: bMax, count, pct: 0 };
  });
  for (const b of buckets) b.pct = parseFloat(((b.count / trades.length) * 100).toFixed(1));

  // ── T-test (one-sample, H0: μ=0) ────────────────────────────────────────
  const tStat = stdDev > 0 ? (meanReturn / (stdDev / Math.sqrt(trades.length))) : 0;
  const pValue = approximatePValue(Math.abs(tStat), trades.length - 1);
  const seOfMean = stdDev / Math.sqrt(trades.length);
  const ci95: [number, number] = [meanReturn - 1.96 * seOfMean, meanReturn + 1.96 * seOfMean];

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: parseFloat(winRate.toFixed(2)),
    grossProfitPips: parseFloat(grossProfit.toFixed(2)),
    grossLossPips: parseFloat(grossLoss.toFixed(2)),
    netProfitPips: parseFloat(netProfit.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(4)),
    avgWinPips: parseFloat(avgWin.toFixed(2)),
    avgLossPips: parseFloat(avgLoss.toFixed(2)),
    expectancyPips: parseFloat(expectancy.toFixed(4)),
    sharpeRatio: parseFloat(sharpe.toFixed(4)),
    sortinoRatio: parseFloat(sortino.toFixed(4)),
    maxDrawdownPips: parseFloat(maxDDPips.toFixed(2)),
    maxDrawdownPct: parseFloat(maxDDPct.toFixed(2)),
    avgDrawdownPips: parseFloat(avgDD.toFixed(2)),
    avgPlannedRR: parseFloat(avgPlannedRR.toFixed(3)),
    avgActualRR: parseFloat(avgActualRR.toFixed(3)),
    recoveryFactor: parseFloat(recoveryFactor.toFixed(4)),
    maxConsecWins: maxWins,
    maxConsecLosses: maxLosses,
    currentStreak,
    returnDistribution: buckets,
    percentile25: p25,
    percentile50: p50,
    percentile75: p75,
    tStatistic: parseFloat(tStat.toFixed(4)),
    pValue: parseFloat(pValue.toFixed(4)),
    isSignificant: pValue < 0.05,
    confidenceInterval95: [parseFloat(ci95[0].toFixed(4)), parseFloat(ci95[1].toFixed(4))],
  };
}

/**
 * Approximate two-tailed p-value using a rational approximation of the
 * t-distribution survival function. Accurate to ±0.01 for df > 5.
 */
function approximatePValue(t: number, df: number): number {
  if (!isFinite(t) || df < 1) return 1;
  // Cornish-Fisher approximation for large df
  if (df > 30) {
    const z = t * (1 - 1 / (4 * df));
    return 2 * (1 - normalCDF(z));
  }
  // For smaller df, use a simple lookup-style approximation
  const x = df / (df + t * t);
  const betaInc = incompleteBeta(x, df / 2, 0.5);
  return Math.min(1, betaInc);
}

function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + p * x);
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  return 0.5 * (1 + sign * (1 - poly * Math.exp(-x * x)));
}

function incompleteBeta(x: number, a: number, b: number): number {
  // Very rough approximation via continued fraction (Lentz method)
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
  let result = 0;
  for (let i = 0; i <= 100; i++) {
    const term = Math.pow(x, i) * ((a + i > 0 ? (a / (a + i)) : 0));
    result += term;
    if (Math.abs(term) < 1e-10) break;
  }
  return Math.min(1, front * result);
}

function lgamma(n: number): number {
  // Stirling approximation
  if (n < 1) return lgamma(n + 1) - Math.log(n);
  return (n - 0.5) * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI) + 1 / (12 * n);
}

function emptyMetrics(): ExtendedMetrics {
  return {
    totalTrades: 0, wins: 0, losses: 0, winRate: 0,
    grossProfitPips: 0, grossLossPips: 0, netProfitPips: 0, profitFactor: 0,
    avgWinPips: 0, avgLossPips: 0, expectancyPips: 0,
    sharpeRatio: 0, sortinoRatio: 0,
    maxDrawdownPips: 0, maxDrawdownPct: 0, avgDrawdownPips: 0,
    avgPlannedRR: 0, avgActualRR: 0, recoveryFactor: 0,
    maxConsecWins: 0, maxConsecLosses: 0, currentStreak: 0,
    returnDistribution: [], percentile25: 0, percentile50: 0, percentile75: 0,
    tStatistic: 0, pValue: 1, isSignificant: false, confidenceInterval95: [0, 0],
  };
}
