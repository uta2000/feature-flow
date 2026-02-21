# Rename Plugin to feature-flow — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename every occurrence of `spec-driven` to `feature-flow` across all 35 files in the repo, bump version to 1.14.0, and add a CHANGELOG rename entry.

**Architecture:** Pure text find-and-replace. No logic or behavioral changes. Eight replacement rules applied in grouped batches by file type. Verification via grep for zero remaining occurrences.

**Tech Stack:** Markdown, JSON, JavaScript (Node.js hook scripts)

---

### Task 1: Rename in plugin config files

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

**Step 1: Update plugin.json**

Replace `spec-driven` with `feature-flow` in all 4 occurrences:
- `"name": "spec-driven"` → `"name": "feature-flow"`
- `"homepage": "https://github.com/uta2000/spec-driven"` → `"homepage": "https://github.com/uta2000/feature-flow"`
- `"repository": "https://github.com/uta2000/spec-driven"` → `"repository": "https://github.com/uta2000/feature-flow"`
- `"keywords": ["spec-driven",` → `"keywords": ["feature-flow",`

Also bump version: `"version": "1.13.0"` → `"version": "1.14.0"`

**Step 2: Update marketplace.json**

Replace all 3 occurrences of `spec-driven` with `feature-flow`:
- Top-level `"name": "spec-driven"` → `"name": "feature-flow"`
- Nested plugin `"name": "spec-driven"` → `"name": "feature-flow"`
- Nested plugin `"description"` — replace `spec-driven` if present

Also bump nested version: `"version": "1.6.0"` → `"version": "1.14.0"`

**Step 3: Verify**

Run: `grep -c 'spec-driven' .claude-plugin/plugin.json .claude-plugin/marketplace.json`
Expected: Both files show 0

