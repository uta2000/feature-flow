# Eliminate Metadata File Merge Conflicts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop feature-flow from committing session-local metadata files to feature branches, and replace direct CHANGELOG.md appending with per-PR changelog fragments, eliminating 80%+ of merge conflicts in parallel worktree workflows.

**Architecture:** Two independent changes: (1) `.feature-flow/` and `FEATURE_CONTEXT.md` become session-local — created in the worktree but never `git add`-ed, protected via `.gitignore`; (2) the "Generate CHANGELOG Entry" step writes to `.changelogs/<id>.md` instead of `CHANGELOG.md`, with the `merge-prs` Ship phase consolidating fragments into `CHANGELOG.md` at merge time.

**Tech Stack:** Markdown skill files, bash commands within skill instructions, Keep a Changelog format for fragment files.

---

## Background

Every feature-flow session writes to `.feature-flow/design/design-decisions.md`, `.feature-flow/design/verification-results.md`, `.feature-flow/implement/patterns-found.md`, `.feature-flow/implement/blockers-and-resolutions.md`, `FEATURE_CONTEXT.md`, and `CHANGELOG.md`. Parallel worktrees conflict on all of these despite touching completely different code. This plan makes the metadata files either non-committed or uniquely-named.

All files are in the feature-flow plugin at `/Users/weee/.claude/plugins/marketplaces/feature-flow/`.

---

### Task 1: Stop committing `.feature-flow/` and `FEATURE_CONTEXT.md` in worktree setup

**Files:**
- Modify: `skills/start/SKILL.md` (line 606 — Worktree setup row in Skill Mapping table)

**Step 1: Read the current worktree setup row**

Open `/Users/weee/.claude/plugins/marketplaces/feature-flow/skills/start/SKILL.md` lines 606–606. The current text ends with: `Include all four files in the same initial commit as \`FEATURE_CONTEXT.md\`.`

**Step 2: Replace the worktree setup instruction**

In the `Worktree setup` row (line 606), replace the section starting at `**After worktree creation:**` through the end of the cell. Change:

```
**After worktree creation:** Create `FEATURE_CONTEXT.md` in the worktree root using the template from `skills/start/references/feature-context-template.md`. Include it in the initial branch commit: `git add FEATURE_CONTEXT.md && git commit -m "chore: init FEATURE_CONTEXT.md"`. **Context directories:** Also create `.feature-flow/design/` and `.feature-flow/implement/` directories. For each of the four context files, read the corresponding template from `references/phase-context-templates.md` and write it to `.feature-flow/design/design-decisions.md`, `.feature-flow/design/verification-results.md`, `.feature-flow/implement/patterns-found.md`, and `.feature-flow/implement/blockers-and-resolutions.md`. Include all four files in the same initial commit as `FEATURE_CONTEXT.md`.
```

To:

```
**After worktree creation:** Create `FEATURE_CONTEXT.md` in the worktree root using the template from `skills/start/references/feature-context-template.md`. **Context directories:** Also create `.feature-flow/design/` and `.feature-flow/implement/` directories. For each of the four context files, read the corresponding template from `references/phase-context-templates.md` and write it to `.feature-flow/design/design-decisions.md`, `.feature-flow/design/verification-results.md`, `.feature-flow/implement/patterns-found.md`, and `.feature-flow/implement/blockers-and-resolutions.md`. These files are session-local working state — do NOT commit them to the feature branch. They are used for context capture during the session and for PR body injection at completion, but are excluded from git via `.gitignore`. After creating the files, verify they are ignored: `git status FEATURE_CONTEXT.md .feature-flow/` should show no output. **Gitignore safety:** Before creating context files, check the project's `.gitignore` for `.feature-flow/` and `FEATURE_CONTEXT.md` entries. If either is missing: (1) Append the missing entries to `.gitignore`: `# feature-flow session-local files (not committed to feature branches)\n.feature-flow/\nFEATURE_CONTEXT.md\nDECISIONS_ARCHIVE.md` (2) Stage and commit: `git add .gitignore && git commit -m "chore: gitignore feature-flow session metadata"`. This commit goes on the base branch (before the worktree branch is created), so all future worktrees inherit it. If both entries already exist, skip silently.
```

**Step 3: Verify the change looks correct**

Re-read line 606 and confirm: no `git add FEATURE_CONTEXT.md` or `git add .feature-flow/` commands remain. The `chore: init FEATURE_CONTEXT.md` commit is gone. The gitignore safety check is present.

**Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow
git add skills/start/SKILL.md
git commit -m "feat: make .feature-flow/ and FEATURE_CONTEXT.md session-local (not committed)"
```

