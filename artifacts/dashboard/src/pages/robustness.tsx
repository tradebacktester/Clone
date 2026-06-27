import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Play, RefreshCw, Download, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, AlertTriangle, Clock, Shield,
  TrendingUp, Activity, Zap, BarChart3, Target, Brain,
} from "lucide-react";
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  LineChart, Line, ReferenceLine,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipelineStatus {
  status: "idle" | "running" | "complete" | "failed";
  stage: string;
  progress: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

interface SimStats {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  expectancy: number;
  sharpeRatio: number;
  totalPnl: number;
  finalBalance: number;
  avgWin: number;
  avgLoss: number;
  maxConsecLosses: number;
  maxConsecWins: number;
  calmarRatio: number;
}

interface ParameterVariation {
  level: number;
  paramValue: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  expectancy: number;
  deltaWinRate: number;
  deltaProfitFactor: number;
  deltaDrawdown: number;
  deltaExpectancy: number;
}

interface ParameterResult {
  parameter: string;
  description: string;
  baseline: number;
  unit: string;
  variations: ParameterVariation[];
  sensitivityScore: number;
  overlySensitive: boolean;
  recommendation: string;
}

interface SensitivityResult {
  parameters: ParameterResult[];
  overallSensitivityScore: number;
  stableParameters: string[];
  sensitiveParameters: string[];
  findings: string[];
  durationMs: number;
}

interface MarketScenario {
  condition: string;
  label: string;
  description: string;
  stats: SimStats;
  baselineComparison: {
    winRateDelta: number;
    profitFactorDelta: number;
    drawdownDelta: number;
    expectancyDelta: number;
  };
  verdict: "robust" | "degraded" | "critical";
}

interface MarketStressResult {
  baseline: SimStats;
  scenarios: MarketScenario[];
  overallRobustScore: number;
  worstCondition: string;
  findings: string[];
  durationMs: number;
}

interface ExecutionScenario {
  imperfection: string;
  label: string;
  description: string;
  params: Record<string, number>;
  stats: SimStats;
  pnlImpact: number;
  winRateImpact: number;
  verdict: "acceptable" | "degraded" | "critical";
}

interface ExecutionStressResult {
  baseline: SimStats;
  scenarios: ExecutionScenario[];
  overallResilienceScore: number;
  worstImperfection: string;
  totalWorstCasePnlImpact: number;
  findings: string[];
  durationMs: number;
}

interface DrawdownRecovery {
  drawdownDepthPct: number;
  recoveryTrades: number;
  recoveryDays: number;
  probabilityOfRecovery: number;
}

interface RiskStressResult {
  losingStreak: {
    maxConsecutiveLosses: number;
    maxDrawdownFromStreak: number;
    recoveryTradesNeeded: number;
    occurrenceCount: number;
    streakDegradationPct: number;
  };
  drawdownRecovery: DrawdownRecovery[];
  positionSizingResilience: {
    at50pctEquity: SimStats;
    at75pctEquity: SimStats;
    at125pctEquity: SimStats;
  };
  dailyLimitBreaches: number;
  weeklyLimitBreaches: number;
  overallResilienceScore: number;
  findings: string[];
  durationMs: number;
}

interface WalkForwardResult {
  windows: number;
  passedWindows: number;
  avgEfficiencyRatio: number;
  parameterStability: number;
  overfitScore: number;
  regimeSensitivity: number;
  consistencyScore: number;
  overallScore: number;
  recommendation: "Pass" | "Marginal" | "Overfit";
  findings: string[];
  durationMs: number;
}

interface OOSSplit {
  trainPct: number;
  testPct: number;
  trainStats: SimStats;
  testStats: SimStats;
  efficiencyRatio: number;
  degradationPct: number;
  passed: boolean;
}

interface OOSResult {
  splits: OOSSplit[];
  avgEfficiencyRatio: number;
  avgDegradationPct: number;
  passed: boolean;
  overallScore: number;
  findings: string[];
  durationMs: number;
}

interface ConfidenceStabilityResult {
  runs: number;
  avgConfidence: number;
  confidenceStdDev: number;
  coefficientOfVariation: number;
  maxConfidenceSwing: number;
  overreactionEvents: number;
  stable: boolean;
  overallScore: number;
  findings: string[];
  durationMs: number;
}

interface RobustnessScore {
  overall: number;
  grade: string;
  verdict: string;
  breakdown: {
    stability: number;
    generalization: number;
    riskResilience: number;
    executionResilience: number;
    dataQuality: number;
  };
}

interface PipelineResult {
  id: string;
  runAt: string;
  pair: string;
  durationMs: number;
  score: RobustnessScore;
  sensitivity: SensitivityResult;
  marketStress: MarketStressResult;
  executionStress: ExecutionStressResult;
  riskStress: RiskStressResult;
  walkForward: WalkForwardResult;
  oos: OOSResult;
  confidenceStability: ConfidenceStabilityResult;
  findings: string[];
  recommendations: string[];
}

interface RunConfig {
  pair: string;
  numSimTrades: string;
  baseWinRate: string;
  baseRR: string;
  riskPerTrade: string;
  skipWalkForward: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API = "/api";

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function pct(v: number, dec = 1): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-400";
  if (score >= 55) return "text-yellow-400";
  if (score >= 35) return "text-orange-400";
  return "text-red-400";
}

function scoreBarColor(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 55) return "bg-yellow-500";
  if (score >= 35) return "bg-orange-500";
  return "bg-red-500";
}

