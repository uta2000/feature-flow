# Align Test Detection with Quality Gate — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the Code Review Pipeline Phase 4 test runner detection in `skills/start-feature/SKILL.md` to exactly match the quality gate's `detectTestCommand()` behavior.

**Architecture:** Single-section text replacement in SKILL.md Phase 4 (lines 436-442). The quality gate's `detectTestCommand()` in `hooks/scripts/quality-gate.js` (lines 203-228) is the source of truth. No runtime code changes — markdown only.

**Tech Stack:** Markdown

**Issue:** #7

---

### Task 1: Update Phase 4 test runner detection list

**Files:**
- Modify: `skills/start-feature/SKILL.md:436-442` (Phase 4: Re-verify section)

**Step 1: Replace the test runner detection list**

Replace lines 436-442 in `skills/start-feature/SKILL.md`:

**Old content (lines 436-442):**
```markdown
1. **Run tests:** Detect the test runner from the project:
   - `package.json` with `test` script → `npm test` / `yarn test` / `pnpm test` (based on lockfile)
   - `Makefile` with `test` target → `make test`
   - `pytest.ini` / `pyproject.toml` / `setup.cfg` with pytest config → `pytest`
   - `go.mod` → `go test ./...`
   - `Cargo.toml` → `cargo test`
   If no test runner detected, skip and log: "No test runner detected — skipping test verification."
```

**New content:**
```markdown
1. **Run tests:** Detect the test runner from the project (matching the quality gate's `detectTestCommand()` in `hooks/scripts/quality-gate.js`):
   - `package.json` with `scripts.test` (not the npm default placeholder) → `npm test`. If `node_modules/` doesn't exist, skip with warning.
   - `Cargo.toml` → `cargo test`
   - `go.mod` → `go test ./...`
   - `mix.exs` → `mix test`
   - `pyproject.toml` / `pytest.ini` / `setup.cfg` / `tox.ini` → `python -m pytest`
   - If no test runner detected, skip and log: "No test runner detected — skipping test verification."
   - **Timeout:** 60 seconds. If the test suite times out, log a warning and skip (do not count as a failure).
   - **Error handling:** If the test command is not found (ENOENT / exit code 127), log a warning and skip. Do not fail the pipeline for a missing tool.
```

**Acceptance Criteria:**
- [ ] The Phase 4 test detection list in `skills/start-feature/SKILL.md` references `detectTestCommand()` from `hooks/scripts/quality-gate.js` as the source of truth
- [ ] Detection list includes: `npm test` (with node_modules guard and default placeholder skip), `cargo test`, `go test ./...`, `mix test`, `python -m pytest` (with `tox.ini`)
- [ ] Detection list does NOT include `Makefile` or `yarn test` / `pnpm test`
- [ ] 60-second timeout is documented
- [ ] ENOENT / exit code 127 error handling is documented
- [ ] The "No test runner detected" skip message is preserved

---

### Task 2: Add CHANGELOG entry

**Files:**
- Modify: `CHANGELOG.md:1-13` (add entry under new version or [Unreleased])

**Step 1: Add version entry**

Add a new version section at the top of CHANGELOG.md (after the header, before `[1.9.0]`):

```markdown
## [1.10.0] - 2026-02-20

### Changed
- **Code review test detection aligned with quality gate** — Phase 4 test runner detection now matches `detectTestCommand()` from `hooks/scripts/quality-gate.js` exactly: uses `npm test` only (not yarn/pnpm), checks `node_modules` existence, skips npm default placeholder, adds `mix test` (Elixir) and `tox.ini` (Python), documents 60-second timeout and command-not-found error handling. Closes #7.
```

**Acceptance Criteria:**
- [ ] CHANGELOG.md contains a `[1.10.0]` section dated `2026-02-20`
- [ ] Entry is under `### Changed` category
- [ ] Entry mentions alignment with `detectTestCommand()` from quality-gate.js
- [ ] Entry references issue #7
- [ ] Entry appears before the `[1.9.0]` section
