# Worktree Env File Copying — Design Document

**Date:** 2026-02-21
**Status:** Draft
**Issue:** #26

## Overview

Add a "Copy Env Files" inline step to the `start-feature` skill so that gitignored `.env` files from the main worktree are available in new worktrees before tests run. Without this, baseline tests fail on env-dependent projects, implementations can't be tested, and some dependency installs break.

**Key decision:** This is implemented as an inline step in spec-driven's `start-feature/SKILL.md` — NOT by modifying the superpowers `using-git-worktrees` skill, which we don't own.

## Problem

Git worktrees share the same `.git` directory but each has its own working tree. Files in `.gitignore` (like `.env`) are not tracked by git and are **absent** from new worktrees. The current lifecycle has no step to bring them over.

Three failure modes:

1. **Baseline tests fail** — tests that read env vars get `undefined` and throw. The skill reports "tests failing" when the real problem is missing config.
2. **Implementation untestable** — the developer completes TDD, code review, and verification but can't run the app in the worktree.
3. **Dependency install fails** — postinstall scripts that read env vars (e.g., Prisma generate reading `DATABASE_URL`) fail silently or crash.

## User Flow

### Step 1 — User invokes worktree setup
The `using-git-worktrees` skill runs as normal: directory selection, safety verification, worktree creation, dependency installation.

### Step 2 — Env files are copied (new inline step)
After the worktree is created and dependencies installed, the `start-feature` lifecycle runs its "Copy Env Files" inline step. It locates the main worktree root and copies non-production `.env*` files into the new worktree. If env files are copied, it announces: "Copied N env files from main worktree: [list]". If no env files exist, silent skip.

### Step 3 — Study existing patterns + baseline tests run
The lifecycle continues with study existing patterns and then implementation. Tests now have access to the same env vars as the main worktree.

## Technical Approach

### Target File

`skills/start-feature/SKILL.md` in the spec-driven plugin. The change adds one new inline step section and updates three existing sections (step lists, skill mapping table).

### New Inline Step: Copy Env Files Step (inline — no separate skill)

Follows the established inline step pattern used by Commit Planning Artifacts, Study Existing Patterns, Self-Review, Code Review Pipeline, Generate CHANGELOG Entry, and Documentation Lookup.

**Lifecycle position:** After worktree setup, before study existing patterns.

**Source path resolution:**

```bash
MAIN_WORKTREE=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
```

Uses `git worktree list` to reliably find the main worktree root regardless of where the new worktree was created (project-local `.worktrees/` or global `~/.config/`).

**File filter logic:**

| Pattern | Action | Reason |
|---------|--------|--------|
| `.env`, `.env.local`, `.env.development`, `.env.development.local` | Copy | Standard development env files |
| `.env.test`, `.env.test.local` | Copy | Needed for baseline test runs |
| `.env.production`, `.env.production.local` | **Skip** | Principle of least privilege — never propagate production secrets |
| Any `*.production` or `*.production.*` | **Skip** | Same principle |
| `.env.example` | **Skip** | Tracked by git, already present in worktree |

**Behavior:**
- Files found → copy and announce: `"Copied N env files from main worktree: .env .env.local"`
- No files found → silent skip (not all projects use env files)

### Sections of SKILL.md That Change

1. **Step lists** — All three scopes that use worktrees (small enhancement, feature, major feature) get a new "Copy env files" step inserted after "Worktree setup" and before "Study existing patterns". All subsequent steps renumber.
2. **Skill mapping table** — New row: `Copy env files | No skill — inline step (see below) | Env files available in worktree`
3. **New inline step section** — `### Copy Env Files Step (inline — no separate skill)` added after the "Commit Planning Artifacts Step" section and before the "Study Existing Patterns Step" section, following the established header format and process structure.

### Security Model

Local-to-local copy on the same machine. No security boundary is crossed. The production file exclusion is a safety measure (preventing accidental production config in development), not a security boundary.

## Key Decisions

- **Inline step in start-feature, not modification to superpowers** — We don't own the superpowers plugin. The start-feature lifecycle already has 6 inline steps; this follows the same pattern.
- **Copy not symlink** — `cp` is simpler, avoids edge cases with tools that don't follow symlinks, and matches the worktree's "independent working tree" model
- **After worktree setup, before study existing patterns** — env vars are available when implementation and tests run later in the lifecycle
- **Production exclusion by pattern** — `case` statement matches `.env.production`, `.env.production.local`, and any `*.production`/`*.production.*` variants
- **Silent skip when no env files** — not all projects use `.env` files; absence is normal, not an error
- **Quick fix scope excluded** — quick fixes don't use worktrees, so the step doesn't apply

## Scope

**Included:**
- New inline step section in `skills/start-feature/SKILL.md`
- Step list updates for small enhancement, feature, and major feature scopes
- Skill mapping table update
- Step renumbering for all affected scopes

**Excluded:**
- No changes to superpowers `using-git-worktrees` skill
- No changes to other spec-driven skills or files
- No changes to hooks
- No changes to quick fix scope (doesn't use worktrees)
- No `.env.example` generation or templating
