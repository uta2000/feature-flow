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
