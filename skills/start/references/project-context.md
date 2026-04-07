# Step 0: Load or Create Project Context

**Usage:** Read this file when executing Step 0 of the lifecycle. Contains YOLO trigger detection, project context loading, base branch detection, session model recommendation, notification preference, and knowledge base pre-flight.

---

## YOLO Trigger Phrase Detection

Before any other processing, check if the user requested YOLO mode via a trigger phrase. Parse the `ARGUMENTS` string for trigger phrases using **word-boundary matching** (not substring matching, to avoid false positives like "build a yolo-themed game"):

1. Check for trigger phrases:
   - `--yolo` (flag style — match as a standalone token)
   - `yolo mode` (natural language phrase)
   - `run unattended` (natural language phrase)
   - `--express` (flag style — match as a standalone token)
   - `express mode` (natural language phrase)
2. If a trigger is found:
   - If the trigger is `--express` or `express mode`:
     - Set Express mode active for the remainder of the lifecycle
     - Announce: "Express mode active. Auto-selecting decisions but pausing for design approval. Decision log will be printed at completion."
     - Strip the trigger phrase from the arguments before further processing
   - Otherwise (standard YOLO triggers):
     - Set YOLO mode active for the remainder of the lifecycle
     - Announce: "YOLO mode active. Auto-selecting all decisions, no pauses. Decision log will be printed at completion."
     - Strip the trigger phrase from the arguments before further processing (so `start: add CSV export --yolo` becomes `start: add CSV export` for scope classification)
3. If no trigger is found:
   - Do nothing here — the YOLO/Interactive mode prompt is presented in Step 1 after scope classification, where the system can make a smart recommendation based on scope and issue context.

## Load or Create `.feature-flow.yml`

Check for a `.feature-flow.yml` file in the project root.

**If found:**
1. Read it and extract `platform`, `stack`, `context7`, `gotchas`, and `plugin_version`

**Version drift check:**

After reading `.feature-flow.yml`, check for version drift:
1. Extract `plugin_version` from the loaded YAML
2. Determine the running plugin version from the `CLAUDE_PLUGIN_ROOT` environment variable (last path segment, e.g., `/path/to/1.19.2` → `1.19.2`)
3. If `plugin_version` is present and differs from the running version:
   - Compare semver components (major.minor.patch)
   - Classify drift as major, minor, or patch
   - Announce: `"UPGRADE NOTICE: [Drift level] version drift detected — config was stamped by v[stored], now running v[running]. Review CHANGELOG.md for what changed."`
4. If `plugin_version` is absent: no notice (first-time upgrade path — the SessionStart hook will stamp it)

**YOLO behavior:** No prompt — always auto-detected. Announce: `YOLO: start — Version drift check → [no drift | drift level from vX.Y.Z to vA.B.C]`

2. Cross-check against auto-detected stack (see `../../references/auto-discovery.md`). If new dependencies are detected that aren't declared, suggest additions:
   ```
   Your .feature-flow.yml declares: [supabase, next-js]
   I also detected: [stripe] (from package.json)
   Want me to add stripe to your stack list?
   ```
3. If user approves additions, update the file with `Edit`
4. Ensure `plugin_version` is current — if it differs from the running version (or is absent), update it in `.feature-flow.yml` using `Edit`

**YOLO behavior:** If YOLO mode is active, skip this question. Auto-accept all detected dependency additions and announce: `YOLO: start — Stack cross-check → Auto-added: [list of new dependencies]`

**If not found — auto-detect and create:**
1. Detect platform from project structure (ios/, android/, Podfile, build.gradle, etc.)
2. Detect stack from dependency files (package.json, requirements.txt, Gemfile, go.mod, Cargo.toml, pubspec.yaml, composer.json, pom.xml, build.gradle, *.csproj, mix.exs) and config files (vercel.json, supabase/, firebase.json, etc.)
3. Present detected context to user for confirmation:
   ```
   I detected the following project context:

   Platform: [detected]
   Stack:
     - [stack-1] (from [source])
     - [stack-2] (from [source])

   Does this look right? I'll save this to `.feature-flow.yml`.
   ```
4. Use `AskUserQuestion` with options:
   - "Looks correct" with description: "*Recommended — saves the detected platform and stack to .feature-flow.yml and continues*"
   - "Let me adjust" with description: "Correct the platform or stack before saving — you'll provide the changes in freeform text"

