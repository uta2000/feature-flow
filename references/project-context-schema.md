# Project Context Schema

Skills read project context from `.feature-flow.yml` in the project root. This file is optional — when absent, `start` auto-detects the platform and stack from project files and creates it. See `auto-discovery.md` for detection rules.

## Schema

```yaml
# .feature-flow.yml
plugin_version: 1.19.2   # Auto-managed: stamped by plugin on SessionStart/start:
platform: web          # web | ios | android | cross-platform
stack:
  - supabase           # Any technology name — matched against references/stacks/
  - next-js
  - vercel
context7:              # Optional: Context7 library IDs for live documentation lookup
  next-js: /vercel/next.js
  supabase:
    - /websites/supabase
    - /supabase/supabase-js
    - /supabase/ssr
  vercel: /vercel/next.js
gotchas:
  - "PostgREST caps all queries at 1000 rows without .range() pagination"
  - "WhoisFreaks bulk endpoint has separate RPM bucket from single-domain"
types_path: src/types/database.types.ts  # Optional: canonical generated types path
default_branch: staging  # Optional: PR target branch (default: detected via cascade)
git_strategy: merge      # Optional: merge (default) | rebase — integration strategy for syncing with base branch
notifications:          # Optional: notification preference written by start skill
  on_stop: bell         # bell | desktop | none
knowledge_base:         # Optional: per-feature context file settings
  max_lines: 150        # Archive oldest decisions when file exceeds this line count
  stale_days: 14        # Archive decisions older than this many days
design_preferences:    # Optional: project-wide design preference answers
  error_handling: result_types       # Captured by brainstorming preamble
  api_style: rest
  state_management: server_state
  testing: unit_integration
  ui_pattern: tailwind
standards:             # Optional: project standards for design cross-checking
  enabled: true        # Enable/disable the cross-check
  files:               # Paths to standards files (relative to project root)
    - docs/architecture.md
    - .claude/conventions.md
yolo:                  # Optional: YOLO mode stopping points
  stop_after:          # Phases where YOLO pauses for review
    - plan             # brainstorming | design | verification | plan
```

## Fields

### `plugin_version`

Auto-managed field that tracks which plugin version last stamped this config file. Used for version drift detection — when the running plugin version differs from the stamped version, an upgrade notice is displayed.

**Auto-stamped:** The SessionStart hook and `start` skill automatically write the current plugin version to this field on every session. This field should not be manually edited.

**Version source:** Extracted from the `CLAUDE_PLUGIN_ROOT` environment variable's last path segment (e.g., `/path/to/cache/feature-flow/1.19.2` → `1.19.2`).

**Drift detection:** When the stamped version differs from the running version, the plugin classifies drift by semver component:
- **Major drift** (e.g., 1.x → 2.x): Breaking changes likely — review CHANGELOG carefully
- **Minor drift** (e.g., 1.19.x → 1.20.x): New features available — review CHANGELOG for additions
- **Patch drift** (e.g., 1.19.1 → 1.19.2): Bug fixes — informational only

**Committed to git:** Yes — this enables team-wide drift detection. When one team member updates the plugin and stamps a new version, other team members see the drift notice on their next session.

**Format:** Semver string.

```yaml
plugin_version: 1.19.2
```

**When absent:** First-time upgrade path. No notice is shown; the field is stamped on the next SessionStart or `start:` invocation.

### `platform`

Determines lifecycle adjustments and which steps are required vs optional.

| Value | Effect |
|-------|--------|
| `web` | Standard lifecycle. Feature flags recommended. Simple rollback. |
| `ios` | Adds beta testing, App Store review steps. Feature flags required. API versioning required. |
| `android` | Adds beta testing, Play Store review steps. Feature flags required. API versioning required. |
| `cross-platform` | Combines iOS + Android requirements. Device matrix testing across both platforms. |

See `references/platforms/mobile.md` and `references/platforms/web.md` for full details.

### `stack`

List of technologies used in the project. Each entry is matched against `references/stacks/{name}.md` for stack-specific verification checks.

