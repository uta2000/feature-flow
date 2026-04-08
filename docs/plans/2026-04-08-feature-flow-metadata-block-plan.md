# Feature-Flow Metadata Block Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Create references/feature-flow-metadata-schema.md — STATUS: pending
Task 2: Create 5 fixture files under skills/merge-prs/references/fixtures/ — STATUS: pending
Task 3: Edit skills/start/references/inline-steps.md — STATUS: pending
Task 4: Edit yolo-overrides.md + skills/start/SKILL.md table row — STATUS: pending
Task 5: Edit skills/merge-prs/SKILL.md + dependency-analysis.md — STATUS: pending
Task 6: Edit references/project-context-schema.md — STATUS: pending
Task 7: Edit CHANGELOG.md — STATUS: pending
CURRENT: none
-->

> **For Claude:** Read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.
> Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

**Goal:** Add a versioned, machine-readable `feature-flow-metadata` YAML block (inside an HTML comment) to every PR body created by `feature-flow:start`, so that `/merge-prs` and future consumers can read structured session metadata without reconstructing intent from diffs and titles.

**Architecture:** The lifecycle (`skills/start`) is the sole writer of the metadata block; `/merge-prs` is a read-only consumer with graceful fallback. A new top-level schema document (`references/feature-flow-metadata-schema.md`) is the single source of truth for field definitions, serialization, parsing rules, and the update protocol. All other files cross-reference the schema doc by name rather than duplicating rules.

**Tech Stack:** Markdown reference files, bash one-liners (`gh` CLI, `python3 -c 'import yaml'`), POSIX ERE regex for marker detection, GitHub PR API (`gh pr view --json body`, `gh pr edit --body-file`).

---

### Task 1: Create references/feature-flow-metadata-schema.md

**Files:**
- Create: `references/feature-flow-metadata-schema.md`

This is the foundation document. Every other task references anchors (`§Field Reference`, `§Parsing`, `§Update Protocol`) by name. Write this file completely before moving to Tasks 3–7.

**Step 1: Verify the file does not exist yet**

```bash
test -f /Users/weee/Dev/feature-flow/references/feature-flow-metadata-schema.md \
  && echo "EXISTS — do not overwrite" \
  || echo "OK to create"
```

Expected: `OK to create`

**Step 2: Write the schema document**

Create `/Users/weee/Dev/feature-flow/references/feature-flow-metadata-schema.md` with the following content (write verbatim):

```markdown
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
| 7 | `design_doc` | string or null | No | Repo-relative POSIX path to design doc (no `./` prefix, no absolute paths). `null` for scopes that skip design. |
| 8 | `design_doc_sha` | string or null | No | **Blob SHA** (content-addressed): `git rev-parse HEAD:<design_doc_path>`. Pins design content regardless of subsequent edits. `null` when `design_doc` is null. |
| 9 | `plan_file` | string or null | No | Repo-relative POSIX path to implementation plan. `null` for scopes that skip planning. |
| 10 | `acceptance_criteria_verified_at` | ISO 8601 UTC string or null | No | Timestamp when `verify-acceptance-criteria` last passed. `null` if not yet verified. |
| 11 | `acceptance_criteria_verified_sha` | string or null | No | **Commit SHA** at verification time: `git rev-parse HEAD`. `null` if not yet verified. |
| 12 | `acceptance_criteria_count` | integer or null | No | Count of `- [ ]` lines in the plan file at verification time. `null` if not yet verified. |
| 13 | `risk_areas` | list of strings | No | Top-level directories of changed files plus any individual file with >50 changed lines. Derived from `git diff --name-only --stat <base>...HEAD`. Deduped. Capped at 10 entries. Empty list `[]` when no diff yet. |
| 14 | `sibling_prs` | list of integers | No | PR numbers in the same lifecycle session. Always `[]` in the current implementation (multi-PR session support deferred). |
| 15 | `depends_on_prs` | list of integers | No | Parsed from explicit `gh-pr:<N>` tokens in the design doc body. No inference. `[]` when none found. |
| 16 | `remediation_log` | list of objects | No | Append-only log of remediation events. Each entry has `type` (string), `description` (string), `commit` (string), `at` (ISO 8601 UTC). Empty list `[]` at PR creation. Capped at 50 entries when body approaches GitHub's 65,536-char limit. |

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

- **v1 → v1 (adding fields):** Adding optional fields within v1 is non-breaking. Old consumers that don't know the new field ignore it (step 6 of §Parsing: missing optional fields default to `null`).
- **Breaking changes (rename, retype, remove required field):** Bump to v2. Coexist with v1 for one release cycle — new producers write v2, consumers accept both v1 and v2.
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
```

**Step 3: Verify the file was created with all required sections**

```bash
grep -c "§Field Reference\|§Serialization\|§Parsing\|§Update Protocol\|§Version Compatibility\|§Complete Example\|§Producer/Consumer Contract" \
  /Users/weee/Dev/feature-flow/references/feature-flow-metadata-schema.md
```

Expected: `7`

**Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow && \
git add references/feature-flow-metadata-schema.md && \
git commit -m "feat(#229): add feature-flow-metadata-schema.md — canonical schema reference"
```

**Acceptance Criteria:**
- [ ] `test -f /Users/weee/Dev/feature-flow/references/feature-flow-metadata-schema.md` exits 0
- [ ] `grep -c "§Field Reference" /Users/weee/Dev/feature-flow/references/feature-flow-metadata-schema.md` outputs `1`
- [ ] `grep -c "§Parsing" /Users/weee/Dev/feature-flow/references/feature-flow-metadata-schema.md` outputs `1`
- [ ] `grep -c "§Update Protocol" /Users/weee/Dev/feature-flow/references/feature-flow-metadata-schema.md` outputs `1`
- [ ] `grep -c "§Serialization" /Users/weee/Dev/feature-flow/references/feature-flow-metadata-schema.md` outputs `1`
- [ ] `grep -c "schema_version" /Users/weee/Dev/feature-flow/references/feature-flow-metadata-schema.md` outputs a number ≥ 5 (appears in field table, example, version compat, etc.)
- [ ] `grep -c "remediation_log" /Users/weee/Dev/feature-flow/references/feature-flow-metadata-schema.md` outputs a number ≥ 3
- [ ] `grep "lifecycle.metadata_block.enabled" /Users/weee/Dev/feature-flow/references/feature-flow-metadata-schema.md` exits 0

**Quality Constraints:**
- Error handling: this is a documentation file — no code. All prose must match the design doc exactly for field counts, names, and types.
- Types: `scope` enum values are exactly `quick_fix`, `small_enhancement`, `feature`, `major_feature` (no others). `risk_tier` values are exactly `low`, `medium`, `high`.
- Pattern reference: follow the structure of `references/project-context-schema.md` for section headings and field table format.
- Files modified: none (new file only)
- Parallelizable: yes (no shared files with Task 2)

---

### Task 2: Create 5 fixture files under skills/merge-prs/references/fixtures/

**Files:**
- Create: `skills/merge-prs/references/fixtures/metadata-block-happy.md`
- Create: `skills/merge-prs/references/fixtures/metadata-block-minimal.md`
- Create: `skills/merge-prs/references/fixtures/metadata-block-unparseable.md`
- Create: `skills/merge-prs/references/fixtures/metadata-block-absent.md`
- Create: `skills/merge-prs/references/fixtures/metadata-block-unknown-version.md`

These fixtures are self-contained — no dependency on Task 1 content (they demonstrate the schema format, not import it). Can run in parallel with Task 1.

**Step 1: Create the fixtures directory**

```bash
mkdir -p /Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures
```

**Step 2: Create metadata-block-happy.md (full well-formed v1 block)**

Create `/Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures/metadata-block-happy.md`:

```markdown
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
```

**Step 3: Create metadata-block-minimal.md (required fields only)**

Create `/Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures/metadata-block-minimal.md`:

```markdown
# Fixture: Minimal — Required Fields Only

**Purpose:** PR body with a v1 block containing only the 5 required fields. All optional fields are explicitly `null` or empty list. Used to verify that the consumer handles absent optional fields gracefully (defaults to `null`, no error).

**Expected consumer behavior:** Parse succeeds. Required fields bound. Optional fields (`issue`, `design_doc`, etc.) default to `null`. `risk_areas`, `sibling_prs`, `depends_on_prs`, `remediation_log` default to empty list `[]`. No warnings emitted.

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
design_doc: null
design_doc_sha: null
plan_file: null
acceptance_criteria_verified_at: null
acceptance_criteria_verified_sha: null
acceptance_criteria_count: null
risk_areas: []
sibling_prs: []
depends_on_prs: []
remediation_log: []
-->
```

**Step 4: Create metadata-block-unparseable.md (marker present, malformed YAML)**

Create `/Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures/metadata-block-unparseable.md`:

```markdown
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
```

**Step 5: Create metadata-block-absent.md (no marker at all)**

Create `/Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures/metadata-block-absent.md`:

```markdown
# Fixture: Absent — No Marker

**Purpose:** Standard PR body with no `feature-flow-metadata` marker. Represents a PR created manually (outside the lifecycle) or before this feature was shipped. Used to verify that the absent path is fully silent — no warning, no error.

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
```

**Step 6: Create metadata-block-unknown-version.md (v2 marker, v2 schema_version)**

Create `/Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures/metadata-block-unknown-version.md`:

```markdown
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
```

**Step 7: Verify all 5 fixture files exist**

```bash
for f in happy minimal unparseable absent unknown-version; do
  test -f "/Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures/metadata-block-${f}.md" \
    && echo "OK: $f" || echo "MISSING: $f"
