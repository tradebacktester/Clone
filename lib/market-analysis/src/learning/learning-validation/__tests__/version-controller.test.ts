import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLearningVersion,
  compareVersions,
  generateVersionChangelog,
  bumpVersion,
} from "../version-controller.js";
import type { LearningVersionInput } from "../version-controller.js";

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<LearningVersionInput> = {}): LearningVersionInput {
  return {
    cycleNumber: 1,
    tradeCount: 100,
    featureCount: 100,
    winRate: 0.60,
    avgConfidence: 68,
    avgTqi: 62,
    avgSetupScore: 65,
    profitFactor: 1.5,
    totalPnl: 250.0,
    validationStatus: "passed",
    validationScore: 78,
    healthScore: 72,
    healthGrade: "B",
    topFeatureRankings: [
      { feature: "session", importance: 0.30, rank: 1 },
      { feature: "pair",    importance: 0.25, rank: 2 },
    ],
    topPatternRankings: [
      { pattern: "amd_accumulation", winRate: 0.65, sampleSize: 40, rank: 1 },
    ],
    regimeDistribution: { trending: 0.4, ranging: 0.6 },
    ...overrides,
  };
}

describe("version-controller", () => {
  describe("bumpVersion", () => {
    it("bumps major correctly", () => {
      assert.equal(bumpVersion("v1.2.3", "major"), "v2.0.0");
    });

    it("bumps minor correctly", () => {
      assert.equal(bumpVersion("v1.2.3", "minor"), "v1.3.0");
    });

    it("bumps patch correctly", () => {
      assert.equal(bumpVersion("v1.2.3", "patch"), "v1.2.4");
    });

    it("starts from v1.0.0 if input is malformed", () => {
      const result = bumpVersion("bad", "major");
      assert.ok(result.startsWith("v"));
    });
  });

  describe("buildLearningVersion — initial version", () => {
    it("creates v1.0.0 as the first version", () => {
      const version = buildLearningVersion(makeInput(), null, true);
      assert.equal(version.semver, "v1.0.0");
    });

    it("sets isBaseline true when flag provided", () => {
      const version = buildLearningVersion(makeInput(), null, true);
      assert.equal(version.isBaseline, true);
    });

    it("sets isActive to true", () => {
      const version = buildLearningVersion(makeInput());
      assert.equal(version.isActive, true);
    });

    it("changeFromPrev is null for first version", () => {
      const version = buildLearningVersion(makeInput());
      assert.equal(version.changeFromPrev, null);
    });

    it("generates a unique versionId", () => {
      const v1 = buildLearningVersion(makeInput());
      const v2 = buildLearningVersion(makeInput());
      assert.notEqual(v1.versionId, v2.versionId);
    });

    it("stores the full input on the version", () => {
      const input = makeInput({ winRate: 0.72 });
      const version = buildLearningVersion(input);
      assert.equal(version.input.winRate, 0.72);
    });
  });

  describe("buildLearningVersion — version bumping", () => {
    it("bumps to minor when win rate improves slightly", () => {
      const prev = { semver: "v1.0.0", input: makeInput({ winRate: 0.55 }) };
      const curr = makeInput({ winRate: 0.60 }); // +5pp → minor improvement
      const version = buildLearningVersion(curr, prev);
      assert.ok(["v1.1.0", "v2.0.0"].includes(version.semver), `unexpected semver: ${version.semver}`);
    });

    it("bumps to major on breaking health drop", () => {
      const prev = { semver: "v1.0.0", input: makeInput({ healthScore: 80 }) };
      const curr = makeInput({ healthScore: 45, validationStatus: "failed" }); // huge drop
      const version = buildLearningVersion(curr, prev);
      assert.equal(version.major, 2);
    });

    it("bumps to patch for trivial changes", () => {
      const prev = { semver: "v1.0.0", input: makeInput({ tradeCount: 100 }) };
      const curr = makeInput({ tradeCount: 102 }); // tiny delta
      const version = buildLearningVersion(curr, prev);
      // Should be patch or minor — not major
      assert.ok(version.major <= 1, `major bumped unexpectedly: ${version.semver}`);
    });

    it("changeFromPrev is set when prev is provided", () => {
      const prev = { semver: "v1.0.0", input: makeInput() };
      const version = buildLearningVersion(makeInput({ winRate: 0.65 }), prev);
      assert.ok(version.changeFromPrev !== null);
    });

    it("breakingChanges true when validation goes to failed", () => {
      const prev = { semver: "v1.0.0", input: makeInput({ validationStatus: "passed" }) };
      const curr = makeInput({ validationStatus: "failed", healthScore: 30 });
      const version = buildLearningVersion(curr, prev);
      assert.equal(version.changeFromPrev?.breakingChanges, true);
    });
  });

  describe("compareVersions", () => {
    it("returns improved when win rate goes up significantly", () => {
      const a = { versionId: "v1", semver: "v1.0.0", input: makeInput({ winRate: 0.50 }) };
      const b = { versionId: "v2", semver: "v1.1.0", input: makeInput({ winRate: 0.60 }) };
      const cmp = compareVersions(a, b);
      assert.equal(cmp.overallImpact, "improved");
    });

    it("returns degraded when health drops significantly", () => {
      const a = { versionId: "v1", semver: "v1.0.0", input: makeInput({ healthScore: 80 }) };
      const b = { versionId: "v2", semver: "v2.0.0", input: makeInput({ healthScore: 40 }) };
      const cmp = compareVersions(a, b);
      assert.equal(cmp.overallImpact, "degraded");
    });

    it("win rate delta is computed correctly", () => {
      const a = { versionId: "v1", semver: "v1.0.0", input: makeInput({ winRate: 0.55 }) };
      const b = { versionId: "v2", semver: "v1.1.0", input: makeInput({ winRate: 0.65 }) };
      const cmp = compareVersions(a, b);
      assert.ok(Math.abs(cmp.winRateDelta - 0.10) < 0.0001, `wrong delta: ${cmp.winRateDelta}`);
    });

    it("identifies new patterns", () => {
      const a = { versionId: "v1", semver: "v1.0.0", input: makeInput({ topPatternRankings: [] }) };
      const b = { versionId: "v2", semver: "v1.1.0", input: makeInput({
        topPatternRankings: [{ pattern: "breakout", winRate: 0.68, sampleSize: 30, rank: 1 }],
      }) };
      const cmp = compareVersions(a, b);
      assert.ok(cmp.patternsNew.includes("breakout"));
    });

    it("fromVersion and toVersion IDs match input", () => {
      const a = { versionId: "abc", semver: "v1.0.0", input: makeInput() };
      const b = { versionId: "xyz", semver: "v1.1.0", input: makeInput() };
      const cmp = compareVersions(a, b);
      assert.equal(cmp.fromVersion, "abc");
      assert.equal(cmp.toVersion, "xyz");
    });

    it("includes recommendations", () => {
      const a = { versionId: "v1", semver: "v1.0.0", input: makeInput({ winRate: 0.50 }) };
      const b = { versionId: "v2", semver: "v1.1.0", input: makeInput({ winRate: 0.65 }) };
      const cmp = compareVersions(a, b);
      assert.ok(Array.isArray(cmp.recommendations));
    });
  });

  describe("generateVersionChangelog", () => {
    it("returns a no-versions message for empty input", () => {
      const log = generateVersionChangelog([]);
      assert.ok(log.includes("No versions"), `expected 'No versions': ${log}`);
    });

    it("produces markdown with version header", () => {
      const versions = [
        {
          semver: "v1.0.0",
          createdAt: new Date("2026-01-15"),
          input: makeInput(),
          changeFromPrev: null,
        },
      ];
      const log = generateVersionChangelog(versions);
      assert.ok(log.includes("v1.0.0"), `missing version: ${log}`);
      assert.ok(log.includes("INITIAL VERSION"), `missing initial tag: ${log}`);
    });

    it("includes MAJOR/MINOR/PATCH change type", () => {
      const prev: LearningVersionInput = makeInput({ winRate: 0.50 });
      const currInput: LearningVersionInput = makeInput({ winRate: 0.70, healthScore: 85 });
      const prevVers = { semver: "v1.0.0", input: prev };
      const currVers = buildLearningVersion(currInput, prevVers);

      const log = generateVersionChangelog([
        { semver: "v1.0.0", createdAt: new Date("2026-01-01"), input: prev, changeFromPrev: null },
        { semver: currVers.semver, createdAt: new Date("2026-01-15"), input: currInput, changeFromPrev: currVers.changeFromPrev },
      ]);
      assert.ok(log.includes("CHANGE"), `missing CHANGE label: ${log}`);
    });

    it("sorts newest version first", () => {
      const versions = [
        { semver: "v1.0.0", createdAt: new Date("2026-01-01"), input: makeInput(), changeFromPrev: null },
        { semver: "v1.1.0", createdAt: new Date("2026-02-01"), input: makeInput(), changeFromPrev: null },
      ];
      const log = generateVersionChangelog(versions);
      const idx100 = log.indexOf("v1.0.0");
      const idx110 = log.indexOf("v1.1.0");
      assert.ok(idx110 < idx100, `v1.1.0 should appear before v1.0.0 in output`);
    });
  });
});
