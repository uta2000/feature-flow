# /settings Slash Command — Design Document

**Date:** 2026-03-18
**Status:** Design Complete

## Overview

Add a `/settings` slash command skill to feature-flow that lets users interactively view and manage their `.feature-flow.yml` configuration. The command displays a show-then-edit dashboard of all current settings values, then lets users pick any setting to change via inline `AskUserQuestion` prompts, with changes written immediately to `.feature-flow.yml`. Includes a new `yolo.stop_after` schema field for configurable YOLO stopping points.

## User Flow

### Step 1 — Display Dashboard

When the user types `/settings`, the skill reads `.feature-flow.yml` and displays all editable settings with their current values. A version header is shown (non-editable). Format:

```
feature-flow v1.27.0

Current Settings:

  YOLO stops:        (not configured)
  Notifications:     bell
  Default branch:    main (auto-detected)
  Git strategy:      merge
  Design prefs:      5/5 set
  Tool selector:     enabled (threshold: 0.7)
  Context7 libs:     2 libraries mapped
  CI timeout:        900s (15 min)
  KB limits:         150 lines / 14 days stale

Which setting would you like to change?
```

The dashboard is displayed as text output, then an `AskUserQuestion` asks which category to edit. `AskUserQuestion` supports 2-4 options per question, so settings are grouped into 3 categories plus "Done":

- **Workflow** — YOLO stops, Notifications, Default branch, Git strategy
- **Design** — Design preferences (5 sub-fields)
- **Advanced** — Tool selector, Context7 libraries, CI timeout, KB limits

### Step 2 — Select Category

```
AskUserQuestion: "Which category would you like to change?"
  - "Workflow" — YOLO stopping points, notifications, default branch, git strategy
  - "Design" — Error handling, API style, state management, testing, UI pattern
  - "Advanced" — Tool selector, Context7 libraries, CI timeout, knowledge base limits
  - "Done" — Exit settings
```

### Step 3 — Select Setting Within Category

After the user picks a category, display that category's current values and ask which setting to change (2-4 options per category):

**Workflow category:**
```
  YOLO stops:      (not configured)
  Notifications:   bell
  Default branch:  main (auto-detected)
  Git strategy:    merge

Which to change?
  - "YOLO stopping points"
  - "Notifications"
  - "Default branch / Git strategy"
  - "Back to dashboard"
```

Note: Default branch and Git strategy are combined into one option (two-step edit) to stay within the 4-option limit.

**Design category:**
```
  Error handling:    result_types
  API style:         rest
  State management:  server_state
  Testing:           unit_integration
  UI pattern:        tailwind

Which to change? (or "Reset all" to clear and re-prompt next session)
  - Pick from list of 5 preferences (single-select, up to 4 shown + user types for 5th)
  - "Reset all" — removes design_preferences key
  - "Back to dashboard"
```

**Advanced category:**
```
  Tool selector:   enabled (threshold: 0.7, auto-launch: off)
  Context7 libs:   2 libraries mapped
  CI timeout:      900s (15 min)
  KB limits:       150 lines / 14 days stale

Which to change?
  - "Tool selector"
  - "Context7 libraries"
  - "CI timeout / KB limits"
  - "Back to dashboard"
```

Note: CI timeout and KB limits are combined into one option (two-step edit) to stay within the 4-option limit.

### Step 4 — Edit Setting

When the user selects a specific setting, the skill presents the appropriate edit UI:

| Setting | Edit UI |
|---------|---------|
| YOLO stops | Multi-select (2 questions of 4 options each): brainstorming, design, verification, plan, implementation, pr |
| Notifications | Single-select: bell, desktop, none |
| Default branch | Single-select from local + remote branches (via `git branch -a`), plus "Clear (auto-detect)" |
| Git strategy | Single-select: merge, rebase |
| Design preferences | Single-select from known values for the chosen preference |
| Tool selector | Three-step: toggle enabled (yes/no), if enabled set threshold (0.5-0.9), then auto_launch_gsd (yes/no) |
| Context7 libraries | Show current mappings → add or remove a mapping (library name + Context7 ID via resolve-library-id) |
| CI timeout | Single-select from presets: 300s (5 min), 600s (10 min), 900s (15 min), 1800s (30 min) |
| KB limits | Two-step: set max_lines (50, 100, 150, 200), then stale_days (7, 14, 30, 60) |

### Step 5 — Save and Return

After the user makes a selection:
1. Validate the value
2. Write to `.feature-flow.yml` using the Edit tool
3. Return to the category view (Step 3) so the user can change another setting in the same category
4. "Back to dashboard" returns to Step 1 (full dashboard with categories)
5. "Done" exits settings

