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

    pr_number = None
    pr_url = None
    try:
        prs = github.list_prs(branch_name, config.repo)
        if prs:
            pr_number = prs[0]["number"]
            pr_url = prs[0]["url"]
    except github.GithubError:
        pass  # PR verification is non-fatal

    if pr_number:
        if reviewed.final_tier == "supervised-yolo":
            try:
                github.add_label(pr_number, "needs-human-review", config.repo)
            except github.GithubError:
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
