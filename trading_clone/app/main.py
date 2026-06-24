import asyncio
import logging
import signal
import sys

from trading_clone.app.settings import SETTINGS
from trading_clone.database.database import init_db
from trading_clone.execution.paper_trader import PaperTrader
from trading_clone.market_data.data_feed import DataFeed
from trading_clone.strategy.signal_generator import SignalGenerator
from trading_clone.dashboard.dashboard import run_dashboard

logging.basicConfig(
    level=getattr(logging, SETTINGS.log_level),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

_shutdown = asyncio.Event()


def _handle_signal(sig, frame):
    logger.info("Shutdown signal received (%s)", sig)
    _shutdown.set()


async def analysis_loop(feed: DataFeed, generator: SignalGenerator, trader: PaperTrader):
    interval = SETTINGS.bot.analysis_interval_seconds
    logger.info("Analysis loop started — interval %ds", interval)

    while not _shutdown.is_set():
        try:
            for pair in SETTINGS.bot.pairs:
                candles = await feed.get_candles(pair, SETTINGS.bot.primary_timeframe, limit=200)
                signals = generator.generate(pair, candles)
                for sig in signals:
                    if sig.final_score >= SETTINGS.bot.min_signal_score:
                        trader.execute_signal(sig)
        except Exception as exc:
            logger.exception("Analysis loop error: %s", exc)

        try:
            await asyncio.wait_for(_shutdown.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass

    logger.info("Analysis loop stopped")


async def main():
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    logger.info("TradeClone starting — pairs=%s paper=%s",
                SETTINGS.bot.pairs, SETTINGS.bot.paper_trading)

    init_db()

    feed = DataFeed(pairs=SETTINGS.bot.pairs)
    generator = SignalGenerator(config=SETTINGS.bot)
    trader = PaperTrader(config=SETTINGS.bot)

    await asyncio.gather(
        analysis_loop(feed, generator, trader),
    )

    logger.info("TradeClone shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())