done
```

Expected: 5 lines all starting with `OK:`

**Step 8: Commit**

```bash
cd /Users/weee/Dev/feature-flow && \
git add skills/merge-prs/references/fixtures/ && \
git commit -m "feat(#229): add 5 metadata-block fixture files for consumer parsing tests"
```

**Acceptance Criteria:**
- [ ] `test -f /Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures/metadata-block-happy.md` exits 0
- [ ] `test -f /Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures/metadata-block-minimal.md` exits 0
- [ ] `test -f /Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures/metadata-block-unparseable.md` exits 0
- [ ] `test -f /Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures/metadata-block-absent.md` exits 0
- [ ] `test -f /Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures/metadata-block-unknown-version.md` exits 0
- [ ] `grep "feature-flow-metadata:v1" /Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures/metadata-block-happy.md` exits 0
- [ ] `grep "feature-flow-metadata:v1" /Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures/metadata-block-minimal.md` exits 0
- [ ] `grep "feature-flow-metadata:v2" /Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures/metadata-block-unknown-version.md` exits 0
- [ ] `grep "feature-flow-metadata" /Users/weee/Dev/feature-flow/skills/merge-prs/references/fixtures/metadata-block-absent.md` exits 1 (no marker in absent fixture)
- [ ] happy fixture contains all 16 fields: `grep -c "schema_version\|lifecycle_session\|created_at\|scope\|risk_tier\|issue\|design_doc\|plan_file\|acceptance_criteria\|risk_areas\|sibling_prs\|depends_on_prs\|remediation_log" .../happy.md` ≥ 14 distinct lines

**Quality Constraints:**
- Error handling: fixtures are static markdown — no logic. Content must exactly match the design doc's specified fixture purposes.
- Pattern: follow the `# Fixture: [Name]` heading + `**Purpose:**` + `**Expected consumer behavior:**` structure for every fixture.
- Files modified: none (new files only)
- Parallelizable: yes (shares no files with Task 1)

---

### Task 3: Edit skills/start/references/inline-steps.md

**Files:**
- Modify: `skills/start/references/inline-steps.md` (design-first — file is >150 lines)

**Depends on:** Task 1 (schema doc must exist so cross-references to `§Parsing`, `§Update Protocol` point to a real file).

**Step 1: Read the file to understand current structure**

```bash
wc -l /Users/weee/Dev/feature-flow/skills/start/references/inline-steps.md
```

Then read the file. Key sections to locate:
- The heading immediately before the `## Wait for CI and Address Reviews Step` (to find insertion point for `## PR Metadata Block Step`)
- `### Phase 2c:` or the paragraph in step 6 of Phase 2 (Step 2c) that ends with `git push`
- `### Phase 3:` section to find the end of Phase 3 CI-fix instructions

**Step 2: Output your change plan before any edits**

Before editing, write out:
1. Where `## PR Metadata Block Step` will be inserted (which existing heading it goes after)
2. What text will be appended to Phase 2c (after step 8 — the re-wait step)
3. What text will be appended to Phase 3 (after step 3 — the re-wait step)

**Step 3: Insert new `## PR Metadata Block Step` section**

Find the `## Wait for CI and Address Reviews Step` heading. Insert the new section *before* it (after the preceding `---` separator line). Use Edit with the following text as `new_string` to replace the existing separator + heading:

```
---

## PR Metadata Block Step

This step runs during the `Commit and PR` phase, immediately after the PR body (summary, test plan, `## Implementation Context`, code-review summary) is assembled but **before** `gh pr create` is invoked. It assembles the `feature-flow-metadata` YAML block from in-memory lifecycle state and appends it as an HTML-commented block to the PR body.

**Skip condition:** If `lifecycle.metadata_block.enabled: false` in `.feature-flow.yml`, skip this step entirely with no warning.

**Process:**

1. Read lifecycle state to assemble the metadata object:
   - `lifecycle_session`: read from `.feature-flow/session.txt`
   - `created_at`: `date -u +%Y-%m-%dT%H:%M:%SZ`
   - `scope`, `risk_tier`, `issue`: from Step 1 lifecycle context
   - `design_doc`, `plan_file`: repo-relative paths from lifecycle state (null if scope skips these)
   - `design_doc_sha`: `git rev-parse HEAD:<design_doc_path>` (blob SHA; null if design_doc is null)
   - `acceptance_criteria_verified_at`, `acceptance_criteria_verified_sha`, `acceptance_criteria_count`: from `verify-acceptance-criteria` output (null if not yet run)
   - `risk_areas`: `git diff --name-only <base>...HEAD` → take top-level directories of changed files plus any individual file with >50 changed lines; dedupe; cap at 10 entries
   - `sibling_prs`: always `[]` (multi-PR session support deferred)
   - `depends_on_prs`: parse explicit `gh-pr:<N>` tokens from design doc body (empty list if none or no design doc)
   - `remediation_log`: always `[]` at PR creation

2. Build the JSON representation using `jq -n` (avoids shell quoting pitfalls):
   ```bash
   METADATA_JSON=$(jq -n \
     --argjson schema_version 1 \
     --arg lifecycle_session "$LIFECYCLE_SESSION" \
     --arg created_at "$CREATED_AT" \
     --arg scope "$SCOPE" \
     --arg risk_tier "$RISK_TIER" \
     --argjson issue "$ISSUE_OR_NULL" \
     --argjson design_doc "$DESIGN_DOC_OR_NULL" \
     --argjson design_doc_sha "$DESIGN_DOC_SHA_OR_NULL" \
     --argjson plan_file "$PLAN_FILE_OR_NULL" \
     --argjson acceptance_criteria_verified_at null \
     --argjson acceptance_criteria_verified_sha null \
     --argjson acceptance_criteria_count null \
     --argjson risk_areas "$RISK_AREAS_JSON" \
     --argjson sibling_prs '[]' \
     --argjson depends_on_prs "$DEPENDS_ON_PRS_JSON" \
     --argjson remediation_log '[]' \
     '$ARGS.named')
   ```

