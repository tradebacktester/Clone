import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Shield, ShieldCheck, ShieldX, Play, Square, Trash2, CheckCircle2, XCircle, Clock, Activity } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";

const API = (path: string) => `/api${path}`;

function usePilotStatus() {
  return useQuery({ queryKey: ["pilot-status"], queryFn: () => fetch(API("/pilot/status")).then(r => r.json()), refetchInterval: 10000 });
}
function usePilotEvents() {
  return useQuery({ queryKey: ["pilot-events"], queryFn: () => fetch(API("/pilot/events?limit=50")).then(r => r.json()), refetchInterval: 15000 });
}

function StatusIndicator({ enabled, halted, canTrade }: { enabled: boolean; halted: boolean; canTrade: boolean }) {
  if (!enabled) return <Badge className="bg-muted text-muted-foreground border-border font-mono text-sm px-3">DISABLED</Badge>;
  if (halted) return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 font-mono text-sm px-3 flex items-center gap-1"><ShieldX className="w-4 h-4" />HALTED</Badge>;
  if (canTrade) return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 font-mono text-sm px-3 flex items-center gap-1"><ShieldCheck className="w-4 h-4" />ACTIVE</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 font-mono text-sm px-3 flex items-center gap-1"><Shield className="w-4 h-4" />PAUSED</Badge>;
}

function EventTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    started: "bg-green-500/20 text-green-400 border-green-500/30",
    stopped: "bg-muted text-muted-foreground border-border",
    halted: "bg-red-500/20 text-red-400 border-red-500/30",
    consec_loss_halt: "bg-red-500/20 text-red-400 border-red-500/30",
    trade_closed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    risk_limit_hit: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  return <Badge className={`text-[10px] font-mono ${map[type] ?? "bg-muted text-muted-foreground"}`}>{type.replace(/_/g, " ")}</Badge>;
}

