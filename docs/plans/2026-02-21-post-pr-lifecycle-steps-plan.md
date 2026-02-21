# Post-PR Lifecycle Steps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add post-PR lifecycle steps to feature-flow: issue comment/close, configurable PR target branch, and expanded completion summary.

**Architecture:** All changes are to markdown skill definitions and a reference schema. No application code. Two files modified: `skills/start-feature/SKILL.md` (inline step, detection cascade, completion template) and `references/project-context-schema.md` (new `default_branch` field).

**Tech Stack:** Markdown, `gh` CLI

**Design Doc:** `docs/plans/2026-02-21-post-pr-lifecycle-steps.md`
**Issue:** #34

---

### Task 1: Add `default_branch` field to project context schema

Add the new optional field to `references/project-context-schema.md` — the schema example, field documentation, and "How Skills Use This File" section.

**Acceptance Criteria:**
- [ ] `references/project-context-schema.md` contains a `default_branch: staging` line in the YAML example block (lines 7-25)
- [ ] A new `### default_branch` section exists after the `### types_path` section (after line 113)
- [ ] The new section documents: optional string, detection cascade when absent, used by start-feature and finishing-a-development-branch
- [ ] The `start-feature (reads + writes)` entry under "How Skills Use This File" (lines 117-121) mentions reading `default_branch` for base branch detection

**Files:**
- Modify: `references/project-context-schema.md:7-25` (schema example)
- Modify: `references/project-context-schema.md:103-113` (after types_path section)
- Modify: `references/project-context-schema.md:117-121` (start-feature usage)

**Steps:**

1. Add `default_branch: staging` to the YAML example block, after `types_path`:

```yaml
default_branch: staging  # Optional: PR target branch (default: detected via cascade)
```

2. Add a new `### default_branch` section after the `### types_path` section:

```markdown
### `default_branch`

Optional PR target branch. When set, overrides the automatic detection cascade used by `start-feature` to determine where PRs should target.

**Detection cascade (when `default_branch` is absent):**
1. `git config --get init.defaultBranch` (if set)
2. Check if `staging` branch exists: `git rev-parse --verify staging 2>/dev/null`
3. Fall back to `main` (or `master` if `main` doesn't exist)

**Format:** Single branch name string.

```yaml
default_branch: staging
```

**When needed:** Only when the automatic detection cascade doesn't select the correct branch. Most projects using `main` as their PR target don't need this field.
```

3. Update the `start-feature (reads + writes)` entry to mention `default_branch`:

Add a bullet: `- **Reads** `default_branch` field to determine the PR target branch. If absent, runs the detection cascade.`

4. Verify with grep:

```bash
grep -n "default_branch" references/project-context-schema.md
```

Expected: 3+ matches (example, section, usage)

5. Commit:

```bash
git add references/project-context-schema.md
git commit -m "docs: add default_branch field to project context schema (#34)"
```

---

### Task 2: Add base branch detection to Step 0 of start-feature

Add base branch detection logic to the end of Step 0 (after project context loading, before Step 1: Determine Scope). This runs once and the detected value is used by all subsequent steps.

**Acceptance Criteria:**
- [ ] A new subsection titled "Base Branch Detection" exists between the end of Step 0 (line 129) and `### Step 1: Determine Scope` (line 131)
- [ ] The subsection documents the detection cascade: `.feature-flow.yml` `default_branch` → `git config --get init.defaultBranch` → staging exists → main/master fallback
- [ ] The subsection includes an announcement instruction: `"Detected base branch: [branch]"`
- [ ] The subsection includes a YOLO behavior note: auto-detect and announce without prompting

**Files:**
- Modify: `skills/start-feature/SKILL.md:129-131` (between Step 0 end and Step 1 start)

**Steps:**

1. Insert the following after line 129 (`See ...project-context-schema.md... for the schema.`) and before line 131 (`### Step 1: Determine Scope`):

