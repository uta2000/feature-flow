# Scale Code Review Pipeline to Feature Scope — Design Document

**Date:** 2026-02-22
**Status:** Draft
**Issue:** #58

## Overview

The code review pipeline in `skills/start/SKILL.md` dispatches all available review agents (up to 7) regardless of feature scope. For small enhancements that follow existing patterns, this wastes 2.5–5M tokens and ~4.5 minutes on reviews that add marginal value. This change introduces a 3-tier agent dispatch system that scales the number of review agents to the scope classification already tracked by the lifecycle.

## Architecture

The scope classification (Quick fix, Small enhancement, Feature, Major feature) is determined in Step 1 of the lifecycle and propagated through all subsequent steps. The code review pipeline in Phase 1 will use this scope to select a subset of agents from the existing dispatch table.

### Tier Mapping

| Scope | Tier | Agent Count | Agents |
|-------|------|-------------|--------|
| Quick fix | N/A | 0 | No code review step in lifecycle |
| Small enhancement | 1 | 2 | `superpowers:code-reviewer`, `pr-review-toolkit:silent-failure-hunter` |
| Feature | 2 | 4 | Tier 1 + `pr-review-toolkit:code-simplifier`, `feature-dev:code-reviewer` |
| Major feature | 3 | 7 | Tier 2 + `pr-review-toolkit:pr-test-analyzer`, `backend-api-security:backend-security-coder`, `pr-review-toolkit:type-design-analyzer` |

### Agent Selection Rationale

**Tier 1 (Small enhancement):** General quality review (`superpowers:code-reviewer`) catches plan deviation and convention violations. Silent failure hunting (`silent-failure-hunter`) catches dangerous error suppression. These two cover the highest-value checks for low-complexity changes.

**Tier 2 (Feature):** Adds DRY/clarity analysis (`code-simplifier`) because features introduce enough new code to benefit from structural review. Adds deeper bug/logic/convention analysis (`feature-dev:code-reviewer`) because features modify more files with more interaction points.

**Tier 3 (Major feature):** Full pipeline. Test coverage analysis (`pr-test-analyzer`) matters because major features warrant comprehensive test verification. Security review (`backend-security-coder`) matters because major features may introduce new attack surfaces. Type design analysis (`type-design-analyzer`) matters because major features often introduce new type hierarchies.

### Interaction with Existing Systems

- **Plugin availability check:** Still runs before dispatch. If a tier-selected agent's plugin is unavailable, it's skipped as before. The tier defines the *maximum* set; availability gates the *actual* set.
- **Phase 2–5:** No changes. Direct-fix review, consolidation, re-verify loop, and reporting work on whatever agents were dispatched. If fewer agents run, these phases naturally handle fewer results.
- **Model override:** Still applies. If the user requested a specific model, it overrides per-agent defaults within the selected tier.
- **YOLO/Express mode:** No changes needed. The code review step is inline — mode flags are already in conversation context.
- **Report output:** The "Agents dispatched" line in Phase 5 already reports `N/7` — this naturally reflects the tier-filtered count.

## Changes to `skills/start/SKILL.md`

### 1. Add scope-based tier selection before Phase 1

Insert a new section between the "Model override" and "Large file handling" paragraphs (before the Phase 1 heading) that defines the tier mapping table and instructs the orchestrator to filter the agent dispatch table based on the current scope.

### 2. Modify Phase 1 dispatch instructions

Update the Phase 1 text to reference the tier-filtered agent list rather than "all available review agents." The dispatch table itself stays as-is (it serves as the master reference), but a new column or annotation marks which tier each agent belongs to.

### 3. Update Phase 3 consolidation

Adjust the "5 reporting agents" reference to be dynamic: "the reporting agents dispatched in Phase 1" instead of a hardcoded count. The consolidation logic already handles variable agent counts (agents that fail are skipped), so the code change is minimal — just the prose reference.

## Scope

**Included:**
- Tier mapping table and selection logic in `skills/start/SKILL.md`
- Tier column added to the existing agent dispatch table
- Dynamic agent count references in Phase 3 and Phase 5

**Excluded:**
- No changes to hooks, project config, or `.feature-flow.yml`
- No changes to scope classification logic (Step 1)
- No changes to YOLO/Express mode overrides
- No configurable tier overrides — tiers are hardcoded
- No changes to self-review step or final verification step
