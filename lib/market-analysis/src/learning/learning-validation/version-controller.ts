// ─── Learning Version Controller ──────────────────────────────────────────────
// Phase 4 Enhancement: Semantic versioning for every learning cycle.
// ADVISORY ONLY — versioning is metadata only; no strategy modification.
//
// Versioning scheme:
//   MAJOR — breaking change: methodology, feature schema, or >10% metric degradation
//   MINOR — new features, new patterns, improved validation, better metrics
//   PATCH — re-run of same cycle, minor recalibration, data refresh
//
// Provides:
//   - buildLearningVersion(): create a new version snapshot
//   - compareVersions(): diff two version snapshots
//   - generateVersionChangelog(): human-readable changelog
//   - bumpVersion(): compute next semantic version

import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LearningVersionInput {
  cycleId?: string;
  cycleNumber: number;
  scheduleType?: string;
  dataFromDate?: Date;
  dataToDate?: Date;
  tradeCount: number;
  featureCount: number;

  // Performance metrics
  winRate: number;
  avgConfidence: number;
  avgTqi: number;
  avgSetupScore: number;
  profitFactor: number;
  totalPnl: number;

  // Validation
  validationStatus: "passed" | "degraded" | "failed";
  validationScore: number;

  // Health
  healthScore: number;
  healthGrade: string;

  // Rankings (top 5 each)
  topFeatureRankings: VersionFeatureRanking[];
  topPatternRankings: VersionPatternRanking[];
  regimeDistribution: Record<string, number>;

  // Optional notes
  changelogNotes?: string;
  versionTag?: string; // "stable" | "experimental" | "baseline" | "milestone"
}

export interface VersionFeatureRanking {
  feature: string;
  importance: number;
  rank: number;
}

export interface VersionPatternRanking {
  pattern: string;
  winRate: number;
  sampleSize: number;
  rank: number;
}

export interface VersionChange {
  winRateDelta: number;
  confidenceDelta: number;
  healthScoreDelta: number;
  validationStatusChange: string;
  profitFactorDelta: number;
  newPatternsAdded: number;
  patternsDegraded: number;
  featuresGained: number;
  featuresLost: number;
  tradeCountDelta: number;
  majorChanges: string[];
  breakingChanges: boolean;
  changeType: "major" | "minor" | "patch";
  summary: string;
}

export interface LearningVersion {
  versionId: string;
  semver: string;    // "v1.0.0"
  major: number;
  minor: number;
  patch: number;
  input: LearningVersionInput;
  changeFromPrev: VersionChange | null;
  isBaseline: boolean;
  isActive: boolean;
  createdAt: Date;
}

export interface VersionComparison {
  fromVersion: string;
  toVersion: string;
  fromSemver: string;
  toSemver: string;

  // Metric deltas
  winRateDelta: number;
  confidenceDelta: number;
  healthScoreDelta: number;
  profitFactorDelta: number;
  validationStatusChange: string;
  tradeCountDelta: number;
  featureCountDelta: number;

  // Pattern changes
  patternsImproved: string[];
  patternsDegraded: string[];
  patternsNew: string[];
  patternsRemoved: string[];

  // Feature changes
  featuresGained: string[];
  featuresLost: string[];
  topFeaturesChanged: boolean;

  // Regime changes
  regimeShifts: Record<string, { before: number; after: number }>;

  // Verdict
  overallImpact: "improved" | "stable" | "degraded" | "mixed";
  changeType: "major" | "minor" | "patch";
  breakingChanges: boolean;
  summary: string;
  recommendations: string[];
}

// ─── Semantic Version Bumper ──────────────────────────────────────────────────
// Rules:
//   MAJOR: breakingChanges = true (health score drop >15, validation failed, method change)
//   MINOR: improvement or new patterns/features (minor.+ resets patch to 0)
//   PATCH: re-run, small drift, same result set

export function bumpVersion(
  current: string, // "v1.2.3"
  changeType: "major" | "minor" | "patch",
): string {
  const match = current.replace("v", "").split(".").map(Number);
  const [major, minor, patch] = match.length === 3 ? match : [1, 0, 0];

  if (changeType === "major") return `v${major + 1}.0.0`;
  if (changeType === "minor") return `v${major}.${minor + 1}.0`;
  return `v${major}.${minor}.${patch + 1}`;
}

