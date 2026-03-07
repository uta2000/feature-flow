# YOLO/Express Overrides and Context Injections

**Usage:** Read this file when the lifecycle is in YOLO or Express mode and reaches a skill invocation that has a YOLO override, or when dispatching subagents that need quality context injection.

---

## Writing Plans YOLO Override

When YOLO **or Express** mode is active and invoking `superpowers:writing-plans` (for Express mode, substitute `Express:` for `YOLO:` in all inline announcements):

The writing-plans skill presents an execution choice after saving the plan. In YOLO mode, the lifecycle has already decided on subagent-driven execution — presenting this prompt would break unattended flow. Skip the execution choice prompt and proceed directly.

After the plan is saved:
1. Announce: `YOLO: writing-plans — Execution choice → Subagent-Driven (auto-selected)`
2. Immediately proceed to the next lifecycle step

## Writing Plans Quality Context Injection

This section applies unconditionally in all modes (YOLO, Express, Interactive). When invoking `superpowers:writing-plans`, prepend the following quality requirements to the planning instructions so that every task in the implementation plan includes quality constraints alongside acceptance criteria. `verify-plan-criteria` enforces these requirements — tasks without Quality Constraints will be flagged.

**Prepend to the planning instructions:**

1. **Quality Constraints section required per task.** Every non-trivial task must include a `**Quality Constraints:**` section after its acceptance criteria. The section specifies:
   - **Error handling pattern:** Which pattern to use (typed errors, discriminated unions, Result<T, E>) and which existing file to follow as reference
   - **Type narrowness:** Which types must use literal unions instead of string/number, and which types should be generated vs hand-maintained
   - **Function length/extraction:** Whether the task's main function can fit in ≤30 lines, and what helpers to extract if not
   - **Pattern reference:** Which existing file in the codebase to follow as a structural pattern

2. **Edge case criteria required in acceptance criteria.** For tasks that handle input, make external calls, or process data, acceptance criteria must include at least one edge case test:
   - Empty/null input handling
   - Timeout/error path handling
   - Boundary value testing (e.g., pagination limits, max lengths)
   - Special character/injection prevention (where applicable)

3. **File modification complexity required in Quality Constraints.** For tasks that modify existing files (not create new ones), the Quality Constraints section must include:
   - **Files modified:** List of existing files this task will edit
   - **Design-first files:** Any listed file >150 lines, flagged with `(design-first)` — the implementer must output a change plan before editing these files

4. **Progress Index header required in every plan.** Every plan file must include a machine-readable Progress Index HTML comment immediately after the plan title line and before any other content. The index lists every task by number and name with STATUS: pending, and sets CURRENT: none. The header specifies:
   - **Syntax:** Use HTML comment syntax (`<!-- ... -->`) so the index doesn't render in markdown viewers
   - **Task lines:** Include every task from the plan (one line per task); if the plan has no tasks, omit task lines entirely — the index block is still required with only `CURRENT: none`
   - **STATUS values:** STATUS accepts three values: `pending`, `in-progress`, `done (commit [SHA])`
   - **CURRENT field:** CURRENT is `Task N` when a task is active, `none` when between tasks or at start (e.g., `CURRENT: Task 2` when Task 2 is active)
   - **Callout block:** The `> **For Claude:**` callout is required in every plan file. It must immediately follow the closing `-->` on a new line

   Example:

   ```markdown
   # [Feature Name] Implementation Plan

   <!-- PROGRESS INDEX (updated by implementation skills)
   Task 1: [name] — STATUS: pending
   Task 2: [name] — STATUS: pending
   Task 3: [name] — STATUS: pending
   CURRENT: none
   -->

   > **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
   > Then read the full section for that specific task only.
   ```

5. **Parallelizable field required in Quality Constraints.** Each task's Quality Constraints section must include a `Parallelizable:` field declaring whether the task can execute concurrently with other tasks in this plan:
   - `Parallelizable: yes` — task modifies files not shared with any other task in this plan; safe to dispatch concurrently with other `yes` tasks
   - `Parallelizable: no` — task shares files with one or more other tasks, or has logic dependencies; must run sequentially
   - `Parallelizable: unknown` — file dependencies unclear at plan time; treated as `no` by the orchestrator (sequential)

   The `subagent-driven-development` orchestrator reads this field during its Parallelization Protocol to group tasks into execution waves.

**Example task with quality constraints:**

