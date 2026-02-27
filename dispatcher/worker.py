from __future__ import annotations

import argparse
import json
import sys

from dispatcher import db
from dispatcher.execute import create_branch, execute_issue
from dispatcher.models import Config, ReviewedIssue, TriageResult


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Execute a single dispatcher issue")
    parser.add_argument("--issue-json", help="ReviewedIssue as JSON string")
    parser.add_argument("--issue-file", help="Path to file containing ReviewedIssue JSON")
    parser.add_argument("--config-json", help="Config fields as JSON string")
    parser.add_argument("--config-file", help="Path to file containing Config JSON")
    parser.add_argument("--run-id", required=True, help="Dispatcher run ID")
    parser.add_argument("--db-path", required=True, help="Path to SQLite DB")
    return parser.parse_args(argv)


def _build_reviewed(data: dict) -> ReviewedIssue:
    tr_data = data["triage"]
    tr = TriageResult(**tr_data)
    return ReviewedIssue(
        triage=tr,
        final_tier=data["final_tier"],
        skipped=data.get("skipped", False),
        edited_comment=data.get("edited_comment"),
    )


def _build_config(data: dict) -> Config:
    return Config(**{k: v for k, v in data.items() if k in Config.__dataclass_fields__})


def run_worker(
    issue_data: dict, config_data: dict, run_id: str, db_path: str,
) -> int:
    reviewed = _build_reviewed(issue_data)
    config = _build_config(config_data)
    conn = db.init_db(db_path)

    try:
        branch = create_branch(reviewed.triage.issue_number, reviewed.triage.scope, config)
    except Exception as exc:
        print(f"Branch creation failed: {exc}")
        conn.close()
        return 1

    interactive = sys.stdout.isatty()
    er = execute_issue(reviewed, branch, config, interactive=interactive)
    db.update_issue_execution(conn, run_id, reviewed.triage.issue_number, er)
    conn.close()

    if er.outcome in ("pr_created", "pr_created_review"):
        print(f"[#{reviewed.triage.issue_number}] {branch} -> PR #{er.pr_number}")
        return 0
    elif er.outcome == "leash_hit":
        print(f"[#{reviewed.triage.issue_number}] Hit turn limit ({er.num_turns} turns)")
        return 1
    else:
        msg = er.error_message or f"No PR created (outcome: {er.outcome})"
        print(f"[#{reviewed.triage.issue_number}] Failed: {msg}")
        return 1


def _load_json(inline: str | None, filepath: str | None, label: str) -> dict:
    if filepath:
        from pathlib import Path
        return json.loads(Path(filepath).read_text())
    if inline:
        return json.loads(inline)
    raise SystemExit(f"Must provide --{label}-json or --{label}-file")


def main() -> None:
    args = parse_args()

    try:
        issue_data = _load_json(args.issue_json, args.issue_file, "issue")
    except (json.JSONDecodeError, TypeError, FileNotFoundError) as exc:
        print(f"Invalid issue data: {exc}")
        sys.exit(1)

    try:
        config_data = _load_json(args.config_json, args.config_file, "config")
    except (json.JSONDecodeError, TypeError, FileNotFoundError) as exc:
        print(f"Invalid config data: {exc}")
        sys.exit(1)

    code = run_worker(issue_data, config_data, args.run_id, args.db_path)
    sys.exit(code)


if __name__ == "__main__":
    main()
