# Issue Templates by Feature Type

## New Feature (Full-Stack)

```markdown
## Summary

[2-3 sentences describing what the feature does and why]

**Example:** [Concrete input → output example]

## Design Doc

See `docs/plans/YYYY-MM-DD-feature-name.md`

## User Flow

1. **[Step name]** — [description of what user does and sees]
2. **[Step name]** — [description]
3. **[Step name]** — [description]

## Pipeline Architecture

[Describe the processing flow, what's new vs reused]

```
[flow diagram using text/ascii]
```

## Data Model Changes

### `table_name` table
- Add `column`: type (default) — purpose
- Make `column` nullable

### `other_table` table
- Add `column`: type (nullable) — purpose

## New Components

- **[Component]** — [purpose] ([dependency info])
- **[Hook]** — [purpose] ([what it manages])
- **[Route]** — new route at `/path`

## UI Adaptations

- [Existing component/page change]
- [Filter/sort changes]
- [Export changes]

## Migration Summary

N DB column changes + type updates. See design doc for full list.

## Key Decisions

- [Decision and rationale]
- [Decision and rationale]

## Implementation Notes

- [Technical constraint or gotcha]
- [Dependency or version requirement]
```

## API Integration Feature

```markdown
## Summary

Integrate [API name] to [purpose]. [Key constraint].

## Design Doc

See `docs/plans/YYYY-MM-DD-feature-name.md`

## API Details

- **Endpoint:** [URL]
- **Auth:** [API key / OAuth / etc.]
- **Rate Limit:** [X requests/minute]
- **Cost:** [per request or per unit]

## Data Flow

1. [Input from user/system]
2. [API call with parameters]
3. [Response processing]
4. [Storage/display]

## Data Model Changes

[If any tables need modification]

## Key Decisions

- [Why this API over alternatives]
- [Rate limit handling approach]
- [Error handling strategy]

## Implementation Notes

- [API quirks or gotchas]
- [Environment variables needed]
```

## UI-Only Feature

```markdown
## Summary

[What the UI change does and why]

## Design Doc

See `docs/plans/YYYY-MM-DD-feature-name.md`

## User Flow

1. [Step with UI description]
2. [Step with UI description]

## Components

- **New:** [components to create]
- **Modified:** [existing components to change]

## Key Decisions

- [UX decision and rationale]
- [Component library choice]

## Implementation Notes

- [Responsive/mobile considerations]
- [Accessibility requirements]
```

## Bug Fix

```markdown
## Bug Description

**Current behavior:** [What happens now]
**Expected behavior:** [What should happen]
**Steps to reproduce:**
1. [Step]
2. [Step]
3. [Step]

## Root Cause

[If known, describe the root cause]

## Proposed Fix

[Brief description of the fix approach]

## Files Affected

- `path/to/file.ts` — [what changes]

## Key Decisions

- [Fix approach and rationale]
```

## Data Migration

```markdown
## Summary

[What data needs to change and why]

## Design Doc

See `docs/plans/YYYY-MM-DD-feature-name.md`

## Migration Details

### Schema Changes
1. [Change with details]
2. [Change with details]

### Data Backfill
- [What existing data needs updating]
- [Default values for new columns]

## Rollback Plan

- [How to reverse if something goes wrong]

## Key Decisions

- [Migration strategy (online vs offline)]
- [Backfill approach]

## Implementation Notes

- [Table size / lock duration concerns]
- [Deploy ordering (migrate before or after code deploy)]
```

## Issue Title Conventions

Keep titles under 70 characters. Format:

| Type | Format | Example |
|------|--------|---------|
| New feature | `[Feature] — [brief description]` | `Creative Domain Generator — LLM-powered domain ideas` |
| Bug fix | `fix: [what's broken]` | `fix: search results not loading after re-check` |
| Enhancement | `[Area]: [improvement]` | `Results page: add bulk export with filters` |
| Data migration | `migration: [what changes]` | `migration: add keyword_phrase index for volume lookups` |
| Refactor | `refactor: [what and why]` | `refactor: extract pipeline phases into separate hooks` |

## Label Recommendations

Apply labels that exist in the repository. Common useful labels:

- `enhancement` or `feature` — new functionality
- `bug` — something broken
- `refactor` — code improvement without behavior change
- `migration` — database changes
- `documentation` — docs only
