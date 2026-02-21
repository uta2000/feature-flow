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

**YOLO Trigger Phrase Detection:**

Before any other processing, check if the user requested YOLO mode via a trigger phrase. Parse the `ARGUMENTS` string for trigger phrases using **word-boundary matching** (not substring matching, to avoid false positives like "build a yolo-themed game"):

1. Check for trigger phrases:
   - `--yolo` (flag style — match as a standalone token)
   - `yolo mode` (natural language phrase)
   - `run unattended` (natural language phrase)
2. If a trigger is found:
   - Set YOLO mode active for the remainder of the lifecycle
   - Announce: "YOLO mode active. Auto-selecting recommended options. Decision log will be printed at completion."
   - Strip the trigger phrase from the arguments before further processing (so `start feature: add CSV export --yolo` becomes `start feature: add CSV export` for scope classification)
3. If no trigger is found:
   - Do nothing here — the YOLO/Interactive mode prompt is presented in Step 1 after scope classification, where the system can make a smart recommendation based on scope and issue context.

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

**YOLO behavior:** If YOLO mode is active, skip this question. Auto-accept all detected dependency additions and announce: `YOLO: start-feature — Stack cross-check → Auto-added: [list of new dependencies]`

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

**YOLO behavior:** If YOLO mode is active, skip this question. Accept the detected context as-is and announce: `YOLO: start-feature — Platform/stack detection → Accepted: [platform], [stack list]`

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

**Issue richness scoring (when an issue is linked):**

Assess the linked issue for context richness. Count the following signals:
1. Has acceptance criteria or clear requirements sections
2. Has resolved discussion in comments (answered questions)
3. Has concrete examples, mockups, or specifications
4. Body is >200 words with structured content (headings, lists, tables)

A score of 3+ means the issue is "detailed."

**Inline context richness:**

If the user's initial message (not the issue) contains detailed design decisions — specific approach descriptions, UX flows, data model specifics, or concrete behavior specifications — treat this as equivalent to a detailed issue for recommendation purposes.

**Scope classification:**

| Scope | Description | Example |
|-------|------------|---------|
| **Quick fix** | Single-file bug fix, typo, config change | "Fix the null check in the login handler" |
| **Small enhancement** | 1-3 files, well-understood change, no new data model | "Add a loading spinner to the search page" |
| **Feature** | Multiple files, new UI or API, possible data model changes | "Add CSV export to the results page" |
| **Major feature** | New page/workflow, data model changes, external API integration, pipeline changes | "Build a creative domain generator with LLM" |

**Smart recommendation logic:**

Determine the recommended mode using three signals:

| Scope | Default | With detailed issue | With detailed inline context |
|-------|---------|--------------------|-----------------------------|
| Quick fix | YOLO | YOLO | YOLO |
| Small enhancement | YOLO | YOLO | YOLO |
| Feature | Interactive | YOLO (override) | YOLO (override) |
| Major feature | Interactive | Neutral | Neutral |

**Combined scope + mode prompt:**

Present the classification AND mode recommendation to the user in a **single** `AskUserQuestion`. The question text includes the scope, step count, and (if applicable) issue context summary.

**Question format:**
```
This looks like a **[scope]** ([N] steps).
[If issue linked: "Found issue #N: [title] — [richness summary]."]

Run mode?
```

**Option ordering depends on recommendation:**

*YOLO recommended* (quick fix, small enhancement, or feature with detailed context):
- Option 1: "YOLO — auto-select recommended options" with description: "*Recommended — [reasoning]*"
- Option 2: "Interactive — all questions asked normally"

*Interactive recommended* (feature/major without detailed context):
- Option 1: "Interactive — all questions asked normally" with description: "*Recommended — [reasoning]*"
- Option 2: "YOLO — auto-select recommended options"

*Neutral* (major feature with detailed issue or detailed inline context):
- Option 1: "Interactive — all questions asked normally" (no recommendation marker)
- Option 2: "YOLO — auto-select recommended options" (no recommendation marker)

