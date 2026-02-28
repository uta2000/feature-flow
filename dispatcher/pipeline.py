from __future__ import annotations

import json
import sys
import time
import uuid

from dataclasses import asdict
from pathlib import Path

from dispatcher import db, github, tmux, worktree
from dispatcher.execute import (
    build_interactive_prompt,
    create_branch,
    execute_issue,
    generate_parked_comment,
    resume_issue,
    stash_if_dirty,
    unstash,
)
from dispatcher.github import GithubError
from dispatcher.models import Config, ExecutionResult, ReviewedIssue, TriageResult
from dispatcher.triage import TriageError, triage_issue


class _RateLimitTracker:
    _BACKOFF_SCHEDULE = [300, 900]  # 5 min, 15 min

    def __init__(self) -> None:
        self._consecutive_failures = 0

    def record_failure(self) -> None:
        self._consecutive_failures += 1

    def record_success(self) -> None:
        self._consecutive_failures = 0

    def should_backoff(self) -> bool:
        return self._consecutive_failures >= 2

    def backoff_seconds(self) -> int:
        idx = min(self._consecutive_failures - 2, len(self._BACKOFF_SCHEDULE) - 1)
        return self._BACKOFF_SCHEDULE[max(0, idx)]


def run(config: Config) -> int:
    if config.resume:
        return _resume_run(config)

    start_time = time.time()
    conn = db.init_db(config.db_path)
    run_id = str(uuid.uuid4())

    selected_numbers = _select_issues(conn, config)
    if selected_numbers is None:
        return 0
    if not selected_numbers:
        print("No issues selected.")
        return 0

    db.insert_run(conn, run_id, selected_numbers, "{}")

    triage_results = _run_triage(conn, run_id, selected_numbers, config)
    if not triage_results:
        db.update_run_status(conn, run_id, "failed")
        return 1

    triage_results.sort(key=lambda t: t.confidence, reverse=True)
    return _review_and_execute(conn, run_id, triage_results, start_time, config)


def _review_and_execute(conn, run_id: str, triage_results: list[TriageResult], start_time: float, config: Config) -> int:
    reviewed = _run_review(triage_results, config)
    if reviewed is None:
        db.update_run_status(conn, run_id, "cancelled")
        return 0

    to_execute = [r for r in reviewed if not r.skipped and r.final_tier != "parked"]
    parked = [r for r in reviewed if r.final_tier == "parked" and not r.skipped]

    if not to_execute and not config.dry_run:
        _post_parked_comments(parked, config)
        db.update_run_status(conn, run_id, "completed")
        return 3

    if config.dry_run:
        print("\nDry run — skipping execution.")
        db.update_run_status(conn, run_id, "completed")
        return 0

    results, total_turns = _run_execution(conn, run_id, to_execute, config)
    _post_parked_comments(parked, config)
    _print_summary(results, parked, to_execute, total_turns, start_time, config)

    failed_count = sum(1 for er in results if er.outcome in ("failed", "leash_hit"))
    db.update_run_status(conn, run_id, "completed" if failed_count == 0 else "failed")
    return 0 if failed_count == 0 else 1


def _select_issues(conn, config: Config) -> list[int] | None:
    if config.issues:
        return config.issues

    issues = github.list_issues(config.default_label, config.selection_limit, config.repo)

    if config.auto:
        return [i["number"] for i in issues]

    parked_numbers: set[int] = set()
    for issue in issues:
        prev = db.get_previous_triage(conn, issue["number"])
        if prev and prev["triage_tier"] == "parked":
            parked_numbers.add(issue["number"])

    from dispatcher.tui.selection import SelectionApp

    app = SelectionApp(issues=issues, parked_numbers=parked_numbers, label=config.default_label)
    selected = app.run()
    return selected if selected else None


def _run_triage(conn, run_id: str, selected_numbers: list[int], config: Config) -> list[TriageResult]:
    triage_results = []
    for number in selected_numbers:
        try:
            issue_data = github.view_issue(number, config.repo)
        except GithubError as exc:
            print(f"  Error fetching #{number}: {exc}. Skipping.")
            continue

        try:
            tr = triage_issue(issue_data, number, f"https://github.com/{config.repo}/issues/{number}", config)
        except TriageError as exc:
            print(f"  Triage error for #{number}: {exc}. Skipping.")
            continue

        triage_results.append(tr)
        db.insert_issue(conn, run_id, tr)
        print(f"  #{number}: {tr.issue_title} → {tr.triage_tier} ({tr.confidence:.2f})")
    return triage_results


