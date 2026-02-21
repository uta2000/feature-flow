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

Launch exploration agents to understand the areas of the codebase affected by the design. Use the Task tool with `subagent_type=Explore` and `model: haiku` for thorough analysis.

Key areas to explore:
- Database schema (migrations, ORM models, type definitions)
- TypeScript/language types and interfaces
- Existing pipeline/workflow hooks and API routes
- UI components that will be modified or reused
- Configuration files and environment variables

### Step 4: Run Verification Checklist

Dispatch parallel verification agents to check the design against the codebase. Each agent handles a thematic batch of checklist categories.

**Read `references/checklist.md` for the full detailed checklist.** The checklist is partitioned into 6 batches using `<!-- batch: N -->` markers:

| Batch | Agent | Categories |
|-------|-------|------------|
| 1 | Schema & Types | 1. Schema Compatibility, 2. Type Compatibility |
| 2 | Pipeline & Components | 3. Pipeline/Flow, 4. UI Component Inventory, 5. Cross-Feature Impact |
| 3 | Quality & Safety | 6. Completeness, 7. Cost & Performance, 8. Migration Safety |
| 4 | Patterns & Build | 9. Internal Consistency, 10. Pattern Adherence, 11. Dependencies, 12. Build Compatibility |
| 5 | Structure & Layout | 13. Route & Layout Chain, 14. Structural Anti-Patterns |
| 6 | Stack/Platform/Docs | 15. Stack-Specific, 16. Platform-Specific, 17. Project Gotchas, 18. Documentation Compliance |

**Verification depth filtering:** Before dispatching, consult the Verification Depth table below. Only dispatch batches containing at least one applicable category for the design's scope. Pass the list of applicable categories to each agent so it skips non-applicable categories within its batch.

#### Dispatch

Use the Task tool with `subagent_type=Explore` and `model: sonnet` for Batches 1-5. Launch all applicable batch agents in a **single message** to run them concurrently. Announce: "Dispatching N verification agents in parallel..."

**Context passed to each agent:**
- The full design document content
- Its assigned checklist categories (partitioned from `references/checklist.md` using batch markers)
- The codebase exploration results from Step 3
- The `.spec-driven.yml` content (for stack/platform/gotchas context)
- The list of applicable categories for this batch (from verification depth filtering)

**Expected return format per agent:**

Each agent returns a list of results, one per category checked:
```
[{ category: string, status: "PASS" | "FAIL" | "WARNING", finding: string }]
```

#### Batch 6 — Conditional Dispatch

Batch 6 (Stack/Platform/Docs) is only dispatched if `.spec-driven.yml` exists with a non-empty `stack`, `platform`, or `gotchas` field, or if Context7 is available. If none of these conditions are met, skip Batch 6 entirely. When the conditions are met, use the Task tool with `subagent_type=Explore` and `model: sonnet` for Batch 6 and include it in the same single-message launch as Batches 1-5 so all agents run concurrently.

**Context passed to the Batch 6 agent:**
- The full design document content
- The check instructions for categories 15-18 (defined inline below in this SKILL.md, not from checklist.md)
- The codebase exploration results from Step 3
- The `.spec-driven.yml` content (stack, platform, gotchas, context7 field)
- The list of applicable categories for this batch (from verification depth filtering)

Batch 6 sources its check instructions from this SKILL.md (not from checklist.md):

15. **Stack-Specific Checks** — Run every check from the loaded stack reference files (e.g., Supabase PostgREST limits, Next.js server/client boundaries)
16. **Platform-Specific Checks** — Run checks from the platform reference file (e.g., mobile backward compatibility, feature flag requirements)
17. **Project Gotchas** — Check every entry in `.spec-driven.yml` `gotchas` against the design. Each gotcha is a mandatory verification item.
18. **Documentation Compliance (Context7)** — If `.spec-driven.yml` has a `context7` field and the Context7 MCP plugin is available, verify the design uses current patterns from official documentation. Query relevant Context7 libraries for the specific patterns the design proposes (auth flows, data fetching, client setup, etc.) and check for:
    - [ ] **Current API patterns:** Design uses the latest recommended patterns, not deprecated approaches
    - [ ] **Correct client setup:** Supabase/framework clients are initialized following current docs (e.g., `@supabase/ssr` with `getAll`/`setAll`, not legacy `auth-helpers`)
    - [ ] **Proper error handling:** Error patterns match current framework conventions (e.g., Server Actions return `{ errors }`, not throw)
    - [ ] **No deprecated APIs:** Design doesn't rely on APIs marked as deprecated in current docs

    If Context7 is not available, skip category 18 and note: "Context7 not available — documentation compliance check skipped."

#### Failure Handling

If an agent fails or crashes, retry it once. If it fails again, skip it and log a warning: "Batch N ([agent name]) failed — categories X-Y skipped. Continuing with available results." Do not stall verification for a single agent failure.

#### Consolidation

After all agents complete, merge results into the unified report table (same format as Step 5). Sort by category number. If a batch was skipped due to failure, add each of its categories to the report as status "SKIPPED" with finding: "Verification agent failed after retry — this category was NOT checked." In the summary, count SKIPPED categories separately and add a warning: "N categories could not be verified. Review these areas manually before proceeding."

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
