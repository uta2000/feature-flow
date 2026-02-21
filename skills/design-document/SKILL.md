---
name: design-document
description: This skill should be used when the user asks to "write a design doc", "create a design document", "document the design", "write up the design", "write a spec", "spec this out", or when brainstorming is complete and decisions need to be captured before implementation planning.
tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Task
---

# Design Document

Turn brainstorming decisions into a structured, implementable design document. The document serves as the single source of truth between brainstorming and implementation planning.

**Announce at start:** "Writing design document to capture the agreed design before implementation."

## When to Use

- After brainstorming a feature (decisions have been made)
- When the user has a clear idea of what to build and needs it documented
- Before writing an implementation plan
- When translating requirements into technical design

## Process

### Step 1: Gather Context

Collect the inputs needed to write the document:

1. **From the conversation:** Extract all decisions made during brainstorming — scope, approach, UX flow, data model, technical choices
2. **From the codebase and documentation:** Dispatch parallel Explore agents to gather context from multiple areas simultaneously.

#### Parallel Context Gathering

Launch 3-4 Explore agents in a **single message** using the Task tool with `subagent_type=Explore`. Announce: "Dispatching N context-gathering agents in parallel..."

| Agent | Assignment | Always? |
|-------|-----------|---------|
| Format patterns | Read existing design docs in `docs/plans/` and extract document structure, section patterns, and conventions | Yes |
| Stack & dependencies | Examine dependency files (`package.json`, config files), project structure, and tech stack conventions | Yes |
| Relevant code | Search for and read source files related to the feature being designed (e.g., existing components, routes, hooks, models in the affected areas) | Yes |
| Documentation (Context7) | If `.spec-driven.yml` has a `context7` field, Context7 is available, AND no documentation lookup step was already run in the `start-feature` lifecycle — query relevant Context7 libraries for current patterns the design should follow. Skip this agent if any condition is not met. | Conditional |

**Context passed to each agent:**
- Feature description (from brainstorming output or issue body)
- Specific gathering assignment from the table above
- For the Documentation agent: library IDs from `.spec-driven.yml` `context7` field

**Expected return format per agent:**

```
{ area: string, findings: string[] }
```

#### Failure Handling

If an agent fails or crashes, retry it once. If it fails again, skip it and log a warning: "[Agent name] failed — [area] context skipped. Continuing with available results."

#### Consolidation

After all agents complete, synthesize their findings into a unified context summary for writing the design document.

If the conversation does not contain enough decisions, ask the user to clarify. Use `AskUserQuestion` — one question at a time, with options when possible.

**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, do not call `AskUserQuestion` for clarification. Instead, answer the questions from available context (brainstorming output, issue body, codebase analysis) and announce each: `YOLO: design-document — [question] → [answer]`. If critical information is genuinely missing (not inferable from any source), note it as `[TBD]` in the design document rather than guessing.

### Step 2: Determine Sections

Select sections based on what the feature requires. Not every feature needs every section.

**Required sections:**
- **Overview** — What the feature does, in 2-3 sentences
- **User Flow** — Step-by-step from the user's perspective
- **Scope** — What is included and what is explicitly excluded

**Include when applicable:**

| Section | Include When |
|---------|-------------|
| Example | The feature has input/output that benefits from a concrete example |
| Data Model Changes | The feature requires new or modified database tables/columns |
| Migration Requirements | Database migrations are needed (numbered list) |
| API / Integration | The feature calls external APIs or introduces new internal API routes |
| Pipeline / Architecture | The feature involves multi-step processing, async flows, or new hooks |
| LLM Integration | The feature uses an LLM (model, prompt design, output format, validation) |
| UI Adaptations | Existing UI components need modification for the new feature |
| New Components | New UI components, hooks, or utilities need to be built |

**Include when platform is mobile (ios, android, cross-platform):**

Check for `.spec-driven.yml` in the project root to determine the platform. If `platform` is `ios`, `android`, or `cross-platform`, add these sections:

| Section | Required | Purpose |
|---------|----------|---------|
| Feature Flag Strategy | Yes | How the feature can be killed server-side without an app update |
| Rollback Plan | Yes | Multi-version compatibility strategy since "revert deploy" doesn't work |
| API Versioning | If API changes | How old app versions interact with the new backend |
| Device Compatibility | Yes | Minimum OS versions, screen sizes, accessibility |

See `../../references/platforms/mobile.md` for section templates.

### Step 3: Write the Document

Write each section following these principles (see `references/section-templates.md` for templates):

- **Specific over vague:** Use actual table names, column types, file paths, and component names from the codebase
- **Decisions over options:** The design doc records what was decided, not what could be decided. If something is unresolved, flag it explicitly.
- **Minimal necessary detail:** Enough for an implementation plan to be written from it, but not implementation-level pseudocode
- **Cross-reference the codebase:** When referencing existing patterns, mention the actual files and functions

**Document format:**

```markdown
# [Feature Name] — Design Document

**Date:** YYYY-MM-DD
**Status:** Draft

## Overview
[2-3 sentences]

## Example
[Concrete input/output if applicable]

## User Flow
### Step 1 — [Name]
### Step 2 — [Name]
### Step 3 — [Name]

## [Technical sections as needed]

## Migration Requirements
[Numbered list of all schema/type changes]

## Scope
- [What's included]
- [What's explicitly excluded]
```

### Step 4: Save the Document

Write the document to the plans directory:

```
docs/plans/YYYY-MM-DD-[feature-name].md
```

Use today's date. Use kebab-case for the feature name.

If a design doc for this feature already exists (from a previous session), update it rather than creating a new file.

### Step 5: Present for Review

Present the document section by section (200-300 words per section). After each section, confirm with the user:

```
Does this section look right, or should I adjust anything?
```

If the document is short enough (under 1,000 words total), present it all at once.

**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip section-by-section confirmation. Present the full document at once without asking "Does this section look right?" after each section. Announce: `YOLO: design-document — Section approval → Accepted (all sections)`

### Step 6: Suggest Next Steps

After the document is approved:

```
Design document saved to `docs/plans/YYYY-MM-DD-[feature-name].md`.

Recommended next steps:
1. Run `design-verification` to check this design against the codebase
2. Run `create-issue` to create a GitHub issue from this design
3. Run `writing-plans` to create an implementation plan with acceptance criteria
```

## Quality Rules

- **No orphan decisions:** Every decision from brainstorming must appear in the document. Review the conversation to confirm nothing was missed.
- **No unresolved ambiguity:** If something is unclear, ask the user rather than guessing. Flag explicitly unresolved items with `[TBD]`.
- **Match codebase terminology:** Use the same names for tables, columns, types, and components as they exist in the codebase.
- **Migration completeness:** Every proposed schema change must appear in the Migration Requirements section as a numbered item.

## Additional Resources

### Reference Files

For section templates and examples across different feature types:
- **`references/section-templates.md`** — Templates for each section type with examples from different feature categories (API features, UI features, data migrations, integrations)

For platform-specific section templates:
- **`../../references/platforms/mobile.md`** — Feature Flag Strategy, Rollback Plan, API Versioning, Device Compatibility templates
- **`../../references/platforms/web.md`** — Browser Compatibility, SEO Considerations templates
