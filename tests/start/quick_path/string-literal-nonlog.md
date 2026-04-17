# Fixture: Edit Inside Non-Log String Literal — Gate 4 Passes

**Scenario:** The proposed `old_string` is a string literal argument to a non-log call (`Error()`) — Gate 4 passes and quick path executes.

**Command:**
```
start: fix typo in error message in src/api/auth.ts line 8 — "Unauthorzied" should be "Unauthorized"
```

## Pre-conditions

- Working tree state: clean
- Target files: `src/api/auth.ts`
- Relevant file content (excerpt):
  ```typescript
  // line 8
  throw new Error("Unauthorzied access");
  ```
- The proposed `old_string` is `"Unauthorzied access"` — a string literal argument to `Error()`, not to a log call

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | File path, line, and string content named |
| 2 — Bounded file count | PASS | 1 file ≤ max_files (3) |
| 3 — No export overlap | PASS | String literal does not overlap any export declaration |
| 4 — Lexical region | PASS | `"Unauthorzied access"` is a string literal node; enclosing `CallExpression` callee is `Error`, which does not match `log.*` / `logger.*` / `console.*` |
| 5 — Test impact | PASS | No test matches "Unauthorzied" (misspelled); edit is a string literal → untestable as a symbol → pass |

## Expected Outcome

**Path taken:** quick path

**Expected action:**
1. Announce: `⚡ Quick path confirmed: src/api/auth.ts:8 — string-literal edit in TypeScript, 1 file, budget: ≤10 lines. Editing directly.`
2. Edit: replace `"Unauthorzied access"` with `"Unauthorized access"`
3. Stop hook runs
4. Post-hook: 1 line changed ≤ 10 → pass
5. Commit: `fix: correct typo in auth error message (1 line changed)`

**Expected surfaced message (if any):**
> `⚡ Quick path confirmed: src/api/auth.ts:8 — string-literal edit in TypeScript, 1 file, budget: ≤10 lines. Editing directly.`

**Acceptance criterion mapped:** Gate 4 passes for a non-log-call string literal; quick path executes.
