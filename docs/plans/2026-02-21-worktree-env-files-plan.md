# Worktree Env File Copying — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Copy Env Files" inline step to `start-feature/SKILL.md` so gitignored `.env` files are available in new worktrees before tests run.

**Architecture:** Single-file modification to `skills/start-feature/SKILL.md`. Insert a new inline step section between Commit Planning Artifacts and Study Existing Patterns. Update the three scope step lists and the skill mapping table with the new step.

**Tech Stack:** Markdown (skill definition file), Bash (code examples within the skill)

**Design Doc:** `docs/plans/2026-02-21-worktree-env-files.md`
**Issue:** #26

---

### Task 1: Add "Copy env files" to the Small Enhancement step list

**Files:**
- Modify: `skills/start-feature/SKILL.md:226-243`

**Step 1: Insert the new step and renumber**

In the Small Enhancement step list, insert `- [ ] 9. Copy env files` after `- [ ] 8. Worktree setup` (line 235) and before the current `- [ ] 9. Study existing patterns` (line 236). Renumber all subsequent steps (9→10 through 15→16).

The updated list should be:

```
- [ ] 1. Brainstorm requirements
- [ ] 2. Documentation lookup (Context7)
- [ ] 3. Design document
- [ ] 4. Create issue
- [ ] 5. Implementation plan
- [ ] 6. Verify plan criteria
- [ ] 7. Commit planning artifacts
- [ ] 8. Worktree setup
- [ ] 9. Copy env files
- [ ] 10. Study existing patterns
- [ ] 11. Implement (TDD)
- [ ] 12. Self-review
- [ ] 13. Code review
- [ ] 14. Generate CHANGELOG entry
- [ ] 15. Final verification
- [ ] 16. Commit and PR
```

**Acceptance Criteria:**
- [ ] The Small Enhancement step list contains `- [ ] 9. Copy env files` immediately after `- [ ] 8. Worktree setup`
- [ ] The Small Enhancement step list contains 16 steps numbered 1–16 sequentially
- [ ] `Study existing patterns` is now step 10 (was 9)
- [ ] `Commit and PR` is now step 16 (was 15)

---

### Task 2: Add "Copy env files" to the Feature step list

**Files:**
- Modify: `skills/start-feature/SKILL.md:245-263`

**Step 1: Insert the new step and renumber**

In the Feature step list, insert `- [ ] 10. Copy env files` after `- [ ] 9. Worktree setup` (line 255) and before the current `- [ ] 10. Study existing patterns` (line 256). Renumber all subsequent steps (10→11 through 16→17).

The updated list should be:

```
- [ ] 1. Brainstorm requirements
- [ ] 2. Documentation lookup (Context7)
- [ ] 3. Design document
- [ ] 4. Design verification
- [ ] 5. Create issue
- [ ] 6. Implementation plan
- [ ] 7. Verify plan criteria
- [ ] 8. Commit planning artifacts
- [ ] 9. Worktree setup
- [ ] 10. Copy env files
- [ ] 11. Study existing patterns
- [ ] 12. Implement (TDD)
- [ ] 13. Self-review
- [ ] 14. Code review
- [ ] 15. Generate CHANGELOG entry
- [ ] 16. Final verification
- [ ] 17. Commit and PR
```

**Acceptance Criteria:**
- [ ] The Feature step list contains `- [ ] 10. Copy env files` immediately after `- [ ] 9. Worktree setup`
- [ ] The Feature step list contains 17 steps numbered 1–17 sequentially
- [ ] `Study existing patterns` is now step 11 (was 10)
- [ ] `Commit and PR` is now step 17 (was 16)

---

### Task 3: Add "Copy env files" to the Major Feature step list

**Files:**
- Modify: `skills/start-feature/SKILL.md:265-284`

**Step 1: Insert the new step and renumber**

In the Major Feature step list, insert `- [ ] 11. Copy env files` after `- [ ] 10. Worktree setup` (line 276) and before the current `- [ ] 11. Study existing patterns` (line 277). Renumber all subsequent steps (11→12 through 17→18).

The updated list should be:

```
- [ ] 1. Brainstorm requirements
- [ ] 2. Spike / PoC (if risky unknowns)
- [ ] 3. Documentation lookup (Context7)
- [ ] 4. Design document
- [ ] 5. Design verification
- [ ] 6. Create issue
- [ ] 7. Implementation plan
- [ ] 8. Verify plan criteria
- [ ] 9. Commit planning artifacts
- [ ] 10. Worktree setup
- [ ] 11. Copy env files
- [ ] 12. Study existing patterns
- [ ] 13. Implement (TDD)
- [ ] 14. Self-review
- [ ] 15. Code review
- [ ] 16. Generate CHANGELOG entry
- [ ] 17. Final verification
- [ ] 18. Commit and PR
```

