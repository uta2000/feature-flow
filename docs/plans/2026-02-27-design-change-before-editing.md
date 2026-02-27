# Design the Change Before Editing — Design Document

**Date:** 2026-02-27
**Status:** Draft
**Issue:** #95

## Overview

Implementer subagents currently start editing files without fully understanding their structure, causing edit thrashing — repeated edit → typecheck → re-read → edit cycles that waste API calls. This feature adds a "Change Design Protocol" to the implementer prompt injection and a "File modification complexity" field to the plan's Quality Constraints template, so implementers read and plan changes before writing.

## User Flow

### Step 1 — Plan Author Identifies Files Being Modified

When writing the implementation plan, the plan author notes which existing files each task modifies (vs creating new). Files >150 lines are flagged as "design-first" targets in the Quality Constraints section.

### Step 2 — Implementer Reads Before Editing

Each implementer subagent receives a "Change Design Protocol" as part of its quality context. Before making any edit to an existing file, the implementer must:
1. Read the complete file (or relevant sections for very large files)
2. Identify the specific functions/sections to modify
3. Plan the complete change
4. Write the edit in one pass

### Step 3 — Complex Files Get Explicit Change Plans

For files flagged as >150 lines in the Quality Constraints, the implementer must output an explicit change plan before editing: which functions change, what lines are added/removed, and how the change fits the file's existing structure.

## Pipeline / Architecture

### Change 1: Writing Plans Quality Context Injection

Add a third requirement to the existing "Prepend to the planning instructions" list:

**3. File modification complexity required in Quality Constraints.** For tasks that modify existing files (not create new ones), the Quality Constraints section must include:
- **Files modified:** List of existing files this task will edit
- **Design-first files:** Any listed file >150 lines, flagged with `(design-first)` — the implementer must output a change plan before editing these files

### Change 2: Implementer Quality Context Injection

Add a fifth item to the existing "Context injected per implementer subagent" list:

**5. Change Design Protocol.** For every file the task modifies (from the Quality Constraints `Files modified` list), instruct the implementer to:
1. Read the complete file before any edit (for files >200KB, use Grep to find relevant sections or Read with offset/limit)
2. Output a brief change plan: which functions/sections change, what's added, what's removed
3. Make the edit in one pass — do not edit, run typecheck, re-read, and edit again
4. For files marked `(design-first)` (>150 lines): the change plan is mandatory and must be output before any Edit tool call

Update the injection format template to include the new section.

### Change 3: Quality Constraints Example

Update the example task in Writing Plans Quality Context Injection to show the new `Files modified` and `Design-first files` fields.

## Patterns & Constraints

### Error Handling
Not applicable — this feature modifies markdown documentation, not executable code.

### Types
Not applicable — no TypeScript changes.

### Performance
The change adds one extra read per file before editing. This is negligible compared to the cost of a single wasted edit cycle (~$1.50 per cycle).

### Stack-Specific
Not applicable — this is a plugin skill file change.

## Scope

### Included
- Writing Plans Quality Context Injection: add file modification complexity requirement
- Implementer Quality Context Injection: add Change Design Protocol (item 5)
- Update example task to show new fields
- Update injection format template

### Excluded
- Edit count acceptance criteria ("file edited ≤2 times") — hard to enforce, creates perverse incentives
- Thrashing metrics in session reports — already tracked per issue analysis, reactive not proactive
- Separate skill or lifecycle step — this is instruction injection, not a workflow change
- verify-plan-criteria changes — the existing "Quality Constraints required" check already covers this since the new fields are part of Quality Constraints
