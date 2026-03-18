---
name: settings
description: View and manage Feature-flow settings — YOLO stops, notifications, branches, design preferences, and more. Use when the user asks to "configure", "change settings", "update config", or "/settings".
tools: Read, Edit, Bash, AskUserQuestion, Glob, Grep
---

# Settings

Interactive dashboard for viewing and editing all feature-flow configuration values stored in `.feature-flow.yml`.

**Announce at start:** "Opening feature-flow settings..."

## When to Use

- When the user wants to view or change any feature-flow configuration
- When `.feature-flow.yml` exists and the user wants to explore what's configured
- When the user mentions a specific setting by name (notifications, YOLO, default branch, etc.)
- When the user wants to reset or review design preferences

## Process

### Step 1: Load Configuration

Read `.feature-flow.yml` from the project root.

**If the file does not exist**, create it with these defaults:

```yaml
plugin_version: 1.0.0
notifications:
  on_stop: bell
tool_selector:
  enabled: true
  confidence_threshold: 0.7
  auto_launch_gsd: false
```

Then announce: "Created `.feature-flow.yml` with defaults. You can now configure your settings."

**If the file exists**, read it and parse the current values for all 9 settings using the reference table below.

### Step 2: Display Dashboard

Print the settings dashboard. Use `plugin_version` from the file for the version header. If `plugin_version` is missing, display `unknown`.

```
feature-flow v[plugin_version] — Settings

  Workflow
  ─────────────────────────────────────────
  YOLO stops          [yolo.stop_after values, comma-separated, or "none"]
  Notifications       [notifications.on_stop, or "bell" if unset]
  Default branch      [default_branch, or "auto-detect"]
  Git strategy        [git_strategy, or "merge"]

  Design
  ─────────────────────────────────────────
  Design preferences  [count of defined prefs, e.g. "3 of 5 set" or "not set"]

  Advanced
  ─────────────────────────────────────────
  Tool selector       [enabled/disabled, threshold, auto-launch]
  Context7 libraries  [count of mappings, e.g. "2 libraries" or "none"]
  CI timeout          [ci_timeout_seconds]s, or "600s (default)"
  KB limits           [knowledge_base.max_lines lines / knowledge_base.stale_days day retention, or defaults]
```

For multi-value settings, display a summary on one line (e.g., `"brainstorming, plan"` for YOLO stops, `"enabled / 0.70 threshold / manual launch"` for tool selector).

### Step 3: Category Selection

Ask which category the user wants to edit:

```
AskUserQuestion: "Which category would you like to edit?"
Options:
- "Workflow" with description: "YOLO stops, notifications, default branch, git strategy"
- "Design" with description: "Design preferences for code style, testing, UI patterns"
- "Advanced" with description: "Tool selector, Context7 libraries, CI timeout, KB limits"
- "Done" with description: "Exit settings"
```

If the user selects **Done**, print: "Settings closed." and exit the skill.

Otherwise, continue to Step 4 for the selected category.

### Step 4: Setting Selection Within Category

Based on the selected category, ask which setting to edit.

#### Workflow Category

```
AskUserQuestion: "Which Workflow setting?"
Options:
- "YOLO stops" with description: "Phases where feature-flow pauses for confirmation (currently: [current value])"
- "Notifications" with description: "Alert style when a phase completes (currently: [current value])"
- "Branch & strategy" with description: "Default branch name and git merge/rebase strategy (currently: [branch] / [strategy])"
- "Back" with description: "Return to category selection"
```

#### Design Category

```
AskUserQuestion: "Which Design setting?"
Options:
- "Design preferences" with description: "Edit or reset the 5 code-style preferences (currently: [N] of 5 set)"
- "Back" with description: "Return to category selection"
```

#### Advanced Category

```
AskUserQuestion: "Which Advanced setting?"
Options:
- "Tool selector" with description: "Intelligent GSD vs feature-flow recommendation (currently: [enabled/disabled])"
- "Context7 libraries" with description: "Documentation library mappings (currently: [N] libraries)"
- "Timeouts & limits" with description: "CI timeout and knowledge base retention limits"
- "Back" with description: "Return to category selection"
```

