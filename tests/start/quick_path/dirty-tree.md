# Fixture: Dirty Working Tree — Gate 0 Fails

**Scenario:** The working tree has uncommitted changes — Gate 0 fails immediately and the user hint is surfaced.

**Command:**
```
start: fix typo in README.md line 3
```

## Pre-conditions

- Working tree state: **dirty** — `git status --porcelain` shows `M README.md` (in-progress edit)
- Target files: `README.md`

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | FAIL | `git status --porcelain` returns `M README.md` (non-empty output) |
| 1 — Concrete target | (not evaluated) | Short-circuit after Gate 0 |
| 2 — Bounded file count | (not evaluated) | Short-circuit after Gate 0 |
| 3 — No export overlap | (not evaluated) | Short-circuit after Gate 0 |
| 4 — Lexical region | (not evaluated) | Short-circuit after Gate 0 |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle

**Expected action:** Gate 0 fails. Surface user hint. Normal feature-flow/GSD heuristic scoring runs.

**Expected surfaced message (if any):**
> *"Working tree is dirty — running normal lifecycle to avoid trampling in-progress work."*

**Acceptance criterion mapped:** Gate 0 fails on dirty tree; verbatim user hint surfaces.
