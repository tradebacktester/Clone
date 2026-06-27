import type { Pair, Timeframe } from "../types.js";
import { detectSwings, calcATR } from "../analysis/swings.js";
import { calcFibForCandles } from "../analysis/fibonacci.js";
import { detectZones } from "../analysis/zones.js";
import { detectLiquidityLevels, detectLiquidityGrabs, detectSweeps } from "../analysis/liquidity.js";
import { detectAMD } from "../analysis/amd.js";
import { detectRegime } from "../analysis/regime.js";
import { evaluateRules, type RuleEvalContext } from "../replay/rule-evaluator.js";
import type { DataQualityScore } from "./data-quality.js";
import type { TradeResult } from "./metrics.js";
import type { Candle } from "./providers/base.js";

export interface HistoricalConfig {
  pair: Pair;
  timeframe: Timeframe;
  startDate: string;
  endDate: string;
  initialEquity?: number;
  riskPerTrade?: number;
  maxHoldBars?: number;
}

export interface StrategyVsActual {
  rule: string;
  expectedPassRatePct: number;
  actualPassRatePct: number;
  expectedWinRatePct: number;
  actualWinRatePct: number;
  deviation: number;
  mismatch: boolean;
  note: string;
}

export interface HistoricalValidationResult {
  config: HistoricalConfig;
  trades: TradeResult[];
  totalCandles: number;
  totalEvaluated: number;
  totalSkipped: number;
  strategyVsActual: StrategyVsActual[];
  durationMs: number;
}

const PIP_SIZE: Record<Pair, number> = {
  EURUSD: 0.0001,
  GBPUSD: 0.0001,
  USDJPY: 0.01,
};

const MIN_LOOKBACK = 50;
const DEFAULT_MAX_HOLD = 100;

const EXPECTED_PASS_RATES: Record<string, { passRate: number; winRate: number }> = {
  "Zone Proximity":        { passRate: 25, winRate: 65 },
  "Zone Strength":         { passRate: 20, winRate: 70 },
  "HTF Market Structure":  { passRate: 18, winRate: 72 },
  "Premium/Discount":      { passRate: 40, winRate: 65 },
  "Liquidity Sweep":       { passRate: 12, winRate: 75 },
  "AMD Phase":             { passRate: 15, winRate: 70 },
  "Confirmation Candle":   { passRate: 10, winRate: 72 },
  "Final Score":           { passRate:  8, winRate: 68 },
};

function detectSession(time: Date): TradeResult["session"] {
  const h = time.getUTCHours();
  if (h >= 0  && h < 9)  return "tokyo";
  if (h >= 7  && h < 13) return "london";
  if (h >= 13 && h < 16) return "new_york"; // London/NY overlap — classify as NY
  if (h >= 16 && h < 22) return "new_york";
  return "off_hours";
}

/**
 * Resolve trade outcome scanning candles AFTER the decision bar.
 * Only reads candles[entryIndex+1..]. Never touches the decision bar or earlier.
 */
function resolveOutcome(
  direction: "buy" | "sell",
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
  candles: Candle[],
  entryIndex: number,
  maxHold: number,
): { outcome: "win" | "loss"; closePrice: number; closedAtIndex: number } {
  for (let j = entryIndex + 1; j <= Math.min(candles.length - 1, entryIndex + maxHold); j++) {
    const c = candles[j]!;
    if (direction === "buy") {
      if (c.low  <= stopLoss)   return { outcome: "loss", closePrice: stopLoss,   closedAtIndex: j };
      if (c.high >= takeProfit) return { outcome: "win",  closePrice: takeProfit, closedAtIndex: j };
    } else {
      if (c.high >= stopLoss)   return { outcome: "loss", closePrice: stopLoss,   closedAtIndex: j };
      if (c.low  <= takeProfit) return { outcome: "win",  closePrice: takeProfit, closedAtIndex: j };
    }
  }
  // Time-out: close at last bar's close
  const lastIdx = Math.min(candles.length - 1, entryIndex + maxHold);
  const close = candles[lastIdx]!.close;
  const outcome: "win" | "loss" =
    direction === "buy" ? (close > entryPrice ? "win" : "loss")
                        : (close < entryPrice ? "win" : "loss");
  return { outcome, closePrice: close, closedAtIndex: lastIdx };
}

/**
 * Run candle-by-candle historical validation with zero look-ahead.
 *
 * LOOK-AHEAD GUARANTEE:
 *   At every bar i, ALL analysis receives only candles.slice(0, i+1).
 *   The only forward reads are inside resolveOutcome(), called AFTER the
 *   trade decision is recorded. Future candles are never used to make decisions.
 *
 * @param candles - Real historical candles from a provider. No synthesis allowed.
 */
