# Advisor Integration — Design Pointer

**Authoritative design:** [Issue #236](https://github.com/uta2000/feature-flow/issues/236) — "advisor: tiered stuck mode + soft checkpoints + settings hint"

This is a thin pointer. The issue body contains the full design, including:
- Scope (two additive changes: 4 SKILL.md one-liners + docs/settings hint)
- File list with exact insertion text
- 11 machine-verifiable acceptance criteria with [I]/[B#235] dependency markers
- Key decisions (advisor is discretionary; codex stays scripted; two config keys)
- Out-of-scope / deferred items (tiered stuck machinery, session-report metrics)
- Holstein13 review feedback resolved in the final issue body

**Why a pointer, not a duplicate:** #236 went through a full collaborator review cycle. Duplicating its content into `docs/plans/` creates two sources of truth that will drift. The issue is canonical; this file exists only to satisfy feature-flow's design-doc artifact contract for downstream steps (plan, commit planning artifacts, PR body).

**Relationship to #235 (codex-consultation):**
- #235 merged to main in commit `2c289be` (via PR #240). `skills/consult-codex/SKILL.md` exists on main.
- All 11 ACs of #236 are independent. Single PR delivers the whole feature.

**Verification findings (2026-04-17):** original issue draft specified extending a non-existent `hooks/scripts/session-start/index.js`. Corrected to match existing codebase pattern: create new `hooks/scripts/advisor-hint.js` (following `version-check.js`) and register as a third command in the SessionStart hooks array in `hooks/hooks.json`.
