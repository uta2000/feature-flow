# Feature-Flow Metadata Block — Design Document

**Date:** 2026-04-08
**Status:** Draft
**Issue:** #229 — lifecycle: add versioned, machine-readable feature-flow-metadata block to PR bodies
**Scope:** Feature (plugin-internals, producer/consumer contract)
**Base branch:** main
**Lifecycle session:** 2026-04-08-feature-flow-metadata-block

## Overview

Add a versioned, machine-readable `feature-flow-metadata` YAML block (embedded inside an HTML comment) to PR bodies created by the `feature-flow:start` lifecycle. The block captures session context — design doc reference, scope, risk tier, acceptance-criteria verification state, touched risk areas, sibling/dependent PRs, and an append-only remediation log — so that downstream consumers (primarily `/merge-prs`) no longer have to reconstruct intent from diffs and PR titles. The lifecycle is the **single writer**; `/merge-prs` is a **read-only consumer** with graceful fallback to inference when the block is absent or unparseable.

## Example

The following block is appended to a PR body below the `## Implementation Context` section. It is invisible in the GitHub UI (HTML comment) but trivially parseable by any consumer that looks for the `<!-- feature-flow-metadata:v1` marker.

```markdown
## Summary
Adds versioned metadata block to PR bodies...

## Test plan
...

## Implementation Context
...

<!-- feature-flow-metadata:v1
schema_version: 1
lifecycle_session: 2026-04-08-feature-flow-metadata-block
created_at: 2026-04-08T14:22:10Z
scope: feature
risk_tier: medium
issue: 229
design_doc: docs/plans/2026-04-08-feature-flow-metadata-block.md
design_doc_sha: 9f4a2c1
plan_file: docs/plans/2026-04-08-feature-flow-metadata-block-plan.md
acceptance_criteria_verified_at: 2026-04-08T14:40:02Z
acceptance_criteria_verified_sha: 7b3e815
acceptance_criteria_count: 18
risk_areas:
  - skills/start/references/inline-steps.md
  - skills/start/references/yolo-overrides.md
  - references/feature-flow-metadata-schema.md
  - skills/merge-prs/SKILL.md
sibling_prs: []
depends_on_prs: []
remediation_log:
  - type: ci-lint
    description: trailing whitespace in inline-steps.md
    commit: 7e8f9a0
    at: 2026-04-08T14:30:00Z
-->
```

## User Flow

### Step 1 — Lifecycle creates session identifier

Early in the lifecycle (during worktree setup), `skills/start` derives a stable `lifecycle_session` slug from the feature description (format `YYYY-MM-DD-<kebab-slug>`) and persists it to `.feature-flow/session.txt`. All subsequent steps in the same lifecycle run read this file. The slug is the same value used by the design doc filename when present, so the session identifier is stable across all artifacts of one lifecycle run.

### Step 2 — Lifecycle writes block on PR creation

During the `Commit and PR` step, after the base PR body is generated (summary, test plan, `## Implementation Context`, code-review summary), a new **PR Metadata Block Step** assembles a `feature-flow-metadata` YAML object from in-memory lifecycle state (scope, risk_tier, issue, design_doc path + blob SHA, plan_file, acceptance_criteria counts/timestamps, risk_areas derived from `git diff --stat`, empty `sibling_prs`/`depends_on_prs`, empty `remediation_log`) and appends it as an HTML-commented block to the PR body before the PR is created via `gh pr create --body-file`.

### Step 3 — Lifecycle updates block on remediation

Inside `Wait for CI and address reviews` (Phases 2c and 3) and `Harden PR` (when those phases push fix commits), a read-modify-write helper documented in `references/feature-flow-metadata-schema.md` §Update Protocol runs: fetch the PR body via `gh pr view --json body`, locate the marker, splice the existing YAML into memory, append a new entry to `remediation_log`, re-serialize, and push with `gh pr edit --body-file`. Failures are non-fatal — a warning is logged and the lifecycle continues.

### Step 4 — /merge-prs reads the block

When `/merge-prs` begins Step 4a pre-merge checks for a PR, it parses the block (if present) and uses `sibling_prs`, `depends_on_prs`, `risk_areas`, and `remediation_log` as authoritative inputs for dependency analysis, CI remediation de-duplication, and conflict/review classification. When the block is absent, unparseable, unknown-version, or missing required fields, the consumer logs a single warning and falls back to its existing diff-based inference path.

