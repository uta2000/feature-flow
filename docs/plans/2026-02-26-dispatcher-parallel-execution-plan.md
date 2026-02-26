# Dispatcher Parallel Execution — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the dispatcher's sequential issue execution with tmux-based parallel execution using git worktrees for isolation.

**Architecture:** Triage and review remain sequential. `_run_execution()` is replaced by a tmux orchestrator that creates one git worktree per issue, launches worker processes in tmux panes (up to `max_parallel`), and polls for completion via SQLite.

**Tech Stack:** Python 3, subprocess (git/tmux), SQLite WAL mode, existing dispatcher infrastructure.

---

### Task 1: Add `max_parallel` to Config and CLI

**Files:**
- Modify: `dispatcher/models.py:7-27` (Config dataclass)
- Modify: `dispatcher/cli.py:7-21` (build_parser)
- Modify: `dispatcher/config.py:113-136` (_build_config)
- Test: `dispatcher/tests/test_config.py`
- Test: `dispatcher/tests/test_cli.py`

**Acceptance Criteria:**
- [ ] `Config` dataclass has `max_parallel: int = 4` field
- [ ] `--max-parallel` CLI flag exists and parses to int
- [ ] `config.py:_build_config` reads `max_parallel` from YAML and CLI override
- [ ] `test_cli.py` has test that `--max-parallel 6` parses correctly
- [ ] `test_config.py` has test that YAML `max_parallel` is loaded

**Step 1: Write failing test for Config field**

```python
# In dispatcher/tests/test_models.py — add:
def test_config_max_parallel_default():
    cfg = Config(plugin_path="/p")
    assert cfg.max_parallel == 4
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest dispatcher/tests/test_models.py::test_config_max_parallel_default -v`
Expected: FAIL with AttributeError

**Step 3: Add `max_parallel` field to Config**

In `dispatcher/models.py`, add to Config dataclass after `rate_limit_batch_pause_seconds`:
```python
max_parallel: int = 4
```

**Step 4: Run test to verify it passes**

Run: `python -m pytest dispatcher/tests/test_models.py::test_config_max_parallel_default -v`
Expected: PASS

**Step 5: Write failing test for CLI flag**

```python
# In dispatcher/tests/test_cli.py — add:
from dispatcher.cli import build_parser

def test_max_parallel_flag():
    parser = build_parser()
    args = parser.parse_args(["--max-parallel", "6"])
    assert args.max_parallel == 6

def test_max_parallel_default():
    parser = build_parser()
    args = parser.parse_args([])
    assert args.max_parallel is None
```

**Step 6: Add `--max-parallel` to CLI parser**

In `dispatcher/cli.py:build_parser()`, add:
```python
parser.add_argument("--max-parallel", type=int, default=None, help="Max parallel executions (default: 4)")
```

**Step 7: Wire `max_parallel` through config loading**

In `dispatcher/config.py:_build_config`, add to the Config constructor:
```python
max_parallel=args.max_parallel or yaml_data.get("max_parallel", 4),
```

**Step 8: Run all tests**

Run: `python -m pytest dispatcher/tests/test_models.py dispatcher/tests/test_cli.py dispatcher/tests/test_config.py -v`
Expected: All PASS

**Step 9: Commit**

```bash
git add dispatcher/models.py dispatcher/cli.py dispatcher/config.py dispatcher/tests/
git commit -m "feat(dispatcher): add max_parallel config and CLI flag"
```

---

### Task 2: Enable WAL mode in SQLite

**Files:**
- Modify: `dispatcher/db.py:58-62` (init_db)
- Test: `dispatcher/tests/test_db.py`

**Acceptance Criteria:**
- [ ] `init_db()` sets `PRAGMA journal_mode=WAL` on the connection
- [ ] Test verifies WAL mode is active after `init_db()`

**Step 1: Write failing test**

```python
# In dispatcher/tests/test_db.py — add:
from dispatcher.db import init_db

def test_wal_mode_enabled(tmp_path):
    db_path = str(tmp_path / "test.db")
    conn = init_db(db_path)
    mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    assert mode == "wal"
    conn.close()
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest dispatcher/tests/test_db.py::test_wal_mode_enabled -v`
Expected: FAIL — mode is "memory" or "delete"

**Step 3: Add WAL pragma to init_db**

In `dispatcher/db.py:init_db`, add after `conn.row_factory = sqlite3.Row`:
```python
conn.execute("PRAGMA journal_mode=WAL")
```

**Step 4: Run test to verify it passes**

Run: `python -m pytest dispatcher/tests/test_db.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add dispatcher/db.py dispatcher/tests/test_db.py
git commit -m "feat(dispatcher): enable WAL mode for concurrent SQLite access"
```

---

### Task 3: Create `dispatcher/worktree.py` — Git worktree helpers

**Files:**
- Create: `dispatcher/worktree.py`
- Test: `dispatcher/tests/test_worktree.py`

