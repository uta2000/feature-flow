# Split xml-plan-format.md Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split `references/xml-plan-format.md` (341 lines) into two files to stay under the 300-line project guideline.

**Architecture:** Extract the Detection Algorithm, Error Handling, and Edge Cases sections (~77 lines) into a new `references/xml-plan-format-runtime.md`. Update the main file with a cross-reference and update 3 dependent skill files.

**Tech Stack:** Markdown file editing, shell verification commands.

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Create references/xml-plan-format-runtime.md — STATUS: pending
Task 2: Update references/xml-plan-format.md — STATUS: pending
Task 3: Update skills/verify-plan-criteria/SKILL.md — STATUS: pending
Task 4: Update skills/verify-acceptance-criteria/SKILL.md — STATUS: pending
Task 5: Update skills/start/references/yolo-overrides.md — STATUS: pending
CURRENT: none
-->

> **After compaction:** Read only the PROGRESS INDEX above to determine current task. Then read only the section for that task.
> **Tool parameter types:** Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

---

### Task 1: Create references/xml-plan-format-runtime.md

**Files:**
- Create: `references/xml-plan-format-runtime.md`

**Quality Constraints:**
- Parallelizable: no (Task 2 depends on this)
- Design-first: no (new file, no existing content to reason about)

**Step 1: Write the failing test**

```bash
ls references/xml-plan-format-runtime.md
```

Expected: `ls: cannot access ...` or file not found.

**Step 2: Run test to verify it fails**

Run: `ls references/xml-plan-format-runtime.md`
Expected: error (file does not exist)

**Step 3: Create the file**

Create `references/xml-plan-format-runtime.md` with this exact content:

```markdown
# XML Plan Format — Runtime Reference

Detection algorithm, error handling rules, and edge cases for the XML plan format. See `references/xml-plan-format.md` for the canonical schema and authoring guide.

<!-- section: detection-algorithm -->
## Detection Algorithm

The detection algorithm determines whether a plan file should be parsed as XML or prose. It runs once per plan file load.

### Steps

1. **Read the first 50 lines** of the plan file.
2. **Track code-fence state.** Maintain a boolean `in_fence`, initially `false`. For each line, if the line starts with ` ``` `, toggle `in_fence`.
3. **For each non-fenced line** (where `in_fence` is `false`): check whether the line matches the pattern `/^<plan version="/`.
4. **If a match is found** in the first 50 lines (outside a code fence) → candidate XML mode.
5. **Truncation guard:** Before committing to XML mode, scan the **full file** for the closing `</plan>` tag. If `</plan>` is absent → log `"plan appears truncated — treating as prose"` and use prose mode.
6. If `</plan>` is present → **XML mode confirmed**.
7. If no match was found in step 3 → **Prose mode**.

### Canonical Detection Pattern

```
/^<plan version="/
```

- Requires the `version` attribute to be present immediately after `<plan `.
- A bare `<plan>` tag (no `version=`) does **not** match and is treated as prose.
- The pattern is anchored to the start of the line (`^`) — inline occurrences do not trigger detection.
- Lines inside a code fence are skipped — the code-fence tracking in step 2 prevents false positives from XML examples embedded in prose plans.

<!-- /section: detection-algorithm -->

<!-- section: error-handling -->
## Error Handling

Error handling splits into two categories: **malformed XML triggers** that cause a full fallback to prose mode, and **per-criterion flags** that are reported inline without abandoning XML mode.

### Malformed XML Triggers (Full Fallback to Prose)

The following conditions indicate the XML structure is broken beyond recoverable inline repair. When any of these occur, the parser logs the specific error, abandons XML extraction, and re-parses the file using the prose parser.

| Condition | Log message |
|-----------|-------------|
| `</plan>` absent from full file (truncated) | `"plan appears truncated — treating as prose"` |
| `<task>` block not closed before next `<task>` or `</plan>` | `"malformed task block at id N — falling back to prose"` |
| `<criteria>` block not closed before `</task>` | `"malformed criteria block in task N — falling back to prose"` |
| Duplicate task IDs | `"duplicate task ID N — plan is invalid, falling back to prose"` |
| `<task>` opened after last `</task>` but before `</plan>` with no matching `</task>` | `"malformed task block at id N — falling back to prose"` |

