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
2. If any line matches /^<plan\s/  → XML mode
3. Else                            → Prose mode (existing behavior unchanged)
```

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

> If any existing plan file in `docs/plans/` contains `<plan version=`, generate the new plan
> in XML format using the schema from `references/xml-plan-format.md`. Otherwise, use the
> existing prose format.

This is the only hook needed since `writing-plans` is an external plugin — the quality context
injection runs before every `superpowers:writing-plans` invocation.

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
