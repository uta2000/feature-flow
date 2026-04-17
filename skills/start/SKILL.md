---
name: start
description: This skill should be used when the user asks to "start:", "start a feature", "build a feature", "implement a feature", "new feature", "start working on", "I want to build", "let's build", "add a feature", or at the beginning of any non-trivial development work. It orchestrates the full lifecycle from idea to PR, invoking the right skills at each step.
tools: Read, Glob, Grep, Write, Edit, Bash, Task, AskUserQuestion, Skill
---

# Start — Lifecycle Orchestrator

Guide development work through the correct lifecycle steps, invoking the right skill at each stage. This is the single entry point for any non-trivial work.

**Announce at start:** "Starting the feature lifecycle. Analyzing your project to recommend the right tool..."

## Triage

Before brainstorming, analyze your project description to determine the correct path: **quick** (bounded trivial edit confirmed by code), **feature-flow** (standard lifecycle), or **GSD** (multi-feature project).

### Step 1: Check if tool selection is enabled

Read `.feature-flow.yml` and look for `tool_selector.enabled`:
- If `enabled: false` → skip tool selection, proceed directly to brainstorming
- If `enabled: true` or missing → continue to step 2

### Step 2: Check for command-line overrides

Did the user include `--feature-flow`, `--gsd`, or `--no-quick` flag?
- If `--feature-flow` present → remove flag from description, skip detection, use feature-flow
- If `--gsd` present → remove flag from description, skip detection, launch GSD
- If `--no-quick` present → remove flag from description, record `no_quick_override = true`, continue to step 3 (Quick-Path Confirmation will be skipped; heuristic scoring runs normally)
- If `--quick` or any other `--foo` token is present that is NOT in `--feature-flow` / `--gsd` / `--no-quick` → surface: *"Unknown flag `--foo`. Quick path is opt-out only (`--no-quick`); there is no `--quick` flag. Continuing with auto-detection."* Strip the token from description and continue to step 3.
- If no flags → continue to step 3

### Step 3: Run heuristic detection

**Before running heuristic scoring, run Quick-Path Confirmation** (a read-only gate sequence). If all gates pass, take the quick path (Step 5 → Step 6 quick-path branch) and skip heuristic scoring entirely. If any gate fails, fall through to heuristic scoring below — unchanged.

#### Quick-Path Confirmation

Quick path is available when `tool_selector.quick_path.enabled` is `true` (default) and `no_quick_override` is not set (see Step 2 — set by the `--no-quick` flag). If either condition is false, skip this subsection entirely and proceed to heuristic scoring.

Run gates in strict order 0 → 4. **First failure short-circuits immediately** — do not run later gates. Pass budget: **≤5 Bash/Grep/Read/Glob tool calls total across all gates**. In-process AST tokenization and byte-range overlap checks are free (do not count). If you reach 5 tool calls before all gates pass, abort confirmation and fall through silently.

Once a file is Read (1 budget call), Claude may reason over its contents freely for Gate 3 and Gate 4 without further cost — but *re-reading* the same file counts as an additional call.

