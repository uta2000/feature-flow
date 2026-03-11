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
    """Parse XML plan for task IDs and `depends_on` attributes.

    Raises ET.ParseError on malformed XML.
    """
    task_ids: set[int] = set()
    deps: dict[int, set[int]] = {}
    has_explicit_deps = False
    root = ET.fromstring(content)
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
    try:
        content = path.read_text(encoding="utf-8")
    except (FileNotFoundError, IsADirectoryError, PermissionError):
        return {"waves": [], "errors": [f"file not found: {plan_file}"], "has_explicit_deps": False}, 1
    if _is_xml(content):
        try:
            task_ids, deps, has_explicit_deps = _parse_xml(content)
        except ET.ParseError as exc:
            return {"waves": [], "errors": [f"XML parse error: {exc}"], "has_explicit_deps": False}, 1
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
