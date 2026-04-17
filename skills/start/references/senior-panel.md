# Senior Developer Panel — Phase 1c Reference

## Purpose

Phase 1c of the code-review-pipeline. A single `general-purpose` subagent orchestrates three judgment-oriented personas (Staff Engineer, SRE, Product Engineer) sequentially against the same post-Phase-1a branch diff that Phase 1b reviews. It catches issues rule-based agents miss by design: wrong abstractions, operability risk, and scope creep.

Runs at **Major feature** scope (Tier 3) only, dispatched **in the same parallel message** as Phase 1b.

## Personas

Each persona has a narrow lens and a **closed rule enum**. Phase 2's existing "discard findings without a named rule" filter enforces the enum automatically — a persona that invents an off-enum rule is rejected.

| Persona | Lens | Closed rule enum |
|---------|------|-------------------|
| **Staff Engineer** (`staff_eng`) | Abstraction quality, future debt, modularity | `wrong-abstraction`, `leaky-boundary`, `premature-generalization`, `missing-seam`, `overly-coupled` |
| **SRE** (`sre`) | Operability, failure modes, debuggability | `missing-correlation-id`, `silent-retry-loop`, `unbounded-resource`, `unclear-failure-mode`, `missing-timeout` |
| **Product Engineer** (`product_eng`) | Scope fit, user-visible behavior, simplicity vs. requirement | `scope-creep`, `requirement-drift`, `incidental-complexity`, `missing-user-path`, `behavior-regression-risk` |

## Finding schema

Phase 1c findings **extend** the base Phase 1b structured format — they do not redefine it. The canonical base schema (`file`, `line`, `rule`, `severity`, `description`, `fix`) lives in `skills/start/references/code-review-pipeline.md` under Phase 1b's "Structured output requirement" section. Phase 1c adds **two fields** to that base:

- `finding_type: rule | architectural | operability | product_fit`
- `persona: staff_eng | sre | product_eng` (required when `finding_type != rule`)

If the base schema ever changes (e.g., a field is renamed), only the Phase 1b section needs editing — Phase 1c automatically inherits.

`finding_type` mapping by persona:
- `staff_eng` → `architectural`
- `sre` → `operability`
- `product_eng` → `product_fit`

A persona MAY emit `finding_type: rule` if it identifies a genuine rule-based defect outside its lens; this is discouraged but allowed.

**Complete example** (all base fields plus the two extensions):

```
- file: src/queue.ts
  line: 42
  rule: wrong-abstraction
  severity: important
  finding_type: architectural
  persona: staff_eng
  description: FIFO queue used where a mutex would suffice — only one
    producer and one consumer, ordering is irrelevant, but the queue's
    memory footprint scales with backlog.
  fix: |
    Consider replacing `Queue` with `Mutex`. The current coupling
    between producer rate and consumer rate is implicit in the queue
    depth; a mutex makes the contention explicit and bounded.
```

## Subagent dispatch

