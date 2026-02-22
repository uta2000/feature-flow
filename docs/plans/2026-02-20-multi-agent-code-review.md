# Multi-Agent Code Review Pipeline — Design Document

**Date:** 2026-02-20
**Status:** Draft
**Issue:** #3

## Overview

The spec-driven lifecycle's Code Review step currently dispatches a single `superpowers:requesting-code-review` agent, which reports issues but doesn't fix them. This enhancement replaces it with an inline multi-agent pipeline that dispatches 7 specialized review agents, auto-fixes findings by severity, and re-verifies until clean — shipping a clean feature, not a TODO list.

**Scope coverage:** The pipeline replaces the Code Review step in ALL scope templates that include it: Small Enhancement (step 11), Feature (step 12), and Major Feature (step 13). Quick fix does not have a Code Review step.

## User Flow

### Step 1 — Agents run in parallel
After self-review completes, the pipeline dispatches up to 7 review agents simultaneously using the Task tool. The developer sees: "Running 7 code review agents in parallel..." (or fewer if some plugins are missing). Each agent receives the full branch diff (`git diff main...HEAD`) showing all changes since the feature branch diverged from base.

### Step 2 — Auto-fix agents apply changes
`code-simplifier` and `silent-failure-hunter` write fixes directly to files. The developer sees a summary of what was changed.

### Step 3 — Claude fixes Critical/Important findings
The remaining 5 agents report findings. Claude consolidates them by file+line, deduplicates, and auto-fixes Critical and Important issues. Minor issues are logged but not blocking.

### Step 4 — Re-verify
After all fixes, the pipeline re-runs the project's test suite (if configured) and `verify-acceptance-criteria`. If either fails, the loop repeats (up to 3 iterations total). The developer sees: "Iteration 1/3: 2 criteria failing, fixing..."

### Step 5 — Report
The pipeline outputs a summary: what was fixed, what remains, and whether the feature is clean. If issues remain after 3 iterations, they're reported to the developer with context for manual resolution.

## Pipeline Architecture

The code review step uses a parallel-dispatch, sequential-fix architecture because review agents are read-only (except the two auto-fixers) and can safely run concurrently, while fixes must be applied sequentially to avoid conflicts.

**Current flow:**
```
Self-review → Code review (1 agent, report only) → Final verification
```

**New flow:**
```
Self-review → Code review pipeline → Final verification
                    │
                    ├── 1. Dispatch 7 agents in parallel
                    ├── 2. Auto-fix agents apply changes (code-simplifier, silent-failure-hunter)
                    ├── 3. Consolidate findings from 5 reporting agents
                    ├── 4. Claude fixes Critical + Important findings (sequential by severity)
                    ├── 5. Re-run tests + verify-acceptance-criteria
                    └── 6. Loop (max 3 iterations) or report remaining
```

### Agent Roster

| Agent | Plugin | Role | Fix Mode |
|-------|--------|------|----------|
| `pr-review-toolkit:code-simplifier` | pr-review-toolkit | DRY, clarity, maintainability | **Direct** — writes fixes to files |
| `pr-review-toolkit:silent-failure-hunter` | pr-review-toolkit | Silent failures, empty catches, bad fallbacks | **Direct** — auto-fixes common patterns |
| `feature-dev:code-reviewer` | feature-dev | Bugs, logic errors, security, conventions | **Report** → Claude fixes |
| `superpowers:code-reviewer` | superpowers | General quality, plan adherence | **Report** → Claude fixes |
| `pr-review-toolkit:pr-test-analyzer` | pr-review-toolkit | Test coverage quality, missing tests | **Report** → Claude fixes |
| `backend-api-security:backend-security-coder` | backend-api-security | Input validation, auth, OWASP top 10 | **Report** → Claude fixes |
| `pr-review-toolkit:type-design-analyzer` | pr-review-toolkit | Type encapsulation, invariants, type safety | **Report** → Claude fixes |

### Auto-Fix Rules

**Direct-fix agents (run first):**
- `code-simplifier`: Applies all structural improvements directly (DRY extraction, clarity rewrites). It already has write access by design.
- `silent-failure-hunter`: Auto-fixes `catch {}` → `catch (e) { console.error(...) }` and similar known patterns. Flags anything more complex for Claude to fix.

