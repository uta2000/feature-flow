# Feature-Flow Metadata Block — Schema Reference

**Version:** v1
**Status:** Active
**Single source of truth for:** producers (`skills/start`), consumers (`skills/merge-prs`), and any future tooling.

---

## Overview

Every PR created by the `feature-flow:start` lifecycle appends a versioned YAML block inside an HTML comment. The block is invisible in the GitHub UI but trivially parseable by any consumer searching for the marker.

The lifecycle is the **single writer**. Consumers are **read-only**. All parse failures fall back to inference — the block is best-effort and non-fatal on both sides.

---

## Marker Format

```
<!-- feature-flow-metadata:v1
...YAML body...
-->
```

- Marker regex: `<!-- feature-flow-metadata:v(\d+)` (captures the integer marker version)
- One block per PR body. If multiple markers are present (e.g. from a copy-paste), use the first match only.
- Unknown marker versions (e.g. `v2` when consumer knows only v1) are treated as absent — log one warning and fall back to inference.

---

## §Field Reference

Fields are serialized in this exact canonical order (preserved via `yaml.safe_dump(sort_keys=False)`):

| # | Field | Type | Required | Description |
|---|-------|------|----------|-------------|
| 1 | `schema_version` | integer | Yes | Schema version integer. Currently `1`. Must match marker version. |
| 2 | `lifecycle_session` | string | Yes | Stable slug: `YYYY-MM-DD-<kebab-slug>`. Read from `.feature-flow/session.txt`. |
| 3 | `created_at` | ISO 8601 UTC string | Yes | `date -u +%Y-%m-%dT%H:%M:%SZ` at PR creation. Preserved on subsequent updates — not overwritten. |
| 4 | `scope` | enum string | Yes | One of: `quick_fix`, `small_enhancement`, `feature`, `major_feature`. |
| 5 | `risk_tier` | enum string | Yes | One of: `low`, `medium`, `high`. Defaults: `quick_fix`/`small_enhancement` → `low`; `feature` → `medium`; `major_feature` → `high`. Bumped one tier if design-verification flagged blockers. |
| 6 | `issue` | integer or null | No | Linked GitHub issue number. `null` if none. |
| 7 | `design_issue` | integer or null | No | GitHub issue number containing the design (in body under `## Design (feature-flow)` markers). `null` for scopes that skip design. Issue body is the live source of truth — no separate snapshot field. |
| 8 | `plan_file` | string or null | No | Repo-relative POSIX path to implementation plan. `null` for scopes that skip planning. |
| 9 | `acceptance_criteria_verified_at` | ISO 8601 UTC string or null | No | Timestamp when `verify-acceptance-criteria` last passed. `null` if not yet verified. |
| 10 | `acceptance_criteria_verified_sha` | string or null | No | **Commit SHA** at verification time: `git rev-parse HEAD`. `null` if not yet verified. |
| 11 | `acceptance_criteria_count` | integer or null | No | Count of `- [ ]` lines in the plan file at verification time. `null` if not yet verified. |
| 12 | `risk_areas` | list of strings | No | Top-level directories of changed files plus any individual file with >50 changed lines. Derived from `git diff --name-only --stat <base>...HEAD`. Deduped. Capped at 10 entries. Empty list `[]` when no diff yet. |
| 13 | `sibling_prs` | list of integers | No | PR numbers in the same lifecycle session. Always `[]` in the current implementation (multi-PR session support deferred). |
| 14 | `depends_on_prs` | list of integers | No | Parsed from explicit `gh-pr:<N>` tokens in the design doc body. No inference. `[]` when none found. |
| 15 | `remediation_log` | list of objects | No | Append-only log of remediation events. Each entry has `type` (string), `description` (string), `commit` (string), `at` (ISO 8601 UTC). Empty list `[]` at PR creation. Capped at 50 entries when body approaches GitHub's 65,536-char limit. |

**Required fields** (must be non-null in every well-formed block): `schema_version`, `lifecycle_session`, `created_at`, `scope`, `risk_tier`.

**Optional fields** (may be `null` or absent): all others. Consumers MUST handle both explicit `null` and missing-key semantics identically.

---

## §Serialization

The block is serialized via a Python one-liner. Input is passed as JSON (built with `jq -n`) to avoid shell-quoting pitfalls with multi-line content.

```bash
python3 -c "import yaml,sys,json; d=json.loads(sys.argv[1]); print(yaml.safe_dump(d, sort_keys=False, default_flow_style=False).rstrip())" "$METADATA_JSON"
```

`sort_keys=False` preserves the canonical field order above.

