# Fixture: Trivial Targeted Typo in Markdown Prose

**Scenario:** A typo fix in Markdown prose at a specific file and line — all 5 gates pass, quick path executes.

**Command:**
```
start: fix typo in skills/start/SKILL.md line 15 — "Teh" should be "The"
```

## Pre-conditions

- Working tree state: clean (`git status --porcelain` returns empty)
- Target files: `skills/start/SKILL.md`
- Relevant file content (excerpt):
  ```
  Line 15: Teh skill orchestrates the full lifecycle...
  ```

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | File path and line number named explicitly |
| 2 — Bounded file count | PASS | 1 file ≤ max_files (3) |
| 3 — No export overlap | PASS | Markdown file has no export nodes |
| 4 — Lexical region | PASS | "Teh" is in Markdown prose outside a code fence |

## Expected Outcome

**Path taken:** quick path

**Expected action:**
1. Announce: `⚡ Quick path confirmed: skills/start/SKILL.md:15 — prose edit in Markdown, 1 file, budget: ≤10 lines. Editing directly.`
2. Edit `skills/start/SKILL.md` line 15, replacing "Teh" with "The"
3. Stop hook runs
4. Post-hook: `git diff --numstat` shows 1 line changed ≤ 10 → pass
5. Commit with message like: `docs: fix typo in start SKILL.md (1 line changed)`

**Expected surfaced message (if any):**
> `⚡ Quick path confirmed: skills/start/SKILL.md:15 — prose edit in Markdown, 1 file, budget: ≤10 lines. Editing directly.`

**Acceptance criterion mapped:** Quick path executes for a trivially targeted typo in Markdown prose.
