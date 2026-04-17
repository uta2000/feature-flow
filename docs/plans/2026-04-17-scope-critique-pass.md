# Scope Critique Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `## Scope critique` section to `skills/design-verification/SKILL.md` (and a supporting reference file) that runs five strategic-shape questions after the existing compatibility check, catching oversized scope, phantom dependencies, and unobservable capability bets before a design reaches `create-issue`.

**Architecture:** Pure markdown edits — one new top-level section in SKILL.md, one new reference file, zero JS/config/hook changes. The scope-critique pass runs as Step 4.5 (between the existing verification-batch dispatch and Step 5 report output), so Claude's working memory already contains codebase context when strategic questions run.

**Tech Stack:** Markdown, grep (AC verification)

---

## Background: The 6 Strategic Issues from Issue #236

Holstein13's post-creation review of #236 surfaced these six issues (verbatim summary). The AC-5 sanity task must surface ≥3 of these:

1. **Ship smaller** — Change 2 (soft hints) and Change 3 (settings nudge) have no real dependency on #235; they could land today as standalone PRs.
2. **Defer unobservable machinery** — Change 1 builds state-tracking machinery (`edits_since_advisor_suggestion` counter, tier gating) around advisor, a capability hooks cannot observe at runtime.
3. **Wrong trigger signal** — Tier-2 gating on edit count is a poor proxy for "stuck"; re-fire of the stuck signal is a stronger signal.
4. **Config bloat** — Three new `.feature-flow.yml` keys for a discretionary beta feature; one key + env-var overrides would suffice.
5. **README placement** — Beta setup instructions in the root README will confuse users who can't enable advisor; belongs in `docs/advisor.md`.
6. **ACs not dependency-labeled** — Multiple ACs reference #235 infra; blocking dependency is invisible in the verification plan.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `skills/design-verification/SKILL.md` | Add `## Scope critique` top-level section after `## Process`; add call-out at end of Step 4 dispatch instructions |
| Create | `skills/design-verification/references/scope-critique.md` | Expanded prompt text, red-flag list, bias-resistance checklist |

---

### Task 1: Confirm insertion point and verify AC-1 fails (red phase)

**Files:**
- Read: `skills/design-verification/SKILL.md`

- [ ] **Step 1: Run AC-1 grep — confirm it returns 0 (red)**

```bash
grep -c "^## Scope critique" /Users/weee/Dev/feature-flow/skills/design-verification/SKILL.md
```

Expected output: `0`

- [ ] **Step 2: Run AC-2 grep — confirm it returns 0 (red)**

```bash
grep -c "Should this exist\|Could it ship smaller\|simpler version\|Observability\|Config surface" /Users/weee/Dev/feature-flow/skills/design-verification/SKILL.md
```

Expected output: `0`

- [ ] **Step 3: Confirm references directory exists and scope-critique.md does not**

```bash
ls /Users/weee/Dev/feature-flow/skills/design-verification/references/
```

Expected: no `scope-critique.md` listed.

- [ ] **Step 4: Confirm existing section anchors are intact (baseline for AC-4)**

```bash
grep -c "^## Process\|^## Verification Depth\|^## Quality Rules\|^## Additional Resources\|^### Step 1:\|^### Step 2:\|^### Step 3:\|^### Step 4:\|^### Step 5:\|^### Step 6:\|^### Step 7:" /Users/weee/Dev/feature-flow/skills/design-verification/SKILL.md
```

Expected output: `11` (one match per anchor). Record this number — must match after edits.

---

### Task 2: Create `skills/design-verification/references/scope-critique.md`

**Files:**
- Create: `skills/design-verification/references/scope-critique.md`

- [ ] **Step 1: Write the reference file**

Create `/Users/weee/Dev/feature-flow/skills/design-verification/references/scope-critique.md` with the following content:

```markdown
# Scope Critique — Expanded Prompt Text and Reference

This file is loaded by the `## Scope critique` section in `SKILL.md`. It provides the full prompt text for each of the five strategic-shape questions plus a bias-resistance checklist to run before scoring findings.

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
List every distinct deliverable in the design (files, endpoints, hooks, config keys, new skills, reference files, etc.). For each declared dependency between deliverables, open the referenced file and verify the dependency is real — do not trust the description.

Ask:
- Which deliverables have no real dependency on the others and could ship as separate PRs?
- For each declared dependency, what line/function in the referenced file creates the dependency?
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

If any row is BLOCKER, add the finding to the report's top-level `### Blockers` list with the label `[Scope critique]`.
```

---

### Task 3: Add `## Scope critique` section to `SKILL.md` (green phase)

**Files:**
- Modify: `skills/design-verification/SKILL.md`