### Special Cases

**Notifications side-effect:** When notifications change to `bell` or `desktop`, also write/update the Stop hook in `~/.claude/settings.json` (matching the existing behavior in `start` Step 0). When changed to `none`, remove the notification hook if present.

**Default branch clearing:** Offer an option to clear `default_branch` (remove from YAML), which re-enables the auto-detection cascade.

**Design preferences clearing:** Offer a "Reset all" option that removes the `design_preferences` key entirely, so the brainstorming preamble re-fires on the next Feature/Major Feature lifecycle run.

## Schema Changes

### New field: `yolo.stop_after`

```yaml
yolo:
  stop_after:          # Optional: phases where YOLO pauses for user review
    - brainstorming    # Stop after brainstorming completes
    - design           # Stop after design document is written
    - verification     # Stop after design verification runs
    - plan             # Stop after implementation plan is created
    - implementation   # Stop before subagents start coding
    - pr               # Stop before pushing and creating the PR
```

**Behavior:** When YOLO mode is active and `yolo.stop_after` contains the current phase name, the lifecycle pauses and presents the phase output for user review. The user can then continue (resume YOLO) or switch to Interactive mode.

**When absent:** Full YOLO — no stopping points (current default behavior unchanged).

**When empty list `[]`:** Same as absent — full YOLO.

**Valid values:** `brainstorming`, `design`, `verification`, `plan`, `implementation`, `pr`. Invalid values are silently ignored.

### Integration with start skill

The `start` skill's Step 3 execution loop needs a phase-boundary check. After each YOLO-eligible phase completes:

```
if yolo_mode AND current_phase in config.yolo.stop_after:
    Present phase output to user via AskUserQuestion:
      "YOLO checkpoint: [phase] complete. [summary]. Continue?"
      - "Continue YOLO" → resume unattended
      - "Switch to Interactive" → disable YOLO for remaining phases
    Announce: "YOLO: checkpoint — [phase] → paused for review"
```

This check is added to the step execution loop in `start/SKILL.md`, not to individual skills. The skills themselves remain unaware of stop_after — the orchestrator handles the pause.

## New Skill File Structure

```
skills/
  settings/
    SKILL.md          # The skill definition
```

**Frontmatter:**

```yaml
---
name: settings
description: View and manage Feature-flow settings — YOLO stops, notifications, branches, design preferences, and more. Use when the user asks to "configure", "change settings", "update config", or "/settings".
tools: Read, Edit, Bash, AskUserQuestion, Glob, Grep
---
```

**No reference files needed** — all setting definitions and validation logic live in the SKILL.md itself.

**Registration:** Auto-discovered from `skills/settings/SKILL.md` — no plugin.json changes needed.

## Patterns & Constraints

### Error Handling

- **Missing `.feature-flow.yml`:** If the file doesn't exist, create it with defaults (match `start` skill's auto-detection behavior) and announce: "Created .feature-flow.yml with defaults."
- **Malformed YAML:** If the file can't be parsed, warn the user and offer to recreate it from auto-detection.
- **Edit failures:** If an Edit tool call fails (e.g., old_string not found due to YAML formatting), read the full file and use Write to replace it with the corrected version.

### Types

- `stop_after` is a list of string literals: `'brainstorming' | 'design' | 'verification' | 'plan'`
- All existing field types remain unchanged per `project-context-schema.md`

### Performance

- Dashboard display requires one file read (`.feature-flow.yml`) — no expensive operations
- Branch listing for default_branch edit: `git branch -a` — fast, local operation
- Context7 library resolution: one MCP call per addition — acceptable for interactive use

## Scope

### Included

- New `skills/settings/SKILL.md` skill file
- New `yolo.stop_after` schema field in `references/project-context-schema.md`
- Document existing `tool_selector` field in `references/project-context-schema.md` (currently undocumented)
- Integration point in `skills/start/SKILL.md` for stop_after checkpoint logic
- Dashboard display with all 9 editable settings (grouped into 3 categories)
- Inline editing for all settings via AskUserQuestion (respecting 2-4 option limit per question)
- Save-and-return-to-category loop, then back-to-dashboard loop
- Notification hook side-effect (matching existing start behavior)
- Tool selector edit includes `auto_launch_gsd` sub-field

### Excluded

- Gotchas editing (grows organically via other skills)
- Platform/stack editing (auto-detected, rarely needs manual change)
- Plugin version display as editable (auto-managed)
- `/settings <name>` direct-access arguments (dashboard only)
- types_path editing (rarely needed, fine as manual YAML)
