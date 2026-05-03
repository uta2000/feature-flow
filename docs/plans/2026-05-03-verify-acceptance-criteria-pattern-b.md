# verify-acceptance-criteria Pattern B Conversion — Implementation Plan

**Date:** 2026-05-03
**Issue:** #251 (Wave 3 phase 4)
**Status:** Ready for implementation
**Reference PR:** #263 (design-document Pattern B precedent)
**Reference PR:** #262 (verify-plan-criteria Pattern A precedent — validator + e2e + fixtures)

## Summary

Convert `feature-flow:verify-acceptance-criteria` from inline-skill-with-internal-Task() to Pattern B
subagent dispatch (per #251). The current skill internally dispatches one `feature-flow:task-verifier`
subagent at Step 3 — which **silently fails inside a wrapping subagent** because subagents cannot
dispatch sub-subagents (per #251 Q1). Pattern B fixes this by hoisting the task-verifier dispatch to
the orchestrator and isolating the rest of the skill (Steps 4-5 + contract write) inside a
consolidator subagent.

**Architectural deviation from the design-document precedent: skip the state-file bucket.** Verify-acceptance-criteria does not own
a dedicated `phase_summaries` bucket (the four buckets are `brainstorm | design | plan | implementation`,
all already claimed by phase-boundary writes; the natural `implementation` bucket would collide with
the future Phase 6 `subagent-driven-development` Pattern B contract). The contract is written
directly to a tmp JSON file the orchestrator validates and then discards. No schema bump. Documented
in the Pattern B wrapper section.

## Locked return contract

Per #251 (exemplar 2 in the issue body, locked before any implementation):

```json
{
  "schema_version": 1,
  "phase": "verify-acceptance-criteria",
  "status": "success | partial | failed",
  "report_path": "string (abs path to detailed pass/fail report)",
  "pass_count": "integer",
  "fail_count": "integer",
  "failed_criteria": ["array of {task_id: string, criterion: string, reason: string}"]
}
```

**Status semantics:**
- `success` — all criteria PASS or CANNOT_VERIFY (verdict VERIFIED)
- `partial` — at least one criterion FAIL (verdict INCOMPLETE)
- `failed` — verifier could not run (verdict BLOCKED — broken build, missing deps)

**Validator extension:** `failed_criteria` is array-of-objects, a new shape the validator does not
currently support. Extend the validator with a typed array-of-objects check (mirrors the existing
`tasks_missing_criteria` array-of-strings check; same hand-rolled style — no `ajv` dependency).

## Tasks

### Task 1 — Extend validator schema for verify-acceptance-criteria

Add a SCHEMAS entry for `verify-acceptance-criteria`. Add an array-of-objects validation
function (`checkArrayOfObjects`) that walks `failed_criteria` and verifies each item is an
object with required string keys `task_id`, `criterion`, `reason`.

**Acceptance Criteria:**
- [ ] `hooks/scripts/validate-return-contract.js` `SCHEMAS` object contains a `'verify-acceptance-criteria'` key
- [ ] The schema declares 7 fields: `schema_version`, `phase`, `status`, `report_path`, `pass_count`, `fail_count`, `failed_criteria`
- [ ] Validator code includes a per-item check for `failed_criteria` array elements (each must be object with `task_id`, `criterion`, `reason` string fields)
- [ ] Running `node hooks/scripts/validate-return-contract.js hooks/scripts/fixtures/valid-verify-acceptance-criteria.json` exits 0 (after Task 2 ships the fixture)

### Task 2 — Add fixture and unit tests

Create a valid fixture and extend the validator unit tests with verify-acceptance-criteria coverage.

**Acceptance Criteria:**
- [ ] File exists at `hooks/scripts/fixtures/valid-verify-acceptance-criteria.json`
- [ ] Fixture's `phase` field is the string `"verify-acceptance-criteria"`
- [ ] Fixture's `failed_criteria` is an empty array `[]` (success case)
- [ ] `hooks/scripts/validate-return-contract.test.js` defines `VALID_VAC` constant with all 7 fields
- [ ] Test "verify-acceptance-criteria: valid contract exits 0" passes
- [ ] Test "verify-acceptance-criteria: missing required field exits 1" passes (delete `pass_count`)
- [ ] Test "verify-acceptance-criteria: failed_criteria with non-object item exits 1" passes (item is a string)
- [ ] Test "verify-acceptance-criteria: failed_criteria object missing task_id exits 1" passes
- [ ] Test "verify-acceptance-criteria: partial status with non-empty failed_criteria is valid" passes
- [ ] `node hooks/scripts/validate-return-contract.test.js` exits 0 with all tests passing

### Task 3 — Modify verify-acceptance-criteria SKILL.md to support consolidator mode

Add an "Optional Args" section documenting `verifier_report_path`, `write_contract_to`, and
`phase_id` (consolidator mode). When `verifier_report_path` is set, skill skips Step 3
(task-verifier dispatch — already done by the orchestrator) and reads the report from the path.
When `write_contract_to` is set, the skill writes the contract to that JSON path after Step 4.

**Acceptance Criteria:**
- [ ] `skills/verify-acceptance-criteria/SKILL.md` contains an "## Optional Args" section
- [ ] Section documents two args: `verifier_report_path`, `write_contract_to`
- [ ] Section explicitly notes that `write_contract_to` is a JSON file path (not a state-file YAML), distinguishing this from design-document's state-file integration
- [ ] Step 3 in the skill includes a "Pattern B consolidator-mode early exit" branch that reads the verifier report from `verifier_report_path` instead of dispatching the task-verifier subagent
- [ ] A new "Step 6: Write Return Contract (conditional)" section exists after Step 5
- [ ] Step 6 only executes when `write_contract_to` is set in ARGUMENTS
- [ ] Step 6 writes contract with all 7 locked fields including `phase: "verify-acceptance-criteria"` (hardcoded — not derived from any arg)
- [ ] Step 6 uses env-var passing (apostrophe-safe) and `python3 -c` for the JSON write
- [ ] Step 6 emits a result string starting with `"Return contract written to <write_contract_to>."`

### Task 4 — Add Pattern B wrapper to start/SKILL.md

Add a new "Verify Acceptance Criteria — Pattern B Dispatch" subsection in `skills/start/SKILL.md`
mirroring the design-document precedent at line 757. Update the Pattern A/B summary line to
list `verify-acceptance-criteria` alongside `design-document`.

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains a new section heading `### Verify Acceptance Criteria — Pattern B Dispatch`
- [ ] Section is positioned after the existing "Design Document — Pattern B Dispatch" section
- [ ] Section opens with the `INLINE-FALLBACK IS A ROLLOUT-ONLY FEATURE` note plus an HTML-comment SUNSET line referencing `feature-flow vNEXT+1`
- [ ] Section includes "Sub-step 1 — Hoisted task-verifier dispatch" with explicit `model: "haiku"` and `subagent_type: "feature-flow:task-verifier"`
- [ ] Sub-step 1's prompt instructs the task-verifier to read the plan, extract criteria, write the detailed report to `${REPORT_PATH}`, and return a short JSON summary
- [ ] Section includes "Sub-step 2 — Consolidator dispatch" with explicit `model: "sonnet"` and `subagent_type: "general-purpose"`
- [ ] Sub-step 2 dispatches `feature-flow:verify-acceptance-criteria` with `verifier_report_path`, `write_contract_to`, and `plan_file` args
- [ ] Section includes a "Why skip the state-file bucket" rationale paragraph (4 fixed buckets all claimed; future Phase 6 collision; no cross-compaction reader needed)
- [ ] Section includes a 4-row inline-fallback table covering: task-verifier dispatch failure, consolidator dispatch failure, missing contract file, validator non-zero exit
- [ ] Inline-fallback target is the bare `Skill(skill: "feature-flow:verify-acceptance-criteria", args: "plan_file: <path>")` form
- [ ] The line at `skills/start/SKILL.md:683` (Pattern A/B status summary) lists `verify-acceptance-criteria` as converted to Pattern B
- [ ] The Skill Mapping row for `Verify acceptance criteria` is added (or the Final Verification step description is updated) to reference the new Pattern B Dispatch section

### Task 5 — Update inline-steps.md Final Verification step to use Pattern B

The verify-acceptance-criteria call site is the Final Verification inline step (`skills/start/references/inline-steps.md:489`).
Replace the bare "Always run verify-acceptance-criteria" sentence with a reference to the new
Pattern B wrapper section in start/SKILL.md.

**Acceptance Criteria:**
- [ ] `skills/start/references/inline-steps.md` Final Verification step (line ~489 area) explicitly references the Pattern B Dispatch section in `skills/start/SKILL.md`
- [ ] The reference makes clear that verify-acceptance-criteria runs via Pattern B in all modes (YOLO, Express, Interactive)
- [ ] The "Always run" semantics are preserved — the step still always invokes verify-acceptance-criteria regardless of quality-gate skip status

### Task 6 — Add e2e round-trip test for Pattern B verify-acceptance-criteria pipeline

Extend `hooks/scripts/validate-return-contract.e2e.sh` with a third pipeline section: build a
contract object as the consolidator subagent would, write it directly to a tmp JSON file (no
state-file mediation — that's the architectural deviation), and run the validator against it.

**Acceptance Criteria:**
- [ ] `hooks/scripts/validate-return-contract.e2e.sh` contains a new section header `# Pattern B round-trip — verify-acceptance-criteria`
- [ ] Section writes a JSON contract directly to `/tmp/ff-verify-ac-contract-${SLUG}.json` (no state-file write — verify in section comment that this is intentional)
- [ ] Section's contract has `phase: "verify-acceptance-criteria"` and all 7 locked fields
- [ ] Section runs `node "${SCRIPT_DIR}/validate-return-contract.js" "$VAC_CONTRACT_JSON"`
- [ ] Section emits a `e2e PASS (verify-acceptance-criteria Pattern B)` line on success
- [ ] Trap cleanup is updated to also remove the new tmp contract file
- [ ] `bash hooks/scripts/validate-return-contract.e2e.sh` exits 0 end-to-end (all three pipelines pass)

### Task 7 — Generate CHANGELOG fragment

Write a single-file changelog fragment under `.changelogs/` describing the Pattern B conversion
and the architectural deviation (bucket-skip).

**Acceptance Criteria:**
- [ ] File exists at `.changelogs/2026-05-03-verify-acceptance-criteria-pattern-b.md`
- [ ] Fragment includes the conversion summary (verify-acceptance-criteria → Pattern B per #251 Wave 3 phase 4)
- [ ] Fragment notes the bucket-skip architectural deviation explicitly
- [ ] Fragment notes the inline-fallback sunset target (vNEXT+1)

## Implementation order

Tasks must run sequentially:
1. Task 1 (validator schema)
2. Task 2 (fixture + unit tests) — depends on Task 1
3. Task 3 (skill consolidator mode) — independent of 1/2 mechanically but logically follows
4. Task 4 (start/SKILL.md wrapper) — depends on Tasks 1 + 3 contracts being settled
5. Task 5 (inline-steps.md call-site update) — depends on Task 4
6. Task 6 (e2e test) — depends on Task 1
7. Task 7 (CHANGELOG fragment) — last

## Out of scope

- **Modifying `agents/task-verifier.md`** — the existing agent already does the right work
  (read criteria, verify, report). The Pattern B wrapper provides the criteria-extraction
  prompt directly to task-verifier rather than having the skill extract first. No changes to
  the agent definition itself.
- **State-file integration for verify-acceptance-criteria's contract** — explicitly rejected
  per the bucket-skip rationale. Phase 6 (implementation) will own `phase_summaries.implementation.return_contract`.
- **Measurement (#253)** — deferred to post-merge real-session use, per the same deferral
  noted in PR #263. The conversion's per-phase decision rule (≥5% reduction or drop) is
  evaluated in a follow-up iteration after at least one real-session use.
- **Sunsetting design-document's inline-fallback** — separate PR after two real-session uses
  of PR #263's Pattern B path, tracked in #251.
- **Sunsetting verify-plan-criteria's inline-fallback** — separate PR; its sunset clock has
  not yet completed (only one real-session use observed per #263's PR body).
