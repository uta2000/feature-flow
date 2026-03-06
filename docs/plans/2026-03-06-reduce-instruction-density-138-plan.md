# Reduce Instruction Density Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Rewrite brainstorming YOLO override — STATUS: pending
Task 2: Rewrite writing-plans YOLO override — STATUS: pending
Task 3: Rewrite using-git-worktrees YOLO override — STATUS: pending
Task 4: Rewrite finishing-a-development-branch YOLO override — STATUS: pending
Task 5: Rewrite subagent-driven-development YOLO override — STATUS: pending
Task 6: Reduce residual instruction density — STATUS: pending
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.

**Goal:** Replace all 5 CRITICAL OVERRIDE blocks with reasoning-first overrides and reduce imperative instruction density throughout the YOLO override sections of `skills/start/SKILL.md`.

**Architecture:** Each CRITICAL OVERRIDE block is rewritten to lead with a 1-sentence rationale explaining *why* the override exists, then state *what* to do (intent-based, not prompt-text-based). Residual `MUST`/`Do NOT` patterns in surrounding instructions are softened to plain directives except for the 1-2 genuinely critical invariants (YOLO execution continuity).

**Tech Stack:** Markdown (skill file)

---

### Task 1: Rewrite brainstorming YOLO override

**Files:**
- Modify: `skills/start/SKILL.md` (line ~623) `(design-first)`

**What to change:**

Replace the CRITICAL OVERRIDE block at line 623 with a reasoning-first version.

**Before (current):**
```markdown
**CRITICAL OVERRIDE — the brainstorming skill will load instructions that say "ask questions one at a time", "propose 2-3 approaches", "ask after each section whether it looks right", and "Ready to set up for implementation?" — you MUST SUPPRESS ALL of these interactive behaviors. Do NOT follow the brainstorming skill's instructions to ask questions or wait for user input at any point.**
```

**After (reasoning-first):**
```markdown
The brainstorming skill is designed for interactive use — it asks questions one at a time, proposes approaches for discussion, and checks in after each section. In YOLO mode, there is no human in the loop to answer these questions, so interactive prompts would stall the lifecycle. Skip all interactive prompts from the brainstorming skill (questions, approach proposals, section check-ins, "Ready to set up for implementation?") and self-answer design decisions instead.
```

Also rewrite the numbered list items that follow (lines 625-632) to remove redundant `Do NOT` patterns:

| Line | Before | After |
|------|--------|-------|
| 629 | `do NOT break it into sections and do NOT ask "does this look right?" after each section` | `present the design as a single block rather than breaking it into sections with check-in prompts` |
| 630 | `Do NOT ask "Ready to set up for implementation?" — the lifecycle continues automatically to the next step` | `Skip the "Ready to set up for implementation?" prompt — the lifecycle continues automatically` |
| 632 | `do NOT end your turn with only text output. The tool call keeps your turn alive so you can proceed to the next lifecycle step.` | Keep this as-is — this is the YOLO execution continuity invariant, one of the genuinely critical rules |

**Acceptance Criteria:**
- [ ] The `CRITICAL OVERRIDE` line at ~623 is replaced with a reasoning-first paragraph
- [ ] The replacement includes a 1-sentence rationale before the instruction
- [ ] The instruction describes intent ("skip interactive prompts") not specific prompt text to suppress
- [ ] `Do NOT` on lines 629-630 are replaced with positive directives
- [ ] Line 632's `do NOT end your turn` is preserved (YOLO execution continuity invariant)
- [ ] The word `CRITICAL OVERRIDE` does not appear in the brainstorming section

**Quality Constraints:**
- Pattern: follow the before/after example from issue #138
- Files modified: `skills/start/SKILL.md` (design-first — 1500+ lines)
- Design-first files: `skills/start/SKILL.md` — output change plan before editing

---

### Task 2: Rewrite writing-plans YOLO override

**Files:**
- Modify: `skills/start/SKILL.md` (line ~709) `(design-first)`

**What to change:**

Replace the CRITICAL OVERRIDE block at line 709 with a reasoning-first version.

**Before (current):**
```markdown
**CRITICAL OVERRIDE — the writing-plans skill will present an "execution choice" asking the user to choose between "Subagent-Driven" and "Parallel Session" — you MUST SUPPRESS this prompt. Do NOT follow the writing-plans skill's execution handoff instructions.**
```

**After (reasoning-first):**
```markdown
The writing-plans skill presents an execution choice after saving the plan. In YOLO mode, the lifecycle has already decided on subagent-driven execution — presenting this prompt would break unattended flow. Skip the execution choice prompt and proceed directly.
```

Also clean up the follow-up list (lines 711-714):

| Line | Before | After |
|------|--------|-------|
| 712 | `1. Do NOT present the execution choice` | Remove this line — the reasoning-first paragraph already says to skip it |

