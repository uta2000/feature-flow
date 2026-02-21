# Auto-Discovery Rules

Detect project platform and tech stack from project files when `.feature-flow.yml` does not exist. These rules are language/framework-agnostic — scan all indicators before making a determination.

## Detection Order

1. **Platform** — Determine web vs mobile first (affects lifecycle)
2. **Stack** — Detect frameworks, databases, hosting, and key libraries
3. **Present** — Show detected context to user for confirmation
4. **Write** — Save confirmed context to `.feature-flow.yml`

## Platform Detection

Scan the project root and immediate subdirectories for platform indicators:

| Indicator | Platform |
|-----------|----------|
| `ios/` directory + `Podfile` or `*.xcodeproj` | `ios` |
| `android/` directory + `build.gradle` or `build.gradle.kts` | `android` |
| Both `ios/` and `android/` directories | `cross-platform` |
| `react-native` in package.json | `cross-platform` (check for ios/android dirs) |
| `pubspec.yaml` with `flutter` dependency | `cross-platform` |
| `*.xcodeproj` or `Package.swift` (no android/) | `ios` |
| None of the above | `web` |

## Stack Detection

### JavaScript / TypeScript (package.json)

Read `package.json` `dependencies` and `devDependencies`:

| Package | Stack Entry |
|---------|------------|
| `next` | `next-js` |
| `@supabase/supabase-js` or `@supabase/ssr` | `supabase` |
| `react-native` | `react-native` |
| `express` | `express` |
| `@nestjs/core` | `nestjs` |
| `@angular/core` | `angular` |
| `vue` | `vue` |
| `nuxt` | `nuxt` |
| `svelte` or `@sveltejs/kit` | `svelte` |
| `@remix-run/react` | `remix` |
| `@prisma/client` | `prisma` |
| `drizzle-orm` | `drizzle` |
| `firebase` or `firebase-admin` | `firebase` |
| `mongoose` or `mongodb` | `mongodb` |
| `pg` or `postgres` | `postgresql` |
| `mysql2` | `mysql` |
| `redis` or `ioredis` | `redis` |
| `stripe` | `stripe` |
| `@clerk/nextjs` or `@clerk/clerk-sdk-node` | `clerk` |
| `@auth0/nextjs-auth0` or `auth0` | `auth0` |
| `tailwindcss` | `tailwind` |
| `@aws-sdk/*` (any AWS SDK package) | `aws` |
| `@google-cloud/*` (any GCP package) | `gcp` |

### Python (requirements.txt, pyproject.toml, Pipfile, setup.py)

| Package | Stack Entry |
|---------|------------|
| `django` | `django` |
| `flask` | `flask` |
| `fastapi` | `fastapi` |
| `sqlalchemy` | `sqlalchemy` |
| `celery` | `celery` |
| `boto3` | `aws` |
| `supabase` | `supabase` |
| `firebase-admin` | `firebase` |

### Ruby (Gemfile)

| Gem | Stack Entry |
|-----|------------|
| `rails` | `rails` |
| `sinatra` | `sinatra` |
| `sidekiq` | `sidekiq` |

### Go (go.mod)

| Module | Stack Entry |
|--------|------------|
| `github.com/gin-gonic/gin` | `gin` |
| `github.com/gofiber/fiber` | `fiber` |
| `gorm.io/gorm` | `gorm` |

### Rust (Cargo.toml)

| Crate | Stack Entry |
|-------|------------|
| `actix-web` | `actix` |
| `axum` | `axum` |
| `diesel` | `diesel` |
| `sqlx` | `sqlx` |

### PHP (composer.json)

| Package | Stack Entry |
|---------|------------|
| `laravel/framework` | `laravel` |
| `symfony/framework-bundle` | `symfony` |
| `slim/slim` | `slim` |
| `doctrine/orm` | `doctrine` |

### Java / Kotlin (build.gradle, build.gradle.kts, pom.xml)

| Dependency | Stack Entry |
|-----------|------------|
| `org.springframework.boot` | `spring-boot` |
| `io.quarkus` | `quarkus` |
| `io.micronaut` | `micronaut` |
| `io.ktor` | `ktor` |

