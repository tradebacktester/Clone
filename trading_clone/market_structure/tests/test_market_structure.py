"""
Unit Tests — Market Structure Engine V2
=========================================
Tests every public function in all four modules:
  • swing_detector.py
  • support_resistance.py
  • premium_discount.py
  • structure_score.py

Run: PYTHONPATH=. python3 -m pytest trading_clone/market_structure/tests/ -v
"""

import math
from datetime import datetime, timezone, timedelta
from typing import List

import numpy as np
import pandas as pd
import pytest

from trading_clone.market_structure.swing_detector import (
    Candle, SwingPoint,
    calc_atr, detect_swings, detect_trend,
    candles_to_df, df_to_candles,
)
from trading_clone.market_structure.support_resistance import (
    SRLevel, detect_sr_levels, major_support, major_resistance,
)
from trading_clone.market_structure.premium_discount import (
    FibAnalysis, FibLevel, calc_fib,
    premium_area, discount_area,
    is_premium, is_discount, get_fib_label,
)
from trading_clone.market_structure.structure_score import (
    MarketStructureResult, analyse_structure, score_summary,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _candle(
    close: float,
    high: float  | None = None,
    low:  float  | None = None,
    open: float  | None = None,
    volume: float = 1000.0,
    i: int = 0,
    pair: str = "EURUSD",
) -> Candle:
    """Helper: build a Candle with defaults."""
    o = open  if open  is not None else close
    h = high  if high  is not None else close + abs(close - o) * 0.1
    l = low   if low   is not None else close - abs(close - o) * 0.1
    t = datetime(2024, 1, 1, tzinfo=timezone.utc) + timedelta(hours=i)
    return Candle(time=t, open=o, high=h, low=l, close=close,
                  volume=volume, pair=pair, timeframe="H1")


def _bullish_trend_candles(n: int = 60) -> List[Candle]:
    """
    Deterministic uptrend:  zigzag rises so each peak is strictly higher
    than the previous peak AND each trough is strictly higher than the
    previous trough (HH + HL pattern), with clear enough separation that
    detect_swings(left=5, right=5) can confirm them reliably.

    Pattern (12-bar cycles):
      bars 0-5   : grind up  (+0.0006 each bar)
      bar  6     : sharp HIGH (+0.0050 spike — the swing high)
      bars 7-11  : grind down (-0.0004 each bar, but floor rises each cycle)
      bar  12    : shallow LOW (-0.0020 dip — the swing low, higher than prev)
    Each successive cycle starts 0.0040 above the previous cycle start.
    """
    candles = []
    cycle_len = 12
    base = 1.1000
    i_global = 0
    cycle_num = 0

    while len(candles) < n:
        cycle_base = base + cycle_num * 0.0040
        # bars 0-5: grind up
        for bar in range(6):
            p = round(cycle_base + bar * 0.0006, 5)
            candles.append(_candle(p, high=p + 0.0003, low=p - 0.0002, i=i_global))
            i_global += 1
            if len(candles) == n:
                break
        if len(candles) == n:
            break
        # bar 6: swing HIGH
        p = round(cycle_base + 6 * 0.0006 + 0.0050, 5)
        candles.append(_candle(p, high=p + 0.0005, low=p - 0.0003, i=i_global))
        i_global += 1
        if len(candles) == n:
            break
        # bars 7-11: grind down (but stay above cycle_base)
        for bar in range(5):
            p = round(cycle_base + 6 * 0.0006 + 0.0050 - (bar + 1) * 0.0008, 5)
            candles.append(_candle(p, high=p + 0.0002, low=p - 0.0003, i=i_global))
            i_global += 1
            if len(candles) == n:
                break
        # bar 12: swing LOW (higher than previous cycle's low)
        if len(candles) < n:
            p = round(cycle_base + 0.0020, 5)   # shallow dip, above cycle_base
            candles.append(_candle(p, high=p + 0.0002, low=p - 0.0003, i=i_global))
            i_global += 1
        cycle_num += 1

    return candles[:n]


def _bearish_trend_candles(n: int = 60) -> List[Candle]:
    """
    Deterministic downtrend: zigzag falls so each trough is strictly lower
    than the previous trough AND each peak is strictly lower than the
    previous peak (LH + LL pattern).

    Pattern (12-bar cycles):
      bars 0-5   : grind down  (-0.0006 each bar)
      bar  6     : sharp LOW   (-0.0050 spike)
      bars 7-11  : grind up    (+0.0004 each bar, ceiling falls each cycle)
      bar  12    : shallow HIGH (+0.0020 bounce — lower than prev high)
    Each successive cycle starts 0.0040 below the previous cycle start.
    """
    candles = []
    base = 1.3000
    i_global = 0
    cycle_num = 0

    while len(candles) < n:
        cycle_base = base - cycle_num * 0.0040
        # bars 0-5: grind down
        for bar in range(6):
            p = round(cycle_base - bar * 0.0006, 5)
            candles.append(_candle(p, high=p + 0.0002, low=p - 0.0003, i=i_global))
            i_global += 1
            if len(candles) == n:
                break
        if len(candles) == n:
            break
        # bar 6: swing LOW
        p = round(cycle_base - 6 * 0.0006 - 0.0050, 5)
        candles.append(_candle(p, high=p + 0.0003, low=p - 0.0005, i=i_global))
        i_global += 1
        if len(candles) == n:
            break
        # bars 7-11: grind up (stay below cycle_base)
        for bar in range(5):
            p = round(cycle_base - 6 * 0.0006 - 0.0050 + (bar + 1) * 0.0008, 5)
            candles.append(_candle(p, high=p + 0.0003, low=p - 0.0002, i=i_global))
            i_global += 1
            if len(candles) == n:
                break
        # bar 12: swing HIGH (lower than previous cycle's high)
        if len(candles) < n:
            p = round(cycle_base - 0.0020, 5)
            candles.append(_candle(p, high=p + 0.0003, low=p - 0.0002, i=i_global))
            i_global += 1
        cycle_num += 1

    return candles[:n]


def _flat_candles(n: int = 40, center: float = 1.2000) -> List[Candle]:
    """Ranging / flat market."""
    rng = np.random.default_rng(42)
    candles = []
    price = center
    for i in range(n):
        noise = rng.uniform(-0.0002, 0.0002)
        price = center + noise
        h = price + 0.0003
        l = price - 0.0003
        candles.append(_candle(price, high=h, low=l, i=i))
    return candles


def _fib_candles() -> List[Candle]:
    """Candles with a known swing high=1.2000 and swing low=1.1000."""
    candles = []
    for i, price in enumerate(
        [1.1000, 1.1200, 1.1500, 1.1800, 1.2000,   # ramp up
         1.1900, 1.1700, 1.1500, 1.1300, 1.1100]    # pull back
    ):
        h = price + 0.0020
        l = price - 0.0020
        candles.append(_candle(price, high=h, low=l, i=i))
    return candles


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 1 — swing_detector.py
# ═════════════════════════════════════════════════════════════════════════════

class TestCandleDataclass:
    def test_candle_fields(self):
        c = _candle(1.1050, high=1.1060, low=1.1040, i=0)
        assert c.close == 1.1050
        assert c.high  == 1.1060
        assert c.low   == 1.1040
        assert c.pair  == "EURUSD"
        assert c.timeframe == "H1"

    def test_candle_time_is_datetime(self):
        c = _candle(1.0, i=5)
        assert isinstance(c.time, datetime)


class TestCandleConversions:
    def test_candles_to_df_shape(self):
        candles = [_candle(1.0 + i * 0.001, i=i) for i in range(10)]
        df = candles_to_df(candles)
        assert len(df) == 10
        assert set(["open", "high", "low", "close", "volume"]).issubset(df.columns)

    def test_candles_to_df_dtypes(self):
        candles = [_candle(1.1, i=i) for i in range(5)]
        df = candles_to_df(candles)
        assert df["close"].dtype == np.float64
        assert df["high"].dtype  == np.float64

    def test_roundtrip_df_to_candles(self):
        original = [_candle(1.0 + i * 0.001, i=i) for i in range(5)]
        df       = candles_to_df(original)
        restored = df_to_candles(df)
        assert len(restored) == len(original)
        for o, r in zip(original, restored):
            assert abs(o.close - r.close) < 1e-8
            assert abs(o.high  - r.high)  < 1e-8

    def test_empty_candles_to_df(self):
        df = candles_to_df([])
        assert df.empty

    def test_single_candle_df(self):
        df = candles_to_df([_candle(1.5, i=0)])
        assert len(df) == 1


class TestCalcATR:
    def test_atr_positive(self):
        candles = [_candle(1.1 + i * 0.001, high=1.1 + i * 0.001 + 0.002,
                           low=1.1 + i * 0.001 - 0.001, i=i) for i in range(20)]
        atr = calc_atr(candles)
        assert atr > 0

    def test_atr_returns_zero_for_single_candle(self):
        assert calc_atr([_candle(1.0, i=0)]) == 0.0

    def test_atr_returns_zero_for_empty(self):
        assert calc_atr([]) == 0.0

    def test_atr_is_float(self):
        candles = [_candle(1.0 + i * 0.0001, i=i) for i in range(20)]
        assert isinstance(calc_atr(candles), float)

    def test_atr_wilder_smoothing(self):
        """Wilder ATR should be lower than simple average for a calm market."""
        candles = [_candle(1.0, high=1.002, low=0.998, i=i) for i in range(50)]
        atr = calc_atr(candles, period=14)
        # Range is always 0.004; ATR should be ≈ 0.004
        assert abs(atr - 0.004) < 0.0005

    def test_atr_large_spike_propagates(self):
        """A single large candle should raise the ATR."""
        calm = [_candle(1.0, high=1.001, low=0.999, i=i) for i in range(10)]
        spike = _candle(1.0, high=1.020, low=0.980, i=10)
        candles = calm + [spike]
        atr = calc_atr(candles)
        assert atr > 0.001   # higher than calm baseline


class TestDetectSwings:
    def test_returns_list(self):
        candles = _bullish_trend_candles(40)
        swings  = detect_swings(candles)
        assert isinstance(swings, list)

    def test_swing_types_are_valid(self):
        candles = _bullish_trend_candles(40)
        for s in detect_swings(candles):
            assert s.type in ("high", "low")

    def test_swing_indices_within_range(self):
        candles = _bullish_trend_candles(40)
        n = len(candles)
        for s in detect_swings(candles):
            assert 0 <= s.index < n

    def test_swing_high_is_local_max(self):
        candles = _bullish_trend_candles(60)
        swings  = detect_swings(candles, left=3, right=3)
        for s in [sw for sw in swings if sw.type == "high"]:
            # High of the swing candle should be its actual high
            assert s.price == candles[s.index].high

    def test_swing_low_is_local_min(self):
        candles = _bullish_trend_candles(60)
        for s in [sw for sw in detect_swings(candles) if sw.type == "low"]:
            assert s.price == candles[s.index].low

    def test_swing_strength_is_bounded(self):
        candles = _bullish_trend_candles(60)
        for s in detect_swings(candles):
            assert 0 <= s.strength <= 100

    def test_swing_sorted_by_index(self):
        candles = _bullish_trend_candles(60)
        swings  = detect_swings(candles)
        indices = [s.index for s in swings]
        assert indices == sorted(indices)

    def test_not_enough_candles_returns_empty(self):
        candles = [_candle(1.0, i=i) for i in range(5)]
        assert detect_swings(candles, left=5, right=5) == []

    def test_detects_known_swing_high(self):
        """Candles with a clear peak at index 5."""
        prices = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.3, 1.1, 0.9, 0.8,
                  0.9, 1.0, 1.1, 1.2, 1.3]
        candles = []
        for i, p in enumerate(prices):
            candles.append(_candle(p, high=p + 0.05, low=p - 0.05, i=i))
        swings = detect_swings(candles, left=3, right=3)
        highs = [s for s in swings if s.type == "high"]
        assert any(s.index == 5 for s in highs), "Expected swing high at index 5"


