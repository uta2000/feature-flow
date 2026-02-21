# File Size Pre-Check for Read Operations — Design Document

**Date:** 2026-02-21
**Status:** Draft
**Issue:** #37

## Overview

Add file size pre-check instructions to the Study Existing Patterns and Code Review Pipeline steps in `skills/start-feature/SKILL.md`, and add a general Tool Usage Patterns section to `references/coding-standards.md`. This prevents subagents from attempting to `Read` files that exceed the 256KB tool limit, which wastes tool calls and tokens on error recovery.

## Problem

During a session, an agent attempted to `Read` an 8.7MB file, triggering:

```
File content (8.7MB) exceeds maximum allowed size (256KB).
Please use offset and limit parameters to read specific sections.
```

This happens in two lifecycle steps that dispatch subagents to read codebase files:
1. **Study Existing Patterns** — Explore agents reading example files
2. **Code Review Pipeline** — Review agents reading changed files

## User Flow

### Step 1 — Agent encounters a file during pattern study or code review
### Step 2 — Agent checks file size before reading (new behavior)
### Step 3 — If >200KB, agent uses Grep for relevant sections or Read with offset/limit
### Step 4 — No wasted tool call, no error recovery needed

## Changes

### 1. Study Existing Patterns — Agent Context (SKILL.md ~line 548)

Add a new bullet to the "Context passed to each agent" section instructing Explore agents to check file size before reading:

```markdown
- Instructions: before reading any file, check its size with `wc -c < file`.
  If >200KB, use Grep to find relevant sections instead of reading the whole file,
  or use Read with offset/limit parameters targeting the specific functions/components
  being studied.
```

This is added alongside the existing agent instructions about reading example files and flagging anti-patterns.

### 2. Code Review Pipeline — Agent Dispatch (SKILL.md ~line 662)

Add a "Large file handling" instruction to the process section, before Phase 1 dispatch:

```markdown
**Large file handling:** If the branch diff includes files >200KB, instruct review
agents to use `git diff main...HEAD -- <file>` for those files instead of reading
the full file. The diff contains only the changed sections, which is what reviewers need.
```

### 3. Coding Standards — Tool Usage Patterns (coding-standards.md)

Add a new `## Tool Usage Patterns` section before the existing `## How This File Is Used` section:

```markdown
## Tool Usage Patterns

- **Check file size before `Read` on unfamiliar files:** `wc -c < file`. Files >200KB will exceed the 256KB tool limit.
- **Large files (>200KB):** Use Grep to find relevant sections, or Read with offset/limit targeting specific functions.
- **Code review:** `git diff` is always smaller than the full file — prefer it for reviewing changes.
- **Never read generated files whole:** Build artifacts, minified bundles, lock files, and generated types can be megabytes. Always use targeted reads.
```

## Scope

**Included:**
- File size pre-check instruction in Study Existing Patterns agent context
- Large file handling instruction in Code Review Pipeline
- New Tool Usage Patterns section in coding-standards.md

**Excluded:**
- No changes to hooks or JavaScript files
- No changes to other skills
- No automated enforcement (this is guidance, not a gate)
