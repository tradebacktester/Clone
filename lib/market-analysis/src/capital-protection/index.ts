// ─── Capital Protection & Survival Engine — Main ──────────────────────────────
// Evaluates all protection monitors and produces a CapitalProtectionObject.
// Advisory only. MAY adjust risk management. NEVER modifies strategy logic.

import { randomUUID } from "crypto";
import type {
  CapitalProtectionInput,
  CapitalProtectionObject,
  ProtectionConfig,
  ProtectionLevel,
} from "./types.js";
import { CP_ENGINE_VERSION, DEFAULT_PROTECTION_CONFIG, PROTECTION_LEVEL_LABELS, PROTECTION_LEVEL_SCORE } from "./types.js";
import { evaluateAccountProtection }  from "./account-protection.js";
import { evaluateConsecutiveLoss }    from "./consecutive-loss.js";
import { evaluateDrawdownProtection } from "./drawdown-protection.js";
import { evaluateExposureProtection } from "./exposure-protection.js";
import { evaluateMarginProtection }   from "./margin-protection.js";
import { evaluateBrokerProtection }   from "./broker-protection.js";
import { evaluateSystemProtection }   from "./system-protection.js";
import { evaluateProtectionLevel }    from "./level-evaluator.js";
import { generateProtectionActions }  from "./action-engine.js";
import { evaluateRecovery }           from "./recovery-engine.js";
import { buildExplainability }        from "./explainer.js";

// Re-exports for consumers
export { CP_ENGINE_VERSION }                    from "./types.js";
export { DEFAULT_PROTECTION_CONFIG }            from "./types.js";
export { PROTECTION_LEVEL_LABELS }              from "./types.js";
export { PROTECTION_LEVEL_SCORE }               from "./types.js";
export { evaluateAccountProtection }            from "./account-protection.js";
export { evaluateConsecutiveLoss }              from "./consecutive-loss.js";
export { evaluateDrawdownProtection }           from "./drawdown-protection.js";
export { evaluateExposureProtection }           from "./exposure-protection.js";
export { evaluateMarginProtection }             from "./margin-protection.js";
export { evaluateBrokerProtection }             from "./broker-protection.js";
export { evaluateSystemProtection }             from "./system-protection.js";
export { evaluateProtectionLevel }              from "./level-evaluator.js";
export { generateProtectionActions }            from "./action-engine.js";
export { evaluateRecovery }                     from "./recovery-engine.js";
export { buildExplainability }                  from "./explainer.js";
export { validateProtectionConfig, mergeConfig } from "./config-validator.js";

export type {
  CapitalProtectionInput,
  CapitalProtectionObject,
  ProtectionConfig,
  ProtectionLevel,
  MonitorSeverity,
  ProtectionActionType,
  ActiveProtectionAction,
  RecoveryStatus,
  ProtectionExplainability,
  AccountProtectionResult,
  ConsecutiveLossResult,
  DrawdownProtectionResult,
  ExposureProtectionResult,
  MarginProtectionResult,
  BrokerProtectionResult,
  SystemProtectionResult,
} from "./types.js";

// ─── Default metrics for no-data scenarios ────────────────────────────────────

export function defaultAccountInput() {
  return {
    balance: 10000, equity: 10000, peakBalance: 10000, peakEquity: 10000,
    dailyPnl: 0, weeklyPnl: 0, monthlyPnl: 0,
    freeMargin: 10000, marginLevel: 0, usedMargin: 0, leverage: 1,
  };
}

export function defaultBrokerInput() {
  return {
    spread: 1.2, spreadBaseline: 1.0, slippage: 0.2, executionTime: 120,
    orderRejections: 0, totalOrders: 10, connectionQuality: 99, pair: "EURUSD",
  };
}

export function defaultSystemInput() {
  return {
    cpuUsage: 30, memoryUsage: 40, dbAvailability: 99.9,
    apiAvailability: 99.9, dataFeedHealth: 98, networkLatency: 50, errorRate: 0.1,
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function runCapitalProtection(input: CapitalProtectionInput): CapitalProtectionObject {
  const cfg: ProtectionConfig = {
    ...DEFAULT_PROTECTION_CONFIG,
    ...(input.config ?? {}),
  };

  const currentLevel: ProtectionLevel = input.currentProtectionLevel ?? "normal";
  const hoursAtCurrentLevel = input.hoursAtCurrentLevel ?? 0;

  // ─── Run all monitors ──────────────────────────────────────────────────────

  const account = evaluateAccountProtection(
    {
      balance:    input.balance,
      equity:     input.equity,
      peakEquity: input.peakEquity,
      dailyPnl:   input.dailyPnl,
      weeklyPnl:  input.weeklyPnl,
      monthlyPnl: input.monthlyPnl,
    },
    cfg,
  );

  const consecutiveLoss = evaluateConsecutiveLoss(input.recentTrades, cfg);

  const drawdown = evaluateDrawdownProtection(
    {
      currentBalance:  input.balance,
      peakBalance:     input.peakBalance,
      currentEquity:   input.equity,
      peakEquity:      input.peakEquity,
      drawdownHistory: input.drawdownHistory,
    },
    cfg,
  );

  const exposure = evaluateExposureProtection(input.openPositions, cfg);

  const margin = evaluateMarginProtection(
    {
      balance:    input.balance,
      equity:     input.equity,
      usedMargin: input.usedMargin,
      freeMargin: input.freeMargin,
      marginLevel: input.marginLevel,
      leverage:   input.leverage,
    },
    cfg,
  );

  const broker = evaluateBrokerProtection(
    {
      spread:            input.spread,
      spreadBaseline:    input.spreadBaseline,
      slippage:          input.slippage,
      executionTime:     input.executionTime,
      orderRejections:   input.orderRejections,
      totalOrders:       input.totalOrders,
      connectionQuality: input.connectionQuality,
      pair:              input.pair,
    },
    cfg,
  );

  const system = evaluateSystemProtection(
    {
      cpuUsage:        input.cpuUsage,
      memoryUsage:     input.memoryUsage,
      dbAvailability:  input.dbAvailability,
      apiAvailability: input.apiAvailability,
      dataFeedHealth:  input.dataFeedHealth,
      networkLatency:  input.networkLatency,
      errorRate:       input.errorRate,
    },
    cfg,
  );

  const snap = {
    account, consecutiveLoss, drawdown, exposure, margin, broker, system,
  };

  // ─── Determine protection level ────────────────────────────────────────────

  const levelResult = evaluateProtectionLevel(snap, currentLevel, hoursAtCurrentLevel, cfg);
  const protectionLevel = levelResult.protectionLevel;

  // ─── Generate active protection actions ────────────────────────────────────

  const activeActions = generateProtectionActions(snap, protectionLevel, cfg);

  // ─── Recovery status ───────────────────────────────────────────────────────

  const recovery = evaluateRecovery(
    snap,
    currentLevel,
    protectionLevel,
    hoursAtCurrentLevel,
    cfg,
  );

  // ─── Explainability ────────────────────────────────────────────────────────

  const explainability = buildExplainability(snap, protectionLevel, activeActions, recovery);

  return {
    protectionId:         randomUUID(),
    engineVersion:        CP_ENGINE_VERSION,
    evaluatedAt:          new Date().toISOString(),
    isAdvisoryOnly:       true,

    protectionLevel,
    protectionLevelLabel: PROTECTION_LEVEL_LABELS[protectionLevel],
    protectionLevelScore: PROTECTION_LEVEL_SCORE[protectionLevel],

    activeActions,

    monitors: snap,

    recovery,
    explainability,
    config: cfg,
  };
}
