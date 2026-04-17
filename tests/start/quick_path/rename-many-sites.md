# Fixture: Rename Touching 8+ Files — Gate 2 Fails

**Scenario:** A rename that touches many files exceeds `max_files` (default 3) — Gate 2 fails silently and normal lifecycle runs.

**Command:**
```
start: rename processPayment to handlePayment
```

## Pre-conditions

- Working tree state: clean
- Target files: `processPayment` appears in 8 files across the codebase
  - `src/api/payments.ts`
  - `src/api/billing.ts`
  - `src/hooks/usePayment.ts`
  - `src/components/PaymentForm.tsx`
  - `src/utils/retry.ts`
  - `tests/api/payments.test.ts`
  - `tests/hooks/usePayment.test.ts`
  - `docs/api-reference.md`

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | Symbol name `processPayment` is concrete |
| 2 — Bounded file count | FAIL | 8 files > max_files (3) |
| 3 — No export overlap | (not evaluated) | Short-circuit after Gate 2 |
| 4 — Lexical region | (not evaluated) | Short-circuit after Gate 2 |
| 5 — Test impact | (not evaluated) | Short-circuit after Gate 2 |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle (silent)

**Expected action:** Gate 2 fails silently. No message to user. Normal feature-flow/GSD heuristic scoring runs.

**Expected surfaced message (if any):**
> none

**Acceptance criterion mapped:** Gate 2 fails silently when rename touches many files; normal lifecycle picks up.
