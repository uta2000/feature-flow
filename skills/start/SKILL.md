---
name: start
description: This skill should be used when the user asks to "start:", "start a feature", "build a feature", "implement a feature", "new feature", "start working on", "I want to build", "let's build", "add a feature", or at the beginning of any non-trivial development work. It orchestrates the full lifecycle from idea to PR, invoking the right skills at each step.
tools: Read, Glob, Grep, Write, Edit, Bash, Task, AskUserQuestion, Skill
---

# Start — Lifecycle Orchestrator

Guide development work through the correct lifecycle steps, invoking the right skill at each stage. This is the single entry point for any non-trivial work.

**Announce at start:** "Starting the feature lifecycle. Let me check project context and determine the right steps."

## Pre-Flight Check

Before starting, verify required and recommended plugins are available.

### superpowers (required)

Check for its presence by looking for any skill starting with `superpowers:` in the loaded skill list (namespace-prefix detection) — do NOT invoke a superpowers skill just to test availability. If superpowers is not found, stop and tell the user:

```
The superpowers plugin is required but doesn't appear to be installed.
Install it first: claude plugins add superpowers
Then re-run start.
```

Do not proceed with the lifecycle if superpowers is missing — most steps depend on it.

### Context7 (required)

Check for the Context7 MCP plugin by looking for `mcp__plugin_context7_context7__resolve-library-id` in the available tools (use ToolSearch if needed). If Context7 is not found, warn the user:

```
The Context7 plugin is required for documentation lookups but doesn't appear to be installed.
Install it: claude plugins add context7
Without it, feature-flow cannot query up-to-date library documentation during design and implementation.
```

Do not proceed with the lifecycle if Context7 is missing — documentation lookups are a core part of the design phase. The `context7` field in `.feature-flow.yml` will not be populated, and the documentation lookup step, documentation compliance verification, and PreToolUse hook will all be non-functional.

### pr-review-toolkit (recommended)

Check for its presence by looking for any skill starting with `pr-review-toolkit:` in the loaded skill list (namespace-prefix detection). If not found, warn but continue:

```
The pr-review-toolkit plugin is recommended for full code review coverage.
Install it: claude plugins add pr-review-toolkit
Without it, the pr-review-toolkit subagent will not run — the code review pipeline will skip the pr-review-toolkit agents (silent-failure-hunter, code-simplifier, pr-test-analyzer, type-design-analyzer) that it dispatches internally.
```

### feature-dev (recommended)

Check for its presence by looking for any skill starting with `feature-dev:` in the loaded skill list (namespace-prefix detection). If not found, warn but continue:

```
The feature-dev plugin is recommended for code review.
Install it: claude plugins add feature-dev
Without it, the code review pipeline will skip: feature-dev reviewers.
```

### backend-api-security (recommended)

Check for its presence using two strategies (either is sufficient to consider it installed):
1. **Skill namespace prefix:** look for any skill starting with `backend-api-security:` in the loaded skill list
2. **Agent file path:** if not found in skill list, run `find ~/.claude/plugins/cache -maxdepth 3 -name backend-api-security -type d 2>/dev/null | head -1` — if output is non-empty, the plugin is installed as an agent-based plugin

If neither strategy detects the plugin, warn but continue:

```
The backend-api-security plugin is recommended for security review.
Install it: claude plugins add backend-api-security
Without it, the code review pipeline will skip: backend-api-security reviewers.
```

### Reviewer Stack Affinity Table

A static mapping of each code reviewer to the tech stacks it is relevant for. The orchestrator reads the `stack` field from `.feature-flow.yml` and uses this table for both the pre-flight audit and the code review pipeline dispatch.

| Reviewer | Plugin | Stack Affinity | Tier |
|----------|--------|---------------|------|
| `superpowers:code-reviewer` | superpowers | `*` (universal — all stacks) | 1 |
| `silent-failure-hunter` | pr-review-toolkit (internal) | `*` (universal) | 1 |
| `code-simplifier` | pr-review-toolkit (internal) | `*` (universal) | 2 |
| `feature-dev:code-reviewer` | feature-dev | `*` (universal) | 2 |
| `pr-test-analyzer` | pr-review-toolkit | `*` (universal) | 3 |
| `type-design-analyzer` | pr-review-toolkit | `typescript`, `node-js` | 3 |
| `backend-api-security:backend-security-coder` | backend-api-security | `node-js`, `python`, `go`, `ruby`, `java`, `supabase` | 3 |

