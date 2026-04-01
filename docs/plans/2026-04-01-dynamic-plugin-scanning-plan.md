# Dynamic Plugin Scanning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded plugin checks with a dynamic registry that scans installed plugins, classifies capabilities via keyword matching, and integrates them into any lifecycle step.

**Architecture:** New reference file `plugin-scanning.md` contains the scanning/classification logic. The start skill's Pre-Flight Check section is replaced with a registry-based approach. The settings skill gains a Plugins category. The code review pipeline dispatches agents from the registry instead of a static affinity table.

**Tech Stack:** Markdown (prompt instructions), YAML (configuration)

**Issue:** #207

---

### Task 1: Add plugin_registry and plugin_overrides schema to project-context-schema.md

**Files:**
- Modify: `references/project-context-schema.md`

**Quality Constraints:**
- Pattern: Follow existing field documentation format in `references/project-context-schema.md` (field name heading, description, type, default, example YAML)
- Naming: All new YAML keys use snake_case
- Cross-references: Use backtick paths for file references

**Acceptance Criteria:**
- [ ] `references/project-context-schema.md` contains a `### plugin_registry` section documenting `last_scan`, `content_hashes`, and `plugins` map structure
- [ ] `references/project-context-schema.md` contains a `### plugin_overrides` section documenting `roles`, `stack_affinity`, and `exclude` fields
- [ ] The schema documents all 6 enum types: `LifecycleRole`, `StackIdentifier`, `PluginSource`, `PluginStatus`, `ComponentType`, `Confidence`
- [ ] The `plugin_registry` field description includes the `# auto-generated` comment convention
- [ ] Grep for `plugin_registry` in `references/project-context-schema.md` returns at least 3 matches

**Step 1: Read the current schema file**

Read `references/project-context-schema.md` to find the insertion point (after the last field definition).

**Step 2: Add plugin_registry schema section**

Insert after the last field section (likely `yolo`). Include:
- Field name, type, default (absent)
- `last_scan`: ISO 8601 timestamp of last scan
- `content_hashes`: map of `plugin_key → SHA-256 hash string`
- `plugins`: map of `<marketplace>/<plugin-name>` → plugin entry object
- Plugin entry fields: `source` (PluginSource), `status` (PluginStatus), `roles` (array of role entries), `stack_affinity` (list of StackIdentifier or `["*"]`)
- Role entry fields: `step` (LifecycleRole), `component` (string), `type` (ComponentType), `confidence` (Confidence, optional — discovered only)

**Step 3: Add plugin_overrides schema section**

Insert after `plugin_registry`. Include:
- Field name, type, default (absent)
- Override entry fields: `roles` (list of LifecycleRole), `stack_affinity` (list of StackIdentifier), `exclude` (boolean)
- Override precedence documentation

**Step 4: Add enum definitions section**

Add a `## Enums` section (or append to existing Types section if one exists) documenting all 6 enum types with their valid values.

**Step 5: Commit**

```bash
git add references/project-context-schema.md
git commit -m "docs: add plugin_registry and plugin_overrides schema — #207"
```

---

### Task 2: Create plugin-scanning.md reference file

**Files:**
- Create: `skills/start/references/plugin-scanning.md`

**Quality Constraints:**
- Pattern: Follow existing reference file structure — usage header (`**Usage:**`), horizontal rule, `##` section headings, tables for structured data
- Naming: kebab-case for file name, snake_case for YAML keys in examples
- Cross-references: Reference design doc path with backticks

**Acceptance Criteria:**
- [ ] File `skills/start/references/plugin-scanning.md` exists
- [ ] File contains a `## First-Run Bootstrap` section
- [ ] File contains a `## Scan Fast Path` section mentioning SHA-256 content hashes
- [ ] File contains a `## Scanning Process` section with numbered steps 1-3
- [ ] File contains a `## Keyword Classification` section with the Role-Keyword Mapping table (8 roles)
- [ ] File contains a `## Stack Affinity Inference` section with the Stack Keyword table (10 stacks)
- [ ] File contains a `## Base Plugin Registry` section with the 5-plugin table
- [ ] File contains a `## Fallback Validation` section describing namespace-prefix checks
- [ ] File contains a `## Registry Query` section with `get_plugins_for_step` pseudocode
- [ ] The classification algorithm specifies tokenization on whitespace AND hyphens: `split(/[\s\-]+/)`
- [ ] Self-detection mentions matching `plugin.json` name against `"feature-flow"` AND `CLAUDE_PLUGIN_ROOT`
- [ ] Hooks-only plugin handling is documented explicitly
- [ ] Registry keys use `<marketplace>/<plugin-name>` format

