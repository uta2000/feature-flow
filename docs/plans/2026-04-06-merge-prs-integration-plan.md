# Merge-PRs Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate the `merge-prs` skill into the feature-flow lifecycle as an optional "Ship" phase for Feature and Major feature scopes, with auto-discovery via GitHub labels, design-doc-aware conflict resolution, and YOLO/Express/Interactive mode support.

**Architecture:** A new `skills/merge-prs/SKILL.md` orchestrator handles three invocation modes (lifecycle, standalone, cross-session). The `start` skill's step lists gain a final Ship step, and the "Commit and PR" inline step is augmented with post-creation logic to apply the `feature-flow` label and body markers. All merge config lives in an optional `.feature-flow.yml` `merge:` section.

**Tech Stack:** Markdown skill files, YAML config, GitHub CLI (`gh`), Bash commands — no compiled code.

---

## Parallelization Note

Tasks 1 and 2 can run in parallel (both create new files with no dependencies).
Tasks 3, 4, 5, 6, and 7 each modify existing files independently and can also run in parallel.
All tasks must complete before the final verification task (Task 8).

---

### Task 1: Create `skills/merge-prs/SKILL.md`

**Files:**
- Create: `skills/merge-prs/SKILL.md`

**What this is:** A Claude Code skill file (Markdown with YAML frontmatter). There is no test runner — correctness is verified by reading the file and checking its contents against the acceptance criteria below. The "tests" here are manual spot-checks via `grep` / `Read`.

**Context to read first:**
- `skills/start/SKILL.md` lines 591–619 — Skill Mapping table (to understand the skill invocation pattern this new skill will be added to)
- `skills/design-verification/SKILL.md` lines 1–30 — for frontmatter format reference
- Design doc `docs/plans/2026-04-06-merge-prs-integration.md` §Gap 1 (Invocation), §Gap 2 (Auto-discovery), §Gap 4 (YOLO/Express/Interactive), §Gap 5 (Post-merge), §Gap 6 (Error recovery), §Gap 8 (Scope mapping)

**Step 1: Create the directory**

```bash
mkdir -p skills/merge-prs/references
```

Expected output: no output (success).

**Step 2: Write `skills/merge-prs/SKILL.md`**

Write the file at `skills/merge-prs/SKILL.md` with this exact content:

```markdown
---
name: merge-prs
description: Merges feature-flow PRs in batch. Invoked as the "Ship" phase from the start lifecycle (lifecycle mode), directly with PR numbers or patterns (standalone mode), or as "merge-prs feature-flow" to merge all labeled PRs (cross-session mode).
tools: Read, Glob, Grep, Bash, AskUserQuestion, Task
---

# Merge-PRs — Ship Phase Orchestrator

Discover, order, and merge feature-flow PRs. Supports three invocation modes determined by `$ARGUMENTS`.

**Announce at start:** "Starting Ship phase — discovering feature-flow PRs..."

---

## Mode Detection

Inspect `$ARGUMENTS`:

| Pattern | Mode | Example |
|---------|------|---------|
| Contains PR numbers (e.g. `185 186`) | **Standalone** | `merge-prs 185 186` |
| Contains `all open` | **Standalone** | `merge-prs all open` |
| Contains `epic N` | **Standalone** | `merge-prs epic 175` |
| Equals `feature-flow` | **Cross-session** | `merge-prs feature-flow` |
| Empty / absent | **Lifecycle** | Invoked from start orchestrator |

---

## Lifecycle Mode

Invoked after "Comment and close issue" completes. Session context (base branch, current PR number, design doc path) is passed via `args`.

### Step 1: Discover open feature-flow PRs

```bash
gh pr list \
  --label feature-flow \
  --base <base_branch> \
  --state open \
  --json number,title,headRefName,baseRefName,mergeable,statusCheckRollup
```

- If zero PRs found: announce "Ship: no feature-flow PRs found — lifecycle complete." and exit.
- If PRs found: continue to Step 2.

**YOLO behavior:** `YOLO: ship — [N] PRs discovered`
**Express behavior:** `Express: ship — [N] PRs discovered`

### Step 2: Present Ship phase options

**Interactive/Express — use `AskUserQuestion`:**
- Option 1: "Merge this PR only" — merge just the current session's PR (number from `pr` context key)
- Option 2: "Batch merge all ([N] PRs)" — merge all discovered PRs in optimal order
- Option 3: "Skip — end lifecycle without merging"

**YOLO behavior:** Auto-select based on CI state:
- All PRs have green CI (`statusCheckRollup` all passing): auto-select "Batch merge all"
- Otherwise: auto-select "Merge this PR only"
- Announce: `YOLO: ship — [N] PRs discovered → [choice] ([reason])`

### Step 3: Determine merge order

Sort the discovered PRs to minimize conflicts:

1. PRs with no pending CI checks first (fastest path)
2. PRs with fewest changed files second (lowest conflict surface)
3. PRs targeting `main` / `master` before PRs targeting feature branches
4. Within ties: ascending PR number (oldest first)

**Express/YOLO:** Announce: `Express: ship — Merge order: #[N1] → #[N2] → ... Proceeding...`
**Interactive:** Present order, wait for confirmation via `AskUserQuestion` before proceeding.

### Step 4: Sequential merge execution

For each PR in merge order:

**4a. Pre-merge checks (parallel `gh` calls):**
```bash
# Check current state
gh pr view <number> --json state,mergeable,statusCheckRollup,reviews
```