export function runHistoricalValidation(
  config: HistoricalConfig,
  candles: Candle[],
): HistoricalValidationResult {
  const t0 = Date.now();
  const { pair, timeframe } = config;
  const maxHold = config.maxHoldBars ?? DEFAULT_MAX_HOLD;

  const trades: TradeResult[] = [];
  let totalEvaluated = 0;
  let lastTradeEndIndex = -1;
  let equity = config.initialEquity ?? 10000;

  // Rule accuracy tracking (rule name → stats)
  type RuleStat = { passCount: number; total: number; winOnPass: number; passAndTrade: number };
  const ruleStats = new Map<string, RuleStat>();

  for (let i = MIN_LOOKBACK; i < candles.length - 1; i++) {
    // Skip bars inside an open trade's hold window
    if (lastTradeEndIndex >= i) continue;

    // ── STRICT LOOK-AHEAD GUARD ───────────────────────────────────────────
    const visible = candles.slice(0, i + 1);
    const current = visible[i]!;

    const atr = calcATR(visible);
    if (atr === 0) continue;

    // Fast-path: skip if no active zones are nearby
    const swings = detectSwings(visible, timeframe === "1d" ? 5 : 3);
    const fib = calcFibForCandles(visible, swings);
    const zones = detectZones(pair, timeframe, visible, fib, 10);
    const activeZones = zones.filter((z) => z.active && z.strength >= 55);
    if (activeZones.length === 0) continue;

    const price = current.close;
    const hasNearby = activeZones.some((z) => {
      const buf = atr * 0.5;
      const inZone = price >= z.priceBottom - buf && price <= z.priceTop + buf;
      const window = atr * 6;
      const approaching =
        z.zoneType === "demand"
          ? price > z.priceTop && price <= z.priceTop + window
          : price < z.priceBottom && price >= z.priceBottom - window;
      return inZone || approaching;
    });
    if (!hasNearby) continue;

    totalEvaluated++;

    const liquidity = detectLiquidityLevels(visible, swings);
    const grabs    = detectLiquidityGrabs(visible, liquidity);
    const sweeps   = detectSweeps(visible, swings);
    const amd      = detectAMD(visible, grabs);
    const regime   = detectRegime(pair, visible, swings);

    const ctx: RuleEvalContext = {
      pair,
      candleIndex:   i,
      visibleCandles: visible,
      swings,
      fib,
      zones:   activeZones,
      sweeps,
      grabs,
      amd,
      regime,
    };

    // evaluateRules only receives data[0..i+1] — no look-ahead
    const trace = evaluateRules(ctx);

    // Track per-rule pass rates
    for (const ze of trace.zoneEvaluations) {
      for (const r of ze.rules) {
        if (!ruleStats.has(r.rule)) {
          ruleStats.set(r.rule, { passCount: 0, total: 0, winOnPass: 0, passAndTrade: 0 });
        }
        const s = ruleStats.get(r.rule)!;
        s.total++;
        if (r.status === "PASS") s.passCount++;
      }
    }

    if (!trace.tradeTaken || !trace.trade) continue;

    const t = trace.trade;
    const { direction, entryPrice, stopLoss, takeProfit } = t;
    const slDist = Math.abs(entryPrice - stopLoss);
    const tpDist = Math.abs(entryPrice - takeProfit);

    // Resolve outcome using only future candles (the one permitted forward read)
    const resolved = resolveOutcome(direction, entryPrice, stopLoss, takeProfit, candles, i, maxHold);

    const pnlRaw =
      direction === "buy"
        ? resolved.closePrice - entryPrice
        : entryPrice - resolved.closePrice;
    const pnlPips = pnlRaw / PIP_SIZE[pair];
    equity += pnlPips * 0.10;

    const rrActual = slDist > 0 ? Math.abs(resolved.closePrice - entryPrice) / slDist : 0;

    trades.push({
      index: i,
      time: current.time,
      pair,
      direction,
      entryPrice,
      stopLoss,
      takeProfit,
      closePrice: resolved.closePrice,
      outcome: resolved.outcome,
      pnlPips:            parseFloat(pnlPips.toFixed(2)),
      riskRewardActual:   parseFloat(rrActual.toFixed(3)),
      riskRewardPlanned:  parseFloat((t.riskReward ?? (slDist > 0 ? tpDist / slDist : 0)).toFixed(3)),
      durationBars: resolved.closedAtIndex - i,
      equityAfter:  parseFloat(equity.toFixed(2)),
      regime:             regime.regime,
      amdScore:           t.amdScore,
      liquidityScore:     t.liquidityScore,
      confirmationScore:  t.confirmationScore,
      finalScore:         t.finalScore,
      zoneStrength:       t.zoneStrength,
      session: detectSession(current.time),
    });

    // Update win-when-pass stats
    for (const ze of trace.zoneEvaluations) {
      if (ze.tradeTaken) {
        for (const r of ze.rules) {
          if (r.status === "PASS") {
            const s = ruleStats.get(r.rule);
            if (s) {
              s.passAndTrade++;
              if (resolved.outcome === "win") s.winOnPass++;
            }
          }
        }
      }
    }

    lastTradeEndIndex = resolved.closedAtIndex;
  }

  // ── Strategy vs Actual ────────────────────────────────────────────────────
  const strategyVsActual: StrategyVsActual[] = Object.entries(EXPECTED_PASS_RATES).map(
    ([rule, expected]) => {
      const s = ruleStats.get(rule);
      const actualPassRate = s && s.total > 0 ? (s.passCount / s.total) * 100 : 0;
      const actualWinRate  = s && s.passAndTrade > 0 ? (s.winOnPass / s.passAndTrade) * 100 : 0;
      const deviation = actualPassRate - expected.passRate;
      const mismatch  = Math.abs(deviation) > 15;
      const note = mismatch
        ? (deviation > 0
          ? "⚠️ Triggers more than expected — check zone sensitivity"
          : "⚠️ Triggers less than expected — threshold may be too tight")
        : "✅ Within expected range";
      return {
        rule,
        expectedPassRatePct: expected.passRate,
        actualPassRatePct:   parseFloat(actualPassRate.toFixed(1)),
        expectedWinRatePct:  expected.winRate,
        actualWinRatePct:    parseFloat(actualWinRate.toFixed(1)),
        deviation:           parseFloat(deviation.toFixed(1)),
        mismatch,
        note,
      };
    },
  );

  return {
    config,
    trades,
    totalCandles:  candles.length,
    totalEvaluated,
    totalSkipped: Math.max(0, candles.length - MIN_LOOKBACK - 1 - totalEvaluated),
    strategyVsActual,
    durationMs: Date.now() - t0,
  };
}
