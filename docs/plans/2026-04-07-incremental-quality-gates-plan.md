# Incremental Quality Gates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Post-Task Quality Gate sub-step within the Implement step that runs typecheck, lint, and tests after each task's commits, catching errors while context is fresh instead of batching them at Final Verification.

**Architecture:** All changes are to Markdown documentation files — no compiled code. The quality gate logic itself runs inline (the agent runs the same shell commands as `quality-gate.js`). The new sub-step is documented in `inline-steps.md` as a subsection of the Implement step. The `feature-flow-verified` marker written by the gate reuses the same path the Stop hook and Final Verification already read — no new skip logic paths. Config lives in an optional `quality_gates:` block in `.feature-flow.yml`, documented in both `project-context-schema.md` and `README.md`.

**Tech Stack:** Markdown skill files, YAML config schema docs, Keep a Changelog format — no compiled code, no tests to write.

---

## Parallelization Note

Tasks 1 and 2 can run in parallel (different files, no dependencies between them).
Tasks 3 and 4 modify different files and can also run in parallel.
Task 5 (CHANGELOG) depends on nothing and can run alongside any other task.
All tasks must complete before the final spot-check step.

---

### Task 1: Add Post-Task Quality Gate to `inline-steps.md`

**Files:**
- Modify: `skills/start/references/inline-steps.md`

**What this is:** Add two things to this file: (1) a new "Post-Task Quality Gate" subsection within the existing Implement step content, and (2) extend the Final Verification skip logic to also check the post-task gate marker.

**Context to read first:**
- Read `skills/start/references/inline-steps.md` lines 177–200 — the "How to Code This (per task)" section — this is where the new Post-Task Quality Gate subsection will be inserted
- Read `skills/start/references/inline-steps.md` lines 423–444 — the "Final Verification Step" section — this is where the skip logic will be extended
- Read `hooks/scripts/quality-gate.js` lines 91–150 — the `checkTypeScript()` and `checkLint()` functions — the agent reproduces their detection logic inline
- Read `hooks/scripts/quality-gate.js` lines 247–310 — the `detectTestCommand()` function — same reason
- Read `hooks/scripts/quality-gate.js` lines 77–89 — the `writeVerificationMarker()` function — the post-task gate writes the same marker

**Step 1: Locate the exact insertion point**

Run:
```bash
grep -n "How to Code This\|Anti-Patterns Found\|Self-Review Step" skills/start/references/inline-steps.md | head -10
```

