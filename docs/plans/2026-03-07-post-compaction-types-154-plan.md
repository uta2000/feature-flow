# Post-Compaction Type Confusion Fix Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Add type reminders to Progress Index callout in yolo-overrides.md — STATUS: pending
Task 2: Add type reminders block to SKILL.md Pre-Flight Check — STATUS: pending
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.
> Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

**Goal:** Add explicit type reminders for tool parameters (`replace_all`, `offset`, `limit`) in compaction-resistant locations so they persist across compaction events in the start skill lifecycle.

**Architecture:** Two purely additive text edits — no logic changes. (1) Extend the "For Claude:" callout in the Progress Index plan template so every generated plan file carries the type reminders; this is the most compaction-resistant location because it's explicitly designed to be re-read after compaction. (2) Add a callout block to the Pre-Flight Check section of SKILL.md so the reminders appear at lifecycle start.

**Tech Stack:** Markdown only — no code or tests required.

---

### Task 1: Add type reminders to Progress Index "For Claude:" callout in yolo-overrides.md

**Files:**
- Modify: `skills/start/references/yolo-overrides.md` (295 lines — design-first)

**Why this location:** The "For Claude:" callout immediately follows the PROGRESS INDEX HTML comment in every generated plan file. After compaction, the model is instructed to re-read the plan file and will encounter this callout — making it the most compaction-resistant place for type reminders. Every future plan will automatically carry these reminders.

**Step 1: Read the file and output change plan**

Read the complete file first. Then output this change plan before any Edit call:

> Change plan: Lines 58–59 contain the "For Claude:" callout template. Extend it by adding a third `>` line with tool parameter type reminders. No other content changes.

**Step 2: Apply the edit**

In `skills/start/references/yolo-overrides.md`, find the exact block (lines 58–59):

```
   > **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
   > Then read the full section for that specific task only.
```

Replace with:

```
   > **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
   > Then read the full section for that specific task only.
   > Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.
```

**Step 3: Verify the change**

```bash
grep -n "Tool parameter types" skills/start/references/yolo-overrides.md
```

Expected: one match on the line after "Then read the full section for that specific task only."

**Step 4: Commit**

```bash
git add skills/start/references/yolo-overrides.md
git commit -m "fix: add tool parameter type reminders to Progress Index callout template"
```

**Acceptance Criteria:**
- [ ] `grep "Tool parameter types" skills/start/references/yolo-overrides.md` returns exactly 1 match
- [ ] The reminder line appears immediately after "Then read the full section for that specific task only."
- [ ] Reminder covers `replace_all` (boolean), `offset` (number), `limit` (number)
- [ ] No other lines in the file are modified (diff shows exactly 1 insertion)

**Quality Constraints:**
- Error handling: N/A — markdown edit only
- Types: N/A — no code
- Function length: N/A
- Pattern reference: match style of existing `> **For Claude:**` lines (blockquote with backtick inline code)
- Files modified: `skills/start/references/yolo-overrides.md` (295 lines, design-first)
- Design-first: Read full file and output change plan before any Edit call on this file
- Parallelizable: no — both tasks modify files in the same plugin directory; run sequentially to avoid confusion

---

### Task 2: Add type reminders block to SKILL.md Pre-Flight Check section

**Files:**
- Modify: `skills/start/SKILL.md` (467 lines — design-first)

**Why this location:** SKILL.md is loaded at the start of every lifecycle session. Adding a type reminder block to the Pre-Flight Check section means it appears early in the conversation, before any tool calls occur. While it may be compacted eventually, it ensures fresh sessions start with the correct type information visible.

**Step 1: Read the file and output change plan**

Read the complete file first. Then output this change plan before any Edit call:

> Change plan: The Pre-Flight Check section begins at line 13 and ends before `## Purpose` (or the next `##` heading). Insert a new `### Tool Parameter Types` subsection at the END of the Pre-Flight Check section (just before the next `## Purpose` heading). This is purely additive — no existing lines change.

**Step 2: Locate the exact insertion point**

```bash
grep -n "^## Purpose" skills/start/SKILL.md
```

The new block goes on the line immediately before the `## Purpose` heading.

**Step 3: Apply the edit**

Find the exact text just before `## Purpose`:

```
### Reviewer Stack Affinity Table
```

...scroll to the end of that table, then the `### Pre-Flight Reviewer Audit, Marketplace Discovery & Install` section ends just before `## Purpose`. Insert the new block immediately before `## Purpose`:

```markdown

### Tool Parameter Types

> **Post-compaction reminder:** Tool parameters must use correct types. Wrong types cause cascading failures.
>
> | Parameter | Tool | Correct type | Wrong type (do NOT use) |
> |-----------|------|-------------|------------------------|
> | `replace_all` | Edit | `boolean` — `true` or `false` | `'true'` / `'false'` (string) |
> | `offset` | Read | `number` — e.g. `100` | `'100'` (string) |
> | `limit` | Read | `number` — e.g. `50` | `'50'` (string) |

```

**Step 4: Verify the change**

```bash
grep -n "Post-compaction reminder" skills/start/SKILL.md
```

Expected: one match in the Pre-Flight Check section.

```bash
grep -n "replace_all" skills/start/SKILL.md
```

Expected: one match (the new table row).

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "fix: add tool parameter type reminder block to SKILL.md Pre-Flight Check"
```

**Acceptance Criteria:**
- [ ] `grep "Post-compaction reminder" skills/start/SKILL.md` returns exactly 1 match
- [ ] `grep "replace_all" skills/start/SKILL.md` returns exactly 1 match (new table row)
- [ ] The block appears inside the Pre-Flight Check section (before `## Purpose`)
- [ ] Table covers all three parameters: `replace_all`, `offset`, `limit`
- [ ] Table shows both correct type and incorrect type examples
- [ ] No existing lines are modified (diff shows only insertions)

**Quality Constraints:**
- Error handling: N/A — markdown edit only
- Types: N/A — no code
- Function length: N/A
- Pattern reference: match existing callout style in SKILL.md (blockquote + inline code + backticks)
- Files modified: `skills/start/SKILL.md` (467 lines, design-first)
- Design-first: Read full file and output change plan before any Edit call on this file
- Parallelizable: no — sequential after Task 1
