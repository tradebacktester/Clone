import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Activity, Play, Pause, Square, Download, CheckCircle2, XCircle, Clock,
  TrendingUp, TrendingDown, Zap, Radio, FileText, BarChart3, Shield, AlertTriangle,
  ThumbsUp, ThumbsDown, Eye, Filter, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine } from "recharts";

const API = (path: string) => `/api${path}`;

// ─── API hooks ────────────────────────────────────────────────────────────────

function useBotStatus() {
  return useQuery({ queryKey: ["bot-status"], queryFn: () => fetch(API("/bot/status")).then(r => r.json()), refetchInterval: 5000 });
}
function useWorkspaceStats() {
  return useQuery({ queryKey: ["ws-stats"], queryFn: () => fetch(API("/paper/workspace/stats")).then(r => r.json()), refetchInterval: 10000 });
}
function useWorkspaceTrades(limit = 50) {
  return useQuery({ queryKey: ["ws-trades", limit], queryFn: () => fetch(API(`/paper/workspace/trades?limit=${limit}`)).then(r => r.json()), refetchInterval: 15000 });
}
function useWorkspaceSignals() {
  return useQuery({ queryKey: ["ws-signals"], queryFn: () => fetch(API("/paper/workspace/signals?limit=100")).then(r => r.json()), refetchInterval: 20000 });
}
function usePaperPositions() {
  return useQuery({ queryKey: ["paper-positions"], queryFn: () => fetch(API("/paper/positions")).then(r => r.json()), refetchInterval: 8000 });
}
function usePaperEquityCurve() {
  return useQuery({ queryKey: ["paper-equity"], queryFn: () => fetch(API("/paper/equity-curve")).then(r => r.json()), refetchInterval: 30000 });
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt$(v: number | null | undefined): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const s = abs >= 1000 ? abs.toFixed(0) : abs.toFixed(2);
  return (v < 0 ? "-$" : "$") + s;
}
function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(1) + "%";
}
function fmtPips(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(1) + "p";
}
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ title, value, sub, color }: { title: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <p className="text-xs font-mono uppercase text-muted-foreground tracking-wide">{title}</p>
        <p className={`text-2xl font-bold font-mono mt-1 ${color ?? ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground font-mono mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function DirectionBadge({ dir }: { dir: string }) {
  return (
    <Badge variant={dir === "buy" ? "default" : "secondary"} className={`text-[10px] px-1.5 font-mono ${dir === "buy" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
      {dir === "buy" ? "▲ BUY" : "▼ SELL"}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] font-mono">● OPEN</Badge>;
  if (status === "closed") return <Badge className="bg-muted/40 text-muted-foreground text-[10px] font-mono">CLOSED</Badge>;
  return <Badge variant="outline" className="text-[10px] font-mono">{status}</Badge>;
}

function NewsStatusBadge({ status }: { status: string | null }) {
  const s = status ?? "clear";
  if (s === "high_impact") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] font-mono">⚡ NEWS</Badge>;
  if (s === "low") return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] font-mono">NEWS</Badge>;
  return <Badge className="bg-green-500/10 text-green-400/80 border-green-500/20 text-[10px] font-mono">CLEAR</Badge>;
}

