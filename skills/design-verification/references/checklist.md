# Design Verification Checklist

## 1. Schema Compatibility

For every proposed column change in the design, verify against the actual database schema:

- [ ] **Nullability:** Columns the design assumes are nullable — check if they are actually NOT NULL
- [ ] **CHECK constraints:** Columns the design adds new values to — check if CHECK constraints restrict allowed values
- [ ] **Foreign keys:** Columns the design makes nullable — check if FK constraints require NOT NULL
- [ ] **Column types:** Proposed types match existing conventions (e.g., `text` vs `varchar`, `uuid` vs `serial`)
- [ ] **Default values:** New columns have appropriate defaults for existing data
- [ ] **Unique constraints:** New columns don't violate existing unique constraints
- [ ] **Index implications:** New query patterns have supporting indexes (or note that indexes are needed)

**Where to look:**
- Migration files (`supabase/migrations/`, `prisma/schema.prisma`, `drizzle/`, `migrations/`)
- ORM model definitions
- Database type definitions in application code

**Common findings:**
- Column assumed nullable but has NOT NULL constraint
- CHECK constraint restricts values to a set that doesn't include the new value
- FK requires a value that won't exist for the new feature's data

## 2. Type Compatibility

For every proposed schema change, verify the application-level type definitions match:

- [ ] **Type definitions match schema:** If column becomes nullable, type must change from `string` to `string | null`
- [ ] **All consumers updated:** Every file that uses the type handles the new nullability or value
- [ ] **Input types:** Creation/update input types accept the new optional fields
- [ ] **Enum types:** Type unions include the new values
- [ ] **Strict mode:** TypeScript strict mode (or equivalent) won't flag new patterns as errors

**Where to look:**
- Type definition files (`types/`, `interfaces/`, `models/`)
- Grep for the type name across the codebase
- `tsconfig.json` for strict mode settings

**Common findings:**
- Type says `string` but schema change makes it nullable — every access site needs null check
- Input type requires a field that the new feature won't provide
- Enum type doesn't include the new value

## 3. Pipeline / Flow Compatibility

For features that interact with existing workflows, hooks, or processing pipelines:

- [ ] **Data shape assumptions:** Existing pipeline stages expect specific fields — verify new data provides them
- [ ] **Phase ordering:** New feature's processing order is compatible with existing pipeline
- [ ] **Entry points:** Pipeline entry functions/routes accept the new feature's input shape
- [ ] **Progress tracking:** Existing progress counters and status fields work with the new flow
- [ ] **Error handling:** Existing error handlers cover the new feature's failure modes
- [ ] **Resume/retry:** Existing resume/retry logic works with the new feature's data

**Where to look:**
- Pipeline hooks (`hooks/`, `src/hooks/`)
- API routes that the pipeline calls
- State machine or status field updates

**Common findings:**
- Pipeline Phase 1 assumes mechanical generation, but creative feature skips it
- Progress counter assumes all results have field X, but new results have it null
- Error handler catches specific error types that don't cover new failure modes

## 4. UI Component Inventory

For features that require UI changes:

- [ ] **Required components exist:** Each component the design references exists in the codebase or is explicitly marked as "new"
- [ ] **Library support:** UI libraries (cmdk, radix, etc.) support the proposed usage pattern
- [ ] **Installed version:** The installed version of each library supports the needed features
- [ ] **Reused components handle new data:** Existing components that will display new data handle null/undefined for new optional fields

**Where to look:**
- `package.json` for installed versions
- Component directories (`src/components/`)
- UI library documentation for the installed version

**Common findings:**
- Design references a "combobox" but no combobox component exists
- Library is installed but at a version that doesn't support the needed feature
- Existing result card component assumes non-null fields that will be null for new data

## 5. Cross-Feature Impact

For changes to shared tables, types, or components:

- [ ] **Shared table changes:** Making a column nullable or adding a column doesn't break existing queries
- [ ] **Shared component changes:** Modifying a component doesn't break other pages that use it
- [ ] **Shared type changes:** Changing a type doesn't break other features that depend on it
- [ ] **Filter/sort logic:** Existing filter and sort functions handle new values (null, new enum values)
- [ ] **Export/import:** CSV export, data import, or API responses include/handle new fields

**Where to look:**
- Grep for the table/column/type/component name across the entire codebase
- Check every file that imports the modified type or component

**Common findings:**
- Making `service_id` nullable breaks 12 components that assume it's always present
- Adding a new availability status breaks a switch statement that doesn't have a default case
- CSV export doesn't include new columns

## 6. Completeness

- [ ] **Error states:** Every external call (API, DB, LLM) has a defined failure UX
- [ ] **Loading states:** Every async operation has a loading indicator
- [ ] **Empty states:** Every list/table has an empty state when there are no results
- [ ] **Edge cases:** Zero results, maximum results, duplicate inputs, special characters
- [ ] **Regeneration/retry:** User can retry failed operations
- [ ] **Auth/permissions:** Feature is accessible only to authenticated users with appropriate permissions

**Common findings:**
- No loading state during LLM generation (takes several seconds)
- No empty state when no results match filters
- No error handling when external API times out

## 7. Cost & Performance

- [ ] **API cost per use:** Calculate the cost of external API calls for a typical use of the feature
- [ ] **Rate limits:** Feature's API call volume fits within rate limits
- [ ] **Payload size:** Request and response sizes are within limits (API, database, network)
- [ ] **N+1 queries:** No database query patterns that scale linearly with data size
- [ ] **Timeout risk:** Long-running operations have appropriate timeout handling

