# PR Review Triage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the binary `CHANGES_REQUESTED` skip in `skills/merge-prs/SKILL.md:89` with a single-pass triage flow that fetches inline review comments, discussion comments, and formal reviews; classifies each unresolved thread into one of 6 categories (blocker/suggestion/nit/question/praise/unclear); attempts best-effort remediation; and replies to threads with fix commit attribution.

**Architecture:** Create `skills/merge-prs/references/review-triage.md` as the review-specific specialization of the shared `best-effort-remediation.md` pattern (mirrors `ci-remediation.md` structure). Then wire it into `SKILL.md` Step 4a (parallel fetch extension + triage flow replacing the binary skip), update the error recovery table row for "Unresolved review requests", extend `.feature-flow.yml` with the new `merge.wait_for_rereview` config field, and mark review triage as a current consumer in `best-effort-remediation.md`.

**Tech Stack:** Markdown only — no executable code, no Python/TS, no test files. All changes are prompt-instruction documents consumed by Claude at runtime.

**Design doc:** `docs/plans/2026-04-08-merge-prs-review-triage.md`

**Depends on:** Issue #224 (closed). Confirmed: `skills/merge-prs/references/best-effort-remediation.md` exists and contains the shared attempt loop skeleton and mode escalation contract.

---

## Conventions to Know Before Starting

1. **Reference file header sentence** — every file in `skills/merge-prs/references/` starts with exactly one sentence in the form:
   `Reference file for the \`merge-prs\` skill. Read this file when <condition>.`
   See `skills/merge-prs/references/ci-remediation.md:3` for the closest sibling example.

2. **Reference file section layout** — specialization files follow this section order (as established by `ci-remediation.md`):
   Overview → Detection/Fetch → Classification → Fix Strategies Per Category → Commit Message Contract → Verify/Polling → Reference Back to Shared File.

3. **Table style** — pipe syntax with a header-separator row. Column names are Title-cased.

4. **Announce format** — backtick-wrapped literal output strings, mode-prefixed (`YOLO:`, `Express:`, `Interactive:`).

5. **`.feature-flow.yml` comment style** — hash-comments with `# field: value   # <type> (default: <value>)` alignment. See lines 24-33 of `.feature-flow.yml` for the exact indentation and spacing to match.

6. **SKILL.md current text at line 89** (the binary `CHANGES_REQUESTED` skip that this plan replaces):
   `- If \`reviews\` has any \`CHANGES_REQUESTED\` state: flag to user, skip PR. Announce reason.`

7. **SKILL.md current error recovery row for reviews** (approximately line 263):
   `| Unresolved review requests | Skip with reason |`

8. **`best-effort-remediation.md` "Current consumers" list** (lines 11-14 currently) still lists review triage as "future" — this plan updates it.

9. **Paths in this plan are relative** (e.g. `skills/merge-prs/references/review-triage.md`) and work from either the main repo root OR a worktree root.

---

### Task 1: Create `skills/merge-prs/references/review-triage.md`

**Files:**
- Create: `skills/merge-prs/references/review-triage.md`

**Step 1: Verify the references directory exists**

Run:
```bash
ls skills/merge-prs/references/
```
Expected: see `best-effort-remediation.md`, `ci-remediation.md`, `conflict-resolution.md`, `dependency-analysis.md`, `CLAUDE.md`. If `best-effort-remediation.md` is missing, STOP — dependency #224 is not in place.

**Step 2: Write the file**

Create `skills/merge-prs/references/review-triage.md` with exactly this content:

````markdown
# Review Triage

Reference file for the `merge-prs` skill. Read this file when a PR has any unresolved inline review comments, discussion comments, or `CHANGES_REQUESTED` formal reviews — enter the single-pass triage flow described here.

See `references/best-effort-remediation.md` for the attempt loop skeleton and mode escalation contract. This file specializes only the review-triage-specific portions.

---

## Overview

When the pre-merge fetch in `SKILL.md` Step 4a returns any unresolved review threads or discussion comments, do not skip the PR without attempting remediation. Instead, enter the single-pass triage flow:

- **MAX_ATTEMPTS:** 1 (review triage is atomic per PR — one classify + fix + reply pass)
- **MAX_WALL_CLOCK:** 10 minutes (overridable — shares the same budget semantics as the shared skeleton)
- **POLL_INTERVAL:** not applicable (no polling cycle; unlike ci-remediation there is no "wait for tests to rerun" step)

