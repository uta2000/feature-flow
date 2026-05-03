<plan version="1.1">
# design-document Pattern B Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `feature-flow:design-document` from an inline Skill() call to a Pattern B subagent dispatch (orchestrator-owned Explore fanout + consolidator subagent), matching the Pattern A wrapper structure already deployed for `verify-plan-criteria` in PR #262.

**Architecture:** The orchestrator dispatches 3-4 Haiku Explore agents in parallel (hoisted from `skills/design-document/SKILL.md` Step 1), then dispatches a single Sonnet consolidator subagent that invokes `feature-flow:design-document` with a pre-populated `findings_path` arg (skipping the now-hoisted fanout). The skill writes a structured return contract to `phase_summaries.design.return_contract` in the in-progress state file. The validator (`hooks/scripts/validate-return-contract.js`) gains a `design-document` SCHEMAS entry. An inline-fallback (rollout-only) mirrors the `verify-plan-criteria` pattern.

**Tech Stack:** Node.js (validator + tests), Python3 + PyYAML (state-file helpers), Bash (e2e test), Markdown (SKILL.md edits)

**Reference files:**
- `skills/verify-plan-criteria/SKILL.md` (Step 7 contract-write helper — mirror for Task 3)
- `skills/start/SKILL.md:697-751` (Pattern A wrapper — structural template for Task 4)
- `hooks/scripts/validate-return-contract.js` (extend SCHEMAS in Task 2)
- `hooks/scripts/validate-return-contract.test.js` (extend tests in Task 2)
- `hooks/scripts/validate-return-contract.e2e.sh` (extend e2e in Task 6)
- `hooks/scripts/fixtures/valid-verify-plan-criteria.json` (fixture template for Task 2)

---

<task id="1" status="pending">
### Task 1: Lock design-document return contract on issue #251

**Files:**
- No code files modified. Manual-only task.

**Context:** The design-document return contract is specified in `.feature-flow/design/design-decisions.md`. It must be posted as a comment on issue #251 before any code lands — locking the contract prevents schema drift across the PR.

**Acceptance criteria:**
- [ ] `[MANUAL]` GitHub comment URL exists on issue #251 containing the design-document JSON Schema block — measured by: `gh issue view 251 --comments --json comments --jq '.comments[].body' | grep -c '"design-document"'` outputs `>= 1`

**Steps:**

- [ ] **Step 1: Post the locked contract as a comment on #251**

  Run:
  ```bash
  gh issue comment 251 --body "$(cat <<'EOF'
  ## design-document return contract (locked for Pattern B implementation)

  Per the Pattern B conversion plan (Wave 3 phase 3), the `design-document` phase return contract is locked at schema_version 1:

  ```json
  {
    "schema_version": 1,
    "phase": "design-document",
    "status": "success | partial | failed",
    "design_issue_url": "string (URL of issue containing design)",
    "issue_number": "integer",
    "design_section_present": "boolean (true if <!-- feature-flow:design:start --> markers present in issue body)",
    "key_decisions": ["array of decision strings, max 5"],
    "open_questions": ["array of unresolved question strings, empty if none"],
    "tbd_count": "integer (count of [TBD] markers in design body)"
  }
  ```

  **Phase/bucket distinction (critical — bit PR #262):**
  - `phase_id: design` — the `phase_summaries` bucket key in the in-progress state file
  - `phase: "design-document"` — the contract's own `phase` field (lifecycle step name, used by validator to look up schema)
  These are two distinct concepts. The bucket key is `design`; the step name is `design-document`.

  **schema_version:** `1` (contract schema version — independent of state-file schema_version which is `2`).
  EOF
  )"
  ```

  Expected output: a GitHub comment URL like `https://github.com/uta2000/feature-flow/issues/251#issuecomment-...`

- [ ] **Step 2: Capture and record the comment URL**

  Run:
  ```bash
  gh issue view 251 --comments --json comments --jq '.comments[-1].url'
  ```

  Record the URL in session notes. This is the acceptance criterion anchor for `[MANUAL]` verification.
</task>

<task id="2" status="pending">
### Task 2: Extend validator with design-document schema + fixtures + unit tests

**Files:**
- Modify: `hooks/scripts/validate-return-contract.js` (SCHEMAS object — add `design-document` entry)
- Modify: `hooks/scripts/validate-return-contract.test.js` (add design-document test cases)
- Create: `hooks/scripts/fixtures/valid-design-document.json`

**Quality Constraints:**
- Error handling: existing fail-closed pattern (any unexpected error exits 1) — do NOT change the outer `try/catch` in `main()`; only add to `SCHEMAS` and extend tests.
- Function length: `validate()` and `checkField()` are both under 30 lines and must stay under 30 lines after this change — adding a SCHEMAS entry does not touch function bodies.
- Pattern reference: match `verify-plan-criteria` entry at `hooks/scripts/validate-return-contract.js:7-16` exactly (field names, type strings).

**CRITICAL — phase/bucket confusion:**
- The `SCHEMAS` key MUST be `'design-document'` (the lifecycle step name / contract `phase` field value — what the validator uses for lookup).
- The state-file bucket key (`phase_id: design`) is NEVER used as a SCHEMAS key.
- In the test fixture, `"phase": "design-document"` — NOT `"phase": "design"`.
- Add an inline comment in the SCHEMAS entry: `// bucket key = 'design' (phase_summaries); step name = 'design-document' (contract phase field)`

**Acceptance criteria:**
- [ ] `node hooks/scripts/validate-return-contract.js hooks/scripts/fixtures/valid-design-document.json` exits 0 — measured by: `echo $?` outputs `0`
- [ ] `node hooks/scripts/validate-return-contract.test.js` exits 0 and all design-document tests PASS — measured by: `node hooks/scripts/validate-return-contract.test.js | grep -E "^Results:"` outputs `Results: N passed, 0 failed` with N >= 15 (8 existing + 7 new)
- [ ] `node hooks/scripts/validate-return-contract.js /tmp/bad-design-document.json` exits 1 for a contract with a missing required field — measured by: create `{"schema_version":1,"phase":"design-document","status":"success"}` at `/tmp/bad-design-document.json`, run validator, `echo $?` outputs `1`

**Steps:**

