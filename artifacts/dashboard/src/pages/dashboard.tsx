import { useGetBotStatus, useGetAnalyticsSummary, useListTrades, useGetActiveSignals, useStartBot, useStopBot, getGetBotStatusQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { MetricCard } from "@/components/metric-card";
import { formatCurrency, formatPercent, formatPips } from "@/lib/format";
import { Play, Square, Activity, AlertTriangle, TrendingUp, TrendingDown, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: botStatus, isLoading: isLoadingStatus } = useGetBotStatus({
    query: { refetchInterval: 5000 }
  });
  const { data: analytics, isLoading: isLoadingAnalytics } = useGetAnalyticsSummary({
    query: { refetchInterval: 5000 }
  });
  const { data: openTradesData, isLoading: isLoadingOpenTrades } = useListTrades({ status: "open" }, {
    query: { refetchInterval: 5000 }
  });
  const { data: recentTradesData, isLoading: isLoadingRecentTrades } = useListTrades({ limit: 10 }, {
    query: { refetchInterval: 5000 }
  });
  const { data: activeSignals, isLoading: isLoadingSignals } = useGetActiveSignals({
    query: { refetchInterval: 5000 }
  });

  const startBot = useStartBot();
  const stopBot = useStopBot();

  const handleToggleBot = () => {
    if (botStatus?.running) {
      stopBot.mutate(undefined, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() })
      });
    } else {
      startBot.mutate({ data: { mode: botStatus?.mode || 'paper', pairs: botStatus?.activePairs || [] } }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() })
      });
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Terminal Overview
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Live market data and bot performance.</p>
        </div>
        
        <div className="flex items-center gap-4">
          {isLoadingStatus ? (
            <Skeleton className="w-32 h-10" />
          ) : (
            <div className="flex items-center gap-3 bg-muted px-4 py-2 rounded-md border border-border">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  {botStatus?.running && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${botStatus?.running ? 'bg-success' : 'bg-muted-foreground'}`}></span>
                </span>
                <span className="text-sm font-mono font-medium uppercase">
                  {botStatus?.running ? "Online" : "Offline"}
                </span>
              </div>
              <div className="h-4 w-[1px] bg-border mx-1" />
              <Badge variant="outline" className="font-mono bg-background">
                {botStatus?.mode}
              </Badge>
              <Button 
                size="sm" 
                variant={botStatus?.running ? "destructive" : "default"}
                className="ml-2 h-7 font-mono uppercase text-xs"
                onClick={handleToggleBot}
                disabled={startBot.isPending || stopBot.isPending}
              >
                {botStatus?.running ? (
                  <><Square className="w-3 h-3 mr-1" /> Stop</>
                ) : (
                  <><Play className="w-3 h-3 mr-1" /> Start</>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Daily P&L"
          value={isLoadingStatus ? "..." : formatCurrency(botStatus?.dailyPnl)}
          valueClassName={botStatus?.dailyPnl && botStatus.dailyPnl > 0 ? "text-success" : botStatus?.dailyPnl && botStatus.dailyPnl < 0 ? "text-destructive" : ""}
          icon={<TrendingUp className="w-4 h-4" />}
          description="Today's realized profit"
        />
        <MetricCard
          title="Win Rate"
          value={isLoadingAnalytics ? "..." : formatPercent(analytics?.winRate)}
          icon={<Target className="w-4 h-4" />}
          description={`${analytics?.winningTrades || 0}W / ${analytics?.losingTrades || 0}L`}
        />
        <MetricCard
          title="Open Trades"
          value={isLoadingOpenTrades ? "..." : openTradesData?.total || 0}
          icon={<Activity className="w-4 h-4" />}
          description="Active positions"
        />
        <MetricCard
          title="Max Drawdown"
          value={isLoadingAnalytics ? "..." : formatPercent(analytics?.maxDrawdown)}
          valueClassName="text-warning"
          icon={<AlertTriangle className="w-4 h-4" />}
          description="Historical peak-to-trough"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="border-b border-border bg-muted/10 py-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wide flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Active Trade Signals
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            <ScrollArea className="h-[300px]">
              {isLoadingSignals ? (
                <div className="p-4 space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : activeSignals?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground font-mono text-sm">No active signals</div>
              ) : (
                <div className="divide-y divide-border">
                  {activeSignals?.map(signal => (
                    <div key={signal.id} className="p-4 hover:bg-muted/20 transition-colors flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-2 h-10 rounded-full ${signal.direction === 'buy' ? 'bg-success' : 'bg-destructive'}`} />
                        <div>
                          <div className="font-mono font-bold text-lg">{signal.pair}</div>
                          <div className="text-xs text-muted-foreground font-mono uppercase">
                            {signal.session} • {signal.amdPhase}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className={signal.direction === 'buy' ? 'text-success border-success/30 bg-success/10' : 'text-destructive border-destructive/30 bg-destructive/10'}>
                          {signal.direction.toUpperCase()}
                        </Badge>
                        <div className="mt-1 text-xs font-mono text-muted-foreground">
                          Conf: {formatPercent(signal.confidence)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="border-b border-border bg-muted/10 py-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">Recent Executions</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            <ScrollArea className="h-[300px]">
              {isLoadingRecentTrades ? (
                <div className="p-4 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : recentTradesData?.trades?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground font-mono text-sm">No recent trades</div>
              ) : (
                <div className="divide-y divide-border">
                  {recentTradesData?.trades?.slice(0, 5).map(trade => (
                    <div key={trade.id} className="p-3 text-sm hover:bg-muted/20 flex justify-between items-center">
                      <div>
                        <div className="font-mono font-medium">{trade.pair} <span className={trade.direction === 'buy' ? 'text-success' : 'text-destructive'}>{trade.direction.toUpperCase()}</span></div>
                        <div className="text-xs text-muted-foreground">{format(new Date(trade.openedAt), 'HH:mm:ss')}</div>
                      </div>
                      <div className="text-right font-mono">
                        {trade.status === 'closed' ? (
                          <span className={trade.pnl && trade.pnl > 0 ? 'text-success' : 'text-destructive'}>
                            {trade.pnl && trade.pnl > 0 ? '+' : ''}{formatCurrency(trade.pnl)}
                          </span>
                        ) : (
                          <span className="text-warning">OPEN</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