### C# / .NET (*.csproj, *.sln)

| Package / Indicator | Stack Entry |
|--------------------|------------|
| `Microsoft.AspNetCore` | `aspnet` |
| `Microsoft.EntityFrameworkCore` | `ef-core` |
| `Blazor` in project SDK | `blazor` |

### Elixir (mix.exs)

| Dependency | Stack Entry |
|-----------|------------|
| `:phoenix` | `phoenix` |
| `:ecto` | `ecto` |
| `:absinthe` | `absinthe` |

### Flutter/Dart (pubspec.yaml)

| Package | Stack Entry |
|---------|------------|
| `flutter` | `flutter` |
| `firebase_core` | `firebase` |
| `supabase_flutter` | `supabase` |

### Config File Indicators

Also scan for config files that imply stack usage:

| File or Directory | Stack Entry |
|-------------------|------------|
| `vercel.json` or `.vercel/` | `vercel` |
| `supabase/` directory or `supabase/config.toml` | `supabase` |
| `firebase.json` or `.firebaserc` | `firebase` |
| `netlify.toml` | `netlify` |
| `fly.toml` | `fly` |
| `railway.json` or `railway.toml` | `railway` |
| `render.yaml` | `render` |
| `Dockerfile` or `docker-compose.yml` | `docker` |
| `.github/workflows/` | `github-actions` |
| `prisma/schema.prisma` | `prisma` |
| `drizzle.config.*` | `drizzle` |
| `tailwind.config.*` | `tailwind` |
| `terraform/` or `*.tf` | `terraform` |

## Context7 Library Detection

After detecting the stack, resolve Context7 library IDs for each stack entry. These are stored in the `context7` field of `.feature-flow.yml` and used by skills to query up-to-date documentation before designing and implementing features.

**Prerequisite:** The Context7 MCP plugin must be installed (`context7@claude-plugins-official`). If not available, skip this entire section — the `context7` field will be omitted from `.feature-flow.yml` and skills will proceed without documentation lookups.

### How It Works (Any Project, Any Stack)

Context7 hosts documentation for thousands of libraries. The `resolve-library-id` tool searches for any technology by name and returns matching libraries ranked by relevance, snippet count, and benchmark score. This means feature-flow can find documentation for **any** tech stack — not just the ones with pre-built reference files.

### Detection Flow

For **every** detected stack entry:

1. Call `mcp__plugin_context7_context7__resolve-library-id` with the stack name as the query
   - Example: `resolve-library-id({ libraryName: "django", query: "Django web framework best practices" })`
2. From the results, select libraries that:
   - Have **High** source reputation
   - Have a **benchmark score ≥ 60**
   - Have **≥ 50 code snippets** (enough to be useful)
3. If multiple good results exist, prefer the one with the highest benchmark score
4. Some stacks span multiple Context7 libraries (e.g., Supabase has separate docs for auth, JS client, SSR, and CLI) — include all relevant ones
5. If no good results are found (low scores, few snippets), omit that stack from `context7`

### Known Mappings (Cache)

These stacks have been pre-verified and can skip the `resolve-library-id` call. Use these directly:

| Stack Entry | Context7 Library IDs | Score | Snippets | Notes |
|------------|---------------------|-------|----------|-------|
| `next-js` | `/vercel/next.js` | 89.5 | 2868 | App Router, server components, server actions |
| `supabase` | `/websites/supabase`, `/supabase/supabase-js`, `/supabase/ssr` | 68-87 | 332-25405 | Auth + queries + SSR client are separate libraries |
| `vercel` | `/vercel/next.js` | 89.5 | 2868 | Vercel deployment docs are within Next.js docs |
| `express` | `/websites/expressjs_en` | 81 | 1366 | Routing, middleware, error handling |
| `django` | `/websites/djangoproject_en_5_2` | 83.4 | 9676 | Models, views, templates, ORM |
| `fastapi` | `/websites/fastapi_tiangolo` | 91.4 | 21400 | Async endpoints, Pydantic, dependency injection |
| `vue` | `/websites/vuejs` | 84.8 | 2020 | Composition API, reactivity, components |
| `angular` | `/websites/angular_dev` | 85.7 | 7096 | Components, services, signals, SSR |
| `rails` | `/websites/guides_rubyonrails_v8_0` | 80 | 6402 | MVC, Active Record, routing, migrations |
| `prisma` | `/websites/prisma_io` | 85.3 | 8274 | Schema, typed queries, migrations |
| `stripe` | `/websites/stripe` | 75.1 | 49110 | Payments, webhooks, subscriptions |
| `tailwind` | `/websites/tailwindcss` | 74.3 | 2018 | Utility classes, configuration, responsive design |

