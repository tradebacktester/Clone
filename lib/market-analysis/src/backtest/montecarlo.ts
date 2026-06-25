export interface MonteCarloParams {
  numSimulations?: number;
  numTrades?: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  startingCapital?: number;
  ruinThreshold?: number;
  tradesPerMonth?: number;
}

export interface EquityCurves {
  worst: number[];
  p10: number[];
  median: number[];
  p90: number[];
  best: number[];
  labels: number[];
}

export interface HistogramBucket {
  rangeLabel: string;
  count: number;
  frequency: number;
}

export interface MonteCarloResult {
  numSimulations: number;
  numTrades: number;
  startingCapital: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  ruinThreshold: number;
  tradesPerMonth: number;

  probabilityOfRuin: number;

  worstDrawdown: number;
  expectedDrawdown: number;
  medianDrawdown: number;
  drawdownPercentile90: number;

  expectedMonthlyReturn: number;
  medianMonthlyReturn: number;

  worstLosingStreak: number;
  expectedLosingStreak: number;
  medianLosingStreak: number;

  worstCaseReturn: number;
  percentile10: number;
  percentile25: number;
  medianReturn: number;
  percentile75: number;
  percentile90: number;
  bestCaseReturn: number;
  expectedReturn: number;

  worstCaseReturnPct: number;
  expectedReturnPct: number;
  bestCaseReturnPct: number;

  histogram: HistogramBucket[];
  equityCurves: EquityCurves;
}

function pctl(sortedArr: number[], pct: number): number {
  const idx = Math.min(Math.floor((pct / 100) * sortedArr.length), sortedArr.length - 1);
  return sortedArr[idx]!;
}

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function buildHistogram(values: number[], buckets = 20): HistogramBucket[] {
  const min = values[0]!;
  const max = values[values.length - 1]!;
  const step = (max - min) / buckets || 1;
  const counts = new Array<number>(buckets).fill(0);

  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / step), buckets - 1);
    counts[idx]!++;
  }

  return counts.map((count, i) => ({
    rangeLabel: `${Math.round(min + i * step)}`,
    count,
    frequency: Math.round((count / values.length) * 10000) / 100,
  }));
}

