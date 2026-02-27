# Improve Code Review Agent Effectiveness — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make code review agents catch more issues on the first pass by replacing broad prompts with checklist-based prompts, injecting project context, requiring structured output, and adding a deterministic pre-filter step.

**Architecture:** All changes are to Markdown prompt files — `skills/start/SKILL.md` (code review pipeline and study existing patterns sections) and `references/coding-standards.md` (agent-section mapping). No code changes, no new files. Agents receive better input and are expected to produce structured output.

**Tech Stack:** Markdown (prompt engineering in Claude Code plugin skill files)

---

### Task 1: Add agent-section mapping table to coding-standards.md

**Files:**
- Modify: `references/coding-standards.md:178-184` (after "How This File Is Used" section)

**Step 1: Add the mapping table**

Append a new section after line 184 (the end of "How This File Is Used"):

```markdown

## Agent-Section Mapping

This table maps code review agents to the sections of this file relevant to their specialty. During the code review pipeline (Phase 1), the lifecycle reads this file and extracts only the mapped sections for each agent's prompt.

| Agent | Sections |
|-------|----------|
| `superpowers:code-reviewer` | Functions, Structural Quality, Naming Conventions, Code Organization |
| `pr-review-toolkit:silent-failure-hunter` | Error Handling |
| `feature-dev:code-reviewer` | Error Handling, Separation of Concerns, Performance |
| `pr-review-toolkit:code-simplifier` | DRY, Separation of Concerns, Code Organization |
| `backend-api-security:backend-security-coder` | Error Handling, Types |
| `pr-review-toolkit:type-design-analyzer` | Types |
| `pr-review-toolkit:pr-test-analyzer` | Testing |
```

**Step 2: Verify**

Read `references/coding-standards.md` from line 178 onward and verify the new section appears after "How This File Is Used" and all 7 agents are listed with their mapped sections.

**Step 3: Commit**

```bash
git add references/coding-standards.md
git commit -m "feat: add agent-section mapping table to coding-standards.md"
```

**Acceptance Criteria:**
- [ ] `references/coding-standards.md` contains a section titled `## Agent-Section Mapping` after the `## How This File Is Used` section
- [ ] The mapping table lists all 7 code review agents: `superpowers:code-reviewer`, `pr-review-toolkit:silent-failure-hunter`, `feature-dev:code-reviewer`, `pr-review-toolkit:code-simplifier`, `backend-api-security:backend-security-coder`, `pr-review-toolkit:type-design-analyzer`, `pr-review-toolkit:pr-test-analyzer`
- [ ] Each agent maps to at least one section name that exists as a `##` heading in the same file

---

### Task 2: Add reference examples to Study Existing Patterns output

**Files:**
- Modify: `skills/start/SKILL.md:693-717` (Study Existing Patterns consolidated output format)

**Step 1: Add reference examples to the area output format**

In the consolidated output format block (lines 694-710), add a `Reference examples` line to each area template. Change the output format from:

```
### [Area: e.g., API Routes]
- File structure: [how existing routes are organized]
- Error handling: [how existing routes handle errors]
- Response format: [what shape existing routes return]
- Auth pattern: [how auth is checked]
```

To:

```
### [Area: e.g., API Routes]
- File structure: [how existing routes are organized]
- Error handling: [how existing routes handle errors]
- Response format: [what shape existing routes return]
- Auth pattern: [how auth is checked]
- Reference examples:
  - `[file path]` ([aspects this file exemplifies])
  - `[file path]` ([aspects this file exemplifies])
```

Apply the same pattern to the Components area example.

**Step 2: Add instruction to carry reference examples forward**

In step 6 (line 734), update the instruction to explicitly mention reference examples are passed to the code review pipeline. Change:

```
6. Pass these patterns, the "How to Code This" notes, AND any anti-pattern warnings from the consolidated output to the implementation step as mandatory context. **New code MUST follow these patterns unless there is a documented reason to deviate.**
```

To:

```
6. Pass these patterns, the "How to Code This" notes, anti-pattern warnings, AND reference examples from the consolidated output to BOTH the implementation step AND the code review pipeline step as mandatory context. **New code MUST follow these patterns unless there is a documented reason to deviate.** The code review pipeline uses reference examples to check new code against known-good patterns.
```

