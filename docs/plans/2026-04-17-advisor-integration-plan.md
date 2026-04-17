# Advisor Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add soft advisor checkpoints in four judgment-heavy skills and an onboarding hint system that prompts users to enable the advisor beta header, all in a single PR.

**Architecture:** Two independent change groups. Change 1 is four one-line text edits to existing SKILL.md files — no code, no tests, just targeted insertions. Change 2 creates two new JS scripts (`check-advisor.js` + `advisor-hint.js`) with tests, registers the hint script as a third SessionStart hook command, adds `advisor` sub-action to the settings skill, creates `docs/advisor.md`, updates README, schema-documents two new `.feature-flow.yml` keys, and appends a relationship section to the codex consultation design doc.

**Tech Stack:** Node.js 20+ stdlib only (`fs`, `path`, `os`, `process.platform`) — no npm dependencies. YAML parsed by regex (consistent with existing hooks). Tests follow the `version-check.test.js` / `verdict-gate.test.js` patterns using the built-in Node.js `assert`-free inline style with `child_process.execSync`.

---

## File Map

### Change 1 — SKILL.md insertions (no new files)
- Modify: `skills/design-verification/SKILL.md` (~line 280, before `### Blockers` section)
- Modify: `skills/verify-acceptance-criteria/SKILL.md` (~line 140, before `[MANUAL]` delegation note)
- Modify: `skills/consult-codex/SKILL.md` (~line 18, near `mode: stuck` description)
- Modify: `skills/consult-codex/SKILL.md` (~line 40, immediately before the Phase 2 `mcp__codex__codex` call block)

### Change 2 — Onboarding/settings hint
- Create: `skills/settings/scripts/advisor-headers.js` — single constant: `SUPPORTED_ADVISOR_HEADERS`
- Create: `skills/settings/scripts/check-advisor.js` — reads settings.json by platform, returns `{ sonnet, header_present, dismissed }`
- Create: `hooks/scripts/advisor-hint.js` — gate + banner output
- Create: `hooks/scripts/advisor-hint.test.js` — integration tests for `advisor-hint.js`
- Create: `hooks/scripts/check-advisor.test.js` — unit + integration tests for `check-advisor.js`
- Modify: `hooks/hooks.json` — add third command to existing SessionStart hooks array (lines 96–107)
- Modify: `skills/settings/SKILL.md` — add `advisor` to Step 3 category list and `5I` edit UI section
- Create: `docs/advisor.md` — full onboarding content
- Modify: `README.md` — one-paragraph pointer under "Optional Enhancements" section
- Modify: `.feature-flow.yml` (project config in repo root) — add `advisor.enabled` and `hints.advisor.dismissed` commented defaults
- Modify: `docs/plans/2026-04-14-codex-consultation.md` — append `## Relationship to advisor tool` section

---

## Change 1 — Soft Advisor Checkpoints in SKILL.md Files

### Task 1: Insert advisor hint into design-verification/SKILL.md

**Files:**
- Modify: `skills/design-verification/SKILL.md` (~line 280)

**Acceptance Criteria:**
- [ ] AC-1: `grep -F 'consider calling \`advisor()\` to sanity-check the blocker' skills/design-verification/SKILL.md` returns a match

- [ ] **Step 1: Locate the exact insertion point**

Read lines 275–285 of `skills/design-verification/SKILL.md`. Confirm the `### Blockers (FAIL — must fix before implementation)` heading is present. Note the exact line number.

Run:
```bash
grep -n 'Blockers (FAIL' skills/design-verification/SKILL.md
```
Expected: a line like `280:### Blockers (FAIL — must fix before implementation)`

- [ ] **Step 2: Insert the hint text immediately before the `### Blockers` heading**

Use the Edit tool. The `old_string` is the exact `### Blockers` heading line (with its full text). The `new_string` prepends the hint paragraph followed by a blank line before the heading.

```
old_string:
### Blockers (FAIL — must fix before implementation)

new_string:
Before declaring a blocker, consider calling `advisor()` to sanity-check the blocker interpretation. Advisor sees the full design doc and codebase context.

### Blockers (FAIL — must fix before implementation)
```

- [ ] **Step 3: Verify the grep AC passes**

Run:
```bash
grep -F 'consider calling `advisor()` to sanity-check the blocker' skills/design-verification/SKILL.md
```
Expected: the inserted line is returned.

- [ ] **Step 4: Commit**

```bash
git add skills/design-verification/SKILL.md
git commit -m "feat(advisor): add advisor hint before blockers in design-verification"
```

---

### Task 2: Insert advisor hint into verify-acceptance-criteria/SKILL.md

**Files:**
- Modify: `skills/verify-acceptance-criteria/SKILL.md` (~line 140)

**Acceptance Criteria:**
- [ ] AC-2: `grep -F 'call \`advisor()\` before manual interpretation' skills/verify-acceptance-criteria/SKILL.md` returns a match

- [ ] **Step 1: Locate the exact insertion point**

Run:
```bash
grep -n 'MANUAL.*CANNOT_VERIFY\|For criteria prefixed with \[MANUAL\]' skills/verify-acceptance-criteria/SKILL.md
```
Expected: a line near 140 reading `For criteria prefixed with [MANUAL], mark as CANNOT_VERIFY with reason "Requires manual testing".`

- [ ] **Step 2: Insert the hint text immediately before that line**

```
old_string:
For criteria prefixed with [MANUAL], mark as CANNOT_VERIFY with reason "Requires manual testing".

new_string:
If a criterion is ambiguous to evaluate mechanically, call `advisor()` before manual interpretation. Advisor can disambiguate what the criterion is actually asking for.

For criteria prefixed with [MANUAL], mark as CANNOT_VERIFY with reason "Requires manual testing".
```

- [ ] **Step 3: Verify the grep AC passes**

Run:
```bash
grep -F 'call `advisor()` before manual interpretation' skills/verify-acceptance-criteria/SKILL.md
```
Expected: the inserted line is returned.

- [ ] **Step 4: Commit**

```bash
git add skills/verify-acceptance-criteria/SKILL.md
git commit -m "feat(advisor): add advisor hint before manual delegation in verify-acceptance-criteria"
```

---

### Task 3: Insert mode: stuck advisor hint into consult-codex/SKILL.md

**Files:**
- Modify: `skills/consult-codex/SKILL.md` (~line 18)

**Acceptance Criteria:**
- [ ] AC-3: `grep -F 'consider calling \`advisor()\` first for a fast same-family check' skills/consult-codex/SKILL.md` returns a match

- [ ] **Step 1: Locate the exact insertion point**

Run:
```bash
grep -n 'mode: stuck\|deferred — follow-up plan' skills/consult-codex/SKILL.md
```
Expected: a line near 18 reading `- \`mode: stuck\` — user typed \`stuck:\` or a signal-collector hook emitted a stuck suggestion *(deferred — follow-up plan)*`

- [ ] **Step 2: Insert the hint text immediately after the `mode: stuck` line**

The hint goes on the line that follows `mode: stuck`, so old_string is the stuck-mode line and the blank line that comes before the next section heading.

