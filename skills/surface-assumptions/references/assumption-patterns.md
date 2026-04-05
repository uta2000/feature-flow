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

## Codebase Assumptions

- Function returns the expected shape (fields, types, nullability)
- Type signature matches what the design expects to import
- Middleware runs in the expected order
- Config parsing produces the expected result
- Existing helper handles the edge case the design relies on

**Verification:**
```bash
# Check function return type or signature
grep -n "function functionName\|export.*functionName" src/path/to/file.ts

# Check type definition
grep -n "interface TypeName\|type TypeName" src/types/*.ts

# Check middleware order
grep -n "app.use\|router.use" src/app.ts
```

## Prior Session Assumptions

- "The 403 is caused by X" → re-test the 403, check if it's resolved
- "The workaround is needed because Y" → verify Y is still true
- "We need to wait for Z" → check if Z has happened
- "The plan says to do A" → verify A is still the right approach

**Verification:** Re-run the exact command that produced the original evidence.
Don't re-run the conclusion — re-run the observation.

A diagnosis from a previous session is NOT a fact. It is an assumption that must be re-verified. The environment, config, or external service may have changed. Or the original diagnosis may have been wrong.
