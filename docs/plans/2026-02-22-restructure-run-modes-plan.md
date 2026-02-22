# Restructure Run Modes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the three confusing mode options (YOLO, YOLO-compact, Interactive) with three clearly differentiated modes (YOLO, Express, Interactive) where YOLO is truly unattended.

**Architecture:** This is a markdown skill file refactoring. All changes are in `skills/start/SKILL.md` (primary) and `skills/design-document/SKILL.md` (secondary). No code, no tests — verification is grep-based.

**Tech Stack:** Markdown (Claude Code plugin skill files)

---

### Task 1: Update Trigger Phrase Detection (Step 0)

**Files:**
- Modify: `skills/start/SKILL.md:83-97`

Replace the trigger phrase detection block. Change `--yolo-compact` / `yolo compact mode` to `--express` / `express mode`. Replace the `compact_prompts` flag with Express mode. Update announcement messages.

**What to change:**

In the trigger phrases list (line 83-88), replace:
```
   - `--yolo-compact` (flag style — match as a standalone token)
   - `yolo compact mode` (natural language phrase)
```
With:
```
   - `--express` (flag style — match as a standalone token)
   - `express mode` (natural language phrase)
```

In the conditional block (lines 89-97), replace the `--yolo-compact` branch:
```
   - If the trigger is `--yolo-compact` or `yolo compact mode`:
     - Set YOLO mode active AND set `compact_prompts` flag for the remainder of the lifecycle
     - Announce: "YOLO mode active (with compaction prompts). Auto-selecting recommended options but pausing at phase transitions. Decision log will be printed at completion."
```
With:
```
   - If the trigger is `--express` or `express mode`:
     - Set Express mode active for the remainder of the lifecycle
     - Announce: "Express mode active. Auto-selecting decisions but pausing for design approval and at phase transitions for optional `/compact`. Decision log will be printed at completion."
```

Update the standard YOLO announcement (line 96):
```
     - Announce: "YOLO mode active. Auto-selecting recommended options. Decision log will be printed at completion."
```
To:
```
     - Announce: "YOLO mode active. Auto-selecting all decisions, no pauses. Decision log will be printed at completion."
```

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains `--express` as a trigger phrase
- [ ] `skills/start/SKILL.md` contains `express mode` as a trigger phrase
- [ ] `skills/start/SKILL.md` does NOT contain `--yolo-compact`
- [ ] `skills/start/SKILL.md` does NOT contain `yolo compact mode`
- [ ] `skills/start/SKILL.md` does NOT contain `compact_prompts`
- [ ] `skills/start/SKILL.md` contains "Express mode active"
- [ ] `skills/start/SKILL.md` contains "Auto-selecting all decisions, no pauses"

---

### Task 2: Update Mode Selection Prompt (Step 1)

**Files:**
- Modify: `skills/start/SKILL.md:213-236`

Replace the three option ordering variants and the YOLO-with-compaction behavior paragraph with new plain English descriptions and a footnote.

**What to change:**

Replace the three ordering blocks (lines 215-228) with:

```
*YOLO recommended* (quick fix, small enhancement, or feature with detailed context):
- Option 1: "YOLO — fully unattended, no pauses" with description: "*Recommended — [reasoning]*"
- Option 2: "Express — I'll auto-select decisions but pause for design approval and at phase transitions to optionally compact the conversation"
- Option 3: "Interactive — I'll interview you to address outstanding design questions, with pauses at phase transitions to optionally compact the conversation"

*Interactive recommended* (feature/major without detailed context):
- Option 1: "Interactive — I'll interview you to address outstanding design questions, with pauses at phase transitions to optionally compact the conversation" with description: "*Recommended — [reasoning]*"
- Option 2: "Express — I'll auto-select decisions but pause for design approval and at phase transitions to optionally compact the conversation"
- Option 3: "YOLO — fully unattended, no pauses"

*Neutral* (major feature with detailed issue or detailed inline context):
- Option 1: "Interactive — I'll interview you to address outstanding design questions, with pauses at phase transitions to optionally compact the conversation" (no recommendation marker)
- Option 2: "Express — I'll auto-select decisions but pause for design approval and at phase transitions to optionally compact the conversation" (no recommendation marker)
- Option 3: "YOLO — fully unattended, no pauses" (no recommendation marker)

*Footnote (always shown after the options):* "For Express and Interactive: at each pause you can run `/compact` then type 'continue' to resume, or just type 'continue' to skip compaction."
```

Replace the "YOLO with compaction behavior" paragraph (line 236) with:

