import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea, Scatter, ScatterChart,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Play, Pause, SkipBack, SkipForward, StepBack, StepForward,
  CheckCircle2, XCircle, AlertCircle, MinusCircle, ArrowRight,
  TrendingUp, TrendingDown, Shield, ShieldAlert, FileText,
  ChevronRight, ChevronLeft, Activity, BarChart2, Clock,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface RuleCheck {
  rule: string;
  status: "PASS" | "FAIL" | "SKIP" | "WARN";
  reason: string;
  value?: number | string | null;
}

interface ZoneEvaluation {
  zoneType: "demand" | "supply";
  direction: "buy" | "sell";
  priceTop: number;
  priceBottom: number;
  strength: number;
  inZone: boolean;
  approaching: boolean;
  rules: RuleCheck[];
  zoneScore: number;
  liquidityScore: number;
  amdScore: number;
  confirmationScore: number;
  finalScore: number;
  tradeTaken: boolean;
  blockingRule: string | null;
}

interface TraceTradeInfo {
  direction: "buy" | "sell";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  zoneType: string;
  zoneStrength: number;
  finalScore: number;
  liquidityScore: number;
  amdScore: number;
  confirmationScore: number;
  riskReward: number;
  outcome?: "win" | "loss";
  closedAtIndex?: number;
  closedPrice?: number;
  pnlPips?: number;
}

interface DecisionTrace {
  candleIndex: number;
  candleTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  atr: number;
  currentPrice: number;
  regime: string;
  regimeConfidence: number;
  amdPhase: string;
  amdScore: number;
  fibBias: string;
  swingTrend: string;
  zoneEvaluations: ZoneEvaluation[];
  activeZonesNearby: number;
  finalDecision: "TRADE" | "NO_TRADE" | "NO_ZONE";
  decisionReason: string;
  tradeTaken: boolean;
  trade?: TraceTradeInfo;
}

interface BiasFlag {
  type: string;
  candleIndex: number;
  candleTime: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  evidence: string;
  suggestedFix: string;
}

interface BiasSummary {
  flags: BiasFlag[];
  totalFlags: number;
  byType: Record<string, number>;
  overallRating: "clean" | "suspicious" | "biased";
}

interface ReplaySession {
  id: number;
  pair: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  status: string;
  totalCandles: number;
  totalEvaluated: number;
  totalTradesTaken: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  falsePositives: number;
  falseNegatives: number;
  missedOpportunities: number;
  reportGenerated: boolean;
  errorMessage?: string;
  createdAt: string;
}

interface ReplaySessionDetail extends ReplaySession {
  biasFlags: BiasSummary;
  traces: DecisionTrace[];
  candles: Array<{ time: string; open: number; high: number; low: number; close: number; volume: number }>;
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function fetchSessions(): Promise<ReplaySession[]> {
  const res = await fetch("/api/replay/sessions");
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}

async function fetchSession(id: number): Promise<ReplaySessionDetail> {
  const res = await fetch(`/api/replay/${id}`);
  if (!res.ok) throw new Error("Failed to fetch session");
  return res.json();
}

async function runReplay(body: { pair: string; timeframe: string; startDate: string; endDate: string }) {
  const res = await fetch("/api/replay/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Replay failed");
  }
  return res.json();
}

