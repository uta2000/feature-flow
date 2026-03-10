# XML-Structured Plan Format Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Create references/xml-plan-format.md — STATUS: pending
Task 2: Create test fixtures — STATUS: pending
Task 3: Add XML support to verify-plan-criteria — STATUS: pending
Task 4: Add XML support to verify-acceptance-criteria — STATUS: pending
Task 5: Add XML format guidance to yolo-overrides.md — STATUS: pending
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.
> Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

**Goal:** Introduce optional XML-hybrid plan format enabling deterministic machine parsing of criteria, files, and task status, while preserving full backward compatibility with existing prose plans.

**Architecture:** Add XML detection to both verification skills (check first 50 non-fenced lines for `/^<plan version="/`; require `</plan>` present), with a dual-parser strategy — XML plans use string scanning for deterministic extraction; prose plans route unchanged to existing regex. Create canonical schema reference and test fixtures. Add opt-in authoring guidance to the writing-plans quality context injection.

**Tech Stack:** Markdown/SKILL.md file editing only — no code dependencies, no build steps, no type system. Verification is purely grep-based.

---

### Task 1: Create references/xml-plan-format.md

**Acceptance Criteria:**
- [ ] `references/xml-plan-format.md` is created measured by file existence verified by `ls references/xml-plan-format.md`
- [ ] File contains `<plan version="1.0">` schema example measured by grep match verified by `grep -q '<plan version="1.0">' references/xml-plan-format.md`
- [ ] File documents the canonical detection pattern requiring the version attribute measured by grep match verified by `grep -q 'plan version' references/xml-plan-format.md`
- [ ] File documents code-fence tracking in the detection algorithm measured by grep match verified by `grep -q 'code fence\|code-fence' references/xml-plan-format.md`
- [ ] File documents the truncation guard requiring `</plan>` in the full file measured by grep match verified by `grep -q 'truncation\|truncated' references/xml-plan-format.md`
- [ ] File documents v1 split plan exclusion measured by grep match verified by `grep -q 'split plan' references/xml-plan-format.md`
- [ ] File documents `[MANUAL]` equivalence to `type="manual"` measured by grep match verified by `grep -q 'MANUAL' references/xml-plan-format.md`
- [ ] File documents all malformed XML fallback triggers measured by grep match verified by `grep -q 'malformed\|fallback' references/xml-plan-format.md`
- [ ] File includes a complete annotated XML plan example measured by presence of `<task` and `<criteria>` tags in examples verified by `grep -q '<task' references/xml-plan-format.md && grep -q '<criteria>' references/xml-plan-format.md`

**Quality Constraints:**
- Error handling: N/A — creating a documentation reference file
- Types: N/A — markdown documentation
- Function length: N/A
- Pattern: follow `references/acceptance-criteria-patterns.md` document structure; use clear section headings (Overview, Schema, Detection Algorithm, Error Handling, Edge Cases, Authoring Guide, v1 Constraints)
- Files modified: none (new file only)
- Parallelizable: yes

**Files:**
- Create: `references/xml-plan-format.md`

**Steps:**

