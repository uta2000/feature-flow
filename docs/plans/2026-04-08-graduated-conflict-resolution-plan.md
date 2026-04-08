# Graduated Merge Conflict Resolution — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Implement the 4-tier merge conflict resolution ladder (Tier 1 auto / Tier 2 test-verified / Tier 3 diff-presentation / Tier 4 skip) by updating `skills/merge-prs/references/conflict-resolution.md` and `skills/merge-prs/SKILL.md` to match the design document.

**Architecture:** This is a **documentation-only change**. Feature-flow is a Markdown skill plugin — there is no runtime code. "Implementation" means adding/editing specific sections, tables, examples, and rules in two Markdown files. Verification is grep-based (content-exists assertions) because the "code under test" is prose that downstream Claude sessions will read and follow.

**Tech Stack:** Markdown (CommonMark + GitHub Flavored Markdown). Bash `grep` / `wc` / `test` for machine verification. No new runtime dependencies.

**Design doc:** [`docs/plans/2026-04-08-graduated-conflict-resolution.md`](2026-04-08-graduated-conflict-resolution.md)

**Issue:** #225

**Files touched:**
- `skills/merge-prs/references/conflict-resolution.md` (extend)
- `skills/merge-prs/SKILL.md` (extend)

---

## Task Breakdown

Tasks are ordered so that each produces a self-contained commit that a reviewer can read independently. Later tasks depend on earlier ones (e.g., Task 6 adds an Example that references Tier 2, so Task 1 must land first).

---

### Task 1: Add Tier 2 (attempt-with-test-verification) section to conflict-resolution.md

**Files:**
- Modify: `skills/merge-prs/references/conflict-resolution.md` (insert new section after the existing "Behavioral Conflicts" section, before the "Design Doc Context Loading" section at line 88)

**Step 1: Add the Tier 2 section**

