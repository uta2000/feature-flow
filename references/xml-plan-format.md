# XML Plan Format — Schema and Authoring Guide

This file defines the canonical XML plan format schema and authoring guide. Runtime details (detection algorithm, error handling, edge cases) are in `references/xml-plan-format-runtime.md`. Referenced by `skills/verify-plan-criteria/SKILL.md`, `skills/verify-acceptance-criteria/SKILL.md`, and `skills/start/references/yolo-overrides.md`.

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

<!-- section: runtime-reference -->
## Runtime Reference

The detection algorithm, error handling rules, and edge cases are documented in
`references/xml-plan-format-runtime.md`.

<!-- /section: runtime-reference -->

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
