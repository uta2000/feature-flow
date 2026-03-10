---
name: verify-acceptance-criteria
description: >-
  Use when asked to "verify acceptance criteria", "check criteria", or
  "verify the implementation against the plan" during active feature
  development. Do NOT trigger for issue management (close issue, comment),
  worktree cleanup, or post-merge/post-PR operations.
tools: Read, Glob, Grep, Task
---

# Verify Acceptance Criteria

Mechanically checks all acceptance criteria from an implementation plan against the actual codebase. Delegates verification to the `task-verifier` agent and reports results.

**Announce at start:** "Running verify-acceptance-criteria to check implementation against the plan."

## When to Use

- After implementing one or more tasks from a plan
- Before claiming work is complete
- Before committing or creating a PR

## Process

### Step 0: Check for Existing PR

Before doing any work, check if a PR already exists for the current branch:

```bash
gh pr view --json url,state 2>/dev/null
```

**If a PR exists:** Announce "A PR already exists for this branch. Verification runs before PR creation in the standard workflow. Skipping." Exit gracefully — do not launch the task-verifier agent.

**If no PR exists:** Continue with Step 1.

### Step 1: Find the Plan File

**If `plan_file` is provided in ARGUMENTS** (e.g., `plan_file: /abs/path/to/plan.md`): Parse the value and attempt to read that path. If the file exists, use it directly — skip the Glob and user confirmation, and announce: "Using provided plan file: [path]". If the file does not exist, announce: "Provided plan_file not found: [path]. Falling back to discovery." and continue with the Otherwise branch below.

**Otherwise, look for the plan file:**
1. If the user specified a path, use it
2. Otherwise, find the most recently modified `.md` file in the plans directory:

```
Glob: docs/plans/*.md
```

If no `docs/plans/` directory exists, check for plan files in common locations:
- `plans/*.md`
- `docs/*.md` (look for files with "plan" or "implementation" in the name)

Pick the most recent file. Confirm with the user: "Verifying against plan: `[path]`. Is this correct?"

**Split plan detection:** After the plan file is found, read it and check for the presence of `## Phase Manifest`. If found, it is a split plan:
1. Parse the `## Phase Manifest` table to extract all phase file paths. (The table has at minimum a File column containing relative paths like `docs/plans/YYYY-MM-DD-feature-plan-phase-1.md`.)
2. Read each phase file.
3. Treat the combined content of all phase files as the plan content for Step 2's criteria extraction.

If `## Phase Manifest` is absent, proceed with the single plan file content as before — existing behavior is unchanged.

### Step 2: Extract Acceptance Criteria

**Note for split plans:** If the plan was detected as a split plan in Step 1, extract acceptance criteria from all phase files (not the index file). Label each task's criteria with its source phase file for traceability in the verification report (e.g., `Task 1 [from phase-1]`). When constructing the Step 3 verifier prompt, use `Task N [from phase-N]: [Title]` as the task identifier for each task from a phase file.

Read the plan file(s) identified in Step 1 (for split plans, this means all phase files; for single-file plans, this means the plan file directly) and extract all `**Acceptance Criteria:**` sections.

For each task, collect:
- Task number and title
- All criteria items (lines starting with `- [ ]`)
- Note any `[MANUAL]` prefixed criteria (these will be flagged for human review)

If a specific task was requested, only extract criteria for that task.

### Step 3: Delegate to Task Verifier

Use the Task tool with `subagent_type: "feature-flow:task-verifier"` and `model: "haiku"` (see `../../references/tool-api.md` — Task Tool for correct parameter syntax) to launch the task-verifier agent with:

```
Verify the following acceptance criteria against the codebase.

Plan file: [path]
Task: [task number or "All tasks"]

Criteria to verify:

Task N: [Title]
- [ ] Criterion 1
- [ ] Criterion 2
...

Task M: [Title]
- [ ] Criterion 1
...

For criteria prefixed with [MANUAL], mark as CANNOT_VERIFY with reason "Requires manual testing".

Produce a verification report with a results table and verdict (VERIFIED / INCOMPLETE / BLOCKED).
```

### Step 4: Present Results

Display the verification report from the task-verifier agent to the user.

**If VERIFIED:**
```
All acceptance criteria verified. Implementation matches the plan.

[show report table]

You can proceed with committing / creating a PR.
```

**If INCOMPLETE:**
```
Some acceptance criteria failed. The following need attention:

[show report table — includes Diagnosis column for FAIL rows with root cause and suggested fix]

Issues to fix:
1. [criterion] — [evidence of failure]
   → [suggested fix from Diagnosis column, if available]
2. [criterion] — [evidence of failure]
   → [suggested fix from Diagnosis column, if available]

Fix these issues and run verify-acceptance-criteria again.
```

**If BLOCKED:**
```
Verification could not be completed:
[reason — e.g., build broken, dependencies missing]

Resolve the blocker and run verify-acceptance-criteria again.
```

### Step 5: Update Plan (Optional)

If all criteria for a task pass, offer to check off the criteria in the plan:

```markdown
- [x] File exists at `src/components/Badge.tsx`  ← checked
- [x] `npm run typecheck` passes                 ← checked
- [ ] [MANUAL] Badge renders red on overlap       ← left unchecked (manual)
```

Only do this if the user agrees.
