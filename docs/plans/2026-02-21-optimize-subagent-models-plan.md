# Optimize Subagent Model Selection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce token waste by adding model selection guidance for implementation subagents and downgrading two code review agents from Opus to Sonnet.

**Architecture:** Three targeted edits to `skills/start-feature/SKILL.md` — add model guidance text to the YOLO override section, and change two values in the code review pipeline table.

**Tech Stack:** Markdown (SKILL.md skill definition file)

**Design Doc:** `docs/plans/2026-02-21-optimize-subagent-models.md`
**Issue:** #35

---

### Task 1: Add model guidance to Subagent-Driven Development YOLO Override

**Files:**
- Modify: `skills/start-feature/SKILL.md:477-479`

**Acceptance Criteria:**
- [ ] Lines after item 2 in the "Additional YOLO behavior" list contain items 3, 4, and 5 with model guidance
- [ ] Item 3 specifies `model: sonnet` as default for implementation subagents with Opus escalation keywords: "design", "architect", "migration", "schema change", "new data model"
- [ ] Item 4 specifies `model: sonnet` for spec review and consumer verification agents
- [ ] Item 5 specifies `model: haiku` for Explore agents dispatched during implementation

**Step 1: Add model guidance items**

After line 479 (`2. Do NOT ask the user to answer subagent questions...`), insert three new items:

```markdown
3. When dispatching implementation subagents, use `model: sonnet` unless the task description contains keywords indicating architectural complexity: "design", "architect", "migration", "schema change", "new data model". For these, use `model: opus`. Announce: `YOLO: subagent-driven-development — Model selection → sonnet (or opus for [keyword])`
4. When dispatching spec review or consumer verification agents (general-purpose), use `model: sonnet`. These agents compare implementation against acceptance criteria or verify existing code is unchanged — checklist work that does not require deep reasoning.
5. When dispatching Explore agents during implementation, use `model: haiku`. These agents do read-only file exploration and pattern extraction.
```

**Step 2: Verify the edit**

Read `skills/start-feature/SKILL.md` and confirm:
- The "Additional YOLO behavior" list now has 5 items
- Item 3 contains `model: sonnet` default and `model: opus` escalation with the 5 keywords
- Item 4 contains `model: sonnet` for spec review and consumer verification
- Item 5 contains `model: haiku` for Explore agents

**Step 3: Commit**

```bash
git add skills/start-feature/SKILL.md
git commit -m "perf: add model guidance for implementation subagents in YOLO override"
```

---

### Task 2: Downgrade feature-dev:code-reviewer from opus to sonnet

**Files:**
- Modify: `skills/start-feature/SKILL.md:676`

**Acceptance Criteria:**
- [ ] The `feature-dev:code-reviewer` row in the Code Review Pipeline table ends with `| sonnet |` (not `| opus |`)
- [ ] All other table rows are unchanged

**Step 1: Change the model value**

On line 676, change:
```
| `feature-dev:code-reviewer` | feature-dev | Bugs, logic errors, security, conventions | **Report** → Claude fixes | opus |
```
to:
```
| `feature-dev:code-reviewer` | feature-dev | Bugs, logic errors, security, conventions | **Report** → Claude fixes | sonnet |
```

**Step 2: Verify the edit**

Read `skills/start-feature/SKILL.md` around line 676 and confirm:
- `feature-dev:code-reviewer` row shows `sonnet`
- Adjacent rows are unchanged (`code-simplifier` = sonnet, `superpowers:code-reviewer` = opus still at this point)

**Step 3: Commit**

```bash
git add skills/start-feature/SKILL.md
git commit -m "perf: downgrade feature-dev:code-reviewer from opus to sonnet"
```

---

### Task 3: Downgrade superpowers:code-reviewer from opus to sonnet

**Files:**
- Modify: `skills/start-feature/SKILL.md:677`

**Acceptance Criteria:**
- [ ] The `superpowers:code-reviewer` row in the Code Review Pipeline table ends with `| sonnet |` (not `| opus |`)
- [ ] The `backend-api-security:backend-security-coder` row still ends with `| opus |`
- [ ] All other table rows are unchanged

**Step 1: Change the model value**

On line 677, change:
```
| `superpowers:code-reviewer` | superpowers | General quality, plan adherence | **Report** → Claude fixes | opus |
```
to:
```
| `superpowers:code-reviewer` | superpowers | General quality, plan adherence | **Report** → Claude fixes | sonnet |
```

**Step 2: Verify the edit**

Read `skills/start-feature/SKILL.md` around line 677 and confirm:
- `superpowers:code-reviewer` row shows `sonnet`
- `backend-api-security:backend-security-coder` still shows `opus`
- Final table model distribution: sonnet (6 agents), opus (1 agent)

**Step 3: Commit**

```bash
git add skills/start-feature/SKILL.md
git commit -m "perf: downgrade superpowers:code-reviewer from opus to sonnet"
```
