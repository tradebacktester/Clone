import logging
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import List

logger = logging.getLogger(__name__)

HIGH_IMPACT_EVENTS = [
    "NFP", "FOMC", "CPI", "GDP", "Unemployment Rate",
    "Interest Rate Decision", "Retail Sales", "PPI", "PCE",
]

PAIR_CURRENCIES = {
    "EURUSD": ["EUR", "USD"],
    "GBPUSD": ["GBP", "USD"],
    "USDJPY": ["USD", "JPY"],
}


@dataclass
class NewsEvent:
    time: datetime
    currency: str
    title: str
    impact: str
    forecast: str = ""
    previous: str = ""
    actual: str = ""


class NewsCalendar:
    def __init__(self):
        self._events: List[NewsEvent] = []

    def is_high_impact(self, pair: str, window_minutes: int = 30) -> bool:
        now = datetime.now(timezone.utc)
        currencies = PAIR_CURRENCIES.get(pair, [])
        for event in self._events:
            if event.impact != "high":
                continue
            if event.currency not in currencies:
                continue
            delta = abs((event.time - now).total_seconds())
            if delta <= window_minutes * 60:
                return True
        return False

    def upcoming_events(self, pair: str, hours_ahead: int = 24) -> List[NewsEvent]:
        now = datetime.now(timezone.utc)
        currencies = PAIR_CURRENCIES.get(pair, [])
        cutoff = now + timedelta(hours=hours_ahead)
        return [
            e for e in self._events
            if e.currency in currencies and now <= e.time <= cutoff
        ]

    def add_event(self, event: NewsEvent) -> None:
        self._events.append(event)
        self._events.sort(key=lambda e: e.time)
