import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Globe2, Activity, GitBranch, BarChart3, History, Zap,
  TrendingUp, ArrowRight, Info, AlertTriangle, CheckCircle2,
  Loader2, RefreshCw, Search, Network, Clock, Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

const API = "/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModelHealth {
  overallScore: number;
  dataAdequacy: number;
  relationshipCoverage: number;
  transitionCoverage: number;
  memoryDepth: number;
  issues: string[];
  lastUpdated: string;
}

interface WorldState {
  pair: string;
  regime: string;
  trend: string;
  volatilityClass: string;
  liquidityQuality: string;
  correlationRisk: string;
  newsEnvironment: string;
  session: string;
  spreadCategory: string;
  marketStructure: string;
  supplyDemandQuality: string;
  liquiditySweeps: string;
  amdCompletion: string;
  confirmationQuality: string;
  marketContextScore: number;
  stabilityScore: number;
  regimeConfidence: number;
  activeTransitions: ActiveTransition[];
  capturedAt: string;
}

interface ActiveTransition {
  category: string;
  fromState: string;
  toState: string;
  progressPercent: number;
  barsInProgress: number;
  probability: number;
}

interface WorldModelOverview {
  success: boolean;
  pair: string;
  version: string;
  featureCount: number;
  currentState: WorldState;
  modelHealth: ModelHealth;
  activeRelationshipCount: number;
  activeTransitionCount: number;
  recentMemoryCount: number;
  computedAt: string;
}

interface Relationship {
  sourceComponent: string;
  targetComponent: string;
  relationshipType: string;
  strength: number;
  confidence: number;
  sampleSize: number;
  reliabilityScore: number;
  lagBars: number;
  isCausal: boolean;
  evidenceSummary: string;
}

interface TransitionStat {
  fromState: string;
  toState: string;
  transitionCategory: string;
  transitionProbability: number;
  avgDurationBars: number;
  historicalFrequency: number;
  confidence: number;
  avgOutcomeQuality: number;
}

interface InfluenceNode {
  component: string;
  label: string;
  inDegree: number;
  outDegree: number;
  centralityScore: number;
}

interface InfluenceEdge {
  sourceNode: string;
  targetNode: string;
  influenceStrength: number;
  influenceDirection: string;
  confidence: number;
  propagationDepth: number;
  explanation: string;
}

interface ScenarioResult {
  query: {
    scenarioType: string;
    triggerComponent: string;
    triggerMagnitude: number;
    affectedComponent: string;
  };
  historicalResponseMean: number;
  historicalResponseStd: number;
  historicalResponseMin: number;
  historicalResponseMax: number;
  sampleSize: number;
  confidence: number;
  responseTimeBars: number;
  narrativeExplanation: string;
}