```
old_string:
- `mode: stuck` — user typed `stuck:` or a signal-collector hook emitted a stuck suggestion *(deferred — follow-up plan)*

## Orchestration — follow these phases in order

new_string:
- `mode: stuck` — user typed `stuck:` or a signal-collector hook emitted a stuck suggestion *(deferred — follow-up plan)*

If invoking `mode: stuck`, consider calling `advisor()` first for a fast same-family check before spending a codex call.

## Orchestration — follow these phases in order
```

- [ ] **Step 3: Verify the grep AC passes**

Run:
```bash
grep -F 'consider calling `advisor()` first for a fast same-family check' skills/consult-codex/SKILL.md
```
Expected: the inserted line is returned.

- [ ] **Step 4: Commit**

```bash
git add skills/consult-codex/SKILL.md
git commit -m "feat(advisor): add advisor hint for mode: stuck in consult-codex"
```

---

### Task 4: Insert Phase 2 brief sanity-check hint into consult-codex/SKILL.md

**Files:**
- Modify: `skills/consult-codex/SKILL.md` (~line 40)

**Acceptance Criteria:**
- [ ] AC-4: `grep -F 'sanity-check the brief for missing context' skills/consult-codex/SKILL.md` returns a match

- [ ] **Step 1: Locate the exact insertion point**

Run:
```bash
grep -n 'Phase 2 — Call.*mcp__codex__codex\|Do NOT run a subprocess for this' skills/consult-codex/SKILL.md
```
Expected: lines around 40–42 showing the Phase 2 heading and the "Do NOT run" note.

- [ ] **Step 2: Insert the hint text immediately before the Phase 2 heading**

```
old_string:
### Phase 2 — Call `mcp__codex__codex` directly (your own tool call)

Do NOT run a subprocess for this.

new_string:
Optional: call `advisor()` to sanity-check the brief for missing context before invoking codex. Cheap same-family review prevents wasting a codex call on an ambiguous brief.

### Phase 2 — Call `mcp__codex__codex` directly (your own tool call)

Do NOT run a subprocess for this.
```

- [ ] **Step 3: Verify the grep AC passes**

Run:
```bash
grep -F 'sanity-check the brief for missing context' skills/consult-codex/SKILL.md
```
Expected: the inserted line is returned.

- [ ] **Step 4: Commit**

```bash
git add skills/consult-codex/SKILL.md
git commit -m "feat(advisor): add advisor brief sanity-check hint before Phase 2 in consult-codex"
```

---

## Change 2 — Onboarding / Settings Hint

### Task 5: Create advisor-headers.js (centralized beta header constant)

**Files:**
- Create: `skills/settings/scripts/advisor-headers.js`

**Acceptance Criteria:**
- [ ] AC-5 (partial): `node -e "const h = require('./skills/settings/scripts/advisor-headers.js'); console.log(Array.isArray(h.SUPPORTED_ADVISOR_HEADERS) && h.SUPPORTED_ADVISOR_HEADERS.includes('advisor-tool-2026-03-01'))"` prints `true`

- [ ] **Step 1: Create the directory if it does not exist**

Run:
```bash
ls skills/settings/
```
Expected: the `scripts/` subdirectory does or doesn't exist. Create it if absent:
```bash
mkdir -p skills/settings/scripts
```

- [ ] **Step 2: Write advisor-headers.js**

Create `/Users/weee/Dev/feature-flow/skills/settings/scripts/advisor-headers.js`:

```js
#!/usr/bin/env node
'use strict';

/**
 * Centralized list of Anthropic beta header values that indicate the advisor
 * feature is enabled. Update this array when Anthropic renames or GAs the
 * advisor beta. Include old values for one release cycle to avoid false-positive
 * hints for users still on an older beta header.
 *
 * Update site: this file only. All scripts that need the header list import from here.
 */
const SUPPORTED_ADVISOR_HEADERS = [
  'advisor-tool-2026-03-01',
];

module.exports = { SUPPORTED_ADVISOR_HEADERS };
```

- [ ] **Step 3: Verify**

Run:
```bash
node -e "const h = require('./skills/settings/scripts/advisor-headers.js'); console.log(Array.isArray(h.SUPPORTED_ADVISOR_HEADERS) && h.SUPPORTED_ADVISOR_HEADERS.includes('advisor-tool-2026-03-01'))"
```
Expected: `true`

- [ ] **Step 4: Commit**

```bash
git add skills/settings/scripts/advisor-headers.js
git commit -m "feat(advisor): add SUPPORTED_ADVISOR_HEADERS constant"
```

---

### Task 6: Create check-advisor.js with tests

**Files:**
- Create: `skills/settings/scripts/check-advisor.js`
- Create: `hooks/scripts/check-advisor.test.js`

**Acceptance Criteria:**
- [ ] AC-5 (completion): `skills/settings/scripts/check-advisor.js` exists and exports a function that returns `{ sonnet, header_present, dismissed }`
- [ ] `node hooks/scripts/check-advisor.test.js` exits 0 with all tests passing

**Quality Constraints:**
- Error handling: Script must NEVER throw or exit non-zero. Missing settings.json, unreadable file, invalid JSON → return `{ sonnet: null, header_present: false, dismissed: false }` with no stderr output. Silent failure is the correct behavior — this script runs at SessionStart and must not block session start.
- Types: Pure JS (not TS). Use explicit JSDoc `@typedef` for the return type.
- Function length: Extract platform-path resolution (macOS / Linux / Windows) into a `resolveSettingsPath()` helper. Keep the main `checkAdvisor()` function under 30 lines.
- Pattern: Follow `hooks/scripts/version-check.js` — CommonJS exports, no npm deps, stdlib only (`fs`, `path`, `os`, `process.platform`).

- [ ] **Step 1: Write the failing test file first**

Create `/Users/weee/Dev/feature-flow/hooks/scripts/check-advisor.test.js`:

```js
#!/usr/bin/env node
'use strict';

/**
 * Tests for skills/settings/scripts/check-advisor.js
 * Follows the version-check.test.js pattern: inline helpers, child_process for integration.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const CHECK_ADVISOR = path.resolve(__dirname, '../../skills/settings/scripts/check-advisor.js');

let passed = 0, failed = 0;

function assert(name, cond) {
  if (cond) { console.log(`  PASS: ${name}`); passed++; }
  else { console.error(`  FAIL: ${name}`); failed++; }
}

function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'check-advisor-test-')); }

function writeSettings(dir, content) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'settings.json'), content, 'utf8');
}

function writeYml(dir, content) {
  fs.writeFileSync(path.join(dir, '.feature-flow.yml'), content, 'utf8');
}

/**
 * Run check-advisor.js as a child process. Returns { exitCode, result }
 * where result is the parsed JSON stdout.
 */
function run(env = {}, cwd = null) {
  const mergedEnv = { ...process.env, ...env };
  if (env.HOME === '__UNSET__') delete mergedEnv.HOME;
  try {
    const stdout = execSync(`node "${CHECK_ADVISOR}"`, {
      env: mergedEnv,
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
    });
    let result;
    try { result = JSON.parse(stdout); } catch (_) { result = null; }
    return { exitCode: 0, result };
  } catch (e) {
    let result;
    try { result = JSON.parse(e.stdout || '{}'); } catch (_) { result = null; }
    return { exitCode: e.status || 1, result };
  }
}

// ─── Unit tests: exported helpers ────────────────────────────────────────────

// We can't directly import without running main(), so these are integration-
// level: run the script and inspect the JSON output.

console.log('\n=== Integration: settings.json absent ===');

assert('returns header_present: false when settings.json does not exist', (() => {
  const tmp = mkTmp();
  // No settings.json written
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.header_present === false;
})());

assert('returns dismissed: false when .feature-flow.yml absent', (() => {
  const tmp = mkTmp();
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.dismissed === false;
})());

console.log('\n=== Integration: header detection ===');

assert('header_present: true when advisor-tool-2026-03-01 in anthropic-beta string', (() => {
  const tmp = mkTmp();
  const settingsDir = path.join(tmp, '.claude');
  writeSettings(settingsDir, JSON.stringify({
    env: { ANTHROPIC_BETA: 'advisor-tool-2026-03-01,other-thing' }
  }));
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.header_present === true;
})());

assert('header_present: false when anthropic-beta string lacks advisor header', (() => {
  const tmp = mkTmp();
  const settingsDir = path.join(tmp, '.claude');
  writeSettings(settingsDir, JSON.stringify({
    env: { ANTHROPIC_BETA: 'some-other-beta' }
  }));
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.header_present === false;
})());

assert('header_present: true when beta header key is uppercase ANTHROPIC_BETA', (() => {
  const tmp = mkTmp();
  const settingsDir = path.join(tmp, '.claude');
  writeSettings(settingsDir, JSON.stringify({
    env: { ANTHROPIC_BETA: 'advisor-tool-2026-03-01' }
  }));
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.header_present === true;
})());

assert('header_present: false when settings.json has empty env block', (() => {
  const tmp = mkTmp();
  const settingsDir = path.join(tmp, '.claude');
  writeSettings(settingsDir, JSON.stringify({ env: {} }));
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.header_present === false;
})());

assert('header_present: false when settings.json has no env key', (() => {
  const tmp = mkTmp();
  const settingsDir = path.join(tmp, '.claude');
  writeSettings(settingsDir, JSON.stringify({ otherKey: true }));
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.header_present === false;
})());

console.log('\n=== Integration: dismissed flag ===');

assert('dismissed: true when .feature-flow.yml has hints.advisor.dismissed: true', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'hints:\n  advisor:\n    dismissed: true\n');
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.dismissed === true;
})());

assert('dismissed: false when .feature-flow.yml has hints.advisor.dismissed: false', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'hints:\n  advisor:\n    dismissed: false\n');
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.dismissed === false;
})());

assert('dismissed: false when hints.advisor block is absent', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'plugin_version: 1.0.0\n');
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.dismissed === false;
})());

console.log('\n=== Integration: sonnet field ===');

assert('sonnet: false when CLAUDE_MODEL env unset (fail-open: include hint)', (() => {
  const tmp = mkTmp();
  const mergedEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'CLAUDE_MODEL'));
  try {
    const stdout = execSync(`node "${CHECK_ADVISOR}"`, {
      env: mergedEnv, cwd: tmp, encoding: 'utf8'
    });
    const r = JSON.parse(stdout);
    fs.rmSync(tmp, { recursive: true });
    // When model undetectable, sonnet should be null or true (fail-open means show hint)
    return r !== null && (r.sonnet === null || r.sonnet === true);
  } catch (_) {
    fs.rmSync(tmp, { recursive: true });
    return false;
  }
})());

assert('exit code is always 0', (() => {
  const tmp = mkTmp();
  const { exitCode } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return exitCode === 0;
})());

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run the test to confirm it fails (module not found)**

Run:
```bash
node hooks/scripts/check-advisor.test.js
```
Expected: Error — `Cannot find module '…/check-advisor.js'`

- [ ] **Step 3: Write check-advisor.js**

Create `/Users/weee/Dev/feature-flow/skills/settings/scripts/check-advisor.js`:

```js
#!/usr/bin/env node
'use strict';

