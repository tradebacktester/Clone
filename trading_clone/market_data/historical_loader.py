import logging
import math
import random
from datetime import datetime, timezone, timedelta
from typing import List

from trading_clone.market_data.data_feed import Candle

logger = logging.getLogger(__name__)


def load_historical(pair: str, timeframe: str, start: datetime, end: datetime) -> List[Candle]:
    pip = 0.01 if pair == "USDJPY" else 0.0001
    base_prices = {"EURUSD": 1.0850, "GBPUSD": 1.2700, "USDJPY": 149.50}
    price = base_prices.get(pair, 1.0)
    volatility = pip * 20

    tf_seconds = {"M1": 60, "M5": 300, "M15": 900, "H1": 3600, "H4": 14400, "D1": 86400}
    step = tf_seconds.get(timeframe, 3600)

    candles: List[Candle] = []
    current = start
    i = 0
    while current <= end:
        drift = math.sin(i / 20) * volatility * 0.5
        body = random.gauss(drift, volatility)
        o = price
        c = price + body
        h = max(o, c) + random.uniform(0, volatility)
        lo = min(o, c) - random.uniform(0, volatility)
        vol = random.uniform(500, 3000)
        candles.append(Candle(time=current, open=round(o, 5), high=round(h, 5),
                               low=round(lo, 5), close=round(c, 5),
                               volume=round(vol, 2), pair=pair, timeframe=timeframe))
        price = c
        current = datetime.fromtimestamp(current.timestamp() + step, tz=timezone.utc)
        i += 1

    logger.info("Loaded %d historical candles for %s %s", len(candles), pair, timeframe)
    return candles
