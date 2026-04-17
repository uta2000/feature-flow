# Senior Developer Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 1c ("senior developer panel" — staff_eng + sre + product_eng personas) to the feature-flow code-review-pipeline, surfacing judgment findings that rule-based agents miss, without disrupting the existing rule-based Phase 3 auto-apply loop.

**Architecture:** One new reference file (`skills/start/references/senior-panel.md`) defines the persona contract (checklists, finding schema, subagent dispatch). Six anchor edits (P2-E1..P2-E6) to `skills/start/references/code-review-pipeline.md` wire the new phase in: Phase 1c dispatched in parallel with Phase 1b at Major-feature tier only; Phase 2 deduplication is extended with an orthogonality rule so different `finding_type` values never conflict; Phase 3 partitions findings — rule findings auto-apply, judgment findings pass through; Phase 4's 2-iteration cap is clarified as rule-only; Phase 5 grows a "Senior Panel — Judgment Findings" subsection. The feature is spec-only (markdown edits) — no runtime code.

**Tech Stack:** Markdown (two files). Acceptance criteria are grep-based (ripgrep/awk). No executable tests because there is no executable code.

**Source design doc:** `docs/plans/2026-04-17-senior-developer-panel.md` (verified — D1-D11 decision log is authoritative).

**Issue:** #239

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `skills/start/references/senior-panel.md` | Create | Persona rule enums, subagent prompt contract, finding schema (adds `finding_type` + `persona` fields), Task dispatch block, Phase 1c schema-level guard |
| `skills/start/references/code-review-pipeline.md` | Modify (6 anchor edits) | Phase 1b parallel note + new Phase 1c section (P2-E6), Phase 2 Step 1 merge extension (P2-E1), Phase 2 Step 4 orthogonality rule (P2-E2), Phase 3 partition (P2-E3), Phase 4 cap clarification (P2-E4), Phase 5 report subsection (P2-E5) |

**Grep anchors that must hold after all edits (used by Task 8 verify step):**
- `senior-panel.md` referenced ≥1 time in `code-review-pipeline.md`
- `finding_type` appears ≥3 times in `code-review-pipeline.md` (Phase 2 Step 4, Phase 3 partition, Phase 5)
- `## Phase 1c` appears exactly once in `code-review-pipeline.md`
- Tier table at lines 30–35 is unchanged (agent-centric, not finding_type-centric)

---

### Task 1: Create `senior-panel.md` reference file

**Files:**
- Create: `skills/start/references/senior-panel.md`

- [ ] **Step 1: Write `skills/start/references/senior-panel.md`**

```markdown
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
```

- [ ] **Step 2: Verify file is created and passes grep checks**

Run: `test -f skills/start/references/senior-panel.md && echo OK`
Expected: `OK`

Run: `grep -cE "staff_eng|sre|product_eng" skills/start/references/senior-panel.md`
Expected: `≥ 6` (each persona name referenced multiple times)

Run the acceptance-criteria grep commands in the "Acceptance Criteria" section below and confirm each passes.

- [ ] **Step 3: Commit**

```bash
git add skills/start/references/senior-panel.md
git commit -m "feat(code-review-pipeline): add senior-panel.md reference for Phase 1c"
```

**Acceptance Criteria:**
- [ ] File exists: `test -f skills/start/references/senior-panel.md`
- [ ] All 3 persona keys present: `grep -cE "staff_eng|sre|product_eng" skills/start/references/senior-panel.md` returns ≥ 6
- [ ] All 15 rule names present (5 per persona): `grep -cE "wrong-abstraction|leaky-boundary|premature-generalization|missing-seam|overly-coupled|missing-correlation-id|silent-retry-loop|unbounded-resource|unclear-failure-mode|missing-timeout|scope-creep|requirement-drift|incidental-complexity|missing-user-path|behavior-regression-risk" skills/start/references/senior-panel.md` returns ≥ 15
- [ ] Finding schema documents `finding_type` and `persona` fields: `grep -cE "^\\s*finding_type:|^\\s*persona:" skills/start/references/senior-panel.md` returns ≥ 2
- [ ] Subagent dispatch block specifies opus model: `grep -c 'model: "opus"' skills/start/references/senior-panel.md` returns ≥ 1
- [ ] Subagent dispatch block specifies general-purpose type: `grep -c 'subagent_type: "general-purpose"' skills/start/references/senior-panel.md` returns ≥ 1
- [ ] Schema-level guard section present: `grep -c "Phase 1c schema-level guard" skills/start/references/senior-panel.md` returns ≥ 1
- [ ] Closed rule enum concept documented: `grep -c "closed rule enum\|Closed rule enum" skills/start/references/senior-panel.md` returns ≥ 1
- [ ] Major-feature gating documented: `grep -c "Major feature\|Tier 3" skills/start/references/senior-panel.md` returns ≥ 2