**Acceptance Criteria:**
- [ ] The `CRITICAL OVERRIDE` line at ~709 is replaced with a reasoning-first paragraph
- [ ] The replacement includes a 1-sentence rationale ("the lifecycle has already decided on subagent-driven execution")
- [ ] The instruction describes intent ("skip the execution choice prompt") not specific prompt text
- [ ] The redundant `Do NOT present the execution choice` line is removed
- [ ] The word `CRITICAL OVERRIDE` does not appear in the writing-plans section

**Quality Constraints:**
- Pattern: follow the before/after example from issue #138
- Files modified: `skills/start/SKILL.md` (design-first — 1500+ lines)
- Design-first files: `skills/start/SKILL.md` — output change plan before editing

---

### Task 3: Rewrite using-git-worktrees YOLO override

**Files:**
- Modify: `skills/start/SKILL.md` (line ~785) `(design-first)`

**What to change:**

Replace the CRITICAL OVERRIDE block at line 785 with a reasoning-first version.

**Before (current):**
```markdown
**CRITICAL OVERRIDE — the using-git-worktrees skill may ask "Where should I create worktrees?" and may ask "proceed or investigate?" if baseline tests fail — you MUST SUPPRESS both prompts. Do NOT follow the skill's instructions to ask the user.**
```

**After (reasoning-first):**
```markdown
The using-git-worktrees skill asks where to create worktrees and whether to proceed when baseline tests fail. In YOLO mode, these prompts would stall unattended execution — the lifecycle uses a standard directory (`.worktrees/`) and defers test failures to later verification steps. Auto-select the worktree directory and proceed past baseline test failures.
```

Also clean up the follow-up items (lines 793, 795):

| Line | Before | After |
|------|--------|-------|
| 793 | `Do NOT use \`ls -d\` for existence checks — it returns non-zero when the directory doesn't exist, causing false tool errors.` | `Use \`test -d\` instead of \`ls -d\` for existence checks — \`ls -d\` returns non-zero for missing directories, causing false tool errors.` |
| 795 | `Do NOT ask the user whether to proceed or investigate — the lifecycle will catch test issues during implementation and verification steps.` | Remove — the reasoning-first paragraph already explains this |

**Acceptance Criteria:**
- [ ] The `CRITICAL OVERRIDE` line at ~785 is replaced with a reasoning-first paragraph
- [ ] The replacement includes a rationale ("these prompts would stall unattended execution")
- [ ] The instruction describes intent ("auto-select the worktree directory and proceed past baseline test failures")
- [ ] The `Do NOT use ls -d` is rewritten as a positive directive (`Use test -d instead`)
- [ ] The redundant `Do NOT ask the user` on line 795 is removed
- [ ] The word `CRITICAL OVERRIDE` does not appear in the worktrees section

**Quality Constraints:**
- Pattern: follow the before/after example from issue #138
- Files modified: `skills/start/SKILL.md` (design-first — 1500+ lines)
- Design-first files: `skills/start/SKILL.md` — output change plan before editing

---

### Task 4: Rewrite finishing-a-development-branch YOLO override

**Files:**
- Modify: `skills/start/SKILL.md` (line ~801) `(design-first)`

**What to change:**

Replace the CRITICAL OVERRIDE block at line 801 with a reasoning-first version.

**Before (current):**
```markdown
**CRITICAL OVERRIDE — the finishing-a-development-branch skill will present 4 options (merge locally, create PR, keep as-is, discard) and may ask "This branch split from [branch] — is that correct?" — you MUST SUPPRESS both prompts. Do NOT follow the skill's instructions to present options or ask for confirmation.**
```

**After (reasoning-first):**
```markdown
The finishing-a-development-branch skill presents a 4-option completion menu and a base branch confirmation prompt. In YOLO mode, the lifecycle always creates a PR targeting the detected base branch — presenting options or confirmations would stall unattended flow. Auto-confirm the base branch and auto-select "Push and create a Pull Request."
```

Also clean up follow-up items (lines 804, 807):

| Line | Before | After |
|------|--------|-------|
| 804 | `Do NOT ask the user.` | Remove — the reasoning-first paragraph already says to auto-confirm |
| 807 | `Do NOT use \`Closes #N\`` | `Use \`Related: #N\` instead of \`Closes #N\`` |
| 809 | `Do NOT block on test failures — the code review pipeline already ran verification.` | Keep the reasoning but soften: `Proceed past test failures — the code review pipeline already ran verification.` |

