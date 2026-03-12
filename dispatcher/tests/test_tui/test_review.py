import pytest

from dispatcher.models import TriageResult
from dispatcher.tui.review import ReviewApp


def _triage(number: int = 42, tier: str = "full-yolo") -> TriageResult:
    return TriageResult(
        issue_number=number, issue_title=f"Issue {number}", issue_url="url",
        scope="quick-fix", richness_score=4, richness_signals={},
        triage_tier=tier, confidence=0.95, risk_flags=["none"], missing_info=[], reasoning="ok",
    )


@pytest.mark.asyncio
async def test_review_app_renders():
    results = [_triage(42), _triage(43, "parked")]
    app = ReviewApp(triage_results=results)
    async with app.run_test() as pilot:
        assert app.is_running


@pytest.mark.asyncio
async def test_review_quit():
    results = [_triage(42)]
    app = ReviewApp(triage_results=results)
    async with app.run_test() as pilot:
        await pilot.press("q")
    assert app.reviewed == []


@pytest.mark.asyncio
async def test_review_execute():
    results = [_triage(42)]
    app = ReviewApp(triage_results=results)
    async with app.run_test() as pilot:
        await pilot.press("x")
    assert len(app.reviewed) == 1
    assert app.reviewed[0].final_tier == "full-yolo"


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
