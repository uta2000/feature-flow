# Quick-Path Triage Fixtures

These 14 fixtures are **scenario specifications**, not runnable tests. Each fixture documents:
- A `start:` input prompt
- Pre-conditions (working-tree state, target-file content)
- Gate-by-gate expected outcomes (5 rows, short-circuit point marked)
- Expected user-facing message (if any)
- Mapped issue #234 acceptance criterion

## Maintenance contract

When `skills/start/SKILL.md` quick-path prose changes, update the corresponding fixtures **in the same PR**. In particular:
- Gate table row count changes → update every fixture's Gate Evaluation table.
- Announcement format template changes → update every fixture's "Expected surfaced message" block.
- Verbatim user-facing hints (Gate 0, Gate 1) change → update fixtures that reproduce them.

## Drift check

Run `bash tests/start/quick_path/check-drift.sh` from the repo root. The script verifies gate count, fixture count, verbatim hints, budget rule, and escape-hatch command. Exits non-zero on any drift.

Wire into CI by calling it from a GitHub Actions workflow; this repo has no CI configured today, so the check is pre-merge manual.
