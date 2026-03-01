# Parallel Exploration Agent Dispatch in Study-Patterns Phase — Design Document

**Date:** 2026-03-01
**Status:** Draft
**Issue:** #109

## Overview

The Study Existing Patterns step dispatches multiple Explore agents to analyze different areas of the codebase. These agents are read-only and fully independent, but the current instruction language is soft enough that orchestrators dispatch them sequentially. This design strengthens the parallelism instruction with an explicit anti-pattern warning — matching the proven pattern already used for TaskCreate dispatch — to enforce concurrent execution and reduce wall-clock time by ~26% per study-patterns phase.

## Evidence

From session `d1bab02a`: two Explore agents were launched 6 seconds apart and ran sequentially. Combined wall-clock time was ~50s. Parallel execution would have reduced this to ~37s (the longer of the two). The current instruction says "Launch all agents in a **single message** to run them concurrently" but lacks a negative constraint that prevents sequential dispatch.

## Technical Design

### Current Behavior

`skills/start/SKILL.md`, Study Existing Patterns Step (step 3), agent dispatch paragraph currently reads:

> "Use the Task tool with `subagent_type: "Explore"` and `model: "haiku"` ... Launch all agents in a **single message** to run them concurrently. Announce: "Dispatching N pattern study agents in parallel...""

This is correct in intent but lacks enforcement language. Without a "Do NOT" constraint, orchestrators follow the positive instruction loosely and may dispatch sequentially when handling multiple areas.

### Proposed Change

Add an explicit negative constraint immediately after the "single message" instruction, matching the language pattern proven effective for TaskCreate:

**TaskCreate pattern (reference):**
> "Call all TaskCreate tools in a **single parallel message** — send one message containing all N TaskCreate calls simultaneously. Do NOT call them one at a time; sequential calls waste N-1 parent API turns."

**New Study Existing Patterns language:**
> "Launch all agents in a **single message** to run them concurrently. Do NOT dispatch agents one at a time — sequential dispatch defeats the purpose of parallel study and wastes N-1 parent API turns on waiting. All N agents must appear in one message. Announce: 'Dispatching N pattern study agents in parallel...'"

### Secondary Fix

The Code Review Pipeline's Phase 1 dispatch instruction has the same softness:

> "Dispatch the tier-selected review agents in parallel ... Launch all agents in a single message to run them concurrently."

Apply the same "Do NOT" strengthening there for consistency.

### Files Changed

- `skills/start/SKILL.md` — two locations:
  1. Study Existing Patterns Step: agent dispatch paragraph (add "Do NOT" anti-pattern)
  2. Code Review Pipeline Step, Phase 1: agent dispatch paragraph (add "Do NOT" anti-pattern)

## Patterns & Constraints

### Error Handling
- No error handling changes needed — this is a documentation/instruction change only.

### Types
- No type changes — Markdown file edit only.

### Performance
- Expected improvement: ~13s wall-clock reduction per lifecycle run with 2 study agents; more with additional agents.
- Cost impact: negligible — same total tokens, faster wall clock.

### Stack-Specific
- No framework patterns apply — change is to a Markdown skill instruction file.

## Scope

**Included:**
- Strengthen parallelism instruction in Study Existing Patterns Step
- Strengthen parallelism instruction in Code Review Pipeline Phase 1 dispatch (secondary fix for consistency)

**Excluded:**
- No changes to any other dispatch sites (design-document parallel gather, subagent-driven-development — these use different patterns and are not reported as having sequential issues)
- No changes to how agents are actually dispatched by the runtime — this is an instruction-level fix
- No test infrastructure changes
