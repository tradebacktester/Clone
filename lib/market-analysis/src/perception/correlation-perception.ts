import type { Candle } from "../types.js";

export type CorrelationStatus =
  | "high_positive"
  | "normal"
  | "high_negative"
  | "breakdown";

export interface PairCorrelation {
  pairA: string;
  pairB: string;
  correlation: number;
  status: CorrelationStatus;
  sampleSize: number;
  rollingCorrelations: number[];
}

export interface CorrelationPerception {
  eurusd_gbpusd: PairCorrelation;
  eurusd_usdjpy: PairCorrelation;
  gbpusd_usdjpy: PairCorrelation;
  overallCorrelationRisk: "low" | "medium" | "high";
  confidence: number;
}

function alignCandles(a: Candle[], b: Candle[], n: number): [number[], number[]] {
  const closesA: number[] = [];
  const closesB: number[] = [];

  const sliceA = a.slice(-n);
  const sliceB = b.slice(-n);
  const len = Math.min(sliceA.length, sliceB.length);

  for (let i = 0; i < len; i++) {
    closesA.push(sliceA[i]!.close);
    closesB.push(sliceB[i]!.close);
  }
  return [closesA, closesB];
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i]! - meanX;
    const dy = y[i]! - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom > 0 ? Math.round((num / denom) * 1000) / 1000 : 0;
}

function rollingCorrelations(a: Candle[], b: Candle[], window = 10, points = 5): number[] {
  const results: number[] = [];
  const total = Math.min(a.length, b.length);
  if (total < window) return [];

  for (let i = 0; i < points; i++) {
    const end = total - i * Math.floor(window / 2);
    const start = end - window;
    if (start < 0) break;
    const sliceA = a.slice(start, end).map(c => c.close);
    const sliceB = b.slice(start, end).map(c => c.close);
    results.unshift(pearsonCorrelation(sliceA, sliceB));
  }
  return results;
}

function classifyCorrelation(r: number, rolling: number[]): CorrelationStatus {
  if (rolling.length >= 3) {
    const recent = rolling.slice(-2);
    const older = rolling.slice(0, -2);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
    if (Math.abs(recentAvg - olderAvg) > 0.4) return "breakdown";
  }
  if (r >= 0.7) return "high_positive";
  if (r <= -0.7) return "high_negative";
  return "normal";
}

export function perceiveCorrelation(
  pairCandles: Partial<Record<string, Candle[]>>,
  window = 20,
): CorrelationPerception {
  const empty: PairCorrelation = {
    pairA: "", pairB: "", correlation: 0, status: "normal", sampleSize: 0, rollingCorrelations: [],
  };

  const eurusd = pairCandles["EURUSD"] ?? pairCandles["eurusd"] ?? [];
  const gbpusd = pairCandles["GBPUSD"] ?? pairCandles["gbpusd"] ?? [];
  const usdjpy = pairCandles["USDJPY"] ?? pairCandles["usdjpy"] ?? [];

  function buildPairCorrelation(
    pairA: string, a: Candle[],
    pairB: string, b: Candle[],
  ): PairCorrelation {
    const minLen = Math.min(a.length, b.length);
    if (minLen < 5) return { ...empty, pairA, pairB };

    const [closesA, closesB] = alignCandles(a, b, window);
    const correlation = pearsonCorrelation(closesA, closesB);
    const rolling = rollingCorrelations(a, b, Math.min(10, window), 5);
    const status = classifyCorrelation(correlation, rolling);

    return {
      pairA, pairB, correlation, status,
      sampleSize: Math.min(a.length, b.length, window),
      rollingCorrelations: rolling,
    };
  }

  const eurusd_gbpusd = buildPairCorrelation("EURUSD", eurusd, "GBPUSD", gbpusd);
  const eurusd_usdjpy = buildPairCorrelation("EURUSD", eurusd, "USDJPY", usdjpy);
  const gbpusd_usdjpy = buildPairCorrelation("GBPUSD", gbpusd, "USDJPY", usdjpy);

  const breakdowns = [eurusd_gbpusd, eurusd_usdjpy, gbpusd_usdjpy]
    .filter(p => p.status === "breakdown").length;
  const highCorrelations = [eurusd_gbpusd, eurusd_usdjpy, gbpusd_usdjpy]
    .filter(p => p.status === "high_positive" || p.status === "high_negative").length;

  const overallCorrelationRisk: "low" | "medium" | "high" =
    breakdowns >= 2 ? "high" :
    breakdowns >= 1 || highCorrelations >= 2 ? "medium" : "low";

  const minSample = Math.min(
    eurusd_gbpusd.sampleSize,
    eurusd_usdjpy.sampleSize,
    gbpusd_usdjpy.sampleSize,
  );

  const confidence = Math.min(100, Math.round(
    (minSample >= window ? 60 : (minSample / window) * 60) + 40,
  ));

  return {
    eurusd_gbpusd,
    eurusd_usdjpy,
    gbpusd_usdjpy,
    overallCorrelationRisk,
    confidence,
  };
}