| # | Gate | Pass condition | Fail surface |
|---|------|----------------|--------------|
| 0 | **Clean working tree** | `git status --porcelain` returns empty | Surface to user: *"Working tree is dirty — running normal lifecycle to avoid trampling in-progress work."* Then fall through to heuristic scoring. |
| 1 | **Concrete target identifiable** | Description names a file path, function name, symbol, or string literal | Surface to user: *"No specific target named — running normal lifecycle. If you meant a specific file, say `start: fix typo in X.ts line 42`."* Then fall through. |
| 2 | **Bounded file count** | Target resolves to ≤ `max_files` files (default 3) | Silent fallthrough |
| 3 | **No exported-declaration overlap** | The edit's byte range does not overlap any `export` / `export default` / `module.exports` AST node. Check is mechanical byte-range overlap — not a "flows outward" semantic analysis. Edits to the body of a re-exported internal symbol pass Gate 3 (byte range does not overlap the `export` node itself); Gate 4 catches such edits via identifier-position exclusion. | Silent fallthrough |
| 4 | **Lexical-region rule** | Every proposed `old_string` byte range sits entirely inside one of: **(a)** Markdown prose outside `` ``` `` fences; **(b)** a string literal node in a code file that is **not** a syntactic argument to a `log.*` / `logger.*` / `console.*` call expression (walk up to nearest `CallExpression` or `TaggedTemplateExpression`; if callee root identifier matches case-insensitively, fail); **(c)** a line or block comment node. Identifiers, keywords, imports, type annotations, decorators, numeric/boolean literals, operators always fail. Unsupported languages (not Markdown/TypeScript/JavaScript/Python) conservatively fail. Multiple `old_string` ranges: all must pass individually. | Silent fallthrough |

**Gate 4 log-call exclusion detail:** From the matched string-literal node, walk up to the nearest enclosing `CallExpression` or `TaggedTemplateExpression`. Resolve the callee to its **root identifier** (the leftmost name in `a.b.c.d(...)` is `a`; for `this.x.y(...)`, the root is `this` — in which case look one level in: `x`). If the root identifier (case-insensitive) is exactly `log`, `logger`, or `console` → Gate 4 **fails**. Does NOT match `logging` (Python stdlib) — Python's `logging` module is a separate exclusion documented under Gate 4 edge cases below.

**Python `logging.*` exclusion:** Python `logging.*` calls (e.g. `logging.info(...)`, `logging.warning(...)`) are also excluded via the same CallExpression ancestor walk — if the root identifier case-insensitively equals `logging`, Gate 4 fails.

**Gate 4 whitespace tolerance:** If a proposed `old_string` region, extended by leading/trailing whitespace to the nearest non-whitespace character, would cross out of the confirmed lexical region, Gate 4 **fails** (fail-closed).

**Edge cases — Gate 4 fails when in doubt.** The following all fail Gate 4 regardless of surface appearance: (a) TypeScript type-position string literals (`const x: "foo" = ...` — the first `"foo"` is a type, not a value); (b) expressions inside f-strings / template literals (`f"hello {user.name}"`, `` `hello ${user.name}` `` — the `{user.name}` / `${user.name}` region is an expression, not string content); (c) JSX attribute values that are identifiers or expressions rather than string literals; (d) any string-like syntax Claude cannot confidently classify to an AST node kind in a single pass. When the region kind is not unambiguously string-literal / comment / MD-prose, Gate 4 fails.

**Budget exhaustion:** If the 5-tool-call budget is reached before all gates finish evaluating, silently fall through to heuristic scoring. The change is not quick by definition.

**On all-pass:** Set `quick_path_confirmed = true`. Record confirmed scope: the set of file paths and their confirmed lexical regions (held in working context only — no state file). Proceed to Step 5 (⚡ band) and then Step 6 quick-path execution branch.

---

Analyze user's project description using heuristics:
1. Extract feature count (using regex for action verbs)
2. Check for scope keywords ("from scratch", "complete app", etc.)
3. Parse timeline mentions ("hours" vs "weeks/months")
4. Detect complexity patterns (multiple stacks, microservices, explicit counts)

Calculate weighted confidence score (0.0–1.0) using scoring table.

### Step 4: Check confidence threshold

**If `quick_path_confirmed` is set** (from Step 3), skip this step entirely and proceed to Step 5. Confidence threshold applies only to the heuristic-scoring path.

Read `tool_selector.confidence_threshold` from .feature-flow.yml (default: 0.7):
- If calculated_confidence < threshold → skip recommendation, proceed with feature-flow
- If calculated_confidence >= threshold → continue to step 5

### Step 5: Display recommendation

Show recommendation based on path or confidence band:

- **⚡ quick path** — reached only via Quick-Path Confirmation gates (Step 3), never via heuristic scoring. Emit the announcement line HERE, immediately before Step 6 begins. Announce in a single auditable line before making any edits:
  ```
  ⚡ Quick path confirmed: <path>:<line> — <region kind> in <language>, <N> file(s), budget: ≤<max_changed_lines> lines. Editing directly.
  ```
  Where `<region kind>` is one of: `prose edit in Markdown`, `comment edit in TypeScript`, `string-literal edit in Python`, etc. `<max_changed_lines>` is the configured cap, not the actual diff size — actual post-edit line count is recorded in the commit message body. Then proceed immediately to Step 6 quick-path execution branch.
- **🟢 feature-flow** (0.0–0.4): Skip display, proceed silently
- **🟡 GSD-recommended** (0.4–0.7): Display recommendation, ask user to choose
- **🔴 GSD-strongly-recommended** (0.7+): Display recommendation, ask user to choose

### Step 6: Execute user choice

**If `quick_path_confirmed` is set (from Step 3 Quick-Path Confirmation):** Execute the quick-path flow below. Do not prompt the user for a choice — the confirmation gates already verified the scope.

#### Quick-Path Execution (8-step flow)

1. **The announcement has already been emitted at Step 5.** Step 6 step 1 is a reference-only placeholder; do not re-emit.
2. **Record confirmed scope** — note the set of confirmed file paths and their confirmed lexical regions in working context. **No state file. No `.feature-flow/session-state.json`.** Scope set lifetime is this single skill invocation.
3. **Edit the file(s) in the confirmed set** via the Edit tool.
4. **Run Stop-hook checks** (tsc, lint, type-sync). Stop hook may auto-format / auto-fix, changing diff size.
5. **Post-hook pre-commit budget check:** run `git diff --numstat` summed across confirmed files (added + removed lines). If total > `max_changed_lines` (default 10) → escape hatch (step 6). This runs **after** Stop hook so auto-format changes are included.
6. **Hard-assertion escape hatch:** If the edit touched any file **outside** the confirmed set, introduced a new exported symbol, exceeded `max_changed_lines`, or the Stop hook failed → hard stop. Run:
   ```bash
   # Remove any newly-created files in the confirmed set (git checkout -- does not)
   git clean -f -- <all confirmed file paths>
   # Restore modifications to tracked files in the confirmed set
   git checkout -- <all confirmed file paths>
   ```
   `git clean` first removes untracked (newly-created) files; `git checkout` then restores tracked modifications. Multi-file atomic across both cases because Gate 0 proved the pre-state clean.

   (Safe because Gate 0 guarantees the tree was clean before quick path wrote anything — this only discards what quick path itself wrote. Restore is multi-file atomic: all confirmed files, even if only one was edited.) Then tell the user:
   > `⚠ Quick path misclassified this change (<reason>). No commit made, working tree restored. Re-run with \`start: <description>\` for the full lifecycle.`
   Stop. Do not commit, do not fall through.