1. Create `references/xml-plan-format.md` with the following sections:

   **Overview** — What the XML plan format is, why it exists, that it is opt-in, and that prose plans are unaffected.

   **XML Schema** — Root `<plan version="1.0">` element, `<task id="N" status="...">` element with all attributes, `<title>`, `<files>/<file action="create|modify" path="...">`, `<criteria>/<criterion>` with `<what>/<how>/<command>` children, `<criterion type="manual">`. Include the field reference table from the design document.

   **Complete Example** — Include the full annotated 2-task XML plan example from the design document (one pending task with structured + manual criteria, one done task with commit SHA).

   **Detection Algorithm** — Step-by-step:
   1. Read first 50 lines of plan file
   2. Track code-fence state (toggle on each line starting with ` ``` `)
   3. For each non-fenced line: check if it matches `/^<plan version="/`
   4. If match found → XML mode; else → Prose mode
   5. Before committing to XML mode: scan full file for `</plan>`; if absent → log "plan appears truncated — treating as prose" and use prose mode

   **Canonical detection pattern:** `/^<plan version="/` — requires version attribute; bare `<plan>` (no `version=`) is NOT an XML plan.

   **Error Handling** — Document malformed XML triggers (prose fallback) vs per-criterion flags (inline only):

   Malformed triggers (full fallback):
   - `</plan>` absent from full file (truncated)
   - `<task>` block not closed before next `<task>` or `</plan>`
   - `<criteria>` block not closed before `</task>`

   Per-criterion flags (inline, no fallback):
   - Missing `<what>`, `<how>`, or `<command>` inside non-manual `<criterion>` → "incomplete criterion"
   - `<criteria>` present but no `<criterion>` children → "no criteria"
   - Unexpected `status=` value → treat as `pending`, log note
   - Missing `status=` → treat as `pending`

   **Edge Cases:**
   - Duplicate task IDs → "duplicate task ID — plan is invalid"; abort XML extraction, fall back to prose
   - `<plan version="` inside a code fence → detection skips fenced lines; no false positive
   - Prose content after `</plan>` → ignored in XML mode

   **[MANUAL] Equivalence:**
   The prose `[MANUAL]` prefix on a criterion line and the XML `type="manual"` attribute are equivalent — both mean "manual check, no command required." Both verification skills treat them identically.

   **Authoring Guide** — How to write an XML plan: start with `<plan version="1.0">`, wrap each task in `<task id="N" status="pending">`, put quality constraints and steps as markdown prose inside the task block (outside `<criteria>`), end with `</plan>`.

   **v1 Constraints:**
   - No split plan support: XML plans do not support the `## Phase Manifest` / split plan format. Plans exceeding ~15,000 words must use prose format.
   - No export CLI: prose → XML conversion tool deferred.
   - No GSD mapping: schema is designed to be mappable; actual integration deferred.

2. Verify all grep checks pass.

3. Commit:
   ```bash
   git add references/xml-plan-format.md
   git commit -m "feat(xml-plan): create canonical XML plan format schema reference — ✓file created ✓schema documented ✓detection algorithm ✓error handling"
   ```

---

### Task 2: Create test fixtures

**Acceptance Criteria:**
- [ ] `tests/fixtures/sample-xml-plan.md` is created measured by file existence verified by `ls tests/fixtures/sample-xml-plan.md`
- [ ] XML fixture starts with `<plan version="1.0">` in first 50 lines measured by grep match verified by `grep -q '^<plan version="1.0">' tests/fixtures/sample-xml-plan.md`
- [ ] XML fixture ends with `</plan>` measured by grep match verified by `grep -q '^</plan>' tests/fixtures/sample-xml-plan.md`
- [ ] XML fixture contains a task with `status="pending"` measured by grep match verified by `grep -q 'status="pending"' tests/fixtures/sample-xml-plan.md`
- [ ] XML fixture contains a task with `status="done"` measured by grep match verified by `grep -q 'status="done"' tests/fixtures/sample-xml-plan.md`
- [ ] XML fixture contains a structured criterion with `<what>`, `<how>`, and `<command>` measured by grep matches verified by `grep -q '<what>' tests/fixtures/sample-xml-plan.md && grep -q '<how>' tests/fixtures/sample-xml-plan.md && grep -q '<command>' tests/fixtures/sample-xml-plan.md`
- [ ] XML fixture contains a manual criterion with `type="manual"` measured by grep match verified by `grep -q 'type="manual"' tests/fixtures/sample-xml-plan.md`
- [ ] XML fixture contains both `action="create"` and `action="modify"` measured by grep matches verified by `grep -q 'action="create"' tests/fixtures/sample-xml-plan.md && grep -q 'action="modify"' tests/fixtures/sample-xml-plan.md`
- [ ] `tests/fixtures/sample-prose-plan.md` is created measured by file existence verified by `ls tests/fixtures/sample-prose-plan.md`
- [ ] Prose fixture contains `### Task` heading measured by grep match verified by `grep -q '^### Task' tests/fixtures/sample-prose-plan.md`
- [ ] Prose fixture contains `**Acceptance Criteria:**` section measured by grep match verified by `grep -q 'Acceptance Criteria' tests/fixtures/sample-prose-plan.md`
- [ ] Prose fixture does NOT contain `<plan version=` measured by absence verified by `! grep -q '<plan version=' tests/fixtures/sample-prose-plan.md`
- [ ] Prose fixture contains a `<!-- PROGRESS INDEX` block measured by grep match verified by `grep -q 'PROGRESS INDEX' tests/fixtures/sample-prose-plan.md`

**Quality Constraints:**
- Error handling: N/A — fixture files
- Types: N/A — markdown files
- Function length: N/A
- Pattern: XML fixture follows the design doc complete annotated example; prose fixture follows existing plan file conventions (e.g., `docs/plans/2026-03-09-atomic-git-commits-per-task-169-plan.md`)
- Files modified: none (new files)
- Parallelizable: yes

**Files:**
- Create: `tests/fixtures/sample-xml-plan.md`
- Create: `tests/fixtures/sample-prose-plan.md`

**Steps:**

1. Create the `tests/fixtures/` directory:
   ```bash
   mkdir -p tests/fixtures
   ```

2. Write `tests/fixtures/sample-xml-plan.md` as a 2-task XML plan:

   ```markdown
   # Sample XML Plan

   <plan version="1.0">

   <task id="1" status="pending">
   <title>Add detection to verification skill</title>

   <files>
     <file action="create" path="references/xml-plan-format.md"/>
     <file action="modify" path="skills/verify-plan-criteria/SKILL.md"/>
   </files>

   <criteria>
     <criterion>
       <what>XML plans are detected when plan version appears in first 50 lines</what>
       <how>detection returns XML mode for XML fixture, prose mode for prose fixture</how>
       <command>grep -q '^<plan version="1.0">' tests/fixtures/sample-xml-plan.md</command>
     </criterion>
     <criterion type="manual">XML plan renders cleanly on GitHub with no raw tag artifacts</criterion>
   </criteria>

   **Quality Constraints:**
   - Error handling: fall back to prose parser on malformed XML
   - Types: all parsed fields are strings, never undefined
   - Parallelizable: yes

   **Steps:**
   1. Read the plan file
   2. Check for XML format
   3. Route to correct parser

   </task>

   <task id="2" status="done" commit="abc1234">
   <title>Create test fixtures</title>

   <files>
     <file action="create" path="tests/fixtures/sample-xml-plan.md"/>
     <file action="modify" path="tests/fixtures/sample-prose-plan.md"/>
   </files>

   <criteria>
     <criterion>
       <what>XML fixture file exists at tests/fixtures/sample-xml-plan.md</what>
       <how>file system presence</how>
       <command>ls tests/fixtures/sample-xml-plan.md</command>
     </criterion>
   </criteria>

   **Steps:**
   1. Create fixtures directory
   2. Write XML fixture
   3. Write prose fixture

   </task>

   </plan>
   ```

3. Write `tests/fixtures/sample-prose-plan.md` as a minimal 2-task prose plan:

   ```markdown
   # Sample Prose Plan

   <!-- PROGRESS INDEX (updated by implementation skills)
   Task 1: Setup — STATUS: pending
   Task 2: Implementation — STATUS: pending
   CURRENT: none
   -->

   > **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.

   **Goal:** Minimal prose plan fixture for testing backward compatibility.

   ---

   ### Task 1: Setup

   **Acceptance Criteria:**
   - [ ] Configuration file exists measured by file existence verified by `ls config.yml`
   - [ ] [MANUAL] Setup completes without errors

   **Quality Constraints:**
   - Error handling: N/A
   - Parallelizable: yes

   **Files:**
   - Create: `config.yml`

   **Steps:**
   1. Create config file
   2. Verify it exists

   ---

   ### Task 2: Implementation

   **Acceptance Criteria:**
   - [ ] Feature function is exported measured by export presence verified by `grep -q 'export' src/feature.ts`

   **Quality Constraints:**
   - Error handling: typed errors
   - Parallelizable: no

   **Files:**
   - Create: `src/feature.ts`

   **Steps:**
   1. Write the implementation
   2. Verify exports
   ```

4. Verify all grep checks pass.

5. Commit:
   ```bash
   git add tests/fixtures/
   git commit -m "feat(xml-plan): add XML and prose plan test fixtures — ✓XML fixture ✓prose fixture ✓both status values ✓both criterion types ✓both file actions"
   ```

---

### Task 3: Add XML support to verify-plan-criteria

**Acceptance Criteria:**
- [ ] `skills/verify-plan-criteria/SKILL.md` contains the canonical detection pattern documentation measured by grep match verified by `grep -q 'plan version' skills/verify-plan-criteria/SKILL.md`
- [ ] Skill documents code-fence tracking in the detection algorithm measured by grep match verified by `grep -q 'code fence\|code-fence' skills/verify-plan-criteria/SKILL.md`
- [ ] Skill documents the truncation guard requiring `</plan>` measured by grep match verified by `grep -q 'truncation\|truncated' skills/verify-plan-criteria/SKILL.md`
- [ ] Skill documents XML extraction of `<task>` blocks measured by grep match verified by `grep -q '<task' skills/verify-plan-criteria/SKILL.md`
- [ ] Skill documents XML extraction of `<criteria>/<criterion>` blocks measured by grep match verified by `grep -q '<criteria>' skills/verify-plan-criteria/SKILL.md`
- [ ] Skill documents malformed XML fallback to prose parser measured by grep match verified by `grep -q 'malformed' skills/verify-plan-criteria/SKILL.md`
- [ ] Skill documents `type="manual"` and `[MANUAL]` equivalence measured by grep match verified by `grep -q 'type="manual"' skills/verify-plan-criteria/SKILL.md`
- [ ] Skill documents duplicate task ID detection and prose fallback measured by grep match verified by `grep -q 'duplicate' skills/verify-plan-criteria/SKILL.md`
- [ ] Existing `### Task N:` prose parsing text is still present (backward compat) measured by grep match verified by `grep -q 'Task N' skills/verify-plan-criteria/SKILL.md`
- [ ] Existing `**Acceptance Criteria:**` prose extraction text is still present measured by grep match verified by `grep -q 'Acceptance Criteria' skills/verify-plan-criteria/SKILL.md`

**Quality Constraints:**
- Error handling: new XML sections must document all malformed triggers and per-criterion error behaviors from the design doc
- Types: N/A — skill file (markdown)
- Function length: N/A
- Pattern: new sections follow the existing Step 1/Step 2/Step 3 structure of the skill; Format Detection section added before Step 1
- Files modified: `skills/verify-plan-criteria/SKILL.md` (198 lines, design-first)
- Design-first files: `skills/verify-plan-criteria/SKILL.md` — output change plan before any edit
- Parallelizable: yes

**Files:**
- Modify: `skills/verify-plan-criteria/SKILL.md`

**Steps:**

1. Read the full `skills/verify-plan-criteria/SKILL.md`.

2. **Output change plan before editing:**
   - Where to add: Insert a new `## Format Detection` section between the "When to Use" section and "## Process / Step 1: Find the Plan File"
   - What to add to Step 2 (Parse Tasks): add XML branch before the existing prose parsing block — if XML mode, extract `<task>` blocks and their children; else existing regex logic
   - What to add to Step 3 (Check Each Task): note that XML criteria arrive pre-extracted as `{what, how, command}` objects; map to same validation; `type="manual"` ≡ `[MANUAL]`
   - Steps 4-6 are prose-path only — note at the top of Step 4 that XML plans surface inline flags instead of drafts

3. Insert `## Format Detection` section after the "When to Use" section with this content:

   ```
   ## Format Detection

   Before parsing, determine which format the plan file uses:

   1. Read the first 50 lines of the plan file
   2. Track code-fence state: toggle `in_fence` on each line that starts with ` ``` `
   3. For each non-fenced line: check if it matches `/^<plan version="/`
   4. If match found → **XML mode**
   5. Before committing to XML mode: scan the full file for `</plan>`. If absent → log warning
      "plan appears truncated — treating as prose" and use **Prose mode**
   6. If no match in first 50 lines → **Prose mode** (existing behavior unchanged)

   **Canonical detection pattern:** `/^<plan version="/` — requires the `version=` attribute.
   A bare `<plan>` tag (no `version=`) is NOT treated as an XML plan.

   ### XML Extraction Algorithm

   If XML mode:

   1. Find all `<task id="N" status="...">` blocks (string scan — no XML library)
   2. **Duplicate ID check:** If any `id=` value appears more than once → flag "duplicate task ID —
      plan is invalid" and fall back to prose parser
   3. For each task block:
      - Extract `<title>` content → task name
      - Extract `<files>` → list of `{action, path}` objects from `<file>` elements
      - Extract `<criteria>` → list of criterion objects:
        - Structured: `{what, how, command}` from child `<what>/<how>/<command>` elements
        - Manual: `{type: "manual", text: ...}` from `<criterion type="manual">` text content
      - Read `status` attribute → replaces Progress Index parsing
   4. If a `<task>` block is not closed before the next `<task>` or `</plan>` → **malformed**, fall
      back to prose parser with announcement: "XML structure invalid — falling back to prose parser"
   5. If a `<criteria>` block is not closed before `</task>` → **malformed**, same fallback
   6. `status=` values: `pending`, `in-progress`, `done` are recognized; any other value → treat as
      `pending` and log a note; missing `status=` → treat as `pending`

   **[MANUAL] equivalence:** `<criterion type="manual">` and a `[MANUAL]`-prefixed prose criterion
   are equivalent — both mean "manual check, no command required." Treat them identically.

   **Prose mode:** If prose mode is selected, the existing Step 2 logic runs unchanged. The
   detection check is the single gate — once prose mode is selected, no XML logic executes.
   ```

4. Update Step 2 (`Parse Tasks`) — add the XML branch at the top:

   ```
   **XML plans (detected in Format Detection):**
   Use the extraction algorithm from the Format Detection section above. For each extracted task,
   proceed to Step 3 with the pre-extracted criterion objects.

   **Prose plans (existing behavior):**
   [existing Step 2 content unchanged]
   ```

5. Update Step 3 (`Check Each Task`) — add XML criteria handling at the top:

   ```
   **XML criteria (pre-extracted):**
   XML criteria arrive as `{what, how, command}` objects (or `{type: "manual", text}` for manual).
   - Structured criteria: validate that `what`, `how`, and `command` are non-empty strings. If any
     is empty → flag as "incomplete criterion" (inline, do not trigger fallback).
   - `<criteria>` present but zero `<criterion>` children → flag as "no criteria"
   - `type="manual"` criteria: no format validation required (equivalent to `[MANUAL]`)

   **Prose criteria (existing behavior):**
   [existing Step 3 content unchanged]
   ```

6. Add a note at the top of Step 4 (`Draft Missing Criteria`):

   ```
   **Note:** Step 4 applies to prose plans only. XML plans surface inline flags (see Step 3).
   If the plan is XML mode, skip Steps 4 and 5 and proceed to Step 6 (Report).
   ```

7. Verify all grep checks pass.

8. Commit after verifying each criterion:
   ```bash
   git add skills/verify-plan-criteria/SKILL.md
   git commit -m "feat(xml-plan): add XML detection and extraction to verify-plan-criteria — ✓detection pattern ✓code-fence tracking ✓truncation guard ✓task extraction ✓criterion extraction ✓malformed fallback ✓duplicate ID ✓MANUAL equivalence"
   ```

---

### Task 4: Add XML support to verify-acceptance-criteria

**Acceptance Criteria:**
- [ ] `skills/verify-acceptance-criteria/SKILL.md` contains the canonical detection pattern documentation measured by grep match verified by `grep -q 'plan version' skills/verify-acceptance-criteria/SKILL.md`
- [ ] Skill documents code-fence tracking in detection measured by grep match verified by `grep -q 'code fence\|code-fence' skills/verify-acceptance-criteria/SKILL.md`
- [ ] Skill documents the truncation guard requiring `</plan>` measured by grep match verified by `grep -q 'truncation\|truncated' skills/verify-acceptance-criteria/SKILL.md`
- [ ] Skill documents XML extraction of `<criterion>` elements without regex measured by grep match verified by `grep -q '<criterion>' skills/verify-acceptance-criteria/SKILL.md`
- [ ] Skill documents task status from `status=` attribute replacing Progress Index parsing measured by grep match verified by `grep -q 'status=' skills/verify-acceptance-criteria/SKILL.md`
- [ ] Skill documents `type="manual"` and `[MANUAL]` equivalence measured by grep match verified by `grep -q 'type="manual"' skills/verify-acceptance-criteria/SKILL.md`
- [ ] Skill documents malformed XML fallback to prose parser measured by grep match verified by `grep -q 'malformed' skills/verify-acceptance-criteria/SKILL.md`
- [ ] Existing `**Acceptance Criteria:**` prose extraction text is still present measured by grep match verified by `grep -q 'Acceptance Criteria' skills/verify-acceptance-criteria/SKILL.md`

**Quality Constraints:**
- Error handling: fallback to prose parser must be documented for all malformed XML triggers
- Types: N/A — skill file (markdown)
- Function length: N/A
- Pattern: use same `## Format Detection` section structure as Task 3 (reference `references/xml-plan-format.md`); add XML branch to Step 2 extraction
- Files modified: `skills/verify-acceptance-criteria/SKILL.md` (146 lines)
- Parallelizable: yes

**Files:**
- Modify: `skills/verify-acceptance-criteria/SKILL.md`

**Steps:**

1. Read the full `skills/verify-acceptance-criteria/SKILL.md`.

2. **Output change plan before editing:**
   - Where to add `## Format Detection`: after the "When to Use" section, before "## Process / Step 0"
   - What to add to Step 1 (Find the Plan File): note that XML/prose detection runs after reading the file
   - What to add to Step 2 (Extract Acceptance Criteria): XML branch — extract from `<criterion>` elements; read task status from `status=` attribute; `type="manual"` ≡ `[MANUAL]`
   - Steps 3-5 remain unchanged (task-verifier receives same flat list regardless of source format)

3. Insert `## Format Detection` section after "When to Use" with this content (same algorithm as Task 3, referencing canonical spec):

   ```
   ## Format Detection

   Before extracting criteria, determine which format the plan file uses.

   See `references/xml-plan-format.md` for the canonical detection algorithm. Summary:

   1. Read first 50 lines; track code-fence state
   2. For each non-fenced line: check for `/^<plan version="/`
   3. Match found → XML mode (then verify `</plan>` present; absent → prose fallback)
   4. No match → Prose mode (existing behavior unchanged)

   ### XML Extraction

   For XML plans:

   1. Extract `<task id="N" status="...">` blocks
   2. For each task:
      - Task status: read `status=` attribute (`pending`/`in-progress`/`done`) — replaces Progress
        Index comment parsing. Missing or unexpected `status=` → treat as `pending`.
      - Criteria: extract `<criterion>` elements from `<criteria>` block:
        - Structured: `{what, how, command}` from `<what>/<how>/<command>` children — no regex needed
        - Manual: `type="manual"` attribute → treat as `[MANUAL]` (CANNOT_VERIFY)
   3. Pass the extracted flat criterion list to Step 3 (task-verifier) — same format as prose path

   **Malformed XML:** if `</plan>` is absent, or `<task>` / `<criteria>` blocks are unclosed →
   announce "XML structure invalid — falling back to prose parser" and use prose mode.

   **Prose mode:** existing Step 1-5 logic runs unchanged.
   ```

4. Update Step 2 (`Extract Acceptance Criteria`) — add XML branch at the top:

   ```
   **XML plans:** Use the XML Extraction algorithm from the Format Detection section above. Build
   the same flat criterion list (task number, title, criterion items) as the prose path produces —
   the task-verifier in Step 3 receives an identical input regardless of source format.

   **Prose plans (existing behavior):**
   [existing Step 2 content unchanged]
   ```

5. Verify all grep checks pass.

6. Commit:
   ```bash
   git add skills/verify-acceptance-criteria/SKILL.md
   git commit -m "feat(xml-plan): add XML detection and extraction to verify-acceptance-criteria — ✓detection pattern ✓criterion extraction ✓status attribute ✓MANUAL equivalence ✓malformed fallback"
   ```

---

### Task 5: Add XML format guidance to yolo-overrides.md

**Acceptance Criteria:**
- [ ] `skills/start/references/yolo-overrides.md` contains XML plan format opt-in guidance measured by grep match verified by `grep -q 'XML plan format' skills/start/references/yolo-overrides.md`
- [ ] Guidance is scoped per-plan (specifies "already begins with" current file) measured by grep match verified by `grep -q 'already begins with' skills/start/references/yolo-overrides.md`
- [ ] Guidance instructs suppression of Progress Index for XML plans measured by grep match verified by `grep -qi 'suppress.*Progress Index\|Progress Index.*suppress\|suppress.*PROGRESS INDEX\|Do NOT generate.*PROGRESS INDEX' skills/start/references/yolo-overrides.md`
- [ ] Guidance appears inside the `## Writing Plans Quality Context Injection` section measured by section proximity verified by `grep -n 'Writing Plans Quality Context\|XML plan format' skills/start/references/yolo-overrides.md`
- [ ] Existing Progress Index requirement text for prose plans is still present measured by grep match verified by `grep -q 'Progress Index header required' skills/start/references/yolo-overrides.md`
- [ ] Guidance references `references/xml-plan-format.md` as the schema source measured by grep match verified by `grep -q 'references/xml-plan-format.md' skills/start/references/yolo-overrides.md`

**Quality Constraints:**
- Error handling: N/A — documentation addition
- Types: N/A — markdown file
- Function length: N/A
- Pattern: use the exact wording from the design doc `Skills Modification Design — Writing-plans quality context injection update` section; insert as a new numbered point in the existing list
- Files modified: `skills/start/references/yolo-overrides.md` (311 lines, design-first)
- Design-first files: `skills/start/references/yolo-overrides.md` — output change plan before any edit
- Parallelizable: yes

**Files:**
- Modify: `skills/start/references/yolo-overrides.md`

**Steps:**

1. Read the full `skills/start/references/yolo-overrides.md`.

2. **Output change plan before editing:**
   - Find the `## Writing Plans Quality Context Injection` section
   - Identify the end of the numbered list (currently ends with point 6 — "Plan size constraint")
   - Add a new point 7 (or append after point 6 and before the "Example task" block) with the XML format guidance
   - Do not modify any existing numbered points or the example block

3. Locate the exact end of the numbered list in `## Writing Plans Quality Context Injection`. The list ends with point 6 (`**Plan size constraint**`) and its detail. Insert the following immediately after point 6's closing text (before the `**Example task with quality constraints:**` block):

   ```markdown
   7. **XML plan format (opt-in).** When generating or updating a plan file:

      > **XML plan format (opt-in):** If the user explicitly requests XML format, or if the specific
      > plan file being updated already begins with `<plan version="`, generate in XML format using
      > the schema from `references/xml-plan-format.md`. Otherwise, use the existing prose format.
      >
      > **For XML plans only — suppress Progress Index:** Do NOT generate the `<!-- PROGRESS INDEX -->`
      > HTML comment block. Task status is tracked via the `status=` attribute on `<task>` elements
      > instead.
   ```

4. Verify all grep checks pass.

5. Commit:
   ```bash
   git add skills/start/references/yolo-overrides.md
   git commit -m "feat(xml-plan): add XML plan format guidance to Writing Plans quality context injection — ✓opt-in guidance ✓per-plan scope ✓Progress Index suppression"
   ```
