# Feature Context — GH#174: Cross-Feature Dependency Detection

**Issue:** #174
**Branch:** feat/cross-dep-detection-174
**Base:** main

## Goal

Add cross-issue dependency detection to the dispatcher. Parse `depends on #N` / `blocked by #N` from issue bodies, build a dependency graph, reorder parallel execution into dep waves, and surface dependency info in both TUIs.

## Design Doc

`docs/plans/2026-03-11-cross-feature-dependency-detection.md`

## Implementation Plan

`docs/plans/2026-03-09-cross-feature-dependency-detection.md`

## Key Decisions

1. New module `dispatcher/dependencies.py` — separate from `wave_planner.py` (different data source: issue numbers vs task IDs)
2. Patterns: `depends on #N`, `depend on #N`, `depends on: #N`, `blocked by #N` (case-insensitive); NOT `closes/fixes #N`
3. Cycle detection: `CycleError` raised by `dep_waves()`, caught by `_check_dependencies()` — run continues in original order
4. Closed deps: treated as satisfied (no warning); batch-fetch state from issues already in memory via `state` field
5. Out-of-batch deps: warning only, not blocked
6. `wave_planner.py` unchanged — only issue-level dep detection is added
7. `_run_triage()` return type → `tuple[list[TriageResult], list[dict[str, Any]]]` to make raw issue body/state available downstream
8. `_check_dependencies()` catches only `(GithubError, CycleError, ValueError)` — NOT bare `except Exception`
9. TUI: `widget.visible = True/False` for banner (NOT CSS class toggle); `Static.update(content)` for text
10. Tests: `@pytest.mark.asyncio` + all-keyword instantiation + `async with app.run_test() as pilot:`

## Files to Create/Modify

- CREATE: `dispatcher/dependencies.py`
- CREATE: `dispatcher/tests/test_dependencies.py`
- MODIFY: `dispatcher/github.py` — add `state` to `view_issue` JSON fields
- MODIFY: `dispatcher/pipeline.py` — triage tuple, `_check_dependencies`, wave reorder
- MODIFY: `dispatcher/tui/review.py` — Deps column + Static warning banner
- MODIFY: `dispatcher/tui/selection.py` — `→ needs #N` suffix

## Critical Constraints

- `extract_deps(body: str | None)` — must handle `None` without TypeError
- `dep_waves` needs private `_kahn()` helper (each ≤30 lines)
- `_check_dependencies` needs `_format_dep_warnings()` helper (each ≤30 lines)
- `list[dict[str, Any]]` not bare `list[dict]` — Python 3.11+
- `CycleError` follows `class XyzError(Exception): pass` pattern (no custom methods)
- Task 1 Step 9 in plan has a messy dual-draft of `_kahn` — use the CLEAN version after "Wait, I need to reconsider"