Internal agents marked `(internal)` run inside their parent plugin's subagent and are not dispatched independently during the code review pipeline. They are excluded from the reviewer audit process (step 2 skips internal agents) but remain in this table as a reference for which agents each plugin provides.

### Pre-Flight Reviewer Audit, Marketplace Discovery & Install

**Read `references/step-lists.md` — "Pre-Flight Reviewer Audit", "Marketplace Discovery", and "Install Missing Plugins Prompt" sections** after completing plugin availability checks above.

### Tool Parameter Types

> **Post-compaction reminder:** Tool parameters must use correct types. Wrong types cause cascading failures.
>
> | Parameter | Tool | Correct type | Wrong type (do NOT use) |
> |-----------|------|-------------|------------------------|
> | `replace_all` | Edit | `boolean` — `true` or `false` | `'true'` / `'false'` (string) |
> | `offset` | Read | `number` — e.g. `100` | `'100'` (string) |
> | `limit` | Read | `number` — e.g. `50` | `'50'` (string) |

## Command-Line Flag Parsing

The `start:` command accepts optional flags to override tool selection:

**Usage:**
```bash
start: <description> [--feature-flow | --gsd]
```

**Parsing logic:**
1. Extract user input after `start:` keyword
2. Check for `--feature-flow` or `--gsd` flags at the end
3. If flag found, remove it from description and set override
4. If no flag, proceed with automatic detection

**Examples:**
- `start: add logout button --feature-flow` → description: "add logout button", override: feature-flow
- `start: build complete app --gsd` → description: "build complete app", override: gsd
- `start: build payments system` → description: "build payments system", override: none (auto-detect)

**Priority:**
1. Command-line flags (highest priority)
2. Config file settings (tool_selector section)
3. Automatic heuristic detection (default)

If flag is present, skip all other logic and use that flag's value.

## Configuration Loading

The start skill reads tool_selector config from `.feature-flow.yml`:

**Precedence (highest to lowest):**
1. Command-line flags (`--feature-flow` or `--gsd`) if provided
2. Config file values from `.feature-flow.yml` → tool_selector section
3. Built-in defaults (enabled: true, threshold: 0.7, auto_launch: false)

**Reading config:**
- Extract tool_selector section from .feature-flow.yml
- Parse enabled, confidence_threshold, auto_launch_gsd values
- Use defaults if section or keys missing

**Config values:**
- `tool_selector.enabled` (boolean, default: true)
  - If false: Skip tool selection entirely, proceed with feature-flow
  - If true: Run detection and show recommendation if confident

- `tool_selector.confidence_threshold` (float 0-1, default: 0.7)
  - Only show recommendation if calculated confidence >= threshold
  - Example: score 0.65 with threshold 0.7 → no recommendation shown

- `tool_selector.auto_launch_gsd` (boolean, default: false)
  - If true: Launch GSD automatically when GSD is recommended
  - If false: Ask user "Launch GSD or use feature-flow?" first

**Default values:**
```yaml
tool_selector:
  enabled: true
  confidence_threshold: 0.7
  auto_launch_gsd: false
```

## Recommendation Display

Display recommendation to user with confidence level:

**If tool_selector.enabled = false:**
Skip display entirely, proceed directly with feature-flow.

**If confidence < threshold:**
Show quiet notification:
```
✅ This looks like feature-flow work. Starting...
```

**If confidence in band 🟡 (0.4–0.7):**
```
✅ Project Analysis:
  • Features detected: 4
  • Scope: "complete SaaS from scratch"
  • Timeline: weeks/months
  • Confidence: 65%

🟡 Recommendation: This could be a GSD project.

GSD handles multiple features through parallel execution and wave-based delivery.
Feature-flow excels at single features with deep verification and thorough testing.

Which would you prefer?
  [Launch GSD]  [Use feature-flow anyway]
```

**If confidence in band 🔴 (0.7+):**
```
✅ Project Analysis:
  • Features detected: 5
  • Scope: "build from scratch"
  • Timeline: 2+ months
  • Confidence: 82%

🔴 Recommendation: This is a GSD project.

Multiple independent features work best in parallel. Feature-flow is built for
focused single-feature development with thorough testing.

Which would you prefer?
  [Launch GSD (Recommended)]  [Use feature-flow anyway]
```

**User interaction:**
- If tool_selector.auto_launch_gsd = true: Auto-launch GSD without prompt
- If tool_selector.auto_launch_gsd = false: Show buttons, wait for user choice

