<!-- PROGRESS INDEX
CURRENT: none
Task 1: Reposition checkpoint 3 and add checkpoint 4 in SKILL.md | STATUS: pending
Task 2: Update scope filtering and context note in SKILL.md | STATUS: pending
Task 3: Update Express Decision Log in SKILL.md | STATUS: pending
Task 4: Bump version to 1.22.2 everywhere | STATUS: pending
-->

# Add Compaction Checkpoint 4 (Issue #114) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reposition checkpoint 3 to fire after worktree setup + env file copying, add checkpoint 4 after implementation completes (before self-review + code review), and update all related references in `skills/start/SKILL.md`.

**Architecture:** Pure text-replacement changes to a large markdown skill file. No new abstractions needed — the checkpoint mechanism already exists; we're adding one entry to the checkpoint locations table, repositioning one existing entry, updating the scope filter, updating the context note, updating the Express Decision Log, and bumping the version.

**Tech Stack:** Markdown (SKILL.md), JSON (plugin.json, marketplace.json), YAML (.feature-flow.yml)

---

### Task 1: Reposition checkpoint 3 and add checkpoint 4 in SKILL.md

**Files:**
- Modify: `skills/start/SKILL.md` (design-first — the checkpoint locations table is at lines 649–655)

**Change Design:**
- The "Checkpoint locations" table currently has 3 rows.
- Row 3 says: `| 3 | Commit Planning Artifacts | Worktree Setup + Implementation | \`focus on the implementation plan and acceptance criteria\` |`
- This row needs to change: the "After Step" changes from "Commit Planning Artifacts" to "Worktree Setup + Copy Env Files", and the "Before Step" changes from "Worktree Setup + Implementation" to "subagent-driven-development". Focus hint also updates.
- Add a new row 4: `| 4 | Implementation complete (last task done) | Self-review + Code Review | \`focus on the implementation commit SHAs, acceptance criteria, and any known issues from implementation\` |`

**Step 1: Read the checkpoint locations section**

```bash
sed -n '649,680p' skills/start/SKILL.md
```

Expected: Confirms the 3-row table and its exact text.

**Step 2: Apply the edit**

Replace the checkpoint locations table in `skills/start/SKILL.md`:

OLD:
```
| # | After Step | Before Step | Focus Hint |
|---|-----------|-------------|------------|
| 1 | Documentation lookup | Design Document | `focus on brainstorming decisions and documentation patterns` |
| 2 | Design Verification (or Design Document for small enhancements, or Documentation Lookup for fast-track small enhancements) | Create Issue + Implementation Plan | `focus on the approved design and implementation plan` |
| 3 | Commit Planning Artifacts | Worktree Setup + Implementation | `focus on the implementation plan and acceptance criteria` |
```

NEW:
```
| # | After Step | Before Step | Focus Hint |
|---|-----------|-------------|------------|
| 1 | Documentation lookup | Design Document | `focus on brainstorming decisions and documentation patterns` |
| 2 | Design Verification (or Design Document for small enhancements, or Documentation Lookup for fast-track small enhancements) | Create Issue + Implementation Plan | `focus on the approved design and implementation plan` |
| 3 | Worktree Setup + Copy Env Files | subagent-driven-development | `focus on the implementation plan, acceptance criteria, and worktree path` |
| 4 | Implementation complete (last task done) | Self-review + Code Review | `focus on the implementation commit SHAs, acceptance criteria, and any known issues from implementation` |
```

**Step 3: Verify the edit**

```bash
grep -A 10 "Checkpoint locations:" skills/start/SKILL.md
```

Expected: 4-row table with the repositioned row 3 and new row 4.

