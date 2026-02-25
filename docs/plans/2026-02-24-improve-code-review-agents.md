# Improve Code Review Agent Effectiveness — Design Document

**Date:** 2026-02-24
**Status:** Draft
**Issue:** #79

## Overview

Code review agents find different issues on each run because prompts are too broad, context is insufficient, and output is unstructured. This design replaces open-ended review prompts with checklist-based agent prompts, injects project-specific context (coding standards, stack patterns, acceptance criteria, reference examples), requires structured output with rejection of vague findings, and adds a deterministic pre-filter step before agents run. The result: agents catch more on the first pass and findings are consistent across runs.

## Pipeline Changes — Before/After

**Current flow:**
```
Phase 1: Dispatch agents (broad prompts + branch diff)
Phase 2: Review direct fixes
Phase 3: Consolidate and fix reported findings
Phase 4: Re-verify
Phase 5: Report
```

**Proposed flow:**
```
Phase 0: Pre-filter with deterministic tools (NEW)
Phase 1: Dispatch agents (checklist prompts + project context + reference examples)
Phase 2: Review direct fixes (unchanged)
Phase 3: Consolidate and fix — with structured output rejection filter (MODIFIED)
Phase 4: Re-verify (unchanged)
Phase 5: Report (unchanged)
```

## Change 1: Checklist-Based Agent Prompts

Replace open-ended role descriptions in the Phase 1 agent dispatch table with concrete checklists. Each agent receives 5-6 specific rules derived from `references/coding-standards.md` and its specialty area.

### Agent Checklists

| Agent | Current Role Description | Proposed Checklist |
|-------|--------------------------|-------------------|
| `superpowers:code-reviewer` | "General quality, plan adherence" | (1) Every function ≤30 lines, (2) no nesting >3 levels, (3) guard clauses used for error cases, (4) naming matches existing codebase conventions, (5) no god files >300 lines, (6) all acceptance criteria from plan are met |
| `pr-review-toolkit:silent-failure-hunter` | "Silent failures, empty catches, bad fallbacks" | (1) Every catch block logs or re-throws, (2) no `.catch(() => {})` or `catch {}`, (3) no fallback that silently returns a default value, (4) every Promise has rejection handling, (5) no error swallowing in event handlers |
| `feature-dev:code-reviewer` | "Bugs, logic errors, security, conventions" | (1) Every external call has error handling, (2) inputs validated at system boundaries, (3) no SQL/command injection vectors, (4) race conditions in async code identified, (5) off-by-one errors in loops/pagination checked |
| `pr-review-toolkit:code-simplifier` | "DRY, clarity, maintainability" | (1) No duplicated logic blocks across files, (2) extract shared utilities at 2 repetitions, (3) data fetching separate from rendering, (4) business logic separate from I/O, (5) constants used for magic values |
| `backend-api-security:backend-security-coder` | "Input validation, auth, OWASP top 10" | (1) Every user input validated before use, (2) auth checked on every route, (3) no secrets in code, (4) CORS configured correctly, (5) rate limiting on public endpoints |
| `pr-review-toolkit:type-design-analyzer` | "Type encapsulation, invariants, type safety" | (1) No `any` types, (2) literal unions where applicable (not bare string/number), (3) discriminated unions for variants, (4) generated types for external data, (5) exported types enforce invariants via constructor/factory |
| `pr-review-toolkit:pr-test-analyzer` | "Test coverage quality, missing tests" | (1) Every public function has a test, (2) error paths tested (not just happy path), (3) edge cases from acceptance criteria covered, (4) no mock-only tests that skip real code, (5) one behavior per test assertion |

### Checklist Location

Checklists are defined inline in `skills/start/SKILL.md` Phase 1, directly in the agent dispatch table. Each agent's prompt template includes its checklist alongside the branch diff and context.

## Change 2: Inject Project Context Into Agent Prompts

Each agent prompt in Phase 1 receives project-specific context, not just the branch diff.

### Context Injected Per Agent

| Context Source | What's Injected | How It's Obtained |
|---------------|-----------------|-------------------|
| `references/coding-standards.md` | Sections relevant to the agent's specialty (see mapping table) | Read at dispatch time, extract mapped sections |
| Stack references (`references/stacks/*.md`) | Applicable rules for the project's stack | Read from `.feature-flow.yml` stack field |
| Acceptance criteria | From the implementation plan tasks | Passed through lifecycle context |
| Anti-patterns | From Study Existing Patterns output | Carried forward through lifecycle context |
| Reference examples | 2-3 exemplary files per area | From Study Existing Patterns (see Change 5) |

### Coding Standards → Agent Section Mapping

A mapping table is added to the bottom of `references/coding-standards.md` to define which sections are relevant to each agent:

| Agent | Sections |
|-------|----------|
| `superpowers:code-reviewer` | Functions, Structural Quality, Naming Conventions, Code Organization |
| `silent-failure-hunter` | Error Handling |
| `feature-dev:code-reviewer` | Error Handling, Separation of Concerns, Performance |
| `code-simplifier` | DRY, Separation of Concerns, Code Organization |
| `backend-security-coder` | Error Handling, Types |
| `type-design-analyzer` | Types |
| `pr-test-analyzer` | Testing |

At dispatch time, the lifecycle reads `coding-standards.md`, extracts the mapped sections for each agent, and includes them in the agent's prompt.

