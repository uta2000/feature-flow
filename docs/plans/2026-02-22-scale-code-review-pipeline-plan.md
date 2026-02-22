# Scale Code Review Pipeline to Feature Scope — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tier the code review pipeline's agent dispatch by scope classification so small enhancements use 2 agents instead of 7.

**Architecture:** Add a scope-to-tier mapping section before Phase 1 in the Code Review Pipeline Step of `skills/start/SKILL.md`. Annotate each agent in the dispatch table with its tier. Update all hardcoded agent count references in Phases 1–5 to be dynamic.

**Tech Stack:** Markdown (Claude Code plugin skill file)

---

### Task 1: Add scope-based tier selection section

**Files:**
- Modify: `skills/start/SKILL.md:734-736`

**What to change:**

Insert a new section after the "Large file handling" paragraph (line 734) and before the "#### Phase 1" heading (line 736). The new section defines the tier mapping and selection logic.

Insert this content between line 734 and line 736:

```markdown

**Scope-based agent selection:** Select which agents to dispatch based on the current lifecycle scope. The scope is determined in Step 1 and propagated through all steps.

| Scope | Tier | Agents to Dispatch |
|-------|------|--------------------|
| Small enhancement | 1 | `superpowers:code-reviewer`, `pr-review-toolkit:silent-failure-hunter` |
| Feature | 2 | Tier 1 + `pr-review-toolkit:code-simplifier`, `feature-dev:code-reviewer` |
| Major feature | 3 | All agents in the table below |

Only dispatch agents that belong to the current tier (or lower). The availability check still applies — if a tier-selected agent's plugin is missing, skip it as before.

```

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains the heading `**Scope-based agent selection:**` between the "Large file handling" paragraph and the Phase 1 heading
- [ ] The tier mapping table contains exactly 3 rows: Small enhancement (Tier 1, 2 agents), Feature (Tier 2, Tier 1 + 2 agents), Major feature (Tier 3, all agents)
- [ ] The text "Only dispatch agents that belong to the current tier" appears in the section

---

### Task 2: Add Tier column to the agent dispatch table

**Files:**
- Modify: `skills/start/SKILL.md:740-748`

**What to change:**

Add a `Tier` column to the existing agent dispatch table. The table currently has 5 columns (Agent, Plugin, Role, Fix Mode, Model). Add `Tier` as the last column.

Replace the current table with:

```markdown
| Agent | Plugin | Role | Fix Mode | Model | Tier |
|-------|--------|------|----------|-------|------|
| `pr-review-toolkit:code-simplifier` | pr-review-toolkit | DRY, clarity, maintainability | **Direct** — writes fixes to files | sonnet | 2 |
| `pr-review-toolkit:silent-failure-hunter` | pr-review-toolkit | Silent failures, empty catches, bad fallbacks | **Direct** — auto-fixes common patterns | sonnet | 1 |
| `feature-dev:code-reviewer` | feature-dev | Bugs, logic errors, security, conventions | **Report** → Claude fixes | sonnet | 2 |
| `superpowers:code-reviewer` | superpowers | General quality, plan adherence | **Report** → Claude fixes | sonnet | 1 |
| `pr-review-toolkit:pr-test-analyzer` | pr-review-toolkit | Test coverage quality, missing tests | **Report** → Claude fixes | sonnet | 3 |
| `backend-api-security:backend-security-coder` | backend-api-security | Input validation, auth, OWASP top 10 | **Report** → Claude fixes | opus | 3 |
| `pr-review-toolkit:type-design-analyzer` | pr-review-toolkit | Type encapsulation, invariants, type safety | **Report** → Claude fixes | sonnet | 3 |
```

**Acceptance Criteria:**
- [ ] The agent dispatch table has 6 columns: Agent, Plugin, Role, Fix Mode, Model, Tier
- [ ] `superpowers:code-reviewer` and `silent-failure-hunter` are marked Tier 1
- [ ] `code-simplifier` and `feature-dev:code-reviewer` are marked Tier 2
- [ ] `pr-test-analyzer`, `backend-security-coder`, and `type-design-analyzer` are marked Tier 3

---

### Task 3: Update Phase 1 dispatch text

**Files:**
- Modify: `skills/start/SKILL.md:738`