3. Serialize to YAML via Python one-liner (canonical field order, see `references/feature-flow-metadata-schema.md` §Serialization):
   ```bash
   METADATA_YAML=$(python3 -c \
     "import yaml,sys,json; d=json.loads(sys.argv[1]); print(yaml.safe_dump(d, sort_keys=False, default_flow_style=False).rstrip())" \
     "$METADATA_JSON")
   ```
   If this fails (PyYAML unavailable), use the printf fallback per `references/feature-flow-metadata-schema.md` §Serialization. If fallback also fails, log warning and skip block (continue to PR creation without block).

4. Append the block to the PR body file:
   ```bash
   printf '\n<!-- feature-flow-metadata:v1\n%s\n-->\n' "$METADATA_YAML" >> /tmp/ff_pr_body.md
   ```

5. Pass `/tmp/ff_pr_body.md` to `gh pr create --body-file /tmp/ff_pr_body.md` as the PR body.

**All failures are non-fatal.** If any sub-step fails (state read, serialization, file write), log a warning to stderr and proceed to PR creation without the block. The lifecycle never blocks on metadata.

See `references/feature-flow-metadata-schema.md` for field definitions, types, and derivation rules.

---

## Wait for CI and Address Reviews Step
```

**Step 4: Append remediation_log update to Phase 2c**

Locate the end of Phase 2c (Step 2c). The current last instruction in Step 2c is step 8: "After pushing fixes, re-wait for CI (Phase 1) one more time...". Append a new step 9 immediately after step 8, before the `### Phase 3` heading:

Find the unique text:
```
8. After pushing fixes, re-wait for CI (Phase 1) one more time to confirm the fix commit passes. Do NOT re-wait for a second round of bot reviews — the fix commit does not trigger a new full review from most bots.

### Phase 3: Handle CI failures
```

Replace with:
```
8. After pushing fixes, re-wait for CI (Phase 1) one more time to confirm the fix commit passes. Do NOT re-wait for a second round of bot reviews — the fix commit does not trigger a new full review from most bots.

9. **Update PR metadata remediation_log.** After the fix commit is pushed, append an entry to the `remediation_log` in the PR's `feature-flow-metadata` block. Follow the read-modify-write protocol in `references/feature-flow-metadata-schema.md` §Update Protocol. Entry fields: `type: "review-bot"`, `description: "addressed N review comments (K declined)"`, `commit: <fix_commit_sha>`, `at: <current UTC timestamp>`. This step is non-fatal — if it fails, log a warning and continue.

### Phase 3: Handle CI failures
```

**Step 5: Append remediation_log update to Phase 3**

Locate the end of Phase 3. The current last instruction is step 3: "After pushing a fix, return to Phase 1 (re-wait for CI)." Append a new step 4 after it.

Find the unique text (should be followed by `### Lifecycle Structure` or a `---` separator):
```
3. After pushing a fix, return to Phase 1 (re-wait for CI).
```

Replace with:
```
3. After pushing a fix, return to Phase 1 (re-wait for CI).

4. **Update PR metadata remediation_log.** After the fix commit is pushed, append an entry to the `remediation_log` in the PR's `feature-flow-metadata` block. Follow the read-modify-write protocol in `references/feature-flow-metadata-schema.md` §Update Protocol. Entry fields: `type: "ci-<category>"` (e.g. `"ci-lint"`, `"ci-test"`), `description: "<check name>: <brief fix description>"`, `commit: <fix_commit_sha>`, `at: <current UTC timestamp>`. This step is non-fatal — if it fails, log a warning and continue.
```

**Step 6: Verify the edits**

```bash
grep -n "PR Metadata Block Step\|Update PR metadata remediation_log" \
  /Users/weee/Dev/feature-flow/skills/start/references/inline-steps.md
```

Expected: 3 matches — one for the new section heading, one in Phase 2c step 9, one in Phase 3 step 4.

**Step 7: Commit**

```bash
cd /Users/weee/Dev/feature-flow && \
git add skills/start/references/inline-steps.md && \
git commit -m "feat(#229): add PR Metadata Block Step + remediation_log update hooks to inline-steps.md"
```

**Acceptance Criteria:**
- [ ] `grep -c "## PR Metadata Block Step" /Users/weee/Dev/feature-flow/skills/start/references/inline-steps.md` outputs `1`
- [ ] `grep -c "Update PR metadata remediation_log" /Users/weee/Dev/feature-flow/skills/start/references/inline-steps.md` outputs `2`
- [ ] `grep "feature-flow-metadata-schema.md §Update Protocol" /Users/weee/Dev/feature-flow/skills/start/references/inline-steps.md` exits 0 (referenced by name in both Phase 2c and Phase 3 updates)
- [ ] `grep "feature-flow-metadata-schema.md §Serialization" /Users/weee/Dev/feature-flow/skills/start/references/inline-steps.md` exits 0 (referenced in new PR Metadata Block Step)
- [ ] `grep "lifecycle.metadata_block.enabled" /Users/weee/Dev/feature-flow/skills/start/references/inline-steps.md` exits 0 (skip condition documented)
- [ ] `grep "gh pr create --body-file" /Users/weee/Dev/feature-flow/skills/start/references/inline-steps.md` exits 0 (body-file usage documented in new step)
- [ ] New section appears BEFORE `## Wait for CI and Address Reviews Step`: `grep -n "PR Metadata Block Step\|Wait for CI" .../inline-steps.md` — Metadata Block Step line number < Wait for CI line number

