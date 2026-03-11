# Wave-Based Parallel Task Execution — Design Document

**Date:** 2026-03-11
**Status:** Draft
**Issue:** #167

## Overview

Feature-flow currently groups implementation tasks into parallel batches using heuristic analysis (Phases A–D in `yolo-overrides.md`). This feature adds a deterministic layer on top: `dispatcher/wave_planner.py` reads explicit dependency declarations from prose and XML plan files, runs a topological sort, and outputs ordered waves as JSON. The subagent-driven-development orchestrator calls `wave_planner.py` first; if no explicit dependencies are declared, it falls back to the existing Phase A–D heuristics unchanged.

## Example

Given a plan where Task 3 depends on Tasks 1 and 2, and Tasks 4–5 are independent:

**Input (prose):**
```markdown
**Quality Constraints:**
- Depends on: Task 1, Task 2
```

**Input (XML):**
```xml
<task id="3" depends_on="1,2" status="pending">
```

**Output:**
```json
{"waves": [[1, 2, 4, 5], [3]], "errors": []}
```

Tasks 1, 2, 4, and 5 execute in parallel (Wave 1). Task 3 waits for Wave 1 to complete (Wave 2).

## Architecture

### New: `dispatcher/wave_planner.py`

CLI tool invoked as `python -m dispatcher.wave_planner --plan-file <path>`.

**Responsibilities:**
1. Detect plan format (prose or XML) — re-implement the detection algorithm in Python: iterate lines tracking code-fence state (toggle on lines starting with ` ``` `), check non-fenced lines for `^<plan version=` regex match. If match found and full file contains `</plan>` → XML mode, otherwise prose mode.
2. Parse all task IDs and dependency declarations
3. Run Kahn's algorithm for topological sort
4. Output JSON to stdout and exit 0 (success) or 1 (errors)

**Output schema:**
```json
{
  "waves": [[1, 3], [2], [4, 5]],
  "errors": [],
  "has_explicit_deps": true
}
```

- `waves`: ordered list of waves; tasks within each wave are independent and can run in parallel
- `errors`: list of error strings; non-empty when exit code is 1
- `has_explicit_deps`: `true` if the plan contained any `Depends on:` or `depends_on=` declarations; `false` otherwise
- When errors are non-empty, `waves` is `[]` — no partial wave data on failure

**Error messages:**
- Cycle: `"cycle: Task 1 → Task 3 → Task 1"`
- Invalid ref: `"Task 3: Depends on Task 99 which does not exist"`

### Prose Plan Syntax (additive, backward-compatible)

Optional line in a task's Quality Constraints block:

```markdown
**Quality Constraints:**
- Parallelizable: no
- Depends on: Task 1, Task 2
```

`Depends on:` is optional. If absent, the task is treated using the existing `Parallelizable:` field heuristics (unchanged behavior).

**Edge case — `Parallelizable: no` with no `Depends on:`:** Conservative placement — the task is placed in a wave after all tasks with lower IDs that share any entry in `Files modified`. If no file conflicts found, treated as last item of the previous wave.

### XML Plan Syntax (additive, backward-compatible)

Optional attribute on `<task>`:

```xml
<task id="3" depends_on="1,2" status="pending">
```

If `depends_on` is absent, the task is treated as independent (equivalent to `Parallelizable: yes`). No schema version bump required — attribute is additive.

### Updated: `skills/start/references/yolo-overrides.md` — Phase A

New Phase A logic (existing Phases A–D become the fallback):

```
Phase A — Wave planner detection:
1. Call: python -m dispatcher.wave_planner --plan-file <path>
2. If exit 0 AND JSON output has "has_explicit_deps": true:
   → Use JSON waves output to build execution waves
   → Skip Phases B, C, D
3. Otherwise (exit 1, tool not found, or has_explicit_deps: false):
   → Run existing Phase A–D heuristics as today
```

The `has_explicit_deps` flag in the JSON output distinguishes plans with explicit dependency declarations from plans where all tasks happened to be independent (which would also produce a single-wave output from Kahn's algorithm).

The fallback preserves 100% backward compatibility — plans without explicit dependencies continue working exactly as before.

### Updated: `skills/verify-plan-criteria/SKILL.md`

Add a new step after the existing checks:

**Validate Dependency Graph:**
1. Call `python -m dispatcher.wave_planner --plan-file <path>`
2. If exit 0: dependency graph is valid — continue
3. If exit 1: report each entry in `errors` as a **blocking** finding
   - Cycle: `"cycle: Task A → Task B → Task A"`
   - Invalid ref: `"Task X: Depends on Task Y which does not exist"`
4. If `wave_planner.py` is not installed (ImportError / command not found): skip silently — non-blocking

### Updated: `references/xml-plan-format.md`

Add `depends_on` to the Task Element attributes table:

| Attribute | Required | Values | Description |
|-----------|----------|--------|-------------|
| `depends_on` | No | Comma-separated task IDs (e.g., `"1,2"`) | Declares prerequisite tasks that must complete before this task can run. Used by `wave_planner.py` for topological sort. If absent, treated as independent. |

### New: `dispatcher/tests/test_wave_planner.py`

Test coverage:
- Basic two-wave plan (Tasks 1, 2 → Task 3)
- Cycle detection (A → B → A)
- Invalid task reference
- Single-task plan
- All-parallel plan (no deps declared)
- All-sequential plan (each task depends on prior)
- XML plan with `depends_on` attribute

### New: `docs/plans/2026-03-09-wave-based-parallel-task-execution.md`

This file (required by issue AC). Created as part of implementation.

## Patterns & Constraints

### Format Detection
Reuse the existing heuristic from `verify-plan-criteria/SKILL.md`: read first 50 non-fenced lines, match `/^<plan version=/` — XML if found and `</plan>` present, otherwise prose. This avoids duplicating detection logic.

### Error Handling
- Invalid `depends_on` values (non-integer, negative): treat as invalid ref error
- Missing `--plan-file` argument: print usage to stderr, exit 1
- File not found: print error to stderr, exit 1
- `wave_planner.py` missing at call sites: callers skip silently — non-blocking

### Types / Output
- Task IDs are integers in JSON output
- `waves` is always a list (empty list `[]` when errors present)
- `errors` is always a list (empty list `[]` on success)

### Backward Compatibility
Both `Depends on:` and `depends_on=` are optional and additive. All existing plans (prose and XML) continue to work without modification. The orchestrator only switches to wave-planner output when explicit dependencies are present.

## Scope

**Included:**
- `dispatcher/wave_planner.py` — topological sort CLI tool
- `dispatcher/tests/test_wave_planner.py` — unit tests
- `skills/start/references/yolo-overrides.md` — Phase A update
- `skills/verify-plan-criteria/SKILL.md` — dependency graph validation step
- `references/xml-plan-format.md` — `depends_on` attribute documentation
- `docs/plans/2026-03-09-wave-based-parallel-task-execution.md` — this plan file

**Excluded:**
- `dispatcher/pipeline.py` — cross-issue parallelism, no changes needed
- XML plan format schema version bump — `depends_on` is a new optional attribute, no version change required
- Benchmarking or metrics instrumentation
- UI changes or any frontend work
