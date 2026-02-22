# Align Code Review Pipeline Test Detection with Quality Gate — Design Document

**Date:** 2026-02-20
**Status:** Draft
**Issue:** #7

## Overview

The Code Review Pipeline Phase 4 in `skills/start-feature/SKILL.md` already runs tests after code review fixes and loops up to 3 times on failure — satisfying 5 of 6 acceptance criteria from issue #7. However, its test runner detection description diverges from the quality gate's `detectTestCommand()` in `hooks/scripts/quality-gate.js`. This change aligns them so both systems use identical detection logic.

## Current State

**Phase 4 detection (SKILL.md lines 436-442):**
```
- package.json with test script → npm test / yarn test / pnpm test (based on lockfile)
- Makefile with test target → make test
- pytest.ini / pyproject.toml / setup.cfg with pytest config → pytest
- go.mod → go test ./...
- Cargo.toml → cargo test
```

**Quality gate detection (`detectTestCommand()`, quality-gate.js lines 203-228):**
```
- package.json with test script (not default placeholder) → npm test
  - Checks node_modules existence first, warns if missing
- Cargo.toml → cargo test
- go.mod → go test ./...
- mix.exs → mix test
- pyproject.toml / pytest.ini / setup.cfg / tox.ini → python -m pytest
```

## Changes

Replace the Phase 4 test runner detection list with one that matches `detectTestCommand()` exactly:

1. **Package manager:** Change "npm test / yarn test / pnpm test (based on lockfile)" → `npm test` only
2. **node_modules guard:** Add check — if `package.json` has a test script but `node_modules/` doesn't exist, skip with warning
3. **npm default placeholder:** Skip if test script is the default `"echo \"Error: no test specified\" && exit 1"`
4. **Remove Makefile:** Quality gate doesn't support it
5. **Add Elixir:** `mix.exs` → `mix test`
6. **Add tox.ini:** Include in Python detection triggers
7. **Python command:** Change `pytest` → `python -m pytest`
8. **Timeout:** Add 60-second timeout mention
9. **Error handling:** Add graceful handling for command-not-found (ENOENT / exit code 127) and timeout (SIGTERM) — both produce warnings, not failures

## Scope

**Included:**
- Update Phase 4 test runner detection list in `skills/start-feature/SKILL.md`
- CHANGELOG entry

**Excluded:**
- No changes to `quality-gate.js` (it's already correct)
- No changes to README (doesn't include detection details)
- No changes to any other lifecycle steps
