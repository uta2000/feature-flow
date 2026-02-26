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
    except (subprocess.SubprocessError, OSError):
        pass
    return ""


def _detect_base_branch() -> str:
    try:
        ref = subprocess.run(
            ["git", "symbolic-ref", "refs/remotes/origin/HEAD"],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        return ref.split("/")[-1] if ref else "main"
    except (subprocess.SubprocessError, OSError):
        return "main"


def _load_yaml(config_path: Path) -> dict:
    if not config_path.exists():
        return {}
    with open(config_path) as f:
        return yaml.safe_load(f) or {}


def _detect_plugin_path() -> str:
    claude_dir = Path.home() / ".claude" / "plugins" / "cache"
    if not claude_dir.exists():
        return ""
    for candidate in claude_dir.iterdir():
        if candidate.is_dir() and "feature-flow" in candidate.name:
            versions = sorted(candidate.glob("*/*/"), reverse=True)
            if versions:
                return str(versions[0])
    return ""


def _generate_config(config_path: Path) -> dict:
    plugin_path = _detect_plugin_path()
    repo = _detect_repo()
    base_branch = _detect_base_branch()

    data = {
        "plugin_path": plugin_path,
        "repo": repo,
        "base_branch": base_branch,
        "triage_model": "claude-sonnet-4-20250514",
        "execution_model": "claude-opus-4-20250514",
        "execution_max_turns": 200,
        "default_label": "dispatcher-ready",
        "selection_limit": 50,
        "db_path": "./dispatcher.db",
    }

    with open(config_path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False)

    print(f"Generated {config_path} with detected settings:")
    print(f"  repo: {repo}")
    print(f"  base_branch: {base_branch}")
    print(f"  plugin_path: {plugin_path}")
    if not plugin_path:
        print("  Warning: could not auto-detect plugin_path. Edit dispatcher.yml to set it.", file=sys.stderr)
    return data


def _parse_issues(raw: str | None) -> list[int]:
    if not raw:
        return []
    try:
        return [int(n.strip()) for n in raw.split(",")]
    except ValueError:
        print("Error: --issues must be a comma-separated list of integers (e.g. 1,2,3)", file=sys.stderr)
        sys.exit(2)


def load_config(args: argparse.Namespace) -> Config:
    config_path = Path(args.config)
    yaml_data = _load_yaml(config_path)

    if not yaml_data:
        yaml_data = _generate_config(config_path)

    plugin_path = yaml_data.get("plugin_path", "")
    if not plugin_path:
        print("Error: plugin_path is required in dispatcher.yml", file=sys.stderr)
        sys.exit(2)

    return _build_config(args, yaml_data, plugin_path)


def _build_config(args: argparse.Namespace, yaml_data: dict, plugin_path: str) -> Config:
    repo = args.repo or yaml_data.get("repo") or _detect_repo()
    return Config(
        plugin_path=plugin_path,
        repo=repo,
        base_branch=yaml_data.get("base_branch") or _detect_base_branch(),
        triage_model=yaml_data.get("triage_model", "claude-sonnet-4-20250514"),
        execution_model=yaml_data.get("execution_model", "claude-opus-4-20250514"),
        triage_max_turns=yaml_data.get("triage_max_turns", 5),
        execution_max_turns=yaml_data.get("execution_max_turns", 200),
        max_resume_attempts=yaml_data.get("max_resume_attempts", 2),
        db_path=yaml_data.get("db_path", "./dispatcher.db"),
        branch_prefix_fix=yaml_data.get("branch_prefix_fix", "fix"),
        branch_prefix_feat=yaml_data.get("branch_prefix_feat", "feat"),
        default_label=args.label or yaml_data.get("default_label", "dispatcher-ready"),
        selection_limit=args.limit or yaml_data.get("selection_limit", 50),
        rate_limit_pause_seconds=yaml_data.get("rate_limit_pause_seconds", 300),
        rate_limit_batch_pause_seconds=yaml_data.get("rate_limit_batch_pause_seconds", 900),
        max_parallel=args.max_parallel or yaml_data.get("max_parallel", 4),
        issues=_parse_issues(args.issues),
        auto=args.auto,
        dry_run=args.dry_run,
        resume=args.resume or "",
        verbose=args.verbose,
    )
