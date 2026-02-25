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

Look for the plan file:
1. If the user specified a path, use it
2. Otherwise, find the most recently modified `.md` file in the plans directory:

```
Glob: docs/plans/*.md
```

If no `docs/plans/` directory exists, check for plan files in common locations:
- `plans/*.md`
- `docs/*.md` (look for files with "plan" or "implementation" in the name)

Pick the most recent file. Confirm with the user: "Verifying against plan: `[path]`. Is this correct?"

### Step 2: Extract Acceptance Criteria

Read the plan file and extract all `**Acceptance Criteria:**` sections.

For each task, collect:
- Task number and title
- All criteria items (lines starting with `- [ ]`)
- Note any `[MANUAL]` prefixed criteria (these will be flagged for human review)

If a specific task was requested, only extract criteria for that task.

### Step 3: Delegate to Task Verifier

Use the Task tool with `subagent_type: "feature-flow:task-verifier"` (see `../../references/tool-api.md` — Task Tool for correct parameter syntax) to launch the task-verifier agent with:

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

[show report table, highlighting FAIL items]

Issues to fix:
1. [criterion] — [evidence of failure]
2. [criterion] — [evidence of failure]

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
