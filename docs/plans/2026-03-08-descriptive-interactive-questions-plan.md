# Descriptive Interactive Questions Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: session-report/SKILL.md — STATUS: pending
Task 2: spike/SKILL.md — STATUS: pending
Task 3: design-verification/SKILL.md — STATUS: pending
Task 4: create-issue/SKILL.md — STATUS: pending
Task 5: start/references/project-context.md — STATUS: pending
Task 6: start/references/step-lists.md — STATUS: pending
Task 7: start/references/orchestration-overrides.md — STATUS: pending
Task 8: start/references/inline-steps.md — STATUS: pending
Task 9: verify-plan-criteria/SKILL.md — STATUS: pending
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.
> Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

**Goal:** Add `description` fields and recommendation markers to all 12 `AskUserQuestion` option entries that are currently missing them across 9 skill files.

**Architecture:** Pure text edits to markdown skill files. Each task targets one file and adds description strings to option entries that have only a label. Recommendation markers use the format `*Recommended — [reasoning]*` in the description field, matching the existing pattern in `start/SKILL.md`.

**Tech Stack:** Markdown skill files; no runtime code changes.

---

### Task 1: session-report/SKILL.md

**Files:**
- Modify: `skills/session-report/SKILL.md:22-27` (session file selection question)
- Modify: `skills/session-report/SKILL.md:656-663` (next steps question)

**Acceptance Criteria:**
- [ ] Line ~25: `"Find the latest in docs/plans/"` option has description containing `*Recommended`
- [ ] Line ~25: `"Let me provide a path"` option has a description field
- [ ] Line ~660: `"Create GitHub issues for actionable findings"` option has a description field
- [ ] Line ~660: `"Dig deeper into a specific area"` option has a description field
- [ ] Line ~660: `"Compare with another session"` option has a description field
- [ ] Line ~660: `"Done for now"` option has a description field
- [ ] Verified with: `grep -n "Recommended" skills/session-report/SKILL.md` returns at least 1 match
- [ ] Verified with: `grep -c "description:" skills/session-report/SKILL.md` or check inline description text exists adjacent to option labels

**Quality Constraints:**
- Pattern: description additions must follow the inline description convention already used in `skills/start/SKILL.md` (description on the same logical option entry, in quotes)
- Files modified: `skills/session-report/SKILL.md` (design-first — >150 lines)
- Design-first files: `skills/session-report/SKILL.md` — implementer must output change plan before editing
- Parallelizable: yes

**Step 1: Read the file and output a change plan**

Read `skills/session-report/SKILL.md` (full file). Output which lines change and what the new text will be before making any edits.

**Step 2: Edit the session file selection question (lines ~22–27)**

Replace:
```
AskUserQuestion: "Which session file should I analyze?"
Options:
- "Let me provide a path"
- "Find the latest in docs/plans/"
```

With:
```
AskUserQuestion: "Which session file should I analyze?"
Options:
- "Find the latest in docs/plans/" with description: "*Recommended — scans docs/plans/ and opens the most recently modified session file automatically*"
- "Let me provide a path" with description: "Enter an absolute or relative path to any session report file"
```

**Step 3: Edit the next steps question (lines ~656–663)**

Replace:
```
AskUserQuestion: "What would you like to do with these findings?"
Options:
- "Create GitHub issues for actionable findings"
- "Dig deeper into a specific area"
- "Compare with another session"
- "Done for now"
```

With:
```
AskUserQuestion: "What would you like to do with these findings?"
Options:
- "Create GitHub issues for actionable findings" with description: "Open a GitHub issue for each high-priority finding flagged in the report"
- "Dig deeper into a specific area" with description: "Re-run analysis focused on one section (e.g., token usage, tool calls, errors)"
- "Compare with another session" with description: "Load a second session report and diff the two side by side"
- "Done for now" with description: "Exit the session report skill — you can re-run it any time"
```

**Step 4: Verify**

```bash
grep -n "Recommended\|description:" skills/session-report/SKILL.md
```
Expected: lines containing `*Recommended` and description text near lines 25 and 660.

