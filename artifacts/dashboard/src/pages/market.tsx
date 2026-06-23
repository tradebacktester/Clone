import { useGetMarketZones, useGetMarketRegime, useGetActiveSignals } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";

export default function Market() {
  const { data: zones, isLoading: isLoadingZones } = useGetMarketZones();
  const { data: regime, isLoading: isLoadingRegime } = useGetMarketRegime();
  
  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight">Market Analysis</h1>
          <p className="text-muted-foreground text-sm mt-1">Supply/Demand zones and regime detection.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card border-card-border">
          <CardHeader className="bg-muted/10 border-b border-border py-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">Market Regime</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {isLoadingRegime ? <Skeleton className="h-20 w-full" /> : (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-mono text-sm">State</span>
                  <Badge variant="outline" className="font-mono uppercase bg-primary/10 text-primary border-primary/30">
                    {regime?.regime || "UNKNOWN"}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-mono text-sm">Trend</span>
                  <span className={`font-mono uppercase font-bold ${regime?.trend === 'bullish' ? 'text-success' : regime?.trend === 'bearish' ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {regime?.trend || "NEUTRAL"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-mono text-sm">Volatility</span>
                  <span className="font-mono text-warning uppercase">{regime?.volatility || "NORMAL"}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 bg-card border-card-border">
          <CardHeader className="bg-muted/10 border-b border-border py-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">Active S/D Zones</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {isLoadingZones ? (
                <div className="p-4 space-y-4"><Skeleton className="h-10 w-full"/><Skeleton className="h-10 w-full"/></div>
              ) : zones?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground font-mono text-sm">No active zones detected</div>
              ) : (
                zones?.map(zone => (
                  <div key={zone.id} className="p-4 flex items-center justify-between hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-2 h-10 rounded-full ${zone.zoneType === 'demand' ? 'bg-success' : 'bg-destructive'}`} />
                      <div>
                        <div className="font-mono font-bold">{zone.pair} <span className="text-xs text-muted-foreground font-normal">{zone.timeframe}</span></div>
                        <div className="text-xs font-mono text-muted-foreground mt-1">
                          {formatPrice(zone.priceBottom, zone.pair)} - {formatPrice(zone.priceTop, zone.pair)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className={zone.zoneType === 'demand' ? 'text-success border-success/30' : 'text-destructive border-destructive/30'}>
                        {zone.zoneType.toUpperCase()}
                      </Badge>
                      <div className="mt-1 text-xs font-mono text-muted-foreground">
                        Strength: {zone.strength}/10
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
