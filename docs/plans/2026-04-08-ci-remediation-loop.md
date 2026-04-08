# CI Remediation Loop — Design Document

**Date:** 2026-04-08
**Status:** Draft
**Issue:** #224
**Scope:** feature

## Overview

Expand the current one-shot CI failure handling in the `merge-prs` skill (`skills/merge-prs/SKILL.md:88`) into a bounded diagnosis-and-fix loop. Each failing PR is given up to 3 category-specific fix attempts (within a 10-minute wall-clock budget) before being skipped, and the shared bounded-attempt pattern is extracted into a new `references/best-effort-remediation.md` file that two sibling issues (#225 merge conflict ladder, #226 PR review triage) will later import.

## Example

**Input:** PR #N is CI-red. `gh run view --log-failed` shows three failures: a missing import in `src/foo.ts`, a type error in `src/bar.ts:42`, and a flaky timeout in `tests/integration/slow.test.ts`.

**Output (YOLO mode):**

```
YOLO: ship — CI remediation for PR #N (attempt 1/3, budget 00:00/10:00)
  Categories detected: lint (1), type (1), test-flaky (1)
  → Applied: prettier --write src/foo.ts
  → Applied: targeted type fix src/bar.ts:42
  → Re-ran job: slow.test.ts (flake check)
  → Committed: fix(ci): resolve lint, type, and flake in PR #N
  → Pushed. Polling gh pr checks (interval 30s)...
  → CI green after 02:14. Proceeding to merge.
```

## User Flow

### Step 1 — Detect CI failure

Inside `SKILL.md` Step 4a (pre-merge checks), after `gh pr view ... --json statusCheckRollup` reports a failing check, instead of the current one-shot branch, read `references/ci-remediation.md` and enter the bounded remediation loop.

### Step 2 — Fetch and classify failures

Call `gh run view <run-id> --log-failed` to pull failing logs. Parse each failure into a `(category, file, line, message)` tuple using the detection heuristics in `references/ci-remediation.md`. The eight categories are: `lint/format`, `type-error`, `test-flaky`, `test-real`, `build`, `dependency-install`, `timeout-infra`, `unknown`.

### Step 3 — Apply category-specific fix

For each failure, run the fix strategy for its category (e.g., `npm run lint -- --fix` for lint, targeted type annotation for type-error, `gh run rerun --failed` for flaky/timeout). If any failure is `unknown`, stop the loop and skip the PR (unknown is terminal — see Scope).

### Step 4 — Flake handling

`test-flaky` is assigned on first encounter only when the failing test name matches the project's known-flake list OR is re-run once via `gh run rerun --failed` and passes. If it fails a second time, its category is re-assigned to `test-real`.

### Step 5 — Commit, push, poll

If any fixes were applied, commit with `fix(ci): <summary>` (the `fix(ci):` prefix is mandatory so the commits are greppable in `git log` and squash cleanly). Push to the PR branch. Poll `gh pr checks` every `CI_POLL_INTERVAL` seconds (default 30s). When all checks leave `PENDING`/`IN_PROGRESS`:
- Green → exit loop, proceed to merge step 4b.
- Red → increment attempt counter, return to Step 2.

### Step 6 — Budget exhaustion → skip

If attempts reach `MAX_ATTEMPTS` (default 3) OR the wall-clock budget of `MAX_WALL_CLOCK` minutes (default 10) is exceeded OR an `unknown` category is encountered, exit the loop and skip the PR with a structured reason. Skip is reported via the standard `merge-prs` skip-with-reason mechanism — not treated as a hard failure of the Ship phase.

## Mode Behavior

| Mode | Attempt 1 | Attempts 2-3 | Skip condition |
|------|-----------|--------------|----------------|
| **YOLO** | Automatic + announce | Automatic + announce | Budget exhausted OR unknown category |
| **Express** | Confirm via `AskUserQuestion` (show proposed fixes) | Automatic + announce | Same as YOLO |
| **Interactive** | Confirm + show diff | Confirm + show diff per attempt | Same, plus user can decline at any prompt |

Announcement format (all modes):

```
<mode>: ship — CI remediation for PR #<N> (attempt <k>/<MAX>, budget <mm:ss>/<MAX>)
  Categories detected: <category>(<count>), ...
  → <action taken>
  → <commit/push/poll result>
```

## Shared Infrastructure

### `references/best-effort-remediation.md` (new, shared)

This file is the **first use** of the shared bounded-attempt pattern. Sibling issues #225 and #226 will import it without modification. It contains:

1. **Attempt loop skeleton** — a generic pseudocode block parameterized on `MAX_ATTEMPTS`, `MAX_WALL_CLOCK`, poll interval, category detector function, and fix strategy function.
2. **Mode-aware escalation contract** — the YOLO/Express/Interactive confirmation matrix (matching the Mode Behavior table above), described abstractly so CI, conflicts, and reviews can all reference it.
3. **Announcement format templates** — the `<mode>: ship — <operation> for <target> (attempt <k>/<MAX>, budget <mm:ss>/<MAX>)` template and sub-bullets.
4. **Decision table: skip vs pause vs escalate** — when to terminate the loop, when to pause for user input, when to escalate out of the loop (e.g., unknown category → skip; user decline in Interactive → pause; GitHub API 5xx → retry once then escalate).
5. **Wall-clock tracking guidance** — start a timestamp at loop entry, compare against budget at the top of each iteration AND before each `gh pr checks` poll.

### `references/ci-remediation.md` (new, CI-specific)

Imports the shared pattern from `best-effort-remediation.md` and specializes it for CI. Sections:

1. **Category detection heuristics** — per-category regex/substring rules applied to `gh run view --log-failed` output. Each row includes: category name, detection pattern, example log snippet, fix command/strategy. All 8 categories from the issue body appear here.
2. **Fix strategies per category** — concrete commands (e.g., `npm run lint -- --fix`, `prettier --write`, `gh run rerun --failed`, targeted file:line edit for type-error) with notes on when a fix is possible vs when the category is terminal.
3. **Flake handling policy** — single re-run rule; how to distinguish a flake from a real test failure on re-run.
4. **Commit message contract** — `fix(ci): <one-line summary>` with a multi-line body listing each fix applied.
5. **Polling behavior** — how to interpret `gh pr checks` output (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `SUCCESS`, `FAILURE`), and how to recover from transient `gh` errors.
6. **Reference back to shared file** — explicit "See `references/best-effort-remediation.md` for the attempt loop skeleton and mode escalation contract. This file specializes only the CI-specific portions."

## Patterns & Constraints

### Error Handling

- **External command failures** (`gh`, `git`, `npm`, `prettier`): treated as "fix attempt failed" — do not crash the loop. Increment attempt counter, continue.
- **GitHub API transient errors** (5xx, rate limit): retry once after 5 seconds (matching existing `merge-prs` error recovery table). If still failing, skip PR with reason — do not consume an attempt slot.
- **Git push rejection** (non-fast-forward): fetch + rebase once, re-push. If still rejected, skip with reason.
- **Unknown failure category**: terminal — skip PR immediately without consuming remaining attempts.
- **User decline in Interactive mode**: treated as explicit skip — exit loop, report PR as skipped with reason "user declined fix".
- Project preference (`.feature-flow.yml design_preferences.error_handling: exceptions`) applies to Python/JS code, but this change is prompt-instruction Markdown only — no executable code is added.

### Types (schema narrowness)

- `merge.ci_remediation.max_attempts`: integer ≥ 1, default 3.
- `merge.ci_remediation.max_wall_clock_minutes`: integer ≥ 1, default 10.
- `merge.ci_remediation.ci_poll_interval_seconds`: integer ≥ 5, default 30.
- Category names documented as a closed literal set: `lint-format | type-error | test-flaky | test-real | build | dependency-install | timeout-infra | unknown` — not arbitrary strings.

### Performance

- Wall-clock budget is enforced at every loop-iteration top AND before each `gh pr checks` poll, so a slow CI cannot blow past 10 minutes by more than one poll interval.
- `gh pr checks` polling uses `CI_POLL_INTERVAL` (default 30s) — do not poll faster than 10s even if user overrides, to avoid API rate limits.
- Remediation runs sequentially per PR (one PR at a time), preserving the existing `merge-prs` serial merge order from Step 3.
- Fix commands (lint, prettier) are run locally — no parallelization across categories within a single attempt (keeps diffs small and reviewable in Interactive mode).

### Stack-Specific

- **Feature-flow skill file conventions** (from `skills/merge-prs/references/conflict-resolution.md` and `skills/merge-prs/SKILL.md`):
  - Reference files are Markdown with a front-matter sentence: "Reference file for the `merge-prs` skill. Read this file when ..."
  - Tables use pipe syntax with Trivial/Behavioral-style classification columns.
  - Announce formats use backticks around literal output strings.
  - Mode behavior uses a 3-column table (YOLO | Express | Interactive).
- **`.feature-flow.yml` comment style** (from the existing `merge:` block at lines 24-29): hash-comment block with `# field: value   # <enum> | <enum> (default: <value>)` format — the new `ci_remediation` subsection must match.
- **Commit messages**: `fix(ci): <summary>` — conforms to the conventional-commits prefix already used in recent history (`feat:`, `chore:`, `fix:`).

## Files to Modify / Create

### Create

1. **`skills/merge-prs/references/best-effort-remediation.md`** — shared bounded-attempt pattern. First of 3 sibling consumers. Sections: attempt loop skeleton, mode-aware escalation contract, announcement format templates, skip/pause/escalate decision table, wall-clock tracking guidance.
2. **`skills/merge-prs/references/ci-remediation.md`** — CI-specific category detection and fix strategies. Imports the shared pattern above. Sections: category detection heuristics (8 rows), fix strategies per category, flake handling policy, commit message contract, polling behavior, reference-back to shared file.

### Modify

3. **`skills/merge-prs/SKILL.md` line 88** — replace:
   > If CI failing: investigate once — read CI logs via `gh run view`. If trivial fix (lint/type error), apply and push. If unfixable, skip with reason.

   with:
   > If CI failing: enter bounded remediation loop. Read `references/ci-remediation.md` and apply the attempt loop (default: 3 attempts, 10-min wall-clock, 30s poll interval). Skip only after budget exhausted or an `unknown` category is encountered.

4. **`skills/merge-prs/SKILL.md` lines 262-263** (error recovery table) — replace the two rows `CI failing, trivial fix` and `CI failing, unfixable` with a single row:
   > | CI failing | Enter bounded remediation loop (see `references/ci-remediation.md`). Skip only after `MAX_ATTEMPTS` / `MAX_WALL_CLOCK` exhausted or `unknown` category detected. |

5. **`.feature-flow.yml` comment block (lines 24-29)** — extend the existing `merge:` commented-example block with a new `ci_remediation` subsection:

   ```yaml
   # merge:                       # Optional: Ship phase merge configuration (all fields have defaults)
   # strategy: squash             # squash | merge | rebase (default: squash)
   # delete_branch: true          # delete branch after merge (default: true)
   # require_ci: true             # require CI green before merge (default: true)
   # require_review: true         # require approved review before merge (default: true)
   # auto_discover: label         # label | body_marker | both (default: label)
   # ci_remediation:                       # Bounded CI failure remediation loop (see skills/merge-prs/references/ci-remediation.md)
   #   max_attempts: 3                     # integer >= 1 (default: 3)
   #   max_wall_clock_minutes: 10          # integer >= 1 (default: 10)
   #   ci_poll_interval_seconds: 30        # integer >= 5 (default: 30)
   ```

## Scope

### Included

- Bounded remediation loop with 3 attempts, 10-minute wall-clock, 30s poll interval (all configurable).
- 8 failure categories with per-category fix strategies.
- Flake handling via single re-run before classifying as real.
- `fix(ci):` commit prefix for automated fixes.
- Mode-aware escalation: YOLO auto, Express confirm-once-then-auto, Interactive confirm-each-with-diff.
- New shared `best-effort-remediation.md` reference file (first of 3 sibling consumers).
- Integration into existing `SKILL.md` Step 4a without breaking the parallel `gh` call pattern at lines 82-84.
- Documentation of new `merge.ci_remediation` YAML schema in `.feature-flow.yml` comment block.

### Explicitly Excluded

- **Sibling issues #225 (merge conflict ladder) and #226 (PR review triage)** — those will import `best-effort-remediation.md` in later work; this issue only creates it and verifies it with the CI use case.
- **Rewriting `conflict-resolution.md`** to import the shared pattern — that happens in #225, not here.
- **Parallel remediation across multiple failing PRs** — remediation stays sequential per the existing Step 3 merge order.
- **Adaptive budgets** (e.g., learning from past fix success rates) — fixed defaults only; user-overridable via YAML.
- **Known-flake database/list management** — the flake policy is "re-run once"; any explicit project flake list is deferred.
- **Changing the Ship phase failure semantics** — a skipped PR after budget exhaustion still counts as "skipped with reason" (not a hard Ship failure), matching current behavior.
- **Executable code changes** — this is a pure prompt-instruction (Markdown + YAML comment) change. No Python, TypeScript, or test file is added.
- **Implementation of the loop itself as a new tool** — the loop is executed by Claude following the Markdown instructions, not as a hook or sub-agent.

## Migration Requirements

1. New optional YAML schema keys under `merge.ci_remediation` (`max_attempts`, `max_wall_clock_minutes`, `ci_poll_interval_seconds`). All have defaults, so existing `.feature-flow.yml` files without this block continue to work unchanged — no migration required for existing projects.
2. `skills/merge-prs/SKILL.md` gains two reference-file dependencies (`references/ci-remediation.md` and transitively `references/best-effort-remediation.md`). Any skill bundler or plugin packaging must include both files alongside `SKILL.md`.
3. No database, no runtime config state, no Python/TS type changes.