Insert a new `## Tier 2: Attempt-with-Test-Verification (NEW)` section containing:
- A short "When this applies" paragraph explaining Tier 2 targets cases the behavioral keyword check would currently flag, but where an additive union merge is mechanically safe (quoting the design doc's Step 2 language).
- A numbered procedure: (1) attempt additive merge, (2) discover test runner, (3) run tests with hard timeout, (4) commit + push on green OR (5) discard via `git checkout -- .` and fall through to Tier 3 on red.
- A "Commit message contract" sub-bullet specifying the exact format: `merge: resolve conflict, verified by tests`
- A "Mode Behavior" 3-column table (YOLO | Express | Interactive) matching the design doc's Mode Behavior table rows for Tier 2.
- An announcement template block showing the Tier 2 attempt / success / failure formats from the design doc.

**Step 2: Verify the section was added**

Run:
```bash
grep -c '^## Tier 2' skills/merge-prs/references/conflict-resolution.md
grep -q 'merge: resolve conflict, verified by tests' skills/merge-prs/references/conflict-resolution.md
grep -q 'git checkout -- \.' skills/merge-prs/references/conflict-resolution.md
grep -q 'additive union merge\|additive merge' skills/merge-prs/references/conflict-resolution.md
```
Expected: first count >= 1; all three `grep -q` commands exit 0.

**Step 3: Commit**

```bash
git add skills/merge-prs/references/conflict-resolution.md
git commit -m "docs(merge-prs): add Tier 2 attempt-with-test-verification to conflict-resolution.md"
```

**Acceptance Criteria:**
- [ ] Tier 2 H2 section header exists in conflict-resolution.md measured by at least one H2 match verified by `test $(grep -c '^## Tier 2' skills/merge-prs/references/conflict-resolution.md) -ge 1`
- [ ] Commit message contract literal present measured by exact string match verified by `grep -q 'merge: resolve conflict, verified by tests' skills/merge-prs/references/conflict-resolution.md`
- [ ] Discard instruction present measured by literal checkout match verified by `grep -q 'git checkout -- \.' skills/merge-prs/references/conflict-resolution.md`
- [ ] Additive merge concept documented measured by regex match verified by `grep -Eq 'additive (union )?merge' skills/merge-prs/references/conflict-resolution.md`
- [ ] Mode Behavior table present within Tier 2 section measured by YOLO token appearing within 30 lines after the Tier 2 heading verified by `grep -A 30 '^## Tier 2' skills/merge-prs/references/conflict-resolution.md | grep -q 'YOLO'`

**Quality Constraints:**
- Style: Markdown prose matches existing conflict-resolution.md conventions — H2 for tier sections, H3 for subsections, fenced code blocks with language hints, 3-column mode tables with `YOLO | Express | Interactive` headers
- Terminology: Uses exact terms from the design doc — "additive merge", "structural independence gate", "safety invariant"
- Cross-reference integrity: Does not embed SKILL.md line numbers (line-number-free prose only)
- Pattern: Follow the existing "Trivial Conflicts" subsection structure as a template

---

### Task 2: Rename "Behavioral Conflicts" section to "Tier 3: Diff Presentation" and add Tier 3 content

**Files:**
- Modify: `skills/merge-prs/references/conflict-resolution.md:46-85` (the current "Behavioral Conflicts" section)

**Step 1: Rename the section header**

Change `### Behavioral Conflicts (require confirmation)` to `## Tier 3: Diff Presentation (Always Pauses)`. Promote from H3 to H2 so Tier 1/2/3/4 are sibling sections.

**Step 2: Add the Tier 3-specific content**

Within the section:
- Add an opening paragraph: "Tier 3 always pauses via `AskUserQuestion`, regardless of mode. This is the safety invariant of the ladder."
- Keep the existing "Never auto-resolve" sentence.
- Keep the existing Type/Detection heuristic table (it still documents the patterns that trigger Tier 3).
- Update the `AskUserQuestion` options list: add **"Accept proposed"** as the first option (takes the Tier 2 merge attempt if any), keeping the existing "Accept ours" / "Accept theirs" / "I'll resolve manually" / "Skip this PR" as options 2-5.
- Add a "Presentation contents" sub-bullet: the raw conflict diff (trimmed to 40 lines), the Tier 2 proposed resolution (if any), and test failure output (if Tier 2 was attempted and failed).

**Step 3: Verify the rename and content**

Run:
```bash
! grep -q '^### Behavioral Conflicts' skills/merge-prs/references/conflict-resolution.md
grep -q '^## Tier 3' skills/merge-prs/references/conflict-resolution.md
grep -q 'Accept proposed' skills/merge-prs/references/conflict-resolution.md
grep -q 'safety invariant' skills/merge-prs/references/conflict-resolution.md
grep -q 'Always Pauses\|always pause' skills/merge-prs/references/conflict-resolution.md
```
Expected: all commands exit 0.

**Step 4: Commit**

```bash
git add skills/merge-prs/references/conflict-resolution.md
git commit -m "docs(merge-prs): rename Behavioral Conflicts to Tier 3 and add diff-presentation spec"
```

**Acceptance Criteria:**
- [ ] Old "Behavioral Conflicts" H3 header removed measured by zero matches verified by `! grep -q '^### Behavioral Conflicts' skills/merge-prs/references/conflict-resolution.md`
- [ ] Tier 3 H2 section header exists measured by at least one H2 match verified by `grep -q '^## Tier 3' skills/merge-prs/references/conflict-resolution.md`
- [ ] "Accept proposed" option present in Tier 3 options list measured by literal string match verified by `grep -q 'Accept proposed' skills/merge-prs/references/conflict-resolution.md`
- [ ] Safety invariant statement present measured by literal string match verified by `grep -q 'safety invariant' skills/merge-prs/references/conflict-resolution.md`
- [ ] "Always pauses" pause-semantics documented measured by regex match verified by `grep -Eq 'Always Pauses|always pause' skills/merge-prs/references/conflict-resolution.md`

**Quality Constraints:**
- Style: Markdown prose matches existing conflict-resolution.md conventions — H2 for tier sections, 5-option `AskUserQuestion` lists as bulleted items
- Terminology: Uses exact terms "safety invariant", "Always Pauses"; "Accept proposed" must appear as the FIRST option in the list (before "Accept ours")
- Preservation: Existing behavioral detection heuristic table and "Design Doc Context Loading" section must remain intact and unrenamed
- Pattern: Follow existing Tier 3 option-list structure from the current `AskUserQuestion` block in conflict-resolution.md

---

### Task 3: Add Test Runner Discovery subsection

**Files:**
- Modify: `skills/merge-prs/references/conflict-resolution.md` (add new subsection under Tier 2)

**Step 1: Add the subsection**

Add a `### Test Runner Discovery` subsection (H3, nested under Tier 2's H2) containing:
- **Discovery order:** a numbered list — (1) explicit config `merge.conflict_resolution.test_command` in `.feature-flow.yml`, (2) stack-based detection for `node-js` (lockfile → `pnpm test` / `yarn test` / `npm test`), (3) stack-based detection for `python` (`pytest.ini`/`pyproject.toml`/`setup.cfg` → `pytest`), (4) no match → skip Tier 2 with reason `test-runner-not-found`.
- A code block showing the exact bash detection for the node-js stack (ls-based lockfile check).
- A note that `packageManager` field in `package.json` wins over lockfile heuristics if present.

**Step 2: Verify**

```bash
grep -q '^### Test Runner Discovery' skills/merge-prs/references/conflict-resolution.md
grep -q 'merge.conflict_resolution.test_command' skills/merge-prs/references/conflict-resolution.md
grep -q 'pnpm-lock.yaml' skills/merge-prs/references/conflict-resolution.md
grep -q 'pytest' skills/merge-prs/references/conflict-resolution.md
grep -q 'test-runner-not-found' skills/merge-prs/references/conflict-resolution.md
```
Expected: all exit 0.

**Step 3: Commit**

```bash
git add skills/merge-prs/references/conflict-resolution.md
git commit -m "docs(merge-prs): add Test Runner Discovery subsection for Tier 2"
```

**Acceptance Criteria:**
- [ ] Test Runner Discovery H3 subsection exists measured by header presence verified by `grep -q '^### Test Runner Discovery' skills/merge-prs/references/conflict-resolution.md`
- [ ] Explicit config key documented measured by literal string match verified by `grep -q 'merge.conflict_resolution.test_command' skills/merge-prs/references/conflict-resolution.md`
- [ ] pnpm lockfile detection mentioned measured by literal match verified by `grep -q 'pnpm-lock.yaml' skills/merge-prs/references/conflict-resolution.md`
- [ ] Python pytest runner mentioned measured by literal match verified by `grep -q 'pytest' skills/merge-prs/references/conflict-resolution.md`
- [ ] Fallback reason documented measured by literal match verified by `grep -q 'test-runner-not-found' skills/merge-prs/references/conflict-resolution.md`

**Quality Constraints:**
- Style: H3 subsection under the Tier 2 H2, numbered discovery order list, fenced bash code block for the ls-based detection
- Terminology: Uses exact config key `merge.conflict_resolution.test_command` and skip reason `test-runner-not-found` (no variants)
- Cross-reference integrity: Config key naming matches the existing `merge.ci_remediation.*` pattern from ci-remediation.md
- Pattern: Follow the numbered-list discovery pattern from the design doc § Test Runner Discovery section

---

### Task 4: Add Timeout Detection subsection

**Files:**
- Modify: `skills/merge-prs/references/conflict-resolution.md` (add new subsection under Tier 2, after Test Runner Discovery)

**Step 1: Add the subsection**

Add a `### Timeout Detection` subsection (H3) containing:
- An explanation that macOS does not ship `timeout` by default.
- A bash detection block (copied from the design doc) that tries `timeout` → `gtimeout` → bash-kill fallback.
- The bash-kill fallback pattern with background-job + sleep + kill-TERM.
- A note that the default timeout is 5 minutes, configurable via `merge.conflict_resolution.test_timeout_minutes` (minimum 1 minute).

**Step 2: Verify**

```bash
grep -q '^### Timeout Detection' skills/merge-prs/references/conflict-resolution.md
grep -q 'gtimeout' skills/merge-prs/references/conflict-resolution.md
grep -q 'test_timeout_minutes' skills/merge-prs/references/conflict-resolution.md
grep -q 'kill -TERM' skills/merge-prs/references/conflict-resolution.md
```
Expected: all exit 0.

**Step 3: Commit**

```bash
git add skills/merge-prs/references/conflict-resolution.md
git commit -m "docs(merge-prs): add Timeout Detection subsection with macOS fallback"
```

**Acceptance Criteria:**
- [ ] Timeout Detection H3 subsection exists measured by header presence verified by `grep -q '^### Timeout Detection' skills/merge-prs/references/conflict-resolution.md`
- [ ] macOS gtimeout alternative mentioned measured by literal match verified by `grep -q 'gtimeout' skills/merge-prs/references/conflict-resolution.md`
- [ ] Timeout config key documented measured by literal match verified by `grep -q 'test_timeout_minutes' skills/merge-prs/references/conflict-resolution.md`
- [ ] Bash kill fallback pattern present measured by literal signal match verified by `grep -q 'kill -TERM' skills/merge-prs/references/conflict-resolution.md`
- [ ] Default 5-minute timeout documented measured by regex match verified by `grep -Eq '5 minutes|default.*5' skills/merge-prs/references/conflict-resolution.md`

**Quality Constraints:**
- Style: H3 subsection under the Tier 2 H2, fenced bash code blocks for the detection and fallback patterns
- Terminology: Config key `merge.conflict_resolution.test_timeout_minutes` (exact); minimum value 1 stated explicitly
- Cross-reference integrity: Detection bash block must exactly match the design doc's Timeout Detection code block (byte-for-byte, including comments)
- Pattern: Follow the shell-detection-then-fallback pattern; document both `command -v` detection and the background-kill fallback

---

### Task 5: Update Structure Classification to route to Tier 2

**Files:**
- Modify: `skills/merge-prs/references/conflict-resolution.md:26-85` (the Structure Classification pre-filter and behavioral keyword check)

**Step 1: Update the Structure Classification routing**

In the existing "Structure Classification (pre-filter)" section, update the "How to apply" numbered steps so that step 6 (currently "→ proceed to behavioral keyword check") routes to a new decision:

After the behavioral keyword check matches, apply a **structural independence gate** (from the design doc Step 2). If the gate passes → Tier 2. If it does not pass → Tier 3. Add a short code/pseudocode block for the gate.

Also update the classification table to list Tier 2 as the destination for "Both-sided modification (structurally independent)" and Tier 3 for "Both-sided modification (semantic overlap)".

**Step 2: Update the behavioral keyword check text**

The existing `Step 2: Keyword check` note should be expanded to say: "If keywords match, run the structural independence gate (defined in the Tier 2 section). Pass → Tier 2. Fail → Tier 3."

**Step 3: Verify**

```bash
grep -q 'structural independence gate\|Structural Independence' skills/merge-prs/references/conflict-resolution.md
grep -q 'semantic overlap' skills/merge-prs/references/conflict-resolution.md
# The classification table should now reference Tier 2 and Tier 3:
grep -Ec '\| (Tier [123]|TRIVIAL|trivial) ' skills/merge-prs/references/conflict-resolution.md
```
Expected: first two grep -q commands exit 0; third count >= 2 (at least Tier 2 and Tier 3 referenced in tables).

**Step 4: Commit**

```bash
git add skills/merge-prs/references/conflict-resolution.md
git commit -m "docs(merge-prs): route Structure Classification to Tier 2 via independence gate"
```

**Acceptance Criteria:**
- [ ] Structural independence gate referenced in Structure Classification measured by regex match verified by `grep -Eq 'structural independence gate|Structural Independence' skills/merge-prs/references/conflict-resolution.md`
- [ ] Semantic overlap terminology used in routing decision measured by literal match verified by `grep -q 'semantic overlap' skills/merge-prs/references/conflict-resolution.md`
- [ ] Tier 2 referenced at least 3 times (header + routing + cross-reference) measured by count verified by `test $(grep -c 'Tier 2' skills/merge-prs/references/conflict-resolution.md) -ge 3`
- [ ] Tier 3 referenced at least 3 times (header + routing + cross-reference) measured by count verified by `test $(grep -c 'Tier 3' skills/merge-prs/references/conflict-resolution.md) -ge 3`
- [ ] Existing Tier 1 rules (one-sided, adjacent additions, context-only) remain unchanged measured by literal match on preserved line verified by `grep -q 'one-sided modification' skills/merge-prs/references/conflict-resolution.md`

**Quality Constraints:**
- Style: Update the existing "How to apply" numbered list in-place; do not duplicate the step numbering
- Terminology: Use "structural independence gate" (lowercase) as the canonical term; "semantic overlap" as the opposite
- Preservation: Tier 1 rules (one-sided modification, adjacent additions, context-only keywords) must NOT be modified — only the "both-sided modification" routing changes
- Pattern: Follow the existing step-by-step "Step 1: ... Step 2: ..." structure in the Behavioral Detection heuristic

---

### Task 6: Add Example 7 (Tier 2 success + escalation)

**Files:**
- Modify: `skills/merge-prs/references/conflict-resolution.md` (add new example at the end of the Examples section)

**Step 1: Add Example 7**

Add a `### Example 7: Structurally-independent both-sided modification — Tier 2` block containing:
- A realistic conflict diff showing both sides adding different statements in the same function body (one side adds `rateLimit()`, the other adds `validatePassword()`), both with behavioral keywords nearby, but with non-overlapping semantic targets.
- An "Old classification" line explaining why the behavioral keyword check would have flagged this as behavioral and paused.
- A "New classification" line explaining routing to Tier 2, the additive merge, and the test verification step.
- A "Tier 2 outcome" block showing both paths:
  - **Tests pass:** commit with `merge: resolve conflict, verified by tests`, continue.
  - **Tests fail:** discard via `git checkout -- .`, escalate to Tier 3 with test output captured.

**Step 2: Verify**

```bash
grep -q '^### Example 7' skills/merge-prs/references/conflict-resolution.md
# Count all examples — should be >= 7 now:
grep -c '^### Example [0-9]' skills/merge-prs/references/conflict-resolution.md
```
Expected: first grep exits 0; count >= 7.

**Step 3: Commit**

```bash
git add skills/merge-prs/references/conflict-resolution.md
git commit -m "docs(merge-prs): add Example 7 for Tier 2 success and escalation"
```

**Acceptance Criteria:**
- [ ] Example 7 H3 header exists measured by header presence verified by `grep -q '^### Example 7' skills/merge-prs/references/conflict-resolution.md`
- [ ] At least 7 distinct numbered examples present measured by count of `### Example N` headers verified by `test $(grep -c '^### Example [0-9]' skills/merge-prs/references/conflict-resolution.md) -ge 7`
- [ ] Example 7 documents the Tests-pass path measured by literal match within 40 lines after header verified by `grep -A 40 '^### Example 7' skills/merge-prs/references/conflict-resolution.md | grep -q 'Tests pass'`
- [ ] Example 7 documents the Tests-fail escalation path measured by literal match within 40 lines verified by `grep -A 40 '^### Example 7' skills/merge-prs/references/conflict-resolution.md | grep -q 'escalate'`
- [ ] Example 7 shows realistic conflict markers measured by presence of diff markers verified by `grep -A 40 '^### Example 7' skills/merge-prs/references/conflict-resolution.md | grep -q '<<<<<<<'`

**Quality Constraints:**
- Style: H3 header at the same level as Examples 1-6, fenced code block for the diff, "Old classification" and "New classification" labels matching Examples 4 and 5
- Terminology: Uses "additive merge", "Tier 2", "Tier 3", matching the rest of the file
- Preservation: Must not modify Examples 1-6
- Pattern: Follow Example 4 (additive-only reclassification) and Example 5 (context-only keywords) as the structural template for the Old/New classification narrative

---

### Task 7: Update SKILL.md §Conflict Resolution summary to the 4-tier ladder

**Files:**
- Modify: `skills/merge-prs/SKILL.md:223-249` (the §Conflict Resolution section)

**Step 1: Rewrite the summary section**

Replace the current numbered summary (steps 1-7) with an updated version that describes the 4-tier ladder:
1. Create the conflict worktree (unchanged).
2. Merge base branch into the worktree (unchanged).
3. For each conflict, classify via Structure Classification → route to Tier 1 / Tier 2 / Tier 3 / Tier 4.
4. **Tier 1:** auto-resolve, announce.
5. **Tier 2:** attempt additive merge, run tests with timeout, commit with `merge: resolve conflict, verified by tests` if green; otherwise discard and escalate to Tier 3.
6. **Tier 3:** present diff + proposed resolution + test failure (if any), pause via `AskUserQuestion`. ALWAYS pauses, even in YOLO.
7. **Tier 4:** skip PR with reason, continue with next PR.
8. After resolution: existing `git add . && git commit && git push` flow.
9. Cleanup worktree (unchanged — keep the existing CWD Safety Guard block verbatim).

**Step 2: Verify the CWD Safety Guard is unchanged**

```bash
grep -q 'CWD Safety Guard' skills/merge-prs/SKILL.md
grep -q 'ORIG_DIR=\$(pwd)' skills/merge-prs/SKILL.md
grep -q 'Tier 1' skills/merge-prs/SKILL.md
grep -q 'Tier 2' skills/merge-prs/SKILL.md
grep -q 'Tier 3' skills/merge-prs/SKILL.md
grep -q 'Tier 4' skills/merge-prs/SKILL.md
grep -q '4-tier ladder\|four-tier\|Tier 1.*Tier 2.*Tier 3.*Tier 4' skills/merge-prs/SKILL.md
```
Expected: all exit 0.

**Step 3: Commit**

```bash
git add skills/merge-prs/SKILL.md
git commit -m "docs(merge-prs): update SKILL.md Conflict Resolution summary to 4-tier ladder"
```

**Acceptance Criteria:**
- [ ] CWD Safety Guard preserved in SKILL.md measured by literal match verified by `grep -q 'CWD Safety Guard' skills/merge-prs/SKILL.md`
- [ ] ORIG_DIR capture pattern preserved measured by literal match verified by `grep -q 'ORIG_DIR=\$(pwd)' skills/merge-prs/SKILL.md`
- [ ] All four tiers referenced in SKILL.md measured by count verified by `test $(grep -c 'Tier [1234]' skills/merge-prs/SKILL.md) -ge 4`
- [ ] Commit message contract referenced in SKILL.md summary measured by literal match verified by `grep -q 'merge: resolve conflict, verified by tests' skills/merge-prs/SKILL.md`
- [ ] Reference to `references/conflict-resolution.md` preserved measured by literal match verified by `grep -q 'references/conflict-resolution.md' skills/merge-prs/SKILL.md`

**Quality Constraints:**
- Style: Numbered list matching the existing §Conflict Resolution section, fenced bash blocks for commands, bold emphasis for tier names
- Terminology: "Tier 1", "Tier 2", "Tier 3", "Tier 4" (capitalized, with digit)
- Preservation: Lines containing `git worktree add`, `git merge origin/`, and the entire CWD Safety Guard block must remain byte-for-byte identical — only the tier list and summary language change
- Pattern: Reuse the numbered-step structure already present in §Conflict Resolution; do not introduce new top-level sections

---

### Task 8: Update SKILL.md Error Recovery table

**Files:**
- Modify: `skills/merge-prs/SKILL.md:253-265` (the Error Recovery table)

**Step 1: Replace the "Merge conflict, behavioral" row**

Delete the row:
```
| Merge conflict, behavioral | Pause for confirmation. If unresolved, skip with reason |
```

Add two new rows in its place:
```
| Merge conflict, structurally independent | Tier 2: attempt additive merge + run tests. Commit if green, escalate to Tier 3 if red. |
| Merge conflict, semantic overlap | Tier 3: pause via `AskUserQuestion`, present diff + proposed resolution + test output. Always pauses regardless of mode. |
```

**Step 2: Verify**

```bash
! grep -q '^| Merge conflict, behavioral ' skills/merge-prs/SKILL.md
grep -q 'Merge conflict, structurally independent' skills/merge-prs/SKILL.md
grep -q 'Merge conflict, semantic overlap' skills/merge-prs/SKILL.md
grep -q 'Tier 2: attempt additive merge' skills/merge-prs/SKILL.md
grep -q 'Tier 3: pause' skills/merge-prs/SKILL.md
```
Expected: all exit 0.

**Step 3: Commit**

```bash
git add skills/merge-prs/SKILL.md
git commit -m "docs(merge-prs): split Error Recovery behavioral row into Tier 2 + Tier 3"
```

**Acceptance Criteria:**
- [ ] Old "Merge conflict, behavioral" row removed measured by zero literal matches verified by `! grep -q '^| Merge conflict, behavioral ' skills/merge-prs/SKILL.md`
- [ ] New structurally-independent row present measured by literal match verified by `grep -q 'Merge conflict, structurally independent' skills/merge-prs/SKILL.md`
- [ ] New semantic-overlap row present measured by literal match verified by `grep -q 'Merge conflict, semantic overlap' skills/merge-prs/SKILL.md`
- [ ] Tier 2 action description present measured by literal match verified by `grep -q 'Tier 2: attempt additive merge' skills/merge-prs/SKILL.md`
- [ ] Tier 3 pause description present measured by literal match verified by `grep -q 'Tier 3: pause' skills/merge-prs/SKILL.md`

**Quality Constraints:**
- Style: Two new table rows matching the existing Error Recovery table format (`| Error | Action |`)
- Terminology: "structurally independent" and "semantic overlap" (exact wording from Task 5 criteria)
- Preservation: All other rows in the Error Recovery table (PR already merged, Auto-resolvable, CI failing, Unresolved review, GitHub API error) must remain unchanged
- Pattern: Match column alignment and sentence style of adjacent rows (action is a short imperative or clause)

---

### Task 9: Update SKILL.md Config table with new merge.conflict_resolution fields

**Files:**
- Modify: `skills/merge-prs/SKILL.md:268-281` (the Config table)

**Step 1: Add two new rows to the Config table**

After the existing `ci_remediation.*` rows, add:
```
| `conflict_resolution.test_command` | *(none)* | Optional override for Tier 2 test runner. If unset, stack-based detection is used. See `references/conflict-resolution.md` § Test Runner Discovery. |
| `conflict_resolution.test_timeout_minutes` | `5` | Hard wall-clock timeout for Tier 2 test verification. Minimum 1. |
```

**Step 2: Verify**

```bash
grep -q 'conflict_resolution.test_command' skills/merge-prs/SKILL.md
grep -q 'conflict_resolution.test_timeout_minutes' skills/merge-prs/SKILL.md
grep -q 'Optional override for Tier 2' skills/merge-prs/SKILL.md
# Verify the row has a default value column:
grep -E '^\| `conflict_resolution\.test_timeout_minutes` \| `5` \|' skills/merge-prs/SKILL.md
```
Expected: all exit 0.

**Step 3: Commit**

```bash
git add skills/merge-prs/SKILL.md
git commit -m "docs(merge-prs): add conflict_resolution config fields to SKILL.md Config table"
```

**Acceptance Criteria:**
- [ ] test_command config row present measured by literal match verified by `grep -q 'conflict_resolution.test_command' skills/merge-prs/SKILL.md`
- [ ] test_timeout_minutes config row present measured by literal match verified by `grep -q 'conflict_resolution.test_timeout_minutes' skills/merge-prs/SKILL.md`
- [ ] test_timeout_minutes default value is 5 measured by exact row format verified by `grep -Eq '^\| \`conflict_resolution\.test_timeout_minutes\` \| \`5\` \|' skills/merge-prs/SKILL.md`
- [ ] Row description references Tier 2 measured by literal match verified by `grep -q 'Optional override for Tier 2' skills/merge-prs/SKILL.md`
- [ ] Both rows live inside the existing Config table measured by row count in the merge: config section verified by `awk '/^## Config/,/^---$/' skills/merge-prs/SKILL.md | grep -c 'conflict_resolution\.' | xargs test 2 -le`

**Quality Constraints:**
- Style: Two new table rows immediately after the existing `ci_remediation.*` rows, preserving column alignment
- Terminology: Config key names match the `merge.conflict_resolution.*` convention introduced in Task 3 (exact byte match)
- Preservation: All existing Config table rows must remain unchanged; only the two new rows are added
- Pattern: Follow the 3-column table format (`| Field | Default | Description |`); `*(none)*` for optional fields without a default, literal backtick-wrapped values otherwise

---

## Issue #225 Acceptance Criteria Mapping

Each of the 13 acceptance criteria from issue #225 maps to one or more tasks above:

| # | Issue #225 Acceptance Criterion | Covered by Task(s) |
|---|--------------------------------|---------------------|
| 1 | `conflict-resolution.md` updated with Tier 2 section | Task 1 |
| 2 | `conflict-resolution.md` updated with Tier 3 section | Task 2 |
| 3 | Classification logic routes to appropriate tier | Task 5 |
| 4 | Tier 2 verification loop: apply → test → commit-if-green → fall-through-if-red | Task 1 (procedure) + Task 5 (routing) |
| 5 | Test suite discovery reuses `.feature-flow.yml`/project-file detection | Task 3 |
| 6 | Worktree flow and CWD safety guard preserved | Task 7 (explicit preservation check) |
| 7 | Tier 3 ALWAYS pauses, even in YOLO | Task 2 (safety invariant statement) |
| 8 | Tier 3 presentation includes test output when Tier 2 failed | Task 2 (Presentation contents sub-bullet) |
| 9 | SKILL.md §Conflict Resolution updated to describe the ladder | Task 7 |
| 10 | Error recovery table entry updated | Task 8 |
| 11 | Tier 2 commits use `merge: resolve conflict, verified by tests` format | Task 1 (contract) + Task 7 (SKILL.md reference) |
| 12 | Test suite timeout enforced (default 5 minutes) | Task 4 (Timeout Detection) + Task 9 (Config default) |
| 13 | Test suite failure falls through to Tier 3 (not Tier 4/skip) | Task 1 (fall-through language) + Task 5 (routing) |

All 13 criteria are verifiable via the per-task grep-based acceptance checks above.

---

## Execution Notes

- **TDD is N/A** for documentation-only changes. The "test" is grep-based content verification, which runs *after* the edit. Treat each task's "Verify" step as the test phase.
- **One commit per task** for reviewability.
- **Task ordering matters:** Tasks 1-6 edit `conflict-resolution.md`; Tasks 7-9 edit `SKILL.md`. Tasks 1-4 should complete before Task 5 (routing references Tier 2) and Task 6 (example references Tier 2). Task 7 should complete before Tasks 8-9 (summary references the table/config that follow).
- **No tests will be added to `tests/`** — there is no test directory; the project is Markdown-only.
