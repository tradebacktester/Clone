# CONFLICT_RESOLUTION_REPORT.md
## KRYTOS Phase 7 — Conflict Resolution Framework

### Purpose
Subsystems frequently disagree. The Conflict Resolver detects, categorizes, and resolves these disagreements transparently. Every conflict is logged with its winner, evidence, and justification.

### Conflict Types

#### 1. Risk vs Strategy Conflict
**Triggers**: Strategy score > 60 AND risk safety score < 50 AND divergence > 25 points

**Resolution**: Risk Intelligence always wins. Capital preservation supersedes signal quality.

**Example**:
```
Strategy Executive Score: 92 (strong AMD setup detected)
ERB Overall Risk Score:   78 (elevated — capital at risk)
Risk Safety Score:         22 (inverted)
Divergence:                70 points → CRITICAL conflict

Winner: Risk Intelligence
Justification: ERB risk score 78 caps composite. Recommend: defensive_mode.
```

#### 2. Market vs Strategy Conflict
**Triggers**: Strategy score > 70 AND market health < 45 AND divergence > 30 points

**Resolution**: Market Intelligence wins. Individual setup quality cannot overcome hostile market conditions.

**Example**:
```
Strategy Score: 85 (rule engine confident)
Market Health:  32 (volatile, illiquid, unfavorable regime)
Divergence:     53 points → HIGH conflict

Winner: Market Intelligence
Justification: Market health 32 is 53 points below strategy score 85.
```

#### 3. Memory vs Learning Conflict
**Triggers**: |historicalWinRate - learningConfidence| > 30 AND performanceDrift < -20

**Resolution**: Learning Intelligence wins when recent drift is significantly negative, indicating historical patterns are losing reliability.

#### 4. Multi-System Conflict
**Triggers**: 3+ systems with max deviation from average > 35 points

**Resolution**: Weighted composite applied. No single system dominates.

### Conflict Severity Levels

| Severity | Divergence | Action |
|----------|-----------|--------|
| Low | < 25 pts | Noted, no adjustment |
| Moderate | 25–39 pts | Minor composite dampening |
| High | 40–54 pts | Significant dampening |
| Critical | ≥ 55 pts | Composite dampened 25% if >65 |

### Conflict Resolution Output

Each conflict record includes:
- `conflictId` — Unique identifier
- `type` — Conflict category
- `severity` — low/moderate/high/critical
- `systemA` / `systemB` — Parties in conflict
- `scoreA` / `scoreB` — Their respective scores
- `divergence` — Point difference
- `winnerSystem` — Which system's logic prevails
- `resolution` — Resolution strategy description
- `winningEvidence` — Evidence that supported the winner
- `rejectedEvidence` — Evidence that was overridden
- `finalJustification` — Human-readable explanation

### Design Principles
1. **Transparency** — All conflicts are visible, never suppressed
2. **Determinism** — Same input always produces the same conflict outcome
3. **Auditability** — All conflicts stored in `eai_conflicts` table
4. **Safety bias** — When in doubt, Risk Intelligence wins
5. **Proportionality** — Severity determines response intensity
