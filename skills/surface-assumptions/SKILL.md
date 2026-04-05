---
name: surface-assumptions
description: >-
  Surface and verify implicit assumptions before implementation.
  Use when asked to "check assumptions", "what am I assuming",
  "verify assumptions", "surface assumptions", or automatically
  after design-verification when the design references external
  services, APIs, OAuth providers, third-party integrations,
  or cross-service patterns. Also triggers when resuming work
  from a previous session with an existing plan or diagnosis.
tools: Read, Glob, Grep, Bash, Task, Write, Edit, AskUserQuestion, WebFetch, WebSearch, mcp__plugin_context7_context7__query-docs, mcp__plugin_context7_context7__resolve-library-id
---

# Surface Assumptions

Extracts implicit and explicit assumptions from a design doc or plan,
classifies them by verifiability and risk, generates verification commands,
and executes them in parallel — before a single line of implementation code
is written.

**Announce at start:** "Surfacing assumptions — verifying what we think we know before building on it."

## When to Use

- After writing a design doc that references external APIs or services
- After design-verification, when external integrations are involved
- When resuming work from a previous session (prior diagnoses may be stale)
- When a plan copies patterns from one service to another ("same as Epic")
- When debugging has produced a diagnosis that hasn't been independently verified
- When the user asks "what am I assuming?" or "check my assumptions"
- Before implementation of any plan involving third-party services

## When to Skip

- Pure refactoring with no external dependencies
- UI-only changes with no API or data changes
- When all external assumptions have already been verified in this session
  (check for prior surface-assumptions output in conversation)

## Process

### Step 1: Load Context

Load the design doc or plan:

1. If the user specified a path, use it
2. Otherwise, find the most recently modified `.md` in `docs/plans/`:
   `Glob: docs/plans/*.md`
3. Also load `.feature-flow.yml` for stack context and existing gotchas
4. If resuming from a previous session, load any prior diagnosis or blocker
   notes from the plan (sections named "Resume Checklist", "Blocker", or
   "Next session")

### Step 2: Extract Assumptions

Read the design/plan and extract every assumption — both explicit statements
and implicit ones embedded in the approach.

**Assumption Categories:**

| Category | What to Look For | Examples |
|----------|-----------------|---------|
| `external-api` | URLs, endpoints, auth flows, payload formats | "Token endpoint is X", "API accepts Y format" |
| `discovery` | OAuth/OIDC/FHIR/OpenAPI configuration | "Scopes are supported", "Grant type works" |
| `cross-service` | "Same as X", "Like we did for Y" | "Cerner works like Epic", "Same auth flow" |
| `library` | API signatures, config options, method behavior | "Function X accepts param Y" |
| `codebase` | Existing function behavior, type shapes | "This service returns Z" |
| `environment` | Env vars, ports, services, credentials | "API_KEY is configured" |
| `data` | Test data relationships, IDs, foreign keys | "Patient X has Encounter Y" |
| `prior-session` | Diagnoses or conclusions from previous work | "The 403 is caused by app registration" |

**Dispatch 3 parallel Explore agents (model: haiku).**
Substitute `[DESIGN DOC CONTENT]` in each agent prompt with the full text of
the document loaded in Step 1:

```
Task(subagent_type: "Explore", model: "haiku", description: "Extract explicit assumptions", prompt: "
  Read the following design document and extract every explicit assumption —
  stated facts about external systems, URLs, endpoint paths, credential
  references, and any 'same as' or 'like' comparisons to other services.

  For each assumption, return a JSON object with:
  - id: string (e.g. 'A1', 'A2')
  - category: one of 'external-api' | 'discovery' | 'cross-service' | 'library' | 'codebase' | 'environment' | 'data' | 'prior-session'
  - assumption: string (the assumption in plain English)
  - source: string (file path and line reference if identifiable, or 'design doc')
  - verifiability: 'auto' | 'manual' | 'runtime' | 'unverifiable'
  - verification: { method: string, command: string, expected: string } | null (required when verifiability is 'auto')
  - risk: 'critical' | 'high' | 'medium' | 'low'
  - risk_reason: string

  Return a JSON array. Return [] if no explicit assumptions found.

  Design document:
  [DESIGN DOC CONTENT]
")

Task(subagent_type: "Explore", model: "haiku", description: "Extract implicit assumptions", prompt: "
  Read the following design document and identify implicit assumptions —
  unstated beliefs embedded in the approach. Look for:
  - Patterns copied from one integration to another (implied equivalence)
  - Hardcoded IDs, fallback values, or test data references
  - Env var references that assume specific values exist
  - Prior-session diagnoses stated as facts (not re-verified)

  For each assumption, return a JSON object with:
  - id: string (e.g. 'B1', 'B2')
  - category: one of 'external-api' | 'discovery' | 'cross-service' | 'library' | 'codebase' | 'environment' | 'data' | 'prior-session'
  - assumption: string (the assumption in plain English)
  - source: string (file path and line reference if identifiable, or 'design doc')
  - verifiability: 'auto' | 'manual' | 'runtime' | 'unverifiable'
  - verification: { method: string, command: string, expected: string } | null (required when verifiability is 'auto')
  - risk: 'critical' | 'high' | 'medium' | 'low'
  - risk_reason: string

  Return a JSON array. Return [] if no implicit assumptions found.

  Design document:
  [DESIGN DOC CONTENT]
")

Task(subagent_type: "Explore", model: "haiku", description: "Extract dependency assumptions", prompt: "
  Read the following design document and identify dependency assumptions —
  assumed relationships and behaviors. Look for:
  - Data relationships (this patient has this encounter, this user belongs to this org)
  - Assumed API behaviors (this endpoint supports this method or payload)
  - Assumed library or framework behaviors

  For each assumption, return a JSON object with:
  - id: string (e.g. 'C1', 'C2')
  - category: one of 'external-api' | 'discovery' | 'cross-service' | 'library' | 'codebase' | 'environment' | 'data' | 'prior-session'
  - assumption: string (the assumption in plain English)
  - source: string (file path and line reference if identifiable, or 'design doc')
  - verifiability: 'auto' | 'manual' | 'runtime' | 'unverifiable'
  - verification: { method: string, command: string, expected: string } | null (required when verifiability is 'auto')
  - risk: 'critical' | 'high' | 'medium' | 'low'
  - risk_reason: string

  Return a JSON array. Return [] if no dependency assumptions found.

  Design document:
  [DESIGN DOC CONTENT]
")
```

**Dispatch all 3 agents in a single message** (parallel).

**Failure handling:** If an agent fails, retry it once. If it fails again, treat its result as `[]` and log a warning: "[agent name] extraction agent failed — that category of assumptions will be absent from results."

**Empty result handling:** If all three agents return `[]`, announce:
"No assumptions detected in this design — nothing to verify."
and exit the skill.

### Step 3: Classify and Prioritize

Merge results from all 3 agents. **Deduplicate** by category + semantic similarity of assumption text (two assumptions about the same endpoint or same data relationship are duplicates even if worded differently). When duplicates are found, keep the one with the higher risk level.

**Risk ordering (highest to lowest):** `critical` > `high` > `medium` > `low`

**Risk Levels:**
- `critical` — Wrong assumption blocks the entire feature (auth, endpoints, permissions)
- `high` — Wrong assumption causes runtime failures (payload format, data relationships)
- `medium` — Wrong assumption causes subtle bugs (encoding, timezone, defaults)
- `low` — Wrong assumption is cosmetic or easily caught by tests

**Verifiability:**
- `auto` — Can be verified with a command right now (curl, grep, read, echo)
- `manual` — Requires human action (check a web console, read a dashboard)
- `runtime` — Can only be verified by running the code (race conditions, perf)
- `unverifiable` — Cannot be verified before implementation

### Step 4: Generate Verification Plan

For each `auto`-verifiable assumption, generate or confirm the verification command.
See `references/assumption-patterns.md` for patterns by category.

**Verification patterns by category:**

