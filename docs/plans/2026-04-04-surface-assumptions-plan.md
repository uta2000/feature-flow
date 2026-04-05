# Surface Assumptions Skill Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Create assumption-patterns.md — STATUS: pending
Task 2: Create discovery-endpoints.md — STATUS: pending
Task 3: Create SKILL.md — STATUS: pending
Task 4: Commit planning artifacts — STATUS: pending
CURRENT: none
-->

> **For Claude:** Read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.
> Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

**Goal:** Create the `surface-assumptions` skill for feature-flow — three new Markdown files that extract, classify, verify, and report on implicit and explicit assumptions in design docs before implementation begins.

**Architecture:** Pure Markdown prompt-instruction files only — no executable code. Three files: the main skill prompt (`SKILL.md`) with frontmatter, and two reference files (`assumption-patterns.md`, `discovery-endpoints.md`). The skill orchestrates extraction via 3 parallel Explore/haiku agents and verification via up to 5 parallel general-purpose/haiku agents. All logic lives in the SKILL.md prompt.

**Tech Stack:** Markdown (prompt instructions), YAML frontmatter (skill metadata)

**Issue:** #210

---

### Task 1: Create `skills/surface-assumptions/references/assumption-patterns.md`

**Files:**
- Create: `skills/surface-assumptions/references/assumption-patterns.md`

**Quality Constraints:**
- Pattern: Follow `skills/spike/references/assumption-patterns.md` for table format and section heading style. Each category gets a heading, a table or bullet list of assumption patterns, and a verification code block.
- Error handling: N/A — documentation file
- Type narrowness: N/A — documentation file
- Function length: N/A — documentation file
- Files modified: 1 new file, ~70 lines — no design-first flag required
- Parallelizable: Yes — Tasks 1 and 2 can run in parallel (both are new reference files with no cross-dependencies)

**Acceptance Criteria:**
- [ ] File exists at `skills/surface-assumptions/references/assumption-patterns.md`
- [ ] File contains a top-level `# Assumption Patterns` heading
- [ ] File contains a section `## External API Assumptions` with sub-section `### OAuth / OIDC / SMART on FHIR`
- [ ] The OAuth section lists: authorization endpoint URL, token endpoint URL, supported grant types, supported scopes, client type (public vs confidential), PKCE requirement, token lifetime, required `aud` parameter
- [ ] The OAuth section contains a bash verification block using `curl -s ... .well-known/smart-configuration | jq`
- [ ] File contains a section `## REST APIs` with OPTIONS/GET verification pattern
- [ ] File contains a section `## Cross-Service Assumptions` with red-flag phrases list and a numbered comparison checklist (fetch both, diff endpoints, check client type, compare error format, compare required fields)
- [ ] File contains a section `## Data Assumptions` with a curl/jq verification block showing `resourceType`, `id`, `status`, `subject`, `participant`
- [ ] File contains a section `## Library Assumptions` with Context7 MCP and grep fallback verification methods
- [ ] File contains a section `## Environment Assumptions` with `echo $VAR`, `curl localhost:PORT/health`, `lsof -i :PORT`, `ls -la` verification patterns
- [ ] File contains a section `## Prior Session Assumptions` with the rule: "Re-run the exact command that produced the original evidence. Don't re-run the conclusion — re-run the observation."
- [ ] Grep for `cross-service` (case-insensitive) in the file returns at least 1 match
- [ ] Grep for `prior.session` (case-insensitive) in the file returns at least 1 match

**Edge Case Criteria:**
- [ ] The Cross-Service section explicitly names the "red flag phrases": "Same as [Service A]", "Like we did for [Feature X]", "Reuse the [X] pattern", "Works the same way"

**Step 1: Create the parent directory**

```bash
mkdir -p /Users/weee/Dev/feature-flow/skills/surface-assumptions/references
```

**Step 2: Write the file**

Create `skills/surface-assumptions/references/assumption-patterns.md` with this exact content:

```markdown
# Assumption Patterns

## External API Assumptions

### OAuth / OIDC / SMART on FHIR

| Assumption | What Can Go Wrong |
|-----------|------------------|
| Authorization endpoint URL | May differ between sandbox and production, or between services |
| Token endpoint URL | Often has extra path segments not shown in docs (check `.well-known`) |
| Supported grant types | `authorization_code`, `client_credentials`, `refresh_token` — not all supported by all providers |
| Supported scopes | Format varies: v1 vs v2, CRUDS notation vs read/write, service-specific prefixes |
| Client type (public vs confidential) | Determines whether a proxy/secret is needed — do not copy from another service |
| PKCE requirement | Required, optional, or unsupported — varies by provider and grant type |
| Token lifetime | Affects refresh strategy; short-lived tokens need proactive refresh |
| Required `aud` parameter | Some providers require it, others reject it |

**Verification:**
```bash
curl -s https://{base}/.well-known/smart-configuration | jq '{
  token_endpoint, authorization_endpoint,
  grant_types_supported, scopes_supported,
  token_endpoint_auth_methods_supported
}'
```

### REST APIs

- Base URL (staging vs production, versioned vs unversioned)
- Required headers (Content-Type charset, Accept, custom headers)
- Payload format (field names, required fields, nesting)
- Error response format
- Rate limits

**Verification:**
```bash
# Check with OPTIONS or a minimal GET
curl -s -o /dev/null -w "%{http_code}" https://{base}/endpoint
# Or fetch OpenAPI spec
curl -s https://{base}/openapi.json | jq .paths
```

## Cross-Service Assumptions

**Red flag phrases in plans/designs:**
- "Same as [Service A]"
- "Like we did for [Feature X]"
- "Reuse the [X] pattern"
- "Works the same way"

**Always compare — for every cross-service assumption:**

1. Fetch the config/discovery doc for BOTH services
2. Diff auth endpoints, token endpoints
3. Diff supported scopes (format, names)
4. Check client type (public vs confidential) for each service independently
5. Compare error response formats
6. Compare required vs optional fields

## Data Assumptions

- Test data IDs and relationships (patient → encounter → practitioner)
- Foreign key validity (does encounter X belong to patient Y?)
- Data state (is the record active/completed/cancelled?)
- Data availability (does this sandbox have the test data we expect?)

**Verification:**
```bash
curl -s https://{base}/Resource/{id} | jq '{
  resourceType, id, status,
  subject: .subject.reference,
  participant: [.participant[].individual.reference]
}'
```

## Library Assumptions

- API method signatures (parameters, return types)
- Config option names and types
- Default behavior
- Version-specific features

**Verification:**
- Context7: `mcp__plugin_context7_context7__query-docs` — query current API docs for the specific method
- Fallback (if Context7 unavailable): `grep -r "functionName" node_modules/{lib}/` or read the library's TypeScript type definitions

## Environment Assumptions

- Env var is set and has expected value
- Service is running on expected port
- Proxy/tunnel is forwarding correctly
- File exists at expected path

**Verification:**
```bash
echo $VAR_NAME
curl -s http://localhost:PORT/health
lsof -i :PORT
ls -la /path/to/file
```

## Prior Session Assumptions

- "The 403 is caused by X" → re-test the 403, check if it's resolved
- "The workaround is needed because Y" → verify Y is still true
- "We need to wait for Z" → check if Z has happened
- "The plan says to do A" → verify A is still the right approach

**Verification:** Re-run the exact command that produced the original evidence.
Don't re-run the conclusion — re-run the observation.

A diagnosis from a previous session is NOT a fact. It is an assumption that must be re-verified. The environment, config, or external service may have changed. Or the original diagnosis may have been wrong.
```

**Step 3: Verify the file was created**

```bash
ls skills/surface-assumptions/references/
```

Expected: `assumption-patterns.md`

**Step 4: Commit**

```bash
git add skills/surface-assumptions/references/assumption-patterns.md
git commit -m "feat: add assumption-patterns reference for surface-assumptions skill — #210"
```

---

### Task 2: Create `skills/surface-assumptions/references/discovery-endpoints.md`

**Files:**
- Create: `skills/surface-assumptions/references/discovery-endpoints.md`

**Quality Constraints:**
- Pattern: Match the table and code-block style of `skills/design-verification/references/checklist.md` for service-type groupings. Use `## Service Type` headings with endpoint patterns as code blocks and key fields as prose.
- Error handling: N/A — documentation file
- Type narrowness: N/A — documentation file
- Function length: N/A — documentation file
- Files modified: 1 new file, ~55 lines — no design-first flag required
- Parallelizable: Yes — Tasks 1 and 2 can run in parallel

