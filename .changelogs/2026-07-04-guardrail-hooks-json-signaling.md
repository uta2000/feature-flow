### Fixed — guardrail hooks now actually block: JSON signaling replaces discarded plain-text output (#275)

Every "blocking" hook signaled via plain stdout text (`BLOCK: ...`) with exit 0 — a
combination Claude Code silently discards for PreToolUse, PostToolUse, and Stop events
(only SessionStart/UserPromptSubmit/UserPromptExpansion stdout reaches context). Nothing
was ever blocked and no warning ever reached the model; the SessionStart banner
advertised protections that did not exist. Confirmed against the official hooks
reference and live behavior (2026-07-04 audit, finding F1).

All hooks now emit the documented JSON mechanisms:

- **PreToolUse gates deny for real:** anti-pattern gate (`any` / `as any` / empty catch),
  model-param gate (Task/Agent dispatch without `model`), and verdict-gate (pending
  strict codex consultation) emit
  `hookSpecificOutput.permissionDecision: "deny"` with the reason shown to Claude.
- **Stop gate blocks session end for real:** `quality-gate.js` emits top-level
  `{"decision":"block","reason":...}` on failures and honors the `stop_hook_active`
  stdin flag (exits silently in a continuation loop — no re-running the suite into the
  8-block cap).
- **Advisories now reach Claude:** console.log/debug warnings, per-file lint results,
  the plan-file reminder, and the Context7 reminder emit
  `hookSpecificOutput.additionalContext` (the Context7 reminder previously wrote to
  stderr with exit 0 — also discarded).

Implementation (folds in #272): the 7 inline `node -e` one-liners in `hooks/hooks.json`
are extracted to standalone tested scripts (`antipattern-gate.js`, `model-param-gate.js`,
`console-warn.js`, `plan-reminder.js`, `context7-reminder.js`) sharing a new
`hooks/scripts/lib/read-hook-input.js` stdin helper; `verdict-gate.js`, `quality-gate.js`,
and `lint-file.js` are converted in place. `hooks.json` is pure wiring
(`grep -c "node -e"` → 0). Matcher behavior is byte-identical — configurable/widened
matchers remain #273's scope.

Also fixed en route:

- The PostToolUse plan-file reminder keyed off `$CLAUDE_FILE_PATH`, which is not a
  documented hook env var — it had likely never fired. Rewritten to read
  `tool_input.file_path` from stdin JSON.
- SessionStart banner rules 4 and 5 rewritten to claim exactly what is enforced
  (denies) vs. advisory (console.log/lint warnings).

Tests: 7 new test files + updates bring the hook suite to 12 files / ~90 assertions,
including schema pinning (`hookEventName` asserted in every JSON helper), fail-open
edge cases (empty/malformed stdin everywhere), the quality-gate marker short-circuit
(both directions), and `stop_hook_active` loop protection. CI still does not run these
suites — run `for f in hooks/scripts/*.test.js hooks/scripts/lib/*.test.js; do node "$f"; done`
locally (follow-up issue planned for CI coverage).

Known follow-ups (pre-existing, deliberately not fixed here): quality-gate
verification-marker cache poisoning on crashed/timed-out checks; lint-file silent-null
when the linter binary fails to spawn.
