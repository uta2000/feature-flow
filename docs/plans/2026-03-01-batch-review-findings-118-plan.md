# Batch Review Findings Before Fix Rounds Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change the code review pipeline in `skills/start/SKILL.md` from a multi-cycle sequential review-fix pattern to a single collect-then-fix-then-targeted-verify pattern, matching the proposal in issue #118.

**Architecture:** The current Code Review Pipeline Step already dispatches all agents in parallel (Phase 1) and consolidates findings in a single fix pass (Phase 3). Two gaps remain: (1) no explicit single-commit step after Phase 3 review fixes, and (2) Phase 4 re-verification runs all quality gates in a loop (max 3 iterations) instead of targeted checks relevant to what was actually fixed. This plan closes both gaps.

**Tech Stack:** Markdown instruction editing only — no code files. Single target file: `skills/start/SKILL.md`.

---

### Task 1: Add single-commit step between Phase 3 and Phase 4

**Files:**
- Modify: `skills/start/SKILL.md` (design-first — ~1,600 lines)

**What this addresses:**
Issue #118 acceptance criteria: "Single commit for all review fixes (not one per reviewer)". Currently there is no commit instruction within the code review pipeline. Review fixes are applied in Phase 3 and committed implicitly at the end of the lifecycle. Adding an explicit single-commit step makes this behavior guaranteed and visible.

**Step 1: Read the target section**

Read `skills/start/SKILL.md` starting at line 1251 (Phase 3) through line 1300 (Phase 5 header) to confirm the exact current text before editing.

**Step 2: Design the change plan**

Change plan for `skills/start/SKILL.md`:
- Locate the block `#### Phase 4: Re-verify (fix-verify loop)` (currently at line 1272)
- Insert a new subsection BEFORE Phase 4 titled `#### After Phase 3: Commit review fixes (single commit)`
- This adds exactly one new block between Phase 3 and Phase 4

New block to insert:

```markdown
#### After Phase 3: Commit review fixes (single commit)

After applying all Critical and Important fixes from Phase 3, commit them as a **single commit** before re-verification. This ensures all review fixes land in one commit, not one per reviewer.

```bash
git add -A
git commit -m "fix: apply code review fixes"
```

If nothing was modified in Phase 3 (all agents returned clean): skip this commit. Announce: "No review fixes to commit — code was already clean."

Otherwise announce: "Review fixes committed as single commit (N Critical, M Important findings addressed)."
```

**Step 3: Apply the edit**

Use Edit tool to insert the new block between Phase 3 content and the existing `#### Phase 4: Re-verify (fix-verify loop)` header.

The exact `old_string` to match:
```
#### Phase 4: Re-verify (fix-verify loop)
```

The `new_string` to replace with (insert new section, then the original Phase 4 header):
```
#### After Phase 3: Commit review fixes (single commit)

After applying all Critical and Important fixes from Phase 3, commit them as a **single commit** before re-verification. This ensures all review fixes land in one commit, not one per reviewer.

```bash
git add -A
git commit -m "fix: apply code review fixes"
```

If nothing was modified in Phase 3 (all agents returned clean): skip this commit. Announce: "No review fixes to commit — code was already clean."

Otherwise announce: "Review fixes committed as single commit (N Critical, M Important findings addressed)."

#### Phase 4: Re-verify (fix-verify loop)
```

**Step 4: Verify**

Grep the file for "After Phase 3: Commit review fixes" to confirm the new section is present.

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` contains the heading `#### After Phase 3: Commit review fixes (single commit)`
- [ ] The section contains `git commit -m "fix: apply code review fixes"`
- [ ] The section appears between the Phase 3 content and the Phase 4 heading (grep for `After Phase 3` and confirm it precedes `Phase 4` in line order)
- [ ] The new section handles the "nothing to commit" edge case (text mentions "skip this commit")

**Quality Constraints:**
- Pattern: follow existing phase documentation style — `####` heading, prose explanation, bash code block, edge case handling, announcements
- Files modified: `skills/start/SKILL.md` (design-first — very large file, read before editing)
- Function length/extraction: N/A (markdown instructions)
- Error handling pattern: include edge case for "nothing to commit" (already in spec above)

---

### Task 2: Replace Phase 4 with targeted re-verification logic

**Files:**
- Modify: `skills/start/SKILL.md` (design-first — ~1,600 lines)

**What this addresses:**
Issue #118 acceptance criteria: "Re-verification targets only reviewers that had critical/important findings" and "Total review-fix cycles reduced from N (one per reviewer) to 1-2 (collect + fix + optional re-verify)". Currently Phase 4 runs tests + verify-acceptance-criteria in a loop of up to 3 iterations regardless of what was fixed. The replacement makes re-verification targeted and caps iterations at 2.

**Step 1: Read the target section**

Read `skills/start/SKILL.md` from line 1272 to line 1330 to get the complete current Phase 4 text.

**Step 2: Design the change plan**

