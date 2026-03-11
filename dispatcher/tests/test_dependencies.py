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
