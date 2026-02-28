# Reduce Orchestrator Token Consumption — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce parent orchestrator API calls by ~31 per feature-scope session (~15%) via four targeted text edits to `skills/start/SKILL.md`.

**Architecture:** Four surgical edits to markdown instruction text in SKILL.md. No code is written — these are natural-language instructions that the LLM interpreter reads. Each edit replaces a specific instruction block with a more efficient variant. The file is ~1550 lines; every task requires reading the target section before editing (design-first protocol).

**Tech Stack:** Markdown editing only. Verification via `grep`. No build step.

---

### Task 1: Batch TaskCreate Calls in Step 2

**Files:**
- Modify: `skills/start/SKILL.md` (line 449 — TaskCreate instruction at end of Step 2 section) *(design-first — 1550 lines)*

**Acceptance Criteria:**
- [ ] The phrase "single parallel message" appears in `skills/start/SKILL.md`
- [ ] The phrase "Do NOT call them one at a time" appears in `skills/start/SKILL.md`
- [ ] The original sentence "Use the `TaskCreate` tool to create a todo item for each step" is still present (instruction is extended, not replaced)
- [ ] Edge case: the instruction applies to all scope variants (quick fix 7 tasks, feature 18 tasks) — instruction uses "all N TaskCreate calls" not a hardcoded count
- [ ] Edge case: the instruction does not conflict with the mobile platform step additions announced just before the TaskCreate line

**Quality Constraints:**
- Error handling: no error paths (markdown text edit only)
- Types: no types (markdown)
- Function length: single Edit call; change is one sentence appended to line 449
- Pattern reference: follow existing instruction style in SKILL.md (imperative, bold key terms, inline code for tool names)
- Files modified: `skills/start/SKILL.md` (design-first — 1550 lines)
- Design-first files: `skills/start/SKILL.md` — read lines 434–450 before editing, output change plan

**Step 1: Read target section**

Run: `Read skills/start/SKILL.md lines 434–450`

Confirm current text at line 449:
> `Use the \`TaskCreate\` tool to create a todo item for each step (see \`../../references/tool-api.md\` — Deferred Tools section for loading instructions and correct usage).`

**Step 2: Output change plan**

Target line 449. Append the following sentence after the existing instruction (on a new line or as continuation):

> `Call all TaskCreate tools in a **single parallel message** — send one message containing all N TaskCreate calls simultaneously. Do NOT call them one at a time; sequential calls waste N−1 parent API turns. This is the most impactful optimization: all steps must be created in one turn.`

No other lines change. The existing sentence stays intact as the opening.

**Step 3: Apply the edit**

Use Edit tool. Old string: the exact line 449 text. New string: original sentence + newline + new sentence.

**Step 4: Verify**

Run grep to confirm:
```bash
grep -c "single parallel message" skills/start/SKILL.md
# Expected: 1

grep -c "Do NOT call them one at a time" skills/start/SKILL.md
# Expected: 1

grep -c "Use the \`TaskCreate\` tool to create a todo item for each step" skills/start/SKILL.md
# Expected: 1 (original still present)
```

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "perf(start): batch TaskCreate calls in Step 2 into single parallel message"
```

---

### Task 2: Replace in_progress Sub-step with Exhaustive Classification

**Files:**
- Modify: `skills/start/SKILL.md` (line 456 — sub-step 2 of Step 3) *(design-first — 1550 lines)*

**Acceptance Criteria:**
- [ ] The old sub-step 2 text "**Mark in progress:** Update the todo item to `in_progress` using `TaskUpdate`" is no longer present
- [ ] The new sub-step 2 contains "Mark in progress (conditional)"
- [ ] The new text explicitly lists steps that **keep** `in_progress`: study existing patterns, implementation, self-review, code review, generate CHANGELOG entry, final verification, documentation lookup
- [ ] The new text explicitly lists steps that **skip** `in_progress`: brainstorming, design document, design verification, create/update issue, implementation plan, verify plan criteria, worktree setup, copy env files, commit planning artifacts, commit and PR, comment and close issue
- [ ] The new text clarifies that sub-step 5 (completed) is the turn-continuity bridge and is unaffected
- [ ] Edge case: both lists are complete and mutually exclusive (every lifecycle step appears in exactly one list)
- [ ] Edge case: the note about YOLO propagation vs Task() dispatch is included

**Quality Constraints:**
- Error handling: no error paths (markdown text edit)
- Function length: single Edit call
- Pattern reference: follow existing sub-step format (numbered list, bold labels, inline code for tool/value names)
- Files modified: `skills/start/SKILL.md` (design-first — 1550 lines)
- Design-first files: `skills/start/SKILL.md` — read lines 451–465 before editing, output change plan

**Step 1: Read target section**

Run: `Read skills/start/SKILL.md lines 451–465`

Confirm current line 456:
> `2. **Mark in progress:** Update the todo item to \`in_progress\` using \`TaskUpdate\` (see \`../../references/tool-api.md\` — Deferred Tools)`

