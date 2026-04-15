# Codex Consultation — Design

**Date:** 2026-04-14
**Status:** Draft — pending review
**Author:** brainstormed with Claude (superpowers:brainstorming)
**Supersedes:** none

## Summary

Add the ability for feature-flow to consult OpenAI Codex (via the existing `codex` MCP server) as a second AI opinion at key judgment-heavy points in the lifecycle, and to rescue Claude when it's stuck or going in circles. The feature is **mode-parameterized**: one skill, four modes, shared contract for brief construction, codex invocation, forced verdict, durable logging, and PR-body export.

Four modes ship in v1:

1. **`review-design`** — proactive; after a design doc is written, codex reviews it for unstated assumptions, missing edge cases, and contradictions.
2. **`review-plan`** — proactive; after `verify-plan-criteria` passes its mechanical check, codex does a semantic review of whether the acceptance criteria are sufficient to prove behavior (not just that code exists).
3. **`review-code`** — proactive; before the Harden-PR step, codex reviews the full feature diff against the original design doc for implementation drift, code-quality issues, and pattern inconsistencies.
4. **`stuck`** — reactive; triggered automatically by mechanical "stuck" signals (failing test repetition, recurring errors, file-edit churn, verify-criteria failures, quality-gate bounces) or manually by the user typing `stuck:`. Codex gets a rich brief including explicit "what's already been tried" and returns a diagnosis.

Every codex call forces Claude to record a short verdict (`accept because X` / `reject because Y`). Enforcement is **tiered by mode**: reactive `stuck` consultations are hard-blocked via a PreToolUse hook until the verdict is recorded (any non-verdict Skill call is rejected with a sequencing message); proactive modes use a soft single-shot reminder and let a missing verdict surface as a visible `<not recorded>` defect in the PR metadata. The full exchange is logged to a worktree-local file and embedded in the PR body for human auditors.

## Motivation

Feature-flow today catches design/code mismatches early (design verification, `verify-plan-criteria`, anti-pattern hooks, Stop-hook quality gate). What it does **not** catch:

- **Stuck Claude sessions.** Test thrash, verification loops, quality-gate bounces, wrong-approach lock-in — the kind of failure mode where Claude keeps editing the same file with the same failing signal for many turns in a row. Today these burn tokens and sometimes converge on worse-and-worse code.
- **Plans that pass `verify-plan-criteria` but have bad criteria.** The current check is structural (every task has machine-verifiable `- [ ]` items). It cannot tell you that a criterion like `- [ ] File foo.ts exists` only checks existence, not behavior. This is the highest-impact feature-flow blind spot today — "criteria green, feature broken" is the YOLO-mode nightmare.
- **Implementation drift from design.** Claude can tick every criterion and still build something subtly different from what the design doc specified. No current step catches this because every step checks against the plan, not the design.
- **Single-model judgment.** Every feature-flow decision comes from one model. A second independent opinion, especially on judgment-heavy steps like design review and code review, has obvious value — the same reason humans ask each other for code reviews.

This feature adds one load-bearing piece of infrastructure (the `consult-codex` skill with shared contract) and uses it at four lifecycle checkpoints. Each checkpoint can be independently disabled in `.feature-flow.yml`.

## Non-goals

- **Replacing Claude as the primary agent.** Codex is an advisor, never the author. In v1, codex has read-only worktree access. Patch-proposer tier (codex returns a diff) and direct-editor tier (codex writes files) are explicitly deferred.
- **Auto-fixing bad advice.** Claude must write a verdict. Two AI models agreeing on the wrong path is worse than one, and the forced verdict is the only defense.
- **Replacing `superpowers:brainstorming` or existing feature-flow lifecycle skills.** Codex consultation is additive. Every lifecycle skill still runs end-to-end; codex steps are optional enhancements that can be turned off.
- **Detecting semantic "going in circles" via Claude's own output.** Hooks don't see Claude's reasoning, only its tool calls. We use the file-edit-churn signal as a proxy for lock-in instead.
- **Working without the `codex` MCP server.** If codex is not connected or not configured, the feature no-ops silently. Feature-flow continues to work exactly as it does today.

## Architecture

Three components with clean separation of concerns:

### (a) Signal collector hooks

Location: `hooks/scripts/signal-collector/*.js`

Passive PostToolUse hook scripts that watch `Bash`, `Edit`, `Write`, and specific Skill invocations (`feature-flow:verify-acceptance-criteria`, `feature-flow:consult-codex`). They parse tool outputs, increment counters in a session-local state file, and emit **non-blocking suggestions** in the tool-result stream when thresholds are crossed. They never block, never write to the codebase, never call codex directly.

**Module layout:**
```
hooks/scripts/signal-collector/
├── index.js              # dispatcher — reads stdin, routes by matcher
├── state.js              # session-state.json read/write/GC (shared with skill)
├── suggest.js            # emit non-blocking suggestion format
└── parsers/
    ├── test-output.js    # multi-framework test failure parser
    ├── error-signature.js# error normalization (strip line#, path#, ANSI)
    └── criterion.js      # verify-acceptance-criteria output parser
```

`state.js` is the single writer path for raw signal data. Every other module calls it.

### (b) `feature-flow:consult-codex` skill

Location: `skills/consult-codex/`

Mode-parameterized skill. Handles all four modes through a shared state machine: load config → budget check → escape-hatch check → build brief → call codex → parse response → force verdict → append exchange to state. The skill is the **only** writer of consultation records.

