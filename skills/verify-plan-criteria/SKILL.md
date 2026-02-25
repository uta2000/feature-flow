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
- When reviewing an existing plan for feature-flow compliance

## Process

### Step 1: Find the Plan File

Look for the plan file:
1. If the user specified a path, use it directly
2. Otherwise, find the most recently modified `.md` file in the plans directory:

```
Glob: docs/plans/*.md
```

If no `docs/plans/` directory exists, check for plan files in common locations:
- `plans/*.md`
- `docs/*.md` (look for files with "plan" or "implementation" in the name)

**Path selection:**
- If 1 candidate found → use it directly without confirmation
- If multiple candidates found → pick the most recent and confirm with the user: "Found multiple plan files. Checking plan: `[path]`. Is this correct?"

Announce the selected path: "Checking plan: `[path]`"

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

**Quality Constraints check:** Every non-trivial task must have a `**Quality Constraints:**` section. Tasks that only create directories, copy files, or run commands are exempt. Flag tasks missing Quality Constraints with: "Task N is missing Quality Constraints — should specify error handling pattern, type narrowness, function length, and pattern reference."

**Edge case criteria check:** For tasks that handle input, make external calls, or process data, acceptance criteria must include at least one edge case test (empty input, null, timeout, boundary values). Flag tasks that only have happy-path criteria with: "Task N acceptance criteria only cover happy path — add edge case criteria (empty input, error path, boundary values)."

**Fast-path:** If ALL tasks already have criteria, none are flagged as vague, all non-trivial tasks have Quality Constraints, and edge case criteria are present where needed, skip directly to Step 6 (Report). Do not execute Steps 4 or 5.

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

**Draft Quality Constraints (if missing):** For tasks missing a Quality Constraints section, infer constraints from the task description, files being modified, and `references/coding-standards.md`:
- **Error handling:** Infer from task type — API handler → typed errors with discriminated union; data processing → Result<T, E> pattern; UI component → loading/error/empty states
- **Type narrowness:** Check if the task defines new types or interfaces. If so, specify literal unions over string/number where the domain is known
- **Function length:** If the task describes a handler, processor, or orchestrator, note extraction points (validation, transformation, response formatting)
- **Pattern reference:** Find the most similar existing file in the codebase and reference it

**Draft edge case criteria (if missing):** For tasks with only happy-path acceptance criteria, infer edge cases from the task type:
- API handler → timeout, validation error for empty/malformed input, auth failure
- Data processing → empty array, null input, boundary values (0, max int, empty string)
- External API call → timeout, rate limit, malformed response
- UI component → loading state, error state, empty state

**Present all drafted criteria in a single message:**

After drafting criteria for all tasks with missing criteria, present them together:

```
The following tasks are missing acceptance criteria. Here are the suggested criteria:

**Task N: "[title]"**
- [ ] [criterion 1]
- [ ] [criterion 2]

**Task M: "[title]"**
- [ ] [criterion 1]
- [ ] [criterion 2]

Accept all, edit, or skip?
```

Use a single `AskUserQuestion` to get approval for all tasks at once. Options: "Accept all as-is", "Let me edit them", "Skip drafting".

- **"Accept all as-is"** → Apply all drafted criteria (proceed to Step 5)
- **"Let me edit them"** → User provides corrections in freeform text, criteria are revised, then applied. The user may also selectively accept or reject criteria for individual tasks (e.g., "Accept Task 2 and 4 criteria, skip Task 3").
- **"Skip drafting"** → Skip Steps 4 and 5, proceed to Step 6 with missing criteria noted in the report

**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip this question. Auto-select "Accept all as-is" and announce: `YOLO: verify-plan-criteria — Approve criteria → Accept as-is ([N] tasks)`

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
