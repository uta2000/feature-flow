# Harden PR + Handoff Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task.

**Goal:** Refactor the feature-flow `start` lifecycle so its terminal phase hardens the PR and hands off a mergeable PR to the user instead of auto-closing the issue and auto-merging. Relocate shared remediation references to top-level `references/` so `start` and `merge-prs` become independent entry points over one knowledge base.

**Architecture:** Pure markdown + YAML schema-doc refactor of plugin internals. Eight largely-independent tasks, each modifying a single file (except Task 1 which moves four files as a logical unit). Each task verifies via `grep`/file-existence checks that map 1:1 to acceptance criteria from issue #228.

**Tech Stack:** Markdown skill definitions, YAML schema documentation. No production code. Verification is `grep` / `ls` / `test -f`.

**Design doc:** `docs/plans/2026-04-08-harden-pr-and-handoff-refactor.md`
**Issue:** #228

---

## Task Dependency Graph

```
Task 1 (move files) ──┬── Task 2 (merge-prs/SKILL.md — path refs depend on moves existing)
                      │
                      └── Tasks 3, 4, 5, 6, 7, 8 — parallelizable with each other (no shared files)
```

All edit tasks (2–8) can run in parallel waves after Task 1. Task 1 must complete first to avoid stale paths in verification grep checks.

---

## Task 1: Move 4 shared remediation references to top-level `references/`

**Quality Constraints:**
- Error handling: N/A (file moves use `git mv` which is atomic)
- Types: N/A (markdown)
- Function length: N/A
- Pattern: Match existing top-level `references/` file layout (see `references/coding-standards.md`, `references/platforms/`, `references/stacks/` as siblings)

**Parallelizable:** no (blocks Task 2)
**Files modified:** `skills/merge-prs/references/best-effort-remediation.md`, `ci-remediation.md`, `conflict-resolution.md`, `review-triage.md`, plus moved destinations under `references/`

**Step 1: Move the 4 files**

```bash
git mv skills/merge-prs/references/best-effort-remediation.md references/best-effort-remediation.md
git mv skills/merge-prs/references/ci-remediation.md references/ci-remediation.md
git mv skills/merge-prs/references/conflict-resolution.md references/conflict-resolution.md
git mv skills/merge-prs/references/review-triage.md references/review-triage.md
```

**Step 2: Verify the moves**

```bash
test -f references/best-effort-remediation.md && \
test -f references/ci-remediation.md && \
test -f references/conflict-resolution.md && \
test -f references/review-triage.md && echo OK
test ! -f skills/merge-prs/references/best-effort-remediation.md && \
test ! -f skills/merge-prs/references/ci-remediation.md && \
test ! -f skills/merge-prs/references/conflict-resolution.md && \
test ! -f skills/merge-prs/references/review-triage.md && echo OK
```
Expected: two `OK` lines.

**Step 3: Update internal sibling cross-refs in the moved files**

In `references/best-effort-remediation.md` lines 12-14, replace:
```
`references/ci-remediation.md`   →  `ci-remediation.md`
`references/conflict-resolution.md` → `conflict-resolution.md`
`references/review-triage.md`    →  `review-triage.md`
```

In `references/ci-remediation.md`, replace all occurrences of:
```
`references/best-effort-remediation.md` → `best-effort-remediation.md`
```
(7 occurrences: lines 5, 126, 128-132.)

In `references/review-triage.md`, replace all occurrences of:
```
`references/best-effort-remediation.md` → `best-effort-remediation.md`
```
(8 occurrences: lines 5, 209, 267, 269-273.)

`references/conflict-resolution.md` has no internal sibling refs — no edit.

**Step 4: Verify internal cross-refs are bare-sibling style**

```bash
grep -n "references/best-effort-remediation.md\|references/ci-remediation.md\|references/conflict-resolution.md\|references/review-triage.md" references/best-effort-remediation.md references/ci-remediation.md references/conflict-resolution.md references/review-triage.md
```
Expected: **no output** (all cross-refs now bare filename).

**Step 5: Commit**

```bash
git add references/ skills/merge-prs/references/
git commit -m "refactor: move shared remediation refs to top-level references/ (#228)

Moves best-effort-remediation.md, ci-remediation.md, conflict-resolution.md,
and review-triage.md from skills/merge-prs/references/ to references/ so
that both start and merge-prs consume the same knowledge base without
cross-skill path coupling."
```

**Acceptance Criteria:**
- [ ] `test -f references/best-effort-remediation.md` exits 0
- [ ] `test -f references/ci-remediation.md` exits 0
- [ ] `test -f references/conflict-resolution.md` exits 0
- [ ] `test -f references/review-triage.md` exits 0
- [ ] `test ! -f skills/merge-prs/references/best-effort-remediation.md` exits 0
- [ ] `test ! -f skills/merge-prs/references/ci-remediation.md` exits 0
- [ ] `test ! -f skills/merge-prs/references/conflict-resolution.md` exits 0
- [ ] `test ! -f skills/merge-prs/references/review-triage.md` exits 0
- [ ] `grep -c "references/best-effort-remediation.md\|references/ci-remediation.md\|references/review-triage.md" references/best-effort-remediation.md references/ci-remediation.md references/review-triage.md` returns 0 hits total

---

## Task 2: Update `skills/merge-prs/SKILL.md` — remove Lifecycle Mode, update path refs

**Quality Constraints:**
- Error handling: N/A (markdown edits)
- Types: N/A
- Function length: Ensure Standalone Mode remains self-contained after Lifecycle Mode removal — sub-sections previously shared with Lifecycle Mode must be inlined or referenced correctly
- Pattern: Match the Mode Detection table format at the top of the file

**Parallelizable:** no (depends on Task 1)
**Files modified:** `skills/merge-prs/SKILL.md`

**Step 1: Update frontmatter description**

