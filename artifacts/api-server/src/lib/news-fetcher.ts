/**
 * News calendar fetcher — pulls ForexFactory's public JSON feed, caches for 1h,
 * and exposes blocking/status helpers for the /news routes.
 *
 * Covers: NFP, CPI, FOMC, Interest Rate Decisions, GDP, Central Bank Speeches.
 * Blocks trading 30 min before, during, and 30 min after high-impact events.
 */

import { logger } from "./logger.js";

const BLOCK_WINDOW_MS = 30 * 60 * 1000;
const CACHE_TTL_MS = 60 * 60 * 1000;

const FF_WEEKS = ["thisweek", "nextweek"] as const;
const FF_BASE = "https://nfs.faireconomy.media/ff_calendar_{week}.json";

const PAIR_CURRENCIES: Record<string, string[]> = {
  EURUSD: ["EUR", "USD"],
  GBPUSD: ["GBP", "USD"],
  USDJPY: ["USD", "JPY"],
  AUDUSD: ["AUD", "USD"],
  USDCAD: ["USD", "CAD"],
  USDCHF: ["USD", "CHF"],
  NZDUSD: ["NZD", "USD"],
  GBPJPY: ["GBP", "JPY"],
  EURJPY: ["EUR", "JPY"],
  EURGBP: ["EUR", "GBP"],
};

const COUNTRY_CURRENCY: Record<string, string> = {
  USD: "USD", EUR: "EUR", GBP: "GBP", JPY: "JPY",
  AUD: "AUD", CAD: "CAD", CHF: "CHF", NZD: "NZD",
};

export type EventCategory =
  | "NFP"
  | "CPI"
  | "FOMC"
  | "INTEREST_RATE"
  | "GDP"
  | "CENTRAL_BANK_SPEECH"
  | "OTHER";

const EVENT_CATEGORY_KEYWORDS: Record<Exclude<EventCategory, "OTHER">, string[]> = {
  NFP: ["non-farm", "nfp", "nonfarm"],
  CPI: ["cpi", "consumer price index", "core cpi", "core inflation"],
  FOMC: ["fomc", "federal open market", "federal funds rate"],
  INTEREST_RATE: [
    "interest rate decision", "rate decision",
    "cash rate", "deposit facility rate", "bank rate",
    "overnight rate", "monetary policy decision", "base rate",
  ],
  GDP: ["gdp", "gross domestic product"],
  CENTRAL_BANK_SPEECH: [
    "press conference", "powell", "lagarde", "bailey", "ueda",
    "monetary policy statement", "fed chair", "ecb president",
    "governor speaks", "central bank governor", "governor speech",
  ],
};

const HIGH_IMPACT_KEYWORDS = [
  "non-farm", "nfp", "employment change", "unemployment rate",
  "cpi", "consumer price", "inflation",
  "fomc", "federal funds rate", "interest rate decision", "rate decision",
  "gdp", "gross domestic product",
  "ecb", "boe", "boj", "rba", "rbnz", "snb", "boc",
  "central bank", "monetary policy statement",
  "pce", "core pce", "retail sales",
  "ism manufacturing", "ism services",
  "press conference", "powell", "lagarde", "bailey", "ueda",
  "cash rate", "bank rate", "overnight rate", "deposit facility rate",
];

function categorizeEvent(title: string): EventCategory {
  const lower = title.toLowerCase();
  for (const [cat, keywords] of Object.entries(EVENT_CATEGORY_KEYWORDS) as [Exclude<EventCategory, "OTHER">, string[]][]) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return "OTHER";
}

export type BlockingPhase = "clear" | "pre_event" | "active" | "post_event";

export interface NewsEvent {
  id: string;
  title: string;
  currency: string;
  eventTime: string;
  impact: "high" | "medium" | "low";
  category: EventCategory;
  forecast: string;
  previous: string;
  actual: string;
  minutesUntil: number;
  isBlocking: boolean;
  blockingPhase: BlockingPhase;
}

