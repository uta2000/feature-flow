import json
import subprocess
from unittest.mock import patch

import pytest

from dispatcher.models import Config
from dispatcher.triage import TriageError, build_triage_prompt, triage_issue, validate_tier


class TestValidateTier:
    def test_quick_fix_low_richness(self):
        assert validate_tier("quick-fix", 1, "parked") == "full-yolo"

    def test_quick_fix_high_richness(self):
        assert validate_tier("quick-fix", 4, "full-yolo") == "full-yolo"

    def test_feature_low_richness(self):
        assert validate_tier("feature", 2, "full-yolo") == "parked"

    def test_feature_high_richness(self):
        assert validate_tier("feature", 3, "parked") == "full-yolo"

    def test_major_feature_high_richness(self):
        assert validate_tier("major-feature", 4, "full-yolo") == "supervised-yolo"

    def test_major_feature_low_richness(self):
        assert validate_tier("major-feature", 1, "supervised-yolo") == "parked"

    def test_model_agrees_no_override(self):
        assert validate_tier("small-enhancement", 2, "full-yolo") == "full-yolo"


class TestBuildTriagePrompt:
    def test_interpolates_fields(self):
        prompt = build_triage_prompt("Fix bug", "The login is broken", ["I can reproduce"])
        assert "Fix bug" in prompt
        assert "The login is broken" in prompt
        assert "I can reproduce" in prompt


class TestTriageIssue:
    @patch("dispatcher.triage.subprocess.run")
    def test_success(self, mock_run):
        triage_json = {
            "scope": "quick-fix", "richness_score": 4,
            "richness_signals": {"acceptance_criteria": True, "resolved_discussion": True, "concrete_examples": True, "structured_content": True},
            "triage_tier": "full-yolo", "confidence": 0.95,
            "risk_flags": [], "missing_info": [], "reasoning": "Simple fix.",
        }
        result_json = {"is_error": False, "result": json.dumps(triage_json), "num_turns": 1, "session_id": "s1"}
        mock_run.return_value = subprocess.CompletedProcess(
            args=[], returncode=0, stdout=json.dumps(result_json),
        )
        issue_data = {"title": "Fix bug", "body": "Broken", "comments": []}
        cfg = Config(plugin_path="/p", repo="o/r")
        tr = triage_issue(issue_data, 42, "https://url", cfg)
        assert tr.triage_tier == "full-yolo"
        assert tr.issue_number == 42

    @patch("dispatcher.triage.subprocess.run")
    def test_invalid_json(self, mock_run):
        mock_run.return_value = subprocess.CompletedProcess(
            args=[], returncode=0, stdout="not json",
        )
        issue_data = {"title": "Test", "body": "Body", "comments": []}
        cfg = Config(plugin_path="/p", repo="o/r")
        with pytest.raises(TriageError):
            triage_issue(issue_data, 42, "url", cfg)

    @patch("dispatcher.triage.subprocess.run")
    def test_tier_override(self, mock_run):
        triage_json = {
            "scope": "feature", "richness_score": 1,
            "richness_signals": {"acceptance_criteria": False, "resolved_discussion": False, "concrete_examples": False, "structured_content": False},
            "triage_tier": "full-yolo", "confidence": 0.5,
            "risk_flags": [], "missing_info": ["details"], "reasoning": "Sparse.",
        }
        result_json = {"is_error": False, "result": json.dumps(triage_json), "num_turns": 1, "session_id": "s1"}
        mock_run.return_value = subprocess.CompletedProcess(
            args=[], returncode=0, stdout=json.dumps(result_json),
        )
        issue_data = {"title": "Big feature", "body": "Vague", "comments": []}
        cfg = Config(plugin_path="/p", repo="o/r")
        tr = triage_issue(issue_data, 42, "url", cfg)
        assert tr.triage_tier == "parked"  # Matrix overrides model's full-yolo