### Step 5 — Other consumers (future)

`session-report`, `dependency-analysis`, and any future tooling can read the same schema. No changes to those surfaces are in scope for this issue.

## PR Body Metadata Block Schema

The canonical schema lives in a new top-level file `references/feature-flow-metadata-schema.md`. That file is the single source of truth that both producers and consumers read.

### Marker format

The block is enclosed in an HTML comment with a versioned marker:

```
<!-- feature-flow-metadata:v1
...YAML body...
-->
```

- Marker regex: `<!-- feature-flow-metadata:v(\d+)` (captures marker version)
- One block per PR body
- Lifecycle is the only writer; unknown marker versions are treated as absent

### Canonical field order

Fields are serialized in this exact order (enforced via `yaml.safe_dump(sort_keys=False)`):

1. `schema_version` (int, required)
2. `lifecycle_session` (string, required)
3. `created_at` (ISO 8601 UTC, required)
4. `scope` (enum: `quick_fix`, `small_enhancement`, `feature`, `major_feature`, required)
5. `risk_tier` (enum: `low`, `medium`, `high`, required)
6. `issue` (int or null)
7. `design_doc` (repo-relative path or null)
8. `design_doc_sha` (string or null — blob SHA via `git rev-parse HEAD:<path>`)
9. `plan_file` (repo-relative path or null)
10. `acceptance_criteria_verified_at` (ISO 8601 UTC or null)
11. `acceptance_criteria_verified_sha` (commit SHA or null — HEAD at verification time)
12. `acceptance_criteria_count` (int or null)
13. `risk_areas` (list of path strings, possibly empty)
14. `sibling_prs` (list of ints, possibly empty)
15. `depends_on_prs` (list of ints, possibly empty)
16. `remediation_log` (list of objects with `type`, `description`, `commit`, `at`; possibly empty)

The schema doc lists all 16 items in the canonical order above. Issue #229 describes the schema as having "14 fields" but that count excludes `schema_version` (treated as meta) and uses a loose count of fields; the schema reference lists every item explicitly and does not repeat the "14 fields" phrasing.

### Required vs optional

- **Required (non-null in every block):** `schema_version`, `lifecycle_session`, `created_at`, `scope`, `risk_tier`
- **Optional (may be null or empty list):** everything else. Consumers must handle both explicit `null` and omitted-key semantics identically.

### Derivation rules

| Field | Source |
|-------|--------|
| `lifecycle_session` | `.feature-flow/session.txt`, format `YYYY-MM-DD-<slug>`, slug kebab-cased from feature description |
| `created_at` | `date -u +%Y-%m-%dT%H:%M:%SZ` at PR creation time |
| `scope` | Scope detected by `skills/start` during brainstorming |
| `risk_tier` | Defaults: `quick_fix`/`small_enhancement` → `low`, `feature` → `medium`, `major_feature` → `high`. Bumped one tier if design-verification flagged blockers. |
| `issue` | Linked GitHub issue number (null if none) |
| `design_doc` | Repo-relative path from lifecycle state (null for scopes that skip design) |
| `design_doc_sha` | `git rev-parse HEAD:<design_doc_path>` — **blob SHA**, not commit SHA, so the design version is pinned regardless of subsequent file edits |
| `plan_file` | Repo-relative path to implementation plan (null for scopes that skip planning) |
| `acceptance_criteria_verified_at` | Timestamp when `verify-acceptance-criteria` last passed |
| `acceptance_criteria_verified_sha` | `git rev-parse HEAD` **commit SHA** at verification time |
| `acceptance_criteria_count` | Count of `- [ ]` lines in the plan file |
| `risk_areas` | `git diff --name-only --stat <base>...HEAD`: take top-level directories of changed files **plus** any individual file with >50 changed lines; dedupe; cap at 10 entries |
| `sibling_prs` | `[]` for single-PR sessions. Populated only for Major Feature multi-PR sessions (future use); this issue ships empty-list behavior for all current flows. |
| `depends_on_prs` | Parsed from explicit `gh-pr:<N>` tokens in the design doc body. No inference from file overlap. |
| `remediation_log` | Empty at PR creation; appended to in-place by `Wait for CI and address reviews` and `Harden PR` steps |

