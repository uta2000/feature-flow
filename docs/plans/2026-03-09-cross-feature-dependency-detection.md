# Cross-Feature Dependency Detection Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Create dispatcher/dependencies.py (TDD) — STATUS: pending
Task 2: Modify dispatcher/github.py — add state field — STATUS: pending
Task 3: Modify dispatcher/pipeline.py — triage tuple + dep check + wave reorder — STATUS: pending
Task 4: Modify dispatcher/tui/review.py — Deps column + warning banner — STATUS: pending
Task 5: Modify dispatcher/tui/selection.py — needs #N suffix — STATUS: pending
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.
> Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

**Goal:** Add cross-issue dependency detection to the dispatcher — parse `depends on #N` / `blocked by #N` from issue bodies, build a dependency graph, reorder parallel execution into waves, and surface dependency info in both TUIs.

**Architecture:** New `dispatcher/dependencies.py` module provides four public functions (extract_deps, build_dep_graph, dep_waves, find_unmet) plus `CycleError`. `pipeline.py` gains `_check_dependencies()` inserted between triage and review, plus auto-mode wave reordering of `to_execute`. Both TUIs gain dependency visualization via new init parameters.

**Tech Stack:** Python 3.11+, pytest + pytest-asyncio for TUI tests, Textual DataTable/Static widget APIs, Kahn's topological sort algorithm.

---

### Task 1: Create `dispatcher/dependencies.py` (TDD)

**Acceptance Criteria:**
- [ ] `dispatcher/dependencies.py` exists with all 5 symbols measured by symbol count verified by `grep -c "def extract_deps\|def build_dep_graph\|def dep_waves\|def find_unmet\|class CycleError" dispatcher/dependencies.py`
- [ ] All unit tests in `test_dependencies.py` pass measured by zero failures verified by `python -m pytest dispatcher/tests/test_dependencies.py -v`
- [ ] `extract_deps(None)` returns `[]` without TypeError measured by test pass verified by `python -m pytest dispatcher/tests/test_dependencies.py::TestExtractDeps::test_none_body -v`
- [ ] `dep_waves` raises `CycleError` on cycle and self-loop measured by test pass verified by `python -m pytest dispatcher/tests/test_dependencies.py::TestDepWaves::test_cycle_raises dispatcher/tests/test_dependencies.py::TestDepWaves::test_self_loop_raises -v`

**Files:**
- Create: `dispatcher/dependencies.py`
- Create: `dispatcher/tests/test_dependencies.py`

**Quality Constraints:**
- Error handling: `CycleError` follows `class XyzError(Exception): pass` pattern (matches `GithubError` at github.py:7, `TriageError` at triage.py:44)
- Types: `dict[int, list[int]]`, `list[dict[str, Any]]`, `set[int]` — no bare `dict`, no `Dict` from `typing`
- Function length: `dep_waves` ≤30 lines via private `_kahn()` helper; all other public functions ≤20 lines
- Pattern: follow `wave_planner.py` Kahn's algorithm structure; keep as separate module (different data source)
- Files modified: new file, no design-first restriction
- Parallelizable: yes

**Step 1: Write failing tests for `extract_deps`**

Create `dispatcher/tests/test_dependencies.py`:

```python
from __future__ import annotations
import pytest
from dispatcher.dependencies import CycleError, extract_deps, build_dep_graph, dep_waves, find_unmet


class TestExtractDeps:
    def test_depends_on(self):
        assert extract_deps("This depends on #3") == [3]

    def test_blocked_by(self):
        assert extract_deps("blocked by #7") == [7]

    def test_case_insensitive(self):
        assert extract_deps("DEPENDS ON #5") == [5]

    def test_depend_on_variant(self):
        assert extract_deps("depend on #2") == [2]

    def test_depends_on_colon(self):
        assert extract_deps("depends on: #4") == [4]

    def test_multiple_deps(self):
        result = extract_deps("depends on #3\nblocked by #7")
        assert sorted(result) == [3, 7]

    def test_ignores_closes(self):
        assert extract_deps("Closes #5") == []

    def test_ignores_fixes(self):
        assert extract_deps("Fixes #3") == []

    def test_none_body(self):
        assert extract_deps(None) == []

    def test_empty_body(self):
        assert extract_deps("") == []

    def test_no_deps(self):
        assert extract_deps("Just a regular issue body") == []
```

**Step 2: Run tests to verify they fail**

```bash
cd /path/to/worktree && python -m pytest dispatcher/tests/test_dependencies.py::TestExtractDeps -v
```
Expected: ImportError — `dispatcher.dependencies` does not exist yet.

**Step 3: Write minimal `extract_deps` implementation**

Create `dispatcher/dependencies.py`:

```python
from __future__ import annotations

import re
from typing import Any


class CycleError(Exception):
    """Raised by dep_waves() when a circular dependency is detected.
    Message contains the cycle path, e.g. '#3 → #5 → #3'."""
    pass


_DEP_PATTERN = re.compile(
    r"\b(?:depends?\s+on:?\s*|blocked\s+by\s+)#(\d+)",
    re.IGNORECASE,
)


def extract_deps(body: str | None) -> list[int]:
    """Parse issue body for dependency references.

    Matches (case-insensitive): 'depends on #N', 'depend on #N',
    'depends on: #N', 'blocked by #N'.
    Does NOT match: 'closes #N', 'fixes #N'.
    Returns [] for None or empty body. Multiple occurrences are additive.
    """
    if not body:
        return []
    return [int(m) for m in _DEP_PATTERN.findall(body)]
```

