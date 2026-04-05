# Assumption Verification (Batch 9) Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add assumption verification as Batch 9 (Category 25) to the design-verification skill, conditionally dispatched when a design doc references external services, OAuth/OIDC endpoints, cross-service equivalence phrases, or API endpoints.

**Architecture:** Four file changes — two modifications (`SKILL.md`, `references/checklist.md`) and two new reference files (`references/assumption-patterns.md`, `references/discovery-endpoints.md`). All changes are Markdown prompt-instruction files. No executable code. Batch 9 mirrors the Batch 8 conditional dispatch pattern and returns the same `[{category, status, finding}]` format.

**Tech Stack:** Markdown (prompt instructions), YAML (`.feature-flow.yml` configuration)

**Issue:** #212

---

<!-- Progress Index -->
## Progress Index

| Task | Title | Status |
|------|-------|--------|
| 1 | Create `references/assumption-patterns.md` | pending |
| 2 | Create `references/discovery-endpoints.md` | pending |
| 3 | Add Category 25 to `references/checklist.md` | pending |
| 4 | Add Batch 9 to `skills/design-verification/SKILL.md` | pending |
| 5 | Commit planning artifacts | pending |

---

### Task 1: Create `skills/design-verification/references/assumption-patterns.md`

**Files:**
- Create: `skills/design-verification/references/assumption-patterns.md`

**Quality Constraints:**
- Pattern: Match heading and checklist style used in `references/checklist.md` (H2 category headings, checkbox lists, "Where to look" and "Common findings" sub-sections, bold labels)
- Naming: All section headings use Title Case; file paths in examples use forward slashes
- Error handling: N/A — documentation file
- Type narrowness: N/A — Markdown instructions
- Function length: N/A — documentation file
- Parallelizable: Yes — does not depend on any other task

**Acceptance Criteria:**
- [ ] File exists at `skills/design-verification/references/assumption-patterns.md`
- [ ] File contains exactly 8 top-level sections (H2): OAuth/OIDC, REST APIs, Cross-Service Equivalence, Data Relationships, Library Assumptions, Environment, Prior Session, Codebase
- [ ] Each section includes at least one diversified example (domain varies — not all FHIR)
- [ ] OAuth/OIDC section covers FHIR, generic OAuth, and Stripe as examples
- [ ] Cross-Service section lists red-flag trigger phrases: "same as", "like we did for", "reuse the"
- [ ] Prior Session section instructs the agent to re-run diagnostic evidence, not re-read conclusions
- [ ] Library Assumptions section mentions Context7 as primary lookup with `grep`/`Read` as fallback
- [ ] Grep for `same as` in the file returns at least 1 match
- [ ] Grep for `Context7` in the file returns at least 1 match

**Step 1: Write the file**

Create `skills/design-verification/references/assumption-patterns.md` with this content:

```markdown
# Assumption Verification Patterns

Reference for Batch 9 (Category 25). Each section describes how to verify a class of assumption that commonly appears in design documents. Diversify verification across multiple services and domains — do not default to FHIR or any single example for every check.

---

## OAuth / OIDC

Design documents frequently assume OAuth/OIDC endpoints, scopes, and token shapes match what they recall from a previous session or a different service.

**What to verify:**
- [ ] **Discovery document:** Fetch the `/.well-known/openid-configuration` (or equivalent) for every OAuth/OIDC provider named. Compare the actual `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, and `jwks_uri` against what the design states.
- [ ] **Scope names:** Confirm the exact scope strings (e.g., `launch/patient`, `openid profile email`) are supported by the provider. Scope names are provider-specific — do not assume they match another provider's scopes.
- [ ] **SMART / FHIR:** For FHIR SMART-on-FHIR flows, fetch the FHIR server's `.well-known/smart-configuration`. Verify `code_challenge_methods_supported`, `response_types_supported`, and whether the server uses PKCE.
- [ ] **Generic OAuth (e.g., GitHub, Google, Okta):** Fetch the provider's discovery doc or OAuth 2.0 metadata endpoint. Verify token endpoint, grant types supported, and whether PKCE is required.
- [ ] **Stripe:** Stripe uses OAuth for Connect flows — the authorization URL is `https://connect.stripe.com/oauth/authorize`, not a standard OIDC endpoint. Verify the design is not conflating Stripe Connect with a generic OIDC flow.

**Where to look:**
- Provider discovery documents (see `discovery-endpoints.md`)
- Design doc's "Auth Flow" or "Integration" sections

**Red flags:**
- Design says "same OAuth flow as [other service]" without verifying scope names and endpoint URLs match
- Design assumes PKCE without confirming the provider supports it

