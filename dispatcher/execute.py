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
            print(f"  Warning: branch conflict, using fallback name: {branch_name}")
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
    if not result.stdout.strip():
        return False
    push_result = subprocess.run(
        ["git", "stash", "push", "-m", "dispatcher-auto-stash"],
        capture_output=True, text=True, timeout=30,
    )
    if push_result.returncode != 0:
        raise RuntimeError(f"git stash push failed: {push_result.stderr.strip()}")
    return True


def unstash() -> None:
    subprocess.run(
        ["git", "stash", "pop"],
        capture_output=True, text=True, timeout=30,
    )


def _run_claude(tr: TriageResult, branch_name: str, config: Config) -> subprocess.CompletedProcess:
    prompt = f"Start a feature for GitHub issue #{tr.issue_number} in YOLO mode. Issue title: {tr.issue_title}. Work on branch {branch_name}."
    return subprocess.run(
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


def _error_result(issue_number: int, branch_name: str, message: str, **kw) -> ExecutionResult:
    defaults = {"session_id": None, "num_turns": 0, "pr_number": None, "pr_url": None}
    defaults.update(kw)
    return ExecutionResult(
        issue_number=issue_number, branch_name=branch_name,
        is_error=True, error_message=message, outcome="failed", **defaults,
    )


def _parse_claude_output(stdout: str, issue_number: int, branch_name: str) -> dict | ExecutionResult:
    try:
        outer = json.loads(stdout)
    except (json.JSONDecodeError, TypeError):
        return _error_result(issue_number, branch_name, f"Invalid JSON: {stdout[:200]}")

    if outer.get("is_error", False):
        return _error_result(
            issue_number, branch_name, "claude -p reported error",
            session_id=outer.get("session_id"), num_turns=outer.get("num_turns", 0),
        )
    return outer


def _determine_outcome(reviewed: ReviewedIssue, branch_name: str, outer: dict, config: Config) -> ExecutionResult:
    tr = reviewed.triage
    num_turns = outer.get("num_turns", 0)
    session_id = outer.get("session_id")
    pr_number, pr_url = _find_pr(branch_name, config)
    outcome = _classify_outcome(pr_number, num_turns, reviewed.final_tier, config)

    return ExecutionResult(
        issue_number=tr.issue_number, branch_name=branch_name,
        session_id=session_id, num_turns=num_turns, is_error=False,
        pr_number=pr_number, pr_url=pr_url, error_message=None, outcome=outcome,
    )


def _find_pr(branch_name: str, config: Config) -> tuple[int | None, str | None]:
    try:
        prs = github.list_prs(branch_name, config.repo)
        if prs:
            return prs[0]["number"], prs[0]["url"]
    except github.GithubError as exc:
        print(f"  Warning: PR lookup failed: {exc}")
    return None, None


def _classify_outcome(pr_number: int | None, num_turns: int, final_tier: str, config: Config) -> str:
    if not pr_number:
        return "leash_hit" if num_turns >= config.execution_max_turns else "failed"
    if final_tier == "supervised-yolo":
        _try_add_review_label(pr_number, config)
        return "pr_created_review"
    return "pr_created"


def _try_add_review_label(pr_number: int, config: Config) -> None:
    try:
        github.add_label(pr_number, "needs-human-review", config.repo)
    except github.GithubError as exc:
        print(f"  Warning: Failed to add review label to PR #{pr_number}: {exc}")


def execute_issue(reviewed: ReviewedIssue, branch_name: str, config: Config) -> ExecutionResult:
    tr = reviewed.triage
    try:
        result = _run_claude(tr, branch_name, config)
    except Exception as exc:
        return _error_result(tr.issue_number, branch_name, str(exc))

    parsed = _parse_claude_output(result.stdout, tr.issue_number, branch_name)
    if isinstance(parsed, ExecutionResult):
        return parsed
    return _determine_outcome(reviewed, branch_name, parsed, config)


def resume_issue(session_id: str, config: Config) -> dict:
    try:
        result = subprocess.run(
            [
                "claude", "--plugin-dir", config.plugin_path,
                "--resume", session_id,
                "--model", config.execution_model,
                "--output-format", "json",
            ],
            capture_output=True, text=True,
            timeout=config.execution_max_turns * 120,
        )
    except subprocess.TimeoutExpired:
        return {"is_error": True, "error": "resume timed out"}
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