7. **Commit.** Check `git log --oneline -10` to observe the project's existing commit prefix style (e.g., `docs:`, `fix:`, `feat:`, `refactor:`). Write the commit message in imperative mood, following that style. Include the actual post-edit line count in the message body (`N lines changed`). **No Claude co-author trailer** — quick-path commits are deterministic, top-to-bottom model edits, not human-model collaborations; adding a co-author trailer would misrepresent their authorship.
8. **Skip everything else.** No design doc, no design verification, no implementation plan, no acceptance criteria doc, no handoff. The commit and the auditable announcement line are the only artifacts.

**Interrupted-turn recovery.** Scope set lives in working context only (no state file, by design). If the turn is interrupted between step 3 (edit applied) and step 6 (escape-hatch assertion) — e.g., context overflow, user `Ctrl+C`, mid-hook error — the scope set is lost and edits remain on disk. No automatic cleanup runs. The next `start:` invocation's Gate 0 check will detect the dirty tree and route to normal lifecycle; the user can commit or revert manually from there. This is the documented recovery path.

---

**If `quick_path_confirmed` is not set (normal paths):**

- If user chooses "Use feature-flow" → proceed with brainstorming
- If user chooses "Launch GSD" → execute GSD handoff (see below)
- If `auto_launch_gsd: true` → skip user choice, execute GSD handoff automatically

### GSD Handoff Execution

When launching GSD:

1. **Extract metadata** from `.feature-flow.yml` (stack, database, etc.)
2. **Create `.gsd-handoff.json`** with:
   - original_description (from start command)
   - stack, database, repo info
   - features_detected, recommendation_confidence
   - detected_features, detected_scope, recommended_tool_reason
3. **Launch GSD:**
   ```bash
   npx get-shit-done-cc@latest --handoff-from-feature-flow
   ```
4. **Handle errors:**
   - If GSD not installed → show install instructions, offer to continue with feature-flow
   - If handoff file write fails → launch GSD normally (user re-explains)
   - If user cancels GSD → ask "return to feature-flow or exit?"
5. **Cleanup:** Delete `.gsd-handoff.json` after GSD exits

---

## Pre-Flight Check

Before starting, build the plugin registry by scanning installed plugins.

**Read `references/plugin-scanning.md`** for the full scanning process, keyword classification, and registry management.

### Dynamic Plugin Registry

At Step 0, feature-flow scans `~/.claude/plugins/cache/` to discover all installed plugins. It reads each plugin's `plugin.json` manifest and component metadata, classifies capabilities via keyword matching into 8 lifecycle roles, and persists the results in `.feature-flow.yml` under `plugin_registry`.

Base plugins (superpowers, context7, pr-review-toolkit, feature-dev, backend-api-security) are always present with hardcoded known roles. Discovered plugins extend beyond the base set. If a base required plugin (superpowers, context7) is missing, stop the lifecycle with an installation message. If a recommended plugin is missing, warn and continue.

After scanning, run fallback validation: verify base plugins are actually loaded in the current session via namespace-prefix detection in the skill/tool list.

### Pre-Flight Reviewer Audit, Marketplace Discovery & Install

**Read `references/step-lists.md` — "Pre-Flight Reviewer Audit", "Marketplace Discovery", and "Install Missing Plugins Prompt" sections** after completing the registry scan above. The audit now reads from `plugin_registry` in `.feature-flow.yml` instead of individual hardcoded checks.

### Tool Parameter Types