- [ ] **Step 1: Add `design-document` entry to SCHEMAS**

  Read `hooks/scripts/validate-return-contract.js` lines 6-17 first. Then edit:

  In `hooks/scripts/validate-return-contract.js`, replace the SCHEMAS object:
  ```js
  const SCHEMAS = {
    'verify-plan-criteria': {
      schema_version: 'number',
      phase: 'string',
      status: 'string',
      plan_path: 'string',
      criteria_total: 'number',
      criteria_machine_verifiable: 'number',
      criteria_added_by_agent: 'number',
      tasks_missing_criteria: 'array',
    },
    // bucket key = 'design' (phase_summaries); step name = 'design-document' (contract phase field)
    'design-document': {
      schema_version: 'number',
      phase: 'string',
      status: 'string',
      design_issue_url: 'string',
      issue_number: 'number',
      design_section_present: 'boolean',
      key_decisions: 'array',
      open_questions: 'array',
      tbd_count: 'number',
    },
  };
  ```

  Note: `checkField()` does not handle `'boolean'` type today — add boolean support to `checkField()`. The existing function body:
  ```js
  function checkField(obj, field, expectedType, errors) {
    if (!(field in obj)) {
      errors.push(`missing required field: ${field}`);
      return;
    }
    if (expectedType === 'array') {
      if (!Array.isArray(obj[field])) errors.push(`${field}: expected array, got ${typeof obj[field]}`);
    } else if (typeof obj[field] !== expectedType) {
      errors.push(`${field}: expected ${expectedType}, got ${typeof obj[field]}`);
    }
  }
  ```
  `'boolean'` falls through to the `typeof` branch which already handles it correctly (`typeof true === 'boolean'`). No change needed — verify this manually before Step 2.

- [ ] **Step 2: Verify boolean type check works without code change**

  Run:
  ```bash
  node -e "
  const obj = { f: true };
  const errors = [];
  function checkField(o, field, expectedType, errs) {
    if (!(field in o)) { errs.push('missing required field: ' + field); return; }
    if (expectedType === 'array') {
      if (!Array.isArray(o[field])) errs.push(field + ': expected array, got ' + typeof o[field]);
    } else if (typeof o[field] !== expectedType) {
      errs.push(field + ': expected ' + expectedType + ', got ' + typeof o[field]);
    }
  }
  checkField(obj, 'f', 'boolean', errors);
  console.log(errors.length === 0 ? 'PASS: boolean handled correctly' : 'FAIL: ' + errors);
  "
  ```
  Expected: `PASS: boolean handled correctly`

- [ ] **Step 3: Create the valid fixture**

  Create `hooks/scripts/fixtures/valid-design-document.json`:
  ```json
  {
    "schema_version": 1,
    "phase": "design-document",
    "status": "success",
    "design_issue_url": "https://github.com/uta2000/feature-flow/issues/251",
    "issue_number": 251,
    "design_section_present": true,
    "key_decisions": ["Pattern B for fanout phases", "schema_version: 1 for contracts"],
    "open_questions": [],
    "tbd_count": 0
  }
  ```

- [ ] **Step 4: Run validator against fixture — verify exit 0**

  Run:
  ```bash
  node hooks/scripts/validate-return-contract.js hooks/scripts/fixtures/valid-design-document.json
  ```
  Expected output: `[validate-return-contract] OK`
  Expected exit code: 0

- [ ] **Step 5: Add design-document test cases to validate-return-contract.test.js**

  Read `hooks/scripts/validate-return-contract.test.js` lines 33-103 first. Then add after the last `test(...)` call and before `console.log(...)`:

  ```js
  // --- design-document contract tests ---

  const VALID_DD = {
    schema_version: 1,
    phase: 'design-document',
    status: 'success',
    design_issue_url: 'https://github.com/uta2000/feature-flow/issues/251',
    issue_number: 251,
    design_section_present: true,
    key_decisions: ['Pattern B', 'schema_version 1'],
    open_questions: [],
    tbd_count: 0,
  };

  test('design-document: valid contract exits 0', () => {
    const p = writeFixture(VALID_DD);
    const r = run(p);
    if (r.code !== 0) throw new Error(`expected exit 0, got ${r.code}\n${r.stderr}`);
  });

  test('design-document: missing design_issue_url exits 1', () => {
    const bad = { ...VALID_DD }; delete bad.design_issue_url;
    const p = writeFixture(bad);
    const r = run(p);
    if (r.code === 0) throw new Error('expected non-zero exit for missing design_issue_url');
    if (!r.stdout.includes('missing required field')) throw new Error(`expected "missing required field" in output; got: ${r.stdout}`);
  });

  test('design-document: missing issue_number exits 1', () => {
    const bad = { ...VALID_DD }; delete bad.issue_number;
    const p = writeFixture(bad);
    const r = run(p);
    if (r.code === 0) throw new Error('expected non-zero exit for missing issue_number');
  });

  test('design-document: design_section_present as string exits 1', () => {
    const bad = { ...VALID_DD, design_section_present: 'true' };
    const p = writeFixture(bad);
    const r = run(p);
    if (r.code === 0) throw new Error('expected non-zero exit for string design_section_present');
  });

  test('design-document: invalid status exits 1', () => {
    const bad = { ...VALID_DD, status: 'unknown' };
    const p = writeFixture(bad);
    const r = run(p);
    if (r.code === 0) throw new Error('expected non-zero exit for invalid status');
  });

  test('design-document: partial status is valid', () => {
    const partial = { ...VALID_DD, status: 'partial', open_questions: ['What about X?'] };
    const p = writeFixture(partial);
    const r = run(p);
    if (r.code !== 0) throw new Error(`expected exit 0 for partial status; got ${r.code}\n${r.stderr}`);
  });

  test('design-document: failed status is valid', () => {
    const failed_status = { ...VALID_DD, status: 'failed', design_section_present: false };
    const p = writeFixture(failed_status);
    const r = run(p);
    if (r.code !== 0) throw new Error(`expected exit 0 for failed status; got ${r.code}\n${r.stderr}`);
  });

  test('design-document: tbd_count as string exits 1', () => {
    const bad = { ...VALID_DD, tbd_count: 'zero' };
    const p = writeFixture(bad);
    const r = run(p);
    if (r.code === 0) throw new Error('expected non-zero exit for string tbd_count');
  });
  ```

- [ ] **Step 6: Run all tests — verify 0 failures**

  Run:
  ```bash
  node hooks/scripts/validate-return-contract.test.js
  ```
  Expected: all tests PASS, `Results: N passed, 0 failed` (N >= 16)

- [ ] **Step 7: Commit**

  ```bash
  cd /Users/weee/Dev/feature-flow/.worktrees/design-document-pattern-b-e886
  git add hooks/scripts/validate-return-contract.js hooks/scripts/validate-return-contract.test.js hooks/scripts/fixtures/valid-design-document.json
  git commit -m "feat(validator): add design-document schema entry + fixtures + unit tests (#251)"
  ```
</task>

<task id="3" status="pending">
### Task 3: Modify skills/design-document/SKILL.md — findings_path + write_contract_to + Step 5

