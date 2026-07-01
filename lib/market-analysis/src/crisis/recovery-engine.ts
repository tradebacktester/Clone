// ─── Recovery Engine ──────────────────────────────────────────────────────────

import {
  SurvivalMode,
  RecoveryState,
  SURVIVAL_MODE_ORDER,
  BrokerCrisisSignal,
  InfrastructureCrisisSignal,
  MarketCrisisSignal,
} from "./types.js";

const RECOVERY_PATH: SurvivalMode[] = [
  "emergency", "survival", "observation", "defensive", "caution", "normal",
];

export function assessRecovery(
  currentMode: SurvivalMode,
  market:      MarketCrisisSignal,
  broker:      BrokerCrisisSignal,
  infra:       InfrastructureCrisisSignal,
  tradesSinceEvent: number,
): RecoveryState {
  const currentIdx = RECOVERY_PATH.indexOf(currentMode);
  const targetIdx  = RECOVERY_PATH.length - 1; // always aim for "normal"
  const targetStage: SurvivalMode = "normal";

  const stagesCompleted: SurvivalMode[] = RECOVERY_PATH.slice(0, currentIdx + 1);
  const stagesRemaining: SurvivalMode[] = RECOVERY_PATH.slice(currentIdx + 1);

  const stableInfrastructure = infra.crisisScore < 20;
  const stableBroker         = broker.crisisScore < 20 && broker.reliabilityScore >= 80;
  const stableMarket         = market.crisisScore < 20;
  const sufficientConfirmation = tradesSinceEvent >= 5;

  const nextStageRequirements: string[] = [];
  if (!stableInfrastructure) nextStageRequirements.push(`Infrastructure score < 20 (currently ${infra.crisisScore})`);
  if (!stableBroker)         nextStageRequirements.push(`Broker reliability > 80% (currently ${broker.reliabilityScore}%)`);
  if (!stableMarket)         nextStageRequirements.push(`Market crisis score < 20 (currently ${market.crisisScore})`);
  if (!sufficientConfirmation) nextStageRequirements.push(`Minimum 5 stable-condition cycles (currently ${tradesSinceEvent})`);

  const readyForNextStage =
    stableInfrastructure &&
    stableBroker &&
    stableMarket &&
    sufficientConfirmation &&
    currentMode !== "normal";

  // Estimate: 10 minutes per remaining stage when conditions are stable
  const estimatedRecoveryMinutes = stagesRemaining.length * 10;

  return {
    currentStage:             currentMode,
    targetStage,
    stagesCompleted,
    stagesRemaining,
    readyForNextStage,
    nextStageRequirements,
    stableInfrastructure,
    stableBroker,
    stableMarket,
    sufficientConfirmation,
    estimatedRecoveryMinutes,
  };
}
