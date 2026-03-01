# Prevent git commit --amend in Automated Implementation Workflows

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add explicit git safety instructions to implementation subagent prompts, prohibiting `git commit --amend` and `git rebase -i` in automated sessions.

**Architecture:** Single prose edit to the "Implementer Quality Context Injection" section of `skills/start/SKILL.md`. A new numbered item is added to the "Context injected per implementer subagent" list, and the corresponding injection format template gains a "Git Safety" subsection. The instruction aligns with Claude Code's own git safety protocol.

**Tech Stack:** Markdown (skill prompt text only — no code changes)

---

### Task 1: Add git safety instructions to Implementer Quality Context Injection

**Files:**
- Modify: `skills/start/SKILL.md` (lines 732–775, "Implementer Quality Context Injection" section) — design-first (1,562 lines)

**Step 1: Read the full file section before editing**

Read `skills/start/SKILL.md` lines 732–776 to confirm current structure of the injection list and the injection format template.

**Step 2: Output change plan**

Identify the exact insertion points:
- After item 5 (Change Design Protocol), add new item 6 (Git Safety Protocol)
- In the injection format template block, add a "### Git Safety" subsection after "### Change Design Protocol"

**Step 3: Add item 6 to the numbered context injection list**

In `skills/start/SKILL.md`, after the "Change Design Protocol" item (ending at line ~751), insert:

```
6. **Git Safety Protocol.** Include an explicit instruction prohibiting history-rewriting operations:
   - Never use `git commit --amend` — always create a new commit instead
   - Never use `git rebase -i` — interactive rebase rewrites history
   - Never use `git push --force` or `git push --force-with-lease` without explicit user instruction
   - This aligns with Claude Code's own git safety protocol: "CRITICAL: Always create NEW commits rather than amending"
```

**Step 4: Add "### Git Safety" subsection to the injection format template**

In the injection format code block (lines ~754–775), after the "### Change Design Protocol" subsection, append:

```
### Git Safety
Always create NEW commits — never use:
- `git commit --amend` (rewrites history)
- `git rebase -i` (rewrites history)
- `git push --force` (unless explicitly instructed)
If you need to add a file you forgot, create a new commit: `git add <file> && git commit -m "chore: add missing file"`
```

**Step 5: Verify the edit**

Read `skills/start/SKILL.md` lines 732–790 and confirm:
- [ ] Item 6 (Git Safety Protocol) appears in the numbered list after item 5
- [ ] "### Git Safety" subsection appears in the injection format template
- [ ] No surrounding content was accidentally removed or garbled
- [ ] The markdown formatting is consistent with surrounding content (headings, code fences, bullet style)

**Step 6: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "fix(start): prohibit git commit --amend in implementation subagent prompts"
```

Expected: New commit SHA on current branch. Do NOT use `git commit --amend`.

**Acceptance Criteria:**
- [ ] `git log --oneline -1` shows a new commit (not an amended one)
- [ ] `grep -n "amend" skills/start/SKILL.md` returns at least 2 hits — one in the numbered list item, one in the injection format template
- [ ] `grep -n "Git Safety" skills/start/SKILL.md` returns exactly 2 hits (one heading in the list item prose, one `### Git Safety` subsection in the template)
- [ ] `grep -n "rebase -i" skills/start/SKILL.md` returns at least 1 hit
- [ ] `wc -l skills/start/SKILL.md` shows the file is longer than the original 1,562 lines
- [ ] The file renders valid markdown (no unclosed code fences, consistent heading levels)

**Quality Constraints:**
- Error handling: N/A (prose edit)
- Type narrowness: N/A
- Function length: N/A
- Pattern reference: Follow existing numbered-list and code-block style in lines 736–751 of SKILL.md
- Files modified: `skills/start/SKILL.md` (design-first — 1,562 lines; output change plan before any Edit call)
- Design-first files: `skills/start/SKILL.md` — implementer must output change plan before ANY Edit call on this file