For **all other stack entries** not listed above, resolve dynamically using the flow above. This covers any technology Context7 has documentation for.

### Example: Auto-Detecting a Django + PostgreSQL + Redis Project

```
Detected stack: django, postgresql, redis

Resolving Context7 libraries...
  django → /djangoproject/django (Score: 85, 3200 snippets) ✓
  postgresql → /postgres/postgres (Score: 72, 500 snippets) ✓
  redis → /redis/redis-py (Score: 78, 280 snippets) ✓

context7:
  django: /djangoproject/django
  postgresql: /postgres/postgres
  redis: /redis/redis-py
```

### Example: Auto-Detecting a Next.js + Supabase + Stripe Project

```
Detected stack: next-js, supabase, stripe, tailwind

Using known mappings for: next-js, supabase
Resolving Context7 libraries for: stripe, tailwind
  stripe → /stripe/stripe-node (Score: 88, 450 snippets) ✓
  tailwind → /tailwindlabs/tailwindcss (Score: 80, 600 snippets) ✓

context7:
  next-js: /vercel/next.js
  supabase:
    - /websites/supabase
    - /supabase/supabase-js
    - /supabase/ssr
  stripe: /stripe/stripe-node
  tailwind: /tailwindlabs/tailwindcss
```

## Presentation Format

After detection, present findings to the user:

```
I detected the following project context:

Platform: [detected platform]
Stack:
  - [stack-1] (from [source: package.json / Gemfile / config file])
  - [stack-2] (from [source])
  - [stack-3] (from [source])

Context7 Documentation (for live doc lookups):
  - [stack-1]: [library-id] (or "not found")
  - [stack-2]: [library-id-1], [library-id-2]

Does this look right? I'll save this to `.feature-flow.yml`.
```

**Note:** Only show the Context7 section if the Context7 MCP plugin is available. If not available, omit it silently.

Use `AskUserQuestion` with options: "Looks correct", "Let me adjust".

## Validation (Existing .feature-flow.yml)

When `.feature-flow.yml` already exists, cross-check the declared stack against detected stack:

1. Run detection as normal
2. Compare declared vs detected
3. If new dependencies detected that aren't in the file, suggest additions:

```
Your .feature-flow.yml declares: [supabase, next-js, vercel]
I also detected: [stripe] (from package.json)

Want me to add stripe to your stack list?
```

Only suggest additions — never remove entries the user explicitly declared.

## Edge Cases

- **Monorepos:** If multiple `package.json` files exist, scan the root and immediate `packages/*/package.json` or `apps/*/package.json`. Combine all detected stacks.
- **No dependency file:** If no `package.json`, `requirements.txt`, `Gemfile`, `go.mod`, etc. exists, fall back to file extension analysis (`.py` → Python, `.rb` → Ruby, etc.) and config file indicators.
- **Ambiguous platform:** If both web and mobile indicators exist (e.g., Next.js + React Native in a monorepo), default to `cross-platform` and note the ambiguity.
- **Empty stack detected:** If no stack entries are detected from any source, warn the user: "No frameworks or libraries detected. This may mean the project uses a stack not yet covered by auto-discovery, or the dependency files are in a non-standard location." Offer to let the user manually specify the stack, and proceed with an empty stack list rather than blocking.
