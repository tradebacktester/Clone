import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell } from "recharts";
import { FlaskConical, TrendingUp, ArrowUpRight, ArrowDownRight, Minus, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatPercent } from "@/lib/format";

const API = (path: string) => `/api${path}`;

function useThresholdLatest() {
  return useQuery({ queryKey: ["threshold-latest"], queryFn: () => fetch(API("/threshold/latest")).then(r => r.json()) });
}
function useThresholdHistory() {
  return useQuery({ queryKey: ["threshold-history"], queryFn: () => fetch(API("/threshold/history")).then(r => r.json()) });
}

function DeltaBadge({ current, proposed }: { current: number | null; proposed: number | null }) {
  if (current == null || proposed == null) return <Badge variant="secondary" className="text-xs font-mono">—</Badge>;
  const delta = proposed - current;
  if (Math.abs(delta) < 0.1) return <Badge variant="secondary" className="text-xs font-mono flex items-center gap-1"><Minus className="w-3 h-3" /> No change</Badge>;
  return delta > 0
    ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs font-mono flex items-center gap-1"><ArrowUpRight className="w-3 h-3" /> +{delta.toFixed(1)}</Badge>
    : <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs font-mono flex items-center gap-1"><ArrowDownRight className="w-3 h-3" /> {delta.toFixed(1)}</Badge>;
}

function ThresholdRow({ name, label, current, proposed }: { name: string; label: string; current: number | null; proposed: number | null }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/20 last:border-0">
      <div>
        <p className="text-sm font-mono font-medium">{label}</p>
        <p className="text-xs text-muted-foreground font-mono">Current: {current?.toFixed(0) ?? "—"} → Proposed: {proposed?.toFixed(0) ?? "—"}</p>
      </div>
      <DeltaBadge current={current} proposed={proposed} />
    </div>
  );
}

