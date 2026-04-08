# PR Review & Comment Triage — Design Document

**Date:** 2026-04-08
**Status:** Draft
**Issue:** #226
**Scope:** feature
**Depends on:** #224 (closed — `references/best-effort-remediation.md` already exists)

## Overview

Replace the current binary `CHANGES_REQUESTED` skip in `skills/merge-prs/SKILL.md:89` with a pre-merge triage step that fetches all three feedback surfaces (inline review comments, discussion comments, formal reviews), filters stale/resolved/self-reply threads, classifies each unresolved thread into one of six categories (question, nit, suggestion, blocker, praise, unclear), and makes a best-effort attempt to address each addressable thread — applying fixes, posting replies tied to fix commits, and skipping the PR only when a blocker cannot be fixed or an unclear thread remains. A new specialization file `references/review-triage.md` mirrors `references/ci-remediation.md` and imports the shared bounded-attempt pattern from `references/best-effort-remediation.md`.

## Example

**Input:** PR #N has three unresolved threads:
1. Reviewer `@alice` on `src/api/handler.ts:42`: *"this will crash on empty input — needs a null check"* (inline, unresolved)
2. Reviewer `@bob` on the PR discussion: *"nit: typo in the CHANGELOG entry — 'recieve' → 'receive'"* (discussion)
3. Reviewer `@carol` on `src/utils/parse.ts:17`: a ` ```suggestion ` block replacing `str.split(',')` with `str.split(/,\s*/)` (inline, unresolved)

**Output (YOLO mode):**

```
YOLO: ship — Review triage for PR #N (attempt 1/1, budget 00:00/10:00)
  Threads fetched: 3 unresolved (0 filtered stale)
  Classified: blocker(1), nit(1), suggestion(1)
  → Applied: null check src/api/handler.ts:42 (blocker from @alice)
  → Applied: CHANGELOG typo fix (nit from @bob)
  → Applied: suggestion src/utils/parse.ts:17 (from @carol)
  → Committed: fix: address review comments by @alice, @bob, @carol
  → Pushed. Replied to 3 threads with fix commit sha abc1234.
  → Re-review comment posted: @alice @bob @carol addressed 3 review comments in abc1234. Ready for re-review.
  → Triage complete after 01:47. Proceeding to CI check.
```

## User Flow

### Step 1 — Fetch all feedback surfaces

Inside `SKILL.md` Step 4a (pre-merge checks), extend the existing parallel `gh` call block to also fetch:

1. **GraphQL `reviewThreads`** via `gh api graphql` — single query that returns all threads with `id`, `isResolved`, `isOutdated`, `path`, `line`, `originalLine`, and nested `comments { id, databaseId, author { login }, body, createdAt, diffHunk, line, originalLine }`. This is the canonical fetch — REST `pulls/N/comments` does not expose `isResolved`.
2. **Discussion comments** via `gh api repos/{owner}/{repo}/issues/{n}/comments` — flat list of general PR conversation comments (not anchored to files).
3. **Current actor** via `gh api user --jq .login` — cached once per batch, used for the self-reply filter.

The existing `gh pr view ... --json reviews` call already fetches formal review states; keep it.

### Step 2 — Filter stale and irrelevant threads

Apply four filters in order to every fetched thread:

1. **Outdated** — `isOutdated == true` → drop.
2. **Resolved** — `isResolved == true` → drop.
3. **Self-reply** — any comment whose `author.login == <current_actor>` → drop the comment. If after dropping the thread has no non-self comments, drop the thread.
4. **Addressed by later approval** — if the most recent review by a reviewer is `APPROVED` and its `submittedAt` is after the thread's last comment by that reviewer, drop the thread (assumed addressed).

For discussion comments: apply filters 3 and 4 only (no `isOutdated`/`isResolved` concept).

### Step 3 — Classify each unresolved thread

Assign exactly one category per thread using priority-ordered heuristics. Priority order (top wins when multiple match):

| Priority | Category | Detection pattern |
|----------|----------|-------------------|
| 1 | `blocker` | Comment contains `must`, `will crash`, `security`, `broken`, `blocker`, `vulnerability`, OR is anchored to a `CHANGES_REQUESTED` formal review |
| 2 | `suggestion` | Comment body contains a ` ```suggestion ` fenced block |
| 3 | `nit` | Comment starts with `nit:`, `style:`, `minor:`, or is purely about formatting (`indent`, `whitespace`, `semicolon`) |
| 4 | `question` | Comment ends with `?` OR starts with `why`, `what`, `how`, `when`, `is this`, `should` (case-insensitive) |
| 5 | `praise` | Comment body matches `lgtm`, `looks good`, `nice`, `approved`, `👍` (and nothing else substantive) |
| 6 | `unclear` | None of the above — conservative fallback |