**Step 2: Output change plan**

Replace only sub-step 2 (line 456). New text:

```
2. **Mark in progress (conditional):** Only set `in_progress` via `TaskUpdate` before starting steps where the work is extended and the user benefits from an active status indicator. **Steps that keep `in_progress`:** study existing patterns, implementation, self-review, code review, generate CHANGELOG entry, final verification, documentation lookup. **Steps that skip `in_progress`:** brainstorming, design document, design verification, create/update issue, implementation plan, verify plan criteria, worktree setup, copy env files, commit planning artifacts, commit and PR, comment and close issue. Note: sub-step 5 (`completed`) is always retained — it is the turn-continuity bridge. Skipping `in_progress` does not affect YOLO Execution Continuity. Note: YOLO propagation (prepending `yolo: true`) applies only to `Skill()` invocations, not to `Task()` dispatches.
```

Sub-steps 1 and 3–7 remain unchanged.

**Step 3: Apply the edit**

Use Edit tool. Old string = exact line 456 text. New string = new sub-step 2 text above.

**Step 4: Verify**

```bash
grep -c "Mark in progress (conditional)" skills/start/SKILL.md
# Expected: 1

grep -c "Mark in progress:.*Update the todo item to" skills/start/SKILL.md
# Expected: 0 (old text gone)

grep -c "study existing patterns, implementation, self-review" skills/start/SKILL.md
# Expected: 1

grep -c "turn-continuity bridge" skills/start/SKILL.md
# Expected: 1
```

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "perf(start): replace in_progress sub-step with exhaustive keep/skip classification"
```

---

### Task 3: Delegate Commit Planning Artifacts to Subagent

**Files:**
- Modify: `skills/start/SKILL.md` (lines 809–831 — Commit Planning Artifacts Step section) *(design-first — 1550 lines)*

**Acceptance Criteria:**
- [ ] The section heading "Commit Planning Artifacts Step (inline — no separate skill)" remains unchanged
- [ ] The old step 3 (git add) and step 4 (git commit) are no longer present as inline bash calls
- [ ] A `Task(subagent_type: "general-purpose", model: "sonnet")` dispatch is present in the section
- [ ] The section describes checking `git status --porcelain` inline (step 1)
- [ ] Edge case: the section handles non-zero exit code from `git status` conservatively (treat as "may have artifacts, proceed to subagent")
- [ ] Edge case: the subagent prompt instructs reporting "nothing to commit" if nothing staged
- [ ] Edge case: the section preserves the same skip logic for empty output with exit code 0

**Quality Constraints:**
- Error handling: conservative fallback for git status non-zero exit — documented in section
- Function length: single Edit call covering lines 813–831 (the Process + Edge cases block)
- Pattern reference: follow existing general-purpose subagent dispatch format from Model Routing Defaults section and tool-api.md (Task with subagent_type, model, description, prompt)
- Files modified: `skills/start/SKILL.md` (design-first — 1550 lines)
- Design-first files: `skills/start/SKILL.md` — read lines 809–832 before editing, output change plan

**Step 1: Read target section**

Run: `Read skills/start/SKILL.md lines 809–832`

Confirm old Process section (steps 1–4) and Edge cases block.

**Step 2: Output change plan**

Replace the entire block from "**Process:**" through the end of the Edge cases block (keeping the section heading and opening sentence). New Process section:

```markdown
**Process:**
1. Run inline: `git status --porcelain docs/plans/*.md .feature-flow.yml 2>/dev/null`
   - If output is empty AND exit code is 0: skip — "No planning artifacts to commit."
   - If output is empty AND exit code is non-zero (error suppressed by `2>/dev/null`): treat conservatively as "artifacts may exist" and proceed to step 2.
   - If output is non-empty: proceed to step 2.
