# Fixture: Edit Overlaps export Declaration — Gate 3 Fails

**Scenario:** The proposed `old_string` range sits inside an `export function` declaration — Gate 3 fails silently via mechanical byte-range overlap.

**Command:**
```
start: rename exported function foo to bar in src/utils/helpers.ts line 3
```

## Pre-conditions

- Working tree state: clean
- Target files: `src/utils/helpers.ts`
- Relevant file content (excerpt):
  ```typescript
  // line 3
  export function foo(x: number): number {
  ```
- The proposed `old_string` is `foo` — the function name identifier inside an `export function` declaration

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | File path, line, and symbol named |
| 2 — Bounded file count | PASS | 1 file ≤ max_files (3) (confirmation looks at source file only; call sites not yet checked) |
| 3 — No export overlap | FAIL | The byte range of `foo` at line 3 sits inside an `export function` declaration node. Direct overlap with export AST node. |
| 4 — Lexical region | (not evaluated) | Short-circuit after Gate 3 |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle (silent)

**Expected action:** Gate 3 fails silently. No message to user. Normal heuristic scoring runs.

**Expected surfaced message (if any):**
> none

**Acceptance criterion mapped:** Gate 3 fails when edit byte range overlaps an export declaration; normal lifecycle runs.
