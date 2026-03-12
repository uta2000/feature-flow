import pytest
from textual.widgets import SelectionList

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


@pytest.mark.asyncio
async def test_selection_dep_suffix():
    from dispatcher.tui.selection import SelectionApp
    issues = [{"number": 5, "title": "Implement login"}]
    unmet_deps = {5: [3]}
    app = SelectionApp(issues=issues, parked_numbers=set(), label="test", unmet_deps=unmet_deps)
    async with app.run_test() as pilot:
        sl = app.query_one(SelectionList)
        # Check that at least one option label contains the dep suffix
        labels = [str(opt.prompt) for opt in sl._options]
        assert any("needs #3" in label for label in labels)

@pytest.mark.asyncio
async def test_selection_no_dep_suffix_when_no_unmet():
    from dispatcher.tui.selection import SelectionApp
    issues = [{"number": 5, "title": "Implement login"}]
    app = SelectionApp(issues=issues, parked_numbers=set(), label="test", unmet_deps={})
    async with app.run_test() as pilot:
        sl = app.query_one(SelectionList)
        labels = [str(opt.prompt) for opt in sl._options]
        assert not any("needs" in label for label in labels)
