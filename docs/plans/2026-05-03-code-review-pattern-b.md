# code-review Pattern B Conversion — Implementation Plan

**Date:** 2026-05-03
**Issue:** #251 (Wave 3 phase 5)
**Status:** Ready for implementation
**Reference PR:** #264 (verify-acceptance-criteria Pattern B precedent — bucket-skip variant)
**Reference PR:** #263 (design-document Pattern B precedent — validator + e2e shape)
**Locked contract:** https://github.com/uta2000/feature-flow/issues/251#issuecomment-4366218476

## Summary

Convert the **Code Review** lifecycle step (currently driven inline from `skills/start/SKILL.md` via `skills/start/references/code-review-pipeline.md`) to Pattern B subagent dispatch per #251. The orchestrator continues to dispatch the parallel reviewer fanout (Phase 1a pr-review-toolkit + Phase 1b report-only agents + Phase 1c senior panel) — those dispatches MUST stay orchestrator-side because subagents cannot recursively dispatch (#251 Q1). A new consolidator subagent ingests the reviewer outputs and runs Phases 2-5 in isolation: conflict detection, fix application, targeted re-verification, report assembly, and contract write.

**Bucket-skip variant.** Mirror PR #264 (`verify-acceptance-criteria`). The four `phase_summaries` buckets (`brainstorm`, `design`, `plan`, `implementation`) are all claimed; the natural `implementation` slot is reserved for Wave 3 phase 6's `subagent-driven-development` Pattern B contract. Code-review is a verification step within the implementation phase, not a phase that owns a bucket. The consolidator writes the contract directly to `/tmp/ff-code-review-contract-${SLUG}.json` and the orchestrator validates from that path.

## Locked return contract

Per #251 Wave 3 phase 5 contract comment (locked before any implementation):

```json
{
  "schema_version": 1,
  "phase": "code-review",
  "status": "success | partial | failed",
  "verdict": "approve | needs_changes | blocked",
  "report_path": "string (absolute path to the persisted code-review report on disk)",
  "critical_count": "integer",
  "important_count": "integer",
  "minor_count": "integer",
  "fixed_in_pipeline": [{"severity": "critical|important|minor", "summary": "string"}],
  "deferred":          [{"severity": "critical|important|minor", "summary": "string", "reason": "string"}]
}
```

**Validator extension.** Two new array-of-objects shapes (`fixed_in_pipeline`, `deferred`) plus a closed-enum check on `verdict`. Mirrors the `failed_criteria` array-of-objects validation shipped in PR #264; same hand-rolled style — no `ajv` dependency.

## Architectural decisions (locked from advisor consultation)

1. **Consolidator scope = Phases 2-5 entirely.** Phase 0 (deterministic pre-filter), Phase 1a (pr-review-toolkit dispatch), Phase 1b (report-only parallel dispatches), and Phase 1c (senior panel dispatch) all stay orchestrator-side. The constraint that decides what goes where: *can it dispatch Agent/Task?* If yes → orchestrator. If no → consolidator.
2. **Phase 4 `verify-acceptance-criteria` re-verify row is dropped from Pattern B.** Post-#264, the verify-acceptance-criteria skill internally `Task()`s the task-verifier — which silently fails inside a wrapping subagent (Q1). The Final Verification inline step runs verify-acceptance-criteria immediately after the code-review step anyway, so the Phase 4 row is duplicate work.
3. **Phase 4 agent re-dispatch becomes explicit `deferred[]` entries.** Each re-dispatch row that triggers in the consolidator yields a `deferred[]` entry with `reason: "agent re-dispatch unavailable in Pattern B consolidator"`. This keeps the verdict honest — the consolidator MUST NOT return `verdict: "approve"` while critical findings remain unverified by their original reporter.
4. **Phase 1c `[session:$LIFECYCLE_SESSION]` correlation token flows through.** The orchestrator passes the session slug into the consolidator dispatch prompt; the consolidator stamps it on every Phase 5 report entry per `senior-panel.md` requirements.
5. **Pattern B wrapper applies at every scope where the existing pipeline runs.** Quick fix is already skipped (no change). Small enhancement, Feature, and Major feature all use Pattern B. Do not narrow.

## Tasks

### Task 1 — Extend validator schema for `code-review`

Add a `SCHEMAS['code-review']` entry to `hooks/scripts/validate-return-contract.js`. Add closed-enum validation for `verdict`. Add per-item validation for `fixed_in_pipeline[]` (each item: `{severity: string ∈ {critical, important, minor}, summary: string}`) and `deferred[]` (each item: `{severity: string ∈ {critical, important, minor}, summary: string, reason: string}`).

