// ─── Executive AI Routes ──────────────────────────────────────────────────────
// Phase 7 · GET /executive-ai/*

import { Router } from "express";
import { db }     from "@workspace/db";
import {
  eaiDecisionsTable,
  eaiTimelineTable,
  eaiConflictsTable,
} from "@workspace/db";
import {
  esbReportsTable,
  riReportsTable,
  erbReportsTable,
} from "@workspace/db";
import { desc, eq, gte, sql } from "drizzle-orm";
import {
  runExecutiveAI,
  EAI_ENGINE_VERSION,
  EAI_DECISION_VERSION,
} from "@workspace/market-analysis";

export const executiveAiRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(v: unknown, fallback = 0): number {
  const num = Number(v);
  return isFinite(num) ? num : fallback;
}

async function fetchLatestSubsystemData() {
  const [strategyRow] = await db
    .select()
    .from(esbReportsTable)
    .orderBy(desc(esbReportsTable.evaluatedAt))
    .limit(1);

  const [erbRow] = await db
    .select()
    .from(erbReportsTable)
    .orderBy(desc(erbReportsTable.evaluatedAt))
    .limit(1);

  const [riRow] = await db
    .select()
    .from(riReportsTable)
    .orderBy(desc(riReportsTable.evaluatedAt))
    .limit(1);

  return { strategyRow, erbRow, riRow };
}

async function runAndPersist(pair: string, timeframe: string) {
  const { strategyRow, erbRow, riRow } = await fetchLatestSubsystemData();

  const strategyResult = strategyRow?.fullPayload
    ? (typeof strategyRow.fullPayload === "string" ? JSON.parse(strategyRow.fullPayload) : strategyRow.fullPayload)
    : null;

  const erbResult = erbRow?.fullPayload
    ? (typeof erbRow.fullPayload === "string" ? JSON.parse(erbRow.fullPayload) : erbRow.fullPayload)
    : null;

  const decision = await runExecutiveAI({
    pair,
    timeframe,
    strategyResult,
    erbResult,
    riResult: erbResult,
  });

  // Persist full decision
  await db.insert(eaiDecisionsTable).values({
    decisionId:           decision.decisionId,
    pair:                 decision.pair,
    timeframe:            decision.timeframe,
    decision:             decision.decision,
    decisionLabel:        decision.decisionLabel,
    executiveScore:       decision.executiveScore,
    executiveConfidence:  decision.executiveConfidence.overall,
    strategyScore:        decision.scoreBreakdown.strategy.raw,
    marketScore:          decision.scoreBreakdown.market.raw,
    riskScore:            decision.scoreBreakdown.risk.raw,
    memoryScore:          decision.scoreBreakdown.memory.raw,
    learningScore:        decision.scoreBreakdown.learning.raw,
    identityScore:        decision.scoreBreakdown.identity.raw,
    researchScore:        decision.scoreBreakdown.research.raw,
    hasConflicts:         decision.hasConflicts,
    conflictCount:        decision.conflicts.length,
    marketRegime:         decision.marketRegime,
    riskState:            decision.riskState,
    crisisStatus:         decision.crisisStatus,
    engineVersion:        decision.versionInfo.engineVersion,
    strategyVersion:      decision.versionInfo.strategyVersion,
    riskVersion:          decision.versionInfo.riskVersion,
    fullPayload:          decision as unknown as Record<string, unknown>,
    isAdvisoryOnly:       true,
  }).onConflictDoNothing();

  // Persist lightweight timeline
  await db.insert(eaiTimelineTable).values({
    decisionId:      decision.decisionId,
    decision:        decision.decision,
    executiveScore:  decision.executiveScore,
    confidence:      decision.executiveConfidence.overall,
    pair:            decision.pair,
    regime:          decision.marketRegime,
    riskState:       decision.riskState,
    hasConflicts:    decision.hasConflicts,
    engineVersion:   decision.versionInfo.engineVersion,
  }).catch(() => {});

  // Persist conflicts
  if (decision.conflicts.length > 0) {
    await db.insert(eaiConflictsTable).values(
      decision.conflicts.map(c => ({
        decisionId:          decision.decisionId,
        conflictId:          c.conflictId,
        systemA:             c.systemA,
        systemB:             c.systemB,
        scoreA:              c.scoreA,
        scoreB:              c.scoreB,
        divergence:          c.divergence,
        severity:            c.severity,
        conflictType:        c.type,
        winnerSystem:        c.winnerSystem,
        resolution:          c.resolution,
        winningEvidence:     c.winningEvidence,
        rejectedEvidence:    c.rejectedEvidence,
        finalJustification:  c.finalJustification,
      }))
    ).catch(() => {});
  }

  return decision;
}