**Module layout:**
```
skills/consult-codex/
├── SKILL.md
├── references/
│   ├── brief-format.md      # the rich-brief skeleton
│   ├── modes.md             # per-mode tables + examples
│   └── escape-hatch.md      # second-opinion-stumped protocol
└── scripts/
    ├── build-brief.js       # dispatcher, routes to per-mode builder
    ├── modes/
    │   ├── review-design.js
    │   ├── review-plan.js
    │   ├── review-code.js
    │   └── stuck.js
    ├── call-codex.js        # mcp__codex__codex wrapper with error handling
    └── record-exchange.js   # state + codex-log.md writer
```

The SKILL.md tells Claude *when* to invoke the scripts and *how* to handle the verdict gate; the scripts do mechanical assembly (read state, read design doc / plan / git diff, apply size caps, truncate with explicit markers).

### (c) PR metadata extension

At Harden-PR time, the existing step reads `session-state.consultations[]` and injects a `codex_consultations` array into the `feature-flow-metadata` block in the PR body. The human-readable `codex-log.md` is appended below the metadata block inside a collapsible `<details>` tag so the full consultation history is visible to human reviewers without needing repo access.

### Data flow

```
Tool result (Bash/Edit/Write/verify-*)
  → signal-collector hook parses → updates state → optionally emits suggestion
  → Claude sees suggestion OR user types stuck:
  → consult-codex skill reads state → builds brief → calls codex MCP
  → Claude receives advice → writes verdict → acts
  → skill appends exchange to state + codex-log.md
  → Harden-PR step reads state → injects into feature-flow-metadata block
```

**Invariants:**
- Signal collector hooks are the **only** writers of raw signal data.
- The skill is the **only** writer of consultation records.
- No field is mutated in place except counter increments.
- **One PreToolUse block** exists in the whole feature: the verdict-gate hook on Skill invocations, active only when a `strict: true` consultation has `verdict: null`. This is a sequencing requirement (verdict call must precede other skill calls), not a prohibition. All other hook output is non-blocking suggestions.

### Integration call sites

Three existing feature-flow skills gain optional calls to `consult-codex`:

- `feature-flow:design-document` — after writing the design doc, if `codex.proactive_reviews.design_doc: true`, invoke `consult-codex mode: review-design`. Must also write `design_doc_path` to `session-state.json` (the `state.js` module exposes a `setMetadata(key, value)` helper).
- `feature-flow:verify-plan-criteria` — after mechanical criteria check passes, if `codex.proactive_reviews.plan_criteria: true`, invoke `consult-codex mode: review-plan`. Must also write `plan_file_path` to `session-state.json`.
- `skills/start` Harden-PR step — before opening the PR, if `codex.proactive_reviews.pre_harden: true`, invoke `consult-codex mode: review-code`.

The reactive `stuck` mode has no call site in existing skills — it's invoked by Claude (via hook suggestion) or by the user directly.

**Important: proactive review verdicts do NOT halt the lifecycle.** A `reject` verdict from Claude on a `review-design` consultation just means "Claude looked at codex's advice and decided the current design is fine as-is." The lifecycle proceeds either way. The verdict is an audit record of Claude's judgment, not a gate. The only gates in the whole feature are the per-session budgets.

### Build order within v1

Sequenced so each step validates the next:

1. **Shared infrastructure** — the `consult-codex` skill contract, session-state file, budget accounting, forced-verdict handling, `feature-flow-metadata` extension, `.feature-flow.yml` config schema. Nothing else works without this.
2. **Mode: `review-design`** — cheapest brief, earliest in lifecycle, traces the whole pipeline end-to-end on its first call. Validates the infra on real data.
3. **Mode: `review-plan`** — highest-value mode. Semantic review catches the "criteria pass, feature doesn't work" failure mode.
4. **Mode: `review-code`** — pre-Harden diff-vs-design-doc review. Protects YOLO mode specifically.
5. **Mode: `stuck`** — signal-collector hooks + reactive consultations. Fuzziest detection work, so it goes last on top of proven shared infra.

## Session state and brief format

### Session state file: `.feature-flow/session-state.json`

Worktree-local, gitignored (already covered by the existing `.feature-flow/` pattern in `.gitignore`). Created by the first signal-collector hook or the first proactive-review call, whichever comes first. Garbage-collected by the SessionStart hook if `session_id` doesn't match current.

```json
{
  "session_id": "<CLAUDE_SESSION_ID>",
  "feature": "user notifications",
  "worktree": "/abs/path/.worktrees/user-notifications",
  "started_at": "2026-04-14T20:38:00Z",
  "mode": "interactive",
  "design_doc_path": "docs/plans/2026-04-14-user-notifications.md",
  "plan_file_path": "docs/plans/2026-04-14-user-notifications-plan.md",

  "signals": {
    "failing_tests":         { "<key>": { "count": 3, "last_edit_snapshot": 17, "first_seen": "...", "last_seen": "..." } },
    "recurring_errors":      { "<key>": { "count": 2, "sample": "TypeError: ...", "last_seen": "..." } },
    "file_edits":            { "<path>": { "count": 5, "last_edited": "..." } },
    "verify_criteria_fails": { "<key>": { "count": 2, "last_seen": "..." } },
    "quality_gate_fails":    { "<key>": { "count": 2, "last_seen": "..." } }
  },

  "escape_hatch_state": {
    "<signal_key>": { "last_consulted_at": "2026-04-14T21:05:12Z" }
  },

  "attempts_log": [
    {
      "when": "...",
      "task": "implement notification storage",
      "approach": "used postgres jsonb column",
      "result": "failed — migration fails on existing data"
    }
  ],

  "budget": {
    "proactive":          { "design_doc": 0, "plan_criteria": 0, "pre_harden": 0 },
    "reactive":           { "used": 0, "cap": 3 },
    "debounced_signals":  { "<signal:debounce-key>": true }
  },

  "consultations": [
    {
      "id": "c1",
      "when": "2026-04-14T21:05:12Z",
      "mode": "review-plan",
      "trigger": "proactive",
      "strict": false,
      "signal_key": null,
      "codex_thread_id": "019d8dba-...",
      "codex_response": "...",
      "verdict": "accept",
      "verdict_reason": "criterion 3 really does only check file existence — need behavioral assertion",
      "outcome": "applied",
      "follow_up_edits": ["docs/plans/.../plan.md"]
    },
    {
      "id": "c2",
      "when": "2026-04-14T22:15:00Z",
      "mode": "stuck",
      "trigger": "reactive",
      "strict": true,
      "signal_key": "test:user_notifications_creates_record",
      "codex_thread_id": "019d8e01-...",
      "codex_response": "...",
      "verdict": null,
      "verdict_reason": null,
      "outcome": "pending_verdict",
      "follow_up_edits": []
    }
  ]
}
```

