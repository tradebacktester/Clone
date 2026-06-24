"""
Tests for the real Economic Calendar & News Filter.
All tests use injected datetime to avoid flakiness.
"""
import json
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

from trading_clone.market_data.news_calendar import (
    NewsEvent,
    NewsCalendar,
    BLOCK_WINDOW_MINUTES,
    _parse_ff_time,
    _fetch_forexfactory,
    is_news_blocked,
    get_calendar,
)


NFP_TIME = datetime(2025, 6, 6, 13, 30, tzinfo=timezone.utc)


def make_event(minutes_from_now: float, currency: str = "USD", impact: str = "High") -> NewsEvent:
    now = datetime.now(timezone.utc)
    return NewsEvent(
        title="Test Event",
        currency=currency,
        event_time=now + timedelta(minutes=minutes_from_now),
        impact=impact,
    )


class TestNewsEventBlocking:
    def test_blocks_exactly_at_window_start(self):
        event = NewsEvent("NFP", "USD", NFP_TIME, "High")
        check_time = NFP_TIME - timedelta(minutes=BLOCK_WINDOW_MINUTES)
        assert event.blocks_at(check_time) is True

    def test_blocks_exactly_at_window_end(self):
        event = NewsEvent("NFP", "USD", NFP_TIME, "High")
        check_time = NFP_TIME + timedelta(minutes=BLOCK_WINDOW_MINUTES)
        assert event.blocks_at(check_time) is True

    def test_blocks_during_event(self):
        event = NewsEvent("NFP", "USD", NFP_TIME, "High")
        assert event.blocks_at(NFP_TIME) is True

    def test_not_blocking_before_window(self):
        event = NewsEvent("NFP", "USD", NFP_TIME, "High")
        check_time = NFP_TIME - timedelta(minutes=BLOCK_WINDOW_MINUTES + 1)
        assert event.blocks_at(check_time) is False

    def test_not_blocking_after_window(self):
        event = NewsEvent("NFP", "USD", NFP_TIME, "High")
        check_time = NFP_TIME + timedelta(minutes=BLOCK_WINDOW_MINUTES + 1)
        assert event.blocks_at(check_time) is False

    def test_medium_impact_not_blocking_unless_keyword(self):
        event = NewsEvent("Random Medium Event", "USD", NFP_TIME, "Medium")
        assert event.blocks_at(NFP_TIME) is False

    def test_medium_impact_with_cpi_keyword_is_blocking(self):
        event = NewsEvent("Core CPI y/y", "USD", NFP_TIME, "Medium")
        assert event.blocks_at(NFP_TIME) is True

    def test_low_impact_never_blocking(self):
        event = NewsEvent("NFP", "USD", NFP_TIME, "Low")
        assert event.blocks_at(NFP_TIME) is False

    def test_naive_datetime_treated_as_utc(self):
        event = NewsEvent("NFP", "USD", NFP_TIME, "High")
        naive_now = NFP_TIME.replace(tzinfo=None)
        assert event.blocks_at(naive_now) is True

    def test_is_high_impact_high_string(self):
        e = NewsEvent("Anything", "USD", NFP_TIME, "High")
        assert e.is_high_impact() is True

    def test_is_high_impact_keyword_match(self):
        e = NewsEvent("FOMC Meeting Minutes", "USD", NFP_TIME, "Medium")
        assert e.is_high_impact() is True

    def test_minutes_until(self):
        now = datetime.now(timezone.utc)
        event_time = now + timedelta(minutes=45)
        event = NewsEvent("Test", "USD", event_time, "High")
        result = event.minutes_until(now)
        assert 44.9 < result < 45.1


class TestParseFFTime:
    def test_standard_time(self):
        result = _parse_ff_time("Jun 06 2025", "8:30am")
        assert result is not None
        assert result.hour == 8
        assert result.minute == 30

    def test_pm_time(self):
        result = _parse_ff_time("Jun 06 2025", "2:00pm")
        assert result is not None
        assert result.hour == 14

    def test_all_day(self):
        result = _parse_ff_time("Jun 06 2025", "All Day")
        assert result is not None
        assert result.hour == 0

    def test_tentative(self):
        result = _parse_ff_time("Jun 06 2025", "Tentative")
        assert result is not None

    def test_empty_time(self):
        result = _parse_ff_time("Jun 06 2025", "")
        assert result is not None


