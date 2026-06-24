import logging
from typing import Literal

logger = logging.getLogger(__name__)


def calc_take_profit(entry: float, stop_loss: float, direction: Literal["buy", "sell"],
                     rr: float = 2.0) -> float:
    risk = abs(entry - stop_loss)
    if direction == "buy":
        return round(entry + risk * rr, 5)
    return round(entry - risk * rr, 5)


def calc_multi_targets(entry: float, stop_loss: float,
                       direction: Literal["buy", "sell"]) -> dict:
    return {
        "tp1": calc_take_profit(entry, stop_loss, direction, rr=1.0),
        "tp2": calc_take_profit(entry, stop_loss, direction, rr=2.0),
        "tp3": calc_take_profit(entry, stop_loss, direction, rr=3.0),
    }
