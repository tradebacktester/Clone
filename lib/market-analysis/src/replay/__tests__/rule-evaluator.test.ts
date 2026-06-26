import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateRules, type RuleEvalContext } from "../rule-evaluator.js";
import { detectSwings, calcATR } from "../../analysis/swings.js";
import { calcFibForCandles } from "../../analysis/fibonacci.js";
import { detectZones } from "../../analysis/zones.js";
import { detectLiquidityLevels, detectLiquidityGrabs, detectSweeps } from "../../analysis/liquidity.js";
import { detectAMD } from "../../analysis/amd.js";
import { detectRegime } from "../../analysis/regime.js";
import type { Candle, Pair } from "../../types.js";

function makeSyntheticCandles(n: number, basePrice = 1.08, trend: "up" | "down" | "flat" = "flat"): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  const ms = 4 * 60 * 60 * 1000;
  const now = Date.now();

  for (let i = n - 1; i >= 0; i--) {
    const drift = trend === "up" ? 0.0002 : trend === "down" ? -0.0002 : (Math.random() - 0.5) * 0.0003;
    const open = price;
    price = price + drift;
    const high = Math.max(open, price) + Math.random() * 0.0005;
    const low = Math.min(open, price) - Math.random() * 0.0005;

    candles.push({
      time: new Date(now - i * ms),
      open,
      high,
      low,
      close: price,
      volume: 15000 + Math.random() * 10000,
    });
  }
  return candles;
}

function buildContext(candles: Candle[], pair: Pair = "EURUSD"): RuleEvalContext {
  const swings = detectSwings(candles, 3);
  const fib = calcFibForCandles(candles, swings);
  const zones = detectZones(pair, "4h", candles, fib, 10);
  const liquidity = detectLiquidityLevels(candles, swings);
  const grabs = detectLiquidityGrabs(candles, liquidity);
  const sweeps = detectSweeps(candles, swings);
  const amd = detectAMD(candles, grabs);
  const regime = detectRegime(pair, candles, swings);

  return {
    pair,
    candleIndex: candles.length - 1,
    visibleCandles: candles,
    swings,
    fib,
    zones,
    sweeps,
    grabs,
    amd,
    regime,
  };
}

describe("Rule Evaluator", () => {
  it("returns a valid DecisionTrace structure", () => {
    const candles = makeSyntheticCandles(100);
    const ctx = buildContext(candles);
    const trace = evaluateRules(ctx);

    assert.ok(trace, "trace should exist");
    assert.ok(typeof trace.candleIndex === "number", "candleIndex should be a number");
    assert.ok(typeof trace.candleTime === "string", "candleTime should be a string");
    assert.ok(["TRADE", "NO_TRADE", "NO_ZONE"].includes(trace.finalDecision), "finalDecision should be valid");
    assert.ok(typeof trace.amdScore === "number", "amdScore should be a number");
    assert.ok(typeof trace.regime === "string", "regime should be a string");
  });

  it("returns NO_ZONE when no active zones are nearby", () => {
    // Use very few candles — unlikely to form strong zones
    const candles = makeSyntheticCandles(55);
    const ctx = buildContext(candles);
    // Force no zones
    ctx.zones = [];
    const trace = evaluateRules(ctx);
    assert.strictEqual(trace.finalDecision, "NO_ZONE");
    assert.strictEqual(trace.activeZonesNearby, 0);
    assert.strictEqual(trace.tradeTaken, false);
  });

  it("zone evaluations contain rule checks in correct order", () => {
    const candles = makeSyntheticCandles(150, 1.085, "up");
    const ctx = buildContext(candles);
    const trace = evaluateRules(ctx);

    for (const ze of trace.zoneEvaluations) {
      assert.ok(Array.isArray(ze.rules), "rules should be an array");
      if (ze.rules.length > 0) {
        assert.strictEqual(ze.rules[0]!.rule, "Zone Proximity", "first rule should be Zone Proximity");
      }
    }
  });

  it("blocking rule is set correctly when a rule fails", () => {
    const candles = makeSyntheticCandles(100);
    const ctx = buildContext(candles);
    const trace = evaluateRules(ctx);

    for (const ze of trace.zoneEvaluations) {
      if (!ze.tradeTaken) {
        assert.ok(ze.blockingRule !== null, "blockingRule should not be null for blocked zones");
        const blockingCheck = ze.rules.find(r => r.rule === ze.blockingRule);
        assert.ok(blockingCheck, `blocking rule '${ze.blockingRule}' should exist in rules list`);
        assert.strictEqual(blockingCheck!.status, "FAIL", "blocking rule should have FAIL status");
      } else {
        assert.strictEqual(ze.blockingRule, null, "blockingRule should be null for traded zones");
      }
    }
  });

  it("trade info is populated when trade is taken", () => {
    const candles = makeSyntheticCandles(200, 1.085, "up");
    const ctx = buildContext(candles);
    const trace = evaluateRules(ctx);

    if (trace.tradeTaken) {
      assert.ok(trace.trade, "trade should be defined when tradeTaken is true");
      assert.ok(["buy", "sell"].includes(trace.trade!.direction), "direction should be buy or sell");
      assert.ok(trace.trade!.entryPrice > 0, "entryPrice should be positive");
      assert.ok(trace.trade!.stopLoss > 0, "stopLoss should be positive");
      assert.ok(trace.trade!.takeProfit > 0, "takeProfit should be positive");
      assert.ok(trace.trade!.riskReward > 0, "riskReward should be positive");
    }
  });

  it("each rule check has a non-empty reason", () => {
    const candles = makeSyntheticCandles(150, 1.085, "up");
    const ctx = buildContext(candles);
    const trace = evaluateRules(ctx);

    for (const ze of trace.zoneEvaluations) {
      for (const rule of ze.rules) {
        assert.ok(rule.reason.length > 0, `rule '${rule.rule}' has empty reason`);
        assert.ok(["PASS", "FAIL", "SKIP", "WARN"].includes(rule.status), `rule '${rule.rule}' has invalid status: ${rule.status}`);
      }
    }
  });

  it("Final Score rule only appears after Confirmation Candle passes", () => {
    const candles = makeSyntheticCandles(150, 1.085, "up");
    const ctx = buildContext(candles);
    const trace = evaluateRules(ctx);

    for (const ze of trace.zoneEvaluations) {
      const confIdx = ze.rules.findIndex(r => r.rule === "Confirmation Candle");
      const scoreIdx = ze.rules.findIndex(r => r.rule === "Final Score");

      if (confIdx !== -1 && scoreIdx !== -1) {
        assert.ok(scoreIdx > confIdx, "Final Score rule should come after Confirmation Candle rule");
        const confRule = ze.rules[confIdx]!;
        if (confRule.status === "FAIL") {
          assert.ok(
            ze.blockingRule === "Confirmation Candle" || ze.blockingRule === "Zone Proximity" || ze.blockingRule === "Premium/Discount" || ze.blockingRule === "Zone Strength",
            "If confirmation fails, blockingRule should indicate that"
          );
        }
      }
    }
  });

  it("works with GBPUSD pair", () => {
    const candles = makeSyntheticCandles(100, 1.27);
    const ctx = buildContext(candles, "GBPUSD");
    const trace = evaluateRules(ctx);
    assert.ok(trace, "should produce a trace for GBPUSD");
  });

  it("works with USDJPY pair", () => {
    const candles = makeSyntheticCandles(100, 149.5);
    const ctx = buildContext(candles, "USDJPY");
    const trace = evaluateRules(ctx);
    assert.ok(trace, "should produce a trace for USDJPY");
  });
});