def _run_review(triage_results: list[TriageResult], config: Config) -> list[ReviewedIssue] | None:
    if config.auto:
        return [
            ReviewedIssue(triage=tr, final_tier=tr.triage_tier, skipped=False, edited_comment=None)
            for tr in triage_results
        ]

    from dispatcher.tui.review import ReviewApp

    app = ReviewApp(triage_results=triage_results)
    reviewed = app.run()
    return reviewed if reviewed else None


def _run_execution(
    conn, run_id: str, to_execute: list[ReviewedIssue], config: Config
) -> tuple[list[ExecutionResult], int]:
    if tmux.is_tmux_available() and len(to_execute) > 1:
        return _run_parallel_execution(conn, run_id, to_execute, config)
    return _run_sequential_execution(conn, run_id, to_execute, config)


def _run_sequential_execution(
    conn, run_id: str, to_execute: list[ReviewedIssue], config: Config
) -> tuple[list[ExecutionResult], int]:
    results = []
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
        tmux.create_session(session_name)

        # Build serialized config
        config_json = json.dumps({k: v for k, v in asdict(config).items()})
        db_path = str(Path(config.db_path).resolve())

        # Launch initial batch
        queue = list(enumerate(to_execute))
        pane_assignments: dict[int, int] = {}
        for pane_idx in range(num_panes):
            qi, reviewed = queue.pop(0)
            cmd = _build_worker_cmd(worktree_paths[qi], reviewed, config_json, run_id, db_path)
            actual_idx = tmux.launch_in_pane(session_name, pane_idx, cmd)
            pane_assignments[actual_idx] = qi

        # Wait for workers to create branches and start claude, then send prompts
        time.sleep(5)
        for pane_idx, qi in pane_assignments.items():
            reviewed = to_execute[qi]
            branch_prefix = config.branch_prefix_fix if reviewed.triage.scope in ("quick-fix",) else config.branch_prefix_feat
            branch_name = f"{branch_prefix}/{reviewed.triage.issue_number}-issue-{reviewed.triage.issue_number}"
            prompt = build_interactive_prompt(reviewed.triage, branch_name)
            # Set model to Sonnet before sending the start prompt
            tmux.send_keys(session_name, pane_idx, "/model sonnet")
            time.sleep(2)
            tmux.send_keys(session_name, pane_idx, prompt)

        print(f"\n  Interactive sessions launched in tmux session '{session_name}'.")
        print(f"  Run `tmux attach -t {session_name}` to interact with each pane.")
        print(f"  Use Ctrl-B + arrow keys to switch panes. Sessions close when you exit Claude.\n")

        # Poll for completion
        results = _poll_for_completion(
            conn, run_id, session_name, to_execute, queue,
            worktree_paths, pane_assignments, config_json, db_path, config,
        )
    except KeyboardInterrupt:
        print("\n  Interrupted. Cleaning up...")
        results = []
    finally:
        try:
            tmux.kill_session(session_name)
        except Exception:
            pass
        worktree.cleanup_all(repo_root)

    total_turns = sum(r.num_turns for r in results)
    return results, total_turns


def _build_worker_cmd(
    wt_path: Path,
    reviewed: ReviewedIssue,
    config_json: str,
    run_id: str,
    db_path: str,
) -> str:
    import sys
    import tempfile
    issue_fd = tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", prefix=f"issue-{reviewed.triage.issue_number}-", delete=False,
    )
    issue_fd.write(json.dumps(asdict(reviewed)))
    issue_fd.close()
    config_fd = tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", prefix="config-", delete=False,
    )
    config_fd.write(config_json)
    config_fd.close()
    python = sys.executable
    project_root = str(Path(__file__).resolve().parent.parent)
    return (
        f"cd {wt_path} &&"
        f" unset CLAUDECODE CLAUDE_CODE_SSE_PORT CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS &&"
        f" PYTHONPATH={project_root}:$PYTHONPATH exec {python} -m dispatcher.worker"
        f" --issue-file {issue_fd.name}"
        f" --config-file {config_fd.name}"
        f" --run-id {run_id}"
        f" --db-path {db_path}"
    )


