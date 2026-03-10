# Automated Failure Diagnosis — Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Add Step 3 Diagnose Failures to task-verifier.md — STATUS: pending
Task 2: Update verify-acceptance-criteria to display Diagnosis column — STATUS: pending
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.
> Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

**Goal:** When a `verified by [COMMAND]` fails, the task-verifier agent automatically diagnoses the root cause and suggests a fix — reducing debugging back-and-forth during the implementation loop.

**Architecture:** Two documentation-only changes: insert a new Step 3 (Diagnose Failures) into `agents/task-verifier.md` between the Execute and Report steps, and update `skills/verify-acceptance-criteria/SKILL.md` Step 4 to display the resulting Diagnosis column. No new agents, no new skills, no auto-fix complexity.

**Tech Stack:** Markdown (documentation only — no runtime code)

---

### Task 1: Add Step 3 (Diagnose Failures) to `agents/task-verifier.md`

**Files:**
- Modify: `agents/task-verifier.md` (94 lines)

**Acceptance Criteria:**
- [ ] `### Step 3: Diagnose Failures` section exists in `agents/task-verifier.md` measured by section heading presence verified by `grep -c "### Step 3: Diagnose Failures" agents/task-verifier.md`
- [ ] Pattern-matching table contains all 9 required error patterns measured by pattern keyword presence verified by `grep -c "Cannot find module\|is not assignable to type\|does not exist on type\|is not defined\|error TS" agents/task-verifier.md`
- [ ] Pattern-matching table contains remaining 4 patterns verified by `grep -c "no-unused-vars\|Expected.*but received\|ENOENT\|Stack trace" agents/task-verifier.md`
- [ ] LLM fallback section present for unrecognized errors verified by `grep -c "LLM Fallback\|no pattern matches\|unrecognized" agents/task-verifier.md`
- [ ] Similar-pattern search instructions present for type errors verified by `grep -c "[Ss]imilar-[Pp]attern" agents/task-verifier.md`
- [ ] Old `### Step 3: Produce Report` renamed to `### Step 4: Produce Report` verified by `grep -c "### Step 4: Produce Report" agents/task-verifier.md`
- [ ] Diagnosis column present in the report table template verified by `grep -c "Diagnosis" agents/task-verifier.md`

**Quality Constraints:**
- Error handling: N/A — documentation only
- Types: N/A — no code
- Function length: N/A
- Pattern: match the step/table style already used in `agents/task-verifier.md`
- Design-first: output your change plan (exact old_string → new_string for each Edit) before making any Edit calls
- Parallelizable: no (Task 2 depends on this completing first for context, though technically independent)

**Steps:**

Step 1: Read the full current file to understand exact structure:

Use Read tool: `file_path: agents/task-verifier.md`

Step 2: Output your change plan before editing. Identify:
- The exact `old_string` to target for renaming Step 3 → Step 4
- The exact `old_string` for inserting the new Step 3 block before it

Step 3: Insert the new `### Step 3: Diagnose Failures` section. Use Edit with:

**Edit A** — Rename old Step 3 heading and insert new Step 3 before it.

Find this exact string:
```
### Step 3: Produce Report
```

Replace with:
```
### Step 3: Diagnose Failures

For each criterion that returned **FAIL** in Step 2, run diagnosis on the failed command's output. Skip PASS and CANNOT_VERIFY criteria.

#### Pattern-Matching (fast path)

Scan the command's stderr/stdout for known patterns:

| Pattern | Diagnosis |
|---------|-----------|
| `Cannot find module '...'` or `Module not found` | Missing import — suggest `import { X } from 'path'` |
| `Type '...' is not assignable to type '...'` | Type mismatch — show expected vs actual, grep for correct usage |
| `Property '...' does not exist on type '...'` | Missing property — show the type definition, suggest addition |
| `'...' is not defined` or `Cannot find name '...'` | Undefined variable — suggest import or declaration |
| `error TS\d+:` | TypeScript error — extract error code and message |
| ESLint rule name (e.g., `no-unused-vars`) | Lint violation — show rule name, suggest fix |
| `Expected ... but received ...` (test assertion) | Test assertion failure — show expected vs actual values |
| `ENOENT` or `No such file or directory` | Missing file — suggest creation or correct path |
| Stack trace with `file:line` | Runtime error — extract location, show surrounding code |

If a pattern matches, produce a structured diagnosis:
```
**Root cause:** [diagnosis from table]
**Suggested fix:** [specific action]
```

#### Similar-Pattern Search (for type errors)

When `Type '...' is not assignable` or `Property '...' does not exist` is detected, use Grep to find correct usage of the same type or interface in the codebase:

```bash
grep -rn "TypeName" --include="*.ts" --include="*.tsx" | head -5
```

Include 1–3 matching examples in the diagnosis. If no matches exist, omit this section.

#### LLM Fallback (for unrecognized errors)

If no pattern matches, analyze the full error output using your own reasoning:
```
**Root cause:** [LLM-generated explanation]
**Suggested fix:** [LLM-generated suggestion]
```

Record each diagnosis in the FAIL row's **Diagnosis** field for Step 4's report. For PASS criteria, set Diagnosis to `—`.

---

### Step 4: Produce Report
```

