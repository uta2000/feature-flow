from __future__ import annotations

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.widgets import DataTable, Footer, Header, Static

from dispatcher.models import ReviewedIssue, TriageResult

_TIER_CYCLE = ["full-yolo", "supervised-yolo", "parked"]


class ReviewApp(App[list[ReviewedIssue]]):
    TITLE = "Issue Dispatcher — Review Triage"
    BINDINGS = [
        Binding("t", "cycle_tier", "Cycle Tier"),
        Binding("s", "skip_issue", "Skip"),
        Binding("a", "approve_all", "Approve All"),
        Binding("x", "execute", "Execute"),
        Binding("q", "quit_app", "Quit"),
        Binding("enter", "toggle_detail", "Detail"),
    ]

    def __init__(self, triage_results: list[TriageResult]) -> None:
        super().__init__()
        self._results = triage_results
        self._tiers: dict[int, str] = {tr.issue_number: tr.triage_tier for tr in triage_results}
        self._skipped: set[int] = set()
        self._comments: dict[int, str | None] = {}
        self.reviewed: list[ReviewedIssue] = []

    def compose(self) -> ComposeResult:
        yield Header()
        table = DataTable()
        table.add_columns("#", "Issue", "Tier", "Confidence", "Flags")
        for tr in self._results:
            flags = ", ".join(tr.risk_flags) if tr.risk_flags else "—"
            table.add_row(
                str(tr.issue_number), tr.issue_title,
                tr.triage_tier, f"{tr.confidence:.2f}", flags,
                key=str(tr.issue_number),
            )
        yield table
        yield Static("", id="detail-panel")
        yield Footer()

    def _current_issue_number(self) -> int | None:
        table = self.query_one(DataTable)
        if table.cursor_row is not None and table.cursor_row < len(self._results):
            return self._results[table.cursor_row].issue_number
        return None

    def action_cycle_tier(self) -> None:
        num = self._current_issue_number()
        if num is None:
            return
        current = self._tiers[num]
        idx = _TIER_CYCLE.index(current) if current in _TIER_CYCLE else 0
        self._tiers[num] = _TIER_CYCLE[(idx + 1) % len(_TIER_CYCLE)]
        table = self.query_one(DataTable)
        row_key = str(num)
        table.update_cell(row_key, "Tier", self._tiers[num])

    def action_skip_issue(self) -> None:
        num = self._current_issue_number()
        if num is None:
            return
        if num in self._skipped:
            self._skipped.discard(num)
        else:
            self._skipped.add(num)

    def action_approve_all(self) -> None:
        self._skipped.clear()
        self.action_execute()

    def action_execute(self) -> None:
        self.reviewed = []
        for tr in self._results:
            self.reviewed.append(ReviewedIssue(
                triage=tr,
                final_tier=self._tiers[tr.issue_number],
                skipped=tr.issue_number in self._skipped,
                edited_comment=self._comments.get(tr.issue_number),
            ))
        self.exit(self.reviewed)

    def action_quit_app(self) -> None:
        self.reviewed = []
        self.exit([])

    def action_toggle_detail(self) -> None:
        num = self._current_issue_number()
        if num is None:
            return
        panel = self.query_one("#detail-panel", Static)
        tr = next((t for t in self._results if t.issue_number == num), None)
        if tr is None:
            return
        if panel.renderable:
            panel.update("")
        else:
            detail = (
                f"Issue #{tr.issue_number}: {tr.issue_title}\n"
                f"Scope: {tr.scope} | Richness: {tr.richness_score}/4\n"
                f"Tier: {self._tiers[num]} | Confidence: {tr.confidence:.2f}\n"
                f"Risk Flags: {', '.join(tr.risk_flags) or 'none'}\n"
                f"Missing: {', '.join(tr.missing_info) or 'none'}\n\n"
                f"Reasoning: {tr.reasoning}"
            )
            panel.update(detail)
