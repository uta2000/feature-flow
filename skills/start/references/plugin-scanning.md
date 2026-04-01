# Plugin Scanning

**Usage:** Reference this file when scanning for installed plugins, classifying plugin capabilities, and integrating discovered plugins into lifecycle steps. This is the single source of truth for dynamic plugin scanning — see design doc at `docs/plans/2026-04-01-dynamic-plugin-scanning.md` for full context.

---

Plugin scanning runs once at lifecycle start (Step 0 Pre-Flight). Results are persisted in `.feature-flow.yml` under `plugin_registry` and queried by each lifecycle step at execution time.

## First-Run Bootstrap

If `~/.claude/plugins/cache/` does not exist or is empty AND no `plugin_registry` exists in `.feature-flow.yml`, skip the filesystem scan entirely. Initialize the registry with base plugins only (all with `status: missing`). Announce:

> `"First run — no plugin cache found. Base plugins initialized with status: missing. Install plugins and rescan via /settings."`

The lifecycle continues using namespace-prefix fallback validation (see [Fallback Validation](#fallback-validation)) to determine actual availability.

## Scan Fast Path

The registry stores a `content_hashes` map of `plugin_key → SHA-256(plugin.json content)`. Before reading a plugin's component files, compute the hash of its `plugin.json` and compare against the stored hash:

- **Hash matches:** Skip reading agent/skill files — reuse the existing registry entry. Zero component Reads on no-change sessions.
- **Hash differs or absent:** Read component files and re-classify. Update `content_hashes` after re-classification.

This reduces ~60 component Reads to ~15 (one per `plugin.json`) on typical no-change sessions.

## Scanning Process

1. **Walk `~/.claude/plugins/cache/`**: For each `<marketplace>/<plugin-name>/<version>/` directory:
   a. Read `.claude-plugin/plugin.json` — extract `name`, `description`, `keywords`. If `plugin.json` is missing or has no `name` field, use the directory name as a fallback name and log: `"Warning: [dir-name] has missing/empty plugin.json — using directory name."`
   b. Compute SHA-256 hash of `plugin.json` content. If hash matches `content_hashes[<marketplace>/<plugin-name>]`, skip steps c–e (reuse existing registry entry).
   c. Check `plugin.json` for custom component paths (`agents`, `skills`, `hooks` fields — can be string path or array of paths). If a custom path does not exist on disk, log warning and skip that path. Reject paths that traverse outside the plugin directory (no `../` allowed).
   d. If custom paths specified, use those. Otherwise, scan default directories: `agents/`, `skills/`, `hooks/`.
   e. For each agent `.md` file: parse YAML frontmatter for `name` and `description`.
   f. For each skill directory: read `SKILL.md` frontmatter for `name` and `description`.
   g. **Hooks-only plugins:** If a plugin has hooks but no skills or agents, it produces zero classifiable components. Log as: `"[plugin-name] is hooks-only — no classifiable skill/agent components. Skipped."` Hooks-only plugins cannot be assigned lifecycle roles via keyword classification.

2. **Detect feature-flow itself**: Skip scanning feature-flow's own plugin directory. Detection: match `plugin.json` `name` field against `"feature-flow"`. If `CLAUDE_PLUGIN_ROOT` environment variable is available, also skip any directory matching that path.

3. **Diff against persisted registry**: Compare scan results to `plugin_registry` in `.feature-flow.yml`. Use `<marketplace>/<plugin-name>` as registry keys to avoid namespace collisions (two marketplaces publishing the same plugin name get separate entries). Detect additions, removals, and changes. Update `content_hashes` for any plugins whose hash changed.

## Keyword Classification

Classification scans three sources per plugin (in descending weight):
1. `plugin.json` `keywords` array (highest weight — explicit author intent, double weight in scoring)
2. `plugin.json` `description` field
3. Individual agent/skill `description` fields in frontmatter

### Role-Keyword Mapping

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

### Classification Algorithm

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

A single component CAN be assigned multiple roles simultaneously (e.g., "security review" matches both `code_review` via "review" and `security_review` via "security"). All matched roles are stored as separate entries in the plugin's `roles` array. If a plugin has multiple components matching the same role, each component gets its own role entry.

## Stack Affinity Inference

Scan the same three sources (plugin.json keywords, plugin description, component descriptions) for stack keywords. If no stack keywords found, mark as `["*"]` (universal).

### Stack Keyword Table

| Stack Keywords | Maps To |
|---------------|---------|
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

## Base Plugin Registry

These 5 plugins are hardcoded as the base set and are always present in the registry regardless of scan results. Base plugins use their known roles directly — keyword classification is skipped for them. Their `status` field reflects installation state.

| Plugin | Requirement | Known Roles | Stack Affinity |
|--------|------------|-------------|----------------|
| `superpowers` | Required | brainstorming, code_review, worktree_setup, finishing_branch, writing_plans, subagent_development | `*` |
| `context7` | Required | documentation | `*` |
| `pr-review-toolkit` | Recommended | code_review (silent-failure-hunter, code-simplifier, pr-test-analyzer, type-design-analyzer) | `*` (type-design-analyzer: typescript, node-js) |
| `feature-dev` | Recommended | code_review | `*` |
| `backend-api-security` | Recommended | code_review, security_review | node-js, python, go, ruby, java, supabase |

Registry keys use the `<marketplace>/<plugin-name>` format (e.g., `superpowers-marketplace/superpowers`, `claude-plugins-official/backend-api-security`).

## Fallback Validation

After building the registry from the filesystem scan, verify base required plugins are actually loaded in the current Claude session by checking namespace prefixes in the skill list / tool list:

- `superpowers:*` — present in skill list
- `mcp__plugin_context7_context7__*` — present in tools

**Outcomes:**

1. Plugin in registry as `status: installed` BUT not found via namespace-prefix check → update status to `installed_not_loaded` and warn: `"[plugin-name] is installed but not loaded in this session — may require Claude Code restart"`
2. Plugin missing from both filesystem scan AND namespace check → set `status: missing`, apply existing behavior (stop for required, warn for recommended)
3. Plugin found via namespace check → status confirmed as `installed`

## Registry Query

Each lifecycle step queries the registry at execution time using this logic:

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

The scan runs once at Step 0; all subsequent step queries use the in-memory registry (no additional filesystem reads).

## Lifecycle Step Integration

**Code review pipeline:** Discovered plugins with `code_review` role are dispatched as Tier 3 agents (report-only mode). Base plugins retain their existing tier assignments (Tier 1–2). Discovered plugins join Phase 1b of the existing Phase 0–5 pipeline structure.

**Other lifecycle steps:** Steps that currently only use base plugins (brainstorming, documentation lookup, etc.) gain the ability to dispatch additional plugins if discovered ones match the step's role. The step's existing logic runs first; discovered plugins run afterward as supplementary.

## User Overrides

Persisted in `.feature-flow.yml` under `plugin_overrides`. Override precedence (highest to lowest):

1. `plugin_overrides` — explicit user intent
2. Base plugin known roles — for base plugins only
3. Keyword classification — for discovered plugins

```yaml
plugin_overrides:
  my-custom-plugin:
    roles: [code_review, testing]    # Force-assign roles
    stack_affinity: [python]          # Override inferred affinity
  python-linter:
    exclude: true                     # Never use this plugin
```

Users manage overrides via the `/settings` skill → Plugins submenu:

1. **View registry** — Display all plugins with source, roles, stack affinity, and status
2. **Rescan plugins** — Force re-scan of `~/.claude/plugins/cache/`, update registry
3. **Override plugin role** — Select plugin → select role(s) → optional stack affinity → save
4. **Exclude plugin** — Select plugin → set `exclude: true` in overrides
5. **Reset overrides** — Clear all `plugin_overrides` entries

## Error Handling

| Plugin Type | Error Condition | Behavior |
|------------|----------------|----------|
| Base required (superpowers, context7) | Missing | Stop lifecycle — crash with installation message |
| Base recommended (pr-review-toolkit, feature-dev, backend-api-security) | Missing | Warn and continue |
| Discovered | Filesystem scan error (permission denied, corrupted) | Log warning, skip plugin, continue scanning |
| Discovered | Malformed `plugin.json` | Skip plugin, log: `"Warning: [plugin-name] has invalid plugin.json — skipped"` |
| Discovered | Missing frontmatter in agent/skill | Skip that component, continue with other components |
| Any | Registry write failure | Hold registry in session context, announce warning. Re-scan next session. |
| Any | Plugin cache directory missing | See [First-Run Bootstrap](#first-run-bootstrap) |
