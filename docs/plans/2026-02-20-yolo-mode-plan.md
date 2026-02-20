# YOLO Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add YOLO mode to the spec-driven lifecycle that auto-selects recommended options at all `AskUserQuestion` call sites, with inline decision logging and a completion summary.

**Architecture:** Three-layer design — Detection (parse `--yolo` from user input), Propagation (append `yolo: true` to Skill tool args), Behavior (each skill checks flag and skips `AskUserQuestion`). All changes are markdown edits to skill files.

**Tech Stack:** Claude Code plugin (markdown skills, JSON hooks, JS scripts). No compile, no build, no tests.

**Design Doc:** `docs/plans/2026-02-20-yolo-mode.md`
**Issue:** #15

---

### Task 1: Add YOLO Detection to start-feature Step 0

Add the YOLO detection block at the very beginning of Step 0, before the `.spec-driven.yml` check. This is Layer 1 of the architecture.

**Acceptance Criteria:**
- [ ] `skills/start-feature/SKILL.md` contains a "YOLO Mode Detection" section before the `.spec-driven.yml` check in Step 0
- [ ] The section lists three trigger phrases: `--yolo`, `yolo mode`, `run unattended`
- [ ] The section specifies word-boundary matching (not substring)
- [ ] The section includes a startup question via `AskUserQuestion` when no trigger is detected, with options "Interactive (default)" and "YOLO"
- [ ] The section instructs to strip the trigger phrase from arguments before further processing
- [ ] The section includes the announcement text: "YOLO mode active"

**Files:**
- Modify: `skills/start-feature/SKILL.md` — insert new subsection at the beginning of "### Step 0: Load or Create Project Context"

**Steps:**

1. Read `skills/start-feature/SKILL.md` and locate the "### Step 0: Load or Create Project Context" heading (line 77)
2. Insert a new "**YOLO Mode Detection**" block immediately after the heading and before "Check for a `.spec-driven.yml` file":

```markdown
**YOLO Mode Detection:**

Before any other processing, check if the user requested YOLO mode. Parse the `ARGUMENTS` string for trigger phrases using **word-boundary matching** (not substring matching, to avoid false positives like "build a yolo-themed game"):

1. Check for trigger phrases:
   - `--yolo` (flag style — match as a standalone token)
   - `yolo mode` (natural language phrase)
   - `run unattended` (natural language phrase)
2. If a trigger is found:
   - Set YOLO mode active for the remainder of the lifecycle
   - Announce: "YOLO mode active. Auto-selecting recommended options. Decision log will be printed at completion."
   - Strip the trigger phrase from the arguments before further processing (so `start feature: add CSV export --yolo` becomes `start feature: add CSV export` for scope classification)
3. If no trigger is found:
   - Ask a one-time startup question via `AskUserQuestion`: "Run in **interactive** or **YOLO** mode?" with options:
     - "Interactive (default)" — all questions asked normally
     - "YOLO — auto-select recommended options" — auto-pilot with decision logging
   - If the user selects YOLO, set YOLO mode active and announce as above
```

3. Commit: `git add skills/start-feature/SKILL.md && git commit -m "feat(yolo): add YOLO mode detection to start-feature Step 0"`

---

### Task 2: Add YOLO Propagation to start-feature Step 3

Add the propagation instruction to Step 3 (Execute Steps in Order) so the YOLO flag is prepended to all `Skill` tool `args`. This is Layer 2 of the architecture.

**Acceptance Criteria:**
- [ ] `skills/start-feature/SKILL.md` Step 3 contains a "YOLO Propagation" instruction
- [ ] The instruction specifies prepending `yolo: true.` to the `args` parameter of every `Skill` invocation
- [ ] The instruction notes that inline steps don't need explicit propagation (YOLO flag is in conversation context)

**Files:**
- Modify: `skills/start-feature/SKILL.md` — add to "### Step 3: Execute Steps in Order"

**Steps:**

