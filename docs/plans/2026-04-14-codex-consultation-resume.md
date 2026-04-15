# Codex Consultation — Session Resume Guide

**Last updated:** 2026-04-15 (paused mid-execution of Phase 1+2 plan)

This document captures everything a future Claude Code session needs to resume this feature without re-reading the whole conversation. If you are that future Claude: read this file end-to-end, then follow the "Next action" section.

---

## What this feature is

`feature-flow:consult-codex` — a new Claude Code plugin skill that consults the OpenAI Codex MCP server as a second AI opinion at judgment-heavy lifecycle checkpoints (design review, plan review, code review) and for reactive stuck recovery. Opt-in (`codex.enabled: false` default). Tiered verdict enforcement: PreToolUse Skill block for reactive stuck, soft single-shot reminder + visible `<not recorded>` PR defect for proactive.

**Source of truth — spec:** [`docs/plans/2026-04-14-codex-consultation.md`](2026-04-14-codex-consultation.md)

**Source of truth — implementation plan (Phase 1+2 only):** [`docs/plans/2026-04-14-codex-consultation-plan.md`](2026-04-14-codex-consultation-plan.md)

**GitHub issue:** https://github.com/uta2000/feature-flow/issues/235

If the plan and the spec ever disagree, the spec wins and the plan gets a fix task.

---

## Current execution state

### Where the code lives

- **Main repo (planning + docs):** `/Users/weee/Dev/feature-flow` on branch `main`
- **Implementation worktree:** `/Users/weee/Dev/feature-flow/.worktrees/codex-consultation` on branch `feat/codex-consultation`
- **Both branches are pushed to origin** as of the last session:
  - `origin/main` at commit `0936a28` (spec + plan v3 with Claude-orchestrated three-phase architecture)
  - `origin/feat/codex-consultation` at commit `925406e` (T1: state.js implementation + tests)

If the local worktree is gone (e.g., after a machine restart or `git worktree remove`), recreate it:
```bash
cd /Users/weee/Dev/feature-flow
git fetch origin
git worktree add .worktrees/codex-consultation feat/codex-consultation
```

### What's done

| Phase | Item | Status |
|---|---|---|
| Brainstorming | Design conversation | ✅ Complete |
| Brainstorming | Spec written (`2026-04-14-codex-consultation.md`) | ✅ Committed `1f42daa`, revised `943e8c2`, `0936a28` |
| Planning | Implementation plan (`2026-04-14-codex-consultation-plan.md`) | ✅ Committed `9808205`, revised `0936a28` |
| Review | GitHub issue #235 created | ✅ [Link](https://github.com/uta2000/feature-flow/issues/235) |
| Review | Review from `holstein13` (6 items) addressed | ✅ See issue comment chain |
| Spike | Verdict-compliance spike (medium-risk for soft tier) | ✅ Led to tiered enforcement redesign |
| Architecture fix | MCP-from-subprocess gap (third correction) | ✅ Committed `0936a28` |
| Execution | T1 (state.js + tests) implemented in worktree | ✅ Commit `925406e` on `feat/codex-consultation` |
| Execution | T1 spec-compliance review | ⏸ **PAUSED HERE** |

### What's next (the exact next action)

Resume `superpowers:subagent-driven-development` by **dispatching the T1 spec-compliance reviewer subagent**. T1 was implemented but never reviewed. The per-task workflow is:

1. ✅ Implementer subagent (done for T1)
2. ⏸ **→ Spec-compliance reviewer subagent (do this next)**
3. Code-quality reviewer subagent (after spec-compliance passes)
4. Mark T1 complete, move on to T2

After T1 review passes, the task order is: T2 (config.js) → T3 (resolve-model.js) → T5 (build-brief.js, since Task 4 is REMOVED) → T6 (record-exchange.js) → T7 (consult.js with three subcommands) → T8 (SKILL.md + references) → T9 (verdict-gate.js + hooks.json) → T10 (review-design mode) → T11 (integration into design-document skill) → T12 (end-to-end smoke test) → T13 (config template + CHANGELOG + version bump).

Each task is implemented in the worktree on `feat/codex-consultation`, committed there, and goes through the two-stage review gate before the next task starts.

---

## Load-bearing architectural constraints

These are things the original design got wrong and had to be fixed. Do not re-break them.

### 1. Claude-orchestrated three-phase flow (not script-orchestrated)

**MCP tools (`mcp__codex__codex`) are only callable from Claude's own context, not from subprocess scripts.** The skill is therefore a four-phase orchestration that Claude drives by reading the SKILL.md instructions:

- **Phase 1** — `consult.js start --mode X` (subprocess): budget check, escape-hatch check, model resolution, brief assembly. Outputs JSON to stdout. **Does not touch state.**
- **Phase 2** — Claude invokes `mcp__codex__codex` directly (in Claude's own context, not a subprocess). Uses the brief/model/timeout from Phase 1. Handles errors per the SKILL.md error-classification table.
- **Phase 3** — `consult.js record-response --mode X` (subprocess, stdin-driven): Claude pipes `{ threadId, content }` or `{ error: { reason, detail } }` to stdin. Appends consultation to state, writes log section, increments budget.
- **Phase 4** — `consult.js verdict --id cN --decision X --reason Y` (subprocess): updates verdict, rewrites log. Invoked as a separate Skill call.

**There is NO `call-codex.js` wrapper module.** Task 4 is REMOVED. Do not re-introduce it. Its original responsibilities (timeout, error classification) split between:
- **Claude's own MCP call handling** (per the error-classification table in SKILL.md)
- **`consult.js record-response`** (reads the error reason from stdin and records a skipped consultation)

### 2. Budget increments in Phase 3, not Phase 1

If Claude's MCP call fails after Phase 1 built a brief, we haven't actually spent a consultation — only a failed attempt. Charging budget only for completed round-trips is the invariant. Do not move budget increments to Phase 1.

### 3. Tiered verdict enforcement

- **Strict tier** (reactive `stuck` mode): PreToolUse Skill block on non-verdict calls until verdict is recorded. Implemented by `hooks/scripts/verdict-gate.js` (Task 9). Only triggers when `consultations[*].strict === true`.
- **Soft tier** (proactive modes): single-shot reminder in Phase 3's return message. No block. Missing verdict surfaces as `<not recorded>` in PR metadata.
- Stuck mode is deferred to a follow-up plan. The verdict-gate hook is still built in this plan (Task 9) to support it, but Phase 1+2 scope doesn't exercise it.

### 4. Opt-in default

`codex.enabled: false` is the default for both new and existing installs. Do not flip it back to opt-out. This was the `holstein13` review item #2 that we accepted.

### 5. Model fallback chain

`config.codex.model` → MCP introspection (injected, not direct) → skip with warning. Do not hardcode `gpt-5.2` anywhere in code. The template value `gpt-5.2` lives in `.feature-flow.yml` so existing installs can update it as model names change without a code push.

### 6. Deterministic signal keys (for reactive mode, Phase 5 scope)

Per the holstein13 review item #5, signal keys use explicit formulas with normalization rules. These aren't built in Phase 1+2 but the spec documents them for when the follow-up plan builds stuck mode. Do not re-introduce hashed keys or vague "normalized test name" language.

---

## Execution workflow reminder

This feature is being executed via `superpowers:subagent-driven-development`:
1. Read the plan, extract all tasks with full text (already done — it's in the plan file)
2. For each task: dispatch implementer subagent → spec-compliance reviewer → code-quality reviewer → mark complete
3. Do NOT start the next task until both reviewers pass
4. Do NOT skip reviews even if the implementer self-reports DONE
5. All commits land on `feat/codex-consultation` in the worktree, not on `main`

**Implementer subagent template:** `/Users/weee/.claude/plugins/cache/superpowers-marketplace/superpowers/5.0.7/skills/subagent-driven-development/implementer-prompt.md`

**Spec reviewer template:** `/Users/weee/.claude/plugins/cache/superpowers-marketplace/superpowers/5.0.7/skills/subagent-driven-development/spec-reviewer-prompt.md`

**Code quality reviewer template:** `/Users/weee/.claude/plugins/cache/superpowers-marketplace/superpowers/5.0.7/skills/subagent-driven-development/code-quality-reviewer-prompt.md`

Each subagent receives the FULL task text from the plan plus scene-setting context — never ask the subagent to read the plan file itself.

---

## Related sessions / prior context

All substantive context is in:
- **Spec** `docs/plans/2026-04-14-codex-consultation.md` — architecture, error handling, testing strategy
- **Plan** `docs/plans/2026-04-14-codex-consultation-plan.md` — 13 tasks (T4 REMOVED) with full bite-sized TDD steps
- **Issue #235** — review feedback, spike findings, architectural corrections
- This resume doc — current execution state + load-bearing constraints

If you need even more context (why a decision was made), the issue comments are ordered chronologically and explain every revision.

---

## Resume prompt for a future Claude Code session

Paste this into a fresh Claude Code session opened at `/Users/weee/Dev/feature-flow`:

> I'm resuming work on the `feature-flow:consult-codex` feature. The session was paused mid-execution of the Phase 1+2 implementation plan. Read `docs/plans/2026-04-14-codex-consultation-resume.md` end-to-end, then:
>
> 1. Confirm the worktree at `.worktrees/codex-consultation` still exists and is on branch `feat/codex-consultation` at commit `925406e`. If the worktree is gone, recreate it with `git worktree add .worktrees/codex-consultation feat/codex-consultation` after `git fetch origin`.
> 2. Resume `superpowers:subagent-driven-development` by dispatching the **T1 spec-compliance reviewer subagent**. T1 (state.js) was implemented at `925406e` but never reviewed. Use the template at `/Users/weee/.claude/plugins/cache/superpowers-marketplace/superpowers/5.0.7/skills/subagent-driven-development/spec-reviewer-prompt.md`. The reviewer needs the full Task 1 text from the plan plus T1's implementer report (from the prior session: DONE, 9/9 tests passing, no concerns).
> 3. After T1 spec-compliance passes, dispatch the T1 code-quality reviewer using the same template directory.
> 4. After both reviewers pass, mark T1 complete and dispatch the T2 (config.js) implementer.
> 5. Do NOT re-introduce `call-codex.js` or any other artifact from the pre-revision design. The current architecture is Claude-orchestrated three-phase — read the "Load-bearing architectural constraints" section of the resume doc first.
>
> The spec is at `docs/plans/2026-04-14-codex-consultation.md`. The plan is at `docs/plans/2026-04-14-codex-consultation-plan.md`. The GitHub issue is #235.
