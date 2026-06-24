import logging
from typing import List, Union

from trading_clone.market_data.data_feed import Candle
from trading_clone.market_structure.swing_detector import calc_atr
from trading_clone.supply_demand.demand_detector import DemandZone
from trading_clone.supply_demand.supply_detector import SupplyZone

logger = logging.getLogger(__name__)

AnyZone = Union[DemandZone, SupplyZone]


def score_displacement(move_size: float) -> int:
    if move_size > 2:
        return 40
    if move_size > 1.5:
        return 30
    if move_size > 1:
        return 20
    return 0


def score_bos(zone: AnyZone, candles: List[Candle]) -> int:
    lookback = candles[max(0, zone.origin_index - 20): zone.origin_index]
    if not lookback:
        return 0
    impulse_close = candles[zone.origin_index].close
    if isinstance(zone, DemandZone):
        prior_high = max(c.high for c in lookback)
        return 25 if impulse_close > prior_high else 0
    else:
        prior_low = min(c.low for c in lookback)
        return 25 if impulse_close < prior_low else 0


def score_freshness(tested: int) -> int:
    if tested == 0:
        return 25
    if tested == 1:
        return 15
    if tested == 2:
        return 5
    return 0


def score_volume(zone: AnyZone, candles: List[Candle]) -> int:
    impulse = candles[zone.origin_index]
    if impulse.volume == 0:
        return 0
    lookback = candles[max(0, zone.origin_index - 20): zone.origin_index]
    if not lookback:
        return 0
    avg_vol = sum(c.volume for c in lookback) / len(lookback)
    if avg_vol == 0:
        return 0
    return 10 if impulse.volume > avg_vol * 1.5 else 0


def calc_zone_score(zone: AnyZone, candles: List[Candle]) -> int:
    return (
        score_displacement(zone.move_size)
        + score_bos(zone, candles)
        + score_freshness(zone.tested)
        + score_volume(zone, candles)
    )
