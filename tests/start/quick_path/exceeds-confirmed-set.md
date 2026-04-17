# Fixture: Edit Writes Outside Confirmed File Set — Escape Hatch Fires

**Scenario:** All gates pass, but during execution the Edit tool touches a file outside the confirmed set — the escape hatch fires and the working tree is restored atomically.

**Command:**
```
start: fix typo in docs/README.md line 5
```

## Pre-conditions

- Working tree state: clean
- Confirmed set (from gates): `docs/README.md` only
- Scenario: The Edit tool, during execution, also modifies `docs/CONTRIBUTING.md` (e.g., because `old_string` matched in both files due to a shared phrase)

## Gate Evaluation

All 6 gates pass for `docs/README.md` (1 file, prose, clean tree, no exports).

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | File path and line number named |
| 2 — Bounded file count | PASS | 1 file ≤ max_files (3) |
| 3 — No export overlap | PASS | Markdown file, no export nodes |
| 4 — Lexical region | PASS | Prose outside code fence |
| 5 — Test impact | PASS | Untestable prose → pass |

## Expected Outcome

**Path taken:** escape hatch rollback

**Expected action:**
1. Step 3 of quick-path execution: Edit tool modifies `docs/README.md` AND `docs/CONTRIBUTING.md`
2. Post-hook assertion detects `docs/CONTRIBUTING.md` is outside the confirmed set
3. Escape hatch fires:
   ```bash
   git checkout -- docs/README.md docs/CONTRIBUTING.md
   ```
   (All confirmed files restored, even though only one was in the confirmed set — multi-file atomic.)
4. Tell user the escape-hatch message.
5. No commit made.

**Expected surfaced message (if any):**
> `⚠ Quick path misclassified this change (edit touched docs/CONTRIBUTING.md outside confirmed set). No commit made, working tree restored. Re-run with \`start: fix typo in docs/README.md line 5\` for the full lifecycle.`

**Acceptance criterion mapped:** Escape hatch fires when edit touches a file outside the confirmed set; tree is atomically restored.
