import unittest
from datetime import datetime, timezone, timedelta
from trading_clone.market_data.data_feed import Candle
from trading_clone.market_structure.swing_detector import detect_swings, detect_trend, calc_atr


def make_candles(closes):
    candles = []
    now = datetime.now(timezone.utc)
    for i, c in enumerate(closes):
        t = now + timedelta(hours=i)
        spread = abs(c) * 0.002
        candles.append(Candle(
            time=t, open=c, high=c + spread, low=c - spread, close=c,
            volume=1000, pair="EURUSD", timeframe="H1",
        ))
    return candles


class TestSwingDetector(unittest.TestCase):
    def test_atr_positive(self):
        candles = make_candles([1.08, 1.085, 1.079, 1.090, 1.095, 1.088, 1.100, 1.095,
                                 1.105, 1.098, 1.110, 1.102, 1.115, 1.108, 1.120])
        atr = calc_atr(candles)
        self.assertGreater(atr, 0)

    def test_swing_detection_returns_list(self):
        prices = [1.08, 1.09, 1.10, 1.09, 1.08, 1.07, 1.08, 1.09, 1.10, 1.11,
                  1.10, 1.09, 1.08, 1.09, 1.10, 1.11, 1.12, 1.11, 1.10, 1.09]
        candles = make_candles(prices)
        swings = detect_swings(candles, left=2, right=2)
        self.assertIsInstance(swings, list)

    def test_trend_detection(self):
        from trading_clone.market_structure.swing_detector import SwingPoint
        from datetime import datetime
        highs = [SwingPoint(i * 2, datetime.now(timezone.utc), 1.08 + i * 0.01, "high") for i in range(3)]
        lows = [SwingPoint(i * 2 + 1, datetime.now(timezone.utc), 1.07 + i * 0.01, "low") for i in range(3)]
        trend = detect_trend(highs + lows)
        self.assertEqual(trend, "bullish")


class TestAMDDetection(unittest.TestCase):
    def test_null_amd_short_candles(self):
        from trading_clone.amd.amd_score import detect_amd
        candles = make_candles([1.08, 1.09, 1.10])
        result = detect_amd(candles, [])
        self.assertEqual(result.phase, "none")

    def test_amd_returns_dataclass(self):
        from trading_clone.amd.amd_score import detect_amd, AMDSequence
        prices = [1.08 + (i % 5) * 0.001 for i in range(60)]
        candles = make_candles(prices)
        result = detect_amd(candles, [])
        self.assertIsInstance(result, AMDSequence)
        self.assertIn(result.phase, ["none", "accumulation", "manipulation", "distribution"])


class TestSignalGenerator(unittest.TestCase):
    def test_returns_list(self):
        from trading_clone.strategy.signal_generator import SignalGenerator
        from trading_clone.app.config import BotConfig
        prices = [1.0850 + (i % 20) * 0.0002 for i in range(100)]
        candles = make_candles(prices)
        for c in candles:
            c.pair = "EURUSD"
        gen = SignalGenerator(BotConfig())
        signals = gen.generate("EURUSD", candles)
        self.assertIsInstance(signals, list)


class TestRiskManagement(unittest.TestCase):
    def test_position_size(self):
        from trading_clone.risk_management.position_size import calc_position_size
        lots = calc_position_size(10_000, 0.01, 1.0850, 1.0800, "EURUSD")
        self.assertGreater(lots, 0)
        self.assertLess(lots, 10)

    def test_daily_loss_check(self):
        from trading_clone.risk_management.risk_limits import check_daily_loss
        result = check_daily_loss(-600, 10_000, 0.05)
        self.assertFalse(result.allowed)
        result2 = check_daily_loss(-100, 10_000, 0.05)
        self.assertTrue(result2.allowed)


class TestSetupScore(unittest.TestCase):
    def test_min_score_threshold(self):
        from trading_clone.strategy.setup_score import calc_final_score
        result = calc_final_score(100, 100, 100, 100)
        self.assertEqual(result["final_score"], 100.0)
        self.assertTrue(result["allowed"])
        result2 = calc_final_score(0, 0, 0, 0)
        self.assertFalse(result2["allowed"])


if __name__ == "__main__":
    unittest.main()