**Step 1: Create the file with usage header**

Write the file header:
```markdown
# Plugin Scanning & Registry

**Usage:** Read this file during Step 0 pre-flight to perform dynamic plugin scanning. The start skill references this file instead of hardcoded plugin checks.

---
```

**Step 2: Write First-Run Bootstrap section**

Copy the first-run bootstrap logic from the design document's Plugin Scanning Process section. Include the behavior when `~/.claude/plugins/cache/` doesn't exist, and when the registry has no prior entries.

**Step 3: Write Scan Fast Path section**

Document the content hash mechanism: `content_hashes` map, SHA-256 comparison, skip/reuse logic.

**Step 4: Write Scanning Process section**

Numbered steps 1-3 from the design doc:
1. Walk cache directory (with substeps a-g including hooks-only handling)
2. Detect feature-flow itself (match name + CLAUDE_PLUGIN_ROOT)
3. Diff against persisted registry (additions, removals, changes)

**Step 5: Write Keyword Classification section**

Include:
- Role-Keyword Mapping table (8 roles with trigger keywords)
- Classification Algorithm pseudocode (tokenize on `[\s\-]+`, double-weight for plugin.keywords)
- Confidence thresholds (≥2 = high, ==1 = low)
- Multi-role assignment documentation

**Step 6: Write Stack Affinity Inference section**

Stack Keyword → Maps To table (10 stacks). Default to `["*"]` when no keywords found.

**Step 7: Write Base Plugin Registry section**

5-plugin table with requirement level, known roles, and stack affinity. Note that base plugins skip keyword classification.

**Step 8: Write Fallback Validation section**

The namespace-prefix verification step that runs after filesystem scanning:
1. Check skill list for `superpowers:*`, `pr-review-toolkit:*`, etc.
2. Check tool list for `mcp__plugin_context7_context7__*`
3. `installed_not_loaded` status for mismatches

**Step 9: Write Registry Query section**

`get_plugins_for_step` pseudocode from the design doc. Note that `project_stack` comes from `.feature-flow.yml` `stack` field.

**Step 10: Write Lifecycle Step Integration section**

- Code review pipeline: discovered = Tier 3, base = existing tiers
- Other steps: supplementary dispatch after existing logic

**Step 11: Write User Overrides section**

`plugin_overrides` YAML example, override precedence (1. overrides, 2. base roles, 3. keyword classification).

**Step 12: Write Error Handling section**

Split error handling:
- Base required (superpowers, context7): throw/stop
- Base recommended: warn/continue
- Discovered: warn/skip per individual failure
- Registry write failure: hold in session context

**Step 13: Commit**

```bash
git add skills/start/references/plugin-scanning.md
git commit -m "feat: add plugin-scanning reference file — #207"
```

---

### Task 3: Replace Pre-Flight Check in skills/start/SKILL.md

**Files:**
- Modify: `skills/start/SKILL.md`

