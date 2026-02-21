# Parallelize Skill Operations with Agent Dispatch — Design Document

**Date:** 2026-02-20
**Status:** Draft
**Issue:** #22

## Overview

Several skills in the spec-driven lifecycle perform heavy sequential work where subtasks have no data dependencies on each other. This feature applies the parallel dispatch pattern (already proven in the code review pipeline at `skills/start-feature/SKILL.md:475-569`) to four additional operations: design verification checklist, spike experiments, design document context gathering, and start-feature pattern study. The checklist reference file is annotated with batch groupings to support the verification dispatch.

## User Flow

### Step 1 — Design verification runs in parallel batches
After codebase exploration (Step 3), instead of seeing 14+ checklist categories checked one at a time, the user sees: "Dispatching 6 verification agents in parallel..." Each agent handles a thematic batch of categories. Results are consolidated into the same report table format.

### Step 2 — Spike experiments run concurrently
After experiment design (Step 2), instead of seeing each assumption tested sequentially, the user sees: "Dispatching N experiment agents in parallel (worktree-isolated)..." Each agent runs its experiment independently. Results are consolidated into the spike report table.

### Step 3 — Context gathering runs in parallel
When writing a design document, instead of sequential Glob/Grep/Read + Context7 queries, the user sees: "Dispatching 3-4 context gathering agents in parallel..." Each agent focuses on one area (format patterns, stack/deps, relevant code, docs). Results are synthesized before writing.

### Step 4 — Pattern study runs in parallel
Before implementation, instead of reading example files area by area, the user sees: "Dispatching N pattern study agents in parallel..." Each agent reads 2-3 files in its area and extracts patterns. Results are merged into the "Existing Patterns Found" output.

## Architecture

All four parallelized operations follow the same dispatch pattern established by the code review pipeline:

```
1. Prepare context (design doc, experiment designs, codebase areas)
2. Dispatch agents in a SINGLE message (triggers parallel execution)
3. Each agent receives: (a) self-contained context, (b) its assigned scope, (c) expected return format
4. Collect all results after agents complete
5. Consolidate results into the skill's expected output format
```

**Agent type:** `Explore` (read-only: Glob/Grep/Read) for all operations except spike experiments, which use `general-purpose` with `isolation: "worktree"`.

**Failure handling (all operations):** Retry the failed agent once. If it fails again, skip it, log a warning noting which categories/areas were skipped, and continue with available results.

## Change 1: Design Verification — Parallel Batch Dispatch

**File:** `skills/design-verification/SKILL.md` — Step 4 (lines 65-98)

**Current:** "Execute each category from the verification checklist. For each item, record: PASS, FAIL, or WARNING." — runs 14+ categories sequentially inline.

**New:** Dispatch 6 Explore agents, each handling a thematic batch of categories. The batch groupings are defined in `references/checklist.md` (annotated as part of this feature).

### Batch Groupings

| Batch | Agent | Categories |
|-------|-------|------------|
| 1 | Schema & Types | 1. Schema Compatibility, 2. Type Compatibility |
| 2 | Pipeline & Components | 3. Pipeline/Flow, 4. UI Component Inventory, 5. Cross-Feature Impact |
| 3 | Quality & Safety | 6. Completeness, 7. Cost & Performance, 8. Migration Safety |
| 4 | Patterns & Build | 9. Internal Consistency, 10. Pattern Adherence, 11. Dependencies, 12. Build Compatibility |
| 5 | Structure & Layout | 13. Route & Layout Chain, 14. Structural Anti-Patterns |
| 6 | Stack/Platform/Docs | 15. Stack-Specific, 16. Platform-Specific, 17. Project Gotchas, 18. Documentation Compliance |

### Context Passed to Each Agent

Each agent receives:
- The full design document content
- Its assigned checklist categories (copied from `references/checklist.md`)
- The codebase exploration results from Step 3
- The `.spec-driven.yml` content (for stack/platform/gotchas context)