- If `state: "MERGED"`: announce "PR #N already merged — skipping." Continue.
- If `mergeable: "CONFLICTING"`: attempt conflict resolution (see §Conflict Resolution).
- If CI failing: investigate once — read CI logs via `gh run view`. If trivial fix (lint/type error), apply and push. If unfixable, skip with reason.
- If `reviews` has any `CHANGES_REQUESTED` state: flag to user, skip PR. Announce reason.

**4b. Merge:**
```bash
gh pr merge <number> --squash --delete-branch
```

Merge strategy from `.feature-flow.yml` `merge.strategy` (default: `squash`).
Delete branch from `merge.delete_branch` (default: `true`).

**4c. Post-merge actions:**
```bash
# Comment on merged PR
gh pr comment <number> --body "Merged via feature-flow Ship phase (batch merge, order: N/M)"

# Check and close linked issue if not already closed
gh issue view <issue_number> --json state --jq '.state'
# If "OPEN": gh issue close <issue_number>
```

**4d. Opportunistic Vercel deploy check (non-blocking):**
Check `.feature-flow.yml` `plugin_registry` for any key containing `vercel`:
```bash
# Only if vercel plugin detected:
gh api repos/{owner}/{repo}/deployments --jq '.[0].statuses_url' 2>/dev/null || true
```
Log result but do not block on it.

**4e. Rate limiting:**
For batches of 10+ PRs: add a 1-second delay between merge operations (`sleep 1`).

### Step 5: Ship Phase Summary

After all PRs are processed:

```
Ship Phase Summary:
  Merged: #185, #186 (2/3)
  Skipped: #190 — behavioral conflict in src/api/handler.ts, could not auto-resolve

  Action needed: Resolve conflict in #190 manually, then run `merge-prs 190`
```

Fire the notification from `notifications.on_stop` in `.feature-flow.yml` if set.

---

## Standalone Mode

Accepts explicit PR targets:

| Argument pattern | Behavior |
|-----------------|----------|
| `185 186` | Merge PRs #185 and #186 in the given order |
| `all open` | Query all open PRs on current base branch; merge in optimal order |
| `epic 175` | Query PRs linked to issue #175 via body/title; merge in optimal order |

For `all open`:
```bash
gh pr list --base <current_branch> --state open --json number,title,headRefName,mergeable,statusCheckRollup
```

For `epic N`:
```bash
gh pr list --state open --json number,title,body --jq "[.[] | select(.body | test(\"#N\"))]"
```

Then execute Step 4 (sequential merge) and Step 5 (summary) from Lifecycle Mode above.

---

## Cross-Session Mode

Argument: `feature-flow`

Discover all PRs labeled `feature-flow`:
```bash
gh pr list --label feature-flow --state open --json number,title,headRefName,baseRefName,mergeable,statusCheckRollup
```

Then execute Step 3 (merge order), Step 4 (sequential merge), and Step 5 (summary) from Lifecycle Mode above.

---

## Conflict Resolution

**Read `references/conflict-resolution.md`** when a PR reports `mergeable: "CONFLICTING"`.

Summary of resolution strategy:

1. Create a temporary worktree for conflict resolution:
   ```bash
   git worktree add /tmp/merge-prs-conflict-<number> <headRefName>
   ```
2. Merge base branch into the worktree:
   ```bash
   cd /tmp/merge-prs-conflict-<number> && git merge origin/<base_branch>
   ```
3. Classify each conflict per `references/conflict-resolution.md` rules.
4. For trivial conflicts: auto-resolve and announce.
5. For behavioral conflicts: **always pause** regardless of mode. Present conflict diff and ask for direction.
6. After resolution: `git add . && git commit && git push`
7. **Cleanup:** Always remove the worktree, even on error:
   ```bash
   ORIG_DIR=$(pwd)
   # ... conflict resolution work ...
   cd "$ORIG_DIR"
   git worktree remove /tmp/merge-prs-conflict-<number> --force 2>/dev/null || true
   ```

**CWD Safety Guard:** Before removing any worktree, capture `ORIG_DIR=$(pwd)` and `cd "$ORIG_DIR"` after worktree operations. Never `cd` into a path that is about to be deleted.

---

## Error Recovery

Strategy: continue-on-failure. Every skip is reported with a reason.

| Error | Action |
|-------|--------|
| PR already merged | Detect via `gh pr view`. Announce "PR #N already merged — skipping." Continue. |
| Merge conflict, auto-resolvable | Auto-resolve (trivial), announce, continue |
| Merge conflict, behavioral | Pause for confirmation. If unresolved, skip with reason |
| CI failing, trivial fix | Apply fix, push, retry merge once |
| CI failing, unfixable | Skip with reason |
| Unresolved review requests | Skip with reason |
| GitHub API error | Retry once after 5 seconds. If still failing, skip with reason |

---

## Config

Read from `.feature-flow.yml` `merge:` section. All fields optional with defaults:

| Field | Default | Description |
|-------|---------|-------------|
| `strategy` | `squash` | `squash` \| `merge` \| `rebase` |
| `delete_branch` | `true` | Delete branch after merge |
| `require_ci` | `true` | Require CI green before merge |
| `require_review` | `true` | Require approved review before merge |
| `auto_discover` | `label` | `label` \| `body_marker` \| `both` |
```

**Step 3: Verify file was created**

Run:
```bash
ls -la skills/merge-prs/SKILL.md
```
Expected: file exists with non-zero size.

**Step 4: Spot-check key sections are present**

Run:
```bash
grep -c "Mode Detection\|Lifecycle Mode\|Standalone Mode\|Cross-Session Mode\|Conflict Resolution\|Error Recovery\|Config" skills/merge-prs/SKILL.md
```
Expected: output `7` (all 7 section headings present).

**Step 5: Commit**

```bash
git add skills/merge-prs/SKILL.md
git commit -m "feat: add skills/merge-prs/SKILL.md — Ship phase orchestrator (#214)"
```

**Acceptance Criteria:**
- [ ] `skills/merge-prs/SKILL.md` exists
- [ ] File has YAML frontmatter with `name: merge-prs`, `description:`, `tools:` fields
- [ ] File contains section heading `## Mode Detection`
- [ ] File contains section heading `## Lifecycle Mode`
- [ ] File contains section heading `## Standalone Mode`
- [ ] File contains section heading `## Cross-Session Mode`
- [ ] File contains section heading `## Conflict Resolution`
- [ ] File contains section heading `## Error Recovery`
- [ ] File contains section heading `## Config`
- [ ] File references `references/conflict-resolution.md`
- [ ] File contains the `YOLO: ship —` announce pattern
- [ ] File contains the CWD Safety Guard pattern (`ORIG_DIR=$(pwd)`)
- [ ] File contains the `gh pr list --label feature-flow` discovery query
- [ ] File contains the `feature-flow` label creation mention or reference

---

### Task 2: Create `skills/merge-prs/references/conflict-resolution.md`

**Files:**
- Create: `skills/merge-prs/references/conflict-resolution.md`

**Can run in parallel with Task 1.**

**Context to read first:**
- Design doc `docs/plans/2026-04-06-merge-prs-integration.md` §Gap 7 (Behavioral vs trivial conflict classification)

**Step 1: Verify directory exists (from Task 1)**

```bash
test -d skills/merge-prs/references && echo "exists" || echo "not found"
```

If "not found": `mkdir -p skills/merge-prs/references`

**Step 2: Write `skills/merge-prs/references/conflict-resolution.md`**

Write the file at `skills/merge-prs/references/conflict-resolution.md`:

```markdown
# Conflict Resolution Rules

Reference file for the `merge-prs` skill. Read this file when a PR reports `mergeable: "CONFLICTING"`.

---

## Classification: Trivial vs Behavioral

Parse the conflict markers in the diff. Classify the conflict based on the content of the conflicting region.

### Trivial Conflicts (auto-resolvable)

Auto-resolve without user confirmation. Announce each resolution.

| Type | Detection | Resolution |
|------|-----------|------------|
| Import statement ordering | Conflicting region contains only `import`/`require` lines | Merge both import sets, sort alphabetically, deduplicate |
| Whitespace-only | Diff shows only trailing spaces, blank lines, or indentation | Accept one side (prefer incoming); re-run formatter if available |
| Lock files | Conflicting file is `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml` | Delete the lock file, run `npm install` / `yarn install` / `pnpm install` to regenerate |
| Auto-generated files | Filename contains `.generated.` or `.snap` (Jest snapshots) | Accept incoming (regenerate from source if needed) |
| Adjacent additive lines | Both sides add new lines without overlapping (gap between conflict markers is empty on one side) | Take both sides — prepend one block, append the other |
| CHANGELOG.md | Conflicting file is `CHANGELOG.md` | Take both entries; re-sort by date (newest first) |

**Announce format (YOLO/Express):**
`YOLO: ship — Trivial conflict in PR #N ([type]) → auto-resolved`

### Behavioral Conflicts (require confirmation)

**Never auto-resolve.** Always pause and present to the user, regardless of mode (YOLO, Express, or Interactive).

| Type | Detection heuristic |
|------|---------------------|
| Function body change | Conflicting region is inside a function/method body |
| Control flow change | Conflicting region contains `if`, `else`, `for`, `while`, `return`, `throw`, `switch`, `case` |
| API contract change | Conflicting region is a route definition, request/response schema, or middleware chain |
| Database schema change | Conflicting file is a migration or ORM model definition |
| Test assertion change | Conflicting region contains `expect(`, `assert`, `toBe(`, `toEqual(`, or similar |
| Config value change | Conflicting region changes env var defaults, feature flag values, or numeric thresholds |

**Detection heuristic — behavioral check:**
```
keywords = ["if ", "else", "for ", "while ", "return ", "throw ", "switch", "case ", "expect(", "assert", "toBe(", "toEqual("]
if any keyword appears in the conflict marker region → classify as behavioral
```

**Announce format (all modes):**
`YOLO: ship — Behavioral conflict in PR #N ([file]:[location]) → paused`

Then use `AskUserQuestion`:
- Show the conflict diff (trimmed to 40 lines if longer)
- Option 1: "Accept ours" — keep the current base branch version
- Option 2: "Accept theirs" — take the incoming branch version
- Option 3: "I'll resolve manually" — pause, let user fix, then resume
- Option 4: "Skip this PR" — log failure, continue with remaining PRs

---

## Design Doc Context Loading

When behavioral conflicts require interpretation, load the design doc for context:

**Step 1: Extract from PR body**
```bash
gh pr view <number> --json body --jq '.body' | grep -o 'feature-flow-design-doc: [^-]*' | sed 's/feature-flow-design-doc: //'
```

