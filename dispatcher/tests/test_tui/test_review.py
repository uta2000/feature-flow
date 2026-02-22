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