### Expected Return Format

Each agent returns a list of results:
```
{ category: string, status: "PASS" | "FAIL" | "WARNING", finding: string }
```

### Consolidation

After all agents complete, merge results into the unified report table (same format as current Step 5). Sort by category number. If an agent was skipped due to failure, note: "Categories N-M: SKIPPED (agent failed)". Batch 6 sources its check instructions from SKILL.md lines 86-97, not from checklist.md — the checklist.md batch header annotation for Batch 6 is informational only.

### Batch 6 Conditional Dispatch

Batch 6 (Stack/Platform/Docs) is only dispatched if `.spec-driven.yml` exists with a non-empty `stack`, `platform`, or `gotchas` field, or if Context7 is available. If none of these conditions are met, skip Batch 6 entirely.

**Verification depth filtering:** Before dispatching batches, consult the verification depth table in SKILL.md. Only dispatch batches containing at least one applicable category for the design's scope. Pass the applicable category list to each agent so it skips non-applicable categories within its batch.

## Change 2: Spike Experiments — One Agent per Assumption

**File:** `skills/spike/SKILL.md` — Step 3 (lines 92-101)

**Current:** "Execute each experiment and record results" — runs each assumption test sequentially.

**New:** Dispatch one agent per selected assumption, each running its experiment independently in an isolated worktree.

### Agent Configuration

- **Agent type:** `general-purpose` (needs Bash to run experiment scripts)
- **Isolation:** `isolation: "worktree"` on every dispatch (experiments may install deps, create files, or modify config)
- **Cap:** Maximum 5 concurrent agents to avoid resource contention

### Context Passed to Each Agent

Each agent receives:
- The hypothesis to test
- The experiment design from Step 2
- Instructions to: create a spike script, run it, record evidence, return verdict
- Any relevant API keys or env vars available in the current environment

### Expected Return Format

```
{ assumption: string, verdict: "CONFIRMED" | "DENIED" | "CANNOT_TEST", evidence: string }
```

### Consolidation

After all agents complete, merge results into the spike report table (same format as current Step 4). Worktrees are automatically cleaned up if agents made no persistent changes.

### Overflow Handling

If more than 5 assumptions are selected, dispatch the first 5 in parallel, wait for completion, then dispatch the remainder.

## Change 3: Design Document Context Gathering — Parallel Explore Agents

**File:** `skills/design-document/SKILL.md` — Step 1 (lines 22-36)

**Current:** Sequential Glob/Grep/Read + Context7 queries to gather codebase context.

**New:** Dispatch 3-4 Explore agents in parallel, each gathering a specific type of context.

### Agent Assignments

| Agent | Gathers | Dispatch Condition |
|-------|---------|-------------------|
| Format patterns | Existing design docs in `docs/plans/` — structure, sections, conventions | Always |
| Stack & dependencies | `package.json`, config files, framework versions, installed libraries | Always |
| Relevant code | API routes, data models, UI components related to the feature | Always |
| Documentation | Context7 queries for relevant stack libraries | Only if `.spec-driven.yml` has a `context7` field |

### Context Passed to Each Agent

Each agent receives:
- The feature description (from brainstorming output or issue body)
- Its specific gathering assignment (what to look for, where to look)
- For the Documentation agent: the library IDs from `.spec-driven.yml` `context7` field

### Expected Return Format

Each agent returns a structured summary:
```
{ area: string, findings: string[] }
```

### Consolidation

After all agents complete, synthesize all summaries into the context used for writing the design document. The conversation-level context (brainstorming decisions) is collected inline — only codebase and documentation queries are parallelized.

## Change 4: Start-Feature Pattern Study — Parallel Explore Agents

**File:** `skills/start-feature/SKILL.md` — "Study Existing Patterns" step (lines 358-429)

**Current:** For each area in the implementation plan, sequentially read 2-3 existing files and extract patterns.

