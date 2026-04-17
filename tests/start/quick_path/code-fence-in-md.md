# Fixture: Edit Inside Code Fence in Markdown — Gate 4 Fails

**Scenario:** The proposed `old_string` sits inside a fenced code block in Markdown — Gate 4 rule (a) requires prose **outside** fences, so Gate 4 fails silently.

**Command:**
```
start: update example command in README.md line 45 — change "npm install" to "npm ci"
```

## Pre-conditions

- Working tree state: clean
- Target files: `README.md`
- Relevant file content (excerpt):
  ````
  ## Installation

  Run the following command:

  ```bash
  npm install     ← line 45
  ```
  ````
- The proposed `old_string` is `npm install` — inside a `` ```bash ``` `` fenced code block

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | File path and line number named |
| 2 — Bounded file count | PASS | 1 file ≤ max_files (3) |
| 3 — No export overlap | PASS | Markdown file has no export nodes |
| 4 — Lexical region | FAIL | `npm install` at line 45 sits inside a `` ``` `` fenced code block. Gate 4 rule (a) requires Markdown prose **outside** fences. Code fences are excluded. |
| 5 — Test impact | (not evaluated) | Short-circuit after Gate 4 |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle (silent)

**Expected action:** Gate 4 fails silently. Code-fence content is not treated as prose. Normal heuristic scoring runs.

**Expected surfaced message (if any):**
> none

**Acceptance criterion mapped:** Gate 4 fails for content inside Markdown fenced code block; not treated as prose.
