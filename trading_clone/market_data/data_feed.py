import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

import random
import math

logger = logging.getLogger(__name__)


@dataclass
class Candle:
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    pair: str
    timeframe: str


def _generate_synthetic_candles(pair: str, timeframe: str, limit: int) -> List[Candle]:
    pip = 0.01 if pair == "USDJPY" else 0.0001
    base_prices = {"EURUSD": 1.0850, "GBPUSD": 1.2700, "USDJPY": 149.50}
    price = base_prices.get(pair, 1.0)
    volatility = pip * 20
    candles: List[Candle] = []
    now = datetime.now(timezone.utc)
    tf_seconds = {"M1": 60, "M5": 300, "M15": 900, "H1": 3600, "H4": 14400, "D1": 86400}
    step = tf_seconds.get(timeframe, 3600)

    for i in range(limit - 1, -1, -1):
        t = datetime.fromtimestamp(now.timestamp() - i * step, tz=timezone.utc)
        drift = math.sin(i / 20) * volatility * 0.5
        body = random.gauss(drift, volatility)
        o = price
        c = price + body
        wick_hi = random.uniform(0, volatility)
        wick_lo = random.uniform(0, volatility)
        h = max(o, c) + wick_hi
        lo = min(o, c) - wick_lo
        vol = random.uniform(500, 3000)
        candles.append(Candle(time=t, open=round(o, 5), high=round(h, 5),
                               low=round(lo, 5), close=round(c, 5),
                               volume=round(vol, 2), pair=pair, timeframe=timeframe))
        price = c

    return candles


class DataFeed:
    def __init__(self, pairs: List[str]):
        self.pairs = pairs
        self._cache: Dict[str, List[Candle]] = {}
        logger.info("DataFeed initialised — pairs=%s", pairs)

    async def get_candles(self, pair: str, timeframe: str, limit: int = 200) -> List[Candle]:
        key = f"{pair}_{timeframe}"
        candles = _generate_synthetic_candles(pair, timeframe, limit)
        self._cache[key] = candles
        return candles

    def get_latest_price(self, pair: str) -> Optional[float]:
        for tf in ["H1", "H4", "D1"]:
            key = f"{pair}_{tf}"
            if key in self._cache and self._cache[key]:
                return self._cache[key][-1].close
        return None