If the user selects **Back** in any category, return to Step 3.

### Step 5: Edit UI for Each Setting

After the user selects a setting, display its edit UI. On save, write the change to `.feature-flow.yml` using the Edit tool, print a confirmation, then loop back to Step 3 (category selection).

---

#### 5A: YOLO Stops (`yolo.stop_after`)

Display the current stops (empty list = never stop = full YOLO mode).

```
AskUserQuestion: "Which phases should feature-flow stop and wait for your approval?"
Options:
- "brainstorming, design, verification, plan (all stops)" with description: "Pause at every major phase — maximum control"
- "brainstorming, plan" with description: "Pause only at the start (brainstorming) and before coding begins (plan)"
- "plan only" with description: "Pause only before coding — approve the plan before implementation starts"
- "none (full YOLO)" with description: "Never pause — run all phases automatically without asking"
```

Write result to `yolo.stop_after` as a YAML list. For "none", write an empty list `[]`.

**Confirmation:** `"YOLO stops updated: [new value]"`

---

#### 5B: Notifications (`notifications.on_stop`)

```
AskUserQuestion: "How should feature-flow notify you when a phase completes?"
Options:
- "bell" with description: "Terminal bell (\\a) — audible beep when a stop is reached"
- "desktop" with description: "macOS/Linux desktop notification via osascript or notify-send"
- "none" with description: "No notification — rely on terminal output only"
```

Write result to `notifications.on_stop`.

**Side effect — notification hook:** After writing the YAML, update `~/.claude/settings.json` to register or remove the Stop hook:

- If new value is `bell` or `desktop`: ensure the hook `bash -c 'source ~/.zshrc 2>/dev/null; feature-flow-notify'` (or equivalent) is present in the `Stop` hooks array.
- If new value is `none`: remove the feature-flow Stop hook from `~/.claude/settings.json` if present.

Read `~/.claude/settings.json` first; if it does not exist, create it. Preserve all existing hooks. Only add/remove the feature-flow hook entry.

**Confirmation:** `"Notifications updated: [new value]. Stop hook [registered/removed] in ~/.claude/settings.json."`

---

#### 5C: Branch & Strategy (`default_branch`, `git_strategy`)

This edit UI handles two related settings in one flow.

**Step 5C-1 — Default branch:**

Run `git branch -r` to get a list of remote branches. Present up to 3 branches as options plus "Clear (auto-detect)":

```
AskUserQuestion: "Which branch should feature-flow use as the default base branch?"
Options:
- "[branch1]" with description: "Set as default base branch"
- "[branch2]" with description: "Set as default base branch"
- "[branch3 if present]" with description: "Set as default base branch"
- "Clear (auto-detect)" with description: "Remove default_branch — feature-flow will detect main/master automatically"
```

If `git branch -r` fails or returns no results, show only "Clear (auto-detect)" and a manual entry prompt.

Write result to `default_branch`. For "Clear", remove the `default_branch` key entirely.

**Step 5C-2 — Git strategy:**

```
AskUserQuestion: "Which git strategy should feature-flow use when updating branches?"
Options:
- "merge" with description: "git merge — preserves full history with merge commits"
- "rebase" with description: "git rebase — linear history, rewrites commits onto the base branch"
```

Write result to `git_strategy`.

**Confirmation:** `"Branch updated: [new_branch or 'auto-detect']. Git strategy updated: [new_strategy]."`

---

#### 5D: Design Preferences (`design_preferences.*`)

Display a sub-dashboard of all 5 preferences with current values:

```
Design Preferences
─────────────────────────────────────────
  error_handling      [current value or "not set"]
  api_style           [current value or "not set"]
  state_management    [current value or "not set"]
  testing             [current value or "not set"]
  ui_pattern          [current value or "not set"]
```

Then ask which preference to edit:

```
AskUserQuestion: "Which design preference would you like to change?"
Options:
- "error_handling" with description: "How errors are represented in code (currently: [value or 'not set'])"
- "api_style" with description: "API communication style (currently: [value or 'not set'])"
- "state_management / testing" with description: "State management approach and testing strategy"
- "ui_pattern / Reset all" with description: "UI pattern preference, or remove all design_preferences"
```

