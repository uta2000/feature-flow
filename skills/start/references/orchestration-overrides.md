# Orchestration Overrides

**Usage:** Read the relevant section when reaching the corresponding lifecycle step. These override default skill behaviors when invoked from the lifecycle orchestrator.

---

## Phase-Boundary Model Hints

At phase transitions between reasoning-heavy and mechanical work, output a model switch suggestion. These are suggestions only — the lifecycle functions on any model.

**Escalation hint (before reasoning-heavy phases):**

Before invoking `superpowers:brainstorming` or `feature-flow:design-document`, output:
```
Entering [phase name] — this phase benefits from Opus-level reasoning.
Consider: /model opus
```

**De-escalation hint (after reasoning-heavy phases):**

After the design document step completes (or after design verification if present), output:
```
Design phase complete — switching to implementation phases.
Consider: /model sonnet
```

**Suppression rules:**
- **YOLO mode:** Hints suppressed — do not output. Announce inline: `YOLO: start — Phase-boundary model hint → suppressed ([phase])`
- **Express mode:** Hints shown — output the suggestion block
- **Interactive mode:** Hints shown — output the suggestion block
- **Quick fix scope:** No hints — too few phases to warrant switching

## Brainstorming Interview Format Override

When invoking `superpowers:brainstorming` from this lifecycle, pass these formatting instructions as context. Every interview question presented to the user must follow this format:

**Required format for each question:**

```
**[Question in plain English]**
*Why this matters:* [1 sentence explaining impact on the design]
- **Option A** — e.g., [concrete example]. *Recommended: [1 sentence reasoning]*
- **Option B** — e.g., [concrete example]
- **Option C** — e.g., [concrete example] (if applicable)
```

**Rules:**
- Always lead with the recommended option and mark it with `*Recommended*`
- Each option must include a concrete example showing what it means in practice (e.g., "like ESLint running on every save" not just "run on save")
- The "Why this matters" line should explain what downstream impact the choice has (e.g., "this determines whether validation errors surface during editing or only at commit time")
- Keep it concise — one line for the explanation, one line per option
- If there is no clear recommendation, say "*No strong preference — depends on [factor]*" instead of forcing a pick

**YOLO behavior:** When YOLO **or Express** mode is active (i.e., `yolo: true` or `express: true` is in the brainstorming args — for Express mode, substitute `Express:` for `YOLO:` in all inline announcements):

The brainstorming skill is designed for interactive use — it asks questions one at a time, proposes approaches for discussion, and checks in after each section. In YOLO mode, there is no human in the loop to answer these questions, so interactive prompts would stall the lifecycle. Skip all interactive prompts from the brainstorming skill (questions, approach proposals, section check-ins, "Ready to set up for implementation?") and self-answer design decisions instead.

How to proceed:
1. Analyze the feature description, issue context (if linked), and codebase to identify the key design questions
2. Self-answer each question using available context — issue body, issue comments, codebase patterns, and existing conventions
3. For each self-answered question, announce: `YOLO: brainstorming — [question summary] → [selected option with reasoning]`
4. After self-answering all questions, present the design as a single block rather than breaking it into sections with check-in prompts
5. Skip the "Ready to set up for implementation?" prompt — the lifecycle continues automatically to the next step
6. Ensure all self-answered decisions are captured when passing context to the design document step
7. **After outputting the brainstorming results, immediately call `TaskUpdate` to mark brainstorming complete.** *(Turn Bridge Rule applies.)*

This is the most complex YOLO interaction — the LLM makes design-level decisions. The user reviews these via the design document output rather than each micro-decision.

## Context Window Checkpoints

At specific phase transitions, output a checkpoint prompt suggesting the user run `/compact` to free context window space. The lifecycle pauses — the user must respond before the next step begins. `/compact` is a client-side Claude Code command that cannot be invoked programmatically — the skill can only suggest it.

**Checkpoint format and recovery procedure:** See `../../references/context-checkpoints.md`.

**Checkpoint locations:**

| # | After Step | Before Step | Focus Hint |
|---|-----------|-------------|------------|
| 1 | Documentation lookup | Design Document | `focus on brainstorming decisions and documentation patterns` |
| 2 | Design Verification (or Design Document for small enhancements, or Documentation Lookup for fast-track small enhancements) | Create Issue + Implementation Plan | `focus on the approved design and implementation plan` |
| 3 | Worktree Setup + Copy Env Files | Implement | `focus on the implementation plan, acceptance criteria, and worktree path` |
| 4 | Implementation complete (last task done) | Self-review + Code Review | `focus on the implementation commit SHAs, acceptance criteria, and any known issues from implementation` |

**Scope-based filtering:**

| Scope | Checkpoints shown |
|-------|------------------|
| Quick fix | None (too few steps) |
| Small enhancement | 2 and 3 only (checkpoint 2 triggers after Design Document, or after Documentation Lookup if fast-track) |
| Feature | All 4 |
| Major feature | All 4 |

**Suppression rules:**
- **YOLO mode:** All checkpoints suppressed — do not output the checkpoint block, do not end your turn. Proceed immediately to the next step (see **YOLO Execution Continuity** in Step 3).
- **Express mode:** Checkpoints are shown — output the checkpoint block and wait
- **Interactive mode:** Checkpoints are shown — output the checkpoint block and wait
- **Quick fix scope:** No checkpoints regardless of mode

## Express Design Approval Checkpoint

When Express mode is active and the scope is **Feature** or **Major Feature**, present a design approval checkpoint after the design document step (or design verification step if present). This checkpoint pauses Express mode for the user to review the design before implementation begins.

**Checkpoint format:**

```
Express checkpoint: Design document complete. Review the design before implementation begins.
Continue or adjust?
```

Use `AskUserQuestion` with options:
- "Continue" with description: "Approve the design and resume Express mode — implementation will begin immediately"
- "Let me adjust" with description: "Provide corrections in freeform text — the document will be updated, then Express resumes"

**Scope filtering:**
- Quick fix / Small enhancement: No design approval checkpoint (too small)
- Feature / Major feature: Design approval checkpoint shown

This checkpoint is owned by the `design-document` skill when invoked with `express: true`. The orchestrator does not present a separate checkpoint — it is handled inside the skill invocation. This is separate from context window checkpoints and fires at a different lifecycle moment (after design, not at phase transitions).
