# verify-plan-criteria Pattern A Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `feature-flow:verify-plan-criteria` from inline `Skill()` invocation in the orchestrator to `Task()`-dispatched subagent execution (Pattern A), with a structured return contract written to the in-progress state file and an inline-fallback for rollout safety.

**Architecture:** The orchestrator dispatches a general-purpose subagent (model: sonnet) that runs `feature-flow:verify-plan-criteria` and writes the result as a structured JSON contract into `phase_summaries.plan.return_contract` of the in-progress state file. A new Node.js validator (`hooks/scripts/validate-return-contract.js`) validates the contract against a hand-rolled schema. If dispatch fails, schema validation fails, or no `return_contract` is found, the orchestrator falls back to the existing inline `Skill()` path. The inline-fallback is a rollout-only feature with a stated sunset condition.

**Tech Stack:** Markdown (SKILL.md docs), Node.js (validator script), Python/YAML (state-file helpers), Bash (acceptance criteria commands)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `skills/start/SKILL.md` | Modify | Schema version bump (1→2), `return_contract` field in all four phase dicts, initial-write helper update, Skill Mapping table row update, new Pattern A wrapper section |
| `hooks/scripts/validate-return-contract.js` | Create | Hand-rolled JSON Schema validator for phase return contracts; phase-id registry; stdin/argv input; non-zero exit on failure |
| `hooks/scripts/validate-return-contract.test.js` | Create | Node.js tests for the validator (valid/invalid/unknown-phase cases) |
| `skills/verify-plan-criteria/SKILL.md` | Modify | Add `write_contract_to` and `phase_id` args to Step 6; write contract to state file when args are set |
| `skills/cleanup-merged/SKILL.md` | Verify only | Confirm schema-version guard accepts `>=1` (no code change expected) |
| `.changelogs/2026-05-02-verify-plan-criteria-pattern-a-conversion.md` | Create | Changelog fragment with sunset note |

---

### Task 1: Extend In-Progress State File Schema (schema_version 1→2, add `return_contract`)

**Files:**
- Modify: `skills/start/SKILL.md` (lines 786-816, "In-Progress State File Schema" block; line 765, initial-write helper)

**Acceptance Criteria:**
- [ ] `schema_version: 2` comment present in In-Progress State File Schema block measured by string presence verified by `grep -n "schema_version: 2" skills/start/SKILL.md`
- [ ] `return_contract` field documented in schema block for all four phases measured by occurrence count verified by `grep -c "return_contract:" skills/start/SKILL.md | grep -qE '^[4-9]|^[1-9][0-9]' && echo "ok"`
- [ ] initial-write python3 helper sets `return_contract: None` for brainstorm phase measured by string presence verified by `grep -n "return_contract.*None" skills/start/SKILL.md`
- [ ] initial-write python3 helper sets `return_contract: None` for all four phases measured by occurrence count (not line count — helper is a one-liner) verified by `grep -oE '"return_contract":None' skills/start/SKILL.md | wc -l | tr -d ' ' | grep -qE '^[4-9]|^[1-9][0-9]' && echo "ok"`
- [ ] No version-equality check (`== 1`) exists in the in-progress file update helper measured by absence verified by `grep -n "== 1" skills/start/SKILL.md | grep -v "#" | wc -l | tr -d ' ' | grep -q "^0$" && echo "ok"`
- [ ] cleanup-merged still accepts schema_version 2 files measured by exit code 0 verified by `bash -c 'printf "schema_version: 2\nslug: test\npr_number: 1\nbranch: test\nworktree_path: /tmp\nbase_branch: main\n" > /tmp/test-schema-v2.yml && python3 -c "import yaml; d=yaml.safe_load(open(\"/tmp/test-schema-v2.yml\")); assert d[\"schema_version\"] >= 1, \"guard fail\"; print(\"ok\")"'`
- [ ] Initial-write python3 helper writes `schema_version: 2` (not 1) measured by string presence verified by `grep -n '"schema_version":2' skills/start/SKILL.md`