**Quality Constraints:**
- Error handling: all new prose must state failures are non-fatal and log warnings. Never say the lifecycle "blocks" on metadata.
- Pattern reference: follow the existing inline step format — `**Process:**` bullet numbered list, `**Skip condition:**` note, `bash` code blocks.
- Files modified: `skills/start/references/inline-steps.md` (design-first — >150 lines)
- Design-first files: `skills/start/references/inline-steps.md` — output change plan in Step 2 before any Edit call.
- Parallelizable: no (shares inline-steps.md with no other task but depends on Task 1)

---

### Task 4: Edit yolo-overrides.md + skills/start/SKILL.md table row

**Files:**
- Modify: `skills/start/references/yolo-overrides.md`
- Modify: `skills/start/SKILL.md`

**Depends on:** Task 3 (the anchor `## PR Metadata Block Step` in inline-steps.md must exist before we reference it by name).

**Step 1: Read and output change plan for yolo-overrides.md**

Read `skills/start/references/yolo-overrides.md`, section `## Finishing a Development Branch YOLO Override`. Locate step 7 (archive phase context files) and step 8 (inject context into PR body — currently labeled as step 7 in the file; check exact numbering). We need to insert step 7a between them.

Current step 7 text (from the file, line ~163):
```
7. **Inject context into PR body.**
```

Wait — re-read the file. The current steps are numbered 1–9. Step 7 is currently:
```
7. **Inject context into PR body.** Append an `## Implementation Context` section...
```
And step 6 is:
```
6. **Archive phase context files.** Skip — `.feature-flow/` files are session-local...
```

We insert 7a between step 7 and step 8. Step 8 is currently "Test failure during completion."

**Step 2: Insert step 7a into yolo-overrides.md**

Find unique text (step 7 end and step 8 start):
```
   - Omit subsections whose files contain only template placeholder text (no real entries)
8. **Test failure during completion:**
```

Replace with:
```
   - Omit subsections whose files contain only template placeholder text (no real entries)
7a. **Append feature-flow-metadata block.** Run the PR Metadata Block Step from `inline-steps.md` §PR Metadata Block Step. Applies in all modes (YOLO, Express, Interactive) — not YOLO-specific.
8. **Test failure during completion:**
```

**Step 3: Verify yolo-overrides.md edit**

```bash
grep -n "7a\|PR Metadata Block Step" \
  /Users/weee/Dev/feature-flow/skills/start/references/yolo-overrides.md
```

Expected: 1 line containing both `7a` and `PR Metadata Block Step`.

**Step 4: Read and output change plan for SKILL.md**

Read `skills/start/SKILL.md` around line 614. The Skill Mapping table row for `Commit and PR` currently reads:

```
| Commit and PR | `superpowers:finishing-a-development-branch` | PR URL |
```

We need to update the expected output column to mention the metadata block.

**Step 5: Edit SKILL.md Skill Mapping table row**

Find (unique — only one `Commit and PR` row in the table):
```
| Commit and PR | `superpowers:finishing-a-development-branch` | PR URL |
```

Replace with:
```
| Commit and PR | `superpowers:finishing-a-development-branch` | PR URL; PR body includes `feature-flow-metadata` block (all modes) |
```

**Step 6: Verify SKILL.md edit**

```bash
grep "feature-flow-metadata.*all modes" \
  /Users/weee/Dev/feature-flow/skills/start/SKILL.md
```

Expected: 1 match.

**Step 7: Commit**

```bash
cd /Users/weee/Dev/feature-flow && \
git add skills/start/references/yolo-overrides.md skills/start/SKILL.md && \
git commit -m "feat(#229): add step 7a metadata block hook in yolo-overrides + update SKILL.md table"
```

**Acceptance Criteria:**
- [ ] `grep -c "7a.*Append feature-flow-metadata block" /Users/weee/Dev/feature-flow/skills/start/references/yolo-overrides.md` outputs `1`
- [ ] `grep "inline-steps.md.*PR Metadata Block Step" /Users/weee/Dev/feature-flow/skills/start/references/yolo-overrides.md` exits 0
- [ ] `grep "all modes" /Users/weee/Dev/feature-flow/skills/start/references/yolo-overrides.md` exits 0 (clarification note present)
- [ ] `grep "feature-flow-metadata.*all modes" /Users/weee/Dev/feature-flow/skills/start/SKILL.md` exits 0
- [ ] `grep "Commit and PR.*finishing-a-development-branch.*feature-flow-metadata" /Users/weee/Dev/feature-flow/skills/start/SKILL.md` exits 0

**Quality Constraints:**
- Error handling: yolo-overrides.md step 7a is a one-line cross-reference only — no error handling prose needed (the referenced inline-steps.md section has it).
- Pattern reference: follow exact step numbering style in `yolo-overrides.md` — bold step label, then sentence.
- Files modified: `skills/start/references/yolo-overrides.md`, `skills/start/SKILL.md`
- Design-first files: both files are design-first (>150 lines each). Output change plan for each before editing.
- Parallelizable: no (depends on Task 3; also SKILL.md and yolo-overrides.md are both in this task only)

---

### Task 5: Edit skills/merge-prs/SKILL.md + dependency-analysis.md

**Files:**
- Modify: `skills/merge-prs/SKILL.md`
- Modify: `skills/merge-prs/references/dependency-analysis.md`

**Depends on:** Task 1 (schema doc must exist for cross-references), Task 2 (fixtures must exist for cross-reference in dependency-analysis.md).

**Step 1: Read and output change plan for merge-prs/SKILL.md**

Read `skills/merge-prs/SKILL.md`. Locate the `## Step 4: Sequential Merge Execution` section and the `**4a. Pre-merge checks (parallel `gh` calls):**` block. We need to insert sub-step `4a.0` before the existing `4a.1`-equivalent content (the bullet list starting with `- If state: "MERGED":`).

