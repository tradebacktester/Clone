from typing import List, Union

from trading_clone.market_structure.swing_detector import Candle, calc_atr
from trading_clone.supply_demand.demand_detector import DemandZone
from trading_clone.supply_demand.supply_detector import SupplyZone
from trading_clone.supply_demand.zone_scoring import MIN_SCORE

AnyZone = Union[DemandZone, SupplyZone]


def filter_zones(zones: List[AnyZone], min_score: int = MIN_SCORE) -> List[AnyZone]:
    return [z for z in zones if z.score >= min_score]


def is_price_in_zone(price: float, zone: AnyZone, atr: float) -> bool:
    buf = atr * 0.5
    return zone.price_bottom - buf <= price <= zone.price_top + buf


def approaching_zone(price: float, zone: AnyZone, atr: float, direction: str) -> bool:
    if direction == "buy":
        return zone.price_top <= price <= zone.price_top + atr * 3
    return zone.price_bottom - atr * 3 <= price <= zone.price_bottom
