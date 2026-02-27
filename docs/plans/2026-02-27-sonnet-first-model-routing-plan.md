# Sonnet-First Model Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Default the feature-flow lifecycle to Sonnet for orchestrator phases and all subagent dispatches, escalating to Opus only for brainstorming and design document phases that require deep reasoning.

**Architecture:** Add a Session Model Recommendation section to Step 0 in SKILL.md, insert phase-boundary model hints in Step 3's execution loop, expand the Model Routing Defaults section with orchestrator-level guidance and a Sonnet-first philosophy preamble, and update references/tool-api.md to reflect the consolidated approach.

**Tech Stack:** Markdown skill instructions (SKILL.md, tool-api.md)

---

### Task 1: Add Session Model Recommendation to Step 0

**Files:**
- Modify: `skills/start/SKILL.md` (after the Base Branch Detection subsection in Step 0, around line 170)

**Context:** Step 0 currently ends with Base Branch Detection. A new subsection is needed after it to recommend the session model before the lifecycle begins executing phases. This ensures the orchestrator itself runs on Sonnet for mechanical work.

**Step 1: Add the Session Model Recommendation subsection**

Insert the following after the Base Branch Detection section's closing announcement line (`Announce: "Detected base branch: [branch]. All PR targets and branch diffs will use this."`), before `### Step 1: Determine Scope`:

```markdown
**Session Model Recommendation:**

After detecting the base branch, check the current session model and recommend Sonnet-first routing. The lifecycle's mechanical phases (implementation, review, verification, git operations) do not require Opus-level reasoning — Sonnet handles them equally well at ~80% lower cost.

1. Announce the recommendation:
   ```
   Model routing: Sonnet-first is recommended for this lifecycle.
   - Brainstorming and design phases benefit from Opus (deep reasoning)
   - Implementation, review, and verification phases run well on Sonnet
   - All subagent dispatches set explicit model parameters (see Model Routing Defaults)
   If you're on Opus, consider `/model sonnet` — the skill will suggest `/model opus` before phases that benefit from it.
   ```
2. This is informational only — no prompt, no mode gate. The lifecycle works on any model; Opus is a quality upgrade for reasoning-heavy phases, not a hard requirement.

**YOLO behavior:** No prompt — always announced. Announce: `YOLO: start — Session model recommendation → Sonnet-first (informational)`
```

**Step 2: Verify the edit**

Read the modified section to confirm:
- The new subsection appears after Base Branch Detection and before Step 1
- The YOLO behavior line follows the same pattern as other YOLO announcements in Step 0
- No existing content was displaced or duplicated

**Acceptance Criteria:**
- [ ] SKILL.md contains a `**Session Model Recommendation:**` subsection in Step 0
- [ ] The subsection appears after `**Base Branch Detection:**` and before `### Step 1: Determine Scope`
- [ ] The subsection includes a `YOLO behavior:` line with the announcement pattern `YOLO: start — Session model recommendation →`
- [ ] The subsection does NOT add any `AskUserQuestion` prompt — it is informational only
- [ ] The recommendation text mentions `/model sonnet` and `/model opus` as CLI commands

**Quality Constraints:**
- Pattern reference: follow the formatting of the `**Base Branch Detection:**` subsection directly above (bold header, numbered process steps, code block for announcement, YOLO behavior line)
- Function length: this is a single markdown subsection — keep it under 20 lines of content

---

### Task 2: Add Phase-Boundary Model Hints to Step 3

**Files:**
- Modify: `skills/start/SKILL.md` (in Step 3: Execute Steps in Order, after the Skill Mapping table)

**Context:** Step 3's execution loop invokes skills in order but has no guidance about model switches between phases. Phase-boundary hints tell the orchestrator when to suggest the user switch models for optimal cost/quality tradeoff.

**Step 1: Add the Phase-Boundary Model Hints subsection**

Insert a new subsection after the `### Skill Mapping` table (after the last row `| Comment and close issue | ...`) and before `### Brainstorming Interview Format Override`:

