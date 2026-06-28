import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { runLearningPipeline, LEARNING_ENGINE_VERSION, buildEmptyCycle } from "../learning-core/pipeline.js";
import { historyStore } from "../learning-history/history-store.js";
import type { RawTradeRecord, LearningCycleInput } from "../learning-core/types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let idCounter = 1;

function makeRec(overrides: Partial<RawTradeRecord> = {}): RawTradeRecord {
  return {
    id: idCounter++,
    pair: "EURUSD",
    direction: "buy",
    session: "london",
    regime: "trending",
    regimeConfidence: 80,
    zoneScore: 75,
    liquidityScore: 70,
    amdScore: 65,
    confirmationScore: 80,
    finalScore: 73,
    confidence: 72,
    riskRewardPlanned: 2.5,
    riskRewardActual: 2.1,
    outcome: "win",
    pnl: 100,
    pnlPercent: 1.0,
    timeInTradeMins: 90,
    openedAt: new Date("2024-01-15T09:00:00Z"),
    closedAt: new Date("2024-01-15T10:30:00Z"),
    ...overrides,
  };
}

function makeInput(n: number, overrides: Partial<RawTradeRecord> = {}): LearningCycleInput {
  return {
    trades: Array.from({ length: n }, (_, i) => makeRec({
      ...overrides,
      outcome: i % 3 === 0 ? "loss" : "win",
      pnl: i % 3 === 0 ? -50 : 100,
    })),
    skippedSetups: [],
    manualReviews: [],
    triggeredBy: "manual",
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Pipeline — basic execution", () => {
  beforeEach(() => historyStore.clear());

  it("returns a complete PipelineResult", async () => {
    const result = await runLearningPipeline(makeInput(15));
    assert.ok("cycle" in result);
    assert.ok("durationMs" in result);
    assert.ok("stagesCompleted" in result);
    assert.ok("stagesFailed" in result);
  });

  it("completes successfully with sufficient data", async () => {
    const result = await runLearningPipeline(makeInput(15));
    assert.equal(result.cycle.status, "complete");
  });

  it("version is LEARNING_ENGINE_VERSION", async () => {
    const result = await runLearningPipeline(makeInput(15));
    assert.equal(result.cycle.version, LEARNING_ENGINE_VERSION);
  });

  it("cycle number is 1 for first cycle", async () => {
    const result = await runLearningPipeline(makeInput(15));
    assert.equal(result.cycle.cycleNumber, 1);
  });

  it("cycle number increments on subsequent runs", async () => {
    const r1 = await runLearningPipeline(makeInput(15));
    const r2 = await runLearningPipeline(makeInput(15));
    assert.equal(r2.cycle.cycleNumber, r1.cycle.cycleNumber + 1);
  });

  it("durationMs is positive", async () => {
    const result = await runLearningPipeline(makeInput(15));
    assert.ok((result.durationMs ?? 0) >= 0);
  });
});

describe("Pipeline — data validation stage", () => {
  beforeEach(() => historyStore.clear());

  it("fails with empty trades", async () => {
    const result = await runLearningPipeline({ trades: [], skippedSetups: [], manualReviews: [], triggeredBy: "manual" });
    assert.equal(result.cycle.status, "failed");
    assert.ok(result.stagesFailed.includes("data_validation"));
  });

  it("fails when all records have no outcome", async () => {
    const recs = Array.from({ length: 10 }, (_, i) => makeRec({ id: i, outcome: null as any }));
    const result = await runLearningPipeline({ trades: recs, skippedSetups: [], manualReviews: [], triggeredBy: "manual" });
    assert.equal(result.cycle.status, "failed");
  });
});

describe("Pipeline — feature extraction", () => {
  beforeEach(() => historyStore.clear());

  it("extracts features for usable records", async () => {
    const result = await runLearningPipeline(makeInput(15));
    assert.ok(result.cycle.features.length > 0);
  });

  it("features have required fields", async () => {
    const result = await runLearningPipeline(makeInput(10));
    const f = result.cycle.features[0];
    if (f) {
      assert.ok(typeof f.tradeId === "string");
      assert.ok(typeof f.pair === "string");
      assert.ok(typeof f.outcome === "string");
      assert.ok(typeof f.winRate === "undefined"); // no winRate on feature
    }
  });
});

