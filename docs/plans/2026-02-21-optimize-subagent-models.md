# Optimize Subagent Model Selection — Design Document

**Date:** 2026-02-21
**Status:** Draft
**Issue:** #35

## Overview

Follow-up to issue #21 (Intelligent Model Routing). Session analysis revealed two remaining sources of token waste: (1) implementation subagents dispatched by `subagent-driven-development` inherit Opus from the parent orchestrator when most tasks are mechanical code edits suited to Sonnet, and (2) two code review agents (`feature-dev:code-reviewer`, `superpowers:code-reviewer`) were kept on Opus in the initial routing but evidence shows they perform pattern-matching tasks that Sonnet handles well.

## Scope

**Included:**
- Add model guidance to Subagent-Driven Development YOLO Override in `start-feature/SKILL.md`
- Downgrade `feature-dev:code-reviewer` and `superpowers:code-reviewer` from opus to sonnet in the code review pipeline table
- Add model guidance for spec review and consumer verification agents dispatched by subagent-driven-development

**Excluded:**
- No changes to `backend-api-security:backend-security-coder` (stays on opus — security analysis benefits from deeper reasoning)
- No changes to Explore agent dispatches (already on haiku from issue #21)
- No changes to other skill files (design-document, design-verification, spike)
- No new configuration mechanism — this is instruction text only

## What Does NOT Change

- The Study Existing Patterns step already dispatches Explore agents with `model: haiku` (line 546). No change needed.
- The user model override mechanism (line 666) still takes precedence over per-agent defaults.
- `backend-api-security:backend-security-coder` stays on opus — the one code review agent where deeper reasoning genuinely helps.

## Change 1: Implementation Subagent Model Guidance

**File:** `skills/start-feature/SKILL.md`, Subagent-Driven Development YOLO Override section (~line 471-479)

Add model selection heuristic for implementation subagents. The `subagent-driven-development` skill dispatches implementer agents for each task in the implementation plan. Currently these inherit the parent's model (Opus). Most implementation tasks are mechanical code edits that Sonnet handles well.

**Heuristic:** Default to `model: sonnet`. Escalate to `model: opus` only when the task description contains keywords indicating architectural complexity: "design", "architect", "migration", "schema change", "new data model".

**Rationale:** Session analysis showed 4 implementation subagents ran on Opus for tasks like "extract a utility function", "rename useState to useRef", "extract 2 components" — all mechanical edits.

## Change 2: Spec Review and Verification Agent Model Guidance

**File:** `skills/start-feature/SKILL.md`, same section (~line 471-479)

Add model guidance for two other agent types dispatched by subagent-driven-development:
- **Spec review agents** (general-purpose) — compare implementation against acceptance criteria. Checklist work → `model: sonnet`
- **Consumer verification agents** (general-purpose) — verify existing code is unchanged. Read-only comparison → `model: sonnet`
- **Explore agents** — file exploration dispatched during implementation. Read-only → `model: haiku`

## Change 3: Code Review Agent Model Downgrades

**File:** `skills/start-feature/SKILL.md`, Code Review Pipeline table (~line 672-679)

Revise two model assignments from the initial routing (issue #21):

| Agent | Before | After | Rationale |
|-------|--------|-------|-----------|
| `feature-dev:code-reviewer` | opus | **sonnet** | Bug and convention detection is pattern-matching against known rules |
| `superpowers:code-reviewer` | opus | **sonnet** | General quality review and plan adherence is checklist comparison |

`backend-api-security:backend-security-coder` remains on opus — security analysis requires reasoning about attack vectors and edge cases.

## Expected Impact

| Metric | Before (current) | After |
|--------|------------------|-------|
| Implementation subagents on Opus | 100% (inherited) | ~20% (only architectural tasks) |
| Code review agents on Opus | 3/7 (43%) | 1/7 (14%) |
| Spec review agents on Opus | 100% (inherited) | 0% (sonnet) |
| Explore agents on Opus | 0% (already haiku) | 0% (unchanged) |

Estimated additional cost reduction beyond issue #21: **~20-30%** per lifecycle run.
