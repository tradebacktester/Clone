import { useGetTradeComparison, useGetRuleAdherence } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, ShieldCheck, ShieldAlert, CheckCircle2, XCircle, Minus, AlertCircle } from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/format";

const WIN_COLOR  = "hsl(142, 76%, 36%)";
const LOSS_COLOR = "hsl(0, 84%, 60%)";
const DIM_COLOR  = "hsl(217, 91%, 60%)";

function StatDelta({ winner, loser, label, suffix = "", higherIsBetter = true }: {
  winner?: number; loser?: number; label: string; suffix?: string; higherIsBetter?: boolean;
}) {
  if (winner == null || loser == null) return null;
  const delta = winner - loser;
  const positive = higherIsBetter ? delta > 0 : delta < 0;
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground font-mono">{label}</span>
      <div className="flex items-center gap-6 font-mono text-sm">
        <span className="text-success w-16 text-right">{winner.toFixed(1)}{suffix}</span>
        <span className="text-destructive w-16 text-right">{loser.toFixed(1)}{suffix}</span>
        <span className={`w-16 text-right text-xs ${positive ? "text-success" : "text-destructive"}`}>
          {delta > 0 ? "+" : ""}{delta.toFixed(1)}{suffix}
        </span>
      </div>
    </div>
  );
}

