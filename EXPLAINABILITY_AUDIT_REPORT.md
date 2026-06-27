# Explainability Audit Report — TradeClone AI

Generated: 2026-06-27

---

## Executive Summary

Every trade executed by TradeClone AI now carries a complete, structured decision record that documents exactly why it was taken, the score of every gate rule at the moment of evaluation, the confidence contributions of each confluence factor, the multi-timeframe alignment status of all four timeframes, the full TQI component breakdown, and the risk and sizing rationale. This explanation is generated at the moment of trade entry, stored immutably in the `trades.explanation` JSONB column, and exposed via `GET /api/trades/:id/explanation`. The Trade Journal page now shows this explanation inline — click any trade row to expand a full decision audit panel.

For rejected signals, three gate-specific rejection codes — `mtf_insufficient`, `tqi_below_threshold`, and `correlation_blocked` — are now correctly persisted in the missed-opportunity log, replacing the incorrect catch-all `"below_confidence"` reason that previously made rejection analysis unreliable.

---

## 1. What Information Is Captured Per Trade

Every accepted trade generates and stores a `TradeExplanation` object at entry time. The explanation is produced by `generateExplanation()` in `artifacts/api-server/src/lib/explanation-engine.ts` and stored as JSONB in the `trades.explanation` column.

**The explanation contains the following sections:**

**Summary line** — a single human-readable string combining the pair, direction, TQI grade, number of aligned timeframes, AMD phase, session, and risk:reward ratio. This gives a complete one-line audit of the decision.

**Why this trade was taken** — an ordered list of plain-English reasons drawn from the signal's actual scores at entry time. Each factor is phrased precisely: for example, `"Premium liquidity sweep (score: 84/100) — clean stop-hunt with strong reversal evidence"`, `"AMD distribution phase — institutional distribution detected, expecting impulsive BUY move"`, and `"3/4 timeframes aligned bullishly — multi-timeframe confirmation"`. These are not generic labels — they reflect the actual values at the moment of evaluation.

**Rules passed — every gate evaluated** — a structured list of every rule the signal was evaluated against, with three values per rule: the actual score, the minimum threshold, and the weight category. The ten rules evaluated are:
- Final Score Gate (hard gate, ≥80)
- Signal Confidence (hard gate, ≥65%)
- Trade Quality Index (hard gate, ≥65)
- Zone Score (30% weight, ≥55)
- Liquidity Score (25% weight, ≥50)
- AMD Score (25% weight, ≥50)
- Confirmation Score (20% weight, ≥70)
- Risk:Reward (required, ≥2.0:1)
- MTF Alignment (filter, ≥2 of 4 TFs)
- Regime Not Volatile (filter)

Rules that passed by a narrow margin (score within 12 points of the threshold) are flagged separately as `rulesNearlyFailed` and highlighted with a warning indicator in the UI.

**Confidence breakdown** — each confluence factor from `signal.confluenceFactors` is listed alongside its point contribution to the overall confidence score. For example: `"AMD distribution" → +20 pts`, `"Liquidity sweep" → +15 pts`, `"Zone strength > 80" → +12 pts`. This makes it possible to understand exactly which factors drove the confidence score to the accepted threshold.

**MTF alignment detail** — for each of the four timeframes (15m, 1h, 4h, 1d), the explanation records the role of that timeframe (entry trigger, structure, trend, macro), the detected trend direction, and the alignment status (aligned / neutral / opposed / unavailable). A trade with `3/4 TFs aligned` can be inspected to see exactly which timeframe was opposed and why.

**TQI component breakdown** — the Trade Quality Index (0–100 scale) is decomposed into its individual component scores and maximum possible scores. Each component includes a description of what it measures. This reveals, for example, that a TQI of 72 (grade B) was achieved with 18/20 on Zone Quality, 14/20 on Liquidity Quality, 16/20 on AMD Phase, and 12/15 on Confirmation Quality, but only 12/25 on MTF Weight.

**Risk and sizing assessment** — the exact lot size chosen by the dynamic sizing engine, the adjusted risk percentage (after drawdown-scaling), the dollar risk amount, the stop-loss distance in pips, and the risk:reward ratio at the moment of entry. All values are computed values from the actual sizing engine, not estimates.

**Generation timestamp** — an ISO-8601 timestamp recording the exact moment the explanation was generated, making every decision reproducible and auditable.

---

## 2. Reproducibility

Every explanation is computed from the exact signal object, analysis result, MTF alignment result, TQI result, and sizing result that were used to execute the trade. These are not recomputed after the fact — they are captured at the instant of the trade execution decision in `executePaperSignals()` (lines 267–275 of `paper-engine.ts`) and immediately persisted to the database alongside the trade record in the same `INSERT` statement.