def _poll_for_completion(
    conn,
    run_id: str,
    session_name: str,
    to_execute: list[ReviewedIssue],
    queue: list[tuple[int, ReviewedIssue]],
    worktree_paths: list[Path],
    pane_assignments: dict[int, int],
    config_json: str,
    db_path: str,
    config: Config | None = None,
) -> list[ExecutionResult]:
    results: list[ExecutionResult] = []
    completed_indices: set[int] = set()

    while len(results) < len(to_execute):
        time.sleep(5)
        statuses = tmux.get_pane_status(session_name)

        for pane_idx, is_alive, exit_code in statuses:
            if pane_idx not in pane_assignments:
                continue
            if is_alive:
                continue

            qi = pane_assignments.pop(pane_idx)
            if qi in completed_indices:
                continue
            completed_indices.add(qi)

            reviewed = to_execute[qi]
            er = _read_result_from_db(conn, run_id, reviewed.triage.issue_number)
            if er is None:
                er = ExecutionResult(
                    issue_number=reviewed.triage.issue_number,
                    branch_name="",
                    session_id=None,
                    num_turns=0,
                    is_error=True,
                    pr_number=None,
                    pr_url=None,
                    error_message=f"Worker exited with code {exit_code}",
                    outcome="failed",
                )
            results.append(er)
            _print_execution_result(
                reviewed.triage.issue_number, er.branch_name, er,
            )

            # Launch next queued issue into freed pane
            if queue:
                next_qi, next_reviewed = queue.pop(0)
                cmd = _build_worker_cmd(
                    worktree_paths[next_qi], next_reviewed, config_json, run_id, db_path,
                )
                tmux.respawn_pane(session_name, pane_idx, cmd)
                pane_assignments[pane_idx] = next_qi
                # Send prompt after worker starts claude
                if config is not None:
                    time.sleep(5)
                    tr = next_reviewed.triage
                    prefix = config.branch_prefix_fix if tr.scope in ("quick-fix",) else config.branch_prefix_feat
                    branch = f"{prefix}/{tr.issue_number}-issue-{tr.issue_number}"
                    # Set model to Sonnet before sending the start prompt
                    tmux.send_keys(session_name, pane_idx, "/model sonnet")
                    time.sleep(2)
                    tmux.send_keys(session_name, pane_idx, build_interactive_prompt(tr, branch))

        # Safety: if no panes are assigned and queue is empty, break
        if not pane_assignments and not queue:
            break

    return results


def _read_result_from_db(conn, run_id: str, issue_number: int) -> ExecutionResult | None:
    row = conn.execute(
        "SELECT * FROM issues WHERE run_id = ? AND issue_number = ?",
        (run_id, issue_number),
    ).fetchone()
    if row is None:
        return None
    # Only return if worker has written execution results
    if row["outcome"] is None:
        return None
    return ExecutionResult(
        issue_number=row["issue_number"],
        branch_name=row["branch_name"] or "",
        session_id=row["session_id"],
        num_turns=row["num_turns"] or 0,
        is_error=bool(row["is_error"]),
        pr_number=row["pr_number"],
        pr_url=row["pr_url"],
        error_message=row["error_message"],
        outcome=row["outcome"],
    )


def _execute_single_issue(conn, run_id: str, r: ReviewedIssue, config: Config) -> ExecutionResult:
    print(f"\n  [#{r.triage.issue_number}] Executing...")
    try:
        branch = create_branch(r.triage.issue_number, r.triage.scope, config)
    except Exception as exc:
        print(f"  Branch creation failed for #{r.triage.issue_number}: {exc}")
        er = ExecutionResult(
            issue_number=r.triage.issue_number, branch_name="",
            session_id=None, num_turns=0, is_error=True,
            pr_number=None, pr_url=None,
            error_message=f"Branch creation failed: {exc}", outcome="failed",
        )
        db.update_issue_execution(conn, run_id, r.triage.issue_number, er)
        return er

    er = execute_issue(r, branch, config, interactive=sys.stdout.isatty())
    db.update_issue_execution(conn, run_id, r.triage.issue_number, er)
    _print_execution_result(r.triage.issue_number, branch, er)
    return er


def _post_parked_comments(parked: list[ReviewedIssue], config: Config) -> None:
    for r in parked:
        comment = r.edited_comment or generate_parked_comment(r.triage)
        try:
            github.post_comment(r.triage.issue_number, comment, config.repo)
        except Exception as exc:
            print(f"  Warning: Failed to post comment on #{r.triage.issue_number}: {exc}")


def _print_execution_result(issue_number: int, branch: str, er: ExecutionResult) -> None:
    if er.outcome in ("pr_created", "pr_created_review"):
        print(f"  [#{issue_number}] {branch} → PR #{er.pr_number} created")
    elif er.outcome == "leash_hit":
        print(f"  [#{issue_number}] Hit turn limit ({er.num_turns} turns). Use --resume to continue.")
    else:
        print(f"  [#{issue_number}] Failed: {er.error_message}")


