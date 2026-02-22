# Rename `start-feature` to `start` — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename the `start-feature` skill to `start` and add getting-started hints to the SessionStart hook messages.

**Architecture:** Mechanical find-and-replace across skill files, hooks, README, references, and session-report script. No logic changes. Directory rename via `git mv`. Backward-compatible trigger phrases preserved.

**Tech Stack:** Markdown skill files, JSON hooks, Python session-report script

---

### Task 1: Rename the skill directory

**Files:**
- Rename: `skills/start-feature/` → `skills/start/`

**Step 1: Rename the directory using git mv**

```bash
git mv skills/start-feature skills/start
```

This moves the entire directory including `SKILL.md`, `CLAUDE.md`, and `references/` subdirectory. Git tracks the rename so history is preserved.

**Step 2: Verify the rename**

```bash
ls skills/start/SKILL.md
ls skills/start/references/
```

Expected: Both exist.

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: rename skills/start-feature to skills/start"
```

**Acceptance Criteria:**
- [ ] Directory `skills/start-feature/` does not exist
- [ ] Directory `skills/start/` exists and contains `SKILL.md`
- [ ] Directory `skills/start/references/` exists
- [ ] `git log --diff-filter=R --summary HEAD~1..HEAD` shows the rename

---

### Task 2: Update SKILL.md frontmatter and internal references

**Files:**
- Modify: `skills/start/SKILL.md`

**Step 1: Update frontmatter name**

Change line 2:
```yaml
# Before
name: start-feature
# After
name: start
```

**Step 2: Update frontmatter description**

Change line 3 — add `"start:"` as the primary trigger phrase at the beginning of the list:
```yaml
# Before
description: This skill should be used when the user asks to "start a feature", "build a feature", ...
# After
description: This skill should be used when the user asks to "start:", "start a feature", "build a feature", "implement a feature", "new feature", "start working on", "I want to build", "let's build", "add a feature", or at the beginning of any non-trivial development work. It orchestrates the full lifecycle from idea to PR, invoking the right skills at each step.
```

**Step 3: Update error message**

Change line ~24:
```
# Before
Then re-run start-feature.
# After
Then re-run start.
```

**Step 4: Update usage examples**

Find all instances of `start feature: add CSV export` and replace with `start: add CSV export`. Specifically line ~97:
```
# Before
(so `start feature: add CSV export --yolo` becomes `start feature: add CSV export` for scope classification)
# After
(so `start: add CSV export --yolo` becomes `start: add CSV export` for scope classification)
```

**Step 5: Update all YOLO announcement prefixes**

Replace all occurrences of `YOLO: start-feature —` with `YOLO: start —` throughout the file. There are 6 instances:
- Line ~113: Stack cross-check
- Line ~131: Platform/stack detection
- Line ~150: Base branch detection
- Line ~234: Scope + mode
- Line ~895: CHANGELOG version heading
- Line ~925: CHANGELOG entry

**Step 6: Update YOLO decision log tables**

Replace all `| start-feature |` with `| start |` in the completion summary templates. There are 5 instances at lines ~1133, ~1176, ~1178, ~1179, ~1180.

**Step 7: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "refactor: update start skill frontmatter and internal references"
```

**Acceptance Criteria:**
- [ ] `grep -c 'name: start$' skills/start/SKILL.md` returns `1`
- [ ] `grep -c 'start-feature' skills/start/SKILL.md` returns `0`
- [ ] `grep -c '"start:"' skills/start/SKILL.md` returns at least `1` (trigger phrase in description)
- [ ] `grep -c 'YOLO: start —' skills/start/SKILL.md` returns `6`
- [ ] `grep -c 'start feature:' skills/start/SKILL.md` returns `0`

---

### Task 3: Update hooks.json SessionStart messages

**Files:**
- Modify: `hooks/hooks.json`

**Step 1: Update the `if` branch message (returning projects)**

In the SessionStart hook command (line 70), within the `if` branch:

1. Replace `Use start-feature to begin any non-trivial work` with `Use start: to begin any non-trivial work`
2. Replace `Run start-feature to auto-detect` with `Run start: to auto-detect` (in the upgrade notice)
3. Append to the end of the `if` branch echo (before the closing single quote of the first echo): ` Type \"start: <description>\" or \"start: <description> --yolo\" to begin.`

**Step 2: Update the `else` branch message (first-time projects)**

In the `else` branch:

1. Replace `\"start feature: add user notifications\"` with `\"start: add user notifications\"`
2. Append to the end of the `else` echo: ` Type \"start: <your idea, issue, or bug>\" to get started. Add --yolo to auto-select defaults.`

**Step 3: Verify the JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); console.log('valid JSON')"
```

Expected: `valid JSON`

**Step 4: Commit**

```bash
git add hooks/hooks.json
git commit -m "refactor: update SessionStart messages and add getting-started hints"
```

**Acceptance Criteria:**
- [ ] `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); console.log('ok')"` prints `ok` (valid JSON)
- [ ] `grep -c 'start-feature' hooks/hooks.json` returns `0`
- [ ] `grep -c 'start:' hooks/hooks.json` returns at least `3`
- [ ] `grep -c 'yolo' hooks/hooks.json` returns at least `1` (the hint mentions --yolo)

