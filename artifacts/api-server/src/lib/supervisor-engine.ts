import {
  db,
  tradesTable,
  botStateTable,
  botConfigTable,
  riskSettingsTable,
  supervisorAlertsTable,
  marketRegimeTable,
  executionLogTable,
} from "@workspace/db";
import { eq, desc, and, gte, lt, count, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { getCurrentPrice, getPriceLastUpdated } from "./price-feed.js";
import { getCachedAnalysis } from "./analyzer.js";

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertType =
  | "daily_loss_limit"
  | "weekly_loss_limit"
  | "win_rate_degradation"
  | "profit_factor_degradation"
  | "drawdown_warning"
  | "regime_change"
  | "price_feed_stale"
  | "analysis_stale"
  | "data_feed_error"
  | "strategy_pause"
  | "broker_connection_fail";

export type CheckStatus = "ok" | "warning" | "critical";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  value?: number | null;
  threshold?: number | null;
}

export interface SupervisorStatus {
  overallHealth: "healthy" | "degraded" | "critical";
  checks: CheckResult[];
  activeAlertCount: number;
  botPaused: boolean;
  lastCheckedAt: string | null;
}

let supervisorInterval: ReturnType<typeof setInterval> | null = null;
let lastCheckedAt: Date | null = null;
let lastCheckResults: CheckResult[] = [];

function startOfDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(): Date {
  const d = new Date();
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - dow);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function emitAlert(
  alertType: AlertType,
  severity: AlertSeverity,
  message: string,
  opts: { pair?: string; metric?: string; value?: number; threshold?: number } = {},
): Promise<void> {
  try {
    await db.insert(supervisorAlertsTable).values({
      alertType,
      severity,
      message,
      pair: opts.pair ?? null,
      metric: opts.metric ?? null,
      value: opts.value != null ? String(opts.value) : null,
      threshold: opts.threshold != null ? String(opts.threshold) : null,
      acknowledged: false,
    });
    logger.warn({ alertType, severity, message, ...opts }, "Supervisor alert emitted");
  } catch (err) {
    logger.error({ err, alertType }, "Failed to emit supervisor alert");
  }
}

async function pauseBot(reason: string): Promise<void> {
  try {
    await db
      .update(botStateTable)
      .set({ haltedDueToRisk: true })
      .where(eq(botStateTable.id, 1));
    logger.warn({ reason }, "Supervisor paused bot");
  } catch (err) {
    logger.error({ err }, "Supervisor failed to pause bot");
  }
}

async function checkDailyLoss(
  maxDailyLossPct: number,
  balance: number,
): Promise<CheckResult> {
  const today = startOfDay();
  const rows = await db
    .select({ pnl: tradesTable.pnl })
    .from(tradesTable)
    .where(
      and(
        eq(tradesTable.status, "closed"),
        gte(tradesTable.closedAt, today),
      ),
    );
  const dailyPnl = rows.reduce((s, r) => s + parseFloat(r.pnl ?? "0"), 0);
  const dailyPct = balance > 0 ? (dailyPnl / balance) * 100 : 0;
  const threshold = -Math.abs(maxDailyLossPct);

  if (dailyPct <= threshold) {
    await emitAlert(
      "daily_loss_limit",
      "critical",
      `Daily loss limit reached: ${dailyPct.toFixed(2)}% (limit ${threshold}%)`,
      { metric: "daily_pnl_pct", value: dailyPct, threshold },
    );
    await pauseBot("daily_loss_limit");
    return {
      name: "Daily Loss",
      status: "critical",
      message: `${dailyPct.toFixed(2)}% loss today (limit ${threshold}%)`,
      value: dailyPct,
      threshold,
    };
  }
  if (dailyPct <= threshold * 0.75) {
    return {
      name: "Daily Loss",
      status: "warning",
      message: `${dailyPct.toFixed(2)}% loss today (limit ${threshold}%), approaching limit`,
      value: dailyPct,
      threshold,
    };
  }
  return {
    name: "Daily Loss",
    status: "ok",
    message: `${dailyPct.toFixed(2)}% daily P&L`,
    value: dailyPct,
    threshold,
  };
}

