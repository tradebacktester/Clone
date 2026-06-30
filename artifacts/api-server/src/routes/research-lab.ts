// ─── Autonomous Research Lab — API Routes ────────────────────────────────────
// Sandboxed research environment. Advisory only.
// Production KRYTOS is never touched by any route in this file.

import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import {
  rlProjectsTable,
  rlHypothesesTable,
  rlExperimentsTable,
  rlCodeChangesTable,
  rlComparisonsTable,
  rlRecommendationsTable,
  rlApprovalQueueTable,
  rlHistoryTable,
  learningFeaturesTable,
} from "@workspace/db";
import { desc, eq, and, sql } from "drizzle-orm";
import {
  runResearchCycle,
  detectWeaknesses,
  generateHypotheses,
  buildLabReport,
  processDecision,
  RL_ENGINE_VERSION,
} from "@workspace/market-analysis";
import type { FeatureSnapshot } from "@workspace/market-analysis";

export const researchLabRouter = Router();

// ─── Load features helper ─────────────────────────────────────────────────────

async function loadFeatureSnapshots(limit = 500): Promise<FeatureSnapshot[]> {
  const rows = await db
    .select()
    .from(learningFeaturesTable)
    .orderBy(desc(learningFeaturesTable.extractedAt))
    .limit(limit);

  return rows.map(r => ({
    pair:       r.pair,
    session:    r.session,
    regime:     r.marketRegime,
    outcome:    r.outcome,
    setupScore: Number(r.setupScore),
    tqi:        Number(r.tqi),
    rrActual:   Number(r.rrActual ?? 0),
    pnl:        Number(r.pnl ?? 0),
    openedAt:   r.openedAt ? new Date(r.openedAt) : new Date(),
  }));
}

// ─── History event logger ─────────────────────────────────────────────────────

async function logHistory(
  eventType:   string,
  entityType:  string,
  entityId:    string,
  title:       string,
  description: string,
  projectId?:  string,
  metadata?:   Record<string, unknown>,
): Promise<void> {
  await db.insert(rlHistoryTable).values({
    historyId:   randomUUID(),
    eventType,
    entityType,
    entityId,
    projectId:   projectId ? (projectId as `${string}-${string}-${string}-${string}-${string}`) : null,
    title,
    description,
    metadata:    metadata ?? {},
    isReproducible: true,
  }).onConflictDoNothing();
}

// ─── GET /research/projects ────────────────────────────────────────────────────

researchLabRouter.get("/research/projects", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limit  = Math.min(Number(req.query.limit ?? 50), 200);

    let rows = await db
      .select()
      .from(rlProjectsTable)
      .orderBy(desc(rlProjectsTable.createdAt))
      .limit(limit);

    if (status) rows = rows.filter(r => r.status === status);

    res.json({ projects: rows, count: rows.length, version: RL_ENGINE_VERSION });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch research projects", detail: String(err) });
  }
});

// ─── GET /research/hypotheses ──────────────────────────────────────────────────

