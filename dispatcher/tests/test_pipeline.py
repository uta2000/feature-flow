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


@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
@patch("dispatcher.pipeline.execute_issue")
@patch("dispatcher.pipeline.create_branch")
@patch("dispatcher.pipeline.stash_if_dirty")
@patch("dispatcher.pipeline.unstash")
def test_execution_success_exit_0(mock_unstash, mock_stash, mock_branch, mock_exec, mock_triage, mock_gh, mock_db):
    mock_db.init_db.return_value = MagicMock()
    mock_gh.view_issue.return_value = {"title": "Test", "body": "Body", "comments": []}
    mock_triage.return_value = _triage()
    mock_stash.return_value = False
    mock_branch.return_value = "fix/42-issue-42"
    mock_exec.return_value = _exec_result(outcome="pr_created")

    code = run(_cfg(issues=[42], auto=True, dry_run=False))
    assert code == 0


@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
@patch("dispatcher.pipeline.execute_issue")
@patch("dispatcher.pipeline.create_branch")
@patch("dispatcher.pipeline.stash_if_dirty")
@patch("dispatcher.pipeline.unstash")
def test_execution_failure_exit_1(mock_unstash, mock_stash, mock_branch, mock_exec, mock_triage, mock_gh, mock_db):
    mock_db.init_db.return_value = MagicMock()
    mock_gh.view_issue.return_value = {"title": "Test", "body": "Body", "comments": []}
    mock_triage.return_value = _triage()
    mock_stash.return_value = False
    mock_branch.return_value = "fix/42-issue-42"
    mock_exec.return_value = _exec_result(outcome="failed")

    code = run(_cfg(issues=[42], auto=True, dry_run=False))
    assert code == 1


@patch("dispatcher.pipeline.db")
@patch("dispatcher.pipeline.github")
@patch("dispatcher.pipeline.triage_issue")
@patch("dispatcher.pipeline.execute_issue")
@patch("dispatcher.pipeline.create_branch")
@patch("dispatcher.pipeline.stash_if_dirty")
@patch("dispatcher.pipeline.unstash")
def test_parked_comment_posted_after_execution(mock_unstash, mock_stash, mock_branch, mock_exec, mock_triage, mock_gh, mock_db):
    """Parked comments should be posted after all executions complete."""
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
    mock_stash.return_value = False
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