1. Locate the "### Step 3: Execute Steps in Order" section (line 232)
2. After the numbered execution pattern (steps 1-6) and before "**Do not skip steps.**", insert:

```markdown
**YOLO Propagation:** When YOLO mode is active, prepend `yolo: true.` to the `args` parameter of every `Skill` invocation. For example:

```
Skill(skill: "superpowers:brainstorming", args: "yolo: true. [original args]")
Skill(skill: "spec-driven:design-document", args: "yolo: true. [original args]")
```

For inline steps (CHANGELOG generation, self-review, code review, study existing patterns), the YOLO flag is already in the conversation context — no explicit propagation is needed.
```

3. Commit: `git add skills/start-feature/SKILL.md && git commit -m "feat(yolo): add YOLO propagation to start-feature Step 3"`

---

### Task 3: Add YOLO Behavior to start-feature Inline Steps

Add YOLO behavior to the `AskUserQuestion` calls that live inside start-feature itself: platform/stack confirmation (Step 0), scope classification (Step 1), CHANGELOG version heading (Phase 3), and CHANGELOG entry approval (Phase 5).

**Acceptance Criteria:**
- [ ] Step 0 platform/stack `AskUserQuestion` has a YOLO behavior note: accept detected context without asking
- [ ] Step 1 scope `AskUserQuestion` has a YOLO behavior note: LLM infers scope from description using criteria table
- [ ] CHANGELOG Phase 3 version `AskUserQuestion` has a YOLO behavior note: auto-select `[Unreleased]`
- [ ] CHANGELOG Phase 5 approval `AskUserQuestion` has a YOLO behavior note: auto-select "Looks good — write it"

**Files:**
- Modify: `skills/start-feature/SKILL.md` — add YOLO notes at 4 locations

**Steps:**

1. **Step 0 — platform/stack confirmation** (near line 105): After the line `4. Use \`AskUserQuestion\` with options: "Looks correct", "Let me adjust"`, add:

```markdown
**YOLO behavior:** If YOLO mode is active, skip this question. Accept the detected context as-is and announce: `YOLO: Platform/stack detection → Accepted: [platform], [stack list]`
```

2. **Step 1 — scope classification** (near line 143): After the line `Use \`AskUserQuestion\` to confirm. Options: the four scope levels.`, add:

```markdown
**YOLO behavior:** If YOLO mode is active, skip this question. Use the LLM's classification based on the scope criteria table above and announce: `YOLO: Scope classification → [selected scope]`
```

3. **CHANGELOG Phase 3 — version heading** (near line 550): After the `AskUserQuestion` version options, add:

```markdown
**YOLO behavior:** If YOLO mode is active, skip this question. Auto-select `[Unreleased]` and announce: `YOLO: CHANGELOG version heading → [Unreleased]`
```

4. **CHANGELOG Phase 5 — entry approval** (near line 578): After the `AskUserQuestion` approval options, add:

```markdown
**YOLO behavior:** If YOLO mode is active, skip this question. Auto-select "Looks good — write it" and announce: `YOLO: CHANGELOG entry → Accepted`
```

5. Commit: `git add skills/start-feature/SKILL.md && git commit -m "feat(yolo): add YOLO behavior to start-feature inline AskUserQuestion calls"`

---

### Task 4: Add YOLO Behavior to Brainstorming Interview Format Override

Extend the existing "Brainstorming Interview Format Override" section to include YOLO-specific instructions: when YOLO mode is active, the LLM answers its own interview questions using issue context and codebase analysis.

**Acceptance Criteria:**
- [ ] The "Brainstorming Interview Format Override" section in `skills/start-feature/SKILL.md` contains a "YOLO behavior" block
- [ ] The block instructs the LLM to answer its own questions using issue context + codebase analysis
- [ ] The block specifies logging each self-answered question: `YOLO: brainstorming — [question] → [answer]`
- [ ] The block states that all decisions from self-answering should be captured in the design document

**Files:**
- Modify: `skills/start-feature/SKILL.md` — append to the "Brainstorming Interview Format Override" section

