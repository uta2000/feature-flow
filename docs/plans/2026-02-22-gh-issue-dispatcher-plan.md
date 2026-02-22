# GitHub Issue Dispatcher — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Python CLI tool that batch-processes GitHub issues through feature-flow's YOLO mode — selection TUI, triage via claude -p Sonnet, review TUI, execution via claude -p Opus, SQLite logging.

**Architecture:** Python package at `dispatcher/` with `__main__.py` entry point. Five-stage pipeline (Selection → Triage → Review → Execution → Logging) orchestrated by `pipeline.py`. Each stage is a separate module with clear boundaries. TUIs built with Textual. All external calls via `subprocess.run`. SQLite for persistence.

**Tech Stack:** Python ≥ 3.11, Textual ≥ 0.47, PyYAML, pytest, pytest-asyncio, sqlite3 (stdlib), subprocess (stdlib)

**Issue:** #69

---

### Task 1: Project scaffolding and pyproject.toml

**Files:**
- Create: `dispatcher/__init__.py`
- Create: `dispatcher/__main__.py`
- Create: `dispatcher/tests/__init__.py`
- Create: `dispatcher/tests/test_tui/__init__.py`
- Create: `dispatcher/tui/__init__.py`
- Create: `pyproject.toml`
- Modify: `.gitignore`

**Acceptance Criteria:**
- [ ] `pyproject.toml` exists at project root with `[project]` name `feature-flow-dispatcher`, requires-python `>=3.11`, dependencies `textual>=0.47` and `pyyaml`
- [ ] `pyproject.toml` has `[project.optional-dependencies]` dev group with `pytest` and `pytest-asyncio`
- [ ] `dispatcher/__init__.py` exists and is empty
- [ ] `dispatcher/__main__.py` exists and calls `cli.main()` (placeholder import)
- [ ] `.gitignore` contains `__pycache__/`, `*.pyc`, `.venv/`, `*.egg-info/`, `dispatcher.db`
- [ ] `pip install -e ".[dev]"` succeeds in a venv
- [ ] `python -m pytest dispatcher/tests/ --co` runs without import errors

**Step 1: Create pyproject.toml**

```toml
[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "feature-flow-dispatcher"
version = "0.1.0"
description = "Batch-process GitHub issues through feature-flow YOLO mode"
requires-python = ">=3.11"
dependencies = [
    "textual>=0.47",
    "pyyaml",
]

[project.optional-dependencies]
dev = [
    "pytest",
    "pytest-asyncio",
]
```

**Step 2: Create package structure**

Create `dispatcher/__init__.py` (empty), `dispatcher/tui/__init__.py` (empty), `dispatcher/tests/__init__.py` (empty), `dispatcher/tests/test_tui/__init__.py` (empty).

Create `dispatcher/__main__.py`:
```python
from dispatcher.cli import main

if __name__ == "__main__":
    main()
```

**Step 3: Update .gitignore**

Append Python patterns: `__pycache__/`, `*.pyc`, `.venv/`, `*.egg-info/`, `dispatcher.db`

**Step 4: Create venv, install, verify**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

**Step 5: Commit**

```bash
git add pyproject.toml dispatcher/__init__.py dispatcher/__main__.py dispatcher/tui/__init__.py dispatcher/tests/__init__.py dispatcher/tests/test_tui/__init__.py .gitignore
git commit -m "feat(dispatcher): scaffold Python package with pyproject.toml"
```

---

### Task 2: Models — dataclasses for Config, TriageResult, ReviewedIssue, ExecutionResult

**Files:**
- Create: `dispatcher/models.py`
- Create: `dispatcher/tests/test_models.py`

**Acceptance Criteria:**
- [ ] `Config` dataclass has all 15 fields from design doc (plugin_path, repo, base_branch, triage_model, execution_model, triage_max_turns, execution_max_turns, max_resume_attempts, db_path, branch_prefix_fix, branch_prefix_feat, default_label, selection_limit, rate_limit_pause_seconds, rate_limit_batch_pause_seconds)
- [ ] `TriageResult` dataclass has fields: issue_number, issue_title, issue_url, scope, richness_score, richness_signals, triage_tier, confidence, risk_flags, missing_info, reasoning
- [ ] `ReviewedIssue` dataclass has fields: triage (TriageResult), final_tier, skipped, edited_comment
- [ ] `ExecutionResult` dataclass has fields: issue_number, branch_name, session_id, num_turns, is_error, pr_number, pr_url, error_message, outcome
- [ ] All dataclasses are frozen where appropriate (TriageResult, ExecutionResult)
- [ ] `pytest dispatcher/tests/test_models.py -v` passes

**Step 1: Write failing tests**

```python
# dispatcher/tests/test_models.py
from dispatcher.models import Config, TriageResult, ReviewedIssue, ExecutionResult


def test_config_defaults():
    cfg = Config(plugin_path="/path/to/plugin")
    assert cfg.plugin_path == "/path/to/plugin"
    assert cfg.default_label == "dispatcher-ready"
    assert cfg.triage_max_turns == 1
    assert cfg.execution_max_turns == 200
    assert cfg.max_resume_attempts == 2
    assert cfg.db_path == "./dispatcher.db"
    assert cfg.selection_limit == 50
    assert cfg.rate_limit_pause_seconds == 300
    assert cfg.rate_limit_batch_pause_seconds == 900
    assert cfg.branch_prefix_fix == "fix"
    assert cfg.branch_prefix_feat == "feat"


def test_triage_result_frozen():
    tr = TriageResult(
        issue_number=42,
        issue_title="Add CSV export",
        issue_url="https://github.com/o/r/issues/42",
        scope="small-enhancement",
        richness_score=3,
        richness_signals={"acceptance_criteria": True, "resolved_discussion": True, "concrete_examples": True, "structured_content": False},
        triage_tier="full-yolo",
        confidence=0.92,
        risk_flags=[],
        missing_info=[],
        reasoning="Clear scope, good detail.",
    )
    assert tr.issue_number == 42
    assert tr.triage_tier == "full-yolo"


def test_reviewed_issue():
    tr = TriageResult(
        issue_number=42, issue_title="Test", issue_url="url",
        scope="quick-fix", richness_score=4,
        richness_signals={}, triage_tier="full-yolo",
        confidence=0.95, risk_flags=[], missing_info=[], reasoning="ok",
    )
    ri = ReviewedIssue(triage=tr, final_tier="supervised-yolo", skipped=False, edited_comment=None)
    assert ri.final_tier == "supervised-yolo"
    assert ri.triage.issue_number == 42


def test_execution_result():
    er = ExecutionResult(
        issue_number=42, branch_name="feat/42-csv-export",
        session_id="abc-123", num_turns=15, is_error=False,
        pr_number=100, pr_url="https://github.com/o/r/pull/100",
        error_message=None, outcome="pr_created",
    )
    assert er.outcome == "pr_created"
    assert er.pr_number == 100
```

**Step 2: Run tests to verify failure**

Run: `python -m pytest dispatcher/tests/test_models.py -v`
Expected: FAIL — ImportError

**Step 3: Implement models.py**

```python
# dispatcher/models.py
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Config:
    plugin_path: str
    repo: str = ""
    base_branch: str = "main"
    triage_model: str = "claude-sonnet-4-20250514"
    execution_model: str = "claude-opus-4-20250514"
    triage_max_turns: int = 1
    execution_max_turns: int = 200
    max_resume_attempts: int = 2
    db_path: str = "./dispatcher.db"
    branch_prefix_fix: str = "fix"
    branch_prefix_feat: str = "feat"
    default_label: str = "dispatcher-ready"
    selection_limit: int = 50
    rate_limit_pause_seconds: int = 300
    rate_limit_batch_pause_seconds: int = 900
    issues: list[int] = field(default_factory=list)
    auto: bool = False
    dry_run: bool = False
    resume: str = ""
    verbose: bool = False


@dataclass(frozen=True)
class TriageResult:
    issue_number: int
    issue_title: str
    issue_url: str
    scope: str
    richness_score: int
    richness_signals: dict[str, bool]
    triage_tier: str
    confidence: float
    risk_flags: list[str]
    missing_info: list[str]
    reasoning: str


@dataclass
class ReviewedIssue:
    triage: TriageResult
    final_tier: str
    skipped: bool
    edited_comment: str | None


@dataclass(frozen=True)
class ExecutionResult:
    issue_number: int
    branch_name: str
    session_id: str | None
    num_turns: int
    is_error: bool
    pr_number: int | None
    pr_url: str | None
    error_message: str | None
    outcome: str
```

**Step 4: Run tests**

Run: `python -m pytest dispatcher/tests/test_models.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add dispatcher/models.py dispatcher/tests/test_models.py
git commit -m "feat(dispatcher): add dataclasses for Config, TriageResult, ReviewedIssue, ExecutionResult"
```

---

### Task 3: Database layer — init, insert, update, query

**Files:**
- Create: `dispatcher/db.py`
- Create: `dispatcher/tests/test_db.py`
- Create: `dispatcher/tests/conftest.py`

**Acceptance Criteria:**
- [ ] `init_db(path)` creates `runs` and `issues` tables with all columns from design doc
- [ ] `init_db(path)` creates indexes on `run_id`, `outcome`, and `issue_number`
- [ ] `init_db(":memory:")` works for tests
- [ ] `insert_run(conn, run_id, issue_list, config_json)` inserts a row into `runs` with status `running`
- [ ] `update_run_status(conn, run_id, status)` updates status and sets `finished_at` when terminal
- [ ] `insert_issue(conn, run_id, triage_result)` inserts triage data into `issues`
- [ ] `update_issue_execution(conn, run_id, issue_number, execution_result)` updates execution columns
- [ ] `get_resumable_issues(conn, run_id)` returns issues with outcome `failed` or `leash_hit`
- [ ] `get_previous_triage(conn, issue_number)` returns the most recent triage for a given issue number (for parked indicator)
- [ ] `pytest dispatcher/tests/test_db.py -v` passes