**If "error_handling":**

```
AskUserQuestion: "Error handling style?"
Options:
- "result_types" with description: "Return Result<T, E> / Either types — explicit error paths"
- "exceptions" with description: "throw/catch — standard exception handling"
- "error_objects" with description: "Return { data, error } objects — no exceptions thrown"
- "mixed" with description: "No strong preference — match existing code"
```

**If "api_style":**

```
AskUserQuestion: "API communication style?"
Options:
- "rest" with description: "REST over HTTP — standard JSON endpoints"
- "graphql" with description: "GraphQL — typed queries and mutations"
- "server_actions" with description: "Next.js Server Actions — colocated server functions"
- "rpc / trpc" with description: "RPC-style calls or tRPC for end-to-end type safety"
```

**If "state_management / testing":** Ask state_management first, then testing in sequence.

State management:

```
AskUserQuestion: "State management approach?"
Options:
- "local" with description: "Component-local state — useState/useReducer"
- "global_store" with description: "Global store — Zustand, Redux, Jotai, etc."
- "server_state" with description: "Server state — React Query, SWR, tRPC"
- "url_state / context_hooks" with description: "URL params as state, or React Context + hooks"
```

Testing:

```
AskUserQuestion: "Testing strategy?"
Options:
- "unit" with description: "Unit tests only"
- "unit_integration" with description: "Unit + integration tests"
- "unit_integration_e2e" with description: "Unit + integration + end-to-end tests"
- "match_existing" with description: "Match whatever testing patterns exist in the codebase"
```

**If "ui_pattern / Reset all":** Ask the user to choose between editing ui_pattern or resetting all:

```
AskUserQuestion: "Edit UI pattern or reset all design preferences?"
Options:
- "component_library" with description: "Use a component library (shadcn, Radix, MUI, etc.)"
- "tailwind" with description: "Tailwind CSS utility classes"
- "css_modules / styled" with description: "CSS Modules or Styled Components"
- "Reset all (remove key)" with description: "Remove the entire design_preferences block — feature-flow will infer from codebase"
```

If "Reset all": remove the entire `design_preferences` key from `.feature-flow.yml`.
If a ui_pattern value: write `design_preferences.ui_pattern` with:
- `"component_library"` for component_library
- `"tailwind"` for tailwind
- `"css_modules"` for css_modules/styled (ask a follow-up if ambiguous, or default to `"css_modules"`)
- `"match_existing"` — not listed here; this value is set only via explicit user selection

Write each selected preference to `design_preferences.[key]` in `.feature-flow.yml`.

**Confirmation:** `"Design preference updated: [key] = [value]"` (or `"Design preferences cleared."` for reset).

---

#### 5E: Tool Selector (`tool_selector.*`)

Three-step flow:

**Step 5E-1 — Enable/disable:**

```
AskUserQuestion: "Enable intelligent tool selection (GSD vs feature-flow recommendation)?"
Options:
- "yes (enabled)" with description: "Analyze task description and recommend the right tool at session start"
- "no (disabled)" with description: "Always use feature-flow without tool selection analysis"
```

If "no (disabled)": write `tool_selector.enabled: false`. Skip to confirmation.

If "yes (enabled)": continue to step 5E-2.

**Step 5E-2 — Confidence threshold:**

```
AskUserQuestion: "Minimum confidence required before recommending GSD?"
Options:
- "0.5 (50%)" with description: "Recommend GSD whenever there is slight evidence — more aggressive switching"
- "0.7 (70%)" with description: "*Default — recommend GSD only with solid evidence*"
- "0.8 (80%)" with description: "Recommend GSD only when very confident — conservative switching"
- "0.9 (90%)" with description: "Almost never recommend GSD — must be extremely obvious"
```

Write result to `tool_selector.confidence_threshold` as a float (e.g., `0.7`).

**Step 5E-3 — Auto-launch:**