The current Phase 4 content (to be replaced):
```
#### Phase 4: Re-verify (fix-verify loop)

After all fixes are applied, re-verify:

**Parallelization:** When running quality checks inline, dispatch typecheck, lint, and type-sync as parallel Bash commands in a single message. These are independent checks. Only run tests after typecheck passes (tests depend on valid types).

**Skip if clean:** Before running quality checks in each iteration, check `git status --porcelain`. If no files changed (output is empty) since the last successful quality gate pass within this pipeline, skip the quality gate re-run and announce: "Quality gates passed at [commit] — no changes since last check. Skipping re-verify." Only run `verify-acceptance-criteria` (step 2 below).

1. **Run tests:** Detect the test runner from the project (matching the quality gate's `detectTestCommand()` in `hooks/scripts/quality-gate.js`):
   - `package.json` with `scripts.test` (not the npm default placeholder) → `npm test`. If `node_modules` doesn't exist, skip with warning.
   - `Cargo.toml` → `cargo test`
   - `go.mod` → `go test ./...`
   - `mix.exs` → `mix test`
   - `pyproject.toml` / `pytest.ini` / `setup.cfg` / `tox.ini` → `python -m pytest`
   - `deno.json` / `deno.jsonc` → `deno test` (verify `deno` is installed first; if not, skip with warning)
   - `bun.lockb` / `bun.lock` / `bunfig.toml` → `bun test` (verify `bun` is installed first; if not, skip with warning)
   - If no test runner detected, skip and log: "No test runner detected — skipping test verification."
   - **Timeout:** 60 seconds. If the test suite times out, log a warning and skip (do not count as a failure).
   - **Error handling:** If the test command is not found (ENOENT / exit code 127), log a warning and skip. Do not fail the pipeline for a missing tool.
2. **Run `verify-acceptance-criteria`:** Check all acceptance criteria from the implementation plan still pass.

If both pass → pipeline is clean. Proceed to the next lifecycle step.

If either fails → collect the failures as new findings and loop. **Maximum 3 iterations.** Announce: "Iteration N/3: M issues remaining, fixing..."

If still failing after 3 iterations → report remaining issues to the developer with context for manual resolution. Proceed to the next lifecycle step — the developer decides whether to fix manually.
```

The replacement content:

```
#### Phase 4: Targeted re-verification

After review fixes are committed (step above), re-verify **only what was changed** — do not re-run the full review suite.

**Step 1: Determine targeted checks**

From the Phase 3 fix log, identify which targeted checks apply. Multiple checks may apply — run all that apply.

| If this was true in Phase 3… | Run this targeted check |
|------------------------------|-------------------------|
| `pr-test-analyzer` had Critical/Important findings | Run the project test suite |
| `superpowers:code-reviewer` flagged an acceptance criteria rule violation | Run `verify-acceptance-criteria` |
| Any reporting agent had Critical/Important findings | Re-dispatch ONLY that specific agent on changed files only (`git diff [base-branch]...HEAD`) |
| `silent-failure-hunter` or `code-simplifier` made direct fixes | Read back the changed files to confirm the fix is correct (no regression, no silent swallow introduced) |
| No Critical/Important findings from any agent (all clean) | Run `verify-acceptance-criteria` only as a baseline sanity check |

**Step 2: Run targeted checks (parallel where possible)**

Run only the targeted checks from Step 1. Announce which checks are being run: "Targeted re-verification: [check list]."

- **Tests:** Detect test runner from project (`package.json` scripts.test → `npm test` | `Cargo.toml` → `cargo test` | `go.mod` → `go test ./...` | `mix.exs` → `mix test` | `pyproject.toml`/`pytest.ini`/`setup.cfg`/`tox.ini` → `python -m pytest` | `deno.json`/`deno.jsonc` → `deno test` | `bun.lockb`/`bun.lock`/`bunfig.toml` → `bun test`). If no runner detected, skip with log. Timeout: 60 seconds.
- **verify-acceptance-criteria:** Run the `feature-flow:verify-acceptance-criteria` skill with the plan file path.
- **Agent re-dispatch:** Dispatch only the specific agent(s) that had Critical/Important findings, with `git diff [base-branch]...HEAD` for context. Use the same model as the original Phase 1 dispatch. All re-dispatched agents launch in a single parallel message.
- **Read-back verification:** Read the specific files modified by direct-fix agents and confirm the fix is syntactically correct and no regression is visible.

**Step 3: If all targeted checks pass → pipeline is clean**

Announce: "Targeted re-verification clean ([checks run]). Proceeding to Phase 5."

**Step 4: If any targeted check fails → one additional fix pass**

Apply fixes for the remaining failures. Commit: `fix: address re-verification failures`. Re-run the same targeted checks once more.

If still failing after this additional pass → report remaining issues to the developer with context for manual resolution. Proceed to Phase 5 — the developer decides whether to fix manually.

**Maximum 2 total fix-verify iterations** after Phase 3 (targeted re-verify → optional 1 additional pass). Do NOT loop beyond 2 iterations.
```

