# Intelligent Model Routing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `model` parameters to all Task tool dispatches in the feature-flow plugin so reasoning tasks use Opus, structured tasks use Sonnet, and file-search tasks use Haiku.

**Architecture:** Markdown-only edits across 4 skill files. Each dispatch instruction gains a `model` parameter. A user override paragraph is added to start-feature.

**Tech Stack:** Claude Code plugin (markdown skill files)

---

### Task 1: Add model routing to code review pipeline in start-feature

**Files:**
- Modify: `skills/start-feature/SKILL.md:487-499`

**Acceptance Criteria:**
- [ ] The dispatch instruction at ~line 487 includes guidance to pass the `model` parameter for each agent
- [ ] The agent table has a `Model` column with values: opus for `superpowers:code-reviewer`, `feature-dev:code-reviewer`, `backend-api-security:backend-security-coder`; sonnet for `pr-review-toolkit:code-simplifier`, `pr-review-toolkit:silent-failure-hunter`, `pr-review-toolkit:pr-test-analyzer`, `pr-review-toolkit:type-design-analyzer`
- [ ] The table retains all existing columns (Agent, Plugin, Role, Fix Mode)

**Step 1: Update the dispatch instruction paragraph**

Replace the dispatch instruction at ~line 489 to include model routing:

```markdown
Dispatch all available review agents in parallel. For each agent, use the Task tool with the agent's `subagent_type` and `model` parameter (see table below). Each agent's prompt should include the full branch diff (`git diff main...HEAD`) and a description of what to review. Launch all agents in a single message to run them concurrently.
```

**Step 2: Add Model column to the agent table**

Replace the existing table at ~lines 491-497 with:

```markdown
| Agent | Plugin | Role | Fix Mode | Model |
|-------|--------|------|----------|-------|
| `pr-review-toolkit:code-simplifier` | pr-review-toolkit | DRY, clarity, maintainability | **Direct** — writes fixes to files | sonnet |
| `pr-review-toolkit:silent-failure-hunter` | pr-review-toolkit | Silent failures, empty catches, bad fallbacks | **Direct** — auto-fixes common patterns | sonnet |
| `feature-dev:code-reviewer` | feature-dev | Bugs, logic errors, security, conventions | **Report** → Claude fixes | opus |
| `superpowers:code-reviewer` | superpowers | General quality, plan adherence | **Report** → Claude fixes | opus |
| `pr-review-toolkit:pr-test-analyzer` | pr-review-toolkit | Test coverage quality, missing tests | **Report** → Claude fixes | sonnet |
| `backend-api-security:backend-security-coder` | backend-api-security | Input validation, auth, OWASP top 10 | **Report** → Claude fixes | opus |
| `pr-review-toolkit:type-design-analyzer` | pr-review-toolkit | Type encapsulation, invariants, type safety | **Report** → Claude fixes | sonnet |
```

**Step 3: Commit**

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat: add model routing to code review pipeline agents"
```

---

### Task 2: Add user override mechanism to start-feature

**Files:**
- Modify: `skills/start-feature/SKILL.md:485-489`

**Acceptance Criteria:**
- [ ] A "Model override" paragraph exists before the dispatch instruction in Phase 1
- [ ] The paragraph instructs Claude to respect user model preferences (e.g., "use opus for everything") by overriding the table defaults
- [ ] The paragraph applies to ALL agent dispatches in the code review step, not just a subset

**Step 1: Add override paragraph**

Insert the following paragraph between the `**Process:**` line and `#### Phase 1:`:

```markdown
**Model override:** If the user has requested a specific model for the entire lifecycle (e.g., "use opus for everything" or "use sonnet for everything"), apply that model to all agent dispatches below, overriding the per-agent defaults in the table.
```

**Step 2: Commit**

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat: add user model override mechanism to code review pipeline"
```

---

### Task 3: Add model routing to pattern study agents in start-feature

**Files:**
- Modify: `skills/start-feature/SKILL.md:367`

**Acceptance Criteria:**
- [ ] The Explore agent dispatch at ~line 367 (Study Existing Patterns) includes `model: haiku` in the Task tool instruction
- [ ] The existing dispatch text and context requirements are preserved

**Step 1: Update the dispatch instruction**

Replace the dispatch line at ~line 367:

From:
```markdown
   Use the Task tool with `subagent_type=Explore`. Launch all agents in a **single message** to run them concurrently. Announce: "Dispatching N pattern study agents in parallel..."
```

To:
```markdown
   Use the Task tool with `subagent_type=Explore` and `model: haiku`. Launch all agents in a **single message** to run them concurrently. Announce: "Dispatching N pattern study agents in parallel..."
```

**Step 2: Commit**

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat: route pattern study Explore agents to haiku"
```

---

### Task 4: Add model routing to context-gathering agents in design-document

