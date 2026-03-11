# XML Plan Format — Schema and Detection Reference

This file defines the canonical XML plan format, its detection algorithm, error handling rules, and edge cases. It is referenced by `skills/verify-plan-criteria/SKILL.md`, `skills/verify-acceptance-criteria/SKILL.md`, and `skills/start/references/yolo-overrides.md`.

<!-- section: overview -->
## Overview

The XML plan format is an **opt-in** hybrid format that wraps machine-readable fields (task status, file references, acceptance criteria) in XML tags while keeping prose content (steps, quality constraints, rationale) as plain markdown inside task blocks.

**Why it exists:** Prose plans are reliable for human reading but require fragile text parsing to extract structured data such as task status or acceptance criteria. The XML format gives verification skills a stable, unambiguous structure to query without forcing authors to abandon prose for everything.

**Prose plans are unaffected.** Any plan file that does not contain `<plan version="` (outside a code fence, within the first 50 lines) is parsed by the existing prose parser. No existing plans require migration.

**XML is opt-in.** Authors choose XML by writing `<plan version="1.0">` as the first non-fenced line of the plan file. All other plan files remain prose.

<!-- /section: overview -->

<!-- section: schema -->
## XML Schema

### Root Element

```xml
<plan version="1.0">
  ...tasks...
</plan>
```

The `version` attribute is **required**. A bare `<plan>` tag without `version=` is NOT detected as an XML plan — it is treated as prose.

### Task Element

```xml
<task id="1" status="pending">
  ...title, files, criteria, prose content...
</task>
```

| Attribute | Required | Values | Notes |
|-----------|----------|--------|-------|
| `id` | yes | positive integer string | Must be unique within the plan |
| `status` | yes | `pending`, `in-progress`, `done` | Unknown values are treated as `pending`; absent `status` is treated as `pending` |
| `commit` | no | git SHA string | Records the commit that completed this task; optional even when `status="done"` |

### Title Element

```xml
<title>Short task title</title>
```

Plain text child of `<task>`. Used as the human-readable label for the task.

### Files Element

```xml
<files>
  <file action="create" path="src/foo.ts" />
  <file action="modify" path="references/xml-plan-format.md" />
</files>
```

| Attribute | Required | Values |
|-----------|----------|--------|
| `action` | yes | `create`, `modify` |
| `path` | yes | relative file path string |

### Criteria Element

```xml
<criteria>
  <criterion>
    <what>Reference file is present</what>
    <how>file existence</how>
    <command>ls references/xml-plan-format.md</command>
  </criterion>
  <criterion type="manual">Examples are accurate and cover all common cases</criterion>
</criteria>
```

Each `<criterion>` represents one acceptance criterion.

| Element/Attribute | Required | Notes |
|-------------------|----------|-------|
| `<what>` | yes (non-manual) | Declarative statement of what must hold |
| `<how>` | yes (non-manual only) | Observable metric or artifact |
| `<command>` | yes (non-manual only) | Runnable shell command |
| `type="manual"` | no | Marks criterion as a manual check; `<how>` and `<command>` not required |

### Field Reference Table

| Field | XML location | Prose equivalent |
|-------|-------------|------------------|
| Task status | `<task status="...">` | Progress Index comment (`STATUS: pending/done`) |
| Task title | `<title>` | Heading under task section |
| Files modified | `<files>/<file>` | **Files modified:** list |
| Criterion what | `<what>` | Text before `measured by` |
| Criterion how | `<how>` | Text between `measured by` and `verified by` |
| Criterion command | `<command>` | Backtick command after `verified by` |
| Manual criterion | `type="manual"` | `[MANUAL]` prefix |

<!-- /section: schema -->

<!-- section: complete-example -->
## Complete Example

The following annotated example shows a two-task XML plan. Task 1 is pending with one structured criterion and one manual criterion. Task 2 is done and records the commit SHA in prose.

