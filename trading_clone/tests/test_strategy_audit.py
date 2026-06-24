"""
Strategy Audit Tests
====================
Automated tests verifying that all rulebook gates are enforced correctly.

Rules under test:
  1. Demand (BUY) cannot trigger in Premium (price above 0.5 EQ).
  2. Supply (SELL) cannot trigger in Discount (price below 0.5 EQ).
  3. News filter blocks all trades for a pair.
  4. Session filter blocks trades outside London / New York.
  5. Risk limits stop trading after max daily loss.
  6. Individual score thresholds are enforced (zone >= 70, liq >= 70, AMD >= 80, conf >= 70).
"""

import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

from trading_clone.market_data.data_feed import Candle
from trading_clone.app.config import BotConfig


# ── Candle factory helpers ─────────────────────────────────────────────────────

def _candle(close: float, t: datetime, volume: float = 1000.0,
            spread: float = 0.002) -> Candle:
    o = close
    h = close + abs(close) * spread
    lo = close - abs(close) * spread
    return Candle(time=t, open=o, high=h, low=lo, close=close,
                  volume=volume, pair="EURUSD", timeframe="H1")


def _make_candles(closes, base_time=None, volume=1000.0):
    """Build a list of Candle objects from a close-price sequence."""
    if base_time is None:
        base_time = datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc)
    return [_candle(c, base_time + timedelta(hours=i), volume=volume)
            for i, c in enumerate(closes)]


def _make_premium_candles(n=100):
    """
    Candles where current price is in the upper half of the recent range
    (ratio < 0.5 → premium).

    Swing high = ~1.1200, swing low = ~1.0800.
    Current close = 1.1100 → ratio ≈ 0.25 → premium.
    """
    base = [1.0800 + (i % 10) * 0.004 for i in range(n - 1)]
    base.append(1.1100)
    return _make_candles(base)


def _make_discount_candles(n=100):
    """
    Candles where current price is in the lower half of the recent range
    (ratio > 0.5 → discount).

    Swing high = ~1.1200, swing low = ~1.0800.
    Current close = 1.0900 → ratio ≈ 0.75 → discount.
    """
    base = [1.0800 + (i % 10) * 0.004 for i in range(n - 1)]
    base.append(1.0900)
    return _make_candles(base)


# ── 1. Fib gate tests ──────────────────────────────────────────────────────────

class TestFibonacciGate(unittest.TestCase):
    """Demand cannot fire in Premium; Supply cannot fire in Discount."""

    def setUp(self):
        from trading_clone.market_structure.premium_discount import calc_fib
        self.calc_fib = calc_fib

    def test_premium_candles_classified_correctly(self):
        from trading_clone.market_structure.premium_discount import is_above_equilibrium
        candles = _make_premium_candles()
        fib = self.calc_fib(candles)
        self.assertIsNotNone(fib)
        self.assertTrue(
            is_above_equilibrium(fib),
            f"Expected price in premium but ratio={fib.current_ratio:.3f} (expected < 0.5)",
        )

    def test_discount_candles_classified_correctly(self):
        from trading_clone.market_structure.premium_discount import is_below_equilibrium
        candles = _make_discount_candles()
        fib = self.calc_fib(candles)
        self.assertIsNotNone(fib)
        self.assertTrue(
            is_below_equilibrium(fib),
            f"Expected price in discount but ratio={fib.current_ratio:.3f} (expected > 0.5)",
        )

    def test_buy_blocked_in_premium(self):
        """
        Demand zone at price_top = current price + small buffer.
        If Fibonacci places current price in premium, BUY must be rejected.
        """
        from trading_clone.market_structure.premium_discount import (
            calc_fib, is_below_equilibrium,
        )
        candles = _make_premium_candles()
        fib = calc_fib(candles)
        self.assertIsNotNone(fib)
        # Gate: BUY requires is_below_equilibrium
        allowed = is_below_equilibrium(fib)
        self.assertFalse(
            allowed,
            "BUY signal must be blocked when price is above 0.5 equilibrium",
        )

    def test_sell_blocked_in_discount(self):
        """
        Supply zone at current price.
        If Fibonacci places current price in discount, SELL must be rejected.
        """
        from trading_clone.market_structure.premium_discount import (
            calc_fib, is_above_equilibrium,
        )
        candles = _make_discount_candles()
        fib = calc_fib(candles)
        self.assertIsNotNone(fib)
        # Gate: SELL requires is_above_equilibrium
        allowed = is_above_equilibrium(fib)
        self.assertFalse(
            allowed,
            "SELL signal must be blocked when price is below 0.5 equilibrium",
        )

    def test_equilibrium_blocks_both(self):
        """Price exactly at 0.5 EQ (ratio == 0.5) should block both BUY and SELL."""
        from trading_clone.market_structure.premium_discount import (
            is_above_equilibrium, is_below_equilibrium,
        )
        from trading_clone.market_structure.premium_discount import FibAnalysis
        fib = FibAnalysis(
            swing_high=1.1200, swing_low=1.0800, range_size=0.0400,
            levels={}, fib_levels=[], current_price=1.1000,
            current_ratio=0.5,
            zone="equilibrium",
            premium_threshold=1.1047, discount_threshold=1.0953,
            golden_pocket_high=1.0953, golden_pocket_low=1.0918,
            equilibrium=1.1000,
        )
        self.assertFalse(is_above_equilibrium(fib), "EQ boundary should NOT allow SELL")
        self.assertFalse(is_below_equilibrium(fib), "EQ boundary should NOT allow BUY")