**Steps:**

1. Locate the "### Brainstorming Interview Format Override" section (line 270)
2. After the existing rules list (ending with "If there is no clear recommendation..."), append:

```markdown
**YOLO behavior:** When YOLO mode is active (i.e., `yolo: true` is in the brainstorming args), do NOT present questions to the user. Instead:

1. The LLM answers its own interview questions using all available context: issue body, issue comments, codebase analysis, and existing patterns
2. For each question, announce: `YOLO: brainstorming — [question summary] → [selected option with reasoning]`
3. Proceed through all brainstorming questions autonomously
4. Ensure all self-answered decisions are captured when passing context to the design document step

This is the most complex YOLO interaction — the LLM makes design-level decisions. The user reviews these via the design document output rather than each micro-decision.
```

3. Commit: `git add skills/start-feature/SKILL.md && git commit -m "feat(yolo): add YOLO behavior to brainstorming interview override"`

---

### Task 5: Add YOLO Decision Log to start-feature Completion

Add the YOLO decision log summary table to Step 5 (Completion) so the user sees a full record of all auto-decisions at the end.

**Acceptance Criteria:**
- [ ] Step 5 (Completion) in `skills/start-feature/SKILL.md` contains a "YOLO Decision Log" block
- [ ] The block includes a markdown table format with columns: #, Skill, Decision, Auto-Selected
- [ ] The block includes "Total decisions auto-selected" and "Quality gates preserved" summary lines
- [ ] The block includes the cancellation note about inline announcements serving as an emergency brake

**Files:**
- Modify: `skills/start-feature/SKILL.md` — add to "### Step 5: Completion"

**Steps:**

1. Locate "### Step 5: Completion" (line 674)
2. After the existing completion summary block (ending with `[List any platform-specific notes]`), add:

```markdown
**YOLO Decision Log (if YOLO mode was active):**

If the lifecycle ran in YOLO mode, append the full decision log after the standard completion summary:

```
## YOLO Decision Log

| # | Skill | Decision | Auto-Selected |
|---|-------|----------|---------------|
| 1 | start-feature | Platform/stack detection | Accepted: [platform], [stack] |
| 2 | start-feature | Scope classification | [scope] |
| 3 | brainstorming | [question] | [answer] |
| ... | ... | ... | ... |

**Total decisions auto-selected:** N
**Quality gates preserved:** hooks, tests, verification, code review
```

**Cancellation:** There is no formal YOLO cancellation mechanism. Inline announcements (`YOLO: [skill] — [decision] → [option]`) serve as an "emergency brake" — the user sees each decision as it's made and can interrupt the lifecycle at any point by sending a message. The lifecycle will pause at the current step, and the user can redirect from there.
```

3. Commit: `git add skills/start-feature/SKILL.md && git commit -m "feat(yolo): add YOLO decision log to start-feature completion"`

---

### Task 6: Add YOLO Behavior to design-document

Add YOLO behavior to the design-document skill at two points: Step 1 (Gather Context) for clarification questions, and Step 5 (Present for Review) for section-by-section approval.

**Acceptance Criteria:**
- [ ] `skills/design-document/SKILL.md` Step 1 contains a YOLO behavior note after the `AskUserQuestion` mention
- [ ] The note instructs the LLM to self-answer clarification questions from available context
- [ ] `skills/design-document/SKILL.md` Step 5 contains a YOLO behavior note
- [ ] The note instructs to skip section-by-section confirmation and present the full document at once

**Files:**
- Modify: `skills/design-document/SKILL.md` — add YOLO notes at 2 locations

**Steps:**

1. **Step 1 — clarification questions** (line 34): After the line about using `AskUserQuestion`, add:

```markdown
**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, do not call `AskUserQuestion` for clarification. Instead, answer the questions from available context (brainstorming output, issue body, codebase analysis) and announce each: `YOLO: design-document — [question] → [answer]`. If critical information is genuinely missing (not inferable from any source), note it as `[TBD]` in the design document rather than guessing.
```

