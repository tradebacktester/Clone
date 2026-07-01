import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Shield, AlertTriangle, Activity, Server, Wifi, BarChart3,
  TrendingUp, TrendingDown, Clock, ChevronRight, Eye,
  Database, Cpu, Globe2, RefreshCw, CheckCircle, XCircle,
  Info, Zap, Lock,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API = "/api";

function riskColor(cls: string): string {
  switch (cls) {
    case "very_low":  return "text-emerald-400";
    case "low":       return "text-green-400";
    case "moderate":  return "text-yellow-400";
    case "elevated":  return "text-orange-400";
    case "high":      return "text-red-400";
    case "critical":  return "text-red-600";
    default:          return "text-gray-400";
  }
}

function riskBg(cls: string): string {
  switch (cls) {
    case "very_low":  return "bg-emerald-400/10 border-emerald-400/30";
    case "low":       return "bg-green-400/10 border-green-400/30";
    case "moderate":  return "bg-yellow-400/10 border-yellow-400/30";
    case "elevated":  return "bg-orange-400/10 border-orange-400/30";
    case "high":      return "bg-red-400/10 border-red-400/30";
    case "critical":  return "bg-red-600/20 border-red-600/40";
    default:          return "bg-gray-400/10 border-gray-400/30";
  }
}

function riskBar(cls: string): string {
  switch (cls) {
    case "very_low":  return "bg-emerald-400";
    case "low":       return "bg-green-400";
    case "moderate":  return "bg-yellow-400";
    case "elevated":  return "bg-orange-400";
    case "high":      return "bg-red-400";
    case "critical":  return "bg-red-600";
    default:          return "bg-gray-400";
  }
}

function severityIcon(s: string) {
  if (s === "critical") return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  if (s === "warning")  return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
  return <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
}

function scoreGaugeColor(score: number): string {
  if (score < 20) return "#34d399";
  if (score < 40) return "#4ade80";
  if (score < 60) return "#facc15";
  if (score < 75) return "#fb923c";
  if (score < 88) return "#f87171";
  return "#dc2626";
}

function n(v: unknown): number { return isFinite(Number(v)) ? Number(v) : 0; }

// ─── Gauge component ──────────────────────────────────────────────────────────

function RiskGauge({ score, label, size = 120 }: { score: number; label: string; size?: number }) {
  const r = size / 2 - 10;
  const circ = 2 * Math.PI * r;
  const half = circ / 2;
  const filled = (score / 100) * half;
  const color = scoreGaugeColor(score);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <path
          d={`M 10,${size / 2} A ${r},${r} 0 0 1 ${size - 10},${size / 2}`}
          fill="none" stroke="#1f2937" strokeWidth="12" strokeLinecap="round"
        />
        <path
          d={`M 10,${size / 2} A ${r},${r} 0 0 1 ${size - 10},${size / 2}`}
          fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${filled} ${half - filled}`}
        />
        <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fill={color} fontSize="18" fontWeight="bold" fontFamily="monospace">
          {score.toFixed(0)}
        </text>
      </svg>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

// ─── Score Card ───────────────────────────────────────────────────────────────

function ScoreCard({
  icon: Icon, label, score, cls, weight
}: { icon: React.ComponentType<{ className?: string }>; label: string; score: number; cls: string; weight: number }) {
  return (
    <div className={`rounded-lg border p-3 ${riskBg(cls)}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${riskColor(cls)}`} />
          <span className="text-xs font-medium text-foreground">{label}</span>
        </div>
        <span className={`text-xs font-mono ${riskColor(cls)}`}>{score.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
        <div className={`h-full ${riskBar(cls)} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <div className="mt-1.5 text-[10px] text-muted-foreground text-right">weight {(weight * 100).toFixed(0)}%</div>
    </div>
  );
}

// ─── Alert Card ───────────────────────────────────────────────────────────────

