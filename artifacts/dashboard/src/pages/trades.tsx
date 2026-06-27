import { useListTrades } from "@workspace/api-client-react";
import { useState } from "react";
import { formatCurrency, formatPrice, formatPercent } from "@/lib/format";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListTradesStatus } from "@workspace/api-client-react/src/generated/api.schemas";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle, Clock, Info } from "lucide-react";

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

interface RuleResult {
  rule: string;
  passed: boolean;
  score: number;
  threshold: number;
  weight: string;
}

interface MtfAlignmentDetail {
  timeframe: string;
  role: string;
  direction: string | null;
  status: "aligned" | "neutral" | "opposed" | "unavailable";
}

interface TradeExplanation {
  summary: string;
  whyTaken: string[];
  rulesPassed: RuleResult[];
  rulesNearlyFailed: RuleResult[];
  confidenceBreakdown: { factor: string; contribution: number }[];
  riskAssessment: {
    lotSize: number;
    riskPct: number;
    riskAmount: number;
    stopLossPips: number;
    rr: number;
  };
  mtfAlignment: MtfAlignmentDetail[];
  tqiBreakdown: {
    component: string;
    score: number;
    maxScore: number;
    description: string;
  }[];
  tqi: number;
  tqiGrade: string;
  generatedAt: string;
}