async function checkWeeklyLoss(
  maxWeeklyLossPct: number,
  balance: number,
): Promise<CheckResult> {
  const weekStart = startOfWeek();
  const rows = await db
    .select({ pnl: tradesTable.pnl })
    .from(tradesTable)
    .where(
      and(
        eq(tradesTable.status, "closed"),
        gte(tradesTable.closedAt, weekStart),
      ),
    );
  const weeklyPnl = rows.reduce((s, r) => s + parseFloat(r.pnl ?? "0"), 0);
  const weeklyPct = balance > 0 ? (weeklyPnl / balance) * 100 : 0;
  const threshold = -Math.abs(maxWeeklyLossPct);

  if (weeklyPct <= threshold) {
    await emitAlert(
      "weekly_loss_limit",
      "critical",
      `Weekly loss limit reached: ${weeklyPct.toFixed(2)}% (limit ${threshold}%)`,
      { metric: "weekly_pnl_pct", value: weeklyPct, threshold },
    );
    await pauseBot("weekly_loss_limit");
    return {
      name: "Weekly Loss",
      status: "critical",
      message: `${weeklyPct.toFixed(2)}% loss this week (limit ${threshold}%)`,
      value: weeklyPct,
      threshold,
    };
  }
  if (weeklyPct <= threshold * 0.75) {
    return {
      name: "Weekly Loss",
      status: "warning",
      message: `${weeklyPct.toFixed(2)}% weekly P&L, approaching limit`,
      value: weeklyPct,
      threshold,
    };
  }
  return {
    name: "Weekly Loss",
    status: "ok",
    message: `${weeklyPct.toFixed(2)}% weekly P&L`,
    value: weeklyPct,
    threshold,
  };
}

async function checkWinRateDegradation(): Promise<CheckResult> {
  const WINDOW = 20;
  const WARN_THRESHOLD = 35;
  const CRITICAL_THRESHOLD = 25;

  const recent = await db
    .select({ pnl: tradesTable.pnl })
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .orderBy(desc(tradesTable.closedAt))
    .limit(WINDOW);

  if (recent.length < 5) {
    return {
      name: "Win Rate",
      status: "ok",
      message: `Insufficient trades for analysis (${recent.length} closed)`,
      value: null,
      threshold: WARN_THRESHOLD,
    };
  }

  const wins = recent.filter(r => parseFloat(r.pnl ?? "0") > 0).length;
  const winRate = (wins / recent.length) * 100;

  if (winRate <= CRITICAL_THRESHOLD) {
    await emitAlert(
      "win_rate_degradation",
      "critical",
      `Win rate critically low: ${winRate.toFixed(1)}% over last ${recent.length} trades`,
      { metric: "rolling_win_rate", value: winRate, threshold: CRITICAL_THRESHOLD },
    );
    await pauseBot("win_rate_degradation");
    return {
      name: "Win Rate",
      status: "critical",
      message: `${winRate.toFixed(1)}% over last ${recent.length} trades (critical <${CRITICAL_THRESHOLD}%)`,
      value: winRate,
      threshold: CRITICAL_THRESHOLD,
    };
  }
  if (winRate <= WARN_THRESHOLD) {
    await emitAlert(
      "win_rate_degradation",
      "warning",
      `Win rate degraded: ${winRate.toFixed(1)}% over last ${recent.length} trades`,
      { metric: "rolling_win_rate", value: winRate, threshold: WARN_THRESHOLD },
    );
    return {
      name: "Win Rate",
      status: "warning",
      message: `${winRate.toFixed(1)}% over last ${recent.length} trades (warn <${WARN_THRESHOLD}%)`,
      value: winRate,
      threshold: WARN_THRESHOLD,
    };
  }
  return {
    name: "Win Rate",
    status: "ok",
    message: `${winRate.toFixed(1)}% over last ${recent.length} trades`,
    value: winRate,
    threshold: WARN_THRESHOLD,
  };
}