**Acceptance Criteria:**
- [ ] `hooks/scripts/validate-return-contract.js` `SCHEMAS` object contains a `'code-review'` key
- [ ] The schema declares 10 fields: `schema_version`, `phase`, `status`, `verdict`, `report_path`, `critical_count`, `important_count`, `minor_count`, `fixed_in_pipeline`, `deferred`
- [ ] Validator code includes a closed-enum check rejecting any `verdict` value other than `approve`, `needs_changes`, `blocked`
- [ ] Validator code includes a per-item check for `fixed_in_pipeline[]`: each item must be an object with string fields `severity`, `summary`; `severity` must be one of `critical | important | minor`
- [ ] Validator code includes a per-item check for `deferred[]`: each item must be an object with string fields `severity`, `summary`, `reason`; `severity` must be one of `critical | important | minor`
- [ ] Running `node hooks/scripts/validate-return-contract.js hooks/scripts/fixtures/valid-code-review.json` exits 0 (after Task 2 ships the fixture)

### Task 2 — Add fixture and unit tests for `code-review` schema

Create a valid fixture and extend the validator unit tests with code-review coverage. Mirror PR #264's test structure (one VALID constant + ~7 test functions covering valid case, missing field, bad item shapes, valid enum-rejection cases).

**Acceptance Criteria:**
- [ ] File exists at `hooks/scripts/fixtures/valid-code-review.json`
- [ ] Fixture's `phase` field is the string `"code-review"`
- [ ] Fixture has `verdict: "approve"`, `critical_count: 0`, `important_count: 0`, `minor_count: 0`, `fixed_in_pipeline: []`, `deferred: []` (clean success case)
- [ ] `hooks/scripts/validate-return-contract.test.js` defines a `VALID_CR` constant with all 10 fields
- [ ] Test "code-review: valid contract exits 0" passes
- [ ] Test "code-review: missing required field exits 1" passes (delete `verdict`)
- [ ] Test "code-review: invalid verdict value exits 1" passes (set `verdict: "approved"` — wrong enum)
- [ ] Test "code-review: fixed_in_pipeline with non-object item exits 1" passes (item is a string)
- [ ] Test "code-review: fixed_in_pipeline with bad severity exits 1" passes (severity is `"high"`)
- [ ] Test "code-review: deferred missing reason exits 1" passes (item lacks `reason` field)
- [ ] Test "code-review: needs_changes verdict with non-empty fixed_in_pipeline + deferred is valid" passes
- [ ] `node hooks/scripts/validate-return-contract.test.js` exits 0 with all tests passing

### Task 3 — Restructure `code-review-pipeline.md` for Pattern B consolidator mode

