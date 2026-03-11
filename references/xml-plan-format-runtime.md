# XML Plan Format — Runtime Reference

Detection algorithm, error handling rules, and edge cases for the XML plan format. See `references/xml-plan-format.md` for the canonical schema and authoring guide.

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
