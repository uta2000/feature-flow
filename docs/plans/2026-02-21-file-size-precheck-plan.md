# File Size Pre-Check Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add file size pre-check instructions to subagent dispatch steps so agents avoid reading files that exceed the 256KB tool limit.

**Architecture:** Three additive insertions — one bullet in Study Existing Patterns agent context, one paragraph in Code Review Pipeline process, and one new section in coding-standards.md.

**Tech Stack:** Claude Code plugin (markdown skills, no compile, no build, no tests).

**Design Doc:** `docs/plans/2026-02-21-file-size-precheck.md`
**Issue:** #37

---

### Task 1: Add file size check to Study Existing Patterns agent context

**Files:**
- Modify: `skills/start-feature/SKILL.md:551` — insert after the last agent instruction bullet

**Acceptance Criteria:**
- [ ] `skills/start-feature/SKILL.md` contains a new bullet under "Context passed to each agent" with instruction to check file size with `wc -c < file` before reading
- [ ] The bullet specifies the 200KB threshold
- [ ] The bullet lists two alternatives: Grep for relevant sections, or Read with offset/limit
- [ ] The new bullet appears after the existing "flag anti-patterns" bullet and before the "Expected return format" section

**Steps:**

1. Read `skills/start-feature/SKILL.md` and locate the "Context passed to each agent" section (~line 548)

2. Insert the following bullet after line 551 (after the "flag anti-patterns" instruction):

```markdown
   - Instructions: before reading any file, check its size with `wc -c < file`. If >200KB, use Grep to find relevant sections instead of reading the whole file, or use Read with offset/limit parameters targeting the specific functions/components being studied.
```

3. Verify the new bullet sits between the "flag anti-patterns" bullet and the "Expected return format" section

**Commit:**

```bash
git add skills/start-feature/SKILL.md
git commit -m "fix: add file size pre-check to study-patterns agent context

Instructs Explore agents to check file size before reading. Files >200KB
should use Grep or Read with offset/limit to avoid hitting the 256KB
tool limit. Fixes #37 (1/3)"
```

---

### Task 2: Add large file handling to Code Review Pipeline

**Files:**
- Modify: `skills/start-feature/SKILL.md:667` — insert after "Model override" paragraph, before "Phase 1" heading

**Acceptance Criteria:**
- [ ] `skills/start-feature/SKILL.md` contains a "Large file handling" paragraph in the Code Review Pipeline Process section
- [ ] The paragraph specifies the 200KB threshold
- [ ] The paragraph instructs review agents to use `git diff main...HEAD -- <file>` for large files
- [ ] The paragraph appears after the "Model override" paragraph and before the "Phase 1: Dispatch review agents" heading

**Steps:**

1. Read `skills/start-feature/SKILL.md` and locate the Code Review Pipeline "Process" section (~line 664)

2. Insert the following after line 666 (after the "Model override" paragraph), before the `#### Phase 1` heading:

```markdown
**Large file handling:** If the branch diff includes files >200KB, instruct review agents to use `git diff main...HEAD -- <file>` for those files instead of reading the full file. The diff contains only the changed sections, which is what reviewers need.

```

3. Verify the new paragraph sits between the "Model override" paragraph and the "Phase 1" heading

**Commit:**

```bash
git add skills/start-feature/SKILL.md
git commit -m "fix: add large file handling to code review pipeline

Instructs review agents to use git diff for files >200KB instead of
reading the full file. The diff contains only changed sections.
Fixes #37 (2/3)"
```

---

### Task 3: Add Tool Usage Patterns section to coding-standards.md

**Files:**
- Modify: `references/coding-standards.md:170` — insert new section before "How This File Is Used"

**Acceptance Criteria:**
- [ ] `references/coding-standards.md` contains a `## Tool Usage Patterns` section
- [ ] The section includes 4 bullet points: file size check, large file alternatives, code review preference, generated files warning
- [ ] The section appears immediately before the existing `## How This File Is Used` section
- [ ] Each bullet follows the existing coding-standards format: bold lead phrase, then explanation

**Steps:**

1. Read `references/coding-standards.md` and locate the `## How This File Is Used` section (~line 171)

2. Insert the following new section before line 171:

```markdown
## Tool Usage Patterns

- **Check file size before `Read` on unfamiliar files:** `wc -c < file`. Files >200KB will exceed the 256KB tool limit.
- **Large files (>200KB):** Use Grep to find relevant sections, or Read with offset/limit targeting specific functions.
- **Code review:** `git diff` is always smaller than the full file — prefer it for reviewing changes.
- **Never read generated files whole:** Build artifacts, minified bundles, lock files, and generated types can be megabytes. Always use targeted reads.

```

3. Verify the new section appears between the "React / React Native" stack-specific section and the "How This File Is Used" section

**Commit:**

```bash
git add references/coding-standards.md
git commit -m "fix: add tool usage patterns to coding standards

Adds guidance on checking file size before Read operations, using Grep
for large files, and preferring git diff for code review.
Fixes #37 (3/3)"
```
