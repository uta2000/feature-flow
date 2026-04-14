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

Every codex call — regardless of mode — forces Claude to write a short verdict (`accept because X` / `reject because Y`) before acting on the advice. The full exchange is logged to a worktree-local file and embedded in the PR body for human auditors.

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
- Hooks never block. The only "blocking" thing in the whole feature is the forced-verdict reminder, which is a reminder-style PostToolUse hook, not a PreToolUse BLOCK.

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
    "failing_tests":         { "<test name>": { "count": 3, "first_seen": "...", "last_seen": "..." } },
    "recurring_errors":      { "<sig prefix>": { "count": 2, "sample": "TypeError: ...", "last_seen": "..." } },
    "file_edits":            { "<file path>": { "count": 5, "last_edited": "..." } },
    "verify_criteria_fails": { "<criterion>":  { "count": 2, "last_seen": "..." } },
    "quality_gate_fails":    [{ "when": "...", "summary": "tsc failed: ..." }]
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
      "codex_thread_id": "019d8dba-...",
      "codex_response": "...",
      "verdict": "accept",
      "verdict_reason": "criterion 3 really does only check file existence — need behavioral assertion",
      "outcome": "applied",
      "follow_up_edits": ["docs/plans/.../plan.md"]
    }
  ]
}
```

**Field invariants:**
- `signals` is append-increment only (hook writes).
- `consultations` is append-only (skill writes).
- `budget.proactive.<mode>` caps at 1 — each proactive mode runs at most once per lifecycle.
- `budget.reactive.used` increments on every reactive call; refuses new calls when `used >= cap` unless user trigger.
- `debounced_signals` prevents the same signal from triggering a second reactive consultation. First hit sets the key; second hit surfaces the "second-opinion stumped" escape hatch instead of calling codex again.

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

Five signals, each with mechanical parsing, debounce keys, and threshold variations between interactive and YOLO modes.

### Signal 1 — failing-test repetition

- **Source:** PostToolUse hook on `Bash`
- **Parse:** `parsers/test-output.js` runs on `tool_response.stdout`. Detects vitest, jest, pytest, `go test`, and mocha markers (`FAIL`, `●`, `FAILED`, `--- FAIL:`). Extracts normalized test name. **The same parser also detects passing test runs** — on a PASS, it fires the Signal 3 reset action (clear churn counters for any source file edited since the last run of this test).
- **Debounce key:** `failing_test:<normalized_test_name>`
- **Increment rule:** each failing-test entry in `signals.failing_tests[<name>]` carries a `last_edit_snapshot` field — the sum of `signals.file_edits[*].count` across all source files at the moment of the previous failure for this test. A new failure only increments `count` if the current sum exceeds `last_edit_snapshot`. This is the load-bearing rule that separates normal TDD from thrashing: a test re-run with no intervening edits does not count. Reset-on-green (see Signal 3) clears individual file counters but the snapshot is recomputed on each failure from current state, so it remains comparable.
- **Thresholds:** interactive 3, YOLO 2

### Signal 2 — recurring error signature

- **Source:** PostToolUse hook on `Bash` (non-zero exit code)
- **Parse:** `parsers/error-signature.js` takes `tool_response.stderr`, strips ANSI, strips absolute paths, strips line/column numbers, takes first `error:` or `Error:` line up to 240 chars, sha256s it. Hash prefix is the signature.
- **Debounce key:** `error:<sig_prefix>`
- **Thresholds:** interactive 3, YOLO 2

### Signal 3 — file edit churn

- **Source:** PostToolUse hooks on `Edit` and `Write`
- **Parse:** increment `signals.file_edits[path].count` for source files (reuses the existing source-file matcher regex from `hooks.json`).
- **Reset rule:** when Signal 1's parser observes a passing test run (see Signal 1 detection rule above), it calls `state.clearChurnSince(testRunStartedAt)`, which clears `count` to 0 for any source file whose `last_edited` is earlier than `testRunStartedAt`. In practice: a test going green clears churn for all files edited before that green run. Files edited *during or after* the green run (for example, continued TDD on the next task) retain their counters.
- **Debounce key:** `churn:<file_path>`
- **Thresholds:** interactive 5, YOLO 3
- **Why the reset:** without reset-on-green, every feature with >5 TDD iterations would trigger. This signal specifically targets "edit, edit, edit, still broken" lock-in.

### Signal 4 — verify-acceptance-criteria repetition

- **Source:** PostToolUse hook on `Skill` matching `feature-flow:verify-acceptance-criteria` (single detection path — we hook on the skill invocation, not on any Bash command the skill happens to run internally).
- **Parse:** `parsers/criterion.js` extracts failing criterion lines from `tool_response` (pattern: `- [ ] <criterion text>` following a `FAIL:` header in the skill's output format).
- **Debounce key:** `criterion:<criterion_text_hash>`
- **Threshold:** 2 (both modes)
- **Rationale:** verify-acceptance-criteria is already the mechanical truth-check. Two failures on the same criterion = something real, not transient.

### Signal 5 — quality-gate bounce

- **Source:** Existing `Stop` hook's `quality-gate.js` gets one extra call: on failure, write a signal event to `session-state.json` via `state.js`.
- **Debounce key:** `quality_gate` (single key — any two failures trigger)
- **Threshold:** 2 (both modes)
- **Rationale:** Stop hooks can fire multiple times. Two failed Stop attempts in one session = Claude thinks it's done twice but isn't. Strong signal.

### Suggestion format

When threshold is crossed AND the debounce key isn't set, `suggest.js` emits to stdout (visible in tool result, non-blocking):

```
[feature-flow] Stuck signal: test "User notifications › creates record" has failed 3× with edits in between.
  → Recommended: Skill(skill: "feature-flow:consult-codex", args: "mode: stuck")
  → Signal: failing_test
  → Or continue if you have a clear next approach — this suggestion is non-blocking.
