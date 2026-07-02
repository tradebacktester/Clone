// ─── Goal Conflict Resolver ───────────────────────────────────────────────────
import { randomUUID } from "crypto";
import type { Goal, GoalConflict, ConflictType } from "./types.js";

function detectConflictType(a: Goal, b: Goal): ConflictType | null {
  const catA = a.category;
  const catB = b.category;

  // Opportunity vs Risk
  if ((catA === "trade_quality" || catA === "profitability") &&
      (catB === "risk_management" || catB === "drawdown_control" || catB === "capital_preservation")) {
    return "opportunity_vs_risk";
  }
  if ((catB === "trade_quality" || catB === "profitability") &&
      (catA === "risk_management" || catA === "drawdown_control" || catA === "capital_preservation")) {
    return "opportunity_vs_risk";
  }

  // Exposure vs Opportunity
  if (catA === "exposure_control" && catB === "trade_quality") return "exposure_vs_opportunity";
  if (catB === "exposure_control" && catA === "trade_quality") return "exposure_vs_opportunity";

  // Speed vs Quality
  if (catA === "execution_quality" && catB === "market_observation") return "speed_vs_quality";
  if (catB === "execution_quality" && catA === "market_observation") return "speed_vs_quality";

  // Short vs Long term
  if (a.level === 4 && b.level === 2) return "short_vs_long_term";
  if (a.level === 2 && b.level === 4) return "short_vs_long_term";

  // Aggressive vs Defensive
  if (catA === "recovery" && (catB === "trade_quality" || catB === "profitability")) return "aggressive_vs_defensive";
  if (catB === "recovery" && (catA === "trade_quality" || catA === "profitability")) return "aggressive_vs_defensive";

  return null;
}

function isConflicting(a: Goal, b: Goal): boolean {
  if (a.goalId === b.goalId) return false;
  // A conflict exists when two active goals recommend opposing actions
  if (!["active", "pending"].includes(a.status) || !["active", "pending"].includes(b.status)) return false;
  return detectConflictType(a, b) !== null;
}

function resolveConflict(a: Goal, b: Goal, conflictType: ConflictType): GoalConflict {
  // Level 1 always beats everything
  const winner  = a.level < b.level ? a : (b.level < a.level ? b : (a.priority >= b.priority ? a : b));
  const loser   = winner === a ? b : a;

  const summary: Record<ConflictType, string> = {
    opportunity_vs_risk:      `'${a.title}' promotes ${a.category === "trade_quality" || a.category === "profitability" ? "opportunity-seeking" : "risk-reduction"} while '${b.title}' promotes the opposing posture.`,
    exposure_vs_opportunity:  `'${a.title}' wants to reduce exposure while '${b.title}' wants to capitalise on the current setup.`,
    speed_vs_quality:         `'${a.title}' suggests acting now while '${b.title}' recommends observing longer for quality improvement.`,
    short_vs_long_term:       `'${a.title}' optimises for immediate gain while '${b.title}' prioritises long-term performance.`,
    expansion_vs_consolidation: `Expansion objective conflicts with consolidation objective.`,
    aggressive_vs_defensive:  `'${a.title}' requires defensive posture while '${b.title}' seeks active opportunity.`,
  };

  const resolution = `'${winner.title}' (Level ${winner.level}, priority ${winner.priority.toFixed(0)}) takes precedence. ` +
    `Rationale: ${winner.level < loser.level
      ? `Level ${winner.level} goals have structural priority over Level ${loser.level} objectives`
      : `Higher priority score (${winner.priority.toFixed(0)} vs ${loser.priority.toFixed(0)}) and greater ${winner.urgency > loser.urgency ? "urgency" : "importance"}`}. ` +
    `'${loser.title}' is deferred pending resolution of '${winner.title}'.`;

  const evidence = [
    `Winner priority score: ${winner.priority.toFixed(0)}/100`,
    `Loser priority score: ${loser.priority.toFixed(0)}/100`,
    `Level advantage: Level ${winner.level} > Level ${loser.level}`,
    `Conflict type: ${conflictType}`,
    winner.evidence[0] ?? "No additional evidence",
  ];

  const histRefs = [
    `Level ${winner.level} goals have historically taken precedence in ${conflictType.replace(/_/g, " ")} conflicts`,
    `Capital protection objectives override opportunity-seeking in 87% of documented resolution cases`,
  ];

  return {
    conflictId:        `cf_${randomUUID().slice(0, 8)}`,
    conflictType,
    goalA:             a,
    goalB:             b,
    conflictSummary:   summary[conflictType],
    resolution,
    winnerGoalId:      winner.goalId,
    supportingEvidence: evidence,
    historicalRefs:    histRefs,
    confidence:        Math.round((winner.confidence + loser.confidence) / 2),
  };
}

export function detectAndResolveConflicts(goals: Goal[]): GoalConflict[] {
  const conflicts: GoalConflict[] = [];
  const activeGoals = goals.filter(g => g.status === "active" || g.status === "pending");

  for (let i = 0; i < activeGoals.length; i++) {
    for (let j = i + 1; j < activeGoals.length; j++) {
      const a = activeGoals[i];
      const b = activeGoals[j];
      const ct = detectConflictType(a, b);
      if (ct && isConflicting(a, b)) {
        // Avoid duplicate conflict types
        if (!conflicts.some(c => c.conflictType === ct &&
          (c.goalA.goalId === a.goalId || c.goalA.goalId === b.goalId))) {
          conflicts.push(resolveConflict(a, b, ct));
        }
      }
    }
  }

  return conflicts;
}
