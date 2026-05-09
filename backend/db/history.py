"""
Local grading history via SQLite (Python stdlib — no new dependencies).
DB is stored at <project_root>/data/history.db.

Schema:
  grading_sessions(
    id            TEXT PRIMARY KEY,   -- session UUID
    timestamp     TEXT,               -- ISO 8601
    card_name     TEXT,               -- from card lookup (nullable)
    card_set      TEXT,               -- from card lookup (nullable)
    psa_grade     INTEGER,
    bgs_composite REAL,
    centering     REAL,
    corners       REAL,
    edges         REAL,
    surface       REAL,
    notes         TEXT,               -- user-editable freetext
    tags          TEXT,               -- comma-separated user tags, e.g. "holo,wertvoll"
    thumbnail_b64 TEXT,               -- 60×84px JPEG for list view
    result_json   TEXT                -- full AnalysisResult JSON (for re-render)
  )
"""
import os
import sqlite3
from datetime import datetime, timezone
from typing import Optional, List

from backend.models.response import AnalysisResult

from backend.paths import get_data_dir as _get_data_dir
_DB_PATH = os.path.join(_get_data_dir(), "history.db")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create tables and run idempotent migrations. Called on app startup."""
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS grading_sessions (
                id            TEXT PRIMARY KEY,
                profile_id    TEXT,
                timestamp     TEXT NOT NULL,
                card_name     TEXT,
                card_set      TEXT,
                psa_grade     INTEGER,
                bgs_composite REAL,
                centering     REAL,
                corners       REAL,
                edges         REAL,
                surface       REAL,
                notes         TEXT DEFAULT '',
                tags          TEXT DEFAULT '',
                thumbnail_b64 TEXT,
                result_json   TEXT NOT NULL
            )
        """)
        # Idempotent migrations
        for stmt in (
            "ALTER TABLE grading_sessions ADD COLUMN tags TEXT DEFAULT ''",
            "ALTER TABLE grading_sessions ADD COLUMN profile_id TEXT",
            "ALTER TABLE grading_sessions ADD COLUMN card_id TEXT DEFAULT ''",
            "ALTER TABLE grading_sessions ADD COLUMN card_number TEXT DEFAULT ''",
        ):
            try: conn.execute(stmt)
            except Exception: pass
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sess_profile ON grading_sessions(profile_id, timestamp DESC)")
        except Exception:
            pass
        conn.commit()


def save_result(result: AnalysisResult, card_name: str = "", card_set: str = "",
                profile_id: Optional[str] = None, card_id: str = "",
                card_number: str = "") -> None:
    """Upsert an AnalysisResult into the history DB, scoped to a profile."""
    thumbnail = _make_thumbnail(result)
    with _connect() as conn:
        conn.execute("""
            INSERT INTO grading_sessions
              (id, profile_id, timestamp, card_name, card_set, card_id, card_number,
               psa_grade, bgs_composite, centering, corners, edges, surface, tags,
               thumbnail_b64, result_json)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              profile_id    = excluded.profile_id,
              card_name     = excluded.card_name,
              card_set      = excluded.card_set,
              card_id       = excluded.card_id,
              card_number   = excluded.card_number,
              psa_grade     = excluded.psa_grade,
              bgs_composite = excluded.bgs_composite,
              centering     = excluded.centering,
              corners       = excluded.corners,
              edges         = excluded.edges,
              surface       = excluded.surface,
              thumbnail_b64 = excluded.thumbnail_b64,
              result_json   = excluded.result_json
        """, (
            result.session_id,
            profile_id,
            datetime.now(timezone.utc).isoformat(),
            card_name or "",
            card_set or "",
            card_id or "",
            card_number or "",
            result.grades.psa,
            result.grades.bgs.composite,
            result.subgrades.centering,
            result.subgrades.corners,
            result.subgrades.edges,
            result.subgrades.surface,
            "",
            thumbnail,
            result.model_dump_json(),
        ))
        conn.commit()


def session_owner(session_id: str) -> Optional[str]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT profile_id FROM grading_sessions WHERE id=?", (session_id,)
        ).fetchone()
    return row["profile_id"] if row else None


def update_card_info(session_id: str, card_name: str, card_set: str) -> None:
    """Update card name/set after a successful lookup."""
    with _connect() as conn:
        conn.execute(
            "UPDATE grading_sessions SET card_name=?, card_set=? WHERE id=?",
            (card_name, card_set, session_id),
        )
        conn.commit()


def update_notes(session_id: str, notes: str) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE grading_sessions SET notes=? WHERE id=?",
            (notes, session_id),
        )
        conn.commit()


