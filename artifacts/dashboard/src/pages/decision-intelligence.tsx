// ─── Decision Intelligence Dashboard ─────────────────────────────────────────
// Advisory-only view of the Decision Intelligence Engine.
// Shows Trade Intelligence Score, recommendation, evidence, factors, and history.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from "recharts";
import {
  Brain, Zap, ShieldCheck, AlertTriangle, TrendingUp, TrendingDown,
  Info, CheckCircle2, XCircle, ChevronDown, ChevronUp, Loader2,
  Target, BarChart3, History, ListOrdered, Activity,
} from "lucide-react";

const API = "/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TisComponent {
  key: string;
  name: string;
  score: number;
  weight: number;
  weightedScore: number;
  explanation: string;
  isInsufficient: boolean;
  evidenceCount: number;
}

interface EvidenceFactor {
  name: string;
  impact: number;
  explanation: string;
  category: string;
  confidence: number;
}

interface SimilarExperience {
  tradeId: string;
  similarityScore: number;
  isWin: boolean;
  outcome: string;
  historicalRR: number;
  historicalConf: number;
  pair: string;
  session: string;
  regime: string;
  similarityReason: string;
}

interface ValidationFlag {
  type: string;
  message: string;
  severity: "warning" | "error" | "info";
}

interface TradeIntelligenceReport {
  recommendationId: string;
  tisScore: number;
  tisComponents: TisComponent[];
  recommendationLevel: string;
  recommendationLabel: string;
  confidenceScore: number;
  uncertaintyLevel: string;
  reliabilityRating: string;
  isLowConfidence: boolean;
  hasConflictingEvidence: boolean;
  reasoning: string;
  historicalEvidenceCount: number;
  similarWinCount: number;
  similarLossCount: number;
  historicalWinRate: number;
  statisticalExpectancy: number;
  positiveFactors: EvidenceFactor[];
  negativeFactors: EvidenceFactor[];
  similarWinningExperiences: SimilarExperience[];
  similarLosingExperiences: SimilarExperience[];
  validationFlags: ValidationFlag[];
  isAdvisoryOnly: true;
  setup: {
    pair: string;
    session: string;
    regime: string;
    trend: string;
    volatility: string;
    supplyQuality: number;
    demandQuality: number;
    liquidityScore: number;
    amdScore: number;
    confirmationQuality: number;
    tqi: number;
    rrPlanned: number;
    spreadPips: number;
  };
  evaluatedAt: string;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function tisColor(tis: number): string {
  if (tis >= 80) return "#22c55e";
  if (tis >= 65) return "#3b82f6";
  if (tis >= 50) return "#a78bfa";
  if (tis >= 35) return "#f59e0b";
  if (tis >= 20) return "#f97316";
  return "#ef4444";
}

function levelBadgeStyle(level: string): string {
  if (level === "exceptional")      return "bg-green-500/15 text-green-400 border-green-500/30";
  if (level === "high_quality")     return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  if (level === "good_opportunity") return "bg-purple-500/15 text-purple-400 border-purple-500/30";
  if (level === "neutral")          return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  if (level === "low_quality")      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
  return "bg-red-500/15 text-red-400 border-red-500/30";
}

function impactBar(impact: number, maxImpact = 60): React.ReactNode {
  const pct = Math.min(Math.abs(impact) / maxImpact * 100, 100);
  const positive = impact > 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: positive ? "#22c55e" : "#ef4444",
          }}
        />
      </div>
      <span className="text-xs font-mono" style={{ color: positive ? "#22c55e" : "#ef4444" }}>
        {positive ? "+" : ""}{impact.toFixed(0)}
      </span>
    </div>
  );
}

function flagIcon(sev: string) {
  if (sev === "error")   return <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
  if (sev === "warning") return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
  return <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />;
}

// ─── Card shell ───────────────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/8 bg-white/3 backdrop-blur-sm ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/8">
      {children}
    </div>
  );
}

// ─── Evaluate form ─────────────────────────────────────────────────────────────

const DEFAULT_SETUP = {
  pair: "EURUSD",
  session: "london",
  regime: "trending",
  trend: "bullish",
  supplyQuality: 70,
  demandQuality: 75,
  liquidityScore: 68,
  amdScore: 65,
  confirmationQuality: 62,
  setupScore: 68,
  tqi: 60,
  rrPlanned: 2.5,
  spreadPips: 0.8,
  volatility: "low",
  direction: "buy",
};

