"""
Persists WeightSnapshot history to disk (JSON).
Swap _load/_save for a DB call when connecting to PostgreSQL.
"""

import json
import logging
import os
from pathlib import Path
from typing import List, Optional

from trading_clone.learning_engine.weight_learner import WeightSnapshot

logger = logging.getLogger(__name__)

_DB_DIR   = Path(os.getenv("LOCAL_DB_PATH", ".local/tradeclone_db"))
_WEIGHTS  = _DB_DIR / "weight_snapshots.json"


def init_weight_store() -> None:
    _DB_DIR.mkdir(parents=True, exist_ok=True)
    if not _WEIGHTS.exists():
        _WEIGHTS.write_text("[]")


def save_snapshot(snap: WeightSnapshot) -> None:
    snapshots = load_all()
    snapshots.append(snap.to_dict())
    _WEIGHTS.write_text(json.dumps(snapshots, indent=2))
    logger.info("WeightStore: saved snapshot v%d", snap.version)


def load_latest() -> Optional[WeightSnapshot]:
    snapshots = load_all()
    if not snapshots:
        return None
    return WeightSnapshot.from_dict(snapshots[-1])


def load_all() -> List[dict]:
    try:
        return json.loads(_WEIGHTS.read_text())
    except Exception:
        return []


def load_history() -> List[WeightSnapshot]:
    return [WeightSnapshot.from_dict(d) for d in load_all()]