**Acceptance Criteria:**
- [ ] File exists at `skills/surface-assumptions/references/discovery-endpoints.md`
- [ ] File contains a top-level `# Discovery Endpoints by Service Type` heading
- [ ] File contains a section `## FHIR (SMART on FHIR)` with `.well-known/smart-configuration` and `/metadata` endpoints listed
- [ ] The FHIR section lists key fields: `token_endpoint`, `authorization_endpoint`, `scopes_supported`, `token_endpoint_auth_methods_supported`, `grant_types_supported`
- [ ] File contains a section `## OAuth 2.0 / OpenID Connect` with `.well-known/openid-configuration` and `.well-known/oauth-authorization-server` endpoints
- [ ] File contains a section `## REST APIs` listing `openapi.json`, `swagger.json`, `api-docs`, `.well-known/api-catalog`
- [ ] File contains a section `## GraphQL` with introspection query endpoint
- [ ] File contains a section `## gRPC` with `grpc.reflection.v1.ServerReflection`
- [ ] File contains a section `## Cloud Services` with a table covering AWS, GCP, Azure, Vercel, Supabase
- [ ] File contains a section `## When No Discovery Endpoint Exists` with 4 numbered fallback steps
- [ ] Grep for `well-known` in the file returns at least 3 matches
- [ ] Grep for `FHIR` in the file returns at least 1 match

**Edge Case Criteria:**
- [ ] The "When No Discovery Endpoint Exists" section includes checking for an official SDK with typed client as fallback step 1

**Step 1: Verify directory exists (from Task 1)**

```bash
ls skills/surface-assumptions/references/
```

