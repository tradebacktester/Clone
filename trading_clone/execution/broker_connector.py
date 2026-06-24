import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class BrokerAccount:
    id: str
    name: str
    broker: str
    balance: float
    equity: float
    currency: str
    leverage: int
    connected: bool


@dataclass
class BrokerOrder:
    ticket: str
    pair: str
    direction: str
    lots: float
    entry_price: float
    stop_loss: float
    take_profit: float
    status: str


class BrokerConnector(ABC):
    @abstractmethod
    def connect(self, credentials: dict) -> bool: ...

    @abstractmethod
    def get_account(self) -> Optional[BrokerAccount]: ...

    @abstractmethod
    def place_order(self, pair: str, direction: str, lots: float,
                    entry: float, sl: float, tp: float) -> Optional[BrokerOrder]: ...

    @abstractmethod
    def close_order(self, ticket: str) -> bool: ...

    @abstractmethod
    def get_open_orders(self) -> List[BrokerOrder]: ...


class StubBrokerConnector(BrokerConnector):
    def connect(self, credentials: dict) -> bool:
        logger.info("StubBroker: connect called")
        return True

    def get_account(self) -> Optional[BrokerAccount]:
        return BrokerAccount(id="stub-1", name="Paper Account", broker="stub",
                             balance=10000.0, equity=10000.0, currency="USD",
                             leverage=100, connected=True)

    def place_order(self, pair, direction, lots, entry, sl, tp):
        import uuid
        ticket = str(uuid.uuid4())[:8]
        logger.info("StubBroker: order placed %s %s %s lots=%.2f", ticket, pair, direction, lots)
        return BrokerOrder(ticket=ticket, pair=pair, direction=direction,
                           lots=lots, entry_price=entry, stop_loss=sl,
                           take_profit=tp, status="open")

    def close_order(self, ticket: str) -> bool:
        logger.info("StubBroker: close order %s", ticket)
        return True

    def get_open_orders(self) -> List[BrokerOrder]:
        return []
