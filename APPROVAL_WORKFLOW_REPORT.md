# Approval Workflow Report

**Engine:** Autonomous Research & Self-Evolution Laboratory v1.0.0  
**Date:** 2026-06-30

---

## Human Approval Gate

The approval workflow is the final gate before any experimental version can be considered for production deployment. It is mandatory — no deployment can occur without explicit human decision.

---

## Approval Queue

Every deployment recommendation automatically creates an entry in the approval queue (`rl_approval_queue` table) with:

| Field | Value |
|-------|-------|
| Status | `pending` |
| Priority | Derived from recommendation type (deploy=high, rollback=critical) |
| Expiry | 72 hours after creation |

The queue is displayed on the Approval Queue tab of the Research Laboratory dashboard.

---

## Decision Options

| Decision | API Endpoint | Description |
|----------|-------------|-------------|
| Approve Deployment | POST /research/approve | Marks recommendation approved. Research-env only — production deployment is a separate step. |
| Reject | POST /research/reject + `decision: "rejected"` | Permanently rejects this recommendation. |
| More Testing | POST /research/reject + `decision: "more_testing"` | Returns to validation pipeline for extended testing. |
| Continue Paper | POST /research/reject + `decision: "continue_paper"` | Extends paper trading simulation. |
| Archive | POST /research/reject + `decision: "archived"` | Archives experiment and recommendation. |

---

## What Happens After Approval

When an operator approves a recommendation:

1. `rl_approval_queue.status` → `"decided"`, `decision` → `"approved"`
2. `rl_recommendations.status` → `"approved"`
3. `rl_experiments.approval_status` → `"approved"`
4. Audit event logged to `rl_history`
5. System returns confirmation with advisory note

**No live trading system is modified. No production code changes.** The approval records the operator's intent. The actual production deployment (configuration change, code merge, etc.) is a separate manual or automated process outside this engine's scope.

---

## What Happens After Rejection

When an operator rejects:

1. Queue item marked `decided`
2. Recommendation status updated to `rejected` or `archived`
3. Audit event logged
4. Research team may start a new cycle with a different hypothesis

---

## Approval Evidence Package

Before deciding, the operator should review:

1. **Weakness Target** — What specific metric was the experiment trying to improve?
2. **Hypothesis** — What change was proposed and why?
3. **Validation Results** — Did all 10 validation stages pass?
4. **Performance Comparison** — Is the experimental version genuinely better?
5. **Statistical Significance** — Is the improvement statistically real?
6. **Risk Assessment** — What could go wrong?
7. **Code Changes** — What exactly changed in the research configuration?
8. **Rollback Plan** — How quickly can we revert if needed?

---

## Audit Trail

Every approval workflow event is logged to `rl_history` with:
- Event type (approved, rejected, more_testing, etc.)
- Entity type and ID
- Title and description
- Decision reason
- Timestamp
- `isReproducible: true` — all decisions can be reconstructed from DB

This creates a complete, tamper-evident record of all research decisions for regulatory review, post-mortem analysis, and strategy governance.

---

## Governance Principles

| Principle | Implementation |
|-----------|---------------|
| No automatic deployment | `rl_approval_queue` gates every change |
| No silent approvals | Decision + reason required |
| Full audit trail | `rl_history` captures every event |
| Expiring requests | 72-hour TTL prevents stale approvals |
| Rollback plans mandatory | Every recommendation includes 6-step rollback |
| Research isolation enforced | Approvals only apply to research environment |
| Production protection | Production engine has no connection to research tables |
