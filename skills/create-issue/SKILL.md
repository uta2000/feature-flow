---
name: create-issue
description: This skill should be used when the user asks to "create an issue", "create a GitHub issue", "open an issue", "write up an issue", "file an issue", or after a design has been verified and needs to be captured as a trackable GitHub issue for implementation. Also handles updating an existing issue when an issue number is provided as context.
tools: Read, Glob, Grep, Bash, Edit, AskUserQuestion
---

# Create Issue

Create or update a well-structured GitHub issue from a verified design document. The issue serves as the implementation brief — everything a developer (or Claude) needs to build the feature without ambiguity.

**Announce at start:** If updating an existing issue: "Updating issue #N from the design document." Otherwise: "Creating GitHub issue from the design document."

## When to Use

- After a design document has been written and verified
- When the user wants to track a feature as a GitHub issue
- When transitioning from design to implementation planning
- When an existing issue number is passed as context (update mode — syncs the issue with the design document)

## Process

### Step 1: Load the Design Document

Find the design document:
1. If the user specified a path, use it
2. Otherwise, find the most recently modified `.md` file in `docs/plans/`:

```
Glob: docs/plans/*.md
```

Read the full document and extract the key sections.

### Step 2: Check Repository Context

Gather context for issue creation:

```bash
# Check for existing labels
gh label list --limit 50

# Check for milestones
gh milestone list

# Check recent issues for style/convention
gh issue list --limit 5
```

### Step 3: Determine Issue Structure

Read `references/issue-templates.md` to select the appropriate template for the feature type.

**Check project context:** If `.spec-driven.yml` exists and `platform` is `ios`, `android`, or `cross-platform`, include mobile-specific sections in the issue (Feature Flag Strategy, Rollback Plan, Device Compatibility, Beta Testing Requirements). See `../../references/platforms/mobile.md` for section content.

Map the design document sections to issue sections:

| Design Doc Section | Issue Section |
|-------------------|---------------|
| Overview | Summary (2-3 sentences + concrete example) |
| User Flow | User Flow (numbered steps) |
| Data Model Changes | Data Model Changes (table with columns and types) |
| Pipeline / Architecture | Pipeline Architecture (diagram or description) |
| New Components | New Components (bulleted list) |
| UI Adaptations | UI Adaptations (bulleted list) |
| Migration Requirements | Migration Summary (count + link to design doc) |
| Scope | Key Decisions (bulleted list of what was decided and why) |
| [findings from verification] | Implementation Notes (blockers, gaps, and things to watch for) |

**Not every section is needed.** Include only sections that have substantive content from the design doc.

### Step 4: Draft the Issue

Compose the issue body. Follow these principles:

- **Link to design doc:** Always include "See `docs/plans/YYYY-MM-DD-feature.md`" for full detail
- **Summarize, don't duplicate:** The issue is a brief, not a copy of the design doc. Include enough to understand the scope without opening the doc.
- **Concrete examples:** Include at least one input/output example in the summary
- **Implementation notes from verification:** If design-verification was run, include its findings as implementation notes

**Issue format:**

```markdown
## Summary
[2-3 sentences + concrete example]

## Design Doc
See `docs/plans/YYYY-MM-DD-feature.md`

## User Flow
1. **[Step name]** — [description]
2. **[Step name]** — [description]
3. **[Step name]** — [description]

## [Technical sections as needed — Data Model, Pipeline, Components, etc.]

## Key Decisions
- [decision and rationale]
- [decision and rationale]

## Implementation Notes
- [blocker or gap from verification]
- [technical consideration]
```

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

**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip this question. Auto-select "Update as-is" and announce: `YOLO: create-issue — Confirm update → Update as-is`

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

**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip this question. Auto-select "Create as-is" and announce: `YOLO: create-issue — Confirm create → Create as-is`

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

## Quality Rules

- **No orphan decisions:** Every key decision from the design doc should appear in the issue (in Key Decisions or as context in other sections)
- **Accurate counts:** Migration counts, component counts, and phase counts must match the design doc exactly
- **Link to design doc:** Always reference the design doc path so readers can access full detail
- **Consistent terminology:** Use the same names for tables, columns, components, and concepts as the design doc and codebase
- **Stand-alone readability:** A developer reading only the issue (without the design doc) should understand what to build, even if they need the doc for implementation details

## Additional Resources

### Reference Files

For issue templates across different feature types:
- **`references/issue-templates.md`** — Templates and examples for different issue types (new feature, API integration, UI feature, data migration, refactor)

For platform-specific issue sections:
- **`../../references/platforms/mobile.md`** — Mobile-specific sections: Feature Flag Strategy, Rollback Plan, API Versioning, Beta Testing Requirements
