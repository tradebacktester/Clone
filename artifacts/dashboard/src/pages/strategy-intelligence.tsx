import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

const API = "/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StrengthComponent {
  name: string;
  score: number;
  weight: number;
  contribution: number;
  tier: string;
}

interface RuleResult {
  name: string;
  value: number;
  threshold: number;
  exceptional: number;
  status: string;
  score: number;
  explanation: string;
}

interface SimilarTrade {
  tradeId: string;
  pair: string;
  session: string;
  regime: string;
  outcome: "win" | "loss";
  rrActual: number;
  similarity: number;
  setupScore: number;
  tqi: number;
}

interface StrategyReport {
  reportId: string;
  version: string;
  evaluatedAt: string;
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
    setupScore: number;
    tqi: number;
    rrPlanned: number;
    spreadPips: number;
    newsContext?: string;
  };
  ruleEvaluation: {
    ruleQualityScore: number;
    rules: RuleResult[];
    passingRules: number;
    totalRules: number;
    failedRules: number;
    barelyPassed: number;
    exceptionalRules: number;
    explanation: string;
  };
  historicalEvidence: {
    evidenceScore: number;
    evidenceCount: number;
    winCount: number;
    lossCount: number;
    winRate: number;
    averageRR: number;
    profitFactor: number;
    wilsonLowerBound: number;
    sampleReliability: string;
    explanation: string;
    similarTrades: SimilarTrade[];
  };
  marketSupport: {
    marketSupportScore: number;
    trendScore: number;
    regimeScore: number;
    volatilityScore: number;
    liquidityScore: number;
    correlationScore: number;
    newsScore: number;
    stabilityScore: number;
    explanations: string[];
  };
  patternStrength: {
    patternStrengthScore: number;
    supplyScore: number;
    demandScore: number;
    zoneScore: number;
    liquiditySweepScore: number;
    amdScore: number;
    confirmationScore: number;
    explanations: string[];
  };
  contextStrength: {
    contextStrengthScore: number;
    sessionScore: number;
    pairScore: number;
    opportunityScore: number;
    healthScore: number;
    historicalContextScore: number;
    explanations: string[];
  };
  strategyStrength: {
    strategyStrengthScore: number;
    confidenceScore: number;
    recommendation: string;
    recommendationLabel: string;
    strengthTier: string;
    components: StrengthComponent[];
    explanation: string;
  };
  strongestFactors: Array<{ name: string; impact: number; detail: string }>;
  weakestFactors:   Array<{ name: string; impact: number; detail: string }>;
  statisticalExpectancy: number;
  riskAssessment: string;
  potentialRisks: string[];
  reasoning: string;
  recommendation: string;
  recommendationLabel: string;
  recommendationRationale: string;
  isAdvisoryOnly: true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function recommendationColor(rec: string) {
  switch (rec) {
    case "exceptional":  return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "very_strong":  return "bg-green-500/20 text-green-400 border-green-500/30";
    case "strong":       return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "average":      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "weak":         return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "avoid":        return "bg-red-500/20 text-red-400 border-red-500/30";
    default:             return "bg-muted text-muted-foreground";
  }
}

function tierColor(tier: string) {
  switch (tier) {
    case "exceptional":  return "text-purple-400";
    case "strong":       return "text-green-400";
    case "moderate":     return "text-yellow-400";
    case "weak":         return "text-orange-400";
    case "insufficient": return "text-red-400";
    default:             return "text-muted-foreground";
  }
}

function ruleStatusColor(status: string) {
  switch (status) {
    case "exceptional":  return "text-purple-400";
    case "passed":       return "text-green-400";
    case "barely_passed": return "text-yellow-400";
    case "failed":       return "text-red-400";
    default:             return "text-muted-foreground";
  }
}

function scoreBar(score: number, color = "bg-violet-500") {
  return (
    <div className="flex items-center gap-2">
      <Progress value={score} className="h-2 flex-1" />
      <span className="text-xs font-mono w-10 text-right">{score.toFixed(1)}</span>
    </div>
  );
}

// ─── Setup Form ───────────────────────────────────────────────────────────────

const DEFAULT_SETUP = {
  pair: "EURUSD", session: "london", regime: "trending",
  trend: "bullish", volatility: "medium",
  supplyQuality: 70, demandQuality: 68, liquidityScore: 65,
  amdScore: 62, confirmationQuality: 70, setupScore: 68, tqi: 63,
  rrPlanned: 2.5, spreadPips: 1.2,
  trendStrength: 70, correlationScore: 65, stabilityScore: 70,
  opportunityScore: 68, marketHealthScore: 72, newsContext: "neutral",
};

