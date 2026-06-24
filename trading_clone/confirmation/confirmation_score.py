import logging
from typing import List, Literal

from trading_clone.market_data.data_feed import Candle
from trading_clone.confirmation.bullish_confirmation import check_bullish_confirmation, ConfirmationResult
from trading_clone.confirmation.bearish_confirmation import check_bearish_confirmation

logger = logging.getLogger(__name__)


def confirm_candle(candles: List[Candle], direction: Literal["buy", "sell"]) -> ConfirmationResult:
    if direction == "buy":
        return check_bullish_confirmation(candles)
    return check_bearish_confirmation(candles)
