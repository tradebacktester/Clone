from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal, Optional
import uuid


PairType      = Literal["EURUSD", "GBPUSD", "USDJPY"]
DirectionType = Literal["BUY", "SELL"]
ResultType    = Literal["WIN", "LOSS", "BREAKEVEN", "OPEN"]
SessionType   = Literal["london", "newyork", "asian"]


@dataclass
class Trade:
    pair:               PairType
    direction:          DirectionType
    entry:              float
    stop_loss:          float
    take_profit:        float
    risk_reward:        float
    zone_score:         int
    liquidity_score:    int
    amd_score:          int
    confirmation_score: int
    final_score:        float
    session:            SessionType
    trade_id:           str           = field(default_factory=lambda: str(uuid.uuid4()))
    result:             ResultType    = "OPEN"
    date:               datetime      = field(default_factory=lambda: datetime.now(timezone.utc))

    def validate(self) -> None:
        assert self.pair      in ("EURUSD", "GBPUSD", "USDJPY"),       f"Invalid pair: {self.pair}"
        assert self.direction in ("BUY", "SELL"),                       f"Invalid direction: {self.direction}"
        assert self.result    in ("WIN", "LOSS", "BREAKEVEN", "OPEN"),  f"Invalid result: {self.result}"
        assert self.session   in ("london", "newyork", "asian"),        f"Invalid session: {self.session}"
        assert 0 <= self.zone_score          <= 100, "zone_score out of range"
        assert 0 <= self.liquidity_score     <= 100, "liquidity_score out of range"
        assert 0 <= self.amd_score           <= 100, "amd_score out of range"
        assert 0 <= self.confirmation_score  <= 100, "confirmation_score out of range"
        assert 0 <= self.final_score         <= 100, "final_score out of range"

    def to_dict(self) -> dict:
        return {
            "trade_id":           self.trade_id,
            "pair":               self.pair,
            "direction":          self.direction,
            "entry":              self.entry,
            "stop_loss":          self.stop_loss,
            "take_profit":        self.take_profit,
            "risk_reward":        round(self.risk_reward, 3),
            "zone_score":         self.zone_score,
            "liquidity_score":    self.liquidity_score,
            "amd_score":          self.amd_score,
            "confirmation_score": self.confirmation_score,
            "final_score":        round(self.final_score, 2),
            "result":             self.result,
            "session":            self.session,
            "date":               self.date.isoformat(),
        }

    @staticmethod
    def from_dict(d: dict) -> "Trade":
        return Trade(
            trade_id=           d["trade_id"],
            pair=               d["pair"],
            direction=          d["direction"],
            entry=              d["entry"],
            stop_loss=          d["stop_loss"],
            take_profit=        d["take_profit"],
            risk_reward=        d["risk_reward"],
            zone_score=         d["zone_score"],
            liquidity_score=    d["liquidity_score"],
            amd_score=          d["amd_score"],
            confirmation_score= d["confirmation_score"],
            final_score=        d["final_score"],
            result=             d["result"],
            session=            d["session"],
            date=               datetime.fromisoformat(d["date"]),
        )