```xml
<plan version="1.0">

<task id="1" status="pending">
<title>Create references/xml-plan-format.md</title>

<files>
  <file action="create" path="references/xml-plan-format.md" />
</files>

<criteria>
  <criterion>
    <what>Reference file is present</what>
    <how>file existence</how>
    <command>ls references/xml-plan-format.md</command>
  </criterion>
  <criterion>
    <what>File contains plan version schema example</what>
    <how>grep match</how>
    <command>grep -q '&lt;plan version="1.0"&gt;' references/xml-plan-format.md</command>
  </criterion>
  <criterion type="manual">All sections are accurate, complete, and follow the acceptance-criteria-patterns.md document structure</criterion>
</criteria>

**Quality Constraints:**
- Pattern: follow `references/acceptance-criteria-patterns.md` document structure

**Steps:**

1. Write Overview, Schema, Complete Example, Detection Algorithm, Error Handling, Edge Cases, [MANUAL] Equivalence, Authoring Guide, and v1 Constraints sections.
2. Verify all grep checks pass.
3. Commit.

</task>

<task id="2" status="done" commit="abc1234">
<title>Update verify-plan-criteria skill to support XML plans</title>

<files>
  <file action="modify" path="skills/verify-plan-criteria/SKILL.md" />
</files>

<criteria>
  <criterion>
    <what>SKILL.md references xml-plan-format.md</what>
    <how>grep match</how>
    <command>grep -q 'xml-plan-format' skills/verify-plan-criteria/SKILL.md</command>
  </criterion>
</criteria>

Completed in commit abc1234. No regressions observed.

</task>

</plan>
```

<!-- /section: complete-example -->

<!-- section: detection-algorithm -->
## Detection Algorithm

The detection algorithm determines whether a plan file should be parsed as XML or prose. It runs once per plan file load.

### Steps

1. **Read the first 50 lines** of the plan file.
2. **Track code-fence state.** Maintain a boolean `in_fence`, initially `false`. For each line, if the line starts with ` ``` `, toggle `in_fence`.
3. **For each non-fenced line** (where `in_fence` is `false`): check whether the line matches the pattern `/^<plan version="/`.
4. **If a match is found** in the first 50 lines (outside a code fence) → candidate XML mode.
5. **Truncation guard:** Before committing to XML mode, scan the **full file** for the closing `</plan>` tag. If `</plan>` is absent → log `"plan appears truncated — treating as prose"` and use prose mode.
6. If `</plan>` is present → **XML mode confirmed**.
7. If no match was found in step 3 → **Prose mode**.

### Canonical Detection Pattern

```
/^<plan version="/
```

- Requires the `version` attribute to be present immediately after `<plan `.
- A bare `<plan>` tag (no `version=`) does **not** match and is treated as prose.
- The pattern is anchored to the start of the line (`^`) — inline occurrences do not trigger detection.
- Lines inside a code fence are skipped — the code-fence tracking in step 2 prevents false positives from XML examples embedded in prose plans.

<!-- /section: detection-algorithm -->

<!-- section: error-handling -->
## Error Handling

Error handling splits into two categories: **malformed XML triggers** that cause a full fallback to prose mode, and **per-criterion flags** that are reported inline without abandoning XML mode.

### Malformed XML Triggers (Full Fallback to Prose)

The following conditions indicate the XML structure is broken beyond recoverable inline repair. When any of these occur, the parser logs the specific error, abandons XML extraction, and re-parses the file using the prose parser.

| Condition | Log message |
|-----------|-------------|
| `</plan>` absent from full file (truncated) | `"plan appears truncated — treating as prose"` |
| `<task>` block not closed before next `<task>` or `</plan>` | `"malformed task block at id N — falling back to prose"` |
| `<criteria>` block not closed before `</task>` | `"malformed criteria block in task N — falling back to prose"` |
| Duplicate task IDs | `"duplicate task ID N — plan is invalid, falling back to prose"` |
| `<task>` opened after last `</task>` but before `</plan>` with no matching `</task>` | `"malformed task block at id N — falling back to prose"` |

> **Note:** `</plan>` presence (step 5 of the Detection Algorithm) is a necessary but not sufficient condition — unclosed `<task>` blocks after `</plan>` is present are caught separately during extraction (row 2 above).

### Per-Criterion Flags (Inline, No Fallback)

The following conditions are recoverable at the criterion level. The parser flags the individual criterion but continues processing the rest of the plan in XML mode.

| Condition | Behavior |
|-----------|----------|
| Missing `<what>`, `<how>`, or `<command>` inside a non-manual `<criterion>` | Flag criterion as `"incomplete criterion"` |
| `<criteria>` present but contains no `<criterion>` children | Flag task with `"no criteria"` |
| Unexpected `status=` value on `<task>` | Treat as `pending`, log note |
| Missing `status=` on `<task>` | Treat as `pending` |

