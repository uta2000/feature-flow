from __future__ import annotations

import argparse
import sys


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="dispatcher",
        description="Batch-process GitHub issues through feature-flow YOLO mode",
    )
    parser.add_argument("--issues", type=str, default=None, help="Comma-separated issue numbers (skips selection TUI)")
    parser.add_argument("--label", type=str, default=None, help="Label filter for selection")
    parser.add_argument("--repo", type=str, default=None, help="GitHub repo owner/repo")
    parser.add_argument("--auto", action="store_true", help="Skip all TUIs")
    parser.add_argument("--config", type=str, default=".dispatcher/config.yml", help="Config file path")
    parser.add_argument("--dry-run", action="store_true", help="Triage + TUIs only, no execution")
    parser.add_argument("--resume", type=str, default=None, help="Resume a previous run by run ID")
    parser.add_argument("--limit", type=int, default=None, help="Max issues in selection TUI")
    parser.add_argument("--verbose", action="store_true", help="Print full claude -p output")
    parser.add_argument("--max-parallel", type=int, default=None, help="Max parallel executions (default: 4)")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    from dispatcher.config import load_config
    from dispatcher.pipeline import run

    config = load_config(args)
    exit_code = run(config)
    sys.exit(exit_code)
