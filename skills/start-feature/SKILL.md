---
name: start-feature
description: This skill should be used when the user asks to "start a feature", "build a feature", "implement a feature", "new feature", "start working on", "I want to build", "let's build", "add a feature", or at the beginning of any non-trivial development work. It orchestrates the full lifecycle from idea to PR, invoking the right skills at each step.
tools: Read, Glob, Grep, Write, Edit, Bash, Task, AskUserQuestion, Skill
---

# Start Feature — Lifecycle Orchestrator

Guide development work through the correct lifecycle steps, invoking the right skill at each stage. This is the single entry point for any non-trivial work.

**Announce at start:** "Starting the feature lifecycle. Let me check project context and determine the right steps."

## Pre-Flight Check

Before starting, verify required and recommended plugins are available.

### superpowers (required)

Check for its presence by looking for superpowers skills in the loaded skill list — do NOT invoke a superpowers skill just to test availability. If superpowers is not found, stop and tell the user:

```
The superpowers plugin is required but doesn't appear to be installed.
Install it first: claude plugins add superpowers
Then re-run start-feature.
```

Do not proceed with the lifecycle if superpowers is missing — most steps depend on it.

### Context7 (required)

Check for the Context7 MCP plugin by looking for `mcp__plugin_context7_context7__resolve-library-id` in the available tools (use ToolSearch if needed). If Context7 is not found, warn the user:

```
The Context7 plugin is required for documentation lookups but doesn't appear to be installed.
Install it: claude plugins add context7
Without it, spec-driven cannot query up-to-date library documentation during design and implementation.
```

Do not proceed with the lifecycle if Context7 is missing — documentation lookups are a core part of the design phase. The `context7` field in `.spec-driven.yml` will not be populated, and the documentation lookup step, documentation compliance verification, and PreToolUse hook will all be non-functional.

### pr-review-toolkit (recommended)

Check for its presence by looking for `pr-review-toolkit:code-simplifier` in the loaded skill list. If not found, warn but continue:

```
The pr-review-toolkit plugin is recommended for full code review coverage.
Install it: claude plugins add pr-review-toolkit
Without it, the code review pipeline will skip: code-simplifier, silent-failure-hunter, pr-test-analyzer, and type-design-analyzer.
```

### feature-dev (recommended)

Check for its presence by looking for `feature-dev:code-reviewer` in the loaded skill list. If not found, warn but continue:

```
The feature-dev plugin is recommended for code review.
Install it: claude plugins add feature-dev
Without it, the code review pipeline will skip: feature-dev:code-reviewer.
```

### backend-api-security (recommended)

Check for its presence by looking for `backend-api-security:backend-security-coder` in the loaded skill list. If not found, warn but continue:

```
The backend-api-security plugin is recommended for security review.
Install it: claude plugins add backend-api-security
Without it, the code review pipeline will skip: backend-security-coder.
```

## Purpose

Ensure the lifecycle is followed from start to finish. Track which steps are complete, invoke the right skill at each stage, and do not advance until the current step is done.

## Process

### Step 0: Load or Create Project Context

Check for a `.spec-driven.yml` file in the project root.

**If found:**
1. Read it and extract `platform`, `stack`, `context7`, and `gotchas`
2. Cross-check against auto-detected stack (see `../../references/auto-discovery.md`). If new dependencies are detected that aren't declared, suggest additions:
   ```
   Your .spec-driven.yml declares: [supabase, next-js]
   I also detected: [stripe] (from package.json)
   Want me to add stripe to your stack list?
   ```
3. If user approves additions, update the file with `Edit`

**If not found — auto-detect and create:**
1. Detect platform from project structure (ios/, android/, Podfile, build.gradle, etc.)
2. Detect stack from dependency files (package.json, requirements.txt, Gemfile, go.mod, Cargo.toml, pubspec.yaml, composer.json, pom.xml, build.gradle, *.csproj, mix.exs) and config files (vercel.json, supabase/, firebase.json, etc.)
3. Present detected context to user for confirmation:
   ```
   I detected the following project context:

   Platform: [detected]
   Stack:
     - [stack-1] (from [source])
     - [stack-2] (from [source])

   Does this look right? I'll save this to `.spec-driven.yml`.
   ```