interface HistoryEntry {
  id: string;
  pair: string;
  regime: string;
  trend: string;
  volatilityClass: string;
  session: string;
  marketContextScore: number;
  stabilityScore: number;
  capturedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function healthColor(score: number) {
  if (score >= 70) return "text-green-500";
  if (score >= 45) return "text-yellow-500";
  return "text-red-500";
}

function healthBadge(score: number) {
  if (score >= 70) return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Healthy</Badge>;
  if (score >= 45) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Degraded</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Insufficient Data</Badge>;
}

function strengthColor(strength: number) {
  const abs = Math.abs(strength);
  if (abs >= 0.6) return "text-green-400";
  if (abs >= 0.35) return "text-yellow-400";
  return "text-slate-400";
}

function directionIcon(direction: string) {
  if (direction === "positive") return <span className="text-green-400">↑</span>;
  if (direction === "negative") return <span className="text-red-400">↓</span>;
  return <span className="text-yellow-400">↕</span>;
}

function componentBadge(comp: string) {
  return (
    <Badge variant="outline" className="text-xs font-mono">
      {comp.replace(/_/g, " ")}
    </Badge>
  );
}

const COMPONENTS = [
  "regime", "trend", "volatility", "liquidity", "correlation",
  "news", "session", "spread", "market_structure", "supply_demand",
  "liquidity_sweeps", "amd_completion", "confirmation_quality",
];

const SCENARIO_TYPES = [
  "volatility_impact", "correlation_shift", "regime_transition",
  "liquidity_shock", "news_event", "session_change",
];

// ─── Sub-Panels ───────────────────────────────────────────────────────────────

function WorldModelOverviewPanel({ overview }: { overview: WorldModelOverview }) {
  const s = overview.currentState;
  const h = overview.modelHealth;

  const components: Array<{ label: string; value: string }> = [
    { label: "Regime",           value: s.regime },
    { label: "Trend",            value: s.trend },
    { label: "Volatility",       value: s.volatilityClass },
    { label: "Liquidity",        value: s.liquidityQuality },
    { label: "Correlation Risk", value: s.correlationRisk },
    { label: "News",             value: s.newsEnvironment },
    { label: "Session",          value: s.session },
    { label: "Spread",           value: s.spreadCategory },
    { label: "Market Structure", value: s.marketStructure },
    { label: "Supply/Demand",    value: s.supplyDemandQuality },
    { label: "Liq. Sweeps",      value: s.liquiditySweeps },
    { label: "AMD Completion",   value: s.amdCompletion },
    { label: "Confirmation",     value: s.confirmationQuality },
  ];

  return (
    <div className="space-y-4">
      {/* Health Scores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Overall Health",          value: h.overallScore },
          { label: "Data Adequacy",           value: h.dataAdequacy },
          { label: "Relationship Coverage",   value: h.relationshipCoverage },
          { label: "Transition Coverage",     value: h.transitionCoverage },
        ].map(({ label, value }) => (
          <Card key={label} className="bg-card/50">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground mb-1">{label}</div>
              <div className={`text-xl font-bold font-mono ${healthColor(value)}`}>{value.toFixed(0)}</div>
              <Progress value={value} className="h-1 mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Features Loaded",     value: overview.featureCount },
          { label: "Relationships",        value: overview.activeRelationshipCount },
          { label: "Transitions",          value: overview.activeTransitionCount },
          { label: "Memory Snapshots",     value: overview.recentMemoryCount },
        ].map(({ label, value }) => (
          <Card key={label} className="bg-card/50">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground mb-1">{label}</div>
              <div className="text-xl font-bold font-mono text-foreground">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Component State Grid */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-blue-400" />
            Current World State — {s.pair}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {components.map(({ label, value }) => (
              <div key={label} className="bg-muted/30 rounded p-2">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-sm font-medium capitalize mt-0.5">{value || "—"}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2 text-center">
              <div className="text-xs text-muted-foreground">Context Score</div>
              <div className="text-lg font-bold text-blue-400">{s.marketContextScore}</div>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded p-2 text-center">
              <div className="text-xs text-muted-foreground">Stability</div>
              <div className="text-lg font-bold text-green-400">{s.stabilityScore}</div>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/20 rounded p-2 text-center">
              <div className="text-xs text-muted-foreground">Regime Confidence</div>
              <div className="text-lg font-bold text-purple-400">{s.regimeConfidence}</div>
            </div>
          </div>

          {/* Active Transitions */}
          {s.activeTransitions?.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Active Transitions</div>
              {s.activeTransitions.map((t, i) => (
                <div key={i} className="bg-yellow-500/10 border border-yellow-500/20 rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-xs">{t.category}</Badge>
                      <span className="font-medium">{t.fromState}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium text-yellow-400">{t.toState}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{t.progressPercent.toFixed(0)}%</span>
                  </div>
                  <Progress value={t.progressPercent} className="h-1" />
                  <div className="text-xs text-muted-foreground mt-1">
                    {t.barsInProgress} bars in progress · {(t.probability * 100).toFixed(1)}% probability
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Health Issues */}
      {h.issues?.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <span className="text-sm font-medium text-yellow-400">Health Issues</span>
            </div>
            <ul className="space-y-1">
              {h.issues.map((issue, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-yellow-400 mt-0.5">⚠</span>
                  {issue}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RelationshipExplorerPanel({ relationships }: { relationships: Relationship[] }) {
  const [filter, setFilter] = useState("");
  const [minConf, setMinConf] = useState(50);
  const [causalOnly, setCausalOnly] = useState(false);

  const filtered = relationships.filter(r => {
    if (r.confidence < minConf) return false;
    if (causalOnly && !r.isCausal) return false;
    if (filter && !r.sourceComponent.includes(filter) && !r.targetComponent.includes(filter)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by component..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="text-sm bg-muted/30 border border-border rounded px-2 py-1 w-48 outline-none focus:border-blue-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Min Conf:</span>
          <Select value={String(minConf)} onValueChange={v => setMinConf(Number(v))}>
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 30, 50, 60, 70, 80].map(v => (
                <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant={causalOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setCausalOnly(!causalOnly)}
          className="text-xs h-8"
        >
          Causal Only
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} relationships</span>
      </div>

      {/* Relationship Table */}
      {filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 text-sm">
          No relationships match the current filters.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 50).map((r, i) => (
            <Card key={i} className="bg-card/40 hover:bg-card/60 transition-colors">
              <CardContent className="p-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {componentBadge(r.sourceComponent)}
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    {componentBadge(r.targetComponent)}
                    <Badge variant="outline" className="text-xs text-blue-400">
                      {r.relationshipType.replace("_", " ")}
                    </Badge>
                    {r.isCausal && (
                      <Badge className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30">
                        Causal
                      </Badge>
                    )}
                    {r.lagBars > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {r.lagBars}b lag
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`font-mono font-bold ${strengthColor(r.strength)}`}>
                      r={r.strength > 0 ? "+" : ""}{r.strength.toFixed(3)}
                    </span>
                    <span className="text-muted-foreground">
                      {r.confidence.toFixed(1)}% conf
                    </span>
                    <span className="text-muted-foreground">
                      n={r.sampleSize}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  {r.evidenceSummary}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function InfluenceGraphPanel({ data }: { data: { nodes: InfluenceNode[]; edges: InfluenceEdge[]; directEdgeCount: number; totalSampleSize: number } }) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const directEdges = data.edges.filter(e => e.propagationDepth === 1);
  const visibleEdges = selectedNode
    ? directEdges.filter(e => e.sourceNode === selectedNode || e.targetNode === selectedNode)
    : directEdges.slice(0, 20);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Nodes",           value: data.nodes.length },
          { label: "Direct Edges",    value: data.directEdgeCount },
          { label: "Data Points",     value: data.totalSampleSize },
        ].map(({ label, value }) => (
          <Card key={label} className="bg-card/50">
            <CardContent className="p-3 text-center">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-xl font-bold font-mono">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Node Centrality */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Network className="h-4 w-4 text-purple-400" />
            Component Centrality (click to filter edges)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.nodes.slice(0, 10).map(node => (
              <button
                key={node.component}
                className={`w-full text-left rounded p-2 transition-colors ${
                  selectedNode === node.component
                    ? "bg-purple-500/20 border border-purple-500/30"
                    : "bg-muted/20 hover:bg-muted/40"
                }`}
                onClick={() => setSelectedNode(selectedNode === node.component ? null : node.component)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{node.label}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>↑{node.outDegree} ↓{node.inDegree}</span>
                    <span className="font-mono font-bold text-purple-400">{node.centralityScore.toFixed(0)}</span>
                  </div>
                </div>
                <Progress value={node.centralityScore} className="h-1" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edges */}
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-blue-400" />
            Influence Edges {selectedNode ? `— ${selectedNode}` : "(top 20 direct)"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {visibleEdges.map((edge, i) => (
              <div key={i} className="bg-muted/20 rounded p-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-blue-300">{edge.sourceNode.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium text-green-300">{edge.targetNode.replace(/_/g, " ")}</span>
                    {directionIcon(edge.influenceDirection)}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-bold">{(edge.influenceStrength * 100).toFixed(0)}%</span>
                    <span className="text-muted-foreground">{edge.confidence.toFixed(0)}% conf</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{edge.explanation}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TransitionTimelinePanel({ transitions }: { transitions: TransitionStat[] }) {
  const [category, setCategory] = useState<string>("all");
  const filtered = category === "all" ? transitions : transitions.filter(t => t.transitionCategory === category);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Category:</span>
        {["all", "regime", "volatility", "liquidity"].map(cat => (
          <Button
            key={cat}
            variant={category === cat ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={() => setCategory(cat)}
          >
            {cat}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 text-sm">
          No transitions detected yet. More historical data needed.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t, i) => (
            <Card key={i} className="bg-card/40">
              <CardContent className="p-3">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{t.transitionCategory}</Badge>
                    <span className="text-sm font-medium">{t.fromState}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm font-medium text-blue-400">{t.toState}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{(t.transitionProbability * 100).toFixed(1)}% prob</span>
                    <span>~{t.avgDurationBars.toFixed(0)}b avg</span>
                    <span className="font-bold text-foreground">n={t.historicalFrequency}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Probability</div>
                    <Progress value={t.transitionProbability * 100} className="h-1 mt-1" />
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Confidence</div>
                    <Progress value={t.confidence} className="h-1 mt-1" />
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Trade Quality After</div>
                    <Progress value={t.avgOutcomeQuality} className="h-1 mt-1" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ScenarioSimulatorPanel({ scenarios, onRunCustom }: {
  scenarios: ScenarioResult[];
  onRunCustom: (query: { scenarioType: string; triggerComponent: string; triggerMagnitude: number; affectedComponent: string }) => void;
}) {
  const [trigger, setTrigger] = useState("volatility");
  const [affected, setAffected] = useState("liquidity");
  const [magnitude, setMagnitude] = useState(20);
  const [scenarioType, setScenarioType] = useState("volatility_impact");

  return (
    <div className="space-y-4">
      {/* Custom Simulator */}
      <Card className="bg-card/50 border-blue-500/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-400" />
            Custom Scenario Simulator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Observational only — simulates historical responses. Does not generate trading signals.
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Scenario Type</div>
              <Select value={scenarioType} onValueChange={setScenarioType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCENARIO_TYPES.map(s => (
                    <SelectItem key={s} value={s} className="text-xs">{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Trigger Component</div>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPONENTS.map(c => (
                    <SelectItem key={c} value={c} className="text-xs">{c.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Affected Component</div>
              <Select value={affected} onValueChange={setAffected}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPONENTS.filter(c => c !== trigger).map(c => (
                    <SelectItem key={c} value={c} className="text-xs">{c.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Magnitude (%)</div>
              <input
                type="number"
                value={magnitude}
                onChange={e => setMagnitude(Number(e.target.value))}
                className="h-8 w-full text-xs bg-muted/30 border border-border rounded px-2 outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => onRunCustom({ scenarioType, triggerComponent: trigger, triggerMagnitude: magnitude, affectedComponent: affected })}
          >
            Run Scenario
          </Button>
        </CardContent>
      </Card>

      {/* Predefined Scenarios */}
      <div className="text-xs font-medium text-muted-foreground">Predefined Scenarios</div>
      <div className="space-y-2">
        {scenarios.map((s, i) => (
          <Card key={i} className="bg-card/40">
            <CardContent className="p-3">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{s.query.scenarioType.replace(/_/g, " ")}</Badge>
                  <span className="text-sm font-medium">{s.query.triggerComponent.replace(/_/g, " ")}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm font-medium text-blue-400">{s.query.affectedComponent.replace(/_/g, " ")}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>n={s.sampleSize}</span>
                  <span>{s.confidence.toFixed(0)}% conf</span>
                </div>
              </div>
              {s.sampleSize > 0 && (
                <div className="grid grid-cols-4 gap-2 mb-2 text-xs">
                  {[
                    { label: "Mean",  value: s.historicalResponseMean.toFixed(3) },
                    { label: "Std",   value: s.historicalResponseStd.toFixed(3) },
                    { label: "Min",   value: s.historicalResponseMin.toFixed(3) },
                    { label: "Max",   value: s.historicalResponseMax.toFixed(3) },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-muted/20 rounded p-1 text-center">
                      <div className="text-muted-foreground">{label}</div>
                      <div className="font-mono font-bold">{value}</div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground leading-relaxed">{s.narrativeExplanation}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function HistoryPanel({ history }: { history: HistoryEntry[] }) {
  return (
    <div className="space-y-2">
      {history.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 text-sm">
          No historical states yet. Run the world model to start capturing history.
        </div>
      ) : (
        history.map((h) => (
          <Card key={h.id} className="bg-card/40">
            <CardContent className="p-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{h.pair}</Badge>
                  <span className="text-sm font-medium capitalize">{h.regime}</span>
                  <span className="text-muted-foreground text-xs">·</span>
                  <span className="text-xs text-muted-foreground capitalize">{h.trend}</span>
                  <span className="text-muted-foreground text-xs">·</span>
                  <span className="text-xs text-muted-foreground capitalize">{h.volatilityClass}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>ctx={h.marketContextScore}</span>
                  <span>stab={h.stabilityScore}</span>
                  <span>{new Date(h.capturedAt).toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MarketWorldModelPage() {
  const { toast } = useToast();

  const overviewQuery = useQuery<WorldModelOverview>({
    queryKey: ["market-world-model"],
    queryFn: () => fetch(`${API}/market/world-model`).then(r => r.json()),
    refetchInterval: 60_000,
  });

  const relationshipsQuery = useQuery<{ relationships: Relationship[] }>({
    queryKey: ["market-relationships"],
    queryFn: () => fetch(`${API}/market/relationships`).then(r => r.json()),
  });

  const transitionsQuery = useQuery<{ transitions: TransitionStat[] }>({
    queryKey: ["market-transitions"],
    queryFn: () => fetch(`${API}/market/transitions`).then(r => r.json()),
  });

  const influenceQuery = useQuery<{ nodes: InfluenceNode[]; edges: InfluenceEdge[]; directEdgeCount: number; totalSampleSize: number }>({
    queryKey: ["market-influence-graph"],
    queryFn: () => fetch(`${API}/market/influence-graph`).then(r => r.json()),
  });

  const scenariosQuery = useQuery<{ scenarios: ScenarioResult[] }>({
    queryKey: ["market-scenarios"],
    queryFn: () => fetch(`${API}/market/scenarios`).then(r => r.json()),
  });

  const historyQuery = useQuery<{ history: HistoryEntry[] }>({
    queryKey: ["market-history"],
    queryFn: () => fetch(`${API}/market/history?limit=50`).then(r => r.json()),
  });

  const customScenarioMut = useMutation({
    mutationFn: (query: object) =>
      fetch(`${API}/market/scenarios/custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      }).then(r => r.json()),
    onSuccess: data => {
      toast({ title: "Scenario Complete", description: data.result?.narrativeExplanation?.slice(0, 100) + "…" });
    },
    onError: err => {
      toast({ title: "Scenario Failed", description: String(err), variant: "destructive" });
    },
  });

  const isLoading = overviewQuery.isLoading;
  const overview  = overviewQuery.data;
  const health    = overview?.modelHealth;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe2 className="h-6 w-6 text-blue-400" />
            Market World Model
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Structured representation of how market conditions interact and evolve over time.
            Advisory only — no trading signals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {health && healthBadge(health.overallScore)}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              overviewQuery.refetch();
              relationshipsQuery.refetch();
              transitionsQuery.refetch();
              influenceQuery.refetch();
              scenariosQuery.refetch();
              historyQuery.refetch();
            }}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Advisory Notice */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-3">
          <div className="flex items-start gap-2 text-xs text-blue-300">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              The Market World Model is <strong>observational and advisory only</strong>.
              It learns statistical relationships between market conditions from historical data.
              It never generates trading signals, modifies strategy parameters, or executes trades.
              All confidence values represent historical statistical evidence, not guarantees.
            </span>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !overview ? (
        <div className="text-center text-muted-foreground py-16">Failed to load world model data.</div>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList className="flex flex-wrap gap-1 h-auto mb-4">
            <TabsTrigger value="overview"    className="text-xs"><Globe2 className="h-3 w-3 mr-1" />Overview</TabsTrigger>
            <TabsTrigger value="graph"       className="text-xs"><Network className="h-3 w-3 mr-1" />Influence Graph</TabsTrigger>
            <TabsTrigger value="relations"   className="text-xs"><GitBranch className="h-3 w-3 mr-1" />Relationships</TabsTrigger>
            <TabsTrigger value="transitions" className="text-xs"><ArrowRight className="h-3 w-3 mr-1" />Transitions</TabsTrigger>
            <TabsTrigger value="scenarios"   className="text-xs"><Zap className="h-3 w-3 mr-1" />Scenarios</TabsTrigger>
            <TabsTrigger value="history"     className="text-xs"><History className="h-3 w-3 mr-1" />History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <WorldModelOverviewPanel overview={overview} />
          </TabsContent>

          <TabsContent value="graph">
            {influenceQuery.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : influenceQuery.data ? (
              <InfluenceGraphPanel data={influenceQuery.data} />
            ) : (
              <div className="text-center text-muted-foreground py-8">Failed to load influence graph.</div>
            )}
          </TabsContent>

          <TabsContent value="relations">
            {relationshipsQuery.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <RelationshipExplorerPanel
                relationships={relationshipsQuery.data?.relationships ?? []}
              />
            )}
          </TabsContent>

          <TabsContent value="transitions">
            {transitionsQuery.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <TransitionTimelinePanel
                transitions={transitionsQuery.data?.transitions ?? []}
              />
            )}
          </TabsContent>

          <TabsContent value="scenarios">
            {scenariosQuery.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <ScenarioSimulatorPanel
                scenarios={scenariosQuery.data?.scenarios ?? []}
                onRunCustom={customScenarioMut.mutate}
              />
            )}
          </TabsContent>

          <TabsContent value="history">
            {historyQuery.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <HistoryPanel history={historyQuery.data?.history ?? []} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