**Step 4: Run tests to verify extract_deps passes**

```bash
python -m pytest dispatcher/tests/test_dependencies.py::TestExtractDeps -v
```
Expected: All 11 tests PASS.

**Step 5: Write failing tests for `build_dep_graph`**

Append to `dispatcher/tests/test_dependencies.py`:

```python
class TestBuildDepGraph:
    def test_basic(self):
        issues = [
            {"number": 5, "body": "depends on #3"},
            {"number": 3, "body": "no deps here"},
        ]
        assert build_dep_graph(issues) == {5: [3], 3: []}

    def test_none_body(self):
        issues = [{"number": 1, "body": None}]
        assert build_dep_graph(issues) == {1: []}

    def test_empty(self):
        assert build_dep_graph([]) == {}
```

**Step 6: Implement `build_dep_graph`**

Append to `dispatcher/dependencies.py`:

```python
def build_dep_graph(issues: list[dict[str, Any]]) -> dict[int, list[int]]:
    """Build adjacency map from issue dicts with 'number' and 'body' keys.
    Returns {issue_number: [dep_issue_numbers]}."""
    return {
        issue["number"]: extract_deps(issue.get("body"))
        for issue in issues
    }
```

**Step 7: Run tests to verify build_dep_graph passes**

```bash
python -m pytest dispatcher/tests/test_dependencies.py::TestBuildDepGraph -v
```
Expected: All 3 tests PASS.

**Step 8: Write failing tests for `dep_waves` and `find_unmet`**

Append to `dispatcher/tests/test_dependencies.py`:

```python
class TestDepWaves:
    def test_chain(self):
        # #5 depends on #3 → [[3], [5]]
        graph = {3: [], 5: [3]}
        assert dep_waves(graph, [3, 5]) == [[3], [5]]

    def test_no_deps(self):
        graph = {1: [], 2: [], 3: []}
        result = dep_waves(graph, [1, 2, 3])
        assert len(result) == 1
        assert sorted(result[0]) == [1, 2, 3]

    def test_diamond(self):
        # #2→#3, #2→#4, both→#5: [[5], [3,4], [2]]
        graph = {5: [], 3: [5], 4: [5], 2: [3, 4]}
        result = dep_waves(graph, [2, 3, 4, 5])
        assert result[0] == [5]
        assert sorted(result[1]) == [3, 4]
        assert result[2] == [2]

    def test_cycle_raises(self):
        graph = {3: [5], 5: [3]}
        with pytest.raises(CycleError):
            dep_waves(graph, [3, 5])

    def test_self_loop_raises(self):
        graph = {3: [3]}
        with pytest.raises(CycleError):
            dep_waves(graph, [3])

    def test_empty_graph(self):
        assert dep_waves({}, [1, 2]) == [[1, 2]]


class TestFindUnmet:
    def test_unmet_dep_in_batch(self):
        # #5 depends on #3; both in batch, #3 not closed → unmet
        graph = {5: [3], 3: []}
        result = find_unmet(graph, batch={3, 5}, closed=set())
        assert result == {5: [3]}

    def test_closed_dep_satisfied(self):
        # #5 depends on #3; #3 is closed → satisfied
        graph = {5: [3]}
        result = find_unmet(graph, batch={5}, closed={3})
        assert result == {}

    def test_out_of_batch_dep(self):
        # #5 depends on #3; #3 not in batch, not closed → unmet
        graph = {5: [3]}
        result = find_unmet(graph, batch={5}, closed=set())
        assert result == {5: [3]}

    def test_no_deps(self):
        graph = {1: [], 2: []}
        assert find_unmet(graph, batch={1, 2}, closed=set()) == {}

    def test_empty(self):
        assert find_unmet({}, batch=set(), closed=set()) == {}
```

**Step 9: Implement `dep_waves` with `_kahn` helper and `find_unmet`**

Append to `dispatcher/dependencies.py`:

