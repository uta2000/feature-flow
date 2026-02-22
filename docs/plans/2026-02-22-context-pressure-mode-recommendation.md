# Context Pressure Mode Recommendation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add estimated context pressure as a third signal in the mode recommendation logic, shifting Major Feature + Detailed Context from "Neutral" to "Express (Recommended)" and adding context warnings for high-pressure Interactive recommendations.

**Architecture:** Four targeted edits to `skills/start/SKILL.md` — update one table, insert one new table, replace one option-ordering block, and add conditional text to the question format.

**Tech Stack:** Markdown (skill definition file)

---

### Task 1: Update smart recommendation logic table

**Files:**
- Modify: `skills/start/SKILL.md:210-215`

**Step 1: Edit the recommendation table**

Replace the last row of the smart recommendation logic table, changing `Neutral` to `Express` in both the "With detailed issue" and "With detailed inline context" columns.

**Current (line 215):**
```
| Major feature | Interactive | Neutral | Neutral |
```

**New:**
```
| Major feature | Interactive | Express | Express |
```

**Step 2: Verify the edit**

Read lines 210-215 of `skills/start/SKILL.md` and confirm:
- Row for "Major feature" now shows `Express` in columns 3 and 4
- All other rows unchanged

**Step 3: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: update major feature recommendation from Neutral to Express"
```

**Acceptance Criteria:**
- [ ] Line containing `Major feature` in the smart recommendation logic table has `Express` in both "With detailed issue" and "With detailed inline context" columns
- [ ] No other rows in the recommendation table are modified (Quick fix, Small enhancement, Feature rows unchanged)

---

### Task 2: Add context pressure estimates table

**Files:**
- Modify: `skills/start/SKILL.md` (insert after line 215, after the recommendation logic table)

**Step 1: Insert the context pressure table**

Add the following block immediately after the smart recommendation logic table (after the `| Major feature | Interactive | Express | Express |` line) and before the `**Combined scope + mode prompt:**` line:

```markdown

**Context pressure estimates (scope × mode):**

| Scope | Interactive | Express | YOLO |
|-------|-------------|---------|------|
| Quick fix (7 steps) | Low | Low | Low |
| Small enhancement (14-17 steps) | Medium | Low | Low |
| Feature (18 steps) | High | Medium | Medium |
| Major feature (19 steps) | Very High | High | High |

```

**Step 2: Verify the edit**

Read the section around line 215-230 and confirm:
- The context pressure table exists between the recommendation logic table and the "Combined scope + mode prompt" heading
- Table has 4 data rows and 4 columns (Scope, Interactive, Express, YOLO)
- Values match the spec exactly

**Step 3: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add context pressure estimates table"
```

**Acceptance Criteria:**
- [ ] A table titled "Context pressure estimates (scope × mode):" exists in SKILL.md after the smart recommendation logic table
- [ ] The table has exactly these rows: Quick fix (Low/Low/Low), Small enhancement (Medium/Low/Low), Feature (High/Medium/Medium), Major feature (Very High/High/High)
- [ ] The table appears before the "Combined scope + mode prompt:" section

---

### Task 3: Replace Neutral option ordering with Express-recommended ordering

**Files:**
- Modify: `skills/start/SKILL.md` (the `*Neutral*` block, currently lines 241-244)

**Step 1: Replace the Neutral block**

Find and replace the entire `*Neutral*` option ordering block:

**Current:**
```markdown
*Neutral* (major feature with detailed issue or detailed inline context):
- Option 1: "Interactive — I'll interview you to address outstanding design questions, with pauses at phase transitions to optionally compact the conversation" (no recommendation marker)
- Option 2: "Express — I'll auto-select decisions but pause for design approval and at phase transitions to optionally compact the conversation" (no recommendation marker)
- Option 3: "YOLO — fully unattended, no pauses" (no recommendation marker)
```

**New:**
```markdown
*Express recommended* (major feature with detailed issue or detailed inline context):
- Option 1: "Express — I'll auto-select decisions but pause for design approval and at phase transitions to optionally compact the conversation" with description: "*Recommended — detailed requirements cover design decisions; Express preserves compaction checkpoints for this 19-step lifecycle.*"
- Option 2: "Interactive — I'll interview you to address outstanding design questions, with pauses at phase transitions to optionally compact the conversation"
- Option 3: "YOLO — fully unattended, no pauses"
```

