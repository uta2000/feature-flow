# GitHub Issue Dispatcher — Design Document

**Date:** 2026-02-22
**Status:** Draft

## Overview

The dispatcher is a Python CLI tool that processes GitHub issues through feature-flow's YOLO mode. It fetches open issues by label, presents them in a Textual TUI for selection, triages each via a lightweight `claude -p` Sonnet call, shows triage results in a second TUI for human review, then executes approved issues sequentially via `claude -p` Opus subprocess calls. All results are logged to SQLite for resume recovery and historical analysis.

## Example

**Default flow (interactive):**

```
$ python -m dispatcher
Fetching open issues labeled "dispatcher-ready"... 7 found.

[Selection TUI — user checks issues with Space, confirms with Enter]

Triaging 4 selected issues...
  #43: Fix null check in login → Full YOLO (0.97)
  #42: Add CSV export → Full YOLO (0.92)
  #51: Add loading spinner → Full YOLO (0.88)
  #47: Build notification system → Parked (0.34)

[Review TUI — user approves, overrides tiers, or skips]

Executing 3 issues (1 parked)...
  [#43] fix/43-null-check-login → PR #102 created
  [#42] feat/42-csv-export → PR #103 created
  [#51] feat/51-loading-spinner → PR #104 created
  [#47] Clarification comment posted

Run complete. 3 PRs created, 1 parked. Duration: 47m. Turns used: 312/600
```

**Power-user flow:** `python -m dispatcher --issues 42,43` skips selection TUI.
**Fully unattended:** `python -m dispatcher --auto` skips both TUIs.

## User Flow

### Step 1 — Issue Selection

The user runs `python -m dispatcher`. The tool fetches open issues matching the configured label (`dispatcher-ready`) via `gh issue list` and presents them in a Textual `SelectionList` TUI. The user toggles issues with Space, confirms with Enter. When `--issues` is provided, this step is skipped entirely. When `--auto` is passed without `--issues`, all labeled issues are auto-selected.

### Step 2 — Triage

For each selected issue, the dispatcher fetches the full issue data via `gh issue view` and runs a single `claude -p` call with Sonnet (`--max-turns 1`, `--output-format json`, `--json-schema`). The response is parsed into a `TriageResult` dataclass. The dispatcher validates the model's tier assignment against the scope/richness matrix and overrides if inconsistent. Issues are then sorted by confidence (descending).

### Step 3 — Triage Review

All triage results are presented in a Textual `DataTable` TUI. The user can override tiers (cycle with `t`), skip issues (`s`), edit clarification comments for parked issues (`c`), approve all (`a`), or execute (`x`). A detail view (Enter) shows the full issue body, triage reasoning, richness signals, risk flags, missing info, the current tier assignment (editable via `t` within the detail view), and clarification comment preview for parked issues (editable via `c`). When a previously-parked issue is re-triaged, the detail view also shows the previous triage result for comparison. When `--auto` is passed, this step is skipped — all triage results are accepted as-is and execution begins immediately.

### Step 4 — Execution

For each approved issue (sequential, confidence-descending order): create a git branch from the base branch, run `claude -p` with Opus and `--plugin-dir` pointing to feature-flow, parse the JSON output for outcome detection (`is_error`, `num_turns`, `session_id`), verify PR creation via `gh pr list`. Supervised YOLO PRs get a `needs-human-review` label. For parked issues, post the clarification comment via `gh issue comment` after all executions complete.

### Step 5 — Logging

All triage and execution results are written to SQLite. A summary is printed to the terminal with PR counts, parked issues, duration, and turn usage in the format `Turns used: N/M` where N is the sum of all issues' `num_turns` and M is the total budget (approved issues × `execution_max_turns`).

## Pipeline / Architecture

### Five-Stage Pipeline

```
Selection → Triage → Review → Execution → Logging
 (TUI)     (claude   (TUI)   (claude -p   (SQLite)
            -p                + feature-
            Sonnet)           flow Opus)
```

### Project Structure

```
dispatcher/
├── __init__.py
├── __main__.py          # Entry: python -m dispatcher
├── cli.py               # argparse only — parses args, calls pipeline.run()
├── pipeline.py          # Orchestrates the 5 stages, manages DB writes at stage boundaries
├── config.py            # YAML + CLI args + defaults → Config dataclass
├── models.py            # TriageResult, ReviewedIssue, ExecutionResult dataclasses
├── db.py                # SQLite operations (init, insert, update, query)
├── github.py            # gh CLI wrapper (issue list, issue view, pr list, issue comment)
├── triage.py            # claude -p triage call + tier matrix validation
├── execute.py           # claude -p execution, branch management, resume (calls github.py for PR ops)
├── tui/
│   ├── __init__.py
│   ├── selection.py     # SelectionApp: issue selection with SelectionList
│   └── review.py        # ReviewApp: triage review with DataTable + detail panel
└── tests/
    ├── conftest.py      # Shared fixtures (mock subprocess, in-memory SQLite)
    ├── test_cli.py
    ├── test_pipeline.py
    ├── test_config.py
    ├── test_models.py
    ├── test_db.py
    ├── test_github.py
    ├── test_triage.py
    ├── test_execute.py
    └── test_tui/
        ├── test_selection.py
        └── test_review.py
```

