# Shift Quality Enforcement Upstream — Design Document

**Date:** 2026-02-24
**Status:** Draft
**Issue:** #78

## Overview

Code review agents consistently discover issues (type narrowness, error handling, function length, DRY, naming) that should have been prevented by upstream lifecycle stages. The root cause: `references/coding-standards.md` is comprehensive but only referenced at self-review (step 12) and code review (step 13). Everything upstream — design, design verification, implementation planning, and implementer prompts — operates without quality constraints.

This feature adds 5 intervention points plus 1 supporting infrastructure change to the feature-flow lifecycle so that coding standards flow downstream as active constraints rather than afterthought checks. Code review should **confirm** quality, not **discover** its absence.

## User Flow

### Step 1 — Design Document Now Prescribes Quality Patterns

When the design document is written, a new required section "Patterns & Constraints" captures error handling strategy, type narrowness decisions, performance constraints, and stack-specific patterns. This turns the design into an implementation contract.

### Step 2 — Design Verification Catches Quality Feasibility Gaps

Design verification gains 5 new implementation-quality checks (Batch 7) that audit whether the design's proposed types are narrow enough, error strategies are complete, functions can reasonably fit in 30 lines, edge cases are enumerated, and stack patterns are followed.

### Step 3 — Implementation Plan Embeds Quality Constraints Per Task

Each plan task gains a "Quality Constraints" section alongside acceptance criteria. The constraints specify: which error handling pattern to use (referencing existing code), which types must be narrow, which functions should be extracted, and which existing file to follow as a pattern.

### Step 4 — Verify-Plan-Criteria Enforces Quality Constraints + Edge Cases

`verify-plan-criteria` gains two new validation rules: (1) every task must have a Quality Constraints section, and (2) acceptance criteria must include edge case tests (empty input, null, timeout, boundary values).

### Step 5 — Implementer Subagents Receive Coding Standards as Input

When `start` invokes `subagent-driven-development`, it prepends coding standards, Study Existing Patterns output, and per-task quality constraints to each implementer's context. Implementers write code that follows standards from the start.

## Example

**Before (current):**
```
### Task 3: Build search handler

**Acceptance Criteria:**
- [ ] Returns paginated results matching query
- [ ] Returns empty array for no matches
```

Code review then discovers: function is 45 lines, uses `string` instead of literal union for status, no error typing, no timeout handling.

**After (proposed):**
```
### Task 3: Build search handler

**Acceptance Criteria:**
- [ ] Returns paginated results matching query
- [ ] Returns empty array for no matches
- [ ] Handles API timeout (30s) with typed error
- [ ] Returns validation error for empty string input
- [ ] Paginates results >25

**Quality Constraints:**
- Error handling: typed errors with discriminated union (match `src/handlers/users.ts`)
- Types: `SearchResult.status` uses literal union `'available' | 'taken' | 'error'`, not string
- Function length: handler ≤30 lines; extract validation and transformation helpers
- Pattern: follow existing handler in `src/handlers/users.ts`
```

Code review now confirms these constraints were followed rather than discovering they were missed.

## Pipeline / Architecture

### Intervention Points in the Lifecycle

All 5 interventions use the same pattern: context injection via the `start` skill's existing override mechanism. No external plugin changes required.

| # | Intervention | File | Mechanism |
|---|-------------|------|-----------|
| 1 | Design doc template | `skills/design-document/SKILL.md` | Add "Patterns & Constraints" to required sections list |
| 2 | Design verification | `skills/design-verification/SKILL.md` | Add Batch 7 with 5 implementation-quality categories |
| 3 | Plan quality constraints | `skills/start/SKILL.md` | Add writing-plans context override |
| 4 | Implementer prompt | `skills/start/SKILL.md` | Add subagent-driven-development context override |
| 5 | Plan criteria validation | `skills/verify-plan-criteria/SKILL.md` | Add Quality Constraints + edge case validation rules |
| 6 | Standards restructure | `references/coding-standards.md` | Add section markers for machine extraction |

### Quality Flow — Before vs After

| Stage | Current | Proposed |
|-------|---------|----------|
| Design doc | What to build | What to build + how well |
| Design verification | Structure correct? | Structure correct + quality feasible? |
| Implementation plan | Tasks + criteria | Tasks + criteria + quality constraints + edge cases |
| Implementer prompt | Task + scene | Task + scene + coding standards + patterns |
| Self-review | First quality check | Confirmation check (standards already followed) |
| Code review | Discovery of quality issues | Verification that constraints were met |

### Detailed Changes Per File

#### 1. `skills/design-document/SKILL.md`

Add "Patterns & Constraints" as a new **required** section (alongside Overview, User Flow, Scope). The section template:

```markdown
## Patterns & Constraints

### Error Handling
- [Strategy for each external call type — typed Result<T, E>, retry, timeout]
- [User-facing vs system error distinction]

### Types
- [Key types with narrowness specified — literal unions, not string]
- [Generated vs hand-maintained types]

### Performance
- [Debounce, pagination, parallel constraints]
- [N+1 prevention strategy]

### Stack-Specific
- [Patterns from references/stacks/*.md and Context7 docs that apply]
```

Insert into both the "Required sections" list and the document format template.

#### 2. `skills/design-verification/SKILL.md`

Add Batch 7 (Implementation Quality) with categories 19-23. Following the Batch 6 pattern, check items are defined in `SKILL.md` (not in `checklist.md`) since they reference `coding-standards.md` and are guidance-oriented rather than codebase-specific.

| # | Check | What It Catches |
|---|-------|----------------|
| 19 | Type narrowness audit | `string` where `'active' \| 'inactive'` was intended |
| 20 | Error strategy completeness | Missing error typing, missing retry/timeout for external calls |
| 21 | Function complexity forecast | God functions designed into the plan (can it be done in ≤30 lines?) |
| 22 | Edge case enumeration | Missing empty state, null input, boundary, timeout scenarios |
| 23 | Stack pattern compliance | Design uses patterns from `references/stacks/*.md` |

Dispatch as a separate agent alongside existing batches. Uses `model: sonnet`.

Update the Verification Depth table to include Batch 7 categories for all design scopes (these are universally applicable).

#### 3. `skills/start/SKILL.md` — Writing Plans Quality Context Injection

Add a new section after the existing "Writing Plans YOLO Override" that injects quality constraint requirements into the planning context. This is NOT a YOLO override — it applies unconditionally in all modes (YOLO, Express, Interactive). Use the heading pattern `### Writing Plans Quality Context Injection` to distinguish from conditional YOLO overrides.

The injection instructs the planner to include a `**Quality Constraints:**` section in every task:
- Error handling pattern (reference existing code)
- Type narrowness requirements
- Function length/extraction guidance
- Pattern to follow (reference existing file)

The override also instructs the planner to enumerate edge cases in acceptance criteria:
- Empty/null input handling
- Timeout/error path handling
- Boundary value testing
- Special character/injection prevention

#### 4. `skills/start/SKILL.md` — Implementer Quality Context Injection

Add a new section after the existing "Subagent-Driven Development YOLO Override" that prepends quality context to implementer prompts. This is NOT a YOLO override — it applies unconditionally in all modes. Use the heading pattern `### Implementer Quality Context Injection`.

Context injected per implementer subagent:
- Relevant sections from `references/coding-standards.md` (extracted using section markers)
- "How to Code This" notes from the Study Existing Patterns step
- Anti-patterns found (with explicit "do NOT replicate" flag)
- Quality Constraints from the specific plan task being implemented

#### 5. `skills/verify-plan-criteria/SKILL.md`

Add two new validation rules to the existing Step 3 (Check Each Task):

**Rule: Quality Constraints required** — Every non-trivial task must have a `**Quality Constraints:**` section. Tasks that only create directories, copy files, or run commands are exempt.

**Rule: Edge case criteria required** — Acceptance criteria must include at least one edge case test for tasks that handle input, make external calls, or process data. Flag tasks that only have happy-path criteria.

Add auto-drafting for both in Step 4 (Draft Missing Criteria):
- Quality Constraints: infer from task description, files being modified, and coding-standards.md
- Edge case criteria: infer from task type (API handler → timeout/validation; data processing → empty/null/boundary)

#### 6. `references/coding-standards.md`

Add HTML comment section markers around each major section for machine-consumable extraction:

```markdown
<!-- section: functions -->
## Functions
...
<!-- /section: functions -->

<!-- section: error-handling -->
## Error Handling
...
<!-- /section: error-handling -->
```

Sections to mark: Functions, Error Handling, DRY, Types, Separation of Concerns, Structural Quality, Naming Conventions, Code Organization, Comments, Performance, Testing, Stack-Specific Standards, Tool Usage Patterns.

Preserve all existing content — only add markers around existing sections.

## Scope

**Included:**
- Add Patterns & Constraints section to design document template
- Add Batch 7 (5 implementation-quality checks) to design verification
- Add writing-plans context override for quality constraints per task
- Add subagent-driven-development context override for coding standards injection
- Add Quality Constraints and edge case validation to verify-plan-criteria
- Add section markers to coding-standards.md for machine extraction

**Excluded:**
- No changes to external plugins (superpowers, pr-review-toolkit, feature-dev)
- No changes to hooks system (anti-pattern hooks already enforce `any`, empty catches)
- No changes to the dispatcher CLI tool
- No new files created (all modifications to existing files)
- No changes to the self-review or code review pipeline steps (they benefit passively from upstream improvements)
