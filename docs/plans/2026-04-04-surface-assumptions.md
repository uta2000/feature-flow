# Surface Assumptions Skill — Design Document

**Date:** 2026-04-04
**Status:** Draft

## Overview

Add a `surface-assumptions` skill to feature-flow that extracts implicit and explicit assumptions from design documents, classifies them by verifiability and risk, generates verification commands, and executes them in parallel — before implementation begins. This closes the gap between recognized unknowns (handled by `spike`) and codebase conflicts (handled by `design-verification`) by catching things we don't recognize as unknowns: wrong endpoint URLs, cross-service pattern mismatches, stale prior-session diagnoses, and invalid test data relationships.

## Example

Given a design doc that says "Cerner token endpoint is `.../protocols/oauth2/.../token`" and "use same auth flow as Epic":

```
## Assumption Verification Report

| # | Risk | Category | Assumption | Verdict | Evidence |
|---|------|----------|------------|---------|----------|
| A1 | CRITICAL | discovery | Token endpoint is .../token | DENIED | Discovery doc shows .../hosts/.../token |
| A2 | HIGH | cross-service | Cerner auth = Epic auth | DIFFERS | Cerner is public client, Epic is confidential |
| A3 | HIGH | data | Encounter/97959231 for Patient/12744580 | DENIED | Encounter belongs to Patient/12742400 |

### Summary
- 0 CONFIRMED
- 2 DENIED — must fix before implementation
- 1 DIFFERS — review differences

### Gotchas to add
- "Cerner token endpoint requires /hosts/{fhir-host}/ segment — differs from Epic. Always check .well-known/smart-configuration."
- "Cerner sandbox is a public SMART client (no client_secret) — cannot reuse Epic proxy pattern."
```

## User Flow

### Step 1 — Load Context

The skill loads the design doc or plan:
1. User-specified path if provided
2. Otherwise, most recent `.md` in `docs/plans/` via `Glob: docs/plans/*.md`
3. Also loads `.feature-flow.yml` for stack context and existing gotchas
4. If resuming from a prior session, loads any prior diagnosis or blocker notes from the plan

### Step 2 — Extract Assumptions (3 Parallel Agents)

Three `Explore` agents (model: `haiku`) scan the design document simultaneously:

| Agent | Focus | What It Looks For |
|-------|-------|-------------------|
| Explicit Assumptions | Stated facts about external systems | URLs, endpoint paths, credential references, "same as" comparisons |
| Implicit Assumptions | Unstated beliefs embedded in the approach | Patterns copied between integrations, hardcoded IDs, env var assumptions, prior-session diagnoses stated as facts |
| Dependency Assumptions | Assumed relationships | Data relationships (patient-encounter), API behaviors (endpoint supports method), library behaviors |

Each agent returns a structured list of assumptions with: id, category, assumption text, source reference, verifiability flag, verification command, risk level, and risk reason.

**Empty result handling:** If all three agents return zero assumptions, announce: "No assumptions detected in this design — nothing to verify." and exit the skill early. This is expected for pure refactoring or internal-only changes with no external dependencies.

### Step 3 — Classify and Prioritize

Merged results are deduplicated by category + source reference and scored:

**Risk levels:** `critical` (blocks entire feature), `high` (runtime failures), `medium` (subtle bugs), `low` (cosmetic / test-caught)

**Verifiability:** `auto` (command-verifiable now), `manual` (human action needed), `runtime` (only at execution), `unverifiable`

### Step 4 — Execute Verifications (Up to 5 Parallel Agents)

`general-purpose` agents (model: `haiku`) execute verification commands grouped by independence, `critical`/`high` first. Each agent runs 1-3 related commands with a 30-second timeout per command.

**All-manual handling:** If every assumption is classified as `manual`, `runtime`, or `unverifiable` (zero `auto`-verifiable assumptions), skip Step 4 entirely and proceed to Step 5 with an empty verification table. Announce: "All assumptions require manual verification — no automated checks to run." List all assumptions in the "Blocked Assumptions (manual verification needed)" section of the report.

