---
name: verify-plan-criteria
description: Run after writing an implementation plan to validate that every task has machine-verifiable acceptance criteria. Drafts missing criteria automatically from task context. Use after writing plans or when reviewing existing plans.
tools: Read, Glob, Grep, Edit, AskUserQuestion
---

# Verify Plan Criteria

Validates that every task in an implementation plan has machine-verifiable acceptance criteria. For tasks missing criteria, drafts them automatically from the task's context and presents them for approval.

**Announce at start:** "Running verify-plan-criteria to check acceptance criteria coverage."

## When to Use

- After writing an implementation plan
- Before the user reviews and approves a plan
- When reviewing an existing plan for spec-driven compliance

## Process

### Step 1: Find the Plan File

Look for the plan file:
1. If the user specified a path, use it
2. Otherwise, find the most recently modified `.md` file in the plans directory:

```
Glob: docs/plans/*.md
```

If no `docs/plans/` directory exists, check for plan files in common locations:
- `plans/*.md`
- `docs/*.md` (look for files with "plan" or "implementation" in the name)

Pick the most recent file. Confirm with the user: "Checking plan: `[path]`. Is this correct?"

### Step 2: Parse Tasks

Read the plan file and find all task sections. Tasks are identified by headings matching:
- `### Task N:` (standard format)
- `### TASK-NNN:` (alternative format)

For each task, extract:
- **Task number and title** (from the heading)
- **Files section** (paths to create/modify)
- **Steps** (implementation steps)
- **Acceptance Criteria section** (if present — look for `**Acceptance Criteria:**` followed by `- [ ]` items)

### Step 3: Check Each Task

For each task, determine if it has acceptance criteria:

**Has criteria:** The task has an `**Acceptance Criteria:**` section with at least one `- [ ]` item.
- Validate each criterion is machine-verifiable (not vague)
- Flag vague criteria like "works correctly", "looks good", "is fast", "handles errors properly"
- Suggest replacements for vague criteria

**Missing criteria:** The task has no `**Acceptance Criteria:**` section or the section is empty.
- Proceed to Step 4 to draft criteria.

### Step 4: Draft Missing Criteria

For each task missing criteria, generate machine-verifiable criteria from the task's context:

**From the Files section:**
- If creating a file → "File exists at `exact/path/to/file.ts`"
- If modifying a file → "Changes exist in `exact/path/to/file.ts`"

**From the Steps section:**
- If running a test → "Tests pass: `npm run test`" (or the specific test command)
- If running typecheck → "`npm run typecheck` passes with no new errors"
- If running lint → "`npm run lint` passes with no new warnings"

**From the task description:**
- If defining an interface/type → "Type/interface `Name` is exported from `path`"
- If creating a component → "Component `Name` exists and accepts expected props"
- If creating an API route → "Route handler exists at `path` and handles expected methods"
- If creating a migration → "Migration file exists in the migrations directory"

**Always include (for non-trivial tasks):**
- Typecheck passes (use the project's actual command — `npm run typecheck`, `yarn typecheck`, `pnpm typecheck`, `bun typecheck`, `tsc --noEmit`, or whatever `package.json` scripts defines)
- Lint passes (use the project's actual lint command)

**Present drafted criteria to the user:**

```
Task 3: "Add allergen badge to menu items" is missing acceptance criteria.

Suggested criteria (based on task context):
- [ ] `src/components/AllergenBadge.tsx` exists
- [ ] Component exports `AllergenBadge` as default or named export
- [ ] `npm run typecheck` passes with no new errors
- [ ] `npm run lint` passes with no new warnings

Accept these criteria, or would you like to edit them?
```

Use `AskUserQuestion` to get approval. Options: "Accept as-is", "Let me edit them", "Skip this task".

**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip this question. Auto-select "Accept as-is" for all tasks with drafted criteria and announce: `YOLO: verify-plan-criteria — Approve criteria → Accept as-is ([N] tasks)`

### Step 5: Apply Approved Criteria

For each task where criteria were approved:
- Use the Edit tool to add the `**Acceptance Criteria:**` section to the task in the plan file
- Place it immediately after the task heading and before the Files section:

```markdown
### Task N: [Title]

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

**Files:**
...
```

### Step 6: Report

After processing all tasks:

```
## Plan Criteria Check Complete

**Plan:** [path to plan file]

| Task | Status | Criteria Count |
|------|--------|----------------|
| Task 1: Setup schema | Has criteria | 4 |
| Task 2: API endpoint | Drafted + approved | 5 |
| Task 3: UI component | Drafted + approved | 3 |
| Task 4: Documentation | Skipped | 0 |

**Result:** X/Y tasks have acceptance criteria. Plan is ready for review.
```

## Quality Rules for Criteria

Good criteria are:
- **Specific:** "File exists at `src/components/Badge.tsx`" not "component is created"
- **Verifiable by machine:** Can be checked with ls, grep, or running a command
- **Independent:** Each criterion checks one thing
- **Non-vague:** No "works correctly", "handles errors", "is performant"

If a criterion can only be verified manually (visual rendering, user interaction), write it as:
- `- [ ] [MANUAL] Badge renders in red when allergens overlap`

The `[MANUAL]` prefix tells the task-verifier to mark it as CANNOT_VERIFY rather than attempting to check it.