**Step 1: Write conftest with in-memory DB fixture**

```python
# dispatcher/tests/conftest.py
import sqlite3

import pytest

from dispatcher.db import init_db


@pytest.fixture
def db():
    conn = init_db(":memory:")
    yield conn
    conn.close()
```

**Step 2: Write failing tests**

```python
# dispatcher/tests/test_db.py
import json

from dispatcher.db import (
    get_previous_triage,
    get_resumable_issues,
    init_db,
    insert_issue,
    insert_run,
    update_issue_execution,
    update_run_status,
)
from dispatcher.models import ExecutionResult, TriageResult


def _make_triage(issue_number: int = 42, tier: str = "full-yolo") -> TriageResult:
    return TriageResult(
        issue_number=issue_number,
        issue_title=f"Issue #{issue_number}",
        issue_url=f"https://github.com/o/r/issues/{issue_number}",
        scope="quick-fix",
        richness_score=4,
        richness_signals={"acceptance_criteria": True, "resolved_discussion": True, "concrete_examples": True, "structured_content": True},
        triage_tier=tier,
        confidence=0.95,
        risk_flags=[],
        missing_info=[],
        reasoning="Clear scope.",
    )


def test_init_creates_tables(db):
    cursor = db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [row[0] for row in cursor.fetchall()]
    assert "issues" in tables
    assert "runs" in tables


def test_insert_and_update_run(db):
    insert_run(db, "run-1", [42, 43], '{"key": "val"}')
    row = db.execute("SELECT * FROM runs WHERE id = ?", ("run-1",)).fetchone()
    assert row is not None
    assert row["status"] == "running"

    update_run_status(db, "run-1", "completed")
    row = db.execute("SELECT * FROM runs WHERE id = ?", ("run-1",)).fetchone()
    assert row["status"] == "completed"
    assert row["finished_at"] is not None


def test_insert_issue(db):
    insert_run(db, "run-1", [42], "{}")
    tr = _make_triage(42)
    insert_issue(db, "run-1", tr)
    row = db.execute("SELECT * FROM issues WHERE issue_number = 42").fetchone()
    assert row is not None
    assert row["triage_tier"] == "full-yolo"
    assert row["scope"] == "quick-fix"


def test_update_issue_execution(db):
    insert_run(db, "run-1", [42], "{}")
    insert_issue(db, "run-1", _make_triage(42))
    er = ExecutionResult(
        issue_number=42, branch_name="fix/42-test",
        session_id="sess-1", num_turns=10, is_error=False,
        pr_number=100, pr_url="https://github.com/o/r/pull/100",
        error_message=None, outcome="pr_created",
    )
    update_issue_execution(db, "run-1", 42, er)
    row = db.execute("SELECT * FROM issues WHERE issue_number = 42 AND run_id = 'run-1'").fetchone()
    assert row["outcome"] == "pr_created"
    assert row["pr_number"] == 100
    assert row["session_id"] == "sess-1"


def test_get_resumable_issues(db):
    insert_run(db, "run-1", [42, 43, 44], "{}")
    insert_issue(db, "run-1", _make_triage(42))
    insert_issue(db, "run-1", _make_triage(43))
    insert_issue(db, "run-1", _make_triage(44))
    update_issue_execution(db, "run-1", 42, ExecutionResult(42, "b", "s1", 10, False, 100, "u", None, "pr_created"))
    update_issue_execution(db, "run-1", 43, ExecutionResult(43, "b", "s2", 200, False, None, None, "hit limit", "leash_hit"))
    update_issue_execution(db, "run-1", 44, ExecutionResult(44, "b", "s3", 5, True, None, None, "crash", "failed"))
    resumable = get_resumable_issues(db, "run-1")
    numbers = [r["issue_number"] for r in resumable]
    assert 43 in numbers
    assert 44 in numbers
    assert 42 not in numbers


def test_get_previous_triage(db):
    insert_run(db, "run-1", [42], "{}")
    insert_issue(db, "run-1", _make_triage(42, tier="parked"))
    prev = get_previous_triage(db, 42)
    assert prev is not None
    assert prev["triage_tier"] == "parked"


def test_get_previous_triage_none(db):
    prev = get_previous_triage(db, 999)
    assert prev is None
```

**Step 3: Implement db.py**

```python
# dispatcher/db.py
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
```

**Step 4: Run tests**

Run: `python -m pytest dispatcher/tests/test_db.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add dispatcher/db.py dispatcher/tests/conftest.py dispatcher/tests/test_db.py
git commit -m "feat(dispatcher): add SQLite database layer with runs and issues tables"
```

---

### Task 4: Config — YAML + CLI args + defaults

**Files:**
- Create: `dispatcher/config.py`
- Create: `dispatcher/tests/test_config.py`

**Acceptance Criteria:**
- [ ] `load_config(args)` accepts a namespace with CLI args and returns a `Config` dataclass
- [ ] YAML file values fill in where CLI args are not provided
- [ ] Auto-detection fills `repo` from `git remote get-url origin` when not set
- [ ] Auto-detection fills `base_branch` from `git symbolic-ref refs/remotes/origin/HEAD` when not set
- [ ] Precedence: CLI args > YAML > auto-detected defaults
- [ ] Missing `plugin_path` (not in YAML or CLI) raises `SystemExit(2)`
- [ ] Missing YAML file is not an error — uses defaults
- [ ] `pytest dispatcher/tests/test_config.py -v` passes

**Step 1: Write failing tests**

```python
# dispatcher/tests/test_config.py
import argparse
from pathlib import Path
from unittest.mock import patch

import pytest

from dispatcher.config import load_config


def _args(**overrides):
    defaults = {
        "issues": None, "label": None, "repo": None, "auto": False,
        "config": "nonexistent.yml", "dry_run": False, "resume": None,
        "limit": None, "verbose": False,
    }
    defaults.update(overrides)
    return argparse.Namespace(**defaults)


def test_load_config_from_yaml(tmp_path):
    cfg_file = tmp_path / "dispatcher.yml"
    cfg_file.write_text("plugin_path: /test/path\ndefault_label: custom-label\n")
    with patch("dispatcher.config._detect_repo", return_value="owner/repo"):
        cfg = load_config(_args(config=str(cfg_file)))
    assert cfg.plugin_path == "/test/path"
    assert cfg.default_label == "custom-label"


def test_cli_overrides_yaml(tmp_path):
    cfg_file = tmp_path / "dispatcher.yml"
    cfg_file.write_text("plugin_path: /test/path\ndefault_label: yaml-label\n")
    with patch("dispatcher.config._detect_repo", return_value="owner/repo"):
        cfg = load_config(_args(config=str(cfg_file), label="cli-label"))
    assert cfg.default_label == "cli-label"


def test_missing_yaml_uses_defaults():
    with patch("dispatcher.config._detect_repo", return_value="owner/repo"):
        with pytest.raises(SystemExit):
            load_config(_args(config="nonexistent.yml"))


def test_missing_plugin_path_exits(tmp_path):
    cfg_file = tmp_path / "dispatcher.yml"
    cfg_file.write_text("default_label: test\n")
    with patch("dispatcher.config._detect_repo", return_value="owner/repo"):
        with pytest.raises(SystemExit):
            load_config(_args(config=str(cfg_file)))


def test_issues_parsed(tmp_path):
    cfg_file = tmp_path / "dispatcher.yml"
    cfg_file.write_text("plugin_path: /test\n")
    with patch("dispatcher.config._detect_repo", return_value="owner/repo"):
        cfg = load_config(_args(config=str(cfg_file), issues="42,43,51"))
    assert cfg.issues == [42, 43, 51]
```

**Step 2: Implement config.py**

```python
# dispatcher/config.py
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import yaml

from dispatcher.models import Config


def _detect_repo() -> str:
    try:
        url = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        # Parse owner/repo from git URL
        if url.endswith(".git"):
            url = url[:-4]
        if "github.com" in url:
            parts = url.split("github.com")[-1].strip("/:")
            return parts
    except Exception:
        pass
    return ""


def _detect_base_branch() -> str:
    try:
        ref = subprocess.run(
            ["git", "symbolic-ref", "refs/remotes/origin/HEAD"],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        return ref.split("/")[-1] if ref else "main"
    except Exception:
        return "main"


def load_config(args: argparse.Namespace) -> Config:
    yaml_data: dict = {}
    config_path = Path(args.config)
    if config_path.exists():
        with open(config_path) as f:
            yaml_data = yaml.safe_load(f) or {}

    plugin_path = yaml_data.get("plugin_path", "")
    if not plugin_path:
        print("Error: plugin_path is required in dispatcher.yml", file=sys.stderr)
        sys.exit(2)

    repo = args.repo or yaml_data.get("repo") or _detect_repo()
    base_branch = yaml_data.get("base_branch") or _detect_base_branch()
    label = args.label or yaml_data.get("default_label", "dispatcher-ready")
    limit = args.limit or yaml_data.get("selection_limit", 50)

    issues: list[int] = []
    if args.issues:
        issues = [int(n.strip()) for n in args.issues.split(",")]

    return Config(
        plugin_path=plugin_path,
        repo=repo,
        base_branch=base_branch,
        triage_model=yaml_data.get("triage_model", "claude-sonnet-4-20250514"),
        execution_model=yaml_data.get("execution_model", "claude-opus-4-20250514"),
        triage_max_turns=yaml_data.get("triage_max_turns", 1),
        execution_max_turns=yaml_data.get("execution_max_turns", 200),
        max_resume_attempts=yaml_data.get("max_resume_attempts", 2),
        db_path=yaml_data.get("db_path", "./dispatcher.db"),
        branch_prefix_fix=yaml_data.get("branch_prefix_fix", "fix"),
        branch_prefix_feat=yaml_data.get("branch_prefix_feat", "feat"),
        default_label=label,
        selection_limit=limit,
        rate_limit_pause_seconds=yaml_data.get("rate_limit_pause_seconds", 300),
        rate_limit_batch_pause_seconds=yaml_data.get("rate_limit_batch_pause_seconds", 900),
        issues=issues,
        auto=args.auto,
        dry_run=args.dry_run,
        resume=args.resume or "",
        verbose=args.verbose,
    )
```

