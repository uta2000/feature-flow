from __future__ import annotations

import shutil
import subprocess


def is_tmux_available() -> bool:
    return shutil.which("tmux") is not None


def create_session(name: str) -> None:
    """Create a detached tmux session with remain-on-exit enabled."""
    subprocess.run(
        ["tmux", "new-session", "-d", "-s", name],
        capture_output=True, text=True, timeout=10, check=True,
    )
    subprocess.run(
        ["tmux", "set-option", "-t", name, "remain-on-exit", "on"],
        capture_output=True, text=True, timeout=10, check=True,
    )


def launch_in_pane(session_name: str, pane_index: int, command: str) -> int:
    """Launch a command as the pane's process so pane_dead fires on exit.

    For pane 0 (the initial pane created with the session), uses respawn-pane.
    For additional panes, uses split-window to create a new pane.
    Returns the pane index of the launched command.
    """
    if pane_index == 0:
        # Pane 0 already exists from create_session; replace its shell
        subprocess.run(
            ["tmux", "respawn-pane", "-t", f"{session_name}:0.0", "-k", command],
            capture_output=True, text=True, timeout=10, check=True,
        )
        return 0
    else:
        # Create a new pane with the command as its process
        result = subprocess.run(
            [
                "tmux", "split-window", "-t", session_name,
                "-PF", "#{pane_index}", command,
            ],
            capture_output=True, text=True, timeout=10, check=True,
        )
        subprocess.run(
            ["tmux", "select-layout", "-t", session_name, "tiled"],
            capture_output=True, text=True, timeout=10,
        )
        return int(result.stdout.strip())


def respawn_pane(session_name: str, pane_index: int, command: str) -> None:
    """Respawn a dead pane with a new command (for batching)."""
    subprocess.run(
        ["tmux", "respawn-pane", "-t", f"{session_name}:0.{pane_index}", command],
        capture_output=True, text=True, timeout=10, check=True,
    )


def send_keys(session_name: str, pane_index: int, text: str, enter: bool = True) -> None:
    """Send keystrokes to a pane. Use -l for literal text, then optionally Enter."""
    cmd = ["tmux", "send-keys", "-t", f"{session_name}:0.{pane_index}", "-l", text]
    subprocess.run(cmd, capture_output=True, text=True, timeout=10, check=True)
    if enter:
        subprocess.run(
            ["tmux", "send-keys", "-t", f"{session_name}:0.{pane_index}", "Enter"],
            capture_output=True, text=True, timeout=10, check=True,
        )


def get_pane_status(session_name: str) -> list[tuple[int, bool, int | None]]:
    result = subprocess.run(
        [
            "tmux", "list-panes", "-t", session_name,
            "-F", "#{pane_index} #{pane_dead} #{pane_dead_status}",
        ],
        capture_output=True, text=True, timeout=10,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return []
    statuses: list[tuple[int, bool, int | None]] = []
    for line in result.stdout.strip().splitlines():
        parts = line.split()
        idx = int(parts[0])
        is_dead = parts[1] == "1"
        exit_code = int(parts[2]) if is_dead and len(parts) > 2 else None
        is_alive = not is_dead
        statuses.append((idx, is_alive, exit_code))
    return statuses


def kill_session(session_name: str) -> None:
    subprocess.run(
        ["tmux", "kill-session", "-t", session_name],
        capture_output=True, text=True, timeout=10,
    )