**Common findings:**
- FHIR server requires `launch` context but design omits it from scope list
- GitHub OAuth does not support OIDC discovery — design assumes `/.well-known/openid-configuration` exists
- Stripe Connect token endpoint differs from the design's assumed URL

---

## REST APIs

Design documents assume API response shapes, field names, and pagination contracts that may have changed or were recalled from a different API version.

**What to verify:**
- [ ] **Response shape:** Fetch or look up the current API docs for every endpoint the design calls. Compare field names, nesting, and data types against what the design assumes.
- [ ] **Pagination contract:** Verify the pagination strategy (cursor vs. offset, field names like `next_cursor` vs. `nextPageToken`, page size limits).
- [ ] **Rate limits:** Verify rate limit headers and per-endpoint limits (per-minute vs. per-hour vs. per-day; authenticated vs. unauthenticated).
- [ ] **GitHub API example:** If the design calls GitHub REST API, verify the endpoint path (e.g., `/repos/{owner}/{repo}/pulls` not `/repos/{owner}/{repo}/pull-requests`), confirm field names (`number`, `title`, `state` — not `id` or `name`), and check whether the endpoint requires a specific Accept header.
- [ ] **Generic REST:** For any third-party REST API, fetch the OpenAPI spec if available (see `discovery-endpoints.md`). If not available, use WebSearch for current docs.

**Where to look:**
- API provider documentation (use WebFetch on OpenAPI spec URL if available)
- `discovery-endpoints.md` for known spec endpoints

**Common findings:**
- API moved from v2 to v3 with different field names; design uses v2 names
- Pagination uses cursor not offset; design assumes `page=N&limit=M` query params
- GitHub API returns `login` for username, not `username`

---

## Cross-Service Equivalence

"Same as" phrases in design documents are the highest-risk assumption class. When a design says one service behaves like another, both services must be verified independently.

**Red-flag trigger phrases — always verify both services when these appear:**
- "same as [service]"
- "like we did for [service]"
- "reuse the [component/flow/config] from [service]"
- "works the same way"
- "similar to [service]"
- "follow the [service] pattern"

**What to verify:**
- [ ] **Service A:** Fetch the current documentation or discovery doc for Service A. Record the actual endpoint URLs, field names, and auth flow.
- [ ] **Service B:** Do the same for Service B. Do not assume equivalence — record independently.
- [ ] **Diff:** Compare the two sets of facts. List every divergence. Each divergence is a separate finding.
- [ ] **Scope mismatch:** Even if two OAuth providers both support OIDC, their scope strings often differ. Verify scope names for both providers independently.
- [ ] **Error shape mismatch:** Services that look similar often return errors in different formats (HTTP status codes, error body shapes). Verify error contracts for both.

**Where to look:**
- Discovery documents (see `discovery-endpoints.md`)
- Provider-specific documentation

**Common findings:**
- FHIR SMART and standard OIDC both use `/.well-known/` but the field names inside the discovery doc differ
- Two REST APIs both return paginated lists but use different cursor field names
- Design reuses a Supabase auth flow for a Firebase project — token validation differs entirely

---

## Data Relationships

Design documents assume foreign key relationships, join paths, and cardinality that may not exist in the actual schema.

**What to verify:**
- [ ] **Join path exists:** For every JOIN the design proposes, verify the foreign key column exists in the actual schema (migrations or ORM model).
- [ ] **Cardinality:** Verify whether the relationship is 1:1, 1:N, or N:M. The design's assumed cardinality must match the schema constraint.
- [ ] **Nullability on FK column:** A nullable FK column means the join is optional — the design must handle the NULL case.
- [ ] **FHIR example:** FHIR resources use `reference` strings (e.g., `Patient/123`) not integer foreign keys. If the design assumes a numeric FK join on a FHIR resource, verify the storage model.
- [ ] **Generic REST data example:** If the design assumes a user has exactly one profile record, verify the database has a UNIQUE constraint on `user_id` in the profiles table. If the constraint is absent, the assumption is unverified.

**Where to look:**
- Migration files (`supabase/migrations/`, `prisma/schema.prisma`, `drizzle/`)
- ORM model definitions
- Existing API route response types for nested shape assumptions

**Common findings:**
- Design assumes a direct FK from `appointments` to `locations` but the actual schema uses a junction table
- Design assumes 1:1 user-to-profile but no UNIQUE constraint exists on `profiles.user_id`
- Design assumes FHIR references resolve to local DB rows but the service stores raw reference strings

---

## Library Assumptions

Design documents assume library APIs, method signatures, and behaviors that may have changed between versions or were recalled incorrectly.

