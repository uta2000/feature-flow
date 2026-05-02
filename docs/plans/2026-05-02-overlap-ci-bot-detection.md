# Overlap CI Polling with Bot-Review History Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Phase 2's bot-history detection call in parallel with Phase 1's first CI poll, so the step doesn't wait for CI to finish before learning whether bot-review polling is needed.

**Architecture:** The file `skills/start/references/inline-steps.md` is markdown documentation that the runtime orchestrator reads verbatim. There are no executable tests — verification is done by grepping the markdown for required strings. The change adds a parallel-kickoff block at step entry, reframes Phase 2 so it starts concurrent with Phase 1's poll loop, adds an explicit join condition at step exit, replaces the sequential Phase Ordering diagram with a forked one, and updates announce strings.

**Tech Stack:** Markdown only. Verification via `grep` and `diff` against the edited file.

---

## File Map

| File | Change |
|------|--------|
| `skills/start/references/inline-steps.md` | All edits — parallel kickoff prose, Phase 2 framing, join/exit paragraph, Phase Ordering diagram, YOLO/Interactive strings, edge-cases table |

---

### Task 1: Add parallel-kickoff block at step entry

**Files:**
- Modify: `skills/start/references/inline-steps.md:576–578` (the `**Process:**` / `### Phase 1` header area)

The first CI poll and bot-history detection must be launched in the same assistant message turn. A new introductory block just before Phase 1 will make this explicit.

- [ ] **Step 1: Read the current entry point (lines 572–600)**

Read the file from line 572 to line 600 to confirm exact surrounding text before editing.

- [ ] **Step 2: Replace the `**Process:**` line and `### Phase 1` header with a parallel-kickoff block**

Find this text:
```
**Process:**

### Phase 1: Wait for CI checks

1. Get the PR number from the previous step's output.

2. Poll CI check status every 30 seconds:
```

Replace it with:
```
**Process:**

**On step entry — fire both of the following in a single parallel message (two simultaneous tool calls):**

1. Phase 1 first poll: `gh pr checks <pr_number> --json name,status,conclusion`
2. Phase 2 bot-history detection: Check the last 5 merged/closed PRs for bot reviews (full script in Phase 2 Step 2a below)

Use both results together to determine (a) initial CI state and (b) whether bot-review polling is needed. Then proceed to the Phase 1 and Phase 2 loops described below.

### Phase 1: Wait for CI checks

1. Get the PR number from the previous step's output.

2. Poll CI check status every 30 seconds:
```

- [ ] **Step 3: Verify the new block is present**

```bash
grep -n "single parallel message" skills/start/references/inline-steps.md
```

Expected: one matching line containing "single parallel message".

- [ ] **Step 4: Commit**

```bash
git add skills/start/references/inline-steps.md
git commit -m "docs(start): add parallel-kickoff block at step entry"
```

---

### Task 2: Reframe Phase 2 Step 2a as concurrent with Phase 1

**Files:**
- Modify: `skills/start/references/inline-steps.md` — Phase 2 opening and Step 2a intro text

Phase 2's detection currently reads as if it begins after Phase 1 finishes. This task rewrites the framing so it's clear that 2a runs concurrently with Phase 1's CI poll loop, and 2b/2c only begin once Phase 1 is done (or in parallel, for repos with bots, depending on the join condition defined in Task 3).

- [ ] **Step 1: Read Phase 2 opening block (lines 600–620)**

Read the file from line 600 to line 625 to confirm current text before editing.

- [ ] **Step 2: Replace the Phase 2 opening paragraph**

Find this text:
```
### Phase 2: Wait for and address bot review comments

CI and code review are **independent processes**. Review bots (Gemini Code Review, CodeRabbit, etc.) typically post their review 5-10 minutes after the PR is created — well after CI has already passed. This phase detects whether the repo uses review bots and waits for their review to land before proceeding.

**Step 2a: Detect if the repo uses review bots**

Check the last 5 merged/closed PRs for reviews from bot users:
```