async function checkProfitFactor(): Promise<CheckResult> {
  const WINDOW = 30;
  const WARN_THRESHOLD = 1.0;
  const CRITICAL_THRESHOLD = 0.7;

  const recent = await db
    .select({ pnl: tradesTable.pnl })
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .orderBy(desc(tradesTable.closedAt))
    .limit(WINDOW);

  if (recent.length < 10) {
    return {
      name: "Profit Factor",
      status: "ok",
      message: `Insufficient trades (${recent.length} closed)`,
      value: null,
      threshold: WARN_THRESHOLD,
    };
  }

  const gross = recent.reduce(
    (acc, r) => {
      const p = parseFloat(r.pnl ?? "0");
      if (p > 0) acc.profit += p;
      else acc.loss += Math.abs(p);
      return acc;
    },
    { profit: 0, loss: 0 },
  );
  const pf = gross.loss === 0 ? 999 : gross.profit / gross.loss;

  if (pf <= CRITICAL_THRESHOLD) {
    await emitAlert(
      "profit_factor_degradation",
      "critical",
      `Profit factor critically low: ${pf.toFixed(2)} over last ${recent.length} trades`,
      { metric: "profit_factor", value: pf, threshold: CRITICAL_THRESHOLD },
    );
    await pauseBot("profit_factor_degradation");
    return {
      name: "Profit Factor",
      status: "critical",
      message: `PF ${pf.toFixed(2)} over last ${recent.length} trades (critical <${CRITICAL_THRESHOLD})`,
      value: pf,
      threshold: CRITICAL_THRESHOLD,
    };
  }
  if (pf <= WARN_THRESHOLD) {
    await emitAlert(
      "profit_factor_degradation",
      "warning",
      `Profit factor below 1.0: ${pf.toFixed(2)} over last ${recent.length} trades`,
      { metric: "profit_factor", value: pf, threshold: WARN_THRESHOLD },
    );
    return {
      name: "Profit Factor",
      status: "warning",
      message: `PF ${pf.toFixed(2)} — strategy losing money net`,
      value: pf,
      threshold: WARN_THRESHOLD,
    };
  }
  return {
    name: "Profit Factor",
    status: "ok",
    message: `PF ${pf.toFixed(2)} over last ${recent.length} trades`,
    value: pf,
    threshold: WARN_THRESHOLD,
  };
}

