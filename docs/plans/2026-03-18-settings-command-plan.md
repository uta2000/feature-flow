# /settings Slash Command Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Document tool_selector in schema — STATUS: pending
Task 2: Add yolo.stop_after to schema — STATUS: pending
Task 3: Create settings SKILL.md — STATUS: pending
Task 4: Add stop_after checkpoint to start skill — STATUS: pending
CURRENT: none
-->

> **For Claude:** Read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.
> Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

**Goal:** Add a `/settings` slash command that provides an interactive dashboard for managing `.feature-flow.yml` configuration, plus a new `yolo.stop_after` field for configurable YOLO stopping points.

**Architecture:** New skill file `skills/settings/SKILL.md` containing all dashboard, editing, and validation logic. Schema documentation updates in `references/project-context-schema.md`. Integration point in `skills/start/SKILL.md` for YOLO checkpoint logic. No code files — this is entirely markdown-based skill definition.

**Tech Stack:** Claude Code plugin system (SKILL.md markdown skills), YAML configuration

---

### Task 1: Document `tool_selector` in project-context-schema.md

**Files:**
- Modify: `references/project-context-schema.md`

**Acceptance Criteria:**
- [ ] `tool_selector` section exists in `references/project-context-schema.md` between `gotchas` and `types_path` sections
- [ ] Documents all 3 sub-fields: `enabled` (boolean, default true), `confidence_threshold` (float 0-1, default 0.7), `auto_launch_gsd` (boolean, default false)
- [ ] Includes format example matching the live `.feature-flow.yml` structure
- [ ] "How Skills Use This File" section includes a `settings (reads + writes)` entry

**Quality Constraints:**
- Pattern: follow existing field documentation style in `references/project-context-schema.md` (see `notifications` or `knowledge_base` sections for nested field examples)
- Parallelizable: yes

**Step 1:** Read `references/project-context-schema.md` and find the insertion point — after the `gotchas` section (line ~139) and before `types_path` (line ~140).

**Step 2:** Add a `### tool_selector` section documenting all 3 sub-fields. Follow the same pattern as `notifications` and `knowledge_base` — sub-fields table, format example, when needed/absent notes.

```markdown
### `tool_selector`

Optional configuration for the GSD vs feature-flow tool recommendation engine. Controls whether the tool selector runs during `start:` Step 0, the confidence threshold for recommending GSD, and whether to auto-launch GSD without asking.

**Sub-fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable intelligent tool selection during `start:` |
| `confidence_threshold` | float (0-1) | `0.7` | Only recommend GSD if calculated confidence >= this threshold |
| `auto_launch_gsd` | boolean | `false` | If true, launch GSD automatically when recommended without asking the user |

**Format:**

```yaml
tool_selector:
  enabled: true
  confidence_threshold: 0.7
  auto_launch_gsd: false
```

**When absent:** Defaults to enabled with threshold 0.7 and auto-launch off. The field is never auto-written; it is only used when manually added or modified via `/settings`.
```

**Step 3:** Add a `### settings (reads + writes)` entry at the end of the "How Skills Use This File" section:

```markdown
### settings (reads + writes)
- **Reads** all user-editable fields to display the settings dashboard.
- **Writes** any field the user changes via the interactive edit flow.
- **Reads** `plugin_version` to display the version header (non-editable).
```

**Step 4:** Commit.

```bash
git add references/project-context-schema.md
git commit -m "docs: document tool_selector field in project-context-schema"
```

---

### Task 2: Add `yolo.stop_after` to project-context-schema.md

**Files:**
- Modify: `references/project-context-schema.md`

**Acceptance Criteria:**
- [ ] `yolo` section exists in `references/project-context-schema.md` with `stop_after` sub-field documented
- [ ] Documents valid values: `brainstorming`, `design`, `verification`, `plan`
- [ ] Documents behavior: when absent (full YOLO), when empty list (same as absent), invalid values silently ignored
- [ ] Schema example block at top of file includes `yolo.stop_after` field