A comment matching "nit: this will crash on empty input" wins under `blocker` — the safety keyword `crash` takes priority regardless of the `nit:` prefix.

### Step 4 — Apply category-specific action

For each classified thread, dispatch to the fix strategy for its category (see `references/review-triage.md § Fix Strategies Per Category`). Actions:

- **question** — Generate a context-aware reply by reading the source file and answering. Post via `gh api ... -F in_reply_to=<comment_id>`.
- **nit** — If the fix is obvious from the comment body (e.g., typo replacement, missing semicolon), apply via `Edit`. Reply `"Addressed in <sha>: <summary>"`.
- **suggestion** — Parse the ` ```suggestion ` block, read the file at `line` (or `start_line..line` for multi-line), replace exactly, stage. Reply `"Applied suggestion in <sha>"`.
- **blocker** — Read the source file and line, attempt a minimal targeted fix based on the comment intent. If the fix is ambiguous or patch fails, do NOT mark addressed. Reply only on successful fix.
- **praise** — No reply, no action. Internal state marks thread "acknowledged".
- **unclear** — Do not attempt. Record for mode-aware handling in Step 6.

### Step 5 — Commit, push, reply

Group applied fixes by `(reviewer, file)` tuple and create one commit per tuple with message `fix: address review comment by @<reviewer> on <file>:<line>` (or a multi-line body listing each thread when batching 2+ per commit). Push all commits. After push, post a reply to each addressed thread using `gh api ... -F in_reply_to=<comment_id> -f body="Addressed in <sha>. <summary>"`. If any blockers were fixed, post a single summary re-review comment via `gh pr comment N --body "@<reviewer1> @<reviewer2> addressed N review comments in latest commits: ..."`.

### Step 6 — Handle unresolved and exit

If any blocker thread could not be fixed OR any thread remains `unclear`:
- **YOLO:** Skip PR with reason `N unresolved review threads: <summary>`.
- **Express:** Pause via `AskUserQuestion` — options: "Address manually", "Skip PR", "Proceed anyway (override)".
- **Interactive:** Pause via `AskUserQuestion` per thread.

If all threads are addressed or benign (question/nit/suggestion/praise all handled):
- **If `merge.wait_for_rereview: false` (default):** Exit triage, proceed to CI check immediately.
- **If `merge.wait_for_rereview: true`:** Poll `gh pr view --json reviews` every 60s for up to 10 minutes waiting for APPROVED or CHANGES_REQUESTED state change. On APPROVED → proceed. On CHANGES_REQUESTED → skip PR. On timeout → proceed (trust the fix).

## Mode Behavior

| Mode | Questions | Nits / Suggestions | Blockers | Unclear |
|------|-----------|--------------------|----------|---------|
| **YOLO** | Auto-reply + announce | Auto-fix + reply + announce | Attempt fix; skip if unfixable | Skip PR |
| **Express** | Confirm first reply per category, then auto | Confirm first fix per category, then auto | Confirm each fix | Pause via `AskUserQuestion` |
| **Interactive** | Confirm each reply (show generated text) | Confirm each fix (show diff) | Confirm each fix (show diff) | Pause via `AskUserQuestion` |

**Safety invariant (all modes):** A blocker that cannot be auto-fixed ALWAYS pauses or skips — never merged over. An `unclear` thread ALWAYS pauses in Express/Interactive and skips in YOLO.

Announcement format (all modes — extends the shared template from `best-effort-remediation.md`):

```
<mode>: ship — Review triage for PR #<N> (attempt 1/1, budget <mm:ss>/10:00)
  Threads fetched: <N> unresolved (<M> filtered stale)
  Classified: <category>(<count>), ...
  → <action taken per thread>
  → <commit/push/reply result>
  → <triage complete | skip reason>