> **Reminder:** Tool parameters must use correct types. Wrong types cause cascading failures.
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
start: <description> [--feature-flow | --gsd | --no-quick]
```

**Parsing logic:**
1. Extract user input after `start:` keyword
2. Check for `--feature-flow`, `--gsd`, or `--no-quick` flags at the end
3. If flag found, remove it from description and set override
4. If no flag, proceed with automatic detection

**Flag: `--no-quick`** — disables quick-path confirmation for this invocation. Quick-Path Confirmation (Step 3) is skipped entirely; the lifecycle falls directly into heuristic scoring. There is **no `--quick` flag** — quick path is opt-out, not opt-in.

**Examples:**
- `start: add logout button --feature-flow` → description: "add logout button", override: feature-flow
- `start: build complete app --gsd` → description: "build complete app", override: gsd
- `start: fix typo in README.md --no-quick` → quick path disabled for this run, normal lifecycle
- `start: build payments system` → description: "build payments system", override: none (auto-detect)

**Priority (highest to lowest):**
1. `--gsd` (highest — existing)
2. `--feature-flow` (existing)
3. `--no-quick` (new — disables quick path for this invocation)
4. Config file `tool_selector.quick_path.enabled`
5. Automatic heuristic detection / built-in default (`enabled: true`)

`--no-quick` × `quick_path.enabled: false` is a documented no-op: the CLI flag confirms the config. No error.

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

- `tool_selector.quick_path.enabled` (boolean, default: true)
  - If false: Quick-Path Confirmation is skipped for all invocations (same effect as always passing `--no-quick`)
  - If true: Quick-Path Confirmation runs before heuristic scoring

- `tool_selector.quick_path.max_confirmation_tool_calls` (integer ≥ 1, default: 5)
  - Maximum Bash/Grep/Read/Glob tool calls during Quick-Path Confirmation. In-process AST work does not count.
  - If budget is exhausted before all gates pass, fall through silently.

- `tool_selector.quick_path.max_files` (integer ≥ 1, default: 3)
  - Gate 2 passes if the target resolves to ≤ this many files.
  - Default 3 (not 1) so multi-file prose fixes like "fix typos in README and CHANGELOG" can take the quick path.

- `tool_selector.quick_path.max_changed_lines` (integer ≥ 1, default: 10)
  - Post-hook pre-commit budget: total added + removed lines across confirmed files must be ≤ this value.
  - Measured after the Stop hook runs (catches auto-format expansion).
  - The stronger scale guardrail — binds total edit size regardless of file count.

**Default values:**
```yaml
tool_selector:
  enabled: true
  confidence_threshold: 0.7
  auto_launch_gsd: false
  quick_path:
    enabled: true
    max_confirmation_tool_calls: 5
    max_files: 3
    max_changed_lines: 10
```

Defaults if the `quick_path` sub-section is missing: all four keys use the values above. Quick path is **on** out of the box.

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
4. Session model check
5. Notification preference (macOS-only, saved to `.feature-flow.yml`)
6. YOLO stop_after reading (from `.feature-flow.yml`)

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
| Feature (21 steps) | High | Medium | Medium |
| Major feature (22 steps) | Very High | High | High |

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
Context note: Interactive mode at this scope involves extended conversation. Express auto-selects decisions while preserving design approval checkpoints.

Run mode?
```

**When to show the context note:**
- Feature + sparse context (High pressure in Interactive) → show note
- Major feature + sparse context (Very High pressure in Interactive) → show note
- All other cases → no context note (either pressure is Low-Medium, or the recommended mode already accounts for context pressure)

**Option ordering depends on recommendation:**

*YOLO recommended* (quick fix, small enhancement, or feature with detailed context):
- Option 1: "YOLO — fully unattended, no pauses" with description: "*Recommended — [reasoning]*"
- Option 2: "Express — I'll auto-select decisions but pause for design approval"
- Option 3: "Interactive — I'll interview you to address outstanding design questions"

*Interactive recommended* (feature/major without detailed context):
- Option 1: "Interactive — I'll interview you to address outstanding design questions" with description: "*Recommended — [reasoning]*"
- Option 2: "Express — I'll auto-select decisions but pause for design approval"
- Option 3: "YOLO — fully unattended, no pauses"

*Express recommended* (major feature with detailed issue or detailed inline context):
- Option 1: "Express — I'll auto-select decisions but pause for design approval" with description: "*Recommended — detailed requirements cover design decisions; Express auto-selects while preserving design approval gate.*"
- Option 2: "Interactive — I'll interview you to address outstanding design questions"
- Option 3: "YOLO — fully unattended, no pauses"

*Footnote (always shown after the options):* "Express pauses at design approval. Interactive pauses for each design question."

The recommended option always appears first in the list. Each option's description includes italicized reasoning when a recommendation is made.

**Scope correction:** If the user believes the scope is misclassified, they can select "Other" on the `AskUserQuestion` and state their preferred scope. The lifecycle will adjust the step list and checkpoint rules accordingly.

**YOLO behavior (trigger phrase activated):** If YOLO was already activated by a trigger phrase in Step 0, skip this question entirely. Auto-classify scope and announce: `YOLO: start — Scope + mode → [scope], YOLO (trigger phrase)`

**Express behavior (trigger phrase activated):** If Express was already activated by a trigger phrase in Step 0, skip this question entirely. Auto-classify scope and announce: `Express: start — Scope + mode → [scope], Express (trigger phrase)`

**Express behavior:** If the user selects "Express", set Express mode active. All YOLO auto-selection overrides apply for skill invocations, but design approval checkpoints are shown instead of suppressed.

### Step 2: Build the Step List

Based on scope AND platform, determine which steps apply. **Read `references/step-lists.md` — "Step Lists" section** for the step list for each scope (quick fix, small enhancement standard/fast-track, feature, major feature) and mobile platform adjustments.

Use the `TaskCreate` tool to create a todo item for each step. Call all TaskCreate tools in a **single parallel message**.

### Step 3: Execute Steps in Order

For each step, follow this pattern:

1. **Announce the step:** "Step N: [name]. Invoking [skill name]."
2. **Mark in progress (conditional):** Only set `in_progress` via `TaskUpdate` before starting steps where the work is extended and the user benefits from an active status indicator. **Steps that keep `in_progress`:** study existing patterns, implementation, self-review, code review, generate CHANGELOG entry, final verification, documentation lookup. **Steps that skip `in_progress`:** brainstorming, design document, design verification, create/update issue, implementation plan, verify plan criteria, worktree setup, copy env files, commit planning artifacts, commit and PR, post implementation comment. Note: sub-step 5 (`completed`) is always retained — it is the turn-continuity bridge. Skipping `in_progress` does not affect YOLO Execution Continuity. Note: YOLO propagation (prepending `yolo: true`) applies only to `Skill()` invocations, not to `Task()` dispatches.
3. **Invoke the skill** using the Skill tool (see mapping below and `../../references/tool-api.md` — Skill Tool for correct parameter names)
4. **Confirm completion:** Verify the step produced its expected output. *(Turn Bridge Rule — include any confirmation notes alongside the `TaskUpdate` call in step 5, not as a separate text-only response.)*
5. **Mark complete:** Update the todo item to `completed` — **always call `TaskUpdate` here.** *(Turn Bridge Rule — this call keeps your turn alive.)* **Batching optimization:** When the next step (N+1) is in the `in_progress`-eligible list (study existing patterns, implementation, self-review, code review, generate CHANGELOG entry, final verification, documentation lookup), send both `TaskUpdate` calls as a single parallel message: `[TaskUpdate(N, completed), TaskUpdate(N+1, in_progress)]`. This saves one API round-trip per eligible step transition. If N is the final lifecycle step, no N+1 exists — skip the batch and call only `TaskUpdate(N, completed)` as usual.
6. **Announce next step and loop:** "Step N complete. Next: Step N+1 — [name]." Then **immediately loop back to sub-step 1 (Announce the step)** for the next lifecycle step.

**YOLO Execution Continuity (CRITICAL):** In YOLO mode, the execution loop must be **uninterrupted**. After completing one step, proceed directly to the next step in the same turn — do NOT end your turn between steps. The most common failure mode is: a skill outputs text (e.g., brainstorming decisions table), the assistant's turn ends because there are no pending tool calls, and the user must type "continue" to resume — this defeats the purpose of YOLO ("fully unattended, no pauses"). To prevent this: apply the **Turn Bridge Rule** (below) after every step, then continue to step 7 and loop back to step 1 for the next step.

**Turn Bridge Rule:** After outputting results for any inline step, **immediately call `TaskUpdate` to mark that step complete in the same response** — do not end your turn with only text output. A text-only response ends your turn and forces the user to type "continue" to resume, which breaks YOLO continuity. The `TaskUpdate` tool call is the bridge that keeps your turn alive between lifecycle steps.

**YOLO Propagation:** When YOLO mode is active, prepend `yolo: true. scope: [scope].` to the `args` parameter of every `Skill` invocation. Scope context is required because design-document uses it to determine checkpoint behavior.

**YOLO Model Routing (CRITICAL):** In YOLO mode, brainstorming and design document phases MUST be dispatched as `Task` calls with explicit `model` params — not as inline `Skill` calls. This gives full per-phase model control regardless of the orchestrator's model. Planning is also dispatched as a `Task` with `model: "sonnet"`.

**Why:** The `Skill` tool has no `model` parameter — it inherits the parent model. The `Task` tool has an explicit `model` parameter. In YOLO mode there is no user interaction, so running skills inside a Task subagent works identically to running them inline. The `/model` command must NEVER be used — it writes to `~/.claude/settings.json` (a global config file) and affects all other terminal windows and tmux panes.

YOLO mode invocations:
```
# Brainstorming — Opus for creative reasoning
Task(subagent_type: "general-purpose", model: "opus", description: "YOLO brainstorming",
     prompt: "Invoke Skill(skill: 'superpowers:brainstorming', args: 'yolo: true. scope: [scope]. [context args]'). Return the complete brainstorming output including all self-answered design decisions.")

# Design document — Opus for architectural decisions
Task(subagent_type: "general-purpose", model: "opus", description: "YOLO design document",
     prompt: "Invoke Skill(skill: 'feature-flow:design-document', args: 'yolo: true. scope: [scope]. [context args]'). Return the design document path and key decisions.")

# Implementation planning — Sonnet for structured task decomposition
Task(subagent_type: "general-purpose", model: "sonnet", description: "YOLO implementation plan",
     prompt: "Invoke Skill(skill: 'superpowers:writing-plans', args: 'yolo: true. scope: [scope]. [context args]'). Return the plan file path and task summary.")
```

**Interactive/Express mode** continues to use inline `Skill` calls (unchanged — these inherit the parent model, which should be Opus at session start):
```
Skill(skill: "superpowers:brainstorming", args: "yolo: true. scope: [scope]. [original args]")
Skill(skill: "feature-flow:design-document", args: "yolo: true. scope: [scope]. [original args]")
```

