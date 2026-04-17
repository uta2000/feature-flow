---
name: consult-codex
description: Consult the codex MCP server as a second AI opinion via a three-phase Claude-orchestrated flow. Use for proactive reviews (design, plan, code) or reactive stuck recovery. Requires codex.enabled=true in .feature-flow.yml and a configured codex MCP server.
---

# Consult Codex

Claude-orchestrated three-phase skill: **subprocess Phase 1 → direct MCP call Phase 2 → subprocess Phase 3 → subprocess Phase 4 verdict**. MCP tools like `mcp__codex__codex` are only callable from Claude's own context, so the skill is NOT a single script that runs end-to-end — it is an orchestration guide Claude follows.

## When to invoke

**Proactive (automatic, from other lifecycle skills):**
- `mode: review-design` — after writing a design doc, before verification (integrated into `feature-flow:design-document`)
- `mode: review-plan` — after `verify-plan-criteria` mechanical check passes *(deferred — follow-up plan)*
- `mode: review-code` — before Harden-PR step, after all tests pass *(deferred)*

**Reactive (manual or auto-suggested):**
- `mode: stuck` — user typed `stuck:` or a signal-collector hook emitted a stuck suggestion *(deferred — follow-up plan)*

## Orchestration — follow these phases in order

### Phase 1 — `consult.js start`

Run the start subprocess to check preconditions and build the brief.

```bash
FEATURE_FLOW_SESSION_ID=<session-id> \
FEATURE_FLOW_FEATURE=<feature-name> \
FEATURE_FLOW_WORKTREE=<abs-path-to-worktree> \
node skills/consult-codex/scripts/consult.js start --mode <mode> [--signal-key <key>]
```

Parse the JSON on stdout. Possible statuses:

- `"disabled"` → stop. Codex is disabled. Report the message to the user. Skip the rest of this skill.
- `"skipped"` → stop. A precondition (budget, escape-hatch, model-unresolvable) rejected this call. Report the reason.
- `"ready"` → proceed to Phase 2 with the returned `{ brief, model, timeout_ms, worktree, mode, signal_key }`.
- `"error"` → stop. The CLI rejected the call (e.g., unknown mode). Surface the message to the user; do not proceed.

### Phase 2 — Call `mcp__codex__codex` directly (your own tool call)

Do NOT run a subprocess for this. Claude invokes the MCP tool in its own context:

```
mcp__codex__codex({
  prompt: <brief from Phase 1>,
  cwd: <worktree from Phase 1>,
  sandbox: "read-only",
  "approval-policy": "never",
  model: <model from Phase 1>
})
```

**Wall-clock timeout:** if the call does not complete within `timeout_ms` (from Phase 1 output), treat it as `timeout`. Do not wait longer.

**Error classification — consult this table to decide what to pass to Phase 3:**

| What you observed | stdin JSON for Phase 3 |
|---|---|
| Tool returned `{ threadId, content }` normally | `{ "threadId": "...", "content": "..." }` |
| Tool not loaded (ToolSearch failed or returned empty) | `{ "error": { "reason": "codex_mcp_unavailable", "detail": "..." } }` |
| Tool throws with message matching `model is not supported` | `{ "error": { "reason": "model_auth_rejected", "detail": "<err msg>" } }` |
| Tool throws any other message | `{ "error": { "reason": "codex_call_failed", "detail": "<err msg>" } }` |
| Wall-clock exceeded `timeout_ms` | `{ "error": { "reason": "timeout", "detail": "exceeded <N>ms" } }` |

### Phase 3 — `consult.js record-response`

Pass the Phase 2 JSON to the record-response subprocess on stdin. Use a quoted heredoc (`<<'PHASE2_JSON'`) so apostrophes, backticks, and dollar signs in the Codex response survive the shell.

```bash
FEATURE_FLOW_SESSION_ID=<id> FEATURE_FLOW_FEATURE=<name> FEATURE_FLOW_WORKTREE=<path> \
node skills/consult-codex/scripts/consult.js record-response --mode <mode> [--signal-key <key>] <<'PHASE2_JSON'
<phase 2 json>
PHASE2_JSON
```

Parse stdout. Possible statuses:

- `"consulted"` → success. The JSON contains `tier` (`strict` or `soft`), `consultation_id`, and a formatted `message`. Render the message to yourself so you can read codex's diagnosis. The message includes the exact one-liner for Phase 4 (verdict).
- `"recorded_skip"` → the error was recorded as a skipped consultation. The lifecycle continues without codex's input. Surface the `reason` to the user.
- `"error"` → stop. The CLI rejected the call (e.g., unknown mode). Surface the message to the user; the consultation was not recorded.

### Phase 4 — Verdict (mandatory for `consulted`, skipped for `recorded_skip`)

After you read codex's diagnosis from Phase 3, invoke the skill again as a **separate Skill call**:

```
Skill(skill: "feature-flow:consult-codex",
      args: "verdict --id cN --decision accept|reject --reason <short text>")
```

This tells Claude to run:

```bash
node skills/consult-codex/scripts/consult.js verdict --id cN --decision <accept|reject> --reason "<text>"
```

**Verdict must be specific, not generic.** Good: `"spotted the replica schema divergence we missed"`. Bad: `"looks right"`. For `reject`, the reason MUST reference either what's already been tried or a concrete flaw in codex's advice.

## Tiered verdict enforcement

**Strict tier (reactive `stuck` mode, `strict: true`):** after Phase 3, your next `Skill(...)` call MUST be the Phase 4 verdict call. The `verdict-gate` PreToolUse hook blocks all other Skill invocations until the verdict is recorded. Plain Read/Edit/Write/Bash are not blocked — you can investigate before deciding. (Stuck mode is deferred to a follow-up plan; the verdict-gate hook is built in this plan to support it.)

**Soft tier (proactive modes, `strict: false`):** single-shot reminder in the Phase 3 return message. No block. If you skip the verdict call, the consultation is logged with `verdict: <not recorded>` and surfaces as a visible audit defect in PR metadata. The lifecycle proceeds either way.

## Disabled state

If `.feature-flow.yml` has `codex.enabled: false` (the default) or the `codex:` section is missing entirely, Phase 1 returns `{ status: "disabled", message }`. Stop there, surface the message, and proceed with the normal lifecycle. No state is written.

## References

- `references/brief-format.md` — exact format of the brief assembled by Phase 1 and sent to codex
- `references/modes.md` — per-mode goal/current-state/question templates
- `references/escape-hatch.md` — second-opinion-stumped protocol (reactive mode, follow-up plan)
