from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone

from dispatcher.models import ExecutionResult, TriageResult

_SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    issue_list TEXT NOT NULL,
    config TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES runs(id),
    issue_number INTEGER NOT NULL,
    issue_title TEXT NOT NULL,
    issue_url TEXT NOT NULL,
    scope TEXT,
    richness_score INTEGER,
    richness_signals TEXT,
    triage_tier TEXT,
    confidence REAL,
    risk_flags TEXT,
    missing_info TEXT,
    triage_reasoning TEXT,
    reviewed_tier TEXT,
    skipped INTEGER DEFAULT 0,
    branch_name TEXT,
    session_id TEXT,
    num_turns INTEGER,
    is_error INTEGER DEFAULT 0,
    pr_number INTEGER,
    pr_url TEXT,
    error_message TEXT,
    outcome TEXT,
    clarification_comment TEXT,
    comment_posted INTEGER DEFAULT 0,
    resume_count INTEGER DEFAULT 0,
    triage_started_at TEXT,
    triage_finished_at TEXT,
    exec_started_at TEXT,
    exec_finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_issues_run_id ON issues(run_id);
CREATE INDEX IF NOT EXISTS idx_issues_outcome ON issues(outcome);
CREATE INDEX IF NOT EXISTS idx_issues_issue_number ON issues(issue_number);
"""


def init_db(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    return conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def insert_run(conn: sqlite3.Connection, run_id: str, issue_list: list[int], config_json: str) -> None:
    conn.execute(
        "INSERT INTO runs (id, started_at, issue_list, config, status) VALUES (?, ?, ?, ?, 'running')",
        (run_id, _now(), json.dumps(issue_list), config_json),
    )
    conn.commit()


def update_run_status(conn: sqlite3.Connection, run_id: str, status: str) -> None:
    finished = _now() if status in ("completed", "failed", "cancelled") else None
    conn.execute(
        "UPDATE runs SET status = ?, finished_at = ? WHERE id = ?",
        (status, finished, run_id),
    )
    conn.commit()


def insert_issue(conn: sqlite3.Connection, run_id: str, tr: TriageResult) -> None:
    conn.execute(
        """INSERT INTO issues (
            run_id, issue_number, issue_title, issue_url,
            scope, richness_score, richness_signals, triage_tier,
            confidence, risk_flags, missing_info, triage_reasoning,
            triage_started_at, triage_finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            run_id, tr.issue_number, tr.issue_title, tr.issue_url,
            tr.scope, tr.richness_score, json.dumps(tr.richness_signals),
            tr.triage_tier, tr.confidence, json.dumps(tr.risk_flags),
            json.dumps(tr.missing_info), tr.reasoning, _now(), _now(),
        ),
    )
    conn.commit()


def update_issue_execution(conn: sqlite3.Connection, run_id: str, issue_number: int, er: ExecutionResult) -> None:
    conn.execute(
        """UPDATE issues SET
            branch_name = ?, session_id = ?, num_turns = ?, is_error = ?,
            pr_number = ?, pr_url = ?, error_message = ?, outcome = ?,
            exec_started_at = ?, exec_finished_at = ?
        WHERE run_id = ? AND issue_number = ?""",
        (
            er.branch_name, er.session_id, er.num_turns, int(er.is_error),
            er.pr_number, er.pr_url, er.error_message, er.outcome,
            _now(), _now(), run_id, issue_number,
        ),
    )
    conn.commit()


def get_resumable_issues(conn: sqlite3.Connection, run_id: str) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM issues WHERE run_id = ? AND outcome IN ('failed', 'leash_hit')",
        (run_id,),
    ).fetchall()


def get_previous_triage(conn: sqlite3.Connection, issue_number: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM issues WHERE issue_number = ? ORDER BY triage_finished_at DESC LIMIT 1",
        (issue_number,),
    ).fetchone()