**What to verify:**
- [ ] **Method exists:** For every library method the design calls, verify it exists in the installed version. Use Context7 as primary source; fall back to `Grep` for the method name in `node_modules` or `Glob` for the package's changelog.
- [ ] **Signature match:** Verify the parameter order and names match the current API. Pay attention to breaking changes between major versions.
- [ ] **Return type:** Verify whether the method returns a Promise, Observable, or synchronous value — designs often get this wrong.
- [ ] **Context7 lookup:** Query Context7 with the library name and method. If Context7 is unavailable, use `Grep` to search the installed package's source or type definitions for the method signature.
- [ ] **Grep fallback:** If Context7 returns no results, run: `Grep pattern="methodName" path="node_modules/library-name/dist"` or read the package's `.d.ts` type definitions.

**Where to look:**
- Context7 (primary): query with library name + method name
- `node_modules/{library}/` type definitions (`.d.ts` files)
- `package.json` for installed version; library's changelog for breaking changes between that version and what the design assumes

**Common findings:**
- Design calls `library.parseSync()` but the installed version only has `library.parse()` (async)
- Design assumes a React hook returns `[value, setValue]` but the library changed to returning an object in v3
- Design uses a Supabase method that was deprecated in the installed `@supabase/ssr` version

---

## Environment

Design documents assume environment variables, service ports, and infrastructure components exist and are configured correctly.

**What to verify:**
- [ ] **Env vars exist:** For every environment variable the design references, verify it appears in `.env.example` (or equivalent) AND is documented in the project's environment setup.
- [ ] **Port conventions:** If the design assumes a specific port (e.g., Redis on 6379, Postgres on 5432), verify the project's Docker Compose or infra config uses the same port.
- [ ] **Service availability:** If the design assumes a background worker, queue, or caching layer exists (e.g., Redis, BullMQ, Celery), verify the service is in the project's infrastructure config.
- [ ] **Environment-specific config:** Verify that any env-var-gated feature (e.g., `FEATURE_FLAG_X=true`) has the same name in all relevant environments (dev, staging, production).

**Where to look:**
- `.env.example`, `.env.local`, `docker-compose.yml`, `railway.toml`, `vercel.json`
- Infrastructure-as-code files

**Common findings:**
- Design references `NEXT_PUBLIC_ANALYTICS_URL` but `.env.example` has `NEXT_PUBLIC_ANALYTICS_ENDPOINT`
- Design assumes Redis is available but `docker-compose.yml` has no Redis service
- Design uses `process.env.FEATURE_FLAG` but the variable is named differently in the production environment

---

## Prior Session

Design documents sometimes reference conclusions from a previous debugging session without re-running the diagnostic. Conclusions can be stale — re-run the evidence, don't re-read the conclusion.

**What to verify:**
- [ ] **Re-run, don't re-read:** If the design says "as we determined last session, X is the cause", treat this as an unverified assumption. Re-run the diagnostic steps that produced that conclusion.
- [ ] **Grep for current state:** Search the codebase for the specific code pattern the prior session identified. Verify it still exists and has not been changed by an intervening commit.
- [ ] **Re-read the actual file:** If the design references a specific file and line number from a prior session, read that file now to confirm the content is still as expected.
- [ ] **Re-test the hypothesis:** If the prior session concluded "the bug is in function X", read function X and verify the bug is still present and unfixed.

**Where to look:**
- The design document's "Background" or "Context" section for phrases like "as determined", "from last session", "we found that", "the issue is"
- The specific files and functions named in the prior diagnosis

**Red-flag phrases:**
- "as we determined"
- "from our previous investigation"
- "the root cause is (from last session)"
- "we already know that"

**Common findings:**
- Prior session identified a bug in a function that was subsequently fixed in a later commit — design proposes unnecessary workaround
- Prior session assumed a specific API response shape; the API was updated since

---

## Codebase

Design documents assume functions, modules, and utilities exist in the codebase that may not, or may work differently than assumed.

**What to verify:**
- [ ] **Function exists:** For every utility or helper the design says it will "reuse", grep for it. Verify the function exists AND is exported from the expected location.
- [ ] **Signature match:** Read the function's implementation (or type signature). Verify the parameter names and types match what the design assumes.
- [ ] **Return shape:** Verify what the function actually returns. Designs frequently assume a richer return shape than the function provides.
- [ ] **Import path:** Verify the import path the design assumes is the correct module path (case-sensitive, correct directory depth).
- [ ] **Side effects:** If the design assumes a function is pure (no side effects), read the implementation to confirm.

**Where to look:**
- `Grep` for the function name across the codebase
- `Read` the implementation file to check signature and return type
- `Glob` for the module file to verify it exists at the assumed path

