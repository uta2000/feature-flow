### Added — verify-acceptance-criteria Pattern B subagent dispatch (#251 Wave 3 phase 4)

`feature-flow:verify-acceptance-criteria` now runs as Pattern B (hoisted task-verifier dispatch +
consolidator subagent) when invoked from the Final Verification inline step. The orchestrator
dispatches `feature-flow:task-verifier` directly (`model: "haiku"`) — fixing the latent recursive-dispatch
bug where the inner `Task()` silently failed inside any wrapping subagent (per #251 Q1) — then dispatches
a `general-purpose` consolidator (`model: "sonnet"`) that runs Steps 4-6 of the skill in isolation. The
return contract is validated by `hooks/scripts/validate-return-contract.js` before the lifecycle proceeds.

**Architectural deviation from PR #263 (`design-document` Pattern B):** the contract is written
directly to a tmp JSON file at `/tmp/ff-verify-ac-contract-${SLUG}.json` rather than into a
`phase_summaries` bucket on the in-progress state file. The four buckets (`brainstorm`, `design`,
`plan`, `implementation`) are all claimed by phase-boundary writes, and the natural `implementation`
slot would collide with the future Phase 6 (`subagent-driven-development`) Pattern B contract.
Verify-acceptance-criteria is a verification step within the implementation phase (not a phase that
owns a bucket), and its contract has no cross-compaction reader — so skipping the state-file
mediation avoids the collision with no functional cost. No `schema_version` bump.

**Inline-fallback** (rollout-only) is retained for four failure cases (task-verifier dispatch
failure, consolidator dispatch failure, missing contract file, validator non-zero exit). Sunset
target: `feature-flow vNEXT+1` after two consecutive successful real-session uses.

**Per-phase decision rule (#251):** the ≥5% orchestrator-context-reduction measurement (per #253
instrumentation) is deferred to post-merge real-session use, mirroring the explicit deferral in PR #263.
