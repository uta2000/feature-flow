import subprocess
from unittest.mock import patch

from dispatcher.tmux import (
    create_session,
    get_pane_status,
    is_tmux_available,
    kill_session,
    launch_in_pane,
    respawn_pane,
    send_keys,
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
    def test_creates_session(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        create_session("disp-abc")
        calls = mock_run.call_args_list
        assert len(calls) == 2
        assert "new-session" in calls[0][0][0]
        assert "remain-on-exit" in str(calls[1])


class TestLaunchInPane:
    @patch("dispatcher.tmux.subprocess.run")
    def test_pane_0_uses_respawn(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        idx = launch_in_pane("disp-abc", 0, "echo hello")
        assert idx == 0
        cmd = mock_run.call_args[0][0]
        assert "respawn-pane" in cmd
        assert "echo hello" in cmd

    @patch("dispatcher.tmux.subprocess.run")
    def test_pane_1_uses_split_window(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "1\n", "")
        idx = launch_in_pane("disp-abc", 1, "echo hello")
        assert idx == 1
        # First call: split-window, second call: select-layout
        split_cmd = mock_run.call_args_list[0][0][0]
        assert "split-window" in split_cmd
        assert "echo hello" in split_cmd


class TestRespawnPane:
    @patch("dispatcher.tmux.subprocess.run")
    def test_respawns_dead_pane(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        respawn_pane("disp-abc", 2, "echo hello")
        cmd = mock_run.call_args[0][0]
        assert "respawn-pane" in cmd
        assert "disp-abc:0.2" in cmd
        assert "echo hello" in cmd


class TestGetPaneStatus:
    @patch("dispatcher.tmux.subprocess.run")
    def test_parses_pane_output(self, mock_run):
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


class TestSendKeys:
    @patch("dispatcher.tmux.subprocess.run")
    def test_sends_literal_text_and_enter(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        send_keys("disp-abc", 0, "start: issue #42")
        calls = mock_run.call_args_list
        assert len(calls) == 2
        # First call: literal text with -l flag
        text_cmd = calls[0][0][0]
        assert "send-keys" in text_cmd
        assert "-l" in text_cmd
        assert "start: issue #42" in text_cmd
        # Second call: Enter key
        enter_cmd = calls[1][0][0]
        assert "Enter" in enter_cmd

    @patch("dispatcher.tmux.subprocess.run")
    def test_sends_without_enter(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        send_keys("disp-abc", 1, "some text", enter=False)
        calls = mock_run.call_args_list
        assert len(calls) == 1  # Only text, no Enter


class TestKillSession:
    @patch("dispatcher.tmux.subprocess.run")
    def test_kills_session(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess([], 0, "", "")
        kill_session("disp-abc")
        cmd = mock_run.call_args[0][0]
        assert "kill-session" in cmd
        assert "disp-abc" in cmd