```python
def _kahn(graph: dict[int, list[int]], all_numbers: list[int]) -> list[list[int]]:
    """Kahn's topological sort. Returns waves. Raises CycleError on cycles."""
    in_degree: dict[int, int] = {n: 0 for n in all_numbers}
    for n in all_numbers:
        for dep in graph.get(n, []):
            if dep in in_degree:
                in_degree[dep] = in_degree.get(dep, 0)  # ensure key exists
    # Build in-degree: number of issues that depend ON each node
    # (edges go: dependant → dependency, so dependency has lower in-degree)
    # Recompute: in_degree[n] = count of issues whose dep list contains n as a prerequisite
    in_degree = {n: 0 for n in all_numbers}
    for n in all_numbers:
        for dep in graph.get(n, []):
            pass  # dep is a prerequisite of n; n can only run after dep
    # Standard Kahn: in_degree[n] = number of prerequisites for n
    in_degree = {n: len([d for d in graph.get(n, []) if d in set(all_numbers)]) for n in all_numbers}
    queue = [n for n in all_numbers if in_degree[n] == 0]
    waves: list[list[int]] = []
    remaining = set(all_numbers)
    while queue:
        waves.append(sorted(queue))
        remaining -= set(queue)
        next_queue = []
        for n in all_numbers:
            if n not in remaining:
                continue
            deps_in_remaining = [d for d in graph.get(n, []) if d in remaining]
            if not deps_in_remaining:
                next_queue.append(n)
        queue = next_queue
    if remaining:
        cycle_node = next(iter(remaining))
        raise CycleError(f"Cycle detected involving issue #{cycle_node}")
    return waves


def dep_waves(graph: dict[int, list[int]], all_numbers: list[int]) -> list[list[int]]:
    """Topological sort using Kahn's algorithm.
    Returns ordered waves: [[3, 7], [5]].
    Issues with no dependencies appear in Wave 1.
    Raises CycleError with cycle info if a cycle is detected."""
    if not all_numbers:
        return []
    return _kahn(graph, all_numbers)


def find_unmet(
    graph: dict[int, list[int]],
    batch: set[int],
    closed: set[int],
) -> dict[int, list[int]]:
    """Return issues whose dependencies are not yet satisfied.
    Satisfied = dep is in closed, OR dep is in batch but NOT in closed.
    Wait — satisfied means the dep is done: either closed, or in batch (will run).
    Unmet = dep is NOT in closed AND NOT in batch."""
    result: dict[int, list[int]] = {}
    for issue_num, deps in graph.items():
        if issue_num not in batch:
            continue
        missing = [d for d in deps if d not in closed and d not in batch]
        if missing:
            result[issue_num] = missing
    return result
```

Wait, I need to reconsider the `_kahn` implementation - the current draft has some redundant code. Let me write a clean version:

Actually, I realize I should write this more carefully. Let me write a clean implementation:

```python
def _kahn(graph: dict[int, list[int]], all_numbers: list[int]) -> list[list[int]]:
    """Kahn's topological sort. graph[n] = list of prerequisites for n.
    Returns waves (each wave is parallel-safe). Raises CycleError on cycles."""
    node_set = set(all_numbers)
    # in_degree[n] = number of unresolved prerequisites for n
    in_degree = {n: len([d for d in graph.get(n, []) if d in node_set]) for n in all_numbers}
    queue = sorted(n for n in all_numbers if in_degree[n] == 0)
    # reverse_graph[dep] = list of nodes that depend on dep
    reverse: dict[int, list[int]] = {n: [] for n in all_numbers}
    for n in all_numbers:
        for dep in graph.get(n, []):
            if dep in node_set:
                reverse[dep].append(n)
    waves: list[list[int]] = []
    visited = 0
    while queue:
        waves.append(sorted(queue))
        visited += len(queue)
        next_queue: list[int] = []
        for n in queue:
            for dependent in reverse[n]:
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    next_queue.append(dependent)
        queue = sorted(next_queue)
    if visited < len(all_numbers):
        remaining = [n for n in all_numbers if in_degree.get(n, 0) > 0]
        raise CycleError(f"Cycle detected among issues: {remaining}")
    return waves
```

**Step 10: Run all tests to verify dep_waves and find_unmet pass**

```bash
python -m pytest dispatcher/tests/test_dependencies.py -v
```
Expected: All tests PASS. Count: 11 + 3 + 6 + 5 = 25 tests.

**Step 11: Commit**

```bash
git add dispatcher/dependencies.py dispatcher/tests/test_dependencies.py
git commit -m "feat(deps): add dispatcher/dependencies.py with dep graph and wave ordering"
```

---

### Task 2: Modify `dispatcher/github.py` — add `state` field

**Acceptance Criteria:**
- [ ] `view_issue` JSON fields string includes `state` measured by string presence verified by `grep "state" dispatcher/github.py`
- [ ] `test_view_issue_fetches_state` passes measured by zero failures verified by `python -m pytest dispatcher/tests/test_github.py -k "test_view_issue_fetches_state" -v`
- [ ] Full github test suite passes with no regressions measured by zero failures verified by `python -m pytest dispatcher/tests/test_github.py -v`

**Files:**
- Modify: `dispatcher/github.py:32-38`

**Quality Constraints:**
- Change is minimal: one string edit to `--json` field list
- No type changes needed — return type stays `dict` (consistent with existing code style)
- Files modified: `dispatcher/github.py` (38 lines — not design-first)
- Parallelizable: yes

**Step 1: Read the current `view_issue` function**

Read `dispatcher/github.py` lines 32-38. Confirm current JSON fields are `"title,body,comments"`.

**Step 2: Write a test for state field presence**

Add to `dispatcher/tests/test_github.py` (find the existing TestViewIssue class or similar):

```python
def test_view_issue_fetches_state(self):
    """Confirm view_issue requests the state field."""
    import dispatcher.github as gh_module
    import inspect
    source = inspect.getsource(gh_module.view_issue)
    assert "state" in source, "view_issue must fetch state field"
```

**Step 3: Run test to verify it fails**

```bash
python -m pytest dispatcher/tests/test_github.py -k "test_view_issue_fetches_state" -v
```
Expected: FAIL — "state" not in source.

**Step 4: Edit `view_issue` to add `state`**