```
AskUserQuestion: "When GSD is recommended, should it launch automatically?"
Options:
- "yes (auto-launch)" with description: "Launch GSD automatically without asking — fastest flow"
- "no (ask first)" with description: "*Default — show recommendation and ask before launching GSD*"
```

Write result to `tool_selector.auto_launch_gsd` as a boolean (`true` or `false`).

**Confirmation:** `"Tool selector updated: [enabled/disabled], threshold [value], auto-launch [yes/no]."`

---

#### 5F: Context7 Libraries (`context7.*`)

Display current mappings:

```
Context7 Library Mappings
─────────────────────────────────────────
  [stack-name]   → [library-id]
  [stack-name]   → [library-id]
  (none)
```

```
AskUserQuestion: "What would you like to do with Context7 library mappings?"
Options:
- "Add a mapping" with description: "Associate a stack name with a Context7 library ID"
- "Remove a mapping" with description: "Delete an existing stack → library mapping"
- "Back" with description: "Return to category selection without changes"
```

**If "Add a mapping":** The user provides the stack name and library ID via freeform text input (the "Other" option on AskUserQuestion). Ask: "Enter the stack name and Context7 library ID (e.g., `supabase /supabase/supabase-js`):" — the user types their answer in the "Other" text field. Parse the response to extract stack name and library ID. If available, use `mcp__plugin_context7_context7__resolve-library-id` to validate the ID before saving. Write to `context7.[stack-name]: [library-id]` in `.feature-flow.yml`. Announce: `"Added context7.[stack-name] = [library-id]."`

**If "Remove a mapping":** Show the list of current keys as options. Ask which to remove. Delete the key from the `context7` block. Announce: `"Removed context7.[stack-name]."`

**If the `context7` block is empty and the user selects "Remove":** Announce: `"No mappings to remove."` and return to category selection.

---

#### 5G: Timeouts & Limits (`ci_timeout_seconds`, `knowledge_base.*`)

Two-step flow covering CI timeout and knowledge base limits together.

**Step 5G-1 — CI timeout:**

```
AskUserQuestion: "CI timeout — how long should feature-flow wait for CI to pass?"
Options:
- "300s (5 minutes)" with description: "Short CI pipelines — lint, unit tests only"
- "600s (10 minutes)" with description: "*Default — most standard pipelines*"
- "900s (15 minutes)" with description: "Slower pipelines with integration tests"
- "1800s (30 minutes)" with description: "Long pipelines with e2e tests or slow builds"
```

Write result to `ci_timeout_seconds` as an integer.

**Step 5G-2 — KB max lines:**

```
AskUserQuestion: "Knowledge base max lines — maximum lines per KB entry before truncation?"
Options:
- "50 lines" with description: "Compact entries — saves context tokens"
- "150 lines" with description: "*Default — balanced detail and token use*"
- "150 lines" with description: "Detailed entries — richer context"
- "200 lines" with description: "Verbose entries — maximum detail"
```

Write result to `knowledge_base.max_lines` as an integer.

**Step 5G-3 — KB stale days:**

```
AskUserQuestion: "Knowledge base stale days — how many days before an entry is flagged as stale?"
Options:
- "7 days" with description: "Aggressive freshness — entries expire in one week"
- "14 days" with description: "Moderate freshness — entries expire in two weeks"
- "14 days" with description: "*Default — two-week retention*"
- "60 days" with description: "Long retention — entries survive two months before stale"
```

Write result to `knowledge_base.stale_days` as an integer.

**Confirmation:** `"CI timeout set to [value]s. Knowledge base: max [max_lines] lines, [stale_days]-day retention."`

---

### Save and Return Loop

After each successful edit (any setting in Step 5), perform these steps in order:

1. Write the change to `.feature-flow.yml` using the Edit tool. Preserve all other keys and formatting.
2. Print a one-line confirmation as specified in the edit UI section.
3. Apply any side effects (notification hook for 5B; no side effects for other settings).
4. Return to **Step 3** (category selection), re-displaying the updated dashboard header so the user sees the new value reflected.

Do not exit the skill after a save. The user exits explicitly by selecting "Done" in Step 3.

---

## Setting Definitions Reference

