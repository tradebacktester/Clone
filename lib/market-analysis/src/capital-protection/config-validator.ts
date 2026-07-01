// ─── Protection Config Validator ─────────────────────────────────────────────
// Validates user-submitted config before applying it.
// Ensures all thresholds are sensible and internally consistent.
// Advisory only. NEVER modifies strategy or executes trades.

import type { ProtectionConfig } from "./types.js";
import { DEFAULT_PROTECTION_CONFIG } from "./types.js";

export interface ConfigValidationResult {
  isValid:  boolean;
  errors:   string[];
  warnings: string[];
  sanitised: ProtectionConfig;
}

type Partial<T> = { [K in keyof T]?: T[K] };

function between(v: unknown, lo: number, hi: number, label: string, errors: string[]): boolean {
  if (typeof v !== "number" || !isFinite(v)) {
    errors.push(`${label}: must be a finite number`);
    return false;
  }
  if (v < lo || v > hi) {
    errors.push(`${label}: ${v} is out of allowed range [${lo}, ${hi}]`);
    return false;
  }
  return true;
}

function warn(condition: boolean, msg: string, warnings: string[]): void {
  if (condition) warnings.push(msg);
}

export function validateProtectionConfig(
  input: Partial<ProtectionConfig>,
): ConfigValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  // Range checks
  if (input.maxDailyLossPercent  !== undefined) between(input.maxDailyLossPercent,  0.1, 10, "maxDailyLossPercent",  errors);
  if (input.maxWeeklyLossPercent !== undefined) between(input.maxWeeklyLossPercent, 0.5, 25, "maxWeeklyLossPercent", errors);
  if (input.maxMonthlyLossPercent !== undefined) between(input.maxMonthlyLossPercent, 1, 50, "maxMonthlyLossPercent", errors);

  if (input.drawdownWarningPercent  !== undefined) between(input.drawdownWarningPercent,  0.5, 20, "drawdownWarningPercent",  errors);
  if (input.drawdownElevatedPercent !== undefined) between(input.drawdownElevatedPercent, 1,   30, "drawdownElevatedPercent", errors);
  if (input.drawdownCriticalPercent !== undefined) between(input.drawdownCriticalPercent, 2,   40, "drawdownCriticalPercent", errors);
  if (input.drawdownEmergencyPercent !== undefined) between(input.drawdownEmergencyPercent, 3, 50, "drawdownEmergencyPercent", errors);

  if (input.consecutiveLossCaution   !== undefined) between(input.consecutiveLossCaution,   1, 10, "consecutiveLossCaution",   errors);
  if (input.consecutiveLossWarning   !== undefined) between(input.consecutiveLossWarning,   2, 15, "consecutiveLossWarning",   errors);
  if (input.consecutiveLossCritical  !== undefined) between(input.consecutiveLossCritical,  3, 20, "consecutiveLossCritical",  errors);
  if (input.consecutiveLossEmergency !== undefined) between(input.consecutiveLossEmergency, 5, 30, "consecutiveLossEmergency", errors);

  if (input.maxOpenRiskPercent       !== undefined) between(input.maxOpenRiskPercent,       0.5, 20, "maxOpenRiskPercent",       errors);
  if (input.maxPairExposurePercent   !== undefined) between(input.maxPairExposurePercent,   0.5, 10, "maxPairExposurePercent",   errors);
  if (input.maxCorrelation           !== undefined) between(input.maxCorrelation,           0.1, 1,  "maxCorrelation",           errors);
  if (input.maxDirectionalBias       !== undefined) between(input.maxDirectionalBias,       50,  100,"maxDirectionalBias",       errors);

  if (input.marginWarningLevel   !== undefined) between(input.marginWarningLevel,   100, 1000, "marginWarningLevel",   errors);
  if (input.marginCriticalLevel  !== undefined) between(input.marginCriticalLevel,  100, 500,  "marginCriticalLevel",  errors);
  if (input.marginEmergencyLevel !== undefined) between(input.marginEmergencyLevel, 100, 300,  "marginEmergencyLevel", errors);
  if (input.maxLeverage          !== undefined) between(input.maxLeverage,          1,   500,  "maxLeverage",          errors);

  if (input.maxSpreadPips          !== undefined) between(input.maxSpreadPips,          0.1, 20,  "maxSpreadPips",          errors);
  if (input.maxSlippagePips        !== undefined) between(input.maxSlippagePips,        0.1, 10,  "maxSlippagePips",        errors);
  if (input.maxExecutionMs         !== undefined) between(input.maxExecutionMs,         50,  5000,"maxExecutionMs",         errors);
  if (input.maxRejectionRatePct    !== undefined) between(input.maxRejectionRatePct,    1,   50,  "maxRejectionRatePct",    errors);
  if (input.minConnectionQuality   !== undefined) between(input.minConnectionQuality,   50,  100, "minConnectionQuality",   errors);

  if (input.minDbAvailability    !== undefined) between(input.minDbAvailability,    80, 100, "minDbAvailability",    errors);
  if (input.minApiAvailability   !== undefined) between(input.minApiAvailability,   80, 100, "minApiAvailability",   errors);
  if (input.maxCpuUsage          !== undefined) between(input.maxCpuUsage,          50, 99,  "maxCpuUsage",          errors);
  if (input.maxMemoryUsage       !== undefined) between(input.maxMemoryUsage,       50, 99,  "maxMemoryUsage",       errors);

  if (input.recoveryGracePeriodHours !== undefined) between(input.recoveryGracePeriodHours, 0.5, 72, "recoveryGracePeriodHours", errors);
  if (input.recoveryStepsRequired    !== undefined) between(input.recoveryStepsRequired,    1,   10,  "recoveryStepsRequired",    errors);

  // Internal consistency (using merged values)
  const merged: ProtectionConfig = { ...DEFAULT_PROTECTION_CONFIG, ...input };

  if (merged.maxDailyLossPercent >= merged.maxWeeklyLossPercent) {
    errors.push("maxDailyLossPercent must be < maxWeeklyLossPercent");
  }
  if (merged.maxWeeklyLossPercent >= merged.maxMonthlyLossPercent) {
    errors.push("maxWeeklyLossPercent must be < maxMonthlyLossPercent");
  }
  if (merged.drawdownWarningPercent >= merged.drawdownElevatedPercent) {
    errors.push("drawdownWarningPercent must be < drawdownElevatedPercent");
  }
  if (merged.drawdownElevatedPercent >= merged.drawdownCriticalPercent) {
    errors.push("drawdownElevatedPercent must be < drawdownCriticalPercent");
  }
  if (merged.drawdownCriticalPercent >= merged.drawdownEmergencyPercent) {
    errors.push("drawdownCriticalPercent must be < drawdownEmergencyPercent");
  }
  if (merged.consecutiveLossCaution >= merged.consecutiveLossWarning) {
    errors.push("consecutiveLossCaution must be < consecutiveLossWarning");
  }
  if (merged.consecutiveLossWarning >= merged.consecutiveLossCritical) {
    errors.push("consecutiveLossWarning must be < consecutiveLossCritical");
  }
  if (merged.consecutiveLossCritical >= merged.consecutiveLossEmergency) {
    errors.push("consecutiveLossCritical must be < consecutiveLossEmergency");
  }
  if (merged.marginEmergencyLevel >= merged.marginCriticalLevel) {
    errors.push("marginEmergencyLevel must be < marginCriticalLevel");
  }
  if (merged.marginCriticalLevel >= merged.marginWarningLevel) {
    errors.push("marginCriticalLevel must be < marginWarningLevel");
  }
  if (merged.maxPairExposurePercent >= merged.maxOpenRiskPercent) {
    errors.push("maxPairExposurePercent must be < maxOpenRiskPercent");
  }

  // Warnings for overly permissive config
  warn(merged.maxDailyLossPercent > 5,   "maxDailyLossPercent > 5% is very permissive",    warnings);
  warn(merged.drawdownEmergencyPercent > 20, "drawdownEmergencyPercent > 20% is very permissive", warnings);
  warn(merged.maxLeverage > 50,           "maxLeverage > 50x is very high",               warnings);
  warn(merged.maxSpreadPips > 5,          "maxSpreadPips > 5 is very permissive",          warnings);
  warn(merged.recoveryGracePeriodHours < 1, "recoveryGracePeriodHours < 1h risks rapid oscillation", warnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    sanitised: merged,
  };
}

export function mergeConfig(partial: Partial<ProtectionConfig>): ProtectionConfig {
  return { ...DEFAULT_PROTECTION_CONFIG, ...partial };
}
