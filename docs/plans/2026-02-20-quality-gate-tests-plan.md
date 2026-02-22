# Quality Gate Test Suite Check — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `checkTests()` function to quality-gate.js so sessions cannot end with a failing test suite.

**Architecture:** Add two functions to the existing quality-gate.js — `detectTestCommand()` detects the project's test runner, and `checkTests()` runs it with a timeout. Follows the exact same pattern as `checkTypeScript()` and `checkLint()`. Timeouts produce a WARNING (not BLOCK) to avoid trapping users in sessions when tests are slow.

**Tech Stack:** Node.js (child_process.execSync), no dependencies

**Issue:** #6

---

### Task 1: Add `detectTestCommand()` helper

**Files:**
- Modify: `hooks/scripts/quality-gate.js:170-231` (Helpers section)

**Acceptance Criteria:**
- [ ] `detectTestCommand` function exists in `hooks/scripts/quality-gate.js`
- [ ] Returns `'npm test'` when `package.json` has a `scripts.test` that is not the npm default placeholder
- [ ] Returns `null` when `package.json` has `"test": "echo \"Error: no test specified\" && exit 1"`
- [ ] Returns `null` when no `package.json` exists and no language-specific config files exist
- [ ] Returns `'cargo test'` when `Cargo.toml` exists
- [ ] Returns `'go test ./...'` when `go.mod` exists
- [ ] Returns `'mix test'` when `mix.exs` exists
- [ ] Returns `'python -m pytest'` when `pyproject.toml`, `pytest.ini`, `setup.cfg`, or `tox.ini` exists
- [ ] Reuses existing `package.json` parse warning pattern (try-catch with `warnings.push`) from `checkLint()`

**Step 1: Add the function**

Add this code to the Helpers section of `quality-gate.js`, before the `execOutput` function (around line 170):

```javascript
function detectTestCommand() {
  if (existsSync('package.json')) {
    try {
      const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
      const testScript = pkg.scripts?.test;
      if (testScript && !testScript.includes('no test specified')) {
        return 'npm test';
      }
    } catch (e) {
      warnings.push(`[spec-driven] Failed to parse package.json for test detection: ${e.message?.slice(0, 100) || 'unknown'}`);
    }
  }

  if (existsSync('Cargo.toml')) return 'cargo test';
  if (existsSync('go.mod')) return 'go test ./...';
  if (existsSync('mix.exs')) return 'mix test';
  if (existsSync('pyproject.toml') || existsSync('pytest.ini') || existsSync('setup.cfg') || existsSync('tox.ini')) {
    return 'python -m pytest';
  }

  return null;
}
```

**Step 2: Verify the function was added**

Run: `node -e "const src = require('fs').readFileSync('hooks/scripts/quality-gate.js', 'utf8'); console.log(src.includes('detectTestCommand'))"`
Expected: `true`

**Step 3: Commit**

```bash
git add hooks/scripts/quality-gate.js
git commit -m "feat(quality-gate): add detectTestCommand helper for test runner detection"
```

---

### Task 2: Add `checkTests()` function

**Files:**
- Modify: `hooks/scripts/quality-gate.js` (add new check section after Check 3)

**Acceptance Criteria:**
- [ ] `checkTests` function exists in `hooks/scripts/quality-gate.js`
- [ ] Calls `detectTestCommand()` and returns early if `null`
- [ ] Runs the detected command with `execSync` and a 60-second timeout
- [ ] On timeout (`e.killed` is `true`), pushes a WARNING (not a failure)
- [ ] On test failure (non-zero exit), pushes a BLOCK failure with first 20 lines via `execOutput()`
- [ ] Uses the `[TEST]` label prefix, matching the `[TSC]`, `[LINT]`, `[TYPE-SYNC]` convention

**Step 1: Add the function**

Add this code after the `checkTypeSync` function (after line 104, before `// --- Helpers ---`):

```javascript
// --- Check 4: Tests ---

function checkTests() {
  const cmd = detectTestCommand();
  if (!cmd) return;

  try {
    execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 });
  } catch (e) {
    if (e.killed) {
      warnings.push('[spec-driven] Test suite timed out (60s) — skipping. Run tests manually.');
      return;
    }
    const lines = execOutput(e).split('\n').slice(0, 20).join('\n  ');
    failures.push(`[TEST] Test suite failed\n  ${lines}`);
  }
}
```

**Step 2: Verify the function was added**

Run: `node -e "const src = require('fs').readFileSync('hooks/scripts/quality-gate.js', 'utf8'); console.log(src.includes('checkTests'))"`
Expected: `true`