Fetch all three feedback surfaces in parallel, filter stale/resolved/self-reply threads, classify each remaining thread into exactly one category, dispatch to the matching fix strategy, commit and push all fixes in per-(reviewer, file) groups, post replies tying each thread to its fix commit, and post a single re-review comment if any blockers were addressed.

---

## Fetch Commands

Three parallel `gh` calls gather all feedback surfaces:

**1. Review threads with resolution state (GraphQL — canonical):**

```bash
gh api graphql -F owner=<owner> -F name=<repo> -F number=<pr> -f query='
  query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            originalLine
            startLine
            comments(first: 50) {
              nodes {
                id
                databaseId
                author { login }
                body
                createdAt
                diffHunk
                line
                originalLine
                path
              }
            }
          }
        }
      }
    }
  }
'
```

REST `repos/.../pulls/N/comments` does NOT expose `isResolved` or `isOutdated` — always use the GraphQL query above.

**2. Discussion comments (REST — flat list, not anchored to files):**

```bash
gh api "repos/<owner>/<repo>/issues/<pr>/comments"
```

**3. Current actor (cached once per batch — used for self-reply filter):**

```bash
gh api user --jq .login
```

The existing `gh pr view ... --json reviews` call (already in Step 4a) continues to fetch formal review states. Keep it — do not remove it.

---

## Thread Filtering Rules

Apply these four filters in order to every fetched thread. A thread that matches any filter is dropped from classification.

| Filter | Condition | Applies To |
|--------|-----------|------------|
| **Outdated** | `isOutdated == true` in the GraphQL result | reviewThreads only (discussion comments have no `isOutdated` field) |
| **Resolved** | `isResolved == true` in the GraphQL result | reviewThreads only |
| **Self-reply** | All comments in the thread have `author.login == <current_actor>` — the current actor login is fetched once at Step 4a entry and cached for the batch | reviewThreads AND discussion comments |
| **Addressed by later approval** | The most recent formal review by the thread's original commenter is `APPROVED` AND that review's `submittedAt` is after the thread's most recent comment by that reviewer | reviewThreads AND discussion comments |

**Self-reply rule detail:** If a thread contains a mix of self-replies AND non-self comments, drop only the self-reply comments and keep the thread. If after dropping self-replies the thread has no remaining comments, drop the thread entirely. This prevents merge-prs from re-processing its own past fix replies as new feedback.

**Stale line filter:** Any reviewThread whose `line` field is `null` in the GraphQL result is treated as outdated (the anchor line no longer exists in the current file) and dropped.

---

## Classification Heuristics

Assign exactly one category per surviving thread. Apply rules top-to-bottom — **the first matching row wins**. Priority order is safety-first: a comment containing "crash" prefixed with "nit:" is still a `blocker`.

