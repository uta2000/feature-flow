# Context Engineering & Knowledge Base — Design

**Issue:** GH165
**Date:** 2026-03-09
**Effort:** Small

---

## Overview

A lightweight per-feature context file (`FEATURE_CONTEXT.md`) that persists curated knowledge across sessions within a git branch. The start skill loads it on pre-flight, archives stale entries automatically, and injects the content into the lifecycle context so downstream skills benefit without re-discovering what was already decided.

## Architecture

**Components:**
1. `FEATURE_CONTEXT.md` template — committed at worktree root when a feature branch is created
2. Archival logic — embedded in the start skill's Step 0 pre-flight; moves stale entries to `DECISIONS_ARCHIVE.md`
3. Start skill integration — two additions to Step 0: load+archive, then inject into lifecycle context + print notice
4. `.feature-flow.yml` additions — `knowledge_base.max_lines` (default 150) and `knowledge_base.stale_days` (default 14)

**Lifecycle:**
```
start: GH123 (second session)
  └── Step 0: pre-flight
        ├── load .feature-flow.yml (existing)
        ├── detect FEATURE_CONTEXT.md in worktree
        ├── archive entries > 14 days or file > 150 lines
        ├── inject content into lifecycle context object
        └── print "Resuming feature — N decisions loaded"
```

No new skills needed — all logic lives in the start skill's Step 0 and the worktree setup step.

---

## FEATURE_CONTEXT.md Template

Created by the worktree setup step when a new branch is initialized. Committed as part of the initial branch commit.

```markdown
# Feature Context

> Auto-managed by feature-flow. Decisions older than 14 days are archived to DECISIONS_ARCHIVE.md.

## Key Decisions

<!-- Add decisions as they're made. Format: - [YYYY-MM-DD] Decision text -->

## Open Questions

<!-- Optional: unresolved questions to revisit next session -->

## Notes

<!-- Optional: discoveries, gotchas, links -->
```

**Decision entry format:**
```
- [2026-03-09] Chose worktree-root placement for FEATURE_CONTEXT.md over .feature-flow/ directory
```

**DECISIONS_ARCHIVE.md** (created on first archival):
```markdown
# Decisions Archive

> Entries moved here automatically when FEATURE_CONTEXT.md exceeded size budget or age threshold.

## Archived from [branch-name]

- [2026-02-20] stale decision text
```

Both files are committed by default (useful for team awareness).

---

## Archival Logic

Runs during Step 0 pre-flight, after `.feature-flow.yml` is loaded.

**Algorithm:**
```
If FEATURE_CONTEXT.md exists in the worktree root:
  1. Parse all bullet entries under ## Key Decisions
  2. Extract date from each entry: [YYYY-MM-DD]
  3. Mark entries as stale if date is > stale_days old (default 14)
  4. If stale entries exist OR line count > max_lines (default 150):
       a. Move stale entries to DECISIONS_ARCHIVE.md (append, don't overwrite)
       b. If still > max_lines after age-based archival:
            Move oldest remaining entries until under budget
       c. Rewrite FEATURE_CONTEXT.md with remaining entries
       d. Commit both files: "chore: archive stale decisions [auto]"
  5. Count remaining Key Decisions entries → N
```

**Edge cases:**
- `DECISIONS_ARCHIVE.md` doesn't exist → create it with branch name header
- `## Key Decisions` is empty → skip archival, no notice printed
- All entries are stale → archive all, leave empty stub
- No dated entries (free-form notes) → skip archival entirely

The auto-commit only runs when archival actually happens, not on every session start.

---

## Start Skill Integration

**File:** `skills/start/references/project-context.md`

### Addition 1: Knowledge Base Pre-Flight Block

After `.feature-flow.yml` is loaded, add:

```
## Knowledge Base Pre-Flight

If FEATURE_CONTEXT.md exists in the current directory:
  - Run archival logic
  - Load remaining content into lifecycle context:
      context.feature_context = <file contents>
  - Count Key Decisions entries → N
  - If N > 0: print "📋 Resuming feature — {N} decisions loaded"
  - If N == 0: print nothing

If FEATURE_CONTEXT.md does not exist:
  - Print nothing (new feature, will be created at worktree setup)
```

### Addition 2: Lifecycle Context Object

New field added to the existing `context` object:
```
context.feature_context  # string | null — contents of FEATURE_CONTEXT.md
```

Injected as args into:
- `superpowers:brainstorming` — knows what was already decided
- `superpowers:writing-plans` — avoids re-litigating settled design questions
- `feature-flow:design-document` — can reference prior decisions directly

### Addition 3: Worktree Setup Step

After the worktree is created (Step 10, Feature scope), add:
> "Create `FEATURE_CONTEXT.md` from the standard template in the worktree root and include it in the initial branch commit."

---

## Configuration

New optional `.feature-flow.yml` fields:

```yaml
knowledge_base:
  max_lines: 150      # Archive oldest entries when file exceeds this (default: 150)
  stale_days: 14      # Archive entries older than this many days (default: 14)
```

Both fields are optional. If absent, defaults apply silently.

---

## Files Changed

| File | Change |
|------|--------|
| `skills/start/references/project-context.md` | Add knowledge base pre-flight block |
| `references/project-context-schema.md` | Add `knowledge_base` schema entry |
| `docs/plans/2026-03-09-context-engineering-knowledge-base.md` | This design doc |