---

### Task 2: Update `feature_context` description and remove deferred-write caveats

**Files:**
- Modify: `skills/start/SKILL.md` (line 563 — Lifecycle Context Object table, line 599 — Design document row, line 601 — Design verification row)

**Step 1: Update the `feature_context` row in the Lifecycle Context Object table**

Find the line (around line 563):
```
| `feature_context` | Step 0 — knowledge base pre-flight (null if no FEATURE_CONTEXT.md found) |
```

Replace with:
```
| `feature_context` | Step 0 — knowledge base pre-flight (null if no FEATURE_CONTEXT.md found). File is session-local (not committed). |
```

**Step 2: Remove the deferred-write caveat from the Design document row (line 599)**

In the Design document row, find and remove the sentence:
```
 **If `.feature-flow/design/` does not exist yet (worktree not yet created), defer this write until immediately after worktree setup.**
```
(Note: remove it from the end of the design-decisions.md instruction — leave everything else intact.)

**Step 3: Remove the deferred-write caveat from the Design verification row (line 601)**

In the Design verification row, find and remove the sentence:
```
 **If `.feature-flow/design/` does not exist yet (worktree not yet created), defer this write until immediately after worktree setup.**
```

**Step 4: Verify changes**

Re-read lines 560–605 and confirm:
- `feature_context` row now notes "session-local (not committed)"
- Neither the Design document nor Design verification rows contain the "defer this write" caveat

**Step 5: Commit**

```bash
cd /Users/weee/Dev/feature-flow
git add skills/start/SKILL.md
git commit -m "docs: remove deferred-write caveats — .feature-flow/ always exists after worktree setup"
```

---

### Task 3: Update `Sync with Base Branch` step — remove CHANGELOG special-case

**Files:**
- Modify: `skills/start/references/inline-steps.md` (lines 362–420)

**Step 1: Read the current Sync with Base Branch step**

Read `/Users/weee/.claude/plugins/marketplaces/feature-flow/skills/start/references/inline-steps.md` lines 362–420.

**Step 2: Update the opening description sentence**

