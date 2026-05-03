# Code Review Pipeline

**Usage:** Read this file when reaching the "Code Review Pipeline Step" during lifecycle execution (Step 3 skill mapping).

---

This step runs after self-review and before final verification. It dispatches multiple specialized review agents in parallel, auto-fixes findings, and re-verifies until clean. The goal is shipping clean code, not a list of TODOs.

**Prerequisites:**
- At least `superpowers:code-reviewer` must be available (always true — superpowers is required)
- Additional agents from `pr-review-toolkit`, `feature-dev`, and `backend-api-security` are used when available

**Process:**

**Quick fix guard:** If the current scope is Quick fix, skip this entire step. Announce: "Scope is Quick fix — code review pipeline skipped." Proceed to the next lifecycle step.

**Model override:** If the user has requested a specific model for the entire lifecycle (e.g., "use opus for everything" or "use sonnet for everything"), apply that model to all agent dispatches in this code review pipeline, overriding the per-agent defaults in the table.

**Large file handling:** If the branch diff includes files >200KB, instruct review agents to use `git diff [base-branch]...HEAD -- <file>` (where `[base-branch]` is the branch detected in Step 0) for those files instead of reading the full file. The diff contains only the changed sections, which is what reviewers need.

**Scope-based agent selection with registry filtering:** Select which agents to dispatch based on scope tier AND the plugin registry. Query `plugin_registry` from `.feature-flow.yml` using `get_plugins_for_step("code_review", project_stack)` where `project_stack` is the `stack` field from `.feature-flow.yml` (see `references/plugin-scanning.md` — Registry Query section).

Base plugins retain their existing tier assignments:
- Tier 1: superpowers:code-reviewer, silent-failure-hunter (internal)
- Tier 2: code-simplifier (internal), feature-dev:code-reviewer
- Tier 3: pr-test-analyzer, type-design-analyzer, backend-api-security:backend-security-coder

**Discovered plugins** with `code_review` or `security_review` roles from the registry are dispatched as **Tier 3** agents in report-only mode. Their checklist is derived from the plugin's own agent/skill description.

| Scope | Max Tier | Agents to Dispatch |
|-------|----------|--------------------|
| Quick fix | — | Code review step not included for this scope |
| Small enhancement | 1 | All Tier 1 agents from registry where stack matches and plugin status is `installed` |
| Feature | 2 | All Tier 1-2 agents from registry where stack matches and plugin status is `installed` |
| Major feature | 3 | All Tier 1-3 agents (including discovered) from registry where stack matches and plugin status is `installed` |

**Filtering at dispatch time:** For each plugin in the registry with a `code_review` or `security_review` role at or below the scope's max tier:
1. Skip plugins marked `(internal)` — they run inside their parent agent
2. Check `status` is `installed` (not `missing` or `installed_not_loaded`)
3. Check `stack_affinity` includes `"*"` or intersects with the project's `stack` list
4. If all conditions met → include in dispatch. Otherwise → skip with log.

The pr-review-toolkit subagent always runs in Phase 1a when pr-review-toolkit is installed and scope ≠ Quick fix — it handles internal agents (`silent-failure-hunter`, `code-simplifier`, `pr-test-analyzer`, `type-design-analyzer`) based on the scope.

## Phase 0: Deterministic pre-filter

Run deterministic tools before dispatching agents to catch issues that linters can find. Fix those issues first, then pass results as exclusion context to agents so they focus on what linters cannot catch.

**Detection and execution:**

1. **Detect available tools:**
   - TypeScript: check if `tsconfig.json` exists in the project root
   - ESLint: check if `.eslintrc*` or `eslint.config.*` exists, or `eslintConfig` in `package.json`
   - Biome: check if `biome.json` or `biome.jsonc` exists
   If no tools are detected, skip Phase 0 entirely: "No deterministic tools detected — skipping pre-filter."