| Category | Verification Pattern |
|----------|---------------------|
| `external-api` | `curl` the endpoint, check response shape and HTTP status |
| `discovery` | `curl .well-known/*` or `/metadata`, diff against planned config |
| `cross-service` | Fetch discovery docs for BOTH services, compare endpoints, scopes, client type |
| `library` | `mcp__plugin_context7_context7__query-docs` for current API; if unavailable, `grep` node_modules types |
| `codebase` | `grep`/`read` the actual implementation |
| `environment` | `echo $VAR`, `curl localhost:PORT/health`, `lsof -i :PORT` |
| `data` | `curl` the data endpoint, check relationships |
| `prior-session` | Re-run the original evidence command (not the conclusion) |

**Critical rule for `cross-service` assumptions:**

When a plan says "same as Service A" or copies a pattern from one integration
to another, ALWAYS fetch the discovery/config document for BOTH services and
compare:
- Auth endpoints (may differ)
- Token endpoints (may differ)
- Supported scopes (may differ in format)
- Required fields (may differ)
- Client type (public vs confidential may differ)

See `references/discovery-endpoints.md` for known discovery endpoints by
service type.

**Library verification fallback:**

If `mcp__plugin_context7_context7__resolve-library-id` is not available, attempt
`grep` fallback on `node_modules` types as described in
`references/assumption-patterns.md`. If that also fails, classify the assumption
as `UNAVAILABLE` and add it to the "Blocked Assumptions" section with note:
"Context7 not available — library assumption not verified."

### Step 5: Execute Verifications

**All-manual handling:** If every assumption is classified as `manual`,
`runtime`, or `unverifiable` (zero `auto`-verifiable assumptions), skip
this step entirely. Announce: "All assumptions require manual verification —
no automated checks to run." Proceed to Step 6 with an empty verification
table and list all assumptions in the "Blocked Assumptions" section.

**Otherwise:** Dispatch verification commands in parallel (up to 5 agents,
model: haiku). Group by independence. Run `critical` and `high` assumptions first.

```
Task(subagent_type: "general-purpose", model: "haiku", description: "Verify critical/high assumptions", prompt: "
  Execute the following verification commands. For each command:
  1. Run the command (30-second timeout)
  2. Compare actual output against the expected value
  3. Return a JSON object with:
     - assumption_id: string
     - verdict: 'CONFIRMED' | 'DENIED' | 'DIFFERS' | 'UNAVAILABLE'
     - evidence: string (actual output or error)
     - diff: string (only if DENIED or DIFFERS — 'Plan says X, reality is Y')

  If a command times out or fails to execute: verdict = 'UNAVAILABLE', evidence = error message.

  Commands:
  [LIST OF VERIFICATION COMMANDS FOR CRITICAL/HIGH ASSUMPTIONS]

  Return a JSON array.
")
```

Dispatch additional agents for remaining assumption groups in the same single
message (parallel). Each agent handles 1-3 related verification commands.

**Failure handling:** If an agent fails, retry it once. If it fails again,
mark all its assumptions as `UNAVAILABLE` with evidence: "Verification agent
failed after retry."

**Prior session assumption handling:** Re-run the exact command that produced
the original evidence — not the conclusion. If no runnable evidence command can
be extracted from prior-session notes (e.g., a human-observed diagnosis),
classify as `manual` verification with note: "No evidence command found —
manual re-verification required."

### Step 6: Report Results

Present results in a table sorted by risk (critical first):

```
## Assumption Verification Report

| # | Risk | Category | Assumption | Verdict | Evidence |
|---|------|----------|------------|---------|----------|
| A1 | CRITICAL | discovery | Token endpoint is .../token | DENIED | Discovery doc shows .../hosts/.../token |
| A2 | HIGH | cross-service | Cerner auth = Epic auth | DIFFERS | Cerner is public client, Epic is confidential |
| A3 | HIGH | data | Encounter/97959231 for Patient/12744580 | DENIED | Encounter belongs to Patient/12742400 |
| A4 | MEDIUM | library | btoa handles UTF-8 | CONFIRMED | Works for ASCII; needs encodeURIComponent for multi-byte |

### Summary
- **X CONFIRMED** — safe to proceed
- **Y DENIED** — must fix before implementation
- **Z DIFFERS** — review differences, may need adaptation

### Blocked Assumptions (manual verification needed)
- M1: App registration has Patient resource enabled → check code.cerner.com console
```

