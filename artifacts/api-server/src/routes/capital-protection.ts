// ─── Capital Protection & Survival Engine — API Routes ────────────────────────
// Advisory only. MAY suggest risk management changes. NEVER modifies strategy.
// All routes define paths WITHOUT /api prefix (app mounts at /api).

import { Router } from "express";
import { db } from "@workspace/db";
import {
  cpReportsTable,
  cpActionsTable,
  cpConfigTable,
  cpEventsTable,
  tradesTable,
  botStateTable,
  brokerAccountsTable,
  marketRegimeTable,
} from "@workspace/db";
import { desc, eq, gte, sql } from "drizzle-orm";
import {
  runCapitalProtection,
  validateProtectionConfig,
  DEFAULT_PROTECTION_CONFIG,
  defaultBrokerInput,
  defaultSystemInput,
  gatherSystemMetrics,
} from "@workspace/market-analysis";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(res: any, data: any) {
  res.json({ success: true, isAdvisoryOnly: true, data });
}

function err(res: any, status: number, message: string) {
  res.status(status).json({ success: false, error: message });
}

async function loadProtectionInput(pair = "EURUSD", session = "london") {
  // Account & trade data
  const botRows   = await db.select().from(botStateTable).limit(1);
  const bot       = botRows[0];
  const balance   = Number(bot?.accountBalance ?? 10000);
  const equity    = Number(bot?.currentEquity ?? balance);
  const peakBal   = Math.max(balance, Number(bot?.peakBalance ?? balance));
  const peakEq    = Math.max(equity,  Number(bot?.peakEquity  ?? equity));

  // Recent trades (last 50)
  const tradeRows = await db.select().from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .orderBy(desc(tradesTable.closedAt))
    .limit(50);

  const recentTrades = tradeRows.map(t => ({
    pnl:      Number(t.profit ?? 0),
    closedAt: (t.closedAt ?? t.openedAt ?? new Date()).toISOString(),
    pair:     t.pair,
  }));

  // P&L aggregation
  const now     = Date.now();
  const day1    = now - 86_400_000;
  const week1   = now - 7 * 86_400_000;
  const month1  = now - 30 * 86_400_000;
  const dailyPnl   = recentTrades.filter(t => new Date(t.closedAt).getTime() > day1).reduce((s, t) => s + t.pnl, 0);
  const weeklyPnl  = recentTrades.filter(t => new Date(t.closedAt).getTime() > week1).reduce((s, t) => s + t.pnl, 0);
  const monthlyPnl = recentTrades.filter(t => new Date(t.closedAt).getTime() > month1).reduce((s, t) => s + t.pnl, 0);

  // Open positions from open trades
  const openTradeRows = await db.select().from(tradesTable).where(eq(tradesTable.status, "open"));
  const openPositions = openTradeRows.map(t => ({
    pair:        t.pair,
    direction:   (t.direction ?? "buy") as "buy" | "sell",
    riskPercent: Number(t.riskPercent ?? 1),
    lots:        Number(t.lotSize ?? 0.01),
  }));

  // Drawdown history from recent reports
  const ddHistory = await db.select({
    dd: cpReportsTable.drawdownCurrentPct,
    ts: cpReportsTable.evaluatedAt,
  }).from(cpReportsTable).orderBy(desc(cpReportsTable.evaluatedAt)).limit(30);
  const drawdownHistory = ddHistory
    .filter(r => r.dd !== null)
    .map(r => ({ dd: Number(r.dd), ts: (r.ts ?? new Date()).toISOString() }));

  // Broker data
  const brokerRows = await db.select().from(brokerAccountsTable).limit(1);
  const broker     = brokerRows[0];
  const regimeRows = await db.select().from(marketRegimeTable).where(eq(marketRegimeTable.pair, pair)).limit(1);

  // System metrics
  const sysMetrics = await gatherSystemMetrics();

  // Previous protection level + hours
  const prevReports = await db.select({
    protectionLevel: cpReportsTable.protectionLevel,
    evaluatedAt:     cpReportsTable.evaluatedAt,
    hoursAtLevel:    cpReportsTable.hoursAtCurrentLevel,
  }).from(cpReportsTable).orderBy(desc(cpReportsTable.evaluatedAt)).limit(1);
  const prev = prevReports[0];
  const prevLevel = (prev?.protectionLevel ?? "normal") as any;
  const hoursAtCurrentLevel = prev
    ? Number(prev.hoursAtLevel ?? 0) + ((Date.now() - new Date(prev.evaluatedAt!).getTime()) / 3_600_000)
    : 0;

  // Load stored config
  const cfgRows = await db.select().from(cpConfigTable)
    .where(eq(cpConfigTable.isActive, true)).orderBy(desc(cpConfigTable.updatedAt)).limit(1);
  const storedConfig = cfgRows[0] ? (cfgRows[0].config as any) : {};

  return {
    // Account
    balance, equity, peakBalance: peakBal, peakEquity: peakEq,
    dailyPnl, weeklyPnl, monthlyPnl,
    freeMargin:  Number(bot?.freeMargin  ?? balance),
    marginLevel: Number(bot?.marginLevel ?? 0),
    usedMargin:  Number(bot?.usedMargin  ?? 0),
    leverage:    Number(bot?.leverage    ?? 1),

    // Trades
    recentTrades,
    openPositions,
    drawdownHistory,

    // Broker
    spread:            Number(broker?.currentSpread ?? defaultBrokerInput().spread),
    spreadBaseline:    1.0,
    slippage:          Number(broker?.averageSlippage ?? 0.2),
    executionTime:     Number(broker?.averageExecutionMs ?? 120),
    orderRejections:   Number(broker?.rejectionCount ?? 0),
    totalOrders:       Number(broker?.totalOrders ?? 10),
    connectionQuality: Number(broker?.connectionQuality ?? 99),
    pair,

    // System (gatherSystemMetrics uses dbHealth/apiHealth/apiErrorRate naming)
    cpuUsage:        sysMetrics.cpuUsage       ?? 25,
    memoryUsage:     sysMetrics.memoryUsage    ?? 40,
    dbAvailability:  (sysMetrics as any).dbAvailability  ?? (sysMetrics as any).dbHealth        ?? 95,
    apiAvailability: (sysMetrics as any).apiAvailability ?? (sysMetrics as any).apiHealth       ?? 98,
    dataFeedHealth:  sysMetrics.dataFeedHealth ?? 90,
    networkLatency:  sysMetrics.networkLatency ?? 30,
    errorRate:       (sysMetrics as any).errorRate       ?? (sysMetrics as any).apiErrorRate    ?? 0.1,

    // Recovery context
    currentProtectionLevel: prevLevel,
    hoursAtCurrentLevel,
    config: storedConfig,
  };
}