2. **Run detected tools in parallel:**
   Before running any tool, verify the binary exists in `node_modules/.bin/` (e.g., `node_modules/.bin/tsc` for TypeScript). If the binary is not present, skip that tool with: "[tool] not found in node_modules/.bin/ — skipping. Run npm install first."
   - TypeScript: `./node_modules/.bin/tsc --noEmit 2>&1`
   - ESLint: `./node_modules/.bin/eslint --no-error-on-unmatched-pattern . 2>&1`
   - Biome: `./node_modules/.bin/biome check . 2>&1`
   Timeout: 60 seconds per tool. If a tool times out, log a warning and skip it.

3. **Collect and summarize results:**
   Parse output for file paths and line numbers. Categorize as type errors, lint violations, or anti-pattern violations.

4. **Fix pre-filter findings:**
   Before proceeding to Phase 1a, fix the deterministic findings directly (type errors → fix types, lint errors → auto-fix with `--fix` flag or manual fix). This runs sequentially before agent dispatch to avoid race conditions.

5. **Build exclusion context for Phase 1a/1b:**
   Generate a "Pre-Filter Results" summary to include in each agent's prompt:
   ```
   ## Pre-Filter Results (already caught and fixed — skip these areas)
   - [file:line] [category]: [description]

   Focus your review on issues these tools CANNOT catch:
   logic errors, architectural mismatches, missing edge cases, security vulnerabilities.
   ```
   If no issues were found in the pre-filter, include: "Pre-filter ran clean — no deterministic issues found. Proceed with full review."

## Phase 1a: pr-review-toolkit Pre-Pass (Gated)

The pr-review-toolkit runs as an isolated subagent **before** report-only agents. This preserves its internal auto-fix behavior while ensuring report-only agents see a consistent codebase.

**Process:**
1. Dispatch pr-review-toolkit subagent (subagent prompt and output format unchanged; execution order changed to sequential pre-pass):