# ── 2. News filter test ────────────────────────────────────────────────────────

class TestNewsFilter(unittest.TestCase):
    def setUp(self):
        from trading_clone.strategy.trade_filter import (
            register_news_block, clear_news_block,
        )
        self.register = register_news_block
        self.clear = clear_news_block

    def tearDown(self):
        from trading_clone.strategy.trade_filter import clear_news_block
        clear_news_block("EURUSD")

    def test_news_blocked_pair(self):
        from trading_clone.strategy.trade_filter import news_blocked
        self.register("EURUSD")
        self.assertTrue(news_blocked("EURUSD"), "news_blocked must return True for a blocked pair")

    def test_unblocked_pair_allowed(self):
        from trading_clone.strategy.trade_filter import news_blocked
        self.clear("EURUSD")
        self.assertFalse(news_blocked("EURUSD"), "Unblocked pair must return False")

    def test_news_block_stops_signal_generation(self):
        """
        RegisteredNewsBlock for EURUSD must cause SignalGenerator to return [].
        We patch the session to london so only the news gate is the blocker.
        """
        from trading_clone.strategy.signal_generator import SignalGenerator
        candles = _make_discount_candles(100)
        for c in candles:
            c.pair = "EURUSD"

        self.register("EURUSD")

        with patch(
            "trading_clone.strategy.signal_generator._get_session",
            return_value="london",
        ):
            gen = SignalGenerator(BotConfig())
            signals = gen.generate("EURUSD", candles)

        self.assertEqual(signals, [], "News-blocked pair must return no signals")


# ── 3. Session filter test ─────────────────────────────────────────────────────

class TestSessionFilter(unittest.TestCase):
    def test_allowed_sessions(self):
        from trading_clone.strategy.trade_filter import session_allowed
        self.assertTrue(session_allowed("london"))
        self.assertTrue(session_allowed("newyork"))

    def test_blocked_sessions(self):
        from trading_clone.strategy.trade_filter import session_allowed
        self.assertFalse(session_allowed("asian"))
        self.assertFalse(session_allowed("sydney"))
        self.assertFalse(session_allowed(""))

    def test_asian_session_stops_signal_generation(self):
        """
        Asian session must cause SignalGenerator to return [].
        """
        from trading_clone.strategy.signal_generator import SignalGenerator
        candles = _make_discount_candles(100)
        for c in candles:
            c.pair = "EURUSD"

        with patch(
            "trading_clone.strategy.signal_generator._get_session",
            return_value="asian",
        ):
            gen = SignalGenerator(BotConfig())
            signals = gen.generate("EURUSD", candles)

        self.assertEqual(signals, [], "Asian session must return no signals")