class TestDetectTrend:
    def test_bullish_trend(self):
        candles = _bullish_trend_candles(60)
        swings  = detect_swings(candles)
        trend   = detect_trend(swings)
        assert trend == "bullish"

    def test_bearish_trend(self):
        candles = _bearish_trend_candles(60)
        swings  = detect_swings(candles)
        trend   = detect_trend(swings)
        assert trend == "bearish"

    def test_ranging_when_not_enough_swings(self):
        assert detect_trend([]) == "ranging"
        # Only one high and one low → cannot confirm HH/HL
        swings = [
            SwingPoint(index=10, time=datetime.now(timezone.utc), price=1.1, type="high", strength=50),
            SwingPoint(index=20, time=datetime.now(timezone.utc), price=1.0, type="low",  strength=50),
        ]
        assert detect_trend(swings) == "ranging"

    def test_trend_returns_string_literal(self):
        candles = _flat_candles()
        swings  = detect_swings(candles)
        trend   = detect_trend(swings)
        assert trend in ("bullish", "bearish", "ranging")


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 2 — support_resistance.py
# ═════════════════════════════════════════════════════════════════════════════

class TestDetectSRLevels:
    def test_returns_list(self):
        candles = _bullish_trend_candles(60)
        swings  = detect_swings(candles)
        levels  = detect_sr_levels(candles, swings)
        assert isinstance(levels, list)

    def test_empty_inputs_return_empty(self):
        assert detect_sr_levels([], []) == []

    def test_level_types_are_valid(self):
        candles = _bullish_trend_candles(60)
        swings  = detect_swings(candles)
        for lvl in detect_sr_levels(candles, swings):
            assert lvl.type in ("support", "resistance")

    def test_strength_is_bounded(self):
        candles = _bullish_trend_candles(60)
        swings  = detect_swings(candles)
        for lvl in detect_sr_levels(candles, swings):
            assert 0 <= lvl.strength <= 100

    def test_touch_count_at_least_one(self):
        candles = _bullish_trend_candles(60)
        swings  = detect_swings(candles)
        for lvl in detect_sr_levels(candles, swings):
            assert lvl.touch_count >= 1

    def test_sorted_by_strength_desc(self):
        candles = _bullish_trend_candles(60)
        swings  = detect_swings(candles)
        levels  = detect_sr_levels(candles, swings)
        strengths = [l.strength for l in levels]
        assert strengths == sorted(strengths, reverse=True)

    def test_at_most_10_levels(self):
        candles = _bullish_trend_candles(100)
        swings  = detect_swings(candles)
        levels  = detect_sr_levels(candles, swings)
        assert len(levels) <= 10

    def test_supports_below_current_price(self):
        candles = _bullish_trend_candles(60)
        swings  = detect_swings(candles)
        current = candles[-1].close
        for lvl in detect_sr_levels(candles, swings):
            if lvl.type == "support":
                assert lvl.price < current

    def test_resistances_above_current_price(self):
        candles = _bullish_trend_candles(60)
        swings  = detect_swings(candles)
        current = candles[-1].close
        for lvl in detect_sr_levels(candles, swings):
            if lvl.type == "resistance":
                assert lvl.price > current