interface RawFFEvent {
  title: string;
  country: string;
  date: string;
  time: string;
  impact: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

interface CachedEvent {
  title: string;
  currency: string;
  eventTime: Date;
  impact: string;
  category: EventCategory;
  forecast: string;
  previous: string;
  actual: string;
}

let cachedEvents: CachedEvent[] = [];
let lastFetch: Date | null = null;
let cacheSource = "none";

function parseFFTime(dateStr: string, timeStr: string): Date | null {
  const d = dateStr.trim();
  const t = timeStr.trim().toLowerCase();

  if (!t || t === "all day" || t === "tentative") {
    const dt = new Date(`${d} UTC`);
    return isNaN(dt.getTime()) ? null : dt;
  }

  const combined = `${d} ${t.toUpperCase()}`;
  const dt = new Date(combined + " UTC");
  if (!isNaN(dt.getTime())) return dt;

  const match = t.match(/^(\d{1,2}):?(\d{2})?(am|pm)$/i);
  if (match) {
    let hour = parseInt(match[1]!);
    const min = match[2] ? parseInt(match[2]) : 0;
    const ampm = match[3]!.toLowerCase();
    if (ampm === "pm" && hour !== 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    const base = new Date(`${d} UTC`);
    if (isNaN(base.getTime())) return null;
    base.setUTCHours(hour, min, 0, 0);
    return base;
  }
  return null;
}

function isHighImpactTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return HIGH_IMPACT_KEYWORDS.some(kw => lower.includes(kw));
}

async function fetchWeek(week: string): Promise<CachedEvent[]> {
  const url = FF_BASE.replace("{week}", week);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 TradingBot/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as RawFFEvent[];

    const events: CachedEvent[] = [];
    for (const item of data) {
      const impactLower = item.impact?.toLowerCase() ?? "";
      if (!["high", "medium"].includes(impactLower)) continue;
      if (impactLower === "medium" && !isHighImpactTitle(item.title ?? "")) continue;

      const currency = COUNTRY_CURRENCY[item.country?.toUpperCase()] ?? item.country;
      const eventTime = parseFFTime(item.date ?? "", item.time ?? "");
      if (!eventTime) continue;

      events.push({
        title: item.title,
        currency,
        eventTime,
        impact: item.impact,
        category: categorizeEvent(item.title),
        forecast: item.forecast ?? "",
        previous: item.previous ?? "",
        actual: item.actual ?? "",
      });
    }
    return events;
  } catch (err) {
    logger.warn({ err, week }, "ForexFactory fetch failed");
    return [];
  }
}

function fallbackEvents(): CachedEvent[] {
  const now = new Date();
  const firstFriday = new Date(now.getFullYear(), now.getMonth(), 1);
  while (firstFriday.getDay() !== 5) firstFriday.setDate(firstFriday.getDate() + 1);
  if (firstFriday <= now) {
    firstFriday.setMonth(firstFriday.getMonth() + 1, 1);
    while (firstFriday.getDay() !== 5) firstFriday.setDate(firstFriday.getDate() + 1);
  }
  firstFriday.setUTCHours(13, 30, 0, 0);

  const thirdWed = new Date(now.getFullYear(), now.getMonth(), 1);
  while (thirdWed.getDay() !== 3) thirdWed.setDate(thirdWed.getDate() + 1);
  thirdWed.setDate(thirdWed.getDate() + 14);
  if (thirdWed <= now) {
    thirdWed.setMonth(thirdWed.getMonth() + 1, 1);
    while (thirdWed.getDay() !== 3) thirdWed.setDate(thirdWed.getDate() + 1);
    thirdWed.setDate(thirdWed.getDate() + 14);
  }
  thirdWed.setUTCHours(18, 0, 0, 0);

  return [
    {
      title: "Non-Farm Employment Change (Fallback)",
      currency: "USD",
      eventTime: firstFriday,
      impact: "High",
      category: "NFP",
      forecast: "", previous: "", actual: "",
    },
    {
      title: "FOMC Statement (Fallback)",
      currency: "USD",
      eventTime: thirdWed,
      impact: "High",
      category: "FOMC",
      forecast: "", previous: "", actual: "",
    },
  ];
}

async function ensureFresh(): Promise<void> {
  const now = new Date();
  const stale = !lastFetch || now.getTime() - lastFetch.getTime() > CACHE_TTL_MS;
  if (!stale) return;

  const all: CachedEvent[] = [];
  for (const week of FF_WEEKS) {
    const fetched = await fetchWeek(week);
    all.push(...fetched);
  }

  if (all.length === 0) {
    cachedEvents = fallbackEvents();
    cacheSource = "fallback";
    logger.warn("Using news fallback schedule");
  } else {
    cachedEvents = all.sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime());
    cacheSource = "forexfactory";
    logger.info({ count: cachedEvents.length }, "News events refreshed from ForexFactory");
  }
  lastFetch = now;
}

