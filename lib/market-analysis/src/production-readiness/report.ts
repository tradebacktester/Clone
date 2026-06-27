import type { PipelineResult, StageResult } from "./types.js";

function statusEmoji(status: StageResult["status"]): string {
  switch (status) {
    case "pass": return "✅";
    case "warn": return "⚠️";
    case "fail": return "❌";
    case "skip": return "⏭️";
    default: return "⟳";
  }
}

function scoreBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty) + ` ${score}/100`;
}

function verdictBlock(verdict: PipelineResult["verdict"], score: number): string {
  if (verdict === "production-ready") {
    return `\`\`\`
╔══════════════════════════════════════╗
║  ✅  PRODUCTION READY  — ${score}/100     ║
║  All critical checks passed.        ║
╚══════════════════════════════════════╝
\`\`\``;
  }
  if (verdict === "needs-work") {
    return `\`\`\`
╔══════════════════════════════════════╗
║  ⚠️   NEEDS WORK  — ${score}/100         ║
║  Non-critical issues must be fixed. ║
╚══════════════════════════════════════╝
\`\`\``;
  }
  return `\`\`\`
╔══════════════════════════════════════╗
║  ❌  NOT READY  — ${score}/100           ║
║  Critical blockers must be resolved.║
╚══════════════════════════════════════╝
\`\`\``;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function generateReport(result: PipelineResult): string {
  const now = new Date(result.completedAt).toUTCString();
  const lines: string[] = [];

  lines.push(`# TradeClone AI — Production Readiness Report`);
  lines.push(``);
  lines.push(`> Generated: ${now}  `);
  lines.push(`> Pipeline duration: ${formatDuration(result.durationMs)}  `);
  lines.push(`> Report ID: \`${result.id}\``);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Overall Verdict`);
  lines.push(``);
  lines.push(verdictBlock(result.verdict, result.overallScore));
  lines.push(``);

  lines.push(`## Readiness Score by Category`);
  lines.push(``);
  lines.push(`| Category | Score | Bar |`);
  lines.push(`|---|---|---|`);
  const { categoryScores: cats } = result;
  lines.push(`| 🏗️ Architecture | ${cats.architecture}/100 | ${scoreBar(cats.architecture)} |`);
  lines.push(`| 🎯 Strategy | ${cats.strategy}/100 | ${scoreBar(cats.strategy)} |`);
  lines.push(`| 🧪 Testing | ${cats.testing}/100 | ${scoreBar(cats.testing)} |`);
  lines.push(`| 📊 Data Quality | ${cats.dataQuality}/100 | ${scoreBar(cats.dataQuality)} |`);
  lines.push(`| 🛡️ Risk Management | ${cats.riskManagement}/100 | ${scoreBar(cats.riskManagement)} |`);
  lines.push(`| 📈 Performance | ${cats.performance}/100 | ${scoreBar(cats.performance)} |`);
  lines.push(`| 🎲 Reliability | ${cats.reliability}/100 | ${scoreBar(cats.reliability)} |`);
  lines.push(``);

  if (result.criticalBlockers.length > 0) {
    lines.push(`## ❌ Critical Blockers`);
    lines.push(``);
    lines.push(`**The following issues MUST be resolved before production deployment:**`);
    lines.push(``);
    for (const blocker of result.criticalBlockers) {
      lines.push(`- 🚫 ${blocker}`);
    }
    lines.push(``);
  } else {
    lines.push(`## ✅ Critical Blockers`);
    lines.push(``);
    lines.push(`No critical blockers detected.`);
    lines.push(``);
  }

  lines.push(`## 📋 Stage-by-Stage Results`);
  lines.push(``);

  for (const stage of result.stages) {
    lines.push(`### ${statusEmoji(stage.status)} Stage ${stage.id}: ${stage.name}`);
    lines.push(``);
    lines.push(`**Status:** ${stage.status.toUpperCase()} | **Score:** ${stage.score}/100 | **Duration:** ${formatDuration(stage.durationMs)}`);
    lines.push(``);

    const critical = stage.findings.filter((f) => f.level === "critical");
    const warns = stage.findings.filter((f) => f.level === "warn");
    const infos = stage.findings.filter((f) => f.level === "info");

    if (critical.length > 0) {
      lines.push(`**Critical Findings:**`);
      for (const f of critical) lines.push(`- ❌ ${f.message}`);
      lines.push(``);
    }
    if (warns.length > 0) {
      lines.push(`**Warnings:**`);
      for (const f of warns) lines.push(`- ⚠️ ${f.message}`);
      lines.push(``);
    }
    if (infos.length > 0) {
      lines.push(`**Info:**`);
      for (const f of infos) lines.push(`- ℹ️ ${f.message}`);
      lines.push(``);
    }
    if (stage.blockers.length > 0) {
      lines.push(`**Blockers from this stage:**`);
      for (const b of stage.blockers) lines.push(`- 🚫 ${b}`);
      lines.push(``);
    }
    lines.push(`---`);
    lines.push(``);
  }

  lines.push(`## 💡 Recommendations`);
  lines.push(``);
  for (let i = 0; i < result.recommendations.length; i++) {
    lines.push(`${i + 1}. ${result.recommendations[i]}`);
  }
  lines.push(``);

  lines.push(`## What Is Production-Ready`);
  lines.push(``);
  const readyStages = result.stages.filter((s) => s.status === "pass");
  if (readyStages.length > 0) {
    for (const s of readyStages) lines.push(`- ✅ **${s.name}** — ${s.score}/100`);
  } else {
    lines.push(`- No stages have fully passed yet.`);
  }
  lines.push(``);

  lines.push(`## What Is Not Production-Ready`);
  lines.push(``);
  const notReadyStages = result.stages.filter((s) => s.status === "fail" || s.status === "warn");
  if (notReadyStages.length > 0) {
    for (const s of notReadyStages) {
      const topFindings = s.findings.filter((f) => f.level !== "info").slice(0, 2);
      lines.push(`- ${statusEmoji(s.status)} **${s.name}** (${s.score}/100)`);
      for (const f of topFindings) lines.push(`  - ${f.message}`);
    }
  } else {
    lines.push(`- All stages are production-ready.`);
  }
  lines.push(``);

  lines.push(`---`);
  lines.push(``);
  lines.push(`*TradeClone AI Production Readiness Pipeline — automated validation report*`);
  lines.push(`*Do not use this report as the sole basis for live trading decisions.*`);

  return lines.join("\n");
}