function gradeBadge(grade: string, verdict: string) {
  const gradeColors: Record<string, string> = {
    A: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    B: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
    C: "bg-orange-500/20 text-orange-400 border-orange-500/40",
    D: "bg-red-500/20 text-red-400 border-red-500/40",
    F: "bg-red-900/40 text-red-300 border-red-500/40",
  };
  const verdictLabels: Record<string, string> = {
    robust: "ROBUST",
    acceptable: "ACCEPTABLE",
    needs_work: "NEEDS WORK",
    fragile: "FRAGILE",
  };
  return { color: gradeColors[grade] ?? gradeColors["F"]!, label: verdictLabels[verdict] ?? verdict.toUpperCase() };
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-mono font-bold ${scoreColor(score)}`}>{score}</span>
      </div>
      <div className="h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${scoreBarColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function VerdictBadge({ verdict, size = "sm" }: { verdict: string; size?: "sm" | "md" }) {
  const colors: Record<string, string> = {
    robust: "bg-emerald-500/20 text-emerald-400",
    acceptable: "bg-yellow-500/20 text-yellow-400",
    degraded: "bg-orange-500/20 text-orange-400",
    critical: "bg-red-500/20 text-red-400",
    Pass: "bg-emerald-500/20 text-emerald-400",
    Marginal: "bg-yellow-500/20 text-yellow-400",
    Overfit: "bg-red-500/20 text-red-400",
    acceptable_exec: "bg-emerald-500/20 text-emerald-400",
  };
  const labels: Record<string, string> = {
    robust: "Robust", acceptable: "Acceptable", degraded: "Degraded", critical: "Critical",
    Pass: "Pass", Marginal: "Marginal", Overfit: "Overfit",
  };
  const cls = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-xs";
  return (
    <span className={`${cls} rounded font-medium ${colors[verdict] ?? "bg-muted text-muted-foreground"}`}>
      {labels[verdict] ?? verdict}
    </span>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = false }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="border-border bg-card">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

function StatCell({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-mono font-semibold">{value}</div>
      {delta !== undefined && (
        <div className={`text-xs font-mono ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {pct(delta)}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RobustnessPage() {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [config, setConfig] = useState<RunConfig>({
    pair: "ALL", numSimTrades: "400", baseWinRate: "52",
    baseRR: "2.0", riskPerTrade: "0.75", skipWalkForward: false,
  });
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API}/robustness/status`);
      if (r.ok) setStatus(await r.json());
    } catch {}
  }, []);

  const fetchLatest = useCallback(async () => {
    try {
      const r = await fetch(`${API}/robustness/results/latest`);
      if (r.ok) setResult(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchLatest();
  }, [fetchStatus, fetchLatest]);

  useEffect(() => {
    if (status?.status === "running") {
      pollingRef.current = setInterval(async () => {
        await fetchStatus();
        const r = await fetch(`${API}/robustness/status`);
        if (r.ok) {
          const s: PipelineStatus = await r.json();
          setStatus(s);
          if (s.status === "complete" || s.status === "failed") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            await fetchLatest();
          }
        }
      }, 1500);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [status?.status, fetchStatus, fetchLatest]);

  async function handleRun() {
    setError(null);
    setReportGenerated(false);
    try {
      const r = await fetch(`${API}/robustness/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair: config.pair,
          numSimTrades: parseInt(config.numSimTrades),
          baseWinRate: parseFloat(config.baseWinRate),
          baseRR: parseFloat(config.baseRR),
          riskPerTrade: parseFloat(config.riskPerTrade),
          skipWalkForward: config.skipWalkForward,
        }),
      });
      if (r.status === 409) { setError("Pipeline is already running"); return; }
      if (!r.ok) { setError("Failed to start pipeline"); return; }
      await fetchStatus();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleGenerateReport() {
    setReportGenerating(true);
    try {
      const r = await fetch(`${API}/robustness/report`, { method: "POST" });
      if (r.ok) {
        const data = await r.json();
        const blob = new Blob([data.content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ROBUSTNESS_REPORT.md";
        a.click();
        URL.revokeObjectURL(url);
        setReportGenerated(true);
      }
    } catch {}
    setReportGenerating(false);
  }

  const isRunning = status?.status === "running";
  const hasResult = result !== null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Strategy Robustness & Stress Testing
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Validate strategy stability under adverse market conditions without modifying core rules
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasResult && (
              <button
                onClick={handleGenerateReport}
                disabled={reportGenerating}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-xs hover:bg-muted/50 disabled:opacity-50"
              >
                {reportGenerating
                  ? <RefreshCw className="w-3 h-3 animate-spin" />
                  : <Download className="w-3 h-3" />
                }
                {reportGenerated ? "Downloaded!" : "ROBUSTNESS_REPORT.md"}
              </button>
            )}
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {isRunning
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Running…</>
                : <><Play className="w-3 h-3" /> Run Pipeline</>
              }
            </button>
          </div>
        </div>

        {/* Config Row */}
        <div className="flex flex-wrap items-center gap-4 mt-3">
          {[
            { label: "Pair", key: "pair", type: "text" },
            { label: "Sim Trades", key: "numSimTrades", type: "number", min: "50", max: "2000" },
            { label: "Win Rate %", key: "baseWinRate", type: "number", step: "0.5", min: "30", max: "80" },
            { label: "R:R Ratio", key: "baseRR", type: "number", step: "0.1", min: "1", max: "5" },
            { label: "Risk %", key: "riskPerTrade", type: "number", step: "0.1", min: "0.1", max: "3" },
          ].map(({ label, key, type, ...rest }) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{label}:</span>
              <input
                type={type}
                {...rest}
                value={config[key as keyof RunConfig] as string}
                onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
                disabled={isRunning}
                className="w-20 px-2 py-1 rounded border border-border bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>
          ))}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={config.skipWalkForward}
              onChange={e => setConfig(c => ({ ...c, skipWalkForward: e.target.checked }))}
              disabled={isRunning}
              className="rounded"
            />
            Skip walk-forward (faster)
          </label>
        </div>

        {error && (
          <div className="mt-2 text-xs text-red-400 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> {error}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {isRunning && status && (
        <div className="border-b border-border px-6 py-3 flex-shrink-0 bg-blue-950/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs text-blue-400">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span className="font-medium">{status.stage}</span>
            </div>
            <span className="text-xs font-mono text-muted-foreground">{status.progress}%</span>
          </div>
          <div className="h-1 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${status.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {!hasResult && !isRunning && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Shield className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground text-sm">No robustness data yet.</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Click "Run Pipeline" to run all 7 stress-testing engines.</p>
          </div>
        )}

        {hasResult && result && (
          <>
            {/* Score Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Big Score Card */}
              <Card className="border-border bg-card lg:col-span-1">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center">
                    <div className="relative w-36 h-36 mb-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart
                          innerRadius="60%" outerRadius="90%"
                          data={[{ value: result.score.overall, fill: result.score.overall >= 75 ? "hsl(142,76%,36%)" : result.score.overall >= 55 ? "hsl(38,92%,50%)" : "hsl(0,84%,60%)" }]}
                          startAngle={90} endAngle={-270}
                        >
                          <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "hsl(var(--border))" }} />
                        </RadialBarChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-3xl font-bold ${scoreColor(result.score.overall)}`}>
                          {result.score.overall}
                        </span>
                        <span className="text-xs text-muted-foreground">/ 100</span>
                      </div>
                    </div>
                    {(() => {
                      const { color, label } = gradeBadge(result.score.grade, result.score.verdict);
                      return (
                        <div className={`px-3 py-1 rounded border text-sm font-bold ${color}`}>
                          {result.score.grade} — {label}
                        </div>
                      );
                    })()}
                    <div className="text-xs text-muted-foreground mt-2">
                      {result.pair} · {fmtDuration(result.durationMs)}
                    </div>
                    <div className="text-xs text-muted-foreground/60">
                      {new Date(result.runAt).toLocaleString()}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Breakdown */}
              <Card className="border-border bg-card lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">Score Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pb-6">
                  <ScoreBar score={result.score.breakdown.stability} label="Stability (param sensitivity + walk-forward)" />
                  <ScoreBar score={result.score.breakdown.generalization} label="Generalization (OOS + walk-forward efficiency)" />
                  <ScoreBar score={result.score.breakdown.riskResilience} label="Risk Resilience" />
                  <ScoreBar score={result.score.breakdown.executionResilience} label="Execution Resilience" />
                  <ScoreBar score={result.score.breakdown.dataQuality} label="Data Quality" />
                </CardContent>
              </Card>
            </div>

            {/* 1. Parameter Sensitivity */}
            <Section title="1. Parameter Sensitivity Analysis" icon={Target} defaultOpen>
              <div className="space-y-4">
                <div className="flex gap-6 text-xs">
                  <div>
                    <span className="text-muted-foreground">Overall sensitivity: </span>
                    <span className={`font-mono font-bold ${scoreColor(100 - result.sensitivity.overallSensitivityScore)}`}>
                      {result.sensitivity.overallSensitivityScore.toFixed(1)}/100
                    </span>
                    <span className="text-muted-foreground"> (lower = more stable)</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Stable: </span>
                    <span className="text-emerald-400 font-medium">{result.sensitivity.stableParameters.length}</span>
                    <span className="text-muted-foreground"> · Sensitive: </span>
                    <span className={`font-medium ${result.sensitivity.sensitiveParameters.length > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                      {result.sensitivity.sensitiveParameters.length}
                    </span>
                  </div>
                </div>

                {result.sensitivity.parameters.map(param => (
                  <div key={param.parameter} className={`rounded-lg border p-3 space-y-2 ${param.overlySensitive ? "border-orange-500/40 bg-orange-950/10" : "border-border"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium">{param.parameter}</span>
                        {param.overlySensitive && <span className="ml-2 text-xs text-orange-400">⚠ Overly Sensitive</span>}
                        <div className="text-xs text-muted-foreground mt-0.5">{param.description}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold font-mono ${scoreColor(100 - param.sensitivityScore)}`}>{param.sensitivityScore.toFixed(0)}</div>
                        <div className="text-xs text-muted-foreground">sensitivity</div>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground border-b border-border">
                            <th className="text-left pb-1">Variation</th>
                            <th className="text-right pb-1">Win Rate Δ</th>
                            <th className="text-right pb-1">PF Δ</th>
                            <th className="text-right pb-1">DD Δ</th>
                            <th className="text-right pb-1">Expectancy Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {param.variations.map(v => (
                            <tr key={v.level} className={v.level === 0 ? "font-medium text-primary" : ""}>
                              <td className="py-0.5 font-mono">{v.level === 0 ? "baseline" : `${v.level > 0 ? "+" : ""}${v.level}%`}</td>
                              <td className={`text-right font-mono ${v.deltaWinRate >= 0 ? "text-emerald-400" : "text-red-400"}`}>{v.level === 0 ? "—" : pct(v.deltaWinRate)}</td>
                              <td className={`text-right font-mono ${v.deltaProfitFactor >= 0 ? "text-emerald-400" : "text-red-400"}`}>{v.level === 0 ? "—" : pct(v.deltaProfitFactor)}</td>
                              <td className={`text-right font-mono ${v.deltaDrawdown <= 0 ? "text-emerald-400" : "text-red-400"}`}>{v.level === 0 ? "—" : pct(v.deltaDrawdown)}</td>
                              <td className={`text-right font-mono ${v.deltaExpectancy >= 0 ? "text-emerald-400" : "text-red-400"}`}>{v.level === 0 ? "—" : pct(v.deltaExpectancy)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {param.recommendation && (
                      <div className="text-xs text-muted-foreground italic">{param.recommendation}</div>
                    )}
                  </div>
                ))}

                {result.sensitivity.findings.length > 0 && (
                  <FindingsList findings={result.sensitivity.findings} />
                )}
              </div>
            </Section>

            {/* 2. Market Stress */}
            <Section title="2. Market Stress Testing" icon={Activity}>
              <div className="space-y-4">
                <div className="flex items-center gap-6 text-xs">
                  <div>
                    <span className="text-muted-foreground">Overall: </span>
                    <span className={`font-mono font-bold ${scoreColor(result.marketStress.overallRobustScore)}`}>
                      {result.marketStress.overallRobustScore.toFixed(0)}/100
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Worst condition: </span>
                    <span className="font-mono text-orange-400">{result.marketStress.worstCondition}</span>
                  </div>
                </div>

                {/* Baseline stats */}
                <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Baseline (Normal Market)</div>
                  <div className="grid grid-cols-5 gap-3">
                    <StatCell label="Win Rate" value={`${result.marketStress.baseline.winRate.toFixed(1)}%`} />
                    <StatCell label="Profit Factor" value={result.marketStress.baseline.profitFactor.toFixed(2)} />
                    <StatCell label="Max DD" value={`${result.marketStress.baseline.maxDrawdown.toFixed(1)}%`} />
                    <StatCell label="Expectancy" value={`$${result.marketStress.baseline.expectancy.toFixed(0)}`} />
                    <StatCell label="Sharpe" value={result.marketStress.baseline.sharpeRatio.toFixed(2)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {result.marketStress.scenarios.map(s => (
                    <div
                      key={s.condition}
                      className={`rounded-lg border p-3 space-y-2 ${
                        s.verdict === "robust" ? "border-emerald-500/30 bg-emerald-950/10" :
                        s.verdict === "degraded" ? "border-yellow-500/30 bg-yellow-950/10" :
                        "border-red-500/30 bg-red-950/10"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{s.label}</span>
                        <VerdictBadge verdict={s.verdict} />
                      </div>
                      <div className="text-xs text-muted-foreground">{s.description}</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <StatCell label="Win Rate Δ" value={pct(s.baselineComparison.winRateDelta)} delta={s.baselineComparison.winRateDelta} />
                        <StatCell label="PF Δ" value={pct(s.baselineComparison.profitFactorDelta)} delta={s.baselineComparison.profitFactorDelta} />
                        <StatCell label="DD Δ" value={pct(s.baselineComparison.drawdownDelta)} delta={-s.baselineComparison.drawdownDelta} />
                        <StatCell label="Expectancy Δ" value={pct(s.baselineComparison.expectancyDelta)} delta={s.baselineComparison.expectancyDelta} />
                      </div>
                    </div>
                  ))}
                </div>

                {result.marketStress.findings.length > 0 && <FindingsList findings={result.marketStress.findings} />}
              </div>
            </Section>

            {/* 3. Execution Stress */}
            <Section title="3. Execution Stress Testing" icon={Zap}>
              <div className="space-y-4">
                <div className="flex items-center gap-6 text-xs">
                  <div>
                    <span className="text-muted-foreground">Resilience: </span>
                    <span className={`font-mono font-bold ${scoreColor(result.executionStress.overallResilienceScore)}`}>
                      {result.executionStress.overallResilienceScore.toFixed(0)}/100
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Worst: </span>
                    <span className="font-mono text-orange-400">{result.executionStress.worstImperfection}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total worst-case PnL impact: </span>
                    <span className="font-mono text-red-400">{pct(result.executionStress.totalWorstCasePnlImpact)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {result.executionStress.scenarios.map(s => (
                    <div
                      key={s.imperfection}
                      className={`rounded-lg border p-3 space-y-2 ${
                        s.verdict === "acceptable" ? "border-emerald-500/30 bg-emerald-950/10" :
                        s.verdict === "degraded" ? "border-yellow-500/30 bg-yellow-950/10" :
                        "border-red-500/30 bg-red-950/10"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{s.label}</span>
                        <VerdictBadge verdict={s.verdict} />
                      </div>
                      <div className="text-xs text-muted-foreground">{s.description}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <StatCell label="PnL Impact" value={pct(s.pnlImpact)} delta={s.pnlImpact} />
                        <StatCell label="Win Rate Δ" value={pct(s.winRateImpact)} delta={s.winRateImpact} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <StatCell label="Trades" value={String(s.stats.totalTrades)} />
                        <StatCell label="Max DD" value={`${s.stats.maxDrawdown.toFixed(1)}%`} />
                      </div>
                    </div>
                  ))}
                </div>

                {result.executionStress.findings.length > 0 && <FindingsList findings={result.executionStress.findings} />}
              </div>
            </Section>

            {/* 4. Risk Stress */}
            <Section title="4. Risk Stress Testing" icon={Shield}>
              <div className="space-y-4">
                <div className="text-xs">
                  <span className="text-muted-foreground">Resilience: </span>
                  <span className={`font-mono font-bold ${scoreColor(result.riskStress.overallResilienceScore)}`}>
                    {result.riskStress.overallResilienceScore.toFixed(0)}/100
                  </span>
                </div>

                {/* Losing Streak */}
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Losing Streak Analysis</div>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    <StatCell label="Max Consec. Losses" value={String(result.riskStress.losingStreak.maxConsecutiveLosses)} />
                    <StatCell label="DD from Streak" value={`${result.riskStress.losingStreak.maxDrawdownFromStreak.toFixed(1)}%`} />
                    <StatCell label="Recovery Trades" value={String(result.riskStress.losingStreak.recoveryTradesNeeded)} />
                    <StatCell label="Occurrences" value={String(result.riskStress.losingStreak.occurrenceCount)} />
                    <StatCell label="Daily Limit Breaches" value={String(result.riskStress.dailyLimitBreaches)} />
                    <StatCell label="Weekly Breaches" value={String(result.riskStress.weeklyLimitBreaches)} />
                  </div>
                </div>

                {/* Drawdown Recovery */}
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Drawdown Recovery Analysis</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b border-border">
                          <th className="text-left pb-1">Drawdown Depth</th>
                          <th className="text-right pb-1">Recovery Trades</th>
                          <th className="text-right pb-1">Est. Days</th>
                          <th className="text-right pb-1">Recovery Probability</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.riskStress.drawdownRecovery.map(r => (
                          <tr key={r.drawdownDepthPct}>
                            <td className="py-1 font-mono">{r.drawdownDepthPct}%</td>
                            <td className="text-right font-mono">{r.recoveryTrades}</td>
                            <td className="text-right font-mono">{r.recoveryDays}</td>
                            <td className={`text-right font-mono ${r.probabilityOfRecovery >= 70 ? "text-emerald-400" : r.probabilityOfRecovery >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                              {r.probabilityOfRecovery.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Position Sizing Resilience */}
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Position Sizing Resilience</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b border-border">
                          <th className="text-left pb-1">Equity Level</th>
                          <th className="text-right pb-1">Win Rate</th>
                          <th className="text-right pb-1">Profit Factor</th>
                          <th className="text-right pb-1">Max Drawdown</th>
                          <th className="text-right pb-1">Expectancy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {([
                          ["50% equity", result.riskStress.positionSizingResilience.at50pctEquity],
                          ["75% equity", result.riskStress.positionSizingResilience.at75pctEquity],
                          ["125% equity", result.riskStress.positionSizingResilience.at125pctEquity],
                        ] as [string, SimStats][]).map(([label, stats]) => (
                          <tr key={label}>
                            <td className="py-1">{label}</td>
                            <td className="text-right font-mono">{stats.winRate.toFixed(1)}%</td>
                            <td className="text-right font-mono">{stats.profitFactor.toFixed(2)}</td>
                            <td className="text-right font-mono">{stats.maxDrawdown.toFixed(1)}%</td>
                            <td className="text-right font-mono">${stats.expectancy.toFixed(0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {result.riskStress.findings.length > 0 && <FindingsList findings={result.riskStress.findings} />}
              </div>
            </Section>

            {/* 5. Walk-Forward */}
            <Section title="5. Walk-Forward Robustness" icon={TrendingUp}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">Windows Passed</div>
                    <div className="text-xl font-bold font-mono mt-1">
                      {result.walkForward.passedWindows}/{result.walkForward.windows}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">Avg Efficiency Ratio</div>
                    <div className={`text-xl font-bold font-mono mt-1 ${result.walkForward.avgEfficiencyRatio >= 0.7 ? "text-emerald-400" : result.walkForward.avgEfficiencyRatio >= 0.5 ? "text-yellow-400" : "text-red-400"}`}>
                      {result.walkForward.avgEfficiencyRatio.toFixed(3)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">Overfit Score</div>
                    <div className={`text-xl font-bold font-mono mt-1 ${result.walkForward.overfitScore < 30 ? "text-emerald-400" : result.walkForward.overfitScore < 60 ? "text-yellow-400" : "text-red-400"}`}>
                      {result.walkForward.overfitScore.toFixed(0)}
                    </div>
                    <div className="text-xs text-muted-foreground">lower is better</div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">Recommendation</div>
                    <div className="mt-2"><VerdictBadge verdict={result.walkForward.recommendation} size="md" /></div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <ScoreBar score={result.walkForward.parameterStability} label="Parameter Stability" />
                  <ScoreBar score={100 - result.walkForward.regimeSensitivity} label="Regime Consistency" />
                  <ScoreBar score={result.walkForward.consistencyScore} label="Overall Consistency" />
                </div>

                {result.walkForward.findings.length > 0 && <FindingsList findings={result.walkForward.findings} />}
              </div>
            </Section>

            {/* 6. OOS Validation */}
            <Section title="6. Out-of-Sample Validation" icon={BarChart3}>
              <div className="space-y-4">
                <div className="flex items-center gap-6 text-xs">
                  <div>
                    <span className="text-muted-foreground">Result: </span>
                    <span className={result.oos.passed ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>
                      {result.oos.passed ? "✓ PASSED" : "✗ FAILED"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg efficiency: </span>
                    <span className="font-mono">{result.oos.avgEfficiencyRatio.toFixed(3)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg degradation: </span>
                    <span className="font-mono text-orange-400">{result.oos.avgDegradationPct.toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Score: </span>
                    <span className={`font-mono font-bold ${scoreColor(result.oos.overallScore)}`}>
                      {result.oos.overallScore.toFixed(0)}/100
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left pb-1">Split</th>
                        <th className="text-right pb-1">Train WR</th>
                        <th className="text-right pb-1">Test WR</th>
                        <th className="text-right pb-1">Train PF</th>
                        <th className="text-right pb-1">Test PF</th>
                        <th className="text-right pb-1">Efficiency</th>
                        <th className="text-right pb-1">Degradation</th>
                        <th className="text-right pb-1">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.oos.splits.map(s => (
                        <tr key={`${s.trainPct}-${s.testPct}`} className="border-b border-border/30">
                          <td className="py-1.5 font-mono">{s.trainPct}/{s.testPct}</td>
                          <td className="text-right font-mono">{s.trainStats.winRate.toFixed(1)}%</td>
                          <td className="text-right font-mono">{s.testStats.winRate.toFixed(1)}%</td>
                          <td className="text-right font-mono">{s.trainStats.profitFactor.toFixed(2)}</td>
                          <td className="text-right font-mono">{s.testStats.profitFactor.toFixed(2)}</td>
                          <td className={`text-right font-mono ${s.efficiencyRatio >= 0.7 ? "text-emerald-400" : "text-yellow-400"}`}>
                            {s.efficiencyRatio.toFixed(3)}
                          </td>
                          <td className={`text-right font-mono ${s.degradationPct < 20 ? "text-emerald-400" : "text-orange-400"}`}>
                            {s.degradationPct.toFixed(1)}%
                          </td>
                          <td className="text-right">{s.passed ? "✅" : "❌"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {result.oos.findings.length > 0 && <FindingsList findings={result.oos.findings} />}
              </div>
            </Section>

            {/* 7. Confidence Stability */}
            <Section title="7. Confidence Stability" icon={Brain}>
              <div className="space-y-3">
                <div className="flex items-center gap-6 text-xs">
                  <div>
                    <span className="text-muted-foreground">Status: </span>
                    <span className={result.confidenceStability.stable ? "text-emerald-400 font-medium" : "text-orange-400 font-medium"}>
                      {result.confidenceStability.stable ? "✓ Stable" : "⚠ Unstable"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Score: </span>
                    <span className={`font-mono font-bold ${scoreColor(result.confidenceStability.overallScore)}`}>
                      {result.confidenceStability.overallScore.toFixed(0)}/100
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  <StatCell label="Sim Runs" value={String(result.confidenceStability.runs)} />
                  <StatCell label="Avg Confidence" value={`${result.confidenceStability.avgConfidence.toFixed(1)}%`} />
                  <StatCell label="Std Deviation" value={result.confidenceStability.confidenceStdDev.toFixed(2)} />
                  <StatCell label="Coeff. of Variation" value={`${(result.confidenceStability.coefficientOfVariation * 100).toFixed(1)}%`} />
                  <StatCell label="Max Swing" value={result.confidenceStability.maxConfidenceSwing.toFixed(1)} />
                  <StatCell label="Overreaction Events" value={String(result.confidenceStability.overreactionEvents)} />
                </div>

                {result.confidenceStability.findings.length > 0 && <FindingsList findings={result.confidenceStability.findings} />}
              </div>
            </Section>

            {/* 8. Findings & Recommendations */}
            <Section title="8. Findings & Recommendations" icon={CheckCircle2} defaultOpen>
              <div className="space-y-4">
                {result.findings.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">All Findings ({result.findings.length})</div>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {result.findings.map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <AlertTriangle className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.recommendations.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">Recommended Actions ({result.recommendations.length})</div>
                    <div className="space-y-1.5">
                      {result.recommendations.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function FindingsList({ findings }: { findings: string[] }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/10 p-3 space-y-1">
      <div className="text-xs font-medium text-muted-foreground mb-1">Findings</div>
      {findings.map((f, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <AlertTriangle className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" />
          <span>{f}</span>
        </div>
      ))}
    </div>
  );
}
