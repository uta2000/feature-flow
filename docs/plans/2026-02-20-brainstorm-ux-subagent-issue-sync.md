# Brainstorming UX, Auto-Select Subagent, Issue Sync — Design Document

**Date:** 2026-02-20
**Status:** Draft
**Issue:** #2

## Overview

Three improvements to the spec-driven feature lifecycle. (1) Brainstorming interview questions get a concise format — plain English explanation, one example per option, and a recommendation tag. (2) The implementation dispatch choice between subagent-driven and parallel session is removed — subagent-driven is always selected automatically. (3) When the user starts a feature from an existing GitHub issue, the lifecycle pulls the issue body + comments as context and updates the issue after design instead of creating a duplicate.

## Change 1: Brainstorming Interview Format

**File:** `skills/start-feature/SKILL.md`

**What:** Add an inline section after the skill mapping table that specifies the required question format when `superpowers:brainstorming` is invoked from the spec-driven lifecycle.

**Format per question:**
```
**[Question]**
*Why this matters:* [1 sentence on impact to the design]
- **Option A** — e.g., [concrete example]. *Recommended*
- **Option B** — e.g., [concrete example]
```

**Where it goes:** New subsection under the skill mapping table (after line ~219), titled "Brainstorming Interview Format Override". This section instructs the orchestrator to pass format guidance as context when invoking the brainstorming skill.

**Why not modify superpowers directly:** The superpowers plugin is a third-party dependency. Overriding behavior from the calling skill keeps changes local and upgrade-safe.

## Change 2: Auto-Select Subagent-Driven Implementation

**File:** `skills/start-feature/SKILL.md`

**What:** Two changes to the skill mapping and lifecycle flow:

1. **Implementation plan step override:** After `superpowers:writing-plans` saves the plan and presents the execution choice, start-feature instructs to always select "Subagent-Driven (this session)" without prompting the user.

2. **Implement step update:** Change the "Implement" row in the skill mapping table from `superpowers:test-driven-development` to `superpowers:subagent-driven-development`. Subagent-driven already includes TDD plus spec review and code quality review — it's a strict superset.

**Where it goes:**
- New note under the skill mapping table for the "Implementation plan" row explaining the override
- Updated "Implement" row in the mapping table

## Change 3: Issue Sync — Pull + Update

**Files:** `skills/start-feature/SKILL.md` and `skills/create-issue/SKILL.md`

### start-feature changes

**Issue reference detection (Step 0 or Step 1):**
When the user's request contains an issue reference (`#N`, `issue #N`, `implement issue #N`, or a GitHub issue URL), the orchestrator:

1. Extracts the issue number
2. Fetches the issue body via `gh issue view N --json body,title,comments`
3. Fetches issue comments via `gh api repos/{owner}/{repo}/issues/N/comments`
4. Stores the issue number as lifecycle context
5. Passes the issue body + comments as initial context to the brainstorming step: "These are the existing requirements from issue #N"

**Create issue step behavior:**
When an issue number is already stored, the "Create issue" step invokes `create-issue` in **update mode** with the stored issue number instead of creating a new issue.

### create-issue changes

**New mode: update existing issue.**

The skill currently always creates a new issue. Add an "update mode" triggered when the orchestrator passes an existing issue number.

In update mode:
1. Steps 1-4 remain the same (load design doc, check repo context, determine structure, draft body)
2. Step 5 (metadata): Present as "Update issue #N" instead of "Create this issue?"
   - `AskUserQuestion` options: "Update as-is", "Let me edit first", "Cancel"
3. Step 6: Use `gh issue edit N --body "..."` instead of `gh issue create`
4. After updating the body, add a comment summarizing what changed: `gh issue comment N --body "Updated from design document: [1-line summary]"`
5. Step 7: Suggest next steps as before

**Preserving original content:** The updated body replaces the original body entirely — the design document output is the canonical version. The original issue content has already been pulled into brainstorming as context, so anything worth keeping is already reflected in the design.

## Scope

**Included:**
- Brainstorming format override section in start-feature
- Auto-select subagent-driven in start-feature
- Issue reference detection in start-feature
- Update mode in create-issue
- Fetching issue body + comments as brainstorming context

**Excluded:**
- Modifying the superpowers plugin itself
- Syncing issue labels, milestones, or assignees back from the lifecycle
- Handling issues from external repos (only the current repo)
- Updating the issue at other lifecycle stages (only at the "Create issue" step)
