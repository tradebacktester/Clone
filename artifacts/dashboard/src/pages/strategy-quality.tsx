// ─── Strategy Quality Intelligence Dashboard ──────────────────────────────────
// Advisory-only dashboard for evaluating and exploring setup quality.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API = "/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ComponentScore {
  name: string; score: number; weight: number; weightedScore: number; tier: string;
}
interface ClassificationResult {
  classification: string; classificationLabel: string; sqs: number;
  justification: string; measurableReasons: string[];
  thresholdMet: number; nextThreshold: number | null; gapToNext: number | null;
}
interface QualityReport {
  reportId: string; version: string; evaluatedAt: string;
  setup: {
    pair: string; session: string; regime: string; trend: string; volatility: string;
    supplyQuality: number; demandQuality: number; liquidityScore: number; amdScore: number;
    confirmationQuality: number; setupScore: number; tqi: number; rrPlanned: number; spreadPips: number;
  };
  ruleIntegrity: { ruleIntegrityScore: number; passingRules: number; totalRules: number; completenessScore: number; explanations: string[] };
  structuralQuality: { structuralQualityScore: number; htfAlignmentScore: number; srStrengthScore: number; premiumDiscountScore: number; supplyDemandScore: number; zoneFreshnessScore: number; zoneRespectScore: number; cleanlinessScore: number; explanations: string[] };
  liquidityIntelligence: { liquidityIntelligenceScore: number; sweepSizeScore: number; sweepClarityScore: number; stopHuntScore: number; manipulationScore: number; distributionScore: number; explanations: string[] };
  amdIntelligence: { amdIntelligenceScore: number; accumulationScore: number; manipulationScore: number; distributionScore: number; completenessScore: number; amdConfidenceScore: number; explanations: string[] };
  confirmationIntelligence: { confirmationIntelligenceScore: number; candleStrengthScore: number; momentumScore: number; bodyRatioScore: number; breakStrengthScore: number; displacementScore: number; followThroughScore: number; explanations: string[] };
  marketIntelligence: { marketIntelligenceScore: number; healthScore: number; contextScore: number; opportunityScore: number; stabilityScore: number; trendQualityScore: number; volatilityQualityScore: number; liquidityQualityScore: number; correlationQualityScore: number; explanations: string[] };
  historicalIntelligence: { historicalIntelligenceScore: number; evidenceCount: number; winRate: number; averageRR: number; wilsonLowerBound: number; sampleReliability: string; explanations: string[] };
  components: ComponentScore[];
  strategyQualityScore: number;
  classification: ClassificationResult;
  strongestComponents: string[];
  weakestComponents: string[];
  qualityNarrative: string;
  isAdvisoryOnly: true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const classColor: Record<string, string> = {
  institutional_grade: "#a78bfa",
  elite:               "#818cf8",
  excellent:           "#34d399",
  strong:              "#22c55e",
  average:             "#facc15",
  weak:                "#f97316",
  reject:              "#ef4444",
};

function sqsColor(score: number): string {
  if (score >= 90) return "#a78bfa";
  if (score >= 80) return "#818cf8";
  if (score >= 70) return "#34d399";
  if (score >= 60) return "#22c55e";
  if (score >= 45) return "#facc15";
  if (score >= 25) return "#f97316";
  return "#ef4444";
}

function ScoreBar({ score, max = 100, label }: { score: number; max?: number; label?: string }) {
  const pct = Math.min(100, (score / max) * 100);
  const color = sqsColor(score);
  return (
    <div style={{ marginBottom: 6 }}>
      {label && <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{label}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s" }} />
        </div>
        <span style={{ fontSize: 12, color, fontWeight: 600, minWidth: 32, textAlign: "right" }}>{score.toFixed(0)}</span>
      </div>
    </div>
  );
}

function SqsGauge({ score }: { score: number }) {
  const r = 54, cx = 64, cy = 64;
  const circ = 2 * Math.PI * r;
  const arc  = circ * 0.75;
  const fill = arc * (score / 100);
  const offset = circ * 0.125;
  const color  = sqsColor(score);
  return (
    <svg width={128} height={96} viewBox="0 0 128 96">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={10}
        strokeDasharray={`${arc} ${circ - arc}`} strokeDashoffset={-offset} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${fill} ${circ - fill}`} strokeDashoffset={-offset} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s" }} />
      <text x={cx} y={cy - 4} textAnchor="middle" fill={color} fontSize="22" fontWeight="700">{score.toFixed(0)}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#94a3b8" fontSize="9">/ 100</text>
    </svg>
  );
}

function ComponentCard({ comp }: { comp: ComponentScore }) {
  const color = sqsColor(comp.score);
  return (
    <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${color}33`, marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 500 }}>{comp.name}</span>
        <span style={{ fontSize: 13, color, fontWeight: 700 }}>{comp.score.toFixed(0)}</span>
      </div>
      <ScoreBar score={comp.score} />
      <div style={{ fontSize: 10, color: "#64748b" }}>weight {(comp.weight * 100).toFixed(0)}% · contribution {comp.weightedScore.toFixed(1)}</div>
    </div>
  );
}

