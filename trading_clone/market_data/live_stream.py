import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import Callable, Dict, List, Optional

from trading_clone.market_data.data_feed import Candle

logger = logging.getLogger(__name__)

TickCallback = Callable[[str, float], None]


class LiveStream:
    def __init__(self, pairs: List[str], tick_interval: float = 1.0):
        self.pairs = pairs
        self.tick_interval = tick_interval
        self._callbacks: List[TickCallback] = []
        self._prices: Dict[str, float] = {
            "EURUSD": 1.0850, "GBPUSD": 1.2700, "USDJPY": 149.50
        }
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def subscribe(self, callback: TickCallback) -> None:
        self._callbacks.append(callback)

    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._stream_loop())
        logger.info("LiveStream started for %s", self.pairs)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("LiveStream stopped")

    async def _stream_loop(self) -> None:
        while self._running:
            for pair in self.pairs:
                pip = 0.01 if pair == "USDJPY" else 0.0001
                drift = random.gauss(0, pip * 5)
                self._prices[pair] = round(self._prices.get(pair, 1.0) + drift, 5)
                for cb in self._callbacks:
                    try:
                        cb(pair, self._prices[pair])
                    except Exception as exc:
                        logger.exception("Tick callback error: %s", exc)
            await asyncio.sleep(self.tick_interval)

    def get_price(self, pair: str) -> Optional[float]:
        return self._prices.get(pair)