**Step 2: Fallback — scan docs/plans/**
```bash
# Find files matching branch name or issue number
ls docs/plans/ | grep -i "<branch_name_fragment>"
ls docs/plans/ | grep "<issue_number>"
```

**Step 3: Final fallback**
If no design doc found, proceed with conflict classification rules alone (no additional context).

**Using design doc context:**
- Read the relevant section of the design doc (data model decisions, API contracts, scope boundaries)
- If the design doc specifies which version is authoritative, suggest that option to the user
- If ambiguous, present both options with a brief summary of what each side preserves

---

## Examples

### Example 1: Import ordering (trivial)

```
<<<<<<< HEAD
import { foo } from './foo'
import { bar } from './bar'
=======
import { bar } from './bar'
import { baz } from './baz'
import { foo } from './foo'
>>>>>>> feature/add-baz
```

Classification: **trivial** — only import lines.
Resolution: merge all imports, sort alphabetically → `bar`, `baz`, `foo`.

### Example 2: Function body change (behavioral)

```
<<<<<<< HEAD
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0)
}
=======
function calculateTotal(items) {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0)
  return subtotal * (1 + TAX_RATE)
}
>>>>>>> feature/add-tax
```

Classification: **behavioral** — function body change, `return` keyword, logic difference.
Action: pause, present to user. Do not auto-resolve.

### Example 3: CHANGELOG.md (trivial)

```
<<<<<<< HEAD
## [1.5.0] - 2026-04-06
### Added
- Feature A
=======
## [1.5.0] - 2026-04-06
### Added
- Feature B
>>>>>>> feature/feature-b
```

Classification: **trivial** — CHANGELOG entry conflict.
Resolution: keep both `### Added` entries under the same version heading, sorted by feature name.

### Example 4: Lock file (trivial)

Conflicting file: `package-lock.json`

Classification: **trivial** — auto-generated lock file.
Resolution: delete, run `npm install` to regenerate.
```

**Step 3: Verify file was created**

```bash
ls -la skills/merge-prs/references/conflict-resolution.md
```
Expected: file exists.

**Step 4: Spot-check key sections**

```bash
grep -c "Trivial Conflicts\|Behavioral Conflicts\|Design Doc Context\|Examples" skills/merge-prs/references/conflict-resolution.md
```
Expected: output `4`.

**Step 5: Commit**

```bash
git add skills/merge-prs/references/conflict-resolution.md
git commit -m "feat: add conflict-resolution.md — trivial vs behavioral classification rules (#214)"
```

**Acceptance Criteria:**
- [ ] `skills/merge-prs/references/conflict-resolution.md` exists
- [ ] File contains `## Classification: Trivial vs Behavioral` heading
- [ ] File contains a table row for `Import statement ordering`
- [ ] File contains a table row for `Lock files`
- [ ] File contains a table row for `CHANGELOG.md`
- [ ] File contains `### Behavioral Conflicts (require confirmation)` heading
- [ ] File contains the behavioral detection keyword list (`if `, `else`, `return `, etc.)
- [ ] File contains `## Design Doc Context Loading` heading
- [ ] File contains `## Examples` heading with at least 3 example subsections
- [ ] File contains the annotation `Never auto-resolve` near behavioral conflicts
- [ ] File contains the announce format `YOLO: ship — Trivial conflict in PR #N`
- [ ] File contains the announce format `YOLO: ship — Behavioral conflict in PR #N`

---

### Task 3: Add Ship step to `skills/start/references/step-lists.md`

**Files:**
- Modify: `skills/start/references/step-lists.md`

**Can run in parallel with Tasks 1 and 2.**

**Context to read first:**
- `skills/start/references/step-lists.md` (full file — already read, current Feature list ends at step 20, Major feature ends at step 21)
- Design doc §Gap 8 (Scope mapping): Ship phase only for Feature (step 21) and Major feature (step 22)

**Step 1: Read the current file to confirm exact text**

Read `skills/start/references/step-lists.md` lines 76–123 to confirm the current ending lines for Feature and Major feature lists.

Expected current Feature list ending:
```
- [ ] 20. Comment and close issue
```

Expected current Major feature list ending:
```
- [ ] 21. Comment and close issue
```

**Step 2: Add Ship step to Feature list**

Find the exact string:
```
- [ ] 20. Comment and close issue
```
(inside the Feature section, between the ``` fences)

Replace with:
```
- [ ] 20. Comment and close issue
- [ ] 21. Ship (merge related PRs)
```

**Step 3: Add Ship step to Major feature list**

Find the exact string:
```
- [ ] 21. Comment and close issue
```
(inside the Major feature section, between the ``` fences)

Replace with:
```
- [ ] 21. Comment and close issue
- [ ] 22. Ship (merge related PRs)
```

**Step 4: Verify changes**

```bash
grep -n "Ship" skills/start/references/step-lists.md
```
Expected output:
```
97:- [ ] 21. Ship (merge related PRs)
123:- [ ] 22. Ship (merge related PRs)
```
(line numbers approximate — confirm they appear in the Feature and Major feature sections respectively)

Also verify Quick fix and Small enhancement sections are untouched:
```bash
grep -n "Ship" skills/start/references/step-lists.md | wc -l
```
Expected: `2` (only two occurrences — one in Feature, one in Major feature).

**Step 5: Commit**

```bash
git add skills/start/references/step-lists.md
git commit -m "feat: add Ship step to Feature and Major feature step lists (#214)"
```

**Acceptance Criteria:**
- [ ] `skills/start/references/step-lists.md` contains `21. Ship (merge related PRs)` in the Feature section
- [ ] `skills/start/references/step-lists.md` contains `22. Ship (merge related PRs)` in the Major feature section
- [ ] The word `Ship` appears exactly twice in the file (once per affected list)
- [ ] Quick fix step list does NOT contain `Ship`
- [ ] Small enhancement step list (both standard and fast-track) does NOT contain `Ship`
- [ ] Feature list step 20 is still `Comment and close issue`
- [ ] Major feature list step 21 is still `Comment and close issue`

---

### Task 4: Modify `skills/start/SKILL.md` — Skill mapping, `pr` context key, YOLO stop_after, Ship orchestration

**Files:**
- Modify: `skills/start/SKILL.md`

**Can run in parallel with Tasks 1, 2, and 3.**

**Context to read first:**
- `skills/start/SKILL.md` lines 591–660 — Skill Mapping table and YOLO Stop-After Checkpoints
- `skills/start/SKILL.md` lines 558–588 — Lifecycle Context Object table
- Design doc §File Changes §4 (Modify `skills/start/SKILL.md`)

**Step 1: Read the current Skill Mapping table**

Read `skills/start/SKILL.md` around line 591. Identify the last row of the Skill Mapping table — it should be:
```
| Comment and close issue | No skill — inline step (see below) | Issue commented with implementation summary + closed |
```

**Step 2: Add Ship row to Skill Mapping table**

Find the exact string (the last row of the mapping table):
```
| Comment and close issue | No skill — inline step (see below) | Issue commented with implementation summary + closed |
```

Replace with:
```
| Comment and close issue | No skill — inline step (see below) | Issue commented with implementation summary + closed |
| Ship (merge related PRs) | `feature-flow:merge-prs` | All discoverable PRs merged or skipped; Ship Phase Summary printed |
```

**Step 3: Add `pr` to the Lifecycle Context Object table**

Find the Lifecycle Context Object table. It currently ends with:
```
| `worktree` | After worktree setup (the absolute path to the created worktree) |
```

Replace with:
```
| `worktree` | After worktree setup (the absolute path to the created worktree) |
| `pr` | After "Commit and PR" step (the PR number extracted from the `superpowers:finishing-a-development-branch` output) |
```

**Step 4: Add `ship` to the YOLO Stop-After table**

Find the YOLO Stop-After phase mapping table. It currently ends with:
```
| `pr` | Commit and PR | Before `superpowers:finishing-a-development-branch` is invoked |
```

Replace with:
```
| `pr` | Commit and PR | Before `superpowers:finishing-a-development-branch` is invoked |
| `ship` | Ship (merge related PRs) | Before `feature-flow:merge-prs` is invoked |
```

**Step 5: Add Ship orchestration logic**

Find the "Comment and Close Issue Step" section reference in SKILL.md:
```
### Comment and Close Issue Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Comment and Close Issue Step" section** when reaching this step.
```

Replace with:
```
### Comment and Close Issue Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Comment and Close Issue Step" section** when reaching this step.

### Ship Step (lifecycle — feature and major feature scopes only)

After "Comment and close issue" completes, execute the Ship phase if the current scope is Feature or Major feature:

**Step 1: Check for discoverable PRs**
```bash
gh pr list --label feature-flow --base <base_branch> --state open --json number,title,headRefName --jq 'length'
```
- If result is `0`: announce "Ship: no feature-flow PRs found — lifecycle complete." Skip this step.
- If result is `1+`: continue.

**Step 2: YOLO stop_after check**
Before invoking `feature-flow:merge-prs`, check if `ship` is in `yolo.stop_after`:
```
if yolo_mode AND "ship" in config.yolo.stop_after:
    AskUserQuestion: "YOLO checkpoint: Ship phase ready. [N] PRs discovered. Continue?"
    - "Continue YOLO"
    - "Switch to Interactive"
    Announce: "YOLO: checkpoint — ship → paused for review"
```

**Step 3: Invoke merge-prs**
```
Skill(skill: "feature-flow:merge-prs", args: "[mode_flag] base_branch: <base_branch>. pr: <pr_number>. [design_doc: <path> if available]")
```

Where `[mode_flag]` is:
- `yolo: true.` in YOLO mode
- `express: true.` in Express mode
- (nothing) in Interactive mode
```

**Step 6: Verify changes**

```bash
grep -n "feature-flow:merge-prs\|Ship (merge related PRs)\|\"pr\"\|\"ship\"" skills/start/SKILL.md | head -20
```
Expected: at least 4 matches covering the four additions above.

**Step 7: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add Ship step to start skill — skill mapping, pr context key, YOLO stop_after, orchestration (#214)"
```

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` Skill Mapping table contains a row for `Ship (merge related PRs)` mapping to `` `feature-flow:merge-prs` ``
- [ ] Lifecycle Context Object table contains a `pr` row explaining it is set after "Commit and PR"
- [ ] YOLO Stop-After table contains a `ship` row
- [ ] File contains a `### Ship Step` section with the PR discovery `gh pr list` command
- [ ] Ship Step section references the `yolo.stop_after` check for `ship`
- [ ] Ship Step section contains the `Skill(skill: "feature-flow:merge-prs"` invocation with `base_branch` and `pr` context args
- [ ] Ship Step section is placed after the `### Comment and Close Issue Step` section
- [ ] The word `Ship` does NOT appear in the Quick fix or Small enhancement scope context (it is scope-gated in the Ship Step section)

---

### Task 5: Modify "Commit and PR" inline step — label + body markers

**Files:**
- Modify: `skills/start/references/inline-steps.md`

**Can run in parallel with Tasks 1, 2, 3, and 4.**

**Context to read first:**
- `skills/start/references/inline-steps.md` — find the "Commit and PR Step" or "finishing-a-development-branch" section (if present). If no such section exists, this step adds one.
- Design doc §File Changes §5 (Modify "Commit and PR" step behavior)

**Step 1: Read inline-steps.md to find the Commit and PR section**

Read `skills/start/references/inline-steps.md` (full file). Look for any section mentioning "Commit and PR" or "finishing-a-development-branch".

If a section exists: identify where to insert the label/marker logic (between "Confirm completion" and "Mark complete" sub-steps).

If no section exists: add a new section at the end of the file.

**Step 2: Add or extend the "Commit and PR" post-creation section**

If there is already a `## Commit and PR Step` section, find its ending and insert before it ends:

```markdown
### Post-PR-Creation: Apply feature-flow Label and Body Markers

After `superpowers:finishing-a-development-branch` returns, extract the PR number from its output (look for a GitHub PR URL pattern: `https://github.com/.*/pull/(\d+)`).

Store the extracted number as the `pr` context key for subsequent skill invocations.

Then run the following in sequence:

**1. Ensure the `feature-flow` label exists (idempotent):**
```bash
gh label create feature-flow \
  --description "Managed by feature-flow lifecycle" \
  --color 0E8A16 \
  --force 2>/dev/null || true
