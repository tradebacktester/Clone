// ─── Research Lab — Hypothesis Generator ─────────────────────────────────────
// Generates actionable improvement hypotheses from detected weaknesses.
// Advisory only — no strategy modification.

import { randomUUID } from "crypto";
import type { Weakness, Hypothesis, HypothesisType } from "./types.js";

// ─── Hypothesis templates ──────────────────────────────────────────────────────

interface HypothesisTemplate {
  type:        HypothesisType;
  component:   string;
  title:       (w: Weakness) => string;
  description: (w: Weakness) => string;
  rationale:   (w: Weakness) => string;
  change:      (w: Weakness) => Record<string, unknown>;
  improvement: (w: Weakness) => number;
  confidence:  (w: Weakness) => number;
  evidence:    (w: Weakness) => string[];
}

const TEMPLATES: Record<string, HypothesisTemplate[]> = {
  win_rate: [
    {
      type: "threshold_change",
      component: "setup_score_filter",
      title: () => "Raise Setup Score Minimum Threshold",
      description: w => `Increase the minimum setup score threshold from 60 to 70 to reduce low-quality trade entries. Analysis shows win rate at ${(w.currentValue * 100).toFixed(1)}%, below the ${(w.targetValue * 100).toFixed(0)}% target.`,
      rationale: w => `Low-quality setups are dragging overall win rate to ${(w.currentValue * 100).toFixed(1)}%. Filtering out sub-70 setup scores should improve selectivity and win rate.`,
      change: () => ({ parameter: "min_setup_score", before: 60, after: 70 }),
      improvement: () => 8.5,
      confidence: () => 72,
      evidence: w => w.evidence,
    },
    {
      type: "filter_change",
      component: "confirmation_filter",
      title: () => "Add Dual-Confirmation Requirement",
      description: () => "Require at least two confirmation signals (candle + order flow) before entry to reduce false-positive setups.",
      rationale: () => "Single-confirmation entries have lower win rates. Adding a second confirmation acts as a natural quality gate.",
      change: () => ({ parameter: "min_confirmations", before: 1, after: 2 }),
      improvement: () => 7.0,
      confidence: () => 65,
      evidence: w => w.evidence,
    },
  ],
  avg_rr: [
    {
      type: "threshold_change",
      component: "rr_target_engine",
      title: () => "Increase Minimum R:R Target",
      description: w => `Raise the minimum planned R:R from 1.5 to 2.0. Current average realized R:R is ${w.currentValue.toFixed(2)}.`,
      rationale: () => "Targeting higher R:R setups improves the expected value per trade even if win rate decreases slightly.",
      change: () => ({ parameter: "min_rr_planned", before: 1.5, after: 2.0 }),
      improvement: () => 15.0,
      confidence: () => 68,
      evidence: w => w.evidence,
    },
    {
      type: "feature_addition",
      component: "partial_close_engine",
      title: () => "Implement Partial Close at 1R",
      description: () => "Add a partial close mechanism: close 50% of position at 1R to secure profit, let remainder run to full target.",
      rationale: () => "Partial closes protect realized profit while maintaining upside, improving risk-adjusted returns.",
      change: () => ({ parameter: "partial_close_at_1r", before: false, after: true, partial_close_pct: 0.5 }),
      improvement: () => 12.0,
      confidence: () => 74,
      evidence: w => w.evidence,
    },
  ],
  profit_factor: [
    {
      type: "rule_change",
      component: "loss_limiting_engine",
      title: () => "Add Consecutive Loss Circuit Breaker",
      description: () => "Pause trading after 3 consecutive losses in a session and require a 2-hour cooling period before resuming.",
      rationale: () => "Consecutive losses often indicate adverse market conditions. A circuit breaker prevents loss amplification.",
      change: () => ({ parameter: "max_consecutive_losses", before: null, after: 3, cooldown_hours: 2 }),
      improvement: () => 20.0,
      confidence: () => 80,
      evidence: w => w.evidence,
    },
  ],
  setup_quality: [
    {
      type: "threshold_change",
      component: "tqi_gate",
      title: () => "Raise TQI Gate Threshold",
      description: () => "Increase the Trade Quality Index minimum from 65 to 72 to reject borderline setups.",
      rationale: () => "TQI analysis shows strong win-rate divergence between high-TQI and low-TQI setups. Raising the gate filters the weak ones.",
      change: () => ({ parameter: "min_tqi", before: 65, after: 72 }),
      improvement: () => 10.0,
      confidence: () => 76,
      evidence: w => w.evidence,
    },
  ],
  regime_performance: [
    {
      type: "filter_change",
      component: "regime_filter",
      title: w => `Add ${w.metric.replace("_win_rate", "").replace("_", " ")} Regime Filter`,
      description: w => `Suppress trading signals when market is in ${w.metric.replace("_win_rate", "")} regime (current win rate: ${(w.currentValue * 100).toFixed(1)}%).`,
      rationale: () => "Trading in adverse regimes disproportionately increases losses. Regime-specific filtering improves selectivity.",
      change: w => ({ parameter: "regime_filter", action: "suppress", regime: w.metric.replace("_win_rate", "") }),
      improvement: () => 9.0,
      confidence: () => 70,
      evidence: w => w.evidence,
    },
  ],
  session_performance: [
    {
      type: "filter_change",
      component: "session_filter",
      title: w => `Reduce Exposure in ${w.metric.replace("_win_rate", "").replace("_", " ")} Session`,
      description: w => `Reduce trade frequency or tighten entry criteria during ${w.metric.replace("_win_rate", "")} session.`,
      rationale: () => "Session-specific performance analysis reveals consistent underperformance in specific windows.",
      change: w => ({ parameter: "session_filter", session: w.metric.replace("_win_rate", ""), action: "tighten_criteria" }),
      improvement: () => 6.0,
      confidence: () => 62,
      evidence: w => w.evidence,
    },
  ],
  tqi_gate: [
    {
      type: "threshold_change",
      component: "tqi_gate",
      title: () => "Enforce Strict TQI Gate at 70",
      description: w => `Current TQI win-rate gap is ${(w.currentValue * 100).toFixed(1)}pp. Enforce minimum TQI ≥70 across all pairs.`,
      rationale: () => "Statistical evidence shows TQI is a strong predictor of trade outcome. A stricter gate directly improves quality.",
      change: () => ({ parameter: "min_tqi", before: 65, after: 70 }),
      improvement: () => 11.0,
      confidence: () => 78,
      evidence: w => w.evidence,
    },
  ],
};