function getBlockingPhase(event: CachedEvent, now: Date): BlockingPhase {
  const t = event.eventTime.getTime();
  const n = now.getTime();
  if (n < t - BLOCK_WINDOW_MS || n > t + BLOCK_WINDOW_MS) return "clear";
  if (n < t) return "pre_event";
  if (n <= t + 30_000) return "active";
  return "post_event";
}

function isBlocking(event: CachedEvent, now: Date): boolean {
  const t = event.eventTime.getTime();
  return now.getTime() >= t - BLOCK_WINDOW_MS && now.getTime() <= t + BLOCK_WINDOW_MS;
}

function toPublicEvent(event: CachedEvent, now: Date): NewsEvent {
  const minutesUntil = (event.eventTime.getTime() - now.getTime()) / 60_000;
  return {
    id: `${event.currency}_${event.eventTime.toISOString()}_${event.title.slice(0, 16)}`.replace(/\s/g, "_"),
    title: event.title,
    currency: event.currency,
    eventTime: event.eventTime.toISOString(),
    impact: (event.impact.toLowerCase() as NewsEvent["impact"]) ?? "high",
    category: event.category,
    forecast: event.forecast,
    previous: event.previous,
    actual: event.actual,
    minutesUntil: Math.round(minutesUntil * 10) / 10,
    isBlocking: isBlocking(event, now),
    blockingPhase: getBlockingPhase(event, now),
  };
}

export async function getUpcomingEvents(pair?: string, hours = 24): Promise<NewsEvent[]> {
  await ensureFresh();
  const now = new Date();
  const cutoff = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const currencies = pair ? PAIR_CURRENCIES[pair.toUpperCase()] ?? [] : null;

  return cachedEvents
    .filter(e => {
      if (currencies && !currencies.includes(e.currency)) return false;
      const t = e.eventTime.getTime();
      return t >= now.getTime() - BLOCK_WINDOW_MS && t <= cutoff.getTime();
    })
    .map(e => toPublicEvent(e, now));
}

export async function getCalendarWeek(): Promise<{ date: string; events: NewsEvent[] }[]> {
  await ensureFresh();
  const now = new Date();

  const byDay = new Map<string, NewsEvent[]>();
  for (const e of cachedEvents) {
    const day = e.eventTime.toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(toPublicEvent(e, now));
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, events]) => ({ date, events }));
}

export async function getPairStatuses(pairs: string[]): Promise<Array<{
  pair: string;
  blocked: boolean;
  reason: string;
  category: string | null;
  nextEventIn: number | null;
}>> {
  await ensureFresh();
  const now = new Date();

  return pairs.map(pair => {
    const currencies = PAIR_CURRENCIES[pair.toUpperCase()] ?? [];
    const blockingNow = cachedEvents.filter(e => currencies.includes(e.currency) && isBlocking(e, now));
    const upcoming = cachedEvents
      .filter(e => currencies.includes(e.currency) && e.eventTime > now)
      .sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime());

    const nextEventIn = upcoming.length
      ? Math.round((upcoming[0].eventTime.getTime() - now.getTime()) / 60_000 * 10) / 10
      : null;

    return {
      pair,
      blocked: blockingNow.length > 0,
      reason: blockingNow.length > 0 ? blockingNow[0]!.title : "",
      category: blockingNow.length > 0 ? blockingNow[0]!.category : null,
      nextEventIn,
    };
  });
}

export async function getBlockedPairsSet(): Promise<Set<string>> {
  await ensureFresh();
  const now = new Date();
  const blocked = new Set<string>();
  for (const [pair, currencies] of Object.entries(PAIR_CURRENCIES)) {
    if (cachedEvents.some(e => currencies.includes(e.currency) && isBlocking(e, now))) {
      blocked.add(pair);
    }
  }
  return blocked;
}

export function getCacheMeta() {
  return { fetchedAt: lastFetch?.toISOString() ?? null, source: cacheSource };
}
