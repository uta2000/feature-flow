# Senior Developer Panel Review — Design Document

**Date:** 2026-04-17
**Status:** Draft
**Author:** brainstormed with Claude
**Base branch:** main
**Scope:** Feature (modifies `skills/start/references/code-review-pipeline.md`; adds a new internal panel agent orchestrated like pr-review-toolkit)

## Overview

Add a persona-based "senior developer panel" as **Phase 1c** of the code-review-pipeline — a single orchestrated subagent that runs three judgment-oriented personas (Staff Engineer, SRE, Product Engineer) in parallel with the existing rule-based Phase 1b agents. The panel catches issues the current pipeline misses by design: wrong abstractions, operability risk, and scope creep. It only runs at **Major feature** scope (Tier 3), uses the **opus** model, and feeds structured findings into the existing Phase 2 dedup path so no new fix-application machinery is needed.

## Motivation

The existing pipeline (0 → 1a → 1b → 2 → 3 → 4 → 5) is rule-driven. Every Phase 1b agent's checklist is a list of mechanical predicates — "function ≤30 lines", "inputs validated at system boundaries", "no nesting >3 levels". These catch one class of defect well.

They do not catch:

- **Wrong abstraction** — the code is clean, well-typed, and tested, but the wrong thing was built (e.g., a queue where a lock was needed, a generic system where a specific one was cheaper).
- **Operability risk** — no mechanical rule flags "this will be painful to debug at 3 a.m." or "this log line is missing the correlation ID future-you will need".
- **Scope creep / product fit** — the implementation drifted from what the user asked for, or added incidental complexity nobody requested.

The memory `feedback_self_review_passes.md` (added 2026-04-17) codifies this gap explicitly: *"self-review without frame-switching misses strategic issues; use advisor/code-reviewer when possible."* A persona panel is frame-switching built into the pipeline.

**Scope of this v1 — implementer-side advisor, not a production gate.** The original user ask framed this as "review code changes as a panel of senior developers to approve to push to production." The v1 implementation is narrower: Phase 1c fires during the local code-review step of `start:`, which runs BEFORE PR creation — well before anything approaches production. The panel is an **implementer-side advisor** that surfaces judgment findings for the implementer to address locally; it is NOT a merge-time gate, a deploy-time gate, or a PR-review bot. A future iteration could extend the panel to run on PR open (via a separate hook that posts the findings as PR comments), which would more literally match the "approve to push" framing — but that is out of scope for v1. This framing is important because it sets the right expectation about WHEN the panel's opinion shows up in the lifecycle.

## User Flow

### Step 1 — Scope gate

User runs `start:` on a Major feature. After implementation, lifecycle reaches the Code Review Pipeline step. Scope is Major feature → Tier 3 → panel is eligible.

### Step 2 — Phase 1c dispatch

After Phase 1a commits (or is skipped), the pipeline dispatches **both** Phase 1b agents (parallel rule-based reviewers) and **Phase 1c senior panel** in the same parallel message. Phase 1c is a single `general-purpose` subagent call; the subagent internally orchestrates three personas in one pass (mirrors the pr-review-toolkit pattern).

### Step 3 — Panel returns structured findings

The subagent returns findings in the **same structured format** Phase 1b agents use (`file`, `line`, `rule`, `severity`, `description`, `fix`) plus one new field: `finding_type: rule | architectural | operability | product_fit`. Phase 2 treats the panel output like any other Phase 1b agent during dedup and conflict detection.

### Step 4 — Phase 3 fix behavior splits by finding_type

- `finding_type: rule` → Phase 3 applies the `fix` automatically (existing behavior).
- `finding_type: architectural | operability | product_fit` → Phase 3 **does not auto-apply**. Instead, the finding is surfaced to the user in the Phase 5 report under a new "Human Review Required" section. Rationale: judgment findings often require design-level discussion, not a mechanical patch.

### Step 5 — Phase 5 report includes a panel section

New subsection "Senior Panel — Judgment Findings" groups non-rule findings by persona. User decides whether to address, defer, or reject each.

## Architecture

### Insertion point

```
Phase 0 — Deterministic pre-filter
Phase 1a — pr-review-toolkit pre-pass (sequential, auto-fixes)
Phase 1b — Rule-based report-only agents (parallel)  ┐
Phase 1c — Senior panel subagent (parallel with 1b)  ┘  dispatched in one message
Phase 2 — Conflict detection / dedup
Phase 3 — Single-pass fix (rule findings only; non-rule → report)
Phase 4 — Targeted re-verification
Phase 5 — Report (now includes "Senior Panel" subsection)
```

Phase 1c sits parallel to Phase 1b because the panel reviews the same state (post-Phase-1a committed code) and returns report-only findings. No new ordering constraint is introduced.

