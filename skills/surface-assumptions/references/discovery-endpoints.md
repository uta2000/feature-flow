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
