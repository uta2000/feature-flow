from dispatcher.models import Config, TriageResult, ReviewedIssue, ExecutionResult


def test_config_defaults():
    cfg = Config(plugin_path="/path/to/plugin")
    assert cfg.plugin_path == "/path/to/plugin"
    assert cfg.default_label == "dispatcher-ready"
    assert cfg.triage_max_turns == 1
    assert cfg.execution_max_turns == 200
    assert cfg.max_resume_attempts == 2
    assert cfg.db_path == "./dispatcher.db"
    assert cfg.selection_limit == 50
    assert cfg.rate_limit_pause_seconds == 300
    assert cfg.rate_limit_batch_pause_seconds == 900
    assert cfg.branch_prefix_fix == "fix"
    assert cfg.branch_prefix_feat == "feat"


def test_triage_result_frozen():
    tr = TriageResult(
        issue_number=42,
        issue_title="Add CSV export",
        issue_url="https://github.com/o/r/issues/42",
        scope="small-enhancement",
        richness_score=3,
        richness_signals={"acceptance_criteria": True, "resolved_discussion": True, "concrete_examples": True, "structured_content": False},
        triage_tier="full-yolo",
        confidence=0.92,
        risk_flags=[],
        missing_info=[],
        reasoning="Clear scope, good detail.",
    )
    assert tr.issue_number == 42
    assert tr.triage_tier == "full-yolo"


def test_reviewed_issue():
    tr = TriageResult(
        issue_number=42, issue_title="Test", issue_url="url",
        scope="quick-fix", richness_score=4,
        richness_signals={}, triage_tier="full-yolo",
        confidence=0.95, risk_flags=[], missing_info=[], reasoning="ok",
    )
    ri = ReviewedIssue(triage=tr, final_tier="supervised-yolo", skipped=False, edited_comment=None)
    assert ri.final_tier == "supervised-yolo"
    assert ri.triage.issue_number == 42


def test_execution_result():
    er = ExecutionResult(
        issue_number=42, branch_name="feat/42-csv-export",
        session_id="abc-123", num_turns=15, is_error=False,
        pr_number=100, pr_url="https://github.com/o/r/pull/100",
        error_message=None, outcome="pr_created",
    )
    assert er.outcome == "pr_created"
    assert er.pr_number == 100
