export type NewsEnvironment = "safe" | "cautious" | "blocked";
export type RecoveryPhase = "clear" | "recovering" | "blocked";

export interface UpcomingNewsEvent {
  title: string;
  currency: string;
  category: string;
  impact: "high" | "medium";
  minutesUntil: number;
  eventTime: string;
  isBlocking: boolean;
}

export interface RecentNewsEvent {
  title: string;
  currency: string;
  category: string;
  impact: "high" | "medium";
  minutesSince: number;
  impactScore: number;
}

export interface NewsContext {
  upcomingHighImpact: UpcomingNewsEvent[];
  nextEventMinutes: number | null;
  nextEventTitle: string | null;
  recentImpactScore: number;
  recentEvents: RecentNewsEvent[];
  recoveryPhase: RecoveryPhase;
  environment: NewsEnvironment;
  affectedPairs: string[];
  confidence: number;
}

export interface RawNewsEvent {
  title: string;
  currency: string;
  category: string;
  impact: string;
  eventTime: string | Date;
  minutesUntil: number;
  isBlocking?: boolean;
  actual?: string;
  forecast?: string;
}

const PAIR_CURRENCIES: Record<string, string[]> = {
  EURUSD: ["EUR", "USD"],
  GBPUSD: ["GBP", "USD"],
  USDJPY: ["USD", "JPY"],
};

const CATEGORY_IMPACT_WEIGHT: Record<string, number> = {
  NFP: 100,
  FOMC: 90,
  INTEREST_RATE: 85,
  CPI: 80,
  GDP: 70,
  CENTRAL_BANK_SPEECH: 65,
  OTHER: 40,
};

function isHighImpact(impact: string): boolean {
  return impact.toLowerCase() === "high";
}

function calcImpactScore(event: RawNewsEvent, minutesSince: number): number {
  const baseWeight = CATEGORY_IMPACT_WEIGHT[event.category] ?? 40;
  const decayFactor = Math.max(0, 1 - minutesSince / 60);
  return Math.round(baseWeight * decayFactor);
}

function getAffectedPairs(events: RawNewsEvent[]): string[] {
  const currencies = new Set(events.map(e => e.currency.toUpperCase()));
  const affected: string[] = [];
  for (const [pair, pairCurrencies] of Object.entries(PAIR_CURRENCIES)) {
    if (pairCurrencies.some(c => currencies.has(c))) {
      affected.push(pair);
    }
  }
  return affected;
}

function classifyRecoveryPhase(
  hasBlocking: boolean,
  recentWithinWindow: RecentNewsEvent[],
): RecoveryPhase {
  if (hasBlocking) return "blocked";
  const highImpactRecent = recentWithinWindow.filter(e => e.impactScore >= 60);
  if (highImpactRecent.length > 0) return "recovering";
  return "clear";
}

function classifyEnvironment(
  hasBlocking: boolean,
  nextEventMinutes: number | null,
  recoveryPhase: RecoveryPhase,
): NewsEnvironment {
  if (hasBlocking || recoveryPhase === "blocked") return "blocked";
  if (recoveryPhase === "recovering") return "cautious";
  if (nextEventMinutes !== null && nextEventMinutes <= 30) return "cautious";
  return "safe";
}

export function perceiveNewsContext(events: RawNewsEvent[], now?: Date): NewsContext {
  const currentTime = now ?? new Date();

  const upcoming: UpcomingNewsEvent[] = [];
  const recent: RecentNewsEvent[] = [];

  for (const event of events) {
    const eventTime = event.eventTime instanceof Date ? event.eventTime : new Date(event.eventTime);
    if (isNaN(eventTime.getTime())) continue;

    const diffMs = eventTime.getTime() - currentTime.getTime();
    const minutesUntil = diffMs / 60000;
    const minutesSince = -minutesUntil;

    if (minutesUntil >= 0 && minutesUntil <= 240) {
      if (isHighImpact(event.impact) || event.isBlocking) {
        upcoming.push({
          title: event.title,
          currency: event.currency,
          category: event.category,
          impact: isHighImpact(event.impact) ? "high" : "medium",
          minutesUntil: Math.round(minutesUntil),
          eventTime: eventTime.toISOString(),
          isBlocking: event.isBlocking ?? minutesUntil <= 30,
        });
      }
    } else if (minutesSince >= 0 && minutesSince <= 60) {
      const impactScore = calcImpactScore(event, minutesSince);
      recent.push({
        title: event.title,
        currency: event.currency,
        category: event.category,
        impact: isHighImpact(event.impact) ? "high" : "medium",
        minutesSince: Math.round(minutesSince),
        impactScore,
      });
    }
  }

  upcoming.sort((a, b) => a.minutesUntil - b.minutesUntil);
  recent.sort((a, b) => a.minutesSince - b.minutesSince);

  const nextEvent = upcoming[0] ?? null;
  const nextEventMinutes = nextEvent ? nextEvent.minutesUntil : null;
  const nextEventTitle = nextEvent ? nextEvent.title : null;

  const hasBlocking = upcoming.some(e => e.isBlocking);
  const recentImpactScore = recent.length > 0
    ? Math.round(recent.reduce((s, e) => s + e.impactScore, 0) / recent.length)
    : 0;

  const recoveryPhase = classifyRecoveryPhase(hasBlocking, recent);
  const environment = classifyEnvironment(hasBlocking, nextEventMinutes, recoveryPhase);

  const allRelevantEvents = [...upcoming.map(e => ({ ...e, minutesUntil: 0 })), ...recent.map(e => ({
    ...e, minutesUntil: 0,
  }))] as unknown as RawNewsEvent[];
  const affectedPairs = getAffectedPairs([...events].filter(e => {
    const eventTime = e.eventTime instanceof Date ? e.eventTime : new Date(e.eventTime);
    const diffMs = eventTime.getTime() - currentTime.getTime();
    const minutesUntil = diffMs / 60000;
    return minutesUntil >= -60 && minutesUntil <= 240;
  }));

  void allRelevantEvents;

  const confidence = Math.min(100, events.length > 0 ? 80 : 40);

  return {
    upcomingHighImpact: upcoming,
    nextEventMinutes,
    nextEventTitle,
    recentImpactScore,
    recentEvents: recent,
    recoveryPhase,
    environment,
    affectedPairs,
    confidence,
  };
}
