# Orchestration Overrides

**Usage:** Read the relevant section when reaching the corresponding lifecycle step. These override default skill behaviors when invoked from the lifecycle orchestrator.

---

## Brainstorming Interview Format Override

When invoking `superpowers:brainstorming` from this lifecycle, pass these formatting instructions as context. Every interview question presented to the user must follow this format:

**Required format for each question:**

```
**[Question in plain English]**
*Why this matters:* [1 sentence explaining impact on the design]
- **Option A** — e.g., [concrete example]. *Recommended: [1 sentence reasoning]*
- **Option B** — e.g., [concrete example]
- **Option C** — e.g., [concrete example] (if applicable)
```

**Rules:**
- Always lead with the recommended option and mark it with `*Recommended*`
- Each option must include a concrete example showing what it means in practice (e.g., "like ESLint running on every save" not just "run on save")
- The "Why this matters" line should explain what downstream impact the choice has (e.g., "this determines whether validation errors surface during editing or only at commit time")
- Keep it concise — one line for the explanation, one line per option
- If there is no clear recommendation, say "*No strong preference — depends on [factor]*" instead of forcing a pick

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
- **Option C: Server state (React Query/SWR)** *(shown only when `stack` includes a frontend framework — `react`, `next-js`, `svelte`, `vue`, or `angular`)* — e.g., `useQuery`, `useSWR`
- **Option D: URL state (search params)** — e.g., `useSearchParams`
- **Option E: Context + hooks** *(shown only when `stack` includes a frontend framework — `react`, `next-js`, `svelte`, `vue`, or `angular`)* — e.g., `createContext` + `useContext`

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
- User declines all questions (says "skip preferences" before Q1, or explicitly passes on every individual question without providing an answer) → no `design_preferences` key written → preamble fires again next feature/major-feature run
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

**Write failure in YOLO/Express mode:** Hold all inferred preferences in session context and include them in the design-doc step args. Announce: `YOLO: brainstorming — Preferences write failed → Holding in session context for this feature only` (substitute `Express:` for Express mode)

**Subsequent runs (preferences exist):** Skip inference and preamble entirely — load silently from config. No announcement.

**YOLO behavior:** When YOLO **or Express** mode is active (i.e., `yolo: true` or `express: true` is in the brainstorming args — for Express mode, substitute `Express:` for `YOLO:` in all inline announcements):

The brainstorming skill is designed for interactive use — it asks questions one at a time, proposes approaches for discussion, and checks in after each section. In YOLO mode, there is no human in the loop to answer these questions, so interactive prompts would stall the lifecycle. Skip all interactive prompts from the brainstorming skill (questions, approach proposals, section check-ins, "Ready to set up for implementation?") and self-answer design decisions instead.

How to proceed:
1. Analyze the feature description, issue context (if linked), and codebase to identify the key design questions
2. Self-answer each question using available context — issue body, issue comments, codebase patterns, and existing conventions
3. For each self-answered question, announce: `YOLO: brainstorming — [question summary] → [selected option with reasoning]`
4. After self-answering all questions, present the design as a single block rather than breaking it into sections with check-in prompts
5. Skip the "Ready to set up for implementation?" prompt — the lifecycle continues automatically to the next step
6. Ensure all self-answered decisions are captured when passing context to the design document step
7. **After outputting the brainstorming results, immediately call `TaskUpdate` to mark brainstorming complete.** *(Turn Bridge Rule applies.)*

This is the most complex YOLO interaction — the LLM makes design-level decisions. The user reviews these via the design document output rather than each micro-decision.

## Express Design Approval Checkpoint

When Express mode is active and the scope is **Feature** or **Major Feature**, present a design approval checkpoint after the design document step (or design verification step if present). This checkpoint pauses Express mode for the user to review the design before implementation begins.

**Checkpoint format:**

```
Express checkpoint: Design document complete. Review the design before implementation begins.
Continue or adjust?
```

Use `AskUserQuestion` with options:
- "Continue" with description: "Approve the design and resume Express mode — implementation will begin immediately"
- "Let me adjust" with description: "Provide corrections in freeform text — the document will be updated, then Express resumes"

**Scope filtering:**
- Quick fix / Small enhancement: No design approval checkpoint (too small)
- Feature / Major feature: Design approval checkpoint shown

This checkpoint is owned by the `design-document` skill when invoked with `express: true`. The orchestrator does not present a separate checkpoint — it is handled inside the skill invocation. This is separate from context window checkpoints and fires at a different lifecycle moment (after design, not at phase transitions).
