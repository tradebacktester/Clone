import { useGetPaperPositions, useGetPaperPerformance, useCloseTrade } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/format";
import { TrendingUp, TrendingDown, Wifi, WifiOff, X, DollarSign, Gauge } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { getGetPaperPositionsQueryKey, getGetPaperPerformanceQueryKey, getListTradesQueryKey, getGetBotStatusQueryKey } from "@workspace/api-client-react";

function PipBadge({ pips }: { pips: number }) {
  const positive = pips >= 0;
  return (
    <span className={`text-xs font-mono font-semibold ${positive ? "text-success" : "text-destructive"}`}>
      {positive ? "+" : ""}{pips.toFixed(1)}p
    </span>
  );
}

function DistanceBar({ current, target, total, color }: { current: number; target: number; total: number; color: string }) {
  const pct = Math.min(100, Math.max(0, ((total - current) / total) * 100));
  return (
    <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function LivePositions() {
  const queryClient = useQueryClient();
  const { data: positions, isLoading: loadingPos } = useGetPaperPositions({
    query: { refetchInterval: 5000 },
  });
  const { data: perf, isLoading: loadingPerf } = useGetPaperPerformance({
    query: { refetchInterval: 5000 },
  });
  const closeTrade = useCloseTrade();

  const handleClose = (id: number) => {
    closeTrade.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPaperPositionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPaperPerformanceQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTradesQueryKey({ status: "open" }) });
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      },
    });
  };

  const priceAge = positions?.priceUpdatedAt
    ? formatDistanceToNow(new Date(positions.priceUpdatedAt), { addSuffix: true })
    : null;

  const isLive = positions?.priceUpdatedAt
    ? Date.now() - new Date(positions.priceUpdatedAt).getTime() < 90_000
    : false;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-muted/20 border-border">
          <CardContent className="p-4">
            <div className="text-xs font-mono uppercase text-muted-foreground mb-1">Paper Balance</div>
            {loadingPerf ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <div className="text-xl font-mono font-bold">{formatCurrency(perf?.balance)}</div>
            )}
            <div className="text-xs text-muted-foreground mt-1 font-mono">
              {loadingPerf ? "" : (
                <span className={perf && perf.totalReturn >= 0 ? "text-success" : "text-destructive"}>
                  {perf && perf.totalReturn >= 0 ? "+" : ""}{perf?.totalReturn?.toFixed(2)}%
                </span>
              )}
              {" "}from {formatCurrency(perf?.startBalance)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/20 border-border">
          <CardContent className="p-4">
            <div className="text-xs font-mono uppercase text-muted-foreground mb-1">Unrealized P&L</div>
            {loadingPos ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <div className={`text-xl font-mono font-bold ${(positions?.totalUnrealizedPnl ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                {(positions?.totalUnrealizedPnl ?? 0) >= 0 ? "+" : ""}{formatCurrency(positions?.totalUnrealizedPnl ?? 0)}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1 font-mono">
              {positions?.positions?.length ?? 0} open position{positions?.positions?.length !== 1 ? "s" : ""}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/20 border-border">
          <CardContent className="p-4">
            <div className="text-xs font-mono uppercase text-muted-foreground mb-1">Daily P&L</div>
            {loadingPerf ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <div className={`text-xl font-mono font-bold ${(perf?.dailyPnl ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                {(perf?.dailyPnl ?? 0) >= 0 ? "+" : ""}{formatCurrency(perf?.dailyPnl ?? 0)}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1 font-mono">
              {loadingPerf ? "" : `${perf?.winRate?.toFixed(1)}% win rate`}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/20 border-border">
          <CardContent className="p-4">
            <div className="text-xs font-mono uppercase text-muted-foreground mb-1">Avg Slippage</div>
            {loadingPerf ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <div className="text-xl font-mono font-bold">{perf?.avgSlippagePips?.toFixed(1) ?? "0.0"} pips</div>
            )}
            <div className="text-xs text-muted-foreground mt-1 font-mono">
              {loadingPerf ? "" : `${perf?.totalTrades ?? 0} total trades`}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader className="border-b border-border bg-muted/10 py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-mono uppercase tracking-wide flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary" />
            Live Positions
          </CardTitle>
          <div className="flex items-center gap-2 text-xs font-mono">
            {isLive ? (
              <><Wifi className="w-3 h-3 text-success" /><span className="text-success">Live</span></>
            ) : (
              <><WifiOff className="w-3 h-3 text-muted-foreground" /><span className="text-muted-foreground">Stale</span></>
            )}
            {priceAge && <span className="text-muted-foreground">{priceAge}</span>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[320px]">
            {loadingPos ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : !positions?.positions?.length ? (
              <div className="p-10 text-center text-muted-foreground font-mono text-sm">
                No open positions — start the bot to begin paper trading
              </div>
            ) : (
              <div className="divide-y divide-border">
                {positions.positions.map(pos => {
                  const isBuy = pos.direction === "buy";
                  const pnlPositive = pos.unrealizedPnl >= 0;
                  const pipSize = pos.pair.includes("JPY") ? 0.01 : 0.0001;

                  return (
                    <div key={pos.id} className="p-4 hover:bg-muted/10 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-1.5 h-12 rounded-full flex-shrink-0 ${isBuy ? "bg-success" : "bg-destructive"}`} />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-base">{pos.pair}</span>
                              <Badge
                                variant="outline"
                                className={`text-xs h-5 ${isBuy ? "text-success border-success/30 bg-success/10" : "text-destructive border-destructive/30 bg-destructive/10"}`}
                              >
                                {isBuy ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                                {pos.direction.toUpperCase()}
                              </Badge>
                              <Badge variant="outline" className="text-xs h-5 font-mono">
                                {pos.amdPattern}
                              </Badge>
                              {pos.priceSource === "live" && (
                                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse inline-block" />
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground font-mono">
                              <span>Entry: {pos.entryPrice.toFixed(pos.pair.includes("JPY") ? 3 : 5)}</span>
                              <span>Now: {pos.currentPrice ? pos.currentPrice.toFixed(pos.pair.includes("JPY") ? 3 : 5) : "—"}</span>
                              <span>{pos.lotSize.toFixed(2)} lots</span>
                              {pos.slippagePips != null && (
                                <span className="text-warning">slip: {pos.slippagePips.toFixed(1)}p</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start gap-4">
                          <div className="text-right">
                            <div className={`font-mono font-bold text-lg ${pnlPositive ? "text-success" : "text-destructive"}`}>
                              {pnlPositive ? "+" : ""}{formatCurrency(pos.unrealizedPnl)}
                            </div>
                            <div className="mt-0.5">
                              <PipBadge pips={pos.unrealizedPips} />
                            </div>
                          </div>

                          <div className="text-right text-xs font-mono space-y-1.5 min-w-[80px]">
                            <div>
                              <div className="text-muted-foreground text-[10px] uppercase">SL dist</div>
                              <div className="text-destructive/80">{pos.distanceToSL.toFixed(1)}p</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground text-[10px] uppercase">TP dist</div>
                              <div className="text-success/80">{pos.distanceToTP.toFixed(1)}p</div>
                            </div>
                          </div>

                          <div className="text-right text-xs font-mono space-y-1">
                            <div className="text-muted-foreground text-[10px] uppercase">RR</div>
                            <div>{pos.riskRewardRatio.toFixed(1)}R</div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive mt-1"
                              onClick={() => handleClose(pos.id)}
                              disabled={closeTrade.isPending}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
