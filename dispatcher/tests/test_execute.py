import json
import subprocess
from unittest.mock import MagicMock, patch

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
            subprocess.CompletedProcess([], 0, "M file.py\n", ""),
            subprocess.CompletedProcess([], 0, "", ""),
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


class TestBuildInteractivePrompt:
    def test_prompt_uses_start_prefix(self):
        from dispatcher.execute import build_interactive_prompt
        tr = _triage(42)
        prompt = build_interactive_prompt(tr, "fix/42-issue-42")
        assert prompt.startswith("start:")
        assert "#42" in prompt
        assert "fix/42-issue-42" in prompt


class TestRunClaudeInteractive:
    @patch("dispatcher.execute.subprocess.run")
    def test_interactive_mode_no_p_flag_no_prompt(self, mock_run):
        """Interactive mode should NOT use -p and should NOT embed the prompt
        (prompt is sent separately via tmux send-keys)."""
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        from dispatcher.execute import _run_claude
        tr = _triage()
        _run_claude(tr, "fix/42-test", _cfg(), interactive=True)

        cmd = mock_run.call_args[0][0]
        assert "-p" not in cmd, "Interactive mode must not use -p flag"
        assert "--output-format" not in cmd, "Interactive mode must not use --output-format"
        assert "--max-turns" not in cmd, "Interactive mode must not use --max-turns (print-mode only)"
        assert "claude" == cmd[0]
        assert "--dangerously-skip-permissions" in cmd
        # Prompt should NOT be in the command (sent via send_keys instead)
        prompt_args = [a for a in cmd if "issue" in a.lower() and "start" in a.lower()]
        assert len(prompt_args) == 0, "Prompt must not be in interactive command"

    @patch("dispatcher.execute.subprocess.run")
    def test_headless_mode_uses_p_flag(self, mock_run):
        """Non-interactive mode should use -p with --output-format json."""
        mock_run.return_value = subprocess.CompletedProcess([], 0, "{}", "")
        from dispatcher.execute import _run_claude
        tr = _triage()
        _run_claude(tr, "fix/42-test", _cfg(), interactive=False)

        cmd = mock_run.call_args[0][0]
        assert "-p" in cmd
        assert "--output-format" in cmd
        assert "--max-turns" in cmd

    @patch("dispatcher.execute.github")
    @patch("dispatcher.execute.subprocess.run")
    def test_interactive_determines_outcome_from_git(self, mock_run, mock_gh):
        """Interactive execute_issue should check for PR via git state."""
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        mock_gh.list_prs.return_value = [{"number": 100, "url": "https://pr/100"}]

        ri = ReviewedIssue(triage=_triage(), final_tier="full-yolo", skipped=False, edited_comment=None)
        er = execute_issue(ri, "fix/42-test", _cfg(), interactive=True)
        assert er.outcome == "pr_created"
        assert er.pr_number == 100


class TestGenerateParkedComment:
    def test_template(self):
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
