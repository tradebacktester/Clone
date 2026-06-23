import { useListBacktests } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatPercent } from "@/lib/format";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Play } from "lucide-react";

export default function Backtest() {
  const { data: backtests, isLoading } = useListBacktests();

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight">Backtesting</h1>
          <p className="text-muted-foreground text-sm mt-1">Run historical data simulations to validate strategies.</p>
        </div>
        <Button className="font-mono uppercase">
          <Play className="w-4 h-4 mr-2" /> New Backtest
        </Button>
      </div>

      <Card className="bg-card border-card-border">
        <CardHeader className="bg-muted/10 border-b border-border py-3">
          <CardTitle className="text-sm font-mono uppercase tracking-wide">Historical Results</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {isLoading ? (
              <div className="p-4 space-y-4"><Skeleton className="h-10 w-full"/><Skeleton className="h-10 w-full"/></div>
            ) : backtests?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground font-mono text-sm">No backtests run yet.</div>
            ) : (
              backtests?.map((bt) => (
                <div key={bt.id} className="p-4 grid grid-cols-6 items-center hover:bg-muted/10 text-sm font-mono">
                  <div className="col-span-2">
                    <div className="font-bold text-base">{bt.pair}</div>
                    <div className="text-xs text-muted-foreground">{bt.startDate} to {bt.endDate}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs uppercase">Trades</div>
                    <div>{bt.totalTrades}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs uppercase">Win Rate</div>
                    <div>{formatPercent(bt.winRate)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs uppercase">Max DD</div>
                    <div className="text-warning">{formatPercent(bt.maxDrawdown)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-muted-foreground text-xs uppercase">Total P&L</div>
                    <div className={`font-bold ${bt.totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {bt.totalPnl >= 0 ? '+' : ''}{formatCurrency(bt.totalPnl)}
                    </div>
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