| Priority | Category | Detection pattern | Example |
|----------|----------|-------------------|---------|
| 1 | `blocker` | Comment body (case-insensitive) contains any of: `must`, `will crash`, `security`, `broken`, `blocker`, `vulnerability`, `data loss`, `exploit` — OR the thread is anchored to a formal review with `state == "CHANGES_REQUESTED"` | `"this will crash on empty input — needs a null check"` |
| 2 | `suggestion` | Comment body contains a ` ```suggestion ` fenced code block | Contains `` ```suggestion\nstr.split(/,\s*/)\n``` `` |
| 3 | `nit` | Comment starts with (case-insensitive) `nit:`, `style:`, `minor:`, `typo:`, `small:` — OR is purely about formatting (`indent`, `whitespace`, `semicolon`, `trailing comma`) | `"nit: typo — 'recieve' → 'receive'"` |
| 4 | `question` | Comment body ends with `?` OR starts with (case-insensitive) `why`, `what`, `how`, `when`, `is this`, `should`, `could` | `"why is this cast needed here?"` |
| 5 | `praise` | Comment body (trimmed, case-insensitive) matches one of: `lgtm`, `looks good`, `nice`, `approved`, `👍`, `:+1:`, `ship it` — and contains nothing else substantive | `"lgtm 👍"` |
| 6 | `unclear` | None of the above — conservative fallback | *(anything not matching rows 1-5)* |

**Assignment rule:** Each surviving thread gets exactly one category. The priority order is fixed — a comment matching multiple patterns takes the highest-priority (lowest row number) match.

---

## Fix Strategies Per Category

| Category | Action | GitHub API call | Commit behavior |
|----------|--------|------------------|-----------------|
| `blocker` | Read the source file and anchor line from `path` + `line`. Understand the comment intent. Apply a minimal targeted fix via `Edit`. If the fix is ambiguous, the patch fails to apply, or the intent cannot be determined from the comment + code context alone, mark the thread **unfixable** and fall through to mode-aware escalation. Do not refactor beyond the exact concern raised. | `POST repos/{owner}/{repo}/pulls/{pr}/comments` with `-F in_reply_to=<databaseId>` and `-f body="Addressed in <sha>. <summary>"` | Commit with `fix: address review comment by @<reviewer> on <file>:<line>` |
| `suggestion` | Parse the ` ```suggestion ` fenced block from comment body (may be single-line or multi-line). Read the file at `line` (single-line) or `startLine..line` (multi-line). Replace exactly. If patch apply fails, retry once with 3-way merge semantics. If still failing, mark unfixable. | Same as blocker (`in_reply_to` on the inline comment) with body `"Applied suggestion in <sha>"` | Commit with `fix: apply suggestion from @<reviewer> on <file>:<line>` |
| `nit` | If the fix is obvious from the comment body (e.g., typo replacement with explicit before/after, missing semicolon, obvious formatting), apply via `Edit`. If the fix is not obvious from the comment body alone, mark unfixable and fall through. Do NOT guess. | Same as blocker (`in_reply_to` on the inline comment) with body `"Addressed in <sha>: <summary>"` | Commit with `fix: address nit from @<reviewer> on <file>:<line>` |
| `question` | Read the source file at the anchor line (if inline) or read the PR summary/relevant files (if discussion). Generate a context-aware answer based on the code. Post as reply — no code change, no commit. | For inline: `POST repos/{owner}/{repo}/pulls/{pr}/comments` with `in_reply_to=<databaseId>`. For discussion: `gh pr comment <pr> --body "<answer>"`. | No commit (reply-only) |
| `praise` | No action. No reply. Record internally as "acknowledged". Does not block merge. | None | None |
| `unclear` | Do not attempt to auto-resolve. Fall through to mode-aware escalation in Step 6. | None | None |

**Suggestion block parser:** Extract content between ` ```suggestion ` and ` ``` ` fences. Multi-line suggestions are delimited by `start_line` (first line to replace) and `line` (last line to replace) fields in the GraphQL result. Single-line suggestions use `line` only.

**Reply endpoint selection:**
- Inline review thread (has `path` and `line`): `POST repos/{owner}/{repo}/pulls/{pr}/comments` with `in_reply_to=<databaseId>` (integer — use `-F` not `-f`)
- Discussion comment (no `path`): `gh pr comment <pr> --body "..."` (PR-level comment)
- Formal review ack (when replying to a review body, not an inline comment): `gh pr review <pr> --comment --body "..."`

**Identifier rule:** When calling `in_reply_to`, use the integer `databaseId` field from the GraphQL comment node — NOT the string `id` (GraphQL global node ID). The REST reply endpoint requires the integer database ID.

---

## Commit Grouping and Message Contract

**Grouping rule:** Group applied fixes by `(reviewer, file)` tuple. One commit per tuple. This keeps git log attributable per reviewer and per touched file.

**Single-thread commit format:**
```
fix: address review comment by @<reviewer> on <file>:<line>
```

**Multi-thread commit format (2+ threads in same (reviewer, file) group):**
```
fix: address review comments by @<reviewer>

- <file>:<line> — <brief summary of fix>
- <file>:<line> — <brief summary of fix>
```

**Rule:** Use the `fix:` prefix (no scope suffix) to distinguish from `fix(ci):` used by ci-remediation. The `fix:` prefix alone signals "review feedback addressed".

**Examples:**
```
fix: address review comment by @alice on src/api/handler.ts:42
```

```
fix: apply suggestion from @carol on src/utils/parse.ts:17
```

```
fix: address review comments by @alice

- src/api/handler.ts:42 — added null check for empty input
- src/api/handler.ts:58 — added error return path for parse failure
```

