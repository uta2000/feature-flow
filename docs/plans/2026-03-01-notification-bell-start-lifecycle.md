# Notification Bell — Start Lifecycle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a notification preference prompt to the `start:` lifecycle that alerts users (via terminal bell or macOS desktop notification) when Claude Code stops and needs input.

**Architecture:** Insert a "Notification Preference" subsection into `skills/start/SKILL.md` after the Session Model Recommendation (end of Step 0), before Step 1. The feature reads/writes a `notifications.on_stop` field in `.feature-flow.yml` for persistence, and writes a `Stop` hook to `~/.claude/settings.json` when bell/desktop is selected. Document the new schema field in `references/project-context-schema.md`.

**Tech Stack:** Markdown skill documentation, YAML config, macOS `osascript` shell commands, Claude Code `settings.json` hooks format.

---

### Task 1: Add Notification Preference section to `skills/start/SKILL.md`

**Files:**
- Modify: `skills/start/SKILL.md` (design-first — 1577 lines)

**Acceptance Criteria:**
- [ ] A "Notification Preference" subsection exists in Step 0, positioned after "Session Model Recommendation" and before "### Step 1: Determine Scope"
- [ ] The section checks `.feature-flow.yml` `notifications.on_stop` field first; if present and non-empty, it skips the prompt and applies the saved preference
- [ ] The prompt offers exactly 3 options via `AskUserQuestion`: no notifications, terminal bell, desktop notification
- [ ] Terminal bell command is `osascript -e 'beep 2'`; desktop notification command uses `display notification` with `sound name \"Glass\"`
- [ ] If `bell` or `desktop` is selected: skill checks `~/.claude/settings.json` for an existing notification Stop hook before writing to avoid duplicates
- [ ] If `bell` or `desktop` is selected: skill writes the Stop hook to `~/.claude/settings.json` and persists preference in `.feature-flow.yml` as `notifications.on_stop: bell` or `desktop`
- [ ] YOLO/Express behavior: skip prompt, check `.feature-flow.yml` for saved preference; if absent, default to `none`. Announce: `YOLO: start — Notification preference → [loaded: value | no preference, defaulting to none]`
- [ ] macOS-only guard: if `$OSTYPE` does not match `darwin*`, skip the prompt entirely with announcement: `"Notification preference skipped — osascript only available on macOS."`
- [ ] Edge case: if `~/.claude/settings.json` does not exist, create it with the hook; if it exists, merge into the existing `hooks.Stop` array without overwriting other hooks
- [ ] Edge case: if `~/.claude/settings.json` cannot be written (permission error), log the error and continue; do not block lifecycle

**Quality Constraints:**
- Error handling: shell command failures (osascript, settings.json write) must be caught and logged; do not raise or halt lifecycle
- No new YOLO/Express behaviors should be introduced outside the section — keep the scope tight
- Function length: not applicable (markdown), but each behavioral block should be clearly delimited
- Pattern: follow the "Session Model Recommendation" and "Base Branch Detection" subsections for structure (YOLO/Express behavior at the bottom of the subsection)
- Files modified: `skills/start/SKILL.md` (design-first — output change plan before editing)

**Step 1: Output change plan before editing**

Before any Edit call, output:
- Exact insertion point: after the line `**Express behavior:** Same as Interactive — show the \`AskUserQuestion\` prompt. Express auto-selects decisions but model switching requires user action (\`/model\` command), so it must pause.` (line ~200)
- Before: `### Step 1: Determine Scope`
- What is added: a new `**Notification Preference:**` subsection (~50 lines of markdown)
- No existing content is modified; this is a pure insertion

**Step 2: Write the acceptance-criteria grep check (pre-edit baseline)**

Run:
```bash
grep -n "Notification Preference" skills/start/SKILL.md | wc -l
```
Expected: `0` (section does not yet exist)

**Step 3: Insert the Notification Preference section**

Using the Edit tool, insert the following after the Express behavior line for Session Model Recommendation and before `### Step 1: Determine Scope`:

```markdown
**Notification Preference:**

After the Session Model Recommendation, check whether the user wants to be notified when Claude Code stops and waits for input. This fires the preference prompt once per lifecycle session (or skips it if a saved preference exists).

**macOS guard:** If `$OSTYPE` does not match `darwin*`, skip this subsection entirely and announce: `"Notification preference skipped — osascript only available on macOS."`

**Check for saved preference:**
1. Read `.feature-flow.yml` `notifications.on_stop` field (if present)
2. If present and non-empty (`bell`, `desktop`, or `none`):
   - Announce: `"Notification preference loaded from .feature-flow.yml: [value] — skipping prompt."`
   - If `bell` or `desktop`: apply the saved preference by checking/writing the Stop hook (see below)
   - Skip the prompt entirely
3. If absent: proceed to the preference prompt

**Preference prompt (when no saved preference):**

Use `AskUserQuestion`:
- Question: `"Notify me when Claude needs your input? (fires on every Stop event while the lifecycle runs)"`
- Option 1: `"No notifications"` with description: `"(Default) No sound or banner — you check the terminal manually"`
- Option 2: `"Terminal bell"` with description: `"Runs: osascript -e 'beep 2' — a simple system beep when Claude pauses"`
- Option 3: `"Desktop notification"` with description: `"Runs: display notification 'Claude Code needs your attention' — banner with Glass sound"`

**After selection (or applying saved preference):**

- **If `none`:** Announce: `"No notifications — continuing."` Do not write any hook.
- **If `bell` or `desktop`:**
  1. Read `~/.claude/settings.json` — check if a Stop hook already contains `osascript` for notification (substring match on `beep` or `display notification`). If found: skip writing, announce: `"Existing notification hook found in ~/.claude/settings.json — reusing."`
  2. If not found: write the Stop hook to `~/.claude/settings.json` by merging into the existing `hooks.Stop` array (create the file if absent):
     - Bell: `{ "type": "command", "command": "osascript -e 'beep 2'" }`
     - Desktop: `{ "type": "command", "command": "osascript -e 'display notification \"Claude Code needs your attention\" with title \"Claude Code\" sound name \"Glass\"'" }`
     - If the file cannot be written (permission error), log the error and continue — do not block the lifecycle
  3. Write `notifications.on_stop: [bell|desktop]` to `.feature-flow.yml` so future sessions skip the prompt
  4. Announce: `"Notification preference saved ([bell|desktop]). Stop hook written to ~/.claude/settings.json."`

**YOLO behavior:** Skip the prompt. Check `.feature-flow.yml` for `notifications.on_stop` — if present, apply it silently. If absent, default to `none` (no hook written). Announce: `YOLO: start — Notification preference → [loaded: value | no preference, defaulting to none]`

**Express behavior:** Same as YOLO — skip the prompt, use saved preference or default to `none`.

```