2. Dispatch a general-purpose subagent to commit:

   ```
   Task(
     subagent_type: "general-purpose",
     model: "sonnet",
     description: "Commit planning artifacts to base branch",
     prompt: "Commit the following files to git. Files: docs/plans/*.md and .feature-flow.yml (git add is safe on unchanged tracked files — it no-ops). Commit message: 'docs: add design and implementation plan for [feature-name]'. Run: git add docs/plans/*.md .feature-flow.yml && git commit -m '[message]'. If no files are staged after add, report 'nothing to commit'. Return: committed SHA or 'nothing to commit'."
   )
   ```

3. Announce: "Planning artifacts committed: [SHA]" or "Nothing to commit — skipping."

**Edge cases:**
- **`.feature-flow.yml` already tracked and unchanged** — `git add` no-ops on unchanged tracked files
- **No plan files exist** — git status in step 1 returns empty (exit 0), step skipped
- **Only `.feature-flow.yml` changed** — still dispatches subagent; file should be tracked regardless
```

**Step 3: Apply the edit**

Use Edit tool. Old string = from `**Process:**\n1. Check if there are planning artifacts` through the end of the Edge cases block. New string = new Process + Edge cases above.

**Step 4: Verify**

```bash
grep -c "subagent_type: \"general-purpose\"" skills/start/SKILL.md
# Expected: ≥1 (at least one in this section)

grep -c "git add docs/plans" skills/start/SKILL.md
# Expected: 1 (now inside subagent prompt, not inline)

grep -c "conservative" skills/start/SKILL.md
# Expected: ≥1 (error fallback documented)

# Old inline git add should not appear as a standalone bash block
grep -n "^   git add docs/plans" skills/start/SKILL.md
# Expected: 0 lines starting with spaces then "git add" (old bash block form)
```

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "perf(start): delegate commit-planning-artifacts bash calls to general-purpose subagent"
```

---

### Task 4: Delegate Comment and Close Issue to Subagent

**Files:**
- Modify: `skills/start/SKILL.md` (lines 1313–1371 — Comment and Close Issue Step section) *(design-first — 1550 lines)*

**Acceptance Criteria:**
- [ ] The section heading "Comment and Close Issue Step (inline — no separate skill)" remains unchanged
- [ ] The old steps 2–4 (generate comment body inline, post comment, close issue) are no longer present as inline operations
- [ ] A `Task(subagent_type: "general-purpose", model: "sonnet")` dispatch is present as step 3
- [ ] Step 1 (check issue state) remains inline
- [ ] Step 2 (data gathering) is present with two inline bash calls: `git log --format="%s" [base-branch]...HEAD` and `git diff --stat [base-branch]...HEAD | head -10`
- [ ] The subagent prompt contains the fully-assembled comment template (not placeholders relying on the subagent to gather data)
- [ ] Edge case: PR number is obtained from conversation context (not a bash call) — noted in step 2
- [ ] Edge case: the section documents that YOLO propagation does not apply to Task() dispatches (git/gh subagents need no mode flag)
- [ ] Edge case: gh command failure → log warning and continue (preserved from original)
- [ ] Edge case: issue already closed → checked in step 1, skip dispatch (preserved from original)

**Quality Constraints:**
- Error handling: gh failure → log and continue; issue already closed → skip (same as original)
- Function length: single Edit call covering lines 1317–1371 (Process + Edge cases + YOLO behavior block)
- Pattern reference: follow existing general-purpose subagent dispatch format; same Task() syntax as Task 3
- Files modified: `skills/start/SKILL.md` (design-first — 1550 lines)
- Design-first files: `skills/start/SKILL.md` — read lines 1313–1372 before editing, output change plan

**Step 1: Read target section**

Run: `Read skills/start/SKILL.md lines 1313–1372`

Confirm the existing 5-step process and edge cases block.

**Step 2: Output change plan**

Replace the entire Process section and Edge cases block (keeping heading and opening sentence). New Process section:

```markdown
**Process:**

1. **Check if issue is already closed:**
   ```bash
   gh issue view N --json state --jq '.state'
   ```
   If the state is `CLOSED`, log: `"Issue #N is already closed — skipping."` and skip.

2. **Gather context inline** (2 bash calls to assemble accurate comment content):
   ```bash
   git log --format="%s" [base-branch]...HEAD
   ```
   → Derive 2-4 "What was built" bullets from commit messages.
   ```bash
   git diff --stat [base-branch]...HEAD | head -10
   ```
   → Key files changed list.
   - **PR number:** from conversation context (produced by "Commit and PR" step — already in context)
   - **Acceptance criteria:** from conversation context (implementation plan tasks + final verification results)

3. **Dispatch a general-purpose subagent** with fully-assembled content (no placeholders):

   ```
   Task(
     subagent_type: "general-purpose",
     model: "sonnet",
     description: "Post issue comment and close issue #N",
     prompt: "Post a comment on GitHub issue #[N], then close it. Use exactly this comment body:

   ## Implementation Complete

   **PR:** #[PR number from context]

   ### What was built
   - [bullet 1 from git log]
   - [bullet 2 from git log]
   [up to 4 bullets]

   ### Acceptance criteria verified
   - [x] [criterion 1 from implementation plan]
   - [x] [criterion 2 from implementation plan]
   [all criteria]

   ### Key files changed
   - \`[file path]\` — [1-line description]
   [up to 10 files from git diff --stat]

   Run: gh issue comment [N] --body '[above content]' then gh issue close [N]. If gh fails, log the error and continue."
   )
   ```

4. **Announce:** `"Issue #N commented and closed."`

**Edge cases:**
- **No issue linked:** Skip this step silently
- **Issue already closed:** Caught in step 1 — skip dispatch
- **`gh` command fails:** Subagent logs error and continues — non-blocking
- **YOLO/mode propagation:** YOLO propagation applies only to `Skill()` invocations, not `Task()` dispatches. These git/gh subagents require no mode flag.
```

**Step 3: Apply the edit**

Use Edit tool. Old string = from `**Process:**\n\n1. **Check if issue is already closed:**` through the YOLO behavior line at the end. New string = new 4-step Process + Edge cases above.

**Step 4: Verify**

```bash
grep -c "Gather context inline" skills/start/SKILL.md
# Expected: 1

grep -c "git log --format=\"%s\"" skills/start/SKILL.md
# Expected: ≥1

grep -c "git diff --stat" skills/start/SKILL.md
# Expected: ≥1

grep -c "Post issue comment and close issue" skills/start/SKILL.md
# Expected: 1

# Old inline "Generate the comment body" should be gone
grep -c "Generate the comment body" skills/start/SKILL.md
# Expected: 0
```

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "perf(start): delegate issue comment/close to general-purpose subagent with inline data gathering"
```

---

### Task 5: Final Verification

**Files:** (read-only)
- Verify: `skills/start/SKILL.md`

**Acceptance Criteria:**
- [ ] All 4 task acceptance criteria pass (grep checks from Tasks 1–4)
- [ ] `skills/start/SKILL.md` has no syntax errors (markdown is well-formed — headings, code blocks, and lists properly opened/closed)
- [ ] The step count and structure in Step 2 (Build Step List) is unchanged
- [ ] The Step 3 execution loop still has exactly 7 sub-steps (1 through 7)
- [ ] Edge case: no orphaned markdown code fences (every ``` has a matching close)

**Quality Constraints:**
- No file modifications — read and grep only
- Files modified: none

**Step 1: Run all grep verifications**

```bash
# Task 1
grep -c "single parallel message" skills/start/SKILL.md
grep -c "Do NOT call them one at a time" skills/start/SKILL.md

# Task 2
grep -c "Mark in progress (conditional)" skills/start/SKILL.md
grep -c "study existing patterns, implementation, self-review" skills/start/SKILL.md
grep -c "turn-continuity bridge" skills/start/SKILL.md

# Task 3
grep -c "conservative" skills/start/SKILL.md
grep -n "Commit Planning Artifacts Step" skills/start/SKILL.md

# Task 4
grep -c "Gather context inline" skills/start/SKILL.md
grep -c "Generate the comment body" skills/start/SKILL.md  # Must be 0

# Structural check
grep -c "^### Step 3: Execute Steps in Order" skills/start/SKILL.md  # Must be 1
```

**Step 2: Check for orphaned code fences**

```bash
# Count opening and closing triple-backtick fences (should be equal)
grep -c "^\`\`\`" skills/start/SKILL.md
```

If the count is odd, there is an orphaned fence — find and fix it.

**Step 3: Commit final verification marker** (no code changes — marker only if needed)

If all checks pass, no additional commit needed. The implementation is complete.