**Field invariants:**
- `signals` is append-increment only (hook writes).
- `consultations` is append-only (skill writes).
- `consultations[*].strict` is `true` for reactive/stuck consultations, `false` for proactive modes. The PreToolUse verdict-gate hook only blocks tool calls when a `strict: true` consultation has `verdict: null`.
- `consultations[*].signal_key` is set for reactive consultations (to the composite signal key — see "Deterministic escape-hatch keys" below), `null` for proactive.
- `budget.proactive.<mode>` caps at 1 — each proactive mode runs at most once per lifecycle.
- `budget.reactive.used` increments on every reactive call; refuses new calls when `used >= cap` unless user trigger.
- `escape_hatch_state[<signal_key>]` records the timestamp of the last reactive consultation for that key. Within `codex.reactive.escape_hatch_window_minutes`, any re-fire of the same signal is refused and the user is surfaced instead — even if the budget still has room. Outside the window, the key is cleared and a new consultation is allowed.

### Rich brief skeleton

Same structure for every mode. Per-mode builders fill the placeholders.

```markdown
# Feature-flow consultation — mode: <mode>

## Feature
<feature name + one-line description from session state>

## Goal
<mode-specific>

## Current state
<mode-specific>

## What's already been tried
<relevant entries from attempts_log, filtered by mode>
<if empty: "Nothing yet — this is a proactive review.">

## Signals
<mode-specific; stuck mode includes failing test/error/criterion sample>

## What I need from you
<mode-specific question>

## Constraints
- You have read-only access to the worktree at <abs path>
- Do NOT suggest any approach listed in "What's already been tried"
- If you think the goal itself is wrong, say so explicitly and briefly
- Keep your response under 400 words unless complexity truly demands more
- Structure your response as: (1) diagnosis, (2) recommendation, (3) confidence (high/medium/low)
```

### Per-mode brief variations

| Mode | Goal | Current state | Question |
|---|---|---|---|
| **review-design** | Full design doc text (inline) | N/A — design is the state | "Identify unstated assumptions, missing edge cases, internal contradictions, vague requirements. Is anything here actually ambiguous or underspecified?" |
| **review-plan** | Design doc summary + path reference | Full plan file with tasks + acceptance criteria (inline) | "For each task, assess whether the acceptance criteria are sufficient to prove behavior works — not just that code exists. Flag criteria that only check file existence, symbol presence, or type shape without behavioral assertion." |
| **review-code** | Design doc summary + path reference | `git diff <base>..HEAD` truncated to 8 KB + list of changed files | "(a) Does this diff actually realize the design? (b) Any code-quality, edge-case, or pattern-consistency issues separate from lint/tsc? (c) Any drift between stated design and actual implementation?" |
| **stuck** | Current in-flight task from plan (inline) | Current failing signal (test/error/criterion) with sample output | "What do you think is actually wrong here, and what approach hasn't been tried that might work? If you think the task approach is flawed, say so." |

### Brief size budget

Each mode's assembled brief is capped at 12 KB total. If `attempts_log` or `git diff` would exceed the budget, content is truncated with `… [truncated, N more entries]` markers. Nothing is dropped silently.

## Stuck-signal detection rules

Five signals, each with mechanical parsing, a deterministic composite key (for debouncing and escape-hatch tracking), and threshold variations between interactive and YOLO modes.

### Deterministic signal keys

Every signal reduces to a composite key of form `<type>:<normalized-content>`. Keys are used both for hook-side debounce (Signal-specific counter merging) and for the escape-hatch state in `session-state.escape_hatch_state`.

| Signal | Key formula | Normalization notes |
|---|---|---|
| Failing test repetition | `test:{normalized_test_name}` | lowercase, strip paths, strip line numbers, strip trailing IDs, collapse whitespace |
| Recurring error | `err:{error_class}:{first_stack_frame_normalized}` | drop memory addresses, timestamps, PIDs, absolute path prefixes; basename files; lowercase class name |
| File-edit churn | `edit:{file_path}` | basename absolute paths; relative paths preserved from worktree root |
| verify-criteria failure | `criteria:{task_id}:{criterion_index}` | `task_id` from the plan file's task heading; `criterion_index` is the 0-based index of the `- [ ]` line within the task |
| Quality-gate bounce | `gate:{tool}:{rule_id}` | examples: `gate:tsc:TS2345`, `gate:eslint:no-unused-vars`, `gate:ruff:F401`; lowercase tool, preserve rule ID case |

**Normalization rules (applied in order):**
1. Lowercase (except rule IDs, which often have case-significant codes like `TS2345`)
2. Strip ANSI escape codes
3. Replace absolute paths with their basename
4. Strip decimal numbers (line numbers, column numbers, digit IDs) unless they're part of a rule ID
5. Collapse consecutive whitespace to single space

Keys are stored verbatim in `session-state.json` — no hashing. This makes state files human-readable and fixture-testable, and keeps the audit trail meaningful in the PR body.

### Signal parsers and key construction

### Signal 1 — failing-test repetition

