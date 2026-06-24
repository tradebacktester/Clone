import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional
import uuid

from trading_clone.market_data.data_feed import Candle
from trading_clone.market_structure.swing_detector import detect_swings, calc_atr
from trading_clone.market_structure.premium_discount import calc_fib
from trading_clone.supply_demand.demand_detector import detect_demand_zones
from trading_clone.supply_demand.supply_detector import detect_supply_zones
from trading_clone.supply_demand.zone_filter import filter_zones, is_price_in_zone
from trading_clone.supply_demand.zone_scoring import calc_zone_score
from trading_clone.liquidity.liquidity_score import detect_liquidity_levels
from trading_clone.liquidity.sweep_detector import detect_sweeps, recent_sweep
from trading_clone.liquidity.stop_hunt import detect_liquidity_grabs
from trading_clone.amd.amd_score import detect_amd
from trading_clone.confirmation.confirmation_score import confirm_candle
from trading_clone.strategy.trade_filter import session_allowed
from trading_clone.strategy.setup_score import calc_final_score
from trading_clone.risk_management.position_size import calc_position_size
from trading_clone.backtesting.metrics import calc_metrics

logger = logging.getLogger(__name__)


@dataclass
class BacktestTrade:
    id: str
    pair: str
    direction: str
    entry_price: float
    stop_loss: float
    take_profit: float
    lot_size: float
    open_bar: int
    close_bar: Optional[int]
    close_price: Optional[float]
    pnl: Optional[float]
    outcome: str
    zone_score: int
    amd_score: int
    final_score: float


@dataclass
class BacktestResult:
    pair: str
    timeframe: str
    start_date: datetime
    end_date: datetime
    initial_balance: float
    final_balance: float
    trades: List[BacktestTrade] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)


