import { Router } from "express";
import { db, brokerSafetyConfigTable } from "@workspace/db";
import { getDeploymentStatus, switchDeploymentMode, enableLiveMode, type DeploymentMode } from "../lib/deployment-manager.js";
import { checkConnectionHealth, getSafetyConfig, reconcilePositions, invalidateSafetyConfigCache } from "../lib/broker-safety.js";
import { runStrategyHealthCheck, getLatestHealthSnapshots } from "../lib/strategy-health-monitor.js";
import { getRecoveryLog } from "../lib/recovery-engine.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/deployment/status", async (_req, res) => {
  try {
    const status = await getDeploymentStatus();
    res.json(status);
  } catch (err) {
    logger.error({ err }, "deployment status error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/deployment/mode", async (req, res) => {
  const { mode } = req.body as { mode?: string };
  if (!mode || !["paper", "demo", "live"].includes(mode)) {
    res.status(400).json({ error: "Invalid mode. Must be 'paper', 'demo', or 'live'." });
    return;
  }
  const result = await switchDeploymentMode(mode as DeploymentMode);
  if (!result.success) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

router.put("/deployment/live-gate", async (req, res) => {
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }
  await enableLiveMode(enabled);
  res.json({ success: true, liveEnabled: enabled });
});

router.get("/deployment/safety-config", async (_req, res) => {
  const cfg = await getSafetyConfig();
  res.json({
    maxSpreadPips: parseFloat(cfg.maxSpreadPips),
    maxSlippagePips: parseFloat(cfg.maxSlippagePips),
    connectionTimeoutMs: cfg.connectionTimeoutMs,
    maxRetries: cfg.maxRetries,
    retryDelayMs: cfg.retryDelayMs,
    partialFillThresholdPct: parseFloat(cfg.partialFillThresholdPct),
    reconciliationIntervalSec: cfg.reconciliationIntervalSec,
    enableSpreadFilter: cfg.enableSpreadFilter,
    enableSlippageProtection: cfg.enableSlippageProtection,
    enableConnectionMonitor: cfg.enableConnectionMonitor,
    enableAutoRetry: cfg.enableAutoRetry,
    enablePartialFillHandling: cfg.enablePartialFillHandling,
    enableReconciliation: cfg.enableReconciliation,
    updatedAt: cfg.updatedAt.toISOString(),
  });
});

router.put("/deployment/safety-config", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof brokerSafetyConfigTable.$inferInsert> = {};

  if (body.maxSpreadPips !== undefined) updates.maxSpreadPips = String(body.maxSpreadPips);
  if (body.maxSlippagePips !== undefined) updates.maxSlippagePips = String(body.maxSlippagePips);
  if (body.connectionTimeoutMs !== undefined) updates.connectionTimeoutMs = Number(body.connectionTimeoutMs);
  if (body.maxRetries !== undefined) updates.maxRetries = Number(body.maxRetries);
  if (body.retryDelayMs !== undefined) updates.retryDelayMs = Number(body.retryDelayMs);
  if (body.partialFillThresholdPct !== undefined) updates.partialFillThresholdPct = String(body.partialFillThresholdPct);
  if (body.reconciliationIntervalSec !== undefined) updates.reconciliationIntervalSec = Number(body.reconciliationIntervalSec);
  if (body.enableSpreadFilter !== undefined) updates.enableSpreadFilter = Boolean(body.enableSpreadFilter);
  if (body.enableSlippageProtection !== undefined) updates.enableSlippageProtection = Boolean(body.enableSlippageProtection);
  if (body.enableConnectionMonitor !== undefined) updates.enableConnectionMonitor = Boolean(body.enableConnectionMonitor);
  if (body.enableAutoRetry !== undefined) updates.enableAutoRetry = Boolean(body.enableAutoRetry);
  if (body.enablePartialFillHandling !== undefined) updates.enablePartialFillHandling = Boolean(body.enablePartialFillHandling);
  if (body.enableReconciliation !== undefined) updates.enableReconciliation = Boolean(body.enableReconciliation);

  const [existing] = await db.select().from(brokerSafetyConfigTable).limit(1);
  if (existing) {
    await db.update(brokerSafetyConfigTable).set(updates);
  } else {
    await db.insert(brokerSafetyConfigTable).values(updates as typeof brokerSafetyConfigTable.$inferInsert);
  }

  invalidateSafetyConfigCache();
  const cfg = await getSafetyConfig();
  res.json({
    maxSpreadPips: parseFloat(cfg.maxSpreadPips),
    maxSlippagePips: parseFloat(cfg.maxSlippagePips),
    connectionTimeoutMs: cfg.connectionTimeoutMs,
    maxRetries: cfg.maxRetries,
    retryDelayMs: cfg.retryDelayMs,
    partialFillThresholdPct: parseFloat(cfg.partialFillThresholdPct),
    reconciliationIntervalSec: cfg.reconciliationIntervalSec,
    enableSpreadFilter: cfg.enableSpreadFilter,
    enableSlippageProtection: cfg.enableSlippageProtection,
    enableConnectionMonitor: cfg.enableConnectionMonitor,
    enableAutoRetry: cfg.enableAutoRetry,
    enablePartialFillHandling: cfg.enablePartialFillHandling,
    enableReconciliation: cfg.enableReconciliation,
    updatedAt: cfg.updatedAt.toISOString(),
  });
});

router.get("/deployment/connection-health", async (_req, res) => {
  const health = await checkConnectionHealth();
  res.json(health);
});

router.post("/deployment/reconcile", async (_req, res) => {
  const result = await reconcilePositions();
  res.json(result);
});

router.get("/deployment/strategy-health", async (_req, res) => {
  const report = await runStrategyHealthCheck();
  res.json(report);
});

router.get("/deployment/strategy-health/snapshots", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "48")), 200);
  const snapshots = await getLatestHealthSnapshots(limit);
  res.json(snapshots.map(s => ({
    id: s.id,
    snapshotAt: s.snapshotAt.toISOString(),
    winRateRolling20: s.winRateRolling20 != null ? parseFloat(s.winRateRolling20) : null,
    profitFactorRolling30: s.profitFactorRolling30 != null ? parseFloat(s.profitFactorRolling30) : null,
    maxDrawdownPct: s.maxDrawdownPct != null ? parseFloat(s.maxDrawdownPct) : null,
    signalFrequencyPerDay: s.signalFrequencyPerDay != null ? parseFloat(s.signalFrequencyPerDay) : null,
    dataQualityScore: s.dataQualityScore != null ? parseFloat(s.dataQualityScore) : null,
    regimeStabilityScore: s.regimeStabilityScore != null ? parseFloat(s.regimeStabilityScore) : null,
    overallHealthScore: s.overallHealthScore != null ? parseFloat(s.overallHealthScore) : null,
    totalTrades: s.totalTrades,
    openTrades: s.openTrades,
    alertCount: s.alertCount,
    mode: s.mode,
  })));
});

router.get("/deployment/recovery-log", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
  const entries = await getRecoveryLog(limit);
  res.json(entries.map(e => ({
    id: e.id,
    event: e.event,
    success: e.success,
    details: e.details,
    error: e.error,
    createdAt: e.createdAt.toISOString(),
  })));
});

export default router;