Current text around line 84–95:
```
**4a. Pre-merge checks (parallel `gh` calls):**
```bash
# Check current state
gh pr view <number> --json state,mergeable,statusCheckRollup,reviews
```

- If `state: "MERGED"`: announce...
```

**Step 2: Insert sub-step 4a.0 into merge-prs/SKILL.md**

Find (unique — only one `4a. Pre-merge checks` in the file):
```
**4a. Pre-merge checks (parallel `gh` calls):**
```

Replace the entire `4a` block opening (from the `**4a.**` line through to just before `- If \`state: "MERGED"\``) with a version that prepends sub-step 4a.0:

Find exact unique string (including the code block and blank line before the bullet list):
```
**4a. Pre-merge checks (parallel `gh` calls):**
```bash
# Check current state
gh pr view <number> --json state,mergeable,statusCheckRollup,reviews
```

- If `state: "MERGED"`: announce "PR #N already merged — skipping." Continue.
```

Replace with:
```
**4a. Pre-merge checks:**

**4a.0 Parse feature-flow-metadata block.** Fetch the PR body and parse the `feature-flow-metadata` block per `references/feature-flow-metadata-schema.md` §Parsing:
```bash
gh pr view <number> --json body --jq '.body'
```
- On successful parse: bind `metadata.sibling_prs`, `metadata.depends_on_prs`, `metadata.risk_areas`, and `metadata.remediation_log` into the PR's pre-merge context for use in dependency analysis (Step 3) and CI remediation de-duplication (Step 4b).
- On absent block, unparseable block, unknown version, or missing required fields: log one warning (per `references/feature-flow-metadata-schema.md` §Parsing warning budget), bind `metadata` to `null`, and continue with diff-based inference. This is the expected path for PRs created outside the lifecycle.
- See `references/fixtures/` for test cases: `metadata-block-happy.md` (success path), `metadata-block-unparseable.md`, `metadata-block-absent.md`, `metadata-block-unknown-version.md`.

**4a.1 Check current state (parallel `gh` calls):**
```bash
# Check current state
gh pr view <number> --json state,mergeable,statusCheckRollup,reviews
```

- If `state: "MERGED"`: announce "PR #N already merged — skipping." Continue.
```

**Step 3: Verify merge-prs/SKILL.md edit**

```bash
grep -n "4a.0\|4a.1\|feature-flow-metadata-schema.md" \
  /Users/weee/Dev/feature-flow/skills/merge-prs/SKILL.md
```

Expected: lines for `4a.0`, `4a.1`, and at least 1 line with `feature-flow-metadata-schema.md`.

**Step 4: Read and output change plan for dependency-analysis.md**

Read `skills/merge-prs/references/dependency-analysis.md`. Current first heading after the intro is `## Step 1: Collect Changed Files per PR` (line ~17). We insert the new `## Metadata Block Precedence` section BEFORE Step 1, after the `---` separator.

**Step 5: Insert §Metadata Block Precedence into dependency-analysis.md**

Find (unique — only one `## Step 1: Collect Changed Files` heading):
```
## Step 1: Collect Changed Files per PR
```

Replace with:
```
## Metadata Block Precedence

When a PR's `feature-flow-metadata` block is present and parseable (bound to `metadata` in Step 4a.0 of `SKILL.md`), prefer its fields over diff-based file-overlap inference:

| Metadata field | Use in dependency analysis |
|---------------|---------------------------|
| `depends_on_prs` | Hard ordering requirements — these PRs must merge before this one, regardless of file overlap. |
| `sibling_prs` | Same-session grouping — treat as a batch; order within the batch by existing heuristics 2–5. |
| `risk_areas` | Semantic touchpoints — when two PRs share a `risk_areas` entry, treat as a soft ordering hint (prefer the PR with fewer `risk_areas` first to minimize blast radius). |

**Metadata is additive, not replacing.** Inference-detected edges not covered by metadata still apply. Example: if diff analysis finds PR B imports a file PR A changes, that constraint holds even if `depends_on_prs` is empty.

**When metadata is absent or `metadata` is `null`:** Skip this section entirely. Proceed directly to Steps 1–5 (diff-based inference). This is the expected path for PRs created outside the lifecycle.

See `references/fixtures/metadata-block-happy.md` for an example of a PR body with a well-formed block, and `references/fixtures/metadata-block-absent.md` for the no-block path.

---

## Step 1: Collect Changed Files per PR
```

