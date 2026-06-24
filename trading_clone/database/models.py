from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class TradeModel:
    id: str
    pair: str
    direction: str
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
    amd_score: int = 0
    final_score: float = 0.0
    session: str = ""
    risk_reward: float = 0.0


@dataclass
class SignalModel:
    id: str
    pair: str
    direction: str
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
    confidence: float
    generated_at: datetime
    confluence_factors: str = ""


@dataclass
class ZoneModel:
    id: str
    pair: str
    timeframe: str
    zone_type: str
    price_top: float
    price_bottom: float
    strength: int
    tested: int
    active: bool
    freshness: str
    origin_time: datetime


@dataclass
class BotStateModel:
    id: int = 1
    running: bool = False
    mode: str = "paper"
    started_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None
    analysis_count: int = 0
    signal_count: int = 0


@dataclass
class BacktestModel:
    id: str
    pair: str
    timeframe: str
    start_date: datetime
    end_date: datetime
    initial_balance: float
    final_balance: float
    total_trades: int
    win_rate: float
    profit_factor: float
    max_drawdown: float
    sharpe_ratio: float
    created_at: datetime


@dataclass
class LearningModel:
    id: int = 1
    episode: int = 0
    epsilon: float = 0.1
    total_reward: float = 0.0
    zone_weight: float = 0.30
    liquidity_weight: float = 0.25
    amd_weight: float = 0.25
    confirmation_weight: float = 0.20
    updated_at: Optional[datetime] = None