The recommended option always appears first in the list. Each option's description includes italicized reasoning when a recommendation is made.

**Scope correction:** If the user believes the scope is misclassified, they can select "Other" on the `AskUserQuestion` and state their preferred scope. The lifecycle will adjust the step list and checkpoint rules accordingly.

**YOLO behavior (trigger phrase activated):** If YOLO was already activated by a trigger phrase in Step 0, skip this question entirely. Auto-classify scope and announce: `YOLO: start-feature — Scope + mode → [scope], YOLO (trigger phrase)`

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
- [ ] 7. Commit planning artifacts
- [ ] 8. Worktree setup
- [ ] 9. Copy env files
- [ ] 10. Study existing patterns
- [ ] 11. Implement (TDD)
- [ ] 12. Self-review
- [ ] 13. Code review
- [ ] 14. Generate CHANGELOG entry
- [ ] 15. Final verification
- [ ] 16. Commit and PR
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
- [ ] 8. Commit planning artifacts
- [ ] 9. Worktree setup
- [ ] 10. Copy env files
- [ ] 11. Study existing patterns
- [ ] 12. Implement (TDD)
- [ ] 13. Self-review
- [ ] 14. Code review
- [ ] 15. Generate CHANGELOG entry
- [ ] 16. Final verification
- [ ] 17. Commit and PR
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
- [ ] 9. Commit planning artifacts
- [ ] 10. Worktree setup
- [ ] 11. Copy env files
- [ ] 12. Study existing patterns
- [ ] 13. Implement (TDD)
- [ ] 14. Self-review
- [ ] 15. Code review
- [ ] 16. Generate CHANGELOG entry
- [ ] 17. Final verification
- [ ] 18. Commit and PR
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

**YOLO Propagation:** When YOLO mode is active, prepend `yolo: true. scope: [scope].` to the `args` parameter of every `Skill` invocation. Scope context is required for graduated YOLO behavior — design-document uses it to determine whether a mandatory checkpoint is needed. For example:

```
Skill(skill: "superpowers:brainstorming", args: "yolo: true. scope: [scope]. [original args]")
Skill(skill: "spec-driven:design-document", args: "yolo: true. scope: [scope]. [original args]")
```

For inline steps (CHANGELOG generation, self-review, code review, study existing patterns), the YOLO flag is already in the conversation context — no explicit propagation is needed.

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
| Commit planning artifacts | No skill — inline step (see below) | Planning docs and config committed to base branch |
| Worktree setup | `superpowers:using-git-worktrees` | Isolated worktree created |
| Copy env files | No skill — inline step (see below) | Env files available in worktree |
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

**YOLO behavior:** When YOLO mode is active (i.e., `yolo: true` is in the brainstorming args), do NOT present questions to the user. Instead:

1. The LLM answers its own interview questions using all available context: issue body, issue comments, codebase analysis, and existing patterns
2. For each question, announce: `YOLO: brainstorming — [question summary] → [selected option with reasoning]`
3. Proceed through all brainstorming questions autonomously
4. Ensure all self-answered decisions are captured when passing context to the design document step

This is the most complex YOLO interaction — the LLM makes design-level decisions. The user reviews these via the design document output rather than each micro-decision.

**Graduated YOLO checkpoint (Major Feature only):**

After all brainstorming questions have been self-answered, if the scope is **Major Feature**, present a mandatory checkpoint summarizing all auto-answered decisions:

```
YOLO checkpoint: Brainstorming complete. Here are the design decisions I made:

| # | Question | Decision |
|---|----------|----------|
| 1 | [question] | [selected option with reasoning] |
| ... | ... | ... |

Continue or adjust?
```

Use `AskUserQuestion` with options:
- "Continue" — proceed to design document with these decisions
- "Let me adjust" — user provides corrections to specific decisions, then YOLO resumes