**Step 6: Verify dependency-analysis.md edit**

```bash
grep -n "Metadata Block Precedence\|depends_on_prs\|sibling_prs" \
  /Users/weee/Dev/feature-flow/skills/merge-prs/references/dependency-analysis.md
```

Expected: at least 3 matches — one for the section heading, one for `depends_on_prs`, one for `sibling_prs`.

**Step 7: Commit**

```bash
cd /Users/weee/Dev/feature-flow && \
git add skills/merge-prs/SKILL.md skills/merge-prs/references/dependency-analysis.md && \
git commit -m "feat(#229): add 4a.0 metadata parse sub-step to merge-prs + Metadata Block Precedence section"
```

**Acceptance Criteria:**
- [ ] `grep -c "4a.0 Parse feature-flow-metadata block" /Users/weee/Dev/feature-flow/skills/merge-prs/SKILL.md` outputs `1`
- [ ] `grep "feature-flow-metadata-schema.md.*§Parsing" /Users/weee/Dev/feature-flow/skills/merge-prs/SKILL.md` exits 0
- [ ] `grep "4a.1" /Users/weee/Dev/feature-flow/skills/merge-prs/SKILL.md` exits 0 (old pre-merge content now labeled 4a.1)
- [ ] `grep -c "## Metadata Block Precedence" /Users/weee/Dev/feature-flow/skills/merge-prs/references/dependency-analysis.md` outputs `1`
- [ ] Precedence section appears BEFORE Step 1: `grep -n "Metadata Block Precedence\|Step 1: Collect Changed" .../dependency-analysis.md` — Precedence line < Step 1 line
- [ ] `grep "depends_on_prs" /Users/weee/Dev/feature-flow/skills/merge-prs/references/dependency-analysis.md` exits 0
- [ ] `grep "sibling_prs" /Users/weee/Dev/feature-flow/skills/merge-prs/references/dependency-analysis.md` exits 0
- [ ] `grep "metadata-block-happy.md\|metadata-block-absent.md" /Users/weee/Dev/feature-flow/skills/merge-prs/references/dependency-analysis.md` exits 0 (fixture cross-references present)

**Quality Constraints:**
- Error handling: 4a.0 sub-step must explicitly state what happens on absent/unparseable block (one warning, bind to null, continue with inference — never crash).
- Pattern reference: follow the existing `4a.` sub-step style in `SKILL.md`. For dependency-analysis.md, follow existing `## Step N` section format with a table.
- Files modified: `skills/merge-prs/SKILL.md` (design-first), `skills/merge-prs/references/dependency-analysis.md`
- Design-first files: `skills/merge-prs/SKILL.md` — output change plan before editing.
- Parallelizable: no (depends on Tasks 1 and 2; shares no files with Tasks 3/4/6/7 but must run after them)

---

### Task 6: Edit references/project-context-schema.md

**Files:**
- Modify: `references/project-context-schema.md` (design-first — file is >150 lines)

**Depends on:** None (can run after Task 1 is committed, but the content doesn't cross-reference Task 1 — it's self-contained). Can run in parallel with Tasks 4 and 5 if Task 1 is done.

**Step 1: Read and output change plan**

Read `references/project-context-schema.md` around line 407–425 to confirm the exact text of the `#### lifecycle.handoff` section ending (the `**When absent:**` note) and what follows it. We insert the new `#### lifecycle.metadata_block` sub-section immediately after the `#### lifecycle.handoff` closing block.

Current structure around lines 406–426:
```
**When absent:** Defaults to `false`. The handoff step announces...

**Trade-off:** Set `auto_invoke_merge_prs: true` only when...

### `changelog`
```

**Step 2: Insert `#### lifecycle.metadata_block` sub-section**

Find the unique text (end of lifecycle.handoff section, start of changelog):
```
**Trade-off:** Set `auto_invoke_merge_prs: true` only when you want YOLO to run fully end-to-end without human intervention — for example, in automated release pipelines or scheduled lifecycle runs. For interactive development, keep the default.

### `changelog`
```

Replace with:
```
**Trade-off:** Set `auto_invoke_merge_prs: true` only when you want YOLO to run fully end-to-end without human intervention — for example, in automated release pipelines or scheduled lifecycle runs. For interactive development, keep the default.

#### `lifecycle.metadata_block`

Controls the PR Metadata Block Step, which appends a versioned `feature-flow-metadata` YAML block inside an HTML comment to every PR body created by the lifecycle.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | When `false`, skip the PR Metadata Block Step entirely. No warning is emitted when skipped. |

**Format:**

```yaml
lifecycle:
  metadata_block:
    enabled: true
```

**When absent:** Defaults to `true`. The PR Metadata Block Step runs for all scopes and all modes (YOLO, Express, Interactive). Set `enabled: false` to opt out if the metadata block causes issues (e.g. downstream tooling that parses PR bodies fails on the HTML comment).

### `changelog`
```

**Step 3: Verify the edit**

