// ─── System Protection Monitor ────────────────────────────────────────────────
// Monitors DB, API, data feed, CPU, memory, network.
// Prevents trading if critical infrastructure becomes unreliable.
// Advisory only. NEVER modifies strategy or executes trades.

import type {
  SystemProtectionResult,
  MonitorSeverity,
  ProtectionActionType,
  ProtectionConfig,
} from "./types.js";

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : lo));
}

function availabilityScore(avail: number, minAvail: number): number {
  if (avail >= minAvail)          return 100;
  if (avail >= minAvail * 0.99)   return clamp(80 - ((minAvail - avail) / (minAvail * 0.01)) * 30);
  if (avail >= minAvail * 0.95)   return clamp(50 - ((minAvail * 0.99 - avail) / (minAvail * 0.04)) * 40);
  return clamp(10 - (minAvail * 0.95 - avail) / minAvail * 10);
}

function resourceScore(usage: number, maxUsage: number): number {
  if (usage <= maxUsage * 0.5) return 100;
  if (usage <= maxUsage) {
    return clamp(100 - ((usage - maxUsage * 0.5) / (maxUsage * 0.5)) * 25);
  }
  return clamp(75 - ((usage - maxUsage) / maxUsage) * 70);
}

function scoreToSeverity(score: number): MonitorSeverity {
  if (score >= 80) return "normal";
  if (score >= 65) return "caution";
  if (score >= 45) return "warning";
  if (score >= 25) return "critical";
  return "emergency";
}

export function evaluateSystemProtection(
  input: {
    cpuUsage:       number;
    memoryUsage:    number;
    dbAvailability: number;
    apiAvailability: number;
    dataFeedHealth: number;
    networkLatency: number;
    errorRate:      number;
  },
  cfg: ProtectionConfig,
): SystemProtectionResult {
  const {
    cpuUsage, memoryUsage, dbAvailability, apiAvailability,
    dataFeedHealth, networkLatency, errorRate,
  } = input;

  const dbScore    = availabilityScore(dbAvailability, cfg.minDbAvailability);
  const apiScore   = availabilityScore(apiAvailability, cfg.minApiAvailability);
  const feedScore  = clamp(dataFeedHealth);
  const cpuScore   = resourceScore(cpuUsage, cfg.maxCpuUsage);
  const memScore   = resourceScore(memoryUsage, cfg.maxMemoryUsage);

  // Network latency penalty (>1000ms = severe)
  const netScore   = networkLatency < 100   ? 100
    : networkLatency < 500   ? clamp(100 - (networkLatency - 100) / 400 * 30)
    : networkLatency < 1000  ? clamp(70  - (networkLatency - 500) / 500 * 45)
    : clamp(25 - (networkLatency - 1000) / 1000 * 20);

  // Error rate penalty (>5% = bad)
  const errScore  = errorRate < 1 ? 100
    : errorRate < 5  ? clamp(100 - (errorRate - 1) / 4 * 30)
    : errorRate < 20 ? clamp(70  - (errorRate - 5)  / 15 * 60)
    : 10;

  // Critical infrastructure (DB + API + data feed) weighted heavily
  const healthScore = clamp(
    dbScore   * 0.25 +
    apiScore  * 0.20 +
    feedScore * 0.20 +
    cpuScore  * 0.12 +
    memScore  * 0.12 +
    netScore  * 0.06 +
    errScore  * 0.05,
  );

  const criticalFailures: string[] = [];
  const evidence: string[] = [];
  const actions: ProtectionActionType[] = [];

  evidence.push(`DB availability: ${dbAvailability.toFixed(2)}% (min ${cfg.minDbAvailability}%)`);
  evidence.push(`API availability: ${apiAvailability.toFixed(2)}% (min ${cfg.minApiAvailability}%)`);
  evidence.push(`Data feed health: ${dataFeedHealth.toFixed(1)}%`);
  evidence.push(`CPU: ${cpuUsage.toFixed(1)}% | Memory: ${memoryUsage.toFixed(1)}% (max ${cfg.maxCpuUsage}%/${cfg.maxMemoryUsage}%)`);
  evidence.push(`Network latency: ${networkLatency.toFixed(0)}ms | Error rate: ${errorRate.toFixed(2)}%`);

  // DB failures
  if (dbAvailability < cfg.minDbAvailability * 0.95) {
    criticalFailures.push(`Database unavailable: ${dbAvailability.toFixed(2)}% < ${(cfg.minDbAvailability * 0.95).toFixed(2)}%`);
    actions.push("block_all_entries");
    actions.push("generate_emergency_alert");
  } else if (dbAvailability < cfg.minDbAvailability) {
    criticalFailures.push(`Database degraded: ${dbAvailability.toFixed(2)}%`);
    actions.push("pause_new_trades");
  }

  // API failures
  if (apiAvailability < cfg.minApiAvailability * 0.95) {
    criticalFailures.push(`API unavailable: ${apiAvailability.toFixed(2)}%`);
    actions.push("block_all_entries");
    actions.push("generate_emergency_alert");
  } else if (apiAvailability < cfg.minApiAvailability) {
    criticalFailures.push(`API degraded: ${apiAvailability.toFixed(2)}%`);
    actions.push("pause_new_trades");
  }

  // Data feed
  if (dataFeedHealth < 50) {
    criticalFailures.push(`Data feed critically degraded: ${dataFeedHealth.toFixed(1)}%`);
    actions.push("block_all_entries");
    actions.push("generate_emergency_alert");
  } else if (dataFeedHealth < 80) {
    criticalFailures.push(`Data feed degraded: ${dataFeedHealth.toFixed(1)}%`);
    actions.push("pause_new_trades");
  }

  // Resource exhaustion
  if (cpuUsage > cfg.maxCpuUsage || memoryUsage > cfg.maxMemoryUsage) {
    const which = [
      cpuUsage    > cfg.maxCpuUsage    ? `CPU ${cpuUsage.toFixed(1)}%` : "",
      memoryUsage > cfg.maxMemoryUsage ? `Memory ${memoryUsage.toFixed(1)}%` : "",
    ].filter(Boolean).join(", ");
    evidence.push(`Resource limit exceeded: ${which}`);
    actions.push("increase_confirmation_requirements");
  }

  if (cpuUsage > 95 || memoryUsage > 95) {
    criticalFailures.push(`Critical resource exhaustion: CPU ${cpuUsage.toFixed(1)}%, Mem ${memoryUsage.toFixed(1)}%`);
    actions.push("pause_new_trades");
  }

  // Network
  if (networkLatency > 2000) {
    criticalFailures.push(`Extreme network latency: ${networkLatency.toFixed(0)}ms`);
    actions.push("pause_new_trades");
  }

  // Error rate
  if (errorRate > 20) {
    criticalFailures.push(`Critical error rate: ${errorRate.toFixed(2)}%`);
    actions.push("block_all_entries");
  } else if (errorRate > 5) {
    evidence.push(`Elevated error rate: ${errorRate.toFixed(2)}%`);
    actions.push("increase_confirmation_requirements");
  }

  return {
    severity: scoreToSeverity(healthScore),
    healthScore,
    cpuUsage,
    memoryUsage,
    dbAvailability,
    apiAvailability,
    dataFeedHealth,
    criticalFailures,
    evidence,
    actions: [...new Set(actions)],
  };
}