**Report-then-fix agents (run after direct fixers):**
- Claude reads the consolidated report, deduplicates by file+line (higher severity wins conflicts), and fixes in order: Critical → Important. Minor issues are logged as informational.
- `pr-test-analyzer` findings: Claude adds missing test cases, strengthens weak assertions, adds edge case coverage.
- `backend-security-coder` findings: Claude fixes security issues (injection, validation, auth). Critical security issues always fixed.
- `type-design-analyzer` findings: Claude improves type definitions based on encapsulation and invariant feedback.
- `feature-dev:code-reviewer` + `superpowers:code-reviewer` findings: Claude fixes bugs, logic errors, and convention violations.

### Conflict Resolution

When two agents flag the same file+line with different recommendations:
1. Deduplicate by file path + line number
2. Keep the higher-severity finding
3. If same severity, prefer the more specific agent (security > type-design > feature-dev > superpowers > simplifier)

### Fix-Verify Loop

**Test command detection:** Check `package.json` for a `test` script. If found, run `npm test` (or `yarn test` / `pnpm test` based on lockfile). If not found, skip test re-run and log: "No test script configured — skipping test verification."

```
for iteration in 1..3:
    apply_fixes(consolidated_findings)
    test_result = run_tests()        # detected test command, skip if not configured
    criteria_result = verify_acceptance_criteria()
    if test_result.pass AND criteria_result.pass:
        break  # clean — exit loop
    else:
        collect new failures as findings for next iteration

if iteration == 3 AND still failing:
    report remaining issues to developer
    proceed to next lifecycle step (developer decides whether to fix manually)
```

### Graceful Degradation

Not all 7 agents require installed plugins. The pipeline checks availability and skips missing ones:

| Plugin | Agents Provided | Required? |
|--------|----------------|-----------|
| `superpowers` | `superpowers:code-reviewer` | Yes (already required by lifecycle) |
| `pr-review-toolkit` | `code-simplifier`, `silent-failure-hunter`, `pr-test-analyzer`, `type-design-analyzer` | No — soft warning |
| `feature-dev` | `feature-dev:code-reviewer` | No — soft warning |
| `backend-api-security` | `backend-api-security:backend-security-coder` | No — soft warning |

**Minimum viable pipeline:** Just `superpowers:code-reviewer` (always available). All other agents are additive.

**Agent failure handling:** Each agent is dispatched via the Task tool with default timeout. If an agent fails, crashes, or doesn't return, skip it and continue with available results. Do not stall the pipeline for a single agent failure. Log: "Agent [name] failed — skipping. Continuing with N remaining agents."

## Changes to Existing Files

### `skills/start-feature/SKILL.md`

1. **Pre-flight check:** Add soft warnings for `pr-review-toolkit`, `feature-dev`, and `backend-api-security` plugins. Non-blocking — lifecycle continues with available agents.

2. **Skill mapping table:** Update the Code Review row from:
   ```
   | Code review | `superpowers:requesting-code-review` | Review feedback addressed |
   ```
   to:
   ```
   | Code review | No skill — inline step (see below) | All Critical/Important findings fixed, tests pass |
   ```

3. **New inline section:** Add "Code Review Pipeline Step" after the Self-Review section, containing the full pipeline logic (agent dispatch, auto-fix rules, consolidation, loop, graceful degradation).

### `README.md`

1. **Requirements:** Add recommended plugins section listing `pr-review-toolkit`, `feature-dev`, and `backend-api-security` as optional but recommended for full code review coverage.

2. **Lifecycle table:** Update the Code Review row from `superpowers | requesting-code-review` to `spec-driven (inline) | multi-agent review pipeline` — ownership moves from superpowers to spec-driven for this step.

3. **Installation:** Add `claude plugins add` commands for recommended plugins in the installation section.

## Scope

**Included:**
- Inline code review pipeline in `skills/start-feature/SKILL.md`
- Pre-flight soft warnings for optional review plugins
- Agent dispatch, auto-fix, consolidation, and fix-verify loop logic
- Graceful degradation when plugins are missing
- README updates for recommended plugins and lifecycle table
- Conflict resolution rules (severity-based deduplication)

**Excluded:**
- Modifying any of the review agent plugins themselves (pr-review-toolkit, feature-dev, backend-api-security, superpowers)
- Adding new skills or agents to this plugin (pipeline is inline in SKILL.md)
- Persisting review findings across sessions (findings are ephemeral within the lifecycle run)
- User-configurable severity thresholds or agent selection (all available agents always run)
- Retry logic for individual agent failures (if an agent crashes, skip it and continue)