async function generateReport(id: number): Promise<{ reportText: string }> {
  const res = await fetch(`/api/replay/${id}/report`, { method: "POST" });
  if (!res.ok) throw new Error("Report generation failed");
  return res.json();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt5(n: number) { return n.toFixed(5); }
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

function RuleIcon({ status }: { status: RuleCheck["status"] }) {
  if (status === "PASS") return <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />;
  if (status === "FAIL") return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
  if (status === "WARN") return <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />;
  return <MinusCircle className="w-4 h-4 text-muted-foreground shrink-0" />;
}

function RuleBadge({ status }: { status: RuleCheck["status"] }) {
  const cls =
    status === "PASS" ? "bg-green-500/15 text-green-400 border-green-500/30" :
    status === "FAIL" ? "bg-red-500/15 text-red-400 border-red-500/30" :
    status === "WARN" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" :
    "bg-muted text-muted-foreground border-border";
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>{status}</span>;
}

function DecisionBadge({ decision }: { decision: DecisionTrace["finalDecision"] }) {
  if (decision === "TRADE") return <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold">TRADE</Badge>;
  if (decision === "NO_TRADE") return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/40">NO TRADE</Badge>;
  return <Badge className="bg-muted text-muted-foreground border-border text-xs">NO ZONE</Badge>;
}

function BiasRatingBadge({ rating }: { rating: BiasSummary["overallRating"] }) {
  if (rating === "clean") return <Badge className="bg-green-500/20 text-green-300 border-green-500/40">✅ Clean</Badge>;
  if (rating === "suspicious") return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/40">⚠️ Suspicious</Badge>;
  return <Badge className="bg-red-500/20 text-red-300 border-red-500/40">❌ Biased</Badge>;
}

function SeverityBadge({ severity }: { severity: BiasFlag["severity"] }) {
  const cls =
    severity === "critical" ? "bg-red-500/20 text-red-300 border-red-500/40" :
    severity === "high" ? "bg-orange-500/20 text-orange-300 border-orange-500/40" :
    severity === "medium" ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" :
    "bg-muted text-muted-foreground border-border";
  return <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${cls}`}>{severity}</span>;
}

// ── Config Form ───────────────────────────────────────────────────────────────

function ReplayConfigForm({ onSubmit, loading }: { onSubmit: (v: { pair: string; timeframe: string; startDate: string; endDate: string }) => void; loading: boolean }) {
  const [pair, setPair] = useState("EURUSD");
  const [timeframe, setTimeframe] = useState("4h");
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2024-06-30");

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">New Replay Session</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Pair</Label>
            <Select value={pair} onValueChange={setPair}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EURUSD">EUR/USD</SelectItem>
                <SelectItem value="GBPUSD">GBP/USD</SelectItem>
                <SelectItem value="USDJPY">USD/JPY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Timeframe</Label>
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="15m">15 min</SelectItem>
                <SelectItem value="1h">1 Hour</SelectItem>
                <SelectItem value="4h">4 Hour</SelectItem>
                <SelectItem value="1d">Daily</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Start Date</Label>
            <Input className="h-8 text-sm" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">End Date</Label>
            <Input className="h-8 text-sm" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <Button className="w-full h-8 text-sm" disabled={loading} onClick={() => onSubmit({ pair, timeframe, startDate, endDate })}>
          {loading ? <><Activity className="w-3 h-3 mr-2 animate-spin" /> Running...</> : <><Play className="w-3 h-3 mr-2" /> Run Replay</>}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Session List ──────────────────────────────────────────────────────────────

function SessionList({ sessions, selected, onSelect }: { sessions: ReplaySession[]; selected?: number; onSelect: (id: number) => void }) {
  if (sessions.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No replay sessions yet. Configure and run your first replay above.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Past Sessions</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border max-h-64 overflow-y-auto">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors flex items-center justify-between gap-2 ${selected === s.id ? "bg-primary/10" : ""}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{s.pair}</span>
                  <span className="text-xs text-muted-foreground">{s.timeframe}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${s.status === "complete" ? "bg-green-500/15 text-green-400 border-green-500/30" : s.status === "failed" ? "bg-red-500/15 text-red-400 border-red-500/30" : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"}`}>{s.status}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {s.startDate} → {s.endDate} · {s.totalTradesTaken} trades · {fmtPct(s.winRate)} WR
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Price Chart ───────────────────────────────────────────────────────────────

function PriceChart({
  candles, traces, currentIndex,
}: {
  candles: ReplaySessionDetail["candles"];
  traces: DecisionTrace[];
  currentIndex: number;
}) {
  const WINDOW = 80;
  const start = Math.max(0, currentIndex - WINDOW);
  const end = Math.min(candles.length - 1, currentIndex + 10);

  const visibleCandles = candles.slice(start, end + 1);

  const data = visibleCandles.map((c, i) => ({
    idx: start + i,
    close: parseFloat(c.close as unknown as string),
    time: new Date(c.time).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    isCurrent: start + i === currentIndex,
  }));

  const currentTrace = traces.find(t => t.candleIndex === currentIndex);
  const zones = currentTrace?.zoneEvaluations ?? [];
  const tradeZone = zones.find(z => z.tradeTaken);

  const yDomain: [number, number] = (() => {
    const prices = visibleCandles.map(c => parseFloat(c.close as unknown as string));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = (max - min) * 0.3;
    return [min - pad, max + pad];
  })();

  const tradeMarkers = traces
    .filter(t => t.tradeTaken && t.trade && t.candleIndex >= start && t.candleIndex <= end)
    .map(t => ({
      idx: t.candleIndex,
      close: parseFloat(candles[t.candleIndex]?.close as unknown as string ?? "0"),
      direction: t.trade!.direction,
      outcome: t.trade!.outcome,
    }));

  return (
    <div className="w-full h-48">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#888" }} interval={Math.floor(data.length / 6)} />
          <YAxis domain={yDomain} tick={{ fontSize: 9, fill: "#888" }} tickFormatter={v => v.toFixed(4)} width={60} />
          <Tooltip
            contentStyle={{ background: "#0f0f0f", border: "1px solid #333", borderRadius: 6, fontSize: 11 }}
            formatter={(v: number) => [v.toFixed(5), "Close"]}
          />

          {/* Zone bands */}
          {zones.map((z, i) => (
            <ReferenceArea
              key={i}
              y1={z.priceBottom}
              y2={z.priceTop}
              fill={z.zoneType === "demand" ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)"}
              stroke={z.zoneType === "demand" ? "rgba(34, 197, 94, 0.35)" : "rgba(239, 68, 68, 0.35)"}
              strokeWidth={1}
            />
          ))}

          {/* Trade entry/exit levels */}
          {tradeZone && currentTrace?.trade && (
            <>
              <ReferenceLine y={currentTrace.trade.entryPrice} stroke="#60a5fa" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: "Entry", position: "right", fontSize: 9, fill: "#60a5fa" }} />
              <ReferenceLine y={currentTrace.trade.stopLoss} stroke="#f87171" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: "SL", position: "right", fontSize: 9, fill: "#f87171" }} />
              <ReferenceLine y={currentTrace.trade.takeProfit} stroke="#4ade80" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: "TP", position: "right", fontSize: 9, fill: "#4ade80" }} />
            </>
          )}

          {/* Current candle line */}
          <ReferenceLine x={candles[currentIndex] ? new Date(candles[currentIndex]!.time).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""} stroke="rgba(96, 165, 250, 0.5)" strokeWidth={1.5} />

          <Line
            dataKey="close"
            type="monotone"
            dot={(props: { cx: number; cy: number; index: number; payload: { isCurrent: boolean } }) => {
              const { cx, cy, payload } = props;
              if (payload.isCurrent) {
                return <circle key={`dot-${props.index}`} cx={cx} cy={cy} r={5} fill="#60a5fa" stroke="#1d4ed8" strokeWidth={2} />;
              }
              const marker = tradeMarkers.find(m => m.idx === start + props.index);
              if (marker) {
                const color = marker.outcome === "win" ? "#4ade80" : marker.outcome === "loss" ? "#f87171" : "#facc15";
                const symbol = marker.direction === "buy" ? "▲" : "▼";
                return (
                  <text key={`marker-${props.index}`} x={cx} y={cy + (marker.direction === "buy" ? 10 : -10)} textAnchor="middle" fontSize={10} fill={color}>{symbol}</text>
                );
              }
              return <g key={`empty-${props.index}`} />;
            }}
            stroke="#3b82f6"
            strokeWidth={1.5}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Decision Trace Panel ──────────────────────────────────────────────────────