```markdown
### Phase-Boundary Model Hints

At phase transitions between reasoning-heavy and mechanical work, output a model switch suggestion. These are suggestions only — the lifecycle functions on any model.

**Escalation hint (before reasoning-heavy phases):**

Before invoking `superpowers:brainstorming` or `feature-flow:design-document`, output:
```
Entering [phase name] — this phase benefits from Opus-level reasoning.
Consider: /model opus
```

**De-escalation hint (after reasoning-heavy phases):**

After the design document step completes (or after design verification if present), output:
```
Design phase complete — switching to implementation phases.
Consider: /model sonnet
```

**Suppression rules:**
- **YOLO mode:** Hints suppressed — do not output. Announce inline: `YOLO: start — Phase-boundary model hint → suppressed ([phase])`
- **Express mode:** Hints shown — output the suggestion block
- **Interactive mode:** Hints shown — output the suggestion block
- **Quick fix scope:** No hints — too few phases to warrant switching
```

**Step 2: Verify the edit**

Read the modified section to confirm:
- The new subsection appears after Skill Mapping and before Brainstorming Interview Format Override
- The suppression rules follow the same pattern as Context Window Checkpoints (YOLO suppressed, Express/Interactive shown)
- The hint format is concise (2 lines per hint block)

**Acceptance Criteria:**
- [ ] SKILL.md contains a `### Phase-Boundary Model Hints` subsection in Step 3
- [ ] The subsection appears after `### Skill Mapping` and before `### Brainstorming Interview Format Override`
- [ ] The subsection defines an escalation hint before `superpowers:brainstorming` and `feature-flow:design-document`
- [ ] The subsection defines a de-escalation hint after design document (or design verification) completion
- [ ] Suppression rules include YOLO (suppressed), Express (shown), Interactive (shown), Quick fix (no hints)
- [ ] The hints use `/model opus` and `/model sonnet` as the CLI commands

**Quality Constraints:**
- Pattern reference: follow the formatting of `### Context Window Checkpoints` for the suppression rules table structure
- Function length: keep the subsection under 30 lines — hints should be concise

---

### Task 3: Expand Model Routing Defaults with Sonnet-First Philosophy

**Files:**
- Modify: `skills/start/SKILL.md` (the existing `### Model Routing Defaults` section, around line 718)

**Context:** The current Model Routing Defaults section covers subagent dispatch models only. It needs a Sonnet-first philosophy preamble and an orchestrator-level phase table to serve as the single source of truth for all model routing decisions.

**Step 1: Expand the Model Routing Defaults section**

Replace the existing section preamble (the line starting with "This section applies unconditionally...") with an expanded version that adds:

1. A Sonnet-first philosophy statement
2. An orchestrator-level phase table (before the existing subagent table)
3. A cost evidence summary

The existing subagent table and enforcement paragraph are preserved.

New content for the section:

```markdown
### Model Routing Defaults

**Sonnet-first philosophy:** Default to Sonnet for the entire lifecycle. Escalate to Opus only for phases requiring deep creative or architectural reasoning. This reduces session cost by ~75% with no quality loss on mechanical work (implementation, review, verification, git operations). Evidence: a full lifecycle on Opus costs ~$61; Sonnet-first routing costs ~$27 (source: session analysis in issue #94).

This section applies unconditionally in all modes (YOLO, Express, Interactive). It is the single source of truth for model routing — all other sections reference this table rather than re-stating rules.

**Orchestrator-level phases (main conversation model):**

| Phase | Recommended Model | Rationale |
|-------|-------------------|-----------|
| Brainstorming | `opus` | Creative reasoning, design-level decisions |
| Design document | `opus` | Architectural decisions, trade-off analysis |
| Design verification | `sonnet` | Checklist comparison against codebase |
| Implementation planning | `sonnet` | Structured task decomposition from approved design |
| Study existing patterns | `sonnet` | Pattern extraction (subagents use `haiku`) |
| Implementation (orchestrator) | `sonnet` | Dispatching and reviewing subagent results |
| Self-review | `sonnet` | Checklist-based diff review |
| Code review pipeline | `sonnet` | Dispatching and consolidating agent results |
| CHANGELOG generation | `sonnet` | Mechanical commit parsing |
| Final verification | `sonnet` | Acceptance criteria checking |
| Git operations (commit, PR, issue) | `sonnet` | Mechanical CLI operations |

**Subagent dispatches (Task tool `model` parameter):**
```

