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
    categorize_event,
    EVENT_CATEGORY_KEYWORDS,
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


class TestBlockingPhase:
    def test_pre_event_phase(self):
        event = NewsEvent("NFP", "USD", NFP_TIME, "High")
        check_time = NFP_TIME - timedelta(minutes=15)
        assert event.blocking_phase(check_time) == "pre_event"

    def test_active_phase_at_event_time(self):
        event = NewsEvent("NFP", "USD", NFP_TIME, "High")
        assert event.blocking_phase(NFP_TIME) == "active"

    def test_post_event_phase(self):
        event = NewsEvent("NFP", "USD", NFP_TIME, "High")
        check_time = NFP_TIME + timedelta(minutes=15)
        assert event.blocking_phase(check_time) == "post_event"

    def test_clear_before_window(self):
        event = NewsEvent("NFP", "USD", NFP_TIME, "High")
        check_time = NFP_TIME - timedelta(minutes=BLOCK_WINDOW_MINUTES + 5)
        assert event.blocking_phase(check_time) == "clear"

    def test_clear_after_window(self):
        event = NewsEvent("NFP", "USD", NFP_TIME, "High")
        check_time = NFP_TIME + timedelta(minutes=BLOCK_WINDOW_MINUTES + 5)
        assert event.blocking_phase(check_time) == "clear"


class TestEventCategorization:
    def test_nfp_categorized(self):
        assert categorize_event("Non-Farm Employment Change") == "NFP"
        assert categorize_event("US NFP Report") == "NFP"
        assert categorize_event("Nonfarm Payrolls") == "NFP"

    def test_cpi_categorized(self):
        assert categorize_event("Core CPI m/m") == "CPI"
        assert categorize_event("Consumer Price Index y/y") == "CPI"

    def test_fomc_categorized(self):
        assert categorize_event("FOMC Statement") == "FOMC"
        assert categorize_event("FOMC Meeting Minutes") == "FOMC"
        assert categorize_event("Federal Open Market Committee") == "FOMC"

    def test_interest_rate_categorized(self):
        assert categorize_event("Interest Rate Decision") == "INTEREST_RATE"
        assert categorize_event("ECB Rate Decision") == "INTEREST_RATE"
        assert categorize_event("Cash Rate Statement") == "INTEREST_RATE"
        assert categorize_event("Bank Rate Decision") == "INTEREST_RATE"

    def test_gdp_categorized(self):
        assert categorize_event("GDP q/q") == "GDP"
        assert categorize_event("Gross Domestic Product Annualized") == "GDP"

    def test_central_bank_speech_categorized(self):
        assert categorize_event("ECB Press Conference") == "CENTRAL_BANK_SPEECH"
        assert categorize_event("Fed Chair Powell Speaks") == "CENTRAL_BANK_SPEECH"
        assert categorize_event("Lagarde Speech") == "CENTRAL_BANK_SPEECH"
        assert categorize_event("BOE Governor Bailey Speaks") == "CENTRAL_BANK_SPEECH"
        assert categorize_event("BOJ Governor Ueda") == "CENTRAL_BANK_SPEECH"
        assert categorize_event("Monetary Policy Statement") == "CENTRAL_BANK_SPEECH"

    def test_other_categorized(self):
        assert categorize_event("Retail Sales m/m") == "OTHER"
        assert categorize_event("Trade Balance") == "OTHER"
        assert categorize_event("PMI Manufacturing") == "OTHER"

    def test_event_has_category_field(self):
        event = NewsEvent("Non-Farm Employment Change", "USD", NFP_TIME, "High")
        assert event.category == "NFP"

    def test_cpi_event_category(self):
        event = NewsEvent("Core CPI m/m", "USD", NFP_TIME, "High")
        assert event.category == "CPI"

    def test_fomc_event_category(self):
        event = NewsEvent("FOMC Statement", "USD", NFP_TIME, "High")
        assert event.category == "FOMC"

    def test_gdp_event_category(self):
        event = NewsEvent("GDP q/q", "USD", NFP_TIME, "High")
        assert event.category == "GDP"

    def test_interest_rate_event_category(self):
        event = NewsEvent("Interest Rate Decision", "USD", NFP_TIME, "High")
        assert event.category == "INTEREST_RATE"

    def test_central_bank_speech_event_category(self):
        event = NewsEvent("Fed Chair Powell Speaks", "USD", NFP_TIME, "High")
        assert event.category == "CENTRAL_BANK_SPEECH"


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

    def test_pair_status_includes_category_when_blocked(self):
        now = datetime.now(timezone.utc)
        event = NewsEvent("Non-Farm Employment Change", "USD", now + timedelta(minutes=5), "High")
        cal = self._make_calendar_with_events([event])
        statuses = cal.pair_status(["EURUSD"])
        assert statuses[0]["blocked"] is True
        assert statuses[0]["category"] == "NFP"

    def test_pair_status_category_none_when_not_blocked(self):
        now = datetime.now(timezone.utc)
        event = NewsEvent("NFP", "USD", now + timedelta(hours=5), "High")
        cal = self._make_calendar_with_events([event])
        statuses = cal.pair_status(["EURUSD"])
        assert statuses[0]["blocked"] is False
        assert statuses[0]["category"] is None

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

    def test_fallback_includes_fomc_event(self):
        cal = NewsCalendar()
        with patch("trading_clone.market_data.news_calendar._fetch_forexfactory", return_value=[]):
            cal.refresh()
        titles = [e.title for e in cal._events]
        assert any("FOMC" in t for t in titles)

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
        assert "category" in d
        assert "minutesUntil" in d
        assert "isBlocking" in d
        assert "blockingPhase" in d

    def test_calendar_week_returns_grouped_days(self):
        now = datetime.now(timezone.utc)
        events = [
            NewsEvent("NFP", "USD", now + timedelta(hours=2), "High"),
            NewsEvent("CPI", "USD", now + timedelta(days=1, hours=3), "High"),
        ]
        cal = self._make_calendar_with_events(events)
        result = cal.calendar_week()
        assert isinstance(result, list)
        assert all("date" in day and "events" in day for day in result)
        assert len(result) >= 1

    def test_calendar_week_events_sorted_by_day(self):
        now = datetime.now(timezone.utc)
        events = [
            NewsEvent("CPI", "USD", now + timedelta(days=2), "High"),
            NewsEvent("NFP", "USD", now + timedelta(hours=1), "High"),
        ]
        cal = self._make_calendar_with_events(events)
        result = cal.calendar_week()
        dates = [d["date"] for d in result]
        assert dates == sorted(dates)


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

    def test_fetched_events_have_category(self):
        mock_data = [
            {"title": "Non-Farm Employment Change", "country": "USD", "date": "Jun 06 2025",
             "time": "8:30am", "impact": "High", "forecast": "200K", "previous": "180K", "actual": ""},
        ]
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps(mock_data).encode()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            events = _fetch_forexfactory("thisweek")

        assert len(events) == 1
        assert events[0].category == "NFP"


