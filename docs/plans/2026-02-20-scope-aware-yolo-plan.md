# Scope-Aware YOLO Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move YOLO prompt after scope classification, add smart recommendations, graduated checkpoints, and enhanced decision log.

**Architecture:** Two Markdown skill files are edited: `skills/start-feature/SKILL.md` (6 sections changed) and `skills/design-document/SKILL.md` (1 section changed). All changes are additive prose edits — no code, no tests, no migrations.

**Tech Stack:** Markdown (Claude Code plugin skill definitions)

---

### Task 1: Rewrite Step 0 YOLO detection to trigger-only

**Files:**
- Modify: `skills/start-feature/SKILL.md:79-95` (Step 0 YOLO Mode Detection block)

**What to do:**

Replace the YOLO Mode Detection block (lines 79-95) so that it ONLY does trigger phrase detection. Remove the `AskUserQuestion` fallback (item 3, lines 91-95). Keep items 1 and 2 (trigger phrase parsing + activation announcement + stripping).

The new block should:
1. Parse `ARGUMENTS` for `--yolo`, `yolo mode`, `run unattended` (unchanged)
2. If found: activate YOLO, announce, strip phrase (unchanged)
3. If NOT found: do nothing — the YOLO prompt now happens in Step 1

**Acceptance criteria:**
- [ ] Lines 79-95 of `skills/start-feature/SKILL.md` no longer contain `AskUserQuestion` for YOLO mode selection
- [ ] The text `"Run in **interactive** or **YOLO** mode?"` does not appear in Step 0
- [ ] The trigger phrases `--yolo`, `yolo mode`, `run unattended` still appear in Step 0
- [ ] The announcement text `"YOLO mode active. Auto-selecting recommended options."` still appears in Step 0
- [ ] The strip instruction (removing trigger from args before further processing) still appears in Step 0

**Commit:** `feat(start-feature): reduce Step 0 YOLO detection to trigger-only`

---

### Task 2: Add recommendation engine and combined prompt to Step 1

**Files:**
- Modify: `skills/start-feature/SKILL.md:134-168` (Step 1: Determine Scope)

**What to do:**

Rewrite Step 1 to: (a) keep issue reference detection as-is, (b) keep scope classification table as-is, (c) add issue richness scoring after issue detection, (d) add inline context richness assessment, (e) replace the separate scope confirmation `AskUserQuestion` and YOLO behavior with a combined scope + mode prompt.

**After the existing issue detection block (lines 140-147), add:**

```markdown
**Issue richness scoring (when an issue is linked):**

Assess the linked issue for context richness. Count the following signals:
1. Has acceptance criteria or clear requirements sections
2. Has resolved discussion in comments (answered questions)
3. Has concrete examples, mockups, or specifications
4. Body is >200 words with structured content (headings, lists, tables)

A score of 3+ means the issue is "detailed."

**Inline context richness:**

If the user's initial message (not the issue) contains detailed design decisions — specific approach descriptions, UX flows, data model specifics, or concrete behavior specifications — treat this as equivalent to a detailed issue for recommendation purposes.

**Smart recommendation logic:**

Determine the recommended mode using three signals:

| Scope | Default | With detailed issue | With detailed inline context |
|-------|---------|--------------------|-----------------------------|
| Quick fix | YOLO | YOLO | YOLO |
| Small enhancement | YOLO | YOLO | YOLO |
| Feature | Interactive | YOLO (override) | YOLO (override) |
| Major feature | Interactive | Neutral | Neutral |
```

**Replace the scope confirmation prompt (lines 156-168) with the combined prompt:**

```markdown
Present the classification AND mode recommendation to the user in a **single** `AskUserQuestion`. The question text includes the scope, step count, and (if applicable) issue context summary.

**Question format:**
```
This looks like a **[scope]** ([N] steps).
[If issue linked: "Found issue #N: [title] — [richness summary]."]

Run mode?
```

**Option ordering depends on recommendation:**

*YOLO recommended* (quick fix, small enhancement, or feature/major with detailed context):
- Option 1: "YOLO — auto-select recommended options" with description: "*Recommended — [reasoning]*"
- Option 2: "Interactive — all questions asked normally"

*Interactive recommended* (feature/major without detailed context):
- Option 1: "Interactive — all questions asked normally" with description: "*Recommended — [reasoning]*"
- Option 2: "YOLO — auto-select recommended options"

*Neutral* (major feature with detailed issue):
- Option 1: "Interactive — all questions asked normally" (no recommendation marker)
- Option 2: "YOLO — auto-select recommended options" (no recommendation marker)

**YOLO behavior (trigger phrase activated):** If YOLO was already activated by a trigger phrase in Step 0, skip this question entirely. Auto-classify scope and announce: `YOLO: start-feature — Scope + mode → [scope], YOLO (trigger phrase)`
```

