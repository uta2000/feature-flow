# Shift Quality Enforcement Upstream — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Push quality enforcement earlier in the feature-flow lifecycle so code review confirms quality rather than discovering its absence.

**Architecture:** 5 intervention points + 1 supporting change across 5 existing markdown files. All changes inject quality constraints into upstream lifecycle stages using the existing context override pattern in `start/SKILL.md`. No external plugin changes.

**Tech Stack:** Markdown (SKILL.md instruction files), HTML comments (section markers)

**Issue:** #78

---

### Task 1: Add section markers to coding-standards.md

This is the supporting infrastructure that enables machine-consumable extraction of coding standards sections. Must be done first because Task 5 references these markers.

**Acceptance Criteria:**
- [ ] Every `## ` heading in `references/coding-standards.md` (except "Core Principle" and "How This File Is Used") is wrapped with `<!-- section: slug -->` and `<!-- /section: slug -->` markers
- [ ] Grep for `<!-- section:` returns at least 13 matches in `references/coding-standards.md`
- [ ] Grep for `<!-- /section:` returns at least 13 matches in `references/coding-standards.md`
- [ ] All existing content is preserved unchanged between markers
- [ ] Section slugs use kebab-case matching the section name: `functions`, `error-handling`, `dry`, `types`, `separation-of-concerns`, `structural-quality`, `naming-conventions`, `code-organization`, `comments`, `performance`, `testing`, `stack-specific-standards`, `tool-usage-patterns`

**Quality Constraints:**
- Pattern: follow HTML comment conventions — `<!-- section: slug -->` before `## Heading`, `<!-- /section: slug -->` after last line of section content and before next section marker
- DRY: each marker pair wraps exactly one `## ` section
- No content changes: only add markers, never modify existing text

**Files:**
- Modify: `references/coding-standards.md`

**Step 1: Add opening and closing markers around each section**

Wrap each major section with markers. The sections and their slugs:

| Section Heading | Slug |
|----------------|------|
| `## Functions` | `functions` |
| `## Error Handling` | `error-handling` |
| `## DRY (Don't Repeat Yourself)` | `dry` |
| `## Types (TypeScript)` | `types` |
| `## Separation of Concerns` | `separation-of-concerns` |
| `## Structural Quality` | `structural-quality` |
| `## Naming Conventions` | `naming-conventions` |
| `## Code Organization` | `code-organization` |
| `## Comments` | `comments` |
| `## Performance` | `performance` |
| `## Testing` | `testing` |
| `## Stack-Specific Standards` | `stack-specific-standards` |
| `## Tool Usage Patterns` | `tool-usage-patterns` |

For each section, insert `<!-- section: slug -->` on a new line immediately before the `## ` heading, and `<!-- /section: slug -->` on a new line immediately after the last content line of that section (before the next `<!-- section:` or before `## How This File Is Used`).

Example for the first section:

```markdown
<!-- section: functions -->
## Functions

- **Single responsibility:** ...
...
```typescript
// GOOD: guard clauses
...
```
<!-- /section: functions -->
```

**Step 2: Verify markers**

Run: `grep -c '<!-- section:' references/coding-standards.md`
Expected: 13

Run: `grep -c '<!-- /section:' references/coding-standards.md`
Expected: 13

**Step 3: Commit**

```bash
git add references/coding-standards.md
git commit -m "refactor: add section markers to coding-standards.md for machine extraction"
```

---

### Task 2: Add Patterns & Constraints to design-document template

Add "Patterns & Constraints" as a new required section in the design document skill.

**Acceptance Criteria:**
- [ ] `skills/design-document/SKILL.md` contains `**Patterns & Constraints**` in the required sections list (after Scope)
- [ ] The document format template includes a `## Patterns & Constraints` section with subsections for Error Handling, Types, Performance, and Stack-Specific
- [ ] The "Include when applicable" table is unchanged
- [ ] Grep for `Patterns & Constraints` in `skills/design-document/SKILL.md` returns at least 2 matches (required list + template)