Modify `skills/start/references/code-review-pipeline.md` to clearly delineate orchestrator-owned phases (0, 1a, 1b, 1c) from consolidator-owned phases (2, 3, 4, 5 + contract write). The doc's Process section is reorganised into two halves with an explicit handoff. The consolidator section embeds:
- A new "Pattern B handoff" subsection at the top of Phase 2 explaining what the consolidator receives (raw Phase 1a/1b/1c outputs + `lifecycle_session` token + `write_contract_to` path)
- The Phase 4 row for `superpowers:code-reviewer rule 6 → run verify-acceptance-criteria` is deleted from the targeted-checks table with a note that Final Verification covers it
- A new Phase 4 paragraph explaining that agent re-dispatch is unavailable inside the consolidator: each re-dispatch row that triggers writes a `deferred[]` entry to the contract instead of dispatching
- A new "Phase 5: Report and Contract Write" subsection that adds the contract construction + write step (mirrors PR #264's verify-acceptance-criteria Step 6 helper) and requires every report entry to carry the `[session:$LIFECYCLE_SESSION]` token
- The Phase 1c `[session:$LIFECYCLE_SESSION]` correlation requirement is restated at the consolidator boundary so it's preserved through the handoff

**Acceptance Criteria:**
- [ ] `skills/start/references/code-review-pipeline.md` contains a new top-level subsection heading `## Pattern B handoff (orchestrator → consolidator)`
- [ ] The handoff subsection enumerates exactly four inputs the consolidator receives: Phase 1a summary, Phase 1b structured findings, Phase 1c findings (when present), and `lifecycle_session` slug
- [ ] The handoff subsection states explicitly that the consolidator owns Phases 2, 3, 4, 5
- [ ] The Phase 4 targeted-checks table no longer contains a row for `superpowers:code-reviewer rule 6 → verify-acceptance-criteria`
- [ ] A note exists immediately after the Phase 4 targeted-checks table explaining the deletion ("Final Verification covers this — see `skills/start/references/inline-steps.md` Final Verification Step")
- [ ] Phase 4 contains a new paragraph stating that agent re-dispatch is unavailable in the consolidator and that each row that would have triggered re-dispatch instead writes a `deferred[]` entry with `reason: "agent re-dispatch unavailable in Pattern B consolidator"` to the return contract
- [ ] Phase 4 paragraph explicitly forbids returning `verdict: "approve"` when `deferred[]` is non-empty due to agent re-dispatch unavailability
- [ ] Phase 5 contains a new "Contract Write" subsection (or equivalent named heading) directing the consolidator to write the contract to the orchestrator-provided `write_contract_to` JSON path with all 10 locked fields including `phase: "code-review"` (hardcoded — not derived from any arg)
- [ ] The Contract Write subsection uses env-var passing and `python3 -c` for the JSON write (mirrors PR #264 Step 6 helper)
- [ ] Phase 5 explicitly requires every report entry produced by the consolidator to carry the `[session:$LIFECYCLE_SESSION]` correlation token (preserves the senior-panel.md requirement)
- [ ] The doc's existing "Phase 5: Report" output template is extended with the verdict line emitted from the consolidator

### Task 4 — Add "Code Review — Pattern B Dispatch" wrapper to `skills/start/SKILL.md`

Add a new subsection in `skills/start/SKILL.md` mirroring the existing "Verify Acceptance Criteria — Pattern B Dispatch" section (line ~867). The wrapper documents:
- Sub-step 1 (already-existing orchestrator behavior — Phase 0 pre-filter)
- Sub-step 2 (already-existing orchestrator dispatches — Phase 1a, 1b, 1c)
- Sub-step 3 (NEW — single consolidator `Task()` dispatch with `model: "sonnet"` and `subagent_type: "general-purpose"`)
- Inline-fallback table (4 cases mirroring PR #264)
- Bucket-skip rationale paragraph
- Sunset note (vNEXT+1)

Update the Pattern A/B status summary line at SKILL.md:683 to list `code-review` alongside `verify-acceptance-criteria`.

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains a new section heading `### Code Review — Pattern B Dispatch`
- [ ] The new section is positioned after the existing "Verify Acceptance Criteria — Pattern B Dispatch" section
- [ ] Section opens with the `INLINE-FALLBACK IS A ROLLOUT-ONLY FEATURE` note plus an HTML-comment SUNSET line referencing `feature-flow vNEXT+1`
- [ ] Section explicitly says it applies in all modes (YOLO, Express, Interactive) at every scope where the existing pipeline runs (Small enhancement, Feature, Major feature — Quick fix already skipped)
- [ ] Section includes a "Why skip the state-file bucket" rationale paragraph (4 fixed buckets all claimed; future Phase 6 collision; no cross-compaction reader needed)
- [ ] Section documents Sub-step 1 (Phase 0 pre-filter — orchestrator-side, unchanged)
- [ ] Section documents Sub-step 2 (Phase 1a/1b/1c parallel reviewer dispatches — orchestrator-side, unchanged; subagents cannot recursively dispatch per Q1)
- [ ] Section documents Sub-step 3: a single consolidator `Task()` dispatch with explicit `model: "sonnet"`, `subagent_type: "general-purpose"`, and a description like `"code-review Pattern B consolidator"`
- [ ] Sub-step 3's prompt passes the consolidator: the Phase 1a summary, the Phase 1b findings, the Phase 1c findings (or empty), the `lifecycle_session` slug, the `write_contract_to` JSON path, and the plan-file path
- [ ] Sub-step 3's prompt instructs the consolidator to read `skills/start/references/code-review-pipeline.md` Phases 2-5 and execute them in isolation, write the report, and write the contract to `${CONTRACT_PATH}`
- [ ] Section includes a 4-row inline-fallback table covering: Phase 1a/1b/1c dispatch failure (existing handlers retained), consolidator dispatch failure, missing contract file, validator non-zero exit
- [ ] Inline-fallback target for consolidator failure cases is the existing inline pipeline path (read `code-review-pipeline.md` and run Phases 2-5 inline)
- [ ] Post-dispatch sequence documents: `[ -f "${CONTRACT_PATH}" ]` check, `node hooks/scripts/validate-return-contract.js "${CONTRACT_PATH}"`, then read of `verdict` from the contract to feed the lifecycle decision (verdict = `blocked` halts the lifecycle; `needs_changes` continues but flags the PR; `approve` continues normally)
- [ ] The line at `skills/start/SKILL.md:683` (Pattern A/B status summary) lists `code-review` as converted to Pattern B and removes it from the "Future conversions" list (only `implementation` remains)

### Task 5 — Update Skill-mapping table row for Code review in `skills/start/SKILL.md`

The Skill-mapping table at SKILL.md line ~1028 has a `Code review` row currently saying `No skill — inline step (see below)`. Update the row's "Expected Output" or description column to reference the new "Code Review — Pattern B Dispatch" section, mirroring the verify-acceptance-criteria row update done in PR #264.

**Acceptance Criteria:**
- [ ] The Skill-mapping table row for `Code review` references the new "Code Review — Pattern B Dispatch" section in `skills/start/SKILL.md`
- [ ] The row notes that the contract is written to `/tmp/ff-code-review-contract-<slug>.json` (no state-file bucket)
- [ ] The row notes that Pattern B applies in all modes (YOLO, Express, Interactive)
- [ ] The "All Critical/Important findings fixed, tests pass" semantics in the Expected Output are preserved (or expanded to add: `verdict ∈ {approve, needs_changes}` returned via validated contract; `blocked` halts the lifecycle)

### Task 6 — Add e2e round-trip test for Pattern B `code-review` pipeline

Extend `hooks/scripts/validate-return-contract.e2e.sh` with a fourth pipeline section (after the existing verify-acceptance-criteria one): build a contract object as the consolidator subagent would, write it directly to `/tmp/ff-code-review-contract-${SLUG}.json` (no state-file mediation), and run the validator against it. Update the trap cleanup to remove the new tmp file.

**Acceptance Criteria:**
- [ ] `hooks/scripts/validate-return-contract.e2e.sh` contains a new section header `# Pattern B round-trip — code-review`
- [ ] Section writes a JSON contract directly to `/tmp/ff-code-review-contract-${SLUG}.json` (no state-file write — verify in section comment that this is intentional, mirroring the verify-acceptance-criteria section)
- [ ] Section's contract has `phase: "code-review"`, `verdict: "approve"`, and all 10 locked fields populated
- [ ] Section runs `node "${SCRIPT_DIR}/validate-return-contract.js" "$CR_CONTRACT_JSON"`
- [ ] Section emits an `e2e PASS (code-review Pattern B)` line on success
- [ ] Trap cleanup is updated to also remove the new tmp contract file (`rm -f` covers all four contract paths)
- [ ] `bash hooks/scripts/validate-return-contract.e2e.sh` exits 0 end-to-end (all four pipelines pass)

### Task 7 — Generate CHANGELOG fragment

Write a single-file changelog fragment under `.changelogs/` describing the Pattern B conversion, the bucket-skip architectural deviation, the consolidator scope (Phases 2-5), the dropped Phase 4 row, the agent re-dispatch → deferred[] mapping, and the inline-fallback sunset target.

**Acceptance Criteria:**
- [ ] File exists at `.changelogs/2026-05-03-code-review-pattern-b.md`
- [ ] Fragment includes the conversion summary (code-review → Pattern B per #251 Wave 3 phase 5)
- [ ] Fragment notes the bucket-skip architectural deviation explicitly (mirrors PR #264)
- [ ] Fragment notes that the consolidator owns Phases 2-5; orchestrator retains Phases 0, 1a, 1b, 1c
- [ ] Fragment notes the Phase 4 `verify-acceptance-criteria` row deletion and the Final Verification redundancy rationale
- [ ] Fragment notes the Phase 4 agent-re-dispatch → `deferred[]` mapping
- [ ] Fragment notes the inline-fallback sunset target (vNEXT+1)

## Implementation order

Tasks must run sequentially (sequential dependencies, not parallel):

1. Task 1 (validator schema) — foundation
2. Task 2 (fixture + unit tests) — depends on Task 1
3. Task 3 (code-review-pipeline.md restructure) — independent of validator work
4. Task 4 (start/SKILL.md Pattern B wrapper) — depends on Tasks 1 + 3 contracts being settled
5. Task 5 (Skill-mapping table row) — depends on Task 4
6. Task 6 (e2e round-trip test) — depends on Task 1
7. Task 7 (CHANGELOG fragment) — last

Tasks 1+2 can run before 3, then 3 can run independently of 1/2, then 4+5+6+7 in order. In practice, run 1→2→3→4→5→6→7 sequentially to keep the diff coherent.

## Out of scope

- **Modifying `pr-review-toolkit:review-pr` or any of the report-only agents** — Pattern B does not touch the agents themselves, only the orchestration of their outputs.
- **State-file integration for the code-review contract** — explicitly rejected per the bucket-skip rationale.
- **Phase 4 agent re-dispatch as an orchestrator-side fallback** — explicitly punted to `deferred[]` entries; revisit only if post-merge measurement shows this is causing real verdict drift.
- **Measurement (#253)** — deferred to post-merge real-session use, mirroring PRs #263 and #264.
- **Sunsetting prior phases' inline-fallbacks** — those are tracked in #251 and shipped in separate PRs once their two-real-session-use clocks complete.
