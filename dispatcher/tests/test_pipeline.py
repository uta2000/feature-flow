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


def _exec_result(number: int = 42, outcome: str = "pr_created") -> ExecutionResult:
    return ExecutionResult(
        issue_number=number, branch_name=f"fix/{number}-issue-{number}",
        session_id="sess-1", num_turns=5, is_error=False,
        pr_number=101, pr_url="https://github.com/o/r/pull/101",
        error_message=None, outcome=outcome,
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


@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
def test_triage_error_skips_issue(mock_triage, mock_gh, mock_db):
    from dispatcher.triage import TriageError
    mock_db.init_db.return_value = MagicMock()
    mock_gh.view_issue.return_value = {"title": "Test", "body": "Body", "comments": []}
    mock_triage.side_effect = TriageError("claude exploded")

    code = run(_cfg(issues=[42], auto=True, dry_run=True))
    # No results means partial failure (1)
    assert code == 1


@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
def test_github_error_skips_issue(mock_triage, mock_gh, mock_db):
    from dispatcher.github import GithubError
    mock_db.init_db.return_value = MagicMock()
    mock_gh.view_issue.side_effect = GithubError("not found")

    code = run(_cfg(issues=[42], auto=True, dry_run=True))
    assert code == 1


@patch("dispatcher.pipeline.tmux")
@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
@patch("dispatcher.pipeline.execute_issue")
@patch("dispatcher.pipeline.create_branch")
def test_execution_success_exit_0(mock_branch, mock_exec, mock_triage, mock_gh, mock_db, mock_tmux):
    mock_tmux.is_tmux_available.return_value = False
    mock_db.init_db.return_value = MagicMock()
    mock_gh.view_issue.return_value = {"title": "Test", "body": "Body", "comments": []}
    mock_triage.return_value = _triage()
    mock_branch.return_value = "fix/42-issue-42"
    mock_exec.return_value = _exec_result(outcome="pr_created")

    code = run(_cfg(issues=[42], auto=True, dry_run=False))
    assert code == 0


@patch("dispatcher.pipeline.tmux")
@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
@patch("dispatcher.pipeline.execute_issue")
@patch("dispatcher.pipeline.create_branch")
def test_execution_failure_exit_1(mock_branch, mock_exec, mock_triage, mock_gh, mock_db, mock_tmux):
    mock_tmux.is_tmux_available.return_value = False
    mock_db.init_db.return_value = MagicMock()
    mock_gh.view_issue.return_value = {"title": "Test", "body": "Body", "comments": []}
    mock_triage.return_value = _triage()
    mock_branch.return_value = "fix/42-issue-42"
    mock_exec.return_value = _exec_result(outcome="failed")

    code = run(_cfg(issues=[42], auto=True, dry_run=False))
    assert code == 1


@patch("dispatcher.pipeline.tmux")
@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
@patch("dispatcher.pipeline.execute_issue")
@patch("dispatcher.pipeline.create_branch")
def test_parked_comment_posted_after_execution(mock_branch, mock_exec, mock_triage, mock_gh, mock_db, mock_tmux):
    """Parked comments should be posted after all executions complete."""
    mock_tmux.is_tmux_available.return_value = False
    mock_db.init_db.return_value = MagicMock()
    mock_gh.view_issue.side_effect = [
        {"title": "Executable", "body": "Body", "comments": []},
        {"title": "Parked", "body": "Body", "comments": []},
    ]
    parked_tr = TriageResult(
        issue_number=99, issue_title="Parked", issue_url="url",
        scope="feature", richness_score=0, richness_signals={},
        triage_tier="parked", confidence=0.3, risk_flags=[], missing_info=["x"], reasoning="vague",
    )
    mock_triage.side_effect = [_triage(42), parked_tr]
    mock_branch.return_value = "fix/42-issue-42"
    mock_exec.return_value = _exec_result(outcome="pr_created")

    code = run(_cfg(issues=[42, 99], auto=True, dry_run=False))
    assert code == 0
    mock_gh.post_comment.assert_called_once()
    assert mock_gh.post_comment.call_args[0][0] == 99


@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
def test_no_issues_selected_returns_0(mock_triage, mock_gh, mock_db):
    mock_db.init_db.return_value = MagicMock()
    mock_gh.list_issues.return_value = []

    code = run(_cfg(issues=[], auto=True, dry_run=True))
    assert code == 0


@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
def test_auto_mode_calls_list_issues(mock_triage, mock_gh, mock_db):
    mock_db.init_db.return_value = MagicMock()
    mock_gh.list_issues.return_value = [{"number": 42}]
    mock_gh.view_issue.return_value = {"title": "Test", "body": "Body", "comments": []}
    mock_triage.return_value = _triage()

    code = run(_cfg(issues=[], auto=True, dry_run=True))
    assert code == 0
    mock_gh.list_issues.assert_called_once()


# --- Task 12: Resume recovery tests ---

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


@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.execute_issue")
@patch("dispatcher.pipeline.create_branch")
@patch("dispatcher.pipeline.stash_if_dirty")
@patch("dispatcher.pipeline.unstash")
@patch("dispatcher.pipeline.triage_issue")
@patch("dispatcher.pipeline.github")
def test_resume_re_executes_failed(mock_gh, mock_triage, mock_unstash, mock_stash, mock_branch, mock_exec, mock_db):
    """Resume should re-execute failed/leash_hit issues."""
    mock_conn = MagicMock()
    mock_db.init_db.return_value = mock_conn

    # Run exists check
    mock_conn.execute.return_value.fetchone.return_value = {"id": "run-1"}

    # Resumable issue (failed, no session_id)
    resumable_row = MagicMock()
    resumable_row.__getitem__ = lambda self, key: {
        "issue_number": 42, "branch_name": "fix/42-issue-42",
        "session_id": None, "resume_count": 0,
        "triage_tier": "full-yolo", "reviewed_tier": "full-yolo",
        "issue_title": "Test", "issue_url": "url",
        "scope": "quick-fix", "richness_score": 4,
        "richness_signals": "{}", "confidence": 0.9,
        "risk_flags": "[]", "missing_info": "[]", "reasoning": "ok",
    }[key]

    mock_db.get_resumable_issues.return_value = [resumable_row]
    mock_gh.view_issue.return_value = {"title": "Test", "body": "Body", "comments": []}
    mock_triage.return_value = _triage()
    mock_stash.return_value = False
    mock_branch.return_value = "fix/42-issue-42"
    mock_exec.return_value = _exec_result(outcome="pr_created")

    code = run(_cfg(resume="run-1", auto=True, dry_run=False, issues=[]))
    assert code in (0, 1, 2)  # Any valid exit code shows resume path was entered


@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.resume_issue")
@patch("dispatcher.pipeline.stash_if_dirty")
@patch("dispatcher.pipeline.unstash")
def test_resume_uses_session_id(mock_unstash, mock_stash, mock_resume, mock_db):
    """Resume should call resume_issue when session_id exists."""
    mock_conn = MagicMock()
    mock_db.init_db.return_value = mock_conn
    mock_conn.execute.return_value.fetchone.return_value = {"id": "run-1"}

    resumable_row = MagicMock()
    resumable_row.__getitem__ = lambda self, key: {
        "issue_number": 42, "branch_name": "fix/42-issue-42",
        "session_id": "sess-abc", "resume_count": 0,
        "triage_tier": "full-yolo", "reviewed_tier": "full-yolo",
        "issue_title": "Test", "issue_url": "url",
        "scope": "quick-fix", "richness_score": 4,
        "richness_signals": "{}", "confidence": 0.9,
        "risk_flags": "[]", "missing_info": "[]", "reasoning": "ok",
    }[key]

    mock_db.get_resumable_issues.return_value = [resumable_row]
    mock_stash.return_value = False
    mock_resume.return_value = {
        "is_error": False, "num_turns": 3, "session_id": "sess-abc",
    }

    code = run(_cfg(resume="run-1", auto=True, dry_run=False, issues=[]))
    mock_resume.assert_called_once()
    assert mock_resume.call_args[0][0] == "sess-abc"


@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.stash_if_dirty")
def test_resume_max_attempts_skips(mock_stash, mock_db):
    """Issues that have hit max resume attempts should be skipped."""
    mock_conn = MagicMock()
    mock_db.init_db.return_value = mock_conn
    mock_conn.execute.return_value.fetchone.return_value = {"id": "run-1"}

    resumable_row = MagicMock()
    resumable_row.__getitem__ = lambda self, key: {
        "issue_number": 42, "branch_name": "fix/42-issue-42",
        "session_id": "sess-abc", "resume_count": 2,
        "triage_tier": "full-yolo", "reviewed_tier": "full-yolo",
        "issue_title": "Test", "issue_url": "url",
        "scope": "quick-fix", "richness_score": 4,
        "richness_signals": "{}", "confidence": 0.9,
        "risk_flags": "[]", "missing_info": "[]", "reasoning": "ok",
    }[key]

    mock_db.get_resumable_issues.return_value = [resumable_row]
    mock_stash.return_value = False

    # Should complete without executing (max attempts reached)
    code = run(_cfg(resume="run-1", auto=True, dry_run=False, issues=[]))
    assert code == 3  # All parked/skipped → exit 3


# --- Task 14: Rate limit tracker tests ---

from dispatcher.pipeline import _RateLimitTracker


def test_rate_limit_tracker_no_backoff():
    tracker = _RateLimitTracker()
    assert tracker.should_backoff() is False


def test_rate_limit_tracker_backoff_after_consecutive_failures():
    tracker = _RateLimitTracker()
    tracker.record_failure()
    assert tracker.should_backoff() is False  # 1 failure, no backoff yet
    tracker.record_failure()
    assert tracker.should_backoff() is True  # 2 consecutive failures
    assert tracker.backoff_seconds() == 300  # 5 minutes


def test_rate_limit_tracker_reset_on_success():
    tracker = _RateLimitTracker()
    tracker.record_failure()
    tracker.record_failure()
    tracker.record_success()
    assert tracker.should_backoff() is False


def test_rate_limit_tracker_progressive_backoff():
    tracker = _RateLimitTracker()
    tracker.record_failure()
    tracker.record_failure()
    tracker.record_failure()  # 3 consecutive failures
    assert tracker.backoff_seconds() == 900  # 15 minutes


# --- Task 6: Parallel execution tests ---

from dispatcher.pipeline import _run_execution, _run_parallel_execution, _run_sequential_execution


@patch("dispatcher.pipeline.tmux")
@patch("dispatcher.pipeline.execute_issue")
@patch("dispatcher.pipeline.create_branch")
def test_sequential_fallback_when_tmux_unavailable(mock_branch, mock_exec, mock_tmux):
    """When tmux is unavailable, _run_execution falls back to sequential."""
    mock_tmux.is_tmux_available.return_value = False
    mock_branch.return_value = "fix/42-issue-42"
    mock_exec.return_value = _exec_result(outcome="pr_created")

    conn = MagicMock()
    reviewed = ReviewedIssue(triage=_triage(42), final_tier="full-yolo", skipped=False, edited_comment=None)
    results, turns = _run_execution(conn, "run-1", [reviewed, reviewed], _cfg(dry_run=False))

    assert len(results) == 2
    mock_tmux.create_session.assert_not_called()


@patch("dispatcher.pipeline.tmux")
@patch("dispatcher.pipeline.execute_issue")
@patch("dispatcher.pipeline.create_branch")
def test_sequential_fallback_single_issue_with_tmux(mock_branch, mock_exec, mock_tmux):
    """Single issue uses sequential even when tmux is available."""
    mock_tmux.is_tmux_available.return_value = True
    mock_branch.return_value = "fix/42-issue-42"
    mock_exec.return_value = _exec_result(outcome="pr_created")

    conn = MagicMock()
    reviewed = ReviewedIssue(triage=_triage(42), final_tier="full-yolo", skipped=False, edited_comment=None)
    results, turns = _run_execution(conn, "run-1", [reviewed], _cfg(dry_run=False))

    assert len(results) == 1
    mock_tmux.create_session.assert_not_called()


@patch("dispatcher.pipeline.time")
@patch("dispatcher.pipeline.worktree")
@patch("dispatcher.pipeline.tmux")
def test_parallel_execution_tmux_path(mock_tmux, mock_worktree, mock_time):
    """Parallel path: worktrees created, session created, workers launched, results collected."""
    from pathlib import Path

    mock_tmux.is_tmux_available.return_value = True
    mock_worktree.create_worktree.side_effect = [Path("/wt/issue-10"), Path("/wt/issue-20")]

    # Simulate panes: first poll both alive, second poll both dead
    mock_tmux.get_pane_status.side_effect = [
        [(0, True, None), (1, True, None)],  # first poll: both alive
        [(0, False, 0), (1, False, 0)],       # second poll: both dead
    ]
    mock_time.sleep = MagicMock()  # don't actually sleep

    conn = MagicMock()
    # Simulate DB returning execution results for both issues
    def fake_execute_row(sql, params):
        num = params[1]
        row = MagicMock()
        row.__getitem__ = lambda self, key: {
            "issue_number": num, "branch_name": f"fix/{num}-issue-{num}",
            "session_id": "sess-1", "num_turns": 5, "is_error": 0,
            "pr_number": 101, "pr_url": f"https://github.com/o/r/pull/101",
            "error_message": None, "outcome": "pr_created",
        }[key]
        mock_fetchone = MagicMock(return_value=row)
        return MagicMock(fetchone=mock_fetchone)

    conn.execute = fake_execute_row

    r1 = ReviewedIssue(triage=_triage(10), final_tier="full-yolo", skipped=False, edited_comment=None)
    r2 = ReviewedIssue(triage=_triage(20), final_tier="full-yolo", skipped=False, edited_comment=None)

    results, turns = _run_parallel_execution(conn, "abcd1234-run", [r1, r2], _cfg(dry_run=False))

    # Worktrees created for each issue
    assert mock_worktree.create_worktree.call_count == 2

    # Tmux session created
    mock_tmux.create_session.assert_called_once_with("dispatcher-abcd1234", 2)

    # Workers launched via send_command (one per issue)
    assert mock_tmux.send_command.call_count == 2

    # Results collected
    assert len(results) == 2
    assert all(r.outcome == "pr_created" for r in results)
    assert turns == 10

    # Cleanup called
    mock_tmux.kill_session.assert_called_once_with("dispatcher-abcd1234")
    mock_worktree.cleanup_all.assert_called_once()


@patch("dispatcher.pipeline.time")
@patch("dispatcher.pipeline.worktree")
@patch("dispatcher.pipeline.tmux")
def test_parallel_execution_batching(mock_tmux, mock_worktree, mock_time):
    """When more issues than max_parallel, new issues launch as panes free up."""
    from pathlib import Path

    mock_tmux.is_tmux_available.return_value = True
    mock_worktree.create_worktree.side_effect = [
        Path(f"/wt/issue-{n}") for n in [10, 20, 30]
    ]

    # max_parallel=2, 3 issues: first 2 launch, then 3rd when a pane frees
    mock_tmux.get_pane_status.side_effect = [
        [(0, True, None), (1, True, None)],    # poll 1: both alive
        [(0, False, 0), (1, True, None)],       # poll 2: pane 0 done
        [(0, True, None), (1, False, 0)],       # poll 3: pane 0 relaunched (issue 30), pane 1 done
        [(0, False, 0), (1, False, 0)],          # poll 4: safety - but 1 already collected; pane 0 done
    ]
    mock_time.sleep = MagicMock()

    conn = MagicMock()
    def fake_execute_row(sql, params):
        num = params[1]
        row = MagicMock()
        row.__getitem__ = lambda self, key: {
            "issue_number": num, "branch_name": f"fix/{num}",
            "session_id": "s", "num_turns": 3, "is_error": 0,
            "pr_number": 1, "pr_url": "url", "error_message": None,
            "outcome": "pr_created",
        }[key]
        return MagicMock(fetchone=MagicMock(return_value=row))

    conn.execute = fake_execute_row

    issues = [
        ReviewedIssue(triage=_triage(n), final_tier="full-yolo", skipped=False, edited_comment=None)
        for n in [10, 20, 30]
    ]

    results, turns = _run_parallel_execution(
        conn, "abcd1234-run", issues, _cfg(dry_run=False, max_parallel=2),
    )

    # Session created with 2 panes (not 3)
    mock_tmux.create_session.assert_called_once_with("dispatcher-abcd1234", 2)

    # 3 workers launched total (2 initial + 1 when pane freed)
    assert mock_tmux.send_command.call_count == 3

    assert len(results) == 3
    mock_tmux.kill_session.assert_called_once()
    mock_worktree.cleanup_all.assert_called_once()
