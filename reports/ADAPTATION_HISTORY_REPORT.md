# Adaptation History Report

## Overview
Every profile change is recorded in `ari_history` with full context for complete replay.

## Event Types
| Type | Description |
|------|-------------|
| initial | First profile assignment |
| escalation | Profile moved toward more defensive stance |
| de-escalation | Profile moved toward more active stance |
| maintenance | Same profile reconfirmed with updated evidence |

## Stored Data Per Event
| Field | Description |
|-------|-------------|
| event_id | UUID for unique identification |
| occurred_at | Timestamp of profile change |
| from_profile | Previous profile |
| to_profile | New profile |
| change_reason | Human-readable reason |
| change_type | escalation / de-escalation / maintenance / initial |
| market_regime | Regime at time of change |
| volatility_level | Volatility at time of change |
| liquidity_level | Liquidity at time of change |
| session | Active session at time of change |
| confidence_score | Engine confidence (0-100) |
| sample_size | Number of trades in evidence |
| supporting_evidence | JSON array of evidence items |
| full_snapshot | Complete engine output for replay |

## Profile Snapshot Table (ari_profiles)
Every profile evaluation — including unchanged ones — is stored in `ari_profiles` for:
- Performance analysis over time
- Confidence trend monitoring
- Statistical significance tracking
- Parameter evolution audit

## Replay Capability
The `full_snapshot` JSONB field on each history event contains the complete engine output including:
- All environment statistics used
- Confidence calculation details
- Evidence items
- Explainability narrative
- Market context

This guarantees complete reproducibility of every historical decision.

## Validation Checks
The adaptation system validates:
1. **Recommendation consistency** — same inputs produce same output deterministically
2. **Confidence calibration** — confidence scores correlate with actual accuracy
3. **Safety limit compliance** — all recommended parameters below absolute limits
4. **Statistical significance** — p-value proxy ≥ 0.3 required for high-confidence recommendations
5. **Version integrity** — engine version stamped on every record