### Serialization

The block is serialized via a Python one-liner embedded in the inline step:

```bash
python3 -c "import yaml,sys,json; d=json.loads(sys.argv[1]); print(yaml.safe_dump(d, sort_keys=False, default_flow_style=False).rstrip())" "$METADATA_JSON"
```

`sort_keys=False` preserves the canonical field order. The input is passed as JSON (built with `jq -n`) to avoid shell-quoting issues.

**Fallback when `python3 -c 'import yaml'` fails** (e.g. PyYAML not installed): a `printf`-based fallback writes the block line-by-line in the canonical order using a hardcoded template. The fallback handles only the minimum — scalars and flat lists — and omits any list-of-objects fields (`remediation_log`) when those fields are empty. If `remediation_log` has entries and PyYAML is unavailable, the step logs a warning and skips the block entirely rather than emitting invalid YAML. PyYAML is a transitive dependency of every Python >=3 environment the plugin targets, so the fallback is a safety net, not the primary path.

### Parsing rules (consumer side)

Documented once in `references/feature-flow-metadata-schema.md` §Parsing; consumers reference by name. Summary:

1. Search for marker regex. Not found → absent, no warning.
2. Unknown marker version → warning, treat as absent.
3. Extract YAML between marker line and closing `-->`.
4. Parse with `yaml.safe_load`. Error → warning "feature-flow-metadata block found but unparseable, falling back to inference", treat as absent.
5. Validate `schema_version` matches marker version and required fields are present. Mismatch/missing → warning, treat as absent.
6. Missing optional fields default to null.

### Update protocol (producer side)

Documented once in `references/feature-flow-metadata-schema.md` §Update Protocol. Inline-steps references it by name — not inlined, to avoid drift. Summary:

1. `gh pr view <N> --json body --jq .body > /tmp/ff_pr_body.md`
2. Locate marker; if absent, append a fresh block to the end of the body with a blank-line separator.
3. Parse YAML, mutate in-memory (e.g. append to `remediation_log`).
4. Re-serialize via the same Python one-liner + canonical order.
5. Splice back into the body, preserving everything outside the block verbatim.
6. `gh pr edit <N> --body-file /tmp/ff_pr_body.md && rm /tmp/ff_pr_body.md`
7. On `gh pr edit` failure (network, auth, rate limit): log warning, continue lifecycle. No retry loop — next update attempt will try again with the now-outdated body.

## Files to Modify