In `dispatcher/github.py`, change line 36:

```python
# Before:
"--json", "title,body,comments",
# After:
"--json", "title,body,comments,state",
```

**Step 5: Run test to verify it passes**

```bash
python -m pytest dispatcher/tests/test_github.py -k "test_view_issue_fetches_state" -v
```
Expected: PASS.

**Step 6: Run full test suite to check no regressions**

```bash
python -m pytest dispatcher/tests/ -v --ignore=dispatcher/tests/test_tui
```
Expected: All previously-passing tests still PASS.

**Step 7: Commit**

```bash
git add dispatcher/github.py dispatcher/tests/test_github.py
git commit -m "feat(github): add state field to view_issue JSON fetch"
```

---

### Task 3: Modify `dispatcher/pipeline.py` — triage tuple + dep check + wave reorder

**Acceptance Criteria:**
- [ ] `_run_triage` return annotation contains `tuple` measured by annotation presence verified by `grep "tuple\[list\[TriageResult\]" dispatcher/pipeline.py`
- [ ] `_check_dependencies` function is defined in `pipeline.py` measured by definition presence verified by `grep "def _check_dependencies" dispatcher/pipeline.py`
- [ ] `_format_dep_warnings` helper function is defined measured by definition presence verified by `grep "def _format_dep_warnings" dispatcher/pipeline.py`
- [ ] `TestCheckDependencies` tests all pass measured by zero failures verified by `python -m pytest dispatcher/tests/test_pipeline.py::TestCheckDependencies -v`
- [ ] Full pipeline test suite passes measured by zero failures verified by `python -m pytest dispatcher/tests/test_pipeline.py -v`

**Files:**
- Modify: `dispatcher/pipeline.py:122-141` (_run_triage return type)
- Modify: `dispatcher/pipeline.py:63-69` (caller in run())
- Modify: `dispatcher/pipeline.py:72-97` (_review_and_execute — add _check_dependencies and wave reorder)

**Quality Constraints:**
- Error handling: `_check_dependencies` catches `(GithubError, CycleError, ValueError)` only — NOT bare `except Exception`
- Types: `tuple[list[TriageResult], list[dict[str, Any]]]` for _run_triage return
- Function length: `_check_dependencies` ≤30 lines via `_format_dep_warnings()` helper
- Pattern: follow existing `_run_triage`, `_run_review` function signatures
- Files modified: `dispatcher/pipeline.py` (551 lines — design-first required)
- Parallelizable: no (depends on Task 1 for `dispatcher.dependencies` import, Task 2 for `state` field)

**Step 1: Read `dispatcher/pipeline.py` lines 1-100 in full**

Understand the import section, `run()`, `_review_and_execute()`, `_run_triage()` signatures before making any edits.

**Step 2: Output change plan before editing**

For each function being modified, state:
- `_run_triage` (lines 122-141): return type changes to `tuple[list[TriageResult], list[dict[str, Any]]]`; accumulate `issues_raw` list alongside `triage_results`
- `run()` (line 63): unpack tuple from `_run_triage`; thread `issues_raw` to `_review_and_execute`
- `_review_and_execute` (line 72): add `issues_raw` param; call `_check_dependencies`; add wave reorder after `to_execute` is built

**Step 3: Write failing tests for `_check_dependencies`**

Add `TestCheckDependencies` to `dispatcher/tests/test_pipeline.py`:

```python
from unittest.mock import patch, MagicMock

class TestCheckDependencies:
    def _make_issues_raw(self):
        return [
            {"number": 5, "body": "depends on #3", "state": "open"},
            {"number": 3, "body": "", "state": "open"},
        ]

    def test_returns_graph_and_unmet(self):
        from dispatcher.pipeline import _check_dependencies
        graph, unmet = _check_dependencies(self._make_issues_raw(), [3, 5])
        assert graph == {5: [3], 3: []}
        assert unmet == {5: [3]}

    def test_closed_dep_not_unmet(self):
        from dispatcher.pipeline import _check_dependencies
        issues_raw = [
            {"number": 5, "body": "depends on #3", "state": "open"},
            {"number": 3, "body": "", "state": "closed"},
        ]
        graph, unmet = _check_dependencies(issues_raw, [3, 5])
        assert unmet == {}

    def test_returns_empty_on_error(self, capsys):
        from dispatcher.pipeline import _check_dependencies
        # Pass malformed data to trigger ValueError
        issues_raw = [{"number": "not-an-int", "body": None, "state": "open"}]
        graph, unmet = _check_dependencies(issues_raw, [])
        assert graph == {}
        assert unmet == {}
```

**Step 4: Run failing tests**

```bash
python -m pytest dispatcher/tests/test_pipeline.py::TestCheckDependencies -v
```
Expected: ImportError or AttributeError — `_check_dependencies` doesn't exist yet.

**Step 5: Add `dispatcher.dependencies` import to `pipeline.py`**

After line 23 (`from dispatcher.github import GithubError`), add:

```python
from dispatcher import dependencies as dep_module
```

**Step 6: Modify `_run_triage()` to return tuple**

Change `_run_triage` (lines 122-141):

