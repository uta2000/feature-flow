---
name: start
description: This skill should be used when the user asks to "start:", "start a feature", "build a feature", "implement a feature", "new feature", "start working on", "I want to build", "let's build", "add a feature", or at the beginning of any non-trivial development work. It orchestrates the full lifecycle from idea to PR, invoking the right skills at each step.
tools: Read, Glob, Grep, Write, Edit, Bash, Task, AskUserQuestion, Skill
---

# Start — Lifecycle Orchestrator

Guide development work through the correct lifecycle steps, invoking the right skill at each stage. This is the single entry point for any non-trivial work.

**Announce at start:** "Starting the feature lifecycle. Let me check project context and determine the right steps."

## Pre-Flight Check

Before starting, verify required and recommended plugins are available.

### superpowers (required)

Check for its presence by looking for superpowers skills in the loaded skill list — do NOT invoke a superpowers skill just to test availability. If superpowers is not found, stop and tell the user:

```
The superpowers plugin is required but doesn't appear to be installed.
Install it first: claude plugins add superpowers
Then re-run start.
```

Do not proceed with the lifecycle if superpowers is missing — most steps depend on it.

### Context7 (required)

Check for the Context7 MCP plugin by looking for `mcp__plugin_context7_context7__resolve-library-id` in the available tools (use ToolSearch if needed). If Context7 is not found, warn the user:

```
The Context7 plugin is required for documentation lookups but doesn't appear to be installed.
Install it: claude plugins add context7
Without it, feature-flow cannot query up-to-date library documentation during design and implementation.
```

Do not proceed with the lifecycle if Context7 is missing — documentation lookups are a core part of the design phase. The `context7` field in `.feature-flow.yml` will not be populated, and the documentation lookup step, documentation compliance verification, and PreToolUse hook will all be non-functional.

### pr-review-toolkit (recommended)

Check for its presence by looking for `pr-review-toolkit:review-pr` in the loaded skill list. If not found, warn but continue:

```
The pr-review-toolkit plugin is recommended for full code review coverage.
Install it: claude plugins add pr-review-toolkit
Without it, the pr-review-toolkit subagent will not run — the code review pipeline will skip the pr-review-toolkit agents (silent-failure-hunter, code-simplifier, pr-test-analyzer, type-design-analyzer) that it dispatches internally.
```

### feature-dev (recommended)

Check for its presence by looking for `feature-dev:code-reviewer` in the loaded skill list. If not found, warn but continue:

```
The feature-dev plugin is recommended for code review.
Install it: claude plugins add feature-dev
Without it, the code review pipeline will skip: feature-dev:code-reviewer.
```

### backend-api-security (recommended)

Check for its presence by looking for `backend-api-security:backend-security-coder` in the loaded skill list. If not found, warn but continue:

```
The backend-api-security plugin is recommended for security review.
Install it: claude plugins add backend-api-security
Without it, the code review pipeline will skip: backend-security-coder.
```

### Reviewer Stack Affinity Table

A static mapping of each code reviewer to the tech stacks it is relevant for. The orchestrator reads the `stack` field from `.feature-flow.yml` and uses this table for both the pre-flight audit and the code review pipeline dispatch.

| Reviewer | Plugin | Stack Affinity | Tier |
|----------|--------|---------------|------|
| `superpowers:code-reviewer` | superpowers | `*` (universal — all stacks) | 1 |
| `silent-failure-hunter` | pr-review-toolkit (internal) | `*` (universal) | 1 |
| `code-simplifier` | pr-review-toolkit (internal) | `*` (universal) | 2 |
| `feature-dev:code-reviewer` | feature-dev | `*` (universal) | 2 |
| `pr-test-analyzer` | pr-review-toolkit | `*` (universal) | 3 |
| `type-design-analyzer` | pr-review-toolkit | `typescript`, `node-js` | 3 |
| `backend-api-security:backend-security-coder` | backend-api-security | `node-js`, `python`, `go`, `ruby`, `java`, `supabase` | 3 |

Internal agents marked `(internal)` run inside their parent plugin's subagent and are not dispatched independently during the code review pipeline. They are excluded from the reviewer audit process (step 2 skips internal agents) but remain in this table as a reference for which agents each plugin provides.

### Pre-Flight Reviewer Audit

After loading `.feature-flow.yml` and completing the recommended plugin checks above, cross-reference installed plugins against the Reviewer Stack Affinity Table to report review coverage for the current stack.

**Process:**
1. Read the `stack` field from `.feature-flow.yml`
2. For each non-internal reviewer in the affinity table:
   a. Check if the reviewer's plugin is installed (from the plugin checks above)
   b. Check if the reviewer's stack affinity includes `*` OR intersects with the project's `stack` list
   c. Classify as: relevant+installed, relevant+missing, or irrelevant
3. Report to the user:

```
Reviewer availability (stack: [stack list]):
  Relevant + installed:
    - [reviewer] ([affinity])
  Relevant + missing:
    - [reviewer] ([affinity]) — install: claude plugins add [plugin]
  Irrelevant (skipped for this stack):
    - [reviewer] ([affinity] — not matching stack)
```

**YOLO behavior:** No prompt for the audit display — always auto-run. Announce: `YOLO: start — Reviewer audit → [N] relevant ([M] installed, [K] missing), [J] irrelevant`

**Express behavior:** Same as YOLO for the audit display — announce inline.

### Marketplace Discovery

After the reviewer audit, discover additional code review plugins from the marketplace that may be relevant for the project's stack.

**Process:**
1. Run: `claude plugins search "code review"` (single CLI call)
2. Parse results for plugins not already installed
3. Cross-reference discovered plugins against the Reviewer Stack Affinity Table:
   - If a discovered plugin has known stack affinity that matches the project → suggest with install command
   - If a discovered plugin is not in the affinity table → present as "discovered — may be relevant"
4. Display marketplace results as a separate output block after the reviewer audit:
   ```
   Marketplace suggestions (stack: [stack list]):
     - [plugin-name] (matches stack) — install: claude plugins add [plugin-name]
     - [plugin-name] (discovered — may be relevant) — install: claude plugins add [plugin-name]
   ```
   If no relevant suggestions found: announce "Marketplace search complete — no new plugins found." and continue.

**Failure handling:** If `claude plugins search` fails (network error, CLI not available, non-zero exit), log a warning and continue: "Marketplace search failed — skipping plugin discovery. Continuing with installed plugins." This must never block the lifecycle.

**YOLO behavior:** Skip marketplace search entirely (install prompt will auto-skip anyway). Announce: `YOLO: start — Marketplace discovery → Skipped (YOLO mode)`

**Express behavior:** Same as YOLO — skip marketplace search.

### Install Missing Plugins Prompt

After displaying the reviewer audit (including marketplace suggestions), if there are any **Relevant + missing** or **Marketplace suggestions** plugins, prompt the user to install them before continuing.

Use `AskUserQuestion`:
- Question: `"Missing/suggested review plugins found. Install them for better coverage? (Requires Claude Code restart to take effect)"`
- Option 1: `"Install all and restart"` with description: `"Installs plugins, then you restart Claude Code and re-run start: to get full coverage"`
- Option 2: `"Let me pick"` with description: `"I'll choose which plugins to install"`
- Option 3: `"Skip — continue without installing"` with description: `"Proceed with currently installed plugins only"`

**If "Install all and restart":**
1. For each missing/suggested plugin, run: `claude plugins add [plugin-name]`
2. If any install fails, log the failure and continue with remaining installs
3. Announce which plugins were installed
4. Instruct the user: `"Plugins installed. Restart Claude Code for them to take effect, then re-run start: with the same arguments. The lifecycle will restart from pre-flight and detect the newly installed plugins."`
5. **Stop the lifecycle.** Do not continue — the new plugins will not be available until restart.

**Note:** If the user re-runs `start:` without restarting Claude Code, newly installed plugins will NOT be detected by pre-flight checks (they check loaded skills, not installed-on-disk plugins). The audit will still show them as missing. This is expected — remind the user to restart if they appear stuck in a loop.

**If "Let me pick":**
1. Present the list of missing/suggested plugins with numbers
2. User selects which to install (e.g., "1, 3" or "all except 2")
3. Install selected plugins
4. Same restart instruction and lifecycle stop as "Install all and restart"

**If "Skip":**
Continue the lifecycle with currently installed plugins. No further action.

**If no plugins are missing or suggested:** Skip this prompt entirely — no need to ask.

**YOLO behavior:** Skip the prompt. Auto-select "Skip — continue without installing." Announce: `YOLO: start — Install missing plugins → Skipped (YOLO mode)`

**Express behavior:** Same as YOLO — skip the prompt, continue with installed plugins.

## Purpose

Ensure the lifecycle is followed from start to finish. Track which steps are complete, invoke the right skill at each stage, and do not advance until the current step is done.

## Process

### Step 0: Load or Create Project Context

**YOLO Trigger Phrase Detection:**

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
4. Use `AskUserQuestion` with options: "Looks correct", "Let me adjust"

**YOLO behavior:** If YOLO mode is active, skip this question. Accept the detected context as-is and announce: `YOLO: start — Platform/stack detection → Accepted: [platform], [stack list]`

5. Write `.feature-flow.yml` with confirmed values (include `plugin_version` set to the running plugin version; gotchas starts empty — skills will populate it as they discover issues)

