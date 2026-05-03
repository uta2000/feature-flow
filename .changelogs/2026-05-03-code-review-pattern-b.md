### Added — code-review Pattern B subagent dispatch (#251 Wave 3 phase 5)

The Code Review lifecycle step now runs as Pattern B (orchestrator-side parallel reviewer
fanout + consolidator subagent). The orchestrator continues to dispatch Phase 0 (deterministic
pre-filter), Phase 1a (pr-review-toolkit), Phase 1b (report-only agents in parallel), and
Phase 1c (senior panel — Major-feature scope only) — those dispatches MUST stay orchestrator-side
because subagents cannot recursively dispatch (per #251 Q1, fixed in PRs #262/#263/#264).
A new consolidator subagent (`general-purpose`, `model: "sonnet"`) ingests the reviewer outputs
and runs Phases 2-5 in isolation: conflict detection, fix application, targeted re-verification,
report assembly, and contract write. The return contract is validated by
`hooks/scripts/validate-return-contract.js` before the lifecycle proceeds.

**Architectural deviation — bucket-skip variant** (mirrors PR #264, `verify-acceptance-criteria`):
the contract is written directly to `/tmp/ff-code-review-contract-${SLUG}.json` rather than
into a `phase_summaries` bucket on the in-progress state file. The four buckets (`brainstorm`,
`design`, `plan`, `implementation`) are all claimed by phase-boundary writes; the natural
`implementation` slot is reserved for future Phase 6 (`subagent-driven-development`) Pattern B.
Code-review is a verification step within the implementation phase, not a phase that owns a
bucket — so skipping the state-file mediation avoids the collision with no functional cost.
No `schema_version` bump.

**Phase 4 changes for Pattern B:**

- The `superpowers:code-reviewer rule 6 → run verify-acceptance-criteria` row and the
  `No Critical/Important findings → run verify-acceptance-criteria as baseline sanity check`
  row are both deleted from the targeted-checks table. The Final Verification inline step
  runs verify-acceptance-criteria immediately after the code-review step anyway — both
  invocations were redundant, and inside the consolidator they would have failed
  (verify-acceptance-criteria internally dispatches `task-verifier`, which subagents cannot
  do per #251 Q1).
- Agent re-dispatch is unavailable inside the consolidator (same Q1 constraint). Each Phase 4
  row that would have triggered an agent re-dispatch instead writes a `deferred[]` entry to
  the return contract with `reason: "agent re-dispatch unavailable in Pattern B consolidator"`.
  A verdict-honesty constraint enforces this: the consolidator MUST NOT return
  `verdict: "approve"` while `deferred[]` is non-empty due to agent re-dispatch unavailability.
  The inline-fallback path retains the actual re-dispatch behavior (orchestrator-level
  dispatch works there).

**Inline-fallback** (rollout-only) is retained for four failure cases (cascading reviewer
dispatch failure, consolidator dispatch failure, missing contract file, validator non-zero
exit). Sunset target: `feature-flow vNEXT+1` after two consecutive successful real-session uses.

**Per-phase decision rule (#251):** the ≥5% orchestrator-context-reduction measurement (per
#253 instrumentation) is deferred to post-merge real-session use, mirroring the explicit
deferral in PRs #263 and #264.

**Phase 1c session correlation preserved:** the `[session:$LIFECYCLE_SESSION]` token is passed
to the consolidator in its dispatch prompt and stamped on every Phase 5 report entry — same
requirement as inline mode, preserved across the Pattern B handoff so grep-correlation across
pipeline phases, the Phase 5 report, and the PR body still works.