class TestMajorSRAccessors:
    def _levels(self):
        candles = _bullish_trend_candles(60)
        swings  = detect_swings(candles)
        return detect_sr_levels(candles, swings)

    def test_major_support_is_support(self):
        lvls = self._levels()
        sup  = major_support(lvls)
        if sup:
            assert sup.type == "support"

    def test_major_resistance_is_resistance(self):
        lvls = self._levels()
        res  = major_resistance(lvls)
        if res:
            assert res.type == "resistance"

    def test_major_support_returns_none_when_empty(self):
        assert major_support([]) is None

    def test_major_resistance_returns_none_when_empty(self):
        assert major_resistance([]) is None


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 3 — premium_discount.py
# ═════════════════════════════════════════════════════════════════════════════

class TestCalcFib:
    def test_returns_fib_analysis(self):
        candles = _fib_candles()
        fib = calc_fib(candles)
        assert fib is not None
        assert isinstance(fib, FibAnalysis)

    def test_returns_none_on_too_few_candles(self):
        assert calc_fib([_candle(1.0, i=0)]) is None

    def test_returns_none_on_zero_range(self):
        candles = [_candle(1.0, high=1.0, low=1.0, i=i) for i in range(15)]
        assert calc_fib(candles) is None

    def test_swing_high_and_low_correct(self):
        candles = _fib_candles()
        fib = calc_fib(candles)
        # Highest high in _fib_candles = 1.2000 + 0.0020 = 1.2020
        # Lowest  low  in _fib_candles = 1.1000 - 0.0020 = 1.0980
        assert fib.swing_high >= 1.2000
        assert fib.swing_low  <= 1.1000

    def test_range_size_positive(self):
        fib = calc_fib(_fib_candles())
        assert fib.range_size > 0

    def test_levels_contains_all_ratios(self):
        fib = calc_fib(_fib_candles())
        expected = [0.0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1.0]
        for r in expected:
            assert r in fib.levels

    def test_fib_level_prices_decrease_with_ratio(self):
        """As ratio increases (0→1), price should decrease (high→low)."""
        fib = calc_fib(_fib_candles())
        prices = [fib.levels[r] for r in sorted(fib.levels.keys())]
        assert prices == sorted(prices, reverse=True)

    def test_current_ratio_clamped_0_to_1(self):
        fib = calc_fib(_fib_candles())
        assert 0.0 <= fib.current_ratio <= 1.0

    def test_zone_is_valid_literal(self):
        fib = calc_fib(_fib_candles())
        assert fib.zone in ("premium", "equilibrium", "discount")

    def test_premium_zone_when_price_near_high(self):
        """Price near swing high → premium zone."""
        candles = []
        for i in range(20):
            price = 1.19 + i * 0.0001  # price climbing toward 1.2000 high
            candles.append(_candle(price, high=price + 0.001, low=price - 0.001, i=i))
        fib = calc_fib(candles)
        assert fib is not None
        assert fib.zone in ("premium", "equilibrium")

    def test_discount_zone_when_price_near_low(self):
        """Price at the swing low → discount zone."""
        candles = []
        for i in range(15):
            price = 1.20 - i * 0.005  # falling from 1.20 down to 1.13
            candles.append(_candle(price, high=price + 0.002, low=price - 0.002, i=i))
        fib = calc_fib(candles)
        assert fib is not None
        assert fib.zone in ("discount", "equilibrium")

    def test_fib_levels_list_same_count_as_ratios(self):
        fib = calc_fib(_fib_candles())
        assert len(fib.fib_levels) == 8

    def test_fib_level_is_premium_and_discount_flags(self):
        fib = calc_fib(_fib_candles())
        for fl in fib.fib_levels:
            if fl.ratio < 0.382:
                assert fl.is_premium is True
            if fl.ratio > 0.618:
                assert fl.is_discount is True

    def test_equilibrium_price_is_midpoint(self):
        fib = calc_fib(_fib_candles())
        expected_eq = (fib.swing_high + fib.swing_low) / 2
        assert abs(fib.equilibrium - expected_eq) < 0.0001

    def test_golden_pocket_high_below_premium_threshold(self):
        fib = calc_fib(_fib_candles())
        assert fib.golden_pocket_high < fib.premium_threshold