**Step 3: Apply the edit**

Use Edit tool with the exact `old_string` matching the current Phase 4 content and `new_string` being the replacement above. The old_string must match exactly from `#### Phase 4: Re-verify (fix-verify loop)` through the last sentence "...the developer decides whether to fix manually."

**Step 4: Verify**

Run these checks:
1. `grep -n "Maximum 3 iterations" skills/start/SKILL.md` → must return no results (old content gone)
2. `grep -n "Targeted re-verification" skills/start/SKILL.md` → must return at least 2 results (heading + announce line)
3. `grep -n "Maximum 2 total fix-verify iterations" skills/start/SKILL.md` → must return 1 result
4. `grep -n "targeted checks" skills/start/SKILL.md` → must return multiple results

**Acceptance Criteria:**
- [ ] `grep "Maximum 3 iterations" skills/start/SKILL.md` returns no results (old loop language removed)
- [ ] `grep "Maximum 2 total fix-verify iterations" skills/start/SKILL.md` returns 1 result
- [ ] `grep "Targeted re-verification" skills/start/SKILL.md` returns at least 2 results
- [ ] The Phase 4 section contains a table mapping agent-finding-type to targeted-check
- [ ] The Phase 4 section instructs re-dispatching "ONLY that specific agent on changed files" (not all agents)
- [ ] Phase 5 report template `**Iterations:** M/3` is updated to `**Iterations:** M/2` (max 2)

**Quality Constraints:**
- Pattern: follow existing phase documentation style — bold steps, table for mappings, inline code for commands
- Files modified: `skills/start/SKILL.md` (design-first — very large file, read target section before editing)
- Edge cases: cover "no critical/important findings" (baseline sanity check), "direct-fix agents made changes" (read-back verification), "re-dispatched agent also fails" (1 additional pass then report)

---

### Task 3: Update Phase 5 report template to reflect 2-iteration max

**Files:**
- Modify: `skills/start/SKILL.md` (design-first — ~1,600 lines)

**What this addresses:**
The Phase 5 report template currently shows `**Iterations:** M/3` which references the old max-3 loop. After Task 2 changes Phase 4 to a max-2 pattern, the report template needs to match.

**Step 1: Read the Phase 5 section**

Read `skills/start/SKILL.md` from line 1299 to line 1330 to confirm the exact current report template.

**Step 2: Apply the edit**

Use Edit tool to change:
```
**Iterations:** M/3
```
to:
```
**Iterations:** M/2
```

**Step 3: Verify**

`grep -n "Iterations.*M" skills/start/SKILL.md` → must show `M/2`, not `M/3`.

**Acceptance Criteria:**
- [ ] `grep "Iterations.*M/3" skills/start/SKILL.md` returns no results
- [ ] `grep "Iterations.*M/2" skills/start/SKILL.md` returns 1 result

**Quality Constraints:**
- Files modified: `skills/start/SKILL.md` (design-first — read before editing)
- This is a minimal mechanical change — only the fraction denominator changes

---

### Task 4: Verify all issue #118 acceptance criteria are met

**Files:**
- Read: `skills/start/SKILL.md`

**Step 1: Run mechanical checks for each acceptance criterion**

For each criterion from issue #118, run the verification command:

```bash
# Criterion 1: Review orchestration collects all findings before any fixes
grep -n "Phase 1.*Dispatch\|all agents.*parallel\|before any fix" skills/start/SKILL.md | head -5

# Criterion 2: Findings from all reviewers merged and deduplicated
grep -n "Deduplicate\|deduplicate" skills/start/SKILL.md | head -5

# Criterion 3: Single fix round addresses all findings
grep -n "single fix\|Fix in order.*Critical.*Important" skills/start/SKILL.md | head -5

# Criterion 4: Single commit for all review fixes
grep -n "single commit\|Commit review fixes" skills/start/SKILL.md | head -5

# Criterion 5: Re-verification targets only reviewers with critical/important findings
grep -n "Targeted re-verification\|only that specific agent\|targeted checks" skills/start/SKILL.md | head -5

# Criterion 6: Total cycles reduced to 1-2
grep -n "Maximum 2 total\|1-2\|max 2" skills/start/SKILL.md | head -5
```

**Step 2: Report pass/fail for each criterion**

If all pass, announce: "All 6 issue #118 acceptance criteria verified in SKILL.md."
If any fail, document which are missing and what additional edits are needed.

**Acceptance Criteria:**
- [ ] All 6 grep commands from Step 1 return at least 1 result
- [ ] No acceptance criterion from issue #118 is unaddressed in the skill file
- [ ] The file is syntactically valid markdown (no broken headers, unclosed code fences)

**Quality Constraints:**
- This task is read-only verification — do not modify the file
- Files modified: none (verification only)