### Personas

Three personas, each with a narrow, non-overlapping lens:

| Persona | Lens | Checklist (forced rule names) |
|---------|------|-------------------------------|
| **Staff Engineer** | Abstraction quality, future debt, modularity | `wrong-abstraction`, `leaky-boundary`, `premature-generalization`, `missing-seam`, `overly-coupled` |
| **SRE** | Operability, failure modes, debuggability | `missing-correlation-id`, `silent-retry-loop`, `unbounded-resource`, `unclear-failure-mode`, `missing-timeout` |
| **Product Engineer** | Scope fit, user-visible behavior, simplicity of solution vs. requirement | `scope-creep`, `requirement-drift`, `incidental-complexity`, `missing-user-path`, `behavior-regression-risk` |

The rule enum is **closed**. Phase 2's existing filter ("discard findings without a named rule") enforces this — a persona that invents "consider-refactoring" gets rejected automatically.

### Panel subagent prompt contract

The subagent is dispatched as:

```
Task(
  subagent_type: "general-purpose",
  model: "opus",
  description: "Run senior developer panel review",
  prompt: [persona-panel prompt below]
)
```

Prompt structure (summary; full template lives in `skills/start/references/senior-panel.md` created during implementation):

1. Context block: base branch, HEAD SHA, changed files, acceptance criteria, Phase 0 pre-filter results, anti-patterns and reference examples from Study Existing Patterns.
2. Instruction: "You will run three reviews sequentially — Staff Engineer, SRE, Product Engineer. Each must produce at most 5 findings. Do not duplicate across personas."
3. For each persona: a lens statement, the closed rule enum, and an anchor requirement — "Every finding MUST anchor to a concrete `file:line`, even for architectural concerns. Pick the most representative line of the issue."
4. Output format: the existing structured block, plus `finding_type` and `persona` fields.
5. Hard constraint: "If you cannot name a specific rule from the enum and cannot anchor to a real file:line, DO NOT emit a finding. Emit nothing rather than a vague one."

## Finding Format