```bash
grep -n "lifecycle.metadata_block\|metadata_block" \
  /Users/weee/Dev/feature-flow/references/project-context-schema.md
```

Expected: at least 3 matches (the `####` heading, the `enabled` field row, the format block).

**Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow && \
git add references/project-context-schema.md && \
git commit -m "feat(#229): add lifecycle.metadata_block.enabled config field to project-context-schema.md"
```

**Acceptance Criteria:**
- [ ] `grep -c "#### \`lifecycle.metadata_block\`" /Users/weee/Dev/feature-flow/references/project-context-schema.md` outputs `1`
- [ ] `grep "enabled.*boolean.*true" /Users/weee/Dev/feature-flow/references/project-context-schema.md` exits 0 (field table row present)
- [ ] New section appears AFTER `lifecycle.handoff` and BEFORE `### \`changelog\``: verify line ordering via `grep -n`
- [ ] `grep "When absent.*true" /Users/weee/Dev/feature-flow/references/project-context-schema.md` exits 0 (When absent note present)

**Quality Constraints:**
- Pattern reference: match exactly the format of `#### lifecycle.harden_pr` and `#### lifecycle.handoff` — field table + `**Format:**` YAML block + `**When absent:**` note.
- Files modified: `references/project-context-schema.md` (design-first)
- Design-first files: `references/project-context-schema.md` — output change plan in Step 1 before any Edit call.
- Parallelizable: no (shares project-context-schema.md with no other task; but safe to parallelize with Tasks 4–5 since those touch different files — set to yes after confirming)
- Parallelizable: yes (different file from all other tasks in this plan)

---

### Task 7: Edit CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md`

**Depends on:** None — can run at any time. Parallelizable with everything.

**Step 1: Read current [Unreleased] section**

Read `CHANGELOG.md` lines 1–25 to confirm the current `## [Unreleased]` → `### Added` entry format and what the last entry is.

**Step 2: Append new Added entry**

Find (unique — the first `### Added` under `## [Unreleased]`):
```
### Added
- `.feature-flow.yml` schema: `lifecycle.harden_pr`
```

Replace with:
```
### Added
- Feature-flow lifecycle now writes a versioned `feature-flow-metadata` YAML block inside an HTML comment to every PR body (opt-out via `lifecycle.metadata_block.enabled: false`). `/merge-prs` reads the block for dependency analysis and remediation de-duplication with graceful fallback to diff-based inference when the block is absent or unparseable. See `references/feature-flow-metadata-schema.md` for the full schema.
- `.feature-flow.yml` schema: `lifecycle.harden_pr`
```

**Step 3: Verify the edit**

```bash
grep -n "feature-flow-metadata.*YAML block\|lifecycle.metadata_block.enabled" \
  /Users/weee/Dev/feature-flow/CHANGELOG.md
```

Expected: 1 match on the new entry line.

**Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow && \
git add CHANGELOG.md && \
git commit -m "chore(#229): add CHANGELOG entry for feature-flow-metadata block"
```

**Acceptance Criteria:**
- [ ] `grep -c "feature-flow-metadata.*YAML block" /Users/weee/Dev/feature-flow/CHANGELOG.md` outputs `1`
- [ ] `grep "lifecycle.metadata_block.enabled" /Users/weee/Dev/feature-flow/CHANGELOG.md` exits 0 (opt-out path mentioned)
- [ ] `grep "merge-prs.*dependency analysis" /Users/weee/Dev/feature-flow/CHANGELOG.md` exits 0 (consumer use case mentioned)
- [ ] `grep "feature-flow-metadata-schema.md" /Users/weee/Dev/feature-flow/CHANGELOG.md` exits 0 (reference to schema doc)
- [ ] New entry is under `## [Unreleased]` → `### Added` (not under a versioned release): verify via `grep -n "Unreleased\|feature-flow-metadata" CHANGELOG.md` — Unreleased line number < new entry line number < first versioned release line number

**Quality Constraints:**
- Single entry, single sentence (two clauses max). Follow the existing entry style — no headers, backtick-quoted config keys.
- Parallelizable: yes (CHANGELOG.md not touched by any other task in this plan)

---

## Execution Order Summary

| Wave | Tasks | Notes |
|------|-------|-------|
| Wave 1 (parallel) | Task 1, Task 2, Task 7 | No dependencies between them. Task 1 = schema doc foundation. Task 2 = fixture files. Task 7 = CHANGELOG. |
| Wave 2 (sequential after Wave 1) | Task 3 | Depends on Task 1 (cross-references §Parsing, §Update Protocol). |
| Wave 3 (sequential after Wave 2) | Task 4 | Depends on Task 3 (references `§PR Metadata Block Step` anchor). Task 6 can also run here (different file, no task deps after Task 1). |
| Wave 3 (parallel with Task 4) | Task 6 | Depends on Task 1 only (done in Wave 1). Safe to parallelize with Task 4. |
| Wave 4 (after Wave 3) | Task 5 | Depends on Task 1 (§Parsing reference in SKILL.md), Task 2 (fixture cross-refs in dependency-analysis.md). |

**Safe to parallelize in a single message:** Tasks 1+2+7 (Wave 1), Tasks 4+6 (Wave 3).
