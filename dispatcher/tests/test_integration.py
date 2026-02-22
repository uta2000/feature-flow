import json
import sqlite3
from unittest.mock import patch

from dispatcher.models import Config
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
    db_path = str(tmp_path / "test.db")

    config = Config(
        plugin_path="/test/path", repo="owner/repo", db_path=db_path,
        issues=[42], auto=True, dry_run=True,
    )

    code = run(config)
    assert code == 0

    # Verify DB was populated
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM issues").fetchall()
    assert len(rows) == 1
    assert rows[0]["issue_number"] == 42
    assert rows[0]["triage_tier"] == "full-yolo"
    conn.close()


@patch("dispatcher.pipeline.github")
@patch("dispatcher.triage.subprocess.run", side_effect=_mock_triage_subprocess)
def test_full_dry_run_multiple_issues(mock_sub, mock_gh, tmp_path):
    mock_gh.view_issue.side_effect = _mock_gh_view
    db_path = str(tmp_path / "test.db")

    config = Config(
        plugin_path="/test/path", repo="owner/repo", db_path=db_path,
        issues=[42, 43], auto=True, dry_run=True,
    )

    code = run(config)
    assert code == 0

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM issues ORDER BY issue_number").fetchall()
    assert len(rows) == 2
    conn.close()