**Step 3: Add reference examples to Explore agent instructions**

In the "Context passed to each agent" section (lines 677-681), add a fourth instruction bullet:

```
   - Instructions: identify 2-3 exemplary files per area that best demonstrate the project's patterns — these will be passed to code review agents as "known good" reference examples
```

**Step 4: Verify**

Read `skills/start/SKILL.md` lines 666-740 and verify:
1. The output format includes `Reference examples` with file paths
2. Step 6 mentions passing reference examples to the code review pipeline
3. Agent instructions include identifying exemplary files

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add reference examples to Study Existing Patterns output"
```

**Acceptance Criteria:**
- [ ] The Study Existing Patterns consolidated output format (in `skills/start/SKILL.md`) includes a `Reference examples:` line with sub-items showing file paths and aspects
- [ ] Step 6 of Study Existing Patterns mentions passing reference examples to the code review pipeline step
- [ ] The "Context passed to each agent" section includes an instruction about identifying exemplary files
- [ ] The existing output format fields (File structure, Error handling, etc.) are preserved unchanged

---

### Task 3: Add Phase 0 pre-filter to Code Review Pipeline

**Files:**
- Modify: `skills/start/SKILL.md:813` (insert new Phase 0 section before "#### Phase 1: Dispatch review agents")

**Step 1: Insert Phase 0 section**

Insert the following new section immediately before `#### Phase 1: Dispatch review agents` (line 813):

```markdown
#### Phase 0: Deterministic pre-filter

Run deterministic tools before dispatching agents to catch issues that linters can find. Fix those issues first, then pass results as exclusion context to agents so they focus on what linters cannot catch.

**Detection and execution:**

1. **Detect available tools:**
   - TypeScript: check if `tsconfig.json` exists in the project root
   - ESLint: check if `.eslintrc*` or `eslint.config.*` exists, or `eslintConfig` in `package.json`
   - Biome: check if `biome.json` or `biome.jsonc` exists
   If no tools are detected, skip Phase 0 entirely: "No deterministic tools detected — skipping pre-filter."

2. **Run detected tools in parallel:**
   - TypeScript: `npx tsc --noEmit 2>&1`
   - ESLint: `npx eslint --no-error-on-unmatched-pattern . 2>&1`
   - Biome: `npx biome check . 2>&1`
   Timeout: 60 seconds per tool. If a tool times out, log a warning and skip it.

3. **Collect and summarize results:**
   Parse output for file paths and line numbers. Categorize as type errors, lint violations, or anti-pattern violations.

4. **Fix pre-filter findings:**
   Before proceeding to Phase 1, fix the deterministic findings directly (type errors → fix types, lint errors → auto-fix with `--fix` flag or manual fix). This runs sequentially before agent dispatch to avoid race conditions.

5. **Build exclusion context for Phase 1:**
   Generate a "Pre-Filter Results" summary to include in each agent's prompt:
   ```
   ## Pre-Filter Results (already caught and fixed — skip these areas)
   - [file:line] [category]: [description]

   Focus your review on issues these tools CANNOT catch:
   logic errors, architectural mismatches, missing edge cases, security vulnerabilities.
   ```
   If no issues were found in the pre-filter, include: "Pre-filter ran clean — no deterministic issues found. Proceed with full review."

```

**Step 2: Verify**

Read `skills/start/SKILL.md` around the Phase 0 / Phase 1 boundary and verify:
1. Phase 0 appears before Phase 1
2. It includes detection logic for tsc, ESLint, and Biome
3. It includes the fix-before-dispatch instruction
4. It includes the exclusion context template

**Step 3: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add Phase 0 deterministic pre-filter to code review pipeline"
```

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains a section `#### Phase 0: Deterministic pre-filter` that appears before `#### Phase 1: Dispatch review agents`
- [ ] Phase 0 includes detection logic for TypeScript (`tsconfig.json`), ESLint (`.eslintrc*` or `eslint.config.*`), and Biome (`biome.json`)
- [ ] Phase 0 includes a step to fix pre-filter findings before dispatching agents (not in parallel)
- [ ] Phase 0 includes a "Pre-Filter Results" template for exclusion context passed to agents
- [ ] Phase 0 includes a 60-second timeout per tool
- [ ] Phase 0 includes a skip path when no deterministic tools are detected