**Quality Constraints:**
- Error handling: Schema changes are documentation-only (SKILL.md text); no runtime error handling needed. The associated python3 helper uses env vars (not inline interpolation) so apostrophes in values cannot break the `-c` argument — maintain this pattern.
- Types: `return_contract` is `object | null`; document exactly that in the YAML schema comment.
- Function length: The initial-write python3 one-liner stays as one logical line; the four `return_contract: None` additions are within that single dict literal.
- Pattern: Follow the existing `phase_summaries` dict shape in `skills/start/SKILL.md` line 765. The four phases are `brainstorm`, `design`, `plan`, `implementation`.

**Implementation:**
- In the In-Progress State File Schema YAML block (lines 786-816), change `schema_version: 1` comment to `schema_version: 2` and add `return_contract: <object|null>  # structured return contract from phase skill; null until phase completes` under each of the four phase summary blocks.
- In the initial-write python3 helper (line 765), add `"return_contract": None` to each of the four phase dicts inside `phase_summaries` (brainstorm, design, plan, implementation).
- Verify the mid-lifecycle update helper (lines 624-637) uses only `yaml.safe_load` / `yaml.dump` with no version comparison — confirm no change needed.
- Verify `skills/cleanup-merged/SKILL.md` guard says `< 1` (not `!= 1` or `== 1`) — confirm no change needed, but document the check in the commit message.

**Commit message:** `feat(schema): bump in-progress state file schema_version to 2, add return_contract field`

---

### Task 2: Create Schema Validator (`hooks/scripts/validate-return-contract.js`) and Tests

**Files:**
- Create: `hooks/scripts/validate-return-contract.js`
- Create: `hooks/scripts/validate-return-contract.test.js`

**Acceptance Criteria:**
- [ ] `hooks/scripts/validate-return-contract.js` created measured by file existence verified by `test -f hooks/scripts/validate-return-contract.js && echo "ok"`
- [ ] `hooks/scripts/validate-return-contract.test.js` created measured by file existence verified by `test -f hooks/scripts/validate-return-contract.test.js && echo "ok"`
- [ ] Validator exits 0 for a valid verify-plan-criteria contract measured by exit code verified by `node hooks/scripts/validate-return-contract.js hooks/scripts/fixtures/valid-verify-plan-criteria.json && echo "ok"`
- [ ] Validator exits non-zero and prints error for missing required field measured by exit code and output verified by `node hooks/scripts/validate-return-contract.js hooks/scripts/fixtures/invalid-missing-field.json; echo "exit:$?"`
- [ ] Validator exits non-zero for unknown phase-id measured by exit code verified by `node hooks/scripts/validate-return-contract.js hooks/scripts/fixtures/invalid-unknown-phase.json; echo "exit:$?"`
- [ ] Validator accepts input via argv path measured by exit code verified by `node hooks/scripts/validate-return-contract.js hooks/scripts/fixtures/valid-verify-plan-criteria.json && echo "ok"`
- [ ] All tests pass measured by exit code 0 verified by `node hooks/scripts/validate-return-contract.test.js`
- [ ] No `ajv` or other external schema-validation dependency used measured by absence verified by `grep -n "require.*ajv" hooks/scripts/validate-return-contract.js | wc -l | grep -q "^0$" && echo "ok"`

**Quality Constraints:**
- Error handling: On JSON parse failure, print `[validate-return-contract] parse error: <message>` to stderr and exit 1. On unknown phase-id, print `[validate-return-contract] unknown phase: <id>` to stderr and exit 1. On validation errors, print each error on its own line (no JSON output). Use the `fail-open` stderr pattern from `verdict-gate.js` only for truly unexpected internal errors.
- Types: All values validated at runtime with type checks (`typeof`, `Array.isArray`). The schema registry is a plain object literal — no dynamic construction.
- Function length: Keep `validate(phaseId, obj)` under 50 lines; extract `checkField(obj, fieldName, expectedType, errors)` as a helper function.
- Pattern: Follow `hooks/scripts/verdict-gate.js` — `'use strict'`, `#!/usr/bin/env node`, `try { main(); } catch (err) { stderr.write(...); process.exit(0); }` outer guard. Use `process.exit(1)` on failure (not `process.exit(0)` — the validator must signal failure).

**Implementation:**

`hooks/scripts/validate-return-contract.js`:

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');

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
  }
};

const VALID_STATUSES = new Set(['success', 'partial', 'failed']);

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