### Component Boundaries

| Component | Input | Output | External Calls |
|-----------|-------|--------|----------------|
| `cli.py` | sys.argv | `Config` + parsed args | None (parses args, delegates to `pipeline.py`) |
| `pipeline.py` | `Config`, parsed args | Exit code | None (orchestrates modules, manages DB writes at stage boundaries) |
| `config.py` | CLI args + YAML file | `Config` dataclass | File I/O |
| `github.py` | Issue numbers, labels | Issue data, PR info | `gh` CLI via `subprocess.run` |
| `triage.py` | Issue data, Config | `TriageResult` | `claude -p` via `subprocess.run` |
| `tui/selection.py` | List of issues | Selected issue numbers | None |
| `tui/review.py` | List of `TriageResult` | List of `ReviewedIssue` | None |
| `execute.py` | `ReviewedIssue`, Config | `ExecutionResult` | `claude -p`, `git` via `subprocess.run`; calls `github.py` for PR verification, labeling, and comment posting |
| `db.py` | Run/issue data | Query results | SQLite via `sqlite3` stdlib |

## Data Model Changes

### SQLite Schema (new database — `dispatcher.db`)

**`runs` table:** Tracks each dispatcher invocation.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `started_at` | TEXT | ISO 8601 |
| `finished_at` | TEXT | ISO 8601, NULL if running |
| `issue_list` | TEXT | JSON array of issue numbers |
| `config` | TEXT | JSON snapshot of dispatcher config |
| `status` | TEXT | `running`, `completed`, `failed`, `cancelled` |

**`issues` table:** Tracks each issue processed within a run.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `run_id` | TEXT FK | References `runs.id` |
| `issue_number` | INTEGER | GitHub issue number |
| `issue_title` | TEXT | Issue title |
| `issue_url` | TEXT | GitHub URL |
| `scope` | TEXT | `quick-fix`, `small-enhancement`, `feature`, `major-feature` |
| `richness_score` | INTEGER | 0–4 |
| `richness_signals` | TEXT | JSON object of 4 booleans |
| `triage_tier` | TEXT | `full-yolo`, `supervised-yolo`, `parked` |
| `confidence` | REAL | 0.0–1.0 |
| `risk_flags` | TEXT | JSON array |
| `missing_info` | TEXT | JSON array |
| `triage_reasoning` | TEXT | Model's reasoning |
| `reviewed_tier` | TEXT | Final tier after user review |
| `skipped` | INTEGER | 0 or 1 |
| `branch_name` | TEXT | Git branch |
| `session_id` | TEXT | claude -p session ID for `--resume` |
| `num_turns` | INTEGER | Turns used |
| `is_error` | INTEGER | 0 or 1 |
| `pr_number` | INTEGER | PR number if created |
| `pr_url` | TEXT | PR URL |
| `error_message` | TEXT | Error details |
| `outcome` | TEXT | `pr_created`, `pr_created_review`, `parked`, `failed`, `leash_hit`, `skipped` |
| `clarification_comment` | TEXT | Comment for parked issues |
| `comment_posted` | INTEGER | 0 or 1 |
| `resume_count` | INTEGER | Number of resume attempts |
| `triage_started_at` | TEXT | Timestamp |
| `triage_finished_at` | TEXT | Timestamp |
| `exec_started_at` | TEXT | Timestamp |
| `exec_finished_at` | TEXT | Timestamp |

Indexes on `run_id`, `outcome`, and `issue_number`.

## API / Integration

### External CLI Dependencies

| Tool | Usage | Error Behavior |
|------|-------|----------------|
| `gh issue list` | Fetch labeled issues for selection TUI | Exit code 2 if `gh` not found or not authenticated |
| `gh issue view` | Fetch full issue data before triage | Log error, skip issue |
| `gh pr list` | Verify PR creation after execution | Log warning if verification fails |
| `gh issue comment` | Post clarification comments on parked issues | Log warning, continue |
| `gh pr edit` | Add `needs-human-review` label to supervised PRs | Log warning, continue |
| `claude -p` | Triage (Sonnet) and execution (Opus) | Detect via `is_error` field in JSON output |
| `git` | Branch creation, checkout, status, stash | Stash dirty tree, handle existing branches |