```python
def _run_triage(
    conn, run_id: str, selected_numbers: list[int], config: Config
) -> tuple[list[TriageResult], list[dict[str, Any]]]:
    triage_results = []
    issues_raw: list[dict[str, Any]] = []
    for number in selected_numbers:
        try:
            issue_data = github.view_issue(number, config.repo)
        except GithubError as exc:
            print(f"  Error fetching #{number}: {exc}. Skipping.")
            continue

        issues_raw.append(issue_data)  # collect raw dict (has body + state)
        try:
            tr = triage_issue(issue_data, number, f"https://github.com/{config.repo}/issues/{number}", config)
        except TriageError as exc:
            print(f"  Triage error for #{number}: {exc}. Skipping.")
            continue

        triage_results.append(tr)
        db.insert_issue(conn, run_id, tr)
        print(f"  #{number}: {tr.issue_title} → {tr.triage_tier} ({tr.confidence:.2f})")
    return triage_results, issues_raw
```

Add `from typing import Any` to the imports at top of pipeline.py if not already present.

**Step 7: Update `run()` to unpack the tuple**

Change lines 63-69 in `run()`:

```python
triage_results, issues_raw = _run_triage(conn, run_id, selected_numbers, config)
if not triage_results:
    db.update_run_status(conn, run_id, "failed")
    return 1

triage_results.sort(key=lambda t: t.confidence, reverse=True)
return _review_and_execute(conn, run_id, triage_results, issues_raw, start_time, config)
```

**Step 8: Add `_format_dep_warnings` and `_check_dependencies` functions**

Insert before `_review_and_execute` (after line 70):

```python
def _format_dep_warnings(unmet: dict[int, list[int]]) -> None:
    """Print stdout warning for each issue with unmet dependencies."""
    for issue_num, missing in sorted(unmet.items()):
        for dep in missing:
            print(f"  ⚠  Dependency warning: #{issue_num} depends on #{dep} which is not yet complete.")


def _check_dependencies(
    issues_raw: list[dict[str, Any]],
    selected_numbers: list[int],
) -> tuple[dict[int, list[int]], dict[int, list[int]]]:
    """Build dep graph and find unmet deps. Never raises.
    Returns (graph, unmet). Returns ({}, {}) on any error."""
    try:
        graph = dep_module.build_dep_graph(issues_raw)
        closed = {d["number"] for d in issues_raw if d.get("state") == "closed"}
        unmet = dep_module.find_unmet(graph, batch=set(selected_numbers), closed=closed)
        _format_dep_warnings(unmet)
        return graph, unmet
    except dep_module.CycleError as exc:
        print(f"  ⚠  Circular dependency detected: {exc}. Wave ordering disabled; executing in original order.")
        return {}, {}
    except (GithubError, ValueError) as exc:
        print(f"  Warning: dependency check failed: {exc}. Continuing without dep analysis.")
        return {}, {}
```

**Step 9: Update `_review_and_execute` signature and body**

Change `_review_and_execute` to accept `issues_raw` and perform dep check + wave reorder:

```python
def _review_and_execute(
    conn, run_id: str, triage_results: list[TriageResult],
    issues_raw: list[dict[str, Any]], start_time: float, config: Config,
) -> int:
    selected_numbers = [tr.issue_number for tr in triage_results]
    dep_graph, unmet = _check_dependencies(issues_raw, selected_numbers)

    reviewed = _run_review(triage_results, dep_graph, unmet, config)
    if reviewed is None:
        db.update_run_status(conn, run_id, "cancelled")
        return 0

    to_execute = [r for r in reviewed if not r.skipped and r.final_tier != "parked"]
    parked = [r for r in reviewed if r.final_tier == "parked" and not r.skipped]

    # Auto mode: reorder to_execute into dependency waves
    if config.auto and dep_graph and to_execute:
        try:
            nums = [r.triage.issue_number for r in to_execute]
            waves = dep_module.dep_waves(dep_graph, nums)
            lookup = {r.triage.issue_number: r for r in to_execute}
            print("\n  Dependency waves detected:")
            for i, wave in enumerate(waves, 1):
                print(f"    Wave {i}: {', '.join(f'#{n}' for n in wave)}")
            print("  Executing waves sequentially...\n")
            to_execute = [lookup[n] for wave in waves for n in wave if n in lookup]
        except dep_module.CycleError:
            pass  # already warned in _check_dependencies; proceed with original order

    if not to_execute and not config.dry_run:
        _post_parked_comments(parked, config)
        db.update_run_status(conn, run_id, "completed")
        return 3

    if config.dry_run:
        print("\nDry run — skipping execution.")
        db.update_run_status(conn, run_id, "completed")
        return 0

    results, total_turns = _run_execution(conn, run_id, to_execute, config)
    _post_parked_comments(parked, config)
    _print_summary(results, parked, to_execute, total_turns, start_time, config)

    failed_count = sum(1 for er in results if er.outcome in ("failed", "leash_hit"))
    db.update_run_status(conn, run_id, "completed" if failed_count == 0 else "failed")
    return 0 if failed_count == 0 else 1
```

**Step 10: Update `_run_review` to accept and pass dep data to ReviewApp**

Change `_run_review` signature (line 143):

