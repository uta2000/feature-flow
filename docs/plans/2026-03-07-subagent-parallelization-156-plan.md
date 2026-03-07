# Subagent-Driven Development Parallelization Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Add Parallelizable field to Writing Plans Quality Context Injection — STATUS: done (commit 37eecd5)
Task 2: Add Parallelization Protocol to Subagent-Driven Development YOLO Override — STATUS: done (commit 73128da)
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.

**Goal:** Add parallelization support to the `subagent-driven-development` skill so it dispatches independent mechanical tasks in parallel batches rather than sequentially, achieving ≥50% parallel dispatch for plans with >5 tasks.

**Architecture:** Two additive changes to `skills/start/references/yolo-overrides.md`: (1) require plans to declare task parallelizability via a new `Parallelizable:` Quality Constraints field; (2) add a Parallelization Protocol to the YOLO override that uses this field to build parallel execution waves before the task loop starts.

**Tech Stack:** Markdown (skill documentation)

---

### Task 1: Add Parallelizable field to Writing Plans Quality Context Injection

**Files:**
- Modify: `skills/start/references/yolo-overrides.md`

**Step 1: Read the file to locate insertion point**

Read `skills/start/references/yolo-overrides.md`. Find the `## Writing Plans Quality Context Injection` section. Locate the closing ``` of the Progress Index example code block — item 4 ends there. The insertion point is between that closing ``` and the `**Example task with quality constraints:**` heading.

**Step 2: Output a change plan (MANDATORY — design-first file)**

Before any Edit call, output:
- Where item 5 inserts (between Progress Index example and the quality constraints example)
- What text to add
- How to update the example task block to include `Parallelizable: no`

**Step 3: Add item 5 — Parallelizable field requirement**

Insert the following after the closing ` ``` ` of the Progress Index example (before `**Example task with quality constraints:**`):

```
5. **Parallelizable field required in Quality Constraints.** Each task's Quality Constraints section must include a `Parallelizable:` field declaring whether the task can execute concurrently with other tasks in this plan:
   - `Parallelizable: yes` — task modifies files not shared with any other task in this plan; safe to dispatch concurrently with other `yes` tasks
   - `Parallelizable: no` — task shares files with one or more other tasks, or has logic dependencies; must run sequentially
   - `Parallelizable: unknown` — file dependencies unclear at plan time; treated as `no` by the orchestrator (sequential)

   The `subagent-driven-development` orchestrator reads this field during its Parallelization Protocol to group tasks into execution waves.
```

Also add `- Parallelizable: no` to the `**Quality Constraints:**` block inside the `**Example task with quality constraints:**` code example (after the `- Pattern:` line).

**Step 4: Verify**

Read `skills/start/references/yolo-overrides.md` and confirm:
- Item 5 appears in the Writing Plans Quality Context Injection section
- Three values (`yes`, `no`, `unknown`) are documented with explanations
- `unknown` is documented as treated as `no`
- Example task Quality Constraints block includes `- Parallelizable: no`

**Step 5: Commit**

```bash
git add skills/start/references/yolo-overrides.md
git commit -m "feat: add Parallelizable field requirement to writing-plans Quality Constraints"
```

**Acceptance Criteria:**
- [ ] `Writing Plans Quality Context Injection` section in `skills/start/references/yolo-overrides.md` contains a new item 5 titled "Parallelizable field required in Quality Constraints"
- [ ] Item 5 documents three values: `yes`, `no`, `unknown`
- [ ] Item 5 states that `unknown` is treated as `no` (sequential) by the orchestrator
- [ ] Item 5 mentions `subagent-driven-development` as the consumer of the field
- [ ] The example task `**Quality Constraints:**` block includes a `- Parallelizable: no` line
- [ ] File commits successfully with no merge conflicts

**Quality Constraints:**
- Error handling: N/A (markdown file — no error paths)
- Types: N/A
- Function length: N/A
- Pattern reference: Follow item 4 (Progress Index requirement) for list formatting and indentation
- Files modified: `skills/start/references/yolo-overrides.md` (design-first — 215+ lines)
- Design-first files: `skills/start/references/yolo-overrides.md` — implementer must read file and output a change plan before any Edit call
- Parallelizable: no (same file as Task 2; must run before Task 2)

---

### Task 2: Add Parallelization Protocol to Subagent-Driven Development YOLO Override

**Files:**
- Modify: `skills/start/references/yolo-overrides.md`

**Step 1: Read the file to locate insertion point**

Read `skills/start/references/yolo-overrides.md`. Find the `## Subagent-Driven Development YOLO Override` section. Locate item `4.` — the line that reads "When dispatching Explore agents during implementation, follow the Model Routing Defaults section below (`haiku`)." The new item 5 inserts immediately after this line, before the `## Subagent-Driven Development Context Injection` section heading.

