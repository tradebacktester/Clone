import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Literal, Optional

from trading_clone.app.config import BotConfig
from trading_clone.market_data.data_feed import Candle
from trading_clone.market_structure.swing_detector import detect_swings, detect_trend, calc_atr
from trading_clone.market_structure.premium_discount import calc_fib, is_premium, is_discount
from trading_clone.supply_demand.demand_detector import detect_demand_zones, DemandZone
from trading_clone.supply_demand.supply_detector import detect_supply_zones, SupplyZone
from trading_clone.supply_demand.zone_filter import filter_zones, is_price_in_zone, approaching_zone
from trading_clone.supply_demand.zone_scoring import calc_zone_score
from trading_clone.liquidity.liquidity_score import detect_liquidity_levels
from trading_clone.liquidity.sweep_detector import detect_sweeps, recent_sweep
from trading_clone.liquidity.stop_hunt import detect_liquidity_grabs, recent_grab
from trading_clone.amd.amd_score import detect_amd, AMDSequence
from trading_clone.confirmation.confirmation_score import confirm_candle
from trading_clone.strategy.trade_filter import session_allowed, news_blocked
from trading_clone.strategy.setup_score import calc_final_score

logger = logging.getLogger(__name__)


@dataclass
class TradeSignal:
    pair: str
    direction: Literal["buy", "sell"]
    confidence: float
    final_score: float
    zone_score: int
    liquidity_score: int
    amd_score: int
    confirmation_score: int
    entry_price: float
    stop_loss: float
    take_profit: float
    risk_reward: float
    amd_phase: str
    session: str
    confluence_factors: List[str] = field(default_factory=list)
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


def _get_session() -> str:
    hour = datetime.now(timezone.utc).hour
    if 7 <= hour < 12:
        return "london"
    if 12 <= hour < 20:
        return "newyork"
    return "asian"


def _calc_stops(zone, direction: str, atr: float, pair: str):
    pip = 0.01 if pair == "USDJPY" else 0.0001
    buf = atr * 0.2
    rr = 2.0
    if direction == "buy":
        entry = zone.price_top
        sl = zone.price_bottom - buf
        tp = entry + abs(entry - sl) * rr
    else:
        entry = zone.price_bottom
        sl = zone.price_top + buf
        tp = entry - abs(sl - entry) * rr
    entry = round(round(entry / pip) * pip, 5)
    sl = round(round(sl / pip) * pip, 5)
    tp = round(round(tp / pip) * pip, 5)
    return entry, sl, tp


class SignalGenerator:
    def __init__(self, config: BotConfig):
        self.config = config

    def generate(self, pair: str, candles: List[Candle]) -> List[TradeSignal]:
        if len(candles) < 20:
            return []
        atr = calc_atr(candles)
        if atr == 0:
            return []

        current = candles[-1].close
        session = _get_session()
        swings = detect_swings(candles)
        fib = calc_fib(candles)
        liq_levels = detect_liquidity_levels(candles, swings)
        grabs = detect_liquidity_grabs(candles, liq_levels)
        sweeps = detect_sweeps(candles, swings)
        amd = detect_amd(candles, grabs)

        demand_zones = filter_zones(detect_demand_zones(pair, "H1", candles), candles)
        supply_zones = filter_zones(detect_supply_zones(pair, "H1", candles), candles)

        signals: List[TradeSignal] = []

        for zone in demand_zones:
            direction = "buy"
            in_zone = is_price_in_zone(current, zone, atr)
            approaching = approaching_zone(current, zone, atr, direction)
            if not in_zone and not approaching:
                continue
            if fib and is_premium(fib):
                continue
            conf = confirm_candle(candles, direction)
            if not conf.valid:
                continue
            if not session_allowed(session):
                continue
            if news_blocked(pair):
                continue

            zone_strength = calc_zone_score(zone, candles)
            sweep = recent_sweep(sweeps, 8, candles)
            liq_score = sweep.sweep_score if sweep and sweep.type == "sell_side" else 0
            scored = calc_final_score(zone_strength, liq_score, amd.amd_score, conf.score)
            if not scored["allowed"]:
                continue

            entry, sl, tp = _calc_stops(zone, direction, atr, pair)
            rr = abs(tp - entry) / abs(entry - sl) if abs(entry - sl) > 0 else 0
            factors = [f"Demand zone (score {zone_strength})",
                       f"Confirmation (score {conf.score})",
                       f"AMD {amd.phase} (score {amd.amd_score})"]

            signals.append(TradeSignal(
                pair=pair, direction=direction,
                confidence=float(scored["final_score"]),
                final_score=float(scored["final_score"]),
                zone_score=zone_strength, liquidity_score=liq_score,
                amd_score=amd.amd_score, confirmation_score=conf.score,
                entry_price=entry, stop_loss=sl, take_profit=tp,
                risk_reward=round(rr, 2), amd_phase=amd.phase,
                session=session, confluence_factors=factors,
            ))

        for zone in supply_zones:
            direction = "sell"
            in_zone = is_price_in_zone(current, zone, atr)
            approaching = approaching_zone(current, zone, atr, direction)
            if not in_zone and not approaching:
                continue
            if fib and is_discount(fib):
                continue
            conf = confirm_candle(candles, direction)
            if not conf.valid:
                continue
            if not session_allowed(session):
                continue
            if news_blocked(pair):
                continue

            zone_strength = calc_zone_score(zone, candles)
            sweep = recent_sweep(sweeps, 8, candles)
            liq_score = sweep.sweep_score if sweep and sweep.type == "buy_side" else 0
            scored = calc_final_score(zone_strength, liq_score, amd.amd_score, conf.score)
            if not scored["allowed"]:
                continue

            entry, sl, tp = _calc_stops(zone, direction, atr, pair)
            rr = abs(tp - entry) / abs(entry - sl) if abs(entry - sl) > 0 else 0
            factors = [f"Supply zone (score {zone_strength})",
                       f"Confirmation (score {conf.score})",
                       f"AMD {amd.phase} (score {amd.amd_score})"]

            signals.append(TradeSignal(
                pair=pair, direction=direction,
                confidence=float(scored["final_score"]),
                final_score=float(scored["final_score"]),
                zone_score=zone_strength, liquidity_score=liq_score,
                amd_score=amd.amd_score, confirmation_score=conf.score,
                entry_price=entry, stop_loss=sl, take_profit=tp,
                risk_reward=round(rr, 2), amd_phase=amd.phase,
                session=session, confluence_factors=factors,
            ))

        signals.sort(key=lambda s: s.final_score, reverse=True)
        return signals[:3]
