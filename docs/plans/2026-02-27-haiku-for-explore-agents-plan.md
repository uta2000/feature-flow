# Haiku for Explore Subagents — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish Haiku as the default model for Explore subagents across all run modes, closing the Interactive mode gap.

**Architecture:** Add a general "Model Routing Defaults" section to `skills/start/SKILL.md` that applies unconditionally. Simplify the YOLO override to reference it. Update `references/tool-api.md` with recommended defaults for skill authors.

**Tech Stack:** Markdown skill files (no application code)

---

### Task 1: Add Model Routing Defaults section to `skills/start/SKILL.md`

**Files:**
- Modify: `skills/start/SKILL.md` (insert between line 697 closing code fence of "Injection format" and line 699 "### Commit Planning Artifacts Step")

**Step 1: Insert the new section**

Insert the following markdown between the closing ``` on line 697 and the blank line before `### Commit Planning Artifacts Step` on line 699:

```markdown

### Model Routing Defaults

This section applies unconditionally in all modes (YOLO, Express, Interactive). When dispatching subagents via the Task tool, use these model defaults unless a skill documents a specific override with justification.

| `subagent_type` | Default Model | Rationale | Override When |
|-----------------|---------------|-----------|---------------|
| `"Explore"` | `haiku` | Read-only operations (Glob, Grep, Read, LS); no advanced reasoning needed | Task requires substantive analysis (e.g., design-verification batch agents making PASS/FAIL/WARNING judgments) — use `sonnet` and document justification inline |
| `"general-purpose"` | `sonnet` | Write access; needs reasoning for implementation | Task involves architectural complexity ("architect", "migration", "schema change", "new data model") — use `opus` |
| `"Plan"` | `sonnet` | Architecture planning requires reasoning | — |
| Spec review / consumer verification | `sonnet` | Checklist comparison work | — |

**Enforcement:** Convention-based via skill instructions. Skills that dispatch Task agents must include the `model` parameter explicitly. The YOLO/Express override section and inline steps reference this table rather than re-stating routing rules.

```

**Step 2: Verify the insertion**

Read lines 697-720 of `skills/start/SKILL.md` to confirm the new section sits between "Injection format" and "Commit Planning Artifacts Step".

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains a `### Model Routing Defaults` section
- [ ] The section appears between "Implementer Quality Context Injection" and "Commit Planning Artifacts Step"
- [ ] The section contains a table with 4 rows: Explore/haiku, general-purpose/sonnet, Plan/sonnet, spec review/sonnet
- [ ] The section states it applies "unconditionally in all modes (YOLO, Express, Interactive)"
- [ ] The Explore row specifies `haiku` as default with override guidance for substantive analysis

**Quality Constraints:**
- Pattern reference: Follow the existing table-based convention seen in the Code Review Pipeline agent table (same file, around line 860)
- Function length: N/A (markdown)
- Error handling: N/A (markdown)
- Types: N/A (markdown)

---

### Task 2: Simplify YOLO override point 5 in `skills/start/SKILL.md`

**Files:**
- Modify: `skills/start/SKILL.md:665`

**Step 1: Replace point 5 with a reference**

Change line 665 from:
```
5. When dispatching Explore agents during implementation, use `model: haiku`. These agents do read-only file exploration and pattern extraction.
```

To:
```
5. When dispatching Explore agents during implementation, follow the Model Routing Defaults section (`haiku`).
```

**Step 2: Verify the change**

Read lines 660-666 of `skills/start/SKILL.md` to confirm the reference is correct and the surrounding points (1-4) are unchanged.

**Acceptance Criteria:**
- [ ] Line 665 references "Model Routing Defaults section" instead of re-stating the full rule
- [ ] Line 665 still mentions `haiku` in parentheses for quick reference
- [ ] Points 1-4 (lines 661-664) are unchanged
- [ ] No other lines in the YOLO override section are modified

**Quality Constraints:**
- Pattern reference: Match the cross-reference style used elsewhere in the file (e.g., "see `../../references/tool-api.md`")
- Types: N/A
- Error handling: N/A

---

### Task 3: Update `references/tool-api.md` with model defaults

**Files:**
- Modify: `references/tool-api.md:22` (update Explore description)
- Modify: `references/tool-api.md:46` (insert new subsection after examples)

**Step 1: Update the Explore agent description**

Change line 22 from:
```
- `"Explore"` — Read-only codebase exploration (Glob, Grep, Read, Bash). Use for pattern study, codebase analysis, verification.
```

To:
```
- `"Explore"` — Read-only codebase exploration (Glob, Grep, Read, Bash). Use for pattern study, codebase analysis, verification. **Default model: `haiku`** (see Recommended Model Defaults below).
```

**Step 2: Insert the "Recommended Model Defaults" subsection**

Insert the following after line 46 (closing ``` of the examples block), before line 48 (`## Skill Tool`):

```markdown

### Recommended Model Defaults

When dispatching subagents, use these model defaults. Always set the `model` parameter explicitly — omitting it causes agents to inherit the parent model (often Opus), which is wasteful for simple tasks.

| `subagent_type` | Recommended Model | Rationale |
|-----------------|-------------------|-----------|
| `"Explore"` | `haiku` | Read-only; no advanced reasoning needed |
| `"general-purpose"` | `sonnet` | Write access; needs reasoning for implementation |
| `"Plan"` | `sonnet` | Architecture planning requires reasoning |

**Override guidance:** Use `sonnet` for Explore agents that do substantive analysis (e.g., design-verification batch agents). Use `opus` for implementation agents handling architectural complexity. Document overrides inline in the skill.

```

**Step 3: Verify both changes**

Read lines 20-55 of `references/tool-api.md` to confirm the Explore description update and the new subsection placement.

**Acceptance Criteria:**
- [ ] Line 22 of `references/tool-api.md` contains `**Default model: \`haiku\`**` in the Explore description
- [ ] A `### Recommended Model Defaults` subsection exists between the examples block and `## Skill Tool`
- [ ] The subsection contains a 3-row table: Explore/haiku, general-purpose/sonnet, Plan/sonnet
- [ ] The subsection includes override guidance mentioning sonnet for substantive analysis and opus for architectural complexity
- [ ] The subsection warns about parent model inheritance when `model` is omitted
- [ ] The existing `## Skill Tool` section is unchanged

**Quality Constraints:**
- Pattern reference: Follow the existing table format in `tool-api.md` (the parameter table at lines 10-18)
- Types: N/A
- Error handling: N/A
