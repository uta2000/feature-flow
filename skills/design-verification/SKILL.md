---
name: design-verification
description: This skill should be used when the user asks to "verify the design", "check the design against the codebase", "validate the design doc", "check for blockers", "will this design work", or after writing a design document to catch schema conflicts, type mismatches, and pipeline assumptions before implementation.
tools: Read, Glob, Grep, Task, Bash, WebFetch, WebSearch, AskUserQuestion
---

# Design Verification

Verify a design document against the actual codebase to catch conflicts, gaps, and incorrect assumptions before implementation. This is the gate between "this sounds right" and "this will actually work."

**Announce at start:** "Running design-verification to check this design against the codebase for blockers and gaps."

## When to Use

- After writing or updating a design document
- Before creating a GitHub issue from a design
- Before writing an implementation plan
- When the user asks "will this work with our app?"

## Process

### Step 1: Load the Design Document

Find the design document:
1. If the user specified a path, use it
2. Otherwise, find the most recently modified `.md` file in `docs/plans/`:

```
Glob: docs/plans/*.md
```

Confirm with the user: "Verifying design: `[path]`. Is this correct?"

Read the full document and extract all proposed changes.

### Step 2: Explore the Codebase

Launch exploration agents to understand the areas of the codebase affected by the design. Use the Task tool with `subagent_type=Explore` for thorough analysis.

Key areas to explore:
- Database schema (migrations, ORM models, type definitions)
- TypeScript/language types and interfaces
- Existing pipeline/workflow hooks and API routes
- UI components that will be modified or reused
- Configuration files and environment variables

### Step 3: Run Verification Checklist

Execute each category from the verification checklist. For each item, record: PASS, FAIL, or WARNING.

**Read `references/checklist.md` for the full detailed checklist before proceeding with verification.** The categories are:

1. **Schema Compatibility** — Nullability, constraints, FKs, column types
2. **Type Compatibility** — TypeScript/language types match proposed schema changes
3. **Pipeline / Flow Compatibility** — Existing hooks, API routes, data shapes
4. **UI Component Inventory** — Required components exist or are planned
5. **Cross-Feature Impact** — Changes to shared tables/types/components affect other features
6. **Completeness** — Error handling, loading states, edge cases
7. **Cost & Performance** — API costs, rate limits, payload sizes, N+1 queries
8. **Migration Safety** — Existing data, defaults, rollback
9. **Internal Consistency** — Design doc sections agree with each other
10. **Pattern Adherence** — Follows existing codebase conventions
11. **Dependency & API Contract Verification** — Library versions support proposed usage, external APIs behave as assumed
12. **Build Compatibility** — TypeScript strict mode, linting rules, framework config
13. **Route & Layout Chain** — New pages inherit auth, layout, providers correctly

### Step 4: Report Findings

Present a structured report:

```
## Design Verification Report

**Design:** [path to design doc]
**Date:** [current date]

### Results

| # | Category | Status | Finding |
|---|----------|--------|---------|
| 1 | Schema Compatibility | FAIL | `keyword_phrase` is NOT NULL but design assumes nullable |
| 2 | Type Compatibility | FAIL | `SearchResult.service_id` is `string`, not `string \| null` |
| 3 | Pipeline Compatibility | WARNING | `useSearchPipeline` Phase 1 assumes service/location IDs |
| 4 | UI Components | PASS | All required components exist or are planned |
| ... | ... | ... | ... |

### Blockers (FAIL — must fix before implementation)
1. [specific issue with exact file paths and line numbers]
2. [specific issue]

### Warnings (should address, not blocking)
1. [specific concern]

### Gaps (missing from design)
1. [what the design doesn't cover but should]

### Recommended Design Doc Updates
[Specific edits to make to the design document]
```

### Step 5: Apply Corrections

If the user approves, update the design document with corrections:
- Add missing migration requirements
- Fix incorrect assumptions about column types or nullability
- Add sections for gaps (e.g., missing error handling, missing UI adaptations)
- Update counts and references to be accurate

Confirm each change with the user before applying.

## Verification Depth

Adjust depth based on the design's scope:

| Design Scope | Depth |
|-------------|-------|
| New page with new data model | Full checklist (all 13 categories) |
| New API route, existing data model | Categories 1-3, 5, 7-8, 10-12 |
| UI-only change, no schema changes | Categories 4-6, 9-10, 12-13 |
| Configuration or env change | Categories 7, 10-12 |

## Quality Rules

- **Evidence-based:** Every FAIL must include the exact file path, line number, and current value that conflicts with the design
- **Actionable:** Every finding must include a specific recommendation for how to fix it
- **No false alarms:** Only flag real conflicts. Do not flag theoretical concerns that are unlikely to occur.
- **Complete:** Check every proposed change in the design, not just the obvious ones

## Additional Resources

### Reference Files

For the full detailed verification checklist with specific checks per category:
- **`references/checklist.md`** — Complete verification checklist with 13 categories, specific checks, and examples of common findings
