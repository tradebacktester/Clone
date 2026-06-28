// ─── Health Monitor Bridge ────────────────────────────────────────────────────
// Assembles inputs from DB and runs the health computation.

import { db } from "@workspace/db";
import {
  learningCyclesTable,
  learningFeaturesTable,
  learningValidationResultsTable,
  learningDriftEventsTable,
  patternRecordsTable,
  recommendationAccuracyLogTable,
} from "@workspace/db";
import { desc, eq, count, and } from "drizzle-orm";
import { computeHealthSnapshot } from "@workspace/market-analysis";

export async function computeHealthBridge() {
  // Fetch all required inputs in parallel
  const [
    totalCyclesRes,
    passedCyclesRes,
    totalFeaturesRes,
    totalPatternsRes,
    reliablePatternsRes,
    activeDriftRes,
    criticalDriftRes,
    latestValidation,
    cycleConfidences,
    latestAccuracy,
  ] = await Promise.all([
    db.select({ count: count() }).from(learningCyclesTable),
    db.select({ count: count() }).from(learningCyclesTable).where(eq(learningCyclesTable.validationStatus, "passed")),
    db.select({ count: count() }).from(learningFeaturesTable),
    db.select({ count: count() }).from(patternRecordsTable),
    db.select({ count: count() }).from(patternRecordsTable).where(eq(patternRecordsTable.isInsufficient, false)),
    db.select({ count: count() }).from(learningDriftEventsTable).where(eq(learningDriftEventsTable.resolved, false)),
    db.select({ count: count() }).from(learningDriftEventsTable)
      .where(and(eq(learningDriftEventsTable.resolved, false), eq(learningDriftEventsTable.severity, "critical"))),
    db.select({ dataQualityScore: learningValidationResultsTable.dataQualityScore, completenessScore: learningValidationResultsTable.completenessScore, missingDataPct: learningValidationResultsTable.missingDataPct, overallStatus: learningValidationResultsTable.overallStatus })
      .from(learningValidationResultsTable)
      .orderBy(desc(learningValidationResultsTable.createdAt))
      .limit(1),
    db.select({ confidence: learningCyclesTable.overallConfidence })
      .from(learningCyclesTable)
      .where(eq(learningCyclesTable.status, "complete"))
      .orderBy(desc(learningCyclesTable.startedAt))
      .limit(20),
    db.select({ f1Score: recommendationAccuracyLogTable.f1Score, brierScore: recommendationAccuracyLogTable.brierScore })
      .from(recommendationAccuracyLogTable)
      .orderBy(desc(recommendationAccuracyLogTable.evaluatedAt))
      .limit(1),
  ]);

  const totalCycles = Number(totalCyclesRes[0]?.count ?? 0);
  const passedCycles = Number(passedCyclesRes[0]?.count ?? 0);
  const totalFeatures = Number(totalFeaturesRes[0]?.count ?? 0);
  const totalPatterns = Number(totalPatternsRes[0]?.count ?? 0);
  const reliablePatterns = Number(reliablePatternsRes[0]?.count ?? 0);
  const activeDriftAlerts = Number(activeDriftRes[0]?.count ?? 0);
  const criticalDriftAlerts = Number(criticalDriftRes[0]?.count ?? 0);

  const lv = latestValidation[0];
  const validationCount = await db.select({ count: count() }).from(learningValidationResultsTable);
  const passedValidations = await db.select({ count: count() })
    .from(learningValidationResultsTable)
    .where(eq(learningValidationResultsTable.overallStatus, "passed"));

  const cycleConfidenceScores = cycleConfidences
    .map(c => Number(c.confidence ?? 50))
    .filter(v => v > 0);

  const snapshot = computeHealthSnapshot({
    triggeredBy: "auto",
    dataQualityScore: Number(lv?.dataQualityScore ?? 50),
    completenessScore: Number(lv?.completenessScore ?? 50),
    missingDataPct: Number(lv?.missingDataPct ?? 50),
    totalFeatures,
    totalCycles,
    cycleConfidenceScores: cycleConfidenceScores.length > 0 ? cycleConfidenceScores : [50],
    totalPatterns,
    reliablePatterns,
    passedCycles,
    totalValidations: Number(validationCount[0]?.count ?? 0),
    passedValidations: Number(passedValidations[0]?.count ?? 0),
    activeDriftAlerts,
    criticalDriftAlerts,
    recommendationF1: Number(latestAccuracy[0]?.f1Score ?? 0),
    brierScore: Number(latestAccuracy[0]?.brierScore ?? 0.5),
  });

  return snapshot;
}
