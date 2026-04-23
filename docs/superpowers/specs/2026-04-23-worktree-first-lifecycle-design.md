# Worktree-First Lifecycle — Design

Tracking issue: #244
Date: 2026-04-23
Scope: major-feature (feature-flow plugin `start:` orchestrator)
Base branch: `main`

## Summary

Three coupled changes to the `start:` lifecycle:

1. **Worktree-first.** Create the isolation worktree at step 1, before brainstorming and design, using a provisional slug derived from the user's `start:` description plus a 4-char hash.
2. **Design-in-issue.** Fold the design document into the GitHub issue body via a marked section, instead of writing `docs/plans/YYYY-MM-DD-*.md` files.
3. **Post-merge cleanup.** Defer worktree/branch/handoff cleanup until after PR merge, driven by a new `feature-flow:cleanup-merged` skill that `merge-prs` invokes when deletion completes successfully.

Applies to: `quick fix`, `small enhancement` (standard + fast-track), `feature`, `major feature`. Quick path and dispatcher `.dispatcher-worktrees` are out of scope.

## Motivation

- The current flow brainstorms and designs on whichever branch the user happened to be on when they ran `start:`. Context files (`.feature-flow/design/`, `.feature-flow/implement/`) are created mid-lifecycle, which forces "defer-then-write" logic.
- Design artifacts are scattered across `docs/plans/` and the issue body, requiring readers to click through to find the authoritative spec.
- Worktrees linger after merge. Users pile up stale `.worktrees/*` directories that they must remove manually.

## Design Decisions (self-answered in YOLO mode)

Each decision answers one of the eight open questions the caller flagged. The issue body already covers everything else.

### 1. Slug generation

Deterministic: `kebab(content_words(description, max=4)) + '-' + hash4(description + iso_date)`.

- **Algorithm.**
  1. Lowercase the description.
  2. Strip characters that are not `[a-z0-9\s\-]`.
  3. Split on whitespace; drop stop words; keep the first **4** remaining content words.
  4. Join with `-`; collapse repeated `-`.
  5. Compute `hash4 = sha256(description + iso_date_utc)[:4]` (hex). The date component is `YYYY-MM-DD` so two `start:` runs on the same feature the same day produce the same slug if rerun inside the session and differ across days — good enough for uniqueness, avoids minute-level churn.
  6. Final slug: `"<content-slug>-<hash4>"`, truncated to **60 characters total** (truncate the content portion, never the hash).
- **Stop words.** Small fixed list: `a, an, the, and, or, but, for, to, of, in, on, with, from, by, as, is, are, was, were, be, been, add, implement, create, build, make, support, feature, feat, fix, update, refactor`. (Action-verb suppression is intentional — "add logout button" → `logout-button-a3f2` rather than `add-logout-a3f2`.) If stop-word filtering leaves fewer than 2 words, back off and keep the original first 4 tokens.
- **Examples.**
  - `start: add a logout button to the header` → `logout-button-header-<hash4>`
  - `start: refactor the billing subscription renewal logic` → `billing-subscription-renewal-logic-<hash4>`
  - `start: :` (pathological empty) → `start-feature-<hash4>` (fallback constant slug).
- **Why a hash suffix.** Two features with similar descriptions ("add logout button", "add logout link") collapse to the same content slug; the hash disambiguates without requiring collision checks against existing worktrees.

### 2. Handoff state file schema

Stored in the **base repo** at `.feature-flow/handoffs/<pr-number>.yml`. The base repo location (not the worktree) is deliberate — the file must survive worktree removal.

Until the PR exists, the file is written as `.feature-flow/handoffs/pending-<slug>.yml` (no PR number yet) and renamed at the "Commit and PR" step. This keeps the filename stable after PR creation and avoids orphan handoffs if the user aborts before a PR.

Schema (YAML):

```yaml
# .feature-flow/handoffs/<pr-number>.yml
schema_version: 1
pr_number: 123               # integer once PR exists; absent for pending handoffs
pending_slug: null           # populated only in pending-<slug>.yml; null/absent after rename
branch: feature/logout-button-a3f2
worktree_path: /abs/path/to/repo/.worktrees/logout-button-a3f2
base_branch: main
scope: feature               # quick-fix|small-enhancement|feature|major-feature
issue_number: 244            # the design issue (present as soon as create-issue runs)
created_at: 2026-04-23T14:07:11Z
slug: logout-button-a3f2
feature_flow_version: 5.0.7  # plugin version that created the handoff
```