Remove "(lifecycle mode)" phrasing. Change from:
```yaml
description: Merges feature-flow PRs in batch. Invoked as the "Ship" phase from the start lifecycle (lifecycle mode), directly with PR numbers or patterns (standalone mode), or as "merge-prs feature-flow" to merge all labeled PRs (cross-session mode).
```
to:
```yaml
description: Merges feature-flow PRs in batch. Invoked directly with PR numbers or patterns (standalone mode), or as "merge-prs feature-flow" to merge all labeled PRs (cross-session mode).
```

**Step 2: Update Mode Detection table — remove Lifecycle row**

Current table has a `| Empty / absent | **Lifecycle** | Invoked from start orchestrator |` row. Remove that row. The table now has only Standalone and Cross-session rows.

**Step 3: Remove §"Lifecycle Mode" section entirely**

Delete the entire block from `## Lifecycle Mode` (line ~29) through the end of §"Step 6: Changelog Consolidation" (line ~181), up to and including the trailing `---` separator before §"Standalone Mode".

The post-merge `gh issue close` block (current lines 104-106) is within this section and gets removed with it. In the Standalone Mode section (which will become the new lead section after removal), verify no `gh issue close` survives.

**Step 4: Update path refs to moved files**

In the remaining content (Standalone Mode, Cross-Session Mode, any shared sub-sections), replace:
```
`references/best-effort-remediation.md` → `../../references/best-effort-remediation.md`
`references/ci-remediation.md`          → `../../references/ci-remediation.md`
`references/conflict-resolution.md`     → `../../references/conflict-resolution.md`
`references/review-triage.md`           → `../../references/review-triage.md`
```
Leave `references/dependency-analysis.md` **unchanged** — it stays at `skills/merge-prs/references/dependency-analysis.md` and is correctly addressed as the bare `references/...` path.

**Step 5: Add a short comment where the post-merge closure block used to live** (optional, for git-blame clarity)

If Standalone Mode has its own post-merge section, add near it:
```markdown
<!-- Issue closure happens via `Closes #N` in PR bodies (GitHub native auto-close).
     The lifecycle no longer closes issues here — see issue #228. -->
```

**Step 6: Verify**

```bash
# Lifecycle Mode section gone
grep -c "^## Lifecycle Mode" skills/merge-prs/SKILL.md
# Expected: 0

# Mode Detection table row gone
grep -c "| Empty / absent | \*\*Lifecycle\*\*" skills/merge-prs/SKILL.md
# Expected: 0

# gh issue close is no longer present
grep -c "gh issue close" skills/merge-prs/SKILL.md
# Expected: 0

# Path refs use ../../references/
grep -c "\`references/best-effort-remediation.md\`\|\`references/ci-remediation.md\`\|\`references/conflict-resolution.md\`\|\`references/review-triage.md\`" skills/merge-prs/SKILL.md
# Expected: 0 (all now prefixed with ../../)

grep -c "\`\.\./\.\./references/best-effort-remediation.md\`\|\`\.\./\.\./references/ci-remediation.md\`\|\`\.\./\.\./references/conflict-resolution.md\`\|\`\.\./\.\./references/review-triage.md\`" skills/merge-prs/SKILL.md
# Expected: at least 1

# Frontmatter no longer mentions lifecycle mode
grep -c "lifecycle mode\|Ship.*phase from the start lifecycle" skills/merge-prs/SKILL.md
# Expected: 0 (case-insensitive check via separate grep -i if needed)
```

**Step 7: Commit**

```bash
git add skills/merge-prs/SKILL.md
git commit -m "refactor(merge-prs): remove Lifecycle Mode; update path refs for moved shared files (#228)

Lifecycle no longer invokes merge-prs. Standalone and Cross-Session modes
remain. Post-merge gh issue close is removed — closure now happens via
Closes #N in PR bodies."
```

**Acceptance Criteria:**
- [ ] `grep -c "^## Lifecycle Mode" skills/merge-prs/SKILL.md` returns 0
- [ ] `grep -c "gh issue close" skills/merge-prs/SKILL.md` returns 0
- [ ] `grep -c "lifecycle mode" skills/merge-prs/SKILL.md` (case-insensitive) returns 0 in the frontmatter/description area
- [ ] Mode Detection table no longer has a Lifecycle row (`grep -c "Empty / absent" skills/merge-prs/SKILL.md` returns 0)
- [ ] `grep -c "\`references/best-effort-remediation.md\`\|\`references/ci-remediation.md\`\|\`references/conflict-resolution.md\`\|\`references/review-triage.md\`" skills/merge-prs/SKILL.md` returns 0
- [ ] At least one reference using `../../references/` is present for each moved file

---

## Task 3: Update `skills/start/references/inline-steps.md` — rename + add Harden PR + Handoff

**Quality Constraints:**
- Error handling: The new Harden PR step must specify behavior for all documented edge cases (budget exhausted, already merged, no remediation needed, wall-clock mid-attempt)
- Types: Mode behavior table uses fixed strings (YOLO | Express | Interactive) — no free-text
- Function length: Each new section (Harden PR Step, Handoff Step) is self-contained; subagent prompts reuse the existing Post Implementation Comment pattern (parallel structure)
- Pattern: Match the structure of existing inline step sections (§"Self-Review Step", §"Code Review Pipeline Step", §"Comment and Close Issue Step"): heading → location description → Process numbered steps → Mode behavior table → Edge cases

**Parallelizable:** yes (parallel with Tasks 4, 5, 6, 7, 8)
**Files modified:** `skills/start/references/inline-steps.md`

**Step 1: Rename section heading**

Change line 713:
```
## Comment and Close Issue Step
```
to:
```
## Post Implementation Comment Step
```

**Step 2: Update step location description (line 715)**

Change from:
```
This step runs after "Wait for CI and address reviews" (or after mobile-specific steps like app store review) and before the completion summary.
```
to:
```
This step runs after the Harden PR step (for Feature and Major Feature scopes) or after "Wait for CI and address reviews" (for smaller scopes, or after app store review for mobile platforms), and before the Handoff step (or before the lifecycle completion summary for non-feature scopes).
```

**Step 3: Drop `gh issue close` from subagent prompt at line 766**

Change:
```
Run: gh issue comment [N] --body-file /tmp/ff_issue_comment.md then gh issue close [N] (write the comment body to /tmp/ff_issue_comment.md first to avoid shell quoting issues with apostrophes and special characters).
```
to:
```
Run: gh issue comment [N] --body-file /tmp/ff_issue_comment.md (write the comment body to /tmp/ff_issue_comment.md first to avoid shell quoting issues with apostrophes and special characters).
```

Update the subagent `description:` on line 745 from `"Post issue comment and close issue #[N]"` to `"Post implementation comment on issue #[N]"`.

**Step 4: Add closing line to comment body template**

After the `### Key files changed` block (after line 764), append a closing italicized line to the comment body template:
```
*This issue will close automatically when PR #[PR number from context] is merged (via `Closes #[N]` in the PR body).*
```

**Step 5: Update announce text (lines 770-772)**

Change success announce from:
```
`"Issue #[N] commented and closed."`
```
to:
```
`"Issue #[N] commented (will auto-close on PR merge)."`
```

Failure announce stays the same.

**Step 6: Add new §"Harden PR Step" section**

Insert after the Post Implementation Comment section, before §"Blocker Logging":

```markdown
## Harden PR Step

