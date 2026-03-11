# Context Filtering for Design Verification Agents — Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Restructure Step 3 to produce tagged exploration results — STATUS: done (commit d113350)
Task 2: Update Step 4 dispatch to filter context per batch — STATUS: done (commit 2c5af8d)
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.
> Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

**Goal:** Replace the single flat exploration dump in Step 3 with 5 tagged exploration domains, and update Step 4 to pass only domain-relevant context to each verification batch agent.

**Architecture:** Step 3 dispatches 5 parallel Explore agents (one per domain) and aggregates results into a structured `exploration_results` object keyed by domain tag. Step 4 batch dispatch is updated to include only the relevant tagged sections per a context filter map, while still passing the full design document and checklist categories unchanged.

**Tech Stack:** Markdown skill file (no compilation, no runtime). Changes are text edits to `skills/design-verification/SKILL.md`.

---

## Task 1: Restructure Step 3 to produce tagged exploration results

**Files:**
- Modify: `skills/design-verification/SKILL.md` (design-first — 280 lines)

**Acceptance Criteria:**
- [ ] Step 3 dispatches 5 parallel Explore agents (schema, pipeline, ui, config, patterns) in a **single message**
- [ ] Each domain agent's scope is precisely defined (which files/paths it explores)
- [ ] Step 3 defines the `exploration_results` aggregation object with the 5 domain keys
- [ ] The expected return format per agent is documented (domain tag + content string)
- [ ] The old single-dump exploration description is removed and replaced by the tagged approach
- [ ] Edge case: if a domain agent finds no relevant files for the project, it returns an empty content string (documented)

**Quality Constraints:**
- Error handling: If a domain agent fails, retry once and use empty string for that domain (document this in the skill)
- Pattern reference: Follow the Task dispatch pattern already used in Step 4 (existing model: "haiku" for Explore agents)
- Function length: N/A (markdown prose, not code)
- Files modified: `skills/design-verification/SKILL.md` (design-first — 280 lines)
- Design-first files: `skills/design-verification/SKILL.md` — output change plan before editing
- Parallelizable: no

**Step 1: Read the full file and output change plan**

Read `skills/design-verification/SKILL.md` in full. The Step 3 section is at lines 54–65 and currently reads:

```
### Step 3: Explore the Codebase

Launch exploration agents to understand the areas of the codebase affected by the design. Use the Task tool with `subagent_type: "Explore"` and `model: "haiku"` (see `../../references/tool-api.md` — Task Tool) for thorough analysis.

Key areas to explore:
- Database schema (migrations, ORM models, type definitions)
- TypeScript/language types and interfaces
- Existing pipeline/workflow hooks and API routes
- UI components that will be modified or reused
- Configuration files and environment variables
```

**Change plan:** Replace the heading + 9 lines above with the tagged-domain exploration approach that dispatches 5 parallel domain agents and aggregates results into `exploration_results`.

**Step 2: Apply the edit — replace Step 3 content**

Use Edit with the following old_string → new_string:

old_string:
```
### Step 3: Explore the Codebase

Launch exploration agents to understand the areas of the codebase affected by the design. Use the Task tool with `subagent_type: "Explore"` and `model: "haiku"` (see `../../references/tool-api.md` — Task Tool) for thorough analysis.

Key areas to explore:
- Database schema (migrations, ORM models, type definitions)
- TypeScript/language types and interfaces
- Existing pipeline/workflow hooks and API routes
- UI components that will be modified or reused
- Configuration files and environment variables
```

new_string:
```
### Step 3: Explore the Codebase (Tagged Domains)

Launch parallel exploration agents to understand the areas affected by the design. Organize results into 5 tagged domains so each verification batch (Step 4) receives only its relevant context instead of the full exploration dump.

Use the Task tool with `subagent_type: "Explore"` and `model: "haiku"` (see `../../references/tool-api.md` — Task Tool).

Dispatch all 5 domain agents in a **single message** (parallel):

1. **Schema agent** — Migration files, ORM models, type definition files (`*.d.ts`, `types.ts`), `tsconfig.json`
2. **Pipeline agent** — API route files, hook files, pipeline files, shared type consumers
3. **UI agent** — Component files, layout files, navigation components
4. **Config agent** — `tsconfig.json`, eslint config, `next.config.*`, `package.json`
5. **Patterns agent** — Directory structure (2-3 representative paths), naming convention samples (2-3 files), error handling examples

**Expected return format per agent:**
```
{ domain: "schema" | "pipeline" | "ui" | "config" | "patterns", content: string }
```

**Failure handling:** If an agent fails, retry it once. If it fails again, use an empty string for that domain's content and log a warning: "[domain] exploration failed — that domain's context will be absent from relevant batch agents."

**Aggregate results into `exploration_results`:**
```
exploration_results = {
  schema:   <content from schema agent>,
  pipeline: <content from pipeline agent>,
  ui:       <content from ui agent>,
  config:   <content from config agent>,
  patterns: <content from patterns agent>
}
```
```

