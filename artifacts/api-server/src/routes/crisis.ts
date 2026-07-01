// ─── Crisis Intelligence & Survival Engine — Routes ───────────────────────────

import { Router }  from "express";
import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { db,
  crisisEventsTable,
  crisisTimelineTable,
  crisisSystemHealthTable,
  crisisRecoveryLogTable,
} from "@workspace/db";
import {
  runCrisisEngine,
  defaultMarketCtx,
  defaultBrokerCtx,
  defaultInfraCtx,
  defaultDataCtx,
  defaultStrategyCtx,
  CRISIS_ENGINE_VERSION,
  RunCrisisEngineInput,
  SurvivalMode,
} from "@workspace/market-analysis";
import {
  marketRegimeTable,
  botStateTable,
} from "@workspace/db/schema";

const router = Router();

function ok(res: any, data: any) {
  res.json({ success: true, isAdvisoryOnly: true, data });
}
function err(res: any, status: number, message: string) {
  res.status(status).json({ success: false, error: message });
}

// ─── Build context from DB ────────────────────────────────────────────────────

async function buildLiveContext(pair = "EURUSD"): Promise<RunCrisisEngineInput> {
  const [regimeRows, botRows] = await Promise.all([
    db.select().from(marketRegimeTable)
      .where(eq(marketRegimeTable.pair, pair))
      .orderBy(desc(marketRegimeTable.updatedAt))
      .limit(1),
    db.select().from(botStateTable).limit(1),
  ]);

  const regime = regimeRows[0];
  const bot    = botRows[0];

  const marketCtx = {
    ...defaultMarketCtx(),
    pair,
    volatilityScore:  Number(regime?.confidence ?? 30),
    regime:           (regime?.regime ?? "trending") as string,
    liquidityScore:   regime ? Math.max(20, 100 - Number(regime.confidence ?? 30)) : 70,
    spreadMultiplier: 1.0,
    hasNewsFeed:      true,
  };

  const brokerCtx = {
    ...defaultBrokerCtx(),
    isConnected: bot?.isRunning ?? false,
  };

  // Get last timeline entry for current mode
  const lastTimeline = await db.select().from(crisisTimelineTable)
    .orderBy(desc(crisisTimelineTable.recordedAt))
    .limit(1);
  const currentMode = (lastTimeline[0]?.survivalMode ?? null) as SurvivalMode | null;

  return {
    market:         marketCtx,
    broker:         brokerCtx,
    infrastructure: defaultInfraCtx(),
    data:           defaultDataCtx(),
    strategy:       defaultStrategyCtx(),
    currentMode,
  };
}

// ─── GET /crisis/status ───────────────────────────────────────────────────────

router.get("/crisis/status", async (req, res) => {
  try {
    const pair = String(req.query.pair ?? "EURUSD");
    const input  = await buildLiveContext(pair);
    const report = runCrisisEngine(input);

    // Persist timeline entry
    await db.insert(crisisTimelineTable).values({
      id:             randomUUID(),
      severity:       report.classification.overallSeverity,
      overallScore:   report.classification.overallScore,
      survivalMode:   report.survivalMode.currentMode,
      previousMode:   report.survivalMode.previousMode,
      modeChangeType: report.survivalMode.modeChangeType,
      modeChanged:    report.survivalMode.modeChangedAt !== null,
      dominantType:   report.classification.dominantCrisisType ?? null,
      marketScore:    report.classification.marketSignal.crisisScore,
      brokerScore:    report.classification.brokerSignal.crisisScore,
      infraScore:     report.classification.infrastructureSignal.crisisScore,
      dataScore:      report.classification.dataIntegritySignal.crisisScore,
      strategyScore:  report.classification.strategySignal.crisisScore,
      healthScore:    report.systemHealth.healthScore,
      safeToTrade:    report.summary.safeToTrade,
      activeAlerts:   report.summary.activeAlerts,
      narrative:      report.explainability.narrative,
      engineVersion:  CRISIS_ENGINE_VERSION,
    });

    // Persist health snapshot
    await db.insert(crisisSystemHealthTable).values({
      id:                   randomUUID(),
      overallHealth:        report.systemHealth.overallHealth,
      healthScore:          report.systemHealth.healthScore,
      marketHealth:         report.systemHealth.marketHealth,
      brokerHealth:         report.systemHealth.brokerHealth,
      infrastructureHealth: report.systemHealth.infrastructureHealth,
      dataIntegrityHealth:  report.systemHealth.dataIntegrityHealth,
      strategyHealth:       report.systemHealth.strategyHealth,
      survivalMode:         report.survivalMode.currentMode,
      severity:             report.classification.overallSeverity,
      volatilityScore:      report.classification.marketSignal.crisisScore,
      liquidityScore:       report.classification.marketSignal.liquidityScore,
      brokerConnected:      !report.classification.brokerSignal.connectionLoss,
      dbResponseMs:         input.infrastructure.dbResponseMs,
      engineVersion:        CRISIS_ENGINE_VERSION,
    });

    // Persist emergency event if triggered
    if (report.emergencyEvent) {
      await db.insert(crisisEventsTable).values({
        id:                    report.emergencyEvent.eventId,
        crisisType:            report.emergencyEvent.crisisType,
        severity:              report.emergencyEvent.severity,
        overallScore:          report.classification.overallScore,
        survivalModeTriggered: report.emergencyEvent.survivalModeTriggered,
        trigger:               report.emergencyEvent.trigger,
        evidence:              report.emergencyEvent.evidence,
        marketScore:           report.classification.marketSignal.crisisScore,
        brokerScore:           report.classification.brokerSignal.crisisScore,
        infrastructureScore:   report.classification.infrastructureSignal.crisisScore,
        dataIntegrityScore:    report.classification.dataIntegritySignal.crisisScore,
        strategyScore:         report.classification.strategySignal.crisisScore,
        recommendedAction:     report.emergencyEvent.recommendedAction,
        recoveryConditions:    report.emergencyEvent.recoveryConditions,
        historicalComparison:  report.emergencyEvent.historicalComparison,
        isAdvisoryOnly:        true,
        fullSnapshot:          report as any,
      }).onConflictDoNothing();
    }

    ok(res, { report, engineVersion: CRISIS_ENGINE_VERSION });
  } catch (e: any) {
    err(res, 500, e.message);
  }
});

