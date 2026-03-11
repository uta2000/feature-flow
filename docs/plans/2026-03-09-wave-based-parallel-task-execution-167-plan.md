# Wave-Based Parallel Task Execution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `dispatcher/wave_planner.py` — a topological-sort CLI that reads explicit `Depends on:` / `depends_on=` declarations from prose and XML plans and outputs ordered execution waves as JSON, then wire it into the subagent orchestrator's Phase A and the verify-plan-criteria skill.

**Architecture:** A standalone Python module (`dispatcher/wave_planner.py`) implements format detection, dependency parsing (prose and XML), Kahn's algorithm, and JSON output. The `subagent-driven-development` orchestrator's Phase A is updated to call it first and use its `has_explicit_deps` flag to decide whether to skip the existing heuristic phases. The `verify-plan-criteria` skill gets a new dependency-graph validation step. The XML format reference is updated to document the new `depends_on` attribute.

**Tech Stack:** Python ≥3.11, stdlib only (`argparse`, `json`, `re`, `xml.etree.ElementTree`, `collections`). Test with `pytest`.

---

<!-- PROGRESS INDEX
Task 1: Create dispatcher/wave_planner.py — STATUS: pending
Task 2: Create dispatcher/tests/test_wave_planner.py — STATUS: pending
Task 3: Update yolo-overrides.md Phase A — STATUS: pending
Task 4: Update verify-plan-criteria/SKILL.md — STATUS: pending
Task 5: Update references/xml-plan-format.md — STATUS: pending
Task 6: Add Progress Index to design doc — STATUS: pending
CURRENT: none
-->

---

### Task 1: Create `dispatcher/wave_planner.py`

**Files:**
- Create: `dispatcher/wave_planner.py`

**Parallelizable:** yes

**Quality Constraints:**
- Error handling: every error path returns `{"waves": [], "errors": [...], "has_explicit_deps": ...}` and exits 1; no bare `except` clauses
- Function length: each function ≤ 30 lines; helpers extracted for parse prose, parse XML, validate refs, find cycle, Kahn sort
- Pattern: follow `dispatcher/cli.py` — separate `build_parser()`, `main()` only calls parser + `plan_waves()` + `sys.exit()`
- Invocable as `python -m dispatcher.wave_planner` (requires `if __name__ == "__main__": main()` block)

**Acceptance Criteria:**
- [ ] `python -m dispatcher.wave_planner --plan-file <path>` exits 0 and prints valid JSON measured by manual invocation verified by `python -m dispatcher.wave_planner --plan-file /dev/null; echo $?` returns 0
- [ ] JSON contains `waves`, `errors`, `has_explicit_deps` keys measured by key presence verified by `python -m dispatcher.wave_planner --plan-file <test_file> | python -c "import json,sys; d=json.load(sys.stdin); assert 'waves' in d and 'errors' in d and 'has_explicit_deps' in d"`
- [ ] Cycle exits 1 with `waves: []` and error containing "cycle" measured by exit code and output verified by test
- [ ] Invalid ref exits 1 with error containing "does not exist" measured by exit code and output verified by test
- [ ] No-deps plan: `has_explicit_deps: false`, all tasks in Wave 1 measured by output verified by test
- [ ] Prose `Depends on: Task N` parsed correctly measured by wave structure verified by test
- [ ] XML `depends_on="N,M"` parsed correctly measured by wave structure verified by test

**Step 1: Create `dispatcher/wave_planner.py` with complete implementation**

