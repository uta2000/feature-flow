# Merge-PRs Integration — Design Document

**Date:** 2026-04-06
**Status:** Draft
**Issue:** #214

## Overview

Integrate the standalone `merge-prs` skill into the feature-flow lifecycle as a "Ship" phase — an optional final step after "Comment and close issue" that discovers, orders, and merges related PRs. This surfaces merge orchestration directly in the lifecycle for Feature and Major feature scopes, while preserving the standalone invocation path for ad-hoc use. The integration adds auto-discovery via GitHub labels, design-doc-aware conflict resolution, and YOLO/Express/Interactive mode support.

## User Flow

### Lifecycle mode (primary)

After the "Comment and close issue" step completes, the orchestrator checks for other open feature-flow PRs targeting the same base branch:

1. Query: `gh pr list --label feature-flow --base <base_branch> --state open --json number,title,headRefName`
2. If zero PRs found — skip silently, lifecycle ends
3. If PRs found — present Ship phase options:
   - **Merge this PR only** — merge just the current session's PR (if not already merged by "Wait for CI")
   - **Batch merge all** — merge all discovered PRs in optimal order
   - **Skip** — end lifecycle without merging

### Standalone mode (preserved)

Invoked directly as `merge-prs <args>` with the same argument patterns as the current standalone skill:
- `merge-prs 185 186` — specific PR numbers
- `merge-prs all open` — all open PRs on current base branch
- `merge-prs epic 175` — all PRs linked to issue #175

### Cross-session mode (new)

Invoked as `merge-prs feature-flow` to discover and merge all PRs labeled `feature-flow`:
- Equivalent to `gh pr list --label feature-flow --state open`
- Useful when returning to merge PRs from multiple completed sessions

## Architecture

### Skill structure

```
skills/
  merge-prs/
    SKILL.md                              # Main skill orchestrator
    references/
      conflict-resolution.md              # Trivial vs behavioral conflict rules
```

`SKILL.md` replaces the standalone `~/Dev/claude-merge-prs/commands/merge-prs.md` as the canonical implementation within feature-flow. The standalone plugin can delegate to this skill or be deprecated.

### Lifecycle integration point

The Ship phase is appended to the Feature and Major feature step lists as the final optional step. It runs after "Comment and close issue" and only activates when discoverable PRs exist.

### Auto-discovery mechanism

**Primary: GitHub label `feature-flow`**

Applied during the "Commit and PR" step (when `superpowers:finishing-a-development-branch` creates the PR). The label is queryable via `gh pr list --label feature-flow`.

**Secondary: PR body marker**

Appended to PR body during creation:
```html
<!-- feature-flow-session -->
```

Used as fallback when labels are stripped or for repos where label-based queries are unreliable.

**Design doc linkage marker:**

Appended to PR body during creation:
```html
<!-- feature-flow-design-doc: docs/plans/2026-04-06-merge-prs-integration.md -->
```

Used during conflict resolution to load the design document and understand intended behavior.

## Gap Resolutions

### Gap 1: Invocation

Three modes as described in User Flow above. The lifecycle mode auto-populates context from the current session (current PR number, base branch, design doc path). Standalone and cross-session modes require explicit arguments.

**Implementation:** `SKILL.md` checks `$ARGUMENTS` for mode:
- Contains PR numbers or "all open" or "epic N" — standalone mode
- Contains "feature-flow" — cross-session mode
- Empty/absent (invoked from lifecycle) — lifecycle mode, use session context

### Gap 2: Auto-discovery

GitHub label `feature-flow` is the primary discovery mechanism. The label is applied during PR creation in the "Commit and PR" step. PR body marker `<!-- feature-flow-session -->` serves as secondary/fallback.

**Query:**
```bash
gh pr list --label feature-flow --base main --state open --json number,title,headRefName,baseRefName,mergeable,statusCheckRollup
```

**Config control:** `.feature-flow.yml` setting `merge.auto_discover` controls which mechanisms are used: `label` (default), `body_marker`, or `both`.

### Gap 3: Design doc linkage

When resolving conflicts, the skill loads the design document to understand intended behavior:

1. Extract path from PR body: `<!-- feature-flow-design-doc: <path> -->`
2. Fallback: scan `docs/plans/` for files matching the branch name or issue number
3. Final fallback: generic conflict resolution without design context

The design doc provides:
- Feature scope and boundaries (what should and should not change)
- Data model decisions (which schema is authoritative)
- API contracts (which interface is correct)

### Gap 4: YOLO/Express/Interactive modes

| Behavior | YOLO | Express | Interactive |
|----------|------|---------|-------------|
| Ship phase activation | Auto-select "Batch merge all" if all CI passing, else "Merge this PR only" | Show merge order briefly, auto-proceed | Full confirmation at each step |
| Merge order confirmation | Skip — announce order inline | Show order, 3-second pause, proceed | Present order, wait for confirmation |
| Trivial conflict resolution | Auto-resolve, announce | Auto-resolve, announce | Show conflict, ask to auto-resolve or manual |
| Behavioral conflict resolution | Pause, present conflict, require confirmation | Pause, present conflict, require confirmation | Pause, present conflict, require confirmation |
| Post-merge summary | Announce inline | Announce inline | Present detailed summary |

**Announce formats:**
- YOLO: `YOLO: ship — [N] PRs discovered → Batch merge all (all CI green)`
- YOLO: `YOLO: ship — Trivial conflict in PR #186 (import ordering) → auto-resolved`
- YOLO: `YOLO: ship — Behavioral conflict in PR #190 (function body change) → paused`
- Express: `Express: ship — Merge order: #185 → #186 → #190. Proceeding...`

### Gap 5: Post-merge actions

After each successful merge:
1. Add comment to merged PR: `"Merged via feature-flow Ship phase (batch merge, order: N/M)"`
2. Check if linked issue is already closed — if not, close it
3. If Vercel plugin is installed (`vercel` in `plugin_registry`), opportunistically check deploy status: `gh api repos/{owner}/{repo}/deployments --jq '.[0].statuses_url'` — log result but do not block
4. Use existing notification config (`notifications.on_stop: bell`) for final summary

**Do not:**
- Double-close issues already closed by GitHub's auto-close
- Block on Vercel deploy checks — they are informational only

### Gap 6: Error recovery

Strategy: continue-on-failure with end-of-run report.

| Error | Action |
|-------|--------|
| PR merge fails (conflict) | Attempt conflict resolution per Gap 7 rules |
| Conflict resolution fails | Log failure reason, skip PR, continue with remaining |
| CI fails after conflict resolution | Investigate once (read CI logs), attempt fix if trivial (lint, type error). If unfixable, skip PR |
| PR has unresolved reviews | Flag to user, skip PR |
| GitHub API error | Retry once after 5 seconds. If still failing, skip PR |
| PR already merged | Detect via `gh pr view <number> --json state`. If `state: "MERGED"`, announce "PR #N already merged — skipping." Continue with remaining PRs |

At the end of the merge run, report:
```
Ship Phase Summary:
  Merged: #185, #186 (2/3)
  Skipped: #190 — behavioral conflict in src/api/handler.ts, could not auto-resolve
  
  Action needed: Resolve conflict in #190 manually, then run `merge-prs 190`
```

**No rollback.** Merged PRs stay merged. This matches standard GitHub workflow — you fix forward, not revert.

### Gap 7: Behavioral vs trivial conflict classification