function AlertCard({ alert }: { alert: any }) {
  return (
    <div className={`p-3 rounded-lg border text-xs ${
      alert.severity === "critical" ? "bg-red-950/40 border-red-500/30" :
      alert.severity === "warning"  ? "bg-yellow-950/30 border-yellow-500/30" :
                                       "bg-blue-950/20 border-blue-500/20"
    }`}>
      <div className="flex items-start gap-2">
        {severityIcon(alert.severity)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="font-semibold text-foreground truncate">{alert.title}</span>
            <span className="text-muted-foreground uppercase text-[10px] shrink-0">{alert.category}</span>
          </div>
          <p className="text-muted-foreground leading-tight">{alert.message}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Evidence Panel ───────────────────────────────────────────────────────────

function EvidencePanel({ title, lines, color = "text-muted-foreground" }: { title: string; lines: string[]; color?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-card hover:bg-card/80 transition-colors"
      >
        <span className="text-xs font-medium text-foreground">{title}</span>
        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="px-4 py-3 space-y-1 bg-background/50">
          {lines.map((l, i) => (
            <p key={i} className={`text-xs font-mono leading-tight ${color}`}>{l}</p>
          ))}
          {lines.length === 0 && <p className="text-xs text-muted-foreground italic">No evidence available</p>}
        </div>
      )}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",  label: "Risk Overview",    icon: Shield },
  { id: "account",   label: "Account",          icon: Lock },
  { id: "portfolio", label: "Portfolio",        icon: BarChart3 },
  { id: "market",    label: "Market",           icon: Globe2 },
  { id: "broker",    label: "Broker",           icon: Wifi },
  { id: "system",    label: "System",           icon: Server },
  { id: "history",   label: "Risk Timeline",    icon: Clock },
  { id: "alerts",    label: "Live Alerts",      icon: AlertTriangle },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RiskCommandCenter() {
  const [tab, setTab] = useState("overview");
  const [pair, setPair] = useState("EURUSD");
  const [session, setSession] = useState("london");

  const riskQ = useQuery({
    queryKey: ["ri-intelligence", pair, session],
    queryFn:  () => fetch(`${API}/risk/intelligence?pair=${pair}&session=${session}`).then(r => r.json()),
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const histQ = useQuery({
    queryKey: ["ri-history", pair],
    queryFn:  () => fetch(`${API}/risk/history?limit=60&pair=${pair}`).then(r => r.json()),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const reportQ = useQuery({
    queryKey: ["ri-report"],
    queryFn:  () => fetch(`${API}/risk/report`).then(r => r.json()),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const ri   = riskQ.data?.data;
  const hist = histQ.data?.data ?? [];
  const rep  = reportQ.data?.data;

  // Build radar chart data
  const radarData = ri ? [
    { dim: "Account",   value: n(ri.accountRisk?.accountHealthScore) },
    { dim: "Portfolio", value: 100 - n(ri.portfolioRisk?.portfolioRiskScore) },
    { dim: "Market",    value: 100 - n(ri.marketRisk?.marketRiskScore) },
    { dim: "Broker",    value: n(ri.brokerRisk?.brokerReliabilityScore) },
    { dim: "System",    value: n(ri.systemRisk?.systemHealthScore) },
    { dim: "Position",  value: ri.positionRisk ? 100 - n(ri.positionRisk?.positionRiskScore) : 100 },
  ] : [];

  // Timeline chart data
  const trendData = [...hist].reverse().map((h: any) => ({
    time:  new Date(h.evaluatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    risk:  n(h.overallRiskScore),
    acct:  n(h.accountHealthScore),
    mkt:   n(h.marketRiskScore),
  }));

  const allAlerts: any[] = ri?.allAlerts ?? [];
  const critAlerts = allAlerts.filter((a: any) => a.severity === "critical");
  const warnAlerts = allAlerts.filter((a: any) => a.severity === "warning");

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Risk Command Center</h1>
            <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded">
              Advisory Only
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Unified Risk Intelligence — monitors every trading risk source continuously
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={pair}
            onChange={e => setPair(e.target.value)}
            className="px-3 py-1.5 text-xs bg-card border border-border rounded-md text-foreground"
          >
            <option value="EURUSD">EUR/USD</option>
            <option value="GBPUSD">GBP/USD</option>
            <option value="USDJPY">USD/JPY</option>
          </select>
          <select
            value={session}
            onChange={e => setSession(e.target.value)}
            className="px-3 py-1.5 text-xs bg-card border border-border rounded-md text-foreground"
          >
            <option value="london">London</option>
            <option value="new_york">New York</option>
            <option value="tokyo">Tokyo</option>
          </select>
          <button
            onClick={() => { riskQ.refetch(); histQ.refetch(); reportQ.refetch(); }}
            className="p-1.5 hover:bg-card rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${riskQ.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Top metric bar */}
      {ri && (
        <div className={`rounded-xl border p-4 ${riskBg(ri.riskClassification)}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <RiskGauge score={n(ri.overallRiskScore)} label="Overall Risk" size={110} />
              <div>
                <div className={`text-3xl font-bold font-mono ${riskColor(ri.riskClassification)}`}>
                  {ri.riskLabel}
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {ri.riskClassification} · confidence {n(ri.confidence).toFixed(0)}%
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Reliability: <span className="font-medium text-foreground">{ri.reliabilityRating}</span>
                  &nbsp;·&nbsp;
                  CI: [{n(ri.confidenceInterval?.lower).toFixed(1)}, {n(ri.confidenceInterval?.upper).toFixed(1)}]
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(ri.evaluatedAt).toLocaleString()} · v{ri.engineVersion}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              {critAlerts.length > 0 && (
                <div className="flex items-center gap-1.5 text-red-400">
                  <XCircle className="w-4 h-4" />
                  <span className="font-bold">{critAlerts.length} critical</span>
                </div>
              )}
              {warnAlerts.length > 0 && (
                <div className="flex items-center gap-1.5 text-yellow-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-bold">{warnAlerts.length} warnings</span>
                </div>
              )}
              {critAlerts.length === 0 && warnAlerts.length === 0 && (
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle className="w-4 h-4" />
                  <span className="font-medium">No active alerts</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {riskQ.isLoading && (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
          Evaluating risk intelligence…
        </div>
      )}

      {riskQ.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-400">
          Failed to load risk intelligence. The server may still be starting up.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground hover:bg-card/80 border border-border"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Tab: Risk Overview ─────────────────────────────────────────────── */}
      {tab === "overview" && ri && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Score breakdown */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Score Breakdown
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <ScoreCard icon={Lock}     label="Account Health"    score={n(ri.accountRisk?.accountHealthScore)}     cls={ri.accountRisk?.riskClassification}     weight={ri.scoreWeights?.accountHealth ?? 0.25} />
              <ScoreCard icon={BarChart3} label="Portfolio Risk"   score={n(ri.portfolioRisk?.portfolioRiskScore)}   cls={ri.portfolioRisk?.riskClassification}   weight={ri.scoreWeights?.portfolioRisk ?? 0.20} />
              <ScoreCard icon={Globe2}   label="Market Risk"       score={n(ri.marketRisk?.marketRiskScore)}         cls={ri.marketRisk?.riskClassification}       weight={ri.scoreWeights?.marketRisk ?? 0.15} />
              <ScoreCard icon={Wifi}     label="Broker Reliability" score={n(ri.brokerRisk?.brokerReliabilityScore)} cls={ri.brokerRisk?.riskClassification}      weight={ri.scoreWeights?.brokerReliability ?? 0.12} />
              <ScoreCard icon={Server}   label="System Health"     score={n(ri.systemRisk?.systemHealthScore)}       cls={ri.systemRisk?.riskClassification}       weight={ri.scoreWeights?.systemHealth ?? 0.08} />
              {ri.positionRisk && (
                <ScoreCard icon={Activity} label="Position Risk"  score={n(ri.positionRisk?.positionRiskScore)}     cls={ri.positionRisk?.riskClassification}     weight={ri.scoreWeights?.positionRisk ?? 0.20} />
              )}
            </div>
          </div>

          {/* Radar */}
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" /> Risk Radar
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#1f2937" />
                <PolarAngleAxis dataKey="dim" tick={{ fill: "#6b7280", fontSize: 11 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 9 }} />
                <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} dot />
              </RadarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-muted-foreground text-center mt-1">Higher = safer (health, not risk)</p>
          </div>

          {/* Weighted contribution table */}
          <div className="bg-card rounded-xl border border-border p-5 col-span-1 lg:col-span-2">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Weighted Risk Contribution
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left pb-2 font-medium">Dimension</th>
                    <th className="text-right pb-2 font-medium">Health</th>
                    <th className="text-right pb-2 font-medium">Risk</th>
                    <th className="text-right pb-2 font-medium">Weight</th>
                    <th className="text-right pb-2 font-medium">Contribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {ri.scoreBreakdown && Object.entries({
                    "Account Health":     ri.scoreBreakdown.accountHealth,
                    "Position Risk":      ri.scoreBreakdown.positionRisk,
                    "Portfolio Risk":     ri.scoreBreakdown.portfolioRisk,
                    "Market Risk":        ri.scoreBreakdown.marketRisk,
                    "Broker Reliability": ri.scoreBreakdown.brokerReliability,
                    "System Health":      ri.scoreBreakdown.systemHealth,
                  }).map(([name, d]: [string, any]) => (
                    <tr key={name} className="hover:bg-muted/20">
                      <td className="py-2 font-medium text-foreground">{name}</td>
                      <td className="text-right py-2 font-mono text-emerald-400">{n(d?.raw).toFixed(1)}</td>
                      <td className="text-right py-2 font-mono text-red-400">{n(d?.inverted).toFixed(1)}</td>
                      <td className="text-right py-2 text-muted-foreground">{(n(d?.weight) * 100).toFixed(0)}%</td>
                      <td className="text-right py-2 font-mono font-bold text-primary">{n(d?.weighted).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-primary/20">
                    <td className="py-2 font-bold text-foreground" colSpan={4}>TOTAL RISK SCORE</td>
                    <td className={`text-right py-2 font-mono font-bold text-lg ${riskColor(ri.riskClassification)}`}>
                      {n(ri.scoreBreakdown?.total).toFixed(1)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── Tab: Account ───────────────────────────────────────────────────── */}
      {tab === "account" && ri?.accountRisk && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" /> Account Health
            </h3>
            <div className="flex items-center gap-6">
              <RiskGauge score={n(ri.accountRisk.accountHealthScore)} label="Health Score" size={100} />
              <div className="space-y-2">
                {Object.entries(ri.accountRisk.metrics ?? {}).map(([k, v]: [string, any]) => (
                  <div key={k} className="flex items-center justify-between gap-8 text-xs">
                    <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1").trim()}</span>
                    <span className="font-mono font-medium text-foreground">{n(v).toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <h3 className="text-sm font-semibold">Account Alerts</h3>
            {(ri.accountRisk.alerts ?? []).length === 0
              ? <p className="text-xs text-muted-foreground italic">No account alerts</p>
              : (ri.accountRisk.alerts ?? []).map((a: any) => <AlertCard key={a.alertId} alert={a} />)
            }
          </div>
          <div className="lg:col-span-2">
            <EvidencePanel title="Account Evidence" lines={ri.accountRisk.evidence ?? []} />
          </div>
        </div>
      )}

      {/* ─── Tab: Portfolio ─────────────────────────────────────────────────── */}
      {tab === "portfolio" && ri?.portfolioRisk && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Portfolio Overview
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-muted/20 rounded-lg p-3">
                <div className="text-muted-foreground mb-1">Open Trades</div>
                <div className="text-xl font-bold font-mono">{ri.portfolioRisk.openTrades}</div>
              </div>
              <div className="bg-muted/20 rounded-lg p-3">
                <div className="text-muted-foreground mb-1">Aggregate Risk</div>
                <div className="text-xl font-bold font-mono text-orange-400">{n(ri.portfolioRisk.aggregateRisk).toFixed(2)}%</div>
              </div>
              <div className="bg-muted/20 rounded-lg p-3">
                <div className="text-muted-foreground mb-1">Directional Bias</div>
                <div className={`text-xl font-bold font-mono ${n(ri.portfolioRisk.directionalBias) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {n(ri.portfolioRisk.directionalBias) > 0 ? "+" : ""}{n(ri.portfolioRisk.directionalBias).toFixed(0)}%
                </div>
              </div>
              <div className="bg-muted/20 rounded-lg p-3">
                <div className="text-muted-foreground mb-1">Avg Correlation</div>
                <div className="text-xl font-bold font-mono">{(n(ri.portfolioRisk.correlationExposure) * 100).toFixed(0)}%</div>
              </div>
            </div>

            {Object.keys(ri.portfolioRisk.pairExposure ?? {}).length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">Pair Exposure (USD)</div>
                {Object.entries(ri.portfolioRisk.pairExposure ?? {}).map(([pair, usd]: [string, any]) => (
                  <div key={pair} className="flex justify-between text-xs mb-1">
                    <span className="font-mono text-foreground">{pair}</span>
                    <span className="font-mono text-muted-foreground">${n(usd).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <h3 className="text-sm font-semibold">Portfolio Alerts</h3>
            {(ri.portfolioRisk.alerts ?? []).length === 0
              ? <p className="text-xs text-muted-foreground italic">No portfolio alerts</p>
              : (ri.portfolioRisk.alerts ?? []).map((a: any) => <AlertCard key={a.alertId} alert={a} />)
            }
          </div>
          <div className="lg:col-span-2">
            <EvidencePanel title="Portfolio Evidence" lines={ri.portfolioRisk.evidence ?? []} />
          </div>
        </div>
      )}

      {/* ─── Tab: Market ────────────────────────────────────────────────────── */}
      {tab === "market" && ri?.marketRisk && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-primary" /> Market Risk Components
            </h3>
            {Object.entries({
              "Volatility Risk":    n(ri.marketRisk.metrics?.volatilityRisk),
              "Liquidity Risk":     n(ri.marketRisk.metrics?.liquidityRisk),
              "Stability Risk":     n(ri.marketRisk.metrics?.stabilityRisk),
              "Correlation Risk":   n(ri.marketRisk.metrics?.correlationRisk),
              "News Risk":          n(ri.marketRisk.metrics?.newsRiskScore),
            }).map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-mono font-medium">{v.toFixed(1)}</span>
                </div>
                <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-400/70 rounded-full" style={{ width: `${v}%` }} />
                </div>
              </div>
            ))}
            <div className="mt-4 pt-3 border-t border-border">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Total Market Risk</span>
                <span className={`font-bold font-mono ${riskColor(ri.marketRisk.riskClassification)}`}>
                  {n(ri.marketRisk.marketRiskScore).toFixed(1)} ({ri.marketRisk.riskClassification})
                </span>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <h3 className="text-sm font-semibold">Market Alerts</h3>
            {(ri.marketRisk.alerts ?? []).length === 0
              ? <p className="text-xs text-muted-foreground italic">No market alerts</p>
              : (ri.marketRisk.alerts ?? []).map((a: any) => <AlertCard key={a.alertId} alert={a} />)
            }
          </div>
          <div className="lg:col-span-2">
            <EvidencePanel title="Market Evidence" lines={ri.marketRisk.evidence ?? []} />
          </div>
        </div>
      )}

      {/* ─── Tab: Broker ────────────────────────────────────────────────────── */}
      {tab === "broker" && ri?.brokerRisk && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Wifi className="w-4 h-4 text-primary" /> Broker Reliability
            </h3>
            <div className="flex items-center gap-6">
              <RiskGauge score={n(ri.brokerRisk.brokerReliabilityScore)} label="Reliability" size={100} />
              <div className="space-y-1.5 text-xs flex-1">
                {Object.entries(ri.brokerRisk.metrics ?? {}).map(([k, v]: [string, any]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1").trim()}</span>
                    <span className="font-mono">{n(v).toFixed(1)}/100</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <h3 className="text-sm font-semibold">Broker Alerts</h3>
            {(ri.brokerRisk.alerts ?? []).length === 0
              ? <p className="text-xs text-muted-foreground italic">No broker alerts</p>
              : (ri.brokerRisk.alerts ?? []).map((a: any) => <AlertCard key={a.alertId} alert={a} />)
            }
          </div>
          <div className="lg:col-span-2">
            <EvidencePanel title="Broker Evidence" lines={ri.brokerRisk.evidence ?? []} />
          </div>
        </div>
      )}

      {/* ─── Tab: System ────────────────────────────────────────────────────── */}
      {tab === "system" && ri?.systemRisk && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" /> System Health
            </h3>
            <div className="flex items-center gap-6">
              <RiskGauge score={n(ri.systemRisk.systemHealthScore)} label="Health Score" size={100} />
              <div className="space-y-1.5 text-xs flex-1">
                {Object.entries({
                  CPU:      ri.systemRisk.metrics?.cpuScore,
                  Memory:   ri.systemRisk.metrics?.memoryScore,
                  Database: ri.systemRisk.metrics?.dbScore,
                  API:      ri.systemRisk.metrics?.apiScore,
                  Network:  ri.systemRisk.metrics?.networkScore,
                  Feed:     ri.systemRisk.metrics?.feedScore,
                  Services: ri.systemRisk.metrics?.servicesScore,
                  Storage:  ri.systemRisk.metrics?.storageScore,
                }).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground w-16">{k}</span>
                    <div className="flex-1 h-1 bg-muted/30 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400/70 rounded-full" style={{ width: `${n(v)}%` }} />
                    </div>
                    <span className="font-mono w-8 text-right">{n(v).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <h3 className="text-sm font-semibold">System Alerts</h3>
            {(ri.systemRisk.alerts ?? []).length === 0
              ? <p className="text-xs text-muted-foreground italic">No system alerts</p>
              : (ri.systemRisk.alerts ?? []).map((a: any) => <AlertCard key={a.alertId} alert={a} />)
            }
          </div>
          <div className="lg:col-span-2">
            <EvidencePanel title="System Evidence" lines={ri.systemRisk.evidence ?? []} />
          </div>
        </div>
      )}

      {/* ─── Tab: History ───────────────────────────────────────────────────── */}
      {tab === "history" && (
        <div className="space-y-6">
          {trendData.length > 0 ? (
            <>
              <div className="bg-card rounded-xl border border-border p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> Risk Score Timeline
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: "8px", fontSize: "11px" }}
                    />
                    <Line dataKey="risk" name="Overall Risk" stroke="#f87171" strokeWidth={2} dot={false} />
                    <Line dataKey="acct" name="Account Health" stroke="#34d399" strokeWidth={1.5} dot={false} />
                    <Line dataKey="mkt"  name="Market Risk"   stroke="#fb923c" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20 border-b border-border">
                    <tr className="text-muted-foreground">
                      <th className="text-left px-4 py-2 font-medium">Time</th>
                      <th className="text-right px-4 py-2 font-medium">Risk Score</th>
                      <th className="text-right px-4 py-2 font-medium">Classification</th>
                      <th className="text-right px-4 py-2 font-medium">Account</th>
                      <th className="text-right px-4 py-2 font-medium">Market</th>
                      <th className="text-left px-4 py-2 font-medium">Pair</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {hist.slice(0, 30).map((h: any) => (
                      <tr key={h.id} className="hover:bg-muted/10">
                        <td className="px-4 py-2 font-mono text-muted-foreground">
                          {new Date(h.evaluatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className={`px-4 py-2 text-right font-mono font-bold ${riskColor(h.riskClassification)}`}>
                          {n(h.overallRiskScore).toFixed(1)}
                        </td>
                        <td className={`px-4 py-2 text-right font-mono ${riskColor(h.riskClassification)}`}>
                          {h.riskClassification}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-emerald-400">{n(h.accountHealthScore).toFixed(1)}</td>
                        <td className="px-4 py-2 text-right font-mono text-orange-400">{n(h.marketRiskScore).toFixed(1)}</td>
                        <td className="px-4 py-2 font-mono text-muted-foreground">{h.pair ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="bg-card rounded-xl border border-border p-12 text-center text-muted-foreground">
              No risk history yet — trigger an evaluation via the Overview tab.
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: Live Alerts ───────────────────────────────────────────────── */}
      {tab === "alerts" && (
        <div className="space-y-4">
          {/* Historical active alerts from report */}
          {rep && (rep.activeAlerts ?? []).length > 0 && (
            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" /> Active Persistent Alerts
              </h3>
              <div className="space-y-2">
                {(rep.activeAlerts ?? []).map((a: any) => <AlertCard key={a.id} alert={a} />)}
              </div>
            </div>
          )}

          {/* Current evaluation alerts */}
          {allAlerts.length > 0 ? (
            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Current Evaluation Alerts
                <span className="text-xs text-muted-foreground">({allAlerts.length} total)</span>
              </h3>
              <div className="space-y-2">
                {allAlerts.map((a: any) => <AlertCard key={a.alertId} alert={a} />)}
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border p-12 text-center">
              <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No active alerts — all systems operating within normal parameters</p>
            </div>
          )}
        </div>
      )}

      {/* Advisory disclaimer */}
      <div className="text-center">
        <p className="text-[10px] text-muted-foreground">
          <Lock className="w-3 h-3 inline mr-1" />
          ADVISORY ONLY — This system monitors and reports risk. It does not modify positions, execute orders, or change strategy.
        </p>
      </div>
    </div>
  );
}