```

## Shared Infrastructure

### Reuse of `references/best-effort-remediation.md` (existing)

Issue #224 already created this file. Review triage is the **second consumer** (after CI remediation) and uses the same sections:

1. **Attempt loop skeleton** — parameterized with `MAX_ATTEMPTS=1`, `MAX_WALL_CLOCK=10min`. Single-pass: one classification + one batch of fixes per PR. No polling cycle (unlike CI which polls for test reruns).
2. **Mode-aware escalation contract** — YOLO auto, Express confirm-first-then-auto, Interactive confirm-each. Already defined abstractly; review triage plugs in its own confirmation prompts.
3. **Announcement format templates** — `<mode>: ship — <operation> for PR #<N> (attempt <k>/<MAX>, budget <mm:ss>/<MAX>)` with sub-bullets.
4. **Decision table: skip vs pause vs escalate** — applies directly: blocker-unfixable → skip (YOLO) or pause (Express/Interactive); unclear → skip (YOLO) or pause; GitHub 5xx → retry once then skip.
5. **Wall-clock tracking guidance** — start timestamp at triage entry, check before each `gh api` call.

### `references/review-triage.md` (new, review-specific)

Imports the shared pattern and specializes it for PR review handling. Sections (mirroring `ci-remediation.md` layout):

1. **Overview** — Single-pass bounded triage: `MAX_ATTEMPTS=1`, `MAX_WALL_CLOCK=10min`, no polling. Reference back to `best-effort-remediation.md` for the skeleton.
2. **Fetch commands** — the three parallel `gh` calls: GraphQL `reviewThreads` (with the full query text), REST `issues/N/comments`, cached `gh api user`. Includes exact GraphQL query string.
3. **Thread filtering rules** — the four filters (outdated, resolved, self-reply, addressed-by-approval) with exact field references.
4. **Classification heuristics table** — 6 rows ordered by priority: blocker, suggestion, nit, question, praise, unclear. Each row lists detection pattern and example comment snippet.
5. **Fix strategies per category** — one table per category with: action description, GitHub API reply endpoint, commit behavior, example.
6. **Suggestion block parser** — exact syntax for extracting ` ```suggestion ` fenced blocks from comment body; line-range handling for multi-line suggestions (using `start_line` field).
7. **Reply templates** — canonical reply strings per category (with `<sha>`, `<summary>`, `<reviewer>` placeholders).
8. **Commit message contract** — `fix: address review comment by @<reviewer> on <file>:<line>` (one-liner for single-thread commits) or multi-line body listing each thread when batching 2+.
9. **Re-review comment template** — `@<reviewer> addressed N review comments in <sha>: [bullet list]. Ready for re-review.`
10. **`wait_for_rereview` polling behavior** — when `merge.wait_for_rereview: true`, poll interval and exit conditions.
11. **Reference back to shared file** — explicit "See `references/best-effort-remediation.md` for the attempt loop skeleton and mode escalation contract. This file specializes only the review-specific portions."

## Patterns & Constraints

### Error Handling

- **`gh api` failures** (non-zero exit, network error, 5xx, rate limit): retry once after 5 seconds. If still failing, log and skip the thread — do not crash the triage. If GraphQL query fails entirely, skip the PR with reason `"review fetch failed"`.
- **Patch apply failures** (suggestion block doesn't apply cleanly): retry once with relaxed context (3-way merge equivalent). If still failing, mark the thread unfixable and fall through to Step 6.
- **Git push rejection** (non-fast-forward): fetch + rebase once, re-push. If still rejected, skip PR with reason.
- **Self-reply loop prevention**: filter 3 (self-reply) is enforced BEFORE classification so merge-prs never sees its own past replies as new threads.
- **Reply post failure**: if `gh api ... in_reply_to` fails, the commit is already pushed — log the failure but do NOT rollback. The fix stands; the reviewer will see the commit in the normal GitHub UI.
- Project preference (`.feature-flow.yml design_preferences.error_handling: exceptions`): this is a prompt-instruction Markdown change — no executable code added.

### Types (schema narrowness)

- Category enum: closed literal set `blocker | suggestion | nit | question | praise | unclear` — not arbitrary strings.
- `merge.wait_for_rereview`: boolean, default `false`.
- Thread filter conditions are documented as boolean predicates against specific field names (`isOutdated`, `isResolved`, `author.login`, `submittedAt`) — no free-form text matching on thread metadata.
- Comment classification uses regex/substring heuristics applied in priority order — the output is exactly one category label per thread.

### Performance

- Wall-clock budget enforced at triage entry and before each `gh api` call (fetch, reply, re-review comment).
- Thread fetch uses a single GraphQL call to retrieve all review threads in one round-trip (vs. N REST calls for each thread).
- Classification is purely local string matching — no network calls during the classification loop.
- Fix application is sequential per thread (no parallelism across threads within one PR). Keeps git history clean and replies attributable.
- Batch commit grouping (`reviewer + file` tuple) minimizes commit count while preserving attribution.
- Re-review comment is a single `gh pr comment` call regardless of how many threads were addressed.

### Stack-Specific

- **Feature-flow skill file conventions** (from `references/ci-remediation.md`, `references/conflict-resolution.md`, `references/best-effort-remediation.md`):
  - Reference files start with: *"Reference file for the `merge-prs` skill. Read this file when ..."*
  - Tables use pipe syntax with a header-separator row.
  - Announce formats are backtick-wrapped and prefixed with mode (`YOLO:`, `Express:`, `Interactive:`).
  - Mode behavior uses a consistent column structure (YOLO | Express | Interactive).
  - Specialization files end with a "Reference Back to Shared File" section.
- **`.feature-flow.yml` comment style** (from existing `merge:` block at lines 24-29, ci_remediation block at lines 30-33): hash-comment block with `# field: value   # <type> (default: <value>)` format — `wait_for_rereview` must match this style.
- **Commit messages**: `fix: address review comment by @<reviewer> on <file>:<line>` — conforms to conventional-commits. Note the **`fix:`** prefix (no scope suffix) to distinguish from `fix(ci):` used by ci-remediation.
- **GraphQL query embedding**: multi-line heredoc style used by `gh api graphql -f query='...'` — the full query string will be quoted as a single argument in the reference file.