**Output clarity:**
- Use emoji indicators (🟢/🟡/🔴) for confidence level
- List detected features and scope for transparency
- Explain WHY each tool is recommended
- Keep explanations brief (2-3 sentences max)

## GSD Handoff Mechanism

When user chooses "Launch GSD", prepare context handoff:

**Step 1: Extract project metadata**
Read from `.feature-flow.yml`:
- stack (node-js, react, python, etc.)
- database (postgres, mongodb, etc.)
- Any other project context

**Step 2: Generate handoff payload**

Create `.gsd-handoff.json` in repo root:
```json
{
  "source": "feature-flow",
  "timestamp": "2026-03-09T14:30:00Z",
  "original_description": "build complete SaaS with payments, billing, analytics",
  "stack": "node-js/react/typescript",
  "database": "postgres",
  "repo_url": "current working directory path",
  "repo_state": "clean",
  "metadata": {
    "features_detected": 4,
    "recommendation_confidence": 0.8,
    "detected_features": ["payments", "invoicing", "billing", "analytics"],
    "detected_scope": "from scratch",
    "recommended_tool_reason": "4+ features detected + 'from scratch' + weeks timeline"
  }
}
```

**Step 3: Launch GSD**
```bash
npx get-shit-done-cc@latest --handoff-from-feature-flow
```

GSD detects `.gsd-handoff.json` and:
1. Reads the `original_description`
2. Skips "what are you building?" questions
3. Jumps to "Let me clarify scope..." phase

**Step 4: Cleanup**
After GSD exits (success or cancel):
- Delete `.gsd-handoff.json`
- Return control to user or shell

**Error handling:**
- If GSD not installed: Show install command, offer to continue with feature-flow
- If handoff file can't be written: Launch GSD normally (user pastes description again)
- If user cancels GSD: Ask "return to feature-flow or exit?"

## Tool Selector Heuristic Detection

Six heuristic detection functions inform the "which tool" decision in `start` Step 1. These signals combine into a confidence score (0.0–1.0) that recommends either feature-flow or GSD.

### Feature Count Detection

Extract distinct features from user description:
- Pattern: Look for action verbs followed by nouns: "add X", "build Y", "implement Z"
- Use regex: \b(add|build|implement|create|develop|design|make|write)\s+([a-z\s]+?)(?=and|,|then|\s+with|\s+for|$)
- Split by "and", count distinct items
- Examples:
  - "add a logout button" → 1 feature
  - "build payments and invoicing" → 2 features
  - "create payments, billing, analytics, dashboards" → 4 features

Scoring:
- 1 feature: +0 (neutral baseline)
- 2-3 features: +0.1
- 4+ features: +0.3

### Scope Keyword Detection

Search for high-confidence GSD indicators:
- Keywords: "from scratch", "complete app", "full system", "entire", "build everything"
- Keywords: "multiple independent", "parallel execution", "separate services"
- Keywords: "full project", "entire product"

Scoring:
- 1+ keyword found: +0.4 (high weight)
- No keywords: +0 (neutral)

### Timeline Detection

Parse time estimates:
- Feature-flow signals: "1-2 hours", "a few hours", "today", "this afternoon"
- GSD signals: "1-2 weeks", "several weeks", "a month", "a sprint", "2-3 months"

Scoring:
- GSD timeline (weeks+): +0.2
- Feature-flow timeline (hours): -0.1 (slightly reduces GSD score)
- No timeline: +0 (neutral)

### Complexity Pattern Detection

Detect architectural complexity:
- Multiple tech stack mentions (e.g., "React frontend AND Node backend AND PostgreSQL")
- Microservices references: "services", "distributed", "microservice", "API gateway"
- Explicit numbers: "50+ tasks", "10+ pages", "20+ endpoints"

Scoring:
- Complexity pattern found: +0.2
- No pattern: +0 (neutral)

### Recommendation Scoring

Combine all signals into a single confidence score (0.0–1.0):

| Signal | Weight | Condition |
|--------|--------|-----------|
| 4+ features | +0.3 | Feature count >= 4 |
| 2-3 features | +0.1 | Feature count = 2-3 |
| Scope keyword | +0.4 | 1+ keyword found |
| GSD timeline | +0.2 | "weeks", "months", etc. |
| Feature-flow timeline | -0.1 | "hours", "today", etc. |
| Complexity pattern | +0.2 | Multiple stacks or microservices |

