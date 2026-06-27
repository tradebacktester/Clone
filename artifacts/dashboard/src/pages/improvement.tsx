import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell, ReferenceLine, AreaChart, Area } from "recharts";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Info, FileText, Activity, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";

const API = (path: string) => `/api${path}`;

function useImprovementSummary() {
  return useQuery({ queryKey: ["improvement-summary"], queryFn: () => fetch(API("/improvement/summary")).then(r => r.json()), refetchInterval: 60000 });
}
function useStrategyDrift() {
  return useQuery({ queryKey: ["strategy-drift"], queryFn: () => fetch(API("/improvement/strategy-drift")).then(r => r.json()), refetchInterval: 60000 });
}
function useRecommendations() {
  return useQuery({ queryKey: ["improvement-recs"], queryFn: () => fetch(API("/improvement/recommendations")).then(r => r.json()), refetchInterval: 60000 });
}
function useConfidenceCalibration() {
  return useQuery({ queryKey: ["confidence-cal"], queryFn: () => fetch(API("/improvement/confidence-calibration")).then(r => r.json()) });
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low: "bg-green-500/20 text-green-400 border-green-500/30",
  };
  return <Badge className={`text-xs font-mono uppercase ${map[priority] ?? "bg-muted text-muted-foreground"}`}>{priority}</Badge>;
}

