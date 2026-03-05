# Efficient Code Review Pipeline — Design Document

**Date:** 2026-03-05
**Status:** Draft

## Overview

Redesign the code review pipeline in `skills/start/SKILL.md` to be faster, more token-efficient, and produce better production-ready output. Three key changes: (1) enhance pre-flight checks with stack-aware reviewer availability and marketplace discovery, (2) restructure the pipeline so agents report findings without making code changes, with pr-review-toolkit running as a gated pre-pass, and (3) add conflict detection between proposed fixes before implementing them in a single coordinated pass.

## User Flow

### Step 1 — Pre-Flight Reviewer Audit

During the existing pre-flight check (after stack detection from `.feature-flow.yml`), the orchestrator:

1. Runs `claude plugins search "code review"` to discover available review plugins in the marketplace
2. Cross-references installed plugins against a static **Reviewer Stack Affinity Table** in SKILL.md
3. Reports to the user which reviewers are relevant and installed, which are relevant but missing (with install command), and which are installed but irrelevant for the current stack

Example output:
```
Reviewer availability (stack: [python, supabase]):
  Relevant + installed:
    - superpowers:code-reviewer (universal)
    - pr-review-toolkit (universal)
  Relevant + missing:
    - backend-api-security (python, supabase) — install: claude plugins add backend-api-security
  Irrelevant (skipped for this stack):
    - type-design-analyzer (typescript only)
  Marketplace suggestions:
    - python-linter-pro (found via search, not installed)
```

### Step 2 — Code Review Pipeline Execution

When the code review step runs, the pipeline follows a revised phase structure:

1. **Phase 0:** Deterministic pre-filter (unchanged — runs linters/typecheckers)
2. **Phase 1a:** pr-review-toolkit pre-pass (auto-fix allowed, isolated subagent) → commit fixes
3. **Phase 1b:** Report-only agents dispatched in parallel on the updated code (only stack-relevant agents)
4. **Phase 2:** Conflict detection across all reported findings
5. **Phase 3:** Single-pass fix implementation for all non-conflicting findings
6. **Phase 4:** Targeted re-verification
7. **Phase 5:** Report

## Pipeline Architecture

### Reviewer Stack Affinity Table

A new static table in SKILL.md maps each reviewer to the stacks it is relevant for. The orchestrator reads the `stack` field from `.feature-flow.yml` and dispatches only reviewers whose affinity includes at least one of the project's stack entries.

| Reviewer | Plugin | Stack Affinity | Tier |
|----------|--------|---------------|------|
| `superpowers:code-reviewer` | superpowers | `*` (universal — all stacks) | 1 |
| `silent-failure-hunter` | pr-review-toolkit (internal) | `*` (universal) | 1 |
| `code-simplifier` | pr-review-toolkit (internal) | `*` (universal) | 2 |
| `feature-dev:code-reviewer` | feature-dev | `*` (universal) | 2 |
| `pr-test-analyzer` | pr-review-toolkit | `*` (universal) | 3 |
| `type-design-analyzer` | pr-review-toolkit | `typescript`, `node-js` | 3 |
| `backend-api-security:backend-security-coder` | backend-api-security | `node-js`, `python`, `go`, `ruby`, `java`, `supabase` | 3 |

**Filtering logic:** At dispatch time, for each reviewer in the tier table:
1. Skip reviewers marked `(internal)` — they run inside their parent agent, not dispatched separately
2. Check if the reviewer's plugin is installed
3. Check if the reviewer's stack affinity includes `*` OR intersects with the project's `stack` list
4. If both conditions met → dispatch. Otherwise → skip with log.

**Note:** Internal agents (`silent-failure-hunter`, `code-simplifier`) are listed for pre-flight audit visibility but are not dispatched independently — they execute inside the pr-review-toolkit subagent during Phase 1a.

### Marketplace Discovery

During pre-flight, after loading `.feature-flow.yml`:

1. Run `claude plugins search "code review"` (single CLI call, ~2s)
2. Parse results for plugins not already installed
3. Cross-reference against the stack affinity table — if a discovered plugin has known stack affinity that matches the project, suggest it
4. For unknown plugins (not in the affinity table), present them as "discovered — may be relevant"
5. Cache nothing — marketplace search runs fresh each lifecycle start (simple, no stale cache risk)

**Failure handling:** If `claude plugins search` fails (network error, CLI not available), log a warning and continue: "Marketplace search failed — skipping plugin discovery. Continuing with installed plugins."

### Phase 1a: pr-review-toolkit Pre-Pass (Gated)

The pr-review-toolkit runs as an isolated subagent **before** report-only agents. This preserves its internal auto-fix behavior (silent-failure-hunter, code-simplifier) while ensuring report-only agents see a consistent codebase.

**Process:**
1. Dispatch pr-review-toolkit subagent (subagent prompt and output format unchanged from current; execution order changed to sequential pre-pass — uses `review-pr` skill internally)
2. Wait for completion
3. Collect its structured summary (Auto-Fixed, Critical, Important, Minor sections)
4. If auto-fixes were made: commit them as a single commit (`fix: pr-review-toolkit auto-fixes`)
5. The Critical/Important/Minor findings from the summary are passed to Phase 2 for consolidation with report-only agent findings

**Why gated (sequential, not parallel):** The pr-review-toolkit modifies code directly. If it ran in parallel with report-only agents, those agents would review stale code that the toolkit is simultaneously changing. Running it first ensures all subsequent agents review the same committed state.

### Phase 1b: Report-Only Agents (Parallel)

After Phase 1a commits, dispatch all tier-eligible, stack-relevant, report-only agents in a single parallel message. Each agent receives:

- The current branch diff (`git diff [base-branch]...HEAD` — includes pr-review-toolkit fixes)
- Its specific checklist from the agent table
- Pre-filter exclusion context from Phase 0
- Anti-patterns and reference examples from Study Existing Patterns
- **Explicit instruction: "Return findings only. Do NOT modify any files."**

All agents use Fix Mode = "Report" and return structured findings:
```
- file: [exact file path]
  line: [line number]
  rule: [specific rule name from checklist]
  severity: critical | important | minor
  description: [what's wrong and why]
  fix: |
    [concrete code change — not "consider improving"]
```

### Phase 2: Conflict Detection

After all report-only agents complete, the orchestrator consolidates their findings and detects conflicts before any fixes are applied.

**Step 1 — Cross-Phase Finding Merge:**
Collect and merge findings from two sources:
- **Phase 1a** pr-review-toolkit summary (Critical/Important/Minor sections only — Auto-Fixed already committed). These are findings the toolkit identified but did not auto-fix.
- **Phase 1b** report-only agent results. These agents reviewed the code AFTER Phase 1a auto-fixes were committed, so their findings reflect the current state.

Both sources use the same structured format (file, line, rule, severity, description, fix). Merge into a single list before deduplication.

**Step 2 — Reject non-compliant findings:**
Same rules as current Phase 3 step 0:
- Discard findings missing required fields
- Discard findings with vague fixes (commentary without concrete changes)

**Step 3 — Deduplicate:**
Same rules as current: deduplicate by file path + line number, keep higher severity, prefer more specific agent.

**Step 4 — Detect conflicts:**
Group all remaining findings by file path. Within each file, for each pair of findings:
1. Calculate line range overlap: finding A covers lines `[A.line - 5, A.line + 5]`, finding B covers `[B.line - 5, B.line + 5]`
2. If ranges overlap → conflict detected
3. Resolution: keep the higher-severity finding. If same severity, use agent specificity order: `backend-security-coder` > pr-review-toolkit > `feature-dev:code-reviewer` > `superpowers:code-reviewer`
4. Log skipped findings: "Conflict at [file:line]: [Agent A] finding (severity) kept, [Agent B] finding (severity) skipped — overlapping line range"

**Output:** A conflict-free, ordered list of findings to apply (Critical first, then Important).

### Phase 3: Single-Pass Fix Implementation

Apply all conflict-free findings in a single coordinated pass:

1. Sort findings by file path, then by line number (descending — apply bottom-up to avoid line number shifts)
2. For each finding, apply the concrete `fix:` code change
3. After all fixes applied, commit as a single commit: `fix: apply code review fixes`

**Why bottom-up ordering:** When multiple fixes target the same file, applying from the bottom up ensures earlier line numbers remain valid. A fix at line 50 doesn't shift the line numbers for a fix at line 30.

### Phase 4: Targeted Re-Verification

Same logic as current Phase 4 but simplified since conflicts are pre-resolved:

1. Determine targeted checks based on which agents had findings (same decision table as current)
2. Run targeted checks in parallel
3. If all pass → pipeline clean
4. If any fail → one additional fix pass (maximum 2 total iterations)

### Phase 5: Report

Updated report format to reflect the new architecture:

```
## Code Review Pipeline Results

**Agents dispatched:** N (Tier T — [scope])
**Stack filter:** [stack entries used for filtering]
**Model override:** [None | user-requested: <model>]
**Iterations:** M/2

### Fixed (pr-review-toolkit pre-pass)
- [agent] [file:line] [what was auto-fixed]

### Fixed (report-only → single pass)
- [severity] [file:line] [what was fixed]

### Conflicts Resolved
- [file:line] [kept agent] over [skipped agent] — [reason]

### Remaining (Minor — not blocking)
- [file:line] [description]

### Remaining (unfixed after 2 iterations)
- [file:line] [description + context for manual resolution]

**Status:** Clean / N issues remaining
```

## Patterns & Constraints

### Error Handling
- **Marketplace search failure:** Log warning, continue with installed plugins — non-blocking
- **pr-review-toolkit subagent failure:** Skip Phase 1a, dispatch report-only agents without gating — degrade gracefully
- **Report-only agent failure:** Skip failed agent, continue with remaining — same as current
- **Conflict detection edge case (all findings conflict):** Apply the single highest-severity finding per file, log all others as skipped

### Types
- No new data types — all changes are to markdown instruction files
- The Reviewer Stack Affinity Table is a markdown table, not a data structure

### Performance
- **Token savings:** Report-only agents don't spend tokens on file edits, just analysis. Single-pass fixes avoid duplicate reads. Estimated ~30-40% token reduction on the code review step.
- **Latency:** Phase 1a runs sequentially (pr-review-toolkit pre-pass), but Phase 1b runs all remaining agents in parallel. Net latency should be similar or better since we eliminate Phase 4 re-dispatch loops in most cases.
- **Marketplace search:** ~2s overhead at lifecycle start. Amortized across the full lifecycle, negligible.

## Scope

### Included
- Reviewer Stack Affinity Table (new static table in SKILL.md)
- Marketplace discovery via `claude plugins search` during pre-flight
- Pre-flight reviewer availability report (stack-aware)
- Phase 1a/1b split (gated pr-review-toolkit pre-pass + parallel report-only agents)
- Conflict detection algorithm (file + line range overlap, ±5 lines)
- Single-pass fix implementation with bottom-up ordering
- Updated Phase 5 report format
- Stack-based filtering at dispatch time

### Excluded
- Changes to pr-review-toolkit's internal behavior (external plugin — not controlled)
- Changes to agent checklists or severity rules (orthogonal concern)
- Configurable reviewer-to-stack mapping in `.feature-flow.yml` (decided against in brainstorming — static table is sufficient)
- Semantic conflict analysis (decided against — file+line overlap covers ~90% of cases)
- Changes to Phase 0 deterministic pre-filter (unchanged)
- Changes to the self-review step (unchanged)

### Implementation Notes
- **Phase reference updates required:** Lines 808, 1631-1633 in SKILL.md reference current phase numbering ("Phase 1 subagent output", "Phase 2", "Phase 4"). Implementation must update ALL cross-references to match new scheme (0, 1a, 1b, 2, 3, 4, 5).
- **`claude plugins search` is non-blocking:** Marketplace discovery failure must never halt the lifecycle. The failure handling section already specifies this — implementation must preserve graceful degradation.