Final score bands:
- 🟢 feature-flow (0.0–0.4): Small, 1-2 features, hours-scale
- 🟡 GSD-recommended (0.4–0.7): Multi-feature, weeks-scale
- 🔴 GSD-strongly-recommended (0.7+): Large, 5+ features, "from scratch"

## Purpose

Ensure the lifecycle is followed from start to finish. Track which steps are complete, invoke the right skill at each stage, and do not advance until the current step is done.

## Process

### Step 0: Load or Create Project Context

**Read `references/project-context.md`** for full Step 0 details. Summary of substeps:
1. YOLO/Express trigger phrase detection (word-boundary matching on `--yolo`, `yolo mode`, `--express`, etc.)
2. Load or create `.feature-flow.yml` (version drift check, stack cross-check, auto-detection)
3. Base branch detection (cascade: `.feature-flow.yml` → git config → develop/staging → main/master)
4. Session model recommendation (Sonnet-first routing)
5. Notification preference (macOS-only, saved to `.feature-flow.yml`)

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

**Fast-track detection (small enhancement only):**

This check runs only after scope has been classified as "small enhancement" in the table below. After scoring issue richness and evaluating inline context, check if the small enhancement qualifies for a fast-track lifecycle:

1. **Condition:** Scope is classified as "small enhancement" AND either:
   - Issue richness score is 3+ (detailed issue), OR
   - Inline context provides equivalent detail (specific approach, file references, acceptance criteria)
2. **If fast-track qualifies:**
   - Set `fast_track` flag for step list building
   - Announce activation:
     - **YOLO/Express:** `"YOLO: start — Small enhancement fast-track → Activated (issue #N richness: [score]/4). Skipping: brainstorming, design document, verify-plan-criteria."` (for Express mode, substitute `Express:` for `YOLO:` in the announcement)
     - **Interactive:** `"Issue #N has detailed requirements (richness: [score]/4). Fast-tracking: skipping brainstorming, design document, and verify-plan-criteria. The issue content serves as the design."`
3. **If fast-track does not qualify:** Use the standard 17-step small enhancement list. No announcement needed.

Fast-track detection runs after scope classification and before the combined scope + mode prompt. The step count in the prompt reflects the fast-track status: 14 steps if fast-track qualifies, 17 steps otherwise.

**Scope classification:**

| Scope | Description | Example |
|-------|------------|---------|
| **Quick fix** | Single-file bug fix, typo, config change | "Fix the null check in the login handler" |
| **Small enhancement** | 1-3 files, well-understood change, no new data model | "Add a loading spinner to the search page" |
| **Feature** | Multiple files, new UI or API, possible data model changes | "Add CSV export to the results page" |
| **Major feature** | New page/workflow, data model changes, external API integration, pipeline changes | "Build a creative domain generator with LLM" |

See `references/scope-guide.md` for detailed criteria, examples, and edge cases.

**Smart recommendation logic:**

Determine the recommended mode using three signals:

| Scope | Default | With detailed issue | With detailed inline context |
|-------|---------|--------------------|-----------------------------|
| Quick fix | YOLO | YOLO | YOLO |
| Small enhancement | YOLO | YOLO | YOLO |
| Feature | Interactive | YOLO (override) | YOLO (override) |
| Major feature | Interactive | Express | Express |

**Context pressure estimates (scope × mode):**

| Scope | Interactive | Express | YOLO |
|-------|-------------|---------|------|
| Quick fix (7 steps) | Low | Low | Low |
| Small enhancement (14-17 steps) | Medium | Low | Low |
| Feature (18 steps) | High | Medium | Medium |
| Major feature (19 steps) | Very High | High | High |

**Combined scope + mode prompt:**

Present the classification AND mode recommendation to the user in a **single** `AskUserQuestion`. The question text includes the scope, step count, and (if applicable) issue context summary.

**Question format:**
```
This looks like a **[scope]** ([N] steps).
[If issue linked: "Found issue #N: [title] — [richness summary]."]

Run mode?
```

**Context warning (conditional):**

When the recommended mode is Interactive AND the context pressure for Interactive at the current scope is High or Very High, add a context note line to the question text:

```
This looks like a **[scope]** ([N] steps).
[If issue linked: "Found issue #N: [title] — [richness summary]."]
Context note: Interactive mode at this scope typically requires 3-4 /compact pauses. Express auto-selects decisions while preserving those checkpoints.

Run mode?
```