<!-- /section: error-handling -->

<!-- section: edge-cases -->
## Edge Cases

| Scenario | Behavior |
|----------|----------|
| `<plan version="` inside a code fence | Detection skips fenced lines (code-fence tracking in step 2). No false positive — file is treated as prose. |
| Prose content after `</plan>` | Ignored in XML mode. The parser stops reading task data at `</plan>`. |
| Duplicate task IDs | Triggers full fallback to prose. Log: `"duplicate task ID N — plan is invalid, falling back to prose"`. |
| `<task>` without `status=` | Treated as `pending`. No error. |
| `<task>` with unrecognized `status=` value | Treated as `pending`. Log note. |
| `</plan>` present but no `<task>` elements | Valid empty plan. Zero tasks returned. |
| Manual criterion with `<how>` or `<command>` present | Fields are ignored (not validated, not surfaced). No error. |
| Plan file is empty | No match in first 50 lines → prose mode. |
| Plan file shorter than 50 lines | Algorithm reads all available lines; no error if file ends early. |
| Plan file is exactly 50 lines | Algorithm reads all 50 lines; line 50 is included in the scan (range is 1–50 inclusive). |

<!-- /section: edge-cases -->

<!-- section: manual-equivalence -->
## [MANUAL] Equivalence

The prose `[MANUAL]` prefix on a criterion line and the XML `type="manual"` attribute are **equivalent**. Both mean "manual check — no shell command required." Both verification skills (`verify-plan-criteria` and `verify-acceptance-criteria`) treat them identically.

**Prose format:**
```
- [ ] [MANUAL] Description of what a human must verify
```

**XML format:**
```xml
<criterion type="manual">Description of what a human must verify</criterion>
```

Both forms:
- Exempt the criterion from the structured `[WHAT] measured by [HOW] verified by [COMMAND]` format check.
- Appear in the acceptance criteria list and must be checked off before a task is considered complete.
- Are excluded from automated command execution.

See `references/acceptance-criteria-patterns.md § [MANUAL] Prefix Usage` for additional guidance on when to use manual criteria.

<!-- /section: manual-equivalence -->

<!-- section: authoring-guide -->
## Authoring Guide

How to write a valid XML plan from scratch:

1. **Open the plan** with the required root element on its own line:
   ```xml
   <plan version="1.0">
   ```

2. **Add each task** as a `<task>` block with a unique integer `id` and `status="pending"`:
   ```xml
   <task id="1" status="pending">
   ```

3. **Add a title** inside the task:
   ```xml
   <title>Short task title</title>
   ```

4. **List affected files** (optional but recommended):
   ```xml
   <files>
     <file action="create" path="src/new-feature.ts" />
     <file action="modify" path="src/existing.ts" />
   </files>
   ```

5. **Add acceptance criteria:**
   ```xml
   <criteria>
     <criterion>
       <what>Feature is exported</what>
       <how>export presence</how>
       <command>grep -q "export.*newFeature" src/new-feature.ts</command>
     </criterion>
   </criteria>
   ```

6. **Add prose content** (quality constraints, steps, rationale) as plain markdown inside the `<task>` block, outside `<criteria>`:
   ```
   **Quality Constraints:**
   - Types: all new functions must have explicit return types

   **Steps:**
   1. Implement the feature.
   2. Add tests.
   ```

7. **Close the task:**
   ```xml
   </task>
   ```

8. **Repeat for each task**, then **close the plan:**
   ```xml
   </plan>
   ```

<!-- /section: authoring-guide -->

<!-- section: v1-constraints -->
## v1 Constraints

The following capabilities are explicitly out of scope for the v1 XML plan format:

**No split plan support.** XML plans do not support the `## Phase Manifest` / split plan format used by very large prose plans. Plans exceeding approximately 15,000 words must use prose format. Split plan detection logic is not applied to XML plans.

**No export CLI.** A tool for converting existing prose plans to XML format is deferred. Authors who want XML plans must write them in XML from the start.

**No GSD mapping.** The XML schema is designed to be mappable to the GSD (Goal-Step-Deliverable) model, but the actual integration between XML plan tasks and GSD records is deferred to a future version.

<!-- /section: v1-constraints -->