Each agent returns: assumption_id, verdict (`CONFIRMED` | `DENIED` | `DIFFERS` | `UNAVAILABLE`), evidence, and diff (if `DENIED` or `DIFFERS`).

### Step 5 — Report and Handle Results

Results are presented in a table sorted by risk (critical first) with a summary of confirmed/denied/differs counts. Manual verification items are listed separately.

**All-UNAVAILABLE handling:** If every verification returns UNAVAILABLE, add a warning to the report: "All verification commands failed or timed out — external services may be unreachable. The skill could not confirm or deny any assumptions. Consider checking network connectivity and retrying, or manually verifying the critical assumptions listed above."

**No-external-API designs:** When extraction finds only `codebase`, `environment`, or `library` assumptions (no external API references), the skill still runs normally — these categories have their own verification patterns (grep, echo, Context7). The report simply contains no external-api/discovery/cross-service rows.

### Step 6 — Gotcha Generation and Plan Fixes

For any `DENIED` or `DIFFERS` finding, a gotcha is drafted for `.feature-flow.yml` in plain string format matching the existing gotchas list. In YOLO mode: auto-add all gotchas, auto-fix critical/high denied assumptions in the design doc, and announce the action.

## Pipeline / Architecture

### Skill File Structure

```
skills/surface-assumptions/
  SKILL.md                              # Full skill prompt with frontmatter
  references/
    assumption-patterns.md              # Verification patterns by category
    discovery-endpoints.md              # Known discovery endpoints by service type
```

This matches the existing skill structure pattern used by `spike/` (which has `references/assumption-patterns.md`) and `design-verification/` (which has `references/checklist.md`).

### Agent Dispatch Architecture

```
Orchestrator (opus)
├── Step 2: 3 Explore agents (haiku) — extraction
│   ├── Agent 1: Explicit assumptions
│   ├── Agent 2: Implicit assumptions
│   └── Agent 3: Dependency assumptions
│
└── Step 4: Up to 5 general-purpose agents (haiku) — verification
    ├── Agent A: critical/high external-api + discovery
    ├── Agent B: cross-service comparisons
    ├── Agent C: data relationship checks
    ├── Agent D: library/codebase checks
    └── Agent E: environment/prior-session checks
```

**Task tool dispatch syntax** (per `references/tool-api.md`):

- Extraction: `Task(subagent_type: "Explore", model: "haiku", description: "Extract explicit assumptions", prompt: "...")`
- Verification: `Task(subagent_type: "general-purpose", model: "haiku", description: "Verify discovery endpoints", prompt: "...")`

### Assumption Categories

| Category | Verification Source | Verification Pattern |
|----------|-------------------|---------------------|
| `external-api` | `curl` the endpoint | Check response shape and status |
| `discovery` | `curl .well-known/*` or `/metadata` | Diff against planned config |
| `cross-service` | Fetch discovery docs for BOTH services | Compare auth, scopes, client type, fields |
| `library` | Context7 MCP `query-docs` (fallback: `grep` node_modules or source) | Check current API patterns. If Context7 unavailable, skip and note: "Context7 not available — library assumption not verified." |
| `codebase` | `grep`/`read` actual implementation | Verify function signatures, type shapes |
| `environment` | `echo $VAR`, `curl localhost:PORT/health` | Check env vars, ports, services |
| `data` | `curl` the data endpoint | Verify relationships and state |
| `prior-session` | Re-run the original evidence command | Re-verify, don't trust conclusions |

### Cross-Service Comparison (Critical Rule)

When a plan says "same as Service A" or copies a pattern from one integration to another, the skill ALWAYS fetches the discovery/config document for BOTH services and explicitly compares:
- Auth endpoints
- Token endpoints
- Supported scopes
- Required fields
- Client type (public vs confidential)

### Prior Session Validation (Resume Mode)

Triggered when the plan contains "Resume Checklist", "Blocker", or "Next session" sections. All prior diagnoses and conclusions are treated as `prior-session` assumptions and re-verified by re-running the original evidence command — not by re-running the conclusion. If no runnable evidence command can be extracted from the prior-session notes (e.g., a human-observed diagnosis), classify the assumption as `manual` verification with a note: "No evidence command found — manual re-verification required."

