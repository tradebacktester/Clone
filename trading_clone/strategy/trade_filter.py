import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

ALLOWED_SESSIONS = {"london", "newyork"}
_HIGH_IMPACT_PAIRS: set = set()


def session_allowed(session: str) -> bool:
    return session in ALLOWED_SESSIONS


def news_blocked(pair: str) -> bool:
    return pair in _HIGH_IMPACT_PAIRS


def register_news_block(pair: str) -> None:
    _HIGH_IMPACT_PAIRS.add(pair)


def clear_news_block(pair: str) -> None:
    _HIGH_IMPACT_PAIRS.discard(pair)


def is_trading_hours() -> bool:
    hour = datetime.now(timezone.utc).hour
    return 7 <= hour < 20