**Step 3: Commit**

```bash
git add hooks/scripts/quality-gate.js
git commit -m "feat(quality-gate): add checkTests function with timeout handling"
```

---

### Task 3: Wire `checkTests()` into top-level execution

**Files:**
- Modify: `hooks/scripts/quality-gate.js:11-13` (top-level check execution)

**Acceptance Criteria:**
- [ ] `checkTests()` is called after `checkTypeSync()` at the top level
- [ ] Wrapped in the same try-catch crash protection pattern as other checks
- [ ] Warning message on crash follows the same format: `[spec-driven] Test check failed unexpectedly: {message}`

**Step 1: Add the call**

After line 13 (`try { checkTypeSync(); } catch ...`), add:

```javascript
try { checkTests(); } catch (e) { warnings.push(`[spec-driven] Test check failed unexpectedly: ${e.message?.slice(0, 100)}`); }
```

**Step 2: Verify wiring**

Run: `node -e "const src = require('fs').readFileSync('hooks/scripts/quality-gate.js', 'utf8'); const calls = src.match(/try \\{ check\\w+\\(\\)/g); console.log(calls)"`
Expected: Array containing `try { checkTypeScript()`, `try { checkLint()`, `try { checkTypeSync()`, `try { checkTests()`

**Step 3: Commit**

```bash
git add hooks/scripts/quality-gate.js
git commit -m "feat(quality-gate): wire checkTests into top-level execution"
```

---

### Task 4: Update hooks.json timeout and statusMessage

**Files:**
- Modify: `hooks/hooks.json:75-85` (Stop hook configuration)

**Acceptance Criteria:**
- [ ] Stop hook timeout in `hooks/hooks.json` is increased from `120` to `180` to accommodate test suite runtime
- [ ] `statusMessage` updated to include "tests" — e.g., `"Running code quality checks (tsc, lint, type-sync, tests)..."`

**Step 1: Update hooks.json**

In `hooks/hooks.json`, update the Stop hook entry:
- Change `"timeout": 120` to `"timeout": 180`
- Change `"statusMessage": "Running code quality checks (tsc, lint, type-sync)..."` to `"statusMessage": "Running code quality checks (tsc, lint, type-sync, tests)..."`

**Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json', 'utf8')); console.log('valid')"`
Expected: `valid`

**Step 3: Commit**

```bash
git add hooks/hooks.json
git commit -m "chore(hooks): increase Stop timeout to 180s, add tests to statusMessage"
```

---

### Task 5: Update CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

**Acceptance Criteria:**
- [ ] CHANGELOG.md contains an entry for the test suite check feature
- [ ] Entry mentions `checkTests()`, test runner detection, and timeout-as-warning behavior

**Step 1: Add changelog entry**

Add a new section at the top of CHANGELOG.md (or under the existing unreleased section):

```markdown
## [1.8.0] - 2026-02-20

### Added
- **Test suite check in quality gate** — Stop hook now runs the project's test suite (`npm test`, `cargo test`, `go test`, `pytest`, `mix test`) before ending a session. Failing tests BLOCK the session. Timeouts produce a warning instead of blocking. Projects without a test runner are skipped silently.
```

**Step 2: Verify**

Run: `node -e "const cl = require('fs').readFileSync('CHANGELOG.md', 'utf8'); console.log(cl.includes('Test suite check'))"`
Expected: `true`

**Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add v1.8.0 changelog for quality-gate test suite check"
```

---

### Task 6: Manual verification — npm test detection

**Acceptance Criteria:**
- [ ] Running `node hooks/scripts/quality-gate.js` in a directory with no `package.json` produces no test-related output
- [ ] Running in a directory with a `package.json` that has `"test": "echo \"Error: no test specified\" && exit 1"` produces no test-related output (npm default is skipped)

**Step 1: Test with no package.json**

Run from a temp directory:
```bash
cd /tmp && mkdir -p qg-test-empty && cd qg-test-empty && node /path/to/hooks/scripts/quality-gate.js 2>&1
```
Expected: No `[TEST]` output

**Step 2: Test with npm default test script**

```bash
cd /tmp && mkdir -p qg-test-default && cd qg-test-default && echo '{"scripts":{"test":"echo \\"Error: no test specified\\" && exit 1"}}' > package.json && node /path/to/hooks/scripts/quality-gate.js 2>&1
```
Expected: No `[TEST]` output

**Step 3: Clean up**

```bash
rm -rf /tmp/qg-test-empty /tmp/qg-test-default
```
