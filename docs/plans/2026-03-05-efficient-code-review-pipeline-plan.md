# Efficient Code Review Pipeline — Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Add Reviewer Stack Affinity Table and pre-flight reviewer audit — STATUS: pending
Task 2: Add marketplace discovery to pre-flight — STATUS: pending
Task 3: Restructure code review pipeline phases (1a/1b split, conflict detection, single-pass fix) — STATUS: pending
Task 4: Update cross-references to new phase numbering — STATUS: pending
Task 5: Update Phase 5 report format — STATUS: pending
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the code review pipeline for faster execution, lower token usage, and better output quality through stack-aware filtering, report-only agents, and conflict detection.

**Architecture:** Modify `skills/start/SKILL.md` in 5 tasks: (1) add a Reviewer Stack Affinity Table and pre-flight audit section after the existing recommended plugin checks, (2) add marketplace discovery via `claude plugins search`, (3) restructure the code review pipeline from Phases 0-5 to Phases 0/1a/1b/2/3/4/5 with gated pr-review-toolkit pre-pass, report-only agents, conflict detection, and single-pass fix, (4) update all cross-references throughout SKILL.md to use new phase numbering, (5) update the Phase 5 report format.

**Tech Stack:** Markdown (SKILL.md is a Claude Code plugin skill instruction file)

---

### Task 1: Add Reviewer Stack Affinity Table and Pre-Flight Reviewer Audit

**Files:**
- Modify: `skills/start/SKILL.md:41-69` (pre-flight recommended plugin checks section)

**Acceptance Criteria:**
- [ ] A `### Reviewer Stack Affinity Table` subsection exists after `### backend-api-security (recommended)` (after line 69)
- [ ] The table contains exactly 7 rows matching the design doc (superpowers:code-reviewer, silent-failure-hunter, code-simplifier, feature-dev:code-reviewer, pr-test-analyzer, type-design-analyzer, backend-api-security:backend-security-coder)
- [ ] `silent-failure-hunter` and `code-simplifier` rows have `(internal)` marker in the Plugin column
- [ ] A `### Pre-Flight Reviewer Audit` subsection exists after the affinity table
- [ ] The audit section includes filtering logic: (1) skip `(internal)` agents, (2) check plugin installed, (3) check stack affinity intersection with `.feature-flow.yml` stack
- [ ] The audit section includes example output showing Relevant+installed, Relevant+missing, Irrelevant categories
- [ ] YOLO behavior documented: skip display, announce inline `YOLO: start — Reviewer audit → [summary]`
- [ ] The existing `### pr-review-toolkit`, `### feature-dev`, and `### backend-api-security` check subsections are preserved unchanged above the new sections