export default function PilotMode() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: status, isLoading } = usePilotStatus();
  const { data: eventsData, isLoading: loadingEvents } = usePilotEvents();
  const events = eventsData?.events ?? [];

  const [configForm, setConfigForm] = useState({
    maxRiskPerTradePct: "",
    maxDailyLossPct: "",
    maxWeeklyLossPct: "",
    maxOpenTrades: "",
    shutdownOnNConsecLosses: "",
    manualConfirmRequired: true,
  });
  const [configEditing, setConfigEditing] = useState(false);

  const startEdit = () => {
    if (status) {
      setConfigForm({
        maxRiskPerTradePct: String(status.maxRiskPerTradePct ?? 0.25),
        maxDailyLossPct: String(status.maxDailyLossPct ?? 1.0),
        maxWeeklyLossPct: String(status.maxWeeklyLossPct ?? 2.0),
        maxOpenTrades: String(status.maxOpenTrades ?? 1),
        shutdownOnNConsecLosses: String(status.shutdownThreshold ?? 3),
        manualConfirmRequired: status.manualConfirmRequired ?? true,
      });
      setConfigEditing(true);
    }
  };

  const saveConfig = async () => {
    const res = await fetch(API("/pilot/config"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maxRiskPerTradePct: parseFloat(configForm.maxRiskPerTradePct),
        maxDailyLossPct: parseFloat(configForm.maxDailyLossPct),
        maxWeeklyLossPct: parseFloat(configForm.maxWeeklyLossPct),
        maxOpenTrades: parseInt(configForm.maxOpenTrades),
        shutdownOnNConsecLosses: parseInt(configForm.shutdownOnNConsecLosses),
        manualConfirmRequired: configForm.manualConfirmRequired,
      }),
    });
    if (res.ok) {
      toast({ title: "Pilot config saved" });
      setConfigEditing(false);
      qc.invalidateQueries({ queryKey: ["pilot-status"] });
    } else {
      toast({ title: "Failed to save config", variant: "destructive" });
    }
  };

  const togglePilot = async () => {
    if (status?.enabled) {
      const res = await fetch(API("/pilot/disable"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Manually disabled from dashboard" }) });
      if (res.ok) { toast({ title: "Pilot mode disabled" }); qc.invalidateQueries({ queryKey: ["pilot-status"] }); }
    } else {
      const res = await fetch(API("/pilot/enable"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (res.ok) { toast({ title: "Pilot mode enabled" }); qc.invalidateQueries({ queryKey: ["pilot-status"] }); }
      else { toast({ title: "Failed to enable pilot mode", variant: "destructive" }); }
    }
  };

  const clearHalt = async () => {
    const res = await fetch(API("/pilot/clear-halt"), { method: "POST" });
    if (res.ok) {
      toast({ title: "Halt cleared — consecutive loss counter reset" });
      qc.invalidateQueries({ queryKey: ["pilot-status"] });
      qc.invalidateQueries({ queryKey: ["pilot-events"] });
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Pilot Mode
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Small real-money account mode with hard-capped risk and comprehensive safety controls.</p>
        </div>
        {!isLoading && status && (
          <StatusIndicator enabled={status.enabled} halted={status.halted} canTrade={status.canTrade} />
        )}
      </div>

      {/* Critical warnings */}
      <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
        <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-red-200/80">
          <strong>Real-money mode.</strong> Pilot mode connects to a live broker account with actual funds. Maximum risk is hard-capped at 0.5% per trade. Do not enable unless you have successfully paper traded for at least 30 days with positive results and passed the Live Readiness Certification.
        </div>
      </div>

      {status?.halted && (
        <div className="flex items-center justify-between p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-3">
            <ShieldX className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-sm font-mono font-bold text-red-400">HALT ACTIVE</p>
              <p className="text-xs text-muted-foreground">{status.haltReason ?? "Automatic halt — consecutive losses"}</p>
            </div>
          </div>
          <Button variant="destructive" size="sm" onClick={clearHalt} className="font-mono text-xs">Clear Halt</Button>
        </div>
      )}

      <Tabs defaultValue="status">
        <TabsList className="font-mono text-xs uppercase">
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="events">Audit Log</TabsTrigger>
        </TabsList>

        {/* Status */}
        <TabsContent value="status">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase">Live Status</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {isLoading ? (
                  <div className="animate-pulse space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-8 bg-muted/20 rounded" />)}</div>
                ) : status ? (
                  <>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Mode</span><StatusIndicator enabled={status.enabled} halted={status.halted} canTrade={status.canTrade} /></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Can Trade</span><span className={`font-mono font-bold ${status.canTrade ? "text-green-400" : "text-red-400"}`}>{status.canTrade ? "Yes" : "No"}</span></div>
                    {status.blockReason && <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Block Reason</span><span className="font-mono text-yellow-400 text-xs">{status.blockReason}</span></div>}
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Daily P&L</span><span className={`font-mono font-bold ${status.dailyPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(status.dailyPnl)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Weekly P&L</span><span className={`font-mono font-bold ${status.weeklyPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(status.weeklyPnl)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Total P&L</span><span className={`font-mono font-bold ${status.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(status.totalPnl)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Total Trades</span><span className="font-mono font-bold">{status.totalTrades}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Open Trades</span><span className="font-mono font-bold">{status.currentOpenTrades} / {status.maxOpenTrades}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Consec. Losses</span><span className={`font-mono font-bold ${status.consecLosses >= status.shutdownThreshold - 1 ? "text-red-400" : "text-muted-foreground"}`}>{status.consecLosses} / {status.shutdownThreshold}</span></div>
                    {status.startedAt && <div className="flex justify-between text-sm"><span className="text-muted-foreground font-mono">Started</span><span className="font-mono text-xs">{new Date(status.startedAt).toLocaleString()}</span></div>}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground font-mono">No pilot config found.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase">Risk Limits</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {isLoading ? (
                  <div className="animate-pulse space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-8 bg-muted/20 rounded" />)}</div>
                ) : status ? (
                  <>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground font-mono">Max Risk / Trade</span>
                      <Badge className="font-mono bg-primary/10 text-primary border-primary/30">{status.maxRiskPerTradePct?.toFixed(3) ?? "—"}%</Badge>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground font-mono">Daily Loss Limit</span>
                      <Badge className="font-mono bg-yellow-500/10 text-yellow-400 border-yellow-500/30">{status.maxDailyLossPct?.toFixed(1) ?? "—"}%</Badge>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground font-mono">Weekly Loss Limit</span>
                      <Badge className="font-mono bg-yellow-500/10 text-yellow-400 border-yellow-500/30">{status.maxWeeklyLossPct?.toFixed(1) ?? "—"}%</Badge>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground font-mono">Max Open Trades</span>
                      <Badge variant="outline" className="font-mono">{status.maxOpenTrades}</Badge>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground font-mono">Auto-Halt at</span>
                      <Badge className="font-mono bg-red-500/10 text-red-400 border-red-500/30">{status.shutdownThreshold} consec. losses</Badge>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground font-mono">Manual Confirm</span>
                      {status.manualConfirmRequired
                        ? <Badge className="font-mono bg-green-500/10 text-green-400 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Required</Badge>
                        : <Badge variant="secondary" className="font-mono">Off</Badge>
                      }
                    </div>
                  </>
                ) : null}

                <div className="pt-4 border-t border-border/20 flex gap-3">
                  <Button
                    onClick={togglePilot}
                    variant={status?.enabled ? "destructive" : "default"}
                    size="sm"
                    className="flex-1 font-mono gap-2"
                    disabled={isLoading || (status?.halted && !status?.enabled)}
                  >
                    {status?.enabled ? <><Square className="w-3 h-3" />Disable</> : <><Play className="w-3 h-3" />Enable</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Configuration */}
        <TabsContent value="config">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 border-b border-border/10 flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-mono uppercase">Risk Configuration</CardTitle>
                <CardDescription className="text-xs">Hard-capped risk settings. Max risk per trade is clamped to 0.5%.</CardDescription>
              </div>
              {!configEditing && <Button size="sm" variant="outline" onClick={startEdit} className="font-mono text-xs">Edit Config</Button>}
            </CardHeader>
            <CardContent className="p-6">
              {!configEditing ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {status && [
                    { label: "Max Risk / Trade", value: `${status.maxRiskPerTradePct?.toFixed(3)}%`, note: "Hard limit: 0.5%" },
                    { label: "Daily Loss Limit", value: `${status.maxDailyLossPct?.toFixed(1)}%`, note: "Of account balance" },
                    { label: "Weekly Loss Limit", value: `${status.maxWeeklyLossPct?.toFixed(1)}%`, note: "Of account balance" },
                    { label: "Max Open Trades", value: String(status.maxOpenTrades), note: "Max 2 simultaneous" },
                    { label: "Auto-Halt Losses", value: `${status.shutdownThreshold} in a row`, note: "Consecutive losses trigger halt" },
                    { label: "Manual Confirm", value: status.manualConfirmRequired ? "Required" : "Off", note: "Require approval per trade" },
                  ].map((item, i) => (
                    <div key={i} className="p-3 bg-muted/10 rounded-lg">
                      <p className="text-xs font-mono uppercase text-muted-foreground">{item.label}</p>
                      <p className="text-lg font-bold font-mono mt-1">{item.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{item.note}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { key: "maxRiskPerTradePct", label: "Max Risk % / Trade", note: "Range: 0.1–0.5" },
                    { key: "maxDailyLossPct", label: "Daily Loss Limit %", note: "e.g. 1.0" },
                    { key: "maxWeeklyLossPct", label: "Weekly Loss Limit %", note: "e.g. 2.0" },
                    { key: "maxOpenTrades", label: "Max Open Trades", note: "Range: 1–2" },
                    { key: "shutdownOnNConsecLosses", label: "Auto-Halt Losses", note: "e.g. 3" },
                  ].map((field) => (
                    <div key={field.key} className="space-y-1">
                      <Label className="text-xs font-mono uppercase text-muted-foreground">{field.label}</Label>
                      <Input
                        className="h-8 text-sm font-mono"
                        value={configForm[field.key as keyof typeof configForm] as string}
                        onChange={(e) => setConfigForm(f => ({ ...f, [field.key]: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">{field.note}</p>
                    </div>
                  ))}
                  <div className="space-y-1">
                    <Label className="text-xs font-mono uppercase text-muted-foreground">Manual Confirm</Label>
                    <div className="flex items-center gap-2 h-8">
                      <Switch
                        checked={configForm.manualConfirmRequired}
                        onCheckedChange={(v) => setConfigForm(f => ({ ...f, manualConfirmRequired: v }))}
                      />
                      <span className="text-sm font-mono">{configForm.manualConfirmRequired ? "Required" : "Off"}</span>
                    </div>
                  </div>
                  <div className="col-span-2 md:col-span-3 flex gap-3 mt-2">
                    <Button onClick={saveConfig} className="font-mono">Save Configuration</Button>
                    <Button variant="outline" onClick={() => setConfigEditing(false)} className="font-mono">Cancel</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Log */}
        <TabsContent value="events">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 border-b border-border/10">
              <CardTitle className="text-sm font-mono uppercase flex items-center gap-2"><Activity className="w-4 h-4" />Comprehensive Audit Log</CardTitle>
              <CardDescription className="text-xs">Every action taken in Pilot Mode is logged here.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingEvents ? (
                <div className="p-4 animate-pulse space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-muted/20 rounded" />)}</div>
              ) : events.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground font-mono text-center">No pilot events recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-muted/20 border-b border-border">
                      <tr>
                        <th className="text-left p-2 text-muted-foreground">Time</th>
                        <th className="text-left p-2 text-muted-foreground">Event</th>
                        <th className="text-left p-2 text-muted-foreground">Pair</th>
                        <th className="text-right p-2 text-muted-foreground">P&L</th>
                        <th className="text-right p-2 text-muted-foreground">Risk%</th>
                        <th className="text-left p-2 text-muted-foreground">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e: Record<string, unknown>, i: number) => (
                        <tr key={i} className="border-b border-border/20 hover:bg-muted/10">
                          <td className="p-2 text-muted-foreground">{typeof e.createdAt === "string" ? e.createdAt.slice(0, 16).replace("T", " ") : "?"}</td>
                          <td className="p-2"><EventTypeBadge type={String(e.eventType)} /></td>
                          <td className="p-2">{e.pair ? <span className="font-bold">{String(e.pair)}</span> : <span className="text-muted-foreground">—</span>}</td>
                          <td className={`p-2 text-right font-bold ${e.pnl != null ? (Number(e.pnl) >= 0 ? "text-green-400" : "text-red-400") : "text-muted-foreground"}`}>{e.pnl != null ? `$${Number(e.pnl).toFixed(2)}` : "—"}</td>
                          <td className="p-2 text-right">{e.riskPct != null ? `${Number(e.riskPct).toFixed(3)}%` : "—"}</td>
                          <td className="p-2 max-w-xs truncate text-muted-foreground">{e.notes ? String(e.notes) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