**Step 3: Run tests**

Run: `python -m pytest dispatcher/tests/test_config.py -v`
Expected: All PASS

**Step 4: Commit**

```bash
git add dispatcher/config.py dispatcher/tests/test_config.py
git commit -m "feat(dispatcher): add config loader with YAML + CLI + auto-detection"
```

---

### Task 5: GitHub wrapper — gh CLI subprocess calls

**Files:**
- Create: `dispatcher/github.py`
- Create: `dispatcher/tests/test_github.py`

**Acceptance Criteria:**
- [ ] `list_issues(label, limit, repo)` returns list of dicts with `number`, `title`, `url`, `labels`, `createdAt`
- [ ] `view_issue(number, repo)` returns dict with `title`, `body`, `comments`
- [ ] `list_prs(head_branch, repo)` returns list of dicts with `number`, `url`
- [ ] `post_comment(issue_number, body, repo)` calls `gh issue comment`
- [ ] `add_label(pr_number, label, repo)` calls `gh pr edit --add-label`
- [ ] All functions use `subprocess.run` with `timeout=30`
- [ ] Non-zero exit codes raise `GithubError` with stderr content
- [ ] `pytest dispatcher/tests/test_github.py -v` passes (all subprocess calls mocked)

**Step 1: Write failing tests**

```python
# dispatcher/tests/test_github.py
import json
import subprocess
from unittest.mock import patch

import pytest

from dispatcher.github import GithubError, add_label, list_issues, list_prs, post_comment, view_issue


def _mock_run(stdout="", returncode=0, stderr=""):
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


@patch("dispatcher.github.subprocess.run")
def test_list_issues(mock_run):
    issues = [{"number": 42, "title": "Test", "url": "u", "labels": [{"name": "bug"}], "createdAt": "2026-01-01"}]
    mock_run.return_value = _mock_run(stdout=json.dumps(issues))
    result = list_issues("dispatcher-ready", 50, "owner/repo")
    assert len(result) == 1
    assert result[0]["number"] == 42
    mock_run.assert_called_once()


@patch("dispatcher.github.subprocess.run")
def test_view_issue(mock_run):
    data = {"title": "Test", "body": "Description", "comments": [{"body": "comment1"}]}
    mock_run.return_value = _mock_run(stdout=json.dumps(data))
    result = view_issue(42, "owner/repo")
    assert result["title"] == "Test"
    assert result["body"] == "Description"


@patch("dispatcher.github.subprocess.run")
def test_list_issues_gh_error(mock_run):
    mock_run.return_value = _mock_run(returncode=1, stderr="auth required")
    with pytest.raises(GithubError, match="auth required"):
        list_issues("label", 50, "owner/repo")


@patch("dispatcher.github.subprocess.run")
def test_post_comment(mock_run):
    mock_run.return_value = _mock_run()
    post_comment(42, "Hello", "owner/repo")
    mock_run.assert_called_once()


@patch("dispatcher.github.subprocess.run")
def test_add_label(mock_run):
    mock_run.return_value = _mock_run()
    add_label(100, "needs-human-review", "owner/repo")
    mock_run.assert_called_once()


@patch("dispatcher.github.subprocess.run")
def test_list_prs(mock_run):
    prs = [{"number": 100, "url": "https://github.com/o/r/pull/100"}]
    mock_run.return_value = _mock_run(stdout=json.dumps(prs))
    result = list_prs("feat/42-test", "owner/repo")
    assert len(result) == 1
    assert result[0]["number"] == 100
```

**Step 2: Implement github.py**

```python
# dispatcher/github.py
from __future__ import annotations

import json
import subprocess


class GithubError(Exception):
    pass


def _run_gh(args: list[str], timeout: int = 30) -> str:
    result = subprocess.run(
        ["gh", *args],
        capture_output=True, text=True, timeout=timeout,
    )
    if result.returncode != 0:
        raise GithubError(result.stderr.strip())
    return result.stdout


def list_issues(label: str, limit: int, repo: str) -> list[dict]:
    out = _run_gh([
        "issue", "list",
        "--label", label,
        "--limit", str(limit),
        "--repo", repo,
        "--json", "number,title,url,labels,createdAt",
    ])
    return json.loads(out) if out.strip() else []


def view_issue(number: int, repo: str) -> dict:
    out = _run_gh([
        "issue", "view", str(number),
        "--repo", repo,
        "--json", "title,body,comments",
    ])
    return json.loads(out)


def list_prs(head_branch: str, repo: str) -> list[dict]:
    out = _run_gh([
        "pr", "list",
        "--head", head_branch,
        "--repo", repo,
        "--json", "number,url",
    ])
    return json.loads(out) if out.strip() else []


def post_comment(issue_number: int, body: str, repo: str) -> None:
    _run_gh([
        "issue", "comment", str(issue_number),
        "--body", body,
        "--repo", repo,
    ])


def add_label(pr_number: int, label: str, repo: str) -> None:
    _run_gh([
        "pr", "edit", str(pr_number),
        "--add-label", label,
        "--repo", repo,
    ])
```

**Step 3: Run tests**

Run: `python -m pytest dispatcher/tests/test_github.py -v`
Expected: All PASS

**Step 4: Commit**

```bash
git add dispatcher/github.py dispatcher/tests/test_github.py
git commit -m "feat(dispatcher): add GitHub CLI wrapper with issue/PR operations"
```

---

### Task 6: Triage — claude -p call + tier matrix validation

**Files:**
- Create: `dispatcher/triage.py`
- Create: `dispatcher/tests/test_triage.py`

**Acceptance Criteria:**
- [ ] `TIER_MATRIX` dict maps (scope, richness >= 3) → tier, matching the design doc matrix
- [ ] `validate_tier(scope, richness_score, model_tier)` returns the matrix tier if model_tier conflicts
- [ ] `triage_issue(issue_data, config)` calls `claude -p` with correct flags and returns `TriageResult`
- [ ] `triage_issue` uses `--max-turns 1`, `--output-format json`, `--json-schema`, `--model` from config
- [ ] Subprocess timeout is 120 seconds for triage calls
- [ ] Invalid JSON from claude -p raises `TriageError`
- [ ] `build_triage_prompt(title, body, comments)` interpolates issue data into the prompt template
- [ ] `pytest dispatcher/tests/test_triage.py -v` passes

**Step 1: Write failing tests**

```python
# dispatcher/tests/test_triage.py
import json
import subprocess
from unittest.mock import patch

import pytest

from dispatcher.models import Config
from dispatcher.triage import TRIAGE_SCHEMA, TriageError, build_triage_prompt, triage_issue, validate_tier


class TestValidateTier:
    def test_quick_fix_low_richness(self):
        assert validate_tier("quick-fix", 1, "parked") == "full-yolo"

    def test_quick_fix_high_richness(self):
        assert validate_tier("quick-fix", 4, "full-yolo") == "full-yolo"

    def test_feature_low_richness(self):
        assert validate_tier("feature", 2, "full-yolo") == "parked"

    def test_feature_high_richness(self):
        assert validate_tier("feature", 3, "parked") == "full-yolo"

    def test_major_feature_high_richness(self):
        assert validate_tier("major-feature", 4, "full-yolo") == "supervised-yolo"

    def test_major_feature_low_richness(self):
        assert validate_tier("major-feature", 1, "supervised-yolo") == "parked"

    def test_model_agrees_no_override(self):
        assert validate_tier("small-enhancement", 2, "full-yolo") == "full-yolo"


class TestBuildTriagePrompt:
    def test_interpolates_fields(self):
        prompt = build_triage_prompt("Fix bug", "The login is broken", ["I can reproduce"])
        assert "Fix bug" in prompt
        assert "The login is broken" in prompt
        assert "I can reproduce" in prompt


class TestTriageIssue:
    @patch("dispatcher.triage.subprocess.run")
    def test_success(self, mock_run):
        triage_json = {
            "scope": "quick-fix", "richness_score": 4,
            "richness_signals": {"acceptance_criteria": True, "resolved_discussion": True, "concrete_examples": True, "structured_content": True},
            "triage_tier": "full-yolo", "confidence": 0.95,
            "risk_flags": [], "missing_info": [], "reasoning": "Simple fix.",
        }
        result_json = {"is_error": False, "result": json.dumps(triage_json), "num_turns": 1, "session_id": "s1"}
        mock_run.return_value = subprocess.CompletedProcess(
            args=[], returncode=0, stdout=json.dumps(result_json),
        )
        issue_data = {"title": "Fix bug", "body": "Broken", "comments": []}
        cfg = Config(plugin_path="/p", repo="o/r")
        tr = triage_issue(issue_data, 42, "https://url", cfg)
        assert tr.triage_tier == "full-yolo"
        assert tr.issue_number == 42

    @patch("dispatcher.triage.subprocess.run")
    def test_invalid_json(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess(
            args=[], returncode=0, stdout="not json",
        )
        issue_data = {"title": "Test", "body": "Body", "comments": []}
        cfg = Config(plugin_path="/p", repo="o/r")
        with pytest.raises(TriageError):
            triage_issue(issue_data, 42, "url", cfg)

    @patch("dispatcher.triage.subprocess.run")
    def test_tier_override(self, mock_run):
        triage_json = {
            "scope": "feature", "richness_score": 1,
            "richness_signals": {"acceptance_criteria": False, "resolved_discussion": False, "concrete_examples": False, "structured_content": False},
            "triage_tier": "full-yolo", "confidence": 0.5,
            "risk_flags": [], "missing_info": ["details"], "reasoning": "Sparse.",
        }
        result_json = {"is_error": False, "result": json.dumps(triage_json), "num_turns": 1, "session_id": "s1"}
        mock_run.return_value = subprocess.CompletedProcess(
            args=[], returncode=0, stdout=json.dumps(result_json),
        )
        issue_data = {"title": "Big feature", "body": "Vague", "comments": []}
        cfg = Config(plugin_path="/p", repo="o/r")
        tr = triage_issue(issue_data, 42, "url", cfg)
        assert tr.triage_tier == "parked"  # Matrix overrides model's full-yolo
```

