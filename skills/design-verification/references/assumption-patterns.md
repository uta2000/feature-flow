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