- **Source:** PostToolUse hook on `Bash`
- **Parse:** `parsers/test-output.js` runs on `tool_response.stdout`. Detects vitest, jest, pytest, `go test`, and mocha markers (`FAIL`, `●`, `FAILED`, `--- FAIL:`). Extracts raw test name and normalizes per the rules above. **The same parser also detects passing test runs** — on a PASS, it fires the Signal 3 reset action.
- **Key:** `test:{normalized_test_name}`
- **Increment rule:** each entry in `signals.failing_tests[<key>]` carries a `last_edit_snapshot` field — the sum of `signals.file_edits[*].count` across all source files at the moment of the previous failure for this key. A new failure only increments `count` if the current sum exceeds `last_edit_snapshot`, then the snapshot is updated to the new sum. This is the load-bearing rule that separates normal TDD from thrashing: a test re-run with no intervening edits does not count.
- **Thresholds:** interactive 3, YOLO 2

### Signal 2 — recurring error signature

- **Source:** PostToolUse hook on `Bash` (non-zero exit code)
- **Parse:** `parsers/error-signature.js` takes `tool_response.stderr`, extracts the error class name (first token after `Error:` / `error:` / `Exception:`) and the first stack frame line. Normalizes per the rules above: drops addresses/timestamps/PIDs, basenames absolute paths, strips digit IDs.
- **Key:** `err:{error_class}:{first_stack_frame_normalized}` (not hashed — human-readable)
- **Thresholds:** interactive 3, YOLO 2

### Signal 3 — file edit churn

- **Source:** PostToolUse hooks on `Edit` and `Write`
- **Parse:** increment `signals.file_edits[path].count` for source files (reuses the existing source-file matcher regex from `hooks.json`).
- **Reset rule:** when Signal 1's parser observes a passing test run (see Signal 1 detection rule above), it calls `state.clearChurnSince(testRunStartedAt)`, which clears `count` to 0 for any source file whose `last_edited` is earlier than `testRunStartedAt`. In practice: a test going green clears churn for all files edited before that green run. Files edited *during or after* the green run (for example, continued TDD on the next task) retain their counters.
- **Key:** `edit:{file_path}` (relative to worktree root)
- **Thresholds:** interactive 5, YOLO 3
- **Why the reset:** without reset-on-green, every feature with >5 TDD iterations would trigger. This signal specifically targets "edit, edit, edit, still broken" lock-in.

### Signal 4 — verify-acceptance-criteria repetition

- **Source:** PostToolUse hook on `Skill` matching `feature-flow:verify-acceptance-criteria` (single detection path — we hook on the skill invocation, not on any Bash command the skill happens to run internally).
- **Parse:** `parsers/criterion.js` reads `tool_response` and extracts failing criterion entries. For each failure, it records `task_id` (pulled from the most recent plan task heading that contains this criterion) and `criterion_index` (0-based index of this `- [ ]` line within the task).
- **Key:** `criteria:{task_id}:{criterion_index}`
- **Threshold:** 2 (both modes)
- **Rationale:** verify-acceptance-criteria is already the mechanical truth-check. Two failures on the same task-criterion coordinate = something real, not transient.

### Signal 5 — quality-gate bounce

- **Source:** Existing `Stop` hook's `quality-gate.js` gets one extra call: on failure, write a signal event to `session-state.json` via `state.js`.
- **Parse:** `quality-gate.js` already knows which tool (tsc, eslint, ruff, etc.) and which rule/code fired. It passes those through to `state.js` as `{tool, rule_id}`.
- **Key:** `gate:{tool}:{rule_id}` (e.g., `gate:tsc:TS2345`, `gate:eslint:no-unused-vars`, `gate:ruff:F401`)
- **Threshold:** 2 (both modes, **per rule_id**) — `tsc:TS2345` failing twice triggers independently of `eslint:no-unused-vars` failing twice
- **Rationale:** per-rule keys are more actionable than a single `quality_gate` bucket. "TypeScript error 2345 bounced twice" tells Claude exactly what to investigate; "quality gate failed" does not. Also means a user who hits two unrelated gate failures in a session doesn't get spurious consultation pressure.

### Suggestion format

When threshold is crossed AND the signal key has no active entry in `escape_hatch_state` within the window, `suggest.js` emits to stdout (visible in tool result, non-blocking):

```
[feature-flow] Stuck signal: test "User notifications › creates record" has failed 3× with edits in between.
  → Signal key: test:user_notifications_creates_record
  → Recommended: Skill(skill: "feature-flow:consult-codex", args: "mode: stuck")
  → Or continue if you have a clear next approach — this suggestion is non-blocking.
```

### Second-hit escape hatch (window-based)

The escape hatch is deterministic: if a signal key has `escape_hatch_state[<key>].last_consulted_at` within `codex.reactive.escape_hatch_window_minutes` (default 30), the signal is refused even if the budget has room.

**Lifecycle of a signal key:**

1. First threshold crossing → suggestion emitted. `escape_hatch_state[<key>]` is still empty.
2. Claude invokes `consult-codex mode: stuck --signal-key <key>`. The skill records `escape_hatch_state[<key>] = {last_consulted_at: <now>}` as part of the exchange.
3. Same signal fires again within the window → `suggest.js` emits a different message and does NOT recommend another consultation:

```
[feature-flow] Signal "test:user_notifications_creates_record" fired again within the
  escape-hatch window (<N> min since consultation c3). Codex's advice did not resolve this.
  → Pause and ask the user. This is the "second-opinion stumped" escape hatch.
  → Do NOT re-consult codex for this signal until the window expires at <ISO timestamp>.
```

4. Outside the window → `escape_hatch_state[<key>]` is considered stale; the signal is eligible for a fresh consultation. This matters for long YOLO runs where the same test failing an hour later may be a genuinely new occurrence worth re-consulting.