For Quick fix, Small enhancement, and Feature scopes, skip this checkpoint — proceed directly from brainstorming to the next step.

### Graduated YOLO Behavior

When YOLO mode is active (whether from trigger phrase or user selection), the number of mandatory checkpoints scales with scope complexity:

| Scope | Checkpoints | Where |
|-------|------------|-------|
| Quick fix | 0 | Full autonomy — zero interactive prompts |
| Small enhancement | 0 | Full autonomy — zero interactive prompts |
| Feature | 1 | Design document approval (before implementation) |
| Major feature | 2 | Brainstorming output summary + Design document approval |

**Checkpoint UX:** Mandatory checkpoints are presented via `AskUserQuestion`:

```
YOLO checkpoint: [artifact summary]. Continue or adjust?
```

Options:
- "Continue" — resume YOLO mode for remaining steps
- "Let me adjust" — user provides corrections, then YOLO resumes (does NOT switch to interactive for remaining steps)

**Scope upgrade rule:** If scope is upgraded during the lifecycle (e.g., Small Enhancement → Feature via Scope Adjustment Rules), adopt the checkpoint rules of the new scope for all remaining steps.

**What checkpoints do NOT affect:** All other YOLO decisions (platform detection, CHANGELOG heading, gotcha additions, issue creation, plan criteria approval) remain fully auto-selected regardless of scope.

### Commit Planning Artifacts Step (inline — no separate skill)

This step runs after verify-plan-criteria and before worktree setup. It commits design documents and project config to the base branch so the worktree inherits them via git history, preventing untracked file clutter.

**Process:**
1. Check if there are planning artifacts to commit:
   ```bash
   git status --porcelain docs/plans/*.md .spec-driven.yml 2>/dev/null
   ```
2. If no files are reported (empty output), skip the step: "No planning artifacts to commit — skipping."
3. Stage the planning artifacts:
   ```bash
   git add docs/plans/*.md .spec-driven.yml
   ```
4. Commit with a descriptive message using the feature name from Step 1:
   ```bash
   git commit -m "docs: add design and implementation plan for [feature-name]"
   ```

**Edge cases:**
- **`.spec-driven.yml` already tracked and unchanged** — `git add` is a no-op for unchanged tracked files, so this is safe
- **No plan files exist** — handled by the guard check in step 1
- **Only `.spec-driven.yml` changed (no plan docs)** — still commits; the file should be tracked regardless

### Copy Env Files Step (inline — no separate skill)

This step runs after worktree setup and before study existing patterns. It copies non-production `.env*` files from the main worktree into the new worktree so that tests, tools, and dependency scripts have access to environment configuration.

**Process:**
1. Locate the main worktree root:
   ```bash
   MAIN_WORKTREE=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
   ```
2. Copy non-production env files:
   ```bash
   for f in "$MAIN_WORKTREE"/.env*; do
     [ -f "$f" ] || continue
     name=$(basename "$f")
     case "$name" in
       .env.production|.env.production.local|*.production|*.production.*) continue ;;
       .env.example) continue ;;
     esac
     cp "$f" "./$name"
   done
   ```
3. **If env files were copied:** Announce what was copied: `"Copied N env files from main worktree: .env .env.local"`
4. **If no env files exist:** Silent skip — not all projects use env files. Do not warn or error.

**Why before study existing patterns:** Ensures environment variables are available for implementation, test runs, and any tools that depend on env configuration later in the lifecycle. Production files are excluded as a safety measure (principle of least privilege).

**What is skipped and why:**
- `.env.production`, `.env.production.local`, any `*.production` or `*.production.*` — never propagate production secrets to development worktrees
- `.env.example` — tracked by git, already present in the worktree automatically

### Study Existing Patterns Step (inline — no separate skill)

This step runs after copy env files and before implementation. It forces reading the actual codebase to understand how similar things are done before writing new code. This prevents "vibing" — writing code that works but doesn't follow the project's established patterns.

