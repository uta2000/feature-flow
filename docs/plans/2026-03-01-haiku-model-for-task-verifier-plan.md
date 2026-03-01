# Haiku Model for Task Verifier — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `model: "haiku"` to the Task tool dispatch in `verify-acceptance-criteria` so the task-verifier agent runs on Haiku instead of inheriting the parent model.

**Architecture:** Single text substitution in `skills/verify-acceptance-criteria/SKILL.md`. The dispatch instruction in Step 3 currently omits the `model` parameter; adding `model: "haiku"` to the instruction text causes Claude to pass it when invoking the Task tool. No code compilation, type checking, or migration applies — skill files are Markdown.

**Tech Stack:** Markdown (skill file format), git for commit

---

### Task 1: Add `model: "haiku"` to task-verifier dispatch

**Files:**
- Modify: `skills/verify-acceptance-criteria/SKILL.md` (line 66)

**Step 1: Read the file to confirm current state**

```bash
grep -n 'subagent_type.*task-verifier' skills/verify-acceptance-criteria/SKILL.md
```

Expected output (confirms no model parameter present):
```
66:Use the Task tool with `subagent_type: "feature-flow:task-verifier"` (see `../../references/tool-api.md` — Task Tool for correct parameter syntax) to launch the task-verifier agent with:
```

**Step 2: Apply the change**

Edit `skills/verify-acceptance-criteria/SKILL.md` line 66.

Find:
```
Use the Task tool with `subagent_type: "feature-flow:task-verifier"` (see `../../references/tool-api.md` — Task Tool for correct parameter syntax) to launch the task-verifier agent with:
```

Replace with:
```
Use the Task tool with `subagent_type: "feature-flow:task-verifier"` and `model: "haiku"` (see `../../references/tool-api.md` — Task Tool for correct parameter syntax) to launch the task-verifier agent with:
```

**Step 3: Verify the change**

```bash
grep -n 'model: "haiku"' skills/verify-acceptance-criteria/SKILL.md
```

Expected output:
```
66:Use the Task tool with `subagent_type: "feature-flow:task-verifier"` and `model: "haiku"` (see `../../references/tool-api.md` — Task Tool for correct parameter syntax) to launch the task-verifier agent with:
```

Also verify no unintended duplicates were introduced:
```bash
grep -c 'model: "haiku"' skills/verify-acceptance-criteria/SKILL.md
```

Expected: `1`

**Step 4: Commit**

```bash
git add skills/verify-acceptance-criteria/SKILL.md
git commit -m "feat(verify-acceptance-criteria): set model: haiku for task-verifier dispatch

Explicitly pass model: \"haiku\" when dispatching the feature-flow:task-verifier
agent in the verify-acceptance-criteria skill. Verification is checklist-style
mechanical work (file existence, grep patterns, command output) that does not
require advanced reasoning.

Evidence: session d1bab02a — verifier inherited Sonnet, consumed 54,216 tokens
across 45 tool calls in 3m 25s. Haiku reduces this cost by ~60%.

Closes #108"
```

**Acceptance Criteria:**

- [ ] `grep -c 'model: "haiku"' skills/verify-acceptance-criteria/SKILL.md` returns `1`
- [ ] `grep 'model: "haiku"' skills/verify-acceptance-criteria/SKILL.md` shows the match on the same line as `subagent_type: "feature-flow:task-verifier"`
- [ ] `grep -c 'subagent_type: "feature-flow:task-verifier"' skills/verify-acceptance-criteria/SKILL.md` still returns `1` (no duplicates or deletions)
- [ ] `git diff HEAD~1 skills/verify-acceptance-criteria/SKILL.md` shows exactly 1 line changed (the dispatch line)
- [ ] The rest of `skills/verify-acceptance-criteria/SKILL.md` is unchanged (total line count is the same)

**Quality Constraints:**
- Error handling: N/A — text edit to Markdown; no runtime error paths
- Types: N/A — Markdown skill file, no type system
- Function length: N/A — single-line substitution
- Pattern reference: Follow existing Task tool instruction format in `skills/start/SKILL.md` (e.g., `subagent_type: "Explore"` and `model: "haiku"` pattern)
- Files modified: `skills/verify-acceptance-criteria/SKILL.md` (135 lines — not design-first threshold)