---

### Task 2: P2-E6 — Add Phase 1c section + Phase 1b parallel note to code-review-pipeline.md

**Files:**
- Modify: `skills/start/references/code-review-pipeline.md` (insert note after line 146; insert new `## Phase 1c` section after line 177, before `## Phase 2`)

- [ ] **Step 1: Verify acceptance criteria fail on current code**

Run: `grep -c "## Phase 1c" skills/start/references/code-review-pipeline.md`
Expected: `0` (section does not yet exist)

- [ ] **Step 2: Add the Phase 1b parallel-dispatch note**

At the end of the Phase 1b section (after line 177 — the existing "Agent failure handling" line), insert a new paragraph before the blank line that precedes `## Phase 2`:

```markdown
**Phase 1c gated dispatch:** For Major-feature scope (Tier 3) only, dispatch the senior developer panel subagent (Phase 1c) in the **same parallel message** as the Phase 1b agents above — not sequentially, not after. See `skills/start/references/senior-panel.md` for the persona prompt contract, closed rule enums, and finding schema. The panel's findings flow into Phase 2 alongside Phase 1b findings.
```

Use the Edit tool. Match on the existing "Agent failure handling" paragraph to anchor the insertion.

- [ ] **Step 3: Insert the new Phase 1c section before Phase 2**

Insert immediately before the line `## Phase 2: Conflict Detection`:

```markdown
## Phase 1c: Senior Developer Panel (Major Feature only)

**Scope gate:** Dispatched only when the lifecycle scope is **Major feature** (Tier 3). For Feature, Small enhancement, and Quick fix scopes, skip this phase entirely — do not dispatch, do not announce.

**Dispatch:** Phase 1c runs **in parallel** with Phase 1b — both are dispatched in the **same single parallel message**. The panel reviews the same post-Phase-1a committed code Phase 1b reviews, so no new ordering constraint is introduced.

**Subagent contract:** See `skills/start/references/senior-panel.md` for the full prompt template. Summary:

```
Task(
  subagent_type: "general-purpose",
  model: "opus",
  description: "Run senior developer panel review",
  prompt: [persona-panel prompt from senior-panel.md]
)
```

A single opus subagent orchestrates three personas sequentially (Staff Engineer → SRE → Product Engineer). Each persona has a closed rule enum (see `senior-panel.md`). The subagent returns findings in the Phase 1b structured format plus two extra fields: `finding_type` (`rule | architectural | operability | product_fit`) and `persona` (`staff_eng | sre | product_eng`, required when `finding_type != rule`).

**Phase 1c schema-level guard:** Before merging Phase 1c findings into Phase 2, validate each finding against the schema: (a) required fields present including `finding_type` and `persona` (when `finding_type != rule`), (b) `rule` is a member of the persona's closed enum. If the response is not parseable, or contains zero valid findings on a non-trivial diff (>50 changed lines), treat as subagent failure: announce `"senior panel subagent returned a malformed response — findings skipped"` and proceed with Phase 1b findings only. This guard is distinct from — and parallel to — Phase 1a's section-header guard (above at "Malformed subagent response guard").

**Failure handling:** If the panel subagent fails or times out (>5 min), skip Phase 1c and continue with Phase 1b findings only. Announce: `"Senior panel subagent failed — skipping. Phase 1b findings only."`

```

Use the Edit tool. Match on `## Phase 2: Conflict Detection` to anchor the insertion.

- [ ] **Step 4: Run acceptance-criteria grep checks**

Run: `grep -c "## Phase 1c" skills/start/references/code-review-pipeline.md`
Expected: `1`

Run: `grep -c "senior-panel.md" skills/start/references/code-review-pipeline.md`
Expected: `≥ 2` (one in Phase 1b note, one in Phase 1c section)

Run: `awk '/## Phase 1c/,/## Phase 2/' skills/start/references/code-review-pipeline.md | grep -c 'model: "opus"'`
Expected: `≥ 1`