**When to show the context note:**
- Feature + sparse context (High pressure in Interactive) → show note
- Major feature + sparse context (Very High pressure in Interactive) → show note
- All other cases → no context note (either pressure is Low-Medium, or the recommended mode already accounts for context pressure)

**Option ordering depends on recommendation:**

*YOLO recommended* (quick fix, small enhancement, or feature with detailed context):
- Option 1: "YOLO — fully unattended, no pauses" with description: "*Recommended — [reasoning]*"
- Option 2: "Express — I'll auto-select decisions but pause for design approval and at phase transitions to optionally compact the conversation"
- Option 3: "Interactive — I'll interview you to address outstanding design questions, with pauses at phase transitions to optionally compact the conversation"

*Interactive recommended* (feature/major without detailed context):
- Option 1: "Interactive — I'll interview you to address outstanding design questions, with pauses at phase transitions to optionally compact the conversation" with description: "*Recommended — [reasoning]*"
- Option 2: "Express — I'll auto-select decisions but pause for design approval and at phase transitions to optionally compact the conversation"
- Option 3: "YOLO — fully unattended, no pauses"

*Express recommended* (major feature with detailed issue or detailed inline context):
- Option 1: "Express — I'll auto-select decisions but pause for design approval and at phase transitions to optionally compact the conversation" with description: "*Recommended — detailed requirements cover design decisions; Express preserves compaction checkpoints at each phase transition.*"
- Option 2: "Interactive — I'll interview you to address outstanding design questions, with pauses at phase transitions to optionally compact the conversation"
- Option 3: "YOLO — fully unattended, no pauses"

*Footnote (always shown after the options):* "For Express and Interactive: at each pause you can run `/compact` then type 'continue' to resume, or just type 'continue' to skip compaction."

The recommended option always appears first in the list. Each option's description includes italicized reasoning when a recommendation is made.

**Scope correction:** If the user believes the scope is misclassified, they can select "Other" on the `AskUserQuestion` and state their preferred scope. The lifecycle will adjust the step list and checkpoint rules accordingly.

**YOLO behavior (trigger phrase activated):** If YOLO was already activated by a trigger phrase in Step 0, skip this question entirely. Auto-classify scope and announce: `YOLO: start — Scope + mode → [scope], YOLO (trigger phrase)`

**Express behavior (trigger phrase activated):** If Express was already activated by a trigger phrase in Step 0, skip this question entirely. Auto-classify scope and announce: `Express: start — Scope + mode → [scope], Express (trigger phrase)`

**Express behavior:** If the user selects "Express", set Express mode active. All YOLO auto-selection overrides apply for skill invocations, but context window checkpoints and design approval checkpoints are shown instead of suppressed.

### Step 2: Build the Step List

Based on scope AND platform, determine which steps apply. **Read `references/step-lists.md` — "Step Lists" section** for the step list for each scope (quick fix, small enhancement standard/fast-track, feature, major feature) and mobile platform adjustments.

Use the `TaskCreate` tool to create a todo item for each step. Call all TaskCreate tools in a **single parallel message**.

### Step 3: Execute Steps in Order

For each step, follow this pattern:

1. **Announce the step:** "Step N: [name]. Invoking [skill name]."
2. **Mark in progress (conditional):** Only set `in_progress` via `TaskUpdate` before starting steps where the work is extended and the user benefits from an active status indicator. **Steps that keep `in_progress`:** study existing patterns, implementation, self-review, code review, generate CHANGELOG entry, final verification, documentation lookup. **Steps that skip `in_progress`:** brainstorming, design document, design verification, create/update issue, implementation plan, verify plan criteria, worktree setup, copy env files, commit planning artifacts, commit and PR, comment and close issue. Note: sub-step 5 (`completed`) is always retained — it is the turn-continuity bridge. Skipping `in_progress` does not affect YOLO Execution Continuity. Note: YOLO propagation (prepending `yolo: true`) applies only to `Skill()` invocations, not to `Task()` dispatches.
3. **Invoke the skill** using the Skill tool (see mapping below and `../../references/tool-api.md` — Skill Tool for correct parameter names)
4. **Confirm completion:** Verify the step produced its expected output. *(Turn Bridge Rule — include any confirmation notes alongside the `TaskUpdate` call in step 5, not as a separate text-only response.)*
5. **Mark complete:** Update the todo item to `completed` — **always call `TaskUpdate` here.** *(Turn Bridge Rule — this call keeps your turn alive.)* **Batching optimization:** When the next step (N+1) is in the `in_progress`-eligible list (study existing patterns, implementation, self-review, code review, generate CHANGELOG entry, final verification, documentation lookup), send both `TaskUpdate` calls as a single parallel message: `[TaskUpdate(N, completed), TaskUpdate(N+1, in_progress)]`. This saves one API round-trip per eligible step transition. If N is the final lifecycle step, no N+1 exists — skip the batch and call only `TaskUpdate(N, completed)` as usual.
6. **Check for context checkpoint:** If the just-completed step is a checkpoint trigger (see Context Window Checkpoints section), and the current mode is not YOLO, and the current scope includes this checkpoint — output the checkpoint block and wait for the user to respond before announcing the next step.
7. **Announce next step and loop:** "Step N complete. Next: Step N+1 — [name]." Then **immediately loop back to sub-step 1 (Announce the step)** for the next lifecycle step.

