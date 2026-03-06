# Refactor Start Skill to Progressive Disclosure — Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Extract inline steps to references/inline-steps.md — STATUS: pending
Task 2: Extract code review pipeline to references/code-review-pipeline.md — STATUS: pending
Task 3: Extract YOLO/Express overrides to references/yolo-overrides.md — STATUS: pending
Task 4: Extract model routing to references/model-routing.md — STATUS: pending
Task 5: Extract step lists and pre-flight reviewer details — STATUS: pending
Task 6: Final pointer cleanup and line count verification — STATUS: pending
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.

**Goal:** Reduce `skills/start/SKILL.md` from 1,823 lines to under 500 by extracting phase-specific instructions into reference files that Claude reads on-demand.

**Architecture:** Progressive disclosure pattern — SKILL.md keeps the core orchestration loop (pre-flight, scope detection, step execution skeleton, completion) while reference files hold detailed phase instructions. Each extracted section is replaced with a 1-2 line pointer: "When reaching step X, read `references/file.md` — [section name]."

**Tech Stack:** Markdown files only — no code changes, no tests. Verification is line counting and content completeness checks.

---

### Task 1: Extract inline steps to `references/inline-steps.md`

The largest extraction — 8 inline step definitions totaling ~420 lines. These are only needed when their respective lifecycle step is reached.

**Files:**
- Create: `skills/start/references/inline-steps.md`
- Modify: `skills/start/SKILL.md` (1823 lines, design-first)

**Step 1: Create `references/inline-steps.md`**

Create the file with these sections extracted verbatim from SKILL.md:

| Section | SKILL.md Lines | Approx Lines |
|---------|---------------|--------------|
| Documentation Lookup Step | 1692-1726 | 35 |
| Commit Planning Artifacts Step | 1034-1061 | 28 |
| Copy Env Files Step | 1063-1093 | 31 |
| Study Existing Patterns Step | 1095-1176 | 82 |
| Self-Review Step | 1178-1206 | 29 |
| Generate CHANGELOG Entry Step | 1499-1624 | 126 |
| Final Verification Step | 1728-1748 | 21 |
| Comment and Close Issue Step | 1626-1690 | 65 |

Add a header to the file:
```markdown
# Inline Step Definitions

Reference file for the start skill lifecycle orchestrator. Each section contains the full instructions for an inline step (no separate skill invocation).

**Usage:** The orchestrator reads the relevant section when reaching that lifecycle step.
```

**Step 2: Replace extracted sections in SKILL.md with pointers**

For each extracted section, replace the full content with a pointer like:
```markdown
### Documentation Lookup Step (inline — no separate skill)

**Read `references/inline-steps.md` — "Documentation Lookup Step" section** when reaching this step.
```

**Step 3: Verify extraction completeness**

Run: `wc -l skills/start/SKILL.md skills/start/references/inline-steps.md`
Expected: SKILL.md decreased by ~400 lines, inline-steps.md is ~430 lines (content + header).

**Step 4: Commit**

```bash
git add skills/start/references/inline-steps.md skills/start/SKILL.md
git commit -m "refactor: extract inline steps to references/inline-steps.md"
```

**Acceptance Criteria:**
- [ ] `skills/start/references/inline-steps.md` exists and contains all 8 inline step definitions
- [ ] SKILL.md no longer contains the full text of any inline step definition (only 1-2 line pointers)
- [ ] Every inline step section heading is preserved in SKILL.md (for the skill mapping table references)
- [ ] `wc -l skills/start/SKILL.md` shows a decrease of at least 380 lines from 1823

**Quality Constraints:**
- Pattern: follow existing `references/scope-guide.md` for file structure and header style
- Files modified: `skills/start/SKILL.md` (design-first — 1823 lines)
- Design-first files: `skills/start/SKILL.md` — implementer must output change plan before editing

---

### Task 2: Extract code review pipeline to `references/code-review-pipeline.md`

The code review pipeline (Phases 0-5) is ~290 lines and only needed during the code review lifecycle step.

**Files:**
- Create: `skills/start/references/code-review-pipeline.md`
- Modify: `skills/start/SKILL.md` (design-first)

**Step 1: Create `references/code-review-pipeline.md`**

Extract SKILL.md lines 1208-1497 (from `### Code Review Pipeline Step` through the end of `#### Phase 5: Report` including the output format). Add header:

```markdown
# Code Review Pipeline

Reference file for the start skill lifecycle orchestrator. Contains the full 5-phase code review pipeline.

**Usage:** The orchestrator reads this file when reaching the "Code review" lifecycle step.
```

**Step 2: Replace in SKILL.md with pointer**

