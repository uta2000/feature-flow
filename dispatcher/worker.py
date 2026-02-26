from __future__ import annotations

import argparse
import json
import sys

from dispatcher import db
from dispatcher.execute import create_branch, execute_issue
from dispatcher.models import Config, ReviewedIssue, TriageResult


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Execute a single dispatcher issue")
    parser.add_argument("--issue-json", required=True, help="ReviewedIssue as JSON")
    parser.add_argument("--config-json", required=True, help="Config fields as JSON")
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

    er = execute_issue(reviewed, branch, config)
    db.update_issue_execution(conn, run_id, reviewed.triage.issue_number, er)
    conn.close()

    if er.outcome in ("pr_created", "pr_created_review"):
        print(f"[#{reviewed.triage.issue_number}] {branch} -> PR #{er.pr_number}")
        return 0
    elif er.outcome == "leash_hit":
        print(f"[#{reviewed.triage.issue_number}] Hit turn limit ({er.num_turns} turns)")
        return 1
    else:
        print(f"[#{reviewed.triage.issue_number}] Failed: {er.error_message}")
        return 1


def main() -> None:
    args = parse_args()

    try:
        issue_data = json.loads(args.issue_json)
    except (json.JSONDecodeError, TypeError):
        print(f"Invalid --issue-json: {args.issue_json[:200]}")
        sys.exit(1)

    try:
        config_data = json.loads(args.config_json)
    except (json.JSONDecodeError, TypeError):
        print(f"Invalid --config-json: {args.config_json[:200]}")
        sys.exit(1)

    code = run_worker(issue_data, config_data, args.run_id, args.db_path)
    sys.exit(code)


if __name__ == "__main__":
    main()
