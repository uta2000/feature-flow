# Artifact Path Threading Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Thread artifact paths (plan file, design doc, worktree, base branch, issue number) through the lifecycle so downstream skills receive them explicitly instead of re-discovering via Glob.

**Architecture:** Three targeted text additions to SKILL.md files. The `start` skill gains a Lifecycle Context Object that accumulates paths and injects them into all Skill invocations. The `verify-acceptance-criteria` and `subagent-driven-development` skills gain a new Step 0 / preamble that checks ARGUMENTS for a provided path before falling back to Glob. No code is involved — these are markdown instruction files.

**Tech Stack:** Markdown (SKILL.md files), plain text editing

---

### Task 1: Add lifecycle context object to start skill

**Files:**
- Modify: `skills/start/SKILL.md` (1581 lines — design-first)

**Design-first required:** Read `skills/start/SKILL.md` and output a change plan before editing.

**Change plan (output before editing):**
1. After the Express Propagation section (around line 480), add a new `**Lifecycle Context Object:**` paragraph
2. Update the YOLO Propagation example block (lines 468–471) to show lifecycle context fields
3. Update the Express Propagation example block (lines 475–478) to show lifecycle context fields
4. In the Subagent-Driven Development YOLO Override section, add item 0 instructing the orchestrator to pass `plan_file`, `design_doc`, `worktree`, `base_branch`, and `issue` in the skill invocation args

**Step 1: Verify current state**

Confirm these strings exist in `skills/start/SKILL.md`:

```
Skill(skill: "superpowers:brainstorming", args: "yolo: true. scope: [scope]. [original args]")
```

and

```
Additional YOLO behavior:
1. If any subagent (implementer, spec reviewer,
```

Run: `grep -n "lifecycle context\|Lifecycle Context" skills/start/SKILL.md`
Expected: No matches (section does not yet exist)

**Step 2: Edit — add Lifecycle Context Object section**

In `skills/start/SKILL.md`, find the Express Propagation block ending:

```
For inline steps (CHANGELOG generation, self-review, code review, study existing patterns), the mode flag is already in the conversation context — no explicit propagation is needed.
```

Insert the following paragraph immediately after that line (before the blank line that precedes `**Do not skip steps.**`):

```

**Lifecycle Context Object:** As the lifecycle executes, maintain a context object that accumulates artifact paths as they become known. Include all known paths in the `args` of every subsequent `Skill` invocation, after the mode flag and scope:

| Path key | When it becomes available |
|----------|--------------------------|
| `base_branch` | Step 0 — base branch detection |
| `issue` | Step 1 — when an issue number is linked |
| `design_doc` | After design document step (the absolute path returned by the skill) |
| `plan_file` | After implementation plan step (the absolute path of the saved plan file) |
| `worktree` | After worktree setup (the absolute path to the created worktree) |

Include only paths that are known at the time of each invocation — do not include paths for artifacts that haven't been created yet. Example invocations showing progressive accumulation:

```
# Before design doc (base_branch and issue known):
Skill(skill: "superpowers:brainstorming", args: "yolo: true. scope: [scope]. base_branch: main. issue: 119. [original args]")

# Before implementation (plan_file and design_doc known, worktree not yet):
Skill(skill: "superpowers:writing-plans", args: "yolo: true. scope: [scope]. base_branch: main. issue: 119. design_doc: /abs/path/design.md. [original args]")

# During and after implementation (all paths known):
Skill(skill: "superpowers:subagent-driven-development", args: "yolo: true. scope: [scope]. plan_file: /abs/path/plan.md. design_doc: /abs/path/design.md. worktree: /abs/path/.worktrees/feat-xyz. base_branch: main. issue: 119. [original args]")
Skill(skill: "feature-flow:verify-acceptance-criteria", args: "plan_file: /abs/path/plan.md. [original args]")
```
```

**Step 3: Edit — update Subagent-Driven Development YOLO Override**

Find in `skills/start/SKILL.md`:

```
Additional YOLO behavior:
1. If any subagent (implementer, spec reviewer, or code quality reviewer) surfaces questions that would normally require user input, auto-answer them from the implementation plan, design document, and codebase context. Announce each: `YOLO: subagent-driven-development — [question] → [answer from context]`
```

Replace with:

```
Additional YOLO behavior:
0. **Pass lifecycle context in args.** When invoking this skill, include all known artifact paths: `plan_file`, `design_doc`, `worktree`, `base_branch`, `issue` (per the Lifecycle Context Object section). The skill uses `plan_file` directly to read the plan instead of discovering it via Glob.
1. If any subagent (implementer, spec reviewer, or code quality reviewer) surfaces questions that would normally require user input, auto-answer them from the implementation plan, design document, and codebase context. Announce each: `YOLO: subagent-driven-development — [question] → [answer from context]`
```

**Step 4: Verify edits**

Run: `grep -n "Lifecycle Context Object\|plan_file.*design_doc\|item 0\|Pass lifecycle context" skills/start/SKILL.md`
Expected: Matches found in both the new section and the Subagent-Driven Development YOLO Override.

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat(start): add lifecycle context object for artifact path threading"
```

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains a "Lifecycle Context Object" paragraph after the Express Propagation section
- [ ] The paragraph includes a table listing `base_branch`, `issue`, `design_doc`, `plan_file`, `worktree` and when each becomes available
- [ ] The paragraph includes example Skill invocations showing progressive path accumulation
- [ ] The Subagent-Driven Development YOLO Override section contains item 0 instructing the orchestrator to pass all known paths in the skill invocation args
- [ ] `grep -n "Lifecycle Context Object" skills/start/SKILL.md` returns at least one match

**Quality Constraints:**
- Pattern: Follow the existing YOLO/Express Propagation paragraph style (bold heading, explanatory text, fenced code example)
- Files modified: `skills/start/SKILL.md` (design-first, 1581 lines)

---

### Task 2: Update verify-acceptance-criteria to accept plan_file arg

**Files:**
- Modify: `skills/verify-acceptance-criteria/SKILL.md` (134 lines)

**Step 1: Verify current state**

Run: `grep -n "plan_file\|provided in ARGUMENTS" skills/verify-acceptance-criteria/SKILL.md`
Expected: No matches

**Step 2: Edit — add plan_file fast-path to Step 1**

In `skills/verify-acceptance-criteria/SKILL.md`, find the current Step 1 opening:

```
### Step 1: Find the Plan File

Look for the plan file:
1. If the user specified a path, use it
2. Otherwise, find the most recently modified `.md` file in the plans directory:
```

Replace with:

```
### Step 1: Find the Plan File

**If `plan_file` is provided in ARGUMENTS** (e.g., `plan_file: /abs/path/to/plan.md`): Parse the value and use that path directly. Skip the Glob and user confirmation. Announce: "Using provided plan file: [path]"