**Step 2: Implement triage.py**

```python
# dispatcher/triage.py
from __future__ import annotations

import json
import subprocess

from dispatcher.models import Config, TriageResult

TRIAGE_SCHEMA = json.dumps({
    "type": "object",
    "properties": {
        "scope": {"type": "string", "enum": ["quick-fix", "small-enhancement", "feature", "major-feature"]},
        "richness_score": {"type": "integer", "minimum": 0, "maximum": 4},
        "richness_signals": {
            "type": "object",
            "properties": {
                "acceptance_criteria": {"type": "boolean"},
                "resolved_discussion": {"type": "boolean"},
                "concrete_examples": {"type": "boolean"},
                "structured_content": {"type": "boolean"},
            },
            "required": ["acceptance_criteria", "resolved_discussion", "concrete_examples", "structured_content"],
        },
        "triage_tier": {"type": "string", "enum": ["full-yolo", "supervised-yolo", "parked"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "risk_flags": {"type": "array", "items": {"type": "string"}},
        "missing_info": {"type": "array", "items": {"type": "string"}},
        "reasoning": {"type": "string"},
    },
    "required": ["scope", "richness_score", "richness_signals", "triage_tier", "confidence", "risk_flags", "missing_info", "reasoning"],
})

# (scope, richness_high) → tier
_TIER_MATRIX: dict[tuple[str, bool], str] = {
    ("quick-fix", False): "full-yolo",
    ("quick-fix", True): "full-yolo",
    ("small-enhancement", False): "full-yolo",
    ("small-enhancement", True): "full-yolo",
    ("feature", False): "parked",
    ("feature", True): "full-yolo",
    ("major-feature", False): "parked",
    ("major-feature", True): "supervised-yolo",
}


class TriageError(Exception):
    pass


def validate_tier(scope: str, richness_score: int, model_tier: str) -> str:
    key = (scope, richness_score >= 3)
    return _TIER_MATRIX.get(key, model_tier)


def build_triage_prompt(title: str, body: str, comments: list[str]) -> str:
    comments_text = "\n---\n".join(comments) if comments else "(no comments)"
    return f"""Analyze this GitHub issue and classify it for automated processing.

## Issue Title
{title}

## Issue Body
{body}

## Comments
{comments_text}

## Instructions
Classify the issue's scope, assess its richness (how much detail it provides), and determine the appropriate automation tier. Be precise with confidence scores — only high confidence (>0.85) should be assigned to full-yolo.

Richness signals to check:
1. acceptance_criteria: Has clear acceptance criteria or requirements
2. resolved_discussion: Has resolved questions in comments
3. concrete_examples: Has specific examples, mockups, or specs
4. structured_content: Body >200 words with headings/lists/tables

Return a JSON object with: scope, richness_score (0-4), richness_signals, triage_tier, confidence (0-1), risk_flags, missing_info, reasoning."""


def triage_issue(issue_data: dict, issue_number: int, issue_url: str, config: Config) -> TriageResult:
    comments = [c["body"] for c in issue_data.get("comments", [])]
    prompt = build_triage_prompt(issue_data["title"], issue_data["body"] or "", comments)

    try:
        result = subprocess.run(
            [
                "claude", "-p", prompt,
                "--model", config.triage_model,
                "--output-format", "json",
                "--json-schema", TRIAGE_SCHEMA,
                "--max-turns", str(config.triage_max_turns),
            ],
            capture_output=True, text=True, timeout=120,
        )
    except subprocess.TimeoutExpired as exc:
        raise TriageError(f"Triage timed out for issue #{issue_number}") from exc

    try:
        outer = json.loads(result.stdout)
    except (json.JSONDecodeError, TypeError) as exc:
        raise TriageError(f"Invalid JSON from claude -p for issue #{issue_number}: {result.stdout[:200]}") from exc

    if outer.get("is_error"):
        raise TriageError(f"claude -p error for issue #{issue_number}: {outer}")

    try:
        triage_data = json.loads(outer["result"]) if isinstance(outer.get("result"), str) else outer.get("result", outer)
    except (json.JSONDecodeError, TypeError) as exc:
        raise TriageError(f"Invalid triage result JSON for issue #{issue_number}") from exc

    validated_tier = validate_tier(
        triage_data["scope"],
        triage_data["richness_score"],
        triage_data["triage_tier"],
    )

    return TriageResult(
        issue_number=issue_number,
        issue_title=issue_data["title"],
        issue_url=issue_url,
        scope=triage_data["scope"],
        richness_score=triage_data["richness_score"],
        richness_signals=triage_data["richness_signals"],
        triage_tier=validated_tier,
        confidence=triage_data["confidence"],
        risk_flags=triage_data["risk_flags"],
        missing_info=triage_data["missing_info"],
        reasoning=triage_data["reasoning"],
    )
```

**Step 3: Run tests**

Run: `python -m pytest dispatcher/tests/test_triage.py -v`
Expected: All PASS

**Step 4: Commit**

```bash
git add dispatcher/triage.py dispatcher/tests/test_triage.py
git commit -m "feat(dispatcher): add triage module with claude -p call and tier matrix validation"
```

---

### Task 7: Execute — claude -p execution, branch management, resume

**Files:**
- Create: `dispatcher/execute.py`
- Create: `dispatcher/tests/test_execute.py`

**Acceptance Criteria:**
- [ ] `create_branch(issue_number, scope, config)` creates a branch named `{prefix}/{number}-{slug}` from base_branch
- [ ] `create_branch` handles existing branch by checking out or adding `-2` suffix
- [ ] `execute_issue(reviewed, config)` calls `claude -p` with Opus, `--plugin-dir`, `--max-turns`, `--output-format json`, `--allowedTools`
- [ ] `execute_issue` parses JSON output for `is_error`, `num_turns`, `session_id`
- [ ] `execute_issue` calls `github.list_prs` to verify PR creation
- [ ] `execute_issue` calls `github.add_label` for supervised-yolo PRs
- [ ] `resume_issue(issue_row, config)` calls `claude -p --resume SESSION_ID`
- [ ] `stash_if_dirty()` stashes and returns True if working tree was dirty
- [ ] `unstash()` pops the stash
- [ ] `generate_parked_comment(triage)` produces the markdown template from design doc
- [ ] `pytest dispatcher/tests/test_execute.py -v` passes

**Step 1: Write failing tests**

