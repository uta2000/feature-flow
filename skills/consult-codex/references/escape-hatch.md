# Escape hatch — second-opinion stumped protocol

When a reactive stuck consultation is recorded, the signal key that triggered it is also written to `session-state.escape_hatch_state[<key>]` with `last_consulted_at: <now>`.

If the same signal fires again within `codex.reactive.escape_hatch_window_minutes` (default 30) after the consultation, the signal collector refuses to suggest another consultation and instead surfaces the issue to the user directly:

```
[feature-flow] Signal "<key>" fired again within the escape-hatch window. Codex's advice did not resolve this.
  → Pause and ask the user. This is the "second-opinion stumped" escape hatch.
  → Do NOT re-consult codex for this signal until the window expires at <ISO>.
```

Two AI models agreeing on the wrong path is worse than one — this is the hard stop against that, scoped to a configurable window so we don't poison the well indefinitely.

**Status:** This protocol is documented for the upcoming reactive `stuck` mode (deferred to a follow-up plan). Proactive modes don't need it because they're bounded (max 1 per mode per lifecycle). The `escape_hatch_state` field exists in `session-state.json` (T1) and the budget enforcement is wired (T7), but the signal collector that triggers re-consultations doesn't exist yet.