See `../../references/auto-discovery.md` for the full detection rules.
See `../../references/project-context-schema.md` for the schema.

**Base Branch Detection:**

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

**Session Model Recommendation:**

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

**Notification Preference:**

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
- Option 1: `"No notifications"` with description: `"(Default) No sound or banner — you check the terminal manually"`
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

### Step 1: Determine Scope

Ask the user what they want to build. Then classify the work.

**Issue reference detection:** Before classifying scope, check if the user's request references an existing GitHub issue. Look for patterns: `#N`, `issue #N`, `implement issue #N`, `issue/N`, or a full GitHub issue URL (e.g., `https://github.com/.../issues/N`).

If an issue reference is found:
1. Extract the issue number
2. Fetch the issue body and title: `gh issue view N --json title,body,comments --jq '{title, body, comments: [.comments[].body]}'`
3. Store the issue number as lifecycle context (pass to subsequent steps)
4. Announce: "Found issue #N: [title]. I'll use this as context for brainstorming and update it after design."
5. Pass the issue body + comments as initial context to the brainstorming step

If no issue reference is found, proceed as before.

**Issue richness scoring (when an issue is linked):**

Assess the linked issue for context richness. Count the following signals:
1. Has acceptance criteria or clear requirements sections
2. Has resolved discussion in comments (answered questions)
3. Has concrete examples, mockups, or specifications
4. Body is >200 words with structured content (headings, lists, tables)

A score of 3+ means the issue is "detailed."

**Inline context richness:**

If the user's initial message (not the issue) contains detailed design decisions — specific approach descriptions, UX flows, data model specifics, or concrete behavior specifications — treat this as equivalent to a detailed issue for recommendation purposes.

**Fast-track detection (small enhancement only):**

This check runs only after scope has been classified as "small enhancement" in the table below. After scoring issue richness and evaluating inline context, check if the small enhancement qualifies for a fast-track lifecycle:

1. **Condition:** Scope is classified as "small enhancement" AND either:
   - Issue richness score is 3+ (detailed issue), OR
   - Inline context provides equivalent detail (specific approach, file references, acceptance criteria)
2. **If fast-track qualifies:**
   - Set `fast_track` flag for step list building
   - Announce activation:
     - **YOLO/Express:** `"YOLO: start — Small enhancement fast-track → Activated (issue #N richness: [score]/4). Skipping: brainstorming, design document, verify-plan-criteria."` (for Express mode, substitute `Express:` for `YOLO:` in the announcement)
     - **Interactive:** `"Issue #N has detailed requirements (richness: [score]/4). Fast-tracking: skipping brainstorming, design document, and verify-plan-criteria. The issue content serves as the design."`
3. **If fast-track does not qualify:** Use the standard 17-step small enhancement list. No announcement needed.

Fast-track detection runs after scope classification and before the combined scope + mode prompt. The step count in the prompt reflects the fast-track status: 14 steps if fast-track qualifies, 17 steps otherwise.

**Scope classification:**

| Scope | Description | Example |
|-------|------------|---------|
| **Quick fix** | Single-file bug fix, typo, config change | "Fix the null check in the login handler" |
| **Small enhancement** | 1-3 files, well-understood change, no new data model | "Add a loading spinner to the search page" |
| **Feature** | Multiple files, new UI or API, possible data model changes | "Add CSV export to the results page" |
| **Major feature** | New page/workflow, data model changes, external API integration, pipeline changes | "Build a creative domain generator with LLM" |

See `references/scope-guide.md` for detailed criteria, examples, and edge cases.

**Smart recommendation logic:**

Determine the recommended mode using three signals:

| Scope | Default | With detailed issue | With detailed inline context |
|-------|---------|--------------------|-----------------------------|
| Quick fix | YOLO | YOLO | YOLO |
| Small enhancement | YOLO | YOLO | YOLO |
| Feature | Interactive | YOLO (override) | YOLO (override) |
| Major feature | Interactive | Express | Express |

**Context pressure estimates (scope × mode):**

| Scope | Interactive | Express | YOLO |
|-------|-------------|---------|------|
| Quick fix (7 steps) | Low | Low | Low |
| Small enhancement (14-17 steps) | Medium | Low | Low |
| Feature (18 steps) | High | Medium | Medium |
| Major feature (19 steps) | Very High | High | High |

**Combined scope + mode prompt:**

Present the classification AND mode recommendation to the user in a **single** `AskUserQuestion`. The question text includes the scope, step count, and (if applicable) issue context summary.

**Question format:**
```
This looks like a **[scope]** ([N] steps).
[If issue linked: "Found issue #N: [title] — [richness summary]."]

Run mode?
```

**Context warning (conditional):**

When the recommended mode is Interactive AND the context pressure for Interactive at the current scope is High or Very High, add a context note line to the question text:

```
This looks like a **[scope]** ([N] steps).
[If issue linked: "Found issue #N: [title] — [richness summary]."]
Context note: Interactive mode at this scope typically requires 3-4 /compact pauses. Express auto-selects decisions while preserving those checkpoints.

Run mode?
```

**When to show the context note:**
- Feature + sparse context (High pressure in Interactive) → show note
- Major feature + sparse context (Very High pressure in Interactive) → show note
- All other cases → no context note (either pressure is Low-Medium, or the recommended mode already accounts for context pressure)

**Option ordering depends on recommendation:**

*YOLO recommended* (quick fix, small enhancement, or feature with detailed context):
- Option 1: "YOLO — fully unattended, no pauses" with description: "*Recommended — [reasoning]*"
- Option 2: "Express — I'll auto-select decisions but pause for design approval and at phase transitions to optionally compact the conversation"
- Option 3: "Interactive — I'll interview you to address outstanding design questions, with pauses at phase transitions to optionally compact the conversation"

*Interactive recommended* (feature/major without detailed context):
- Option 1: "Interactive — I'll interview you to address outstanding design questions, with pauses at phase transitions to optionally compact the conversation" with description: "*Recommended — [reasoning]*"
- Option 2: "Express — I'll auto-select decisions but pause for design approval and at phase transitions to optionally compact the conversation"
- Option 3: "YOLO — fully unattended, no pauses"

*Express recommended* (major feature with detailed issue or detailed inline context):
- Option 1: "Express — I'll auto-select decisions but pause for design approval and at phase transitions to optionally compact the conversation" with description: "*Recommended — detailed requirements cover design decisions; Express preserves compaction checkpoints at each phase transition.*"
- Option 2: "Interactive — I'll interview you to address outstanding design questions, with pauses at phase transitions to optionally compact the conversation"
- Option 3: "YOLO — fully unattended, no pauses"

*Footnote (always shown after the options):* "For Express and Interactive: at each pause you can run `/compact` then type 'continue' to resume, or just type 'continue' to skip compaction."

The recommended option always appears first in the list. Each option's description includes italicized reasoning when a recommendation is made.

**Scope correction:** If the user believes the scope is misclassified, they can select "Other" on the `AskUserQuestion` and state their preferred scope. The lifecycle will adjust the step list and checkpoint rules accordingly.

**YOLO behavior (trigger phrase activated):** If YOLO was already activated by a trigger phrase in Step 0, skip this question entirely. Auto-classify scope and announce: `YOLO: start — Scope + mode → [scope], YOLO (trigger phrase)`

**Express behavior (trigger phrase activated):** If Express was already activated by a trigger phrase in Step 0, skip this question entirely. Auto-classify scope and announce: `Express: start — Scope + mode → [scope], Express (trigger phrase)`

**Express behavior:** If the user selects "Express", set Express mode active. All YOLO auto-selection overrides apply for skill invocations, but context window checkpoints and design approval checkpoints are shown instead of suppressed.

### Step 2: Build the Step List

Based on scope AND platform, determine which steps apply. Create a todo list to track progress.

**Quick fix (all platforms):**
```
- [ ] 1. Understand the problem
- [ ] 2. Study existing patterns
- [ ] 3. Implement fix (TDD)
- [ ] 4. Self-review
- [ ] 5. Verify acceptance criteria
- [ ] 6. Commit and PR
- [ ] 7. Comment and close issue
```

**Small enhancement:**

If the small enhancement qualifies for fast-track (issue richness 3+ or equivalent inline detail), use the fast-track step list. Otherwise, use the standard step list.

*Standard (no fast-track):*
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Documentation lookup (Context7)
- [ ] 3. Design document
- [ ] 4. Create issue
- [ ] 5. Implementation plan
- [ ] 6. Verify plan criteria
- [ ] 7. Commit planning artifacts
- [ ] 8. Worktree setup
- [ ] 9. Copy env files
- [ ] 10. Study existing patterns
- [ ] 11. Implement (TDD)
- [ ] 12. Self-review
- [ ] 13. Code review
- [ ] 14. Generate CHANGELOG entry
- [ ] 15. Final verification
- [ ] 16. Commit and PR
- [ ] 17. Comment and close issue
```

*Fast-track (issue richness 3+ or detailed inline context):*
```
- [ ] 1. Documentation lookup (Context7)
- [ ] 2. Create issue
- [ ] 3. Implementation plan
- [ ] 4. Commit planning artifacts
- [ ] 5. Worktree setup
- [ ] 6. Copy env files
- [ ] 7. Study existing patterns
- [ ] 8. Implement (TDD)
- [ ] 9. Self-review
- [ ] 10. Code review
- [ ] 11. Generate CHANGELOG entry
- [ ] 12. Final verification
- [ ] 13. Commit and PR
- [ ] 14. Comment and close issue
```

**Feature:**
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Documentation lookup (Context7)
- [ ] 3. Design document
- [ ] 4. Design verification
- [ ] 5. Create issue
- [ ] 6. Implementation plan
- [ ] 7. Verify plan criteria
- [ ] 8. Commit planning artifacts
- [ ] 9. Worktree setup
- [ ] 10. Copy env files
- [ ] 11. Study existing patterns
- [ ] 12. Implement (TDD)
- [ ] 13. Self-review
- [ ] 14. Code review
- [ ] 15. Generate CHANGELOG entry
- [ ] 16. Final verification
- [ ] 17. Commit and PR
- [ ] 18. Comment and close issue
```