// ─── Change Classifier ────────────────────────────────────────────────────────

function classifyChange(
  prev: LearningVersionInput,
  curr: LearningVersionInput,
): VersionChange {
  const winRateDelta      = curr.winRate      - prev.winRate;
  const confidenceDelta   = curr.avgConfidence - prev.avgConfidence;
  const healthScoreDelta  = curr.healthScore   - prev.healthScore;
  const profitFactorDelta = curr.profitFactor  - prev.profitFactor;
  const tradeCountDelta   = curr.tradeCount    - prev.tradeCount;
  const validationStatusChange = prev.validationStatus === curr.validationStatus
    ? curr.validationStatus
    : `${prev.validationStatus} → ${curr.validationStatus}`;

  // Pattern comparison
  const prevPatterns = new Set(prev.topPatternRankings.map(p => p.pattern));
  const currPatterns = new Set(curr.topPatternRankings.map(p => p.pattern));
  const newPatternsAdded = [...currPatterns].filter(p => !prevPatterns.has(p)).length;
  const removedPatterns  = [...prevPatterns].filter(p => !currPatterns.has(p)).length;

  // Feature comparison
  const prevFeatures = new Set(prev.topFeatureRankings.map(f => f.feature));
  const currFeatures = new Set(curr.topFeatureRankings.map(f => f.feature));
  const featuresGained = [...currFeatures].filter(f => !prevFeatures.has(f)).length;
  const featuresLost   = [...prevFeatures].filter(f => !currFeatures.has(f)).length;

  // Degraded patterns: same pattern, significantly lower win rate
  let patternsDegraded = 0;
  for (const cp of curr.topPatternRankings) {
    const pp = prev.topPatternRankings.find(p => p.pattern === cp.pattern);
    if (pp && cp.winRate < pp.winRate - 0.10) patternsDegraded++;
  }

  const majorChanges: string[] = [];

  if (healthScoreDelta < -15) {
    majorChanges.push(`Health score dropped significantly: ${healthScoreDelta.toFixed(1)} pts`);
  }
  if (Math.abs(winRateDelta) > 0.10) {
    majorChanges.push(`Win rate changed by ${(winRateDelta * 100).toFixed(1)}pp (${winRateDelta > 0 ? "+" : ""}${(winRateDelta * 100).toFixed(1)}pp)`);
  }
  if (curr.validationStatus === "failed" && prev.validationStatus !== "failed") {
    majorChanges.push("Validation status degraded to FAILED — conclusions are unreliable");
  }
  if (patternsDegraded >= 3) {
    majorChanges.push(`${patternsDegraded} patterns significantly degraded`);
  }
  if (newPatternsAdded >= 3) {
    majorChanges.push(`${newPatternsAdded} new patterns discovered`);
  }

  const breakingChanges = majorChanges.some(m =>
    m.includes("FAILED") || m.includes("significantly") || healthScoreDelta < -20,
  );

  let changeType: VersionChange["changeType"];
  if (breakingChanges || Math.abs(healthScoreDelta) > 20 || Math.abs(winRateDelta) > 0.15) {
    changeType = "major";
  } else if (newPatternsAdded > 0 || featuresGained > 0 || healthScoreDelta > 5 || winRateDelta > 0.03) {
    changeType = "minor";
  } else {
    changeType = "patch";
  }

  const direction = winRateDelta > 0.02 ? "improvement" : winRateDelta < -0.02 ? "degradation" : "stable";
  const summary = majorChanges.length > 0
    ? `${changeType.toUpperCase()} change: ${majorChanges[0]}. ${direction === "improvement" ? "Performance improved." : direction === "degradation" ? "Performance degraded — review advisory outputs." : "Metrics stable."}`
    : `${changeType.toUpperCase()} change: metrics are ${direction}. ${tradeCountDelta > 0 ? `${tradeCountDelta} new trades added.` : ""}`;

  return {
    winRateDelta,
    confidenceDelta,
    healthScoreDelta,
    validationStatusChange,
    profitFactorDelta,
    newPatternsAdded,
    patternsDegraded,
    featuresGained,
    featuresLost,
    tradeCountDelta,
    majorChanges,
    breakingChanges,
    changeType,
    summary,
  };
}

