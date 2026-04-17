# Fixture: Edit Balloons Beyond max_changed_lines — Escape Hatch Fires

**Scenario:** All gates pass on confirmation, but the actual edit expands far beyond `max_changed_lines` — post-hook budget check fires the escape hatch.

**Command:**
```
start: update the introductory paragraph in docs/overview.md
```

## Pre-conditions

- Working tree state: clean
- Confirmed set (from gates): `docs/overview.md`, prose region, 1 file
- Scenario: The implementer's edit replaces a 3-line paragraph with a 15-line expanded version, resulting in 18 lines changed total (15 added + 3 removed)
- `max_changed_lines`: 10 (default)

## Gate Evaluation

All 5 gates pass on confirmation (prose, 1 file, clean tree).

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | File path and region named |
| 2 — Bounded file count | PASS | 1 file ≤ max_files (3) |
| 3 — No export overlap | PASS | Markdown file, no export nodes |
| 4 — Lexical region | PASS | Introductory paragraph is prose outside code fence |

## Expected Outcome

**Path taken:** escape hatch rollback (post-hook budget check fails)

**Expected action:**
1. Edit tool writes 15 new lines, removes 3 old lines in `docs/overview.md`
2. Stop hook runs (no failures)
3. `git diff --numstat docs/overview.md` → `15  3  docs/overview.md` → total 18 > max_changed_lines (10)
4. Escape hatch fires: `git checkout -- docs/overview.md`
5. No commit made.

**Expected surfaced message (if any):**
> `⚠ Quick path misclassified this change (18 lines changed exceeds max_changed_lines: 10). No commit made, working tree restored. Re-run with \`start: update the introductory paragraph in docs/overview.md\` for the full lifecycle.`

**Acceptance criterion mapped:** Post-hook budget check triggers escape hatch when edit exceeds `max_changed_lines`.
