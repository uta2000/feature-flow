# Dispatcher Parallel Execution via tmux

## Problem

The dispatcher resolves issues sequentially — each `claude -p` Opus call (up to 200 turns) must complete before the next starts. With multiple issues, total wall-clock time scales linearly.

## Solution

Replace the sequential `for` loop in `_run_execution()` with a tmux-based parallel orchestrator. Each issue gets its own git worktree and tmux pane. A coordinator polls for completion and queues new issues as panes free up.

## Architecture

```
[Triage] → [Review] → [Create tmux session]
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
               [pane 0]  [pane 1]  [pane 2]  ... up to max_parallel
               worktree  worktree  worktree
               claude -p claude -p claude -p
                    │         │         │
                    └─────────┼─────────┘
                              ▼
                     [Coordinator polls]
                     [SQLite for results]
                              ▼
                       [Print summary]
```

Triage, review, parked comments, and summary remain sequential and unchanged.

## New Components

### `dispatcher/worker.py` — Standalone Issue Executor

Invoked inside each tmux pane:

```
python -m dispatcher.worker \
  --issue-json '<ReviewedIssue as JSON>' \
  --config-json '<Config as JSON>' \
  --run-id "abc-123" \
  --db-path "./dispatcher.db"
```

Steps:
1. Deserialize `ReviewedIssue` and `Config` from JSON args
2. Create branch via `git checkout -b ...` (inside its worktree)
3. Run `claude -p` (reuses `execute_issue()` from `execute.py`)
4. Write `ExecutionResult` to SQLite
5. Exit 0 (success) or 1 (failed/leash_hit)

### `dispatcher/worktree.py` — Git Worktree Helpers

```python
create_worktree(issue_number, base_branch) -> Path
    # Creates .dispatcher-worktrees/issue-{N} from base_branch

remove_worktree(path) -> None
    # git worktree remove <path> --force

cleanup_all() -> None
    # Remove .dispatcher-worktrees/ and git worktree prune
```

- Worktrees live in `.dispatcher-worktrees/` at repo root (gitignored)
- Lightweight — shares `.git` object store
- Branch creation happens inside the worktree by the worker

### `dispatcher/tmux.py` — tmux Session Management

```python
create_session(run_id, num_panes) -> str
    # tmux new-session + split-window + select-layout tiled

send_command(session_name, pane_index, command) -> None
    # tmux send-keys to a specific pane

is_pane_alive(session_name, pane_index) -> bool
    # Check pane process status

get_pane_exit_code(session_name, pane_index) -> int | None
    # Read exit code from finished pane (remain-on-exit)

kill_session(session_name) -> None
    # tmux kill-session
```

Panes use `remain-on-exit on` so exit codes can be read after worker completion.

## Modified Components

### `pipeline.py` — `_run_execution()` Rewrite

New flow:
1. Create worktrees for all issues (no more stash/unstash)
2. Build tmux session, launch initial batch (up to `max_parallel`)
3. Attach user to tmux session (panes visible)
4. Coordinator polls every 5s:
   - Check which panes finished
   - Read results from SQLite
   - Launch next queued issue into free pane
   - Print progress: `[3/7 complete] #42 PR created | #55 running...`
5. Detach, cleanup worktrees, kill tmux session
6. Collect `ExecutionResult`s from SQLite, return as before

Resume (`_resume_run()`) also gets parallel treatment.

### `models.py` — Config

Add `max_parallel: int = 4`.

### `db.py` — WAL Mode

Enable `PRAGMA journal_mode=WAL` for safe concurrent writes from multiple workers.

### `__main__.py` — CLI

Add `--max-parallel N` flag.

## Error Handling

- **Worker crash:** Writes `failed` to SQLite, exits 1. Other workers unaffected.
- **Turn leash hit:** Records `leash_hit` with `session_id` for resume.
- **tmux not installed:** Falls back to existing sequential loop with warning.
- **Single issue:** Skips tmux, runs inline.
- **Rate limiting:** Backoff applies only when deciding whether to launch next queued issue into a free pane. Running workers are never paused.
- **Interrupt (SIGINT/SIGTERM):** Signal handler kills tmux session, cleans up worktrees. Leftover worktrees from hard crash cleaned by `git worktree prune`.

## Testing

- **Unit:** Mock subprocess for worktree, tmux, and worker CLI parsing
- **Integration:** Mock `claude -p` with fast-exit stub; verify worktree creation, pane count, SQLite results, cleanup, and queuing when `len(issues) > max_parallel`
- **Manual:** Run with 2-3 trivial issues to verify pane layout and live output

## File Change Summary

| Component | Change |
|---|---|
| `dispatcher/worker.py` | New — standalone entrypoint |
| `dispatcher/worktree.py` | New — git worktree helpers |
| `dispatcher/tmux.py` | New — tmux session lifecycle |
| `dispatcher/pipeline.py` | Modified — parallel `_run_execution()` |
| `dispatcher/models.py` | Modified — add `max_parallel` |
| `dispatcher/db.py` | Modified — enable WAL mode |
| `dispatcher/__main__.py` | Modified — add `--max-parallel` flag |