**Step 4: Verify insertion**

Run:
```bash
grep -n "Notification Preference" skills/start/SKILL.md
```
Expected: at least 1 match with "Notification Preference" in the output.

```bash
grep -n "osascript" skills/start/SKILL.md | head -5
```
Expected: multiple matches showing bell and desktop notification commands.

**Step 5: Verify placement**

Run:
```bash
grep -n "Notification Preference\|Session Model Recommendation\|Step 1: Determine Scope" skills/start/SKILL.md
```
Expected: "Session Model Recommendation" line number < "Notification Preference" line number < "Step 1: Determine Scope" line number.

**Step 6: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat(start): add notification preference prompt after session model recommendation"
```

---

### Task 2: Document `notifications` field in `references/project-context-schema.md`

**Files:**
- Modify: `references/project-context-schema.md` (design-first — 194 lines)

**Acceptance Criteria:**
- [ ] A `### \`notifications\`` section exists in `references/project-context-schema.md`
- [ ] The section documents `on_stop: bell | desktop | none` as the only supported sub-field
- [ ] The section includes a YAML example showing `notifications:\n  on_stop: bell`
- [ ] The section notes it is written by `start` when the user selects a preference and read by `start` to skip the prompt on subsequent invocations
- [ ] The schema YAML block at the top of the file includes `notifications` as an optional field with a comment
- [ ] Edge case: `on_stop: none` is a valid value (user explicitly chose no notifications) and is distinct from the field being absent (not yet prompted)

**Quality Constraints:**
- Pattern: follow existing field sections (`default_branch`, `types_path`) for structure — short description, "When needed" note, YAML example, "Format" note
- Files modified: `references/project-context-schema.md` (design-first — output change plan before editing)

**Step 1: Output change plan before editing**

Before any Edit call, output:
- Where the new `### \`notifications\`` section will be inserted: after the `### \`default_branch\`` section (end of file, before "## How Skills Use This File")
- What is added: ~20 lines for the new field section + 2 lines added to the schema YAML block at the top
- The schema YAML at the top of the file will gain: `notifications:\n  on_stop: bell  # bell | desktop | none`

**Step 2: Write the acceptance-criteria grep check (pre-edit baseline)**

Run:
```bash
grep -n "notifications" references/project-context-schema.md | wc -l
```
Expected: `0` (field not yet documented)

**Step 3: Add `notifications` to the schema YAML block**

Using the Edit tool, add `notifications.on_stop` to the schema YAML example near the top of the file (after `default_branch`):

```yaml
notifications:          # Optional: notification preference written by start skill
  on_stop: bell         # bell | desktop | none
```

**Step 4: Add the `### \`notifications\`` field section**

Insert after the `### \`default_branch\`` section and before `## How Skills Use This File`:

```markdown
### `notifications`

Optional notification preference for the `start:` lifecycle. When set, `start` skips the notification prompt on subsequent invocations and applies the saved preference directly.

**Sub-fields:**

| Field | Values | Description |
|-------|--------|-------------|
| `on_stop` | `bell \| desktop \| none` | Notification type fired when Claude Code stops and waits for input |

**When set:** After the user answers the Notification Preference prompt in Step 0 of `start:`. Also set when the user confirms a non-`none` preference (bell or desktop) so the Stop hook is already configured in `~/.claude/settings.json`.

**When absent:** `start` presents the Notification Preference prompt during Step 0 pre-flight (on macOS only). If the user selects `none`, the field is not written (absent = no saved preference OR explicitly declined during a session that didn't persist it). If the user selects `bell` or `desktop`, the field is written to avoid re-prompting.

**Format:** Nested mapping.

```yaml
notifications:
  on_stop: bell    # terminal bell (osascript -e 'beep 2')
  # on_stop: desktop  # banner + Glass sound
  # on_stop: none     # explicitly no notifications
```

**macOS-only:** The notification commands use `osascript`. On non-macOS systems, `start` skips the prompt and does not write this field.
```

**Step 5: Verify**

Run:
```bash
grep -n "notifications\|on_stop" references/project-context-schema.md
```
Expected: multiple matches covering the schema YAML block and the new field section.

**Step 6: Commit**

```bash
git add references/project-context-schema.md
git commit -m "docs(schema): add notifications.on_stop field documentation"
```
