"""
Real Economic Calendar & News Filter
Fetches high-impact news from ForexFactory public JSON feed.
Blocks trading 30 minutes before, during, and 30 minutes after events.
"""
import urllib.request
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
import threading

logger = logging.getLogger(__name__)

HIGH_IMPACT_KEYWORDS = [
    "non-farm", "nfp", "employment change", "unemployment rate",
    "cpi", "consumer price", "inflation",
    "fomc", "federal funds rate", "interest rate decision", "rate decision",
    "gdp", "gross domestic product",
    "ecb", "boe", "boj", "rba", "rbnz", "snb", "boc",
    "central bank", "monetary policy statement",
    "pce", "core pce",
    "retail sales",
    "ism manufacturing", "ism services",
]

PAIR_CURRENCIES: dict[str, list[str]] = {
    "EURUSD": ["EUR", "USD"],
    "GBPUSD": ["GBP", "USD"],
    "USDJPY": ["USD", "JPY"],
    "AUDUSD": ["AUD", "USD"],
    "USDCAD": ["USD", "CAD"],
    "USDCHF": ["USD", "CHF"],
    "NZDUSD": ["NZD", "USD"],
    "GBPJPY": ["GBP", "JPY"],
    "EURJPY": ["EUR", "JPY"],
    "EURGBP": ["EUR", "GBP"],
}

COUNTRY_CURRENCY: dict[str, str] = {
    "USD": "USD", "EUR": "EUR", "GBP": "GBP", "JPY": "JPY",
    "AUD": "AUD", "CAD": "CAD", "CHF": "CHF", "NZD": "NZD",
    "CNY": "CNY", "CNH": "CNY",
}

BLOCK_WINDOW_MINUTES = 30
CACHE_TTL_SECONDS = 3600


class NewsEvent:
    def __init__(
        self,
        title: str,
        currency: str,
        event_time: datetime,
        impact: str,
        forecast: str = "",
        previous: str = "",
        actual: str = "",
    ):
        self.title = title
        self.currency = currency
        self.event_time = event_time if event_time.tzinfo else event_time.replace(tzinfo=timezone.utc)
        self.impact = impact
        self.forecast = forecast
        self.previous = previous
        self.actual = actual

    def is_high_impact(self) -> bool:
        impact_lower = self.impact.lower()
        if impact_lower == "low":
            return False
        if impact_lower == "high":
            return True
        title_lower = self.title.lower()
        return any(kw in title_lower for kw in HIGH_IMPACT_KEYWORDS)

    def blocks_at(self, now: datetime) -> bool:
        if not self.is_high_impact():
            return False
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        window_start = self.event_time - timedelta(minutes=BLOCK_WINDOW_MINUTES)
        window_end = self.event_time + timedelta(minutes=BLOCK_WINDOW_MINUTES)
        return window_start <= now <= window_end

    def minutes_until(self, now: datetime) -> float:
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        return (self.event_time - now).total_seconds() / 60

    def to_dict(self) -> dict:
        now = datetime.now(timezone.utc)
        return {
            "id": f"{self.currency}_{self.event_time.strftime('%Y%m%dT%H%M')}_{self.title[:16]}".replace(" ", "_"),
            "title": self.title,
            "currency": self.currency,
            "eventTime": self.event_time.isoformat(),
            "impact": self.impact.lower(),
            "forecast": self.forecast,
            "previous": self.previous,
            "actual": self.actual,
            "minutesUntil": round(self.minutes_until(now), 1),
            "isBlocking": self.blocks_at(now),
        }


