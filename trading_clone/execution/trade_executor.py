import logging
from typing import Optional

from trading_clone.execution.broker_connector import BrokerConnector, BrokerOrder
from trading_clone.execution.paper_trader import PaperTrader, PaperTrade
from trading_clone.strategy.signal_generator import TradeSignal
from trading_clone.risk_management.position_size import calc_position_size

logger = logging.getLogger(__name__)


class TradeExecutor:
    def __init__(self, paper_trader: PaperTrader, broker: Optional[BrokerConnector] = None,
                 live_mode: bool = False):
        self.paper_trader = paper_trader
        self.broker = broker
        self.live_mode = live_mode

    def execute(self, signal: TradeSignal) -> Optional[object]:
        if self.live_mode and self.broker:
            return self._execute_live(signal)
        return self.paper_trader.execute_signal(signal)

    def _execute_live(self, signal: TradeSignal) -> Optional[BrokerOrder]:
        if not self.broker:
            return None
        account = self.broker.get_account()
        if not account:
            logger.error("No broker account available")
            return None
        lots = calc_position_size(
            account_balance=account.balance,
            risk_pct=0.01,
            entry=signal.entry_price,
            stop_loss=signal.stop_loss,
            pair=signal.pair,
        )
        if lots <= 0:
            return None
        order = self.broker.place_order(
            pair=signal.pair,
            direction=signal.direction,
            lots=lots,
            entry=signal.entry_price,
            sl=signal.stop_loss,
            tp=signal.take_profit,
        )
        logger.info("Live order placed: %s", order)
        return order
