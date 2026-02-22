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
