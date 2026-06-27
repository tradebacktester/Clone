import type { Pair, Timeframe } from "../types.js";
import type { Candle, FetchResult, DateRange } from "./providers/base.js";
import { BAR_MS, expectedBarCount } from "./providers/base.js";

export type DataGrade = "A" | "B" | "C" | "D" | "F";

export interface DataQualityScore {
  pair: Pair;
  timeframe: Timeframe;
  provider: string;
  requestedStart: Date;
  requestedEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;

  // Coverage
  totalExpectedBars: number;
  actualBars: number;
  missingBars: number;
  coveragePct: number;

  // Gaps
  gaps: DateRange[];
  gapCount: number;
  largestGapDays: number;

  // Integrity
  ohlcViolations: number;   // h < l, h < o, h < c, l > o, l > c
  zeroPriceCount: number;
  duplicateCount: number;
  integrityScore: number;   // 0–100

  // Overall
  overallScore: number;     // 0–100
  grade: DataGrade;
  warnings: string[];
  notes: string[];
  disabledForValidation: boolean;
  disabledReason: string | null;
}

const MIN_COVERAGE_TO_VALIDATE = 40; // % — below this, validation is disabled

export function computeDataQuality(
  pair: Pair,
  tf: Timeframe,
  result: FetchResult,
): DataQualityScore {
  const { candles, gaps, provider, requestedStart, requestedEnd, warnings: provWarnings, notes: provNotes } = result;

  const totalExpected = expectedBarCount(tf, requestedStart, requestedEnd);
  const actualBars = candles.length;
  const missingBars = Math.max(0, totalExpected - actualBars);
  const coveragePct = totalExpected > 0 ? Math.min(100, (actualBars / totalExpected) * 100) : 0;

  // Gap analysis
  const gapCount = gaps.length;
  let largestGapMs = 0;
  for (const g of gaps) {
    const gapMs = g.end.getTime() - g.start.getTime();
    if (gapMs > largestGapMs) largestGapMs = gapMs;
  }
  const largestGapDays = largestGapMs / (24 * 60 * 60 * 1000);

  // OHLC integrity checks
  let ohlcViolations = 0;
  let zeroPriceCount = 0;
  const seenTimes = new Set<number>();
  let duplicateCount = 0;

  for (const c of candles) {
    const t = c.time.getTime();
    if (seenTimes.has(t)) { duplicateCount++; continue; }
    seenTimes.add(t);

    if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) { zeroPriceCount++; continue; }
    if (
      c.high < c.low ||
      c.high < c.open || c.high < c.close ||
      c.low > c.open || c.low > c.close
    ) ohlcViolations++;
  }

  // Integrity score (0–100)
  const violationRate = actualBars > 0
    ? ((ohlcViolations + zeroPriceCount + duplicateCount) / actualBars) * 100 : 0;
  const integrityScore = Math.max(0, Math.round(100 - violationRate * 10));

  // Coverage score (0–100)
  const coverageScore = Math.round(coveragePct);

  // Gap penalty
  const gapPenalty = Math.min(30, gapCount * 5 + (largestGapDays > 30 ? 10 : 0));

  // Overall score
  const overallScore = Math.max(0, Math.round(
    coverageScore * 0.6 + integrityScore * 0.3 - gapPenalty * 0.1,
  ));

  const grade: DataGrade =
    overallScore >= 90 ? "A" :
    overallScore >= 75 ? "B" :
    overallScore >= 55 ? "C" :
    overallScore >= 35 ? "D" : "F";

  const warnings: string[] = [...provWarnings];
  const notes: string[] = [...provNotes];

  if (coveragePct < MIN_COVERAGE_TO_VALIDATE) {
    warnings.push(`Coverage is ${coveragePct.toFixed(1)}% — below the ${MIN_COVERAGE_TO_VALIDATE}% minimum for validation`);
  }
  if (ohlcViolations > 0) warnings.push(`${ohlcViolations} candles have OHLC integrity violations`);
  if (duplicateCount > 0) warnings.push(`${duplicateCount} duplicate timestamps detected and removed`);
  if (gapCount > 10) warnings.push(`${gapCount} data gaps detected — check data continuity`);
  if (largestGapDays > 7) warnings.push(`Largest gap is ${largestGapDays.toFixed(0)} days`);

  if (tf === "15m") notes.push("15M data is strictly real — no synthesis. Validation only covers periods with actual data.");

  const disabledForValidation = coveragePct < MIN_COVERAGE_TO_VALIDATE;
  const disabledReason = disabledForValidation
    ? `Insufficient data: ${coveragePct.toFixed(1)}% coverage (minimum ${MIN_COVERAGE_TO_VALIDATE}%). Obtain data from a provider that supports this pair+timeframe+period.`
    : null;

  return {
    pair,
    timeframe: tf,
    provider,
    requestedStart,
    requestedEnd,
    actualStart: result.actualStart,
    actualEnd: result.actualEnd,
    totalExpectedBars: totalExpected,
    actualBars,
    missingBars,
    coveragePct: parseFloat(coveragePct.toFixed(2)),
    gaps,
    gapCount,
    largestGapDays: parseFloat(largestGapDays.toFixed(2)),
    ohlcViolations,
    zeroPriceCount,
    duplicateCount,
    integrityScore,
    overallScore,
    grade,
    warnings,
    notes,
    disabledForValidation,
    disabledReason,
  };
}

/** Format the data quality score for embedding in reports. */
export function formatQualityBlock(q: DataQualityScore): string {
  const gradeEmoji = { A: "✅", B: "✅", C: "⚠️", D: "⚠️", F: "❌" }[q.grade];
  const disabled = q.disabledForValidation ? "\n> ⛔ **VALIDATION DISABLED** — " + q.disabledReason : "";
  return `
| Field | Value |
|-------|-------|
| Provider | ${q.provider} |
| Coverage | ${q.coveragePct.toFixed(1)}% (${q.actualBars.toLocaleString()} / ${q.totalExpectedBars.toLocaleString()} bars) |
| Period | ${q.actualStart?.toISOString().slice(0, 10) ?? "N/A"} → ${q.actualEnd?.toISOString().slice(0, 10) ?? "N/A"} |
| Missing Bars | ${q.missingBars.toLocaleString()} |
| Gaps | ${q.gapCount} (largest: ${q.largestGapDays.toFixed(1)} days) |
| OHLC Violations | ${q.ohlcViolations} |
| Duplicates | ${q.duplicateCount} |
| Integrity Score | ${q.integrityScore}/100 |
| **Overall Score** | **${q.overallScore}/100 — Grade ${q.grade} ${gradeEmoji}** |
${disabled}`.trim();
}