// ─── Version Builder ──────────────────────────────────────────────────────────

export function buildLearningVersion(
  input: LearningVersionInput,
  previousVersion?: { semver: string; input: LearningVersionInput } | null,
  isBaseline = false,
): LearningVersion {
  let semver = "v1.0.0";
  let major = 1, minor = 0, patch = 0;
  let changeFromPrev: VersionChange | null = null;

  if (previousVersion) {
    changeFromPrev = classifyChange(previousVersion.input, input);
    semver = bumpVersion(previousVersion.semver, changeFromPrev.changeType);
    const parts = semver.replace("v", "").split(".").map(Number);
    [major, minor, patch] = parts;
  }

  return {
    versionId: randomUUID(),
    semver,
    major,
    minor,
    patch,
    input,
    changeFromPrev,
    isBaseline,
    isActive: true,
    createdAt: new Date(),
  };
}

// ─── Version Comparison ───────────────────────────────────────────────────────

export function compareVersions(
  versionA: { versionId: string; semver: string; input: LearningVersionInput },
  versionB: { versionId: string; semver: string; input: LearningVersionInput },
): VersionComparison {
  const a = versionA.input;
  const b = versionB.input;

  const winRateDelta       = b.winRate       - a.winRate;
  const confidenceDelta    = b.avgConfidence - a.avgConfidence;
  const healthScoreDelta   = b.healthScore   - a.healthScore;
  const profitFactorDelta  = b.profitFactor  - a.profitFactor;
  const tradeCountDelta    = b.tradeCount    - a.tradeCount;
  const featureCountDelta  = b.featureCount  - a.featureCount;

  const validationStatusChange = a.validationStatus === b.validationStatus
    ? b.validationStatus
    : `${a.validationStatus} → ${b.validationStatus}`;

  // Pattern analysis
  const aPatterns = new Map(a.topPatternRankings.map(p => [p.pattern, p]));
  const bPatterns = new Map(b.topPatternRankings.map(p => [p.pattern, p]));

  const patternsNew = [...bPatterns.keys()].filter(p => !aPatterns.has(p));
  const patternsRemoved = [...aPatterns.keys()].filter(p => !bPatterns.has(p));
  const patternsImproved: string[] = [];
  const patternsDegraded: string[] = [];

  for (const [pattern, bp] of bPatterns) {
    const ap = aPatterns.get(pattern);
    if (!ap) continue;
    if (bp.winRate > ap.winRate + 0.05) patternsImproved.push(pattern);
    if (bp.winRate < ap.winRate - 0.05) patternsDegraded.push(pattern);
  }

  // Feature analysis
  const aFeatures = new Map(a.topFeatureRankings.map(f => [f.feature, f]));
  const bFeatures = new Map(b.topFeatureRankings.map(f => [f.feature, f]));
  const featuresGained  = [...bFeatures.keys()].filter(f => !aFeatures.has(f));
  const featuresLost    = [...aFeatures.keys()].filter(f => !bFeatures.has(f));
  const topFeaturesChanged = featuresGained.length > 0 || featuresLost.length > 0;

  // Regime shifts
  const regimeShifts: Record<string, { before: number; after: number }> = {};
  const allRegimes = new Set([...Object.keys(a.regimeDistribution), ...Object.keys(b.regimeDistribution)]);
  for (const regime of allRegimes) {
    const before = a.regimeDistribution[regime] ?? 0;
    const after  = b.regimeDistribution[regime] ?? 0;
    if (Math.abs(after - before) > 0.05) {
      regimeShifts[regime] = { before, after };
    }
  }

  // Overall impact
  let overallImpact: VersionComparison["overallImpact"];
  const improvements = [winRateDelta > 0.02, healthScoreDelta > 5, profitFactorDelta > 0.1].filter(Boolean).length;
  const degradations  = [winRateDelta < -0.02, healthScoreDelta < -5, profitFactorDelta < -0.1].filter(Boolean).length;

  if (improvements > degradations) overallImpact = "improved";
  else if (degradations > improvements) overallImpact = "degraded";
  else if (improvements === degradations && improvements > 0) overallImpact = "mixed";
  else overallImpact = "stable";

  // Change type
  const breakingChanges = healthScoreDelta < -20 || (b.validationStatus === "failed" && a.validationStatus !== "failed");
  let changeType: VersionComparison["changeType"];
  if (breakingChanges || Math.abs(healthScoreDelta) > 20 || Math.abs(winRateDelta) > 0.15) changeType = "major";
  else if (patternsNew.length > 0 || featuresGained.length > 0 || winRateDelta > 0.03) changeType = "minor";
  else changeType = "patch";

  const recommendations: string[] = [];
  if (overallImpact === "improved") {
    recommendations.push(`${versionB.semver} shows improved metrics. Consider promoting to "stable" tag.`);
  }
  if (patternsDegraded.length > 0) {
    recommendations.push(`${patternsDegraded.length} patterns degraded. Review: ${patternsDegraded.slice(0, 3).join(", ")}.`);
  }
  if (breakingChanges) {
    recommendations.push("Breaking changes detected. Review advisory outputs before relying on new version.");
  }
  if (healthScoreDelta < -10) {
    recommendations.push(`Health score dropped ${Math.abs(healthScoreDelta).toFixed(0)} pts. Investigate root cause before advancing version.`);
  }

  const summary = `Comparing ${versionA.semver} → ${versionB.semver}: ${overallImpact} overall. ` +
    `Win rate: ${winRateDelta > 0 ? "+" : ""}${(winRateDelta * 100).toFixed(1)}pp, ` +
    `health: ${healthScoreDelta > 0 ? "+" : ""}${healthScoreDelta.toFixed(0)} pts. ` +
    `${patternsNew.length > 0 ? `${patternsNew.length} new patterns. ` : ""}` +
    `${patternsDegraded.length > 0 ? `${patternsDegraded.length} patterns degraded.` : ""}`;

  return {
    fromVersion: versionA.versionId,
    toVersion: versionB.versionId,
    fromSemver: versionA.semver,
    toSemver: versionB.semver,
    winRateDelta,
    confidenceDelta,
    healthScoreDelta,
    profitFactorDelta,
    validationStatusChange,
    tradeCountDelta,
    featureCountDelta,
    patternsImproved,
    patternsDegraded,
    patternsNew,
    patternsRemoved,
    featuresGained,
    featuresLost,
    topFeaturesChanged,
    regimeShifts,
    overallImpact,
    changeType,
    breakingChanges,
    summary,
    recommendations,
  };
}

