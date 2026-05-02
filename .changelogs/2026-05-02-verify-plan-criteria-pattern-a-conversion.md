## feat: verify-plan-criteria converted to Pattern A subagent dispatch (#251)

`feature-flow:verify-plan-criteria` is now dispatched as a `Task()` subagent (model: sonnet) instead of an inline `Skill()` call. The subagent writes a structured return contract to the in-progress state file at `phase_summaries.plan.return_contract` (the `plan` bucket — `verify-plan-criteria` lives in the `plan` lifecycle phase; the contract's own `phase` field stays `"verify-plan-criteria"` per #251's locked spec); the orchestrator validates it with `hooks/scripts/validate-return-contract.js` before proceeding.

This is the **first conversion** validating the subagent-driven phase architecture from issue #251. Five more phase conversions (merge-prs, design-document, verify-acceptance-criteria, code-review, implementation) follow once two consecutive successful real-session uses of this conversion are observed and #253-measurement confirms ≥5% orchestrator context reduction.

**Changes:**
- `skills/start/SKILL.md`: in-progress state-file `schema_version` bumped 1→2; `return_contract` field added to all four `phase_summaries` phase blocks (`brainstorm`, `design`, `plan`, `implementation`); Pattern A wrapper section ("Verify Plan Criteria — Pattern A Dispatch") added with `Task()` dispatch shape, post-dispatch validation sequence, and inline-fallback table for the three failure cases; Skill Mapping table row updated to reference the new wrapper.
- `hooks/scripts/validate-return-contract.js`: new hand-rolled JSON Schema validator for phase return contracts. No `ajv` or other external schema-validation dependency. Schema registry currently holds `verify-plan-criteria`; future phase conversions add their schemas alongside. Includes `validate-return-contract.test.js` (8 assertions, custom assert harness) and three fixture files at `hooks/scripts/fixtures/`.
- `skills/verify-plan-criteria/SKILL.md`: new optional args `write_contract_to` and `phase_id`; new Step 7 writes the return contract to the state file when `write_contract_to` is set in ARGUMENTS. Inline invocations behave identically to before.

**Rollout note:** An inline-fallback path is retained for this release. If `Task()` dispatch fails, `return_contract` is missing/null after the subagent completes, or `validate-return-contract.js` exits non-zero, the orchestrator falls back to the existing inline `Skill(skill: "feature-flow:verify-plan-criteria", ...)` path and announces which case fired.

**Sunset:** feature-flow vNEXT removes the inline-fallback table and the three failure-case handlers in `skills/start/SKILL.md` once two consecutive successful real-session uses of Pattern A are observed AND #253 measurement confirms ≥5% orchestrator context reduction. The wrapper itself stays — only the safety net is sunset.

<!-- SUNSET: feature-flow vNEXT removes inline-fallback once two consecutive successful real-session uses are observed -->