**Step 5: Commit**

```bash
git add skills/session-report/SKILL.md
git commit -m "feat: add descriptions and recommendation to session-report questions"
```

---

### Task 2: spike/SKILL.md

**Files:**
- Modify: `skills/spike/SKILL.md:161-164` (gotcha addition question)

**Acceptance Criteria:**
- [ ] `"Add"` option has description containing `*Recommended`
- [ ] `"Skip"` option has a description explaining the consequence
- [ ] Verified with: `grep -n "Recommended" skills/spike/SKILL.md` returns a match in the gotcha section

**Quality Constraints:**
- Pattern: match the description style used in `skills/start/SKILL.md`
- Files modified: `skills/spike/SKILL.md` (design-first — >150 lines)
- Design-first files: `skills/spike/SKILL.md` — implementer must output change plan before editing
- Parallelizable: yes

**Step 1: Read the file and output a change plan**

Read `skills/spike/SKILL.md`. Focus on lines 155–170. Output change plan.

**Step 2: Edit the gotcha question**

Replace:
```
Use `AskUserQuestion` with options: "Add", "Skip".
```

With:
```
Use `AskUserQuestion` with options:
- "Add" with description: "*Recommended — saves the finding to .feature-flow.yml so future sessions are warned automatically*"
- "Skip" with description: "Discard — the gotcha will not be persisted and may be rediscovered in a future session"
```

**Step 3: Verify**

```bash
grep -n "Recommended" skills/spike/SKILL.md
```
Expected: 1 match near the gotcha section.

**Step 4: Commit**

```bash
git add skills/spike/SKILL.md
git commit -m "feat: add descriptions and recommendation to spike gotcha question"
```

---

### Task 3: design-verification/SKILL.md

**Files:**
- Modify: `skills/design-verification/SKILL.md:242` (gotcha addition question)

**Acceptance Criteria:**
- [ ] `"Add all"` option has description containing `*Recommended`
- [ ] `"Let me pick"` option has a description
- [ ] `"Skip"` option has a description
- [ ] Verified with: `grep -n "Recommended" skills/design-verification/SKILL.md` returns a match

**Quality Constraints:**
- Pattern: match the 3-option description style used in `skills/create-issue/SKILL.md`
- Files modified: `skills/design-verification/SKILL.md` (design-first — >150 lines)
- Design-first files: `skills/design-verification/SKILL.md` — implementer must output change plan before editing
- Parallelizable: yes

**Step 1: Read the file and output a change plan**

Read `skills/design-verification/SKILL.md` lines 235–250. Output change plan.

**Step 2: Edit the gotcha question**

Replace:
```
Use `AskUserQuestion` with options: "Add all", "Let me pick", "Skip".
```

With:
```
Use `AskUserQuestion` with options:
- "Add all" with description: "*Recommended — adds every finding to .feature-flow.yml as a project-wide warning for future sessions*"
- "Let me pick" with description: "Choose which findings to persist — you'll be prompted one at a time"
- "Skip" with description: "Discard all findings — none will be saved to .feature-flow.yml"
```

**Step 3: Verify**

```bash
grep -n "Recommended" skills/design-verification/SKILL.md
```
Expected: 1 match in the gotcha section.

**Step 4: Commit**

```bash
git add skills/design-verification/SKILL.md
git commit -m "feat: add descriptions and recommendation to design-verification gotcha question"
```

---

### Task 4: create-issue/SKILL.md

**Files:**
- Modify: `skills/create-issue/SKILL.md:129` (update confirmation question)
- Modify: `skills/create-issue/SKILL.md:146` (create confirmation question)

**Acceptance Criteria:**
- [ ] Update confirmation: `"Update as-is"` option has description containing `*Recommended`
- [ ] Update confirmation: `"Let me edit first"` option has a description
- [ ] Update confirmation: `"Cancel"` option has a description
- [ ] Create confirmation: `"Create as-is"` option has description containing `*Recommended`
- [ ] Create confirmation: `"Let me edit first"` option has a description
- [ ] Create confirmation: `"Cancel"` option has a description
- [ ] Verified with: `grep -c "Recommended" skills/create-issue/SKILL.md` returns 2

