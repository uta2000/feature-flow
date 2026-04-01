# Dynamic Plugin Scanning — Design Document

**Date:** 2026-04-01
**Status:** Design Complete

## Overview

Replace feature-flow's hardcoded plugin checks (superpowers, context7, pr-review-toolkit, feature-dev, backend-api-security) with a dynamic plugin scanning system that discovers all installed Claude Code plugins, classifies their capabilities via keyword matching, and integrates them into any lifecycle step — not just code review. The system persists a plugin registry in `.feature-flow.yml` and provides a `/settings` UI for manual overrides.

## User Flow

### Step 1 — Lifecycle Starts (Step 0 Pre-Flight)

Feature-flow scans `~/.claude/plugins/cache/` to discover all installed plugins. It reads each plugin's `plugin.json` manifest and component metadata (agent frontmatter, skill descriptions). Results are compared against the persisted `plugin_registry` in `.feature-flow.yml`:

- **New plugin found:** Classified via keyword matching, added to registry, announced: `"New plugin discovered: [name] → [roles]"`
- **Plugin removed:** Marked unavailable, announced: `"Plugin removed: [name]"`
- **No changes:** Silent fast path

### Step 2 — Pre-Flight Audit

The audit reports all plugins grouped by source:

```
Plugin Registry (N plugins discovered):
  Base (required):
    ✅ superpowers — brainstorming, code_review, worktree_setup, ...
    ✅ context7 — documentation
  Base (recommended):
    ✅ pr-review-toolkit — code_review
    ✅ feature-dev — code_review
    ⚠️ backend-api-security — not installed
  Discovered:
    🔍 testing-toolkit — testing (high confidence)
    🔍 python-linter — formatting, code_review [python] (high confidence)
    ❓ my-custom-plugin — unmatched (skipped)
```

### Step 3 — Lifecycle Step Execution

Each lifecycle step queries the registry for plugins with matching roles. Example: the code review pipeline queries for `code_review` and `security_review` roles, dispatching all matching plugins at their appropriate tier.

### Step 4 — Manual Override via /settings

Users can manage the registry through the existing `/settings` skill:

```
Plugin Management:
  1. View registry
  2. Rescan plugins
  3. Override plugin role
  4. Exclude plugin
  5. Reset overrides
```

## Architecture

### Plugin Registry Data Model

Persisted in `.feature-flow.yml` under `plugin_registry`:

```yaml
plugin_registry:
  last_scan: "2026-04-01T12:00:00Z"
  content_hashes: {}          # plugin_key → SHA-256 of plugin.json (for scan fast path)
  plugins:
    superpowers-marketplace/superpowers:       # key = <marketplace>/<plugin-name>
      source: base             # base | discovered
      status: installed        # installed | missing
      roles:
        - step: brainstorming  # LifecycleRole enum value
          component: superpowers:brainstorming
          type: skill           # skill | agent
        - step: code_review
          component: superpowers:code-reviewer
          type: agent
        - step: worktree_setup
          component: superpowers:using-git-worktrees
          type: skill
      stack_affinity: ["*"]    # ["*"] = universal, or list of StackIdentifier values
    claude-plugins-official/backend-api-security:
      source: base
      status: installed
      roles:
        - step: code_review
          component: backend-api-security:backend-security-coder
          type: agent
      stack_affinity: [node-js, python, go, ruby, java, supabase]
    some-marketplace/testing-toolkit:
      source: discovered
      status: installed
      roles:
        - step: testing
          component: testing-toolkit:test-generator
          type: agent
          confidence: high     # high | low (discovered plugins only)
      stack_affinity: ["*"]
```

### Plugin Scanning Process

**First-run bootstrap:** If `~/.claude/plugins/cache/` does not exist or is empty, AND no `plugin_registry` exists in `.feature-flow.yml`, skip the filesystem scan entirely. Initialize the registry with base plugins only (all with `status: missing`). Announce: `"First run — no plugin cache found. Base plugins initialized with status: missing. Install plugins and rescan via /settings."` The lifecycle continues using namespace-prefix fallback validation (see "Replaces Pre-Flight Checks" below) to determine actual availability.