```

**2. Apply the label to the PR:**
```bash
gh pr edit <pr_number> --add-label feature-flow
```

**3. Append body markers:**
```bash
# Get current PR body
CURRENT_BODY=$(gh pr view <pr_number> --json body --jq '.body')

# Build markers block
MARKERS="<!-- feature-flow-session -->"
if [ -n "<design_doc_path>" ]; then
  MARKERS="${MARKERS}
<!-- feature-flow-design-doc: <design_doc_path> -->"
fi

# Append to body (only if marker not already present)
if ! echo "$CURRENT_BODY" | grep -q "feature-flow-session"; then
  gh pr edit <pr_number> --body "${CURRENT_BODY}

${MARKERS}"
fi
```

Where `<design_doc_path>` is the `design_doc` value from the lifecycle context object (may be absent for quick fix / small enhancement scopes).

**YOLO behavior:** Run silently. Announce: `YOLO: start — PR #<number> labeled feature-flow + body markers applied`
**Express behavior:** Same as YOLO — run silently, announce.
**Interactive behavior:** Run silently (no prompt needed — this is automatic housekeeping).

**Error handling:** If any of these steps fail (label creation, label application, body edit), log the failure and continue. These steps are housekeeping — failure must never block the lifecycle. Announce: `Warning: feature-flow label/marker apply failed for PR #<number> — Ship phase auto-discovery may not work. Run manually: gh pr edit <number> --add-label feature-flow`
```

If there is no existing `## Commit and PR Step` section, add this entire section to the end of `inline-steps.md`:

