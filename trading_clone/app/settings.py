import os
from trading_clone.app.config import AppConfig, BotConfig, RiskConfig, DatabaseConfig


def load_settings_from_env() -> AppConfig:
    risk = RiskConfig(
        max_risk_per_trade=float(os.getenv("MAX_RISK_PER_TRADE", "0.01")),
        max_daily_loss=float(os.getenv("MAX_DAILY_LOSS", "0.05")),
        max_weekly_loss=float(os.getenv("MAX_WEEKLY_LOSS", "0.10")),
        max_open_trades=int(os.getenv("MAX_OPEN_TRADES", "3")),
        default_rr=float(os.getenv("DEFAULT_RR", "2.0")),
        break_even_rr=float(os.getenv("BREAK_EVEN_RR", "1.0")),
    )

    bot = BotConfig(
        pairs=os.getenv("PAIRS", "EURUSD,GBPUSD,USDJPY").split(","),
        timeframes=os.getenv("TIMEFRAMES", "H1,H4,D1").split(","),
        primary_timeframe=os.getenv("PRIMARY_TF", "H1"),
        htf_timeframe=os.getenv("HTF_TF", "H4"),
        sessions=os.getenv("SESSIONS", "london,newyork").split(","),
        analysis_interval_seconds=int(os.getenv("ANALYSIS_INTERVAL", "600")),
        paper_trading=os.getenv("PAPER_TRADING", "true").lower() == "true",
        min_signal_score=float(os.getenv("MIN_SIGNAL_SCORE", "80.0")),
        min_zone_strength=float(os.getenv("MIN_ZONE_STRENGTH", "70.0")),
        min_amd_score=float(os.getenv("MIN_AMD_SCORE", "80.0")),
        risk=risk,
    )

    database = DatabaseConfig(
        url=os.getenv("DATABASE_URL", "postgresql://localhost:5432/trading_clone"),
        pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
        echo=os.getenv("DB_ECHO", "false").lower() == "true",
    )

    return AppConfig(
        bot=bot,
        database=database,
        log_level=os.getenv("LOG_LEVEL", "INFO"),
        dashboard_port=int(os.getenv("DASHBOARD_PORT", "8050")),
    )


SETTINGS = load_settings_from_env()
