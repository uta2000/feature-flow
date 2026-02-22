# Rename `start-feature` to `start` — Design Document

**Date:** 2026-02-21
**Status:** Draft
**Issue:** #53

## Overview

Rename the primary entry point skill from `start-feature` to `start` and add a getting-started hint (with `--yolo` flag) to the SessionStart hook messages. The word "feature" is redundant — the plugin is called feature-flow, the skill handles non-features (bug fixes, quick fixes), and brevity matters for a command typed every session. The getting-started hint tells new users the exact syntax to type.

## User Flow

### Step 1 — User starts a session

SessionStart hook fires. The user sees one of two messages depending on whether `.feature-flow.yml` exists.

**First-time projects (no `.feature-flow.yml`):**
```
FEATURE-FLOW is installed. [...existing copy...] Type "start: <your idea, issue, or bug>" to get started. Add --yolo to auto-select defaults.
```

**Returning projects (`.feature-flow.yml` exists):**
```
FEATURE-FLOW DEVELOPMENT ACTIVE: Use start: to begin any non-trivial work [...existing copy...] Type "start: <description>" or "start: <description> --yolo" to begin.
```

### Step 2 — User types the command

```
start: add CSV export
start: fix the login crash --yolo
start: https://github.com/org/repo/issues/42
```

### Step 3 — Skill triggers

Claude matches the trigger phrases in the `start` skill's description and invokes it. Old trigger phrases ("start a feature", "build a feature", etc.) continue to work as aliases.

## Changes to `skills/start-feature/SKILL.md`

### 1. Directory rename

- `skills/start-feature/` → `skills/start/`
- `skills/start-feature/references/` → `skills/start/references/` (moves automatically with parent)

### 2. Frontmatter update

```yaml
# Before
name: start-feature
description: This skill should be used when the user asks to "start a feature", ...

# After
name: start
description: This skill should be used when the user asks to "start:", "start a feature", "build a feature", "implement a feature", "new feature", "start working on", "I want to build", "let's build", "add a feature", or at the beginning of any non-trivial development work. ...
```

### 3. YOLO announcement prefixes

All `YOLO: start-feature —` → `YOLO: start —`. Affected lines (approximate, from current file):
- Line 113: Stack cross-check announcement
- Line 131: Platform/stack detection announcement
- Line 150: Base branch detection announcement
- Line 234: Scope + mode announcement
- Line 895: CHANGELOG version heading announcement
- Line 925: CHANGELOG entry announcement

### 4. YOLO decision log tables

All `| N | start-feature |` → `| N | start |` in the completion summary templates (lines ~1133, 1176-1180).

### 5. Error messages

- `Then re-run start-feature.` → `Then re-run start.` (line ~24)

### 6. Usage examples

- `start feature: add CSV export --yolo` → `start: add CSV export --yolo` (line ~97 and similar)

## Changes to `hooks/hooks.json`

### 1. SessionStart `if` branch (`.feature-flow.yml` exists)

- `Use start-feature to begin any non-trivial work` → `Use start: to begin any non-trivial work`
- `Run start-feature to auto-detect` → `Run start: to auto-detect`
- Append at end: `Type "start: <description>" or "start: <description> --yolo" to begin.`

### 2. SessionStart `else` branch (first-time)

- `"start feature: add user notifications"` → `"start: add user notifications"`
- Append at end: `Type "start: <your idea, issue, or bug>" to get started. Add --yolo to auto-select defaults.`

### 3. Upgrade notice

- `Run start-feature to auto-detect` → `Run start: to auto-detect`

## Changes to `README.md`

| Line(s) | Before | After |
|---------|--------|-------|
| 3 | `"start feature: add user notifications"` | `"start: add user notifications"` |
| 61 | `start feature: add user notifications` | `start: add user notifications` |
| 78, 86 | `start feature: add user notifications --yolo` | `start: add user notifications --yolo` |
| 105 | `start-feature` orchestrator | `start` orchestrator |
| 132 | `\| \`start-feature\`` | `\| \`start\`` |
| 158 | `start-feature` is the recommended entry point | `start` is the recommended entry point |
| 168 | `same auto-discovery flow as \`start-feature\`` | `same auto-discovery flow as \`start\`` |
| 209 | `\`start-feature\` auto-detects` | `\`start\` auto-detects` |
| 237 | `\`start-feature\` scans your project files` | `\`start\` scans your project files` |

## Changes to `references/project-context-schema.md`

5 references to `start-feature` → `start`:
- Line 3: `start-feature` auto-detects → `start` auto-detects
- Line 62: Step 0 of `start-feature` → Step 0 of `start`
- Line 80: `start-feature` queries → `start` queries
- Line 118: used by `start-feature` and → used by `start` and
- Line 135: section header `### start-feature (reads + writes)` → `### start (reads + writes)`

## Changes to `skills/design-document/SKILL.md`

- Line 38: `start-feature` lifecycle → `start` lifecycle

## Changes to `skills/session-report/scripts/analyze-session.py`

- Line 675: `if "start feature" in content:` → `if "start feature" in content or "start:" in content:`

This matches both old session logs (which used `start feature:`) and new ones (which use `start:`).

## Changes to `CHANGELOG.md`

- Historical entries (lines 11-172): **Leave as-is.** These document what shipped at that version.
- New entry: Add `[Unreleased]` entry at the top documenting the rename.

## Changes to `.claude-plugin/`

Check `plugin.json`, `marketplace.json`, and `CLAUDE.md` for any `start-feature` references and update. (Based on exploration, these files reference `feature-flow` the plugin name, not `start-feature` the skill name, so likely no changes needed.)

## What is NOT changed

- `docs/plans/*.md` — historical design documents are records of what was designed at that time
- CHANGELOG historical entries — records of what shipped
- `.feature-flow.yml` — no references to skill names
- `agents/task-verifier.md` — no references to skill names
- `hooks/scripts/*.js` — no references to skill names

## Scope

**Included:**
- Directory rename `skills/start-feature/` → `skills/start/`
- Frontmatter name + description update
- All YOLO announcement prefix updates
- All usage example updates
- SessionStart hook message updates + getting-started hints
- README.md updates
- references/project-context-schema.md updates
- design-document/SKILL.md cross-reference update
- session-report backward-compatible pattern matching
- New CHANGELOG entry

**Excluded:**
- Historical docs/plans/ references (leave as-is)
- Historical CHANGELOG entries (leave as-is)
- Logic changes (none — skill behavior is identical)