```
Task(
  subagent_type: "general-purpose",
  model: "sonnet",
  description: "Run pr-review-toolkit code review — isolated context",
  prompt: "Use the Skill tool to run pr-review-toolkit:review-pr: Skill(skill: 'pr-review-toolkit:review-pr').

Subagent prompt context for the review:
- Base branch: [base-branch]
- HEAD SHA: [output of git rev-parse HEAD]
- Changed files: [output of git diff --name-only <base-branch>...HEAD]
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

2. Wait for completion
3. Collect its structured summary (Auto-Fixed, Critical, Important, Minor sections)
4. If auto-fixes were made: commit as a single commit:
   ```bash
   git add -A
   git commit -m "fix: pr-review-toolkit auto-fixes"
   ```
   If nothing was auto-fixed: skip commit.
5. The Critical/Important/Minor findings from the summary are passed to Phase 2 for consolidation with report-only agent findings

**Why gated:** The pr-review-toolkit modifies code directly. Running it first ensures Phase 1b agents review the committed state, not stale code.

**Failure handling:** If the pr-review-toolkit subagent fails, skip Phase 1a entirely. Dispatch Phase 1b agents without gating. Announce: "pr-review-toolkit subagent failed — skipping Phase 1a pre-pass. Dispatching report-only agents on current code."

## Phase 1b: Report-Only Agents (Parallel)

After Phase 1a commits (or is skipped), dispatch all tier-eligible, stack-relevant, report-only agents in a **single parallel message**. Each agent receives:

- The current branch diff (`git diff [base-branch]...HEAD` — includes pr-review-toolkit fixes if Phase 1a ran)
- Its specific checklist from the agent table below
- Pre-filter exclusion context from Phase 0
- Anti-patterns and reference examples from Study Existing Patterns
- **Explicit instruction: "Return findings only. Do NOT modify any files."**

**Structured output requirement:** Instruct each agent to return findings in this format. Findings that do not follow this format will be discarded in Phase 2:

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
| Discovered `code_review` agents | (from registry) | Checklist derived from plugin's own agent/skill description | **Report** → Claude fixes | sonnet | 3 |

**Availability check:** Before dispatching, apply the stack filtering logic from the scope-based agent selection section. Announce: "Running N report-only agents in parallel (Tier T — [scope], stack: [stack list])..."

**Agent failure handling:** If any agent fails, skip it and continue. Do not stall the pipeline for a single failure.

**Phase 1c gated dispatch:** For Major-feature scope (Tier 3) only, dispatch the senior developer panel subagent (Phase 1c) in the **same parallel message** as the Phase 1b agents above — not sequentially, not after. See `skills/start/references/senior-panel.md` for the persona prompt contract, closed rule enums, and finding schema. The panel's findings flow into Phase 2 alongside Phase 1b findings.

## Phase 1c: Senior Developer Panel (Major Feature only)

**Scope gate:** Dispatched only when the lifecycle scope is **Major feature** (Tier 3). For Feature, Small enhancement, and Quick fix scopes, skip this phase entirely — do not dispatch, do not announce.

**Dispatch:** Phase 1c runs **in parallel** with Phase 1b — both are dispatched in the **same single parallel message**. The panel reviews the same post-Phase-1a committed code Phase 1b reviews, so no new ordering constraint is introduced.

**Subagent contract:** See `skills/start/references/senior-panel.md` for the full prompt template and dispatch contract. Summary:

```
Task(
  subagent_type: "general-purpose",
  model: "opus",
  description: "Run senior developer panel review [session:$LIFECYCLE_SESSION]",
  prompt: [persona-panel prompt from senior-panel.md]
)
```

A single opus subagent orchestrates three personas sequentially (Staff Engineer → SRE → Product Engineer). Each persona has a closed rule enum (see `senior-panel.md`). The subagent returns findings in the Phase 1b structured format plus two extra fields: `finding_type` (`rule | architectural | operability | product_fit`) and `persona` (`staff_eng | sre | product_eng`, required when `finding_type != rule`).

**Pre-dispatch diff-size cap:** If the reviewed branch diff exceeds 1500 changed lines, skip Phase 1c entirely — do not dispatch. Rationale: opus context-window risk on very large diffs. Announce: `"Phase 1c [session:$LIFECYCLE_SESSION]: diff size N lines exceeds 1500-line cap. Skipping panel; Phase 1b agents still run."`

**Orchestrator-enforced timeout:** 5-minute wall-clock bound. The Task primitive has no native timeout — the orchestrator MUST abandon the Phase 1c dispatch if no response arrives within 5 minutes and treat it as a transport error.

**Correlation ID:** every Phase 1c announcement, log line, and Phase 5 report entry MUST carry `[session:$LIFECYCLE_SESSION]`. The substituted value is the `lifecycle_session` slug (`YYYY-MM-DD-<kebab-slug>`) read from `.feature-flow/session.txt` — the same slug that appears in the PR's `feature-flow-metadata` block. Do NOT mint a new identifier for Phase 1c; reuse the existing lifecycle session slug so grep-correlation works across pipeline phases, Phase 5 report, and the PR body.

**Phase 1c schema-level guard:** Before merging Phase 1c findings into Phase 2, validate each finding against the schema: (a) required fields present including `finding_type` and `persona` (when `finding_type != rule`), (b) `rule` is a member of the persona's closed enum. This guard is distinct from — and parallel to — Phase 1a's section-header guard (above at "Malformed subagent response guard"). See `skills/start/references/senior-panel-fixtures.md` for canonical test payloads (F1-F8).

**Failure handling (four distinct dispositions — do NOT collapse):** See `senior-panel.md` → "Failure dispositions" for full spec. Summary:

1. `transport_error` — network / rate-limit / timeout. Retry once with 30s backoff before failing.
2. `parse_error` — response could not be parsed into structured findings.
3. `all_findings_rejected` — response parsed but every finding dropped by guard. Announcement includes first rejection reason.
4. `zero_findings_on_nontrivial_diff` — response parsed, zero findings, diff >50 lines. Treated as failure. Zero findings on a trivial (<50 line) diff is NOT a failure.

All failure announcements include the `[session:$LIFECYCLE_SESSION]` correlation token.

## Pattern B handoff (orchestrator → consolidator)

As of Wave 3 phase 5 (#251), Phases 2-5 run inside a **consolidator subagent** (Pattern B). The orchestrator continues to own Phases 0, 1a, 1b, and 1c (subagents cannot recursively dispatch per #251 Q1, so the parallel reviewer fanout MUST stay orchestrator-side). The orchestrator then dispatches a single `general-purpose` consolidator subagent (`model: "sonnet"`) that ingests the reviewer outputs, runs Phases 2-5 in isolation, writes the report, and writes the structured return contract.

**Consolidator inputs (passed in dispatch prompt):**

1. The Phase 1a pr-review-toolkit summary (Auto-Fixed / Critical / Important / Minor sections, or the `null` sentinel if Phase 1a was skipped).
2. The Phase 1b structured findings list from each report-only agent that ran (or empty list if none ran / all skipped).
3. The Phase 1c senior panel findings list (or empty list when scope < Major feature, or `null` when Phase 1c failed under one of the four dispositions).
4. The `lifecycle_session` slug (`YYYY-MM-DD-<kebab-slug>` from `.feature-flow/session.txt`). Every Phase 5 report entry the consolidator emits MUST carry the `[session:$LIFECYCLE_SESSION]` correlation token — the same requirement that already applies in inline mode, preserved across the handoff so grep-correlation across pipeline phases, the Phase 5 report, and the PR body still works.

**Consolidator owns Phases 2, 3, 4, 5 + contract write.** Specifically: Phase 2 (merge / dedupe / conflict detection), Phase 3 (apply rule-based fixes via Edit/Write/Bash + commit), Phase 4 (targeted re-verification — see Pattern B caveats below), Phase 5 (report + contract write).

**Pattern B Phase 4 caveat — agent re-dispatch unavailable:** the consolidator has Edit/Write/Bash/Skill but cannot dispatch `Agent`/`Task` subagents (#251 Q1). Each Phase 4 row that would normally trigger an agent re-dispatch instead writes a `deferred[]` entry to the return contract with `reason: "agent re-dispatch unavailable in Pattern B consolidator"`. See Phase 4 below for the full rule and the verdict-honesty constraint that follows.

**Inline-fallback (rollout-only):** see "Code Review — Pattern B Dispatch" in `skills/start/SKILL.md`. The fallback runs the same Phases 2-5 inline at the orchestrator level, identically to the pre-#251 behavior.

## Phase 2: Conflict Detection

After all Phase 1b agents complete, consolidate findings from both phases and detect conflicts before applying fixes.

**Step 1 — Cross-Phase Finding Merge:**
Collect and merge findings from up to three sources:
- **Phase 1a** pr-review-toolkit summary (Critical/Important/Minor sections only — Auto-Fixed already committed). These are findings the toolkit identified but did not auto-fix.
- **Phase 1b** report-only agent results. These agents reviewed the code AFTER Phase 1a auto-fixes were committed, so their findings reflect the current state.
- **Phase 1c** senior panel findings (Major-feature scope only). Standard structured format plus `finding_type` and `persona` fields — see `skills/start/references/senior-panel.md`.

All sources use the same structured format. Merge into a single list before deduplication. Phase 1c may be absent (sub-Major scope); that is not a merge error.

**Normalize `finding_type` on ingress:** During merge, set `finding_type = "rule"` explicitly on every Phase 1a and Phase 1b finding that does not already carry the field. Do **not** rely on downstream consumers to infer "missing `finding_type` means rule finding" — the default belongs at the merge boundary, not scattered across Phase 2 Step 4 (orthogonality), Phase 3 (partition), or Phase 5 (report). Every finding flowing out of Step 1 has a non-null `finding_type`.

**Malformed subagent response guard:** If the pr-review-toolkit subagent response is missing any of the required sections (`### Auto-Fixed`, `### Critical`, `### Important`, `### Minor`), treat it as a subagent failure: announce "pr-review-toolkit subagent returned a malformed summary — findings from that subagent skipped." and proceed with Phase 1b findings only.