/**
 * check-advisor.js
 *
 * Reads the user's Claude Code settings.json (OS-specific path) and the local
 * .feature-flow.yml to determine advisor configuration state.
 *
 * Outputs a single JSON object to stdout:
 *   { sonnet: boolean|null, header_present: boolean, dismissed: boolean }
 *
 * Fields:
 *   sonnet        — true if CLAUDE_MODEL env suggests Sonnet 4.x; null if undetectable
 *                   (fail-open: treat null as eligible for hint)
 *   header_present — true if any SUPPORTED_ADVISOR_HEADERS entry found in ANTHROPIC_BETA
 *   dismissed     — true if hints.advisor.dismissed: true in .feature-flow.yml
 *
 * Always exits 0 — errors are logged to stderr and produce safe defaults.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { SUPPORTED_ADVISOR_HEADERS } = require('./advisor-headers.js');

// ─── Platform-specific settings.json path ────────────────────────────────────

function getSettingsPath() {
  const platform = process.platform;
  const home = os.homedir();

  if (platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appdata, 'claude', 'settings.json');
  }
  if (platform === 'linux') {
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    const xdgPath = path.join(xdgConfig, 'claude', 'settings.json');
    if (fs.existsSync(xdgPath)) return xdgPath;
  }
  // macOS and linux fallback
  return path.join(home, '.claude', 'settings.json');
}

// ─── Read settings.json ───────────────────────────────────────────────────────

function readSettings() {
  const p = getSettingsPath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

// ─── Detect advisor header in settings.json ───────────────────────────────────

function detectHeaderPresent(settings) {
  if (!settings || typeof settings !== 'object') return false;
  const env = settings.env || {};
  // ANTHROPIC_BETA may be a comma-separated string of header values
  const betaValue = env.ANTHROPIC_BETA || env.anthropic_beta || '';
  if (typeof betaValue !== 'string' || !betaValue) return false;
  const parts = betaValue.split(',').map((s) => s.trim());
  return SUPPORTED_ADVISOR_HEADERS.some((h) => parts.includes(h));
}

// ─── Read .feature-flow.yml for dismissed flag ────────────────────────────────

function readDismissed() {
  const ymlPath = path.join(process.cwd(), '.feature-flow.yml');
  try {
    const raw = fs.readFileSync(ymlPath, 'utf8');
    // Parse hints.advisor.dismissed: true without a full YAML parser
    // Match:  dismissed: true   anywhere after "advisor:" section
    const advisorBlock = raw.match(/hints:\s*\n(?:[ \t]+.*\n)*?[ \t]+advisor:\s*\n((?:[ \t]+.*\n)*)/);
    if (!advisorBlock) return false;
    const block = advisorBlock[1];
    return /dismissed:\s*true/.test(block);
  } catch (_) {
    return false;
  }
}

// ─── Detect model (fail-open) ─────────────────────────────────────────────────

function detectSonnet() {
  const model = process.env.CLAUDE_MODEL || '';
  if (!model) return null; // undetectable — fail-open (treat as eligible)
  return /sonnet/i.test(model);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const settings = readSettings();
  const result = {
    sonnet: detectSonnet(),
    header_present: detectHeaderPresent(settings),
    dismissed: readDismissed(),
  };
  process.stdout.write(JSON.stringify(result) + '\n');
}

try {
  main();
} catch (e) {
  const detail = e instanceof Error ? e.message : String(e);
  process.stderr.write(`[feature-flow] check-advisor error: ${detail}\n`);
  // Fail-open: output safe defaults
  process.stdout.write(JSON.stringify({ sonnet: null, header_present: false, dismissed: false }) + '\n');
}
process.exit(0);
```

- [ ] **Step 4: Run the tests**

Run:
```bash
node hooks/scripts/check-advisor.test.js
```
Expected: `=== Results: 12 passed, 0 failed ===` (all tests pass)

- [ ] **Step 5: Commit**

```bash
git add skills/settings/scripts/check-advisor.js hooks/scripts/check-advisor.test.js
git commit -m "feat(advisor): add check-advisor.js with platform-aware settings.json detection"
```

---

### Task 7: Create advisor-hint.js with tests

**Files:**
- Create: `hooks/scripts/advisor-hint.js`
- Create: `hooks/scripts/advisor-hint.test.js`

**Acceptance Criteria:**
- [ ] AC-6 (partial): `hooks/scripts/advisor-hint.js` exists and contains `shouldShowAdvisorHint`
- [ ] `node hooks/scripts/advisor-hint.test.js` exits 0 with all tests passing

**Quality Constraints:**
- Error handling: Script must NEVER throw, exit non-zero, or emit stderr. Any failure mode (missing config, unreadable rate-limit file, invalid JSON, missing HOME) → silently suppress the hint. SessionStart hooks must not block session start; user-visible errors here would make feature-flow's own onboarding a regression.
- Types: Pure JS. JSDoc `@typedef` for `shouldShowAdvisorHint()` return (`boolean`) and for `readHintState()` return.
- Function length: Each gate condition (model check, header check, dismissed check, enabled check, rate-limit check) must be its own named function. Main `shouldShowAdvisorHint()` composes them. Keep each condition under 15 lines.
- Pattern: Mirror `hooks/scripts/version-check.js` (CommonJS, stdlib only). Rate-limit state file path uses `os.homedir()` + `path.join('~/.feature-flow/hint-state.json')` — resolve via `path.join(os.homedir(), '.feature-flow', 'hint-state.json')`.
- Test hermeticity: Tests MUST use a tmpdir + env-var override for the rate-limit state file (follow `verdict-gate.test.js` pattern of passing `FEATURE_FLOW_*` env vars to isolate runs). Do not pollute `~/.feature-flow/`.

- [ ] **Step 1: Write the failing test file**

Create `/Users/weee/Dev/feature-flow/hooks/scripts/advisor-hint.test.js`:

```js
#!/usr/bin/env node
'use strict';

/**
 * Tests for hooks/scripts/advisor-hint.js
 *
 * Tests the shouldShowAdvisorHint() gate and banner output.
 * Follows version-check.test.js / verdict-gate.test.js patterns.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, 'advisor-hint.js');

let passed = 0, failed = 0;

function assert(name, cond) {
  if (cond) { console.log(`  PASS: ${name}`); passed++; }
  else { console.error(`  FAIL: ${name}`); failed++; }
}

function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'advisor-hint-test-')); }

function writeYml(dir, content) {
  fs.writeFileSync(path.join(dir, '.feature-flow.yml'), content, 'utf8');
}

function writeHintState(homeDir, content) {
  const stateDir = path.join(homeDir, '.feature-flow');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'hint-state.json'), JSON.stringify(content), 'utf8');
}

function writeSettings(homeDir, content) {
  const dir = path.join(homeDir, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(content), 'utf8');
}

/**
 * Run advisor-hint.js as a subprocess in the given cwd with overridden HOME.
 * Returns { exitCode, stdout, stderr }.
 */
function run(env = {}, cwd = null) {
  const mergedEnv = { ...process.env, ...env };
  // Remove CLAUDE_PLUGIN_ROOT if set to sentinel
  if (env.CLAUDE_PLUGIN_ROOT === '__UNSET__') delete mergedEnv.CLAUDE_PLUGIN_ROOT;
  try {
    const stdout = execSync(`node "${SCRIPT}"`, {
      env: mergedEnv,
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout };
  } catch (e) {
    return { exitCode: e.status || 1, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}

// Today's date in YYYY-MM-DD format
function today() {
  return new Date().toISOString().slice(0, 10);
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ─── Happy path: all conditions met → hint shown ───────────────────────────────

console.log('\n=== Happy path: hint shown ===');

assert('shows hint when no header, not dismissed, not disabled, no rate-limit entry', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.includes('[feature-flow]') && stdout.includes('advisor');
})());

// ─── Gate conditions: each must suppress hint independently ───────────────────

console.log('\n=== Gate conditions: each suppresses hint ===');

assert('no hint when advisor header is present in settings.json', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  writeSettings(home, { env: { ANTHROPIC_BETA: 'advisor-tool-2026-03-01' } });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return !stdout.includes('advisor') || stdout.trim() === '';
})());

assert('no hint when hints.advisor.dismissed: true in .feature-flow.yml', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'hints:\n  advisor:\n    dismissed: true\n');
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.trim() === '';
})());

assert('no hint when advisor.enabled: false in .feature-flow.yml', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: false\n');
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.trim() === '';
})());

assert('no hint when rate-limiter shows hint already shown today', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  writeHintState(home, { last_advisor_hint: today() });
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.trim() === '';
})());

assert('no hint when .feature-flow.yml is absent (not a feature-flow project)', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  // No .feature-flow.yml
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.trim() === '';
})());

// ─── Rate limiter: shows hint when last entry is yesterday ────────────────────

console.log('\n=== Rate limiter: shows hint after 1 day ===');

assert('shows hint when last_advisor_hint was yesterday', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  writeHintState(home, { last_advisor_hint: yesterday() });
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.includes('[feature-flow]');
})());

// ─── Rate limiter: hint-state.json updated after showing ──────────────────────

console.log('\n=== Rate limiter: state written after hint ===');

assert('hint-state.json last_advisor_hint set to today after showing hint', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  run({ HOME: home }, tmp);
  const stateFile = path.join(home, '.feature-flow', 'hint-state.json');
  let updated;
  try { updated = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (_) { updated = null; }
  fs.rmSync(tmp, { recursive: true });
  return updated !== null && updated.last_advisor_hint === today();
})());

// ─── Exit code is always 0 ────────────────────────────────────────────────────

console.log('\n=== Exit code ===');

assert('exits 0 in all conditions', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  const { exitCode } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return exitCode === 0;
})());

// ─── Banner content ───────────────────────────────────────────────────────────

console.log('\n=== Banner content ===');

assert('banner line mentions feature-flow:settings advisor', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.includes('feature-flow:settings advisor');
})());