**Files:**
- Modify: `skills/design-document/SKILL.md:31`

**Acceptance Criteria:**
- [ ] The Explore agent dispatch at ~line 31 includes `model: haiku` in the Task tool instruction
- [ ] The existing dispatch text, agent table, and context requirements are preserved

**Step 1: Update the dispatch instruction**

Replace the dispatch line at ~line 31:

From:
```markdown
Launch 3-4 Explore agents in a **single message** using the Task tool with `subagent_type=Explore`. Announce: "Dispatching N context-gathering agents in parallel..."
```

To:
```markdown
Launch 3-4 Explore agents in a **single message** using the Task tool with `subagent_type=Explore` and `model: haiku`. Announce: "Dispatching N context-gathering agents in parallel..."
```

**Step 2: Commit**

```bash
git add skills/design-document/SKILL.md
git commit -m "feat: route context-gathering Explore agents to haiku"
```

---

### Task 5: Add model routing to design-verification agents

**Files:**
- Modify: `skills/design-verification/SKILL.md:56,84,102`

**Acceptance Criteria:**
- [ ] The Explore agent dispatch at ~line 56 (Step 3: codebase exploration) includes `model: haiku`
- [ ] The Explore agent dispatch at ~line 84 (Step 4: verification batches 1-5) includes `model: sonnet`
- [ ] The Explore agent dispatch at ~line 102 (Batch 6 conditional) includes `model: sonnet`
- [ ] All existing dispatch text, context requirements, and batch assignments are preserved

**Step 1: Update Step 3 exploration dispatch (haiku)**

Replace at ~line 56:

From:
```markdown
Launch exploration agents to understand the areas of the codebase affected by the design. Use the Task tool with `subagent_type=Explore` for thorough analysis.
```

To:
```markdown
Launch exploration agents to understand the areas of the codebase affected by the design. Use the Task tool with `subagent_type=Explore` and `model: haiku` for thorough analysis.
```

**Step 2: Update Step 4 verification batch dispatch (sonnet)**

Replace at ~line 84:

From:
```markdown
Use the Task tool with `subagent_type=Explore` for Batches 1-5. Launch all applicable batch agents in a **single message** to run them concurrently. Announce: "Dispatching N verification agents in parallel..."
```

To:
```markdown
Use the Task tool with `subagent_type=Explore` and `model: sonnet` for Batches 1-5. Launch all applicable batch agents in a **single message** to run them concurrently. Announce: "Dispatching N verification agents in parallel..."
```

**Step 3: Update Batch 6 conditional dispatch (sonnet)**

Replace at ~line 102:

From:
```markdown
Batch 6 (Stack/Platform/Docs) is only dispatched if `.feature-flow.yml` exists with a non-empty `stack`, `platform`, or `gotchas` field, or if Context7 is available. If none of these conditions are met, skip Batch 6 entirely. When the conditions are met, use the Task tool with `subagent_type=Explore` for Batch 6 and include it in the same single-message launch as Batches 1-5 so all agents run concurrently.
```

To:
```markdown
Batch 6 (Stack/Platform/Docs) is only dispatched if `.feature-flow.yml` exists with a non-empty `stack`, `platform`, or `gotchas` field, or if Context7 is available. If none of these conditions are met, skip Batch 6 entirely. When the conditions are met, use the Task tool with `subagent_type=Explore` and `model: sonnet` for Batch 6 and include it in the same single-message launch as Batches 1-5 so all agents run concurrently.
```

**Step 4: Commit**

```bash
git add skills/design-verification/SKILL.md
git commit -m "feat: route verification agents to sonnet, exploration to haiku"
```

---

### Task 6: Add model routing to spike experiment agents

**Files:**
- Modify: `skills/spike/SKILL.md:98`

**Acceptance Criteria:**
- [ ] The general-purpose agent dispatch at ~line 98 includes `model: sonnet` in the Task tool instruction
- [ ] The existing dispatch text, isolation mode, concurrency limits, and context requirements are preserved

**Step 1: Update the dispatch instruction**

Replace at ~line 98:

From:
```markdown
Use the Task tool with `subagent_type=general-purpose` (not Explore — experiments execute scripts and need write access) and `isolation: "worktree"` for every agent. Launch up to **5 agents** in a single message to run them concurrently. If more than 5 assumptions need testing, dispatch the first 5, wait for completion, then dispatch the remainder.
```

To:
```markdown
Use the Task tool with `subagent_type=general-purpose`, `model: sonnet` (not Explore — experiments execute scripts and need write access), and `isolation: "worktree"` for every agent. Launch up to **5 agents** in a single message to run them concurrently. If more than 5 assumptions need testing, dispatch the first 5, wait for completion, then dispatch the remainder.
```

**Step 2: Commit**

```bash
git add skills/spike/SKILL.md
git commit -m "feat: route spike experiment agents to sonnet"
```
