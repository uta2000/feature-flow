# Explicit Discuss Phase for Design Preferences — Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Add design preferences preamble to orchestration-overrides.md — STATUS: complete
Task 2: Add design_preferences schema to project-context-schema.md — STATUS: complete
Task 3: Update Skill Mapping in SKILL.md — STATUS: complete
Task 4: Add category 24 to design-verification checklist — STATUS: complete
CURRENT: none (all tasks complete)
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.
> Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

**Goal:** Add a design preferences preamble to feature-flow's brainstorming skill lifecycle and a compliance category to design verification, capturing project-wide API/error/state patterns before feature design begins.

**Architecture:** The preamble is injected by the start lifecycle orchestrator via `orchestration-overrides.md` (read during brainstorming invocation). Storage uses `.feature-flow.yml` under a `design_preferences` key. Design verification gains a new Category 24 in `checklist.md` that checks compliance.

**Tech Stack:** Markdown skill files, YAML config schema (no code — all changes are to feature-flow plugin documentation files)

---

### Task 1: Add design preferences preamble to orchestration-overrides.md

**Files:**
- Modify: `skills/start/references/orchestration-overrides.md` (118 lines — NOT design-first)

**Step 1: Read the full file**

Read `skills/start/references/orchestration-overrides.md` completely to understand the current structure. Note the insertion point: the new subsection goes inside `## Brainstorming Interview Format Override`, after the existing "Rules:" block and before the "**YOLO behavior:**" paragraph.

**Step 2: Output change plan**

Before editing, output your change plan:
- Existing structure: `## Brainstorming Interview Format Override` contains required format block, rules list, then YOLO/Express behavior
- Insertion: new `### Design Preferences Preamble` subsection between the Rules block and the YOLO behavior paragraph
- The YOLO inference logic (5 codebase scan methods) lives HERE (not in yolo-overrides.md) — all brainstorming YOLO behavior stays in one file

**Step 3: Insert the Design Preferences Preamble subsection**

Insert the following content after the "**Rules:**" bullet list and before the "**YOLO behavior:** When YOLO **or Express** mode is active" paragraph in `## Brainstorming Interview Format Override`:

```markdown
### Design Preferences Preamble

For **Feature** and **Major Feature** scopes only, before asking any feature-specific design questions, run the following preamble:

**Trigger condition:**
1. Read `design_preferences` from `.feature-flow.yml`
2. If `design_preferences` key is **present** → load silently; inject preferences as context for feature questions; skip to feature-specific brainstorming
3. If `design_preferences` key is **absent** (or `.feature-flow.yml` cannot be read — fail-open) → proceed to capture the 5 preference questions below

**The 5 preference questions:**

Ask one at a time in interactive mode. Use the brainstorming interview format (question / *Why this matters:* / options with *Recommended*). Mark the recommended option based on codebase scan results (see YOLO inference below for the scan methods). Each question has an "Other (describe)" escape hatch.

#### Q1: Error handling pattern *(universal — all stacks)*

**What error handling pattern does this project use?**
*Why this matters:* Consistency in error handling prevents mixed patterns that confuse future contributors and make error tracing harder.
- **Option A: Return Result/Either types** — e.g., `return { ok: true, value: data }` or `Result<T, E>`
- **Option B: Throw exceptions with error boundaries** — e.g., `throw new AppError('...')`; caught at boundary
- **Option C: Return error objects `{ success, error }`** — e.g., `return { success: false, error: 'msg' }`
- **Option D: Mixed** — throw for unexpected system errors, return for expected user errors

#### Q2: API style for new endpoints

**What API style does this project use for new endpoints?**
*Why this matters:* Mixing REST routes with server actions or RPC functions creates inconsistent API surfaces.
- **Option A: REST with resource routes** — e.g., `app/api/users/route.ts` returning JSON
- **Option B: GraphQL mutations/queries** — e.g., `mutation CreateUser { ... }`
- **Option C: Server actions** *(shown only when `stack` includes `next-js`)* — e.g., `'use server'; export async function createUser()`
- **Option D: RPC-style functions** — e.g., `api.users.create(data)` called directly
- **Option E: tRPC** *(shown only when `stack` includes `typescript` or `trpc`)* — e.g., `trpc.users.create.useMutation()`

#### Q3: State management

**How does this project manage client-side state?**
*Why this matters:* Using the wrong state layer causes unnecessary re-renders or stale data bugs.
- **Option A: Local component state + props** — e.g., `useState` + prop drilling
- **Option B: Global store** — e.g., Zustand, Redux, Jotai
- **Option C: Server state (React Query/SWR)** *(shown only when `stack` includes `react` or `next-js`)* — e.g., `useQuery`, `useSWR`
- **Option D: URL state (search params)** — e.g., `useSearchParams`
- **Option E: Context + hooks** *(shown only when `stack` includes `react` or `next-js`)* — e.g., `createContext` + `useContext`

*Stack filtering:* If `stack` contains none of `react`, `next-js`, `svelte`, `vue`, `angular` (backend-only project), options C and E are hidden.

#### Q4: Testing approach *(universal — all stacks)*

**What level of test coverage does this project target?**
*Why this matters:* Writing tests at the wrong level wastes time or leaves critical paths uncovered.
- **Option A: Unit tests only** — functions/modules tested in isolation
- **Option B: Unit + integration** — units tested, plus service-level integration tests
- **Option C: Unit + integration + e2e** — full coverage pyramid
- **Option D: Match existing coverage level** — don't expand or reduce coverage

#### Q5: UI component pattern *(skip for backend-only stacks)*

Skip Q5 entirely if `stack` contains none of `react`, `next-js`, `svelte`, `vue`, `angular`.

**What UI component pattern does this project use?**
*Why this matters:* Mixing Tailwind with CSS Modules creates an inconsistent styling codebase.
- **Option A: Existing component library only** — e.g., shadcn/ui, MUI, Radix
- **Option B: Tailwind utility classes** — e.g., `className="flex items-center gap-2"`
- **Option C: CSS modules** — e.g., `styles.container`
- **Option D: Styled-components** *(shown only when `stack` includes `react` or `next-js`)*
- **Option E: Match existing pattern** — detect and replicate whatever exists

**After all questions:**

Write answers to `.feature-flow.yml` under `design_preferences`. Storage schema:

```yaml
design_preferences:
  error_handling: result_types        # result_types | exceptions | error_objects | mixed | <free-text>
  api_style: rest                     # rest | graphql | server_actions | rpc | trpc | <free-text>
  state_management: server_state      # local | global_store | server_state | url_state | context_hooks | <free-text>
  testing: unit_integration           # unit | unit_integration | unit_integration_e2e | match_existing | <free-text>
  ui_pattern: tailwind                # component_library | tailwind | css_modules | styled_components | match_existing | <free-text>
