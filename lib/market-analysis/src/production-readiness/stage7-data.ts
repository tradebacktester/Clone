import { createDefaultRegistry } from "../historical/index.js";
import type { StageResult, Finding } from "./types.js";
import type { Pair, Timeframe } from "../types.js";

const PAIRS: Pair[] = ["EURUSD", "GBPUSD", "USDJPY"];
const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h"];

interface DataQualityReport {
  pair: Pair;
  timeframe: Timeframe;
  provider: string | null;
  candles: number;
  gapRate: number;
  duplicateRate: number;
  coveragePct: number;
  qualityScore: number;
  issues: string[];
}

function analyzeCandles(candles: Array<{ time: number; open: number; high: number; low: number; close: number }>, timeframe: Timeframe): {
  gapRate: number;
  duplicateRate: number;
  issues: string[];
} {
  const issues: string[] = [];
  if (candles.length === 0) return { gapRate: 0, duplicateRate: 0, issues: ["No candles available"] };

  const sorted = [...candles].sort((a, b) => a.time - b.time);

  const tfMs: Record<Timeframe, number> = {
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  };
  const expectedInterval = tfMs[timeframe] ?? 60 * 60 * 1000;

  let gaps = 0;
  let duplicates = 0;
  const seenTimes = new Set<number>();
  const WEEKEND_SKIP = 2.5 * 24 * 60 * 60 * 1000;

  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i].time - sorted[i - 1].time;
    if (seenTimes.has(sorted[i].time)) {
      duplicates++;
    }
    seenTimes.add(sorted[i].time);
    if (diff > expectedInterval * 1.5 && diff < WEEKEND_SKIP) {
      const missedBars = Math.round(diff / expectedInterval) - 1;
      if (missedBars > 2) gaps += missedBars;
    }
  }

  const gapRate = sorted.length > 0 ? (gaps / (sorted.length + gaps)) * 100 : 0;
  const duplicateRate = sorted.length > 0 ? (duplicates / sorted.length) * 100 : 0;

  if (gapRate > 20) issues.push(`High gap rate: ${gapRate.toFixed(1)}% of bars missing`);
  if (duplicateRate > 1) issues.push(`Duplicate bars detected: ${duplicateRate.toFixed(1)}%`);

  const tzCheck = sorted.slice(0, 10).every((c) => {
    const d = new Date(c.time);
    return d.getUTCHours() !== undefined;
  });
  if (!tzCheck) issues.push("Timezone inconsistency detected — some candles may not be UTC-aligned");

  const hasZeroCandles = sorted.filter(
    (c) => c.open === 0 || c.high === 0 || c.low === 0 || c.close === 0,
  ).length;
  if (hasZeroCandles > 0) issues.push(`${hasZeroCandles} candle(s) with zero OHLC values (corrupted data)`);

  const invertedCandles = sorted.filter((c) => c.high < c.low).length;
  if (invertedCandles > 0) issues.push(`${invertedCandles} candle(s) with high < low (data integrity failure)`);

  return { gapRate, duplicateRate, issues };
}

