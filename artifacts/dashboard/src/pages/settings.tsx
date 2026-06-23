import { useGetBotConfig, useGetRiskSettings, useListBrokerAccounts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge, Save } from "lucide-react";

export default function Settings() {
  const { data: config, isLoading: isLoadingConfig } = useGetBotConfig();
  const { data: risk, isLoading: isLoadingRisk } = useGetRiskSettings();
  const { data: brokers, isLoading: isLoadingBrokers } = useListBrokerAccounts();

  return (
    <div className="flex-1 overflow-auto bg-background p-6 space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono uppercase tracking-tight">Configuration</h1>
          <p className="text-muted-foreground text-sm mt-1">System parameters and risk controls.</p>
        </div>
        <Button className="font-mono uppercase bg-primary text-primary-foreground">
          <Save className="w-4 h-4 mr-2" /> Save Changes
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-card-border">
          <CardHeader className="bg-muted/10 border-b border-border py-3">
            <CardTitle className="text-sm font-mono uppercase tracking-wide">Trading Parameters</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {isLoadingConfig ? <Skeleton className="h-32 w-full" /> : (
              <>
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase text-muted-foreground">Active Pairs (Comma separated)</Label>
                  <Input defaultValue={config?.pairs.join(", ")} className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase text-muted-foreground">Trading Sessions</Label>
                  <Input defaultValue={config?.sessions.join(", ")} className="font-mono" />
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <Label className="font-mono text-xs uppercase">News Filter Enabled</Label>
                  <Switch checked={config?.newsFilterEnabled} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="font-mono text-xs uppercase">Manual Confirmation Required</Label>
                  <Switch checked={config?.confirmationRequired} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

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
                    <Input type="number" defaultValue={risk?.riskPerTrade} className="font-mono" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase text-muted-foreground">Max Open Trades</Label>
                    <Input type="number" defaultValue={risk?.maxOpenTrades} className="font-mono" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase text-muted-foreground">Max Daily Loss (%)</Label>
                    <Input type="number" defaultValue={risk?.maxDailyLoss} className="font-mono text-destructive" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-mono text-xs uppercase text-muted-foreground">Max Weekly Loss (%)</Label>
                    <Input type="number" defaultValue={risk?.maxWeeklyLoss} className="font-mono text-destructive" />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <Label className="font-mono text-xs uppercase">Trailing Stop</Label>
                  <Switch checked={risk?.useTrailingStop} />
                </div>
              </>
            )}
          </CardContent>
        </Card>

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
                      {broker.paperTrading && <Badge variant="outline" className="text-warning border-warning">PAPER</Badge>}
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${broker.active ? 'bg-success' : 'bg-destructive'}`} />
                        <span className="font-mono text-xs uppercase text-muted-foreground">{broker.active ? 'Connected' : 'Disconnected'}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {(!brokers || brokers.length === 0) && (
                   <div className="p-8 text-center text-muted-foreground font-mono text-sm">No brokers configured</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
