import logging
from datetime import datetime, timezone
from trading_clone.market_data.news_calendar import is_news_blocked

logger = logging.getLogger(__name__)

ALLOWED_SESSIONS = {"london", "newyork"}


def session_allowed(session: str) -> bool:
    return session in ALLOWED_SESSIONS


def news_blocked(pair: str) -> bool:
    """Return True if a high-impact news event blocks trading this pair right now."""
    try:
        blocked = is_news_blocked(pair)
        if blocked:
            logger.info("News filter blocking %s", pair)
        return blocked
    except Exception as exc:
        logger.warning("News filter error for %s: %s — allowing trade", pair, exc)
        return False


def is_trading_hours() -> bool:
    hour = datetime.now(timezone.utc).hour
    return 7 <= hour < 20
