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

## Optional Args (used when invoked from orchestrator dispatch)

When invoked as a Pattern B consolidator subagent (per #251), the orchestrator passes these arguments so the skill can skip the hoisted-fanout step and write its structured return contract back to the lifecycle's in-progress state file:

- `findings_path: <absolute-path-to-findings-json>` — when set, the skill skips Step 1's Explore-agent dispatch and reads the pre-fetched findings from this JSON file instead. The file contains the consolidated `{schema, pipeline, ui, format, code, ...}` findings produced by the orchestrator-side parallel fanout. Format: `{"agents": [{"area": string, "findings": string[]}, ...]}`.
- `write_contract_to: <absolute-path-to-in-progress-yml>` — when set, writes the return contract to `phase_summaries.<phase_id>.return_contract` in that YAML file after Step 4 (issue body merge) completes (see Step 8 below).
- `phase_id: <bucket-name>` — identifies which **`phase_summaries` bucket** to write into. Must be one of the four fixed buckets: `brainstorm`, `design`, `plan`, or `implementation`. If absent when `write_contract_to` is set, defaults to `design` (the bucket that contains the `design-document` lifecycle step). **Do not confuse `phase_id` with the contract's own `phase` field** — `phase_id` is the bucket key (`design`); the contract's `phase` field is the lifecycle step name (`design-document`) per #251's locked spec.

All three args are optional. If `findings_path` is absent, Step 1 dispatches Explore agents as before. If `write_contract_to` is absent, Step 8 is skipped — the skill behaves identically to its inline-invocation form.

## Process

### Step 1: Gather Context

Collect the inputs needed to write the document:

1. **From the conversation:** Extract all decisions made during brainstorming — scope, approach, UX flow, data model, technical choices
2. **From the codebase and documentation:** Dispatch parallel Explore agents to gather context from multiple areas simultaneously.

**Pattern B consolidator-mode early exit:** If `findings_path` is set in ARGUMENTS, the orchestrator has already executed the parallel fanout. Read the JSON at that path, treat its `agents[]` array as the unified context summary, and skip the entire `#### Parallel Context Gathering` and `#### Failure Handling` subsections below. Jump directly to `#### Consolidation`. The clarification `AskUserQuestion` at the end of Consolidation is still suppressed when `yolo: true` or `express: true` is set (existing behavior). This branch exists for the Pattern B subagent dispatch wired in `skills/start/SKILL.md` — see "Design Document — Pattern B Dispatch" in that file.

#### Parallel Context Gathering

Launch 3-4 Explore agents in a **single message** using the Task tool with `subagent_type: "Explore"` and `model: "haiku"` (see `../../references/tool-api.md` — Task Tool for correct parameter syntax). Announce: "Dispatching N context-gathering agents in parallel..."

| Agent | Assignment | Always? |
|-------|-----------|---------|
| Format patterns | Read existing design docs in `docs/plans/` and extract document structure, section patterns, and conventions. **Read-only — never writes to `docs/plans/`.** | Yes |
| Stack & dependencies | Examine dependency files (`package.json`, config files), project structure, and tech stack conventions | Yes |
| Relevant code | Search for and read source files related to the feature being designed (e.g., existing components, routes, hooks, models in the affected areas) | Yes |
| Documentation (Context7) | If `.feature-flow.yml` has a `context7` field, the Context7 MCP plugin is available (see `../../references/tool-api.md` — Context7 MCP Tools for availability check), AND no documentation lookup step was already run in the `start` lifecycle — query relevant Context7 libraries for current patterns the design should follow. Skip this agent if any condition is not met. | Conditional |

**Context passed to each agent:**
- Feature description (from brainstorming output or issue body)
- Specific gathering assignment from the table above
- For the Documentation agent: library IDs from `.feature-flow.yml` `context7` field

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

**Express behavior:** If `express: true` is in the skill's `ARGUMENTS`, apply the same clarification suppression as YOLO. Do not call `AskUserQuestion` for clarification. Answer questions from available context and announce each: `Express: design-document — [question] → [answer]`. Note `[TBD]` for genuinely missing information.

### Step 2: Determine Sections

Select sections based on what the feature requires. Not every feature needs every section.

**Required sections:**
- **Overview** — What the feature does, in 2-3 sentences
- **User Flow** — Step-by-step from the user's perspective
- **Patterns & Constraints** — Error handling strategy, type narrowness, performance constraints, and stack-specific patterns that implementation must follow
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

Check for `.feature-flow.yml` in the project root to determine the platform. If `platform` is `ios`, `android`, or `cross-platform`, add these sections:

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

## Patterns & Constraints

### Error Handling
- [Strategy for each external call type — typed Result<T, E>, retry, timeout]
- [User-facing vs system error distinction]

### Types
- [Key types with narrowness specified — literal unions, not string]
- [Generated vs hand-maintained types]

### Performance
- [Debounce, pagination, parallel constraints]
- [N+1 prevention strategy]

### Stack-Specific
- [Patterns from references/stacks/*.md and Context7 docs that apply]

## Migration Requirements
[Numbered list of all schema/type changes]

## Scope
- [What's included]
- [What's explicitly excluded]
```

### Step 4: Merge design into GitHub issue body

Design content is written into the linked GitHub issue body — not to a file under `docs/plans/`.

**Prerequisites:** The GitHub issue must already exist. Its number is in the lifecycle context as `issue`. If no issue number is available, stop and ask the user to create one first via `feature-flow:create-issue`.

**Protocol:**

1. **Fetch the current issue body:**
   ```bash
   gh issue view <issue_number> --json body --jq '.body'
   ```

2. **Generate the design content block** (the formatted document sections assembled in Step 3 above).

3. **Build the marker-wrapped block:**
   ```
   <!-- feature-flow:design:start -->
   ## Design (feature-flow)

   <generated design content>

   _Generated by feature-flow design-document on YYYY-MM-DD. Re-running design-document will update this section in place._
   <!-- feature-flow:design:end -->
   ```

4. **Marker integrity check:** Before merging, count occurrences of each marker in the fetched body:
   ```
   start_count = number of occurrences of "<!-- feature-flow:design:start -->"
   end_count   = number of occurrences of "<!-- feature-flow:design:end -->"
   ```
   If `start_count != 1` or `end_count != 1` or `start_count != end_count` (i.e., markers are absent, duplicated, or mismatched): fall back to **append mode** — wrap the new design in fresh markers and append to the end of the body. Announce a warning:
   ```
   Warning: Existing issue body has malformed design markers (start=N, end=M) — appending new design block instead of replacing.
   ```
   Only proceed with the replace path when exactly one matched start/end pair is present.

5. **Merge rules:**
   - **If markers present (and integrity check passed):** Replace everything between `<!-- feature-flow:design:start -->` and `<!-- feature-flow:design:end -->` (inclusive of those tags) with the new marker-wrapped block. Preserve all content outside the markers verbatim.
   - **If markers absent or malformed (integrity check failed):** Append the full marker-wrapped block to the end of the body.

6. **Size check:** If the merged body exceeds 65,536 characters:
   - Post the `## Design (feature-flow)` block as a standalone issue comment:
     ```bash
     TMPFILE=$(mktemp /tmp/ff_design_comment_XXXXXX.md)
     cat > "$TMPFILE" << 'DESIGN_BODY'
     ## Design (feature-flow)
     <generated design content>
     DESIGN_BODY
     COMMENT_URL=$(gh issue comment <issue_number> --body-file "$TMPFILE" --json url --jq '.url')
     rm -f "$TMPFILE"
     ```
   - Write a reference link inside the markers instead:
     ```
     <!-- feature-flow:design:start -->
     Design is too large to inline — see comment: <comment_url>
     <!-- feature-flow:design:end -->
     ```

7. **Write via temp file** (avoids shell-escaping issues with multi-kilobyte content):
   ```bash
   TMPFILE=$(mktemp /tmp/ff_design_body_XXXXXX.md)
   cat > "$TMPFILE" << 'ISSUE_BODY'
   <full merged body>
   ISSUE_BODY
   gh issue edit <issue_number> --body-file "$TMPFILE"
   rm -f "$TMPFILE"
   ```

8. **Announce:** `Design merged into issue #<issue_number> body (N chars, markers [present|added|appended — malformed]).`

### Step: Optional codex review

If `.feature-flow.yml` has `codex.enabled: true` AND `codex.proactive_reviews.design_doc: true`:

1. **Write a design-snapshot file** so the consult-codex skill (which still reads `design_doc_path` as a file on disk) can find the content. Since 2026-04-23 the design lives in the linked issue body, not `docs/plans/*.md` — we bridge the two by writing the generated design content to a session-local snapshot file at `.feature-flow/design/design-snapshot-<issue>.md` (gitignored via the existing `.feature-flow/` entry; not committed). The snapshot is a read-only bridge for consult-codex — the issue body remains the source of truth.

   ```bash
   SNAPSHOT=".feature-flow/design/design-snapshot-<issue_number>.md"
   mkdir -p "$(dirname "$SNAPSHOT")"
   # Write the same generated design content that was merged into the issue body
   # (the content from the `<!-- feature-flow:design:start -->` block, without the markers).
   cat > "$SNAPSHOT" <<'DESIGN'
<generated design content>
DESIGN
   node -e '
     const state = require("./skills/consult-codex/scripts/state.js");
     state.setMetadata(process.cwd(), { design_doc_path: process.argv[1] });
   ' "$SNAPSHOT"
   ```

   **Follow-up note (out of scope for this PR):** `consult-codex` should be updated to fetch directly from the issue body when `design_issue` is set, removing the need for the snapshot bridge. Tracked as a follow-up; the snapshot approach preserves the existing `design_doc_path` contract in the meantime.

2. Invoke consult-codex:

   ```
   Skill(skill: "feature-flow:consult-codex", args: "mode: review-design")
   ```

3. Read the returned diagnosis/recommendation/confidence block. Decide whether to incorporate any of codex's findings into the design doc. If you edit the doc, re-save it.

4. **Record your verdict** via the one-liner at the bottom of the skill return:

   ```
   Skill(skill: "feature-flow:consult-codex", args: "verdict --id c1 --decision <accept|reject> --reason <specific text>")
   ```

   - `accept` means you applied at least one of codex's suggestions (or confirmed they were already covered)
   - `reject` means you read the advice and chose not to apply any of it, for a reason that references the design or already-tried approaches

5. If `codex.enabled` is false, the section at `codex.proactive_reviews.design_doc` is false, or the codex MCP server is unavailable, skip this step entirely. The skill invocation is a no-op in those cases — no lifecycle impact.

This step does NOT halt the lifecycle on a reject verdict. The verdict is an audit record, not a gate. Proceed to verification either way.

### Step 5: Present for Review

Present the document section by section (200-300 words per section). After each section, confirm with the user:

```
Does this section look right, or should I adjust anything?
```

If the document is short enough (under 1,000 words total), present it all at once.

**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`:

- Skip section-by-section confirmation entirely for all scopes. Present the full document at once without asking. Announce: `YOLO: design-document — Section approval → Accepted (all sections)`

**Express behavior:** If `express: true` is in the skill's `ARGUMENTS`:

- **Quick fix or Small enhancement scope** (or scope not specified): Skip section-by-section confirmation entirely. Present the full document at once without asking. Announce: `Express: design-document — Section approval → Accepted (all sections)`

- **Feature or Major Feature scope:** Present the full document as a design approval checkpoint. Use `AskUserQuestion`:

  ```
  Express checkpoint: Here's the design document. Continue or adjust?
  ```

  Options:
  - "Continue" — approve the document and resume Express mode
  - "Let me adjust" — user provides corrections, document is updated, then Express resumes

  Announce: `Express: design-document — Document approval → ✋ Checkpoint presented`

  The scope is determined from the `scope:` field in the skill's `ARGUMENTS` (e.g., `args: "express: true. scope: feature. ..."`). If no scope is specified, default to the skip behavior.

### Step 6: Standards Cross-Check

Read `.feature-flow.yml` to check `standards.enabled` and `standards.files`.

**Skip conditions (no output, no warning):**
- `standards.enabled` is explicitly `false`
- `standards.files` is absent or empty AND auto-discovery finds no files

#### Auto-Discovery (when `standards.files` is absent or empty and `enabled` is not `false`)

Scan these locations for standards files:
- `.claude/` directory
- `docs/` directory
- Project root

Target filenames (case-insensitive): `architecture.md`, `conventions.md`, `standards.md`, `coding-standards.md`, `style-guide.md`

Exclude any file named `CLAUDE.md` (these are memory/activity tracking files, not project standards).

**Interactive mode:**

```
AskUserQuestion (multiSelect: true): "Standards files discovered — which should be used for design cross-checks?"
Options: [up to 4 discovered files per question; if more than 4 are found, present in batches of 4]
```

Write the selected files to `.feature-flow.yml`:

```yaml
standards:
  enabled: true
  files:
    - [selected paths]
```

**YOLO behavior:** Auto-select all discovered files. Write to `.feature-flow.yml`. Announce: `YOLO: design-document — Standards auto-discovery → N files found, all selected`

**Express behavior:** Same as YOLO — auto-select all discovered files. Announce: `Express: design-document — Standards auto-discovery → N files found, all selected`

**If no files are discovered:** Write `standards.enabled: false` to `.feature-flow.yml`. Skip the cross-check silently.

#### Cross-Check Execution

If `standards.files` has entries (from config or from auto-discovery above):

1. If more than 5 files are configured, announce: `Note: [N] standards files configured. Large standards sets may reduce cross-check precision.`

2. For each file in `standards.files`: read its contents. If the file does not exist on disk, announce: `Warning: Standards file [path] not found — skipping.` and continue with the remaining files.

3. If all files are missing after attempting to read them, skip the cross-check entirely (no further output).

4. Concatenate the content of all successfully-read files with source labels (e.g., `--- Source: docs/architecture.md ---`).

5. Pass the concatenated standards content and the current design document to the LLM with this prompt:

   > You are reviewing a design document against a set of project standards. Identify every conflict between the design and the standards. For each conflict, produce: (1) a concise description of the issue, (2) the source file and line/section where the standard is defined, (3) a concrete, actionable fix to apply to the design document. Format your response as a Markdown table with columns: Issue | Source | Fix. If there are no conflicts, respond with exactly: NO_CONFLICTS

6. Parse the response:
   - If the response is exactly `NO_CONFLICTS`: announce `Standards cross-check passed — no conflicts found.` and proceed to Step 7.
   - If the response is a valid Markdown table: continue to Report Display below.
   - If the response cannot be parsed as either: display the raw response prefixed with `Standards cross-check (raw output — table parsing failed):` and skip auto-corrections. Proceed to Step 7.

#### Report Display

Print the report table as-is (display-only — do not modify the design document file):

```
Standards Cross-Check Report

| Issue | Source | Fix |
|-------|--------|-----|
| ...   | ...    | ... |
```

#### Corrections

A fix is **concrete** if it specifies a precise, actionable change to the design document (e.g., "Change X to Y in the Architecture section"). A fix is **vague** if it says things like "consider reviewing", "may need to", or "discuss with team".

**Interactive mode:** After displaying the report, ask:

```
AskUserQuestion (multiSelect: true): "Which fixes should I apply to the design document?"
Options: [one option per table row — truncated to 4 if more than 4 rows; if >4 rows, present in batches]
```

Apply each selected concrete fix via the Edit tool to the design document file. Announce each application: `Applied: [Issue summary]`

**YOLO behavior:** Auto-apply all concrete fixes via the Edit tool. Skip vague fixes. Announce: `YOLO: design-document — Standards fixes → N applied, M skipped (vague)`

**Express behavior:** Same as YOLO — auto-apply all concrete fixes. Announce: `Express: design-document — Standards fixes → N applied, M skipped (vague)`

### Step 7: Suggest Next Steps

After the document is approved:

```
Design merged into issue #<issue_number> body.

Recommended next steps:
1. Run `design-verification` to check this design against the codebase
2. Run `writing-plans` to create an implementation plan with acceptance criteria
```

### Step 8: Write Return Contract (conditional)

**Only executes if `write_contract_to` is set in the skill's ARGUMENTS.** If the arg is absent, skip this step entirely — the skill behaves identically to its pre-#251 inline form.

Construct the return contract object per the locked spec from #251 (issue comment locking the contract was posted before this implementation):

- `schema_version`: `1` (integer — contract schema version, NOT the in-progress state-file schema_version which is `2`)
- `phase`: hardcoded to `"design-document"` per #251's locked contract spec — this is the lifecycle step name the validator uses to look up the schema in its registry. **Not** the `phase_id` arg value. (`phase_id` names the state-file bucket, e.g. `"design"`.)
- `status`: one of:
  - `"success"` — design merged into issue body, no `[TBD]` markers, all required sections written
  - `"partial"` — design merged but `tbd_count > 0` OR one or more required sections were skipped
  - `"failed"` — design could not be merged (issue body write failed, marker integrity check failed and append also failed)
- `design_issue_url`: full URL of the GitHub issue containing the merged design section (e.g., `https://github.com/owner/repo/issues/N`)
- `issue_number`: integer issue number
- `design_section_present`: boolean — `true` if `<!-- feature-flow:design:start -->` markers were merged into the issue body in Step 4 (either replaced existing markers or appended new ones), `false` if Step 4's append fallback also failed
- `key_decisions`: list of up to 5 decision strings extracted from the design (scope, approach, major design choices)
- `open_questions`: list of unresolved question strings flagged during writing (empty list `[]` if none)
- `tbd_count`: integer count of `[TBD]` markers in the merged design body

Write the contract to the state file using this helper (mirrors the env-var passing pattern in `skills/verify-plan-criteria/SKILL.md` Step 7 — apostrophe-safe, no inline interpolation):

```bash
F="<write_contract_to value>"
PHASE_ID="<phase_id value, default: design>"  # state-file bucket name — must be one of {brainstorm, design, plan, implementation}; design-document lives in the design bucket
STATUS="<success|partial|failed>"
DESIGN_URL="<full GitHub issue URL>"
ISSUE_NUM=<integer issue number>
PRESENT=<true|false>  # design_section_present
DECISIONS='<json-array-string, e.g. ["decision 1","decision 2"]>'
QUESTIONS='<json-array-string, e.g. [] or ["q1"]>'
TBD=<integer tbd_count>

[ -f "$F" ] && F="$F" PHASE_ID="$PHASE_ID" STATUS="$STATUS" DESIGN_URL="$DESIGN_URL" ISSUE_NUM="$ISSUE_NUM" PRESENT="$PRESENT" DECISIONS="$DECISIONS" QUESTIONS="$QUESTIONS" TBD="$TBD" python3 -c '
import os, json, yaml
f = os.environ["F"]
d = yaml.safe_load(open(f)) or {}
bucket = os.environ["PHASE_ID"]  # bucket name in phase_summaries (e.g. "design")
if "phase_summaries" not in d or bucket not in d["phase_summaries"]:
    print(f"[design-document] WARNING: phase_summaries.{bucket} not found in {f}; skipping contract write")
else:
    d["phase_summaries"][bucket]["return_contract"] = {
        "schema_version": 1,
        # The contracts `phase` field is the lifecycle STEP NAME per #251 spec
        # (design-document), NOT the bucket key (which would be "design").
        # The validator uses this to look up the schema in its registry.
        "phase": "design-document",
        "status": os.environ["STATUS"],
        "design_issue_url": os.environ["DESIGN_URL"],
        "issue_number": int(os.environ["ISSUE_NUM"]),
        "design_section_present": os.environ["PRESENT"].lower() == "true",
        "key_decisions": json.loads(os.environ["DECISIONS"]),
        "open_questions": json.loads(os.environ["QUESTIONS"]),
        "tbd_count": int(os.environ["TBD"]),
    }
    yaml.dump(d, open(f, "w"), default_flow_style=False, allow_unicode=True)
    print(f"[design-document] return_contract written to {f}")
'
```

The `[ -f "$F" ]` guard is intentional — when invoked outside a lifecycle context (e.g., in tests or one-off invocations), `write_contract_to` may point to a file that doesn't exist. In that case, log a warning and return normally — the skill's primary output (the design merge announcement from Step 4) is still valid.

After writing, return the state-file path and a one-line summary as the skill's result text:

`"Return contract written to <write_contract_to>. Design: status=<status>, issue #<issue_number>, decisions=<count>, tbd_count=<tbd>."`

The orchestrator (Pattern B wrapper in `skills/start/SKILL.md`) reads this state-file path from the result string, loads `phase_summaries.<phase_id>.return_contract` from the YAML, and runs `hooks/scripts/validate-return-contract.js` against the loaded object before proceeding.

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
