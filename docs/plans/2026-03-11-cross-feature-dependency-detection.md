# Cross-Feature Dependency Detection — Design Document

**Date:** 2026-03-11
**Status:** Draft
**Issue:** #174

## Overview

When multiple GitHub issues are dispatched in parallel, naive execution ordering can cause blocked PRs if Feature B depends on Feature A completing first. This feature adds cross-issue dependency detection: parsing `depends on #N` and `blocked by #N` from issue bodies, building a dependency graph, reordering parallel execution into waves, and surfacing dependency information in both the Review and Selection TUIs.

## Example

**Issue body with dependency:**
```
## Summary
Implement login page.

Depends on #42 (Add auth model)
```

**Auto mode output:**
```
Dependency waves detected:
  Wave 1: #42 (no dependencies)
  Wave 2: #45 (depends on #42)
Executing waves sequentially...
```

**SelectionApp label:**
```
#45 Implement login page   → needs #42
#42 Add auth model
```

## Architecture

### New Module: `dispatcher/dependencies.py`

A standalone module providing four public functions plus `CycleError`:

```python
class CycleError(Exception):
    """Raised by dep_waves() when a circular dependency is detected.
    Message contains the cycle path, e.g. '#3 → #5 → #3'."""
    pass

def extract_deps(body: str | None) -> list[int]:
    """Parse issue body for dependency references.

    Returns empty list for None or empty body.
    Matches all occurrences (multiple deps per body are additive).
    Matches (case-insensitive):
      - depends on #N
      - depend on #N
      - depends on: #N
      - blocked by #N
    Does NOT match: closes #N, fixes #N
    Self-referential deps (#N depends on #N) return N in the list;
    dep_waves() will detect the self-loop via cycle detection.
    """

def build_dep_graph(issues: list[dict[str, Any]]) -> dict[int, list[int]]:
    """Build adjacency map from a list of issue dicts (from github.view_issue()).
    Each dict must have 'number' (int) and 'body' (str | None).
    Returns: {issue_number: [dep_issue_numbers]}
    Calls extract_deps() on each issue's 'body' field."""

def dep_waves(graph: dict[int, list[int]], all_numbers: list[int]) -> list[list[int]]:
    """Topological sort using Kahn's algorithm.
    Returns: [[3, 7], [5]] — each inner list is a wave of parallel-safe issues.
    Issues with no dependencies appear in Wave 1 (even if graph is empty).
    Raises CycleError with cycle path in message if a cycle is detected.

    Implementation note: extract private _kahn() helper to keep dep_waves ≤30 lines."""

def find_unmet(
    graph: dict[int, list[int]],
    batch: set[int],
    closed: set[int],
) -> dict[int, list[int]]:
    """Return issues whose dependencies are not satisfied.
    Satisfied = (in batch AND not in closed) OR already in closed.
    Returns: {issue_number: [missing_dep_numbers]}
    Empty dict means all deps satisfied."""
```

**Design rationale:**
- Separate module keeps pipeline.py focused; mirrors `wave_planner.py` pattern
- `CycleError` follows the `class XyzError(Exception): pass` pattern (same as `GithubError`, `TriageError`)
- Kahn's algorithm chosen for consistency with `wave_planner.py`; do NOT reuse that module — different data sources (issue numbers vs task IDs)
- `extract_deps` naming overlap with `wave_planner._parse_prose` "Depends on:" syntax is intentional coincidence — document in docstring that this targets GitHub `#N` syntax, not task IDs

### `pipeline.py` Changes

#### `github.view_issue()` — add `state` field

Change `--json` fields from `"title,body,comments"` to `"title,body,comments,state"` so that closed issue detection is possible from in-memory data (no extra API calls).

#### `_run_triage()` — return raw issue dicts alongside results

Change return type from `list[TriageResult]` to `tuple[list[TriageResult], list[dict[str, Any]]]`.
The second element is the list of raw issue dicts (each containing `number`, `title`, `body`, `state`) already fetched inside the triage loop — no additional GitHub calls.

```python
def _run_triage(...) -> tuple[list[TriageResult], list[dict[str, Any]]]:
    ...
    return triage_results, issues_raw
```

Update all callers of `_run_triage()` accordingly (currently one call site in `run()`).

#### `_check_dependencies()` — new function after triage, before review

```python
def _check_dependencies(
    issues_raw: list[dict[str, Any]],
    selected_numbers: list[int],
) -> tuple[dict[int, list[int]], dict[int, list[int]]]:
    """Build dep graph and find unmet deps. Returns (graph, unmet).
    Never raises — catches (GithubError, CycleError, ValueError) and returns ({}, {})."""
```

**Steps inside `_check_dependencies()`:**
1. Call `dependencies.build_dep_graph(issues_raw)` — raw dicts already have `body`
2. Extract closed issue numbers: `{d["number"] for d in issues_raw if d.get("state") == "closed"}`
3. Call `dependencies.find_unmet(graph, batch=set(selected_numbers), closed=closed_numbers)`
4. Print stdout warning per unmet dep: `⚠  Dependency warning: #5 depends on #3 which is not yet complete.`
5. Catch `CycleError`: print `⚠  Circular dependency detected: [path]. Wave ordering disabled; executing in original order.` Return `({}, {})`
6. Catch `(GithubError, ValueError)`: log warning, return `({}, {})`
7. Return `(graph, unmet)`

**Note:** Error fallback is `except (GithubError, CycleError, ValueError)` — not bare `except Exception`. This avoids silently swallowing programming errors (AttributeError, ImportError, etc.) during development.

