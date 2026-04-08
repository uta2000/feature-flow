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

Use these exact templates. Replace `<MODE>` with `YOLO`, `Express`, or `Interactive`. Replace placeholders in `<angle brackets>`.

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
