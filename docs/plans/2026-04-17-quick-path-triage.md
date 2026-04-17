# Quick-Path Triage — Design Document

**Date:** 2026-04-17
**Status:** Draft
**Issue:** [#234](https://github.com/uta2000/feature-flow/issues/234) — `start: add quick-path triage with code-aware scope confirmation`
**Base branch:** `main`
**Scope:** feature
**Supersedes:** none
**Parallel work:** Issue #235 (codex consultation) — see "Interaction with #235" below.

## Overview

Extend `skills/start/SKILL.md`'s existing Tool Selection step from a 2-way decision (feature-flow / GSD) into a 3-way triage (**quick** / feature-flow / GSD) that can route bounded, code-confirmed trivial changes to a bare implement-and-commit path — skipping brainstorm, design, verify, plan, acceptance criteria, and handoff. The quick path is reached only when a read-only confirmation pass (≤5 Bash/Grep/Read/Glob tool calls) proves, via five ordered gates, that the edit is inside Markdown prose / non-log-call string literals / comments and stays within configured file and line budgets. All gate failures silently fall through to the existing feature-flow/GSD scoring, unchanged.

## Example

**User input:**
```
start: fix typo in skills/start/SKILL.md line 15 — "Teh" should be "The"
```

**Triage output (single auditable line, pre-edit):**
```
⚡ Quick path confirmed: skills/start/SKILL.md:15 — prose edit in Markdown, 1 file, budget: ≤10 lines. Editing directly.
```

**Actions taken (in order):**
1. `git status --porcelain` → empty (Gate 0 pass)
2. Grep `"Teh "` in `skills/start/SKILL.md` → 1 hit at line 15 (Gates 1, 2 pass)
3. In-process AST: byte range does not overlap any `export`/`module.exports` node (Gate 3 pass — no code exports in a Markdown file, trivially pass)
4. In-process AST: byte range is inside Markdown prose outside fenced code blocks (Gate 4 pass)
5. Edit file → Stop-hook runs (tsc / lint / type-sync) → `git diff --numstat` sums to ≤10 added+removed → commit with model-authored imperative message `docs: fix typo in start SKILL.md (1 line changed)` → no Claude co-author trailer → no design doc, no plan, no handoff.

**Counter-example — Gate 1 failure:**
```
start: fix the login bug
```
→ No concrete target → Gate 1 fails → *"No specific target named — running normal lifecycle. If you meant a specific file, say `start: fix typo in X.ts line 42`."* → normal feature-flow/GSD scoring runs.

**Counter-example — Gate 2 failure:**
```
start: rename processPayment to handlePayment
```
→ Grep finds 23 call sites across 8 files → Gate 2 fails (`max_files: 3`) → silent fallthrough to normal lifecycle.

## User Flow

### Step 1 — User runs `start:` with a description

User types `start: <description> [--no-quick | --feature-flow | --gsd]`. Flag precedence (new and existing): `--gsd` > `--feature-flow` > `--no-quick` > auto-detection. `--no-quick` disables quick-path confirmation for this invocation and forwards directly to the existing 2-way heuristic scoring. **There is no `--quick` flag** — a flag that still runs gates but errors on failure contradicts its own name.

### Step 2 — Triage (renamed from "Tool Selection")

The `skills/start/SKILL.md` heading at line 13 is renamed from `## Tool Selection` to `## Triage`. The section now documents a 3-way decision: **quick / feature-flow / GSD**. Step 3 of the skill body ("Run heuristic detection") gains a new **Quick-Path Confirmation** subsection that runs **before** the existing GSD heuristic scoring.

### Step 3 — Quick-Path Confirmation (new subsection, read-only)

Five gates run in strict order 0 → 4. **First failure short-circuits and halts budget spend.** The pass budget is ≤5 tool calls (Bash / Grep / Read / Glob only); in-process AST tokenization and byte-range overlap checks do **not** count against the budget. If confirmation needs more than 5 tool calls, the change is not quick by definition — abort confirmation and fall through.

| # | Gate | Pass condition | Fail surface |
|---|------|----------------|--------------|
| 0 | Clean working tree | `git status --porcelain` returns empty | *"Working tree is dirty — running normal lifecycle to avoid trampling in-progress work."* |
| 1 | Concrete target identifiable | Description names a file path, function name, symbol, or string literal | *"No specific target named — running normal lifecycle. If you meant a specific file, say `start: fix typo in X.ts line 42`."* |
| 2 | Bounded file count | Target resolves to ≤ `max_files` (default 3) | silent fallthrough |
| 3 | No exported-declaration overlap | Edit byte range does not overlap any `export` / `export default` / `module.exports` AST node. Check is mechanical byte-range overlap; edits to the body of a re-exported internal symbol pass (byte range does not overlap the export node itself). | silent fallthrough |
| 4 | Lexical-region rule | Every proposed `old_string` byte range sits entirely inside one of: (a) Markdown prose outside `` ``` `` fences; (b) a string literal in a code file that is **not** a syntactic argument to a log/logger/console/logging call expression (root-identifier match); (c) a line or block comment | silent fallthrough |

**Gate 3 semantics.** Mechanical byte-range overlap against AST export nodes. Not a "flows outward" semantic check — cross-file type analysis would reintroduce the taxonomy-by-vibes failure mode Gate 4 was redesigned to eliminate. Edits to the body of a re-exported internal symbol pass Gate 3 (byte range does not overlap the `export` node itself); Gate 4 catches such edits via identifier-position exclusion.

**Gate 4 semantics.** The log-call exclusion is an AST ancestor walk: from the matched string-literal node, walk up to the nearest enclosing `CallExpression` or `TaggedTemplateExpression`; resolve the callee to its root identifier (leftmost name in `a.b.c.d()` is `a`; for `this.x.y()`, look one level in: `x`). If the root identifier (case-insensitive) is exactly `log`, `logger`, `console`, or `logging` (Python stdlib), Gate 4 **fails**. Numeric literals, boolean literals, identifiers, keywords, imports, type annotations, decorators, and operators always fail Gate 4. Rationale: triviality of a numeric/boolean literal depends on call-site semantics that can't be confirmed locally, and log-call string arguments can silently change observability contracts or mask PII-masking logic.

### Step 4 — Display recommendation (existing Step 5, extended)

A fourth band is prepended to the recommendation UI: **⚡ quick path**, reached **only** via confirmation gates, never via heuristic scoring. Announcement format (single line, pre-edit, auditable):

```
⚡ Quick path confirmed: <path>:<line> — <region kind> in <language>, <N> file(s), budget: ≤<max_changed_lines> lines. Editing directly.
```

Example region-kind strings: `prose edit in Markdown`, `comment edit in TypeScript`, `string-literal edit in Python`.

### Step 5 — Quick-Path Execution (new branch in existing Step 6)

See `skills/start/SKILL.md` Step 6 quick-path branch for the canonical 8-step execution flow. This doc mirrors that flow; if they diverge, SKILL.md wins.

**Key Decisions (for traceability):**
- Escape hatch uses `git clean -f -- <paths>` before `git checkout -- <paths>` to handle newly-created files; multi-file atomic across tracked + untracked cases because Gate 0 proved the pre-state clean.
- Commit style observed from `git log --oneline -10` (not -20 — commit style is set in the last handful of commits).
- **No Claude co-author trailer** — quick-path commits are deterministic, top-to-bottom model edits, not human-model collaborations; adding a co-author trailer would misrepresent their authorship.

## Patterns & Constraints

### Error Handling

- **Gate failures are silent fallthrough**, with two documented exceptions that surface verbatim user hints: Gate 0 ("dirty tree") and Gate 1 ("no specific target"). All other failures fall through without surfacing.
- **Budget exhaustion** (>5 confirmation tool calls reached) is a silent fallthrough — the change is not quick by definition.
- **Escape-hatch rollback is best-effort-safe by precondition.** Gate 0 guarantees the working tree was clean before quick path wrote anything; therefore `git clean -f -- <confirmed files> && git checkout -- <confirmed files>` can only discard what quick path itself wrote. `git clean` removes newly-created files first; `git checkout` restores tracked modifications. This is the load-bearing safety invariant.
- **Escape hatch is multi-file atomic.** If any confirmed file fails the post-conditions, **all** confirmed files are restored via `git clean -f -- <all confirmed paths>` followed by `git checkout -- <all confirmed paths>`, even if only one was edited. No partial commits.
- **Stop-hook failures** → escape hatch fires, no commit.
- **Confirmation is read-only.** Grep + Read only. No edits, no writes, no commits, until all gates pass.

### Types

- `tool_selector.quick_path.enabled`: boolean, default `true`
- `tool_selector.quick_path.max_confirmation_tool_calls`: integer ≥ 1, default `5`
- `tool_selector.quick_path.max_files`: integer ≥ 1, default `3` (chosen so routine multi-file prose fixes like `fix typos in README and CHANGELOG` can take the quick path)
- `tool_selector.quick_path.max_changed_lines`: integer ≥ 1, default `10` (stronger scale guardrail than `max_files` — binds total edit size regardless of file count)
- CLI flag: `--no-quick` only. `--quick` is explicitly NOT added.

### Performance

- Confirmation must not exceed 5 external tool calls (Bash / Grep / Read). In-process AST work is unbounded but cheap relative to model latency.
- Gates are evaluated in strict order, short-circuiting on first failure, so failed quick-path confirmations remain cheap (typically 1–2 tool calls before fallthrough).
- Post-hook `git diff --numstat` is a single Bash call, O(1) relative to edit size.

### Stack-Specific

- **Language coverage for AST-backed gates (3 and 4):** Markdown (CommonMark with fence-awareness), TypeScript, JavaScript, Python. Unsupported languages → conservative fail (Gate 4 fails → fall through to normal lifecycle). No silent pass on unknown languages.
- **AST mechanism.** `skills/start/SKILL.md` is a prose markdown document executed by Claude via Bash/Grep/Read tools — there is no runtime library to integrate a tree-sitter binding against. Claude performs the lexical-region and export-overlap checks mentally, consistent with how it already reasons about Edit-tool targets (Edit's `old_string` matching is already a form of lexical-region reasoning). The skill documents the **semantics** of the gates; enforcement is by Claude's in-context reasoning, the same primitive feature-flow uses everywhere else. If a future implementation phase needs to externalize the gates into a subprocess (e.g. for audit replay), tree-sitter is the preferred parser.
- **Stop hook remains blocking.** tsc, lint, type-sync, and existing anti-pattern hooks (no `any`, no empty catch) run on the quick-path edit just like the normal lifecycle.

## Configuration

New section in `.feature-flow.yml` under the existing `tool_selector`:

```yaml
tool_selector:
  enabled: true
  confidence_threshold: 0.7
  auto_launch_gsd: false
  quick_path:
    enabled: true
    max_confirmation_tool_calls: 5
    max_files: 3
    max_changed_lines: 10
```

Defaults if the `quick_path` sub-section is missing: all four keys take the values above. Defaults are chosen so the quick path is **on** out of the box.

**CLI × config precedence (extends the existing flag grammar):**

1. `--gsd` (highest, existing)
2. `--feature-flow` (existing)
3. `--no-quick` (new) — forces quick-path off for this invocation
4. Config file `tool_selector.quick_path.enabled`
5. Built-in default (`enabled: true`)

`--no-quick` × `quick_path.enabled: false` is a documented no-op: CLI flag just confirms the config. No error.

## CLI Flag Grammar Changes

Specific edits to the Command-Line Flag Parsing section of `skills/start/SKILL.md` (currently starts at line 109):

- Usage line extends to: `start: <description> [--feature-flow | --gsd | --no-quick]`
- Parsing logic gains a `--no-quick` branch that sets an override disabling quick-path confirmation.
- Priority list gains `--no-quick` between `--feature-flow` and automatic detection.

## Changes to `skills/start/SKILL.md`

Specific edits required (no changes to the parts listed in **Out of Scope**):

1. **Rename** heading `## Tool Selection` (line 13) → `## Triage`. Update the section's one-line description to "3-way decision: quick / feature-flow / GSD".
2. **Step 3 ("Run heuristic detection")** — prepend a new subsection **"Quick-Path Confirmation"** documenting all 5 gates in strict order 0–4, the ≤5 tool-call budget, the rule that in-process AST work does not count, and the boolean short-circuit to quick path on all-pass / silent fallthrough on any fail.
3. **Step 5 ("Display recommendation")** — add a fourth band at the top: **⚡ quick path**, reached only via confirmation gates (not scoring). Document the auditable one-line announcement format.
4. **Step 6 ("Execute user choice")** — add a quick-path execution branch with the 8-step execution flow above, including the Gate-0-safe multi-file atomic rollback and the post-hook `max_changed_lines` check.
5. **Command-Line Flag Parsing section** (line 109) — add `--no-quick` to the usage grammar and priority list. Do not add `--quick`.
6. **Configuration Loading section** (line 136) — document the new `tool_selector.quick_path.*` keys, defaults, and precedence.

## Fixtures

Location: `tests/start/quick_path/` — one markdown fixture per acceptance criterion, each containing: input description, pre-conditions (tree state, target files), expected gate outcomes, expected action (quick-path commit OR fallthrough OR escape-hatch rollback), and expected surfaced message if any.

Fixture set (14 total, mirroring the issue's test-fixtures acceptance criteria):

1. `trivial-md-typo.md` — targeted typo in Markdown prose → quick path recommended and executes
2. `untargeted-trivial.md` — "fix typos" (no target) → Gate 1 fails, user hint surfaces
3. `rename-many-sites.md` — rename touching 8+ files → Gate 2 fails, silent fallthrough
4. `no-quick-override.md` — `--no-quick` on a trivial change → forces normal lifecycle
5. `exceeds-confirmed-set.md` — edit writes outside confirmed paths → escape hatch fires, tree restored
6. `dirty-tree.md` — uncommitted work present → Gate 0 fails, user hint surfaces
7. `exceeds-max-changed-lines.md` — edit balloons beyond 10 lines → escape hatch fires
8. `identifier-edit-ts.md` — attempt to modify an identifier in a `.ts` file → Gate 4 fails
9. `string-literal-nonlog.md` — edit inside a plain (non-log) string literal → Gate 4 passes
10. `logger-info-string.md` — edit to a string that is a `logger.info(...)` argument → Gate 4 fails (log-call exclusion)
11. `export-overlap.md` — edit overlapping `export function foo()` → Gate 3 fails
12. `code-fence-in-md.md` — edit inside a `` ``` `` fenced block in Markdown → Gate 4 fails
13. `multi-file-prose.md` — two-file fix (README + CHANGELOG) → Gate 2 passes under default `max_files: 3`
14. `auto-format-expansion.md` — Stop hook auto-format expands diff beyond `max_changed_lines` → post-hook escape hatch fires, tree restored

## Housekeeping

- **`references/step-lists.md`.** The file exists at `skills/start/references/step-lists.md` (the brainstorming note that it does not exist was incorrect; verified via Glob). It **must** be updated to show the quick path as an alternate route that skips brainstorm → design → verify → plan → acceptance criteria → handoff. This is a required documentation update, not a conditional no-op.
- **CHANGELOG.** This repo uses a single root `CHANGELOG.md` with an `[Unreleased]` section, not a `.changelogs/next/` fragment directory (verified: no `.changelogs/` dir exists). Add a bullet under `## [Unreleased]` → `### Added` describing the 3-way triage, the quick path's gate set, the `--no-quick` flag, and the new config keys. This supersedes the issue's `.changelogs/next/` wording.
- **`references/project-context-schema.md`** — authoritative schema reference for `.feature-flow.yml`. The `### tool_selector` section (lines ~165–188) currently documents three sub-fields (`enabled`, `confidence_threshold`, `auto_launch_gsd`). Add a `quick_path` sub-section listing all four keys (`enabled`, `max_confirmation_tool_calls`, `max_files`, `max_changed_lines`) with defaults. This is the file consumed by `settings` and `design-verification` skills — not updating it leaves the schema out of sync with the skill.

## Interaction with #235 (codex consultation — parallel)

The codex-consultation feature (issue #235) adds four review modes (`review-design`, `review-plan`, `review-code`, `stuck`) and a PostToolUse signal-collector that watches for thrash/retry patterns. Quick path interacts with it in two ways, both by construction:

1. **Proactive review modes are inert on the quick path by construction.** Quick path produces no design doc, no plan, no acceptance-criteria doc, and no Harden-PR artifact. `review-design` / `review-plan` / `review-code` therefore have nothing to run against and never fire. No explicit guard needed.
2. **Stuck-mode signal collector needs a quick-path breadcrumb early-return.** Signal-collector hooks watch file-edit churn and test-failure repetition to trigger `stuck:` consultations. On the quick path, a single bounded edit + Stop-hook retry is not thrash — it's the normal happy path. The collector must detect a quick-path invocation (via a breadcrumb in the skill's working context or in `session-state.json` if #235 lands first) and return early. **This guard is added by whichever of #234 / #235 lands second, NOT in this PR.** If #234 lands first, the collector in #235 adds the breadcrumb check when it's authored. If #235 lands first, this PR (#234) adds a one-line breadcrumb write before step 5.3 (the edit). The PRs can be implemented in parallel; the integration point is small and well-defined.

## Open Questions (non-blocking — document decisions carried to implementation plan)

These are named in the design doc so the implementation plan answers them rather than discovers them:

1. **Whitespace tolerance for Gate 4 `old_string` ranges.** Default: **fail-closed.** If the proposed `old_string` region, extended by trailing/leading whitespace to the nearest non-whitespace char, would cross out of the confirmed lexical region, Gate 4 fails. Implementation may revisit after fixture-driven experience.
2. **Multiple `old_string` ranges in one Edit call.** All proposed ranges must pass Gate 4 **individually**. A single failing range fails the gate.
3. ~~**Test impact ambiguity.**~~ This open question is moot — the "test impact bounded" gate was removed (PR #237) because its fail branch was unreachable under strict-order evaluation (Gate 4 always short-circuits first when the region is a code identifier).
4. **`--no-quick` × `quick_path.enabled: false`.** Documented no-op: CLI flag confirms config; no error, no fallthrough change. (Captured above in Configuration, surfaced here for completeness.)

## Scope

**In scope:**

- 3-way triage (quick / feature-flow / GSD) in `skills/start/SKILL.md`'s renamed "Triage" section.
- Five ordered gates (0–4) with strict short-circuit evaluation.
- Tool-call budget of ≤5 Bash/Grep/Read/Glob calls (in-process AST free).
- 8-step quick-path execution flow with Gate-0-safe multi-file atomic rollback.
- `tool_selector.quick_path.{enabled, max_confirmation_tool_calls, max_files, max_changed_lines}` config.
- `--no-quick` CLI flag.
- `references/step-lists.md` update.
- `references/project-context-schema.md` `tool_selector.quick_path` sub-section.
- `CHANGELOG.md` `[Unreleased]` entry.
- 14 test fixtures under `tests/start/quick_path/`.
- Language coverage: Markdown, TypeScript, JavaScript, Python (conservative fail for unsupported).

**Explicitly out of scope:**

- Changes to the existing GSD scoring table, GSD handoff mechanism, or heuristic scoring signals (quick path runs *before* them and is a pure short-circuit).
- Changes to the existing flag grammar beyond adding `--no-quick` (no `--quick`, no re-ordering of existing precedence).
- A `--quick` flag of any form.
- A state file for the scope set (scope set lives inline in working context only).
- A Claude co-author trailer on quick-path commits.
- A `docs/plans/*.md` artifact produced by the quick path.
- Extending gates to languages beyond Markdown/TS/JS/Python in v1 (unsupported languages conservatively fail Gate 4).
- The stuck-mode breadcrumb early-return guard (added by whichever of #234/#235 lands second — see "Interaction with #235").
- Any brainstorm-style clarification inside quick path. Gate 1 deliberately punts untargeted asks back to the full lifecycle where `superpowers:brainstorming` can clarify.

## Decision Log (from brainstorming, recorded for traceability)

- **D1–D3 — Extend Tool Selection into 3-way triage, not a new pre-triage step.** Tool Selection already performs triage; a second step would be redundant naming and duplicate logic.
- **D4–D6 — Mechanical lexical-region rule with AST log-call exclusion.** Change-class taxonomies have load-bearing edge cases per entry; a lexical rule is AST-checkable and closes the gap.
- **D8 — Gate 0 (clean tree) as precondition.** Makes `git checkout --` rollback provably safe.
- **D9 — Hard-assertion escape hatch.** Soft escalation is theater once execution starts; a hard stop is the only reliable signal.
- **D11 — Post-hook `git diff --numstat` for the line-budget check.** Catches Stop-hook auto-format expansion.
- **D17 — No state file for the scope set.** Scope is needed only between confirmation and commit within one invocation; persistence creates cleanup/staleness problems with no benefit.
- **D19 — Model-authored commit message, imperative mood, post-edit line count, no Claude trailer.** Style observed from `git log --oneline -10`. No co-author trailer because quick-path commits are deterministic, top-to-bottom model edits — not human-model collaborations. Adding the trailer would misrepresent authorship.
- **Autonomous — AST mechanism.** Skills are prose markdown executed by Claude; no runtime library to bind. Claude performs gates mentally, the same primitive used elsewhere in feature-flow. Tree-sitter preferred if ever externalized.
- **Autonomous — Language coverage.** Markdown, TS/JS, Python in v1; unsupported → conservative fail.
- **Autonomous — Fixture location.** `tests/start/quick_path/`, one markdown fixture per acceptance criterion.
- **Autonomous — Multi-file atomicity.** Escape hatch restores all confirmed files, not only the edited one.
- **Autonomous — CHANGELOG surface.** Root `CHANGELOG.md` `[Unreleased]` section, not `.changelogs/next/` (the latter does not exist in this repo).
- **Autonomous — `references/step-lists.md` exists at `skills/start/references/step-lists.md`.** The earlier note claiming it does not exist was wrong; update is required, not conditional.
