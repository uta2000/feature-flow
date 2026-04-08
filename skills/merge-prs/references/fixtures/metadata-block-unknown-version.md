# Fixture: Unknown Version — v2 Marker

**Purpose:** PR body with a `feature-flow-metadata:v2` marker and `schema_version: 2`. Simulates a PR created by a future lifecycle version that this consumer does not understand. Used to verify the consumer emits exactly one warning and falls back to inference.

**Expected consumer behavior:**
1. Marker found; captured version is `2`.
2. Consumer knows only v1; `2 ≠ 1`.
3. Consumer logs exactly one warning: `"feature-flow-metadata block: unknown version v2, falling back to inference"`.
4. Consumer proceeds with diff-based inference as if no block were present.
5. No crash.

---

## Summary

Adds experimental multi-repo sync feature (lifecycle v2.0 session).

## Implementation Context

Created by lifecycle v2.0.

<!-- feature-flow-metadata:v2
schema_version: 2
lifecycle_session: 2026-06-01-multi-repo-sync
created_at: 2026-06-01T08:00:00Z
scope: major_feature
risk_tier: high
issue: 350
new_v2_field: some_value_consumers_do_not_know
risk_areas:
  - src/sync
  - config
sibling_prs: [351, 352]
depends_on_prs: []
remediation_log: []
-->