def update_tags(session_id: str, tags: str) -> None:
    """tags is a comma-separated string, e.g. 'holo,wertvoll,send-in'."""
    with _connect() as conn:
        conn.execute(
            "UPDATE grading_sessions SET tags=? WHERE id=?",
            (tags.strip(), session_id),
        )
        conn.commit()


def load_result(session_id: str) -> Optional[AnalysisResult]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT result_json FROM grading_sessions WHERE id=?", (session_id,)
        ).fetchone()
    if row:
        return AnalysisResult.model_validate_json(row["result_json"])
    return None


def list_sessions(
    profile_id: Optional[str] = None,
    limit: int = 500,
    search: str = "",
    sort: str = "date_desc",
    psa_min: int = 1,
    psa_max: int = 10,
) -> List[dict]:
    """
    Return summary rows (no images) for the history/library list.
    When `profile_id` is provided, returns only that user's rows.
    """
    sort_map = {
        "date_desc":  "timestamp DESC",
        "date_asc":   "timestamp ASC",
        "psa_desc":   "psa_grade DESC, timestamp DESC",
        "psa_asc":    "psa_grade ASC, timestamp DESC",
        "name_asc":   "card_name ASC, timestamp DESC",
    }
    order = sort_map.get(sort, "timestamp DESC")
    search_filter = f"%{search}%" if search else "%"

    with _connect() as conn:
        cols = ("id, timestamp, card_name, card_set, card_id, card_number, "
                "psa_grade, bgs_composite, centering, corners, edges, surface, "
                "notes, tags, thumbnail_b64")
        if profile_id is not None:
            rows = conn.execute(f"""
                SELECT {cols}
                FROM grading_sessions
                WHERE profile_id = ?
                  AND (card_name LIKE ? OR ? = '%')
                  AND psa_grade >= ?
                  AND psa_grade <= ?
                ORDER BY {order}
                LIMIT ?
            """, (profile_id, search_filter, search_filter, psa_min, psa_max, limit)).fetchall()
        else:
            rows = conn.execute(f"""
                SELECT {cols}
                FROM grading_sessions
                WHERE (card_name LIKE ? OR ? = '%')
                  AND psa_grade >= ?
                  AND psa_grade <= ?
                ORDER BY {order}
                LIMIT ?
            """, (search_filter, search_filter, psa_min, psa_max, limit)).fetchall()
    return [dict(r) for r in rows]


def list_sessions_for_user(profile_id: str, limit: int = 200) -> List[dict]:
    """Public-profile feed (lightweight columns, profile-scoped)."""
    with _connect() as conn:
        rows = conn.execute("""
            SELECT id, timestamp, card_name, card_set, psa_grade, centering, thumbnail_b64
            FROM grading_sessions
            WHERE profile_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        """, (profile_id, limit)).fetchall()
    return [dict(r) for r in rows]


def delete_session(session_id: str) -> None:
    """Drop the DB row + best-effort cleanup of the original upload files."""
    with _connect() as conn:
        conn.execute("DELETE FROM grading_sessions WHERE id=?", (session_id,))
        conn.commit()
    try:
        from glob import glob
        from backend.paths import get_uploads_dir
        for p in glob(os.path.join(get_uploads_dir(), f"{session_id}_*")):
            try: os.remove(p)
            except OSError: pass
    except Exception:
        pass


def save_unanalysed(session_id: str, card_name: str, card_set: str,
                    profile_id: str = "") -> None:
    """Create a stub history entry for a CSV-imported card with no scan."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with _connect() as conn:
        conn.execute(
            """INSERT OR IGNORE INTO grading_sessions
               (id, profile_id, timestamp, card_name, card_set,
                psa_grade, bgs_composite, centering, corners, edges, surface,
                result_json)
               VALUES (?,?,?,?,?,NULL,NULL,NULL,NULL,NULL,NULL,'{}')""",
            (session_id, profile_id, now, card_name, card_set),
        )
        conn.commit()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_thumbnail(result: AnalysisResult, width: int = 240, height: int = 336) -> str:
    """Card-grid thumbnail (~240×336) from the warped clean front image.
    JPEG q=72 keeps it small (~6-12 KB) while remaining sharp on retina."""
    if not result.clean_front_b64:
        return ""
    try:
        import base64
        import numpy as np
        import cv2
        data = base64.b64decode(result.clean_front_b64)
        arr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return ""
        thumb = cv2.resize(img, (width, height), interpolation=cv2.INTER_AREA)
        _, buf = cv2.imencode(".jpg", thumb, [cv2.IMWRITE_JPEG_QUALITY, 72])
        return base64.b64encode(buf.tobytes()).decode("utf-8")
    except Exception:
        return ""