```python
"""Wave planner: reads a feature-flow plan file and outputs topologically-sorted
task waves as JSON.

Usage: python -m dispatcher.wave_planner --plan-file <path>

Output JSON:
  {"waves": [[task_ids...], ...], "errors": ["..."], "has_explicit_deps": bool}
  Exit 0 on success, 1 on error.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import deque
from pathlib import Path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="dispatcher.wave_planner",
        description="Read a plan file and output topologically-sorted task waves.",
    )
    parser.add_argument(
        "--plan-file",
        required=True,
        metavar="PATH",
        help="Path to the prose or XML plan file",
    )
    return parser


def _is_xml(content: str) -> bool:
    """Return True if the file is an XML plan."""
    in_fence = False
    line_count = 0
    for line in content.splitlines():
        if line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        line_count += 1
        if line_count > 50:
            break
        if re.match(r"^<plan\s+version=", line.strip()):
            return "</plan>" in content
    return False


def _parse_prose(content: str) -> tuple[set[int], dict[int, set[int]], bool]:
    """Parse prose plan for task IDs and `Depends on:` lines.

    Returns (task_ids, deps, has_explicit_deps).
    deps[task_id] = set of predecessor task IDs.
    """
    task_ids: set[int] = set()
    deps: dict[int, set[int]] = {}
    has_explicit_deps = False
    current_task: int | None = None
    heading_re = re.compile(r"^#{1,6}\s+Task\s+(\d+)\b", re.IGNORECASE)
    depends_re = re.compile(r"^\s*-\s+Depends\s+on:\s*(.+)$", re.IGNORECASE)
    ref_re = re.compile(r"\bTask\s+(\d+)\b", re.IGNORECASE)

    for line in content.splitlines():
        m = heading_re.match(line)
        if m:
            current_task = int(m.group(1))
            task_ids.add(current_task)
            continue
        if current_task is not None:
            dm = depends_re.match(line)
            if dm:
                refs = [int(r) for r in ref_re.findall(dm.group(1))]
                if refs:
                    deps.setdefault(current_task, set()).update(refs)
                    has_explicit_deps = True
    return task_ids, deps, has_explicit_deps


def _parse_xml(content: str) -> tuple[set[int], dict[int, set[int]], bool]:
    """Parse XML plan for task IDs and `depends_on` attributes."""
    task_ids: set[int] = set()
    deps: dict[int, set[int]] = {}
    has_explicit_deps = False
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return task_ids, deps, has_explicit_deps
    for task in root.findall(".//task"):
        try:
            tid = int(task.get("id", "").strip())
        except ValueError:
            continue
        task_ids.add(tid)
        raw = task.get("depends_on", "").strip()
        if raw:
            preds: set[int] = set()
            for part in raw.split(","):
                try:
                    preds.add(int(part.strip()))
                except ValueError:
                    pass
            if preds:
                deps.setdefault(tid, set()).update(preds)
                has_explicit_deps = True
    return task_ids, deps, has_explicit_deps


def _validate(task_ids: set[int], deps: dict[int, set[int]]) -> list[str]:
    """Return error strings for invalid dependency references."""
    errors: list[str] = []
    for tid, preds in sorted(deps.items()):
        for pred in sorted(preds):
            if pred not in task_ids:
                errors.append(f"Task {tid}: Depends on Task {pred} which does not exist")
    return errors


def _find_cycle(task_ids: set[int], successors: dict[int, list[int]]) -> list[int]:
    """Return one cycle path as a list of task IDs, or [] if no cycle (DFS)."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[int, int] = {tid: WHITE for tid in task_ids}
    parent: dict[int, int] = {}

    def dfs(u: int) -> list[int]:
        color[u] = GRAY
        for v in sorted(successors.get(u, [])):
            if color[v] == GRAY:
                path = [v, u]
                node = u
                while parent.get(node) != v and node in parent:
                    node = parent[node]
                    path.append(node)
                path.append(v)
                path.reverse()
                return path
            if color[v] == WHITE:
                parent[v] = u
                result = dfs(v)
                if result:
                    return result
        color[u] = BLACK
        return []

    for tid in sorted(task_ids):
        if color[tid] == WHITE:
            result = dfs(tid)
            if result:
                return result
    return []


def _kahn(
    task_ids: set[int], deps: dict[int, set[int]]
) -> tuple[list[list[int]], list[str]]:
    """Kahn's topological sort. Returns (waves, errors)."""
    in_degree: dict[int, int] = {tid: 0 for tid in task_ids}
    successors: dict[int, list[int]] = {tid: [] for tid in task_ids}
    for tid, preds in deps.items():
        for pred in preds:
            if pred in task_ids:
                in_degree[tid] += 1
                successors[pred].append(tid)
    waves: list[list[int]] = []
    queue = deque(sorted(tid for tid, deg in in_degree.items() if deg == 0))
    processed = 0
    while queue:
        wave = sorted(queue)
        queue.clear()
        waves.append(wave)
        processed += len(wave)
        for tid in wave:
            for succ in sorted(successors[tid]):
                in_degree[succ] -= 1
                if in_degree[succ] == 0:
                    queue.append(succ)
    if processed < len(task_ids):
        cycle = _find_cycle(task_ids, successors)
        if cycle:
            path = " → ".join(f"Task {t}" for t in cycle)
            return [], [f"cycle: {path}"]
        remaining = sorted(tid for tid in task_ids if in_degree[tid] > 0)
        return [], [f"cycle detected among tasks: {remaining}"]
    return waves, []


def plan_waves(plan_file: str) -> tuple[dict, int]:
    """Parse plan file and compute waves. Returns (result_dict, exit_code)."""
    path = Path(plan_file)
    if not path.is_file():
        return {"waves": [], "errors": [f"file not found: {plan_file}"], "has_explicit_deps": False}, 1
    content = path.read_text(encoding="utf-8")
    if _is_xml(content):
        task_ids, deps, has_explicit_deps = _parse_xml(content)
    else:
        task_ids, deps, has_explicit_deps = _parse_prose(content)
    if not task_ids:
        return {"waves": [], "errors": [], "has_explicit_deps": False}, 0
    ref_errors = _validate(task_ids, deps)
    if ref_errors:
        return {"waves": [], "errors": ref_errors, "has_explicit_deps": has_explicit_deps}, 1
    waves, cycle_errors = _kahn(task_ids, deps)
    if cycle_errors:
        return {"waves": [], "errors": cycle_errors, "has_explicit_deps": has_explicit_deps}, 1
    return {"waves": waves, "errors": [], "has_explicit_deps": has_explicit_deps}, 0


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    result, exit_code = plan_waves(args.plan_file)
    print(json.dumps(result))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
```