**New:** Dispatch one Explore agent per codebase area, each reading 2-3 example files and extracting patterns.

### Agent Assignments

Only dispatch agents for areas that the implementation plan actually touches. Common areas:

| Agent | Studies |
|-------|---------|
| API patterns | Existing route handlers — naming, error handling, response shapes |
| Component patterns | Existing UI components — props, state, styling conventions |
| Data patterns | Existing queries, hooks, data fetching — caching, error states |
| Schema patterns | Existing migrations, models, type definitions |

### Context Passed to Each Agent

Each agent receives:
- The area it's responsible for (e.g., "API routes")
- The file paths or directories to examine (derived from the implementation plan)
- Instructions to read 2-3 example files and extract: file structure, error handling, naming conventions, and anti-patterns

### Expected Return Format

Each agent returns:
```
{
  area: string,
  patterns: { aspect: string, pattern: string }[],
  antiPatterns: { file: string, issue: string, recommendation: string }[]
}
```

### Consolidation

After all agents complete:
1. Merge pattern results into "Existing Patterns Found" sections (per area)
2. Merge anti-pattern results into "Anti-Patterns Found (do NOT replicate)" section
3. Generate "How to Code This" notes per task using the merged patterns
4. Step 1 (Read coding-standards.md) and Steps 5-7 (How to Code This notes, anti-pattern flagging, passing context) remain inline — only the file reading (Steps 3-4) is parallelized

## Change 5: Checklist Batch Annotations

**File:** `skills/design-verification/references/checklist.md`

Add a batch annotation header at the top of the checklist file and a `<!-- batch: N -->` comment before each category heading, so the design-verification skill can programmatically partition categories when dispatching agents.

```markdown
<!-- Verification Batches:
  Batch 1 (Schema & Types): Categories 1-2
  Batch 2 (Pipeline & Components): Categories 3-5
  Batch 3 (Quality & Safety): Categories 6-8
  Batch 4 (Patterns & Build): Categories 9-12
  Batch 5 (Structure & Layout): Categories 13-14
  Batch 6 (Stack/Platform/Docs): Categories 15-18
-->
```

Each category section gets a batch marker:
```markdown
<!-- batch: 1 -->
## 1. Schema Compatibility
```

## What Does NOT Change

These operations were evaluated and should remain as-is:

| Operation | Reason |
|-----------|--------|
| **Code review pipeline** (`start-feature`) | Already parallelized — 7 agents dispatched concurrently |
| **Self-review** (`start-feature`) | Fixes need coordination — parallel agents would create merge conflicts |
| **Task verifier** (`verify-acceptance-criteria`) | Single comprehensive agent ensures consistent verification methodology |
| **Plan criteria check** (`verify-plan-criteria`) | Results must consolidate before user approval — sequential is simpler |

## Scope

**Included:**
- `skills/design-verification/SKILL.md` — Rewrite Step 4 to dispatch parallel Explore agent batches
- `skills/spike/SKILL.md` — Rewrite Step 3 to dispatch one agent per assumption with worktree isolation
- `skills/design-document/SKILL.md` — Rewrite Step 1 to dispatch parallel Explore agents for context gathering
- `skills/start-feature/SKILL.md` — Rewrite "Study Existing Patterns" inline step to dispatch parallel Explore agents per area
- `skills/design-verification/references/checklist.md` — Add batch grouping annotations
- Failure handling pattern (retry once, then skip) across all parallelized operations
- Context specification, return format, and consolidation logic for each operation

**Excluded:**
- Modifying the code review pipeline (already parallel)
- Modifying self-review, task-verifier, or verify-plan-criteria (should stay sequential)
- Adding new skills or agents (all changes are inline in existing skill files)
- Context7 parallel lookups as a standalone change (combined with design-document context gathering instead)
- Changes to hooks, plugin.json schema, or reference files other than checklist.md