function validate(phaseId, obj) {
  const schema = SCHEMAS[phaseId];
  if (!schema) return [`unknown phase: ${phaseId}`];
  const errors = [];
  for (const [field, expectedType] of Object.entries(schema)) {
    checkField(obj, field, expectedType, errors);
  }
  if (!errors.length && obj.phase !== phaseId) {
    errors.push(`phase mismatch: expected "${phaseId}", got "${obj.phase}"`);
  }
  if (!errors.length && !VALID_STATUSES.has(obj.status)) {
    errors.push(`status: expected one of success|partial|failed, got "${obj.status}"`);
  }
  if (!errors.length && !Array.isArray(obj.tasks_missing_criteria)) {
    errors.push('tasks_missing_criteria: expected array');
  } else if (!errors.length) {
    for (const item of obj.tasks_missing_criteria) {
      if (typeof item !== 'string') {
        errors.push('tasks_missing_criteria: all items must be strings');
        break;
      }
    }
  }
  return errors;
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write('[validate-return-contract] usage: validate-return-contract.js <path>\n');
    process.exit(1);
  }
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); }
  catch (err) {
    process.stderr.write(`[validate-return-contract] cannot read file: ${err.message}\n`);
    process.exit(1);
  }
  let obj;
  try { obj = JSON.parse(raw); }
  catch (err) {
    process.stderr.write(`[validate-return-contract] parse error: ${err.message}\n`);
    process.exit(1);
  }
  const phaseId = obj.phase;
  if (!phaseId) {
    process.stderr.write('[validate-return-contract] missing phase field\n');
    process.exit(1);
  }
  const errors = validate(phaseId, obj);
  if (errors.length) {
    for (const e of errors) process.stdout.write(`[validate-return-contract] ERROR: ${e}\n`);
    process.exit(1);
  }
  process.stdout.write('[validate-return-contract] OK\n');
  process.exit(0);
}

try { main(); } catch (err) {
  try { process.stderr.write('[validate-return-contract] fail-open: ' + (err && err.message) + '\n'); } catch (_) {}
  process.exit(1);
}
```

`hooks/scripts/validate-return-contract.test.js` (inline Node.js assert-based tests, no test framework dependency):

```javascript
#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.resolve(__dirname, 'validate-return-contract.js');

