import { useState } from "react";
import {
  useGetBotStatus,
  useGetBotConfig,
  useGetRiskSettings,
  useListBrokerAccounts,
  useEmergencyStop,
  useResumeBot,
  useSetLiveMode,
  useGetExecutionLog,
  useUpdateRiskSettings,
  useUpdateBotConfig,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Power,
  RefreshCw,
  Save,
  Activity,
  ArrowDown,
  ArrowUp,
  Zap,
} from "lucide-react";
import { format } from "date-fns";

const EVENT_LABELS: Record<string, string> = {
  trade_opened: "Trade Opened",
  trade_closed: "Trade Closed",
  emergency_stop: "Emergency Stop",
  daily_halt: "Daily Halt",
  weekly_halt: "Weekly Halt",
  manual_close: "Manual Close",
  live_enabled: "Live Enabled",
  live_disabled: "Live Disabled",
  resume: "Resumed",
  bot_started: "Bot Started",
  bot_stopped: "Bot Stopped",
};

const EVENT_COLORS: Record<string, string> = {
  trade_opened: "text-success",
  trade_closed: "text-muted-foreground",
  emergency_stop: "text-destructive",
  daily_halt: "text-warning",
  weekly_halt: "text-warning",
  manual_close: "text-primary",
  live_enabled: "text-warning",
  live_disabled: "text-muted-foreground",
  resume: "text-success",
  bot_started: "text-success",
  bot_stopped: "text-muted-foreground",
};

