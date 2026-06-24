import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional

from trading_clone.app.config import BotConfig
from trading_clone.risk_management.position_size import calc_position_size
from trading_clone.risk_management.risk_limits import check_all_risk

logger = logging.getLogger(__name__)


@dataclass
class PaperTrade:
    id: str
    pair: str
    direction: Literal["buy", "sell"]
    entry_price: float
    stop_loss: float
    take_profit: float
    lot_size: float
    open_time: datetime
    close_time: Optional[datetime] = None
    close_price: Optional[float] = None
    pnl: Optional[float] = None
    status: str = "open"
    amd_phase: str = "none"
    zone_score: int = 0
    signal_score: float = 0.0


class PaperTrader:
    def __init__(self, config: BotConfig, starting_balance: float = 10_000.0):
        self.config = config
        self.balance = starting_balance
        self.open_trades: Dict[str, PaperTrade] = {}
        self.closed_trades: List[PaperTrade] = []
        logger.info("PaperTrader initialised — balance=%.2f", starting_balance)

    def execute_signal(self, signal) -> Optional[PaperTrade]:
        daily_pnl = sum(t.pnl or 0 for t in self.closed_trades
                        if t.close_time and t.close_time.date() == datetime.now(timezone.utc).date())
        weekly_pnl = sum(t.pnl or 0 for t in self.closed_trades[-50:])

        risk_check = check_all_risk(
            open_count=len(self.open_trades),
            closed_pnl_today=daily_pnl,
            closed_pnl_week=weekly_pnl,
            account_balance=self.balance,
            max_open=self.config.risk.max_open_trades,
            max_daily_pct=self.config.risk.max_daily_loss,
            max_weekly_pct=self.config.risk.max_weekly_loss,
        )
        if not risk_check.allowed:
            logger.warning("Risk check blocked trade: %s", risk_check.reason)
            return None

        lot_size = calc_position_size(
            account_balance=self.balance,
            risk_pct=self.config.risk.max_risk_per_trade,
            entry=signal.entry_price,
            stop_loss=signal.stop_loss,
            pair=signal.pair,
        )
        if lot_size <= 0:
            return None

        trade = PaperTrade(
            id=str(uuid.uuid4())[:8],
            pair=signal.pair,
            direction=signal.direction,
            entry_price=signal.entry_price,
            stop_loss=signal.stop_loss,
            take_profit=signal.take_profit,
            lot_size=lot_size,
            open_time=datetime.now(timezone.utc),
            amd_phase=signal.amd_phase,
            zone_score=signal.zone_score,
            signal_score=signal.final_score,
        )
        self.open_trades[trade.id] = trade
        logger.info("Paper trade opened: %s %s %s @ %.5f lot=%.2f",
                    trade.id, trade.pair, trade.direction, trade.entry_price, trade.lot_size)
        return trade

    def update_prices(self, prices: Dict[str, float]) -> None:
        for trade_id, trade in list(self.open_trades.items()):
            price = prices.get(trade.pair)
            if price is None:
                continue
            if trade.direction == "buy":
                hit_tp = price >= trade.take_profit
                hit_sl = price <= trade.stop_loss
            else:
                hit_tp = price <= trade.take_profit
                hit_sl = price >= trade.stop_loss
            if hit_tp or hit_sl:
                self._close_trade(trade_id, price, "tp" if hit_tp else "sl")

    def _close_trade(self, trade_id: str, close_price: float, reason: str) -> None:
        trade = self.open_trades.pop(trade_id, None)
        if not trade:
            return
        pip = 0.01 if trade.pair == "USDJPY" else 0.0001
        pip_value = 7.0 if trade.pair == "USDJPY" else 10.0
        if trade.direction == "buy":
            pips = (close_price - trade.entry_price) / pip
        else:
            pips = (trade.entry_price - close_price) / pip
        trade.pnl = round(pips * pip_value * trade.lot_size, 2)
        trade.close_price = close_price
        trade.close_time = datetime.now(timezone.utc)
        trade.status = "closed"
        self.balance += trade.pnl
        self.closed_trades.append(trade)
        logger.info("Paper trade closed: %s reason=%s pnl=%.2f balance=%.2f",
                    trade_id, reason, trade.pnl, self.balance)

    def get_stats(self) -> dict:
        closed = self.closed_trades
        if not closed:
            return {"total": 0, "win_rate": 0.0, "total_pnl": 0.0, "balance": self.balance}
        wins = sum(1 for t in closed if (t.pnl or 0) > 0)
        return {
            "total": len(closed),
            "open": len(self.open_trades),
            "wins": wins,
            "win_rate": round(wins / len(closed) * 100, 1),
            "total_pnl": round(sum(t.pnl or 0 for t in closed), 2),
            "balance": round(self.balance, 2),
        }