**YOLO Execution Continuity (CRITICAL):** In YOLO mode, the execution loop must be **uninterrupted**. After completing one step, proceed directly to the next step in the same turn — do NOT end your turn between steps. The most common failure mode is: a skill outputs text (e.g., brainstorming decisions table), the assistant's turn ends because there are no pending tool calls, and the user must type "continue" to resume — this defeats the purpose of YOLO ("fully unattended, no pauses"). To prevent this: apply the **Turn Bridge Rule** (below) after every step, then continue to step 7 and loop back to step 1 for the next step.

**Turn Bridge Rule:** After outputting results for any inline step, **immediately call `TaskUpdate` to mark that step complete in the same response** — do not end your turn with only text output. A text-only response ends your turn and forces the user to type "continue" to resume, which breaks YOLO continuity. The `TaskUpdate` tool call is the bridge that keeps your turn alive between lifecycle steps.

**YOLO Propagation:** When YOLO mode is active, prepend `yolo: true. scope: [scope].` to the `args` parameter of every `Skill` invocation. Scope context is required because design-document uses it to determine checkpoint behavior. For example:

```
Skill(skill: "superpowers:brainstorming", args: "yolo: true. scope: [scope]. [original args]")
Skill(skill: "feature-flow:design-document", args: "yolo: true. scope: [scope]. [original args]")
```

**Express Propagation:** When Express mode is active, prepend `express: true. scope: [scope].` to the `args` parameter of every `Skill` invocation. Express inherits all YOLO auto-selection overrides — skills that check for `yolo: true` should also check for `express: true` and behave the same way (auto-select decisions). The only difference is at the orchestrator level where checkpoints are shown instead of suppressed. For example:

```
Skill(skill: "superpowers:brainstorming", args: "express: true. scope: [scope]. [original args]")
Skill(skill: "feature-flow:design-document", args: "express: true. scope: [scope]. [original args]")
```

For inline steps (CHANGELOG generation, self-review, code review, study existing patterns), the mode flag is already in the conversation context — no explicit propagation is needed.

**Lifecycle Context Object:** As the lifecycle executes, maintain a context object that accumulates artifact paths as they become known. Include all known paths in the `args` of every subsequent `Skill` invocation, after the mode flag and scope:

| Path key | When it becomes available |
|----------|--------------------------|
| `base_branch` | Step 0 — base branch detection |
| `issue` | Step 1 — when an issue number is linked |
| `design_doc` | After design document step (the absolute path returned by the skill) |
| `plan_file` | After implementation plan step (the absolute path of the saved plan file) |
| `worktree` | After worktree setup (the absolute path to the created worktree) |

Include only paths that are known at the time of each invocation — do not include paths for artifacts that haven't been created yet. Example invocations showing progressive accumulation:

```
# Before design doc (base_branch and issue known):
Skill(skill: "superpowers:brainstorming", args: "yolo: true. scope: [scope]. base_branch: main. issue: 119. [original args]")

# Before implementation (plan_file and design_doc known, worktree not yet):
Skill(skill: "superpowers:writing-plans", args: "yolo: true. scope: [scope]. base_branch: main. issue: 119. design_doc: /abs/path/design.md. [original args]")

# During and after implementation (all paths known):
Skill(skill: "superpowers:subagent-driven-development", args: "yolo: true. scope: [scope]. plan_file: /abs/path/plan.md. design_doc: /abs/path/design.md. worktree: /abs/path/.worktrees/feat-xyz. base_branch: main. issue: 119. [original args]")
Skill(skill: "feature-flow:verify-acceptance-criteria", args: "plan_file: /abs/path/plan.md. [original args]")
```