```python
# dispatcher/tests/test_execute.py
import json
import subprocess
from unittest.mock import MagicMock, call, patch

import pytest

from dispatcher.execute import (
    create_branch,
    execute_issue,
    generate_parked_comment,
    stash_if_dirty,
    unstash,
)
from dispatcher.models import Config, ReviewedIssue, TriageResult


def _cfg(**kw) -> Config:
    defaults = {"plugin_path": "/p", "repo": "o/r", "base_branch": "main"}
    defaults.update(kw)
    return Config(**defaults)


def _triage(number: int = 42, tier: str = "full-yolo", scope: str = "quick-fix") -> TriageResult:
    return TriageResult(
        issue_number=number, issue_title=f"Issue {number}", issue_url="url",
        scope=scope, richness_score=4, richness_signals={},
        triage_tier=tier, confidence=0.95, risk_flags=[], missing_info=[], reasoning="ok",
    )


class TestCreateBranch:
    @patch("dispatcher.execute.subprocess.run")
    def test_creates_branch(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        name = create_branch(42, "quick-fix", _cfg())
        assert name == "fix/42-issue-42"
        mock_run.assert_called()

    @patch("dispatcher.execute.subprocess.run")
    def test_feat_prefix_for_feature(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        name = create_branch(42, "feature", _cfg())
        assert name.startswith("feat/")


class TestStash:
    @patch("dispatcher.execute.subprocess.run")
    def test_stash_dirty(self, mock_run):
        mock_run.side_effect = [
            subprocess.CompletedProcess([], 0, "M file.py\n", ""),  # status --porcelain
            subprocess.CompletedProcess([], 0, "", ""),  # stash push
        ]
        assert stash_if_dirty() is True

    @patch("dispatcher.execute.subprocess.run")
    def test_stash_clean(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        assert stash_if_dirty() is False


class TestExecuteIssue:
    @patch("dispatcher.execute.github")
    @patch("dispatcher.execute.subprocess.run")
    def test_success_pr_created(self, mock_run, mock_gh):
        result_json = {"is_error": False, "num_turns": 15, "session_id": "s1"}
        mock_run.return_value = subprocess.CompletedProcess([], 0, json.dumps(result_json), "")
        mock_gh.list_prs.return_value = [{"number": 100, "url": "https://pr/100"}]
        mock_gh.add_label = MagicMock()

        ri = ReviewedIssue(triage=_triage(), final_tier="full-yolo", skipped=False, edited_comment=None)
        er = execute_issue(ri, "fix/42-test", _cfg())
        assert er.outcome == "pr_created"
        assert er.pr_number == 100

    @patch("dispatcher.execute.github")
    @patch("dispatcher.execute.subprocess.run")
    def test_supervised_yolo_label(self, mock_run, mock_gh):
        result_json = {"is_error": False, "num_turns": 15, "session_id": "s1"}
        mock_run.return_value = subprocess.CompletedProcess([], 0, json.dumps(result_json), "")
        mock_gh.list_prs.return_value = [{"number": 100, "url": "https://pr/100"}]

        ri = ReviewedIssue(triage=_triage(), final_tier="supervised-yolo", skipped=False, edited_comment=None)
        er = execute_issue(ri, "fix/42-test", _cfg())
        assert er.outcome == "pr_created_review"
        mock_gh.add_label.assert_called_once_with(100, "needs-human-review", "o/r")

    @patch("dispatcher.execute.github")
    @patch("dispatcher.execute.subprocess.run")
    def test_leash_hit(self, mock_run, mock_gh):
        result_json = {"is_error": False, "num_turns": 200, "session_id": "s1"}
        mock_run.return_value = subprocess.CompletedProcess([], 0, json.dumps(result_json), "")
        mock_gh.list_prs.return_value = []

        ri = ReviewedIssue(triage=_triage(), final_tier="full-yolo", skipped=False, edited_comment=None)
        er = execute_issue(ri, "fix/42-test", _cfg(execution_max_turns=200))
        assert er.outcome == "leash_hit"


class TestGenerateParkedComment:
    def test_template(self):
        tr = _triage(tier="parked")
        tr = TriageResult(
            issue_number=42, issue_title="Test", issue_url="url",
            scope="feature", richness_score=1, richness_signals={},
            triage_tier="parked", confidence=0.3,
            risk_flags=[], missing_info=["acceptance criteria", "example input"],
            reasoning="Issue is too vague to implement.",
        )
        comment = generate_parked_comment(tr)
        assert "Clarification Needed" in comment
        assert "acceptance criteria" in comment
        assert "example input" in comment
        assert "too vague" in comment
```

**Step 2: Implement execute.py**

```python
# dispatcher/execute.py
from __future__ import annotations

import json
import re
import subprocess

from dispatcher import github
from dispatcher.models import Config, ExecutionResult, ReviewedIssue, TriageResult

_ALLOWED_TOOLS = "Skill,Read,Write,Edit,Bash,Glob,Grep,WebFetch,WebSearch,Task,ToolSearch,AskUserQuestion,EnterPlanMode,ExitPlanMode,TaskCreate,TaskGet,TaskUpdate,TaskList"


def _slugify(text: str, max_len: int = 40) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len].rstrip("-")


def create_branch(issue_number: int, scope: str, config: Config) -> str:
    prefix = config.branch_prefix_fix if scope in ("quick-fix",) else config.branch_prefix_feat
    slug = _slugify(f"issue-{issue_number}")
    branch_name = f"{prefix}/{issue_number}-{slug}"

    try:
        subprocess.run(
            ["git", "checkout", "-b", branch_name, config.base_branch],
            capture_output=True, text=True, timeout=30, check=True,
        )
    except subprocess.CalledProcessError:
        # Branch exists — try checkout, or add suffix
        try:
            subprocess.run(
                ["git", "checkout", branch_name],
                capture_output=True, text=True, timeout=30, check=True,
            )
        except subprocess.CalledProcessError:
            branch_name = f"{branch_name}-2"
            subprocess.run(
                ["git", "checkout", "-b", branch_name, config.base_branch],
                capture_output=True, text=True, timeout=30, check=True,
            )

    return branch_name


def stash_if_dirty() -> bool:
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        capture_output=True, text=True, timeout=30,
    )
    if result.stdout.strip():
        subprocess.run(
            ["git", "stash", "push", "-m", "dispatcher-auto-stash"],
            capture_output=True, text=True, timeout=30,
        )
        return True
    return False


def unstash() -> None:
    subprocess.run(
        ["git", "stash", "pop"],
        capture_output=True, text=True, timeout=30,
    )


def execute_issue(reviewed: ReviewedIssue, branch_name: str, config: Config) -> ExecutionResult:
    tr = reviewed.triage
    prompt = f"Start a feature for GitHub issue #{tr.issue_number} in YOLO mode. Issue title: {tr.issue_title}. Work on branch {branch_name}."

    try:
        result = subprocess.run(
            [
                "claude", "--plugin-dir", config.plugin_path,
                "-p", prompt,
                "--model", config.execution_model,
                "--allowedTools", _ALLOWED_TOOLS,
                "--max-turns", str(config.execution_max_turns),
                "--output-format", "json",
            ],
            capture_output=True, text=True,
            # No hard timeout for execution — can take 30-60 min
        )
    except Exception as exc:
        return ExecutionResult(
            issue_number=tr.issue_number, branch_name=branch_name,
            session_id=None, num_turns=0, is_error=True,
            pr_number=None, pr_url=None, error_message=str(exc), outcome="failed",
        )

    try:
        outer = json.loads(result.stdout)
    except (json.JSONDecodeError, TypeError):
        return ExecutionResult(
            issue_number=tr.issue_number, branch_name=branch_name,
            session_id=None, num_turns=0, is_error=True,
            pr_number=None, pr_url=None,
            error_message=f"Invalid JSON: {result.stdout[:200]}", outcome="failed",
        )

    is_error = outer.get("is_error", False)
    num_turns = outer.get("num_turns", 0)
    session_id = outer.get("session_id")

    if is_error:
        return ExecutionResult(
            issue_number=tr.issue_number, branch_name=branch_name,
            session_id=session_id, num_turns=num_turns, is_error=True,
            pr_number=None, pr_url=None, error_message="claude -p reported error",
            outcome="failed",
        )

    # Check for PR
    pr_number = None
    pr_url = None
    try:
        prs = github.list_prs(branch_name, config.repo)
        if prs:
            pr_number = prs[0]["number"]
            pr_url = prs[0]["url"]
    except Exception:
        pass  # PR verification is non-fatal

    # Determine outcome
    if pr_number:
        if reviewed.final_tier == "supervised-yolo":
            try:
                github.add_label(pr_number, "needs-human-review", config.repo)
            except Exception:
                pass  # Label is non-fatal
            outcome = "pr_created_review"
        else:
            outcome = "pr_created"
    elif num_turns >= config.execution_max_turns:
        outcome = "leash_hit"
    else:
        outcome = "failed"

    return ExecutionResult(
        issue_number=tr.issue_number, branch_name=branch_name,
        session_id=session_id, num_turns=num_turns, is_error=False,
        pr_number=pr_number, pr_url=pr_url, error_message=None, outcome=outcome,
    )


def resume_issue(session_id: str, config: Config) -> dict:
    result = subprocess.run(
        [
            "claude", "--plugin-dir", config.plugin_path,
            "-p", "--resume", session_id,
            "--model", config.execution_model,
            "--output-format", "json",
        ],
        capture_output=True, text=True,
    )
    try:
        return json.loads(result.stdout)
    except (json.JSONDecodeError, TypeError):
        return {"is_error": True, "error": result.stdout[:200]}


def generate_parked_comment(triage: TriageResult) -> str:
    missing_items = "\n".join(f"- [ ] {item}" for item in triage.missing_info) if triage.missing_info else "- [ ] Additional details needed"

    return f"""## Automated Triage — Clarification Needed

This issue was reviewed for automated processing but needs more detail before work can begin.

### What's Missing

{missing_items}

### What Would Help

{triage.reasoning}

---

*Once the above information is added, this issue will be re-evaluated on the next dispatcher run.*
*Posted by [feature-flow dispatcher](https://github.com/uta2000/feature-flow)*"""
```

**Step 3: Run tests**

Run: `python -m pytest dispatcher/tests/test_execute.py -v`
Expected: All PASS

**Step 4: Commit**

```bash
git add dispatcher/execute.py dispatcher/tests/test_execute.py
git commit -m "feat(dispatcher): add execution module with branch management and resume"
```

---

### Task 8: CLI — argparse argument parsing

**Files:**
- Create: `dispatcher/cli.py`
- Create: `dispatcher/tests/test_cli.py`

**Acceptance Criteria:**
- [ ] `build_parser()` returns an `ArgumentParser` with all 9 arguments from design doc
- [ ] `main()` parses args, calls `load_config`, then calls `pipeline.run`
- [ ] `--issues` accepts comma-separated string
- [ ] `--auto`, `--dry-run`, `--verbose` are boolean flags (store_true)
- [ ] `--resume` accepts a string (run ID)
- [ ] `--limit` accepts an integer
- [ ] `pytest dispatcher/tests/test_cli.py -v` passes

**Step 1: Write failing tests**

```python
# dispatcher/tests/test_cli.py
from dispatcher.cli import build_parser


def test_parser_defaults():
    parser = build_parser()
    args = parser.parse_args([])
    assert args.issues is None
    assert args.label is None
    assert args.repo is None
    assert args.auto is False
    assert args.config == "dispatcher.yml"
    assert args.dry_run is False
    assert args.resume is None
    assert args.limit is None
    assert args.verbose is False


def test_parser_all_args():
    parser = build_parser()
    args = parser.parse_args([
        "--issues", "42,43",
        "--label", "custom",
        "--repo", "owner/repo",
        "--auto",
        "--config", "custom.yml",
        "--dry-run",
        "--resume", "run-123",
        "--limit", "10",
        "--verbose",
    ])
    assert args.issues == "42,43"
    assert args.label == "custom"
    assert args.repo == "owner/repo"
    assert args.auto is True
    assert args.config == "custom.yml"
    assert args.dry_run is True
    assert args.resume == "run-123"
    assert args.limit == 10
    assert args.verbose is True
```

