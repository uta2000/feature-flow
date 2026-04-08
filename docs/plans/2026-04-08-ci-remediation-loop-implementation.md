# CI Remediation Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand one-shot CI failure handling in `merge-prs` into a bounded 3-attempt / 10-minute diagnosis-and-fix loop, backed by two new reference Markdown files.

**Architecture:** Create `references/best-effort-remediation.md` as a shared bounded-attempt pattern (reusable by sibling issues #225 and #226), then create `references/ci-remediation.md` as the CI-specific specialization. Finally, update two locations in `SKILL.md` and one comment block in `.feature-flow.yml` to wire in the new loop.

**Tech Stack:** Markdown only — no executable code, no Python/TS, no test files. All changes are prompt-instruction documents consumed by Claude at runtime.

---

## Conventions to Know Before Starting

1. **Reference file header sentence** — every file in `skills/merge-prs/references/` starts with exactly one sentence in the form:
   `Reference file for the \`merge-prs\` skill. Read this file when <condition>.`
   See `skills/merge-prs/references/conflict-resolution.md` line 3 and `skills/merge-prs/references/dependency-analysis.md` line 3 for examples.

2. **Table style** — pipe syntax with a header-separator row. Column names are Title-cased. See `conflict-resolution.md` for examples of multi-column tables with `|------|-----------|------------|` separators.

3. **Announce format** — backtick-wrapped literal output strings, mode-prefixed (`YOLO:`, `Express:`, `Ship:`). See `SKILL.md` lines 46-47, 73-74.

4. **`.feature-flow.yml` comment style** — hash-comments with `# field: value   # <enum> | <enum> (default: <value>)` alignment. See lines 24-29 of `.feature-flow.yml` for the exact indentation and spacing to match.

5. **SKILL.md line 88** (current text):
   `If CI failing: investigate once — read CI logs via \`gh run view\`. If trivial fix (lint/type error), apply and push. If unfixable, skip with reason.`

6. **SKILL.md lines 262-263** (current text — two rows in the Error Recovery table):
   ```
   | CI failing, trivial fix | Apply fix, push, retry merge once |
   | CI failing, unfixable | Skip with reason |
   ```

---

### Task 1: Create `skills/merge-prs/references/best-effort-remediation.md`

**Files:**
- Create: `skills/merge-prs/references/best-effort-remediation.md`

**Step 1: Verify the references directory exists**

Run:
```bash
ls /Users/weee/Dev/feature-flow/skills/merge-prs/references/
```
Expected: see `conflict-resolution.md`, `dependency-analysis.md`, `CLAUDE.md`. If the directory is missing, something is wrong — stop and investigate.

**Step 2: Write the file**

Create `skills/merge-prs/references/best-effort-remediation.md` with exactly this content:

```markdown
# Best-Effort Remediation — Shared Bounded-Attempt Pattern

Reference file for the `merge-prs` skill. Read this file when implementing any bounded remediation loop (CI failures, merge conflicts, review triage) to get the shared loop skeleton, mode escalation contract, announcement templates, and skip/pause/escalate decision table.

---

## Overview

This file is the canonical definition of the **bounded-attempt pattern** used across `merge-prs` remediation loops. Specializations (CI, conflict, review) reference this file and document only what differs. Do not duplicate the loop skeleton or mode table in specialization files — reference this file explicitly.

**Current consumers:**
- `references/ci-remediation.md` (CI failure loop — issue #224)
- `references/conflict-resolution.md` (merge conflict ladder — issue #225, future)
- PR review triage (issue #226, future)

---

## Attempt Loop Skeleton

Generic pseudocode. Specializations plug in their own `detect_failures()`, `apply_fix()`, `verify_success()`, and `build_commit_message()` functions.

```
Parameters:
  MAX_ATTEMPTS          — integer >= 1 (default 3)
  MAX_WALL_CLOCK        — integer >= 1 minutes (default 10)
  POLL_INTERVAL         — integer >= 5 seconds (default 30)
  target                — the PR/item being remediated
  detect_failures()     — returns list of (category, file, line, message) tuples
  apply_fix(failure)    — returns (success: bool, diff: string)
  verify_success()      — polls until done; returns (green: bool, timed_out: bool)
  build_commit_message()— returns conventional-commit string

Procedure:
  loop_start_time = now()
  attempt = 1

  LOOP:
    # Budget check at top of every iteration
    elapsed = now() - loop_start_time
    if elapsed >= MAX_WALL_CLOCK minutes:
      SKIP target with reason "wall-clock budget exhausted (MAX_WALL_CLOCK min)"
      EXIT LOOP

    if attempt > MAX_ATTEMPTS:
      SKIP target with reason "attempt budget exhausted (MAX_ATTEMPTS attempts)"
      EXIT LOOP

    # 1. Announce
    announce(mode, target, attempt, MAX_ATTEMPTS, elapsed, MAX_WALL_CLOCK)

    # 2. Detect
    failures = detect_failures(target)
    if any failure.category == "unknown":
      SKIP target with reason "unknown failure category — cannot auto-remediate"
      EXIT LOOP (terminal: do not increment attempt)

    # 3. Confirm (mode-gated — see Mode-Aware Escalation Contract below)
    confirmed = confirm_with_user_if_required(mode, attempt, failures)
    if not confirmed:
      SKIP target with reason "user declined fix"
      EXIT LOOP

    # 4. Apply fixes (sequential, one per failure)
    any_fix_applied = false
    for each failure in failures:
      (ok, diff) = apply_fix(failure)
      if ok:
        any_fix_applied = true
        announce_fix_applied(failure, diff)

    # 5. Commit + push (only if any fix was applied)
    if any_fix_applied:
      msg = build_commit_message(failures)
      git add -A && git commit -m "<msg>" && git push

    # 6. Budget check before polling
    elapsed = now() - loop_start_time
    if elapsed >= MAX_WALL_CLOCK minutes:
      SKIP target with reason "wall-clock budget exhausted before poll"
      EXIT LOOP

    # 7. Verify
    (green, timed_out) = verify_success(POLL_INTERVAL)
    if timed_out:
      SKIP target with reason "verify timed out within wall-clock budget"
      EXIT LOOP
    if green:
      EXIT LOOP (success — proceed to next step)

    # 8. Increment and retry
    attempt += 1
    CONTINUE LOOP
```

---

## Mode-Aware Escalation Contract

| Mode | Attempt 1 | Attempts 2–MAX | Skip condition |
|------|-----------|----------------|----------------|
| **YOLO** | Automatic — no user prompt | Automatic — announce only | Budget exhausted OR `unknown` category |
| **Express** | Confirm via `AskUserQuestion` (show proposed fixes, not diff) | Automatic — announce only | Same as YOLO |
| **Interactive** | Confirm via `AskUserQuestion` (show diff per fix) | Confirm via `AskUserQuestion` (show diff per fix) | Same, plus user can decline at any prompt |

**YOLO/Express auto-announce format (all attempts):**
```
<MODE>: ship — <operation> for PR #<N> (attempt <k>/<MAX>, budget <mm:ss>/<MAX>)
  Categories detected: <category>(<count>), <category>(<count>), ...
  → <action taken per fix>
  → <commit/push/poll result>
```

**Express attempt-1 `AskUserQuestion` format:**
- Prompt: "CI remediation for PR #N — proposed fixes:"
- Body: list each `(category, file, line, proposed_fix_command)` on its own line
- Options: "Apply all fixes automatically" | "Skip this PR"

**Interactive `AskUserQuestion` format (each attempt):**
- Prompt: "CI remediation for PR #N (attempt k/MAX) — review proposed changes:"
- Body: diff per fix (trimmed to 40 lines each)
- Options: "Apply these fixes" | "Skip this PR"

---

## Announcement Format Templates

Use these exact templates. Replace `<MODE>` with `YOLO`, `Express`, or `Ship` (for Interactive). Replace placeholders in `<angle brackets>`.

**Loop entry (all modes):**
```
<MODE>: ship — <operation> for PR #<N> (attempt <k>/<MAX_ATTEMPTS>, budget <mm:ss>/<MAX_WALL_CLOCK>:00)
```

**Fix applied (sub-bullet):**
```
  → Applied: <fix_command_or_description>
```

**Commit/push result (sub-bullet):**
```
  → Committed: <commit_message>
  → Pushed. Polling <verify_command> (interval <POLL_INTERVAL>s)...
```

**Verify result (sub-bullet):**
```
  → <result> after <mm:ss>. <next_action>
```
Example: `→ CI green after 02:14. Proceeding to merge.`
Example: `→ CI still red after 03:00. Incrementing attempt counter.`

**Skip announcement (all modes):**
```
<MODE>: ship — PR #<N> skipped: <reason>
```

---

## Decision Table: Skip vs Pause vs Escalate

| Condition | Action | Notes |
|-----------|--------|-------|
| `unknown` failure category detected | **Skip** immediately (terminal) | Do not consume an attempt slot |
| `MAX_ATTEMPTS` reached | **Skip** with reason | Report attempt count in reason |
| `MAX_WALL_CLOCK` exceeded | **Skip** with reason | Report elapsed time in reason |
| User declines in Interactive mode | **Skip** with reason "user declined fix" | Exit loop cleanly |
| GitHub API 5xx / rate limit | **Retry once** after 5s; if still failing → **Skip** | Do not consume an attempt slot for transient errors |
| Git push rejected (non-fast-forward) | **Fetch + rebase once**, re-push; if still rejected → **Skip** | Do not consume an attempt slot |
| Fix command exits non-zero | Treat as "fix attempt failed" — **increment attempt, continue** | Do not crash the loop |
| All checks green after verify | **Proceed** to next phase | Exit loop (success) |

**Skip is not a hard failure.** A skipped PR is reported in the Ship Phase Summary with its reason. The overall Ship phase continues with remaining PRs.

---

## Wall-Clock Tracking Guidance

1. **Capture start time at loop entry** — before the first announcement, before any `gh` call.
2. **Check elapsed time at two points per iteration:**
   a. Top of loop (before `detect_failures`) — catches slow fix commands.
   b. Before `verify_success` poll — catches long commit/push operations.
3. **Format elapsed time as `mm:ss`** (zero-padded minutes and seconds) in all announcements.
4. **Do not rely on attempt count alone** — a single slow CI run can exhaust the wall-clock budget in one attempt. Always enforce both limits independently.
5. **Minimum poll interval:** never poll faster than 10 seconds even if `POLL_INTERVAL` is overridden to a lower value — prevents GitHub API rate limiting.
```

**Step 3: Verify the file was created with required strings**

Check the file exists and contains the critical strings:
```bash
test -f /Users/weee/Dev/feature-flow/skills/merge-prs/references/best-effort-remediation.md && echo "EXISTS"
grep -c "MAX_ATTEMPTS" /Users/weee/Dev/feature-flow/skills/merge-prs/references/best-effort-remediation.md
grep -c "MAX_WALL_CLOCK" /Users/weee/Dev/feature-flow/skills/merge-prs/references/best-effort-remediation.md
```
Expected: `EXISTS`, count >= 5 for each grep.

**Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow
git add skills/merge-prs/references/best-effort-remediation.md
git commit -m "feat: add shared best-effort-remediation reference for bounded attempt loop (#224)"
```

**Acceptance Criteria:**
- [ ] File `skills/merge-prs/references/best-effort-remediation.md` exists
- [ ] File contains the string `MAX_ATTEMPTS`
- [ ] File contains the string `MAX_WALL_CLOCK`
- [ ] File contains the string `POLL_INTERVAL`
- [ ] File contains the string `Mode-Aware Escalation Contract`
- [ ] File contains the string `Decision Table`
- [ ] File contains the string `Wall-Clock Tracking Guidance`
- [ ] File starts with `# Best-Effort Remediation`
- [ ] File second line begins `Reference file for the \`merge-prs\` skill.`

---

### Task 2: Create `skills/merge-prs/references/ci-remediation.md`

**Files:**
- Create: `skills/merge-prs/references/ci-remediation.md`

**Step 1: Write the file**

Create `skills/merge-prs/references/ci-remediation.md` with exactly this content:

```markdown
# CI Remediation

Reference file for the `merge-prs` skill. Read this file when a PR's `statusCheckRollup` reports a failing check — enter the bounded remediation loop described here.

See `references/best-effort-remediation.md` for the attempt loop skeleton and mode escalation contract. This file specializes only the CI-specific portions.

---

## Overview

When `gh pr view <number> --json statusCheckRollup` shows a failing check, do not investigate only once. Instead, enter the bounded remediation loop:

- **MAX_ATTEMPTS:** 3 (overridable via `.feature-flow.yml` `merge.ci_remediation.max_attempts`)
- **MAX_WALL_CLOCK:** 10 minutes (overridable via `merge.ci_remediation.max_wall_clock_minutes`)
- **CI_POLL_INTERVAL:** 30 seconds (overridable via `merge.ci_remediation.ci_poll_interval_seconds`, minimum 10s)

Fetch the failing run ID from `statusCheckRollup`, then call `gh run view <run-id> --log-failed` to pull the failure logs. Parse each failure into a `(category, file, line, message)` tuple using the detection heuristics below.

---

## Category Detection Heuristics

Apply these rules top-to-bottom against each failure entry from `gh run view <run-id> --log-failed`. Assign the **first matching category**.

| Category | Detection pattern | Example log snippet | Terminal? |
|----------|-------------------|---------------------|-----------|
| `lint-format` | Log contains `prettier`, `eslint`, `pylint`, `flake8`, `black`, `ruff`, `unexpected token`, `Parsing error`, or ends with `Expected N spaces` | `Expected 2 spaces but found 4` | No |
| `type-error` | Log contains `TS\d+:`, `Type '.*' is not assignable`, `Property '.*' does not exist`, `Cannot find name`, `mypy: error:`, `pyright:` | `TS2345: Argument of type 'string' is not assignable` | No |
| `test-flaky` | Failing test name matches the project known-flake list OR first encounter of a test timeout/network error that passes on re-run (see Flake Handling Policy) | `Error: ETIMEDOUT`, `connect ECONNREFUSED` (and passes on re-run) | No |
| `test-real` | Any `FAIL`/`FAILED` assertion not matching `test-flaky` criteria; or a `test-flaky` failure that also fails on re-run | `Expected: 42, Received: 0`, `AssertionError` | No |
| `build` | Log contains `Build failed`, `Cannot find module`, `webpack`, `tsc: error`, `esbuild`, `vite: error`, `rollup`, `SyntaxError` in a build step | `error TS6133: 'foo' is declared but its value is never read` | No |
| `dependency-install` | Log contains `npm ERR!`, `yarn error`, `pnpm ERR!`, `pip install`, `Could not resolve dependency`, `ERESOLVE` | `npm ERR! ERESOLVE unable to resolve dependency tree` | No |
| `timeout-infra` | Log contains `Job was cancelled`, `timed out after`, `The runner has received a shutdown signal`, GitHub Actions infrastructure timeout messages | `Error: The operation was canceled` (runner shutdown) | No |
| `unknown` | None of the above patterns matched | (any log not matching above) | **Yes** |

**Assignment rule:** Each failure entry gets exactly one category. If a failure matches multiple patterns, the first matching row wins (table is ordered by specificity: `lint-format` and `type-error` are most specific, `unknown` is the catch-all).

---

## Fix Strategies Per Category

| Category | Fix command / strategy | Notes |
|----------|------------------------|-------|
| `lint-format` | Run `npm run lint -- --fix` (JS/TS) or `black <file>` / `ruff check --fix <file>` (Python). If no auto-fix command available, run `prettier --write <file>` for formatting-only errors. | Commit with `fix(ci): resolve lint/format errors` |
| `type-error` | Read the exact `file:line` from the log. Open the file, inspect the type annotation, apply a minimal targeted fix (add missing type annotation, correct type cast, fix import). Do not refactor. | Commit with `fix(ci): resolve type errors in <file>` |
| `test-flaky` | Run `gh run rerun --failed <run-id>` to re-run the failing job. Do not apply any code change. If re-run passes, exit loop (success). If re-run fails, re-classify to `test-real`. | No commit needed for re-run. If re-classified, treat as `test-real`. |
| `test-real` | Cannot auto-fix. **Skip the PR immediately** with reason "real test failure — manual investigation required". | Terminal for this PR; do not consume remaining attempts. |
| `build` | Inspect the exact error. If it is a missing import or mis-named export (resolvable from the error message alone), apply the targeted fix. If it requires broader investigation, skip with reason "build failure — manual investigation required". | Commit with `fix(ci): resolve build error in <file>` |
| `dependency-install` | Run `npm install` / `yarn install` / `pnpm install` (match the project's package manager from `package.json`). Commit the updated lock file. | Commit with `fix(ci): regenerate lock file` |
| `timeout-infra` | Run `gh run rerun --failed <run-id>`. This is an infrastructure flake — do not apply code changes. | No commit needed. If re-run also times out, skip with reason "persistent infra timeout". |
| `unknown` | **Terminal** — skip the PR immediately. Do not apply any fix. | Reason: "unknown failure category — cannot auto-remediate" |

---

## Flake Handling Policy

A failure is classified as `test-flaky` on its first encounter only when:
1. The failing test name appears in the project's known-flake list (if one exists at `.feature-flow-flakes.txt` or similar), **OR**
2. The error message matches a transient-network or timeout pattern (`ETIMEDOUT`, `ECONNREFUSED`, `socket hang up`, `timed out after`) AND the test passes on a single re-run via `gh run rerun --failed`.

**Re-run rule:** Re-run once only. If the re-run passes → `test-flaky` confirmed (success). If the re-run fails → re-classify as `test-real` → skip the PR.

**Never re-run more than once per failure instance** — two consecutive failures of the same test indicate a real failure.

---

## Commit Message Contract

All CI-remediation commits MUST use the `fix(ci):` prefix. This makes them greppable and squash-cleanly separable.

**Format:**
```
fix(ci): <one-line summary of fixes>

- <category>: <file:line> — <what was fixed>
- <category>: <file:line> — <what was fixed>
...
```

**Examples:**
```
fix(ci): resolve lint and type errors in PR #42

- lint-format: src/foo.ts — prettier formatting
- type-error: src/bar.ts:42 — add missing string annotation
```

```
fix(ci): regenerate lock file after dependency update

- dependency-install: package-lock.json — npm install
```

**Rule:** Only include the multi-line body when two or more distinct fixes are applied in one attempt. Single-fix commits may use the one-liner only.

---

## Polling Behavior

After committing and pushing fixes, poll `gh pr checks <number>` every `CI_POLL_INTERVAL` seconds.

**Interpreting `gh pr checks` output:**

| Status value | Meaning | Action |
|--------------|---------|--------|
| `PENDING` | Check queued, not yet running | Continue polling |
| `IN_PROGRESS` | Check currently running | Continue polling |
| `COMPLETED` + `SUCCESS` | Check passed | All checks in this state → CI green → exit loop (success) |
| `COMPLETED` + `FAILURE` | Check failed | All checks no longer pending → CI red → increment attempt |
| `COMPLETED` + `CANCELLED` | Check was cancelled (infra) | Treat as `timeout-infra` → re-run once |

**Poll loop:**
1. Check elapsed wall-clock time — if >= `MAX_WALL_CLOCK`, stop polling and skip PR.
2. Run `gh pr checks <number> --json name,state,conclusion`
3. If any check is `PENDING` or `IN_PROGRESS` → wait `CI_POLL_INTERVAL` seconds, repeat.
4. If all checks are `COMPLETED`:
   - All `SUCCESS` → return green = true.
   - Any `FAILURE` → return green = false.
   - Any `CANCELLED` → return as `timeout-infra` (re-run, do not consume attempt).
5. **Transient `gh` errors** (non-zero exit, network error): retry once after 5 seconds. If still failing, skip PR with reason "gh pr checks command failed".

---

## Reference Back to Shared File

This file specializes the loop defined in `references/best-effort-remediation.md`:

- **Attempt loop skeleton** → `best-effort-remediation.md § Attempt Loop Skeleton`
- **Mode-aware escalation** → `best-effort-remediation.md § Mode-Aware Escalation Contract`
- **Announcement templates** → `best-effort-remediation.md § Announcement Format Templates`
- **Skip/pause/escalate decisions** → `best-effort-remediation.md § Decision Table`
- **Wall-clock tracking** → `best-effort-remediation.md § Wall-Clock Tracking Guidance`

CI-specific parameters:
- `detect_failures()` → `gh run view <run-id> --log-failed` + Category Detection Heuristics above
- `apply_fix(failure)` → Fix Strategies Per Category above
- `verify_success()` → Polling Behavior above
- `build_commit_message()` → Commit Message Contract above
```

**Step 2: Verify the file was created with required strings**

```bash
test -f /Users/weee/Dev/feature-flow/skills/merge-prs/references/ci-remediation.md && echo "EXISTS"
grep -c "MAX_ATTEMPTS" /Users/weee/Dev/feature-flow/skills/merge-prs/references/ci-remediation.md
```

Expected: `EXISTS`, count >= 1.

Verify all 8 category names are present:
```bash
for cat in lint-format type-error test-flaky test-real build dependency-install timeout-infra unknown; do
  grep -q "$cat" /Users/weee/Dev/feature-flow/skills/merge-prs/references/ci-remediation.md && echo "FOUND: $cat" || echo "MISSING: $cat"
done
```
Expected: `FOUND:` for all 8.

**Step 3: Commit**

```bash
cd /Users/weee/Dev/feature-flow
git add skills/merge-prs/references/ci-remediation.md
git commit -m "feat: add ci-remediation reference with 8-category detection and fix strategies (#224)"
```

**Acceptance Criteria:**
- [ ] File `skills/merge-prs/references/ci-remediation.md` exists
- [ ] File contains the string `MAX_ATTEMPTS`
- [ ] File contains the string `best-effort-remediation.md`
- [ ] File contains the string `fix(ci):`
- [ ] File contains all 8 category names: `lint-format`, `type-error`, `test-flaky`, `test-real`, `build`, `dependency-install`, `timeout-infra`, `unknown`
- [ ] File contains the string `Flake Handling Policy`
- [ ] File contains the string `Polling Behavior`
- [ ] File contains the string `Commit Message Contract`
- [ ] File second line begins `Reference file for the \`merge-prs\` skill.`

---

### Task 3: Update `SKILL.md` line 88 — replace one-shot CI handling

**Files:**
- Modify: `skills/merge-prs/SKILL.md:88`

**Step 1: Read the current line to confirm exact text**

Open `skills/merge-prs/SKILL.md` and read lines 85-92 to confirm the exact text at line 88:

Expected text (line 88):
```
- If CI failing: investigate once — read CI logs via `gh run view`. If trivial fix (lint/type error), apply and push. If unfixable, skip with reason.
```

If the text differs, adjust the replacement accordingly — do not blindly overwrite.

**Step 2: Replace the one-shot CI handling line**

Replace line 88's content from:
```
- If CI failing: investigate once — read CI logs via `gh run view`. If trivial fix (lint/type error), apply and push. If unfixable, skip with reason.
```

With:
```
- If CI failing: enter bounded remediation loop. Read `references/ci-remediation.md` and apply the attempt loop (default: 3 attempts, 10-min wall-clock, 30s poll interval). Skip only after budget exhausted or an `unknown` category is encountered.
```

Use the Edit tool with `old_string` set to the exact current line text and `new_string` set to the replacement.

**Step 3: Verify the change**

```bash
grep -n "investigate once" /Users/weee/Dev/feature-flow/skills/merge-prs/SKILL.md
```
Expected: no output (old text is gone).

```bash
grep -n "references/ci-remediation.md" /Users/weee/Dev/feature-flow/skills/merge-prs/SKILL.md
```
Expected: at least 1 match.

**Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow
git add skills/merge-prs/SKILL.md
git commit -m "feat: replace one-shot CI handling with bounded remediation loop in SKILL.md (#224)"
```

**Acceptance Criteria:**
- [ ] `skills/merge-prs/SKILL.md` line 88 no longer contains the string `investigate once`
- [ ] `skills/merge-prs/SKILL.md` contains the string `references/ci-remediation.md`
- [ ] `skills/merge-prs/SKILL.md` contains the string `bounded remediation loop`

---

### Task 4: Update `SKILL.md` lines 262-263 — collapse two error recovery rows into one

**Files:**
- Modify: `skills/merge-prs/SKILL.md:262-263`

**Step 1: Read the current rows to confirm exact text**

Open `skills/merge-prs/SKILL.md` and read lines 258-268 to confirm the exact text of the two CI rows. Expected (approximately lines 262-263):
```
| CI failing, trivial fix | Apply fix, push, retry merge once |
| CI failing, unfixable | Skip with reason |
```

If the text differs slightly (extra spaces, different wording), note the exact text — use it verbatim as `old_string`.

**Step 2: Replace the two rows with one**

Replace the two-row block:
```
| CI failing, trivial fix | Apply fix, push, retry merge once |
| CI failing, unfixable | Skip with reason |
```

With a single row:
```
| CI failing | Enter bounded remediation loop (see `references/ci-remediation.md`). Skip only after `MAX_ATTEMPTS` / `MAX_WALL_CLOCK` exhausted or `unknown` category detected. |
```

Use the Edit tool with `old_string` matching both lines (include the newline between them) and `new_string` as the single replacement row.

**Step 3: Verify the change**

```bash
grep -n "trivial fix" /Users/weee/Dev/feature-flow/skills/merge-prs/SKILL.md
```
Expected: no output.

```bash
grep -n "CI failing" /Users/weee/Dev/feature-flow/skills/merge-prs/SKILL.md
```
Expected: exactly 1 match (the new single row), plus possibly any other non-table occurrences.

**Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow
git add skills/merge-prs/SKILL.md
git commit -m "fix: collapse CI error recovery table to single bounded-loop row in SKILL.md (#224)"
```

**Acceptance Criteria:**
- [ ] `skills/merge-prs/SKILL.md` does not contain the string `CI failing, trivial fix`
- [ ] `skills/merge-prs/SKILL.md` does not contain the string `CI failing, unfixable`
- [ ] `skills/merge-prs/SKILL.md` contains exactly one row starting with `| CI failing`
- [ ] That row references `references/ci-remediation.md`

---

### Task 5: Update `.feature-flow.yml` — add `ci_remediation` comment subsection

**Files:**
- Modify: `.feature-flow.yml:24-29`

**Step 1: Read the current comment block to confirm exact text**

Open `.feature-flow.yml` and read lines 22-32 to confirm the exact current text of the `merge:` comment block. Expected (lines 24-29):
```yaml
# merge:                       # Optional: Ship phase merge configuration (all fields have defaults)
# strategy: squash             # squash | merge | rebase (default: squash)
# delete_branch: true          # delete branch after merge (default: true)
# require_ci: true             # require CI green before merge (default: true)
# require_review: true         # require approved review before merge (default: true)
# auto_discover: label         # label | body_marker | both (default: label)
```

**Step 2: Append `ci_remediation` subsection to the comment block**

Replace the existing comment block (lines 24-29) with the extended version that includes `ci_remediation`:

Old text (use exact text from Step 1):
```
# merge:                       # Optional: Ship phase merge configuration (all fields have defaults)
# strategy: squash             # squash | merge | rebase (default: squash)
# delete_branch: true          # delete branch after merge (default: true)
# require_ci: true             # require CI green before merge (default: true)
# require_review: true         # require approved review before merge (default: true)
# auto_discover: label         # label | body_marker | both (default: label)
```

New text:
```
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

Use the Edit tool. Make sure the indentation of the new `ci_remediation` lines uses the same number of leading `#` + spaces as the existing lines.

**Step 3: Verify the change**

```bash
grep -n "ci_remediation" /Users/weee/Dev/feature-flow/.feature-flow.yml
```
Expected: 4 lines (the subsection header + 3 fields).

```bash
grep -n "max_attempts" /Users/weee/Dev/feature-flow/.feature-flow.yml
```
Expected: 1 match.

**Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow
git add .feature-flow.yml
git commit -m "feat: add ci_remediation config subsection to .feature-flow.yml comment block (#224)"
```

**Acceptance Criteria:**
- [ ] `.feature-flow.yml` contains the string `ci_remediation`
- [ ] `.feature-flow.yml` contains the string `max_attempts: 3`
- [ ] `.feature-flow.yml` contains the string `max_wall_clock_minutes: 10`
- [ ] `.feature-flow.yml` contains the string `ci_poll_interval_seconds: 30`
- [ ] All four new lines are hash-commented (start with `#`)
- [ ] The existing `merge:` comment lines are unchanged (verify `strategy: squash` still present)

---

## Summary Checklist

After all 5 tasks are complete, verify every acceptance criterion passes:

```bash
# Task 1
test -f /Users/weee/Dev/feature-flow/skills/merge-prs/references/best-effort-remediation.md && echo "T1 file OK"
grep -q "MAX_ATTEMPTS" /Users/weee/Dev/feature-flow/skills/merge-prs/references/best-effort-remediation.md && echo "T1 MAX_ATTEMPTS OK"
grep -q "Mode-Aware Escalation Contract" /Users/weee/Dev/feature-flow/skills/merge-prs/references/best-effort-remediation.md && echo "T1 escalation OK"
grep -q "Decision Table" /Users/weee/Dev/feature-flow/skills/merge-prs/references/best-effort-remediation.md && echo "T1 decision table OK"
grep -q "Wall-Clock Tracking Guidance" /Users/weee/Dev/feature-flow/skills/merge-prs/references/best-effort-remediation.md && echo "T1 wall-clock OK"

# Task 2
test -f /Users/weee/Dev/feature-flow/skills/merge-prs/references/ci-remediation.md && echo "T2 file OK"
grep -q "best-effort-remediation.md" /Users/weee/Dev/feature-flow/skills/merge-prs/references/ci-remediation.md && echo "T2 ref OK"
grep -q "fix(ci):" /Users/weee/Dev/feature-flow/skills/merge-prs/references/ci-remediation.md && echo "T2 commit prefix OK"
for cat in lint-format type-error test-flaky test-real build dependency-install timeout-infra unknown; do
  grep -q "$cat" /Users/weee/Dev/feature-flow/skills/merge-prs/references/ci-remediation.md && echo "T2 $cat OK" || echo "T2 $cat MISSING"
done

# Task 3
! grep -q "investigate once" /Users/weee/Dev/feature-flow/skills/merge-prs/SKILL.md && echo "T3 old text gone OK"
grep -q "references/ci-remediation.md" /Users/weee/Dev/feature-flow/skills/merge-prs/SKILL.md && echo "T3 new ref OK"
grep -q "bounded remediation loop" /Users/weee/Dev/feature-flow/skills/merge-prs/SKILL.md && echo "T3 loop text OK"

# Task 4
! grep -q "CI failing, trivial fix" /Users/weee/Dev/feature-flow/skills/merge-prs/SKILL.md && echo "T4 trivial row gone OK"
! grep -q "CI failing, unfixable" /Users/weee/Dev/feature-flow/skills/merge-prs/SKILL.md && echo "T4 unfixable row gone OK"

# Task 5
grep -q "ci_remediation" /Users/weee/Dev/feature-flow/.feature-flow.yml && echo "T5 ci_remediation OK"
grep -q "max_attempts: 3" /Users/weee/Dev/feature-flow/.feature-flow.yml && echo "T5 max_attempts OK"
grep -q "max_wall_clock_minutes: 10" /Users/weee/Dev/feature-flow/.feature-flow.yml && echo "T5 wall_clock OK"
grep -q "ci_poll_interval_seconds: 30" /Users/weee/Dev/feature-flow/.feature-flow.yml && echo "T5 poll_interval OK"
```

Expected: all lines print `OK`. Any `MISSING` or silent line = failed criterion, fix before declaring done.
