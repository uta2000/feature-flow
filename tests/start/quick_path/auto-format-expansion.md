# Fixture: Stop-Hook Auto-Format Expands Diff Beyond max_changed_lines — Post-Hook Escape Hatch Fires

**Scenario:** All gates pass and the edit itself is tiny, but the Stop hook's Prettier run auto-formats the file, expanding the total diff beyond `max_changed_lines`. The post-hook budget check catches this and fires the escape hatch.

**Command:**
```
start: fix typo in src/utils/formatter.ts line 5 — "formated" → "formatted"
```

## Pre-conditions

- Working tree state: clean
- Target files: `src/utils/formatter.ts`
- Relevant file content (excerpt):
  ```typescript
  // line 5
  // formated result
  const formated = input.trim();
  ```
- The proposed `old_string` is inside a comment: `// formated result`
- max_changed_lines: 10 (default)
- Scenario: Stop hook runs Prettier on the file, which reformats 15 additional lines (indentation, trailing commas) — total diff becomes 17 lines

## Gate Evaluation

All 6 gates pass on confirmation (comment region, 1 file, clean tree, no export overlap).

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | File path and line named |
| 2 — Bounded file count | PASS | 1 file ≤ max_files (3) |
| 3 — No export overlap | PASS | Comment does not overlap any export node |
| 4 — Lexical region | PASS | `// formated result` is a line comment node |
| 5 — Test impact | PASS | No test references this comment text → untestable → pass |

## Expected Outcome

**Path taken:** escape hatch rollback (post-hook budget check fails)

**Expected action:**
1. All gates pass (comment region confirmed)
2. Edit tool changes 1 line in `src/utils/formatter.ts`
3. Stop hook runs Prettier → reformats 15 additional lines
4. Post-hook: `git diff --numstat src/utils/formatter.ts` → `16  1  src/utils/formatter.ts` → total 17 > max_changed_lines (10)
5. Escape hatch fires: `git checkout -- src/utils/formatter.ts`
6. No commit made.

Note: The measurement is deliberately **after** the Stop hook — this fixture exists specifically to verify that auto-format expansion is caught.

**Expected surfaced message (if any):**
> `⚠ Quick path misclassified this change (17 lines changed after auto-format exceeds max_changed_lines: 10). No commit made, working tree restored. Re-run with \`start: fix typo in src/utils/formatter.ts line 5\` for the full lifecycle.`

**Acceptance criterion mapped:** Post-hook `git diff --numstat` catches Stop-hook auto-format expansion beyond `max_changed_lines`; escape hatch fires.
