# Haiku for Explore Subagents by Default — Design Document

**Date:** 2026-02-27
**Status:** Draft
**Issue:** #97

## Overview

Session performance analysis (883e66f0) revealed that Explore subagents inherit the parent model (often Opus) when no explicit `model` parameter is set. Explore agents are read-only — they run Glob, Grep, Read, and LS operations for pattern extraction and codebase analysis. Haiku is sufficient for these tasks and ~95% cheaper for output tokens.

The start skill already specifies `model: "haiku"` for Explore agents in three places, but the rule at line 665 (implementation phase) is scoped to YOLO/Express mode only. In Interactive mode, `subagent-driven-development` can dispatch Explore agents without the haiku override, causing them to inherit the parent's Opus pricing. This design closes that gap by establishing a general model routing convention that applies to all modes.

## Changes

### Change 1: Add General Model Routing Defaults Section to `start/SKILL.md`

Add a new section titled "Model Routing Defaults" between the existing "Implementer Quality Context Injection" section and the "Study Existing Patterns Step" section. This section applies unconditionally in all modes (YOLO, Express, Interactive).

Content:
- **Explore agents → haiku**: All Task dispatches with `subagent_type: "Explore"` must use `model: "haiku"` unless the task requires substantive analysis (e.g., design-verification batch agents that make PASS/FAIL/WARNING judgments). When overriding to sonnet, the skill must document the justification inline.
- **Implementation agents → sonnet** (default): With opus escalation for architectural keywords.
- **Spec review / consumer verification → sonnet**: Checklist work.

This consolidates routing rules that were previously scattered across the YOLO override section and inline steps.

### Change 2: Simplify the YOLO Override Section in `start/SKILL.md`

Refactor the existing YOLO override point 5 (line 665) to reference the general section instead of re-stating the rule. The YOLO override retains points 1-4 (auto-answering questions, model selection for implementers, spec review routing) but point 5 becomes a reference: "For Explore agents, follow the Model Routing Defaults section (haiku)."

### Change 3: Update `references/tool-api.md`

Add a "Recommended Model Defaults" subsection after the existing Task Tool examples (after line 46). This provides guidance for skill authors and ad-hoc Task dispatches:

| `subagent_type` | Recommended Model | Rationale |
|-----------------|-------------------|-----------|
| `"Explore"` | `haiku` | Read-only; no advanced reasoning needed |
| `"general-purpose"` | `sonnet` | Write access; needs reasoning for implementation |
| `"Plan"` | `sonnet` | Architecture planning requires reasoning |

Also update the Explore agent description (line 22) to mention the model recommendation.

## Patterns & Constraints

### Error Handling
Not applicable — this is instruction injection into markdown skill files, not a workflow change.

### Types
Not applicable — no code changes.

### Performance
This is the performance improvement: ~95% output token cost reduction for Explore agent dispatches that previously inherited Opus pricing.

### Stack-Specific
Not applicable.

## Scope

### Included
- `skills/start/SKILL.md` — New general "Model Routing Defaults" section; simplified YOLO override reference
- `references/tool-api.md` — Recommended model defaults table and updated Explore description

### Excluded
- `skills/design-verification/SKILL.md` — Verification batch agents (1-7) intentionally use sonnet for complex analysis. No change.
- `skills/design-document/SKILL.md` — Already uses haiku for Explore agents. No change.
- Superpowers plugin files — External plugin, not modified by this change
- Runtime enforcement — No hook or programmatic enforcement of model defaults; this is convention-based via skill instructions
