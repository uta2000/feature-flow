import json
from unittest.mock import MagicMock, patch

import pytest

from dispatcher.models import ExecutionResult


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

    @patch("dispatcher.worker.db")
    @patch("dispatcher.worker.create_branch")
    def test_branch_creation_failure_exits_1(self, mock_branch, mock_db):
        from dispatcher.worker import run_worker
        mock_branch.side_effect = Exception("branch exists")
        mock_db.init_db.return_value = MagicMock()

        code = run_worker(
            _sample_issue_dict(), _sample_config_dict(), "run-1", "/tmp/test.db",
        )
        assert code == 1

    @patch("dispatcher.worker.db")
    @patch("dispatcher.worker.execute_issue")
    @patch("dispatcher.worker.create_branch")
    def test_leash_hit_exits_1(self, mock_branch, mock_exec, mock_db):
        from dispatcher.worker import run_worker
        mock_branch.return_value = "fix/42-issue-42"
        mock_exec.return_value = ExecutionResult(
            issue_number=42, branch_name="fix/42-issue-42",
            session_id="s1", num_turns=200, is_error=False,
            pr_number=None, pr_url=None, error_message=None, outcome="leash_hit",
        )
        mock_db.init_db.return_value = MagicMock()

        code = run_worker(
            _sample_issue_dict(), _sample_config_dict(), "run-1", "/tmp/test.db",
        )
        assert code == 1

    @patch("dispatcher.worker.db")
    @patch("dispatcher.worker.execute_issue")
    @patch("dispatcher.worker.create_branch")
    def test_pr_created_review_exits_0(self, mock_branch, mock_exec, mock_db):
        from dispatcher.worker import run_worker
        mock_branch.return_value = "fix/42-issue-42"
        mock_exec.return_value = ExecutionResult(
            issue_number=42, branch_name="fix/42-issue-42",
            session_id="s1", num_turns=10, is_error=False,
            pr_number=101, pr_url="url", error_message=None, outcome="pr_created_review",
        )
        mock_db.init_db.return_value = MagicMock()

        code = run_worker(
            _sample_issue_dict(), _sample_config_dict(), "run-1", "/tmp/test.db",
        )
        assert code == 0


class TestWorkerMain:
    @patch("dispatcher.worker.run_worker", return_value=0)
    def test_main_with_valid_json(self, mock_run):
        from dispatcher.worker import main
        with patch("dispatcher.worker.parse_args") as mock_parse:
            mock_parse.return_value = MagicMock(
                issue_json=json.dumps(_sample_issue_dict()),
                issue_file=None,
                config_json=json.dumps(_sample_config_dict()),
                config_file=None,
                run_id="run-1",
                db_path="/tmp/test.db",
            )
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 0

    def test_main_with_invalid_issue_json(self):
        from dispatcher.worker import main
        with patch("dispatcher.worker.parse_args") as mock_parse:
            mock_parse.return_value = MagicMock(
                issue_json="not-valid-json",
                issue_file=None,
                config_json=json.dumps(_sample_config_dict()),
                config_file=None,
                run_id="run-1",
                db_path="/tmp/test.db",
            )
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 1