class TestHighImpactEventCoverage:
    """Ensure all required event types are recognized and block correctly."""

    def _blocking_event(self, title: str, currency: str = "USD") -> NewsEvent:
        now = datetime.now(timezone.utc)
        return NewsEvent(title, currency, now + timedelta(minutes=10), "High")

    def test_nfp_blocks_eurusd(self):
        cal = NewsCalendar()
        cal._events = [self._blocking_event("Non-Farm Employment Change")]
        cal._last_fetch = datetime.now(timezone.utc)
        assert cal.is_blocked("EURUSD") is True

    def test_cpi_blocks_eurusd(self):
        cal = NewsCalendar()
        cal._events = [self._blocking_event("Core CPI m/m")]
        cal._last_fetch = datetime.now(timezone.utc)
        assert cal.is_blocked("EURUSD") is True

    def test_fomc_blocks_all_usd_pairs(self):
        cal = NewsCalendar()
        cal._events = [self._blocking_event("FOMC Statement")]
        cal._last_fetch = datetime.now(timezone.utc)
        assert cal.is_blocked("EURUSD") is True
        assert cal.is_blocked("GBPUSD") is True
        assert cal.is_blocked("USDJPY") is True

    def test_interest_rate_decision_blocks(self):
        cal = NewsCalendar()
        cal._events = [self._blocking_event("Interest Rate Decision")]
        cal._last_fetch = datetime.now(timezone.utc)
        assert cal.is_blocked("EURUSD") is True

    def test_gdp_blocks(self):
        cal = NewsCalendar()
        cal._events = [self._blocking_event("GDP q/q Annualized")]
        cal._last_fetch = datetime.now(timezone.utc)
        assert cal.is_blocked("EURUSD") is True

    def test_central_bank_speech_blocks(self):
        cal = NewsCalendar()
        cal._events = [self._blocking_event("Fed Chair Powell Speaks")]
        cal._last_fetch = datetime.now(timezone.utc)
        assert cal.is_blocked("EURUSD") is True

    def test_ecb_press_conference_blocks_eurusd(self):
        cal = NewsCalendar()
        cal._events = [self._blocking_event("ECB Press Conference", "EUR")]
        cal._last_fetch = datetime.now(timezone.utc)
        assert cal.is_blocked("EURUSD") is True

    def test_boj_rate_decision_blocks_usdjpy(self):
        cal = NewsCalendar()
        cal._events = [self._blocking_event("BOJ Interest Rate Decision", "JPY")]
        cal._last_fetch = datetime.now(timezone.utc)
        assert cal.is_blocked("USDJPY") is True
        assert cal.is_blocked("GBPJPY") is True
        assert cal.is_blocked("EURUSD") is False

    def test_boe_rate_decision_blocks_gbpusd(self):
        cal = NewsCalendar()
        cal._events = [self._blocking_event("BOE Interest Rate Decision", "GBP")]
        cal._last_fetch = datetime.now(timezone.utc)
        assert cal.is_blocked("GBPUSD") is True
        assert cal.is_blocked("GBPJPY") is True
        assert cal.is_blocked("USDJPY") is False
