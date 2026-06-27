import { useGetBotStatus, useGetAnalyticsSummary, useListTrades, useGetActiveSignals, useStartBot, useStopBot, getGetBotStatusQueryKey } from "@workspace/api-client-react";
import { NewsCalendarWidget } from "@/components/news-calendar";
import { useQueryClient } from "@tanstack/react-query";
import { MetricCard } from "@/components/metric-card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { Play, Square, Activity, AlertTriangle, TrendingUp, Target, Zap, Cpu, Brain, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LivePositions } from "@/components/live-positions";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: botStatus, isLoading: isLoadingStatus } = useGetBotStatus({ query: { refetchInterval: 5000 } });
  const { data: analytics, isLoading: isLoadingAnalytics } = useGetAnalyticsSummary({ query: { refetchInterval: 5000 } });
  const { data: openTradesData, isLoading: isLoadingOpenTrades } = useListTrades({ status: "open" }, { query: { refetchInterval: 5000 } });
  const { data: recentTradesData, isLoading: isLoadingRecentTrades } = useListTrades({ limit: 10 }, { query: { refetchInterval: 5000 } });
  const { data: activeSignals, isLoading: isLoadingSignals } = useGetActiveSignals({ query: { refetchInterval: 5000 } });

  const startBot = useStartBot();
  const stopBot = useStopBot();

  const handleToggleBot = () => {
    if (botStatus?.running) {
      stopBot.mutate(undefined, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() }),
      });
    } else {
      startBot.mutate(
        { data: { mode: botStatus?.mode || "paper", pairs: botStatus?.activePairs?.length ? botStatus.activePairs : ["EURUSD", "GBPUSD", "USDJPY"] } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() }) },
      );
    }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "transparent", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.1))",
              border: "1px solid rgba(139,92,246,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Brain style={{ width: 16, height: 16, color: "hsl(262 80% 65%)" }} />
            </div>
            <h1 style={{
              fontSize: 20, fontWeight: 800, fontFamily: "'Inter', sans-serif",
              letterSpacing: "0.05em", textTransform: "uppercase", color: "#fff",
              margin: 0,
            }}>
              AI Terminal
            </h1>
            <div style={{
              fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
              color: "rgba(139,92,246,0.6)", letterSpacing: "0.15em",
              textTransform: "uppercase", marginTop: 2,
              padding: "2px 8px", borderRadius: 4,
              background: "rgba(139,92,246,0.08)",
              border: "1px solid rgba(139,92,246,0.15)",
            }}>
              LIVE
            </div>
          </div>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: 0, fontFamily: "'Inter', sans-serif" }}>
            Neural engine monitoring · Real-time market intelligence
          </p>
        </div>

        {/* Bot control */}
        {isLoadingStatus ? (
          <Skeleton className="w-48 h-10" />
        ) : (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 14px", borderRadius: 10,
            background: "linear-gradient(135deg, hsl(245 18% 6%), hsl(250 20% 5%))",
            border: `1px solid ${botStatus?.running ? "rgba(34,197,94,0.25)" : "rgba(139,92,246,0.2)"}`,
            boxShadow: botStatus?.running ? "0 0 20px rgba(34,197,94,0.08)" : "none",
          }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              {botStatus?.running && (
                <span style={{
                  position: "absolute", inset: 0, borderRadius: "50%",
                  background: "rgba(34,197,94,0.4)",
                  animation: "ai-node-ping 2s ease-out infinite",
                }} />
              )}
              <span style={{
                width: 10, height: 10, borderRadius: "50%", display: "block",
                background: botStatus?.running ? "hsl(142 68% 48%)" : "rgba(255,255,255,0.2)",
                boxShadow: botStatus?.running ? "0 0 8px rgba(34,197,94,0.6)" : "none",
                position: "relative",
              }} />
            </div>
            <span style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em",
              color: botStatus?.running ? "hsl(142 68% 55%)" : "rgba(255,255,255,0.5)",
            }}>
              {botStatus?.running ? "Neural Core Online" : "Offline"}
            </span>
            <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)" }} />
            <Badge variant="outline" style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              textTransform: "uppercase", letterSpacing: "0.08em",
              border: "1px solid rgba(139,92,246,0.25)",
              background: "rgba(139,92,246,0.08)",
              color: "hsl(262 80% 72%)",
            }}>
              {botStatus?.mode}
            </Badge>
            <button
              onClick={handleToggleBot}
              disabled={startBot.isPending || stopBot.isPending}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 6, cursor: "pointer",
                fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                textTransform: "uppercase", letterSpacing: "0.08em",
                border: "none", transition: "all 0.15s ease",
                ...(botStatus?.running ? {
                  background: "rgba(239,68,68,0.15)",
                  color: "hsl(0 75% 65%)",
                  border: "1px solid rgba(239,68,68,0.3)",
                } : {
                  background: "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.15))",
                  color: "hsl(262 80% 72%)",
                  border: "1px solid rgba(139,92,246,0.35)",
                }),
              }}
            >
              {botStatus?.running
                ? <><Square style={{ width: 10, height: 10 }} /> Stop</>
                : <><Play style={{ width: 10, height: 10 }} /> Start</>
              }
            </button>
          </div>
        )}
      </div>

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        <MetricCard
          title="Daily P&L"
          value={isLoadingStatus ? "..." : formatCurrency(botStatus?.dailyPnl)}
          valueClassName={botStatus?.dailyPnl && botStatus.dailyPnl > 0 ? "text-green-400" : botStatus?.dailyPnl && botStatus.dailyPnl < 0 ? "text-red-400" : ""}
          icon={<TrendingUp style={{ width: 14, height: 14 }} />}
          description="Today's realized profit"
        />
        <MetricCard
          title="Win Rate"
          value={isLoadingAnalytics ? "..." : formatPercent(analytics?.winRate)}
          icon={<Target style={{ width: 14, height: 14 }} />}
          description={`${analytics?.winningTrades || 0}W / ${analytics?.losingTrades || 0}L`}
        />
        <MetricCard
          title="Open Trades"
          value={isLoadingOpenTrades ? "..." : openTradesData?.total || 0}
          icon={<Activity style={{ width: 14, height: 14 }} />}
          description="Active positions"
        />
        <MetricCard
          title="Max Drawdown"
          value={isLoadingAnalytics ? "..." : formatPercent(analytics?.maxDrawdown)}
          valueClassName="text-yellow-400"
          icon={<AlertTriangle style={{ width: 14, height: 14 }} />}
          description="Historical peak-to-trough"
        />
      </div>

      {/* News calendar */}
      <NewsCalendarWidget />

      {/* Tabs */}
      <Tabs defaultValue="positions" className="w-full">
        <TabsList style={{
          background: "hsl(245 18% 6%)",
          border: "1px solid rgba(139,92,246,0.15)",
          borderRadius: 8, padding: 3,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em",
        }}>
          <TabsTrigger value="positions">Live Positions</TabsTrigger>
          <TabsTrigger value="signals">AI Signals</TabsTrigger>
          <TabsTrigger value="executions">Executions</TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="mt-4">
          <LivePositions />
        </TabsContent>

        <TabsContent value="signals" className="mt-4">
          <div style={{
            background: "linear-gradient(135deg, hsl(245 18% 5%), hsl(250 20% 4%))",
            border: "1px solid rgba(139,92,246,0.14)",
            borderRadius: 10, overflow: "hidden",
          }}>
            <div style={{
              padding: "12px 16px",
              borderBottom: "1px solid rgba(139,92,246,0.1)",
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(139,92,246,0.04)",
            }}>
              <Zap style={{ width: 14, height: 14, color: "hsl(262 80% 65%)" }} />
              <span style={{
                fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em",
                color: "rgba(200,185,255,0.7)",
              }}>
                Active Neural Signals
              </span>
              {Array.isArray(activeSignals) && activeSignals.length > 0 && (
                <span style={{
                  marginLeft: "auto", fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "hsl(262 80% 65%)",
                  background: "rgba(139,92,246,0.12)",
                  padding: "2px 8px", borderRadius: 4,
                  border: "1px solid rgba(139,92,246,0.2)",
                }}>
                  {activeSignals.length} active
                </span>
              )}
            </div>
            <ScrollArea style={{ height: 360 }}>
              {isLoadingSignals ? (
                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : !Array.isArray(activeSignals) || activeSignals.length === 0 ? (
                <div style={{
                  padding: 48, textAlign: "center",
                  color: "rgba(255,255,255,0.25)",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                }}>
                  <Cpu style={{ width: 28, height: 28, margin: "0 auto 10px", opacity: 0.3 }} />
                  Neural engine scanning markets…
                </div>
              ) : (
                <div>
                  {activeSignals.map(signal => (
                    <div key={signal.id} style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid rgba(139,92,246,0.06)",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      transition: "background 0.15s",
                    }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.04)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                          width: 3, height: 40, borderRadius: 2,
                          background: signal.direction === "buy" ? "hsl(142 68% 48%)" : "hsl(0 75% 58%)",
                          boxShadow: signal.direction === "buy"
                            ? "0 0 8px rgba(34,197,94,0.4)"
                            : "0 0 8px rgba(239,68,68,0.4)",
                        }} />
                        <div>
                          <div style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontWeight: 700, fontSize: 15, color: "#fff",
                          }}>
                            {signal.pair}
                          </div>
                          <div style={{
                            fontSize: 10, color: "rgba(255,255,255,0.4)",
                            fontFamily: "'JetBrains Mono', monospace",
                            textTransform: "uppercase", letterSpacing: "0.08em",
                            marginTop: 2,
                          }}>
                            {signal.session} · {signal.amdPhase}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{
                          fontSize: 11, fontWeight: 700,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: signal.direction === "buy" ? "hsl(142 68% 55%)" : "hsl(0 75% 65%)",
                          padding: "3px 10px", borderRadius: 5,
                          background: signal.direction === "buy"
                            ? "rgba(34,197,94,0.1)"
                            : "rgba(239,68,68,0.1)",
                          border: signal.direction === "buy"
                            ? "1px solid rgba(34,197,94,0.25)"
                            : "1px solid rgba(239,68,68,0.25)",
                          textTransform: "uppercase", letterSpacing: "0.08em",
                        }}>
                          {signal.direction}
                        </div>
                        <div style={{
                          marginTop: 4, fontSize: 10,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: "rgba(139,92,246,0.7)",
                        }}>
                          {formatPercent(signal.confidence)} conf.
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent value="executions" className="mt-4">
          <div style={{
            background: "linear-gradient(135deg, hsl(245 18% 5%), hsl(250 20% 4%))",
            border: "1px solid rgba(139,92,246,0.14)",
            borderRadius: 10, overflow: "hidden",
          }}>
            <div style={{
              padding: "12px 16px",
              borderBottom: "1px solid rgba(139,92,246,0.1)",
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(139,92,246,0.04)",
            }}>
              <Activity style={{ width: 14, height: 14, color: "hsl(262 80% 65%)" }} />
              <span style={{
                fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em",
                color: "rgba(200,185,255,0.7)",
              }}>
                Recent Executions
              </span>
              <Wifi style={{ width: 10, height: 10, color: "hsl(142 68% 48%)", marginLeft: "auto" }} />
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "hsl(142 68% 48%)" }}>
                live feed
              </span>
            </div>
            <ScrollArea style={{ height: 360 }}>
              {isLoadingRecentTrades ? (
                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : recentTradesData?.trades?.length === 0 ? (
                <div style={{
                  padding: 48, textAlign: "center",
                  color: "rgba(255,255,255,0.25)",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                }}>
                  No executions yet
                </div>
              ) : (
                <div>
                  {recentTradesData?.trades?.map(trade => (
                    <div key={trade.id} style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid rgba(139,92,246,0.06)",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      transition: "background 0.15s",
                    }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.04)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 3, height: 32, borderRadius: 2,
                          background: trade.direction === "buy" ? "hsl(142 68% 48%)" : "hsl(0 75% 58%)",
                        }} />
                        <div>
                          <div style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontWeight: 600, fontSize: 13, color: "#fff",
                            display: "flex", alignItems: "center", gap: 6,
                          }}>
                            {trade.pair}
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              color: trade.direction === "buy" ? "hsl(142 68% 55%)" : "hsl(0 75% 65%)",
                              textTransform: "uppercase",
                            }}>
                              {trade.direction}
                            </span>
                            {trade.closeReason && (
                              <span style={{
                                fontSize: 9, padding: "1px 5px", borderRadius: 3,
                                background: "rgba(139,92,246,0.1)",
                                border: "1px solid rgba(139,92,246,0.2)",
                                color: "hsl(262 80% 65%)",
                                fontFamily: "'JetBrains Mono', monospace",
                                textTransform: "uppercase",
                              }}>
                                {trade.closeReason === "sl_hit" ? "SL" : trade.closeReason === "tp_hit" ? "TP" : trade.closeReason}
                              </span>
                            )}
                          </div>
                          <div style={{
                            fontSize: 10, color: "rgba(255,255,255,0.35)",
                            fontFamily: "'JetBrains Mono', monospace", marginTop: 2,
                          }}>
                            {format(new Date(trade.openedAt), "HH:mm:ss")}
                            {trade.slippagePips != null && (
                              <span style={{ color: "hsl(38 90% 52%)", marginLeft: 6 }}>
                                slip {trade.slippagePips.toFixed(1)}p
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 700, fontSize: 14, textAlign: "right",
                      }}>
                        {trade.status === "closed" ? (
                          <span style={{ color: trade.pnl && trade.pnl > 0 ? "hsl(142 68% 55%)" : "hsl(0 75% 65%)" }}>
                            {trade.pnl && trade.pnl > 0 ? "+" : ""}{formatCurrency(trade.pnl)}
                          </span>
                        ) : (
                          <span style={{
                            color: "hsl(38 90% 52%)", fontSize: 10,
                            textTransform: "uppercase", letterSpacing: "0.1em",
                          }}>
                            OPEN
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
