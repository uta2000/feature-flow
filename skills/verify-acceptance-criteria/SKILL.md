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

## Optional Args (used when invoked from orchestrator dispatch)

When invoked as a Pattern B consolidator subagent (per #251 Wave 3 phase 4), the orchestrator passes these arguments so the skill can skip the hoisted task-verifier dispatch and write its structured return contract back to a tmp JSON file:

- `verifier_report_path: <absolute-path-to-report-md>` — when set, the skill skips Step 3's `task-verifier` dispatch (the orchestrator has already executed it) and reads the pre-written verification report from this Markdown file. The report follows the format defined in `agents/task-verifier.md` Step 4.
- `write_contract_to: <absolute-path-to-json>` — when set, writes the structured return contract directly to this JSON file path after Step 4 (Present Results) completes (see Step 6 below). **Unlike `design-document`, this is a plain JSON file path, not a state-file YAML path.** verify-acceptance-criteria does not own a `phase_summaries` bucket — see "Why no state-file write" below.

Both args are optional. If `verifier_report_path` is absent, Step 3 dispatches the task-verifier as before. If `write_contract_to` is absent, Step 6 is skipped — the skill behaves identically to its inline-invocation form.

**Why no state-file write:** the four `phase_summaries` buckets (`brainstorm`, `design`, `plan`, `implementation`) are all claimed by phase-boundary writes. Verify-acceptance-criteria is a verification step within the implementation phase, not a phase that owns a bucket; reusing `implementation.return_contract` would collide with the future Phase 6 (`subagent-driven-development`) Pattern B contract. The contract is consumed once by the orchestrator's validator and discarded — no cross-compaction reader needs it from the state file.

## Format Detection

Before extracting criteria, determine which format the plan file uses.

See `references/xml-plan-format.md` for the canonical schema. See `references/xml-plan-format-runtime.md` for the detection algorithm, error handling rules, and edge cases. Summary:

1. Read the first 50 lines of the plan file
2. Track code-fence state: toggle `in_fence` on each line that starts with ` ``` `
3. For each non-fenced line: check if it matches `/^<plan version="/`
4. If match found → XML mode
5. Before committing to XML mode: scan the full file for `</plan>`. If absent → log warning
   "plan appears truncated — treating as prose" and use Prose mode
6. If no match in first 50 lines → Prose mode (existing behavior unchanged)

### XML Extraction

For XML plans:

1. Extract `<task id="N" status="...">` blocks
2. **Duplicate ID check:** If any `id=` value appears more than once → announce
   "XML structure invalid — falling back to prose parser" and use prose mode.
3. For each task:
   - Task status: read `status=` attribute (`pending`/`in-progress`/`done`) — replaces Progress
     Index comment parsing. Missing or unexpected `status=` → treat as `pending`.
   - Criteria: extract `<criterion>` elements from `<criteria>` block:
     - Structured: `{what, how, command}` from `<what>/<how>/<command>` children — no regex needed
     - Manual: `type="manual"` attribute → treat as `[MANUAL]` (CANNOT_VERIFY)
4. Pass the extracted flat criterion list to Step 3 (task-verifier) — same format as prose path

**Malformed XML:** the following conditions trigger full prose fallback (see reference doc for
per-criterion flags that don't trigger fallback):
- `</plan>` absent → "plan appears truncated — treating as prose"
- `<task>` unclosed → "malformed task block at id N — falling back to prose"
- `<criteria>` unclosed → "malformed criteria block in task N — falling back to prose"
- Duplicate task IDs → "duplicate task ID N — plan is invalid, falling back to prose"

**Prose mode:** existing Step 1-5 logic runs unchanged.

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

**XML plans:** Use the XML Extraction algorithm from the Format Detection section above. Build
the same flat criterion list (task number, title, criterion items) as the prose path produces —
the task-verifier in Step 3 receives an identical input regardless of source format.

**Prose plans (existing behavior):**

**Note for split plans:** If the plan was detected as a split plan in Step 1, extract acceptance criteria from all phase files (not the index file). Label each task's criteria with its source phase file for traceability in the verification report (e.g., `Task 1 [from phase-1]`). When constructing the Step 3 verifier prompt, use `Task N [from phase-N]: [Title]` as the task identifier for each task from a phase file.

Read the plan file(s) identified in Step 1 (for split plans, this means all phase files; for single-file plans, this means the plan file directly) and extract all `**Acceptance Criteria:**` sections.

For each task, collect:
- Task number and title
- All criteria items (lines starting with `- [ ]`)
- Note any `[MANUAL]` prefixed criteria (these will be flagged for human review)

If a specific task was requested, only extract criteria for that task.

### Step 3: Delegate to Task Verifier

**Pattern B consolidator-mode early exit:** If `verifier_report_path` is set in ARGUMENTS, the orchestrator has already dispatched the task-verifier and written its detailed Markdown report to that path. Read the file, treat its content as the verification report produced by Step 3, and skip the `Task()` dispatch below. Jump directly to Step 4 (Present Results) using the loaded report. This branch exists for the Pattern B subagent dispatch wired in `skills/start/SKILL.md` — see "Verify Acceptance Criteria — Pattern B Dispatch" in that file.

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

If a criterion is ambiguous to evaluate mechanically, call `advisor()` before manual interpretation. Advisor can disambiguate what the criterion is actually asking for.

For criteria prefixed with [MANUAL], mark as CANNOT_VERIFY with reason "Requires manual testing".

Produce a verification report with a results table and verdict (VERIFIED / INCOMPLETE / BLOCKED).
```

### Step 4: Present Results

Display the verification report from the task-verifier agent to the user.

**If VERIFIED:**
```
All acceptance criteria verified. Implementation matches the plan.

[show report table — Diagnosis column shows — for all rows when all criteria pass]

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

**XML plans:** XML plans track task completion via the `status=` attribute, not checkboxes. If
the plan is in XML mode and all criteria for a task pass, offer to update `status="pending"` →
`status="done"` on the `<task>` element instead. Skip the checkbox editing below.

**Prose plans:** If all criteria for a task pass, offer to check off the criteria in the plan:

```markdown
- [x] File exists at `src/components/Badge.tsx`  ← checked
- [x] `npm run typecheck` passes                 ← checked
- [ ] [MANUAL] Badge renders red on overlap       ← left unchecked (manual)
```

Only do this if the user agrees.

### Step 6: Write Return Contract (conditional)

**Only executes if `write_contract_to` is set in the skill's ARGUMENTS.** If the arg is absent, skip this step entirely — the skill behaves identically to its pre-#251 inline form.

Construct the return contract object per the locked spec from #251 (exemplar 2 in the issue body, locked before any implementation):

- `schema_version`: `1` (integer — contract schema version)
- `phase`: hardcoded to `"verify-acceptance-criteria"` per #251's locked contract spec — this is the lifecycle step name the validator uses to look up the schema in its registry.
- `status`: derived from the verifier verdict —
  - `"success"` → all criteria PASS or CANNOT_VERIFY (verdict VERIFIED)
  - `"partial"` → at least one criterion FAIL (verdict INCOMPLETE)
  - `"failed"` → verifier could not run (verdict BLOCKED — broken build, missing deps)
- `report_path`: absolute path of the detailed Markdown verification report (the `verifier_report_path` arg if set; otherwise the path to the inline-fallback report)
- `pass_count`: integer count of PASS rows in the report
- `fail_count`: integer count of FAIL rows in the report
- `failed_criteria`: array of objects, one per FAIL row. Each object has string fields `task_id`, `criterion`, `reason` (extracted from the report's Results table). Empty array `[]` when status is `success`.

Write the contract directly to the JSON path using this helper (env-var passing is apostrophe-safe, mirrors the pattern in `skills/design-document/SKILL.md` Step 8):

```bash
F="<write_contract_to value>"
STATUS="<success|partial|failed>"
REPORT="<absolute path to the detailed report>"
PASS=<integer>
FAIL=<integer>
FAILED='<json-array-string, e.g. [] or [{"task_id":"Task 3","criterion":"...","reason":"..."}]>'

F="$F" STATUS="$STATUS" REPORT="$REPORT" PASS="$PASS" FAIL="$FAIL" FAILED="$FAILED" python3 -c '
import os, json
contract = {
    "schema_version": 1,
    # The contracts `phase` field is the lifecycle STEP NAME per #251 spec.
    # The validator uses this to look up the schema in its registry.
    "phase": "verify-acceptance-criteria",
    "status": os.environ["STATUS"],
    "report_path": os.environ["REPORT"],
    "pass_count": int(os.environ["PASS"]),
    "fail_count": int(os.environ["FAIL"]),
    "failed_criteria": json.loads(os.environ["FAILED"]),
}
json.dump(contract, open(os.environ["F"], "w"))
print(f"[verify-acceptance-criteria] return_contract written to {os.environ[\"F\"]}")
'
```

**No `[ -f "$F" ]` guard** — unlike `design-document` (which writes into an existing state-file YAML), this skill writes a fresh JSON file. The orchestrator passes a tmp path that the helper creates.

After writing, return the contract path and a one-line summary as the skill's result text:

`"Return contract written to <write_contract_to>. Verification: status=<status>, pass=<N>, fail=<N>."`

The orchestrator (Pattern B wrapper in `skills/start/SKILL.md`) reads this path from the result string and runs `hooks/scripts/validate-return-contract.js` against it before proceeding.
