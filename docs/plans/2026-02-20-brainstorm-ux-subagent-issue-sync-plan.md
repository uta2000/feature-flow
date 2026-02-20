# Brainstorming UX, Auto-Select Subagent, Issue Sync — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the spec-driven feature lifecycle with better brainstorming question UX, automatic subagent-driven execution, and GitHub issue round-trip sync.

**Architecture:** Three changes to two markdown skill files. No code, no tests — these are Claude Code plugin skill instructions. Changes are additive sections and targeted line edits.

**Tech Stack:** Markdown (Claude Code plugin skill files)

---

### Task 1: Add Brainstorming Interview Format Override

**Files:**
- Modify: `skills/start-feature/SKILL.md:219-220` (insert new section between skill mapping table and Study Existing Patterns)

**Step 1: Insert the brainstorming format section**

After line 219 (the last row of the skill mapping table: `| App store review | No skill...`) and before line 221 (`### Study Existing Patterns Step`), insert this new section:

```markdown
### Brainstorming Interview Format Override

When invoking `superpowers:brainstorming` from this lifecycle, pass these formatting instructions as context. Every interview question presented to the user must follow this format:

**Required format for each question:**

```
**[Question in plain English]**
*Why this matters:* [1 sentence explaining impact on the design]
- **Option A** — e.g., [concrete example]. *Recommended: [1 sentence reasoning]*
- **Option B** — e.g., [concrete example]
- **Option C** — e.g., [concrete example] (if applicable)
```

**Rules:**
- Always lead with the recommended option and mark it with `*Recommended*`
- Each option must include a concrete example showing what it means in practice (e.g., "like ESLint running on every save" not just "run on save")
- The "Why this matters" line should explain what downstream impact the choice has (e.g., "this determines whether validation errors surface during editing or only at commit time")
- Keep it concise — one line for the explanation, one line per option
- If there is no clear recommendation, say "*No strong preference — depends on [factor]*" instead of forcing a pick
```

**Step 2: Verify the edit**

Read `skills/start-feature/SKILL.md` and confirm:
- The new section appears between the skill mapping table and the "Study Existing Patterns Step" section
- The section is titled "### Brainstorming Interview Format Override"
- It contains the format template, rules, and examples

**Step 3: Commit**

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat: add brainstorming interview format override to start-feature"
```

**Acceptance Criteria:**
- [ ] `skills/start-feature/SKILL.md` contains a section titled "### Brainstorming Interview Format Override"
- [ ] The section appears after the skill mapping table and before "### Study Existing Patterns Step"
- [ ] The section contains a format template with `**[Question]**`, `*Why this matters:*`, and option lines with `*Recommended*`
- [ ] The section contains rules for leading with recommendation, including examples, and keeping it concise

---

### Task 2: Auto-Select Subagent-Driven Implementation

**Files:**
- Modify: `skills/start-feature/SKILL.md:209,212` (update skill mapping table rows)

**Step 1: Update the Implementation plan row**

Change line 209 from:
```
| Implementation plan | `superpowers:writing-plans` | Numbered tasks with acceptance criteria |
```
to:
```
| Implementation plan | `superpowers:writing-plans` | Numbered tasks with acceptance criteria. **Override:** After the plan is saved, always proceed with subagent-driven execution — do not present the execution choice to the user. Immediately invoke `superpowers:subagent-driven-development`. |
```

**Step 2: Update the Implement row**

Change line 212 from:
```
| Implement | `superpowers:test-driven-development` | Code written with tests |
```
to:
```
| Implement | `superpowers:subagent-driven-development` | Code written with tests, spec-reviewed, and quality-reviewed per task |
```

**Step 3: Verify the edits**

Read `skills/start-feature/SKILL.md` and confirm:
- The Implementation plan row contains the override instruction
- The Implement row references `superpowers:subagent-driven-development`

**Step 4: Commit**

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat: auto-select subagent-driven implementation, skip execution choice"
```

