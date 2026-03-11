# Feature Context

> Auto-managed by feature-flow. Stale decisions are archived to DECISIONS_ARCHIVE.md (threshold: `knowledge_base.stale_days` in `.feature-flow.yml`, default 14 days).

## Key Decisions

- [2026-03-11] wave_planner.py output includes `has_explicit_deps: bool` — distinguishes "explicit deps declared" from "all independent by default"
- [2026-03-11] Phase A uses `has_explicit_deps: true` flag (not grep) to decide whether to skip heuristic phases B-D
- [2026-03-11] Format detection re-implemented in Python — iterate lines, track code-fence state, match `^<plan version=`
- [2026-03-11] `Parallelizable: no` + no `Depends on:` = conservative wave placement after tasks sharing Files modified
- [2026-03-11] Cycle detection: exit 1, `waves: []`, DFS path tracing for descriptive error message
- [2026-03-11] No changes to dispatcher/pipeline.py — only subagent-driven-development orchestrator updated
- [2026-03-11] Both syntaxes additive; all existing plans work without modification

## Open Questions

<!-- None — all design decisions resolved per issue #167 -->

## Notes

- Plan file: docs/plans/2026-03-09-wave-based-parallel-task-execution-167-plan.md
- Design doc: docs/plans/2026-03-09-wave-based-parallel-task-execution.md
- Issue: #167
- Branch: feat/gh167-wave-parallel-execution
- Baseline: 97 tests pass (3 pre-existing collection errors in test_config.py, test_tui — unrelated)