**Quality Constraints:**
- Pattern: follow existing field documentation style (see `knowledge_base` for nested field with list values)
- Parallelizable: yes

**Step 1:** Read `references/project-context-schema.md` and find the insertion point — after the `design_preferences` section (near end of Fields section).

**Step 2:** Add a `### yolo` section:

```markdown
### `yolo`

Optional YOLO mode configuration. Controls behavior during unattended (`--yolo`) lifecycle runs.

**Sub-fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `stop_after` | list of strings | `[]` (empty) | Phases where YOLO pauses for user review before continuing |

**Valid `stop_after` values:**

| Value | Pauses After |
|-------|-------------|
| `brainstorming` | Brainstorming phase completes — user reviews design decisions |
| `design` | Design document is written — user reviews the design |
| `verification` | Design verification runs — user reviews blockers/warnings |
| `plan` | Implementation plan is created — user reviews task breakdown |

**Format:**

```yaml
yolo:
  stop_after:
    - design
    - plan
```

**When absent:** Full YOLO — no stopping points (default behavior unchanged).

**When empty list `[]`:** Same as absent — full YOLO.

**Invalid values:** Silently ignored. Only the 4 valid values trigger checkpoints.

**Checkpoint behavior:** When a listed phase completes, the `start` skill orchestrator pauses and presents the phase output via `AskUserQuestion` with options to continue YOLO or switch to Interactive mode.
```

**Step 3:** Update the schema example block at the top of the file to include `yolo.stop_after`.

**Step 4:** Commit.

```bash
git add references/project-context-schema.md
git commit -m "docs: add yolo.stop_after field to project-context-schema"
```

---

### Task 3: Create `skills/settings/SKILL.md`

**Files:**
- Create: `skills/settings/SKILL.md`

**Acceptance Criteria:**
- [ ] File exists at `skills/settings/SKILL.md`
- [ ] Has valid YAML frontmatter with `name: settings`, `description` starting with "View and manage Feature-flow settings", and `tools: Read, Edit, Bash, AskUserQuestion, Glob, Grep`
- [ ] Contains dashboard display logic that reads `.feature-flow.yml` and outputs all 9 settings with current values
- [ ] Dashboard shows `feature-flow v[version]` header from `plugin_version` field
- [ ] Category selection uses AskUserQuestion with 4 options: Workflow, Design, Advanced, Done
- [ ] Each category's setting selection uses AskUserQuestion with ≤4 options
- [ ] All 9 settings have documented edit UIs: YOLO stops (multi-select), notifications (single-select: bell/desktop/none), default branch (branches + clear), git strategy (merge/rebase), design preferences (pick one + reset all), tool selector (3-step: enabled/threshold/auto_launch), Context7 (add/remove), CI timeout (presets), KB limits (two-step)
- [ ] Save-and-return loop documented: save → return to category → back to dashboard → done exits
- [ ] Notification side-effect documented: writes Stop hook to `~/.claude/settings.json`
- [ ] Error handling documented: missing file (create with defaults), malformed YAML (warn + offer recreate), edit failures (fallback to Write)
- [ ] Missing `.feature-flow.yml` handling creates file with defaults before showing dashboard

**Quality Constraints:**
- Pattern: follow existing skill frontmatter and structure from `skills/spike/SKILL.md` and `skills/create-issue/SKILL.md`
- Error handling: warn-and-continue pattern (match existing skills — log error, continue lifecycle)
- Parallelizable: yes

**Step 1:** Create `skills/settings/` directory.

```bash
mkdir -p skills/settings
```

**Step 2:** Write `skills/settings/SKILL.md` with the full skill definition. The file must contain:

1. **YAML frontmatter** — name, description, tools
2. **Title and announce** — `# Settings` + announce text
3. **When to Use** section
4. **Process** section with Steps 1-5:
   - Step 1: Read `.feature-flow.yml` (or create if missing), extract all values, display dashboard text, present category AskUserQuestion
   - Step 2: Based on selected category, display that category's current values and present setting AskUserQuestion
   - Step 3: Based on selected setting, present the edit UI (varies per setting — multi-select for YOLO stops, single-select for most others, multi-step for tool selector and KB limits)
   - Step 4: Validate and write the change using Edit tool (with Write fallback)
   - Step 5: Return to category view (or dashboard if "Back", or exit if "Done")
