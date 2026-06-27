import {
  db,
  tradesTable,
  botStateTable,
  botConfigTable,
  marketRegimeTable,
  strategyHealthSnapshotTable,
  supervisorAlertsTable,
} from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";
import { logger } from "./logger.js";
import { getCachedAnalysis } from "./analyzer.js";
import { getCurrentPrice } from "./price-feed.js";

export interface HealthMetric {
  name: string;
  value: number | null;
  status: "healthy" | "degraded" | "critical" | "insufficient_data";
  message: string;
  threshold?: number;
}

export interface StrategyHealthReport {
  overallScore: number;
  status: "healthy" | "degraded" | "critical";
  metrics: HealthMetric[];
  alerts: string[];
  snapshotAt: string;
  totalTrades: number;
  openTrades: number;
}

const PAIRS = ["EURUSD", "GBPUSD", "USDJPY"] as const;

async function emitHealthAlert(alertType: string, severity: "info" | "warning" | "critical", message: string): Promise<void> {
  try {
    await db.insert(supervisorAlertsTable).values({
      alertType,
      severity,
      message,
      acknowledged: false,
    });
  } catch {
    // non-fatal
  }
}

async function checkWinRate(): Promise<HealthMetric> {
  const WINDOW = 20;
  const WARN = 40;
  const CRITICAL = 30;

  const recent = await db
    .select({ pnl: tradesTable.pnl })
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .orderBy(desc(tradesTable.closedAt))
    .limit(WINDOW);

  if (recent.length < 5) {
    return {
      name: "Win Rate",
      value: null,
      status: "insufficient_data",
      message: `Only ${recent.length} closed trades — need ≥5 for analysis`,
      threshold: WARN,
    };
  }

  const wins = recent.filter(r => parseFloat(r.pnl ?? "0") > 0).length;
  const winRate = (wins / recent.length) * 100;

  if (winRate < CRITICAL) {
    await emitHealthAlert("win_rate_critical", "critical", `Win rate critically degraded: ${winRate.toFixed(1)}% (last ${recent.length} trades)`);
    return { name: "Win Rate", value: winRate, status: "critical", message: `${winRate.toFixed(1)}% — critically low (last ${recent.length} trades)`, threshold: CRITICAL };
  }
  if (winRate < WARN) {
    await emitHealthAlert("win_rate_degraded", "warning", `Win rate degraded: ${winRate.toFixed(1)}% (last ${recent.length} trades)`);
    return { name: "Win Rate", value: winRate, status: "degraded", message: `${winRate.toFixed(1)}% — below warning threshold (last ${recent.length} trades)`, threshold: WARN };
  }
  return { name: "Win Rate", value: winRate, status: "healthy", message: `${winRate.toFixed(1)}% over last ${recent.length} trades`, threshold: WARN };
}

async function checkProfitFactor(): Promise<HealthMetric> {
  const WINDOW = 30;
  const WARN = 1.0;
  const CRITICAL = 0.7;

  const recent = await db
    .select({ pnl: tradesTable.pnl })
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .orderBy(desc(tradesTable.closedAt))
    .limit(WINDOW);

  if (recent.length < 10) {
    return { name: "Profit Factor", value: null, status: "insufficient_data", message: `Only ${recent.length} trades — need ≥10`, threshold: WARN };
  }

  const gross = recent.reduce((acc, r) => {
    const p = parseFloat(r.pnl ?? "0");
    if (p > 0) acc.profit += p; else acc.loss += Math.abs(p);
    return acc;
  }, { profit: 0, loss: 0 });

  const pf = gross.loss === 0 ? 999 : gross.profit / gross.loss;

  if (pf < CRITICAL) {
    await emitHealthAlert("profit_factor_critical", "critical", `Profit factor critically low: ${pf.toFixed(2)}`);
    return { name: "Profit Factor", value: pf, status: "critical", message: `PF ${pf.toFixed(2)} — strategy is losing money net`, threshold: CRITICAL };
  }
  if (pf < WARN) {
    await emitHealthAlert("profit_factor_degraded", "warning", `Profit factor below 1.0: ${pf.toFixed(2)}`);
    return { name: "Profit Factor", value: pf, status: "degraded", message: `PF ${pf.toFixed(2)} — net loss territory`, threshold: WARN };
  }
  return { name: "Profit Factor", value: pf, status: "healthy", message: `PF ${pf.toFixed(2)} over last ${recent.length} trades`, threshold: WARN };
}

