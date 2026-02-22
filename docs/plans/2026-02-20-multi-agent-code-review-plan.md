# Multi-Agent Code Review Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-agent code review step with an inline multi-agent pipeline that finds, fixes, and re-verifies issues automatically.

**Architecture:** All changes are markdown edits to two files — `skills/start-feature/SKILL.md` (pipeline logic, pre-flight warnings, mapping table) and `README.md` (recommended plugins, lifecycle table, installation). No new files created.

**Tech Stack:** Claude Code plugin (markdown skills, no code files to test)

---

### Task 1: Add pre-flight soft warnings for optional review plugins

Add three new subsections to the Pre-Flight Check section of SKILL.md, after the existing Context7 subsection (after line 39). These are non-blocking warnings — the lifecycle continues even if these plugins are missing.

**Files:**
- Modify: `skills/start-feature/SKILL.md:39` (after Context7 subsection, before `## Purpose`)

**Step 1: Add the three optional plugin subsections**

Insert after the Context7 subsection (after "...PreToolUse hook will all be non-functional.") and before `## Purpose`:

```markdown
### pr-review-toolkit (recommended)

Check for its presence by looking for pr-review-toolkit skills in the loaded skill list. If not found, warn but continue:

```
The pr-review-toolkit plugin is recommended for full code review coverage.
Install it: claude plugins add pr-review-toolkit
Without it, the code review pipeline will skip: code-simplifier, silent-failure-hunter, pr-test-analyzer, and type-design-analyzer.
```

### feature-dev (recommended)

Check for its presence by looking for feature-dev skills in the loaded skill list. If not found, warn but continue:

```
The feature-dev plugin is recommended for code review.
Install it: claude plugins add feature-dev
Without it, the code review pipeline will skip: feature-dev:code-reviewer.
```

### backend-api-security (recommended)

Check for its presence by looking for backend-api-security skills in the loaded skill list. If not found, warn but continue:

```
The backend-api-security plugin is recommended for security review.
Install it: claude plugins add backend-api-security
Without it, the code review pipeline will skip: backend-security-coder.
```
```

**Step 2: Verify the edit**

Read `skills/start-feature/SKILL.md` lines 39-80 and confirm:
- Three new `### [name] (recommended)` subsections exist
- Each has a check instruction and a warning message
- None say "Do not proceed" — they all say warn and continue
- `## Purpose` still follows after the new subsections

**Acceptance Criteria:**
- [ ] `skills/start-feature/SKILL.md` contains `### pr-review-toolkit (recommended)` subsection
- [ ] `skills/start-feature/SKILL.md` contains `### feature-dev (recommended)` subsection
- [ ] `skills/start-feature/SKILL.md` contains `### backend-api-security (recommended)` subsection
- [ ] All three subsections appear after `### Context7 (required)` and before `## Purpose`
- [ ] None of the three subsections contain "Do not proceed" — they are non-blocking warnings
- [ ] Each subsection lists the agents that will be skipped if the plugin is missing

---

### Task 2: Update the skill mapping table

Change the Code Review row in the skill mapping table from dispatching `superpowers:requesting-code-review` to referencing the new inline step.

**Files:**
- Modify: `skills/start-feature/SKILL.md:225` (Code review row in skill mapping table)

**Step 1: Update the Code Review row**

Change line 225 from:
```
| Code review | `superpowers:requesting-code-review` | Review feedback addressed |
```
to:
```
| Code review | No skill — inline step (see below) | All Critical/Important findings fixed, tests pass |
```

**Step 2: Verify the edit**

Read the skill mapping table and confirm:
- The Code Review row now says "No skill — inline step (see below)"
- The expected output says "All Critical/Important findings fixed, tests pass"
- The table formatting is intact (pipes align, no broken rows)

**Acceptance Criteria:**
- [ ] The skill mapping table row for "Code review" contains "No skill — inline step (see below)" in the skill column
- [ ] The expected output column for "Code review" contains "All Critical/Important findings fixed, tests pass"
- [ ] The `superpowers:requesting-code-review` string no longer appears anywhere in `skills/start-feature/SKILL.md`

---

### Task 3: Add the inline Code Review Pipeline section

Add the full pipeline logic as a new inline section in SKILL.md, following the pattern of the existing Self-Review and Documentation Lookup inline sections.

**Files:**
- Modify: `skills/start-feature/SKILL.md` (insert after Self-Review section, before Documentation Lookup section)

**Step 1: Add the Code Review Pipeline section**

Insert after the Self-Review section's closing output format block (after "- [area] follows existing patterns") and before `### Documentation Lookup Step`:

```markdown
### Code Review Pipeline Step (inline — no separate skill)

This step runs after self-review and before final verification. It dispatches multiple specialized review agents in parallel, auto-fixes findings, and re-verifies until clean. The goal is shipping clean code, not a list of TODOs.

**Prerequisites:**
- At least `superpowers:code-reviewer` must be available (always true — superpowers is required)
- Additional agents from `pr-review-toolkit`, `feature-dev`, and `backend-api-security` are used when available

**Process:**

#### Phase 1: Dispatch review agents

Dispatch all available review agents in parallel using the Task tool. Each agent receives the full branch diff (`git diff main...HEAD`).

| Agent | Plugin | Role | Fix Mode |
|-------|--------|------|----------|
| `pr-review-toolkit:code-simplifier` | pr-review-toolkit | DRY, clarity, maintainability | **Direct** — writes fixes to files |
| `pr-review-toolkit:silent-failure-hunter` | pr-review-toolkit | Silent failures, empty catches, bad fallbacks | **Direct** — auto-fixes common patterns |
| `feature-dev:code-reviewer` | feature-dev | Bugs, logic errors, security, conventions | **Report** → Claude fixes |
| `superpowers:code-reviewer` | superpowers | General quality, plan adherence | **Report** → Claude fixes |
| `pr-review-toolkit:pr-test-analyzer` | pr-review-toolkit | Test coverage quality, missing tests | **Report** → Claude fixes |
| `backend-api-security:backend-security-coder` | backend-api-security | Input validation, auth, OWASP top 10 | **Report** → Claude fixes |
| `pr-review-toolkit:type-design-analyzer` | pr-review-toolkit | Type encapsulation, invariants, type safety | **Report** → Claude fixes |

**Availability check:** Before dispatching, check which plugins are installed by looking for their skills in the loaded skill list. Skip agents whose plugins are missing. Announce: "Running N code review agents in parallel..." (where N is the count of available agents).

**Agent failure handling:** If an agent fails, crashes, or doesn't return, skip it and continue with available results. Do not stall the pipeline for a single agent failure. Log: "Agent [name] failed — skipping. Continuing with N remaining agents."

#### Phase 2: Apply direct fixes

After all agents complete, review the results from the two direct-fix agents:

1. **`code-simplifier`** — Applied structural improvements directly (DRY extraction, clarity rewrites). Summarize what changed.
2. **`silent-failure-hunter`** — Auto-fixed common patterns (`catch {}` → `catch (e) { console.error(...) }`). Summarize what changed. Flag anything complex it couldn't auto-fix.

#### Phase 3: Consolidate and fix reported findings

Collect findings from the 5 reporting agents. Consolidate them:

1. **Deduplicate by file path + line number** — if two agents flag the same location, keep the higher-severity finding
2. **If same severity**, prefer the more specific agent: security > type-design > feature-dev > superpowers > simplifier
3. **Classify by severity:** Critical, Important, Minor
4. **Fix in order:** Critical → Important. Minor issues are logged as informational but not blocking.

For each Critical and Important finding, read the agent's recommendation and apply the fix. Specific agent fix patterns:
- **`pr-test-analyzer`:** Add missing test cases, strengthen weak assertions, add edge case coverage
- **`backend-security-coder`:** Fix injection, validation, and auth issues. Critical security issues are always fixed.
- **`type-design-analyzer`:** Improve type definitions based on encapsulation and invariant feedback
- **`feature-dev:code-reviewer` + `superpowers:code-reviewer`:** Fix bugs, logic errors, and convention violations

#### Phase 4: Re-verify (fix-verify loop)

After all fixes are applied, re-verify:

1. **Run tests:** Check `package.json` for a `test` script. If found, run `npm test` (or `yarn test` / `pnpm test` based on lockfile). If not found, skip and log: "No test script configured — skipping test verification."
2. **Run `verify-acceptance-criteria`:** Check all acceptance criteria from the implementation plan still pass.

If both pass → pipeline is clean. Proceed to the next lifecycle step.

If either fails → collect the failures as new findings and loop. **Maximum 3 iterations.** Announce: "Iteration N/3: M issues remaining, fixing..."

If still failing after 3 iterations → report remaining issues to the developer with context for manual resolution. Proceed to the next lifecycle step — the developer decides whether to fix manually.

#### Phase 5: Report

Output a summary:

```
## Code Review Pipeline Results

**Agents dispatched:** N/7
**Iterations:** M/3

### Fixed (auto)
- [agent] [file:line] [what was fixed]

### Fixed (Claude)
- [severity] [file:line] [what was fixed]

### Remaining (Minor — not blocking)
- [file:line] [description]

### Remaining (unfixed after 3 iterations)
- [file:line] [description + context for manual resolution]

**Status:** Clean / N issues remaining
```
```

**Step 2: Verify the section**