async function persistReport(result: any, prevLevel: string) {
  const mon = result.monitors;
  try {
    await db.insert(cpReportsTable).values({
      engineVersion:        result.engineVersion,
      evaluatedAt:          new Date(result.evaluatedAt),
      isAdvisoryOnly:       true,
      protectionLevel:      result.protectionLevel,
      protectionLevelLabel: result.protectionLevelLabel,
      protectionLevelScore: result.protectionLevelScore,
      activeActionCount:    result.activeActions.length,
      activeActions:        result.activeActions,

      accountSeverity:         mon.account.severity,
      accountHealthScore:      mon.account.healthScore.toFixed(2),
      accountDailyLossPct:     mon.account.dailyLossPct.toFixed(4),
      accountWeeklyLossPct:    mon.account.weeklyLossPct.toFixed(4),
      accountMonthlyLossPct:   mon.account.monthlyLossPct.toFixed(4),
      accountEquityDdPct:      mon.account.equityDrawdownPct.toFixed(4),

      consecutiveLossSeverity: mon.consecutiveLoss.severity,
      consecutiveLossCount:    mon.consecutiveLoss.consecutiveLosses,
      consecutiveLossHealth:   mon.consecutiveLoss.healthScore.toFixed(2),

      drawdownSeverity:    mon.drawdown.severity,
      drawdownCurrentPct:  mon.drawdown.currentDrawdownPct.toFixed(4),
      drawdownMaxPct:      mon.drawdown.maxDrawdownPct.toFixed(4),
      drawdownHealthScore: mon.drawdown.healthScore.toFixed(2),
      drawdownVelocity:    mon.drawdown.drawdownVelocity.toFixed(6),

      exposureSeverity:    mon.exposure.severity,
      exposureTotalRiskPct: mon.exposure.totalOpenRiskPct.toFixed(4),
      exposureHealthScore: mon.exposure.healthScore.toFixed(2),

      marginSeverity:    mon.margin.severity,
      marginLevel:       mon.margin.marginLevel.toFixed(2),
      marginHealthScore: mon.margin.healthScore.toFixed(2),
      marginCallRisk:    mon.margin.marginCallRisk.toFixed(2),

      brokerSeverity:    mon.broker.severity,
      brokerSpreadRatio: mon.broker.spreadRatio.toFixed(4),
      brokerHealthScore: mon.broker.healthScore.toFixed(2),

      systemSeverity:         mon.system.severity,
      systemHealthScore:      mon.system.healthScore.toFixed(2),
      systemCriticalFailures: mon.system.criticalFailures.length,

      recoveryInProgress:  result.recovery.isInRecovery,
      recoveryProgressPct: result.recovery.progressPercent,
      hoursAtCurrentLevel: result.recovery.hoursAtCurrentLevel.toFixed(2),

      balance:        result.config ? undefined : undefined,
      openPositions:  mon.exposure.totalOpenRiskPct > 0 ? 1 : 0,

      fullReport:     result,
      explainability: result.explainability,
    });

    // Persist actions
    if (result.activeActions.length > 0) {
      await db.insert(cpActionsTable).values(
        result.activeActions.map((a: any) => ({
          reportId:        result.protectionId,
          actionType:      a.actionType,
          label:           a.label,
          severity:        a.severity,
          trigger:         a.trigger,
          thresholdCrossed: a.thresholdCrossed,
          evidence:        a.evidence,
          appliedAt:       new Date(a.appliedAt),
          expectedBenefit: a.expectedBenefit,
          parameterChange: a.parameterChange ?? null,
          isReversible:    a.isReversible,
          recoveryRequirements: a.recoveryRequirements,
        })),
      );
    }

    // Log level change event
    if (result.protectionLevel !== prevLevel) {
      await db.insert(cpEventsTable).values({
        eventType:    result.protectionLevel > prevLevel ? "escalation" : "de-escalation",
        fromLevel:    prevLevel,
        toLevel:      result.protectionLevel,
        trigger:      result.explainability.primaryTrigger,
        evidence:     result.explainability.actionJustifications?.slice(0, 3) ?? [],
        activeActions: result.activeActions.map((a: any) => a.actionType),
        drawdownPct:  mon.drawdown.currentDrawdownPct.toFixed(4),
        consecutiveLosses: mon.consecutiveLoss.consecutiveLosses,
      });
    }
  } catch (_) {
    // Non-fatal — report generation continues
  }
}

