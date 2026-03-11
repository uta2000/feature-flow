from __future__ import annotations

import re
from typing import Any


class CycleError(Exception):
    """Raised by dep_waves() when a circular dependency is detected.
    Message contains the affected issue numbers, e.g. 'Cycle detected among issues: [3, 5]'."""
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


def build_dep_graph(issues: list[dict[str, Any]]) -> dict[int, list[int]]:
    """Build adjacency map from issue dicts with 'number' and 'body' keys.
    Returns {issue_number: [dep_issue_numbers]}."""
    return {
        issue["number"]: extract_deps(issue.get("body"))
        for issue in issues
    }


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
    Unmet = dep is NOT in closed (being in batch does not satisfy a dep)."""
    result: dict[int, list[int]] = {}
    for issue_num, deps in graph.items():
        if issue_num not in batch:
            continue
        missing = [d for d in deps if d not in closed]
        if missing:
            result[issue_num] = missing
    return result
