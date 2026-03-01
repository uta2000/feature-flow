# Parallel Study Agent Dispatch — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Strengthen the parallelism instruction in two locations of `skills/start/SKILL.md` so orchestrators never dispatch exploration or review agents sequentially.

**Architecture:** Two additive text edits to a single Markdown file. Each edit appends a "Do NOT" anti-pattern sentence after the existing "Launch all agents in a single message" instruction, matching the proven pattern used for TaskCreate dispatch. No runtime changes, no new files.

**Tech Stack:** Markdown editing only. Verification via `grep`.

---

### Task 1: Strengthen Study Existing Patterns dispatch instruction

**Files:**
- Modify: `skills/start/SKILL.md:895`

**DESIGN-FIRST (file is 1577 lines):** Read the surrounding context before editing.

**Step 1: Read the file section to confirm current text**

Run:
```bash
grep -n "Launch all agents in a \*\*single message\*\* to run them concurrently" skills/start/SKILL.md
```

Expected output:
```
895:   Use the Task tool with `subagent_type: "Explore"` and `model: "haiku"` ... Launch all agents in a **single message** to run them concurrently. Announce: "Dispatching N pattern study agents in parallel..."
```

**Step 2: Run verification to confirm "Do NOT" language is absent (failing state)**

Run:
```bash
grep -n "Do NOT dispatch agents one at a time" skills/start/SKILL.md
```

Expected: no output (the anti-pattern warning does not yet exist).

**Step 3: Apply the edit**

Change line 895 from:
```
   Use the Task tool with `subagent_type: "Explore"` and `model: "haiku"` (per Model Routing Defaults; see `../../references/tool-api.md` — Task Tool for parameter syntax). Launch all agents in a **single message** to run them concurrently. Announce: "Dispatching N pattern study agents in parallel..."
```

To:
```
   Use the Task tool with `subagent_type: "Explore"` and `model: "haiku"` (per Model Routing Defaults; see `../../references/tool-api.md` — Task Tool for parameter syntax). Launch all agents in a **single message** to run them concurrently. Do NOT dispatch agents one at a time — sequential dispatch defeats the purpose of parallel study and wastes N-1 parent API turns on waiting. All N agents must appear in one message. Announce: "Dispatching N pattern study agents in parallel..."
```

**Step 4: Verify the edit (passing state)**

Run:
```bash
grep -n "Do NOT dispatch agents one at a time" skills/start/SKILL.md
```

Expected output:
```
895:   ...Launch all agents in a **single message** to run them concurrently. Do NOT dispatch agents one at a time...
```

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "fix(start): enforce parallel dispatch in study-patterns phase

Adds explicit Do NOT anti-pattern warning to Study Existing Patterns
dispatch instruction. Matches the proven TaskCreate pattern language
that prevents sequential dispatch.

Relates to #109"
```

**Acceptance Criteria:**
- [ ] `grep "Do NOT dispatch agents one at a time" skills/start/SKILL.md` returns a match on the study-patterns dispatch line
- [ ] `grep "Launch all agents in a \*\*single message\*\* to run them concurrently" skills/start/SKILL.md` still returns a match (positive framing retained)
- [ ] `grep "Dispatching N pattern study agents in parallel" skills/start/SKILL.md` still returns a match (announce line retained)
- [ ] No other lines in the file were changed (verify with `git diff --stat`)

**Quality Constraints:**
- Error handling: N/A — Markdown text edit, no runtime code
- Types: N/A — no code types
- Function length: N/A — instruction text addition only
- Pattern reference: Follow TaskCreate anti-pattern language: "Do NOT call them one at a time; sequential calls waste N-1 parent API turns"
- Files modified: `skills/start/SKILL.md` (design-first — 1577 lines); read surrounding context before editing

---

### Task 2: Strengthen Code Review Pipeline Phase 1 dispatch instruction

**Files:**
- Modify: `skills/start/SKILL.md:1080`

**DESIGN-FIRST (file is 1577 lines):** Read the surrounding context before editing.

**Step 1: Read the file section to confirm current text**

Run:
```bash
grep -n "Launch all agents in a single message to run them concurrently" skills/start/SKILL.md
```

Expected output:
```
1080: Dispatch the tier-selected review agents in parallel ... Launch all agents in a single message to run them concurrently.
```

**Step 2: Run verification to confirm "Do NOT" language is absent in code review section (failing state)**

Run:
```bash
grep -n "Do NOT dispatch agents one at a time" skills/start/SKILL.md
```

Expected: at most one match (from Task 1), not on line 1080.

**Step 3: Apply the edit**

Change line 1080 from:
```
Dispatch the tier-selected review agents in parallel (see scope-based agent selection above). For each agent at or below the current tier, use the Task tool with the agent's `subagent_type` and `model` parameter (see table below and `../../references/tool-api.md` — Task Tool for correct syntax). Launch all agents in a single message to run them concurrently.
```

To:
```
Dispatch the tier-selected review agents in parallel (see scope-based agent selection above). For each agent at or below the current tier, use the Task tool with the agent's `subagent_type` and `model` parameter (see table below and `../../references/tool-api.md` — Task Tool for correct syntax). Launch all agents in a single message to run them concurrently. Do NOT dispatch agents one at a time — sequential dispatch defeats the purpose of parallel review and wastes N-1 parent API turns on waiting. All tier-selected agents must appear in one message.
```

**Step 4: Verify the edit (passing state)**

Run:
```bash
grep -c "Do NOT dispatch agents one at a time" skills/start/SKILL.md
```

Expected: `2` (both locations now have the warning).

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "fix(start): enforce parallel dispatch in code review pipeline phase 1

Adds explicit Do NOT anti-pattern warning to Code Review Pipeline
Phase 1 dispatch instruction, matching the same pattern applied to
study-patterns in the previous commit.

Closes #109"
```

**Acceptance Criteria:**
- [ ] `grep -c "Do NOT dispatch agents one at a time" skills/start/SKILL.md` returns `2`
- [ ] `grep "Launch all agents in a single message to run them concurrently" skills/start/SKILL.md` still returns a match on the code review pipeline line (positive framing retained)
- [ ] `grep "All tier-selected agents must appear in one message" skills/start/SKILL.md` returns a match
- [ ] No other lines in the file were changed (verify with `git diff --stat`)

**Quality Constraints:**
- Error handling: N/A — Markdown text edit, no runtime code
- Types: N/A — no code types
- Function length: N/A — instruction text addition only
- Pattern reference: Follow TaskCreate anti-pattern language; adapt "All N agents" to "All tier-selected agents" for specificity in review context
- Files modified: `skills/start/SKILL.md` (design-first — 1577 lines); read surrounding context before editing
