# spec-driven

A Claude Code plugin that enforces discipline across the feature development lifecycle — from design through implementation to verification.

## The Problem

Features get brainstormed, then jump straight to code. Halfway through, you discover schema constraints that don't match, types that need changing, pipeline assumptions that break. A 2-hour feature becomes a 6-hour debugging session.

## The Solution

Seven skills and an orchestrator that cover the full feature development lifecycle. Catch conflicts when they're cheap to fix — a line edit in a design doc instead of a code rewrite.

## Skills

### Lifecycle Orchestrator

| Skill | Purpose |
|-------|---------|
| `start-feature` | Orchestrates the full lifecycle from idea to PR — classifies scope, builds the step list, and invokes the right skill at each stage |

### Pre-Implementation (Design Phase)

| Skill | Step | Purpose |
|-------|------|---------|
| `spike` | 3 | De-risk technical unknowns with time-boxed experiments before committing to a design |
| `design-document` | 4 | Turn brainstorming decisions into structured, implementable design docs |
| `design-verification` | 5 | Verify a design against the actual codebase — schema, types, pipelines, routes, dependencies |
| `create-issue` | 6 | Create well-structured GitHub issues from verified designs |

### Post-Implementation (Verification Phase)

| Skill | Step | Purpose |
|-------|------|---------|
| `verify-plan-criteria` | 8 | Validate every task has machine-verifiable acceptance criteria, auto-draft missing ones |
| `verify-acceptance-criteria` | 12 | Mechanically check each criterion against the codebase before claiming work is done |

### Agent

| Component | Purpose |
|-----------|---------|
| `task-verifier` | Runs PASS/FAIL/CANNOT_VERIFY checks with evidence |

## Where These Fit in the Lifecycle

```
 1. Idea
 2. Brainstorming
 3. Spike / PoC                  ← spike
 4. Design Document              ← design-document
 5. Design Verification          ← design-verification
 6. GitHub Issue                  ← create-issue
 7. Implementation Plan
 8. Plan Criteria Check           ← verify-plan-criteria
 9. Worktree Setup
10. Implementation (TDD)
11. Code Review
12. Acceptance Verification       ← verify-acceptance-criteria
13. Verification Before Completion
14. PR / Merge
15. Deploy
```

## Hooks

| Hook | Trigger | Action |
|------|---------|--------|
| SessionStart | Every session | Injects spec-driven conventions into context |
| PostToolUse (Write) | Plan file written to `plans/*.md` | Reminds to run `verify-plan-criteria` |
| Stop | Session ending | Blocks if code was implemented without running `verify-acceptance-criteria` |

## Installation

### As a Claude Code plugin

Add this repo as a marketplace source in Claude Code, then install the `spec-driven` plugin.

### Per-project (manual)

Copy the `agents/`, `skills/`, and `hooks/` directories into your project's `.claude/` directory.

## Example: Design Verification in Action

A design for a "Creative Domain Generator" was verified against the codebase before any code was written. The verification caught 5 issues:

| Finding | What would have happened |
|---------|------------------------|
| `keyword_phrase` is NOT NULL | Runtime crash when inserting creative results without a keyword |
| `service_id` / `location_id` are required FKs | Insert fails for freeform creative searches |
| `format` CHECK constraint | DB rejects rows without `location_service` or `service_location` |
| Pipeline hook assumes mechanical generation | Hook crashes when called without service/location IDs |
| Results page assumes non-null relations | UI crash rendering creative search results |

Each would have been 30-60 minutes of debugging mid-implementation. Total time saved: 3-4 hours.

## Acceptance Criteria Format

```markdown
### Task N: [Title]

**Acceptance Criteria:**
- [ ] File exists at `src/components/Badge.tsx`
- [ ] Component exports `Badge` as named export
- [ ] `npm run typecheck` passes with no new errors
- [ ] `npm run lint` passes with no new warnings
- [ ] [MANUAL] Badge renders red when condition is met

**Files:**
...
```

Criteria prefixed with `[MANUAL]` are flagged for human review rather than failing verification.

## Verification Report

```
| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | File exists at src/... | PASS | Found at expected path, 38 lines |
| 2 | typecheck passes | PASS | 0 errors |
| 3 | Badge renders red | CANNOT_VERIFY | Requires visual/runtime test |

Verdict: VERIFIED (2/3 pass, 1 requires manual verification)
```

## License

MIT