**What to change:**

Replace the current Phase 1 opening paragraph:

> Dispatch all available review agents in parallel. For each agent, use the Task tool with the agent's `subagent_type` and `model` parameter (see table below). Each agent's prompt should include the full branch diff (`git diff [base-branch]...HEAD`) and a description of what to review. Launch all agents in a single message to run them concurrently.

With:

> Dispatch the tier-selected review agents in parallel (see scope-based agent selection above). For each agent in the current tier, use the Task tool with the agent's `subagent_type` and `model` parameter (see table below). Each agent's prompt should include the full branch diff (`git diff [base-branch]...HEAD`) and a description of what to review. Launch all agents in a single message to run them concurrently.

Also update the availability check announcement on line 750 from:

> **Availability check:** Before dispatching, check which plugins are installed by looking for their skills in the loaded skill list. Skip agents whose plugins are missing. Announce: "Running N code review agents in parallel..." (where N is the count of available agents).

To:

> **Availability check:** Before dispatching, filter the table to agents matching the current tier (or lower), then check which of those agents' plugins are installed. Skip agents whose plugins are missing. Announce: "Running N code review agents in parallel (Tier T for [scope])..." (where N is the count of available tier-filtered agents and T is the tier number).

**Acceptance Criteria:**
- [ ] Phase 1 opening text contains "tier-selected review agents" instead of "all available review agents"
- [ ] Phase 1 opening text contains "see scope-based agent selection above"
- [ ] Availability check announcement includes "Tier T for [scope]" in the announce format

---

### Task 4: Update Phase 2 to handle variable direct-fix agents

**Files:**
- Modify: `skills/start/SKILL.md:754-759`

**What to change:**

Replace the current Phase 2 content:

```markdown
#### Phase 2: Review direct fixes

After all agents complete, the two direct-fix agents have already applied their changes to files. Review and summarize what they changed:

1. **`code-simplifier`** — Applied structural improvements directly (DRY extraction, clarity rewrites). Summarize what changed.
2. **`silent-failure-hunter`** — Auto-fixed common patterns (`catch {}` → `catch (e) { console.error(...) }`). Summarize what changed. Flag anything complex it couldn't auto-fix.
```

With:

```markdown
#### Phase 2: Review direct fixes

After all agents complete, review the direct-fix agents that were dispatched in this tier. Summarize what they changed:

1. **`silent-failure-hunter`** (Tier 1+) — Auto-fixed common patterns (`catch {}` → `catch (e) { console.error(...) }`). Summarize what changed. Flag anything complex it couldn't auto-fix.
2. **`code-simplifier`** (Tier 2+) — Applied structural improvements directly (DRY extraction, clarity rewrites). Summarize what changed.

If only Tier 1 agents were dispatched, only `silent-failure-hunter` results need review here.
```

**Acceptance Criteria:**
- [ ] Phase 2 text says "direct-fix agents that were dispatched in this tier" instead of "the two direct-fix agents"
- [ ] Each direct-fix agent is annotated with its tier: `silent-failure-hunter` (Tier 1+), `code-simplifier` (Tier 2+)
- [ ] Phase 2 includes the sentence "If only Tier 1 agents were dispatched, only `silent-failure-hunter` results need review here."

---

### Task 5: Update Phase 3 to use dynamic agent count

**Files:**
- Modify: `skills/start/SKILL.md:763`

**What to change:**

Replace:

> Collect findings from the 5 reporting agents. Consolidate them:

With:

> Collect findings from the reporting agents dispatched in Phase 1. Consolidate them:

**Acceptance Criteria:**
- [ ] Phase 3 text says "the reporting agents dispatched in Phase 1" instead of "the 5 reporting agents"

---

### Task 6: Update Phase 5 report template

**Files:**
- Modify: `skills/start/SKILL.md:810`

**What to change:**

Replace the report template line:

```
**Agents dispatched:** N/7
```

With:

```
**Agents dispatched:** N (Tier T — [scope])
```

This makes the report self-documenting: the reader sees which tier was selected and why, rather than a fraction that implies 7 is always the target.

**Acceptance Criteria:**
- [ ] Phase 5 report template contains `N (Tier T — [scope])` instead of `N/7`
