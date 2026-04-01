# Standards Cross-Check Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Standards Cross-Check step to the `design-document` skill that reads project-specific standards files, identifies conflicts with the design spec, and applies or surfaces corrections.

**Architecture:** Three files receive changes: `skills/design-document/SKILL.md` gains Step 6 (Standards Cross-Check) and Step 6→7 renumber; `skills/settings/SKILL.md` gains a "Standards" option inside the existing Design category; `references/project-context-schema.md` gains a `standards` namespace. All changes are edits to Markdown prompt-instruction files — no executable code.

**Tech Stack:** Markdown (prompt instructions), YAML (`.feature-flow.yml` configuration)

**Issue:** #206

---

<!-- Progress Index -->
## Progress Index

| Task | Title | Status |
|------|-------|--------|
| 1 | Add `standards` schema to `project-context-schema.md` | pending |
| 2 | Add Step 6 (Standards Cross-Check) to `design-document/SKILL.md` | pending |
| 3 | Renumber Step 6→7 in `design-document/SKILL.md` | pending |
| 4 | Add Standards option to Design category in `settings/SKILL.md` | pending |
| 5 | Commit planning artifacts | pending |

---

### Task 1: Add `standards` schema to `references/project-context-schema.md`

**Files:**
- Modify: `references/project-context-schema.md`

**Quality Constraints:**
- Pattern: Follow the existing field documentation format in `references/project-context-schema.md` — `### <field-name>` heading, description paragraph, sub-fields table (if nested), format block with YAML example, "When absent" paragraph
- Naming: All new YAML keys use snake_case; file paths in YAML examples use forward slashes
- Error handling: exceptions (project preference) — document that missing files warn and skip, all-missing skips silently, never fails the design-document skill
- Type narrowness: `enabled` is `boolean`; `files` is a list of path strings (relative to project root)
- Function length: N/A — documentation file
- Files modified: `references/project-context-schema.md` — this file is >150 lines; output the intended insertion text before making any Edit call (design-first)
- Parallelizable: No — subsequent tasks reference this schema

**Acceptance Criteria:**
- [ ] `references/project-context-schema.md` contains a `### standards` section
- [ ] The section documents `enabled` (boolean) and `files` (list of path strings) sub-fields in a table
- [ ] The section includes a YAML example showing both `enabled: true` and a `files` list with two sample paths
- [ ] The section includes a "When absent" paragraph explaining that auto-discovery triggers on the next `design-document` run
- [ ] The "How Skills Use This File" section at the bottom of the file includes a `design-document` entry (or updates the existing one) referencing the `standards` namespace
- [ ] Grep for `### standards` in `references/project-context-schema.md` returns exactly 1 match
- [ ] Grep for `standards.enabled` in `references/project-context-schema.md` returns at least 1 match

**Edge Case Criteria:**
- [ ] The "When absent" text distinguishes between "key absent" (auto-discovery triggers) and "`enabled: false`" (cross-check skipped silently, no auto-discovery)

**Step 1: Read the current schema file and identify insertion point**

Read `references/project-context-schema.md` in full. Note where the last field (`yolo`) ends and where "How Skills Use This File" begins. The `standards` section inserts between the last field section and the "How Skills Use This File" section.

**Step 2: Draft the new section text**

Write the full section text before making any Edit call:

```markdown
### `standards`

Optional configuration for the Standards Cross-Check step in the `design-document` skill. When present, `design-document` reads the listed files and verifies the design spec against them before suggesting next steps.

**Sub-fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` (when key present) | Whether the cross-check runs. Set to `false` to disable without removing the `files` list. |
| `files` | list of strings | _(absent = auto-discovery)_ | Paths to standards files, relative to the project root. |

**Format:**

```yaml
standards:
  enabled: true
  files:
    - docs/architecture.md
    - .claude/conventions.md
```

**When absent:** On the next `design-document` run, first-run auto-discovery triggers: the skill scans `.claude/`, `docs/`, and the project root for files named `architecture.md`, `conventions.md`, `standards.md`, `coding-standards.md`, or `style-guide.md` (case-insensitive). In Interactive mode the user selects which to register; in YOLO/Express mode all discovered files are auto-selected. The field is then written to `.feature-flow.yml`. If no files are discovered, `standards.enabled: false` is written and the cross-check is skipped silently on all subsequent runs.