### Failure Handling

- Extraction agents: retry once on failure, then skip with warning
- Verification agents: retry once on failure, then mark as `UNAVAILABLE` with error context
- Same pattern as `design-verification` and `spike` skills

### Deduplication Strategy

Assumptions are deduplicated by category + source reference. If two agents surface the same assumption (e.g., both Explicit and Dependency agents flag the same endpoint URL), the one with the higher risk level is kept.

## Patterns & Constraints

### Error Handling

- **Agent failures:** Retry once, then skip/mark UNAVAILABLE (matches `design-verification` pattern)
- **External service timeouts:** 30-second timeout per verification command; UNAVAILABLE verdict on timeout
- **Missing discovery endpoints:** If a service has no `.well-known/*` or `/metadata`, fall back to minimal test request or Context7 docs
- **User-facing vs system errors:** Verdicts (CONFIRMED/DENIED/DIFFERS/UNAVAILABLE) are user-facing; agent crash details are system-level warnings

### Types

- **Assumption categories:** Literal union: `'external-api' | 'discovery' | 'cross-service' | 'library' | 'codebase' | 'environment' | 'data' | 'prior-session'`
- **Risk levels:** Literal union: `'critical' | 'high' | 'medium' | 'low'`
- **Verifiability:** Literal union: `'auto' | 'manual' | 'runtime' | 'unverifiable'`
- **Verdicts:** Literal union: `'CONFIRMED' | 'DENIED' | 'DIFFERS' | 'UNAVAILABLE'`

### Performance

- Extraction: 3 parallel agents (single dispatch message)
- Verification: up to 5 parallel agents (single dispatch message)
- Timeout: 30 seconds per command within verification agents
- No sequential bottlenecks — extraction completes, then verification dispatches

### Stack-Specific

- **Tool list:** Read, Glob, Grep, Bash, Task (for agent dispatch), Write, Edit, AskUserQuestion, WebFetch, WebSearch, Context7 MCP tools (`mcp__plugin_context7_context7__query-docs`, `mcp__plugin_context7_context7__resolve-library-id`)
- **Note on Task tool:** The spec references `Agent` in the frontmatter tools list; this should be `Task` per the current tool-api.md conventions for dispatching subagents
- **Gotcha format:** Plain string list items in `.feature-flow.yml` `gotchas` array, matching existing format

### YOLO Behavior

When `yolo: true` in ARGUMENTS:
- Auto-execute all verifications without asking
- Auto-add all gotchas for DENIED/DIFFERS findings
- Auto-fix plan if critical/high assumptions are denied
- Announce: `YOLO: surface-assumptions — [N] assumptions verified, [M] denied → fixing plan`

## Scope

### Included (Phase 1 — Core Skill MVP)

- `skills/surface-assumptions/SKILL.md` — Full skill prompt with frontmatter, all 6 process steps, quality rules, YOLO behavior
- `skills/surface-assumptions/references/assumption-patterns.md` — Verification patterns by category (OAuth/OIDC, REST APIs, cross-service, data, library, environment, prior-session)
- `skills/surface-assumptions/references/discovery-endpoints.md` — Known discovery endpoints by service type (FHIR, OAuth 2.0, REST, GraphQL, gRPC, cloud services)
- Manual invocation via `surface-assumptions` or "check my assumptions"

### Excluded (Deferred to Later Phases)

- **Phase 2 — Lifecycle Integration:** No modifications to `start`, `spike`, `design-verification`, or `verify-plan-criteria` skills. No auto-trigger from the `start` lifecycle. No step list insertion.
- **Phase 3 — Configuration:** No changes to `.feature-flow.yml` schema. No `integrations` section. No changes to `project-context-schema.md`.
- **Phase 4 — Resume Intelligence:** No staleness checks for `integrations.last_verified`. No session-report integration for assumption tracking.
- **Integration detection:** Keyword scan of design doc to auto-trigger is deferred to Phase 2.
