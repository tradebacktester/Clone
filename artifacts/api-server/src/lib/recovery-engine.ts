import { db, botStateTable, tradesTable, recoveryLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { getCurrentPrice } from "./price-feed.js";
import { startPaperMonitor } from "./paper-engine.js";
import { startAnalysisScheduler } from "./analyzer.js";
import { startStrategyHealthMonitor } from "./strategy-health-monitor.js";
import { startReconciliationScheduler } from "./broker-safety.js";
import type { Pair } from "@workspace/market-analysis";

export interface RecoveryResult {
  positionsFound: number;
  positionsRestored: number;
  stateRestored: boolean;
  monitoringResumed: boolean;
  brokerReconciled: boolean;
  warnings: string[];
  errors: string[];
  durationMs: number;
}

async function logRecoveryEvent(event: string, success: boolean, details: unknown, error?: string): Promise<void> {
  try {
    await db.insert(recoveryLogTable).values({
      event,
      success,
      details: details as Record<string, unknown>,
      error: error ?? null,
    });
  } catch (err) {
    logger.warn({ err, event }, "Failed to log recovery event");
  }
}

async function restoreOpenPositions(): Promise<{ restored: number; warnings: string[] }> {
  const warnings: string[] = [];
  let restored = 0;

  const openTrades = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

  if (openTrades.length === 0) {
    return { restored: 0, warnings: [] };
  }

  logger.info({ count: openTrades.length }, "Recovery: found open positions in DB");

  for (const trade of openTrades) {
    const pair = trade.pair as Pair;
    const price = getCurrentPrice(pair);

    if (!price) {
      warnings.push(`Trade #${trade.id} (${trade.pair}): no live price available — using last recorded price`);
      continue;
    }

    await db
      .update(tradesTable)
      .set({ currentPrice: String(price.mid) })
      .where(eq(tradesTable.id, trade.id));

    restored++;
    logger.info({ tradeId: trade.id, pair: trade.pair, currentPrice: price.mid }, "Recovery: position price refreshed");
  }

  return { restored, warnings };
}

async function restoreBotState(): Promise<{ restored: boolean; wasRunning: boolean; mode: string }> {
  const [state] = await db.select().from(botStateTable).limit(1);

  if (!state) {
    await db.insert(botStateTable).values({
      running: false,
      mode: "paper",
      brokerMode: "paper",
      activePairs: [],
      liveEnabled: false,
      emergencyStop: false,
      haltedDueToRisk: false,
    });
    return { restored: true, wasRunning: false, mode: "paper" };
  }

  const wasRunning = state.running;

  if (state.emergencyStop) {
    logger.warn("Recovery: bot was in emergency stop state — leaving halted for manual review");
    return { restored: true, wasRunning: false, mode: state.mode };
  }

  if (state.haltedDueToRisk) {
    logger.warn("Recovery: bot was halted due to risk — leaving halted for manual review");
    return { restored: true, wasRunning: false, mode: state.mode };
  }

  return { restored: true, wasRunning, mode: state.mode };
}

async function resumeMonitoring(mode: string, wasRunning: boolean): Promise<boolean> {
  try {
    startAnalysisScheduler(10);
    startStrategyHealthMonitor(30);
    await startReconciliationScheduler();

    if (wasRunning && mode === "paper") {
      startPaperMonitor(30);
      logger.info("Recovery: paper trade monitor resumed");
    }

    return true;
  } catch (err) {
    logger.error({ err }, "Recovery: failed to resume monitoring");
    return false;
  }
}

async function performBrokerReconciliation(mode: string): Promise<{ reconciled: boolean; message: string }> {
  if (mode === "paper") {
    return { reconciled: true, message: "Paper mode — no broker reconciliation needed" };
  }

  try {
    const { reconcilePositions } = await import("./broker-safety.js");
    const result = await reconcilePositions();
    if (result.discrepancies.length > 0) {
      return {
        reconciled: false,
        message: `${result.discrepancies.length} position discrepancy(ies) found — manual review required`,
      };
    }
    return { reconciled: true, message: "Broker positions reconciled successfully" };
  } catch (err) {
    return { reconciled: false, message: `Reconciliation failed: ${String(err)}` };
  }
}

export async function runStartupRecovery(): Promise<RecoveryResult> {
  const t0 = Date.now();
  const warnings: string[] = [];
  const errors: string[] = [];

  logger.info("Recovery engine: starting startup recovery sequence");

  await logRecoveryEvent("startup_recovery_begin", true, { timestamp: new Date().toISOString() });

  let positionsFound = 0;
  let positionsRestored = 0;
  let stateRestored = false;
  let monitoringResumed = false;
  let brokerReconciled = false;

  try {
    const posResult = await restoreOpenPositions();
    positionsFound = posResult.restored + posResult.warnings.length;
    positionsRestored = posResult.restored;
    warnings.push(...posResult.warnings);

    await logRecoveryEvent("positions_restored", true, {
      found: positionsFound,
      restored: positionsRestored,
      warnings: posResult.warnings,
    });
  } catch (err) {
    const msg = `Failed to restore positions: ${String(err)}`;
    errors.push(msg);
    logger.error({ err }, "Recovery: position restoration failed");
    await logRecoveryEvent("positions_restored", false, {}, msg);
  }

  let wasRunning = false;
  let mode = "paper";
  try {
    const stateResult = await restoreBotState();
    stateRestored = stateResult.restored;
    wasRunning = stateResult.wasRunning;
    mode = stateResult.mode;

    await logRecoveryEvent("state_restored", true, { wasRunning, mode });
  } catch (err) {
    const msg = `Failed to restore state: ${String(err)}`;
    errors.push(msg);
    logger.error({ err }, "Recovery: state restoration failed");
    await logRecoveryEvent("state_restored", false, {}, msg);
  }

  try {
    const reconcileResult = await performBrokerReconciliation(mode);
    brokerReconciled = reconcileResult.reconciled;
    if (!reconcileResult.reconciled) {
      warnings.push(reconcileResult.message);
    }
    await logRecoveryEvent("broker_reconciled", brokerReconciled, { message: reconcileResult.message });
  } catch (err) {
    const msg = `Broker reconciliation error: ${String(err)}`;
    warnings.push(msg);
    logger.warn({ err }, "Recovery: broker reconciliation failed");
  }

  try {
    monitoringResumed = await resumeMonitoring(mode, wasRunning);
    await logRecoveryEvent("monitoring_resumed", monitoringResumed, { mode, wasRunning });
  } catch (err) {
    const msg = `Failed to resume monitoring: ${String(err)}`;
    errors.push(msg);
    await logRecoveryEvent("monitoring_resumed", false, {}, msg);
  }

  const durationMs = Date.now() - t0;

  try {
    await db.update(botStateTable).set({
      lastRecoveryAt: new Date(),
      recoveryPositionsRestored: String(positionsRestored),
    });
  } catch {
    // non-fatal
  }

  await logRecoveryEvent("startup_recovery_complete", errors.length === 0, {
    positionsFound,
    positionsRestored,
    stateRestored,
    monitoringResumed,
    brokerReconciled,
    durationMs,
    warnings,
    errors,
  });

  logger.info(
    { positionsFound, positionsRestored, stateRestored, monitoringResumed, brokerReconciled, durationMs },
    "Recovery engine: startup recovery complete",
  );

  return {
    positionsFound,
    positionsRestored,
    stateRestored,
    monitoringResumed,
    brokerReconciled,
    warnings,
    errors,
    durationMs,
  };
}

export async function getRecoveryLog(limit = 50): Promise<typeof recoveryLogTable.$inferSelect[]> {
  const { desc } = await import("drizzle-orm");
  return db
    .select()
    .from(recoveryLogTable)
    .orderBy(desc(recoveryLogTable.createdAt))
    .limit(limit);
}