**Step 2 — Reject non-compliant findings:**
- Discard findings missing any required field (`file`, `line`, `rule`, `severity`, `description`, `fix`)
- Discard findings where `fix` contains only commentary ("consider simplifying", "could be improved", "might want to") without concrete code changes
- Announce: "Rejected N findings (M missing required fields, K vague fixes). Proceeding with R valid findings."

**Step 3 — Deduplicate:**
1. Deduplicate by file path + line number — if two agents flag the same location, keep the higher-severity finding
2. If same severity, prefer the more specific agent: `backend-security-coder` > pr-review-toolkit > `feature-dev:code-reviewer` > `superpowers:code-reviewer`

**Step 4 — Detect conflicts:**
Group all remaining findings by file path. Within each file, for each pair of findings:
1. **Orthogonality check (runs first):** Compare `finding_type` on both findings. If they differ, the findings do **not** conflict regardless of line proximity — keep both. Rule findings and judgment findings are orthogonal concerns (an architectural concern anchored near a rule violation is not the same issue flagged twice).
   - Only apply the remaining overlap/resolution/logging steps below when `finding_type` matches on both findings.
2. Calculate line range overlap: finding A covers lines `[A.line - 5, A.line + 5]`, finding B covers `[B.line - 5, B.line + 5]`
3. If ranges overlap → conflict detected
4. Resolution: keep the higher-severity finding. If same severity, use agent specificity order above.
5. Log skipped findings: "Conflict at [file:line]: [Agent A] finding (severity) kept, [Agent B] finding (severity) skipped — overlapping line range"

