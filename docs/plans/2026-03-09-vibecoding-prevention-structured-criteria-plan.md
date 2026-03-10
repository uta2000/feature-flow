# Vibecoding Prevention via Structured Acceptance Criteria — Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Create acceptance-criteria-patterns.md reference — STATUS: pending
Task 2: Update verify-plan-criteria with format enforcement — STATUS: pending
CURRENT: none
-->

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.
> Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

**Goal:** Enforce `[WHAT] measured by [HOW] verified by [COMMAND]` format for all acceptance criteria in implementation plans, eliminating vague criteria like "code quality is maintained."

**Architecture:** Two changes — (1) create `references/acceptance-criteria-patterns.md` documenting the format with good/bad examples; (2) update `skills/verify-plan-criteria/SKILL.md` to add format validation in Step 3 and update draft templates in Step 4 to produce structured criteria.

**Tech Stack:** Markdown skill instruction files only. No library APIs.

**Issue:** #173

---

### Task 1: Create acceptance-criteria-patterns.md reference

**Files:**
- Create: `references/acceptance-criteria-patterns.md`

**Step 1: Write the reference file**

Create `references/acceptance-criteria-patterns.md` with the following content:

```markdown
# Acceptance Criteria Patterns

Reference guide for writing structured, machine-verifiable acceptance criteria.

## Format

Every criterion must follow:

```
[WHAT] measured by [HOW] verified by [COMMAND]
```

- **[WHAT]** — The property or behavior that must hold
- **[HOW]** — The observable metric or artifact that demonstrates it
- **[COMMAND]** — The shell command or tool that checks it

## Good vs Bad Examples

| Bad (vague) | Good (structured) |
|---|---|
| `Code quality is maintained` | `TypeScript types are valid measured by zero new compilation errors verified by \`npm run typecheck\`` |
| `Feature works correctly` | `Structured format check is present measured by keyword presence in SKILL.md verified by \`grep -c "measured by" skills/verify-plan-criteria/SKILL.md\`` |
| `Performance is acceptable` | `Response time is within threshold measured by p95 < 200ms verified by \`npm run test:perf\`` |
| `File is created` | `Reference file is present measured by file existence verified by \`ls references/acceptance-criteria-patterns.md\`` |
| `Tests pass` | `Test suite passes measured by zero failures verified by \`npm test\`` |
| `No type errors` | `TypeScript types are valid measured by zero new compilation errors verified by \`npm run typecheck\`` |
| `Lint is clean` | `Linting passes measured by zero new warnings verified by \`npm run lint\`` |
| `Interface is exported` | `` `CriteriaFormat` type is exported measured by export presence verified by `grep "export.*CriteriaFormat" src/types.ts` `` |

## Common Patterns

### File Existence
```
`path/to/file` is present measured by file existence verified by `ls path/to/file`
```

### Command Passes
```
[operation] succeeds measured by zero failures verified by `[command]`
```

### Typecheck
```
TypeScript types are valid measured by zero new compilation errors verified by `npm run typecheck`
```

### Lint
```
Linting passes measured by zero new warnings verified by `npm run lint`
```

### Export Presence
```
`TypeName` is exported measured by export presence verified by `grep "export.*TypeName" path/to/file`
```

### Content Presence
```
[content description] is present measured by text presence verified by `grep -c "pattern" path/to/file`
```

### Test Suite
```
[feature] test suite passes measured by zero failures verified by `[test command]`
```

## Manual Verification (`[MANUAL]` prefix)

When a criterion requires human judgment — visual rendering, UX behavior, subjective quality — use the `[MANUAL]` prefix. Manual criteria are **exempt** from the format check.

```
- [ ] [MANUAL] Examples in the reference doc are accurate and cover all common pattern types
- [ ] [MANUAL] The updated draft templates read naturally as acceptance criteria
```

Manual criteria tell the task-verifier to mark them as `CANNOT_VERIFY` rather than attempting automated checking.