```markdown
---

## Commit and PR Step

This step delegates PR creation to `superpowers:finishing-a-development-branch` via the Skill tool. After the skill returns, the orchestrator performs post-creation housekeeping.

### Post-PR-Creation: Apply feature-flow Label and Body Markers

After `superpowers:finishing-a-development-branch` returns, extract the PR number from its output (look for a GitHub PR URL pattern: `https://github.com/.*/pull/(\d+)`).

Store the extracted number as the `pr` context key for subsequent skill invocations.

Then run the following in sequence:

**1. Ensure the `feature-flow` label exists (idempotent):**
```bash
gh label create feature-flow \
  --description "Managed by feature-flow lifecycle" \
  --color 0E8A16 \
  --force 2>/dev/null || true
```

**2. Apply the label to the PR:**
```bash
gh pr edit <pr_number> --add-label feature-flow
```

**3. Append body markers:**
```bash
# Get current PR body
CURRENT_BODY=$(gh pr view <pr_number> --json body --jq '.body')

# Build markers block
MARKERS="<!-- feature-flow-session -->"
if [ -n "<design_doc_path>" ]; then
  MARKERS="${MARKERS}
<!-- feature-flow-design-doc: <design_doc_path> -->"
fi

# Append to body (only if marker not already present)
if ! echo "$CURRENT_BODY" | grep -q "feature-flow-session"; then
  gh pr edit <pr_number> --body "${CURRENT_BODY}

${MARKERS}"
fi
```

Where `<design_doc_path>` is the `design_doc` value from the lifecycle context object (may be absent for quick fix / small enhancement scopes).

**YOLO behavior:** Run silently. Announce: `YOLO: start — PR #<number> labeled feature-flow + body markers applied`
**Express behavior:** Same as YOLO — run silently, announce.
**Interactive behavior:** Run silently (no prompt needed — this is automatic housekeeping).