**Quality Constraints:**
- Design-first: SKILL.md is ~1500 lines — output change plan showing exact line ranges to replace before any Edit call
- Pattern: Preserve surrounding section structure (## headings, ### subheadings)
- Cross-references: Use `references/plugin-scanning.md` backtick paths

**Acceptance Criteria:**
- [ ] The old hardcoded `### superpowers (required)` through `### Pre-Flight Reviewer Audit, Marketplace Discovery & Install` sections (approx lines 81-161) are replaced
- [ ] New section reads: `**Read \`references/plugin-scanning.md\`** for the full scanning process, keyword classification, and registry management.`
- [ ] New section contains a summary paragraph explaining the registry-based approach
- [ ] The `### Reviewer Stack Affinity Table` static table is removed
- [ ] A new `### Dynamic Plugin Registry` subsection references the scanning reference file
- [ ] The `### Pre-Flight Reviewer Audit, Marketplace Discovery & Install` line now references the registry instead of hardcoded checks
- [ ] Grep for `"Check for its presence by looking for any skill starting with"` in `skills/start/SKILL.md` returns 0 matches
- [ ] Grep for `"references/plugin-scanning.md"` in `skills/start/SKILL.md` returns at least 1 match

**Step 1: Read the current Pre-Flight Check section**

Read `skills/start/SKILL.md` lines 80-165 to understand the exact boundaries of the section to replace.

**Step 2: Replace the hardcoded checks with registry reference**

Replace the entire block from `## Pre-Flight Check` through the Reviewer Stack Affinity Table and the `### Pre-Flight Reviewer Audit, Marketplace Discovery & Install` instruction with:

```markdown
## Pre-Flight Check

Before starting, build the plugin registry by scanning installed plugins.

**Read `references/plugin-scanning.md`** for the full scanning process, keyword classification, and registry management.

### Dynamic Plugin Registry

At Step 0, feature-flow scans `~/.claude/plugins/cache/` to discover all installed plugins. It reads each plugin's `plugin.json` manifest and component metadata, classifies capabilities via keyword matching into 8 lifecycle roles, and persists the results in `.feature-flow.yml` under `plugin_registry`.

Base plugins (superpowers, context7, pr-review-toolkit, feature-dev, backend-api-security) are always present with hardcoded known roles. Discovered plugins extend beyond the base set. If a base required plugin (superpowers, context7) is missing, stop the lifecycle with an installation message. If a recommended plugin is missing, warn and continue.

After scanning, run fallback validation: verify base plugins are actually loaded in the current session via namespace-prefix detection in the skill/tool list.

### Pre-Flight Reviewer Audit, Marketplace Discovery & Install

**Read `references/step-lists.md` — "Pre-Flight Reviewer Audit", "Marketplace Discovery", and "Install Missing Plugins Prompt" sections** after completing the registry scan above. The audit now reads from `plugin_registry` in `.feature-flow.yml` instead of individual hardcoded checks.
```

**Step 3: Verify the Tool Parameter Types section is preserved**

The existing section about tool parameter types (around line 163-171 in the original) should remain intact below the new Pre-Flight Check section.

**Step 4: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: replace hardcoded pre-flight checks with dynamic registry — #207"
```

---

### Task 4: Update Pre-Flight Reviewer Audit in step-lists.md

**Files:**
- Modify: `skills/start/references/step-lists.md`

**Quality Constraints:**
- Pattern: Preserve existing section structure and YOLO/Express behavior documentation
- Cross-references: Reference `plugin-scanning.md` for scanning process details

**Acceptance Criteria:**
- [ ] The `## Pre-Flight Reviewer Audit` section in `step-lists.md` references `plugin_registry` from `.feature-flow.yml` instead of individual plugin checks
- [ ] The audit process reads plugins from `plugin_registry.plugins` and groups by `source` (base/discovered)
- [ ] The `## Marketplace Discovery` section is unchanged (still runs `claude plugins search`)
- [ ] The `## Install Missing Plugins Prompt` section is unchanged
- [ ] Grep for `"plugin_registry"` in `skills/start/references/step-lists.md` returns at least 1 match

**Step 1: Read the current Pre-Flight Reviewer Audit section**

Read `skills/start/references/step-lists.md` lines 139-163.

**Step 2: Rewrite the audit process**

Replace the current process (which cross-references installed plugins against the static Reviewer Stack Affinity Table) with a registry-based approach:

1. Read `plugin_registry` from `.feature-flow.yml`
2. Group plugins by `source` (base required, base recommended, discovered)
3. For each plugin: show name, roles, stack affinity, and status
4. Classify as: installed+relevant, installed+irrelevant (stack mismatch), missing
5. Report using the same format but driven by registry data

**Step 3: Commit**

```bash
git add skills/start/references/step-lists.md
git commit -m "feat: update reviewer audit to use plugin registry — #207"
```

---

### Task 5: Update code review pipeline to use registry

**Files:**
- Modify: `skills/start/references/code-review-pipeline.md`

**Quality Constraints:**
- Pattern: Preserve existing Phase 0-5 structure — only modify agent selection and dispatch sections
- Cross-references: Reference `plugin-scanning.md` Registry Query section

**Acceptance Criteria:**
- [ ] The scope-based agent selection section references the registry instead of the static affinity table
- [ ] The Phase 1b agent dispatch table includes a row for dynamically-discovered code review plugins as Tier 3
- [ ] The filtering logic at dispatch time reads `plugin_registry` from `.feature-flow.yml` and applies `get_plugins_for_step("code_review", project_stack)`
- [ ] Discovered plugins are dispatched in report-only mode with the same structured output format
- [ ] The existing Phase 0-5 structure is unchanged
- [ ] Grep for `"plugin_registry"` in `skills/start/references/code-review-pipeline.md` returns at least 1 match

**Step 1: Read the current scope-based agent selection section**

Read `skills/start/references/code-review-pipeline.md` lines 1-35 and the Phase 1b agent dispatch table (lines 137-170).

**Step 2: Update scope-based agent selection**

Replace the static affinity table reference with registry-based dispatch:

```markdown
**Scope-based agent selection with registry filtering:** Select which agents to dispatch based on scope tier AND the plugin registry. Query `plugin_registry` from `.feature-flow.yml` using `get_plugins_for_step("code_review", project_stack)` (see `references/plugin-scanning.md` — Registry Query section).

Base plugins retain their existing tier assignments:
- Tier 1: superpowers:code-reviewer, silent-failure-hunter (internal)
- Tier 2: code-simplifier (internal), feature-dev:code-reviewer
- Tier 3: pr-test-analyzer, type-design-analyzer, backend-api-security:backend-security-coder

**Discovered plugins** with `code_review` or `security_review` roles are dispatched as **Tier 3** agents in report-only mode.
```

**Step 3: Update Phase 1b agent dispatch table**

Add a row for discovered plugins:

```markdown
| Discovered `code_review` agents | (from registry) | Checklist from plugin's own description | **Report** → Claude fixes | sonnet | 3 |
```

**Step 4: Commit**

```bash
git add skills/start/references/code-review-pipeline.md
git commit -m "feat: update code review pipeline to dispatch from registry — #207"
```

---

### Task 6: Add Plugins category to settings skill

**Files:**
- Modify: `skills/settings/SKILL.md`

**Quality Constraints:**
- Pattern: Follow existing settings skill category structure (AskUserQuestion format, option descriptions, edit UI flow)
- Design-first: Read the full settings skill before editing to understand insertion points
- Cross-references: Reference `plugin-scanning.md` for rescan process

**Acceptance Criteria:**
- [ ] The settings dashboard (Step 2) includes a `Plugins` category between `Advanced` and `Done`
- [ ] Step 3 category selection includes a "Plugins" option with description "View, rescan, override, or exclude plugins"
- [ ] A new `#### Plugins Category` section exists in Step 4 with 5 options: View registry, Rescan plugins, Override plugin role, Exclude plugin, Reset overrides
- [ ] The "View registry" option reads `plugin_registry` from `.feature-flow.yml` and displays plugins grouped by source
- [ ] The "Rescan plugins" option references `plugin-scanning.md` scanning process
- [ ] The "Override plugin role" option writes to `plugin_overrides` in `.feature-flow.yml`
- [ ] Grep for `"Plugins"` in `skills/settings/SKILL.md` returns at least 3 matches

**Step 1: Read the full settings skill**

Read `skills/settings/SKILL.md` to understand the complete structure and find insertion points for:
- Dashboard display (Step 2)
- Category selection (Step 3)
- Setting selection (Step 4)

**Step 2: Add Plugins row to dashboard**

In the Step 2 dashboard display, add after the Advanced section:

```
  Plugins
  ─────────────────────────────────────────
  Registry            [N plugins: M base, K discovered, or "not scanned"]
  Overrides           [count of overrides, or "none"]
```

**Step 3: Add Plugins option to category selection**

In Step 3, add a new option before "Done":

```
- "Plugins" with description: "View, rescan, override, or exclude plugins"
```

**Step 4: Add Plugins Category section to Step 4**

Create a new `#### Plugins Category` section with:

```markdown
#### Plugins Category

```
AskUserQuestion: "Which Plugins setting?"
Options:
- "View registry" with description: "Show all discovered plugins with roles, stack affinity, and status"
- "Rescan plugins" with description: "Force re-scan of plugin cache and update registry"
- "Override plugin role" with description: "Assign a plugin to specific lifecycle roles"
- "Exclude plugin" with description: "Prevent a plugin from being used"
- "Reset overrides" with description: "Clear all manual plugin overrides"
- "Back" with description: "Return to category selection"
```

##### View Registry

Read `plugin_registry` from `.feature-flow.yml`. Display:

```
Plugin Registry (last scan: [last_scan timestamp]):

  Base (required):
    [status emoji] [plugin-name] — [roles, comma-separated] [stack_affinity]
  Base (recommended):
    [status emoji] [plugin-name] — [roles] [stack_affinity]
  Discovered:
    [confidence emoji] [plugin-name] — [roles] ([confidence]) [stack_affinity]

Status: ✅ = installed, ⚠️ = missing, 🔄 = installed_not_loaded
Confidence: 🔍 = high, ❓ = low
```

If `plugin_registry` is absent: "No plugin registry found. Run 'Rescan plugins' to scan."

##### Rescan Plugins

Execute the scanning process from `references/plugin-scanning.md`:
1. Walk `~/.claude/plugins/cache/`
2. Classify discovered plugins
3. Diff against existing registry
4. Write updated registry to `.feature-flow.yml`
5. Display the updated registry

##### Override Plugin Role

Interactive flow:
1. List all non-base plugins from registry
2. User selects a plugin
3. Present lifecycle roles as multi-select: `AskUserQuestion` with `multiSelect: true`
4. Optionally set stack affinity
5. Write to `plugin_overrides` in `.feature-flow.yml`

##### Exclude Plugin

1. List all plugins from registry
2. User selects a plugin
3. Set `exclude: true` in `plugin_overrides`
4. Confirm: "[plugin-name] excluded. It will not be used in any lifecycle step."

##### Reset Overrides

1. Confirm: "Remove all plugin overrides? Auto-classification will be restored."
2. If confirmed: delete `plugin_overrides` section from `.feature-flow.yml`
```

**Step 5: Update the setting count reference**

Update the skill's description or comments from "9 settings" to "10 settings" (or equivalent) if such a count exists in the file.

**Step 6: Commit**

```bash
git add skills/settings/SKILL.md
git commit -m "feat: add Plugins category to settings skill — #207"
```

---

### Task 7: Update project-context.md for registry loading in Step 0

**Files:**
- Modify: `skills/start/references/project-context.md`

**Quality Constraints:**
- Pattern: Follow existing Step 0 subsection format (description, process steps, YOLO/Express/Interactive behavior blocks)
- Cross-references: Reference `plugin-scanning.md` for full scanning details

**Acceptance Criteria:**
- [ ] A new `## Plugin Registry Loading` section exists after the `## Knowledge Base Pre-Flight` section
- [ ] The section instructs the orchestrator to read `references/plugin-scanning.md` and execute the scanning process
- [ ] YOLO behavior is documented: auto-scan silently, announce results inline
- [ ] Express behavior is documented: same as YOLO
- [ ] Interactive behavior: announce scan results, no prompt needed
- [ ] The section specifies that the registry is built before the Pre-Flight Reviewer Audit
- [ ] Grep for `"Plugin Registry Loading"` in `skills/start/references/project-context.md` returns 1 match

**Step 1: Read the end of project-context.md**

Read `skills/start/references/project-context.md` to find the insertion point after Knowledge Base Pre-Flight.

**Step 2: Add Plugin Registry Loading section**

Insert after the Knowledge Base Pre-Flight section:

```markdown
## Plugin Registry Loading

After the Knowledge Base Pre-Flight step, build the plugin registry by scanning installed plugins.

**Read `references/plugin-scanning.md`** for the full scanning process. Summary:

1. Check for `plugin_registry` in `.feature-flow.yml`. If absent and `~/.claude/plugins/cache/` doesn't exist, bootstrap with base plugins only.
2. Walk `~/.claude/plugins/cache/`, read plugin.json manifests, use content hash fast path to skip unchanged plugins.
3. Classify discovered plugin capabilities via keyword matching into 8 lifecycle roles.
4. Infer stack affinity from description keywords.
5. Diff against persisted registry. Announce additions/removals.
6. Run fallback validation: verify base plugins are loaded in session.
7. Write updated registry to `.feature-flow.yml` under `plugin_registry`.

**YOLO behavior:** Auto-scan silently. Announce: `YOLO: start — Plugin registry → [N] plugins ([M] base, [K] discovered), [J] new, [L] removed`

**Express behavior:** Same as YOLO.

**Interactive behavior:** Announce scan results. No prompt needed — scanning is non-interactive.
```

**Step 3: Commit**

```bash
git add skills/start/references/project-context.md
git commit -m "feat: add plugin registry loading to Step 0 — #207"
```

---