**Step 2: Verify the module is invocable**

```bash
cd /Users/paulholstein/projects/feature-flow
python -m dispatcher.wave_planner --help
```

Expected: usage message, exit 0.

**Step 3: Smoke test with a simple plan**

```bash
echo '### Task 1: Alpha
### Task 2: Beta
**Quality Constraints:**
- Depends on: Task 1' > /tmp/smoke_plan.md
python -m dispatcher.wave_planner --plan-file /tmp/smoke_plan.md
```

Expected output: `{"waves": [[1], [2]], "errors": [], "has_explicit_deps": true}`

**Step 4: Commit**

```bash
git add dispatcher/wave_planner.py
git commit -m "feat(dispatcher): add wave_planner.py — topological sort for task dependencies — ✓ wave_planner.py exists and runs"
```

---

### Task 2: Create `dispatcher/tests/test_wave_planner.py`

**Files:**
- Create: `dispatcher/tests/test_wave_planner.py`

**Parallelizable:** no
**Depends on: Task 1**

**Quality Constraints:**
- Tests use subprocess to invoke `python -m dispatcher.wave_planner` (integration style, matches existing test_execute.py pattern)
- Each test class covers one scenario; test methods are focused assertions
- Use `textwrap.dedent` for multiline plan strings
- No mocking needed — pure subprocess tests

**Acceptance Criteria:**
- [ ] All 7 test classes present and passing measured by pytest output verified by `pytest dispatcher/tests/test_wave_planner.py -v`
- [ ] Cycle test asserts exit code 1 and "cycle" in error message measured by assertions verified by `pytest dispatcher/tests/test_wave_planner.py::TestCycleDetection -v`
- [ ] XML test asserts `has_explicit_deps: true` and correct waves measured by assertions verified by `pytest dispatcher/tests/test_wave_planner.py::TestXmlPlan -v`
- [ ] No-deps test asserts `has_explicit_deps: false` measured by assertions verified by `pytest dispatcher/tests/test_wave_planner.py::TestAllParallel -v`

**Step 1: Create `dispatcher/tests/test_wave_planner.py`**