**Acceptance Criteria:**
- [ ] The `CRITICAL OVERRIDE` line at ~801 is replaced with a reasoning-first paragraph
- [ ] The replacement includes a rationale ("the lifecycle always creates a PR targeting the detected base branch")
- [ ] The instruction describes intent ("auto-confirm the base branch and auto-select PR creation")
- [ ] `Do NOT ask the user` on line 804 is removed (covered by reasoning-first paragraph)
- [ ] `Do NOT use Closes #N` is rewritten as a positive directive
- [ ] `Do NOT block on test failures` is softened to `Proceed past test failures`
- [ ] The word `CRITICAL OVERRIDE` does not appear in the finishing section

**Quality Constraints:**
- Pattern: follow the before/after example from issue #138
- Files modified: `skills/start/SKILL.md` (design-first — 1500+ lines)
- Design-first files: `skills/start/SKILL.md` — output change plan before editing

---

### Task 5: Rewrite subagent-driven-development YOLO override

**Files:**
- Modify: `skills/start/SKILL.md` (line ~815) `(design-first)`

**What to change:**

Replace the CRITICAL OVERRIDE block at line 815 with a reasoning-first version.

**Before (current):**
```markdown
**CRITICAL OVERRIDE — the subagent-driven-development skill invokes `superpowers:finishing-a-development-branch` after all tasks complete — the "Finishing a Development Branch YOLO Override" above applies to that invocation.**
```

**After (reasoning-first):**
```markdown
The subagent-driven-development skill invokes `finishing-a-development-branch` after all tasks complete. The same YOLO rationale applies: auto-confirm the base branch and auto-select PR creation per the "Finishing a Development Branch YOLO Override" above.
```

Also clean up follow-up item (line 820):

| Line | Before | After |
|------|--------|-------|
| 820 | `Do NOT ask the user to answer subagent questions — use available context to provide answers directly` | `Auto-answer subagent questions from the implementation plan, design document, and codebase context` |

**Acceptance Criteria:**
- [ ] The `CRITICAL OVERRIDE` line at ~815 is replaced with a reasoning-first paragraph
- [ ] The replacement includes a rationale (same YOLO rationale applies)
- [ ] `Do NOT ask the user` on line 820 is rewritten as a positive directive
- [ ] The word `CRITICAL OVERRIDE` does not appear in the subagent section

**Quality Constraints:**
- Pattern: follow the before/after example from issue #138
- Files modified: `skills/start/SKILL.md` (design-first — 1500+ lines)
- Design-first files: `skills/start/SKILL.md` — output change plan before editing

---

### Task 6: Reduce residual instruction density

**Files:**
- Modify: `skills/start/SKILL.md` (multiple locations) `(design-first)`

**What to change:**

Scan the remaining `Do NOT` and `MUST` patterns outside the 5 override blocks. For each, determine if it's:
1. **Genuinely critical** (YOLO execution continuity, turn-alive bridge) → Keep, possibly with `IMPORTANT:` prefix instead of ALL CAPS
2. **A positive directive in disguise** → Rewrite as what to do, not what to avoid
3. **Redundant** (already covered by surrounding context) → Remove

**Specific changes:**

| Location | Before | After | Rationale |
|----------|--------|-------|-----------|
| Line 489 (TaskCreate parallelism) | `Do NOT call them one at a time` | `Call all TaskCreate tools in a single parallel message — sequential calls waste N-1 API turns` | Positive directive already present; remove redundant negative |
| Line 1020 (Study patterns parallelism) | `Do NOT dispatch agents one at a time` | `Launch all agents in a single message to run them concurrently — sequential dispatch wastes N-1 API turns` | Same pattern as above |
| Line 1364 (Code review iterations) | `Do NOT loop beyond 2 iterations` | `Stop after 2 fix-verify iterations — report remaining issues for manual resolution` | Positive directive |

**Leave these unchanged** (genuinely critical invariants):
- YOLO Execution Continuity warnings (line 632, Step 3 sub-step 4/5) — these prevent the most common YOLO failure mode
- The `CRITICAL OVERRIDE` count check: after all tasks, verify no more than 2 remain (acceptance criteria from issue)

**Acceptance Criteria:**
- [ ] No more than 2 `CRITICAL OVERRIDE` blocks remain in the entire file (should be 0 after tasks 1-5)
- [ ] `Do NOT call them one at a time` on line ~489 is removed or rewritten as positive directive
- [ ] `Do NOT dispatch agents one at a time` on line ~1020 is removed or rewritten as positive directive
- [ ] `Do NOT loop beyond 2 iterations` on line ~1364 is rewritten as positive directive
- [ ] YOLO Execution Continuity warnings (lines ~632, Step 3 sub-steps 4-5) are preserved
- [ ] Total `CRITICAL OVERRIDE` count in the file is 0
- [ ] Grep for `CRITICAL OVERRIDE` returns 0 matches

**Quality Constraints:**
- Files modified: `skills/start/SKILL.md` (design-first — 1500+ lines)
- Design-first files: `skills/start/SKILL.md` — output change plan before editing