**Error handling:** If any of these steps fail (label creation, label application, body edit), log the failure and continue. These steps are housekeeping — failure must never block the lifecycle. Announce: `Warning: feature-flow label/marker apply failed for PR #<number> — Ship phase auto-discovery may not work. Run manually: gh pr edit <number> --add-label feature-flow`
```

**Step 3: Verify changes**

```bash
grep -n "feature-flow-session\|feature-flow-design-doc\|gh label create feature-flow\|Post-PR-Creation" skills/start/references/inline-steps.md | head -10
```
Expected: at least 4 matches.

**Step 4: Commit**

```bash
git add skills/start/references/inline-steps.md
git commit -m "feat: add Commit and PR post-creation logic — feature-flow label and body markers (#214)"
```

**Acceptance Criteria:**
- [ ] `skills/start/references/inline-steps.md` contains `### Post-PR-Creation: Apply feature-flow Label and Body Markers`
- [ ] File contains `gh label create feature-flow` command with `--force` flag
- [ ] File contains `gh pr edit <pr_number> --add-label feature-flow`
- [ ] File contains `<!-- feature-flow-session -->` marker string
- [ ] File contains `<!-- feature-flow-design-doc: <design_doc_path> -->` marker string
- [ ] File contains the idempotency check (`grep -q "feature-flow-session"`) before appending markers
- [ ] File documents the `pr` context key extraction from the skill's PR URL output
- [ ] File documents YOLO announce format: `` YOLO: start — PR #<number> labeled feature-flow + body markers applied ``
- [ ] File documents error handling — failure must never block the lifecycle

---

### Task 6: Document `merge:` config in `references/project-context-schema.md`

**Files:**
- Modify: `references/project-context-schema.md`

**Can run in parallel with Tasks 1–5.**

**Context to read first:**
- `references/project-context-schema.md` lines 590–638 — "How Skills Use This File" section (to find where to add the merge-prs entry)
- Design doc §File Changes §6 (Modify `references/project-context-schema.md`)

**Step 1: Read the current schema file ending**

Read `references/project-context-schema.md` lines 590–638. Identify:
1. The last `###` heading in the `## Fields` section (currently `### plugin_overrides`)
2. The "How Skills Use This File" section and its last entry (currently `### settings (reads + writes)`)

**Step 2: Add `merge` field documentation**

Find the exact string that ends the Fields section — the last line of `### plugin_overrides`:
```
**When absent:** All plugins use their auto-classified roles and inferred stack affinity from the `plugin_registry`. The field is never auto-written; it is only added via the `/settings` Plugins submenu or manually.
```

After that line (before the `## Enums` section), insert:

```markdown
### `merge`

**Type:** Object (optional)
**Default:** All sub-fields use their defaults (see below)
**Auto-managed:** No — user-configured
**Committed to git:** Yes

Controls merge behavior for the Ship phase and standalone `merge-prs` invocations.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `strategy` | `"squash"` \| `"merge"` \| `"rebase"` | `"squash"` | Git merge strategy |
| `delete_branch` | boolean | `true` | Delete branch after merge |
| `require_ci` | boolean | `true` | Require CI green before merge |
| `require_review` | boolean | `true` | Require approved review before merge |
| `auto_discover` | `"label"` \| `"body_marker"` \| `"both"` | `"label"` | PR auto-discovery mechanism |

**Format:**

```yaml
merge:
  strategy: squash          # squash | merge | rebase (default: squash)
  delete_branch: true       # delete branch after merge (default: true)
  require_ci: true          # require CI green before merge (default: true)
  require_review: true      # require approved review before merge (default: true)
  auto_discover: label      # label | body_marker | both (default: label)
```

**When needed:** Only when you want to override Ship phase merge defaults. Most projects can omit this section and rely on the defaults.

**When absent:** Ship phase uses: squash merge, delete branch, require CI green, require approved review, label-based auto-discovery.
```

**Step 3: Add merge-prs entry to "How Skills Use This File"**

Find the last entry in the "How Skills Use This File" section:
```
### settings (reads + writes)
- **Reads** any field in `.feature-flow.yml` to display the current configuration to the user.
- **Writes** updated field values to `.feature-flow.yml` when the user changes a setting (e.g., `tool_selector`, `notifications`, `knowledge_base`, `design_preferences`).
```

After that, add:

```markdown
### merge-prs (reads)
- **Reads** `merge.strategy` to determine the `gh pr merge` flag (`--squash`, `--merge`, or `--rebase`). Defaults to `--squash` if absent.
- **Reads** `merge.delete_branch` to determine whether to pass `--delete-branch` to `gh pr merge`. Defaults to `true`.
- **Reads** `merge.require_ci` to determine whether to skip PRs with failing CI. Defaults to `true`.
- **Reads** `merge.require_review` to determine whether to skip PRs with pending/rejected reviews. Defaults to `true`.
- **Reads** `merge.auto_discover` to determine which PR discovery mechanism to use (`label`, `body_marker`, or `both`). Defaults to `label`.
```

**Step 4: Verify changes**

```bash
grep -n "### \`merge\`\|merge-prs (reads)\|auto_discover\|delete_branch" references/project-context-schema.md | head -15
```
Expected: at least 4 matches including the new `### \`merge\`` heading and the `merge-prs (reads)` entry.

**Step 5: Commit**

```bash
git add references/project-context-schema.md
git commit -m "docs: add merge: config section to project-context-schema.md (#214)"
```

**Acceptance Criteria:**
- [ ] `references/project-context-schema.md` contains `### \`merge\`` heading in the Fields section
- [ ] The `merge` field entry has a table with all 5 sub-fields: `strategy`, `delete_branch`, `require_ci`, `require_review`, `auto_discover`
- [ ] Each sub-field row shows its type, default value, and description
- [ ] The `merge` field entry includes a YAML `format:` example block
- [ ] The `merge` field entry documents "When absent" defaults
- [ ] `references/project-context-schema.md` contains `### merge-prs (reads)` in the "How Skills Use This File" section
- [ ] The `merge-prs (reads)` entry has a bullet for each of the 5 sub-fields
- [ ] The `merge` field section appears before `## Enums` in the file

---