**Common findings:**
- Design assumes `utils/formatDate` exists but the actual utility is `lib/dates/format`
- Design assumes a hook returns `{ data, error }` but it returns `[data, error]` (tuple)
- Design assumes a shared component accepts a `variant` prop but the component has no such prop
```

**Step 2: Verify the file was created**

Run: `Glob pattern="skills/design-verification/references/assumption-patterns.md"`
Expected: 1 match at the correct path.

**Step 3: Commit**

```bash
git add skills/design-verification/references/assumption-patterns.md
git commit -m "docs: add assumption-patterns.md reference for Batch 9 — #212"
```

---

### Task 2: Create `skills/design-verification/references/discovery-endpoints.md`

**Files:**
- Create: `skills/design-verification/references/discovery-endpoints.md`

**Quality Constraints:**
- Pattern: Match heading and table style used in existing reference files in this directory
- Naming: URL examples use real, publicly documented endpoint patterns (not invented)
- Error handling: N/A — documentation file
- Parallelizable: Yes — does not depend on any other task

**Acceptance Criteria:**
- [ ] File exists at `skills/design-verification/references/discovery-endpoints.md`
- [ ] File contains a section for each of: FHIR, OAuth 2.0/OIDC, REST (OpenAPI), GraphQL, gRPC, Cloud Services
- [ ] Cloud Services section covers: AWS, GCP, Azure, Vercel, Supabase
- [ ] File ends with a "Fallback Steps" section for services with no known discovery endpoint
- [ ] Grep for `/.well-known/openid-configuration` in the file returns at least 1 match
- [ ] Grep for `Supabase` in the file returns at least 1 match
- [ ] Grep for `Fallback` in the file returns at least 1 match

**Step 1: Write the file**

Create `skills/design-verification/references/discovery-endpoints.md` with this content:

```markdown
# Known Discovery Endpoints

Reference for Batch 9 (Category 25). Use these endpoints to fetch live API contracts and verify assumptions in design documents. Always prefer a discovery document over recalled knowledge.

---

## FHIR

| What | Endpoint Pattern | Notes |
|------|-----------------|-------|
| SMART configuration | `{fhir-base}/.well-known/smart-configuration` | Returns supported scopes, PKCE requirements, auth endpoints |
| FHIR capability statement | `{fhir-base}/metadata` | Returns resource types, search parameters, supported operations |
| FHIR version check | `{fhir-base}/metadata` → `fhirVersion` field | Confirm R4 vs. R4B vs. R5 |

**Example:**
```
WebFetch: https://launch.smarthealthit.org/v/r4/sim/WzMsIiIsIiIsIkFVVE8iLDAsMCwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMV0/fhir/.well-known/smart-configuration
```

---

## OAuth 2.0 / OIDC

| Provider Type | Endpoint Pattern | Notes |
|--------------|-----------------|-------|
| Standard OIDC | `{issuer}/.well-known/openid-configuration` | Returns all OAuth/OIDC endpoints and supported features |
| OAuth 2.0 metadata | `{issuer}/.well-known/oauth-authorization-server` | RFC 8414; used by providers that support OAuth 2.0 but not full OIDC |
| Google | `https://accounts.google.com/.well-known/openid-configuration` | Full OIDC |
| Okta | `https://{domain}.okta.com/.well-known/openid-configuration` | Full OIDC |
| Auth0 | `https://{tenant}.auth0.com/.well-known/openid-configuration` | Full OIDC |
| Keycloak | `https://{host}/auth/realms/{realm}/.well-known/openid-configuration` | Full OIDC |
| Microsoft Entra | `https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration` | Full OIDC |
| GitHub | No OIDC discovery document | GitHub OAuth uses `/login/oauth/authorize` and `/login/oauth/access_token` — no `.well-known` endpoint |
| Stripe Connect | `https://connect.stripe.com/oauth/authorize` | Not OIDC — Stripe Connect uses custom OAuth 2.0, no discovery doc |

**Note:** Always fetch the discovery document rather than assuming endpoint paths. Fields like `token_endpoint`, `userinfo_endpoint`, and `scopes_supported` are provider-specific.

---

## REST (OpenAPI)

| Pattern | How to Find |
|---------|------------|
| OpenAPI JSON | Try `{api-base}/openapi.json` or `{api-base}/swagger.json` |
| OpenAPI YAML | Try `{api-base}/openapi.yaml` |
| Swagger UI | Try `{api-base}/docs` or `{api-base}/swagger-ui` |
| API docs URL | Use WebSearch: `"{service name}" OpenAPI spec site:github.com OR site:api-docs.io` |

**Known OpenAPI spec locations:**

| Service | OpenAPI Spec |
|---------|-------------|
| GitHub REST API | `https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json` |
| Stripe | `https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json` |
| Twilio | `https://raw.githubusercontent.com/twilio/twilio-oai/main/spec/json/twilio_api_v2010.json` |

