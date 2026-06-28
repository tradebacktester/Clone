// ─── Data Validator ─────────────────────────────────────────────────────────
// Validates raw trade inputs before the pipeline processes them.
// Returns a DataValidationResult — never throws.

import type {
  RawTradeRecord,
  DataValidationResult,
  ValidationIssue,
} from "../learning-core/types.js";

const VALID_PAIRS = new Set(["EURUSD", "GBPUSD", "USDJPY"]);
const VALID_SESSIONS = new Set(["london", "new_york", "asian", "unknown"]);
const VALID_OUTCOMES = new Set(["win", "loss", "break_even"]);
const VALID_REGIMES = new Set(["trending", "ranging", "volatile", "low_volatility"]);

// Minimum records required for a "passed" validation
export const MIN_SAMPLE_FOR_PASSED = 10;
// Below this the status is "degraded"
export const MIN_SAMPLE_FOR_DEGRADED = 3;

export function validateTrades(
  records: RawTradeRecord[],
): DataValidationResult {
  const issues: ValidationIssue[] = [];
  const qualityNotes: string[] = [];

  if (records.length === 0) {
    return {
      isValid: false,
      totalRecords: 0,
      usableRecords: 0,
      rejectedRecords: 0,
      completenessScore: 0,
      issues: [{ field: "records", message: "No trade records provided", severity: "error" }],
      qualityNotes: ["Empty dataset — cannot run learning cycle"],
    };
  }

  // Per-record validation — collect usable set
  const usable: RawTradeRecord[] = [];
  let totalCompleteness = 0;

  for (const rec of records) {
    const recIssues: ValidationIssue[] = [];
    let fieldScore = 0;
    const totalFields = 10;

    // Required: id
    if (rec.id === undefined || rec.id === null) {
      recIssues.push({ field: "id", message: `Record missing id`, severity: "error" });
    } else {
      fieldScore++;
    }

    // Required: pair
    if (!rec.pair) {
      recIssues.push({ field: "pair", message: `Record ${rec.id}: missing pair`, severity: "error" });
    } else if (!VALID_PAIRS.has(rec.pair.toUpperCase())) {
      recIssues.push({ field: "pair", message: `Record ${rec.id}: unknown pair '${rec.pair}'`, severity: "warning" });
      fieldScore += 0.5;
    } else {
      fieldScore++;
    }

    // Required: session
    if (!rec.session) {
      recIssues.push({ field: "session", message: `Record ${rec.id}: missing session`, severity: "warning" });
    } else {
      if (VALID_SESSIONS.has(rec.session.toLowerCase())) fieldScore++;
      else fieldScore += 0.5;
    }

    // Required: outcome (must be closed trade)
    if (!rec.outcome) {
      recIssues.push({ field: "outcome", message: `Record ${rec.id}: missing outcome — record excluded`, severity: "error" });
    } else if (!VALID_OUTCOMES.has(rec.outcome.toLowerCase())) {
      recIssues.push({ field: "outcome", message: `Record ${rec.id}: unknown outcome '${rec.outcome}'`, severity: "warning" });
    } else {
      fieldScore++;
    }

    // Optional but scored: regime
    if (rec.regime && VALID_REGIMES.has(rec.regime.toLowerCase())) fieldScore++;
    else if (rec.regime) fieldScore += 0.5;

    // Optional but scored: rr
    const rrActual = toNumber(rec.riskRewardActual);
    if (rrActual !== null && rrActual >= 0) fieldScore++;

    // Optional: scores
    const zoneOk = toNumber(rec.zoneScore) !== null;
    const liqOk = toNumber(rec.liquidityScore) !== null;
    const amdOk = toNumber(rec.amdScore) !== null;
    const confOk = toNumber(rec.confirmationScore) !== null;
    const scoreCount = [zoneOk, liqOk, amdOk, confOk].filter(Boolean).length;
    fieldScore += (scoreCount / 4) * 2; // max 2 points for scores

    // Optional: pnl
    if (toNumber(rec.pnl) !== null) fieldScore++;

    // Optional: duration
    if (typeof rec.timeInTradeMins === "number" && rec.timeInTradeMins >= 0) fieldScore++;

    // Completeness for this record
    const completeness = Math.min(100, (fieldScore / totalFields) * 100);
    totalCompleteness += completeness;

    // Only a missing outcome makes a record unusable
    const hasOutcome = rec.outcome && VALID_OUTCOMES.has(rec.outcome.toLowerCase());
    if (hasOutcome) {
      usable.push(rec);
    }

    issues.push(...recIssues);
  }

  const usableRecords = usable.length;
  const rejectedRecords = records.length - usableRecords;
  const completenessScore = records.length > 0
    ? Math.round(totalCompleteness / records.length)
    : 0;

  // Dataset-level checks
  if (rejectedRecords > 0) {
    qualityNotes.push(`${rejectedRecords} records excluded (missing outcome)`);
  }

  const pairs = new Set(usable.map(r => (r.pair || "").toUpperCase()));
  if (pairs.size === 0) {
    qualityNotes.push("No valid pairs found in usable records");
  } else if (pairs.size === 1) {
    qualityNotes.push(`Only 1 pair present: ${[...pairs][0]} — cross-pair analysis unavailable`);
  }

  const withRegime = usable.filter(r => r.regime).length;
  if (withRegime < usable.length * 0.5) {
    qualityNotes.push(`Only ${withRegime}/${usable.length} records have regime data — regime analysis limited`);
    issues.push({ field: "regime", message: `Sparse regime data (${withRegime}/${usable.length})`, severity: "info" });
  }

  const withRR = usable.filter(r => toNumber(r.riskRewardActual) !== null).length;
  if (withRR < usable.length * 0.5) {
    qualityNotes.push(`Only ${withRR}/${usable.length} records have actual R:R — RR metrics may be imprecise`);
    issues.push({ field: "riskRewardActual", message: `Sparse RR data (${withRR}/${usable.length})`, severity: "warning" });
  }

  if (usableRecords < MIN_SAMPLE_FOR_DEGRADED) {
    issues.push({ field: "sampleSize", message: `Only ${usableRecords} usable records — below minimum (${MIN_SAMPLE_FOR_DEGRADED})`, severity: "error" });
  } else if (usableRecords < MIN_SAMPLE_FOR_PASSED) {
    issues.push({ field: "sampleSize", message: `${usableRecords} usable records — below recommended minimum (${MIN_SAMPLE_FOR_PASSED}) for full analysis`, severity: "warning" });
  }

  const hasErrors = issues.some(i => i.severity === "error");
  const isValid = usableRecords >= MIN_SAMPLE_FOR_DEGRADED && !hasErrors;

  return {
    isValid,
    totalRecords: records.length,
    usableRecords,
    rejectedRecords,
    completenessScore,
    issues,
    qualityNotes,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function toNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = typeof val === "number" ? val : Number(val);
  return isFinite(n) ? n : null;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!denominator || !isFinite(denominator)) return fallback;
  const r = numerator / denominator;
  return isFinite(r) ? r : fallback;
}