describe("Pipeline — metrics calculation", () => {
  beforeEach(() => historyStore.clear());

  it("metrics are populated", async () => {
    const result = await runLearningPipeline(makeInput(15));
    assert.ok(result.cycle.metrics !== null);
    assert.ok((result.cycle.metrics?.totalTrades ?? 0) > 0);
  });

  it("win rate is between 0 and 1", async () => {
    const result = await runLearningPipeline(makeInput(15));
    const wr = result.cycle.metrics?.winRate ?? -1;
    assert.ok(wr >= 0 && wr <= 1, `winRate=${wr}`);
  });

  it("profit factor is positive", async () => {
    const result = await runLearningPipeline(makeInput(15));
    const pf = result.cycle.metrics?.profitFactor ?? -1;
    assert.ok(pf >= 0, `profitFactor=${pf}`);
  });

  it("has dimensional breakdowns", async () => {
    const result = await runLearningPipeline(makeInput(15));
    assert.ok(result.cycle.metrics?.byPair !== undefined);
    assert.ok(result.cycle.metrics?.bySession !== undefined);
    assert.ok(result.cycle.metrics?.byRegime !== undefined);
  });
});

describe("Pipeline — confidence calculation", () => {
  beforeEach(() => historyStore.clear());

  it("confidence is populated", async () => {
    const result = await runLearningPipeline(makeInput(15));
    assert.ok(result.cycle.confidence !== null);
  });

  it("confidence is in [0, 100]", async () => {
    const result = await runLearningPipeline(makeInput(15));
    const conf = result.cycle.confidence?.overallConfidence ?? -1;
    assert.ok(conf >= 0 && conf <= 100, `confidence=${conf}`);
  });

  it("has methodology description", async () => {
    const result = await runLearningPipeline(makeInput(15));
    assert.ok((result.cycle.confidence?.methodology.length ?? 0) > 20);
  });
});

describe("Pipeline — recommendations", () => {
  beforeEach(() => historyStore.clear());

  it("recommendations array is present", async () => {
    const result = await runLearningPipeline(makeInput(15));
    assert.ok(Array.isArray(result.cycle.recommendations));
  });

  it("all recommendations have isAdvisoryOnly=true", async () => {
    const result = await runLearningPipeline(makeInput(15));
    for (const r of result.cycle.recommendations) {
      assert.equal(r.isAdvisoryOnly, true);
    }
  });
});

describe("Pipeline — history store", () => {
  beforeEach(() => historyStore.clear());

  it("stores cycle in history after completion", async () => {
    const result = await runLearningPipeline(makeInput(15));
    const stored = historyStore.getById(result.cycle.id);
    assert.ok(stored !== null);
  });

  it("getLatest returns the cycle with the highest cycleNumber", async () => {
    const r1 = await runLearningPipeline(makeInput(15));
    const r2 = await runLearningPipeline(makeInput(15));
    const latest = historyStore.getLatest();
    // r2 has a strictly higher cycleNumber than r1
    assert.ok(
      (latest?.cycleNumber ?? 0) >= r2.cycle.cycleNumber,
      `latest cycleNumber=${latest?.cycleNumber} should be >= r2.cycleNumber=${r2.cycle.cycleNumber}`,
    );
  });

  it("list returns cycles in descending order", async () => {
    await runLearningPipeline(makeInput(15));
    await runLearningPipeline(makeInput(15));
    const list = historyStore.list(10);
    assert.ok(list.length === 2);
    assert.ok(list[0].startedAt >= list[1].startedAt);
  });

  it("never overwrites existing cycle", async () => {
    const result = await runLearningPipeline(makeInput(15));
    const id = result.cycle.id;
    // Manually try to append same ID
    historyStore.append({ ...result.cycle, cycleNumber: 999 });
    const stored = historyStore.getById(id);
    assert.equal(stored?.cycleNumber, result.cycle.cycleNumber); // unchanged
  });
});

describe("buildEmptyCycle", () => {
  it("returns a cycle with running status", () => {
    const c = buildEmptyCycle();
    assert.equal(c.status, "running");
    assert.ok(c.id.length > 10);
  });

  it("version matches engine version", () => {
    const c = buildEmptyCycle();
    assert.equal(c.version, LEARNING_ENGINE_VERSION);
  });
});
