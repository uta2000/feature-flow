from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

_WORKTREE_DIR = ".dispatcher-worktrees"


def create_worktree(issue_number: int, base_branch: str, repo_root: Path) -> Path:
    path = repo_root / _WORKTREE_DIR / f"issue-{issue_number}"
    subprocess.run(
        ["git", "worktree", "add", str(path), base_branch],
        capture_output=True, text=True, timeout=30, check=True,
    )
    return path


def remove_worktree(path: Path) -> None:
    subprocess.run(
        ["git", "worktree", "remove", str(path), "--force"],
        capture_output=True, text=True, timeout=30,
    )


def cleanup_all(repo_root: Path) -> None:
    subprocess.run(
        ["git", "worktree", "prune"],
        capture_output=True, text=True, timeout=30,
    )
    shutil.rmtree(repo_root / _WORKTREE_DIR, ignore_errors=True)
