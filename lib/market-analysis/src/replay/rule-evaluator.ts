import type {
  Candle,
  SupplyDemandZone,
  FibAnalysis,
  AMDSequence,
  MarketRegimeResult,
  LiquidityGrab,
  SweepEvent,
  SwingPoint,
  Pair,
} from "../types.js";
import { calcATR, detectTrend } from "../analysis/swings.js";
import { isPriceInZone } from "../analysis/zones.js";
import { isPremiumZone, isDiscountZone } from "../analysis/fibonacci.js";
import { recentSweep } from "../analysis/liquidity.js";
import { confirmCurrentCandle } from "../analysis/confirmation.js";
import { calcFinalTradeScore } from "../signals/finalScore.js";

export type RuleStatus = "PASS" | "FAIL" | "SKIP" | "WARN";

export interface RuleCheck {
  rule: string;
  status: RuleStatus;
  reason: string;
  value?: number | string | null;
}

export interface ZoneEvaluation {
  zoneType: "demand" | "supply";
  direction: "buy" | "sell";
  priceTop: number;
  priceBottom: number;
  strength: number;
  inZone: boolean;
  approaching: boolean;
  rules: RuleCheck[];
  zoneScore: number;
  liquidityScore: number;
  amdScore: number;
  confirmationScore: number;
  finalScore: number;
  tradeTaken: boolean;
  blockingRule: string | null;
}

export interface TraceTradeInfo {
  direction: "buy" | "sell";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  zoneType: "demand" | "supply";
  zoneStrength: number;
  finalScore: number;
  liquidityScore: number;
  amdScore: number;
  confirmationScore: number;
  riskReward: number;
  outcome?: "win" | "loss";
  closedAtIndex?: number;
  closedAtTime?: string;
  closedPrice?: number;
  pnlPips?: number;
}

export interface DecisionTrace {
  candleIndex: number;
  candleTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  atr: number;
  currentPrice: number;
  regime: string;
  regimeConfidence: number;
  amdPhase: string;
  amdScore: number;
  fibBias: string;
  swingTrend: string;
  zoneEvaluations: ZoneEvaluation[];
  activeZonesNearby: number;
  finalDecision: "TRADE" | "NO_TRADE" | "NO_ZONE";
  decisionReason: string;
  tradeTaken: boolean;
  trade?: TraceTradeInfo;
}

export interface RuleEvalContext {
  pair: Pair;
  candleIndex: number;
  visibleCandles: Candle[];
  swings: SwingPoint[];
  fib: FibAnalysis | null;
  zones: SupplyDemandZone[];
  sweeps: SweepEvent[];
  grabs: LiquidityGrab[];
  amd: AMDSequence;
  regime: MarketRegimeResult;
}

const PIP_SIZES: Record<string, number> = {
  EURUSD: 0.0001,
  GBPUSD: 0.0001,
  USDJPY: 0.01,
};

function calcStopTarget(
  zone: SupplyDemandZone,
  direction: "buy" | "sell",
  atr: number,
  pair: Pair,
): { entryPrice: number; stopLoss: number; takeProfit: number } {
  const buffer = atr * 0.2;
  const pipSize = PIP_SIZES[pair] ?? 0.0001;
  const minRR = 2.0;

  let entryPrice: number;
  let stopLoss: number;
  let takeProfit: number;

  if (direction === "buy") {
    entryPrice = zone.priceTop;
    stopLoss = zone.priceBottom - buffer;
    const risk = entryPrice - stopLoss;
    takeProfit = entryPrice + risk * minRR;
  } else {
    entryPrice = zone.priceBottom;
    stopLoss = zone.priceTop + buffer;
    const risk = stopLoss - entryPrice;
    takeProfit = entryPrice - risk * minRR;
  }

  entryPrice = Math.round(entryPrice / pipSize) * pipSize;
  stopLoss = Math.round(stopLoss / pipSize) * pipSize;
  takeProfit = Math.round(takeProfit / pipSize) * pipSize;

  return { entryPrice, stopLoss, takeProfit };
}