**Files:**
- Modify: `skills/design-document/SKILL.md` (add `findings_path` arg branch at top of Step 1; add `write_contract_to`, `phase_id` optional args; add Step 5 Write Return Contract)

**Step numbering note:** The existing SKILL.md has Steps 1–4 then `### Step: Optional codex review` (unnumbered). Adding a numbered "Step 5: Write Return Contract" inserts before the codex-review section. The codex review step remains unnumbered to avoid renumbering it. The `grep -c "Step 5"` acceptance criterion below verifies exactly one match.


**Quality Constraints:**
- Error handling: Step 5 python3 helper must use the `[ -f "$F" ]` guard (matching `skills/verify-plan-criteria/SKILL.md:326` pattern). Absence of state file is a warning, not a fatal error.
- Function length: Python3 helpers are inline `-c` one-liners — no extraction needed. Bash variable blocks must not exceed 20 lines.
- Pattern reference: Step 7 helper in `skills/verify-plan-criteria/SKILL.md:270-330` is the exact template for Step 5 (verify-plan-criteria has it as Step 7; design-document has it as Step 5 because the file has fewer steps).

**CRITICAL — phase/bucket confusion:**
- Step 5 helper sets `phase_id` default to `design` (the bucket key — one of `{brainstorm, design, plan, implementation}`).
- The contract's `"phase"` field is hardcoded to `"design-document"` (the lifecycle step name) — NOT the bucket key.
- Add explicit comment in the python3 helper: `# bucket key in phase_summaries (e.g. "design") — NOT the step name ("design-document")`
- Quality Constraint on this task: "Pass `phase_id: design` (bucket key) NOT `design-document` (step name). Contract field stays `phase: design-document`. Verify in self-review."

**Acceptance criteria:**
- [ ] `grep -n "findings_path" skills/design-document/SKILL.md | head -5` outputs at least 2 lines (arg declaration + branch in Step 1) — measured by: `grep -c "findings_path" skills/design-document/SKILL.md` outputs `>= 2`
- [ ] `grep -n "write_contract_to" skills/design-document/SKILL.md | head -5` outputs at least 2 lines (arg declaration + Step 5 reference) — measured by: `grep -c "write_contract_to" skills/design-document/SKILL.md` outputs `>= 2`
- [ ] `grep -n "Step 5" skills/design-document/SKILL.md` outputs exactly 1 line — measured by: `grep -c "Step 5" skills/design-document/SKILL.md` outputs `1`
- [ ] `grep "phase.*design-document" skills/design-document/SKILL.md` matches the hardcoded contract phase string — measured by: `grep -c '"design-document"' skills/design-document/SKILL.md` outputs `>= 1`
- [ ] `grep '"design"' skills/design-document/SKILL.md | grep "bucket"` returns the comment confirming bucket key — measured by: `grep -c "bucket" skills/design-document/SKILL.md` outputs `>= 1`

**Steps:**

- [ ] **Step 1: Read the full SKILL.md before editing**

  Run:
  ```bash
  wc -l skills/design-document/SKILL.md
  ```
  Then read `skills/design-document/SKILL.md` fully (the file is ~260 lines — read it all).

- [ ] **Step 2: Add Optional Args section after the frontmatter block**

  After line 5 (`tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Task`) and before the `# Design Document` heading, insert:

  ```markdown
  ## Optional Args (used when invoked from orchestrator Pattern B dispatch)

  When invoked as a Pattern B consolidator subagent (per #251), the orchestrator passes these additional arguments:

  - `findings_path: <absolute-path-to-json>` — when set, read pre-gathered Explore agent findings from this JSON file and **skip Step 1's agent dispatch entirely**. Jump directly to the consolidation block in Step 1.
  - `write_contract_to: <absolute-path-to-in-progress-yml>` — when set, write the return contract to `phase_summaries.<phase_id>.return_contract` in the YAML state file after Step 4 completes (see Step 5 below).
  - `phase_id: <bucket-name>` — identifies which `phase_summaries` bucket to write into. Must be one of `{brainstorm, design, plan, implementation}`. If absent when `write_contract_to` is set, defaults to `design`. **Do not confuse `phase_id` with the contract's own `phase` field** — `phase_id` is the bucket key (`design`), the contract's `phase` field is the lifecycle step name (`design-document`) per #251's locked spec.

  All three args are optional. If `findings_path` is absent, Step 1 runs normally (agent dispatch). If `write_contract_to` is absent, Step 5 is skipped — the skill behaves identically to its inline-invocation form.
  ```

- [ ] **Step 3: Add findings_path branch at top of Step 1**

  In the `### Step 1: Gather Context` section, after the opening paragraph ("Collect the inputs needed to write the document:") and before the `1. **From the conversation:**` list, insert:

  ```markdown
  **`findings_path` short-circuit (Pattern B only):** If `findings_path` is present in ARGUMENTS, the orchestrator has already dispatched the parallel Explore agents and written their results to a JSON file at that path. In this case:
  1. Read the JSON file at `findings_path`. It contains a single object `{"agents": [{"area": string, "findings": string[]}, ...]}` — the `agents` array is the list of Explore returns; iterate over it.
  2. Use these as the agent findings for the Consolidation block below — skip the agent dispatch entirely.
  3. Jump directly to **Consolidation** (do not dispatch Task agents, do not announce parallel dispatch).

  If `findings_path` is absent, continue with the standard agent dispatch below.
  ```