// ─── GET /executive-ai/status ─────────────────────────────────────────────────

executiveAiRouter.get("/executive-ai/status", async (_req, res) => {
  try {
    const [latest] = await db
      .select()
      .from(eaiDecisionsTable)
      .orderBy(desc(eaiDecisionsTable.evaluatedAt))
      .limit(1);

    if (!latest) {
      // Run fresh
      const decision = await runAndPersist("EURUSD", "15m");
      return res.json({
        engineVersion:       EAI_ENGINE_VERSION,
        decisionVersion:     EAI_DECISION_VERSION,
        evaluatedAt:         decision.timestamp,
        isAdvisoryOnly:      true,
        decision:            decision.decision,
        decisionLabel:       decision.decisionLabel,
        executiveScore:      decision.executiveScore,
        confidence:          decision.executiveConfidence.overall,
        reliabilityRating:   decision.executiveConfidence.reliabilityRating,
        hasConflicts:        decision.hasConflicts,
        conflictCount:       decision.conflicts.length,
        marketRegime:        decision.marketRegime,
        riskState:           decision.riskState,
        crisisStatus:        decision.crisisStatus,
        mostInfluential:     decision.explainability.mostInfluentialSystem,
        executiveSummary:    decision.explainability.executiveSummary,
        scoreBreakdown: {
          strategy: decision.scoreBreakdown.strategy.raw,
          market:   decision.scoreBreakdown.market.raw,
          risk:     decision.scoreBreakdown.risk.raw,
          memory:   decision.scoreBreakdown.memory.raw,
          learning: decision.scoreBreakdown.learning.raw,
          identity: decision.scoreBreakdown.identity.raw,
          research: decision.scoreBreakdown.research.raw,
        },
      });
    }

    return res.json({
      engineVersion:       EAI_ENGINE_VERSION,
      decisionVersion:     EAI_DECISION_VERSION,
      evaluatedAt:         latest.evaluatedAt,
      isAdvisoryOnly:      true,
      decision:            latest.decision,
      decisionLabel:       latest.decisionLabel,
      executiveScore:      latest.executiveScore,
      confidence:          latest.executiveConfidence,
      hasConflicts:        latest.hasConflicts,
      conflictCount:       latest.conflictCount,
      marketRegime:        latest.marketRegime,
      riskState:           latest.riskState,
      crisisStatus:        latest.crisisStatus,
      scoreBreakdown: {
        strategy: latest.strategyScore,
        market:   latest.marketScore,
        risk:     latest.riskScore,
        memory:   latest.memoryScore,
        learning: latest.learningScore,
        identity: latest.identityScore,
        research: latest.researchScore,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to get executive AI status", detail: err?.message });
  }
});

// ─── GET /executive-ai/decision ───────────────────────────────────────────────

executiveAiRouter.get("/executive-ai/decision", async (req, res) => {
  try {
    const pair      = String(req.query.pair      ?? "EURUSD");
    const timeframe = String(req.query.timeframe ?? "15m");

    const decision = await runAndPersist(pair, timeframe);
    res.json({ success: true, isAdvisoryOnly: true, data: decision });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to produce executive decision", detail: err?.message });
  }
});

// ─── GET /executive-ai/history ────────────────────────────────────────────────

executiveAiRouter.get("/executive-ai/history", async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 60)));
    const pair  = req.query.pair ? String(req.query.pair) : null;

    let query = db
      .select()
      .from(eaiTimelineTable)
      .orderBy(desc(eaiTimelineTable.recordedAt))
      .limit(limit);

    const rows = await query;
    const filtered = pair ? rows.filter(r => r.pair === pair) : rows;

    res.json({
      success: true,
      count: filtered.length,
      decisions: filtered,
      engineVersion: EAI_ENGINE_VERSION,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load decision history", detail: err?.message });
  }
});

// ─── GET /executive-ai/conflicts ──────────────────────────────────────────────