## Anti-Patterns

| Anti-Pattern | Why It Fails |
|---|---|
| `Code is clean measured by review` | `[COMMAND]` is missing — "review" is not a shell command |
| `Feature is fast measured by performance` | Both `[HOW]` and `[COMMAND]` are vague non-commands |
| `verified by checking the UI` | `[COMMAND]` must be a runnable shell command, not a description |
| `measured by it working correctly` | `[HOW]` must be an observable metric, not circular reasoning |
```

**Step 2: Verify file was created**

Run: `ls references/acceptance-criteria-patterns.md`
Expected: file path printed (exit 0)

**Step 3: Verify format spec is present**

Run: `grep -c "measured by" references/acceptance-criteria-patterns.md`
Expected: number >= 5

**Step 4: Commit**

```bash
git add references/acceptance-criteria-patterns.md
git commit -m "docs: add acceptance-criteria-patterns reference with structured format spec"
```

**Acceptance Criteria:**
- [ ] `references/acceptance-criteria-patterns.md` is created measured by file existence verified by `ls references/acceptance-criteria-patterns.md`
- [ ] Format specification section is present measured by "measured by" keyword count verified by `grep -c "measured by" references/acceptance-criteria-patterns.md`
- [ ] Good vs bad examples table is present measured by table header count verified by `grep -c "Bad\|Good" references/acceptance-criteria-patterns.md`
- [ ] Common patterns section covers at least 5 pattern types measured by section entry count verified by `grep -c "^###" references/acceptance-criteria-patterns.md`
- [ ] [MANUAL] prefix usage is documented measured by MANUAL section presence verified by `grep -c "MANUAL" references/acceptance-criteria-patterns.md`
- [ ] Anti-patterns table is present measured by table row count verified by `grep -c "Anti-Pattern\|anti-pattern" references/acceptance-criteria-patterns.md`
- [ ] [MANUAL] Examples in the reference doc are accurate and cover all common pattern types

**Quality Constraints:**
- Error handling: N/A — file creation only, no external calls
- Types: N/A — markdown file
- Function length: N/A
- Pattern: Follow `references/coding-standards.md` for documentation style
- Parallelizable: yes

---

### Task 2: Update verify-plan-criteria with format enforcement

**Files:**
- Modify: `skills/verify-plan-criteria/SKILL.md` (design-first — 189 lines)

**Step 1: Read the full SKILL.md**

Read `skills/verify-plan-criteria/SKILL.md` completely to understand the current structure of Step 3 (Check Each Task) and Step 4 (Draft Missing Criteria).

**Step 2: Output change plan (MANDATORY — design-first file)**

Before making any edits, output:
1. Which section of Step 3 receives the new format check (after vague-criteria flagging, before fast-path)
2. The exact text to insert for the format check
3. Which lines in Step 4's draft templates to replace and with what

**Step 3: Add format check to Step 3**

In the "Step 3: Check Each Task" section, after the existing vague-criteria flag block and before the fast-path block, insert the following format check section:

```
**Format check:** After flagging vague criteria, check that each non-`[MANUAL]` criterion follows the structured format. A criterion is conforming if it contains both `measured by` and `verified by` as substrings. Criteria that start with `- [x]` (already completed) are also exempt.

Flag non-conforming criteria with: `"Criterion does not follow [WHAT] measured by [HOW] verified by [COMMAND] format — see references/acceptance-criteria-patterns.md"`