2. **Step 5 — section-by-section approval** (line 123): After the instructions about presenting sections, add:

```markdown
**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip section-by-section confirmation. Present the full document at once without asking "Does this section look right?" after each section. Announce: `YOLO: design-document — Section approval → Accepted (all sections)`
```

3. Commit: `git add skills/design-document/SKILL.md && git commit -m "feat(yolo): add YOLO behavior to design-document skill"`

---

### Task 7: Add YOLO Behavior to design-verification

Add YOLO behavior to the design-verification skill at the gotcha suggestion step (Step 7).

**Acceptance Criteria:**
- [ ] `skills/design-verification/SKILL.md` Step 7 contains a YOLO behavior note after the `AskUserQuestion` mention
- [ ] The note instructs to auto-select "Add all" for gotcha suggestions
- [ ] The note includes the YOLO announcement format

**Files:**
- Modify: `skills/design-verification/SKILL.md` — add YOLO note at 1 location

**Steps:**

1. Locate Step 7 gotcha suggestion `AskUserQuestion` (line 166)
2. After the line `Use \`AskUserQuestion\` with options: "Add all", "Let me pick", "Skip".`, add:

```markdown
**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip this question. Auto-select "Add all" and announce: `YOLO: design-verification — Add gotchas → Add all ([N] gotchas added)`
```

3. Commit: `git add skills/design-verification/SKILL.md && git commit -m "feat(yolo): add YOLO behavior to design-verification skill"`

---

### Task 8: Add YOLO Behavior to spike

Add YOLO behavior to the spike skill at two points: Step 1 (assumption selection) and Step 5 (gotcha suggestion).

**Acceptance Criteria:**
- [ ] `skills/spike/SKILL.md` Step 1 contains a YOLO behavior note after the assumption selection `AskUserQuestion`
- [ ] The note instructs to test all identified assumptions
- [ ] `skills/spike/SKILL.md` Step 5 contains a YOLO behavior note after the gotcha `AskUserQuestion`
- [ ] The note instructs to auto-select "Add"

**Files:**
- Modify: `skills/spike/SKILL.md` — add YOLO notes at 2 locations

**Steps:**

1. **Step 1 — assumption selection** (line 56): After `Use \`AskUserQuestion\` to confirm which assumptions to test.`, add:

```markdown
**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip this question. Test all identified assumptions and announce: `YOLO: spike — Assumptions to test → All ([N] assumptions)`
```

2. **Step 5 — gotcha suggestion** (line 143): After `Use \`AskUserQuestion\` with options: "Add", "Skip".`, add:

```markdown
**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip this question. Auto-select "Add" and announce: `YOLO: spike — Add gotcha → Added`
```

3. Commit: `git add skills/spike/SKILL.md && git commit -m "feat(yolo): add YOLO behavior to spike skill"`

---

### Task 9: Add YOLO Behavior to create-issue

Add YOLO behavior to the create-issue skill at Step 5 (confirmation for both update and create flows).

**Acceptance Criteria:**
- [ ] `skills/create-issue/SKILL.md` Step 5 contains a YOLO behavior note for the update confirmation
- [ ] `skills/create-issue/SKILL.md` Step 5 contains a YOLO behavior note for the create confirmation
- [ ] Both notes auto-select the "as-is" option and include YOLO announcement format

**Files:**
- Modify: `skills/create-issue/SKILL.md` — add YOLO notes at 2 locations

**Steps:**

1. **Update confirmation** (line 129): After `Use \`AskUserQuestion\` to confirm. Options: "Update as-is", "Let me edit first", "Cancel".`, add:

```markdown
**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip this question. Auto-select "Update as-is" and announce: `YOLO: create-issue — Confirm update → Update as-is`
```

2. **Create confirmation** (line 144): After `Use \`AskUserQuestion\` to confirm. Options: "Create as-is", "Let me edit first", "Cancel".`, add:

```markdown
**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip this question. Auto-select "Create as-is" and announce: `YOLO: create-issue — Confirm create → Create as-is`
```