The orchestrator MUST propagate a correlation token (`$SESSION_ID` — the lifecycle session's stable ID) into the dispatch so that failure announcements, logs, and Phase 5 report entries can be traced back to the originating `start:` invocation:

```
Task(
  subagent_type: "general-purpose",
  model: "opus",
  description: "Run senior developer panel review [session:$SESSION_ID]",
  prompt: [persona-panel prompt — see below; prompt header
           must include `session: $SESSION_ID` so the subagent
           echoes it in its own log output]
)
```

**Dispatch constraints:**
- Gated to Tier 3 only; do not dispatch for sub-Major-feature scope.
- Dispatched in the same parallel message as Phase 1b agents (not after).
- Single subagent call — personas are orchestrated **internally** and run **sequentially** so later personas can see earlier findings and avoid duplication.
- Model: `opus`. Judgment work is the explicit use case reserved for Opus per `model-routing.md`.
- **Timeout (orchestrator-enforced):** 5 minutes wall-clock. The Task primitive has no native timeout — the orchestrator owns the deadline. Expected runtime on a Major-feature diff: 2–4 minutes. See "Phase 1c schema-level guard" → "Orchestrator wall-clock responsibility" for the enforcement contract.
- **Diff-size upper bound:** 1500 changed lines. Skip Phase 1c entirely above this bound (see schema-level guard section).
- **Correlation ID:** every announcement, log line, and Phase 5 report entry related to this Phase 1c invocation MUST carry `[session:$SESSION_ID]` so operators can grep-correlate across the lifecycle.

## Prompt contract

The subagent prompt MUST contain:

1. **Context block:** base branch, HEAD SHA, changed files, acceptance criteria, Phase 0 pre-filter results, anti-patterns and reference examples from Study Existing Patterns.
2. **Orchestration instruction:** "You will run three reviews sequentially — Staff Engineer, then SRE, then Product Engineer. Each produces at most 5 findings. Do not duplicate across personas; a later persona that sees a finding already covered by an earlier persona must skip it. **Tiebreaker for boundary cases:** when a concern straddles two persona lenses (e.g., `incidental-complexity` vs `premature-generalization`), the earlier-running persona in the sequence (Staff Engineer → SRE → Product Engineer) claims it; later personas skip and may note internally that they deferred, but do not emit a finding. This keeps output deterministic across runs."
3. **Per persona, the prompt MUST include:**
   - The lens statement (see table above).
   - The closed rule enum (verbatim).
   - An anchor requirement: "Every finding MUST anchor to a concrete `file:line`, even for architectural concerns. Pick the single most representative line of the issue."
4. **Output format:** the structured finding block above.
5. **Hard constraint (verbatim):** "If you cannot name a specific rule from the enum AND cannot anchor to a real `file:line`, DO NOT emit a finding. Emit nothing rather than a vague one."

## Phase 1c schema-level guard

After the subagent returns, the orchestrator validates each finding against the schema before merging into Phase 2:

- Reject any finding missing `finding_type`.
- Reject any finding with `finding_type != "rule"` that is missing `persona`.
- Reject any finding whose `rule` is not a member of the persona's closed enum.

**Diff-size upper bound:** If the reviewed branch diff exceeds **1500 changed lines**, skip Phase 1c entirely — do not dispatch. Rationale: at ~200K opus context, a 10k-line diff plus per-persona instructions plus anti-pattern context risks silent truncation or context-window refusal, which surface as malformed responses and obscure the real failure. Announce: `"Phase 1c: diff size N lines exceeds 1500-line cap for senior panel. Skipping panel; rule-based agents still run."` Revisit the cap in a future iteration with per-file chunking.

**Failure dispositions** (applies AFTER the per-finding rejections above). Treat each case distinctly — do NOT collapse them into one announcement:

1. **transport_error** — subagent dispatch failed before any response arrived (network error, rate limit, API unavailable). On the first occurrence, retry **once** with 30-second backoff; if the second attempt also fails, announce: `"Phase 1c [session:$SESSION_ID]: transport error (<reason>) after 1 retry — falling back to Phase 1b findings only."` Schema-validation failures (below) do NOT retry — those are deterministic.
2. **parse_error** — subagent returned a response that could not be parsed into structured findings at all. Announce: `"Phase 1c [session:$SESSION_ID]: subagent response unparseable (could not extract structured findings). Falling back to Phase 1b findings only."`
3. **all_findings_rejected** — response parsed but every finding was dropped by the schema guard. Announce: `"Phase 1c [session:$SESSION_ID]: all N findings rejected by schema guard (first rejection: <reason>). Falling back to Phase 1b findings only."` Include the first rejection's reason so operators can triage persona drift vs. enum mismatch quickly.
4. **zero_findings_on_nontrivial_diff** — response parsed, guard passed zero findings, AND the reviewed diff exceeds 50 changed lines. Suspicious: likely a prompt / parse / empty-output issue rather than a truly clean PR at Major-feature scope. Announce: `"Phase 1c [session:$SESSION_ID]: subagent returned zero findings on an N-line diff. Treating as failure (possible prompt/parse issue). Falling back to Phase 1b findings only."`

Zero findings on a **trivial** diff (<50 changed lines) is NOT a failure — announce neutrally: `"Phase 1c [session:$SESSION_ID]: 0 judgment findings on an N-line diff (trivial; no panel-blocking concerns found)."`

**Orchestrator wall-clock responsibility:** The Task primitive has no native timeout parameter. The orchestrator MUST enforce a 5-minute wall-clock bound on the Phase 1c dispatch — if no response arrives within 5 minutes, abandon the subagent call and treat it as `transport_error` per case (1) above. This is the authoritative timeout; prose references to "5-minute timeout" elsewhere are shorthand for this mechanism.

This guard is distinct from (and parallel to) Phase 1a's malformed-response guard in `code-review-pipeline.md` — Phase 1a's guard checks section headers, this one checks schema fields.

**Test fixtures:** See `skills/start/references/senior-panel-fixtures.md` for the canonical set of response payloads (well-formed, missing `finding_type`, off-enum `rule`, unparseable, zero-findings on trivial vs. non-trivial diff, mixed valid/invalid, persona-type drift) and the expected guard disposition for each. When changing this guard's behavior, update the fixtures alongside to keep parity.

## Failure handling

All failure paths are specified in the "Phase 1c schema-level guard" section above under "Failure dispositions":

- Transport errors (network, rate limit, API unavailable) → retry once with 30s backoff, then `transport_error`.
- Timeout (>5 min wall-clock, orchestrator-enforced) → `transport_error` per case (1).
- Unparseable response → `parse_error`.
- Response parses but all findings rejected by schema guard → `all_findings_rejected` (with first rejection reason).
- Response parses, zero findings, diff >50 lines → `zero_findings_on_nontrivial_diff`.
- Response parses, zero findings, diff <50 lines → neutral announcement (not a failure).
- Diff >1500 lines → skip dispatch entirely; never reach failure paths.

Every announcement carries the `[session:$SESSION_ID]` correlation token.

## Stack affinity

`stack_affinity: ["*"]` — personas apply to any language/stack. Phase 1c is not filtered by `.feature-flow.yml` stack list.

## How to verify Phase 1c fired

Phase 1c is pipeline-integrated — there is no standalone user-invocation path in v1. To observe it running end-to-end:

1. Start a **Major feature** task: `start: [description]` and select "Major feature" at the scope classification prompt (or let heuristics pick it). Phase 1c does not run at Feature / Small enhancement / Quick fix scope.
2. Let the lifecycle proceed through design → plan → implement until it reaches the **Code Review Pipeline** step.
3. During dispatch, look for the Phase 1b availability announcement: `"Running N report-only agents in parallel (Tier 3 — major feature, ...)"`. If Phase 1c dispatches in the same parallel message, the orchestrator adds a line: `"Phase 1c [session:$SESSION_ID]: senior panel dispatched (3 personas, opus, 5-min deadline)."`
4. If the diff exceeds 1500 changed lines, you'll instead see the skip announcement: `"Phase 1c [session:$SESSION_ID]: diff size N lines exceeds 1500-line cap. Skipping panel..."`
5. If Phase 1c ran and produced findings, the Phase 5 report's `### Senior Panel — Judgment Findings` subsection lists them grouped by persona. If the subsection is absent, either (a) Phase 1c was skipped (scope or diff cap), (b) Phase 1c failed (see failure-disposition announcement upstream in the log), or (c) Phase 1c returned zero valid findings on a trivial diff.
6. For ad-hoc testing of the schema guard without invoking opus, point at `senior-panel-fixtures.md` and mentally walk each F1–F8 payload through the guard rules in "Phase 1c schema-level guard" above.