Expected: Lines showing the "How to Code This (per task)" section around line 177 and "Self-Review Step" around line 201. The Post-Task Quality Gate subsection will be inserted AFTER the "How to Code This" block (after the closing ``` on line ~187) and BEFORE the `---` separator before "Self-Review Step".

**Step 2: Locate the Final Verification skip logic**

Run:
```bash
grep -n "Check for redundant quality gates\|Phase 4 already passed\|feature-flow-verified\|post-task" skills/start/references/inline-steps.md | head -20
```

Expected: Lines around 429–438 showing the current skip check.

**Step 3: Insert the Post-Task Quality Gate subsection**

Find this exact block in `skills/start/references/inline-steps.md` (the closing of the How to Code This section + the separator before Self-Review):

```
### Task 2: [title]
- Follow pattern from: [existing file]
- State management: [specific approach matching existing patterns]
```

6. **Write to context file.** After generating the "How to Code This" notes, write the full findings (Existing Patterns Found, Anti-Patterns, How to Code This) to `.feature-flow/implement/patterns-found.md`. Append to the existing file rather than overwriting, so multiple study passes accumulate. If the file does not exist yet (e.g., worktree was set up without the init step), create it using the template from `../../references/phase-context-templates.md`.

7. Pass these patterns, the "How to Code This" notes, anti-pattern warnings, AND reference examples from the consolidated output to BOTH the implementation step AND the code review pipeline step as mandatory context. **New code MUST follow these patterns unless there is a documented reason to deviate.** The code review pipeline uses reference examples to check new code against known-good patterns.

**Quality rules:**
- Read at least 2 existing files per area being modified
- Don't just skim — understand the pattern deeply enough to replicate it
- If existing patterns conflict with coding-standards.md, note the conflict and follow the existing codebase pattern (consistency > purity)
- If existing patterns conflict with structural quality (god files, tight coupling), document the conflict. New code follows the better pattern, not the existing anti-pattern. Note: this is the ONE exception to the "consistency > purity" rule — structural anti-patterns should not be replicated even for consistency.

---

## Self-Review Step
```

Replace it with: the existing block above but with the new "Post-Task Quality Gate" section inserted between the Quality rules block and the `---` + `## Self-Review Step`. The full replacement is:

```
### Task 2: [title]
- Follow pattern from: [existing file]
- State management: [specific approach matching existing patterns]
```

6. **Write to context file.** After generating the "How to Code This" notes, write the full findings (Existing Patterns Found, Anti-Patterns, How to Code This) to `.feature-flow/implement/patterns-found.md`. Append to the existing file rather than overwriting, so multiple study passes accumulate. If the file does not exist yet (e.g., worktree was set up without the init step), create it using the template from `../../references/phase-context-templates.md`.

7. Pass these patterns, the "How to Code This" notes, anti-pattern warnings, AND reference examples from the consolidated output to BOTH the implementation step AND the code review pipeline step as mandatory context. **New code MUST follow these patterns unless there is a documented reason to deviate.** The code review pipeline uses reference examples to check new code against known-good patterns.

**Quality rules:**
- Read at least 2 existing files per area being modified
- Don't just skim — understand the pattern deeply enough to replicate it
- If existing patterns conflict with coding-standards.md, note the conflict and follow the existing codebase pattern (consistency > purity)
- If existing patterns conflict with structural quality (god files, tight coupling), document the conflict. New code follows the better pattern, not the existing anti-pattern. Note: this is the ONE exception to the "consistency > purity" rule — structural anti-patterns should not be replicated even for consistency.

---

## Post-Task Quality Gate

After all acceptance criterion commits for a task are complete, run a lightweight quality gate before proceeding to the next task.

**When to run:** Once per task, after the last criterion commit for that task. Not after every individual criterion commit — only after the task boundary.

**Skip condition:** Read `quality_gates.after_task` from `.feature-flow.yml`. If explicitly set to `false`, skip this gate silently for all tasks and announce once at the start of the Implement step: "Post-task quality gate disabled via `quality_gates.after_task: false`."

**Process:**

1. **Announce start:**
   ```
   Post-task quality gate — Task N: [task title]
   ```

2. **Detect changed files for this task** (to scope lint):
   ```bash
   # Count commits since the previous task gate (or branch start for Task 1)
   git diff --name-only HEAD~<N>..HEAD
   ```
   where `<N>` = number of criterion commits in the current task (tracked from the atomic commit workflow). Store the resulting file paths as `CHANGED_FILES`.

3. **Run TypeScript check** (if `tsconfig.json`, `tsconfig.app.json`, or `tsconfig.build.json` exists and `node_modules/.bin/tsc` exists):
   ```bash
   npx tsc --noEmit --project <tsconfig>
   ```
   Full project check — incremental tsc is already fast and needs cross-file context.

4. **Run lint check** (scoped to changed files when `quality_gates.scope_lint` is `true`, default `true`):
   - If `package.json` has a `lint` script: run `npm run lint` (unscoped — custom scripts may have their own scope)
   - Else if `node_modules/.bin/eslint` exists and ESLint config present: `npx eslint <CHANGED_FILES>`
   - Else if `node_modules/.bin/biome` exists and Biome config present: `npx biome check <CHANGED_FILES>`
   - Else if `ruff` available (check `pyproject.toml` or `ruff.toml` present): `ruff check <CHANGED_FILES>`
   - Else: skip lint (no supported linter detected)

5. **Run tests** (only if TypeScript check passed; skip if `quality_gates.skip_tests: true`):
   Use the same test command detection as `hooks/scripts/quality-gate.js`:
   - `package.json` has `test` script → `npm test`
   - `pytest` available (check `pyproject.toml`) → `pytest`
   - Else: skip tests (no test runner detected)

6. **On success:** Write the verification marker:
   ```bash
   git rev-parse HEAD > "$(git rev-parse --git-dir)/feature-flow-verified"
   ```
   Announce:
   ```
   Post-task gate ✓ — Task N passed. Proceeding to Task N+1.
   ```

7. **On failure:** Announce clearly:
   ```
   Post-task quality gate FAILED after Task N. Fix before proceeding.
   [TSC] 2 type errors
     src/foo.ts:12:4 — Cannot find name 'Bar'
   [LINT] ESLint errors
     src/foo.ts:8:1 — 'unused' is defined but never used
   ```
   Then:
   a. Fix the errors immediately (same task context is still active — do not defer)
   b. Commit the fix: either amend the last criterion commit or add a new `fix: ...` commit
   c. Re-run the gate from step 2
   d. Do not advance to the next task until the gate passes

**YOLO behavior:** Run silently. Gate failures pause YOLO automatically — announce:
```
YOLO: start — Post-task gate FAILED after Task N → fixing inline
```
After fix: `YOLO: start — Post-task gate re-run → PASSED. Resuming YOLO.`

**Performance budget:** The gate adds < 60 seconds per task for most projects:
- `tsc --noEmit` (incremental): 2–10s
- Scoped lint (changed files only): 1–5s
- `npm test` / `pytest`: varies

For slow test suites (> 60s), set `quality_gates.skip_tests: true` to run only typecheck + lint per task. Tests then run at Final Verification as usual.

---

## Self-Review Step
```

**Step 4: Extend the Final Verification skip logic**

Find this exact text in the Final Verification Step section:

```
1. **Check for redundant quality gates:** Before running `verification-before-completion` (which runs typecheck, lint, build), check if the Code Review Pipeline's Phase 4 already passed these checks in this lifecycle. If it did, check `git status --porcelain`:
   - If output is empty (no modifications since Phase 4): Skip `verification-before-completion`. Announce: "Quality gates already passed in code review Phase 4 — no changes since. Skipping redundant checks."
   - If output is non-empty: Run `verification-before-completion` normally (files changed since Phase 4).
```

Replace it with:

```
1. **Check for redundant quality gates:** Before running `verification-before-completion` (which runs typecheck, lint, build), check whether quality gates have already been validated at HEAD without subsequent changes. Two sources qualify:
   - **Code Review Pipeline Phase 4** passed quality checks in this lifecycle, OR
   - **Post-task quality gate** ran at HEAD and wrote the verification marker

   In either case, check `git status --porcelain` and the verification marker:
   ```bash
   git rev-parse HEAD > /tmp/ff_current_head
   cat "$(git rev-parse --git-dir)/feature-flow-verified" 2>/dev/null > /tmp/ff_saved_head
   diff /tmp/ff_current_head /tmp/ff_saved_head
   ```
   - If marker matches HEAD **and** `git status --porcelain` is empty: Skip `verification-before-completion`. Announce: "Quality gates already passed (post-task gate at HEAD, working tree clean) — skipping redundant checks."
   - If marker does not match HEAD **or** working tree is dirty: Run `verification-before-completion` normally.
```

**Step 5: Verify the edit**

Run:
```bash
grep -n "post-task\|Post-Task\|Post-task\|feature-flow-verified" skills/start/references/inline-steps.md
```

Expected: Multiple lines — the new Post-Task Quality Gate section headings/references plus the updated Final Verification skip logic referencing the post-task gate.

**Step 6: Commit**

```bash
git add skills/start/references/inline-steps.md
git commit -m "feat(implement): add Post-Task Quality Gate sub-step — ✓runs gate after each task commit, ✓extends Final Verification skip logic"
```

---

### Task 2: Add `quality_gates` schema to `project-context-schema.md`

**Files:**
- Modify: `references/project-context-schema.md`

**What this is:** Add a new `quality_gates` field to the schema documentation, following the same format as existing optional fields (e.g., `knowledge_base`, `merge`).

**Context to read first:**
- Read `references/project-context-schema.md` lines 510–540 — the `merge` field section — use this as the format template (table of sub-fields, format block, "When needed", "When absent" paragraphs)
- Read `references/project-context-schema.md` lines 622–680 — the "How Skills Use This File" section — you will add a line for the `start` skill's new `quality_gates` read behavior

**Step 1: Insert the `quality_gates` schema section**

Find this exact text in `references/project-context-schema.md`:

```
## Enums
```

Insert the following new section BEFORE `## Enums`:

```markdown
### `quality_gates`

**Type:** Object (optional)
**Default:** All sub-fields use their defaults (see below)
**Auto-managed:** No — user-configured
**Committed to git:** Yes

Controls whether and how the Post-Task Quality Gate runs during the Implement step. The gate runs typecheck, lint, and optionally tests after each task's commits.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `after_task` | boolean | `true` | Run the quality gate after each task's commits. Set to `false` to revert to the pre-v1.32.0 behavior (gates only at Final Verification and Stop hook). |
| `scope_lint` | boolean | `true` | Scope lint to changed files (faster). When `true`, ESLint/Biome/Ruff receive only the files changed in the current task. When `false`, lint runs on the full project. Has no effect when `npm run lint` is used (custom scripts manage their own scope). |
| `skip_tests` | boolean | `false` | Skip the test runner in the post-task gate. Useful for projects with slow test suites (> 60s). When `true`, only typecheck and lint run per task; tests run at Final Verification as usual. |

**Format:**

```yaml
quality_gates:
  after_task: true    # default: true — set to false to disable per-task gates
  scope_lint: true    # default: true — scope lint to changed files (faster)
  skip_tests: false   # default: false — set to true for slow test suites (>60s)
```

**When needed:** Only when you want to change post-task gate behavior from its defaults. The defaults (`after_task: true`, `scope_lint: true`, `skip_tests: false`) are correct for most projects.

**When absent:** All three fields use their defaults silently — the gate runs after each task, lint is scoped to changed files, and tests run in the gate. The field is never auto-written; add it manually only if you need non-default behavior.

**Common overrides:**

| Scenario | Config |
|----------|--------|
| Slow test suite (Jest, Playwright) | `skip_tests: true` |
| Custom lint scope in `npm run lint` | No config needed — `npm run lint` is used as-is |
| Disable gates entirely | `after_task: false` |

```

**Step 2: Add to "How Skills Use This File" — start section**

Find this exact text in the "How Skills Use This File" section:

```
### start (reads + writes)
- **Reads** context at lifecycle start. Adjusts step list based on platform and stack.
```

Add this bullet BEFORE the other `**Reads**` entries (i.e., as the second bullet after the first "Reads context at lifecycle start" bullet):

```
- **Reads** `quality_gates.after_task`, `quality_gates.scope_lint`, and `quality_gates.skip_tests` during the Implement step to control Post-Task Quality Gate behavior. All fields default silently when absent.
```

**Step 3: Verify**

Run:
```bash
grep -n "quality_gates\|after_task\|skip_tests\|scope_lint" references/project-context-schema.md
```

Expected: Multiple lines — the new schema section and the "How Skills Use This File" addition.

**Step 4: Commit**

```bash
git add references/project-context-schema.md
git commit -m "docs(schema): add quality_gates config schema — ✓after_task, scope_lint, skip_tests fields documented"
```

---

### Task 3: Add `quality_gates` to README configuration reference

**Files:**
- Modify: `README.md`

**What this is:** Add the `quality_gates` field to the `.feature-flow.yml` example block and the "How it works" bullet list in the Configuration section.

**Context to read first:**
- Read `README.md` lines 240–300 — the Configuration section with the `.feature-flow.yml` example and "How it works" bullets

**Step 1: Add `quality_gates` to the YAML example block**

Find this exact text in `README.md`:

```yaml
yolo:                    # YOLO mode stopping points (empty = no pauses)
  stop_after:
    - design             # brainstorming | design | verification | plan | implementation | pr | ship
    - plan
```

Replace it with:

```yaml
yolo:                    # YOLO mode stopping points (empty = no pauses)
  stop_after:
    - design             # brainstorming | design | verification | plan | implementation | pr | ship
    - plan
quality_gates:           # Post-task quality gate configuration (all fields optional with defaults)
  after_task: true       # run gate after each task's commits (default: true)
  scope_lint: true       # scope lint to changed files — faster (default: true)
  skip_tests: false      # skip test runner per task — for slow suites (default: false)
```

**Step 2: Add the `quality_gates` bullet to "How it works"**

Find this exact text in `README.md`:

```
- `yolo.stop_after` adds review checkpoints at specific lifecycle phases during YOLO mode (see YOLO Stops below)
```

Replace it with:

```
- `yolo.stop_after` adds review checkpoints at specific lifecycle phases during YOLO mode (see YOLO Stops below)
- `quality_gates` controls the Post-Task Quality Gate that runs after each implementation task's commits — `after_task: false` disables it, `skip_tests: true` skips tests per task for slow test suites
```

**Step 3: Verify**

Run:
```bash
grep -n "quality_gates\|after_task\|skip_tests" README.md
```

Expected: The YAML block additions and the "How it works" bullet.

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): add quality_gates config reference — ✓YAML example, ✓How it works bullets"
```

---

### Task 4: Add CHANGELOG entry

**Files:**
- Modify: `CHANGELOG.md`

**What this is:** Add an `[Unreleased]` entry following Keep a Changelog format.

**Context to read first:**
- Read `CHANGELOG.md` lines 1–15 — the header and the current `## [1.31.0]` entry — use the v1.31.0 entry format as the style guide for the new entry