**Step 2: Output a change plan (MANDATORY — design-first file)**

Before any Edit call, output:
- Exact insertion point (after item 4, before `## Subagent-Driven Development Context Injection`)
- Confirm the four phases (A, B, C, D) and safety constraint text are ready
- Confirm the announcement format

**Step 3: Add item 5 — Parallelization Protocol**

Insert the following after item 4 and before the `## Subagent-Driven Development Context Injection` heading:

```
5. **Parallelization Protocol.** Before starting the task loop, analyze the plan to maximize parallel dispatch. Never implement tasks inline — the orchestrator's role is analysis and dispatch only.

   **Phase A — Dependency analysis:**
   - For each task, read its `Parallelizable:` field from Quality Constraints
   - If `Parallelizable: yes`: task is independent (safe to parallelize)
   - If `Parallelizable: no` or absent: check "Files modified" lists — two tasks conflict if they share any listed file; tasks with no shared files are treated as independent
   - `Parallelizable: unknown` defaults to sequential

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
   - Announce: `YOLO: subagent-driven-development — Parallelization → Wave 1: [N tasks], Wave 2: [M tasks], total [K/T] dispatched to subagents`

   **Safety (CRITICAL):** Only dispatch in parallel when tasks have zero shared file dependencies. Never dispatch two tasks that modify the same file concurrently — this causes irrecoverable git conflicts. The dependency analysis in Phase A enforces this. When in doubt, default to sequential.
```

**Step 4: Verify**

Read `skills/start/references/yolo-overrides.md` and confirm:
- New item 5 appears in the Subagent-Driven Development YOLO Override section
- All four phases (A, B, C, D) are present with correct content
- "Never implement tasks inline" instruction is present
- Safety constraint is present
- YOLO announcement format is present

**Step 5: Commit**

```bash
git add skills/start/references/yolo-overrides.md
git commit -m "feat: add Parallelization Protocol to subagent-driven-development YOLO override"
```

**Acceptance Criteria:**
- [ ] `Subagent-Driven Development YOLO Override` section in `skills/start/references/yolo-overrides.md` contains a new item 5 titled "Parallelization Protocol"
- [ ] Item 5 includes "Never implement tasks inline" instruction
- [ ] Phase A documents dependency analysis using `Parallelizable:` field and "Files modified" fallback
- [ ] Phase B defines mechanical classification: ≤2 files AND at least one pattern match AND no complexity keywords
- [ ] Phase C defines execution waves: Wave 1 = independent mechanical (parallel), Wave 2+ = remaining in dependency order
- [ ] Phase D defines ≥50% minimum threshold with border-case promotion for plans with >5 tasks
- [ ] Safety constraint explicitly prohibits parallel dispatch of tasks sharing files
- [ ] YOLO announcement format is specified: `YOLO: subagent-driven-development — Parallelization → Wave 1: [N tasks], Wave 2: [M tasks], total [K/T] dispatched to subagents`
- [ ] File commits successfully with no merge conflicts

**Quality Constraints:**
- Error handling: N/A (markdown file)
- Types: N/A
- Function length: N/A
- Pattern reference: Follow items 1-4 for numbered list formatting, bold phase headings, and bullet indentation
- Files modified: `skills/start/references/yolo-overrides.md` (design-first — 215+ lines)
- Design-first files: `skills/start/references/yolo-overrides.md` — implementer must read file and output a change plan before any Edit call
- Parallelizable: no (same file as Task 1; must run after Task 1)