**Quality Constraints:**
- Pattern: follow existing required section format — `**Bold Name** — One-line description`
- Types: no new types needed (markdown only)
- Function length: N/A (markdown)
- Consistency: template subsections match the design doc's proposed template exactly

**Files:**
- Modify: `skills/design-document/SKILL.md`

**Step 1: Add to required sections list**

At line 72 (after `- **Scope** — What is included and what is explicitly excluded`), add:

```markdown
- **Patterns & Constraints** — Error handling strategy, type narrowness decisions, performance constraints, and stack-specific patterns that implementation must follow
```

**Step 2: Add to document format template**

In the document format template (the markdown code block starting at line 111), insert a `## Patterns & Constraints` section between `## [Technical sections as needed]` and `## Migration Requirements`:

```markdown
## Patterns & Constraints

### Error Handling
- [Strategy for each external call type — typed errors, retry, timeout]
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

**Step 3: Commit**

```bash
git add skills/design-document/SKILL.md
git commit -m "feat: add Patterns & Constraints as required design document section"
```

---

### Task 3: Add Batch 7 implementation-quality checks to design-verification

Add 5 new implementation-quality verification categories as Batch 7 in the design-verification skill.

**Acceptance Criteria:**
- [ ] `skills/design-verification/SKILL.md` batch dispatch table includes a row for Batch 7 with agent name "Implementation Quality" and categories "19-23"
- [ ] Categories 19-23 are defined inline in `SKILL.md` (following Batch 6 pattern) with check instructions for: type narrowness audit, error strategy completeness, function complexity forecast, edge case enumeration, stack pattern compliance
- [ ] A `#### Batch 7 — Implementation Quality` section exists after the Batch 6 section
- [ ] The Verification Depth table includes categories 19-23 for all design scopes
- [ ] Grep for `batch: 7` or `Batch 7` in `skills/design-verification/SKILL.md` returns at least 2 matches

**Quality Constraints:**
- Pattern: follow Batch 6's inline definition pattern (check items defined in SKILL.md, not checklist.md)
- Consistency: use the same dispatch instructions pattern as existing batches (model, context, return format)
- Each check must reference specific items from `references/coding-standards.md`

**Files:**
- Modify: `skills/design-verification/SKILL.md`

**Step 1: Add Batch 7 to the batch dispatch table**

After the row for Batch 6 in the table at line 78, add:

```markdown
| 7 | Implementation Quality | 19. Type Narrowness, 20. Error Strategy, 21. Function Complexity, 22. Edge Cases, 23. Stack Patterns |
```

**Step 2: Add Batch 7 section after Batch 6**

After the Batch 6 section (after line ~122 where the Documentation Compliance checks end), add:

```markdown
#### Batch 7 — Implementation Quality

Batch 7 checks whether the design's proposed implementation approach aligns with coding standards from `references/coding-standards.md`. Always dispatch alongside other batches. Use `model: sonnet`.

**Context passed to the Batch 7 agent:**
- The full design document content
- The check instructions for categories 19-23 (defined below)
- The codebase exploration results from Step 3
- The `references/coding-standards.md` content (for standards reference)

19. **Type Narrowness Audit** — Check every type mentioned or implied in the design:
    - [ ] **Literal unions over primitives:** Types use `'active' | 'inactive'` not `string` where the value set is known
    - [ ] **No implicit any:** All data shapes are explicitly typed in the design
    - [ ] **Generated types for external data:** Design specifies using generated types (not hand-maintained) for database rows, API responses

20. **Error Strategy Completeness** — Check every external call and user input point:
    - [ ] **Typed errors:** Error handling uses discriminated unions or custom error classes, not generic Error
    - [ ] **Boundary validation:** Every system boundary (API routes, form handlers, external data) has input validation specified
    - [ ] **Timeout/retry strategy:** External API calls specify timeout duration and retry policy
    - [ ] **User vs system errors:** Design distinguishes user-facing messages from system error logging

21. **Function Complexity Forecast** — Check proposed operations for complexity:
    - [ ] **Decomposition planned:** Operations that would exceed 30 lines are decomposed into named sub-operations in the design
    - [ ] **Max 3 parameters:** No proposed function signature exceeds 3 parameters
    - [ ] **Single responsibility:** Each proposed component/function has one clear purpose

22. **Edge Case Enumeration** — Check for completeness of edge case handling:
    - [ ] **Empty/null inputs:** Design addresses what happens with empty strings, null values, missing data
    - [ ] **Boundary values:** Design addresses pagination limits, max lengths, rate limits
    - [ ] **Error paths:** Design specifies behavior for network failures, timeouts, invalid data
    - [ ] **Concurrent access:** If applicable, design addresses race conditions or concurrent modifications

23. **Stack Pattern Compliance** — Check against loaded stack reference files:
    - [ ] **Current patterns:** Design uses patterns matching `references/stacks/*.md` recommendations
    - [ ] **No anti-patterns:** Design doesn't propose approaches flagged as anti-patterns in stack references
    - [ ] **Framework conventions:** Design follows framework-specific conventions (e.g., Server Components vs Client Components for Next.js)
```

**Step 3: Update Verification Depth table**

Update each row to include Batch 7 categories (19-23), since implementation-quality checks are universally applicable:

```markdown
| Design Scope | Depth |
|-------------|-------|
| New page with new data model | Full checklist (all 14 base categories + stack/platform/gotchas + doc compliance + implementation quality 19-23) |
| New API route, existing data model | Categories 1-3, 5, 7-8, 10-12, 14, 18-23 + stack/platform/gotchas |
| UI-only change, no schema changes | Categories 4-6, 9-10, 12-14, 19-23 + platform/gotchas |
| Configuration or env change | Categories 7, 10-12, 14, 19-23 + stack/gotchas |
```

**Step 4: Commit**

```bash
git add skills/design-verification/SKILL.md
git commit -m "feat: add Batch 7 implementation-quality checks to design verification"
```

---

### Task 4: Add Writing Plans Quality Context Injection to start/SKILL.md

Add an unconditional section that injects quality constraint requirements into the planning context when `superpowers:writing-plans` is invoked.

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains a `### Writing Plans Quality Context Injection` heading
- [ ] The section instructs the planner to include a `**Quality Constraints:**` section in every non-trivial task
- [ ] The section instructs the planner to enumerate edge cases in acceptance criteria
- [ ] The section explicitly states it applies in all modes (YOLO, Express, Interactive)
- [ ] The section appears after the "Writing Plans YOLO Override" section and before the "Using Git Worktrees YOLO Override" section

**Quality Constraints:**
- Pattern: follow existing section structure but use distinct heading pattern (not "YOLO Override")
- Consistency: quality constraint template matches the design doc's example exactly
- Separation: clearly separated from the conditional YOLO override above it

**Files:**
- Modify: `skills/start/SKILL.md`

**Step 1: Insert the section**

After line 565 (end of "Writing Plans YOLO Override" section, after `3. Immediately proceed to the next lifecycle step`), and before `### Using Git Worktrees YOLO Override`, insert:

```markdown

### Writing Plans Quality Context Injection

This section applies unconditionally in all modes (YOLO, Express, Interactive). When invoking `superpowers:writing-plans`, prepend the following context to the planning instructions:

**Instruct the planner to include a `**Quality Constraints:**` section in every non-trivial task.** Tasks that only create directories, copy files, or run commands are exempt. The Quality Constraints section specifies:

- **Error handling pattern:** Which error handling approach to use, referencing an existing file that demonstrates the pattern (e.g., "typed errors with discriminated union, match `src/handlers/users.ts`")
- **Type narrowness:** Which types must use literal unions instead of primitives (e.g., "`SearchResult.status` uses `'available' | 'taken' | 'error'`, not `string`")
- **Function length/extraction:** Where to extract helpers to keep functions ≤30 lines (e.g., "handler ≤30 lines; extract validation and transformation helpers")
- **Pattern to follow:** Which existing file to use as a reference implementation (e.g., "follow existing handler in `src/handlers/users.ts`")

**Instruct the planner to enumerate edge cases in acceptance criteria.** Every task that handles input, makes external calls, or processes data must include at least one edge case criterion:

- Empty/null input → validation error or safe default
- Timeout/error path → typed error response with appropriate status
- Boundary values → pagination limits, max lengths, rate limits
- Special characters → no injection vulnerabilities

**Example task with quality constraints:**

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
```

**Step 2: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add writing-plans quality context injection to start lifecycle"
```

---

### Task 5: Add Implementer Quality Context Injection to start/SKILL.md

Add an unconditional section that prepends coding standards and quality context to implementer subagent prompts.

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains a `### Implementer Quality Context Injection` heading
- [ ] The section specifies 4 context items to inject: coding standards sections, How to Code This notes, anti-patterns, and per-task quality constraints
- [ ] The section references `<!-- section: slug -->` markers for extracting relevant coding-standards.md sections
- [ ] The section explicitly states it applies in all modes (YOLO, Express, Interactive)
- [ ] The section appears after the "Subagent-Driven Development YOLO Override" section and before the "Commit Planning Artifacts Step" section

**Quality Constraints:**
- Pattern: follow existing section structure but use distinct heading pattern (not "YOLO Override")
- Consistency: references the section markers added in Task 1
- Separation: clearly separated from the conditional YOLO override above it

**Files:**
- Modify: `skills/start/SKILL.md`

**Step 1: Insert the section**

After line 608 (end of "Subagent-Driven Development YOLO Override" section), and before `### Commit Planning Artifacts Step`, insert:

```markdown

### Implementer Quality Context Injection

This section applies unconditionally in all modes (YOLO, Express, Interactive). When invoking `superpowers:subagent-driven-development`, prepend the following quality context to each implementer subagent's prompt:

**1. Relevant coding standards sections:** Extract the sections from `references/coding-standards.md` that are relevant to the current task using `<!-- section: slug -->` markers. At minimum, always include:
- `<!-- section: functions -->` (function length, single responsibility, guard clauses)
- `<!-- section: error-handling -->` (typed errors, boundary validation, fail fast)
- `<!-- section: types -->` (no any, narrow types, discriminated unions)

Include additional sections based on the task:
- If the task involves UI → include `separation-of-concerns`
- If the task involves naming new files/functions → include `naming-conventions`
- If the task involves async operations → include `performance`
- If the task involves tests → include `testing`

**2. "How to Code This" notes:** Include the per-task notes generated during the "Study Existing Patterns" step. These map each task to specific patterns found in the codebase.

**3. Anti-patterns found:** Include any anti-patterns flagged during "Study Existing Patterns" with the explicit instruction: "Do NOT replicate these patterns in new code."

**4. Per-task Quality Constraints:** Include the `**Quality Constraints:**` section from the specific plan task being implemented. These are the constraints set during implementation planning (see "Writing Plans Quality Context Injection").

**Format for injection:** Prepend the combined context as a markdown block at the beginning of the implementer's prompt:

```
## Quality Context for This Task

### Coding Standards (from references/coding-standards.md)
[extracted sections]

### How to Code This
[per-task notes from Study Existing Patterns]

### Anti-Patterns (do NOT replicate)
[flagged anti-patterns]

### Quality Constraints (from implementation plan)
[per-task quality constraints]

---
[Original task prompt follows]
```
```

**Step 2: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add implementer quality context injection to start lifecycle"
```

---

### Task 6: Add Quality Constraints and edge case validation to verify-plan-criteria

Add two new validation rules and corresponding auto-drafting logic to the verify-plan-criteria skill.

**Acceptance Criteria:**
- [ ] `skills/verify-plan-criteria/SKILL.md` Step 3 contains a check for `**Quality Constraints:**` section presence in each non-trivial task
- [ ] Step 3 contains a check for edge case criteria in acceptance criteria for tasks handling input, external calls, or data processing
- [ ] Step 4 contains auto-drafting logic for missing Quality Constraints (inferred from task description, files, and coding-standards.md)
- [ ] Step 4 contains auto-drafting logic for missing edge case criteria (inferred from task type)
- [ ] Grep for `Quality Constraints` in `skills/verify-plan-criteria/SKILL.md` returns at least 3 matches
- [ ] Grep for `edge case` in `skills/verify-plan-criteria/SKILL.md` returns at least 2 matches

**Quality Constraints:**
- Pattern: follow existing Step 3 check format (bold heading, bullet description, action)
- Pattern: follow existing Step 4 drafting format ("From the X section" pattern)
- Consistency: Quality Constraints template matches the example from the design doc
- Edge case categories match: empty/null, timeout/error, boundary, injection

**Files:**
- Modify: `skills/verify-plan-criteria/SKILL.md`

**Step 1: Add Quality Constraints check to Step 3**

After the "Fast-path" line (line 65), add:

```markdown

**Has Quality Constraints:** The task has a `**Quality Constraints:**` section with at least one constraint item.
- Skip for trivial tasks (tasks that only create directories, copy files, or run commands — identified by task title keywords: "setup", "create directory", "copy", "configure", "commit")
- For non-trivial tasks, flag as missing if the section is absent

**Has edge case criteria:** The task's acceptance criteria include at least one edge case test.
- Edge case criteria match patterns: "empty", "null", "timeout", "error", "invalid", "boundary", "missing", "special character", "concurrent"
- Skip for trivial tasks (same exemption as above)
- For non-trivial tasks, flag as missing if no edge case criteria are found
```

**Step 2: Add Quality Constraints and edge case drafting to Step 4**

After the "Always include" section (after line 88), add:

```markdown

**Quality Constraints (for non-trivial tasks missing them):**
Draft a `**Quality Constraints:**` section by inferring from the task context:
- **Error handling:** If the task modifies files that handle external calls (API routes, database queries, fetch calls), specify the error handling pattern from `references/coding-standards.md` `<!-- section: error-handling -->` and reference an existing file that demonstrates the pattern
- **Types:** If the task creates or modifies types/interfaces, specify narrowness requirements from `references/coding-standards.md` `<!-- section: types -->` — literal unions over primitives, no `any`
- **Function length:** If the task implements logic (not just configuration), specify ≤30 lines per function and suggest extraction points
- **Pattern to follow:** Reference an existing file in the same directory or feature area that demonstrates the correct pattern

**Edge case criteria (for non-trivial tasks missing them):**
Draft edge case acceptance criteria by inferring from the task type:
- **API handler/route:** Add criteria for empty input validation, timeout handling, invalid data
- **Data processing/transformation:** Add criteria for empty arrays, null values, boundary values
- **External API call:** Add criteria for timeout, network failure, error response
- **User input handling:** Add criteria for empty string, special characters, max length
- **Database query:** Add criteria for no results, pagination boundary, constraint violation
```

**Step 3: Update the presentation format**

In the drafted criteria presentation block (around line 94), update to include Quality Constraints in the output:

After the existing criteria draft format, add:

```markdown

**Task N: "[title]" — Quality Constraints**
- Error handling: [drafted constraint]
- Types: [drafted constraint]
- Function length: [drafted constraint]
- Pattern: [drafted constraint]
```

**Step 4: Commit**

```bash
git add skills/verify-plan-criteria/SKILL.md
git commit -m "feat: add Quality Constraints and edge case validation to verify-plan-criteria"
```