**When `enabled: false`:** The cross-check is skipped silently. Auto-discovery does not trigger. Existing `files` list is preserved so re-enabling is a one-line change.

**When `files` is absent or empty and `enabled` is not `false`:** Auto-discovery triggers (same as when the entire key is absent).
```

**Step 3: Insert the section into the schema file**

Use Edit to insert after the `yolo` section and before the `## How Skills Use This File` heading.

**Step 4: Update "How Skills Use This File" for design-document**

In the existing `### design-document (reads)` bullet in "How Skills Use This File", append:
- `- **Reads** \`standards.enabled\` and \`standards.files\` to perform the Standards Cross-Check (Step 6). Triggers auto-discovery when the key is absent.`

If `design-document` does not already appear in that section, add it following the same pattern as other skills (e.g., `### design-document (reads + writes)` since the skill also writes the standards config after auto-discovery).

**Step 5: Commit**

```bash
git add references/project-context-schema.md
git commit -m "docs: add standards namespace to project-context-schema — #206"
```

---

### Task 2: Add Step 6 (Standards Cross-Check) to `skills/design-document/SKILL.md`

**Files:**
- Modify: `skills/design-document/SKILL.md`

**Quality Constraints:**
- Design-first: `skills/design-document/SKILL.md` is >150 lines — read the file in full, identify the exact `old_string` boundaries of the current Step 6 header line, and state the insertion plan before making any Edit call
- Pattern: Match the heading level, YOLO/Express behavior block style, and announcement string format used in existing steps (e.g., `YOLO: design-document — [topic] → [outcome]`)
- Error handling: exceptions — warn-and-skip for individual missing files; warn-and-skip-entire-check when all files missing; fallback to raw response when LLM output is unparseable
- Type narrowness: N/A — Markdown instructions
- Function length: The new step text should be self-contained and not require the implementer to infer logic from the design doc
- Files modified: `skills/design-document/SKILL.md` (design-first flag applies)
- Parallelizable: No — Task 3 (renumber) depends on this task completing first

**Acceptance Criteria:**
- [ ] `skills/design-document/SKILL.md` contains a `### Step 6: Standards Cross-Check` heading
- [ ] The step reads `.feature-flow.yml` to check for `standards.enabled` and `standards.files` before doing any file I/O
- [ ] The step includes a skip path: if `standards.enabled: false`, announce nothing and proceed to the next step
- [ ] The step includes an auto-discovery path: if `standards.files` is absent or empty (and `enabled` is not `false`), scan `.claude/`, `docs/`, and project root for the 5 target filenames, excluding `CLAUDE.md` files
- [ ] Interactive mode auto-discovery uses `AskUserQuestion` with `multiSelect: true` to let the user choose which files to register
- [ ] YOLO/Express mode auto-discovery auto-selects all discovered files and announces: `YOLO: design-document — Standards auto-discovery → N files found, all selected`
- [ ] After auto-discovery, the selected file list is written to `.feature-flow.yml` under `standards.enabled: true` and `standards.files`
- [ ] If no files are discovered, `standards.enabled: false` is written to `.feature-flow.yml` and the cross-check is skipped silently
- [ ] The step reads each file in `standards.files`, warns and skips any that are not found: `Warning: Standards file [path] not found — skipping.`
- [ ] If more than 5 files are configured, the step announces: `Note: [N] standards files configured. Large standards sets may reduce cross-check precision.`
- [ ] The step passes standards content and the design document to the LLM to identify conflicts
- [ ] The report is displayed as a `| Issue | Source | Fix |` table (display-only — not saved to the design document file)
- [ ] If no conflicts are detected, the step announces: `Standards cross-check passed — no conflicts found.` and proceeds
- [ ] Interactive mode presents the report and asks which fixes to apply; each concrete fix is applied via Edit to the design document
- [ ] YOLO/Express mode auto-applies all concrete fixes, skips vague fixes, and announces: `YOLO: design-document — Standards fixes → N applied, M skipped (vague)`
- [ ] If LLM output cannot be parsed into table format, the raw response is displayed as a fallback and auto-corrections are skipped

