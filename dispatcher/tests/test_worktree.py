# dispatcher/tests/test_worktree.py
import subprocess
from pathlib import Path
from unittest.mock import patch

from dispatcher.worktree import cleanup_all, create_worktree, remove_worktree


class TestCreateWorktree:
    @patch("dispatcher.worktree.subprocess.run")
    def test_creates_worktree_at_correct_path(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        repo_root = Path("/repo")
        path = create_worktree(42, "main", repo_root)
        assert path == repo_root / ".dispatcher-worktrees" / "issue-42"
        mock_run.assert_called_once()
        cmd = mock_run.call_args[0][0]
        assert cmd[0:3] == ["git", "worktree", "add"]
        assert str(path) in cmd
        assert "main" in cmd

    @patch("dispatcher.worktree.subprocess.run")
    def test_raises_on_failure(self, mock_run):
        mock_run.side_effect = subprocess.CalledProcessError(1, "git")
        import pytest
        with pytest.raises(subprocess.CalledProcessError):
            create_worktree(42, "main", Path("/repo"))


class TestRemoveWorktree:
    @patch("dispatcher.worktree.subprocess.run")
    def test_removes_worktree(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        remove_worktree(Path("/repo/.dispatcher-worktrees/issue-42"))
        cmd = mock_run.call_args[0][0]
        assert "remove" in cmd
        assert "--force" in cmd


class TestCleanupAll:
    @patch("dispatcher.worktree.shutil.rmtree")
    @patch("dispatcher.worktree.subprocess.run")
    def test_prunes_and_removes_dir(self, mock_run, mock_rmtree):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        repo_root = Path("/repo")
        cleanup_all(repo_root)
        mock_run.assert_called_once()
        assert "prune" in mock_run.call_args[0][0]
        mock_rmtree.assert_called_once_with(
            repo_root / ".dispatcher-worktrees", ignore_errors=True,
        )