---

### Task 4: Update README.md

**Files:**
- Modify: `README.md`

**Step 1: Update all usage examples**

Replace all `start feature:` with `start:`:
- Line 3: `"start feature: add user notifications"` → `"start: add user notifications"`
- Line 61: `start feature: add user notifications` → `start: add user notifications`
- Line 78: `start feature: add user notifications --yolo` → `start: add user notifications --yolo`
- Line 86: `start feature: add user notifications --yolo` → `start: add user notifications --yolo`

**Step 2: Update skill name references**

Replace all backtick-quoted `start-feature` with `start`:
- Line 105: `` `start-feature` orchestrator `` → `` `start` orchestrator ``
- Line 132: `` `start-feature` `` in skill table → `` `start` ``
- Line 158: `` `start-feature` is the recommended entry point `` → `` `start` is the recommended entry point ``
- Line 168: `` `start-feature` `` → `` `start` ``
- Line 209: `` `start-feature` auto-detects `` → `` `start` auto-detects ``
- Line 237: `` `start-feature` scans `` → `` `start` scans ``

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README with renamed start command"
```

**Acceptance Criteria:**
- [ ] `grep -c 'start-feature' README.md` returns `0`
- [ ] `grep -c 'start feature:' README.md` returns `0`
- [ ] `grep -c 'start: add user notifications' README.md` returns at least `1`
- [ ] `grep -c '| \x60start\x60' README.md` returns `1` (skill table row)

---

### Task 5: Update references/project-context-schema.md

**Files:**
- Modify: `references/project-context-schema.md`

**Step 1: Replace all 5 references**

Replace all `start-feature` with `start`:
- Line 3: `start-feature` auto-detects → `start` auto-detects
- Line 62: Step 0 of `start-feature` → Step 0 of `start`
- Line 80: `start-feature` queries → `start` queries
- Line 118: used by `start-feature` and → used by `start` and
- Line 135: `### start-feature (reads + writes)` → `### start (reads + writes)`

**Step 2: Commit**

```bash
git add references/project-context-schema.md
git commit -m "docs: update project-context-schema.md references to start"
```

**Acceptance Criteria:**
- [ ] `grep -c 'start-feature' references/project-context-schema.md` returns `0`
- [ ] `grep -c '### start (reads' references/project-context-schema.md` returns `1`

---

### Task 6: Update design-document SKILL.md cross-reference

**Files:**
- Modify: `skills/design-document/SKILL.md`

**Step 1: Update the cross-reference**

Line 38: Replace `start-feature` with `start`:
```
# Before
AND no documentation lookup step was already run in the `start-feature` lifecycle
# After
AND no documentation lookup step was already run in the `start` lifecycle
```

**Step 2: Commit**

```bash
git add skills/design-document/SKILL.md
git commit -m "docs: update design-document cross-reference to start"
```

**Acceptance Criteria:**
- [ ] `grep -c 'start-feature' skills/design-document/SKILL.md` returns `0`
- [ ] `grep -c 'start. lifecycle' skills/design-document/SKILL.md` returns `1`

---

### Task 7: Update session-report analyze-session.py

**Files:**
- Modify: `skills/session-report/scripts/analyze-session.py`

**Step 1: Update the trigger phrase detection**

Line 675: Add backward-compatible pattern matching:
```python
# Before
if "start feature" in content:
# After
if "start feature" in content or "start:" in content:
```

**Step 2: Commit**

```bash
git add skills/session-report/scripts/analyze-session.py
git commit -m "fix: session-report matches both old and new start trigger"
```

**Acceptance Criteria:**
- [ ] `grep -c '"start feature"' skills/session-report/scripts/analyze-session.py` returns `1` (old pattern preserved)
- [ ] `grep -c '"start:"' skills/session-report/scripts/analyze-session.py` returns `1` (new pattern added)
- [ ] The line contains `or` joining both patterns

---

### Task 8: Add CHANGELOG entry

**Files:**
- Modify: `CHANGELOG.md`

**Step 1: Add entry under [Unreleased] → Changed**

Under the existing `### Changed` section in `[Unreleased]`, add a new entry:

```markdown
- **Renamed `start-feature` skill to `start`** — the primary entry point command changes from `start feature: <description>` to `start: <description>`. Old trigger phrases ("start a feature", "build a feature", etc.) are preserved as aliases. SessionStart hook messages updated with getting-started hints showing the `start:` syntax and `--yolo` flag. Closes #53.
```

**Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add CHANGELOG entry for start-feature rename"
```

**Acceptance Criteria:**
- [ ] `grep -c 'Renamed.*start-feature.*skill to.*start' CHANGELOG.md` returns `1`
- [ ] `grep -c 'Closes #53' CHANGELOG.md` returns `1`
- [ ] The entry appears under `### Changed` within the `## [Unreleased]` section
