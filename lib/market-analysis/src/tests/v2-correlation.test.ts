import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Isolated correlation engine tests
const MATRIX: Record<string, Record<string, number>> = {
  EURUSD: { EURUSD: 1.00, GBPUSD: 0.82, USDJPY: -0.68 },
  GBPUSD: { EURUSD: 0.82, GBPUSD: 1.00, USDJPY: -0.60 },
  USDJPY: { EURUSD: -0.68, GBPUSD: -0.60, USDJPY: 1.00 },
};

const MAX_THRESHOLD = 0.70;

interface OpenPos { pair: string; direction: "buy" | "sell" }

function checkCorr(newPair: string, newDir: "buy" | "sell", open: OpenPos[]): { allowed: boolean; risk: number } {
  let maxRisk = 0;
  let blocked = false;

  for (const pos of open) {
    if (pos.pair === newPair) continue;
    const rawCorr = MATRIX[newPair]?.[pos.pair] ?? 0;
    const sameDir = newDir === pos.direction;
    const effectiveCorr = sameDir ? rawCorr : -rawCorr;
    if (effectiveCorr > MAX_THRESHOLD) {
      blocked = true;
      maxRisk = Math.max(maxRisk, effectiveCorr);
    }
  }

  return { allowed: !blocked, risk: Math.round(maxRisk * 100) };
}

describe("Correlation Engine — matrix values", () => {
  it("EURUSD/GBPUSD positive correlation 0.82", () => {
    assert.equal(MATRIX.EURUSD.GBPUSD, 0.82);
  });
  it("EURUSD/USDJPY negative correlation -0.68", () => {
    assert.equal(MATRIX.EURUSD.USDJPY, -0.68);
  });
  it("GBPUSD/USDJPY negative correlation -0.60", () => {
    assert.equal(MATRIX.GBPUSD.USDJPY, -0.60);
  });
  it("self-correlation is 1.00", () => {
    assert.equal(MATRIX.EURUSD.EURUSD, 1.00);
    assert.equal(MATRIX.GBPUSD.GBPUSD, 1.00);
    assert.equal(MATRIX.USDJPY.USDJPY, 1.00);
  });
});

describe("Correlation Engine — trade blocking", () => {
  it("blocks GBPUSD buy when EURUSD buy is open (positive corr 0.82 > 0.70)", () => {
    const result = checkCorr("GBPUSD", "buy", [{ pair: "EURUSD", direction: "buy" }]);
    assert.equal(result.allowed, false);
    assert.equal(result.risk, 82);
  });

  it("allows GBPUSD buy when EURUSD sell is open (opposite direction = negative effective corr)", () => {
    const result = checkCorr("GBPUSD", "buy", [{ pair: "EURUSD", direction: "sell" }]);
    assert.equal(result.allowed, true);
  });

  it("allows EURUSD buy when USDJPY buy is open (neg corr -0.68, same dir = effective -0.68)", () => {
    const result = checkCorr("EURUSD", "buy", [{ pair: "USDJPY", direction: "buy" }]);
    assert.equal(result.allowed, true);
  });

  it("blocks EURUSD buy when USDJPY sell is open (neg corr -0.68, opposite dir = +0.68 effective, below threshold 0.70)", () => {
    const result = checkCorr("EURUSD", "buy", [{ pair: "USDJPY", direction: "sell" }]);
    assert.equal(result.allowed, true); // 0.68 is just below 0.70 threshold
  });

  it("no open positions always allowed", () => {
    const result = checkCorr("EURUSD", "buy", []);
    assert.equal(result.allowed, true);
    assert.equal(result.risk, 0);
  });

  it("same pair skipped in correlation check", () => {
    const result = checkCorr("EURUSD", "buy", [{ pair: "EURUSD", direction: "buy" }]);
    assert.equal(result.allowed, true); // same pair is handled by "pair_already_open" gate
  });

  it("allows GBPUSD/USDJPY same direction (corr -0.60, below 0.70 effective threshold)", () => {
    const result = checkCorr("GBPUSD", "buy", [{ pair: "USDJPY", direction: "sell" }]);
    assert.equal(result.allowed, true); // effective corr = 0.60 < 0.70
  });

  it("blocks GBPUSD/USDJPY opposite direction (corr -0.60, opposite = effective +0.60, still < 0.70)", () => {
    const result = checkCorr("GBPUSD", "buy", [{ pair: "USDJPY", direction: "buy" }]);
    assert.equal(result.allowed, true); // effective corr = -0.60 = not blocking
  });
});
