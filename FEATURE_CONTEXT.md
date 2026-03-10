# Feature Context

> Auto-managed by feature-flow. Stale decisions are archived to DECISIONS_ARCHIVE.md (threshold: `knowledge_base.stale_days` in `.feature-flow.yml`, default 14 days).

## Key Decisions

- [2026-03-10] XML-hybrid format: `.md` files with `<plan version="1.0">` root; XML wraps machine-parsed fields, prose stays as markdown inside `<task>` blocks
- [2026-03-10] Detection pattern: `/^<plan version="/` (not bare `<plan>`), check only non-fenced lines in first 50 lines
- [2026-03-10] Truncation guard: require `</plan>` present in full file before committing to XML mode
- [2026-03-10] Malformed XML falls back to prose parser (triggers: missing `</plan>`, unclosed `<task>`, unclosed `<criteria>`)
- [2026-03-10] Progress Index suppressed for XML plans — `status=` attribute on `<task>` replaces it
- [2026-03-10] `[MANUAL]` prefix (prose) and `type="manual"` attribute (XML) are equivalent in both skills
- [2026-03-10] All 5 tasks are Parallelizable: yes (no shared file dependencies)
- [2026-03-10] Tasks 3 and 5 are design-first (files >150 lines: verify-plan-criteria/SKILL.md 198 lines, yolo-overrides.md 311 lines)
- [2026-03-10] v1 scope: no split plan support, no export CLI, no GSD mapping

## Open Questions

<!-- None — all design decisions resolved per design doc -->

## Notes

- Plan file: docs/plans/2026-03-10-xml-plan-format-166-plan.md
- Design doc: docs/plans/2026-03-10-xml-structured-plan-format.md
- Issue: #166
- Branch: feat/xml-plan-format-166
