# Phase-Specific Context Files — Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Create references/phase-context-templates.md — STATUS: done (commit 69a7530)
Task 2: Update SKILL.md — worktree init + design phase context capture — STATUS: done (commit ce2e3ae)
Task 3: Update inline-steps.md — implementation phase context capture — STATUS: done (commit 9d02045)
Task 4: Update yolo-overrides.md — context archival and PR body injection — STATUS: done (commit cda0fd1)
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.
> Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

**Goal:** Introduce phase-specific context files (`.feature-flow/design/` and `.feature-flow/implement/`) that capture discoveries and decisions during the feature lifecycle, auto-archive on completion, and populate PR descriptions with implementation context.

**Architecture:** Four documentation-only changes. Context directories and template files are initialized at worktree setup. Each lifecycle phase writes to its corresponding context file as part of the step's output. At PR creation, context files are archived to `.feature-flow/sessions/{date}-{name}/` and their content is injected into the PR description. No new agents or skills — all changes are inline step instructions and skill mapping updates.

**Tech Stack:** Markdown (documentation only — no runtime code)

---

### Task 1: Create `references/phase-context-templates.md`

**Files:**
- Create: `references/phase-context-templates.md`

**Acceptance Criteria:**
- [ ] `references/phase-context-templates.md` is created measured by file existence verified by `ls references/phase-context-templates.md`
- [ ] File contains design-decisions template section measured by grep match verified by `grep -q 'design-decisions' references/phase-context-templates.md`
- [ ] File contains verification-results template section measured by grep match verified by `grep -q 'verification-results' references/phase-context-templates.md`
- [ ] File contains patterns-found template section measured by grep match verified by `grep -q 'patterns-found' references/phase-context-templates.md`
- [ ] File contains blockers-and-resolutions template section measured by grep match verified by `grep -q 'blockers-and-resolutions' references/phase-context-templates.md`

**Quality Constraints:**
- Error handling: N/A — documentation only
- Types: N/A — no code
- Function length: N/A
- Pattern: follow structure of `references/acceptance-criteria-patterns.md` (section headings, purpose lines, template blocks)
- Files modified: none (new file)
- Parallelizable: yes

**Steps:**

Create `references/phase-context-templates.md` with four sections, one per context file. Each section starts with a purpose line and a fenced template block.

**`design-decisions.md` template purpose:** Captures scope decisions, approach choices, and rejected alternatives made during brainstorming and design document phases. Written by the orchestrator after the design document step completes.

Template structure:
```markdown
# Design Decisions

## Key Decisions
- **[Decision]:** [what was decided and why]

## Rejected Alternatives
- **[Option]:** [why it was rejected]

## Open Questions
- [ ] [question still unresolved at design time]
```

**`verification-results.md` template purpose:** Captures design verification findings — blockers found, design changes required, and items confirmed clean. Written after the design verification step.

Template structure:
```markdown
# Design Verification Results

## Verification Summary
- Score: [N/14 categories passed]
- Blockers found: [N]

## Blockers Found and Resolved
- **[Issue]:** [description] → **Resolution:** [what changed]

## Clean Categories
- [Category]: no issues found
```

**`patterns-found.md` template purpose:** Captures codebase patterns, anti-patterns, and reference examples discovered during the Study Existing Patterns step. Written after that step completes.

Template structure:
```markdown
# Patterns Found

## [Area: e.g., API Routes]
- File structure: [how existing files are organized]
- Error handling: [pattern used]
- Reference examples: `[file]` ([what it exemplifies])

## Anti-Patterns (do NOT replicate)
- `[file]` — [issue]. [recommendation].

## How to Code This
### Task N: [title]
- Follow pattern from: `[file]`
- Key constraint: [relevant constraint]
```

**`blockers-and-resolutions.md` template purpose:** Running log of blockers surfaced during implementation tasks and how they were resolved. Updated by the orchestrator when a blocker is encountered and again when resolved.

Template structure:
```markdown
# Blockers and Resolutions

## [Task N]: [Blocker Title]
- **Blocker:** [description of what blocked progress]
- **Resolution:** [how it was resolved]
- **Commit:** [SHA or 'pending']
```