**Acceptance Criteria:**
- [ ] `create_worktree(issue_number, base_branch, repo_root)` runs `git worktree add` and returns the worktree `Path`
- [ ] `remove_worktree(path)` runs `git worktree remove --force`
- [ ] `cleanup_all(repo_root)` removes `.dispatcher-worktrees/` dir and runs `git worktree prune`
- [ ] All three functions tested with mocked subprocess
- [ ] `.dispatcher-worktrees/` is added to `.gitignore`
- [ ] `create_worktree` raises `CalledProcessError` when worktree path already exists (tested)

**Step 1: Write failing tests**

```python
# dispatcher/tests/test_worktree.py
import subprocess
from pathlib import Path
from unittest.mock import call, patch

from dispatcher.worktree import cleanup_all, create_worktree, remove_worktree


class TestCreateWorktree:
    @patch("dispatcher.worktree.subprocess.run")
    def test_creates_worktree_at_correct_path(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        repo_root = Path("/repo")
        path = create_worktree(42, "main", repo_root)
        assert path == repo_root / ".dispatcher-worktrees" / "issue-42"
        mock_run.assert_called_once()
        cmd = mock_run.call_args[0][0]
        assert cmd[0:3] == ["git", "worktree", "add"]
        assert str(path) in cmd
        assert "main" in cmd

    @patch("dispatcher.worktree.subprocess.run")
    def test_raises_on_failure(self, mock_run):
        mock_run.side_effect = subprocess.CalledProcessError(1, "git")
        import pytest
        with pytest.raises(subprocess.CalledProcessError):
            create_worktree(42, "main", Path("/repo"))


class TestRemoveWorktree:
    @patch("dispatcher.worktree.subprocess.run")
    def test_removes_worktree(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        remove_worktree(Path("/repo/.dispatcher-worktrees/issue-42"))
        cmd = mock_run.call_args[0][0]
        assert "remove" in cmd
        assert "--force" in cmd


class TestCleanupAll:
    @patch("dispatcher.worktree.shutil.rmtree")
    @patch("dispatcher.worktree.subprocess.run")
    def test_prunes_and_removes_dir(self, mock_run, mock_rmtree):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        repo_root = Path("/repo")
        cleanup_all(repo_root)
        mock_run.assert_called_once()
        assert "prune" in mock_run.call_args[0][0]
        mock_rmtree.assert_called_once_with(
            repo_root / ".dispatcher-worktrees", ignore_errors=True,
        )
```

**Step 2: Run tests to verify they fail**

