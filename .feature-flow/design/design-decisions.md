# Design Decisions

## Key Decisions
- **Auto-discovery via GitHub label:** Labels are queryable, work across machines, visible in UI. PR body marker as fallback.
- **Three invocation modes:** Lifecycle (auto from start), standalone (explicit PR numbers), cross-session (`merge-prs feature-flow`).
- **Behavioral conflicts always pause:** Function body changes, conditionals, API contracts require confirmation even in YOLO.
- **Continue-on-failure:** Skip problematic PRs, continue merging remaining, report at end. No rollback.
- **Inline orchestrator logic:** Post-PR label application via inline code, not hooks.
- **Ship phase scope-gated:** Feature (step 21) and Major feature (step 22) only.

## Rejected Alternatives
- **Branch naming convention:** Too fragile — users rename branches.
- **Local state file:** Doesn't survive across machines.
- **Rollback on mid-batch failure:** Destructive and error-prone.
- **Ship phase for all scopes:** Quick fix and small enhancement are single-PR workflows.

## Open Questions
- None — all 8 design gaps resolved
