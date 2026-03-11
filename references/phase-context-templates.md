# Phase-Specific Context File Templates

This file defines the templates for the four phase-specific context files written by the orchestrator during a feature implementation. Each section corresponds to one context file and includes a purpose line and a fenced template block with [BRACKETED] placeholders.

<!-- section: design-decisions -->
## Design Decisions Template

Captures scope decisions, approach choices, and rejected alternatives made during brainstorming and design document phases. Written by the orchestrator after the design document step completes.

```
# Design Decisions

## Key Decisions
- **[Decision]:** [what was decided and why]

## Rejected Alternatives
- **[Option]:** [why it was rejected]

## Open Questions
- [ ] [question still unresolved at design time]
```

<!-- /section: design-decisions -->

<!-- section: verification-results -->
## Verification Results Template

Captures design verification findings — blockers found, design changes required, and items confirmed clean. Written after the design verification step.

```
# Design Verification Results

## Verification Summary
- Score: [N/14 categories passed]
- Blockers found: [N]

## Blockers Found and Resolved
- **[Issue]:** [description] → **Resolution:** [what changed]

## Clean Categories
- [Category]: no issues found
```

<!-- /section: verification-results -->

<!-- section: patterns-found -->
## Patterns Found Template

Captures codebase patterns, anti-patterns, and reference examples discovered during the Study Existing Patterns step. Written after that step completes.

```
# Patterns Found

## [Area: e.g., API Routes]
- File structure: [how existing files are organized]
- Error handling: [pattern used]
- Reference examples: `[file]` ([what it exemplifies])

## Anti-Patterns (do NOT replicate)
- `[file]` — [issue]. [recommendation].

## How to Code This
### Task N: [title]
- Follow pattern from: `[file]`
- Key constraint: [relevant constraint]
```

<!-- /section: patterns-found -->

<!-- section: blockers-and-resolutions -->
## Blockers and Resolutions Template

Running log of blockers surfaced during implementation tasks and how they were resolved. Updated by the orchestrator when a blocker is encountered and again when resolved.

```
# Blockers and Resolutions

## [Task N]: [Blocker Title]
- **Blocker:** [description of what blocked progress]
- **Resolution:** [how it was resolved]
- **Commit:** [SHA or 'pending']
```

<!-- /section: blockers-and-resolutions -->