**PyYAML fallback:** If `python3 -c 'import yaml'` exits non-zero (PyYAML not installed), a `printf`-based fallback writes scalar fields and flat lists line-by-line in canonical order. If `remediation_log` has entries and PyYAML is unavailable, the step logs a warning and **skips the block entirely** rather than emitting invalid YAML. PyYAML ships as a transitive dependency of every Python ≥3 environment the plugin targets; the fallback is a safety net only.

---

## §Parsing

Consumer algorithm (applied once per PR, before any merge checks):

1. Search PR body for marker regex `<!-- feature-flow-metadata:v(\d+)`. Not found → absent. Silent (no warning).
2. Unknown marker version (captured integer ≠ 1) → log one warning: `"feature-flow-metadata block: unknown version vN, falling back to inference"`. Treat as absent.
3. Extract text between the marker line and the closing `-->`.
4. Parse with `yaml.safe_load`. On error → log one warning: `"feature-flow-metadata block found but unparseable, falling back to inference"`. Treat as absent.
5. Validate: `schema_version` matches the captured marker version integer; all required fields present. On mismatch/missing → log one warning: `"feature-flow-metadata block failed validation, falling back to inference"`. Treat as absent.
6. Missing optional fields → default to `null` (do not error).

**Warning budget:** Exactly one warning per PR per failure category. Never crash or bubble exceptions. On any failure, fall back to diff-based inference — existing behavior is preserved unchanged.

---

## §Update Protocol

Used by `skills/start` in the `Wait for CI and Address Reviews` step (Phases 2c and 3) and in `Harden PR` fix-commit sub-steps. All failures are non-fatal.

1. Fetch the current PR body:
   ```bash
   gh pr view <pr_number> --json body --jq '.body' > /tmp/ff_pr_body.md
   ```
2. Locate the marker in `/tmp/ff_pr_body.md`.
   - If absent: append a fresh block to the end with a blank-line separator (next update will find it).
3. Extract the YAML between the marker and `-->`.
4. Parse, mutate in-memory (e.g. append a new entry to `remediation_log`). Cap `remediation_log` at 50 entries if body approaches 65,536 chars.
5. Re-serialize via the §Serialization Python one-liner (canonical field order).
6. Splice the new serialized YAML back into `/tmp/ff_pr_body.md`, replacing only the content between the marker line and closing `-->`. Everything outside the block is preserved verbatim.
7. Push the updated body:
   ```bash
   gh pr edit <pr_number> --body-file /tmp/ff_pr_body.md && rm /tmp/ff_pr_body.md
   ```
8. On `gh pr edit` failure (network, auth, rate limit): log warning `"feature-flow-metadata update failed: <error>. Continuing lifecycle."` and continue. No retry loop — the next update attempt will try again with the then-current body.

**Concurrency:** The lifecycle is the sole writer and operates sequentially on one PR at a time. No locking required.

---

## §Version Compatibility

The marker version (`v1` in `<!-- feature-flow-metadata:v1`) and the `schema_version` field MUST agree. Consumers validate this match in step 5 of §Parsing.

- **v1 → v1 (adding fields):** Adding optional fields within `schema_version: 1` is non-breaking. Old consumers that don't know the new field ignore it (step 6 of §Parsing: missing optional fields default to `null`).
- **Breaking changes (rename, retype, remove required field):** Bump the marker to `v2` and `schema_version: 2`. Coexist with v1 for one release cycle — new producers write v2, consumers accept both v1 and v2.
- **Unknown version:** Consumer treats as absent (step 2 of §Parsing). No crash, one warning.

---

## §Complete Example

```
<!-- feature-flow-metadata:v1
schema_version: 1
lifecycle_session: 2026-04-08-feature-flow-metadata-block
created_at: 2026-04-08T14:22:10Z
scope: feature
risk_tier: medium
issue: 229
design_issue: 244
plan_file: docs/plans/2026-04-08-feature-flow-metadata-block-plan.md
acceptance_criteria_verified_at: 2026-04-08T14:40:02Z
acceptance_criteria_verified_sha: 7b3e815f9c2d4a6e8b0f1c3d5e7f9a1b
acceptance_criteria_count: 18
risk_areas:
  - skills/start/references
  - skills/merge-prs
  - references
sibling_prs: []
depends_on_prs: []
remediation_log:
  - type: ci-lint
    description: trailing whitespace in inline-steps.md
    commit: 7e8f9a0b
    at: 2026-04-08T14:30:00Z
-->
```

---

## §Producer/Consumer Contract

| Role | Responsibility |
|------|---------------|
| Producer (`skills/start`) | Write and update the block. Single writer. All writes best-effort, non-fatal. |
| Consumer (`skills/merge-prs`, future) | Read-only. Parse failures fall back to inference silently or with one warning. Never modify the block. |

**Opt-out:** Set `lifecycle.metadata_block.enabled: false` in `.feature-flow.yml`. When false, the producer skips the PR Metadata Block Step entirely. No warning.