- [ ] **Step 5: Commit**

```bash
git add skills/start/references/code-review-pipeline.md
git commit -m "feat(code-review-pipeline): add Phase 1c senior panel section (P2-E6)"
```

**Acceptance Criteria:**
- [ ] `## Phase 1c` header present exactly once: `grep -c "^## Phase 1c" skills/start/references/code-review-pipeline.md` returns 1
- [ ] Phase 1c section gated to Major feature: `awk '/## Phase 1c/,/## Phase 2/' skills/start/references/code-review-pipeline.md | grep -c "Major feature"` returns ≥ 1
- [ ] Phase 1c references senior-panel.md ≥ 1 time: `awk '/## Phase 1c/,/## Phase 2/' skills/start/references/code-review-pipeline.md | grep -c "senior-panel.md"` returns ≥ 1
- [ ] Phase 1c uses opus model: `awk '/## Phase 1c/,/## Phase 2/' skills/start/references/code-review-pipeline.md | grep -c 'model: "opus"'` returns ≥ 1
- [ ] Phase 1c uses general-purpose subagent type: `awk '/## Phase 1c/,/## Phase 2/' skills/start/references/code-review-pipeline.md | grep -c 'subagent_type: "general-purpose"'` returns ≥ 1
- [ ] Phase 1c schema-level guard documented inline: `awk '/## Phase 1c/,/## Phase 2/' skills/start/references/code-review-pipeline.md | grep -c "schema-level guard"` returns ≥ 1
- [ ] Phase 1b section has parallel-dispatch note referencing Phase 1c: `awk '/## Phase 1b/,/## Phase 1c/' skills/start/references/code-review-pipeline.md | grep -c "Phase 1c"` returns ≥ 1
- [ ] Phase 1b note references senior-panel.md: `awk '/## Phase 1b/,/## Phase 1c/' skills/start/references/code-review-pipeline.md | grep -c "senior-panel.md"` returns ≥ 1
- [ ] Tier table at lines 30–35 is unchanged (agent-centric): `sed -n '30,35p' skills/start/references/code-review-pipeline.md | grep -c "finding_type"` returns 0

---

### Task 3: P2-E1 — Extend Phase 2 Step 1 cross-phase merge with Phase 1c source

**Files:**
- Modify: `skills/start/references/code-review-pipeline.md` Phase 2 Step 1 (lines 183–188 area)

- [ ] **Step 1: Verify acceptance criteria fail on current code**

Run: `awk '/Step 1 — Cross-Phase Finding Merge/,/Malformed subagent response guard/' skills/start/references/code-review-pipeline.md | grep -c "Phase 1c"`
Expected: `0`

- [ ] **Step 2: Edit Phase 2 Step 1 to add Phase 1c as third source**

Use the Edit tool. Find:

```
Collect and merge findings from two sources:
- **Phase 1a** pr-review-toolkit summary (Critical/Important/Minor sections only — Auto-Fixed already committed). These are findings the toolkit identified but did not auto-fix.
- **Phase 1b** report-only agent results. These agents reviewed the code AFTER Phase 1a auto-fixes were committed, so their findings reflect the current state.

Both sources use the same structured format. Merge into a single list before deduplication.
```

Replace with:

```
Collect and merge findings from up to three sources:
- **Phase 1a** pr-review-toolkit summary (Critical/Important/Minor sections only — Auto-Fixed already committed). These are findings the toolkit identified but did not auto-fix.
- **Phase 1b** report-only agent results. These agents reviewed the code AFTER Phase 1a auto-fixes were committed, so their findings reflect the current state.
- **Phase 1c** senior panel findings (Major-feature scope only). Standard structured format plus `finding_type` and `persona` fields — see `skills/start/references/senior-panel.md`.

All sources use the same structured format. Merge into a single list before deduplication. Phase 1c may be absent (sub-Major scope); that is not a merge error.
```

- [ ] **Step 3: Run acceptance-criteria grep checks**

Run: `awk '/Step 1 — Cross-Phase Finding Merge/,/Malformed subagent response guard/' skills/start/references/code-review-pipeline.md | grep -c "Phase 1c"`
Expected: `≥ 1`

Run: `awk '/Step 1 — Cross-Phase Finding Merge/,/Malformed subagent response guard/' skills/start/references/code-review-pipeline.md | grep -cE "Phase 1a|Phase 1b|Phase 1c"`
Expected: `≥ 3`