**Output:** A conflict-free, ordered list of findings to apply (Critical first, then Important). Minor issues are logged as informational but not blocking.

## Phase 3: Single-Pass Fix Implementation

Apply all conflict-free Critical and Important findings in a single coordinated pass. Phase 3 partitions findings by `finding_type`:

**Partition step (runs first):**

- `rule_findings` = findings with `finding_type == "rule"`. These come from Phase 1a, Phase 1b, and any Phase 1c finding that a persona explicitly tagged as rule-based. Phase 2 Step 1's ingress normalization guarantees every finding has `finding_type` set, so there is no "missing field" case to handle here.
- `judgment_findings` = findings with `finding_type` in `{architectural, operability, product_fit}`. These come exclusively from Phase 1c.

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

**Why bottom-up ordering:** When multiple fixes target the same file, applying from the bottom up ensures earlier line numbers remain valid.

## Phase 4: Targeted re-verification

After review fixes are committed (step above), re-verify **only what was changed** — do not re-run the full review suite.

**Step 1: Determine targeted checks**

From the Phase 3 fix log, identify which targeted checks apply. Multiple checks may apply — run all that apply.

| If this was true in Phase 3… | Run this targeted check |
|------------------------------|-------------------------|
| `pr-test-analyzer` had Critical/Important findings | Run the project test suite |
| Any *other* reporting agent (not `pr-test-analyzer`, not covered by rows above) had Critical/Important findings | **Pattern B:** record a `deferred[]` entry per finding (see "Pattern B agent-re-dispatch rule" below). **Inline fallback:** re-dispatch ONLY that specific agent on changed files (`git diff [base-branch]...HEAD`). |
| `silent-failure-hunter` or `code-simplifier` made direct fixes | Read back the changed files to confirm the fix is correct (no regression, no silent swallow introduced) |