**Configurable:**
```yaml
codex:
  reactive:
    escape_hatch_window_minutes: 30    # default; set to 0 to disable window and always escape-hatch once
```

Two AI models agreeing on the wrong path is worse than one — this is the hard stop against that, scoped to a configurable window so we don't poison the well indefinitely.

### Threshold configuration

```yaml
codex:
  reactive:
    thresholds:
      interactive:
        failing_test: 3
        recurring_error: 3
        file_edit_churn: 5
        verify_criteria: 2
        quality_gate: 2
      yolo:
        failing_test: 2
        recurring_error: 2
        file_edit_churn: 3
        verify_criteria: 2
        quality_gate: 2
```

### What is deliberately NOT detected

- Time-based heuristics (no meaningful "stuck for 10 minutes" signal)
- Semantic "going in circles" (hooks don't see Claude's reasoning)
- Tool-call rate spikes (normal during exploration)
- Context compaction events (unrelated to being stuck)

## The `consult-codex` skill contract

### Invocation surface

**Consultation calls** (one of four modes):
```
Skill(skill: "feature-flow:consult-codex", args: "mode: review-design --file docs/.../design.md")
Skill(skill: "feature-flow:consult-codex", args: "mode: review-plan --file docs/.../plan.md")
Skill(skill: "feature-flow:consult-codex", args: "mode: review-code --base main")
Skill(skill: "feature-flow:consult-codex", args: "mode: stuck")
Skill(skill: "feature-flow:consult-codex", args: "mode: stuck --signal failing_test:<name>")
```

**Verdict call** (mandatory follow-up after any consultation):
```
Skill(skill: "feature-flow:consult-codex",
      args: "verdict --id c3 --decision accept --reason <short text>")
```

User-typed `stuck:` at the prompt is sugar that Claude expands to `Skill(skill: "feature-flow:consult-codex", args: "mode: stuck")`. The verdict call always follows explicitly.

### Execution state machine

The skill has two invocation patterns — a **consultation call** (modes `review-design` / `review-plan` / `review-code` / `stuck`) and a **verdict call** (`verdict` sub-mode). Hooks only see tool inputs and outputs, never assistant text, so the verdict must be recorded by an explicit second skill invocation, not scraped from Claude's chat output.

**Enforcement is tiered by mode** — see "Verdict enforcement tiers" below for the complete rules.

**Consultation call:**
```
1.  Load config             (.feature-flow.yml → codex.*)
2.  Check enabled           (codex.enabled && mode-specific flag)
3.  Load session state      (.feature-flow/session-state.json, create if missing)
4.  Budget check            (proactive: reject if budget.proactive.<mode> >= 1;
                             reactive: reject if budget.reactive.used >= cap,
                             unless invoked with user trigger)
5.  Escape-hatch check      (reactive only: refuse if escape_hatch_state[<key>]
                             is within window; surface instead)
6.  Build brief             (per-mode assembler, 12 KB cap, truncation markers)
7.  Resolve model           (fallback chain — see "Model resolution" below)
8.  Call codex              (mcp__codex__codex, resolved model, read-only sandbox)
9.  Parse response          (extract diagnosis/recommendation/confidence)
10. Append pending exchange (state.consultations[] with verdict: null,
                             strict: true for stuck mode / false for proactive,
                             signal_key: <key> for reactive / null for proactive;
                             also append to codex-log.md with verdict: pending)
11. Update escape-hatch     (reactive only: set escape_hatch_state[<key>].last_consulted_at = now)
12. Return to Claude        (structured output naming the consultation id;
                             format varies by strict/soft tier — see below)
```

Steps 2, 4, 5 can short-circuit with a "did not consult" record — still appended to `consultations[]` with `outcome: skipped:<reason>` and verdict `null`, so the audit trail is complete even for skipped calls. Skipped records carry `strict: false` regardless of mode (nothing to enforce).

**Verdict call:**
```
Skill(skill: "feature-flow:consult-codex",
      args: "verdict --id c3 --decision accept --reason <text>")
```

- Loads `session-state.json`, updates `consultations[c3].verdict`, `verdict_reason`, `outcome: applied_or_rejected`, rewrites the pending section in `codex-log.md` to the final form.
- Returns a short acknowledgement to Claude.
- For `strict: true` consultations, the PreToolUse verdict-gate hook (below) blocks all other Skill calls until this call is made.

### Verdict enforcement tiers

The spike on two-call verdict compliance showed that uniform non-blocking reminders degrade into noise in deep sessions and YOLO mode. Enforcement is therefore tiered by mode:

**Strict tier — reactive `stuck` consultations:**
- A PreToolUse hook on `Skill` reads `session-state.json` on every Skill invocation.
- If any `consultations[*]` entry has `strict: true AND verdict: null` AND the current Skill call is **not** the verdict call for that consultation, the hook **blocks** the call with:
  ```
  BLOCK: Consultation c3 (mode: stuck, signal: test:user_notifications_creates_record) requires
  a verdict before any other skill call. This is a sequencing block, not a prohibition —
  record the verdict and your next call can proceed.

  Invoke: Skill(skill: "feature-flow:consult-codex",
                args: "verdict --id c3 --decision <accept|reject> --reason <short text>")

  - accept: you will apply codex's recommendation
  - reject: you will not apply it (reason must reference what's already been tried)
  ```
- This is a legitimate block target: it's a sequencing requirement, not a prohibition. Claude can still do the next thing immediately after recording the verdict.
- Only Skill calls are gated — plain Bash/Edit/Write/Read are not blocked, because Claude may need to inspect state while forming the verdict. The assumption is that Claude's next *skill-level* action after a stuck consultation is either the verdict call or an action that should wait on the verdict.