```markdown
### Task 3: Build search handler

**Acceptance Criteria:**
- [ ] Returns paginated results matching query
- [ ] Returns empty array for no matches
- [ ] Handles API timeout (30s) with typed error
- [ ] Returns validation error for empty string input

**Quality Constraints:**
- Error handling: typed errors with discriminated union (match `src/handlers/users.ts`)
- Types: `SearchResult.status` uses literal union `'available' | 'taken' | 'error'`, not string
- Function length: handler ≤30 lines; extract validation and transformation helpers
- Pattern: follow existing handler in `src/handlers/users.ts`
- Files modified: `src/handlers/search.ts` (design-first — 180 lines)
- Design-first files: `src/handlers/search.ts` — implementer must output change plan before editing
- Parallelizable: no
```

## Using Git Worktrees YOLO Override

When YOLO **or Express** mode is active and invoking `superpowers:using-git-worktrees` (for Express mode, substitute `Express:` for `YOLO:` in all inline announcements):

The using-git-worktrees skill asks where to create worktrees and whether to proceed when baseline tests fail. In YOLO mode, these prompts would stall unattended execution — the lifecycle uses a standard directory (`.worktrees/`) and defers test failures to later verification steps. Auto-select the worktree directory and proceed past baseline test failures.

How to proceed:
1. **Worktree directory:** Auto-select `.worktrees/` (project-local, hidden).
   Check existence with:
   ```bash
   test -d .worktrees && echo "exists" || echo "creating"
   ```
   If it doesn't exist, create it. Use `test -d` instead of `ls -d` for existence checks — `ls -d` returns non-zero for missing directories, causing false tool errors.
   Announce: `YOLO: using-git-worktrees — Worktree directory → .worktrees/ (auto-selected)`
2. **Baseline test failure:** If tests fail during baseline verification, log the failures as a warning and proceed. Announce: `YOLO: using-git-worktrees — Baseline tests failed → Proceeding with warning (N failures logged)`. The lifecycle will catch test issues during implementation and verification steps.

## Finishing a Development Branch YOLO Override

When YOLO **or Express** mode is active and invoking `superpowers:finishing-a-development-branch` (for Express mode, substitute `Express:` for `YOLO:` in all inline announcements):

The finishing-a-development-branch skill presents a 4-option completion menu and a base branch confirmation prompt. In YOLO mode, the lifecycle always creates a PR targeting the detected base branch — presenting options or confirmations would stall unattended flow. Auto-confirm the base branch and auto-select "Push and create a Pull Request."

How to proceed:
1. **Base branch:** Auto-confirm the detected base branch (from Step 0 base branch detection). Announce: `YOLO: finishing-a-development-branch — Base branch → [detected base branch]`
2. **Completion strategy:** Auto-select "Push and create a Pull Request" (Option 2). Announce: `YOLO: finishing-a-development-branch — Completion strategy → Push and create PR (auto-selected)`
3. Proceed with the push + PR creation flow without presenting the 4-option menu
4. **Issue reference in PR body:** When a GitHub issue is linked to the lifecycle, use `Related: #N` instead of `Closes #N` in the PR body — the lifecycle closes the issue explicitly in the "Comment and Close Issue" step with a detailed comment.
5. For PR title/body, use the feature description and lifecycle context to generate them automatically. **Include the aggregated code review summary in the PR body** — append the PR Review Toolkit Summary (from the Phase 1a subagent output, including the `### Auto-Fixed` section from Phase 1a), any findings fixed by the single-pass fix phase (Phase 3), and any remaining minor findings. Use this section heading in the PR body: `## Code Review Summary`.
6. **Test failure during completion:** If tests fail, log the failures as a warning and proceed with PR creation. Announce: `YOLO: finishing-a-development-branch — Tests failing → Proceeding with PR (N failures logged)`. Proceed past test failures — the code review pipeline already ran verification.

## Subagent-Driven Development YOLO Override

When YOLO **or Express** mode is active and invoking `superpowers:subagent-driven-development` (for Express mode, substitute `Express:` for `YOLO:` in all inline announcements):

The subagent-driven-development skill invokes `finishing-a-development-branch` after all tasks complete. The same YOLO rationale applies: auto-confirm the base branch and auto-select PR creation per the "Finishing a Development Branch YOLO Override" above.

