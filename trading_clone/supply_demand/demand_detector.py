"""
Demand Zone Detector
====================
A demand zone is formed when a bullish impulse candle (body ≥ 1.5 × ATR)
launches from a compact base of 0–4 consolidation candles.

Scoring (max 100):
  Displacement  40  — impulse body vs ATR
  BOS           25  — impulse close breaks prior 20-bar high
  Freshness     25  — 0 retests=25, 1=15, 2=5, 3+=0
  Volume        10  — impulse volume > 1.5× 20-bar average
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Literal

from trading_clone.market_structure.swing_detector import Candle, calc_atr


@dataclass
class DemandZone:
    pair:          str
    timeframe:     str
    price_top:     float
    price_bottom:  float
    origin_time:   datetime
    origin_index:  int
    move_size:     float        # impulse body in ATR units
    base_candles:  int
    impulse_wick:  float
    tested:        int  = 0
    score:         int  = 0
    freshness:     Literal["fresh", "tested", "stale"] = "fresh"
    active:        bool = True


def detect_demand_zones(
    pair: str,
    timeframe: str,
    candles: List[Candle],
) -> List[DemandZone]:
    if len(candles) < 20:
        return []
    atr = calc_atr(candles)
    if atr == 0:
        return []

    threshold = atr * 1.5
    zones: List[DemandZone] = []

    for i in range(3, len(candles)):
        c = candles[i]
        body = c.close - c.open          # positive = bullish
        if body < threshold:
            continue

        impulse_wick = min(c.open, c.close) - c.low

        # Build base (up to 4 prior low-body candles)
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
            base_top    = max(c.open, c.high * 0.998)
            base_bottom = min(c.open, c.low  * 1.002)

        tested  = _count_retests(base_top, base_bottom, candles, i)
        broken  = _is_broken(base_bottom, candles, i)
        if broken:
            continue

        sc = _score(i, body / atr, tested, c, candles)

        freshness: Literal["fresh", "tested", "stale"] = (
            "fresh" if tested == 0 else "tested" if tested <= 2 else "stale"
        )

        zones.append(DemandZone(
            pair=pair, timeframe=timeframe,
            price_top=round(base_top, 5), price_bottom=round(base_bottom, 5),
            origin_time=c.time, origin_index=i,
            move_size=round(body / atr, 2),
            base_candles=base_count,
            impulse_wick=round(impulse_wick, 5),
            tested=tested, score=sc, freshness=freshness,
        ))

    # Most recent first, no overlapping ranges
    zones.sort(key=lambda z: z.origin_index, reverse=True)
    return _deduplicate(zones, atr)[:6]


# ── helpers ───────────────────────────────────────────────────────────────────

def _score(origin_idx: int, move_size: float, tested: int,
           impulse: Candle, candles: List[Candle]) -> int:
    # Displacement
    disp = 40 if move_size > 2 else 30 if move_size > 1.5 else 20 if move_size > 1 else 0

    # BOS — impulse close breaks prior 20-bar high
    lookback = candles[max(0, origin_idx - 20): origin_idx]
    prior_high = max((c.high for c in lookback), default=0)
    bos = 25 if impulse.close > prior_high else 0

    # Freshness
    fresh = 25 if tested == 0 else 15 if tested == 1 else 5 if tested == 2 else 0

    # Volume
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


def _is_broken(bottom: float, candles: List[Candle], from_idx: int) -> bool:
    for c in candles[from_idx + 1:]:
        if c.close < bottom * 0.997:
            return True
    return False


def _deduplicate(zones: List[DemandZone], atr: float) -> List[DemandZone]:
    kept: List[DemandZone] = []
    for z in zones:
        mid = (z.price_top + z.price_bottom) / 2
        if not any(abs(mid - (k.price_top + k.price_bottom) / 2) < atr for k in kept):
            kept.append(z)
    return kept