executiveAiRouter.get("/executive-ai/conflicts", async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));

    const rows = await db
      .select()
      .from(eaiConflictsTable)
      .orderBy(desc(eaiConflictsTable.recordedAt))
      .limit(limit);

    const bySeverity = {
      critical: rows.filter(r => r.severity === "critical").length,
      high:     rows.filter(r => r.severity === "high").length,
      moderate: rows.filter(r => r.severity === "moderate").length,
      low:      rows.filter(r => r.severity === "low").length,
    };

    const byType: Record<string, number> = {};
    for (const r of rows) {
      byType[r.conflictType] = (byType[r.conflictType] ?? 0) + 1;
    }

    res.json({
      success: true,
      count: rows.length,
      conflicts: rows,
      summary: { bySeverity, byType },
      engineVersion: EAI_ENGINE_VERSION,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load conflicts", detail: err?.message });
  }
});

// ─── GET /executive-ai/evidence ───────────────────────────────────────────────

executiveAiRouter.get("/executive-ai/evidence", async (req, res) => {
  try {
    const decisionId = req.query.decisionId ? String(req.query.decisionId) : null;

    let rows;
    if (decisionId) {
      rows = await db
        .select()
        .from(eaiDecisionsTable)
        .where(eq(eaiDecisionsTable.decisionId, decisionId))
        .limit(1);
    } else {
      rows = await db
        .select()
        .from(eaiDecisionsTable)
        .orderBy(desc(eaiDecisionsTable.evaluatedAt))
        .limit(1);
    }

    const row = rows[0];
    if (!row) {
      return res.json({ success: true, evidence: null, message: "No decision found" });
    }

    const payload = row.fullPayload as any;
    res.json({
      success: true,
      decisionId: row.decisionId,
      decision:   row.decision,
      decisionLabel: row.decisionLabel,
      executiveScore: row.executiveScore,
      evidence: {
        topEvidence:      payload?.explainability?.topEvidence      ?? [],
        contraEvidence:   payload?.explainability?.contraEvidence   ?? [],
        agreedSystems:    payload?.explainability?.agreedSystems    ?? [],
        disagreedSystems: payload?.explainability?.disagreedSystems ?? [],
        whyThisDecision:  payload?.explainability?.whyThisDecision  ?? "",
        historicalRefs:   payload?.explainability?.historicalReferences ?? [],
        executiveSummary: payload?.explainability?.executiveSummary ?? "",
        vetoApplied:      payload?.scoreBreakdown?.vetoApplied      ?? false,
        vetoReason:       payload?.scoreBreakdown?.vetoReason       ?? null,
      },
      contributingSystems: payload?.contributingSystems ?? [],
      conflicts:           payload?.conflicts           ?? [],
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load evidence", detail: err?.message });
  }
});

// ─── GET /executive-ai/report ─────────────────────────────────────────────────

executiveAiRouter.get("/executive-ai/report", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(eaiDecisionsTable)
      .orderBy(desc(eaiDecisionsTable.evaluatedAt))
      .limit(200);

    if (rows.length === 0) {
      return res.json({ success: true, data: null, message: "No decisions recorded yet" });
    }

    const avgScore      = rows.reduce((s, r) => s + r.executiveScore, 0)     / rows.length;
    const avgConfidence = rows.reduce((s, r) => s + r.executiveConfidence, 0) / rows.length;

    const decisionDist: Record<string, number> = {};
    for (const r of rows) decisionDist[r.decision] = (decisionDist[r.decision] ?? 0) + 1;

    const conflictRows = await db
      .select()
      .from(eaiConflictsTable)
      .orderBy(desc(eaiConflictsTable.recordedAt))
      .limit(100);

    const conflictDist: Record<string, number> = {};
    for (const c of conflictRows) conflictDist[c.severity] = (conflictDist[c.severity] ?? 0) + 1;

    const recentTrend = rows.slice(0, 20).reverse().map(r => ({
      time:      r.evaluatedAt,
      score:     r.executiveScore,
      decision:  r.decision,
      conflicts: r.conflictCount,
    }));

    res.json({
      success: true,
      data: {
        totalDecisions:      rows.length,
        avgExecutiveScore:   Math.round(avgScore * 10) / 10,
        avgConfidence:       Math.round(avgConfidence * 10) / 10,
        decisionDistribution: decisionDist,
        conflictSeverityDist: conflictDist,
        totalConflicts:      conflictRows.length,
        conflictRate:        Math.round((rows.filter(r => r.hasConflicts).length / rows.length) * 100),
        recentTrend,
        engineVersion:       EAI_ENGINE_VERSION,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to generate report", detail: err?.message });
  }
});