// ─── GET /risk/protection ──────────────────────────────────────────────────────

router.get("/risk/protection", async (req, res) => {
  try {
    const pair    = (req.query.pair    as string) || "EURUSD";
    const session = (req.query.session as string) || "london";
    const input   = await loadProtectionInput(pair, session);
    const prevLevel = input.currentProtectionLevel ?? "normal";
    const result  = runCapitalProtection(input);
    await persistReport(result, prevLevel);
    ok(res, result);
  } catch (e: any) {
    err(res, 500, e?.message ?? "Capital protection evaluation failed");
  }
});

// ─── GET /risk/protection/status ──────────────────────────────────────────────

router.get("/risk/protection/status", async (req, res) => {
  try {
    const rows = await db.select({
      protectionLevel:      cpReportsTable.protectionLevel,
      protectionLevelLabel: cpReportsTable.protectionLevelLabel,
      protectionLevelScore: cpReportsTable.protectionLevelScore,
      activeActionCount:    cpReportsTable.activeActionCount,
      evaluatedAt:          cpReportsTable.evaluatedAt,
      recoveryInProgress:   cpReportsTable.recoveryInProgress,
      recoveryProgressPct:  cpReportsTable.recoveryProgressPct,
      drawdownCurrentPct:   cpReportsTable.drawdownCurrentPct,
      consecutiveLossCount: cpReportsTable.consecutiveLossCount,
      accountSeverity:      cpReportsTable.accountSeverity,
      brokerSeverity:       cpReportsTable.brokerSeverity,
      systemSeverity:       cpReportsTable.systemSeverity,
    }).from(cpReportsTable).orderBy(desc(cpReportsTable.evaluatedAt)).limit(1);

    if (rows.length === 0) {
      return ok(res, {
        protectionLevel: "normal", protectionLevelLabel: "Normal",
        protectionLevelScore: 0, activeActionCount: 0, evaluatedAt: null,
        message: "No protection evaluations run yet",
      });
    }
    ok(res, rows[0]);
  } catch (e: any) {
    err(res, 500, e?.message ?? "Failed to load protection status");
  }
});

// ─── GET /risk/protection/history ─────────────────────────────────────────────

router.get("/risk/protection/history", async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const events = await db.select().from(cpEventsTable)
      .orderBy(desc(cpEventsTable.occurredAt))
      .limit(limit);
    const reports = await db.select({
      reportId:             cpReportsTable.reportId,
      evaluatedAt:          cpReportsTable.evaluatedAt,
      protectionLevel:      cpReportsTable.protectionLevel,
      protectionLevelScore: cpReportsTable.protectionLevelScore,
      activeActionCount:    cpReportsTable.activeActionCount,
      drawdownCurrentPct:   cpReportsTable.drawdownCurrentPct,
      accountSeverity:      cpReportsTable.accountSeverity,
      systemSeverity:       cpReportsTable.systemSeverity,
    }).from(cpReportsTable).orderBy(desc(cpReportsTable.evaluatedAt)).limit(limit);
    ok(res, { events, reports });
  } catch (e: any) {
    err(res, 500, e?.message ?? "Failed to load protection history");
  }
});

