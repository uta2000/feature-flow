# Fixture: Two-File Prose Fix — Gate 2 Passes Under Default max_files: 3

**Scenario:** A prose fix across two files (README + CHANGELOG) — 2 files ≤ default `max_files: 3`, so Gate 2 passes and quick path executes.

**Command:**
```
start: fix "occurence" → "occurrence" typo in README.md line 12 and CHANGELOG.md line 8
```

## Pre-conditions

- Working tree state: clean
- Target files: `README.md` (1 file), `CHANGELOG.md` (1 file) — 2 files total
- max_files: 3 (default)
- Both edits are in Markdown prose outside code fences

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | Both file paths and line numbers named explicitly |
| 2 — Bounded file count | PASS | 2 files ≤ max_files (3) |
| 3 — No export overlap | PASS | Both are Markdown files — no export nodes |
| 4 — Lexical region | PASS | Both `old_string` ranges are in Markdown prose outside code fences |

## Expected Outcome

**Path taken:** quick path

**Expected action:**
1. Announce: `⚡ Quick path confirmed: README.md:12, CHANGELOG.md:8 — prose edit in Markdown, 2 file(s), budget: ≤10 lines. Editing directly.`
2. Edit `README.md` line 12 and `CHANGELOG.md` line 8
3. Stop hook runs
4. Post-hook: `git diff --numstat` shows 2 lines changed (1+1) ≤ 10 → pass
5. Commit: `docs: fix occurrence typo in README and CHANGELOG (2 lines changed)`

**Expected surfaced message (if any):**
> `⚡ Quick path confirmed: README.md:12, CHANGELOG.md:8 — prose edit in Markdown, 2 file(s), budget: ≤10 lines. Editing directly.`

**Acceptance criterion mapped:** Gate 2 passes for 2-file prose fix under default `max_files: 3`; quick path executes.