export function runMonteCarlo(params: MonteCarloParams): MonteCarloResult {
  const {
    numSimulations = 10_000,
    numTrades      = 100,
    winRate,
    avgWin,
    avgLoss,
    startingCapital = 10_000,
    ruinThreshold   = 0.5,
    tradesPerMonth  = 20,
  } = params;

  const CURVE_POINTS = 21;
  const sampleAt = Array.from({ length: CURVE_POINTS }, (_, i) =>
    Math.round((i / (CURVE_POINTS - 1)) * numTrades),
  );

  const finalEquities  = new Float64Array(numSimulations);
  const maxDrawdowns   = new Float64Array(numSimulations);
  const worstStreaks   = new Int32Array(numSimulations);
  const allCurves      = new Float64Array(numSimulations * CURVE_POINTS);

  let ruinCount = 0;

  for (let sim = 0; sim < numSimulations; sim++) {
    let equity       = startingCapital;
    let peak         = startingCapital;
    let maxDD        = 0;
    let worstStreak  = 0;
    let curStreak    = 0;
    let ruined       = false;
    let curveIdx     = 0;

    const base = sim * CURVE_POINTS;
    if (sampleAt[0] === 0) allCurves[base + curveIdx++] = equity;

    for (let t = 1; t <= numTrades; t++) {
      if (!ruined) {
        if (Math.random() < winRate) {
          equity += avgWin;
          curStreak = 0;
        } else {
          equity -= avgLoss;
          curStreak++;
          if (curStreak > worstStreak) worstStreak = curStreak;
        }

        if (equity <= 0) { equity = 0; ruined = true; }
        if (equity > peak) peak = equity;

        const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
        if (dd > maxDD) maxDD = dd;
      }

      if (curveIdx < CURVE_POINTS && t === sampleAt[curveIdx]) {
        allCurves[base + curveIdx++] = equity;
      }
    }
    while (curveIdx < CURVE_POINTS) allCurves[base + curveIdx++] = equity;

    if (equity <= startingCapital * (1 - ruinThreshold)) ruinCount++;

    finalEquities[sim] = equity;
    maxDrawdowns[sim]  = maxDD;
    worstStreaks[sim]  = worstStreak;
  }

  // Sort simulation indices by final equity
  const sortedByEquity = Array.from({ length: numSimulations }, (_, i) => i)
    .sort((a, b) => finalEquities[a]! - finalEquities[b]!);

  const sortedEquity   = sortedByEquity.map(i => finalEquities[i]!);
  const sortedDD       = [...maxDrawdowns].sort((a, b) => a - b);
  const sortedStreaks  = [...worstStreaks].sort((a, b) => a - b);

  // Monthly return per simulation
  const months = numTrades / tradesPerMonth;
  const monthlyReturns = sortedByEquity.map(i =>
    (finalEquities[i]! - startingCapital) / months,
  );
  const sortedMonthly = [...monthlyReturns].sort((a, b) => a - b);

  // Probability of ruin
  const probabilityOfRuin =
    Math.round((ruinCount / numSimulations) * 10_000) / 100;

  // Drawdown stats
  const worstDrawdown        = Math.round(pctl(sortedDD, 99.5) * 100) / 100;
  const expectedDrawdown     = Math.round(mean([...maxDrawdowns]) * 100) / 100;
  const medianDrawdown       = Math.round(pctl(sortedDD, 50) * 100) / 100;
  const drawdownPercentile90 = Math.round(pctl(sortedDD, 90) * 100) / 100;

  // Losing streak stats
  const streakArr             = [...worstStreaks];
  const worstLosingStreak    = Math.max(...streakArr);
  const expectedLosingStreak = Math.round(mean(streakArr) * 10) / 10;
  const medianLosingStreak   = pctl(sortedStreaks, 50);

  // Monthly return stats
  const expectedMonthlyReturn = Math.round(mean(sortedMonthly) * 100) / 100;
  const medianMonthlyReturn   = Math.round(pctl(sortedMonthly, 50) * 100) / 100;

  // Final equity percentiles
  const worstCaseReturn = Math.round(pctl(sortedEquity, 5) * 100) / 100;
  const percentile10    = Math.round(pctl(sortedEquity, 10) * 100) / 100;
  const percentile25    = Math.round(pctl(sortedEquity, 25) * 100) / 100;
  const medianReturn    = Math.round(pctl(sortedEquity, 50) * 100) / 100;
  const percentile75    = Math.round(pctl(sortedEquity, 75) * 100) / 100;
  const percentile90    = Math.round(pctl(sortedEquity, 90) * 100) / 100;
  const bestCaseReturn  = Math.round(pctl(sortedEquity, 95) * 100) / 100;
  const expectedReturn  = Math.round(mean(sortedEquity) * 100) / 100;

  const worstCaseReturnPct  = Math.round(((worstCaseReturn - startingCapital) / startingCapital) * 10000) / 100;
  const expectedReturnPct   = Math.round(((expectedReturn  - startingCapital) / startingCapital) * 10000) / 100;
  const bestCaseReturnPct   = Math.round(((bestCaseReturn  - startingCapital) / startingCapital) * 10000) / 100;

  // Histogram from sorted equities
  const histogram = buildHistogram(sortedEquity, 20);

  // Sample equity curves at key percentiles
  function extractCurve(simIdx: number): number[] {
    const base = simIdx * CURVE_POINTS;
    return Array.from({ length: CURVE_POINTS }, (_, i) =>
      Math.round(allCurves[base + i]! * 100) / 100,
    );
  }

  const idxWorst  = sortedByEquity[Math.floor(numSimulations * 0.02)]!;
  const idxP10    = sortedByEquity[Math.floor(numSimulations * 0.10)]!;
  const idxMedian = sortedByEquity[Math.floor(numSimulations * 0.50)]!;
  const idxP90    = sortedByEquity[Math.floor(numSimulations * 0.90)]!;
  const idxBest   = sortedByEquity[Math.floor(numSimulations * 0.98)]!;

  const equityCurves: EquityCurves = {
    worst:  extractCurve(idxWorst),
    p10:    extractCurve(idxP10),
    median: extractCurve(idxMedian),
    p90:    extractCurve(idxP90),
    best:   extractCurve(idxBest),
    labels: sampleAt,
  };

  return {
    numSimulations,
    numTrades,
    startingCapital,
    winRate,
    avgWin,
    avgLoss,
    ruinThreshold,
    tradesPerMonth,

    probabilityOfRuin,

    worstDrawdown,
    expectedDrawdown,
    medianDrawdown,
    drawdownPercentile90,

    expectedMonthlyReturn,
    medianMonthlyReturn,

    worstLosingStreak,
    expectedLosingStreak,
    medianLosingStreak,

    worstCaseReturn,
    percentile10,
    percentile25,
    medianReturn,
    percentile75,
    percentile90,
    bestCaseReturn,
    expectedReturn,

    worstCaseReturnPct,
    expectedReturnPct,
    bestCaseReturnPct,

    histogram,
    equityCurves,
  };
}