If the directory does not exist (Task 1 hasn't run yet), create it:

```bash
mkdir -p skills/surface-assumptions/references
```

**Step 2: Write the file**

Create `skills/surface-assumptions/references/discovery-endpoints.md` with this exact content:

```markdown
# Discovery Endpoints by Service Type

## FHIR (SMART on FHIR)

```
{fhirBase}/.well-known/smart-configuration
{fhirBase}/metadata  (CapabilityStatement)
```

**Key fields:** `token_endpoint`, `authorization_endpoint`, `scopes_supported`,
`token_endpoint_auth_methods_supported`, `grant_types_supported`

## OAuth 2.0 / OpenID Connect

```
{issuer}/.well-known/openid-configuration
{issuer}/.well-known/oauth-authorization-server
```

**Key fields:** `token_endpoint`, `authorization_endpoint`, `scopes_supported`,
`grant_types_supported`, `response_types_supported`

## REST APIs

```
{base}/openapi.json
{base}/swagger.json
{base}/api-docs
{base}/.well-known/api-catalog
```

## GraphQL

```
{base}/graphql  (send an introspection query)
```

## gRPC

```
grpc.reflection.v1.ServerReflection
```

## Cloud Services

| Service | Discovery |
|---------|-----------|
| AWS | `aws sts get-caller-identity`, service-specific describe calls |
| GCP | `gcloud auth print-identity-token`, API discovery docs |
| Azure | `{tenant}/.well-known/openid-configuration` |
| Vercel | `vercel env ls`, project settings API |
| Supabase | `{project}.supabase.co/rest/v1/` (PostgREST OpenAPI) |

## When No Discovery Endpoint Exists

1. Check for an official SDK with a typed client — the API shape is in the type definitions
2. Check for a Postman collection or API examples in the official docs
3. Make a minimal test request and inspect the actual response shape
4. Read the changelog for recent breaking changes before assuming prior knowledge is current
```

**Step 3: Verify the file was created**

```bash
ls skills/surface-assumptions/references/
```

Expected: both `assumption-patterns.md` and `discovery-endpoints.md`

**Step 4: Commit**

```bash
git add skills/surface-assumptions/references/discovery-endpoints.md
git commit -m "feat: add discovery-endpoints reference for surface-assumptions skill — #210"
```

---

### Task 3: Create `skills/surface-assumptions/SKILL.md`

**Files:**
- Create: `skills/surface-assumptions/SKILL.md`

**Quality Constraints:**
- Design-first: This file is >150 lines — write the full content in a draft block in this plan step before making any Write call, then Write it verbatim. Do not construct it incrementally with multiple Edits.
- Pattern: Frontmatter format matches `skills/design-verification/SKILL.md` (name, description, tools keys). Description field uses trigger phrases per spec. Tools list uses `Task` not `Agent`.
- Pattern: YOLO announcement format: `YOLO: surface-assumptions — [decision] → [action]` (Unicode arrow `→`)
- Pattern: Extraction agents use `subagent_type: "Explore", model: "haiku"`. Verification agents use `subagent_type: "general-purpose", model: "haiku"`. See `../../references/tool-api.md` — Task Tool for syntax.
- Pattern: Agent failure handling: retry once, then skip/mark UNAVAILABLE — matches `design-verification` and `spike` pattern.
- Error handling: exceptions — agent failures retry once then mark UNAVAILABLE; external timeouts mark UNAVAILABLE; missing discovery endpoints fall back to minimal test request or Context7.
- Type narrowness: Literal union types documented inline in the skill — `'external-api' | 'discovery' | 'cross-service' | 'library' | 'codebase' | 'environment' | 'data' | 'prior-session'` for categories; `'critical' | 'high' | 'medium' | 'low'` for risk; `'auto' | 'manual' | 'runtime' | 'unverifiable'` for verifiability; `'CONFIRMED' | 'DENIED' | 'DIFFERS' | 'UNAVAILABLE'` for verdicts
- Function length: N/A — Markdown instructions
- Files modified: 1 new file, ~250 lines — design-first flag applies (draft before Write)
- Parallelizable: No — depends on Tasks 1 and 2 completing so the reference file paths are valid

**Acceptance Criteria:**
- [ ] File exists at `skills/surface-assumptions/SKILL.md`
- [ ] YAML frontmatter contains `name: surface-assumptions`
- [ ] YAML frontmatter `description` field includes trigger phrases: "check assumptions", "what am I assuming", "verify assumptions", "surface assumptions"
- [ ] YAML frontmatter `tools` field contains: `Read, Glob, Grep, Bash, Task, Write, Edit, AskUserQuestion, WebFetch, WebSearch, mcp__plugin_context7_context7__query-docs, mcp__plugin_context7_context7__resolve-library-id`
- [ ] File contains `## When to Use` and `## When to Skip` sections
- [ ] File contains `### Step 1: Load Context` that loads user-specified path or most recent `.md` in `docs/plans/` via `Glob: docs/plans/*.md`, plus `.feature-flow.yml`
- [ ] File contains `### Step 2: Extract Assumptions` that dispatches exactly 3 parallel Explore/haiku agents (explicit, implicit, dependency)
- [ ] The Step 2 agent dispatch uses correct Task tool syntax: `Task(subagent_type: "Explore", model: "haiku", ...)`
- [ ] Each extraction agent returns the JSON schema with fields: `id`, `category`, `assumption`, `source`, `verifiability` (auto/manual/runtime/unverifiable), `verification` (with `method`, `command`, `expected`), `risk`, `risk_reason`
- [ ] The 8 assumption categories are documented: `external-api`, `discovery`, `cross-service`, `library`, `codebase`, `environment`, `data`, `prior-session`
- [ ] File contains empty-result early-exit: "No assumptions detected in this design — nothing to verify." when all three agents return zero assumptions
- [ ] File contains `### Step 3: Classify and Prioritize` with deduplication rule (category + source reference; higher risk wins)
- [ ] Step 3 documents risk levels: `critical`, `high`, `medium`, `low` with descriptions
- [ ] Step 3 documents verifiability: `auto`, `manual`, `runtime`, `unverifiable` with descriptions
- [ ] File contains `### Step 4: Generate Verification Plan` with verification patterns per category
- [ ] Step 4 documents the cross-service critical rule: always fetch BOTH discovery docs when a plan says "same as Service A"
- [ ] Step 4 documents the library verification pattern using `mcp__plugin_context7_context7__query-docs` with Context7 fallback note: "Context7 not available — library assumption not verified."
- [ ] File contains `### Step 5: Execute Verifications` dispatching up to 5 parallel `general-purpose`/`haiku` agents
- [ ] Step 5 agent dispatch uses correct Task tool syntax: `Task(subagent_type: "general-purpose", model: "haiku", ...)`
- [ ] Step 5 documents all-manual handling: skip dispatch, announce "All assumptions require manual verification — no automated checks to run.", list all in "Blocked Assumptions" section
- [ ] Step 5 each agent returns JSON with fields: `assumption_id`, `verdict` (`CONFIRMED | DENIED | DIFFERS | UNAVAILABLE`), `evidence`, `diff`
- [ ] File contains `### Step 6: Report Results` with the table format (`# | Risk | Category | Assumption | Verdict | Evidence`)
- [ ] Step 6 includes all-UNAVAILABLE warning text
- [ ] Step 6 includes gotcha generation for DENIED/DIFFERS findings using plain string format matching `.feature-flow.yml` gotchas array
- [ ] Step 6 includes `AskUserQuestion` for handling critical/high DENIED or DIFFERS findings (options: "Fix plan", "Fix and continue", "Ignore")
- [ ] File contains `## YOLO Behavior` section with announcement format `YOLO: surface-assumptions — [N] assumptions verified, [M] denied → fixing plan`
- [ ] YOLO behavior: auto-execute verifications, auto-add gotchas, auto-fix critical/high DENIED assumptions
- [ ] File contains `## Quality Rules` section with the 6 rules (never skip discovery, never assume cross-service equivalence, verify data relationships, re-verify prior diagnoses, prefer machine verification, surface implicit assumptions)
- [ ] File contains `## Additional Resources` section referencing `references/assumption-patterns.md`, `references/discovery-endpoints.md`, and `../../references/tool-api.md`
- [ ] Prior session handling: triggered when plan contains "Resume Checklist", "Blocker", or "Next session" sections; all diagnoses treated as `prior-session` assumptions; if no evidence command can be extracted, classify as `manual`
- [ ] Grep for `Task(subagent_type` in the file returns at least 2 matches

**Edge Case Criteria:**
- [ ] When all assumptions are `manual`/`runtime`/`unverifiable`: skip Step 5 dispatch, proceed directly to Step 6 report with empty verification table and the announcement
- [ ] When all verifications return UNAVAILABLE: include the warning about external services being unreachable
- [ ] When design has only `codebase`/`environment`/`library` categories (no external API references): skill still runs normally — these have verification patterns

**Step 1: Verify reference files exist**

```bash
ls skills/surface-assumptions/references/
```

Expected: `assumption-patterns.md` and `discovery-endpoints.md`. If either is missing, complete Tasks 1 and 2 first.

**Step 2: Write the SKILL.md**

Create `skills/surface-assumptions/SKILL.md` with this exact content:

````markdown
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

**Dispatch 3 parallel Explore agents (model: haiku):**

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
  - verifiable: boolean
  - verification: { method: string, command: string, expected: string } | null
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
  - verifiable: boolean
  - verification: { method: string, command: string, expected: string } | null
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
  - verifiable: boolean
  - verification: { method: string, command: string, expected: string } | null
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

Merge results from all 3 agents. **Deduplicate** by category + source reference. When two agents surface the same assumption, keep the one with the higher risk level.

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

If `mcp__plugin_context7_context7__resolve-library-id` is not available, skip
library verification and note in the report: "Context7 not available — library
assumption not verified."

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
- Auto-fix critical/high DENIED assumptions in the design doc
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
````

**Step 3: Verify the file was created**

```bash
ls skills/surface-assumptions/
```

Expected: `SKILL.md` and `references/`

**Step 4: Spot-check the file**

Verify these are present in the created file:

```bash
grep -c "Task(subagent_type" skills/surface-assumptions/SKILL.md
```

Expected: at least 2

```bash
grep "name: surface-assumptions" skills/surface-assumptions/SKILL.md
```

Expected: exactly 1 match

**Step 5: Commit**

```bash
git add skills/surface-assumptions/SKILL.md
git commit -m "feat: add surface-assumptions skill (Phase 1 MVP) — #210"
```

---

### Task 4: Commit planning artifacts

**Files:**
- Add: `docs/plans/2026-04-04-surface-assumptions.md` (design doc, already exists)
- Add: `docs/plans/2026-04-04-surface-assumptions-plan.md` (this file)
- Add: `feature-flow-assumption-verification.md` (spec file, already exists)

**Quality Constraints:**
- Pattern: Use the standard planning artifact commit message format used in this repo (see prior commits)
- Parallelizable: No — must run after all other tasks are defined and complete

**Acceptance Criteria:**
- [ ] `git status` shows no untracked or unstaged changes to `docs/plans/2026-04-04-surface-assumptions-plan.md`
- [ ] `git status` shows no untracked or unstaged changes to `docs/plans/2026-04-04-surface-assumptions.md`
- [ ] `git log --oneline -1` shows a commit message referencing issue #210

**Step 1: Check which files are untracked**

```bash
git status
```

Note which planning artifacts appear as untracked.

**Step 2: Stage planning artifacts**

```bash
git add docs/plans/2026-04-04-surface-assumptions-plan.md
git add docs/plans/2026-04-04-surface-assumptions.md
git add feature-flow-assumption-verification.md
```

**Step 3: Commit**

```bash
git commit -m "docs: add surface-assumptions design doc and implementation plan — #210"
```

---
