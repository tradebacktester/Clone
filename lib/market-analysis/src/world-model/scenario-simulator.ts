// ─── Scenario Simulator ───────────────────────────────────────────────────────
// Answers "what historically happens to Y when X changes by Z?" using stored
// feature data. Purely observational — does not generate trading signals.
// All output is statistical / historical in nature.

import type {
  ScenarioQuery,
  ScenarioResult,
  ScenarioEvidenceItem,
  WorldModelFeatureRow,
  WorldModelComponent,
} from "./types.js";

// ─── Component Value Extractor ────────────────────────────────────────────────

function getComponentValue(row: WorldModelFeatureRow, comp: WorldModelComponent): number {
  switch (comp) {
    case "regime": {
      const map: Record<string, number> = { trending: 1, volatile: 0.7, ranging: 0.3, low_volatility: 0.1 };
      return map[row.marketRegime?.toLowerCase() ?? ""] ?? 0.5;
    }
    case "trend": {
      const map: Record<string, number> = { bullish: 1, bearish: 0, sideways: 0.5, neutral: 0.5, unknown: 0.5 };
      return map[row.trend?.toLowerCase() ?? ""] ?? 0.5;
    }
    case "volatility": {
      const map: Record<string, number> = { low: 0.1, medium: 0.5, high: 1.0 };
      return map[row.volatility?.toLowerCase() ?? ""] ?? 0.5;
    }
    case "liquidity": return row.liquidityScore / 100;
    case "spread":    return Math.min(1, row.spreadPips / 30);
    case "supply_demand": return (row.supplyQuality + row.demandQuality) / 200;
    case "amd_completion": return row.amdScore / 100;
    case "confirmation_quality": return row.confirmationQuality / 100;
    case "session": {
      const map: Record<string, number> = { london: 0.9, new_york: 0.85, overlap: 1.0, asian: 0.4, sydney: 0.3 };
      return map[row.session?.toLowerCase() ?? ""] ?? 0.5;
    }
    case "liquidity_sweeps": return row.liquidityScore > 70 ? 0.8 : 0.3;
    case "market_structure": return row.setupScore / 100;
    case "correlation": return 0.5; // not in feature rows
    case "news":        return 0.5; // not in feature rows
    default: return 0.5;
  }
}

// ─── Standard Deviation ───────────────────────────────────────────────────────

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ─── Scenario Runners ─────────────────────────────────────────────────────────

interface SimulationBucket {
  triggerRows: WorldModelFeatureRow[];
  responses: number[];
}

/**
 * Groups rows into "high trigger" and "low trigger" buckets based on the
 * trigger component value, then compares the affected component values.
 */
function runBucketSimulation(
  features: WorldModelFeatureRow[],
  query: ScenarioQuery,
): { bucket: SimulationBucket; label: string } {
  const triggerValues = features.map(f => getComponentValue(f, query.triggerComponent));
  const sortedTrigger = [...triggerValues].sort((a, b) => a - b);
  const p75 = sortedTrigger[Math.floor(sortedTrigger.length * 0.75)];

  // "High trigger" = trigger value above 75th percentile (approximates +20% change)
  const threshold = query.triggerMagnitude > 0 ? p75 : sortedTrigger[Math.floor(sortedTrigger.length * 0.25)];

  const filtered = features.filter((_f, i) =>
    query.triggerMagnitude > 0 ? triggerValues[i] >= threshold : triggerValues[i] <= threshold,
  );

  return {
    bucket: {
      triggerRows: filtered,
      responses: filtered.map(f => getComponentValue(f, query.affectedComponent)),
    },
    label: query.triggerMagnitude > 0 ? "high" : "low",
  };
}

function buildNarrative(query: ScenarioQuery, result: ScenarioResult): string {
  const direction = query.triggerMagnitude > 0 ? "increases" : "decreases";
  const pct = Math.abs(query.triggerMagnitude);
  const affName = query.affectedComponent.replace("_", " ");
  const trigName = query.triggerComponent.replace("_", " ");
  const conf = result.confidence.toFixed(0);
  const n = result.sampleSize;
  const mean = result.historicalResponseMean.toFixed(3);
  const std = result.historicalResponseStd.toFixed(3);

  if (n < 5) {
    return (
      `Insufficient historical data to simulate what happens to ${affName} when ${trigName} ${direction} by ${pct}%. ` +
      `At least 5 samples required; only ${n} found.`
    );
  }

  const confidenceLabel = Number(conf) >= 70 ? "high confidence" : Number(conf) >= 50 ? "moderate confidence" : "low confidence";

  return (
    `When ${trigName} ${direction} by ~${pct}%, historical data (n=${n}) shows that ${affName} ` +
    `has a mean normalised response of ${mean} (±${std}), ` +
    `ranging from ${result.historicalResponseMin.toFixed(3)} to ${result.historicalResponseMax.toFixed(3)}. ` +
    `This relationship is detected with ${confidenceLabel} (${conf}/100). ` +
    `Response typically manifests within ~${result.responseTimeBars.toFixed(0)} bars. ` +
    `This is an observational simulation only — it does not generate trading signals.`
  );
}