assert('banner line mentions dismiss option', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.includes('dismiss');
})());

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run the test to confirm failure**

Run:
```bash
node hooks/scripts/advisor-hint.test.js
```
Expected: Error — `Cannot find module '…/advisor-hint.js'`

- [ ] **Step 3: Write advisor-hint.js**

Create `/Users/weee/Dev/feature-flow/hooks/scripts/advisor-hint.js`:

```js
#!/usr/bin/env node
'use strict';

/**
 * advisor-hint.js — SessionStart hook
 *
 * Runs on every session start. Checks five gate conditions; if all pass,
 * writes one banner line to stdout and updates the daily rate-limiter.
 *
 * Gate conditions (ALL must be true to show hint):
 *   1. .feature-flow.yml exists in cwd (this is a feature-flow project)
 *   2. advisor.enabled is not explicitly false in .feature-flow.yml
 *   3. No SUPPORTED_ADVISOR_HEADERS entry found in settings.json ANTHROPIC_BETA
 *   4. hints.advisor.dismissed is not true in .feature-flow.yml
 *   5. hint was not already shown today (rate limiter: once per calendar day)
 *
 * Model check: CLAUDE_MODEL env is checked but result is fail-open — if the
 * model cannot be detected, the hint is still eligible to show (condition passes).
 *
 * Always exits 0 — a hook failure must never block a session start.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Resolve CLAUDE_PLUGIN_ROOT for the advisor-headers import
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '../..');
const { SUPPORTED_ADVISOR_HEADERS } = require(
  path.join(pluginRoot, 'skills/settings/scripts/advisor-headers.js')
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readYml() {
  const p = path.join(process.cwd(), '.feature-flow.yml');
  try { return fs.readFileSync(p, 'utf8'); }
  catch (_) { return null; }
}

function isAdvisorEnabled(ymlContent) {
  if (!ymlContent) return false; // No config → not a feature-flow project
  // advisor.enabled: false → disabled
  if (/^advisor:\s*\n(?:[ \t]+.*\n)*?[ \t]+enabled:\s*false/m.test(ymlContent)) return false;
  return true;
}

function isDismissed(ymlContent) {
  if (!ymlContent) return false;
  const advisorBlock = ymlContent.match(/hints:\s*\n(?:[ \t]+.*\n)*?[ \t]+advisor:\s*\n((?:[ \t]+.*\n)*)/);
  if (!advisorBlock) return false;
  return /dismissed:\s*true/.test(advisorBlock[1]);
}

function getSettingsPath() {
  const platform = process.platform;
  const home = os.homedir();
  if (platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appdata, 'claude', 'settings.json');
  }
  if (platform === 'linux') {
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    const xdgPath = path.join(xdgConfig, 'claude', 'settings.json');
    if (fs.existsSync(xdgPath)) return xdgPath;
  }
  return path.join(home, '.claude', 'settings.json');
}

function isHeaderPresent() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf8');
    const settings = JSON.parse(raw);
    const env = (settings && settings.env) || {};
    const betaValue = env.ANTHROPIC_BETA || env.anthropic_beta || '';
    if (typeof betaValue !== 'string' || !betaValue) return false;
    const parts = betaValue.split(',').map((s) => s.trim());
    return SUPPORTED_ADVISOR_HEADERS.some((h) => parts.includes(h));
  } catch (_) {
    return false;
  }
}

function getHintStatePath() {
  return path.join(os.homedir(), '.feature-flow', 'hint-state.json');
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function wasShownToday() {
  try {
    const raw = fs.readFileSync(getHintStatePath(), 'utf8');
    const state = JSON.parse(raw);
    return state.last_advisor_hint === todayStr();
  } catch (_) {
    return false;
  }
}

function markShownToday() {
  const p = getHintStatePath();
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const existing = (() => {
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
      catch (_) { return {}; }
    })();
    existing.last_advisor_hint = todayStr();
    fs.writeFileSync(p, JSON.stringify(existing), 'utf8');
  } catch (_) {
    // Non-fatal — state update failure should not block the session
  }
}

// ─── Main gate function ───────────────────────────────────────────────────────

function shouldShowAdvisorHint() {
  const yml = readYml();
  if (!yml) return false;                   // Condition 1: feature-flow project
  if (!isAdvisorEnabled(yml)) return false; // Condition 2: not explicitly disabled
  if (isHeaderPresent()) return false;      // Condition 3: header already configured
  if (isDismissed(yml)) return false;       // Condition 4: permanently dismissed
  if (wasShownToday()) return false;        // Condition 5: daily rate-limiter
  return true;
}

module.exports = { shouldShowAdvisorHint };

// ─── Script entrypoint ────────────────────────────────────────────────────────

function main() {
  if (!shouldShowAdvisorHint()) return;

  console.log(
    '[feature-flow] Tip: enable the advisor beta header for a quality boost on complex tasks. ' +
    'Run `feature-flow:settings advisor` for details, or ' +
    '`feature-flow:settings advisor dismiss` to stop this tip.'
  );
  markShownToday();
}

try {
  main();
} catch (e) {
  const detail = e instanceof Error ? e.message : String(e);
  process.stderr.write(`[feature-flow] advisor-hint hook error: ${detail}\n`);
}
// Always exit 0 — this hook is advisory only.
process.exit(0);
```

- [ ] **Step 4: Run the tests**

Run:
```bash
node hooks/scripts/advisor-hint.test.js
```
Expected: `=== Results: 11 passed, 0 failed ===`

- [ ] **Step 5: Commit**

```bash
git add hooks/scripts/advisor-hint.js hooks/scripts/advisor-hint.test.js
git commit -m "feat(advisor): add advisor-hint.js SessionStart hook with rate-limiter and gate logic"
```

---

### Task 8: Register advisor-hint.js in hooks/hooks.json

**Files:**
- Modify: `hooks/hooks.json` lines 95–107 (SessionStart hooks array)

**Acceptance Criteria:**
- [ ] AC-6 (completion): `hooks/hooks.json` SessionStart hooks array contains a command entry referencing `hooks/scripts/advisor-hint.js`; no new hook event types registered beyond existing `SessionStart`
- [ ] `node -e "const h = require('./hooks/hooks.json'); const ss = h.hooks.SessionStart; console.log(ss.length === 1 && ss[0].hooks.length === 3 && ss[0].hooks[2].command.includes('advisor-hint.js'))"` prints `true`

- [ ] **Step 1: Read the current SessionStart block**

Read `hooks/hooks.json` lines 95–107 to confirm current structure. The SessionStart block looks like:
```json
"SessionStart": [
  {
    "hooks": [
      { "type": "command", "command": "if [ -f .feature-flow.yml ]; then echo '...' ... fi" },
      { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/version-check.js" }
    ]
  }
]
```

- [ ] **Step 2: Add advisor-hint.js as the third command in the existing hooks array**

Use the Edit tool. The `old_string` is the closing of the second command and the array closing:

```
old_string:
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/version-check.js"
          }
        ]
      }
    ],

new_string:
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/version-check.js"
          },
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/advisor-hint.js"
          }
        ]
      }
    ],
```