- [ ] **Step 4: Add Step 5 Write Return Contract section**

  Insert before `### Step: Optional codex review` (the unnumbered last section). The section is inserted between Step 4 (Merge design into GitHub issue body) and the codex review step, keeping codex review as the trailing unnumbered section.

  Insert:

  ```markdown
  ### Step 5: Write Return Contract (conditional)

  **Only executes if `write_contract_to` is set in the skill's ARGUMENTS.** If the arg is absent, skip this step entirely.

  Construct the return contract object per the locked spec from #251:

  - `schema_version`: `1` (integer — contract schema version, NOT the in-progress state-file schema_version)
  - `phase`: hardcoded to `"design-document"` per #251's locked contract spec — this is the lifecycle step name the validator uses to look up the schema. **Not** the `phase_id` arg value. (`phase_id` names the state-file bucket, e.g. `"design"`.)
  - `status`: one of:
    - `"success"` — design section written to issue body, markers present and confirmed
    - `"partial"` — design written but some fields could not be determined (e.g., `open_questions` uncertain)
    - `"failed"` — skill could not write design to issue (e.g., `gh` command failed)
  - `design_issue_url`: URL of the GitHub issue containing the design (from `gh issue view <issue_number> --json url --jq '.url'`)
  - `issue_number`: integer issue number from lifecycle context
  - `design_section_present`: `true` if `<!-- feature-flow:design:start -->` and `<!-- feature-flow:design:end -->` markers are present in the issue body after Step 4 completes; `false` otherwise
  - `key_decisions`: array of up to 5 key decision strings extracted from the design doc (scope choices, approach choices, rejected alternatives) — empty array if none
  - `open_questions`: array of unresolved question strings (`[TBD]` items) found in the design — empty array if none
  - `tbd_count`: integer count of `[TBD]` markers in the design body (0 if none)

  Write the contract to the state file using this helper (env-var passing pattern — apostrophe-safe):

  ```bash
  F="<write_contract_to value>"
  PHASE_ID="<phase_id value, default: design>"  # bucket key in phase_summaries (e.g. "design") — NOT the step name ("design-document")
  STATUS="<success|partial|failed>"
  ISSUE_URL="<design_issue_url>"
  ISSUE_NUM=<issue_number>
  SECTION_PRESENT=<true|false>
  KEY_DECISIONS='<json-array-string, e.g. ["Decision A","Decision B"] or []>'
  OPEN_QUESTIONS='<json-array-string, e.g. ["Question X"] or []>'
  TBD_COUNT=<integer>

  [ -f "$F" ] && F="$F" PHASE_ID="$PHASE_ID" STATUS="$STATUS" ISSUE_URL="$ISSUE_URL" ISSUE_NUM="$ISSUE_NUM" SECTION_PRESENT="$SECTION_PRESENT" KEY_DECISIONS="$KEY_DECISIONS" OPEN_QUESTIONS="$OPEN_QUESTIONS" TBD_COUNT="$TBD_COUNT" python3 -c '
  import os, json, yaml
  f = os.environ["F"]
  d = yaml.safe_load(open(f)) or {}
  bucket = os.environ["PHASE_ID"]  # bucket key in phase_summaries (e.g. "design") — NOT the step name ("design-document")
  if "phase_summaries" not in d or bucket not in d["phase_summaries"]:
      print(f"[design-document] WARNING: phase_summaries.{bucket} not found in {f}; skipping contract write")
  else:
      d["phase_summaries"][bucket]["return_contract"] = {
          "schema_version": 1,
          # The contract phase field is the lifecycle STEP NAME per #251 spec
          # ("design-document"), NOT the bucket key (which would be "design").
          # The validator uses this to look up the schema in its registry.
          "phase": "design-document",
          "status": os.environ["STATUS"],
          "design_issue_url": os.environ["ISSUE_URL"],
          "issue_number": int(os.environ["ISSUE_NUM"]),
          "design_section_present": os.environ["SECTION_PRESENT"].lower() == "true",
          "key_decisions": json.loads(os.environ["KEY_DECISIONS"]),
          "open_questions": json.loads(os.environ["OPEN_QUESTIONS"]),
          "tbd_count": int(os.environ["TBD_COUNT"]),
      }
      yaml.dump(d, open(f, "w"), default_flow_style=False, allow_unicode=True)
      print(f"[design-document] return_contract written to {f}")
  '
  ```

  The `[ -f "$F" ]` guard is intentional — when invoked outside a lifecycle context, `write_contract_to` may point to a file that does not exist. Log warning and return normally.

  After writing, return the state-file path and a one-line summary as the skill's result text:

  `"Return contract written to <write_contract_to>. Design issue: #<issue_number>. Design section present: <true|false>. Status: <status>."`

  **CRITICAL self-review check:** Verify `PHASE_ID` default is `design` (bucket key) — NOT `design-document` (step name). The contract's `"phase"` field is `"design-document"`. These are two distinct values.
  ```

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/weee/Dev/feature-flow/.worktrees/design-document-pattern-b-e886
  git add skills/design-document/SKILL.md
  git commit -m "feat(design-document): add findings_path arg + write_contract_to Step 5 (Write Return Contract) for Pattern B (#251)"
  ```
</task>

<task id="4" status="pending">
### Task 4: Add Pattern B wrapper subsection to skills/start/SKILL.md + update behavioral call sites

**Files:**
- Modify: `skills/start/SKILL.md` at lines 689-690 (replace YOLO Task() dispatch), lines 752-756 and 763 (replace Interactive/Express Skill() calls), and insert new subsection at ~line 752 (after existing Pattern A wrapper)

**Quality Constraints:**
- Error handling: Inline-fallback table must cover exactly 3 cases (dispatch fails, subagent completes but contract absent, validator fails) — same as Pattern A wrapper at lines 737-744.
- Function length: No function to extract — this is a Markdown skill file. Wrapper subsection must be self-contained (all dispatch params, post-dispatch sequence, fallback table, sunset comment).
- Pattern reference: Mirror Pattern A wrapper block at `skills/start/SKILL.md:697-751` structurally. Match: header note, all-modes dispatch code block, post-dispatch sequence, fallback table, sunset comment.

**CRITICAL — phase/bucket confusion:**
- The wrapper prompt MUST pass `phase_id: design` (bucket key) to the consolidator.
- The validator MUST look up the contract by `obj.phase` which will be `"design-document"` (step name) — do NOT pass `phase_id: design-document` in the dispatch args.
- Add explicit comment in the wrapper subsection (mirroring the "Why `phase_id: plan` (not `verify-plan-criteria`)" note at line 719): "**Why `phase_id: design` (not `design-document`):** `phase_id` names the **state-file bucket** in `phase_summaries` — one of the four fixed keys (`brainstorm`, `design`, `plan`, `implementation`). The `design-document` lifecycle step lives in the `design` bucket. The contract's own `phase` field stays `"design-document"` per #251's locked spec."
- Quality Constraint: "Pass `phase_id: design` (bucket key) NOT `design-document` (step name). Contract field stays `phase: design-document`. Verify in self-review."

**Inline-fallback target:**
- The fallback for Interactive/Express/YOLO cases is `Skill(skill: "feature-flow:design-document", args: "yolo: true. scope: [scope]. [original args]")` — the pre-#251 inline form.
- The existing YOLO Task() at L689-690 is **NOT** a valid fallback — it is latently broken (subagent tries to dispatch inner Explore agents which is blocked by Q1's recursive dispatch constraint). The inline Skill() is the only safe fallback.

**Acceptance criteria:**
- [ ] `grep -n "Design Document.*Pattern B" skills/start/SKILL.md` outputs 1 line — measured by: `grep -c "Pattern B" skills/start/SKILL.md` outputs `>= 2` (Pattern A at line 678 + new Pattern B subsection heading)
- [ ] `grep -n "phase_id: design" skills/start/SKILL.md` outputs at least 1 line in the new wrapper — measured by: `grep -c "phase_id: design" skills/start/SKILL.md` outputs `>= 1`
- [ ] Lines 689-690 no longer contain the old YOLO Task() dispatch for design-document — measured by: `sed -n '686,694p' skills/start/SKILL.md | grep -c "YOLO design document"` outputs `0`
- [ ] Lines 752-756 no longer contain the old Interactive/Express inline Skill() for design-document — measured by: `grep -n 'Skill.*feature-flow:design-document.*yolo: true' skills/start/SKILL.md | grep -v "fallback"` outputs 0 lines (all remaining references are inside fallback tables or sunset comments)
- [ ] `grep -n "sunset" skills/start/SKILL.md | grep -i "design"` outputs at least 1 match — measured by: `grep -c "SUNSET NOTE.*design\|design.*sunset" skills/start/SKILL.md` outputs `>= 1` (case-insensitive)

**Steps:**

- [ ] **Step 1: Read lines 670-770 of start/SKILL.md before editing**

  Run:
  ```bash
  sed -n '670,770p' skills/start/SKILL.md | cat -n
  ```
  Verify the exact content at L689-690 (YOLO Task), L752-756 (Interactive/Express block), L763 (Express Skill call).

- [ ] **Step 2: Replace L689-690 YOLO Task() with reference to new wrapper**

  Find and replace the YOLO design-document Task block. Current text at L688-691:
  ```
  # Design document — Opus for architectural decisions
  Task(subagent_type: "general-purpose", model: "opus", description: "YOLO design document",
       prompt: "Invoke Skill(skill: 'feature-flow:design-document', args: 'yolo: true. scope: [scope]. [context args]'). Return the design document path and key decisions.")
  ```

  Replace with:
  ```
  # Design document — Pattern B (see "Design Document — Pattern B Dispatch" subsection below)
  # In YOLO mode the orchestrator dispatches Explore fanout + consolidator Task() directly.
  # See "Design Document — Pattern B Dispatch" for the full dispatch sequence.
  ```

- [ ] **Step 3: Insert new Pattern B wrapper subsection at ~line 752 (after existing Pattern A wrapper)**

  After the `<!-- SUNSET NOTE ... -->` comment block that closes the Pattern A wrapper (at ~line 750), insert the new subsection. The insertion point is just before the current L752 `**Interactive/Express mode**` paragraph.

  Insert this full block:

  ````markdown
  ### Design Document — Pattern B Dispatch

  **Note:** INLINE-FALLBACK IS A ROLLOUT-ONLY FEATURE.
  <!-- feature-flow vNEXT removes inline-fallback once two consecutive successful real-session uses are observed. -->

  **Applies in ALL modes** (YOLO, Express, Interactive). `design-document` is the first Pattern B conversion (per issue #251). The orchestrator dispatches parallel Explore agents (hoisted from `skills/design-document/SKILL.md` Step 1), writes findings to a temp JSON file, then dispatches a consolidator `Task()` subagent that invokes the skill with `findings_path` pointing to that file (skipping inner agent dispatch). The consolidator writes a structured return contract to the in-progress state file; the orchestrator validates before proceeding.

  ```
  # Step: Design document (Pattern B)
  BASE_REPO=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
  SLUG=<slug-from-session-context>
  STATE_FILE="${BASE_REPO}/.feature-flow/handoffs/in-progress-${SLUG}.yml"
  FINDINGS_FILE="/tmp/ff-design-findings-${SLUG}.json"

  # Phase 1: Orchestrator-side Explore fanout (3-4 agents in parallel, single message)
  # Returns: [{area: string, findings: string[]}, ...]
  Task(subagent_type: "Explore", model: "haiku", description: "design-document context: format patterns",
       prompt: "Read existing design docs in docs/plans/ and extract document structure, section patterns, and conventions. Return JSON: {area: 'format-patterns', findings: [<string>, ...]}")
  Task(subagent_type: "Explore", model: "haiku", description: "design-document context: stack & dependencies",
       prompt: "Examine dependency files (package.json, config files), project structure, and tech stack conventions. Return JSON: {area: 'stack-dependencies', findings: [<string>, ...]}")
  Task(subagent_type: "Explore", model: "haiku", description: "design-document context: relevant code",
       prompt: "Search for and read source files related to <feature description>. Return JSON: {area: 'relevant-code', findings: [<string>, ...]}")
  # Optional 4th agent: Context7 docs — only if .feature-flow.yml has context7 field AND no doc lookup ran in start
  # Task(subagent_type: "Explore", model: "haiku", description: "design-document context: documentation", ...)

  # Write findings to temp JSON file
  python3 -c "
  import json, sys
  findings = [<agent1_result>, <agent2_result>, <agent3_result>]  # collect from Task returns
  json.dump(findings, open('${FINDINGS_FILE}', 'w'))
  print('[design-document] findings written to ${FINDINGS_FILE}')
  "

  # Phase 2: Consolidator dispatch
  Task(
    subagent_type: "general-purpose",
    model: "sonnet",
    description: "design-document Pattern B consolidator",
    prompt: "Invoke Skill(skill: 'feature-flow:design-document', args: 'yolo: true. scope: [scope]. issue: [issue_number]. design_issue: [design_issue]. findings_path: ${FINDINGS_FILE}. write_contract_to: ${STATE_FILE}. phase_id: design'). Return the state-file path and a one-line summary."
  )
  ```

  **Why `phase_id: design` (not `design-document`):** `phase_id` names the **state-file bucket** in `phase_summaries` — one of the four fixed keys (`brainstorm`, `design`, `plan`, `implementation`). The `design-document` lifecycle step lives in the `design` bucket. The contract's own `phase` field stays `"design-document"` per #251's locked spec. Two distinct concepts, same word "phase" — don't confuse them.

  **Why `model: "sonnet"` for consolidator (settled — not an open question):** The removed YOLO Task() at L689-690 used `model: "opus"`. That wrapper was for original architectural reasoning ("Opus for creative decisions"). The Pattern B consolidator does synthesis — it ingests pre-gathered findings and writes structured sections from them. That is the same work shape as `verify-plan-criteria` (read + synthesize + output structured result), which correctly uses Sonnet. Opus is over-spec for synthesis; Sonnet matches the work. Decision is locked.

  **Post-dispatch sequence (orchestrator-side):**

  1. **Read state file** and extract `phase_summaries.design.return_contract`:
     ```bash
     python3 -c "import json, yaml; d = yaml.safe_load(open('${STATE_FILE}')); rc = (d.get('phase_summaries', {}).get('design') or {}).get('return_contract'); json.dump(rc, open('/tmp/ff-return-contract-${SLUG}.json','w')) if rc else None; print('missing' if not rc else 'ok')"
     ```
     If output is `missing` → trigger **inline-fallback** (case 2 below).
  2. **Validate the contract:**
     ```bash
     node hooks/scripts/validate-return-contract.js /tmp/ff-return-contract-${SLUG}.json
     ```
     Exit 0 → proceed. Non-zero → trigger **inline-fallback** (case 3 below).
  3. **Proceed to next lifecycle step** (Design verification / Create issue / Implementation plan).

  **Inline-fallback path** (rollout-only — three failure cases):

  | Case | Trigger | Announce | Next |
  |------|---------|----------|------|
  | 1 | Explore fanout dispatch fails (timeout, tool error, refusal) or consolidator `Task()` dispatch fails | `design-document Pattern B: dispatch failed (<reason>). Falling back to inline Skill().` | Run inline `Skill(skill: "feature-flow:design-document", args: "yolo: true. scope: [scope]. [original args]")` |
  | 2 | Consolidator completes but `return_contract` field is null/absent in state file | `design-document Pattern B: subagent did not write return_contract. Falling back to inline Skill().` | Same inline invocation |
  | 3 | `validate-return-contract.js` exits non-zero | `design-document Pattern B: contract validation failed (<error from validator>). Falling back to inline Skill().` | Same inline invocation |

  The inline fallback is `Skill(skill: "feature-flow:design-document", args: "yolo: true. scope: [scope]. [original args]")` — the pre-#251 inline form. **Do NOT fall back to the old YOLO Task() at L689-690 (removed) — that dispatch is latently broken because the subagent cannot recursively dispatch Explore agents (Q1 spike result).**

  <!-- SUNSET NOTE: feature-flow vNEXT removes this inline-fallback table and the three failure-case
       handlers once two consecutive successful real-session uses of Pattern B are observed and the
       measurement (per #253) confirms ≥5% orchestrator context reduction. The wrapper itself stays;
       only the fallback safety net is sunset. -->
  ````

- [ ] **Step 4: Update the Interactive/Express mode paragraph and code blocks at ~L752-764**

  The current paragraph starts with `**Interactive/Express mode** continues to use inline Skill calls for **brainstorming and design-document**...`. Update it to remove `design-document` from the inline-call description:

  Replace the current paragraph + code blocks at ~L752-764 with:

  ```markdown
  **Interactive/Express mode** for **brainstorming** continues to use inline `Skill` calls (unchanged — brainstorming inherits the parent model and requires user interaction in Interactive mode). **design-document** now uses Pattern B dispatch in all modes (see "Design Document — Pattern B Dispatch" subsection above). Pattern A subagent dispatches (e.g. `verify-plan-criteria`) still use `Task()` in Interactive/Express modes for context isolation, not model routing.

  ```
  Skill(skill: "superpowers:brainstorming", args: "yolo: true. scope: [scope]. [original args]")
  ```

  **Express Propagation:** When Express mode is active, prepend `express: true. scope: [scope].` to the `args` parameter of every `Skill` invocation. Express inherits all YOLO auto-selection overrides — skills that check for `yolo: true` should also check for `express: true` and behave the same way (auto-select decisions). The only difference is at the orchestrator level where checkpoints are shown instead of suppressed.

  ```
  Skill(skill: "superpowers:brainstorming", args: "express: true. scope: [scope]. [original args]")
  ```
  ```

- [ ] **Step 5: Verify line references after edit**

  Run:
  ```bash
  grep -n "Pattern B Dispatch\|phase_id: design\|YOLO design document\|Skill.*feature-flow:design-document" skills/start/SKILL.md | head -20
  ```
  Confirm:
  - `Pattern B Dispatch` appears in the new subsection heading
  - `phase_id: design` appears in the dispatch prompt
  - `YOLO design document` does NOT appear (old Task removed)
  - `Skill.*feature-flow:design-document` only appears in fallback table and inline-fallback instructions (not as a primary call site)

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/weee/Dev/feature-flow/.worktrees/design-document-pattern-b-e886
  git add skills/start/SKILL.md
  git commit -m "feat(start): Pattern B wrapper for design-document phase; replace L689-690 YOLO Task + L752/763 Skill() (#251)"
  ```