**Edge Case Criteria:**
- [ ] All files in `standards.files` are missing: warn for each, skip the cross-check entirely (do not fail the skill)
- [ ] `standards.files` is an empty list (`[]`) with `enabled: true`: trigger auto-discovery (same as absent)
- [ ] Auto-discovery finds 0 files: write `standards.enabled: false`, announce nothing, proceed to next step

**Step 1: Read the full SKILL.md and identify insertion boundaries**

Read `skills/design-document/SKILL.md` in full. Note:
- The exact text of the current `### Step 6: Suggest Next Steps` line (this becomes the insertion point — new Step 6 inserts immediately before it)
- The YOLO/Express behavior block format used in Step 5 (to match the announcement pattern)
- The exact line count of the file (to confirm >150 lines and apply design-first rule)

**Step 2: Draft the full Step 6 section text**

Write the complete new section before making any Edit call. The section text:

```markdown
### Step 6: Standards Cross-Check

Read `.feature-flow.yml` to check `standards.enabled` and `standards.files`.

**Skip conditions (no output, no warning):**
- `standards.enabled` is explicitly `false`
- `standards.files` is absent or empty AND auto-discovery finds no files

#### Auto-Discovery (when `standards.files` is absent or empty and `enabled` is not `false`)

Scan these locations for standards files:
- `.claude/` directory
- `docs/` directory
- Project root

Target filenames (case-insensitive): `architecture.md`, `conventions.md`, `standards.md`, `coding-standards.md`, `style-guide.md`

Exclude any file named `CLAUDE.md` (these are memory/activity tracking files, not project standards).

**Interactive mode:**

```
AskUserQuestion (multiSelect: true): "Standards files discovered — which should be used for design cross-checks?"
Options: [one option per discovered file, showing its path]
```

Write the selected files to `.feature-flow.yml`:

```yaml
standards:
  enabled: true
  files:
    - [selected paths]
```

**YOLO/Express mode:** Auto-select all discovered files. Write to `.feature-flow.yml`. Announce: `YOLO: design-document — Standards auto-discovery → N files found, all selected`

**If no files are discovered:** Write `standards.enabled: false` to `.feature-flow.yml`. Skip the cross-check silently.

#### Cross-Check Execution

If `standards.files` has entries (from config or from auto-discovery above):

1. If more than 5 files are configured, announce: `Note: [N] standards files configured. Large standards sets may reduce cross-check precision.`

2. For each file in `standards.files`: read its contents. If the file does not exist on disk, announce: `Warning: Standards file [path] not found — skipping.` and continue with the remaining files.

3. If all files are missing after attempting to read them, skip the cross-check entirely (no further output).

4. Concatenate the content of all successfully-read files with source labels (e.g., `--- Source: docs/architecture.md ---`).

5. Pass the concatenated standards content and the current design document to the LLM with this prompt:

   > You are reviewing a design document against a set of project standards. Identify every conflict between the design and the standards. For each conflict, produce: (1) a concise description of the issue, (2) the source file and line number where the standard is defined, (3) a concrete, actionable fix to apply to the design document. Format your response as a Markdown table with columns: Issue | Source | Fix. If there are no conflicts, respond with exactly: NO_CONFLICTS

6. Parse the response:
   - If the response is exactly `NO_CONFLICTS`: announce `Standards cross-check passed — no conflicts found.` and proceed to Step 7.
   - If the response is a valid Markdown table: continue to Report Display below.
   - If the response cannot be parsed as either: display the raw response prefixed with `Standards cross-check (raw output — table parsing failed):` and skip auto-corrections. Proceed to Step 7.

#### Report Display

Print the report table as-is (display-only — do not modify the design document file):

```
Standards Cross-Check Report