- [ ] **Step 3: Verify the JSON is valid and the AC check passes**

Run:
```bash
node -e "const h = require('./hooks/hooks.json'); const ss = h.hooks.SessionStart; console.log(ss.length === 1 && ss[0].hooks.length === 3 && ss[0].hooks[2].command.includes('advisor-hint.js'))"
```
Expected: `true`

Also verify JSON syntax:
```bash
node -e "require('./hooks/hooks.json'); console.log('valid')"
```
Expected: `valid`

- [ ] **Step 4: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat(advisor): register advisor-hint.js as third SessionStart hook command"
```

---

### Task 9: Add advisor sub-action to settings/SKILL.md

**Files:**
- Modify: `skills/settings/SKILL.md`

**Acceptance Criteria:**
- [ ] AC-5 (completion): `grep -c 'advisor' skills/settings/SKILL.md` returns ≥ `1`

The settings skill needs to handle three invocation forms:
- `feature-flow:settings advisor` → print how-to + settings.json snippet
- `feature-flow:settings advisor dismiss` → set `hints.advisor.dismissed: true` in `.feature-flow.yml`

- [ ] **Step 1: Add advisor args handling at the top of the SKILL.md Process section**

The settings skill currently has no argument-detection step — it goes straight to Step 1 (Load Configuration). Add a pre-flight step before Step 1 that handles `advisor` args.

Find the exact text:
```bash
grep -n 'Step 1: Load Configuration' skills/settings/SKILL.md
```

Insert the following **before** "## Process":

```
old_string:
## Process

### Step 1: Load Configuration

new_string:
## Advisor Sub-Actions

If invoked with args `advisor` or `advisor dismiss`, handle as a direct command — do not show the dashboard.

**`feature-flow:settings advisor`** (no further args, or args == `advisor`):

Print the following block verbatim (substituting actual paths):

```
Advisor Beta Header — feature-flow integration

The Claude advisor tool (beta) provides automatic per-turn second-opinion checks on
complex tasks. To enable it, add the beta header to your Claude Code settings.json.

Settings file location:
  macOS:  ~/.claude/settings.json
  Linux:  ${XDG_CONFIG_HOME:-~/.config}/claude/settings.json
  Windows: %APPDATA%\claude\settings.json

Add this to your settings.json under the "env" key:
  {
    "env": {
      "ANTHROPIC_BETA": "advisor-tool-2026-03-01"
    }
  }

If you already have other ANTHROPIC_BETA values, append with a comma:
  "ANTHROPIC_BETA": "other-header,advisor-tool-2026-03-01"

For full details, see docs/advisor.md in the feature-flow plugin source.

To stop the daily tip: feature-flow:settings advisor dismiss
```

Exit the skill after printing. Do not show the settings dashboard.

---

**`feature-flow:settings advisor dismiss`**:

1. Read `.feature-flow.yml`. If it does not exist, create it with default content (same as Step 1 default).
2. Set `hints.advisor.dismissed: true` in the YAML. If a `hints:` block exists, add `advisor: {dismissed: true}` under it. If the block does not exist, append:
   ```yaml
   hints:
     advisor:
       dismissed: true
   ```
3. Write the updated file using the Edit tool (or Write tool if Edit fails).
4. Print: `"Advisor hint dismissed. The daily tip will no longer appear. Re-enable with: feature-flow:settings advisor (then re-add the header)."`

Exit the skill after the confirmation. Do not show the settings dashboard.

---

## Process

### Step 1: Load Configuration
```

- [ ] **Step 2: Verify the grep AC passes**

Run:
```bash
grep -c 'advisor' skills/settings/SKILL.md
```
Expected: a number ≥ 1

- [ ] **Step 3: Commit**

```bash
git add skills/settings/SKILL.md
git commit -m "feat(advisor): add advisor sub-action to settings skill (how-to + dismiss)"
```

---

### Task 10: Create docs/advisor.md

**Files:**
- Create: `docs/advisor.md`

**Acceptance Criteria:**
- [ ] AC-7: `docs/advisor.md` exists and contains sections for "What it is", "How to enable", "When it's worth it", "Relationship to codex-consultation"

- [ ] **Step 1: Create docs/advisor.md**

Create `/Users/weee/Dev/feature-flow/docs/advisor.md`:

```markdown
# Advisor Tool — feature-flow Integration

## What it is

The Claude advisor tool (currently in beta as `advisor-tool-2026-03-01`) is an Anthropic-provided capability that gives Claude access to a second AI opinion within the same conversation. Unlike codex-consultation — which makes an explicit external MCP call with a logged verdict — the advisor is automatic and per-turn: Claude can call it whenever it judges that a second perspective is useful, without any lifecycle overhead.

Within feature-flow, advisor is wired as a soft complement to codex-consultation:
- **Advisor** = automatic, per-turn, no audit log, discretionary. Good for quick sanity checks ("am I interpreting this correctly?") and gut-check moments.
- **Codex** = explicit lifecycle checkpoint, durable log, PR-embedded verdict. Good for proactive reviews (design, plan, code) and reactive stuck recovery.

They coexist. Codex is still the scripted gate; advisor is the "check with a colleague" button that Claude can press at any moment.

## How to enable

The advisor feature requires a beta header in your Claude Code `settings.json`.

**Find your settings file:**
- macOS: `~/.claude/settings.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/claude/settings.json`, falling back to `~/.claude/settings.json`
- Windows: `%APPDATA%\claude\settings.json`

**Add the beta header:**

```json
{
  "env": {
    "ANTHROPIC_BETA": "advisor-tool-2026-03-01"
  }
}
```

If you already have other `ANTHROPIC_BETA` values, append with a comma:

```json
{
  "env": {
    "ANTHROPIC_BETA": "other-existing-header,advisor-tool-2026-03-01"
  }
}
```

**Verify it's working:** The feature-flow SessionStart tip will disappear after the header is detected.

**Quick setup via settings skill:**
```
feature-flow:settings advisor
```

## When it's worth it

Advisor adds the most value at **judgment-heavy, one-time decisions** in a feature session:

- Before declaring a design verification blocker — especially when the interpretation is ambiguous
- When a `verify-acceptance-criteria` criterion is unclear about what exactly it's checking
- Before spending a codex call on `mode: stuck` — advisor is same-family and faster
- Before constructing the codex brief — a quick advisor sanity-check can prevent sending an incomplete brief to codex

Advisor adds little value for mechanical tasks (writing tests, refactoring per a clear spec, running commands). feature-flow's SKILL.md hints point to advisor at exactly the moments where it pays off.

**Access note:** The advisor beta is access-gated via Anthropic account teams. If you're on a plan that doesn't include advisor access, the beta header has no effect — Claude proceeds as usual with no error. feature-flow's behavior is identical in both cases; the hints are non-blocking.

## Relationship to codex-consultation

feature-flow has two AI consultation mechanisms:

| | Advisor | Codex-consultation |
|---|---|---|
| **Invocation** | Automatic (Claude decides per-turn) | Explicit lifecycle checkpoint |
| **Scope** | Same-family check (same model family) | External MCP call (different model) |
| **Cost** | Advisor-model rate | Codex API rate |
| **Audit log** | None | Logged to `.feature-flow/consultations.json`, embedded in PR body |
| **Verdict required?** | No | Yes (strict: required before continuing; soft: recommended) |
| **Use case** | Quick judgment sanity-check | Proactive review (design/plan/code) + stuck recovery |

The two tools are **additive, not competitive**. The recommended flow for a high-uncertainty judgment call:
1. Call `advisor()` for a fast same-family check
2. If still uncertain after advisor, invoke `feature-flow:consult-codex` for a full external review with audit log

See `docs/plans/2026-04-14-codex-consultation.md` for the full codex-consultation design.
```

- [ ] **Step 2: Verify the AC**

Run:
```bash
grep -l 'What it is\|How to enable\|When.*worth it\|Relationship to codex' docs/advisor.md
```
Expected: `docs/advisor.md`

Or more precisely:
```bash
grep -c 'What it is\|How to enable\|worth it\|Relationship to codex' docs/advisor.md
```
Expected: ≥ 4

- [ ] **Step 3: Commit**

```bash
git add docs/advisor.md
git commit -m "docs(advisor): add docs/advisor.md with setup, when to use, and codex relationship"
```

---

### Task 11: Update README.md with advisor pointer

**Files:**
- Modify: `README.md`

**Acceptance Criteria:**
- [ ] AC-8: `README.md` contains a pointer line referencing `docs/advisor.md`

- [ ] **Step 1: Find where to insert the pointer**

Run:
```bash
grep -n 'Optional\|Recommended\|enhancements\|plugins add' README.md | head -20
```
Look for a natural home. The "Recommended" plugins section in `## Requirements` is a good candidate. If no "Optional Enhancements" section exists, add one before `## How It Works`.

- [ ] **Step 2: Add a one-paragraph pointer**

Find the `## How It Works with Superpowers and Context7` heading (or similar) and insert the Optional Enhancements section before it.

```
old_string:
## How It Works with Superpowers and Context7

new_string:
## Optional Enhancements

### Advisor Tool (beta)

The Claude advisor tool provides automatic per-turn second-opinion checks. When enabled, feature-flow surfaces advisor hints at judgment-heavy moments (design verification, AC evaluation, codex consultation). Requires an Anthropic beta header — see [`docs/advisor.md`](docs/advisor.md) for setup, or run `feature-flow:settings advisor` for a guided walkthrough.

## How It Works with Superpowers and Context7
```

- [ ] **Step 3: Verify the AC**

Run:
```bash
grep -F 'docs/advisor.md' README.md
```
Expected: the inserted line is returned.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(advisor): add Optional Enhancements / Advisor Tool section to README"
```

---

### Task 12: Document advisor config keys in .feature-flow.yml schema

**Files:**
- Modify: `.feature-flow.yml` (project config at repo root)

**Acceptance Criteria:**
- [ ] AC-9: `.feature-flow.yml` schema documents `advisor.enabled` and `hints.advisor.dismissed`; no other advisor keys present
- [ ] `grep -c 'advisor.enabled\|hints.advisor.dismissed\|advisor:\n\|hints:' .feature-flow.yml` returns ≥ 1 (the keys appear in the file)

The `.feature-flow.yml` is the living example of the schema. Adding commented defaults there both documents the keys and tests that the default-merge loader doesn't break.

- [ ] **Step 1: Read the end of .feature-flow.yml**

Run:
```bash
tail -30 .feature-flow.yml
```
Find a natural place to insert the advisor section (after the codex block comment is appropriate).

- [ ] **Step 2: Append the commented advisor defaults**

Find a location near the codex comment block and append after it:

```
old_string:
# See docs/plans/2026-04-14-codex-consultation.md for the full design.

new_string:
# See docs/plans/2026-04-14-codex-consultation.md for the full design.

# Optional: advisor tool integration
# Controls the SessionStart hint that prompts to enable the advisor beta header.
# advisor.enabled: master kill switch (true = show hints, false = never show)
# hints.advisor.dismissed: permanent dismiss flag (true = never show again)
# See docs/advisor.md for setup instructions.
#
# advisor:
#   enabled: true
# hints:
#   advisor:
#     dismissed: false
```

- [ ] **Step 3: Verify the AC**

Run:
```bash
grep 'advisor.enabled\|hints.advisor.dismissed\|advisor:\|# advisor:' .feature-flow.yml | head -10
```
Expected: lines showing the commented defaults.

Also verify no unexpected advisor keys exist:
```bash
grep '^advisor:' .feature-flow.yml
```
Expected: no output (keys are still commented; they are documentation until the user explicitly enables them).

- [ ] **Step 4: Commit**

```bash
git add .feature-flow.yml
git commit -m "docs(advisor): add advisor.enabled and hints.advisor.dismissed commented defaults to .feature-flow.yml"
```

---

### Task 13: Append Relationship to advisor tool section to codex-consultation doc

**Files:**
- Modify: `docs/plans/2026-04-14-codex-consultation.md`

**Acceptance Criteria:**
- [ ] AC-11: `docs/plans/2026-04-14-codex-consultation.md` contains a `## Relationship to advisor tool` section

- [ ] **Step 1: Read the end of the codex-consultation doc**

Run:
```bash
tail -20 docs/plans/2026-04-14-codex-consultation.md
```
Note the last section heading to find the correct append location.

- [ ] **Step 2: Append the relationship section**

Use the Edit tool. Find the last line of the file (e.g., `## Out of Scope` or the last acceptance criteria block) and append after it.

Append this content at the end of `docs/plans/2026-04-14-codex-consultation.md`:

```markdown

## Relationship to advisor tool

The advisor tool (`advisor-tool-2026-03-01` beta) is a separate, complementary Anthropic capability introduced after this design was written. See issue #236 and `docs/advisor.md` for the full design.

**How they differ:**

| | Codex-consultation | Advisor |
|---|---|---|
| **Invocation** | Explicit lifecycle checkpoint (skills invoke `consult.js`) | Automatic per-turn (Claude invokes at discretion) |
| **External call** | Yes — `mcp__codex__codex` (separate model/service) | No — same-family sub-inference |
| **Audit log** | Yes — `.feature-flow/consultations.json` + PR body | No |
| **Verdict required** | Yes (strict: blocking; soft: recommended) | No |
| **Budget tracking** | Yes — `interactive_cap`, `yolo_cap`, escape hatch | No |
| **Best for** | Proactive reviews, stuck recovery with a durable record | Quick judgment sanity checks, pre-codex brief validation |

**Interaction pattern:** advisor is suggested at the two codex decision points where a quick same-family check adds value before committing to a full codex call:
- Before declaring `mode: stuck` (fast same-family check first)
- Before constructing the codex brief (sanity-check brief completeness)

These soft hints are added to `skills/consult-codex/SKILL.md` as part of issue #236. Codex remains the scripted gate; advisor is discretionary.
```

- [ ] **Step 3: Verify the AC**

