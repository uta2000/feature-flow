# Feature Context

> Auto-managed by feature-flow. Stale decisions are archived to DECISIONS_ARCHIVE.md (threshold: `knowledge_base.stale_days` in `.feature-flow.yml`, default 14 days).

## Key Decisions

- [2026-04-06] GitHub label `feature-flow` as primary auto-discovery mechanism for Ship phase
- [2026-04-06] Behavioral conflicts always pause for human confirmation, even in YOLO mode
- [2026-04-06] Continue-on-failure error recovery — skip problematic PRs, report at end, no rollback
- [2026-04-06] Ship phase only for Feature and Major feature scopes (step 21/22)
- [2026-04-06] Inline orchestrator logic for label application (no hook mechanism exists)
- [2026-04-06] `pr` added to Lifecycle Context Object for PR number propagation
- [2026-04-06] Label creation idempotent via `gh label create --force`

## Open Questions

## Notes

- Design doc: `docs/plans/2026-04-06-merge-prs-integration.md`
- Implementation plan: `docs/plans/2026-04-06-merge-prs-integration-plan.md`
- Issue: #214
