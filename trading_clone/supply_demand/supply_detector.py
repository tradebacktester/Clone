"""
Supply Zone Detector
====================
Mirror of demand_detector but for bearish impulse candles.

Scoring (max 100):
  Displacement  40  — impulse body vs ATR
  BOS           25  — impulse close breaks prior 20-bar low
  Freshness     25  — 0 retests=25, 1=15, 2=5, 3+=0
  Volume        10  — impulse volume > 1.5× 20-bar average
"""

from dataclasses import dataclass
from datetime import datetime
from typing import List, Literal

from trading_clone.market_structure.swing_detector import Candle, calc_atr


@dataclass
class SupplyZone:
    pair:          str
    timeframe:     str
    price_top:     float
    price_bottom:  float
    origin_time:   datetime
    origin_index:  int
    move_size:     float
    base_candles:  int
    impulse_wick:  float
    tested:        int  = 0
    score:         int  = 0
    freshness:     Literal["fresh", "tested", "stale"] = "fresh"
    active:        bool = True


def detect_supply_zones(
    pair: str,
    timeframe: str,
    candles: List[Candle],
) -> List[SupplyZone]:
    if len(candles) < 20:
        return []
    atr = calc_atr(candles)
    if atr == 0:
        return []

    threshold = atr * 1.5
    zones: List[SupplyZone] = []

    for i in range(3, len(candles)):
        c = candles[i]
        body = c.open - c.close          # positive = bearish
        if body < threshold:
            continue

        impulse_wick = c.high - max(c.open, c.close)

        base_top, base_bottom = c.open, c.open
        base_count = 0
        for b in range(i - 1, max(-1, i - 5), -1):
            bc = candles[b]
            if abs(bc.close - bc.open) > atr * 0.8:
                break
            base_top    = max(base_top,    bc.high)
            base_bottom = min(base_bottom, bc.low)
            base_count += 1

        if base_count == 0:
            base_top    = max(c.open, c.high * 1.002)
            base_bottom = min(c.open, c.low  * 0.998)

        tested = _count_retests(base_top, base_bottom, candles, i)
        broken = _is_broken(base_top, candles, i)
        if broken:
            continue

        sc = _score(i, body / atr, tested, c, candles)

        freshness: Literal["fresh", "tested", "stale"] = (
            "fresh" if tested == 0 else "tested" if tested <= 2 else "stale"
        )

        zones.append(SupplyZone(
            pair=pair, timeframe=timeframe,
            price_top=round(base_top, 5), price_bottom=round(base_bottom, 5),
            origin_time=c.time, origin_index=i,
            move_size=round(body / atr, 2),
            base_candles=base_count,
            impulse_wick=round(impulse_wick, 5),
            tested=tested, score=sc, freshness=freshness,
        ))

    zones.sort(key=lambda z: z.origin_index, reverse=True)
    return _deduplicate(zones, atr)[:6]


def _score(origin_idx: int, move_size: float, tested: int,
           impulse: Candle, candles: List[Candle]) -> int:
    disp = 40 if move_size > 2 else 30 if move_size > 1.5 else 20 if move_size > 1 else 0

    lookback = candles[max(0, origin_idx - 20): origin_idx]
    prior_low = min((c.low for c in lookback), default=9e9)
    bos = 25 if impulse.close < prior_low else 0

    fresh = 25 if tested == 0 else 15 if tested == 1 else 5 if tested == 2 else 0

    vol_lb = candles[max(0, origin_idx - 20): origin_idx]
    avg_vol = sum(c.volume for c in vol_lb) / len(vol_lb) if vol_lb else 0
    vol = 10 if avg_vol > 0 and impulse.volume > avg_vol * 1.5 else 0

    return disp + bos + fresh + vol


def _count_retests(top: float, bottom: float,
                   candles: List[Candle], from_idx: int) -> int:
    count, in_zone = 0, False
    for c in candles[from_idx + 1:]:
        touches = c.low <= top and c.high >= bottom
        if touches and not in_zone:
            count += 1
            in_zone = True
        elif not touches:
            in_zone = False
    return count


def _is_broken(top: float, candles: List[Candle], from_idx: int) -> bool:
    for c in candles[from_idx + 1:]:
        if c.close > top * 1.003:
            return True
    return False


def _deduplicate(zones: List[SupplyZone], atr: float) -> List[SupplyZone]:
    kept: List[SupplyZone] = []
    for z in zones:
        mid = (z.price_top + z.price_bottom) / 2
        if not any(abs(mid - (k.price_top + k.price_bottom) / 2) < atr for k in kept):
            kept.append(z)
    return kept
