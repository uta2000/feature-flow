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