**Acceptance Criteria:**
- [ ] The "Implementation plan" row in the skill mapping table contains "Override:" text instructing to skip the execution choice
- [ ] The "Implementation plan" row mentions `superpowers:subagent-driven-development`
- [ ] The "Implement" row references `superpowers:subagent-driven-development` instead of `superpowers:test-driven-development`
- [ ] The "Implement" row expected output mentions spec-reviewed and quality-reviewed

---

### Task 3: Add Issue Reference Detection to start-feature

**Files:**
- Modify: `skills/start-feature/SKILL.md:81-102` (add issue detection to Step 1)
- Modify: `skills/start-feature/SKILL.md:198-219` (update skill mapping for Create issue)

**Step 1: Add issue reference detection to Step 1**

After line 82 (`Ask the user what they want to build. Then classify the work:`) and before the scope table, insert:

```markdown
**Issue reference detection:** Before classifying scope, check if the user's request references an existing GitHub issue. Look for patterns: `#N`, `issue #N`, `implement issue #N`, `issue/N`, or a full GitHub issue URL (e.g., `https://github.com/.../issues/N`).

If an issue reference is found:
1. Extract the issue number
2. Fetch the issue body and title: `gh issue view N --json title,body,comments --jq '{title, body, comments: [.comments[].body]}'`
3. Store the issue number as lifecycle context (pass to subsequent steps)
4. Announce: "Found issue #N: [title]. I'll use this as context for brainstorming and update it after design."
5. Pass the issue body + comments as initial context to the brainstorming step

If no issue reference is found, proceed as before.
```

**Step 2: Update Create issue row in skill mapping**

Change line 208 from:
```
| Create issue | `spec-driven:create-issue` | GitHub issue URL |
```
to:
```
| Create issue | `spec-driven:create-issue` | GitHub issue URL. **If an issue number was detected in Step 1**, pass it to create-issue as the `existing_issue` context — the skill will update the existing issue instead of creating a new one. |
```

**Step 3: Verify the edits**

Read `skills/start-feature/SKILL.md` and confirm:
- Step 1 contains the issue reference detection block
- The Create issue row in the skill mapping references the `existing_issue` context

**Step 4: Commit**

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat: detect issue references and pass to create-issue for sync"
```

**Acceptance Criteria:**
- [ ] Step 1 (Determine Scope) contains a paragraph titled "**Issue reference detection:**"
- [ ] The detection paragraph lists the patterns: `#N`, `issue #N`, `implement issue #N`, and GitHub URL
- [ ] The detection paragraph includes the `gh issue view` command for fetching issue data
- [ ] The "Create issue" row in the skill mapping table contains "If an issue number was detected"
- [ ] The issue body + comments are described as being passed to brainstorming as context

---

### Task 4: Add Update Mode to create-issue

**Files:**
- Modify: `skills/create-issue/SKILL.md:1-9` (update description and announce)
- Modify: `skills/create-issue/SKILL.md:13-17` (update When to Use)
- Modify: `skills/create-issue/SKILL.md:104-149` (update Steps 5-7 for update mode)

**Step 1: Update the skill description**

Change line 3 from:
```
description: This skill should be used when the user asks to "create an issue", "create a GitHub issue", "open an issue", "write up an issue", "file an issue", or after a design has been verified and needs to be captured as a trackable GitHub issue for implementation.
```
to:
```
description: This skill should be used when the user asks to "create an issue", "create a GitHub issue", "open an issue", "write up an issue", "file an issue", or after a design has been verified and needs to be captured as a trackable GitHub issue for implementation. Also handles updating an existing issue when an issue number is provided as context.
```

**Step 2: Update the announce and intro**

Change line 9 from:
```
Create a well-structured GitHub issue from a verified design document. The issue serves as the implementation brief — everything a developer (or Claude) needs to build the feature without ambiguity.
```
to:
```
Create or update a well-structured GitHub issue from a verified design document. The issue serves as the implementation brief — everything a developer (or Claude) needs to build the feature without ambiguity.
```

