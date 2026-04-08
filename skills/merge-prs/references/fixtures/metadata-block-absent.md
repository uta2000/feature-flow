# Fixture: Absent — No Marker

**Purpose:** Standard PR body with no `metadata-block` marker. Represents a PR created manually (outside the lifecycle) or before this feature was shipped. Used to verify that the absent path is fully silent — no warning, no error.

**Expected consumer behavior:**
1. Marker regex search finds no match.
2. Consumer silently treats block as absent.
3. No warning is emitted.
4. Consumer proceeds with diff-based inference as normal.

---

## Summary

Manually created PR: fix broken CI config.

## Test plan

- [ ] Verify CI passes after config fix

## Implementation Context

This PR was created manually outside the feature-flow lifecycle. No metadata block present.
