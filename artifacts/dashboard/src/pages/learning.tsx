import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import {
  Brain, PlayCircle, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, Info, Activity, BarChart2, Shield, Clock, Minus,
} from "lucide-react";

// ─── API helpers ──────────────────────────────────────────────────────────────

const API = "/api/learning-engine";

async function fetchJson(path: string) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useDashboard() {
  return useQuery({
    queryKey: ["le-dashboard"],
    queryFn: () => fetchJson(`${API}/dashboard`),
    refetchInterval: 30_000,
  });
}

function useTrend() {
  return useQuery({ queryKey: ["le-trend"], queryFn: () => fetchJson(`${API}/metrics/trend?limit=12`) });
}

function useHistory() {
  return useQuery({ queryKey: ["le-history"], queryFn: () => fetchJson(`${API}/history?limit=20`) });
}

function useRecommendations() {
  return useQuery({ queryKey: ["le-recs"], queryFn: () => fetchJson(`${API}/recommendations`) });
}

function useStatistics() {
  return useQuery({ queryKey: ["le-stats"], queryFn: () => fetchJson(`${API}/statistics`) });
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const pct = (v: number | null | undefined) => v == null ? "—" : `${(v * 100).toFixed(1)}%`;
const num = (v: number | null | undefined, d = 2) =>
  v == null ? "—" : !isFinite(v) ? "∞" : v.toFixed(d);
const conf = (v: number | null | undefined) => v == null ? "—" : `${Number(v).toFixed(1)}%`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier?: string }) {
  const colors: Record<string, string> = {
    very_high: "bg-green-500/20 text-green-400 border-green-500/30",
    high: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    moderate: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    insufficient: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const t = tier ?? "insufficient";
  return (
    <span className={`px-2 py-0.5 rounded border text-xs font-mono uppercase tracking-wide ${colors[t] ?? colors.insufficient}`}>
      {t.replace("_", " ")}
    </span>
  );
}

function PriorityIcon({ priority }: { priority: string }) {
  if (priority === "high") return <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />;
  if (priority === "medium") return <Info size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />;
  return <CheckCircle size={14} className="text-green-400 flex-shrink-0 mt-0.5" />;
}

function SegmentTable({ data }: { data: Record<string, any> }) {
  if (!data || Object.keys(data).length === 0)
    return <div className="p-6 text-center text-muted-foreground text-sm font-mono">No segment data</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b border-border bg-muted/5">
            {["Segment", "Trades", "Win Rate", "Avg R:R", "Profit Factor", "Expectancy", "Total PnL"].map(h => (
              <th key={h} className="px-4 py-2 text-left text-xs uppercase text-muted-foreground tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Object.entries(data).map(([key, seg]: [string, any]) => (
            <tr key={key} className="hover:bg-muted/5">
              <td className="px-4 py-2 font-medium capitalize">{key}</td>
              <td className="px-4 py-2">{seg.totalTrades}</td>
              <td className={`px-4 py-2 ${seg.winRate >= 0.5 ? "text-green-400" : seg.winRate >= 0.35 ? "text-yellow-400" : "text-red-400"}`}>
                {pct(seg.winRate)}
              </td>
              <td className="px-4 py-2">{num(seg.avgRR)}</td>
              <td className="px-4 py-2">{!isFinite(seg.profitFactor) || seg.profitFactor > 100 ? "∞" : num(seg.profitFactor)}</td>
              <td className="px-4 py-2">{num(seg.expectancy)}</td>
              <td className="px-4 py-2">{num(seg.totalPnl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = ["Overview", "Metrics", "Confidence", "Performance", "Evidence", "History"] as const;
type Tab = (typeof TABS)[number];

// ─── Tooltip styles ───────────────────────────────────────────────────────────

const ttStyle = {
  contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontFamily: "monospace", fontSize: 11 },
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Learning() {
  const [tab, setTab] = useState<Tab>("Overview");
  const qc = useQueryClient();

  const { data: dash, isLoading: dashLoading } = useDashboard();
  const { data: trendData } = useTrend();
  const { data: historyData } = useHistory();
  const { data: recsData } = useRecommendations();
  const { data: statsData } = useStatistics();

  const runMutation = useMutation({
    mutationFn: () =>
      fetch(`${API}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(r => r.json()),
    onSuccess: () => {
      ["le-dashboard", "le-trend", "le-history", "le-recs", "le-stats"].forEach(k =>
        qc.invalidateQueries({ queryKey: [k] }),
      );
    },
  });

  const latest = dash?.latest;
  const metrics = latest?.metrics ?? null;
  const confidence = latest?.confidence ?? null;
  const trend = trendData?.trend ?? [];
  const history = historyData?.history ?? [];
  const recs: any[] = recsData?.recommendations ?? [];
  const stats = statsData?.statistics ?? null;

  // ── Header ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Brain size={22} className="text-primary" />
            <h1 className="text-2xl font-bold font-mono uppercase tracking-tight">Learning Engine</h1>
            <Badge variant="outline" className="font-mono text-xs">v{dash?.engineVersion ?? "1.0.0"}</Badge>
            <Badge variant="outline" className="font-mono text-xs text-yellow-400 border-yellow-500/40">Advisory Only</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1 ml-9">
            Observes, measures, and learns from historical memory. Never modifies trading behavior.
          </p>
        </div>
        <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} className="gap-2 font-mono">
          <PlayCircle size={16} />
          {runMutation.isPending ? "Running…" : "Run Learning Cycle"}
        </Button>
      </div>

      {/* Run result flash */}
      {runMutation.isSuccess && runMutation.data && (
        <div className={`p-3 rounded border text-sm font-mono flex items-center gap-2 ${
          runMutation.data.success
            ? "bg-green-500/10 border-green-500/30 text-green-400"
            : "bg-red-500/10 border-red-500/30 text-red-400"
        }`}>
          {runMutation.data.success ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          {runMutation.data.success
            ? `Cycle #${runMutation.data.cycleNumber} complete — ${runMutation.data.totalTrades} trades, confidence ${Number(runMutation.data.overallConfidence ?? 0).toFixed(1)}%`
            : `Cycle failed: ${runMutation.data.errorMessage}`
          }
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {[
          { label: "Cycles", value: dashLoading ? "…" : (dash?.totalCycles ?? 0) },
          { label: "Sample", value: dashLoading ? "…" : (latest?.sampleSize ?? "—") },
          { label: "Win Rate", value: dashLoading ? "…" : pct(metrics?.winRate) },
          { label: "Avg R:R", value: dashLoading ? "…" : num(metrics?.avgRR) },
          { label: "Profit Factor", value: dashLoading ? "…" : num(metrics?.profitFactor) },
          { label: "Sharpe", value: dashLoading ? "…" : num(metrics?.sharpeRatio) },
          { label: "Confidence", value: dashLoading ? "…" : conf(confidence?.overallConfidence) },
          { label: "Data Quality", value: dashLoading ? "…" : conf(confidence?.dataQuality) },
        ].map(({ label, value }) => (
          <Card key={label} className="bg-card border-card-border">
            <CardContent className="p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className="text-lg font-bold font-mono mt-1">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-mono whitespace-nowrap border-b-2 transition-colors ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {tab === "Overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cycle summary */}
          <Card className="bg-card border-card-border lg:col-span-2">
            <CardHeader className="bg-muted/10 border-b border-border py-3">
              <CardTitle className="text-sm font-mono uppercase tracking-wide">Latest Cycle Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {dashLoading ? (
                <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
              ) : !latest ? (
                <div className="text-center py-8 text-muted-foreground font-mono text-sm">
                  <Brain size={32} className="mx-auto mb-3 opacity-30" />
                  No learning cycles yet. Click "Run Learning Cycle" to begin.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Status", value: latest.status?.toUpperCase() },
                      { label: "Validation", value: latest.validationStatus?.toUpperCase() },
                      { label: "Duration", value: latest.durationMs ? `${latest.durationMs}ms` : "—" },
                      { label: "Cycle #", value: latest.cycleNumber },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-muted/20 rounded p-2">
                        <div className="text-[10px] font-mono uppercase text-muted-foreground">{label}</div>
                        <div className="font-mono font-medium text-sm mt-0.5">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-sm font-mono">
                    {[
                      ["Total Trades", latest.sampleSize],
                      ["Wins", metrics?.wins],
                      ["Losses", metrics?.losses],
                      ["Break Evens", metrics?.breakEvens],
                      ["Total PnL", metrics?.totalPnl?.toFixed(2)],
                      ["Max Drawdown", metrics ? `${metrics.maxDrawdownPct.toFixed(1)}%` : "—"],
                      ["Gross Profit", metrics?.grossProfit?.toFixed(2)],
                      ["Gross Loss", metrics?.grossLoss?.toFixed(2)],
                      ["Recovery Factor", num(metrics?.recoveryFactor)],
                    ].map(([l, v]) => (
                      <div key={String(l)} className="flex justify-between border-b border-border/40 pb-1">
                        <span className="text-muted-foreground">{l}</span>
                        <span className="font-medium">{v ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Confidence panel */}
          <Card className="bg-card border-card-border">
            <CardHeader className="bg-muted/10 border-b border-border py-3">
              <CardTitle className="text-sm font-mono uppercase tracking-wide">Confidence</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {!confidence ? (
                <div className="text-center py-6 text-muted-foreground text-sm font-mono">No data</div>
              ) : (
                <>
                  <div className="text-center">
                    <div className="text-4xl font-bold font-mono">{Number(confidence.overallConfidence).toFixed(1)}%</div>
                    <div className="mt-1"><TierBadge tier={confidence.overallTier} /></div>
                    <div className="text-xs text-muted-foreground font-mono mt-2">Wilson Score Lower Bound</div>
                  </div>
                  <div className="space-y-2 text-sm font-mono">
                    {[
                      ["Data Quality", conf(confidence.dataQuality)],
                      ["Min Sample", confidence.minSampleReached ? "✓ Yes" : "✗ No"],
                      ["n", confidence.sampleSize],
                    ].map(([l, v]) => (
                      <div key={String(l)} className="flex justify-between">
                        <span className="text-muted-foreground">{l}</span>
                        <span className="font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                  {Object.entries(confidence.byPair ?? {}).map(([pair, seg]: [string, any]) => (
                    <div key={pair} className="space-y-1">
                      <div className="flex justify-between text-xs font-mono text-muted-foreground">
                        <span>{pair}</span><span>{Number(seg.finalConfidence ?? 0).toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, seg.finalConfidence ?? 0)}%` }} />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          {/* Trend chart */}
          {trend.length > 0 && (
            <Card className="bg-card border-card-border lg:col-span-3">
              <CardHeader className="bg-muted/10 border-b border-border py-3">
                <CardTitle className="text-sm font-mono uppercase tracking-wide">Win Rate & Confidence Trend</CardTitle>
              </CardHeader>
              <CardContent className="p-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="cycleNumber" tick={{ fontSize: 10, fontFamily: "monospace" }} label={{ value: "Cycle #", position: "insideBottom", offset: -2, fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: "monospace" }} domain={[0, 100]} />
                    <Tooltip {...ttStyle} formatter={(v: any, n: string) => [`${Number(v).toFixed(1)}%`, n === "wr" ? "Win Rate" : "Confidence"]} />
                    <Line type="monotone" dataKey={(d: any) => d.winRate != null ? d.winRate * 100 : null} name="wr" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="confidence" name="conf" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Metrics ──────────────────────────────────────────────────────── */}
      {tab === "Metrics" && (
        <div className="space-y-6">
          {!metrics ? (
            <div className="text-center py-16 text-muted-foreground font-mono">No metrics yet. Run a learning cycle first.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Win Rate", value: pct(metrics.winRate), sub: `${metrics.wins}W / ${metrics.losses}L / ${metrics.breakEvens}BE` },
                  { label: "Avg R:R", value: num(metrics.avgRR), sub: "actual achieved" },
                  { label: "Profit Factor", value: num(metrics.profitFactor), sub: "gross P / gross L" },
                  { label: "Expectancy", value: num(metrics.expectancy), sub: "E[return] per trade" },
                  { label: "Sharpe Ratio", value: num(metrics.sharpeRatio), sub: "mean / σ (rf=0)" },
                  { label: "Sortino Ratio", value: num(metrics.sortinoRatio), sub: "mean / downside σ" },
                  { label: "Max Drawdown", value: `${metrics.maxDrawdownPct?.toFixed(1)}%`, sub: "peak-to-trough" },
                  { label: "Recovery Factor", value: num(metrics.recoveryFactor), sub: "total PnL / maxDD" },
                ].map(({ label, value, sub }) => (
                  <Card key={label} className="bg-card border-card-border">
                    <CardContent className="p-4">
                      <div className="text-xs font-mono uppercase text-muted-foreground">{label}</div>
                      <div className="text-2xl font-bold font-mono mt-1">{value}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {[
                { title: "By Pair", icon: <BarChart2 size={14} />, data: metrics.byPair },
                { title: "By Session", icon: <Clock size={14} />, data: metrics.bySession },
                { title: "By Regime", icon: <Activity size={14} />, data: metrics.byRegime },
              ].map(({ title, icon, data }) => (
                <Card key={title} className="bg-card border-card-border">
                  <CardHeader className="bg-muted/10 border-b border-border py-3">
                    <CardTitle className="text-sm font-mono uppercase tracking-wide flex items-center gap-2">{icon}{title}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0"><SegmentTable data={data} /></CardContent>
                </Card>
              ))}

              {metrics.confidenceDistribution?.length > 0 && (
                <Card className="bg-card border-card-border">
                  <CardHeader className="bg-muted/10 border-b border-border py-3">
                    <CardTitle className="text-sm font-mono uppercase tracking-wide">Confidence Distribution</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={metrics.confidenceDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "monospace" }} />
                        <YAxis tick={{ fontSize: 10, fontFamily: "monospace" }} />
                        <Tooltip {...ttStyle} />
                        <Bar dataKey="count" fill="#3b82f6" name="Trades" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Confidence ───────────────────────────────────────────────────── */}
      {tab === "Confidence" && (
        <div className="space-y-6">
          {!confidence ? (
            <div className="text-center py-16 text-muted-foreground font-mono">No confidence data yet.</div>
          ) : (
            <>
              <Card className="bg-card border-card-border">
                <CardHeader className="bg-muted/10 border-b border-border py-3">
                  <CardTitle className="text-sm font-mono uppercase tracking-wide flex items-center gap-2">
                    <Shield size={14} /> Methodology
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 text-sm font-mono text-muted-foreground leading-relaxed">
                  {confidence.methodology}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[
                  { title: "By Pair", data: confidence.byPair },
                  { title: "By Session", data: confidence.bySession },
                  { title: "By Regime", data: confidence.byRegime },
                ].map(({ title, data }) => (
                  <Card key={title} className="bg-card border-card-border">
                    <CardHeader className="bg-muted/10 border-b border-border py-3">
                      <CardTitle className="text-sm font-mono uppercase tracking-wide">{title}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-3">
                      {Object.entries(data ?? {}).map(([label, seg]: [string, any]) => (
                        <div key={label} className="space-y-1">
                          <div className="flex justify-between text-xs font-mono">
                            <span>{label}</span>
                            <span className="text-muted-foreground">n={seg.sampleSize}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, seg.finalConfidence ?? 0)}%` }} />
                            </div>
                            <span className="text-xs font-mono w-12 text-right">{Number(seg.finalConfidence ?? 0).toFixed(1)}%</span>
                          </div>
                          <TierBadge tier={seg.confidenceTier} />
                          {seg.sampleSize >= 5 && (
                            <div className="text-[10px] text-muted-foreground font-mono pt-0.5">
                              WR: {pct(seg.observedSuccessRate)} · Wilson: {Number(seg.wilsonLowerBound * 100 ?? 0).toFixed(1)}%
                            </div>
                          )}
                        </div>
                      ))}
                      {Object.keys(data ?? {}).length === 0 && (
                        <div className="text-muted-foreground text-sm text-center py-4">No data</div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Radar — overall confidence by pair */}
              {Object.keys(confidence.byPair ?? {}).length > 0 && (
                <Card className="bg-card border-card-border">
                  <CardHeader className="bg-muted/10 border-b border-border py-3">
                    <CardTitle className="text-sm font-mono uppercase tracking-wide">Pair Confidence Radar</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={Object.entries(confidence.byPair).map(([k, v]: [string, any]) => ({
                        pair: k,
                        confidence: Number(v.finalConfidence ?? 0),
                        winRate: Number((v.observedSuccessRate ?? 0) * 100),
                      }))}>
                        <PolarGrid stroke="rgba(255,255,255,0.1)" />
                        <PolarAngleAxis dataKey="pair" tick={{ fontSize: 10, fontFamily: "monospace" }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 8 }} />
                        <Radar name="Confidence" dataKey="confidence" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                        <Radar name="Win Rate" dataKey="winRate" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                        <Tooltip {...ttStyle} formatter={(v: any) => [`${Number(v).toFixed(1)}%`]} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Performance ──────────────────────────────────────────────────── */}
      {tab === "Performance" && (
        <div className="space-y-6">
          {!metrics ? (
            <div className="text-center py-16 text-muted-foreground font-mono">No performance data yet.</div>
          ) : (
            <>
              {[
                { title: "Zone Quality", data: metrics.byZoneQuality },
                { title: "Liquidity", data: metrics.byLiquidity },
                { title: "AMD Score", data: metrics.byAmd },
                { title: "Confirmation", data: metrics.byConfirmation },
                { title: "Volatility", data: metrics.byVolatility },
              ].map(({ title, data }) => (
                <Card key={title} className="bg-card border-card-border">
                  <CardHeader className="bg-muted/10 border-b border-border py-3">
                    <CardTitle className="text-sm font-mono uppercase tracking-wide">{title} Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0"><SegmentTable data={data} /></CardContent>
                </Card>
              ))}

              {metrics.rrDistribution?.length > 0 && (
                <Card className="bg-card border-card-border">
                  <CardHeader className="bg-muted/10 border-b border-border py-3">
                    <CardTitle className="text-sm font-mono uppercase tracking-wide">R:R Distribution</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={metrics.rrDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "monospace" }} />
                        <YAxis tick={{ fontSize: 10, fontFamily: "monospace" }} />
                        <Tooltip {...ttStyle} formatter={(v: any, n: string) => [n === "winRate" ? pct(Number(v)) : v, n === "winRate" ? "Win Rate" : "Count"]} />
                        <Bar dataKey="count" fill="#3b82f6" name="count" />
                        <Bar dataKey="winRate" fill="#10b981" name="winRate" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {metrics.durationDistribution?.length > 0 && (
                <Card className="bg-card border-card-border">
                  <CardHeader className="bg-muted/10 border-b border-border py-3">
                    <CardTitle className="text-sm font-mono uppercase tracking-wide">Duration Distribution</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={metrics.durationDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "monospace" }} />
                        <YAxis tick={{ fontSize: 10, fontFamily: "monospace" }} />
                        <Tooltip {...ttStyle} />
                        <Bar dataKey="count" fill="#8b5cf6" name="Trades" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Evidence ─────────────────────────────────────────────────────── */}
      {tab === "Evidence" && (
        <div className="space-y-6">
          <Card className="bg-card border-card-border">
            <CardHeader className="bg-muted/10 border-b border-border py-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-mono uppercase tracking-wide">Advisory Recommendations</CardTitle>
                <Badge variant="outline" className="text-xs font-mono text-yellow-400 border-yellow-500/40">
                  Advisory Only — Never Auto-Applied
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {recs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground font-mono text-sm">
                  No recommendations yet. Run a learning cycle first.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recs.map((r: any) => (
                    <div key={r.id} className="p-4 hover:bg-muted/5">
                      <div className="flex items-start gap-3">
                        <PriorityIcon priority={r.priority} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-mono font-medium text-sm">{r.title}</span>
                            <Badge variant="outline" className="text-xs font-mono capitalize">{r.category?.replace("_", " ")}</Badge>
                            <span className="text-xs font-mono text-muted-foreground">conf: {Number(r.confidence).toFixed(0)}%</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{r.description}</p>
                          <div className="mt-2 p-2 bg-muted/20 rounded text-xs font-mono text-muted-foreground">
                            <span className="text-primary">Evidence: </span>{r.evidence}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-card border-card-border">
                <CardHeader className="bg-muted/10 border-b border-border py-3">
                  <CardTitle className="text-sm font-mono uppercase tracking-wide">Skipped Setups</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="text-3xl font-bold font-mono">{stats.skippedSetupInsights?.totalSkipped ?? 0}</div>
                  <div className="space-y-1 text-sm font-mono">
                    {Object.entries(stats.skippedSetupInsights?.byRejectingRule ?? {}).slice(0, 5).map(([rule, cnt]: [string, any]) => (
                      <div key={rule} className="flex justify-between border-b border-border/40 pb-1">
                        <span className="text-muted-foreground truncate mr-2">{rule}</span>
                        <span className="font-medium">{cnt}</span>
                      </div>
                    ))}
                  </div>
                  {stats.skippedSetupInsights?.avgScores && (
                    <div className="text-xs font-mono text-muted-foreground space-y-0.5 pt-1">
                      {Object.entries(stats.skippedSetupInsights.avgScores).map(([k, v]: [string, any]) => (
                        <div key={k} className="flex justify-between">
                          <span className="capitalize">Avg {k}</span><span>{Number(v).toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card border-card-border">
                <CardHeader className="bg-muted/10 border-b border-border py-3">
                  <CardTitle className="text-sm font-mono uppercase tracking-wide">Manual Reviews</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="text-3xl font-bold font-mono">{stats.reviewInsights?.totalReviewed ?? 0}</div>
                  <div className="space-y-2 text-sm font-mono">
                    {[
                      ["Avg Rating", stats.reviewInsights?.avgRating?.toFixed(1) ?? "—"],
                      ["Rule Adherence", pct(stats.reviewInsights?.ruleAdherenceRate)],
                    ].map(([l, v]) => (
                      <div key={String(l)} className="flex justify-between border-b border-border/40 pb-1">
                        <span className="text-muted-foreground">{l}</span>
                        <span className="font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ── History ──────────────────────────────────────────────────────── */}
      {tab === "History" && (
        <Card className="bg-card border-card-border">
          <CardHeader className="bg-muted/10 border-b border-border py-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">Learning Cycle History (Append-Only)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {history.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground font-mono text-sm">No cycles yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-mono">
                  <thead>
                    <tr className="border-b border-border bg-muted/5">
                      {["#", "Status", "Triggered", "Sample", "Win Rate", "Confidence", "Duration", "Date"].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-xs uppercase text-muted-foreground tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((row: any) => (
                      <tr key={row.cycleId ?? row.id} className="hover:bg-muted/5">
                        <td className="px-4 py-2">{row.cycleNumber ?? row.id}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs ${row.status === "complete" ? "text-green-400" : row.status === "failed" ? "text-red-400" : "text-yellow-400"}`}>
                            {row.status?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{row.triggeredBy}</td>
                        <td className="px-4 py-2">{row.sampleSize}</td>
                        <td className="px-4 py-2">{row.winRate ? pct(Number(row.winRate)) : "—"}</td>
                        <td className="px-4 py-2">{row.overallConfidence ? conf(Number(row.overallConfidence)) : "—"}</td>
                        <td className="px-4 py-2">{row.durationMs ? `${row.durationMs}ms` : "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground text-xs">
                          {row.startedAt ? new Date(row.startedAt).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