**Quality Constraints:**
- Pattern: follow the description style used in `skills/start/references/step-lists.md` (option lists with `with description:`)
- Files modified: `skills/create-issue/SKILL.md` (design-first — >150 lines)
- Design-first files: `skills/create-issue/SKILL.md` — implementer must output change plan before editing
- Parallelizable: yes

**Step 1: Read the file and output a change plan**

Read `skills/create-issue/SKILL.md` lines 114–155. Output change plan.

**Step 2: Edit the update confirmation question (line ~129)**

Replace:
```
Use `AskUserQuestion` to confirm. Options: "Update as-is", "Let me edit first", "Cancel".
```

With:
```
Use `AskUserQuestion` to confirm. Options:
- "Update as-is" with description: "*Recommended — applies the drafted title, body, and labels to the existing issue immediately*"
- "Let me edit first" with description: "Provide corrections in freeform text — the draft will be revised before updating"
- "Cancel" with description: "Abort — the issue will not be modified"
```

**Step 3: Edit the create confirmation question (line ~146)**

Replace:
```
Use `AskUserQuestion` to confirm. Options: "Create as-is", "Let me edit first", "Cancel".
```

With:
```
Use `AskUserQuestion` to confirm. Options:
- "Create as-is" with description: "*Recommended — creates the issue on GitHub with the drafted title, body, and labels*"
- "Let me edit first" with description: "Provide corrections in freeform text — the draft will be revised before creating"
- "Cancel" with description: "Abort — no issue will be created"
```

**Step 4: Verify**

```bash
grep -c "Recommended" skills/create-issue/SKILL.md
```
Expected: 2

**Step 5: Commit**

```bash
git add skills/create-issue/SKILL.md
git commit -m "feat: add descriptions and recommendations to create-issue confirmation questions"
```

---

### Task 5: start/references/project-context.md

**Files:**
- Modify: `skills/start/references/project-context.md:74` (platform/stack detection question)
- Modify: `skills/start/references/project-context.md:151` (notification preference — "No notifications" description)

**Acceptance Criteria:**
- [ ] Platform detection: `"Looks correct"` option has description containing `*Recommended`
- [ ] Platform detection: `"Let me adjust"` option has a description
- [ ] Notification preference: `"No notifications"` description changed from `"(Default) No sound..."` to `"*Recommended — no sound..."` (removes "(Default)", adds "*Recommended —")
- [ ] Verified with: `grep -n "Recommended" skills/start/references/project-context.md` returns at least 2 matches

**Quality Constraints:**
- Pattern: match description style from `skills/start/SKILL.md` modal selection question
- Important: do NOT change the notification preference option labels — only change the description string for "No notifications"
- Files modified: `skills/start/references/project-context.md` (design-first — >150 lines)
- Design-first files: `skills/start/references/project-context.md` — implementer must output change plan before editing
- Parallelizable: yes

**Step 1: Read the file and output a change plan**

Read `skills/start/references/project-context.md` lines 68–160. Output change plan.

**Step 2: Edit the platform detection question (line ~74)**

Replace:
```
4. Use `AskUserQuestion` with options: "Looks correct", "Let me adjust"
```

With:
```
4. Use `AskUserQuestion` with options:
   - "Looks correct" with description: "*Recommended — saves the detected platform and stack to .feature-flow.yml and continues*"
   - "Let me adjust" with description: "Correct the platform or stack before saving — you'll provide the changes in freeform text"
```

**Step 3: Edit the notification preference description (line ~151)**

Replace:
```
- Option 1: `"No notifications"` with description: `"(Default) No sound or banner — you check the terminal manually"`
```

With:
```
- Option 1: `"No notifications"` with description: `"*Recommended — no sound or banner; check the terminal manually when ready*"`
```

**Step 4: Verify**

```bash
grep -n "Recommended" skills/start/references/project-context.md
```
Expected: at least 2 matches — one near line 74, one near line 151.

**Step 5: Commit**

