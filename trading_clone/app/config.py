from dataclasses import dataclass, field
from typing import List


@dataclass
class RiskConfig:
    max_risk_per_trade: float = 0.01
    max_daily_loss: float = 0.05
    max_weekly_loss: float = 0.10
    max_open_trades: int = 3
    default_rr: float = 2.0
    break_even_rr: float = 1.0


@dataclass
class BotConfig:
    pairs: List[str] = field(default_factory=lambda: ["EURUSD", "GBPUSD", "USDJPY"])
    timeframes: List[str] = field(default_factory=lambda: ["H1", "H4", "D1"])
    primary_timeframe: str = "H1"
    htf_timeframe: str = "H4"
    sessions: List[str] = field(default_factory=lambda: ["london", "newyork"])
    analysis_interval_seconds: int = 600
    paper_trading: bool = True
    min_signal_score: float = 80.0
    min_zone_strength: float = 70.0
    min_amd_score: float = 80.0
    risk: RiskConfig = field(default_factory=RiskConfig)


@dataclass
class DatabaseConfig:
    url: str = "postgresql://localhost:5432/trading_clone"
    pool_size: int = 5
    echo: bool = False


@dataclass
class AppConfig:
    bot: BotConfig = field(default_factory=BotConfig)
    database: DatabaseConfig = field(default_factory=DatabaseConfig)
    log_level: str = "INFO"
    dashboard_port: int = 8050


CONFIG = AppConfig()