**Step 4: Commit**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "chore: rename spec-driven to feature-flow in plugin config"
```

**Acceptance Criteria:**
- [ ] `grep -c 'spec-driven' .claude-plugin/plugin.json` returns `0`
- [ ] `grep -c 'spec-driven' .claude-plugin/marketplace.json` returns `0`
- [ ] `grep -c 'feature-flow' .claude-plugin/plugin.json` returns `4` or more
- [ ] `grep -c 'feature-flow' .claude-plugin/marketplace.json` returns `2` or more
- [ ] `grep -c '"version": "1.14.0"' .claude-plugin/plugin.json` returns `1`

---

### Task 2: Rename in hook scripts

**Files:**
- Modify: `hooks/scripts/quality-gate.js` (14 occurrences)
- Modify: `hooks/scripts/lint-file.js` (2 occurrences)

**Step 1: Update quality-gate.js**

Use `replace_all` to replace `spec-driven` with `feature-flow`. This covers:
- All `[spec-driven]` log prefixes (lines 11-14, 63, 115, 122, 138, 186, 191, 210, 216)
- The `.spec-driven.yml` existence check (line 90) → `.feature-flow.yml`

**Step 2: Update lint-file.js**

Use `replace_all` to replace `spec-driven` with `feature-flow`. This covers:
- `[spec-driven] LINT ERRORS` prefix (line 20)
- `[spec-driven] lint-file hook error` prefix (line 24)

**Step 3: Verify**

Run: `grep -c 'spec-driven' hooks/scripts/quality-gate.js hooks/scripts/lint-file.js`
Expected: Both files show 0

**Step 4: Commit**

```bash
git add hooks/scripts/quality-gate.js hooks/scripts/lint-file.js
git commit -m "chore: rename spec-driven to feature-flow in hook scripts"
```

**Acceptance Criteria:**
- [ ] `grep -c 'spec-driven' hooks/scripts/quality-gate.js` returns `0`
- [ ] `grep -c 'spec-driven' hooks/scripts/lint-file.js` returns `0`
- [ ] `grep -c 'feature-flow' hooks/scripts/quality-gate.js` returns `14`
- [ ] `grep -c 'feature-flow' hooks/scripts/lint-file.js` returns `2`

---

### Task 3: Rename in hooks.json

**Files:**
- Modify: `hooks/hooks.json` (4 occurrences + uppercase variants)

**Step 1: Update hooks.json**

This file has minified inline Node.js in command strings. Carefully replace:

1. In the PreToolUse Write hook (line 9): `.spec-driven.yml` → `.feature-flow.yml` (2 occurrences in that command string) and `[spec-driven]` → `[feature-flow]`
2. In the PostToolUse Write hook (line 39): `[spec-driven]` → `[feature-flow]`
3. In the PostToolUse Edit hook (line 54): `[spec-driven]` → `[feature-flow]`
4. In the SessionStart hook (line 70):
   - `.spec-driven.yml` → `.feature-flow.yml` (3 occurrences in that command)
   - `SPEC-DRIVEN DEVELOPMENT ACTIVE` → `FEATURE-FLOW DEVELOPMENT ACTIVE`
   - `SPEC-DRIVEN is installed` → `FEATURE-FLOW is installed`
   - `spec-driven will auto-detect` → `feature-flow will auto-detect`
   - `.spec-driven.yml` refs within the upgrade notice → `.feature-flow.yml`

Use `replace_all` with `spec-driven` → `feature-flow` first, then separately `SPEC-DRIVEN` → `FEATURE-FLOW`.

**Step 2: Verify**

Run: `grep -c 'spec-driven' hooks/hooks.json && grep -c 'SPEC-DRIVEN' hooks/hooks.json`
Expected: Both return 0

**Step 3: Commit**

```bash
git add hooks/hooks.json
git commit -m "chore: rename spec-driven to feature-flow in hooks.json"
```

**Acceptance Criteria:**
- [ ] `grep -ci 'spec-driven' hooks/hooks.json` returns `0` (case-insensitive, catches both cases)
- [ ] `grep -c 'feature-flow' hooks/hooks.json` returns at least `4`
- [ ] `grep -c 'FEATURE-FLOW' hooks/hooks.json` returns at least `2`
- [ ] `grep -c '.feature-flow.yml' hooks/hooks.json` returns at least `2`

---

### Task 4: Rename in skill files

**Files:**
- Modify: `skills/start-feature/SKILL.md` (21 occurrences)
- Modify: `skills/design-verification/SKILL.md` (11 occurrences)
- Modify: `skills/spike/SKILL.md` (5 occurrences)
- Modify: `skills/design-document/SKILL.md` (3 occurrences)
- Modify: `skills/create-issue/SKILL.md` (1 occurrence)
- Modify: `skills/verify-plan-criteria/SKILL.md` (1 occurrence)

**Step 1: Update each skill file**

For each file, use `replace_all` to replace `spec-driven` with `feature-flow`. This covers:
- All `.spec-driven.yml` config file references → `.feature-flow.yml`
- All `spec-driven` plugin name mentions → `feature-flow`
- All `spec-driven:` skill prefixes in documentation → `feature-flow:`

**Step 2: Verify**

Run: `grep -rl 'spec-driven' skills/`
Expected: No files returned

**Step 3: Commit**

```bash
git add skills/
git commit -m "chore: rename spec-driven to feature-flow in skill files"
```

**Acceptance Criteria:**
- [ ] `grep -c 'spec-driven' skills/start-feature/SKILL.md` returns `0`
- [ ] `grep -c 'spec-driven' skills/design-verification/SKILL.md` returns `0`
- [ ] `grep -c 'spec-driven' skills/spike/SKILL.md` returns `0`
- [ ] `grep -c 'spec-driven' skills/design-document/SKILL.md` returns `0`
- [ ] `grep -c 'spec-driven' skills/create-issue/SKILL.md` returns `0`
- [ ] `grep -c 'spec-driven' skills/verify-plan-criteria/SKILL.md` returns `0`
- [ ] `grep -c 'feature-flow' skills/start-feature/SKILL.md` returns `21` or more
- [ ] `grep -c 'feature-flow' skills/design-verification/SKILL.md` returns `11` or more

---

### Task 5: Rename in reference files

**Files:**
- Modify: `references/auto-discovery.md` (9 occurrences)
- Modify: `references/project-context-schema.md` (5 occurrences)
- Modify: `references/coding-standards.md` (1 occurrence)

**Step 1: Update each reference file**

For each file, use `replace_all` to replace `spec-driven` with `feature-flow`.

**Step 2: Verify**

Run: `grep -rl 'spec-driven' references/`
Expected: No files returned

**Step 3: Commit**

```bash
git add references/
git commit -m "chore: rename spec-driven to feature-flow in reference files"
```

**Acceptance Criteria:**
- [ ] `grep -c 'spec-driven' references/auto-discovery.md` returns `0`
- [ ] `grep -c 'spec-driven' references/project-context-schema.md` returns `0`
- [ ] `grep -c 'spec-driven' references/coding-standards.md` returns `0`
- [ ] `grep -c 'feature-flow' references/auto-discovery.md` returns `9` or more

---

### Task 6: Rename in README.md

**Files:**
- Modify: `README.md` (28 occurrences)

**Step 1: Update README.md**

Use `replace_all` to replace `spec-driven` with `feature-flow`. This covers:
- Plugin name in title (`# spec-driven` → `# feature-flow`)
- All `claude plugins add spec-driven` install commands
- All `.spec-driven.yml` config file refs → `.feature-flow.yml`
- All `github.com/uta2000/spec-driven` URLs → `github.com/uta2000/feature-flow`
- All prose mentions of `spec-driven` → `feature-flow`