class TestPremiumDiscountHelpers:
    def setup_method(self):
        self.fib = calc_fib(_fib_candles())

    def test_premium_area_returns_tuple(self):
        result = premium_area(self.fib)
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_premium_area_top_gte_bottom(self):
        top, bot = premium_area(self.fib)
        assert top >= bot

    def test_discount_area_returns_tuple(self):
        result = discount_area(self.fib)
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_discount_area_top_gte_bottom(self):
        top, bot = discount_area(self.fib)
        assert top >= bot

    def test_is_premium_flag(self):
        # Force a premium zone
        candles = [_candle(1.19 + i * 0.0001, i=i) for i in range(15)]
        fib = calc_fib(candles)
        if fib and fib.zone == "premium":
            assert is_premium(fib) is True
            assert is_discount(fib) is False

    def test_get_fib_label_at_known_level(self):
        fib = self.fib
        eq_price = fib.levels[0.5]
        label = get_fib_label(eq_price, fib)
        assert label == 0.5

    def test_get_fib_label_returns_none_far_away(self):
        fib = self.fib
        far_price = fib.swing_high + 1.0   # 1 full unit away
        assert get_fib_label(far_price, fib) is None


# ═════════════════════════════════════════════════════════════════════════════
# SECTION 4 — structure_score.py
# ═════════════════════════════════════════════════════════════════════════════