```
**Express behavior:** If the user selects "Express", set Express mode active. All YOLO auto-selection overrides apply for skill invocations, but context window checkpoints and design approval checkpoints are shown instead of suppressed.
```

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains "YOLO — fully unattended, no pauses"
- [ ] `skills/start/SKILL.md` contains "Express — I'll auto-select decisions but pause for design approval"
- [ ] `skills/start/SKILL.md` contains "Interactive — I'll interview you to address outstanding design questions"
- [ ] `skills/start/SKILL.md` contains the `/compact` footnote text "For Express and Interactive: at each pause"
- [ ] `skills/start/SKILL.md` does NOT contain "YOLO with compaction prompts" in the option text
- [ ] `skills/start/SKILL.md` does NOT contain "all questions asked normally"

---

### Task 3: Delete Graduated YOLO Sections

**Files:**
- Modify: `skills/start/SKILL.md:420-464`

Delete the "Graduated YOLO checkpoint (Major Feature only)" block (lines 420-439) and the entire "Graduated YOLO Behavior" section (lines 441-464).

**What to delete:**

1. Lines 420-439: The "Graduated YOLO checkpoint (Major Feature only)" block starting with `**Graduated YOLO checkpoint (Major Feature only):**` through `For Quick fix, Small enhancement, and Feature scopes, skip this checkpoint — proceed directly from brainstorming to the next step.`

2. Lines 441-464: The entire `### Graduated YOLO Behavior` section through `**What checkpoints do NOT affect:** All other YOLO decisions...`

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` does NOT contain "Graduated YOLO"
- [ ] `skills/start/SKILL.md` does NOT contain "Graduated YOLO checkpoint"
- [ ] `skills/start/SKILL.md` does NOT contain "YOLO checkpoint: Brainstorming complete"
- [ ] `skills/start/SKILL.md` does NOT contain "YOLO checkpoint: [artifact summary]"

---

### Task 4: Restructure Context Window Checkpoints

**Files:**
- Modify: `skills/start/SKILL.md:466-506` (line numbers will shift after Task 3 deletions)

Update the suppression rules and the step 6 checkpoint check to use the new mode names.

**What to change:**

1. Replace the suppression rules block (lines 496-500):
```
**Suppression rules** (determined by whether `compact_prompts` flag is set):
- **YOLO mode (no compaction):** Checkpoints are suppressed — do not output the checkpoint block
- **YOLO with compaction prompts:** Checkpoints are shown — output the checkpoint block and wait
- **Interactive mode:** Checkpoints are shown — output the checkpoint block and wait
- **Quick fix scope:** No checkpoints regardless of mode
```
With:
```
**Suppression rules:**
- **YOLO mode:** All checkpoints suppressed — do not output the checkpoint block
- **Express mode:** Checkpoints are shown — output the checkpoint block and wait
- **Interactive mode:** Checkpoints are shown — output the checkpoint block and wait
- **Quick fix scope:** No checkpoints regardless of mode
```

2. Update step 6 in "Execute Steps in Order" (line 342):
```
6. **Check for context checkpoint:** If the just-completed step is a checkpoint trigger (see Context Window Checkpoints section), and the current mode is not YOLO-without-compaction, and the current scope includes this checkpoint — output the checkpoint block and wait for the user to respond before announcing the next step.
```
To:
```
6. **Check for context checkpoint:** If the just-completed step is a checkpoint trigger (see Context Window Checkpoints section), and the current mode is not YOLO, and the current scope includes this checkpoint — output the checkpoint block and wait for the user to respond before announcing the next step.
```

3. Add a new "Express Design Approval Checkpoint" subsection after the Context Window Checkpoints section:
```
### Express Design Approval Checkpoint

When Express mode is active and the scope is **Feature** or **Major Feature**, present a design approval checkpoint after the design document step (or design verification step if present). This checkpoint pauses Express mode for the user to review the design before implementation begins.

**Checkpoint format:**

```
Express checkpoint: Design document complete. Review the design before implementation begins.
Continue or adjust?
```

Use `AskUserQuestion` with options:
- "Continue" — approve the design and resume Express mode
- "Let me adjust" — user provides corrections, document is updated, then Express resumes

**Scope filtering:**
- Quick fix / Small enhancement: No design approval checkpoint (too small)
- Feature / Major feature: Design approval checkpoint shown