---

## GraphQL

| What | How |
|------|-----|
| Schema introspection | POST `{graphql-endpoint}` with body: `{"query": "{ __schema { types { name kind } } }"}` |
| Full type details | POST with the full introspection query (SDL format) |

**Note:** Many production GraphQL APIs disable introspection. If introspection is disabled, use WebSearch for the service's public schema docs or SDL files.

---

## gRPC

| What | How |
|------|-----|
| Server reflection | Use `grpc_cli ls {host}:{port}` if the server supports reflection |
| Proto files | WebSearch for `"{service name}" proto file site:github.com` |
| Buf Schema Registry | `https://buf.build/{org}/{repo}` if the service publishes to BSR |

---

## Cloud Services

### AWS

| Service | Discovery / Reference |
|---------|----------------------|
| IAM policy actions | `https://docs.aws.amazon.com/service-authorization/latest/reference/reference_policies_actions-resources-contextkeys.html` |
| S3 API reference | `https://docs.aws.amazon.com/AmazonS3/latest/API/` |
| Lambda event sources | `https://docs.aws.amazon.com/lambda/latest/dg/lambda-services.html` |
| CloudFormation resource types | `https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-template-resource-type-ref.html` |

### GCP

| Service | Discovery / Reference |
|---------|----------------------|
| API Discovery Service | `https://www.googleapis.com/discovery/v1/apis` (lists all GCP APIs) |
| Specific API | `https://www.googleapis.com/discovery/v1/apis/{api}/{version}/rest` |

### Azure

| Service | Discovery / Reference |
|---------|----------------------|
| REST API specs | `https://github.com/Azure/azure-rest-api-specs` |
| Resource Manager | `https://management.azure.com/{subscription}/providers?api-version=2021-04-01` |

### Vercel

| What | Reference |
|------|-----------|
| Vercel API | `https://vercel.com/docs/rest-api` |
| Edge Config | `https://vercel.com/docs/storage/edge-config/edge-config-sdk` |
| Environment variables | Via CLI: `vercel env ls` |

### Supabase

| What | How |
|------|-----|
| PostgREST auto-generated OpenAPI | `{supabase-project-url}/rest/v1/` (returns OpenAPI JSON) |
| Auth config | `{supabase-project-url}/auth/v1/.well-known/openid-configuration` |
| Storage API | `{supabase-project-url}/storage/v1/` |

---

## Fallback Steps

If no discovery endpoint is known for a service:

1. **WebSearch:** `"{service name}" API reference documentation`
2. **WebSearch for OpenAPI:** `"{service name}" openapi spec filetype:json OR filetype:yaml`
3. **GitHub search:** `WebFetch https://github.com/search?q={service-name}+openapi&type=repositories`
4. **Read the SDK source:** If an SDK is installed in `node_modules/`, read its TypeScript type definitions (`.d.ts` files) as a proxy for the API contract.
5. **Changelog review:** If verifying a version assumption, read the package's `CHANGELOG.md` or GitHub releases page.

When all fallback steps fail, report the assumption as **unverifiable** with status WARNING and finding: "Could not fetch live API contract for [service] — assumption is unverified. Recommend manual verification before implementation."
```

**Step 2: Verify the file was created**

Run: `Glob pattern="skills/design-verification/references/discovery-endpoints.md"`
Expected: 1 match at the correct path.

**Step 3: Commit**

```bash
git add skills/design-verification/references/discovery-endpoints.md
git commit -m "docs: add discovery-endpoints.md reference for Batch 9 — #212"
```

---

### Task 3: Add Category 25 to `skills/design-verification/references/checklist.md`

**Files:**
- Modify: `skills/design-verification/references/checklist.md`

**Quality Constraints:**
- Design-first: Read `references/checklist.md` in full before making any Edit call. Identify the exact text of the `<!-- batch: 8 -->` section and the trailing lines to use as `old_string`.
- Pattern: Match the existing category format — H2 heading with number and name, checkbox list, "Where to look" sub-section, "Common findings" sub-section
- Batch marker: Add `<!-- batch: 9 -->` before the new category, matching the `<!-- batch: N -->` marker convention used for batches 1–5 and 8
- The new category inserts AFTER the last line of Category 24 (end of the `<!-- batch: 8 -->` section), at the end of the file
- Parallelizable: No — depends on Tasks 1 and 2 completing first (references assumption-patterns.md and discovery-endpoints.md by name)

**Acceptance Criteria:**
- [ ] `references/checklist.md` contains `<!-- batch: 9 -->` marker
- [ ] `references/checklist.md` contains `## 25. External Assumptions` heading
- [ ] The section includes all 6 sub-items: External API endpoint verification, Cross-service equivalence checks, Data relationship verification, Prior-session diagnosis re-verification, Library API assumption checks, Environment assumption checks
- [ ] Cross-service equivalence item explicitly says "always verify BOTH services independently"
- [ ] Library API item mentions Context7 as primary with grep fallback
- [ ] The comment block at the top of the file is updated to reference Batch 9: `Batch 9 (External Assumptions): Category 25`
- [ ] Grep for `batch: 9` in `references/checklist.md` returns at least 1 match
- [ ] Grep for `## 25` in `references/checklist.md` returns exactly 1 match