```

Rules:
- "Other (describe)" → store free-text as the value; design-verification treats free-text as advisory (no compliance check)
- Stack-filtered question hidden → omit that key entirely
- User declines all questions → no `design_preferences` key written → preamble fires again next feature/major-feature run
- No `enabled` flag: presence of key = active, absence = preamble fires
- Write failure (interactive): announce warning and continue without persisting — preferences will be asked again next session

**Per-feature override:**

During brainstorming, the user can say "for this feature, use REST instead of server actions." Inject the override into current session brainstorming context. Pass it to the design document step as session-level context. **Do NOT write it back to `.feature-flow.yml`.**

**Preamble scope boundary:**

The preamble fires ONLY when brainstorming is invoked through the start lifecycle orchestrator (which reads this file). Direct invocations of `superpowers:brainstorming` bypass the preamble — this is intentional.

**YOLO/Express inference (first run — no preferences exist):**

When YOLO or Express mode is active and `design_preferences` is absent, scan the codebase to infer dominant patterns across all 5 categories. For Express mode, substitute `Express:` for `YOLO:` in all announcements.

Inference methods:
1. **Error handling:** Count occurrences of `Result<`, `Either<` (result_types) vs `try/catch`, `catch(` (exceptions) vs `{ success:`, `{ error:` (error_objects). Pick the dominant count.
2. **API style:** Check for `app/api/` directory (rest) vs `graphql` directories or `.graphql` files (graphql) vs `"use server"` string in files (server_actions) vs `.trpc.` in filenames (trpc). First match wins.
3. **State management:** Grep imports for `zustand` (global_store) vs `@tanstack/react-query` or `swr` (server_state) vs `createContext` (context_hooks) vs `useSearchParams` (url_state). Pick dominant import count.
4. **Testing:** Check test files for `supertest` or `request(app` (integration) vs `playwright` or `cypress` (e2e) vs `describe(`/`it(` only (unit). Presence of integration or e2e signals higher coverage level.
5. **UI pattern:** Check for `tailwind.config` (tailwind) vs `*.module.css` files (css_modules) vs `styled-components` imports (styled_components) vs component library imports (component_library). First detected wins.

Announcement formats:
- **Patterns found:** `YOLO: brainstorming — [category] preference → [detected_pattern] (inferred from N files/occurrences)`
- **No patterns found:** `YOLO: brainstorming — [category] preference → not detected (no matching patterns found — key omitted)`
- **Tie (equal counts):** `YOLO: brainstorming — [category] preference → [first-listed-pattern] (inferred — tied with [second-pattern] at N each; defaulting to first-listed)`

Write inferred preferences to `.feature-flow.yml` exactly like interactive answers.

**Write failure in YOLO mode:** Hold all inferred preferences in session context and include them in the design-doc step args. Announce: `YOLO: brainstorming — Preferences write failed → Holding in session context for this feature only`

**Subsequent runs (preferences exist):** Skip inference and preamble entirely — load silently from config. No announcement.
```

**Step 4: Verify the edit**

Run: `grep -n "Design Preferences Preamble\|YOLO: brainstorming\|design_preferences" skills/start/references/orchestration-overrides.md`
Expected: lines showing "### Design Preferences Preamble", "YOLO: brainstorming —", and "design_preferences"

**Step 5: Commit**

```bash
git add skills/start/references/orchestration-overrides.md
git commit -m "feat(preferences): add design preferences preamble to orchestration-overrides (#170) — ✓preamble section added with 5 questions, stack filtering, YOLO inference"
```

**Acceptance Criteria:**
- [ ] `design_preferences absent from .feature-flow.yml` measured by `grep -c "design_preferences" skills/start/references/orchestration-overrides.md` verified by `grep -c "design_preferences" skills/start/references/orchestration-overrides.md | grep -v "^0$"`
- [ ] 5 questions present (Q1–Q5) measured by section heading count verified by `grep -c "^#### Q[1-5]" skills/start/references/orchestration-overrides.md | grep "^5$"`
- [ ] Stack filtering guards present for server_actions, tRPC, React-specific options measured by keyword presence verified by `grep -c "next-js\|typescript.*trpc\|react.*next-js" skills/start/references/orchestration-overrides.md | grep -v "^0$"`
- [ ] YOLO announcement formats present (found/not-detected/tie) measured by format strings verified by `grep -c "not detected\|defaulting to first-listed\|Preferences write failed" skills/start/references/orchestration-overrides.md | grep "^3$"`
- [ ] Per-feature override "not written back" rule present measured by keyword verified by `grep -c "NOT write it back" skills/start/references/orchestration-overrides.md | grep "^1$"`
- [ ] Direct invocation scope boundary documented measured by keyword verified by `grep -c "Direct invocations.*bypass" skills/start/references/orchestration-overrides.md | grep "^1$"`
- [ ] Storage schema YAML block present measured by key presence verified by `grep -c "error_handling:\|api_style:\|state_management:\|testing:\|ui_pattern:" skills/start/references/orchestration-overrides.md | grep -v "^0$"`

**Quality Constraints:**
- Error handling: N/A — this is a markdown documentation file, no code error handling
- Types: N/A — YAML values are string; enum slugs documented in comments
- Function length: N/A — markdown content
- Pattern reference: Follow existing `orchestration-overrides.md` section format (## headings, #### sub-sections, bold labels, `code blocks` for YAML/announcements)
- Files modified: `skills/start/references/orchestration-overrides.md` (118 lines — NOT design-first)
- Design-first files: none for this task
- Parallelizable: yes

---

### Task 2: Add design_preferences schema to project-context-schema.md

**Files:**
- Modify: `references/project-context-schema.md` (251 lines — design-first)

**Step 1: Read the complete file**

Read `references/project-context-schema.md` fully before any edit.

**Step 2: Output change plan**

Before editing, output your change plan:
- Insert new `### \`design_preferences\`` section after `### \`knowledge_base\`` section (at approximately line 212)
- Update `## Schema` YAML block to include `design_preferences` entry (after `knowledge_base` block)
- Update `## How Skills Use This File → design-verification` bullet to add `design_preferences` read
- Update `## How Skills Use This File → start` bullets to add `design_preferences` write

**Step 3: Add design_preferences to the Schema YAML block**

Find the schema YAML block (starting with ` ```yaml ` near line 7). Insert after the `knowledge_base:` block (before the closing ` ``` `):

```yaml
design_preferences:    # Optional: project-wide design preference answers
  error_handling: result_types       # Captured by brainstorming preamble
  api_style: rest
  state_management: server_state
  testing: unit_integration
  ui_pattern: tailwind
```

**Step 4: Add `### \`design_preferences\`` field section**

Insert after the `### \`knowledge_base\`` section (after its "When absent" paragraph), before `## How Skills Use This File`:

```markdown
### `design_preferences`

Optional project-wide design preference answers, captured by the brainstorming preamble for Feature and Major Feature scopes. When present, preferences are silently loaded at the start of each brainstorming session and injected as context for feature-specific design questions.

**Sub-fields:**

| Field | Values | Description |
|-------|--------|-------------|
| `error_handling` | `result_types \| exceptions \| error_objects \| mixed \| <free-text>` | Error handling pattern used by the project |
| `api_style` | `rest \| graphql \| server_actions \| rpc \| trpc \| <free-text>` | API style for new endpoints |
| `state_management` | `local \| global_store \| server_state \| url_state \| context_hooks \| <free-text>` | Client-side state management approach |
| `testing` | `unit \| unit_integration \| unit_integration_e2e \| match_existing \| <free-text>` | Test coverage level |
| `ui_pattern` | `component_library \| tailwind \| css_modules \| styled_components \| match_existing \| <free-text>` | UI styling/component approach |

**Rules:**
- Free-text values (when user selects "Other (describe)"): stored as-is; treated as advisory in design-verification — no compliance check runs on free-text values
- Stack-filtered questions (e.g., Q5 skipped for backend-only stacks): key omitted entirely; missing keys skipped in verification
- No `enabled` flag — presence of key = active; absence = brainstorming preamble fires on next Feature/Major Feature run
- If user declines all 5 questions: no `design_preferences` key written → preamble fires again on next eligible run

**Format:**

```yaml
design_preferences:
  error_handling: result_types
  api_style: server_actions
  state_management: server_state
  testing: unit_integration
  ui_pattern: tailwind
```

**When absent:** The brainstorming preamble fires on the next Feature or Major Feature lifecycle run, capturing preferences interactively (or inferring via codebase scan in YOLO/Express mode). Quick fix and Small enhancement scopes never trigger the preamble.
```

**Step 5: Update "How Skills Use This File" — start section**

Add to the `### start (reads + writes)` bullet list:
```
- **Writes** `design_preferences` after the brainstorming preamble captures user answers (or YOLO/Express codebase inference). Writes only for Feature and Major Feature scopes. Does not write if user declines all questions.
- **Reads** `design_preferences` at the start of brainstorming: if present, loads silently and injects as context; if absent, fires the preferences preamble.
```

**Step 6: Update "How Skills Use This File" — design-verification section**

Add to the `### design-verification (reads + writes)` bullet list:
```
- **Reads** `design_preferences` to run Category 24 (Design Preferences Compliance) — verifying the design document uses declared patterns. Skips this category if `design_preferences` is absent.
```

Also update the existing note that says "base checklist (13 categories)" to say "base checklist (14 categories, plus Category 24 if design_preferences is present)".

**Step 7: Commit**

```bash
git add references/project-context-schema.md
git commit -m "feat(preferences): add design_preferences field to project-context-schema (#170) — ✓schema field documented with sub-fields, rules, and skills usage"
```

**Acceptance Criteria:**
- [ ] `design_preferences` key present in Schema YAML block measured by `grep -c "design_preferences:" references/project-context-schema.md` verified by `grep -c "design_preferences:" references/project-context-schema.md | grep -v "^0$"`
- [ ] `### \`design_preferences\`` section present measured by heading existence verified by `grep -c "^### \`design_preferences\`" references/project-context-schema.md | grep "^1$"`
- [ ] All 5 sub-fields documented (error_handling, api_style, state_management, testing, ui_pattern) measured by field count in table verified by `grep -c "error_handling\|api_style\|state_management\|testing\|ui_pattern" references/project-context-schema.md | grep -v "^0$"`
- [ ] "No enabled flag" rule documented measured by keyword presence verified by `grep -c "No \`enabled\` flag\|No enabled flag" references/project-context-schema.md | grep "^1$"`
- [ ] start section updated with design_preferences read+write bullets measured by keyword presence verified by `grep -c "design_preferences" references/project-context-schema.md | grep -v "^[012]$"`
- [ ] design-verification section updated measured by keyword presence verified by `grep -A5 "design-verification" references/project-context-schema.md | grep -c "design_preferences" | grep "^1$"`
- [ ] Edge: "When absent" behavior documented measured by keyword presence verified by `grep -c "When absent" references/project-context-schema.md | grep -v "^0$"`

**Quality Constraints:**
- Error handling: N/A — documentation file
- Types: N/A — YAML string values documented in table
- Function length: N/A — markdown
- Pattern reference: Follow existing `### \`field_name\`` format with Sub-fields table, Rules list, Format YAML block, When absent paragraph — same pattern as `notifications` and `knowledge_base` sections
- Files modified: `references/project-context-schema.md` (251 lines — design-first)
- Design-first files: `references/project-context-schema.md` — read fully before editing; output change plan before any Edit call
- Parallelizable: yes

---

### Task 3: Update Skill Mapping in SKILL.md

**Files:**
- Modify: `skills/start/SKILL.md` (788 lines — design-first)

**Step 1: Read the Skill Mapping section**

Use `Read` with offset/limit to read only the Skill Mapping section (approximately lines 629–660). Do not read the full 788-line file unless the section isn't where expected.

**Step 2: Output change plan**

Before editing, output your change plan:
- Target: the "Brainstorm requirements" row in the Skill Mapping table (line ~633)
- Current value in "Expected Output" column: `Decisions on scope, approach, UX`
- New value: append a note about the preferences preamble for Feature/Major Feature scopes

**Step 3: Update the Brainstorm requirements row**

Find the exact table row:
```
| Brainstorm requirements | `superpowers:brainstorming` | Decisions on scope, approach, UX |
```

Replace with:
```
| Brainstorm requirements | `superpowers:brainstorming` | Decisions on scope, approach, UX. **For Feature and Major Feature scopes:** brainstorming includes the design preferences preamble — captures or loads project-wide design preferences before feature-specific questions begin. See `references/orchestration-overrides.md` → "Design Preferences Preamble". |
```

**Step 4: Verify the edit**

Run: `grep -n "design preferences preamble\|Brainstorm requirements" skills/start/SKILL.md`
Expected: one line showing "Brainstorm requirements" with "design preferences preamble" in the same row

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat(preferences): update Skill Mapping to note preferences preamble (#170) — ✓brainstorming row updated for Feature/Major Feature scopes"
```

**Acceptance Criteria:**
- [ ] "design preferences preamble" text present in Brainstorm requirements row measured by grep verified by `grep "Brainstorm requirements" skills/start/SKILL.md | grep -c "design preferences preamble" | grep "^1$"`
- [ ] Reference to orchestration-overrides.md present in the row measured by keyword verified by `grep "Brainstorm requirements" skills/start/SKILL.md | grep -c "orchestration-overrides" | grep "^1$"`
- [ ] Only one row modified (no other table rows changed) measured by diff line count verified by `git diff HEAD -- skills/start/SKILL.md | grep "^[+-]" | grep -v "^---\|^+++" | wc -l | grep "^[12]$"`
- [ ] Edge: table markdown valid (pipes balanced) measured by row structure verified by `grep "Brainstorm requirements" skills/start/SKILL.md | grep -c "^|" | grep "^1$"`

**Quality Constraints:**
- Error handling: N/A — documentation file
- Types: N/A — markdown text
- Function length: N/A — single row edit
- Pattern reference: Follow existing Skill Mapping table row format — inline note style with `**Bold:**` emphasis and backtick file references, matching the create-issue and worktree-setup rows which also carry inline notes
- Files modified: `skills/start/SKILL.md` (788 lines — design-first)
- Design-first files: `skills/start/SKILL.md` — use Read with offset/limit to target the Skill Mapping section (~lines 629–660); output change plan before any Edit call
- Parallelizable: yes

---

### Task 4: Add category 24 to design-verification checklist

**Files:**
- Modify: `skills/design-verification/references/checklist.md` (258 lines — design-first)

**Step 1: Read the complete file**

Read `skills/design-verification/references/checklist.md` fully before any edit.

**Step 2: Output change plan**

Before editing, output your change plan:
- Update the batch comment at top of file (lines 3–11): add `Batch 8 (Design Preferences): Category 24` line
- Append at end of file: `<!-- batch: 8 -->` comment, then `## 24. Design Preferences Compliance` section

**Step 3: Update the batch comment at top of file**

Find the existing batch comment block:
```
<!-- Verification Batches:
  Batch 1 (Schema & Types): Categories 1-2
  Batch 2 (Pipeline & Components): Categories 3-5
  Batch 3 (Quality & Safety): Categories 6-8
  Batch 4 (Patterns & Build): Categories 9-12
  Batch 5 (Structure & Layout): Categories 13-14
  Batch 6 (Stack/Platform/Docs): Categories 15-18 (defined in SKILL.md, not here)
  Batch 7 (Implementation Quality): Categories 19-23 (defined in SKILL.md, not here)
-->
```

Replace with:
```
<!-- Verification Batches:
  Batch 1 (Schema & Types): Categories 1-2
  Batch 2 (Pipeline & Components): Categories 3-5
  Batch 3 (Quality & Safety): Categories 6-8
  Batch 4 (Patterns & Build): Categories 9-12
  Batch 5 (Structure & Layout): Categories 13-14
  Batch 6 (Stack/Platform/Docs): Categories 15-18 (defined in SKILL.md, not here)
  Batch 7 (Implementation Quality): Categories 19-23 (defined in SKILL.md, not here)
  Batch 8 (Design Preferences): Category 24
-->
```

**Step 4: Append category 24 at end of file**

Append the following content at the very end of `checklist.md` (after the last line of category 14):

```markdown

<!-- batch: 8 -->
## 24. Design Preferences Compliance

*This category is skipped entirely if `design_preferences` is absent from `.feature-flow.yml`.*

For each key present in `design_preferences` (excluding free-text values — identified by checking whether the value matches any known enum slug for that field):

- [ ] **Error handling compliance:** Design uses the declared `error_handling` pattern (e.g., if `result_types`, design returns typed Result objects; if `exceptions`, design throws at boundaries)
- [ ] **API style compliance:** New endpoints or data-fetching in design match the declared `api_style` (e.g., if `rest`, design uses resource routes; if `server_actions`, design uses `"use server"` functions)
- [ ] **State management compliance:** Client-side state in design matches declared `state_management` (e.g., if `server_state`, design uses React Query/SWR; if `global_store`, design uses Zustand/Redux)
- [ ] **Testing compliance:** Proposed test coverage in design matches declared `testing` level (e.g., if `unit_integration`, design specifies both unit and integration tests)
- [ ] **UI pattern compliance:** UI styling approach in design matches declared `ui_pattern` (e.g., if `tailwind`, design uses utility classes; if `css_modules`, design uses `.module.css` files)

**Compliance levels:**
- **Match** → PASS
- **Mismatch with explicit acknowledgment** in design doc (e.g., "Using REST here instead of server actions because the endpoint is consumed by a third party") → PASS with informational note
- **Mismatch without acknowledgment** → WARNING: "Design uses [detected_pattern] but project preference is [declared_preference]. Add a deviation note or update the preference in `.feature-flow.yml`."

**Slug recognition for compliance checking:**
Free-text values are identified when the stored value does not match any of the known slugs for that field. For each field, the known slugs are:
- `error_handling`: result_types, exceptions, error_objects, mixed
- `api_style`: rest, graphql, server_actions, rpc, trpc
- `state_management`: local, global_store, server_state, url_state, context_hooks
- `testing`: unit, unit_integration, unit_integration_e2e, match_existing
- `ui_pattern`: component_library, tailwind, css_modules, styled_components, match_existing

**Where to look:**
- `.feature-flow.yml` → `design_preferences` field
- Design document's "Patterns & Constraints" section
- Design document's "API / Integration" or "Pipeline / Architecture" sections
- Design document's "New Components" or "UI Adaptations" sections for UI pattern
- Design document's "Scope" section for explicitly acknowledged deviations

**Common findings:**
- Design proposes a GraphQL mutation when `api_style: rest` — if intentional, add "Deviation: using GraphQL for this endpoint because..." to the design doc
- Design uses local state when `state_management: server_state` — common when adding a simple UI affordance that doesn't need server sync; acknowledge explicitly
- Design skips integration tests when `testing: unit_integration` — if the feature has no external calls, acknowledge that unit-only is appropriate for this feature
```

**Step 5: Verify the edit**

Run: `grep -n "batch: 8\|Category 24\|Design Preferences Compliance" skills/design-verification/references/checklist.md`
Expected: 3 lines showing the batch comment, the heading, and references to Category 24

**Step 6: Commit**

```bash
git add skills/design-verification/references/checklist.md
git commit -m "feat(preferences): add category 24 Design Preferences Compliance to checklist (#170) — ✓category 24 appended as Batch 8 with compliance logic and slug recognition"
```

**Acceptance Criteria:**
- [ ] Batch 8 comment added to batch comment block measured by grep verified by `grep -c "Batch 8 (Design Preferences): Category 24" skills/design-verification/references/checklist.md | grep "^1$"`
- [ ] `<!-- batch: 8 -->` marker present measured by grep verified by `grep -c "batch: 8" skills/design-verification/references/checklist.md | grep "^1$"`
- [ ] `## 24. Design Preferences Compliance` heading present measured by grep verified by `grep -c "^## 24\. Design Preferences Compliance" skills/design-verification/references/checklist.md | grep "^1$"`
- [ ] All 5 compliance checkboxes present (error_handling, api_style, state_management, testing, ui_pattern) measured by checkbox count verified by `grep -c "^- \[ \].*compliance:" skills/design-verification/references/checklist.md | grep "^5$"`
- [ ] Slug recognition table for all 5 fields present measured by slug list count verified by `grep -c "result_types, exceptions\|rest, graphql\|local, global_store\|unit, unit_integration\|component_library, tailwind" skills/design-verification/references/checklist.md | grep "^5$"`
- [ ] "Where to look" and "Common findings" subsections present measured by heading count verified by `grep -c "^\*\*Where to look\|\*\*Common findings" skills/design-verification/references/checklist.md | grep -v "^0$"`
- [ ] Skip condition documented (absent design_preferences) measured by skip note presence verified by `grep -c "skipped entirely if" skills/design-verification/references/checklist.md | grep "^1$"`
- [ ] Existing categories 1-14 unchanged measured by first batch comment unchanged verified by `grep -c "Batch 1 (Schema & Types): Categories 1-2" skills/design-verification/references/checklist.md | grep "^1$"`

**Quality Constraints:**
- Error handling: N/A — documentation file
- Types: N/A — markdown
- Function length: N/A — category append
- Pattern reference: Follow existing checklist category format: `<!-- batch: N -->` comment, `## N. Category Name` heading, `*italic trigger note*`, `- [ ]` checkbox items with bold labels, **Compliance levels:**, **Where to look:**, **Common findings:** subsections
- Files modified: `skills/design-verification/references/checklist.md` (258 lines — design-first)
- Design-first files: `skills/design-verification/references/checklist.md` — read fully before editing; output change plan before any Edit call
- Parallelizable: yes