Replace it with:
```
### Phase 2: Wait for and address bot review comments

CI and code review are **independent processes**. Review bots (Gemini Code Review, CodeRabbit, etc.) typically post their review 5-10 minutes after the PR is created — well after CI has already passed.

**Step 2a runs concurrently with Phase 1's CI poll loop** (it is fired on step entry alongside the first CI poll — see the parallel-kickoff block above). Steps 2b and 2c run concurrently with any remaining CI polling: once bot history is confirmed, begin polling for bot review on the current PR without waiting for Phase 1 to complete. Both loops run independently and the step exits only when both have terminated (see Step Exit / Join Condition below).

**Step 2a: Detect if the repo uses review bots**

Check the last 5 merged/closed PRs for reviews from bot users:
```

- [ ] **Step 3: Verify the concurrent-framing sentence is present**

```bash
grep -n "Step 2a runs concurrently with Phase 1" skills/start/references/inline-steps.md
```

Expected: one matching line.

- [ ] **Step 4: Verify the join-condition forward reference is present**

```bash
grep -n "Step Exit / Join Condition" skills/start/references/inline-steps.md
```

Expected: at least one matching line (the forward reference added in this task, plus the section heading added in Task 3).

- [ ] **Step 5: Commit**

```bash
git add skills/start/references/inline-steps.md
git commit -m "docs(start): reframe Phase 2 step 2a as concurrent with Phase 1 CI poll"
```

---

### Task 3: Add Step Exit / Join Condition section

**Files:**
- Modify: `skills/start/references/inline-steps.md` — insert new section between Phase 2 step 2c.9 and the Phase 3 header

Without an explicit join condition, the orchestrator has no instruction for when the overall step ends. This task inserts a named section that states: the step exits when both Phase 1 and Phase 2 have terminated.

- [ ] **Step 1: Read the transition between Phase 2 and Phase 3 (lines 692–700)**

Read the file from line 692 to line 710 to confirm exact surrounding text.

- [ ] **Step 2: Insert the join-condition section before `### Phase 3`**

Find this text (the line immediately before Phase 3):
```
### Phase 3: Handle CI failures
```

Replace it with:
```
### Step Exit / Join Condition

The step exits when **both** loops have reached a terminal state:

- **Phase 1 terminal:** all CI checks are `completed` (success or failure handled), or Phase 1 timed out after 15 minutes.
- **Phase 2 terminal:** bot-history detection found no bots (skip), or bot review was received and addressed, or Phase 2 timed out after 15 minutes, or Phase 2 was not entered (no bot history).

Both loops complete independently. Do not exit the step while either loop is still running. If Phase 1 finishes first, wait for Phase 2 to reach its terminal state before outputting the final status line. If Phase 2 finishes first (e.g., no bot history → immediate skip), wait for Phase 1. In practice, for repos with no bot history, Phase 2 short-circuits immediately and the step exits as soon as Phase 1 completes — identical to today's behavior.

**Interleaving with CI failures and fix pushes:** If Phase 3 triggers (CI failure → fix push → re-wait for CI), Phase 2 continues running undisturbed alongside the new CI wait. After Phase 3's fix push, do NOT re-enter Phase 2 — per step 2c.8 above, the fix commit does not trigger a new round of bot reviews. Phase 2 terminates at its own pace (bot review received, timeout, or already skipped). The join condition above still applies: both loops must reach terminal state before the step exits.

### Phase 3: Handle CI failures
```

- [ ] **Step 3: Verify the section heading is present**

```bash
grep -n "Step Exit / Join Condition" skills/start/references/inline-steps.md
```

Expected: at least 2 matching lines (forward reference from Task 2 + this new heading).

- [ ] **Step 4: Verify the join-condition semantics are stated**

```bash
grep -n "Both loops complete independently" skills/start/references/inline-steps.md
```

Expected: one matching line.

- [ ] **Step 5: Verify the no-bot short-circuit note is present**

```bash
grep -n "no bot history.*short-circuits immediately" skills/start/references/inline-steps.md
```

Expected: one matching line.

- [ ] **Step 6: Commit**

```bash
git add skills/start/references/inline-steps.md
git commit -m "docs(start): add Step Exit / Join Condition section for parallel loop termination"
```

---

### Task 4: Update Phase Ordering section — text and diagram

**Files:**
- Modify: `skills/start/references/inline-steps.md` — Phase Ordering section (current lines 707–717)

The current Phase Ordering text says "run sequentially" and the diagram shows a linear chain. Both must reflect the new parallel structure: a fork at step entry, two concurrent loops, and a join before exit.

