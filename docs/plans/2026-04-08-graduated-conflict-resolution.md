# Graduated Merge Conflict Resolution with Test Verification — Design Document

**Date:** 2026-04-08
**Status:** Draft
**Issue:** #225
**Scope:** feature
**Dependency:** #224 (merged — `skills/merge-prs/references/best-effort-remediation.md` exists)

---

## Overview

Expand `merge-prs` conflict resolution from the current binary (trivial auto-resolve / behavioral pause) into a **4-tier resolution ladder** that attempts a complete, reasonable resolution before pausing. Tier 2 (NEW) attempts a structurally-safe merge and verifies it by running the project test suite; Tier 3 (NEW) presents the proposed resolution plus test output to the user for a decision. Pausing becomes the last resort, not the first response to any both-sided modification.

---

## Example

**Scenario:** PR #482 modifies `src/auth/login.ts`. Main branch simultaneously received a change that added rate-limiting to the same `validateUser()` function. PR #482 added password-strength checking to `validateUser()`. Both sides touch the same function but add logically independent code blocks.

**Current behavior (pre-#225):**
```
YOLO: ship — Behavioral conflict in PR #482 (src/auth/login.ts:42) → paused
```
User must manually resolve every such conflict, even when the resolution is mechanical.

**New behavior (post-#225):**
```
YOLO: ship — Conflict in PR #482 (src/auth/login.ts:42) → Tier 2 attempt
  → Structural independence check: both sides add non-overlapping lines inside validateUser() scope
  → Applying additive merge...
  → Detected test runner: pnpm test (from pnpm-lock.yaml)
  → Running: timeout 300 pnpm test
  → Tests passed after 01:47
  → Committed: merge: resolve conflict, verified by tests
  → Pushed. Proceeding to merge.
```

If tests had failed, the flow would instead escalate to Tier 3:
```
YOLO: ship — Tier 2 tests failed in PR #482 → Tier 3 pause
  → Discarded attempt (git checkout -- .)
  → Captured test output (42 lines)
  → Presenting to user...
```

---

## Algorithm

### Step 1 — Structure classification (unchanged)

When a PR reports `mergeable: "CONFLICTING"`, create the conflict-resolution worktree (unchanged, at `SKILL.md:229-236`). For each conflict hunk, run the existing Structure Classification (`conflict-resolution.md:28-44`):

| Structure | Route to |
|-----------|----------|
| Import ordering / whitespace / lockfile / generated / adjacent-additions / one-sided modification | **Tier 1** (unchanged) |
| Both-sided modification (structurally independent — see Step 2) | **Tier 2** (NEW) |
| Both-sided modification (semantic overlap) | **Tier 3** (NEW) |
| Unknown structure (malformed markers, unusual format) | **Tier 3** (conservative) |

### Step 2 — Structural independence gate (NEW)

**Where Tier 2 fits:** The existing `adjacent additions` rule (`conflict-resolution.md:32`) already routes cases where both blocks contain ONLY new lines to Tier 1 (trivial). Tier 2 targets a different gap: **cases the behavioral keyword check currently over-flags** (`conflict-resolution.md:68-72`). Those are both-sided modifications where behavioral keywords appear in the conflict region, so keyword-matching escalates them to "behavioral → pause" — but where an additive union merge is still mechanically safe because the changes target non-overlapping semantic scopes within the region.

Apply these rules in order:

1. **Behavioral keyword check would flag, but changes are semantically non-overlapping** — structure classifier reports both-sided modification, behavioral keywords (`if`, `return`, `throw`, `expect(`, etc.) appear in at least one block, AND both blocks introduce their behavioral constructs in distinct statements without modifying a shared statement from the merge base. Example: both sides add a new statement containing `return` inside the same function, but at different positions around a shared `return baseResult()`. → **Tier 2 eligible**.
2. **Both blocks modify different declarations within the same file** — e.g., one side modifies function `foo()`, the other modifies function `bar()`, and the conflict region spans both. → **Tier 2 eligible**.
3. **Both blocks modify overlapping lines that existed in the merge base** — e.g., both sides change the same `if` condition differently, or both sides rewrite the same return statement. → **Tier 3 only** (semantic overlap — additive merge would produce contradictory logic).
4. **Marker parsing ambiguous or blocks contain conflicting imports that Tier 1 did not resolve** → **Tier 3** (conservative).

**Invariant:** Tier 2 is ONLY invoked for cases that would currently be flagged behavioral. Cases already caught by `one-sided modification`, `adjacent additions`, or `context-only keywords` continue to resolve as Tier 1 with no change.

### Step 3 — Tier 2: attempt-with-test-verification (NEW)

Pre-conditions: structural independence gate passed (Step 2 rule 1 or 2).

1. **Attempt additive merge** — write the merged file with both blocks concatenated in their original order.
2. **Discover test runner** — see § Test Runner Discovery below. If no runner found → discard attempt and fall through to Tier 3.
3. **Run tests with timeout** — invoke the discovered command under a hard wall-clock limit (default 5 minutes, configurable via `merge.conflict_resolution.test_timeout_minutes`).
4. **Interpret result:**
   - Exit code 0 and within timeout → **tests passed** → commit with the exact message `merge: resolve conflict, verified by tests` and push. Exit conflict resolution, proceed to merge.
   - Non-zero exit code OR timeout OR runner crash → **tests failed** → `git checkout -- .` to discard the attempt, capture the combined stdout+stderr (trimmed to 80 lines) into a variable, fall through to Tier 3.

### Step 4 — Tier 3: attempt-with-diff-presentation (NEW)

Always pauses via `AskUserQuestion`, regardless of mode.

**Presentation contents:**
- The raw conflict diff (trimmed to 40 lines if longer)
- The proposed resolution Tier 2 computed (if any — omit if Tier 2 was skipped at structural gate)
- Test failure output (if any — omit if Tier 2 was skipped)

**Options shown:**
1. `Accept proposed` — take the Tier 2 merge attempt even though tests failed (user override)
2. `Accept ours` — keep the current base branch version
3. `Accept theirs` — take the incoming branch version
4. `I'll resolve manually` — pause, let user edit files in the worktree, then resume when they confirm

If user selects `Skip this PR` via the "Other" escape hatch: fall through to Tier 4.

### Step 5 — Tier 4: skip (last resort)

Only reached when Tier 3 is declined or manual resolution fails. Log reason, report in Ship Phase Summary, continue with next PR.

---

## Test Runner Discovery

A new helper section in `conflict-resolution.md` (inline — not a separate file) documents how Tier 2 discovers the test runner for the *consumer project* being merged. This pattern is **reusable** for any future remediation loop that needs to run local tests.

### Discovery order (first match wins)

1. **Explicit config:** `merge.conflict_resolution.test_command` in `.feature-flow.yml` — if set, use verbatim and stop.
2. **Stack-based detection** from the `stack:` field in `.feature-flow.yml`:
   - If stack contains `node-js`:
     - `pnpm-lock.yaml` exists → `pnpm test`
     - `yarn.lock` exists → `yarn test`
     - `package-lock.json` exists → `npm test`
     - `package.json` exists (no lockfile) → `npm test`
   - If stack contains `python`:
     - `pytest.ini`, `pyproject.toml` with `[tool.pytest]`, or `setup.cfg` with `[tool:pytest]` exists → `pytest`
     - `pyproject.toml` without pytest config, `setup.py` exists → `python -m pytest`
3. **No match** → return `None`. Tier 2 is skipped; conflict escalates to Tier 3 with reason `test-runner-not-found`.

### Timeout command detection

macOS does not ship GNU `timeout`. Detect at runtime (once per merge-prs invocation):
```bash
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD="gtimeout"
else
  TIMEOUT_CMD=""  # fall back to background-job pattern
fi
```

**Fallback pattern (no `timeout`/`gtimeout` available):**
```bash
( eval "$TEST_CMD" ) &
TEST_PID=$!
( sleep "$TIMEOUT_SECONDS" && kill -TERM "$TEST_PID" 2>/dev/null ) &
KILLER_PID=$!
wait "$TEST_PID"; TEST_EXIT=$?
kill -TERM "$KILLER_PID" 2>/dev/null
```
Non-zero exit from `wait` after the kill signal is interpreted as `timeout`.

---

## Mode Behavior

| Mode | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|------|--------|--------|--------|--------|
| **YOLO** | Auto, announce | Auto attempt + auto commit on green | **Always pause** (safety invariant) | Auto-skip with reason |
| **Express** | Auto, announce | Auto attempt + auto commit on green | **Always pause** (safety invariant) | Auto-skip with reason |
| **Interactive** | Auto, announce | Confirm attempt; confirm commit on green | Always pause | Confirm skip |

**Safety invariant (must never be violated):** Tier 3 ALWAYS pauses, even in YOLO mode. This is the single non-negotiable rule of the new design.

---

## Announcement Formats

All formats follow the existing `best-effort-remediation.md` template style. `<MODE>` is `YOLO`, `Express`, or `Interactive`.

**Tier 2 attempt start:**
```
<MODE>: ship — Conflict in PR #<N> (<file>:<scope>) → Tier 2 attempt
  → Structural independence check: <reason passed>
  → Applying additive merge...
  → Detected test runner: <command> (<source>)
  → Running: <TIMEOUT_CMD> <seconds> <command>
```

**Tier 2 success:**
```
  → Tests passed after <mm:ss>
  → Committed: merge: resolve conflict, verified by tests
  → Pushed. Proceeding to merge.
```

**Tier 2 failure escalating to Tier 3:**
```
  → Tests failed after <mm:ss> (exit <code>)
<MODE>: ship — Tier 2 tests failed in PR #<N> → Tier 3 pause
  → Discarded attempt (git checkout -- .)
  → Captured test output (<lines> lines)
  → Presenting to user...
```

**Tier 2 skipped (no runner):**
```
<MODE>: ship — Tier 2 skipped in PR #<N> → Tier 3 (reason: test-runner-not-found)
```

**Tier 3 resolution:**
```
<MODE>: ship — PR #<N> Tier 3 resolved → <user_choice>
```

**Tier 4 skip:**
```
<MODE>: ship — PR #<N> skipped: conflict unresolved (Tier 4)
```

---

## Shared Infrastructure

This feature **consumes** (does not modify) `skills/merge-prs/references/best-effort-remediation.md` (created by #224). Specifically it reuses:
- Mode-aware escalation patterns for the announcement templates
- The skip/pause/escalate decision table (adds Tier 3 pause as a new row)
- The wall-clock tracking guidance (applied to the test-runner timeout)

It does NOT plug into the bounded-attempt loop skeleton — Tier 2 is a single-shot attempt (not a loop), because the fix (additive merge) is deterministic. If tests fail, the resolution can't be iterated without human judgment, so the flow falls through to Tier 3.

---

## Config Schema Additions

New optional section in `.feature-flow.yml`:
```yaml
merge:
  conflict_resolution:
    test_command: "pnpm test"                # optional — overrides stack detection
    test_timeout_minutes: 5                   # optional — default 5, minimum 1
```

All fields optional. Absence preserves current behavior (stack-based detection with 5-minute default).

---

## Patterns & Constraints

### Error Handling
- **No bare `catch (e) {}`** — the hook blocks empty catches. All error handling is explicit: on test runner crash, capture stderr and treat as "tests failed" → Tier 3.
- **Wall-clock timeout enforced** — the `timeout` command (or bash kill fallback) must kill the test process after `test_timeout_minutes` × 60 seconds. Treat SIGTERM as "tests failed" with reason `timeout`.
- **Git safety** — always `git checkout -- .` to discard failed attempts before falling through. Never leave partial resolutions in the worktree.

### Types (markdown documentation only — no runtime types)
- Exit code conventions: `0 = pass`, `1-127 = fail`, `>128 = killed by signal`
- Mode flags: literal strings `YOLO | Express | Interactive`

### Performance
- Tier 2 timeout defaults to 5 minutes. Long-running test suites must set `test_timeout_minutes` explicitly or Tier 2 will kill them mid-run.
- Minimum poll granularity for the bash kill fallback is 1 second.

### Stack-Specific
- **macOS** does not ship `timeout` — detection and fallback are mandatory.
- **Lockfile detection** must handle the case where multiple lockfiles exist (choose the one matching `packageManager` field in `package.json` if present; else prefer `pnpm` > `yarn` > `npm` for deterministic ordering).

### CWD Safety
- The existing CWD safety guard at `SKILL.md:245-249` is preserved verbatim. Tier 2 runs **inside** the existing conflict-resolution worktree — no new worktree is created, no new CWD transitions are introduced.

---

## Files to Modify

| File | Change |
|------|--------|
| `skills/merge-prs/references/conflict-resolution.md` | Add §Tier 2, §Tier 3, §Test Runner Discovery, §Timeout Detection. Update Structure Classification routing: after the existing behavioral keyword check, insert a structural-independence gate that routes eligible both-sided modifications to Tier 2; all other behavioral cases route to Tier 3. Rename "Behavioral Conflicts" section to "Tier 3: Diff Presentation" with updated option list. Add **Example 7** (new): a keyword-triggered but structurally-independent both-sided modification routed to Tier 2, showing both success (tests pass → commit) and failure (tests fail → escalate to Tier 3). |
| `skills/merge-prs/SKILL.md` | §Conflict Resolution (lines 223-249): update summary to describe the 4-tier ladder and reference the new sections. §Error Recovery table: replace the "Merge conflict, behavioral" row with two rows — "Merge conflict, structurally independent → Tier 2" and "Merge conflict, semantic overlap → Tier 3 (pause)". §Config table: add `merge.conflict_resolution.test_command` and `merge.conflict_resolution.test_timeout_minutes` rows with defaults. |
| `.feature-flow.yml` | **No change required** — new config fields are optional and absent fields use defaults. |

**Not modified:**
- `skills/merge-prs/references/best-effort-remediation.md` — consumed only, not edited.
- `skills/merge-prs/references/ci-remediation.md` — independent remediation loop, unaffected.

---

## Scope

### Included
- Tier 2 and Tier 3 added to `conflict-resolution.md` with full specifications
- Structural independence gate logic defined
- Test runner discovery algorithm (config override + stack-based detection)
- Timeout command detection + bash fallback
- Mode behavior table covering Tier 2 and Tier 3
- Announcement templates matching existing style
- Commit message format `merge: resolve conflict, verified by tests`
- Config schema additions in `.feature-flow.yml` (optional)
- Updated Error Recovery and Config tables in `SKILL.md`
- Examples showing Tier 2 success and Tier 2-to-Tier 3 escalation

### Explicitly Excluded
- **Loop / retry behavior for Tier 2** — single-shot only. If tests fail, escalate to Tier 3. Retry requires human judgment and is out of scope.
- **Sandboxing the test run** — tests run in the existing worktree with the user's normal environment. No container/chroot isolation.
- **Parallel test runners** — Tier 2 runs one test command synchronously.
- **Test result caching** — no reuse of prior test results across PRs.
- **Changes to Tier 1 classification** — Tier 1 auto-resolve rules are unchanged.
- **Runtime code** — feature-flow is a Markdown-only skill plugin; no TypeScript/Python implementation is added.

---

## Acceptance Criteria (from issue #225)

- [ ] `skills/merge-prs/references/conflict-resolution.md` updated with Tier 2 (attempt-with-test-verification) section
- [ ] `skills/merge-prs/references/conflict-resolution.md` updated with Tier 3 (attempt-with-diff-presentation) section
- [ ] Classification logic routes conflicts to the appropriate tier based on structure + verification outcomes
- [ ] Tier 2 verification loop: apply → test → commit-if-green → fall-through-if-red
- [ ] Test suite discovery reuses `.feature-flow.yml` / project-file detection (shared with CI remediation)
- [ ] Worktree flow and CWD safety guard at `SKILL.md:224-249` preserved
- [ ] Tier 3 ALWAYS pauses, even in YOLO mode (safety invariant)
- [ ] Tier 3 presentation includes test output when Tier 2 failed
- [ ] `skills/merge-prs/SKILL.md` §Conflict Resolution updated to describe the ladder
- [ ] Error recovery table entry for "Merge conflict, behavioral" updated to reflect new ladder
- [ ] Commits from Tier 2 use `merge: resolve conflict, verified by tests` format
- [ ] Test suite timeout enforced (default 5 minutes)
- [ ] Test suite failure falls through to Tier 3 (not Tier 4/skip)

---

## Open Questions

None. All decisions self-answered from the issue body and existing codebase patterns.

---

## Next Steps

1. Run `design-verification` to check this design against the codebase
2. Update issue #225 with the final design via `create-issue`
3. Run `writing-plans` to create an implementation plan with per-task acceptance criteria