**YOLO behavior:** If YOLO mode is active, skip this question. Accept the detected context as-is and announce: `YOLO: start — Platform/stack detection → Accepted: [platform], [stack list]`

5. Write `.feature-flow.yml` with confirmed values (include `plugin_version` set to the running plugin version; gotchas starts empty — skills will populate it as they discover issues)

See `../../references/auto-discovery.md` for the full detection rules.
See `../../references/project-context-schema.md` for the schema.

## Base Branch Detection

After loading project context, detect the base branch that will be used as the PR target and for all `...HEAD` diff commands throughout the lifecycle. Detect once and announce — all subsequent steps reference "the detected base branch."

Detection cascade:
1. `.feature-flow.yml` → `default_branch` field (if present and non-empty)
2. `git config --get init.defaultBranch` (if set and branch exists locally or on remote)
3. Check for common integration branches (local first, then remote):
   a. `develop`: `git rev-parse --verify develop 2>/dev/null || git rev-parse --verify origin/develop 2>/dev/null`
   b. `staging`: `git rev-parse --verify staging 2>/dev/null || git rev-parse --verify origin/staging 2>/dev/null`
   `develop` is checked before `staging` because it is the Git Flow standard integration branch, while `staging` is typically an environment branch. If both exist, announce a warning: `"Both develop and staging branches detected. Using develop — set default_branch in .feature-flow.yml to override."`
