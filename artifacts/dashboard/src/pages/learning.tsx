import { useGetLearningStats, useGetSetupScores } from "@workspace/api-client-react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent } from "@/lib/format";

export default function Learning() {
  const { data: stats, isLoading: isLoadingStats } = useGetLearningStats();
  const { data: scores, isLoading: isLoadingScores } = useGetSetupScores();

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight">RL Learning Engine</h1>
          <p className="text-muted-foreground text-sm mt-1">Reinforcement learning agent state and pattern confidence.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard title="Episode" value={isLoadingStats ? "..." : stats?.episode || 0} />
        <MetricCard title="Avg Reward" value={isLoadingStats ? "..." : stats?.avgReward?.toFixed(3) || "0.000"} />
        <MetricCard title="Epsilon (Exploration)" value={isLoadingStats ? "..." : stats?.epsilon?.toFixed(4) || "0.0000"} />
        <MetricCard title="Analyzed Trades" value={isLoadingStats ? "..." : stats?.tradesAnalyzed || 0} />
      </div>

      <Card className="bg-card border-card-border">
        <CardHeader className="bg-muted/10 border-b border-border py-3">
          <CardTitle className="text-sm font-mono uppercase tracking-wide">Pattern Confidence Scores</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {isLoadingScores ? (
              <div className="p-4 space-y-4"><Skeleton className="h-10 w-full"/><Skeleton className="h-10 w-full"/></div>
            ) : scores?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground font-mono text-sm">No setup data available</div>
            ) : (
              scores?.map((score, i) => (
                <div key={i} className="p-4 grid grid-cols-4 items-center hover:bg-muted/10">
                  <div className="font-mono font-medium capitalize col-span-1">{score.pattern}</div>
                  <div className="col-span-2">
                    <div className="flex items-center justify-between text-xs font-mono text-muted-foreground mb-1">
                      <span>Confidence</span>
                      <span>{formatPercent(score.confidence * 100)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary" 
                        style={{ width: `${score.confidence * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right font-mono text-sm col-span-1">
                    WR: {formatPercent(score.winRate)}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