**Scan fast path (content hash):** The registry stores a `content_hashes` map of `plugin_key → SHA-256(plugin.json content)`. Before reading a plugin's component files, compute the hash of its `plugin.json` and compare against the stored hash. If identical, skip reading agent/skill files and reuse the existing registry entry. This reduces ~60 component Reads to 0 on no-change sessions. Only when the hash differs (or is absent) does the scanner read component files and re-classify.

1. **Walk `~/.claude/plugins/cache/`**: For each `<marketplace>/<plugin-name>/<version>/` directory:
   a. Read `.claude-plugin/plugin.json` — extract `name`, `description`, `keywords`. If `plugin.json` is missing or empty (no `name` field), use the directory name as a fallback name and log: `"Warning: [dir-name] has missing/empty plugin.json — using directory name."`
   b. Compute SHA-256 hash of `plugin.json` content. If hash matches `content_hashes[<marketplace>/<plugin-name>]`, skip steps c-e (reuse existing registry entry)
   c. Check `plugin.json` for custom component paths (`agents`, `skills`, `hooks` fields — can be string path or array of paths). If a custom path does not exist on disk, log warning and skip that path. Reject paths that traverse outside the plugin directory (no `../` allowed)
   d. If custom paths specified, use those. Otherwise, scan default directories: `agents/`, `skills/`, `hooks/`
   e. For each agent `.md` file: parse YAML frontmatter for `name` and `description`
   f. For each skill directory: read `SKILL.md` frontmatter for `name` and `description`
   g. **Hooks-only plugins:** If a plugin has hooks but no skills or agents, it produces zero classifiable components. Log as: `"[plugin-name] is hooks-only — no classifiable skill/agent components. Skipped."` Hooks-only plugins cannot be assigned lifecycle roles via keyword classification.

2. **Detect feature-flow itself**: Skip scanning feature-flow's own plugin directory. Detection: match `plugin.json` `name` field against `"feature-flow"`. If `CLAUDE_PLUGIN_ROOT` environment variable is available, also skip any directory matching that path.

3. **Diff against persisted registry**: Compare scan results to `plugin_registry` in `.feature-flow.yml`. Use `<marketplace>/<plugin-name>` as registry keys to avoid namespace collisions (two marketplaces publishing the same plugin name get separate entries). Detect additions, removals, and changes. Update `content_hashes` for any plugins whose hash changed.

### Replaces Pre-Flight Checks

This registry **replaces** the existing hardcoded pre-flight base-plugin checks in `skills/start/SKILL.md` (lines 81-160). The existing namespace-prefix detection (`superpowers:*` in skill list, `mcp__plugin_context7_context7__*` in tools) becomes a **fallback validation** step:

1. After building the registry from the filesystem scan, verify that base required plugins (`superpowers`, `context7`) are actually loaded in the current Claude session by checking namespace prefixes in the skill list / tool list
2. If a base plugin is in the registry as `status: installed` but NOT found via namespace-prefix check, update status to `installed_not_loaded` and warn: `"[plugin-name] is installed but not loaded in this session — may require Claude Code restart"`
3. If a base plugin is missing from both the filesystem scan AND the namespace check, set `status: missing` and apply the existing behavior (stop for required, warn for recommended)

### Keyword Classification System

Each lifecycle role has a set of trigger keywords. Classification scans three sources per plugin:
1. `plugin.json` `keywords` array (highest weight — explicit author intent)
2. `plugin.json` `description` field
3. Individual agent/skill `description` fields in frontmatter

**Role-Keyword Mapping:**

| Lifecycle Role | Trigger Keywords |
|---------------|-----------------|
| `code_review` | review, lint, quality, code-review, analyze, audit |
| `security_review` | security, vulnerability, auth, injection, OWASP, CVE |
| `testing` | test, coverage, spec, assertion, TDD, unit-test |
| `design` | design, architecture, schema, data-model, brainstorm |
| `documentation` | docs, documentation, API-docs, readme, jsdoc |
| `deployment` | deploy, CI/CD, pipeline, release, publish |
| `formatting` | format, prettier, style, beautify, lint-fix |
| `type_checking` | type, typescript, type-safe, schema-validation, type-check |

**Classification Algorithm:**

