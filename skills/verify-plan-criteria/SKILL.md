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

## Optional Output Args (used when invoked from orchestrator dispatch)

When invoked as a Pattern A subagent dispatch (per #251), the orchestrator passes two additional arguments so the skill can write its structured return contract back to the lifecycle's in-progress state file:

- `write_contract_to: <absolute-path-to-in-progress-yml>` — when set, writes the return contract to `phase_summaries.<phase_id>.return_contract` in that YAML file after Step 6 (see Step 7 below).
- `phase_id: <phase-id-string>` — identifies which `phase_summaries` key to write into (e.g., `verify-plan-criteria`). If absent when `write_contract_to` is set, defaults to `verify-plan-criteria`.

Both args are optional. If `write_contract_to` is not present in ARGUMENTS, Step 7 is skipped — the skill behaves identically to its inline-invocation form.

## Format Detection

Before parsing, determine which format the plan file uses:

See `references/xml-plan-format.md` for the canonical specification and complete field reference.
See `references/xml-plan-format-runtime.md` for the detection algorithm, error handling rules, and edge cases.

1. Read the first 50 lines of the plan file
2. Track code-fence state: toggle `in_fence` on each line that starts with ` ``` `
3. For each non-fenced line: check if it matches `/^<plan version="/`
4. If match found → **XML mode**
5. Before committing to XML mode: scan the full file for `</plan>`. If absent → log warning
   "plan appears truncated — treating as prose" and use **Prose mode**
6. If no match in first 50 lines → **Prose mode** (existing behavior unchanged)

**Canonical detection pattern:** `/^<plan version="/` — requires the `version=` attribute.
A bare `<plan>` tag (no `version=`) is NOT treated as an XML plan.

### XML Extraction Algorithm

If XML mode:

1. Find all `<task id="N" status="...">` blocks (string scan — no XML library)
2. **Duplicate ID check:** If any `id=` value appears more than once → flag "duplicate task ID —
   plan is invalid" and fall back to prose parser
3. For each task block:
   - Extract `<title>` content → task name
   - Extract `<files>` → list of `{action, path}` objects from `<file>` elements
   - Extract `<criteria>` → list of criterion objects:
     - Structured: `{what, how, command}` from child `<what>/<how>/<command>` elements
     - Manual: `{type: "manual", text: ...}` from `<criterion type="manual">` text content
   - Read `status` attribute → replaces Progress Index parsing
4. If a `<task>` block is not closed before the next `<task>` or `</plan>` → **malformed**, fall
   back to prose parser with announcement: "malformed task block at id N — falling back to prose"
5. If a `<criteria>` block is not closed before `</task>` → **malformed**, fall back to prose
   parser with announcement: "malformed criteria block in task N — falling back to prose"
6. `status=` values: `pending`, `in-progress`, `done` are recognized; any other value → treat as
   `pending` and log a note; missing `status=` → treat as `pending`

**[MANUAL] equivalence:** `<criterion type="manual">` and a `[MANUAL]`-prefixed prose criterion
are equivalent — both mean "manual check, no command required." Treat them identically.

**Prose mode:** If prose mode is selected, the existing Step 2 logic runs unchanged. The
detection check is the single gate — once prose mode is selected, no XML logic executes.

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

**XML plans (detected in Format Detection):**
Use the extraction algorithm from the Format Detection section above. For each extracted task,
proceed to Step 3 with the pre-extracted criterion objects.

**Prose plans (existing behavior):**
Read the plan file and find all task sections. Tasks are identified by headings matching:
- `### Task N:` (standard format)
- `### TASK-NNN:` (alternative format)

For each task, extract:
- **Task number and title** (from the heading)
- **Files section** (paths to create/modify)
- **Steps** (implementation steps)
- **Acceptance Criteria section** (if present — look for `**Acceptance Criteria:**` followed by `- [ ]` items)

### Step 3: Check Each Task

**XML criteria (pre-extracted):**
XML criteria arrive as `{what, how, command}` objects (or `{type: "manual", text}` for manual).
- Structured criteria: validate that `what`, `how`, and `command` are non-empty strings. If any
  is empty → flag as "incomplete criterion" (inline, do not trigger fallback).
- `<criteria>` present but zero `<criterion>` children → flag as "no criteria"
- `type="manual"` criteria: no format validation required (equivalent to `[MANUAL]`)

**Prose criteria (existing behavior):**
For each task, determine if it has acceptance criteria:

**Has criteria:** The task has an `**Acceptance Criteria:**` section with at least one `- [ ]` item.
- Validate each criterion is machine-verifiable (not vague)
- Flag vague criteria like "works correctly", "looks good", "is fast", "handles errors properly"
- Suggest replacements for vague criteria

**Missing criteria:** The task has no `**Acceptance Criteria:**` section or the section is empty.
- Proceed to Step 4 to draft criteria.

**Quality Constraints check:** Every non-trivial task must have a `**Quality Constraints:**` section. Tasks that only create directories, copy files, or run commands are exempt. Flag tasks missing Quality Constraints with: "Task N is missing Quality Constraints — should specify error handling pattern, type narrowness, function length, and pattern reference."

**Edge case criteria check:** For tasks that handle input, make external calls, or process data, acceptance criteria must include at least one edge case test (empty input, null, timeout, boundary values). Flag tasks that only have happy-path criteria with: "Task N acceptance criteria only cover happy path — add edge case criteria (empty input, error path, boundary values)."

**Format check:** After flagging vague criteria, check that each non-`[MANUAL]` criterion follows the structured format. A criterion is conforming if it contains both `measured by` and `verified by` as substrings. Criteria that start with `- [x]` (already completed) are also exempt.

Flag non-conforming criteria with: `"Criterion does not follow [WHAT] measured by [HOW] verified by [COMMAND] format — see references/acceptance-criteria-patterns.md"`

Exempt from format check:
- Criteria with `[MANUAL]` prefix — these require human verification and don't need a shell command
- Already-completed criteria (`- [x]`) — checked items are not re-validated

**Fast-path:** If ALL tasks already have criteria, none are flagged as vague, all non-trivial tasks have Quality Constraints, and edge case criteria are present where needed, skip directly to Step 6 (Report). Do not execute Steps 4 or 5.

### Step 4: Draft Missing Criteria

**Note:** Step 4 applies to prose plans only. XML plans surface inline flags (see Step 3).
If the plan is XML mode, skip Steps 4 and 5 and proceed to Step 6 (Report).

For each task missing criteria, generate machine-verifiable criteria from the task's context:

**From the Files section:**
- If creating a file → "`exact/path/to/file.ts` is created measured by file existence verified by `ls exact/path/to/file.ts`"
- If modifying a file → "`exact/path/to/file.ts` is modified measured by content change verified by `grep 'expected_pattern' exact/path/to/file.ts`"

**From the Steps section:**
- If running a test → "Test suite passes measured by zero failures verified by `npm run test`"
- If running typecheck → "TypeScript types are valid measured by zero new compilation errors verified by `npm run typecheck`"
- If running lint → "Linting passes measured by zero new warnings verified by `npm run lint`"

**From the task description:**
- If defining an interface/type → "`Name` type is exported measured by export presence verified by `grep 'export.*Name' path`"
- If creating a component → "`Name` component exists measured by file presence verified by `ls path/Name`"
- If creating an API route → "Route handler is defined measured by handler presence verified by `grep 'handler' path`"
- If creating a migration → "Migration file is present measured by file existence verified by `ls migrations/`"

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

Use a single `AskUserQuestion` to get approval for all tasks at once. Options:
- "Accept all as-is" with description: "*Recommended — applies all drafted criteria to their tasks; implementation can begin immediately*"
- "Let me edit them" with description: "Provide corrections in freeform text — criteria will be revised and re-presented before applying"
- "Skip drafting" with description: "Proceed without adding criteria — affected tasks will be harder to verify at completion"

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

**Quality Constraints:**
- Error handling: [pattern and reference file]
- Types: [narrowness requirements]
- Function length: [extraction guidance]
- Pattern: [reference file to follow]

**Files:**
...
```

### Step 5.5: Validate Dependency Graph

Call `python -m dispatcher.wave_planner --plan-file <path>` on the plan file (substitute the actual path):

```bash
python -m dispatcher.wave_planner --plan-file <plan_path>
```

- **Exit 0:** dependency graph is valid — continue to Step 6
- **Exit 1:** report each entry in `errors` as a **blocking** finding:
  - Cycle: `"cycle: Task A → Task B → Task A"`
  - Invalid ref: `"Task X: Depends on Task Y which does not exist"`
- **Command not found / ImportError:** skip silently — non-blocking. `wave_planner.py` may not be installed in all environments.

### Step 6: Report

After processing all tasks:

```
## Plan Criteria Check Complete

**Plan:** [path to plan file]

| Task | Criteria Status | Criteria Count | Quality Constraints |
|------|----------------|----------------|---------------------|
| Task 1: Setup schema | Has criteria | 4 | Present |
| Task 2: API endpoint | Drafted + approved | 5 | Drafted |
| Task 3: UI component | Drafted + approved | 3 | Drafted |
| Task 4: Documentation | Skipped | 0 | Exempt |

**Result:** X/Y tasks have acceptance criteria. Z/Y tasks have Quality Constraints. Plan is ready for review.
```

### Step 7: Write Return Contract (conditional)

**Only executes if `write_contract_to` is set in the skill's ARGUMENTS.** If the arg is absent, skip this step entirely and return the Step 6 report as the skill's output.

Construct the return contract object per the locked spec from #251:

- `schema_version`: `1` (integer — contract schema version, NOT the in-progress state-file schema version)
- `phase`: the `phase_id` arg value (default `"verify-plan-criteria"`)
- `status`: one of:
  - `"success"` — all tasks have criteria, none flagged vague, all quality constraints present
  - `"partial"` — some tasks were drafted/approved or skipped, but the plan is usable
  - `"failed"` — one or more tasks could not have criteria established (rare; only when both auto-draft and user-skip paths fail)
- `plan_path`: absolute path to the plan file checked
- `criteria_total`: total count of `- [ ]` criteria items across all tasks (including drafted + approved)
- `criteria_machine_verifiable`: count of criteria items that are not `[MANUAL]`
- `criteria_added_by_agent`: count of criteria items drafted by this skill in Step 4 (zero if all tasks already had criteria)
- `tasks_missing_criteria`: list of task identifiers (e.g., `["Task 3", "Task 7"]`) that still have no criteria after Step 5; empty list `[]` if all tasks are covered

Write the contract to the state file using this helper (mirrors the env-var passing pattern in `skills/start/SKILL.md`'s mid-lifecycle update helper at lines 627-637 — apostrophe-safe, no inline interpolation):

```bash
F="<write_contract_to value>"
PHASE_ID="<phase_id value, default: verify-plan-criteria>"
STATUS="<success|partial|failed>"
PLAN_PATH="<absolute plan path>"
TOTAL=<criteria_total>
MACHINE=<criteria_machine_verifiable>
ADDED=<criteria_added_by_agent>
MISSING='<json-array-string, e.g. ["Task 3","Task 7"] or []>'

[ -f "$F" ] && F="$F" PHASE_ID="$PHASE_ID" STATUS="$STATUS" PLAN_PATH="$PLAN_PATH" TOTAL="$TOTAL" MACHINE="$MACHINE" ADDED="$ADDED" MISSING="$MISSING" python3 -c '
import os, json, yaml
f = os.environ["F"]
d = yaml.safe_load(open(f)) or {}
phase = os.environ["PHASE_ID"]
if "phase_summaries" not in d or phase not in d["phase_summaries"]:
    print(f"[verify-plan-criteria] WARNING: phase_summaries.{phase} not found in {f}; skipping contract write")
else:
    d["phase_summaries"][phase]["return_contract"] = {
        "schema_version": 1,
        "phase": phase,
        "status": os.environ["STATUS"],
        "plan_path": os.environ["PLAN_PATH"],
        "criteria_total": int(os.environ["TOTAL"]),
        "criteria_machine_verifiable": int(os.environ["MACHINE"]),
        "criteria_added_by_agent": int(os.environ["ADDED"]),
        "tasks_missing_criteria": json.loads(os.environ["MISSING"]),
    }
    yaml.dump(d, open(f, "w"), default_flow_style=False, allow_unicode=True)
    print(f"[verify-plan-criteria] return_contract written to {f}")
'
```

The `[ -f "$F" ]` guard is intentional — when invoked outside a lifecycle context (e.g., in tests or one-off invocations), `write_contract_to` may point to a file that doesn't exist. In that case, log a warning and return normally — the skill's primary output (the Step 6 report) is still valid.

After writing, return the state-file path and a one-line summary as the skill's result text:

`"Return contract written to <write_contract_to>. Criteria: <total> total, <machine> machine-verifiable, <added> added by agent. Status: <status>."`

The orchestrator (Pattern A wrapper in `skills/start/SKILL.md`) reads this state-file path from the result string, loads `phase_summaries.<phase_id>.return_contract` from the YAML, and runs `hooks/scripts/validate-return-contract.js` against the loaded object before proceeding.

## Quality Rules for Criteria

Good criteria are:
- **Specific:** "File exists at `src/components/Badge.tsx`" not "component is created"
- **Verifiable by machine:** Can be checked with ls, grep, or running a command
- **Independent:** Each criterion checks one thing
- **Non-vague:** No "works correctly", "handles errors", "is performant"

If a criterion can only be verified manually (visual rendering, user interaction), write it as:
- `- [ ] [MANUAL] Badge renders in red when allergens overlap`

The `[MANUAL]` prefix tells the task-verifier to mark it as CANNOT_VERIFY rather than attempting to check it.