5. **Setting definitions** — A reference table mapping each setting to its YAML path, current value display format, and edit UI specification
6. **Special cases** — Notifications hook side-effect, default branch clearing, design preferences reset
7. **Error handling** section
8. **Quality Rules** section

**Step 3:** Commit.

```bash
git add skills/settings/SKILL.md
git commit -m "feat: add /settings slash command skill for interactive config management"
```

---

### Task 4: Add `stop_after` checkpoint logic to start skill

**Files:**
- Modify: `skills/start/SKILL.md`

**Acceptance Criteria:**
- [ ] A "YOLO Stop-After Checkpoint" section exists in `skills/start/SKILL.md`
- [ ] The section documents reading `yolo.stop_after` from `.feature-flow.yml` during Step 0
- [ ] The checkpoint logic is specified for the Step 3 execution loop: after each YOLO-eligible phase (brainstorming, design document, design verification, implementation plan), check if the phase name is in `stop_after`
- [ ] If matched, an AskUserQuestion is presented with 2 options: "Continue YOLO" and "Switch to Interactive"
- [ ] The checkpoint announces: `YOLO: checkpoint — [phase] → paused for review`
- [ ] Phase-to-step mapping is documented: `brainstorming` → after brainstorming skill completes, `design` → after design-document skill completes, `verification` → after design-verification skill completes, `plan` → after writing-plans skill completes
- [ ] When `stop_after` is absent or empty, no checkpoints fire (existing behavior preserved)

**Quality Constraints:**
- Pattern: follow existing YOLO override patterns in `skills/start/references/yolo-overrides.md`
- Files modified: `skills/start/SKILL.md` (design-first — 817 lines)
- Parallelizable: no (depends on understanding full SKILL.md structure)

**Step 1:** Read `skills/start/SKILL.md` and find the Step 3 execution loop (around line 570). Also find the YOLO/Express Overrides reference section (around line 689).

**Step 2:** Add a new subsection after the "YOLO/Express Overrides" section titled "### YOLO Stop-After Checkpoints". This section documents:

1. **Reading config:** During Step 0 (in `references/project-context.md`), after loading `.feature-flow.yml`, extract `yolo.stop_after` list. If absent or empty, set to empty list (no checkpoints).

2. **Phase mapping table:**

| `stop_after` value | Lifecycle step | Fires after |
|---------------------|---------------|-------------|
| `brainstorming` | Brainstorm requirements | brainstorming skill returns |
| `design` | Design document | design-document skill returns |
| `verification` | Design verification | design-verification skill returns |
| `plan` | Implementation plan | writing-plans skill returns |

3. **Checkpoint behavior:** In the Step 3 execution loop, after a YOLO-eligible phase completes (between sub-steps 4 "Confirm completion" and 5 "Mark complete"):

```
if yolo_mode AND current_phase_name in config.yolo.stop_after:
    Present via AskUserQuestion:
      "YOLO checkpoint: [phase] complete. Review the output above. Continue?"
      - "Continue YOLO" — resume unattended execution
      - "Switch to Interactive" — disable YOLO for all remaining phases
    Announce: "YOLO: checkpoint — [phase] → paused for review"
```

4. **Express behavior:** Express mode does NOT honor `stop_after` — Express already has its own design approval checkpoint. `stop_after` is YOLO-only.

**Step 3:** Also add a line in the Step 0 summary (around line 425-428) noting that `yolo.stop_after` is read during project context loading.

**Step 4:** Commit.

```bash
git add skills/start/SKILL.md
git commit -m "feat: add YOLO stop_after checkpoint logic to start skill execution loop"
```

---

Plan complete and saved to `docs/plans/2026-03-18-settings-command-plan.md`.

**Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach?