import logging
from dataclasses import dataclass
from datetime import datetime
from typing import List, Literal, Optional

from trading_clone.market_data.data_feed import Candle
from trading_clone.liquidity.stop_hunt import LiquidityGrab
from trading_clone.amd.accumulation import detect_accumulation_range
from trading_clone.amd.manipulation import detect_manipulation
from trading_clone.amd.distribution import detect_distribution

logger = logging.getLogger(__name__)


@dataclass
class AMDSequence:
    phase: Literal["none", "accumulation", "manipulation", "distribution"]
    direction: Optional[Literal["bullish", "bearish"]]
    accumulation_start: Optional[datetime]
    manipulation_time: Optional[datetime]
    distribution_start: Optional[datetime]
    manipulation_high: Optional[float]
    manipulation_low: Optional[float]
    range_low: Optional[float]
    range_high: Optional[float]
    complete: bool
    amd_score: int


def _null_amd() -> AMDSequence:
    return AMDSequence(phase="none", direction=None, accumulation_start=None,
                       manipulation_time=None, distribution_start=None,
                       manipulation_high=None, manipulation_low=None,
                       range_low=None, range_high=None, complete=False, amd_score=0)


def detect_amd(candles: List[Candle], grabs: List[LiquidityGrab]) -> AMDSequence:
    if len(candles) < 20:
        return _null_amd()

    range_ = detect_accumulation_range(candles)
    manip = detect_manipulation(candles, range_, grabs)

    if not range_.is_range:
        if not manip.found or not manip.time:
            return _null_amd()
        dist = detect_distribution(candles, manip.time, manip.direction)
        amd_score = manip.score + dist.score
        if dist.found:
            return AMDSequence(phase="distribution", direction=manip.direction,
                               accumulation_start=None, manipulation_time=manip.time,
                               distribution_start=dist.start_time,
                               manipulation_high=None, manipulation_low=None,
                               range_low=None, range_high=None,
                               complete=amd_score >= 80, amd_score=amd_score)
        return AMDSequence(phase="manipulation", direction=manip.direction,
                           accumulation_start=None, manipulation_time=manip.time,
                           distribution_start=None,
                           manipulation_high=None, manipulation_low=None,
                           range_low=None, range_high=None, complete=False,
                           amd_score=manip.score)

    acc_score = range_.score
    acc_start = candles[len(candles) - range_.bars].time if range_.bars <= len(candles) else None

    if not manip.found:
        return AMDSequence(phase="accumulation", direction=None, accumulation_start=acc_start,
                           manipulation_time=None, distribution_start=None,
                           manipulation_high=range_.high, manipulation_low=range_.low,
                           range_low=range_.low, range_high=range_.high,
                           complete=False, amd_score=acc_score)

    dist = detect_distribution(candles, manip.time, manip.direction) if manip.time and manip.direction else None
    dist_score = dist.score if dist and dist.found else 0
    amd_score = acc_score + manip.score + dist_score

    if dist and dist.found:
        return AMDSequence(phase="distribution", direction=manip.direction,
                           accumulation_start=acc_start, manipulation_time=manip.time,
                           distribution_start=dist.start_time,
                           manipulation_high=range_.high, manipulation_low=range_.low,
                           range_low=range_.low, range_high=range_.high,
                           complete=amd_score >= 80, amd_score=amd_score)

    return AMDSequence(phase="manipulation", direction=manip.direction,
                       accumulation_start=acc_start, manipulation_time=manip.time,
                       distribution_start=None,
                       manipulation_high=range_.high, manipulation_low=range_.low,
                       range_low=range_.low, range_high=range_.high,
                       complete=False, amd_score=amd_score)
