# Production Cleanup — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clean up orphaned files, stale config, and version hygiene items found during production review of PRs 44-55.

**Architecture:** All changes are mechanical — file deletions, config edits, CHANGELOG versioning. No logic changes.

**Tech Stack:** Claude Code plugin (no runtime dependencies)

**Issue:** #56

**Design Doc:** `docs/plans/2026-02-21-production-cleanup.md`

---

### Task 1: Delete orphaned `skills/start-feature/` directory

The `start-feature` → `start` rename in PR #55 left the old directory behind. It contains `CLAUDE.md` and `references/CLAUDE.md` (no SKILL.md), so it's not loaded by the plugin.

**Files:**
- Delete: `skills/start-feature/` (entire directory)

**Step 1: Verify the orphaned directory exists**

Run: `ls skills/start-feature/`
Expected: `CLAUDE.md` and `references/` listed

**Step 2: Verify the replacement directory is intact**

Run: `ls skills/start/SKILL.md`
Expected: File exists

**Step 3: Delete the orphaned directory**

```bash
rm -rf skills/start-feature/
```

**Step 4: Verify deletion**

Run: `test -d skills/start-feature && echo "EXISTS" || echo "DELETED"`
Expected: `DELETED`

**Step 5: Commit**

```bash
git add -A skills/start-feature/
git commit -m "chore: delete orphaned skills/start-feature directory"
```

**Acceptance Criteria:**
- [ ] `skills/start-feature/` directory does not exist: `test -d skills/start-feature && echo FAIL || echo PASS`
- [ ] `skills/start/SKILL.md` still exists and is unchanged: `test -f skills/start/SKILL.md && echo PASS || echo FAIL`

---

### Task 2: Delete orphaned URL-named directory

An accidental directory was created from a raw GitHub URL path.

**Files:**
- Delete: `https:` (entire directory tree at project root)

**Step 1: Verify the orphaned directory exists**

Run: `ls -la "https:"`
Expected: Directory containing `raw.githubusercontent.com/`

**Step 2: Delete the orphaned directory**

```bash
rm -rf "https:"
```

**Step 3: Verify deletion**

Run: `test -d "https:" && echo "EXISTS" || echo "DELETED"`
Expected: `DELETED`

**Step 4: Commit**

```bash
git add -A "https:"
git commit -m "chore: delete accidental URL-named directory"
```

**Acceptance Criteria:**
- [ ] No directory named `https:` exists at project root: `test -d "https:" && echo FAIL || echo PASS`

---

### Task 3: Migrate context7 config and delete `.spec-driven.yml`

The old project config file still exists alongside `.feature-flow.yml`. The `context7` mapping must be migrated before deletion.

**Files:**
- Modify: `.feature-flow.yml`
- Delete: `.spec-driven.yml`

**Step 1: Read current `.feature-flow.yml`**

Current content:
```yaml
platform: cli
stack:
  - node-js
context7: {}
gotchas: []
```

**Step 2: Update `.feature-flow.yml` with migrated context7**

Replace `context7: {}` with:
```yaml
context7:
  node-js: /vercel/next.js
```

**Step 3: Verify the update**

Run: `grep 'node-js: /vercel/next.js' .feature-flow.yml`
Expected: Match found

**Step 4: Delete `.spec-driven.yml`**

```bash
rm .spec-driven.yml
```

**Step 5: Verify deletion**

Run: `test -f .spec-driven.yml && echo "EXISTS" || echo "DELETED"`
Expected: `DELETED`

**Step 6: Commit**

```bash
git add .feature-flow.yml .spec-driven.yml
git commit -m "chore: migrate context7 config from .spec-driven.yml to .feature-flow.yml"
```