4. Fall back to `main` (or `master` if `main` doesn't exist)

Announce: `"Detected base branch: [branch]. All PR targets and branch diffs will use this."`

**YOLO behavior:** No prompt — always auto-detected. Announce: `YOLO: start — Base branch detection → [branch]`

## Base Branch Sync

After detecting the base branch, sync it with the remote to ensure the worktree is created from the latest state. This prevents stale-base conflicts during the end-of-lifecycle sync step.

1. Fetch latest from origin:
   ```bash
   git fetch origin
   ```

2. Check if local base branch is behind remote:
   ```bash
   git rev-list <base_branch>..origin/<base_branch> --count
   ```
   - If `0`: announce "Base branch is up to date with origin." Skip to next section.
   - If non-zero: proceed to step 3.

3. Update local base branch to match remote:
   ```bash
   # If currently on the base branch:
   git pull --ff-only origin/<base_branch>

   # If on a different branch (can't pull):
   git fetch origin <base_branch>:<base_branch>
   ```
   `git fetch origin <branch>:<branch>` does a fast-forward update of the local ref without checking it out. If the local branch has diverged (non-fast-forward), it will fail — see edge cases below.

**Edge cases:**

| Scenario | Behavior |
|----------|----------|
| Local base has uncommitted changes | Stash before sync (`git stash`), pop after (`git stash pop`) |
| Local base has diverged (non-fast-forward) | Fetch will fail. Warn: "Local `<branch>` has diverged from `origin/<branch>` — cannot fast-forward. Proceeding with local state." |
| Remote unreachable (offline) | `git fetch origin` fails. Announce: "Remote unreachable — proceeding with local base branch." Continue lifecycle. |

**YOLO behavior:** Auto-sync silently. Announce: `YOLO: start — Base branch sync → fetched origin/<base_branch> (N commits ahead of local)` or `YOLO: start — Base branch sync → up to date`

**Interactive/Express behavior:** Announce sync result. If local has diverged (non-fast-forward), warn the user and proceed with local state.

## Session Model Check

After detecting the base branch, detect the current model and announce it. The orchestrator should run on Opus 4.6 for the full session (1M context, standard pricing). Cost optimization comes from subagent routing — Task dispatches use explicit `model` params to run subagents on Sonnet or Haiku. See `references/model-routing.md` for the full routing strategy.

1. **Detect model:** The system prompt contains `"You are powered by the model named X. The exact model ID is Y"`. Check if the model ID contains `opus`.

2. **If Opus detected** — announce: `"Model check: running on [model] — Opus confirmed for orchestration."` No further model-related prompts.

3. **If non-Opus detected** (Sonnet, Haiku, or other) — announce: `"Model check: running on [model]. For best results, start feature-flow sessions with Opus (claude --model claude-opus-4-6 or use the default). Continuing on current model."` Do not suggest `/model` — it mutates global config and affects all other terminal windows and tmux panes.

4. **If model detection fails** — announce: `"Model detection: could not determine current model. Continuing."` No further model-related prompts.

**YOLO behavior:** No prompt — detect model and announce:
- If detected: `YOLO: start — Model detection → [model ID]`
- If detection fails: `YOLO: start — Model detection → unknown`

**Express behavior:** Same as Interactive — announce model, no prompt.

## Notification Preference

After the Session Model Check, check whether the user wants to be notified when Claude Code stops and waits for input. This fires the preference prompt once per lifecycle session (or skips it if a saved preference exists).

**macOS guard:** If `$OSTYPE` does not match `darwin*`, skip this subsection entirely and announce: `"Notification preference skipped — osascript only available on macOS."`

**Check for saved preference:**
1. Read `.feature-flow.yml` `notifications.on_stop` field (if present)
2. If present and non-empty (`bell`, `desktop`, or `none`):
   - Announce: `"Notification preference loaded from .feature-flow.yml: [value] — skipping prompt."`
   - If `bell` or `desktop`: apply the saved preference by following the full hook-writing procedure in "After selection" below (including its permission-error fallback)
   - If `none`: skip both the prompt and any writes — the preference is already recorded
   - Skip the prompt entirely
3. If absent: proceed to the preference prompt

**Preference prompt (when no saved preference):**

Use `AskUserQuestion`:
- Question: `"Notify me when Claude needs your input? (fires on every Stop event while the lifecycle runs)"`
- Option 1: `"No notifications"` with description: `"*Recommended — no sound or banner; check the terminal manually when ready*"`
- Option 2: `"Terminal bell"` with description: `"Runs: osascript -e 'beep 2' — a simple system beep when Claude pauses"`
- Option 3: `"Desktop notification"` with description: `"Runs: display notification 'Claude Code needs your attention' — banner with Glass sound"`

**After selection (or applying saved preference):**

- **If `none`:** Announce: `"No notifications — continuing."` Do not write any notification hook to `~/.claude/settings.json`, but DO write `notifications.on_stop: none` to `.feature-flow.yml` so future sessions know the user was already prompted. If the write fails (permission error or YAML issue), log the error and continue — announce: `"Warning: could not persist notification preference to .feature-flow.yml — you will be re-prompted next session."`
- **If `bell` or `desktop`:**
  1. Read `~/.claude/settings.json` — check if a Stop hook already contains `osascript` for notification (substring match on `beep` or `display notification`). If found: skip writing, announce: `"Existing notification hook found in ~/.claude/settings.json — reusing."` If the file cannot be read or contains invalid JSON, treat it as absent (proceed to write a new hook).
  2. If not found: write the Stop hook to `~/.claude/settings.json` by merging into the existing `hooks.Stop` array (create the file if absent):
     - Bell: `{ "type": "command", "command": "osascript -e 'beep 2'" }`
     - Desktop: `{ "type": "command", "command": "osascript -e 'display notification \"Claude Code needs your attention\" with title \"Claude Code\" sound name \"Glass\"'" }`
     - If the file cannot be written (permission error), log the error and continue — do not block the lifecycle
  3. Write `notifications.on_stop: [bell|desktop]` to `.feature-flow.yml` so future sessions skip the prompt. If the write fails, log the error and continue — announce: `"Warning: could not persist notification preference to .feature-flow.yml — you will be re-prompted next session."`
  4. Announce: `"Notification preference saved ([bell|desktop]). Stop hook written to ~/.claude/settings.json."`

**YOLO behavior:** Skip the prompt. Check `.feature-flow.yml` for `notifications.on_stop` — if present, apply it silently (for `bell` or `desktop`, also perform the duplicate-detection and hook-write steps in "After selection" without additional announcements; if the hook write fails, announce: `YOLO: start — Notification hook write failed: [error] — continuing without hook`). If absent, default to `none` (no hook written, no `.feature-flow.yml` write in YOLO mode — YOLO does not persist a preference on behalf of the user). Announce: `YOLO: start — Notification preference → [loaded: value | no preference, defaulting to none]`

**Express behavior:** Same as YOLO — skip the prompt, use saved preference or default to `none`.

## Knowledge Base Pre-Flight

After the Notification Preference step, check for an existing per-feature knowledge base and load it into the lifecycle context.

**Archival algorithm:**

1. Check for `FEATURE_CONTEXT.md` in the current directory (worktree root)
2. If not found: set `context.feature_context = null` and skip all steps below — new feature, file will be created at worktree setup
3. If found:
   a. Read `knowledge_base.stale_days` from `.feature-flow.yml` (default: 14)
   b. Read `knowledge_base.max_lines` from `.feature-flow.yml` (default: 150)
   c. Parse all bullet entries under `## Key Decisions` — extract `[YYYY-MM-DD]` from each
   d. Mark entries as stale if their date is more than `stale_days` days before today
   e. Count total lines in the file
   f. If stale entries exist **or** line count > `max_lines`:
      - Move stale entries to `DECISIONS_ARCHIVE.md` (append under a `## Archived from [branch-name]` header; create file if absent)
      - If file still > `max_lines` after age-based archival: move oldest remaining entries until under the limit
      - Rewrite `FEATURE_CONTEXT.md` with remaining entries (preserve section headers and comments)
      - Note: `FEATURE_CONTEXT.md` and `DECISIONS_ARCHIVE.md` are session-local files (not committed to git). Archival modifies them locally for the current session only.
4. Count remaining `## Key Decisions` bullet entries → N. Let M = total entries moved to `DECISIONS_ARCHIVE.md` during this run (0 if no archival occurred).

**Edge cases:**
- `## Key Decisions` is empty → skip archival entirely, N = 0
- All entries are stale → archive all, leave empty `## Key Decisions` stub with comment
- Entries have no `[YYYY-MM-DD]` date (free-form notes) → skip archival for those entries (leave in place)
- `DECISIONS_ARCHIVE.md` doesn't exist → create it with the branch name header before appending
- Commit fails (e.g., nothing staged) → skip commit silently

**Inject and announce:**

After archival (or if no archival was needed):
- Set `context.feature_context` = full contents of `FEATURE_CONTEXT.md`
- If N > 0: print `"📋 Resuming feature — {N} decisions loaded from FEATURE_CONTEXT.md"`
- If N == 0: print nothing (no decisions to restore)

Downstream skills receive `context.feature_context` injected into their args alongside other lifecycle context fields (`base_branch`, `issue`, `design_doc`, `plan_file`, `worktree`).

**YOLO behavior:** Run archival silently. If archival ran, announce: `YOLO: start — Knowledge base → Archived {M} stale decisions, {N} decisions loaded`. If no file found, announce: `YOLO: start — Knowledge base → No FEATURE_CONTEXT.md found (new feature)`. If N > 0, announce resume notice as normal.

**Express behavior:** Same as YOLO for this step — run archival silently, print resume notice if N > 0.

## Plugin Registry Loading

After the Knowledge Base Pre-Flight step, build the plugin registry by scanning installed plugins. This must complete before the Pre-Flight Reviewer Audit in `references/step-lists.md`.

**Read `references/plugin-scanning.md`** for the full scanning process, keyword classification, base plugin registry, fallback validation, and error handling. Summary:

1. Check for `plugin_registry` in `.feature-flow.yml`. If absent and `~/.claude/plugins/cache/` doesn't exist, bootstrap with base plugins only (all `status: missing`).
2. Walk `~/.claude/plugins/cache/`, read `plugin.json` manifests. Use content hash fast path — compare SHA-256 hash against stored `content_hashes` to skip unchanged plugins.
3. For changed/new plugins: read agent `.md` frontmatter and skill `SKILL.md` frontmatter. Classify capabilities via keyword matching into 8 lifecycle roles (`code_review`, `security_review`, `testing`, `design`, `documentation`, `deployment`, `formatting`, `type_checking`).
4. Infer stack affinity from description keywords. Default to `["*"]` (universal) if no stack keywords found.
5. Diff against persisted registry. Announce additions: `"New plugin discovered: [name] → [roles]"`. Announce removals: `"Plugin removed: [name]"`.
6. Run fallback validation: verify base required plugins (superpowers, context7) are actually loaded in the current session via namespace-prefix detection in the skill/tool list.
7. Write updated registry to `.feature-flow.yml` under `plugin_registry`.

**YOLO behavior:** Auto-scan silently. Announce: `YOLO: start — Plugin registry → [N] plugins ([M] base, [K] discovered), [J] new, [L] removed`

**Express behavior:** Same as YOLO — auto-scan silently, announce inline.

**Interactive behavior:** Announce scan results. No prompt needed — scanning is non-interactive.
