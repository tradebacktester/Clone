import { useGetNewsEvents, useGetNewsStatus, useGetNewsCalendar } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, Calendar, Shield, ShieldOff,
  TrendingUp, Landmark, BarChart2, Mic2, DollarSign, FileText,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { NewsEventCategory, NewsEventBlockingPhase } from "@workspace/api-client-react";

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  NFP:                { label: "NFP",           icon: <TrendingUp className="w-3 h-3" />,  color: "text-orange-500" },
  CPI:                { label: "CPI",           icon: <BarChart2 className="w-3 h-3" />,   color: "text-blue-500" },
  FOMC:               { label: "FOMC",          icon: <Landmark className="w-3 h-3" />,    color: "text-red-500" },
  INTEREST_RATE:      { label: "Rate",          icon: <DollarSign className="w-3 h-3" />, color: "text-purple-500" },
  GDP:                { label: "GDP",           icon: <BarChart2 className="w-3 h-3" />,   color: "text-green-500" },
  CENTRAL_BANK_SPEECH:{ label: "CB Speech",    icon: <Mic2 className="w-3 h-3" />,        color: "text-yellow-500" },
  OTHER:              { label: "Other",         icon: <FileText className="w-3 h-3" />,    color: "text-muted-foreground" },
};

function CategoryBadge({ category }: { category: string }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.OTHER!;
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-xs ${meta.color}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

function ImpactBadge({ impact }: { impact: string }) {
  if (impact === "high") {
    return (
      <Badge variant="outline" className="text-destructive border-destructive/40 bg-destructive/10 font-mono text-xs">
        HIGH
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-warning border-warning/40 bg-warning/10 font-mono text-xs">
      MED
    </Badge>
  );
}

function PhaseBadge({ phase }: { phase: string }) {
  if (phase === "pre_event") {
    return <span className="text-xs font-mono text-yellow-500 uppercase">Pre-Event</span>;
  }
  if (phase === "active") {
    return <span className="text-xs font-mono text-destructive uppercase font-bold animate-pulse">Live</span>;
  }
  if (phase === "post_event") {
    return <span className="text-xs font-mono text-orange-400 uppercase">Post-Event</span>;
  }
  return null;
}

function BlockingBadge({ blocked }: { blocked: boolean }) {
  if (blocked) {
    return (
      <div className="flex items-center gap-1 text-destructive">
        <ShieldOff className="w-3 h-3" />
        <span className="text-xs font-mono uppercase">Blocked</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-success">
      <Shield className="w-3 h-3" />
      <span className="text-xs font-mono uppercase">Clear</span>
    </div>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 0) return "now";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function NewsCalendarWidget() {
  const { data: newsData, isLoading: isLoadingEvents } = useGetNewsEvents(
    { hours: 24 },
    { query: { refetchInterval: 5 * 60 * 1000 } }
  );
  const { data: statusData, isLoading: isLoadingStatus } = useGetNewsStatus({
    query: { refetchInterval: 60_000 },
  });

  const events = newsData?.events ?? [];
  const statusItems = statusData?.items ?? [];
  const anyBlocked = statusItems.some(s => s.blocked);

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b border-border bg-muted/10 py-3">
        <CardTitle className="text-sm font-mono uppercase tracking-wide flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Economic Calendar
          </span>
          {!isLoadingStatus && (
            <span className="flex items-center gap-1">
              {anyBlocked ? (
                <span className="flex items-center gap-1 text-destructive text-xs">
                  <AlertTriangle className="w-3 h-3" /> Trading Paused
                </span>
              ) : (
                <span className="text-success text-xs flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Clear
                </span>
              )}
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        {/* Pair status row */}
        {isLoadingStatus ? (
          <div className="p-3 flex gap-3">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-20" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-4 px-4 py-2 border-b border-border bg-muted/5">
            {statusItems.map(item => (
              <div key={item.pair} className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold">{item.pair}</span>
                <BlockingBadge blocked={item.blocked} />
                {item.blocked && item.category && (
                  <CategoryBadge category={item.category} />
                )}
                {item.nextEventIn !== null && item.nextEventIn !== undefined && !item.blocked && (
                  <span className="text-muted-foreground text-xs font-mono">
                    next {formatMinutes(item.nextEventIn)}
                  </span>
                )}
              </div>
            ))}
            {statusItems.length === 0 && (
              <span className="text-muted-foreground text-xs font-mono">Loading pair status…</span>
            )}
          </div>
        )}

        {/* Event list */}
        <div className="divide-y divide-border max-h-[280px] overflow-y-auto">
          {isLoadingEvents ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : events.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground font-mono text-xs">
              No high-impact events in the next 24h
            </div>
          ) : (
            events.map(event => (
              <div
                key={event.id}
                className={`flex items-center justify-between px-4 py-2 text-xs transition-colors ${
                  event.isBlocking ? "bg-destructive/5 border-l-2 border-l-destructive" : "hover:bg-muted/20"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 flex flex-col gap-0.5">
                    <ImpactBadge impact={event.impact} />
                    <CategoryBadge category={event.category} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono font-medium truncate">{event.title}</div>
                    <div className="text-muted-foreground font-mono">
                      {event.currency} · {format(parseISO(event.eventTime), "HH:mm 'UTC'")}
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right ml-3 space-y-0.5">
                  {event.isBlocking ? (
                    <div>
                      <span className="text-destructive font-mono font-bold block">BLOCKING</span>
                      <PhaseBadge phase={event.blockingPhase} />
                    </div>
                  ) : (
                    <span className="text-muted-foreground font-mono">
                      in {formatMinutes(event.minutesUntil)}
                    </span>
                  )}
                  {event.forecast && (
                    <div className="text-muted-foreground/70 mt-0.5">
                      F: {event.forecast}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {newsData?.fetchedAt && (
          <div className="px-4 py-1.5 border-t border-border bg-muted/5 flex justify-between items-center">
            <span className="text-muted-foreground/60 text-xs font-mono capitalize">
              via {newsData.source ?? "unknown"}
            </span>
            <span className="text-muted-foreground/60 text-xs font-mono">
              updated {format(parseISO(newsData.fetchedAt), "HH:mm")}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function NewsCalendarFullView() {
  const { data, isLoading } = useGetNewsCalendar({
    query: { refetchInterval: 10 * 60 * 1000 },
  });

  const days = data?.days ?? [];

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b border-border bg-muted/10 py-3">
        <CardTitle className="text-sm font-mono uppercase tracking-wide flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          Weekly Economic Calendar
          <span className="text-muted-foreground/60 text-xs font-normal capitalize">
            {data ? `via ${data.source}` : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : days.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground font-mono text-xs">
            No events found
          </div>
        ) : (
          <div className="divide-y divide-border">
            {days.map(day => (
              <div key={day.date}>
                <div className="px-4 py-1.5 bg-muted/10 border-b border-border">
                  <span className="font-mono text-xs font-bold text-muted-foreground uppercase">
                    {format(parseISO(day.date), "EEEE, MMM d")}
                  </span>
                </div>
                <div className="divide-y divide-border/50">
                  {day.events.map(event => (
                    <div
                      key={event.id}
                      className={`flex items-center justify-between px-4 py-2 text-xs ${
                        event.isBlocking ? "bg-destructive/5 border-l-2 border-l-destructive" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0 flex flex-col gap-0.5 w-16">
                          <ImpactBadge impact={event.impact} />
                          <CategoryBadge category={event.category} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-mono font-medium truncate">{event.title}</div>
                          <div className="text-muted-foreground font-mono">
                            {event.currency} · {format(parseISO(event.eventTime), "HH:mm 'UTC'")}
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right ml-3">
                        {event.isBlocking ? (
                          <div>
                            <span className="text-destructive font-mono font-bold block">BLOCKING</span>
                            <PhaseBadge phase={event.blockingPhase} />
                          </div>
                        ) : event.minutesUntil > 0 ? (
                          <span className="text-muted-foreground font-mono">
                            in {formatMinutes(event.minutesUntil)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 font-mono text-xs">past</span>
                        )}
                        <div className="flex gap-2 mt-0.5">
                          {event.forecast && (
                            <span className="text-muted-foreground/70">F: {event.forecast}</span>
                          )}
                          {event.previous && (
                            <span className="text-muted-foreground/50">P: {event.previous}</span>
                          )}
                          {event.actual && (
                            <span className="text-primary/80 font-bold">A: {event.actual}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {data?.fetchedAt && (
          <div className="px-4 py-1.5 border-t border-border bg-muted/5">
            <span className="text-muted-foreground/60 text-xs font-mono">
              updated {format(parseISO(data.fetchedAt), "HH:mm")}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
