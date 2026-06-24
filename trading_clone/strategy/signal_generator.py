import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Literal, Optional

from trading_clone.app.config import BotConfig
from trading_clone.market_data.data_feed import Candle
from trading_clone.market_structure.swing_detector import detect_swings, detect_trend, calc_atr
from trading_clone.market_structure.premium_discount import (
    calc_fib,
    is_below_equilibrium,
    is_above_equilibrium,
)
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

# ── Per-engine rulebook thresholds ────────────────────────────────────────────
MIN_ZONE_SCORE        = 70   # HTF zone score gate (also enforced by filter_zones)
MIN_LIQUIDITY_SCORE   = 70   # Liquidity sweep score gate
MIN_AMD_SCORE         = 80   # AMD score gate
MIN_CONFIRMATION_SCORE = 70  # Confirmation score gate (also enforced by conf.valid)


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
    rr = 2.0
    buf = atr * 0.2
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

        # ── Session gate (applied once, before any per-zone work) ─────────────
        if not session_allowed(session):
            logger.debug("Session %s not allowed", session)
            return []

        # ── News gate ─────────────────────────────────────────────────────────
        if news_blocked(pair):
            logger.debug("News block active for %s", pair)
            return []

        swings = detect_swings(candles)

        # ── Fibonacci premium/discount analysis ───────────────────────────────
        fib = calc_fib(candles)

        # ── Liquidity context ─────────────────────────────────────────────────
        liq_levels = detect_liquidity_levels(candles, swings)
        grabs = detect_liquidity_grabs(candles, liq_levels)
        sweeps = detect_sweeps(candles)

        # ── AMD analysis ──────────────────────────────────────────────────────
        amd = detect_amd(candles, grabs)

        # ── AMD score gate (applied once — rulebook: AMD >= 80) ───────────────
        if amd.amd_score < MIN_AMD_SCORE:
            logger.debug(
                "AMD score %d < %d — no signal for %s",
                amd.amd_score, MIN_AMD_SCORE, pair,
            )
            return []

        # ── Zone detection (HTF zone score >= 70 enforced by filter_zones) ───
        demand_zones = filter_zones(detect_demand_zones(pair, "H1", candles))
        supply_zones = filter_zones(detect_supply_zones(pair, "H1", candles))

        signals: List[TradeSignal] = []

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # BUY path — Demand Zones
        # Rulebook gates:
        #   1. Price in Discount (< 0.5 Fibonacci)      ← is_below_equilibrium
        #   2. HTF Demand Zone Score >= 70               ← filter_zones / MIN_ZONE_SCORE
        #   3. Liquidity Sweep Score >= 70               ← MIN_LIQUIDITY_SCORE
        #   4. AMD Score >= 80                           ← checked above
        #   5. Confirmation Score >= 70                  ← conf.valid
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        for zone in demand_zones:
            direction = "buy"

            # Gate 1 — Price in or approaching demand zone
            in_zone    = is_price_in_zone(current, zone, atr)
            approaching = approaching_zone(current, zone, atr, direction)
            if not in_zone and not approaching:
                continue

            # Gate 2 — Price must be in Discount (below 0.5 EQ)
            if fib and not is_below_equilibrium(fib):
                logger.debug(
                    "BUY blocked for %s: price not in discount (ratio=%.3f)",
                    pair, fib.current_ratio,
                )
                continue

            # Gate 3 — HTF zone score >= 70 (already filtered, but double-check)
            zone_strength = calc_zone_score(zone, candles)
            if zone_strength < MIN_ZONE_SCORE:
                continue

            # Gate 4 — Liquidity Sweep Score >= 70
            # For BUY: we require an SSL_SWEEP (sellside stops swept → bullish)
            sweep = recent_sweep(sweeps, 8, candles)
            liq_score = sweep.score if sweep and sweep.sweep_type == "SSL_SWEEP" else 0
            if liq_score < MIN_LIQUIDITY_SCORE:
                logger.debug(
                    "BUY blocked for %s: liquidity score %d < %d",
                    pair, liq_score, MIN_LIQUIDITY_SCORE,
                )
                continue

            # Gate 5 — Confirmation Score >= 70
            conf = confirm_candle(candles, direction)
            if not conf.valid or conf.score < MIN_CONFIRMATION_SCORE:
                continue

            # ── Final weighted score gate (>= 80) ─────────────────────────────
            scored = calc_final_score(zone_strength, liq_score, amd.amd_score, conf.score)
            if not scored["allowed"]:
                continue

            entry, sl, tp = _calc_stops(zone, direction, atr, pair)
            rr = abs(tp - entry) / abs(entry - sl) if abs(entry - sl) > 0 else 0
            factors = [
                f"Demand zone (score {zone_strength})",
                f"Liquidity sweep SSL (score {liq_score})",
                f"Confirmation (score {conf.score})",
                f"AMD {amd.phase} (score {amd.amd_score})",
                f"Fibonacci: DISCOUNT (ratio {fib.current_ratio:.3f})" if fib else "Fibonacci: N/A",
            ]

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

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # SELL path — Supply Zones
        # Rulebook gates:
        #   1. Price in Premium (> 0.5 Fibonacci)       ← is_above_equilibrium
        #   2. HTF Supply Zone Score >= 70               ← filter_zones / MIN_ZONE_SCORE
        #   3. Liquidity Sweep Score >= 70               ← MIN_LIQUIDITY_SCORE
        #   4. AMD Score >= 80                           ← checked above
        #   5. Confirmation Score >= 70                  ← conf.valid
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        for zone in supply_zones:
            direction = "sell"

            # Gate 1 — Price in or approaching supply zone
            in_zone     = is_price_in_zone(current, zone, atr)
            approaching = approaching_zone(current, zone, atr, direction)
            if not in_zone and not approaching:
                continue

            # Gate 2 — Price must be in Premium (above 0.5 EQ)
            if fib and not is_above_equilibrium(fib):
                logger.debug(
                    "SELL blocked for %s: price not in premium (ratio=%.3f)",
                    pair, fib.current_ratio,
                )
                continue

            # Gate 3 — HTF zone score >= 70 (already filtered, but double-check)
            zone_strength = calc_zone_score(zone, candles)
            if zone_strength < MIN_ZONE_SCORE:
                continue

            # Gate 4 — Liquidity Sweep Score >= 70
            # For SELL: we require a BSL_SWEEP (buyside stops swept → bearish)
            sweep = recent_sweep(sweeps, 8, candles)
            liq_score = sweep.score if sweep and sweep.sweep_type == "BSL_SWEEP" else 0
            if liq_score < MIN_LIQUIDITY_SCORE:
                logger.debug(
                    "SELL blocked for %s: liquidity score %d < %d",
                    pair, liq_score, MIN_LIQUIDITY_SCORE,
                )
                continue

            # Gate 5 — Confirmation Score >= 70
            conf = confirm_candle(candles, direction)
            if not conf.valid or conf.score < MIN_CONFIRMATION_SCORE:
                continue

            # ── Final weighted score gate (>= 80) ─────────────────────────────
            scored = calc_final_score(zone_strength, liq_score, amd.amd_score, conf.score)
            if not scored["allowed"]:
                continue

            entry, sl, tp = _calc_stops(zone, direction, atr, pair)
            rr = abs(tp - entry) / abs(entry - sl) if abs(entry - sl) > 0 else 0
            factors = [
                f"Supply zone (score {zone_strength})",
                f"Liquidity sweep BSL (score {liq_score})",
                f"Confirmation (score {conf.score})",
                f"AMD {amd.phase} (score {amd.amd_score})",
                f"Fibonacci: PREMIUM (ratio {fib.current_ratio:.3f})" if fib else "Fibonacci: N/A",
            ]

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