function SetupForm({ onSubmit, loading }: { onSubmit: (s: typeof DEFAULT_SETUP) => void; loading: boolean }) {
  const [form, setForm] = useState(DEFAULT_SETUP);
  const num = (key: keyof typeof DEFAULT_SETUP) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }));
  const sel = (key: keyof typeof DEFAULT_SETUP) => (v: string) =>
    setForm(f => ({ ...f, [key]: v }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Pair</Label>
          <Select value={form.pair} onValueChange={sel("pair")}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["EURUSD","GBPUSD","USDJPY","XAUUSD","AUDUSD","USDCAD","GBPJPY","EURJPY","USDCHF","NZDUSD"].map(p => (
                <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Session</Label>
          <Select value={form.session} onValueChange={sel("session")}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["overlap","london","new_york","asian","off_hours"].map(s => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Regime</Label>
          <Select value={form.regime} onValueChange={sel("regime")}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["trending","ranging","volatile","low_volatility"].map(r => (
                <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Trend</Label>
          <Select value={form.trend} onValueChange={sel("trend")}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["bullish","bearish","sideways"].map(t => (
                <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Volatility</Label>
          <Select value={form.volatility} onValueChange={sel("volatility")}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["low","medium","high","extreme"].map(v => (
                <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">News Context</Label>
          <Select value={form.newsContext} onValueChange={sel("newsContext")}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["positive","neutral","negative"].map(n => (
                <SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-3">
        {[
          ["Supply Quality",    "supplyQuality",       0, 100],
          ["Demand Quality",    "demandQuality",        0, 100],
          ["Liquidity Score",   "liquidityScore",       0, 100],
          ["AMD Score",         "amdScore",             0, 100],
          ["Confirmation Qual.","confirmationQuality",  0, 100],
          ["Setup Score",       "setupScore",           0, 100],
          ["TQI",               "tqi",                  0, 100],
          ["RR Planned",        "rrPlanned",            0, 10],
          ["Spread (pips)",     "spreadPips",           0, 10],
          ["Trend Strength",    "trendStrength",        0, 100],
          ["Correlation Score", "correlationScore",     0, 100],
          ["Stability Score",   "stabilityScore",       0, 100],
          ["Opportunity Score", "opportunityScore",     0, 100],
          ["Market Health",     "marketHealthScore",    0, 100],
        ].map(([label, key, min, max]) => (
          <div key={key as string} className="space-y-1">
            <Label className="text-xs">{label as string}</Label>
            <Input
              type="number"
              min={min as number}
              max={max as number}
              step="0.1"
              className="h-8 text-xs font-mono"
              value={(form as Record<string, number | string>)[key as string] as number}
              onChange={num(key as keyof typeof DEFAULT_SETUP)}
            />
          </div>
        ))}
      </div>

      <Button type="submit" disabled={loading} className="w-full" size="sm">
        {loading ? "Evaluating…" : "Evaluate Setup"}
      </Button>
    </form>
  );
}

// ─── Strength Gauge ───────────────────────────────────────────────────────────

function StrengthGauge({ score, label, tier }: { score: number; label: string; tier: string }) {
  const deg = (score / 100) * 180;
  const color = score >= 75 ? "#a855f7" : score >= 60 ? "#22c55e" : score >= 45 ? "#eab308" : score >= 25 ? "#f97316" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="160" height="90" viewBox="0 0 160 90">
        {/* Background arc */}
        <path d="M 15 80 A 65 65 0 0 1 145 80" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="12" strokeLinecap="round" />
        {/* Score arc */}
        <path
          d="M 15 80 A 65 65 0 0 1 145 80"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(deg / 180) * 204} 204`}
        />
        {/* Needle */}
        <line
          x1="80" y1="80"
          x2={80 + 50 * Math.cos((Math.PI - (deg * Math.PI / 180)))}
          y2={80 - 50 * Math.sin((Math.PI - (deg * Math.PI / 180)))}
          stroke={color} strokeWidth="2" strokeLinecap="round"
        />
        <circle cx="80" cy="80" r="4" fill={color} />
        <text x="80" y="70" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold" fontFamily="monospace">
          {score.toFixed(1)}
        </text>
      </svg>
      <div className="text-xs font-semibold" style={{ color }}>{label}</div>
      <div className={`text-xs ${tierColor(tier)}`}>{tier}</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StrategyIntelligence() {
  const [report, setReport] = useState<StrategyReport | null>(null);
  const [activeTab, setActiveTab] = useState("evaluate");

  const { data: strengthData } = useQuery({
    queryKey: ["/api/strategy/strength"],
    queryFn: async () => {
      const r = await fetch(`${API}/strategy/strength`);
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const { data: historyData } = useQuery({
    queryKey: ["/api/strategy/reasoning"],
    queryFn: async () => {
      const r = await fetch(`${API}/strategy/reasoning?limit=30`);
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (setup: typeof DEFAULT_SETUP) => {
      const res = await fetch("/api/strategy/reasoning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setup),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.ok) {
        setReport(data.report);
        setActiveTab("report");
      }
    },
  });

  const summary = (strengthData as { summary?: { averageStrength: number; totalReports: number; distribution: Record<string, number>; recent: unknown[] } })?.summary;
  const recentReports = (historyData as { reports?: Array<{ reportId: string; pair: string; session: string; strategyStrengthScore: string | number; recommendation: string; recommendationLabel: string; evaluatedAt: string }> })?.reports ?? [];

  return (
    <div className="flex flex-col gap-4 p-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Strategy Intelligence</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Advisory-only reasoning engine — evaluates every setup using all accumulated KRYTOS knowledge
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="outline" className="text-xs border-violet-500/30 text-violet-400">
            Advisory Only
          </Badge>
          <Badge variant="outline" className="text-xs font-mono">v1.0.0</Badge>
        </div>
      </div>

      {/* Summary row */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="ai-card-gradient border-violet-500/20">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Avg. Strategy Strength</p>
              <p className="text-2xl font-bold font-mono text-violet-400">{summary.averageStrength.toFixed(1)}</p>
            </CardContent>
          </Card>
          <Card className="ai-card-gradient border-violet-500/20">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Total Evaluations</p>
              <p className="text-2xl font-bold font-mono">{summary.totalReports}</p>
            </CardContent>
          </Card>
          {Object.entries(summary.distribution).filter(([, v]) => (v as number) > 0).slice(0, 2).map(([key, val]) => (
            <Card key={key} className="ai-card-gradient border-violet-500/20">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground capitalize">{key.replace("_", " ")}</p>
                <p className="text-2xl font-bold font-mono">{val as number}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Main tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabsList className="grid w-full grid-cols-4 text-xs">
          <TabsTrigger value="evaluate">Evaluate Setup</TabsTrigger>
          <TabsTrigger value="report" disabled={!report}>Reasoning Report</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="explanation">Methodology</TabsTrigger>
        </TabsList>

        {/* ── Evaluate Tab ── */}
        <TabsContent value="evaluate" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="ai-card-gradient border-violet-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Setup Parameters</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px] pr-2">
                  <SetupForm onSubmit={mutation.mutate} loading={mutation.isPending} />
                </ScrollArea>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {/* Quick guide */}
              <Card className="ai-card-gradient border-violet-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Scoring Components</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { name: "Rule Quality",        weight: "20%", desc: "9 strategy rules graded: failed / barely / passed / exceptional" },
                    { name: "Historical Evidence", weight: "25%", desc: "Cosine similarity search, win rate, profit factor, Wilson LB" },
                    { name: "Market Support",      weight: "20%", desc: "Trend, regime, volatility, liquidity, correlation, news, stability" },
                    { name: "Pattern Strength",    weight: "20%", desc: "Zone quality, liquidity sweep, AMD structure, confirmation" },
                    { name: "Context Strength",    weight: "15%", desc: "Session, pair tier, opportunity, health, historical session WR" },
                  ].map(c => (
                    <div key={c.name} className="flex gap-3 text-xs">
                      <Badge variant="outline" className="shrink-0 font-mono text-violet-400 border-violet-500/30">{c.weight}</Badge>
                      <div>
                        <span className="font-semibold">{c.name}</span>
                        <p className="text-muted-foreground">{c.desc}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="ai-card-gradient border-violet-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Recommendation Tiers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {[
                    ["≥ 90", "exceptional",  "Exceptional Opportunity"],
                    ["≥ 75", "very_strong",  "Very Strong Setup"],
                    ["≥ 60", "strong",       "Strong Setup"],
                    ["≥ 45", "average",      "Average Setup"],
                    ["≥ 25", "weak",         "Weak Setup"],
                    ["< 25", "avoid",        "Avoid"],
                  ].map(([score, rec, label]) => (
                    <div key={rec} className="flex items-center gap-2 text-xs">
                      <span className="font-mono w-10 text-muted-foreground">{score}</span>
                      <Badge className={`text-xs border ${recommendationColor(rec)}`}>{label}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── Report Tab ── */}
        <TabsContent value="report" className="mt-4">
          {report && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex flex-wrap items-center gap-3">
                <StrengthGauge
                  score={report.strategyStrength.strategyStrengthScore}
                  label={report.strategyStrength.recommendationLabel}
                  tier={report.strategyStrength.strengthTier}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-2 mb-2">
                    <Badge className={`text-sm border ${recommendationColor(report.recommendation)}`}>
                      {report.recommendationLabel}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs">
                      {report.setup.pair} | {report.setup.session} | {report.setup.regime}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Confidence: {report.strategyStrength.confidenceScore.toFixed(1)}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{report.recommendationRationale}</p>
                </div>
              </div>

              {/* Component scores */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {report.strategyStrength.components.map(c => (
                  <Card key={c.name} className="ai-card-gradient border-violet-500/20">
                    <CardContent className="p-3">
                      <p className="text-xs text-muted-foreground">{c.name}</p>
                      <p className={`text-lg font-bold font-mono ${tierColor(c.tier)}`}>{c.score.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">weight {(c.weight * 100).toFixed(0)}%</p>
                      {scoreBar(c.score)}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Rule Evaluation */}
                <Card className="ai-card-gradient border-violet-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      Rule Evaluation
                      <Badge variant="outline" className="font-mono text-xs">
                        {report.ruleEvaluation.passingRules}/{report.ruleEvaluation.totalRules} passed
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-48">
                      <div className="space-y-2">
                        {report.ruleEvaluation.rules.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className={`w-20 shrink-0 font-semibold capitalize ${ruleStatusColor(r.status)}`}>
                              {r.status.replace("_", " ")}
                            </span>
                            <span className="flex-1 truncate">{r.name}</span>
                            <span className="font-mono text-muted-foreground">{r.value.toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <div className="mt-2">
                      <Progress value={report.ruleEvaluation.ruleQualityScore} className="h-1.5" />
                      <p className="text-xs text-muted-foreground mt-1">Quality: {report.ruleEvaluation.ruleQualityScore.toFixed(1)}/100</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Historical Evidence */}
                <Card className="ai-card-gradient border-violet-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      Historical Evidence
                      <Badge variant="outline" className="text-xs">{report.historicalEvidence.sampleReliability}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Similar Trades</p>
                        <p className="font-bold font-mono">{report.historicalEvidence.evidenceCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Win Rate</p>
                        <p className="font-bold font-mono">{(report.historicalEvidence.winRate * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Avg RR</p>
                        <p className="font-bold font-mono">{report.historicalEvidence.averageRR.toFixed(2)}R</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Profit Factor</p>
                        <p className="font-bold font-mono">{report.historicalEvidence.profitFactor.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Wilson LB</p>
                        <p className="font-bold font-mono">{(report.historicalEvidence.wilsonLowerBound * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Expectancy</p>
                        <p className={`font-bold font-mono ${report.statisticalExpectancy >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {report.statisticalExpectancy >= 0 ? "+" : ""}{report.statisticalExpectancy.toFixed(2)}R
                        </p>
                      </div>
                    </div>
                    <div className="mt-1">
                      <Progress value={report.historicalEvidence.evidenceScore} className="h-1.5" />
                      <p className="text-xs text-muted-foreground mt-1">Evidence Score: {report.historicalEvidence.evidenceScore.toFixed(1)}/100</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Market Support */}
                <Card className="ai-card-gradient border-violet-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Market Support</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {[
                      ["Trend",       report.marketSupport.trendScore],
                      ["Regime",      report.marketSupport.regimeScore],
                      ["Volatility",  report.marketSupport.volatilityScore],
                      ["Liquidity",   report.marketSupport.liquidityScore],
                      ["Correlation", report.marketSupport.correlationScore],
                      ["News",        report.marketSupport.newsScore],
                      ["Stability",   report.marketSupport.stabilityScore],
                    ].map(([label, score]) => (
                      <div key={label as string} className="flex items-center gap-2 text-xs">
                        <span className="w-20 text-muted-foreground">{label as string}</span>
                        {scoreBar(score as number)}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Pattern Strength */}
                <Card className="ai-card-gradient border-violet-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Pattern Strength</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {[
                      ["Supply Zone",  report.patternStrength.supplyScore],
                      ["Demand Zone",  report.patternStrength.demandScore],
                      ["Zone Comp.",   report.patternStrength.zoneScore],
                      ["Liq. Sweep",   report.patternStrength.liquiditySweepScore],
                      ["AMD",          report.patternStrength.amdScore],
                      ["Confirmation", report.patternStrength.confirmationScore],
                    ].map(([label, score]) => (
                      <div key={label as string} className="flex items-center gap-2 text-xs">
                        <span className="w-24 text-muted-foreground">{label as string}</span>
                        {scoreBar(score as number)}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Context Strength */}
                <Card className="ai-card-gradient border-violet-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Context Strength</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {[
                      ["Session",       report.contextStrength.sessionScore],
                      ["Pair Tier",     report.contextStrength.pairScore],
                      ["Opportunity",   report.contextStrength.opportunityScore],
                      ["Market Health", report.contextStrength.healthScore],
                      ["Hist. Context", report.contextStrength.historicalContextScore],
                    ].map(([label, score]) => (
                      <div key={label as string} className="flex items-center gap-2 text-xs">
                        <span className="w-24 text-muted-foreground">{label as string}</span>
                        {scoreBar(score as number)}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Strongest / Weakest Factors */}
                <Card className="ai-card-gradient border-violet-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Key Factors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {report.strongestFactors.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs text-green-400 font-semibold mb-1">Strongest Supporting</p>
                        {report.strongestFactors.map((f, i) => (
                          <div key={i} className="flex gap-2 text-xs mb-1">
                            <span className="text-green-400 font-mono w-8">+{f.impact.toFixed(0)}</span>
                            <span className="font-medium">{f.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {report.weakestFactors.length > 0 && (
                      <div>
                        <p className="text-xs text-red-400 font-semibold mb-1">Limiting Factors</p>
                        {report.weakestFactors.map((f, i) => (
                          <div key={i} className="flex gap-2 text-xs mb-1">
                            <span className="text-red-400 font-mono w-8">{f.impact.toFixed(0)}</span>
                            <span className="font-medium">{f.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Risk Assessment */}
              {report.potentialRisks.length > 0 && (
                <Card className="ai-card-gradient border-orange-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-orange-400">Risk Assessment: {report.riskAssessment}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {report.potentialRisks.map((r, i) => (
                        <Badge key={i} variant="outline" className="text-xs border-orange-500/30 text-orange-400">{r}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Full Reasoning */}
              <Card className="ai-card-gradient border-violet-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Full Reasoning Narrative</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-48">
                    <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {report.reasoning}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Similar Trades */}
              {report.historicalEvidence.similarTrades?.length > 0 && (
                <Card className="ai-card-gradient border-violet-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Historical Similar Trades</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Pair</TableHead>
                          <TableHead className="text-xs">Session</TableHead>
                          <TableHead className="text-xs">Regime</TableHead>
                          <TableHead className="text-xs">Outcome</TableHead>
                          <TableHead className="text-xs">RR</TableHead>
                          <TableHead className="text-xs">Similarity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.historicalEvidence.similarTrades.slice(0, 10).map((t, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-mono">{t.pair}</TableCell>
                            <TableCell className="text-xs">{t.session}</TableCell>
                            <TableCell className="text-xs">{t.regime}</TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="outline" className={`text-xs ${t.outcome === "win" ? "text-green-400 border-green-500/30" : "text-red-400 border-red-500/30"}`}>
                                {t.outcome}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono">{Number(t.rrActual).toFixed(2)}R</TableCell>
                            <TableCell className="text-xs font-mono">{(Number(t.similarity) * 100).toFixed(1)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── History Tab ── */}
        <TabsContent value="history" className="mt-4">
          <Card className="ai-card-gradient border-violet-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Reasoning Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {recentReports.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No evaluations yet. Run a setup evaluation to see history.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Pair</TableHead>
                      <TableHead className="text-xs">Session</TableHead>
                      <TableHead className="text-xs">Score</TableHead>
                      <TableHead className="text-xs">Recommendation</TableHead>
                      <TableHead className="text-xs">Evaluated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentReports.map((r) => (
                      <TableRow key={r.reportId}>
                        <TableCell className="text-xs font-mono">{r.pair}</TableCell>
                        <TableCell className="text-xs">{r.session}</TableCell>
                        <TableCell className="text-xs font-bold font-mono">{Number(r.strategyStrengthScore).toFixed(1)}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs border ${recommendationColor(r.recommendation)}`}>
                            {r.recommendationLabel ?? r.recommendation}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(r.evaluatedAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Methodology Tab ── */}
        <TabsContent value="explanation" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="ai-card-gradient border-violet-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Scoring Architecture</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <p className="text-muted-foreground">
                  The Strategy Strength Score (0–100) is a transparent, reproducible weighted composite
                  of 5 scored dimensions. Every number traces directly to its inputs.
                </p>
                <div className="space-y-2">
                  {[
                    { name: "Historical Evidence", w: 25, desc: "Highest weight — empirical outcomes ground the score in reality" },
                    { name: "Rule Quality",        w: 20, desc: "Strategy rules encode institutional SMC knowledge" },
                    { name: "Market Support",      w: 20, desc: "Macro context determines setup success probability" },
                    { name: "Pattern Strength",    w: 20, desc: "Observable SMC pattern quality is directly measurable" },
                    { name: "Context Strength",    w: 15, desc: "Session/pair/opportunity modifies probability" },
                  ].map(c => (
                    <div key={c.name} className="flex gap-2">
                      <div className="w-8 h-8 rounded bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold font-mono text-xs shrink-0">
                        {c.w}%
                      </div>
                      <div>
                        <p className="font-semibold">{c.name}</p>
                        <p className="text-muted-foreground">{c.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="ai-card-gradient border-violet-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Reasoning Pipeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                {[
                  ["1", "Rule Validation", "9 rules × failed/barely/passed/exceptional"],
                  ["2", "Historical Lookup", "Cosine similarity over 7D feature vector (threshold 0.72)"],
                  ["3", "Market Intelligence", "7 market dimensions, individually weighted"],
                  ["4", "Pattern Strength", "Zone composite + sweep + AMD + confirmation"],
                  ["5", "Context Evaluation", "Session tier + pair tier + opportunity + health + history"],
                  ["6", "Strength Assessment", "Weighted composite → Strategy Strength Score"],
                  ["7", "Confidence", "Evidence-adjusted: penalty for low sample, failed rules"],
                  ["8", "Factor Extraction", "12 factors ranked by deviation from neutral"],
                  ["9", "Risk Assessment", "Up to 8 risk categories identified"],
                  ["10", "Recommendation", "6 tiers from Exceptional to Avoid — advisory only"],
                ].map(([num, title, desc]) => (
                  <div key={num} className="flex gap-2">
                    <span className="w-5 h-5 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-mono shrink-0 text-[10px]">{num}</span>
                    <div>
                      <span className="font-semibold">{title}</span>
                      <p className="text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="ai-card-gradient border-violet-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Statistical Expectancy</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <p className="text-muted-foreground font-mono bg-muted/30 p-2 rounded">
                  E = winRate × avgRR − (1 − winRate) × 1
                </p>
                <p className="text-muted-foreground">
                  Measures the expected RR per trade based on historical similar setups.
                  Only computed when evidence ≥ 5 trades. Returns 0 otherwise.
                </p>
                <div className="space-y-1">
                  <p>WR 65%, RR 2.2 → <span className="text-green-400 font-mono">+1.08R</span></p>
                  <p>WR 40%, RR 1.5 → <span className="text-yellow-400 font-mono">0.00R</span></p>
                  <p>WR 30%, RR 2.0 → <span className="text-red-400 font-mono">−0.10R</span></p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-violet-500/20 bg-violet-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-violet-400">Advisory Constraints</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-1.5">
                <p className="text-muted-foreground">This engine is permanently advisory-only:</p>
                {[
                  ["✅", "Evaluates setup quality with full evidence"],
                  ["✅", "Generates human-readable reasoning reports"],
                  ["✅", "Surfaces historical similar trades"],
                  ["✅", "Provides statistical confidence and expectancy"],
                  ["❌", "Does NOT modify strategy parameters"],
                  ["❌", "Does NOT change risk settings"],
                  ["❌", "Does NOT execute trades"],
                  ["❌", "Does NOT use reinforcement learning"],
                  ["❌", "Does NOT autonomously optimize"],
                ].map(([icon, text]) => (
                  <div key={text} className="flex gap-2">
                    <span>{icon}</span>
                    <span className="text-muted-foreground">{text}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