**Step 1: Read the full checklist.md**

Read `skills/design-verification/references/checklist.md` in full. Note:
- The exact last few lines of Category 24 (the `<!-- batch: 8 -->` section) — these form the end of `old_string` for the Edit
- The exact text of the comment block at the top (to update with Batch 9 reference)
- The file's current last line (to use as anchor for append)

**Step 2: Update the comment block at the top**

The current comment block ends with:
```
  Batch 8 (Design Preferences): Category 24
-->
```

Use Edit to add the Batch 9 line:
- `old_string`: `  Batch 8 (Design Preferences): Category 24\n-->`
- `new_string`:
```
  Batch 8 (Design Preferences): Category 24
  Batch 9 (External Assumptions): Category 25
-->
```

**Step 3: Append Category 25 at the end of the file**

The current last line of the file is the last line of Category 24. Use Edit with the final unique lines of the file as `old_string` and append the new content at the end.

The text to append:

```markdown
<!-- batch: 9 — not in this file; see SKILL.md for Batch 9 dispatch logic -->

<!-- batch: 9 -->
## 25. External Assumptions

*This category is skipped entirely if the design document contains no external service references. External references are detected by: URLs matching `https://`, OAuth keywords (`oauth`, `oidc`, `smart`, `.well-known`), cross-service phrases (`same as`, `like we did for`, `reuse the`), or API endpoint mentions (`/api/`, `/v1/`, `/v2/`).*

For each external service, OAuth provider, or cross-service equivalence claim in the design:

- [ ] **External API endpoint verification:** For every external API the design calls, fetch the live discovery document or OpenAPI spec (see `references/discovery-endpoints.md`). Compare actual endpoint paths, field names, and response shapes against the design's assumptions.
- [ ] **Cross-service equivalence checks:** When the design uses phrases like "same as", "like we did for", or "reuse the [pattern/config/flow] from [service]" — always verify BOTH services independently. Do not assume equivalence. Record the actual facts for each service and diff them.
- [ ] **Data relationship verification:** For every JOIN or FK relationship the design proposes, verify the foreign key column exists in the schema, the cardinality matches, and nullable FK columns are handled in the design.
- [ ] **Prior-session diagnosis re-verification:** When the design references a conclusion from a previous session (e.g., "as we determined", "we found that", "the root cause is"), re-run the diagnostic — grep for the code pattern, read the file, re-check the assumption. Do not treat a prior conclusion as current fact.
- [ ] **Library API assumption checks:** For every library method the design calls, verify the method exists and the signature matches in the installed version. Use Context7 as primary source; fall back to `Grep` on `node_modules/{library}/*.d.ts` or the package's changelog.
- [ ] **Environment assumption checks:** For every environment variable, service port, or infrastructure component the design assumes, verify it exists in `.env.example`, `docker-compose.yml`, or equivalent config files.

**Where to look:**
- `references/assumption-patterns.md` — per-category verification patterns with examples
- `references/discovery-endpoints.md` — known discovery endpoints for FHIR, OAuth/OIDC, REST, GraphQL, cloud services

**Common findings:**
- Design assumes FHIR SMART scopes match a generic OIDC provider's scopes — they differ
- Design says "reuse the auth flow from [service]" but the two services use different token endpoint URLs
- Design references a function from a prior session that has since been refactored away
- Design calls a library method that was renamed between the documented version and the installed version
- Design assumes an environment variable named differently than what `.env.example` declares
```

**Step 4: Verify the edit**

Read the last 50 lines of `skills/design-verification/references/checklist.md` to confirm:
- `<!-- batch: 9 -->` marker is present
- `## 25. External Assumptions` heading is present
- All 6 checkbox items are present

**Step 5: Commit**

```bash
git add skills/design-verification/references/checklist.md
git commit -m "feat: add Category 25 External Assumptions to design-verification checklist — #212"
```

---

### Task 4: Add Batch 9 to `skills/design-verification/SKILL.md`

**Files:**
- Modify: `skills/design-verification/SKILL.md`