function evaluateZone(
  zone: SupplyDemandZone,
  ctx: RuleEvalContext,
  atr: number,
  currentPrice: number,
): ZoneEvaluation {
  const { pair, visibleCandles, fib, sweeps, grabs, amd } = ctx;
  const direction: "buy" | "sell" = zone.zoneType === "demand" ? "buy" : "sell";
  const rules: RuleCheck[] = [];
  let blockingRule: string | null = null;

  // isPriceInZone uses atr*0.5 buffer — price is inside or touching the zone
  const inZone = isPriceInZone(currentPrice, zone, atr);
  // "approaching" = price is within 6×ATR of the zone edge, heading toward it
  const approaching =
    !inZone &&
    (zone.zoneType === "demand"
      ? currentPrice > zone.priceTop && currentPrice <= zone.priceTop + atr * 6
      : currentPrice < zone.priceBottom && currentPrice >= zone.priceBottom - atr * 6);

  // ── Rule 1: Zone Proximity ───────────────────────────────────────────────
  rules.push({
    rule: "Zone Proximity",
    status: inZone || approaching ? "PASS" : "FAIL",
    reason: inZone
      ? `Price ${currentPrice.toFixed(5)} is inside ${zone.zoneType} zone [${zone.priceBottom.toFixed(5)}–${zone.priceTop.toFixed(5)}]`
      : approaching
        ? `Price ${currentPrice.toFixed(5)} is approaching ${zone.zoneType} zone (within 6×ATR)`
        : `Price ${currentPrice.toFixed(5)} is not near ${zone.zoneType} zone`,
    value: zone.strength,
  });
  if (!inZone && !approaching) {
    blockingRule = "Zone Proximity";
    return buildEval(zone, direction, rules, 0, 0, 0, 0, 0, blockingRule, inZone, approaching);
  }

  // ── Rule 2: Zone Strength ────────────────────────────────────────────────
  const strengthPass = zone.strength >= 55;
  rules.push({
    rule: "Zone Strength",
    status: strengthPass ? "PASS" : "FAIL",
    reason: strengthPass
      ? `Zone strength ${zone.strength.toFixed(0)} meets minimum threshold (≥55)`
      : `Zone strength ${zone.strength.toFixed(0)} is below minimum threshold (≥55)`,
    value: zone.strength,
  });
  if (!strengthPass) {
    blockingRule = "Zone Strength";
    return buildEval(zone, direction, rules, 0, 0, 0, 0, 0, blockingRule, inZone, approaching);
  }

  // ── Rule 3: HTF Market Structure ─────────────────────────────────────────
  const swingTrend = detectTrend(
    visibleCandles.slice(-20).map((c, i) => ({ time: c.time, price: c.high, type: "high" as const, index: i })),
  );
  const structureAligned =
    (direction === "buy" && swingTrend === "bullish") ||
    (direction === "sell" && swingTrend === "bearish") ||
    swingTrend === "neutral";
  rules.push({
    rule: "HTF Market Structure",
    status: structureAligned ? "PASS" : "WARN",
    reason: structureAligned
      ? `Swing trend (${swingTrend}) is aligned with ${direction} direction`
      : `Swing trend (${swingTrend}) conflicts with ${direction} direction — reduced confidence`,
    value: swingTrend,
  });

  // ── Rule 4: Premium / Discount (Fibonacci) ───────────────────────────────
  let fibStatus: RuleStatus = "SKIP";
  let fibReason = "No Fibonacci analysis available";
  if (fib) {
    const inPremium = isPremiumZone(currentPrice, fib);
    const inDiscount = isDiscountZone(currentPrice, fib);
    const fibPass =
      (direction === "buy" && !inPremium) || (direction === "sell" && !inDiscount);
    fibStatus = fibPass ? "PASS" : "FAIL";
    fibReason = direction === "buy"
      ? inPremium
        ? `Price is in Premium zone (${fib.currentPriceBias}) — longs are unfavourable`
        : `Price is in Discount zone (${fib.currentPriceBias}) — longs preferred ✓`
      : inDiscount
        ? `Price is in Discount zone (${fib.currentPriceBias}) — shorts are unfavourable`
        : `Price is in Premium zone (${fib.currentPriceBias}) — shorts preferred ✓`;
    if (!fibPass) {
      rules.push({ rule: "Premium/Discount", status: fibStatus, reason: fibReason, value: fib.currentPriceBias });
      blockingRule = "Premium/Discount";
      return buildEval(zone, direction, rules, zone.strength, 0, 0, 0, 0, blockingRule, inZone, approaching);
    }
  }
  rules.push({ rule: "Premium/Discount", status: fibStatus, reason: fibReason, value: fib?.currentPriceBias ?? null });

  // ── Rule 5: Liquidity Sweep ──────────────────────────────────────────────
  const sweep = recentSweep(sweeps, 8, visibleCandles);
  let liquidityScore = 0;
  let liquidityStatus: RuleStatus = "FAIL";
  let liquidityReason = "No recent liquidity sweep detected within last 8 bars";

  if (sweep) {
    const sweepMatches =
      (sweep.type === "sell_side" && direction === "buy") ||
      (sweep.type === "buy_side" && direction === "sell");
    if (sweepMatches) {
      liquidityScore = sweep.sweepScore;
      liquidityStatus = sweep.sweepScore >= 70 ? "PASS" : "WARN";
      liquidityReason = `${sweep.type === "sell_side" ? "Sell-side" : "Buy-side"} sweep detected (score ${sweep.sweepScore}) — confirms ${direction} direction`;
    } else {
      liquidityStatus = "FAIL";
      liquidityReason = `Sweep detected but wrong type (${sweep.type}) for ${direction} direction`;
    }
  } else if (grabs.length > 0) {
    const rawGrab = grabs[grabs.length - 1];
    if (rawGrab?.confirmed) {
      const matchesBuy = rawGrab.type === "sweep_low" && direction === "buy";
      const matchesSell = rawGrab.type === "sweep_high" && direction === "sell";
      if (matchesBuy || matchesSell) {
        liquidityScore = 50;
        liquidityStatus = "WARN";
        liquidityReason = `Raw liquidity grab confirmed (reversal strength ${rawGrab.reversalStrength.toFixed(2)}) — weak confirmation`;
      }
    }
  }
  rules.push({ rule: "Liquidity Sweep", status: liquidityStatus, reason: liquidityReason, value: liquidityScore });

  // ── Rule 6: AMD Phase ─────────────────────────────────────────────────────
  const amdScore = amd.amdScore;
  const amdPass = amdScore >= 80;
  const amdPhaseMatch =
    (direction === "buy" && amd.direction === "bullish") ||
    (direction === "sell" && amd.direction === "bearish") ||
    amd.direction === null;
  rules.push({
    rule: "AMD Phase",
    status: amdPass && amdPhaseMatch ? "PASS" : amdScore >= 50 ? "WARN" : "FAIL",
    reason: amdPass
      ? `AMD ${amd.phase} phase complete (score ${amdScore}) — ${amdPhaseMatch ? "direction aligned" : "direction mismatched"}`
      : `AMD score ${amdScore} below threshold (≥80) — pattern incomplete (phase: ${amd.phase})`,
    value: amdScore,
  });

  // ── Rule 7: Confirmation Candle ──────────────────────────────────────────
  const confirmation = confirmCurrentCandle(visibleCandles, direction);
  rules.push({
    rule: "Confirmation Candle",
    status: confirmation.valid ? "PASS" : "FAIL",
    reason: confirmation.valid
      ? `Candle score ${confirmation.score}/100 — Direction:${confirmation.hasDirection ? "✓" : "✗"} BOS:${confirmation.hasBOS ? "✓" : "✗"} Body:${confirmation.hasBody ? "✓" : "✗"}`
      : `Candle score ${confirmation.score}/100 is below threshold (≥70) — Direction:${confirmation.hasDirection ? "✓" : "✗"} BOS:${confirmation.hasBOS ? "✓" : "✗"} Body:${confirmation.hasBody ? "✓" : "✗"}`,
    value: confirmation.score,
  });
  if (!confirmation.valid) {
    blockingRule = "Confirmation Candle";
    return buildEval(zone, direction, rules, zone.strength, liquidityScore, amdScore, confirmation.score, 0, blockingRule, inZone, approaching);
  }

  // ── Rule 8: Final Weighted Score ─────────────────────────────────────────
  const scored = calcFinalTradeScore(zone.strength, liquidityScore, amdScore, confirmation.score, 80);
  rules.push({
    rule: "Final Score",
    status: scored.allowed ? "PASS" : "FAIL",
    reason: scored.allowed
      ? `Final score ${scored.finalScore} ≥ 80 (zone ${scored.zoneContrib} + liq ${scored.liquidityContrib} + amd ${scored.amdContrib} + conf ${scored.confirmationContrib})`
      : `Final score ${scored.finalScore} < 80 — trade blocked (zone ${scored.zoneContrib} + liq ${scored.liquidityContrib} + amd ${scored.amdContrib} + conf ${scored.confirmationContrib})`,
    value: scored.finalScore,
  });
  if (!scored.allowed) {
    blockingRule = "Final Score";
    return buildEval(zone, direction, rules, zone.strength, liquidityScore, amdScore, confirmation.score, scored.finalScore, blockingRule, inZone, approaching);
  }

  return buildEval(zone, direction, rules, zone.strength, liquidityScore, amdScore, confirmation.score, scored.finalScore, null, inZone, approaching);
}