function EvaluatePanel({ onResult }: { onResult: (r: TradeIntelligenceReport) => void }) {
  const [form, setForm] = useState(DEFAULT_SETUP);
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const resp = await fetch(`${API}/learning/recommendations/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          supplyQuality:       Number(form.supplyQuality),
          demandQuality:       Number(form.demandQuality),
          liquidityScore:      Number(form.liquidityScore),
          amdScore:            Number(form.amdScore),
          confirmationQuality: Number(form.confirmationQuality),
          setupScore:          Number(form.setupScore),
          tqi:                 Number(form.tqi),
          rrPlanned:           Number(form.rrPlanned),
          spreadPips:          Number(form.spreadPips),
        }),
      });
      if (!resp.ok) throw new Error("Evaluation failed");
      return resp.json() as Promise<{ success: boolean; report: TradeIntelligenceReport }>;
    },
    onSuccess: (data) => {
      if (data.success) {
        onResult(data.report);
        qc.invalidateQueries({ queryKey: ["di-recommendations"] });
        qc.invalidateQueries({ queryKey: ["di-history"] });
      }
    },
  });

  const field = (label: string, key: keyof typeof form, type: "number" | "text" = "number") => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground font-mono">{label}</span>
      <input
        type={type}
        value={form[key]}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? (key === "spreadPips" || key === "rrPlanned" ? 0.1 : 1) : undefined}
        onChange={e => setForm(p => ({ ...p, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
        className="h-8 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-foreground
                   focus:outline-none focus:ring-1 focus:ring-violet-500/50 font-mono"
      />
    </label>
  );

  const select = (label: string, key: keyof typeof form, options: string[]) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground font-mono">{label}</span>
      <select
        value={String(form[key])}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        className="h-8 rounded-lg border border-white/10 bg-zinc-900 px-3 text-sm text-foreground
                   focus:outline-none focus:ring-1 focus:ring-violet-500/50"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-foreground">Evaluate Setup</span>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? "Collapse" : "Expand"}
        </button>
      </CardHeader>

      {expanded && (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {select("Pair",      "pair",    ["EURUSD", "GBPUSD", "USDJPY"])}
            {select("Session",   "session", ["london", "new_york", "asian"])}
            {select("Regime",    "regime",  ["trending", "ranging", "volatile", "low_volatility"])}
            {select("Trend",     "trend",   ["bullish", "bearish", "ranging"])}
            {select("Volatility","volatility", ["low", "medium", "high"])}
            {select("Direction", "direction",  ["buy", "sell"])}
          </div>
          <div className="grid grid-cols-4 gap-3">
            {field("Supply Quality (0–100)",      "supplyQuality")}
            {field("Demand Quality (0–100)",      "demandQuality")}
            {field("Liquidity Score (0–100)",     "liquidityScore")}
            {field("AMD Score (0–100)",           "amdScore")}
            {field("Confirmation Quality (0–100)","confirmationQuality")}
            {field("Setup Score (0–100)",         "setupScore")}
            {field("TQI (0–100)",                 "tqi")}
            {field("RR Planned",                  "rrPlanned")}
            {field("Spread (pips)",               "spreadPips")}
          </div>
        </div>
      )}

      <div className="px-5 pb-5 flex items-center gap-3">
        <button
          onClick={() => {
            if (!expanded) setExpanded(true);
            mutate();
          }}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
                     bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          {isPending ? "Evaluating…" : "Run Decision Intelligence"}
        </button>
        {!expanded && (
          <span className="text-xs text-muted-foreground">
            Using {form.pair} · {form.session} · {form.regime} · RR {form.rrPlanned}
          </span>
        )}
      </div>
    </Card>
  );
}

// ─── TIS Gauge ────────────────────────────────────────────────────────────────

function TisGauge({ tis, label }: { tis: number; label: string }) {
  const color = tisColor(tis);
  const data = [{ value: tis, fill: color }, { value: 100 - tis, fill: "rgba(255,255,255,0.04)" }];
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-40 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="60%" outerRadius="95%"
            data={data} startAngle={90} endAngle={-270}
          >
            <RadialBar dataKey="value" cornerRadius={6} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold font-mono" style={{ color }}>
            {tis.toFixed(0)}
          </span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${levelBadgeStyle(label)}`}>
        {LEVEL_LABELS[label] ?? label}
      </div>
    </div>
  );
}

const LEVEL_LABELS: Record<string, string> = {
  exceptional: "Exceptional Opportunity",
  high_quality: "High Quality",
  good_opportunity: "Good Opportunity",
  neutral: "Neutral",
  low_quality: "Low Quality",
  avoid: "Avoid",
};