```markdown
### Code Review Pipeline Step (inline — no separate skill)

**Read `references/code-review-pipeline.md`** for the full 5-phase review pipeline (Phases 0-5: deterministic pre-filter, pr-review-toolkit pre-pass, report-only agents, conflict detection + single-pass fix, targeted re-verification, report).
```

**Step 3: Verify**

Run: `wc -l skills/start/SKILL.md skills/start/references/code-review-pipeline.md`
Expected: SKILL.md decreased by ~285 lines, code-review-pipeline.md is ~295 lines.

**Step 4: Commit**

```bash
git add skills/start/references/code-review-pipeline.md skills/start/SKILL.md
git commit -m "refactor: extract code review pipeline to references/code-review-pipeline.md"
```

**Acceptance Criteria:**
- [ ] `skills/start/references/code-review-pipeline.md` exists and contains Phases 0 through 5
- [ ] SKILL.md code review section is replaced with a 2-3 line pointer
- [ ] The Phase 5 report output format is preserved in the extracted file
- [ ] `wc -l skills/start/SKILL.md` shows a further decrease of at least 280 lines

**Quality Constraints:**
- Pattern: follow `references/scope-guide.md` for header style
- Files modified: `skills/start/SKILL.md` (design-first)

---

### Task 3: Extract YOLO/Express overrides to `references/yolo-overrides.md`

All mode-specific behavior overrides, propagation rules, and mode-adjacent sections. These are only needed when the orchestrator invokes a specific skill or reaches a mode-dependent step.

**Files:**
- Create: `skills/start/references/yolo-overrides.md`
- Modify: `skills/start/SKILL.md` (design-first)

**Step 1: Create `references/yolo-overrides.md`**

Extract these sections from SKILL.md:

| Section | SKILL.md Lines | Approx Lines |
|---------|---------------|--------------|
| Notification Preference (from Step 0) | 302-339 | 38 |
| Phase-Boundary Model Hints | 678-702 | 25 |
| Brainstorming Interview Format Override | 704-738 | 35 |
| Context Window Checkpoints | 740-768 | 29 |
| Express Design Approval Checkpoint | 770-789 | 20 |
| Writing Plans YOLO Override | 791-799 | 9 |
| Writing Plans Quality Context Injection | 801-864 | 64 |
| Using Git Worktrees YOLO Override | 866-880 | 15 |
| Finishing a Development Branch YOLO Override | 882-894 | 13 |
| Subagent-Driven Development YOLO Override | 896-907 | 12 |
| Subagent-Driven Development Context Injection | 909-939 | 31 |
| Implementer Quality Context Injection | 941-999 | 59 |

Add header:
```markdown
# YOLO/Express Mode Overrides & Injection Context

Reference file for the start skill lifecycle orchestrator. Contains all mode-specific behavior overrides, skill invocation overrides, quality context injection rules, and mode-adjacent configuration (notification preference, checkpoints, model hints).

**Usage:** The orchestrator reads specific sections from this file when:
- Invoking a skill that has a YOLO/Express override
- Reaching a mode-dependent decision point (checkpoints, notifications)
- Dispatching subagents that need quality context injection
```

**Step 2: Replace in SKILL.md with pointers**

Each extracted section gets a 1-2 line pointer. Example:
```markdown
### Brainstorming Interview Format Override

**Read `references/yolo-overrides.md` — "Brainstorming Interview Format Override" section** when invoking brainstorming.
```

For the Notification Preference subsection within Step 0, replace with:
```markdown
**Notification Preference:** See `references/yolo-overrides.md` — "Notification Preference" section.
```

**Step 3: Verify**

Run: `wc -l skills/start/SKILL.md skills/start/references/yolo-overrides.md`
Expected: SKILL.md decreased by ~320 lines, yolo-overrides.md is ~360 lines.

**Step 4: Commit**

```bash
git add skills/start/references/yolo-overrides.md skills/start/SKILL.md
git commit -m "refactor: extract YOLO/Express overrides to references/yolo-overrides.md"
```

**Acceptance Criteria:**
- [ ] `skills/start/references/yolo-overrides.md` exists and contains all 12 sections listed above
- [ ] SKILL.md section headings for overrides are preserved (1-2 line pointers under each)
- [ ] The YOLO Execution Continuity and Turn Bridge Rule text in Step 3 remains in SKILL.md (core loop, not an override)
- [ ] YOLO/Express Propagation rules in Step 3 remain in SKILL.md (core execution instructions)
- [ ] `wc -l skills/start/SKILL.md` shows a further decrease of at least 300 lines

**Quality Constraints:**
- Files modified: `skills/start/SKILL.md` (design-first)
- Careful boundary: Step 3's execution loop (lines 593-648) must NOT be extracted — it's the core orchestration skeleton

---

### Task 4: Extract model routing to `references/model-routing.md`