**Step 2: Verify**

Run: `grep -c 'spec-driven' README.md`
Expected: 0

**Step 3: Commit**

```bash
git add README.md
git commit -m "chore: rename spec-driven to feature-flow in README"
```

**Acceptance Criteria:**
- [ ] `grep -c 'spec-driven' README.md` returns `0`
- [ ] `grep -c 'feature-flow' README.md` returns `28` or more

---

### Task 7: Rename in CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md` (9 occurrences in `[Unreleased]` section)

**Step 1: Update [Unreleased] section**

Replace all `spec-driven` mentions **only within the `[Unreleased]` section** with `feature-flow`. Do NOT modify historical version entries below `## [1.12.0]` — they document what the plugin was called at that time.

Specifically, in the `[Unreleased]` section:
- Line 2: `All notable changes to the spec-driven plugin.` → `All notable changes to the feature-flow plugin.`
- All `spec-driven` mentions in the unreleased Added/Fixed entries → `feature-flow`

**Step 2: Add rename entry**

Add this line at the top of the `### Added` section under `[Unreleased]`:
```
- **Renamed plugin** from `spec-driven` to `feature-flow` — config file changed from `.spec-driven.yml` to `.feature-flow.yml`
```

**Step 3: Verify**

Run: `grep -c 'spec-driven' CHANGELOG.md`
Expected: A count matching only historical entries (lines below `## [1.12.0]`). The `[Unreleased]` section should have 0 occurrences of `spec-driven`.

Verify the rename entry exists:
Run: `grep -c 'Renamed plugin' CHANGELOG.md`
Expected: 1

**Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "chore: rename spec-driven to feature-flow in CHANGELOG"
```

**Acceptance Criteria:**
- [ ] `sed -n '1,/^## \[1\.12/p' CHANGELOG.md | grep -c 'spec-driven'` returns `0` (no occurrences in Unreleased section)
- [ ] `grep -c 'Renamed plugin' CHANGELOG.md` returns `1`
- [ ] `grep -c 'feature-flow' CHANGELOG.md` returns at least `9`
- [ ] Historical entries below `## [1.12.0]` are unchanged (still contain `spec-driven` where they originally did)

---

### Task 8: Rename in historical plan files

**Files:**
- Modify: All `.md` files in `docs/plans/` (19 files with `spec-driven` refs, 75 total occurrences)

**Step 1: Bulk rename in plan files**

For each plan file that contains `spec-driven`, use `replace_all` to replace `spec-driven` with `feature-flow`. The files are:

1. `docs/plans/2026-02-19-enforcement-hooks.md` (14)
2. `docs/plans/2026-02-20-enforcement-hooks-plan.md` (13)
3. `docs/plans/2026-02-20-brainstorm-ux-subagent-issue-sync-plan.md` (3)
4. `docs/plans/2026-02-20-brainstorm-ux-subagent-issue-sync.md` (2)
5. `docs/plans/2026-02-20-quality-gate-tests-plan.md` (4)
6. `docs/plans/2026-02-20-multi-agent-code-review.md` (2)
7. `docs/plans/2026-02-20-multi-agent-code-review-plan.md` (3)
8. `docs/plans/2026-02-20-changelog-generation-plan.md` (3)
9. `docs/plans/2026-02-20-changelog-generation.md` (1)
10. `docs/plans/2026-02-20-yolo-mode.md` (4)
11. `docs/plans/2026-02-20-yolo-mode-plan.md` (5)
12. `docs/plans/2026-02-20-parallelize-skill-operations.md` (5)
13. `docs/plans/2026-02-20-parallelize-skill-operations-plan.md` (4)
14. `docs/plans/2026-02-20-model-routing.md` (1)
15. `docs/plans/2026-02-20-model-routing-plan.md` (3)
16. `docs/plans/2026-02-20-scope-aware-yolo.md` (1)
17. `docs/plans/2026-02-20-scope-aware-yolo-plan.md` (2)
18. `docs/plans/2026-02-21-worktree-env-files.md` (3)
19. `docs/plans/2026-02-21-worktree-env-files-plan.md` (2)

Skip: `docs/plans/2026-02-20-structural-anti-patterns-plan.md` (0 occurrences), `docs/plans/2026-02-20-align-test-detection.md` (0), `docs/plans/2026-02-20-align-test-detection-plan.md` (0), `docs/plans/CLAUDE.md` (0), and the rename design doc itself.

**Step 2: Verify**

Run: `grep -rl 'spec-driven' docs/plans/`
Expected: No files returned (or only the rename design doc itself if it contains the old name in historical context)

**Step 3: Commit**

```bash
git add docs/plans/
git commit -m "chore: rename spec-driven to feature-flow in historical plan files"
```

**Acceptance Criteria:**
- [ ] `grep -rl 'spec-driven' docs/plans/ | grep -v 'rename-to-feature-flow'` returns no files
- [ ] `grep -c 'feature-flow' docs/plans/2026-02-19-enforcement-hooks.md` returns `14` or more
- [ ] `grep -c 'feature-flow' docs/plans/2026-02-20-enforcement-hooks-plan.md` returns `13` or more

---

### Task 9: Final verification sweep

**Files:**
- None (verification only)

**Step 1: Full grep sweep**

Run: `grep -r 'spec-driven' --include='*.md' --include='*.json' --include='*.js' --include='*.yml' . | grep -v '.worktrees/' | grep -v '.git/' | grep -v 'node_modules/'`

Expected: Zero lines, OR only intentional historical references in CHANGELOG.md below the `[1.12.0]` heading.

**Step 2: Check for SPEC-DRIVEN uppercase**

Run: `grep -ri 'SPEC-DRIVEN' --include='*.md' --include='*.json' --include='*.js' . | grep -v '.worktrees/' | grep -v '.git/'`

Expected: Zero lines.

**Step 3: Verify .feature-flow.yml references work**

Run: `grep -r '.feature-flow.yml' --include='*.md' --include='*.json' --include='*.js' . | grep -v '.worktrees/' | grep -v '.git/' | wc -l`

Expected: At least 20 (the ~98 original `.spec-driven.yml` refs, now `.feature-flow.yml`)

**Acceptance Criteria:**
- [ ] `grep -r 'spec-driven' --include='*.md' --include='*.json' --include='*.js' . | grep -v '.worktrees/' | grep -v '.git/' | grep -v 'node_modules/' | grep -v 'CHANGELOG.md'` returns empty
- [ ] `grep -r 'spec-driven' CHANGELOG.md | grep -v '^\#\# \[1\.'` filtered to only Unreleased section returns empty
- [ ] `grep -ri 'SPEC-DRIVEN' --include='*.md' --include='*.json' --include='*.js' . | grep -v '.worktrees/' | grep -v '.git/'` returns empty
- [ ] Version in `.claude-plugin/plugin.json` is `1.14.0`