def _parse_ff_time(date_str: str, time_str: str) -> Optional[datetime]:
    """Parse ForexFactory date/time into UTC datetime."""
    date_str = date_str.strip()
    time_str = time_str.strip()
    if not time_str or time_str.lower() in ("all day", "tentative"):
        try:
            return datetime.strptime(date_str, "%b %d %Y").replace(
                hour=0, minute=0, tzinfo=timezone.utc
            )
        except ValueError:
            return None
    for fmt in ("%b %d %Y %I:%M%p", "%b %d %Y %I%p"):
        try:
            dt = datetime.strptime(f"{date_str} {time_str.upper()}", fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _fetch_forexfactory(week: str = "thisweek") -> list[NewsEvent]:
    """Fetch from ForexFactory JSON endpoint for the given week."""
    url = f"https://nfs.faireconomy.media/ff_calendar_{week}.json"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 TradingBot/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        logger.warning("ForexFactory fetch failed (%s): %s", week, exc)
        return []

    events: list[NewsEvent] = []
    for item in data:
        impact = item.get("impact", "").strip()
        if impact.lower() not in ("high", "medium"):
            continue
        title = item.get("title", "").strip()
        country = item.get("country", "").strip().upper()
        currency = COUNTRY_CURRENCY.get(country, country)
        event_time = _parse_ff_time(item.get("date", ""), item.get("time", ""))
        if event_time is None:
            continue
        events.append(NewsEvent(
            title=title,
            currency=currency,
            event_time=event_time,
            impact=impact,
            forecast=item.get("forecast", ""),
            previous=item.get("previous", ""),
            actual=item.get("actual", ""),
        ))
    return events


def _fallback_events() -> list[NewsEvent]:
    """Hardcoded fallback: first Friday of next month NFP + 3rd Wed FOMC approximations."""
    now = datetime.now(timezone.utc)
    events: list[NewsEvent] = []

    first_friday = now.replace(day=1)
    while first_friday.weekday() != 4:
        first_friday += timedelta(days=1)
    if first_friday.date() <= now.date():
        first_friday = (now.replace(day=28) + timedelta(days=4)).replace(day=1)
        while first_friday.weekday() != 4:
            first_friday += timedelta(days=1)

    events.append(NewsEvent(
        title="Non-Farm Employment Change (Fallback)",
        currency="USD",
        event_time=first_friday.replace(hour=13, minute=30, second=0, microsecond=0),
        impact="High",
    ))
    return events


class NewsCalendar:
    """Thread-safe economic calendar with auto-refresh from ForexFactory."""

    def __init__(self) -> None:
        self._events: list[NewsEvent] = []
        self._last_fetch: Optional[datetime] = None
        self._source: str = "none"
        self._lock = threading.Lock()

    def refresh(self) -> None:
        events: list[NewsEvent] = []
        for week in ("thisweek", "nextweek"):
            events.extend(_fetch_forexfactory(week))

        source: str
        if not events:
            logger.warning("ForexFactory unavailable — using fallback schedule")
            events = _fallback_events()
            source = "fallback"
        else:
            source = "forexfactory"
            logger.info("Fetched %d events from ForexFactory", len(events))

        with self._lock:
            self._events = sorted(events, key=lambda e: e.event_time)
            self._last_fetch = datetime.now(timezone.utc)
            self._source = source

    def _ensure_fresh(self) -> None:
        now = datetime.now(timezone.utc)
        stale = self._last_fetch is None or (now - self._last_fetch).total_seconds() > CACHE_TTL_SECONDS
        if stale:
            self.refresh()

    def is_blocked(self, pair: str, now: Optional[datetime] = None) -> bool:
        self._ensure_fresh()
        if now is None:
            now = datetime.now(timezone.utc)
        currencies = PAIR_CURRENCIES.get(pair.upper(), [])
        with self._lock:
            return any(e.currency in currencies and e.blocks_at(now) for e in self._events)

    def blocking_events(self, pair: str, now: Optional[datetime] = None) -> list[NewsEvent]:
        self._ensure_fresh()
        if now is None:
            now = datetime.now(timezone.utc)
        currencies = PAIR_CURRENCIES.get(pair.upper(), [])
        with self._lock:
            return [e for e in self._events if e.currency in currencies and e.blocks_at(now)]

    def upcoming_events(self, pair: Optional[str] = None, hours: int = 24) -> list[NewsEvent]:
        self._ensure_fresh()
        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(hours=hours)
        currencies = PAIR_CURRENCIES.get(pair.upper(), []) if pair else None
        with self._lock:
            result = []
            for e in self._events:
                if not e.is_high_impact():
                    continue
                if currencies and e.currency not in currencies:
                    continue
                earliest = e.event_time - timedelta(minutes=BLOCK_WINDOW_MINUTES)
                if earliest <= cutoff and e.event_time >= now - timedelta(minutes=BLOCK_WINDOW_MINUTES):
                    result.append(e)
            return result

    def pair_status(self, pairs: list[str]) -> list[dict]:
        self._ensure_fresh()
        now = datetime.now(timezone.utc)
        result = []
        for pair in pairs:
            blocking = self.blocking_events(pair, now)
            upcoming = self.upcoming_events(pair, hours=1)
            next_event_in: Optional[float] = None
            if upcoming:
                next_event_in = round(upcoming[0].minutes_until(now), 1)
            result.append({
                "pair": pair,
                "blocked": bool(blocking),
                "reason": blocking[0].title if blocking else "",
                "nextEventIn": next_event_in,
            })
        return result

    @property
    def source(self) -> str:
        return self._source

    @property
    def fetched_at(self) -> Optional[str]:
        return self._last_fetch.isoformat() if self._last_fetch else None


_instance: Optional[NewsCalendar] = None
_instance_lock = threading.Lock()


def get_calendar() -> NewsCalendar:
    global _instance
    with _instance_lock:
        if _instance is None:
            _instance = NewsCalendar()
    return _instance


def is_news_blocked(pair: str, now: Optional[datetime] = None) -> bool:
    return get_calendar().is_blocked(pair, now)