| Issue | Source | Fix |
|-------|--------|-----|
| ...   | ...    | ... |
```

#### Corrections

A fix is **concrete** if it specifies a precise, actionable change to the design document (e.g., "Change X to Y in the Architecture section"). A fix is **vague** if it says things like "consider reviewing", "may need to", or "discuss with team".

**Interactive mode:** After displaying the report, ask:

```
AskUserQuestion (multiSelect: true): "Which fixes should I apply to the design document?"
Options: [one option per table row — truncated to 4 if more than 4 rows; if >4 rows, present in batches]
```

Apply each selected concrete fix via the Edit tool to the design document file. Announce each application: `Applied: [Issue summary]`

**YOLO/Express mode:** Auto-apply all concrete fixes via the Edit tool. Skip vague fixes. Announce: `YOLO: design-document — Standards fixes → N applied, M skipped (vague)`

```

**Step 3: Insert the new Step 6 immediately before the current "### Step 6: Suggest Next Steps" line**

Use Edit with the current `### Step 6: Suggest Next Steps` heading as the start of `old_string`. Prepend the entire new Step 6 section so the current Step 6 heading becomes Step 7 (which Task 3 will rename). Do not change the heading text in this Edit — only insert the new section above it. This keeps Task 2 and Task 3 as separate, auditable changes.

**Step 4: Verify the file structure is correct**

Read `skills/design-document/SKILL.md` to confirm:
- New `### Step 6: Standards Cross-Check` is present
- Original `### Step 6: Suggest Next Steps` is still present immediately after (to be renumbered in Task 3)
- No existing step text was accidentally deleted

**Step 5: Commit**

```bash
git add skills/design-document/SKILL.md
git commit -m "feat: add Step 6 Standards Cross-Check to design-document skill — #206"
```

---

### Task 3: Renumber Step 6→7 in `skills/design-document/SKILL.md`

**Files:**
- Modify: `skills/design-document/SKILL.md`

**Quality Constraints:**
- Pattern: Update the heading `### Step 6: Suggest Next Steps` → `### Step 7: Suggest Next Steps` and any in-text references to "Step 6" that refer to the Suggest Next Steps step
- Error handling: N/A — this is a rename, not logic
- Type narrowness: N/A
- Function length: N/A
- Files modified: `skills/design-document/SKILL.md`
- Parallelizable: No — depends on Task 2 completing first

**Acceptance Criteria:**
- [ ] `skills/design-document/SKILL.md` does NOT contain `### Step 6: Suggest Next Steps`
- [ ] `skills/design-document/SKILL.md` DOES contain `### Step 7: Suggest Next Steps`
- [ ] The step count in any summary or overview text within the file (if present) reflects 7 steps, not 6
- [ ] No other step numbers were accidentally changed

**Step 1: Read the file to find all references to the old Step 6**

Read `skills/design-document/SKILL.md`. Search for:
- `### Step 6: Suggest Next Steps` (the heading to rename)
- Any body text that says "Step 6" in the context of Suggest Next Steps (e.g., "After the document is approved" preamble if it cross-references a step number)

**Step 2: Rename the heading**

Use Edit:
- `old_string`: `### Step 6: Suggest Next Steps`
- `new_string`: `### Step 7: Suggest Next Steps`

**Step 3: Fix any body references**

If "Step 6" appears in body text referring to Suggest Next Steps (e.g., "proceed to Step 6"), update those references to "Step 7". The new Standards Cross-Check section added in Task 2 already refers to "Step 7" so no changes are needed there.

**Step 4: Commit**

```bash
git add skills/design-document/SKILL.md
git commit -m "feat: renumber Suggest Next Steps from Step 6 to Step 7 — #206"
```

---

### Task 4: Add Standards option to Design category in `skills/settings/SKILL.md`

**Files:**
- Modify: `skills/settings/SKILL.md`

**Quality Constraints:**
- Design-first: `skills/settings/SKILL.md` is >150 lines — read the full file, identify exact `old_string` boundaries for all three insertion points (dashboard, Design Category AskUserQuestion, Step 5 edit UI), and state the plan before making any Edit call
- Pattern: AskUserQuestion options must not exceed 4 total (project gotcha documented in `.feature-flow.yml`). The Design category currently has 2 options ("Design preferences" and "Back"). Adding "Standards" brings it to 3 — within limit.
- Pattern: Follow the existing Step 5 edit UI sub-section format (heading `#### 5X:`, three-step sub-flows with sub-headings like `**Step 5X-1`), confirmation string, and loop-back instruction
- Error handling: exceptions — if `.feature-flow.yml` Edit fails, fall back to Write (matches pattern in existing skill Error Handling table)
- Type narrowness: N/A — Markdown instructions
- Function length: The new edit UI (5H) must be self-contained; do not repeat logic already in Task 2 — reference the design-document skill's auto-discovery behavior where relevant
- Files modified: `skills/settings/SKILL.md` (design-first flag applies)
- Parallelizable: No — depends on Tasks 1–3 completing (schema must exist before settings references it)

