import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Isolated tests for MTF engine logic — no external dependencies
const BULLISH_LABELS = ["HH", "HL", "BOS_UP"];
const BEARISH_LABELS = ["LH", "LL", "BOS_DOWN"];

function determineStructure(labels: string[]): "HH/HL" | "LH/LL" | "mixed" {
  const bull = labels.filter(l => BULLISH_LABELS.includes(l)).length;
  const bear = labels.filter(l => BEARISH_LABELS.includes(l)).length;
  return bull > bear ? "HH/HL" : bear > bull ? "LH/LL" : "mixed";
}

const WEIGHTS = { "1d": 0.35, "4h": 0.30, "1h": 0.20, "15m": 0.15 };
type TF = "1d" | "4h" | "1h" | "15m";
const ALIGN_THRESHOLD = 65;

function calcAlignment(
  tfs: { tf: TF; bullish: boolean; bearish: boolean }[],
  direction?: "buy" | "sell",
): { aligned: boolean; score: number; bullScore: number; bearScore: number } {
  let weightedBull = 0;
  let weightedBear = 0;
  let totalWeight = 0;

  for (const { tf, bullish, bearish } of tfs) {
    const w = WEIGHTS[tf];
    totalWeight += w;
    if (bullish) weightedBull += w;
    if (bearish) weightedBear += w;
  }

  if (totalWeight === 0) return { aligned: false, score: 0, bullScore: 0, bearScore: 0 };

  const bullScore = (weightedBull / totalWeight) * 100;
  const bearScore = (weightedBear / totalWeight) * 100;
  const bullishAligned = bullScore >= ALIGN_THRESHOLD;
  const bearishAligned = bearScore >= ALIGN_THRESHOLD;
  const det = bullishAligned ? "buy" : bearishAligned ? "sell" : null;
  const directionMatch = direction ? det === direction : true;
  const score = directionMatch ? Math.round(Math.max(bullScore, bearScore)) : 0;

  return {
    aligned: (bullishAligned || bearishAligned) && directionMatch,
    score,
    bullScore: Math.round(bullScore),
    bearScore: Math.round(bearScore),
  };
}

describe("MTF Engine — alignment scoring", () => {
  it("returns aligned=true when all 4 TFs agree (buy)", () => {
    const result = calcAlignment([
      { tf: "1d", bullish: true, bearish: false },
      { tf: "4h", bullish: true, bearish: false },
      { tf: "1h", bullish: true, bearish: false },
      { tf: "15m", bullish: true, bearish: false },
    ], "buy");
    assert.equal(result.aligned, true);
    assert.equal(result.score, 100);
  });

  it("returns aligned=true when 3/4 TFs agree (sell)", () => {
    const result = calcAlignment([
      { tf: "1d", bullish: false, bearish: true },
      { tf: "4h", bullish: false, bearish: true },
      { tf: "1h", bullish: false, bearish: true },
      { tf: "15m", bullish: true, bearish: false },
    ], "sell");
    assert.equal(result.aligned, true);
    assert.equal(result.bearScore, 85); // 0.35+0.30+0.20 = 0.85 = 85%
  });

  it("returns aligned=false when only 1D agrees (buy)", () => {
    const result = calcAlignment([
      { tf: "1d", bullish: true, bearish: false },
      { tf: "4h", bullish: false, bearish: true },
      { tf: "1h", bullish: false, bearish: true },
      { tf: "15m", bullish: false, bearish: true },
    ], "buy");
    assert.equal(result.aligned, false);
    assert.equal(result.bullScore, 35);
  });

  it("returns score=0 when direction mismatches alignment", () => {
    const result = calcAlignment([
      { tf: "1d", bullish: true, bearish: false },
      { tf: "4h", bullish: true, bearish: false },
      { tf: "1h", bullish: true, bearish: false },
      { tf: "15m", bullish: true, bearish: false },
    ], "sell"); // direction is sell but alignment is bullish
    assert.equal(result.aligned, false);
    assert.equal(result.score, 0);
  });

  it("handles 2 TF split correctly (50/50 = not aligned)", () => {
    const result = calcAlignment([
      { tf: "1d", bullish: true, bearish: false },
      { tf: "4h", bullish: false, bearish: true },
    ]);
    assert.equal(result.aligned, false);
    const bullScore = (0.35 / (0.35 + 0.30)) * 100;
    assert.equal(result.bullScore, Math.round(bullScore));
  });

  it("handles neutral TFs (no bullish or bearish)", () => {
    const result = calcAlignment([
      { tf: "1d", bullish: false, bearish: false },
      { tf: "4h", bullish: false, bearish: false },
      { tf: "1h", bullish: true, bearish: false },
      { tf: "15m", bullish: true, bearish: false },
    ], "buy");
    assert.equal(result.aligned, false); // only 35% weighted bull
  });
});

describe("MTF Engine — structure detection", () => {
  it("detects bullish structure from HH/HL labels", () => {
    const result = determineStructure(["HH", "HL", "HH", "BOS_DOWN"]);
    assert.equal(result, "HH/HL");
  });

  it("detects bearish structure from LH/LL labels", () => {
    const result = determineStructure(["LH", "LL", "LH", "HH"]);
    assert.equal(result, "LH/LL");
  });

  it("detects mixed structure when equal", () => {
    const result = determineStructure(["HH", "LH"]);
    assert.equal(result, "mixed");
  });

  it("returns mixed for empty array", () => {
    const result = determineStructure([]);
    assert.equal(result, "mixed");
  });
});