export default function Settings() {
  const qc = useQueryClient();

  const { data: status, isLoading: isLoadingStatus } = useGetBotStatus();
  const { data: config, isLoading: isLoadingConfig } = useGetBotConfig();
  const { data: risk, isLoading: isLoadingRisk } = useGetRiskSettings();
  const { data: brokers, isLoading: isLoadingBrokers } = useListBrokerAccounts();
  const { data: logData, isLoading: isLoadingLog } = useGetExecutionLog({ limit: 30, offset: 0 });

  const emergencyStop = useEmergencyStop();
  const resumeBot = useResumeBot();
  const setLiveMode = useSetLiveMode();
  const updateRisk = useUpdateRiskSettings();
  const updateConfig = useUpdateBotConfig();

  const [confirmEmergency, setConfirmEmergency] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);

  const [riskForm, setRiskForm] = useState<{
    riskPerTrade?: string;
    maxDailyLoss?: string;
    maxWeeklyLoss?: string;
    maxOpenTrades?: string;
  }>({});

  const [configForm, setConfigForm] = useState<{
    pairs?: string;
    sessions?: string;
    newsFilterEnabled?: boolean;
    trailingStopEnabled?: boolean;
    confirmationRequired?: boolean;
  }>({});

  const liveEnabled = status?.liveEnabled ?? false;
  const isEmergencyStopped = status?.emergencyStop ?? false;
  const isHalted = status?.haltedDueToRisk ?? false;
  const isRunning = status?.running ?? false;

  function handleEmergencyStop() {
    if (!confirmEmergency) {
      setConfirmEmergency(true);
      return;
    }
    emergencyStop.mutate(undefined, {
      onSuccess: () => {
        setConfirmEmergency(false);
        qc.invalidateQueries();
      },
    });
  }

  function handleResume() {
    resumeBot.mutate(undefined, {
      onSuccess: () => qc.invalidateQueries(),
    });
  }

  function handleLiveToggle() {
    if (!liveEnabled && !confirmLive) {
      setConfirmLive(true);
      return;
    }
    setLiveMode.mutate({ data: { enabled: !liveEnabled } }, {
      onSuccess: () => {
        setConfirmLive(false);
        qc.invalidateQueries();
      },
    });
  }

  function handleSaveRisk() {
    const updates: Parameters<typeof updateRisk.mutate>[0]["data"] = {};
    if (riskForm.riskPerTrade !== undefined) updates.riskPerTrade = parseFloat(riskForm.riskPerTrade);
    if (riskForm.maxDailyLoss !== undefined) updates.maxDailyLoss = parseFloat(riskForm.maxDailyLoss);
    if (riskForm.maxWeeklyLoss !== undefined) updates.maxWeeklyLoss = parseFloat(riskForm.maxWeeklyLoss);
    if (riskForm.maxOpenTrades !== undefined) updates.maxOpenTrades = parseInt(riskForm.maxOpenTrades);
    if (Object.keys(updates).length === 0) return;
    updateRisk.mutate({ data: updates }, { onSuccess: () => qc.invalidateQueries() });
  }

  function handleSaveConfig() {
    const updates: Parameters<typeof updateConfig.mutate>[0]["data"] = {};
    if (configForm.pairs !== undefined) updates.pairs = configForm.pairs.split(",").map(s => s.trim()).filter(Boolean);
    if (configForm.sessions !== undefined) updates.sessions = configForm.sessions.split(",").map(s => s.trim()).filter(Boolean);
    if (configForm.newsFilterEnabled !== undefined) updates.newsFilterEnabled = configForm.newsFilterEnabled;
    if (configForm.trailingStopEnabled !== undefined) updates.trailingStopEnabled = configForm.trailingStopEnabled;
    if (configForm.confirmationRequired !== undefined) updates.confirmationRequired = configForm.confirmationRequired;
    if (Object.keys(updates).length === 0) return;
    updateConfig.mutate({ data: updates }, { onSuccess: () => qc.invalidateQueries() });
  }

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight">Configuration</h1>
          <p className="text-muted-foreground text-sm mt-1">System parameters, risk controls, and broker integration.</p>
        </div>
      </div>

      {/* ── Broker Controls ─────────────────────────────────────────────── */}
      <Card className="bg-card border-card-border">
        <CardHeader className="bg-muted/10 border-b border-border py-3">
          <CardTitle className="text-sm font-mono uppercase tracking-wide flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> Broker Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {isLoadingStatus ? <Skeleton className="h-24 w-full" /> : (
            <>
              {/* Status Banner */}
              {(isEmergencyStopped || isHalted) && (
                <div className="rounded border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <div className="font-mono font-bold text-destructive text-sm uppercase">
                      {isEmergencyStopped ? "Emergency Stop Active" : "Risk Halt Active"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {isEmergencyStopped
                        ? "All positions have been closed. Clear the emergency stop to re-enable trading."
                        : "Daily or weekly loss limit reached. Resume to allow new signals."}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 font-mono text-xs uppercase border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={handleResume}
                      disabled={resumeBot.isPending}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      {resumeBot.isPending ? "Clearing…" : "Clear Halt & Resume"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Mode */}
                <div className="rounded border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-xs uppercase text-muted-foreground">Trading Mode</div>
                      <div className="font-mono font-bold text-sm mt-0.5 uppercase">
                        {isRunning ? (status?.mode ?? "paper") : "Idle"}
                      </div>
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full ${isRunning ? "bg-success animate-pulse" : "bg-muted"}`} />
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {isRunning ? `Bot running — ${status?.openTrades ?? 0} open positions` : "Bot is stopped"}
                  </div>
                </div>

                {/* Paper/Live Toggle */}
                <div className="rounded border border-border p-4 space-y-3">
                  <div className="font-mono text-xs uppercase text-muted-foreground">Live Trading Gate</div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`font-mono font-bold text-sm uppercase ${liveEnabled ? "text-warning" : "text-muted-foreground"}`}>
                        {liveEnabled ? "LIVE ENABLED" : "PAPER ONLY"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {liveEnabled ? "Real orders can be placed" : "No live orders — safe mode"}
                      </div>
                    </div>
                    <Switch
                      checked={liveEnabled}
                      onCheckedChange={handleLiveToggle}
                      disabled={setLiveMode.isPending || isRunning}
                      className={liveEnabled ? "data-[state=checked]:bg-warning" : ""}
                    />
                  </div>
                  {confirmLive && !liveEnabled && (
                    <div className="text-xs text-warning font-mono border border-warning/40 rounded p-2 bg-warning/5">
                      This enables real order execution. Click the toggle again to confirm.
                    </div>
                  )}
                  {isRunning && (
                    <div className="text-xs text-muted-foreground font-mono">Stop bot first to change mode</div>
                  )}
                </div>

                {/* Emergency Stop */}
                <div className="rounded border border-destructive/30 p-4 space-y-3">
                  <div className="font-mono text-xs uppercase text-muted-foreground">Emergency Stop</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    Immediately halts the bot and closes all open positions at market price.
                  </div>
                  {!confirmEmergency ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full font-mono uppercase text-xs"
                      onClick={() => setConfirmEmergency(true)}
                      disabled={emergencyStop.isPending || isEmergencyStopped}
                    >
                      <ShieldAlert className="w-3 h-3 mr-1" />
                      {isEmergencyStopped ? "Already Stopped" : "Emergency Stop"}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-destructive font-mono font-bold">Confirm — close all positions now?</div>
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex-1 font-mono text-xs uppercase"
                          onClick={handleEmergencyStop}
                          disabled={emergencyStop.isPending}
                        >
                          {emergencyStop.isPending ? "Stopping…" : "Confirm"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 font-mono text-xs uppercase"
                          onClick={() => setConfirmEmergency(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Loss Protection */}
              <div>
                <div className="font-mono text-xs uppercase text-muted-foreground mb-3">Loss Protection Status</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded border border-border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ArrowDown className="w-3.5 h-3.5 text-destructive" />
                        <span className="font-mono text-xs uppercase text-muted-foreground">Daily P&L</span>
                      </div>
                      <div className={`font-mono font-bold text-sm ${(status?.dailyPnl ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                        {(status?.dailyPnl ?? 0) >= 0 ? "+" : ""}{(status?.dailyPnl ?? 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                      <span>Daily limit</span>
                      <span className="text-warning">{risk?.maxDailyLoss ?? 3}% drawdown max</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${(status?.dailyLoss ?? 0) < 0 ? "bg-destructive" : "bg-success"}`}
                        style={{
                          width: `${Math.min(100, Math.abs((status?.dailyLoss ?? 0)) / ((risk?.maxDailyLoss ?? 3) / 100 * 10000) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="rounded border border-border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ArrowDown className="w-3.5 h-3.5 text-destructive" />
                        <span className="font-mono text-xs uppercase text-muted-foreground">Weekly P&L</span>
                      </div>
                      <div className={`font-mono font-bold text-sm ${(status?.weeklyLoss ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                        {(status?.weeklyLoss ?? 0) <= 0 ? "" : "+"}{(status?.weeklyLoss ?? 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                      <span>Weekly limit</span>
                      <span className="text-warning">{risk?.maxWeeklyLoss ?? 6}% drawdown max</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${(status?.weeklyLoss ?? 0) < 0 ? "bg-destructive" : "bg-success"}`}
                        style={{
                          width: `${Math.min(100, Math.abs((status?.weeklyLoss ?? 0)) / ((risk?.maxWeeklyLoss ?? 6) / 100 * 10000) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trading Parameters */}
        <Card className="bg-card border-card-border">
          <CardHeader className="bg-muted/10 border-b border-border py-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">Trading Parameters</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {isLoadingConfig ? <Skeleton className="h-32 w-full" /> : (
              <>
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase text-muted-foreground">Active Pairs (comma separated)</Label>
                  <Input
                    defaultValue={config?.pairs.join(", ")}
                    className="font-mono"
                    onChange={e => setConfigForm(f => ({ ...f, pairs: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase text-muted-foreground">Trading Sessions</Label>
                  <Input
                    defaultValue={config?.sessions.join(", ")}
                    className="font-mono"
                    onChange={e => setConfigForm(f => ({ ...f, sessions: e.target.value }))}
                  />
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <Label className="font-mono text-xs uppercase">News Filter</Label>
                  <Switch
                    defaultChecked={config?.newsFilterEnabled}
                    onCheckedChange={v => setConfigForm(f => ({ ...f, newsFilterEnabled: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="font-mono text-xs uppercase">Trailing Stop</Label>
                  <Switch
                    defaultChecked={config?.trailingStopEnabled}
                    onCheckedChange={v => setConfigForm(f => ({ ...f, trailingStopEnabled: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="font-mono text-xs uppercase">Manual Confirmation Required</Label>
                  <Switch
                    defaultChecked={config?.confirmationRequired}
                    onCheckedChange={v => setConfigForm(f => ({ ...f, confirmationRequired: v }))}
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full font-mono uppercase text-xs mt-2"
                  onClick={handleSaveConfig}
                  disabled={updateConfig.isPending}
                >
                  <Save className="w-3 h-3 mr-1" />
                  {updateConfig.isPending ? "Saving…" : "Save Parameters"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Risk Management */}
        <Card className="bg-card border-card-border">
          <CardHeader className="bg-muted/10 border-b border-border py-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">Risk Management</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {isLoadingRisk ? <Skeleton className="h-32 w-full" /> : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase text-muted-foreground">Risk Per Trade (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      defaultValue={risk?.riskPerTrade}
                      className="font-mono"
                      onChange={e => setRiskForm(f => ({ ...f, riskPerTrade: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase text-muted-foreground">Max Open Trades</Label>
                    <Input
                      type="number"
                      defaultValue={risk?.maxOpenTrades}
                      className="font-mono"
                      onChange={e => setRiskForm(f => ({ ...f, maxOpenTrades: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase text-muted-foreground">Max Daily Loss (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      defaultValue={risk?.maxDailyLoss}
                      className="font-mono text-destructive"
                      onChange={e => setRiskForm(f => ({ ...f, maxDailyLoss: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase text-muted-foreground">Max Weekly Loss (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      defaultValue={risk?.maxWeeklyLoss}
                      className="font-mono text-destructive"
                      onChange={e => setRiskForm(f => ({ ...f, maxWeeklyLoss: e.target.value }))}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full font-mono uppercase text-xs mt-2"
                  onClick={handleSaveRisk}
                  disabled={updateRisk.isPending}
                >
                  <Save className="w-3 h-3 mr-1" />
                  {updateRisk.isPending ? "Saving…" : "Save Risk Settings"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Broker Connections */}
        <Card className="lg:col-span-2 bg-card border-card-border">
          <CardHeader className="bg-muted/10 border-b border-border py-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">Broker Connections</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingBrokers ? <div className="p-6"><Skeleton className="h-10 w-full" /></div> : (
              <div className="divide-y divide-border">
                {brokers?.map(broker => (
                  <div key={broker.id} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-bold font-mono uppercase">{broker.broker}</div>
                      <div className="text-xs text-muted-foreground font-mono">{broker.accountName} ({broker.accountId})</div>
                    </div>
                    <div className="flex items-center gap-4">
                      {broker.paperTrading && (
                        <Badge variant="outline" className="font-mono text-xs border-warning text-warning">PAPER</Badge>
                      )}
                      {!broker.paperTrading && liveEnabled && (
                        <Badge variant="outline" className="font-mono text-xs border-destructive text-destructive">LIVE</Badge>
                      )}
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${broker.active ? "bg-success" : "bg-destructive"}`} />
                        <span className="font-mono text-xs uppercase text-muted-foreground">
                          {broker.active ? "Connected" : "Disconnected"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {(!brokers || brokers.length === 0) && (
                  <div className="p-8 text-center text-muted-foreground font-mono text-sm">
                    No brokers configured. Add a broker account to enable live trading.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Execution Log ──────────────────────────────────────────────────── */}
      <Card className="bg-card border-card-border">
        <CardHeader className="bg-muted/10 border-b border-border py-3">
          <CardTitle className="text-sm font-mono uppercase tracking-wide flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Execution Log
            <span className="ml-auto text-xs text-muted-foreground font-normal normal-case">
              {logData?.total ?? 0} total events
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingLog ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (logData?.entries?.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-muted-foreground font-mono text-sm">
              No execution events yet. Start the bot to begin logging.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border bg-muted/5">
                    <th className="text-left p-3 text-muted-foreground uppercase tracking-wide">Event</th>
                    <th className="text-left p-3 text-muted-foreground uppercase tracking-wide">Pair</th>
                    <th className="text-left p-3 text-muted-foreground uppercase tracking-wide">Dir</th>
                    <th className="text-right p-3 text-muted-foreground uppercase tracking-wide">Price</th>
                    <th className="text-right p-3 text-muted-foreground uppercase tracking-wide">Slippage</th>
                    <th className="text-right p-3 text-muted-foreground uppercase tracking-wide">P&L</th>
                    <th className="text-left p-3 text-muted-foreground uppercase tracking-wide">Mode</th>
                    <th className="text-left p-3 text-muted-foreground uppercase tracking-wide">Reason</th>
                    <th className="text-left p-3 text-muted-foreground uppercase tracking-wide">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logData?.entries?.map(entry => (
                    <tr key={entry.id} className="hover:bg-muted/5 transition-colors">
                      <td className={`p-3 font-semibold ${EVENT_COLORS[entry.eventType] ?? "text-muted-foreground"}`}>
                        {EVENT_LABELS[entry.eventType] ?? entry.eventType}
                      </td>
                      <td className="p-3 text-foreground">{entry.pair ?? "—"}</td>
                      <td className="p-3">
                        {entry.direction ? (
                          <span className={entry.direction === "buy" ? "text-success" : "text-destructive"}>
                            {entry.direction.toUpperCase()}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="p-3 text-right text-foreground">
                        {entry.price != null ? entry.price.toFixed(5) : "—"}
                      </td>
                      <td className="p-3 text-right">
                        {entry.slippagePips != null ? (
                          <span className="text-warning">{entry.slippagePips.toFixed(1)}p</span>
                        ) : "—"}
                      </td>
                      <td className="p-3 text-right">
                        {entry.pnl != null ? (
                          <span className={entry.pnl >= 0 ? "text-success" : "text-destructive"}>
                            {entry.pnl >= 0 ? "+" : ""}{entry.pnl.toFixed(2)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={`text-xs uppercase ${entry.mode === "live" ? "border-warning text-warning" : "border-muted-foreground text-muted-foreground"}`}>
                          {entry.mode}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground max-w-[200px] truncate">{entry.reason || "—"}</td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {format(new Date(entry.createdAt), "MMM d HH:mm:ss")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