function WinRateBar({ wins, losses, label }: { wins: number; losses: number; label: string }) {
  const total = wins + losses;
  if (total === 0) return null;
  const pct = Math.round((wins / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-muted-foreground">{label}</span>
        <span className={pct >= 50 ? "text-success" : "text-destructive"}>{pct}% ({total})</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden flex">
        <div className="h-full rounded-l-full bg-success transition-all" style={{ width: `${pct}%` }} />
        <div className="h-full flex-1 bg-destructive/40" />
      </div>
    </div>
  );
}

function ImpactBadge({ impact }: { impact: number }) {
  if (Math.abs(impact) < 1) return <Badge variant="outline" className="text-xs text-muted-foreground">Neutral</Badge>;
  if (impact > 0) return <Badge variant="outline" className="text-xs text-success border-success/30 bg-success/10">+{impact.toFixed(1)}%</Badge>;
  return <Badge variant="outline" className="text-xs text-destructive border-destructive/30 bg-destructive/10">{impact.toFixed(1)}%</Badge>;
}

// ─── Trade Comparison Tab ──────────────────────────────────────────────────

function TradeComparisonTab() {
  const { data, isLoading } = useGetTradeComparison({ query: { refetchInterval: 30000 } });

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;

  if (!data || data.totalTrades === 0) {
    return (
      <div className="p-12 text-center text-muted-foreground font-mono text-sm">
        <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-40" />
        No closed trades yet — run the bot to generate comparison data.
      </div>
    );
  }

  const breakdowns = [
    { title: "By AMD Pattern", data: data.byAmdPattern },
    { title: "By Session",     data: data.bySession },
    { title: "By Zone Type",   data: data.byZoneType },
    { title: "By Regime",      data: data.byRegime },
    { title: "Liquidity Sweep", data: data.byLiquiditySweep },
  ];

  const radarData = data.winners && data.losers ? [
    { dim: "Setup Score",  winners: data.winners.avgSetupScore,       losers: data.losers.avgSetupScore },
    { dim: "Zone Strength",winners: data.winners.avgZoneStrength,     losers: data.losers.avgZoneStrength },
    { dim: "R:R Ratio",    winners: (data.winners.avgRr ?? 0) * 30,   losers: (data.losers.avgRr ?? 0) * 30 },
    { dim: "Sweep Rate",   winners: data.winners.liquiditySweepRate ?? 0, losers: data.losers.liquiditySweepRate ?? 0 },
    { dim: "Regime Conf",  winners: data.winners.avgRegimeConfidence ?? 0, losers: data.losers.avgRegimeConfidence ?? 0 },
  ] : [];

  return (
    <div className="space-y-6 p-1">
      {/* Header metrics */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-muted/10 border-border text-center p-4">
          <div className="text-xs font-mono uppercase text-muted-foreground">Total Trades</div>
          <div className="text-2xl font-mono font-bold mt-1">{data.totalTrades}</div>
        </Card>
        <Card className="bg-muted/10 border-border text-center p-4">
          <div className="text-xs font-mono uppercase text-muted-foreground">Overall Win Rate</div>
          <div className={`text-2xl font-mono font-bold mt-1 ${data.winRate >= 50 ? "text-success" : "text-destructive"}`}>{data.winRate.toFixed(1)}%</div>
        </Card>
        <Card className="bg-muted/10 border-border text-center p-4">
          <div className="text-xs font-mono uppercase text-muted-foreground">Winners / Losers</div>
          <div className="text-2xl font-mono font-bold mt-1">
            <span className="text-success">{data.winners?.count ?? 0}</span>
            <span className="text-muted-foreground mx-1">/</span>
            <span className="text-destructive">{data.losers?.count ?? 0}</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar: winner vs loser profile */}
        {radarData.length > 0 && (
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono uppercase">Winner vs Loser DNA</CardTitle>
              <CardDescription className="text-xs">Normalised to 100-point scale</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="dim" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "monospace" }} />
                  <Radar name="Winners" dataKey="winners" stroke={WIN_COLOR} fill={WIN_COLOR} fillOpacity={0.2} />
                  <Radar name="Losers"  dataKey="losers"  stroke={LOSS_COLOR} fill={LOSS_COLOR} fillOpacity={0.15} />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace" }} />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Side-by-side stat deltas */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono uppercase">Profile Comparison</CardTitle>
            <div className="flex items-center gap-4 mt-1 text-xs font-mono">
              <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-success" /> Winners</span>
              <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3 text-destructive" /> Losers</span>
              <span className="flex items-center gap-1 text-muted-foreground">Δ Delta</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <StatDelta winner={data.winners?.avgSetupScore}   loser={data.losers?.avgSetupScore}   label="Avg Setup Score"    suffix="" />
            <StatDelta winner={data.winners?.avgZoneStrength} loser={data.losers?.avgZoneStrength} label="Avg Zone Strength"  suffix="" />
            <StatDelta winner={data.winners?.avgRr}           loser={data.losers?.avgRr}           label="Avg R:R Ratio"      suffix="R" />
            <StatDelta winner={data.winners?.avgPnl}          loser={data.losers?.avgPnl}          label="Avg P&L"            suffix="" />
            <StatDelta winner={data.winners?.liquiditySweepRate} loser={data.losers?.liquiditySweepRate} label="Liq. Sweep Rate" suffix="%" />
            <StatDelta winner={data.winners?.avgRegimeConfidence} loser={data.losers?.avgRegimeConfidence} label="Regime Confidence" suffix="%" />
            <StatDelta winner={data.winners?.avgSlippage} loser={data.losers?.avgSlippage} label="Avg Slippage" suffix="p" higherIsBetter={false} />
          </CardContent>
        </Card>
      </div>

      {/* Score & RR distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono uppercase">Win Rate by Setup Score</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.setupScoreDistribution} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "monospace" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "monospace" }} domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontFamily: "monospace", fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, "Win Rate"]}
                />
                <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                  {data.setupScoreDistribution.map((item, i) => (
                    <Cell key={i} fill={item.winRate >= 50 ? WIN_COLOR : LOSS_COLOR} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono uppercase">Win Rate by R:R Ratio</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.rrDistribution} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "monospace" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "monospace" }} domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontFamily: "monospace", fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, "Win Rate"]}
                />
                <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                  {data.rrDistribution.map((item, i) => (
                    <Cell key={i} fill={item.winRate >= 50 ? WIN_COLOR : LOSS_COLOR} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {breakdowns.map(({ title, data: bData }) => (
          <Card key={title} className="border-border">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs font-mono uppercase text-muted-foreground">{title}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {bData.length === 0 ? (
                <p className="text-xs text-muted-foreground font-mono">No data</p>
              ) : bData.map(item => (
                <WinRateBar key={item.label} label={`${item.label} (${item.count})`} wins={item.wins} losses={item.losses} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Rule Adherence Tab ────────────────────────────────────────────────────

function RuleAdherenceTab() {
  const { data, isLoading } = useGetRuleAdherence({ query: { refetchInterval: 30000 } });

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;

  if (!data) return null;

  const { summary, rules, perTrade } = data;

  return (
    <div className="space-y-6 p-1">
      {/* Summary banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-muted/10 border-border p-4 text-center">
          <div className="text-xs font-mono uppercase text-muted-foreground">Avg Adherence</div>
          <div className={`text-2xl font-mono font-bold mt-1 ${summary.avgAdherenceScore >= 70 ? "text-success" : summary.avgAdherenceScore >= 50 ? "text-warning" : "text-destructive"}`}>
            {summary.avgAdherenceScore.toFixed(0)}%
          </div>
        </Card>
        <Card className="bg-muted/10 border-border p-4 text-center">
          <div className="text-xs font-mono uppercase text-muted-foreground">High Adherence WR</div>
          <div className={`text-2xl font-mono font-bold mt-1 ${summary.perfectAdherenceWinRate >= 50 ? "text-success" : "text-destructive"}`}>
            {summary.perfectAdherenceWinRate.toFixed(1)}%
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">≥80% rules</div>
        </Card>
        <Card className="bg-muted/10 border-border p-4 text-center">
          <div className="text-xs font-mono uppercase text-muted-foreground">Low Adherence WR</div>
          <div className={`text-2xl font-mono font-bold mt-1 ${summary.lowAdherenceWinRate >= 50 ? "text-success" : "text-destructive"}`}>
            {summary.lowAdherenceWinRate.toFixed(1)}%
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">&lt;50% rules</div>
        </Card>
        <Card className="bg-muted/10 border-border p-4 text-center">
          <div className="text-xs font-mono uppercase text-muted-foreground">Most Broken Rule</div>
          <div className="text-sm font-mono font-bold mt-1 text-warning leading-tight">{summary.topBrokenRule}</div>
        </Card>
      </div>

      {/* Rule cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-mono uppercase text-muted-foreground tracking-wide flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5" /> Rule Impact on Win Rate
        </h3>
        {rules.map(rule => (
          <Card key={rule.id} className="border-border">
            <CardContent className="py-3 px-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-sm">{rule.name}</span>
                    <ImpactBadge impact={rule.impact} />
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{rule.description}</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                      <span>Rule adherence</span>
                      <span>{rule.followedCount}/{rule.followedCount + rule.brokenCount} trades ({rule.adherenceRate.toFixed(0)}%)</span>
                    </div>
                    <Progress value={rule.adherenceRate} className="h-1.5" />
                  </div>
                </div>
                <div className="flex-shrink-0 text-right font-mono text-sm space-y-1">
                  <div className="flex items-center gap-2 justify-end">
                    <CheckCircle2 className="w-3 h-3 text-success" />
                    <span className="text-success">{rule.winRateWithRule.toFixed(1)}%</span>
                    <span className="text-[10px] text-muted-foreground">WR ✓</span>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <XCircle className="w-3 h-3 text-destructive" />
                    <span className="text-destructive">{rule.winRateWithoutRule.toFixed(1)}%</span>
                    <span className="text-[10px] text-muted-foreground">WR ✗</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-trade adherence log */}
      <Card className="border-border">
        <CardHeader className="border-b border-border bg-muted/10 py-3">
          <CardTitle className="text-sm font-mono uppercase flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-warning" /> Per-Trade Rule Adherence (last 50)
          </CardTitle>
        </CardHeader>
        <ScrollArea className="h-[360px]">
          <div className="divide-y divide-border">
            {perTrade.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground font-mono text-sm">No trades yet</div>
            ) : perTrade.map(t => {
              const scoreColor = t.adherenceScore >= 80 ? "text-success" : t.adherenceScore >= 57 ? "text-warning" : "text-destructive";
              return (
                <div key={t.tradeId} className="px-4 py-3 flex items-center gap-4 hover:bg-muted/10 transition-colors">
                  {/* Outcome */}
                  <div className="w-8 flex-shrink-0 text-center">
                    {t.outcome === "win"  && <TrendingUp   className="w-4 h-4 text-success mx-auto" />}
                    {t.outcome === "loss" && <TrendingDown  className="w-4 h-4 text-destructive mx-auto" />}
                    {t.outcome === "open" && <Minus         className="w-4 h-4 text-muted-foreground mx-auto" />}
                  </div>

                  {/* Pair + direction */}
                  <div className="w-28 flex-shrink-0">
                    <div className="font-mono font-semibold text-sm">{t.pair}</div>
                    <div className={`text-xs font-mono ${t.direction === "buy" ? "text-success" : "text-destructive"}`}>
                      {t.direction.toUpperCase()}
                    </div>
                  </div>

                  {/* Adherence score bar */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-mono font-bold ${scoreColor}`}>{t.adherenceScore}%</span>
                      <span className="text-xs font-mono text-muted-foreground">{t.rulesFollowed}/{t.rulesFollowed + t.rulesBroken} rules</span>
                    </div>
                    <Progress value={t.adherenceScore} className="h-1.5" />
                    {t.brokenRules.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {t.brokenRules.map(r => (
                          <span key={r} className="text-[10px] font-mono bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">✗ {r.replace(/_/g, " ")}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* P&L */}
                  <div className="w-20 text-right font-mono text-sm flex-shrink-0">
                    {t.outcome === "open" ? (
                      <span className="text-muted-foreground text-xs">open</span>
                    ) : (
                      <span className={t.pnl >= 0 ? "text-success" : "text-destructive"}>
                        {t.pnl >= 0 ? "+" : ""}{formatCurrency(t.pnl)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function Quality() {
  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold font-mono uppercase tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          Trade Quality
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Winner vs loser DNA comparison and AMD/SMC rule adherence scoring.
        </p>
      </div>

      <Tabs defaultValue="comparison" className="w-full">
        <TabsList className="font-mono text-xs uppercase">
          <TabsTrigger value="comparison">Winner vs Loser</TabsTrigger>
          <TabsTrigger value="adherence">Rule Adherence</TabsTrigger>
        </TabsList>
        <TabsContent value="comparison" className="mt-4"><TradeComparisonTab /></TabsContent>
        <TabsContent value="adherence" className="mt-4"><RuleAdherenceTab /></TabsContent>
      </Tabs>
    </div>
  );
}