Find (line 364):
```
Uses `git merge` instead of `git rebase` — merge produces a single conflict resolution pass regardless of commit count, while rebase replays each commit individually (N commits = up to N separate conflict rounds). This is especially important for feature-flow branches that touch context tracking files (`.feature-flow/*`, `FEATURE_CONTEXT.md`, `CHANGELOG.md`), which are guaranteed conflict targets.
```

Replace with:
```
Uses `git merge` instead of `git rebase` — merge produces a single conflict resolution pass regardless of commit count, while rebase replays each commit individually (N commits = up to N separate conflict rounds).
```

**Step 3: Replace the CHANGELOG auto-resolution conflict block**

Find the block starting at `b. **For \`CHANGELOG.md\` conflicts (auto-resolved):**` through `d. If only CHANGELOG.md was conflicted (now auto-resolved and staged):` and its sub-bullets. Specifically find the text:

```
   b. **For `CHANGELOG.md` conflicts (auto-resolved):**
      - Read the conflicted file
      - Extract HEAD's Unreleased entries: lines between `<<<<<<< HEAD` and `=======`
      - Extract incoming Unreleased entries: lines between `=======` and `>>>>>>> <hash>`
      - Merge strategy: start with HEAD's full Unreleased block, then append any category entries from the incoming block that aren't already present (case-insensitive dedup per entry)
      - Write the resolved file (no conflict markers)
      - Stage the file: `git add CHANGELOG.md`
   c. **For other conflicted files:**
      - Announce: "Non-CHANGELOG conflicts detected in: [files]. Pausing for manual resolution."
      - Show the user exactly what to do:
        ```
        1. Resolve conflicts in: [file list]
        2. Stage resolved files: git add <file>
        3. Complete: git commit (for merge) or git rebase --continue (for rebase)
        4. Type 'continue' to resume the lifecycle
        ```
      - Wait for the user to resolve and respond before proceeding.
   d. If only CHANGELOG.md was conflicted (now auto-resolved and staged):
      - For merge: `git commit --no-edit` (completes the merge commit)
      - For rebase: `git rebase --continue` (may trigger further conflicts on subsequent commits — repeat step 4b)
```

Replace with:

```
   b. **For conflicted files:**
      - Announce: "Conflicts detected in: [files]. Pausing for manual resolution."
      - Show the user exactly what to do:
        ```
        1. Resolve conflicts in: [file list]
        2. Stage resolved files: git add <file>
        3. Complete: git commit (for merge) or git rebase --continue (for rebase)
        4. Type 'continue' to resume the lifecycle
        ```
      - Wait for the user to resolve and respond before proceeding.
```

**Step 4: Update the YOLO behavior line (line 419)**

Find:
```
**YOLO behavior:** Run silently. If non-CHANGELOG conflicts are detected, pause and announce the conflict files — YOLO cannot resolve arbitrary conflicts automatically. Announce: `YOLO: start — Sync with base branch → [up to date | merged N commits | conflicts in: files (paused)]`
```

Replace with:
```
**YOLO behavior:** Run silently. If conflicts are detected, pause and announce the conflict files — YOLO cannot resolve arbitrary conflicts automatically. Announce: `YOLO: start — Sync with base branch → [up to date | merged N commits | conflicts in: files (paused)]`
```

**Step 5: Also update the Skill Mapping table entry for Sync with Base Branch**

In `SKILL.md`, find line 613:
```
| Sync with base branch | No skill — inline step (see below) | Branch rebased onto latest base branch; CHANGELOG.md conflicts auto-resolved |
```

Replace with:
```
| Sync with base branch | No skill — inline step (see below) | Branch merged onto latest base branch; conflicts require manual resolution |
```

**Step 6: Verify changes**

Re-read the Sync with Base Branch step. Confirm:
- No mention of "CHANGELOG.md conflicts (auto-resolved)"
- No mention of "Non-CHANGELOG"
- Step 4 has a single `b.` for conflicted files
- YOLO line no longer has "non-CHANGELOG"

**Step 7: Commit**

```bash
cd /Users/weee/Dev/feature-flow
git add skills/start/references/inline-steps.md skills/start/SKILL.md
git commit -m "feat: remove CHANGELOG.md auto-resolution from sync-with-base — fragments eliminate this conflict source"
```

---

### Task 4: Rewrite `Generate CHANGELOG Entry` Phase 6 to write fragments

**Files:**
- Modify: `skills/start/references/inline-steps.md` (lines 315–358)

**Step 1: Read Phase 6 and the output format block**

Read `/Users/weee/.claude/plugins/marketplaces/feature-flow/skills/start/references/inline-steps.md` lines 315–360.

**Step 2: Replace Phase 6 content**

Find the block starting at `#### Phase 6: Write to CHANGELOG.md` through `After writing, announce: "CHANGELOG.md updated with N entries across M categories."` (lines 315–345). Replace with:

```markdown
#### Phase 6: Write changelog fragment

Instead of writing directly to `CHANGELOG.md`, write the entry to a per-PR fragment file. This prevents merge conflicts when multiple PRs are created concurrently — each PR writes a unique file.

**Fragment filename:**
- If a GitHub issue is linked: `.changelogs/<issue-number>.md` (e.g., `.changelogs/195.md`)
- If no issue is linked: `.changelogs/<branch-name>.md` (e.g., `.changelogs/feat-csv-export.md`)

**Fragment format:**
```markdown
---
date: YYYY-MM-DD
pr: <pr-number or "pending">
scope: <lifecycle scope>
---

### Added
- Entry from feat: commit

### Fixed
- Entry from fix: commit

### Changed
- Entry from refactor: commit
```

**Process:**
1. Create `.changelogs/` directory if it doesn't exist: `mkdir -p .changelogs`
2. Write the fragment file with frontmatter metadata and categorized entries
3. Stage the fragment: `git add .changelogs/<filename>.md`
4. Do NOT modify `CHANGELOG.md` — consolidation happens at merge time via the Ship phase

After writing, announce: "Changelog fragment written to `.changelogs/<filename>.md` with N entries across M categories."

**Existing CHANGELOG.md:** Do not read, parse, merge into, or deduplicate against `CHANGELOG.md` during this step. The fragment is self-contained.

**`.changelogs/` in `.gitignore`:** This directory MUST be committed (unlike `.feature-flow/`). Do not add it to `.gitignore`. Each PR carries its own fragment file.
```

**Step 3: Update the output format block**

Find the output format block (lines 347–356):
```
**Output format:**
```
## CHANGELOG Generation Results

**Version heading:** [Unreleased] (or [X.Y.Z] - YYYY-MM-DD)
**Commits parsed:** N
**Entries generated:** M (after dedup)
**Categories:** [list]
**Action:** Written to CHANGELOG.md / Skipped by user
```
```

Replace with:
```
**Output format:**
```
## CHANGELOG Generation Results

**Fragment file:** `.changelogs/<filename>.md`
**Version heading:** [Unreleased] (or [X.Y.Z] - YYYY-MM-DD)
**Commits parsed:** N
**Entries generated:** M (after dedup)
**Categories:** [list]
**Action:** Written to `.changelogs/<filename>.md` / Skipped by user
```
```

**Step 4: Also update the Skill Mapping table for Generate CHANGELOG entry**

In `SKILL.md`, find line 611:
```
| Generate CHANGELOG entry | No skill — inline step (see below) | CHANGELOG.md updated with categorized entry |
```

Replace with:
```
| Generate CHANGELOG entry | No skill — inline step (see below) | Changelog fragment written to `.changelogs/<id>.md`; consolidated at Ship phase |
```

**Step 5: Verify changes**

Re-read Phase 6. Confirm:
- No reference to writing to `CHANGELOG.md`
- Fragment filename logic (issue number preferred, branch name fallback)
- Frontmatter format present
- `mkdir -p .changelogs` in process steps
- Output format shows `Fragment file:` and `.changelogs/<filename>.md`

**Step 6: Commit**

```bash
cd /Users/weee/Dev/feature-flow
git add skills/start/references/inline-steps.md skills/start/SKILL.md
git commit -m "feat: write changelog fragments to .changelogs/<id>.md instead of appending to CHANGELOG.md"
```

---

### Task 5: Remove archive block from yolo-overrides.md

**Files:**
- Modify: `skills/start/references/yolo-overrides.md` (lines 163–172)

**Step 1: Read the archive block**

Read `/Users/weee/.claude/plugins/marketplaces/feature-flow/skills/start/references/yolo-overrides.md` lines 160–180.

**Step 2: Replace the archive block**

Find the block (items 6 through the bash block):
```
6. **Archive phase context files.** Before creating the PR, archive the context directories to a timestamped session directory:
   ```bash
   DATE=$(date +%Y-%m-%d)
   FEATURE=$(basename $(git rev-parse --abbrev-ref HEAD))
   SESSION_DIR=".feature-flow/sessions/${DATE}-${FEATURE}"
   mkdir -p "$SESSION_DIR"
   [ -d .feature-flow/design ] && cp -r .feature-flow/design/ "$SESSION_DIR/design/"
   [ -d .feature-flow/implement ] && cp -r .feature-flow/implement/ "$SESSION_DIR/implement/"
   ```
   If neither `.feature-flow/design/` nor `.feature-flow/implement/` exists, skip silently.
```

Replace with:
```
6. **Archive phase context files.** Skip — `.feature-flow/` files are session-local (not committed) and do not need archiving. Context is preserved in the PR body via the Implementation Context section below.
```

**Step 3: Verify change**

Re-read lines 160–185. Confirm:
- Item 6 is now a single line "Skip —..."
- The bash block with `DATE=`, `FEATURE=`, `SESSION_DIR=`, `mkdir`, `cp` commands is gone
- Item 7 (Inject context into PR body) is intact and unchanged

**Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow
git add skills/start/references/yolo-overrides.md
git commit -m "feat: remove archive-to-session-dir step — .feature-flow/ files are no longer committed"
```

---

### Task 6: Update knowledge base archival commit in project-context.md

**Files:**
- Modify: `skills/start/references/project-context.md` (line 215)

**Step 1: Read the archival commit line**

Read `/Users/weee/.claude/plugins/marketplaces/feature-flow/skills/start/references/project-context.md` lines 210–225.

**Step 2: Replace the git commit command**

Find:
```
      - Commit: `git add FEATURE_CONTEXT.md DECISIONS_ARCHIVE.md && git commit -m "chore: archive stale decisions [auto]"`
```

Replace with:
```
      - Note: `FEATURE_CONTEXT.md` and `DECISIONS_ARCHIVE.md` are session-local files (not committed to git). Archival modifies them locally for the current session only.
```

**Step 3: Verify change**

Re-read lines 210–225. Confirm:
- No `git add FEATURE_CONTEXT.md DECISIONS_ARCHIVE.md` command remains
- The note about session-local files is present
- The surrounding edge cases (lines 218–224) are unchanged

**Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow
git add skills/start/references/project-context.md
git commit -m "feat: remove git commit of FEATURE_CONTEXT.md in knowledge base archival — session-local"
```

---

### Task 7: Remove CHANGELOG.md from merge-prs conflict resolution

**Files:**
- Modify: `skills/merge-prs/references/conflict-resolution.md` (line 22 trivial table, lines 122–137 Example 3)

**Step 1: Read the trivial conflict table and examples**

Read `/Users/weee/.claude/plugins/marketplaces/feature-flow/skills/merge-prs/references/conflict-resolution.md` lines 15–145.

**Step 2: Remove the CHANGELOG.md row from the trivial conflict table**

Find the row:
```
| CHANGELOG.md | Conflicting file is `CHANGELOG.md` | Take both entries; re-sort by date (newest first) |
```

Delete this entire row (the line).

**Step 3: Remove Example 3 entirely**

Find the block:
```
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
```

Delete this entire block.

**Step 4: Renumber the following example**

After deleting Example 3, what was "Example 4: Lock file" becomes "Example 3: Lock file". Update the heading:

Find: `### Example 4: Lock file (trivial)`
Replace with: `### Example 3: Lock file (trivial)`

**Step 5: Verify changes**

Re-read the entire file. Confirm:
- No `CHANGELOG.md` row in the trivial conflict table
- No "Example 3: CHANGELOG.md" section
- "Lock file" example is renumbered to Example 3
- All other content unchanged

**Step 6: Commit**

```bash
cd /Users/weee/Dev/feature-flow
git add skills/merge-prs/references/conflict-resolution.md
git commit -m "feat: remove CHANGELOG.md trivial conflict handling — fragments eliminate CHANGELOG conflicts"
```

---

### Task 8: Add changelog consolidation step to merge-prs/SKILL.md

**Files:**
- Modify: `skills/merge-prs/SKILL.md` (after Step 5: Ship Phase Summary, before the horizontal rule ending Lifecycle Mode)

**Step 1: Read the end of Step 5**

Read `/Users/weee/.claude/plugins/marketplaces/feature-flow/skills/merge-prs/SKILL.md` lines 117–135.

**Step 2: Insert the changelog consolidation step**

After line 129 (`Fire the notification from \`notifications.on_stop\`...`), before the `---` that ends Lifecycle Mode, insert:

```markdown

### Step 6: Changelog Consolidation

After all PRs have been processed (merged, skipped, or failed), consolidate any `.changelogs/` fragment files into `CHANGELOG.md`:

1. Check for fragments: `ls .changelogs/*.md 2>/dev/null`
   - If no fragments exist: skip silently and proceed to Standalone Mode
   - If fragments exist: continue

2. Read all fragment files. For each fragment:
   - Parse frontmatter (date, pr, scope)
   - Parse categorized entries (Added, Fixed, Changed, etc.)

3. Read existing `CHANGELOG.md` (or create with Keep a Changelog header if absent):
   ```markdown
   # Changelog

   All notable changes to this project will be documented in this file.

   The format is based on [Keep a Changelog](https://keepachangelog.com/),
   and this project adheres to [Semantic Versioning](https://semver.org/).

   ## [Unreleased]
   ```

4. Merge all fragment entries into `CHANGELOG.md` under `[Unreleased]`:
   - For each category, append entries from all fragments
   - Deduplicate entries with identical text (case-insensitive)
   - Sort categories in standard order: Added, Fixed, Changed, Documentation, Testing, Maintenance
   - Within each category, sort entries alphabetically

5. Delete all processed fragment files: `rm .changelogs/*.md`
   - If `.changelogs/` is now empty, remove the directory: `rmdir .changelogs 2>/dev/null || true`

6. Stage and commit:
   ```bash
   git add CHANGELOG.md
   git rm -r --ignore-unmatch .changelogs/
   git commit -m "chore: consolidate changelog fragments"
   ```

7. Announce: "Consolidated N changelog fragments into CHANGELOG.md (M total entries across K categories)."

**YOLO/Express behavior:** Run consolidation automatically, announce inline: `YOLO: ship — Consolidated N fragments into CHANGELOG.md`

**If no fragments found:** Announce nothing; skip silently.

**Single-PR workflows (no Ship phase):** The fragment file stays on the branch. When the PR is merged manually, the fragment lands on the base branch. The next Ship phase (or manual `merge-prs` invocation) picks it up during consolidation.
```

**Step 3: Verify insertion**

Re-read lines 117–175. Confirm:
- Step 6 appears after the notification line and before `---`
- The consolidation logic covers: check, read, merge, dedup, sort, delete, commit, announce
- YOLO behavior is documented
- Single-PR fallback is documented

**Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow
git add skills/merge-prs/SKILL.md
git commit -m "feat: add changelog consolidation step to merge-prs Ship phase"
```

---

### Task 9: Add `changelog.fragments_dir` to project-context-schema.md

**Files:**
- Modify: `references/project-context-schema.md`

**Step 1: Read the schema file**

Read `/Users/weee/.claude/plugins/marketplaces/feature-flow/references/project-context-schema.md` lines 1–60.

**Step 2: Add `changelog` to the YAML schema block**

In the YAML `schema:` block, after the `yolo:` section (around line 44–46), before `plugin_registry:`, add:

```yaml
changelog:             # Optional: changelog fragment behavior
  fragments_dir: .changelogs  # Directory for per-PR changelog fragments (default: .changelogs)
```

**Step 3: Add field documentation section**

After the existing field documentation sections (find the last `### ` section and add after it), insert:

```markdown
### `changelog`

Optional configuration for changelog fragment behavior.

| Field | Default | Description |
|-------|---------|-------------|
| `fragments_dir` | `.changelogs` | Directory where per-PR changelog fragments are written. Consolidated into `CHANGELOG.md` by the Ship phase. |

When absent, defaults are used. The directory is created automatically during the "Generate CHANGELOG Entry" step if it doesn't exist.
```

**Step 4: Verify changes**

Re-read the updated schema file. Confirm:
- `changelog.fragments_dir` appears in the YAML block
- The `### \`changelog\`` section has the table with `fragments_dir`

**Step 5: Commit**

```bash
cd /Users/weee/Dev/feature-flow
git add references/project-context-schema.md
git commit -m "docs: add changelog.fragments_dir to project-context-schema"
```

---

### Task 10: Final verification pass

**Step 1: Search for remaining references to committing metadata files**

```bash
grep -r "git add FEATURE_CONTEXT.md" /Users/weee/.claude/plugins/marketplaces/feature-flow/skills/
grep -r "chore: init FEATURE_CONTEXT.md" /Users/weee/.claude/plugins/marketplaces/feature-flow/skills/
grep -r "Include all four files in the same initial commit" /Users/weee/.claude/plugins/marketplaces/feature-flow/skills/
```

Expected: no output from any command.

**Step 2: Search for remaining direct CHANGELOG.md write instructions**

```bash
grep -n "Write to CHANGELOG.md" /Users/weee/.claude/plugins/marketplaces/feature-flow/skills/start/references/inline-steps.md
grep -n "CHANGELOG.md updated with" /Users/weee/.claude/plugins/marketplaces/feature-flow/skills/start/
```

Expected: no output.

**Step 3: Verify changelog fragment write is present**

```bash
grep -n "changelogs" /Users/weee/.claude/plugins/marketplaces/feature-flow/skills/start/references/inline-steps.md
grep -n "changelogs" /Users/weee/.claude/plugins/marketplaces/feature-flow/skills/merge-prs/SKILL.md
```

Expected: multiple lines referencing `.changelogs/`.

**Step 4: Verify no dangling "deferred write" instructions**

```bash
grep -n "defer this write" /Users/weee/.claude/plugins/marketplaces/feature-flow/skills/start/SKILL.md
```

Expected: no output.

**Step 5: Verify conflict-resolution.md has no CHANGELOG row**

```bash
grep -n "CHANGELOG.md" /Users/weee/.claude/plugins/marketplaces/feature-flow/skills/merge-prs/references/conflict-resolution.md
```

Expected: no output.

**Step 6: Commit final verification note**

If any grep returned unexpected results, fix the relevant task before committing. If all clean:

```bash
cd /Users/weee/Dev/feature-flow
git log --oneline -10
```

Confirm all 9 task commits appear. No further commit needed for this task.
