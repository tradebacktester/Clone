import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { CheckCircle2, XCircle, AlertTriangle, TrendingUp, Users, Scale } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const API = (path: string) => `/api${path}`;

function useTiComparison() {
  return useQuery({ queryKey: ["ti-comparison"], queryFn: () => fetch(API("/ti/comparison")).then(r => r.json()), refetchInterval: 15000 });
}
function useTiDecisions(filters?: { pair?: string; decision?: string; outcome?: string }) {
  const params = new URLSearchParams({ limit: "50", ...(filters ?? {}) });
  return useQuery({ queryKey: ["ti-decisions", filters], queryFn: () => fetch(API(`/ti/decisions?${params}`)).then(r => r.json()), refetchInterval: 15000 });
}

const PAIRS = ["EURUSD", "GBPUSD", "USDJPY"];
const SESSIONS = ["london", "newyork", "asian"];
const REGIMES = ["trending", "ranging", "volatile", "low_volatility"];

interface LogFormState {
  pair: string;
  session: string;
  regime: string;
  traderDecision: string;
  traderConfidence: string;
  engineDecision: string;
  traderNotes: string;
  zoneScore: string;
  liquidityScore: string;
  amdScore: string;
  confirmScore: string;
  tqi: string;
  expectedRr: string;
}

const EMPTY_FORM: LogFormState = {
  pair: "EURUSD", session: "london", regime: "trending",
  traderDecision: "accepted", traderConfidence: "70",
  engineDecision: "accepted", traderNotes: "",
  zoneScore: "", liquidityScore: "", amdScore: "",
  confirmScore: "", tqi: "", expectedRr: "",
};

function AgreementBadge({ agree }: { agree: boolean }) {
  return agree
    ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs font-mono">Agreement</Badge>
    : <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs font-mono">Disagreement</Badge>;
}