| File | Change type | Description |
|------|-------------|-------------|
| `references/feature-flow-metadata-schema.md` | **NEW** | Canonical schema: field table, complete example, parsing rules, update protocol, version compatibility, producer/consumer contract. Single source of truth. |
| `skills/start/references/inline-steps.md` | Edit | (a) New top-level §**PR Metadata Block Step** near the top of the Commit-and-PR related steps defining the serialization step run at PR creation. (b) Update §Wait for CI and Address Reviews Phase 2c and Phase 3 to add a sub-step "Update PR metadata remediation_log" referencing §Update Protocol in the schema reference. |
| `skills/start/references/yolo-overrides.md` | Edit | §Finishing a Development Branch YOLO Override: add a one-line reference between current steps 7 and 8: "**7a. Append feature-flow-metadata block.** Run the PR Metadata Block Step from `inline-steps.md` §PR Metadata Block Step. Runs in all modes (YOLO, Express, Interactive) — not YOLO-specific." |
| `skills/start/SKILL.md` | Edit | Skill Mapping table (line 614 area): update `Commit and PR` row expected-output to mention "PR body includes feature-flow-metadata block (all modes)". |
| `skills/merge-prs/SKILL.md` | Edit | Step 4a pre-merge checks: add sub-step `4a.0 Parse feature-flow-metadata block`. On success, bind `metadata.sibling_prs`, `metadata.depends_on_prs`, `metadata.risk_areas`, `metadata.remediation_log` into the PR's pre-merge context for downstream checks. On absence/failure, log warning and continue with inference. Reference `references/feature-flow-metadata-schema.md` §Parsing. |
| `skills/merge-prs/references/dependency-analysis.md` | Edit | Insert new top-level section §**Metadata Block Precedence** **before** §Step 1 Collect Changed Files per PR (there is no pre-existing §Inputs section). Content: "When a PR's `feature-flow-metadata` block is present and parseable, prefer `depends_on_prs` (hard dependencies), `sibling_prs` (same-session grouping), and `risk_areas` (semantic touchpoints) over diff-based file-overlap inference. Inference remains the fallback when the block is absent, unparseable, or missing these fields. Metadata fields are additive, not replacing — inference-detected edges not covered by metadata still apply." |
| `references/project-context-schema.md` | Edit | Extend §`lifecycle` section (line 379): add new `#### lifecycle.metadata_block` sub-section after the existing `#### lifecycle.harden_pr` and `#### lifecycle.handoff` sub-sections, matching their format (field table + `**Format:**` YAML block + `**When absent:**` note). Fields: `enabled` (bool, default `true`). When `false`, the producer skips the PR Metadata Block Step entirely. |
| `CHANGELOG.md` | Edit | Single `[Unreleased]` → `Added` entry: "Feature-flow lifecycle now writes a versioned `feature-flow-metadata` YAML block inside an HTML comment in every PR body (opt-out via `lifecycle.metadata_block.enabled: false`). `/merge-prs` reads the block for dependency analysis and remediation de-duplication with graceful fallback. See `references/feature-flow-metadata-schema.md` for the schema." |
| `skills/merge-prs/references/fixtures/metadata-block-happy.md` | **NEW** | Fixture: full PR body containing a well-formed v1 block with all fields populated. Used by manual/automated parsing tests. |
| `skills/merge-prs/references/fixtures/metadata-block-minimal.md` | **NEW** | Fixture: PR body containing a v1 block with only required fields (others null/empty). |
| `skills/merge-prs/references/fixtures/metadata-block-unparseable.md` | **NEW** | Fixture: PR body with a marker but malformed YAML inside (bad indentation). Used to verify graceful-fallback path. |
| `skills/merge-prs/references/fixtures/metadata-block-absent.md` | **NEW** | Fixture: PR body with no marker at all. Verifies absent-path is silent (no warning spam). |
| `skills/merge-prs/references/fixtures/metadata-block-unknown-version.md` | **NEW** | Fixture: marker says `:v2` with a v2 schema_version. Verifies unknown-version warning + fallback. |

## Patterns & Constraints

### Error Handling

- **Producer (lifecycle):** All metadata-block writes are best-effort and non-fatal. Any failure (serialization error, `gh pr edit` failure, missing PyYAML) logs a warning via the same stderr channel as other lifecycle warnings and proceeds. The lifecycle never blocks on metadata sync.
- **Consumer (/merge-prs and future readers):** Parse failures fall back to inference. Exactly one warning per PR per failure category (missing block = silent; unparseable = one warning; unknown version = one warning; missing required fields = one warning). No crashes, no exceptions bubbling up.
- **Update protocol:** Read-modify-write is not concurrency-safe, but the lifecycle is the sole writer and operates sequentially on one PR at a time, so no locking is needed.

### Types

- `scope` is a literal string enum — one of exactly four values. Consumers SHOULD validate and treat unknown values as absent.
- `risk_tier` is a literal string enum — one of three values (`low`, `medium`, `high`).
- `schema_version` is an integer literal, currently `1`. Adding fields within v1 is non-breaking. Removing/renaming/retyping fields requires bumping to v2 and coexisting with v1 for one release cycle.
- Path fields are **repo-relative** POSIX paths with forward slashes (no absolute paths, no `./` prefixes).
- Timestamps are ISO 8601 UTC with `Z` suffix (never `+00:00`) for consistent string comparison.
- SHAs: `design_doc_sha` is a **blob** SHA (pins content); `acceptance_criteria_verified_sha` is a **commit** SHA (pins tree).

### Performance

- Block write adds ~200ms to PR creation (one Python invocation + one `gh pr create`).
- Block update adds ~600ms per remediation entry (`gh pr view` + `gh pr edit`). Remediation is infrequent (≤3 attempts in the bounded loops), so lifecycle impact is bounded to ~2s worst case.
- Consumer parsing is a single regex + one `yaml.safe_load` on a ≤2KB payload — negligible (<10ms).
- `remediation_log` is capped at 50 most recent entries if PR body approaches GitHub's 65,536-char limit (documented in edge cases below).