> **Note:** `</plan>` presence (step 5 of the Detection Algorithm) is a necessary but not sufficient condition — unclosed `<task>` blocks after `</plan>` is present are caught separately during extraction (row 2 above).

### Per-Criterion Flags (Inline, No Fallback)

The following conditions are recoverable at the criterion level. The parser flags the individual criterion but continues processing the rest of the plan in XML mode.

| Condition | Behavior |
|-----------|----------|
| Missing `<what>`, `<how>`, or `<command>` inside a non-manual `<criterion>` | Flag criterion as `"incomplete criterion"` |
| `<criteria>` present but contains no `<criterion>` children | Flag task with `"no criteria"` |
| Unexpected `status=` value on `<task>` | Treat as `pending`, log note |
| Missing `status=` on `<task>` | Treat as `pending` |

<!-- /section: error-handling -->

<!-- section: edge-cases -->
## Edge Cases

| Scenario | Behavior |
|----------|----------|
| `<plan version="` inside a code fence | Detection skips fenced lines (code-fence tracking in step 2). No false positive — file is treated as prose. |
| Prose content after `</plan>` | Ignored in XML mode. The parser stops reading task data at `</plan>`. |
| Duplicate task IDs | Triggers full fallback to prose. Log: `"duplicate task ID N — plan is invalid, falling back to prose"`. |
| `<task>` without `status=` | Treated as `pending`. No error. |
| `<task>` with unrecognized `status=` value | Treated as `pending`. Log note. |
| `</plan>` present but no `<task>` elements | Valid empty plan. Zero tasks returned. |
| Manual criterion with `<how>` or `<command>` present | Fields are ignored (not validated, not surfaced). No error. |
| Plan file is empty | No match in first 50 lines → prose mode. |
| Plan file shorter than 50 lines | Algorithm reads all available lines; no error if file ends early. |
| Plan file is exactly 50 lines | Algorithm reads all 50 lines; line 50 is included in the scan (range is 1–50 inclusive). |

<!-- /section: edge-cases -->
```

**Step 4: Verify acceptance criteria**

Run:
```bash
ls references/xml-plan-format-runtime.md
grep -q 'Detection Algorithm' references/xml-plan-format-runtime.md && echo "PASS" || echo "FAIL"
grep -q 'Malformed XML' references/xml-plan-format-runtime.md && echo "PASS" || echo "FAIL"
grep -q 'Edge Cases' references/xml-plan-format-runtime.md && echo "PASS" || echo "FAIL"
```
Expected: file exists, all 3 grep PASS.

**Step 5: Commit**

```bash
git add references/xml-plan-format-runtime.md
git commit -m "feat: create xml-plan-format-runtime.md with detection/error/edge sections"
```

**Acceptance Criteria:**
- [ ] `ls references/xml-plan-format-runtime.md` exits 0
- [ ] `grep -q 'Detection Algorithm' references/xml-plan-format-runtime.md` exits 0
- [ ] `grep -q 'Malformed XML' references/xml-plan-format-runtime.md` exits 0
- [ ] `grep -q 'Edge Cases' references/xml-plan-format-runtime.md` exits 0

---

### Task 2: Update references/xml-plan-format.md

**Files:**
- Modify: `references/xml-plan-format.md` (remove sections 167–243, add cross-reference)

**Quality Constraints:**
- Parallelizable: no (depends on Task 1 being complete first)
- Design-first: yes (file is 341 lines — output a change plan before any Edit call)

**Design-first change plan (pre-approved):**

Replace the extracted sections block (lines 167–243, from `<!-- section: detection-algorithm -->` through `<!-- /section: edge-cases -->`) with a short cross-reference block:

```markdown
<!-- section: runtime-reference -->
## Runtime Reference

The detection algorithm, error handling rules, and edge cases are documented in
`references/xml-plan-format-runtime.md`.