- [ ] **Step 4: Commit**

```bash
git add skills/start/references/code-review-pipeline.md
git commit -m "feat(code-review-pipeline): merge Phase 1c findings in Phase 2 Step 1 (P2-E1)"
```

**Acceptance Criteria:**
- [ ] Phase 2 Step 1 mentions Phase 1c: `awk '/Step 1 — Cross-Phase Finding Merge/,/Malformed subagent response guard/' skills/start/references/code-review-pipeline.md | grep -c "Phase 1c"` returns ≥ 1
- [ ] Merge section mentions all three sources: `awk '/Step 1 — Cross-Phase Finding Merge/,/Malformed subagent response guard/' skills/start/references/code-review-pipeline.md | grep -cE "Phase 1a|Phase 1b|Phase 1c"` returns ≥ 3
- [ ] Merge note references senior-panel.md: `awk '/Step 1 — Cross-Phase Finding Merge/,/Malformed subagent response guard/' skills/start/references/code-review-pipeline.md | grep -c "senior-panel.md"` returns ≥ 1
- [ ] "up to three sources" wording (graceful skip): `awk '/Step 1 — Cross-Phase Finding Merge/,/Malformed subagent response guard/' skills/start/references/code-review-pipeline.md | grep -c "up to three sources\|may be absent"` returns ≥ 1

---

### Task 4: P2-E2 — Orthogonality rule in Phase 2 Step 4 conflict detection

**Files:**
- Modify: `skills/start/references/code-review-pipeline.md` Phase 2 Step 4 (lines 201–206 area)

- [ ] **Step 1: Verify acceptance criteria fail on current code**

Run: `awk '/Step 4 — Detect conflicts/,/Output:/' skills/start/references/code-review-pipeline.md | grep -c "finding_type"`
Expected: `0`

- [ ] **Step 2: Prepend orthogonality clause to overlap calculation**

Use the Edit tool. Find:

```
**Step 4 — Detect conflicts:**
Group all remaining findings by file path. Within each file, for each pair of findings:
1. Calculate line range overlap: finding A covers lines `[A.line - 5, A.line + 5]`, finding B covers `[B.line - 5, B.line + 5]`
2. If ranges overlap → conflict detected
3. Resolution: keep the higher-severity finding. If same severity, use agent specificity order above.
4. Log skipped findings: "Conflict at [file:line]: [Agent A] finding (severity) kept, [Agent B] finding (severity) skipped — overlapping line range"
```

Replace with:

```
**Step 4 — Detect conflicts:**
Group all remaining findings by file path. Within each file, for each pair of findings:
1. **Orthogonality check (runs first):** Compare `finding_type` on both findings. If they differ, the findings do **not** conflict regardless of line proximity — keep both. Rule findings and judgment findings are orthogonal concerns (an architectural concern anchored near a rule violation is not the same issue flagged twice). Only apply steps 2–4 below when `finding_type` matches on both findings.
2. Calculate line range overlap: finding A covers lines `[A.line - 5, A.line + 5]`, finding B covers `[B.line - 5, B.line + 5]`
3. If ranges overlap → conflict detected
4. Resolution: keep the higher-severity finding. If same severity, use agent specificity order above.
5. Log skipped findings: "Conflict at [file:line]: [Agent A] finding (severity) kept, [Agent B] finding (severity) skipped — overlapping line range"
```

- [ ] **Step 3: Run acceptance-criteria grep checks**

Run: `awk '/Step 4 — Detect conflicts/,/Output:/' skills/start/references/code-review-pipeline.md | grep -c "finding_type"`
Expected: `≥ 2`

Run: `awk '/Step 4 — Detect conflicts/,/Output:/' skills/start/references/code-review-pipeline.md | grep -c "Orthogonality check"`
Expected: `≥ 1`

Verify orthogonality check appears BEFORE the overlap calculation:
Run: `awk '/Step 4 — Detect conflicts/,/Output:/' skills/start/references/code-review-pipeline.md | awk '/Orthogonality check/{f=1} /line range overlap/{if(f) print "PASS"; exit}'`
Expected: `PASS`

- [ ] **Step 4: Commit**

```bash
git add skills/start/references/code-review-pipeline.md
git commit -m "feat(code-review-pipeline): finding_type orthogonality in Phase 2 Step 4 (P2-E2)"
```