// ─── Changelog Generator ──────────────────────────────────────────────────────

export function generateVersionChangelog(
  versions: Array<{ semver: string; createdAt: Date; input: LearningVersionInput; changeFromPrev: VersionChange | null }>,
): string {
  if (versions.length === 0) return "# Learning Version Changelog\n\nNo versions recorded yet.\n";

  const sorted = [...versions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const lines: string[] = [
    "# Learning Version Changelog",
    "",
    `Total versions: ${sorted.length}`,
    `Latest: ${sorted[0].semver} (${sorted[0].createdAt.toISOString().split("T")[0]})`,
    "",
    "---",
    "",
  ];

  for (const v of sorted) {
    lines.push(`## ${v.semver} — ${v.createdAt.toISOString().split("T")[0]}`);
    lines.push(`- Trades: ${v.input.tradeCount} | Features: ${v.input.featureCount}`);
    lines.push(`- Win rate: ${(v.input.winRate * 100).toFixed(1)}% | Avg confidence: ${v.input.avgConfidence.toFixed(0)}/100`);
    lines.push(`- Health score: ${v.input.healthScore.toFixed(0)}/100 (${v.input.healthGrade}) | Validation: ${v.input.validationStatus}`);
    lines.push(`- Schedule: ${v.input.scheduleType ?? "manual"}`);
    if (v.input.versionTag) lines.push(`- Tag: \`${v.input.versionTag}\``);

    if (v.changeFromPrev) {
      const c = v.changeFromPrev;
      lines.push(`- **${c.changeType.toUpperCase()} CHANGE**: ${c.summary}`);
      if (c.majorChanges.length > 0) {
        for (const mc of c.majorChanges) {
          lines.push(`  - ⚠️ ${mc}`);
        }
      }
    } else {
      lines.push("- **INITIAL VERSION**");
    }

    if (v.input.changelogNotes) {
      lines.push(`- Notes: ${v.input.changelogNotes}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}