This checkpoint is separate from context window checkpoints and fires at a different lifecycle moment (after design, not at phase transitions).
```

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` does NOT contain "YOLO-without-compaction"
- [ ] `skills/start/SKILL.md` does NOT contain "YOLO mode (no compaction)"
- [ ] `skills/start/SKILL.md` does NOT contain "YOLO with compaction prompts" in the suppression rules
- [ ] `skills/start/SKILL.md` contains "Express mode:" in the suppression rules
- [ ] `skills/start/SKILL.md` contains "Express Design Approval Checkpoint" as a section heading
- [ ] `skills/start/SKILL.md` contains "Express checkpoint: Design document complete"
- [ ] `skills/start/SKILL.md` contains "and the current mode is not YOLO, and the current scope"

---

### Task 5: Update Propagation

**Files:**
- Modify: `skills/start/SKILL.md:345-354` (line numbers will shift after prior edits)

Replace the propagation section to cover YOLO and Express modes.

**What to change:**

Replace lines 345-354 with:

```
**YOLO Propagation:** When YOLO mode is active, prepend `yolo: true. scope: [scope].` to the `args` parameter of every `Skill` invocation. For example:

```
Skill(skill: "superpowers:brainstorming", args: "yolo: true. scope: [scope]. [original args]")
Skill(skill: "feature-flow:design-document", args: "yolo: true. scope: [scope]. [original args]")
```

**Express Propagation:** When Express mode is active, prepend `express: true. scope: [scope].` to the `args` parameter of every `Skill` invocation. Express inherits all YOLO auto-selection overrides — skills that check for `yolo: true` should also check for `express: true` and behave the same way (auto-select decisions). The only difference is at the orchestrator level where checkpoints are shown instead of suppressed. For example:

```
Skill(skill: "superpowers:brainstorming", args: "express: true. scope: [scope]. [original args]")
Skill(skill: "feature-flow:design-document", args: "express: true. scope: [scope]. [original args]")
```

For inline steps (CHANGELOG generation, self-review, code review, study existing patterns), the mode flag is already in the conversation context — no explicit propagation is needed.
```

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains "Express Propagation"
- [ ] `skills/start/SKILL.md` contains `express: true. scope: [scope].`
- [ ] `skills/start/SKILL.md` does NOT contain "YOLO with compaction propagation"
- [ ] `skills/start/SKILL.md` does NOT contain `compact_prompts: true`
- [ ] `skills/start/SKILL.md` contains "Express inherits all YOLO auto-selection overrides"

---

### Task 6: Update Decision Log Formats

**Files:**
- Modify: `skills/start/SKILL.md:1120-1192` (line numbers will shift after prior edits)

Replace the three decision log formats with two (YOLO and Express). Remove the "Graduated YOLO" and "YOLO with compaction prompts" formats.

**What to change:**

Replace the entire decision log section (from "If the lifecycle ran in YOLO mode" through the end of the "YOLO with compaction prompts" format) with:

```
If the lifecycle ran in YOLO or Express mode, append the decision log after the standard completion summary:

**YOLO (all scopes):**

```
## YOLO Decision Log

**Mode:** YOLO ([scope] scope)

| # | Skill | Decision | Auto-Selected |
|---|-------|----------|---------------|
| 1 | start | Scope + mode | [scope], YOLO |
| ... | ... | ... | ... |
| N | brainstorming | Design questions (self-answered) | [count decisions auto-answered] |
| N | writing-plans | Execution choice | Subagent-Driven (auto-selected) |
| N | using-git-worktrees | Worktree directory | .worktrees/ (auto-selected) |
| N | finishing-a-dev-branch | Completion strategy | Push and create PR (auto-selected) |

**Total decisions auto-selected:** N (includes feature-flow decisions + superpowers overrides)
**Quality gates preserved:** hooks, tests, verification, code review
```

**Express (all scopes):**

```
## Express Decision Log

**Mode:** Express ([scope] scope)
**Checkpoints:** N presented (M design approval, K compaction)

| # | Skill | Decision | Auto-Selected |
|---|-------|----------|---------------|
| 1 | start | Scope + mode | [scope], Express |
| ... | ... | ... | ... |
| N | start | Compact checkpoint 1 | /compact (or skipped) |
| N | start | Compact checkpoint 2 | /compact (or skipped) |
| N | start | Compact checkpoint 3 | /compact (or skipped) |
| N | design-document | Design approval | ✋ User reviewed (approved / adjusted) |
| N | brainstorming | Design questions (self-answered) | [count decisions auto-answered] |
| N | writing-plans | Execution choice | Subagent-Driven (auto-selected) |
| N | using-git-worktrees | Worktree directory | .worktrees/ (auto-selected) |
| N | finishing-a-dev-branch | Completion strategy | Push and create PR (auto-selected) |