</task>

<task id="5" status="pending">
### Task 5: Update doc-only lines in skills/start/SKILL.md

**Files:**
- Modify: `skills/start/SKILL.md` at L678 (Pattern A/B CRITICAL block), L844 (Skill Mapping table), L951 (YOLO stop_after phase mapping table)

**Quality Constraints:**
- These are documentation-only edits. No logic changes. Verify with `git diff --stat` that only `skills/start/SKILL.md` is modified.
- Pattern reference: match the `verify-plan-criteria` row format in the Skill Mapping table at line 849.

**Acceptance criteria:**
- [ ] `grep -n "Future conversions.*design-document" skills/start/SKILL.md` outputs 0 lines — measured by: `grep -c "Future conversions.*design-document" skills/start/SKILL.md` outputs `0`
- [ ] L678 "Currently converted" list includes design-document — measured by: `grep -c "Currently converted.*design-document" skills/start/SKILL.md` outputs `>= 1`
- [ ] `grep -n "Design document.*Pattern B\|Pattern B.*design-document" skills/start/SKILL.md | head -5` outputs at least 1 match in the Skill Mapping row — measured by: `sed -n '840,850p' skills/start/SKILL.md | grep -c "Pattern B"` outputs `>= 1`

**Steps:**

- [ ] **Step 1: Read lines 675-682 and 840-855 and 948-958 before editing**

  Run:
  ```bash
  sed -n '675,682p' skills/start/SKILL.md
  sed -n '840,855p' skills/start/SKILL.md
  sed -n '948,958p' skills/start/SKILL.md
  ```

