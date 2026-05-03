---
date: 2026-05-02
scope: feature
issue: 251
---

### Changed
- `feature-flow:design-document` is now invoked via Pattern B subagent dispatch (orchestrator-side parallel Explore fanout with `model: "haiku"` + consolidator subagent with `model: "sonnet"`) per #251. The orchestrator never sees the consolidator's intermediate design-writing work — only a structured return contract validated against `hooks/scripts/validate-return-contract.js`. Replaces the pre-#251 YOLO `Task()` wrapper at `skills/start/SKILL.md:~688` (latently broken: subagents cannot dispatch sub-subagents per #251 Q1 spike, so the inner Explore fanout silently failed).

### Added
- New "Design Document — Pattern B Dispatch" section in `skills/start/SKILL.md` documents the full hoist + consolidator dispatch shape, post-dispatch validation sequence, and 4-case inline-fallback table (rollout-only with explicit sunset).
- New `findings_path`, `write_contract_to`, and `phase_id` optional args in `skills/design-document/SKILL.md` enable consolidator-mode invocation. New Step 8 contract-write helper mirrors `skills/verify-plan-criteria/SKILL.md` Step 7.
- `design-document` schema entry added to `hooks/scripts/validate-return-contract.js` (9 required fields per #251 locked contract). 7 new unit tests (15 total pass), new fixture `hooks/scripts/fixtures/valid-design-document.json`, and Pattern B round-trip in `hooks/scripts/validate-return-contract.e2e.sh`.

### Documentation
- CRITICAL routing block in `skills/start/SKILL.md:683` updated: design-document moved from "Future conversions" to "Currently converted" alongside verify-plan-criteria. merge-prs documented as "Skipped by design analysis" (no orchestrator-side benefit; see #251 comment).
- Skill Mapping table row for "Design document" updated to reference the Pattern B wrapper.
- Design phase boundary write note updated to clarify return_contract preservation when Pattern B writes the contract before the boundary write.