researchLabRouter.get("/research/hypotheses", async (req, res) => {
  try {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    const limit     = Math.min(Number(req.query.limit ?? 50), 200);

    const rows = await db
      .select()
      .from(rlHypothesesTable)
      .orderBy(desc(rlHypothesesTable.createdAt))
      .limit(limit);

    const filtered = projectId ? rows.filter(r => r.projectId === projectId) : rows;

    res.json({ hypotheses: filtered, count: filtered.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch hypotheses", detail: String(err) });
  }
});

// ─── GET /research/experiments ─────────────────────────────────────────────────

researchLabRouter.get("/research/experiments", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limit  = Math.min(Number(req.query.limit ?? 50), 200);

    const rows = await db
      .select()
      .from(rlExperimentsTable)
      .orderBy(desc(rlExperimentsTable.createdAt))
      .limit(limit);

    const filtered = status ? rows.filter(r => r.status === status) : rows;
    res.json({ experiments: filtered, count: filtered.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch experiments", detail: String(err) });
  }
});

// ─── GET /research/code-changes ────────────────────────────────────────────────

researchLabRouter.get("/research/code-changes", async (req, res) => {
  try {
    const experimentId = typeof req.query.experimentId === "string" ? req.query.experimentId : undefined;
    const limit        = Math.min(Number(req.query.limit ?? 100), 500);

    const rows = await db
      .select()
      .from(rlCodeChangesTable)
      .orderBy(desc(rlCodeChangesTable.createdAt))
      .limit(limit);

    const filtered = experimentId ? rows.filter(r => r.experimentId === experimentId) : rows;
    res.json({ codeChanges: filtered, count: filtered.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch code changes", detail: String(err) });
  }
});

// ─── GET /research/comparisons ────────────────────────────────────────────────

researchLabRouter.get("/research/comparisons", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const rows  = await db
      .select()
      .from(rlComparisonsTable)
      .orderBy(desc(rlComparisonsTable.createdAt))
      .limit(limit);

    res.json({ comparisons: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch comparisons", detail: String(err) });
  }
});

// ─── GET /research/recommendations ────────────────────────────────────────────

researchLabRouter.get("/research/recommendations", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limit  = Math.min(Number(req.query.limit ?? 50), 200);

    const rows = await db
      .select()
      .from(rlRecommendationsTable)
      .orderBy(desc(rlRecommendationsTable.createdAt))
      .limit(limit);

    const filtered = status ? rows.filter(r => r.status === status) : rows;
    res.json({ recommendations: filtered, count: filtered.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recommendations", detail: String(err) });
  }
});

// ─── GET /research/approval-queue ─────────────────────────────────────────────

researchLabRouter.get("/research/approval-queue", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const rows  = await db
      .select()
      .from(rlApprovalQueueTable)
      .orderBy(desc(rlApprovalQueueTable.createdAt))
      .limit(limit);

    const pending = rows.filter(r => r.status === "pending");
    res.json({ queue: rows, pendingCount: pending.length, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch approval queue", detail: String(err) });
  }
});

// ─── POST /research/approve ───────────────────────────────────────────────────

researchLabRouter.post("/research/approve", async (req, res) => {
  try {
    const body       = req.body as Record<string, unknown>;
    const queueId    = String(body.queueId    ?? "");
    const reason     = String(body.reason     ?? "");
    const decidedBy  = String(body.decidedBy  ?? "operator");

    if (!queueId) return void res.status(400).json({ error: "queueId is required" });

    const [queueItem] = await db
      .select()
      .from(rlApprovalQueueTable)
      .where(eq(rlApprovalQueueTable.queueId, queueId as `${string}-${string}-${string}-${string}-${string}`))
      .limit(1);

    if (!queueItem) return void res.status(404).json({ error: "Queue item not found" });
    if (queueItem.status !== "pending") return void res.status(409).json({ error: `Queue item already decided: ${queueItem.status}` });

    const result = processDecision(queueId, "approved", reason, decidedBy);

    await db
      .update(rlApprovalQueueTable)
      .set({ status: "decided", decision: "approved", decidedAt: result.decidedAt, decisionReason: result.decisionReason, decidedBy })
      .where(eq(rlApprovalQueueTable.queueId, queueId as `${string}-${string}-${string}-${string}-${string}`));

    await db
      .update(rlRecommendationsTable)
      .set({ status: "approved" })
      .where(eq(rlRecommendationsTable.recommendationId, queueItem.recommendationId as `${string}-${string}-${string}-${string}-${string}`));

    await db
      .update(rlExperimentsTable)
      .set({ approvalStatus: "approved" })
      .where(eq(rlExperimentsTable.experimentId, queueItem.experimentId as `${string}-${string}-${string}-${string}-${string}`));

    await logHistory("approved", "approval", queueId, `Approved: ${queueItem.title}`, result.decisionReason, queueItem.projectId ?? undefined, { decidedBy, reason });

    res.json({ success: true, decision: result, advisory: "Approved in research environment only. No production deployment has occurred." });
  } catch (err) {
    res.status(500).json({ error: "Approval failed", detail: String(err) });
  }
});

// ─── POST /research/reject ────────────────────────────────────────────────────

researchLabRouter.post("/research/reject", async (req, res) => {
  try {
    const body      = req.body as Record<string, unknown>;
    const queueId   = String(body.queueId   ?? "");
    const reason    = String(body.reason    ?? "");
    const decision  = String(body.decision  ?? "rejected") as "rejected" | "more_testing" | "continue_paper" | "archived";
    const decidedBy = String(body.decidedBy ?? "operator");

    if (!queueId) return void res.status(400).json({ error: "queueId is required" });

    const [queueItem] = await db
      .select()
      .from(rlApprovalQueueTable)
      .where(eq(rlApprovalQueueTable.queueId, queueId as `${string}-${string}-${string}-${string}-${string}`))
      .limit(1);

    if (!queueItem) return void res.status(404).json({ error: "Queue item not found" });
    if (queueItem.status !== "pending") return void res.status(409).json({ error: `Already decided: ${queueItem.status}` });

    const result = processDecision(queueId, decision, reason, decidedBy);

    await db
      .update(rlApprovalQueueTable)
      .set({ status: "decided", decision, decidedAt: result.decidedAt, decisionReason: result.decisionReason, decidedBy })
      .where(eq(rlApprovalQueueTable.queueId, queueId as `${string}-${string}-${string}-${string}-${string}`));

    const recStatus = decision === "archived" ? "archived" : decision === "rejected" ? "rejected" : "pending_approval";
    await db
      .update(rlRecommendationsTable)
      .set({ status: recStatus })
      .where(eq(rlRecommendationsTable.recommendationId, queueItem.recommendationId as `${string}-${string}-${string}-${string}-${string}`));

    await logHistory(decision, "approval", queueId, `${decision}: ${queueItem.title}`, result.decisionReason, queueItem.projectId ?? undefined);

    res.json({ success: true, decision: result });
  } catch (err) {
    res.status(500).json({ error: "Rejection failed", detail: String(err) });
  }
});

// ─── GET /research/history ────────────────────────────────────────────────────

researchLabRouter.get("/research/history", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const rows  = await db
      .select()
      .from(rlHistoryTable)
      .orderBy(desc(rlHistoryTable.createdAt))
      .limit(limit);

    res.json({ history: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch research history", detail: String(err) });
  }
});

// ─── POST /research/run-cycle ─────────────────────────────────────────────────
// Trigger a full autonomous research cycle from scratch.

researchLabRouter.post("/research/run-cycle", async (req, res) => {
  try {
    const features = await loadFeatureSnapshots(500);
    const cycle    = runResearchCycle(features, "1.0.0");

    // Persist project
    await db.insert(rlProjectsTable).values({
      projectId:       cycle.project.projectId as `${string}-${string}-${string}-${string}-${string}`,
      version:         RL_ENGINE_VERSION,
      title:           cycle.project.title,
      description:     cycle.project.description,
      objective:       cycle.project.objective,
      weaknessTarget:  cycle.project.weaknessTarget,
      status:          cycle.project.status,
      priority:        cycle.project.priority,
      hypothesisCount: cycle.project.hypothesisCount,
      experimentCount: cycle.project.experimentCount,
      isAdvisoryOnly:  true,
      startedAt:       cycle.project.startedAt,
      completedAt:     cycle.project.completedAt ?? null,
    }).onConflictDoNothing();

    // Persist hypotheses
    for (const h of cycle.hypotheses) {
      await db.insert(rlHypothesesTable).values({
        hypothesisId:        h.hypothesisId as `${string}-${string}-${string}-${string}-${string}`,
        projectId:           cycle.project.projectId as `${string}-${string}-${string}-${string}-${string}`,
        version:             RL_ENGINE_VERSION,
        title:               h.title,
        description:         h.description,
        rationale:           h.rationale,
        weaknessId:          h.weaknessId ?? null,
        hypothesisType:      h.hypothesisType,
        targetComponent:     h.targetComponent,
        proposedChange:      h.proposedChange,
        expectedImprovement: String(h.expectedImprovement),
        confidenceScore:     String(h.confidenceScore),
        supportingEvidence:  h.supportingEvidence,
        status:              h.status,
        experimentId:        cycle.experiment.experimentId as `${string}-${string}-${string}-${string}-${string}`,
      }).onConflictDoNothing();
    }

    // Persist experiment
    await db.insert(rlExperimentsTable).values({
      experimentId:          cycle.experiment.experimentId as `${string}-${string}-${string}-${string}-${string}`,
      projectId:             cycle.project.projectId as `${string}-${string}-${string}-${string}-${string}`,
      hypothesisId:          cycle.experiment.hypothesisId as `${string}-${string}-${string}-${string}-${string}` | null ?? null,
      version:               RL_ENGINE_VERSION,
      name:                  cycle.experiment.name,
      description:           cycle.experiment.description,
      parentVersion:         cycle.experiment.parentVersion,
      strategyVersion:       cycle.experiment.strategyVersion,
      researchObjective:     cycle.experiment.researchObjective,
      configChanges:         cycle.experiment.configChanges,
      status:                cycle.experiment.status,
      validationStage:       cycle.experiment.validationStage ?? null,
      validationResults:     cycle.experiment.validationResults ?? null,
      performanceMetrics:    cycle.experiment.performanceMetrics ?? null,
      statisticalConfidence: cycle.experiment.statisticalConfidence !== undefined ? String(cycle.experiment.statisticalConfidence) : null,
      approvalStatus:        cycle.experiment.approvalStatus,
      deploymentStatus:      cycle.experiment.deploymentStatus,
      isSandboxed:           true,
      isAdvisoryOnly:        true,
      startedAt:             cycle.experiment.startedAt,
      completedAt:           cycle.experiment.completedAt ?? null,
    }).onConflictDoNothing();

    // Persist code changes
    for (const c of cycle.codeChanges) {
      await db.insert(rlCodeChangesTable).values({
        changeId:       c.changeId as `${string}-${string}-${string}-${string}-${string}`,
        experimentId:   cycle.experiment.experimentId as `${string}-${string}-${string}-${string}-${string}`,
        projectId:      cycle.project.projectId as `${string}-${string}-${string}-${string}-${string}`,
        changeType:     c.changeType,
        targetModule:   c.targetModule,
        changeTitle:    c.changeTitle,
        description:    c.description,
        rationale:      c.rationale,
        pseudoCode:     c.pseudoCode ?? null,
        configBefore:   c.configBefore ?? null,
        configAfter:    c.configAfter ?? null,
        linesAdded:     c.linesAdded,
        linesRemoved:   c.linesRemoved,
        testsPassed:    c.testsPassed,
        staticAnalysis: c.staticAnalysis,
        securityCheck:  c.securityCheck,
        perfBenchmark:  c.perfBenchmark,
        affectsProduction: false,
        isResearchOnly:    true,
      }).onConflictDoNothing();
    }

    // Persist comparison
    const comp = cycle.comparison;
    const compId = randomUUID() as `${string}-${string}-${string}-${string}-${string}`;
    await db.insert(rlComparisonsTable).values({
      comparisonId:      compId,
      experimentId:      cycle.experiment.experimentId as `${string}-${string}-${string}-${string}-${string}`,
      projectId:         cycle.project.projectId as `${string}-${string}-${string}-${string}-${string}`,
      productionVersion: cycle.experiment.parentVersion,
      experimentVersion: cycle.experiment.strategyVersion,
      sampleSize:        comp.productionMetrics.tradeCount,
      testPeriodDays:    cycle.validation.testPeriodDays,
      prodWinRate:       String(comp.productionMetrics.winRate),
      prodAvgRr:         String(comp.productionMetrics.avgRr),
      prodProfitFactor:  String(comp.productionMetrics.profitFactor),
      prodMaxDrawdown:   String(comp.productionMetrics.maxDrawdown),
      prodSharpe:        String(comp.productionMetrics.sharpe),
      prodTotalReturn:   String(comp.productionMetrics.totalReturn),
      expWinRate:        String(comp.experimentMetrics.winRate),
      expAvgRr:          String(comp.experimentMetrics.avgRr),
      expProfitFactor:   String(comp.experimentMetrics.profitFactor),
      expMaxDrawdown:    String(comp.experimentMetrics.maxDrawdown),
      expSharpe:         String(comp.experimentMetrics.sharpe),
      expTotalReturn:    String(comp.experimentMetrics.totalReturn),
      winRatePValue:     String(comp.winRatePValue),
      sharpeImprovement: String(comp.sharpeImprovement),
      isStatSignificant: comp.isStatSignificant,
      overallVerdict:    comp.overallVerdict,
      verdictScore:      String(comp.verdictScore),
      summary:           comp.summary,
    }).onConflictDoNothing();

    // Persist recommendation
    const rec = cycle.recommendation;
    await db.insert(rlRecommendationsTable).values({
      recommendationId:        rec.recommendationId as `${string}-${string}-${string}-${string}-${string}`,
      experimentId:            cycle.experiment.experimentId as `${string}-${string}-${string}-${string}-${string}`,
      projectId:               cycle.project.projectId as `${string}-${string}-${string}-${string}-${string}`,
      comparisonId:            compId,
      version:                 RL_ENGINE_VERSION,
      title:                   rec.title,
      summary:                 rec.summary,
      codeChangeSummary:       rec.codeChangeSummary,
      performanceSummary:      rec.performanceSummary,
      riskAssessment:          rec.riskAssessment,
      statisticalSignificance: String(rec.statisticalSignificance),
      confidenceScore:         String(rec.confidenceScore),
      validationEvidence:      rec.validationEvidence,
      potentialDrawbacks:      rec.potentialDrawbacks,
      rollbackPlan:            rec.rollbackPlan,
      recommendationType:      rec.recommendationType,
      status:                  rec.status,
    }).onConflictDoNothing();

    // Persist approval request
    const apr = cycle.approvalRequest;
    await db.insert(rlApprovalQueueTable).values({
      queueId:          apr.queueId as `${string}-${string}-${string}-${string}-${string}`,
      recommendationId: rec.recommendationId as `${string}-${string}-${string}-${string}-${string}`,
      experimentId:     cycle.experiment.experimentId as `${string}-${string}-${string}-${string}-${string}`,
      projectId:        cycle.project.projectId as `${string}-${string}-${string}-${string}-${string}`,
      title:            apr.title,
      summary:          apr.summary,
      priority:         apr.priority,
      requestedAt:      apr.requestedAt,
      status:           "pending",
      expiresAt:        apr.expiresAt,
    }).onConflictDoNothing();

    // Log history
    await logHistory("project_created", "project", cycle.project.projectId, cycle.project.title, cycle.project.description, cycle.project.projectId, { weaknesses: cycle.weaknesses.length, hypotheses: cycle.hypotheses.length });

    res.json({
      success:       true,
      cycle: {
        projectId:          cycle.project.projectId,
        experimentId:       cycle.experiment.experimentId,
        recommendationId:   cycle.recommendation.recommendationId,
        approvalQueueId:    cycle.approvalRequest.queueId,
        weaknessesDetected: cycle.weaknesses.length,
        hypothesesGenerated:cycle.hypotheses.length,
        validationPassed:   cycle.validation.passed,
        validationScore:    cycle.validation.overallScore,
        overallVerdict:     cycle.comparison.overallVerdict,
        recommendationType: cycle.recommendation.recommendationType,
      },
      isAdvisoryOnly: true,
    });
  } catch (err) {
    res.status(500).json({ error: "Research cycle failed", detail: String(err) });
  }
});

// ─── GET /research/weaknesses ─────────────────────────────────────────────────
// Detect current weaknesses from production learning data (read-only).

researchLabRouter.get("/research/weaknesses", async (req, res) => {
  try {
    const features   = await loadFeatureSnapshots(500);
    const weaknesses = detectWeaknesses(features);

    res.json({
      weaknesses,
      count:      weaknesses.length,
      sampleSize: features.length,
      generatedAt: new Date(),
      isAdvisoryOnly: true,
    });
  } catch (err) {
    res.status(500).json({ error: "Weakness detection failed", detail: String(err) });
  }
});

// ─── GET /research/statistics ─────────────────────────────────────────────────

researchLabRouter.get("/research/statistics", async (req, res) => {
  try {
    const [totalProjects]     = await db.select({ c: sql<number>`COUNT(*)` }).from(rlProjectsTable);
    const [totalExperiments]  = await db.select({ c: sql<number>`COUNT(*)` }).from(rlExperimentsTable);
    const [totalHypotheses]   = await db.select({ c: sql<number>`COUNT(*)` }).from(rlHypothesesTable);
    const [pendingApprovals]  = await db.select({ c: sql<number>`COUNT(*)` }).from(rlApprovalQueueTable).where(eq(rlApprovalQueueTable.status, "pending"));
    const [totalRecs]         = await db.select({ c: sql<number>`COUNT(*)` }).from(rlRecommendationsTable);
    const [deployedCount]     = await db.select({ c: sql<number>`COUNT(*)` }).from(rlApprovalQueueTable).where(eq(rlApprovalQueueTable.decision, "approved"));
    const [historyCount]      = await db.select({ c: sql<number>`COUNT(*)` }).from(rlHistoryTable);

    res.json({
      totalProjects:       Number(totalProjects?.c ?? 0),
      totalExperiments:    Number(totalExperiments?.c ?? 0),
      totalHypotheses:     Number(totalHypotheses?.c ?? 0),
      pendingApprovals:    Number(pendingApprovals?.c ?? 0),
      totalRecommendations:Number(totalRecs?.c ?? 0),
      deployedVersions:    Number(deployedCount?.c ?? 0),
      historyEvents:       Number(historyCount?.c ?? 0),
    });
  } catch (err) {
    res.status(500).json({ error: "Statistics failed", detail: String(err) });
  }
});