If no matching reference file exists, the skill should:
1. Read the project's `CLAUDE.md` and `package.json` for tech-specific context
2. Use `WebSearch` to research known gotchas for the declared technology
3. Note to the user that no pre-built checklist exists and findings are best-effort

Common stack values with pre-built reference files:
- `supabase` — PostgREST limits, RLS, migration safety, Edge Functions
- `next-js` — App Router, server/client boundaries, environment variables
- `react-native` — Native bridges, platform-specific code, Hermes engine
- `vercel` — Serverless limits, Edge constraints, cold starts

### `context7`

Optional mapping of stack entries to [Context7](https://context7.com/) library IDs. When present, skills query Context7 for up-to-date documentation and code examples before designing or implementing features.

**Auto-populated:** During auto-detection (Step 0 of `start`), known stack entries are mapped to their Context7 library IDs using the table in `auto-discovery.md`. The user is shown the mappings and can adjust.

**Manual additions:** Users can add Context7 library IDs for technologies not covered by auto-detection. Use `mcp__plugin_context7_context7__resolve-library-id` to find the correct ID.

**Format:** Each key is a stack name. Values can be a single library ID (string) or a list of library IDs (for stacks that span multiple Context7 libraries):

```yaml
context7:
  next-js: /vercel/next.js              # Single library
  supabase:                              # Multiple libraries
    - /websites/supabase
    - /supabase/supabase-js
    - /supabase/ssr
```

**Requires:** The Context7 MCP plugin must be installed (`context7@claude-plugins-official`). If Context7 is not available, skills skip documentation lookups and proceed normally.

**How skills use this:**
- `start` queries relevant libraries during the documentation lookup step
- `design-verification` checks that the design follows current patterns from official docs
- `design-document` can reference current API patterns during design authoring

### `gotchas`

Free-text list of project-specific pitfalls learned from past bugs. These are injected into every design verification as mandatory checks.

**How gotchas grow (automatic):**
1. `design-verification` finds a FAIL or WARNING that represents a reusable pitfall → offers to add it
2. `spike` discovers a DENIED assumption that future features would likely hit → offers to add it
3. The user approves → gotcha is appended to `.feature-flow.yml`
4. Every future design verification automatically checks for it

**How gotchas grow (manual):**
1. A bug is discovered in production (e.g., PostgREST 1000-row truncation)
2. The root cause is manually added to `gotchas` in `.feature-flow.yml`
3. Same result — every future verification checks for it

**Writing effective gotchas:**
- Be specific: "PostgREST caps queries at 1000 rows" not "watch out for query limits"
- Include the fix pattern: "...without .range() pagination"
- State the consequence: "causes silent data truncation with 200 OK"

### `tool_selector`

Optional configuration for the Tool Selector — the Step 0 pre-flight check that reviews available MCP tools and recommends (or auto-launches) the Get Shit Done (GSD) toolset before a lifecycle run.

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

### `types_path`

Optional path to the canonical generated types file (e.g., `src/types/database.types.ts`). Used by the Stop hook quality gate to check type freshness and detect duplicate type files in edge function directories.

**When needed:** Only when the heuristic glob fails to find the generated types file. The quality gate checks common locations automatically: `src/types/`, `types/`, `lib/types/`, `lib/`, `app/types/`, `src/lib/`. If the file is in a non-standard location, set `types_path` explicitly.

**Format:** Single file path relative to project root.

```yaml
types_path: src/types/database.types.ts
```

### `default_branch`

Optional PR target branch. When set, overrides the automatic detection cascade used by `start` and `finishing-a-development-branch` to determine where PRs should target.

**Detection cascade (when `default_branch` is absent):**
1. `git config --get init.defaultBranch` (if set and branch exists locally or on remote)
2. Check for common integration branches (local first, then remote):
   a. `develop`: `git rev-parse --verify develop 2>/dev/null || git rev-parse --verify origin/develop 2>/dev/null`
   b. `staging`: `git rev-parse --verify staging 2>/dev/null || git rev-parse --verify origin/staging 2>/dev/null`
   `develop` is checked before `staging` (Git Flow convention). If both exist, `develop` wins — set `default_branch` to override.
3. Fall back to `main` (or `master` if `main` doesn't exist)

**Format:** Single branch name string.

```yaml
default_branch: staging
```

**When needed:** Only when the automatic detection cascade doesn't select the correct branch. Most projects using `main` as their PR target don't need this field.

### `git_strategy`

Optional integration strategy for the "Sync with Base Branch" lifecycle step. Controls whether `git merge` or `git rebase` is used to integrate base branch changes before PR creation.

| Value | Behavior |
|-------|----------|
| `merge` (default) | `git merge origin/<base-branch> --no-edit` — single conflict resolution pass regardless of commit count |
| `rebase` | `git rebase origin/<base-branch>` — replays each commit individually (linear history, but N commits = up to N conflict rounds) |

**When to use `rebase`:** Only when the project enforces linear history and does not use squash-merge for PRs. Most projects should use the default `merge`.

**Format:** Single string value.

```yaml
git_strategy: merge  # merge (default) | rebase
```

**When absent:** Defaults to `merge`. The field is never auto-written; add it manually only if you need `rebase`.

### `ci_timeout_seconds`

Optional maximum seconds to wait for CI checks to complete after PR creation before continuing the lifecycle. Used by the "Wait for CI and address reviews" inline step.

**Default:** 900 (15 minutes). The safety valve prevents infinite polling if a check is stuck or requires manual approval.

**Format:** Integer.

```yaml
ci_timeout_seconds: 900  # default: 900 (15 minutes)
```

**When absent:** Defaults to 900 seconds. The field is never auto-written; add it manually only if you need a different timeout.

### `notifications`

Optional notification preference for the `start:` lifecycle. When set, `start` skips the notification prompt on subsequent invocations and applies the saved preference directly.

**Sub-fields:**

| Field | Values | Description |
|-------|--------|-------------|
| `on_stop` | `bell \| desktop \| none` | Notification type fired when Claude Code stops and waits for input |

**When set:** After the user answers the Notification Preference prompt in Step 0 of `start:`. Also set when the user confirms a non-`none` preference (bell or desktop) so the Stop hook is already configured in `~/.claude/settings.json`.

**When absent:** `start` presents the Notification Preference prompt during Step 0 pre-flight (on macOS only). If the user selects `none`, the field IS written as `on_stop: none` — so future sessions know the user was already asked and explicitly chose no notifications. Absent means the user has not yet been prompted. If the user selects `bell` or `desktop`, the field is written to avoid re-prompting.

**Format:** Nested mapping.

```yaml
notifications:
  on_stop: bell    # terminal bell (osascript -e 'beep 2')
  # on_stop: desktop  # banner + Glass sound
  # on_stop: none     # user explicitly declined; absent = not yet prompted
```

**macOS-only:** The notification commands use `osascript`. On non-macOS systems, `start` skips the prompt and does not write this field.

### `knowledge_base`

Optional settings for the per-feature `FEATURE_CONTEXT.md` knowledge base. When absent, defaults are used silently.

**Sub-fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `max_lines` | integer | 150 | Archive oldest decisions when `FEATURE_CONTEXT.md` exceeds this line count |
| `stale_days` | integer | 14 | Archive decisions older than this many days |

**Format:**

```yaml
knowledge_base:
  max_lines: 150   # reduce for tighter context budgets
  stale_days: 14   # increase for long-running branches
```

**When needed:** Only when the defaults don't fit your workflow. Most projects can omit this section.

**When absent:** `start` uses default values silently — 150 lines max, 14 days stale threshold. No prompt is shown. The field is never auto-written; it is only used when manually added.

### `design_preferences`

Optional project-wide design preference answers, captured by the brainstorming preamble for Feature and Major Feature scopes. When present, preferences are silently loaded at the start of each brainstorming session and injected as context for feature-specific design questions.

**Sub-fields:**

| Field | Values | Description |
|-------|--------|-------------|
| `error_handling` | `result_types \| exceptions \| error_objects \| mixed \| <free-text>` | Error handling pattern used by the project |
| `api_style` | `rest \| graphql \| server_actions \| rpc \| trpc \| <free-text>` | API style for new endpoints |
| `state_management` | `local \| global_store \| server_state \| url_state \| context_hooks \| <free-text>` | Client-side state management approach |
| `testing` | `unit \| unit_integration \| unit_integration_e2e \| match_existing \| <free-text>` | Test coverage level |
| `ui_pattern` | `component_library \| tailwind \| css_modules \| styled_components \| match_existing \| <free-text>` | UI styling/component approach |

**Rules:**
- Free-text values (when user selects "Other (describe)"): stored as-is; treated as advisory in design-verification — no compliance check runs on free-text values
- Stack-filtered questions (e.g., Q5 skipped for backend-only stacks): key omitted entirely; missing keys skipped in verification
- No `enabled` flag — presence of key = active; absence = brainstorming preamble fires on next Feature/Major Feature run
- If user declines all 5 questions: no `design_preferences` key written → preamble fires again on next eligible run

**Format:**

```yaml
design_preferences:
  error_handling: result_types
  api_style: rest
  state_management: server_state
  testing: unit_integration
  ui_pattern: tailwind
```

**When absent:** The brainstorming preamble fires on the next Feature or Major Feature lifecycle run, capturing preferences interactively (or inferring via codebase scan in YOLO/Express mode). Quick fix and Small enhancement scopes never trigger the preamble.

### `yolo`

Optional configuration for YOLO mode stopping points. When YOLO mode runs the full lifecycle automatically, `stop_after` defines phase boundaries where YOLO pauses and waits for user review before continuing.

**Sub-fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `stop_after` | list of strings | `[]` (empty) | Phases after which YOLO pauses for user review. Valid values: `brainstorming`, `design`, `verification`, `plan`. |

**Valid `stop_after` values:**

| Value | Pauses after… |
|-------|---------------|
| `brainstorming` | Brainstorming phase — review design decisions before design doc |
| `design` | Design document phase — review the design before verification |
| `verification` | Design verification phase — review blockers/warnings before planning |
| `plan` | Planning phase — review the task breakdown before implementation |
| `implementation` | Before implementation starts — last chance to review before subagents code |
| `pr` | Before PR creation — review the final diff before it goes public |

**Format:**

```yaml
yolo:
  stop_after:
    - design          # pause after design doc for review
    - plan            # pause after planning before implementation
    - pr              # pause before PR creation
```

**When absent:** YOLO runs all phases end-to-end without stopping. Equivalent to an empty `stop_after` list.

**When `stop_after` is an empty list:** Same as absent — YOLO runs all phases without stopping.

**Invalid values:** Unrecognized phase names in `stop_after` are silently ignored. Only the 6 valid values listed above trigger checkpoints.

**Checkpoint behavior:** At each listed stopping point, the `start` skill orchestrator pauses and presents the phase output via `AskUserQuestion` with two options: "Continue YOLO" (resume unattended execution) or "Switch to Interactive" (disable YOLO for remaining phases).

### `standards`

Optional configuration for the Standards Cross-Check step in the `design-document` skill. When present, `design-document` reads the listed files and verifies the design spec against them before suggesting next steps.

**Sub-fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` (when key present) | Whether the cross-check runs. Set to `false` to disable without removing the `files` list. |
| `files` | list of strings | _(absent = auto-discovery)_ | Paths to standards files, relative to the project root. |

**Format:**

```yaml
standards:
  enabled: true
  files:
    - docs/architecture.md
    - .claude/conventions.md
```

**When absent:** On the next `design-document` run, first-run auto-discovery triggers: the skill scans `.claude/`, `docs/`, and the project root for files named `architecture.md`, `conventions.md`, `standards.md`, `coding-standards.md`, or `style-guide.md` (case-insensitive). In Interactive mode the user selects which to register; in YOLO/Express mode all discovered files are auto-selected. The field is then written to `.feature-flow.yml`. If no files are discovered, `standards.enabled: false` is written and the cross-check is skipped silently on all subsequent runs.

**When `enabled: false`:** The cross-check is skipped silently. Auto-discovery does not trigger. Existing `files` list is preserved so re-enabling is a one-line change.

**When `files` is absent or empty and `enabled` is not `false`:** Auto-discovery triggers (same as when the entire key is absent).

## How Skills Use This File

### start (reads + writes)
- **Reads** context at lifecycle start. Adjusts step list based on platform and stack.
- **Reads** `plugin_version` field to detect version drift and display upgrade notices.
- **Creates** `.feature-flow.yml` via auto-detection if it doesn't exist (includes `plugin_version`).
- **Updates** stack list if new dependencies are detected that aren't declared.
- **Writes** `plugin_version` to current running version on every lifecycle start.
- **Reads** `context7` field to query relevant documentation before the design phase.
- **Reads** `default_branch` field to determine the PR target branch. If absent, runs the detection cascade.
- **Reads** `notifications.on_stop` field to skip the notification preference prompt when a saved preference exists (on macOS only).
- **Writes** `notifications.on_stop` after the user answers the preference prompt (`bell`, `desktop`, or `none`). Does not write in YOLO/Express mode if no saved preference exists.
- **Reads** `knowledge_base.max_lines` and `knowledge_base.stale_days` to configure FEATURE_CONTEXT.md archival thresholds (defaults: 150 lines, 14 days).
- **Loads** `FEATURE_CONTEXT.md` from the worktree root on pre-flight: archives stale decisions, injects remaining content into the lifecycle context, and prints a resume notice.
- **Writes** `design_preferences` after the brainstorming preamble captures user answers (or YOLO/Express codebase inference). Writes only for Feature and Major Feature scopes. Does not write if user declines all questions.
- **Reads** `design_preferences` at the start of brainstorming: if present, loads silently and injects as context; if absent, fires the preferences preamble.

### design-verification (reads + writes)
- **Reads** base checklist (14 categories, plus Category 24 if design_preferences is present), stack-specific checks, platform-specific checks, and project gotchas.
- **Reads** `design_preferences` to run Category 24 (Design Preferences Compliance) — verifying the design document uses declared patterns. Skips this category if `design_preferences` is absent.
- **Reads** `context7` field to verify design uses current patterns from official docs.
- **Writes** new gotchas discovered during verification (FAIL/WARNING findings that represent reusable pitfalls).

### spike (reads + writes)
- **Reads** stack-specific assumption patterns when evaluating risky unknowns.
- **Writes** new gotchas from DENIED assumptions that future features would likely hit.

### design-document (reads + writes)
Adds platform-aware sections:
- Mobile → Feature Flag Strategy, Rollback Plan, API Versioning sections
- Web → standard sections
- **Reads** `standards.enabled` and `standards.files` to perform the Standards Cross-Check (Step 6). Triggers auto-discovery when the key is absent.
- **Writes** `standards.enabled` and `standards.files` after first-run auto-discovery selects files (or writes `standards.enabled: false` when no files are found).

### create-issue (reads)
Includes platform-relevant sections in the issue template.

### quality-gate hook (reads)
- **Reads** `stack` field to determine which type generators to check (supabase, prisma)
- **Reads** `types_path` field to find the canonical generated types file

### SessionStart hook (reads + writes)
- **Reads** `plugin_version` to detect drift against the running plugin version.
- **Writes** `plugin_version` to current running version on every session start.

### settings (reads + writes)
- **Reads** any field in `.feature-flow.yml` to display the current configuration to the user.
- **Writes** updated field values to `.feature-flow.yml` when the user changes a setting (e.g., `tool_selector`, `notifications`, `knowledge_base`, `design_preferences`).