4. Use `AskUserQuestion` with options: "Looks correct", "Let me adjust"
5. Write `.spec-driven.yml` with confirmed values (gotchas starts empty — skills will populate it as they discover issues)

See `../../references/auto-discovery.md` for the full detection rules.
See `../../references/project-context-schema.md` for the schema.

### Step 1: Determine Scope

Ask the user what they want to build. Then classify the work.

**Issue reference detection:** Before classifying scope, check if the user's request references an existing GitHub issue. Look for patterns: `#N`, `issue #N`, `implement issue #N`, `issue/N`, or a full GitHub issue URL (e.g., `https://github.com/.../issues/N`).

If an issue reference is found:
1. Extract the issue number
2. Fetch the issue body and title: `gh issue view N --json title,body,comments --jq '{title, body, comments: [.comments[].body]}'`
3. Store the issue number as lifecycle context (pass to subsequent steps)
4. Announce: "Found issue #N: [title]. I'll use this as context for brainstorming and update it after design."
5. Pass the issue body + comments as initial context to the brainstorming step

If no issue reference is found, proceed as before.

| Scope | Description | Example |
|-------|------------|---------|
| **Quick fix** | Single-file bug fix, typo, config change | "Fix the null check in the login handler" |
| **Small enhancement** | 1-3 files, well-understood change, no new data model | "Add a loading spinner to the search page" |
| **Feature** | Multiple files, new UI or API, possible data model changes | "Add CSV export to the results page" |
| **Major feature** | New page/workflow, data model changes, external API integration, pipeline changes | "Build a creative domain generator with LLM" |

Present the classification to the user:

```
This looks like a [scope]. Here's the lifecycle for this work:

[show applicable steps with checkboxes]

Does this look right, or should I adjust the scope?
```

Use `AskUserQuestion` to confirm. Options: the four scope levels.

### Step 2: Build the Step List

Based on scope AND platform, determine which steps apply. Create a todo list to track progress.

**Quick fix (all platforms):**
```
- [ ] 1. Understand the problem
- [ ] 2. Study existing patterns
- [ ] 3. Implement fix (TDD)
- [ ] 4. Self-review
- [ ] 5. Verify acceptance criteria
- [ ] 6. Commit and PR
```

**Small enhancement:**
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Documentation lookup (Context7)
- [ ] 3. Design document
- [ ] 4. Create issue
- [ ] 5. Implementation plan
- [ ] 6. Verify plan criteria
- [ ] 7. Worktree setup
- [ ] 8. Study existing patterns
- [ ] 9. Implement (TDD)
- [ ] 10. Self-review
- [ ] 11. Code review
- [ ] 12. Generate CHANGELOG entry
- [ ] 13. Final verification
- [ ] 14. Commit and PR
```

**Feature:**
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Documentation lookup (Context7)
- [ ] 3. Design document
- [ ] 4. Design verification
- [ ] 5. Create issue
- [ ] 6. Implementation plan
- [ ] 7. Verify plan criteria
- [ ] 8. Worktree setup
- [ ] 9. Study existing patterns
- [ ] 10. Implement (TDD)
- [ ] 11. Self-review
- [ ] 12. Code review
- [ ] 13. Generate CHANGELOG entry
- [ ] 14. Final verification
- [ ] 15. Commit and PR
```

