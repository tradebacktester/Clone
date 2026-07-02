import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const API = "/api";

const tabs = [
  "Final Decision",
  "Decision Rankings",
  "Simulations",
  "Opportunity Cost",
  "Evidence Explorer",
  "Historical Cases",
  "Confidence",
  "Counterfactual",
  "Timeline",
  "Reports",
] as const;
type Tab = (typeof tabs)[number];

function fetchJSON(url: string) {
  return fetch(url).then(r => r.json());
}

function Score({ value, max = 100, label }: { value: number; max?: number; label: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pct >= 70 ? "text-emerald-400" : pct >= 45 ? "text-yellow-400" : "text-rose-400";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className={color}>{value.toFixed(1)}</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

const DECISION_COLORS: Record<string, string> = {
  execute_trade:     "#10b981",
  wait_one_candle:   "#3b82f6",
  wait_confirmation: "#6366f1",
  reduce_position:   "#f59e0b",
  observation_mode:  "#8b5cf6",
  skip_trade:        "#f97316",
  emergency_pause:   "#ef4444",
};

function DecisionBadge({ type, label }: { type: string; label: string }) {
  const bg = DECISION_COLORS[type] ?? "#6b7280";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: bg }}
    >
      {label}
    </span>
  );
}

function MetricCard({ title, value, unit = "", hint }: { title: string; value: number | string; unit?: string; hint?: string }) {
  const numVal = typeof value === "number" ? value : null;
  const color = numVal !== null
    ? numVal >= 70 ? "text-emerald-400" : numVal >= 40 ? "text-yellow-400" : "text-rose-400"
    : "text-sky-400";
  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-4 pb-3">
        <div className="text-xs text-muted-foreground mb-1">{title}</div>
        <div className={`text-2xl font-bold ${color}`}>{value}{unit}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Tab: Final Decision ────────────────────────────────────────────────────────

function FinalDecisionTab({ judgment }: { judgment: any }) {
  if (!judgment) return <EmptyState msg="Run a judgment cycle first." />;
  const expl = judgment.explainability ?? {};
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Final Score" value={judgment.finalScore} unit="/100" />
        <MetricCard title="Confidence" value={judgment.finalConfidence} unit="%" />
        <MetricCard title="OC Score" value={judgment.opportunityCost?.opportunityCostScore ?? 0} />
        <MetricCard title="Duration" value={`${judgment.durationMs}ms`} />
      </div>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Final Decision</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <DecisionBadge type={judgment.finalDecision} label={judgment.finalDecisionLabel} />
            <Badge variant="outline" className="text-xs">Advisory Only</Badge>
          </div>
          <div className="text-sm text-muted-foreground leading-relaxed">
            {expl.whyBestRankedHighest}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { rank: 1, r: judgment.bestDecision },
          { rank: 2, r: judgment.secondBestDecision },
          { rank: 3, r: judgment.thirdBestDecision },
        ].map(({ rank, r }) => r && (
          <Card key={rank} className="bg-card border-border">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-2">#{rank} Decision</div>
              <DecisionBadge type={r.decisionType} label={r.decisionLabel} />
              <div className="mt-3 space-y-1">
                <Score value={r.overallScore} label="Score" />
                <Score value={r.confidence}   label="Confidence" />
                <Score value={100 - r.riskScore} label="Safety" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Key Risks</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {(expl.keyRisks ?? []).map((r: string, i: number) => (
              <li key={i} className="flex gap-2"><span className="text-rose-400">•</span>{r}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab: Decision Rankings ─────────────────────────────────────────────────────

function RankingsTab({ rankingsData }: { rankingsData: any }) {
  const rankings = rankingsData?.latestRankings ?? [];
  const history  = rankingsData?.rankHistory    ?? [];

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Composite Ranking (Latest Judgment)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[...rankings].sort((a: any, b: any) => b.overallScore - a.overallScore)}
              margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="decisionLabel" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-25} textAnchor="end" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 11 }} />
              <Bar dataKey="overallScore" name="Score" radius={[4, 4, 0, 0]}>
                {rankings.map((r: any) => (
                  <rect key={r.decisionType} fill={DECISION_COLORS[r.decisionType] ?? "#6b7280"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {[...rankings].sort((a: any, b: any) => a.rank - b.rank).map((r: any) => (
          <Card key={r.decisionType} className="bg-card border-border">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-muted-foreground w-6">#{r.rank}</span>
                  <DecisionBadge type={r.decisionType} label={r.decisionLabel} />
                </div>
                <span className="text-sm font-semibold">{r.overallScore.toFixed(1)}/100</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <Score value={r.confidence}             label="Confidence" />
                <Score value={r.historicalEvidence}     label="Evidence" />
                <Score value={r.statisticalReliability} label="Reliability" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{r.rankingReason}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {history.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-base">Historical Rank #1 Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={history} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="decisionType" tick={{ fontSize: 9, fill: "#94a3b8" }} angle={-20} textAnchor="end" />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 11 }} />
                <Bar dataKey="timesRank1" name="Times Rank 1" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="timesTop3"  name="Times Top 3"  fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Simulations ──────────────────────────────────────────────────────────

function SimulationsTab({ simsData, judgment }: { simsData: any; judgment: any }) {
  const latestSims = judgment?.simulations ?? simsData?.latestSimulations ?? [];
  const summary    = simsData?.summary ?? [];

  const radarData = latestSims.map((s: any) => ({
    subject:      s.decisionLabel?.split(" ").slice(0, 2).join(" ") ?? s.decisionType,
    probability:  s.expectedProbability,
    winRate:      s.historicalWinRate,
    confidence:   s.confidence,
    safety:       100 - s.expectedRisk,
  }));

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Multi-Scenario Radar</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.1)" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#94a3b8" }} />
              <Radar name="Probability" dataKey="probability" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
              <Radar name="Confidence"  dataKey="confidence"  stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
              <Radar name="Safety"      dataKey="safety"      stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 11 }} />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {latestSims.map((s: any) => (
          <Card key={s.decisionType} className="bg-card border-border">
            <CardContent className="pt-4 pb-3 space-y-3">
              <div className="flex items-center justify-between">
                <DecisionBadge type={s.decisionType} label={s.decisionLabel} />
                <span className="text-xs text-muted-foreground">EV: {s.expectedValue >= 0 ? "+" : ""}{s.expectedValue?.toFixed(2)}R</span>
              </div>
              <Score value={s.expectedProbability} label="Success Probability" />
              <Score value={s.historicalWinRate}   label="Historical Win Rate" />
              <Score value={s.confidence}           label="Confidence" />
              <Score value={100 - s.expectedRisk}  label="Safety Score" />
              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground pt-1">
                <div>RR: <span className="text-foreground font-medium">{s.expectedRR?.toFixed(1)}:1</span></div>
                <div>DD: <span className="text-foreground font-medium">{s.historicalDrawdown?.toFixed(1)}%</span></div>
                <div>n={s.sampleSize}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {summary.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-base">Aggregate Statistics</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left py-2">Decision</th>
                    <th className="text-right py-2">Avg Score</th>
                    <th className="text-right py-2">Avg Win Rate</th>
                    <th className="text-right py-2">Avg EV</th>
                    <th className="text-right py-2">Avg Rank</th>
                    <th className="text-right py-2">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s: any) => (
                    <tr key={s.decisionType} className="border-b border-border/50">
                      <td className="py-2">{s.decisionType}</td>
                      <td className="text-right">{Number(s.avgScore).toFixed(1)}</td>
                      <td className="text-right">{Number(s.avgWinRate).toFixed(1)}%</td>
                      <td className="text-right">{Number(s.avgEV) >= 0 ? "+" : ""}{Number(s.avgEV).toFixed(2)}</td>
                      <td className="text-right">{Number(s.avgRank).toFixed(1)}</td>
                      <td className="text-right">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Opportunity Cost ───────────────────────────────────────────────────────

function OpportunityCostTab({ ocData, judgment }: { ocData: any; judgment: any }) {
  const oc   = judgment?.opportunityCost ?? ocData?.latest;
  const dist = ocData?.distribution ?? [];
  const trend = (ocData?.trend ?? []).map((t: any) => ({
    time:    new Date(t.time ?? t.recordedAt).toLocaleTimeString(),
    oc:      t.ocScore,
    score:   t.score,
  }));

  if (!oc) return <EmptyState msg="No opportunity cost data yet." />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="OC Score" value={oc.opportunityCostScore} unit="" hint={oc.recommendation?.toUpperCase()} />
        <MetricCard title="OC Confidence" value={oc.confidence} unit="%" />
        <MetricCard title="Risk Avoided (Skip)" value={oc.riskAvoidedBySkipping} unit="" />
        <MetricCard title="Opp. Missed (Skip)" value={oc.opportunityMissedBySkipping} unit="" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-sm text-emerald-400">If Trade</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Expected Benefit</span>
              <span className="text-emerald-400">+{oc.ifTrade?.expectedBenefit?.toFixed(1)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Potential Downside</span>
              <span className="text-rose-400">-{oc.ifTrade?.potentialDownside?.toFixed(1)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t border-border pt-2">
              <span>Net EV</span>
              <span>{oc.ifTrade?.netExpectedValue >= 0 ? "+" : ""}{oc.ifTrade?.netExpectedValue?.toFixed(2)}R</span>
            </div>
            <p className="text-xs text-muted-foreground pt-1">{oc.ifTrade?.description}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-sm text-rose-400">If Skip</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Risk Avoided</span>
              <span className="text-emerald-400">+{oc.ifSkip?.expectedBenefit?.toFixed(1)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Missed Opportunity</span>
              <span className="text-rose-400">-{oc.ifSkip?.potentialDownside?.toFixed(1)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t border-border pt-2">
              <span>Net EV</span>
              <span>{oc.ifSkip?.netExpectedValue >= 0 ? "+" : ""}{oc.ifSkip?.netExpectedValue?.toFixed(2)}R</span>
            </div>
            <p className="text-xs text-muted-foreground pt-1">{oc.ifSkip?.description}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Reasoning</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">{oc.reasoning}</p>
          <div className="mt-3">
            <Badge variant="outline" className="capitalize">{oc.recommendation}</Badge>
          </div>
        </CardContent>
      </Card>

      {trend.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-base">OC Score Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={trend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" tick={{ fontSize: 9 }} />
                <YAxis domain={[-100, 100]} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 11 }} />
                <Area type="monotone" dataKey="oc" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} name="OC Score" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {dist.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-base">Recommendation Distribution</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {dist.map((d: any) => (
              <div key={d.recommendation} className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="capitalize">{d.recommendation}</Badge>
                <span className="text-muted-foreground">×{d.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Evidence Explorer ─────────────────────────────────────────────────────

function EvidenceExplorerTab({ judgment }: { judgment: any }) {
  if (!judgment) return <EmptyState msg="Run a judgment cycle first." />;
  const expl    = judgment.explainability ?? {};
  const snap    = judgment.intelligenceSnapshot ?? {};
  const evidence: string[] = expl.mostInfluentialEvidence ?? [];
  const refs:    string[]  = expl.historicalReferences    ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Executive Score" value={snap.executiveScore ?? 0} unit="/100" />
        <MetricCard title="Strategy Score"  value={snap.strategyScore  ?? 0} unit="/100" />
        <MetricCard title="Risk Score"      value={snap.riskScore      ?? 0} unit="/100" hint="Lower = safer" />
        <MetricCard title="Memory Win Rate" value={snap.memoryWinRate  ?? 0} unit="%" />
      </div>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Most Influential Evidence</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {evidence.map((e, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="text-sky-400 font-bold shrink-0">{i + 1}.</span>
                <span className="text-muted-foreground leading-relaxed">{e}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Intelligence Snapshot Radar</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={[
              { s: "Executive",  v: snap.executiveScore ?? 0 },
              { s: "Strategy",   v: snap.strategyScore  ?? 0 },
              { s: "Safety",     v: 100 - (snap.riskScore ?? 50) },
              { s: "Market",     v: snap.marketScore    ?? 0 },
              { s: "Memory",     v: snap.memoryWinRate  ?? 0 },
              { s: "Identity",   v: snap.identityScore  ?? 0 },
            ]}>
              <PolarGrid stroke="rgba(255,255,255,0.1)" />
              <PolarAngleAxis dataKey="s" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
              <Radar dataKey="v" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 11 }} />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Why Alternatives Were Rejected</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-2">
            {(expl.whyAlternativesRejected ?? []).map((reason: string, i: number) => (
              <li key={i} className="text-xs text-muted-foreground leading-relaxed border-b border-border/40 pb-2 last:border-0">
                {reason}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab: Historical Similar Cases ─────────────────────────────────────────────

function HistoricalCasesTab({ judgment }: { judgment: any }) {
  if (!judgment) return <EmptyState msg="Run a judgment cycle first." />;
  const expl = judgment.explainability ?? {};
  const sims = judgment.simulations   ?? [];

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Historical References</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {(expl.historicalReferences ?? []).map((r: string, i: number) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
                <span className="text-emerald-400 shrink-0">▸</span>{r}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {sims.map((s: any) => (
        <Card key={s.decisionType} className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <DecisionBadge type={s.decisionType} label={s.decisionLabel} />
              <span className="text-muted-foreground text-xs">n={s.sampleSize} similar setups</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {(s.similarCases ?? []).map((c: string, i: number) => (
                <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {c}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Tab: Confidence ───────────────────────────────────────────────────────────

function ConfidenceTab({ judgment }: { judgment: any }) {
  if (!judgment) return <EmptyState msg="Run a judgment cycle first." />;
  const expl   = judgment.explainability  ?? {};
  const ci     = expl.confidenceInterval ?? { lower: 0, upper: 100 };
  const note   = expl.statisticalReliabilityNote ?? "";
  const sims   = judgment.simulations ?? [];
  const confChartData = sims.map((s: any) => ({
    name:       s.decisionLabel?.split(" ").slice(0, 2).join(" "),
    confidence: s.confidence,
    probability: s.expectedProbability,
    reliability: s.sampleSize * 2.5,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Final Confidence" value={judgment.finalConfidence} unit="%" />
        <MetricCard title="CI Lower" value={ci.lower} unit="%" />
        <MetricCard title="CI Upper" value={ci.upper} unit="%" />
        <MetricCard title="Interval Width" value={ci.upper - ci.lower} unit="%" hint="Smaller = more precise" />
      </div>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Statistical Reliability Note</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">{note}</p>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Confidence by Candidate</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={confChartData} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-20} textAnchor="end" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="confidence"   name="Confidence"   fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="probability"  name="Probability"  fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab: Counterfactual ────────────────────────────────────────────────────────

function CounterfactualTab({ cfData }: { cfData: any }) {
  const list = cfData?.counterfactuals ?? [];
  const avgQ = cfData?.avgQualityScore ?? 0;

  if (list.length === 0) return <EmptyState msg="No counterfactual analyses yet. These populate after completed trades." />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard title="Total Analyses"  value={cfData?.totalAnalyses ?? 0} unit="" />
        <MetricCard title="Avg Decision Quality" value={avgQ} unit="/100" />
        <MetricCard title="Advisory Only" value="Yes" />
      </div>

      <div className="space-y-4">
        {list.slice(0, 10).map((cf: any) => (
          <Card key={cf.analysisId} className="bg-card border-border">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-2">
                <DecisionBadge type={cf.actualDecision} label={cf.actualDecision} />
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cf.actualOutcome === "win" ? "text-emerald-400" : cf.actualOutcome === "loss" ? "text-rose-400" : "text-muted-foreground"}>
                    {cf.actualOutcome}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{cf.actualPnL >= 0 ? "+" : ""}{cf.actualPnL?.toFixed(2)}R</span>
                </div>
              </div>
              <Score value={cf.decisionQualityScore} label="Decision Quality Score" />
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{cf.learningInsight}</p>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(cf.completedAt).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Timeline ──────────────────────────────────────────────────────────────

function TimelineTab({ reportData }: { reportData: any }) {
  const trend = reportData?.recentTrend ?? [];
  const dist  = reportData?.decisionDistribution ?? [];

  return (
    <div className="space-y-6">
      {trend.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-base">Judgment Score Over Time</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trend.map((t: any) => ({
                time:       new Date(t.time).toLocaleTimeString(),
                score:      t.score,
                confidence: t.confidence,
              }))} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" tick={{ fontSize: 9 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="score"      stroke="#10b981" fill="#10b981" fillOpacity={0.15} name="Score" />
                <Area type="monotone" dataKey="confidence" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1}  name="Confidence" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {dist.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-base">Final Decision Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dist.map((d: any) => {
                const total = dist.reduce((acc: number, x: any) => acc + Number(x.count), 0);
                const pct   = total > 0 ? (Number(d.count) / total) * 100 : 0;
                return (
                  <div key={d.decision} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <DecisionBadge type={d.decision} label={d.decision} />
                      <span className="text-muted-foreground">×{d.count} ({pct.toFixed(0)}%)</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {trend.length === 0 && dist.length === 0 && (
        <EmptyState msg="No timeline data yet. Run a judgment cycle to begin tracking." />
      )}
    </div>
  );
}

// ─── Tab: Reports ──────────────────────────────────────────────────────────────

function ReportsTab({ reportData }: { reportData: any }) {
  const r = reportData ?? {};
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Judgments" value={r.totalJudgments ?? 0} unit="" />
        <MetricCard title="Avg Score"       value={r.avgFinalScore  ?? 0} unit="/100" />
        <MetricCard title="Avg Confidence"  value={r.avgConfidence  ?? 0} unit="%" />
        <MetricCard title="Avg OC Score"    value={r.avgOCScore     ?? 0} unit="" />
      </div>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Report Summary</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            The Executive Judgment Engine has processed <strong className="text-foreground">{r.totalJudgments ?? 0}</strong> decision
            cycles with an average composite score of <strong className="text-foreground">{(r.avgFinalScore ?? 0).toFixed(1)}/100</strong>.
          </p>
          <p>
            Average decision confidence: <strong className="text-foreground">{(r.avgConfidence ?? 0).toFixed(1)}%</strong>.
            Average Opportunity Cost Score: <strong className="text-foreground">{(r.avgOCScore ?? 0).toFixed(1)}</strong>.
          </p>
          <p>
            Average system risk exposure at time of judgment:
            <strong className="text-foreground"> {(r.avgRiskScore ?? 0).toFixed(1)}/100</strong>.
          </p>
          <p className="text-xs border-t border-border pt-3">
            Engine Version: <code className="text-sky-400">{r.engineVersion ?? "1.0.0"}</code> ·
            Advisory Only · isAdvisoryOnly = true · Institutional-grade decision simulation
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-base">Decision Distribution (All Judgments)</CardTitle></CardHeader>
        <CardContent>
          {(r.decisionDistribution ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={(r.decisionDistribution ?? []).map((d: any) => ({
                  name:     d.decision,
                  count:    Number(d.count),
                  avgScore: Number(d.avgScore),
                }))}
                margin={{ top: 4, right: 16, left: 0, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} angle={-20} textAnchor="end" />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 11 }} />
                <Bar dataKey="count" name="Times Selected" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">Run judgment cycles to see distribution.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
      <div className="text-3xl">⚖️</div>
      <p className="text-sm">{msg}</p>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ExecutiveJudgmentPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Final Decision");

  const { data: judgeRes, refetch: refetchJudgment, isFetching: judging } = useQuery({
    queryKey: ["executive-judgment"],
    queryFn:  () => fetchJSON(`${API}/executive/judgment`),
    enabled:  false,
  });

  const judgment = judgeRes?.data;

  const { data: simsRes } = useQuery({
    queryKey: ["executive-simulations"],
    queryFn:  () => fetchJSON(`${API}/executive/simulations`),
    refetchInterval: 60_000,
  });

  const { data: rankRes } = useQuery({
    queryKey: ["executive-rankings"],
    queryFn:  () => fetchJSON(`${API}/executive/rankings`),
    refetchInterval: 60_000,
  });

  const { data: ocRes } = useQuery({
    queryKey: ["executive-opportunity-cost"],
    queryFn:  () => fetchJSON(`${API}/executive/opportunity-cost`),
    refetchInterval: 60_000,
  });

  const { data: cfRes } = useQuery({
    queryKey: ["executive-counterfactual"],
    queryFn:  () => fetchJSON(`${API}/executive/counterfactual`),
    refetchInterval: 60_000,
  });

  const { data: reportRes } = useQuery({
    queryKey: ["executive-report"],
    queryFn:  () => fetchJSON(`${API}/executive/report`),
    refetchInterval: 60_000,
  });

  const latestJudgment = judgment
    ?? (rankRes?.data?.latestJudgmentId ? null : null)
    ?? null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Executive Judgment Engine</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Phase 7.3 · Decision Simulation & Multi-Scenario Evaluation · Advisory Only
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sky-400 border-sky-400/30">Advisory Only</Badge>
          <Button
            size="sm"
            onClick={() => { refetchJudgment(); }}
            disabled={judging}
            className="bg-sky-600 hover:bg-sky-700"
          >
            {judging ? "Evaluating…" : "Run Judgment"}
          </Button>
        </div>
      </div>

      {/* Quick metrics */}
      {judgment && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <MetricCard title="Final Decision" value={judgment.finalDecisionLabel ?? "—"} />
          <MetricCard title="Final Score"    value={judgment.finalScore}          unit="/100" />
          <MetricCard title="Confidence"     value={judgment.finalConfidence}     unit="%" />
          <MetricCard title="OC Score"       value={judgment.opportunityCost?.opportunityCostScore ?? 0} />
          <MetricCard title="Simulations"    value={judgment.simulations?.length ?? 7} unit=" candidates" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              activeTab === tab
                ? "bg-sky-600 text-white"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {activeTab === "Final Decision"     && <FinalDecisionTab judgment={latestJudgment} />}
        {activeTab === "Decision Rankings"  && <RankingsTab rankingsData={rankRes?.data} />}
        {activeTab === "Simulations"        && <SimulationsTab simsData={simsRes?.data} judgment={latestJudgment} />}
        {activeTab === "Opportunity Cost"   && <OpportunityCostTab ocData={ocRes?.data} judgment={latestJudgment} />}
        {activeTab === "Evidence Explorer"  && <EvidenceExplorerTab judgment={latestJudgment} />}
        {activeTab === "Historical Cases"   && <HistoricalCasesTab judgment={latestJudgment} />}
        {activeTab === "Confidence"         && <ConfidenceTab judgment={latestJudgment} />}
        {activeTab === "Counterfactual"     && <CounterfactualTab cfData={cfRes?.data} />}
        {activeTab === "Timeline"           && <TimelineTab reportData={reportRes?.data} />}
        {activeTab === "Reports"            && <ReportsTab reportData={reportRes?.data} />}
      </div>
    </div>
  );
}