```python
def _run_review(
    triage_results: list[TriageResult],
    dep_graph: dict[int, list[int]],
    unmet: dict[int, list[int]],
    config: Config,
) -> list[ReviewedIssue] | None:
    if config.auto:
        return [
            ReviewedIssue(triage=tr, final_tier=tr.triage_tier, skipped=False, edited_comment=None)
            for tr in triage_results
        ]

    from dispatcher.tui.review import ReviewApp

    app = ReviewApp(triage_results=triage_results, unmet=unmet)
    reviewed = app.run()
    return reviewed if reviewed else None
```

**Step 11: Run tests to verify pipeline changes pass**

```bash
python -m pytest dispatcher/tests/test_pipeline.py -v
```
Expected: All tests PASS including TestCheckDependencies.

**Step 12: Run full test suite**

```bash
python -m pytest dispatcher/tests/ -v --ignore=dispatcher/tests/test_tui
```
Expected: All tests PASS.

**Step 13: Commit**

```bash
git add dispatcher/pipeline.py
git commit -m "feat(pipeline): add _check_dependencies and dep-wave reordering to pipeline"
```

---

### Task 4: Modify `dispatcher/tui/review.py` — Deps column + warning banner

**Acceptance Criteria:**
- [ ] `ReviewApp.__init__` accepts `unmet` keyword parameter measured by parameter presence verified by `grep "unmet" dispatcher/tui/review.py`
- [ ] `"Deps"` column appears in `add_columns()` call measured by column label presence verified by `grep '"Deps"' dispatcher/tui/review.py`
- [ ] `Static` widget with `id="dep-warning"` exists in `compose()` measured by widget definition presence verified by `grep "dep-warning" dispatcher/tui/review.py`
- [ ] ReviewApp dep TUI tests pass measured by zero failures verified by `python -m pytest dispatcher/tests/test_tui/test_review.py -k "deps" -v`

**Files:**
- Modify: `dispatcher/tui/review.py:28-49` (__init__ + compose)
- Modify: `dispatcher/tests/test_tui/test_review.py`

**Quality Constraints:**
- Types: `unmet: dict[int, list[int]] | None = None`
- Textual: `widget.visible = False` (not CSS class); `Static.update(content)` for banner text
- Test pattern: `@pytest.mark.asyncio` + keyword args + `async with app.run_test() as pilot:`
- Files modified: `dispatcher/tui/review.py` (116 lines — design-first required)
- Parallelizable: yes

**Step 1: Read `dispatcher/tui/review.py` in full**

Understand exact compose() structure before editing. Focus on lines 28-49 (init + compose).

**Step 2: Output change plan**

- `__init__`: add `unmet: dict[int, list[int]] | None = None` parameter; store as `self._unmet`
- `compose()`: add `"Deps"` to `add_columns()`; add deps value per row; add `Static("", id="dep-warning")` before `yield table`; call `on_mount` to set banner visibility
- `on_mount()`: new method — sets dep-warning banner text and visibility if `self._unmet`

**Step 3: Write failing TUI test for Deps column**

Append to `dispatcher/tests/test_tui/test_review.py`:

```python
@pytest.mark.asyncio
async def test_review_deps_column():
    from dispatcher.tui.review import ReviewApp
    from dispatcher.models import TriageResult
    tr = TriageResult(
        issue_number=5, issue_title="Test", issue_url="",
        scope="quick-fix", richness_score=2, richness_signals={},
        triage_tier="full-yolo", confidence=0.9,
        risk_flags=[], missing_info=[], reasoning="",
    )
    unmet = {5: [3]}
    app = ReviewApp(triage_results=[tr], unmet=unmet)
    async with app.run_test() as pilot:
        table = app.query_one("DataTable")
        # Verify "Deps" column exists
        col_labels = [str(c.label) for c in table.columns.values()]
        assert "Deps" in col_labels

@pytest.mark.asyncio
async def test_review_dep_warning_banner_visible():
    from dispatcher.tui.review import ReviewApp
    from dispatcher.models import TriageResult
    tr = TriageResult(
        issue_number=5, issue_title="Test", issue_url="",
        scope="quick-fix", richness_score=2, richness_signals={},
        triage_tier="full-yolo", confidence=0.9,
        risk_flags=[], missing_info=[], reasoning="",
    )
    unmet = {5: [3]}
    app = ReviewApp(triage_results=[tr], unmet=unmet)
    async with app.run_test() as pilot:
        banner = app.query_one("#dep-warning")
        assert banner.visible is True

@pytest.mark.asyncio
async def test_review_dep_warning_banner_hidden_when_no_unmet():
    from dispatcher.tui.review import ReviewApp
    from dispatcher.models import TriageResult
    tr = TriageResult(
        issue_number=5, issue_title="Test", issue_url="",
        scope="quick-fix", richness_score=2, richness_signals={},
        triage_tier="full-yolo", confidence=0.9,
        risk_flags=[], missing_info=[], reasoning="",
    )
    app = ReviewApp(triage_results=[tr], unmet={})
    async with app.run_test() as pilot:
        banner = app.query_one("#dep-warning")
        assert banner.visible is False
```

**Step 4: Run tests to verify they fail**

```bash
python -m pytest dispatcher/tests/test_tui/test_review.py -k "deps" -v
```
Expected: FAIL — `ReviewApp.__init__` doesn't accept `unmet` param yet.

