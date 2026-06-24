"""
Liquidity Sweep Detector — Build #3
=====================================
A liquidity sweep occurs when price wicks through a prior swing high/low
(collecting stop orders), then closes back on the opposite side.

Types:
  BSL_SWEEP — Buyside  liquidity swept (above swing high, then drops)
  SSL_SWEEP — Sellside liquidity swept (below swing low,  then rises)

Score (max 100):
  Extension   40  — how far past the level (ATR units)
  Reversal    35  — body size of reversal candle
  Volume      15  — sweep-candle volume vs 20-bar avg
  Confirmed   10  — next candle continues in reversal direction
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Literal, Optional

from trading_clone.market_structure.swing_detector import Candle, calc_atr


SweepType = Literal["BSL_SWEEP", "SSL_SWEEP"]


@dataclass
class LiquiditySweep:
    sweep_type:     SweepType
    swept_level:    float
    sweep_time:     datetime
    sweep_index:    int
    extension:      float       # raw pip extension past level
    ext_atr_ratio:  float       # extension / ATR
    reversal_body:  float       # reversal candle body (ATR units)
    volume_spike:   bool
    confirmed:      bool        # next candle agrees with reversal
    score:          int


def detect_sweeps(candles: List[Candle], lookback: int = 20) -> List[LiquiditySweep]:
    if len(candles) < lookback + 2:
        return []

    atr     = calc_atr(candles)
    if atr == 0:
        return []

    avg_vol = sum(c.volume for c in candles[-lookback:]) / lookback
    sweeps: List[LiquiditySweep] = []

    for i in range(lookback, len(candles) - 1):
        window     = candles[i - lookback: i]
        swing_high = max(c.high for c in window)
        swing_low  = min(c.low  for c in window)

        c    = candles[i]
        cnxt = candles[i + 1]
        vol_spike = c.volume > avg_vol * 1.5

        # ── Buyside sweep ─────────────────────────────────────────────────
        if c.high > swing_high and c.close < swing_high:
            ext  = c.high - swing_high
            rev_body = max(0.0, cnxt.open - cnxt.close) / atr  # bearish reversal
            confirmed = cnxt.close < c.close
            sc = _score(ext, atr, rev_body, vol_spike, confirmed)
            if sc >= 60:
                sweeps.append(LiquiditySweep(
                    sweep_type="BSL_SWEEP", swept_level=round(swing_high, 5),
                    sweep_time=c.time, sweep_index=i,
                    extension=round(ext, 5), ext_atr_ratio=round(ext / atr, 2),
                    reversal_body=round(rev_body, 2),
                    volume_spike=vol_spike, confirmed=confirmed, score=sc,
                ))

        # ── Sellside sweep ────────────────────────────────────────────────
        elif c.low < swing_low and c.close > swing_low:
            ext  = swing_low - c.low
            rev_body = max(0.0, cnxt.close - cnxt.open) / atr  # bullish reversal
            confirmed = cnxt.close > c.close
            sc = _score(ext, atr, rev_body, vol_spike, confirmed)
            if sc >= 60:
                sweeps.append(LiquiditySweep(
                    sweep_type="SSL_SWEEP", swept_level=round(swing_low, 5),
                    sweep_time=c.time, sweep_index=i,
                    extension=round(ext, 5), ext_atr_ratio=round(ext / atr, 2),
                    reversal_body=round(rev_body, 2),
                    volume_spike=vol_spike, confirmed=confirmed, score=sc,
                ))

    sweeps.sort(key=lambda s: s.sweep_index, reverse=True)
    return _dedup(sweeps, atr)[:8]


def most_recent_sweep(sweeps: List[LiquiditySweep]) -> Optional[LiquiditySweep]:
    confirmed = [s for s in sweeps if s.confirmed]
    return confirmed[0] if confirmed else (sweeps[0] if sweeps else None)


def _score(ext: float, atr: float, rev: float, vol: bool, conf: bool) -> int:
    ratio   = ext / atr if atr else 0
    ext_pts = 40 if ratio > 0.75 else 30 if ratio > 0.4 else 15 if ratio > 0.2 else 5
    rev_pts = 35 if rev > 1.5 else 22 if rev > 0.8 else 10 if rev > 0.3 else 0
    vol_pts = 15 if vol else 0
    con_pts = 10 if conf else 0
    return min(100, ext_pts + rev_pts + vol_pts + con_pts)


def _dedup(sweeps: List[LiquiditySweep], atr: float) -> List[LiquiditySweep]:
    seen, out = set(), []
    for s in sweeps:
        key = (s.sweep_type, s.sweep_index)
        if key not in seen:
            seen.add(key)
            out.append(s)
    return out
