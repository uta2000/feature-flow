# Fixture: Minimal — Required Fields Only

**Purpose:** PR body with a v1 block containing only the 5 required fields. All optional fields are explicitly `null` or empty list. Used to verify that the consumer handles absent optional fields gracefully (defaults to `null`, no error).

**Expected consumer behavior:** Parse succeeds. Required fields bound. Optional fields (`issue`, `design_issue`, etc.) default to `null`. `risk_areas`, `sibling_prs`, `depends_on_prs`, `remediation_log` default to empty list `[]`. No warnings emitted.

---

## Summary

Quick fix: correct typo in button label.

<!-- feature-flow-metadata:v1
schema_version: 1
lifecycle_session: 2026-04-08-typo-fix
created_at: 2026-04-08T09:01:00Z
scope: quick_fix
risk_tier: low
issue: null
design_issue: null
plan_file: null
acceptance_criteria_verified_at: null
acceptance_criteria_verified_sha: null
acceptance_criteria_count: null
risk_areas: []
sibling_prs: []
depends_on_prs: []
remediation_log: []
-->