Then keep the existing subagent table and enforcement paragraph exactly as-is.

**Step 2: Verify the edit**

Read the modified section to confirm:
- The Sonnet-first philosophy statement is the first paragraph
- The orchestrator-level phase table appears before the subagent dispatch table
- The existing subagent table and enforcement paragraph are preserved unchanged
- The cost evidence references issue #94

**Acceptance Criteria:**
- [ ] Model Routing Defaults section starts with a `**Sonnet-first philosophy:**` paragraph
- [ ] The philosophy paragraph references issue #94 and includes cost figures (~$61 Opus vs ~$27 Sonnet-first)
- [ ] An `**Orchestrator-level phases**` table exists with at least 10 phase rows
- [ ] The orchestrator table shows `opus` only for Brainstorming and Design document phases
- [ ] All other orchestrator phases show `sonnet`
- [ ] The existing `**Subagent dispatches**` table is preserved with its 4 rows (Explore/haiku, general-purpose/sonnet, Plan/sonnet, Spec review/sonnet)
- [ ] The `**Enforcement:**` paragraph is preserved unchanged
- [ ] The section states it is "the single source of truth for model routing"

**Quality Constraints:**
- Pattern reference: follow the existing table formatting (pipe-delimited markdown tables with header row)
- No duplication: the orchestrator table must not duplicate the subagent table — they cover different concerns (conversation model vs Task tool `model` parameter)
- DRY: other sections that currently state model routing rules inline should reference this section instead of restating them

---

### Task 4: Update references/tool-api.md with Sonnet-First Guidance

**Files:**
- Modify: `references/tool-api.md` (the Recommended Model Defaults section, around line 48)

**Context:** The tool-api.md file has a Recommended Model Defaults section that documents subagent model defaults. It needs to be updated to reflect the Sonnet-first philosophy and reference the expanded SKILL.md section as the single source of truth.

**Step 1: Update the Recommended Model Defaults section**

Replace the current override guidance paragraph (starting with `**Override guidance:**`) with an updated version:

```markdown
**Sonnet-first principle:** The feature-flow lifecycle defaults to Sonnet for all mechanical work. Opus is reserved for creative/architectural reasoning (brainstorming, design documents). Always set the `model` parameter explicitly — omitting it causes agents to inherit the parent model, which wastes cost if the parent is Opus.

**Override guidance:** Use `sonnet` for Explore agents that do substantive analysis (e.g., design-verification batch agents). Use `opus` for implementation agents handling architectural complexity. For the full orchestrator-level phase table and override conditions, see the Model Routing Defaults section in `skills/start/SKILL.md`.
```

**Step 2: Verify the edit**

Read the modified section to confirm:
- The Sonnet-first principle paragraph is present
- The existing table (Explore/haiku, general-purpose/sonnet, Plan/sonnet) is preserved
- The override guidance still references SKILL.md

**Acceptance Criteria:**
- [ ] tool-api.md contains a `**Sonnet-first principle:**` paragraph in the Recommended Model Defaults section
- [ ] The paragraph states that Opus is reserved for creative/architectural reasoning
- [ ] The paragraph warns about explicit `model` parameter to avoid Opus inheritance
- [ ] The existing 3-row model defaults table (Explore/haiku, general-purpose/sonnet, Plan/sonnet) is preserved unchanged
- [ ] The override guidance references `skills/start/SKILL.md` Model Routing Defaults section

**Quality Constraints:**
- Pattern reference: follow the existing bold-label paragraph style in tool-api.md
- DRY: do not duplicate the orchestrator phase table from SKILL.md — reference it instead