---

## Reply Templates

Use these exact templates. Replace placeholders in `<angle brackets>`.

**Fix applied (blocker, suggestion, nit — inline reply via `in_reply_to`):**
```
Addressed in <sha>. <one-line summary of what was changed>
```

**Suggestion applied (specialization of above):**
```
Applied suggestion in <sha>.
```

**Question answer (context-aware — generated from code; no fixed template):**
Generate a concise, factual answer based on reading the anchored file and line. Keep it under 3 sentences. Do not speculate — if the answer isn't clear from the code, classify as `unclear` instead.

**Praise (no reply posted — internal acknowledgement only):**
*(none)*

**Re-review summary comment (posted once per PR if any blockers were addressed):**

```bash
gh pr comment <pr> --body "@<reviewer1> @<reviewer2> addressed N review comments in latest commits:
- <file>:<line> — <brief fix summary>
- <file>:<line> — <brief fix summary>

Ready for re-review."
```

The reviewers in the `@mention` list are the union of all reviewers whose blocker threads were addressed. Do NOT `@`-mention reviewers whose only contributions were praise, addressed-question replies, or addressed-nit replies — those are already handled by the inline thread replies.

---

## Mode Behavior

See `references/best-effort-remediation.md § Mode-Aware Escalation Contract` for the base contract. Review-triage specifics:

| Mode | Questions | Nits / Suggestions | Blockers | Unclear |
|------|-----------|--------------------|----------|---------|
| **YOLO** | Auto-generate reply + announce | Auto-fix + reply + announce | Attempt fix; if unfixable → skip PR | Skip PR (reason: `N unclear review threads require manual triage`) |
| **Express** | Confirm first reply per category via `AskUserQuestion` (show generated text), then auto for rest | Confirm first fix per category (show diff), then auto for rest | Confirm each fix via `AskUserQuestion` (show diff) | Pause via `AskUserQuestion` — options: "Address manually", "Skip PR", "Proceed anyway (override)" |
| **Interactive** | Confirm each reply (show generated text per thread) | Confirm each fix (show diff per thread) | Confirm each fix (show diff per thread) | Pause via `AskUserQuestion` per thread |

**Safety invariant (all modes):** A blocker that cannot be auto-fixed ALWAYS pauses (Express/Interactive) or skips (YOLO) — it is NEVER merged over. An `unclear` thread ALWAYS pauses (Express/Interactive) or skips (YOLO).

---

## `wait_for_rereview` Polling Behavior

Read `.feature-flow.yml` `merge.wait_for_rereview` (default: `false`).

**When `false` (default):** After posting fix replies and the re-review comment, proceed immediately to the CI check step. Do not wait for the reviewer to respond. Trust the fix.

**When `true`:** After posting the re-review comment, poll `gh pr view <pr> --json reviews --jq '.reviews[-1]'` every 60 seconds for up to 10 minutes or until the MAX_WALL_CLOCK budget is exhausted:

- If a new review appears with `state == "APPROVED"` → proceed to CI check.
- If a new review appears with `state == "CHANGES_REQUESTED"` → skip PR with reason `re-review requested changes after auto-fix`.
- If 10 minutes elapse with no new review → proceed to CI check (timeout-trust).

---

## Re-Review Comment Template

When any blocker threads have been successfully addressed, post a single summary comment at the end of the triage flow (after all inline replies):

```bash
gh pr comment <pr> --body "$(cat <<EOF
@<reviewer1> @<reviewer2> addressed <N> review comments in the latest commits:

- <file1>:<line1> — <brief summary>
- <file2>:<line2> — <brief summary>

Ready for re-review.
EOF
)"
```

Do NOT post a re-review comment if only nits/suggestions/questions were addressed — inline replies suffice for those. The re-review comment exists specifically to notify reviewers that safety-critical feedback was acted on.

---

## Error Handling

