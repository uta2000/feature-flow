from dispatcher.db import (
    get_previous_triage,
    get_resumable_issues,
    increment_resume_count,
    init_db,
    insert_issue,
    insert_run,
    update_issue_execution,
    update_run_status,
)
from dispatcher.models import ExecutionResult, TriageResult


def _make_triage(issue_number: int = 42, tier: str = "full-yolo") -> TriageResult:
    return TriageResult(
        issue_number=issue_number,
        issue_title=f"Issue #{issue_number}",
        issue_url=f"https://github.com/o/r/issues/{issue_number}",
        scope="quick-fix",
        richness_score=4,
        richness_signals={"acceptance_criteria": True, "resolved_discussion": True, "concrete_examples": True, "structured_content": True},
        triage_tier=tier,
        confidence=0.95,
        risk_flags=[],
        missing_info=[],
        reasoning="Clear scope.",
    )


def test_init_creates_tables(db):
    cursor = db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [row[0] for row in cursor.fetchall()]
    assert "issues" in tables
    assert "runs" in tables


def test_insert_and_update_run(db):
    insert_run(db, "run-1", [42, 43], '{"key": "val"}')
    row = db.execute("SELECT * FROM runs WHERE id = ?", ("run-1",)).fetchone()
    assert row is not None
    assert row["status"] == "running"

    update_run_status(db, "run-1", "completed")
    row = db.execute("SELECT * FROM runs WHERE id = ?", ("run-1",)).fetchone()
    assert row["status"] == "completed"
    assert row["finished_at"] is not None


def test_insert_issue(db):
    insert_run(db, "run-1", [42], "{}")
    tr = _make_triage(42)
    insert_issue(db, "run-1", tr)
    row = db.execute("SELECT * FROM issues WHERE issue_number = 42").fetchone()
    assert row is not None
    assert row["triage_tier"] == "full-yolo"
    assert row["scope"] == "quick-fix"


def test_update_issue_execution(db):
    insert_run(db, "run-1", [42], "{}")
    insert_issue(db, "run-1", _make_triage(42))
    er = ExecutionResult(
        issue_number=42, branch_name="fix/42-test",
        session_id="sess-1", num_turns=10, is_error=False,
        pr_number=100, pr_url="https://github.com/o/r/pull/100",
        error_message=None, outcome="pr_created",
    )
    update_issue_execution(db, "run-1", 42, er)
    row = db.execute("SELECT * FROM issues WHERE issue_number = 42 AND run_id = 'run-1'").fetchone()
    assert row["outcome"] == "pr_created"
    assert row["pr_number"] == 100
    assert row["session_id"] == "sess-1"


def test_get_resumable_issues(db):
    insert_run(db, "run-1", [42, 43, 44], "{}")
    insert_issue(db, "run-1", _make_triage(42))
    insert_issue(db, "run-1", _make_triage(43))
    insert_issue(db, "run-1", _make_triage(44))
    update_issue_execution(db, "run-1", 42, ExecutionResult(42, "b", "s1", 10, False, 100, "u", None, "pr_created"))
    update_issue_execution(db, "run-1", 43, ExecutionResult(43, "b", "s2", 200, False, None, None, "hit limit", "leash_hit"))
    update_issue_execution(db, "run-1", 44, ExecutionResult(44, "b", "s3", 5, True, None, None, "crash", "failed"))
    resumable = get_resumable_issues(db, "run-1")
    numbers = [r["issue_number"] for r in resumable]
    assert 43 in numbers
    assert 44 in numbers
    assert 42 not in numbers


def test_get_previous_triage(db):
    insert_run(db, "run-1", [42], "{}")
    insert_issue(db, "run-1", _make_triage(42, tier="parked"))
    prev = get_previous_triage(db, 42)
    assert prev is not None
    assert prev["triage_tier"] == "parked"


def test_get_previous_triage_none(db):
    prev = get_previous_triage(db, 999)
    assert prev is None


def test_wal_mode_enabled(tmp_path):
    db_path = str(tmp_path / "test.db")
    conn = init_db(db_path)
    mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    assert mode == "wal"
    conn.close()


def test_increment_resume_count(db):
    insert_run(db, "run-1", [42], "{}")
    insert_issue(db, "run-1", _make_triage(42))
    row = db.execute("SELECT resume_count FROM issues WHERE issue_number = 42").fetchone()
    assert row["resume_count"] == 0

    increment_resume_count(db, "run-1", 42)
    row = db.execute("SELECT resume_count FROM issues WHERE issue_number = 42").fetchone()
    assert row["resume_count"] == 1

    increment_resume_count(db, "run-1", 42)
    row = db.execute("SELECT resume_count FROM issues WHERE issue_number = 42").fetchone()
    assert row["resume_count"] == 2