**Acceptance Criteria:**
- [ ] Orthogonality clause present in Step 4: `awk '/Step 4 — Detect conflicts/,/Output:/' skills/start/references/code-review-pipeline.md | grep -c "Orthogonality check"` returns ≥ 1
- [ ] Step 4 mentions `finding_type`: `awk '/Step 4 — Detect conflicts/,/Output:/' skills/start/references/code-review-pipeline.md | grep -c "finding_type"` returns ≥ 2
- [ ] Orthogonality check precedes overlap calculation: `awk '/Step 4 — Detect conflicts/,/Output:/' skills/start/references/code-review-pipeline.md | awk '/Orthogonality check/{f=1} /line range overlap/{if(f) print "PASS"; exit}'` returns `PASS`
- [ ] "do not conflict" language present: `awk '/Step 4 — Detect conflicts/,/Output:/' skills/start/references/code-review-pipeline.md | grep -c "do \*\*not\*\* conflict\|do not conflict"` returns ≥ 1

---

### Task 5: P2-E3 — Partition Phase 3 by finding_type, update commit message

**Files:**
- Modify: `skills/start/references/code-review-pipeline.md` Phase 3 section (lines 210–227 area)

- [ ] **Step 1: Verify acceptance criteria fail on current code**

Run: `grep -c "fix: apply code review fixes" skills/start/references/code-review-pipeline.md`
Expected: `≥ 1` (old commit message still present)

Run: `grep -c "fix: apply rule-based code review fixes" skills/start/references/code-review-pipeline.md`
Expected: `0`

Run: `awk '/## Phase 3/,/## Phase 4/' skills/start/references/code-review-pipeline.md | grep -c "Partition\|partition"`
Expected: `0`

- [ ] **Step 2: Rewrite the Phase 3 section**

Use the Edit tool. Find the current Phase 3 body (the text from `Apply all conflict-free Critical and Important findings in a single coordinated pass:` through to the `Otherwise, announce:` paragraph ending). Replace with:

```markdown
Apply all conflict-free Critical and Important findings in a single coordinated pass. Phase 3 partitions findings by `finding_type`:

**Partition step (runs first):**
- `rule_findings` = findings with `finding_type == "rule"` (or findings with no `finding_type` field — i.e., findings from Phase 1a/1b, which are implicitly rule findings).
- `judgment_findings` = findings with `finding_type` in `{architectural, operability, product_fit}`. These come from Phase 1c.

**For `rule_findings` (current behavior):**

1. Sort findings by file path, then by line number (descending — apply bottom-up to avoid line number shifts)
2. For each finding, apply the concrete `fix:` code change
3. After all fixes applied, commit as a single commit:

```bash
git add -A
git commit -m "fix: apply rule-based code review fixes"
```

If `git commit` fails (non-zero exit): stop. Announce: "Phase 3 commit failed: [error]. Manual intervention required — do not proceed to Phase 4 until resolved."

**For `judgment_findings`:**

Do **not** edit files. Do **not** commit. Pass through to Phase 5 unchanged. These findings appear in the "Senior Panel — Judgment Findings" subsection of the Phase 5 report for the user to review, discuss, defer, or address manually.

**Empty-branch announcements (choose exactly one):**

- If both `rule_findings` and `judgment_findings` are empty → "No review fixes to commit — code was already clean."
- If `rule_findings` is empty but `judgment_findings` is non-empty → "No auto-applicable fixes. N judgment findings from the senior panel require human discussion — see Phase 5 report."
- Otherwise → "Review fixes committed as single commit (N Critical, M Important findings addressed). K judgment findings passed through to Phase 5." (Omit the trailing sentence when `judgment_findings` is empty.)
```

- [ ] **Step 3: Run acceptance-criteria grep checks**

Run: `grep -c "fix: apply rule-based code review fixes" skills/start/references/code-review-pipeline.md`
Expected: `1`

Run: `grep -c '"fix: apply code review fixes"' skills/start/references/code-review-pipeline.md`
Expected: `0` (old message removed)

Run: `awk '/## Phase 3/,/## Phase 4/' skills/start/references/code-review-pipeline.md | grep -cE "rule_findings|judgment_findings"`
Expected: `≥ 4`

Run: `grep -c "No auto-applicable fixes" skills/start/references/code-review-pipeline.md`
Expected: `≥ 1`

- [ ] **Step 4: Commit**