The section is inserted as a top-level `##` section immediately after the closing line of `## Process` (the last `### Step 7:` block ends around line 339). It is also wired in by adding a one-line call-out at the end of Step 4's Consolidation subsection.

- [ ] **Step 1: Add the Step 4 call-out (wire the pass into the process)**

In `SKILL.md`, locate the Consolidation subsection that ends Step 4 (search for the paragraph beginning "After all agents complete, merge results into the unified report table"). Append the following sentence at the end of that paragraph (after the existing text about SKIPPED categories):

```
After consolidation, run the **Scope critique** pass (see `## Scope critique` below) and append its findings block to the report before proceeding to Step 5.
```

- [ ] **Step 2: Add the `## Scope critique` top-level section**

After the closing line of `### Step 7: Write Back Gotchas` block (i.e., after the last `**YOLO behavior:**` paragraph in Step 7, before `## Verification Depth`), insert the following new section:

```markdown
## Scope critique

Run after Step 4 verification batches complete (codebase context already loaded). Ask five strategic-shape questions about the design's scope, dependencies, and observability. See `references/scope-critique.md` for the full prompt text, expanded red-flag list, and bias-resistance checklist.

**When to run:** Always — for every design document, regardless of scope.

**Five checklist questions:**

1. **Should this exist in its current shape?** Restate the problem in the reviewer's own words. Is it real and current, or speculative?
2. **Could it ship smaller?** Count independent deliverables. For each declared dependency, verify by inspecting the referenced files — don't trust the description.
3. **Is there a simpler version?** Documentation / config flag / soft hint / deletion that captures most of the value.
4. **Observability sanity.** If the design gates on a capability unobservable from hooks/skills/APIs, flag for deferral or explicit proxy documentation.
5. **Config surface review.** For each new config key: would anyone realistically flip this? If no, hardcode or drop.

**Output:** Append a `### Scope critique findings` table to the design-verification report (format defined in `references/scope-critique.md`). Any BLOCKER-severity finding is added to the top-level `### Blockers` list with the label `[Scope critique]`.
```

- [ ] **Step 3: Run AC-1 grep — confirm it now returns 1 (green)**

```bash
grep -c "^## Scope critique" /Users/weee/Dev/feature-flow/skills/design-verification/SKILL.md
```

Expected output: `1`

- [ ] **Step 4: Run AC-2 grep — confirm it returns ≥5 (green)**

```bash
grep -c "Should this exist\|Could it ship smaller\|simpler version\|Observability\|Config surface" /Users/weee/Dev/feature-flow/skills/design-verification/SKILL.md
```

Expected output: `5` or more (one match per checklist phrase).

- [ ] **Step 5: Run AC-3 check — confirm reference file exists**

```bash
ls /Users/weee/Dev/feature-flow/skills/design-verification/references/scope-critique.md
```

Expected: file listed without error.

- [ ] **Step 6: Run AC-4 check — confirm existing section anchors are unchanged**

```bash
grep -c "^## Process\|^## Verification Depth\|^## Quality Rules\|^## Additional Resources\|^### Step 1:\|^### Step 2:\|^### Step 3:\|^### Step 4:\|^### Step 5:\|^### Step 6:\|^### Step 7:" /Users/weee/Dev/feature-flow/skills/design-verification/SKILL.md
```

Expected output: `11` (same count as Task 1 Step 4 baseline — no anchors deleted).

- [ ] **Step 7: Confirm only additions (no deletions) in SKILL.md diff**

```bash
git diff --stat HEAD -- skills/design-verification/SKILL.md
```

Expected: the diff shows only `+` lines (no `-` lines beyond the context lines that are part of insertions).

---

### Task 4: AC-5 manual sanity — run scope critique against #236 pre-correction body

This task verifies that the scope-critique pass, as written, would surface ≥3 of the 6 strategic issues holstein13 identified in #236.

**The 6 strategic issues to check against (from `Background` section above):**

| # | Issue |
|---|-------|
| 1 | Changes 2 & 3 could ship without #235 dependency — ship smaller |
| 2 | Change 1 builds machinery around an unobservable capability (advisor invocations) |
| 3 | Tier-2 trigger is a poor proxy signal (edit count vs. re-fire) |
| 4 | Config bloat — 3 keys for a discretionary beta feature |
| 5 | README placement — beta instructions in root README |
| 6 | ACs referencing unshipped #235 infra not labeled as blocked |

- [ ] **Step 1: Retrieve the pre-correction #236 body**

```bash
gh issue view 236 --json body --jq '.body'
```

Read the output. If the body appears to already incorporate corrections (e.g., mentions exact line numbers, AC unblocking, or references the post-creation review), the issue body was edited in place. In that case retrieve the original via the edit timeline:

```bash
gh api repos/uta2000/feature-flow/issues/236/timeline --jq '[.[] | select(.event=="edited") | {actor: .actor.login, created_at: .created_at}]' 2>/dev/null || echo "No edit events found — body is original"
```

The pre-correction body is what the design described *before* holstein13's review: a three-change advisor integration with `edits_since_advisor_suggestion` counter, tier-1/tier-2 gating, three new config keys, and README setup section. Use that description as the test input if the current body has already been corrected.

- [ ] **Step 2: Apply Q1 — Should this exist in its current shape?**

Read the #236 body and restate the problem in your own words. Does the design solve the restated problem, or a derivative? Check specifically for Issue 6 (ACs referencing infra from unshipped #235 — a signal the design assumes something not yet real).

Expected finding: WARNING or BLOCKER on the unverified #235 dependencies. This surfaces **Issue 6**.

- [ ] **Step 3: Apply Q2 — Could it ship smaller?**

List the distinct deliverables in the #236 design. For each declared dependency on #235, check whether the referenced #235 files exist in the repo at current HEAD:

```bash
gh issue view 235 --json title,state --jq '{title, state}'
```

Check whether the dependency is real by looking for the declared infra files. Expected finding: Change 2 and Change 3 have no dependency on #235 infrastructure — they could ship independently. This surfaces **Issue 1**.

- [ ] **Step 4: Apply Q4 — Observability sanity**

Scan the #236 body for capabilities the design observes or counts at runtime. Look for the `edits_since_advisor_suggestion` counter or any mechanism that counts advisor invocations from within a hook.

Note: `hooks/scripts/advisor-hint.js` may exist in the repo (it was added by PR #242 to display hints), but that is a one-way display hook — it does not observe advisor invocations. The question is whether any hook can *read how many times the user called `advisor()`* at runtime. Verify:

```bash
grep -r "edits_since_advisor\|advisor_invocation\|advisor_count" /Users/weee/Dev/feature-flow/hooks/ 2>/dev/null || echo "No advisor-invocation observation found in hooks"
```

Expected finding: BLOCKER — the design's tier-1/tier-2 machinery gates on advisor call frequency, which is unobservable from hooks. This surfaces **Issue 2**.

- [ ] **Step 5: Apply Q5 — Config surface review**

Count the new `.feature-flow.yml` keys introduced in the #236 design body. Assess whether each key would realistically be flipped. Expected finding: WARNING or BLOCKER on config bloat (3 keys for a beta feature). This surfaces **Issue 4**.

- [ ] **Step 6: Tally and confirm ≥3 surfaces**

Count the strategic issues surfaced:
- Issue 1 (ship smaller) — surfaced by Q2? ✓/✗
- Issue 2 (unobservable machinery) — surfaced by Q4? ✓/✗
- Issue 3 (poor proxy signal) — surfaced by Q4? ✓/✗
- Issue 4 (config bloat) — surfaced by Q5? ✓/✗
- Issue 5 (README placement) — surfaced by Q3? ✓/✗
- Issue 6 (ACs unblocked) — surfaced by Q1/Q2? ✓/✗

Expected: ≥3 issues marked ✓. If fewer than 3 are surfaced, revisit the five questions and expand the red-flag list in `references/scope-critique.md` before proceeding to commit.

---

### Task 5: Commit

**Files:**
- `skills/design-verification/SKILL.md`
- `skills/design-verification/references/scope-critique.md`

- [ ] **Step 1: Stage files**

```bash
git add skills/design-verification/SKILL.md skills/design-verification/references/scope-critique.md
```

- [ ] **Step 2: Confirm staged diff looks correct**

```bash
git diff --cached --stat
```

Expected: 2 files changed, insertions only in SKILL.md, new file scope-critique.md.

- [ ] **Step 3: Final AC sweep before commit**

```bash
grep -c "^## Scope critique" /Users/weee/Dev/feature-flow/skills/design-verification/SKILL.md && \
grep -c "Should this exist\|Could it ship smaller\|simpler version\|Observability\|Config surface" /Users/weee/Dev/feature-flow/skills/design-verification/SKILL.md && \
ls /Users/weee/Dev/feature-flow/skills/design-verification/references/scope-critique.md
```

Expected: `1` then `5` (or more) then the file path listed.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(design-verification): add scope-critique pass (#238)

Adds a ## Scope critique section to skills/design-verification/SKILL.md
and a supporting reference file with five strategic-shape questions that
run after the existing compatibility check to catch oversized scope,
phantom dependencies, and unobservable capability bets.

Closes #238
EOF
)"
```

Expected: commit succeeds, no pre-commit hook failures.
