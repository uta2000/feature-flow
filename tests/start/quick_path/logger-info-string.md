# Fixture: Edit to logger.info() String Argument — Gate 4 Fails (Log-Call Exclusion)

**Scenario:** The proposed `old_string` is a string literal that is the first argument to `logger.info(...)` — Gate 4 fails via the log-call exclusion AST ancestor walk.

**Command:**
```
start: update log message in src/api/payments.ts line 22 — change "Processing payment" to "Processing payment request"
```

## Pre-conditions

- Working tree state: clean
- Target files: `src/api/payments.ts`
- Relevant file content (excerpt):
  ```typescript
  // line 22
  logger.info("Processing payment", { userId, amount });
  ```
- The proposed `old_string` is `"Processing payment"` — a string literal that is the first argument to `logger.info(...)`

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | File path, line, and string content named |
| 2 — Bounded file count | PASS | 1 file ≤ max_files (3) |
| 3 — No export overlap | PASS | String literal does not overlap any export declaration |
| 4 — Lexical region | FAIL | `"Processing payment"` is a string literal node, but its enclosing `CallExpression` callee is `logger.info` — root identifier `logger` matches case-insensitively. Log-call string arguments are excluded. |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle (silent)

**Expected action:** Gate 4 fails silently (log-call exclusion). No message to user. Normal heuristic scoring runs.

**Expected surfaced message (if any):**
> none

**Acceptance criterion mapped:** Gate 4 log-call exclusion fires for `logger.info()` string argument; normal lifecycle runs.