```bash
git add skills/start/references/code-review-pipeline.md
git commit -m "feat(code-review-pipeline): partition Phase 3 by finding_type (P2-E3)"
```

**Acceptance Criteria:**
- [ ] Partition step present: `awk '/## Phase 3/,/## Phase 4/' skills/start/references/code-review-pipeline.md | grep -c "Partition step\|partition"` returns ≥ 1
- [ ] Both partitions named: `awk '/## Phase 3/,/## Phase 4/' skills/start/references/code-review-pipeline.md | grep -cE "rule_findings|judgment_findings"` returns ≥ 4
- [ ] Commit message updated to `fix: apply rule-based code review fixes`: `grep -c '"fix: apply rule-based code review fixes"\|fix: apply rule-based code review fixes' skills/start/references/code-review-pipeline.md` returns ≥ 1
- [ ] Old commit message removed: `grep -c '"fix: apply code review fixes"' skills/start/references/code-review-pipeline.md` returns 0
- [ ] Judgment-only empty branch present: `grep -c "No auto-applicable fixes" skills/start/references/code-review-pipeline.md` returns ≥ 1
- [ ] "require human discussion" phrasing present: `grep -c "require human discussion" skills/start/references/code-review-pipeline.md` returns ≥ 1
- [ ] "code was already clean" (fully-clean branch) preserved: `grep -c "code was already clean" skills/start/references/code-review-pipeline.md` returns ≥ 1
- [ ] Judgment findings do NOT auto-apply language present: `awk '/## Phase 3/,/## Phase 4/' skills/start/references/code-review-pipeline.md | grep -c 'Do \*\*not\*\* edit files\|not auto-apply\|pass through'` returns ≥ 1

---

### Task 6: P2-E4 — Clarify 2-iteration cap scope at line 268

**Files:**
- Modify: `skills/start/references/code-review-pipeline.md` Phase 4 cap note (line 268 area)

- [ ] **Step 1: Verify acceptance criteria fail on current code**

Run: `grep -c "applies only to rule-based fix-verify loops" skills/start/references/code-review-pipeline.md`
Expected: `0`

- [ ] **Step 2: Append clarification to the cap note**

Use the Edit tool. Find the existing cap sentence:

```
**Maximum 2 total fix-verify iterations** after Phase 3 (targeted re-verify → optional 1 additional pass). Stop after 2 iterations — report remaining issues for manual resolution.
```

Replace with:

```
**Maximum 2 total fix-verify iterations** after Phase 3 (targeted re-verify → optional 1 additional pass). Stop after 2 iterations — report remaining issues for manual resolution. This cap applies only to rule-based fix-verify loops. Judgment findings from Phase 1c are surfaced once in Phase 5 and do not re-enter the loop.
```

- [ ] **Step 3: Run acceptance-criteria grep checks**

Run: `grep -c "applies only to rule-based fix-verify loops" skills/start/references/code-review-pipeline.md`
Expected: `1`

Run: `grep -c "do not re-enter the loop" skills/start/references/code-review-pipeline.md`
Expected: `1`

- [ ] **Step 4: Commit**

```bash
git add skills/start/references/code-review-pipeline.md
git commit -m "feat(code-review-pipeline): clarify 2-iter cap is rule-only (P2-E4)"
```

**Acceptance Criteria:**
- [ ] Cap clarification appended: `grep -c "applies only to rule-based fix-verify loops" skills/start/references/code-review-pipeline.md` returns 1
- [ ] Judgment-findings loop exclusion stated: `grep -c "surfaced once in Phase 5 and do not re-enter the loop\|do not re-enter the loop" skills/start/references/code-review-pipeline.md` returns 1
- [ ] Appended to the existing cap sentence (same paragraph): `grep -B 1 "applies only to rule-based fix-verify loops" skills/start/references/code-review-pipeline.md | grep -c "Maximum 2 total fix-verify iterations"` returns 1

---

### Task 7: P2-E5 — Add "Senior Panel — Judgment Findings" subsection to Phase 5 report

**Files:**
- Modify: `skills/start/references/code-review-pipeline.md` Phase 5 report template (lines 276–300 area)

- [ ] **Step 1: Verify acceptance criteria fail on current code**

Run: `grep -c "Senior Panel — Judgment Findings" skills/start/references/code-review-pipeline.md`
Expected: `0`

