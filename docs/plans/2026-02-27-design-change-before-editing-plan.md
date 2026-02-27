# Design the Change Before Editing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Change Design Protocol" to implementer subagent injection and a "File modification complexity" field to plan Quality Constraints, preventing edit thrashing.

**Architecture:** Three edits to `skills/start/SKILL.md` — add a third planning requirement, add a fifth implementer injection item with updated template, and update the example task.

**Tech Stack:** Markdown (skill documentation)

---

### Task 1: Add file modification complexity requirement to Writing Plans Quality Context Injection

**Files:**
- Modify: `skills/start/SKILL.md:604` (after the existing requirement 2 block, before the example)

**Step 1: Read the target section**

Read `skills/start/SKILL.md` lines 588–622 to understand the exact structure of the Writing Plans Quality Context Injection section.

**Step 2: Add requirement 3**

After line 604 (the last sub-item of requirement 2), insert the new requirement 3:

```markdown

3. **File modification complexity required in Quality Constraints.** For tasks that modify existing files (not create new ones), the Quality Constraints section must include:
   - **Files modified:** List of existing files this task will edit
   - **Design-first files:** Any listed file >150 lines, flagged with `(design-first)` — the implementer must output a change plan before editing these files
```

**Step 3: Verify the edit**

Read the modified section to confirm requirements are numbered 1, 2, 3 and the markdown formatting is consistent with existing requirements.

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains a requirement 3 under "Prepend to the planning instructions" titled "File modification complexity required in Quality Constraints"
- [ ] Requirement 3 includes `Files modified` and `Design-first files` sub-items
- [ ] The >150 line threshold and `(design-first)` flag are specified
- [ ] Requirement numbering is sequential: 1, 2, 3

**Quality Constraints:**
- Files modified: `skills/start/SKILL.md` (design-first — 900+ lines)
- Pattern: follow existing requirement structure (indentation, bold labels, sub-items with em-dashes)

---

### Task 2: Update the Quality Constraints example task

**Files:**
- Modify: `skills/start/SKILL.md:606–622` (the example task code block)

**Step 1: Read the current example**

Read `skills/start/SKILL.md` lines 606–622 to see the current example task.

**Step 2: Update the example**

Replace the existing example code block with an updated version that includes the new `Files modified` and `Design-first files` fields:

```markdown
**Example task with quality constraints:**

\`\`\`markdown
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
\`\`\`
```

**Step 3: Verify the edit**

Read the modified example to confirm the two new fields appear after the existing four Quality Constraints fields.

**Acceptance Criteria:**
- [ ] The example task's Quality Constraints section includes a `Files modified` field with a file path and `(design-first — N lines)` annotation
- [ ] The example task's Quality Constraints section includes a `Design-first files` field referencing the same file with a "must output change plan" instruction
- [ ] All four original Quality Constraints fields are preserved unchanged
- [ ] The example is valid markdown inside a fenced code block

**Quality Constraints:**
- Files modified: `skills/start/SKILL.md` (design-first — 900+ lines)
- Pattern: follow existing example structure (fenced markdown code block, bullet list under Quality Constraints)

---

### Task 3: Add Change Design Protocol to Implementer Quality Context Injection

**Files:**
- Modify: `skills/start/SKILL.md:679–697` (after item 4, before injection format template)

**Step 1: Read the current injection section**

Read `skills/start/SKILL.md` lines 667–697 to see the full Implementer Quality Context Injection section.

**Step 2: Add item 5 after item 4**

After line 679 (the end of item 4's description), insert the new item 5:

```markdown

5. **Change Design Protocol.** For every file the task modifies (listed in the Quality Constraints `Files modified` field), instruct the implementer to follow this protocol before any Edit call:
   1. **Read the complete file** before any edit. For files >200KB, use Grep to find relevant sections or Read with offset/limit targeting specific functions.
   2. **Output a brief change plan:** which functions/sections change, what's added, what's removed, and how the change fits the file's existing structure.
   3. **Write the edit in one pass** — do not edit, run typecheck, re-read, and edit again. If the first edit has issues, re-read the file to understand what went wrong before making a second edit.
   4. For files marked `(design-first)` in Quality Constraints (>150 lines): the change plan in sub-step 2 is **mandatory** and must be output before any Edit tool call on that file.
```

**Step 3: Update the injection format template**

Replace the existing injection format code block (lines 683–697) with the updated version that includes the new section:

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
[If any file is marked (design-first): "MANDATORY: Output change plan before ANY Edit call on: [file list]"]
```

**Step 4: Verify the edit**

Read the full Implementer Quality Context Injection section to confirm:
- Items are numbered 1–5
- The injection format template includes the new "Change Design Protocol" section
- The markdown formatting is consistent

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` Implementer Quality Context Injection section has 5 numbered items
- [ ] Item 5 is titled "Change Design Protocol"
- [ ] Item 5 references the Quality Constraints `Files modified` field
- [ ] Item 5 includes the 4-step protocol: read, plan, write in one pass, mandatory plan for design-first files
- [ ] The injection format template includes a `### Change Design Protocol` section
- [ ] The template shows the conditional `(design-first)` mandatory instruction

**Quality Constraints:**
- Files modified: `skills/start/SKILL.md` (design-first — 900+ lines)
- Pattern: follow existing numbered item structure (bold title, description paragraph, sub-steps with numbered list)

---

### Task 4: Commit changes

**Step 1: Stage the modified file**

```bash
git add skills/start/SKILL.md
```

**Step 2: Commit**

```bash
git commit -m "feat: add Change Design Protocol to implementer injection

Add file modification complexity requirement to Writing Plans Quality
Context Injection and Change Design Protocol to Implementer Quality
Context Injection. Implementers now read files and plan changes before
editing, preventing edit thrashing.

Related: #95"
```

**Acceptance Criteria:**
- [ ] Commit includes only `skills/start/SKILL.md`
- [ ] Commit message references issue #95
- [ ] `git status` shows clean working tree after commit

**Quality Constraints:**
- Files modified: `skills/start/SKILL.md`
