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
