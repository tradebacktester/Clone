// ─── Risk Intelligence — System Health Evaluator ──────────────────────────────
// Monitors CPU, memory, DB, API, network, storage, and background services.
// Advisory only. NEVER modifies system configuration.

import { randomUUID } from "crypto";
import type { SystemMetrics, SystemRiskResult, RiskAlert } from "./types.js";
import { scoreToRiskClassification } from "./scorer.js";

// ─── Thresholds ───────────────────────────────────────────────────────────────

const CPU_WARN      = 70; const CPU_CRIT      = 90;
const MEM_WARN      = 75; const MEM_CRIT      = 90;
const DB_QUERY_WARN = 200; const DB_QUERY_CRIT = 1000; // ms
const API_ERR_WARN  = 0.05; const API_ERR_CRIT = 0.15;
const NET_WARN_MS   = 100; const NET_CRIT_MS   = 500;
const STORAGE_WARN  = 20; const STORAGE_CRIT  = 10;  // % free space

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : 50));
}

// ─── Sub-scorers (output = health, 0=broken, 100=healthy) ────────────────────

function cpuScore(cpu: number): number {
  if (cpu <= 50)           return 100;
  if (cpu <= CPU_WARN)     return clamp(100 - ((cpu - 50) / (CPU_WARN - 50)) * 20);
  if (cpu <= CPU_CRIT)     return clamp(80 - ((cpu - CPU_WARN) / (CPU_CRIT - CPU_WARN)) * 60);
  return 20;
}

function memScore(mem: number): number {
  if (mem <= 50)           return 100;
  if (mem <= MEM_WARN)     return clamp(100 - ((mem - 50) / (MEM_WARN - 50)) * 20);
  if (mem <= MEM_CRIT)     return clamp(80 - ((mem - MEM_WARN) / (MEM_CRIT - MEM_WARN)) * 60);
  return 20;
}

function dbScore(queryMs: number): number {
  if (queryMs <= 50)               return 100;
  if (queryMs <= DB_QUERY_WARN)    return clamp(100 - ((queryMs - 50) / (DB_QUERY_WARN - 50)) * 20);
  if (queryMs <= DB_QUERY_CRIT)    return clamp(80 - ((queryMs - DB_QUERY_WARN) / (DB_QUERY_CRIT - DB_QUERY_WARN)) * 60);
  return 20;
}

function apiScore(errorRate: number): number {
  if (errorRate <= 0.01)           return 100;
  if (errorRate <= API_ERR_WARN)   return clamp(100 - (errorRate / API_ERR_WARN) * 20);
  if (errorRate <= API_ERR_CRIT)   return clamp(80 - ((errorRate - API_ERR_WARN) / (API_ERR_CRIT - API_ERR_WARN)) * 60);
  return 20;
}

function networkScore(latencyMs: number): number {
  if (latencyMs <= 20)             return 100;
  if (latencyMs <= NET_WARN_MS)    return clamp(100 - ((latencyMs - 20) / (NET_WARN_MS - 20)) * 20);
  if (latencyMs <= NET_CRIT_MS)    return clamp(80 - ((latencyMs - NET_WARN_MS) / (NET_CRIT_MS - NET_WARN_MS)) * 60);
  return 20;
}

function feedHealthScore(feedHealth: number): number {
  return clamp(feedHealth); // already 0-100
}

function servicesScore(healthy: number, total: number): number {
  if (total <= 0) return 80;
  const ratio = healthy / total;
  if (ratio >= 1.0)  return 100;
  if (ratio >= 0.9)  return 80;
  if (ratio >= 0.75) return 60;
  if (ratio >= 0.5)  return 30;
  return 10;
}

function storageScore(available: number): number {
  if (available >= 50)           return 100;
  if (available >= STORAGE_WARN) return clamp(100 - ((50 - available) / (50 - STORAGE_WARN)) * 20);
  if (available >= STORAGE_CRIT) return clamp(80 - ((STORAGE_WARN - available) / (STORAGE_WARN - STORAGE_CRIT)) * 60);
  return 10;
}

// ─── Alert builder ────────────────────────────────────────────────────────────

