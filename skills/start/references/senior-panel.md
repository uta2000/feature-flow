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

Phase 1c findings use the Phase 1b structured format plus two additional fields (`finding_type`, `persona`). Everything else is identical, so Phase 2 handles the output without branching:

```
- file: [exact file path]
  line: [line number]
  rule: [name from the persona's closed enum]
  severity: critical | important | minor
  finding_type: rule | architectural | operability | product_fit
  persona: staff_eng | sre | product_eng    # required when finding_type != rule
  description: [what's wrong and why]
  fix: |
    [for rule findings: concrete code change]
    [for non-rule findings: concrete discussion question or
     proposed direction, e.g. "Consider extracting X to its own
     module — current coupling blocks independent testing of Y"]
```

`finding_type` mapping by persona:
- `staff_eng` → `architectural`
- `sre` → `operability`
- `product_eng` → `product_fit`

A persona MAY emit `finding_type: rule` if it identifies a genuine rule-based defect outside its lens; this is discouraged but allowed.

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
2. **Orchestration instruction:** "You will run three reviews sequentially — Staff Engineer, then SRE, then Product Engineer. Each produces at most 5 findings. Do not duplicate across personas; a later persona that sees a finding already covered by an earlier persona must skip it."
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

## Failure handling

- Subagent failure → skip Phase 1c, continue with Phase 1b only. Announce: `"Senior panel subagent failed — skipping. Phase 1b findings only."`
- Timeout (>5 min) → same as subagent failure.
- Malformed response → see schema-level guard above.

## Stack affinity

`stack_affinity: ["*"]` — personas apply to any language/stack. Phase 1c is not filtered by `.feature-flow.yml` stack list.
