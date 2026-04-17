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

## Drift check (manual, pre-release)

```bash
# Gate count consistency
grep -c '^| [0-4] |' tests/start/quick_path/*.md | awk -F: '$2 != 5 { print "DRIFT:", $0 }'

# Announcement format consistency
grep -l '⚡ Quick path confirmed:' tests/start/quick_path/*.md | wc -l  # should equal fixture count that exercises pass paths

# Verbatim Gate 0 hint
grep -l 'Working tree is dirty — running normal lifecycle' tests/start/quick_path/dirty-tree.md  # must match
```

If a future PR adds a CI job that runs these greps and fails on drift, move this maintenance contract into the job config.
