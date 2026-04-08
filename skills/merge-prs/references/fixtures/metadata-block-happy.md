# Fixture: Happy Path — Full v1 Block

**Purpose:** A complete PR body with a well-formed `feature-flow-metadata:v1` block containing all 16 fields populated (no nulls). Used to verify the consumer's happy-path parsing and field binding.

**Expected consumer behavior:** Parse succeeds. All fields bound to PR context. `sibling_prs`, `depends_on_prs`, `risk_areas`, `remediation_log` available for downstream checks. No warnings emitted.

---

## Summary

Adds versioned metadata block to PR bodies so downstream consumers (primarily `/merge-prs`) can read structured session context without reconstructing intent from diffs.

## Test plan

- [ ] Verify block is present in PR body after lifecycle PR creation step
- [ ] Verify `/merge-prs` reads `sibling_prs` and `depends_on_prs` fields correctly
- [ ] Verify graceful fallback when block is absent

## Implementation Context

### Design Decisions

- Single-writer contract keeps update logic simple
- HTML comment keeps block invisible in GitHub UI
- Canonical field order enforced via `sort_keys=False`

<!-- feature-flow-metadata:v1
schema_version: 1
lifecycle_session: 2026-04-08-feature-flow-metadata-block
created_at: 2026-04-08T14:22:10Z
scope: feature
risk_tier: medium
issue: 229
design_doc: docs/plans/2026-04-08-feature-flow-metadata-block.md
design_doc_sha: 9f4a2c1d3e5b7a8f0c2d4e6f8a0b2c4d
plan_file: docs/plans/2026-04-08-feature-flow-metadata-block-plan.md
acceptance_criteria_verified_at: 2026-04-08T14:40:02Z
acceptance_criteria_verified_sha: 7b3e815f9c2d4a6e8b0f1c3d5e7f9a1b
acceptance_criteria_count: 18
risk_areas:
  - skills/start/references
  - skills/merge-prs
  - references
sibling_prs: []
depends_on_prs: [227]
remediation_log:
  - type: ci-lint
    description: trailing whitespace in inline-steps.md
    commit: 7e8f9a0b
    at: 2026-04-08T14:30:00Z
  - type: review-bot
    description: addressed CodeRabbit nit on field ordering
    commit: 8f9a0b1c
    at: 2026-04-08T14:55:00Z
-->