**Step 2: Implement cli.py**

```python
# dispatcher/cli.py
from __future__ import annotations

import argparse
import sys


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="dispatcher",
        description="Batch-process GitHub issues through feature-flow YOLO mode",
    )
    parser.add_argument("--issues", type=str, default=None, help="Comma-separated issue numbers (skips selection TUI)")
    parser.add_argument("--label", type=str, default=None, help="Label filter for selection")
    parser.add_argument("--repo", type=str, default=None, help="GitHub repo owner/repo")
    parser.add_argument("--auto", action="store_true", help="Skip all TUIs")
    parser.add_argument("--config", type=str, default="dispatcher.yml", help="Config file path")
    parser.add_argument("--dry-run", action="store_true", help="Triage + TUIs only, no execution")
    parser.add_argument("--resume", type=str, default=None, help="Resume a previous run by run ID")
    parser.add_argument("--limit", type=int, default=None, help="Max issues in selection TUI")
    parser.add_argument("--verbose", action="store_true", help="Print full claude -p output")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    from dispatcher.config import load_config
    from dispatcher.pipeline import run

    config = load_config(args)
    exit_code = run(config)
    sys.exit(exit_code)
```

**Step 3: Update __main__.py**

Already created in Task 1 — verify it imports `cli.main`.

**Step 4: Run tests**

Run: `python -m pytest dispatcher/tests/test_cli.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add dispatcher/cli.py dispatcher/tests/test_cli.py
git commit -m "feat(dispatcher): add CLI argument parser with all 9 flags"
```

---

### Task 9: Selection TUI — Textual SelectionList

**Files:**
- Create: `dispatcher/tui/selection.py`
- Create: `dispatcher/tests/test_tui/test_selection.py`

**Acceptance Criteria:**
- [ ] `SelectionApp` takes a list of issue dicts and optional `parked_numbers` set
- [ ] Each item shows `#{number} {title}` with `↻ parked` suffix for previously-parked issues
- [ ] Space toggles selection, Enter confirms, `a` selects all, `q` quits with exit code 0
- [ ] App returns list of selected issue numbers via `app.selected`
- [ ] Empty issue list shows "No open issues with label X found." and exits
- [ ] `pytest dispatcher/tests/test_tui/test_selection.py -v` passes (using Textual `run_test`)

**Step 1: Write failing tests**

```python
# dispatcher/tests/test_tui/test_selection.py
import pytest

from dispatcher.tui.selection import SelectionApp


@pytest.mark.asyncio
async def test_selection_app_renders():
    issues = [
        {"number": 42, "title": "Fix bug", "url": "u", "labels": [{"name": "bug"}], "createdAt": "2026-01-01"},
        {"number": 43, "title": "Add feature", "url": "u", "labels": [], "createdAt": "2026-01-02"},
    ]
    app = SelectionApp(issues=issues, parked_numbers=set(), label="test")
    async with app.run_test() as pilot:
        # App should render without error
        assert app.is_running


@pytest.mark.asyncio
async def test_selection_empty_issues():
    app = SelectionApp(issues=[], parked_numbers=set(), label="test")
    async with app.run_test() as pilot:
        # Should show empty message and exit
        pass  # App exits on its own


@pytest.mark.asyncio
async def test_selection_parked_indicator():
    issues = [
        {"number": 42, "title": "Fix bug", "url": "u", "labels": [], "createdAt": "2026-01-01"},
    ]
    app = SelectionApp(issues=issues, parked_numbers={42}, label="test")
    async with app.run_test() as pilot:
        assert app.is_running


@pytest.mark.asyncio
async def test_selection_quit():
    issues = [
        {"number": 42, "title": "Fix bug", "url": "u", "labels": [], "createdAt": "2026-01-01"},
    ]
    app = SelectionApp(issues=issues, parked_numbers=set(), label="test")
    async with app.run_test() as pilot:
        await pilot.press("q")
    assert app.selected == []
```

**Step 2: Implement selection.py**

```python
# dispatcher/tui/selection.py
from __future__ import annotations

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.widgets import Footer, Header, SelectionList, Static


class SelectionApp(App[list[int]]):
    TITLE = "Issue Dispatcher — Select Issues"
    BINDINGS = [
        Binding("enter", "confirm", "Confirm"),
        Binding("a", "select_all", "Select All"),
        Binding("q", "quit_app", "Quit"),
    ]

    def __init__(self, issues: list[dict], parked_numbers: set[int], label: str) -> None:
        super().__init__()
        self._issues = issues
        self._parked = parked_numbers
        self._label = label
        self.selected: list[int] = []

    def compose(self) -> ComposeResult:
        yield Header()
        if not self._issues:
            yield Static(f"No open issues with label '{self._label}' found.")
        else:
            items = []
            for issue in self._issues:
                number = issue["number"]
                title = issue["title"]
                parked_mark = " ↻ parked" if number in self._parked else ""
                label = f"#{number} {title}{parked_mark}"
                items.append((label, number))
            yield SelectionList(*items)
        yield Footer()

    def on_mount(self) -> None:
        if not self._issues:
            self.set_timer(0.1, self.action_quit_app)

    def action_confirm(self) -> None:
        sl = self.query_one(SelectionList)
        self.selected = list(sl.selected)
        self.exit(self.selected)

    def action_select_all(self) -> None:
        sl = self.query_one(SelectionList)
        sl.select_all()

    def action_quit_app(self) -> None:
        self.selected = []
        self.exit([])
```

**Step 3: Run tests**

Run: `python -m pytest dispatcher/tests/test_tui/test_selection.py -v`
Expected: All PASS

**Step 4: Commit**

```bash
git add dispatcher/tui/selection.py dispatcher/tests/test_tui/test_selection.py
git commit -m "feat(dispatcher): add Selection TUI with SelectionList widget"
```

---

### Task 10: Review TUI — Textual DataTable with detail panel

**Files:**
- Create: `dispatcher/tui/review.py`
- Create: `dispatcher/tests/test_tui/test_review.py`

**Acceptance Criteria:**
- [ ] `ReviewApp` takes a list of `TriageResult` and displays them in a `DataTable`
- [ ] DataTable columns: #, Issue, Tier, Confidence, Flags
- [ ] `t` cycles tier (full-yolo → supervised-yolo → parked → full-yolo)
- [ ] `s` toggles skip on current row
- [ ] `a` approves all and triggers execute confirmation
- [ ] `x` executes with current approvals
- [ ] `q` quits and cancels the run
- [ ] Enter toggles a detail panel with full triage information
- [ ] App returns list of `ReviewedIssue` via `app.reviewed`
- [ ] `pytest dispatcher/tests/test_tui/test_review.py -v` passes

**Step 1: Write failing tests**

```python
# dispatcher/tests/test_tui/test_review.py
import pytest

from dispatcher.models import TriageResult
from dispatcher.tui.review import ReviewApp


def _triage(number: int = 42, tier: str = "full-yolo") -> TriageResult:
    return TriageResult(
        issue_number=number, issue_title=f"Issue {number}", issue_url="url",
        scope="quick-fix", richness_score=4, richness_signals={},
        triage_tier=tier, confidence=0.95, risk_flags=["none"], missing_info=[], reasoning="ok",
    )


@pytest.mark.asyncio
async def test_review_app_renders():
    results = [_triage(42), _triage(43, "parked")]
    app = ReviewApp(triage_results=results)
    async with app.run_test() as pilot:
        assert app.is_running


@pytest.mark.asyncio
async def test_review_quit():
    results = [_triage(42)]
    app = ReviewApp(triage_results=results)
    async with app.run_test() as pilot:
        await pilot.press("q")
    assert app.reviewed == []


@pytest.mark.asyncio
async def test_review_execute():
    results = [_triage(42)]
    app = ReviewApp(triage_results=results)
    async with app.run_test() as pilot:
        await pilot.press("x")
    assert len(app.reviewed) == 1
    assert app.reviewed[0].final_tier == "full-yolo"
```

**Step 2: Implement review.py**