**All-UNAVAILABLE warning:** If every verification returns UNAVAILABLE, add:
"All verification commands failed or timed out — external services may be
unreachable. The skill could not confirm or deny any assumptions. Consider
checking network connectivity and retrying, or manually verifying the critical
assumptions listed above."

**No-external-API note:** When the report contains only `codebase`,
`environment`, or `library` rows, no special handling is needed — these
categories have their own verification patterns and are valid outputs.

#### Handle DENIED or DIFFERS Findings

**Gotcha generation:** For any DENIED or DIFFERS finding, draft a gotcha in
plain string format matching the existing `.feature-flow.yml` gotchas list:

```yaml
gotchas:
  - "Cerner token endpoint requires /hosts/{fhir-host}/ segment — differs from Epic. Always check .well-known/smart-configuration."
  - "Cerner sandbox is a public SMART client (no client_secret) — cannot reuse Epic proxy pattern."
```

**If any DENIED or DIFFERS at critical or high risk (interactive mode):**

```
AskUserQuestion: "Found [N] incorrect assumptions at critical/high risk. How should we proceed?"
Options:
- "Fix plan" with description: "Update the design doc with correct values, then re-run design-verification"
- "Fix and continue" with description: "Update inline and proceed to planning"
- "Ignore" with description: "Proceed with documented risks — gotchas will be added to .feature-flow.yml"
```

Then ask whether to add the drafted gotchas:

```
AskUserQuestion: "Add these findings as gotchas to .feature-flow.yml?"
Options:
- "Add all" with description: "Recommended — saves all DENIED/DIFFERS findings as project-wide warnings"
- "Let me pick" with description: "Choose which findings to persist — you'll be prompted one at a time"
- "Skip" with description: "Discard all — none will be saved"
```

Append approved gotchas to the `gotchas` list in `.feature-flow.yml`. If the
file doesn't exist, create it.

## YOLO Behavior

If `yolo: true` in ARGUMENTS:
- Auto-execute all verifications without asking
- Auto-add all gotchas for DENIED/DIFFERS findings
- Auto-fix critical/high DENIED assumptions in the design doc:
  for each DENIED assumption, locate the relevant section in the design doc
  and replace the incorrect value (URL, endpoint, config) with the verified
  correct value from the evidence. Add an inline annotation:
  `> **CORRECTED:** Was [old value], verified as [new value] via [command]`
- Announce: `YOLO: surface-assumptions — [N] assumptions verified, [M] denied → fixing plan`

## Quality Rules

1. **Never skip discovery documents.** If an external API is involved and has
   a discovery endpoint (`.well-known/*`, `/metadata`, OpenAPI spec), fetch it.
   Period. No exceptions.

2. **Never assume cross-service equivalence.** "Same as X" is always an
   assumption, never a fact. Fetch both discovery docs and compare.

3. **Verify data relationships.** If the plan references test data IDs, verify
   the relationships (patient→encounter, user→org) with actual queries.

4. **Re-verify prior diagnoses.** Never carry forward a diagnosis from a
   previous session without re-running the evidence.

5. **Prefer machine verification.** If it can be checked with a command, check
   it with a command. Don't reason about whether it's probably right.

6. **Surface implicit assumptions.** The most dangerous assumptions are the
   ones that aren't stated. Look for them actively.

## Additional Resources

### Reference Files
- `references/assumption-patterns.md` — Common assumption categories and verification patterns by category
- `references/discovery-endpoints.md` — Known discovery endpoints by service type (FHIR, OAuth 2.0, REST, GraphQL, gRPC, cloud services)
- `../../references/tool-api.md` — Task tool syntax for parallel agent dispatch and Context7 MCP tools