- [ ] **Step 1: Read the Phase Ordering section (lines 707–720)**

Read the file from line 707 to line 725 to confirm exact current text.

- [ ] **Step 2: Replace the entire Phase Ordering section**

Find this text:
```
### Phase Ordering

Phase 1 (CI) and Phase 2 (bot review) run sequentially but are logically independent:

```
Phase 1: Wait for CI → handle failures if any → CI green
Phase 2: Detect bot history → wait for bot review → address inline comments → push fix → reply to threads
Phase 1 (again): Re-wait for CI after fix push (if fixes were made)
```

If Phase 1 times out or has no checks, Phase 2 still runs (the bot review is independent of CI). If Phase 2 detects no bot history, it skips immediately.
```

Replace it with:
```
### Phase Ordering

Phase 1 (CI) and Phase 2 (bot review) run in parallel. Bot-history detection (Phase 2 Step 2a) fires on step entry alongside Phase 1's first CI poll. If bot history is found, the Phase 2 polling loop runs concurrently with the remainder of Phase 1's polling loop. The step exits only when both loops have terminated (see Step Exit / Join Condition above).

```
Step entry: fire Phase 1 first CI poll AND Phase 2a bot-history detection in parallel
Phase 1 (CI loop):    poll every 30s → CI green or 15-min timeout → handle failures if any
Phase 2 (bot loop):
    no bots detected → skip (terminal)
    bots detected → poll every 30s → bot review received → address comments → push fix
                    or 15-min timeout
After CI fix push: re-wait for CI (Phase 1 only); do NOT re-enter Phase 2
Step exits when BOTH loops reach terminal state (join: both loops terminal)
```

If Phase 1 times out or has no checks, Phase 2 still runs (the bot review is independent of CI). If Phase 2 detects no bot history, it skips immediately and the step exits as soon as Phase 1 finishes.
```

- [ ] **Step 3: Verify "run in parallel" replaces "run sequentially"**

```bash
grep -n "run sequentially" skills/start/references/inline-steps.md
```

Expected: zero results (the old sequential phrasing is gone).

- [ ] **Step 4: Verify the new parallel description is present**

```bash
grep -n "run in parallel" skills/start/references/inline-steps.md
```

Expected: one matching line in the Phase Ordering section.

- [ ] **Step 5: Verify the fork-join diagram landmark is present**

```bash
grep -n "join: both loops terminal" skills/start/references/inline-steps.md
```

Expected: one matching line.

- [ ] **Step 6: Commit**

```bash
git add skills/start/references/inline-steps.md
git commit -m "docs(start): update Phase Ordering text and diagram to show parallel structure"
```

---

### Task 5: Update YOLO/Interactive announce strings and edge-cases table

**Files:**
- Modify: `skills/start/references/inline-steps.md` — YOLO behavior block, Interactive behavior line, edge-cases table

The announce strings still imply sequential execution. Two rows in the edge-cases table (the last two) describe CI-before-bot and bot-before-CI as edge cases; they are now normal flow.

- [ ] **Step 1: Read the YOLO/Interactive and edge-cases section (lines 728–748)**

Read the file from line 728 to line 750 to confirm exact current text.

- [ ] **Step 2: Replace the YOLO announce strings**

Find this text:
```
**YOLO behavior:** Auto-wait silently. Announce periodic status every 60 seconds:
`YOLO: start — Waiting for CI checks (N of M complete, K pending: [names])`
`YOLO: start — CI passed. Waiting for review bot ([bot_name] detected on recent PRs)...`
After addressing: `YOLO: start — Review comments → N addressed, K declined`
```

Replace it with:
```
**YOLO behavior:** Auto-wait silently. Announce periodic status every 60 seconds:
`YOLO: start — Waiting for CI checks (N of M complete, K pending: [names]) | bot-history: [detecting… / no bots / bot_name polling…]`
`YOLO: start — CI passed. Bot-review loop still running ([bot_name], elapsed Xs)...`
`YOLO: start — Bot review received. CI loop still running (N of M complete)...`
After both loops terminal: `YOLO: start — CI: [passed/timed out]. Review comments → N addressed, K declined`
```

- [ ] **Step 3: Replace the Interactive/Express behavior line**