Change line 11 from:
```
**Announce at start:** "Creating GitHub issue from the design document."
```
to:
```
**Announce at start:** If updating an existing issue: "Updating issue #N from the design document." Otherwise: "Creating GitHub issue from the design document."
```

**Step 3: Add "update existing issue" to When to Use**

After line 17 (`- When transitioning from design to implementation planning`), add:
```markdown
- When an existing issue number is passed as context (update mode — syncs the issue with the design document)
```

**Step 4: Update Steps 5-7 for update mode**

Replace the content of Steps 5, 6, and 7 (lines 104-149) with dual-mode instructions. Replace from `### Step 5: Add Metadata` through the end of `### Step 7: Suggest Next Steps` with:

```markdown
### Step 5: Add Metadata

Before creating or updating the issue, determine appropriate metadata:

- **Title:** Under 70 characters. Format: `[Feature Name] — [Brief description]`
- **Labels:** Match existing repo labels (e.g., `enhancement`, `bug`, `feature`)
- **Milestone:** If the repo uses milestones and one applies, assign it
- **Assignee:** Only if the user specifies one

Present the draft to the user:

**If updating an existing issue:**
```
Update issue #N:

Title: [title]
Labels: [labels]
Milestone: [if applicable]

[full body]

Update this issue?
```

Use `AskUserQuestion` to confirm. Options: "Update as-is", "Let me edit first", "Cancel".

**If creating a new issue:**
```
Issue draft:

Title: [title]
Labels: [labels]
Milestone: [if applicable]

[full body]

Create this issue?
```

Use `AskUserQuestion` to confirm. Options: "Create as-is", "Let me edit first", "Cancel".

### Step 6: Create or Update the Issue

**If updating an existing issue (issue number provided as context):**

```bash
gh issue edit N --title "[title]" --body "$(cat <<'EOF'
[issue body]
EOF
)"
```

Then add a comment summarizing what changed:

```bash
gh issue comment N --body "Updated from design document: [1-line summary of what changed]. See \`docs/plans/YYYY-MM-DD-feature.md\`"
```

**If creating a new issue:**

```bash
gh issue create --title "[title]" --label "[label]" --body "$(cat <<'EOF'
[issue body]
EOF
)"
```

Report the issue URL to the user.

### Step 7: Suggest Next Steps

**If updated:**
```
Issue #N updated: [URL]

Recommended next steps:
1. Run `writing-plans` to create an implementation plan with acceptance criteria
2. Run `verify-plan-criteria` to ensure all tasks have verifiable criteria
3. Set up a worktree with `using-git-worktrees` to start implementation
```

**If created:**
```
Issue created: [URL]

Recommended next steps:
1. Run `writing-plans` to create an implementation plan with acceptance criteria
2. Run `verify-plan-criteria` to ensure all tasks have verifiable criteria
3. Set up a worktree with `using-git-worktrees` to start implementation
```
```

**Step 5: Verify the edits**

Read `skills/create-issue/SKILL.md` and confirm:
- The description mentions "updating an existing issue"
- The announce line has dual-mode phrasing
- When to Use includes the update mode bullet
- Steps 5-7 have both "If updating" and "If creating" branches
- Step 6 uses `gh issue edit` for update mode and `gh issue comment` for the changelog

**Step 6: Commit**

```bash
git add skills/create-issue/SKILL.md
git commit -m "feat: add update mode to create-issue skill for issue sync"
```

**Acceptance Criteria:**
- [ ] `skills/create-issue/SKILL.md` description contains "updating an existing issue"
- [ ] The announce line has conditional phrasing for update vs create mode
- [ ] "When to Use" section includes a bullet about updating existing issues
- [ ] Step 5 has separate presentation blocks for "If updating" and "If creating"
- [ ] Step 6 contains `gh issue edit N` command for update mode
- [ ] Step 6 contains `gh issue comment N` command for posting a change summary
- [ ] Step 7 has separate output blocks for "If updated" and "If created"