<!-- /section: runtime-reference -->
```

This replaces ~77 lines with ~7 lines, bringing the file from 341 lines to ~271 lines.

**Step 1: Write failing test**

```bash
grep -q 'xml-plan-format-runtime' references/xml-plan-format.md && echo "PASS" || echo "FAIL"
```
Expected: FAIL (cross-reference not yet present)

**Step 2: Run test to verify it fails**

Run the command above. Expected: `FAIL`.

**Step 3: Edit the file**

In `references/xml-plan-format.md`, replace the block from `<!-- section: detection-algorithm -->` through `<!-- /section: edge-cases -->` (the entire ~77-line block) with:

```
<!-- section: runtime-reference -->
## Runtime Reference

The detection algorithm, error handling rules, and edge cases are documented in
`references/xml-plan-format-runtime.md`.

<!-- /section: runtime-reference -->
```

Also update line 3 (the header description) to mention the runtime file:

Old:
```
This file defines the canonical XML plan format, its detection algorithm, error handling rules, and edge cases. It is referenced by `skills/verify-plan-criteria/SKILL.md`, `skills/verify-acceptance-criteria/SKILL.md`, and `skills/start/references/yolo-overrides.md`.
```

New:
```
This file defines the canonical XML plan format schema and authoring guide. Runtime details (detection algorithm, error handling, edge cases) are in `references/xml-plan-format-runtime.md`. Referenced by `skills/verify-plan-criteria/SKILL.md`, `skills/verify-acceptance-criteria/SKILL.md`, and `skills/start/references/yolo-overrides.md`.
```

**Step 4: Verify acceptance criteria**

Run:
```bash
wc -l references/xml-plan-format.md | awk '{print ($1 <= 300)}'
grep -q 'xml-plan-format-runtime' references/xml-plan-format.md && echo "PASS" || echo "FAIL"
```
Expected: `1` (≤300 lines), `PASS`.

**Step 5: Commit**

```bash
git add references/xml-plan-format.md
git commit -m "refactor: extract runtime sections to xml-plan-format-runtime.md"
```

**Acceptance Criteria:**
- [ ] `wc -l references/xml-plan-format.md | awk '{print ($1 <= 300)}'` outputs `1`
- [ ] `grep -q 'xml-plan-format-runtime' references/xml-plan-format.md` exits 0

---

### Task 3: Update skills/verify-plan-criteria/SKILL.md

**Files:**
- Modify: `skills/verify-plan-criteria/SKILL.md` (add runtime file reference near line 23)

**Quality Constraints:**
- Parallelizable: yes (independent of Tasks 4 and 5)
- Design-first: yes (file is 257 lines)

**Design-first change plan (pre-approved):**

At line 23, the file currently has:
```
See `references/xml-plan-format.md` for the canonical specification and complete field reference.
```

Append a new line immediately after it:
```
See `references/xml-plan-format-runtime.md` for the detection algorithm, error handling rules, and edge cases.
```

**Step 1: Failing test**

```bash
grep -q 'xml-plan-format-runtime' skills/verify-plan-criteria/SKILL.md && echo "PASS" || echo "FAIL"
```
Expected: FAIL

**Step 2: Run it** — Expected: FAIL

**Step 3: Edit**

In `skills/verify-plan-criteria/SKILL.md`, replace:
```
See `references/xml-plan-format.md` for the canonical specification and complete field reference.
```
With:
```
See `references/xml-plan-format.md` for the canonical specification and complete field reference.
See `references/xml-plan-format-runtime.md` for the detection algorithm, error handling rules, and edge cases.
```

**Step 4: Verify**

```bash
grep -q 'xml-plan-format' skills/verify-plan-criteria/SKILL.md && echo "PASS" || echo "FAIL"
grep -q 'xml-plan-format-runtime' skills/verify-plan-criteria/SKILL.md && echo "PASS" || echo "FAIL"
```
Expected: both PASS

**Step 5: Commit**

```bash
git add skills/verify-plan-criteria/SKILL.md
git commit -m "docs: add xml-plan-format-runtime reference to verify-plan-criteria"
```

**Acceptance Criteria:**
- [ ] `grep -q 'xml-plan-format' skills/verify-plan-criteria/SKILL.md` exits 0
- [ ] `grep -q 'xml-plan-format-runtime' skills/verify-plan-criteria/SKILL.md` exits 0

---

### Task 4: Update skills/verify-acceptance-criteria/SKILL.md

**Files:**
- Modify: `skills/verify-acceptance-criteria/SKILL.md` (update line 27 to reference both files)

**Quality Constraints:**
- Parallelizable: yes (independent of Tasks 3 and 5)
- Design-first: yes (file is 195 lines)

**Design-first change plan (pre-approved):**

At line 27, the file currently has:
```
See `references/xml-plan-format.md` for the canonical detection algorithm. Summary:
```

Replace with:
```
See `references/xml-plan-format.md` for the canonical schema. See `references/xml-plan-format-runtime.md` for the detection algorithm, error handling rules, and edge cases. Summary:
```

**Step 1: Failing test**

```bash
grep -q 'xml-plan-format-runtime' skills/verify-acceptance-criteria/SKILL.md && echo "PASS" || echo "FAIL"
```
Expected: FAIL

**Step 2: Run it** — Expected: FAIL

**Step 3: Edit**

In `skills/verify-acceptance-criteria/SKILL.md`, replace:
```
See `references/xml-plan-format.md` for the canonical detection algorithm. Summary:
```
With:
```
See `references/xml-plan-format.md` for the canonical schema. See `references/xml-plan-format-runtime.md` for the detection algorithm, error handling rules, and edge cases. Summary:
```

**Step 4: Verify**

```bash
grep -q 'xml-plan-format' skills/verify-acceptance-criteria/SKILL.md && echo "PASS" || echo "FAIL"
grep -q 'xml-plan-format-runtime' skills/verify-acceptance-criteria/SKILL.md && echo "PASS" || echo "FAIL"
```
Expected: both PASS

**Step 5: Commit**

```bash
git add skills/verify-acceptance-criteria/SKILL.md
git commit -m "docs: add xml-plan-format-runtime reference to verify-acceptance-criteria"
```

**Acceptance Criteria:**
- [ ] `grep -q 'xml-plan-format' skills/verify-acceptance-criteria/SKILL.md` exits 0
- [ ] `grep -q 'xml-plan-format-runtime' skills/verify-acceptance-criteria/SKILL.md` exits 0

---

### Task 5: Update skills/start/references/yolo-overrides.md

**Files:**
- Modify: `skills/start/references/yolo-overrides.md` (add runtime file reference near line 108)

**Quality Constraints:**
- Parallelizable: yes (independent of Tasks 3 and 4)
- Design-first: yes (file is 319 lines)

**Design-first change plan (pre-approved):**

At line 108, the file currently has (in the Writing Plans section):
```
     `references/xml-plan-format.md`. Otherwise, use the existing prose format.
```

After this line, add:
```
     See `references/xml-plan-format-runtime.md` for the detection algorithm, error handling rules, and edge cases.
```

**Step 1: Failing test**

```bash
grep -q 'xml-plan-format-runtime' skills/start/references/yolo-overrides.md && echo "PASS" || echo "FAIL"
```
Expected: FAIL

**Step 2: Run it** — Expected: FAIL

**Step 3: Edit**

In `skills/start/references/yolo-overrides.md`, replace:
```
     `references/xml-plan-format.md`. Otherwise, use the existing prose format.
```
With:
```
     `references/xml-plan-format.md`. Otherwise, use the existing prose format.
     See `references/xml-plan-format-runtime.md` for the detection algorithm, error handling rules, and edge cases.
```

**Step 4: Verify**

```bash
grep -q 'xml-plan-format-runtime' skills/start/references/yolo-overrides.md && echo "PASS" || echo "FAIL"
```
Expected: PASS

**Step 5: Commit**

```bash
git add skills/start/references/yolo-overrides.md
git commit -m "docs: add xml-plan-format-runtime reference to yolo-overrides"
```

**Acceptance Criteria:**
- [ ] `grep -q 'xml-plan-format-runtime' skills/start/references/yolo-overrides.md` exits 0