**Quality Constraints:**
- Pattern: follow the existing pre-flight subsection structure (### heading, description, code block for warnings)
- Files modified: `skills/start/SKILL.md` (design-first — 1,771 lines; output change plan before editing)

**Step 1: Read the pre-flight section (lines 13-69) and output change plan**

Read lines 13-69 to understand the exact insertion point. The new content goes after line 69 (end of backend-api-security block).

**Step 2: Insert the Reviewer Stack Affinity Table after line 69**

Add after the `### backend-api-security (recommended)` closing backticks:

```markdown
### Reviewer Stack Affinity Table

A static mapping of each code reviewer to the tech stacks it is relevant for. The orchestrator reads the `stack` field from `.feature-flow.yml` and uses this table for both the pre-flight audit and the code review pipeline dispatch.

| Reviewer | Plugin | Stack Affinity | Tier |
|----------|--------|---------------|------|
| `superpowers:code-reviewer` | superpowers | `*` (universal — all stacks) | 1 |
| `silent-failure-hunter` | pr-review-toolkit (internal) | `*` (universal) | 1 |
| `code-simplifier` | pr-review-toolkit (internal) | `*` (universal) | 2 |
| `feature-dev:code-reviewer` | feature-dev | `*` (universal) | 2 |
| `pr-test-analyzer` | pr-review-toolkit | `*` (universal) | 3 |
| `type-design-analyzer` | pr-review-toolkit | `typescript`, `node-js` | 3 |
| `backend-api-security:backend-security-coder` | backend-api-security | `node-js`, `python`, `go`, `ruby`, `java`, `supabase` | 3 |

Internal agents marked `(internal)` run inside their parent plugin's subagent — they are listed for audit visibility but are not dispatched independently during the code review pipeline.
```

**Step 3: Insert the Pre-Flight Reviewer Audit subsection**

Add after the affinity table:

```markdown
### Pre-Flight Reviewer Audit

After loading `.feature-flow.yml` and completing the recommended plugin checks above, cross-reference installed plugins against the Reviewer Stack Affinity Table to report review coverage for the current stack.

**Process:**
1. Read the `stack` field from `.feature-flow.yml`
2. For each non-internal reviewer in the affinity table:
   a. Check if the reviewer's plugin is installed (from the plugin checks above)
   b. Check if the reviewer's stack affinity includes `*` OR intersects with the project's `stack` list
   c. Classify as: relevant+installed, relevant+missing, or irrelevant
3. Report to the user:

```
Reviewer availability (stack: [stack list]):
  Relevant + installed:
    - [reviewer] ([affinity])
  Relevant + missing:
    - [reviewer] ([affinity]) — install: claude plugins add [plugin]
  Irrelevant (skipped for this stack):
    - [reviewer] ([affinity] — not matching stack)
```

**YOLO behavior:** No prompt — always auto-detected. Announce: `YOLO: start — Reviewer audit → [N] relevant ([M] installed, [K] missing), [J] irrelevant`

**Express behavior:** Same as YOLO — announce inline, no prompt.
```

**Step 4: Verify the insertion**

Run: `grep -n "Reviewer Stack Affinity Table\|Pre-Flight Reviewer Audit\|silent-failure-hunter.*internal\|type-design-analyzer.*typescript" skills/start/SKILL.md`

Expected: matches for all 4 patterns with line numbers after 69.

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add Reviewer Stack Affinity Table and pre-flight reviewer audit

Adds a static reviewer-to-stack mapping table and a pre-flight audit
that reports review coverage for the project's detected stack.

Related: #143"
```

---

### Task 2: Add Marketplace Discovery to Pre-Flight

**Files:**
- Modify: `skills/start/SKILL.md` (insert after the Pre-Flight Reviewer Audit subsection added in Task 1)

**Acceptance Criteria:**
- [ ] A `### Marketplace Discovery` subsection exists after `### Pre-Flight Reviewer Audit`
- [ ] The section runs `claude plugins search "code review"` as a single CLI call
- [ ] Results are parsed for plugins not already installed and cross-referenced against the affinity table
- [ ] Unknown plugins (not in the affinity table) are presented as "discovered — may be relevant"
- [ ] Failure handling is explicitly non-blocking: if the command fails, log a warning and continue
- [ ] YOLO behavior documented: skip display, announce inline
- [ ] The `Marketplace suggestions` line is included in the Pre-Flight Reviewer Audit example output

**Quality Constraints:**
- Error handling: marketplace failure is non-blocking — log and continue
- Pattern: follow existing pre-flight subsection structure
- Files modified: `skills/start/SKILL.md` (design-first — output change plan before editing)

**Step 1: Read the reviewer audit section (inserted in Task 1) and output change plan**

Identify the exact insertion point (after the reviewer audit's Express behavior line).

**Step 2: Insert the Marketplace Discovery subsection**

```markdown
### Marketplace Discovery

After the reviewer audit, discover additional code review plugins from the marketplace that may be relevant for the project's stack.

**Process:**
1. Run: `claude plugins search "code review"` (single CLI call)
2. Parse results for plugins not already installed
3. Cross-reference discovered plugins against the Reviewer Stack Affinity Table:
   - If a discovered plugin has known stack affinity that matches the project → suggest with install command
   - If a discovered plugin is not in the affinity table → present as "discovered — may be relevant"
4. Append marketplace suggestions to the reviewer audit output:
   ```
   Marketplace suggestions:
     - [plugin-name] (found via search, not installed) — install: claude plugins add [plugin-name]
   ```
   If no relevant suggestions found: omit this section from the audit output.

**Failure handling:** If `claude plugins search` fails (network error, CLI not available, non-zero exit), log a warning and continue: "Marketplace search failed — skipping plugin discovery. Continuing with installed plugins." This must never block the lifecycle.

**YOLO behavior:** No prompt — always auto-run. Announce: `YOLO: start — Marketplace discovery → [N] suggestions (or "search failed — skipped")`

**Express behavior:** Same as YOLO.
```

**Step 3: Update the reviewer audit example output to include marketplace suggestions**

Edit the example output in the Pre-Flight Reviewer Audit section to include the `Marketplace suggestions:` line (if not already present from the affinity table step).

**Step 4: Verify**

Run: `grep -n "Marketplace Discovery\|claude plugins search\|Marketplace search failed" skills/start/SKILL.md`

Expected: matches for all 3 patterns.

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add marketplace discovery for code review plugins during pre-flight

Runs 'claude plugins search' to discover relevant review plugins.
Non-blocking — failure logs a warning and continues.

Related: #143"
```

---

### Task 3: Restructure Code Review Pipeline Phases

**Files:**
- Modify: `skills/start/SKILL.md:1140-1395` (code review pipeline section)

This is the largest task. It replaces the current Phase 1-3 structure with Phase 1a/1b/2/3 and adds conflict detection.

**Acceptance Criteria:**
- [ ] Phase 0 (deterministic pre-filter) is unchanged (lines 1167-1201)
- [ ] Phase 1 is replaced by Phase 1a (pr-review-toolkit pre-pass, gated/sequential) and Phase 1b (report-only agents, parallel)
- [ ] Phase 1a dispatches pr-review-toolkit as isolated subagent, waits for completion, commits auto-fixes before Phase 1b
- [ ] Phase 1b dispatches only tier-eligible, stack-relevant, non-internal agents with explicit "Return findings only. Do NOT modify any files." instruction
- [ ] The scope-based agent selection table (lines 1158-1165) is updated to reference the Reviewer Stack Affinity Table for filtering and includes stack-based filtering logic
- [ ] Phase 2 (conflict detection) is a new section with: cross-phase finding merge, reject non-compliant, deduplicate, detect conflicts (±5 line range overlap), resolve by severity then agent specificity
- [ ] Phase 3 (single-pass fix) applies all conflict-free findings bottom-up by line number, single commit
- [ ] Phase 4 (targeted re-verification) remains structurally the same but references new phase numbers
- [ ] The agent dispatch table (lines 1269-1273) is preserved with all columns unchanged
- [ ] The "After Phase 3: Commit review fixes" section is removed (absorbed into Phase 3)
- [ ] YOLO continuity note is preserved at the end of Phase 5

**Quality Constraints:**
- Pattern: follow existing phase subsection structure (`#### Phase N: Title`)
- Error handling: Phase 1a failure degrades gracefully — skip pre-pass, dispatch Phase 1b without gating
- Files modified: `skills/start/SKILL.md` (design-first — output change plan before editing this ~255-line section)
- Design-first files: `skills/start/SKILL.md` — output change plan before editing

**Step 1: Read the full code review pipeline section (lines 1140-1395) and output change plan**

The change plan should describe:
- Which lines are kept unchanged (Phase 0: 1167-1201, agent table: 1269-1273)
- Which lines are replaced (Phase 1: 1203-1277 → Phase 1a + Phase 1b)
- Which lines are replaced (Phase 2: 1279-1285 → new Phase 2 conflict detection)
- Which lines are replaced (Phase 3: 1287-1325 → new Phase 3 single-pass fix)
- Which lines are modified (Phase 4: 1326-1364 → update phase references)
- Which lines are kept (Phase 5: 1366-1394)

**Step 2: Update the scope-based agent selection section**

Replace the current scope-based agent selection text (lines 1156-1165) with updated text that references the Reviewer Stack Affinity Table:

```markdown
**Scope-based agent selection with stack filtering:** Select which agents to dispatch based on scope tier AND stack relevance. The scope determines the maximum tier. The Reviewer Stack Affinity Table (defined in Pre-Flight Check) determines which agents are relevant for the project's stack.

| Scope | Max Tier | Agents to Dispatch |
|-------|----------|--------------------|
| Quick fix | — | Code review step not included for this scope |
| Small enhancement | 1 | All Tier 1 agents from affinity table where stack matches and plugin is installed |
| Feature | 2 | All Tier 1-2 agents from affinity table where stack matches and plugin is installed |
| Major feature | 3 | All Tier 1-3 agents from affinity table where stack matches and plugin is installed |

**Filtering at dispatch time:** For each reviewer in the affinity table at or below the scope's max tier:
1. Skip reviewers marked `(internal)` — they run inside their parent agent
2. Check if the reviewer's plugin is installed
3. Check if the reviewer's stack affinity includes `*` OR intersects with the project's `stack` list from `.feature-flow.yml`
4. If all conditions met → include in dispatch. Otherwise → skip with log.

The pr-review-toolkit subagent always runs in Phase 1a when pr-review-toolkit is installed and scope ≠ Quick fix — it handles internal agents (`silent-failure-hunter`, `code-simplifier`, `pr-test-analyzer`, `type-design-analyzer`) based on the scope.
```

**Step 3: Replace Phase 1 with Phase 1a and Phase 1b**

Replace the current `#### Phase 1: Dispatch review agents` section (lines 1203-1277) with:

```markdown
#### Phase 1a: pr-review-toolkit Pre-Pass (Gated)

The pr-review-toolkit runs as an isolated subagent **before** report-only agents. This preserves its internal auto-fix behavior while ensuring report-only agents see a consistent codebase.

**Process:**
1. Dispatch pr-review-toolkit subagent (subagent prompt and output format unchanged; execution order changed to sequential pre-pass):

[Keep the existing Task() prompt block from lines 1210-1248 unchanged]

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

#### Phase 1b: Report-Only Agents (Parallel)

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

[Keep the existing agent dispatch table from lines 1269-1273 unchanged]

**Availability check:** Before dispatching, apply the stack filtering logic from the scope-based agent selection section. Announce: "Running N report-only agents in parallel (Tier T — [scope], stack: [stack list])..."

**Agent failure handling:** If any agent fails, skip it and continue. Do not stall the pipeline for a single failure.
```

**Step 4: Replace Phase 2 and Phase 3 with new conflict detection and single-pass fix**

Replace current Phase 2 (lines 1279-1285), Phase 3 (lines 1287-1307), and "After Phase 3" commit section (lines 1309-1324) with:

```markdown
#### Phase 2: Conflict Detection

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

#### Phase 3: Single-Pass Fix Implementation

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
```

**Step 5: Update Phase 4 references**

In the Phase 4 section (currently lines 1326-1364), update any references to "Phase 3 fix log" to reflect the new structure. The decision table logic stays the same but references should say "Phase 3" (single-pass fix) instead of the old "Phase 3" (consolidate and fix).

**Step 6: Verify the restructured pipeline**

Run: `grep -n "Phase 1a\|Phase 1b\|Phase 2: Conflict\|Phase 3: Single-Pass\|Return findings only\|line range overlap" skills/start/SKILL.md`

Expected: matches for all 6 patterns.

**Step 7: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: restructure code review pipeline with gated pre-pass, report-only agents, and conflict detection

- Phase 1 split into Phase 1a (pr-review-toolkit pre-pass) and Phase 1b (report-only parallel agents)
- New Phase 2 for conflict detection (file + line range overlap ±5 lines)
- Phase 3 is now single-pass fix implementation with bottom-up ordering
- Scope-based agent selection now uses Reviewer Stack Affinity Table for stack filtering

Related: #143"
```

---

### Task 4: Update Cross-References to New Phase Numbering

**Files:**
- Modify: `skills/start/SKILL.md:808` (Finishing a Development Branch YOLO Override)
- Modify: `skills/start/SKILL.md:1631-1633` (Final Verification Step)

**Acceptance Criteria:**
- [ ] Line 808: "Phase 1 subagent output" updated to "Phase 1a subagent output"
- [ ] Line 808: "### Auto-Fixed section from Phase 2" updated to "### Auto-Fixed section from Phase 1a"
- [ ] Line 808: "Claude-fixes phase (Phase 3)" updated to "single-pass fix phase (Phase 3)"
- [ ] Lines 1631-1633: "Code Review Pipeline's Phase 4" reference remains correct (Phase 4 is still targeted re-verification in new scheme)
- [ ] Lines 1631-1632: "code review Phase 4" reference remains correct
- [ ] No other references to old phase numbers exist in the file (verified by grep)

**Quality Constraints:**
- Files modified: `skills/start/SKILL.md` (design-first — output change plan before editing)

**Step 1: Read line 808 and lines 1631-1633**

Identify exact text to replace.

**Step 2: Update line 808**

Replace:
```
append the PR Review Toolkit Summary (from the Phase 1 subagent output, including the `### Auto-Fixed` section from Phase 2), any findings fixed by the Claude-fixes phase (Phase 3), and any remaining minor findings.
```

With:
```
append the PR Review Toolkit Summary (from the Phase 1a subagent output, including the `### Auto-Fixed` section from Phase 1a), any findings fixed by the single-pass fix phase (Phase 3), and any remaining minor findings.
```

**Step 3: Verify lines 1631-1633 are still correct**

Phase 4 is still "targeted re-verification" in the new scheme, so these references should be correct as-is. Verify by reading and confirming.

**Step 4: Search for any remaining old phase references**

Run: `grep -n "Phase 1 subagent\|from Phase 2)\|Claude-fixes phase" skills/start/SKILL.md`

Expected: no matches (all updated).

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "fix: update cross-references to new code review phase numbering

Phase 1 → Phase 1a for pr-review-toolkit subagent references.
Phase 2 auto-fixed → Phase 1a auto-fixed.
Claude-fixes phase → single-pass fix phase.

Related: #143"
```

---

### Task 5: Update Phase 5 Report Format

**Files:**
- Modify: `skills/start/SKILL.md` (Phase 5: Report section, currently around lines 1366-1394)

**Acceptance Criteria:**
- [ ] The Phase 5 report template includes `**Stack filter:**` field
- [ ] The `### Fixed (auto)` section is renamed to `### Fixed (pr-review-toolkit pre-pass)`
- [ ] The `### Fixed (Claude)` section is renamed to `### Fixed (report-only → single pass)`
- [ ] A new `### Conflicts Resolved` section exists showing kept vs skipped findings
- [ ] The zero-agent guard message is preserved
- [ ] The YOLO continuity note is preserved at the end

**Quality Constraints:**
- Pattern: follow existing Phase 5 report template structure
- Files modified: `skills/start/SKILL.md` (design-first — output change plan before editing)

**Step 1: Read the Phase 5 section and output change plan**

**Step 2: Replace the report template**

Replace the existing report template with:

```markdown
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

**Step 3: Verify**

Run: `grep -n "Stack filter\|pr-review-toolkit pre-pass\|Conflicts Resolved\|report-only.*single pass" skills/start/SKILL.md`

Expected: matches for all 4 patterns.

**Step 4: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: update Phase 5 report format with stack filter and conflict resolution sections

Adds stack filter field, renames fix sections to reflect new pipeline
architecture, adds Conflicts Resolved section.

Related: #143"
```
