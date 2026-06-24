"""
Trades database — JSON-backed store (dev).
Swap _backend for a real PostgreSQL driver when ready;
the public API surface stays identical.
"""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Literal, Optional

from trading_clone.database.models import Trade

logger = logging.getLogger(__name__)

_DB_DIR  = Path(os.getenv("LOCAL_DB_PATH", ".local/tradeclone_db"))
_TRADES  = _DB_DIR / "trades.json"


# ── init ─────────────────────────────────────────────────────────────────────

def init_db() -> None:
    _DB_DIR.mkdir(parents=True, exist_ok=True)
    if not _TRADES.exists():
        _TRADES.write_text("[]")
    logger.info("DB initialised at %s", _DB_DIR)


# ── internal helpers ──────────────────────────────────────────────────────────

def _load() -> List[dict]:
    try:
        return json.loads(_TRADES.read_text())
    except Exception:
        return []


def _save(rows: List[dict]) -> None:
    _TRADES.write_text(json.dumps(rows, indent=2, default=str))


# ── CRUD ──────────────────────────────────────────────────────────────────────

def insert_trade(trade: Trade) -> Trade:
    """Validate and persist a new trade row."""
    trade.validate()
    rows = _load()
    rows.append(trade.to_dict())
    _save(rows)
    logger.info("INSERT trade %s  %s %s  score=%.1f",
                trade.trade_id, trade.pair, trade.direction, trade.final_score)
    return trade


def update_result(
    trade_id: str,
    result: Literal["WIN", "LOSS", "BREAKEVEN"],
) -> bool:
    """Close a trade with its final result."""
    rows = _load()
    for row in rows:
        if row["trade_id"] == trade_id:
            row["result"] = result
            _save(rows)
            logger.info("UPDATE trade %s → result=%s", trade_id, result)
            return True
    logger.warning("update_result: trade_id %s not found", trade_id)
    return False


def get_trade(trade_id: str) -> Optional[Trade]:
    for row in _load():
        if row["trade_id"] == trade_id:
            return Trade.from_dict(row)
    return None


def get_all_trades() -> List[Trade]:
    return [Trade.from_dict(r) for r in _load()]


def get_open_trades() -> List[Trade]:
    return [Trade.from_dict(r) for r in _load() if r["result"] == "OPEN"]


def get_closed_trades(limit: int = 100) -> List[Trade]:
    closed = [r for r in _load() if r["result"] != "OPEN"]
    return [Trade.from_dict(r) for r in closed[-limit:]]


def get_trades_by_pair(pair: str) -> List[Trade]:
    return [Trade.from_dict(r) for r in _load() if r["pair"] == pair]


def get_trades_by_session(session: str) -> List[Trade]:
    return [Trade.from_dict(r) for r in _load() if r["session"] == session]


# ── Analytics queries ─────────────────────────────────────────────────────────

def win_rate_by_pair() -> dict:
    """{ 'EURUSD': {'total': 10, 'wins': 7, 'win_rate': 70.0, 'avg_rr': 2.1} }"""
    rows = [r for r in _load() if r["result"] != "OPEN"]
    stats: dict = {}
    for r in rows:
        p = r["pair"]
        if p not in stats:
            stats[p] = {"total": 0, "wins": 0, "rr_sum": 0.0, "score_sum": 0.0}
        stats[p]["total"] += 1
        if r["result"] == "WIN":
            stats[p]["wins"] += 1
        stats[p]["rr_sum"]    += r["risk_reward"]
        stats[p]["score_sum"] += r["final_score"]
    out = {}
    for pair, s in stats.items():
        t = s["total"]
        out[pair] = {
            "total":     t,
            "wins":      s["wins"],
            "win_rate":  round(s["wins"] / t * 100, 1) if t else 0.0,
            "avg_rr":    round(s["rr_sum"] / t, 2)    if t else 0.0,
            "avg_score": round(s["score_sum"] / t, 1)  if t else 0.0,
        }
    return out


def win_rate_by_session() -> dict:
    rows = [r for r in _load() if r["result"] != "OPEN"]
    stats: dict = {}
    for r in rows:
        s = r["session"]
        if s not in stats:
            stats[s] = {"total": 0, "wins": 0}
        stats[s]["total"] += 1
        if r["result"] == "WIN":
            stats[s]["wins"] += 1
    return {
        sess: {
            "total":    s["total"],
            "wins":     s["wins"],
            "win_rate": round(s["wins"] / s["total"] * 100, 1) if s["total"] else 0.0,
        }
        for sess, s in stats.items()
    }


def score_distribution() -> dict:
    """Bucket final_scores: <70, 70-79, 80-89, 90+"""
    rows = _load()
    buckets = {"<70": 0, "70-79": 0, "80-89": 0, "90+": 0}
    for r in rows:
        s = r["final_score"]
        if s < 70:
            buckets["<70"] += 1
        elif s < 80:
            buckets["70-79"] += 1
        elif s < 90:
            buckets["80-89"] += 1
        else:
            buckets["90+"] += 1
    return buckets