function PnlCell({ v }: { v: number | null }) {
  if (v == null) return <span className="text-muted-foreground font-mono">—</span>;
  return <span className={`font-mono font-bold ${v >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt$(v)}</span>;
}

// ─── Bot Controls ─────────────────────────────────────────────────────────────

function BotControls() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: bot } = useBotStatus();

  const mutate = useMutation({
    mutationFn: async (action: "start" | "stop" | "resume") => {
      const url = action === "start" ? "/bot/start" : action === "stop" ? "/bot/stop" : "/bot/resume";
      const opts: RequestInit = { method: "POST", headers: { "Content-Type": "application/json" } };
      if (action === "start") opts.body = JSON.stringify({ mode: "paper" });
      const r = await fetch(API(url), opts);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (_, action) => {
      toast({ title: action === "start" ? "Bot started in paper mode" : action === "stop" ? "Bot paused" : "Bot resumed" });
      qc.invalidateQueries({ queryKey: ["bot-status"] });
      qc.invalidateQueries({ queryKey: ["ws-stats"] });
    },
    onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }),
  });

  const running = bot?.running;
  const halted  = bot?.haltedDueToRisk;

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono ${running ? "bg-green-500/15 text-green-400" : "bg-muted/30 text-muted-foreground"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${running ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
        {running ? (halted ? "HALTED" : "RUNNING") : "OFFLINE"}
      </div>
      <Badge variant="outline" className="text-[10px] font-mono">paper</Badge>
      {!running && !halted && (
        <Button size="sm" className="h-7 gap-1 text-xs font-mono bg-green-600 hover:bg-green-700" onClick={() => mutate.mutate("start")} disabled={mutate.isPending}>
          <Play className="w-3 h-3" /> START
        </Button>
      )}
      {running && !halted && (
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs font-mono" onClick={() => mutate.mutate("stop")} disabled={mutate.isPending}>
          <Pause className="w-3 h-3" /> PAUSE
        </Button>
      )}
      {halted && (
        <Button size="sm" className="h-7 gap-1 text-xs font-mono" onClick={() => mutate.mutate("resume")} disabled={mutate.isPending}>
          <Play className="w-3 h-3" /> RESUME
        </Button>
      )}
    </div>
  );
}

// ─── Review Modal ─────────────────────────────────────────────────────────────

interface ReviewModalProps {
  trade: Record<string, unknown> | null;
  onClose: () => void;
}

function ReviewModal({ trade, onClose }: ReviewModalProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [agreement, setAgreement] = useState<"agree" | "disagree" | null>(
    (trade?.review as Record<string, unknown> | null)?.agreement as "agree" | "disagree" | null ?? null
  );
  const [reason, setReason]       = useState(((trade?.review as Record<string, unknown> | null)?.reason as string) ?? "");
  const [confidence, setConf]     = useState(String(((trade?.review as Record<string, unknown> | null)?.confidence as number) ?? ""));
  const [notes, setNotes]         = useState(((trade?.review as Record<string, unknown> | null)?.notes as string) ?? "");

  const save = useMutation({
    mutationFn: async () => {
      if (!agreement) throw new Error("Select agree or disagree");
      if (agreement === "disagree" && !reason.trim()) throw new Error("Reason is required when disagreeing");
      const r = await fetch(API(`/paper/workspace/review/${trade?.id}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agreement,
          reason: reason.trim() || undefined,
          confidence: confidence ? parseFloat(confidence) : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Review saved" });
      qc.invalidateQueries({ queryKey: ["ws-trades"] });
      qc.invalidateQueries({ queryKey: ["ws-stats"] });
      onClose();
    },
    onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }),
  });

  if (!trade) return null;

  const t = trade as {
    id: number; pair: string; direction: string; status: string;
    entryPrice: number; stopLoss: number; takeProfit: number; closedPrice: number | null;
    pnl: number | null; regime: string | null; newsStatus: string | null;
    amdPattern: string; session: string; confidence: number; tqi: number | null;
    tqiGrade: string | null; slippagePips: number | null; spreadPips: number | null;
    riskRewardRatio: number; openedAt: string | null; closedAt: string | null;
    ruleEvaluation: Record<string, Record<string, unknown>> | null;
    explanation: Record<string, unknown> | null; closeReason: string | null;
    review: Record<string, unknown> | null;
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm uppercase tracking-wide flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Trader Review — Trade #{t.id} {t.pair}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Trade Summary */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2 grid grid-cols-4 gap-2 p-3 bg-muted/10 rounded border border-border/30">
              <div><p className="text-xs text-muted-foreground font-mono">PAIR</p><p className="font-mono font-bold">{t.pair}</p></div>
              <div><p className="text-xs text-muted-foreground font-mono">DIR</p><DirectionBadge dir={t.direction} /></div>
              <div><p className="text-xs text-muted-foreground font-mono">PNL</p><PnlCell v={t.pnl} /></div>
              <div><p className="text-xs text-muted-foreground font-mono">STATUS</p><StatusBadge status={t.status} /></div>
            </div>
            <div className="p-3 bg-muted/10 rounded border border-border/30 space-y-1">
              <p className="text-xs text-muted-foreground font-mono uppercase">Entry Data</p>
              <div className="flex justify-between text-xs font-mono"><span className="text-muted-foreground">Entry</span><span>{t.entryPrice?.toFixed(5)}</span></div>
              <div className="flex justify-between text-xs font-mono"><span className="text-muted-foreground">Stop Loss</span><span className="text-red-400">{t.stopLoss?.toFixed(5)}</span></div>
              <div className="flex justify-between text-xs font-mono"><span className="text-muted-foreground">Take Profit</span><span className="text-green-400">{t.takeProfit?.toFixed(5)}</span></div>
              {t.closedPrice && <div className="flex justify-between text-xs font-mono"><span className="text-muted-foreground">Closed At</span><span>{t.closedPrice?.toFixed(5)}</span></div>}
            </div>
            <div className="p-3 bg-muted/10 rounded border border-border/30 space-y-1">
              <p className="text-xs text-muted-foreground font-mono uppercase">Context</p>
              <div className="flex justify-between text-xs font-mono"><span className="text-muted-foreground">Regime</span><span className="capitalize">{t.regime ?? "—"}</span></div>
              <div className="flex justify-between text-xs font-mono"><span className="text-muted-foreground">Session</span><span className="capitalize">{t.session}</span></div>
              <div className="flex justify-between text-xs font-mono"><span className="text-muted-foreground">AMD</span><span>{t.amdPattern}</span></div>
              <div className="flex justify-between text-xs font-mono"><span className="text-muted-foreground">Confidence</span><span>{t.confidence?.toFixed(0)}%</span></div>
              <div className="flex justify-between text-xs font-mono"><span className="text-muted-foreground">TQI</span><span>{t.tqi?.toFixed(0) ?? "—"} {t.tqiGrade ? `(${t.tqiGrade})` : ""}</span></div>
              <div className="flex justify-between text-xs font-mono"><span className="text-muted-foreground">R:R</span><span>{t.riskRewardRatio?.toFixed(2)}</span></div>
            </div>
          </div>

          {/* Execution Details */}
          <div className="p-3 bg-muted/10 rounded border border-border/30 space-y-1">
            <p className="text-xs text-muted-foreground font-mono uppercase mb-2">Execution Details</p>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <div className="flex justify-between"><span className="text-muted-foreground">Spread</span><span>{fmtPips(t.spreadPips)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Entry Slip</span><span>{fmtPips(t.slippagePips)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">News</span><NewsStatusBadge status={t.newsStatus} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono mt-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Opened</span><span>{fmtTime(t.openedAt)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Closed</span><span>{fmtTime(t.closedAt)}</span></div>
            </div>
            {t.closeReason && <div className="text-xs font-mono mt-1"><span className="text-muted-foreground">Close Reason: </span><span>{t.closeReason.replace("_", " ").toUpperCase()}</span></div>}
          </div>

          {/* Rule Evaluation */}
          {t.ruleEvaluation && (
            <div className="p-3 bg-muted/10 rounded border border-border/30">
              <p className="text-xs text-muted-foreground font-mono uppercase mb-2">Rule Evaluation</p>
              <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
                {Object.entries(t.ruleEvaluation).map(([key, val]) => {
                  const passed = (val as Record<string, unknown>).passed as boolean;
                  return (
                    <div key={key} className="flex items-center gap-1.5">
                      {passed ? <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" /> : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                      <span className={passed ? "text-foreground" : "text-muted-foreground"}>{key.replace(/Gate|Safe/, "").replace(/([A-Z])/g, " $1").trim()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Agree / Disagree */}
          <div>
            <Label className="text-xs font-mono uppercase text-muted-foreground">Your Assessment</Label>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setAgreement("agree")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded border text-sm font-mono transition-all ${agreement === "agree" ? "bg-green-500/20 border-green-500/50 text-green-400" : "border-border/50 text-muted-foreground hover:border-green-500/30"}`}
              >
                <ThumbsUp className="w-4 h-4" /> I agree with this trade
              </button>
              <button
                onClick={() => setAgreement("disagree")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded border text-sm font-mono transition-all ${agreement === "disagree" ? "bg-red-500/20 border-red-500/50 text-red-400" : "border-border/50 text-muted-foreground hover:border-red-500/30"}`}
              >
                <ThumbsDown className="w-4 h-4" /> I disagree
              </button>
            </div>
          </div>

          {agreement === "disagree" && (
            <div className="space-y-3 border-l-2 border-red-500/30 pl-3">
              <div>
                <Label className="text-xs font-mono uppercase text-muted-foreground">Reason <span className="text-red-400">*</span></Label>
                <Textarea
                  className="mt-1.5 font-mono text-sm bg-muted/10 border-border/50 min-h-[80px]"
                  placeholder="Why do you disagree? (e.g. regime wasn't favourable, news risk was too high…)"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs font-mono uppercase text-muted-foreground">Your Confidence <span className="text-muted-foreground">(0–100)</span></Label>
                <Input
                  type="number" min={0} max={100}
                  className="mt-1.5 font-mono text-sm bg-muted/10 border-border/50 w-32"
                  placeholder="e.g. 75"
                  value={confidence}
                  onChange={e => setConf(e.target.value)}
                />
              </div>
            </div>
          )}

          {agreement && (
            <div>
              <Label className="text-xs font-mono uppercase text-muted-foreground">Optional Notes</Label>
              <Textarea
                className="mt-1.5 font-mono text-sm bg-muted/10 border-border/50 min-h-[60px]"
                placeholder="Any additional observations…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} className="font-mono text-xs">Cancel</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !agreement} className="font-mono text-xs">
            {save.isPending ? "Saving…" : "Save Review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Trade Row ────────────────────────────────────────────────────────────────

function TradeRow({ trade, onReview }: { trade: Record<string, unknown>; onReview: (t: Record<string, unknown>) => void }) {
  const [expanded, setExpanded] = useState(false);
  const t = trade as {
    id: number; pair: string; direction: string; status: string;
    entryPrice: number; stopLoss: number; takeProfit: number; closedPrice: number | null;
    pnl: number | null; regime: string | null; newsStatus: string | null;
    amdPattern: string; session: string; confidence: number; tqi: number | null;
    slippagePips: number | null; spreadPips: number | null; riskRewardRatio: number;
    openedAt: string | null; closedAt: string | null; closeReason: string | null;
    review: Record<string, unknown> | null;
  };

  const rv = t.review;
  return (
    <>
      <tr className="border-b border-border/20 hover:bg-muted/5 transition-colors cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <td className="p-2 text-xs font-mono text-muted-foreground">#{t.id}</td>
        <td className="p-2 font-mono font-bold text-sm">{t.pair}</td>
        <td className="p-2"><DirectionBadge dir={t.direction} /></td>
        <td className="p-2"><StatusBadge status={t.status} /></td>
        <td className="p-2 font-mono text-xs text-right">{t.entryPrice?.toFixed(5)}</td>
        <td className="p-2 font-mono text-xs text-right text-red-400">{t.stopLoss?.toFixed(5)}</td>
        <td className="p-2 font-mono text-xs text-right text-green-400">{t.takeProfit?.toFixed(5)}</td>
        <td className="p-2 text-right"><PnlCell v={t.pnl} /></td>
        <td className="p-2 text-xs font-mono text-muted-foreground">{t.amdPattern}</td>
        <td className="p-2"><NewsStatusBadge status={t.newsStatus} /></td>
        <td className="p-2 text-xs font-mono text-muted-foreground">{fmtRelative(t.openedAt)}</td>
        <td className="p-2">
          {rv ? (
            <Badge className={`text-[10px] font-mono ${rv.agreement === "agree" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              {rv.agreement === "agree" ? "✓ Agree" : "✗ Disagree"}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">Pending</Badge>
          )}
        </td>
        <td className="p-2">
          <Button size="sm" variant="outline" className="h-6 text-[10px] font-mono px-2 gap-1"
            onClick={e => { e.stopPropagation(); onReview(trade); }}>
            <Eye className="w-3 h-3" /> Review
          </Button>
        </td>
        <td className="p-2 text-muted-foreground">{expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</td>
      </tr>
      {expanded && (
        <tr className="bg-muted/5 border-b border-border/20">
          <td colSpan={14} className="px-4 py-3">
            <div className="grid grid-cols-4 gap-3 text-xs font-mono">
              <div className="space-y-1">
                <p className="text-muted-foreground uppercase">Execution</p>
                <p>Spread: {fmtPips(t.spreadPips)}</p>
                <p>Slippage: {fmtPips(t.slippagePips)}</p>
                <p>R:R: {t.riskRewardRatio?.toFixed(2)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground uppercase">Context</p>
                <p>Regime: {t.regime ?? "—"}</p>
                <p>Session: {t.session}</p>
                <p>Conf: {t.confidence?.toFixed(0)}%</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground uppercase">Timing</p>
                <p>Open: {fmtTime(t.openedAt)}</p>
                <p>Close: {fmtTime(t.closedAt)}</p>
                <p>Reason: {t.closeReason?.replace("_", " ") ?? "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground uppercase">Quality</p>
                <p>TQI: {t.tqi?.toFixed(0) ?? "—"}</p>
                {rv && <p className={rv.agreement === "agree" ? "text-green-400" : "text-red-400"}>
                  Review: {rv.agreement as string} {rv.confidence ? `(${rv.confidence}% conf)` : ""}
                </p>}
                {rv?.reason && <p className="text-muted-foreground italic truncate">{rv.reason as string}</p>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Signal Row ───────────────────────────────────────────────────────────────

function SignalRow({ sig }: { sig: Record<string, unknown> }) {
  const s = sig as {
    id: number; pair: string; direction: string; confidence: number;
    amdPhase: string; zoneType: string; regime: string | null; newsStatus: string | null;
    session: string; executed: boolean; skipReason: string | null;
    entryPrice: number | null; riskReward: number | null; generatedAt: string | null;
  };
  return (
    <tr className="border-b border-border/20 hover:bg-muted/5 text-xs font-mono">
      <td className="p-2 text-muted-foreground">{fmtRelative(s.generatedAt)}</td>
      <td className="p-2 font-bold">{s.pair}</td>
      <td className="p-2"><DirectionBadge dir={s.direction} /></td>
      <td className="p-2">{s.confidence?.toFixed(0)}%</td>
      <td className="p-2">{s.amdPhase}</td>
      <td className="p-2 text-muted-foreground capitalize">{s.regime ?? "—"}</td>
      <td className="p-2"><NewsStatusBadge status={s.newsStatus} /></td>
      <td className="p-2 capitalize">{s.session}</td>
      <td className="p-2">
        {s.executed ? (
          <Badge className="bg-green-500/20 text-green-400 text-[10px]">Executed</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">{s.skipReason?.replace(/_/g, " ") ?? "Skipped"}</Badge>
        )}
      </td>
    </tr>
  );
}

// ─── Open Positions ───────────────────────────────────────────────────────────

function OpenPositions() {
  const { data, isLoading } = usePaperPositions();
  const positions = data?.positions ?? [];

  if (isLoading) return <div className="animate-pulse h-32 bg-muted/10 rounded" />;
  if (positions.length === 0) return (
    <div className="flex items-center justify-center h-24 text-muted-foreground text-sm font-mono border border-dashed border-border/30 rounded">
      No open positions
    </div>
  );

  return (
    <div className="space-y-2">
      {positions.map((p: Record<string, unknown>) => {
        const pos = p as { id: number; pair: string; direction: string; entryPrice: number; currentPrice: number | null; unrealizedPnl: number; unrealizedPips: number; distanceToSL: number; distanceToTP: number; session: string; openedAt: string; };
        const pnlColor = pos.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400";
        return (
          <div key={pos.id} className="flex items-center justify-between p-3 bg-muted/10 rounded border border-border/30 text-xs font-mono">
            <div className="flex items-center gap-3">
              <div className="font-bold text-sm">{pos.pair}</div>
              <DirectionBadge dir={pos.direction} />
              <span className="text-muted-foreground">@ {pos.entryPrice?.toFixed(5)}</span>
              <span className="text-muted-foreground capitalize">{pos.session}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-muted-foreground">SL dist</p>
                <p className="text-red-400">{pos.distanceToSL?.toFixed(1)}p</p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground">TP dist</p>
                <p className="text-green-400">{pos.distanceToTP?.toFixed(1)}p</p>
              </div>
              <div className="text-right min-w-[80px]">
                <p className="text-muted-foreground">Unrealized</p>
                <p className={`font-bold ${pnlColor}`}>{fmt$(pos.unrealizedPnl)} ({pos.unrealizedPips?.toFixed(1)}p)</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PaperTrading() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: stats, isLoading: loadingStats } = useWorkspaceStats();
  const { data: tradesData, isLoading: loadingTrades } = useWorkspaceTrades(100);
  const { data: signalsData, isLoading: loadingSignals } = useWorkspaceSignals();
  const { data: equity } = usePaperEquityCurve();
  const [reviewTrade, setReviewTrade] = useState<Record<string, unknown> | null>(null);
  const [tradeFilter, setTradeFilter] = useState<"all" | "open" | "closed">("all");
  const [reviewFilter, setReviewFilter] = useState<"all" | "unreviewed" | "agree" | "disagree">("all");

  const trades = (tradesData?.trades ?? []) as Record<string, unknown>[];
  const signals = (signalsData?.signals ?? []) as Record<string, unknown>[];
  const equityCurve = equity?.curve ?? [];

  const filteredTrades = trades.filter(t => {
    if (tradeFilter !== "all" && t["status"] !== tradeFilter) return false;
    if (reviewFilter === "unreviewed" && t["review"] != null) return false;
    if (reviewFilter === "agree" && (t["review"] as Record<string, unknown> | null)?.agreement !== "agree") return false;
    if (reviewFilter === "disagree" && (t["review"] as Record<string, unknown> | null)?.agreement !== "disagree") return false;
    return true;
  });

  const handleExport = useCallback(async (fmt: "csv" | "json") => {
    try {
      const r = await fetch(API(`/paper/workspace/export/${fmt}`));
      if (!r.ok) throw new Error("Export failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `paper-trades.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Exported as ${fmt.toUpperCase()}` });
    } catch (e) {
      toast({ title: "Export failed", description: String(e), variant: "destructive" });
    }
  }, [toast]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ws-stats"] });
    qc.invalidateQueries({ queryKey: ["ws-trades"] });
    qc.invalidateQueries({ queryKey: ["ws-signals"] });
    qc.invalidateQueries({ queryKey: ["paper-positions"] });
  };

  const s = stats ?? {};

  const dailyData = equityCurve.slice(-14).map((e: Record<string, unknown>) => ({
    date: String(e["closedAt"] ?? "").slice(5, 10),
    pnl: Number(e["pnl"] ?? 0),
  }));

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Paper Trading Workspace
          </h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">Live simulation — no real trades executed</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <BotControls />
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs font-mono" onClick={refresh}>
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs font-mono" onClick={() => handleExport("csv")}>
            <Download className="w-3 h-3" /> CSV
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs font-mono" onClick={() => handleExport("json")}>
            <Download className="w-3 h-3" /> JSON
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatCard title="Total Trades" value={loadingStats ? "…" : (s["totalTrades"] ?? 0)} />
        <StatCard title="Win Rate" value={loadingStats ? "…" : fmtPct(s["winRate"] as number)} color={(s["winRate"] as number) >= 50 ? "text-green-400" : "text-red-400"} />
        <StatCard title="Profit Factor" value={loadingStats ? "…" : (s["profitFactor"] as number ?? 0).toFixed(2)} color={(s["profitFactor"] as number) >= 1 ? "text-green-400" : "text-red-400"} />
        <StatCard title="Agreement Rate" value={loadingStats ? "…" : s["agreementRate"] != null ? fmtPct(s["agreementRate"] as number) : "—"} sub={`${s["totalReviewed"] ?? 0} reviewed`} />
        <StatCard title="Bot Mistakes" value={loadingStats ? "…" : (s["botMistakes"] ?? 0)} sub="Disagreed trades" color={(s["botMistakes"] as number) > 0 ? "text-orange-400" : ""} />
        <StatCard title="Total P&L" value={loadingStats ? "…" : fmt$(s["totalPnl"] as number)} color={(s["totalPnl"] as number) >= 0 ? "text-green-400" : "text-red-400"} />
        <StatCard title="Daily P&L" value={loadingStats ? "…" : fmt$(s["dailyPnl"] as number)} color={(s["dailyPnl"] as number) >= 0 ? "text-green-400" : "text-red-400"} sub="Today" />
        <StatCard title="Weekly P&L" value={loadingStats ? "…" : fmt$(s["weeklyPnl"] as number)} color={(s["weeklyPnl"] as number) >= 0 ? "text-green-400" : "text-red-400"} sub="This week" />
      </div>

      {/* Signal Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border bg-card">
          <CardContent className="p-3 flex items-center gap-3">
            <Radio className="w-4 h-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground font-mono">Total Signals</p>
              <p className="font-bold font-mono">{loadingStats ? "…" : (s["totalSignals"] ?? 0)}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-muted-foreground font-mono">Executed</p>
              <p className="font-bold font-mono text-green-400">{loadingStats ? "…" : (s["executedSignals"] ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3 flex items-center gap-3">
            <ThumbsUp className="w-4 h-4 text-green-400" />
            <div>
              <p className="text-xs text-muted-foreground font-mono">Agreed</p>
              <p className="font-bold font-mono text-green-400">{loadingStats ? "…" : (s["agreeCount"] ?? 0)}</p>
            </div>
            <ThumbsDown className="w-4 h-4 text-red-400 ml-4" />
            <div>
              <p className="text-xs text-muted-foreground font-mono">Disagreed</p>
              <p className="font-bold font-mono text-red-400">{loadingStats ? "…" : (s["botMistakes"] ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-3 flex items-center gap-3">
            <Shield className="w-4 h-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground font-mono">Paper Mode Safety</p>
              <p className="font-bold font-mono text-green-400 text-xs">REAL TRADES BLOCKED</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="positions">
        <TabsList className="font-mono text-xs uppercase">
          <TabsTrigger value="positions" className="gap-1"><Activity className="w-3 h-3" /> Live Positions</TabsTrigger>
          <TabsTrigger value="trades" className="gap-1"><FileText className="w-3 h-3" /> Trade Log</TabsTrigger>
          <TabsTrigger value="signals" className="gap-1"><Radio className="w-3 h-3" /> Signal Log</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1"><BarChart3 className="w-3 h-3" /> Analytics</TabsTrigger>
        </TabsList>

        {/* Live Positions */}
        <TabsContent value="positions" className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 border-b border-border/10">
              <CardTitle className="text-sm font-mono uppercase tracking-wide flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-400 animate-pulse" />
                Live Open Positions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <OpenPositions />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trade Log */}
        <TabsContent value="trades" className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">Status:</span>
            {(["all", "open", "closed"] as const).map(f => (
              <button key={f} onClick={() => setTradeFilter(f)}
                className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${tradeFilter === f ? "bg-primary/20 border-primary/50 text-primary" : "border-border/30 text-muted-foreground hover:border-border"}`}>
                {f}
              </button>
            ))}
            <span className="text-xs font-mono text-muted-foreground ml-3">Review:</span>
            {(["all", "unreviewed", "agree", "disagree"] as const).map(f => (
              <button key={f} onClick={() => setReviewFilter(f)}
                className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${reviewFilter === f ? "bg-primary/20 border-primary/50 text-primary" : "border-border/30 text-muted-foreground hover:border-border"}`}>
                {f}
              </button>
            ))}
            <span className="ml-auto text-xs font-mono text-muted-foreground">{filteredTrades.length} trades</span>
          </div>

          <Card className="border-border bg-card">
            <CardContent className="p-0">
              {loadingTrades ? (
                <div className="animate-pulse p-8 text-center text-muted-foreground font-mono text-sm">Loading trades…</div>
              ) : filteredTrades.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground font-mono text-sm">No trades match the filter</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/20 border-b border-border">
                      <tr className="text-xs font-mono text-muted-foreground uppercase">
                        <th className="p-2 text-left">#</th>
                        <th className="p-2 text-left">Pair</th>
                        <th className="p-2 text-left">Dir</th>
                        <th className="p-2 text-left">Status</th>
                        <th className="p-2 text-right">Entry</th>
                        <th className="p-2 text-right">SL</th>
                        <th className="p-2 text-right">TP</th>
                        <th className="p-2 text-right">P&L</th>
                        <th className="p-2 text-left">AMD</th>
                        <th className="p-2 text-left">News</th>
                        <th className="p-2 text-left">Time</th>
                        <th className="p-2 text-left">Review</th>
                        <th className="p-2"></th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrades.map(t => (
                        <TradeRow key={t["id"] as number} trade={t} onReview={setReviewTrade} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Signal Log */}
        <TabsContent value="signals">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 border-b border-border/10">
              <CardTitle className="text-sm font-mono uppercase tracking-wide flex items-center justify-between">
                <span className="flex items-center gap-2"><Radio className="w-4 h-4 text-primary" /> All Signals (Auto-Logged)</span>
                <span className="text-xs text-muted-foreground font-normal">{signals.length} signals</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingSignals ? (
                <div className="animate-pulse p-8 text-center text-muted-foreground font-mono text-sm">Loading signals…</div>
              ) : signals.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground font-mono text-sm">No signals logged yet. Start the bot to begin analysis.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/20 border-b border-border">
                      <tr className="text-xs font-mono text-muted-foreground uppercase">
                        <th className="p-2 text-left">Time</th>
                        <th className="p-2 text-left">Pair</th>
                        <th className="p-2 text-left">Dir</th>
                        <th className="p-2 text-left">Conf</th>
                        <th className="p-2 text-left">AMD</th>
                        <th className="p-2 text-left">Regime</th>
                        <th className="p-2 text-left">News</th>
                        <th className="p-2 text-left">Session</th>
                        <th className="p-2 text-left">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {signals.map(s => <SignalRow key={s["id"] as number} sig={s} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Equity Curve */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase tracking-wide">Equity Curve</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="h-[220px]">
                  {equityCurve.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No data yet</div>
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
                        <XAxis dataKey="closedAt" tickFormatter={(v) => String(v ?? "").slice(5, 10)} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 9 }} />
                        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 9 }} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [fmt$(v), "Balance"]} />
                        <ReferenceLine y={equity?.initialBalance} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                        <Area type="monotone" dataKey="balance" stroke="hsl(var(--primary))" fill="url(#eqGrad)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Daily P&L Bar */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 border-b border-border/10">
                <CardTitle className="text-sm font-mono uppercase tracking-wide">Daily P&L (Last 14 Trades)</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="h-[220px]">
                  {dailyData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">No data yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 9 }} />
                        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 9 }} tickFormatter={(v) => fmt$(v)} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [fmt$(v), "P&L"]} />
                        <ReferenceLine y={0} stroke="hsl(var(--border))" />
                        <Bar dataKey="pnl" radius={[2,2,0,0]}>
                          {dailyData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "hsl(142, 70%, 45%)" : "hsl(0, 70%, 50%)"} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Agreement breakdown */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 border-b border-border/10">
              <CardTitle className="text-sm font-mono uppercase tracking-wide">Performance Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-mono uppercase text-muted-foreground">Balance</p>
                  <p className="font-mono font-bold text-lg">{fmt$(s["balance"] as number)}</p>
                  <p className="text-xs font-mono text-muted-foreground">Started at $10,000</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-mono uppercase text-muted-foreground">Signals → Trades</p>
                  <p className="font-mono font-bold text-lg">{s["executedSignals"] ?? 0} / {s["totalSignals"] ?? 0}</p>
                  <p className="text-xs font-mono text-muted-foreground">Execution rate</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-mono uppercase text-muted-foreground">Reviewed</p>
                  <p className="font-mono font-bold text-lg">{s["totalReviewed"] ?? 0} / {s["totalTrades"] ?? 0}</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    {s["agreeCount"] ?? 0} agree · {s["botMistakes"] ?? 0} disagree
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-mono uppercase text-muted-foreground">Agreement Rate</p>
                  <p className={`font-mono font-bold text-lg ${(s["agreementRate"] as number) >= 70 ? "text-green-400" : "text-orange-400"}`}>
                    {s["agreementRate"] != null ? fmtPct(s["agreementRate"] as number) : "—"}
                  </p>
                  <p className="text-xs font-mono text-muted-foreground">Target: &gt;70%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Modal */}
      {reviewTrade && <ReviewModal trade={reviewTrade} onClose={() => setReviewTrade(null)} />}
    </div>
  );
}