Read the new section and confirm:
- Header follows the pattern: `### Code Review Pipeline Step (inline — no separate skill)`
- Contains all 5 phases: dispatch, direct fixes, consolidate, re-verify loop, report
- Agent roster table matches the design document (7 agents)
- Loop cap is 3 iterations
- Test command detection is specified
- Graceful degradation is specified
- Agent failure handling is specified
- Output format is specified

**Acceptance Criteria:**
- [ ] `skills/start-feature/SKILL.md` contains `### Code Review Pipeline Step (inline — no separate skill)` section header
- [ ] The section appears between the Self-Review section and the Documentation Lookup section
- [ ] The agent roster table lists exactly 7 agents with correct plugin, role, and fix mode columns
- [ ] Phase 4 specifies max 3 iterations for the fix-verify loop
- [ ] Phase 4 includes test command detection (check `package.json` for `test` script)
- [ ] Phase 1 includes availability check and agent failure handling
- [ ] Phase 3 includes conflict resolution: deduplicate by file+line, higher severity wins
- [ ] Phase 5 includes an output format template

---

### Task 4: Update README.md — requirements, lifecycle table, and installation

Update three sections in README.md to reflect the new multi-agent pipeline.

**Files:**
- Modify: `README.md:15-19` (Requirements section)
- Modify: `README.md:25-32` (Installation — marketplace)
- Modify: `README.md:36-43` (Installation — GitHub)
- Modify: `README.md:86` (Lifecycle table — Code review row)
- Modify: `README.md:151` (Lifecycle diagram — Code Review line)

**Step 1: Add recommended plugins to Requirements**

After the existing requirements (line 19), add:

```markdown

**Recommended** (for full code review coverage):
- [pr-review-toolkit](https://github.com/anthropics/claude-code-pr-review-toolkit) plugin (adds: code-simplifier, silent-failure-hunter, test-analyzer, type-design-analyzer)
- [feature-dev](https://github.com/anthropics/claude-code-feature-dev) plugin (adds: feature-dev:code-reviewer)
- [backend-api-security](https://github.com/anthropics/claude-code-backend-api-security) plugin (adds: backend-security-coder)
```

**Step 2: Add recommended plugin install commands**

In the marketplace installation section (after line 31), add:
```bash
# Recommended plugins (for full code review coverage)
claude plugins add pr-review-toolkit
claude plugins add feature-dev
claude plugins add backend-api-security
```

In the GitHub installation section (after line 42), add the same commands.

**Step 3: Update the lifecycle table**

Change line 86 from:
```
| Code review | superpowers | `requesting-code-review` |
```
to:
```
| Code review | **spec-driven** (inline) | Multi-agent review pipeline (7 agents, auto-fix, re-verify loop) |
```

**Step 4: Update the lifecycle diagram**

Change line 151 from:
```
14. Code Review                    ← superpowers:requesting-code-review
```
to:
```
14. Code Review                    ← inline (multi-agent pipeline: find → fix → re-verify)
```

**Step 5: Verify all README changes**

Read the modified sections and confirm:
- Requirements lists recommended plugins with descriptions
- Installation sections include recommended plugin commands
- Lifecycle table shows spec-driven ownership for Code Review
- Lifecycle diagram reflects the inline pipeline

**Acceptance Criteria:**
- [ ] `README.md` contains a "Recommended" section under Requirements listing `pr-review-toolkit`, `feature-dev`, and `backend-api-security`
- [ ] Marketplace installation section includes `claude plugins add pr-review-toolkit`, `claude plugins add feature-dev`, and `claude plugins add backend-api-security`
- [ ] GitHub installation section includes the same three recommended plugin install commands
- [ ] The lifecycle table row for "Code review" shows `**spec-driven** (inline)` as the plugin
- [ ] The lifecycle diagram line for "Code Review" no longer references `superpowers:requesting-code-review`
- [ ] `requesting-code-review` does not appear anywhere in `README.md`

---

### Task 5: Commit all changes

Stage and commit all modified files.

**Files:**
- `skills/start-feature/SKILL.md`
- `README.md`
- `docs/plans/2026-02-20-multi-agent-code-review.md`
- `docs/plans/2026-02-20-multi-agent-code-review-plan.md`

**Step 1: Stage and commit**

```bash
git add skills/start-feature/SKILL.md README.md docs/plans/2026-02-20-multi-agent-code-review.md docs/plans/2026-02-20-multi-agent-code-review-plan.md
git commit -m "feat: multi-agent code review pipeline (#3)

Replace single-agent code review dispatch with a 7-agent
find-fix-verify pipeline. Agents run in parallel, auto-fix
findings by severity, and re-verify up to 3 iterations.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Acceptance Criteria:**
- [ ] Git commit exists with message containing "multi-agent code review pipeline"
- [ ] Commit includes changes to `skills/start-feature/SKILL.md` and `README.md`
- [ ] `git status` shows clean working tree after commit