**Step 5: Edit `review.py` `__init__`**

Change line 28:
```python
# Before:
def __init__(self, triage_results: list[TriageResult]) -> None:
    super().__init__()
    self._results = triage_results
    self._tiers: dict[int, str] = {tr.issue_number: tr.triage_tier for tr in triage_results}
    self._skipped: set[int] = set()
    self._comments: dict[int, str | None] = {}
    self.reviewed: list[ReviewedIssue] = []

# After:
def __init__(
    self,
    triage_results: list[TriageResult],
    unmet: dict[int, list[int]] | None = None,
) -> None:
    super().__init__()
    self._results = triage_results
    self._unmet = unmet or {}
    self._tiers: dict[int, str] = {tr.issue_number: tr.triage_tier for tr in triage_results}
    self._skipped: set[int] = set()
    self._comments: dict[int, str | None] = {}
    self.reviewed: list[ReviewedIssue] = []
```

**Step 6: Edit `compose()` — add Deps column and banner**

Change `compose()` (lines 36-49):

```python
def compose(self) -> ComposeResult:
    yield Header()
    # Dep warning banner — hidden by default, shown in on_mount if unmet deps exist
    yield Static("", id="dep-warning", markup=False)
    table = DataTable()
    table.add_columns("#", "Issue", "Tier", "Confidence", "Flags", "Deps")
    for tr in self._results:
        flags = ", ".join(tr.risk_flags) if tr.risk_flags else "—"
        deps_val = (
            f"needs #{', #'.join(str(d) for d in self._unmet[tr.issue_number])}"
            if tr.issue_number in self._unmet
            else "—"
        )
        table.add_row(
            str(tr.issue_number), tr.issue_title,
            tr.triage_tier, f"{tr.confidence:.2f}", flags, deps_val,
            key=str(tr.issue_number),
        )
    yield table
    yield Static("", id="detail-panel")
    yield Footer()
```

**Step 7: Add `on_mount()` to set banner visibility**

Add after the `compose` method:

```python
def on_mount(self) -> None:
    banner = self.query_one("#dep-warning", Static)
    if self._unmet:
        pairs = ", ".join(
            f"#{issue} → #{dep}"
            for issue, deps in sorted(self._unmet.items())
            for dep in deps
        )
        banner.update(f"⚠  Unmet dependencies: {pairs}")
        banner.visible = True
    else:
        banner.visible = False
```

**Step 8: Run TUI tests to verify pass**

```bash
python -m pytest dispatcher/tests/test_tui/test_review.py -v
```
Expected: All tests PASS.

**Step 9: Commit**

```bash
git add dispatcher/tui/review.py dispatcher/tests/test_tui/test_review.py
git commit -m "feat(tui): add Deps column and unmet-dep warning banner to ReviewApp"
```

---

### Task 5: Modify `dispatcher/tui/selection.py` — `→ needs #N` suffix

**Acceptance Criteria:**
- [ ] `SelectionApp.__init__` accepts `unmet_deps` keyword parameter measured by parameter presence verified by `grep "unmet_deps" dispatcher/tui/selection.py`
- [ ] Label-building loop appends dep suffix measured by suffix logic presence verified by `grep "needs" dispatcher/tui/selection.py`
- [ ] SelectionApp dep-suffix TUI tests pass measured by zero failures verified by `python -m pytest dispatcher/tests/test_tui/test_selection.py -k "dep" -v`

**Files:**
- Modify: `dispatcher/tui/selection.py:21-41` (__init__ + compose label loop)
- Modify: `dispatcher/tests/test_tui/test_selection.py`

**Quality Constraints:**
- Types: `unmet_deps: dict[int, list[int]] | None = None`
- Pattern: follows existing parked indicator at selection.py:38 (f-string string concat)
- Test pattern: `@pytest.mark.asyncio` + keyword args + `async with app.run_test() as pilot:`
- Files modified: `dispatcher/tui/selection.py` (60 lines — not design-first)
- Parallelizable: yes

**Step 1: Read `dispatcher/tui/selection.py` in full**

Confirm exact label-building code at lines 35-40.

**Step 2: Write failing test for dep suffix**

Append to `dispatcher/tests/test_tui/test_selection.py`:

```python
@pytest.mark.asyncio
async def test_selection_dep_suffix():
    from dispatcher.tui.selection import SelectionApp
    issues = [{"number": 5, "title": "Implement login"}]
    unmet_deps = {5: [3]}
    app = SelectionApp(issues=issues, parked_numbers=set(), label="test", unmet_deps=unmet_deps)
    async with app.run_test() as pilot:
        sl = app.query_one("SelectionList")
        # Check that at least one option label contains the dep suffix
        labels = [str(opt.prompt) for opt in sl._options]
        assert any("needs #3" in label for label in labels)

@pytest.mark.asyncio
async def test_selection_no_dep_suffix_when_no_unmet():
    from dispatcher.tui.selection import SelectionApp
    issues = [{"number": 5, "title": "Implement login"}]
    app = SelectionApp(issues=issues, parked_numbers=set(), label="test", unmet_deps={})
    async with app.run_test() as pilot:
        sl = app.query_one("SelectionList")
        labels = [str(opt.prompt) for opt in sl._options]
        assert not any("needs" in label for label in labels)
```

