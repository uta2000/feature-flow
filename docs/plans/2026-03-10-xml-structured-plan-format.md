# XML-Structured Plan Format — Design Document

**Issue:** #166 — XML-Structured Plan Format: Make plans machine-parseable for automation
**Date:** 2026-03-10
**Status:** Approved

---

## Summary

Feature-flow implementation plans are currently written in prose markdown and parsed by regex in
`verify-plan-criteria` and `verify-acceptance-criteria`. This works well for human authoring but
is fragile for machine extraction — edge cases in task headings, acceptance criteria formatting,
and Progress Index comments cause silent parsing failures.

This feature introduces an **optional XML-hybrid plan format** where XML tags wrap the key
machine-readable fields (task status, files, acceptance criteria) while prose content (steps,
quality constraints, descriptions) remains as markdown inside the XML structure. Existing prose
plans continue to work unchanged.

---

## Developer Flow

### Step 1 — Author a plan (opt-in)
A developer (or `writing-plans` subagent) writes a plan file with `<plan version="1.0">` at the top instead of the `<!-- PROGRESS INDEX -->` comment block. Task status, files, and acceptance criteria are in XML elements; prose (steps, quality constraints) stays as markdown inside each `<task>` block.

### Step 2 — Skills detect format automatically
When `verify-plan-criteria` or `verify-acceptance-criteria` reads a plan file, it checks the first 50 lines for `<plan`. If found → XML extraction path. If not found → existing prose/regex path. No configuration flag needed.

### Step 3 — Criteria and status are extracted deterministically
For XML plans, criteria come directly from `<criterion>` child elements. Task status comes from the `status=` attribute on `<task>`. No regex needed, no Progress Index comment to parse.

### Step 4 — Existing prose plans are unaffected
Teams that don't opt in to XML format continue working exactly as before. Both paths remain active in both skills indefinitely.

---

## Goals

1. **Reliable parsing:** Deterministic extraction of criteria, files, and task status from XML
   structure — no regex fragility on acceptance criteria or Progress Index comments.
2. **GSD readiness:** A well-defined schema that can be mapped to GSD's task graph format in a
   future integration (no GSD-specific coupling in v1).
3. **Backward compatibility:** All existing prose plans work without modification. XML is opt-in.

---

## Non-Goals (v1)

- Export CLI (prose → XML conversion tool) — deferred to follow-up issue
- GSD mapping layer — schema is designed to be mappable; actual mapping deferred
- XML schema validation (XSD/DTD) — string scanning is sufficient for Claude-generated plans
- Modifying the external `superpowers:writing-plans` plugin directly

---

## XML Schema

Plan files remain `.md` files. An XML plan opts in by including `<plan version="1.0">` within
the first 50 lines. Skills detect this presence to choose between the XML parser and the existing
prose/regex parser.

### Root structure

```xml
<plan version="1.0">

<!-- tasks go here -->

</plan>
```

### Task element

```xml
<task id="N" status="pending|in-progress|done" commit="OPTIONAL-SHA">
<title>Human-readable task title</title>

<files>
  <file action="create" path="path/to/new/file.md"/>
  <file action="modify" path="path/to/existing/file.md"/>
</files>

<criteria>
  <criterion>
    <what>The thing that should be true</what>
    <how>How we measure it</how>
    <command>the-verification-command --with args</command>
  </criterion>
  <criterion type="manual">Visual or subjective criterion — no command required</criterion>
</criteria>

**Quality Constraints:**
- Error handling: fall back to prose parser on malformed XML
- Types: all parsed fields are strings, never undefined
- Pattern: see references/xml-plan-format.md

**Steps:**
1. Step one description
2. Step two description

</task>
```

### Field reference

| Element / Attribute | Required | Description |
|---|---|---|
| `<plan version="1.0">` | Yes (to opt in) | Root element; version for future schema evolution |
| `<task id="N">` | Yes | Task number; must be unique within the plan |
| `<task status="...">` | Yes | `pending`, `in-progress`, or `done` |
| `<task commit="SHA">` | No | Git commit SHA when task is `done` |
| `<title>` | Yes | Task name displayed in progress reports |
| `<files>` | Recommended | Machine-readable file list for coverage analysis |
| `<file action="create\|modify" path="...">` | Yes (inside `<files>`) | One element per file |
| `<criteria>` | Yes | Contains one or more `<criterion>` elements |
| `<criterion>` | Yes (at least one) | Structured criterion; contains `<what>`, `<how>`, `<command>` |
| `<criterion type="manual">` | For manual checks | Text content only; no `<command>` child |
| `<what>` | Yes (non-manual) | The observable behavior or state |
| `<how>` | Yes (non-manual) | Measurement approach |
| `<command>` | Yes (non-manual) | Shell command that returns exit 0 on success |

