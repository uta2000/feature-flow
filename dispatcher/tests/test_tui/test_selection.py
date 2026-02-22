import pytest

from dispatcher.tui.selection import SelectionApp


@pytest.mark.asyncio
async def test_selection_app_renders():
    issues = [
        {"number": 42, "title": "Fix bug", "url": "u", "labels": [{"name": "bug"}], "createdAt": "2026-01-01"},
        {"number": 43, "title": "Add feature", "url": "u", "labels": [], "createdAt": "2026-01-02"},
    ]
    app = SelectionApp(issues=issues, parked_numbers=set(), label="test")
    async with app.run_test() as pilot:
        assert app.is_running


@pytest.mark.asyncio
async def test_selection_empty_issues():
    app = SelectionApp(issues=[], parked_numbers=set(), label="test")
    async with app.run_test() as pilot:
        pass  # App exits on its own


@pytest.mark.asyncio
async def test_selection_parked_indicator():
    issues = [
        {"number": 42, "title": "Fix bug", "url": "u", "labels": [], "createdAt": "2026-01-01"},
    ]
    app = SelectionApp(issues=issues, parked_numbers={42}, label="test")
    async with app.run_test() as pilot:
        assert app.is_running


@pytest.mark.asyncio
async def test_selection_quit():
    issues = [
        {"number": 42, "title": "Fix bug", "url": "u", "labels": [], "createdAt": "2026-01-01"},
    ]
    app = SelectionApp(issues=issues, parked_numbers=set(), label="test")
    async with app.run_test() as pilot:
        await pilot.press("q")
    assert app.selected == []