**Acceptance criteria:**
- [ ] The phrase `issue richness scoring` appears in Step 1 of `skills/start-feature/SKILL.md`
- [ ] The phrase `Inline context richness` appears in Step 1
- [ ] The phrase `Smart recommendation logic` appears in Step 1
- [ ] A recommendation table mapping scope × context to YOLO/Interactive/Neutral exists in Step 1
- [ ] The old separate scope confirmation `AskUserQuestion` (with 4 scope options) is removed
- [ ] A combined prompt showing scope + step count + mode recommendation exists in Step 1
- [ ] Three prompt variants are documented: YOLO recommended, Interactive recommended, Neutral
- [ ] The YOLO behavior block for trigger-phrase users still auto-classifies scope (no regression)

**Commit:** `feat(start-feature): add recommendation engine and combined scope+mode prompt`

---

### Task 3: Add graduated YOLO behavior section

**Files:**
- Modify: `skills/start-feature/SKILL.md` — insert new section after the Brainstorming Interview Format Override section (after line 332)

**What to do:**

Add a new `### Graduated YOLO Behavior` section that defines per-scope checkpoint rules. Insert it between the Brainstorming Interview Format Override and the Commit Planning Artifacts Step.

```markdown
### Graduated YOLO Behavior

When YOLO mode is active (whether from trigger phrase or user selection), the number of mandatory checkpoints scales with scope complexity:

| Scope | Checkpoints | Where |
|-------|------------|-------|
| Quick fix | 0 | Full autonomy — zero interactive prompts |
| Small enhancement | 0 | Full autonomy — zero interactive prompts |
| Feature | 1 | Design document approval (before implementation) |
| Major feature | 2 | Brainstorming output summary + Design document approval |

**Checkpoint UX:** Mandatory checkpoints are presented via `AskUserQuestion`:

```
YOLO checkpoint: [artifact summary]. Continue or adjust?
```

Options:
- "Continue" — resume YOLO mode for remaining steps
- "Let me adjust" — user provides corrections, then YOLO resumes (does NOT switch to interactive for remaining steps)

**Scope upgrade rule:** If scope is upgraded during the lifecycle (e.g., Small Enhancement → Feature via Scope Adjustment Rules), adopt the checkpoint rules of the new scope for all remaining steps.

**What checkpoints do NOT affect:** All other YOLO decisions (platform detection, CHANGELOG heading, gotcha additions, issue creation, plan criteria approval) remain fully auto-selected regardless of scope.
```

**Acceptance criteria:**
- [ ] A section titled `### Graduated YOLO Behavior` exists in `skills/start-feature/SKILL.md`
- [ ] The checkpoint table lists all 4 scopes with correct checkpoint counts (0, 0, 1, 2)
- [ ] The checkpoint UX describes `AskUserQuestion` with "Continue" and "Let me adjust" options
- [ ] The phrase `does NOT switch to interactive` appears in the section
- [ ] A scope upgrade rule is documented
- [ ] The section appears between "Brainstorming Interview Format Override" and "Commit Planning Artifacts Step"

**Commit:** `feat(start-feature): add graduated YOLO behavior section`

---

### Task 4: Update YOLO propagation to include scope

**Files:**
- Modify: `skills/start-feature/SKILL.md:268-275` (YOLO Propagation block in Step 3)

**What to do:**

Update the YOLO Propagation block to include scope context in the args string. Change the examples from:
```
Skill(skill: "superpowers:brainstorming", args: "yolo: true. [original args]")
Skill(skill: "feature-flow:design-document", args: "yolo: true. [original args]")
```
to:
```
Skill(skill: "superpowers:brainstorming", args: "yolo: true. scope: [scope]. [original args]")
Skill(skill: "feature-flow:design-document", args: "yolo: true. scope: [scope]. [original args]")
```

Add a note explaining why: "Scope context is required for graduated YOLO behavior — design-document uses it to determine whether a mandatory checkpoint is needed."

**Acceptance criteria:**
- [ ] Both `Skill` invocation examples in the YOLO Propagation block include `scope: [scope]` in the args
- [ ] An explanation of why scope is included appears in the block
- [ ] The phrase `graduated YOLO behavior` appears in the explanation

**Commit:** `feat(start-feature): include scope in YOLO propagation args`

---

### Task 5: Add brainstorming YOLO checkpoint for Major Feature

**Files:**
- Modify: `skills/start-feature/SKILL.md:325-332` (Brainstorming YOLO behavior block)

**What to do:**

After the existing 4-item YOLO behavior list (lines 326-331), add a graduated checkpoint rule for Major Feature scope:

```markdown
**Graduated YOLO checkpoint (Major Feature only):**

After all brainstorming questions have been self-answered, if the scope is **Major Feature**, present a mandatory checkpoint summarizing all auto-answered decisions:

```
YOLO checkpoint: Brainstorming complete. Here are the design decisions I made:

| # | Question | Decision |
|---|----------|----------|
| 1 | [question] | [selected option with reasoning] |
| ... | ... | ... |