// ─── Main Simulator ───────────────────────────────────────────────────────────

export function runScenario(
  features: WorldModelFeatureRow[],
  query: ScenarioQuery,
): ScenarioResult {
  const now = new Date();

  if (features.length < 5) {
    return {
      query,
      historicalResponseMean: 0,
      historicalResponseStd: 0,
      historicalResponseMin: 0,
      historicalResponseMax: 0,
      sampleSize: features.length,
      confidence: 0,
      responseTimeBars: 0,
      narrativeExplanation: "Insufficient data for simulation.",
      evidenceBreakdown: [],
      computedAt: now,
    };
  }

  const { bucket } = runBucketSimulation(features, query);
  const responses = bucket.responses;
  const n = responses.length;

  if (n < 3) {
    return {
      query,
      historicalResponseMean: 0,
      historicalResponseStd: 0,
      historicalResponseMin: 0,
      historicalResponseMax: 0,
      sampleSize: n,
      confidence: 0,
      responseTimeBars: 0,
      narrativeExplanation: "Insufficient matching scenarios in historical data.",
      evidenceBreakdown: [],
      computedAt: now,
    };
  }

  const mean = responses.reduce((a, b) => a + b, 0) / n;
  const std = stdDev(responses);
  const min = Math.min(...responses);
  const max = Math.max(...responses);

  // Confidence: sample size + consistency (low std = consistent response)
  const consistency = Math.max(0, 1 - std / (max - min + 1e-6));
  const confidence = Math.min(95, 30 + (n / 30) * 40 + consistency * 25);

  // Response time: rough estimate — high-trigger sessions tend to respond quickly
  const avgSession = bucket.triggerRows
    .map(r => {
      const map: Record<string, number> = { london: 4, new_york: 4, overlap: 2, asian: 8, sydney: 12 };
      return map[r.session?.toLowerCase() ?? ""] ?? 6;
    })
    .reduce((a, b) => a + b, 0) / Math.max(n, 1);

  // Evidence items — sample up to 8
  const step = Math.max(1, Math.floor(bucket.triggerRows.length / 8));
  const evidenceBreakdown: ScenarioEvidenceItem[] = bucket.triggerRows
    .filter((_, i) => i % step === 0)
    .slice(0, 8)
    .map((row, idx) => ({
      pair: row.pair,
      session: row.session,
      triggerValue: parseFloat(getComponentValue(row, query.triggerComponent).toFixed(4)),
      responseValue: parseFloat(responses[idx] ?? 0),
      responseBars: Math.round(avgSession),
      weight: 1,
    }));

  const result: ScenarioResult = {
    query,
    historicalResponseMean: parseFloat(mean.toFixed(4)),
    historicalResponseStd: parseFloat(std.toFixed(4)),
    historicalResponseMin: parseFloat(min.toFixed(4)),
    historicalResponseMax: parseFloat(max.toFixed(4)),
    sampleSize: n,
    confidence: parseFloat(confidence.toFixed(2)),
    responseTimeBars: parseFloat(avgSession.toFixed(1)),
    narrativeExplanation: "",
    evidenceBreakdown,
    computedAt: now,
  };

  result.narrativeExplanation = buildNarrative(query, result);
  return result;
}

// ─── Predefined Scenarios ─────────────────────────────────────────────────────

export const PREDEFINED_SCENARIOS: ScenarioQuery[] = [
  {
    scenarioType: "volatility_impact",
    triggerComponent: "volatility",
    triggerMagnitude: 20,
    affectedComponent: "liquidity",
  },
  {
    scenarioType: "volatility_impact",
    triggerComponent: "volatility",
    triggerMagnitude: 20,
    affectedComponent: "spread",
  },
  {
    scenarioType: "correlation_shift",
    triggerComponent: "correlation",
    triggerMagnitude: -20,
    affectedComponent: "trend",
  },
  {
    scenarioType: "regime_transition",
    triggerComponent: "regime",
    triggerMagnitude: 30,
    affectedComponent: "confirmation_quality",
  },
  {
    scenarioType: "liquidity_shock",
    triggerComponent: "liquidity",
    triggerMagnitude: -30,
    affectedComponent: "spread",
  },
  {
    scenarioType: "news_event",
    triggerComponent: "news",
    triggerMagnitude: 50,
    affectedComponent: "volatility",
  },
  {
    scenarioType: "news_event",
    triggerComponent: "news",
    triggerMagnitude: 50,
    affectedComponent: "spread",
  },
  {
    scenarioType: "session_change",
    triggerComponent: "session",
    triggerMagnitude: 30,
    affectedComponent: "liquidity",
  },
];

export function runAllPredefinedScenarios(
  features: WorldModelFeatureRow[],
): ScenarioResult[] {
  return PREDEFINED_SCENARIOS.map(q => runScenario(features, q));
}
