---
name: design-verification
description: This skill should be used when the user asks to "verify the design", "check the design against the codebase", "validate the design doc", "check for blockers", "will this design work", or after writing a design document to catch schema conflicts, type mismatches, and pipeline assumptions before implementation.
tools: Read, Glob, Grep, Task, Bash, Write, Edit, WebFetch, WebSearch, AskUserQuestion
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

### Step 2: Load Project Context

Check for a `.spec-driven.yml` file in the project root:

1. If found, read the `platform`, `stack`, and `gotchas` fields
2. For each entry in `stack`, look for a matching reference file at `../../references/stacks/{name}.md` (relative to this skill's directory)
3. For the declared `platform`, load the platform reference from `../../references/platforms/{platform}.md` (use `mobile.md` for `ios`, `android`, or `cross-platform`)
4. If a stack has no matching reference file, note it and use `WebSearch` to research known gotchas for that technology

If `.spec-driven.yml` does not exist, offer to create it via auto-detection:

1. Detect platform and stack from project files (see `../../references/auto-discovery.md`)
2. Present detected context to user and ask for confirmation
3. If confirmed, write `.spec-driven.yml` and continue with the detected context
4. If declined, proceed with the base checklist only

See `../../references/project-context-schema.md` for the full schema documentation.

### Step 3: Explore the Codebase

Launch exploration agents to understand the areas of the codebase affected by the design. Use the Task tool with `subagent_type=Explore` for thorough analysis.

Key areas to explore:
- Database schema (migrations, ORM models, type definitions)
- TypeScript/language types and interfaces
- Existing pipeline/workflow hooks and API routes
- UI components that will be modified or reused
- Configuration files and environment variables

### Step 4: Run Verification Checklist

Execute each category from the verification checklist. For each item, record: PASS, FAIL, or WARNING.

**Read `references/checklist.md` for the full detailed checklist before proceeding with verification.** The base categories are:

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
14. **Structural Anti-Patterns** — God objects, tight coupling, circular dependencies, dependency direction

**Then run additional checks from project context (if loaded in Step 2):**

15. **Stack-Specific Checks** — Run every check from the loaded stack reference files (e.g., Supabase PostgREST limits, Next.js server/client boundaries)
16. **Platform-Specific Checks** — Run checks from the platform reference file (e.g., mobile backward compatibility, feature flag requirements)
17. **Project Gotchas** — Check every entry in `.spec-driven.yml` `gotchas` against the design. Each gotcha is a mandatory verification item.
18. **Documentation Compliance (Context7)** — If `.spec-driven.yml` has a `context7` field and the Context7 MCP plugin is available, verify the design uses current patterns from official documentation. Query relevant Context7 libraries for the specific patterns the design proposes (auth flows, data fetching, client setup, etc.) and check for:
    - [ ] **Current API patterns:** Design uses the latest recommended patterns, not deprecated approaches
    - [ ] **Correct client setup:** Supabase/framework clients are initialized following current docs (e.g., `@supabase/ssr` with `getAll`/`setAll`, not legacy `auth-helpers`)
    - [ ] **Proper error handling:** Error patterns match current framework conventions (e.g., Server Actions return `{ errors }`, not throw)
    - [ ] **No deprecated APIs:** Design doesn't rely on APIs marked as deprecated in current docs

    If Context7 is not available, skip this category and note: "Context7 not available — documentation compliance check skipped."

### Step 5: Report Findings

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

### Step 6: Apply Corrections

If the user approves, update the design document with corrections:
- Add missing migration requirements
- Fix incorrect assumptions about column types or nullability
- Add sections for gaps (e.g., missing error handling, missing UI adaptations)
- Update counts and references to be accurate

Confirm each change with the user before applying.

**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip per-change confirmation. Auto-apply all recommended corrections and announce: `YOLO: design-verification — Apply corrections → All corrections applied`

### Step 7: Write Back Gotchas

Review all FAIL and WARNING findings from the verification. Identify any that represent **reusable project-specific pitfalls** — issues that could bite future features, not just this one.

**What qualifies as a gotcha:**
- A constraint or limit discovered in the codebase that isn't obvious (e.g., a NOT NULL column that most designs would assume is nullable)
- An API or service behavior that contradicts common assumptions (e.g., silent truncation, undocumented rate limits)
- A pattern in the codebase that new features must follow but wouldn't be obvious to discover

**What does NOT qualify:**
- One-time design mistakes (e.g., "design said 5 columns but table has 6")
- Findings already covered by a stack reference file (e.g., PostgREST 1000-row limit is already in supabase.md)

If any qualifying gotchas are found, present them:

```
I found findings that could prevent future bugs if added to your project gotchas:

1. "[specific gotcha phrased as a warning]"
2. "[specific gotcha]"

Add these to .spec-driven.yml?
```

Use `AskUserQuestion` with options: "Add all", "Let me pick", "Skip".

**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip this question. Auto-select "Add all" and announce: `YOLO: design-verification — Add gotchas → Add all ([N] gotchas added)`

If approved, append to the `gotchas` list in `.spec-driven.yml`. If the file doesn't exist, create it first using auto-detection (see `../../references/auto-discovery.md`).

## Verification Depth

Adjust depth based on the design's scope:

| Design Scope | Depth |
|-------------|-------|
| New page with new data model | Full checklist (all 14 base categories + stack/platform/gotchas + doc compliance) |
| New API route, existing data model | Categories 1-3, 5, 7-8, 10-12, 14, 18 + stack/platform/gotchas |
| UI-only change, no schema changes | Categories 4-6, 9-10, 12-14 + platform/gotchas |
| Configuration or env change | Categories 7, 10-12, 14 + stack/gotchas |

## Quality Rules

- **Evidence-based:** Every FAIL must include the exact file path, line number, and current value that conflicts with the design
- **Actionable:** Every finding must include a specific recommendation for how to fix it
- **No false alarms:** Only flag real conflicts. Do not flag theoretical concerns that are unlikely to occur.
- **Complete:** Check every proposed change in the design, not just the obvious ones

## Additional Resources

### Reference Files

For the full detailed verification checklist with specific checks per category:
- **`references/checklist.md`** — Base verification checklist with 14 categories, specific checks, and examples of common findings

For project context and stack/platform-specific checks:
- **`../../references/project-context-schema.md`** — Schema for `.spec-driven.yml`
- **`../../references/stacks/`** — Stack-specific verification checks (supabase, next-js, react-native, vercel)
- **`../../references/platforms/`** — Platform-specific lifecycle adjustments and checks (mobile, web)