**Step 3: Verify the edit**

Read the file at lines 54–95 and confirm:
- Heading says "Tagged Domains"
- 5 agents are listed with precise scope descriptions
- `exploration_results` aggregation object is defined
- Failure handling is documented
- Old bullet list ("Database schema", "TypeScript/language types") is gone

**Step 4: Commit**

```bash
git add skills/design-verification/SKILL.md
git commit -m "feat(design-verification): Step 3 — tagged exploration domains — ✓5 domain agents dispatched in parallel"
```

---

## Task 2: Update Step 4 dispatch to filter context per batch

**Files:**
- Modify: `skills/design-verification/SKILL.md` (design-first — 280 lines, updated by Task 1)

**Acceptance Criteria:**
- [ ] The "Context passed to each agent" block in Step 4 is replaced with the context filter map table
- [ ] Each of the 7 batches has a clearly defined subset of `exploration_results` domains listed
- [ ] Every batch still receives: full design document, assigned checklist categories, `.feature-flow.yml` content, applicable category list (these are listed as universal items)
- [ ] Batch 6 note clarifies it receives `.feature-flow.yml` + stack reference files (no exploration_results domains — it operates on config/docs, not codebase exploration)
- [ ] The generic "The codebase exploration results from Step 3" line is removed from the universal context list
- [ ] Edge case: if a domain in `exploration_results` is empty (agent failed), the batch still receives it — the empty string is a valid (safe) value

**Quality Constraints:**
- Error handling: Empty domain strings are passed safely — no conditional logic needed (documented in Step 3 failure handling)
- Pattern reference: Follow the table format already used in the Batch dispatch table in Step 4
- Function length: N/A (markdown prose)
- Files modified: `skills/design-verification/SKILL.md` (design-first — see Task 1 change)
- Design-first files: `skills/design-verification/SKILL.md` — output change plan before editing
- Parallelizable: no

**Step 1: Read current Step 4 context block and output change plan**

The current "Context passed to each agent" block (lines ~87-93) reads:

```
**Context passed to each agent:**
- The full design document content
- Its assigned checklist categories (partitioned from `references/checklist.md` using batch markers)
- The codebase exploration results from Step 3
- The `.feature-flow.yml` content (for stack/platform/gotchas context)
- The list of applicable categories for this batch (from verification depth filtering)
```

**Change plan:** Replace the 3rd bullet ("The codebase exploration results from Step 3") with a reference to the context filter map table, and add the filter map table immediately after the context block.

**Step 2: Apply the edit — replace the generic context block**

old_string:
```
**Context passed to each agent:**
- The full design document content
- Its assigned checklist categories (partitioned from `references/checklist.md` using batch markers)
- The codebase exploration results from Step 3
- The `.feature-flow.yml` content (for stack/platform/gotchas context)
- The list of applicable categories for this batch (from verification depth filtering)
```

new_string:
```
**Context passed to each agent:**

Every batch always receives:
- The full design document content
- Its assigned checklist categories (partitioned from `references/checklist.md` using batch markers)
- The `.feature-flow.yml` content (for stack/platform/gotchas context)
- The list of applicable categories for this batch (from verification depth filtering)

Plus the filtered exploration sections from `exploration_results` (produced by Step 3) per the **Context Filter Map**:

| Batch | `exploration_results` sections included |
|-------|----------------------------------------|
| 1 — Schema & Types | `schema` |
| 2 — Pipeline & Components | `pipeline` + `ui` |
| 3 — Quality & Safety | `schema` + `config` (package.json portion) + `patterns` |
| 4 — Patterns & Build | `patterns` + `config` |
| 5 — Structure & Layout | `ui` |
| 6 — Stack/Platform/Docs | *(no exploration_results sections — receives `.feature-flow.yml` and stack reference files only)* |
| 7 — Implementation Quality | `schema` + `patterns` |
```

**Step 3: Verify the edit**

Read the file at the Step 4 dispatch section and confirm:
- The old single-line "The codebase exploration results from Step 3" bullet is gone
- The context filter map table is present with all 7 batches
- Batch 6 is marked as receiving no exploration_results sections
- The universal context items (design doc, checklist categories, .feature-flow.yml, applicable categories) are still listed

**Step 4: Commit**

```bash
git add skills/design-verification/SKILL.md
git commit -m "feat(design-verification): Step 4 — context filter map per batch — ✓each batch receives only relevant exploration domains"
```
