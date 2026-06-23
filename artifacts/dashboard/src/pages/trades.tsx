import { useListTrades } from "@workspace/api-client-react";
import { useState } from "react";
import { formatCurrency, formatPrice, formatPercent } from "@/lib/format";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { ListTradesStatus } from "@workspace/api-client-react/src/generated/api.schemas";

export default function Trades() {
  const [status, setStatus] = useState<ListTradesStatus | "all">("all");
  
  const { data, isLoading } = useListTrades({
    status: status === "all" ? undefined : status,
    limit: 50
  });

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight">Trade Journal</h1>
          <p className="text-muted-foreground text-sm mt-1">Detailed history and execution logs.</p>
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
              <TableHead className="font-mono uppercase text-xs">Date</TableHead>
              <TableHead className="font-mono uppercase text-xs">Pair</TableHead>
              <TableHead className="font-mono uppercase text-xs">Side</TableHead>
              <TableHead className="font-mono uppercase text-xs text-right">Entry</TableHead>
              <TableHead className="font-mono uppercase text-xs text-right">Close</TableHead>
              <TableHead className="font-mono uppercase text-xs text-right">P&L</TableHead>
              <TableHead className="font-mono uppercase text-xs">Status</TableHead>
              <TableHead className="font-mono uppercase text-xs">Session</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                </TableRow>
              ))
            ) : data?.trades?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground font-mono">
                  No trades found for current filters.
                </TableCell>
              </TableRow>
            ) : (
              data?.trades?.map((trade) => (
                <TableRow key={trade.id} className="border-border/30 hover:bg-muted/20 cursor-pointer">
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
