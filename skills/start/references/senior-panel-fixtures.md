# Senior Panel — Test Fixtures

Reference fixtures for testing the Phase 1c schema-level guard defined in `senior-panel.md`. Each fixture represents one canonical class of subagent response. The guard MUST behave as noted in the "Expected disposition" for each.

Fixture IDs are stable. If you add new edge cases, append — do not renumber.

See `senior-panel.md` → "Phase 1c schema-level guard" for the validation rules this exercises.

## Fixture F1 — Well-formed response (happy path)

Subagent returned three findings, all pass the guard. All should flow through to Phase 2 merge unchanged.

```yaml
- file: src/queue.ts
  line: 42
  rule: wrong-abstraction
  severity: important
  finding_type: architectural
  persona: staff_eng
  description: FIFO queue used where a mutex would suffice.
  fix: |
    Consider replacing Queue with Mutex.
- file: src/retry.ts
  line: 18
  rule: missing-timeout
  severity: critical
  finding_type: operability
  persona: sre
  description: Outbound HTTP call has no timeout; partial network outage will hang the worker pool.
  fix: |
    Add a 10s timeout with explicit error handling.
- file: src/api/users.ts
  line: 203
  rule: scope-creep
  severity: minor
  finding_type: product_fit
  persona: product_eng
  description: Endpoint adds an audit trail the ticket did not request.
  fix: |
    Move audit-trail code to a separate PR or remove.
```

**Expected disposition:** 3/3 findings accepted. Announce: `"Phase 1c: 3 findings accepted (staff_eng: 1, sre: 1, product_eng: 1)."`

## Fixture F2 — Missing `finding_type` field

Finding is otherwise well-formed but omits `finding_type`. Guard MUST reject.

```yaml
- file: src/queue.ts
  line: 42
  rule: wrong-abstraction
  severity: important
  persona: staff_eng
  description: FIFO queue used where a mutex would suffice.
  fix: |
    Consider replacing Queue with Mutex.
```

**Expected disposition:** 0/1 findings accepted. Reason: missing `finding_type`. Announce per the "all_findings_rejected" failure case: `"Phase 1c: all 1 findings rejected by schema guard (first rejection: missing finding_type). Falling back to Phase 1b findings only."`

## Fixture F3 — Off-enum `rule` value

Finding has all required fields but `rule: consider-refactoring` is not a member of the `staff_eng` persona's closed enum. Guard MUST reject.

```yaml
- file: src/queue.ts
  line: 42
  rule: consider-refactoring
  severity: important
  finding_type: architectural
  persona: staff_eng
  description: This module could be cleaner.
  fix: |
    Refactor.
```

**Expected disposition:** 0/1 findings accepted. Reason: `rule` value `consider-refactoring` is not in `staff_eng` enum `{wrong-abstraction, leaky-boundary, premature-generalization, missing-seam, overly-coupled}`. Announce the same "all_findings_rejected" failure case as F2, citing the off-enum rule.

## Fixture F4 — Unparseable response

Subagent returned text that is not valid YAML-ish findings at all. Guard cannot extract any findings from it.

```
I reviewed the diff and found several concerns around the queue
abstraction. The code is generally fine but could use some thought.
Here are my observations: first, the queue...
```

**Expected disposition:** 0 findings. Announce per the "parse_error" failure case: `"Phase 1c: subagent response unparseable (could not extract structured findings). Falling back to Phase 1b findings only."`

## Fixture F5 — Valid parse, zero findings on non-trivial diff

Subagent returned a valid (empty) findings list against a 200-line diff (>50-line threshold). This is suspicious: either the panel genuinely found nothing (possible but unlikely at Major-feature scope) or it silently bailed. Guard treats this conservatively as failure per the non-trivial-diff rule.

```yaml
[]
```

**Expected disposition:** 0 findings, treated as failure. Announce per the "zero_findings_on_nontrivial_diff" failure case: `"Phase 1c: subagent returned zero findings on a 200-line diff. Treating as failure (possible prompt/parse issue). Falling back to Phase 1b findings only."`

## Fixture F6 — Valid parse, zero findings on trivial diff

Subagent returned a valid (empty) findings list against a 30-line diff (<50-line threshold). Not treated as failure — genuinely clean output is plausible on small diffs.

```yaml
[]
```

**Expected disposition:** 0 findings, NOT a failure. Announce: `"Phase 1c: 0 judgment findings on a 30-line diff (trivial; no panel-blocking concerns found)."`

## Fixture F7 — Mixed valid + invalid findings

Two findings returned; one passes, one fails the guard. Guard accepts the valid one and drops the invalid one — this is NOT a total failure.

```yaml
- file: src/queue.ts
  line: 42
  rule: wrong-abstraction
  severity: important
  finding_type: architectural
  persona: staff_eng
  description: Valid finding.
  fix: |
    Do X.
- file: src/retry.ts
  line: 18
  rule: made-up-rule
  severity: minor
  finding_type: operability
  persona: sre
  description: Off-enum rule.
  fix: |
    Do Y.
```

**Expected disposition:** 1/2 findings accepted (the staff_eng one). Announce: `"Phase 1c: 1/2 findings accepted (1 rejected: made-up-rule not in sre enum). Proceeding with accepted findings."`

## Fixture F8 — Persona mismatch (finding_type doesn't align with persona)

Staff-engineer persona emits a finding with `finding_type: operability` — which should be SRE's lens. This is not a schema violation per the strict guard rules (both field values are valid enum members), but it's a soft indicator of persona drift. Guard accepts; surface as a warning in Phase 5 for manual review of whether the orchestration instruction needs tightening.

```yaml
- file: src/queue.ts
  line: 42
  rule: wrong-abstraction
  severity: important
  finding_type: operability
  persona: staff_eng
  description: SRE-lens finding under Staff Eng persona.
  fix: |
    ...
```

**Expected disposition:** 1/1 finding accepted (soft warning). The guard does NOT reject based on the finding_type↔persona mapping hint in `senior-panel.md` — that mapping is a convention, not a hard rule (see "A persona MAY emit..." in the Finding schema section).