class TestNewsCalendar:
    def _make_calendar_with_events(self, events: list[NewsEvent]) -> NewsCalendar:
        cal = NewsCalendar()
        from datetime import datetime, timezone
        cal._events = events
        cal._last_fetch = datetime.now(timezone.utc)
        cal._source = "test"
        return cal

    def test_is_blocked_when_event_is_active(self):
        now = datetime.now(timezone.utc)
        event = NewsEvent("NFP", "USD", now + timedelta(minutes=10), "High")
        cal = self._make_calendar_with_events([event])
        assert cal.is_blocked("EURUSD", now) is True
        assert cal.is_blocked("USDJPY", now) is True

    def test_not_blocked_for_unrelated_pair(self):
        now = datetime.now(timezone.utc)
        event = NewsEvent("BOJ Rate Decision", "JPY", now + timedelta(minutes=10), "High")
        cal = self._make_calendar_with_events([event])
        assert cal.is_blocked("EURUSD", now) is False

    def test_not_blocked_outside_window(self):
        now = datetime.now(timezone.utc)
        event = NewsEvent("NFP", "USD", now + timedelta(minutes=60), "High")
        cal = self._make_calendar_with_events([event])
        assert cal.is_blocked("EURUSD", now) is False

    def test_blocking_events_returns_correct_list(self):
        now = datetime.now(timezone.utc)
        active = NewsEvent("NFP", "USD", now + timedelta(minutes=5), "High")
        inactive = NewsEvent("CPI", "USD", now + timedelta(hours=3), "High")
        cal = self._make_calendar_with_events([active, inactive])
        result = cal.blocking_events("EURUSD", now)
        assert len(result) == 1
        assert result[0].title == "NFP"

    def test_upcoming_events_filtered_by_pair(self):
        now = datetime.now(timezone.utc)
        usd_event = NewsEvent("NFP", "USD", now + timedelta(hours=2), "High")
        eur_event = NewsEvent("ECB Rate", "EUR", now + timedelta(hours=3), "High")
        cal = self._make_calendar_with_events([usd_event, eur_event])
        result = cal.upcoming_events("USDJPY", hours=24)
        assert any(e.title == "NFP" for e in result)
        assert not any(e.title == "ECB Rate" for e in result)

    def test_pair_status_blocked_true(self):
        now = datetime.now(timezone.utc)
        event = NewsEvent("NFP", "USD", now + timedelta(minutes=10), "High")
        cal = self._make_calendar_with_events([event])
        statuses = cal.pair_status(["EURUSD"])
        assert statuses[0]["pair"] == "EURUSD"
        assert statuses[0]["blocked"] is True
        assert "NFP" in statuses[0]["reason"]

    def test_pair_status_not_blocked(self):
        now = datetime.now(timezone.utc)
        event = NewsEvent("NFP", "USD", now + timedelta(hours=5), "High")
        cal = self._make_calendar_with_events([event])
        statuses = cal.pair_status(["EURUSD"])
        assert statuses[0]["blocked"] is False

    def test_multiple_currencies_blocked(self):
        now = datetime.now(timezone.utc)
        usd_event = NewsEvent("NFP", "USD", now + timedelta(minutes=10), "High")
        eur_event = NewsEvent("ECB Press Conference", "EUR", now + timedelta(minutes=5), "High")
        cal = self._make_calendar_with_events([usd_event, eur_event])
        assert cal.is_blocked("EURUSD", now) is True

    def test_refresh_uses_fallback_on_failure(self):
        cal = NewsCalendar()
        with patch("trading_clone.market_data.news_calendar._fetch_forexfactory", return_value=[]):
            cal.refresh()
        assert cal.source == "fallback"
        assert len(cal._events) > 0

    def test_refresh_uses_forexfactory_when_available(self):
        fake_event = NewsEvent("NFP", "USD", datetime.now(timezone.utc) + timedelta(hours=1), "High")
        cal = NewsCalendar()
        with patch("trading_clone.market_data.news_calendar._fetch_forexfactory", return_value=[fake_event]):
            cal.refresh()
        assert cal.source == "forexfactory"
        assert len(cal._events) > 0

    def test_to_dict_keys(self):
        event = NewsEvent("NFP", "USD", datetime.now(timezone.utc) + timedelta(hours=2), "High",
                          forecast="200K", previous="180K", actual="")
        d = event.to_dict()
        assert "id" in d
        assert "title" in d
        assert "currency" in d
        assert "eventTime" in d
        assert "impact" in d
        assert "minutesUntil" in d
        assert "isBlocking" in d


class TestFetchForexFactory:
    def test_fetch_handles_network_error_gracefully(self):
        with patch("urllib.request.urlopen", side_effect=Exception("connection refused")):
            events = _fetch_forexfactory("thisweek")
        assert events == []

    def test_fetch_filters_low_impact(self):
        mock_data = [
            {"title": "Low Event", "country": "USD", "date": "Jun 06 2025",
             "time": "8:30am", "impact": "Low", "forecast": "", "previous": "", "actual": ""},
            {"title": "High Event", "country": "USD", "date": "Jun 06 2025",
             "time": "9:00am", "impact": "High", "forecast": "", "previous": "", "actual": ""},
        ]
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps(mock_data).encode()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            events = _fetch_forexfactory("thisweek")

        assert len(events) == 1
        assert events[0].title == "High Event"