- [ ] **Step 2: Update L678 Pattern A/B CRITICAL block — move design-document to "Currently converted"**

  In the `**Pattern A subagent dispatch (CRITICAL...)**` paragraph at L678, find the sentence:
  ```
  Currently converted: `verify-plan-criteria` (see "Verify Plan Criteria — Pattern A Dispatch" subsection below). Future conversions: `merge-prs`, `design-document`, `verify-acceptance-criteria`, `code-review`, `implementation` per #251's conversion order.
  ```

  Replace with:
  ```
  Currently converted: `verify-plan-criteria` (Pattern A — see "Verify Plan Criteria — Pattern A Dispatch" subsection below), `design-document` (Pattern B — see "Design Document — Pattern B Dispatch" subsection below). Future conversions: `merge-prs`, `verify-acceptance-criteria`, `code-review`, `implementation` per #251's conversion order.
  ```

- [ ] **Step 3: Update Skill Mapping table row for Design document**

  In the Skill Mapping table, find the row:
  ```
  | Design document | `feature-flow:design-document` | GitHub issue body (between `<!-- feature-flow:design:start -->` markers) **Context capture:** After the design document is written to the issue body, write key scope decisions, approach choices, and rejected alternatives to `.feature-flow/design/design-decisions.md` (append to the existing template — do not overwrite). |
  ```

  Replace the `Expected Output` column content with:
  ```
  GitHub issue body (between `<!-- feature-flow:design:start -->` markers); structured return contract at `phase_summaries.design.return_contract` validated via `hooks/scripts/validate-return-contract.js` (Pattern B dispatch — see "Design Document — Pattern B Dispatch" section). **Context capture:** After the design document is written to the issue body, write key scope decisions, approach choices, and rejected alternatives to `.feature-flow/design/design-decisions.md` (append to the existing template — do not overwrite).
  ```

