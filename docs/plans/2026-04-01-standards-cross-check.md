# Standards Cross-Check — Design Document

**Date:** 2026-04-01
**Status:** Draft

## Overview

Add a "Standards Cross-Check" step to the `design-document` skill that reads project-specific standards files (architecture docs, coding conventions, style guides) and verifies the design spec against them. Conflicts are surfaced as a report table. In YOLO/Express mode, concrete fixes are auto-applied; in Interactive mode, the user approves each correction. This ensures designs conform to documented project standards before implementation planning begins.

## User Flow

### Step 1 — Configuration

The user adds a `standards` namespace to `.feature-flow.yml`:

```yaml
standards:
  enabled: true
  files:
    - docs/architecture.md
    - .claude/conventions.md
```

If the `standards` key is absent when the design-document skill runs, first-run auto-discovery triggers (see Pipeline / Architecture below).

### Step 2 — Cross-Check Execution (design-document Step 6)

After the design document is presented for review (current Step 5), the skill reads all configured standards files and passes them as context alongside the design document to the LLM. The LLM identifies conflicts between the design and the documented standards.

### Step 3 — Report Display

A Standards Cross-Check Report is displayed as a table:

```
Standards Cross-Check Report

| Issue                                    | Source                    | Fix                                      |
|------------------------------------------|---------------------------|------------------------------------------|
| Design uses callbacks; project requires  | .claude/conventions.md:14 | Change event handling to async/await      |
| async/await for all async operations     |                           | pattern per project convention            |
| Missing error boundary around new        | docs/architecture.md:87   | Add ErrorBoundary wrapper to the new      |
| component tree                           |                           | ComponentTree section of the design       |
```

The report is display-only — it is not saved to the design document file.

### Step 4 — Corrections

- **Interactive mode:** Present the report, then ask the user which fixes to apply. Each concrete fix is applied via the Edit tool to the design document.
- **YOLO/Express mode:** Auto-apply all concrete fixes (those with specific, actionable changes). Skip vague fixes (e.g., "consider reviewing the approach"). Announce: `YOLO: design-document — Standards fixes → N applied, M skipped (vague)`

### Step 5 — No Issues Found

If no conflicts are detected, announce: `Standards cross-check passed — no conflicts found.` and proceed to Step 7 (Suggest Next Steps).

## Pipeline / Architecture

### First-Run Auto-Discovery

When `standards.files` is absent or empty and `standards.enabled` is not explicitly `false`, the skill scans for common standards files:

**Scan locations:** `.claude/`, `docs/`, project root

**Target filenames (case-insensitive):**
- `architecture.md`
- `conventions.md`
- `standards.md`
- `coding-standards.md`
- `style-guide.md`

**Excluded:** `CLAUDE.md` files (different purpose — memory/activity tracking, not project standards)

**Interactive mode:** Present discovered files via `AskUserQuestion` with `multiSelect: true`. The user selects which files to use as standards.

**YOLO/Express mode:** Auto-select all discovered files. Announce: `YOLO: design-document — Standards auto-discovery → N files found, all selected`

After selection, write the `standards` config to `.feature-flow.yml`:

```yaml
standards:
  enabled: true
  files:
    - docs/architecture.md
    - .claude/conventions.md
```

If no files are discovered, write `standards.enabled: false` and skip the cross-check silently.

### LLM-Inline Processing

The cross-check runs inline within the design-document skill — no subagents are dispatched. The process:

1. Read each file in `standards.files`
2. Concatenate file contents with source labels
3. Pass the standards context and the design document to the LLM with a prompt to identify conflicts
4. Parse the response into the Issue / Source / Fix table format

### Lifecycle Position

The cross-check is inserted as **Step 6** in the design-document skill, between the current Step 5 (Present for Review) and the current Step 6 (Suggest Next Steps), which becomes Step 7.

Updated step numbering:
1. Gather Context
2. Determine Sections
3. Write the Document
4. Save the Document
5. Present for Review
6. **Standards Cross-Check** (new)
7. Suggest Next Steps (renumbered from 6)

## Patterns & Constraints

### Error Handling

Uses the **exceptions** pattern (project design preference from `.feature-flow.yml`).

- **Missing standards file:** Warn and skip that file. Continue cross-check with remaining files. Announce: `Warning: Standards file [path] not found — skipping.`
- **All files missing:** Warn and skip the entire cross-check. Do not fail the design-document skill.
- **LLM parsing failure:** If the cross-check response cannot be parsed into the table format, display the raw response as a fallback and skip auto-corrections.

### Skip Behavior

The cross-check is skipped entirely (no output, no warning) when:
- `standards.enabled` is explicitly `false`
- `standards.files` is absent or empty AND auto-discovery finds no files

### File Count

No hard limit on the number of standards files. If more than 5 files are configured, warn: `Note: [N] standards files configured. Large standards sets may reduce cross-check precision.`

### Performance

- Standards files are read once per design-document run (no caching needed across runs)
- LLM-inline processing avoids subagent overhead — single-pass analysis
- File reads are sequential (standards files are typically small)

## Scope

### Included

- **`skills/design-document/SKILL.md`** — New Step 6 (Standards Cross-Check) with auto-discovery, report generation, and correction flow. Renumber current Step 6 to Step 7.
- **`skills/settings/SKILL.md`** — Add Standards settings to the existing "Design" category (not a new category — adding a 4th category would exceed the 4-option AskUserQuestion limit in Step 3). The Design category prompt gains a "Standards" option alongside "Design preferences". Shows file count and enabled/disabled status. Edit UI: add file (scan + manual path), remove file (select from list), toggle enabled/disabled.
- **`references/project-context-schema.md`** — New `standards` namespace documentation with `enabled` (boolean) and `files` (list of paths) fields.

### Excluded

- Writing-plans skill integration (standards enforcement at planning time is a superpowers plugin concern, not feature-flow)
- Standards file content validation (the skill trusts that configured files contain meaningful standards)
- Standards file editing or creation (out of scope — users maintain their own standards docs)
- Persistent cross-check history or saved reports (report is display-only per session)
- Cross-check for skills other than design-document