3. Commit: `git add skills/create-issue/SKILL.md && git commit -m "feat(yolo): add YOLO behavior to create-issue skill"`

---

### Task 10: Add YOLO Behavior to verify-plan-criteria

Add YOLO behavior to the verify-plan-criteria skill at Step 4 (criteria approval).

**Acceptance Criteria:**
- [ ] `skills/verify-plan-criteria/SKILL.md` Step 4 contains a YOLO behavior note after the `AskUserQuestion` mention
- [ ] The note instructs to auto-select "Accept as-is" for all drafted criteria
- [ ] The note includes the YOLO announcement format

**Files:**
- Modify: `skills/verify-plan-criteria/SKILL.md` — add YOLO note at 1 location

**Steps:**

1. Locate Step 4 criteria approval `AskUserQuestion` (line 98)
2. After `Use \`AskUserQuestion\` to get approval. Options: "Accept as-is", "Let me edit them", "Skip this task".`, add:

```markdown
**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip this question. Auto-select "Accept as-is" for all tasks with drafted criteria and announce: `YOLO: verify-plan-criteria — Approve criteria → Accept as-is ([N] tasks)`
```

3. Commit: `git add skills/verify-plan-criteria/SKILL.md && git commit -m "feat(yolo): add YOLO behavior to verify-plan-criteria skill"`

---

### Task 11: Update README with YOLO Mode Documentation

Add YOLO mode documentation to the README — a new section explaining activation, behavior, and the decision log.

**Acceptance Criteria:**
- [ ] `README.md` contains a "## YOLO Mode" section (or "### YOLO Mode" under an existing section)
- [ ] The section explains the three activation methods: `--yolo` flag, `yolo mode` phrase, startup question
- [ ] The section explains what YOLO mode does (auto-selects recommended options) and what it does NOT bypass (quality gates)
- [ ] The section includes a concrete example showing the decision log format
- [ ] The Quick Start section mentions YOLO mode as an option

**Files:**
- Modify: `README.md` — add YOLO mode section and update Quick Start

**Steps:**

1. After the "## Quick Start" section (line 56), add a new section:

```markdown
### YOLO Mode

For experienced users who trust the lifecycle's recommended defaults:

```
start feature: add user notifications --yolo
```

YOLO mode auto-selects recommended options at every decision point (scope classification, brainstorming questions, issue confirmation, etc.) and logs each decision inline:

```
YOLO: Platform/stack → Accepted: web, [next-js, supabase]
YOLO: Scope → Feature
YOLO: brainstorming — Export trigger → Option A: button in toolbar
```

At completion, a full decision log table is printed so you can review what was decided.

**What YOLO does NOT bypass:** Quality gates (tsc, lint, tests), anti-pattern hooks, acceptance criteria verification, code review pipeline, and Context7 documentation lookups all run identically. YOLO only skips confirmation prompts — it doesn't skip work.

**Activation:** Include `--yolo`, `yolo mode`, or `run unattended` in your start command, or select "YOLO" when asked at startup.
```

2. In the Quick Start section (line 60-61), after the `start feature: add user notifications` example, add:

```markdown
Add `--yolo` to auto-select recommended options and skip confirmation prompts:

```
start feature: add user notifications --yolo
```
```

3. Commit: `git add README.md && git commit -m "docs: add YOLO mode documentation to README"`

---

### Task 12: Update plugin.json Version

Bump the plugin version to reflect the new feature.

**Acceptance Criteria:**
- [ ] `.claude-plugin/plugin.json` `version` field is `1.11.0`
- [ ] `keywords` array includes `yolo`

**Files:**
- Modify: `.claude-plugin/plugin.json`

**Steps:**

1. Update `version` from `1.10.0` to `1.11.0`
2. Add `"yolo"` to the `keywords` array
3. Commit: `git add .claude-plugin/plugin.json && git commit -m "chore: bump version to 1.11.0 for YOLO mode feature"`