### Stack-Specific

- **Python one-liner serialization:** the plugin already uses inline Python in several inline-steps (see e.g. acceptance-criteria parsing). Follow the same pattern: single-line invocation with `-c`, JSON input via argv to avoid shell quoting, `yaml.safe_dump(sort_keys=False)` for canonical order.
- **gh CLI:** use `--json`/`--jq` for reads and `--body-file` for writes to avoid shell quoting pitfalls with multi-line content.
- **Regex marker detection:** portable POSIX ERE (`grep -E`) for the fallback path; Python `re` for the primary path.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No design doc (Quick Fix scope) | `design_doc: null`, `design_doc_sha: null`, `plan_file: null`. Required fields still present. Block still emitted. |
| No linked issue | `issue: null`. Block still useful for `risk_areas`, `remediation_log`. |
| User manually edits block | On next update cycle, parse failure → warning → lifecycle leaves block alone, next update overwrites with fresh state. |
| User manually deletes block | Next update appends a fresh block to the body. |
| PR created outside lifecycle (manual `gh pr create`) | No block. Consumers fall back silently. |
| Resumed lifecycle updates same PR | Last writer wins. `lifecycle_session` reflects most recent; `created_at` preserved from original block. |
| HEAD moved past `acceptance_criteria_verified_sha` | Consumers treat the verification timestamp as a hint, not guarantee. `/merge-prs` may choose to re-verify. |
| `remediation_log` exceeds 50 entries or body nears 65,536 chars | Truncate `remediation_log` to most recent 50, log warning. |
| PyYAML unavailable AND `remediation_log` non-empty | `printf` fallback skips the block entirely for safety, logs warning. |
| `gh pr edit` rate-limited during update | Log warning, skip update, continue lifecycle. |
| `lifecycle.metadata_block.enabled: false` in config | Skip PR Metadata Block Step entirely; no warning. |

## Scope

### Included

- New `references/feature-flow-metadata-schema.md` as single source of truth
- New PR Metadata Block Step in `skills/start/references/inline-steps.md`
- One-line reference hook in `skills/start/references/yolo-overrides.md`
- Skill Mapping table row update in `skills/start/SKILL.md`
- `skills/merge-prs/SKILL.md` Step 4a.0 parser sub-step
- `skills/merge-prs/references/dependency-analysis.md` precedence paragraph
- `references/project-context-schema.md` `lifecycle.metadata_block.enabled` field (default `true`)
- Five fixture files under `skills/merge-prs/references/fixtures/`
- Single CHANGELOG `[Unreleased]` → `Added` entry
- Manual end-to-end test plan (see Acceptance criteria in issue #229)

### Excluded (out of scope)

- **Bidirectional updates** (consumers writing back to the block). Single-writer contract is intentional for simplicity.
- **Schema v2.** Defer until concrete need for breaking changes emerges.
- **Cross-repo metadata sync.**
- **Metadata querying across many PRs** (no new tooling; `gh pr list --search` works ad-hoc).
- **GraphQL / dedicated API endpoint for metadata.**
- **Automated (non-manual) end-to-end tests.** Manual verification per issue #229 AC is sufficient for v1.
- **Populating `sibling_prs` in Major Feature multi-PR flows.** The schema supports it; actual population is deferred to the future multi-PR lifecycle work. Current implementation always emits `[]`.
- **Inference-based `depends_on_prs`.** Only explicit `gh-pr:<N>` tokens in the design doc are honored. No heuristic inference.
- **`Harden PR` step integration** if that sibling work has not landed by implementation time: if `Harden PR` exists, its remediation-push sub-steps also append; if not, only `Wait for CI and address reviews` contributes — both paths are covered by the §Update Protocol helper.

## Dependencies

- **None hard.** This feature ships independently with graceful fallback on both sides.
- Most useful when paired with the already-landed #220 cross-PR dependency analysis and the in-flight Harden PR / Handoff refactor (#228, already merged per recent commits). Neither is a blocker.