**Soft tier — proactive modes (`review-design`, `review-plan`, `review-code`):**
- The consultation call's return message includes a copy-paste-ready one-liner:
  ```
  Recommended next step (single-shot reminder — this will not be repeated):

      Skill(skill: "feature-flow:consult-codex",
            args: "verdict --id c1 --decision <accept|reject> --reason <short text>")
  ```
- No PreToolUse block. No repeated reminder.
- If Claude skips the verdict call, the consultation remains in `session-state.json` with `verdict: null` and `outcome: pending_verdict`. This is visible in the PR metadata:
  ```yaml
  codex_consultations:
    - id: c1
      mode: review-design
      verdict: "<not recorded>"     # <— visible audit defect
      outcome: pending_verdict
  ```
- The human PR reviewer sees the `<not recorded>` marker and can ask Claude (or the dispatcher) to explain. This converts "silent miss" into "visible defect," which is the audit-integrity bar the spike established.

**Why the split:**
- Reactive/stuck consultations are high-value, high-stakes, and happen when Claude is already under stress. The PreToolUse block is legitimate and necessary — spike results showed ~medium-to-low compliance without it.
- Proactive consultations happen inside other lifecycle skills that are already doing meaningful work. Hard-blocking interrupts the primary task. The visible-defect pattern preserves audit integrity without adding interruption.

### Codex call mechanics

```js
// call-codex.js
const model = await resolveModel(config.codex)   // see "Model resolution" below
const response = await mcp__codex__codex({
  prompt: brief,                                  // the assembled rich brief
  cwd: worktreePath,                              // isolated feature worktree
  sandbox: "read-only",                           // hard-coded v1, no writes
  "approval-policy": "never",                     // no blocking prompts
  model                                            // resolved via fallback chain
})
```

**Fixed constraints for v1:**
- `sandbox: "read-only"` — hard-coded. Patch-proposer and direct-editor tiers deferred.
- `approval-policy: "never"` — codex cannot prompt anyone mid-session.
- **Timeout:** 180 s hard. On timeout, record `outcome: timeout` and return to Claude with "codex timed out, proceed with your own judgment".

### Model resolution

Model names churn. Hardcoding a single default (`gpt-5.2`) is a time bomb that will break in months. `call-codex.js` resolves the model via a fallback chain, cached per session:

```
1. config.codex.model         — if set in .feature-flow.yml, use it verbatim
2. MCP introspection           — if the codex MCP server advertises available
                                 models via a readable schema, pick the first
                                 advertised non-"-codex" variant (e.g., gpt-5.2
                                 over gpt-5.2-codex, since ChatGPT-account
                                 auth rejects -codex variants)
3. Skip with warning           — if neither of the above yields a model,
                                 record outcome: model_unresolvable, emit
                                 a one-time SessionStart-level warning with
                                 remediation ("set codex.model in
                                 .feature-flow.yml"), and no-op the skill
```

