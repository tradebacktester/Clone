// ─── Infrastructure Crisis Monitor ───────────────────────────────────────────

import {
  InfrastructureContext,
  InfrastructureCrisisSignal,
  THRESHOLDS,
  scoreToCrisisSeverity,
} from "./types.js";

export function monitorInfrastructure(ctx: InfrastructureContext): InfrastructureCrisisSignal {
  const evidence: string[] = [];

  // Internet: treat database timeout > critical as connectivity issue
  const internetConnectivity = ctx.networkLatencyMs >= THRESHOLDS.LATENCY_CRITICAL_MS;
  if (internetConnectivity)
    evidence.push(`Internet instability: network latency ${ctx.networkLatencyMs}ms`);

  // VPS: uptime < 0.5 hours is a fresh restart
  const vpsAvailability = ctx.uptimeHours < 0.5;
  if (vpsAvailability)
    evidence.push(`VPS recently restarted: uptime ${ctx.uptimeHours.toFixed(2)}h`);

  const cpuOverload = ctx.cpuPercent >= THRESHOLDS.CPU_HIGH;
  if (cpuOverload)
    evidence.push(`CPU overload: ${ctx.cpuPercent}% (threshold ${THRESHOLDS.CPU_HIGH}%)`);

  const memoryExhaustion = ctx.memPercent >= THRESHOLDS.MEM_HIGH;
  if (memoryExhaustion)
    evidence.push(`Memory exhaustion: ${ctx.memPercent}% used`);

  const databaseFailure = ctx.dbResponseMs >= THRESHOLDS.DB_SLOW_MS;
  if (databaseFailure)
    evidence.push(`Database slow response: ${ctx.dbResponseMs}ms (threshold ${THRESHOLDS.DB_SLOW_MS}ms)`);

  const diskSpace = ctx.diskPercent >= THRESHOLDS.DISK_HIGH;
  if (diskSpace)
    evidence.push(`Disk space pressure: ${ctx.diskPercent}% used`);

  const networkLatency = ctx.networkLatencyMs >= THRESHOLDS.LATENCY_HIGH_MS;
  if (networkLatency)
    evidence.push(`High network latency: ${ctx.networkLatencyMs}ms`);

  // Service crash: combination of high CPU + memory + slow DB
  const serviceCrash =
    ctx.cpuPercent >= THRESHOLDS.CPU_CRITICAL &&
    ctx.memPercent >= THRESHOLDS.MEM_CRITICAL;
  if (serviceCrash)
    evidence.push(`Service crash risk: CPU ${ctx.cpuPercent}% + Memory ${ctx.memPercent}%`);

  let score = 0;
  if (serviceCrash)         score += 60;
  if (internetConnectivity) score += 45;
  if (databaseFailure && ctx.dbResponseMs >= THRESHOLDS.DB_CRITICAL_MS) score += 35;
  else if (databaseFailure) score += 15;
  if (cpuOverload && ctx.cpuPercent >= THRESHOLDS.CPU_CRITICAL) score += 30;
  else if (cpuOverload)     score += 15;
  if (memoryExhaustion && ctx.memPercent >= THRESHOLDS.MEM_CRITICAL) score += 30;
  else if (memoryExhaustion) score += 15;
  if (diskSpace && ctx.diskPercent >= THRESHOLDS.DISK_CRITICAL) score += 25;
  else if (diskSpace)       score += 10;
  if (networkLatency)       score += 10;
  if (vpsAvailability)      score += 20;

  const crisisScore = Math.min(100, Math.round(score));
  const healthScore = Math.max(0, 100 - crisisScore);

  return {
    internetConnectivity,
    vpsAvailability,
    cpuOverload,
    memoryExhaustion,
    databaseFailure,
    diskSpace,
    networkLatency,
    serviceCrash,
    crisisScore,
    severity:    scoreToCrisisSeverity(crisisScore),
    evidence,
    healthScore,
    latencyMs:   ctx.networkLatencyMs,
  };
}