Notes:
- No secrets. Safe to commit (gitignored anyway — see below).
- `.feature-flow/handoffs/` is **gitignored**. It's local state, not repo history.
- The `cleanup-merged` skill reads this file by PR number to know what to remove.

### 3. Cleanup skill vs. merge-prs extension

**New dedicated skill: `feature-flow:cleanup-merged`.** `merge-prs` invokes it for each successfully merged PR.

Reasoning:
- Separation of concerns. `merge-prs` is about merging; cleanup is about reclaiming local state.
- The skill is invocable standalone — users can run `cleanup-merged` against an already-merged PR if `merge-prs` was bypassed (e.g., merged via GitHub UI).
- It also runs **opportunistically at the start of every new `start:` session** as a pre-flight step: iterate `.feature-flow/handoffs/*.yml`, and for each handoff whose PR is `MERGED` or `CLOSED` (via `gh pr view --json state`), perform cleanup. This self-heals from skipped merge-prs runs and from CLI crashes mid-cleanup.

Cleanup actions (idempotent, best-effort, non-fatal if anything fails):
1. `git worktree remove <worktree_path> --force` (with CWD-safety guard).
2. `rm -rf <worktree_path>` as a fallback if git reports success but the dir remains.
3. `git branch -D <branch>` (only if merged/closed and not checked out).
4. Delete the remote branch: `git push origin --delete <branch>` (gated by `.feature-flow.yml: cleanup.delete_remote_branch`, default `true`).
5. Remove `.feature-flow/handoffs/<pr-number>.yml`.
6. Log to `.feature-flow/handoffs/.log` (append-only) with timestamp + PR number + outcome.

Failures are announced to the user (`"cleanup: branch deletion failed: <error> — handoff retained for retry"`) and the handoff file is left in place so the next run retries.

### 4. Design content in the issue body — merge strategy

The design-document skill **updates the issue body** by merging content between HTML-comment markers. It does **not** post a comment, and it does **not** replace the user's original summary.

Strategy:
- After `create-issue` runs, the issue body contains the user's brainstorming-derived summary plus whatever `create-issue` templates in.
- `design-document` fetches the current body, then:
  - If the body contains `<!-- feature-flow:design:start -->` ... `<!-- feature-flow:design:end -->`, replace the content between markers.
  - Otherwise, append a new section at the end:
    ```markdown
    <!-- feature-flow:design:start -->
    ## Design (feature-flow)

    <generated design content>

    _Generated by feature-flow design-document on YYYY-MM-DD. Re-running design-document will update this section in place._
    <!-- feature-flow:design:end -->
    ```
- Updates use `gh issue edit <n> --body-file <tempfile>`. The temp file is the full merged body.
- If the merged body exceeds GitHub's 65,536-char issue-body limit, the skill falls back to posting the `## Design` section as a comment and writing a reference link inside the markers: `"Design is too large to inline — see comment: <url>"`. This preserves the invariant that the issue is always the single source of truth.
- The design content inside the markers is the same structured body currently written to `docs/plans/*.md`, minus the filename/date header (issue metadata already provides this).

### 5. Ordering of `create-issue` vs `design-document`

**`create-issue` runs first**, unconditionally, in every non-quick-path scope. `design-document` runs after and edits the issue body.

- Removes the "update existing issue" passthrough branch from step 1. All lifecycles go through `create-issue`, which either creates a new issue or reuses an existing one passed via `--issue <n>` / `issue: <n>` argument.
- Simplifies mental model: "the issue exists before the design is written." This is the ordering the issue body already recommends.
- `design-verification` (in Feature + Major Feature) continues to run between `design-document` and `implementation plan`. It reads the design from the issue body, not from `docs/plans/`.

### 6. Existing `docs/plans/` files

**No migration.** Keep them as historical record. The design-document skill's "format patterns" agent, which currently reads existing `docs/plans/` for structural hints, still reads them (as style examples) but no longer writes to that directory.

