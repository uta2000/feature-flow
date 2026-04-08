---
date: 2026-04-08
pr: TBD
scope: feature-flow
issue: 226
---

### Added

- `merge-prs`: single-pass PR review triage that fetches inline review comments, discussion comments, and formal reviews; classifies each unresolved thread into one of 6 categories (blocker/suggestion/nit/question/praise/unclear); attempts best-effort remediation; and replies with fix commit attribution. Replaces the previous binary `CHANGES_REQUESTED` skip in `SKILL.md` Step 4a (#226).
- `merge-prs`: new `references/review-triage.md` specialization file mirroring `ci-remediation.md` structure. Documents the GraphQL `reviewThreads` fetch, four-stage thread filter (outdated, resolved, self-reply, addressed-by-later-approval), priority-ordered classification heuristics, per-category fix strategies, commit grouping by `(reviewer, file)`, reply templates, and mode-aware escalation.
- `.feature-flow.yml`: new optional `merge.wait_for_rereview` config field (default `false`) for opting into reviewer re-approval polling after auto-fixes.

### Changed

- `merge-prs`: review triage runs **before** CI remediation in Step 4a so that any fix commits trigger a fresh CI run that `ci-remediation.md` can then handle.
- `skills/merge-prs/references/best-effort-remediation.md`: marked review triage as a current consumer of the shared bounded-attempt pattern (previously listed as "future").