**Otherwise, look for the plan file:**
1. If the user specified a path, use it
2. Otherwise, find the most recently modified `.md` file in the plans directory:
```

**Step 3: Verify edit**

Run: `grep -n "plan_file\|provided in ARGUMENTS" skills/verify-acceptance-criteria/SKILL.md`
Expected: Two matches — one for `plan_file` in the ARGUMENTS check, one for `provided in ARGUMENTS`

**Step 4: Commit**

```bash
git add skills/verify-acceptance-criteria/SKILL.md
git commit -m "feat(verify-acceptance-criteria): accept plan_file arg to skip Glob discovery"
```

**Acceptance Criteria:**
- [ ] `skills/verify-acceptance-criteria/SKILL.md` Step 1 begins with a `plan_file` ARGUMENTS check before the Glob fallback
- [ ] The check instructs skipping the user confirmation when plan_file is provided
- [ ] The existing Glob-based discovery remains intact as the fallback path
- [ ] `grep -n "plan_file" skills/verify-acceptance-criteria/SKILL.md` returns at least one match

**Quality Constraints:**
- Pattern: Follow the existing args-parsing pattern in the same skill (the "If the user specified a path, use it" style)
- Files modified: `skills/verify-acceptance-criteria/SKILL.md` (134 lines — no design-first required)

---

### Task 3: Update subagent-driven-development to accept plan_file arg

> **Note:** This file is in the superpowers plugin cache at `/Users/weee/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/subagent-driven-development/SKILL.md`. Changes here will be lost if the superpowers plugin is updated. A follow-up issue should be filed with the superpowers maintainers to incorporate this change upstream.

**Files:**
- Modify: `/Users/weee/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/subagent-driven-development/SKILL.md` (240 lines — design-first)

**Design-first required:** Read the file and output a change plan before editing.

**Change plan (output before editing):**
Insert a new `## Plan File Discovery` section between the closing `}` of the flow diagram (after line ~83) and the `## Prompt Templates` heading. This section explains how to find the plan file: check ARGUMENTS for `plan_file`, fall back to Glob if absent.

**Step 1: Verify current state**

Run: `grep -n "plan_file\|Plan File Discovery" /Users/weee/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/subagent-driven-development/SKILL.md`
Expected: No matches

**Step 2: Edit — add Plan File Discovery section**

In the subagent-driven-development SKILL.md, find the line immediately before `## Prompt Templates`:

```
## Prompt Templates
```

Insert the following section immediately before it:

```
## Plan File Discovery

**If `plan_file` is provided in ARGUMENTS** (e.g., `plan_file: /abs/path/to/plan.md`): Use that path directly to read the plan. Skip Glob. Announce: "Using provided plan file: [path]"

**Otherwise:** Discover via:
```
Glob: docs/plans/*.md
```
Pick the most recently modified `.md` file. If no files found, ask the user for the plan file path.

This step corresponds to "Read plan, extract all tasks with full text, note context, create TodoWrite" in the process diagram above.

```

**Step 3: Verify edit**

Run: `grep -n "Plan File Discovery\|plan_file" /Users/weee/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/subagent-driven-development/SKILL.md`
Expected: Matches in the new section

**Step 4: Commit**

```bash
git add /Users/weee/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/subagent-driven-development/SKILL.md
git commit -m "feat(subagent-driven-development): accept plan_file arg to skip Glob discovery"
```

**Acceptance Criteria:**
- [ ] `subagent-driven-development/SKILL.md` contains a `## Plan File Discovery` section before `## Prompt Templates`
- [ ] The section instructs using `plan_file` from ARGUMENTS directly when provided
- [ ] The existing Glob-based discovery remains as the fallback
- [ ] `grep -n "plan_file" /Users/weee/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3/skills/subagent-driven-development/SKILL.md` returns at least one match

**Quality Constraints:**
- Pattern: Follow the args-parsing style from verify-acceptance-criteria (bold `**If plan_file is provided in ARGUMENTS**` heading)
- Files modified: `subagent-driven-development/SKILL.md` (design-first, 240 lines)
- Note: Cache-only change — file `docs/plans/2026-03-01-artifact-paths-119-plan.md` references this limitation

---

## Overall Acceptance Criteria (from issue #119)

- [ ] `start` skill maintains artifact paths as they are created (plan, design doc, worktree, base branch, issue number) — verified by Task 1
- [ ] All Skill invocations include known artifact paths in the `args` parameter — verified by Task 1 examples
- [ ] `subagent-driven-development` accepts and uses `plan_file` path when provided — verified by Task 3
- [ ] `verify-acceptance-criteria` accepts and uses `plan_file` path when provided — verified by Task 2
- [ ] Skills fall back to Glob-based discovery when paths are not provided — verified by Tasks 2 and 3 (fallback paths intact)
- [ ] No path re-discovery errors in sessions where paths are passed — [MANUAL] verify in a real lifecycle run