**Auto mode wave reordering** (in `_review_and_execute()`, after `to_execute` is built):
- When `config.auto` is True and `graph` is non-empty: call `dep_waves(graph, [r.triage.issue_number for r in to_execute])` to reorder `to_execute`
- Reconstruct ordered `to_execute` via `{r.triage.issue_number: r for r in to_execute}` lookup per wave
- Print wave summary, execute Wave 1 fully, then Wave 2, etc.

### TUI Changes

**`SelectionApp` (`dispatcher/tui/selection.py`):**
- Add `unmet_deps: dict[int, list[int]] | None = None` optional init parameter
- In label loop (selection.py:38), append ` → needs #N` for issues with unresolved deps (alongside existing ` ↻ parked` suffix)
- Pattern: same f-string composition as the parked indicator

**`ReviewApp` (`dispatcher/tui/review.py`):**
- Add `unmet: dict[int, list[int]] | None = None` optional init parameter
- Add `"Deps"` column to `add_columns()` call (review.py:39)
- Populate "Deps" cell in each `add_row()` call: `"needs #N"` for unmet; `"—"` for satisfied
- Add a `Static("", id="dep-warning")` above DataTable in `compose()`
  - Set `.visible = False` initially; set `.visible = True` and call `.update(content)` in `on_mount()` if `unmet` is non-empty
  - Content: `"⚠  Unmet dependencies: #5 → #3, #7 → #2"` (comma-separated)

## Pipeline Flow (Updated)

```
_run_triage()           → (list[TriageResult], list[dict[str, Any]])
_check_dependencies()   → (dep_graph, unmet) [NEW]
_run_review()           → list[ReviewedIssue]  (receives dep_graph + unmet for TUI display)
to_execute = filter(reviewed)
[auto mode] reorder to_execute into dep waves using dep_graph
_run_execution()        → results
```

## Patterns & Constraints

### Error Handling
- `CycleError`: raised by `dep_waves()`, caught by `_check_dependencies()` — never propagates to caller
- `_check_dependencies()` catches only `(GithubError, CycleError, ValueError)` — not bare `except Exception`
- `extract_deps(None)`: returns `[]` — guard at function entry, not in callers
- Missing/empty `state` field in issue dict: `d.get("state") == "closed"` — defaults to treating as open (conservative)

### Types
- `dep_graph: dict[int, list[int]]` — all integer keys/values (issue numbers), not strings
- `unmet: dict[int, list[int]]` — same; empty dict means no unmet deps
- `batch: set[int]` — set of currently selected issue numbers
- `closed: set[int]` — set of already-closed issue numbers (satisfied deps)
- `issues_raw: list[dict[str, Any]]` — raw dicts from `github.view_issue()` with `number`, `body`, `state`
- `build_dep_graph` parameter: `list[dict[str, Any]]` not bare `list[dict]`

### Edge Cases
- **Self-referential dep** (`#N depends on #N`): `extract_deps` returns `[N]`; `dep_waves` detects via Kahn's cycle detection and raises `CycleError`
- **Multiple `depends on` in one body**: `re.findall` accumulates all matches into a single list (additive)
- **`None` body from GitHub API**: `extract_deps(None)` returns `[]` immediately
- **Diamond topology** (`#5→#3`, `#5→#4`, both→`#2`): handled correctly by Kahn — #2 in Wave 1, #3/#4 in Wave 2, #5 in Wave 3
- **No-dep case** (empty graph): `dep_waves({}, all_numbers)` returns `[all_numbers]` — all in Wave 1
- **Out-of-batch dep**: warning printed, execution not blocked; `find_unmet` includes it as unmet

### Performance
- No extra GitHub API calls — `state` added to existing `view_issue` fetch; body reused from triage loop
- `extract_deps` runs on issue body only (not PR descriptions or comments)
- N+1 prevention: all issue state checks from in-memory data via `issues_raw`

### Function Complexity
- `dep_waves()` ≤30 lines: extract `_kahn(graph, all_numbers) → list[list[int]]` as private helper
- `_check_dependencies()` ≤30 lines: extract `_format_dep_warnings(unmet) → None` for the stdout-printing loop

### Stack-Specific
- Python 3.11+; `dict[int, list[int]]` type hints (no `Dict` from `typing`)
- Textual `widget.visible = True/False` for banner show/hide (not CSS class toggle)
- Textual `Static.update(content)` for dynamic banner text updates
- Test pattern: class-based (`TestXxx`), factory helpers, `pytest.raises(CycleError)` for cycle assertions
- `@pytest.mark.asyncio` + all-keyword instantiation + `async with app.run_test() as pilot:` for TUI tests

## Scope

**Included:**
- `dispatcher/dependencies.py` with `extract_deps`, `build_dep_graph`, `dep_waves`, `find_unmet`, `CycleError`
- `github.view_issue()` — add `state` to JSON fields
- `_run_triage()` — return `tuple[list[TriageResult], list[dict[str, Any]]]`
- `pipeline._check_dependencies()` between triage and review
- Auto mode wave reordering of `to_execute` in `_review_and_execute()`
- `ReviewApp` Deps column + `Static` dep-warning banner
- `SelectionApp` ` → needs #N` suffix
- `dispatcher/tests/test_dependencies.py` covering: all text patterns, topological sort shapes (chain/fork/diamond/self-loop/cycle), closed deps, out-of-batch deps, None body
- Plan file at `docs/plans/2026-03-09-cross-feature-dependency-detection.md`

**Excluded:**
- ASCII dependency graph rendering
- Automatic PR blocking / GitHub status checks
- Parsing dependency text from PR bodies or commit messages
- Persisting dependency data to SQLite
- Any changes to `wave_planner.py` (task-level, not issue-level)
- Visual graph widget in TUI
