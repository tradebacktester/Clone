import logging
import os
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from trading_clone.database.models import (
    TradeModel, SignalModel, ZoneModel, BotStateModel, BacktestModel, LearningModel,
)

logger = logging.getLogger(__name__)

_DB_PATH = Path(os.getenv("LOCAL_DB_PATH", ".local/trading_clone_db"))
_tables: Dict[str, List[dict]] = {
    "trades": [], "signals": [], "zones": [],
    "bot_state": [], "backtests": [], "learning": [],
}


def init_db() -> None:
    _DB_PATH.mkdir(parents=True, exist_ok=True)
    for table in _tables:
        fpath = _DB_PATH / f"{table}.json"
        if fpath.exists():
            try:
                with open(fpath) as f:
                    _tables[table] = json.load(f)
            except Exception:
                _tables[table] = []
    logger.info("Database initialised at %s", _DB_PATH)


def _persist(table: str) -> None:
    fpath = _DB_PATH / f"{table}.json"
    try:
        with open(fpath, "w") as f:
            json.dump(_tables[table], f, default=str, indent=2)
    except Exception as exc:
        logger.error("Failed to persist table %s: %s", table, exc)


def insert_trade(trade: TradeModel) -> None:
    _tables["trades"].append(trade.__dict__.copy())
    _persist("trades")


def update_trade(trade_id: str, updates: dict) -> None:
    for row in _tables["trades"]:
        if row.get("id") == trade_id:
            row.update(updates)
            break
    _persist("trades")


def get_open_trades() -> List[dict]:
    return [t for t in _tables["trades"] if t.get("status") == "open"]


def get_closed_trades(limit: int = 100) -> List[dict]:
    closed = [t for t in _tables["trades"] if t.get("status") == "closed"]
    return closed[-limit:]


def insert_signal(signal: SignalModel) -> None:
    _tables["signals"].append(signal.__dict__.copy())
    if len(_tables["signals"]) > 200:
        _tables["signals"] = _tables["signals"][-200:]
    _persist("signals")


def get_latest_signals(pair: Optional[str] = None, limit: int = 20) -> List[dict]:
    sigs = _tables["signals"]
    if pair:
        sigs = [s for s in sigs if s.get("pair") == pair]
    return sigs[-limit:]


def upsert_bot_state(state: BotStateModel) -> None:
    if _tables["bot_state"]:
        _tables["bot_state"][0] = state.__dict__.copy()
    else:
        _tables["bot_state"].append(state.__dict__.copy())
    _persist("bot_state")


def get_bot_state() -> Optional[dict]:
    return _tables["bot_state"][0] if _tables["bot_state"] else None


def upsert_learning(model: LearningModel) -> None:
    d = model.__dict__.copy()
    d["updated_at"] = datetime.now(timezone.utc).isoformat()
    if _tables["learning"]:
        _tables["learning"][0] = d
    else:
        _tables["learning"].append(d)
    _persist("learning")


def get_learning() -> Optional[dict]:
    return _tables["learning"][0] if _tables["learning"] else None


def insert_backtest(bt: BacktestModel) -> None:
    _tables["backtests"].append(bt.__dict__.copy())
    _persist("backtests")


def get_backtests(limit: int = 20) -> List[dict]:
    return _tables["backtests"][-limit:]


def insert_zones(zones: List[ZoneModel]) -> None:
    _tables["zones"] = [z.__dict__.copy() for z in zones]
    _persist("zones")


def get_zones(pair: Optional[str] = None) -> List[dict]:
    z = _tables["zones"]
    if pair:
        z = [x for x in z if x.get("pair") == pair]
    return z