**Implementation note:** MCP introspection is the uncertain piece. The codex MCP protocol may or may not expose a queryable model list. Before implementation, verify what `mcp__codex__codex` (and/or the codex MCP server's listing endpoint) actually exposes. If introspection is not available, step 2 is a no-op and the fallback chain reduces to "configured → skip." The `configured` path must still work, which means the spec's default `.feature-flow.yml` template needs to ship with `codex.model` explicitly set to a known-good value for ChatGPT-account installs (initially `gpt-5.2`) even though the in-code default is not hardcoded. This keeps the feature working out of the box for new installs while insulating the code itself from model churn.

**Why this matters:** a year from now, `gpt-5.2` will be retired or renamed. If we hardcode it in Javascript, every existing installation breaks silently. If we keep it only in the `.feature-flow.yml` template, existing installations have their own copy of the value and can update it as part of routine maintenance — the code stays forward-compatible.

### Consultation-call return format (per tier)

The consultation call's return-to-Claude message differs by tier. Both tiers include the diagnosis, recommendation, and confidence from codex; they differ in how they prompt Claude toward the verdict call.

**Strict tier (reactive / `stuck` mode):**

```markdown
# Codex consultation c3 — mode: stuck
# Signal: test:user_notifications_creates_record
# Enforcement: STRICT (PreToolUse block until verdict is recorded)

## Codex's diagnosis
<from response>

## Codex's recommendation
<from response>

## Codex's confidence
<high|medium|low>

## REQUIRED next step
The next Skill call you make MUST be the verdict call for this consultation.
All other Skill invocations will be blocked by the verdict-gate PreToolUse hook
until this is recorded. Plain Read/Edit/Write/Bash are not blocked — you can
investigate before deciding if needed.

    Skill(skill: "feature-flow:consult-codex",
          args: "verdict --id c3 --decision <accept|reject> --reason <short text>")

- accept: you will apply codex's recommendation
- reject: you will not apply it (reason must reference what's already been
  tried, or an explicit flaw in the advice)
```

**Soft tier (proactive modes):**

```markdown
# Codex consultation c1 — mode: review-design
# Enforcement: SOFT (single-shot reminder; missing verdict surfaces as a
# visible "<not recorded>" defect in the PR metadata)

## Codex's diagnosis
<from response>

## Codex's recommendation
<from response>

## Codex's confidence
<high|medium|low>

## Recommended next step
To record your verdict, paste this one-liner (this reminder will not repeat):

    Skill(skill: "feature-flow:consult-codex",
          args: "verdict --id c1 --decision <accept|reject> --reason <short text>")

If you skip this call, the consultation will be logged with verdict: <not recorded>
and appear as a visible audit defect in the PR body. The lifecycle will proceed
either way — the verdict is an audit record, not a gate.
```

**Enforcement:** see "Verdict enforcement tiers" above for the complete rules. Briefly: strict tier uses a PreToolUse block on non-verdict Skill calls; soft tier relies on the visible `<not recorded>` defect in PR metadata.

### Exchange recording

Two writes, in order:

1. **`session-state.json`** — `consultations[]` gets a new entry (machine-readable; dispatcher consumes at PR time).
2. **`.feature-flow/codex-log.md`** — human-readable append, one section per consultation:

```markdown
## Consultation c3 — 2026-04-14T21:05:12Z — mode: stuck

**Trigger:** reactive (signal: failing_test:"User notifications › creates record")
**Codex thread:** 019d8dba-2d7a-7ba0-948c-98b0cce0c1ee
**Budget:** reactive 1/3 interactive

### Brief (excerpt)
> ...

### Codex's response
> Diagnosis: ...
> Recommendation: ...
> Confidence: medium

### Verdict
**VERDICT:** accept — codex spotted that the migration was running against a read replica snapshot, not production schema.

### Outcome
applied — fixed the replica issue, test passed on next run
```

The log file is gitignored but copied into the PR body at Harden-PR time.

### PR metadata contribution

At Harden-PR, the existing metadata-block builder reads `session-state.consultations[]` and injects:

```yaml
feature-flow-metadata:
  # ... existing fields ...
  codex_consultations:
    - id: c1
      mode: review-design
      strict: false
      when: "2026-04-14T20:45:00Z"
      verdict: accept
      summary: "flagged 2 unstated assumptions in error-handling section"
      outcome: applied
    - id: c2
      mode: review-plan
      strict: false
      when: "2026-04-14T20:52:00Z"
      verdict: "<not recorded>"        # visible audit defect — Claude skipped
                                       # the verdict call in the proactive
                                       # soft-tier flow
      summary: "caught 3 existence-only criteria lacking behavioral checks"
      outcome: pending_verdict
    - id: c3
      mode: stuck
      strict: true
      signal_key: "test:user_notifications_creates_record"
      when: "2026-04-14T21:05:12Z"
      verdict: accept
      summary: "diagnosed replica vs prod schema mismatch"
      outcome: applied
    - id: c4
      mode: review-code
      strict: false
      when: "2026-04-14T22:10:00Z"
      verdict: reject
      summary: "suggested unnecessary refactor of existing util"
      outcome: rejected
```

In the example above, consultation `c2` is a **visible audit defect** — Claude consulted codex for a proactive plan review but skipped the soft-tier verdict call. The PR reviewer sees `<not recorded>` and can ask Claude (or the dispatcher) to explain. Silent-miss becomes visible-defect, which is the audit-integrity bar the spike established.

The full `codex-log.md` is appended below the metadata block in the PR body, inside a collapsible `<details>` tag.

### Skill return after verdict call

```
Consultation c3 verdict recorded: accept — <reason>.
Reactive budget: 1/3 used (interactive).
```

## Configuration schema

**Default for new installs** written by `feature-flow:start` into `.feature-flow.yml`:

```yaml
codex:
  enabled: false                         # OPT-IN — see "Rollout and rollback" for rationale
  model: gpt-5.2                         # shipped in the template, not hardcoded in code;
                                         # users edit this when model names change; users
                                         # with OPENAI_API_KEY can switch to gpt-5.2-codex
  timeout_seconds: 180
  proactive_reviews:
    design_doc: true
    plan_criteria: true
    pre_harden: true
  reactive:
    enabled: true
    interactive_cap: 3
    yolo_cap: 10
    escape_hatch_window_minutes: 30      # how long after a reactive consultation the
                                         # same signal key is refused; 0 disables the
                                         # window and always escape-hatches once
    thresholds:
      interactive:
        failing_test: 3
        recurring_error: 3
        file_edit_churn: 5
        verify_criteria: 2
        quality_gate: 2
      yolo:
        failing_test: 2
        recurring_error: 2
        file_edit_churn: 3
        verify_criteria: 2
        quality_gate: 2
```

**Behavior when `codex:` section is missing entirely (upgrade path):** the feature is **off by default** — see Rollout and rollback. Users who want the feature add the section explicitly.

**Behavior when file is malformed YAML:** fall back to `codex.enabled: false`, emit one warning on SessionStart, do not crash.

**Behavior when `codex.model` is unset and MCP introspection fails:** record `outcome: model_unresolvable`, emit a one-time warning with remediation, skill no-ops. Feature-flow lifecycle continues unchanged.

## Error handling and graceful degradation

Feature-flow must still work when codex is disabled, broken, or unreachable. Every integration point checks if enabled and swallows errors silently, falling through to existing behavior.

| Failure | Behavior |
|---|---|
| `codex.enabled: false` in config | Skill refuses invocation with message; hooks still collect signals (cheap and useful even without consultation); signals accumulate but emit no suggestions |
| `mcp__codex__codex` tool not loaded | Skill calls `ToolSearch("select:mcp__codex__codex")` once, caches result; on failure records `outcome: codex_mcp_unavailable`, returns message, does not retry |
| Codex MCP server disconnected | Same as above — recorded as outcome, surfaced to Claude as a "skipped, continue with own judgment" message |
| Codex returns model-auth error (e.g., configured model rejected) | Skill logs error with `outcome: model_auth_rejected`, emits one-time hint: *"Your codex auth rejected model `<name>`. Edit `.feature-flow.yml` → `codex.model` to a supported variant, or set `OPENAI_API_KEY` for broader access."* Does not retry in same session. |
| `codex.model` unset and MCP introspection unavailable | Skill records `outcome: model_unresolvable`, emits one-time SessionStart warning with remediation, no-ops. |
| Codex timeout (>180s) | Record `outcome: timeout`, return to Claude with "codex timed out, proceed with own judgment" |
| Session state file corrupted JSON | `state.js` renames to `session-state.json.bak-<timestamp>`, creates fresh, emits one-time warning. Never loses data silently. |
| Concurrent hook writes | `state.js` writes via temp-file-then-rename (atomic). Readers tolerate mid-write states by retrying once. |
| Hook script throws | Every hook script wraps entry in `try { ... } catch { process.exit(0) }`. Signal collection never blocks or breaks a Claude tool call. Matches existing hook pattern. |
| `.feature-flow.yml` missing `codex:` section | All defaults, no warning |
| `.feature-flow.yml` malformed YAML | Fall back to defaults for `codex.*`; emit one warning on SessionStart; do not crash |

**Invariant:** at no point does a codex-consultation failure change feature-flow's behavior compared to running without the feature. Worst case, the skill is a no-op and the user sees a short message.

## Testing strategy

Three layers, each owning a clear contract.

### 1. Unit tests (pure logic, no I/O)

- `parsers/test-output.js` — fixtures for vitest, jest, pytest, `go test`, mocha. Test normalized test-name extraction, PASS/FAIL/mixed runs, ANSI-colored output.
- `parsers/error-signature.js` — fixtures for line-number strip, ANSI strip, absolute-path strip, truncation-at-240-chars.
- `parsers/criterion.js` — sample `verify-acceptance-criteria` outputs (pass, partial, all fail).
- `state.js` — temp-dir-backed tests for atomic write, corrupt-file recovery, GC on session ID mismatch, debounce-key lifecycle, budget accounting.
- `build-brief.js` per mode — fixture state + fixture source files; assert brief stays under 12 KB, truncation markers appear when needed, "what's been tried" section is non-empty when `attempts_log` has entries.

### 2. Integration tests (hooks + state, no codex)

- Drive `signal-collector/index.js` with recorded PostToolUse JSON payloads (real test run outputs, Edit tool inputs). Assert state file mutations and suggestion emission match expectations.
- Drive `consult-codex` skill end-to-end with `mcp__codex__codex` **mocked** to return canned responses. Assert state file gets new consultation, `codex-log.md` gets new section, verdict gate surfaces the required-verdict message.
- Budget exhaustion: invoke skill 4× in reactive mode; assert 4th call is skipped with `outcome: skipped:budget_exhausted`. Invoke with user trigger; assert override works.
- Escape hatch: consult on signal X, simulate signal X re-firing; assert second call is skipped with `outcome: skipped:escape_hatch`.

### 3. Manual smoke tests (live codex MCP)

- One golden-path test per mode, hand-run against a real codex call on this feature-flow branch during development. Record outputs, check format.
- Verdict enforcement can only be verified by observing Claude behavior in a real session — accept as manual check.
- YOLO mode: run `start: ... --yolo` on a toy feature with codex enabled, assert all four modes fire and all exchanges land in the PR body.

### What is deliberately not tested

- Codex's output quality. External dependency; we test *our* handling of its output, not its judgment.
- Verdict content quality. Claude's side of the gate.
- PR-body rendering on GitHub. Manual check on first real PR.

## Rollout and rollback

- **Opt-in by default.** Both new installs and existing installs default to `codex.enabled: false`. Users who want the feature flip one line. Rationale: the feature calls an external MCP service, mutates PR bodies, and can produce user-visible surprises (failed model auth, unexpected consultations, PR body churn). None of those belong in a silently-enabled upgrade. Users who actively want the feature opt in via config.
- **Feature gate:** `codex.enabled: false` fully disables the feature. Hooks still run (cheap), but emit no suggestions and the skill refuses all consultation calls. Existing lifecycle is untouched.
- **Per-mode gates:** each proactive mode has its own boolean. Once `codex.enabled: true`, any subset of proactive modes + the reactive tier can be toggled independently.
- **New install:** `feature-flow:start` auto-detection writes a default `.feature-flow.yml` with the `codex:` section **commented out or set to `enabled: false`**, alongside a commented guide: *"Uncomment and set `enabled: true` to use the codex MCP server for second-opinion reviews and stuck recovery. Requires a configured `codex` MCP server. See `docs/plans/2026-04-14-codex-consultation.md` for the full design."*
- **Existing install (upgrade path):** a `.feature-flow.yml` without a `codex:` section continues to behave as it did before the upgrade — no consultation, no hooks firing signals, no behavioral change whatsoever. The user has to explicitly opt in. Zero surprise.
- **CHANGELOG.md entry:**
  > **Added:** `codex` consultation at four lifecycle checkpoints (design review, plan review, pre-harden code review, reactive stuck detection) via the existing `codex` MCP server. **Opt-in:** the feature is disabled by default. To enable, set `codex.enabled: true` in `.feature-flow.yml` and ensure your `codex` MCP server is configured. See `docs/plans/2026-04-14-codex-consultation.md` for the full design, including the opt-in rationale, tiered verdict enforcement, and escape-hatch rules.
- **Rollback:** revert the plugin version. No state migrations. The `.feature-flow/` session-state files are worktree-local and gitignored; they age out naturally.

## Open questions

None blocking v1. Items deferred for v2 consideration:

- **Patch-proposer tier** — codex returns a diff for Claude to apply/reject. Deferred until v1 shows sustained value and the read-only advisor mode has proven accurate enough to trust with more agency.
- **Direct-editor tier** — codex writes files in the worktree. Deferred indefinitely pending real evidence of value over patch-proposer.
- **Cross-session memory for codex** — e.g. passing a summary of prior consultations from previous feature-flow sessions so codex can see patterns. Currently each consultation is stateless from codex's point of view beyond the worktree contents.
- **Selective logging into PR body** — if the `codex-log.md` gets long on a complex feature, we may want to truncate or summarize before embedding. Not a v1 issue because the 3-interactive / 10-yolo caps bound the size.
