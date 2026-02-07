# spec-driven

A Claude Code plugin that adds acceptance criteria discipline to AI-assisted development.

## What It Does

Every planned task gets explicit, machine-verifiable acceptance criteria. A verification agent checks them before work is marked complete.

**Two skills + one agent:**

| Component | Purpose |
|-----------|---------|
| `verify-plan-criteria` | Post-planning: validates every task has acceptance criteria, auto-drafts missing ones |
| `verify-acceptance-criteria` | Post-implementation: mechanically checks each criterion against the codebase |
| `task-verifier` agent | Runs PASS/FAIL/CANNOT_VERIFY checks with evidence |

**Two hooks:**

| Hook | Trigger | Action |
|------|---------|--------|
| PostToolUse (Write) | Plan file written to `plans/*.md` | Reminds AI to run `verify-plan-criteria` |
| SessionStart | Every session | Injects spec-driven conventions |

## Installation

### As a Claude Code plugin

Add this repo as a marketplace source in Claude Code, then install the `spec-driven` plugin.

### Per-project (manual)

Copy the `agents/`, `skills/`, and `hooks/` directories into your project's `.claude/` directory.

## Workflow

```
write plan → verify-plan-criteria (auto-draft missing AC)
  → user approves plan
  → implement tasks
  → verify-acceptance-criteria (mechanical check)
  → VERIFIED / INCOMPLETE / BLOCKED
```

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
