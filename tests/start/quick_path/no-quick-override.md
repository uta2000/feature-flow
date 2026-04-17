# Fixture: --no-quick Forces Normal Lifecycle on Trivial Change

**Scenario:** `--no-quick` flag is present — Quick-Path Confirmation is skipped entirely even for a trivially small change that would otherwise pass all gates.

**Command:**
```
start: fix typo in README.md line 3 --no-quick
```

## Pre-conditions

- Working tree state: clean
- Target files: `README.md` — single typo at line 3 in prose

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | (not evaluated) | `--no-quick` flag detected in Step 2; Quick-Path Confirmation is skipped entirely |
| 1 — Concrete target | (not evaluated) | Skipped |
| 2 — Bounded file count | (not evaluated) | Skipped |
| 3 — No export overlap | (not evaluated) | Skipped |
| 4 — Lexical region | (not evaluated) | Skipped |
| 5 — Test impact | (not evaluated) | Skipped |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle (forced by `--no-quick`)

**Expected action:** `--no-quick` is detected in Step 2 (Command-Line Flag Parsing). Quick-Path Confirmation is skipped. Normal heuristic scoring runs. The change, despite being trivially small, goes through the full feature-flow lifecycle.

**Expected surfaced message (if any):**
> none (flag is parsed silently; normal lifecycle announces as usual)

**Acceptance criterion mapped:** `--no-quick` forces normal lifecycle regardless of change triviality.
