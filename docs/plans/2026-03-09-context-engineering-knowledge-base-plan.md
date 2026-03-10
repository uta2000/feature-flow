# Context Engineering & Knowledge Base Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-feature `FEATURE_CONTEXT.md` to persist curated decisions across sessions, with automatic archival of stale entries and pre-flight loading in the start skill.

**Architecture:** A lightweight markdown template committed at worktree root. The start skill's Step 0 pre-flight loads, archives, and injects the file into the lifecycle context. No new skills, no new dependencies — all logic lives in existing reference files.

**Tech Stack:** Markdown files only (skill instructions). No executable code.

---

### Task 1: Create FEATURE_CONTEXT.md Template Reference File

**Files:**
- Create: `skills/start/references/feature-context-template.md`

**Step 1: Create the template file**

Create `skills/start/references/feature-context-template.md` with this exact content:

```markdown
# Feature Context

> Auto-managed by feature-flow. Decisions older than 14 days are archived to DECISIONS_ARCHIVE.md.

## Key Decisions

<!-- Add decisions as they're made. Format: - [YYYY-MM-DD] Decision text -->

## Open Questions

<!-- Optional: unresolved questions to revisit next session -->

## Notes

<!-- Optional: discoveries, gotchas, links -->
```

**Step 2: Verify file exists with correct content**

Read `skills/start/references/feature-context-template.md` and confirm:
- Contains `## Key Decisions` section
- Contains `## Open Questions` section
- Contains `## Notes` section
- Auto-managed comment is present

**Step 3: Commit**

```bash
git add skills/start/references/feature-context-template.md
git commit -m "feat: add FEATURE_CONTEXT.md template reference file (GH165)"
```

---

### Task 2: Add `knowledge_base` Schema to project-context-schema.md

**Files:**
- Modify: `references/project-context-schema.md`

**Step 1: Add `knowledge_base` YAML field to the schema block**

In `references/project-context-schema.md`, find the `notifications` block in the schema YAML (around line 27):

```yaml
notifications:          # Optional: notification preference written by start skill
  on_stop: bell         # bell | desktop | none
```

Add immediately after it:

```yaml
knowledge_base:         # Optional: per-feature context file settings
  max_lines: 150        # Archive oldest decisions when file exceeds this line count (default: 150)
  stale_days: 14        # Archive decisions older than this many days (default: 14)
```

**Step 2: Add `knowledge_base` field documentation section**

Find the `### notifications` section (near the end of the Fields section). After the closing paragraph of `notifications`, add this new section:

```markdown
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
```

**Step 3: Update "How Skills Use This File" — start section**

Find the `### start (reads + writes)` section. It ends with a bullet about `notifications.on_stop`. Append after the last bullet:

```markdown
- **Reads** `knowledge_base.max_lines` and `knowledge_base.stale_days` to configure FEATURE_CONTEXT.md archival thresholds (defaults: 150 lines, 14 days).
- **Loads** `FEATURE_CONTEXT.md` from the worktree root on pre-flight: archives stale decisions, injects remaining content into the lifecycle context, and prints a resume notice.
```

**Step 4: Verify the schema changes**

Read `references/project-context-schema.md` and confirm:
- `knowledge_base` YAML block appears in the schema section
- `### knowledge_base` section exists with the sub-fields table
- The `### start` section mentions reading `knowledge_base.*` fields

**Step 5: Commit**

```bash
git add references/project-context-schema.md
git commit -m "feat: add knowledge_base schema to project-context-schema (GH165)"
```

---

### Task 3: Add Knowledge Base Pre-Flight Block to project-context.md

**Files:**
- Modify: `skills/start/references/project-context.md`

**Step 1: Append the Knowledge Base Pre-Flight section**

`skills/start/references/project-context.md` currently ends after the `## Notification Preference` section (line 172). Append this new section at the end of the file:

```markdown
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
4. Count remaining `## Key Decisions` bullet entries → N

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
```

**Step 2: Verify the addition**

Read `skills/start/references/project-context.md` and confirm:
- `## Knowledge Base Pre-Flight` section exists after `## Notification Preference`
- Archival algorithm steps are present (a through f)
- Edge cases are listed
- `context.feature_context` assignment is present
- YOLO and Express behaviors are documented

**Step 3: Commit**

```bash
git add skills/start/references/project-context.md
git commit -m "feat: add knowledge base pre-flight block to start skill Step 0 (GH165)"
```

---

### Task 4: Add FEATURE_CONTEXT.md Creation to Worktree Setup

**Files:**
- Modify: `skills/start/SKILL.md`

**Step 1: Find the worktree setup override line**

In `skills/start/SKILL.md`, find the Worktree setup row in the Skill Mapping table (around line 642):

```
| Worktree setup | `superpowers:using-git-worktrees` | Isolated worktree created. **Override:** When checking for existing worktree directories, use `test -d` instead of `ls -d` ...
```

**Step 2: Append FEATURE_CONTEXT.md creation instruction to the override**

Extend the existing override text in that table cell. After the sentence about `ls -d` (ending with `"not found"`.`), add:

```
 **After worktree creation:** Create `FEATURE_CONTEXT.md` in the worktree root using the template from `skills/start/references/feature-context-template.md`. Include it in the initial branch commit: `git add FEATURE_CONTEXT.md && git commit -m "chore: init FEATURE_CONTEXT.md"`.
```

**Step 3: Verify the addition**

Read the modified row in `skills/start/SKILL.md` and confirm the override text now includes both the `test -d` instruction and the `FEATURE_CONTEXT.md` creation instruction.

**Step 4: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: create FEATURE_CONTEXT.md at worktree setup (GH165)"
```

---

### Task 5: Update CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md`

**Step 1: Read the top of CHANGELOG.md to understand the format**

Read `CHANGELOG.md` lines 1–30 to understand the version/entry format.

**Step 2: Add a new version entry**

Bump the patch version (current: 1.24.0 → new: 1.24.1) and add an entry at the top:

```markdown
## 1.24.1

### Added
- **Context Engineering & Knowledge Base (GH165):** Per-feature `FEATURE_CONTEXT.md` persists curated decisions across sessions. The start skill's Step 0 pre-flight loads the file, archives decisions older than 14 days (or when the file exceeds 150 lines), injects remaining decisions into the lifecycle context, and prints a resume notice. `FEATURE_CONTEXT.md` is created automatically at worktree setup. Configurable via `.feature-flow.yml` `knowledge_base.max_lines` and `knowledge_base.stale_days`.
```

**Step 3: Update plugin_version in plugin.json**

Read `.claude-plugin/plugin.json`, find the `version` field, and update it from `1.24.0` to `1.24.1`.

**Step 4: Verify changes**

- Read top of `CHANGELOG.md` — confirm 1.24.1 entry exists
- Read `.claude-plugin/plugin.json` — confirm version is `1.24.1`

**Step 5: Commit**

```bash
git add CHANGELOG.md .claude-plugin/plugin.json
git commit -m "chore: bump version to 1.24.1"
```