---

### Task 2: Update `skills/start/SKILL.md` — worktree init + design phase capture

**Files:**
- Modify: `skills/start/SKILL.md` (design-first — large file)

**Acceptance Criteria:**
- [ ] SKILL.md Worktree Setup entry references `.feature-flow/design` directory creation measured by grep match verified by `grep -q '\.feature-flow/design' skills/start/SKILL.md`
- [ ] SKILL.md Worktree Setup entry references `.feature-flow/implement` directory creation measured by grep match verified by `grep -q '\.feature-flow/implement' skills/start/SKILL.md`
- [ ] SKILL.md Worktree Setup entry references phase-context-templates measured by grep match verified by `grep -q 'phase-context-templates' skills/start/SKILL.md`
- [ ] SKILL.md Design document mapping entry references design-decisions.md capture measured by grep match verified by `grep -q 'design-decisions' skills/start/SKILL.md`
- [ ] SKILL.md Design verification mapping entry references verification-results.md capture measured by grep match verified by `grep -q 'verification-results' skills/start/SKILL.md`

**Quality Constraints:**
- Error handling: N/A — documentation only
- Types: N/A — no code
- Function length: N/A
- Pattern: match the existing Skill Mapping table cell style — bold inline instructions appended after the existing expected-output text
- Files modified: `skills/start/SKILL.md` (design-first — ~800 lines)
- Design-first files: `skills/start/SKILL.md` — implementer must output change plan before any Edit call
- Parallelizable: no

**Steps:**

Step 1: Read `skills/start/SKILL.md`. Locate the Skill Mapping table (§ "Skill Mapping") and identify three rows: "Worktree setup", "Design document", and "Design verification".

Step 2: Output a change plan — list the exact `old_string` → `new_string` for each of the three edits below before making any Edit calls.

Step 3: Update the **Worktree setup** row. After the existing instruction to create `FEATURE_CONTEXT.md` and include it in the initial branch commit, append:

> **Context directories:** Also create `.feature-flow/design/` and `.feature-flow/implement/` directories. For each of the four context files, read the corresponding template from `skills/start/references/phase-context-templates.md` and write it to `.feature-flow/design/design-decisions.md`, `.feature-flow/design/verification-results.md`, `.feature-flow/implement/patterns-found.md`, and `.feature-flow/implement/blockers-and-resolutions.md`. Include all four files in the same initial commit as `FEATURE_CONTEXT.md`.

Step 4: Update the **Design document** row. After the expected output (`File at docs/plans/YYYY-MM-DD-*.md`), append:

> **Context capture:** After the design document is saved, write key scope decisions, approach choices, and rejected alternatives to `.feature-flow/design/design-decisions.md` (append to the existing template — do not overwrite).

Step 5: Update the **Design verification** row. After the expected output (`Blockers/gaps identified and fixed`), append:

> **Context capture:** After verification completes, write the blockers found and their resolutions to `.feature-flow/design/verification-results.md`. Include the verification score summary and any design changes required.

---

### Task 3: Update `inline-steps.md` — implementation phase context capture

**Files:**
- Modify: `skills/start/references/inline-steps.md`

**Acceptance Criteria:**
- [ ] inline-steps.md Study Existing Patterns section references patterns-found.md measured by grep match verified by `grep -q 'patterns-found' skills/start/references/inline-steps.md`
- [ ] inline-steps.md contains blocker-logging instructions referencing blockers-and-resolutions.md measured by grep match verified by `grep -q 'blockers-and-resolutions' skills/start/references/inline-steps.md`

**Quality Constraints:**
- Error handling: N/A — documentation only
- Types: N/A — no code
- Function length: N/A
- Pattern: follow the existing numbered Process list format; new steps append to the existing section without restructuring it
- Files modified: `skills/start/references/inline-steps.md`
- Parallelizable: yes

**Steps:**

Step 1: Read the Study Existing Patterns section of `skills/start/references/inline-steps.md`. The section ends with step 5 ("Generate 'How to Code This' notes"). Append a new step 6 at the end of the process list:

> 6. **Write to context file.** After generating the "How to Code This" notes, write the full findings (Existing Patterns Found, Anti-Patterns, How to Code This) to `.feature-flow/implement/patterns-found.md`. Append to the existing file rather than overwriting, so multiple study passes accumulate. If the file does not exist yet (e.g., worktree was set up without the init step), create it using the template from `references/phase-context-templates.md`.

Step 2: After the Study Existing Patterns section, in the **Subagent-Driven Development Context Injection** section of `yolo-overrides.md` (or if a more natural location exists in inline-steps.md), add a blocker-logging note. If inline-steps.md has a section covering orchestrator behavior during implementation (e.g., a task-transition section), add the note there. Otherwise add it as a new `## Blocker Logging` section at the end of the file:

> ## Blocker Logging
>
> When a subagent surfaces a blocker (a problem that halts a task, requires rethinking the approach, or requires asking the user), the orchestrator logs it immediately to `.feature-flow/implement/blockers-and-resolutions.md` using this format:
>
> ```markdown
> ## [Task N]: [Blocker Title]
> - **Blocker:** [description]
> - **Resolution:** pending
> - **Commit:** pending
> ```
>
> Update the entry once the blocker is resolved, replacing `pending` with the actual resolution and commit SHA.

---

### Task 4: Update `yolo-overrides.md` — context archival and PR body injection

**Files:**
- Modify: `skills/start/references/yolo-overrides.md`

**Acceptance Criteria:**
- [ ] yolo-overrides.md finishing-a-development-branch section references `.feature-flow/sessions` archive path measured by grep match verified by `grep -q '\.feature-flow/sessions' skills/start/references/yolo-overrides.md`
- [ ] yolo-overrides.md finishing-a-development-branch section references context file injection into PR body measured by grep match verified by `grep -q 'design-decisions\|patterns-found\|verification-results' skills/start/references/yolo-overrides.md`

**Quality Constraints:**
- Error handling: N/A — documentation only
- Types: N/A — no code
- Function length: N/A
- Pattern: match the existing numbered instruction style in the `## Finishing a Development Branch YOLO Override` section (numbered steps with bold action labels and fenced code examples)
- Files modified: `skills/start/references/yolo-overrides.md`
- Parallelizable: yes

**Steps:**

Step 1: Read the `## Finishing a Development Branch YOLO Override` section of `skills/start/references/yolo-overrides.md`. Identify the current last numbered step (currently step 6, test failure handling). The new steps insert before the test-failure step.

Step 2: Add two new steps after the existing step 5 (PR body code review summary) and before the test-failure step. Renumber the test-failure step accordingly.

New step 6:
> 6. **Archive phase context files.** Before creating the PR, archive the context directories to a timestamped session directory:
>    ```bash
>    DATE=$(date +%Y-%m-%d)
>    FEATURE=$(basename $(git rev-parse --abbrev-ref HEAD))
>    SESSION_DIR=".feature-flow/sessions/${DATE}-${FEATURE}"
>    mkdir -p "$SESSION_DIR"
>    [ -d .feature-flow/design ] && cp -r .feature-flow/design/ "$SESSION_DIR/design/"
>    [ -d .feature-flow/implement ] && cp -r .feature-flow/implement/ "$SESSION_DIR/implement/"
>    ```
>    If neither `.feature-flow/design/` nor `.feature-flow/implement/` exists, skip silently.

New step 7:
> 7. **Inject context into PR body.** Append an `## Implementation Context` section to the PR body. For each context file that contains content beyond template placeholder text, include a subsection:
>    - If `.feature-flow/design/design-decisions.md` has content: `### Design Decisions` — include the Key Decisions list only
>    - If `.feature-flow/design/verification-results.md` has content: `### Verification Results` — include the blockers-found list only
>    - If `.feature-flow/implement/patterns-found.md` has content: `### Key Patterns Used` — include the How to Code This section only (omit the full patterns dump)
>    - Omit subsections whose files contain only template placeholder text (no real entries)

Renumber the existing test-failure step to step 8.
