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

```
Task(
  subagent_type: "general-purpose",
  model: "opus",
  description: "Run senior developer panel review",
  prompt: [persona-panel prompt — see below]
)
```

**Dispatch constraints:**
- Gated to Tier 3 only; do not dispatch for sub-Major-feature scope.
- Dispatched in the same parallel message as Phase 1b agents (not after).
- Single subagent call — personas are orchestrated **internally** and run **sequentially** so later personas can see earlier findings and avoid duplication.
- Model: `opus`. Judgment work is the explicit use case reserved for Opus per `model-routing.md`.
- Timeout: 5 minutes. Expected runtime on a Major-feature diff: 2–4 minutes.

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

If the overall response is not parseable, OR contains zero valid findings on a non-trivial diff (>50 changed lines), treat as subagent failure: announce `"senior panel subagent returned a malformed response — findings skipped"` and proceed with Phase 1b findings only.

This guard is distinct from (and parallel to) Phase 1a's malformed-response guard in `code-review-pipeline.md` — Phase 1a's guard checks section headers, this one checks schema fields.

**Test fixtures:** See `skills/start/references/senior-panel-fixtures.md` for the canonical set of response payloads (well-formed, missing `finding_type`, off-enum `rule`, unparseable, zero-findings on trivial vs. non-trivial diff, mixed valid/invalid, persona-type drift) and the expected guard disposition for each. When changing this guard's behavior, update the fixtures alongside to keep parity.

## Failure handling

- Subagent failure → skip Phase 1c, continue with Phase 1b only. Announce: `"Senior panel subagent failed — skipping. Phase 1b findings only."`
- Timeout (>5 min) → same as subagent failure.
- Malformed response → see schema-level guard above.

## Stack affinity

`stack_affinity: ["*"]` — personas apply to any language/stack. Phase 1c is not filtered by `.feature-flow.yml` stack list.