**Major feature:**
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Spike / PoC (if risky unknowns)
- [ ] 3. Documentation lookup (Context7)
- [ ] 4. Design document
- [ ] 5. Design verification
- [ ] 6. Create issue
- [ ] 7. Implementation plan
- [ ] 8. Verify plan criteria
- [ ] 9. Worktree setup
- [ ] 10. Study existing patterns
- [ ] 11. Implement (TDD)
- [ ] 12. Self-review
- [ ] 13. Code review
- [ ] 14. Generate CHANGELOG entry
- [ ] 15. Final verification
- [ ] 16. Commit and PR
```

**Mobile platform adjustments (ios, android, cross-platform):**

When the platform is mobile, modify the step list:

- **Implementation plan:** Add required sections — feature flag strategy, rollback plan, API versioning (if API changes)
- **After implementation:** Insert **device matrix testing** step (test on min OS version, small/large screens, slow network)
- **After final verification:** Insert **beta testing** step (TestFlight / Play Console internal testing)
- **After commit and PR:** Insert **app store review** step (human-driven gate — submission, review, potential rejection)

Announce the platform-specific additions: "Mobile platform detected. Adding: device matrix testing, beta testing, and app store review steps."

Use `TaskCreate` to create a todo item for each step.

### Step 3: Execute Steps in Order

For each step, follow this pattern:

1. **Announce the step:** "Step N: [name]. Invoking [skill name]."
2. **Mark in progress:** Update the todo item to `in_progress`
3. **Invoke the skill** using the Skill tool (see mapping below)
4. **Confirm completion:** Verify the step produced its expected output
5. **Mark complete:** Update the todo item to `completed`
6. **Announce next step:** "Step N complete. Next: Step N+1 — [name]."

**Do not skip steps.** If the user asks to skip a step, explain why it matters and confirm they want to skip. If they insist, mark it as skipped and note the risk.

### Skill Mapping

| Step | Skill to Invoke | Expected Output |
|------|----------------|-----------------|
| Brainstorm requirements | `superpowers:brainstorming` | Decisions on scope, approach, UX |
| Spike / PoC | `spec-driven:spike` | Confirmed/denied assumptions |
| Documentation lookup | No skill — inline step (see below) | Current patterns from official docs injected into context |
| Design document | `spec-driven:design-document` | File at `docs/plans/YYYY-MM-DD-*.md` |
| Study existing patterns | No skill — inline step (see below) | Understanding of codebase conventions for the areas being modified |
| Design verification | `spec-driven:design-verification` | Blockers/gaps identified and fixed |
| Create issue | `spec-driven:create-issue` | GitHub issue URL. **If an issue number was detected in Step 1**, pass it to create-issue as the `existing_issue` context — the skill will update the existing issue instead of creating a new one. |
| Implementation plan | `superpowers:writing-plans` | Numbered tasks with acceptance criteria. **Override:** After the plan is saved, always proceed with subagent-driven execution — do not present the execution choice to the user. Immediately invoke `superpowers:subagent-driven-development`. |
| Verify plan criteria | `spec-driven:verify-plan-criteria` | All tasks have verifiable criteria |
| Worktree setup | `superpowers:using-git-worktrees` | Isolated worktree created |
| Implement | `superpowers:subagent-driven-development` | Code written with tests, spec-reviewed, and quality-reviewed per task |
| Self-review | No skill — inline step (see below) | Code verified against coding standards before formal review |
| Code review | No skill — inline step (see below) | All Critical/Important findings fixed, tests pass |
| Generate CHANGELOG entry | No skill — inline step (see below) | CHANGELOG.md updated with categorized entry |
| Final verification | `spec-driven:verify-acceptance-criteria` + `superpowers:verification-before-completion` | All criteria PASS + lint/typecheck/build pass |
| Commit and PR | `superpowers:finishing-a-development-branch` | PR URL |
| Device matrix testing | No skill — manual step | Tested on min OS, small/large screens, slow network |
| Beta testing | No skill — manual step | TestFlight / Play Console build tested by internal tester |
| App store review | No skill — manual step | Submission accepted |

### Brainstorming Interview Format Override

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

### Study Existing Patterns Step (inline — no separate skill)

This step runs after worktree setup and before implementation. It forces reading the actual codebase to understand how similar things are done before writing new code. This prevents "vibing" — writing code that works but doesn't follow the project's established patterns.

**Process:**
1. Read `../../references/coding-standards.md` to load the senior-engineer principles
2. Identify the areas of the codebase that will be modified or extended (from the implementation plan)
3. For each area, read 2-3 existing files that do similar things:
   - Adding a new API route? Read 2 existing API routes in the same directory
   - Adding a new component? Read 2 similar components
   - Adding a new hook? Read existing hooks
   - Adding a database query? Read existing query patterns
4. Extract and document the patterns found:

**Output format:**
```
## Existing Patterns Found