function writeFixture(obj) {
  const p = path.join(os.tmpdir(), `vcr-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify(obj));
  return p;
}

function run(fixturePath) {
  try {
    const stdout = execSync(`node ${SCRIPT} ${fixturePath}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  PASS: ${name}`); passed++; }
  catch (err) { console.error(`  FAIL: ${name}\n    ${err.message}`); failed++; }
}

const VALID = {
  schema_version: 1,
  phase: 'verify-plan-criteria',
  status: 'success',
  plan_path: '/tmp/plan.md',
  criteria_total: 5,
  criteria_machine_verifiable: 5,
  criteria_added_by_agent: 0,
  tasks_missing_criteria: []
};

test('valid contract exits 0', () => {
  const p = writeFixture(VALID);
  const r = run(p);
  if (r.code !== 0) throw new Error(`expected exit 0, got ${r.code}\n${r.stderr}`);
});

test('missing required field exits 1', () => {
  const bad = { ...VALID }; delete bad.criteria_total;
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for missing field');
  if (!r.stdout.includes('missing required field')) throw new Error(`expected "missing required field" in output; got: ${r.stdout}`);
});

test('invalid status exits 1', () => {
  const bad = { ...VALID, status: 'unknown-status' };
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for invalid status');
});

test('unknown phase exits 1', () => {
  const bad = { ...VALID, phase: 'no-such-phase' };
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for unknown phase');
  if (!r.stderr.includes('unknown phase')) throw new Error(`expected "unknown phase" in stderr; got: ${r.stderr}`);
});

test('tasks_missing_criteria with non-string item exits 1', () => {
  const bad = { ...VALID, tasks_missing_criteria: [1, 2] };
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for non-string array items');
});

test('partial status is valid', () => {
  const partial = { ...VALID, status: 'partial', tasks_missing_criteria: ['Task 3'] };
  const p = writeFixture(partial);
  const r = run(p);
  if (r.code !== 0) throw new Error(`expected exit 0 for partial status; got ${r.code}\n${r.stderr}`);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

Also create fixture files in `hooks/scripts/fixtures/`:

`hooks/scripts/fixtures/valid-verify-plan-criteria.json`:
```json
{
  "schema_version": 1,
  "phase": "verify-plan-criteria",
  "status": "success",
  "plan_path": "/tmp/plan.md",
  "criteria_total": 3,
  "criteria_machine_verifiable": 3,
  "criteria_added_by_agent": 0,
  "tasks_missing_criteria": []
}
```

`hooks/scripts/fixtures/invalid-missing-field.json`:
```json
{
  "phase": "verify-plan-criteria",
  "status": "success",
  "plan_path": "/tmp/plan.md",
  "criteria_total": 3
}
```

`hooks/scripts/fixtures/invalid-unknown-phase.json`:
```json
{
  "schema_version": 1,
  "phase": "no-such-phase",
  "status": "success"
}
```

**Commit message:** `feat(hooks): add validate-return-contract.js with hand-rolled schema validator and tests`

---

### Task 3: Extend `verify-plan-criteria` Skill to Write Return Contract

**Files:**
- Modify: `skills/verify-plan-criteria/SKILL.md` (Step 6: Report section, and the skill's opening args docs)

**Acceptance Criteria:**
- [ ] `write_contract_to` argument documented in skill description measured by string presence verified by `grep -n "write_contract_to" skills/verify-plan-criteria/SKILL.md`
- [ ] `phase_id` argument documented in skill description measured by string presence verified by `grep -n "phase_id" skills/verify-plan-criteria/SKILL.md`
- [ ] python3 contract-write helper documented in Step 6 measured by string presence verified by `grep -n "phase_summaries" skills/verify-plan-criteria/SKILL.md`
- [ ] Contract write only executes when `write_contract_to` is set measured by conditional guard text presence verified by `grep -n "write_contract_to.*is set\|if.*write_contract_to" skills/verify-plan-criteria/SKILL.md`
- [ ] Return contract schema matches the locked spec (7 fields) measured by field name presence verified by `grep -c "criteria_total\|criteria_machine_verifiable\|criteria_added_by_agent\|tasks_missing_criteria\|plan_path\|schema_version" skills/verify-plan-criteria/SKILL.md | awk '{exit ($1>=6)?0:1}' && echo "ok"`

**Quality Constraints:**
- Error handling: The python3 helper uses `yaml.safe_load(open(f)) or {}` guard (file may not exist if the write is attempted outside a lifecycle context). Wrap the write in a try/except so failure is logged and execution continues.
- Types: The `return_contract` object values must match the locked spec exactly (`schema_version` as integer, `criteria_total` / `criteria_machine_verifiable` / `criteria_added_by_agent` as integers, `tasks_missing_criteria` as list of strings).
- Function length: The python3 one-liner stays as one logical `-c` argument; pass values via env vars.
- Pattern: Follow the mid-lifecycle update helper pattern at `skills/start/SKILL.md` lines 627-637. Use `F="$F" PHASE_ID="..." python3 -c '...'` env-var passing convention.

**Implementation:**

Add to the skill's args documentation (near the top, after the existing ARGUMENTS section):

```
**Optional output args (used when invoked from orchestrator dispatch):**
- `write_contract_to: <absolute-path-to-in-progress-yml>` — when set, writes the return contract to `phase_summaries.<phase_id>.return_contract` in that YAML file after Step 6.
- `phase_id: <phase-id-string>` — identifies which `phase_summaries` key to write into (e.g., `verify-plan-criteria`). If absent when `write_contract_to` is set, defaults to `verify-plan-criteria`.
```

After the existing Step 6 report output, add:

```
### Step 7: Write Return Contract (conditional)

**Only executes if `write_contract_to` is set in the skill's ARGUMENTS.**

Construct the return contract object:
- `schema_version`: 1 (contract schema version — not the state-file schema version)
- `phase`: the `phase_id` arg value (default `"verify-plan-criteria"`)
- `status`: `"success"` if all tasks have criteria, `"partial"` if some tasks missing criteria were approved/skipped, `"failed"` if criteria could not be established for one or more tasks
- `plan_path`: absolute path to the plan file checked
- `criteria_total`: total count of `- [ ]` criteria items across all tasks (including drafted + approved)
- `criteria_machine_verifiable`: count of criteria items that are not `[MANUAL]`
- `criteria_added_by_agent`: count of criteria items that were drafted by this skill (did not exist before)
- `tasks_missing_criteria`: list of task identifiers (e.g., `"Task 3"`) that still have no criteria after Step 5

Write the contract to the state file using this helper:

```bash
F="<write_contract_to value>"
PHASE_ID="<phase_id value, default: verify-plan-criteria>"
PLAN_PATH="<absolute plan path>"
TOTAL=<criteria_total>
MACHINE=<criteria_machine_verifiable>
ADDED=<criteria_added_by_agent>
# tasks_missing_criteria is a JSON array string, e.g. '["Task 3", "Task 7"]'
MISSING='<json-array-string>'
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

[ -f "$F" ] && F="$F" PHASE_ID="$PHASE_ID" PLAN_PATH="$PLAN_PATH" TOTAL="$TOTAL" MACHINE="$MACHINE" ADDED="$ADDED" MISSING="$MISSING" python3 -c '
import os, json, yaml
f = os.environ["F"]
d = yaml.safe_load(open(f)) or {}
phase = os.environ["PHASE_ID"]
if "phase_summaries" not in d or phase not in d["phase_summaries"]:
    print(f"[verify-plan-criteria] WARNING: phase_summaries.{phase} not found in {f}; skipping contract write")
else:
    d["phase_summaries"][phase]["return_contract"] = {
        "schema_version": 1,
        "phase": phase,
        "status": os.environ.get("STATUS", "success"),
        "plan_path": os.environ["PLAN_PATH"],
        "criteria_total": int(os.environ["TOTAL"]),
        "criteria_machine_verifiable": int(os.environ["MACHINE"]),
        "criteria_added_by_agent": int(os.environ["ADDED"]),
        "tasks_missing_criteria": json.loads(os.environ["MISSING"]),
    }
    yaml.dump(d, open(f, "w"), default_flow_style=False, allow_unicode=True)
    print(f"[verify-plan-criteria] return_contract written to {f}")
'
```

If the file does not exist or the write fails, log a warning and continue — the lifecycle remains valid.

After writing, return the state-file path and a one-line summary as the skill's result:
`"Return contract written to <path>. Criteria: <total> total, <machine> machine-verifiable, <added> added by agent. Status: <status>."`
```

**Commit message:** `feat(verify-plan-criteria): add write_contract_to/phase_id args and Step 7 contract write`

---

### Task 4: Add Pattern A Wrapper Section to `skills/start/SKILL.md`

**Files:**
- Modify: `skills/start/SKILL.md` (after the YOLO Model Routing section, circa lines 649-666; this is a new named section)

**Acceptance Criteria:**
- [ ] Pattern A wrapper section exists in start SKILL.md measured by section heading presence verified by `grep -n "Pattern A" skills/start/SKILL.md`
- [ ] Task() dispatch call documented with subagent_type, model, description, and prompt parameters measured by param presence verified by `grep -n "subagent_type.*general-purpose" skills/start/SKILL.md`
- [ ] Inline-fallback path documented in wrapper section measured by string presence verified by `grep -n "inline-fallback\|Inline-fallback\|inline fallback" skills/start/SKILL.md`
- [ ] Sunset note present in wrapper section measured by string presence verified by `grep -n "vNEXT\|two consecutive" skills/start/SKILL.md`
- [ ] Orchestrator schema-validator call documented (validate-return-contract.js) measured by string presence verified by `grep -n "validate-return-contract" skills/start/SKILL.md`
- [ ] State file read after subagent return documented measured by string presence verified by `grep -n "phase_summaries.plan.return_contract\|return_contract" skills/start/SKILL.md | grep -v "schema_version\|#" | wc -l | grep -qE "^[2-9]" && echo "ok"`

**Quality Constraints:**
- Error handling: Document three failure cases that trigger inline-fallback: (1) Task() dispatch fails/errors, (2) `return_contract` field is null/absent after subagent completes, (3) `validate-return-contract.js` exits non-zero. Each fallback path must announce what happened before invoking the inline skill.
- Types: The prompt string passed to Task() must specify all required args to the verify-plan-criteria skill including `write_contract_to` and `phase_id`.
- Function length: The wrapper section is prose+code-block documentation — no line-length constraint, but keep the Task() prompt under 400 characters.
- Pattern: Match the YOLO Task() dispatch style at lines 653-666 (code block with inline comments). The wrapper section comes AFTER the existing YOLO invocations block (after line 666) and BEFORE any new sections.

**Implementation:**

Add a new subsection after the YOLO invocations block (`### Verify Plan Criteria — Pattern A Dispatch`):

```markdown
### Verify Plan Criteria — Pattern A Dispatch

**Note:** INLINE-FALLBACK IS A ROLLOUT-ONLY FEATURE.
<!-- feature-flow vNEXT removes inline-fallback once two consecutive successful real-session uses are observed. -->

In YOLO mode, `verify-plan-criteria` is dispatched as a `Task()` subagent (Pattern A) with an
explicit `model` param and a structured return contract. The subagent writes the contract to the
in-progress state file; the orchestrator validates it before proceeding.

```
# Step: Verify plan criteria (Pattern A)
BASE_REPO=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
SLUG=<slug>
STATE_FILE="${BASE_REPO}/.feature-flow/handoffs/in-progress-${SLUG}.yml"
PLAN_PATH=<abs-path-to-plan-file>

Task(
  subagent_type: "general-purpose",
  model: "sonnet",
  description: "verify-plan-criteria Pattern A",
  prompt: "Invoke Skill(skill: 'feature-flow:verify-plan-criteria', args: 'yolo: true. plan_file: ${PLAN_PATH}. write_contract_to: ${STATE_FILE}. phase_id: verify-plan-criteria'). Return the state-file path and a 1-line summary."
)
```

After the Task() returns:

1. Read the state file and extract `phase_summaries.plan.return_contract`.
2. If `return_contract` is null or absent → **inline fallback** (see below).
3. Write `return_contract` to a temp file `/tmp/ff-return-contract-${SLUG}.json` using `python3 -c "import json, yaml; d=yaml.safe_load(open('${STATE_FILE}')); json.dump(d['phase_summaries']['plan']['return_contract'], open('/tmp/ff-return-contract-${SLUG}.json','w'))"`.
4. Run `node hooks/scripts/validate-return-contract.js /tmp/ff-return-contract-${SLUG}.json`.
5. If validator exits non-zero → **inline fallback** (see below).
6. If validator exits 0 → proceed to next lifecycle step.

**Inline-fallback path** (fires on Task() dispatch failure, missing contract, or validation failure):

```
# Announce what happened:
echo "verify-plan-criteria Pattern A: [reason — dispatch failed | no return_contract | validation failed]. Falling back to inline Skill()."

# Run inline (existing path):
Skill(skill: "feature-flow:verify-plan-criteria", args: "yolo: true. plan_file: <plan_path>")
```

<!-- SUNSET NOTE: feature-flow vNEXT removes this inline-fallback block once two consecutive
     successful real-session uses of Pattern A are observed and documented. -->
```

**Commit message:** `feat(start): add verify-plan-criteria Pattern A wrapper with Task() dispatch and inline-fallback`

---

### Task 5: Update Skill Mapping Table Row for `verify-plan-criteria`

**Files:**
- Modify: `skills/start/SKILL.md` (Skill Mapping table, line 764)

**Acceptance Criteria:**
- [ ] Skill Mapping table row for Verify plan criteria still references `feature-flow:verify-plan-criteria` measured by string presence verified by `grep -n "feature-flow:verify-plan-criteria" skills/start/SKILL.md | grep -i "verify"`
- [ ] Table row references Task() dispatch measured by string presence verified by `grep -n "Task().*dispatch\|dispatched via Task\|via Task()" skills/start/SKILL.md | grep -i "verify"`
- [ ] Table row links or references Pattern A wrapper section measured by string presence verified by `grep -n "Pattern A" skills/start/SKILL.md | grep -i "verify\|table\|mapping\|→\|see"`
- [ ] Table row mentions inline-fallback measured by string presence verified by `grep -n "inline-fallback\|fallback" skills/start/SKILL.md | grep -i "criteria\|verify"`

**Quality Constraints:**
- Error handling: No code change — documentation edit only.
- Types: N/A — Markdown table cell text.
- Function length: Keep the table row's Expected Output cell under 200 characters; link to the Pattern A section rather than repeating all details.
- Pattern: Match existing table row style; other rows use `**Bold**` for sub-items. Do not break the Markdown table alignment.

**Implementation:**

Replace the current row:
```
| Verify plan criteria | `feature-flow:verify-plan-criteria` | All tasks have verifiable criteria |
```

With:
```
| Verify plan criteria | `feature-flow:verify-plan-criteria` (invoked via Task() dispatch with `model: "sonnet"`; return contract written to state file; inline-fallback path retained — see **Pattern A wrapper** section below) | All tasks have verifiable criteria; structured return contract in `phase_summaries.plan.return_contract` |
```

**Commit message:** `docs(start): update skill mapping table row for verify-plan-criteria Pattern A dispatch`

---

### Task 6: Write CHANGELOG Fragment

**Files:**
- Create: `.changelogs/2026-05-02-verify-plan-criteria-pattern-a-conversion.md`

**Acceptance Criteria:**
- [ ] `.changelogs/2026-05-02-verify-plan-criteria-pattern-a-conversion.md` created measured by file existence verified by `test -f .changelogs/2026-05-02-verify-plan-criteria-pattern-a-conversion.md && echo "ok"`
- [ ] Entry references issue #251 measured by string presence verified by `grep -n "#251" .changelogs/2026-05-02-verify-plan-criteria-pattern-a-conversion.md`
- [ ] Entry contains sunset note measured by string presence verified by `grep -n "vNEXT\|two consecutive\|sunset" .changelogs/2026-05-02-verify-plan-criteria-pattern-a-conversion.md`
- [ ] Entry categorized as feat or enhancement (not fix) measured by category word presence verified by `grep -niE "^#{1,3}.*(feat|feature|enhancement)" .changelogs/2026-05-02-verify-plan-criteria-pattern-a-conversion.md`

**Quality Constraints:**
- Error handling: `mkdir -p .changelogs/` before writing — the directory does not currently exist in this worktree.
- Types: N/A — Markdown text.
- Function length: N/A.
- Pattern: Match the structure of existing `.changelogs/*.md` files — check one (e.g., `2026-05-02-overlap-ci-bot-detection.md` in `docs/plans/`, or an actual `.changelogs/*.md` in the base repo).

**Implementation:**

First create the directory: `mkdir -p .changelogs/`

Then write `.changelogs/2026-05-02-verify-plan-criteria-pattern-a-conversion.md`:

```markdown
## feat: verify-plan-criteria converted to Pattern A subagent dispatch (#251)

`feature-flow:verify-plan-criteria` is now dispatched as a `Task()` subagent (model: sonnet)
instead of an inline `Skill()` call. The subagent writes a structured return contract to
the in-progress state file (`phase_summaries.plan.return_contract`); the orchestrator validates
it with `hooks/scripts/validate-return-contract.js` before proceeding.

**Changes:**
- `skills/start/SKILL.md`: schema_version bumped to 2; `return_contract` field added to all four
  `phase_summaries` phase blocks; Pattern A wrapper section added; Skill Mapping table updated.
- `hooks/scripts/validate-return-contract.js`: new hand-rolled JSON Schema validator for phase
  return contracts; no external dependencies.
- `skills/verify-plan-criteria/SKILL.md`: new optional args `write_contract_to` and `phase_id`;
  Step 7 writes the return contract to the state file when invoked from dispatch.

**Rollout note:** An inline-fallback path is retained for this release. If Task() dispatch fails,
the contract is absent, or schema validation fails, the orchestrator falls back to the existing
inline `Skill()` path and announces why.

**Sunset:** feature-flow vNEXT removes the inline-fallback once two consecutive successful
real-session uses of Pattern A are observed and documented.
```

**Commit message:** `chore(changelog): add fragment for verify-plan-criteria Pattern A conversion (#251)`

---

### Task 7: Real-Session Context-Reduction Measurement (Manual — Post-PR)

**Files:**
- No file changes — manual measurement task.

**Acceptance Criteria:**
- [ ] [MANUAL] After PR is merged, run a real lifecycle session that reaches the verify-plan-criteria step with the new Pattern A dispatch active
- [ ] [MANUAL] Capture per-phase context-contributor data using issue #253's measurement method (run the measurement against the orchestrator session that used the dispatched verify-plan-criteria)
- [ ] [MANUAL] Confirm orchestrator-context reduction for verify-plan-criteria phase is ≥5% compared to baseline (inline Skill() invocation); if reduction is <5%, document the finding and initiate the abort process per #251's per-phase decision rule
- [ ] [MANUAL] Post the measurement results as a comment on the PR (or on issue #251) with: phase, baseline context size, Pattern A context size, percentage reduction, and pass/fail verdict

**Quality Constraints:**
- Error handling: If the measurement shows <5% reduction, do not remove the Pattern A dispatch — instead open a follow-up issue against #251's decision framework before reverting.
- Types: N/A — manual measurement.
- Function length: N/A.
- Pattern: Reference #253's per-phase measurement method for consistent baseline comparison.

**Implementation:**

1. After the PR from this branch is merged to main, start a new feature-flow session on any feature with a real plan file (does not need to be a significant feature).
2. When the lifecycle reaches "Verify plan criteria", confirm the Pattern A wrapper fires (not the inline path) by checking the session output for `"verify-plan-criteria Pattern A"` in the Task() dispatch announcement.
3. After the session completes, capture the orchestrator's per-phase token/context usage using the #253 measurement tooling.
4. Compare the verify-plan-criteria phase context to the historical baseline from inline Skill() runs.
5. Post the measurement as a PR comment with the format:

```
## Pattern A Context Measurement — verify-plan-criteria

| Metric | Baseline (inline) | Pattern A (dispatch) | Delta |
|--------|------------------|---------------------|-------|
| Orchestrator context (tokens) | <N> | <M> | <pct>% |
| Verdict | — | — | PASS (≥5%) / FAIL (<5%) |
```

---

## Self-Review

### Spec Coverage Check

| Spec requirement | Covered by task |
|-----------------|----------------|
| B1: State-file schema extension (`return_contract` field, schema bump) | Task 1 |
| B1: initial-write helper updated with `return_contract: None` | Task 1 |
| B1: cleanup-merged schema guard verified | Task 1 |
| B2: `validate-return-contract.js` created (Node.js, no ajv, hand-rolled) | Task 2 |
| B2: Schema registry with verify-plan-criteria contract | Task 2 |
| B2: Stdin/argv input; non-zero exit on failure | Task 2 |
| verify-plan-criteria skill: `write_contract_to` and `phase_id` args | Task 3 |
| verify-plan-criteria skill: writes contract after Step 6 | Task 3 |
| Pattern A wrapper in start SKILL.md (inline, not subdirectory) | Task 4 |
| Task() dispatch with model: sonnet | Task 4 |
| Inline-fallback (3 trigger conditions) | Task 4 |
| Sunset note in wrapper comments | Task 4 |
| Skill Mapping table row updated | Task 5 |
| CHANGELOG fragment with sunset note | Task 6 |
| Real-session context-reduction measurement (≥5%) | Task 7 |

### Placeholder Scan

All tasks contain concrete file paths, actual code blocks, and specific `grep`/`test` commands. No "TBD", "TODO", or vague descriptions found.

### Type Consistency Check

- `return_contract` object uses `schema_version: 1` (contract schema) consistently across Task 3 (skill writes it), Task 2 (validator checks it), and Task 4 (orchestrator reads it).
- `phase_summaries.plan.return_contract` is the write target in both Task 3 (skill) and Task 4 (orchestrator reads) — consistent.
- `validate-return-contract.js` takes a file path as `process.argv[2]` — consistent between Task 2 (creation) and Task 4 (orchestrator call: `node hooks/scripts/validate-return-contract.js /tmp/ff-return-contract-${SLUG}.json`).
- `tasks_missing_criteria` is `array of strings` in both the locked spec (brief) and the validator (`'array'` + string-item check) — consistent.