## Files to Modify / Create

### Create

1. **`skills/merge-prs/references/review-triage.md`** — review-specific specialization of the shared bounded-attempt pattern. Sections: Overview, Fetch Commands (with GraphQL query), Thread Filtering Rules, Classification Heuristics, Fix Strategies Per Category, Suggestion Block Parser, Reply Templates, Commit Message Contract, Re-Review Comment Template, `wait_for_rereview` Polling, Reference Back to Shared File.

### Modify

2. **`skills/merge-prs/SKILL.md` Step 4a pre-merge checks block (lines 80-89)** — extend the existing `gh pr view` call with parallel fetches for GraphQL reviewThreads, discussion comments, and current actor. Replace line 89 (`CHANGES_REQUESTED` binary skip) with:
   > If any unresolved review threads, discussion comments, or formal reviews exist: read `references/review-triage.md` and enter the single-pass triage flow. Review triage runs **before** the CI remediation loop so that any fix commits trigger a fresh CI run which `ci-remediation.md` can then handle. Skip the PR only if an unfixable blocker remains or (in YOLO) an unclear thread is found.

3. **`skills/merge-prs/SKILL.md` error recovery table** (current line 263 `Unresolved review requests | Skip with reason`) — replace with:
   > | Unresolved review requests | Enter bounded review triage loop (see `references/review-triage.md`). Skip only if blockers cannot be fixed or (in YOLO) unclear threads remain. |