export async function runStage7(): Promise<StageResult> {
  const t0 = Date.now();
  const findings: Finding[] = [];
  const blockers: string[] = [];

  let registry;
  try {
    registry = createDefaultRegistry();
  } catch (err) {
    findings.push({ level: "warn", message: `Could not initialize provider registry: ${String(err)}` });
    return {
      id: 7,
      name: "Data Validation",
      status: "skip",
      score: 40,
      findings,
      blockers,
      durationMs: Date.now() - t0,
      details: {},
    };
  }

  const providerStatuses = await registry.getStatus(PAIRS[0], TIMEFRAMES[0]);
  const providers = providerStatuses;
  const configuredProviders = providers.filter((p) => p.configured);
  const highQualityProviders = configuredProviders.filter((p) => p.priority <= 7);

  findings.push({
    level: configuredProviders.length >= 2 ? "info" : configuredProviders.length === 1 ? "warn" : "critical",
    message: `${configuredProviders.length}/${providers.length} data provider(s) configured`,
  });

  if (configuredProviders.length === 0) {
    blockers.push("No data providers configured — historical validation cannot run without real market data");
  } else if (highQualityProviders.length === 0) {
    findings.push({
      level: "warn",
      message: "Only fallback providers available (Yahoo Finance) — limited to recent data; configure OANDA or Dukascopy for production",
    });
  }

  for (const p of providers) {
    findings.push({
      level: p.configured && p.priority <= 7 ? "info" : p.configured ? "warn" : "info",
      message: `Provider "${p.name}" (priority ${p.priority}): ${p.configured ? "configured" : "not configured"}`,
    });
  }

  const reports: DataQualityReport[] = [];

  for (const pair of PAIRS) {
    for (const tf of TIMEFRAMES) {
      try {
        const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = new Date();
        const fetchResult = await registry.fetchBest(pair, tf, start, end);

        const candles = fetchResult?.candles ?? [];
        const analysis = analyzeCandles(
          candles.map((c) => ({
            time: c.time instanceof Date ? c.time.getTime() : (c.time as number),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
          tf,
        );

        const totalExpected = fetchResult?.totalExpected ?? 0;
        const coveragePct = totalExpected > 0 ? Math.min(100, (candles.length / totalExpected) * 100) : (candles.length > 0 ? 80 : 0);
        const qualityScore = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              coveragePct -
                analysis.gapRate * 0.5 -
                analysis.duplicateRate * 2 -
                analysis.issues.filter((i) => i.includes("integrity") || i.includes("zero")).length * 20,
            ),
          ),
        );

        reports.push({
          pair,
          timeframe: tf,
          provider: fetchResult?.provider ?? null,
          candles: candles.length,
          gapRate: Math.round(analysis.gapRate * 10) / 10,
          duplicateRate: Math.round(analysis.duplicateRate * 10) / 10,
          coveragePct: Math.round(coveragePct * 10) / 10,
          qualityScore,
          issues: analysis.issues,
        });

        for (const issue of analysis.issues) {
          findings.push({ level: "warn", message: `${pair} ${tf}: ${issue}` });
        }
      } catch {
        reports.push({
          pair,
          timeframe: tf,
          provider: null,
          candles: 0,
          gapRate: 0,
          duplicateRate: 0,
          coveragePct: 0,
          qualityScore: 0,
          issues: ["No data available for last 30 days"],
        });
      }
    }
  }

  const reportsWithData = reports.filter((r) => r.candles > 0);
  const avgQuality =
    reportsWithData.length > 0
      ? reportsWithData.reduce((s, r) => s + r.qualityScore, 0) / reportsWithData.length
      : 0;

  const criticalIssues = reports.flatMap((r) =>
    r.issues
      .filter((i) => i.includes("integrity") || i.includes("zero") || i.includes("high < low"))
      .map((i) => `${r.pair} ${r.timeframe}: ${i}`),
  );

  for (const issue of criticalIssues) {
    blockers.push(`Data integrity failure: ${issue}`);
    findings.push({ level: "critical", message: issue });
  }

  const noDataPairs = PAIRS.filter((pair) =>
    reports.filter((r) => r.pair === pair && r.candles === 0).length === TIMEFRAMES.length,
  );

  if (noDataPairs.length > 0) {
    findings.push({
      level: "warn",
      message: `No recent data for: ${noDataPairs.join(", ")} — upload CSV files or configure additional providers`,
    });
  }

  findings.push({
    level: avgQuality >= 80 ? "info" : avgQuality >= 60 ? "warn" : "critical",
    message: `Average data quality score: ${avgQuality.toFixed(0)}/100 across ${reportsWithData.length} pair×timeframe combinations`,
  });

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        avgQuality * 0.6 +
          (configuredProviders.length / providers.length) * 30 +
          (reportsWithData.length / reports.length) * 10,
      ),
    ),
  );

  const status = blockers.length > 0 ? "fail" : avgQuality < 50 || configuredProviders.length === 0 ? "warn" : "pass";

  return {
    id: 7,
    name: "Data Validation",
    status,
    score,
    findings,
    blockers,
    durationMs: Date.now() - t0,
    details: {
      providers: providers.length,
      configuredProviders: configuredProviders.length,
      highQualityProviders: highQualityProviders.length,
      avgQualityScore: Math.round(avgQuality),
      reportsWithData: reportsWithData.length,
      totalCombinations: reports.length,
      reports,
      criticalIssues,
    },
  };
}