**Process:**
1. Read `../../references/coding-standards.md` to load the senior-engineer principles
2. Identify the areas of the codebase that will be modified or extended (from the implementation plan)
3. **Parallel dispatch** — For each identified area, dispatch one Explore agent to read 2-3 example files and extract patterns. Each agent also flags anti-patterns (files >300 lines, mixed concerns, circular dependencies, duplicated logic).

   Use the Task tool with `subagent_type=Explore` and `model: haiku`. Launch all agents in a **single message** to run them concurrently. Announce: "Dispatching N pattern study agents in parallel..."

   **Context passed to each agent:**
   - Area name and file paths/directories to examine
   - Instructions: read 2-3 example files, extract file structure, error handling, naming conventions, and state management patterns
   - Instructions: flag anti-patterns — files exceeding 300 lines (god files), mixed concerns, circular dependency imports, duplicated logic

   **Expected return format per agent:**

   ```
   { area: string, patterns: [{ aspect: string, pattern: string }], antiPatterns: [{ file: string, issue: string, recommendation: string }] }
   ```

   **Failure handling:** If an agent fails or crashes, retry it once. If it fails again, skip that area and log a warning: "[Area] pattern study failed — skipping. Continuing with available results."

4. **Consolidation** — Merge all agent results into the following sections:

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

   **Anti-Patterns Found (do NOT replicate):**

```
### Anti-Patterns Found (do NOT replicate)
- `[file]` ([N] lines) — [issue]. [recommendation].
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

6. Pass these patterns, the "How to Code This" notes, AND any anti-pattern warnings from the consolidated output to the implementation step as mandatory context. **New code MUST follow these patterns unless there is a documented reason to deviate.**

**Quality rules:**
- Read at least 2 existing files per area being modified
- Don't just skim — understand the pattern deeply enough to replicate it
- If existing patterns conflict with coding-standards.md, note the conflict and follow the existing codebase pattern (consistency > purity)
- If existing patterns conflict with structural quality (god files, tight coupling), document the conflict. New code follows the better pattern, not the existing anti-pattern. Note: this is the ONE exception to the "consistency > purity" rule — structural anti-patterns should not be replicated even for consistency.

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
- [ ] **No god files:** No new file exceeds 300 lines or handles more than 2-3 responsibilities.
- [ ] **No circular dependencies:** New imports don't create cycles. If file A imports from file B, file B does not import (directly or transitively) from file A.
- [ ] **Dependency direction:** New code depends on abstractions (interfaces, types, shared utilities), not on implementation details of other features.
- [ ] **Duplication across files:** No logic block is copy-pasted from another file. If similar logic exists, import from the canonical source or extract a shared utility.

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

**Model override:** If the user has requested a specific model for the entire lifecycle (e.g., "use opus for everything" or "use sonnet for everything"), apply that model to all agent dispatches in this code review pipeline, overriding the per-agent defaults in the table.

#### Phase 1: Dispatch review agents

Dispatch all available review agents in parallel. For each agent, use the Task tool with the agent's `subagent_type` and `model` parameter (see table below). Each agent's prompt should include the full branch diff (`git diff main...HEAD`) and a description of what to review. Launch all agents in a single message to run them concurrently.

| Agent | Plugin | Role | Fix Mode | Model |
|-------|--------|------|----------|-------|
| `pr-review-toolkit:code-simplifier` | pr-review-toolkit | DRY, clarity, maintainability | **Direct** — writes fixes to files | sonnet |
| `pr-review-toolkit:silent-failure-hunter` | pr-review-toolkit | Silent failures, empty catches, bad fallbacks | **Direct** — auto-fixes common patterns | sonnet |
| `feature-dev:code-reviewer` | feature-dev | Bugs, logic errors, security, conventions | **Report** → Claude fixes | opus |
| `superpowers:code-reviewer` | superpowers | General quality, plan adherence | **Report** → Claude fixes | opus |
| `pr-review-toolkit:pr-test-analyzer` | pr-review-toolkit | Test coverage quality, missing tests | **Report** → Claude fixes | sonnet |
| `backend-api-security:backend-security-coder` | backend-api-security | Input validation, auth, OWASP top 10 | **Report** → Claude fixes | opus |
| `pr-review-toolkit:type-design-analyzer` | pr-review-toolkit | Type encapsulation, invariants, type safety | **Report** → Claude fixes | sonnet |

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

1. **Run tests:** Detect the test runner from the project (matching the quality gate's `detectTestCommand()` in `hooks/scripts/quality-gate.js`):
   - `package.json` with `scripts.test` (not the npm default placeholder) → `npm test`. If `node_modules` doesn't exist, skip with warning.
   - `Cargo.toml` → `cargo test`
   - `go.mod` → `go test ./...`
   - `mix.exs` → `mix test`
   - `pyproject.toml` / `pytest.ini` / `setup.cfg` / `tox.ini` → `python -m pytest`
   - If no test runner detected, skip and log: "No test runner detected — skipping test verification."
   - **Timeout:** 60 seconds. If the test suite times out, log a warning and skip (do not count as a failure).
   - **Error handling:** If the test command is not found (ENOENT / exit code 127), log a warning and skip. Do not fail the pipeline for a missing tool.
2. **Run `verify-acceptance-criteria`:** Check all acceptance criteria from the implementation plan still pass.

If both pass → pipeline is clean. Proceed to the next lifecycle step.

If either fails → collect the failures as new findings and loop. **Maximum 3 iterations.** Announce: "Iteration N/3: M issues remaining, fixing..."

If still failing after 3 iterations → report remaining issues to the developer with context for manual resolution. Proceed to the next lifecycle step — the developer decides whether to fix manually.

#### Phase 5: Report

Output a summary:

```
## Code Review Pipeline Results