### Complete annotated example

```xml
<plan version="1.0">

<task id="1" status="pending">
<title>Add XML detection to verify-plan-criteria</title>

<files>
  <file action="modify" path="skills/verify-plan-criteria/SKILL.md"/>
  <file action="create" path="tests/fixtures/sample-xml-plan.md"/>
</files>

<criteria>
  <criterion>
    <what>XML plans are detected when <plan appears in first 50 lines</what>
    <how>detection function returns true for XML fixture, false for prose fixture</how>
    <command>grep -c "&lt;plan" tests/fixtures/sample-xml-plan.md | grep -q "^1$"</command>
  </criterion>
  <criterion>
    <what>Prose plans still pass verify-plan-criteria unchanged</what>
    <how>running verify-plan-criteria on a prose fixture produces no new errors</how>
    <command>grep -c "### Task" tests/fixtures/sample-prose-plan.md | grep -qE "^[1-9]"</command>
  </criterion>
  <criterion type="manual">XML plan renders cleanly on GitHub with no raw tag artifacts</criterion>
</criteria>

**Quality Constraints:**
- Error handling: if `<plan` detected but XML is malformed, log warning and fall back to prose parser
- Types: extracted task list is always an array, never null
- Pattern: see references/xml-plan-format.md for extraction algorithm

**Steps:**
1. Add detection check: scan first 50 lines for `<plan`
2. If XML: extract `<task>` blocks, parse `<criteria>` children
3. If prose: route to existing regex parser unchanged
4. Write fixture files for both formats

</task>

</plan>
```

---

## Affected Files

### New files

| File | Purpose |
|---|---|
| `references/xml-plan-format.md` | Canonical schema spec, authoring guide, migration notes |
| `tests/fixtures/sample-xml-plan.md` | Valid XML plan fixture for skill testing |

### Modified files

| File | Change |
|---|---|
| `skills/verify-plan-criteria/SKILL.md` | Add XML detection + extraction path |
| `skills/verify-acceptance-criteria/SKILL.md` | Add XML detection + extraction path |
| `skills/start/references/yolo-overrides.md` | Add XML format guidance to Writing Plans quality context injection |

---

## Skills Modification Design

### Detection algorithm (both skills)

```
1. Read first 50 lines of plan file
2. Track whether inside a code fence (line starts with ```) — toggle on each fence open/close
3. For each non-fenced line: check if it matches /^<plan version="/
4. If match found → XML mode
5. Else           → Prose mode (existing behavior unchanged)
```

**Canonical detection pattern:** `/^<plan version="/` (not bare `<plan`) — this requires the version
attribute and avoids matching code block examples or documentation snippets. A bare `<plan>` tag
(no `version=`) is NOT treated as an XML plan.

**Truncation guard:** Before committing to XML mode, scan the full file for `</plan>`. If `</plan>`
is absent, log a warning ("plan appears truncated — treating as prose") and use prose mode.

### XML extraction algorithm (verify-plan-criteria)

```
1. Find all <task id="N" status="..."> blocks (string scan, not XML library)
2. For each task block:
   a. Extract <title> content → task name
   b. Extract <files> → list of {action, path} objects
   c. Extract <criteria> → list of criterion objects:
      - Structured: {what, how, command} from child elements
      - Manual: {type: "manual", text: ...}
   d. Read status attribute → replaces Progress Index parsing
3. Validate each criterion:
   - Structured criteria: check what/how/command are non-empty
   - Manual criteria: no format requirements
   - Flag empty <criteria> blocks as missing criteria
4. Report: same table format as today
```

### XML extraction algorithm (verify-acceptance-criteria)

```
1. Same detection as above
2. XML mode: extract <criterion> elements directly → no regex for "measured by" / "verified by"
3. For each criterion, build the run command from <command> element
4. Task status tracking: read status="done" from <task> attribute
   → replaces <!-- PROGRESS INDEX --> comment parsing
5. Prose mode: unchanged
```

### Writing-plans quality context injection update