### Triage Call Specification

```
claude -p "${TRIAGE_PROMPT}" \
  --model claude-sonnet-4-20250514 \
  --output-format json \
  --json-schema '${TRIAGE_SCHEMA}' \
  --max-turns 1
```

The triage prompt interpolates `${TITLE}`, `${BODY}`, and `${COMMENTS}` from `gh issue view`. The JSON schema enforces: `scope`, `richness_score`, `richness_signals`, `triage_tier`, `confidence`, `risk_flags`, `missing_info`, `reasoning`. The field is named `triage_tier` consistently across the JSON schema, dataclasses, and SQLite schema (the PRD's `yolo_tier` is renamed for clarity — the tier describes triage output, not just YOLO eligibility).

### Execution Call Specification

```
claude --plugin-dir ${PLUGIN_PATH} \
  -p "Start a feature for GitHub issue #${N} in YOLO mode. ..." \
  --model claude-opus-4-20250514 \
  --allowedTools "Skill,Read,Write,Edit,Bash,Glob,Grep,WebFetch,WebSearch,Task,ToolSearch,AskUserQuestion,EnterPlanMode,ExitPlanMode,TaskCreate,TaskGet,TaskUpdate,TaskList" \
  --max-turns ${MAX_TURNS} \
  --output-format json
```

### Tier Routing Matrix

| Scope | Richness < 3 | Richness ≥ 3 |
|-------|-------------|---------------|
| Quick fix | Full YOLO | Full YOLO |
| Small enhancement | Full YOLO | Full YOLO |
| Feature | Parked | Full YOLO |
| Major feature | Parked | Supervised YOLO |

The dispatcher validates the model's tier assignment against this matrix and overrides if inconsistent.

## New Components

### TUI: SelectionApp (`tui/selection.py`)

Built with Textual's `SelectionList` widget. Each item shows issue number, title, labels, age, and a `↻ parked` indicator for previously-parked issues (queried from SQLite). Previously parked issues are neither auto-selected nor auto-deselected — the user decides. Bindings: Space (toggle), Enter (confirm), `a` (select all), `q` (quit, exit code 0), ↑/↓ (navigate). The app returns the list of selected issue numbers. If no issues match the label, displays "No open issues with label X found." and exits with code 0.

### TUI: ReviewApp (`tui/review.py`)

Built with Textual's `DataTable` widget for the main table (columns: #, Issue, Tier, Confidence, Flags). A collapsible detail panel shows full triage information when Enter is pressed, including editable tier and comment fields. Bindings: ↑/↓ (navigate), Enter (toggle detail view), `t` (cycle tier: Full YOLO → Supervised YOLO → Parked → Full YOLO), `s` (skip issue), `c` (edit clarification comment via Textual `TextArea` — parked issues only), `a` (approve all and jump to execute confirmation), `x` (execute with current approvals), `q` (quit, cancel run). Returns a list of `ReviewedIssue` with final tiers and comments. Requires Textual ≥ 0.47 for `TextArea` widget (used in comment editing).

### Dataclasses (`models.py`)

- `Config` — all configuration values (CLI args + YAML + defaults)
- `TriageResult` — parsed triage response (scope, richness_score, richness_signals, triage_tier, confidence, risk_flags, missing_info, reasoning)
- `ReviewedIssue` — triage result + user overrides (final_tier, skipped, edited_comment)
- `ExecutionResult` — outcome of execution (branch, session_id, turns, is_error, pr_number, pr_url, outcome)

### Configuration (`config.py`)

Loads `dispatcher.yml` via `pyyaml`, merges with CLI args (argparse), fills gaps with auto-detected defaults (git remote for repo, git default branch for base_branch). Returns a `Config` dataclass. Precedence: CLI args > YAML > auto-detected.

## Parked Issue Comment Template

When an issue is triaged as `parked`, the dispatcher generates a structured clarification comment:

```markdown
## Automated Triage — Clarification Needed

This issue was reviewed for automated processing but needs more detail before work can begin.

### What's Missing

- [ ] ${MISSING_ITEM_1}
- [ ] ${MISSING_ITEM_2}

### What Would Help

${SUGGESTIONS_FROM_REASONING}

---

*Once the above information is added, this issue will be re-evaluated on the next dispatcher run.*
*Posted by [feature-flow dispatcher](https://github.com/uta2000/feature-flow)*
```

The `missing_info` array from the triage response populates the checklist. The `reasoning` field informs the "What Would Help" section. In the Review TUI, `c` opens the comment in a `TextArea` for editing before posting. In `--auto` mode, comments are posted using the auto-generated text without user review.

Clarification comments are posted **after all executions complete** to avoid orphaned comments if the run is interrupted.

## Error Handling Strategy

| Error | Detection | Recovery |
|-------|-----------|----------|
| Turn limit hit | `num_turns == max_turns` and `is_error == false` | Check if PR was created anyway (some issues complete on last turn). If no PR, log as `leash_hit`, eligible for `--resume`. Print: `"Issue #N hit the turn limit (M turns). Branch B has partial work. Use --resume to continue."` |
| Subprocess failure | `is_error == true` or non-zero exit | Log as `failed`, eligible for `--resume`. Continue to next issue. |
| Branch exists | `git checkout -b` fails | Checkout existing branch or create with `-2` suffix |
| Dirty working tree | `git status --porcelain` non-empty | `git stash push`, restore after batch |
| Rate limit | Rate limit error from `claude -p` | Pause 5 min, retry once; after 2 consecutive, pause 15 min |
| `gh` failure | Non-zero exit from `gh` commands | Log warning, continue (non-fatal for comments/labels) |
| Resume | `--resume RUN_ID` | Validate: DB must exist (exit 2: `"No dispatcher database found at ${DB_PATH}. Nothing to resume."`), run ID must exist (exit 2: `"Run ${RUN_ID} not found."`). Re-execute failed/leash-hit issues with `session_id` via `claude -p --resume SESSION_ID`, max 2 attempts. Issues without `session_id` (pre-triage failures) are re-triaged from scratch. |
| Subprocess timeout | `claude -p` exceeds configurable timeout | For execution calls, no hard timeout (runs can legitimately take 30-60 min). For triage calls (`--max-turns 1`), timeout after 120 seconds. `gh` and `git` calls timeout after 30 seconds. |

## Configuration

### `dispatcher.yml`

```yaml
plugin_path: /Users/you/projects/feature-flow
repo: owner/repo              # Optional, auto-detected from git remote
base_branch: main             # Optional, auto-detected
triage_model: claude-sonnet-4-20250514
execution_model: claude-opus-4-20250514
triage_max_turns: 1
execution_max_turns: 200
max_resume_attempts: 2
db_path: ./dispatcher.db
branch_prefix_fix: fix
branch_prefix_feat: feat
default_label: dispatcher-ready
selection_limit: 50
rate_limit_pause_seconds: 300
rate_limit_batch_pause_seconds: 900
```

### CLI Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--issues` | — | Comma-separated issue numbers (skips selection TUI) |
| `--label` | `dispatcher-ready` | Label filter for selection |
| `--repo` | Auto-detected | GitHub repo `owner/repo` |
| `--auto` | `false` | Skip all TUIs |
| `--config` | `dispatcher.yml` | Config file path |
| `--dry-run` | `false` | Triage + TUIs only, no execution |
| `--resume` | — | Resume a previous run by run ID |
| `--limit` | `50` | Max issues in selection TUI |
| `--verbose` | `false` | Print full `claude -p` output |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All approved issues processed successfully |
| 1 | One or more issues failed |
| 2 | Configuration or argument error |
| 3 | All issues were parked (nothing to execute) |

## Migration Requirements

1. Create `dispatcher/` package directory with `__init__.py` and `__main__.py`
2. Create `pyproject.toml` at project root with `[project]` metadata, dependencies (`textual>=0.47` for TextArea widget, `pyyaml`), and dev dependencies (`pytest`, `pytest-asyncio`). Requires Python ≥ 3.11.
3. Add Python gitignore patterns (`__pycache__/`, `*.pyc`, `.venv/`, `*.egg-info/`, `dispatcher.db`)
4. Create SQLite database with `runs` and `issues` tables on first run (auto-migration in `db.py`)

## Scope

**Included:**
- Selection TUI with label filtering and parked indicator
- Single-shot triage via `claude -p` Sonnet with JSON schema enforcement
- Tier matrix validation and override
- Review TUI with tier override, skip, comment editing, detail view
- Sequential execution via `claude -p` Opus with feature-flow plugin
- PR verification and supervised YOLO labeling
- Parked issue clarification comments
- SQLite logging for all stages
- Resume recovery via `--resume`
- `--auto` mode for fully unattended runs
- `--dry-run` mode
- YAML configuration with CLI override

**Excluded:**
- Feedback loop (triage improvement from historical data) — deferred to v2
- Poll mode (webhook/scheduled execution) — deferred to v2
- Parallel execution (concurrent `claude -p` sessions) — deferred to v2
- Quota optimization — deferred to v2
- SDK execution tier (Python SDK fallback) — deferred to v2
- Multi-repo support — deferred to v2
- Auto-enforced security exclusion rules — deferred to v2
- Concurrent run locking — deferred to v2
