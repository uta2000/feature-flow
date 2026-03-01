# Capture Git Diff Stats for Cost-Per-Line Tracking — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `git diff --stat [base-branch]...HEAD` to the `start` skill's Final Verification Step so that line counts are always captured in session telemetry before PR creation.

**Architecture:** The `analyze-session.py` script already parses `git diff --stat` output from bash results — it looks for "X insertions(+), Y deletions(-)" in the output of any bash command containing "git diff". The only missing piece is that the `start` skill never runs this command before PR creation. Adding it to the Final Verification Step (which runs before `finishing-a-development-branch`) ensures the output is always in the session transcript for the analyzer to consume.

**Tech Stack:** Markdown (SKILL.md), Bash (git commands)

---

### Task 1: Add git diff --stat to Final Verification Step

**Files:**
- Modify: `skills/start/SKILL.md` (design-first — 1577 lines)

**Background:**

The `analyze-session.py` script already has correct parsing logic (lines 979–997): for any Bash tool result where the command contains "git diff" or "git show", it searches for "X insertions" and "Y deletions" patterns and accumulates them into `lines_added_total` / `lines_removed_total`. These feed `cost_per_line_changed` in the output.

The problem: the `start` skill's Final Verification Step doesn't run `git diff --stat`, so there's nothing to parse. The only existing `git diff --stat` call is in the Comment and Close Issue step (AFTER PR creation, piped through `head -10`).

**Step 1: Read the current Final Verification Step section**

Read `skills/start/SKILL.md` lines 1436–1453 to understand the exact current text.

**Step 2: Add diff stats capture as step 4**

In the `### Final Verification Step` section, after step 3 (Write verification marker), add:

```markdown
4. **Capture diff stats for session telemetry:** Run `git diff --stat [base-branch]...HEAD` (substituting the detected base branch from Step 0) to record line counts in the session transcript. The session-report analysis script uses this output to populate `cost_per_line_changed`. No truncation — run without `| head`:
   ```bash
   git diff --stat [base-branch]...HEAD
   ```
   This is a read-only command. If it returns empty (no commits on the branch), that's fine — skip silently.
```

The text replaces `[base-branch]` with the actual base branch text "main" in the inline instruction example but keeps `[base-branch]` as a variable reference in the markdown explanation so it's clear it's a lifecycle variable.

**Step 3: Verify the edit is structurally valid**

After editing, grep for "Capture diff stats" in `skills/start/SKILL.md` to confirm the new text appears in the file.

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains `git diff --stat [base-branch]...HEAD` in the Final Verification Step section
- [ ] The new step is numbered 4 and appears after the verification marker step (step 3)
- [ ] The instruction does NOT pipe through `head` (ensures summary line with insertions/deletions count is captured)
- [ ] The text explains that `session-report` uses this output for `cost_per_line_changed`
- [ ] Existing steps 1, 2, 3 are unchanged

**Quality Constraints:**
- Files modified: `skills/start/SKILL.md` (design-first — 1577 lines)
- Design-first: read the current Final Verification Step section before any edit
- Pattern: follow existing inline step format (numbered list, bash fenced code block, brief explanation)
- Error handling: the instruction should note that empty output (no commits) is a silent skip, not an error
- Function length: single bash command addition — no complexity concerns

**Step 4: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat(start): capture git diff --stat in final verification for cost-per-line telemetry"
```