```python
# dispatcher/tui/review.py
from __future__ import annotations

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.widgets import DataTable, Footer, Header, Static

from dispatcher.models import ReviewedIssue, TriageResult

_TIER_CYCLE = ["full-yolo", "supervised-yolo", "parked"]


class ReviewApp(App[list[ReviewedIssue]]):
    TITLE = "Issue Dispatcher — Review Triage"
    BINDINGS = [
        Binding("t", "cycle_tier", "Cycle Tier"),
        Binding("s", "skip_issue", "Skip"),
        Binding("a", "approve_all", "Approve All"),
        Binding("x", "execute", "Execute"),
        Binding("q", "quit_app", "Quit"),
        Binding("enter", "toggle_detail", "Detail"),
    ]

    def __init__(self, triage_results: list[TriageResult]) -> None:
        super().__init__()
        self._results = triage_results
        self._tiers: dict[int, str] = {tr.issue_number: tr.triage_tier for tr in triage_results}
        self._skipped: set[int] = set()
        self._comments: dict[int, str | None] = {}
        self.reviewed: list[ReviewedIssue] = []

    def compose(self) -> ComposeResult:
        yield Header()
        table = DataTable()
        table.add_columns("#", "Issue", "Tier", "Confidence", "Flags")
        for tr in self._results:
            flags = ", ".join(tr.risk_flags) if tr.risk_flags else "—"
            table.add_row(
                str(tr.issue_number), tr.issue_title,
                tr.triage_tier, f"{tr.confidence:.2f}", flags,
                key=str(tr.issue_number),
            )
        yield table
        yield Static("", id="detail-panel")
        yield Footer()

    def _current_issue_number(self) -> int | None:
        table = self.query_one(DataTable)
        if table.cursor_row is not None and table.cursor_row < len(self._results):
            return self._results[table.cursor_row].issue_number
        return None

    def action_cycle_tier(self) -> None:
        num = self._current_issue_number()
        if num is None:
            return
        current = self._tiers[num]
        idx = _TIER_CYCLE.index(current) if current in _TIER_CYCLE else 0
        self._tiers[num] = _TIER_CYCLE[(idx + 1) % len(_TIER_CYCLE)]
        # Update table cell
        table = self.query_one(DataTable)
        row_key = str(num)
        table.update_cell(row_key, "Tier", self._tiers[num])

    def action_skip_issue(self) -> None:
        num = self._current_issue_number()
        if num is None:
            return
        if num in self._skipped:
            self._skipped.discard(num)
        else:
            self._skipped.add(num)

    def action_approve_all(self) -> None:
        self._skipped.clear()
        self.action_execute()

    def action_execute(self) -> None:
        self.reviewed = []
        for tr in self._results:
            self.reviewed.append(ReviewedIssue(
                triage=tr,
                final_tier=self._tiers[tr.issue_number],
                skipped=tr.issue_number in self._skipped,
                edited_comment=self._comments.get(tr.issue_number),
            ))
        self.exit(self.reviewed)

    def action_quit_app(self) -> None:
        self.reviewed = []
        self.exit([])

    def action_toggle_detail(self) -> None:
        num = self._current_issue_number()
        if num is None:
            return
        panel = self.query_one("#detail-panel", Static)
        tr = next((t for t in self._results if t.issue_number == num), None)
        if tr is None:
            return
        if panel.renderable:
            panel.update("")
        else:
            detail = (
                f"Issue #{tr.issue_number}: {tr.issue_title}\n"
                f"Scope: {tr.scope} | Richness: {tr.richness_score}/4\n"
                f"Tier: {self._tiers[num]} | Confidence: {tr.confidence:.2f}\n"
                f"Risk Flags: {', '.join(tr.risk_flags) or 'none'}\n"
                f"Missing: {', '.join(tr.missing_info) or 'none'}\n\n"
                f"Reasoning: {tr.reasoning}"
            )
            panel.update(detail)
```

**Step 3: Run tests**

Run: `python -m pytest dispatcher/tests/test_tui/test_review.py -v`
Expected: All PASS

**Step 4: Commit**

```bash
git add dispatcher/tui/review.py dispatcher/tests/test_tui/test_review.py
git commit -m "feat(dispatcher): add Review TUI with DataTable and tier cycling"
```

---

### Task 11: Pipeline — orchestrate the 5 stages

**Files:**
- Create: `dispatcher/pipeline.py`
- Create: `dispatcher/tests/test_pipeline.py`

**Acceptance Criteria:**
- [ ] `run(config)` returns exit code 0 on success, 1 on partial failure, 2 on config error, 3 if all parked
- [ ] Stage 1 (Selection): calls `github.list_issues` + SelectionApp (or skips with `--issues`/`--auto`)
- [ ] Stage 2 (Triage): calls `triage.triage_issue` for each selected issue, inserts into DB
- [ ] Stage 3 (Review): runs ReviewApp (or skips with `--auto`)
- [ ] Stage 4 (Execution): calls `execute.execute_issue` for each non-skipped, non-parked issue (or skips with `--dry-run`)
- [ ] Stage 5 (Logging): updates DB, prints summary with PR count, parked count, duration, turns
- [ ] Parked issues get comments posted after all executions complete
- [ ] Resume mode re-executes failed/leash-hit issues from a previous run
- [ ] DB writes happen at stage boundaries (after triage, after execution)
- [ ] `pytest dispatcher/tests/test_pipeline.py -v` passes

**Step 1: Write failing tests**

```python
# dispatcher/tests/test_pipeline.py
import json
from unittest.mock import MagicMock, AsyncMock, patch

import pytest

from dispatcher.models import Config, ExecutionResult, ReviewedIssue, TriageResult
from dispatcher.pipeline import run


def _cfg(**kw) -> Config:
    defaults = {"plugin_path": "/p", "repo": "o/r", "base_branch": "main", "issues": [42], "auto": True, "dry_run": True}
    defaults.update(kw)
    return Config(**defaults)


def _triage(number: int = 42) -> TriageResult:
    return TriageResult(
        issue_number=number, issue_title=f"Issue {number}", issue_url="url",
        scope="quick-fix", richness_score=4, richness_signals={},
        triage_tier="full-yolo", confidence=0.95, risk_flags=[], missing_info=[], reasoning="ok",
    )


@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
def test_dry_run_no_execution(mock_triage, mock_gh, mock_db):
    mock_db.init_db.return_value = MagicMock()
    mock_gh.view_issue.return_value = {"title": "Test", "body": "Body", "comments": []}
    mock_triage.return_value = _triage()

    code = run(_cfg(issues=[42], auto=True, dry_run=True))
    assert code == 0


@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
def test_all_parked_exit_3(mock_triage, mock_gh, mock_db):
    mock_db.init_db.return_value = MagicMock()
    mock_gh.view_issue.return_value = {"title": "Test", "body": "Body", "comments": []}
    tr = TriageResult(
        issue_number=42, issue_title="Test", issue_url="url",
        scope="feature", richness_score=0, richness_signals={},
        triage_tier="parked", confidence=0.3, risk_flags=[], missing_info=["detail"], reasoning="vague",
    )
    mock_triage.return_value = tr

    code = run(_cfg(issues=[42], auto=True, dry_run=False))
    assert code == 3
```

**Step 2: Implement pipeline.py**

```python
# dispatcher/pipeline.py
from __future__ import annotations

import time
import uuid

from dispatcher import db, github
from dispatcher.execute import (
    create_branch,
    execute_issue,
    generate_parked_comment,
    stash_if_dirty,
    unstash,
)
from dispatcher.models import Config, ReviewedIssue
from dispatcher.triage import TriageError, triage_issue


def run(config: Config) -> int:
    start_time = time.time()
    conn = db.init_db(config.db_path)
    run_id = str(uuid.uuid4())

    # Stage 1: Selection
    if config.issues:
        selected_numbers = config.issues
    elif config.auto:
        issues = github.list_issues(config.default_label, config.selection_limit, config.repo)
        selected_numbers = [i["number"] for i in issues]
    else:
        issues = github.list_issues(config.default_label, config.selection_limit, config.repo)
        # Get parked numbers from DB
        parked_numbers = set()
        for issue in issues:
            prev = db.get_previous_triage(conn, issue["number"])
            if prev and prev["triage_tier"] == "parked":
                parked_numbers.add(issue["number"])

        from dispatcher.tui.selection import SelectionApp

        app = SelectionApp(issues=issues, parked_numbers=parked_numbers, label=config.default_label)
        selected_numbers = app.run()
        if not selected_numbers:
            return 0

    if not selected_numbers:
        print("No issues selected.")
        return 0

    db.insert_run(conn, run_id, selected_numbers, "{}")

    # Stage 2: Triage
    triage_results = []
    for number in selected_numbers:
        try:
            issue_data = github.view_issue(number, config.repo)
        except github.GithubError as exc:
            print(f"  Error fetching #{number}: {exc}. Skipping.")
            continue

        try:
            tr = triage_issue(issue_data, number, f"https://github.com/{config.repo}/issues/{number}", config)
        except TriageError as exc:
            print(f"  Triage error for #{number}: {exc}. Skipping.")
            continue

        triage_results.append(tr)
        db.insert_issue(conn, run_id, tr)
        print(f"  #{number}: {tr.issue_title} → {tr.triage_tier} ({tr.confidence:.2f})")

    if not triage_results:
        db.update_run_status(conn, run_id, "failed")
        return 1

    # Sort by confidence descending
    triage_results.sort(key=lambda t: t.confidence, reverse=True)

    # Stage 3: Review
    if config.auto:
        reviewed = [
            ReviewedIssue(triage=tr, final_tier=tr.triage_tier, skipped=False, edited_comment=None)
            for tr in triage_results
        ]
    else:
        from dispatcher.tui.review import ReviewApp

        app = ReviewApp(triage_results=triage_results)
        reviewed = app.run()
        if not reviewed:
            db.update_run_status(conn, run_id, "cancelled")
            return 0

    # Separate parked from executable
    to_execute = [r for r in reviewed if not r.skipped and r.final_tier != "parked"]
    parked = [r for r in reviewed if r.final_tier == "parked" and not r.skipped]

    if not to_execute and not config.dry_run:
        # Post parked comments
        for r in parked:
            comment = r.edited_comment or generate_parked_comment(r.triage)
            try:
                github.post_comment(r.triage.issue_number, comment, config.repo)
            except Exception as exc:
                print(f"  Warning: Failed to post comment on #{r.triage.issue_number}: {exc}")
        db.update_run_status(conn, run_id, "completed")
        return 3

    if config.dry_run:
        print("\nDry run — skipping execution.")
        db.update_run_status(conn, run_id, "completed")
        return 0

    # Stage 4: Execution
    stashed = stash_if_dirty()
    results = []
    total_turns = 0

    for r in to_execute:
        print(f"\n  [#{r.triage.issue_number}] Executing...")
        try:
            branch = create_branch(r.triage.issue_number, r.triage.scope, config)
        except Exception as exc:
            print(f"  Branch creation failed for #{r.triage.issue_number}: {exc}")
            continue

        er = execute_issue(r, branch, config)
        db.update_issue_execution(conn, run_id, r.triage.issue_number, er)
        results.append(er)
        total_turns += er.num_turns

        if er.outcome in ("pr_created", "pr_created_review"):
            print(f"  [#{r.triage.issue_number}] {branch} → PR #{er.pr_number} created")
        elif er.outcome == "leash_hit":
            print(f"  [#{r.triage.issue_number}] Hit turn limit ({er.num_turns} turns). Use --resume to continue.")
        else:
            print(f"  [#{r.triage.issue_number}] Failed: {er.error_message}")

    # Post parked comments after all executions
    for r in parked:
        comment = r.edited_comment or generate_parked_comment(r.triage)
        try:
            github.post_comment(r.triage.issue_number, comment, config.repo)
        except Exception as exc:
            print(f"  Warning: Failed to post comment on #{r.triage.issue_number}: {exc}")

    if stashed:
        unstash()

    # Stage 5: Summary
    duration = time.time() - start_time
    pr_count = sum(1 for er in results if er.outcome in ("pr_created", "pr_created_review"))
    failed_count = sum(1 for er in results if er.outcome in ("failed", "leash_hit"))
    budget = len(to_execute) * config.execution_max_turns

    status = "completed" if failed_count == 0 else "failed"
    db.update_run_status(conn, run_id, status)

    print(f"\nRun complete. {pr_count} PRs created, {len(parked)} parked. Duration: {duration / 60:.0f}m. Turns used: {total_turns}/{budget}")

    return 0 if failed_count == 0 else 1
```