## Change 3: Require Structured Output Format

Agents are instructed to return findings in a specific format. Phase 3 consolidation enforces the format by discarding non-compliant findings.

### Required Finding Format

Each finding must include all of these fields:

```
- file: [exact file path]
  line: [line number]
  rule: [specific rule name from checklist, e.g., "function-length: ≤30 lines"]
  severity: [critical | important | minor]
  description: [what's wrong and why]
  fix: |
    [concrete code change — not "consider improving"]
```

### Phase 3 Rejection Filter

After collecting findings from reporting agents, Phase 3 adds a rejection step before deduplication:

1. **Reject findings missing required fields** — any finding without `file`, `line`, `rule`, and `fix` is discarded
2. **Reject vague fixes** — findings where `fix` contains only commentary ("consider simplifying", "could be improved") without concrete code are discarded
3. **Log rejected findings** — announce count: "Rejected N findings (M missing required fields, K vague fixes)"
4. Continue with remaining findings through existing deduplication and severity classification

## Change 4: Deterministic Pre-Filter (Phase 0)

Run deterministic tools before dispatching agents. Pass results as "already checked — skip these" context to agents, narrowing their review surface.

### Phase 0 Process

1. **Run deterministic checks in parallel:**
   - `tsc --noEmit` (if TypeScript project — detected from `tsconfig.json`)
   - Lint command (detected from project: ESLint via `npx eslint`, Biome via `npx biome check`, or skip if neither configured)
   - Anti-pattern hooks are already running via PostToolUse — no explicit invocation needed

2. **Collect results:**
   - Parse output for file paths and line numbers with issues
   - Categorize as: type errors, lint violations, or anti-pattern violations

3. **Pass to Phase 1 as exclusion context:**
   Each agent prompt receives a "Pre-filter results" section:
   ```
   ## Pre-Filter Results (already caught — skip these)
   - [file:line] type error: [description] (will be fixed separately)
   - [file:line] lint violation: [rule] (will be fixed separately)

   Focus your review on issues these tools CANNOT catch:
   logic errors, architectural mismatches, missing edge cases, security vulnerabilities.
   ```

4. **Fix pre-filter findings before dispatch:**
   Before dispatching agents in Phase 1, fix the pre-filter findings directly (tsc errors → fix types, lint errors → auto-fix or manual fix). This runs sequentially before agent dispatch to avoid race conditions — agents must review the fixed code, not stale code.

### Detection Logic

| Tool | Detection | Command |
|------|-----------|---------|
| TypeScript | `tsconfig.json` exists | `npx tsc --noEmit 2>&1` |
| ESLint | `.eslintrc*` or `eslint.config.*` exists, or `eslintConfig` in `package.json` | `npx eslint --no-error-on-unmatched-pattern . 2>&1` |
| Biome | `biome.json` or `biome.jsonc` exists | `npx biome check . 2>&1` |

If neither linter is detected, skip linting. If TypeScript is not detected, skip type checking. Pre-filter is best-effort — partial results are still useful.

## Change 5: Reference Examples in Agent Prompts

The Study Existing Patterns step already identifies exemplary files per area. This change ensures those reference file paths are carried forward to the code review pipeline and included in agent prompts.

### Study Existing Patterns Output Addition

Add a `referenceExamples` field to each area's consolidated output:

```
### [Area: e.g., API Routes]
- File structure: [pattern]
- Error handling: [pattern]
- Reference examples:
  - `src/handlers/users.ts` (error handling, guard clauses)
  - `src/handlers/search.ts` (response format, validation)
```

### Agent Prompt Injection

Each code review agent receives a "Reference Examples" section with the exemplary files relevant to the areas being reviewed:

```
## Reference Examples (follow these patterns)
- Error handling: see `src/handlers/users.ts` lines 15-40
- Type definitions: see `src/types/search.ts`
- Test structure: see `src/__tests__/handlers/users.test.ts`

Review new code against these patterns. Flag deviations as findings.
```

## Files Modified

| File | Change |
|------|--------|
| `skills/start/SKILL.md` — Phase 0 (new) | Add deterministic pre-filter step before Phase 1 |
| `skills/start/SKILL.md` — Phase 1 | Replace role descriptions with checklist prompts; add context injection template |
| `skills/start/SKILL.md` — Phase 3 | Add structured output rejection filter before deduplication |
| `skills/start/SKILL.md` — Study Existing Patterns | Add reference examples to output format; carry forward to code review |
| `references/coding-standards.md` | Add agent-section mapping table at bottom |

## Scope

### Included
- Checklist-based prompts for all 7 agents in the dispatch table
- Project context injection (coding standards sections, stack patterns, acceptance criteria, anti-patterns, reference examples)
- Structured output format requirement with Phase 3 rejection filter
- Phase 0 deterministic pre-filter (tsc + lint)
- Reference example propagation from Study Existing Patterns to code review
- Agent-section mapping table in `coding-standards.md`

### Excluded
- Changes to external plugins (agents themselves) — all changes are prompt-level
- Schema-level validation of agent output — enforcement is via prompt instructions and rejection filter
- New test infrastructure for the pipeline — changes are to Markdown prompt files
- Changes to Phase 2 (direct fixes), Phase 4 (re-verify), or Phase 5 (report)
- Modifications to the self-review step checklist (already well-specified)