- **`gh api` failures** (non-zero exit, network error, 5xx, rate limit): retry once after 5 seconds. If still failing, log and skip the thread — do not crash the triage. If the initial GraphQL fetch fails entirely, skip the PR with reason `"review fetch failed"`.
- **Patch apply failures** (suggestion block or blocker fix doesn't apply cleanly): retry once with relaxed context (3-way merge equivalent). If still failing, mark the thread unfixable and fall through to mode-aware escalation.
- **Git push rejection** (non-fast-forward): fetch + rebase once, re-push. If still rejected, skip PR with reason `push rejected after rebase`.
- **Reply post failure**: if `gh api ... -F in_reply_to=<id>` fails after the retry, the commit is already pushed — log the failure but do NOT rollback. The fix stands; the reviewer will see the commit in the GitHub UI.
- **Self-reply loop prevention**: filter 3 (self-reply) is enforced BEFORE classification so merge-prs never sees its own past replies as new threads. This is mandatory — skipping this filter causes infinite loops when merge-prs is the PR author.

---

## Reference Back to Shared File

This file specializes the loop defined in `references/best-effort-remediation.md`:

- **Attempt loop skeleton** → `best-effort-remediation.md § Attempt Loop Skeleton` (with `MAX_ATTEMPTS=1`)
- **Mode-aware escalation** → `best-effort-remediation.md § Mode-Aware Escalation Contract`
- **Announcement templates** → `best-effort-remediation.md § Announcement Format Templates`
- **Skip/pause/escalate decisions** → `best-effort-remediation.md § Decision Table`
- **Wall-clock tracking** → `best-effort-remediation.md § Wall-Clock Tracking Guidance`

Review-triage-specific parameters:
- `detect_failures()` → Fetch Commands + Thread Filtering Rules + Classification Heuristics (above)
- `apply_fix(thread)` → Fix Strategies Per Category (above)
- `verify_success()` → not applicable (single-pass; optional `wait_for_rereview` polling instead)
- `build_commit_message()` → Commit Grouping and Message Contract (above)
````

**Step 3: Verify the file was created with required strings**

```bash
test -f skills/merge-prs/references/review-triage.md && echo "EXISTS"
grep -c "reviewThreads" skills/merge-prs/references/review-triage.md
grep -c "isResolved" skills/merge-prs/references/review-triage.md
grep -c "in_reply_to" skills/merge-prs/references/review-triage.md
```
Expected: `EXISTS`, counts >= 1.

Verify all 6 category names are present:
```bash
for cat in blocker suggestion nit question praise unclear; do
  grep -q "\`$cat\`" skills/merge-prs/references/review-triage.md && echo "FOUND: $cat" || echo "MISSING: $cat"
done
```
Expected: `FOUND:` for all 6.

Verify section headers exist:
```bash
for section in "Overview" "Fetch Commands" "Thread Filtering Rules" "Classification Heuristics" "Fix Strategies Per Category" "Commit Grouping and Message Contract" "Reply Templates" "Mode Behavior" "wait_for_rereview" "Error Handling" "Reference Back to Shared File"; do
  grep -q "## .*$section" skills/merge-prs/references/review-triage.md && echo "FOUND: $section" || echo "MISSING: $section"
done
```
Expected: `FOUND:` for all sections (the heading marker may be `##` or `###`).

**Step 4: Commit**

```bash
git add skills/merge-prs/references/review-triage.md
git commit -m "feat: add review-triage reference with 6-category classification and fix strategies (#226)"
```

**Acceptance Criteria:**
- [ ] File `skills/merge-prs/references/review-triage.md` exists
- [ ] File second line begins with `Reference file for the \`merge-prs\` skill.`
- [ ] File contains the string `best-effort-remediation.md` (reference back)
- [ ] File contains the string `reviewThreads` (GraphQL fetch)
- [ ] File contains the string `isResolved`
- [ ] File contains the string `isOutdated`
- [ ] File contains the string `in_reply_to`
- [ ] File contains the string `databaseId`
- [ ] File contains all 6 category names as backtick-wrapped literals: `blocker`, `suggestion`, `nit`, `question`, `praise`, `unclear`
- [ ] File contains the string `MAX_ATTEMPTS:** 1` (single-pass distinct from ci-remediation)
- [ ] File contains the string `fix: address review comment by`
- [ ] File contains the string `fix: apply suggestion from`
- [ ] File contains the string `wait_for_rereview`
- [ ] File contains the string `Safety invariant` (mode behavior safety guarantee)
- [ ] File contains all section headers: `Fetch Commands`, `Thread Filtering Rules`, `Classification Heuristics`, `Fix Strategies Per Category`, `Commit Grouping`, `Reply Templates`, `Mode Behavior`, `Error Handling`, `Reference Back to Shared File`

---

### Task 2: Update `SKILL.md` Step 4a — replace binary `CHANGES_REQUESTED` skip with triage flow

**Files:**
- Modify: `skills/merge-prs/SKILL.md` (line 89 in current file)

**Step 1: Read the current line to confirm exact text**

```bash
sed -n '85,92p' skills/merge-prs/SKILL.md
```

Expected (line 89):
```
- If `reviews` has any `CHANGES_REQUESTED` state: flag to user, skip PR. Announce reason.
```

If the text differs, note the exact text — use it verbatim as `old_string` in the Edit call.

**Step 2: Replace the line**

Use the Edit tool on `skills/merge-prs/SKILL.md` with:

`old_string`:
```
- If `reviews` has any `CHANGES_REQUESTED` state: flag to user, skip PR. Announce reason.
```

`new_string`:
```
- If any unresolved review threads, discussion comments, or formal reviews exist: enter single-pass review triage loop. Read `references/review-triage.md` and apply the triage flow (fetch all feedback surfaces in parallel, filter stale/resolved/self-reply threads, classify and fix, post replies). Review triage runs **before** the CI remediation loop so that any fix commits trigger a fresh CI run which `ci-remediation.md` can then handle. Skip the PR only if an unfixable blocker remains or (in YOLO) an unclear thread is found.
```

**Step 3: Verify the change**

```bash
grep -n "flag to user, skip PR. Announce reason" skills/merge-prs/SKILL.md
```
Expected: no output (old text is gone).

```bash
grep -n "references/review-triage.md" skills/merge-prs/SKILL.md
```
Expected: at least 1 match.

```bash
grep -n "single-pass review triage loop" skills/merge-prs/SKILL.md
```
Expected: at least 1 match.

**Step 4: Commit**

```bash
git add skills/merge-prs/SKILL.md
git commit -m "feat: replace binary CHANGES_REQUESTED skip with triage flow in SKILL.md Step 4a (#226)"
```

**Acceptance Criteria:**
- [ ] `skills/merge-prs/SKILL.md` no longer contains the string `flag to user, skip PR. Announce reason`
- [ ] `skills/merge-prs/SKILL.md` contains the string `references/review-triage.md`
- [ ] `skills/merge-prs/SKILL.md` contains the string `single-pass review triage loop`
- [ ] `skills/merge-prs/SKILL.md` contains the string `before** the CI remediation loop` (preserves ordering: triage before CI)

---

### Task 3: Update `SKILL.md` error recovery table row — `Unresolved review requests`

**Files:**
- Modify: `skills/merge-prs/SKILL.md` (approximately line 263 in current file)

**Step 1: Read the current row to confirm exact text**

```bash
grep -n "Unresolved review requests" skills/merge-prs/SKILL.md
```

Expected: one match with text:
```
| Unresolved review requests | Skip with reason |
```

**Step 2: Replace the row**

Use the Edit tool on `skills/merge-prs/SKILL.md` with:

`old_string`:
```
| Unresolved review requests | Skip with reason |
```

`new_string`:
```
| Unresolved review requests | Enter single-pass review triage loop (see `references/review-triage.md`). Skip only if blockers cannot be fixed or (in YOLO) unclear threads remain. |
```

**Step 3: Verify the change**

```bash
grep -n "Unresolved review requests.*Skip with reason" skills/merge-prs/SKILL.md
```
Expected: no output (old row is gone).

```bash
grep -n "Unresolved review requests.*review-triage.md" skills/merge-prs/SKILL.md
```
Expected: exactly 1 match.

**Step 4: Commit**

```bash
git add skills/merge-prs/SKILL.md
git commit -m "fix: update error recovery row for unresolved review requests in SKILL.md (#226)"
```

**Acceptance Criteria:**
- [ ] `skills/merge-prs/SKILL.md` does not contain the exact string `| Unresolved review requests | Skip with reason |`
- [ ] `skills/merge-prs/SKILL.md` contains exactly one row starting with `| Unresolved review requests |`
- [ ] That row contains the string `references/review-triage.md`
- [ ] That row contains the string `single-pass review triage loop`

---

### Task 4: Update `.feature-flow.yml` — add `wait_for_rereview` comment field

**Files:**
- Modify: `.feature-flow.yml` (lines 24-33 in current file)

**Step 1: Read the current comment block to confirm exact text**

```bash
sed -n '24,34p' .feature-flow.yml
```

Expected (approximately):
```yaml
# merge:                       # Optional: Ship phase merge configuration (all fields have defaults)
# strategy: squash             # squash | merge | rebase (default: squash)
# delete_branch: true          # delete branch after merge (default: true)
# require_ci: true             # require CI green before merge (default: true)
# require_review: true         # require approved review before merge (default: true)
# auto_discover: label         # label | body_marker | both (default: label)
# ci_remediation:                       # Bounded CI failure remediation loop (see skills/merge-prs/references/ci-remediation.md)
#   max_attempts: 3                     # integer >= 1 (default: 3)
#   max_wall_clock_minutes: 10          # integer >= 1 (default: 10)
#   ci_poll_interval_seconds: 30        # integer >= 10 (default: 30; GitHub API rate-limit safe floor)
```

**Step 2: Insert the `wait_for_rereview` line**

Insert `# wait_for_rereview: false     # Wait for re-approval after auto-fixing review comments (default: false; see skills/merge-prs/references/review-triage.md)` between the `# auto_discover: label` line and the `# ci_remediation:` line.

Use the Edit tool with:

`old_string`:
```
# auto_discover: label         # label | body_marker | both (default: label)
# ci_remediation:                       # Bounded CI failure remediation loop (see skills/merge-prs/references/ci-remediation.md)
```

`new_string`:
```
# auto_discover: label         # label | body_marker | both (default: label)
# wait_for_rereview: false     # Wait for re-approval after auto-fixing review comments (default: false; see skills/merge-prs/references/review-triage.md)
# ci_remediation:                       # Bounded CI failure remediation loop (see skills/merge-prs/references/ci-remediation.md)
```

Make sure the leading `#` and spacing match the surrounding lines — keep the same alignment as other fields in the `merge:` block.

**Step 3: Verify the change**

```bash
grep -n "wait_for_rereview" .feature-flow.yml
```
Expected: exactly 1 match.

```bash
grep -n "review-triage.md" .feature-flow.yml
```
Expected: exactly 1 match.

Verify existing lines are unchanged:
```bash
grep -q "strategy: squash" .feature-flow.yml && echo "merge block intact" || echo "MISSING merge block"
grep -q "ci_remediation" .feature-flow.yml && echo "ci_remediation intact" || echo "MISSING ci_remediation"
```
Expected: both print intact messages.

**Step 4: Commit**

```bash
git add .feature-flow.yml
git commit -m "feat: add wait_for_rereview config comment to .feature-flow.yml (#226)"
```

**Acceptance Criteria:**
- [ ] `.feature-flow.yml` contains the string `wait_for_rereview: false`
- [ ] `.feature-flow.yml` contains the string `skills/merge-prs/references/review-triage.md`
- [ ] The `wait_for_rereview` line is hash-commented (starts with `#`)
- [ ] Existing `strategy: squash` line still present
- [ ] Existing `ci_remediation:` line still present
- [ ] The `wait_for_rereview` line appears between `auto_discover` and `ci_remediation:` lines

---

### Task 5: Update `best-effort-remediation.md` — mark review triage as current consumer

**Files:**
- Modify: `skills/merge-prs/references/best-effort-remediation.md` (lines 11-14)

**Step 1: Read the current "Current consumers" section**

```bash
sed -n '10,16p' skills/merge-prs/references/best-effort-remediation.md
```

Expected (approximately):
```
**Current consumers:**
- `references/ci-remediation.md` (CI failure loop — issue #224)
- `references/conflict-resolution.md` (merge conflict ladder — issue #225, future)
- PR review triage (issue #226, future)
```

**Step 2: Replace the review triage line to mark it present**

Use the Edit tool with:

`old_string`:
```
- PR review triage (issue #226, future)
```

`new_string`:
```
- `references/review-triage.md` (PR review triage — issue #226)
```

**Step 3: Verify the change**

```bash
grep -n "PR review triage (issue #226, future)" skills/merge-prs/references/best-effort-remediation.md
```
Expected: no output (old line gone).

```bash
grep -n "references/review-triage.md" skills/merge-prs/references/best-effort-remediation.md
```
Expected: at least 1 match.

**Step 4: Commit**

```bash
git add skills/merge-prs/references/best-effort-remediation.md
git commit -m "docs: mark review triage as current consumer in best-effort-remediation.md (#226)"
```

**Acceptance Criteria:**
- [ ] `skills/merge-prs/references/best-effort-remediation.md` does not contain the string `PR review triage (issue #226, future)`
- [ ] `skills/merge-prs/references/best-effort-remediation.md` contains the string `references/review-triage.md`

---

## Summary Checklist

After all 5 tasks are complete, verify every acceptance criterion passes. Each line should print `OK` (or `FOUND:` for category checks). Any missing or silent line = failed criterion, fix before declaring done.

```bash
# Task 1 — review-triage.md file
test -f skills/merge-prs/references/review-triage.md && echo "T1 file OK"
head -3 skills/merge-prs/references/review-triage.md | grep -q 'Reference file for the `merge-prs` skill' && echo "T1 header OK"
grep -q "best-effort-remediation.md" skills/merge-prs/references/review-triage.md && echo "T1 shared-ref OK"
grep -q "reviewThreads" skills/merge-prs/references/review-triage.md && echo "T1 reviewThreads OK"
grep -q "isResolved" skills/merge-prs/references/review-triage.md && echo "T1 isResolved OK"
grep -q "isOutdated" skills/merge-prs/references/review-triage.md && echo "T1 isOutdated OK"
grep -q "in_reply_to" skills/merge-prs/references/review-triage.md && echo "T1 in_reply_to OK"
grep -q "databaseId" skills/merge-prs/references/review-triage.md && echo "T1 databaseId OK"
grep -q "wait_for_rereview" skills/merge-prs/references/review-triage.md && echo "T1 wait_for_rereview OK"
grep -q "MAX_ATTEMPTS:\*\* 1" skills/merge-prs/references/review-triage.md && echo "T1 single-pass OK"
grep -q "fix: address review comment by" skills/merge-prs/references/review-triage.md && echo "T1 commit-prefix OK"
grep -q "Safety invariant" skills/merge-prs/references/review-triage.md && echo "T1 safety-invariant OK"
for cat in blocker suggestion nit question praise unclear; do
  grep -q "\`$cat\`" skills/merge-prs/references/review-triage.md && echo "T1 cat-$cat OK" || echo "T1 cat-$cat MISSING"
done

# Task 2 — SKILL.md Step 4a
! grep -q "flag to user, skip PR. Announce reason" skills/merge-prs/SKILL.md && echo "T2 old-skip gone OK"
grep -q "references/review-triage.md" skills/merge-prs/SKILL.md && echo "T2 new-ref OK"
grep -q "single-pass review triage loop" skills/merge-prs/SKILL.md && echo "T2 loop-text OK"
grep -q "before\*\* the CI remediation loop" skills/merge-prs/SKILL.md && echo "T2 ordering OK"

# Task 3 — SKILL.md error recovery row
! grep -q "| Unresolved review requests | Skip with reason |" skills/merge-prs/SKILL.md && echo "T3 old-row gone OK"
grep -q "| Unresolved review requests |.*review-triage.md" skills/merge-prs/SKILL.md && echo "T3 new-row OK"

# Task 4 — .feature-flow.yml
grep -q "wait_for_rereview: false" .feature-flow.yml && echo "T4 wait_for_rereview OK"
grep -q "skills/merge-prs/references/review-triage.md" .feature-flow.yml && echo "T4 ref OK"
grep -q "strategy: squash" .feature-flow.yml && echo "T4 existing-merge-block OK"
grep -q "ci_remediation" .feature-flow.yml && echo "T4 existing-ci-remediation OK"

# Task 5 — best-effort-remediation.md consumers list
! grep -q "PR review triage (issue #226, future)" skills/merge-prs/references/best-effort-remediation.md && echo "T5 old-future-marker gone OK"
grep -q "references/review-triage.md" skills/merge-prs/references/best-effort-remediation.md && echo "T5 new-consumer OK"
```

Expected: every line prints `OK` (or `FOUND:` for category checks). If any line is silent or prints `MISSING`, that criterion has failed — fix the relevant task before declaring the implementation complete.