**Express Propagation:** When Express mode is active, prepend `express: true. scope: [scope].` to the `args` parameter of every `Skill` invocation. Express inherits all YOLO auto-selection overrides — skills that check for `yolo: true` should also check for `express: true` and behave the same way (auto-select decisions). The only difference is at the orchestrator level where checkpoints are shown instead of suppressed. Express mode uses inline `Skill` calls (not Task dispatch) to preserve the user's ability to interact at checkpoints:

```
Skill(skill: "superpowers:brainstorming", args: "express: true. scope: [scope]. [original args]")
Skill(skill: "feature-flow:design-document", args: "express: true. scope: [scope]. [original args]")
```

For inline steps (CHANGELOG generation, self-review, code review, study existing patterns), the mode flag is already in the conversation context — no explicit propagation is needed.

**Lifecycle Context Object:** As the lifecycle executes, maintain a context object that accumulates artifact paths as they become known. Include all known paths in the `args` of every subsequent `Skill` invocation, after the mode flag and scope:

| Path key | When it becomes available |
|----------|--------------------------|
| `base_branch` | Step 0 — base branch detection |
| `feature_context` | Step 0 — knowledge base pre-flight (null if no FEATURE_CONTEXT.md found). File is session-local (not committed). |
| `issue` | Step 1 — when an issue number is linked |
| `design_doc` | After design document step (the absolute path returned by the skill) |
| `plan_file` | After implementation plan step (the absolute path of the saved plan file) |
| `worktree` | After worktree setup (the absolute path to the created worktree) |
| `pr` | After "Commit and PR" step (the PR number extracted from the `superpowers:finishing-a-development-branch` output) |

Include only paths that are known at the time of each invocation — do not include paths for artifacts that haven't been created yet. Example invocations showing progressive accumulation:

```
# YOLO mode — brainstorming and design doc via Task dispatch with explicit model:
Task(subagent_type: "general-purpose", model: "opus", description: "YOLO brainstorming",
     prompt: "Invoke Skill(skill: 'superpowers:brainstorming', args: 'yolo: true. scope: [scope]. base_branch: main. issue: 119. [original args]'). Return the complete output.")

# YOLO mode — planning via Task dispatch with explicit model:
Task(subagent_type: "general-purpose", model: "sonnet", description: "YOLO implementation plan",
     prompt: "Invoke Skill(skill: 'superpowers:writing-plans', args: 'yolo: true. scope: [scope]. base_branch: main. issue: 119. design_doc: /abs/path/design.md. [original args]'). Return the plan file path.")

# Interactive/Express mode — inline Skill calls (inherit parent model):
Skill(skill: "superpowers:brainstorming", args: "yolo: true. scope: [scope]. base_branch: main. issue: 119. [original args]")
Skill(skill: "superpowers:writing-plans", args: "yolo: true. scope: [scope]. base_branch: main. issue: 119. design_doc: /abs/path/design.md. [original args]")

# During and after implementation (all paths known, all modes):
Skill(skill: "superpowers:subagent-driven-development", args: "yolo: true. scope: [scope]. plan_file: /abs/path/plan.md. design_doc: /abs/path/design.md. worktree: /abs/path/.worktrees/feat-xyz. base_branch: main. issue: 119. [original args]")
Skill(skill: "feature-flow:verify-acceptance-criteria", args: "plan_file: /abs/path/plan.md. [original args]")
```

**Do not skip steps.** If the user asks to skip a step, explain why it matters and confirm they want to skip. If they insist, mark it as skipped and note the risk.

### Skill Mapping

| Step | Skill to Invoke | Expected Output |
|------|----------------|-----------------|
| Brainstorm requirements | `superpowers:brainstorming` | Decisions on scope, approach, UX. **For Feature and Major Feature scopes:** brainstorming includes the design preferences preamble — captures or loads project-wide design preferences before feature-specific questions begin. See `references/orchestration-overrides.md` → "Design Preferences Preamble". |
| Spike / PoC | `feature-flow:spike` | Confirmed/denied assumptions |
| Documentation lookup | No skill — inline step (see below) | Current patterns from official docs injected into context |
| Design document | `feature-flow:design-document` | File at `docs/plans/YYYY-MM-DD-*.md` **Context capture:** After the design document is saved, write key scope decisions, approach choices, and rejected alternatives to `.feature-flow/design/design-decisions.md` (append to the existing template — do not overwrite). |
| Study existing patterns | No skill — inline step (see below) | Understanding of codebase conventions for the areas being modified |
| Design verification | `feature-flow:design-verification` | Blockers/gaps identified and fixed **Context capture:** After verification completes, write the blockers found and their resolutions to `.feature-flow/design/verification-results.md` (append to the existing template — do not overwrite). Include the verification score summary and any design changes required. |
| Create issue | `feature-flow:create-issue` | GitHub issue URL. **If an issue number was detected in Step 1**, pass it to create-issue as the `existing_issue` context — the skill will update the existing issue instead of creating a new one. |
| Implementation plan | `superpowers:writing-plans` | Numbered tasks with acceptance criteria. **Override:** After the plan is saved, always proceed with subagent-driven execution — do not present the execution choice to the user. Immediately invoke `superpowers:subagent-driven-development`. |
| Verify plan criteria | `feature-flow:verify-plan-criteria` | All tasks have verifiable criteria |
| Commit planning artifacts | No skill — inline step (see below) | Planning docs and config committed to base branch |
| Worktree setup | `superpowers:using-git-worktrees` | Isolated worktree created. **Override:** When checking for existing worktree directories, use `test -d` instead of `ls -d` — the `ls -d` command returns a non-zero exit code when the directory doesn't exist, causing false Bash tool errors. Example: `test -d .worktrees && echo "exists" \|\| echo "not found"`. **After worktree creation:** Create `FEATURE_CONTEXT.md` in the worktree root using the template from `skills/start/references/feature-context-template.md`. **Context directories:** Also create `.feature-flow/design/` and `.feature-flow/implement/` directories. For each of the four context files, read the corresponding template from `references/phase-context-templates.md` and write it to `.feature-flow/design/design-decisions.md`, `.feature-flow/design/verification-results.md`, `.feature-flow/implement/patterns-found.md`, and `.feature-flow/implement/blockers-and-resolutions.md`. These files are session-local working state — do NOT commit them to the feature branch. They are used for context capture during the session and for PR body injection at completion, but are excluded from git via `.gitignore`. After creating the files, verify they are ignored: `git status FEATURE_CONTEXT.md .feature-flow/` should show no output. **Gitignore safety:** Before creating context files, check the project's `.gitignore` for `.feature-flow/` and `FEATURE_CONTEXT.md` entries. If either is missing: (1) Append the missing entries to `.gitignore`: `# feature-flow session-local files (not committed to feature branches)\n.feature-flow/\nFEATURE_CONTEXT.md\nDECISIONS_ARCHIVE.md` (2) Stage and commit: `git add .gitignore && git commit -m "chore: gitignore feature-flow session metadata"`. This commit goes on the base branch (before the worktree branch is created), so all future worktrees inherit it. If both entries already exist, skip silently. |
| Copy env files | No skill — inline step (see below) | Env files available in worktree |
| Implement | `superpowers:subagent-driven-development` | Code written with tests, spec-reviewed, and quality-reviewed per task |
| Self-review | No skill — inline step (see below) | Code verified against coding standards before formal review |
| Code review | No skill — inline step (see below) | All Critical/Important findings fixed, tests pass |
| Generate CHANGELOG entry | No skill — inline step (see below) | Changelog fragment written to `.changelogs/<id>.md`; consolidated when `/merge-prs` is invoked |
| Final verification | No skill — inline step (see below) | All criteria PASS + quality gates pass (or skipped if Phase 4 already passed) |
| Sync with base branch | No skill — inline step (see below) | Branch merged onto latest base branch; conflicts require manual resolution |
| Commit and PR | `superpowers:finishing-a-development-branch` | PR URL; PR body includes `feature-flow-metadata` block (all modes) |
| Wait for CI and address reviews | No skill — inline step (see below) | CI green, review comments addressed |
| Device matrix testing | No skill — manual step | Tested on min OS, small/large screens, slow network |
| Beta testing | No skill — manual step | TestFlight / Play Console build tested by internal tester |
| App store review | No skill — manual step | Submission accepted |
| Harden PR | No skill — inline step (see below) | PR hardened for merge (READY or BLOCKED) via bounded remediation loop |
| Post implementation comment | No skill — inline step (see below) | Issue commented with implementation summary (will auto-close on PR merge) |
| Handoff | No skill — inline step (see below) | Lifecycle terminal announcement; PR ready for user to merge |

### Orchestration Overrides

**Read `references/orchestration-overrides.md`** for brainstorming interview format override (including YOLO self-answering) and Express design approval checkpoint.

### YOLO/Express Overrides

**Read `references/yolo-overrides.md`** when in YOLO or Express mode. Contains overrides for: Writing Plans, Using Git Worktrees, Finishing a Development Branch, and Subagent-Driven Development.

### YOLO Stop-After Checkpoints

**Read `yolo.stop_after` from `.feature-flow.yml`** during Step 0 project context loading. If the field is absent or the list is empty, no checkpoints fire — existing YOLO behavior is preserved.

**Phase mapping:**

| `stop_after` value | Lifecycle step | Fires after/before |
|---------------------|---------------|-------------|
| `brainstorming` | Brainstorm requirements | After `superpowers:brainstorming` returns |
| `design` | Design document | After `feature-flow:design-document` returns |
| `verification` | Design verification | After `feature-flow:design-verification` returns |
| `plan` | Implementation plan | After `superpowers:writing-plans` returns |
| `implementation` | Implement | Before `superpowers:subagent-driven-development` is invoked |
| `pr` | Commit and PR | Before `superpowers:finishing-a-development-branch` is invoked |
| `harden_pr` | Harden PR Step | After the remediation loop exits (between steps N+1 and N+2) |
| `handoff` | Handoff Step | Before the final handoff announcement is built |

> **Deprecation:** `ship` is accepted as a deprecated alias for `handoff` for one release. A warning is printed when it is encountered; remove it in favor of `handoff` before the next release.

