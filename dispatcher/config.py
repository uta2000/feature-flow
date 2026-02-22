from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import yaml

from dispatcher.models import Config


def _detect_repo() -> str:
    try:
        url = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        if url.endswith(".git"):
            url = url[:-4]
        if "github.com" in url:
            parts = url.split("github.com")[-1].strip("/:")
            return parts
    except Exception:
        pass
    return ""


def _detect_base_branch() -> str:
    try:
        ref = subprocess.run(
            ["git", "symbolic-ref", "refs/remotes/origin/HEAD"],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        return ref.split("/")[-1] if ref else "main"
    except Exception:
        return "main"


def load_config(args: argparse.Namespace) -> Config:
    yaml_data: dict = {}
    config_path = Path(args.config)
    if config_path.exists():
        with open(config_path) as f:
            yaml_data = yaml.safe_load(f) or {}

    plugin_path = yaml_data.get("plugin_path", "")
    if not plugin_path:
        print("Error: plugin_path is required in dispatcher.yml", file=sys.stderr)
        sys.exit(2)

    repo = args.repo or yaml_data.get("repo") or _detect_repo()
    base_branch = yaml_data.get("base_branch") or _detect_base_branch()
    label = args.label or yaml_data.get("default_label", "dispatcher-ready")
    limit = args.limit or yaml_data.get("selection_limit", 50)

    issues: list[int] = []
    if args.issues:
        issues = [int(n.strip()) for n in args.issues.split(",")]

    return Config(
        plugin_path=plugin_path,
        repo=repo,
        base_branch=base_branch,
        triage_model=yaml_data.get("triage_model", "claude-sonnet-4-20250514"),
        execution_model=yaml_data.get("execution_model", "claude-opus-4-20250514"),
        triage_max_turns=yaml_data.get("triage_max_turns", 1),
        execution_max_turns=yaml_data.get("execution_max_turns", 200),
        max_resume_attempts=yaml_data.get("max_resume_attempts", 2),
        db_path=yaml_data.get("db_path", "./dispatcher.db"),
        branch_prefix_fix=yaml_data.get("branch_prefix_fix", "fix"),
        branch_prefix_feat=yaml_data.get("branch_prefix_feat", "feat"),
        default_label=label,
        selection_limit=limit,
        rate_limit_pause_seconds=yaml_data.get("rate_limit_pause_seconds", 300),
        rate_limit_batch_pause_seconds=yaml_data.get("rate_limit_batch_pause_seconds", 900),
        issues=issues,
        auto=args.auto,
        dry_run=args.dry_run,
        resume=args.resume or "",
        verbose=args.verbose,
    )