function useTradeExplanation(tradeId: number | null) {
  const [data, setData] = useState<TradeExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<number | null>(null);

  async function load(id: number) {
    if (loadedId === id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trades/${id}/explanation`);
      if (res.status === 404) {
        const body = await res.json();
        setError(body.error ?? "No explanation available.");
        setData(null);
      } else if (!res.ok) {
        setError("Failed to load explanation.");
        setData(null);
      } else {
        const json = await res.json();
        setData(json as TradeExplanation);
        setError(null);
      }
    } catch {
      setError("Network error loading explanation.");
      setData(null);
    } finally {
      setLoading(false);
      setLoadedId(id);
    }
  }

  return { data, loading, error, load, loadedId };
}

function TqiGradeBadge({ grade }: { grade: string }) {
  const color =
    grade === "A" ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" :
    grade === "B" ? "text-blue-400 border-blue-500/40 bg-blue-500/10" :
    grade === "C" ? "text-yellow-400 border-yellow-500/40 bg-yellow-500/10" :
    "text-destructive border-destructive/40 bg-destructive/10";
  return <Badge variant="outline" className={cn("font-mono text-sm px-3 py-1", color)}>{grade}</Badge>;
}

function ScoreBar({ score, max, label }: { score: number; max: number; label?: string }) {
  const pct = Math.min(100, Math.round((score / max) * 100));
  const color = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-500" : pct >= 30 ? "bg-yellow-500" : "bg-destructive";
  return (
    <div className="flex items-center gap-2 w-full">
      {label && <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">{label}</span>}
      <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground w-14 text-right shrink-0">{score}/{max}</span>
    </div>
  );
}

function MtfStatus({ status }: { status: MtfAlignmentDetail["status"] }) {
  if (status === "aligned") return <span className="text-emerald-400 font-mono text-xs">✓ Aligned</span>;
  if (status === "neutral") return <span className="text-muted-foreground font-mono text-xs">~ Neutral</span>;
  if (status === "opposed") return <span className="text-destructive font-mono text-xs">✗ Opposed</span>;
  return <span className="text-muted-foreground/50 font-mono text-xs">— N/A</span>;
}

function ExplanationPanel({ tradeId }: { tradeId: number }) {
  const { data, loading, error, load, loadedId } = useTradeExplanation(tradeId);

  if (loadedId !== tradeId && !loading) {
    load(tradeId);
  }

  return (
    <div className="bg-background/60 border-t border-border/30 px-6 py-5 space-y-6">
      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm font-mono">{error}</p>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Summary */}
          <div>
            <p className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-2">Decision Summary</p>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-sm text-foreground">{data.summary}</span>
              <TqiGradeBadge grade={data.tqiGrade} />
              <span className="font-mono text-xs text-muted-foreground">TQI {data.tqi.toFixed(0)}/100</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Why This Trade Was Taken */}
            <div>
              <p className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-3">Why This Trade Was Taken</p>
              <ul className="space-y-2">
                {data.whyTaken.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-sm text-foreground/90">{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Risk Assessment */}
            <div>
              <p className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-3">Risk & Sizing</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-mono">Lot Size</span>
                  <span className="font-mono">{data.riskAssessment.lotSize.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-mono">Risk %</span>
                  <span className="font-mono">{data.riskAssessment.riskPct.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-mono">Risk Amount</span>
                  <span className="font-mono">${data.riskAssessment.riskAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-mono">Stop Loss</span>
                  <span className="font-mono">{data.riskAssessment.stopLossPips.toFixed(1)} pips</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-mono">Risk:Reward</span>
                  <span className="font-mono text-emerald-400">{data.riskAssessment.rr.toFixed(1)}:1</span>
                </div>
              </div>
            </div>
          </div>

          {/* Gate Rules */}
          <div>
            <p className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-3">Gate Rules — Every Rule Evaluated</p>
            <div className="space-y-2">
              {data.rulesPassed.map((rule, i) => {
                const nearlyFailed = data.rulesNearlyFailed.some(r => r.rule === rule.rule);
                return (
                  <div key={i} className="flex items-center gap-3">
                    {nearlyFailed
                      ? <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                      : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-mono truncate">{rule.rule}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-mono text-muted-foreground">{rule.weight}</span>
                          <span className={cn(
                            "text-xs font-mono px-1.5 py-0.5 rounded",
                            nearlyFailed ? "bg-yellow-500/15 text-yellow-400" : "bg-emerald-500/15 text-emerald-400"
                          )}>
                            {rule.score.toFixed(0)} ≥ {rule.threshold}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {data.rulesNearlyFailed.length > 0 && (
              <p className="text-xs text-yellow-500/80 font-mono mt-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />
                {data.rulesNearlyFailed.length} rule{data.rulesNearlyFailed.length > 1 ? "s" : ""} passed by a narrow margin (&lt;12 points).
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* TQI Component Breakdown */}
            <div>
              <p className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-3">TQI Component Scores</p>
              <div className="space-y-3">
                {data.tqiBreakdown.map((c, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs font-mono text-muted-foreground mb-1">
                      <span>{c.component}</span>
                      <span className="text-foreground/70">{c.description}</span>
                    </div>
                    <ScoreBar score={c.score} max={c.maxScore} />
                  </div>
                ))}
              </div>
            </div>

            {/* MTF Alignment */}
            <div>
              <p className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-3">Multi-Timeframe Alignment</p>
              <div className="space-y-2">
                {data.mtfAlignment.map((tf, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm">{tf.timeframe}</span>
                      <span className="text-xs text-muted-foreground font-mono ml-2">({tf.role})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted-foreground capitalize">{tf.direction ?? "—"}</span>
                      <MtfStatus status={tf.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Confidence Factors */}
          <div>
            <p className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-3">Confluence Factor Contributions</p>
            <div className="flex flex-wrap gap-2">
              {data.confidenceBreakdown.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-muted/30 border border-border/40 rounded px-2 py-1">
                  <span className="text-xs font-mono text-foreground/80">{f.factor}</span>
                  <span className="text-xs font-mono text-emerald-400">+{f.contribution}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground/50">
            <Clock className="h-3 w-3" />
            <span className="text-xs font-mono">Explanation generated at {format(new Date(data.generatedAt), "yyyy-MM-dd HH:mm:ss 'UTC'")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Trades() {
  const [status, setStatus] = useState<ListTradesStatus | "all">("all");
  const [expandedTradeId, setExpandedTradeId] = useState<number | null>(null);

  const { data, isLoading } = useListTrades({
    status: status === "all" ? undefined : status,
    limit: 50
  });

  function toggleExpand(id: number) {
    setExpandedTradeId(prev => prev === id ? null : id);
  }

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight">Trade Journal</h1>
          <p className="text-muted-foreground text-sm mt-1">Detailed history, execution logs, and per-trade decision explanations.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as ListTradesStatus | "all")}>
            <SelectTrigger className="w-[150px] font-mono">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-card-border overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="border-border/50">
              <TableHead className="w-8" />
              <TableHead className="font-mono uppercase text-xs">Date</TableHead>
              <TableHead className="font-mono uppercase text-xs">Pair</TableHead>
              <TableHead className="font-mono uppercase text-xs">Side</TableHead>
              <TableHead className="font-mono uppercase text-xs text-right">Entry</TableHead>
              <TableHead className="font-mono uppercase text-xs text-right">Close</TableHead>
              <TableHead className="font-mono uppercase text-xs text-right">P&L</TableHead>
              <TableHead className="font-mono uppercase text-xs">Status</TableHead>
              <TableHead className="font-mono uppercase text-xs">Session</TableHead>
              <TableHead className="font-mono uppercase text-xs text-right">TQI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                </TableRow>
              ))
            ) : data?.trades?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-32 text-center text-muted-foreground font-mono">
                  No trades found for current filters.
                </TableCell>
              </TableRow>
            ) : (
              data?.trades?.map((trade) => {
                const isExpanded = expandedTradeId === trade.id;
                const tradeAny = trade as typeof trade & { tqi?: number; tqiGrade?: string };
                return (
                  <>
                    <TableRow
                      key={trade.id}
                      className={cn(
                        "border-border/30 hover:bg-muted/20 cursor-pointer transition-colors",
                        isExpanded && "bg-muted/10 border-border/60"
                      )}
                      onClick={() => toggleExpand(trade.id)}
                    >
                      <TableCell className="pl-4">
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(trade.openedAt), 'MMM dd, HH:mm')}
                      </TableCell>
                      <TableCell className="font-bold font-mono">{trade.pair}</TableCell>
                      <TableCell>
                        <span className={cn(
                          "font-mono font-medium text-xs uppercase",
                          trade.direction === 'buy' ? 'text-success' : 'text-destructive'
                        )}>
                          {trade.direction}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-right">{formatPrice(trade.entryPrice, trade.pair)}</TableCell>
                      <TableCell className="font-mono text-sm text-right">{trade.closedPrice ? formatPrice(trade.closedPrice, trade.pair) : '-'}</TableCell>
                      <TableCell className="font-mono text-sm text-right">
                        {trade.status === 'closed' ? (
                          <span className={trade.pnl && trade.pnl > 0 ? 'text-success' : trade.pnl && trade.pnl < 0 ? 'text-destructive' : 'text-muted-foreground'}>
                            {trade.pnl && trade.pnl > 0 ? '+' : ''}{formatCurrency(trade.pnl)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          "font-mono text-xs capitalize",
                          trade.status === 'open' ? 'text-warning border-warning/50 bg-warning/10' :
                          trade.status === 'closed' ? 'text-muted-foreground border-border bg-muted/10' :
                          'text-destructive border-destructive/50 bg-destructive/10'
                        )}>
                          {trade.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground uppercase">{trade.session}</TableCell>
                      <TableCell className="font-mono text-xs text-right">
                        {tradeAny.tqiGrade ? (
                          <span className={cn(
                            "font-mono font-bold",
                            tradeAny.tqiGrade === 'A' ? 'text-emerald-400' :
                            tradeAny.tqiGrade === 'B' ? 'text-blue-400' :
                            tradeAny.tqiGrade === 'C' ? 'text-yellow-400' :
                            'text-muted-foreground'
                          )}>
                            {tradeAny.tqiGrade}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${trade.id}-explanation`} className="hover:bg-transparent">
                        <TableCell colSpan={10} className="p-0">
                          <ExplanationPanel tradeId={trade.id} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="text-xs text-muted-foreground font-mono text-center">
        Click any trade row to expand its full decision explanation — every rule evaluated, confidence score, MTF alignment, and risk assessment.
      </div>
    </div>
  );
}