// ─── Default form values ──────────────────────────────────────────────────────

const DEFAULTS = {
  pair: "EURUSD", session: "london", regime: "trending", trend: "bullish", volatility: "medium",
  supplyQuality: "72", demandQuality: "70", liquidityScore: "68", amdScore: "65",
  confirmationQuality: "72", setupScore: "70", tqi: "65", rrPlanned: "2.5", spreadPips: "1.2",
  newsContext: "neutral",
};

// ─── Evaluate tab ─────────────────────────────────────────────────────────────

function EvaluateTab({ onReport }: { onReport: (r: QualityReport) => void }) {
  const [form, setForm] = useState<Record<string, string>>(DEFAULTS);
  const mutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const body: Record<string, unknown> = {};
      const numKeys = ["supplyQuality","demandQuality","liquidityScore","amdScore",
        "confirmationQuality","setupScore","tqi","rrPlanned","spreadPips"];
      for (const [k, v] of Object.entries(data)) {
        body[k] = numKeys.includes(k) ? Number(v) : v;
      }
      const r = await fetch(`${API}/strategy/quality`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.message);
      return j.report as QualityReport;
    },
    onSuccess: (r) => onReport(r),
  });

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(139,92,246,0.25)",
    background: "rgba(0,0,0,0.3)", color: "#e2e8f0", fontSize: 13, outline: "none",
  };
  const sel = (k: string, opts: string[]) => (
    <select value={form[k] ?? ""} onChange={e => set(k, e.target.value)} style={inputStyle}>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
        Fill in setup parameters. Optional sub-scores improve accuracy when available.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[["pair", ["EURUSD","GBPUSD","USDJPY","XAUUSD","AUDUSD","GBPJPY","EURJPY","USDCAD","NZDUSD"]],
          ["session", ["london","new_york","overlap","asian","off_hours"]],
          ["regime", ["trending","ranging","volatile","low_volatility"]],
          ["trend", ["bullish","bearish","unknown"]],
          ["volatility", ["low","medium","high","extreme"]],
          ["newsContext", ["positive","neutral","negative"]],
        ].map(([k, opts]) => (
          <div key={k as string}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>{k}</div>
            {sel(k as string, opts as string[])}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, fontWeight: 600, fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>CORE SCORES (0–100)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[["supplyQuality","Supply Quality"],["demandQuality","Demand Quality"],["liquidityScore","Liquidity"],
          ["amdScore","AMD Score"],["confirmationQuality","Confirmation"],["setupScore","Setup Score"],
          ["tqi","TQI"],["rrPlanned","RR Planned"],["spreadPips","Spread (pips)"]].map(([k, lbl]) => (
          <div key={k}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>{lbl}</div>
            <input type="number" value={form[k] ?? ""} onChange={e => set(k, e.target.value)} style={inputStyle} />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, fontWeight: 600, fontSize: 11, color: "#64748b", marginBottom: 6 }}>OPTIONAL SUB-SCORES (leave blank for inference)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
        {[["htfAlignment","HTF Alignment"],["srStrength","S/R Strength"],["zoneFreshness","Zone Freshness"],
          ["zoneRespect","Zone Respect"],["liquiditySweepClarity","Sweep Clarity"],["stopHuntQuality","Stop Hunt"],
          ["amdCompleteness","AMD Completeness"],["candleStrength","Candle Strength"],["displacement","Displacement"],
          ["marketHealthScore","Mkt Health"],["opportunityScore","Opportunity"],["trendStrength","Trend Strength"]].map(([k, lbl]) => (
          <div key={k}>
            <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>{lbl}</div>
            <input type="number" value={form[k] ?? ""} onChange={e => set(k, e.target.value)} placeholder="—"
              style={{ ...inputStyle, fontSize: 12, padding: "4px 8px" }} />
          </div>
        ))}
      </div>

      <button
        onClick={() => mutation.mutate(form)}
        disabled={mutation.isPending}
        style={{ marginTop: 16, width: "100%", padding: "10px 0", borderRadius: 8, border: "none",
          background: mutation.isPending ? "#4c1d95" : "linear-gradient(135deg,#7c3aed,#4f46e5)",
          color: "#fff", fontWeight: 600, fontSize: 14, cursor: mutation.isPending ? "wait" : "pointer" }}>
        {mutation.isPending ? "Evaluating…" : "Evaluate Setup Quality"}
      </button>
      {mutation.isError && (
        <div style={{ marginTop: 8, color: "#f87171", fontSize: 12 }}>
          Error: {(mutation.error as Error).message}
        </div>
      )}
    </div>
  );
}

// ─── Report tab ───────────────────────────────────────────────────────────────

function ReportTab({ report }: { report: QualityReport | null }) {
  if (!report) return (
    <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
      <div style={{ fontSize: 32 }}>📊</div>
      <div style={{ marginTop: 8 }}>No report yet — evaluate a setup first.</div>
    </div>
  );

  const cls = report.classification;
  const clsColor = classColor[cls.classification] ?? "#94a3b8";

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20, padding: 16,
        borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${clsColor}33` }}>
        <SqsGauge score={report.strategyQualityScore} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>ADVISORY ONLY</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: clsColor }}>{cls.classificationLabel}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
            {report.setup.pair} · {report.setup.session} · {report.setup.regime}
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {report.strongestComponents.map(n => (
              <span key={n} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#052e16", color: "#34d399", border: "1px solid #34d39944" }}>↑ {n}</span>
            ))}
            {report.weakestComponents.map(n => (
              <span key={n} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#450a0a", color: "#f87171", border: "1px solid #f8717144" }}>↓ {n}</span>
            ))}
          </div>
        </div>
        {cls.gapToNext !== null && (
          <div style={{ textAlign: "center", padding: "8px 12px", borderRadius: 8, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)" }}>
            <div style={{ fontSize: 10, color: "#94a3b8" }}>Next tier in</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#a78bfa" }}>{cls.gapToNext.toFixed(1)}</div>
            <div style={{ fontSize: 10, color: "#64748b" }}>SQS points</div>
          </div>
        )}
      </div>

      {/* Narrative */}
      <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)", marginBottom: 16,
        borderLeft: `3px solid ${clsColor}`, fontSize: 13, color: "#cbd5e1", lineHeight: 1.6 }}>
        {report.qualityNarrative}
      </div>

      {/* Component breakdown */}
      <div style={{ fontWeight: 600, fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>COMPONENT BREAKDOWN</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        {report.components.map(c => <ComponentCard key={c.name} comp={c} />)}
      </div>

      {/* Structural sub-scores */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 8 }}>STRUCTURAL</div>
          <ScoreBar score={report.structuralQuality.htfAlignmentScore} label="HTF Alignment" />
          <ScoreBar score={report.structuralQuality.srStrengthScore}   label="S/R Strength" />
          <ScoreBar score={report.structuralQuality.premiumDiscountScore} label="Premium/Discount" />
          <ScoreBar score={report.structuralQuality.zoneFreshnessScore}  label="Zone Freshness" />
          <ScoreBar score={report.structuralQuality.zoneRespectScore}    label="Zone Respect" />
          <ScoreBar score={report.structuralQuality.cleanlinessScore}    label="Cleanliness" />
        </div>
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 8 }}>LIQUIDITY</div>
          <ScoreBar score={report.liquidityIntelligence.sweepSizeScore}    label="Sweep Size" />
          <ScoreBar score={report.liquidityIntelligence.sweepClarityScore} label="Sweep Clarity" />
          <ScoreBar score={report.liquidityIntelligence.stopHuntScore}     label="Stop Hunt" />
          <ScoreBar score={report.liquidityIntelligence.manipulationScore} label="Manipulation" />
          <ScoreBar score={report.liquidityIntelligence.distributionScore} label="Distribution" />
        </div>
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 8 }}>AMD</div>
          <ScoreBar score={report.amdIntelligence.accumulationScore}   label="Accumulation" />
          <ScoreBar score={report.amdIntelligence.manipulationScore}   label="Manipulation" />
          <ScoreBar score={report.amdIntelligence.distributionScore}   label="Distribution" />
          <ScoreBar score={report.amdIntelligence.completenessScore}   label="Completeness" />
          <ScoreBar score={report.amdIntelligence.amdConfidenceScore}  label="AMD Confidence" />
        </div>
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 8 }}>CONFIRMATION</div>
          <ScoreBar score={report.confirmationIntelligence.candleStrengthScore} label="Candle Strength" />
          <ScoreBar score={report.confirmationIntelligence.momentumScore}       label="Momentum" />
          <ScoreBar score={report.confirmationIntelligence.bodyRatioScore}      label="Body Ratio" />
          <ScoreBar score={report.confirmationIntelligence.breakStrengthScore}  label="Break Strength" />
          <ScoreBar score={report.confirmationIntelligence.displacementScore}   label="Displacement" />
          <ScoreBar score={report.confirmationIntelligence.followThroughScore}  label="Follow-Through" />
        </div>
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 8 }}>MARKET</div>
          <ScoreBar score={report.marketIntelligence.healthScore}            label="Market Health" />
          <ScoreBar score={report.marketIntelligence.contextScore}           label="Context" />
          <ScoreBar score={report.marketIntelligence.opportunityScore}       label="Opportunity" />
          <ScoreBar score={report.marketIntelligence.stabilityScore}         label="Stability" />
          <ScoreBar score={report.marketIntelligence.trendQualityScore}      label="Trend Quality" />
          <ScoreBar score={report.marketIntelligence.volatilityQualityScore} label="Volatility" />
        </div>
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 8 }}>HISTORICAL</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div style={{ textAlign: "center", padding: "6px", borderRadius: 6, background: "rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: sqsColor(report.historicalIntelligence.winRate * 100) }}>
                {(report.historicalIntelligence.winRate * 100).toFixed(1)}%
              </div>
              <div style={{ fontSize: 9, color: "#64748b" }}>Win Rate</div>
            </div>
            <div style={{ textAlign: "center", padding: "6px", borderRadius: 6, background: "rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa" }}>
                {report.historicalIntelligence.averageRR.toFixed(2)}
              </div>
              <div style={{ fontSize: 9, color: "#64748b" }}>Avg RR</div>
            </div>
          </div>
          <ScoreBar score={report.historicalIntelligence.historicalIntelligenceScore} label={`Evidence: ${report.historicalIntelligence.evidenceCount} trades (${report.historicalIntelligence.sampleReliability})`} />
        </div>
      </div>

      {/* Measurable justification */}
      <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 8 }}>CLASSIFICATION EVIDENCE</div>
        {cls.measurableReasons.map((r, i) => (
          <div key={i} style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4, paddingLeft: 8,
            borderLeft: "2px solid rgba(139,92,246,0.4)" }}>
            {r}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── API response DTO types ───────────────────────────────────────────────────

interface HistoryRow {
  reportId: string; pair: string; session: string; regime: string;
  strategyQualityScore: string | number;
  classification: string; classificationLabel?: string; evaluatedAt: string;
}
interface ClassificationRow {
  classification: string; classificationLabel?: string;
  count: string | number; avgSqs: string | number;
}
interface PairStatRow     { pair: string;    avgSqs: string | number; count: string | number }
interface SessionStatRow  { session: string; avgSqs: string | number; count: string | number }
interface AggStats {
  totalReports: string | number;
  avgSqs: string | number; maxSqs: string | number; stddevSqs: string | number;
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const { data } = useQuery({
    queryKey: ["/api/strategy/quality"],
    queryFn: async () => {
      const r = await fetch(`${API}/strategy/quality?limit=50`);
      return r.json();
    },
    refetchInterval: 30_000,
  });
  const reports: HistoryRow[] = (data?.reports ?? []) as HistoryRow[];

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
        RECENT EVALUATIONS ({reports.length})
      </div>
      {reports.length === 0 ? (
        <div style={{ color: "#64748b", textAlign: "center", padding: 30 }}>No evaluations yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {reports.map((r) => {
            const color = sqsColor(Number(r.strategyQualityScore));
            return (
              <div key={r.reportId} style={{ padding: "10px 14px", borderRadius: 8,
                background: "rgba(255,255,255,0.03)", border: `1px solid ${color}33`,
                display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color, minWidth: 42, textAlign: "center" }}>
                  {Number(r.strategyQualityScore).toFixed(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>{r.pair} · {r.session}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {r.classificationLabel ?? r.classification} · {r.regime}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {new Date(r.evaluatedAt).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Statistics tab ───────────────────────────────────────────────────────────

function StatisticsTab() {
  const { data: statData } = useQuery({
    queryKey: ["/api/strategy/statistics"],
    queryFn: async () => {
      const r = await fetch(`${API}/strategy/statistics`);
      return r.json();
    },
    refetchInterval: 60_000,
  });
  const { data: clsData } = useQuery({
    queryKey: ["/api/strategy/classifications"],
    queryFn: async () => {
      const r = await fetch(`${API}/strategy/classifications`);
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const stats:     AggStats | null         = (statData?.statistics ?? null) as AggStats | null;
  const byPair:    PairStatRow[]           = (statData?.byPair    ?? []) as PairStatRow[];
  const bySession: SessionStatRow[]        = (statData?.bySession  ?? []) as SessionStatRow[];
  const cls:       ClassificationRow[]     = (clsData?.classifications ?? []) as ClassificationRow[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Aggregate */}
      {stats ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {([
            ["Total Reports", String(stats.totalReports), "#94a3b8"],
            ["Avg SQS",       Number(stats.avgSqs   ?? 0).toFixed(1), sqsColor(Number(stats.avgSqs ?? 0))],
            ["Max SQS",       Number(stats.maxSqs   ?? 0).toFixed(1), "#34d399"],
            ["Std Dev",       Number(stats.stddevSqs ?? 0).toFixed(1), "#64748b"],
          ] as [string, string, string][]).map(([lbl, val, col]) => (
            <div key={lbl} style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.04)", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: col }}>{val}</div>
              <div style={{ fontSize: 10, color: "#64748b" }}>{lbl}</div>
            </div>
          ))}
        </div>
      ) : <div style={{ color: "#64748b", textAlign: "center", padding: 20 }}>No data yet.</div>}

      {/* Classification distribution */}
      {cls.length > 0 && (
        <div style={{ padding: 14, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>CLASSIFICATION DISTRIBUTION</div>
          {cls.map((c) => {
            const color = classColor[c.classification] ?? "#94a3b8";
            const total = stats ? Number(stats.totalReports) : 0;
            const pct   = total > 0 ? (Number(c.count) / total) * 100 : 0;
            return (
              <div key={c.classification} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 12, color }}>{c.classificationLabel ?? c.classification}</span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>{String(c.count)} ({pct.toFixed(0)}%) · avg {Number(c.avgSqs ?? 0).toFixed(1)}</span>
                </div>
                <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pair comparison */}
      {byPair.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ padding: 14, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>PAIR COMPARISON</div>
            {byPair.map((p) => (
              <div key={p.pair} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 12, color: "#e2e8f0" }}>{p.pair}</span>
                  <span style={{ fontSize: 12, color: sqsColor(Number(p.avgSqs ?? 0)), fontWeight: 600 }}>
                    {Number(p.avgSqs ?? 0).toFixed(1)}
                  </span>
                </div>
                <ScoreBar score={Number(p.avgSqs ?? 0)} />
              </div>
            ))}
          </div>
          <div style={{ padding: 14, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>SESSION COMPARISON</div>
            {bySession.map((s) => (
              <div key={s.session} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 12, color: "#e2e8f0" }}>{s.session}</span>
                  <span style={{ fontSize: 12, color: sqsColor(Number(s.avgSqs ?? 0)), fontWeight: 600 }}>
                    {Number(s.avgSqs ?? 0).toFixed(1)}
                  </span>
                </div>
                <ScoreBar score={Number(s.avgSqs ?? 0)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StrategyQuality() {
  const [tab, setTab] = useState<"evaluate" | "report" | "history" | "statistics">("evaluate");
  const [lastReport, setLastReport] = useState<QualityReport | null>(null);
  const qc = useQueryClient();

  const handleReport = (r: QualityReport) => {
    setLastReport(r);
    setTab("report");
    qc.invalidateQueries({ queryKey: ["/api/strategy/quality"] });
    qc.invalidateQueries({ queryKey: ["/api/strategy/statistics"] });
    qc.invalidateQueries({ queryKey: ["/api/strategy/classifications"] });
  };

  const tabs = [
    { id: "evaluate",   label: "Evaluate" },
    { id: "report",     label: "Report" + (lastReport ? ` (${lastReport.strategyQualityScore.toFixed(0)})` : "") },
    { id: "history",    label: "History" },
    { id: "statistics", label: "Statistics" },
  ];

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1100, margin: "0 auto", fontFamily: "monospace" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0" }}>Strategy Quality Intelligence</div>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10,
            background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.4)" }}>
            ADVISORY ONLY
          </span>
        </div>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          Multi-dimensional setup quality evaluation — 7 intelligence components, SQS 0–100, 7-tier classification.
          Never modifies strategy or executes trades.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.07)", paddingBottom: 8 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{
            padding: "6px 16px", borderRadius: "6px 6px 0 0", border: "none", cursor: "pointer",
            background: tab === t.id ? "rgba(139,92,246,0.2)" : "transparent",
            color: tab === t.id ? "#a78bfa" : "#64748b",
            fontWeight: tab === t.id ? 600 : 400, fontSize: 13,
            borderBottom: tab === t.id ? "2px solid #7c3aed" : "2px solid transparent",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {tab === "evaluate"   && <EvaluateTab onReport={handleReport} />}
        {tab === "report"     && <ReportTab report={lastReport} />}
        {tab === "history"    && <HistoryTab />}
        {tab === "statistics" && <StatisticsTab />}
      </div>
    </div>
  );
}