**Step 4: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: reposition checkpoint 3 and add checkpoint 4 after implementation (#114)"
```

**Acceptance Criteria:**
- [ ] Checkpoint 3 row now says "After Step: Worktree Setup + Copy Env Files" and "Before Step: subagent-driven-development"
- [ ] Checkpoint 4 row exists with "After Step: Implementation complete (last task done)" and "Before Step: Self-review + Code Review"
- [ ] Focus hint for checkpoint 3 mentions "worktree path"
- [ ] Focus hint for checkpoint 4 mentions "implementation commit SHAs"

**Quality Constraints:**
- Error handling: n/a — text replacement only
- Types: n/a — markdown
- Function length: n/a
- Pattern reference: match the exact table formatting style of the existing rows (pipe-separated markdown table)
- Files modified: `skills/start/SKILL.md` (design-first — 1750+ lines)
- Design-first files: `skills/start/SKILL.md` — output change plan before editing

---

### Task 2: Update scope filtering and context note in SKILL.md

**Files:**
- Modify: `skills/start/SKILL.md` (design-first — scope filtering table at lines 659–664, context note at line 334)

**Change Design:**
- Scope filtering table: rows for "Feature" and "Major feature" currently say "All 3" — change to "All 4".
- Context note (line 334): "typically requires 2-3 /compact pauses" → "typically requires 3-4 /compact pauses".
- No other text in the file uses "All 3" or "2-3 /compact" in this context (verified by grep).

**Step 1: Confirm exact text of scope filtering table**

```bash
grep -n "All 3\|All 4\|2-3 /compact\|3-4 /compact" skills/start/SKILL.md
```

Expected: Lines showing "All 3" for Feature and Major feature, and "2-3 /compact" in the context note.

**Step 2: Apply scope filtering table edit**

Replace the scope-based filtering table:

OLD:
```
| Feature | All 3 |
| Major feature | All 3 |
```

NEW:
```
| Feature | All 4 |
| Major feature | All 4 |
```

**Step 3: Apply context note edit**

Replace the context note text:

OLD:
```
Context note: Interactive mode at this scope typically requires 2-3 /compact pauses. Express auto-selects decisions while preserving those checkpoints.
```

NEW:
```
Context note: Interactive mode at this scope typically requires 3-4 /compact pauses. Express auto-selects decisions while preserving those checkpoints.
```

**Step 4: Verify both edits**

```bash
grep -n "All 4\|3-4 /compact" skills/start/SKILL.md
```

Expected: "All 4" on both Feature and Major feature rows, "3-4 /compact" in context note.

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: update scope filtering to 4 checkpoints and context note (#114)"
```

**Acceptance Criteria:**
- [ ] Scope filtering table shows "All 4" for Feature scope
- [ ] Scope filtering table shows "All 4" for Major feature scope
- [ ] Context note text updated from "2-3" to "3-4" /compact pauses
- [ ] Small enhancement row still shows "2 and 3 only" (unchanged)

**Quality Constraints:**
- Error handling: n/a
- Types: n/a — markdown
- Pattern reference: use Edit tool; match existing table formatting exactly
- Files modified: `skills/start/SKILL.md` (design-first — 1750+ lines)
- Design-first files: `skills/start/SKILL.md` — output change plan before editing

---

### Task 3: Update Express Decision Log in SKILL.md

**Files:**
- Modify: `skills/start/SKILL.md` (design-first — Express Decision Log at lines ~1706–1731)

**Change Design:**
- The Express Decision Log table currently has rows for "Compact checkpoint 1", "Compact checkpoint 2", "Compact checkpoint 3".
- Add a row for "Compact checkpoint 4" after checkpoint 3.
- The YOLO Decision Log does not show compact checkpoint rows (YOLO suppresses checkpoints) — do NOT modify it.

**Step 1: Confirm exact text of Express Decision Log rows**

```bash
grep -n "Compact checkpoint" skills/start/SKILL.md
```

Expected: Lines 1719–1721 showing checkpoint 1, 2, 3.

**Step 2: Apply the edit**

Add "Compact checkpoint 4" row after "Compact checkpoint 3":

OLD:
```
| N | start | Compact checkpoint 3 | /compact (or skipped) |
```

NEW:
```
| N | start | Compact checkpoint 3 | /compact (or skipped) |
| N | start | Compact checkpoint 4 | /compact (or skipped) |
```

**Step 3: Verify the edit**

```bash
grep -A 1 "Compact checkpoint 3" skills/start/SKILL.md
```

Expected: Shows checkpoint 3 row followed by checkpoint 4 row.

**Step 4: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add compact checkpoint 4 to Express Decision Log (#114)"
```

**Acceptance Criteria:**
- [ ] Express Decision Log contains "Compact checkpoint 4" row
- [ ] YOLO Decision Log does NOT contain a "Compact checkpoint 4" row
- [ ] Checkpoint 4 row format matches rows 1-3 exactly

**Quality Constraints:**
- Error handling: n/a
- Types: n/a — markdown
- Pattern reference: match exact pipe-separated table row format of existing checkpoint rows
- Files modified: `skills/start/SKILL.md` (design-first — 1750+ lines)
- Design-first files: `skills/start/SKILL.md` — output change plan before editing

---

### Task 4: Bump version to 1.22.2 everywhere

**Files:**
- Modify: `.claude-plugin/plugin.json` (version field)
- Modify: `.claude-plugin/marketplace.json` (version field)
- Modify: `.feature-flow.yml` (plugin_version field)

**Change Design:**
- Current version: 1.22.1
- New version: 1.22.2 (patch bump — behavioural enhancement to existing checkpoint mechanism)
- Three files to update; none are design-first (all are small config files)

**Step 1: Verify all version references**

```bash
grep -rn "1\.22\.1" .claude-plugin/ .feature-flow.yml
```

Expected: 3 matches — one in plugin.json, one in marketplace.json, one in .feature-flow.yml.

**Step 2: Update plugin.json**

Replace `"version": "1.22.1"` with `"version": "1.22.2"` in `.claude-plugin/plugin.json`.

**Step 3: Update marketplace.json**

Replace `"version": "1.22.1"` with `"version": "1.22.2"` in `.claude-plugin/marketplace.json`.

**Step 4: Update .feature-flow.yml**

Replace `plugin_version: 1.22.1` with `plugin_version: 1.22.2` in `.feature-flow.yml`.

**Step 5: Verify all references are updated**

```bash
grep -rn "1\.22\." .claude-plugin/ .feature-flow.yml
```

Expected: All 3 occurrences now show 1.22.2; no remaining 1.22.1 references.

**Step 6: Commit**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json .feature-flow.yml
git commit -m "chore: bump version to 1.22.2"
```

**Acceptance Criteria:**
- [ ] `.claude-plugin/plugin.json` version field is "1.22.2"
- [ ] `.claude-plugin/marketplace.json` version field is "1.22.2"
- [ ] `.feature-flow.yml` plugin_version field is 1.22.2
- [ ] No remaining references to 1.22.1 in any of these files

**Quality Constraints:**
- Error handling: n/a — config file edits
- Types: n/a
- Pattern reference: use Edit tool for each file individually
- Files modified: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.feature-flow.yml`