The `yolo.stop_after` values `harden_pr` and `handoff` fire at the respective steps per the checkpoint table above.

**Checkpoint behavior:** In the Step 3 execution loop, after a YOLO-eligible phase completes (between sub-steps 4 "Confirm completion" and 5 "Mark complete"), check if the completed phase name is in the loaded `stop_after` list:

```
if yolo_mode AND current_phase_name in config.yolo.stop_after:
    Present via AskUserQuestion:
      "YOLO checkpoint: [phase] complete. Review the output above. Continue?"
      - "Continue YOLO" — resume unattended execution
      - "Switch to Interactive" — disable YOLO for all remaining phases
    Announce: "YOLO: checkpoint — [phase] → paused for review"
```

**Express behavior:** Express mode does NOT honor `stop_after` — Express already has its own design approval checkpoint. `stop_after` is YOLO-only.

**Turn Bridge Rule compliance:** The AskUserQuestion call at the checkpoint serves as the turn bridge — it keeps the turn alive while waiting for user input. After the user responds, proceed to sub-step 5 (Mark complete) and continue the loop.

### Quality Context Injections

**Read `references/yolo-overrides.md` — "Writing Plans Quality Context Injection", "Subagent-Driven Development Context Injection", and "Implementer Quality Context Injection" sections.** These apply unconditionally in all modes (YOLO, Express, Interactive).

### Model Routing Defaults

**Read `references/model-routing.md`** for the full model routing tables. Summary: Opus orchestrator for the full session; subagents routed to Sonnet/Haiku for cost optimization. In YOLO mode, brainstorming and design doc are dispatched as Task(model: "opus"), planning as Task(model: "sonnet").

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

### Harden PR Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Harden PR Step" section** when reaching this step. Feature and Major Feature scopes only. Runs after "Wait for CI and address reviews" and before "Post Implementation Comment".

### Post Implementation Comment Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Post Implementation Comment Step" section** when reaching this step.

### Handoff Step (lifecycle — feature and major feature scopes only)

**Read `references/inline-steps.md` — "Handoff Step" section** when reaching this step. Feature and Major Feature scopes only. Terminal step — replaces the Ship phase for these scopes. Announces a ready-to-merge PR and stops.

### Documentation Lookup Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Documentation Lookup Step" section** when reaching this step.

### Sync with Base Branch Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Sync with Base Branch Step" section** when reaching this step.

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

**For Feature and Major Feature scopes:** The Handoff Step produces the terminal output (see `references/inline-steps.md` — "Handoff Step" section). The lifecycle ends after the Handoff announcement.

**For smaller scopes (Quick fix, Small enhancement):**

```
Lifecycle complete!

Summary:
- Platform: [web/ios/android/cross-platform]
- Design doc: docs/plans/YYYY-MM-DD-feature.md
- Issue: #[number] (commented — will auto-close on PR merge) [or "(no issue linked)" if none]
- PR: #[number] → [base branch]
- All acceptance criteria verified

Worktree: [Removed / Still active at .worktrees/feature-name]
[If still active: "Run `cd <repo-root> && git worktree remove .worktrees/feature-name` from the parent repo (NOT from inside the worktree)."]

What to do next:
1. Review PR #[number] on GitHub (or request team review)
2. After PR merges to [base branch], verify in [base branch] environment
3. Clean up local branch: `cd <repo-root> && git worktree remove .worktrees/feature-name && git branch -d feature-name && git fetch --prune`

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
- **Never destroy your own CWD.** Before removing a worktree or deleting a directory, `cd` to the parent repo root first. Running `git worktree remove` while your shell is inside the worktree deletes the CWD, which crashes the session with an unrecoverable error. Always: `cd <parent-repo-root> && git worktree remove .worktrees/<name>`.

## Additional Resources

### Reference Files

Extracted reference files (read on-demand during lifecycle execution):
- **`references/project-context.md`** — Step 0: YOLO triggers, .feature-flow.yml, base branch, model check, notifications
- **`references/step-lists.md`** — Step 2: scope-specific step lists, mobile adjustments, pre-flight reviewer audit/marketplace/install
- **`references/orchestration-overrides.md`** — Brainstorming interview format, Express design approval
- **`references/yolo-overrides.md`** — YOLO/Express overrides for writing-plans, git-worktrees, finishing-branch, subagent-driven-dev; quality context injections
- **`references/code-review-pipeline.md`** — Code review pipeline Phases 0-5
- **`references/inline-steps.md`** — 13 inline step definitions (documentation lookup, commit artifacts, copy env, study patterns, self-review, CHANGELOG, sync with base branch, final verification, wait for CI and reviews, harden PR, post implementation comment, handoff, commit and PR)
- **`references/model-routing.md`** — Model routing defaults (orchestrator phases + subagent dispatches)
- **`references/scope-guide.md`** — Detailed criteria for classifying work scope

External reference files:
- **`../../references/project-context-schema.md`** — Schema for `.feature-flow.yml`
- **`../../references/platforms/mobile.md`** — Mobile lifecycle adjustments, required sections, beta testing checklist
- **`../../references/platforms/web.md`** — Web lifecycle adjustments