**Step 3: Run tests to verify they fail**

```bash
python -m pytest dispatcher/tests/test_tui/test_selection.py -k "dep" -v
```
Expected: FAIL — `SelectionApp.__init__` doesn't accept `unmet_deps` param yet.

**Step 4: Edit `SelectionApp.__init__`**

Change line 21:
```python
# Before:
def __init__(self, issues: list[dict], parked_numbers: set[int], label: str) -> None:
    super().__init__()
    self._issues = issues
    self._parked = parked_numbers
    self._label = label
    self.selected: list[int] = []

# After:
def __init__(
    self,
    issues: list[dict],
    parked_numbers: set[int],
    label: str,
    unmet_deps: dict[int, list[int]] | None = None,
) -> None:
    super().__init__()
    self._issues = issues
    self._parked = parked_numbers
    self._label = label
    self._unmet_deps = unmet_deps or {}
    self.selected: list[int] = []
```

**Step 5: Edit label-building loop in `compose()`**

Change lines 35-40:
```python
# Before:
for issue in self._issues:
    number = issue["number"]
    title = issue["title"]
    parked_mark = " ↻ parked" if number in self._parked else ""
    label = f"#{number} {title}{parked_mark}"
    items.append((label, number))

# After:
for issue in self._issues:
    number = issue["number"]
    title = issue["title"]
    parked_mark = " ↻ parked" if number in self._parked else ""
    dep_mark = (
        f" → needs #{', #'.join(str(d) for d in self._unmet_deps[number])}"
        if number in self._unmet_deps
        else ""
    )
    label = f"#{number} {title}{parked_mark}{dep_mark}"
    items.append((label, number))
```

**Step 6: Update `_select_issues` in `pipeline.py` to pass `unmet_deps`**

In `pipeline.py` `_select_issues()` (line 117), update the `SelectionApp` call. This requires `_select_issues` to receive `unmet_deps`. Since `_select_issues` is called from `run()` (line 54), and `_check_dependencies` runs later, the simplest approach is to pass an empty `unmet_deps` here — the dep check runs after selection, so no unmet info is available at selection time.

Actually, `_check_dependencies` runs after `_run_triage` which runs after `_select_issues`. So `SelectionApp` is shown BEFORE triage and dep detection. The `unmet_deps` for `SelectionApp` would need to come from the previous run's DB state. For this implementation, leave `SelectionApp` dep suffix support as infrastructure only (parameter exists, `pipeline._select_issues` passes `unmet_deps={}` for now).

Change line 117 in `_select_issues`:
```python
app = SelectionApp(issues=issues, parked_numbers=parked_numbers, label=config.default_label, unmet_deps={})
```

**Step 7: Run all TUI tests**

```bash
python -m pytest dispatcher/tests/test_tui/ -v
```
Expected: All tests PASS.

**Step 8: Run full test suite**

```bash
python -m pytest dispatcher/tests/ -v
```
Expected: All tests PASS.

**Step 9: Commit**

```bash
git add dispatcher/tui/selection.py dispatcher/tests/test_tui/test_selection.py dispatcher/pipeline.py
git commit -m "feat(tui): add → needs #N dep suffix to SelectionApp labels"
```

---

## Acceptance Criteria

- [ ] `dispatcher/dependencies.py` exists with `extract_deps`, `build_dep_graph`, `dep_waves`, `find_unmet`, `CycleError`
- [ ] `extract_deps` matches `depends on #N` and `blocked by #N` (case-insensitive); ignores `closes #N`/`fixes #N`
- [ ] `extract_deps(None)` returns `[]` without error
- [ ] `dep_waves` returns correct topological order for a two-issue chain (`#5` depends on `#3` → `[[3], [5]]`)
- [ ] `dep_waves` raises `CycleError` (not a crash) when a cycle is present (including self-loops)
- [ ] `find_unmet` excludes closed issues (treats them as satisfied)
- [ ] `github.view_issue()` fetches `state` field alongside `title,body,comments`
- [ ] `_run_triage()` returns `tuple[list[TriageResult], list[dict[str, Any]]]` with raw issue dicts
- [ ] `pipeline._check_dependencies()` runs after triage, prints stdout warning for each unmet dep
- [ ] Auto mode: `to_execute` is reordered into dep waves before `_run_execution()`; waves printed to stdout
- [ ] Interactive mode: `ReviewApp` shows "Deps" column; unmet-dep warning `Static` widget appears when relevant
- [ ] `SelectionApp` accepts `unmet_deps` parameter and shows ` → needs #N` suffix on issues with unresolved deps
- [ ] Dep outside batch: warning printed, execution not blocked
- [ ] Circular dep: `CycleError` caught, warning printed, original order used, run continues
- [ ] Closed deps: no warning shown (treated as satisfied)
- [ ] `dispatcher/tests/test_dependencies.py` covers: `extract_deps` (all patterns, false-positive resistance, None body), `dep_waves` (chain, fork, diamond, self-loop, cycle), `find_unmet` (in-batch, out-of-batch, closed)
- [ ] `docs/plans/2026-03-09-cross-feature-dependency-detection.md` exists with full task breakdown and Progress Index