- [ ] **Step 2: Insert subsection between "Fixed (report-only → single pass)" and "Remaining (Minor — not blocking)"**

Use the Edit tool. Find:

```
### Fixed (report-only → single pass)
- [severity] [file:line] [what was fixed]

### Conflicts Resolved
```

Replace with:

```
### Fixed (report-only → single pass)
- [severity] [file:line] [what was fixed]

### Senior Panel — Judgment Findings

*Section omitted entirely when Phase 1c did not run (scope < Major feature) or returned zero judgment findings.*

**Staff Engineer:**
- [file:line] [rule] — [description]
  Proposed direction: [fix content]

**SRE:**
- [file:line] [rule] — [description]
  Proposed direction: [fix content]

**Product Engineer:**
- [file:line] [rule] — [description]
  Proposed direction: [fix content]

### Conflicts Resolved
```

- [ ] **Step 3: Run acceptance-criteria grep checks**

Run: `grep -c "### Senior Panel — Judgment Findings" skills/start/references/code-review-pipeline.md`
Expected: `1`

Verify section placement (between "Fixed (report-only" and "Conflicts Resolved"):
Run:
```bash
awk '
/### Fixed \(report-only/ {f=1; next}
/### Senior Panel — Judgment Findings/ {if (f==1) f=2; else f=-1; next}
/### Conflicts Resolved/ {if (f==2) print "PASS"; else print "FAIL (f="f")"; exit}
' skills/start/references/code-review-pipeline.md
```
Expected: `PASS`

Run: `awk '/### Senior Panel — Judgment Findings/,/### Conflicts Resolved/' skills/start/references/code-review-pipeline.md | grep -cE "Staff Engineer|SRE|Product Engineer"`
Expected: `≥ 3`

- [ ] **Step 4: Commit**

```bash
git add skills/start/references/code-review-pipeline.md
git commit -m "feat(code-review-pipeline): add Senior Panel subsection to Phase 5 (P2-E5)"
```

**Acceptance Criteria:**
- [ ] Subsection header exists exactly once: `grep -c "### Senior Panel — Judgment Findings" skills/start/references/code-review-pipeline.md` returns 1
- [ ] All three personas listed: `awk '/### Senior Panel — Judgment Findings/,/### Conflicts Resolved/' skills/start/references/code-review-pipeline.md | grep -cE "\\*\\*Staff Engineer:\\*\\*|\\*\\*SRE:\\*\\*|\\*\\*Product Engineer:\\*\\*"` returns ≥ 3
- [ ] Proposed direction formatting documented: `awk '/### Senior Panel — Judgment Findings/,/### Conflicts Resolved/' skills/start/references/code-review-pipeline.md | grep -c "Proposed direction:"` returns ≥ 3
- [ ] Omission clause for sub-Major scope present: `awk '/### Senior Panel — Judgment Findings/,/### Conflicts Resolved/' skills/start/references/code-review-pipeline.md | grep -c "Section omitted\|omitted entirely"` returns ≥ 1
- [ ] Subsection placement is after "Fixed (report-only" and before "Conflicts Resolved": the awk block in Step 3 returns `PASS`

---

### Task 8: Internal consistency verification + commit finalization

**Files:**
- Read-only review: `skills/start/references/code-review-pipeline.md` and `skills/start/references/senior-panel.md`

- [ ] **Step 1: Read the final code-review-pipeline.md end-to-end**

Run: `wc -l skills/start/references/code-review-pipeline.md && wc -l skills/start/references/senior-panel.md`
Record line counts for the completion note.

Read the entire file. Confirm:
- The document flows naturally from Phase 0 through Phase 5.
- Phase 1c is referenced consistently in Phase 1b (parallel note), Phase 2 Step 1 (merge), Phase 2 Step 4 (orthogonality), Phase 3 (partition), Phase 4 (cap clarification), Phase 5 (report subsection).
- No orphan references to "senior panel" or "Phase 1c" without a corresponding anchor.
- Tier table at lines 30–35 is unchanged (tier gating stays agent-centric).

- [ ] **Step 2: Run global consistency grep checks**

Run: `grep -c "Phase 1c\|senior-panel\|Senior Panel" skills/start/references/code-review-pipeline.md`
Expected: `≥ 8` (Phase 1b note, Phase 1c section, Phase 2 Step 1, Phase 2 Step 4 via finding_type, Phase 3 partition, Phase 4 cap, Phase 5 subsection — plus reference file mentions)