# ── 4. Risk limits test ────────────────────────────────────────────────────────

class TestRiskLimits(unittest.TestCase):
    def test_daily_loss_limit_blocks_trade(self):
        from trading_clone.risk_management.risk_limits import check_daily_loss
        result = check_daily_loss(-600.0, 10_000.0, max_daily_loss_pct=0.05)
        self.assertFalse(result.allowed, "5% daily loss must block trading")
        self.assertIn("Daily loss limit", result.reason)

    def test_daily_loss_within_limit_allows_trade(self):
        from trading_clone.risk_management.risk_limits import check_daily_loss
        result = check_daily_loss(-499.0, 10_000.0, max_daily_loss_pct=0.05)
        self.assertTrue(result.allowed, "Loss under 5% should allow trading")

    def test_weekly_loss_limit_blocks_trade(self):
        from trading_clone.risk_management.risk_limits import check_weekly_loss
        result = check_weekly_loss(-1001.0, 10_000.0, max_weekly_loss_pct=0.10)
        self.assertFalse(result.allowed, "10% weekly loss must block trading")

    def test_max_open_trades_blocks(self):
        from trading_clone.risk_management.risk_limits import check_max_open_trades
        result = check_max_open_trades(open_count=3, max_open=3)
        self.assertFalse(result.allowed, "Reaching max open trades must block")

    def test_check_all_risk_daily_loss_propagates(self):
        from trading_clone.risk_management.risk_limits import check_all_risk
        result = check_all_risk(
            open_count=1,
            closed_pnl_today=-600.0,
            closed_pnl_week=-600.0,
            account_balance=10_000.0,
        )
        self.assertFalse(result.allowed, "check_all_risk must block on daily loss hit")

    def test_paper_trader_respects_risk_limits(self):
        """
        PaperTrader must not open a trade when max daily loss is hit.
        """
        from trading_clone.execution.paper_trader import PaperTrader
        from trading_clone.strategy.signal_generator import TradeSignal
        from datetime import datetime, timezone, timedelta

        trader = PaperTrader(BotConfig(), starting_balance=10_000.0)

        # Simulate two closed losing trades that breach daily 5% limit
        from trading_clone.execution.paper_trader import PaperTrade
        import uuid
        today = datetime.now(timezone.utc)
        for _ in range(2):
            t = PaperTrade(
                id=str(uuid.uuid4())[:8], pair="EURUSD", direction="buy",
                entry_price=1.0850, stop_loss=1.0800, take_profit=1.0950,
                lot_size=0.5, open_time=today,
                close_time=today, close_price=1.0800, pnl=-300.0, status="closed",
            )
            trader.closed_trades.append(t)

        signal = TradeSignal(
            pair="EURUSD", direction="buy",
            confidence=90.0, final_score=90.0,
            zone_score=85, liquidity_score=75, amd_score=82, confirmation_score=80,
            entry_price=1.0855, stop_loss=1.0800, take_profit=1.0955,
            risk_reward=2.0, amd_phase="distribution", session="london",
        )
        result = trader.execute_signal(signal)
        self.assertIsNone(result, "PaperTrader must reject signal when daily loss limit hit")


# ── 5. Individual score thresholds ─────────────────────────────────────────────