**Major feature:**
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Spike / PoC (if risky unknowns)
- [ ] 3. Documentation lookup (Context7)
- [ ] 4. Design document
- [ ] 5. Design verification
- [ ] 6. Create issue
- [ ] 7. Implementation plan
- [ ] 8. Verify plan criteria
- [ ] 9. Commit planning artifacts
- [ ] 10. Worktree setup
- [ ] 11. Copy env files
- [ ] 12. Study existing patterns
- [ ] 13. Implement (TDD)
- [ ] 14. Self-review
- [ ] 15. Code review
- [ ] 16. Generate CHANGELOG entry
- [ ] 17. Final verification
- [ ] 18. Commit and PR
- [ ] 19. Comment and close issue
```

**Mobile platform adjustments (ios, android, cross-platform):**

When the platform is mobile, modify the step list:

- **Implementation plan:** Add required sections — feature flag strategy, rollback plan, API versioning (if API changes)
- **After implementation:** Insert **device matrix testing** step (test on min OS version, small/large screens, slow network)
- **After final verification:** Insert **beta testing** step (TestFlight / Play Console internal testing)
- **After commit and PR:** Insert **app store review** step (human-driven gate — submission, review, potential rejection)
- **After app store review (or after commit and PR if not mobile):** Insert **comment and close issue** step (post implementation summary comment, close issue). Only runs when an issue is linked.

Announce the platform-specific additions: "Mobile platform detected. Adding: device matrix testing, beta testing, app store review, and comment and close issue steps."

Use the `TaskCreate` tool to create a todo item for each step (see `../../references/tool-api.md` — Deferred Tools section for loading instructions and correct usage).
Call all TaskCreate tools in a **single parallel message** — send one message containing all N TaskCreate calls simultaneously. Sequential calls waste N-1 parent API turns, so all steps must be created in one turn.

### Step 3: Execute Steps in Order

For each step, follow this pattern:

1. **Announce the step:** "Step N: [name]. Invoking [skill name]."
2. **Mark in progress (conditional):** Only set `in_progress` via `TaskUpdate` before starting steps where the work is extended and the user benefits from an active status indicator. **Steps that keep `in_progress`:** study existing patterns, implementation, self-review, code review, generate CHANGELOG entry, final verification, documentation lookup. **Steps that skip `in_progress`:** brainstorming, design document, design verification, create/update issue, implementation plan, verify plan criteria, worktree setup, copy env files, commit planning artifacts, commit and PR, comment and close issue. Note: sub-step 5 (`completed`) is always retained — it is the turn-continuity bridge. Skipping `in_progress` does not affect YOLO Execution Continuity. Note: YOLO propagation (prepending `yolo: true`) applies only to `Skill()` invocations, not to `Task()` dispatches.
3. **Invoke the skill** using the Skill tool (see mapping below and `../../references/tool-api.md` — Skill Tool for correct parameter names)
4. **Confirm completion:** Verify the step produced its expected output. *(Turn Bridge Rule — include any confirmation notes alongside the `TaskUpdate` call in step 5, not as a separate text-only response.)*
5. **Mark complete:** Update the todo item to `completed` — **always call `TaskUpdate` here.** *(Turn Bridge Rule — this call keeps your turn alive.)* **Batching optimization:** When the next step (N+1) is in the `in_progress`-eligible list (study existing patterns, implementation, self-review, code review, generate CHANGELOG entry, final verification, documentation lookup), send both `TaskUpdate` calls as a single parallel message: `[TaskUpdate(N, completed), TaskUpdate(N+1, in_progress)]`. This saves one API round-trip per eligible step transition. If N is the final lifecycle step, no N+1 exists — skip the batch and call only `TaskUpdate(N, completed)` as usual.
6. **Check for context checkpoint:** If the just-completed step is a checkpoint trigger (see Context Window Checkpoints section), and the current mode is not YOLO, and the current scope includes this checkpoint — output the checkpoint block and wait for the user to respond before announcing the next step.
7. **Announce next step and loop:** "Step N complete. Next: Step N+1 — [name]." Then **immediately loop back to sub-step 1 (Announce the step)** for the next lifecycle step.

**YOLO Execution Continuity (CRITICAL):** In YOLO mode, the execution loop must be **uninterrupted**. After completing one step, proceed directly to the next step in the same turn — do NOT end your turn between steps. The most common failure mode is: a skill outputs text (e.g., brainstorming decisions table), the assistant's turn ends because there are no pending tool calls, and the user must type "continue" to resume — this defeats the purpose of YOLO ("fully unattended, no pauses"). To prevent this: apply the **Turn Bridge Rule** (below) after every step, then continue to step 7 and loop back to step 1 for the next step.

**Turn Bridge Rule:** After outputting results for any inline step, **immediately call `TaskUpdate` to mark that step complete in the same response** — do not end your turn with only text output. A text-only response ends your turn and forces the user to type "continue" to resume, which breaks YOLO continuity. The `TaskUpdate` tool call is the bridge that keeps your turn alive between lifecycle steps.

**YOLO Propagation:** When YOLO mode is active, prepend `yolo: true. scope: [scope].` to the `args` parameter of every `Skill` invocation. Scope context is required because design-document uses it to determine checkpoint behavior. For example:

```
Skill(skill: "superpowers:brainstorming", args: "yolo: true. scope: [scope]. [original args]")
Skill(skill: "feature-flow:design-document", args: "yolo: true. scope: [scope]. [original args]")
```

**Express Propagation:** When Express mode is active, prepend `express: true. scope: [scope].` to the `args` parameter of every `Skill` invocation. Express inherits all YOLO auto-selection overrides — skills that check for `yolo: true` should also check for `express: true` and behave the same way (auto-select decisions). The only difference is at the orchestrator level where checkpoints are shown instead of suppressed. For example:

```
Skill(skill: "superpowers:brainstorming", args: "express: true. scope: [scope]. [original args]")
Skill(skill: "feature-flow:design-document", args: "express: true. scope: [scope]. [original args]")
```

For inline steps (CHANGELOG generation, self-review, code review, study existing patterns), the mode flag is already in the conversation context — no explicit propagation is needed.

**Lifecycle Context Object:** As the lifecycle executes, maintain a context object that accumulates artifact paths as they become known. Include all known paths in the `args` of every subsequent `Skill` invocation, after the mode flag and scope:

| Path key | When it becomes available |
|----------|--------------------------|
| `base_branch` | Step 0 — base branch detection |
| `issue` | Step 1 — when an issue number is linked |
| `design_doc` | After design document step (the absolute path returned by the skill) |
| `plan_file` | After implementation plan step (the absolute path of the saved plan file) |
| `worktree` | After worktree setup (the absolute path to the created worktree) |

Include only paths that are known at the time of each invocation — do not include paths for artifacts that haven't been created yet. Example invocations showing progressive accumulation:

```
# Before design doc (base_branch and issue known):
Skill(skill: "superpowers:brainstorming", args: "yolo: true. scope: [scope]. base_branch: main. issue: 119. [original args]")

# Before implementation (plan_file and design_doc known, worktree not yet):
Skill(skill: "superpowers:writing-plans", args: "yolo: true. scope: [scope]. base_branch: main. issue: 119. design_doc: /abs/path/design.md. [original args]")