def run_backtest(
    pair: str,
    timeframe: str,
    candles: List[Candle],
    initial_balance: float = 10_000.0,
    risk_pct: float = 0.01,
    min_score: float = 80.0,
) -> BacktestResult:
    balance = initial_balance
    trades: List[BacktestTrade] = []
    open_trade: Optional[BacktestTrade] = None

    for i in range(60, len(candles)):
        window = candles[:i]
        c = candles[i]

        if open_trade is not None:
            direction = open_trade.direction
            if direction == "buy":
                if c.high >= open_trade.take_profit:
                    open_trade = _close(open_trade, open_trade.take_profit, i, balance, pair, trades)
                    balance += open_trade.pnl or 0
                    open_trade = None
                    continue
                if c.low <= open_trade.stop_loss:
                    open_trade = _close(open_trade, open_trade.stop_loss, i, balance, pair, trades)
                    balance += open_trade.pnl or 0
                    open_trade = None
                    continue
            else:
                if c.low <= open_trade.take_profit:
                    open_trade = _close(open_trade, open_trade.take_profit, i, balance, pair, trades)
                    balance += open_trade.pnl or 0
                    open_trade = None
                    continue
                if c.high >= open_trade.stop_loss:
                    open_trade = _close(open_trade, open_trade.stop_loss, i, balance, pair, trades)
                    balance += open_trade.pnl or 0
                    open_trade = None
                    continue
            continue

        atr = calc_atr(window)
        if atr == 0:
            continue

        swings = detect_swings(window)
        fib = calc_fib(window)
        liq_levels = detect_liquidity_levels(window, swings)
        grabs = detect_liquidity_grabs(window, liq_levels)
        sweeps = detect_sweeps(window, swings)
        amd = detect_amd(window, grabs)

        demand_zones = filter_zones(detect_demand_zones(pair, timeframe, window), window)
        supply_zones = filter_zones(detect_supply_zones(pair, timeframe, window), window)

        current = c.close
        hour = c.time.hour
        session = "london" if 7 <= hour < 12 else "newyork" if 12 <= hour < 20 else "asian"
        if not session_allowed(session):
            continue

        for zone in demand_zones[:2]:
            if not is_price_in_zone(current, zone, atr):
                continue
            conf = confirm_candle(window, "buy")
            if not conf.valid:
                continue
            zone_strength = calc_zone_score(zone, window)
            sweep = recent_sweep(sweeps, 8, window)
            liq_score = sweep.sweep_score if sweep and sweep.type == "sell_side" else 0
            scored = calc_final_score(zone_strength, liq_score, amd.amd_score, conf.score)
            if not scored["allowed"] or scored["final_score"] < min_score:
                continue

            buf = atr * 0.2
            entry = zone.price_top
            sl = zone.price_bottom - buf
            tp = entry + abs(entry - sl) * 2.0
            lots = calc_position_size(balance, risk_pct, entry, sl, pair)
            if lots <= 0:
                continue
            open_trade = BacktestTrade(
                id=str(uuid.uuid4())[:8], pair=pair, direction="buy",
                entry_price=entry, stop_loss=sl, take_profit=tp, lot_size=lots,
                open_bar=i, close_bar=None, close_price=None, pnl=None,
                outcome="open", zone_score=zone_strength,
                amd_score=amd.amd_score, final_score=scored["final_score"],
            )
            break

        if open_trade is None:
            for zone in supply_zones[:2]:
                if not is_price_in_zone(current, zone, atr):
                    continue
                conf = confirm_candle(window, "sell")
                if not conf.valid:
                    continue
                zone_strength = calc_zone_score(zone, window)
                sweep = recent_sweep(sweeps, 8, window)
                liq_score = sweep.sweep_score if sweep and sweep.type == "buy_side" else 0
                scored = calc_final_score(zone_strength, liq_score, amd.amd_score, conf.score)
                if not scored["allowed"] or scored["final_score"] < min_score:
                    continue

                buf = atr * 0.2
                entry = zone.price_bottom
                sl = zone.price_top + buf
                tp = entry - abs(sl - entry) * 2.0
                lots = calc_position_size(balance, risk_pct, entry, sl, pair)
                if lots <= 0:
                    continue
                open_trade = BacktestTrade(
                    id=str(uuid.uuid4())[:8], pair=pair, direction="sell",
                    entry_price=entry, stop_loss=sl, take_profit=tp, lot_size=lots,
                    open_bar=i, close_bar=None, close_price=None, pnl=None,
                    outcome="open", zone_score=zone_strength,
                    amd_score=amd.amd_score, final_score=scored["final_score"],
                )
                break

    if open_trade is not None:
        last_price = candles[-1].close
        open_trade = _close(open_trade, last_price, len(candles) - 1, balance, pair, trades)
        balance += open_trade.pnl or 0

    start_date = candles[0].time if candles else datetime.now(timezone.utc)
    end_date = candles[-1].time if candles else datetime.now(timezone.utc)

    result = BacktestResult(
        pair=pair, timeframe=timeframe,
        start_date=start_date, end_date=end_date,
        initial_balance=initial_balance,
        final_balance=round(balance, 2),
        trades=trades,
        metrics=calc_metrics(trades, initial_balance),
    )
    logger.info("Backtest complete: %d trades, final=%.2f", len(trades), balance)
    return result


def _close(trade: BacktestTrade, price: float, bar: int,
           balance: float, pair: str, trades: List[BacktestTrade]) -> BacktestTrade:
    pip = 0.01 if pair == "USDJPY" else 0.0001
    pip_value = 7.0 if pair == "USDJPY" else 10.0
    if trade.direction == "buy":
        pips = (price - trade.entry_price) / pip
    else:
        pips = (trade.entry_price - price) / pip
    pnl = round(pips * pip_value * trade.lot_size, 2)
    trade.close_bar = bar
    trade.close_price = price
    trade.pnl = pnl
    trade.outcome = "win" if pnl > 0 else "loss"
    trades.append(trade)
    return trade