function buildSystemAlerts(m: SystemMetrics, scores: SystemRiskResult["metrics"]): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  if (m.cpuUsage >= CPU_CRIT) {
    alerts.push({
      alertId: randomUUID(), category: "system", severity: "critical",
      title: "Critical CPU Usage",
      message: `CPU at ${m.cpuUsage.toFixed(1)}% — system may struggle to process signals and orders`,
      evidence: [`CPU usage: ${m.cpuUsage.toFixed(1)}%`, `Critical threshold: ${CPU_CRIT}%`],
      metrics: { cpuUsage: m.cpuUsage, threshold: CPU_CRIT },
    });
  } else if (m.cpuUsage >= CPU_WARN) {
    alerts.push({
      alertId: randomUUID(), category: "system", severity: "warning",
      title: "High CPU Usage",
      message: `CPU at ${m.cpuUsage.toFixed(1)}%`,
      evidence: [`CPU usage: ${m.cpuUsage.toFixed(1)}%`, `Warning threshold: ${CPU_WARN}%`],
      metrics: { cpuUsage: m.cpuUsage },
    });
  }

  if (m.memoryUsage >= MEM_CRIT) {
    alerts.push({
      alertId: randomUUID(), category: "system", severity: "critical",
      title: "Critical Memory Usage",
      message: `Memory at ${m.memoryUsage.toFixed(1)}% — risk of OOM errors affecting order routing`,
      evidence: [`Memory: ${m.memoryUsage.toFixed(1)}%`, `Critical threshold: ${MEM_CRIT}%`],
      metrics: { memoryUsage: m.memoryUsage, threshold: MEM_CRIT },
    });
  }

  if (m.dbQueryMs >= DB_QUERY_CRIT) {
    alerts.push({
      alertId: randomUUID(), category: "system", severity: "critical",
      title: "Database Performance Critical",
      message: `DB queries averaging ${m.dbQueryMs.toFixed(0)}ms — data consistency risk`,
      evidence: [`DB query time: ${m.dbQueryMs.toFixed(0)}ms`, `Critical threshold: ${DB_QUERY_CRIT}ms`],
      metrics: { dbQueryMs: m.dbQueryMs, threshold: DB_QUERY_CRIT },
    });
  }

  if (m.apiErrorRate >= API_ERR_WARN) {
    const errPct = (m.apiErrorRate * 100).toFixed(1);
    alerts.push({
      alertId: randomUUID(), category: "system",
      severity: m.apiErrorRate >= API_ERR_CRIT ? "critical" : "warning",
      title: m.apiErrorRate >= API_ERR_CRIT ? "Critical API Error Rate" : "Elevated API Errors",
      message: `API error rate at ${errPct}%`,
      evidence: [`Error rate: ${errPct}%`, `Warning threshold: ${API_ERR_WARN * 100}%`],
      metrics: { apiErrorRate: m.apiErrorRate },
    });
  }

  if (m.totalServices > 0 && m.backgroundServices < m.totalServices) {
    const downCount = m.totalServices - m.backgroundServices;
    alerts.push({
      alertId: randomUUID(), category: "system", severity: "warning",
      title: "Background Services Degraded",
      message: `${downCount}/${m.totalServices} background services offline`,
      evidence: [`Healthy: ${m.backgroundServices}/${m.totalServices}`],
      metrics: { healthyServices: m.backgroundServices, totalServices: m.totalServices },
    });
  }

  if (m.storageAvailability <= STORAGE_CRIT) {
    alerts.push({
      alertId: randomUUID(), category: "system", severity: "critical",
      title: "Critical Storage Shortage",
      message: `Only ${m.storageAvailability.toFixed(1)}% storage remaining — logs and DB at risk`,
      evidence: [`Storage available: ${m.storageAvailability.toFixed(1)}%`, `Critical threshold: ${STORAGE_CRIT}%`],
      metrics: { storageAvailability: m.storageAvailability, threshold: STORAGE_CRIT },
    });
  }

  return alerts;
}

// ─── Main evaluator ───────────────────────────────────────────────────────────

export function evaluateSystemRisk(m: SystemMetrics): SystemRiskResult {
  const cS = cpuScore(m.cpuUsage);
  const mS = memScore(m.memoryUsage);
  const dS = dbScore(m.dbQueryMs);
  const aS = apiScore(m.apiErrorRate);
  const nS = networkScore(m.networkLatency);
  const fS = feedHealthScore(m.dataFeedHealth);
  const svS = servicesScore(m.backgroundServices, m.totalServices);
  const stS = storageScore(m.storageAvailability);

  const metrics = {
    cpuScore:      cS,
    memoryScore:   mS,
    dbScore:       dS,
    apiScore:      aS,
    networkScore:  nS,
    feedScore:     fS,
    servicesScore: svS,
    storageScore:  stS,
  };

  const systemHealthScore = clamp(
    cS  * 0.20 +
    mS  * 0.20 +
    dS  * 0.20 +
    aS  * 0.15 +
    nS  * 0.10 +
    fS  * 0.05 +
    svS * 0.05 +
    stS * 0.05,
  );

  const systemRiskScore = clamp(100 - systemHealthScore);
  const riskClassification = scoreToRiskClassification(systemRiskScore);

  const svcRatio = m.totalServices > 0 ? `${m.backgroundServices}/${m.totalServices}` : "N/A";

  const evidence: string[] = [
    `CPU: ${m.cpuUsage.toFixed(1)}% (score: ${cS.toFixed(1)})`,
    `Memory: ${m.memoryUsage.toFixed(1)}% (score: ${mS.toFixed(1)})`,
    `DB query avg: ${m.dbQueryMs.toFixed(0)}ms (score: ${dS.toFixed(1)})`,
    `API error rate: ${(m.apiErrorRate * 100).toFixed(2)}% (score: ${aS.toFixed(1)})`,
    `Network latency: ${m.networkLatency.toFixed(0)}ms (score: ${nS.toFixed(1)})`,
    `Data feed health: ${m.dataFeedHealth.toFixed(1)}/100`,
    `Background services: ${svcRatio} healthy`,
    `Storage available: ${m.storageAvailability.toFixed(1)}%`,
    `System health score: ${systemHealthScore.toFixed(1)}/100`,
  ];

  const alerts = buildSystemAlerts(m, metrics);

  return { systemHealthScore, riskClassification, metrics, evidence, alerts };
}
