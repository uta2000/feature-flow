# Fixture: Edit Attempts to Modify an Identifier in TypeScript — Gate 4 Fails

**Scenario:** The proposed `old_string` is a TypeScript identifier (not a string literal or comment) — Gate 4 fails silently.

**Command:**
```
start: rename variable count to total in src/utils/counter.ts line 12
```

## Pre-conditions

- Working tree state: clean
- Target files: `src/utils/counter.ts`
- Relevant file content (excerpt):
  ```typescript
  // line 12
  const count = items.length;
  ```
- The proposed `old_string` is `count` (an identifier node in TypeScript AST)

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | File path and line number named |
| 2 — Bounded file count | PASS | 1 file ≤ max_files (3) |
| 3 — No export overlap | PASS | `count` variable is not an export |
| 4 — Lexical region | FAIL | `count` at line 12 is a TypeScript identifier node, not a string literal or comment |
| 5 — Test impact | (not evaluated) | Short-circuit after Gate 4 |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle (silent)

**Expected action:** Gate 4 fails silently. No message to user. Normal feature-flow/GSD heuristic scoring runs.

**Expected surfaced message (if any):**
> none

**Acceptance criterion mapped:** Gate 4 fails when proposed edit targets a code identifier; normal lifecycle runs.