Run: `grep -c "finding_type" skills/start/references/code-review-pipeline.md`
Expected: `≥ 3` (Phase 2 Step 1, Phase 2 Step 4, Phase 3 partition)

Run: `sed -n '30,35p' skills/start/references/code-review-pipeline.md > /tmp/tier-table-after.txt && diff <(git show HEAD~7:skills/start/references/code-review-pipeline.md 2>/dev/null | sed -n '30,35p') /tmp/tier-table-after.txt`

(The diff should be empty if the tier table is unchanged. If the reference SHA cannot be resolved, skip diff and run the simpler check:)

Run: `sed -n '30,35p' skills/start/references/code-review-pipeline.md | grep -cE "finding_type|senior"`
Expected: `0` (no finding_type or senior references in the tier table).

- [ ] **Step 3: Verify no TODO/TBD markers were left behind**

Run: `grep -cE "TODO|TBD|FIXME|XXX" skills/start/references/senior-panel.md skills/start/references/code-review-pipeline.md`
Expected: `0`

- [ ] **Step 4: Document-only sanity check — both files are valid markdown**

Run: `npx --yes markdownlint-cli2 skills/start/references/senior-panel.md skills/start/references/code-review-pipeline.md 2>&1 | tee /tmp/mdl.out; echo "exit=$?"`
Expected: exit code 0 OR 1 (1 is acceptable — style warnings, not broken markdown). If exit ≥ 2, investigate.

(If `markdownlint-cli2` is unavailable in the environment, skip this step — document with a comment: "markdownlint unavailable; manual review confirmed valid markdown.")

- [ ] **Step 5: Commit if anything changed, otherwise note completion**

If Step 1 or 4 surfaced issues and required fixups:

```bash
git add skills/start/references/code-review-pipeline.md skills/start/references/senior-panel.md
git commit -m "fix(code-review-pipeline): post-consistency-check adjustments"
```

Otherwise skip the commit and announce: "Internal consistency verification passed — no adjustments required."

**Acceptance Criteria:**
- [ ] Phase 1c referenced in ≥ 5 distinct pipeline sections: `grep -c "Phase 1c\|senior-panel\|Senior Panel" skills/start/references/code-review-pipeline.md` returns ≥ 8
- [ ] `finding_type` appears in ≥ 3 pipeline phases: `grep -c "finding_type" skills/start/references/code-review-pipeline.md` returns ≥ 3
- [ ] Tier table at lines 30–35 has no finding_type/senior references: `sed -n '30,35p' skills/start/references/code-review-pipeline.md | grep -cE "finding_type|senior"` returns 0
- [ ] No leftover TODO/TBD/FIXME markers: `grep -cE "TODO|TBD|FIXME|XXX" skills/start/references/senior-panel.md skills/start/references/code-review-pipeline.md` returns 0
- [ ] `senior-panel.md` still exists: `test -f skills/start/references/senior-panel.md`
- [ ] Phase order preserved (Phase 1a → 1b → 1c → 2 → 3 → 4 → 5): `grep -nE "^## Phase [0-9]+[abc]?" skills/start/references/code-review-pipeline.md | awk -F: '{print $1}' | sort -nc && echo "ORDERED"` returns `ORDERED`

---

## Summary

| Task | Anchor | What it produces |
|------|--------|-------------------|
| 1 | new file | `skills/start/references/senior-panel.md` with persona rule enums, subagent contract, finding schema, schema-level guard |
| 2 | P2-E6 | `## Phase 1c` section in code-review-pipeline.md + Phase 1b parallel-dispatch note |
| 3 | P2-E1 | Phase 2 Step 1 merges Phase 1c findings |
| 4 | P2-E2 | Phase 2 Step 4 orthogonality rule (different `finding_type` → no conflict) |
| 5 | P2-E3 | Phase 3 partition + updated commit message + judgment-only empty branch |
| 6 | P2-E4 | Phase 4 cap clarification (rule-only) |
| 7 | P2-E5 | Phase 5 "Senior Panel — Judgment Findings" subsection |
| 8 | verify | Global consistency grep checks pass |

**Expected commit count:** 7 (one per task, except Task 8 which may not produce a commit).

**Post-plan steps (handled by lifecycle orchestrator, not this plan):**
- Self-review
- Code review pipeline
- CHANGELOG entry
- Final verification
- PR