function DecisionTracePanel({ trace }: { trace: DecisionTrace | undefined }) {
  if (!trace) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
        <BarChart2 className="w-8 h-8 opacity-30" />
        <span>Navigate to a candle to see its decision trace</span>
      </div>
    );
  }

  const bestZone = trace.zoneEvaluations.find(z => z.tradeTaken) ?? trace.zoneEvaluations[0];

  return (
    <div className="space-y-3">
      {/* Candle context */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono">{new Date(trace.candleTime).toLocaleString()}</span>
        <div className="flex items-center gap-2">
          <DecisionBadge decision={trace.finalDecision} />
        </div>
      </div>

      {/* Market context row */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-muted/20 rounded p-2 text-center">
          <div className="text-muted-foreground mb-0.5">Regime</div>
          <div className="font-medium capitalize">{trace.regime}</div>
        </div>
        <div className="bg-muted/20 rounded p-2 text-center">
          <div className="text-muted-foreground mb-0.5">AMD Phase</div>
          <div className="font-medium capitalize">{trace.amdPhase} ({trace.amdScore})</div>
        </div>
        <div className="bg-muted/20 rounded p-2 text-center">
          <div className="text-muted-foreground mb-0.5">Fib Bias</div>
          <div className="font-medium capitalize">{trace.fibBias}</div>
        </div>
      </div>

      {trace.finalDecision === "NO_ZONE" && (
        <div className="text-xs text-muted-foreground bg-muted/20 rounded p-3">
          <MinusCircle className="w-4 h-4 inline mr-2 opacity-50" />
          No active supply/demand zones near current price. Strategy is waiting for a valid zone.
        </div>
      )}

      {bestZone && (
        <>
          <Separator />

          {trace.zoneEvaluations.length > 1 && (
            <div className="text-xs text-muted-foreground">
              {trace.zoneEvaluations.length} zones evaluated — showing{" "}
              <span className="text-foreground font-medium">{bestZone.tradeTaken ? "trade zone" : "best zone"}</span>
            </div>
          )}

          {/* Zone header */}
          <div className="flex items-center gap-2">
            <div className={`text-xs font-bold uppercase px-2 py-0.5 rounded border ${bestZone.zoneType === "demand" ? "bg-green-500/15 text-green-400 border-green-500/30" : "bg-red-500/15 text-red-400 border-red-500/30"}`}>
              {bestZone.direction.toUpperCase()} · {bestZone.zoneType}
            </div>
            <span className="text-xs text-muted-foreground">{fmt5(bestZone.priceBottom)} – {fmt5(bestZone.priceTop)}</span>
            <span className="text-xs text-muted-foreground">Strength: {bestZone.strength.toFixed(0)}</span>
          </div>

          {/* Rules */}
          <div className="space-y-2">
            {bestZone.rules.map((rule, i) => (
              <div key={i} className={`flex items-start gap-2 p-2 rounded text-xs border ${rule.status === "FAIL" ? "bg-red-500/5 border-red-500/20" : rule.status === "PASS" ? "bg-green-500/5 border-green-500/20" : "bg-muted/10 border-border"}`}>
                <RuleIcon status={rule.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium">{rule.rule}</span>
                    <RuleBadge status={rule.status} />
                    {rule.value !== undefined && rule.value !== null && (
                      <span className="text-muted-foreground font-mono">{typeof rule.value === "number" ? rule.value.toFixed(typeof rule.value === "number" && rule.value > 10 ? 0 : 2) : rule.value}</span>
                    )}
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{rule.reason}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Final decision summary */}
          <div className={`flex items-center gap-3 p-3 rounded border text-xs font-medium ${bestZone.tradeTaken ? "bg-blue-500/10 border-blue-500/30 text-blue-300" : "bg-muted/20 border-border text-muted-foreground"}`}>
            <ArrowRight className="w-4 h-4 shrink-0" />
            <span>Final Decision: {bestZone.tradeTaken ? `TRADE (score ${bestZone.finalScore.toFixed(0)})` : `NO TRADE — ${bestZone.blockingRule}`}</span>
          </div>

          {/* Trade info */}
          {trace.tradeTaken && trace.trade && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { label: "Entry", value: fmt5(trace.trade.entryPrice), color: "text-blue-400" },
                { label: "Stop Loss", value: fmt5(trace.trade.stopLoss), color: "text-red-400" },
                { label: "Take Profit", value: fmt5(trace.trade.takeProfit), color: "text-green-400" },
                { label: "R:R", value: `${trace.trade.riskReward.toFixed(2)}:1`, color: "" },
                { label: "Outcome", value: trace.trade.outcome ?? "pending", color: trace.trade.outcome === "win" ? "text-green-400" : trace.trade.outcome === "loss" ? "text-red-400" : "text-yellow-400" },
                { label: "P&L", value: trace.trade.pnlPips !== undefined ? `${trace.trade.pnlPips.toFixed(1)} pips` : "—", color: (trace.trade.pnlPips ?? 0) > 0 ? "text-green-400" : "text-red-400" },
              ].map((item, i) => (
                <div key={i} className="bg-muted/20 rounded p-2">
                  <div className="text-muted-foreground mb-0.5">{item.label}</div>
                  <div className={`font-mono font-medium ${item.color}`}>{item.value}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Bias Panel ────────────────────────────────────────────────────────────────

function BiasPanel({ bias }: { bias: BiasSummary }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Bias Detection</span>
        <BiasRatingBadge rating={bias.overallRating} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {Object.entries(bias.byType).map(([type, count]) => (
          <div key={type} className="flex items-center justify-between bg-muted/20 rounded p-2">
            <span className="text-muted-foreground capitalize">{type.replace(/_/g, " ")}</span>
            <span className={`font-bold ${count > 0 ? "text-red-400" : "text-green-400"}`}>{count}</span>
          </div>
        ))}
      </div>

      {bias.flags.length === 0 && (
        <div className="text-xs text-green-400 bg-green-500/10 rounded p-3 border border-green-500/20">
          <Shield className="w-4 h-4 inline mr-2" />
          No bias detected. Strategy operates with zero look-ahead bias.
        </div>
      )}

      {bias.flags.map((flag, i) => (
        <div key={i} className="text-xs bg-muted/10 rounded border border-border p-3 space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-3 h-3 text-red-400" />
            <span className="font-medium capitalize">{flag.type.replace(/_/g, " ")}</span>
            <SeverityBadge severity={flag.severity} />
          </div>
          <p className="text-muted-foreground">{flag.description}</p>
          <p className="text-blue-400 italic">Fix: {flag.suggestedFix}</p>
        </div>
      ))}
    </div>
  );
}

// ── Session Stats ─────────────────────────────────────────────────────────────

function SessionStats({ session }: { session: ReplaySessionDetail }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {[
        { label: "Win Rate", value: fmtPct(session.winRate), color: session.winRate >= 50 ? "text-green-400" : "text-red-400" },
        { label: "Trades", value: session.totalTradesTaken.toString(), color: "" },
        { label: "False Positives", value: session.falsePositives.toString(), color: session.falsePositives > 10 ? "text-red-400" : "" },
        { label: "Missed Ops", value: session.missedOpportunities.toString(), color: "" },
      ].map((s, i) => (
        <Card key={i} className="border-border bg-card">
          <CardContent className="pt-3 pb-3 text-center">
            <div className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{s.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Replay Viewer ─────────────────────────────────────────────────────────────

function ReplayViewer({ sessionId }: { sessionId: number }) {
  const { data: session, isLoading, error } = useQuery({
    queryKey: ["replay-session", sessionId],
    queryFn: () => fetchSession(sessionId),
  });

  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const reportMut = useMutation({
    mutationFn: () => generateReport(sessionId),
    onSuccess: (data) => { setReportText(data.reportText); setShowReport(true); },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm"><Activity className="w-4 h-4 mr-2 animate-spin" /> Loading session...</div>;
  }

  if (error || !session) {
    return <div className="text-red-400 text-sm p-4">Failed to load session.</div>;
  }

  const traces = session.traces;
  const candles = session.candles;
  const tracesWithZones = traces.filter(t => t.finalDecision !== "NO_ZONE");

  // Initialize to first trace with zone activity
  const effectiveIndex = currentIndex ?? (tracesWithZones[0]?.candleIndex ?? (traces[0]?.candleIndex ?? 0));
  const currentTrace = traces.find(t => t.candleIndex === effectiveIndex);

  const handlePrev = useCallback(() => {
    const idx = tracesWithZones.findIndex(t => t.candleIndex === effectiveIndex);
    if (idx > 0) setCurrentIndex(tracesWithZones[idx - 1]!.candleIndex);
  }, [effectiveIndex, tracesWithZones]);

  const handleNext = useCallback(() => {
    const idx = tracesWithZones.findIndex(t => t.candleIndex === effectiveIndex);
    if (idx < tracesWithZones.length - 1) setCurrentIndex(tracesWithZones[idx + 1]!.candleIndex);
  }, [effectiveIndex, tracesWithZones]);

  const handlePrevTrade = useCallback(() => {
    const traded = traces.filter(t => t.tradeTaken);
    const idx = traded.findIndex(t => t.candleIndex === effectiveIndex);
    if (idx > 0) setCurrentIndex(traded[idx - 1]!.candleIndex);
    else if (idx === -1 && traded.length > 0) setCurrentIndex(traded[traded.length - 1]!.candleIndex);
  }, [effectiveIndex, traces]);

  const handleNextTrade = useCallback(() => {
    const traded = traces.filter(t => t.tradeTaken);
    const idx = traded.findIndex(t => t.candleIndex === effectiveIndex);
    if (idx === -1) { if (traded.length > 0) setCurrentIndex(traded[0]!.candleIndex); }
    else if (idx < traded.length - 1) setCurrentIndex(traded[idx + 1]!.candleIndex);
  }, [effectiveIndex, traces]);

  const currentZoneIdx = tracesWithZones.findIndex(t => t.candleIndex === effectiveIndex);
  const totalZoneTraces = tracesWithZones.length;

  return (
    <div className="space-y-4">
      <SessionStats session={session} />

      {/* Chart */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              {session.pair} · {session.timeframe} · {session.startDate} → {session.endDate}
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{candles.length} candles</span>
              <span>·</span>
              <span>{session.totalTradesTaken} trades</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <PriceChart candles={candles} traces={traces} currentIndex={effectiveIndex} />

          {/* Legend */}
          <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500/25 border border-green-500/40 inline-block" />Demand Zone</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/25 border border-red-500/40 inline-block" />Supply Zone</span>
            <span className="flex items-center gap-1"><span className="text-green-400">▲</span> Win</span>
            <span className="flex items-center gap-1"><span className="text-red-400">▼</span> Loss</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400/60 inline-block" />Current bar</span>
          </div>
        </CardContent>
      </Card>

      {/* Controls */}
      <Card className="border-border bg-card">
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={handlePrevTrade} title="Previous Trade">
                <SkipBack className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={handlePrev} title="Previous Zone Candle">
                <StepBack className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={handleNext} title="Next Zone Candle">
                <StepForward className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={handleNextTrade} title="Next Trade">
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              Zone event {currentZoneIdx + 1} of {totalZoneTraces}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => reportMut.mutate()} disabled={reportMut.isPending}>
                <FileText className="w-3 h-3 mr-1" />
                {reportMut.isPending ? "Generating..." : "Get Report"}
              </Button>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground text-center">
            <span className="text-muted-foreground/60">← SkipBack/Forward = jump to trades &nbsp;·&nbsp; StepBack/Forward = navigate zone events</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {/* Decision Trace */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Decision Trace
              {currentTrace && <DecisionBadge decision={currentTrace.finalDecision} />}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            <DecisionTracePanel trace={currentTrace} />
          </CardContent>
        </Card>

        {/* Bias Detection */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Bias Detection
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            <BiasPanel bias={session.biasFlags} />
          </CardContent>
        </Card>
      </div>

      {/* Report Modal */}
      {showReport && reportText && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                VALIDATION_REPORT.md
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowReport(false)}>Close</Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap text-muted-foreground max-h-96 overflow-y-auto p-3 bg-muted/20 rounded border border-border">
              {reportText}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Trade List */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Trade History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left px-4 py-2">Time</th>
                  <th className="text-left px-4 py-2">Dir</th>
                  <th className="text-right px-4 py-2">Entry</th>
                  <th className="text-right px-4 py-2">SL</th>
                  <th className="text-right px-4 py-2">TP</th>
                  <th className="text-right px-4 py-2">Score</th>
                  <th className="text-right px-4 py-2">R:R</th>
                  <th className="text-right px-4 py-2">P&L</th>
                  <th className="text-right px-4 py-2">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {traces.filter(t => t.tradeTaken && t.trade).map((t, i) => (
                  <tr
                    key={i}
                    className={`hover:bg-muted/20 cursor-pointer transition-colors ${effectiveIndex === t.candleIndex ? "bg-primary/10" : ""}`}
                    onClick={() => setCurrentIndex(t.candleIndex)}
                  >
                    <td className="px-4 py-2 font-mono text-muted-foreground">{new Date(t.candleTime).toLocaleDateString()}</td>
                    <td className="px-4 py-2">
                      <span className={`font-bold ${t.trade!.direction === "buy" ? "text-green-400" : "text-red-400"}`}>
                        {t.trade!.direction === "buy" ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                        {" "}{t.trade!.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-right">{fmt5(t.trade!.entryPrice)}</td>
                    <td className="px-4 py-2 font-mono text-right text-red-400">{fmt5(t.trade!.stopLoss)}</td>
                    <td className="px-4 py-2 font-mono text-right text-green-400">{fmt5(t.trade!.takeProfit)}</td>
                    <td className="px-4 py-2 font-mono text-right">{t.trade!.finalScore.toFixed(0)}</td>
                    <td className="px-4 py-2 font-mono text-right">{t.trade!.riskReward.toFixed(2)}</td>
                    <td className={`px-4 py-2 font-mono text-right ${(t.trade!.pnlPips ?? 0) > 0 ? "text-green-400" : "text-red-400"}`}>
                      {t.trade!.pnlPips !== undefined ? `${t.trade!.pnlPips > 0 ? "+" : ""}${t.trade!.pnlPips.toFixed(1)}p` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {t.trade!.outcome === "win" ? <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-[10px]">WIN</Badge> :
                       t.trade!.outcome === "loss" ? <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px]">LOSS</Badge> :
                       <Badge className="bg-muted text-muted-foreground border-border text-[10px]">OPEN</Badge>}
                    </td>
                  </tr>
                ))}
                {traces.filter(t => t.tradeTaken).length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">No trades taken in this replay session</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReplayPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["replay-sessions"],
    queryFn: fetchSessions,
    refetchInterval: 10000,
  });

  const runMut = useMutation({
    mutationFn: runReplay,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["replay-sessions"] });
      setSelectedId(data.id);
    },
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Activity className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold uppercase tracking-tight font-mono">Strategy Validation & Replay</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Replay historical candles one at a time · Zero look-ahead bias · Full decision trace per candle</p>
        </div>
      </div>

      {runMut.isError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-sm text-red-400">
          {(runMut.error as Error).message}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 space-y-4">
          <ReplayConfigForm onSubmit={(v) => runMut.mutate(v)} loading={runMut.isPending} />
          {sessionsLoading ? (
            <div className="text-xs text-muted-foreground p-4 text-center"><Activity className="w-4 h-4 inline animate-spin mr-2" />Loading sessions…</div>
          ) : (
            <SessionList sessions={sessions} selected={selectedId ?? undefined} onSelect={setSelectedId} />
          )}
        </div>

        <div className="col-span-2">
          {selectedId ? (
            <ReplayViewer sessionId={selectedId} />
          ) : (
            <Card className="border-border bg-card h-full flex items-center justify-center">
              <CardContent className="text-center space-y-3 py-16">
                <Activity className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <div className="text-sm text-muted-foreground">Run a replay session or select one from the list to view results</div>
                <div className="text-xs text-muted-foreground/60">Every candle is evaluated against all strategy rules with full decision trace</div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