**Acceptance Criteria:**
- [ ] The Step 2 dashboard "Design" section includes a `Standards` row showing file count and enabled/disabled status (e.g., `"2 files, enabled"` or `"disabled"` or `"not configured"`)
- [ ] The Design Category AskUserQuestion in Step 4 has exactly 3 options: "Design preferences", "Standards", and "Back"
- [ ] A new `#### 5H: Standards (\`standards.*\`)` section exists in Step 5
- [ ] 5H Step 1 — enable/disable: `AskUserQuestion` with "Enable" and "Disable" options; writes `standards.enabled: true` or `standards.enabled: false`
- [ ] 5H Step 2 — file management: `AskUserQuestion` with "Add file", "Remove file", and "Back" options (3 options — within limit)
- [ ] "Add file" sub-flow: scan for discoverable files (same 5 target filenames, same exclusions as design-document skill), present found paths plus a manual entry option; write selected path to `standards.files` list
- [ ] "Remove file" sub-flow: list current `standards.files` as options; remove selected path from the list; if list becomes empty, announce that auto-discovery will trigger on next design-document run
- [ ] Each save writes to `.feature-flow.yml` using Edit, with fallback to Write if Edit fails
- [ ] Confirmation string format: `"Standards updated: [enabled/disabled]"` or `"Standards files: [path] added"` or `"Standards files: [path] removed"`
- [ ] After any save, control returns to Step 3 (category selection) per the existing Save and Return Loop
- [ ] The Setting Definitions Reference table at the bottom of the file includes a row for Standards with YAML path `standards.*` and default `_(absent = auto-discovery on next design-document run)_`
- [ ] Grep for `Standards` in `skills/settings/SKILL.md` returns at least 5 matches

**Edge Case Criteria:**
- [ ] "Remove file" when `standards.files` is empty or absent: announce `"No standards files configured."` and return to category selection without error
- [ ] "Add file" when scan finds no discoverable files: present only the manual entry option; if user provides a path that does not exist on disk, warn `"File not found: [path]. Add anyway?"` with Yes/No options before writing

**Step 1: Read the full settings SKILL.md and plan all three edit locations**

Read `skills/settings/SKILL.md` in full. Identify exact `old_string` values for:

1. **Dashboard insertion point** — the line(s) inside the "Design" dashboard block where `Standards` row will be added (after the existing `Design preferences` row)
2. **Design Category AskUserQuestion** — the exact text of the current `#### Design Category` options block (currently has "Design preferences" + "Back")
3. **Step 5 insertion point** — the heading line of `#### 5E: Tool Selector` (the new `#### 5H` section inserts before this, or after `#### 5D: Design Preferences` — confirm by reading)
4. **Setting Definitions Reference table** — the last row before the closing `---`

State all four insertion points explicitly before making any Edit call.

**Step 2: Add Standards row to the dashboard (Step 2)**

In the Step 2 dashboard display, inside the "Design" section, add after the `Design preferences` line:

```
  Standards           [standards file count and enabled/disabled, e.g. "2 files, enabled" or "disabled" or "not configured"]
```

**Step 3: Add "Standards" option to Design Category AskUserQuestion (Step 4)**

Update the Design Category section from:

```
AskUserQuestion: "Which Design setting?"
Options:
- "Design preferences" with description: "Edit or reset the 5 code-style preferences (currently: [N] of 5 set)"
- "Back" with description: "Return to category selection"
```

To:

```
AskUserQuestion: "Which Design setting?"
Options:
- "Design preferences" with description: "Edit or reset the 5 code-style preferences (currently: [N] of 5 set)"
- "Standards" with description: "Standards files for design cross-checks (currently: [N files, enabled/disabled/not configured])"
- "Back" with description: "Return to category selection"
```