| # | Setting | YAML Path | Default |
|---|---------|-----------|---------|
| 1 | YOLO stops | `yolo.stop_after` | `[]` (no stops) |
| 2 | Notifications | `notifications.on_stop` | `bell` |
| 3 | Default branch | `default_branch` | _(absent = auto-detect)_ |
| 4 | Git strategy | `git_strategy` | `merge` |
| 5 | Design preferences | `design_preferences.*` | _(absent = infer from codebase)_ |
| 6 | Tool selector | `tool_selector.*` | enabled, 0.7, no auto-launch |
| 7 | Context7 libraries | `context7.*` | _(absent = no mappings)_ |
| 8 | CI timeout | `ci_timeout_seconds` | `900` |
| 9 | KB limits | `knowledge_base.max_lines`, `knowledge_base.stale_days` | `150`, `14` |

---

## Special Cases

### Notification Hook Side Effect

When `notifications.on_stop` is changed, the Stop hook in `~/.claude/settings.json` must be kept in sync:

- **bell or desktop:** Ensure the entry `{ "matcher": "", "hooks": [{ "type": "command", "command": "bash -c 'feature-flow-notify'" }] }` is present in the `Stop` hooks list (or the platform-equivalent command). Add it only if not already present — do not create duplicates.
- **none:** Remove the feature-flow Stop hook entry from the list. Leave all other Stop hooks intact.

If `~/.claude/settings.json` does not exist, create it as `{ "hooks": { "Stop": [] } }` before appending. If the `hooks.Stop` array does not exist, create it.

### Default Branch Clearing

When the user selects "Clear (auto-detect)" for default branch, remove the `default_branch` key from `.feature-flow.yml` entirely (do not set it to `null` or empty string). Feature-flow will then detect `main` or `master` automatically.

### Design Preferences Reset

When the user selects "Reset all" in the design preferences UI, remove the entire `design_preferences` block from `.feature-flow.yml`. Do not leave an empty `design_preferences: {}` — remove the key. This returns the project to codebase-inferred preferences.

---

## Error Handling

| Situation | Response |
|-----------|----------|
| `.feature-flow.yml` missing | Create with defaults (Step 1), then continue |
| `.feature-flow.yml` malformed YAML | Warn: "`.feature-flow.yml` appears malformed and cannot be parsed." Use `AskUserQuestion`: "Recreate with auto-detected defaults?" — "Recreate" (recommended) or "Cancel". If recreate: run auto-detection (match `start` skill behavior), write new file, continue. If cancel: exit settings. |
| `git branch -r` fails or returns empty | Show "Clear (auto-detect)" only for branch selection; skip branch list |
| `~/.claude/settings.json` missing | Create it before writing the notification hook |
| `~/.claude/settings.json` is malformed JSON | Report: "Could not update notification hook — `~/.claude/settings.json` is malformed. Please fix it manually." Do not overwrite. |
| Edit fails (old_string not found) | Fallback: read the full `.feature-flow.yml`, modify the parsed content in memory, and use the Write tool to replace the entire file. Announce: "Edit failed — rewrote file with updated value." |
| Edit fails (permission error) | Report: "Failed to save [setting name]. Check file permissions on `.feature-flow.yml`." Return to Step 3 without updating. |
| Unknown YAML values in file | Display the raw value in the dashboard; do not reject or modify unknown keys. |

---

## Quality Rules

- **Non-destructive:** Never overwrite keys that are not being edited. Use the Edit tool for targeted replacements.
- **Preserve formatting:** Keep comments and whitespace in `.feature-flow.yml` when possible. Do not reformat the entire file on each save.
- **AskUserQuestion limits:** Every AskUserQuestion call has exactly 2–4 options. Never exceed 4 options in a single question.
- **Always confirm:** Every save must be followed by a visible confirmation message before returning to category selection.
- **Side effects explicit:** The notification hook side effect must be documented in the confirmation message, not performed silently.
- **No guessing:** If a YAML value is unrecognized, display it as-is and let the user decide — do not auto-correct or normalize.
- **Loop, don't exit:** After any save, return to Step 3. Never exit the skill except when the user selects "Done".