An advisory note is added to `docs/plans/README.md` (created if absent): _"Historical design documents. Active designs since 2026-04-23 live in their linked GitHub issue body under the `## Design (feature-flow)` section."_

### 7. New step ordering (per scope)

Worktree becomes step 1 in every non-quick-path scope. All other steps shift but retain their relative order. Mobile platform insertions remain after implementation as before.

**Quick fix (new):**
```
 1. Worktree setup
 2. Copy env files
 3. Understand the problem
 4. Study existing patterns
 5. Implement fix (TDD)
 6. Self-review
 7. Verify acceptance criteria
 8. Sync with base branch
 9. Commit and PR
10. Wait for CI and address reviews
11. Post implementation comment
```
(Quick fix had no worktree step before; this adds one. Aligns the scope with the rest — cleanup runs post-merge like everywhere else.)

**Small enhancement — standard (new):**
```
 1. Worktree setup
 2. Copy env files
 3. Brainstorm requirements
 4. Documentation lookup (Context7)
 5. Create issue
 6. Design document (updates issue body)
 7. Implementation plan
 8. Verify plan criteria
 9. Commit planning artifacts
10. Study existing patterns
11. Implement (TDD)
12. Self-review
13. Code review
14. Generate CHANGELOG entry
15. Final verification
16. Sync with base branch
17. Commit and PR
18. Wait for CI and address reviews
19. Post implementation comment
```

**Small enhancement — fast-track (new):**
```
 1. Worktree setup
 2. Copy env files
 3. Documentation lookup (Context7)
 4. Create issue
 5. Implementation plan
 6. Commit planning artifacts
 7. Study existing patterns
 8. Implement (TDD)
 9. Self-review
10. Code review
11. Generate CHANGELOG entry
12. Final verification
13. Sync with base branch
14. Commit and PR
15. Wait for CI and address reviews
16. Post implementation comment
```

**Feature (new):**
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
10. Commit planning artifacts
11. Study existing patterns
12. Implement (TDD)
13. Self-review
14. Code review
15. Generate CHANGELOG entry
16. Final verification
17. Sync with base branch
18. Commit and PR
19. Wait for CI and address reviews
20. Harden PR
21. Post implementation comment
22. Handoff
```

**Major feature (new):**
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
11. Commit planning artifacts
12. Study existing patterns
13. Implement (TDD)
14. Self-review
15. Code review
16. Generate CHANGELOG entry
17. Final verification
18. Sync with base branch
19. Commit and PR
20. Wait for CI and address reviews
21. Harden PR
22. Post implementation comment
23. Handoff
```

`Commit planning artifacts` (step 9/10/11 depending on scope) now commits `.feature-flow.yml` only. Design docs no longer live in `docs/plans/`, so there are no markdown files to commit from that step; the commit message becomes `"chore: add implementation plan for [feature-name]"` when only `.feature-flow.yml` changes.

### 8. Context file ordering — remove the defer logic

Because the worktree exists from step 1, `.feature-flow/design/` and `.feature-flow/implement/` are created before anything else runs. Every downstream step can write directly to those paths without a "has the worktree been set up yet?" guard.

Concrete removals in `skills/start/references/inline-steps.md`:
- Remove the `"If the file does not exist yet (e.g., worktree was set up without the init step), create it using the template..."` fallback in Study Existing Patterns (line ~189). It becomes a hard requirement: the file must exist; error loudly if it doesn't (indicates a worktree-setup bug).
- Similar fallbacks in other inline steps (blockers-and-resolutions, design context, plan context) get the same treatment.

## Files likely touched

- `skills/start/SKILL.md` — step-list dispatch, new step 1, post-step "cleanup-merged" pre-flight.
- `skills/start/references/step-lists.md` — replace all four scope step lists per §7.
- `skills/start/references/inline-steps.md` — rewrite worktree-setup step; delete defer-logic fallbacks (§8); insert handoff-file writing at worktree setup and at "Commit and PR".
- `skills/design-document/SKILL.md` — replace file-writing logic with issue-body-merge logic; add size-fallback to comment.
- `skills/design-document/references/*` — remove `docs/plans/YYYY-MM-DD-*.md` path references; add marker contract.
- `skills/create-issue/SKILL.md` — ensure it always runs before `design-document`; document the marker contract.
- `skills/merge-prs/SKILL.md` — after successful merge-and-branch-delete, invoke `feature-flow:cleanup-merged <pr>`.
- `skills/cleanup-merged/SKILL.md` — **new skill**. Inputs: PR number. Side effects: worktree removal, branch deletion, handoff file removal.
- `.gitignore` — add `.feature-flow/handoffs/`.
- `docs/plans/README.md` — advisory note pointing readers to GitHub issues.
- `tests/start/*` — update fixtures to assert new ordering and marker-based issue body.