Additional YOLO behavior:
0. **Pass lifecycle context in args.** When invoking this skill, include all known artifact paths: `plan_file`, `design_doc`, `worktree`, `base_branch`, `issue` (per the Lifecycle Context Object section). The skill uses `plan_file` directly to read the plan instead of discovering it via Glob.
1. If any subagent (implementer, spec reviewer, or code quality reviewer) surfaces questions that would normally require user input, auto-answer them from the implementation plan, design document, and codebase context. Announce each: `YOLO: subagent-driven-development — [question] → [answer from context]`
2. When dispatching implementation subagents, use `model: sonnet` unless the task description contains keywords indicating architectural complexity: "architect", "migration", "schema change", "new data model". For these, use `model: opus`. Announce: `YOLO: subagent-driven-development — Model selection → sonnet (or opus for [keyword])`
3. When dispatching spec review or consumer verification subagents, use `model: sonnet`. These agents compare implementation against acceptance criteria or verify existing code is unchanged — checklist work that does not require deep reasoning.
4. When dispatching Explore agents during implementation, follow the Model Routing Defaults section below (`haiku`).
5. **Parallelization Protocol.** Before starting the task loop, analyze the plan to maximize parallel dispatch. Never implement tasks inline — the orchestrator's role is analysis and dispatch only.

   **Phase A — Dependency analysis:**
   - For each task, read its `Parallelizable:` field from Quality Constraints
   - If `Parallelizable: yes`: task is independent (safe to parallelize)
   - If `Parallelizable: no`: treat as sequential — respect the planner's explicit declaration (including logic dependencies that file analysis cannot infer)
   - If field is absent: check "Files modified" lists — two tasks conflict if they share any listed file; tasks with no shared files are treated as independent
   - `Parallelizable: unknown` defaults to sequential, unless promoted by Phase D's minimum threshold rule

   **Phase B — Mechanical classification:**
   A task is **mechanical** if ALL hold:
   - "Files modified" lists ≤2 files
   - Description matches at least one pattern: type generation, schema regeneration, config edit, nav item, isolated UI primitive, database type update, single-file utility
   - Description contains NONE of: "integrate", "orchestrate", "refactor", "migrate", "architect", "coordinate", "pipeline"

   **Phase C — Execution waves:**
   - **Wave 1:** all independent + mechanical tasks → dispatch as parallel `Task()` calls in a **single message**
   - **Wave 2+:** remaining tasks in dependency order; tasks within a wave with no mutual file conflicts may also be dispatched in parallel (single message per wave)
   - A task in Wave N+1 waits for all Wave N tasks to complete before dispatch

   **Phase D — Minimum threshold:**
   When the plan has >5 tasks:
   - If (parallel-dispatched tasks) / (total tasks) < 0.50, promote additional border-case tasks (those with `Parallelizable: unknown` and no obvious file conflicts) from sequential to independent

   Announce after completing all phases: `YOLO: subagent-driven-development — Parallelization → Wave 1: [N tasks], Wave 2: [M tasks], total [K/T] dispatched to subagents`

   **Safety (CRITICAL):** Only dispatch in parallel when tasks have zero shared file dependencies. Never dispatch two tasks that modify the same file concurrently — this causes irrecoverable git conflicts. The dependency analysis in Phase A enforces this. When in doubt, default to sequential.

## Subagent-Driven Development Context Injection

This section applies unconditionally in all modes (YOLO, Express, Interactive). When `subagent-driven-development` is executing the task loop, maintain the Progress Index in the plan file after each task's status changes by running the Edit operations below.

**When starting a task (before dispatching the implementer subagent):**
1. Check if the plan file contains `<!-- PROGRESS INDEX` — if not, skip steps 2–3 below and proceed normally (backward compatibility for plans without an index)
2. Edit the plan file to update the task's STATUS: `pending` → `in-progress`
3. Edit the plan file to update CURRENT: `CURRENT: none` → `CURRENT: Task N` (where N is the task number)

Example edits (starting Task 2):
- old_string: `Task 2: [name] — STATUS: pending`
- new_string: `Task 2: [name] — STATUS: in-progress`
- old_string: `CURRENT: none`
  *(Target only the PROGRESS INDEX block — if this string appears elsewhere in the file, add surrounding context lines from the index block to make old_string unique.)*
- new_string: `CURRENT: Task 2`