This step runs after "Wait for CI and address reviews" and before the "Post Implementation Comment" step. Feature and Major Feature scopes only — smaller scopes skip this step entirely.

Harden PR applies a bounded best-effort remediation loop to drive the PR from its current state (possibly red CI, conflicts, or unresolved reviews) to a mergeable state. Unlike "Wait for CI and address reviews" (which waits for initial CI + bot reviews to land), Harden PR actively attempts to fix remaining problems.

**Process:**

1. **Read shared references** (in this order):
   - `../../references/best-effort-remediation.md` — bounded-attempt loop skeleton and mode escalation contract
   - `../../references/ci-remediation.md` — category-specific CI fix strategies
   - `../../references/conflict-resolution.md` — graduated conflict resolution ladder
   - `../../references/review-triage.md` — review comment triage and remediation

2. **Read bounds from `.feature-flow.yml`:**
   - `lifecycle.harden_pr.enabled` (default: `true`) — if `false`, skip this step
   - `lifecycle.harden_pr.max_attempts` (default: `3`)
   - `lifecycle.harden_pr.max_wall_clock_minutes` (default: `10`)
   - `lifecycle.harden_pr.pause_on_unresolvable_conflict` (default: `true`)

3. **Get current PR state:**
   ```bash
   gh pr view <pr_number> --json state,mergeable,statusCheckRollup,reviews,reviewDecision
   ```

4. **Fast path: already mergeable?** If `mergeable: MERGEABLE` AND `reviewDecision != CHANGES_REQUESTED` AND all checks green, skip the loop. Announce: `Harden PR: PR #N already mergeable — no remediation needed.`

5. **Apply bounded remediation loop:**
   - **CI red?** Apply `../../references/ci-remediation.md` strategies. After each fix commit, push and re-poll CI.
   - **Mergeable: CONFLICTING?** Apply `../../references/conflict-resolution.md` graduated ladder. Tier 3 always pauses — even in YOLO — when `pause_on_unresolvable_conflict: true`.
   - **Unresolved human reviews?** Apply `../../references/review-triage.md` to classify and remediate. Blockers without an automated fix always pause.
   - **All clean?** Exit loop.

6. **Final mergeable check:**
   ```bash
   gh pr view <pr_number> --json mergeable,reviewDecision,statusCheckRollup
   ```
   - `mergeable: MERGEABLE` AND `reviewDecision != CHANGES_REQUESTED` AND CI green → record status `READY`
   - Otherwise → record status `BLOCKED` and the outstanding blockers

7. **Output structured summary:**
   ```
   Harden PR: PR #N status — [READY | BLOCKED]
     CI: [green | red — N failing checks: name1, name2]
     Conflicts: [none | unresolved in: file1, file2]
     Reviews: [approved | N unresolved: blockers=K, suggestions=L]
     Remediation log: [N attempts, M fixes applied across X categories]
   ```

**Mode behavior:**

| Mode | Behavior |
|------|----------|
| YOLO | All remediation automatic. Pause only when conflict-resolution.md or review-triage.md mandate it (Tier 3 conflicts, unresolvable blockers). Announce each attempt: `YOLO: harden-pr — Attempt N/3 → [action]` |
| Express | First remediation attempt confirmed via `AskUserQuestion`; subsequent attempts automatic. Announce: `Express: harden-pr — Attempt N/3 → [action]` |
| Interactive | Confirm each remediation attempt with proposed diff via `AskUserQuestion` before applying |

**Edge cases:**

