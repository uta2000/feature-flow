# Design Decisions

## Key Decisions
- **Per-task gate timing:** Gate runs once per task after all criterion commits, not after every individual criterion.
- **Reuse existing detection:** Same linter/test-runner detection as quality-gate.js Stop hook.
- **Scoped lint, full typecheck:** Lint scoped to changed files. TypeScript runs full project.
- **Tests default on, opt-out available:** skip_tests config for 60s+ suites.
- **Inline fix on failure:** Agent fixes errors immediately while task context is active.
- **No new top-level step:** Gate documented as sub-step within Implement.

## Rejected Alternatives
- **Per-criterion gate:** Too much overhead
- **New top-level step:** Would inflate all scope step counts
- **Changes to quality-gate.js:** Agent runs same commands inline
- **New lint command config fields:** Existing detection is sufficient

## Open Questions
- None — design complete per issue #216
