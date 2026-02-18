# Auto-Discovery Rules

Detect project platform and tech stack from project files when `.spec-driven.yml` does not exist. These rules are language/framework-agnostic — scan all indicators before making a determination.

## Detection Order

1. **Platform** — Determine web vs mobile first (affects lifecycle)
2. **Stack** — Detect frameworks, databases, hosting, and key libraries
3. **Present** — Show detected context to user for confirmation
4. **Write** — Save confirmed context to `.spec-driven.yml`

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
| `build.gradle.kts` only (no ios/) | `android` |
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

## Presentation Format

After detection, present findings to the user:

```
I detected the following project context:

Platform: [detected platform]
Stack:
  - [stack-1] (from [source: package.json / Gemfile / config file])
  - [stack-2] (from [source])
  - [stack-3] (from [source])

Does this look right? I'll save this to `.spec-driven.yml`.
```

Use `AskUserQuestion` with options: "Looks correct", "Let me adjust".

## Validation (Existing .spec-driven.yml)

When `.spec-driven.yml` already exists, cross-check the declared stack against detected stack:

1. Run detection as normal
2. Compare declared vs detected
3. If new dependencies detected that aren't in the file, suggest additions:

```
Your .spec-driven.yml declares: [supabase, next-js, vercel]
I also detected: [stripe] (from package.json)

Want me to add stripe to your stack list?
```

Only suggest additions — never remove entries the user explicitly declared.

## Edge Cases

- **Monorepos:** If multiple `package.json` files exist, scan the root and immediate `packages/*/package.json` or `apps/*/package.json`. Combine all detected stacks.
- **No dependency file:** If no `package.json`, `requirements.txt`, `Gemfile`, `go.mod`, etc. exists, fall back to file extension analysis (`.py` → Python, `.rb` → Ruby, etc.) and config file indicators.
- **Ambiguous platform:** If both web and mobile indicators exist (e.g., Next.js + React Native in a monorepo), default to `cross-platform` and note the ambiguity.