function WinRateBar({ value, max = 100 }: { value: number; max?: number }) {
  const color = value >= 55 ? "#22c55e" : value >= 45 ? "#eab308" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted/30 rounded-full h-1.5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((value / max) * 100, 100)}%`, background: color }} />
      </div>
      <span className="text-xs font-mono font-bold w-12 text-right" style={{ color }}>{value.toFixed(1)}%</span>
    </div>
  );
}

export default function ImprovementDashboard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: summary, isLoading: loadingSummary } = useImprovementSummary();
  const { data: drift, isLoading: loadingDrift } = useStrategyDrift();
  const { data: recs, isLoading: loadingRecs } = useRecommendations();
  const { data: calibration, isLoading: loadingCal } = useConfidenceCalibration();

  const generateReport = async () => {
    const res = await fetch(API("/improvement/report"), { method: "POST" });
    if (res.ok) {
      toast({ title: "Improvement report generated", description: "Saved to IMPROVEMENT_REPORT.md" });
    } else {
      toast({ title: "Failed to generate report", variant: "destructive" });
    }
  };

  const monthly = summary?.monthly ?? [];
  const bySession = summary?.bySession ?? [];
  const byPair = summary?.byPair ?? [];
  const bySetup = summary?.bySetup ?? [];
  const byRegime = summary?.byRegime ?? [];
  const driftData = drift?.drift ?? [];
  const recommendations = recs?.recommendations ?? [];
  const calData = calibration?.calibration ?? [];

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Continuous Improvement
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Track performance trends and receive advisory recommendations. Strategy rules never change automatically.</p>
        </div>
        <Button onClick={generateReport} variant="outline" size="sm" className="font-mono gap-2">
          <FileText className="w-4 h-4" />Generate Report
        </Button>
      </div>

      {/* Advisory notice */}
      <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-200/80">This dashboard is <strong>advisory only</strong>. It recommends reviews when performance degrades but never changes trading rules automatically. All changes require manual review and application.</p>
      </div>

      {/* Key Metrics Row */}
      {!loadingSummary && summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <p className="text-xs font-mono uppercase text-muted-foreground">Total Trades</p>
              <p className="text-2xl font-bold font-mono mt-1">{summary.overall?.totalTrades ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <p className="text-xs font-mono uppercase text-muted-foreground">Win Rate</p>
              <p className={`text-2xl font-bold font-mono mt-1 ${(summary.overall?.winRate ?? 0) >= 50 ? "text-green-400" : "text-red-400"}`}>{summary.overall?.winRate?.toFixed(1) ?? "0.0"}%</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <p className="text-xs font-mono uppercase text-muted-foreground">Profit Factor</p>
              <p className={`text-2xl font-bold font-mono mt-1 ${(summary.overall?.profitFactor ?? 0) >= 1.5 ? "text-green-400" : (summary.overall?.profitFactor ?? 0) >= 1 ? "text-yellow-400" : "text-red-400"}`}>{summary.overall?.profitFactor?.toFixed(2) ?? "0.00"}</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <p className="text-xs font-mono uppercase text-muted-foreground">Rolling WR (10)</p>
              <p className={`text-2xl font-bold font-mono mt-1 ${(summary.overall?.rollingWinRate10 ?? 0) >= 50 ? "text-green-400" : "text-red-400"}`}>{summary.overall?.rollingWinRate10?.toFixed(1) ?? "0.0"}%</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Drift alerts */}
      {drift?.alerts && drift.alerts.length > 0 && (
        <div className="space-y-2">
          {drift.alerts.map((alert: string, i: number) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-yellow-200/80">{alert}</p>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="monthly">
        <TabsList className="font-mono text-xs uppercase flex-wrap h-auto gap-1">
          <TabsTrigger value="monthly">Monthly P&L</TabsTrigger>
          <TabsTrigger value="breakdown">Win Rate Breakdown</TabsTrigger>
          <TabsTrigger value="drift">Strategy Drift</TabsTrigger>
          <TabsTrigger value="calibration">Confidence</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        {/* Monthly P&L */}
        <TabsContent value="monthly">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase">Monthly P&L (Last 6 Months)</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="h-[280px]">
                  {loadingSummary ? (
                    <div className="w-full h-full animate-pulse bg-muted/20 rounded" />
                  ) : monthly.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No data yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthly}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10, fontFamily: "monospace" }} />
                        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10, fontFamily: "monospace" }} tickFormatter={(v) => `$${v}`} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }} formatter={(v: number) => [formatCurrency(v), "P&L"]} />
                        <ReferenceLine y={0} stroke="hsl(var(--border))" />
                        <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                          {monthly.map((m: Record<string, unknown>, i: number) => (
                            <Cell key={i} fill={Number(m.pnl) >= 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase">Monthly Win Rate</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-3">
                  {loadingSummary ? (
                    <div className="animate-pulse space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-8 bg-muted/20 rounded" />)}</div>
                  ) : monthly.length === 0 ? (
                    <p className="text-sm text-muted-foreground font-mono">No data yet</p>
                  ) : (
                    monthly.map((m: Record<string, unknown>, i: number) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-xs font-mono">
                          <span>{String(m.month)}</span>
                          <span className="text-muted-foreground">{String(m.trades)} trades</span>
                        </div>
                        <WinRateBar value={Number(m.winRate)} />
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Win Rate Breakdown */}
        <TabsContent value="breakdown">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {[
              { title: "By Session", data: bySession, key: "session" },
              { title: "By Pair", data: byPair, key: "pair" },
              { title: "By AMD Pattern", data: bySetup, key: "pattern" },
              { title: "By Regime", data: byRegime, key: "regime" },
            ].map(({ title, data, key }) => (
              <Card key={title} className="border-border bg-card">
                <CardHeader className="pb-2 border-b border-border/10">
                  <CardTitle className="text-sm font-mono uppercase">{title}</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {loadingSummary ? (
                    <div className="animate-pulse space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-muted/20 rounded" />)}</div>
                  ) : data.length === 0 ? (
                    <p className="text-xs text-muted-foreground font-mono">No data</p>
                  ) : (
                    <div className="space-y-3">
                      {data.map((item: Record<string, unknown>, i: number) => (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="font-bold capitalize">{String(item[key] ?? "unknown").replace(/_/g, " ")}</span>
                            <span className="text-muted-foreground">{String(item.trades)}t · {formatCurrency(Number(item.pnl))}</span>
                          </div>
                          <WinRateBar value={Number(item.winRate)} />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Strategy Drift */}
        <TabsContent value="drift">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase">Rolling Win Rate (20-Trade Window)</CardTitle>
                <CardDescription className="text-xs">If win rate trends down significantly, a strategy review is recommended.</CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <div className="h-[280px]">
                  {loadingDrift ? (
                    <div className="w-full h-full animate-pulse bg-muted/20 rounded" />
                  ) : !drift?.hasEnoughData ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">{drift?.message ?? "Need more data"}</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={driftData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="tradeRange" hide />
                        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10, fontFamily: "monospace" }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }} formatter={(v: number) => [`${v.toFixed(1)}%`, "Win Rate"]} />
                        <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "50%", fontSize: 9 }} />
                        <Line type="monotone" dataKey="winRate" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase">Drift Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {loadingDrift ? (
                  <div className="animate-pulse space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-muted/20 rounded" />)}</div>
                ) : !drift?.hasEnoughData ? (
                  <p className="text-sm text-muted-foreground font-mono">{drift?.message ?? "Insufficient data"}</p>
                ) : (
                  <>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Early Win Rate</span><span className="font-mono font-bold">{drift.driftSummary?.earlyWinRate?.toFixed(1) ?? "—"}%</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Recent Win Rate</span><span className="font-mono font-bold">{drift.driftSummary?.recentWinRate?.toFixed(1) ?? "—"}%</span></div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground font-mono">Drift</span>
                      <span className={`font-mono font-bold ${(drift.driftSummary?.driftPct ?? 0) < -10 ? "text-red-400" : "text-muted-foreground"}`}>
                        {(drift.driftSummary?.driftPct ?? 0) > 0 ? "+" : ""}{drift.driftSummary?.driftPct?.toFixed(1) ?? "—"}%
                      </span>
                    </div>
                    <div className={`mt-2 p-3 rounded-lg text-xs font-mono ${drift.driftSummary?.degraded ? "bg-red-500/10 border border-red-500/30 text-red-300" : "bg-green-500/10 border border-green-500/30 text-green-300"}`}>
                      {drift.driftSummary?.degraded
                        ? "⚠️ Performance degradation detected — strategy review recommended."
                        : "✅ No significant drift detected."}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Confidence Calibration */}
        <TabsContent value="calibration">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase">Confidence Calibration</CardTitle>
                <CardDescription className="text-xs">Are you confident when you should be? Higher confidence buckets should have higher win rates.</CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <div className="h-[280px]">
                  {loadingCal ? (
                    <div className="w-full h-full animate-pulse bg-muted/20 rounded" />
                  ) : calData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">Log decisions with outcomes to see calibration</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={calData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="confidenceRange" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10, fontFamily: "monospace" }} />
                        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10, fontFamily: "monospace" }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }} formatter={(v: number) => [`${v?.toFixed(1)}%`]} />
                        <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                        <Bar dataKey="winRate" name="Actual Win Rate" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase">Calibration Detail</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {loadingCal ? (
                  <div className="animate-pulse space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-8 bg-muted/20 rounded" />)}</div>
                ) : calData.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-mono">Log at least 10 decisions with outcomes to see calibration data.</p>
                ) : (
                  <div className="space-y-3">
                    {calData.map((bucket: Record<string, unknown>, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted/10 rounded">
                        <div>
                          <p className="text-xs font-mono font-bold">{String(bucket.confidenceRange)} confidence</p>
                          <p className="text-xs text-muted-foreground">{String(bucket.count)} decisions</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-mono font-bold ${bucket.winRate != null ? (Number(bucket.winRate) >= 50 ? "text-green-400" : "text-red-400") : "text-muted-foreground"}`}>
                            {bucket.winRate != null ? `${Number(bucket.winRate).toFixed(1)}%` : "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">actual WR</p>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground font-mono mt-2">Based on {calibration?.totalDecisions ?? 0} decisions with logged outcomes.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Recommendations */}
        <TabsContent value="recommendations">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 border-b border-border/10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-mono uppercase flex items-center gap-2"><Target className="w-4 h-4" />Advisory Recommendations</CardTitle>
                  <CardDescription className="text-xs mt-1">Generated at {recs?.generatedAt ? new Date(recs.generatedAt).toLocaleString() : "—"}</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["improvement-recs"] })} className="font-mono text-xs">Refresh</Button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {loadingRecs ? (
                <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted/20 rounded" />)}</div>
              ) : recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground font-mono">No recommendations at this time.</p>
              ) : (
                <div className="space-y-3">
                  {recommendations.map((rec: Record<string, unknown>, i: number) => (
                    <div key={i} className={`p-4 rounded-lg border space-y-2 ${
                      rec.priority === "critical" ? "bg-red-500/10 border-red-500/30" :
                      rec.priority === "high" ? "bg-orange-500/10 border-orange-500/30" :
                      rec.priority === "medium" ? "bg-yellow-500/10 border-yellow-500/30" :
                      "bg-green-500/10 border-green-500/30"
                    }`}>
                      <div className="flex items-center justify-between">
                        <PriorityBadge priority={String(rec.priority)} />
                        <span className="text-xs font-mono text-muted-foreground">{String(rec.category)}</span>
                      </div>
                      <p className="text-sm font-medium">{String(rec.message)}</p>
                      <p className="text-xs text-muted-foreground"><strong>Action:</strong> {String(rec.action)}</p>
                    </div>
                  ))}
                  <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-blue-200/80">{recs?.note ?? "Advisory only — strategy rules are never changed automatically."}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