Extends the existing Phase 1b format with two fields. Everything else is unchanged, so Phase 2 handles it without modification.

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
    [for non-rule findings: concrete *discussion question* or
     proposed direction, e.g. "Consider extracting X to its own
     module — current coupling blocks independent testing of Y"]
```

Phase 2 dedup keeps the existing agent specificity order. Senior panel findings are ranked **below** security findings and **above** style findings when two agents flag the same line. Rationale: security is hard-constraint; panel is judgment; style is preference.

## Patterns & Constraints

### Error handling

- Panel subagent failure → skip Phase 1c, continue with Phase 1b only. Announce: "Senior panel subagent failed — skipping. Phase 1b findings only." (Mirrors existing Phase 1a failure handling.)
- **Phase 1c malformed-response guard** (new, parallel to existing Phase 1a guard at code-review-pipeline.md:190–191): for each finding returned by the panel subagent, validate (a) all required schema fields are present including `finding_type` and `persona` (when `finding_type != rule`), and (b) `rule` is a member of the persona's closed enum. If the overall response is not parseable or contains zero valid findings on a non-trivial diff (>50 changed lines), treat as subagent failure: announce "senior panel subagent returned a malformed response — findings skipped" and proceed with Phase 1b findings only.
- Timeout: 5 minutes. Opus with 3 personas on a Major feature diff is expected to take 2–4 minutes.

### Types

- Rule enum per persona is a **literal union**, not `string`. Defined once in `skills/start/references/senior-panel.md` and referenced from the pipeline doc.
- `finding_type` is a literal union of `"rule" | "architectural" | "operability" | "product_fit"`.

### Performance

- Tier 3 only. Panel adds ~2–4 minutes to pipeline duration; unacceptable for Small enhancement or Feature scopes.
- Single subagent call (not three separate calls) — keeps context isolation clean and amortizes prompt overhead.
- Personas run sequentially inside the subagent (not parallel), because later personas benefit from seeing earlier personas' findings to avoid duplication.

### Stack-specific

None. Panel is stack-agnostic — its lenses apply to any codebase. `stack_affinity: ["*"]` when registered.

## Scope

**In scope:**

- New Phase 1c in `skills/start/references/code-review-pipeline.md`
- New reference file `skills/start/references/senior-panel.md` with persona prompts and rule enums
- Extension of the Phase 2 dedup section to handle `finding_type` split (includes a new "overlap-with-different-finding-type" rule — see D10)
- Extension of Phase 3 to distinguish rule vs. non-rule findings (auto-apply vs. surface)
- Extension of Phase 5 report template with "Senior Panel — Judgment Findings" subsection, placed between "Fixed (report-only)" and "Remaining (Minor — not blocking)"
- Update to the Phase 1b section of the code-review-pipeline doc to document the parallel Phase 1c dispatch for Major-feature scope (the tier table at line 30–35 stays agent-centric and is unchanged)

**Explicitly out of scope:**

- New agent plugins or marketplace entries. Panel is internal to feature-flow, orchestrated as a single subagent — no plugin registry changes.
- Feature / Small enhancement scopes. Panel is Major-feature-only in v1.
- Automatic application of architectural findings. These are surfaced to the user; the user decides.
- Persona customization by project. Personas are fixed in v1; a future iteration could load from `.feature-flow.yml`.
- Multi-model ensembles (e.g., "also run this through Sonnet for contrast"). Opus-only in v1.
- A standalone `senior-panel-review` skill the user can invoke independently. V1 is pipeline-integrated only.

## Decision Log

- **D1 — Placement:** Phase 1c parallel to 1b, not Phase 2.5 post-dedup. Reason: parallelism wins the 2–4 min latency back. Post-dedup placement was considered but offers no benefit since Phase 2 can dedup across all Phase 1 agents uniformly.
- **D2 — Model:** Opus only. Judgment work is the explicit use case Opus is reserved for per `model-routing.md`. Sonnet judged insufficient for architectural reasoning.
- **D3 — Tier gating:** Major feature only. Smaller scopes rarely have enough surface area for a persona panel to produce non-redundant findings; the latency cost isn't justified.
- **D4 — Closed rule enums:** Each persona has a fixed list of rule names. Enforces non-vagueness at the schema level; Phase 2's existing filter rejects off-enum findings for free.
- **D5 — `finding_type` split:** Rule findings auto-fix as today. Architectural/operability/product findings surface to the user. Reason: auto-patching a "wrong abstraction" finding would produce garbage; these need human judgment.
- **D6 — Single subagent, not three:** Personas are orchestrated inside one opus subagent call (like pr-review-toolkit's internal 6 agents). Keeps context isolation clean and avoids three parallel opus calls.
- **D7 — Personas run sequentially inside the subagent:** Later personas see earlier findings, reducing duplicate reports across lenses.
- **D8 — No plugin registration:** Panel is internal; no `plugin_registry` entry. Simpler deployment, no discovery logic needed.
- **D9 — Stack-agnostic:** `stack_affinity: ["*"]`. Personas apply to any language/stack. No filtering by `.feature-flow.yml` stack list.
- **D10 — Overlap semantics (Phase 2 Step 4):** Two findings at overlapping `[line − 5, line + 5]` ranges do **not** conflict if their `finding_type` values differ. Reason: rule findings and judgment findings are orthogonal concerns — an architectural concern anchored near a rule violation is not the same issue flagged twice, and the existing ±5 window would incorrectly merge them. When `finding_type` matches on both findings, the existing conflict resolution (higher severity wins, then agent specificity) applies unchanged.
- **D11 — Commit message for Phase 3:** Rename `fix: apply code review fixes` to `fix: apply rule-based code review fixes`. Reason: when non-rule findings are present but skipped (surfaced to Phase 5 instead of patched), the current message misleadingly implies the full review was addressed. The new message is accurate regardless of whether non-rule findings exist.

## Pipeline Edits Required

Concrete edits the implementation plan must make to `skills/start/references/code-review-pipeline.md`. Listed here so the plan can turn each into a task with acceptance criteria.

### P2-E1 — Extend Phase 2 Step 1 (Cross-Phase Finding Merge)

At line 183–188, add a third source:

```
- **Phase 1c** senior panel findings (standard structured format,
  with `finding_type` and `persona` fields).
```

Malformed-response guard (new paragraph after line 191): schema-level validation for Phase 1c — see Patterns & Constraints → Error handling.

### P2-E2 — Extend Phase 2 Step 4 (Conflict Detection) with `finding_type` orthogonality rule

At line 201–206, prepend to the overlap check:

> Before computing overlap, compare `finding_type` on both findings. If they differ, the findings do **not** conflict regardless of line proximity — keep both. Only apply the `[line − 5, line + 5]` overlap rule when `finding_type` matches.

### P2-E3 — Phase 3 conditional apply (rule vs. non-rule)

At line 210–227, Phase 3 becomes:

1. Partition the Phase 2 output into `rule_findings` and `judgment_findings` by `finding_type`.
2. For `rule_findings`: current behaviour — sort descending by line number, apply `fix:`, commit as `fix: apply rule-based code review fixes` (per D11).
3. For `judgment_findings`: do **not** edit files. Pass through to Phase 5 unchanged.
4. Branch the "nothing to commit" announcement (line 224):
   - No findings at all → "No review fixes to commit — code was already clean."
   - No rule findings, non-zero judgment findings → "No auto-applicable fixes. N judgment findings from the senior panel require human discussion — see Phase 5 report."

### P2-E4 — Phase 4 clarification note

At the "Maximum 2 total fix-verify iterations" line (line 268), append:

> This cap applies only to rule-based fix-verify loops. Judgment findings from Phase 1c are surfaced once in Phase 5 and do not re-enter the loop.

### P2-E5 — Phase 5 report template

In the report template (line 276–300), add a new section between "Fixed (report-only → single pass)" and "Remaining (Minor — not blocking)":

```
### Senior Panel — Judgment Findings

**Staff Engineer:**
- [file:line] [rule] — [description]
  Proposed direction: [fix content]

**SRE:**
- [file:line] [rule] — [description]
  Proposed direction: [fix content]

**Product Engineer:**
- [file:line] [rule] — [description]
  Proposed direction: [fix content]
```

Section is omitted entirely when Phase 1c did not run (scope < Major feature) or returned zero judgment findings.

### P2-E6 — Phase 1b section: document parallel Phase 1c dispatch

At line 144 (Phase 1b header area), add a note:

> For Major-feature scope (Tier 3), also dispatch the senior panel subagent (Phase 1c) in the same parallel message. See the Phase 1c section below for the subagent contract.

Then add the new **Phase 1c — Senior Developer Panel (Gated, Parallel with 1b)** section immediately after Phase 1b. Contents: scope gate, subagent prompt contract, persona rule enums, output format including `finding_type` and `persona`, failure and timeout handling (all already specified in this design doc's Architecture and Patterns & Constraints sections).

## Rejected Alternatives

### RA1 — "Keep Phase 1c findings in a separate list, feed only Phase 5"

**Alternative:** Phase 1c's findings live in their own collection that bypasses Phase 2 (dedup/conflict) and Phase 3 (apply) entirely, feeding only Phase 5's report.

**Tradeoff:** Would eliminate 4 of the 6 pipeline edits required by the unified-list design (no P2-E1, P2-E2, P2-E3, P2-E4). Simpler mental model: judgment findings never interact with rule findings.

**Why we chose unification instead:** Phase 2 dedup CAN catch legitimate overlap between a judgment finding and a rule finding when both anchor near the same line AND share `finding_type` after normalization. The orthogonality rule (P2-E2) makes the unified design safe: different `finding_type` values never conflict, so the rule-finding pipeline is unaffected by the presence of judgment findings. The cost is 4 extra edit points and 3 conceptual branches (orthogonality, partition, cap-is-rule-only) that every maintainer must hold in mind. On balance the unified design wins because it keeps Phase 2's dedup semantics consistent across all source phases — but the separate-list design remains a reasonable v2 simplification if maintenance cost outweighs the dedup benefit in practice.

### RA2 — "Three parallel opus subagents, one per persona"

**Alternative:** Dispatch three concurrent opus calls (one per persona) instead of a single opus call that orchestrates personas sequentially internally.

**Tradeoff:** Parallel dispatch would cut wall-clock time roughly in half. Each persona call would have its own context window unencumbered by other personas' findings.

**Why we chose single-subagent instead:** Later personas benefit from seeing earlier personas' findings to avoid duplicating work (this IS the tiebreaker mechanism defined in D4/SF#3). With three parallel calls, the orchestrator would have to dedup across persona outputs post-hoc, and there's no persona-level ordering to resolve ties. Sequential-in-single-subagent keeps ordering deterministic. If opus latency becomes a real pain point, switch to parallel + post-dedup in v2.

### RA3 — "Standalone `/senior-panel` skill for ad-hoc review"

**Alternative:** Ship Phase 1c AND a user-invokable skill that runs the same panel against an arbitrary diff outside the `start:` lifecycle.

**Tradeoff:** Users could sanity-check a branch without completing the full feature-flow lifecycle. Handy for "can you panel-review this PR I'm about to push?" moments.

**Why we chose pipeline-integrated only:** Two entry points = two sources of truth for the prompt contract, schema guard, failure handling. The `senior-panel-fixtures.md` would need to guard both invocation paths. v1 scope is "integrate with code-review-pipeline"; the standalone skill is a clean follow-up once the pipeline-integrated version has real usage data.

## Open Questions

- Should the panel also run in `--yolo` mode? Current plan: yes, but panel non-rule findings in YOLO mode are still surfaced (not auto-dismissed) — YOLO should not hide judgment findings from the user.
- Should there be a "panel disagrees with rule-based fix" short-circuit? E.g., if Staff Engineer says "this whole module should not exist" but superpowers:code-reviewer is asking for a 30-line refactor of it. V1: no special handling — both findings surface, user reconciles. Revisit after real usage.
