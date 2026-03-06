# Remove Duplicate Documentation from SKILL.md — Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Create decision-log-templates.md reference file — STATUS: done (commit 9e2efac)
Task 2: Replace inline content in SKILL.md — STATUS: done (commit 828c02f)
Task 3: Verify net line reduction — STATUS: done (verification passed)
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.

**Goal:** Remove duplicated content from `skills/start/SKILL.md` by referencing existing files and extracting templates to new reference files.

**Architecture:** Three areas of deduplication: (1) self-review checklist → reference `coding-standards.md`, (2) decision log templates → extract to `references/decision-log-templates.md`, (3) scope table → add pointer to `scope-guide.md`. All changes are markdown-only — no code, no tests.

**Tech Stack:** Markdown files only

---

### Task 1: Create `references/decision-log-templates.md`

**Files:**
- Create: `references/decision-log-templates.md`

**Acceptance Criteria:**
- [ ] File exists at `references/decision-log-templates.md`
- [ ] Contains the YOLO decision log template (table format with Mode, columns: #/Skill/Decision/Auto-Selected, Total decisions, Quality gates)
- [ ] Contains the Express decision log template (table format with Mode, Checkpoints, columns: #/Skill/Decision/Auto-Selected, Total decisions, Checkpoints presented, Quality gates)
- [ ] Contains the note about Interactive mode not producing a decision log
- [ ] Content matches lines 1823-1872 of current `skills/start/SKILL.md` exactly (no rewriting)

**Quality Constraints:**
- Pattern: follow existing reference files in `references/` (e.g., `coding-standards.md`) for heading style and structure
- No new content — strictly extract from SKILL.md

**Step 1: Read the decision log template content from SKILL.md**

Read lines 1819-1874 of `skills/start/SKILL.md` to capture the full decision log section.

**Step 2: Create the reference file**

Create `references/decision-log-templates.md` with the extracted content. Add a header explaining the file's purpose and when it's used (Step 5: Completion).

**Step 3: Commit**

```bash
git add references/decision-log-templates.md
git commit -m "docs: extract decision log templates to reference file"
```

---

### Task 2: Replace inline content in SKILL.md

**Files:**
- Modify: `skills/start/SKILL.md`

**Acceptance Criteria:**
- [ ] Self-review checklist (lines 1203-1217) replaced with: `3. Review every changed file against the checklist in \`../../references/coding-standards.md\`.`
- [ ] Decision log templates section (lines 1823-1872) replaced with a pointer: read `references/decision-log-templates.md` to format the decision log
- [ ] Scope classification table (lines 386-393) has a pointer line added: `See \`references/scope-guide.md\` for detailed criteria, examples, and edge cases.`
- [ ] All surrounding context (process steps, output format, cancellation section) preserved unchanged
- [ ] No broken references — all remaining pointers reference files that exist or are already referenced in Additional Resources

**Quality Constraints:**
- Files modified: `skills/start/SKILL.md` (design-first — 1906 lines)
- Design-first files: `skills/start/SKILL.md` — implementer must output change plan before editing

**Step 1: Replace the self-review checklist**

In the Self-Review Step section, replace the 14-item checklist block (lines 1203-1217) with a single reference line. Keep the surrounding process steps (1, 2, 4, 5) and output format intact.

Before (lines 1201-1218):
```
2. Get the full diff of all files changed during implementation: `git diff`
3. Review every changed file against these criteria:

**Self-Review Checklist:**
- [ ] **Functions:** ...
[14 items]

4. For each violation found...
```

After:
```
2. Get the full diff of all files changed during implementation: `git diff`
3. Review every changed file against the checklist in `../../references/coding-standards.md`.

4. For each violation found...
```

**Step 2: Replace the decision log templates**

In the Step 5: Completion section, replace lines 1823-1872 (the YOLO and Express template blocks + Interactive note) with a reference to the new file.

Before (lines 1819-1874):
```
**Decision Log (if YOLO or Express mode was active):**

If the lifecycle ran in YOLO or Express mode, append the decision log...

**YOLO (all scopes):**
[template block]

**Express (all scopes):**
[template block]

Interactive mode does not produce a decision log...
```

After:
```
**Decision Log (if YOLO or Express mode was active):**

If the lifecycle ran in YOLO or Express mode, read `references/decision-log-templates.md` and append the appropriate decision log template (YOLO or Express) after the standard completion summary. Interactive mode does not produce a decision log.
```

**Step 3: Add scope pointer**

After the scope classification table (line 393), add a pointer line:

```
See `references/scope-guide.md` for detailed criteria, examples, and edge cases.
```

**Step 4: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "refactor: replace inline duplicates with references in SKILL.md"
```

---

### Task 3: Verify net line reduction

**Files:**
- Read: `skills/start/SKILL.md`

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` total line count is at least 60 lines less than the original 1906 lines (i.e., ≤1846 lines)
- [ ] `wc -l skills/start/SKILL.md` confirms the reduction
- [ ] Scope classification table section is ≤10 lines (from `**Scope classification:**` to the blank line after the table)
- [ ] Self-review step references `coding-standards.md` instead of inlining the checklist
- [ ] Decision log templates section in Step 5 points to `references/decision-log-templates.md`

**Quality Constraints:**
- This is a verification-only task — no file modifications

**Step 1: Count lines**

```bash
wc -l skills/start/SKILL.md
```

Expected: ≤1846 (original 1906 minus ≥60)

**Step 2: Verify scope table size**

```bash
sed -n '/^\*\*Scope classification:\*\*/,/^$/p' skills/start/SKILL.md | wc -l
```

Expected: ≤10 lines

**Step 3: Verify self-review reference**

```bash
grep -n "coding-standards.md" skills/start/SKILL.md
```

Expected: line in the Self-Review Step section referencing `../../references/coding-standards.md`

**Step 4: Verify decision log pointer**

```bash
grep -n "decision-log-templates.md" skills/start/SKILL.md
```

Expected: line in the Step 5 Completion section referencing the template file

**Step 5: Commit (if verification passes)**

No commit needed — verification only.
