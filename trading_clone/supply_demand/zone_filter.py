import logging
from typing import List, Union

from trading_clone.market_data.data_feed import Candle
from trading_clone.market_structure.swing_detector import calc_atr
from trading_clone.supply_demand.demand_detector import DemandZone
from trading_clone.supply_demand.supply_detector import SupplyZone
from trading_clone.supply_demand.zone_scoring import calc_zone_score

logger = logging.getLogger(__name__)

AnyZone = Union[DemandZone, SupplyZone]
MIN_ZONE_SCORE = 70


def filter_zones(zones: List[AnyZone], candles: List[Candle], min_score: int = MIN_ZONE_SCORE) -> List[AnyZone]:
    scored = [(z, calc_zone_score(z, candles)) for z in zones]
    filtered = [(z, s) for z, s in scored if s >= min_score]
    filtered.sort(key=lambda x: x[1], reverse=True)
    return [z for z, _ in filtered]


def deduplicate_zones(zones: List[AnyZone], candles: List[Candle]) -> List[AnyZone]:
    atr = calc_atr(candles)
    tolerance = atr * 1.0
    kept: List[AnyZone] = []
    for zone in zones:
        mid = (zone.price_top + zone.price_bottom) / 2
        overlap = any(abs(mid - (k.price_top + k.price_bottom) / 2) < tolerance for k in kept)
        if not overlap:
            kept.append(zone)
    return kept


def is_price_in_zone(price: float, zone: AnyZone, atr: float) -> bool:
    buf = atr * 0.5
    return zone.price_bottom - buf <= price <= zone.price_top + buf


def approaching_zone(price: float, zone: AnyZone, atr: float, direction: str) -> bool:
    if direction == "buy":
        return zone.price_top <= price <= zone.price_top + atr * 3
    else:
        return zone.price_bottom - atr * 3 <= price <= zone.price_bottom
