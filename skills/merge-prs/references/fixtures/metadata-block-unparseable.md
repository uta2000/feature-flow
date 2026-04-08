# Fixture: Unparseable — Marker Present, Malformed YAML

**Purpose:** PR body with a `feature-flow-metadata:v1` marker but YAML inside it has bad indentation (tabs mixed with spaces, which causes `yaml.safe_load` to raise). Used to verify the consumer emits exactly one warning and falls back to inference.

**Expected consumer behavior:**
1. Marker found (version 1 — known version).
2. `yaml.safe_load` raises on the malformed content.
3. Consumer logs exactly one warning: `"feature-flow-metadata block found but unparseable, falling back to inference"`.
4. Consumer proceeds with diff-based inference as if no block were present.
5. No crash.

---

## Summary

Adds new dashboard widget for weekly summary.

<!-- feature-flow-metadata:v1
schema_version: 1
lifecycle_session: 2026-04-08-dashboard-widget
  created_at: 2026-04-08T10:00:00Z
scope: small_enhancement
	risk_tier: low
issue: 230
-->
