# Design Document Section Templates

## Overview Template

```markdown
## Overview

[Feature name] is a [type: page/API/integration/workflow] that [what it does in one sentence].
[Why it exists or what problem it solves in one sentence]. [Key constraint or scope boundary in one sentence].
```

**Example:**
```markdown
## Overview

The Creative Domain Generator is a dedicated feature where users enter a city/region and an industry,
and an LLM generates ~100 creative, culturally-relevant domain name ideas. The user curates the list,
then selected domains go through the existing availability pipeline. Volume lookup is skipped —
creative domains are branding plays, not SEO plays.
```

## User Flow Template

```markdown
## User Flow

### Step 1 — [Verb phrase]
- [Input or action]
- [UI element description]
- [Constraints or validation]

### Step 2 — [Verb phrase]
- [What the user sees]
- [What they can do]
- [What happens next]

### Step 3 — [Verb phrase]
- [Output or result]
- [How it's displayed]
- [What actions are available]
```

Keep to 3-5 steps. If more are needed, the feature may be too complex for a single design.

## Data Model Changes Template

```markdown
## Data Model Changes

### `table_name` table
- Add `column_name` type (default: `value`) — [purpose]
- Make `column_name` nullable (currently NOT NULL — needs migration)
- Add constraint: [description]

### `other_table` table
- Add `column_name` type (nullable) — [purpose]
```

Rules:
- List every column change, including nullability changes
- Note the current state when it differs from the proposed state
- Include defaults for new columns
- Group by table

## Pipeline / Architecture Template

```markdown
## Pipeline Architecture

[Feature] uses a [new/modified] [pipeline/workflow/hook] because [reason for the approach].

**[Existing/Standard] flow:**
```
Phase 1 → Phase 2 → Phase 3
```

**[New/Modified] flow:**
```
Phase 1 → [New step] → Phase 2 → Phase 3
```

Key differences:
- [What changed and why]
- [What is reused from existing flow]
- [What is new]
```

## Migration Requirements Template

```markdown
## Migration Requirements

1. `table.column` — [add/alter/drop] [details]
2. `table.column` — [add/alter/drop] [details]
3. `TypeName` type — [what changes]
```

Rules:
- Number every item
- Use `table.column` format consistently
- Separate DB migrations from type/code changes
- Note when a migration affects existing data

## New Components Template

```markdown
## New Components

- **[Component name]** — [what it does] ([uses existing library X] or [new implementation])
- **[Hook name]** — [what it manages] ([X phases, reuses Y])
- **[Route]** — new route at `/path` with sidebar nav entry
```

## Patterns & Constraints Template

```markdown
## Patterns & Constraints

### Error Handling
- [Strategy for each external call type — typed Result<T, E>, retry, timeout]
- [User-facing vs system error distinction]

### Types
- [Key types with narrowness specified — literal unions, not string]
- [Generated vs hand-maintained types]

### Performance
- [Debounce, pagination, parallel constraints]
- [N+1 prevention strategy]

### Stack-Specific
- [Patterns from references/stacks/*.md and Context7 docs that apply]
```

Rules:
- Error Handling must cover every external call type in the design (API, database, file system, LLM)
- Types must specify literal unions for known domains (status fields, categories, modes) — never use `string` when the domain is bounded
- Performance is optional when there are no async operations or large datasets
- Stack-Specific references the actual patterns from stack reference files, not generic advice

**Example:**
```markdown
## Patterns & Constraints

### Error Handling
- API calls: typed errors with discriminated union `{ data: T } | { error: SearchError }` (match `src/handlers/users.ts`)
- Database: Supabase returns `{ data, error }` — check error before using data, typed by generated types
- User-facing: friendly messages only. System errors logged with full context.

### Types
- `SearchResult.status`: literal union `'available' | 'taken' | 'error'`, not string
- Database types: generated via `supabase gen types` — never hand-maintained

### Performance
- Search input: 300ms debounce
- Results: paginate at 25 per page using `.range()`
- Independent API calls: `Promise.all()`, not sequential

### Stack-Specific
- Next.js: Search handler is a Server Action (not Route Handler) per App Router conventions
- Supabase: Use `@supabase/ssr` for server-side client, RLS on search results table
```

## Scope Template

```markdown
## Scope

**Included:**
- [Feature boundary 1]
- [Feature boundary 2]

**Excluded:**
- [Explicitly out of scope item 1]
- [Explicitly out of scope item 2]

**Dependencies:**
- [No new API keys / dependencies needed]
- [Requires X to be set up first]
```

## Feature Type Examples

### API Integration Feature
Typical sections: Overview, Example, Data Model Changes, API Integration, Migration Requirements, Patterns & Constraints, Scope

### UI-Only Feature
Typical sections: Overview, User Flow, New Components, UI Adaptations, Patterns & Constraints, Scope

### Data Migration Feature
Typical sections: Overview, Data Model Changes, Migration Requirements, Rollback Plan, Patterns & Constraints, Scope

### Mobile Feature (iOS / Android / Cross-Platform)
Typical sections: Overview, User Flow, Feature Flag Strategy, Rollback Plan, API Versioning, Device Compatibility, Data Model Changes, New Components, Migration Requirements, Patterns & Constraints, Scope

### Full-Stack Feature
Typical sections: All sections as applicable