**When completing a task (after both spec and code quality reviews pass):**
1. Check if the plan file contains `<!-- PROGRESS INDEX` — if not, skip steps 2–3 below and proceed normally (backward compatibility for plans without an index)
2. Get the final commit SHA: `git rev-parse HEAD`
3. Edit the plan file to update STATUS: `in-progress` → `done (commit [SHA])`
4. Edit the plan file to update CURRENT: `CURRENT: Task N` → `CURRENT: none` (or the next task's number if proceeding immediately)

   > **Note:** If you are proceeding immediately to the next task, set `CURRENT: Task [N+1]` instead of `CURRENT: none` (the "starting a task" protocol above handles this case if run in sequence).

Example edits (completing Task 2 with commit abc1234):
- old_string: `Task 2: [name] — STATUS: in-progress`
- new_string: `Task 2: [name] — STATUS: done (commit abc1234)`
- old_string: `CURRENT: Task 2`
- new_string: `CURRENT: none`

**Task transition batching:** When completing implementation task N and starting task N+1, batch both `TaskUpdate` calls into a single parallel message before dispatching the next implementer subagent: `[TaskUpdate(N, completed), TaskUpdate(N+1, in_progress)]`. This saves one API round-trip per task transition. When N is the last task (no N+1 in the plan), call only `TaskUpdate(N, completed)` — do not batch.

## Implementer Quality Context Injection

This section applies unconditionally in all modes (YOLO, Express, Interactive). When `subagent-driven-development` dispatches implementer subagents, prepend quality context to each implementer's prompt so they write code that follows standards from the start.

**Context injected per implementer subagent:**

1. **Relevant coding standards sections.** Extract the sections from `../../references/coding-standards.md` that apply to the task being implemented, using `<!-- section: slug -->` markers. For example, a task building an API handler gets: `functions`, `error-handling`, `types`, and `naming-conventions`. A task building a UI component gets: `functions`, `types`, `separation-of-concerns`, and `naming-conventions`. Always include `functions` and `types` — they apply universally.

2. **"How to Code This" notes.** Include the per-task notes generated during the Study Existing Patterns step. These map each task to the specific patterns found in the codebase (e.g., "Follow pattern from `src/handlers/users.ts`; error handling uses discriminated union return type").

3. **Anti-patterns found.** Include any anti-patterns flagged during Study Existing Patterns with an explicit instruction: "Do NOT replicate these patterns in new code." This prevents implementers from copying existing bad patterns for consistency.

4. **Quality Constraints from the plan task.** Include the `**Quality Constraints:**` section from the specific plan task being implemented. This gives the implementer concrete constraints: which error handling pattern, which types must be narrow, what function length target, and which file to follow.

5. **Change Design Protocol.** For every file the task modifies (listed in the Quality Constraints `Files modified` field), instruct the implementer to follow this protocol before any Edit call:
   1. **Read the complete file** before any edit. (For very large files >200KB, use Grep to locate relevant sections or Read with offset/limit — this is a read strategy, separate from the design-first threshold.)
   2. **Output a brief change plan:** which functions/sections change, what's added, what's removed, and how the change fits the file's existing structure.
   3. **Write the edit in one pass** — do not edit, run typecheck, re-read, and edit again. If the first edit has issues, re-read the file to understand what went wrong before making a second edit.
   4. For files marked `(design-first)` in Quality Constraints (>150 lines): the change plan in sub-step 2 is **mandatory** and must be output before any Edit tool call on that file.

6. **Git Safety Protocol.** Instruct the implementer to never use history-rewriting git operations:
   - Never use `git commit --amend` — always create a new commit instead (even for wrong messages or forgotten files)
   - Never use `git rebase -i` — leave the commit history as-is; if cleanup is needed, ask the human user
   - Never use `git push --force` or `git push --force-with-lease` — if the situation seems to require it, stop and ask the human user directly
   - This aligns with Claude Code's own git safety protocol: "CRITICAL: Always create NEW commits rather than amending"

**Injection format:**

```
## Quality Context for This Task

### Coding Standards (from ../../references/coding-standards.md)
[Extracted sections relevant to this task]

### How to Code This
[Per-task notes from Study Existing Patterns]

### Anti-Patterns (do NOT replicate)
[Flagged anti-patterns from Study Existing Patterns]

### Quality Constraints (from implementation plan)
[Quality Constraints section from this specific task]

### Change Design Protocol
For each file you modify, follow this protocol:
1. Read the complete file before editing
2. Output your change plan (which functions change, what's added/removed)
3. Write the edit in one pass
4. MANDATORY for design-first files: Output your change plan before ANY Edit call on: [file list]

### Git Safety Protocol
Never use history-rewriting git operations:
- `git commit --amend` — always create a new commit instead (even for wrong messages or forgotten files)
- `git rebase -i` — rewrites history; leave the commit history as-is or ask the user before squashing
- `git push --force` or `git push --force-with-lease` — never use these; if the situation seems to require it, stop and ask the human user directly
If you need to add a forgotten file: `git add <file> && git commit -m "chore: add missing file"`
If the commit message was wrong: create a new commit with a corrective message — do not amend.
If a pre-commit hook failed: fix the underlying issue and create a NEW commit — do not amend.
```