**Acceptance Criteria:**
- [ ] `.spec-driven.yml` does not exist: `test -f .spec-driven.yml && echo FAIL || echo PASS`
- [ ] `.feature-flow.yml` has context7 mapping: `grep -c 'node-js: /vercel/next.js' .feature-flow.yml` returns `1`
- [ ] Other `.feature-flow.yml` fields unchanged: `grep -c 'platform: cli' .feature-flow.yml` returns `1`
- [ ] Stack field preserved: `grep -c 'node-js' .feature-flow.yml` returns at least `2` (stack + context7)

---

### Task 4: Clean untracked plan files and `superpowers/` directory

Several untracked plan docs exist from implemented PRs. The `superpowers/` directory is a stale worktree artifact (contains only `.git`).

**Files:**
- Track: `docs/plans/2026-02-20-align-test-detection-plan.md`
- Track: `docs/plans/2026-02-20-align-test-detection.md`
- Track: `docs/plans/2026-02-20-multi-agent-code-review-plan.md`
- Track: `docs/plans/2026-02-20-multi-agent-code-review.md`
- Track: `docs/plans/2026-02-20-quality-gate-tests-plan.md`
- Delete: `superpowers/` (stale worktree artifact)

**Step 1: Delete `superpowers/` directory**

```bash
rm -rf superpowers/
```

**Step 2: Verify deletion**

Run: `test -d superpowers && echo "EXISTS" || echo "DELETED"`
Expected: `DELETED`

**Step 3: Commit the untracked plan files**

```bash
git add docs/plans/2026-02-20-align-test-detection-plan.md docs/plans/2026-02-20-align-test-detection.md docs/plans/2026-02-20-multi-agent-code-review-plan.md docs/plans/2026-02-20-multi-agent-code-review.md docs/plans/2026-02-20-quality-gate-tests-plan.md
git commit -m "docs: track plan files from PRs 44-55"
```

**Step 4: Verify clean state**

Run: `git status --porcelain docs/plans/2026-02-20-*.md superpowers/`
Expected: Empty output (no untracked plan files, no superpowers/)

**Acceptance Criteria:**
- [ ] All 5 plan files are tracked: `git ls-files docs/plans/2026-02-20-align-test-detection-plan.md docs/plans/2026-02-20-align-test-detection.md docs/plans/2026-02-20-multi-agent-code-review-plan.md docs/plans/2026-02-20-multi-agent-code-review.md docs/plans/2026-02-20-quality-gate-tests-plan.md | wc -l` returns `5`
- [ ] `superpowers/` is deleted: `test -d superpowers && echo FAIL || echo PASS`
- [ ] No untracked plan files from 2026-02-20: `git status --porcelain docs/plans/2026-02-20-*.md 2>/dev/null | wc -l` returns `0`

---

### Task 5: Version the `[Unreleased]` CHANGELOG section to `1.15.0`

The `[Unreleased]` section contains all work from PRs 44-55, which corresponds to version 1.15.0.

**Files:**
- Modify: `CHANGELOG.md`

**Step 1: Replace `[Unreleased]` heading with versioned heading**

In `CHANGELOG.md`, replace:
```
## [Unreleased]
```
with:
```
## [Unreleased]

## [1.15.0] - 2026-02-21
```

This adds a new empty `[Unreleased]` section above the versioned section.

**Step 2: Verify the change**

Run: `grep -c '## \[1.15.0\] - 2026-02-21' CHANGELOG.md`
Expected: `1`

Run: `grep -c '## \[Unreleased\]' CHANGELOG.md`
Expected: `1`

**Step 3: Verify no entries were lost**

Run: `grep -c '### Added' CHANGELOG.md`
Expected: Same count as before the edit

**Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "chore: version CHANGELOG [Unreleased] as 1.15.0"
```

**Acceptance Criteria:**
- [ ] CHANGELOG.md has versioned section: `grep -c '## \[1.15.0\] - 2026-02-21' CHANGELOG.md` returns `1`
- [ ] CHANGELOG.md has empty Unreleased section: `grep -c '## \[Unreleased\]' CHANGELOG.md` returns `1`
- [ ] Unreleased appears before 1.15.0: `grep -n '## \[' CHANGELOG.md | head -2` shows Unreleased on a lower line number than 1.15.0
- [ ] No entries lost: `grep -c '### Added' CHANGELOG.md` returns at least `10`

---

### Task 6: Verify version consistency

Confirm all three version sources agree on 1.15.0.

**Files:**
- Read-only: `.claude-plugin/plugin.json`
- Read-only: `.claude-plugin/marketplace.json`
- Read-only: `CHANGELOG.md`

**Step 1: Check plugin.json version**

Run: `grep '"version"' .claude-plugin/plugin.json`
Expected: Contains `"1.15.0"`

**Step 2: Check marketplace.json version**

Run: `grep '"version"' .claude-plugin/marketplace.json`
Expected: Contains `"1.15.0"`

**Step 3: Check CHANGELOG version**

Run: `grep '## \[1.15.0\]' CHANGELOG.md`
Expected: Match found

**Acceptance Criteria:**
- [ ] `plugin.json` version is 1.15.0: `grep -c '"version": "1.15.0"' .claude-plugin/plugin.json` returns `1`
- [ ] `marketplace.json` version is 1.15.0: `grep -c '"version": "1.15.0"' .claude-plugin/marketplace.json` returns `1`
- [ ] CHANGELOG has 1.15.0 section: `grep -c '## \[1.15.0\]' CHANGELOG.md` returns `1`

---

### Task 7: Add `skills/session-report/CLAUDE.md`

Every other skill directory has a `CLAUDE.md` for claude-mem context. `session-report` is the only one missing it.

**Files:**
- Create: `skills/session-report/CLAUDE.md`

**Step 1: Create the file with standard claude-mem template**

```markdown
<claude-mem-context>
# Recent Activity

<!-- This section is auto-generated by claude-mem. Edit content outside the tags. -->

*No recent activity*
</claude-mem-context>
```

This matches the format used by `skills/spike/CLAUDE.md`, `skills/create-issue/CLAUDE.md`, and other skill directories.

**Step 2: Verify the file exists**

Run: `test -f skills/session-report/CLAUDE.md && echo "EXISTS" || echo "MISSING"`
Expected: `EXISTS`

**Step 3: Commit**

Note: `.gitignore` contains `**/CLAUDE.md`. This file will be ignored by git. That's acceptable — CLAUDE.md files are local-only by design. Skip the commit.

**Acceptance Criteria:**
- [ ] `skills/session-report/CLAUDE.md` exists: `test -f skills/session-report/CLAUDE.md && echo PASS || echo FAIL`
- [ ] File contains claude-mem-context tag: `grep -c 'claude-mem-context' skills/session-report/CLAUDE.md` returns `2`

---

### Task 8: Clean stale worktrees

Prune any stale worktree references.

**Step 1: List current worktrees**

Run: `git worktree list`
Expected: Only the main worktree at `/Users/weee/Dev/feature-flow`

**Step 2: Prune stale worktrees**

```bash
git worktree prune
```

**Step 3: Verify**

Run: `git worktree list`
Expected: Only the main worktree listed

**Acceptance Criteria:**
- [ ] `git worktree prune` completes without errors
- [ ] `git worktree list | wc -l` returns `1` (only main worktree)

---

### Task 9: Verify `references/stacks/CLAUDE.md` claude-mem entries

The file contains auto-generated claude-mem entries referencing `spec-driven` (the old plugin name). Since these are auto-generated historical records, they document what happened at that time and are acceptable as-is.

**Files:**
- Read-only: `references/stacks/CLAUDE.md`

**Step 1: Read and verify**

Run: `cat references/stacks/CLAUDE.md`
Expected: Contains claude-mem entries. `spec-driven` references are historical and acceptable.

**Acceptance Criteria:**
- [ ] File exists and has content: `test -s references/stacks/CLAUDE.md && echo PASS || echo FAIL`
- [ ] MANUAL: Entries are acceptable historical records (no action needed)
