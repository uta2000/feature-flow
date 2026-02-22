from __future__ import annotations

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.widgets import Footer, Header, SelectionList, Static


class SelectionApp(App[list[int]]):
    TITLE = "Issue Dispatcher — Select Issues"
    BINDINGS = [
        Binding("enter", "confirm", "Confirm"),
        Binding("a", "select_all", "Select All"),
        Binding("q", "quit_app", "Quit"),
    ]

    def __init__(self, issues: list[dict], parked_numbers: set[int], label: str) -> None:
        super().__init__()
        self._issues = issues
        self._parked = parked_numbers
        self._label = label
        self.selected: list[int] = []

    def compose(self) -> ComposeResult:
        yield Header()
        if not self._issues:
            yield Static(f"No open issues with label '{self._label}' found.")
            yield Static("Press any key to close.")
        else:
            items = []
            for issue in self._issues:
                number = issue["number"]
                title = issue["title"]
                parked_mark = " ↻ parked" if number in self._parked else ""
                label = f"#{number} {title}{parked_mark}"
                items.append((label, number))
            yield SelectionList(*items)
        yield Footer()

    def on_key(self, _event) -> None:
        if not self._issues:
            self.exit([])

    def action_confirm(self) -> None:
        sl = self.query_one(SelectionList)
        self.selected = list(sl.selected)
        self.exit(self.selected)

    def action_select_all(self) -> None:
        sl = self.query_one(SelectionList)
        sl.select_all()

    def action_quit_app(self) -> None:
        self.selected = []
        self.exit([])
