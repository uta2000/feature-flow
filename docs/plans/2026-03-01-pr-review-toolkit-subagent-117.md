# PR Review Toolkit Subagent Isolation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Dispatch `pr-review-toolkit:review-pr` as a single Task subagent in the start skill's Code Review Pipeline Step, so the full agent reports stay isolated in the subagent's context window and the parent only receives the structured summary.

**Architecture:** Replace Phase 1's individual pr-review-toolkit agent dispatch table with a single general-purpose Task subagent invocation that internally runs `pr-review-toolkit:review-pr`. The subagent receives base branch, HEAD SHA, changed files, scope, and acceptance criteria; it returns a structured Critical/Important/Minor summary. Non-pr-review-toolkit agents (`superpowers:code-reviewer`, `feature-dev:code-reviewer`, `backend-api-security:backend-security-coder`) continue to be dispatched as Task subagents in parallel with the pr-review-toolkit subagent. Phases 2–5 are updated to process the subagent's summary output. The `Finishing a Development Branch YOLO Override` is updated to include the review summary in the PR body.

**Tech Stack:** Markdown (SKILL.md instruction file), no compilation or tests — acceptance criteria are verified with grep.

---

<!-- PROGRESS INDEX
| Task | Title | Status |
|------|-------|--------|
| 1 | Replace Phase 1 pr-review-toolkit agents with single Task subagent | completed |
| 2 | Update Phases 2-5 and PR override to handle subagent summary | completed |
-->

---

### Task 1: Replace Phase 1 pr-review-toolkit agents with a single Task subagent

**Files:**
- Modify: `skills/start/SKILL.md` (lines ~1200–1250 — Phase 1 section of Code Review Pipeline Step)

**Context:**

The current Phase 1 dispatches multiple individual Task agents for pr-review-toolkit and other plugins. The pr-review-toolkit agents (code-simplifier, silent-failure-hunter, pr-test-analyzer, type-design-analyzer) each return full results to the parent, accumulating context. The fix: replace the dispatch of individual pr-review-toolkit agents with a SINGLE general-purpose Task subagent that runs `pr-review-toolkit:review-pr` internally. The parent only receives the structured summary.

The `superpowers:code-reviewer`, `feature-dev:code-reviewer`, and `backend-api-security:backend-security-coder` agents are NOT part of pr-review-toolkit and remain dispatched as separate Task subagents in parallel with the pr-review-toolkit subagent.

**Step 1: Read the exact Phase 1 section**

Read `skills/start/SKILL.md` offset 1200, limit 60. Understand the exact text to be replaced.

**Step 2: Replace the Phase 1 dispatch table and surrounding prose**

In `skills/start/SKILL.md`, replace the section from `#### Phase 1: Dispatch review agents` through the `**Agent failure handling:** ...` paragraph (ending just before `#### Phase 2: Review direct fixes`).

The new Phase 1 text:

```
#### Phase 1: Dispatch review agents

Dispatch the pr-review-toolkit review as a **single isolated Task subagent** and the remaining tier-selected non-pr-review-toolkit agents as separate Task subagents. Launch all in a single message to run concurrently.

**pr-review-toolkit subagent (always when pr-review-toolkit is installed and scope ≠ Quick fix):**

```
Task(
  subagent_type: "general-purpose",
  model: "sonnet",
  description: "Run pr-review-toolkit code review — isolated context",
  prompt: "Run the pr-review-toolkit:review-pr skill on the current branch. Use the Skill tool: Skill(skill: 'pr-review-toolkit:review-pr').

Context for the review:
- Base branch: [base-branch]
- HEAD SHA: [git rev-parse HEAD]
- Changed files: [git diff --name-only [base-branch]...HEAD]
- Scope: [scope]
- Acceptance criteria: [acceptance criteria from implementation plan tasks]
- Pre-filter results: [Phase 0 output — issues already caught and fixed]
- Anti-patterns to avoid: [from Study Existing Patterns step]
- Reference examples (known-good): [from Study Existing Patterns step]

After the review-pr skill completes, return a structured summary in EXACTLY this format (no other prose):

## PR Review Toolkit Summary

### Auto-Fixed
- [file:line] [what was auto-fixed by the review agents]
(or '(none)' if nothing was auto-fixed)

### Critical
- file: [exact path]
  line: [N]
  rule: [rule name]
  description: [what's wrong]
  fix: |
    [concrete code change]
(or '(none)' if no critical findings)

### Important
[same format as Critical, or '(none)']

### Minor
[same format as Critical, or '(none)']"
)
```

**Non-pr-review-toolkit agents (dispatch in the same message as the pr-review-toolkit subagent):**

For each agent at or below the current tier, dispatch as a Task subagent using the agent's `subagent_type` and `model`. Each prompt must include: branch diff (`git diff [base-branch]...HEAD`), the agent's checklist (from the table below), relevant coding standards sections, stack patterns, acceptance criteria, anti-patterns and reference examples from Study Existing Patterns, and pre-filter exclusion context from Phase 0.

**Structured output requirement for reporting agents:** Instruct each agent (Fix Mode = "Report") to return findings in this format. Findings that do not follow this format will be discarded in Phase 3:

```
- file: [exact file path]
  line: [line number]
  rule: [specific rule name from checklist]
  severity: critical | important | minor
  description: [what's wrong and why]
  fix: |
    [concrete code change — not "consider improving"]
```

Agents must name the specific rule violated from their checklist. Findings without a named rule and concrete fix will be rejected.

| Agent | Plugin | Checklist | Fix Mode | Model | Tier |
|-------|--------|-----------|----------|-------|------|
| `feature-dev:code-reviewer` | feature-dev | (1) Every external call has error handling, (2) inputs validated at system boundaries, (3) no SQL/command injection vectors, (4) race conditions in async code, (5) off-by-one in loops/pagination | **Report** → Claude fixes | sonnet | 2 |
| `superpowers:code-reviewer` | superpowers | (1) Every function ≤30 lines, (2) no nesting >3 levels, (3) guard clauses for error cases, (4) naming matches conventions, (5) no god files >300 lines, (6) all acceptance criteria met | **Report** → Claude fixes | sonnet | 1 |
| `backend-api-security:backend-security-coder` | backend-api-security | (1) Every user input validated before use, (2) auth checked on every route, (3) no secrets in code, (4) CORS configured correctly, (5) rate limiting on public endpoints | **Report** → Claude fixes | opus | 3 |

**Availability check:** Before dispatching, check which agents' plugins are installed. Skip unavailable agents. Announce: "Running pr-review-toolkit subagent + N direct agents in parallel (Tier T — [scope])..."

**Agent failure handling:** If the pr-review-toolkit subagent fails, skip it and log: "pr-review-toolkit subagent failed — pr-review-toolkit agents skipped. Continuing with N remaining agents." If any other agent fails, skip it and continue. Do not stall the pipeline for a single failure.
```

**Step 3: Verify the replacement**

After editing, grep the file for these patterns — all must match:

```bash
grep -n "pr-review-toolkit:review-pr" skills/start/SKILL.md
grep -n "isolated Task subagent\|single isolated" skills/start/SKILL.md
grep -n "Base branch.*HEAD SHA\|base-branch.*HEAD SHA\|base branch.*head SHA" skills/start/SKILL.md
```

**Step 4: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat(start): dispatch pr-review-toolkit as isolated Task subagent in code review phase 1"
```

**Acceptance Criteria:**
- [ ] `grep -n "single isolated Task subagent\|isolated Task subagent" skills/start/SKILL.md` exits 0 (subagent dispatch pattern is present)
- [ ] `grep -n "pr-review-toolkit:review-pr" skills/start/SKILL.md` exits 0 with at least 1 match (skill is referenced)
- [ ] `grep -n "base-branch\|base branch" skills/start/SKILL.md | grep -i "subagent\|prompt"` exits 0 (base branch included in subagent context)
- [ ] `grep -n "HEAD SHA\|head SHA\|rev-parse HEAD" skills/start/SKILL.md | grep -i "subagent\|prompt"` exits 0 (HEAD SHA included in subagent context)
- [ ] `grep -n "changed files\|--name-only" skills/start/SKILL.md | grep -i "subagent\|prompt"` exits 0 (changed files list included in subagent context)
- [ ] `grep -n "PR Review Toolkit Summary\|## PR Review" skills/start/SKILL.md` exits 0 (structured return format defined)
- [ ] `grep -n "pr-review-toolkit:code-simplifier\|pr-review-toolkit:silent-failure-hunter\|pr-review-toolkit:pr-test-analyzer\|pr-review-toolkit:type-design-analyzer" skills/start/SKILL.md | grep -v "^[0-9]*:| Tier \| Agent"` — should NOT appear in the Phase 1 dispatch section (individual agents replaced by subagent)

**Quality Constraints:**
- Error handling: If the pr-review-toolkit subagent fails, announce clearly and continue — non-blocking failure pattern, consistent with existing agent failure handling in the file
- Types: Not applicable (SKILL.md is markdown — no type system)
- Function length: Not applicable (prose instructions, not code)
- Pattern reference: Follow the existing Subagent-Driven Development YOLO Override section's Task() call format in `skills/start/SKILL.md` for how subagent prompts are structured
- Files modified: `skills/start/SKILL.md` (design-first — 1700+ lines; read the exact Phase 1 section before editing)

---

### Task 2: Update Phases 2–5 for subagent summary output, and add review summary to PR body

**Files:**
- Modify: `skills/start/SKILL.md` (lines ~1242–1330 — Phases 2–5 of Code Review Pipeline Step, and the Finishing a Development Branch YOLO Override section ~lines 796–809)

**Context:**

After Task 1, Phase 2 references "direct-fix agents" (code-simplifier, silent-failure-hunter) but those now run internally inside the pr-review-toolkit subagent. Phase 2 must be updated to process the Auto-Fixed section from the subagent summary. Phase 3 must consolidate from the subagent's Critical/Important/Minor sections plus the direct agent reports from non-pr-review-toolkit agents. Phase 4 re-verify must note that auto-fixes were applied by the subagent (files are already changed). The `Finishing a Development Branch YOLO Override` must include the review summary in the PR body.

**Step 1: Read Phase 2 and 3 text**

Read `skills/start/SKILL.md` offset 1242, limit 90.

**Step 2: Replace Phase 2**

Find `#### Phase 2: Review direct fixes` and the two numbered items beneath it. Replace with:

```
#### Phase 2: Review pr-review-toolkit subagent auto-fixes

The pr-review-toolkit subagent applied direct fixes internally (code-simplifier, silent-failure-hunter). Review the "Auto-Fixed" section from the subagent summary:

1. **Auto-Fixed from pr-review-toolkit subagent** — Summarize what the subagent auto-fixed (from the `### Auto-Fixed` section of the subagent summary). Flag any complex issues it could not auto-fix. If the subagent was unavailable or failed, announce: "pr-review-toolkit subagent was unavailable — direct-fix agents (code-simplifier, silent-failure-hunter) did not run."
```

**Step 3: Update Phase 3 consolidation**

Find `#### Phase 3: Consolidate and fix reported findings`. Update steps 1-2 to reference the pr-review-toolkit subagent summary as the source of pr-review-toolkit findings, alongside the non-pr-review-toolkit agents' structured outputs.

Replace the Phase 3 opening paragraph:

```
Collect findings from the pr-review-toolkit subagent summary (Critical/Important/Minor sections) and from the direct reporting agents dispatched in Phase 1 (superpowers:code-reviewer, feature-dev:code-reviewer, backend-api-security:backend-security-coder). Consolidate them:
```

**Step 4: Update Phase 3 fix patterns**

In the "For each Critical and Important finding" paragraph, remove the `pr-test-analyzer` and `type-design-analyzer` entries (they are now handled inside the subagent). The pr-review-toolkit subagent handles those internally. Keep:
- `superpowers:code-reviewer` (Tier 1+)
- `feature-dev:code-reviewer` (Tier 2+)
- `backend-security-coder` (Tier 3 only)

Add: "For findings from the **pr-review-toolkit subagent** summary: apply the concrete `fix:` code change specified in the finding."

**Step 5: Update the Finishing a Development Branch YOLO Override**

Find item 5 in the YOLO override (`5. For PR title/body, use the feature description and lifecycle context to generate them automatically`).

Replace item 5 with:

```
5. For PR title/body, use the feature description and lifecycle context to generate them automatically. **Include the aggregated code review summary in the PR body** — append the PR Review Toolkit Summary (from the Phase 1 subagent output) and any findings fixed by the Claude-fixes phase (Phase 3). Use this section heading in the PR body: `## Code Review Summary`.
```

**Step 6: Verify**

```bash
grep -n "Auto-Fixed\|Auto-fixed\|auto-fixed" skills/start/SKILL.md | grep -i "Phase 2\|subagent"
grep -n "pr-review-toolkit subagent summary" skills/start/SKILL.md
grep -n "Code Review Summary\|review summary.*PR\|PR.*review summary" skills/start/SKILL.md
```

**Step 7: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat(start): update code review phases 2-5 for subagent summary output and include summary in PR body"
```

**Acceptance Criteria:**
- [ ] `grep -n "pr-review-toolkit subagent summary" skills/start/SKILL.md` exits 0 (Phase 3 references subagent summary as source)
- [ ] `grep -n "Auto-Fixed\|auto-fixed" skills/start/SKILL.md` exits 0 in or near Phase 2 (Phase 2 processes subagent's auto-fix section)
- [ ] `grep -n "Code Review Summary\|review summary" skills/start/SKILL.md` exits 0 in the Finishing a Development Branch section (summary included in PR body)
- [ ] `grep -n "parent context\|parent applies" skills/start/SKILL.md` exits 0 (parent-side fix logic is present)
- [ ] `grep -n "pr-review-toolkit subagent was unavailable" skills/start/SKILL.md` exits 0 (fallback for subagent failure is present)

**Quality Constraints:**
- Error handling: Unavailable subagent must be announced explicitly — follow the "skip and announce" pattern used throughout the existing pipeline
- Types: Not applicable (markdown)
- Function length: Not applicable (prose)
- Pattern reference: Follow Phase 2 existing format for reviewing direct fixes; adapt to summarize from subagent output
- Files modified: `skills/start/SKILL.md` (design-first — read exact Phase 2/3/5 text before editing)