*Note: Rows are evaluated top-to-bottom; a more specific row takes precedence over the catch-all. Multiple non-overlapping rows may apply — run all matching targeted checks. The previous `superpowers:code-reviewer rule 6 → run verify-acceptance-criteria` row and the previous `No Critical/Important findings → run verify-acceptance-criteria as baseline sanity check` row were both deleted in Wave 3 phase 5 (#251): the Final Verification inline step (`skills/start/references/inline-steps.md` "Final Verification Step") runs verify-acceptance-criteria immediately after the code-review step, making both invocations redundant.*

**Pattern B agent-re-dispatch rule:** inside the consolidator, `Agent`/`Task` dispatch is unavailable (#251 Q1 — recursive dispatch fails silently). For every Phase 4 row above that would normally trigger an agent re-dispatch, the consolidator writes one `deferred[]` entry to the return contract per affected finding, with `severity` carried over from the original finding and `reason: "agent re-dispatch unavailable in Pattern B consolidator"`. **Verdict honesty constraint:** the consolidator MUST NOT return `verdict: "approve"` while `deferred[]` is non-empty due to agent re-dispatch unavailability; if any critical or important finding is in `deferred[]`, the verdict MUST be at least `needs_changes`. (Inline-fallback mode runs the actual re-dispatch; no `deferred[]` entries are written in that path.)

**Step 2: Run targeted checks (parallel where possible)**

Run only the targeted checks from Step 1. Announce which checks are being run: "Targeted re-verification: [check list]."

- **Tests:** Detect test runner from project (`package.json` scripts.test → `npm test` | `Cargo.toml` → `cargo test` | `go.mod` → `go test ./...` | `mix.exs` → `mix test` | `pyproject.toml`/`pytest.ini`/`setup.cfg`/`tox.ini` → `python -m pytest` | `deno.json`/`deno.jsonc` → `deno test` | `bun.lockb`/`bun.lock`/`bunfig.toml` → `bun test`). If no runner detected, skip with log: "No test runner detected — skipping." If runner is detected but the binary is not installed (ENOENT / exit code 127), log a warning and skip: "Test binary not installed — skipping test verification." Do not count a missing binary as a test failure. Timeout: 60 seconds — if the suite times out, log a warning and skip (do not count as a failure). Tests run in both Pattern B and inline-fallback paths (Bash works in subagents).
- **Agent re-dispatch (inline-fallback only):** Dispatch only the specific agent(s) that had Critical/Important findings, with `git diff [base-branch]...HEAD` for context. Use the same model as the original Phase 1b dispatch. All re-dispatched agents launch in a single parallel message. If an agent crashes or produces no output, do not treat it as clean — log: "Agent [name] re-dispatch produced no result — listing as unresolved in Phase 5." **Pattern B path skips this entirely; see "Pattern B agent-re-dispatch rule" above for the `deferred[]` mapping.**
- **Read-back verification:** Read the specific files modified by direct-fix agents and confirm the fix is syntactically correct and no regression is visible. Read-back runs in both Pattern B and inline-fallback paths.

**Step 3: If all targeted checks pass → pipeline is clean**

Announce: "Targeted re-verification clean ([checks run]). Proceeding to Phase 5."

**Step 4: If any targeted check fails → one additional fix pass**

Apply fixes for the remaining failures. Commit: `fix: address re-verification failures`. If this commit fails (non-zero exit), report to the developer and proceed directly to Phase 5 without re-running targeted checks. Re-run the same targeted checks once more.
(This is the final allowed iteration — **maximum 2 total fix-verify iterations**.)

If still failing after this additional pass → report remaining issues to the developer with context for manual resolution. Proceed to Phase 5 — the developer decides whether to fix manually.

**Maximum 2 total fix-verify iterations** after Phase 3 (targeted re-verify → optional 1 additional pass). Stop after 2 iterations — report remaining issues for manual resolution. This cap applies only to rule-based fix-verify loops. Judgment findings from Phase 1c are surfaced once in Phase 5 and do not re-enter the loop.

## Phase 5: Report and Contract Write

**Zero-agent guard:** If all tier-selected agents were skipped (plugins unavailable), do not proceed through Phases 1a–4. Announce: "All tier-selected agents for [scope] (Tier T) were unavailable. Code review pipeline could not run — manual review recommended." Skip to Phase 5 and include a warning in the report. In Pattern B, the consolidator still writes a return contract with `verdict: "blocked"`, `status: "failed"`, and a `deferred[]` entry per skipped tier-selected agent.

**Session token requirement:** Every entry the consolidator emits in the report below MUST carry the `[session:$LIFECYCLE_SESSION]` correlation token (the slug passed in via the Pattern B handoff). This is the same requirement that already applies in inline mode, preserved across Pattern B so grep-correlation across pipeline phases, the Phase 5 report, and the PR body still works.

Output a summary:

```
## Code Review Pipeline Results [session:$LIFECYCLE_SESSION]

**Agents dispatched:** N (Tier T — [scope])
**Stack filter:** [stack entries used for filtering]
**Model override:** [None | user-requested: \<model\>]
**Iterations:** M/2
**Verdict:** approve | needs_changes | blocked

### Fixed (pr-review-toolkit pre-pass)
- [agent] [file:line] [what was auto-fixed]

### Fixed (report-only → single pass)
- [severity] [file:line] [what was fixed]

### Conflicts Resolved
- [file:line] [kept agent] over [skipped agent] — [reason]

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

### Remaining (Minor — not blocking)
- [file:line] [description]

### Remaining (unfixed after 2 iterations)
- [file:line] [description + context for manual resolution]

### Deferred (Pattern B — agent re-dispatch unavailable)
- [severity] [file:line] [description] — agent re-dispatch unavailable in Pattern B consolidator

**Status:** Clean / N issues remaining
```

### Contract Write (Pattern B only)

When invoked from the Pattern B wrapper (`skills/start/SKILL.md` "Code Review — Pattern B Dispatch"), the consolidator receives a `write_contract_to` JSON path in its dispatch prompt. After emitting the report above, write the structured return contract to that path. The contract's `phase` field is hardcoded to `"code-review"` per #251's locked spec — the validator uses this to look up the schema.

**Construct the contract object:**

- `schema_version`: `1`
- `phase`: hardcoded `"code-review"`
- `status`: `success` (clean pipeline, all critical+important addressed) | `partial` (deferred entries present OR remaining-after-2-iterations entries present) | `failed` (zero-agent guard fired, or consolidator could not assemble verdict)
- `verdict`: `approve` (no critical, no `deferred[]`) | `needs_changes` (any critical OR any `deferred[]` present) | `blocked` (zero-agent guard, or pipeline cannot return a verdict)
- `report_path`: absolute path of the written report
- `critical_count`, `important_count`, `suggestion_count`: integer counts across the entire pipeline (Phase 1a + 1b + 1c)
- `fixed_in_pipeline`: array of `{severity: "critical|important|suggestion", summary: "<one-line>"}` for every finding addressed in Phase 1a auto-fix or Phase 3 single-pass fix
- `deferred`: array of `{severity, summary, reason}` for every Phase 4 row that mapped to deferral, plus any Minor-tier or unfixed-after-2-iterations entry the consolidator chose to surface in the contract

Use the env-var-passing helper pattern (apostrophe-safe; mirrors `skills/verify-acceptance-criteria/SKILL.md` Step 6):

```bash
F="<write_contract_to value>"
STATUS="<success|partial|failed>"
VERDICT="<approve|needs_changes|blocked>"
REPORT="<absolute path to the written report>"
CRIT=<integer> IMP=<integer> SUG=<integer>
FIXED='<json-array-string for fixed_in_pipeline>'
DEFERRED='<json-array-string for deferred>'

F="$F" STATUS="$STATUS" VERDICT="$VERDICT" REPORT="$REPORT" \
CRIT="$CRIT" IMP="$IMP" SUG="$SUG" \
FIXED="$FIXED" DEFERRED="$DEFERRED" python3 -c '
import os, json
contract = {
    "schema_version": 1,
    # The contracts `phase` field is the lifecycle STEP NAME per #251 spec.
    # The validator uses this to look up the schema in its registry.
    "phase": "code-review",
    "status": os.environ["STATUS"],
    "verdict": os.environ["VERDICT"],
    "report_path": os.environ["REPORT"],
    "critical_count": int(os.environ["CRIT"]),
    "important_count": int(os.environ["IMP"]),
    "suggestion_count": int(os.environ["SUG"]),
    "fixed_in_pipeline": json.loads(os.environ["FIXED"]),
    "deferred": json.loads(os.environ["DEFERRED"]),
}
json.dump(contract, open(os.environ["F"], "w"))
print(f"[code-review] return_contract written to {os.environ[\"F\"]}")
'
```

**No `[ -f "$F" ]` guard** — fresh-create JSON file, mirrors the verify-acceptance-criteria pattern (no state-file YAML mediation). After writing, return the contract path and the verdict as the consolidator's result text:

`"Return contract written to <write_contract_to>. Verdict: <verdict> (critical=<N>, important=<N>, suggestion=<N>, deferred=<N>)."`

The orchestrator (Pattern B wrapper in `skills/start/SKILL.md`) reads this path from the result string and runs `hooks/scripts/validate-return-contract.js` against it before proceeding.

*(Turn Bridge Rule applies — call `TaskUpdate` immediately after outputting the code review report.)*