```python
"""Tests for dispatcher.wave_planner."""
from __future__ import annotations

import json
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest


def _run(plan_content: str, tmp_path: Path) -> tuple[dict, int]:
    """Write plan to a temp file and run wave_planner. Returns (output_dict, exit_code)."""
    plan_file = tmp_path / "plan.md"
    plan_file.write_text(textwrap.dedent(plan_content), encoding="utf-8")
    result = subprocess.run(
        [sys.executable, "-m", "dispatcher.wave_planner", "--plan-file", str(plan_file)],
        capture_output=True,
        text=True,
    )
    output = json.loads(result.stdout) if result.stdout.strip() else {}
    return output, result.returncode


class TestBasicTwoWave:
    """Task 3 depends on Tasks 1 and 2; Tasks 1, 2 are independent."""

    def test_wave_structure(self, tmp_path: Path) -> None:
        plan = """
            ### Task 1: Setup
            **Quality Constraints:**
            - Parallelizable: yes

            ### Task 2: Auth
            **Quality Constraints:**
            - Parallelizable: yes

            ### Task 3: Integration
            **Quality Constraints:**
            - Depends on: Task 1, Task 2
        """
        output, code = _run(plan, tmp_path)
        assert code == 0
        assert output["has_explicit_deps"] is True
        assert output["errors"] == []
        waves = output["waves"]
        assert len(waves) == 2
        assert set(waves[0]) == {1, 2}
        assert waves[1] == [3]


class TestCycleDetection:
    """Task 1 depends on Task 2; Task 2 depends on Task 1 — cycle."""

    def test_cycle_exits_1(self, tmp_path: Path) -> None:
        plan = """
            ### Task 1: A
            **Quality Constraints:**
            - Depends on: Task 2

            ### Task 2: B
            **Quality Constraints:**
            - Depends on: Task 1
        """
        output, code = _run(plan, tmp_path)
        assert code == 1
        assert output["waves"] == []
        assert len(output["errors"]) >= 1
        assert "cycle" in output["errors"][0].lower()


class TestInvalidRef:
    """Task 2 depends on Task 99 which does not exist."""

    def test_invalid_ref_exits_1(self, tmp_path: Path) -> None:
        plan = """
            ### Task 1: First
            **Quality Constraints:**
            - Parallelizable: yes

            ### Task 2: Second
            **Quality Constraints:**
            - Depends on: Task 99
        """
        output, code = _run(plan, tmp_path)
        assert code == 1
        assert output["waves"] == []
        assert any("Task 99" in e and "does not exist" in e for e in output["errors"])


class TestSingleTask:
    """Plan with exactly one task."""

    def test_single_task_one_wave(self, tmp_path: Path) -> None:
        plan = """
            ### Task 1: Only task
            **Quality Constraints:**
            - Parallelizable: yes
        """
        output, code = _run(plan, tmp_path)
        assert code == 0
        assert output["waves"] == [[1]]
        assert output["has_explicit_deps"] is False


class TestAllParallel:
    """No dependency declarations — all tasks independent, all in Wave 1."""

    def test_all_in_wave_1(self, tmp_path: Path) -> None:
        plan = """
            ### Task 1: Alpha
            ### Task 2: Beta
            ### Task 3: Gamma
        """
        output, code = _run(plan, tmp_path)
        assert code == 0
        assert len(output["waves"]) == 1
        assert sorted(output["waves"][0]) == [1, 2, 3]
        assert output["has_explicit_deps"] is False


class TestAllSequential:
    """Each task depends on prior — one task per wave."""

    def test_sequential_waves(self, tmp_path: Path) -> None:
        plan = """
            ### Task 1: First
            **Quality Constraints:**
            - Parallelizable: yes

            ### Task 2: Second
            **Quality Constraints:**
            - Depends on: Task 1

            ### Task 3: Third
            **Quality Constraints:**
            - Depends on: Task 2
        """
        output, code = _run(plan, tmp_path)
        assert code == 0
        assert output["has_explicit_deps"] is True
        assert output["waves"] == [[1], [2], [3]]


class TestXmlPlan:
    """XML plan with `depends_on` attribute."""

    def test_xml_depends_on(self, tmp_path: Path) -> None:
        plan = """<plan version="1.0">
  <task id="1" status="pending">
    <title>Setup</title>
  </task>
  <task id="2" status="pending">
    <title>Auth</title>
  </task>
  <task id="3" depends_on="1,2" status="pending">
    <title>Integration</title>
  </task>
</plan>"""
        # Write without dedent — XML must be well-formed
        plan_file = tmp_path / "plan.md"
        plan_file.write_text(plan, encoding="utf-8")
        result = subprocess.run(
            [sys.executable, "-m", "dispatcher.wave_planner", "--plan-file", str(plan_file)],
            capture_output=True,
            text=True,
        )
        output = json.loads(result.stdout)
        assert result.returncode == 0
        assert output["has_explicit_deps"] is True
        assert output["errors"] == []
        waves = output["waves"]
        assert len(waves) == 2
        assert set(waves[0]) == {1, 2}
        assert waves[1] == [3]
```

**Step 2: Run all tests**

```bash
cd /Users/paulholstein/projects/feature-flow
pytest dispatcher/tests/test_wave_planner.py -v
```

Expected: 7 test classes, all PASS.

**Step 3: Commit**

