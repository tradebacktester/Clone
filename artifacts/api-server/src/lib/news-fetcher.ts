/**
 * News calendar fetcher — pulls ForexFactory's public JSON feed, caches for 1h,
 * and exposes blocking/status helpers for the /news routes.
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

export interface NewsEvent {
  id: string;
  title: string;
  currency: string;
  eventTime: string;
  impact: "high" | "medium" | "low";
  forecast: string;
  previous: string;
  actual: string;
  minutesUntil: number;
  isBlocking: boolean;
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
    let hour = parseInt(match[1]);
    const min = match[2] ? parseInt(match[2]) : 0;
    const ampm = match[3].toLowerCase();
    if (ampm === "pm" && hour !== 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    const base = new Date(`${d} UTC`);
    if (isNaN(base.getTime())) return null;
    base.setUTCHours(hour, min, 0, 0);
    return base;
  }
  return null;
}

async function fetchWeek(week: string): Promise<CachedEvent[]> {
  const url = FF_BASE.replace("{week}", week);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 TradingBot/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data: RawFFEvent[] = await resp.json();

    const events: CachedEvent[] = [];
    for (const item of data) {
      if (!["high", "medium"].includes(item.impact?.toLowerCase())) continue;
      const currency = COUNTRY_CURRENCY[item.country?.toUpperCase()] ?? item.country;
      const eventTime = parseFFTime(item.date ?? "", item.time ?? "");
      if (!eventTime) continue;
      events.push({
        title: item.title,
        currency,
        eventTime,
        impact: item.impact,
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
  return [{
    title: "Non-Farm Employment Change (Fallback)",
    currency: "USD",
    eventTime: firstFriday,
    impact: "High",
    forecast: "",
    previous: "",
    actual: "",
  }];
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
    forecast: event.forecast,
    previous: event.previous,
    actual: event.actual,
    minutesUntil: Math.round(minutesUntil * 10) / 10,
    isBlocking: isBlocking(event, now),
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

export async function getPairStatuses(pairs: string[]): Promise<Array<{
  pair: string;
  blocked: boolean;
  reason: string;
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
      reason: blockingNow.length > 0 ? blockingNow[0].title : "",
      nextEventIn,
    };
  });
}

export function getCacheMeta() {
  return { fetchedAt: lastFetch?.toISOString() ?? null, source: cacheSource };
}