async function checkDrawdown(): Promise<HealthMetric> {
  const INITIAL = 10_000;
  const WARN = 8;
  const CRITICAL = 15;

  const rows = await db
    .select({ pnl: tradesTable.pnl, closedAt: tradesTable.closedAt })
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .orderBy(tradesTable.closedAt);

  if (rows.length === 0) {
    return { name: "Drawdown", value: 0, status: "healthy", message: "No closed trades", threshold: WARN };
  }

  let peak = INITIAL;
  let running = INITIAL;
  let maxDd = 0;

  for (const r of rows) {
    running += parseFloat(r.pnl ?? "0");
    if (running > peak) peak = running;
    const dd = peak > 0 ? ((peak - running) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }

  if (maxDd >= CRITICAL) {
    await emitHealthAlert("drawdown_critical", "critical", `Max drawdown reached ${maxDd.toFixed(1)}%`);
    return { name: "Drawdown", value: maxDd, status: "critical", message: `${maxDd.toFixed(1)}% peak-to-trough drawdown`, threshold: CRITICAL };
  }
  if (maxDd >= WARN) {
    await emitHealthAlert("drawdown_elevated", "warning", `Drawdown elevated: ${maxDd.toFixed(1)}%`);
    return { name: "Drawdown", value: maxDd, status: "degraded", message: `${maxDd.toFixed(1)}% drawdown — approaching limit`, threshold: WARN };
  }
  return { name: "Drawdown", value: maxDd, status: "healthy", message: `${maxDd.toFixed(1)}% max drawdown`, threshold: WARN };
}

async function checkSignalFrequency(): Promise<HealthMetric> {
  const DAYS = 7;
  const MIN_SIGNALS_PER_DAY = 0.3;
  const MAX_SIGNALS_PER_DAY = 10;

  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const recent = await db
    .select({ openedAt: tradesTable.openedAt })
    .from(tradesTable)
    .where(gte(tradesTable.openedAt, cutoff));

  const signalsPerDay = recent.length / DAYS;

  if (recent.length === 0) {
    return { name: "Signal Frequency", value: 0, status: "degraded", message: "No signals in last 7 days — analysis may be stalled", threshold: MIN_SIGNALS_PER_DAY };
  }
  if (signalsPerDay > MAX_SIGNALS_PER_DAY) {
    await emitHealthAlert("signal_frequency_high", "warning", `Signal frequency unusually high: ${signalsPerDay.toFixed(1)}/day`);
    return { name: "Signal Frequency", value: signalsPerDay, status: "degraded", message: `${signalsPerDay.toFixed(1)} signals/day — unusually high`, threshold: MAX_SIGNALS_PER_DAY };
  }
  if (signalsPerDay < MIN_SIGNALS_PER_DAY) {
    return { name: "Signal Frequency", value: signalsPerDay, status: "degraded", message: `${signalsPerDay.toFixed(2)} signals/day — very low activity`, threshold: MIN_SIGNALS_PER_DAY };
  }
  return { name: "Signal Frequency", value: signalsPerDay, status: "healthy", message: `${signalsPerDay.toFixed(1)} signals/day over last 7 days`, threshold: MAX_SIGNALS_PER_DAY };
}

function checkDataQuality(): HealthMetric {
  const pairs = PAIRS;
  let liveCount = 0;
  let staleCount = 0;
  const now = Date.now();

  for (const pair of pairs) {
    const p = getCurrentPrice(pair);
    if (!p) { staleCount++; continue; }
    if (now - p.updatedAt.getTime() > 5 * 60 * 1000) { staleCount++; } else { liveCount++; }
  }

  const score = Math.round((liveCount / pairs.length) * 100);

  if (staleCount >= 2) {
    return { name: "Data Quality", value: score, status: "critical", message: `${staleCount}/${pairs.length} pairs have stale/missing prices`, threshold: 80 };
  }
  if (staleCount === 1) {
    return { name: "Data Quality", value: score, status: "degraded", message: `${staleCount}/${pairs.length} pair has stale prices`, threshold: 80 };
  }

  let analysisCount = 0;
  for (const pair of pairs) {
    const a = getCachedAnalysis(pair, "4h");
    if (a) analysisCount++;
  }
  const analysisScore = Math.round((analysisCount / pairs.length) * 100);
  const combined = Math.round((score + analysisScore) / 2);

  if (combined < 70) {
    return { name: "Data Quality", value: combined, status: "degraded", message: `Data quality score ${combined}/100 — analysis may be stale`, threshold: 80 };
  }
  return { name: "Data Quality", value: combined, status: "healthy", message: `Data quality score ${combined}/100`, threshold: 80 };
}

async function checkRegimeStability(): Promise<HealthMetric> {
  const unfavorable: string[] = [];
  const volatile: string[] = [];

  for (const pair of PAIRS) {
    const [row] = await db
      .select()
      .from(marketRegimeTable)
      .where(eq(marketRegimeTable.pair, pair))
      .limit(1);

    if (!row) continue;
    const conf = parseFloat(row.regimeConfidence ?? "0");
    if (row.regime === "volatile" && conf > 60) volatile.push(pair);
    if (row.regime === "low_volatility" && conf > 70) unfavorable.push(pair);
  }

  const stabilityScore = Math.round(((PAIRS.length - volatile.length - unfavorable.length) / PAIRS.length) * 100);

  if (volatile.length >= 2 || unfavorable.length + volatile.length >= 2) {
    await emitHealthAlert("regime_unstable", "warning", `Market regime unstable: ${[...volatile, ...unfavorable].join(", ")}`);
    return { name: "Regime Stability", value: stabilityScore, status: "degraded", message: `Unfavorable regimes: ${[...volatile, ...unfavorable].join(", ")}`, threshold: 66 };
  }
  return { name: "Regime Stability", value: stabilityScore, status: "healthy", message: `${stabilityScore}% of pairs in favorable regime`, threshold: 66 };
}

export async function runStrategyHealthCheck(): Promise<StrategyHealthReport> {
  const alerts: string[] = [];

  const [
    winRateMetric,
    profitFactorMetric,
    drawdownMetric,
    signalFreqMetric,
    regimeMetric,
  ] = await Promise.all([
    checkWinRate(),
    checkProfitFactor(),
    checkDrawdown(),
    checkSignalFrequency(),
    checkRegimeStability(),
  ]);

  const dataQualityMetric = checkDataQuality();

  const metrics = [winRateMetric, profitFactorMetric, drawdownMetric, signalFreqMetric, dataQualityMetric, regimeMetric];

  for (const m of metrics) {
    if (m.status === "critical") alerts.push(`CRITICAL: ${m.name} — ${m.message}`);
    else if (m.status === "degraded") alerts.push(`WARNING: ${m.name} — ${m.message}`);
  }

  const criticalCount = metrics.filter(m => m.status === "critical").length;
  const degradedCount = metrics.filter(m => m.status === "degraded").length;
  const healthyCount = metrics.filter(m => m.status === "healthy").length;
  const totalScored = metrics.filter(m => m.status !== "insufficient_data").length;

  let overallScore = 0;
  if (totalScored > 0) {
    const scoreSum = metrics.reduce((s, m) => {
      if (m.status === "healthy") return s + 100;
      if (m.status === "degraded") return s + 50;
      if (m.status === "critical") return s + 0;
      return s + 75;
    }, 0);
    overallScore = Math.round(scoreSum / metrics.length);
  }

  const status = criticalCount > 0 ? "critical" : degradedCount >= 2 ? "degraded" : "healthy";

  const [stateRow] = await db.select().from(botStateTable).limit(1);
  const totalTrades = await db.select().from(tradesTable);
  const openTrades = totalTrades.filter(t => t.status === "open").length;
  const totalClosedTrades = totalTrades.filter(t => t.status === "closed").length;

  const snapshot = await db.insert(strategyHealthSnapshotTable).values({
    winRateRolling20: winRateMetric.value != null ? String(Math.round(winRateMetric.value * 100) / 100) : null,
    profitFactorRolling30: profitFactorMetric.value != null ? String(Math.round(profitFactorMetric.value * 10000) / 10000) : null,
    maxDrawdownPct: drawdownMetric.value != null ? String(Math.round(drawdownMetric.value * 100) / 100) : null,
    signalFrequencyPerDay: signalFreqMetric.value != null ? String(Math.round(signalFreqMetric.value * 10000) / 10000) : null,
    dataQualityScore: dataQualityMetric.value != null ? String(Math.round(dataQualityMetric.value * 100) / 100) : null,
    regimeStabilityScore: regimeMetric.value != null ? String(Math.round(regimeMetric.value * 100) / 100) : null,
    overallHealthScore: String(overallScore),
    totalTrades: totalClosedTrades,
    openTrades,
    alertCount: alerts.length,
    alerts: alerts.length > 0 ? alerts : null,
    mode: stateRow?.brokerMode ?? "paper",
  }).returning();

  return {
    overallScore,
    status,
    metrics,
    alerts,
    snapshotAt: snapshot[0]?.snapshotAt?.toISOString() ?? new Date().toISOString(),
    totalTrades: totalClosedTrades,
    openTrades,
  };
}

export async function getLatestHealthSnapshots(limit = 24): Promise<typeof strategyHealthSnapshotTable.$inferSelect[]> {
  return db
    .select()
    .from(strategyHealthSnapshotTable)
    .orderBy(desc(strategyHealthSnapshotTable.snapshotAt))
    .limit(limit);
}

let healthMonitorInterval: ReturnType<typeof setInterval> | null = null;

export function startStrategyHealthMonitor(intervalMinutes = 30): void {
  if (healthMonitorInterval) return;
  healthMonitorInterval = setInterval(() => {
    runStrategyHealthCheck().catch(err => logger.warn({ err }, "Strategy health check failed"));
  }, intervalMinutes * 60 * 1000);
  logger.info({ intervalMinutes }, "Strategy health monitor started");
}

export function stopStrategyHealthMonitor(): void {
  if (healthMonitorInterval) {
    clearInterval(healthMonitorInterval);
    healthMonitorInterval = null;
  }
}