### Task 7: Add `merge:` section to `.feature-flow.yml` schema documentation

**Files:**
- Modify: `.feature-flow.yml`

**Can run in parallel with Tasks 1–6.**

**Note:** The actual `.feature-flow.yml` in this repo does NOT need a `merge:` section added immediately — all fields are optional with defaults. This task adds only a **comment block** to document the available options, placed after the existing `design_preferences` section. This makes it easy for users to discover the config surface without having to read the schema reference.

**Context to read first:**
- `.feature-flow.yml` current contents (already read above — ends with `discovered_plugins` section)
- Design doc §File Changes §7

**Step 1: Read current .feature-flow.yml**

Read `.feature-flow.yml` to identify the best insertion point. The `design_preferences` section is the last user-facing config section before `plugin_registry`.

**Step 2: Add commented-out merge section**

Find the exact text:
```yaml
design_preferences:
  error_handling: exceptions
  testing: match_existing
```

Replace with:
```yaml
design_preferences:
  error_handling: exceptions
  testing: match_existing
# merge:                       # Optional: Ship phase merge configuration (all fields have defaults)
#   strategy: squash           # squash | merge | rebase (default: squash)
#   delete_branch: true        # delete branch after merge (default: true)
#   require_ci: true           # require CI green before merge (default: true)
#   require_review: true       # require approved review before merge (default: true)
#   auto_discover: label       # label | body_marker | both (default: label)
```

**Step 3: Verify changes**

```bash
grep -n "merge:" .feature-flow.yml | head -10
```
Expected: lines showing the commented-out `# merge:` block.

```bash
grep "^merge:" .feature-flow.yml
```
Expected: no output (the section is commented out, not active).

**Step 4: Commit**

```bash
git add .feature-flow.yml
git commit -m "docs: add commented merge: config block to .feature-flow.yml (#214)"
```

**Acceptance Criteria:**
- [ ] `.feature-flow.yml` contains a `# merge:` comment line
- [ ] The comment block lists all 5 sub-fields: `strategy`, `delete_branch`, `require_ci`, `require_review`, `auto_discover`
- [ ] Each commented sub-field shows its default value inline
- [ ] The `merge:` line itself is commented out (starts with `#`) — the section is not active
- [ ] `grep "^merge:" .feature-flow.yml` returns no output (no active `merge:` key)
- [ ] The comment block is placed after `design_preferences` and before `plugin_registry`
- [ ] Existing `.feature-flow.yml` content is otherwise unchanged

---

### Task 8: Final Verification

**Can only run after Tasks 1–7 all complete.**

**Step 1: Verify all new files exist**

```bash
ls -la skills/merge-prs/SKILL.md skills/merge-prs/references/conflict-resolution.md
```
Expected: both files listed with non-zero sizes.

**Step 2: Verify step list changes**

```bash
grep -n "Ship" skills/start/references/step-lists.md
```
Expected: exactly 2 lines, one in Feature section (step 21), one in Major feature section (step 22).

```bash
grep -c "Ship" skills/start/references/step-lists.md
```
Expected: `2`

**Step 3: Verify start SKILL.md changes**

```bash
grep -c "feature-flow:merge-prs\|\"pr\"\|\"ship\"\|Ship Step" skills/start/SKILL.md
```
Expected: at least `4` (one occurrence of each addition).

**Step 4: Verify inline-steps.md changes**

```bash
grep -c "feature-flow-session\|feature-flow-design-doc\|gh label create feature-flow\|Post-PR-Creation" skills/start/references/inline-steps.md
```
Expected: at least `4`.

**Step 5: Verify schema documentation**

```bash
grep -c "### \`merge\`\|merge-prs (reads)\|auto_discover" references/project-context-schema.md
```
Expected: at least `3`.

**Step 6: Verify .feature-flow.yml comment block**

```bash
grep -c "# merge:\|# strategy:\|# delete_branch:\|# require_ci:\|# require_review:\|# auto_discover:" .feature-flow.yml
```
Expected: `6` (one line for each commented sub-field plus the section header).

**Step 7: Verify no regressions in step lists**

```bash
grep "Ship" skills/start/references/step-lists.md | grep -v "Feature\|Major"
```
Expected: no output (Ship only appears in Feature and Major feature sections, not in headings).

Note: this grep checks that "Ship" lines don't bleed into Quick fix or Small enhancement sections. The approach is to run the check above and manually verify the line numbers from Step 2 fall within the correct section ranges.

**Step 8: Check git log for all 7 commits**

```bash
git log --oneline -10
```
Expected: 7 recent commits referencing `(#214)`, covering all tasks.

**Acceptance Criteria:**
- [ ] `skills/merge-prs/SKILL.md` passes all Task 1 acceptance criteria
- [ ] `skills/merge-prs/references/conflict-resolution.md` passes all Task 2 acceptance criteria
- [ ] `skills/start/references/step-lists.md` passes all Task 3 acceptance criteria
- [ ] `skills/start/SKILL.md` passes all Task 4 acceptance criteria
- [ ] `skills/start/references/inline-steps.md` passes all Task 5 acceptance criteria
- [ ] `references/project-context-schema.md` passes all Task 6 acceptance criteria
- [ ] `.feature-flow.yml` passes all Task 7 acceptance criteria
- [ ] `grep "Ship" skills/start/references/step-lists.md | wc -l` returns `2`
- [ ] `grep "^merge:" .feature-flow.yml` returns no output
- [ ] All 7 files have been committed to git with `(#214)` in the commit message
