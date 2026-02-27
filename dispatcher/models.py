from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Config:
    plugin_path: str
    repo: str = ""
    base_branch: str = "main"
    triage_model: str = "claude-sonnet-4-20250514"
    execution_model: str = "claude-opus-4-20250514"
    triage_max_turns: int = 1
    execution_max_turns: int = 200
    max_resume_attempts: int = 2
    db_path: str = "./dispatcher.db"
    branch_prefix_fix: str = "fix"
    branch_prefix_feat: str = "feat"
    default_label: str = "dispatcher-ready"
    selection_limit: int = 50
    rate_limit_pause_seconds: int = 300
    rate_limit_batch_pause_seconds: int = 900
    max_parallel: int = 4
    issues: list[int] = field(default_factory=list)
    auto: bool = False
    dry_run: bool = False
    resume: str = ""
    verbose: bool = False


@dataclass(frozen=True)
class TriageResult:
    issue_number: int
    issue_title: str
    issue_url: str
    scope: str
    richness_score: int
    richness_signals: dict[str, bool]
    triage_tier: str
    confidence: float
    risk_flags: list[str]
    missing_info: list[str]
    reasoning: str


@dataclass
class ReviewedIssue:
    triage: TriageResult
    final_tier: str
    skipped: bool
    edited_comment: str | None


@dataclass(frozen=True)
class ExecutionResult:
    issue_number: int
    branch_name: str
    session_id: str | None
    num_turns: int
    is_error: bool
    pr_number: int | None
    pr_url: str | None
    error_message: str | None
    outcome: str