```

Then `state.js` sets `budget.debounced_signals["failing_test:<name>"] = true`.

### Second-hit escape hatch

If Claude invokes `consult-codex mode: stuck` for a debounced signal AND the signal fires again later (meaning codex's advice did not fix it), `suggest.js` emits a different message:

```
[feature-flow] Signal "failing_test: <name>" fired again after codex consultation c3 — codex's advice did not resolve this.
  → Recommended: pause and ask the user. This is the "second-opinion stumped" escape hatch.
  → Do NOT re-consult codex for this signal.
```

Two AI models agreeing on the wrong path is worse than one — this is the hard stop against that.

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

**Consultation call:**
```
1.  Load config             (.feature-flow.yml → codex.*)
2.  Check enabled           (codex.enabled && mode-specific flag)
3.  Load session state      (.feature-flow/session-state.json, create if missing)
4.  Budget check            (proactive: reject if budget.proactive.<mode> >= 1;
                             reactive: reject if budget.reactive.used >= cap,
                             unless invoked with user trigger)
5.  Escape-hatch check      (signal already consulted once and fired again? refuse + surface)
6.  Build brief             (per-mode assembler, 12 KB cap, truncation markers)
7.  Call codex              (mcp__codex__codex, model from config, read-only sandbox)
8.  Parse response          (extract diagnosis/recommendation/confidence)
9.  Append pending exchange (state.consultations[] with verdict: null;
                             also append to codex-log.md with verdict: pending)
10. Return to Claude        (structured output naming the consultation id and
                             telling Claude to invoke the verdict call next)
```

Steps 2, 4, 5 can short-circuit with a "did not consult" record — still appended to `consultations[]` with `outcome: skipped:<reason>` and verdict `null`, so the audit trail is complete even for skipped calls.

**Verdict call:**
```
Skill(skill: "feature-flow:consult-codex",
      args: "verdict --id c3 --decision accept --reason <text>")
```

- Loads `session-state.json`, updates `consultations[c3].verdict`, `verdict_reason`, `outcome: pending_or_applied`, rewrites the pending section in `codex-log.md` to the final form.
- Returns a short acknowledgement to Claude.
- Must be invoked before Claude calls any other tool; the verdict-reminder hook (below) enforces this.

**Verdict reminder hook (PostToolUse on Skill):**
- Watches all Skill invocations. On every Skill call, reads `session-state.json` and checks whether the most recent consultation has `verdict: null` AND the current Skill call is **not** itself the verdict call for that consultation.
- If so, emits a non-blocking reminder in the tool result stream: `[feature-flow] Consultation c3 is pending a verdict. Run: Skill(skill: "feature-flow:consult-codex", args: "verdict --id c3 --decision <accept|reject> --reason <text>")`
- The reminder is idempotent — appears on every subsequent tool call until the verdict is recorded.

### Codex call mechanics

```js
// call-codex.js
const response = await mcp__codex__codex({
  prompt: brief,                              // the assembled rich brief
  cwd: worktreePath,                          // isolated feature worktree
  sandbox: "read-only",                       // hard-coded v1, no writes
  "approval-policy": "never",                 // no blocking prompts
  model: config.codex.model || "gpt-5.2"      // configurable; gpt-5.2 default
})
```

**Fixed constraints for v1:**
- `sandbox: "read-only"` — hard-coded. Patch-proposer and direct-editor tiers deferred.
- `approval-policy: "never"` — codex cannot prompt anyone mid-session.
- `model` defaults to `gpt-5.2` because the installed codex CLI is OAuth'd with a ChatGPT account that rejects `gpt-5.2-codex` and the other gpt-5* variants. If users later set `OPENAI_API_KEY`, they edit `.feature-flow.yml` to switch models — no code change.
- **Timeout:** 180 s hard. On timeout, record `outcome: timeout` and return to Claude with "codex timed out, proceed with your own judgment".

### Forced-verdict mechanics

The consultation call's return-to-Claude message is structured so Claude knows it must follow up with the verdict call:

```markdown
# Codex consultation c3 — mode: stuck

## Codex's diagnosis
<from response>

## Codex's recommendation
<from response>

## Codex's confidence
<high|medium|low, from response>

## REQUIRED next step
You MUST invoke the verdict call before any other tool:

Skill(skill: "feature-flow:consult-codex",
      args: "verdict --id c3 --decision <accept|reject> --reason <short reason>")

- accept: you will apply codex's recommendation
- reject: you will not apply it (reason must reference what's already been
  tried, or an explicit flaw in the advice)

The verdict-reminder hook will flag every subsequent tool call until you do.
```

**Enforcement:** the verdict-reminder hook (described in the state machine section above) watches all PostToolUse Skill invocations. If the most recent consultation has `verdict: null` and the current Skill call is not the verdict call for it, the hook emits a non-blocking reminder in the tool-result stream. Reminder, not block — consistent with the rest of the design.

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
      when: "2026-04-14T20:45:00Z"
      verdict: accept
      summary: "flagged 2 unstated assumptions in error-handling section"
      outcome: applied
    - id: c2
      mode: review-plan
      when: "2026-04-14T20:52:00Z"
      verdict: accept
      summary: "caught 3 existence-only criteria lacking behavioral checks"
      outcome: applied
    - id: c3
      mode: stuck
      when: "2026-04-14T21:05:12Z"
      verdict: accept
      summary: "diagnosed replica vs prod schema mismatch"
      outcome: applied
    - id: c4
      mode: review-code
      when: "2026-04-14T22:10:00Z"
      verdict: reject
      summary: "suggested unnecessary refactor of existing util"
      outcome: rejected
```

The full `codex-log.md` is appended below the metadata block in the PR body, inside a collapsible `<details>` tag.

### Skill return after verdict call

```
Consultation c3 verdict recorded: accept — <reason>.
Reactive budget: 1/3 used (interactive).
```

## Configuration schema

Default config in `.feature-flow.yml`:

```yaml
codex:
  enabled: true
  model: gpt-5.2                         # overridable; API-key auth unlocks gpt-5.2-codex
  timeout_seconds: 180
  proactive_reviews:
    design_doc: true
    plan_criteria: true
    pre_harden: true
  reactive:
    enabled: true
    interactive_cap: 3
    yolo_cap: 10
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

**Behavior when sections are missing:** use defaults silently. **Behavior when file is malformed YAML:** fall back to all defaults, emit one warning on SessionStart, do not crash.

## Error handling and graceful degradation

Feature-flow must still work when codex is disabled, broken, or unreachable. Every integration point checks if enabled and swallows errors silently, falling through to existing behavior.

| Failure | Behavior |
|---|---|
| `codex.enabled: false` in config | Skill refuses invocation with message; hooks still collect signals (cheap and useful even without consultation); signals accumulate but emit no suggestions |
| `mcp__codex__codex` tool not loaded | Skill calls `ToolSearch("select:mcp__codex__codex")` once, caches result; on failure records `outcome: codex_mcp_unavailable`, returns message, does not retry |
| Codex MCP server disconnected | Same as above — recorded as outcome, surfaced to Claude as a "skipped, continue with own judgment" message |
| Codex returns model-auth error (e.g. `gpt-5.2-codex` rejected) | Skill logs error, emits one-time hint: *"Your codex auth doesn't support this model. Edit `.feature-flow.yml` → `codex.model` or set `OPENAI_API_KEY`."* Does not retry in same session. |
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

- **Feature gate:** `codex.enabled: false` in `.feature-flow.yml` fully disables the feature. Existing feature-flow lifecycle is untouched. No code rollback needed.
- **Per-mode gates:** each proactive mode has its own boolean. Can ship with any subset enabled.
- **New install:** `feature-flow:start` auto-detection writes a default `.feature-flow.yml` with the `codex:` section and all defaults enabled.
- **Existing install (upgrade path):** a `.feature-flow.yml` without a `codex:` section behaves as if all defaults apply — which means **the feature is enabled on upgrade for any user who has a working codex MCP server**. This is surprising behavior and MUST be called out prominently in `CHANGELOG.md` and the SessionStart upgrade notice. Users who don't want the feature must explicitly set `codex.enabled: false` after upgrade. Users without a codex MCP server see no change (the skill no-ops silently per the error-handling table).
- **Version note:** `CHANGELOG.md` entry should include: "If you have a `codex` MCP server connected, feature-flow will now consult it at four lifecycle checkpoints (design review, plan review, pre-harden code review, reactive stuck detection). This is opt-out via `codex.enabled: false` in `.feature-flow.yml`."

## Open questions

None blocking v1. Items deferred for v2 consideration:

- **Patch-proposer tier** — codex returns a diff for Claude to apply/reject. Deferred until v1 shows sustained value and the read-only advisor mode has proven accurate enough to trust with more agency.
- **Direct-editor tier** — codex writes files in the worktree. Deferred indefinitely pending real evidence of value over patch-proposer.
- **Cross-session memory for codex** — e.g. passing a summary of prior consultations from previous feature-flow sessions so codex can see patterns. Currently each consultation is stateless from codex's point of view beyond the worktree contents.
- **Selective logging into PR body** — if the `codex-log.md` gets long on a complex feature, we may want to truncate or summarize before embedding. Not a v1 issue because the 3-interactive / 10-yolo caps bound the size.
