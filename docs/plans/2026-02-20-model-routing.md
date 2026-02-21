# Intelligent Model Routing — Design Document

**Date:** 2026-02-20
**Status:** Draft
**Issue:** #21

## Overview

Add model routing to the feature-flow plugin so that reasoning-heavy subagents (code review, security analysis) run on Opus 4.6 while structured/pattern-based subagents (simplification, test analysis, codebase exploration) run on Sonnet 4.6 or Haiku. This reduces cost and latency without sacrificing quality where it matters.

## Scope

**Included:**
- Add `model` parameter to code review agent dispatches in `start-feature/SKILL.md`
- Add `model` parameter to Explore agent dispatches in `start-feature/SKILL.md` (pattern study)
- Add `model` parameter to Explore agent dispatches in `design-document/SKILL.md` (context gathering)
- Add `model` parameter to Explore agent dispatches in `design-verification/SKILL.md` (exploration + verification batches)
- Add `model` parameter to experiment agent dispatches in `spike/SKILL.md`
- Add user override mechanism (inline instruction in `start-feature/SKILL.md`)

**Excluded:**
- No lifecycle phase model guide (skills can't be routed — they run in the main conversation's model)
- No changes to `verify-acceptance-criteria/SKILL.md` (already routes through `task-verifier` agent which has `model: sonnet`)
- No changes to hooks, references, or plugin metadata
- No tier documentation for external plugins we don't control

## Routing Surfaces

There are exactly two mechanisms for model routing in a Claude Code plugin:

| Surface | How it works | Where to change |
|---------|-------------|-----------------|
| **Agent frontmatter** | `model:` field in agent YAML frontmatter. Automatically used when the agent is dispatched via Task tool. | `agents/task-verifier.md` (already has `model: sonnet`) |
| **Skill dispatch instructions** | Skills instruct Claude to pass `model` parameter when calling the Task tool. | `start-feature/SKILL.md`, `design-document/SKILL.md`, `design-verification/SKILL.md`, `spike/SKILL.md` |

Skills themselves **cannot** be routed to a different model — they run in the main conversation's model. Routing happens only when skills dispatch subagents via the Task tool.

## Change 1: Code Review Pipeline Model Assignments

**File:** `skills/start-feature/SKILL.md`, Phase 1 of the Code Review Pipeline Step (~line 487)

The existing agent dispatch table gains a `Model` column:

| Agent | Model | Rationale |
|-------|-------|-----------|
| `superpowers:code-reviewer` | **opus** | Deep analysis — bugs, security, logic errors, plan adherence |
| `feature-dev:code-reviewer` | **opus** | Convention adherence requires codebase-wide understanding |
| `backend-api-security:backend-security-coder` | **opus** | Security review requires reasoning about attack vectors |
| `pr-review-toolkit:code-simplifier` | **sonnet** | Structural improvements — DRY, clarity. Pattern-based. |
| `pr-review-toolkit:silent-failure-hunter` | **sonnet** | Pattern matching for empty catches, bad fallbacks |
| `pr-review-toolkit:pr-test-analyzer` | **sonnet** | Test coverage gaps — checklist-based evaluation |
| `pr-review-toolkit:type-design-analyzer` | **sonnet** | Type analysis — structured evaluation against rules |

The dispatch instruction will be updated to include `model` in the Task tool call for each agent.

## Change 2: Explore Agent Model Assignments (all read-only exploration)

All Explore agent dispatches across the plugin do file search and pattern extraction — no deep reasoning required. Haiku is the fastest and cheapest option.

| File | Location | Dispatch | Model |
|------|----------|----------|-------|
| `design-verification/SKILL.md` | Step 3 (~line 56) | Codebase exploration | **haiku** |
| `design-document/SKILL.md` | Step 1 (~line 31) | Context gathering (3-4 agents) | **haiku** |
| `start-feature/SKILL.md` | Study Existing Patterns (~line 367) | Pattern study agents | **haiku** |

## Change 3: Verification Batch Agent Model Assignments

Design verification batches evaluate PASS/FAIL/WARNING for checklist categories against the codebase. This requires structured judgment (schema compatibility, type checking, migration safety) — more than pattern matching but following a defined checklist.

| File | Location | Dispatch | Model |
|------|----------|----------|-------|
| `design-verification/SKILL.md` | Step 4 (~line 84) | Batches 1-5 | **sonnet** |
| `design-verification/SKILL.md` | Batch 6 (~line 102) | Stack/Platform/Docs | **sonnet** |

## Change 4: Spike Experiment Agent Model Assignment

**File:** `skills/spike/SKILL.md`, Step 3 (~line 98)

Experiment agents execute scripts and record results — structured execution following a defined experiment design. Use **sonnet**.

## Change 5: User Override Mechanism

**File:** `skills/start-feature/SKILL.md`, new paragraph in Code Review Pipeline Step

Add a short paragraph before the agent dispatch table:

> **Model override:** If the user has requested a specific model for the entire lifecycle (e.g., "use opus for everything" or "use sonnet for everything"), apply that model to all agent dispatches in this step, overriding the defaults in the table below.

This is a natural-language instruction — no config file, no flag parsing. It leverages the fact that Claude already has the full conversation context and can detect user intent.

## All Dispatch Points Summary

| # | File | Agent Type | Model | Rationale |
|---|------|-----------|-------|-----------|
| 1 | `start-feature/SKILL.md` | `superpowers:code-reviewer` | opus | Deep analysis, plan adherence |
| 2 | `start-feature/SKILL.md` | `feature-dev:code-reviewer` | opus | Convention adherence |
| 3 | `start-feature/SKILL.md` | `backend-api-security:backend-security-coder` | opus | Security reasoning |
| 4 | `start-feature/SKILL.md` | `pr-review-toolkit:code-simplifier` | sonnet | Pattern-based DRY |
| 5 | `start-feature/SKILL.md` | `pr-review-toolkit:silent-failure-hunter` | sonnet | Pattern matching |
| 6 | `start-feature/SKILL.md` | `pr-review-toolkit:pr-test-analyzer` | sonnet | Checklist-based |
| 7 | `start-feature/SKILL.md` | `pr-review-toolkit:type-design-analyzer` | sonnet | Structured evaluation |
| 8 | `start-feature/SKILL.md` | Explore (pattern study) | haiku | File reading |
| 9 | `design-document/SKILL.md` | Explore (context gathering) | haiku | File reading |
| 10 | `design-verification/SKILL.md` | Explore (codebase exploration) | haiku | File search |
| 11 | `design-verification/SKILL.md` | Explore (verification batches 1-5) | sonnet | Checklist judgment |
| 12 | `design-verification/SKILL.md` | Explore (verification batch 6) | sonnet | Checklist judgment |
| 13 | `spike/SKILL.md` | general-purpose (experiments) | sonnet | Script execution |

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Code review: Opus | 7/7 (100%) | 3/7 (43%) |
| Code review: Sonnet | 0/7 | 4/7 (57%) |
| Verification batches: Sonnet | 0/6 | 6/6 (100%) |
| Explore agents: Haiku | 0% | 100% |
| Experiment agents: Sonnet | 0% | 100% |
| User override | None | Natural language |

Estimated cost reduction for a typical feature lifecycle: **~40-50%** with equivalent quality.