function PerThresholdChart({ data, currentValue, proposedValue }: { data: Array<{ value: number; winRate: number; tradeCount: number }>; currentValue: number; proposedValue: number }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="value" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 9, fontFamily: "monospace" }} />
        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 9, fontFamily: "monospace" }} tickFormatter={(v) => `${v}%`} />
        <Tooltip
          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }}
          formatter={(v: number, name: string) => [name === "winRate" ? `${v.toFixed(1)}%` : v, name === "winRate" ? "Win Rate" : "Trades"]}
        />
        <ReferenceLine x={currentValue} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "current", fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
        <ReferenceLine x={proposedValue} stroke="hsl(var(--primary))" strokeDasharray="4 4" label={{ value: "optimal", fontSize: 8, fill: "hsl(var(--primary))" }} />
        <Line type="monotone" dataKey="winRate" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function ThresholdOptimization() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const { data: latest, isLoading: loadingLatest } = useThresholdLatest();
  const { data: history, isLoading: loadingHistory } = useThresholdHistory();

  const runAnalysis = async () => {
    setRunning(true);
    try {
      const res = await fetch(API("/threshold/analyze"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ windowSize: 100, folds: 5 }) });
      if (res.ok) {
        toast({ title: "Threshold analysis complete" });
        qc.invalidateQueries({ queryKey: ["threshold-latest"] });
        qc.invalidateQueries({ queryKey: ["threshold-history"] });
      } else {
        toast({ title: "Analysis failed", variant: "destructive" });
      }
    } finally {
      setRunning(false);
    }
  };

  const hasResult = latest?.hasResult;
  const perThreshold = hasResult ? (latest?.perThresholdAnalysis ?? {}) : {};
  const thresholdNames: Array<[string, string]> = [
    ["setupScore", "Setup Score (min confidence)"],
    ["zoneStrength", "Zone Strength"],
    ["tqi", "TQI (Trade Quality Index)"],
    ["mtfScore", "MTF Alignment Score"],
  ];

  const wfFolds: Array<{ foldIndex: number; baselineWinRate: number; proposedWinRate: number; outperforms: boolean }> = hasResult ? (latest?.wfFolds ?? []) : [];
  const historyRuns = history?.runs ?? [];

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-primary" />
            Threshold Optimization
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Find optimal entry thresholds from real paper trading data using walk-forward validation.</p>
        </div>
        <Button onClick={runAnalysis} disabled={running} className="font-mono gap-2">
          <FlaskConical className="w-4 h-4" />
          {running ? "Analyzing…" : "Run Analysis"}
        </Button>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-yellow-200/80">
          <strong>Advisory only.</strong> All threshold changes must be reviewed and manually applied. The system never modifies strategy rules automatically. Walk-forward validation must pass (≥60% of folds) before any change is recommended.
        </p>
      </div>

      {!hasResult && !loadingLatest && (
        <Card className="border-border bg-card">
          <CardContent className="p-12 text-center">
            <FlaskConical className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-mono font-bold">No Analysis Run Yet</p>
            <p className="text-muted-foreground text-sm mt-2">Run a threshold analysis to get recommendations. You need at least 20 closed paper trades for meaningful results.</p>
          </CardContent>
        </Card>
      )}

      {hasResult && (
        <>
          {/* Summary Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <p className="text-xs font-mono uppercase text-muted-foreground">Trades Analyzed</p>
                <p className="text-2xl font-bold font-mono mt-1">{latest.tradesAnalyzed}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <p className="text-xs font-mono uppercase text-muted-foreground">WF Pass Rate</p>
                <p className={`text-2xl font-bold font-mono mt-1 ${(latest.wfPassRate ?? 0) >= 60 ? "text-green-400" : "text-red-400"}`}>{latest.wfPassRate?.toFixed(0) ?? "—"}%</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <p className="text-xs font-mono uppercase text-muted-foreground">WF Consistent</p>
                <div className="flex items-center gap-2 mt-1">
                  {latest.wfConsistent
                    ? <><CheckCircle2 className="w-5 h-5 text-green-400" /><span className="text-green-400 font-mono font-bold text-sm">Yes</span></>
                    : <><AlertTriangle className="w-5 h-5 text-red-400" /><span className="text-red-400 font-mono font-bold text-sm">No</span></>
                  }
                </div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <p className="text-xs font-mono uppercase text-muted-foreground">Run At</p>
                <p className="text-sm font-mono mt-1">{latest.runAt ? new Date(latest.runAt).toLocaleString() : "—"}</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="thresholds">
            <TabsList className="font-mono text-xs uppercase">
              <TabsTrigger value="thresholds">Threshold Curves</TabsTrigger>
              <TabsTrigger value="comparison">Current vs Proposed</TabsTrigger>
              <TabsTrigger value="walkforward">Walk-Forward</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            {/* Threshold Curves */}
            <TabsContent value="thresholds">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {thresholdNames.map(([key, label]) => {
                  const t = perThreshold[key];
                  if (!t) return null;
                  return (
                    <Card key={key} className="border-border bg-card">
                      <CardHeader className="pb-2 border-b border-border/10">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-mono uppercase">{label}</CardTitle>
                          <DeltaBadge current={t.current} proposed={t.proposed} />
                        </div>
                        <CardDescription className="text-xs font-mono">
                          WR: {t.baselineWinRate?.toFixed(1)}% → {t.proposedWinRate?.toFixed(1)}% | PF: {t.baselinePF?.toFixed(2)} → {t.proposedPF?.toFixed(2)}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4">
                        <PerThresholdChart data={t.curve ?? []} currentValue={t.current} proposedValue={t.proposed} />
                        {t.improvementPct != null && Math.abs(t.improvementPct) >= 1 && (
                          <p className={`text-xs font-mono mt-2 ${t.improvementPct > 0 ? "text-green-400" : "text-red-400"}`}>
                            {t.improvementPct > 0 ? "+" : ""}{t.improvementPct.toFixed(1)}% expected win rate change
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            {/* Current vs Proposed */}
            <TabsContent value="comparison">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-border bg-card">
                  <CardHeader className="pb-2 border-b border-border/10">
                    <CardTitle className="text-sm font-mono uppercase">Threshold Changes</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {thresholdNames.map(([key, label]) => {
                      const t = perThreshold[key];
                      return <ThresholdRow key={key} name={key} label={label} current={t?.current ?? null} proposed={t?.proposed ?? null} />;
                    })}
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardHeader className="pb-2 border-b border-border/10">
                    <CardTitle className="text-sm font-mono uppercase">Performance Comparison</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                      <div />
                      <div className="text-center text-muted-foreground font-bold">Current</div>
                      <div className="text-center text-primary font-bold">Proposed</div>
                      <div className="text-muted-foreground">Win Rate</div>
                      <div className="text-center font-bold">{latest.baselineWinRate?.toFixed(1) ?? "—"}%</div>
                      <div className={`text-center font-bold ${(latest.proposedWinRate ?? 0) > (latest.baselineWinRate ?? 0) ? "text-green-400" : "text-red-400"}`}>{latest.proposedWinRate?.toFixed(1) ?? "—"}%</div>
                      <div className="text-muted-foreground">Profit Factor</div>
                      <div className="text-center font-bold">{latest.baselineProfitFactor?.toFixed(2) ?? "—"}</div>
                      <div className={`text-center font-bold ${(latest.proposedProfitFactor ?? 0) > (latest.baselineProfitFactor ?? 0) ? "text-green-400" : "text-red-400"}`}>{latest.proposedProfitFactor?.toFixed(2) ?? "—"}</div>
                      <div className="text-muted-foreground">Expected Value</div>
                      <div className="text-center font-bold">${latest.baselineExpectedValue?.toFixed(2) ?? "—"}</div>
                      <div className={`text-center font-bold ${(latest.proposedExpectedValue ?? 0) > (latest.baselineExpectedValue ?? 0) ? "text-green-400" : "text-red-400"}`}>${latest.proposedExpectedValue?.toFixed(2) ?? "—"}</div>
                      <div className="text-muted-foreground">Trade Count Δ</div>
                      <div className="text-center font-bold">—</div>
                      <div className={`text-center font-bold ${(latest.tradeCountDelta ?? 0) >= 0 ? "text-muted-foreground" : "text-yellow-400"}`}>{latest.tradeCountDelta ?? "—"}</div>
                    </div>
                    <div className={`mt-4 p-3 rounded-lg text-xs font-mono ${latest.wfConsistent ? "bg-green-500/10 border border-green-500/30 text-green-300" : "bg-red-500/10 border border-red-500/30 text-red-300"}`}>
                      {latest.wfConsistent
                        ? "✅ Walk-forward validation PASSED — proposed thresholds are consistent across test periods."
                        : "⚠️ Walk-forward validation did NOT pass — threshold changes are NOT recommended yet. Collect more data."}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Walk-Forward Results */}
            <TabsContent value="walkforward">
              <Card className="border-border bg-card">
                <CardHeader className="pb-2 border-b border-border/10">
                  <CardTitle className="text-sm font-mono uppercase">Walk-Forward Fold Results</CardTitle>
                  <CardDescription className="text-xs">Each fold tests whether proposed thresholds outperform the baseline on unseen data. Need ≥60% pass rate.</CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                  {wfFolds.length === 0 ? (
                    <p className="text-sm text-muted-foreground font-mono">Not enough data for walk-forward validation (need ≥40 trades).</p>
                  ) : (
                    <div className="space-y-3">
                      {wfFolds.map((fold) => (
                        <div key={fold.foldIndex} className={`flex items-center justify-between p-3 rounded-lg border ${fold.outperforms ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}>
                          <div className="font-mono text-sm">
                            <span className="text-muted-foreground text-xs">Fold {fold.foldIndex + 1}</span>
                            <p>Baseline WR: <strong>{fold.baselineWinRate?.toFixed(1)}%</strong> → Proposed WR: <strong>{fold.proposedWinRate?.toFixed(1)}%</strong></p>
                          </div>
                          {fold.outperforms
                            ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30 font-mono"><CheckCircle2 className="w-3 h-3 mr-1" />Pass</Badge>
                            : <Badge className="bg-red-500/20 text-red-400 border-red-500/30 font-mono"><AlertTriangle className="w-3 h-3 mr-1" />Fail</Badge>
                          }
                        </div>
                      ))}
                      <div className="mt-2 p-3 bg-muted/10 rounded-lg font-mono text-sm">
                        Pass Rate: <strong className={latest.wfPassRate >= 60 ? "text-green-400" : "text-red-400"}>{latest.wfPassRate?.toFixed(0)}%</strong>
                        <span className="text-muted-foreground ml-2">({wfFolds.filter(f => f.outperforms).length}/{wfFolds.length} folds)</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* History */}
            <TabsContent value="history">
              <Card className="border-border bg-card">
                <CardHeader className="pb-2 border-b border-border/10">
                  <CardTitle className="text-sm font-mono uppercase flex items-center gap-2"><Clock className="w-4 h-4" />Past Runs</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {historyRuns.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground font-mono text-center">No analysis runs yet.</p>
                  ) : (
                    <table className="w-full text-xs font-mono">
                      <thead className="bg-muted/20 border-b border-border">
                        <tr>
                          <th className="text-left p-3 text-muted-foreground">Date</th>
                          <th className="text-right p-3 text-muted-foreground">Trades</th>
                          <th className="text-right p-3 text-muted-foreground">Baseline WR</th>
                          <th className="text-right p-3 text-muted-foreground">Proposed WR</th>
                          <th className="text-right p-3 text-muted-foreground">WF Pass</th>
                          <th className="text-center p-3 text-muted-foreground">Consistent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyRuns.map((r: Record<string, unknown>, i: number) => (
                          <tr key={i} className="border-b border-border/20 hover:bg-muted/10">
                            <td className="p-3">{typeof r.runAt === "string" ? r.runAt.slice(0, 16).replace("T", " ") : "?"}</td>
                            <td className="p-3 text-right">{String(r.tradesAnalyzed)}</td>
                            <td className="p-3 text-right">{r.baselineWinRate != null ? `${Number(r.baselineWinRate).toFixed(1)}%` : "—"}</td>
                            <td className={`p-3 text-right font-bold ${Number(r.proposedWinRate) > Number(r.baselineWinRate) ? "text-green-400" : "text-red-400"}`}>{r.proposedWinRate != null ? `${Number(r.proposedWinRate).toFixed(1)}%` : "—"}</td>
                            <td className={`p-3 text-right font-bold ${Number(r.wfPassRate) >= 60 ? "text-green-400" : "text-red-400"}`}>{r.wfPassRate != null ? `${Number(r.wfPassRate).toFixed(0)}%` : "—"}</td>
                            <td className="p-3 text-center">{r.wfConsistent ? <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" /> : <AlertTriangle className="w-4 h-4 text-red-400 mx-auto" />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