// ─── Main generator ────────────────────────────────────────────────────────────

export function generateHypotheses(
  projectId: string,
  weaknesses: Array<{ id: string; category: string; title: string; evidence: string[]; currentValue: number; targetValue: number }>,
): Hypothesis[] {
  const hypotheses: Hypothesis[] = [];

  for (const weakness of weaknesses) {
    const templates = TEMPLATES[weakness.category] ?? [];
    for (const t of templates) {
      hypotheses.push({
        hypothesisId:        randomUUID(),
        projectId,
        title:               t.title(weakness as never),
        description:         t.description(weakness as never),
        rationale:           t.rationale(weakness as never),
        weaknessId:          weakness.id,
        hypothesisType:      t.type,
        targetComponent:     t.component,
        proposedChange:      t.change(weakness as never),
        expectedImprovement: t.improvement(weakness as never),
        confidenceScore:     t.confidence(weakness as never),
        supportingEvidence:  t.evidence(weakness as never),
        status:              "pending",
      });
    }
  }

  // If no weaknesses found, add a general improvement hypothesis
  if (hypotheses.length === 0) {
    hypotheses.push({
      hypothesisId:        randomUUID(),
      projectId,
      title:               "Optimize TQI Weights for Current Market Conditions",
      description:         "Re-calibrate the TQI component weights using the most recent 90 days of trade data.",
      rationale:           "Periodic TQI recalibration ensures the scoring model remains aligned with current market behaviour.",
      weaknessId:          undefined,
      hypothesisType:      "model_change",
      targetComponent:     "tqi_engine",
      proposedChange:      { action: "recalibrate_weights", window_days: 90 },
      expectedImprovement: 5.0,
      confidenceScore:     60,
      supportingEvidence:  ["Routine maintenance hypothesis — no critical weaknesses detected."],
      status:              "pending",
    });
  }

  return hypotheses.slice(0, 5); // cap at 5 hypotheses per project
}