**Total decisions auto-selected:** N (includes feature-flow decisions + superpowers overrides)
**Checkpoints presented:** M (K compaction, J design approval)
**Quality gates preserved:** hooks, tests, verification, code review
```

Interactive mode does not produce a decision log — all decisions were made interactively.
```

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` does NOT contain "Graduated YOLO (feature / major feature"
- [ ] `skills/start/SKILL.md` does NOT contain "YOLO with compaction prompts (any scope)"
- [ ] `skills/start/SKILL.md` does NOT contain "YOLO with checkpoints (system recommended"
- [ ] `skills/start/SKILL.md` contains "Express Decision Log"
- [ ] `skills/start/SKILL.md` contains "**Mode:** Express ([scope] scope)"
- [ ] `skills/start/SKILL.md` contains "Interactive mode does not produce a decision log"

---

### Task 7: Update design-document Skill

**Files:**
- Modify: `skills/design-document/SKILL.md:158-174`

Update the YOLO behavior section to handle three modes: `yolo: true` (skip approval for all scopes), `express: true` (show approval for Feature/Major), neither (Interactive — section-by-section).

**What to change:**

Replace lines 158-174 with:

```
**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`:

- Skip section-by-section confirmation entirely for all scopes. Present the full document at once without asking. Announce: `YOLO: design-document — Section approval → Accepted (all sections)`

**Express behavior:** If `express: true` is in the skill's `ARGUMENTS`:

- **Quick fix or Small enhancement scope** (or scope not specified): Skip section-by-section confirmation entirely. Present the full document at once without asking. Announce: `Express: design-document — Section approval → Accepted (all sections)`

- **Feature or Major Feature scope:** Present the full document as a design approval checkpoint. Use `AskUserQuestion`:

  ```
  Express checkpoint: Here's the design document. Continue or adjust?
  ```

  Options:
  - "Continue" — approve the document and resume Express mode
  - "Let me adjust" — user provides corrections, document is updated, then Express resumes

  Announce: `Express: design-document — Document approval → ✋ Checkpoint presented`

  The scope is determined from the `scope:` field in the skill's `ARGUMENTS` (e.g., `args: "express: true. scope: feature. ..."`). If no scope is specified, default to the skip behavior.
```

**Acceptance Criteria:**
- [ ] `skills/design-document/SKILL.md` contains "Express behavior:" as a labeled section
- [ ] `skills/design-document/SKILL.md` contains "Express checkpoint: Here's the design document"
- [ ] `skills/design-document/SKILL.md` contains "YOLO: design-document — Section approval → Accepted (all sections)" without scope-based branching under YOLO
- [ ] `skills/design-document/SKILL.md` does NOT contain "mandatory YOLO checkpoint"
- [ ] `skills/design-document/SKILL.md` does NOT contain "YOLO checkpoint: Here's the design document"
- [ ] `skills/design-document/SKILL.md` does NOT contain "graduated-YOLO"

---

### Task 8: Update Remaining References in SKILL.md

**Files:**
- Modify: `skills/start/SKILL.md` (multiple locations)

Search for and update any remaining references to old terminology.

**What to find and replace:**

1. In the "Writing Plans YOLO Override" section: No changes needed (it only references YOLO mode)
2. In the "Using Git Worktrees YOLO Override" section: No changes needed (it only references YOLO mode)
3. In the "Finishing a Development Branch YOLO Override" section: No changes needed
4. In the "Subagent-Driven Development YOLO Override" section: No changes needed
5. In the YOLO Propagation explanation (line 345): Update "Scope context is required for graduated YOLO behavior — design-document uses it to determine whether a mandatory checkpoint is needed" since graduated YOLO no longer exists. Replace with: "Scope context is required because design-document uses it to determine checkpoint behavior."

**Grep check:** Search for any remaining occurrences of:
- `compact_prompts` → should be zero
- `yolo-compact` → should be zero
- `YOLO with compaction` → should be zero
- `Graduated YOLO` → should be zero
- `graduated` (case-insensitive) → should only appear in historical references, not instructions

**Acceptance Criteria:**
- [ ] `grep -c "compact_prompts" skills/start/SKILL.md` returns 0
- [ ] `grep -c "yolo-compact" skills/start/SKILL.md` returns 0
- [ ] `grep -c "YOLO with compaction" skills/start/SKILL.md` returns 0
- [ ] `grep -c "Graduated YOLO" skills/start/SKILL.md` returns 0
- [ ] `grep -c "graduated YOLO" skills/start/SKILL.md` returns 0 (case-insensitive check)
- [ ] `skills/start/SKILL.md` contains "Scope context is required because design-document uses it to determine checkpoint behavior"