- [ ] **Step 4: Update YOLO stop_after phase mapping table row for design**

  In the `stop_after` phase mapping table, find the row:
  ```
  | `design` | Design document | After `feature-flow:design-document` returns |
  ```

  Update the `Fires after/before` column to:
  ```
  After `feature-flow:design-document` Pattern B consolidator returns (after contract written to state file)
  ```

- [ ] **Step 5: Verify no regressions in the doc lines**

  Run:
  ```bash
  grep -n "design-document\|Pattern B" skills/start/SKILL.md | head -30
  ```
  Confirm: L678 updated, Skill Mapping row updated, stop_after table updated, no stale references to old inline call pattern.

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/weee/Dev/feature-flow/.worktrees/design-document-pattern-b-e886
  git add skills/start/SKILL.md
  git commit -m "docs(start): move design-document to currently converted; update skill mapping + stop_after table (#251)"
  ```
</task>

<task id="6" status="pending">
### Task 6: Extend e2e test for design-document contract round-trip

**Files:**
- Modify: `hooks/scripts/validate-return-contract.e2e.sh` (add a second round-trip test covering the `design-document` bucket/step-name distinction)

**Quality Constraints:**
- Error handling: Use `set -euo pipefail`. All temp files must be cleaned up via `trap cleanup EXIT`.
- Function length: the new e2e block must be self-contained — no new bash functions. Follow the inline env-var passing pattern at e2e.sh:54-78 exactly.
- Pattern reference: `hooks/scripts/validate-return-contract.e2e.sh` (existing `verify-plan-criteria` round-trip at lines 28-93) is the exact template.

**CRITICAL — phase/bucket confusion test:**
- The e2e test must explicitly verify that bucket key `design` and contract `phase` field `design-document` are distinct by:
  1. Writing the return contract to `phase_summaries.design.return_contract` (bucket = `design`)
  2. Reading it back via `phase_summaries.design.return_contract`
  3. Validating that `obj.phase === "design-document"` (step name) passes the validator

**Acceptance criteria:**
- [ ] `bash hooks/scripts/validate-return-contract.e2e.sh` exits 0 — measured by: `echo $?` outputs `0`
- [ ] `bash hooks/scripts/validate-return-contract.e2e.sh` outputs exactly 2 `e2e PASS` lines (one for verify-plan-criteria, one for design-document) — measured by: `bash hooks/scripts/validate-return-contract.e2e.sh | grep -c "e2e PASS"` outputs `2`

**Steps:**

- [ ] **Step 1: Read the full existing e2e.sh before editing**

  Run: `wc -l hooks/scripts/validate-return-contract.e2e.sh` then read it fully.

- [ ] **Step 2: Add design-document round-trip test block**

  At the end of `hooks/scripts/validate-return-contract.e2e.sh` (after line 93 `echo "  e2e PASS: ..."`), append:

  ```bash
  # ============================================================
  # design-document contract round-trip (Pattern B, bucket: design)
  # Verifies that bucket key 'design' and contract phase 'design-document' are distinct.
  # ============================================================

  SLUG_DD="e2e-dd-$(date +%s)-$$"
  STATE_FILE_DD="/tmp/in-progress-${SLUG_DD}.yml"
  CONTRACT_JSON_DD="/tmp/ff-return-contract-${SLUG_DD}.json"

  cleanup_dd() { rm -f "$STATE_FILE_DD" "$CONTRACT_JSON_DD"; }
  trap cleanup_dd EXIT

  # Step 1: fake state file with 4-bucket schema.
  SLUG_DD="$SLUG_DD" STATE_FILE_DD="$STATE_FILE_DD" python3 -c '
  import os, yaml
  data = {
      "schema_version": 2,
      "slug": os.environ["SLUG_DD"],
      "issue_number": 251,
      "worktree_path": "/tmp",
      "branch": "test",
      "base_branch": "main",
      "scope": "feature",
      "current_step": "design-document",
      "last_completed_step": "brainstorm",
      "created_at": "2026-05-02T00:00:00Z",
      "updated_at": "2026-05-02T00:00:00Z",
      "phase_summaries": {
          "brainstorm":     {"completed": True,  "key_decisions": [],                     "return_contract": None},
          "design":         {"completed": False, "issue_url": None, "key_decisions": [],  "return_contract": None},
          "plan":           {"completed": False, "plan_path": None, "open_questions": [], "return_contract": None},
          "implementation": {"completed": False, "tasks_done": 0, "tasks_total": 0, "blockers": [], "return_contract": None},
      },
      "feature_flow_version": "1.37.0",
  }
  yaml.dump(data, open(os.environ["STATE_FILE_DD"], "w"), default_flow_style=False, allow_unicode=True)
  '

  # Step 2: skill Step 5 helper — subagent writes its return contract to the 'design' BUCKET.
  # NOTE: phase_summaries bucket = 'design'; contract phase field = 'design-document'
  F="$STATE_FILE_DD" PHASE_ID="design" STATUS="success" \
  ISSUE_URL="https://github.com/uta2000/feature-flow/issues/251" \
  ISSUE_NUM="251" SECTION_PRESENT="true" \
  KEY_DECISIONS='["Pattern B for fanout phases"]' \
  OPEN_QUESTIONS='[]' TBD_COUNT="0" python3 -c '
  import os, json, yaml
  f = os.environ["F"]
  d = yaml.safe_load(open(f)) or {}
  bucket = os.environ["PHASE_ID"]  # "design" — the bucket key, NOT "design-document"
  if "phase_summaries" not in d or bucket not in d["phase_summaries"]:
      raise SystemExit(f"FAIL: phase_summaries.{bucket} not found in {f}")
  d["phase_summaries"][bucket]["return_contract"] = {
      "schema_version": 1,
      "phase": "design-document",  # lifecycle step name per #251 — NOT the bucket key "design"
      "status": os.environ["STATUS"],
      "design_issue_url": os.environ["ISSUE_URL"],
      "issue_number": int(os.environ["ISSUE_NUM"]),
      "design_section_present": os.environ["SECTION_PRESENT"].lower() == "true",
      "key_decisions": json.loads(os.environ["KEY_DECISIONS"]),
      "open_questions": json.loads(os.environ["OPEN_QUESTIONS"]),
      "tbd_count": int(os.environ["TBD_COUNT"]),
  }
  yaml.dump(d, open(f, "w"), default_flow_style=False, allow_unicode=True)
  '

  # Step 3: orchestrator read helper — reads from 'design' bucket (NOT 'design-document').
  STATE_FILE_DD="$STATE_FILE_DD" CONTRACT_JSON_DD="$CONTRACT_JSON_DD" python3 -c '
  import os, json, yaml
  d = yaml.safe_load(open(os.environ["STATE_FILE_DD"]))
  # Read from bucket key "design" — the contract inside has phase="design-document"
  rc = (d.get("phase_summaries", {}).get("design") or {}).get("return_contract")
  if not rc:
      raise SystemExit("FAIL: phase_summaries.design.return_contract is missing")
  if rc.get("phase") != "design-document":
      raise SystemExit(f"FAIL: expected phase=design-document, got {rc.get(\"phase\")}")
  json.dump(rc, open(os.environ["CONTRACT_JSON_DD"], "w"))
  '

  # Step 4: orchestrator validator.
  node "${SCRIPT_DIR}/validate-return-contract.js" "$CONTRACT_JSON_DD"

  echo "  e2e PASS: design-document subagent → state-file (bucket: design) → orchestrator-read → validator pipeline works"
  ```

- [ ] **Step 3: Run the e2e test — verify 2 PASS lines**

  Run:
  ```bash
  bash hooks/scripts/validate-return-contract.e2e.sh
  ```
  Expected output includes:
  ```
    e2e PASS: subagent → state-file → orchestrator-read → validator pipeline works
    e2e PASS: design-document subagent → state-file (bucket: design) → orchestrator-read → validator pipeline works
  ```
  Expected exit code: 0

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/weee/Dev/feature-flow/.worktrees/design-document-pattern-b-e886
  git add hooks/scripts/validate-return-contract.e2e.sh
  git commit -m "test(e2e): add design-document contract round-trip covering bucket/step-name distinction (#251)"
  ```
