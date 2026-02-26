import subprocess
from unittest.mock import patch

from dispatcher.tmux import (
    create_session,
    get_pane_status,
    is_tmux_available,
    kill_session,
    send_command,
)


class TestIsTmuxAvailable:
    @patch("dispatcher.tmux.shutil.which", return_value="/usr/bin/tmux")
    def test_available(self, mock_which):
        assert is_tmux_available() is True

    @patch("dispatcher.tmux.shutil.which", return_value=None)
    def test_not_available(self, mock_which):
        assert is_tmux_available() is False


class TestCreateSession:
    @patch("dispatcher.tmux.subprocess.run")
    def test_creates_session_with_panes(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        create_session("disp-abc", 3)
        calls = mock_run.call_args_list
        # First call: new-session
        assert "new-session" in calls[0][0][0]
        # Should have split-window calls for panes 2 and 3
        split_calls = [c for c in calls if "split-window" in str(c)]
        assert len(split_calls) == 2
        # Should set remain-on-exit and tiled layout
        all_args = str(calls)
        assert "remain-on-exit" in all_args
        assert "tiled" in all_args

    @patch("dispatcher.tmux.subprocess.run")
    def test_single_pane_no_splits(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        create_session("disp-abc", 1)
        split_calls = [c for c in mock_run.call_args_list if "split-window" in str(c)]
        assert len(split_calls) == 0


class TestSendCommand:
    @patch("dispatcher.tmux.subprocess.run")
    def test_sends_keys(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        send_command("disp-abc", 0, "echo hello")
        cmd = mock_run.call_args[0][0]
        assert "send-keys" in cmd
        assert "echo hello" in cmd


class TestGetPaneStatus:
    @patch("dispatcher.tmux.subprocess.run")
    def test_parses_pane_output(self, mock_run):
        # Format: pane_index, pane_dead (0/1), pane_dead_status (exit code)
        mock_run.return_value = subprocess.CompletedProcess(
            [], 0, "0 0 \n1 1 0\n2 1 1\n", "",
        )
        statuses = get_pane_status("disp-abc")
        assert statuses[0] == (0, True, None)   # alive
        assert statuses[1] == (1, False, 0)      # dead, exit 0
        assert statuses[2] == (2, False, 1)      # dead, exit 1

    @patch("dispatcher.tmux.subprocess.run")
    def test_returns_empty_on_error(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 1, "", "no session")
        statuses = get_pane_status("nonexistent")
        assert statuses == []


class TestKillSession:
    @patch("dispatcher.tmux.subprocess.run")
    def test_kills_session(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        kill_session("disp-abc")
        cmd = mock_run.call_args[0][0]
        assert "kill-session" in cmd
        assert "disp-abc" in cmd
