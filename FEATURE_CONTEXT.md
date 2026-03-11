# Feature Context

> Auto-managed by feature-flow. Stale decisions are archived to DECISIONS_ARCHIVE.md (threshold: `knowledge_base.stale_days` in `.feature-flow.yml`, default 14 days).

## Key Decisions

- [2026-03-11] Architecture: documentation-only — no runtime code, no TypeScript, no tests; all four tasks modify Markdown skill files
- [2026-03-11] Context files are git-tracked intentionally (appear in PR diff) — no .gitignore changes
- [2026-03-11] Task execution: Wave 1 (Tasks 1, 3, 4 in parallel), Wave 2 (Task 2 sequential after Task 1)
- [2026-03-11] Blocker Logging section goes in inline-steps.md (not yolo-overrides.md)
- [2026-03-11] Archival and PR injection are YOLO-only (in yolo-overrides.md)
- [2026-03-11] Template file path: references/phase-context-templates.md

## Open Questions

<!-- None — all design decisions resolved per Developer Guidance in issue #171 -->

## Notes

- Plan file: docs/plans/2026-03-09-phase-specific-context-files.md
- Issue: #171
- Branch: feat/gh171-phase-context-files