Model routing defaults and session model recommendation are consulted at specific moments, not throughout.

**Files:**
- Create: `skills/start/references/model-routing.md`
- Modify: `skills/start/SKILL.md` (design-first)

**Step 1: Create `references/model-routing.md`**

Extract these sections:

| Section | SKILL.md Lines | Approx Lines |
|---------|---------------|--------------|
| Session Model Recommendation (from Step 0) | 270-299 | 30 |
| Model Routing Defaults | 1001-1032 | 32 |

Add header:
```markdown
# Model Routing

Reference file for the start skill lifecycle orchestrator. Contains model selection defaults and the session model recommendation flow.

**Usage:** The orchestrator reads "Session Model Recommendation" during Step 0 setup, and "Model Routing Defaults" when dispatching subagents or making model selection decisions.
```

**Step 2: Replace in SKILL.md with pointers**

Session Model Recommendation in Step 0:
```markdown
**Session Model Recommendation:** See `references/model-routing.md` — "Session Model Recommendation" section.
```

Model Routing Defaults section:
```markdown
### Model Routing Defaults

**Read `references/model-routing.md` — "Model Routing Defaults" section** for the single source of truth on model selection for orchestrator phases and subagent dispatches.
```

**Step 3: Verify**

Run: `wc -l skills/start/SKILL.md skills/start/references/model-routing.md`
Expected: SKILL.md decreased by ~56 lines, model-routing.md is ~70 lines.

**Step 4: Commit**

```bash
git add skills/start/references/model-routing.md skills/start/SKILL.md
git commit -m "refactor: extract model routing to references/model-routing.md"
```

**Acceptance Criteria:**
- [ ] `skills/start/references/model-routing.md` exists with both sections
- [ ] SKILL.md no longer contains the full model routing tables or session model recommendation flow
- [ ] References to "Model Routing Defaults" from other sections (now in reference files) still make sense
- [ ] `wc -l skills/start/SKILL.md` shows a further decrease of at least 50 lines

**Quality Constraints:**
- Files modified: `skills/start/SKILL.md` (design-first)
- Cross-reference check: other extracted files (yolo-overrides, code-review-pipeline) reference "Model Routing Defaults" — ensure those references say "see `references/model-routing.md`" or are self-contained

---

### Task 5: Extract step lists and pre-flight reviewer details

Step 2's scope-specific step lists and pre-flight reviewer audit/marketplace/install sections add ~200 lines that are only needed at specific moments.

**Files:**
- Create: `skills/start/references/step-lists.md`
- Modify: `skills/start/SKILL.md` (design-first)

**Step 1: Create `references/step-lists.md`**

Extract these sections:

| Section | SKILL.md Lines | Approx Lines |
|---------|---------------|--------------|
| Quick fix step list | ~479-488 | 10 |
| Small enhancement standard step list | ~494-513 | 20 |
| Small enhancement fast-track step list | ~515-531 | 17 |
| Feature step list | ~533-553 | 21 |
| Major feature step list | ~555-576 | 22 |
| Mobile platform adjustments | ~578-591 | 14 |
| Pre-Flight Reviewer Audit | 87-111 | 25 |
| Marketplace Discovery | 113-135 | 23 |
| Install Missing Plugins Prompt | 137-169 | 33 |

Add header:
```markdown
# Step Lists & Pre-Flight Details

Reference file for the start skill lifecycle orchestrator.

**Usage:**
- "Step Lists" — read during Step 2 to build the todo list for the selected scope
- "Pre-Flight Reviewer Audit" — read during pre-flight check after plugin availability checks
```

**Step 2: Replace in SKILL.md with pointers**

Step 2:
```markdown
### Step 2: Build the Step List

Based on scope AND platform, determine which steps apply. **Read `references/step-lists.md`** for the step list for each scope (quick fix, small enhancement standard/fast-track, feature, major feature) and mobile platform adjustments.

Use the `TaskCreate` tool to create a todo item for each step. Call all TaskCreate tools in a **single parallel message**.
```

Pre-flight reviewer sections:
```markdown
### Pre-Flight Reviewer Audit & Marketplace Discovery

**Read `references/step-lists.md` — "Pre-Flight Reviewer Audit", "Marketplace Discovery", and "Install Missing Plugins Prompt" sections** after completing plugin availability checks.
```

**Step 3: Verify**

Run: `wc -l skills/start/SKILL.md skills/start/references/step-lists.md`
Expected: SKILL.md decreased by ~170 lines, step-lists.md is ~195 lines.

**Step 4: Commit**

```bash
git add skills/start/references/step-lists.md skills/start/SKILL.md
git commit -m "refactor: extract step lists and pre-flight details to references/step-lists.md"
```