**Common findings:**
- Calling an LLM for 100 structured items costs more than expected
- Bulk API endpoint has a different (lower) rate limit than single-item endpoint
- Large response payload causes browser timeout

## 8. Migration Safety

- [ ] **Existing data:** Migrations work correctly on a table that already has data
- [ ] **Defaults:** New NOT NULL columns have defaults, or migration fills them
- [ ] **Column drops:** Dropping columns doesn't break running application code during deploy window
- [ ] **Migration order:** Migrations that depend on each other are ordered correctly
- [ ] **Rollback:** Each migration can be reversed without data loss (or the risk is acknowledged)

**Common findings:**
- Adding NOT NULL column without default fails on table with existing rows
- Dropping a column while old code is still running causes errors during deployment window

## 9. Internal Consistency

- [ ] **Section agreement:** All sections of the design doc agree (migration count matches the actual list, pipeline phases are consistent)
- [ ] **Terminology:** Same names used everywhere (not "source" in one place and "type" in another)
- [ ] **Counts:** Stated counts (migrations, phases, components) match the actual listed items
- [ ] **User flow matches technical design:** Every step in the user flow has corresponding technical support

**Common findings:**
- Design says "8 migrations" but lists 10
- Pipeline diagram shows 4 phases but description mentions 5
- Data model section uses "creative_city" but UI section says "city/region input"

## 10. Pattern Adherence

- [ ] **File structure:** New files follow existing directory conventions
- [ ] **Naming conventions:** New functions, components, routes follow existing naming patterns
- [ ] **Server vs client:** Server actions vs API routes used appropriately per existing patterns
- [ ] **Error handling pattern:** Follows existing error handling conventions
- [ ] **No unnecessary novelty:** Does not introduce new patterns when existing ones work

**Where to look:**
- Compare proposed file paths with existing structure
- Check existing components for naming and organization patterns

**Common findings:**
- Design puts a file in a location inconsistent with existing conventions
- Design uses a different error handling pattern than the rest of the codebase

## 11. Dependency & API Contract Verification

- [ ] **Library version supports usage:** The installed version of each library supports the features the design assumes
- [ ] **External API contract:** External APIs return data in the format the design assumes
- [ ] **Reused API route response shapes:** Internal API routes return data in the shape the new code expects
- [ ] **Error response shapes:** Reused API routes can return error types the new code handles

**Where to look:**
- `package.json` or `package-lock.json` for installed versions
- Library changelogs for feature availability
- External API documentation
- Existing API route response types

**Common findings:**
- Library feature was added in v2.0 but v1.x is installed
- External API response has a different field name than documentation suggests
- Reused API route returns errors in a format the new hook doesn't handle

## 12. Build Compatibility

- [ ] **TypeScript strict mode:** Proposed changes don't introduce strict mode violations
- [ ] **Lint rules:** New code patterns don't violate existing ESLint/Prettier rules
- [ ] **Framework config:** Next.js config, Webpack config, or similar doesn't block the proposed approach
- [ ] **Environment variables:** Any new env vars are documented and available in all environments

**Where to look:**
- `tsconfig.json` for strict mode settings
- `.eslintrc` or `eslint.config` for rules
- `next.config.js` or equivalent
- `.env.example` for env var documentation

## 13. Route & Layout Chain

For features adding new pages:

- [ ] **Auth protection:** New page is under the authenticated layout group
- [ ] **Layout inheritance:** New page inherits sidebar, header, theme provider, toast provider
- [ ] **URL conflicts:** New route doesn't collide with existing routes, redirects, or middleware
- [ ] **Navigation:** Sidebar or nav is updated to include the new page
- [ ] **Mobile responsive:** Page layout works on mobile viewports

**Where to look:**
- App router directory structure (`app/`)
- Layout files (`layout.tsx`)
- Middleware files
- Sidebar/navigation components

## 14. Structural Anti-Patterns

For every new file, component, module, or class proposed in the design:

- [ ] **God objects/files:** No single file or component takes on more than 2-3 responsibilities. If the design concentrates logic in one place, flag it.
- [ ] **Tight coupling:** New modules don't depend on implementation details of other modules. Check for designs that wire directly to database columns, internal state, or private methods of other components.
- [ ] **Circular dependencies:** The proposed import/dependency graph has no cycles. If module A will import from B and B will import from A (directly or transitively), flag it.
- [ ] **Dependency direction:** Dependencies flow from high-level (UI, orchestration) to low-level (utilities, data access), not the reverse. Shared types/interfaces live in a common layer, not in a consumer.
- [ ] **Responsibility distribution:** Logic is distributed across appropriate layers (data access, business logic, presentation) rather than concentrated in a single file or function.

**Severity mapping:**
- God objects with 4+ responsibilities → **FAIL** (must restructure before implementation)
- Circular dependencies → **FAIL** (must redesign module boundaries)
- Tight coupling to implementation details → **WARNING** (recommend abstraction, not blocking)
- Minor responsibility distribution concerns → **WARNING**

**Where to look:**
- The design's "New Components" and "Pipeline / Architecture" sections
- Proposed file paths and their import relationships
- Any single file the design touches for more than 2 distinct concerns

**Common findings:**
- Design creates a single "manager" or "handler" file that fetches, transforms, validates, caches, and renders — a god object
- New utility imports from a UI component instead of a shared layer — inverted dependency
- Feature A imports a helper from Feature B, and Feature B imports a type from Feature A — circular dependency
- All business logic lives in an API route handler instead of an extracted service layer — mixed responsibilities