Find this text:
```
**Interactive/Express behavior:** Announce wait and show progress. The user can type "skip" to continue without waiting at either phase.
```

Replace it with:
```
**Interactive/Express behavior:** Announce that both loops are starting in parallel and show progress for each. The user can type "skip" to continue without waiting — this terminates both loops immediately.
```

- [ ] **Step 4: Replace the last two rows of the edge-cases table**

Find this text:
```
| CI passes before bot review arrives | Normal — Phase 2 waits independently for the bot review |
| Bot review arrives before CI passes | Phase 2 will find it when it runs after Phase 1 |
```

Replace it with:
```
| CI passes before bot review arrives | Normal — both loops run concurrently; step waits for Phase 2 to finish |
| Bot review arrives before CI passes | Normal — both loops run concurrently; step waits for Phase 1 to finish |
```

- [ ] **Step 5: Verify the updated YOLO string contains the bot-history inline status**

```bash
grep -n "bot-history" skills/start/references/inline-steps.md
```

Expected: at least one matching line in the YOLO block.

- [ ] **Step 6: Verify the old "Phase 2 will find it when it runs after Phase 1" text is gone**

```bash
grep -n "Phase 2 will find it when it runs after Phase 1" skills/start/references/inline-steps.md
```

Expected: zero results.

- [ ] **Step 7: Commit**

```bash
git add skills/start/references/inline-steps.md
git commit -m "docs(start): update YOLO/Interactive strings and edge-cases table for parallel structure"
```

---

### Task 6: Verify all acceptance criteria

**Files:**
- Read-only: `skills/start/references/inline-steps.md`

This task runs all machine-verifiable acceptance criteria from issue #252 as grep checks and documents the one manual criterion.

- [ ] **AC 1 — First step turn issues both calls in a single parallel message**

```bash
grep -n "single parallel message" skills/start/references/inline-steps.md
```

Expected: one matching line.

- [ ] **AC 2 — Phase 2 bot-history detection no longer waits for Phase 1 completion**

```bash
grep -n "Step 2a runs concurrently with Phase 1" skills/start/references/inline-steps.md
```

Expected: one matching line.

- [ ] **AC 3 — Bot review polling runs concurrent with CI polling**

```bash
grep -n "run concurrently with any remaining CI polling" skills/start/references/inline-steps.md
```

Expected: one matching line.

- [ ] **AC 4 — Step exit waits for both loops to terminate**

```bash
grep -n "Both loops complete independently" skills/start/references/inline-steps.md
```

Expected: one matching line.

- [ ] **AC 5 — No bot history → step behaves identically to today (Phase 1 only)**

```bash
grep -n "short-circuits immediately and the step exits as soon as Phase 1 completes" skills/start/references/inline-steps.md
```

Expected: one matching line (from the Step Exit / Join Condition section).

- [ ] **AC 6 — Bot history but bot never posts → Phase 2 respects its 15-minute timeout**

```bash
grep -n "Phase 2 timed out after 15 minutes" skills/start/references/inline-steps.md
```

Expected: one matching line (in the Step Exit / Join Condition section added by Task 3).

- [ ] **AC 7 — 2-fix-cycle limit preserved**

```bash
grep -n "Maximum 2 total fix-and-recheck cycles" skills/start/references/inline-steps.md
```

Expected: one matching line (unchanged from original Loop Termination section).

- [ ] **AC 8 — "Do NOT re-wait for a second round of bot reviews" preserved**

```bash
grep -n "Do NOT re-wait for a second round of bot reviews" skills/start/references/inline-steps.md
```

Expected: one matching line (unchanged from Phase 2 step 2c.8).

- [ ] **AC 9 (MANUAL / DEFERRED) — Smoke test: total step time ≤7 min on a PR where CI finishes at 5 min and bot review posts at 6 min**

This criterion requires running the actual lifecycle on a live PR and timing the step. It cannot be verified by reading the markdown. Mark this as **not auto-verifiable** in any verify-acceptance-criteria report. When this issue's PR is reviewed, note in the PR body: "Smoke test (AC 9) is manual — must be validated by running the lifecycle on a real PR after merge."

- [ ] **Final commit (if any last-minute fixes needed after AC checks)**

If any AC grep above returned unexpected results, fix the relevant task's edits and re-run that task's verification step before committing. Otherwise no commit needed here.
