# Agent-Based Plugin Detection Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the `start` skill pre-flight check so agent-based plugins (like `backend-api-security`) are correctly detected as installed even when they expose no skills.

**Architecture:** The `start` skill's `SKILL.md` pre-flight section currently uses namespace-prefix detection against the loaded skill list. This misses plugins that register agents instead of skills. The fix adds a fallback: check for the plugin's directory in the plugin cache (`~/.claude/plugins/cache/*/[plugin-name]`). The reviewer audit in `step-lists.md` delegates to the pre-flight result ("from the plugin checks above"), so fixing SKILL.md alone is sufficient for both detection locations.

**Tech Stack:** Markdown instruction files (no runtime code — changes are LLM-read instructions)

---

### Task 1: Fix backend-api-security detection in SKILL.md

**Files:**
- Modify: `skills/start/SKILL.md:61-69`

**What to change:**

Current text at line 63:
```
Check for its presence by looking for any skill starting with `backend-api-security:` in the loaded skill list (namespace-prefix detection). If not found, warn but continue:
```

Replace the entire `### backend-api-security (recommended)` section (lines 61–69) with:

```markdown
### backend-api-security (recommended)

Check for its presence using two strategies (either is sufficient to consider it installed):
1. **Skill namespace prefix:** look for any skill starting with `backend-api-security:` in the loaded skill list
2. **Agent file path:** if not found in skill list, run `ls ~/.claude/plugins/cache/*/backend-api-security 2>/dev/null | head -1` — if output is non-empty, the plugin is installed as an agent-based plugin

If neither strategy detects the plugin, warn but continue:

```
The backend-api-security plugin is recommended for security review.
Install it: claude plugins add backend-api-security
Without it, the code review pipeline will skip: backend-api-security reviewers.
```
```

**Step 1: Verify the exact current text before editing**

Run:
```bash
grep -n "backend-api-security" skills/start/SKILL.md
```
Expected output: line 61 shows `### backend-api-security (recommended)`, line 63 shows `Check for its presence by looking for any skill starting with`.

**Step 2: Apply the edit**

Use the Edit tool to replace lines 61–69 in `skills/start/SKILL.md` with the new dual-strategy detection text above.

**Step 3: Verify the edit**

Run:
```bash
grep -A 8 "backend-api-security (recommended)" skills/start/SKILL.md | head -12
```
Expected: output shows both "Skill namespace prefix" and "Agent file path" strategies.

**Step 4: Verify the bash command works against the actual plugin cache**

Run:
```bash
ls ~/.claude/plugins/cache/*/backend-api-security 2>/dev/null | head -1
```
Expected: non-empty output (e.g., a path containing agents/ or similar) confirming the plugin is present.

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "fix: add agent-path fallback to backend-api-security pre-flight detection"
```

**Acceptance Criteria:**
- [ ] `grep -A 6 "backend-api-security (recommended)" skills/start/SKILL.md` shows the text "Agent file path" and `ls ~/.claude/plugins/cache/*/backend-api-security`
- [ ] `grep -c "Skill namespace prefix" skills/start/SKILL.md` outputs `1`
- [ ] `ls ~/.claude/plugins/cache/*/backend-api-security 2>/dev/null | head -1` returns non-empty when backend-api-security is installed
- [ ] The warning block (3 lines: "recommended for security review", "Install it", "Without it") is still present unchanged

---

### Task 2: Bump plugin version to 1.23.4

**Files:**
- Modify: `.claude-plugin/marketplace.json`

**What to change:**

Update `"version": "1.23.3"` to `"version": "1.23.4"` in the plugins array entry.

**Step 1: Read the current file**

Read `.claude-plugin/marketplace.json` to confirm current version is `1.23.3`.

**Step 2: Apply the edit**

Use the Edit tool to change `"version": "1.23.3"` to `"version": "1.23.4"` in `.claude-plugin/marketplace.json`.

**Step 3: Verify**

Run:
```bash
grep '"version"' .claude-plugin/marketplace.json
```
Expected: `"version": "1.23.4"`

**Step 4: Commit**

```bash
git add .claude-plugin/marketplace.json
git commit -m "chore: bump version to 1.23.4"
```

**Acceptance Criteria:**
- [ ] `grep '"version"' .claude-plugin/marketplace.json` outputs `"version": "1.23.4"`
- [ ] No other fields in marketplace.json were modified