function CategoryCard({ title, icon: Icon, count, winRate, color, description }: {
  title: string; icon: React.ElementType; count: number; winRate: number | null; color: string; description: string;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs font-mono uppercase text-muted-foreground">{title}</p>
            <p className={`text-3xl font-bold font-mono mt-1 ${color}`}>{count}</p>
          </div>
          <Icon className={`w-5 h-5 mt-1 ${color}`} />
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        {winRate != null && (
          <p className="text-xs font-mono mt-1">Win rate: <span className={winRate >= 50 ? "text-green-400" : "text-red-400"}>{(winRate * 100).toFixed(1)}%</span></p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Comparison() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<LogFormState>(EMPTY_FORM);
  const [filterPair, setFilterPair] = useState<string>("all");
  const [filterOutcome, setFilterOutcome] = useState<string>("all");

  const { data: comparison, isLoading: loadingComparison } = useTiComparison();
  const { data: decisionsData, isLoading: loadingDecisions } = useTiDecisions({
    pair: filterPair !== "all" ? filterPair : undefined,
    outcome: filterOutcome !== "all" ? filterOutcome : undefined,
  });

  const decisions = decisionsData?.decisions ?? [];

  const logDecision = async () => {
    if (!form.pair || !form.traderDecision) return;
    const body: Record<string, unknown> = {
      pair: form.pair,
      session: form.session,
      regime: form.regime,
      traderDecision: form.traderDecision,
      traderConfidence: parseInt(form.traderConfidence) || 70,
      engineDecision: form.engineDecision || undefined,
      traderNotes: form.traderNotes || undefined,
      timeframes: "[]",
      contextTags: "[]",
    };
    if (form.zoneScore) body.zoneScore = parseFloat(form.zoneScore);
    if (form.liquidityScore) body.liquidityScore = parseFloat(form.liquidityScore);
    if (form.amdScore) body.amdScore = parseFloat(form.amdScore);
    if (form.confirmScore) body.confirmScore = parseFloat(form.confirmScore);
    if (form.tqi) body.tqi = parseFloat(form.tqi);
    if (form.expectedRr) body.expectedRr = parseFloat(form.expectedRr);

    const res = await fetch(API("/ti/decisions"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      toast({ title: "Decision logged successfully" });
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["ti-decisions"] });
      qc.invalidateQueries({ queryKey: ["ti-comparison"] });
    } else {
      toast({ title: "Failed to log decision", variant: "destructive" });
    }
  };

  const updateOutcome = async (id: number, outcome: string) => {
    await fetch(API(`/ti/decisions/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    qc.invalidateQueries({ queryKey: ["ti-decisions"] });
    qc.invalidateQueries({ queryKey: ["ti-comparison"] });
    toast({ title: `Outcome updated: ${outcome}` });
  };

  const agreementData = comparison ? [
    { name: "Both Accepted", count: comparison.bothAccepted?.count ?? 0, fill: "hsl(var(--primary))" },
    { name: "Bot Yes / Me No", count: comparison.botAcceptedTraderRejected?.count ?? 0, fill: "hsl(var(--destructive))" },
    { name: "Me Yes / Bot No", count: comparison.traderAcceptedBotRejected?.count ?? 0, fill: "#f59e0b" },
    { name: "Both Rejected", count: comparison.bothRejected?.count ?? 0, fill: "hsl(var(--muted-foreground))" },
  ] : [];

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-mono uppercase tracking-tight flex items-center gap-2">
          <Scale className="w-6 h-6 text-primary" />
          Comparison Workspace
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Log your decisions alongside the bot's. Build objective evidence for strategy improvement.</p>
      </div>

      {/* Stats Row */}
      {!loadingComparison && comparison && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CategoryCard title="Agreement Rate" icon={Users} count={Math.round((comparison.agreementRate ?? 0) * 100)} winRate={null} color="text-primary" description="% of decisions where you agreed with the bot" />
          <CategoryCard title="Both Accepted" icon={CheckCircle2} count={comparison.bothAccepted?.count ?? 0} winRate={comparison.bothAccepted?.winRate} color="text-green-400" description="Bot and you both took the trade" />
          <CategoryCard title="False Positives" icon={XCircle} count={comparison.botAcceptedTraderRejected?.count ?? 0} winRate={comparison.botAcceptedTraderRejected?.winRate} color="text-red-400" description="Bot took it, you would have skipped" />
          <CategoryCard title="False Negatives" icon={AlertTriangle} count={comparison.traderAcceptedBotRejected?.count ?? 0} winRate={comparison.traderAcceptedBotRejected?.winRate} color="text-yellow-400" description="You would have taken it, bot skipped" />
        </div>
      )}

      <Tabs defaultValue="log">
        <TabsList className="font-mono text-xs uppercase">
          <TabsTrigger value="log">Log Setup</TabsTrigger>
          <TabsTrigger value="history">Decision History</TabsTrigger>
          <TabsTrigger value="stats">Agreement Stats</TabsTrigger>
        </TabsList>

        {/* Log Setup */}
        <TabsContent value="log">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 border-b border-border/10">
              <CardTitle className="text-sm font-mono uppercase">Log New Setup Review</CardTitle>
              <CardDescription className="text-xs">Record your assessment of a setup the bot is evaluating. The more details you provide, the better the analysis.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">Pair *</Label>
                  <Select value={form.pair} onValueChange={(v) => setForm(f => ({ ...f, pair: v }))}>
                    <SelectTrigger className="h-8 text-sm font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>{PAIRS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">Session</Label>
                  <Select value={form.session} onValueChange={(v) => setForm(f => ({ ...f, session: v }))}>
                    <SelectTrigger className="h-8 text-sm font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>{SESSIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">Regime</Label>
                  <Select value={form.regime} onValueChange={(v) => setForm(f => ({ ...f, regime: v }))}>
                    <SelectTrigger className="h-8 text-sm font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>{REGIMES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">My Decision *</Label>
                  <Select value={form.traderDecision} onValueChange={(v) => setForm(f => ({ ...f, traderDecision: v }))}>
                    <SelectTrigger className="h-8 text-sm font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="accepted">✅ Accept</SelectItem>
                      <SelectItem value="rejected">❌ Reject</SelectItem>
                      <SelectItem value="delayed">⏳ Delay</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">My Confidence (0-100)</Label>
                  <Input className="h-8 text-sm font-mono" type="number" min={0} max={100} value={form.traderConfidence} onChange={(e) => setForm(f => ({ ...f, traderConfidence: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">Bot Decision</Label>
                  <Select value={form.engineDecision} onValueChange={(v) => setForm(f => ({ ...f, engineDecision: v }))}>
                    <SelectTrigger className="h-8 text-sm font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="accepted">Bot Accepted</SelectItem>
                      <SelectItem value="rejected">Bot Rejected</SelectItem>
                      <SelectItem value="no_signal">No Signal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">Zone Score</Label>
                  <Input className="h-8 text-sm font-mono" placeholder="0–100" value={form.zoneScore} onChange={(e) => setForm(f => ({ ...f, zoneScore: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">AMD Score</Label>
                  <Input className="h-8 text-sm font-mono" placeholder="0–100" value={form.amdScore} onChange={(e) => setForm(f => ({ ...f, amdScore: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">Liquidity Score</Label>
                  <Input className="h-8 text-sm font-mono" placeholder="0–100" value={form.liquidityScore} onChange={(e) => setForm(f => ({ ...f, liquidityScore: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">Confirm Score</Label>
                  <Input className="h-8 text-sm font-mono" placeholder="0–100" value={form.confirmScore} onChange={(e) => setForm(f => ({ ...f, confirmScore: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">TQI Score</Label>
                  <Input className="h-8 text-sm font-mono" placeholder="0–100" value={form.tqi} onChange={(e) => setForm(f => ({ ...f, tqi: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">Expected R:R</Label>
                  <Input className="h-8 text-sm font-mono" placeholder="e.g. 2.5" value={form.expectedRr} onChange={(e) => setForm(f => ({ ...f, expectedRr: e.target.value }))} />
                </div>
                <div className="col-span-2 md:col-span-3 lg:col-span-4 space-y-1">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">Notes / Reason for Agreement or Disagreement</Label>
                  <Textarea className="text-sm font-mono resize-none" rows={3} placeholder="Why did you agree or disagree with the bot? What did you see differently?" value={form.traderNotes} onChange={(e) => setForm(f => ({ ...f, traderNotes: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <Button onClick={logDecision} className="font-mono">Log Decision</Button>
                <Button variant="outline" onClick={() => setForm(EMPTY_FORM)} className="font-mono">Clear</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Decision History */}
        <TabsContent value="history">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 border-b border-border/10 flex-row items-center justify-between">
              <CardTitle className="text-sm font-mono uppercase">Decision Log</CardTitle>
              <div className="flex gap-2">
                <Select value={filterPair} onValueChange={setFilterPair}>
                  <SelectTrigger className="h-7 text-xs w-28 font-mono"><SelectValue placeholder="All Pairs" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Pairs</SelectItem>
                    {PAIRS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterOutcome} onValueChange={setFilterOutcome}>
                  <SelectTrigger className="h-7 text-xs w-28 font-mono"><SelectValue placeholder="All Outcomes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Outcomes</SelectItem>
                    <SelectItem value="win">Win</SelectItem>
                    <SelectItem value="loss">Loss</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="missed">Missed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingDecisions ? (
                <div className="p-4 animate-pulse space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-muted/20 rounded" />)}</div>
              ) : decisions.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground font-mono text-center">No decisions logged yet. Start logging setups you review.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-muted/20 border-b border-border">
                      <tr>
                        <th className="text-left p-2 text-muted-foreground">Date</th>
                        <th className="text-left p-2 text-muted-foreground">Pair</th>
                        <th className="text-left p-2 text-muted-foreground">My Call</th>
                        <th className="text-left p-2 text-muted-foreground">Bot</th>
                        <th className="text-left p-2 text-muted-foreground">Agreement</th>
                        <th className="text-right p-2 text-muted-foreground">Confidence</th>
                        <th className="text-right p-2 text-muted-foreground">TQI</th>
                        <th className="text-left p-2 text-muted-foreground">Outcome</th>
                        <th className="text-left p-2 text-muted-foreground">Set Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decisions.map((d: Record<string, unknown>) => {
                        const myAccepted = d.traderDecision === "accepted";
                        const botAccepted = d.engineDecision === "accepted";
                        const bothHaveDecision = d.engineDecision != null;
                        const agree = bothHaveDecision && myAccepted === botAccepted;
                        return (
                          <tr key={String(d.id)} className="border-b border-border/20 hover:bg-muted/10">
                            <td className="p-2 text-muted-foreground">{typeof d.createdAt === "string" ? d.createdAt.slice(0, 10) : "?"}</td>
                            <td className="p-2 font-bold">{String(d.pair)}</td>
                            <td className="p-2"><Badge variant={myAccepted ? "default" : "secondary"} className="text-[10px]">{String(d.traderDecision)}</Badge></td>
                            <td className="p-2">{d.engineDecision ? <Badge variant={botAccepted ? "default" : "secondary"} className="text-[10px]">{String(d.engineDecision)}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                            <td className="p-2">{bothHaveDecision ? <AgreementBadge agree={agree} /> : <span className="text-muted-foreground">—</span>}</td>
                            <td className="p-2 text-right">{d.traderConfidence != null ? `${d.traderConfidence}%` : "—"}</td>
                            <td className="p-2 text-right">{d.tqi != null ? Number(d.tqi).toFixed(0) : "—"}</td>
                            <td className="p-2">{d.outcome ? <Badge variant={d.outcome === "win" ? "default" : d.outcome === "loss" ? "destructive" : "secondary"} className="text-[10px]">{String(d.outcome)}</Badge> : <span className="text-muted-foreground">pending</span>}</td>
                            <td className="p-2">
                              <Select onValueChange={(v) => updateOutcome(Number(d.id), v)}>
                                <SelectTrigger className="h-6 text-[10px] w-20"><SelectValue placeholder="Set…" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="win">Win</SelectItem>
                                  <SelectItem value="loss">Loss</SelectItem>
                                  <SelectItem value="missed">Missed</SelectItem>
                                  <SelectItem value="pending">Pending</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agreement Stats */}
        <TabsContent value="stats">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase">Decision Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="h-[250px]">
                  {loadingComparison ? (
                    <div className="w-full h-full animate-pulse bg-muted/20 rounded" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={agreementData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} width={100} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {agreementData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase">Interpretation</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-sm">
                {loadingComparison ? (
                  <div className="animate-pulse space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-10 bg-muted/20 rounded" />)}</div>
                ) : (
                  <>
                    <div className="flex items-start gap-3 p-3 bg-muted/10 rounded-lg">
                      <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-mono font-bold text-xs uppercase text-green-400">Both Accepted ({comparison?.bothAccepted?.count ?? 0})</p>
                        <p className="text-muted-foreground text-xs mt-0.5">Highest conviction setups. WR: {comparison?.bothAccepted?.winRate != null ? `${(comparison.bothAccepted.winRate * 100).toFixed(1)}%` : "N/A"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-muted/10 rounded-lg">
                      <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-mono font-bold text-xs uppercase text-red-400">False Positives ({comparison?.botAcceptedTraderRejected?.count ?? 0})</p>
                        <p className="text-muted-foreground text-xs mt-0.5">Bot took it, you skipped. If bot WR is low here, your judgment adds value.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-muted/10 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-mono font-bold text-xs uppercase text-yellow-400">Missed Opportunities ({comparison?.traderAcceptedBotRejected?.count ?? 0})</p>
                        <p className="text-muted-foreground text-xs mt-0.5">You would have taken it, bot skipped. If WR is high, the bot may be too conservative.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <TrendingUp className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-mono font-bold text-xs uppercase text-primary">Overall Agreement: {comparison ? `${Math.round((comparison.agreementRate ?? 0) * 100)}%` : "—"}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">Based on {comparison?.totalDecisions ?? 0} logged decisions with engine context.</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
