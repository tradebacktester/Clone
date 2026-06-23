import { useGetAnalyticsSummary, useGetEquityCurve, useGetMonthlyPnl } from "@workspace/api-client-react";
import { MetricCard } from "@/components/metric-card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

export default function Analytics() {
  const { data: summary, isLoading: isLoadingSummary } = useGetAnalyticsSummary();
  const { data: equityData, isLoading: isLoadingEquity } = useGetEquityCurve({ period: '30d' });
  const { data: monthlyData, isLoading: isLoadingMonthly } = useGetMonthlyPnl();

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight">Performance Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Deep dive into historical bot performance.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard title="Total P&L" value={isLoadingSummary ? "..." : formatCurrency(summary?.totalPnl)} />
        <MetricCard title="Win Rate" value={isLoadingSummary ? "..." : formatPercent(summary?.winRate)} />
        <MetricCard title="Profit Factor" value={isLoadingSummary ? "..." : summary?.profitFactor.toFixed(2) || "0.00"} />
        <MetricCard title="Expectancy" value={isLoadingSummary ? "..." : formatCurrency(summary?.expectancy)} />
        <MetricCard title="Avg R:R" value={isLoadingSummary ? "..." : `1:${summary?.avgRr?.toFixed(2) || "0.00"}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-card-border bg-card">
          <CardHeader className="pb-2 border-b border-border/10 bg-muted/5">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">Equity Curve (30d)</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px] w-full">
              {isLoadingEquity ? (
                <div className="w-full h-full animate-pulse bg-muted/20 rounded" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityData || []}>
                    <defs>
                      <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12}
                      tickFormatter={(val) => `$${val}`}
                      tickLine={false}
                      axisLine={false}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '4px', fontFamily: 'monospace' }}
                      formatter={(value: number) => [formatCurrency(value), "Equity"]}
                      labelFormatter={(label) => new Date(label).toLocaleDateString()}
                    />
                    <Area type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorEquity)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-card-border bg-card">
          <CardHeader className="pb-2 border-b border-border/10 bg-muted/5">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">Monthly P&L</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px] w-full">
              {isLoadingMonthly ? (
                <div className="w-full h-full animate-pulse bg-muted/20 rounded" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis 
                      dataKey="month" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12}
                      tickFormatter={(val) => `$${val}`}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '4px', fontFamily: 'monospace' }}
                      formatter={(value: number) => [formatCurrency(value), "P&L"]}
                    />
                    <Bar 
                      dataKey="pnl" 
                      radius={[4, 4, 0, 0]}
                    >
                      {
                        monthlyData?.map((entry, index) => (
                          <cell key={`cell-${index}`} fill={entry.pnl >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
