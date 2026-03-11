# Explicit Discuss Phase for Design Preferences — Design Document

**Date:** 2026-03-10
**Status:** Draft
**Issue:** #170

## Overview

This feature adds a **preferences preamble** inside the brainstorming skill for Feature and Major Feature scopes. Before asking feature-specific design questions, the preamble checks `.feature-flow.yml` for stored `design_preferences`. If absent, it captures five project-wide preferences (error handling, API style, state management, testing approach, UI pattern) via multiple-choice questions with stack-filtered options. Stored preferences persist for all future features. In YOLO/Express mode, preferences are inferred automatically from codebase scanning. Design verification gains a new compliance category that warns when designs deviate from stored preferences without acknowledgment.

## User Flow

### Step 1 — Feature/Major Feature brainstorming begins
The lifecycle invokes `superpowers:brainstorming` for a Feature or Major Feature scope. The orchestration override in `orchestration-overrides.md` fires the preferences preamble before any feature-specific questions.

### Step 2 — Preferences check
The preamble reads `.feature-flow.yml`. If `design_preferences` key is present → load silently and inject as context for the feature questions. If absent → proceed to Step 3.

### Step 3 — Preferences capture (interactive)
Five multiple-choice questions are asked one at a time, following the brainstorming interview format (`**[Question]** / *Why this matters:* / Option A *Recommended* / Option B / Option C`). Options are stack-filtered before display (see Stack Filtering below). Each question has an "Other (describe)" escape hatch.

### Step 4 — Preferences storage
Completed preferences are written to `.feature-flow.yml` under `design_preferences`. Per-feature overrides stated during brainstorming are held as session context only — not written back.

### Step 5 — Feature brainstorming continues
Stored preferences are injected as context into the remainder of the brainstorming session. Design questions proceed normally.

### Step 6 — Design verification enforces compliance
When `design-verification` runs, it reads `design_preferences` and checks the design document uses the declared patterns. Mismatches without explicit acknowledgment generate WARNING-level findings.

## The Five Preference Questions

All questions follow the brainstorming interview format with `*Recommended*` pre-populated from codebase scan results.

### Q1: Error handling pattern (universal)
Options: Return Result/Either types | Throw exceptions with error boundaries | Return error objects `{ success, error }` | Mixed (throw for unexpected, return for expected) | Other

### Q2: API style for new endpoints
Options: REST with resource routes | GraphQL mutations/queries | Server actions *(Next.js only)* | RPC-style functions | tRPC *(TypeScript stacks only)* | Other

### Q3: State management
Options: Local component state + props | Global store (Zustand/Redux/etc.) | Server state (React Query/SWR) *(React stacks only)* | URL state (search params) | Context + hooks *(React stacks only)* | Other

### Q4: Testing approach (universal)
Options: Unit tests only | Unit + integration | Unit + integration + e2e | Match existing coverage level | Other

### Q5: UI component pattern *(skipped for backend-only stacks)*
Options: Existing component library only | Tailwind utility classes | CSS modules | Styled-components *(React stacks only)* | Match existing pattern | Other

## Stack Filtering Rules

| Option | Stack Guard |
|--------|------------|
| Server actions | `stack` includes `next-js` |
| tRPC | `stack` includes `typescript` or `trpc` |
| Server state (React Query/SWR) | `stack` includes `react` or `next-js` |
| Context + hooks | `stack` includes `react` or `next-js` |
| Styled-components | `stack` includes `react` or `next-js` |
| Q5 entirely skipped | `stack` contains none of: `react`, `next-js`, `svelte`, `vue`, `angular` (backend-only) |

Filtering runs at display time; stored values use the canonical slugs regardless of which stack is active.

## YOLO/Express Behavior

### First run (no `design_preferences` in config)

Scan the codebase to infer dominant patterns across all 5 categories:

1. **Error handling:** Grep for `Result<`, `Either<`, `try/catch`, `{ success`, `{ error` — pick dominant occurrence count
2. **API style:** Check for `app/api/` (REST), `graphql` directories, `"use server"` (server actions), `.trpc.` files
3. **State management:** Check imports — `zustand`, `redux`, `@tanstack/react-query`, `swr`, `createContext`
4. **Testing approach:** Check test files for `describe`/`it` (unit), `supertest` (integration), `playwright`/`cypress` (e2e)
5. **UI pattern:** Check for `tailwind.config`, `*.module.css`, `styled-components` imports

Each inference announced:
- **Patterns found:** `YOLO: brainstorming — [category] preference → [detected_pattern] (inferred from N files/occurrences)`
- **No patterns found:** `YOLO: brainstorming — [category] preference → not detected (no matching patterns found — key omitted)`
- **Tie (equal counts):** `YOLO: brainstorming — [category] preference → [first-listed-pattern] (inferred — tied with [second-pattern] at N each; defaulting to first-listed)`

Inferred preferences are written to `.feature-flow.yml` exactly like interactive answers.

**Write failure in YOLO mode:** If writing to `.feature-flow.yml` fails, hold all inferred preferences in session context and include them in the design-doc step args. Do not halt the lifecycle. Announce: `YOLO: brainstorming — Preferences write failed → Holding in session context for this feature only`

### Subsequent runs (preferences exist)

Skip inference and preamble entirely — loaded silently from config. No announcement.

## Storage Schema

Written to `.feature-flow.yml` under the `design_preferences` key:

```yaml
design_preferences:
  error_handling: result_types        # result_types | exceptions | error_objects | mixed | <free-text>
  api_style: server_actions           # rest | graphql | server_actions | rpc | trpc | <free-text>
  state_management: server_state      # local | global_store | server_state | url_state | context_hooks | <free-text>
  testing: unit_integration           # unit | unit_integration | unit_integration_e2e | match_existing | <free-text>
  ui_pattern: tailwind                # component_library | tailwind | css_modules | styled_components | match_existing | <free-text>
```

**Rules:**
- "Other (describe)" selected → store user's free-text as the value. Design verification treats free-text values as advisory (no compliance check).
- Question skipped or hidden by stack filter → omit that key entirely. Missing keys are silently skipped in verification.
- User declines all questions → no `design_preferences` key written → preamble fires again next feature/major-feature run.
- No `enabled` flag. Presence of the key = active. Absence = preamble fires.

## Per-Feature Override

During brainstorming, the user can state "for this feature, use REST instead of server actions." The override is:
- Injected into the current session's brainstorming context
- Passed to the design document as session-level context
- **NOT written back to `.feature-flow.yml`** — project-wide preferences are immutable within a session

## Design Verification Integration

A new compliance category is appended to `skills/design-verification/references/checklist.md`. It fires only when `design_preferences` is present in `.feature-flow.yml`.

**Category name:** Design Preferences Compliance
**Category number:** 24 — appended as a new **Batch 8** in `checklist.md` after all existing categories (1-14). The batch comment at the top of checklist.md is updated to add: `Batch 8 (Design Preferences): Category 24`. SKILL.md-defined categories 15-23 remain unchanged.

**Verification logic per preference key:**
- Read `design_preferences` from `.feature-flow.yml`
- For each key present (excluding free-text values):
  - Grep the design document for the declared pattern name and its synonyms
  - **Match** → PASS
  - **Mismatch with explicit acknowledgment** in design doc (e.g., "Using REST here instead of server actions because…") → PASS with informational note
  - **Mismatch without acknowledgment** → WARNING: "Design uses [detected_pattern] but project preference is [declared_preference]. Add a deviation note or update the preference."
- If `design_preferences` key absent → skip this category entirely

## Changes Per File

| File | Change |
|------|--------|
| `skills/start/references/orchestration-overrides.md` | Add "Design Preferences Preamble" subsection to "Brainstorming Interview Format Override" — defines the 5 questions, trigger conditions, stack filtering rules, per-feature override behavior, AND YOLO/Express inference logic (all brainstorming YOLO behavior stays in one file) |
| `references/project-context-schema.md` | Add `design_preferences` field documentation (purpose, schema, rules for free-text, skip behavior, no-enabled-flag); also update "How Skills Use This File" section to add `start` (writes `design_preferences`) and `design-verification` (reads `design_preferences`) |
| `skills/start/SKILL.md` | Update "Brainstorm requirements" row in Skill Mapping to note: "For Feature and Major Feature scopes, brainstorming includes the design preferences preamble (see orchestration-overrides.md)" |
| `skills/design-verification/references/checklist.md` | Append new category 24 as Batch 8 after category 14; update batch comment at top of file |
| `docs/plans/2026-03-10-explicit-discuss-phase-preferences.md` | This file |

## Patterns & Constraints

### Consistency
- Follow existing orchestration-overrides.md section formatting exactly: `##` level headings, bold-emphasis YOLO announcements, `code block` for announcement templates
- Follow existing checklist.md category formatting: `##` category heading, checkbox items `- [ ]`, **Where to look** and **Common findings** subsections, `<!-- batch: N -->` comment prefix

### Error Handling
- YOLO inference — no patterns found: key omitted from written config; announce `YOLO: brainstorming — [category] preference → not detected (no matching patterns found — key omitted)`. No lifecycle halt.
- YOLO inference — tie (equal occurrence counts): prefer the first-listed pattern in the detection list; announce tie.
- Stack detection for filtering: if `.feature-flow.yml` `stack` field is empty/missing, show all options (fail-open).
- `.feature-flow.yml` write failure (interactive mode): announce warning, continue without persisting — preferences will be asked again next session.
- `.feature-flow.yml` write failure (YOLO mode): hold preferences in session context, inject into design-doc step args, announce `YOLO: brainstorming — Preferences write failed → Holding in session context for this feature only`.
- `.feature-flow.yml` read failure: treat as absent — fire the preamble. Announce: `Warning: could not read .feature-flow.yml — treating design_preferences as absent.`

### Types
- `design_preferences` values: `string` type in YAML (either enum slug or free-text). No strict enum enforcement at the YAML level — validation is advisory (done by design-verification, not a schema validator).
- Stack detection: string comparison on `stack` array entries from `.feature-flow.yml`

### Scope
**Included:**
- Preferences preamble inside brainstorming for Feature + Major Feature scopes
- 5 preference categories with stack filtering
- YOLO/Express codebase inference
- Storage in `.feature-flow.yml`
- Per-feature session-level overrides
- Design verification compliance category

**Excluded:**
- No separate lifecycle step — no step list changes
- No `enabled` flag or toggle — simplicity over configurability
- No per-feature persistence of overrides — session context only
- No inference for languages/frameworks not in `.feature-flow.yml` stack
- No AI-powered preference detection — pattern-matching only (grep/file-check)
- No retroactive compliance checking on existing design docs
- **Preamble does not fire on direct invocation of `superpowers:brainstorming`** — the preamble is injected by the start lifecycle orchestrator via `orchestration-overrides.md`; calling brainstorming standalone bypasses it. This is intentional — the preamble is a lifecycle concern, not a brainstorming-skill concern.

## Migration Requirements

None — `.feature-flow.yml` gains a new optional field. Absence of `design_preferences` is valid and causes the preamble to fire on the next eligible run.