def _print_summary(
    results: list[ExecutionResult],
    parked: list[ReviewedIssue],
    to_execute: list[ReviewedIssue],
    total_turns: int,
    start_time: float,
    config: Config,
) -> None:
    duration = time.time() - start_time
    pr_count = sum(1 for er in results if er.outcome in ("pr_created", "pr_created_review"))
    budget = len(to_execute) * config.execution_max_turns
    print(
        f"\nRun complete. {pr_count} PRs created, {len(parked)} parked. "
        f"Duration: {duration / 60:.0f}m. Turns used: {total_turns}/{budget}"
    )


# --- Task 12: Resume recovery ---

def _resume_run(config: Config) -> int:
    try:
        conn = db.init_db(config.db_path)
    except Exception as exc:
        print(f"Error opening DB: {exc}")
        return 2

    row = conn.execute("SELECT * FROM runs WHERE id = ?", (config.resume,)).fetchone()
    if not row:
        print(f"Run '{config.resume}' not found in DB.")
        return 2

    resumable = db.get_resumable_issues(conn, config.resume)
    if not resumable:
        print("No resumable issues found.")
        return 3

    stashed = stash_if_dirty()
    results = _execute_resumable(conn, config.resume, resumable, config)
    if stashed:
        unstash()

    if not results:
        return 3
    failed = sum(1 for er in results if er.outcome in ("failed", "leash_hit"))
    return 0 if failed == 0 else 1


def _build_reviewed_from_row(row) -> ReviewedIssue:
    tr = TriageResult(
        issue_number=row["issue_number"],
        issue_title=row["issue_title"],
        issue_url=row["issue_url"],
        scope=row["scope"] or "quick-fix",
        richness_score=row["richness_score"] or 0,
        richness_signals=json.loads(row["richness_signals"] or "{}"),
        triage_tier=row["triage_tier"] or "full-yolo",
        confidence=row["confidence"] or 0.5,
        risk_flags=json.loads(row["risk_flags"] or "[]"),
        missing_info=json.loads(row["missing_info"] or "[]"),
        reasoning=row["reasoning"] or "",
    )
    final_tier = row["reviewed_tier"] or row["triage_tier"] or "full-yolo"
    return ReviewedIssue(triage=tr, final_tier=final_tier, skipped=False, edited_comment=None)


def _execute_resumable(conn, run_id: str, resumable, config: Config) -> list[ExecutionResult]:
    results = []
    for row in resumable:
        issue_number = row["issue_number"]
        resume_count = row["resume_count"] or 0

        if resume_count >= config.max_resume_attempts:
            print(f"  #{issue_number}: max resume attempts reached ({resume_count}). Skipping.")
            continue

        session_id = row["session_id"]
        branch = row["branch_name"] or f"fix/{issue_number}-issue-{issue_number}"

        er = _resume_single(row, session_id, branch, run_id, conn, config)
        if er:
            results.append(er)
    return results


def _resume_single(row, session_id, branch, run_id, conn, config: Config) -> ExecutionResult | None:
    issue_number = row["issue_number"]
    if session_id:
        raw = resume_issue(session_id, config)
        er = _parse_resume_result(issue_number, branch, raw, config)
    else:
        reviewed = _build_reviewed_from_row(row)
        try:
            branch = create_branch(issue_number, reviewed.triage.scope, config)
        except Exception as exc:
            print(f"  Branch creation failed for #{issue_number}: {exc}")
            return None
        er = execute_issue(reviewed, branch, config)

    db.increment_resume_count(conn, run_id, issue_number)
    db.update_issue_execution(conn, run_id, issue_number, er)
    _print_execution_result(issue_number, branch, er)
    return er


def _parse_resume_result(issue_number: int, branch: str, raw: dict, config: Config) -> ExecutionResult:
    is_error = raw.get("is_error", True)
    num_turns = raw.get("num_turns", 0)
    session_id = raw.get("session_id")

    if is_error:
        return ExecutionResult(
            issue_number=issue_number, branch_name=branch,
            session_id=session_id, num_turns=num_turns, is_error=True,
            pr_number=None, pr_url=None, error_message="resume failed", outcome="failed",
        )

    from dispatcher.execute import _classify_outcome, _find_pr

    pr_number, pr_url = _find_pr(branch, config)
    outcome = _classify_outcome(pr_number, num_turns, "full-yolo", config)
    return ExecutionResult(
        issue_number=issue_number, branch_name=branch,
        session_id=session_id, num_turns=num_turns, is_error=False,
        pr_number=pr_number, pr_url=pr_url, error_message=None, outcome=outcome,
    )