**Step 2: Verify the edit**

Read the option ordering section and confirm:
- The `*Neutral*` block no longer exists
- The `*Express recommended*` block exists with Express as Option 1 with the `*Recommended*` description
- The other two option ordering blocks (YOLO recommended, Interactive recommended) are unchanged

**Step 3: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: replace Neutral option ordering with Express-recommended"
```

**Acceptance Criteria:**
- [ ] No `*Neutral*` option ordering block exists in SKILL.md
- [ ] An `*Express recommended*` block exists with Express as Option 1, including a `*Recommended*` marker and reasoning mentioning "compaction checkpoints" and "19-step lifecycle"
- [ ] Option 2 is Interactive and Option 3 is YOLO in the Express recommended block (no recommendation markers on these)
- [ ] The YOLO recommended and Interactive recommended blocks remain unchanged

---

### Task 4: Add context warning to question format

**Files:**
- Modify: `skills/start/SKILL.md` (the question format section, currently around lines 221-227)

**Step 1: Add the conditional context note**

After the current question format block and before the option ordering section, insert the context warning specification:

Find the closing ` ``` ` of the question format code block (after `Run mode?`) and add after it:

```markdown

**Context warning (conditional):**

When the recommended mode is Interactive AND the context pressure for Interactive at the current scope is High or Very High, add a context note line to the question text:

```
This looks like a **[scope]** ([N] steps).
[If issue linked: "Found issue #N: [title] — [richness summary]."]
Context note: Interactive mode at this scope typically requires 2-3 /compact pauses. Express auto-selects decisions while preserving those checkpoints.

Run mode?
```

**When to show the context note:**
- Feature + sparse context (High pressure in Interactive) → show note
- Major feature + sparse context (Very High pressure in Interactive) → show note
- All other cases → no context note (pressure is Low-Medium, or the recommendation is already YOLO/Express)

```

**Step 2: Verify the edit**

Read the question format section and confirm:
- The original question format code block is unchanged
- A new "Context warning (conditional):" section exists after it
- The section specifies when to show/hide the note
- The context note text mentions "/compact pauses" and "Express"

**Step 3: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add context warning to mode recommendation question"
```

**Acceptance Criteria:**
- [ ] A "Context warning (conditional):" section exists in SKILL.md after the question format code block
- [ ] The context warning text includes the exact string "Interactive mode at this scope typically requires 2-3 /compact pauses. Express auto-selects decisions while preserving those checkpoints."
- [ ] The "When to show" rules specify: Feature + sparse → show, Major feature + sparse → show, all others → no note
- [ ] Context note is NOT shown when richness is detailed (explicitly stated in the "When to show" rules)
- [ ] Context note is NOT shown for Quick fix or Small enhancement scopes (covered by "all other cases" rule)

---

### Task 5: Verify all acceptance criteria end-to-end

**Files:**
- Read: `skills/start/SKILL.md` (full file)

**Step 1: Run verify-acceptance-criteria**

Verify all 9 acceptance criteria from issue #67:

1. Smart recommendation logic table has Major Feature + detailed context as `Express` (not `Neutral`)
2. Context pressure estimates table exists after the recommendation logic table
3. Option ordering for Major Feature + detailed context shows Express first with `*Recommended*` marker and reasoning
4. Question format includes context note line when scope is Feature or Major Feature AND richness is sparse
5. Context note text mentions `/compact` pauses and Express as alternative
6. Context note is NOT shown when richness is detailed
7. Context note is NOT shown for Quick fix or Small enhancement scopes
8. No changes to YOLO/Express trigger phrase behavior (lines ~79-99 and ~252-256 unchanged)
9. No changes to existing checkpoint suppression rules (lines ~497-501 unchanged)

**Step 2: Final commit**

```bash
git add skills/start/SKILL.md
git commit -m "chore: verify all acceptance criteria for context pressure signal"
```

**Acceptance Criteria:**
- [ ] All 9 acceptance criteria from issue #67 pass when checked against the file content
- [ ] The YOLO trigger phrase detection section (Step 0) is unmodified from the original
- [ ] The checkpoint suppression rules section is unmodified from the original