# During and after implementation (all paths known):
Skill(skill: "superpowers:subagent-driven-development", args: "yolo: true. scope: [scope]. plan_file: /abs/path/plan.md. design_doc: /abs/path/design.md. worktree: /abs/path/.worktrees/feat-xyz. base_branch: main. issue: 119. [original args]")
Skill(skill: "feature-flow:verify-acceptance-criteria", args: "plan_file: /abs/path/plan.md. [original args]")
```

**Do not skip steps.** If the user asks to skip a step, explain why it matters and confirm they want to skip. If they insist, mark it as skipped and note the risk.

### Skill Mapping

| Step | Skill to Invoke | Expected Output |
|------|----------------|-----------------|
| Brainstorm requirements | `superpowers:brainstorming` | Decisions on scope, approach, UX |
| Spike / PoC | `feature-flow:spike` | Confirmed/denied assumptions |
| Documentation lookup | No skill — inline step (see below) | Current patterns from official docs injected into context |
| Design document | `feature-flow:design-document` | File at `docs/plans/YYYY-MM-DD-*.md` |
| Study existing patterns | No skill — inline step (see below) | Understanding of codebase conventions for the areas being modified |
| Design verification | `feature-flow:design-verification` | Blockers/gaps identified and fixed |
| Create issue | `feature-flow:create-issue` | GitHub issue URL. **If an issue number was detected in Step 1**, pass it to create-issue as the `existing_issue` context — the skill will update the existing issue instead of creating a new one. |
| Implementation plan | `superpowers:writing-plans` | Numbered tasks with acceptance criteria. **Override:** After the plan is saved, always proceed with subagent-driven execution — do not present the execution choice to the user. Immediately invoke `superpowers:subagent-driven-development`. |
| Verify plan criteria | `feature-flow:verify-plan-criteria` | All tasks have verifiable criteria |
| Commit planning artifacts | No skill — inline step (see below) | Planning docs and config committed to base branch |
| Worktree setup | `superpowers:using-git-worktrees` | Isolated worktree created. **Override:** When checking for existing worktree directories, use `test -d` instead of `ls -d` — the `ls -d` command returns a non-zero exit code when the directory doesn't exist, causing false Bash tool errors. Example: `test -d .worktrees && echo "exists" \|\| echo "not found"`. |
| Copy env files | No skill — inline step (see below) | Env files available in worktree |
| Implement | `superpowers:subagent-driven-development` | Code written with tests, spec-reviewed, and quality-reviewed per task |
| Self-review | No skill — inline step (see below) | Code verified against coding standards before formal review |
| Code review | No skill — inline step (see below) | All Critical/Important findings fixed, tests pass |
| Generate CHANGELOG entry | No skill — inline step (see below) | CHANGELOG.md updated with categorized entry |
| Final verification | No skill — inline step (see below) | All criteria PASS + quality gates pass (or skipped if Phase 4 already passed) |
| Commit and PR | `superpowers:finishing-a-development-branch` | PR URL |
| Device matrix testing | No skill — manual step | Tested on min OS, small/large screens, slow network |
| Beta testing | No skill — manual step | TestFlight / Play Console build tested by internal tester |
| App store review | No skill — manual step | Submission accepted |
| Comment and close issue | No skill — inline step (see below) | Issue commented with implementation summary + closed |

### Phase-Boundary Model Hints

At phase transitions between reasoning-heavy and mechanical work, output a model switch suggestion. These are suggestions only — the lifecycle functions on any model.

**Escalation hint (before reasoning-heavy phases):**

Before invoking `superpowers:brainstorming` or `feature-flow:design-document`, output:
```
Entering [phase name] — this phase benefits from Opus-level reasoning.
Consider: /model opus
```

**De-escalation hint (after reasoning-heavy phases):**

After the design document step completes (or after design verification if present), output:
```
Design phase complete — switching to implementation phases.
Consider: /model sonnet
```

**Suppression rules:**
- **YOLO mode:** Hints suppressed — do not output. Announce inline: `YOLO: start — Phase-boundary model hint → suppressed ([phase])`
- **Express mode:** Hints shown — output the suggestion block
- **Interactive mode:** Hints shown — output the suggestion block
- **Quick fix scope:** No hints — too few phases to warrant switching

### Brainstorming Interview Format Override

When invoking `superpowers:brainstorming` from this lifecycle, pass these formatting instructions as context. Every interview question presented to the user must follow this format:

**Required format for each question:**

```
**[Question in plain English]**
*Why this matters:* [1 sentence explaining impact on the design]
- **Option A** — e.g., [concrete example]. *Recommended: [1 sentence reasoning]*
- **Option B** — e.g., [concrete example]
- **Option C** — e.g., [concrete example] (if applicable)
```

**Rules:**
- Always lead with the recommended option and mark it with `*Recommended*`
- Each option must include a concrete example showing what it means in practice (e.g., "like ESLint running on every save" not just "run on save")
- The "Why this matters" line should explain what downstream impact the choice has (e.g., "this determines whether validation errors surface during editing or only at commit time")
- Keep it concise — one line for the explanation, one line per option
- If there is no clear recommendation, say "*No strong preference — depends on [factor]*" instead of forcing a pick

**YOLO behavior:** When YOLO **or Express** mode is active (i.e., `yolo: true` or `express: true` is in the brainstorming args — for Express mode, substitute `Express:` for `YOLO:` in all inline announcements):

The brainstorming skill is designed for interactive use — it asks questions one at a time, proposes approaches for discussion, and checks in after each section. In YOLO mode, there is no human in the loop to answer these questions, so interactive prompts would stall the lifecycle. Skip all interactive prompts from the brainstorming skill (questions, approach proposals, section check-ins, "Ready to set up for implementation?") and self-answer design decisions instead.

How to proceed:
1. Analyze the feature description, issue context (if linked), and codebase to identify the key design questions
2. Self-answer each question using available context — issue body, issue comments, codebase patterns, and existing conventions
3. For each self-answered question, announce: `YOLO: brainstorming — [question summary] → [selected option with reasoning]`
4. After self-answering all questions, present the design as a single block rather than breaking it into sections with check-in prompts
5. Skip the "Ready to set up for implementation?" prompt — the lifecycle continues automatically to the next step
6. Ensure all self-answered decisions are captured when passing context to the design document step
7. **After outputting the brainstorming results, immediately call `TaskUpdate` to mark brainstorming complete.** *(Turn Bridge Rule applies.)*

This is the most complex YOLO interaction — the LLM makes design-level decisions. The user reviews these via the design document output rather than each micro-decision.

### Context Window Checkpoints

At specific phase transitions, output a checkpoint prompt suggesting the user run `/compact` to free context window space. The lifecycle pauses — the user must respond before the next step begins. `/compact` is a client-side Claude Code command that cannot be invoked programmatically — the skill can only suggest it.

**Checkpoint format and recovery procedure:** See `../../references/context-checkpoints.md`.

**Checkpoint locations:**

| # | After Step | Before Step | Focus Hint |
|---|-----------|-------------|------------|
| 1 | Documentation lookup | Design Document | `focus on brainstorming decisions and documentation patterns` |
| 2 | Design Verification (or Design Document for small enhancements, or Documentation Lookup for fast-track small enhancements) | Create Issue + Implementation Plan | `focus on the approved design and implementation plan` |
| 3 | Worktree Setup + Copy Env Files | Implement | `focus on the implementation plan, acceptance criteria, and worktree path` |
| 4 | Implementation complete (last task done) | Self-review + Code Review | `focus on the implementation commit SHAs, acceptance criteria, and any known issues from implementation` |

**Scope-based filtering:**

| Scope | Checkpoints shown |
|-------|------------------|
| Quick fix | None (too few steps) |
| Small enhancement | 2 and 3 only (checkpoint 2 triggers after Design Document, or after Documentation Lookup if fast-track) |
| Feature | All 4 |
| Major feature | All 4 |

**Suppression rules:**
- **YOLO mode:** All checkpoints suppressed — do not output the checkpoint block, do not end your turn. Proceed immediately to the next step (see **YOLO Execution Continuity** in Step 3).
- **Express mode:** Checkpoints are shown — output the checkpoint block and wait
- **Interactive mode:** Checkpoints are shown — output the checkpoint block and wait
- **Quick fix scope:** No checkpoints regardless of mode

### Express Design Approval Checkpoint

When Express mode is active and the scope is **Feature** or **Major Feature**, present a design approval checkpoint after the design document step (or design verification step if present). This checkpoint pauses Express mode for the user to review the design before implementation begins.

**Checkpoint format:**

```
Express checkpoint: Design document complete. Review the design before implementation begins.
Continue or adjust?
```

Use `AskUserQuestion` with options:
- "Continue" — approve the design and resume Express mode
- "Let me adjust" — user provides corrections, document is updated, then Express resumes

**Scope filtering:**
- Quick fix / Small enhancement: No design approval checkpoint (too small)
- Feature / Major feature: Design approval checkpoint shown

This checkpoint is owned by the `design-document` skill when invoked with `express: true`. The orchestrator does not present a separate checkpoint — it is handled inside the skill invocation. This is separate from context window checkpoints and fires at a different lifecycle moment (after design, not at phase transitions).

### Writing Plans YOLO Override

When YOLO **or Express** mode is active and invoking `superpowers:writing-plans` (for Express mode, substitute `Express:` for `YOLO:` in all inline announcements):

The writing-plans skill presents an execution choice after saving the plan. In YOLO mode, the lifecycle has already decided on subagent-driven execution — presenting this prompt would break unattended flow. Skip the execution choice prompt and proceed directly.

After the plan is saved:
1. Announce: `YOLO: writing-plans — Execution choice → Subagent-Driven (auto-selected)`
2. Immediately proceed to the next lifecycle step

### Writing Plans Quality Context Injection

This section applies unconditionally in all modes (YOLO, Express, Interactive). When invoking `superpowers:writing-plans`, prepend the following quality requirements to the planning instructions so that every task in the implementation plan includes quality constraints alongside acceptance criteria. `verify-plan-criteria` enforces these requirements — tasks without Quality Constraints will be flagged.

**Prepend to the planning instructions:**

1. **Quality Constraints section required per task.** Every non-trivial task must include a `**Quality Constraints:**` section after its acceptance criteria. The section specifies:
   - **Error handling pattern:** Which pattern to use (typed errors, discriminated unions, Result<T, E>) and which existing file to follow as reference
   - **Type narrowness:** Which types must use literal unions instead of string/number, and which types should be generated vs hand-maintained
   - **Function length/extraction:** Whether the task's main function can fit in ≤30 lines, and what helpers to extract if not
   - **Pattern reference:** Which existing file in the codebase to follow as a structural pattern

2. **Edge case criteria required in acceptance criteria.** For tasks that handle input, make external calls, or process data, acceptance criteria must include at least one edge case test:
   - Empty/null input handling
   - Timeout/error path handling
   - Boundary value testing (e.g., pagination limits, max lengths)
   - Special character/injection prevention (where applicable)

3. **File modification complexity required in Quality Constraints.** For tasks that modify existing files (not create new ones), the Quality Constraints section must include:
   - **Files modified:** List of existing files this task will edit
   - **Design-first files:** Any listed file >150 lines, flagged with `(design-first)` — the implementer must output a change plan before editing these files

4. **Progress Index header required in every plan.** Every plan file must include a machine-readable Progress Index HTML comment immediately after the plan title line and before any other content. The index lists every task by number and name with STATUS: pending, and sets CURRENT: none. The header specifies:
   - **Syntax:** Use HTML comment syntax (`<!-- ... -->`) so the index doesn't render in markdown viewers
   - **Task lines:** Include every task from the plan (one line per task); if the plan has no tasks, omit task lines entirely — the index block is still required with only `CURRENT: none`
   - **STATUS values:** STATUS accepts three values: `pending`, `in-progress`, `done (commit [SHA])`
   - **CURRENT field:** CURRENT is `Task N` when a task is active, `none` when between tasks or at start (e.g., `CURRENT: Task 2` when Task 2 is active)
   - **Callout block:** The `> **For Claude:**` callout is required in every plan file. It must immediately follow the closing `-->` on a new line

   Example:

   ```markdown
   # [Feature Name] Implementation Plan

   <!-- PROGRESS INDEX (updated by implementation skills)
   Task 1: [name] — STATUS: pending
   Task 2: [name] — STATUS: pending
   Task 3: [name] — STATUS: pending
   CURRENT: none
   -->

   > **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
   > Then read the full section for that specific task only.
   ```

**Example task with quality constraints:**

```markdown
### Task 3: Build search handler

