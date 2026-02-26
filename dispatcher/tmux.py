from __future__ import annotations

import shutil
import subprocess


def is_tmux_available() -> bool:
    return shutil.which("tmux") is not None


def create_session(name: str, num_panes: int) -> None:
    subprocess.run(
        ["tmux", "new-session", "-d", "-s", name],
        capture_output=True, text=True, timeout=10, check=True,
    )
    subprocess.run(
        ["tmux", "set-option", "-t", name, "remain-on-exit", "on"],
        capture_output=True, text=True, timeout=10, check=True,
    )
    for _ in range(num_panes - 1):
        subprocess.run(
            ["tmux", "split-window", "-t", name],
            capture_output=True, text=True, timeout=10, check=True,
        )
    subprocess.run(
        ["tmux", "select-layout", "-t", name, "tiled"],
        capture_output=True, text=True, timeout=10, check=True,
    )


def send_command(session_name: str, pane_index: int, command: str) -> None:
    subprocess.run(
        ["tmux", "send-keys", "-t", f"{session_name}:{pane_index}", command, "Enter"],
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