**Quality Constraints:**
- Design-first: `SKILL.md` is >150 lines — read the full file before making any Edit call. Identify exact `old_string` boundaries for all four insertion points (batch table, dispatch section, context filter map, frontmatter description). State all insertion points before editing.
- Pattern: Match the Batch 8 conditional dispatch pattern — same conditional structure, same announcement format, same `subagent_type: "Explore"` + `model: "sonnet"` invocation
- Pattern: Match the frontmatter description style — comma-separated trigger phrases on a single line
- Pattern: `assumptions-only` flag behavior follows the same pattern as other run-mode flags in the project (announce + skip, not error)
- Error handling: If no external references detected, skip with PASS — do not error. Include this skip in the consolidation output as PASS (not SKIPPED).
- Type narrowness: Batch 9 agent returns same format as all other batches: `[{category: string, status: "PASS" | "FAIL" | "WARNING", finding: string}]`
- Parallelizable: No — must run after Task 3 (checklist.md updated, so Batch 9 has its category defined)

**Acceptance Criteria:**
- [ ] Frontmatter `description` field includes: "check assumptions", "what am I assuming", "verify assumptions", "surface assumptions"
- [ ] The batch dispatch table in Step 4 includes a Batch 9 row: `| 9 | External Assumptions | 25. External Assumptions |`
- [ ] Step 4 contains a `#### Batch 9 — Conditional Dispatch (External Assumptions)` section
- [ ] Batch 9 dispatch condition is documented: URLs matching `https://`, OAuth keywords (`oauth`, `oidc`, `smart`, `.well-known`), cross-service phrases (`same as`, `like we did for`, `reuse the`), API endpoint mentions (`/api/`, `/v1/`, `/v2/`)
- [ ] Batch 9 context includes: full design doc + `.feature-flow.yml` + `assumption-patterns.md` checklist + `discovery-endpoints.md`
- [ ] If no external references detected, Batch 9 is skipped with a PASS result (not SKIPPED) for Category 25 with finding: "No external service references detected — assumption verification not required."
- [ ] Context Filter Map table includes a Batch 9 row: `| 9 — External Assumptions | *(no exploration_results sections — Batch 9 uses live fetching)* |`
- [ ] `assumptions-only` flag: when present in ARGUMENTS, Batches 1-8 are skipped, only Batch 9 runs. Announce: `Running assumption verification only (Batches 1-8 skipped).`
- [ ] Batch 9 agent is included in the same single-message launch as Batches 1-8 (concurrent execution)
- [ ] Grep for `Batch 9` in `SKILL.md` returns at least 3 matches
- [ ] Grep for `assumptions-only` in `SKILL.md` returns at least 2 matches
- [ ] Grep for `assumption-patterns.md` in `SKILL.md` returns at least 1 match

**Step 1: Read the full SKILL.md and plan all edit locations**

Read `skills/design-verification/SKILL.md` in full. Identify the exact `old_string` text for each of these 5 insertion/modification points:

1. **Frontmatter description** — the current `description:` line (to add trigger phrases)
2. **Batch table** — the last row of the batch dispatch table (to add Batch 9 row after Batch 8)
3. **Batch 8 section end** — the last line(s) of the `#### Batch 8 — Conditional Dispatch` section (to insert Batch 9 section after it)
4. **Context Filter Map** — the last row of the Context Filter Map table (to add Batch 9 row)
5. **`assumptions-only` flag** — find where other run-mode flags are checked (if any) or add after the "Dispatch" subsection header

State all 5 insertion points before making any Edit call.

**Step 2: Update frontmatter description**

Use Edit to update the `description:` field. The current value ends with `...before implementation.`. Append the new trigger phrases:

- `old_string`: the current full `description:` line
- `new_string`: same line with appended `, "check assumptions", "what am I assuming", "verify assumptions", "surface assumptions"`

**Step 3: Add Batch 9 row to the batch dispatch table**

Current last row in the table:
```
| 8 | Design Preferences | 24. Design Preferences Compliance |
```

Use Edit to insert after that row:
```
| 9 | External Assumptions | 25. External Assumptions |
```

**Step 4: Add `assumptions-only` flag handling**

In Step 4 (Run Verification Checklist), immediately after the batch table (and before the "Verification depth filtering" paragraph), insert:

```markdown
**`assumptions-only` flag:** If `assumptions-only` is present in ARGUMENTS, skip Batches 1–8 entirely and run only Batch 9. Announce: `Running assumption verification only (Batches 1-8 skipped).` Then proceed directly to Batch 9 dispatch below.
```

**Step 5: Add Batch 9 to the Context Filter Map**

Current last row in the Context Filter Map table:
```
| 7 — Implementation Quality | `schema` + `patterns` |
```

Use Edit to insert after that row:
```
| 9 — External Assumptions | *(no `exploration_results` sections — Batch 9 uses live fetching via WebFetch/WebSearch)* |
```