```markdown

**Base Branch Detection:**

After loading project context, detect the base branch that will be used as the PR target and for all `...HEAD` diff commands throughout the lifecycle. Detect once and announce — all subsequent steps reference "the detected base branch."

Detection cascade:
1. `.feature-flow.yml` → `default_branch` field (if present and non-empty)
2. `git config --get init.defaultBranch` (if set and branch exists locally or on remote)
3. Check if `staging` branch exists: `git rev-parse --verify staging 2>/dev/null`
4. Fall back to `main` (or `master` if `main` doesn't exist)

Announce: `"Detected base branch: [branch]. All PR targets and branch diffs will use this."`

**YOLO behavior:** No prompt — always auto-detected. Announce: `YOLO: start-feature — Base branch detection → [branch]`

```

2. Verify the section exists between Step 0 and Step 1:

```bash
grep -n "Base Branch Detection" skills/start-feature/SKILL.md
```

Expected: 1 match

3. Commit:

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat: add base branch detection to Step 0 (#34)"
```

---

### Task 3: Add "Comment and close issue" to all scope step lists and skill mapping

Update the 4 scope step lists and the skill mapping table to include the new step.

**Acceptance Criteria:**
- [ ] Quick fix step list includes `- [ ] 7. Comment and close issue` after "Commit and PR"
- [ ] Small enhancement step list includes `- [ ] 17. Comment and close issue` after "Commit and PR"
- [ ] Feature step list includes `- [ ] 18. Comment and close issue` after "Commit and PR"
- [ ] Major feature step list includes `- [ ] 19. Comment and close issue` after "Commit and PR"
- [ ] The skill mapping table contains a row: `| Comment and close issue | No skill — inline step (see below) | Issue commented with implementation summary + closed |`
- [ ] The mobile platform adjustments section notes that "Comment and close issue" goes after app store review

**Files:**
- Modify: `skills/start-feature/SKILL.md:216-287` (scope step lists)
- Modify: `skills/start-feature/SKILL.md:324-348` (skill mapping table)
- Modify: `skills/start-feature/SKILL.md:289-298` (mobile adjustments)

**Steps:**

1. Add `- [ ] 7. Comment and close issue` after line 223 (`- [ ] 6. Commit and PR`) in the quick fix list.

2. Add `- [ ] 17. Comment and close issue` after line 243 (`- [ ] 16. Commit and PR`) in the small enhancement list.

3. Add `- [ ] 18. Comment and close issue` after line 264 (`- [ ] 17. Commit and PR`) in the feature list.

4. Add `- [ ] 19. Comment and close issue` after line 286 (`- [ ] 18. Commit and PR`) in the major feature list.

5. Add a new row to the skill mapping table after the "Commit and PR" row (line 345):

```
| Comment and close issue | No skill — inline step (see below) | Issue commented with implementation summary + closed |
```

6. Update the mobile platform adjustments section (after line 296) to add:

```markdown
- **After app store review (or after commit and PR if not mobile):** Insert **comment and close issue** step (post implementation summary comment, close issue). Only runs when an issue is linked.
```

7. Verify all 4 lists have the new step:

```bash
grep -c "Comment and close issue" skills/start-feature/SKILL.md
```

Expected: 6+ matches (4 step lists + 1 skill mapping + 1 mobile adjustments)

8. Commit:

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat: add comment-and-close-issue step to all scope lists (#34)"
```

---

### Task 4: Add "Comment and Close Issue" inline step definition

Add the full inline step section to SKILL.md. It goes after the CHANGELOG entry step and before the Documentation Lookup step.

**Acceptance Criteria:**
- [ ] A new section titled `### Comment and Close Issue Step (inline — no separate skill)` exists in SKILL.md
- [ ] The section states it runs after "Commit and PR" (or after mobile-specific steps) and before completion
- [ ] The section documents: only runs when issue linked in Step 1, generates comment from lifecycle context, posts via `gh issue comment`, closes via `gh issue close`
- [ ] The comment template includes: PR number, "What was built" bullets, acceptance criteria verified, key files changed (limit 10)
- [ ] Edge cases documented: no issue linked (skip), already closed (skip), gh failure (warn + continue)
- [ ] YOLO behavior: no prompt needed, always automated

**Files:**
- Modify: `skills/start-feature/SKILL.md` (insert after CHANGELOG entry step, before Documentation Lookup step — approximately after the CHANGELOG Phase 6 section ending around line 888)

**Steps:**

1. Insert the new section after the CHANGELOG entry step's closing output format block and before `### Documentation Lookup Step`. The content:

```markdown
### Comment and Close Issue Step (inline — no separate skill)

This step runs after "Commit and PR" (or after mobile-specific steps like app store review) and before the completion summary. It only runs when a GitHub issue was linked during Step 1 (issue reference detection). If no issue was linked, skip this step silently.

**Process:**

1. **Check if issue is already closed:**
   ```bash
   gh issue view N --json state --jq '.state'
   ```
   If the state is `CLOSED`, log: `"Issue #N is already closed — skipping."` and skip.

2. **Generate the comment body** from lifecycle context:

   ```markdown
   ## Implementation Complete

   **PR:** #[PR number]

   ### What was built
   - [2-4 bullet points summarizing what was implemented, derived from the design doc and commit history]

   ### Acceptance criteria verified
   - [x] [Each acceptance criterion from the implementation plan, marked as verified]

   ### Key files changed
   - `[file path]` — [1-line description of change]
   - `[file path]` — [1-line description of change]
   [limit to 10 most significant files]
   ```

   **Content sources:**
   - "What was built" → derive from design doc overview + `git log --format="%s" [base-branch]...HEAD`
   - Acceptance criteria → from the implementation plan tasks, verified during the final verification step
   - Key files → from `git diff --stat [base-branch]...HEAD`, limited to 10 most-changed files

3. **Post the comment:**
   ```bash
   gh issue comment N --body "[generated comment]"
   ```

4. **Close the issue:**
   ```bash
   gh issue close N
   ```

5. **Announce:** `"Issue #N commented and closed."`

**Edge cases:**
- **No issue linked:** Skip this step silently — not all lifecycle runs start from an issue
- **Issue already closed:** Log warning: `"Issue #N is already closed — skipping."` Do not reopen or double-comment.
- **`gh` command fails:** Log warning and continue — don't block completion on a comment failure

**YOLO behavior:** No prompt needed — this step is always automated. In YOLO mode, runs silently. In Interactive mode, announce but don't ask for confirmation.
```

2. Verify the section exists:

```bash
grep -n "Comment and Close Issue Step" skills/start-feature/SKILL.md
```

Expected: 1 match

3. Commit:

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat: add comment-and-close-issue inline step definition (#34)"
```

---

### Task 5: Update Finishing YOLO Override for base branch and `Related: #N`

Modify the "Finishing a Development Branch YOLO Override" section to use the detected base branch instead of hardcoded `main`, and add the `Related: #N` instruction.

**Acceptance Criteria:**
- [ ] Line 465's text about "Auto-confirm `main` (or `master`...)" is replaced with text about auto-confirming the detected base branch
- [ ] A new item is added about using `Related: #N` (not `Closes #N`) in the PR body when an issue is linked
- [ ] The CRITICAL OVERRIDE paragraph (line 462) references "detected base branch" instead of "main"

**Files:**
- Modify: `skills/start-feature/SKILL.md:458-469` (finishing override section)

**Steps:**

1. Replace line 462's text:
   - Old: `"This branch split from main — is that correct?"`
   - New: `"This branch split from [branch] — is that correct?"`

2. Replace line 465:
   - Old: `1. **Base branch:** Auto-confirm \`main\` (or \`master\` if \`main\` doesn't exist). Do NOT ask the user.`
   - New: `1. **Base branch:** Auto-confirm the detected base branch (from Step 0 base branch detection). Do NOT ask the user. Announce: \`YOLO: finishing-a-development-branch — Base branch → [detected base branch]\``

3. Add a new item 4 (renumber existing 4 and 5 to 5 and 6):

```markdown
4. **Issue reference in PR body:** When a GitHub issue is linked to the lifecycle, include `Related: #N` in the PR body to link the PR to the issue. Do NOT use `Closes #N` — the lifecycle closes the issue explicitly in the "Comment and Close Issue" step with a detailed comment.
```

4. Verify the changes:

```bash
grep -n "Related: #N" skills/start-feature/SKILL.md
grep -n "detected base branch" skills/start-feature/SKILL.md
```

Expected: At least 1 match each

5. Commit:

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat: update finishing override for base branch detection and Related: #N (#34)"
```

---

### Task 6: Update all hardcoded `main...HEAD` references

Replace hardcoded `main` in git diff/log commands throughout SKILL.md with `[base-branch]` placeholder referencing the detected base branch.

**Acceptance Criteria:**
- [ ] Line 672 (`git diff main...HEAD -- <file>`) uses `[base-branch]` instead of `main`
- [ ] Line 676 (`git diff main...HEAD`) uses `[base-branch]` instead of `main`
- [ ] Line 773 (`git log --format="%s" main...HEAD`) uses `[base-branch]` instead of `main`
- [ ] No remaining occurrences of `main...HEAD` exist in SKILL.md (except in the YOLO decision log example templates which are display-only)
- [ ] A note near the first occurrence explains: "where `[base-branch]` is the branch detected in Step 0"

**Files:**
- Modify: `skills/start-feature/SKILL.md:672` (code review large file handling)
- Modify: `skills/start-feature/SKILL.md:676` (code review agent dispatch)
- Modify: `skills/start-feature/SKILL.md:773` (CHANGELOG commit collection)

**Steps:**

1. Replace `main...HEAD` with `[base-branch]...HEAD` at line 672:
   - Old: `git diff main...HEAD -- <file>`
   - New: `git diff [base-branch]...HEAD -- <file>` (where `[base-branch]` is the branch detected in Step 0)

2. Replace `main...HEAD` with `[base-branch]...HEAD` at line 676:
   - Old: `git diff main...HEAD`
   - New: `git diff [base-branch]...HEAD`

3. Replace `main...HEAD` with `[base-branch]...HEAD` at line 773:
   - Old: `git log --format="%s" main...HEAD`
   - New: `git log --format="%s" [base-branch]...HEAD`

4. Verify no remaining hardcoded `main...HEAD` (excluding YOLO log templates):

```bash
grep -n "main\.\.\.HEAD" skills/start-feature/SKILL.md
```

Expected: 0 matches (or only in the YOLO decision log display templates)

5. Commit:

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat: replace hardcoded main with detected base branch in git commands (#34)"
```

---

### Task 7: Replace Step 5 completion summary with expanded version

Replace the current terse completion template with the expanded version including worktree status, issue close status, and next-steps guidance.

**Acceptance Criteria:**
- [ ] The completion template (lines 941-953) includes `Issue: #[number] (commented and closed)` or `(no issue linked)`
- [ ] The template includes `PR: #[number] → [base branch]` showing the target branch
- [ ] The template includes a `Worktree:` line showing removal status or cleanup command
- [ ] The template includes a `What to do next:` section with 3 numbered steps
- [ ] The YOLO decision log templates (lines 955-999) are preserved unchanged after the new completion template

**Files:**
- Modify: `skills/start-feature/SKILL.md:937-953` (Step 5: Completion)

**Steps:**

1. Replace the completion template (lines 941-953) with:

```
Lifecycle complete!

Summary:
- Platform: [web/ios/android/cross-platform]
- Design doc: docs/plans/YYYY-MM-DD-feature.md
- Issue: #[number] (commented and closed) [or "(no issue linked)" if none]
- PR: #[number] → [base branch]
- All acceptance criteria verified

Worktree: [Removed / Still active at .worktrees/feature-name]
[If still active: "Run `git worktree remove .worktrees/feature-name` when done."]

What to do next:
1. Review PR #[number] on GitHub (or request team review)
2. After PR merges to [base branch], verify in [base branch] environment
3. Clean up local branch: `git branch -d feature-name && git fetch --prune`

[List any skipped steps and their risks]
[List any platform-specific notes (e.g., "App store submission pending")]
```

2. Verify the YOLO Decision Log section still follows immediately after:

```bash
grep -n "YOLO Decision Log" skills/start-feature/SKILL.md
```

Expected: 2+ matches (still present)

3. Commit:

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat: expand lifecycle completion summary with next steps (#34)"
```