### [Area: e.g., API Routes]
- File structure: [how existing routes are organized]
- Error handling: [how existing routes handle errors]
- Response format: [what shape existing routes return]
- Auth pattern: [how auth is checked]

### [Area: e.g., Components]
- State management: [local state vs hooks vs context]
- Loading states: [how loading is shown]
- Error states: [how errors are displayed]

### Coding Standards to Follow
- [List relevant items from coding-standards.md for this feature]
```

5. **Generate "How to Code This" notes** for each task in the implementation plan. For each task, write a brief note mapping the task to the patterns found:

```
## How to Code This (per task)

### Task 1: [title from implementation plan]
- Follow pattern from: [existing file that does something similar]
- Error handling: [specific pattern to use, from the patterns found above]
- Types: [specific types to import or generate]

### Task 2: [title]
- Follow pattern from: [existing file]
- State management: [specific approach matching existing patterns]
```

6. Pass these patterns AND the "How to Code This" notes to the implementation step as mandatory context. **New code MUST follow these patterns unless there is a documented reason to deviate.**

**Quality rules:**
- Read at least 2 existing files per area being modified
- Don't just skim — understand the pattern deeply enough to replicate it
- If existing patterns conflict with coding-standards.md, note the conflict and follow the existing codebase pattern (consistency > purity)

### Self-Review Step (inline — no separate skill)

This step runs after implementation and before formal code review. It catches "it works but it's sloppy" problems before a reviewer sees them.

**Process:**
1. Read `../../references/coding-standards.md` to load the review criteria
2. Get the full diff of all files changed during implementation: `git diff`
3. Review every changed file against these criteria:

**Self-Review Checklist:**
- [ ] **Functions:** No function exceeds 30 lines. Each has a single responsibility.
- [ ] **Naming:** All functions, variables, and files follow the naming conventions found in "Study Existing Patterns"
- [ ] **Error handling:** No empty catch blocks. All external calls have error handling. Errors are typed.
- [ ] **Types:** No `any` types. Types are narrow and specific. Generated types used for external data.
- [ ] **DRY:** No duplicated logic. Shared utilities extracted. Constants defined for magic values.
- [ ] **Pattern adherence:** New code follows the patterns documented in "Study Existing Patterns"
- [ ] **Separation of concerns:** Data fetching is separate from rendering. Business logic is separate from I/O.
- [ ] **Guard clauses:** No nesting deeper than 3 levels. Early returns used for error cases.
- [ ] **No debug artifacts:** No `console.log`, `debugger`, or commented-out code left behind.
- [ ] **Imports organized:** External, internal, relative, types — in that order.

4. For each violation found, fix it immediately. Do not proceed to code review with known violations.
5. If a violation cannot be fixed without significant rework, document it as tech debt with a TODO referencing the issue.

**Output format:**
```
## Self-Review Results

### Fixed
- [file:line] Extracted 45-line function into 3 smaller functions
- [file:line] Replaced `any` with proper type
- [file:line] Added error handling for API call