**Do not skip steps.** If the user asks to skip a step, explain why it matters and confirm they want to skip. If they insist, mark it as skipped and note the risk.

### Skill Mapping

| Step | Skill to Invoke | Expected Output |
|------|----------------|-----------------|
| Brainstorm requirements | `superpowers:brainstorming` | Decisions on scope, approach, UX |
| Spike / PoC | `feature-flow:spike` | Confirmed/denied assumptions |
| Documentation lookup | No skill — inline step (see below) | Current patterns from official docs injected into context |
| Design document | `feature-flow:design-document` | File at `docs/plans/YYYY-MM-DD-*.md` |
| Study existing patterns | No skill — inline step (see below) | Understanding of codebase conventions for the areas being modified |
| Design verification | `feature-flow:design-verification` | Blockers/gaps identified and fixed |
| Create issue | `feature-flow:create-issue` | GitHub issue URL. **If an issue number was detected in Step 1**, pass it to create-issue as the `existing_issue` context — the skill will update the existing issue instead of creating a new one. |
| Implementation plan | `superpowers:writing-plans` | Numbered tasks with acceptance criteria. **Override:** After the plan is saved, always proceed with subagent-driven execution — do not present the execution choice to the user. Immediately invoke `superpowers:subagent-driven-development`. |
| Verify plan criteria | `feature-flow:verify-plan-criteria` | All tasks have verifiable criteria |
| Commit planning artifacts | No skill — inline step (see below) | Planning docs and config committed to base branch |
| Worktree setup | `superpowers:using-git-worktrees` | Isolated worktree created. **Override:** When checking for existing worktree directories, use `test -d` instead of `ls -d` — the `ls -d` command returns a non-zero exit code when the directory doesn't exist, causing false Bash tool errors. Example: `test -d .worktrees && echo "exists" \|\| echo "not found"`. |
| Copy env files | No skill — inline step (see below) | Env files available in worktree |
| Implement | `superpowers:subagent-driven-development` | Code written with tests, spec-reviewed, and quality-reviewed per task |
| Self-review | No skill — inline step (see below) | Code verified against coding standards before formal review |
| Code review | No skill — inline step (see below) | All Critical/Important findings fixed, tests pass |
| Generate CHANGELOG entry | No skill — inline step (see below) | CHANGELOG.md updated with categorized entry |
| Final verification | No skill — inline step (see below) | All criteria PASS + quality gates pass (or skipped if Phase 4 already passed) |
| Commit and PR | `superpowers:finishing-a-development-branch` | PR URL |
| Device matrix testing | No skill — manual step | Tested on min OS, small/large screens, slow network |
| Beta testing | No skill — manual step | TestFlight / Play Console build tested by internal tester |
| App store review | No skill — manual step | Submission accepted |
| Comment and close issue | No skill — inline step (see below) | Issue commented with implementation summary + closed |

### Orchestration Overrides

**Read `references/orchestration-overrides.md`** for phase-boundary model hints, brainstorming interview format override (including YOLO self-answering), context window checkpoints (locations, scope filtering, suppression rules), and Express design approval checkpoint.

### YOLO/Express Overrides

**Read `references/yolo-overrides.md`** when in YOLO or Express mode. Contains overrides for: Writing Plans, Using Git Worktrees, Finishing a Development Branch, and Subagent-Driven Development.

### Quality Context Injections

**Read `references/yolo-overrides.md` — "Writing Plans Quality Context Injection", "Subagent-Driven Development Context Injection", and "Implementer Quality Context Injection" sections.** These apply unconditionally in all modes (YOLO, Express, Interactive).

### Model Routing Defaults

**Read `references/model-routing.md`** for the full model routing tables. Summary: Sonnet-first for all mechanical phases; Opus only for brainstorming and design document phases. Subagents: Explore → haiku, general-purpose → sonnet, Plan → sonnet.

### Commit Planning Artifacts Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Commit Planning Artifacts Step" section** when reaching this step.

### Copy Env Files Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Copy Env Files Step" section** when reaching this step.

### Study Existing Patterns Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Study Existing Patterns Step" section** when reaching this step.

### Self-Review Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Self-Review Step" section** when reaching this step.

### Code Review Pipeline Step (inline — no separate skill)