- **Budget exhausted, PR still blocked:** Record what's still blocking. Proceed to "Post Implementation Comment" + "Handoff" — the user sees blockers in the handoff announcement and decides whether to fix manually or invoke `/merge-prs` later. Do NOT loop indefinitely.
- **PR already merged (user merged manually mid-lifecycle):** Announce, skip Harden PR, skip Post Implementation Comment (the comment is not useful post-merge), proceed to Handoff with a "PR was merged externally" note.
- **No remediation needed (PR already green/mergeable):** Skip all loop attempts per step 4 fast path.
- **Wall-clock budget exceeded mid-attempt:** Complete the in-progress fix (don't leave a half-applied state), then exit with `BLOCKED` status.

---
```

**Step 7: Add new §"Handoff Step" section**

Insert after the new Harden PR Step section, still before §"Blocker Logging":

```markdown
## Handoff Step

This step is the terminal step for Feature and Major Feature scopes. It replaces the previous Ship step and the current Step 5 completion output for these scopes. Smaller scopes (Quick fix, Small enhancement) use the existing Step 5 completion summary — they do not reach this step.

**Process:**

1. **Read PR state one more time** (final snapshot):
   ```bash
   gh pr view <pr_number> --json number,url,state,mergeable,reviewDecision,statusCheckRollup
   ```

2. **Count sibling feature-flow PRs** (informational only, not a gate):
   ```bash
   gh pr list --label feature-flow --base <base_branch> --state open --json number --jq 'length'
   ```
   Subtract 1 to get "other open feature-flow PRs."

3. **Count changelog fragments:**
   ```bash
   ls .changelogs/*.md 2>/dev/null | wc -l
   ```

4. **Build handoff announcement:**

   ```
   Lifecycle complete — PR is ready for merge.

   PR: #<number> — <url>
     Status: [MERGEABLE | BLOCKED — see harden-pr output above]
     CI: [green | red]
     Reviews: [approved | N unresolved]
     Issue: #<N> will close automatically on merge (via `Closes #N`)
     [or "Issue: none linked" if issue is null]

   Other open feature-flow PRs: [M]
   Changelog fragments pending: [K]

   Next steps:
     1. Merge PR #<number> directly in GitHub  →  closes issue #<N>
     2. Or run `/merge-prs <number>`  →  feature-flow merges, closes issue, consolidates changelog
     3. Or run `/merge-prs feature-flow`  →  batch-merge all [M+1] feature-flow PRs

   Worktree: [Removed | Still active at .worktrees/<name>]
   [If still active: "Run `cd <repo-root> && git worktree remove .worktrees/<name>` from the parent repo (NOT from inside the worktree)."]
   ```

5. **Mode behavior:**

| Mode | Behavior |
|------|----------|
| YOLO | If `lifecycle.handoff.auto_invoke_merge_prs: true` is set in config, automatically invoke `Skill(skill: "feature-flow:merge-prs", args: "yolo: true. <pr_number>")` after the announcement. Otherwise stop after announcing. **Default: do NOT auto-invoke** (preserves the "merging is a deliberate action" principle even in YOLO). Users who want full unattended end-to-end can opt in. Announce: `YOLO: handoff — PR ready, [auto-invoking merge-prs / stopping per config]` |
| Express | Stop after announcing. Suggest `/merge-prs` as next action. |
| Interactive | Stop after announcing. Suggest `/merge-prs` as next action. |

6. **Notification:** Fire `notifications.on_stop` from `.feature-flow.yml` if set.

7. **Mark final todo complete** via `TaskUpdate` (Turn Bridge Rule).

**Note on changelog consolidation:** Fragments in `.changelogs/` remain until the user runs `/merge-prs` — consolidation runs as part of merge-prs's terminal step. This matches the principle that handoff ends the lifecycle and lets the user choose when to ship.

---
```

**Step 8: Verify**

```bash
# Section renamed
grep -c "^## Post Implementation Comment Step" skills/start/references/inline-steps.md
# Expected: 1
grep -c "^## Comment and Close Issue Step" skills/start/references/inline-steps.md
# Expected: 0

# gh issue close removed from the step
grep -c "gh issue close" skills/start/references/inline-steps.md
# Expected: 0

# Closing line added to comment body template
grep -c "will close automatically when PR" skills/start/references/inline-steps.md
# Expected: 1

# New Harden PR section exists
grep -c "^## Harden PR Step" skills/start/references/inline-steps.md
# Expected: 1

# New Handoff section exists
grep -c "^## Handoff Step" skills/start/references/inline-steps.md
# Expected: 1

# Harden PR references use ../../references/
grep -c "\.\./\.\./references/best-effort-remediation.md\|\.\./\.\./references/ci-remediation.md\|\.\./\.\./references/conflict-resolution.md\|\.\./\.\./references/review-triage.md" skills/start/references/inline-steps.md
# Expected: at least 4

# Post Implementation Comment success announce updated
grep -c "will auto-close on PR merge" skills/start/references/inline-steps.md
# Expected: at least 1
```

**Step 9: Commit**

```bash
git add skills/start/references/inline-steps.md
git commit -m "refactor(start): rename Comment and Close → Post Implementation Comment; add Harden PR + Handoff steps (#228)

- Drop gh issue close from Post Implementation Comment subagent prompt
- Add auto-close line to comment body template
- Add new Harden PR inline step (bounded remediation loop)
- Add new Handoff inline step (terminal; announces mergeable PR, stops)"
```

**Acceptance Criteria:**
- [ ] `grep -c "^## Post Implementation Comment Step" skills/start/references/inline-steps.md` returns 1
- [ ] `grep -c "^## Comment and Close Issue Step" skills/start/references/inline-steps.md` returns 0
- [ ] `grep -c "gh issue close" skills/start/references/inline-steps.md` returns 0
- [ ] `grep -c "will close automatically when PR" skills/start/references/inline-steps.md` returns at least 1
- [ ] `grep -c "^## Harden PR Step" skills/start/references/inline-steps.md` returns 1
- [ ] `grep -c "^## Handoff Step" skills/start/references/inline-steps.md` returns 1
- [ ] `grep -c "\.\./\.\./references/best-effort-remediation.md" skills/start/references/inline-steps.md` returns at least 1
- [ ] `grep -c "\.\./\.\./references/ci-remediation.md" skills/start/references/inline-steps.md` returns at least 1
- [ ] `grep -c "\.\./\.\./references/conflict-resolution.md" skills/start/references/inline-steps.md` returns at least 1
- [ ] `grep -c "\.\./\.\./references/review-triage.md" skills/start/references/inline-steps.md` returns at least 1
- [ ] `grep -c "will auto-close on PR merge" skills/start/references/inline-steps.md` returns at least 1

---

## Task 4: Update `skills/start/SKILL.md` — Skill Mapping, Ship Step, Step 5, stop_after

**Quality Constraints:**
- Error handling: Preserve existing `yolo.stop_after` checkpoint semantics — the new `harden_pr` and `handoff` values must integrate with the checkpoint execution loop without code changes (documentation-only)
- Types: The `stop_after` enum is documented with fixed string values (must match the schema doc's enum table exactly)
- Function length: The Skill Mapping table stays as a single table — do not split
- Pattern: Match the existing Skill Mapping table column layout (Step | Skill to Invoke | Expected Output)

**Parallelizable:** yes (parallel with Tasks 3, 5, 6, 7, 8)
**Files modified:** `skills/start/SKILL.md`

**Step 1: Update Skill Mapping table**

Find the row for "Comment and close issue" and rename it to "Post implementation comment". Update the Expected Output column to reflect that the step no longer closes the issue.

Find the row for "Ship (merge related PRs)" and **replace it with two new rows**:

| Step | Skill to Invoke | Expected Output |
|------|----------------|-----------------|
| Harden PR | No skill — inline step (see below) | PR hardened for merge (READY or BLOCKED) via bounded remediation loop |
| Handoff | No skill — inline step (see below) | Lifecycle terminal announcement; PR ready for user to merge |

**Step 2: Replace §"Ship Step" with pointers to new sections**

Find the `### Ship Step (lifecycle — feature and major feature scopes only)` heading at ~line 697 and **replace the entire section** (through the end of the section, before the next `###`) with:

```markdown
### Harden PR Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Harden PR Step" section** when reaching this step. Feature and Major Feature scopes only. Runs after "Wait for CI and address reviews" and before "Post Implementation Comment".

### Handoff Step (lifecycle — feature and major feature scopes only)

**Read `references/inline-steps.md` — "Handoff Step" section** when reaching this step. Feature and Major Feature scopes only. Terminal step — replaces the Ship phase for these scopes. Announces a ready-to-merge PR and stops.
```

Also update the preceding `### Comment and Close Issue Step` heading (line 693) to `### Post Implementation Comment Step` and update its reference line from:
```
**Read `references/inline-steps.md` — "Comment and Close Issue Step" section**
```
to:
```
**Read `references/inline-steps.md` — "Post Implementation Comment Step" section**
```

**Step 3: Update `yolo.stop_after` checkpoint table**

Find the table near line 636 that lists `stop_after` values (`brainstorming`, `design`, `verification`, `plan`, `implementation`, `pr`, `ship`). Replace the `ship` row with two new rows:

| `stop_after` value | Lifecycle step | Fires after/before |
|---------------------|---------------|-------------|
| `harden_pr` | Harden PR Step | After the remediation loop exits (between steps N+1 and N+2) |
| `handoff` | Handoff Step | Before the final handoff announcement is built |

Add a note after the table:
> **Deprecation:** `ship` is accepted as a deprecated alias for `handoff` for one release. A warning is printed when it is encountered; remove it in favor of `handoff` before the next release.

**Step 4: Rewrite the Ship Step `yolo.stop_after` check**

The Ship Step section had a `yolo.stop_after` check block at lines 708-711. Since the Ship Step section was replaced in Step 2, that check must be relocated into the new Harden PR / Handoff pointers (or explicitly called out in `references/inline-steps.md` — already covered).

Verify that the new Harden PR + Handoff pointer sections reference the stop_after checkpoints. If needed, add a brief note in `skills/start/SKILL.md`:
> The `yolo.stop_after` values `harden_pr` and `handoff` fire at the respective steps per the checkpoint table above.

**Step 5: Update Step 5 Completion summary**

Find the "Completion" subsection under Step 5 (near line 751). Update the summary block to reflect the new terminal state for Feature and Major Feature scopes. The summary for these scopes should:
- Use "Lifecycle complete — PR is ready for merge." as the lead line
- Note that the issue will auto-close on PR merge (remove any "issue closed" assertion)
- Include the sibling-PR count and next-step suggestions
- Include worktree cleanup instructions

For smaller scopes (quick fix, small enhancement), the existing completion summary remains valid — with one change: "commented and closed" → "commented (will auto-close on PR merge)" where it appears.

**Step 6: Verify**

```bash
# Skill Mapping updates
grep -c "| Post implementation comment | No skill" skills/start/SKILL.md
# Expected: 1
grep -c "| Harden PR | No skill" skills/start/SKILL.md
# Expected: 1
grep -c "| Handoff | No skill" skills/start/SKILL.md
# Expected: 1
grep -c "| Comment and close issue |" skills/start/SKILL.md
# Expected: 0
grep -c "| Ship (merge related PRs) |" skills/start/SKILL.md
# Expected: 0

# Ship Step section removed
grep -c "^### Ship Step" skills/start/SKILL.md
# Expected: 0

# New pointer sections exist
grep -c "^### Harden PR Step" skills/start/SKILL.md
# Expected: 1
grep -c "^### Handoff Step" skills/start/SKILL.md
# Expected: 1

# Post Implementation Comment pointer updated
grep -c "^### Post Implementation Comment Step" skills/start/SKILL.md
# Expected: 1
grep -c "^### Comment and Close Issue Step" skills/start/SKILL.md
# Expected: 0

# stop_after table has harden_pr and handoff
grep -c "\`harden_pr\` | Harden PR Step" skills/start/SKILL.md
# Expected: 1
grep -c "\`handoff\` | Handoff Step" skills/start/SKILL.md
# Expected: 1
grep -c "| \`ship\` |" skills/start/SKILL.md
# Expected: 0 (or 1 only if it's in a deprecation note)

# No lingering "merge-prs" invocation in lifecycle
grep -c "feature-flow:merge-prs" skills/start/SKILL.md
# Expected: 0 (or only in comments explaining historical context)
```

**Step 7: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "refactor(start): replace Ship Step with Harden PR + Handoff pointers (#228)

- Update Skill Mapping table: rename Comment and Close → Post Implementation Comment;
  replace Ship row with Harden PR and Handoff rows
- Replace Ship Step section with Harden PR and Handoff pointers
- Update yolo.stop_after table: drop ship; add harden_pr and handoff;
  deprecation note for one release
- Update Step 5 Completion summary for handoff terminal state"
```

**Acceptance Criteria:**
- [ ] `grep -c "| Post implementation comment | No skill" skills/start/SKILL.md` returns 1
- [ ] `grep -c "| Harden PR | No skill" skills/start/SKILL.md` returns 1
- [ ] `grep -c "| Handoff | No skill" skills/start/SKILL.md` returns 1
- [ ] `grep -c "| Comment and close issue |" skills/start/SKILL.md` returns 0
- [ ] `grep -c "| Ship (merge related PRs) |" skills/start/SKILL.md` returns 0
- [ ] `grep -c "^### Ship Step" skills/start/SKILL.md` returns 0
- [ ] `grep -c "^### Harden PR Step" skills/start/SKILL.md` returns 1
- [ ] `grep -c "^### Handoff Step" skills/start/SKILL.md` returns 1
- [ ] `grep -c "\`harden_pr\`" skills/start/SKILL.md` returns at least 1
- [ ] `grep -c "\`handoff\`" skills/start/SKILL.md` returns at least 1
- [ ] `grep -c "feature-flow:merge-prs" skills/start/SKILL.md` returns 0 (lifecycle no longer invokes merge-prs)

---

## Task 5: Update `skills/start/references/yolo-overrides.md` — Related: #N → Closes #N

**Quality Constraints:**
- Error handling: N/A (single-line edit)
- Types: N/A
- Function length: Edit is a single paragraph replacement
- Pattern: Keep the numbered list format of the existing step; the replacement must be a drop-in for line 161

**Parallelizable:** yes (parallel with Tasks 3, 4, 6, 7, 8)
**Files modified:** `skills/start/references/yolo-overrides.md`

**Step 1: Replace line 161**

Change:
```markdown
4. **Issue reference in PR body:** When a GitHub issue is linked to the lifecycle, use `Related: #N` instead of `Closes #N` in the PR body — the lifecycle closes the issue explicitly in the "Comment and Close Issue" step with a detailed comment.
```
to:
```markdown
4. **Issue reference in PR body:** When a GitHub issue is linked to the lifecycle, use `Closes #N` in the PR body so merging the PR closes the linked issue via GitHub's native auto-close. The lifecycle posts an implementation comment in the "Post Implementation Comment" step but does not close the issue itself — closure happens on merge.
```

**Step 2: Verify**

```bash
grep -c "Related: #" skills/start/references/yolo-overrides.md
# Expected: 0
grep -c "Closes #N" skills/start/references/yolo-overrides.md
# Expected: at least 1
grep -c "Post Implementation Comment" skills/start/references/yolo-overrides.md
# Expected: at least 1
```

Also verify across the whole start skill that `Related: #` is gone:
```bash
grep -rc "Related: #" skills/start/
# Expected: all lines 0
```

**Step 3: Commit**

```bash
git add skills/start/references/yolo-overrides.md
git commit -m "refactor(start): use Closes #N instead of Related: #N in PR body (#228)

The lifecycle no longer closes issues explicitly. PR body uses Closes #N
so GitHub auto-close runs on merge. The Post Implementation Comment step
posts a comment but does not close the issue."
```

**Acceptance Criteria:**
- [ ] `grep -c "Related: #" skills/start/references/yolo-overrides.md` returns 0
- [ ] `grep -c "Closes #N" skills/start/references/yolo-overrides.md` returns at least 1
- [ ] `grep -rc "Related: #" skills/start/` reports 0 hits total across all files

---

## Task 6: Update `skills/start/references/step-lists.md` — rename + replace Ship

**Quality Constraints:**
- Error handling: N/A (markdown rename + insertion)
- Types: Step list entries use consistent `- [ ] N. Name` format
- Function length: Insert two new steps in Feature (21→22 steps) and Major feature (22→23 steps) lists
- Pattern: Step numbering stays monotonic; "Handoff" is always the terminal step for Feature/Major Feature lists

**Parallelizable:** yes (parallel with Tasks 3, 4, 5, 7, 8)
**Files modified:** `skills/start/references/step-lists.md`

**Step 1: Rename "Comment and close issue" in all 5 step lists**

In the Quick fix list (line 24), Small enhancement standard list (line 51), Small enhancement fast-track list (line 71), Feature list (line 96), and Major feature list (line 123), replace every occurrence of:
```
- [ ] N. Comment and close issue
```
with:
```
- [ ] N. Post implementation comment
```
Keep the step number unchanged.

**Step 2: Replace "Ship (merge related PRs)" in Feature and Major feature lists**

In the Feature list (line 97), replace:
```
- [ ] 21. Ship (merge related PRs)
```
with two new steps:
```
- [ ] 21. Harden PR
- [ ] 22. Handoff
```
The Feature list now has 22 steps instead of 21.

In the Major feature list (line 124), replace:
```
- [ ] 22. Ship (merge related PRs)
```
with two new steps:
```
- [ ] 22. Harden PR
- [ ] 23. Handoff
```
The Major feature list now has 23 steps instead of 22.

**Step 3: Update mobile adjustments prose (lines 135, 137)**

Change line 135 from:
```
- **After app store review (or after commit and PR if not mobile):** Insert **comment and close issue** step (post implementation summary comment, close issue). Only runs when an issue is linked.
```
to:
```
- **After app store review (or after commit and PR if not mobile):** Insert **post implementation comment** step (posts implementation summary comment; does not close the issue — closure happens via `Closes #N` on PR merge). Only runs when an issue is linked.
- **After post implementation comment (Feature and Major Feature scopes only):** Insert **Harden PR** and **Handoff** steps.
```

Change line 137 from:
```
Announce the platform-specific additions: "Mobile platform detected. Adding: device matrix testing, beta testing, app store review, and comment and close issue steps."
```
to:
```
Announce the platform-specific additions: "Mobile platform detected. Adding: device matrix testing, beta testing, app store review, post implementation comment, and (for Feature/Major Feature scopes) Harden PR + Handoff steps."
```

**Step 4: Update the step count references in `skills/start/SKILL.md`**

This is a small cross-file adjustment. In `skills/start/SKILL.md`, the Step 2 "Build the Step List" section and the Step 1 scope prompt reference the step counts. Search for "22 steps" and "21 steps":

```bash
grep -n "21 steps\|22 steps\|23 steps" skills/start/SKILL.md
```

Update the references to match the new counts (Feature: 22, Major Feature: 23).

Actually this is handled in Task 4. This note is only to cross-reference that the counts stay consistent.

**Step 5: Verify**

```bash
# All 5 step lists have the renamed step
grep -c "Post implementation comment" skills/start/references/step-lists.md
# Expected: at least 5 (one per list) — plus mobile prose

grep -c "Comment and close issue" skills/start/references/step-lists.md
# Expected: 0

# Ship step is gone
grep -c "Ship (merge related PRs)" skills/start/references/step-lists.md
# Expected: 0

# Harden PR and Handoff added to Feature and Major feature lists
grep -c "] Harden PR" skills/start/references/step-lists.md
# Expected: at least 2 (Feature + Major feature)
grep -c "] Handoff" skills/start/references/step-lists.md
# Expected: at least 2
```

**Step 6: Commit**

```bash
git add skills/start/references/step-lists.md
git commit -m "refactor(start): rename Comment and close issue; replace Ship with Harden PR + Handoff (#228)

- Quick fix, Small enhancement (standard + fast-track), Feature, Major feature:
  rename \"Comment and close issue\" → \"Post implementation comment\"
- Feature and Major feature: replace \"Ship (merge related PRs)\" with
  \"Harden PR\" + \"Handoff\"
- Mobile platform adjustments updated for both renames"
```

**Acceptance Criteria:**
- [ ] `grep -c "Comment and close issue" skills/start/references/step-lists.md` returns 0
- [ ] `grep -c "Ship (merge related PRs)" skills/start/references/step-lists.md` returns 0
- [ ] `grep -c "Post implementation comment" skills/start/references/step-lists.md` returns at least 5
- [ ] `grep -c "] Harden PR" skills/start/references/step-lists.md` returns at least 2
- [ ] `grep -c "] Handoff" skills/start/references/step-lists.md` returns at least 2
- [ ] Feature step list contains `- [ ] 22. Handoff`
- [ ] Major feature step list contains `- [ ] 23. Handoff`

---

## Task 7: Update `references/project-context-schema.md` — lifecycle.harden_pr, lifecycle.handoff, yolo.stop_after enum

**Quality Constraints:**
- Error handling: Document field behavior when absent ("when absent" notes required on every new field)
- Types: Boolean/integer fields explicitly typed in the table; default values specified
- Function length: New `### lifecycle` section stays under 150 lines; references sub-fields via tables like existing sections
- Pattern: Match the structure of existing field sections (e.g., `### notifications`, `### quality_gates`): brief intro → sub-fields table → Format code block → "When absent" note

**Parallelizable:** yes (parallel with Tasks 3, 4, 5, 6, 8)
**Files modified:** `references/project-context-schema.md`

**Step 1: Add `lifecycle` section to the schema example**

Near the end of the YAML schema example (before `plugin_registry`), add:

```yaml
lifecycle:              # Optional: lifecycle terminal phase configuration (Harden PR + Handoff)
  harden_pr:
    enabled: true                     # Run Harden PR step (default: true)
    max_attempts: 3                   # Max remediation attempts (default: 3)
    max_wall_clock_minutes: 10        # Wall-clock budget (default: 10)
    pause_on_unresolvable_conflict: true  # Tier 3 conflicts always pause, even in YOLO (default: true)
  handoff:
    auto_invoke_merge_prs: false      # YOLO-only: auto-invoke /merge-prs after handoff (default: false; restores legacy auto-merge behavior)
```

**Step 2: Add a `### lifecycle` field section after the existing `### yolo` section**

Add a new section with:

```markdown
### `lifecycle`

Optional configuration for the lifecycle terminal phase (Harden PR + Handoff). Applies only to Feature and Major Feature scopes. Smaller scopes (Quick fix, Small enhancement) do not run these steps.

#### `lifecycle.harden_pr`

Controls the Harden PR step, which applies a bounded best-effort remediation loop to drive the PR from its current state to a mergeable state.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | When `false`, skip the Harden PR step entirely |
| `max_attempts` | integer | `3` | Maximum remediation attempts (shared budget across CI, conflict, review fixes) |
| `max_wall_clock_minutes` | integer | `10` | Wall-clock budget for the full loop |
| `pause_on_unresolvable_conflict` | boolean | `true` | Tier 3 conflicts always pause, even in YOLO mode, when this is true |

**Format:**

```yaml
lifecycle:
  harden_pr:
    enabled: true
    max_attempts: 3
    max_wall_clock_minutes: 10
    pause_on_unresolvable_conflict: true
```

**When absent:** All four fields use their defaults silently.

#### `lifecycle.handoff`

Controls the Handoff step, which is the terminal step for Feature and Major Feature scopes.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `auto_invoke_merge_prs` | boolean | `false` | YOLO-only. When `true`, automatically invoke `/merge-prs <pr_number>` after the handoff announcement. Restores legacy auto-merge behavior — bypasses the "merging is a deliberate action" principle. |

**Format:**

```yaml
lifecycle:
  handoff:
    auto_invoke_merge_prs: false
```

**When absent:** Defaults to `false`. The handoff step announces the ready-to-merge PR and stops; the user chooses when to merge.

**Trade-off:** Set `auto_invoke_merge_prs: true` only when you want YOLO to run fully end-to-end without human intervention — for example, in automated release pipelines or scheduled lifecycle runs. For interactive development, keep the default.
```

**Step 3: Update the `yolo.stop_after` enum**

In the existing `### yolo` section table, replace the `ship` row with two new rows:

| Value | Pauses after… |
|-------|---------------|
| `harden_pr` | After the Harden PR remediation loop exits — review the PR state and blockers |
| `handoff` | Before the final Handoff announcement — last chance to redirect |

Add a note after the table:
> **Deprecation:** `ship` is accepted as a deprecated alias for `handoff` for one release. A warning is printed when it is encountered in `.feature-flow.yml`. Users should migrate to `handoff`. This alias will be removed in a future release.

**Step 4: Verify**

```bash
# harden_pr and handoff documented
grep -c "lifecycle.harden_pr\|\`lifecycle\`" references/project-context-schema.md
# Expected: at least 1
grep -c "auto_invoke_merge_prs" references/project-context-schema.md
# Expected: at least 2 (schema + field table + description)

# New stop_after values
grep -c "\`harden_pr\`" references/project-context-schema.md
# Expected: at least 1
grep -c "\`handoff\`" references/project-context-schema.md
# Expected: at least 1

# Deprecation note
grep -c "deprecated alias" references/project-context-schema.md
# Expected: at least 1
```

**Step 5: Commit**

```bash
git add references/project-context-schema.md
git commit -m "docs(schema): add lifecycle.harden_pr and lifecycle.handoff; deprecate stop_after: ship (#228)

- Document lifecycle.harden_pr (enabled, max_attempts, max_wall_clock_minutes,
  pause_on_unresolvable_conflict)
- Document lifecycle.handoff.auto_invoke_merge_prs (default false)
- yolo.stop_after enum: drop ship, add harden_pr and handoff;
  ship remains as deprecated alias for one release"
```

**Acceptance Criteria:**
- [ ] `grep -c "harden_pr" references/project-context-schema.md` returns at least 2
- [ ] `grep -c "auto_invoke_merge_prs" references/project-context-schema.md` returns at least 2
- [ ] `grep -c "pause_on_unresolvable_conflict" references/project-context-schema.md` returns at least 1
- [ ] `grep -c "deprecated alias" references/project-context-schema.md` returns at least 1
- [ ] `grep -c "### \`lifecycle\`" references/project-context-schema.md` returns 1

---

## Task 8: Add CHANGELOG fragment

**Quality Constraints:**
- Error handling: N/A (file creation)
- Types: Frontmatter uses YAML (pr, date, scope fields)
- Function length: Fragment stays under 30 lines
- Pattern: Match the frontmatter and category structure of existing fragments under `.changelogs/` if any exist; otherwise follow the Keep a Changelog format (`### Changed`, `### Added`, `### Maintenance`)

**Parallelizable:** yes (parallel with Tasks 3, 4, 5, 6, 7)
**Files modified:** `.changelogs/228.md` (new file)

**Step 1: Create the fragment**

Write to `.changelogs/228.md`:

```markdown
---
pr: 228
date: 2026-04-08
scope: major-feature
---

### Changed
- Lifecycle no longer auto-closes linked issues or auto-merges PRs. Terminal phase is now `Harden PR` (bounded remediation loop) + `Handoff` (announces a ready-to-merge PR and stops). Issue closure happens via `Closes #N` in the PR body when the user merges. (#228)
- `feature-flow:start` and `feature-flow:merge-prs` are now independent entry points sharing one remediation knowledge base under top-level `references/`. `start` no longer invokes `merge-prs`.
- `merge-prs` no longer has a `Lifecycle Mode`. Standalone and Cross-Session modes remain; the post-merge `gh issue close` safety net is removed.
- `skills/start/references/yolo-overrides.md` PR body template uses `Closes #N` instead of `Related: #N`.

### Added
- `.feature-flow.yml` schema: `lifecycle.harden_pr` (enabled, max_attempts, max_wall_clock_minutes, pause_on_unresolvable_conflict).
- `.feature-flow.yml` schema: `lifecycle.handoff.auto_invoke_merge_prs` (default `false`; set `true` in YOLO to restore legacy end-to-end auto-merge).
- `yolo.stop_after` enum: new values `harden_pr` and `handoff`.

### Maintenance
- Moved `best-effort-remediation.md`, `ci-remediation.md`, `conflict-resolution.md`, and `review-triage.md` from `skills/merge-prs/references/` to top-level `references/`. Both `start` and `merge-prs` now consume the same files without cross-skill coupling. (`skills/merge-prs/references/dependency-analysis.md` is merge-prs-specific and stays in place.)
- `yolo.stop_after: ship` is deprecated as an alias for `handoff`; it will be removed in a future release.
```

**Step 2: Verify**

```bash
test -f .changelogs/228.md && echo OK
grep -c "Harden PR" .changelogs/228.md
# Expected: at least 1
grep -c "Handoff" .changelogs/228.md
# Expected: at least 1
grep -c "auto-close\|auto_invoke_merge_prs" .changelogs/228.md
# Expected: at least 2
```

**Step 3: Commit**

```bash
git add .changelogs/228.md
git commit -m "docs(changelog): add fragment for #228 Harden PR + Handoff refactor"
```

**Acceptance Criteria:**
- [ ] `.changelogs/228.md` exists
- [ ] `grep -c "Harden PR" .changelogs/228.md` returns at least 1
- [ ] `grep -c "Handoff" .changelogs/228.md` returns at least 1
- [ ] `grep -c "Closes #N" .changelogs/228.md` returns at least 1 (documents the closure semantics shift)

---

## Global verification (runs after all tasks)

After all 8 tasks are complete, run these cross-cutting checks which map directly to the issue #228 acceptance criteria:

```bash
# Issue #228 AC: zero gh issue close in active start/merge-prs definitions
grep -rn "gh issue close" skills/start/ skills/merge-prs/
# Expected: 0 hits

# Issue #228 AC: zero Related: # in skills/start/
grep -rn "Related: #" skills/start/
# Expected: 0 hits

# Issue #228 AC: Closes #N present in yolo-overrides.md
grep -c "Closes #N" skills/start/references/yolo-overrides.md
# Expected: at least 1

# All 4 ref files moved
for f in best-effort-remediation.md ci-remediation.md conflict-resolution.md review-triage.md; do
  test -f references/$f || echo MISSING: references/$f
  test ! -f skills/merge-prs/references/$f || echo STALE: skills/merge-prs/references/$f
done
# Expected: no output

# Mergeable state: all verification grep checks from Tasks 1-8 pass
```

**Quality Constraints:**
- **Parallelizable:** Task 1 is sequential (blocks Task 2); Tasks 2-8 after Task 1 are parallelizable in a single wave.
- **Files modified:** Each task lists its files; no two tasks modify the same file except Task 1 + Task 2 (Task 2 edits `skills/merge-prs/SKILL.md` which Task 1 does not touch — so no actual overlap).