async function checkDrawdown(balance: number): Promise<CheckResult> {
  const WARN_PCT = 8;
  const CRITICAL_PCT = 15;

  const rows = await db
    .select({ pnl: tradesTable.pnl, closedAt: tradesTable.closedAt })
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .orderBy(tradesTable.closedAt);

  if (rows.length === 0) {
    return { name: "Drawdown", status: "ok", message: "No closed trades", value: 0, threshold: WARN_PCT };
  }

  let peak = balance;
  let running = balance;
  let maxDd = 0;
  for (const r of rows) {
    running += parseFloat(r.pnl ?? "0");
    if (running > peak) peak = running;
    const dd = peak > 0 ? ((peak - running) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }

  if (maxDd >= CRITICAL_PCT) {
    await emitAlert(
      "drawdown_warning",
      "critical",
      `Peak-to-trough drawdown reached ${maxDd.toFixed(1)}%`,
      { metric: "max_drawdown_pct", value: maxDd, threshold: CRITICAL_PCT },
    );
    return {
      name: "Drawdown",
      status: "critical",
      message: `${maxDd.toFixed(1)}% max drawdown (critical ≥${CRITICAL_PCT}%)`,
      value: maxDd,
      threshold: CRITICAL_PCT,
    };
  }
  if (maxDd >= WARN_PCT) {
    await emitAlert(
      "drawdown_warning",
      "warning",
      `Drawdown elevated: ${maxDd.toFixed(1)}%`,
      { metric: "max_drawdown_pct", value: maxDd, threshold: WARN_PCT },
    );
    return {
      name: "Drawdown",
      status: "warning",
      message: `${maxDd.toFixed(1)}% max drawdown (warn ≥${WARN_PCT}%)`,
      value: maxDd,
      threshold: WARN_PCT,
    };
  }
  return {
    name: "Drawdown",
    status: "ok",
    message: `${maxDd.toFixed(1)}% max drawdown`,
    value: maxDd,
    threshold: WARN_PCT,
  };
}

async function checkRegimes(): Promise<CheckResult> {
  const pairs = ["EURUSD", "GBPUSD", "USDJPY"];
  const unfavorable: string[] = [];

  for (const pair of pairs) {
    const row = await db
      .select()
      .from(marketRegimeTable)
      .where(eq(marketRegimeTable.pair, pair))
      .limit(1);

    if (row.length === 0) continue;
    const r = row[0];
    const confidence = parseFloat(r.regimeConfidence ?? "0");

    if (
      (r.regime === "volatile" && confidence > 60) ||
      (r.regime === "low_volatility" && confidence > 70)
    ) {
      unfavorable.push(`${pair}(${r.regime}@${confidence}%)`);
    }
  }

  if (unfavorable.length >= 2) {
    await emitAlert(
      "regime_change",
      "warning",
      `Unfavorable regime on ${unfavorable.join(", ")} — consider pausing`,
      { metric: "unfavorable_pair_count", value: unfavorable.length, threshold: 2 },
    );
    return {
      name: "Market Regime",
      status: "warning",
      message: `${unfavorable.length}/3 pairs in unfavorable regime: ${unfavorable.join(", ")}`,
      value: unfavorable.length,
      threshold: 2,
    };
  }
  if (unfavorable.length === 1) {
    return {
      name: "Market Regime",
      status: "warning",
      message: `1 pair in unfavorable regime: ${unfavorable[0]}`,
      value: 1,
      threshold: 2,
    };
  }
  return {
    name: "Market Regime",
    status: "ok",
    message: "All pairs in tradeable regime",
    value: 0,
    threshold: 2,
  };
}

function checkPriceFeed(): CheckResult {
  const pairs = ["EURUSD", "GBPUSD", "USDJPY"] as const;
  const stale: string[] = [];
  const fallback: string[] = [];
  const now = Date.now();

  for (const pair of pairs) {
    const entry = getCurrentPrice(pair);
    if (!entry) {
      stale.push(pair);
    } else if (entry.source === "fallback") {
      fallback.push(pair);
    } else if (now - entry.updatedAt.getTime() > 5 * 60 * 1000) {
      stale.push(pair);
    }
  }

  if (stale.length >= 2) {
    return {
      name: "Price Feed",
      status: "critical",
      message: `Price feed stale/missing for ${stale.join(", ")}`,
      value: stale.length,
      threshold: 1,
    };
  }
  if (stale.length === 1 || fallback.length > 0) {
    return {
      name: "Price Feed",
      status: "warning",
      message: `Price feed degraded — stale: [${stale.join(",")}], fallback: [${fallback.join(",")}]`,
      value: stale.length + fallback.length,
      threshold: 1,
    };
  }
  const lastUpdated = getPriceLastUpdated();
  const ageMin = lastUpdated ? Math.round((now - lastUpdated.getTime()) / 60000) : null;
  return {
    name: "Price Feed",
    status: "ok",
    message: `Live prices — last updated ${ageMin ?? "?"}m ago`,
    value: ageMin,
    threshold: 5,
  };
}

function checkAnalysisFeed(): CheckResult {
  const pairs = ["EURUSD", "GBPUSD", "USDJPY"] as const;
  const tfs = ["4h", "1d"] as const;
  const stale: string[] = [];
  const now = Date.now();

  for (const pair of pairs) {
    const r = getCachedAnalysis(pair, "4h");
    if (!r) stale.push(pair);
  }

  if (stale.length >= 2) {
    return {
      name: "Analysis Feed",
      status: "warning",
      message: `Market analysis stale for ${stale.join(", ")} — scheduler may have failed`,
      value: stale.length,
      threshold: 1,
    };
  }
  return {
    name: "Analysis Feed",
    status: "ok",
    message: "Market analysis is current",
    value: 0,
    threshold: 1,
  };
}

async function checkBotState(): Promise<CheckResult> {
  const rows = await db.select().from(botStateTable).limit(1);
  if (rows.length === 0) {
    return { name: "Bot State", status: "ok", message: "Not initialized", value: null, threshold: null };
  }
  const s = rows[0];
  if (s.emergencyStop) {
    return {
      name: "Bot State",
      status: "critical",
      message: "EMERGENCY STOP active — manual resume required",
      value: null,
      threshold: null,
    };
  }
  if (s.haltedDueToRisk) {
    return {
      name: "Bot State",
      status: "warning",
      message: "Bot halted due to risk limit — awaiting resume",
      value: null,
      threshold: null,
    };
  }
  if (!s.running) {
    return { name: "Bot State", status: "ok", message: "Bot stopped (idle)", value: null, threshold: null };
  }
  return { name: "Bot State", status: "ok", message: "Bot running normally", value: null, threshold: null };
}

export async function runAllChecks(): Promise<SupervisorStatus> {
  const [stateRows, riskRows, configRows] = await Promise.all([
    db.select().from(botStateTable).limit(1),
    db.select().from(riskSettingsTable).limit(1),
    db.select().from(botConfigTable).limit(1),
  ]);

  const state = stateRows[0];
  const risk = riskRows[0];

  const startingBalance = 10_000;
  const balance = configRows[0]
    ? startingBalance
    : startingBalance;

  const maxDailyLoss = risk ? parseFloat(risk.maxDailyLoss) : 3;
  const maxWeeklyLoss = risk ? parseFloat(risk.maxWeeklyLoss) : 6;

  const [
    dailyResult,
    weeklyResult,
    winRateResult,
    profitFactorResult,
    drawdownResult,
    regimeResult,
    botStateResult,
  ] = await Promise.all([
    checkDailyLoss(maxDailyLoss, balance),
    checkWeeklyLoss(maxWeeklyLoss, balance),
    checkWinRateDegradation(),
    checkProfitFactor(),
    checkDrawdown(balance),
    checkRegimes(),
    checkBotState(),
  ]);

  const priceFeedResult = checkPriceFeed();
  const analysisResult = checkAnalysisFeed();

  const checks = [
    botStateResult,
    dailyResult,
    weeklyResult,
    drawdownResult,
    winRateResult,
    profitFactorResult,
    regimeResult,
    priceFeedResult,
    analysisResult,
  ];

  const hasCritical = checks.some(c => c.status === "critical");
  const hasWarning = checks.some(c => c.status === "warning");
  const overallHealth = hasCritical ? "critical" : hasWarning ? "degraded" : "healthy";

  const [alertCountRows] = await db
    .select({ n: count() })
    .from(supervisorAlertsTable)
    .where(eq(supervisorAlertsTable.acknowledged, false));

  const activeAlertCount = Number(alertCountRows?.n ?? 0);
  const botPaused = state ? (state.haltedDueToRisk || state.emergencyStop || !state.running) : true;

  lastCheckedAt = new Date();
  lastCheckResults = checks;

  logger.info(
    { overallHealth, activeAlertCount, checks: checks.map(c => ({ name: c.name, status: c.status })) },
    "Supervisor health check complete",
  );

  return {
    overallHealth,
    checks,
    activeAlertCount,
    botPaused,
    lastCheckedAt: lastCheckedAt.toISOString(),
  };
}

export function getLastCheckResults(): CheckResult[] {
  return lastCheckResults;
}

export function getLastCheckedAt(): Date | null {
  return lastCheckedAt;
}

export async function getSupervisorStatus(): Promise<SupervisorStatus> {
  const [alertCountRows] = await db
    .select({ n: count() })
    .from(supervisorAlertsTable)
    .where(eq(supervisorAlertsTable.acknowledged, false));

  const stateRows = await db.select().from(botStateTable).limit(1);
  const state = stateRows[0];
  const botPaused = state
    ? state.haltedDueToRisk || state.emergencyStop || !state.running
    : true;

  return {
    overallHealth:
      lastCheckResults.some(c => c.status === "critical")
        ? "critical"
        : lastCheckResults.some(c => c.status === "warning")
          ? "degraded"
          : "healthy",
    checks: lastCheckResults,
    activeAlertCount: Number(alertCountRows?.n ?? 0),
    botPaused,
    lastCheckedAt: lastCheckedAt ? lastCheckedAt.toISOString() : null,
  };
}

export function startSupervisor(intervalSeconds = 30): void {
  if (supervisorInterval) return;

  runAllChecks().catch(err => logger.error({ err }, "Initial supervisor check failed"));

  supervisorInterval = setInterval(() => {
    runAllChecks().catch(err => logger.error({ err }, "Supervisor check failed"));
  }, intervalSeconds * 1000);

  logger.info({ intervalSeconds }, "Autonomous supervisor started");
}

export function stopSupervisor(): void {
  if (supervisorInterval) {
    clearInterval(supervisorInterval);
    supervisorInterval = null;
    logger.info("Supervisor stopped");
  }
}