Exempt from format check:
- Criteria with `[MANUAL]` prefix — these require human verification and don't need a shell command
- Already-completed criteria (`- [x]`) — checked items are not re-validated
```

**Step 4: Update Step 4 draft templates to structured format**

Replace each existing draft template in Step 4 with the structured format:

| Current template | New template |
|---|---|
| `"File exists at \`exact/path/to/file.ts\`"` | `` "`exact/path/to/file.ts` is created measured by file existence verified by `ls exact/path/to/file.ts`" `` |
| `"Changes exist in \`exact/path/to/file.ts\`"` | `` "`exact/path/to/file.ts` is modified measured by content change verified by `grep 'expected_pattern' exact/path/to/file.ts`" `` |
| `"Tests pass: \`npm run test\`"` | `` "Test suite passes measured by zero failures verified by `npm run test`" `` |
| `` "`npm run typecheck` passes with no new errors" `` | `` "TypeScript types are valid measured by zero new compilation errors verified by `npm run typecheck`" `` |
| `` "`npm run lint` passes with no new warnings" `` | `` "Linting passes measured by zero new warnings verified by `npm run lint`" `` |
| `` "Type/interface `Name` is exported from `path`" `` | `` "`Name` type is exported measured by export presence verified by `grep 'export.*Name' path`" `` |
| `"Component \`Name\` exists and accepts expected props"` | `` "`Name` component exists measured by file presence verified by `ls path/Name`" `` |
| `"Route handler exists at \`path\` and handles expected methods"` | `` "Route handler is defined measured by handler presence verified by `grep 'handler' path`" `` |
| `"Migration file exists in the migrations directory"` | `` "Migration file is present measured by file existence verified by `ls migrations/`" `` |

**Step 5: Verify format check is present in Step 3**

Run: `grep -c "Format check\|measured by.*verified by" skills/verify-plan-criteria/SKILL.md`
Expected: number >= 3

**Step 6: Verify Step 4 templates use structured format**

Run: `grep -c "measured by" skills/verify-plan-criteria/SKILL.md`
Expected: number >= 9

**Step 7: Commit**

```bash
git add skills/verify-plan-criteria/SKILL.md
git commit -m "feat: enforce structured [WHAT] measured by [HOW] verified by [COMMAND] format in verify-plan-criteria"
```

**Acceptance Criteria:**
- [ ] Format check section is present in Step 3 measured by section text presence verified by `grep -c "Format check" skills/verify-plan-criteria/SKILL.md`
- [ ] Format check correctly identifies non-conforming criteria measured by keyword detection logic verified by `grep -c "measured by.*verified by\|verified by.*measured by" skills/verify-plan-criteria/SKILL.md`
- [ ] `[MANUAL]` exemption is documented measured by exemption text presence verified by `grep -c "MANUAL.*exempt\|Exempt.*MANUAL" skills/verify-plan-criteria/SKILL.md`
- [ ] Reference to acceptance-criteria-patterns.md is included in the flag message measured by file reference presence verified by `grep -c "acceptance-criteria-patterns" skills/verify-plan-criteria/SKILL.md`
- [ ] All 9 Step 4 draft templates use structured format measured by "measured by" keyword count in SKILL.md verified by `grep -c "measured by" skills/verify-plan-criteria/SKILL.md`
- [ ] Typecheck template uses structured format measured by specific template text presence verified by `grep -c "TypeScript types are valid measured by" skills/verify-plan-criteria/SKILL.md`
- [ ] File creation template uses structured format measured by specific template text presence verified by `grep -c "is created measured by file existence" skills/verify-plan-criteria/SKILL.md`
- [ ] [MANUAL] Format check correctly flags a criterion like "Code quality is maintained" as non-conforming when verify-plan-criteria runs
- [ ] [MANUAL] Format check correctly passes a criterion like "TypeScript types are valid measured by zero new errors verified by `npm run typecheck`"

**Quality Constraints:**
- Error handling: N/A — text file modification only, no external calls or data processing
- Types: N/A — markdown skill file
- Function length: N/A — instruction text edits, not code
- Pattern: Follow existing Step 3 and Step 4 structure in `skills/verify-plan-criteria/SKILL.md`; match formatting style of existing flagging blocks
- Files modified: `skills/verify-plan-criteria/SKILL.md` (design-first — 189 lines)
- Design-first files: `skills/verify-plan-criteria/SKILL.md` — implementer must output change plan before editing
- Parallelizable: no