**Acceptance Criteria:**
- [ ] Returns paginated results matching query
- [ ] Returns empty array for no matches
- [ ] Handles API timeout (30s) with typed error
- [ ] Returns validation error for empty string input

**Quality Constraints:**
- Error handling: typed errors with discriminated union (match `src/handlers/users.ts`)
- Types: `SearchResult.status` uses literal union `'available' | 'taken' | 'error'`, not string
- Function length: handler ≤30 lines; extract validation and transformation helpers
- Pattern: follow existing handler in `src/handlers/users.ts`
- Files modified: `src/handlers/search.ts` (design-first — 180 lines)
- Design-first files: `src/handlers/search.ts` — implementer must output change plan before editing
```

### Using Git Worktrees YOLO Override

When YOLO **or Express** mode is active and invoking `superpowers:using-git-worktrees` (for Express mode, substitute `Express:` for `YOLO:` in all inline announcements):

The using-git-worktrees skill asks where to create worktrees and whether to proceed when baseline tests fail. In YOLO mode, these prompts would stall unattended execution — the lifecycle uses a standard directory (`.worktrees/`) and defers test failures to later verification steps. Auto-select the worktree directory and proceed past baseline test failures.

How to proceed:
1. **Worktree directory:** Auto-select `.worktrees/` (project-local, hidden).
   Check existence with:
   ```bash
   test -d .worktrees && echo "exists" || echo "creating"
   ```
   If it doesn't exist, create it. Use `test -d` instead of `ls -d` for existence checks — `ls -d` returns non-zero for missing directories, causing false tool errors.
   Announce: `YOLO: using-git-worktrees — Worktree directory → .worktrees/ (auto-selected)`
2. **Baseline test failure:** If tests fail during baseline verification, log the failures as a warning and proceed. Announce: `YOLO: using-git-worktrees — Baseline tests failed → Proceeding with warning (N failures logged)`. The lifecycle will catch test issues during implementation and verification steps.

### Finishing a Development Branch YOLO Override

When YOLO **or Express** mode is active and invoking `superpowers:finishing-a-development-branch` (for Express mode, substitute `Express:` for `YOLO:` in all inline announcements):

The finishing-a-development-branch skill presents a 4-option completion menu and a base branch confirmation prompt. In YOLO mode, the lifecycle always creates a PR targeting the detected base branch — presenting options or confirmations would stall unattended flow. Auto-confirm the base branch and auto-select "Push and create a Pull Request."

How to proceed:
1. **Base branch:** Auto-confirm the detected base branch (from Step 0 base branch detection). Announce: `YOLO: finishing-a-development-branch — Base branch → [detected base branch]`
2. **Completion strategy:** Auto-select "Push and create a Pull Request" (Option 2). Announce: `YOLO: finishing-a-development-branch — Completion strategy → Push and create PR (auto-selected)`
3. Proceed with the push + PR creation flow without presenting the 4-option menu
4. **Issue reference in PR body:** When a GitHub issue is linked to the lifecycle, use `Related: #N` instead of `Closes #N` in the PR body — the lifecycle closes the issue explicitly in the "Comment and Close Issue" step with a detailed comment.
5. For PR title/body, use the feature description and lifecycle context to generate them automatically. **Include the aggregated code review summary in the PR body** — append the PR Review Toolkit Summary (from the Phase 1a subagent output, including the `### Auto-Fixed` section from Phase 1a), any findings fixed by the single-pass fix phase (Phase 3), and any remaining minor findings. Use this section heading in the PR body: `## Code Review Summary`.
6. **Test failure during completion:** If tests fail, log the failures as a warning and proceed with PR creation. Announce: `YOLO: finishing-a-development-branch — Tests failing → Proceeding with PR (N failures logged)`. Proceed past test failures — the code review pipeline already ran verification.

### Subagent-Driven Development YOLO Override

When YOLO **or Express** mode is active and invoking `superpowers:subagent-driven-development` (for Express mode, substitute `Express:` for `YOLO:` in all inline announcements):

The subagent-driven-development skill invokes `finishing-a-development-branch` after all tasks complete. The same YOLO rationale applies: auto-confirm the base branch and auto-select PR creation per the "Finishing a Development Branch YOLO Override" above.

Additional YOLO behavior:
0. **Pass lifecycle context in args.** When invoking this skill, include all known artifact paths: `plan_file`, `design_doc`, `worktree`, `base_branch`, `issue` (per the Lifecycle Context Object section). The skill uses `plan_file` directly to read the plan instead of discovering it via Glob.
1. If any subagent (implementer, spec reviewer, or code quality reviewer) surfaces questions that would normally require user input, auto-answer them from the implementation plan, design document, and codebase context. Announce each: `YOLO: subagent-driven-development — [question] → [answer from context]`
2. When dispatching implementation subagents, use `model: sonnet` unless the task description contains keywords indicating architectural complexity: "architect", "migration", "schema change", "new data model". For these, use `model: opus`. Announce: `YOLO: subagent-driven-development — Model selection → sonnet (or opus for [keyword])`
3. When dispatching spec review or consumer verification subagents, use `model: sonnet`. These agents compare implementation against acceptance criteria or verify existing code is unchanged — checklist work that does not require deep reasoning.
4. When dispatching Explore agents during implementation, follow the Model Routing Defaults section below (`haiku`).

### Subagent-Driven Development Context Injection

This section applies unconditionally in all modes (YOLO, Express, Interactive). When `subagent-driven-development` is executing the task loop, maintain the Progress Index in the plan file after each task's status changes by running the Edit operations below.

**When starting a task (before dispatching the implementer subagent):**
1. Check if the plan file contains `<!-- PROGRESS INDEX` — if not, skip steps 2–3 below and proceed normally (backward compatibility for plans without an index)
2. Edit the plan file to update the task's STATUS: `pending` → `in-progress`
3. Edit the plan file to update CURRENT: `CURRENT: none` → `CURRENT: Task N` (where N is the task number)

Example edits (starting Task 2):
- old_string: `Task 2: [name] — STATUS: pending`
- new_string: `Task 2: [name] — STATUS: in-progress`
- old_string: `CURRENT: none`
  *(Target only the PROGRESS INDEX block — if this string appears elsewhere in the file, add surrounding context lines from the index block to make old_string unique.)*
- new_string: `CURRENT: Task 2`

