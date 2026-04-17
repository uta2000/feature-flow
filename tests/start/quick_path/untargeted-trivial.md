# Fixture: Untargeted Trivial Ask — Gate 1 Fails

**Scenario:** The description mentions typos but names no specific file, function, or symbol — Gate 1 fails and the normal lifecycle runs.

**Command:**
```
start: fix typos
```

## Pre-conditions

- Working tree state: clean
- Target files: none (no specific file named in description)

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | FAIL | Description names no file path, function name, symbol, or string literal |
| 2 — Bounded file count | (not evaluated) | Short-circuit after Gate 1 |
| 3 — No export overlap | (not evaluated) | Short-circuit after Gate 1 |
| 4 — Lexical region | (not evaluated) | Short-circuit after Gate 1 |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle

**Expected action:** Gate 1 fails. Surface user hint. Proceed with normal feature-flow/GSD heuristic scoring.

**Expected surfaced message (if any):**
> *"No specific target named — running normal lifecycle. If you meant a specific file, say `start: fix typo in X.ts line 42`."*

**Acceptance criterion mapped:** Gate 1 fails on untargeted ask; user hint surfaces verbatim.