**Read `references/code-review-pipeline.md`** when reaching this step. Contains Phases 0-5: deterministic pre-filter, pr-review-toolkit pre-pass, report-only agents, conflict detection, single-pass fix, targeted re-verification, and report.

### Generate CHANGELOG Entry Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Generate CHANGELOG Entry Step" section** when reaching this step.

### Comment and Close Issue Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Comment and Close Issue Step" section** when reaching this step.

### Documentation Lookup Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Documentation Lookup Step" section** when reaching this step.

### Final Verification Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Final Verification Step" section** when reaching this step.

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
- Issue: #[number] (commented and closed) [or "(no issue linked)" if none]
- PR: #[number] → [base branch]
- All acceptance criteria verified

Worktree: [Removed / Still active at .worktrees/feature-name]
[If still active: "Run `git worktree remove .worktrees/feature-name` when done."]

What to do next:
1. Review PR #[number] on GitHub (or request team review)
2. After PR merges to [base branch], verify in [base branch] environment
3. Clean up local branch: `git branch -d feature-name && git fetch --prune`

[List any skipped steps and their risks]
[List any platform-specific notes (e.g., "App store submission pending")]
```

**Decision Log (if YOLO or Express mode was active):**

If the lifecycle ran in YOLO or Express mode, read `../../references/decision-log-templates.md` and append the appropriate decision log template (YOLO or Express) after the standard completion summary. Interactive mode does not produce a decision log.

**Cancellation:** There is no formal YOLO/Express cancellation mechanism. Inline announcements (`YOLO: [skill] — [decision] → [option]` or `Express: [skill] — [decision] → [option]`) serve as an "emergency brake" — the user sees each decision as it's made and can interrupt the lifecycle at any point by sending a message. The lifecycle will pause at the current step, and the user can redirect from there.

## Scope Adjustment Rules

During the lifecycle, the scope may need to change:

- **Upgrade:** Brainstorming reveals more complexity than expected → upgrade from "small enhancement" to "feature" and add missing steps
- **Fast-track upgrade:** Implementation planning or documentation lookup reveals more complexity than expected for a fast-tracked small enhancement → upgrade to "feature" scope, insert brainstorming, design document, design verification, and verify-plan-criteria steps before the current step, and resume from brainstorming
- **Downgrade:** Design verification finds no conflicts, spike confirms everything works → keep the steps but move through them quickly
- **Add spike:** Design verification reveals risky unknowns → insert a spike step before continuing

When adjusting, announce: "Adjusting scope from [old] to [new]. Adding/removing steps: [list]."

## Quality Rules

- **One step at a time.** Never run two lifecycle steps in parallel.
- **Skill invocation is mandatory.** Always invoke the mapped skill — do not perform the step manually and claim it's done.
- **Output verification.** Each step must produce its expected output before marking complete.
- **No silent skips.** If a step is skipped, it must be acknowledged with a reason.
- **Scope can change.** The lifecycle adapts to what is discovered during execution.
- **Platform context is loaded once.** Read `.feature-flow.yml` at the start; pass context to skills that need it.

## Additional Resources

### Reference Files

Extracted reference files (read on-demand during lifecycle execution):
- **`references/project-context.md`** — Step 0: YOLO triggers, .feature-flow.yml, base branch, model recommendation, notifications
- **`references/step-lists.md`** — Step 2: scope-specific step lists, mobile adjustments, pre-flight reviewer audit/marketplace/install
- **`references/orchestration-overrides.md`** — Phase-boundary hints, brainstorming interview format, context checkpoints, Express design approval
- **`references/yolo-overrides.md`** — YOLO/Express overrides for writing-plans, git-worktrees, finishing-branch, subagent-driven-dev; quality context injections
- **`references/code-review-pipeline.md`** — Code review pipeline Phases 0-5
- **`references/inline-steps.md`** — 8 inline step definitions (documentation lookup, commit artifacts, copy env, study patterns, self-review, CHANGELOG, final verification, comment/close issue)
- **`references/model-routing.md`** — Model routing defaults (orchestrator phases + subagent dispatches)
- **`references/scope-guide.md`** — Detailed criteria for classifying work scope

External reference files:
- **`../../references/project-context-schema.md`** — Schema for `.feature-flow.yml`
- **`../../references/platforms/mobile.md`** — Mobile lifecycle adjustments, required sections, beta testing checklist
- **`../../references/platforms/web.md`** — Web lifecycle adjustments