**Acceptance Criteria:**
- [ ] `skills/start/references/step-lists.md` exists with all 5 scope step lists + mobile adjustments + 3 pre-flight sections
- [ ] SKILL.md Step 2 is reduced to a short pointer paragraph
- [ ] Pre-flight section in SKILL.md retains the core plugin checks (superpowers, context7, pr-review-toolkit, feature-dev, backend-api-security, Reviewer Stack Affinity Table) but delegates audit/marketplace/install to the reference
- [ ] `wc -l skills/start/SKILL.md` shows a further decrease of at least 150 lines

**Quality Constraints:**
- Files modified: `skills/start/SKILL.md` (design-first)
- The Reviewer Stack Affinity Table stays in SKILL.md — it's referenced by both pre-flight and code review pipeline, so having it in the core file avoids circular references

---

### Task 6: Final pointer cleanup and line count verification

Verify SKILL.md is under 500 lines, all content is accounted for, and pointers are consistent.

**Files:**
- Modify: `skills/start/SKILL.md` (if needed for minor pointer adjustments)

**Step 1: Line count check**

Run: `wc -l skills/start/SKILL.md`
Expected: Under 500 lines. If over 500, identify remaining extractable content (e.g., combined scope + mode prompt formatting details from Step 1 lines 417-473).

**Step 2: Content completeness check**

For each section heading that existed in the original SKILL.md, verify it exists in either:
- The current SKILL.md (kept), OR
- One of the reference files (extracted)

Run: `grep -c '^### \|^## \|^#### ' skills/start/SKILL.md skills/start/references/*.md`
Compare total section count against original (grep the original from git: `git show main:skills/start/SKILL.md | grep -c '^### \|^## \|^#### '`).

**Step 3: Cross-reference check**

Verify that pointers in SKILL.md match actual section headings in reference files:
- Each "Read `references/X.md` — [section]" pointer must reference an existing section
- Each reference file section must be reachable from a pointer in SKILL.md

**Step 4: Verify no behavioral changes**

Check that SKILL.md still contains these core elements:
- Frontmatter (name, description, tools)
- Pre-Flight Check (core plugin checks)
- Step 0 (YOLO trigger detection, project context loading, base branch detection)
- Step 1 (scope classification, issue richness, fast-track detection, combined prompt)
- Step 3 execution loop skeleton (announce, mark in progress, invoke skill, confirm, mark complete, check checkpoint, loop)
- Skill Mapping table
- YOLO Execution Continuity + Turn Bridge Rule
- YOLO/Express Propagation rules
- Lifecycle Context Object
- Step 4 (interruptions) and Step 5 (completion)
- Scope Adjustment Rules and Quality Rules

**Step 5: Update Additional Resources section**

Update the "Additional Resources" section at the bottom of SKILL.md to list all new reference files:
```markdown
## Additional Resources

### Reference Files

Phase-specific instructions (read on-demand during lifecycle execution):
- **`references/inline-steps.md`** — All inline step definitions (documentation lookup, commit planning, copy env, study patterns, self-review, CHANGELOG, final verification, comment/close issue)
- **`references/code-review-pipeline.md`** — 5-phase code review pipeline (Phases 0-5)
- **`references/yolo-overrides.md`** — YOLO/Express mode overrides, quality context injection, notification preference, checkpoints, brainstorming format
- **`references/model-routing.md`** — Model routing defaults and session model recommendation
- **`references/step-lists.md`** — Scope-specific step lists, mobile adjustments, pre-flight reviewer audit

Existing references:
- **`references/scope-guide.md`** — Detailed criteria for classifying work scope
- **`../../references/project-context-schema.md`** — Schema for `.feature-flow.yml`
- **`../../references/context-checkpoints.md`** — Checkpoint format and recovery procedure
- **`../../references/platforms/mobile.md`** — Mobile lifecycle adjustments
- **`../../references/platforms/web.md`** — Web lifecycle adjustments
```

**Step 6: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "refactor: finalize progressive disclosure restructure"
```

**Acceptance Criteria:**
- [ ] `wc -l skills/start/SKILL.md` outputs a number less than 500
- [ ] All reference files exist in `skills/start/references/`: `inline-steps.md`, `code-review-pipeline.md`, `yolo-overrides.md`, `model-routing.md`, `step-lists.md`
- [ ] Every section heading from the original SKILL.md is accounted for (in SKILL.md or a reference file)
- [ ] SKILL.md contains "Read `references/..." pointers for every extracted section
- [ ] Additional Resources section lists all 5 new reference files
- [ ] No content was deleted — only moved to reference files with pointers left behind

**Quality Constraints:**
- Cross-reference integrity: every pointer in SKILL.md must match an actual section heading in the target reference file
- Files modified: `skills/start/SKILL.md` (design-first)