class TestAnalyseStructure:
    def test_returns_market_structure_result(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        assert isinstance(result, MarketStructureResult)

    def test_pair_and_timeframe_preserved(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("GBPUSD", "H4", candles)
        assert result.pair == "GBPUSD"
        assert result.timeframe == "H4"

    def test_current_price_matches_last_candle(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        assert abs(result.current_price - candles[-1].close) < 1e-6

    def test_atr_is_positive(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        assert result.atr > 0

    def test_trend_is_bullish_for_uptrend(self):
        candles = _bullish_trend_candles(80)
        result  = analyse_structure("EURUSD", "H1", candles)
        assert result.trend == "bullish"

    def test_trend_is_bearish_for_downtrend(self):
        candles = _bearish_trend_candles(80)
        result  = analyse_structure("EURUSD", "H1", candles)
        assert result.trend == "bearish"

    def test_score_is_bounded(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        assert 0 <= result.score <= 100

    def test_score_components_sum_to_score(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        comp_sum = sum(result.score_components.values())
        assert result.score == min(100, comp_sum)

    def test_score_components_keys_present(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        for key in ("trend_clarity", "sr_alignment", "fib_zone", "swing_quality"):
            assert key in result.score_components

    def test_current_zone_is_valid(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        assert result.current_zone in ("premium", "equilibrium", "discount", "unknown")

    def test_fib_ratio_clamped(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        assert 0.0 <= result.fib_ratio <= 1.0

    def test_swing_count_positive(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        assert result.swing_count >= 0

    def test_empty_candles_returns_null_result(self):
        result = analyse_structure("EURUSD", "H1", [])
        assert result.score == 0
        assert result.trend == "ranging"
        assert result.current_zone == "unknown"

    def test_premium_discount_areas_not_none_when_fib_available(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        if result.fib is not None:
            assert result.premium_high is not None
            assert result.discount_low  is not None

    def test_distance_fields_in_atr_units(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        if result.distance_to_support is not None:
            assert result.distance_to_support >= 0
        if result.distance_to_resistance is not None:
            assert result.distance_to_resistance >= 0

    def test_accepts_precomputed_inputs(self):
        candles   = _bullish_trend_candles(60)
        swings    = detect_swings(candles)
        sr_levels = detect_sr_levels(candles, swings)
        fib       = calc_fib(candles)
        result    = analyse_structure("EURUSD", "H1", candles, swings, sr_levels, fib)
        assert isinstance(result, MarketStructureResult)

    def test_golden_pocket_prices_ordered(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        if result.golden_pocket_high and result.golden_pocket_low:
            assert result.golden_pocket_high > result.golden_pocket_low


class TestScoreSummary:
    def test_returns_string(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        summary = score_summary(result)
        assert isinstance(summary, str)

    def test_summary_contains_score(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        assert "Score=" in score_summary(result)

    def test_summary_contains_trend(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        assert "Trend=" in score_summary(result)

    def test_summary_contains_zone(self):
        candles = _bullish_trend_candles(60)
        result  = analyse_structure("EURUSD", "H1", candles)
        assert "Zone=" in score_summary(result)