```bash
git add dispatcher/tests/test_wave_planner.py
git commit -m "test(dispatcher): add test_wave_planner.py — 7 test classes covering all AC scenarios — ✓ all 7 test cases pass"
```

---

### Task 3: Update `skills/start/references/yolo-overrides.md` — Phase A

**Files:**
- Modify: `skills/start/references/yolo-overrides.md`

**Parallelizable:** yes

**Quality Constraints:**
- Preserve all existing Phase A–D text verbatim — only ADD the new detection step before Phase A
- The new step reads naturally as "Phase A.0" or "Pre-Phase A"

**Acceptance Criteria:**
- [ ] File contains `python -m dispatcher.wave_planner` invocation in Phase A section measured by text presence verified by `grep -n "wave_planner" skills/start/references/yolo-overrides.md`
- [ ] File contains `has_explicit_deps` reference measured by text presence verified by `grep -n "has_explicit_deps" skills/start/references/yolo-overrides.md`
- [ ] All existing Phase A/B/C/D text preserved measured by diff review verified by `git diff skills/start/references/yolo-overrides.md`

**Step 1: Read current Phase A header (confirm exact text)**

```bash
grep -n "Phase A" skills/start/references/yolo-overrides.md | head -5
```

Expected: shows `Phase A — Dependency analysis:` at around line 194.

**Step 2: Insert wave_planner detection before Phase A**

Use Edit tool to replace the current Phase A header block. Find this exact text:

```
   **Phase A — Dependency analysis:**
   - For each task, read its `Parallelizable:` field from Quality Constraints
```

Replace with:

```
   **Phase A — Wave planner detection (deterministic):**
   1. Call `python -m dispatcher.wave_planner --plan-file <path>` (substitute actual plan path)
   2. Parse the JSON output from stdout
   3. If exit 0 AND `"has_explicit_deps": true` in output:
      → Use `waves` array from JSON to build execution waves — **skip Phases A.2, B, C, D**
      → Each element of `waves` is a list of task IDs to dispatch as a parallel batch
   4. Otherwise (exit 1, command not found, or `"has_explicit_deps": false`):
      → Continue to Phase A.2 (existing heuristics)

   **Phase A.2 — Dependency analysis (heuristic fallback):**
   - For each task, read its `Parallelizable:` field from Quality Constraints
```

**Step 3: Verify edit**

```bash
grep -A 12 "Phase A —" skills/start/references/yolo-overrides.md | head -20
```

Expected: shows new Phase A text followed by Phase A.2.

**Step 4: Commit**

```bash
git add skills/start/references/yolo-overrides.md
git commit -m "feat(skills): update yolo-overrides.md Phase A to call wave_planner.py first — ✓ Phase A updated with has_explicit_deps trigger"
```

---

### Task 4: Update `skills/verify-plan-criteria/SKILL.md`

**Files:**
- Modify: `skills/verify-plan-criteria/SKILL.md`

**Parallelizable:** yes

**Quality Constraints:**
- New step inserts before "Step 6: Report" — do not renumber Step 6
- Step is labeled "Step 5.5: Validate Dependency Graph" to avoid renumbering
- Missing tool is non-blocking: skip silently

**Acceptance Criteria:**
- [ ] File contains "Validate Dependency Graph" section measured by text presence verified by `grep -n "Validate Dependency Graph" skills/verify-plan-criteria/SKILL.md`
- [ ] File contains `wave_planner` reference measured by text presence verified by `grep -n "wave_planner" skills/verify-plan-criteria/SKILL.md`
- [ ] Step 6: Report heading still present measured by heading presence verified by `grep -n "Step 6: Report" skills/verify-plan-criteria/SKILL.md`

**Step 1: Find insertion point**

```bash
grep -n "Step 6: Report" skills/verify-plan-criteria/SKILL.md
```

Expected: shows `### Step 6: Report` at around line 228.

**Step 2: Insert new step before Step 6**

Find the exact text `### Step 6: Report` and prepend the new step before it. Use Edit to replace:

old_string:
```
### Step 6: Report
```

new_string:
```
### Step 5.5: Validate Dependency Graph

Call `python -m dispatcher.wave_planner --plan-file <path>` on the plan file (substitute the actual path):

```bash
python -m dispatcher.wave_planner --plan-file <plan_path>
```

- **Exit 0:** dependency graph is valid — continue to Step 6
- **Exit 1:** report each entry in `errors` as a **blocking** finding:
  - Cycle: `"cycle: Task A → Task B → Task A"`
  - Invalid ref: `"Task X: Depends on Task Y which does not exist"`
- **Command not found / ImportError:** skip silently — non-blocking. `wave_planner.py` may not be installed in all environments.

### Step 6: Report
```

