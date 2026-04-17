# Quick-Path Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `skills/start/SKILL.md`'s Tool Selection section into a 3-way triage (quick / feature-flow / GSD) that routes bounded, code-confirmed trivial changes to a bare implement-and-commit path, skipping the full lifecycle.

**Architecture:** The quick path is inserted as a new subsection inside the existing `## Triage` section (renamed from `## Tool Selection`) — it runs before heuristic scoring as a boolean short-circuit. Six ordered gates (0–5) confirm scope via ≤5 read-only tool calls; all-pass routes to an 8-step quick-path execution branch; any failure silently falls through to the existing feature-flow/GSD scoring unchanged.

**Tech Stack:** Markdown prose documents (feature-flow skills are executed by Claude's in-context reasoning — no runtime libraries). Gate enforcement is by Claude's mental AST reasoning, same as Edit-tool `old_string` matching. All changes are prose edits to `.md` files.

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `skills/start/SKILL.md` | Modify | 6 targeted edits: rename heading, add Quick-Path Confirmation subsection, add ⚡ band, add quick-path execution branch, add `--no-quick` flag, add config docs |
| `skills/start/references/step-lists.md` | Modify | New `### Quick path` section under `## Step Lists` describing quick path as alternate route |
| `references/project-context-schema.md` | Modify | New `quick_path` sub-section under `### tool_selector` |
| `CHANGELOG.md` | Modify | New bullet under `## [Unreleased]` → `### Added` |
| `tests/start/quick_path/` | Create | Directory + 14 fixture `.md` files |

---

## Task 1: Rename `## Tool Selection` → `## Triage`

**Files:**
- Modify: `skills/start/SKILL.md:13`

- [ ] **Step 1: Verify the current heading text**

Run:
```bash
grep -n "## Tool Selection" /Users/weee/Dev/feature-flow/skills/start/SKILL.md
```
Expected: `13:## Tool Selection`

- [ ] **Step 2: Apply the rename**

In `skills/start/SKILL.md`, replace:
```
## Tool Selection

Before brainstorming, analyze your project description to recommend feature-flow or GSD.
```
with:
```
## Triage

Before brainstorming, analyze your project description to determine the correct path: **quick** (bounded trivial edit confirmed by code), **feature-flow** (standard lifecycle), or **GSD** (multi-feature project).
```

- [ ] **Step 3: Verify the rename**

Run:
```bash
grep -n "## Tool Selection\|## Triage" /Users/weee/Dev/feature-flow/skills/start/SKILL.md
```
Expected: exactly one line matching `## Triage`, zero lines matching `## Tool Selection`.

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains exactly one `## Triage` heading
- [ ] `skills/start/SKILL.md` contains zero `## Tool Selection` headings
- [ ] The one-line description under the heading mentions "quick / feature-flow / GSD"

- [ ] **Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow && git add skills/start/SKILL.md && git commit -m "refactor(start): rename Tool Selection section to Triage

Sets up the 3-way triage vocabulary (quick / feature-flow / GSD)
before quick-path content is added.

Part of #234."
```

---

## Task 2: Add Quick-Path Confirmation Subsection (Step 3 edit)

**Files:**
- Modify: `skills/start/SKILL.md` — Step 3 block (currently at line ~30–38)

- [ ] **Step 1: Locate the Step 3 block**

Run:
```bash
grep -n "### Step 3" /Users/weee/Dev/feature-flow/skills/start/SKILL.md
```
Expected: one result, "Step 3: Run heuristic detection"

- [ ] **Step 2: Insert the Quick-Path Confirmation subsection**

In `skills/start/SKILL.md`, replace:
```
### Step 3: Run heuristic detection

Analyze user's project description using heuristics:
1. Extract feature count (using regex for action verbs)
2. Check for scope keywords ("from scratch", "complete app", etc.)
3. Parse timeline mentions ("hours" vs "weeks/months")
4. Detect complexity patterns (multiple stacks, microservices, explicit counts)

Calculate weighted confidence score (0.0–1.0) using scoring table.
```
with:
```
### Step 3: Run heuristic detection

**Before running heuristic scoring, run Quick-Path Confirmation** (a read-only gate sequence). If all gates pass, take the quick path (Step 5 → Step 6 quick-path branch) and skip heuristic scoring entirely. If any gate fails, fall through to heuristic scoring below — unchanged.

#### Quick-Path Confirmation

Quick path is available when `tool_selector.quick_path.enabled` is `true` (default) and `--no-quick` was not passed. If either condition is false, skip this subsection entirely and proceed to heuristic scoring.

Run gates in strict order 0 → 5. **First failure short-circuits immediately** — do not run later gates. Pass budget: **≤5 Bash/Grep/Read tool calls total across all gates**. In-process AST tokenization and byte-range overlap checks are free (do not count). If you reach 5 tool calls before all gates pass, abort confirmation and fall through silently.

| # | Gate | Pass condition | Fail action |
|---|------|----------------|-------------|
| 0 | **Clean working tree** | `git status --porcelain` returns empty | Surface to user: *"Working tree is dirty — running normal lifecycle to avoid trampling in-progress work."* Then fall through to heuristic scoring. |
| 1 | **Concrete target identifiable** | Description names a file path, function name, symbol, or string literal | Surface to user: *"No specific target named — running normal lifecycle. If you meant a specific file, say `start: fix typo in X.ts line 42`."* Then fall through. |
| 2 | **Bounded file count** | Target resolves to ≤ `max_files` files (default 3) | Silent fallthrough |
| 3 | **No exported-declaration overlap** | The edit's byte range does not overlap any `export` / `export default` / `module.exports` AST node, nor any symbol referenced by those nodes. Check is mechanical byte-range overlap — not a "flows outward" semantic analysis. | Silent fallthrough |
| 4 | **Lexical-region rule** | Every proposed `old_string` byte range sits entirely inside one of: **(a)** Markdown prose outside `` ``` `` fences; **(b)** a string literal node in a code file that is **not** a syntactic argument to a `log.*` / `logger.*` / `console.*` call expression (walk up to nearest `CallExpression`; if callee matches case-insensitively, fail); **(c)** a line or block comment node. Identifiers, keywords, imports, type annotations, decorators, numeric/boolean literals, operators always fail. Unsupported languages (not Markdown/TypeScript/JavaScript/Python) conservatively fail. Multiple `old_string` ranges: all must pass individually. | Silent fallthrough |
| 5 | **Test impact bounded** | Grep `tests/` (and `spec/`, `__tests__/`, `*.test.*`, `*.spec.*`) for the edited symbol or file basename. Pass if: no test match AND edit region is prose/comment/non-log string (untestable); OR a test match is found (existing tests cover it). Fail if a test match is found and the edit region is a code identifier (Gate 4 would have already failed — so ordering is always consistent). | Silent fallthrough |

**Gate 4 log-call exclusion detail:** From the matched string-literal node, walk up to the nearest enclosing `CallExpression`. If the callee (any member-access depth, case-insensitive) matches `log.*` / `logger.*` / `console.*`, Gate 4 **fails**. This is an AST ancestor walk, not a heuristic.

**Gate 4 whitespace tolerance:** If a proposed `old_string` region, extended by leading/trailing whitespace to the nearest non-whitespace character, would cross out of the confirmed lexical region, Gate 4 **fails** (fail-closed).

**Budget exhaustion:** If the 5-tool-call budget is reached before all gates finish evaluating, silently fall through to heuristic scoring. The change is not quick by definition.

**On all-pass:** Set `quick_path_confirmed = true`. Record confirmed scope: the set of file paths and their confirmed lexical regions (held in working context only — no state file). Proceed to Step 5 (⚡ band) and then Step 6 quick-path execution branch.

---

Analyze user's project description using heuristics:
1. Extract feature count (using regex for action verbs)
2. Check for scope keywords ("from scratch", "complete app", etc.)
3. Parse timeline mentions ("hours" vs "weeks/months")
4. Detect complexity patterns (multiple stacks, microservices, explicit counts)

Calculate weighted confidence score (0.0–1.0) using scoring table.
```

- [ ] **Step 3: Verify the gate table is present**

Run:
```bash
grep -c "Gate\|gate" /Users/weee/Dev/feature-flow/skills/start/SKILL.md
```
Expected: number > 10 (confirms substantial gate content was inserted)

Run:
```bash
grep -n "Quick-Path Confirmation" /Users/weee/Dev/feature-flow/skills/start/SKILL.md
```
Expected: one line with "Quick-Path Confirmation"

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains the string `Quick-Path Confirmation`
- [ ] `skills/start/SKILL.md` contains all six gate rows (grep for `Gate 0`, `Gate 1`, `Gate 2`, `Gate 3`, `Gate 4`, `Gate 5` — or the table `| 0 |` through `| 5 |`)
- [ ] `skills/start/SKILL.md` contains the string `≤5 Bash/Grep/Read tool calls`
- [ ] `skills/start/SKILL.md` contains the string `log.*` (log-call exclusion documented)
- [ ] `skills/start/SKILL.md` contains the string `Working tree is dirty` (Gate 0 verbatim hint)
- [ ] `skills/start/SKILL.md` contains the string `No specific target named` (Gate 1 verbatim hint)

- [ ] **Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow && git add skills/start/SKILL.md && git commit -m "feat(start): add Quick-Path Confirmation gate sequence under Step 3

Six ordered gates (0–5) with ≤5 tool-call budget and strict
short-circuit evaluation. All-pass routes to quick path; any
failure falls through to existing heuristic scoring unchanged.

Part of #234."
```

---

## Task 3: Add ⚡ Band to Step 5 and Quick-Path Branch to Step 6

**Files:**
- Modify: `skills/start/SKILL.md` — Step 5 display block and Step 6 execute block

- [ ] **Step 1: Locate Step 5 and Step 6**

Run:
```bash
grep -n "### Step 5\|### Step 6" /Users/weee/Dev/feature-flow/skills/start/SKILL.md
```
Note the line numbers for each.

- [ ] **Step 2: Add ⚡ band to Step 5**

In `skills/start/SKILL.md`, replace:
```
### Step 5: Display recommendation

Show recommendation based on confidence band:
- **🟢 feature-flow** (0.0–0.4): Skip display, proceed silently
- **🟡 GSD-recommended** (0.4–0.7): Display recommendation, ask user to choose
- **🔴 GSD-strongly-recommended** (0.7+): Display recommendation, ask user to choose
```
with:
```
### Step 5: Display recommendation

Show recommendation based on path or confidence band:

- **⚡ quick path** — reached only via Quick-Path Confirmation gates (Task 2), never via heuristic scoring. Announce in a single auditable line before making any edits:
  ```
  ⚡ Quick path confirmed: <path>:<line> — <region kind> in <language>, <N> file(s), budget: ≤<max_changed_lines> lines. Editing directly.
  ```
  Where `<region kind>` is one of: `prose edit in Markdown`, `comment edit in TypeScript`, `string-literal edit in Python`, etc. `<max_changed_lines>` is from config (default 10). Then proceed immediately to Step 6 quick-path execution branch.
- **🟢 feature-flow** (0.0–0.4): Skip display, proceed silently
- **🟡 GSD-recommended** (0.4–0.7): Display recommendation, ask user to choose
- **🔴 GSD-strongly-recommended** (0.7+): Display recommendation, ask user to choose
```

- [ ] **Step 3: Add quick-path execution branch to Step 6**

In `skills/start/SKILL.md`, replace:
```
### Step 6: Execute user choice

- If user chooses "Use feature-flow" → proceed with brainstorming
- If user chooses "Launch GSD" → execute GSD handoff (see below)
- If `auto_launch_gsd: true` → skip user choice, execute GSD handoff automatically
```
with:
```
### Step 6: Execute user choice

**If `quick_path_confirmed` is set (from Step 3 Quick-Path Confirmation):** Execute the quick-path flow below. Do not prompt the user for a choice — the confirmation gates already verified the scope.

#### Quick-Path Execution (8-step flow)

1. **Announce confirmation** — output the single auditable line from Step 5 ⚡ band.
2. **Record confirmed scope** — note the set of confirmed file paths and their confirmed lexical regions in working context. **No state file. No `.feature-flow/session-state.json`.** Scope set lifetime is this single skill invocation.
3. **Edit the file(s) in the confirmed set** via the Edit tool.
4. **Run Stop-hook checks** (tsc, lint, type-sync). Stop hook may auto-format / auto-fix, changing diff size.
5. **Post-hook pre-commit budget check:** run `git diff --numstat` summed across confirmed files (added + removed lines). If total > `max_changed_lines` (default 10) → escape hatch (step 6). This runs **after** Stop hook so auto-format changes are included.
6. **Hard-assertion escape hatch:** If the edit touched any file **outside** the confirmed set, introduced a new exported symbol, exceeded `max_changed_lines`, or the Stop hook failed → hard stop. Run:
   ```bash
   git checkout -- <all confirmed file paths>
   ```
   (Safe because Gate 0 guarantees the tree was clean before quick path wrote anything — this only discards what quick path itself wrote. Restore is multi-file atomic: all confirmed files, even if only one was edited.) Then tell the user:
   > `⚠ Quick path misclassified this change (<reason>). No commit made, working tree restored. Re-run with \`start: <description>\` for the full lifecycle.`
   Stop. Do not commit, do not fall through.
7. **Commit.** Check `git log --oneline -20` to observe the project's existing commit prefix style (e.g., `docs:`, `fix:`, `feat:`, `refactor:`). Write the commit message in imperative mood, following that style. Include the actual post-edit line count in the message body (`N lines changed`). **No Claude co-author trailer.**
8. **Skip everything else.** No design doc, no design verification, no implementation plan, no acceptance criteria doc, no handoff. The commit and the auditable announcement line are the only artifacts.

---

**If `quick_path_confirmed` is not set (normal paths):**

- If user chooses "Use feature-flow" → proceed with brainstorming
- If user chooses "Launch GSD" → execute GSD handoff (see below)
- If `auto_launch_gsd: true` → skip user choice, execute GSD handoff automatically
```

- [ ] **Step 4: Verify the new content**

Run:
```bash
grep -n "⚡ Quick path confirmed\|Quick-Path Execution\|escape hatch\|max_changed_lines" /Users/weee/Dev/feature-flow/skills/start/SKILL.md
```
Expected: multiple hits covering the announcement format, 8-step header, escape hatch, and budget check.

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains the string `⚡ quick path` in the Step 5 section
- [ ] `skills/start/SKILL.md` contains the string `⚡ Quick path confirmed:` (auditable announcement format)
- [ ] `skills/start/SKILL.md` contains the string `Quick-Path Execution (8-step flow)`
- [ ] `skills/start/SKILL.md` contains the string `git checkout -- <all confirmed file paths>` (escape hatch rollback)
- [ ] `skills/start/SKILL.md` contains the string `max_changed_lines` in the Step 6 context
- [ ] `skills/start/SKILL.md` contains the string `No state file. No` (documents no session-state.json)
- [ ] `skills/start/SKILL.md` contains the string `No Claude co-author trailer`

- [ ] **Step 5: Commit**

```bash
cd /Users/weee/Dev/feature-flow && git add skills/start/SKILL.md && git commit -m "feat(start): add quick-path ⚡ band to Step 5 and 8-step execution branch to Step 6

Includes: auditable one-line announcement, Gate-0-safe multi-file
atomic rollback, post-hook max_changed_lines budget check, and
hard-assertion escape hatch. No state file, no co-author trailer.

Part of #234."
```

---

## Task 4: Add `--no-quick` Flag and `tool_selector.quick_path` Config Docs

**Files:**
- Modify: `skills/start/SKILL.md` — Command-Line Flag Parsing section (~line 109) and Configuration Loading section (~line 136)

- [ ] **Step 1: Locate the two sections**

Run:
```bash
grep -n "## Command-Line Flag Parsing\|## Configuration Loading" /Users/weee/Dev/feature-flow/skills/start/SKILL.md
```
Note the line numbers.

- [ ] **Step 2: Update Command-Line Flag Parsing**

In `skills/start/SKILL.md`, replace:
```
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
```
with:
```
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
```

- [ ] **Step 3: Update Configuration Loading**

In `skills/start/SKILL.md`, replace:
```
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
```
with:
```
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
  - Maximum Bash/Grep/Read tool calls during Quick-Path Confirmation. In-process AST work does not count.
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
```

- [ ] **Step 4: Verify**

Run:
```bash
grep -n "\-\-no-quick\|quick_path\|max_changed_lines\|max_files\|max_confirmation" /Users/weee/Dev/feature-flow/skills/start/SKILL.md
```
Expected: multiple hits covering the flag description, priority list, and all four config keys.

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains the string `--no-quick` in the Command-Line Flag Parsing section
- [ ] `skills/start/SKILL.md` contains the string `no \`--quick\` flag` or `no --quick flag` (documents explicit absence of `--quick`)
- [ ] `skills/start/SKILL.md` contains `tool_selector.quick_path.enabled` in the Configuration Loading section
- [ ] `skills/start/SKILL.md` contains `tool_selector.quick_path.max_confirmation_tool_calls`
- [ ] `skills/start/SKILL.md` contains `tool_selector.quick_path.max_files`
- [ ] `skills/start/SKILL.md` contains `tool_selector.quick_path.max_changed_lines`
- [ ] The priority list in Command-Line Flag Parsing shows `--no-quick` between `--feature-flow` and config/auto-detect

- [ ] **Step 5: Commit**

```bash
cd /Users/weee/Dev/feature-flow && git add skills/start/SKILL.md && git commit -m "feat(start): add --no-quick flag and tool_selector.quick_path config docs

Four new config keys (enabled, max_confirmation_tool_calls,
max_files, max_changed_lines) with defaults. --no-quick flag
documented with priority between --feature-flow and auto-detect.
No --quick flag added (explicitly absent per design).

Part of #234."
```

---

## Task 5: Update `skills/start/references/step-lists.md`

**Files:**
- Modify: `skills/start/references/step-lists.md`

- [ ] **Step 1: Locate the Tool Selector Detection section**

Run:
```bash
grep -n "## Tool Selector Detection\|## Step Lists" /Users/weee/Dev/feature-flow/skills/start/references/step-lists.md
```
Note the line numbers.

- [ ] **Step 2: Add a Quick Path section under Step Lists**

In `skills/start/references/step-lists.md`, replace:
```
## Step Lists

### Quick fix (all platforms)
```
with:
```
## Step Lists

### Quick path (all platforms, all scopes)

The quick path is an alternate route that bypasses all scope-based step lists below. It is taken **only** when Quick-Path Confirmation gates (in `SKILL.md` Step 3) all pass. It produces no brainstorming output, no design doc, no implementation plan, no acceptance criteria, and no handoff.

Quick-path steps (executed inline within the Triage section — no task list is built):
```
1. Announce: ⚡ Quick path confirmed: <path>:<line> — <region kind> in <language>, <N> file(s), budget: ≤<max_changed_lines> lines. Editing directly.
2. Edit the confirmed file(s).
3. Run Stop-hook checks (tsc, lint, type-sync).
4. Post-hook budget check: git diff --numstat summed across confirmed files ≤ max_changed_lines.
5. Escape hatch if post-conditions fail (restore all confirmed files, no commit).
6. Commit (model-authored, imperative mood, no Claude co-author trailer).
```

Skipped lifecycle phases: brainstorm → design → verify → plan → acceptance criteria → worktree → code review → CHANGELOG → final verification → sync → PR → wait for CI → harden PR → post-implementation comment → handoff.

---

### Quick fix (all platforms)
```

- [ ] **Step 3: Verify**

Run:
```bash
grep -n "Quick path\|quick path\|alternate route" /Users/weee/Dev/feature-flow/skills/start/references/step-lists.md
```
Expected: hits showing the new section.

**Acceptance Criteria:**
- [ ] `skills/start/references/step-lists.md` contains the string `Quick path (all platforms, all scopes)`
- [ ] `skills/start/references/step-lists.md` contains the string `alternate route` describing quick path as a bypass
- [ ] `skills/start/references/step-lists.md` contains the string `brainstorm → design → verify → plan` in the "Skipped lifecycle phases" line

- [ ] **Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow && git add skills/start/references/step-lists.md && git commit -m "docs(start): add Quick Path alternate route section to step-lists.md

Describes the quick path as a complete lifecycle bypass that
skips brainstorm through handoff. Part of #234."
```

---

## Task 6: Update `references/project-context-schema.md`

**Files:**
- Modify: `references/project-context-schema.md` — `### tool_selector` section (lines ~165–188)

- [ ] **Step 1: Locate the tool_selector sub-fields table**

Run:
```bash
grep -n "auto_launch_gsd\|confidence_threshold\|### tool_selector" /Users/weee/Dev/feature-flow/references/project-context-schema.md
```
Note the line containing the table end (the last row before the Format block).

- [ ] **Step 2: Extend the sub-fields table and format block**

In `references/project-context-schema.md`, replace:
```
**Sub-fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Whether the Tool Selector step runs at all. Set to `false` to skip tool evaluation entirely. |
| `confidence_threshold` | float (0–1) | `0.7` | Minimum confidence score required before a tool recommendation is surfaced. Recommendations below this threshold are suppressed. |
| `auto_launch_gsd` | boolean | `false` | When `true`, automatically launches the GSD toolset without prompting the user if confidence meets the threshold. When `false`, the user is shown the recommendation and must confirm. |

**Format:**

```yaml
tool_selector:
  enabled: true
  confidence_threshold: 0.7   # suppress low-confidence recommendations
  auto_launch_gsd: false       # true = auto-launch without prompting
```

**When needed:** Only when you want to change Tool Selector behaviour from its defaults. Most projects can omit this section.

**When absent:** All three fields use their defaults silently — Tool Selector runs, uses a 0.7 confidence threshold, and prompts before launching GSD. The field is never auto-written; it is only used when manually added.
```
with:
```
**Sub-fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Whether the Tool Selector step runs at all. Set to `false` to skip tool evaluation entirely. |
| `confidence_threshold` | float (0–1) | `0.7` | Minimum confidence score required before a tool recommendation is surfaced. Recommendations below this threshold are suppressed. |
| `auto_launch_gsd` | boolean | `false` | When `true`, automatically launches the GSD toolset without prompting the user if confidence meets the threshold. When `false`, the user is shown the recommendation and must confirm. |

#### `tool_selector.quick_path`

Optional sub-section controlling the Quick-Path Confirmation gate sequence. When absent, all four keys use their defaults and quick path is **on** out of the box.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | When `false`, Quick-Path Confirmation is disabled for all invocations (equivalent to always passing `--no-quick`). |
| `max_confirmation_tool_calls` | integer ≥ 1 | `5` | Maximum Bash/Grep/Read tool calls during Quick-Path Confirmation. In-process AST work does not count. Budget exhaustion → silent fallthrough. |
| `max_files` | integer ≥ 1 | `3` | Gate 2 passes when the target resolves to ≤ this many files. Default 3 allows multi-file prose fixes (e.g., README + CHANGELOG). |
| `max_changed_lines` | integer ≥ 1 | `10` | Post-hook pre-commit budget: `git diff --numstat` total (added + removed) across confirmed files must be ≤ this value. Measured after Stop hook runs (catches auto-format expansion). The primary scale guardrail — binds total edit size regardless of file count. |

**CLI × config precedence:**
1. `--gsd` (highest, existing)
2. `--feature-flow` (existing)
3. `--no-quick` (new) — forces quick-path off for this invocation
4. `tool_selector.quick_path.enabled` (config file)
5. Built-in default (`enabled: true`)

`--no-quick` × `quick_path.enabled: false` is a no-op: the CLI flag confirms the config. No error.

**Consumed by:** `start` skill (Step 3 Quick-Path Confirmation gates). Also consumed by the `settings` skill when displaying current configuration.

**Format:**

```yaml
tool_selector:
  enabled: true
  confidence_threshold: 0.7   # suppress low-confidence recommendations
  auto_launch_gsd: false       # true = auto-launch without prompting
  quick_path:
    enabled: true
    max_confirmation_tool_calls: 5
    max_files: 3
    max_changed_lines: 10
```

**When needed:** Only when you want to change Tool Selector behaviour from its defaults. Most projects can omit this section.

**When absent:** All three top-level fields and all four `quick_path` fields use their defaults silently — Tool Selector runs, uses a 0.7 confidence threshold, prompts before launching GSD, and quick path is on. The field is never auto-written; it is only used when manually added.
```

- [ ] **Step 3: Verify**

Run:
```bash
grep -n "quick_path\|max_confirmation_tool_calls\|max_changed_lines" /Users/weee/Dev/feature-flow/references/project-context-schema.md
```
Expected: 4+ hits covering all four sub-fields.

**Acceptance Criteria:**
- [ ] `references/project-context-schema.md` contains the string `tool_selector.quick_path`
- [ ] `references/project-context-schema.md` contains `max_confirmation_tool_calls` with default `5`
- [ ] `references/project-context-schema.md` contains `max_files` with default `3`
- [ ] `references/project-context-schema.md` contains `max_changed_lines` with default `10`
- [ ] `references/project-context-schema.md` contains the CLI × config precedence list showing `--no-quick` at position 3

- [ ] **Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow && git add references/project-context-schema.md && git commit -m "docs(schema): add tool_selector.quick_path sub-section

Documents all four quick_path config keys (enabled,
max_confirmation_tool_calls, max_files, max_changed_lines)
with defaults and CLI×config precedence. Part of #234."
```

---

## Task 7: Write 14 Test Fixtures

**Files:**
- Create: `tests/start/quick_path/` (directory)
- Create: 14 `.md` files in that directory

Each fixture has the same structure:
```markdown
# Fixture: <title>

## Input

**Description:** `start: <description>`

## Pre-conditions

- Working tree state: <clean | dirty>
- Target files: <list>
- Relevant file content (excerpt):
  ```
  <content>
  ```

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS/FAIL | <reason> |
| 1 — Concrete target | PASS/FAIL | <reason> |
| 2 — Bounded file count | PASS/FAIL | <reason> |
| 3 — No export overlap | PASS/FAIL | <reason> |
| 4 — Lexical region | PASS/FAIL | <reason> |
| 5 — Test impact | PASS/FAIL | <reason> |

## Expected Outcome

**Path taken:** quick path | fallthrough | escape hatch rollback

**Expected action:** <description of what happens>

**Expected surfaced message (if any):**
> <verbatim message or "none">
```

- [ ] **Step 1: Create the fixture directory**

Run:
```bash
mkdir -p /Users/weee/Dev/feature-flow/tests/start/quick_path
```

- [ ] **Step 2: Write fixture 1 — trivial Markdown typo**

Create `/Users/weee/Dev/feature-flow/tests/start/quick_path/trivial-md-typo.md`:

```markdown
# Fixture: Trivial Targeted Typo in Markdown Prose

## Input

**Description:** `start: fix typo in skills/start/SKILL.md line 15 — "Teh" should be "The"`

## Pre-conditions

- Working tree state: clean (`git status --porcelain` returns empty)
- Target files: `skills/start/SKILL.md`
- Relevant file content (excerpt):
  ```
  Line 15: Teh skill orchestrates the full lifecycle...
  ```

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | File path and line number named explicitly |
| 2 — Bounded file count | PASS | 1 file ≤ max_files (3) |
| 3 — No export overlap | PASS | Markdown file has no export nodes |
| 4 — Lexical region | PASS | "Teh" is in Markdown prose outside a code fence |
| 5 — Test impact | PASS | No test file references this prose string; edit is untestable prose → pass |

## Expected Outcome

**Path taken:** quick path

**Expected action:**
1. Announce: `⚡ Quick path confirmed: skills/start/SKILL.md:15 — prose edit in Markdown, 1 file, budget: ≤10 lines. Editing directly.`
2. Edit `skills/start/SKILL.md` line 15, replacing "Teh" with "The"
3. Stop hook runs
4. Post-hook: `git diff --numstat` shows 1 line changed ≤ 10 → pass
5. Commit with message like: `docs: fix typo in start SKILL.md (1 line changed)`

**Expected surfaced message (if any):**
> `⚡ Quick path confirmed: skills/start/SKILL.md:15 — prose edit in Markdown, 1 file, budget: ≤10 lines. Editing directly.`
```

- [ ] **Step 3: Write fixture 2 — untargeted trivial ask**

Create `/Users/weee/Dev/feature-flow/tests/start/quick_path/untargeted-trivial.md`:

```markdown
# Fixture: Untargeted Trivial Ask — Gate 1 Fails

## Input

**Description:** `start: fix typos`

## Pre-conditions

- Working tree state: clean
- Target files: none (no specific file named in description)

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | FAIL | Description names no file path, function name, symbol, or string literal |
| 2 — Bounded file count | (not evaluated) | Short-circuit after Gate 1 |
| 3 — No export overlap | (not evaluated) | Short-circuit after Gate 1 |
| 4 — Lexical region | (not evaluated) | Short-circuit after Gate 1 |
| 5 — Test impact | (not evaluated) | Short-circuit after Gate 1 |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle

**Expected action:** Gate 1 fails. Surface user hint. Proceed with normal feature-flow/GSD heuristic scoring.

**Expected surfaced message (if any):**
> `No specific target named — running normal lifecycle. If you meant a specific file, say \`start: fix typo in X.ts line 42\`.`
```

- [ ] **Step 4: Write fixture 3 — rename across many call sites**

Create `/Users/weee/Dev/feature-flow/tests/start/quick_path/rename-many-sites.md`:

```markdown
# Fixture: Rename Touching 8+ Files — Gate 2 Fails

## Input

**Description:** `start: rename processPayment to handlePayment`

## Pre-conditions

- Working tree state: clean
- Target files: `processPayment` appears in 8 files across the codebase
  - `src/api/payments.ts`
  - `src/api/billing.ts`
  - `src/hooks/usePayment.ts`
  - `src/components/PaymentForm.tsx`
  - `src/utils/retry.ts`
  - `tests/api/payments.test.ts`
  - `tests/hooks/usePayment.test.ts`
  - `docs/api-reference.md`

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | Symbol name `processPayment` is concrete |
| 2 — Bounded file count | FAIL | 8 files > max_files (3) |
| 3 — No export overlap | (not evaluated) | Short-circuit after Gate 2 |
| 4 — Lexical region | (not evaluated) | Short-circuit after Gate 2 |
| 5 — Test impact | (not evaluated) | Short-circuit after Gate 2 |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle (silent)

**Expected action:** Gate 2 fails silently. No message to user. Normal feature-flow/GSD heuristic scoring runs.

**Expected surfaced message (if any):**
> none
```

- [ ] **Step 5: Write fixture 4 — --no-quick override**

Create `/Users/weee/Dev/feature-flow/tests/start/quick_path/no-quick-override.md`:

```markdown
# Fixture: --no-quick Forces Normal Lifecycle on Trivial Change

## Input

**Description:** `start: fix typo in README.md line 3 --no-quick`

## Pre-conditions

- Working tree state: clean
- Target files: `README.md` — single typo at line 3 in prose

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | (not evaluated) | `--no-quick` flag detected in Step 2; Quick-Path Confirmation is skipped entirely |
| 1 — Concrete target | (not evaluated) | Skipped |
| 2 — Bounded file count | (not evaluated) | Skipped |
| 3 — No export overlap | (not evaluated) | Skipped |
| 4 — Lexical region | (not evaluated) | Skipped |
| 5 — Test impact | (not evaluated) | Skipped |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle (forced by `--no-quick`)

**Expected action:** `--no-quick` is detected in Step 2 (Command-Line Flag Parsing). Quick-Path Confirmation is skipped. Normal heuristic scoring runs. The change, despite being trivially small, goes through the full feature-flow lifecycle.

**Expected surfaced message (if any):**
> none (flag is parsed silently; normal lifecycle announces as usual)
```

- [ ] **Step 6: Write fixture 5 — edit exceeds confirmed set**

Create `/Users/weee/Dev/feature-flow/tests/start/quick_path/exceeds-confirmed-set.md`:

```markdown
# Fixture: Edit Writes Outside Confirmed File Set — Escape Hatch Fires

## Input

**Description:** `start: fix typo in docs/README.md line 5`

## Pre-conditions

- Working tree state: clean
- Confirmed set (from gates): `docs/README.md` only
- Scenario: The Edit tool, during execution, also modifies `docs/CONTRIBUTING.md` (e.g., because `old_string` matched in both files due to a shared phrase)

## Gate Evaluation

All 6 gates pass for `docs/README.md` (1 file, prose, clean tree, no exports).

## Expected Outcome

**Path taken:** escape hatch rollback

**Expected action:**
1. Step 3 of quick-path execution: Edit tool modifies `docs/README.md` AND `docs/CONTRIBUTING.md`
2. Post-hook assertion detects `docs/CONTRIBUTING.md` is outside the confirmed set
3. Escape hatch fires:
   ```bash
   git checkout -- docs/README.md docs/CONTRIBUTING.md
   ```
   (All confirmed files restored, even though only one was in the confirmed set — multi-file atomic.)
4. Tell user the escape-hatch message.
5. No commit made.

**Expected surfaced message (if any):**
> `⚠ Quick path misclassified this change (edit touched docs/CONTRIBUTING.md outside confirmed set). No commit made, working tree restored. Re-run with \`start: fix typo in docs/README.md line 5\` for the full lifecycle.`
```

- [ ] **Step 7: Write fixture 6 — dirty working tree**

Create `/Users/weee/Dev/feature-flow/tests/start/quick_path/dirty-tree.md`:

```markdown
# Fixture: Dirty Working Tree — Gate 0 Fails

## Input

**Description:** `start: fix typo in README.md line 3`

## Pre-conditions

- Working tree state: **dirty** — `git status --porcelain` shows `M README.md` (in-progress edit)
- Target files: `README.md`

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | FAIL | `git status --porcelain` returns `M README.md` (non-empty output) |
| 1 — Concrete target | (not evaluated) | Short-circuit after Gate 0 |
| 2 — Bounded file count | (not evaluated) | Short-circuit after Gate 0 |
| 3 — No export overlap | (not evaluated) | Short-circuit after Gate 0 |
| 4 — Lexical region | (not evaluated) | Short-circuit after Gate 0 |
| 5 — Test impact | (not evaluated) | Short-circuit after Gate 0 |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle

**Expected action:** Gate 0 fails. Surface user hint. Normal feature-flow/GSD heuristic scoring runs.

**Expected surfaced message (if any):**
> `Working tree is dirty — running normal lifecycle to avoid trampling in-progress work.`
```

- [ ] **Step 8: Write fixture 7 — exceeds max_changed_lines**

Create `/Users/weee/Dev/feature-flow/tests/start/quick_path/exceeds-max-changed-lines.md`:

```markdown
# Fixture: Edit Balloons Beyond max_changed_lines — Escape Hatch Fires

## Input

**Description:** `start: update the introductory paragraph in docs/overview.md`

## Pre-conditions

- Working tree state: clean
- Confirmed set (from gates): `docs/overview.md`, prose region, 1 file
- Scenario: The implementer's edit replaces a 3-line paragraph with a 15-line expanded version, resulting in 18 lines changed total (15 added + 3 removed)
- `max_changed_lines`: 10 (default)

## Gate Evaluation

All 6 gates pass on confirmation (prose, 1 file, clean tree).

## Expected Outcome

**Path taken:** escape hatch rollback (post-hook budget check fails)

**Expected action:**
1. Edit tool writes 15 new lines, removes 3 old lines in `docs/overview.md`
2. Stop hook runs (no failures)
3. `git diff --numstat docs/overview.md` → `15  3  docs/overview.md` → total 18 > max_changed_lines (10)
4. Escape hatch fires: `git checkout -- docs/overview.md`
5. No commit made.

**Expected surfaced message (if any):**
> `⚠ Quick path misclassified this change (18 lines changed exceeds max_changed_lines: 10). No commit made, working tree restored. Re-run with \`start: update the introductory paragraph in docs/overview.md\` for the full lifecycle.`
```

- [ ] **Step 9: Write fixture 8 — identifier edit in TypeScript**

Create `/Users/weee/Dev/feature-flow/tests/start/quick_path/identifier-edit-ts.md`:

```markdown
# Fixture: Edit Attempts to Modify an Identifier in TypeScript — Gate 4 Fails

## Input

**Description:** `start: rename variable count to total in src/utils/counter.ts line 12`

## Pre-conditions

- Working tree state: clean
- Target files: `src/utils/counter.ts`
- Relevant file content (excerpt):
  ```typescript
  // line 12
  const count = items.length;
  ```
- The proposed `old_string` is `count` (an identifier node in TypeScript AST)

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | File path and line number named |
| 2 — Bounded file count | PASS | 1 file ≤ max_files (3) |
| 3 — No export overlap | PASS | `count` variable is not an export |
| 4 — Lexical region | FAIL | `count` at line 12 is a TypeScript identifier node, not a string literal or comment |
| 5 — Test impact | (not evaluated) | Short-circuit after Gate 4 |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle (silent)

**Expected action:** Gate 4 fails silently. No message to user. Normal feature-flow/GSD heuristic scoring runs.

**Expected surfaced message (if any):**
> none
```

- [ ] **Step 10: Write fixture 9 — string literal in non-log context**

Create `/Users/weee/Dev/feature-flow/tests/start/quick_path/string-literal-nonlog.md`:

```markdown
# Fixture: Edit Inside Non-Log String Literal — Gate 4 Passes

## Input

**Description:** `start: fix typo in error message in src/api/auth.ts line 8 — "Unauthorzied" should be "Unauthorized"`

## Pre-conditions

- Working tree state: clean
- Target files: `src/api/auth.ts`
- Relevant file content (excerpt):
  ```typescript
  // line 8
  throw new Error("Unauthorzied access");
  ```
- The proposed `old_string` is `"Unauthorzied access"` — a string literal argument to `Error()`, not to a log call

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | File path, line, and string content named |
| 2 — Bounded file count | PASS | 1 file ≤ max_files (3) |
| 3 — No export overlap | PASS | String literal does not overlap any export declaration |
| 4 — Lexical region | PASS | `"Unauthorzied access"` is a string literal node; enclosing `CallExpression` callee is `Error`, which does not match `log.*` / `logger.*` / `console.*` |
| 5 — Test impact | PASS | No test matches "Unauthorzied" (misspelled); edit is a string literal → untestable as a symbol → pass |

## Expected Outcome

**Path taken:** quick path

**Expected action:**
1. Announce: `⚡ Quick path confirmed: src/api/auth.ts:8 — string-literal edit in TypeScript, 1 file, budget: ≤10 lines. Editing directly.`
2. Edit: replace `"Unauthorzied access"` with `"Unauthorized access"`
3. Stop hook runs
4. Post-hook: 1 line changed ≤ 10 → pass
5. Commit: `fix: correct typo in auth error message (1 line changed)`

**Expected surfaced message (if any):**
> `⚡ Quick path confirmed: src/api/auth.ts:8 — string-literal edit in TypeScript, 1 file, budget: ≤10 lines. Editing directly.`
```

- [ ] **Step 11: Write fixture 10 — logger.info string argument**

Create `/Users/weee/Dev/feature-flow/tests/start/quick_path/logger-info-string.md`:

```markdown
# Fixture: Edit to logger.info() String Argument — Gate 4 Fails (Log-Call Exclusion)

## Input

**Description:** `start: update log message in src/api/payments.ts line 22 — change "Processing payment" to "Processing payment request"`

## Pre-conditions

- Working tree state: clean
- Target files: `src/api/payments.ts`
- Relevant file content (excerpt):
  ```typescript
  // line 22
  logger.info("Processing payment", { userId, amount });
  ```
- The proposed `old_string` is `"Processing payment"` — a string literal that is the first argument to `logger.info(...)`

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | File path, line, and string content named |
| 2 — Bounded file count | PASS | 1 file ≤ max_files (3) |
| 3 — No export overlap | PASS | String literal does not overlap any export declaration |
| 4 — Lexical region | FAIL | `"Processing payment"` is a string literal node, but its enclosing `CallExpression` callee is `logger.info` — matches `logger.*` case-insensitively. Log-call string arguments are excluded. |
| 5 — Test impact | (not evaluated) | Short-circuit after Gate 4 |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle (silent)

**Expected action:** Gate 4 fails silently (log-call exclusion). No message to user. Normal heuristic scoring runs.

**Expected surfaced message (if any):**
> none
```

- [ ] **Step 12: Write fixture 11 — export overlap**

Create `/Users/weee/Dev/feature-flow/tests/start/quick_path/export-overlap.md`:

```markdown
# Fixture: Edit Overlaps export Declaration — Gate 3 Fails

## Input

**Description:** `start: rename exported function foo to bar in src/utils/helpers.ts line 3`

## Pre-conditions

- Working tree state: clean
- Target files: `src/utils/helpers.ts`
- Relevant file content (excerpt):
  ```typescript
  // line 3
  export function foo(x: number): number {
  ```
- The proposed `old_string` is `foo` — the function name identifier inside an `export function` declaration

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | File path, line, and symbol named |
| 2 — Bounded file count | PASS | 1 file ≤ max_files (3) (confirmation looks at source file only; call sites not yet checked) |
| 3 — No export overlap | FAIL | The byte range of `foo` at line 3 sits inside an `export function` declaration node. Direct overlap with export AST node. |
| 4 — Lexical region | (not evaluated) | Short-circuit after Gate 3 |
| 5 — Test impact | (not evaluated) | Short-circuit after Gate 3 |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle (silent)

**Expected action:** Gate 3 fails silently. No message to user. Normal heuristic scoring runs.

**Expected surfaced message (if any):**
> none
```

- [ ] **Step 13: Write fixture 12 — edit inside code fence in Markdown**

Create `/Users/weee/Dev/feature-flow/tests/start/quick_path/code-fence-in-md.md`:

```markdown
# Fixture: Edit Inside Code Fence in Markdown — Gate 4 Fails

## Input

**Description:** `start: update example command in README.md line 45 — change "npm install" to "npm ci"`

## Pre-conditions

- Working tree state: clean
- Target files: `README.md`
- Relevant file content (excerpt):
  ````
  ## Installation
  
  Run the following command:
  
  ```bash
  npm install     ← line 45
  ```
  ````
- The proposed `old_string` is `npm install` — inside a `` ```bash ``` `` fenced code block

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | File path and line number named |
| 2 — Bounded file count | PASS | 1 file ≤ max_files (3) |
| 3 — No export overlap | PASS | Markdown file has no export nodes |
| 4 — Lexical region | FAIL | `npm install` at line 45 sits inside a `` ``` `` fenced code block. Gate 4 rule (a) requires Markdown prose **outside** fences. Code fences are excluded. |
| 5 — Test impact | (not evaluated) | Short-circuit after Gate 4 |

## Expected Outcome

**Path taken:** fallthrough to normal lifecycle (silent)

**Expected action:** Gate 4 fails silently. Code-fence content is not treated as prose. Normal heuristic scoring runs.

**Expected surfaced message (if any):**
> none
```

- [ ] **Step 14: Write fixture 13 — two-file prose fix under max_files**

Create `/Users/weee/Dev/feature-flow/tests/start/quick_path/multi-file-prose.md`:

```markdown
# Fixture: Two-File Prose Fix — Gate 2 Passes Under Default max_files: 3

## Input

**Description:** `start: fix "occurence" → "occurrence" typo in README.md line 12 and CHANGELOG.md line 8`

## Pre-conditions

- Working tree state: clean
- Target files: `README.md` (1 file), `CHANGELOG.md` (1 file) — 2 files total
- max_files: 3 (default)
- Both edits are in Markdown prose outside code fences

## Gate Evaluation

| Gate | Result | Reason |
|------|--------|--------|
| 0 — Clean tree | PASS | `git status --porcelain` returns empty |
| 1 — Concrete target | PASS | Both file paths and line numbers named explicitly |
| 2 — Bounded file count | PASS | 2 files ≤ max_files (3) |
| 3 — No export overlap | PASS | Both are Markdown files — no export nodes |
| 4 — Lexical region | PASS | Both `old_string` ranges are in Markdown prose outside code fences |
| 5 — Test impact | PASS | No test files reference this prose string; edits are untestable prose → pass |

## Expected Outcome

**Path taken:** quick path

**Expected action:**
1. Announce: `⚡ Quick path confirmed: README.md:12, CHANGELOG.md:8 — prose edit in Markdown, 2 file(s), budget: ≤10 lines. Editing directly.`
2. Edit `README.md` line 12 and `CHANGELOG.md` line 8
3. Stop hook runs
4. Post-hook: `git diff --numstat` shows 2 lines changed (1+1) ≤ 10 → pass
5. Commit: `docs: fix occurrence typo in README and CHANGELOG (2 lines changed)`

**Expected surfaced message (if any):**
> `⚡ Quick path confirmed: README.md:12, CHANGELOG.md:8 — prose edit in Markdown, 2 file(s), budget: ≤10 lines. Editing directly.`
```

- [ ] **Step 15: Write fixture 14 — auto-format expansion**

Create `/Users/weee/Dev/feature-flow/tests/start/quick_path/auto-format-expansion.md`:

```markdown
# Fixture: Stop-Hook Auto-Format Expands Diff Beyond max_changed_lines — Post-Hook Escape Hatch Fires

## Input

**Description:** `start: fix typo in src/utils/formatter.ts line 5 — "formated" → "formatted"`

## Pre-conditions

- Working tree state: clean
- Target files: `src/utils/formatter.ts`
- Relevant file content (excerpt):
  ```typescript
  // line 5
  const formated = input.trim();
  ```
- The proposed `old_string` is inside a comment: `// formated result`
- max_changed_lines: 10 (default)
- Scenario: Stop hook runs Prettier on the file, which reformats 15 additional lines (indentation, trailing commas) — total diff becomes 17 lines

## Gate Evaluation

All 6 gates pass on confirmation (comment region, 1 file, clean tree, no export overlap).

## Expected Outcome

**Path taken:** escape hatch rollback (post-hook budget check fails)

**Expected action:**
1. All gates pass (comment region confirmed)
2. Edit tool changes 1 line in `src/utils/formatter.ts`
3. Stop hook runs Prettier → reformats 15 additional lines
4. Post-hook: `git diff --numstat src/utils/formatter.ts` → `16  1  src/utils/formatter.ts` → total 17 > max_changed_lines (10)
5. Escape hatch fires: `git checkout -- src/utils/formatter.ts`
6. No commit made.

Note: The measurement is deliberately **after** the Stop hook — this fixture exists specifically to verify that auto-format expansion is caught.

**Expected surfaced message (if any):**
> `⚠ Quick path misclassified this change (17 lines changed after auto-format exceeds max_changed_lines: 10). No commit made, working tree restored. Re-run with \`start: fix typo in src/utils/formatter.ts line 5\` for the full lifecycle.`
```

- [ ] **Step 16: Verify all 14 fixtures exist**

Run:
```bash
ls /Users/weee/Dev/feature-flow/tests/start/quick_path/
```
Expected: 14 `.md` files listed.

Run:
```bash
ls /Users/weee/Dev/feature-flow/tests/start/quick_path/ | wc -l
```
Expected: `14`

**Acceptance Criteria:**
- [ ] `tests/start/quick_path/` directory exists
- [ ] `tests/start/quick_path/` contains exactly 14 `.md` files
- [ ] `tests/start/quick_path/trivial-md-typo.md` exists and has non-empty body
- [ ] `tests/start/quick_path/untargeted-trivial.md` exists and has non-empty body
- [ ] `tests/start/quick_path/rename-many-sites.md` exists and has non-empty body
- [ ] `tests/start/quick_path/no-quick-override.md` exists and has non-empty body
- [ ] `tests/start/quick_path/exceeds-confirmed-set.md` exists and has non-empty body
- [ ] `tests/start/quick_path/dirty-tree.md` exists and has non-empty body
- [ ] `tests/start/quick_path/exceeds-max-changed-lines.md` exists and has non-empty body
- [ ] `tests/start/quick_path/identifier-edit-ts.md` exists and has non-empty body
- [ ] `tests/start/quick_path/string-literal-nonlog.md` exists and has non-empty body
- [ ] `tests/start/quick_path/logger-info-string.md` exists and has non-empty body
- [ ] `tests/start/quick_path/export-overlap.md` exists and has non-empty body
- [ ] `tests/start/quick_path/code-fence-in-md.md` exists and has non-empty body
- [ ] `tests/start/quick_path/multi-file-prose.md` exists and has non-empty body
- [ ] `tests/start/quick_path/auto-format-expansion.md` exists and has non-empty body

- [ ] **Step 17: Commit**

```bash
cd /Users/weee/Dev/feature-flow && git add tests/start/quick_path/ && git commit -m "test(start): add 14 quick-path triage fixtures

One fixture per acceptance criterion from issue #234. Covers:
- Happy paths (trivial-md-typo, string-literal-nonlog, multi-file-prose)
- Gate failures (untargeted-trivial→G1, rename-many-sites→G2,
  export-overlap→G3, identifier-edit-ts→G4, code-fence-in-md→G4,
  logger-info-string→G4, dirty-tree→G0)
- Override (no-quick-override)
- Escape hatches (exceeds-confirmed-set, exceeds-max-changed-lines,
  auto-format-expansion)

Part of #234."
```

---

## Task 8: Add CHANGELOG Entry

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Locate the [Unreleased] section**

Run:
```bash
grep -n "\[Unreleased\]\|### Added" /Users/weee/Dev/feature-flow/CHANGELOG.md | head -5
```
Expected: line numbers for `## [Unreleased]` and the next heading below it.

- [ ] **Step 2: Insert the bullet under [Unreleased] → ### Added**

In `CHANGELOG.md`, replace:
```
## [Unreleased]

## [1.35.0]
```
with:
```
## [Unreleased]

### Added
- **Quick-path triage with code-aware scope confirmation (#234)** — `start:` Triage section (renamed from "Tool Selection") is now a 3-way decision: **⚡ quick** / feature-flow / GSD. The quick path routes bounded trivial changes (prose edits, non-log string literals, comments) to a bare implement-and-commit flow, skipping brainstorm / design / verify / plan / acceptance criteria / handoff. Quick path is only taken when six ordered gates (0–5) confirm scope via a read-only pass (≤5 Bash/Grep/Read tool calls): Gate 0 (clean tree), Gate 1 (concrete target), Gate 2 (≤ `max_files` files, default 3), Gate 3 (no exported-declaration overlap), Gate 4 (lexical-region rule: Markdown prose outside fences, non-log-arg string literals, or comments; log-call string args excluded via AST ancestor walk), Gate 5 (test impact bounded). Any gate failure silently falls through to the existing feature-flow/GSD heuristic scoring, unchanged. A post-hook `git diff --numstat` budget check (≤ `max_changed_lines`, default 10, measured after Stop hook to include auto-format) and a hard-assertion escape hatch with Gate-0-safe multi-file atomic rollback guard against misclassification. New `tool_selector.quick_path` config sub-section (`enabled`, `max_confirmation_tool_calls`, `max_files`, `max_changed_lines`) with defaults that leave quick path on out of the box. New `--no-quick` CLI flag disables quick path for one invocation; no `--quick` flag is added. 14 test fixtures under `tests/start/quick_path/` cover all acceptance criteria. Language coverage: Markdown, TypeScript, JavaScript, Python; unsupported languages conservatively fail Gate 4.

## [1.35.0]
```

- [ ] **Step 3: Verify**

Run:
```bash
grep -n "Quick-path triage\|quick-path triage\|\[Unreleased\]" /Users/weee/Dev/feature-flow/CHANGELOG.md | head -5
```
Expected: hits for `[Unreleased]` and the quick-path bullet.

**Acceptance Criteria:**
- [ ] `CHANGELOG.md` contains `## [Unreleased]` followed by `### Added` (in that order, with no `## [` version heading between them)
- [ ] `CHANGELOG.md` contains the string `Quick-path triage` under `[Unreleased]`
- [ ] `CHANGELOG.md` contains the string `3-way decision` or `3-way triage` in the bullet
- [ ] `CHANGELOG.md` contains `--no-quick` in the bullet
- [ ] `CHANGELOG.md` contains `tool_selector.quick_path` in the bullet
- [ ] `CHANGELOG.md` contains `14 test fixtures` in the bullet

- [ ] **Step 4: Commit**

```bash
cd /Users/weee/Dev/feature-flow && git add CHANGELOG.md && git commit -m "docs(changelog): add quick-path triage entry under [Unreleased]

Covers 3-way triage, six gates, --no-quick flag, quick_path
config sub-section, and 14 test fixtures. Closes #234."
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Covered in task |
|-----------------|-----------------|
| Rename `## Tool Selection` → `## Triage` | Task 1 |
| Add Quick-Path Confirmation subsection (Step 3) | Task 2 |
| Six gates 0–5 with pass/fail conditions | Task 2 |
| ≤5 tool-call budget (Bash/Grep/Read only) | Task 2 |
| Gate 3 mechanical byte-range overlap check | Task 2 |
| Gate 4 lexical-region rule + log-call exclusion via AST ancestor walk | Task 2 |
| Gate 4 whitespace tolerance (fail-closed) | Task 2 |
| Gate 4 unsupported languages → conservative fail | Task 2 |
| Gate 5 test impact bounded | Task 2 |
| Budget exhaustion → silent fallthrough | Task 2 |
| Gate 0 verbatim user hint | Task 2 |
| Gate 1 verbatim user hint | Task 2 |
| ⚡ band in Step 5 with auditable announcement format | Task 3 |
| Quick-path execution branch in Step 6 (8 steps) | Task 3 |
| Escape hatch: multi-file atomic rollback | Task 3 |
| Post-hook `git diff --numstat` budget check | Task 3 |
| No state file, no session-state.json | Task 3 |
| No Claude co-author trailer | Task 3 |
| Model-authored commit, imperative mood, post-edit line count | Task 3 |
| Skip everything else (no design doc, plan, handoff) | Task 3 |
| `--no-quick` flag with precedence between `--feature-flow` and auto-detect | Task 4 |
| No `--quick` flag (explicitly absent) | Task 4 |
| `--no-quick` × `quick_path.enabled: false` documented as no-op | Task 4 |
| `tool_selector.quick_path.{enabled, max_confirmation_tool_calls, max_files, max_changed_lines}` config | Task 4 |
| Default values (enabled:true, max_calls:5, max_files:3, max_lines:10) | Task 4 |
| `skills/start/references/step-lists.md` update (quick path as alternate route) | Task 5 |
| `references/project-context-schema.md` `tool_selector.quick_path` sub-section | Task 6 |
| 14 test fixtures under `tests/start/quick_path/` | Task 7 |
| CHANGELOG `[Unreleased]` entry | Task 8 |
| GSD scoring table unchanged | Not a task (no edit needed — tasks don't touch it) |
| GSD handoff mechanism unchanged | Not a task (no edit needed) |
| No `--quick` flag | Verified as absent in Task 4 |
| No `session-state.json` | Documented in Task 3 |
| No stuck-mode breadcrumb (deferred to whichever of #234/#235 lands second) | Out of scope per design doc |

### Placeholder scan

No TBDs, TODOs, or "fill in" language present in any task. All code blocks in fixtures contain complete content. All grep commands include expected output.

### Type/name consistency check

- `max_changed_lines` — consistent across Tasks 2, 3, 4, 6, 7 (fixtures 7, 14)
- `max_files` — consistent across Tasks 2, 4, 6, 7 (fixtures 3, 13)
- `max_confirmation_tool_calls` — consistent across Tasks 2, 4, 6
- `quick_path_confirmed` — set in Task 2, read in Task 3 (consistent variable name)
- `tool_selector.quick_path` — consistent across Tasks 4, 6, 8
- `--no-quick` — consistent across Tasks 4, 6, 7 (fixture 4), 8
- Gate numbers (0–5) — consistent across all tasks and all 14 fixtures
- Auditable announcement format `⚡ Quick path confirmed: <path>:<line> — <region kind> in <language>, <N> file(s), budget: ≤<max_changed_lines> lines. Editing directly.` — consistent across Tasks 3, 7 (fixtures 1, 9, 13)
