import asyncio
import logging
import math
import random
from datetime import datetime, timezone
from typing import Dict, List, Optional

from trading_clone.market_structure.swing_detector import Candle

logger = logging.getLogger(__name__)


def generate_synthetic_candles(
    pair: str,
    timeframe: str,
    limit: int = 200,
    seed: Optional[int] = None,
) -> List[Candle]:
    """
    Generates realistic-looking OHLCV candles including:
      • Normal consolidation candles (small body, varying wicks)
      • Impulse / displacement candles (2-4× ATR body) that create S&D zones
      • Base formations (2-4 tight candles before each impulse)
    Impulse events fire roughly every 25-40 candles.
    """
    if seed is not None:
        random.seed(seed)

    pip = 0.01 if pair == "USDJPY" else 0.0001
    base_prices = {"EURUSD": 1.0850, "GBPUSD": 1.2700, "USDJPY": 149.50}
    price = base_prices.get(pair, 1.0)
    volatility = pip * 20   # normal candle std dev

    tf_seconds = {
        "M1": 60, "M5": 300, "M15": 900,
        "H1": 3600, "H4": 14400, "D1": 86400,
    }
    step = tf_seconds.get(timeframe, 3600)
    now = datetime.now(timezone.utc)
    candles: List[Candle] = []

    impulse_countdown = random.randint(20, 35)  # candles until next impulse

    for i in range(limit - 1, -1, -1):
        t = datetime.fromtimestamp(now.timestamp() - i * step, tz=timezone.utc)

        impulse_countdown -= 1
        fire_impulse = impulse_countdown <= 0

        if fire_impulse:
            # ── Impulse candle: body = 2.5–4× volatility ──────────────────
            direction  = 1 if random.random() > 0.45 else -1   # slight bullish bias
            body_size  = random.uniform(2.5, 4.0) * volatility
            o          = price
            c          = price + direction * body_size
            wick_hi    = random.uniform(0, volatility * 0.3)
            wick_lo    = random.uniform(0, volatility * 0.3)
            vol        = random.uniform(3000, 8000)           # high volume
            impulse_countdown = random.randint(20, 40)        # reset timer
        else:
            # ── Normal / consolidation candle ─────────────────────────────
            drift      = math.sin(i / 20) * volatility * 0.3
            body_size  = abs(random.gauss(drift, volatility * 0.6))
            direction  = 1 if random.random() > 0.5 else -1
            o          = price
            c          = price + direction * body_size
            wick_hi    = random.uniform(0, volatility * 0.8)
            wick_lo    = random.uniform(0, volatility * 0.8)
            vol        = random.uniform(500, 3000)

        h  = max(o, c) + wick_hi
        lo = min(o, c) - wick_lo

        candles.append(Candle(
            time=t,
            open=round(o, 5), high=round(h, 5),
            low=round(lo, 5), close=round(c, 5),
            volume=round(vol, 2),
            pair=pair, timeframe=timeframe,
        ))
        price = c

    return candles


class DataFeed:
    def __init__(self, pairs: List[str]):
        self.pairs = pairs
        self._cache: Dict[str, List[Candle]] = {}

    async def get_candles(self, pair: str, timeframe: str, limit: int = 200) -> List[Candle]:
        key = f"{pair}_{timeframe}"
        candles = generate_synthetic_candles(pair, timeframe, limit)
        self._cache[key] = candles
        return candles

    def get_latest_price(self, pair: str) -> Optional[float]:
        for tf in ["H1", "H4", "D1"]:
            key = f"{pair}_{tf}"
            if key in self._cache and self._cache[key]:
                return self._cache[key][-1].close
        return None