**Step 3: Run tests**

Run: `python -m pytest dispatcher/tests/test_pipeline.py -v`
Expected: All PASS

**Step 4: Commit**

```bash
git add dispatcher/pipeline.py dispatcher/tests/test_pipeline.py
git commit -m "feat(dispatcher): add pipeline orchestrator with 5-stage flow"
```

---

### Task 12: Resume recovery

**Files:**
- Modify: `dispatcher/pipeline.py`
- Modify: `dispatcher/tests/test_pipeline.py`

**Acceptance Criteria:**
- [ ] When `config.resume` is set, pipeline skips stages 1-3 and goes straight to re-execution
- [ ] Resume validates: DB exists (exit 2), run ID exists (exit 2)
- [ ] Resume re-executes only `failed` and `leash_hit` issues
- [ ] Issues with `session_id` use `claude -p --resume SESSION_ID`
- [ ] Issues without `session_id` are re-triaged from scratch
- [ ] Max 2 resume attempts per issue (tracked via `resume_count`)
- [ ] `pytest dispatcher/tests/test_pipeline.py -v` passes with resume tests

**Step 1: Write failing tests for resume**

```python
# Append to dispatcher/tests/test_pipeline.py

@patch("dispatcher.pipeline.db")
def test_resume_missing_db(mock_db):
    mock_db.init_db.side_effect = Exception("no db")
    code = run(_cfg(resume="run-1", auto=True, dry_run=False, issues=[]))
    assert code == 2


@patch("dispatcher.pipeline.db")
def test_resume_missing_run(mock_db):
    mock_conn = MagicMock()
    mock_db.init_db.return_value = mock_conn
    mock_db.get_resumable_issues.return_value = []
    mock_conn.execute.return_value.fetchone.return_value = None
    code = run(_cfg(resume="nonexistent", auto=True, dry_run=False, issues=[]))
    assert code == 2
```

**Step 2: Add resume logic to pipeline.py**

Add a `_resume_run` function that handles the resume path:
- Validate DB and run ID exist
- Fetch resumable issues
- Re-execute with `--resume` if `session_id` exists, else re-triage
- Track `resume_count`

**Step 3: Run tests**

Run: `python -m pytest dispatcher/tests/test_pipeline.py -v`
Expected: All PASS

**Step 4: Commit**

```bash
git add dispatcher/pipeline.py dispatcher/tests/test_pipeline.py
git commit -m "feat(dispatcher): add resume recovery for failed and leash-hit issues"
```

---

### Task 13: Integration test — full pipeline dry run

**Files:**
- Create: `dispatcher/tests/test_integration.py`

**Acceptance Criteria:**
- [ ] Test runs `python -m dispatcher --issues 42 --auto --dry-run --config <tmp>` with all subprocess calls mocked
- [ ] Verifies the full pipeline flow: triage → auto-review → dry-run exit
- [ ] Verifies SQLite database is populated correctly after the run
- [ ] Verifies exit code 0 for successful dry run
- [ ] `pytest dispatcher/tests/test_integration.py -v` passes

**Step 1: Write integration test**

```python
# dispatcher/tests/test_integration.py
import json
import sqlite3
from pathlib import Path
from unittest.mock import patch

import pytest

from dispatcher.config import load_config
from dispatcher.pipeline import run


def _mock_gh_view(number, repo):
    return {"title": f"Issue {number}", "body": "Fix the bug", "comments": [{"body": "I can reproduce"}]}


def _mock_triage_subprocess(*args, **kwargs):
    import subprocess
    triage_json = {
        "scope": "quick-fix", "richness_score": 4,
        "richness_signals": {"acceptance_criteria": True, "resolved_discussion": True, "concrete_examples": True, "structured_content": True},
        "triage_tier": "full-yolo", "confidence": 0.95,
        "risk_flags": [], "missing_info": [], "reasoning": "Clear fix.",
    }
    return subprocess.CompletedProcess(
        args=[], returncode=0,
        stdout=json.dumps({"is_error": False, "result": json.dumps(triage_json), "num_turns": 1, "session_id": "s1"}),
    )


@patch("dispatcher.pipeline.github")
@patch("dispatcher.triage.subprocess.run", side_effect=_mock_triage_subprocess)
def test_full_dry_run(mock_sub, mock_gh, tmp_path):
    mock_gh.view_issue.side_effect = _mock_gh_view

    cfg_file = tmp_path / "dispatcher.yml"
    cfg_file.write_text("plugin_path: /test/path\n")
    db_path = str(tmp_path / "test.db")

    import argparse
    args = argparse.Namespace(
        issues="42", label=None, repo="owner/repo", auto=True,
        config=str(cfg_file), dry_run=True, resume=None, limit=None, verbose=False,
    )

    with patch("dispatcher.config._detect_repo", return_value="owner/repo"):
        config = load_config(args)

    config = Config(
        plugin_path="/test/path", repo="owner/repo", db_path=db_path,
        issues=[42], auto=True, dry_run=True,
    )

    from dispatcher.models import Config
    code = run(config)
    assert code == 0

    # Verify DB
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM issues").fetchall()
    assert len(rows) == 1
    assert rows[0]["issue_number"] == 42
    assert rows[0]["triage_tier"] == "full-yolo"
    conn.close()
```

**Step 2: Run tests**

Run: `python -m pytest dispatcher/tests/test_integration.py -v`
Expected: All PASS

**Step 3: Commit**

```bash
git add dispatcher/tests/test_integration.py
git commit -m "test(dispatcher): add integration test for full dry-run pipeline"
```

---

### Task 14: Rate limiting and error recovery

**Files:**
- Modify: `dispatcher/pipeline.py`
- Modify: `dispatcher/tests/test_pipeline.py`

**Acceptance Criteria:**
- [ ] Rate limit detection: consecutive failures trigger progressive backoff (5 min, then 15 min)
- [ ] After 2 consecutive rate-limit errors, pipeline pauses 15 minutes before retrying
- [ ] `gh` command failures are logged as warnings, not fatal errors
- [ ] Turn limit detection correctly identifies leash_hit when `num_turns == max_turns` and no PR exists
- [ ] Turn limit message printed: `"Issue #N hit the turn limit (M turns). Branch B has partial work. Use --resume to continue."`
- [ ] `pytest dispatcher/tests/test_pipeline.py -v` passes with rate limit tests

**Step 1: Add rate limit tests**

Test that consecutive execution failures with rate-limit-like errors trigger the pause.

**Step 2: Implement rate limit handling in pipeline.py**

Add a `_rate_limit_tracker` that counts consecutive errors and calls `time.sleep` for configured durations.

**Step 3: Run tests and commit**

```bash
git add dispatcher/pipeline.py dispatcher/tests/test_pipeline.py
git commit -m "feat(dispatcher): add rate limiting and error recovery to pipeline"
```

---

### Task 15: Final polish — __main__.py, entry point, README

**Files:**
- Modify: `dispatcher/__main__.py`
- Modify: `pyproject.toml`

**Acceptance Criteria:**
- [ ] `python -m dispatcher --help` prints usage with all 9 arguments
- [ ] `python -m dispatcher --dry-run --issues 42 --auto --config nonexistent.yml` exits with code 2 (config error)
- [ ] `pyproject.toml` has a `[project.scripts]` entry: `dispatcher = "dispatcher.cli:main"`
- [ ] All tests pass: `python -m pytest dispatcher/tests/ -v`

**Step 1: Add scripts entry to pyproject.toml**

```toml
[project.scripts]
dispatcher = "dispatcher.cli:main"
```

**Step 2: Verify __main__.py**

Confirm it imports and calls `cli.main()`.

**Step 3: Run full test suite**

Run: `python -m pytest dispatcher/tests/ -v`
Expected: All PASS

**Step 4: Commit**

```bash
git add pyproject.toml dispatcher/__main__.py
git commit -m "feat(dispatcher): add CLI entry point and finalize package setup"
```