**Step 3: Verify**

```bash
grep -n -A 3 "Validate Dependency Graph" skills/verify-plan-criteria/SKILL.md
grep -n "Step 6: Report" skills/verify-plan-criteria/SKILL.md
```

Both should return matches.

**Step 4: Commit**

```bash
git add skills/verify-plan-criteria/SKILL.md
git commit -m "feat(skills): add dependency graph validation step to verify-plan-criteria — ✓ Validate Dependency Graph step added"
```

---

### Task 5: Update `references/xml-plan-format.md`

**Files:**
- Modify: `references/xml-plan-format.md`

**Parallelizable:** yes

**Quality Constraints:**
- Add `depends_on` row after the existing `commit` row in the Task Element attributes table
- Do not change any other content

**Acceptance Criteria:**
- [ ] `depends_on` row present in Task Element attributes table measured by text presence verified by `grep -n "depends_on" references/xml-plan-format.md`
- [ ] Row format matches existing table style (pipe-delimited, same columns) measured by visual inspection verified by `grep -A 1 "depends_on" references/xml-plan-format.md`

**Step 1: Confirm current table tail**

```bash
grep -n "commit" references/xml-plan-format.md | head -3
```

Expected: shows `| \`commit\` | no | git SHA string | ...` at around line 43.

**Step 2: Add `depends_on` row after `commit` row**

Find the exact text of the `commit` row and add the new row after it. Use Edit to replace:

old_string:
```
| `commit` | no | git SHA string | Records the commit that completed this task; optional even when `status="done"` |
```

new_string:
```
| `commit` | no | git SHA string | Records the commit that completed this task; optional even when `status="done"` |
| `depends_on` | no | Comma-separated task IDs (e.g., `"1,2"`) | Declares prerequisite tasks that must complete before this task. Used by `dispatcher/wave_planner.py` for topological sort. If absent, task is treated as independent. |
```

**Step 3: Verify**

```bash
grep -n "depends_on" references/xml-plan-format.md
```

Expected: shows the new row.

**Step 4: Commit**

```bash
git add references/xml-plan-format.md
git commit -m "docs(references): add depends_on attribute to xml-plan-format.md Task Element table — ✓ depends_on documented"
```

---

### Task 6: Add Progress Index to design doc

**Files:**
- Modify: `docs/plans/2026-03-09-wave-based-parallel-task-execution.md`

**Parallelizable:** yes

**Quality Constraints:**
- Progress Index goes after the front matter (Date/Status/Issue) and before the Overview section
- Format matches the PROGRESS INDEX format used in other plan files

**Acceptance Criteria:**
- [ ] File contains `PROGRESS INDEX` comment block measured by text presence verified by `grep -n "PROGRESS INDEX" docs/plans/2026-03-09-wave-based-parallel-task-execution.md`
- [ ] Progress Index lists all 6 tasks measured by line count verified by `grep -c "STATUS: pending" docs/plans/2026-03-09-wave-based-parallel-task-execution.md`

**Step 1: Add Progress Index to design doc**

Find the text `## Overview` in the design doc and insert the Progress Index before it. Use Edit to replace:

old_string:
```
## Overview
```

new_string:
```
<!-- PROGRESS INDEX
Task 1: Create dispatcher/wave_planner.py — STATUS: pending
Task 2: Create dispatcher/tests/test_wave_planner.py — STATUS: pending
Task 3: Update yolo-overrides.md Phase A — STATUS: pending
Task 4: Update verify-plan-criteria/SKILL.md — STATUS: pending
Task 5: Update references/xml-plan-format.md — STATUS: pending
Task 6: Add Progress Index to design doc — STATUS: pending
CURRENT: none
-->

## Overview
```

**Step 2: Verify**

```bash
grep -n "PROGRESS INDEX" docs/plans/2026-03-09-wave-based-parallel-task-execution.md
grep -c "STATUS: pending" docs/plans/2026-03-09-wave-based-parallel-task-execution.md
```

Expected: PROGRESS INDEX found; count = 6.

**Step 3: Commit**

```bash
git add docs/plans/2026-03-09-wave-based-parallel-task-execution.md
git commit -m "docs: add Progress Index to wave-based-parallel-task-execution design doc — ✓ Progress Index present"
```