**Step 1: Insert the new Unreleased section**

Find this exact text in `CHANGELOG.md`:

```
## [1.31.0] - 2026-04-06
```

Insert the following BEFORE that line:

```markdown
## [Unreleased]

### Added
- **Incremental quality gates after each implementation task (GH216)** — A new Post-Task Quality Gate runs typecheck, lint, and tests after each task's commits during the Implement step, catching errors when context is fresh instead of batching them at Final Verification. Uses the same linter/test-runner detection as the Stop hook quality gate (`quality-gate.js`) — no new config required for most projects. Lint is scoped to changed files for speed (ESLint, Biome, Ruff). Tests run after typecheck passes (same sequencing as Stop hook). Gate failures pause YOLO and fix inline before proceeding to the next task. The `feature-flow-verified` marker is written on success, so Final Verification and the Stop hook skip redundant re-runs. Final Verification's skip logic extended to recognize post-task gate marker at HEAD with clean working tree. New optional `quality_gates:` config section in `.feature-flow.yml`: `after_task` (default: `true`), `scope_lint` (default: `true`), `skip_tests` (default: `false` — set to `true` for slow test suites).

```

**Step 2: Verify**

Run:
```bash
head -20 CHANGELOG.md
```

Expected: `## [Unreleased]` as the first version heading, followed by the new Added entry, then `## [1.31.0] - 2026-04-06`.

**Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): add Unreleased entry for incremental quality gates — ✓GH216"
```

---

### Task 5: Final spot-check

**Files:** (read-only verification)

**Step 1: Verify all four files were modified**

```bash
git diff --name-only main...HEAD
```

Expected output (4 files):
```
CHANGELOG.md
README.md
references/project-context-schema.md
skills/start/references/inline-steps.md
```

**Step 2: Spot-check inline-steps.md structure**

```bash
grep -n "Post-Task Quality Gate\|post-task gate\|after_task\|skip_tests\|scope_lint\|feature-flow-verified" skills/start/references/inline-steps.md
```

Expected: Multiple hits — the new subsection heading, field references, marker write command, and the updated Final Verification skip logic.

**Step 3: Spot-check schema completeness**

```bash
grep -n "quality_gates\|after_task\|skip_tests\|scope_lint" references/project-context-schema.md
```

Expected: The schema fields table, YAML example, and "How Skills Use This File" bullet.

**Step 4: Spot-check README**

```bash
grep -n "quality_gates\|after_task\|skip_tests" README.md
```

Expected: YAML block and "How it works" bullet.

**Step 5: Spot-check CHANGELOG**

```bash
head -15 CHANGELOG.md
```

Expected: `## [Unreleased]` section with the GH216 Added entry.

**Step 6: Confirm commit count**

```bash
git log --oneline main...HEAD
```

Expected: 4 commits (one per task).
