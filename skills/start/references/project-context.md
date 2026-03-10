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
     - Announce: "Express mode active. Auto-selecting decisions but pausing for design approval and at phase transitions for optional `/compact`. Decision log will be printed at completion."
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

## Session Model Recommendation

After detecting the base branch, detect the current model and recommend Sonnet-first routing. The lifecycle's mechanical phases (implementation, review, verification, git operations) do not require Opus-level reasoning — Sonnet handles them equally well at significantly lower cost (see Model Routing Defaults for figures).

1. **Detect model:** The system prompt contains `"You are powered by the model named X. The exact model ID is Y"`. Check if the model ID contains `opus`.

2. **If Opus detected**, use `AskUserQuestion`:
   - Question: `"You're on Opus. Sonnet-first routing saves ~70% with no quality loss on mechanical phases. Switch?"`
   - Option 1: `"Yes — I'll run /model sonnet"` with description: `"*Recommended — estimated ~70% cost reduction for lifecycle phases that don't need Opus reasoning*"`
   - Option 2: `"No — stay on Opus"` with description: `"Opus for all phases. Higher cost but maximum reasoning quality throughout."`

3. **If user selects "Yes"** — instruct: `"Run '/model sonnet' now, then type 'continue' to resume the lifecycle."` Pause until the user's next message. On resume, proceed regardless (the user controls when to resume; re-checking the model at this point is not reliable since the system prompt may not have updated yet).

4. **If user selects "No"** — announce: `"Staying on Opus. No further model prompts."` Proceed without further model-related prompts for the remainder of the lifecycle.

5. **If already on a non-Opus model** (Sonnet, Haiku, or other) — no prompt needed. Announce: `"Model check: running on [model] — no switch needed."`

6. **If model detection fails** (model ID string not found in system prompt) — announce: `"Model detection: could not determine current model. Falling back to informational recommendation."` Then display the informational fallback:
   ```
   Model routing: Sonnet-first is recommended for this lifecycle.
   - Brainstorming and design phases benefit from Opus (deep reasoning)
   - Implementation, review, and verification phases run well on Sonnet
   - All subagent dispatches set explicit model parameters (see Model Routing Defaults)
   If you're on Opus, consider `/model sonnet` — the skill will suggest `/model opus` before phases that benefit from it.
   ```

**YOLO behavior:** No prompt — detect model and announce:
- If detected: `YOLO: start — Model detection → [model ID] (Sonnet-first recommended, no gate in YOLO mode)`
- If detection fails: `YOLO: start — Model detection → unknown (Sonnet-first recommended, no gate in YOLO mode)`

**Express behavior:** Same as Interactive — show the `AskUserQuestion` prompt. Express auto-selects decisions but model switching requires user action (`/model` command), so it must pause.

## Notification Preference

After the Session Model Recommendation, check whether the user wants to be notified when Claude Code stops and waits for input. This fires the preference prompt once per lifecycle session (or skips it if a saved preference exists).

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
2. If not found: skip all steps below — new feature, file will be created at worktree setup
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
      - Commit: `git add FEATURE_CONTEXT.md DECISIONS_ARCHIVE.md && git commit -m "chore: archive stale decisions [auto]"`
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
