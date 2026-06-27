import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MetricCard } from "@/components/metric-card";
import { formatCurrency, formatPercent, formatPips } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line, ReferenceLine } from "recharts";
import { Activity, TrendingDown, Zap, Settings2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const API = (path: string) => `/api${path}`;

function usePaperPerformance() {
  return useQuery({ queryKey: ["paper-perf"], queryFn: () => fetch(API("/paper/performance")).then(r => r.json()), refetchInterval: 10000 });
}
function usePaperEquityCurve() {
  return useQuery({ queryKey: ["paper-equity"], queryFn: () => fetch(API("/paper/equity-curve")).then(r => r.json()), refetchInterval: 30000 });
}
function usePaperDrawdown() {
  return useQuery({ queryKey: ["paper-drawdown"], queryFn: () => fetch(API("/paper/drawdown")).then(r => r.json()), refetchInterval: 30000 });
}
function usePaperExecQuality() {
  return useQuery({ queryKey: ["paper-exec-quality"], queryFn: () => fetch(API("/paper/exec-quality")).then(r => r.json()), refetchInterval: 30000 });
}
function usePaperExecConfigs() {
  return useQuery({ queryKey: ["paper-exec-configs"], queryFn: () => fetch(API("/paper/exec-config")).then(r => r.json()) });
}

function QualityScore({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground font-mono">—</span>;
  const color = score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : "text-red-400";
  return <span className={`font-mono font-bold ${color}`}>{score}</span>;
}

function ExecConfigEditor({ pair, config, onSaved }: { pair: string; config: Record<string, number>; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    spreadPips: String(config.spreadPips ?? "1.2"),
    minEntrySlippagePips: String(config.minEntrySlippagePips ?? "0.3"),
    maxEntrySlippagePips: String(config.maxEntrySlippagePips ?? "2.0"),
    minExitSlippagePips: String(config.minExitSlippagePips ?? "0.3"),
    maxExitSlippagePips: String(config.maxExitSlippagePips ?? "1.0"),
    commissionPerLot: String(config.commissionPerLot ?? "3.5"),
  });

  const save = async () => {
    await fetch(API(`/paper/exec-config/${pair}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, parseFloat(v)]))),
    });
    toast({ title: `${pair} config saved` });
    onSaved();
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.entries(form).map(([key, val]) => (
        <div key={key} className="space-y-1">
          <Label className="text-xs font-mono uppercase text-muted-foreground">{key.replace(/([A-Z])/g, " $1")}</Label>
          <Input
            className="font-mono text-sm h-8"
            value={val}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          />
        </div>
      ))}
      <div className="col-span-2">
        <Button size="sm" onClick={save} className="w-full">Save {pair} Config</Button>
      </div>
    </div>
  );
}

export default function PaperTrading() {
  const qc = useQueryClient();
  const { data: perf, isLoading: loadingPerf } = usePaperPerformance();
  const { data: equity, isLoading: loadingEquity } = usePaperEquityCurve();
  const { data: drawdown, isLoading: loadingDD } = usePaperDrawdown();
  const { data: quality, isLoading: loadingQuality } = usePaperExecQuality();
  const { data: configs, isLoading: loadingConfigs } = usePaperExecConfigs();

  const refresh = () => qc.invalidateQueries({ queryKey: ["paper-exec-configs"] });

  const equityCurve = equity?.curve ?? [];
  const drawdownPeriods = drawdown?.periods ?? [];
  const recentQuality = quality?.recent ?? [];
  const configList = configs?.configs ?? [];

  const avgQuality = quality?.summary?.avgQualityScore ?? null;
  const qualityColor = avgQuality != null && avgQuality >= 80 ? "text-green-400" : avgQuality != null && avgQuality >= 60 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Paper Trading Lab
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Realistic simulation with configurable spread, slippage, and execution quality tracking.</p>
        </div>
        {perf && (
          <Badge variant={perf.winRate >= 50 ? "default" : "destructive"} className="text-sm font-mono px-3 py-1">
            {perf.winRate.toFixed(1)}% Win Rate
          </Badge>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <MetricCard title="Balance" value={loadingPerf ? "…" : formatCurrency(perf?.balance)} />
        <MetricCard title="Total P&L" value={loadingPerf ? "…" : formatCurrency(perf?.totalPnl)} />
        <MetricCard title="Win Rate" value={loadingPerf ? "…" : `${perf?.winRate?.toFixed(1) ?? 0}%`} />
        <MetricCard title="Profit Factor" value={loadingPerf ? "…" : perf?.profitFactor?.toFixed(2) ?? "0.00"} />
        <MetricCard title="Max Drawdown" value={loadingDD ? "…" : `${drawdown?.maxDrawdownPct?.toFixed(2) ?? 0}%`} />
        <MetricCard title="Exec Quality" value={loadingQuality ? "…" : avgQuality != null ? `${avgQuality.toFixed(0)}/100` : "—"} />
      </div>

      <Tabs defaultValue="equity">
        <TabsList className="font-mono text-xs uppercase">
          <TabsTrigger value="equity">Equity Curve</TabsTrigger>
          <TabsTrigger value="drawdown">Drawdown</TabsTrigger>
          <TabsTrigger value="exec-quality">Exec Quality</TabsTrigger>
          <TabsTrigger value="config">Execution Config</TabsTrigger>
        </TabsList>

        {/* Equity Curve */}
        <TabsContent value="equity">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase tracking-wide">Equity Curve</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="h-[300px]">
                  {loadingEquity ? (
                    <div className="w-full h-full animate-pulse bg-muted/20 rounded" />
                  ) : equityCurve.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No closed trades yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={equityCurve}>
                        <defs>
                          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="closedAt" tickFormatter={(v) => v?.slice(5, 10) ?? ""} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
                        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                          formatter={(v: number) => [formatCurrency(v), "Balance"]}
                        />
                        <ReferenceLine y={equity?.initialBalance} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                        <Area type="monotone" dataKey="balance" stroke="hsl(var(--primary))" fill="url(#eqGrad)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase tracking-wide">Slippage Stats</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {loadingPerf ? (
                  <div className="animate-pulse space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-8 bg-muted/20 rounded" />)}</div>
                ) : (
                  <>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Total Trades</span><span className="font-mono font-bold">{perf?.totalTrades ?? 0}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Avg Win</span><span className="font-mono font-bold text-green-400">{formatCurrency(perf?.avgWin)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Avg Loss</span><span className="font-mono font-bold text-red-400">{formatCurrency(perf?.avgLoss)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Avg Entry Slip</span><span className="font-mono">{formatPips(perf?.avgSlippagePips)} pips</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Unrealized P&L</span><span className={`font-mono font-bold ${(perf?.unrealizedPnl ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(perf?.unrealizedPnl)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Daily P&L</span><span className={`font-mono font-bold ${(perf?.dailyPnl ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(perf?.dailyPnl)}</span></div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Drawdown */}
        <TabsContent value="drawdown">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase tracking-wide flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  Drawdown Over Time
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="h-[300px]">
                  {loadingEquity ? (
                    <div className="w-full h-full animate-pulse bg-muted/20 rounded" />
                  ) : equityCurve.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={equityCurve}>
                        <defs>
                          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="closedAt" tickFormatter={(v) => v?.slice(5, 10) ?? ""} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
                        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }} formatter={(v: number) => [`${v.toFixed(2)}%`, "Drawdown"]} />
                        <Area type="monotone" dataKey="drawdownPct" stroke="hsl(var(--destructive))" fill="url(#ddGrad)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase tracking-wide">Drawdown Stats</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {loadingDD ? (
                  <div className="animate-pulse space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-muted/20 rounded" />)}</div>
                ) : (
                  <>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Max Drawdown</span><span className="font-mono font-bold text-red-400">{drawdown?.maxDrawdownPct?.toFixed(2) ?? "0.00"}%</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Current DD</span><span className="font-mono font-bold">{drawdown?.currentDrawdownPct?.toFixed(2) ?? "0.00"}%</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Current Balance</span><span className="font-mono">{formatCurrency(drawdown?.currentBalance)}</span></div>
                    {drawdownPeriods.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-mono uppercase text-muted-foreground">Recent DD Periods</p>
                        {drawdownPeriods.slice(0, 3).map((p: Record<string, number>, i: number) => (
                          <div key={i} className="text-xs font-mono flex justify-between bg-muted/10 px-2 py-1 rounded">
                            <span>{p.durationTrades} trades</span>
                            <span className="text-red-400">{p.drawdownPct?.toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Execution Quality */}
        <TabsContent value="exec-quality">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase tracking-wide flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  Execution Quality Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {loadingQuality ? (
                  <div className="animate-pulse space-y-2">{[1,2,3,4,5,6].map(i => <div key={i} className="h-7 bg-muted/20 rounded" />)}</div>
                ) : quality?.summary ? (
                  <>
                    <div className="flex justify-between text-sm border-b border-border/20 pb-2">
                      <span className="text-muted-foreground font-mono">Avg Quality Score</span>
                      <QualityScore score={quality.summary.avgQualityScore} />
                    </div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Avg Signal→Fill</span><span className="font-mono">{quality.summary.avgSignalToFillMs?.toFixed(0) ?? "—"}ms</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">P95 Signal→Fill</span><span className="font-mono">{quality.summary.p95SignalToFillMs?.toFixed(0) ?? "—"}ms</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Avg Entry Slippage</span><span className="font-mono">{quality.summary.avgEntrySlippagePips?.toFixed(1) ?? "—"} pips</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">P95 Entry Slippage</span><span className="font-mono">{quality.summary.p95EntrySlippagePips?.toFixed(1) ?? "—"} pips</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Avg Exit Slippage</span><span className="font-mono">{quality.summary.avgExitSlippagePips?.toFixed(1) ?? "—"} pips</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Avg Spread</span><span className="font-mono">{quality.summary.avgSpreadPips?.toFixed(1) ?? "—"} pips</span></div>
                    <div className="flex justify-between text-sm border-t border-border/20 pt-2"><span className="text-muted-foreground font-mono">Total Exec Logs</span><span className="font-mono font-bold">{quality.summary.totalLogs}</span></div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground font-mono">No execution quality data yet. Data is populated as paper trades execute.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase tracking-wide">Recent Executions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loadingQuality ? (
                  <div className="animate-pulse p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-muted/20 rounded" />)}</div>
                ) : recentQuality.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground font-mono">No executions logged yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead className="bg-muted/20 border-b border-border">
                        <tr>
                          <th className="text-left p-2 text-muted-foreground">Pair</th>
                          <th className="text-left p-2 text-muted-foreground">Dir</th>
                          <th className="text-right p-2 text-muted-foreground">Entry Slip</th>
                          <th className="text-right p-2 text-muted-foreground">Exit Slip</th>
                          <th className="text-right p-2 text-muted-foreground">Quality</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentQuality.slice(0, 8).map((r: Record<string, unknown>, i: number) => (
                          <tr key={i} className="border-b border-border/20 hover:bg-muted/10">
                            <td className="p-2 font-bold">{String(r.pair)}</td>
                            <td className="p-2"><Badge variant={r.direction === "buy" ? "default" : "secondary"} className="text-[10px] px-1">{String(r.direction)}</Badge></td>
                            <td className="p-2 text-right">{r.entrySlippagePips != null ? `${Number(r.entrySlippagePips).toFixed(1)}p` : "—"}</td>
                            <td className="p-2 text-right">{r.exitSlippagePips != null ? `${Number(r.exitSlippagePips).toFixed(1)}p` : "—"}</td>
                            <td className="p-2 text-right"><QualityScore score={r.qualityScore as number | null} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Execution Config */}
        <TabsContent value="config">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {loadingConfigs ? (
              [1,2,3].map(i => <Card key={i} className="border-border bg-card"><CardContent className="p-4 animate-pulse h-48 bg-muted/20 rounded" /></Card>)
            ) : configList.length === 0 ? (
              <p className="col-span-3 text-sm text-muted-foreground font-mono">No configs found.</p>
            ) : (
              configList.map((cfg: Record<string, unknown>) => (
                <Card key={String(cfg.pair)} className="border-border bg-card">
                  <CardHeader className="pb-2 border-b border-border/10">
                    <CardTitle className="text-sm font-mono uppercase tracking-wide flex items-center gap-2">
                      <Settings2 className="w-4 h-4" />
                      {String(cfg.pair)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <ExecConfigEditor pair={String(cfg.pair)} config={cfg as Record<string, number>} onSaved={refresh} />
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