```bash
git add skills/start/references/project-context.md
git commit -m "feat: add descriptions and recommendations to start project-context questions"
```

---

### Task 6: start/references/step-lists.md

**Files:**
- Modify: `skills/start/references/step-lists.md:187` (install missing plugins — "Skip" option)

**Acceptance Criteria:**
- [ ] `"Skip — continue without installing"` description updated to include `*Recommended`
- [ ] Verified with: `grep -n "Recommended" skills/start/references/step-lists.md` returns a match on the Skip option line

**Quality Constraints:**
- Pattern: the other two options ("Install all and restart", "Let me pick") already have descriptions — match that style exactly; only the "Skip" description needs updating
- Files modified: `skills/start/references/step-lists.md` (design-first — >150 lines)
- Design-first files: `skills/start/references/step-lists.md` — implementer must output change plan before editing
- Parallelizable: yes

**Step 1: Read the file and output a change plan**

Read `skills/start/references/step-lists.md` lines 183–195. Output change plan.

**Step 2: Edit the Skip option description (line ~187)**

Replace:
```
- Option 3: `"Skip — continue without installing"` with description: `"Proceed with currently installed plugins only"`
```

With:
```
- Option 3: `"Skip — continue without installing"` with description: `"*Recommended if unsure — proceed with currently installed plugins; you can add more later*"`
```

**Step 3: Verify**

```bash
grep -n "Recommended" skills/start/references/step-lists.md
```
Expected: 1 match on the Skip option.

**Step 4: Commit**

```bash
git add skills/start/references/step-lists.md
git commit -m "feat: add recommendation to install-plugins skip option"
```

---

### Task 7: start/references/orchestration-overrides.md

**Files:**
- Modify: `skills/start/references/orchestration-overrides.md:110-112` (Express design approval question)

**Acceptance Criteria:**
- [ ] `"Continue"` option has a description field
- [ ] `"Let me adjust"` option has a description field
- [ ] No recommendation marker on either (this is a checkpoint, not a preference question)
- [ ] Verified with: `grep -A2 '"Continue"' skills/start/references/orchestration-overrides.md` shows description text

**Quality Constraints:**
- Note: No recommendation is added here — Express design approval is a mandatory review checkpoint, not a preference question where one option is "better"
- Files modified: `skills/start/references/orchestration-overrides.md` (design-first — >150 lines)
- Design-first files: `skills/start/references/orchestration-overrides.md` — implementer must output change plan before editing
- Parallelizable: yes

**Step 1: Read the file and output a change plan**

Read `skills/start/references/orchestration-overrides.md` lines 99–120. Output change plan.

**Step 2: Edit the Express design approval question (lines ~110–112)**

Replace:
```
Use `AskUserQuestion` with options:
- "Continue" — approve the design and resume Express mode
- "Let me adjust" — user provides corrections, document is updated, then Express resumes
```

With:
```
Use `AskUserQuestion` with options:
- "Continue" with description: "Approve the design and resume Express mode — implementation will begin immediately"
- "Let me adjust" with description: "Provide corrections in freeform text — the document will be updated, then Express resumes"
```

**Step 3: Verify**

```bash
grep -n "with description:" skills/start/references/orchestration-overrides.md
```
Expected: 2 matches in the Express design approval section.

**Step 4: Commit**

```bash
git add skills/start/references/orchestration-overrides.md
git commit -m "feat: add descriptions to Express design approval question"
```

---

### Task 8: start/references/inline-steps.md

**Files:**
- Modify: `skills/start/references/inline-steps.md:274-275` (CHANGELOG version heading question)
- Modify: `skills/start/references/inline-steps.md:303-307` (CHANGELOG approval question)

**Acceptance Criteria:**
- [ ] CHANGELOG version: `[Unreleased]` option description updated from `(Recommended)` to `*Recommended —` format consistent with the rest of the codebase
- [ ] CHANGELOG approval: `"Looks good — write it"` option has description containing `*Recommended`
- [ ] CHANGELOG approval: `"Let me edit"` option has a description
- [ ] CHANGELOG approval: `"Skip CHANGELOG"` option has a description mentioning the risk
- [ ] Verified with: `grep -c "Recommended" skills/start/references/inline-steps.md` returns at least 2