// ─── GET /risk/protection/actions ─────────────────────────────────────────────

router.get("/risk/protection/actions", async (req, res) => {
  try {
    const limit  = Math.min(100, parseInt(req.query.limit as string) || 50);
    const since  = req.query.since
      ? new Date(req.query.since as string)
      : new Date(Date.now() - 7 * 86_400_000);

    const actions = await db.select().from(cpActionsTable)
      .where(gte(cpActionsTable.appliedAt, since))
      .orderBy(desc(cpActionsTable.appliedAt))
      .limit(limit);
    ok(res, { actions, total: actions.length });
  } catch (e: any) {
    err(res, 500, e?.message ?? "Failed to load protection actions");
  }
});

// ─── POST /risk/protection/config ─────────────────────────────────────────────

router.post("/risk/protection/config", async (req, res) => {
  try {
    const body = req.body ?? {};
    const validation = validateProtectionConfig(body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        errors:  validation.errors,
        warnings: validation.warnings,
      });
    }

    // Fetch previous config
    const prevRows = await db.select().from(cpConfigTable)
      .where(eq(cpConfigTable.isActive, true))
      .orderBy(desc(cpConfigTable.updatedAt)).limit(1);

    // Deactivate old config
    if (prevRows.length > 0) {
      await db.update(cpConfigTable)
        .set({ isActive: false })
        .where(eq(cpConfigTable.isActive, true));
    }

    await db.insert(cpConfigTable).values({
      config:         validation.sanitised,
      isValid:        true,
      errors:         [],
      warnings:       validation.warnings,
      previousConfig: prevRows[0]?.config ?? DEFAULT_PROTECTION_CONFIG,
      changeReason:   body.changeReason ?? "User update",
      updatedBy:      "user",
    });

    ok(res, {
      message:  "Protection config updated successfully",
      config:   validation.sanitised,
      warnings: validation.warnings,
    });
  } catch (e: any) {
    err(res, 500, e?.message ?? "Failed to update protection config");
  }
});

// ─── GET /risk/protection/report ──────────────────────────────────────────────

router.get("/risk/protection/report", async (req, res) => {
  try {
    const pair    = (req.query.pair    as string) || "EURUSD";
    const session = (req.query.session as string) || "london";
    const input   = await loadProtectionInput(pair, session);
    const result  = runCapitalProtection(input);

    const mon = result.monitors;
    const report = {
      generatedAt:     new Date().toISOString(),
      isAdvisoryOnly:  true,
      engineVersion:   result.engineVersion,
      protectionLevel: result.protectionLevelLabel,
      summary:         result.explainability.summary,
      levelJustification: result.explainability.levelJustification,
      primaryTrigger:  result.explainability.primaryTrigger,
      activeActions:   result.activeActions.map(a => ({
        type:   a.actionType,
        label:  a.label,
        trigger: a.trigger,
        benefit: a.expectedBenefit,
      })),
      monitors: {
        account: {
          severity: mon.account.severity, health: mon.account.healthScore,
          dailyLoss: mon.account.dailyLossPct, weeklyLoss: mon.account.weeklyLossPct,
          equityDrawdown: mon.account.equityDrawdownPct,
        },
        consecutiveLoss: {
          severity: mon.consecutiveLoss.severity, health: mon.consecutiveLoss.healthScore,
          consecutiveLosses: mon.consecutiveLoss.consecutiveLosses,
        },
        drawdown: {
          severity: mon.drawdown.severity, health: mon.drawdown.healthScore,
          current: mon.drawdown.currentDrawdownPct, max: mon.drawdown.maxDrawdownPct,
          velocity: mon.drawdown.drawdownVelocity, threshold: mon.drawdown.thresholdCrossed,
        },
        exposure: {
          severity: mon.exposure.severity, health: mon.exposure.healthScore,
          totalRisk: mon.exposure.totalOpenRiskPct, correlation: mon.exposure.correlationScore,
          directionalBias: mon.exposure.directionalBias,
        },
        margin: {
          severity: mon.margin.severity, health: mon.margin.healthScore,
          marginLevel: mon.margin.marginLevel, marginCallRisk: mon.margin.marginCallRisk,
        },
        broker: {
          severity: mon.broker.severity, health: mon.broker.healthScore,
          spreadRatio: mon.broker.spreadRatio, slippage: mon.broker.slippagePips,
        },
        system: {
          severity: mon.system.severity, health: mon.system.healthScore,
          criticalFailures: mon.system.criticalFailures,
        },
      },
      recovery:          result.recovery,
      historicalComparison: result.explainability.historicalComparison,
      recoveryPath:      result.explainability.recoveryPath,
      config:            result.config,
    };
    ok(res, report);
  } catch (e: any) {
    err(res, 500, e?.message ?? "Failed to generate protection report");
  }
});

export default router;