4. **`.feature-flow.yml` comment block (lines 24-33)** — extend the existing `merge:` commented-example block with a new `wait_for_rereview` field:

   ```yaml
   # merge:                       # Optional: Ship phase merge configuration (all fields have defaults)
   # strategy: squash             # squash | merge | rebase (default: squash)
   # delete_branch: true          # delete branch after merge (default: true)
   # require_ci: true             # require CI green before merge (default: true)
   # require_review: true         # require approved review before merge (default: true)
   # auto_discover: label         # label | body_marker | both (default: label)
   # wait_for_rereview: false     # Wait for re-approval after auto-fixing review comments (default: false; see references/review-triage.md)
   # ci_remediation:                       # Bounded CI failure remediation loop (see skills/merge-prs/references/ci-remediation.md)
   #   max_attempts: 3                     # integer >= 1 (default: 3)
   #   max_wall_clock_minutes: 10          # integer >= 1 (default: 10)
   #   ci_poll_interval_seconds: 30        # integer >= 10 (default: 30; GitHub API rate-limit safe floor)
   ```

## Scope

### Included

- Single-pass bounded triage loop (`MAX_ATTEMPTS=1`, `MAX_WALL_CLOCK=10min`, no polling cycle).
- Three-surface fetch: GraphQL reviewThreads, REST issues/N/comments, cached current actor.
- Four-stage thread filter: outdated, resolved, self-reply, addressed-by-approval.
- Six classification categories with priority-ordered heuristics: blocker > suggestion > nit > question > praise > unclear.
- Per-category fix strategies: generate reply (question), apply obvious fix (nit), parse+apply ` ```suggestion ` blocks (suggestion), attempt targeted fix (blocker), no-op (praise), escalate (unclear).
- Commit message contract `fix: address review comment by @<reviewer> on <file>:<line>`.
- Re-review comment with `@`-mentions summarizing addressed threads.
- Mode-aware escalation: YOLO auto-fix-or-skip, Express confirm-first-per-category, Interactive confirm-each.
- New optional config `merge.wait_for_rereview` (default `false`).
- Integration into existing `SKILL.md` Step 4a **before** the CI remediation loop — review fixes trigger fresh CI which ci-remediation then handles.
- Reuse of `references/best-effort-remediation.md` as the loop skeleton source (no modification).

### Explicitly Excluded

- **Sibling issue #225** (merge conflict ladder) — that continues to reference `best-effort-remediation.md` independently; this issue does not touch `conflict-resolution.md`.
- **Formal review submission via `gh pr review`** — merge-prs does not submit reviews of its own; it only replies to existing threads and posts PR-level comments.
- **Semantic code understanding for blocker fixes** — the fix strategy for blockers is minimal targeted patching based on the comment text and the anchored line. Complex refactors are out of scope → skip as unfixable.
- **Thread resolution via GraphQL mutation** (`resolveReviewThread`) — merge-prs posts replies but does NOT mark threads resolved. Reviewers resolve threads themselves after verification. This is a deliberate choice: resolving on behalf of the reviewer removes their agency.
- **Known-reviewer allowlists/blocklists** — every reviewer's feedback is triaged with the same logic regardless of identity.
- **Custom reply templates in `.feature-flow.yml`** — reply templates are fixed in `review-triage.md`. User customization deferred to a future issue.
- **Cross-PR deduplication** — if two PRs have the same reviewer leaving the same comment, each is triaged independently.
- **Executable code changes** — pure prompt-instruction (Markdown + YAML comment) change. No Python, TypeScript, or test file is added.
- **Implementation of the loop itself as a new tool** — the loop is executed by Claude following the Markdown instructions, not as a hook or sub-agent.
- **Multi-attempt polling for CI-like retry** — review triage is a single-pass operation; unlike ci-remediation there is no "wait and re-check" loop.
- **Batch LLM classification** — classification uses deterministic string matching, not an LLM call per thread (keeps triage fast and predictable).

## Migration Requirements

1. New optional YAML schema key `merge.wait_for_rereview` (boolean, default `false`). Existing `.feature-flow.yml` files without this block continue to work unchanged — no migration required.
2. `skills/merge-prs/SKILL.md` gains one new reference-file dependency (`references/review-triage.md`). Any skill bundler or plugin packaging must include this file alongside `SKILL.md` and the existing `references/*.md` siblings.
3. `skills/merge-prs/references/best-effort-remediation.md` "Current consumers" section should be updated to mark review triage as present (currently listed as "future").
4. No database, no runtime config state, no Python/TS type changes.
