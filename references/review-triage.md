# Review Triage

Shared reference file for the `merge-prs` skill and the `start` lifecycle Harden PR step. Read this file when a PR has any unresolved inline review comments, discussion comments, or `CHANGES_REQUESTED` formal reviews — enter the single-pass triage flow described here.

See `best-effort-remediation.md` for the attempt loop skeleton and mode escalation contract. This file specializes only the review-triage-specific portions.

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

See `best-effort-remediation.md § Mode-Aware Escalation Contract` for the base contract. Review-triage specifics:

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

This file specializes the loop defined in `best-effort-remediation.md`:

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