// ─── GET /crisis/history ──────────────────────────────────────────────────────

router.get("/crisis/history", async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 50), 200);
    const rows   = await db.select().from(crisisTimelineTable)
      .orderBy(desc(crisisTimelineTable.recordedAt))
      .limit(limit);
    ok(res, { history: rows, total: rows.length });
  } catch (e: any) {
    err(res, 500, e.message);
  }
});

// ─── GET /crisis/events ───────────────────────────────────────────────────────

router.get("/crisis/events", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const events = await db.select().from(crisisEventsTable)
      .orderBy(desc(crisisEventsTable.occurredAt))
      .limit(limit);
    ok(res, { events, total: events.length });
  } catch (e: any) {
    err(res, 500, e.message);
  }
});

// ─── GET /crisis/recovery ─────────────────────────────────────────────────────

router.get("/crisis/recovery", async (req, res) => {
  try {
    const pair   = String(req.query.pair ?? "EURUSD");
    const input  = await buildLiveContext(pair);
    const report = runCrisisEngine(input);

    // Persist recovery log
    await db.insert(crisisRecoveryLogTable).values({
      id:                       randomUUID(),
      currentStage:             report.recovery.currentStage,
      targetStage:              report.recovery.targetStage,
      readyForNextStage:        report.recovery.readyForNextStage,
      stableInfrastructure:     report.recovery.stableInfrastructure,
      stableBroker:             report.recovery.stableBroker,
      stableMarket:             report.recovery.stableMarket,
      sufficientConfirmation:   report.recovery.sufficientConfirmation,
      nextStageRequirements:    report.recovery.nextStageRequirements,
      estimatedRecoveryMinutes: report.recovery.estimatedRecoveryMinutes,
      stagesCompleted:          report.recovery.stagesCompleted,
      stagesRemaining:          report.recovery.stagesRemaining,
      engineVersion:            CRISIS_ENGINE_VERSION,
    });

    const recentLog = await db.select().from(crisisRecoveryLogTable)
      .orderBy(desc(crisisRecoveryLogTable.recordedAt))
      .limit(30);

    ok(res, {
      recovery:       report.recovery,
      survivalMode:   report.survivalMode.currentMode,
      systemHealth:   report.systemHealth,
      recentLog,
      engineVersion:  CRISIS_ENGINE_VERSION,
    });
  } catch (e: any) {
    err(res, 500, e.message);
  }
});

// ─── GET /crisis/system-health ────────────────────────────────────────────────

router.get("/crisis/system-health", async (req, res) => {
  try {
    const rows = await db.select().from(crisisSystemHealthTable)
      .orderBy(desc(crisisSystemHealthTable.checkedAt))
      .limit(100);

    const latest = rows[0] ?? null;
    ok(res, { latest, history: rows, total: rows.length });
  } catch (e: any) {
    err(res, 500, e.message);
  }
});

// ─── GET /crisis/report ───────────────────────────────────────────────────────

router.get("/crisis/report", async (req, res) => {
  try {
    const pair   = String(req.query.pair ?? "EURUSD");
    const input  = await buildLiveContext(pair);
    const report = runCrisisEngine(input);

    const [recentEvents, recentTimeline, recentHealth] = await Promise.all([
      db.select().from(crisisEventsTable).orderBy(desc(crisisEventsTable.occurredAt)).limit(20),
      db.select().from(crisisTimelineTable).orderBy(desc(crisisTimelineTable.recordedAt)).limit(50),
      db.select().from(crisisSystemHealthTable).orderBy(desc(crisisSystemHealthTable.checkedAt)).limit(30),
    ]);

    ok(res, {
      report,
      recentEvents,
      recentTimeline,
      recentHealth,
      engineVersion: CRISIS_ENGINE_VERSION,
    });
  } catch (e: any) {
    err(res, 500, e.message);
  }
});

export default router;
