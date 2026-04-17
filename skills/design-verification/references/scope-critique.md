# Scope Critique — Expanded Prompt Text and Reference

This file is loaded by the `### Step 4.5: Scope critique` step in `SKILL.md`. It provides the full prompt text for each of the five strategic-shape questions plus a bias-resistance checklist to run before scoring findings.

---

## Bias-Resistance Checklist

Run these before writing any finding to reduce systematic reviewer bias:

1. **Anchoring** — Are you anchoring on the author's framing? Re-read the problem statement from scratch. Would you define the problem the same way?
2. **Completeness bias** — Are you tempted to approve because the design is thorough? Thoroughness ≠ correctness of scope. A detailed plan for the wrong thing is still the wrong thing.
3. **Scope-preservation** — Are you conserving the author's scope to avoid conflict? Your job is to find the 20% cut that delivers 80% of the value, not to validate the design as written.
4. **Stopping at first fix** — If you find one strategic issue, keep going. Early findings do not mean the rest is clean.
5. **Technical-lens tunnel vision** — Strategic issues are not schema conflicts or type errors. Switch lenses: think like a PM, a time-constrained engineer, and a first-time user.

---

## The Five Strategic-Shape Questions

### Q1: Should this exist in its current shape?

**Prompt text:**
Restate the problem this design solves — in your own words, without looking at the Summary section. Then compare your restatement to the author's. If they diverge, the problem definition may be under-examined.

Ask:
- Is the problem real and current, or speculative ("users might want...")?
- Does the design solve the problem as you restated it, or a narrower/broader version?
- Would a collaborator six months from now agree the problem is still live?

**Red flags:**
- Design justifies itself by referencing a future capability not yet available
- The stated problem is the absence of a specific solution (not a user-observable pain point)
- The problem appears in only one post or issue from a single contributor

---

### Q2: Could it ship smaller?

**Prompt text:**
List every distinct deliverable in the design (files, endpoints, hooks, config keys, new skills, reference files, etc.). For each declared dependency between deliverables, check `exploration_results.schema`, `exploration_results.pipeline`, and `exploration_results.ui` first for file-level evidence — the harness every other Step 4 batch uses. Only open the referenced file directly if the dependency's domain is not covered by an existing exploration agent. Do not trust the description alone.

Ask:
- Which deliverables have no real dependency on the others and could ship as separate PRs?
- For each declared dependency, what line/function in the referenced file (or in `exploration_results`) creates the dependency?
- If the design ships as separate pieces, does each piece have standalone value?

**Red flags:**
- Dependency is stated but no file-level evidence exists when you inspect the referenced files
- A "Phase 1" exists that only makes sense if Phase 2 ships
- More than 3 ACs reference infrastructure created by other, not-yet-merged issues

---

### Q3: Is there a simpler version?

**Prompt text:**
For each significant mechanism in the design (new hook, new skill, new config key, new agent, new data model, etc.), ask: what is the simplest artifact that captures most of the value?

Candidate simpler forms, in ascending cost order:
1. Delete the thing (does removing it eliminate the problem or just make it someone else's?)
2. A plain documentation note in an existing SKILL.md or reference file
3. A config flag or hint (one line in a YAML) with no new code
4. A soft in-skill hint (a bullet point in an existing skill's process)
5. A new reference file (no executable code, no config schema changes)
6. The full design

**Red flags:**
- The design is at cost-level 6 but the value is captured at cost-level 2 or 3
- New state-tracking machinery exists to detect a signal that could instead be proxied by a simpler observable
- The design ships a full new skill when a new section in an existing skill would do

---

### Q4: Observability sanity

**Prompt text:**
List every external capability the design gates on (e.g., advisor invocations, model-version detection, third-party API availability, LLM output format stability). For each:
1. Can this capability be observed from hooks, skills, or APIs available in this repo?
2. Is the capability GA, or is it beta/experimental?
3. If unobservable: is there a documented proxy signal the design could use instead?

**Red flags:**
- Design counts or measures something that hooks/skills cannot observe (e.g., advisor call frequency from within a session)
- Design gates behavior on a capability marked beta that could change or be removed
- No observable proxy is proposed for an unobservable signal
- Design includes test coverage for a behavior that cannot be end-to-end tested (hooks cannot be invoked in unit test harnesses)

---

### Q5: Config surface review

**Prompt text:**
List every new configuration key the design introduces (`.feature-flow.yml`, `settings.json`, env vars, YAML keys, etc.). For each:
1. Who would realistically flip this from its default?
2. How often?
3. Does the variance it controls need to be user-configurable, or is the default the only sane value?

**Red flags:**
- A key exists to enable/disable a feature that everyone should always have enabled (hardcode it)
- Multiple keys control independent dimensions of the same feature (collapse to one key + documented defaults)
- A key is introduced "for power users" with no documented power-user scenario
- Config keys for a beta/experimental feature that may not ship in its current form

---

## Output Format

After running all five questions, append a `### Scope critique findings` block to the design-verification report:

```
### Scope critique findings

| # | Question | Status | Finding |
|---|----------|--------|---------|
| Q1 | Should this exist? | PASS / WARNING / BLOCKER | [finding] |
| Q2 | Could it ship smaller? | PASS / WARNING / BLOCKER | [finding] |
| Q3 | Simpler version? | PASS / WARNING / BLOCKER | [finding] |
| Q4 | Observability | PASS / WARNING / BLOCKER | [finding] |
| Q5 | Config surface | PASS / WARNING / BLOCKER | [finding] |
```

**Severity rules:**
- **BLOCKER** — An unresolved strategic issue that, if ignored, will cause wasted implementation work or a design that cannot be end-to-end tested
- **WARNING** — A strategic concern that could be addressed now or noted as a known trade-off
- **PASS** — No issue found

If any row is BLOCKER, add the finding to the report's top-level `### Blockers` list with the label `[Scope critique Q<N>]` (where `<N>` is the question number). The promotion itself is owned by the Step 4 Consolidation call-out in `SKILL.md`.