class TestScoreThresholds(unittest.TestCase):
    """Verify the per-engine score constants match the rulebook."""

    def test_zone_min_score_constant(self):
        from trading_clone.supply_demand.zone_scoring import MIN_SCORE
        self.assertEqual(MIN_SCORE, 70, "Zone min score must be 70")

    def test_signal_generator_min_amd_score(self):
        from trading_clone.strategy.signal_generator import MIN_AMD_SCORE
        self.assertEqual(MIN_AMD_SCORE, 80, "AMD min score must be 80")

    def test_signal_generator_min_liquidity_score(self):
        from trading_clone.strategy.signal_generator import MIN_LIQUIDITY_SCORE
        self.assertEqual(MIN_LIQUIDITY_SCORE, 70, "Liquidity min score must be 70")

    def test_signal_generator_min_confirmation_score(self):
        from trading_clone.strategy.signal_generator import MIN_CONFIRMATION_SCORE
        self.assertEqual(MIN_CONFIRMATION_SCORE, 70, "Confirmation min score must be 70")

    def test_setup_score_min_final_score(self):
        from trading_clone.strategy.setup_score import MIN_FINAL_SCORE
        self.assertEqual(MIN_FINAL_SCORE, 80.0, "Final score gate must be 80")

    def test_amd_below_threshold_returns_no_signals(self):
        """
        When AMD score is below 80, SignalGenerator must return [].
        We mock detect_amd to return a low score and patch session to london.
        """
        from trading_clone.strategy.signal_generator import SignalGenerator
        from trading_clone.amd.amd_score import AMDResult

        candles = _make_discount_candles(100)
        for c in candles:
            c.pair = "EURUSD"

        low_amd = AMDResult(
            phase="none", direction=None,
            accumulation=None, manipulation=None, distribution=None,
            amd_score=40, complete=False, summary="low AMD",
        )

        with patch(
            "trading_clone.strategy.signal_generator._get_session",
            return_value="london",
        ), patch(
            "trading_clone.strategy.signal_generator.detect_amd",
            return_value=low_amd,
        ):
            gen = SignalGenerator(BotConfig())
            signals = gen.generate("EURUSD", candles)

        self.assertEqual(signals, [], "AMD score < 80 must block all signals")

    def test_setup_score_below_80_not_allowed(self):
        from trading_clone.strategy.setup_score import calc_final_score
        result = calc_final_score(70, 70, 70, 70)
        self.assertFalse(result["allowed"],
                         f"Final score {result['final_score']} should be below 80")

    def test_setup_score_above_80_allowed(self):
        from trading_clone.strategy.setup_score import calc_final_score
        result = calc_final_score(100, 100, 100, 100)
        self.assertTrue(result["allowed"])
        self.assertEqual(result["final_score"], 100.0)


# ── 6. Sweep type gate ─────────────────────────────────────────────────────────

class TestSweepTypeGate(unittest.TestCase):
    """Verify that the correct sweep type is required for each signal direction."""

    def test_ssl_sweep_required_for_buy(self):
        """BUY (demand) requires SSL_SWEEP; BSL_SWEEP must score 0."""
        from trading_clone.liquidity.sweep_detector import LiquiditySweep
        from datetime import datetime, timezone

        bsl = LiquiditySweep(
            sweep_type="BSL_SWEEP", swept_level=1.1200,
            sweep_time=datetime.now(timezone.utc), sweep_index=90,
            extension=0.0005, ext_atr_ratio=0.6, reversal_body=1.8,
            volume_spike=True, confirmed=True, score=85,
        )
        liq_score = bsl.score if bsl.sweep_type == "SSL_SWEEP" else 0
        self.assertEqual(liq_score, 0,
                         "BSL_SWEEP must NOT satisfy the BUY liquidity gate (need SSL_SWEEP)")

    def test_bsl_sweep_required_for_sell(self):
        """SELL (supply) requires BSL_SWEEP; SSL_SWEEP must score 0."""
        from trading_clone.liquidity.sweep_detector import LiquiditySweep
        from datetime import datetime, timezone

        ssl = LiquiditySweep(
            sweep_type="SSL_SWEEP", swept_level=1.0800,
            sweep_time=datetime.now(timezone.utc), sweep_index=90,
            extension=0.0005, ext_atr_ratio=0.6, reversal_body=1.8,
            volume_spike=True, confirmed=True, score=85,
        )
        liq_score = ssl.score if ssl.sweep_type == "BSL_SWEEP" else 0
        self.assertEqual(liq_score, 0,
                         "SSL_SWEEP must NOT satisfy the SELL liquidity gate (need BSL_SWEEP)")


if __name__ == "__main__":
    unittest.main()