**Trivial conflicts (auto-resolvable):**
- Import statement ordering or additions
- Whitespace-only changes (trailing spaces, blank lines, indentation)
- Lock file conflicts (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`)
- Auto-generated files (`.generated.`, snapshots)
- Adjacent additive lines (both sides add new lines near each other without overlapping)
- CHANGELOG.md conflicts (always take both entries, re-sort by date)

**Behavioral conflicts (require confirmation):**
- Function body changes (logic, control flow, return values)
- Conditional expression changes (`if`, `switch`, ternary)
- API contract changes (route definitions, request/response schemas, middleware chains)
- Database schema changes (migrations, model definitions)
- Test assertion changes (expected values, test logic)
- Configuration value changes (env vars, feature flags, thresholds)

**Detection heuristic:** Parse the conflict markers. If the conflicting region is inside a function body or changes control flow keywords (`if`, `else`, `for`, `while`, `return`, `throw`, `switch`, `case`), classify as behavioral. If the conflicting region is only imports, whitespace, or lock files, classify as trivial.

**YOLO override:** Even in YOLO mode, behavioral conflicts always pause for human confirmation. This is a hard safety rule — no override.

### Gap 8: Scope mapping

| Scope | Ship phase? |
|-------|------------|
| Quick fix | No |
| Small enhancement | No |
| Small enhancement (fast-track) | No |
| Feature | Yes — optional step 21 |
| Major feature | Yes — optional step 22 |

The Ship phase is the final step. It only appears in the step list when other feature-flow PRs exist targeting the same base branch. If none exist, the step is skipped silently and the lifecycle ends at "Comment and close issue."

## File Changes

### 1. Create `skills/merge-prs/SKILL.md`

New skill file. Contains:
- Frontmatter: name, description, tools (Read, Glob, Grep, Bash, Edit, AskUserQuestion, Task)
- Three invocation modes (lifecycle, standalone, cross-session)
- PR identification and review (parallel CI/review/files/merge-state checks)
- Merge order determination algorithm
- Sequential merge execution with conflict detection
- Post-merge actions and summary report
- YOLO/Express/Interactive behavior specifications
- References to `references/conflict-resolution.md` for conflict classification

### 2. Create `skills/merge-prs/references/conflict-resolution.md`

Reference file containing:
- Trivial vs behavioral conflict classification rules (from Gap 7)
- Auto-resolution strategies per conflict type
- Design doc loading and interpretation for conflict context
- Examples of each conflict type with resolution approach

### 3. Modify `skills/start/references/step-lists.md`

Add Ship step to Feature and Major feature lists:

**Feature** (step 21):
```
- [ ] 21. Ship (merge related PRs)
```

**Major feature** (step 22):
```
- [ ] 22. Ship (merge related PRs)
```

No changes to Quick fix, Small enhancement, or fast-track lists.

### 4. Modify `skills/start/SKILL.md`

Add to the step-to-skill mapping table:

| Step | Skill | Completion signal |
|------|-------|-------------------|
| Ship (merge related PRs) | `feature-flow:merge-prs` | All discoverable PRs merged or skipped |

Add `pr` to the Lifecycle Context Object table:

| Path key | When it becomes available |
|----------|--------------------------|
| `pr` | After "Commit and PR" step (the PR number extracted from the skill's output) |

Add orchestration logic for the Ship step:
- After "Comment and close issue" completes, check for discoverable PRs
- If found, invoke `feature-flow:merge-prs` in lifecycle mode with `pr` context
- If not found, skip silently

Add to YOLO stop-after phase mapping:

| `stop_after` value | Lifecycle step | Fires after/before |
|---------------------|---------------|-------------|
| `ship` | Ship (merge related PRs) | Before `feature-flow:merge-prs` is invoked |

### 5. Modify "Commit and PR" step behavior

During the "Commit and PR" step (handled by `superpowers:finishing-a-development-branch`), the orchestrator must ensure:
- The `feature-flow` label is applied to the PR: `gh pr edit <number> --add-label feature-flow`
- The PR body includes `<!-- feature-flow-session -->` marker
- The PR body includes `<!-- feature-flow-design-doc: <path> -->` marker (if a design doc exists)

This is implemented as **inline orchestrator logic** inserted between the "Confirm completion" and "Mark complete" sub-steps of the Commit and PR step execution. There is no generic "post-step hook" mechanism in the start skill's execution loop — this is explicit inline code for this specific step. The orchestrator extracts the PR number from the skill's output, then runs:

```bash
# Create label if it doesn't exist (idempotent with --force)
gh label create feature-flow --description "Managed by feature-flow lifecycle" --color 0E8A16 --force 2>/dev/null || true

# Apply label
gh pr edit <number> --add-label feature-flow

# Append body markers (use gh pr edit --body to append)
```

**Note:** The `feature-flow` label cannot be applied at PR creation time via `--label` because the start orchestrator delegates PR creation to `superpowers:finishing-a-development-branch` via the Skill tool — the orchestrator never calls `gh pr create` directly. The post-creation inline approach is the only viable path without modifying the superpowers skill.

### 6. Modify `references/project-context-schema.md`

Add documentation for the new `merge:` config section:

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
```

Add to "How Skills Use This File" section:
- **merge-prs:** Reads `merge.*` for merge strategy, CI/review requirements, and discovery mechanism. All fields optional with defaults.

### 7. Modify `.feature-flow.yml` schema

Add `merge` section:

```yaml
merge:
  strategy: squash          # squash | merge | rebase (default: squash)
  delete_branch: true       # delete branch after merge (default: true)
  require_ci: true          # require CI green before merge (default: true)
  require_review: true      # require approved review before merge (default: true)
  auto_discover: label      # label | body_marker | both (default: label)
```

All fields are optional with sensible defaults. The existing `.feature-flow.yml` does not need to be modified immediately — defaults apply.

## Patterns & Constraints

### Error handling

Exceptions strategy (matching `design_preferences.error_handling: exceptions` in `.feature-flow.yml`). Errors during merge are caught, logged, and the PR is skipped. No silent failures — every skip is reported with a reason.

### Conflict resolution safety

Behavioral conflicts are never auto-resolved. This is enforced at the classification level, not the mode level. Even if a future mode is added that is "more aggressive" than YOLO, behavioral conflicts still require confirmation.

### GitHub API rate limiting

The skill makes ~5-6 `gh` CLI calls per PR (checks, view, merge, re-query, comment, issue view). For large batches (10+ PRs), add a 1-second delay between merge operations to avoid hitting GitHub's secondary rate limits (~80-90 write requests/minute). For smaller batches, no delay needed. This assumes batches rarely exceed 30 PRs — for larger batches, increase the delay proportionally.

### Worktree cleanup

If the skill creates worktrees during conflict resolution, they must be cleaned up before the skill exits — even on error. Use the same CWD safety guard pattern from the start skill.

### Label creation

The `feature-flow` label must exist in the repo. On first use, ensure it exists idempotently: `gh label create feature-flow --description "Managed by feature-flow lifecycle" --color 0E8A16 --force`. The `--force` flag makes this safe to re-run — it updates the label if it already exists instead of failing with "Label already exists."

### Worktree compatibility

The Ship phase may run from inside a feature worktree (the lifecycle creates worktrees during step 9). The `gh` CLI works correctly from worktrees — it reads the remote via git config, which is inherited. All `gh pr list`, `gh pr merge`, and `gh pr edit` commands are worktree-safe. No special handling is needed.

### Vercel deploy detection

To check if the Vercel plugin is installed, check the `plugin_registry` in `.feature-flow.yml` for any key containing `vercel` in `discovered_plugins` or `base_plugins`: `any(key for key in plugin_registry.discovered_plugins if 'vercel' in key.lower())`. This is opportunistic — if no match, skip deploy checks silently.

## Scope

### Included

- Ship phase in Feature and Major feature lifecycles
- Three invocation modes (lifecycle, standalone, cross-session)
- Auto-discovery via label and body marker
- Design-doc-aware conflict resolution
- Trivial vs behavioral conflict classification
- YOLO/Express/Interactive mode support
- `.feature-flow.yml` merge configuration
- PR body template changes (label, markers)
- Error recovery with continue-on-failure

### Excluded

- Rollback/revert capability (fix forward only)
- Ship phase for Quick fix or Small enhancement scopes
- Auto-merge without any human presence (even YOLO pauses on behavioral conflicts)
- Changes to the standalone `claude-merge-prs` plugin (it can be deprecated separately)
- Vercel deploy blocking (informational only)

## Migration Notes

### Existing repos

No migration needed. The `merge` config section is optional with defaults. The Ship step is skipped when no feature-flow PRs exist. The `feature-flow` label is created on first use.

### Existing standalone merge-prs users

The standalone `merge-prs` invocation continues to work identically. The skill simply gains lifecycle awareness when invoked without arguments from the start orchestrator. Users can continue using `merge-prs 185 186` as before.

### Label adoption

PRs created before this integration will not have the `feature-flow` label. The cross-session mode (`merge-prs feature-flow`) will only discover PRs created after the integration is deployed. For older PRs, use standalone mode with explicit PR numbers.