**Step 6: Add the Batch 9 section after Batch 8**

Insert the full `#### Batch 9` section immediately after the end of the `#### Batch 8 — Conditional Dispatch (Design Preferences)` section (after its closing paragraph, before `#### Failure Handling`).

The full section text to insert:

```markdown
#### Batch 9 — Conditional Dispatch (External Assumptions)

Batch 9 (External Assumptions) is conditionally dispatched based on the content of the design document. Before dispatching, scan the design document text for any of the following signals:

- **URLs:** Any string matching `https://` (external service references)
- **OAuth keywords:** Any of `oauth`, `oidc`, `smart`, `.well-known` (case-insensitive)
- **Cross-service phrases:** Any of `same as`, `like we did for`, `reuse the` (case-insensitive)
- **API endpoint patterns:** Any of `/api/`, `/v1/`, `/v2/`, `/v3/` (REST endpoint path fragments)

**If no signals are detected:** Skip Batch 9 entirely. Add Category 25 to the results as:
```json
{ "category": "25. External Assumptions", "status": "PASS", "finding": "No external service references detected — assumption verification not required." }
```
Do not log a warning — this is the expected path for internal-only designs.

**If signals are detected:** Dispatch a single Batch 9 agent using the Task tool with `subagent_type: "Explore"` and `model: "sonnet"`. Include it in the same single-message launch as Batches 1-8 so all agents run concurrently.

**Context passed to the Batch 9 agent:**
- The full design document content
- The check instructions for Category 25 (from `references/checklist.md` — look for the `<!-- batch: 9 -->` marker)
- The full content of `references/assumption-patterns.md`
- The full content of `references/discovery-endpoints.md`
- The `.feature-flow.yml` content (for project context)
- The list of detected signals (URLs, OAuth keywords, cross-service phrases, API patterns found in the design)

**Agent behavior:**
The Batch 9 agent has access to WebFetch and WebSearch. It should:
1. For each detected signal, identify which assumption pattern(s) from `assumption-patterns.md` apply
2. Fetch live discovery documents or API specs where applicable (using endpoints from `discovery-endpoints.md`)
3. Compare the fetched facts against the design's stated assumptions
4. Return results in the standard format:

```json
[{ "category": "25. External Assumptions", "status": "PASS" | "FAIL" | "WARNING", "finding": "string" }]
```

If multiple distinct assumptions are verified, return one result object per assumption checked (each with `category: "25. External Assumptions"`). The orchestrator merges all into the unified report.

*(No `exploration_results` sections are passed to Batch 9 — it operates on live-fetched API contracts, not codebase exploration results.)*

```

**Step 7: Update the "Additional Resources" section**

At the bottom of the file, update the `### Reference Files` section to list the new reference files:

- `old_string`: `- **\`references/checklist.md\`** — Base verification checklist...`
- `new_string`: Same line, then add after it:
```
- **`references/assumption-patterns.md`** — Verification patterns for Batch 9 (OAuth/OIDC, REST APIs, cross-service equivalence, data relationships, library APIs, environment, prior session, codebase)
- **`references/discovery-endpoints.md`** — Known discovery endpoints for FHIR, OAuth/OIDC, REST (OpenAPI), GraphQL, gRPC, and cloud services (AWS, GCP, Azure, Vercel, Supabase)
```

**Step 8: Verify the file**

Read `skills/design-verification/SKILL.md` and confirm:
- Frontmatter description includes all 4 new trigger phrases
- Batch 9 row is in the batch table
- `assumptions-only` flag handling is present
- `#### Batch 9 — Conditional Dispatch` section exists
- Context Filter Map includes Batch 9 row
- Reference files list includes assumption-patterns.md and discovery-endpoints.md

**Step 9: Commit**

```bash
git add skills/design-verification/SKILL.md
git commit -m "feat: add Batch 9 assumption verification to design-verification skill — #212"
```

---

### Task 5: Commit planning artifacts

**Files:**
- Add: `docs/plans/2026-04-04-assumption-verification-integrated-plan.md` (this file)

**Quality Constraints:**
- Pattern: Use the standard planning artifact commit message format used in this repo
- Parallelizable: No — must run after all implementation tasks are defined

**Acceptance Criteria:**
- [ ] `git status` shows no untracked or unstaged changes to `docs/plans/2026-04-04-assumption-verification-integrated-plan.md`
- [ ] `git log --oneline -1` shows a commit message referencing issue #212

**Step 1: Stage the plan file**

```bash
git add docs/plans/2026-04-04-assumption-verification-integrated-plan.md
```

**Step 2: Commit**

```bash
git commit -m "docs: add assumption verification (Batch 9) implementation plan — #212"
```

---