Add to the existing injection in `skills/start/references/yolo-overrides.md`:

> **XML plan format (opt-in):** If the user explicitly requests XML format, or if the specific
> plan file being updated already begins with `<plan version="`, generate in XML format using
> the schema from `references/xml-plan-format.md`. Otherwise, use the existing prose format.
>
> **For XML plans only — suppress Progress Index:** Do NOT generate the `<!-- PROGRESS INDEX -->`
> HTML comment block. Task status is tracked via the `status=` attribute on `<task>` elements
> instead.

**Why this scope:** The injection is per-plan, not repo-wide. A team can have mixed prose and XML
plans in `docs/plans/` with no conflict. The Progress Index suppression is scoped to XML plans
only — prose plans continue to require the Progress Index as before.

---

## Patterns & Constraints

### Error Handling
- **Malformed XML triggers prose fallback** (announce: "XML structure invalid — falling back to prose parser"). Triggers:
  - `</plan>` absent from the full file (truncated plan)
  - A `<task>` block is not closed before the next `<task>` or `</plan>`
  - A `<criteria>` block is not closed before `</task>`
- **Per-criterion errors** (do not trigger full fallback — flag inline):
  - Missing `<what>`, `<how>`, or `<command>` inside a non-manual `<criterion>` → flag as "incomplete criterion"
  - Unexpected or missing `<how>` only → flag as incomplete (not malformed)
- **`<criteria>` present but empty** (no `<criterion>` children) → flag as "no criteria"
- **Unexpected `status=` value** (anything other than `pending`, `in-progress`, `done`) → treat as `pending`, log a note
- **Missing `status=` attribute** → treat as `pending`
- **`status="done"` without `commit=`** → allowed (commit SHA is optional per schema)

### Types
- All extracted fields (what, how, command, path, status) are strings — never coerced to other types
- Task list is always an array — never null, even for an empty plan
- The `type="manual"` attribute on `<criterion>` is the only supported attribute variant; any other type value is treated as a structured criterion
- **`[MANUAL]` prose prefix equivalence:** The prose `[MANUAL]` prefix on a criterion line and the XML `type="manual"` attribute are equivalent — both mean "manual check, no command required." Both verification skills treat them identically.

### Edge Cases
- **Duplicate task IDs** (`id="1"` appearing twice) → flag as "duplicate task ID — plan is invalid" and abort XML extraction; fall back to prose parser
- **`<plan version="` inside a code fence** → detection algorithm skips fenced lines (see Detection algorithm above); no false positive
- **`<criteria>` present, zero `<criterion>` children** → same as empty criteria block — flag as "no criteria"
- **`<criterion>` missing only `<how>`** → flag as incomplete criterion (not malformed); extraction continues for other criteria
- **Plan file with prose content after `</plan>`** → content after `</plan>` is ignored in XML mode
- **v1 scope: no split plan support** — XML plans do not support the split plan / Phase Manifest format. Plans requiring splitting (>15,000 words) must use the prose format. The implementation plan should note this constraint in the `references/xml-plan-format.md` authoring guide.

### Backward Compatibility Constraint
- Skills must never break on prose plans — the detection check is the single gate; once prose mode is selected, the existing code path runs unchanged
- The XML schema uses `version="1.0"` to allow future schema evolution without breaking existing readers

### Pattern Reference
- `skills/verify-plan-criteria/SKILL.md` — existing prose parsing logic (the XML path mirrors its output format)
- `skills/verify-acceptance-criteria/SKILL.md` — existing Progress Index parsing (XML `status=` attribute replaces this)
- `references/xml-plan-format.md` — canonical schema (new file, created in this feature)

---

## Backward Compatibility

- All existing prose plans (`.md` files without `<plan`) continue to work without modification
- Both skills maintain two code paths: XML and prose
- No configuration flag needed — format is auto-detected per file
- No migration required — teams adopt XML incrementally per new plan

---

## Test Fixtures

### `tests/fixtures/sample-xml-plan.md`
A minimal 2-task XML plan that covers:
- Both `pending` and `done` status
- Both structured and manual criteria
- Both `create` and `modify` file actions

### `tests/fixtures/sample-prose-plan.md`
A copy of (or link to) an existing prose plan from `docs/plans/` — confirms the prose path
still works after XML support is added.

---

## Open Questions

None — all design decisions resolved in brainstorming session on 2026-03-10.