function buildEval(
  zone: SupplyDemandZone,
  direction: "buy" | "sell",
  rules: RuleCheck[],
  zoneScore: number,
  liquidityScore: number,
  amdScore: number,
  confirmationScore: number,
  finalScore: number,
  blockingRule: string | null,
  inZone: boolean,
  approaching: boolean,
): ZoneEvaluation {
  return {
    zoneType: zone.zoneType,
    direction,
    priceTop: zone.priceTop,
    priceBottom: zone.priceBottom,
    strength: zone.strength,
    inZone,
    approaching,
    rules,
    zoneScore,
    liquidityScore,
    amdScore,
    confirmationScore,
    finalScore,
    tradeTaken: blockingRule === null,
    blockingRule,
  };
}

export function evaluateRules(ctx: RuleEvalContext): DecisionTrace {
  const { pair, candleIndex, visibleCandles, fib, zones, amd, regime } = ctx;
  const current = visibleCandles[visibleCandles.length - 1]!;
  const atr = calcATR(visibleCandles);
  const currentPrice = current.close;

  const swingTrend = detectTrend(
    visibleCandles.slice(-20).map((c, i) => ({ time: c.time, price: c.high, type: "high" as const, index: i })),
  );

  const fibBias = fib?.currentPriceBias ?? "unknown";

  const activeZones = zones.filter(z => z.active && z.strength >= 55);
  const zoneEvaluations: ZoneEvaluation[] = [];

  for (const zone of activeZones) {
    const eval_ = evaluateZone(zone, ctx, atr, currentPrice);
    if (eval_.inZone || eval_.approaching) {
      zoneEvaluations.push(eval_);
    }
  }

  const activeZonesNearby = zoneEvaluations.length;

  if (activeZonesNearby === 0) {
    return {
      candleIndex,
      candleTime: current.time.toISOString(),
      open: current.open,
      high: current.high,
      low: current.low,
      close: current.close,
      atr,
      currentPrice,
      regime: regime.regime,
      regimeConfidence: regime.regimeConfidence,
      amdPhase: amd.phase,
      amdScore: amd.amdScore,
      fibBias,
      swingTrend,
      zoneEvaluations: [],
      activeZonesNearby: 0,
      finalDecision: "NO_ZONE",
      decisionReason: "No active supply/demand zones near current price",
      tradeTaken: false,
    };
  }

  const bestTrade = zoneEvaluations.find(e => e.tradeTaken);

  if (!bestTrade) {
    const bestEval = zoneEvaluations.sort((a, b) => b.finalScore - a.finalScore)[0]!;
    const reason = bestEval.blockingRule
      ? `${bestEval.blockingRule} rule blocked trade — ${bestEval.rules.find(r => r.rule === bestEval.blockingRule)?.reason ?? ""}`
      : "No zones passed all rules";

    return {
      candleIndex,
      candleTime: current.time.toISOString(),
      open: current.open,
      high: current.high,
      low: current.low,
      close: current.close,
      atr,
      currentPrice,
      regime: regime.regime,
      regimeConfidence: regime.regimeConfidence,
      amdPhase: amd.phase,
      amdScore: amd.amdScore,
      fibBias,
      swingTrend,
      zoneEvaluations,
      activeZonesNearby,
      finalDecision: "NO_TRADE",
      decisionReason: reason,
      tradeTaken: false,
    };
  }

  const { entryPrice, stopLoss, takeProfit } = calcStopTarget(
    { zoneType: bestTrade.zoneType, priceTop: bestTrade.priceTop, priceBottom: bestTrade.priceBottom } as SupplyDemandZone,
    bestTrade.direction,
    atr,
    pair,
  );

  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfit - entryPrice);
  const riskReward = risk > 0 ? reward / risk : 0;

  const trade: TraceTradeInfo = {
    direction: bestTrade.direction,
    entryPrice,
    stopLoss,
    takeProfit,
    zoneType: bestTrade.zoneType,
    zoneStrength: bestTrade.strength,
    finalScore: bestTrade.finalScore,
    liquidityScore: bestTrade.liquidityScore,
    amdScore: bestTrade.amdScore,
    confirmationScore: bestTrade.confirmationScore,
    riskReward,
  };

  return {
    candleIndex,
    candleTime: current.time.toISOString(),
    open: current.open,
    high: current.high,
    low: current.low,
    close: current.close,
    atr,
    currentPrice,
    regime: regime.regime,
    regimeConfidence: regime.regimeConfidence,
    amdPhase: amd.phase,
    amdScore: amd.amdScore,
    fibBias,
    swingTrend,
    zoneEvaluations,
    activeZonesNearby,
    finalDecision: "TRADE",
    decisionReason: `Trade signal generated (score ${bestTrade.finalScore}) via ${bestTrade.zoneType} zone`,
    tradeTaken: true,
    trade,
  };
}