**When completing a task (after both spec and code quality reviews pass):**
1. Check if the plan file contains `<!-- PROGRESS INDEX` — if not, skip steps 2–3 below and proceed normally (backward compatibility for plans without an index)
2. Get the final commit SHA: `git rev-parse HEAD`
3. Edit the plan file to update STATUS: `in-progress` → `done (commit [SHA])`
4. Edit the plan file to update CURRENT: `CURRENT: Task N` → `CURRENT: none` (or the next task's number if proceeding immediately)

   > **Note:** If you are proceeding immediately to the next task, set `CURRENT: Task [N+1]` instead of `CURRENT: none` (the "starting a task" protocol above handles this case if run in sequence).

Example edits (completing Task 2 with commit abc1234):
- old_string: `Task 2: [name] — STATUS: in-progress`
- new_string: `Task 2: [name] — STATUS: done (commit abc1234)`
- old_string: `CURRENT: Task 2`
- new_string: `CURRENT: none`

**Task transition batching:** When completing implementation task N and starting task N+1, batch both `TaskUpdate` calls into a single parallel message before dispatching the next implementer subagent: `[TaskUpdate(N, completed), TaskUpdate(N+1, in_progress)]`. This saves one API round-trip per task transition. When N is the last task (no N+1 in the plan), call only `TaskUpdate(N, completed)` — do not batch.

### Implementer Quality Context Injection

This section applies unconditionally in all modes (YOLO, Express, Interactive). When `subagent-driven-development` dispatches implementer subagents, prepend quality context to each implementer's prompt so they write code that follows standards from the start.

**Context injected per implementer subagent:**

1. **Relevant coding standards sections.** Extract the sections from `../../references/coding-standards.md` that apply to the task being implemented, using `<!-- section: slug -->` markers. For example, a task building an API handler gets: `functions`, `error-handling`, `types`, and `naming-conventions`. A task building a UI component gets: `functions`, `types`, `separation-of-concerns`, and `naming-conventions`. Always include `functions` and `types` — they apply universally.

2. **"How to Code This" notes.** Include the per-task notes generated during the Study Existing Patterns step. These map each task to the specific patterns found in the codebase (e.g., "Follow pattern from `src/handlers/users.ts`; error handling uses discriminated union return type").

3. **Anti-patterns found.** Include any anti-patterns flagged during Study Existing Patterns with an explicit instruction: "Do NOT replicate these patterns in new code." This prevents implementers from copying existing bad patterns for consistency.

4. **Quality Constraints from the plan task.** Include the `**Quality Constraints:**` section from the specific plan task being implemented. This gives the implementer concrete constraints: which error handling pattern, which types must be narrow, what function length target, and which file to follow.

5. **Change Design Protocol.** For every file the task modifies (listed in the Quality Constraints `Files modified` field), instruct the implementer to follow this protocol before any Edit call:
   1. **Read the complete file** before any edit. (For very large files >200KB, use Grep to locate relevant sections or Read with offset/limit — this is a read strategy, separate from the design-first threshold.)
   2. **Output a brief change plan:** which functions/sections change, what's added, what's removed, and how the change fits the file's existing structure.
   3. **Write the edit in one pass** — do not edit, run typecheck, re-read, and edit again. If the first edit has issues, re-read the file to understand what went wrong before making a second edit.
   4. For files marked `(design-first)` in Quality Constraints (>150 lines): the change plan in sub-step 2 is **mandatory** and must be output before any Edit tool call on that file.

6. **Git Safety Protocol.** Instruct the implementer to never use history-rewriting git operations:
   - Never use `git commit --amend` — always create a new commit instead (even for wrong messages or forgotten files)
   - Never use `git rebase -i` — leave the commit history as-is; if cleanup is needed, ask the human user
   - Never use `git push --force` or `git push --force-with-lease` — if the situation seems to require it, stop and ask the human user directly
   - This aligns with Claude Code's own git safety protocol: "CRITICAL: Always create NEW commits rather than amending"

**Injection format:**

```
## Quality Context for This Task

### Coding Standards (from ../../references/coding-standards.md)
[Extracted sections relevant to this task]

### How to Code This
[Per-task notes from Study Existing Patterns]

### Anti-Patterns (do NOT replicate)
[Flagged anti-patterns from Study Existing Patterns]

### Quality Constraints (from implementation plan)
[Quality Constraints section from this specific task]

### Change Design Protocol
For each file you modify, follow this protocol:
1. Read the complete file before editing
2. Output your change plan (which functions change, what's added/removed)
3. Write the edit in one pass
4. MANDATORY for design-first files: Output your change plan before ANY Edit call on: [file list]

### Git Safety Protocol
Never use history-rewriting git operations:
- `git commit --amend` — always create a new commit instead (even for wrong messages or forgotten files)
- `git rebase -i` — rewrites history; leave the commit history as-is or ask the user before squashing
- `git push --force` or `git push --force-with-lease` — never use these; if the situation seems to require it, stop and ask the human user directly
If you need to add a forgotten file: `git add <file> && git commit -m "chore: add missing file"`
If the commit message was wrong: create a new commit with a corrective message — do not amend.
If a pre-commit hook failed: fix the underlying issue and create a NEW commit — do not amend.
```

### Model Routing Defaults

**Sonnet-first philosophy:** Default to Sonnet for the entire lifecycle. Escalate to Opus only for phases requiring deep creative or architectural reasoning. This reduces session cost by ~75% with no quality loss on mechanical work (implementation, review, verification, git operations). Evidence: a full lifecycle on Opus costs ~$61; Sonnet-first routing costs ~$27 (source: session analysis in issue #94).

This section applies unconditionally in all modes (YOLO, Express, Interactive). It is the single source of truth for model routing — all other sections reference this table rather than re-stating rules.

**Orchestrator-level phases (main conversation model):**

| Phase | Recommended Model | Rationale |
|-------|-------------------|-----------|
| Brainstorming | `opus` | Creative reasoning, design-level decisions |
| Design document | `opus` | Architectural decisions, trade-off analysis |
| Design verification | `sonnet` | Checklist comparison against codebase |
| Implementation planning | `sonnet` | Structured task decomposition from approved design |
| Study existing patterns | `sonnet` | Pattern extraction (subagents use `haiku`) |
| Implementation (orchestrator) | `sonnet` | Dispatching and reviewing subagent results |
| Self-review | `sonnet` | Checklist-based diff review |
| Code review pipeline | `sonnet` | Dispatching and consolidating agent results |
| CHANGELOG generation | `sonnet` | Mechanical commit parsing |
| Final verification | `sonnet` | Acceptance criteria checking |
| Git operations (commit, PR, issue) | `sonnet` | Mechanical CLI operations |

**Subagent dispatches (Task tool `model` parameter):**

| `subagent_type` | Default Model | Rationale | Override When |
|-----------------|---------------|-----------|---------------|
| `"Explore"` | `haiku` | Read-only operations (Glob, Grep, Read, LS); no advanced reasoning needed | Task requires substantive analysis (e.g., design-verification batch agents making PASS/FAIL/WARNING judgments) — use `sonnet` and document justification inline |
| `"general-purpose"` | `sonnet` | Write access; needs reasoning for implementation | Task involves architectural complexity ("architect", "migration", "schema change", "new data model") — use `opus` |
| `"Plan"` | `sonnet` | Architecture planning requires reasoning | — |
| Spec review / consumer verification | `sonnet` | Checklist comparison work | — |

**Enforcement:** Convention-based via skill instructions. Skills that dispatch Task agents must include the `model` parameter explicitly. The YOLO/Express override section and inline steps reference this table rather than re-stating routing rules.

### Commit Planning Artifacts Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Commit Planning Artifacts Step" section** when reaching this step.

### Copy Env Files Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Copy Env Files Step" section** when reaching this step.

### Study Existing Patterns Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Study Existing Patterns Step" section** when reaching this step.

### Self-Review Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Self-Review Step" section** when reaching this step.

### Code Review Pipeline Step (inline — no separate skill)

This step runs after self-review and before final verification. It dispatches multiple specialized review agents in parallel, auto-fixes findings, and re-verifies until clean. The goal is shipping clean code, not a list of TODOs.

**Prerequisites:**
- At least `superpowers:code-reviewer` must be available (always true — superpowers is required)
- Additional agents from `pr-review-toolkit`, `feature-dev`, and `backend-api-security` are used when available

**Process:**

**Quick fix guard:** If the current scope is Quick fix, skip this entire step. Announce: "Scope is Quick fix — code review pipeline skipped." Proceed to the next lifecycle step.

**Model override:** If the user has requested a specific model for the entire lifecycle (e.g., "use opus for everything" or "use sonnet for everything"), apply that model to all agent dispatches in this code review pipeline, overriding the per-agent defaults in the table.

**Large file handling:** If the branch diff includes files >200KB, instruct review agents to use `git diff [base-branch]...HEAD -- <file>` (where `[base-branch]` is the branch detected in Step 0) for those files instead of reading the full file. The diff contains only the changed sections, which is what reviewers need.

**Scope-based agent selection with stack filtering:** Select which agents to dispatch based on scope tier AND stack relevance. The scope determines the maximum tier. The Reviewer Stack Affinity Table (defined in Pre-Flight Check) determines which agents are relevant for the project's stack.

| Scope | Max Tier | Agents to Dispatch |
|-------|----------|--------------------|
| Quick fix | — | Code review step not included for this scope |
| Small enhancement | 1 | All Tier 1 agents from affinity table where stack matches and plugin is installed |
| Feature | 2 | All Tier 1-2 agents from affinity table where stack matches and plugin is installed |
| Major feature | 3 | All Tier 1-3 agents from affinity table where stack matches and plugin is installed |

**Filtering at dispatch time:** For each reviewer in the affinity table at or below the scope's max tier:
1. Skip reviewers marked `(internal)` — they run inside their parent agent
2. Check if the reviewer's plugin is installed
3. Check if the reviewer's stack affinity includes `*` OR intersects with the project's `stack` list from `.feature-flow.yml`
4. If all conditions met → include in dispatch. Otherwise → skip with log.

The pr-review-toolkit subagent always runs in Phase 1a when pr-review-toolkit is installed and scope ≠ Quick fix — it handles internal agents (`silent-failure-hunter`, `code-simplifier`, `pr-test-analyzer`, `type-design-analyzer`) based on the scope.

#### Phase 0: Deterministic pre-filter

Run deterministic tools before dispatching agents to catch issues that linters can find. Fix those issues first, then pass results as exclusion context to agents so they focus on what linters cannot catch.

**Detection and execution:**

1. **Detect available tools:**
   - TypeScript: check if `tsconfig.json` exists in the project root
   - ESLint: check if `.eslintrc*` or `eslint.config.*` exists, or `eslintConfig` in `package.json`
   - Biome: check if `biome.json` or `biome.jsonc` exists
   If no tools are detected, skip Phase 0 entirely: "No deterministic tools detected — skipping pre-filter."

2. **Run detected tools in parallel:**
   Before running any tool, verify the binary exists in `node_modules/.bin/` (e.g., `node_modules/.bin/tsc` for TypeScript). If the binary is not present, skip that tool with: "[tool] not found in node_modules/.bin/ — skipping. Run npm install first."
   - TypeScript: `./node_modules/.bin/tsc --noEmit 2>&1`
   - ESLint: `./node_modules/.bin/eslint --no-error-on-unmatched-pattern . 2>&1`
   - Biome: `./node_modules/.bin/biome check . 2>&1`
   Timeout: 60 seconds per tool. If a tool times out, log a warning and skip it.

3. **Collect and summarize results:**
   Parse output for file paths and line numbers. Categorize as type errors, lint violations, or anti-pattern violations.

4. **Fix pre-filter findings:**
   Before proceeding to Phase 1a, fix the deterministic findings directly (type errors → fix types, lint errors → auto-fix with `--fix` flag or manual fix). This runs sequentially before agent dispatch to avoid race conditions.

5. **Build exclusion context for Phase 1a/1b:**
   Generate a "Pre-Filter Results" summary to include in each agent's prompt:
   ```
   ## Pre-Filter Results (already caught and fixed — skip these areas)
   - [file:line] [category]: [description]

   Focus your review on issues these tools CANNOT catch:
   logic errors, architectural mismatches, missing edge cases, security vulnerabilities.
   ```
   If no issues were found in the pre-filter, include: "Pre-filter ran clean — no deterministic issues found. Proceed with full review."

#### Phase 1a: pr-review-toolkit Pre-Pass (Gated)

The pr-review-toolkit runs as an isolated subagent **before** report-only agents. This preserves its internal auto-fix behavior while ensuring report-only agents see a consistent codebase.

**Process:**
1. Dispatch pr-review-toolkit subagent (subagent prompt and output format unchanged; execution order changed to sequential pre-pass):

```
Task(
  subagent_type: "general-purpose",
  model: "sonnet",
  description: "Run pr-review-toolkit code review — isolated context",
  prompt: "Use the Skill tool to run pr-review-toolkit:review-pr: Skill(skill: 'pr-review-toolkit:review-pr').

Subagent prompt context for the review:
- Base branch: [base-branch]
- HEAD SHA: [output of git rev-parse HEAD]
- Changed files: [output of git diff --name-only <base-branch>...HEAD]
- Scope: [scope]
- Acceptance criteria: [acceptance criteria from implementation plan tasks]
- Pre-filter results: [Phase 0 output — issues already caught and fixed]
- Anti-patterns to avoid: [from Study Existing Patterns step]
- Reference examples (known-good): [from Study Existing Patterns step]

After the review-pr skill completes, return a structured summary in EXACTLY this format (no other prose):

## PR Review Toolkit Summary

### Auto-Fixed
- [file:line] [what was auto-fixed by the review agents]
(or '(none)' if nothing was auto-fixed)

### Critical
- file: [exact path]
  line: [N]
  rule: [rule name]
  description: [what's wrong]
  fix: |
    [concrete code change]
(or '(none)' if no critical findings)

### Important
[same format as Critical, or '(none)']

### Minor
[same format as Critical, or '(none)']"
)
```

2. Wait for completion
3. Collect its structured summary (Auto-Fixed, Critical, Important, Minor sections)
4. If auto-fixes were made: commit as a single commit:
   ```bash
   git add -A
   git commit -m "fix: pr-review-toolkit auto-fixes"
   ```
   If nothing was auto-fixed: skip commit.
5. The Critical/Important/Minor findings from the summary are passed to Phase 2 for consolidation with report-only agent findings

**Why gated:** The pr-review-toolkit modifies code directly. Running it first ensures Phase 1b agents review the committed state, not stale code.

**Failure handling:** If the pr-review-toolkit subagent fails, skip Phase 1a entirely. Dispatch Phase 1b agents without gating. Announce: "pr-review-toolkit subagent failed — skipping Phase 1a pre-pass. Dispatching report-only agents on current code."

#### Phase 1b: Report-Only Agents (Parallel)

After Phase 1a commits (or is skipped), dispatch all tier-eligible, stack-relevant, report-only agents in a **single parallel message**. Each agent receives:

- The current branch diff (`git diff [base-branch]...HEAD` — includes pr-review-toolkit fixes if Phase 1a ran)
- Its specific checklist from the agent table below
- Pre-filter exclusion context from Phase 0
- Anti-patterns and reference examples from Study Existing Patterns
- **Explicit instruction: "Return findings only. Do NOT modify any files."**

**Structured output requirement:** Instruct each agent to return findings in this format. Findings that do not follow this format will be discarded in Phase 2:

```
- file: [exact file path]
  line: [line number]
  rule: [specific rule name from checklist]
  severity: critical | important | minor
  description: [what's wrong and why]
  fix: |
    [concrete code change — not "consider improving"]
```

Agents must name the specific rule violated from their checklist. Findings without a named rule and concrete fix will be rejected.

| Agent | Plugin | Checklist | Fix Mode | Model | Tier |
|-------|--------|-----------|----------|-------|------|
| `feature-dev:code-reviewer` | feature-dev | (1) Every external call has error handling, (2) inputs validated at system boundaries, (3) no SQL/command injection vectors, (4) race conditions in async code, (5) off-by-one in loops/pagination | **Report** → Claude fixes | sonnet | 2 |
| `superpowers:code-reviewer` | superpowers | (1) Every function ≤30 lines, (2) no nesting >3 levels, (3) guard clauses for error cases, (4) naming matches conventions, (5) no god files >300 lines, (6) all acceptance criteria met | **Report** → Claude fixes | sonnet | 1 |
| `backend-api-security:backend-security-coder` | backend-api-security | (1) Every user input validated before use, (2) auth checked on every route, (3) no secrets in code, (4) CORS configured correctly, (5) rate limiting on public endpoints | **Report** → Claude fixes | opus | 3 |

**Availability check:** Before dispatching, apply the stack filtering logic from the scope-based agent selection section. Announce: "Running N report-only agents in parallel (Tier T — [scope], stack: [stack list])..."

**Agent failure handling:** If any agent fails, skip it and continue. Do not stall the pipeline for a single failure.

#### Phase 2: Conflict Detection

After all Phase 1b agents complete, consolidate findings from both phases and detect conflicts before applying fixes.

**Step 1 — Cross-Phase Finding Merge:**
Collect and merge findings from two sources:
- **Phase 1a** pr-review-toolkit summary (Critical/Important/Minor sections only — Auto-Fixed already committed). These are findings the toolkit identified but did not auto-fix.
- **Phase 1b** report-only agent results. These agents reviewed the code AFTER Phase 1a auto-fixes were committed, so their findings reflect the current state.

Both sources use the same structured format. Merge into a single list before deduplication.

**Malformed subagent response guard:** If the pr-review-toolkit subagent response is missing any of the required sections (`### Auto-Fixed`, `### Critical`, `### Important`, `### Minor`), treat it as a subagent failure: announce "pr-review-toolkit subagent returned a malformed summary — findings from that subagent skipped." and proceed with Phase 1b findings only.

**Step 2 — Reject non-compliant findings:**
- Discard findings missing any required field (`file`, `line`, `rule`, `severity`, `description`, `fix`)
- Discard findings where `fix` contains only commentary ("consider simplifying", "could be improved", "might want to") without concrete code changes
- Announce: "Rejected N findings (M missing required fields, K vague fixes). Proceeding with R valid findings."

**Step 3 — Deduplicate:**
1. Deduplicate by file path + line number — if two agents flag the same location, keep the higher-severity finding
2. If same severity, prefer the more specific agent: `backend-security-coder` > pr-review-toolkit > `feature-dev:code-reviewer` > `superpowers:code-reviewer`

**Step 4 — Detect conflicts:**
Group all remaining findings by file path. Within each file, for each pair of findings:
1. Calculate line range overlap: finding A covers lines `[A.line - 5, A.line + 5]`, finding B covers `[B.line - 5, B.line + 5]`
2. If ranges overlap → conflict detected
3. Resolution: keep the higher-severity finding. If same severity, use agent specificity order above.
4. Log skipped findings: "Conflict at [file:line]: [Agent A] finding (severity) kept, [Agent B] finding (severity) skipped — overlapping line range"

**Output:** A conflict-free, ordered list of findings to apply (Critical first, then Important). Minor issues are logged as informational but not blocking.

#### Phase 3: Single-Pass Fix Implementation

Apply all conflict-free Critical and Important findings in a single coordinated pass:

1. Sort findings by file path, then by line number (descending — apply bottom-up to avoid line number shifts)
2. For each finding, apply the concrete `fix:` code change
3. After all fixes applied, commit as a single commit:
   ```bash
   git add -A
   git commit -m "fix: apply code review fixes"
   ```

If `git commit` fails (non-zero exit): stop. Announce: "Phase 3 commit failed: [error]. Manual intervention required — do not proceed to Phase 4 until resolved."

If no Critical or Important findings exist (all clean or all Minor): skip this commit. Announce: "No review fixes to commit — code was already clean."

Otherwise, announce: "Review fixes committed as single commit (N Critical, M Important findings addressed)."

**Why bottom-up ordering:** When multiple fixes target the same file, applying from the bottom up ensures earlier line numbers remain valid.

#### Phase 4: Targeted re-verification

After review fixes are committed (step above), re-verify **only what was changed** — do not re-run the full review suite.

**Step 1: Determine targeted checks**

From the Phase 3 fix log, identify which targeted checks apply. Multiple checks may apply — run all that apply.

| If this was true in Phase 3… | Run this targeted check |
|------------------------------|-------------------------|
| `pr-test-analyzer` had Critical/Important findings | Run the project test suite |
| `superpowers:code-reviewer` flagged rule 6 ("all acceptance criteria met") | Run `verify-acceptance-criteria` |
| Any *other* reporting agent (not covered by rows above) had Critical/Important findings | Re-dispatch ONLY that specific agent on changed files only (`git diff [base-branch]...HEAD`) |
| `silent-failure-hunter` or `code-simplifier` made direct fixes | Read back the changed files to confirm the fix is correct (no regression, no silent swallow introduced) |
| No Critical/Important findings from any agent (all clean) | Run `verify-acceptance-criteria` only as a baseline sanity check |

*Note: Rows are evaluated top-to-bottom; a more specific row takes precedence over the catch-all (row 3). Multiple non-overlapping rows may apply — run all matching targeted checks.*

**Step 2: Run targeted checks (parallel where possible)**

Run only the targeted checks from Step 1. Announce which checks are being run: "Targeted re-verification: [check list]."

- **Tests:** Detect test runner from project (`package.json` scripts.test → `npm test` | `Cargo.toml` → `cargo test` | `go.mod` → `go test ./...` | `mix.exs` → `mix test` | `pyproject.toml`/`pytest.ini`/`setup.cfg`/`tox.ini` → `python -m pytest` | `deno.json`/`deno.jsonc` → `deno test` | `bun.lockb`/`bun.lock`/`bunfig.toml` → `bun test`). If no runner detected, skip with log: "No test runner detected — skipping." If runner is detected but the binary is not installed (ENOENT / exit code 127), log a warning and skip: "Test binary not installed — skipping test verification." Do not count a missing binary as a test failure. Timeout: 60 seconds — if the suite times out, log a warning and skip (do not count as a failure).
- **verify-acceptance-criteria:** Run the `feature-flow:verify-acceptance-criteria` skill with the plan file path.
- **Agent re-dispatch:** Dispatch only the specific agent(s) that had Critical/Important findings, with `git diff [base-branch]...HEAD` for context. Use the same model as the original Phase 1b dispatch. All re-dispatched agents launch in a single parallel message. If an agent crashes or produces no output, do not treat it as clean — log: "Agent [name] re-dispatch produced no result — listing as unresolved in Phase 5."
- **Read-back verification:** Read the specific files modified by direct-fix agents and confirm the fix is syntactically correct and no regression is visible.

**Step 3: If all targeted checks pass → pipeline is clean**

Announce: "Targeted re-verification clean ([checks run]). Proceeding to Phase 5."

**Step 4: If any targeted check fails → one additional fix pass**

Apply fixes for the remaining failures. Commit: `fix: address re-verification failures`. If this commit fails (non-zero exit), report to the developer and proceed directly to Phase 5 without re-running targeted checks. Re-run the same targeted checks once more.
(This is the final allowed iteration — **maximum 2 total fix-verify iterations**.)

If still failing after this additional pass → report remaining issues to the developer with context for manual resolution. Proceed to Phase 5 — the developer decides whether to fix manually.

**Maximum 2 total fix-verify iterations** after Phase 3 (targeted re-verify → optional 1 additional pass). Stop after 2 iterations — report remaining issues for manual resolution.

#### Phase 5: Report

**Zero-agent guard:** If all tier-selected agents were skipped (plugins unavailable), do not proceed through Phases 1a–4. Announce: "All tier-selected agents for [scope] (Tier T) were unavailable. Code review pipeline could not run — manual review recommended." Skip to Phase 5 and include a warning in the report.

Output a summary:

```
## Code Review Pipeline Results

**Agents dispatched:** N (Tier T — [scope])
**Stack filter:** [stack entries used for filtering]
**Model override:** [None | user-requested: \<model\>]
**Iterations:** M/2

### Fixed (pr-review-toolkit pre-pass)
- [agent] [file:line] [what was auto-fixed]

### Fixed (report-only → single pass)
- [severity] [file:line] [what was fixed]

### Conflicts Resolved
- [file:line] [kept agent] over [skipped agent] — [reason]

### Remaining (Minor — not blocking)
- [file:line] [description]

### Remaining (unfixed after 2 iterations)
- [file:line] [description + context for manual resolution]

**Status:** Clean / N issues remaining
```

*(Turn Bridge Rule applies — call `TaskUpdate` immediately after outputting the code review report.)*

### Generate CHANGELOG Entry Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Generate CHANGELOG Entry Step" section** when reaching this step.

### Comment and Close Issue Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Comment and Close Issue Step" section** when reaching this step.

### Documentation Lookup Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Documentation Lookup Step" section** when reaching this step.

### Final Verification Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Final Verification Step" section** when reaching this step.

### Step 4: Handle Interruptions

**Within the same session:**
- The todo list persists across messages — check it to determine which step is next
- If the user switches topics mid-lifecycle, retain the lifecycle state and resume when they return
- Announce: "Resuming lifecycle. Last completed step: [N]. Next: [N+1]."

**Across sessions (new conversation):**
- Todo lists do not persist across sessions. If the user says "resume the feature lifecycle," ask which feature and which step they were on.
- Check for artifacts from previous sessions: design docs in `docs/plans/`, open GitHub issues, existing worktrees, and branch history to infer progress.

### Step 5: Completion

When all steps are done:

```
Lifecycle complete!

Summary:
- Platform: [web/ios/android/cross-platform]
- Design doc: docs/plans/YYYY-MM-DD-feature.md
- Issue: #[number] (commented and closed) [or "(no issue linked)" if none]
- PR: #[number] → [base branch]
- All acceptance criteria verified

Worktree: [Removed / Still active at .worktrees/feature-name]
[If still active: "Run `git worktree remove .worktrees/feature-name` when done."]

What to do next:
1. Review PR #[number] on GitHub (or request team review)
2. After PR merges to [base branch], verify in [base branch] environment
3. Clean up local branch: `git branch -d feature-name && git fetch --prune`

[List any skipped steps and their risks]
[List any platform-specific notes (e.g., "App store submission pending")]
```

**Decision Log (if YOLO or Express mode was active):**

If the lifecycle ran in YOLO or Express mode, read `../../references/decision-log-templates.md` and append the appropriate decision log template (YOLO or Express) after the standard completion summary. Interactive mode does not produce a decision log.

**Cancellation:** There is no formal YOLO/Express cancellation mechanism. Inline announcements (`YOLO: [skill] — [decision] → [option]` or `Express: [skill] — [decision] → [option]`) serve as an "emergency brake" — the user sees each decision as it's made and can interrupt the lifecycle at any point by sending a message. The lifecycle will pause at the current step, and the user can redirect from there.

## Scope Adjustment Rules

During the lifecycle, the scope may need to change:

- **Upgrade:** Brainstorming reveals more complexity than expected → upgrade from "small enhancement" to "feature" and add missing steps
- **Fast-track upgrade:** Implementation planning or documentation lookup reveals more complexity than expected for a fast-tracked small enhancement → upgrade to "feature" scope, insert brainstorming, design document, design verification, and verify-plan-criteria steps before the current step, and resume from brainstorming
- **Downgrade:** Design verification finds no conflicts, spike confirms everything works → keep the steps but move through them quickly
- **Add spike:** Design verification reveals risky unknowns → insert a spike step before continuing

When adjusting, announce: "Adjusting scope from [old] to [new]. Adding/removing steps: [list]."

## Quality Rules

- **One step at a time.** Never run two lifecycle steps in parallel.
- **Skill invocation is mandatory.** Always invoke the mapped skill — do not perform the step manually and claim it's done.
- **Output verification.** Each step must produce its expected output before marking complete.
- **No silent skips.** If a step is skipped, it must be acknowledged with a reason.
- **Scope can change.** The lifecycle adapts to what is discovered during execution.
- **Platform context is loaded once.** Read `.feature-flow.yml` at the start; pass context to skills that need it.

## Additional Resources

### Reference Files

For detailed scope classification guidance and step descriptions:
- **`references/scope-guide.md`** — Detailed criteria for classifying work scope, with examples and edge cases

For project context and platform-specific lifecycle adjustments:
- **`../../references/project-context-schema.md`** — Schema for `.feature-flow.yml`
- **`../../references/platforms/mobile.md`** — Mobile lifecycle adjustments, required sections, beta testing checklist
- **`../../references/platforms/web.md`** — Web lifecycle adjustments
