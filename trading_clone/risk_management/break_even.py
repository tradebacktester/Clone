import logging
from typing import Literal

logger = logging.getLogger(__name__)


def should_move_to_break_even(
    entry: float,
    current_price: float,
    stop_loss: float,
    direction: Literal["buy", "sell"],
    trigger_rr: float = 1.0,
) -> bool:
    risk = abs(entry - stop_loss)
    if risk == 0:
        return False
    if direction == "buy":
        profit = current_price - entry
    else:
        profit = entry - current_price
    return profit >= risk * trigger_rr


def new_break_even_stop(entry: float, pair: str) -> float:
    pip = 0.01 if pair == "USDJPY" else 0.0001
    return round(entry + pip * 2, 5)
