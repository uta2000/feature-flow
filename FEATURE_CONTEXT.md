# Feature Context

> Auto-managed by feature-flow. Stale decisions are archived to DECISIONS_ARCHIVE.md (threshold: `knowledge_base.stale_days` in `.feature-flow.yml`, default 14 days).

## Key Decisions

- [2026-04-07] Per-task gate, not per-criterion — running after every criterion commit adds too much overhead
- [2026-04-07] Reuse existing linter/test detection from quality-gate.js — no new config fields for commands
- [2026-04-07] Scoped lint, full typecheck — lint can be scoped to changed files, tsc needs full project
- [2026-04-07] Tests opt-out via skip_tests for slow suites, on by default
- [2026-04-07] Agent fixes inline on failure — context is fresh, fix is cheap
- [2026-04-07] No new top-level step — gate is a sub-step within Implement (TDD)

## Open Questions

<!-- No open questions — issue #216 design is complete -->

## Notes

- Issue #216 has the full design spec
- Plan: docs/plans/2026-04-07-incremental-quality-gates-plan.md
- All changes are markdown/YAML documentation — no compiled code
