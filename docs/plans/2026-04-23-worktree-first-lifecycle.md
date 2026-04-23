# Worktree-First Lifecycle — Design Document

**Date:** 2026-04-23
**Status:** Draft
**Tracking issue:** [#244](https://github.com/paulholstein/feature-flow/issues/244)
**Scope:** major-feature (feature-flow plugin `start:` orchestrator)
**Base branch:** `main`

## Summary

Restructure the `start:` lifecycle to fix three coupled problems that surface when running multiple parallel `start:` sessions:

1. **Worktree-first.** Create the isolation worktree at step 1 (before brainstorming, design, and issue creation) using a provisional slug derived from the user's `start:` description plus a 4-character hash suffix.
2. **Design-in-issue.** Fold the design document into the linked GitHub issue body via HTML-comment-delimited markers, instead of writing `docs/plans/YYYY-MM-DD-*.md` files.
3. **Post-merge cleanup.** Defer worktree/branch/handoff cleanup until after PR merge, driven by a new `feature-flow:cleanup-merged` skill that `merge-prs` invokes on successful merge and that `start:` runs opportunistically at session kickoff.

Applies to **four** scope templates: `small-enhancement` (standard + fast-track), `feature`, `major-feature`. **Quick fix is explicitly untouched** (no worktree, single-commit flow preserved per AC-10). The dispatcher's `.dispatcher-worktrees/` lifecycle is out of scope.

## Motivation

### The parallel-session collision

Running four `start:` sessions in parallel today causes four concurrent processes to:

- Start on the same base branch (`staging` / `main`) in the same CWD.
- Write design documents to `docs/plans/YYYY-MM-DD-*.md` on the base branch.
- Overwrite each other at `.feature-flow/design/design-decisions.md`, `.feature-flow/design/verification-results.md`, `.feature-flow/implement/patterns-found.md`, `.feature-flow/implement/blockers-and-resolutions.md`.
- Run `Commit Planning Artifacts` (`skills/start/references/inline-steps.md:47–76`), committing half-finished planning docs to the base branch.
- Bleed `HEAD` into each other's working directories because Claude Code sessions share CWD across parallel agents, and `git checkout` in one session is visible to the others until each creates its own worktree (currently step 8–10).

Grepping `skills/start/` for `parallel`/`concurrent`/`worktree` confirms the current design implicitly assumes one session at a time.

### Why design docs don't belong in `docs/plans/`

- ~30+ historical plan files have accumulated. In practice, nobody reads them after merge — LLMs fetch history from `git log` and `gh pr view`, not from loose files in `docs/plans/`.
- The design document is a **working artifact** consumed by `feature-flow:design-verification` and `superpowers:writing-plans` within a single session. After merge, the PR body, linked issue, and commit log are the durable record.
- The natural home for a design is the GitHub issue it belongs to.

### Why worktrees shouldn't be removed at Handoff

- Today, Handoff (or the completion summary for smaller scopes) recommends removing the worktree.
- The PR isn't merged yet. Review feedback may require returning to that branch.
- Worktree lifespan should match PR lifespan: created at start of work, destroyed after merge.

## Goals / Non-Goals

### Goals

- Eliminate CWD bleed and shared-path races across parallel `start:` sessions.
- Make every scope's worktree lifetime match its PR lifetime.
- Make GitHub issues the single source of truth for design content post-merge.
- Auto-reclaim local state (worktrees, branches, handoffs) after PRs merge.

### Non-Goals

- Migrating existing `docs/plans/*.md` files to GitHub issues (historical files stay as-is).
- Unifying `dispatcher/worktree.py`'s `.dispatcher-worktrees/issue-N` path with `start:`'s `.worktrees/<slug>-<hash>` path. Two separate systems remain.
- Changing Quick path (`skills/start/SKILL.md:86–123`). Quick fix keeps its 9-step flow with no worktree and a single commit.
- Changing GSD handoff behavior.
- Automated webhook-based cleanup on PR merge. The proposal is pull-based opportunistic cleanup; a webhook is future work.

## Design — Overview

Three changes ship as one feature:

| # | Change | Key Skill(s) |
|---|--------|--------------|
| 1 | Worktree becomes step 1; slug is derived from the user's request | `start` |
| 2 | Design content is merged into the GitHub issue body between markers | `design-document`, `create-issue`, `design-verification`, `writing-plans` |
| 3 | Worktree/branch/handoff cleanup defers to post-merge, driven by a new skill | new `cleanup-merged`, `merge-prs`, `start` (opportunistic pre-flight) |

All three changes are coupled: worktree-first enables session-scoped context files (change 3 rationale for removing defer-logic), and deferred cleanup requires a stable handoff file created at worktree setup (change 1) and updated at PR creation.

## Design — Details

### 1. Worktree-first

#### 1.1 Slug algorithm

Deterministic slug: `kebab(first-4-content-words(description)) + "-" + sha256(description + iso_date_utc)[:4]`.

**Procedure:**

1. Lowercase the description.
2. Strip characters not matching `[a-z0-9\s\-]`.
3. Split on whitespace, drop stop words, keep the first **4** remaining content words.
4. Join with `-`; collapse repeated `-`.
5. Compute `hash4 = sha256(description + iso_date_utc)[:4]` (hex, lowercase). The date component is `YYYY-MM-DD` in UTC so two `start:` runs on the same feature the same day produce the same slug if rerun inside the session and differ across days.
6. Final slug: `"<content-slug>-<hash4>"`. **60-char cap on the content portion** (truncate content portion only; the 4-char hash is never truncated). Final length ≤ 65 chars (60 + `-` + 4).

**Stop words (fixed list):**
```
a, an, the, and, or, but, for, to, of, in, on, with, from, by, as,
is, are, was, were, be, been,
add, implement, create, build, make, support, feature, feat, fix, update, refactor
```

Action-verb suppression is intentional: `add logout button` → `logout-button-<hash4>`, not `add-logout-<hash4>`.

**Fallback:** If stop-word filtering leaves fewer than 2 content words, back off and keep the original first 4 tokens (pre-filter). If the description is empty or produces no tokens, use the constant slug `start-feature-<hash4>`.

**Collision suffix:** If `.worktrees/<slug>` already exists on disk (or the branch already exists), append `-2`, then `-3`, and so on. The handoff file records the final disambiguated slug.

**Examples:**

| Input | Slug |
|-------|------|
| `start: add a logout button to the header` | `logout-button-header-a3f2` |
| `start: refactor the billing subscription renewal logic` | `billing-subscription-renewal-logic-9c1e` |
| `start: add logout button` (same day, same user) | `logout-button-a3f2` |
| `start: add logout link` | `logout-link-b742` |
| `start: :` (pathological empty) | `start-feature-0000` |

#### 1.2 Worktree setup as Step 1

Every non-quick-path scope opens with **Step 1 — Worktree setup**, before brainstorming, documentation lookup, issue creation, or design. The worktree setup step:

1. Computes the slug (§1.1).
2. Creates `.worktrees/<slug>` via `git worktree add -b feature/<slug> .worktrees/<slug> <base_branch>`.
3. Enters the worktree (changes CWD).
4. Writes the pending handoff file at `.feature-flow/handoffs/pending-<slug>.yml` in the **base repo** (not the worktree — see §1.3).
5. Creates `.feature-flow/design/` and `.feature-flow/implement/` subdirectories inside the worktree, empty. Downstream steps can write to them without guards.

#### 1.3 Handoff state file schema

Stored in the **base repo** at `.feature-flow/handoffs/<pr-number>.yml`. Base-repo location (not worktree) is deliberate: the file must survive worktree removal so cleanup can run after the worktree is gone.

**Filename lifecycle:**

- Created at Worktree setup as `.feature-flow/handoffs/pending-<slug>.yml` (no PR number yet).
- Renamed at the Commit-and-PR step to `.feature-flow/handoffs/<pr-number>.yml` once `gh pr create` returns the PR number.
- Removed by `cleanup-merged` after successful cleanup.

**Schema (YAML):**

```yaml
# .feature-flow/handoffs/<pr-number>.yml
schema_version: 1
pr_number: 123               # integer once PR exists; absent/null for pending handoffs
pending_slug: null           # populated only in pending-<slug>.yml; null after rename
branch: feature/logout-button-a3f2
worktree_path: /abs/path/to/repo/.worktrees/logout-button-a3f2
base_branch: main
scope: feature               # quick-fix|small-enhancement|feature|major-feature
issue_number: 244            # the design issue; present once create-issue has run
created_at: 2026-04-23T14:07:11Z
slug: logout-button-a3f2
feature_flow_version: 1.27.0 # plugin version that created the handoff
```

**Properties:**

- No secrets. Safe to commit (but gitignored — see §1.4).
- `pr_number` is absent/null on `pending-<slug>.yml`; populated on rename.
- `issue_number` is populated as soon as the Create-issue step runs; may be absent on `pending-<slug>.yml` if the user aborts before Create-issue.
- Stable, human-readable, machine-parseable by any YAML library.

#### 1.4 `.gitignore` entry

Add `.feature-flow/handoffs/` to `.gitignore` at repo root. Handoff files are local state; they must never reach a commit or travel with a PR.

#### 1.5 Session-scoped context files (defer-logic removal)

Because the worktree exists from step 1, `.feature-flow/design/*.md` and `.feature-flow/implement/*.md` are created before any step that writes to them runs. Downstream steps can write directly without "has the worktree been set up yet?" guards.

Concrete removals in `skills/start/references/inline-steps.md`:

- Remove the `"If the file does not exist yet (e.g., worktree was set up without the init step), create it using the template..."` fallback in **Study Existing Patterns** (~line 189). This becomes a hard requirement: the file must exist; error loudly if it doesn't (indicates a worktree-setup bug).
- Apply the same treatment to equivalent fallbacks in:
  - Blockers-and-resolutions step
  - Design-context step
  - Plan-context step

### 2. Design-in-issue-body

#### 2.1 Ordering: `create-issue` before `design-document`

`create-issue` runs **first**, unconditionally, in every non-quick-path scope. `design-document` runs after and edits the issue body.

- Removes the "update existing issue" passthrough from step 1. All non-quick lifecycles go through `create-issue`, which either creates a new issue or reuses an existing one passed via `--issue <n>` / `issue: <n>` arg.
- Mental model: "the issue exists before the design is written."
- `design-verification` (Feature + Major feature) continues to run between `design-document` and `implementation plan`. It reads the design from the **issue body**, not from `docs/plans/`.
- `writing-plans` reads the design from the **issue body**, not from `docs/plans/`.

**When `create-issue` runs first (new lifecycle):** The brainstorming output is in conversation context. `create-issue` Step 1 no longer globs `docs/plans/*.md`; instead it assembles a minimal issue body from the brainstorming decisions + scope and inserts an empty marker block (`<!-- feature-flow:design:start --> (pending design-document) <!-- feature-flow:design:end -->`). `design-document` then fills in the marker block on the next step. This resolves the chicken-and-egg between "issue exists first" and "design exists first".

#### 2.2 Merge-into-issue-body protocol

`design-document` fetches the current issue body via `gh issue view <n> --json body`, then merges the generated design content using HTML-comment markers:

```
<!-- feature-flow:design:start -->
## Design (feature-flow)

<generated design content>

_Generated by feature-flow design-document on YYYY-MM-DD. Re-running design-document will update this section in place._
<!-- feature-flow:design:end -->
```

**Merge rules:**

- **If markers present:** replace the content between `<!-- feature-flow:design:start -->` and `<!-- feature-flow:design:end -->` (inclusive of section heading, exclusive of markers). Preserves everything outside the markers verbatim — including any user edits to the original summary.
- **If markers absent:** append the full marker-wrapped block (markers + `## Design (feature-flow)` heading + content + footer) to the end of the body.

**Write mechanism:**

- Write the full merged body to a temp file.
- `gh issue edit <n> --body-file <tempfile>`.

**Size overflow:**

- GitHub issue body limit is 65,536 characters.
- If the merged body exceeds the limit, the skill falls back to:
  1. Posting the `## Design` block as a standalone issue comment (`gh issue comment <n> --body-file ...`).
  2. Writing a reference link inside the markers: `Design is too large to inline — see comment: <comment-url>`. The markers stay present so subsequent runs find them.
- This preserves the invariant: the issue is always the single source of truth; it either contains the design or points to the comment that does.

**Re-run semantics:**

- Re-running `design-document` on the same issue replaces the marker-bounded block. No duplication.
- Concurrent edits outside the markers are preserved (last-writer-wins on the full body, but the merge strategy is resilient to external edits that don't touch the markers).

#### 2.3 `docs/plans/` is no longer a write target

- `design-document` does not write `docs/plans/YYYY-MM-DD-*.md`.
- Existing `docs/plans/*.md` files are kept as historical record. No migration.
- An advisory `docs/plans/README.md` (new file, short) is added:

  > Historical design documents. Active designs since 2026-04-23 live in their linked GitHub issue body under the `## Design (feature-flow)` section. See the feature-flow plugin for the current lifecycle.

- The design-document skill's "format patterns" explore agent may still read `docs/plans/*.md` as structural examples, but never writes there.

### 3. Post-merge cleanup

#### 3.1 New skill: `feature-flow:cleanup-merged`

Location: `skills/cleanup-merged/SKILL.md`.

**Inputs (one of):**

- A specific PR number: `cleanup-merged <pr-number>` — cleans up just that PR's handoff.
- No argument: scan `.feature-flow/handoffs/*.yml`, clean up every handoff whose PR is `MERGED` or `CLOSED`.

**Behavior (per handoff):**

1. Read handoff YAML.
2. Query PR state: `gh pr view <pr_number> --json state` → `MERGED`, `CLOSED`, or `OPEN`.
   - If `OPEN`: skip (not eligible for cleanup).
   - If `MERGED` or `CLOSED`: proceed.
3. Run cleanup actions in order (idempotent; each is best-effort, non-fatal):
   1. **Remove worktree.** `git worktree remove <worktree_path> --force` with a CWD-safety guard (refuse to remove the worktree currently occupied by the process).
   2. **Fallback directory removal.** If step 3.i reports success but the directory still exists, `rm -rf <worktree_path>`.
   3. **Delete local branch.** `git branch -D <branch>` (skip if branch is currently checked out anywhere else).
   4. **Delete remote branch.** `git push origin --delete <branch>`, gated by `.feature-flow.yml: cleanup.delete_remote_branch` (default `true`). If the branch is already gone on remote, treat as success.
   5. **Remove handoff file.** `rm .feature-flow/handoffs/<pr-number>.yml`.
   6. **Append log entry.** Append one line to `.feature-flow/handoffs/.log` (also gitignored):
      ```
      2026-04-23T14:32:18Z  pr=123  slug=logout-button-a3f2  outcome=success
      ```
4. If any action fails:
   - Announce to user: `cleanup: branch deletion failed: <error> — handoff retained for retry`.
   - Leave the handoff file in place so the next run retries.
   - Log outcome=`partial-<step>` with the step that failed.
   - Continue with the next handoff (do not abort batch cleanup).

**Idempotency:** Every action tolerates "already done" state (worktree already removed, branch already gone, file already absent).

**Schema version handling:** If a handoff has `schema_version` absent or `< 1`, log a warning and skip. Users clean these up by hand once. Future schema bumps use forward-compatible migration logic here.

#### 3.2 `merge-prs` integration

After a PR merges successfully (merge + remote-branch-deletion both succeed), `merge-prs` invokes `cleanup-merged <pr-number>` for that PR. Failure of `cleanup-merged` does not fail the merge operation itself; the handoff stays on disk for the next opportunistic run.

#### 3.3 Opportunistic pre-flight at `start:` session kickoff

At the start of every new `start:` session (including Quick fix), `start:` invokes `cleanup-merged` with no argument as a pre-flight step. This self-heals:

- Skipped `merge-prs` runs (PR merged via GitHub UI).
- CLI crashes mid-cleanup.
- Stale handoffs from previous plugin versions.

The pre-flight is silent on no-op (no eligible handoffs) and announces cleaned PRs on success. It does not block the start flow if cleanup fails.

#### 3.4 Handoff step no longer removes the worktree

The `Handoff` step in Feature + Major feature scopes no longer runs `git worktree remove`. It instead:

- Confirms the handoff file at `.feature-flow/handoffs/<pr-number>.yml` is in place.
- Announces: `Worktree and branch will be removed automatically once PR #<n> is merged.`

### 4. New step-list orderings (four scopes)

**Quick fix — UNCHANGED (per AC-10):**

No worktree, no issue body edits, no handoff file, no cleanup hook changes. Quick path is excluded from this design.

**Small enhancement — standard:**

```
 1. Worktree setup
 2. Copy env files
 3. Brainstorm requirements
 4. Documentation lookup (Context7)
 5. Create issue
 6. Design document (updates issue body)
 7. Implementation plan
 8. Verify plan criteria
 9. Study existing patterns
10. Implement (TDD)
11. Self-review
12. Code review
13. Generate CHANGELOG entry
14. Final verification
15. Sync with base branch
16. Commit and PR        [renames pending-<slug>.yml → <pr-number>.yml]
17. Wait for CI and address reviews
18. Post implementation comment
```

**Small enhancement — fast-track:**

```
 1. Worktree setup
 2. Copy env files
 3. Documentation lookup (Context7)
 4. Create issue
 5. Implementation plan
 6. Study existing patterns
 7. Implement (TDD)
 8. Self-review
 9. Code review
10. Generate CHANGELOG entry
11. Final verification
12. Sync with base branch
13. Commit and PR        [renames pending-<slug>.yml → <pr-number>.yml]
14. Wait for CI and address reviews
15. Post implementation comment
```

**Feature:**

```
 1. Worktree setup
 2. Copy env files
 3. Brainstorm requirements
 4. Documentation lookup (Context7)
 5. Create issue
 6. Design document (updates issue body)
 7. Design verification
 8. Implementation plan
 9. Verify plan criteria
10. Study existing patterns
11. Implement (TDD)
12. Self-review
13. Code review
14. Generate CHANGELOG entry
15. Final verification
16. Sync with base branch
17. Commit and PR        [renames pending-<slug>.yml → <pr-number>.yml]
18. Wait for CI and address reviews
19. Harden PR
20. Post implementation comment
21. Handoff              [no longer removes worktree]
```

**Major feature:**

```
 1. Worktree setup
 2. Copy env files
 3. Brainstorm requirements
 4. Spike / PoC (if risky unknowns)
 5. Documentation lookup (Context7)
 6. Create issue
 7. Design document (updates issue body)
 8. Design verification
 9. Implementation plan
10. Verify plan criteria
11. Study existing patterns
12. Implement (TDD)
13. Self-review
14. Code review
15. Generate CHANGELOG entry
16. Final verification
17. Sync with base branch
18. Commit and PR        [renames pending-<slug>.yml → <pr-number>.yml]
19. Wait for CI and address reviews
20. Harden PR
21. Post implementation comment
22. Handoff              [no longer removes worktree]
```

**Key orderings in every non-quick scope:**

- Worktree setup is **always step 1**.
- Create-issue always precedes Design-document.
- Design-document always writes to the issue body (not a file).
- `Commit planning artifacts` is **REMOVED** from every step list (design is in the issue; no local design file to commit).
- Commit-and-PR step includes the pending-handoff rename operation.
- Handoff step (Feature + Major feature only) does not run worktree removal.

## Patterns & Constraints

### Error Handling

- **Cleanup actions are best-effort, non-fatal.** Any failure is announced and logged; the handoff is retained for retry. Cleanup never aborts a user-facing operation (merge, start).
- **Issue-body writes use the file-based flow** (`gh issue edit --body-file`) to avoid shell-escaping bugs with multi-kilobyte design content.
- **Size overflow is a documented fallback path**, not an error: oversized body → comment + reference link.
- **Slug generation never fails.** The empty-description fallback produces a valid constant slug.
- **Collision detection is deterministic.** `-2`/`-3` suffixes until a non-colliding path is found. No probabilistic retry loops.

### Types (conceptual — no generated types in this plugin codebase)

- `Scope: "quick-fix" | "small-enhancement" | "feature" | "major-feature"` (literal union).
- `HandoffState` schema is YAML (§1.3); tooling reads it with standard YAML libs.
- `PRState: "OPEN" | "MERGED" | "CLOSED"` (matches `gh pr view --json state`).

### Performance

- Pre-flight opportunistic cleanup scans `.feature-flow/handoffs/*.yml` once per session start. Expected handoff count is < 20 in steady state; a single `gh pr view` per handoff is acceptable. If the count grows, batch with `gh pr list --search` and filter locally.
- `git worktree remove` is O(worktree size); no optimization needed.
- Slug hash uses `sha256` truncated to 4 hex chars (16 bits, 65,536 keyspace). Collision probability at 100 active features ≈ 0.076; the `-2` suffix strategy handles the long tail.

### Stack-Specific (feature-flow plugin conventions)

- Skills live under `skills/<name>/SKILL.md` with supporting references under `skills/<name>/references/*.md`.
- All Git + GitHub operations go through the `gh` CLI and `git` binary. No direct GitHub API calls.
- YAML state files use a `schema_version` field for forward-compatible migration.
- `.feature-flow/` is the canonical local-state directory (already used by `.feature-flow/design/`, `.feature-flow/implement/`). `.feature-flow/handoffs/` follows that pattern.

## Migration Requirements

No database or schema migrations. File-level migrations:

1. **Add `.feature-flow/handoffs/` to `.gitignore`.**
2. **Create `docs/plans/README.md`** with the advisory note pointing readers to GitHub issues.
3. **Existing `docs/plans/*.md` files** remain as-is. No movement, no deletion.
4. **Existing open worktrees from pre-cutover sessions** are not automatically migrated. Users finish those branches with the old flow or remove the worktrees manually. The cutover is "at merge" — new sessions after upgrade follow the new flow.

## Acceptance Criteria

### From issue #244 (verbatim)

- [ ] **AC-1.** Step 1 for all four scope templates (Small enhancement standard, Small enhancement fast-track, Feature, Major feature) in `skills/start/references/step-lists.md` is "Worktree setup"
- [ ] **AC-2.** No step list contains a "Commit Planning Artifacts" step
- [ ] **AC-3.** `skills/start/references/inline-steps.md` no longer defines the "Commit Planning Artifacts Step" section
- [ ] **AC-4.** `feature-flow:design-document` updates a GitHub issue body; it does not create files under `docs/plans/`
- [ ] **AC-5.** `feature-flow:design-verification` reads the design from the linked issue (not a file path)
- [ ] **AC-6.** `superpowers:writing-plans` reads the design from the linked issue (not a file path)
- [ ] **AC-7.** Two concurrent `start:` sessions produce non-colliding worktrees, non-colliding feature branches, and zero writes to the base branch's working tree
- [ ] **AC-8.** `Handoff Step` does not run `git worktree remove`
- [ ] **AC-9.** A cleanup mechanism exists for removing worktrees after PR merge (either a new skill, an extension to `merge-prs`, or a documented opportunistic cleanup at session start)
- [ ] **AC-10.** Quick path is unchanged — verify by running `start: fix typo in X` and confirming it bypasses worktree creation and completes in a single commit
- [ ] **AC-11.** No step list references `docs/plans/` as a write target

### Additional ACs implied by this design

- [ ] **AC-12.** Slug generation follows §1.1 exactly: `kebab(first-4-content-words) + '-' + sha256(description + iso_date_utc)[:4]`, with 60-char content cap and `-2`/`-3` collision suffix.
- [ ] **AC-13.** The handoff state file at `.feature-flow/handoffs/pending-<slug>.yml` is created at Worktree setup in the base repo (not the worktree) and survives worktree removal.
- [ ] **AC-14.** The handoff file is renamed to `.feature-flow/handoffs/<pr-number>.yml` at the Commit-and-PR step.
- [ ] **AC-15.** `.feature-flow/handoffs/` is added to `.gitignore`.
- [ ] **AC-16.** The `feature-flow:cleanup-merged` skill exists at `skills/cleanup-merged/SKILL.md`, accepts an optional PR number, scans all handoffs when no argument is given, and performs the six cleanup actions idempotently.
- [ ] **AC-17.** `merge-prs` invokes `cleanup-merged <pr-number>` after a successful merge.
- [ ] **AC-18.** `start:` invokes `cleanup-merged` as an opportunistic pre-flight at session kickoff; no-op announcement is silent, success announcement lists cleaned PRs, failures are non-fatal.
- [ ] **AC-19.** `design-document` merges content between `<!-- feature-flow:design:start -->` / `<!-- feature-flow:design:end -->` markers; appends with markers if absent; falls back to issue comment + reference link when merged body exceeds 65,536 characters.
- [ ] **AC-20.** `create-issue` runs before `design-document` in all non-quick-path step lists (Small enhancement standard + fast-track, Feature, Major feature).
- [ ] **AC-21.** `docs/plans/README.md` exists with the advisory note pointing readers to GitHub issues for active designs.
- [ ] **AC-22.** Handoff-file schema matches §1.3 exactly (fields: `schema_version`, `pr_number`, `pending_slug`, `branch`, `worktree_path`, `base_branch`, `scope`, `issue_number`, `created_at`, `slug`, `feature_flow_version`).

## Rollout & Migration

- **Cutover is at merge of this design's implementation PR.** Sessions started before the cutover finish under the old flow. Sessions started after follow the new flow.
- Existing `docs/plans/*.md` files remain untouched. Do **not** delete or move them.
- `docs/plans/README.md` is added in this PR as an advisory.
- `.feature-flow/handoffs/` is created lazily at first new-flow worktree setup; pre-existing users do not need a manual migration step.
- The `.feature-flow.yml` key `cleanup.delete_remote_branch` (default `true`) is read lazily — users who do not set it get the default.

## Files Likely Touched

Every file below gets a one-line edit summary. The implementation plan decomposes these into tasks.

| File | Change |
|------|--------|
| `skills/start/SKILL.md` | Reorder dispatch to put Worktree setup at step 1; add opportunistic `cleanup-merged` pre-flight; remove `design_doc` path from lifecycle context (replaced with issue number). |
| `skills/start/references/step-lists.md` | Replace all four non-quick step lists per §4 (Small enhancement standard, Small enhancement fast-track, Feature, Major feature). Quick fix unchanged. Remove every "Commit Planning Artifacts" reference. |
| `skills/start/references/inline-steps.md` | Rewrite Worktree-setup step (now step 1, writes pending handoff); delete Commit-Planning-Artifacts step; delete defer-logic fallbacks in Study Existing Patterns, Blockers-and-Resolutions, Design-context, Plan-context; update Commit-and-PR step to rename pending handoff; update Handoff step to not remove worktree. |
| `skills/start/references/yolo-overrides.md` | Remove `design_doc` path references; add marker-contract and handoff-file notes where YOLO short-circuits matter. |
| `skills/design-document/SKILL.md` | Replace file-writing logic with issue-body-merge logic (§2.2); add size-fallback to comment; stop writing to `docs/plans/`. |
| `skills/design-verification/SKILL.md` | Read design content from issue body via `gh issue view --json body`, parsing the marker-bounded section; error if markers are absent. |
| `skills/create-issue/SKILL.md` | Document that this skill always runs before `design-document`; document the marker contract that `design-document` will rely on; ensure issue body is left in a state `design-document` can append to. |
| `skills/merge-prs/SKILL.md` | After successful merge + remote-branch-delete, invoke `feature-flow:cleanup-merged <pr-number>` with failure tolerance. |
| **`skills/cleanup-merged/SKILL.md`** (new) | New skill. Inputs: optional PR number. Behavior: §3.1. Idempotent, best-effort, logs to `.feature-flow/handoffs/.log`. |
| `.gitignore` | Add `.feature-flow/handoffs/`. |
| `docs/plans/README.md` (new, advisory) | Short advisory: historical design docs live here; active designs live in linked GitHub issues under `## Design (feature-flow)`. |
| `tests/start/*` (as fixtures exist) | Update fixtures to assert new step ordering, marker-based issue body, and handoff-file creation. |

## Scope

### Included

- Worktree setup at step 1 for small-enhancement (standard + fast-track), feature, and major-feature scopes.
- Slug algorithm and collision handling.
- Handoff state file schema, lifecycle, and gitignore entry.
- Issue-body merge protocol with HTML-comment markers.
- Size-overflow fallback to issue comment.
- `create-issue` → `design-document` ordering.
- `design-verification` and `writing-plans` read from issue body.
- New `cleanup-merged` skill and integration with `merge-prs` + `start:` pre-flight.
- Removal of `Commit Planning Artifacts` step and defer-logic fallbacks.
- `docs/plans/README.md` advisory.

### Explicitly Excluded

- **Quick path changes.** Quick fix (the 9-step flow in `skills/start/SKILL.md:86–123`) is untouched. No worktree, no issue body edit, no handoff file.
- **Dispatcher unification.** `dispatcher/worktree.py`'s `.dispatcher-worktrees/issue-N` path is untouched.
- **Migration of existing `docs/plans/*.md`.**
- **Webhook-based cleanup.** Pull-based opportunistic cleanup only.
- **GSD handoff behavior changes.**

## Risks & Mitigations

1. **Stale worktree collision.** Slug collision with an existing `.worktrees/<slug>` directory. *Mitigation:* `-2`/`-3` suffix strategy; handoff file records final slug.
2. **Issue body size overflow.** Large designs exceed GitHub's 65,536-char body limit. *Mitigation:* fallback to posting as a comment with a reference link inside markers (§2.2).
3. **Partial cleanup.** Any cleanup action can fail. *Mitigation:* each action is idempotent and best-effort; handoff file is only removed when all actions report success or benign-already-gone; failed handoffs retry on next opportunistic run.
4. **Stale handoff files from old plugin versions.** Users mid-upgrade have handoffs lacking `schema_version` or with `schema_version < 1`. *Mitigation:* `cleanup-merged` logs a warning and skips them; users clean by hand once.
5. **Quick path accidental breakage.** A refactor in `skills/start/SKILL.md` step dispatch may inadvertently route Quick fix through the new worktree-first path. *Mitigation:* AC-10 is an integration test (`start: fix typo in X`), run before merge.
6. **Dispatcher accidental coupling.** `.dispatcher-worktrees/` is an existing path and naming convention. *Mitigation:* explicitly documented as out of scope in the Summary and in `skills/cleanup-merged/SKILL.md` — cleanup-merged never touches `.dispatcher-worktrees/`.
7. **Concurrent issue-body edits.** Two agents editing the same issue body race. *Mitigation:* `gh issue edit` is last-writer-wins; the marker-based merge is resilient to external edits that don't touch the markers; `design-document` fetches the body immediately before writing.
8. **First-run on a branch without base-branch tracking.** `base_branch` field may be hard to determine. *Mitigation:* read from `.feature-flow.yml: default_base_branch`, fall back to `git symbolic-ref refs/remotes/origin/HEAD`. If both fail, cleanup-merged logs a warning and skips the "sync" verification but still removes the worktree.
9. **Hash collision at scale.** 4 hex chars = 65,536 keyspace; ~100 active features has birthday-bound collision probability ~0.076. *Mitigation:* `-2` suffix handles the long tail; the collision failure mode is deterministic, not probabilistic retry.
10. **CWD-safety during cleanup.** `git worktree remove` can remove the CWD out from under the running process. *Mitigation:* cleanup-merged refuses to remove the worktree currently occupied by the process; the opportunistic pre-flight runs from the base repo CWD.

## Out of Scope

- Migrating existing `docs/plans/*.md` content to GitHub issues.
- Unifying `dispatcher/worktree.py`'s `.dispatcher-worktrees/` with `start:`'s `.worktrees/`.
- Changing Quick path or GSD handoff behavior.
- Automated webhook-based cleanup on PR merge.
- Any change to `skills/dispatcher/*`.

## References

- Tracking issue: [#244](https://github.com/paulholstein/feature-flow/issues/244)
- Brainstorming spec: `docs/superpowers/specs/2026-04-23-worktree-first-lifecycle-design.md`
- Current step lists: `skills/start/references/step-lists.md`
- Current inline steps: `skills/start/references/inline-steps.md`
- Current design-document skill: `skills/design-document/SKILL.md`
- Current merge-prs skill: `skills/merge-prs/SKILL.md`
- Dispatcher worktree (out of scope): `dispatcher/worktree.py`