// ─── Report view ──────────────────────────────────────────────────────────────

function ReportView({ report }: { report: TradeIntelligenceReport }) {
  const [tab, setTab] = useState<"overview"|"components"|"evidence"|"factors"|"flags">("overview");
  const tabs = [
    { id: "overview",    label: "Overview",    icon: Target },
    { id: "components",  label: "TIS Components", icon: BarChart3 },
    { id: "evidence",    label: "Evidence",    icon: History },
    { id: "factors",     label: "Factors",     icon: TrendingUp },
    { id: "flags",       label: "Flags",       icon: AlertTriangle },
  ] as const;

  const confidence = report.confidenceScore;
  const confColor  = confidence >= 60 ? "#22c55e" : confidence >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold">Trade Intelligence Report</span>
          <span className="text-xs font-mono text-muted-foreground">#{report.recommendationId.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Advisory Only
        </div>
      </CardHeader>

      {/* Tab nav */}
      <div className="flex gap-1 px-5 pt-4 border-b border-white/8">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors -mb-px border-b-2 ${
              tab === t.id
                ? "text-violet-400 border-violet-500 bg-violet-500/10"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            <t.icon className="w-3 h-3" />
            {t.label}
            {t.id === "flags" && report.validationFlags.length > 0 && (
              <span className="ml-0.5 px-1 py-0 text-[10px] rounded-full bg-amber-500/20 text-amber-400">
                {report.validationFlags.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-5">
        {/* ── Overview ── */}
        {tab === "overview" && (
          <div className="space-y-5">
            <div className="flex gap-6">
              {/* Gauge */}
              <TisGauge tis={report.tisScore} label={report.recommendationLevel} />

              {/* Stats */}
              <div className="flex-1 grid grid-cols-2 gap-3">
                {[
                  { label: "Confidence",        value: `${report.confidenceScore.toFixed(1)}%`, color: confColor },
                  { label: "Evidence Count",    value: `${report.historicalEvidenceCount} setups` },
                  { label: "Historical Win Rate", value: `${(report.historicalWinRate * 100).toFixed(1)}%` },
                  { label: "Similar Wins",      value: report.similarWinCount },
                  { label: "Similar Losses",    value: report.similarLossCount },
                  { label: "Uncertainty",       value: report.uncertaintyLevel },
                  { label: "Reliability",       value: report.reliabilityRating },
                  { label: "Expectancy",        value: `${report.statisticalExpectancy >= 0 ? "+" : ""}${report.statisticalExpectancy.toFixed(2)}` },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg border border-white/8 bg-white/3 p-3 space-y-1">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="text-sm font-semibold font-mono" style={color ? { color } : undefined}>{String(value)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Setup summary */}
            <div className="rounded-lg border border-white/8 bg-white/3 p-4 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Setup Evaluated</div>
              <div className="flex flex-wrap gap-2">
                {[
                  report.setup.pair,
                  report.setup.session,
                  report.setup.regime,
                  report.setup.trend,
                  report.setup.volatility,
                  `SZ:${Number(report.setup.supplyQuality).toFixed(0)}`,
                  `DZ:${Number(report.setup.demandQuality).toFixed(0)}`,
                  `LIQ:${Number(report.setup.liquidityScore).toFixed(0)}`,
                  `AMD:${Number(report.setup.amdScore).toFixed(0)}`,
                  `RR:${Number(report.setup.rrPlanned).toFixed(1)}`,
                  `SPR:${Number(report.setup.spreadPips).toFixed(2)}p`,
                ].map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-md text-xs font-mono border border-white/10 bg-white/5 text-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Reasoning */}
            <div className="rounded-lg border border-white/8 bg-white/3 p-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Reasoning</div>
              <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed">
                {report.reasoning}
              </pre>
            </div>
          </div>
        )}

        {/* ── TIS Components ── */}
        {tab === "components" && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground mb-3">
              15 individually auditable components — each score (0–100) × weight = weighted contribution to TIS.
            </div>
            {[...report.tisComponents].sort((a, b) => b.weightedScore - a.weightedScore).map(c => (
              <div key={c.key} className="rounded-lg border border-white/8 bg-white/3 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.name}</span>
                    {c.isInsufficient && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        low evidence
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-muted-foreground">wt {(c.weight * 100).toFixed(0)}%</span>
                    <span style={{ color: tisColor(c.score) }}>{c.score.toFixed(0)}/100</span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${c.score}%`, background: tisColor(c.score) }}
                  />
                </div>
                <div className="text-xs text-muted-foreground font-mono">{c.explanation.split(" — ")[1] ?? c.explanation}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Evidence ── */}
        {tab === "evidence" && (
          <div className="space-y-4">
            {report.historicalEvidenceCount === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No similar historical setups found above the similarity threshold.
                <br />
                <span className="text-xs">Run more trades to build the historical evidence base.</span>
              </div>
            ) : (
              <>
                {/* Wins */}
                {report.similarWinningExperiences.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-green-400 uppercase tracking-wide">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Similar Winning Experiences ({report.similarWinningExperiences.length})
                    </div>
                    {report.similarWinningExperiences.map((exp, i) => (
                      <div key={i} className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-foreground">{exp.pair} · {exp.session} · {exp.regime}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{exp.similarityReason}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-mono text-green-400">RR {exp.historicalRR.toFixed(1)}</div>
                          <div className="text-xs text-muted-foreground">Sim {(exp.similarityScore * 100).toFixed(0)}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Losses */}
                {report.similarLosingExperiences.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-red-400 uppercase tracking-wide">
                      <XCircle className="w-3.5 h-3.5" />
                      Similar Losing Experiences ({report.similarLosingExperiences.length})
                    </div>
                    {report.similarLosingExperiences.map((exp, i) => (
                      <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-foreground">{exp.pair} · {exp.session} · {exp.regime}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{exp.similarityReason}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-mono text-red-400">RR {exp.historicalRR.toFixed(1)}</div>
                          <div className="text-xs text-muted-foreground">Sim {(exp.similarityScore * 100).toFixed(0)}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Factors ── */}
        {tab === "factors" && (
          <div className="grid grid-cols-2 gap-4">
            {/* Positive */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-green-400 uppercase tracking-wide mb-1">
                <TrendingUp className="w-3.5 h-3.5" />
                Positive Factors ({report.positiveFactors.length})
              </div>
              {report.positiveFactors.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4">No strong positive factors identified.</div>
              ) : report.positiveFactors.map((f, i) => (
                <div key={i} className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{f.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-mono">
                      {f.category}
                    </span>
                  </div>
                  {impactBar(f.impact)}
                  <div className="text-xs text-muted-foreground leading-relaxed">{f.explanation}</div>
                </div>
              ))}
            </div>

            {/* Negative */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-red-400 uppercase tracking-wide mb-1">
                <TrendingDown className="w-3.5 h-3.5" />
                Negative Factors ({report.negativeFactors.length})
              </div>
              {report.negativeFactors.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4">No significant negative factors identified.</div>
              ) : report.negativeFactors.map((f, i) => (
                <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{f.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-mono">
                      {f.category}
                    </span>
                  </div>
                  {impactBar(f.impact)}
                  <div className="text-xs text-muted-foreground leading-relaxed">{f.explanation}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Flags ── */}
        {tab === "flags" && (
          <div className="space-y-3">
            {report.validationFlags.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-green-400 text-sm">
                <ShieldCheck className="w-4 h-4" />
                No validation flags — recommendation passes all safeguards.
              </div>
            ) : report.validationFlags.map((f, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-lg border p-3 ${
                  f.severity === "error"   ? "border-red-500/30 bg-red-500/8" :
                  f.severity === "warning" ? "border-amber-500/30 bg-amber-500/8" :
                  "border-blue-500/30 bg-blue-500/8"
                }`}
              >
                {flagIcon(f.severity)}
                <div>
                  <div className="text-xs font-semibold font-mono text-foreground/90">{f.type}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{f.message}</div>
                </div>
              </div>
            ))}

            <div className="mt-4 p-3 rounded-lg border border-white/8 bg-white/3 text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground/70">Advisory notice: </span>
              This is an evidence-based recommendation only. KRYTOS does not execute trades based on these scores.
              Always apply your own analysis before acting on any recommendation.
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Recommendation history ───────────────────────────────────────────────────

function HistoryPanel() {
  const { data } = useQuery({
    queryKey: ["di-recommendations"],
    queryFn: async () => {
      const r = await fetch(`${API}/learning/recommendations?limit=20`);
      return r.json() as Promise<{ recommendations: TradeIntelligenceReport[]; accuracyStats?: { accuracyRate: number; totalWithOutcome: number } }>;
    },
    refetchInterval: 30_000,
  });

  const recs = data?.recommendations ?? [];
  const acc  = data?.accuracyStats;

  // Level distribution for chart
  const levelCounts: Record<string, number> = {};
  recs.forEach(r => {
    const lbl = LEVEL_LABELS[r.recommendationLevel ?? ""] ?? r.recommendationLevel;
    levelCounts[lbl] = (levelCounts[lbl] ?? 0) + 1;
  });
  const chartData = Object.entries(levelCounts).map(([level, count]) => ({ level, count }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold">Recommendation History</span>
        </div>
        {acc && acc.totalWithOutcome > 0 && (
          <div className="text-xs text-muted-foreground">
            Accuracy: <span className="text-green-400 font-mono">{(acc.accuracyRate * 100).toFixed(0)}%</span>
            {" "}({acc.totalWithOutcome} resolved)
          </div>
        )}
      </CardHeader>

      <div className="p-5 space-y-4">
        {/* Chart */}
        {chartData.length > 0 && (
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="level" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }} />
                <Tooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                  labelStyle={{ color: "rgba(255,255,255,0.8)", fontSize: 11 }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={
                      entry.level.includes("Exceptional") ? "#22c55e" :
                      entry.level.includes("High")        ? "#3b82f6" :
                      entry.level.includes("Good")        ? "#a78bfa" :
                      entry.level.includes("Neutral")     ? "#f59e0b" :
                      entry.level.includes("Low")         ? "#f97316" : "#ef4444"
                    } />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* List */}
        {recs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No recommendations yet — run your first evaluation above.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {recs.map(r => {
              const level = r.recommendationLevel;
              return (
                <div
                  key={r.recommendationId}
                  className="flex items-center justify-between rounded-lg border border-white/8 bg-white/3 px-3 py-2.5 gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tisColor(r.tisScore) }} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {r.setup?.pair ?? "—"} · {r.setup?.session ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.evaluatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm font-mono" style={{ color: tisColor(r.tisScore) }}>
                      {Number(r.tisScore).toFixed(0)}
                    </span>
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${levelBadgeStyle(level)}`}>
                      {LEVEL_LABELS[level] ?? level}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Status strip ──────────────────────────────────────────────────────────────

function StatusStrip() {
  const { data } = useQuery({
    queryKey: ["di-status"],
    queryFn: async () => {
      const r = await fetch(`${API}/learning/trade-intelligence`);
      return r.json();
    },
    refetchInterval: 15_000,
  });

  if (!data) return null;

  const items = [
    { label: "Engine",          value: `DI v${data.version ?? "1.0.0"}`,              color: "#a78bfa" },
    { label: "Total Evaluated", value: (data.totalEvaluations ?? 0) + (data.dbEvaluations ?? 0) },
    { label: "Advisory Only",   value: "✓ Active",                                     color: "#22c55e" },
    { label: "No Auto-Trade",   value: "✓ Enforced",                                   color: "#22c55e" },
    { label: "Last Evaluated",  value: data.lastEvaluatedAt
        ? new Date(data.lastEvaluatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "Never" },
  ];

  return (
    <div className="flex gap-4 flex-wrap">
      {items.map(({ label, value, color }) => (
        <div key={label} className="rounded-lg border border-white/8 bg-white/3 px-4 py-2.5 space-y-0.5">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-sm font-semibold font-mono" style={color ? { color } : undefined}>
            {String(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DecisionIntelligence() {
  const [latestReport, setLatestReport] = useState<TradeIntelligenceReport | null>(null);

  return (
    <div className="flex flex-col gap-5 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-5 h-5 text-violet-400" />
            <h1 className="text-xl font-bold tracking-tight">Decision Intelligence</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Evaluates every detected setup against full historical evidence and generates an explainable
            Trade Intelligence Report. <span className="text-violet-400 font-semibold">Advisory only — no trades are executed.</span>
          </p>
        </div>
      </div>

      {/* Status */}
      <StatusStrip />

      {/* Evaluate + Report */}
      <EvaluatePanel onResult={setLatestReport} />

      {latestReport ? (
        <ReportView report={latestReport} />
      ) : (
        <div className="rounded-xl border border-dashed border-white/12 bg-white/2 py-16 text-center text-muted-foreground text-sm">
          <Brain className="w-8 h-8 mx-auto mb-3 opacity-30" />
          Run an evaluation above to see the Trade Intelligence Report.
        </div>
      )}

      {/* History */}
      <HistoryPanel />
    </div>
  );
}