Run: `python -m pytest dispatcher/tests/test_worktree.py -v`
Expected: FAIL — ImportError (module doesn't exist)

**Step 3: Implement `dispatcher/worktree.py`**

```python
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

_WORKTREE_DIR = ".dispatcher-worktrees"


def create_worktree(issue_number: int, base_branch: str, repo_root: Path) -> Path:
    path = repo_root / _WORKTREE_DIR / f"issue-{issue_number}"
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["git", "worktree", "add", str(path), base_branch],
        capture_output=True, text=True, timeout=30, check=True,
    )
    return path


def remove_worktree(path: Path) -> None:
    subprocess.run(
        ["git", "worktree", "remove", str(path), "--force"],
        capture_output=True, text=True, timeout=30,
    )


def cleanup_all(repo_root: Path) -> None:
    subprocess.run(
        ["git", "worktree", "prune"],
        capture_output=True, text=True, timeout=30,
    )
    shutil.rmtree(repo_root / _WORKTREE_DIR, ignore_errors=True)
```

**Step 4: Run tests to verify they pass**

Run: `python -m pytest dispatcher/tests/test_worktree.py -v`
Expected: All PASS

**Step 5: Add `.dispatcher-worktrees/` to `.gitignore`**

Append to `.gitignore`:
```
.dispatcher-worktrees/
```

**Step 6: Commit**

```bash
git add dispatcher/worktree.py dispatcher/tests/test_worktree.py .gitignore
git commit -m "feat(dispatcher): add git worktree helpers for parallel execution"
```

---

### Task 4: Create `dispatcher/tmux.py` — tmux session management

**Files:**
- Create: `dispatcher/tmux.py`
- Test: `dispatcher/tests/test_tmux.py`

**Acceptance Criteria:**
- [ ] `is_tmux_available()` returns `True`/`False` based on `shutil.which("tmux")`
- [ ] `create_session(name, num_panes)` creates a tmux session with `num_panes` panes in tiled layout, with `remain-on-exit on`
- [ ] `send_command(session, pane_index, command)` sends keys to a specific pane
- [ ] `get_pane_status(session)` returns list of `(pane_index, is_alive, exit_code)` tuples by parsing `tmux list-panes`
- [ ] `kill_session(name)` kills the tmux session
- [ ] All functions tested with mocked subprocess
- [ ] `get_pane_status` returns empty list when session has no panes or session doesn't exist (tested)

**Step 1: Write failing tests**

```python
# dispatcher/tests/test_tmux.py
import subprocess
from unittest.mock import call, patch

from dispatcher.tmux import (
    create_session,
    get_pane_status,
    is_tmux_available,
    kill_session,
    send_command,
)


class TestIsTmuxAvailable:
    @patch("dispatcher.tmux.shutil.which", return_value="/usr/bin/tmux")
    def test_available(self, mock_which):
        assert is_tmux_available() is True

    @patch("dispatcher.tmux.shutil.which", return_value=None)
    def test_not_available(self, mock_which):
        assert is_tmux_available() is False


class TestCreateSession:
    @patch("dispatcher.tmux.subprocess.run")
    def test_creates_session_with_panes(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        create_session("disp-abc", 3)
        calls = mock_run.call_args_list
        # First call: new-session
        assert "new-session" in calls[0][0][0]
        # Should have split-window calls for panes 2 and 3
        split_calls = [c for c in calls if "split-window" in str(c)]
        assert len(split_calls) == 2
        # Should set remain-on-exit and tiled layout
        all_args = str(calls)
        assert "remain-on-exit" in all_args
        assert "tiled" in all_args

    @patch("dispatcher.tmux.subprocess.run")
    def test_single_pane_no_splits(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        create_session("disp-abc", 1)
        split_calls = [c for c in mock_run.call_args_list if "split-window" in str(c)]
        assert len(split_calls) == 0


class TestSendCommand:
    @patch("dispatcher.tmux.subprocess.run")
    def test_sends_keys(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        send_command("disp-abc", 0, "echo hello")
        cmd = mock_run.call_args[0][0]
        assert "send-keys" in cmd
        assert "echo hello" in cmd


class TestGetPaneStatus:
    @patch("dispatcher.tmux.subprocess.run")
    def test_parses_pane_output(self, mock_run):
        # Format: pane_index, pane_dead (0/1), pane_dead_status (exit code)
        mock_run.return_value = subprocess.CompletedProcess(
            [], 0, "0 0 \n1 1 0\n2 1 1\n", "",
        )
        statuses = get_pane_status("disp-abc")
        assert statuses[0] == (0, True, None)   # alive
        assert statuses[1] == (1, False, 0)      # dead, exit 0
        assert statuses[2] == (2, False, 1)      # dead, exit 1


class TestKillSession:
    @patch("dispatcher.tmux.subprocess.run")
    def test_kills_session(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        kill_session("disp-abc")
        cmd = mock_run.call_args[0][0]
        assert "kill-session" in cmd
        assert "disp-abc" in cmd
```

**Step 2: Run tests to verify they fail**

Run: `python -m pytest dispatcher/tests/test_tmux.py -v`
Expected: FAIL — ImportError

**Step 3: Implement `dispatcher/tmux.py`**

```python
from __future__ import annotations

import shutil
import subprocess


def is_tmux_available() -> bool:
    return shutil.which("tmux") is not None


def create_session(name: str, num_panes: int) -> None:
    subprocess.run(
        ["tmux", "new-session", "-d", "-s", name],
        capture_output=True, text=True, timeout=10, check=True,
    )
    subprocess.run(
        ["tmux", "set-option", "-t", name, "remain-on-exit", "on"],
        capture_output=True, text=True, timeout=10, check=True,
    )
    for _ in range(num_panes - 1):
        subprocess.run(
            ["tmux", "split-window", "-t", name],
            capture_output=True, text=True, timeout=10, check=True,
        )
    subprocess.run(
        ["tmux", "select-layout", "-t", name, "tiled"],
        capture_output=True, text=True, timeout=10, check=True,
    )


def send_command(session_name: str, pane_index: int, command: str) -> None:
    subprocess.run(
        ["tmux", "send-keys", "-t", f"{session_name}:{pane_index}", command, "Enter"],
        capture_output=True, text=True, timeout=10, check=True,
    )


def get_pane_status(session_name: str) -> list[tuple[int, bool, int | None]]:
    result = subprocess.run(
        [
            "tmux", "list-panes", "-t", session_name,
            "-F", "#{pane_index} #{pane_dead} #{pane_dead_status}",
        ],
        capture_output=True, text=True, timeout=10,
    )
    statuses: list[tuple[int, bool, int | None]] = []
    for line in result.stdout.strip().splitlines():
        parts = line.split()
        idx = int(parts[0])
        is_dead = parts[1] == "1"
        exit_code = int(parts[2]) if is_dead and len(parts) > 2 else None
        is_alive = not is_dead
        statuses.append((idx, is_alive, exit_code))
    return statuses


def kill_session(session_name: str) -> None:
    subprocess.run(
        ["tmux", "kill-session", "-t", session_name],
        capture_output=True, text=True, timeout=10,
    )
```

**Step 4: Run tests to verify they pass**

Run: `python -m pytest dispatcher/tests/test_tmux.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add dispatcher/tmux.py dispatcher/tests/test_tmux.py
git commit -m "feat(dispatcher): add tmux session management module"
```

---

### Task 5: Create `dispatcher/worker.py` — Standalone issue executor

**Files:**
- Create: `dispatcher/worker.py`
- Test: `dispatcher/tests/test_worker.py`

**Acceptance Criteria:**
- [ ] `worker.py` is runnable as `python -m dispatcher.worker` with `--issue-json`, `--config-json`, `--run-id`, `--db-path` args
- [ ] Worker deserializes `ReviewedIssue` and `Config` from JSON args
- [ ] Worker creates branch, calls `execute_issue()`, writes result to SQLite
- [ ] Worker exits 0 on success (pr_created/pr_created_review) and 1 on failure/leash_hit
- [ ] Tests verify arg parsing, execution call, DB write, and exit codes with mocked dependencies
- [ ] Worker returns exit code 1 when `--issue-json` contains invalid JSON (tested)
- [ ] Worker returns exit code 1 when branch creation fails (tested)

**Step 1: Write failing tests**

```python
# dispatcher/tests/test_worker.py
import json
import subprocess
from unittest.mock import MagicMock, patch

import pytest

from dispatcher.models import Config, ExecutionResult, ReviewedIssue, TriageResult


def _sample_triage_dict() -> dict:
    return {
        "issue_number": 42, "issue_title": "Test Issue", "issue_url": "url",
        "scope": "quick-fix", "richness_score": 4, "richness_signals": {},
        "triage_tier": "full-yolo", "confidence": 0.95,
        "risk_flags": [], "missing_info": [], "reasoning": "ok",
    }


def _sample_issue_dict() -> dict:
    return {
        "triage": _sample_triage_dict(),
        "final_tier": "full-yolo",
        "skipped": False,
        "edited_comment": None,
    }


def _sample_config_dict() -> dict:
    return {
        "plugin_path": "/p", "repo": "o/r", "base_branch": "main",
        "execution_model": "claude-opus-4-20250514", "execution_max_turns": 200,
        "branch_prefix_fix": "fix", "branch_prefix_feat": "feat",
    }


class TestWorkerParseArgs:
    def test_parses_all_args(self):
        from dispatcher.worker import parse_args
        args = parse_args([
            "--issue-json", json.dumps(_sample_issue_dict()),
            "--config-json", json.dumps(_sample_config_dict()),
            "--run-id", "run-1",
            "--db-path", "/tmp/test.db",
        ])
        assert args.run_id == "run-1"
        assert args.db_path == "/tmp/test.db"


class TestWorkerRun:
    @patch("dispatcher.worker.db")
    @patch("dispatcher.worker.execute_issue")
    @patch("dispatcher.worker.create_branch")
    def test_success_exits_0(self, mock_branch, mock_exec, mock_db):
        from dispatcher.worker import run_worker
        mock_branch.return_value = "fix/42-issue-42"
        mock_exec.return_value = ExecutionResult(
            issue_number=42, branch_name="fix/42-issue-42",
            session_id="s1", num_turns=10, is_error=False,
            pr_number=100, pr_url="url", error_message=None, outcome="pr_created",
        )
        mock_db.init_db.return_value = MagicMock()

        code = run_worker(
            _sample_issue_dict(), _sample_config_dict(), "run-1", "/tmp/test.db",
        )
        assert code == 0
        mock_db.update_issue_execution.assert_called_once()

    @patch("dispatcher.worker.db")
    @patch("dispatcher.worker.execute_issue")
    @patch("dispatcher.worker.create_branch")
    def test_failure_exits_1(self, mock_branch, mock_exec, mock_db):
        from dispatcher.worker import run_worker
        mock_branch.return_value = "fix/42-issue-42"
        mock_exec.return_value = ExecutionResult(
            issue_number=42, branch_name="fix/42-issue-42",
            session_id=None, num_turns=0, is_error=True,
            pr_number=None, pr_url=None, error_message="boom", outcome="failed",
        )
        mock_db.init_db.return_value = MagicMock()

        code = run_worker(
            _sample_issue_dict(), _sample_config_dict(), "run-1", "/tmp/test.db",
        )
        assert code == 1
```

**Step 2: Run tests to verify they fail**

Run: `python -m pytest dispatcher/tests/test_worker.py -v`
Expected: FAIL — ImportError

**Step 3: Implement `dispatcher/worker.py`**

```python
from __future__ import annotations

import argparse
import json
import sys

from dispatcher import db
from dispatcher.execute import create_branch, execute_issue
from dispatcher.models import Config, ReviewedIssue, TriageResult


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Execute a single dispatcher issue")
    parser.add_argument("--issue-json", required=True, help="ReviewedIssue as JSON")
    parser.add_argument("--config-json", required=True, help="Config fields as JSON")
    parser.add_argument("--run-id", required=True, help="Dispatcher run ID")
    parser.add_argument("--db-path", required=True, help="Path to SQLite DB")
    return parser.parse_args(argv)


def _build_reviewed(data: dict) -> ReviewedIssue:
    tr_data = data["triage"]
    tr = TriageResult(**tr_data)
    return ReviewedIssue(
        triage=tr,
        final_tier=data["final_tier"],
        skipped=data.get("skipped", False),
        edited_comment=data.get("edited_comment"),
    )


def _build_config(data: dict) -> Config:
    return Config(**{k: v for k, v in data.items() if k in Config.__dataclass_fields__})


def run_worker(
    issue_data: dict, config_data: dict, run_id: str, db_path: str,
) -> int:
    reviewed = _build_reviewed(issue_data)
    config = _build_config(config_data)
    conn = db.init_db(db_path)

    try:
        branch = create_branch(reviewed.triage.issue_number, reviewed.triage.scope, config)
    except Exception as exc:
        print(f"Branch creation failed: {exc}")
        return 1

    er = execute_issue(reviewed, branch, config)
    db.update_issue_execution(conn, run_id, reviewed.triage.issue_number, er)
    conn.close()

    if er.outcome in ("pr_created", "pr_created_review"):
        print(f"[#{reviewed.triage.issue_number}] {branch} → PR #{er.pr_number}")
        return 0
    elif er.outcome == "leash_hit":
        print(f"[#{reviewed.triage.issue_number}] Hit turn limit ({er.num_turns} turns)")
        return 1
    else:
        print(f"[#{reviewed.triage.issue_number}] Failed: {er.error_message}")
        return 1


def main() -> None:
    args = parse_args()
    issue_data = json.loads(args.issue_json)
    config_data = json.loads(args.config_json)
    code = run_worker(issue_data, config_data, args.run_id, args.db_path)
    sys.exit(code)


if __name__ == "__main__":
    main()
```

**Step 4: Run tests to verify they pass**

Run: `python -m pytest dispatcher/tests/test_worker.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add dispatcher/worker.py dispatcher/tests/test_worker.py
git commit -m "feat(dispatcher): add standalone worker for parallel issue execution"
```

---

### Task 6: Rewrite `_run_execution()` with tmux orchestrator

**Files:**
- Modify: `dispatcher/pipeline.py:152-177` (_run_execution)
- Test: `dispatcher/tests/test_pipeline.py`

**Acceptance Criteria:**
- [ ] `_run_execution()` calls `worktree.create_worktree()` for each issue
- [ ] When `tmux.is_tmux_available()` is `True` and `len(to_execute) > 1`: creates tmux session, launches workers in panes, polls for completion
- [ ] When tmux unavailable or only 1 issue: falls back to existing sequential `_execute_single_issue()` loop
- [ ] Coordinator polls `tmux.get_pane_status()` every 5s, reads results from SQLite
- [ ] When `len(to_execute) > max_parallel`: first batch fills panes, then new issues launch as panes free up
- [ ] `worktree.cleanup_all()` is called in a `finally` block
- [ ] `tmux.kill_session()` is called after all workers complete
- [ ] No more `stash_if_dirty()`/`unstash()` calls (worktrees eliminate the need)
- [ ] Existing pipeline tests still pass (they mock execution internals)
- [ ] New test verifies tmux path: worktrees created, session created, workers launched, results collected
- [ ] New test verifies sequential fallback when tmux unavailable
- [ ] Single issue with tmux available still uses sequential fallback (len check)
- [ ] `_read_result_from_db` returns a `failed` result when DB row has no outcome

**Step 1: Write failing test for parallel path**

```python
# Add to dispatcher/tests/test_pipeline.py:
@patch("dispatcher.pipeline.tmux")
@patch("dispatcher.pipeline.worktree")
@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
def test_parallel_execution_creates_worktrees(mock_triage, mock_gh, mock_db, mock_wt, mock_tmux):
    mock_db.init_db.return_value = MagicMock()
    mock_gh.view_issue.return_value = {"title": "Test", "body": "Body", "comments": []}
    mock_triage.side_effect = [_triage(42), _triage(43)]
    mock_tmux.is_tmux_available.return_value = True
    mock_wt.create_worktree.side_effect = [Path("/wt/42"), Path("/wt/43")]

    # Simulate panes finishing immediately with results in DB
    mock_tmux.get_pane_status.return_value = [(0, False, 0), (1, False, 0)]

    # DB returns results for both issues
    mock_conn = mock_db.init_db.return_value
    mock_conn.execute.return_value.fetchone.side_effect = [
        {"outcome": "pr_created", "branch_name": "fix/42", "session_id": "s1",
         "num_turns": 10, "is_error": 0, "pr_number": 100, "pr_url": "url", "error_message": None},
        {"outcome": "pr_created", "branch_name": "fix/43", "session_id": "s2",
         "num_turns": 8, "is_error": 0, "pr_number": 101, "pr_url": "url", "error_message": None},
    ]

    code = run(_cfg(issues=[42, 43], auto=True, dry_run=False, max_parallel=4))
    assert code == 0
    assert mock_wt.create_worktree.call_count == 2
    mock_tmux.create_session.assert_called_once()
    mock_wt.cleanup_all.assert_called_once()
```

**Step 2: Write failing test for sequential fallback**

```python
@patch("dispatcher.pipeline.tmux")
@patch("dispatcher.pipeline.execute_issue")
@patch("dispatcher.pipeline.create_branch")
@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
def test_sequential_fallback_no_tmux(mock_triage, mock_gh, mock_db, mock_branch, mock_exec, mock_tmux):
    mock_db.init_db.return_value = MagicMock()
    mock_gh.view_issue.return_value = {"title": "Test", "body": "Body", "comments": []}
    mock_triage.return_value = _triage(42)
    mock_tmux.is_tmux_available.return_value = False
    mock_branch.return_value = "fix/42-issue-42"
    mock_exec.return_value = _exec_result(outcome="pr_created")

    code = run(_cfg(issues=[42], auto=True, dry_run=False))
    assert code == 0
    mock_tmux.create_session.assert_not_called()
    mock_exec.assert_called_once()
```

**Step 3: Run tests to verify they fail**

Run: `python -m pytest dispatcher/tests/test_pipeline.py::test_parallel_execution_creates_worktrees dispatcher/tests/test_pipeline.py::test_sequential_fallback_no_tmux -v`
Expected: FAIL — pipeline doesn't import tmux/worktree yet

**Step 4: Implement parallel `_run_execution()`**

Rewrite `_run_execution()` in `dispatcher/pipeline.py`. The function should:

1. Import `tmux` and `worktree` modules
2. Check `tmux.is_tmux_available()` and `len(to_execute) > 1`
3. If parallel: call `_run_parallel_execution()`
4. If sequential: call `_run_sequential_execution()` (existing logic, minus stash/unstash)

```python
from dispatcher import tmux, worktree

def _run_execution(
    conn, run_id: str, to_execute: list[ReviewedIssue], config: Config,
) -> tuple[list[ExecutionResult], int]:
    if len(to_execute) > 1 and tmux.is_tmux_available():
        return _run_parallel_execution(conn, run_id, to_execute, config)
    return _run_sequential_execution(conn, run_id, to_execute, config)


def _run_sequential_execution(
    conn, run_id: str, to_execute: list[ReviewedIssue], config: Config,
) -> tuple[list[ExecutionResult], int]:
    """Original sequential execution — used as fallback."""
    results: list[ExecutionResult] = []
    total_turns = 0
    tracker = _RateLimitTracker()
    for r in to_execute:
        if tracker.should_backoff():
            wait = tracker.backoff_seconds()
            print(f"  Rate limit backoff: waiting {wait}s before next execution.")
            time.sleep(wait)
        er = _execute_single_issue(conn, run_id, r, config)
        if er.outcome in ("failed", "leash_hit"):
            tracker.record_failure()
        else:
            tracker.record_success()
        results.append(er)
        total_turns += er.num_turns
    return results, total_turns


def _run_parallel_execution(
    conn, run_id: str, to_execute: list[ReviewedIssue], config: Config,
) -> tuple[list[ExecutionResult], int]:
    import json as json_mod
    from dataclasses import asdict
    from pathlib import Path

    repo_root = Path.cwd()
    session_name = f"dispatcher-{run_id[:8]}"
    num_panes = min(len(to_execute), config.max_parallel)
    worktree_paths: list[Path] = []

    try:
        # Create worktrees for all issues
        for r in to_execute:
            wt_path = worktree.create_worktree(
                r.triage.issue_number, config.base_branch, repo_root,
            )
            worktree_paths.append(wt_path)

        # Create tmux session
        tmux.create_session(session_name, num_panes)

        # Build serialized config (shared by all workers)
        config_json = json_mod.dumps(asdict(config))
        db_path = str(Path(config.db_path).resolve())

        # Launch initial batch
        queue = list(enumerate(to_execute))  # (index, reviewed)
        pane_assignments: dict[int, int] = {}  # pane_index -> queue_index
        for pane_idx in range(num_panes):
            qi, reviewed = queue.pop(0)
            _launch_worker(session_name, pane_idx, worktree_paths[qi], reviewed, config_json, run_id, db_path)
            pane_assignments[pane_idx] = qi

        # Attach user to tmux
        print(f"\n  Parallel execution started in tmux session '{session_name}'.")
        print(f"  Run `tmux attach -t {session_name}` to watch progress.\n")

        # Poll for completion
        results = _poll_for_completion(
            conn, run_id, session_name, to_execute, queue,
            worktree_paths, pane_assignments, config_json, db_path, config,
        )
    finally:
        tmux.kill_session(session_name)
        worktree.cleanup_all(repo_root)

    total_turns = sum(r.num_turns for r in results)
    return results, total_turns


def _launch_worker(
    session_name: str, pane_index: int, wt_path: Path,
    reviewed: ReviewedIssue, config_json: str, run_id: str, db_path: str,
) -> None:
    import json as json_mod
    from dataclasses import asdict

    issue_json = json_mod.dumps(asdict(reviewed))
    cmd = (
        f"cd {wt_path} && python -m dispatcher.worker"
        f" --issue-json '{issue_json}'"
        f" --config-json '{config_json}'"
        f" --run-id '{run_id}'"
        f" --db-path '{db_path}'"
    )
    tmux.send_command(session_name, pane_index, cmd)


def _poll_for_completion(
    conn, run_id, session_name, to_execute, queue,
    worktree_paths, pane_assignments, config_json, db_path, config,
) -> list[ExecutionResult]:
    results: list[ExecutionResult] = []
    completed_issues: set[int] = set()

    while len(results) < len(to_execute):
        time.sleep(5)
        statuses = tmux.get_pane_status(session_name)

        for pane_idx, is_alive, exit_code in statuses:
            if is_alive or pane_idx not in pane_assignments:
                continue
            qi = pane_assignments.pop(pane_idx)
            issue_num = to_execute[qi].triage.issue_number
            if issue_num in completed_issues:
                continue
            completed_issues.add(issue_num)

            er = _read_result_from_db(conn, run_id, issue_num)
            results.append(er)
            _print_execution_result(issue_num, er.branch_name, er)
            print(f"  [{len(results)}/{len(to_execute)} complete]")

            # Launch next queued issue in this freed pane
            if queue:
                next_qi, next_reviewed = queue.pop(0)
                _launch_worker(
                    session_name, pane_idx, worktree_paths[next_qi],
                    next_reviewed, config_json, run_id, db_path,
                )
                pane_assignments[pane_idx] = next_qi

    return results


def _read_result_from_db(conn, run_id: str, issue_number: int) -> ExecutionResult:
    row = conn.execute(
        "SELECT * FROM issues WHERE run_id = ? AND issue_number = ?",
        (run_id, issue_number),
    ).fetchone()
    return ExecutionResult(
        issue_number=row["issue_number"],
        branch_name=row["branch_name"] or "",
        session_id=row["session_id"],
        num_turns=row["num_turns"] or 0,
        is_error=bool(row["is_error"]),
        pr_number=row["pr_number"],
        pr_url=row["pr_url"],
        error_message=row["error_message"],
        outcome=row["outcome"] or "failed",
    )
```

**Step 5: Update existing pipeline tests**

Existing tests that mock `stash_if_dirty`/`unstash` need updating. For tests that run execution (non-dry-run), add `mock_tmux.is_tmux_available.return_value = False` to trigger the sequential fallback, since those tests pass single issues.

**Step 6: Run all pipeline tests**

Run: `python -m pytest dispatcher/tests/test_pipeline.py -v`
Expected: All PASS

**Step 7: Commit**

```bash
git add dispatcher/pipeline.py dispatcher/tests/test_pipeline.py
git commit -m "feat(dispatcher): parallel execution via tmux with sequential fallback"
```

---

### Task 7: Add signal handling for clean interrupt

**Files:**
- Modify: `dispatcher/pipeline.py` (_run_parallel_execution)
- Test: `dispatcher/tests/test_pipeline.py`

**Acceptance Criteria:**
- [ ] SIGINT/SIGTERM during parallel execution triggers `tmux.kill_session()` and `worktree.cleanup_all()`
- [ ] Test verifies cleanup runs when `_run_parallel_execution` is interrupted
- [ ] Cleanup runs even if `tmux.kill_session()` itself raises an exception

**Step 1: Write failing test**

```python
# Add to dispatcher/tests/test_pipeline.py:
import signal

@patch("dispatcher.pipeline.tmux")
@patch("dispatcher.pipeline.worktree")
@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
def test_parallel_cleanup_on_interrupt(mock_triage, mock_gh, mock_db, mock_wt, mock_tmux):
    """Verify worktrees and tmux are cleaned up even on failure."""
    mock_db.init_db.return_value = MagicMock()
    mock_gh.view_issue.return_value = {"title": "Test", "body": "Body", "comments": []}
    mock_triage.side_effect = [_triage(42), _triage(43)]
    mock_tmux.is_tmux_available.return_value = True
    mock_wt.create_worktree.side_effect = [Path("/wt/42"), Path("/wt/43")]

    # Simulate poll raising KeyboardInterrupt
    mock_tmux.get_pane_status.side_effect = KeyboardInterrupt

    code = run(_cfg(issues=[42, 43], auto=True, dry_run=False, max_parallel=4))
    # Cleanup should still happen
    mock_tmux.kill_session.assert_called_once()
    mock_wt.cleanup_all.assert_called_once()
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest dispatcher/tests/test_pipeline.py::test_parallel_cleanup_on_interrupt -v`
Expected: FAIL (KeyboardInterrupt propagates unhandled)

**Step 3: Add exception handling**

The `try/finally` block in `_run_parallel_execution` from Task 6 already handles this. Ensure `KeyboardInterrupt` is caught in `_review_and_execute` or the parallel function returns partial results:

In `_run_parallel_execution`, wrap the poll loop:
```python
try:
    results = _poll_for_completion(...)
except KeyboardInterrupt:
    print("\n  Interrupted. Cleaning up...")
    results = []  # Return empty — summary will reflect interruption
```

The `finally` block already calls `tmux.kill_session()` and `worktree.cleanup_all()`.

**Step 4: Run test to verify it passes**

Run: `python -m pytest dispatcher/tests/test_pipeline.py::test_parallel_cleanup_on_interrupt -v`
Expected: PASS

**Step 5: Commit**

```bash
git add dispatcher/pipeline.py dispatcher/tests/test_pipeline.py
git commit -m "feat(dispatcher): clean up tmux and worktrees on interrupt"
```

---

### Task 8: Update existing tests for stash removal

**Files:**
- Modify: `dispatcher/tests/test_pipeline.py`

**Acceptance Criteria:**
- [ ] Tests that previously mocked `stash_if_dirty`/`unstash` no longer need those mocks (or mock tmux fallback instead)
- [ ] All existing tests pass without modification to the execution path semantics
- [ ] `python -m pytest dispatcher/tests/ -v` passes with 0 failures

**Step 1: Update test mocks**

For tests that exercise execution (non-dry-run), add `@patch("dispatcher.pipeline.tmux")` and set `mock_tmux.is_tmux_available.return_value = False`. Remove `stash_if_dirty`/`unstash` mocks since sequential fallback no longer calls them.

**Step 2: Run full test suite**

Run: `python -m pytest dispatcher/tests/ -v`
Expected: All PASS

**Step 3: Commit**

```bash
git add dispatcher/tests/
git commit -m "test(dispatcher): update pipeline tests for parallel execution changes"
```

---

### Task 9: Integration smoke test

**Files:**
- Modify: `dispatcher/tests/test_integration.py`

**Acceptance Criteria:**
- [ ] Integration test mocks `claude -p` with a fast stub, creates 2 worktrees, verifies both complete
- [ ] Test verifies worktree cleanup happened (`.dispatcher-worktrees/` doesn't exist after run)
- [ ] `python -m pytest dispatcher/tests/test_integration.py -v` passes

**Step 1: Read existing integration test for patterns**

Read `dispatcher/tests/test_integration.py` to understand existing patterns.

**Step 2: Add parallel integration test**

```python
@patch("dispatcher.pipeline.tmux")
@patch("dispatcher.pipeline.worktree")
@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
def test_parallel_two_issues_end_to_end(mock_triage, mock_gh, mock_db, mock_wt, mock_tmux):
    """Smoke test: two issues through parallel path with mocked tmux."""
    mock_db.init_db.return_value = MagicMock()
    mock_gh.view_issue.return_value = {"title": "Test", "body": "Body", "comments": []}
    mock_triage.side_effect = [_triage(42), _triage(43)]
    mock_tmux.is_tmux_available.return_value = True
    mock_wt.create_worktree.side_effect = [Path("/wt/42"), Path("/wt/43")]

    # Both panes finish immediately
    mock_tmux.get_pane_status.return_value = [(0, False, 0), (1, False, 0)]

    mock_conn = mock_db.init_db.return_value
    # Return results for DB reads
    mock_conn.execute.return_value.fetchone.side_effect = [
        _db_row(42, "pr_created"), _db_row(43, "pr_created"),
    ]

    code = run(_cfg(issues=[42, 43], auto=True, dry_run=False, max_parallel=4))
    assert code == 0
    mock_wt.cleanup_all.assert_called_once()
    mock_tmux.kill_session.assert_called_once()
```

**Step 3: Run test**

Run: `python -m pytest dispatcher/tests/test_integration.py -v`
Expected: All PASS

**Step 4: Commit**

```bash
git add dispatcher/tests/test_integration.py
git commit -m "test(dispatcher): add parallel execution integration smoke test"
```

---

### Task 10: Final verification

**Files:** None (verification only)

**Acceptance Criteria:**
- [ ] `python -m pytest dispatcher/tests/ -v` passes with 0 failures
- [ ] `python -m dispatcher --help` shows `--max-parallel` flag
- [ ] Type checking passes: `python -m mypy dispatcher/ --ignore-missing-imports` (if mypy is configured)
- [ ] `.gitignore` contains `.dispatcher-worktrees/`

**Step 1: Run full test suite**

Run: `python -m pytest dispatcher/tests/ -v`
Expected: All PASS

**Step 2: Verify CLI help**

Run: `python -m dispatcher --help`
Expected: Output includes `--max-parallel`

**Step 3: Verify gitignore**

Run: `grep dispatcher-worktrees .gitignore`
Expected: `.dispatcher-worktrees/`

**Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "chore(dispatcher): final cleanup for parallel execution"
```