---

### Task 4: Replace Phase 1 role descriptions with checklist prompts and context injection

**Files:**
- Modify: `skills/start/SKILL.md:813-829` (Phase 1 section — line numbers will have shifted after Task 3 insertion)

**Step 1: Replace the Phase 1 dispatch instructions**

Replace the current Phase 1 content. The existing text starting at `#### Phase 1: Dispatch review agents` through the agent failure handling paragraph needs to be replaced with the new checklist-based version.

Replace the paragraph:

```
Dispatch the tier-selected review agents in parallel (see scope-based agent selection above). For each agent at or below the current tier, use the Task tool with the agent's `subagent_type` and `model` parameter (see table below). Each agent's prompt should include the full branch diff (`git diff [base-branch]...HEAD`) and a description of what to review. Launch all agents in a single message to run them concurrently.
```

With:

```
Dispatch the tier-selected review agents in parallel (see scope-based agent selection above). For each agent at or below the current tier, use the Task tool with the agent's `subagent_type` and `model` parameter (see table below). Launch all agents in a single message to run them concurrently.

**Each agent's prompt MUST include all of the following:**

1. **Branch diff:** `git diff [base-branch]...HEAD`
2. **Agent checklist:** The specific rules from the checklist column in the table below — these are the ONLY things the agent should check
3. **Relevant coding standards:** Extract the sections mapped to this agent from `references/coding-standards.md` (see the Agent-Section Mapping table at the bottom of that file) and include them verbatim
4. **Stack patterns:** If `.feature-flow.yml` has a `stack` field, include applicable rules from `references/stacks/*.md` for the project's stack
5. **Acceptance criteria:** From the implementation plan tasks, so agents can verify spec compliance
6. **Anti-patterns and reference examples:** From the Study Existing Patterns output (carried through lifecycle context), so agents know what NOT to accept and what "known good" code looks like
7. **Pre-filter exclusion context:** From Phase 0, so agents skip issues already caught by deterministic tools

**Structured output requirement:** Instruct each agent to return findings in this format. Findings that do not follow this format will be discarded in Phase 3:
```
- file: [exact file path]
  line: [line number]
  rule: [specific rule name from checklist]
  severity: critical | important | minor
  description: [what's wrong and why]
  fix: |
    [concrete code change — not "consider improving"]
```
Agents must name the specific rule violated from their checklist. Findings without a named rule and concrete fix will be rejected.
```

**Step 2: Replace the agent dispatch table**

Replace the existing table:

```
| Agent | Plugin | Role | Fix Mode | Model | Tier |
```

With a new table that includes checklists:

```
| Agent | Plugin | Checklist | Fix Mode | Model | Tier |
|-------|--------|-----------|----------|-------|------|
| `pr-review-toolkit:code-simplifier` | pr-review-toolkit | (1) No duplicated logic blocks across files, (2) extract shared utilities at 2 repetitions, (3) data fetching separate from rendering, (4) business logic separate from I/O, (5) constants used for magic values | **Direct** — writes fixes to files | sonnet | 2 |
| `pr-review-toolkit:silent-failure-hunter` | pr-review-toolkit | (1) Every catch block logs or re-throws, (2) no `.catch(() => {})` or `catch {}`, (3) no fallback that silently returns default, (4) every Promise has rejection handling, (5) no error swallowing in event handlers | **Direct** — auto-fixes common patterns | sonnet | 1 |
| `feature-dev:code-reviewer` | feature-dev | (1) Every external call has error handling, (2) inputs validated at system boundaries, (3) no SQL/command injection vectors, (4) race conditions in async code, (5) off-by-one in loops/pagination | **Report** → Claude fixes | sonnet | 2 |
| `superpowers:code-reviewer` | superpowers | (1) Every function ≤30 lines, (2) no nesting >3 levels, (3) guard clauses for error cases, (4) naming matches conventions, (5) no god files >300 lines, (6) all acceptance criteria met | **Report** → Claude fixes | sonnet | 1 |
| `pr-review-toolkit:pr-test-analyzer` | pr-review-toolkit | (1) Every public function has a test, (2) error paths tested, (3) edge cases from acceptance criteria covered, (4) no mock-only tests skipping real code, (5) one behavior per test | **Report** → Claude fixes | sonnet | 3 |
| `backend-api-security:backend-security-coder` | backend-api-security | (1) Every user input validated before use, (2) auth checked on every route, (3) no secrets in code, (4) CORS configured correctly, (5) rate limiting on public endpoints | **Report** → Claude fixes | opus | 3 |
| `pr-review-toolkit:type-design-analyzer` | pr-review-toolkit | (1) No `any` types, (2) literal unions where applicable, (3) discriminated unions for variants, (4) generated types for external data, (5) exported types enforce invariants | **Report** → Claude fixes | sonnet | 3 |
```

**Step 3: Verify**

Read the updated Phase 1 section and verify:
1. The 7-point prompt checklist is present (branch diff, agent checklist, coding standards, stack patterns, acceptance criteria, anti-patterns/reference examples, pre-filter context)
2. The structured output requirement is present with the finding format template
3. The dispatch table has a `Checklist` column (not `Role`) with 5-6 specific rules per agent
4. Availability check and agent failure handling paragraphs are preserved unchanged

**Step 4: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: replace Phase 1 role descriptions with checklist prompts and context injection"
```

**Acceptance Criteria:**
- [ ] Phase 1 in `skills/start/SKILL.md` contains a numbered list titled "Each agent's prompt MUST include all of the following" with 7 items: branch diff, agent checklist, relevant coding standards, stack patterns, acceptance criteria, anti-patterns/reference examples, pre-filter exclusion context
- [ ] Phase 1 contains a "Structured output requirement" section with the finding format template (file, line, rule, severity, description, fix)
- [ ] The agent dispatch table column is named `Checklist` (not `Role`) and each agent has 5-6 specific numbered rules
- [ ] The availability check and agent failure handling paragraphs remain intact after the table
- [ ] The structured output instruction explicitly states findings without a named rule and concrete fix will be rejected

---

### Task 5: Add rejection filter to Phase 3

**Files:**
- Modify: `skills/start/SKILL.md:840-847` (Phase 3 section — line numbers will have shifted after Tasks 3-4)

**Step 1: Insert rejection filter before deduplication**

The current Phase 3 starts with:

```
Collect findings from the reporting agents dispatched in Phase 1. Consolidate them:

1. **Deduplicate by file path + line number** — if two agents flag the same location, keep the higher-severity finding
```

Insert a rejection step between "Consolidate them:" and the deduplication step. Replace with:

```
Collect findings from the reporting agents dispatched in Phase 1. Consolidate them:

0. **Reject non-compliant findings** — before any other processing, filter out findings that do not meet the structured output requirement from Phase 1:
   - Discard findings missing any required field (`file`, `line`, `rule`, `severity`, `fix`)
   - Discard findings where `fix` contains only commentary ("consider simplifying", "could be improved", "might want to") without concrete code changes
   - Announce: "Rejected N findings (M missing required fields, K vague fixes). Proceeding with R valid findings."

1. **Deduplicate by file path + line number** — if two agents flag the same location, keep the higher-severity finding
```

**Step 2: Verify**

Read the updated Phase 3 section and verify:
1. Step 0 (rejection filter) appears before step 1 (deduplication)
2. Both rejection criteria are listed (missing fields, vague fixes)
3. The announcement format includes counts
4. Existing steps 1-4 are renumbered or unchanged

**Step 3: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add structured output rejection filter to Phase 3"
```

**Acceptance Criteria:**
- [ ] Phase 3 in `skills/start/SKILL.md` contains a step numbered `0` titled "Reject non-compliant findings" that appears before the deduplication step
- [ ] The rejection step discards findings missing required fields: `file`, `line`, `rule`, `severity`, `description`, `fix`
- [ ] The rejection step discards findings where `fix` contains only commentary without concrete code
- [ ] The rejection step includes an announcement format with counts of rejected findings
- [ ] The existing deduplication, severity classification, and fix-in-order steps are preserved unchanged
