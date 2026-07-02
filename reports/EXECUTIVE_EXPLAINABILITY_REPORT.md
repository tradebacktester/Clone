# EXECUTIVE_EXPLAINABILITY_REPORT.md
## KRYTOS Phase 7 — Explainability Framework

### Philosophy: No Black Boxes

Every Executive Decision produced by KRYTOS is fully explainable. The Explainability Engine ensures every decision can be reconstructed, audited, and communicated to a human reviewer.

### Explainability Object Structure

```typescript
interface EaiExplainability {
  whyThisDecision:      string;   // Full narrative explanation
  agreedSystems:        string[]; // Systems that supported the decision
  disagreedSystems:     string[]; // Systems that opposed
  mostInfluentialSystem: string;  // System with highest weighted contribution
  topEvidence:          string[]; // Up to 4 supporting evidence lines
  contraEvidence:       string[]; // Opposing evidence from conflicts
  confidence:           number;   // Overall confidence 0-100
  reliability:          string;   // high/moderate/low/insufficient
  historicalReferences: string[]; // Calibration and historical context
  executiveSummary:     string;   // One-line machine-readable summary
}
```

### Narrative Generation

The `whyThisDecision` narrative explains:
1. What decision was made and at what composite score
2. Whether a risk veto was applied and why
3. How many systems support the decision
4. How many systems raised concerns
5. How many conflicts were detected and their severity
6. Which system was most influential

**Example**:
> "Executive AI produced a 'Execute Trade' decision with composite score 82.4/100. 5 subsystem(s) support this decision: Strategy Intelligence, Market Intelligence, Risk Intelligence, Memory Intelligence, Trader Identity. 2 subsystem(s) raised concern: Learning Intelligence, Research Intelligence. 1 inter-system conflict(s) detected. Most influential system: Strategy Intelligence."

### Confidence Multi-Dimension Scoring

The Executive Confidence score is itself a multi-dimensional object:

| Dimension | Weight | What it Measures |
|-----------|--------|-----------------|
| Statistical | 25% | Sample sizes and subsystem data availability |
| Data Quality | 20% | Number of subsystems contributing live data |
| Historical Reliability | 25% | Win rate, historical confidence, strategy consistency |
| Market Reliability | 15% | Market stability, liquidity, trend strength |
| System Reliability | 15% | Infrastructure health, broker uptime, crisis status |

The Confidence Interval (Wilson-inspired) provides the range within which the true score is likely to fall, given uncertainty in the data.

### Agreement Matrix

The Explainability Engine classifies each subsystem as:
- **Supporting** (score ≥ 60) — Contributes positive evidence
- **Opposing** (score < 40) — Raises concern
- **Neutral** (40–60) — Non-decisive

### Historical References

Every decision includes references to:
- Decision threshold for the chosen type
- Confidence interval bounds
- Historical reliability rating
- Infrastructure health metrics

### Validation

The Explainability Engine validates:
1. Every decision has a non-empty `whyThisDecision` narrative (> 20 chars)
2. Every decision has a populated `executiveSummary`
3. `agreedSystems` and `disagreedSystems` are always arrays (never null)
4. `historicalReferences` provides at minimum 4 calibration data points
5. `mostInfluentialSystem` is always the system with the highest weighted contribution

### Reproducibility

Because all decisions are stored in `eai_decisions.fullPayload`, any historical decision can be replayed by extracting the payload and comparing it to a fresh run with identical inputs. This supports:
- Backtesting validation
- Drift detection
- Regulatory audit trails
- Strategy version comparison