```
for each plugin component (skill/agent):
    # Tokenize: split on whitespace AND hyphens to handle compound keywords
    # "code-review tool" → ["code", "review", "tool"]
    tokens = lowercase(description).split(/[\s\-]+/)
    also_check = plugin.keywords (if present)
    
    for each lifecycle_role:
        keyword_matches = count(tokens ∩ role.keywords)
        keyword_bonus = count(plugin.keywords ∩ role.keywords) * 2  # double weight
        total_score = keyword_matches + keyword_bonus
        
        if total_score >= 2: assign role with confidence "high"
        elif total_score == 1: assign role with confidence "low"
        else: no match
    
    if no roles matched: log as "unmatched", skip
```

A single component CAN be assigned multiple roles simultaneously (e.g., a plugin with "security review" in its description matches both `code_review` via "review" and `security_review` via "security"). All matched roles are stored as separate entries in the plugin's `roles` array. If a plugin has multiple components matching the same role, each component gets its own role entry.

### Stack Affinity Inference

Scan the same three sources (plugin.json keywords, plugin description, component descriptions) for stack keywords:

| Stack Keyword | Maps To |
|--------------|---------|
| typescript, ts | typescript |
| python, py, django, flask, fastapi | python |
| react, next, nextjs | react, next-js |
| node, express, fastify | node-js |
| go, golang | go |
| java, spring, kotlin | java |
| ruby, rails | ruby |
| supabase | supabase |
| vue, nuxt | vue |
| angular | angular |

If no stack keywords found → mark as `["*"]` (universal).

### Base Plugin Registry

The following plugins are hardcoded as the base set with their known roles. These are always present in the registry regardless of scan results:

| Plugin | Requirement | Known Roles | Stack Affinity |
|--------|------------|-------------|----------------|
| `superpowers` | Required | brainstorming, code_review, worktree_setup, finishing_branch, writing_plans, subagent_development | `*` |
| `context7` | Required | documentation | `*` |
| `pr-review-toolkit` | Recommended | code_review (internal: silent-failure-hunter, code-simplifier, pr-test-analyzer, type-design-analyzer) | `*` (type-design-analyzer: typescript, node-js) |
| `feature-dev` | Recommended | code_review | `*` |
| `backend-api-security` | Recommended | code_review, security_review | node-js, python, go, ruby, java, supabase |

Base plugins use their known roles directly — keyword classification is skipped for them. Their `status` field reflects installation state (installed/missing).

### Lifecycle Step Integration

Each lifecycle step that can use external plugins queries the registry at execution time:

```
function get_plugins_for_step(step_name, project_stack):
    results = []
    for plugin in registry.plugins:
        if plugin.status != "installed": continue
        if plugin is excluded via plugin_overrides: continue
        for role in plugin.roles:
            if role.step == step_name:
                if plugin.stack_affinity includes "*" or intersects(project_stack):
                    results.append(plugin)
    return results
```

**Code review pipeline integration:** Discovered plugins with `code_review` role are dispatched as **Tier 3** agents (report-only mode). Base plugins retain their existing tier assignments (Tier 1-2). The existing Phase 0-5 pipeline structure is unchanged — discovered plugins join Phase 1b.

**Other lifecycle steps:** Steps that currently only use base plugins (brainstorming, documentation lookup, etc.) gain the ability to dispatch additional plugins if discovered ones match the step's role. The step's existing logic runs first; discovered plugins run afterward as supplementary.

### User Overrides

Persisted in `.feature-flow.yml` under `plugin_overrides`:

```yaml
plugin_overrides:
  my-custom-plugin:
    roles: [code_review, testing]    # Force-assign roles
    stack_affinity: [python]          # Override inferred affinity
  python-linter:
    exclude: true                     # Never use this plugin
```

Override precedence:
1. `plugin_overrides` (highest — user explicit intent)
2. Base plugin known roles (for base plugins only)
3. Keyword classification (for discovered plugins)

### /settings Plugin Management

New "Plugins" category added to the existing settings skill with 5 options:

1. **View registry** — Display all plugins with source, roles, stack affinity, and status
2. **Rescan plugins** — Force re-scan of `~/.claude/plugins/cache/`, update registry
3. **Override plugin role** — Interactive flow: select plugin → select role(s) → optional stack affinity → save to `plugin_overrides`
4. **Exclude plugin** — Select plugin → set `exclude: true` in overrides
5. **Reset overrides** — Clear all `plugin_overrides` entries

## Patterns & Constraints

### Error Handling

**Base required plugins (superpowers, context7):** If missing, throw and stop the lifecycle — crash with a clear installation message. This matches the `exceptions` design preference and the existing behavior.

**Base recommended plugins (pr-review-toolkit, feature-dev, backend-api-security):** If missing, warn but continue. These are optional and their absence degrades code review coverage but doesn't block the lifecycle.

**Discovered plugins (all error cases):**
- **Filesystem scan errors** (permission denied, corrupted plugin): Log warning with plugin name, skip that plugin, continue scanning. Discovered plugins are optional — a single failure should never block the lifecycle.
- **Malformed plugin.json**: Skip plugin, log: `"Warning: [plugin-name] has invalid plugin.json — skipped"`
- **Missing frontmatter in agent/skill**: Skip that component, continue with other components in the same plugin.
- **Registry write failure**: Hold registry in session context, announce warning. Registry will be re-scanned next session.
- **Plugin cache directory missing**: See "First-run bootstrap" in Plugin Scanning Process.

### Types

**Enums:**

```
LifecycleRole = "code_review" | "security_review" | "testing" | "design"
             | "documentation" | "deployment" | "formatting" | "type_checking"

StackIdentifier = "typescript" | "python" | "react" | "next-js" | "node-js"
               | "go" | "java" | "ruby" | "supabase" | "vue" | "angular"

PluginSource = "base" | "discovered"
PluginStatus = "installed" | "missing" | "installed_not_loaded"
ComponentType = "skill" | "agent"
Confidence = "high" | "low"
```

- Registry data model fields use these literal string unions consistently
- The `step` field in role entries must be a `LifecycleRole` value
- The `stack_affinity` field must be `["*"]` or a list of `StackIdentifier` values
- The `plugin_overrides.roles` field must be a list of `LifecycleRole` values

### Performance

- Filesystem scan runs once per session at Step 0. Subsequent steps query the in-memory registry.
- **Content hash fast path:** On no-change sessions, the scanner compares `plugin.json` SHA-256 hashes against stored values. Only changed plugins trigger component file reads. This reduces ~60 Read calls to ~15 (one per plugin.json) on typical no-change sessions.
- Keyword matching is O(plugins × components × roles) — with typical installs (<20 plugins, <100 components, 8 roles), this completes in milliseconds.
- The `plugin_registry` block in `.feature-flow.yml` is auto-generated. Consider adding a `# auto-generated by feature-flow — do not edit manually` comment header to the block.

### Stack-Specific

- This feature modifies Markdown skill files and YAML config — no TypeScript/Python runtime code. All "logic" is expressed as prompt instructions that Claude follows at runtime.
- The scanning process uses `Bash` tool calls to walk the filesystem, and `Read` tool calls to parse plugin.json and frontmatter.

## Scope

### Included

- Dynamic scanning of `~/.claude/plugins/cache/` at lifecycle start
- Keyword classification of plugin capabilities into 8 lifecycle roles
- Stack affinity inference from descriptions
- Persisted plugin registry in `.feature-flow.yml`
- Diff-based change detection between sessions
- Base plugin set (5 plugins) with hardcoded known roles
- User overrides (`plugin_overrides`) in `.feature-flow.yml`
- `/settings` Plugins submenu (view, rescan, override, exclude, reset)
- Code review pipeline integration (discovered plugins as Tier 3)
- Other lifecycle step integration (supplementary dispatch)

### Excluded

- LLM-based classification (tokens, hallucination risk — keyword matching is sufficient for v1)
- Explicit capability metadata field in plugin.json (requires adoption by third-party authors)
- Auto-installation of suggested plugins (existing marketplace discovery handles this)
- Plugin version tracking or compatibility checking (out of scope — Claude Code handles this)
- Custom lifecycle step definitions by plugins (plugins slot into existing steps, not define new ones)