**Step 4: Add the 5H edit UI section**

Insert the new `#### 5H: Standards` section after `#### 5D: Design Preferences` (and its closing `---`) but before `#### 5E: Tool Selector`. The full section text:

```markdown
#### 5H: Standards (`standards.*`)

Three-step flow: enable/disable, then file management.

**Step 5H-1 — Enable/disable:**

```
AskUserQuestion: "Enable the Standards Cross-Check in the design-document skill?"
Options:
- "Enable" with description: "Cross-check designs against configured standards files"
- "Disable" with description: "Skip the cross-check — standards files are preserved for later"
```

Write `standards.enabled: true` or `standards.enabled: false` to `.feature-flow.yml`.

If the user selects "Disable": write and confirm. Return to Step 3.
If the user selects "Enable": continue to Step 5H-2.

**Step 5H-2 — File management:**

```
AskUserQuestion: "Manage standards files:"
Options:
- "Add file" with description: "Add a standards file to the cross-check list"
- "Remove file" with description: "Remove a file from the list"
- "Back" with description: "Return to category selection"
```

**If "Add file":**

Scan `.claude/`, `docs/`, and the project root for files named `architecture.md`, `conventions.md`, `standards.md`, `coding-standards.md`, or `style-guide.md` (case-insensitive). Exclude any file named `CLAUDE.md`. Remove paths already in `standards.files`.

Present discovered paths as options. Always include "Enter path manually" as a final option (using the AskUserQuestion "Other" field). Limit presented options to 3 discovered paths to stay within the 4-option limit (3 discovered + "Enter path manually").

If the user selects a discovered path: append it to `standards.files` in `.feature-flow.yml`.

If the user selects "Enter path manually": accept the typed path. If the file does not exist on disk, confirm with:

```
AskUserQuestion: "File not found at [path]. Add anyway?"
Options:
- "Yes, add it" with description: "Path will be saved; file must exist when design-document runs"
- "No, cancel" with description: "Return to file management without saving"
```

If no files are discovered and user cancels manual entry: return to Step 5H-2 without saving.

**Confirmation:** `"Standards files: [path] added"`

**If "Remove file":**

If `standards.files` is absent or empty: announce `"No standards files configured."` Return to category selection.

Otherwise, present each current path as an option (up to 3 paths per question if more than 3; present in batches). User selects which to remove. Delete that path from the `standards.files` list.

If the list becomes empty after removal: announce `"No standards files remain. Auto-discovery will trigger on the next design-document run."` Do not set `enabled: false` automatically — preserve the user's explicit `enabled` preference.

**Confirmation:** `"Standards files: [path] removed"`

---
```

**Step 5: Add Standards row to Setting Definitions Reference table**

Add a new row to the table at the bottom of the file:

```markdown
| 10 | Standards | `standards.*` | _(absent = auto-discovery on next design-document run)_ |
```

Update any existing count reference (e.g., "9 settings" in Step 1) to "10 settings".

**Step 6: Commit**

```bash
git add skills/settings/SKILL.md
git commit -m "feat: add Standards option to Design category in settings skill — #206"
```

---

### Task 5: Commit planning artifacts

**Files:**
- Modify: `.feature-flow.yml` (already modified by the session — `M` in git status)
- Add: `docs/plans/2026-04-01-standards-cross-check-plan.md` (this file)

**Quality Constraints:**
- Pattern: Use the standard planning artifact commit message format used in this repo
- Parallelizable: No — must run after all implementation tasks are defined

**Acceptance Criteria:**
- [ ] `git status` shows no untracked or unstaged changes to `docs/plans/2026-04-01-standards-cross-check-plan.md`
- [ ] `git status` shows no untracked or unstaged changes to `.feature-flow.yml`
- [ ] `git log --oneline -1` shows a commit message referencing issue #206

**Step 1: Stage planning artifacts**

```bash
git add docs/plans/2026-04-01-standards-cross-check-plan.md
git add docs/plans/2026-04-01-standards-cross-check.md
git add .feature-flow.yml
```

**Step 2: Commit**

```bash
git commit -m "docs: add Standards Cross-Check design doc and implementation plan — #206"
```

---
