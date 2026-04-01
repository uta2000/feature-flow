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

## Phase 2: Conflict Detection

After all Phase 1b agents complete, consolidate findings from both phases and detect conflicts before applying fixes.

**Step 1 — Cross-Phase Finding Merge:**
Collect and merge findings from two sources:
- **Phase 1a** pr-review-toolkit summary (Critical/Important/Minor sections only — Auto-Fixed already committed). These are findings the toolkit identified but did not auto-fix.
- **Phase 1b** report-only agent results. These agents reviewed the code AFTER Phase 1a auto-fixes were committed, so their findings reflect the current state.

Both sources use the same structured format. Merge into a single list before deduplication.

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
1. Calculate line range overlap: finding A covers lines `[A.line - 5, A.line + 5]`, finding B covers `[B.line - 5, B.line + 5]`
2. If ranges overlap → conflict detected
3. Resolution: keep the higher-severity finding. If same severity, use agent specificity order above.
4. Log skipped findings: "Conflict at [file:line]: [Agent A] finding (severity) kept, [Agent B] finding (severity) skipped — overlapping line range"

**Output:** A conflict-free, ordered list of findings to apply (Critical first, then Important). Minor issues are logged as informational but not blocking.

## Phase 3: Single-Pass Fix Implementation

Apply all conflict-free Critical and Important findings in a single coordinated pass:

1. Sort findings by file path, then by line number (descending — apply bottom-up to avoid line number shifts)
2. For each finding, apply the concrete `fix:` code change
3. After all fixes applied, commit as a single commit:
   ```bash
   git add -A
   git commit -m "fix: apply code review fixes"
   ```

If `git commit` fails (non-zero exit): stop. Announce: "Phase 3 commit failed: [error]. Manual intervention required — do not proceed to Phase 4 until resolved."

If no Critical or Important findings exist (all clean or all Minor): skip this commit. Announce: "No review fixes to commit — code was already clean."

Otherwise, announce: "Review fixes committed as single commit (N Critical, M Important findings addressed)."

**Why bottom-up ordering:** When multiple fixes target the same file, applying from the bottom up ensures earlier line numbers remain valid.

## Phase 4: Targeted re-verification

After review fixes are committed (step above), re-verify **only what was changed** — do not re-run the full review suite.

**Step 1: Determine targeted checks**

From the Phase 3 fix log, identify which targeted checks apply. Multiple checks may apply — run all that apply.

| If this was true in Phase 3… | Run this targeted check |
|------------------------------|-------------------------|
| `pr-test-analyzer` had Critical/Important findings | Run the project test suite |
| `superpowers:code-reviewer` flagged rule 6 ("all acceptance criteria met") | Run `verify-acceptance-criteria` |
| Any *other* reporting agent (not covered by rows above) had Critical/Important findings | Re-dispatch ONLY that specific agent on changed files only (`git diff [base-branch]...HEAD`) |
| `silent-failure-hunter` or `code-simplifier` made direct fixes | Read back the changed files to confirm the fix is correct (no regression, no silent swallow introduced) |
| No Critical/Important findings from any agent (all clean) | Run `verify-acceptance-criteria` only as a baseline sanity check |

*Note: Rows are evaluated top-to-bottom; a more specific row takes precedence over the catch-all (row 3). Multiple non-overlapping rows may apply — run all matching targeted checks.*

**Step 2: Run targeted checks (parallel where possible)**

Run only the targeted checks from Step 1. Announce which checks are being run: "Targeted re-verification: [check list]."

- **Tests:** Detect test runner from project (`package.json` scripts.test → `npm test` | `Cargo.toml` → `cargo test` | `go.mod` → `go test ./...` | `mix.exs` → `mix test` | `pyproject.toml`/`pytest.ini`/`setup.cfg`/`tox.ini` → `python -m pytest` | `deno.json`/`deno.jsonc` → `deno test` | `bun.lockb`/`bun.lock`/`bunfig.toml` → `bun test`). If no runner detected, skip with log: "No test runner detected — skipping." If runner is detected but the binary is not installed (ENOENT / exit code 127), log a warning and skip: "Test binary not installed — skipping test verification." Do not count a missing binary as a test failure. Timeout: 60 seconds — if the suite times out, log a warning and skip (do not count as a failure).
- **verify-acceptance-criteria:** Run the `feature-flow:verify-acceptance-criteria` skill with the plan file path.
- **Agent re-dispatch:** Dispatch only the specific agent(s) that had Critical/Important findings, with `git diff [base-branch]...HEAD` for context. Use the same model as the original Phase 1b dispatch. All re-dispatched agents launch in a single parallel message. If an agent crashes or produces no output, do not treat it as clean — log: "Agent [name] re-dispatch produced no result — listing as unresolved in Phase 5."
- **Read-back verification:** Read the specific files modified by direct-fix agents and confirm the fix is syntactically correct and no regression is visible.

**Step 3: If all targeted checks pass → pipeline is clean**

Announce: "Targeted re-verification clean ([checks run]). Proceeding to Phase 5."

**Step 4: If any targeted check fails → one additional fix pass**

Apply fixes for the remaining failures. Commit: `fix: address re-verification failures`. If this commit fails (non-zero exit), report to the developer and proceed directly to Phase 5 without re-running targeted checks. Re-run the same targeted checks once more.
(This is the final allowed iteration — **maximum 2 total fix-verify iterations**.)

If still failing after this additional pass → report remaining issues to the developer with context for manual resolution. Proceed to Phase 5 — the developer decides whether to fix manually.

**Maximum 2 total fix-verify iterations** after Phase 3 (targeted re-verify → optional 1 additional pass). Stop after 2 iterations — report remaining issues for manual resolution.

## Phase 5: Report

**Zero-agent guard:** If all tier-selected agents were skipped (plugins unavailable), do not proceed through Phases 1a–4. Announce: "All tier-selected agents for [scope] (Tier T) were unavailable. Code review pipeline could not run — manual review recommended." Skip to Phase 5 and include a warning in the report.

Output a summary:

```
## Code Review Pipeline Results

**Agents dispatched:** N (Tier T — [scope])
**Stack filter:** [stack entries used for filtering]
**Model override:** [None | user-requested: \<model\>]
**Iterations:** M/2

### Fixed (pr-review-toolkit pre-pass)
- [agent] [file:line] [what was auto-fixed]

### Fixed (report-only → single pass)
- [severity] [file:line] [what was fixed]

### Conflicts Resolved
- [file:line] [kept agent] over [skipped agent] — [reason]

### Remaining (Minor — not blocking)
- [file:line] [description]

### Remaining (unfixed after 2 iterations)
- [file:line] [description + context for manual resolution]

**Status:** Clean / N issues remaining
```

*(Turn Bridge Rule applies — call `TaskUpdate` immediately after outputting the code review report.)*