</task>

<task id="7" status="pending">
### Task 7: Run #253 measurement and capture context percentage

**Files:**
- Read-only: session context logs (no files modified in this task)
- Create: `.feature-flow/design/measurement-result-253.txt` (session-local, gitignored)

**Context:** Issue #253 is the per-phase context-contributor instrumentation requirement. The measurement must confirm that Pattern B saves ≥5% of orchestrator context versus a pre-#262 baseline. If <5%, the conversion fails the per-phase decision rule and must be aborted.

**Acceptance criteria:**
- [ ] `[MANUAL]` Measurement result file exists and contains a percentage — measured by: `test -f .feature-flow/design/measurement-result-253.txt && grep -c "%" .feature-flow/design/measurement-result-253.txt` outputs `1`
- [ ] `[MANUAL]` If the percentage is <5%, a decision is documented: either abort with rationale or proceed with documented exemption — measured by: file content includes either `PASS (>=5%)` or `ABORT (<5%)` keyword

**Steps:**

- [ ] **Step 1: Review the #253 measurement methodology**

  Run:
  ```bash
  gh issue view 253 --repo $(git remote get-url origin | sed 's/.*github.com[:/]//' | sed 's/\.git$//') | head -100
  ```
  Note the exact instrumentation steps required.

- [ ] **Step 2: Run comparison against a pre-#262 baseline session**

  Per #253's methodology: compare orchestrator context token count for a representative lifecycle with Pattern B active vs. the baseline (pre-#251 inline skill invocation).

  If #253's tooling is not yet deployed (likely — #251 is the prerequisite), use a proxy measurement:
  - Estimate the size of content that would have been loaded inline (design-document/SKILL.md + ~3 Explore agent return payloads in orchestrator context).
  - Document the estimate with a note: "Instrumentation not yet deployed (#253); estimate based on file sizes."

  Run:
  ```bash
  wc -c skills/design-document/SKILL.md
  # Estimate: 3 Explore agents × ~2KB average return = ~6KB
  # design-document/SKILL.md = ~X KB
  # Total inline cost estimate: ~(X + 6) KB
  # Pattern B orchestrator sees: ~1KB (contract only)
  # Savings estimate: ((X + 6 - 1) / (X + 6)) * 100 %
  ```

- [ ] **Step 3: Document the result**

  Write `.feature-flow/design/measurement-result-253.txt`:
  ```
  Measurement date: 2026-05-02
  Methodology: [exact or proxy]
  Pre-Pattern-B orchestrator cost: [N tokens / KB]
  Post-Pattern-B orchestrator cost: [N tokens / KB]
  Estimated savings: [X%]
  Decision: PASS (>=5%) | ABORT (<5%) — [rationale if ABORT]
  ```

  If ABORT: do NOT proceed to merge. Open a follow-up on #251 documenting why the threshold was not met.

- [ ] **Step 4: Proceed only if PASS**

  If the file contains `PASS`, continue to the PR. If `ABORT`, stop and surface to the user.
</task>

## Open Questions

1. **#253 measurement tooling availability:** Is the per-phase instrumentation from issue #253 deployed? If not, Task 7 must use a proxy estimate. The plan assumes proxy is acceptable but the decision rule (≥5%) still applies. If proxy cannot be computed, Task 7 becomes a manual judgment call — surface to user before proceeding.

2. **`findings_path` JSON leniency:** The findings file at `findings_path` contains a top-level object `{"agents": [{"area": string, "findings": string[]}, ...]}`. Each `agents[]` entry mirrors the Explore-agent return format documented at `skills/design-document/SKILL.md:46-49`. The wrapping `{"agents": [...]}` shape is set by the orchestrator's findings-write helper in `skills/start/SKILL.md` "Design Document — Pattern B Dispatch" sub-step 2. The format is controlled by the orchestrator's own dispatch prompt so drift is unlikely, but if a real session fails on malformed findings JSON, the `findings_path` branch in Step 1 should use lenient parsing (extract `area` + `findings` keys per agent entry, ignore extras) rather than strict shape validation.

</plan>
