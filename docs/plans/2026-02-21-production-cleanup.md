# Production Cleanup — Design Document

**Date:** 2026-02-21
**Status:** Draft
**Issue:** #56

## Overview

Final production review of PRs 44-55 revealed cleanup items across 3 severity levels. All items are mechanical fixes — no logic changes, no new features. The plugin functions correctly but has leftover artifacts from the `start-feature` → `start` rename (PR #55) and `spec-driven` → `feature-flow` rename (earlier PRs).

## Cleanup Items

### CRITICAL — Orphaned Files and Stale Config

1. **Delete `skills/start-feature/`** — Orphaned directory from PR #55 rename. Contains only `CLAUDE.md` and `references/CLAUDE.md` (no SKILL.md).
2. **Delete `https:` directory** — Accidental directory created from a raw GitHub URL path.
3. **Delete `.spec-driven.yml`** — Old config file. Migrate `context7: {node-js: /vercel/next.js}` to `.feature-flow.yml` first.
4. **Clean untracked files** — Commit `docs/plans/*.md` files (they document implemented PRs). Delete `superpowers/` (stale worktree artifact containing only `.git`). Add `superpowers/` pattern to `.gitignore` if not already covered.

### IMPORTANT — Version and Release Hygiene

5. **Version the `[Unreleased]` section** — Replace with `## [1.15.0] - 2026-02-21`. Add new empty `## [Unreleased]` above. Version matches `plugin.json` (1.15.0) and `marketplace.json` (1.15.0).
6. **Verify version consistency** — Confirm `plugin.json`, `marketplace.json`, and CHANGELOG all show 1.15.0.

### MINOR — Polish

7. **Add `skills/session-report/CLAUDE.md`** — Only skill directory missing a CLAUDE.md. Use the standard claude-mem template (matches `skills/spike/CLAUDE.md`).
8. **Clean stale worktrees** — `git worktree prune`.
9. **Verify `references/stacks/CLAUDE.md`** — Check claude-mem entries are acceptable (cosmetic).

## Scope

**Included:**
- File deletions (orphaned directories and files)
- Config migration (`.spec-driven.yml` → `.feature-flow.yml`)
- CHANGELOG versioning
- Version consistency verification
- Missing CLAUDE.md creation
- Worktree cleanup
- Committing existing untracked plan docs

**Excluded:**
- No logic changes
- No new features
- No dependency updates
- No hook modifications