Step 4: Update the report table template in Step 4 (now at old Step 3 location) to add the Diagnosis column.

**Edit B** — Find the current report table header:

```
| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | [criterion text] | PASS | [what you found] |
| 2 | [criterion text] | FAIL | [what went wrong] |
| 3 | [criterion text] | CANNOT_VERIFY | [why — e.g., requires runtime test] |
```

Replace with:
```
| # | Criterion | Status | Evidence | Diagnosis |
|---|-----------|--------|----------|-----------|
| 1 | [criterion text] | PASS | [what you found] | — |
| 2 | [criterion text] | FAIL | [what went wrong] | **Root cause:** [explanation]<br>**Suggested fix:** [action] |
| 3 | [criterion text] | CANNOT_VERIFY | [why — e.g., requires runtime test] | — |
```

Step 5: Verify all acceptance criteria pass:

```bash
grep -c "### Step 3: Diagnose Failures" agents/task-verifier.md
```
Expected: `1`

```bash
grep -c "Cannot find module\|is not assignable to type\|does not exist on type\|is not defined\|error TS" agents/task-verifier.md
```
Expected: `1` (all patterns on multiple lines — count may be higher; just ensure non-zero)

```bash
grep -c "### Step 4: Produce Report" agents/task-verifier.md
```
Expected: `1`

```bash
grep -c "Diagnosis" agents/task-verifier.md
```
Expected: `2` or more (column header + table row examples)

Step 6: Commit (one commit per criterion per atomic commit guidelines):

```bash
git add agents/task-verifier.md
git commit -m "feat(task-verifier): add failure diagnosis step with pattern-matching and LLM fallback — ✓Step 3 Diagnose Failures added ✓9 patterns ✓LLM fallback ✓similar-pattern search ✓Step 4 rename ✓Diagnosis column"
```

---

### Task 2: Update `skills/verify-acceptance-criteria/SKILL.md` to display Diagnosis column

**Files:**
- Modify: `skills/verify-acceptance-criteria/SKILL.md` (146 lines)

**Acceptance Criteria:**
- [ ] Step 4 (Present Results) references the Diagnosis column from the verifier report verified by `grep -c "[Dd]iagnosis" skills/verify-acceptance-criteria/SKILL.md`
- [ ] The INCOMPLETE path shows suggested fixes inline with failure details verified by `grep -c "[Ss]uggested fix\|diagnosis column\|Diagnosis column" skills/verify-acceptance-criteria/SKILL.md`

**Quality Constraints:**
- Error handling: N/A — documentation only
- Types: N/A
- Function length: N/A
- Pattern: match the if/else branch style already used in Step 4 of this file
- Design-first: output your change plan before any Edit calls
- Parallelizable: yes (independent of Task 1 for implementation purposes)

**Steps:**

Step 1: Read the current Step 4 (Present Results) section:

Use Read tool: `file_path: skills/verify-acceptance-criteria/SKILL.md, offset: 101, limit: 46`

Step 2: Output your change plan before editing.

Step 3: Update the INCOMPLETE branch to show diagnosis inline.

**Edit A** — Find the INCOMPLETE block:

```
**If INCOMPLETE:**
```
Some acceptance criteria failed. The following need attention:

[show report table, highlighting FAIL items]

Issues to fix:
1. [criterion] — [evidence of failure]
2. [criterion] — [evidence of failure]

Fix these issues and run verify-acceptance-criteria again.
```
```

Replace with:
```
**If INCOMPLETE:**
```
Some acceptance criteria failed. The following need attention:

[show report table — includes Diagnosis column for FAIL rows with root cause and suggested fix]

Issues to fix:
1. [criterion] — [evidence of failure]
   → [suggested fix from Diagnosis column, if available]
2. [criterion] — [evidence of failure]
   → [suggested fix from Diagnosis column, if available]

Fix these issues and run verify-acceptance-criteria again.
```
```

Step 4: Verify acceptance criteria pass:

```bash
grep -c "Diagnosis" skills/verify-acceptance-criteria/SKILL.md
```
Expected: `1` or more

```bash
grep -c "suggested fix\|Diagnosis column" skills/verify-acceptance-criteria/SKILL.md
```
Expected: `1` or more

Step 5: Commit:

```bash
git add skills/verify-acceptance-criteria/SKILL.md
git commit -m "feat(verify-acceptance-criteria): display Diagnosis column and suggested fixes in INCOMPLETE report — ✓Diagnosis column referenced ✓suggested fixes shown in INCOMPLETE path"
```
