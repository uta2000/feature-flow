# Feature Context

> Auto-managed by feature-flow. Stale decisions are archived to DECISIONS_ARCHIVE.md (threshold: `knowledge_base.stale_days` in `.feature-flow.yml`, default 14 days).

## Key Decisions

- [2026-04-04] Phase 1 only — standalone skill, no lifecycle integration
- [2026-04-04] Agent architecture: 3 Explore/haiku extraction + up to 5 general-purpose/haiku verification
- [2026-04-04] 8 assumption categories: external-api, discovery, cross-service, library, codebase, environment, data, prior-session
- [2026-04-04] Cross-service critical rule: always fetch BOTH discovery docs
- [2026-04-04] Prior-session handling: treat diagnoses as assumptions, re-run evidence
- [2026-04-04] Gotcha format: plain string list matching existing .feature-flow.yml format
- [2026-04-04] Dedup: category + source reference, higher risk wins
- [2026-04-04] Frontmatter tools list uses Task (not Agent) per tool-api.md

## Open Questions

## Notes

- Issue: #210
- Design doc: docs/plans/2026-04-04-surface-assumptions.md
- Plan: docs/plans/2026-04-04-surface-assumptions-plan.md
- Spec: feature-flow-assumption-verification.md