**Agents dispatched:** N/7
**Model override:** [None | user-requested: \<model\>]
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

**YOLO behavior:** If YOLO mode is active, skip this question. Auto-select `[Unreleased]` and announce: `YOLO: start-feature — CHANGELOG version heading → [Unreleased]`

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

**YOLO behavior:** If YOLO mode is active, skip this question. Auto-select "Looks good — write it" and announce: `YOLO: start-feature — CHANGELOG entry → Accepted`

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

**YOLO Decision Log (if YOLO mode was active):**

If the lifecycle ran in YOLO mode, append the decision log after the standard completion summary. The format varies by whether checkpoints were used:

**Full YOLO (quick fix / small enhancement — no checkpoints):**

```
## YOLO Decision Log

**Mode:** YOLO (system recommended — [scope] scope, low complexity)

| # | Skill | Decision | Auto-Selected |
|---|-------|----------|---------------|
| 1 | start-feature | Scope + mode | [scope], YOLO recommended |
| ... | ... | ... | ... |

**Total decisions auto-selected:** N
**Quality gates preserved:** hooks, tests, verification, code review
```

**Graduated YOLO (feature / major feature — with checkpoints):**

```
## YOLO Decision Log

**Mode:** YOLO with checkpoints (system recommended — [scope] scope, [reasoning])
**Checkpoints presented:** M

| # | Skill | Decision | Auto-Selected |
|---|-------|----------|---------------|
| ... | ... | ... | ... |
| N | design-document | Document approval | ✋ User reviewed (approved / adjusted) |
| ... | ... | ... | ... |

**Total decisions auto-selected:** N
**Checkpoints presented:** M of M approved [with/without changes]
```

**Cancellation:** There is no formal YOLO cancellation mechanism. Inline announcements (`YOLO: [skill] — [decision] → [option]`) serve as an "emergency brake" — the user sees each decision as it's made and can interrupt the lifecycle at any point by sending a message. The lifecycle will pause at the current step, and the user can redirect from there.

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
