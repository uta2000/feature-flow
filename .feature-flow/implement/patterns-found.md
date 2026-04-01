# Patterns Found

## Reference Files (skills/start/references/)
- File structure: `**Usage:**` header → `---` horizontal rule → `##` section headings → content
- Tables: pipe-delimited markdown, always preceded by explanatory text
- YOLO/Express behavior: separate paragraphs with `**YOLO behavior:**` / `**Express behavior:**` bold labels
- Pseudocode: fenced code blocks, numbered lists for sequential steps
- Cross-references: `See references/file.md` or inline backtick paths
- Reference examples: `model-routing.md`, `scope-guide.md`, `yolo-overrides.md`

## Settings Skill (skills/settings/SKILL.md)
- Dashboard: ASCII table with `─────` separators, bracket-notation values `[current value]`
- Categories: 3 sections (Workflow, Design, Advanced) → Step 3 category selection → Step 4 per-category
- AskUserQuestion: 2-4 options max, each with `description:` field
- Edit flow: display current → ask → capture → write YAML → confirm → loop back to Step 3
- YAML writes: targeted Edit tool, full-file Write as fallback
- Side effects: notification hooks sync to `~/.claude/settings.json`
- Reference examples: `skills/settings/SKILL.md:46-66` (dashboard), `skills/settings/SKILL.md:75-81` (category selection)

## Schema (references/project-context-schema.md)
- Field doc: `### field_name` heading → description → sub-fields table (Field|Type|Default|Description) → Format YAML → When absent
- Enums: markdown table (Value|Effect) for <5 values; pipe-separated inline for simple lists
- Section order: Intro → Schema YAML example → Fields → How Skills Use This File
- Reference examples: `project-context-schema.md:46-67` (plugin_version), `project-context-schema.md:148-166` (tool_selector)

## Code Review Pipeline (skills/start/references/code-review-pipeline.md)
- Agent dispatch table: columns Agent|Plugin|Checklist|Fix Mode|Model|Tier
- Scope table: columns Scope|Max Tier|Agents to Dispatch
- Filtering: numbered list (1-4) describing sequential condition checks
- Structured output: YAML block template + compliance enforcement note
- Reference examples: `code-review-pipeline.md:23-28` (scope table), `code-review-pipeline.md:161-165` (dispatch table)

## Anti-Patterns Found (do NOT replicate)
- `skills/settings/SKILL.md` (506 lines) — long single file with mixed concerns. New Plugins category should follow existing patterns but not add excessive complexity.
- Avoid free-form prose for enum values — use tables or pipe-separated notation
- Avoid duplicating content across files — reference `plugin-scanning.md` instead of restating rules

## How to Code This (per task)

### Task 1: Schema documentation
- Follow pattern from: `project-context-schema.md:148-166` (tool_selector sub-fields table)
- Use `### plugin_registry` and `### plugin_overrides` H3 headings
- Sub-fields in markdown table with Type and Default columns
- Add `## Enums` section or append to existing structure

### Task 2: Plugin scanning reference
- Follow pattern from: `model-routing.md` (usage header, tables, section structure)
- Use `**Usage:**` header, `---` separator, `##` sections
- Tables for role-keyword mapping and stack keyword mapping
- Pseudocode in fenced code blocks

### Task 3: Pre-flight check replacement
- SKILL.md is ~1500 lines — design changes before editing (identify exact line ranges)
- Replace lines 81-161, preserve Tool Parameter Types section below
- New content references `plugin-scanning.md` instead of hardcoding logic

### Task 4: Reviewer audit update
- Follow pattern from: `step-lists.md:139-163` (existing audit section)
- Preserve YOLO/Express behavior blocks
- Replace "cross-reference against Reviewer Stack Affinity Table" with "read plugin_registry"

### Task 5: Code review pipeline
- Follow pattern from: `code-review-pipeline.md:23-28` (scope table)
- Add discovered plugins row to `code-review-pipeline.md:161-165` dispatch table
- Preserve Phase 0-5 structure unchanged

### Task 6: Settings Plugins UI
- Follow pattern from: `skills/settings/SKILL.md:46-66` (dashboard) and `:75-81` (category selection)
- Add Plugins section to dashboard between Advanced and Done
- Use AskUserQuestion with 5+1 options (5 plugin actions + Back)
- Edit flow: display → ask → capture → write → confirm → loop

### Task 7: Step 0 registry loading
- Follow pattern from: `project-context.md` Knowledge Base Pre-Flight section
- YOLO/Express/Interactive behavior blocks with specific announce formats
- Reference `plugin-scanning.md` for full details, include 7-step summary