Run:
```bash
grep -F '## Relationship to advisor tool' docs/plans/2026-04-14-codex-consultation.md
```
Expected: the heading line is returned.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-04-14-codex-consultation.md
git commit -m "docs(advisor): append Relationship to advisor tool section to codex-consultation design doc"
```

---

### Task 14: End-to-end integration test for dismiss flow (AC-10)

**Files:**
- No new files (uses existing test infrastructure)

**Acceptance Criteria:**
- [ ] AC-10: Running `feature-flow:settings advisor dismiss` in a test project writes `hints.advisor.dismissed: true` and the next SessionStart invocation suppresses the hint line

This task verifies the dismiss flow end-to-end by (a) scripting the settings skill dismiss action mechanically, and (b) running `advisor-hint.js` after to confirm no output.

The `settings` skill is a Claude-orchestrated SKILL.md, not a standalone script. The dismiss action writes to `.feature-flow.yml`. We test the hook-level behavior (step b) programmatically via the existing test infrastructure.

- [ ] **Step 1: Verify the settings dismiss behavior manually in a tmp dir**

Run this sequence:
```bash
TMP=$(mktemp -d)
echo 'plugin_version: 1.0.0
advisor:
  enabled: true
' > $TMP/.feature-flow.yml

# Simulate the dismiss action: set hints.advisor.dismissed: true
cat >> $TMP/.feature-flow.yml << 'EOF'
hints:
  advisor:
    dismissed: true
EOF

# Now run advisor-hint.js from that directory
HOME=$TMP node hooks/scripts/advisor-hint.js
```
Expected: no output (empty stdout). Exit code 0.

- [ ] **Step 2: Run the full test suite to confirm nothing regressed**

Run:
```bash
node hooks/scripts/advisor-hint.test.js && node hooks/scripts/check-advisor.test.js && node hooks/scripts/version-check.test.js
```
Expected: all suites pass with 0 failures.

- [ ] **Step 3: Commit (no file change needed — this is a verification-only task)**

If all tests pass, create a verification commit:
```bash
git commit --allow-empty -m "test(advisor): verify end-to-end dismiss flow suppresses hint"
```

---

### Task 15: Final AC verification pass

**Acceptance Criteria:**
- [ ] All 11 ACs from issue #236 return PASS when Step 1 script runs
- [ ] All JS test suites pass: `node hooks/scripts/advisor-hint.test.js && node hooks/scripts/check-advisor.test.js` exits 0
- [ ] Baseline tests unchanged: `node hooks/scripts/version-check.test.js && node hooks/scripts/verdict-gate.test.js` exits 0 (no regressions)

- [ ] **Step 1: Run all 11 AC checks**

```bash
# AC-1
grep -F 'consider calling `advisor()` to sanity-check the blocker' skills/design-verification/SKILL.md && echo "AC-1: PASS"

# AC-2
grep -F 'call `advisor()` before manual interpretation' skills/verify-acceptance-criteria/SKILL.md && echo "AC-2: PASS"

# AC-3
grep -F 'consider calling `advisor()` first for a fast same-family check' skills/consult-codex/SKILL.md && echo "AC-3: PASS"

# AC-4
grep -F 'sanity-check the brief for missing context' skills/consult-codex/SKILL.md && echo "AC-4: PASS"

# AC-5
grep -c 'advisor' skills/settings/SKILL.md && node -e "const h = require('./skills/settings/scripts/advisor-headers.js'); console.log('AC-5 headers: PASS', h.SUPPORTED_ADVISOR_HEADERS)"

# AC-6
node -e "const h = require('./hooks/hooks.json'); const ss = h.hooks.SessionStart; const ok = ss.length === 1 && ss[0].hooks.length === 3 && ss[0].hooks[2].command.includes('advisor-hint.js'); console.log('AC-6 hooks.json:', ok ? 'PASS' : 'FAIL')"
ls hooks/scripts/advisor-hint.js && echo "AC-6 script: PASS"
grep -F 'shouldShowAdvisorHint' hooks/scripts/advisor-hint.js && echo "AC-6 function: PASS"

# AC-7
grep -l 'What it is' docs/advisor.md && grep -l 'How to enable' docs/advisor.md && grep -l 'worth it' docs/advisor.md && grep -l 'Relationship to codex' docs/advisor.md && echo "AC-7: PASS"

# AC-8
grep -F 'docs/advisor.md' README.md && echo "AC-8: PASS"

# AC-9
grep 'advisor' .feature-flow.yml && echo "AC-9 keys present: PASS"
# Confirm no non-commented advisor keys (both lines should be commented)
python3 -c "
import re, sys
content = open('.feature-flow.yml').read()
# Find uncommented advisor: lines
uncommented = [l for l in content.splitlines() if re.match(r'^advisor:', l.strip())]
print('AC-9 no live advisor key:', 'PASS' if not uncommented else 'FAIL: ' + str(uncommented))
"

# AC-10 (manual confirm)
echo "AC-10: Verify via Task 14 end-to-end test above"

# AC-11
grep -F '## Relationship to advisor tool' docs/plans/2026-04-14-codex-consultation.md && echo "AC-11: PASS"
```

Expected: all 11 checks output `PASS` or the expected value.

- [ ] **Step 2: Run all test suites**

```bash
node hooks/scripts/advisor-hint.test.js
node hooks/scripts/check-advisor.test.js
node hooks/scripts/version-check.test.js
node hooks/scripts/verdict-gate.test.js
```
Expected: all pass, 0 failures.

- [ ] **Step 3: Commit if any minor fixes were made during verification**

```bash
git add -p  # stage only verified fixes
git commit -m "fix(advisor): address issues found during final AC verification pass"
```

---

## AC-to-Task Lookup Table

| AC | Task | Grep command |
|----|------|--------------|
| AC-1 | Task 1 | `grep -F 'consider calling \`advisor()\` to sanity-check the blocker' skills/design-verification/SKILL.md` |
| AC-2 | Task 2 | `grep -F 'call \`advisor()\` before manual interpretation' skills/verify-acceptance-criteria/SKILL.md` |
| AC-3 | Task 3 | `grep -F 'consider calling \`advisor()\` first for a fast same-family check' skills/consult-codex/SKILL.md` |
| AC-4 | Task 4 | `grep -F 'sanity-check the brief for missing context' skills/consult-codex/SKILL.md` |
| AC-5 | Task 5 + Task 6 + Task 9 | `grep -c 'advisor' skills/settings/SKILL.md` ≥ 1; `advisor-headers.js` exists |
| AC-6 | Task 7 + Task 8 | `hooks/scripts/advisor-hint.js` exists with `shouldShowAdvisorHint`; `hooks.json` has third SessionStart command |
| AC-7 | Task 10 | 4 section headings present in `docs/advisor.md` |
| AC-8 | Task 11 | `grep -F 'docs/advisor.md' README.md` |
| AC-9 | Task 12 | Both commented keys present in `.feature-flow.yml`; no live `advisor:` YAML key |
| AC-10 | Task 14 | End-to-end: dismiss sets flag; next hook invocation produces no output |
| AC-11 | Task 13 | `grep -F '## Relationship to advisor tool' docs/plans/2026-04-14-codex-consultation.md` |