**Acceptance Criteria:**
- [ ] The Major Feature step list contains `- [ ] 11. Copy env files` immediately after `- [ ] 10. Worktree setup`
- [ ] The Major Feature step list contains 18 steps numbered 1–18 sequentially
- [ ] `Study existing patterns` is now step 12 (was 11)
- [ ] `Commit and PR` is now step 18 (was 17)

---

### Task 4: Add row to the Skill Mapping table

**Files:**
- Modify: `skills/start-feature/SKILL.md:321-344`

**Step 1: Insert new row after Worktree setup**

In the Skill Mapping table, insert a new row after `Worktree setup` (line 335) and before `Implement` (line 336):

```markdown
| Copy env files | No skill — inline step (see below) | Env files available in worktree |
```

**Acceptance Criteria:**
- [ ] The Skill Mapping table contains a row with `Copy env files` in the Step column
- [ ] That row has `No skill — inline step (see below)` in the Skill to Invoke column
- [ ] That row has `Env files available in worktree` in the Expected Output column
- [ ] The new row appears between `Worktree setup` and `Implement`

---

### Task 5: Add the Copy Env Files Step inline section

**Files:**
- Modify: `skills/start-feature/SKILL.md:445-446`

**Step 1: Insert the new inline step section**

After the Commit Planning Artifacts Step section (ends at line 444 with the edge case about `.spec-driven.yml`) and before the Study Existing Patterns Step section (starts at line 446), insert the new inline step section:

```markdown

### Copy Env Files Step (inline — no separate skill)

This step runs after worktree setup and before study existing patterns. It copies non-production `.env*` files from the main worktree into the new worktree so that tests, tools, and dependency scripts have access to environment configuration.

**Process:**
1. Locate the main worktree root:
   ```bash
   MAIN_WORKTREE=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
   ```
2. Copy non-production env files:
   ```bash
   for f in "$MAIN_WORKTREE"/.env*; do
     [ -f "$f" ] || continue
     name=$(basename "$f")
     case "$name" in
       .env.production|.env.production.local|*.production|*.production.*) continue ;;
       .env.example) continue ;;
     esac
     cp "$f" "./$name"
   done
   ```
3. **If env files were copied:** Announce what was copied: `"Copied N env files from main worktree: .env .env.local"`
4. **If no env files exist:** Silent skip — not all projects use env files. Do not warn or error.

**Why before study existing patterns:** Ensures environment variables are available for implementation, test runs, and any tools that depend on env configuration later in the lifecycle. Production files are excluded as a safety measure (principle of least privilege).

**What is skipped and why:**
- `.env.production`, `.env.production.local`, any `*.production` or `*.production.*` — never propagate production secrets to development worktrees
- `.env.example` — tracked by git, already present in the worktree automatically
```

**Acceptance Criteria:**
- [ ] A new section exists with heading `### Copy Env Files Step (inline — no separate skill)`
- [ ] The section appears after the Commit Planning Artifacts section and before the Study Existing Patterns section
- [ ] The section contains `git worktree list --porcelain` for source path resolution
- [ ] The `case` statement skips `.env.production`, `.env.production.local`, `*.production`, `*.production.*`, and `.env.example`
- [ ] The section documents both behaviors: announce when files copied, silent skip when none exist
- [ ] The section explains why it runs before study existing patterns
- [ ] The section follows the established inline step header format: `### [Name] Step (inline — no separate skill)`

---

### Task 6: Verify all changes and commit

**Step 1: Verify the complete file**

Read the full `skills/start-feature/SKILL.md` and verify:
- Small Enhancement step list has 16 steps numbered 1–16 with "Copy env files" at position 9
- Feature step list has 17 steps numbered 1–17 with "Copy env files" at position 10
- Major Feature step list has 18 steps numbered 1–18 with "Copy env files" at position 11
- Skill Mapping table has a "Copy env files" row between "Worktree setup" and "Implement"
- New inline step section exists between Commit Planning Artifacts and Study Existing Patterns
- Quick fix step list is unchanged (6 steps, no "Copy env files")
- No broken markdown formatting

**Step 2: Commit**

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat: add Copy Env Files inline step to start-feature lifecycle

Copies non-production .env* files from the main worktree into new
worktrees after setup, before study existing patterns. Prevents
baseline test failures from missing environment configuration.

Implemented in spec-driven's start-feature rather than modifying the
superpowers using-git-worktrees skill (which we don't own).

Closes #26"
```

**Acceptance Criteria:**
- [ ] `skills/start-feature/SKILL.md` contains the string `Copy Env Files`
- [ ] `skills/start-feature/SKILL.md` contains the string `git worktree list --porcelain`
- [ ] `skills/start-feature/SKILL.md` contains the string `.env.production`
- [ ] The Quick fix step list still has exactly 6 steps and does NOT contain "Copy env files"
- [ ] All three worktree-using scopes (small enhancement, feature, major feature) contain "Copy env files" immediately after "Worktree setup"
- [ ] The git commit succeeds with no errors