### Accepted (tech debt)
- [file:line] TODO(#XX): [reason it can't be fixed now]

### No Issues Found
- [area] follows existing patterns
```

### Code Review Pipeline Step (inline — no separate skill)

This step runs after self-review and before final verification. It dispatches multiple specialized review agents in parallel, auto-fixes findings, and re-verifies until clean. The goal is shipping clean code, not a list of TODOs.

**Prerequisites:**
- At least `superpowers:code-reviewer` must be available (always true — superpowers is required)
- Additional agents from `pr-review-toolkit`, `feature-dev`, and `backend-api-security` are used when available

**Process:**

#### Phase 1: Dispatch review agents

Dispatch all available review agents in parallel. For each agent, use the Task tool with the agent's `subagent_type` (e.g., `subagent_type=pr-review-toolkit:code-simplifier`). Each agent's prompt should include the full branch diff (`git diff main...HEAD`) and a description of what to review. Launch all agents in a single message to run them concurrently.

| Agent | Plugin | Role | Fix Mode |
|-------|--------|------|----------|
| `pr-review-toolkit:code-simplifier` | pr-review-toolkit | DRY, clarity, maintainability | **Direct** — writes fixes to files |
| `pr-review-toolkit:silent-failure-hunter` | pr-review-toolkit | Silent failures, empty catches, bad fallbacks | **Direct** — auto-fixes common patterns |
| `feature-dev:code-reviewer` | feature-dev | Bugs, logic errors, security, conventions | **Report** → Claude fixes |
| `superpowers:code-reviewer` | superpowers | General quality, plan adherence | **Report** → Claude fixes |
| `pr-review-toolkit:pr-test-analyzer` | pr-review-toolkit | Test coverage quality, missing tests | **Report** → Claude fixes |
| `backend-api-security:backend-security-coder` | backend-api-security | Input validation, auth, OWASP top 10 | **Report** → Claude fixes |
| `pr-review-toolkit:type-design-analyzer` | pr-review-toolkit | Type encapsulation, invariants, type safety | **Report** → Claude fixes |

**Availability check:** Before dispatching, check which plugins are installed by looking for their skills in the loaded skill list. Skip agents whose plugins are missing. Announce: "Running N code review agents in parallel..." (where N is the count of available agents).

**Agent failure handling:** If an agent fails, crashes, or doesn't return, skip it and continue with available results. Do not stall the pipeline for a single agent failure. Log: "Agent [name] failed — skipping. Continuing with N remaining agents."

#### Phase 2: Review direct fixes

After all agents complete, the two direct-fix agents have already applied their changes to files. Review and summarize what they changed:

1. **`code-simplifier`** — Applied structural improvements directly (DRY extraction, clarity rewrites). Summarize what changed.
2. **`silent-failure-hunter`** — Auto-fixed common patterns (`catch {}` → `catch (e) { console.error(...) }`). Summarize what changed. Flag anything complex it couldn't auto-fix.

#### Phase 3: Consolidate and fix reported findings

Collect findings from the 5 reporting agents. Consolidate them:

1. **Deduplicate by file path + line number** — if two agents flag the same location, keep the higher-severity finding
2. **If same severity**, prefer the more specific agent: security > type-design > test-analyzer > feature-dev > superpowers
3. **Classify by severity:** Critical, Important, Minor
4. **Fix in order:** Critical → Important. Minor issues are logged as informational but not blocking.

For each Critical and Important finding, read the agent's recommendation and apply the fix. Specific agent fix patterns:
- **`pr-test-analyzer`:** Add missing test cases, strengthen weak assertions, add edge case coverage
- **`backend-security-coder`:** Fix injection, validation, and auth issues. Critical security issues are always fixed.
- **`type-design-analyzer`:** Improve type definitions based on encapsulation and invariant feedback
- **`feature-dev:code-reviewer` + `superpowers:code-reviewer`:** Fix bugs, logic errors, and convention violations

#### Phase 4: Re-verify (fix-verify loop)

After all fixes are applied, re-verify:

1. **Run tests:** Detect the test runner from the project:
   - `package.json` with `test` script → `npm test` / `yarn test` / `pnpm test` (based on lockfile)
   - `Makefile` with `test` target → `make test`
   - `pytest.ini` / `pyproject.toml` / `setup.cfg` with pytest config → `pytest`
   - `go.mod` → `go test ./...`
   - `Cargo.toml` → `cargo test`
   If no test runner detected, skip and log: "No test runner detected — skipping test verification."
2. **Run `verify-acceptance-criteria`:** Check all acceptance criteria from the implementation plan still pass.

If both pass → pipeline is clean. Proceed to the next lifecycle step.

If either fails → collect the failures as new findings and loop. **Maximum 3 iterations.** Announce: "Iteration N/3: M issues remaining, fixing..."

If still failing after 3 iterations → report remaining issues to the developer with context for manual resolution. Proceed to the next lifecycle step — the developer decides whether to fix manually.

#### Phase 5: Report

Output a summary:

```
## Code Review Pipeline Results

**Agents dispatched:** N/7
**Iterations:** M/3

### Fixed (auto)
- [agent] [file:line] [what was fixed]

### Fixed (Claude)
- [severity] [file:line] [what was fixed]

### Remaining (Minor — not blocking)
- [file:line] [description]

### Remaining (unfixed after 3 iterations)
- [file:line] [description + context for manual resolution]

**Status:** Clean / N issues remaining
```

### Generate CHANGELOG Entry Step (inline — no separate skill)

This step runs after code review and before final verification. It auto-generates a CHANGELOG entry from the feature branch's git commits and presents it for user approval before writing. It runs for all scopes except Quick fix.

**Process:**

#### Phase 1: Collect commits

1. Get all commit messages on the feature branch: `git log --format="%s" main...HEAD`
2. Filter out merge commits matching `^Merge (branch|pull request)`
3. Filter out fixup/squash commits matching `^(fixup|squash)!`
4. If no commits remain after filtering, skip the step: "No commits found on feature branch — skipping CHANGELOG generation."

#### Phase 2: Categorize by conventional commit prefix

For each commit message, match against these prefixes:

| Prefix | Keep a Changelog Category |
|--------|--------------------------|
| `feat:` | Added |
| `fix:` | Fixed |
| `refactor:` | Changed |
| `docs:` | Documentation |
| `test:` | Testing |
| `chore:` | Maintenance |

**Processing rules:**
1. Match prefix case-insensitively: `feat:`, `Feat:`, `FEAT:` all match
2. Strip the prefix and optional scope: `feat(csv): add export` → `Add export`
3. Capitalize the first letter of the remaining message
4. Deduplicate entries with identical messages (case-insensitive, keep first occurrence)
5. If no commits match any prefix, put all entries under a single `### Changes` category
6. Omit empty categories from the output

#### Phase 3: Detect version (optional)

Check these sources in order, use the first one found:

1. `package.json` → `version` field
2. `Cargo.toml` → `[package]` section `version` field
3. `pyproject.toml` → `[project]` section `version` field
4. `mix.exs` → `@version` attribute
5. Latest git tag matching semver pattern: `git tag --sort=-v:refname | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+' | head -1`

If a version is detected, present it alongside `[Unreleased]` via `AskUserQuestion`:
- **Option 1:** `[Unreleased]` (Recommended) — assign version at release time
- **Option 2:** `[X.Y.Z] - YYYY-MM-DD` — use detected version now

If no version detected, use `[Unreleased]` without asking.

#### Phase 4: Generate entry

Format the entry in Keep a Changelog format:

```
## [Unreleased]

### Added
- Entry from feat: commit
- Entry from feat: commit

### Fixed
- Entry from fix: commit

### Changed
- Entry from refactor: commit
```

Category order: Added, Fixed, Changed, Documentation, Testing, Maintenance, Changes (fallback last).

#### Phase 5: Present for approval

Present the generated entry to the user via `AskUserQuestion`:

- **Option 1:** "Looks good — write it" — proceed to write
- **Option 2:** "Let me edit" — user provides corrections in freeform text, entry is revised
- **Option 3:** "Skip CHANGELOG" — announce risk: "No CHANGELOG entry will be included in this PR. You may want to add one manually." Proceed to next lifecycle step.

#### Phase 6: Write to CHANGELOG.md

**If CHANGELOG.md exists with an `[Unreleased]` section:**
1. Parse existing categories under `[Unreleased]`
2. For each generated category:
   - If the category exists in the file, append new entries at the end of that category's list
   - If the category doesn't exist, add it after the last existing category under `[Unreleased]`
3. Deduplicate: skip any generated entry that matches an existing entry (case-insensitive)
4. Preserve all existing entries — never remove or reorder them

**If CHANGELOG.md exists without `[Unreleased]`:**
1. Find the first `## [` heading (the latest version section)
2. Insert the new `## [Unreleased]` section before it

**If no CHANGELOG.md exists:**
1. Create the file with the Keep a Changelog header:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

[generated categories and entries]
```

After writing, announce: "CHANGELOG.md updated with N entries across M categories."

**Output format:**
```
## CHANGELOG Generation Results

**Version heading:** [Unreleased] (or [X.Y.Z] - YYYY-MM-DD)
**Commits parsed:** N
**Entries generated:** M (after dedup)
**Categories:** [list]
**Action:** Written to CHANGELOG.md / Skipped by user
```

### Documentation Lookup Step (inline — no separate skill)

This step queries Context7 for current patterns relevant to the feature being built. It runs between brainstorming and the design document to ensure the design uses up-to-date patterns.

**Prerequisites:**
- The Context7 MCP plugin must be available (`context7@claude-plugins-official`)
- `.spec-driven.yml` must have a `context7` field (populated during auto-detection)

**If Context7 is not available:** Skip this step silently. Announce: "Context7 not available — skipping documentation lookup. Proceeding with stack reference files only."

**Process:**
1. From the brainstorming output, identify which stack technologies are relevant to this feature (e.g., a new API route touches Next.js + Supabase; a UI change touches Next.js only)
2. Read the `context7` field from `.spec-driven.yml` to get library IDs for relevant stacks
3. Query each relevant Context7 library using `mcp__plugin_context7_context7__query-docs` with a focused query about the feature's specific needs:
   - Example: building a new API route → query `/vercel/next.js` for "server actions error handling revalidation"
   - Example: adding a new table → query `/supabase/supabase-js` for "typed queries insert RPC" and `/websites/supabase` for "RLS policies migration"
4. Synthesize the results into a concise summary of recommended patterns
5. Pass these patterns to the design document step as context

**Output format:**
```
## Documentation Lookup Results

### [Stack Name] — Current Patterns
- [Pattern 1]: [code example or description]
- [Pattern 2]: [code example or description]

### Gotchas from Docs
- [Any deprecation warnings or common mistakes found in the docs]
```

**Quality rules:**
- Query at most 3 libraries per feature (focus on the most relevant)
- Keep queries specific to the feature, not generic
- If the docs contradict the stack reference file, note the discrepancy

### Step 4: Handle Interruptions

**Within the same session:**
- The todo list persists across messages — check it to determine which step is next
- If the user switches topics mid-lifecycle, retain the lifecycle state and resume when they return
- Announce: "Resuming lifecycle. Last completed step: [N]. Next: [N+1]."

**Across sessions (new conversation):**
- Todo lists do not persist across sessions. If the user says "resume the feature lifecycle," ask which feature and which step they were on.
- Check for artifacts from previous sessions: design docs in `docs/plans/`, open GitHub issues, existing worktrees, and branch history to infer progress.

### Step 5: Completion

When all steps are done:

```
Lifecycle complete!

Summary:
- Platform: [web/ios/android/cross-platform]
- Design doc: docs/plans/YYYY-MM-DD-feature.md
- Issue: #[number]
- PR: #[number]
- All acceptance criteria verified

[List any skipped steps and their risks]
[List any platform-specific notes (e.g., "App store submission pending")]
```

## Scope Adjustment Rules

During the lifecycle, the scope may need to change:

- **Upgrade:** Brainstorming reveals more complexity than expected → upgrade from "small enhancement" to "feature" and add missing steps
- **Downgrade:** Design verification finds no conflicts, spike confirms everything works → keep the steps but move through them quickly
- **Add spike:** Design verification reveals risky unknowns → insert a spike step before continuing

When adjusting, announce: "Adjusting scope from [old] to [new]. Adding/removing steps: [list]."

## Quality Rules

- **One step at a time.** Never run two lifecycle steps in parallel.
- **Skill invocation is mandatory.** Always invoke the mapped skill — do not perform the step manually and claim it's done.
- **Output verification.** Each step must produce its expected output before marking complete.
- **No silent skips.** If a step is skipped, it must be acknowledged with a reason.
- **Scope can change.** The lifecycle adapts to what is discovered during execution.
- **Platform context is loaded once.** Read `.spec-driven.yml` at the start; pass context to skills that need it.

## Additional Resources

### Reference Files

For detailed scope classification guidance and step descriptions:
- **`references/scope-guide.md`** — Detailed criteria for classifying work scope, with examples and edge cases

For project context and platform-specific lifecycle adjustments:
- **`../../references/project-context-schema.md`** — Schema for `.spec-driven.yml`
- **`../../references/platforms/mobile.md`** — Mobile lifecycle adjustments, required sections, beta testing checklist
- **`../../references/platforms/web.md`** — Web lifecycle adjustments