## Risks & edge cases

1. **Stale worktree collision.** If a slug hash collides with an existing `.worktrees/<slug>` directory, the setup step appends `-2` (then `-3`, ...). The handoff file records the final disambiguated slug.
2. **Issue body size.** Large designs may exceed GitHub's 65,536-char limit. Mitigation: fallback to a comment with a reference link between markers (§4).
3. **Partial cleanup.** Cleanup must be idempotent. Any step can fail without corrupting the next attempt; the handoff file is only removed once every step reports success-or-benign-already-gone.
4. **User ran `start:` without the plugin updated mid-feature.** Old handoff files (no schema_version, or schema_version < 1) are ignored by cleanup-merged with a warning. Users clean these up by hand once.
5. **Quick path unchanged.** Quick path takes no worktree. This design does not touch that code path. Acceptance tests must still confirm quick path produces zero worktree, zero issue body edits, zero handoff file.
6. **Dispatcher out of scope.** The dispatcher's `.dispatcher-worktrees/` uses a different lifecycle and is untouched. Docs note this explicitly to prevent accidental expansion of scope.
7. **Issue body racing.** If two agents edit the issue body concurrently, `gh issue edit` is last-writer-wins. Mitigation: design-document fetches the body immediately before writing, and the marker-based merge strategy is resilient to external edits that don't touch the design markers.
8. **First-run on a branch without base-branch tracking.** The handoff's `base_branch` field is written from `.feature-flow.yml: default_base_branch`, falling back to `git symbolic-ref refs/remotes/origin/HEAD`. If both fail, cleanup-merged logs a warning and skips the "sync" verification.
9. **Hash collisions at scale.** 4 hex chars = 65,536 keyspace. With ~100 active worktrees the collision probability is still small. The `-2` suffix strategy from risk #1 handles the long tail.

## Acceptance criteria coverage

The issue lists 11 explicit ACs. This design satisfies all of them:

- AC1 (worktree exists at step 1) — §7, §8, all four scope lists start at "Worktree setup".
- AC2 (provisional slug + 4-char hash) — §1.
- AC3 (design lives in issue body, not `docs/plans/`) — §4, §6.
- AC4 (marker-based merge) — §4.
- AC5 (issue exists before design runs) — §5.
- AC6 (post-merge cleanup removes worktree + branch + handoff) — §3.
- AC7 (cleanup opportunistically runs at start of new `start:` session) — §3.
- AC8 (handoff state file lives in base repo, survives worktree removal) — §2.
- AC9 (quick path untouched) — §7 note; design explicitly excludes quick-path template changes.
- AC10 (dispatcher untouched) — stated explicitly in §Risks and in Summary.
- AC11 (apply to all four scope templates) — §7 provides all four.

No AC is out-of-scope for this design, and nothing in this design goes beyond the AC list.

## Implementation plan entry point

The writing-plans skill should produce a plan that groups changes into four phases:

1. **New skill scaffold** — create `skills/cleanup-merged/SKILL.md` (standalone, testable in isolation).
2. **Step-list rewrite** — update `skills/start/references/step-lists.md` (four scopes) and `inline-steps.md` (worktree first, defer-logic removed). Add handoff-file writing.
3. **Design-in-issue** — rewrite `skills/design-document/SKILL.md`; update `create-issue` ordering; add `.gitignore` + `docs/plans/README.md`.
4. **Cleanup wiring** — wire `merge-prs` to invoke `cleanup-merged`; add start-of-session opportunistic cleanup to `skills/start/SKILL.md` pre-flight.

Each phase is independently testable against the existing `tests/start/` fixtures.