This means the explanation stored for a trade is guaranteed to reflect the actual inputs to the decision, not a later reconstruction. The signal scores, regime at entry, MTF alignment, and TQI grade cannot drift between execution and storage because they are captured in the same atomic operation.

If `analysisResult`, `tqiResult`, or `sizingResult` are unavailable at entry time (an edge case), the explanation field is stored as `null` and the API returns a clear message: `"No explanation available for this trade. It was either executed before the explanation engine was active, or lacked sufficient analysis data at entry time."` This makes missing explanations explicit rather than silently absent.

---

## 3. Per-Trade Explanation API

**Endpoint:** `GET /api/trades/:id/explanation`

Returns the full `TradeExplanation` JSON object stored at trade entry time. Returns HTTP 404 with a descriptive message if the trade does not exist or if no explanation was recorded. The endpoint is implemented in `artifacts/api-server/src/routes/trades.ts` as a targeted select on the `explanation` and identity columns — it does not fetch the full trade row, avoiding unnecessary data transfer.

---

## 4. Trade Journal UI — Expandable Explanation Panel

The Trade Journal page (`/trades`) now shows every field in the explanation inline. Clicking any trade row expands a panel below it showing:

- A summary line with the TQI grade badge and full decision summary.
- A "Why This Trade Was Taken" section listing every acceptance reason as a bullet with a checkmark icon.
- A "Gate Rules — Every Rule Evaluated" section listing all ten rules with their actual scores, thresholds, and weight categories. Rules that passed narrowly are marked with a warning icon.
- A "TQI Component Scores" section with visual progress bars for each component.
- A "Multi-Timeframe Alignment" section showing each timeframe's role, detected direction, and alignment status.
- A "Risk & Sizing" section showing lot size, risk percentage, risk amount, stop-loss pips, and risk:reward ratio.
- A "Confluence Factor Contributions" section showing each factor and its point contribution as a tag cloud.
- The ISO-8601 timestamp at which the explanation was generated.

The panel is lazy-loaded on first expansion — the explanation is not fetched until the user clicks the row, keeping the initial page load light.

---

## 5. Rejected Signal Explanation — Correction of Reason Codes

Before this audit, the paper engine logged three distinct rejection reasons as incorrect catch-all codes:

- MTF alignment failure (`alignedCount < 2`) was recorded as `"below_confidence"` — incorrect. The signal's confidence score was fine; the MTF gate was the specific failure. Now recorded as `"mtf_insufficient"`.
- TQI gate failure (`!tqiResult.tradeable`) was also recorded as `"below_confidence"` — incorrect. Now recorded as `"tqi_below_threshold"`.
- Correlation gate rejection (`!corrCheck.allowed`) was recorded as `"pair_already_open"` — incorrect. The pair was not already open; the system detected correlated directional exposure across positions. Now recorded as `"correlation_blocked"`.

The four correct rejection reasons now in use across the paper engine are:
- `"max_open_trades"` — maximum concurrent positions reached.
- `"pair_already_open"` — this specific pair already has an open position.
- `"below_confidence"` — the signal's confidence score was below the 65% minimum.
- `"mtf_insufficient"` — fewer than 2 of 4 timeframes aligned (V2 Gate 1).
- `"tqi_below_threshold"` — Trade Quality Index below the tradeable threshold (V2 Gate 2).
- `"correlation_blocked"` — correlated directional exposure risk would exceed limits (V2 Gate 3).

These codes feed the Trade Memory engine, the Learning engine's quality scores, and the missed-opportunity analytics. Correct rejection codes are a prerequisite for the system's reinforcement learning component to attribute performance degradation to the correct failure mode.

---

## 6. What "Every Decision Is Reproducible" Means in Practice

Given a trade ID, an analyst or auditor can:

1. Call `GET /api/trades/:id/explanation` to retrieve the full decision record.
2. Read the exact confidence score, zone score, liquidity score, AMD score, confirmation score, and final score that were evaluated.
3. Read the TQI breakdown to understand the quality assessment at entry.
4. Read the MTF alignment to know which timeframes were aligned and which opposed.
5. Read the risk assessment to verify the lot size and risk percentage match the stated risk management rules.
6. Read the generation timestamp to cross-reference with market data at that time.
7. Confirm the session, AMD phase, and FIB level that were active at entry.

The complete explanation is deterministic given the same inputs. If the same signal were to appear again under the same market regime, the same rules would evaluate to the same scores, and the same decision would be made. The explanation is not a post-hoc narrative — it is a direct readout of the decision engine's state at the moment the trade was approved.