**Quality Constraints:**
- Files modified: `skills/start/references/inline-steps.md` (design-first — >150 lines)
- Design-first files: `skills/start/references/inline-steps.md` — implementer must output change plan before editing
- Parallelizable: yes

**Step 1: Read the file and output a change plan**

Read `skills/start/references/inline-steps.md` lines 268–315. Output change plan.

**Step 2: Edit the CHANGELOG version heading question (lines ~273–275)**

Replace:
```
- **Option 1:** `[Unreleased]` (Recommended) — assign version at release time
- **Option 2:** `[X.Y.Z] - YYYY-MM-DD` — use detected version now
```

With:
```
- **Option 1:** `[Unreleased]` with description: "*Recommended — assign version at release time; keeps the entry flexible until the next release*"
- **Option 2:** `[X.Y.Z] - YYYY-MM-DD` with description: "Stamp the detected version now — use if this PR completes the release"
```

**Step 3: Edit the CHANGELOG approval question (lines ~303–307)**

Replace:
```
- **Option 1:** "Looks good — write it" — proceed to write
- **Option 2:** "Let me edit" — user provides corrections in freeform text, entry is revised
- **Option 3:** "Skip CHANGELOG" — announce risk: "No CHANGELOG entry will be included in this PR. You may want to add one manually." Proceed to next lifecycle step.
```

With:
```
- **Option 1:** "Looks good — write it" with description: "*Recommended — writes the entry to CHANGELOG.md under the appropriate version heading*"
- **Option 2:** "Let me edit" with description: "Provide corrections in freeform text — the entry will be revised before writing"
- **Option 3:** "Skip CHANGELOG" with description: "Omit the entry — note: missing CHANGELOG entries complicate release note generation"
```

**Step 4: Verify**

```bash
grep -c "Recommended" skills/start/references/inline-steps.md
```
Expected: at least 2 matches.

**Step 5: Commit**

```bash
git add skills/start/references/inline-steps.md
git commit -m "feat: add descriptions and recommendations to CHANGELOG questions"
```

---

### Task 9: verify-plan-criteria/SKILL.md

**Files:**
- Modify: `skills/verify-plan-criteria/SKILL.md:124` (criteria approval question)

**Acceptance Criteria:**
- [ ] `"Accept all as-is"` option has description containing `*Recommended`
- [ ] `"Let me edit them"` option has a description
- [ ] `"Skip drafting"` option has a description mentioning the risk
- [ ] Verified with: `grep -n "Recommended" skills/verify-plan-criteria/SKILL.md` returns a match

**Quality Constraints:**
- Files modified: `skills/verify-plan-criteria/SKILL.md` (design-first — >150 lines)
- Design-first files: `skills/verify-plan-criteria/SKILL.md` — implementer must output change plan before editing
- Parallelizable: yes

**Step 1: Read the file and output a change plan**

Read `skills/verify-plan-criteria/SKILL.md` lines 118–135. Output change plan.

**Step 2: Edit the criteria approval question (line ~124)**

Replace:
```
Use a single `AskUserQuestion` to get approval for all tasks at once. Options: "Accept all as-is", "Let me edit them", "Skip drafting".
```

With:
```
Use a single `AskUserQuestion` to get approval for all tasks at once. Options:
- "Accept all as-is" with description: "*Recommended — applies all drafted criteria to their tasks; implementation can begin immediately*"
- "Let me edit them" with description: "Provide corrections in freeform text — criteria will be revised and re-presented before applying"
- "Skip drafting" with description: "Proceed without adding criteria — affected tasks will be harder to verify at completion"
```

**Step 3: Verify**

```bash
grep -n "Recommended" skills/verify-plan-criteria/SKILL.md
```
Expected: 1 match in the criteria approval section.

**Step 4: Commit**

```bash
git add skills/verify-plan-criteria/SKILL.md
git commit -m "feat: add descriptions and recommendation to verify-plan-criteria approval question"
```