Continue or adjust?
```

Use `AskUserQuestion` with options:
- "Continue" — proceed to design document with these decisions
- "Let me adjust" — user provides corrections to specific decisions, then YOLO resumes

For Quick fix, Small enhancement, and Feature scopes, skip this checkpoint — proceed directly from brainstorming to the next step.
```

**Acceptance criteria:**
- [ ] The phrase `Graduated YOLO checkpoint (Major Feature only)` appears in the Brainstorming section of `skills/start-feature/SKILL.md`
- [ ] The checkpoint includes a decision summary table format
- [ ] `AskUserQuestion` with "Continue" and "Let me adjust" options is documented
- [ ] Quick fix, Small enhancement, and Feature are explicitly excluded from this checkpoint

**Commit:** `feat(start-feature): add brainstorming YOLO checkpoint for major features`

---

### Task 6: Enhance decision log format

**Files:**
- Modify: `skills/start-feature/SKILL.md:763-781` (YOLO Decision Log section in Step 5)

**What to do:**

Replace the current decision log format with two variants — one for full YOLO (quick fix / small enhancement) and one for graduated YOLO (feature / major feature).

Replace lines 763-781 with:

```markdown
**YOLO Decision Log (if YOLO mode was active):**

If the lifecycle ran in YOLO mode, append the decision log after the standard completion summary. The format varies by whether checkpoints were used:

**Full YOLO (quick fix / small enhancement — no checkpoints):**
```
## YOLO Decision Log

**Mode:** YOLO (system recommended — [scope] scope, low complexity)

| # | Skill | Decision | Auto-Selected |
|---|-------|----------|---------------|
| 1 | start-feature | Scope + mode | [scope], YOLO recommended |
| ... | ... | ... | ... |

**Total decisions auto-selected:** N
**Quality gates preserved:** hooks, tests, verification, code review
```

**Graduated YOLO (feature / major feature — with checkpoints):**
```
## YOLO Decision Log

**Mode:** YOLO with checkpoints (system recommended — [scope] scope, [reasoning])
**Checkpoints presented:** M

| # | Skill | Decision | Auto-Selected |
|---|-------|----------|---------------|
| ... | ... | ... | ... |
| N | design-document | Document approval | ✋ User reviewed (approved / adjusted) |
| ... | ... | ... | ... |

**Total decisions auto-selected:** N
**Checkpoints presented:** M of M approved [with/without changes]
```
```

Also update the Cancellation paragraph to remain unchanged.

**Acceptance criteria:**
- [ ] Two distinct decision log formats exist: one for "Full YOLO" and one for "Graduated YOLO"
- [ ] The Full YOLO format includes `**Mode:** YOLO (system recommended — [scope] scope, low complexity)`
- [ ] The Graduated YOLO format includes `**Mode:** YOLO with checkpoints`
- [ ] The Graduated YOLO format includes `**Checkpoints presented:** M`
- [ ] The Graduated YOLO format shows the `✋ User reviewed` marker for checkpoint rows
- [ ] The Cancellation paragraph still exists after the decision log section

**Commit:** `feat(start-feature): enhance YOLO decision log with recommendation reasoning`

---

### Task 7: Add conditional checkpoint to design-document Step 5

**Files:**
- Modify: `skills/design-document/SKILL.md:148-158` (Step 5: Present for Review, YOLO behavior block)

**What to do:**

Replace the current YOLO behavior block (line 158) with a conditional that checks the scope:

```markdown
**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`:

- **Quick fix or Small enhancement scope** (or scope not specified): Skip section-by-section confirmation entirely. Present the full document at once without asking. Announce: `YOLO: design-document — Section approval → Accepted (all sections)`

- **Feature or Major Feature scope:** Present the full document as a **mandatory YOLO checkpoint**. Do NOT skip approval. Use `AskUserQuestion`:

  ```
  YOLO checkpoint: Here's the design document. Continue or adjust?
  ```

  Options:
  - "Continue" — approve the document and resume YOLO mode
  - "Let me adjust" — user provides corrections, document is updated, then YOLO resumes

  Announce: `YOLO: design-document — Document approval → ✋ Checkpoint presented`

  The scope is determined from the `scope:` field in the skill's `ARGUMENTS` (e.g., `args: "yolo: true. scope: feature. ..."`). If no scope is specified, default to the skip behavior (backward compatible with pre-graduated-YOLO invocations).
```

**Acceptance criteria:**
- [ ] The YOLO behavior block in Step 5 of `skills/design-document/SKILL.md` contains conditional logic based on scope
- [ ] "Quick fix or Small enhancement" leads to skip behavior (current behavior preserved)
- [ ] "Feature or Major Feature" leads to a mandatory YOLO checkpoint with `AskUserQuestion`
- [ ] The checkpoint uses "Continue" and "Let me adjust" options
- [ ] The phrase `YOLO checkpoint` appears in the Feature/Major path
- [ ] A fallback for missing scope (`scope not specified`) defaults to skip behavior
- [ ] The announcement includes `✋ Checkpoint presented`

**Commit:** `feat(design-document): add conditional YOLO checkpoint for feature/major scopes`
